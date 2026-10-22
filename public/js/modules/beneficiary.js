// ============================================================================
// MODULE: BENEFICIARY PORTAL & FIDO2 PASSKEY (OFFLINE SIGNING & QR)
// ============================================================================

window.setupWorkerSimulator = function() {
  const workerSelect = document.getElementById('workerSimulatorSelect');
  const btnGenerate = document.getElementById('btnGenerateQr');
  const btnEnroll = document.getElementById('btnEnrollPasskey');
  const btnBrightness = document.getElementById('btnToggleBrightness');

  // Llenar selector con trabajadores activos
  async function loadWorkerSelect(preserveSelected = true) {
    if (!workerSelect) return;
    try {
      const data = await API.get('/api/v1/admin/workers?status=active');
      const currentSelected = preserveSelected ? (STATE.selectedWorkerId || workerSelect.value) : null;
      workerSelect.innerHTML = '';

      data.workers.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        const typeTag = w.worker_type === 'jubilado' ? '👴 Jubilado' : w.worker_type === 'contratado' ? '📋 Contratado' : '🏢 Activo';
        opt.textContent = `${w.full_name} (${w.document_id}) - [${typeTag}] - ${w.auth_label}`;
        workerSelect.appendChild(opt);
      });

      if (currentSelected && data.workers.some(w => w.id === currentSelected)) {
        workerSelect.value = currentSelected;
        STATE.selectedWorkerId = currentSelected;
      } else if (data.workers.length > 0) {
        STATE.selectedWorkerId = data.workers[0].id;
        workerSelect.value = data.workers[0].id;
      }

      await updateWorkerCard();
    } catch (err) {
      console.warn('Error cargando lista de trabajadores:', err);
    }
  }

  window.loadWorkerSelect = loadWorkerSelect;
  window.updateWorkerCard = updateWorkerCard;

  workerSelect?.addEventListener('change', () => {
    stopDeliveryMonitoring();
    STATE.selectedWorkerId = workerSelect.value;
    updateWorkerCard();
  });

  async function updateWorkerCard() {
    if (!STATE.selectedWorkerId) return;

    try {
      const data = await API.get(`/api/v1/admin/workers/${STATE.selectedWorkerId}/security-dossier`);
      const { worker, passkeys } = data;

      // Actualizar nombre y cédula en la barra superior móvil del beneficiario
      const headerIdEl = document.getElementById('workerHeaderIdentity');
      if (headerIdEl) {
        headerIdEl.textContent = `${worker.full_name} (${worker.document_id})`;
      }

      // Sincronizar selector si existe
      if (workerSelect && workerSelect.value !== worker.id) {
        workerSelect.value = worker.id;
      }

      // Actualizar insignia de condición laboral
      const condBadgeEl = document.getElementById('workerConditionBadge');
      if (condBadgeEl) {
        if (worker.worker_type === 'jubilado') {
          condBadgeEl.className = 'badge badge-jubilado';
          condBadgeEl.innerHTML = '👴 Personal Jubilado';
        } else if (worker.worker_type === 'contratado') {
          condBadgeEl.className = 'badge badge-contratado';
          condBadgeEl.innerHTML = '📋 Personal Contratado';
        } else {
          condBadgeEl.className = 'badge badge-activo';
          condBadgeEl.innerHTML = '🏢 Funcionario Activo';
        }
      }

      // Verificar si el trabajador ya retiró sus combos hoy
      try {
        const statusRes = await API.get(`/api/v1/auth/delivery-status?worker_id=${STATE.selectedWorkerId}`);
        if (statusRes && statusRes.delivered) {
          const qrContainer = document.getElementById('workerQrContainer');
          if (qrContainer) qrContainer.style.display = 'flex';
          STATE.activeStation = (statusRes.station_1_delivered && !statusRes.station_2_delivered) ? '1' : null;
          handleDeliveryApproved(statusRes);
          if (statusRes.all_completed) {
            return;
          } else {
            // Mantener canal de escucha SSE abierto para el siguiente combo
            startDeliveryMonitoring({ wid: STATE.selectedWorkerId });
          }
        } else {
          STATE.activeStation = '1';
          STATE.deliveredStations = new Set();
          STATE._lastShownToast = null;
          // Si no ha retirado hoy, restaurar la vista para generación de QR
          const qrDisplayBox = document.getElementById('qrDisplayBox');
          const transitionCard = document.getElementById('stationTransitionCard');
          const receiptBox = document.getElementById('workerDeliveryReceiptBox');
          if (receiptBox) receiptBox.style.display = 'none';
          if (transitionCard) transitionCard.style.display = 'none';
          if (qrDisplayBox) qrDisplayBox.style.display = 'block';

          const b1 = document.getElementById('badgeViveresSecos');
          if (b1) {
            b1.className = 'package-card-badge badge-viveres';
            b1.textContent = '12 Rubros';
            b1.style = '';
          }
          const b2 = document.getElementById('badgeComboProteico');
          if (b2) {
            b2.className = 'package-card-badge badge-proteina';
            b2.textContent = 'Cadena de Frío';
            b2.style = '';
          }

          const helpText = document.getElementById('workerQrHelpText');
          if (helpText) {
            helpText.textContent = 'Presente este código en el escáner del comedor. Funciona sin internet mediante criptografía asimétrica local.';
            helpText.style.color = '';
          }
        }
      } catch (e) {}

      // Verificar si tiene passkey activa
      const activePasskey = passkeys.find(p => p.status === 'active');
      const statusText = document.getElementById('workerPasskeyStatusText');
      const statusBox = document.getElementById('workerPasskeyStatusBox');

      if (activePasskey) {
        if (statusText) statusText.textContent = `Enrolada en ${activePasskey.device_name} (Sign count: ${activePasskey.sign_count})`;
        if (statusBox) statusBox.className = 'alert-box alert-info';
        if (btnGenerate) {
          btnGenerate.disabled = false;
          btnGenerate.dataset.needsEnroll = 'false';
          btnGenerate.textContent = '⚡ Generar QR de Entrega (Firma Biométrica)';
          btnGenerate.style.background = '';
          btnGenerate.style.borderColor = '';
        }
      } else {
        if (STATE.supervisor_qr_mode) {
          if (statusText) statusText.textContent = worker.worker_type === 'jubilado' 
            ? 'Adulto Mayor / Sin Smartphone: Despacho autorizado en mesa mediante Código QR Diario del Supervisor.' 
            : 'Sin Passkey activa. Acérquese a la mesa de despacho para autorización con el QR Diario del Supervisor.';
          if (statusBox) statusBox.className = 'alert-box alert-info';
          if (btnGenerate) {
            btnGenerate.disabled = false;
            btnGenerate.dataset.needsEnroll = 'true';
            btnGenerate.textContent = '⚡ Enrolar Passkey y Generar mi QR (1 Clic)';
            btnGenerate.style.background = '';
            btnGenerate.style.borderColor = '';
          }
        } else {
          if (statusText) statusText.textContent = worker.worker_type === 'jubilado' 
            ? 'Adulto Mayor en contingencia: Puede enrolar Passkey en 1 clic o retirar con Tarjeta NFC.' 
            : 'Sin Passkey activa en este equipo. Presione el botón para enrolar y generar su QR en 1 Clic.';
          if (statusBox) statusBox.className = 'alert-box alert-warning';
          if (btnGenerate) {
            btnGenerate.disabled = false;
            btnGenerate.dataset.needsEnroll = 'true';
            btnGenerate.textContent = '⚡ Enrolar Passkey y Generar mi QR (1 Clic)';
            btnGenerate.style.background = '';
            btnGenerate.style.borderColor = '';
          }
        }
      }
    } catch (err) {
      console.warn('Error al actualizar tarjeta de beneficiario:', err);
    }
  }

  // Manejador del botón de transición para autorizar y desplegar el 2do QR (Estación 2)
  document.getElementById('btnProceedToStation2')?.addEventListener('click', () => {
    playAudioFeedback('success');
    STATE.activeStation = '2';
    generateWorkerStationQr('2');
  });

  // Generar QR firmado offline (o Enrolar + Generar en 1 Clic si no tiene passkey)
  btnGenerate?.addEventListener('click', async () => {
    if (!STATE.selectedWorkerId) return;
    if (STATE.deliveredStations && STATE.deliveredStations.has(1) && !STATE.deliveredStations.has(2)) {
      STATE.activeStation = '2';
      generateWorkerStationQr('2');
    } else {
      STATE.activeStation = '1';
      generateWorkerStationQr('1');
    }
  });

  async function generateWorkerStationQr(targetStation = '1') {
    if (!STATE.selectedWorkerId) return;

    STATE.activeStation = targetStation;
    if (btnGenerate) btnGenerate.disabled = true;

    try {
      // 0. Si el trabajador NO tiene passkey enrolada aún, enrolar automáticamente en este mismo clic
      if (btnGenerate && btnGenerate.dataset.needsEnroll === 'true') {
        btnGenerate.textContent = '🔐 1/2 Enrolando Passkey biométrica (FIDO2)...';
        
        await API.post('/api/v1/auth/passkey/register-challenge', { worker_id: STATE.selectedWorkerId });

        const deviceName = navigator.userAgent.includes('iPhone') ? 'iPhone (Secure Enclave)' : 'Dispositivo Móvil (TEE / WebAuthn)';
        await API.post('/api/v1/auth/passkey/register-verify', {
          worker_id: STATE.selectedWorkerId,
          device_name: deviceName,
          credential: { credential_id: 'Cred_' + Date.now() }
        });

        STATE.updateWorkerPasskeyStatus(STATE.selectedWorkerId, true, deviceName);
        btnGenerate.dataset.needsEnroll = 'false';
        
        const statusText = document.getElementById('workerPasskeyStatusText');
        const statusBox = document.getElementById('workerPasskeyStatusBox');
        if (statusText) statusText.textContent = `Enrolada en ${deviceName} (Activa)`;
        if (statusBox) statusBox.className = 'alert-box alert-info';
      }

      if (btnGenerate) {
        btnGenerate.textContent = targetStation === '2' 
          ? '⏳ 2/2 Firmando QR Estación 2: Combo Proteico (ECDSA P-256)...'
          : '⏳ 2/2 Firmando QR Estación 1: Víveres Secos (ECDSA P-256)...';
      }

      // 1. Obtener derecho de hoy correspondiente a la estación
      const pack = await API.get('/api/v1/sync/daily-pack');
      const currentWorker = pack.active_workers.find(w => w.worker_id === STATE.selectedWorkerId);
      
      let entitlementId = null;
      if (currentWorker && currentWorker.entitlements && currentWorker.entitlements.length > 0) {
        if (targetStation === '2') {
          const ent2 = currentWorker.entitlements.find(e => 
            e.shift === 'estacion_2' || 
            (e.combo_name && e.combo_name.toLowerCase().includes('prote'))
          );
          entitlementId = ent2 ? ent2.entitlement_id : (currentWorker.entitlements[1]?.entitlement_id || currentWorker.entitlements[0].entitlement_id);
        } else {
          const ent1 = currentWorker.entitlements.find(e => 
            e.shift === 'estacion_1' || 
            (e.combo_name && e.combo_name.toLowerCase().includes('víveres'))
          );
          entitlementId = ent1 ? ent1.entitlement_id : currentWorker.entitlements[0].entitlement_id;
        }
      }

      // 2. Firmar mediante enclave biométrico
      const signData = await API.post('/api/v1/auth/passkey/sign-offline', {
        worker_id: STATE.selectedWorkerId,
        entitlement_id: entitlementId,
        station: targetStation
      });

      STATE.activeQrPayload = signData.qr_payload;
      STATE.activeStation = targetStation;

      // Sincronizar en localStorage y BroadcastChannel para pruebas multi-pestaña
      try {
        localStorage.setItem('sgbt_active_qr_payload', JSON.stringify(signData.qr_payload));
        localStorage.setItem('sgbt_active_qr_worker_name', (currentWorker && currentWorker.full_name) || 'Funcionario MIPPCI');
        localStorage.setItem('sgbt_active_qr_doc', (currentWorker && currentWorker.document_id) || '');
        localStorage.setItem('sgbt_active_qr_timestamp', Date.now().toString());
        localStorage.setItem('sgbt_active_station', targetStation);

        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('sgbt_qr_channel');
          bc.postMessage({
            type: 'NEW_QR_GENERATED',
            payload: signData.qr_payload,
            worker_name: (currentWorker && currentWorker.full_name) || 'Funcionario MIPPCI',
            doc_id: (currentWorker && currentWorker.document_id) || '',
            station: targetStation
          });
          bc.close();
        }
      } catch (e) {
        console.warn('[QR SYNC ERROR]', e);
      }

      // 3. Actualizar elementos visuales del banner de estación y cajas
      const qrContainer = document.getElementById('workerQrContainer');
      const qrDisplayBox = document.getElementById('qrDisplayBox');
      const transitionCard = document.getElementById('stationTransitionCard');
      const receiptBox = document.getElementById('workerDeliveryReceiptBox');
      const helpText = document.getElementById('workerQrHelpText');
      const banner = document.getElementById('qrStationBanner');
      const title = document.getElementById('qrStationTitle');
      const badgePill = document.getElementById('qrStationBadgePill');

      if (qrContainer) qrContainer.style.display = 'flex';
      if (qrDisplayBox) qrDisplayBox.style.display = 'block';
      if (transitionCard) transitionCard.style.display = 'none';
      if (receiptBox) receiptBox.style.display = 'none';

      if (banner && title && badgePill) {
        banner.style.display = 'flex';
        if (targetStation === '2') {
          banner.style.background = 'rgba(5, 150, 105, 0.2)';
          banner.style.borderColor = 'rgba(5, 150, 105, 0.45)';
          title.textContent = '🍗 PASO 2 DE 2: ESTACIÓN 2 (CADENA DE FRÍO - PROTEÍNAS)';
          title.style.color = '#34d399';
          badgePill.className = 'badge badge-proteina';
          badgePill.textContent = 'Estación 2: Cavas';
        } else {
          banner.style.background = 'rgba(2, 132, 199, 0.18)';
          banner.style.borderColor = 'rgba(2, 132, 199, 0.4)';
          title.textContent = '📦 PASO 1 DE 2: ESTACIÓN 1 (VÍVERES SECOS)';
          title.style.color = '#38bdf8';
          badgePill.className = 'badge badge-viveres';
          badgePill.textContent = 'Estación 1: Almacén';
        }
      }

      if (helpText) {
        if (targetStation === '2') {
          helpText.innerHTML = 'Presente este código en la <strong>Estación 2 (Cavas Refrigeradas)</strong> para retirar su 🍗 Combo Proteico Fresco.';
          helpText.style.color = '#34d399';
        } else {
          helpText.innerHTML = 'Presente este código en la <strong>Estación 1 (Almacén)</strong> para retirar su 📦 Bolsa de Víveres Secos.';
          helpText.style.color = '#38bdf8';
        }
      }

      // Renderizar QR Code estándar
      if (window.QRCodeGenerator && typeof window.QRCodeGenerator.render === 'function') {
        window.QRCodeGenerator.render('qrCodeTarget', signData.qr_raw_string, { size: 260 });
      }
      
      const nonceEl = document.getElementById('qrNonceLabel');
      if (nonceEl) {
        nonceEl.textContent = `Nonce: ${signData.qr_payload.nonce.substring(0, 20)}... (ES256)`;
      }

      playAudioFeedback('success');
      window.showToast(targetStation === '2' ? '¡Código QR para Estación 2 (Combo Proteico) activo!' : '¡Código QR para Estación 1 (Víveres Secos) activo!', 'success');

      // Iniciar cuenta regresiva de 180 segundos
      startQrCountdown(180);

      // Iniciar escucha reactiva en tiempo real por SSE y sondeo de respaldo
      startDeliveryMonitoring(signData.qr_payload);

      if (btnGenerate) {
        btnGenerate.textContent = targetStation === '2' 
          ? '🍗 Re-generar QR Estación 2 (Combo Proteico)'
          : '📦 Re-generar QR Estación 1 (Víveres Secos)';
      }

      qrContainer?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (err) {
      window.showToast('Error generando firma QR: ' + err.message, 'error');
      playAudioFeedback('error');
      if (btnGenerate) btnGenerate.textContent = '⚡ Intentar Nuevamente';
    } finally {
      if (btnGenerate) btnGenerate.disabled = false;
    }
  }

  // Monitoreo reactivo en tiempo real de la aprobación del despacho (SSE + WebSockets/Stream)
  function startDeliveryMonitoring(qrPayload) {
    stopDeliveryMonitoring();

    const wid = qrPayload?.wid || STATE.selectedWorkerId;
    if (!wid) return;

    // 1. CONEXIÓN EN TIEMPO REAL: SERVER-SENT EVENTS (SSE)
    // Permite replicación push instantánea (0ms) desde el servidor sin que el beneficiario recargue la pantalla (F5)
    try {
      if ('EventSource' in window) {
        const sseUrl = `/api/v1/auth/delivery-stream?worker_id=${encodeURIComponent(wid)}`;
        const sse = new EventSource(sseUrl);

        sse.addEventListener('delivery_update', (e) => {
          try {
            const data = JSON.parse(e.data);
            console.log('[SSE EVENT] Notificación de entrega en tiempo real recibida:', data);
            const isStation2 = (data.station === 2) || (data.delivery && data.delivery.station === 2) || data.station_2_delivered || data.all_completed;
            if (STATE.activeStation === '2') {
              if (isStation2) {
                handleDeliveryApproved(data);
              }
            } else {
              handleDeliveryApproved(data);
            }
          } catch (err) {
            console.warn('[SSE PARSE ERROR]', err);
          }
        });

        sse.onerror = (err) => {
          console.debug('[SSE RECONNECTING]', err);
        };

        STATE._beneficiarySse = sse;
      }
    } catch (sseErr) {
      console.warn('[SSE INIT ERROR]', sseErr);
    }

    // 2. Sondeo periódico de respaldo ultra-rápido (cada 1000ms)
    const checkStatus = async () => {
      try {
        const res = await API.get(`/api/v1/auth/delivery-status?worker_id=${encodeURIComponent(wid)}`);
        if (res && res.delivered) {
          if (STATE.activeStation === '2') {
            if (res.station_2_delivered || res.all_completed) {
              handleDeliveryApproved(res);
            }
          } else {
            handleDeliveryApproved(res);
          }
        }
      } catch (e) {}
    };
    STATE.deliveryMonitorInterval = setInterval(checkStatus, 1000);

    // 3. Canal BroadcastChannel para actualización multi-pestaña local en el mismo navegador
    if ('BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('sgbt_qr_channel');
        bc.onmessage = (e) => {
          if (e.data && e.data.type === 'DELIVERY_APPROVED') {
            if (e.data.worker_id === wid) {
              const isStation2 = (e.data.station === 2) || (e.data.delivery && e.data.delivery.station === 2) || e.data.station_2_delivered || e.data.all_completed;
              if (STATE.activeStation === '2') {
                if (isStation2) {
                  handleDeliveryApproved(e.data);
                }
              } else {
                handleDeliveryApproved(e.data);
              }
            }
          }
        };
        STATE._beneficiaryBc = bc;
      } catch (err) {}
    }

    // 4. Storage event listener (multi-pestaña complementario)
    const onStorage = (e) => {
      if (e.key === 'sgbt_last_delivery_event' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.worker_id === wid) {
            const isStation2 = (data.station === 2) || (data.delivery && data.delivery.station === 2) || data.station_2_delivered || data.all_completed;
            if (STATE.activeStation === '2') {
              if (isStation2) {
                handleDeliveryApproved(data);
              }
            } else {
              handleDeliveryApproved(data);
            }
          }
        } catch (err) {}
      }
    };
    window.addEventListener('storage', onStorage);
    STATE._beneficiaryStorageHandler = onStorage;
  }

  function stopDeliveryMonitoring() {
    if (STATE.deliveryMonitorInterval) {
      clearInterval(STATE.deliveryMonitorInterval);
      STATE.deliveryMonitorInterval = null;
    }
    if (STATE._beneficiarySse) {
      try { STATE._beneficiarySse.close(); } catch (e) {}
      STATE._beneficiarySse = null;
    }
    if (STATE._beneficiaryBc) {
      try { STATE._beneficiaryBc.close(); } catch (e) {}
      STATE._beneficiaryBc = null;
    }
    if (STATE._beneficiaryStorageHandler) {
      window.removeEventListener('storage', STATE._beneficiaryStorageHandler);
      STATE._beneficiaryStorageHandler = null;
    }
  }

  function handleDeliveryApproved(data) {
    if (!data) return;

    const delivery = data.delivery || data;
    const isStation1Event = (data.station === 1) || (delivery.station === 1) || 
      (delivery.combo_category === 'bolsa_viveres') || 
      (delivery.combo_name && delivery.combo_name.toLowerCase().includes('víveres'));
    const isStation2Event = (data.station === 2) || (delivery.station === 2) || 
      (data.latest_station === 2) ||
      (delivery.combo_category === 'proteico' || delivery.combo_category === 'combo_proteico') || 
      (delivery.combo_name && delivery.combo_name.toLowerCase().includes('prote'));

    if (!STATE.deliveredStations) {
      STATE.deliveredStations = new Set();
    }

    if (data.station_1_delivered || isStation1Event) {
      STATE.deliveredStations.add(1);
    }
    if (data.station_2_delivered || isStation2Event) {
      STATE.deliveredStations.add(2);
    }
    if (data.deliveries && Array.isArray(data.deliveries)) {
      data.deliveries.forEach(d => {
        if (d.station === 1) STATE.deliveredStations.add(1);
        if (d.station === 2) STATE.deliveredStations.add(2);
      });
    }

    const station1Done = STATE.deliveredStations.has(1);
    const station2Done = STATE.deliveredStations.has(2);
    const allDone = Boolean(data.all_completed || (station1Done && station2Done));

    // Determinar mensaje Toast exacto requerido por el usuario
    let targetToastMsg = data.latest_toast || data.toast_message || delivery.toast_message;
    if (!targetToastMsg) {
      if (isStation2Event || (station2Done && STATE.activeStation === '2')) {
        targetToastMsg = '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.';
      } else {
        targetToastMsg = '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.';
      }
    }

    // 1. Mostrar Toast en Pantalla + feedback sonoro y háptico (sin duplicar el mismo toast)
    if (targetToastMsg && STATE._lastShownToast !== targetToastMsg) {
      STATE._lastShownToast = targetToastMsg;
      window.showToast(targetToastMsg, 'success');
      playAudioFeedback('success');
      if (navigator.vibrate) {
        navigator.vibrate([120, 80, 150, 80, 300]);
      }
    }

    // 2. Actualizar insignias de bultos individualmente
    const badgeViveres = document.getElementById('badgeViveresSecos');
    if (badgeViveres) {
      if (station1Done) {
        badgeViveres.className = 'package-card-badge';
        badgeViveres.style.background = '#047857';
        badgeViveres.style.color = '#ffffff';
        badgeViveres.innerHTML = '✅ Retirado en Estación 1';
      } else {
        badgeViveres.className = 'package-card-badge badge-viveres';
        badgeViveres.style.background = '#0284c7';
        badgeViveres.style.color = '#ffffff';
        badgeViveres.innerHTML = '⏳ Pendiente Estación 1';
      }
    }

    const badgeProteico = document.getElementById('badgeComboProteico');
    if (badgeProteico) {
      if (station2Done) {
        badgeProteico.className = 'package-card-badge';
        badgeProteico.style.background = '#047857';
        badgeProteico.style.color = '#ffffff';
        badgeProteico.innerHTML = '✅ Retirado en Estación 2';
      } else {
        badgeProteico.className = 'package-card-badge badge-proteina';
        badgeProteico.style.background = '#059669';
        badgeProteico.style.color = '#ffffff';
        badgeProteico.innerHTML = '⏳ Pendiente Estación 2';
      }
    }

    // 3. Referencias a las cajas de la UI
    const qrDisplayBox = document.getElementById('qrDisplayBox');
    const transitionCard = document.getElementById('stationTransitionCard');
    const receiptBox = document.getElementById('workerDeliveryReceiptBox');
    const helpText = document.getElementById('workerQrHelpText');
    const banner = document.getElementById('qrStationBanner');
    const statusText = document.getElementById('workerPasskeyStatusText');
    const statusBox = document.getElementById('workerPasskeyStatusBox');

    // 4. LÓGICA DE TRANSICIÓN Y FINALIZACIÓN INSTANTÁNEA (0 RECARGAS / 0 F5)
    if (allDone) {
      // AMBAS ESTACIONES COMPLETADAS (2/2): FINALIZACIÓN TOTAL INSTANTÁNEA
      STATE.activeStation = null;
      stopDeliveryMonitoring();
      if (STATE.qrTimerInterval) {
        clearInterval(STATE.qrTimerInterval);
        STATE.qrTimerInterval = null;
      }

      if (qrDisplayBox) qrDisplayBox.style.display = 'none';
      if (transitionCard) transitionCard.style.display = 'none';
      if (banner) banner.style.display = 'none';
      if (receiptBox) receiptBox.style.display = 'block';

      if (helpText) {
        helpText.innerHTML = '<strong>🎉 ¡Jornada Completa!</strong> Ha retirado su Bolsa de Víveres Secos (Estación 1) y su Combo Proteico Fresco (Estación 2).';
        helpText.style.color = '#34d399';
      }

      if (statusBox) statusBox.className = 'alert-box alert-success';
      if (statusText) {
        statusText.innerHTML = '<strong>✅ Despacho Total Autorizado:</strong> Sus 2 bultos han sido entregados con éxito en el Almacén Sótano 1.';
      }

      // Actualizar datos del comprobante final
      const nameEl = document.getElementById('receiptWorkerName');
      const docEl = document.getElementById('receiptWorkerDoc');
      const locEl = document.getElementById('receiptLocation');
      const timeEl = document.getElementById('receiptTimestamp');
      const idEl = document.getElementById('receiptDeliveryId');
      const methodEl = document.getElementById('receiptMethod');

      if (nameEl) nameEl.textContent = delivery.worker_name || 'Funcionario MIPPCI';
      if (docEl) docEl.textContent = delivery.document_id || 'V-18456123';
      if (locEl) locEl.textContent = 'Almacén Central MIPPCI - Sótano 1';
      
      const dateObj = delivery.delivered_at ? new Date(delivery.delivered_at) : new Date();
      if (timeEl) timeEl.textContent = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const shortId = delivery.delivery_id ? delivery.delivery_id.substring(0, 8).toUpperCase() : 'OK-' + Date.now().toString().slice(-6);
      if (idEl) idEl.textContent = `#DEL-${shortId}`;
      if (methodEl) methodEl.textContent = 'Firma Hardware FIDO2 (ES256)';

      const pill1 = document.getElementById('receiptPillStation1');
      const s1 = document.getElementById('receiptPillStation1Status');
      if (pill1 && s1) {
        pill1.style.borderColor = '#34d399';
        pill1.style.background = 'rgba(16, 185, 129, 0.2)';
        s1.innerHTML = '✅ Retirado en Estación 1 (Almacén)';
        s1.style.color = '#34d399';
      }

      const pill2 = document.getElementById('receiptPillStation2');
      const s2 = document.getElementById('receiptPillStation2Status');
      if (pill2 && s2) {
        pill2.style.borderColor = '#34d399';
        pill2.style.background = 'rgba(16, 185, 129, 0.2)';
        s2.innerHTML = '✅ Retirado en Estación 2 (Cavas Frías)';
        s2.style.color = '#34d399';
      }

      if (btnGenerate) {
        btnGenerate.disabled = true;
        btnGenerate.style.background = 'linear-gradient(135deg, #059669, #047857)';
        btnGenerate.style.borderColor = '#34d399';
        btnGenerate.innerHTML = '<span>✅ Entrega Finalizada (2/2 Bultos Entregados)</span>';
      }

      receiptBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } else if (station1Done && !station2Done) {
      // Si el usuario ya autorizó y está visualizando activamente el QR de la Estación 2:
      // NO ocultar el QR, NO mostrar la tarjeta de transición y NO reiniciar el temporizador de expiración.
      if (STATE.activeStation === '2') {
        if (qrDisplayBox) qrDisplayBox.style.display = 'block';
        if (receiptBox) receiptBox.style.display = 'none';
        if (transitionCard) transitionCard.style.display = 'none';
        return;
      }

      // PASO 1 COMPLETADO: OCULTAR QR 1 Y MOSTRAR TARJETA CON BOTÓN PARA GENERAR QR 2
      if (STATE.qrTimerInterval) {
        clearInterval(STATE.qrTimerInterval);
        STATE.qrTimerInterval = null;
      }

      if (qrDisplayBox) qrDisplayBox.style.display = 'none';
      if (receiptBox) receiptBox.style.display = 'none';
      if (transitionCard) transitionCard.style.display = 'block';

      if (helpText) {
        helpText.innerHTML = '<strong>📦 Bulto de Víveres entregado en Estación 1.</strong> Presione el botón verde arriba para autorizar y habilitar su 2do código QR para la Estación 2 (Combo Proteico).';
        helpText.style.color = '#34d399';
      }

      if (statusBox) statusBox.className = 'alert-box alert-info';
      if (statusText) {
        statusText.innerHTML = '<strong>Paso 1 de 2 Completado:</strong> Víveres Secos retirados. <strong>Siguiente paso:</strong> Aprobar y pasar a Estación 2 (Cavas).';
      }

      if (btnGenerate) {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<span>🍗 Pasar a Estación 2: Combo Proteico ➔</span>';
      }

      transitionCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Temporizador de 180 segundos con barra visual
  function startQrCountdown(seconds) {
    if (STATE.qrTimerInterval) clearInterval(STATE.qrTimerInterval);

    let remaining = seconds;
    const fill = document.getElementById('qrCountdownFill');
    const label = document.getElementById('qrTimerLabel');

    if (fill) fill.style.width = '100%';
    if (label) label.textContent = `Expira en: ${remaining}s`;

    STATE.qrTimerInterval = setInterval(() => {
      remaining--;
      const pct = (remaining / seconds) * 100;
      if (fill) fill.style.width = `${pct}%`;
      if (label) label.textContent = `Expira en: ${remaining}s`;

      if (remaining <= 0) {
        clearInterval(STATE.qrTimerInterval);
        if (label) label.textContent = '❌ Código QR expirado (Vigencia 180s)';
        if (fill) {
          fill.style.width = '0%';
          fill.style.background = '#f43f5e';
        }
        STATE.activeQrPayload = null;
        try {
          localStorage.removeItem('sgbt_active_qr_payload');
        } catch (e) {}
      }
    }, 1000);
  }

  // Enrolar Passkey (FIDO2) de forma 100% reactiva (0ms delay, sin F5)
  btnEnroll?.addEventListener('click', async () => {
    if (!STATE.selectedWorkerId) return;

    const originalEnrollText = btnEnroll.textContent;
    btnEnroll.disabled = true;
    btnEnroll.textContent = '🔐 Comunicando con enclave seguro (TEE / WebAuthn)...';

    try {
      // 1. Obtener desafío FIDO2
      const options = await API.post('/api/v1/auth/passkey/register-challenge', { worker_id: STATE.selectedWorkerId });

      // 2. Simular o invocar autenticación biométrica nativa
      const deviceName = navigator.userAgent.includes('iPhone') ? 'iPhone 15 Pro (Secure Enclave)' : 'Pixel 8 (Titan M2 TEE)';
      
      const verifyData = await API.post('/api/v1/auth/passkey/register-verify', {
        worker_id: STATE.selectedWorkerId,
        device_name: deviceName,
        credential: { credential_id: 'Cred_' + Date.now() }
      });

      // 3. ACTUALIZACIÓN REACTIVA INMEDIATA EN MEMORIA Y ESTADO (0 retardo)
      STATE.updateWorkerPasskeyStatus(STATE.selectedWorkerId, true, deviceName);

      // 4. Refrescar la tarjeta y el selector del simulador de inmediato
      await updateWorkerCard();
      await loadWorkerSelect(true);

      // 5. Notificación no bloqueante y sonido institucional
      playAudioFeedback('success');
      window.showToast('🎉 ¡Passkey FIDO2 enrolada exitosamente!\nLlave pública registrada en el servidor central.', 'success');

      // 6. Refrescar portal administrativo en segundo plano sin bloquear la UI
      if (typeof refreshPortalData === 'function') {
        refreshPortalData().catch(() => {});
      }

    } catch (err) {
      window.showToast('Error enrolando Passkey: ' + err.message, 'error');
      playAudioFeedback('error');
    } finally {
      btnEnroll.disabled = false;
      btnEnroll.textContent = originalEnrollText;
    }
  });

  // Toggle de brillo al 100%
  let isMaxBrightness = false;
  btnBrightness?.addEventListener('click', () => {
    isMaxBrightness = !isMaxBrightness;
    const box = document.getElementById('qrDisplayBox');
    if (box) {
      if (isMaxBrightness) {
        box.classList.add('max-brightness');
        btnBrightness.textContent = '💡 Brillo Normal';
      } else {
        box.classList.remove('max-brightness');
        btnBrightness.textContent = '💡 Brillo 100%';
      }
    }
  });

  // Suscripción a eventos reactivos de cambio de trabajador o passkey
  STATE.on('worker:selected', () => {
    stopDeliveryMonitoring();
    updateWorkerCard();
  });

  STATE.on('passkey:enrolled', ({ workerId, hasPasskey, deviceName }) => {
    if (STATE.selectedWorkerId === workerId) {
      const statusText = document.getElementById('workerPasskeyStatusText');
      const statusBox = document.getElementById('workerPasskeyStatusBox');
      if (statusText) statusText.textContent = `Enrolada en ${deviceName} (Activa)`;
      if (statusBox) statusBox.className = 'alert-box alert-info';
      if (btnGenerate) {
        btnGenerate.disabled = false;
        btnGenerate.dataset.needsEnroll = 'false';
        btnGenerate.textContent = '⚡ Generar QR de Entrega (Firma Biométrica)';
      }
    }
  });

  // Carga inicial
  loadWorkerSelect();
};
