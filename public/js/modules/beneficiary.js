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
      const fragment = document.createDocumentFragment();
      data.workers.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        const typeTag = w.worker_type === 'jubilado' ? '👴 Jubilado' : w.worker_type === 'contratado' ? '📋 Contratado' : '🏢 Activo';
        opt.textContent = `${w.full_name} (${w.document_id}) - [${typeTag}] - ${w.auth_label}`;
        fragment.appendChild(opt);
      });
      workerSelect.appendChild(fragment);

      if (STATE.currentUser && STATE.currentUser.id) {
        STATE.selectedWorkerId = STATE.currentUser.id;
        if (workerSelect) workerSelect.value = STATE.currentUser.id;
      } else if (currentSelected && data.workers.some(w => w.id === currentSelected)) {
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
    if (!STATE.selectedWorkerId && STATE.currentUser) {
      STATE.selectedWorkerId = STATE.currentUser.id;
    }
    if (!STATE.selectedWorkerId) return;

    // Actualización visual inmediata de identidad con el usuario autenticado
    const headerIdEl = document.getElementById('workerHeaderIdentity');
    if (headerIdEl && STATE.currentUser && STATE.currentUser.id === STATE.selectedWorkerId) {
      headerIdEl.textContent = `${STATE.currentUser.full_name} (${STATE.currentUser.document_id})`;
    }

    try {
      const data = await API.get(`/api/v1/admin/workers/${STATE.selectedWorkerId}/security-dossier`);
      const { worker, passkeys } = data;

      // Actualizar nombre y cédula en la barra superior móvil del beneficiario
      if (headerIdEl) {
        headerIdEl.textContent = `${worker.full_name} (${worker.document_id})`;
      }

      const headerAvatarEl = document.getElementById('workerHeaderAvatar');
      if (headerAvatarEl) {
        if (worker.avatar_url && String(worker.avatar_url).startsWith('data:image')) {
          headerAvatarEl.innerHTML = `<img src="${worker.avatar_url}" alt="${worker.full_name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
        } else {
          const parts = (worker.full_name || 'U').trim().split(/\s+/);
          const ini = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
          headerAvatarEl.textContent = ini;
        }
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
        } else if (worker.role === 'admin' || worker.role === 'director') {
          condBadgeEl.className = 'badge badge-activo';
          condBadgeEl.innerHTML = '🏛️ Personal Directivo';
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
            helpText.textContent = 'Presente este código en la taquilla de entrega. Funciona incluso sin internet.';
            helpText.style.color = '';
          }
        }
      } catch (e) {}

      // Verificar si tiene passkey activa
      const activePasskey = passkeys.find(p => p.status === 'active');
      const statusText = document.getElementById('workerPasskeyStatusText');
      const statusBox = document.getElementById('workerPasskeyStatusBox');

      // Visualización del Candado Estricto de Dispositivo
      const deviceLockBadge = document.getElementById('deviceLockBadgeContainer');
      const deviceLockKeyLabel = document.getElementById('deviceLockKeyLabel');
      const deviceLockText = document.getElementById('deviceLockText');

      let savedLock = null;
      try {
        savedLock = JSON.parse(sessionStorage.getItem('sgbt_device_lock'));
      } catch (e) {}

      if (deviceLockBadge) {
        if (savedLock && savedLock.claim_key) {
          deviceLockBadge.style.display = 'block';
          if (deviceLockKeyLabel) deviceLockKeyLabel.textContent = savedLock.claim_key;
          if (deviceLockText) {
            deviceLockText.textContent = `Amarre exclusivo a este smartphone (${savedLock.claim_key}). Prohibido préstamo de teléfono hasta culminar la entrega.`;
          }
        } else {
          deviceLockBadge.style.display = 'none';
        }
      }

      if (activePasskey) {
        if (statusText) statusText.textContent = `Activo en ${activePasskey.device_name}`;
        if (statusBox) statusBox.className = 'alert-box alert-info';
        if (btnGenerate) {
          btnGenerate.disabled = false;
          btnGenerate.dataset.needsEnroll = 'false';
          btnGenerate.textContent = '⚡ Generar mi Código QR de Entrega';
          btnGenerate.style.background = '';
          btnGenerate.style.borderColor = '';
        }
      } else {
        if (STATE.supervisor_qr_mode) {
          if (statusText) statusText.textContent = worker.worker_type === 'jubilado' 
            ? 'Adulto Mayor: Puede retirar directamente en la mesa de despacho con su Cédula.' 
            : 'Sin teléfono activo. Acérquese a la mesa de despacho con su Cédula de Identidad.';
          if (statusBox) statusBox.className = 'alert-box alert-info';
          if (btnGenerate) {
            btnGenerate.disabled = false;
            btnGenerate.dataset.needsEnroll = 'true';
            btnGenerate.textContent = '⚡ Activar y Generar mi Código QR';
            btnGenerate.style.background = '';
            btnGenerate.style.borderColor = '';
          }
        } else {
          if (statusText) statusText.textContent = worker.worker_type === 'jubilado' 
            ? 'Adulto Mayor: Puede generar su código QR o retirar con su Cédula en mesa de despacho.' 
            : 'Sin validación activa en este teléfono. Presione el botón para activar y generar su QR.';
          if (statusBox) statusBox.className = 'alert-box alert-warning';
          if (btnGenerate) {
            btnGenerate.disabled = false;
            btnGenerate.dataset.needsEnroll = 'true';
            btnGenerate.textContent = '⚡ Activar y Generar mi Código QR';
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
      STATE.activeStation = 'all';
      generateWorkerStationQr('all');
    }
  });

  // Transmitir Llave Criptográfica por Proximidad NFC (Tap-to-Claim / P2P)
  const btnTransmitNfc = document.getElementById('btnTransmitNfc');
  const nfcTransmitStatus = document.getElementById('nfcTransmitStatus');

  btnTransmitNfc?.addEventListener('click', async () => {
    if (!STATE.selectedWorkerId) return;

    // Asegurar que exista un payload firmado con clave biométrica
    if (!STATE.activeQrPayload) {
      if (STATE.deliveredStations && STATE.deliveredStations.has(1) && !STATE.deliveredStations.has(2)) {
        await generateWorkerStationQr('2');
      } else {
        await generateWorkerStationQr('1');
      }
    }

    if (!STATE.activeQrPayload) {
      window.showToast('No se pudo generar la llave criptográfica.', 'error');
      return;
    }

    const nfcPayload = {
      ...STATE.activeQrPayload,
      transport: 'nfc',
      device_nfc_timestamp: Date.now()
    };

    if (nfcTransmitStatus) {
      nfcTransmitStatus.style.display = 'block';
      nfcTransmitStatus.innerHTML = '<span class="spinner" style="display: inline-block; width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></span> 📡 <strong>Antena NFC Activa</strong> &middot; Acerque su teléfono a la mesa de despacho...';
    }

    // Web NFC API Nativa (Hardware NDEF en dispositivos compatibles)
    if ('NDEFReader' in window) {
      try {
        const ndef = new NDEFReader();
        await ndef.write({
          records: [{
            recordType: "text",
            data: JSON.stringify(nfcPayload)
          }]
        });
        console.log('[NFC P2P] Payload firmado transmitido vía NDEF.');
      } catch (err) {
        console.info('[NFC Hardware Info]', err.message);
      }
    }

    // Canal de Proximidad BroadcastChannel y LocalStorage para comunicación P2P inmediata
    try {
      localStorage.setItem('sgbt_active_nfc_payload', JSON.stringify(nfcPayload));
      localStorage.setItem('sgbt_active_nfc_time', Date.now().toString());

      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('sgbt_nfc_channel');
        bc.postMessage({
          type: 'NFC_TAP_TRANSMIT',
          payload: nfcPayload,
          worker_id: STATE.selectedWorkerId,
          timestamp: Date.now()
        });
        bc.close();
      }
    } catch (e) {
      console.warn('[NFC BROADCAST ERROR]', e);
    }

    if (navigator.vibrate) navigator.vibrate([100, 60, 100]);
    if (typeof playAudioFeedback === 'function') playAudioFeedback('info');
    window.showToast('📡 Antena NFC Activa. Acerque su dispositivo al despachador para validar la llave criptográfica.', 'info');

    setTimeout(() => {
      if (nfcTransmitStatus && nfcTransmitStatus.style.display !== 'none') {
        nfcTransmitStatus.innerHTML = '✅ Llave criptográfica transmitida por NFC. Esperando confirmación de mesa...';
      }
    }, 4000);
  });

  async function generateWorkerStationQr(targetStation = 'all') {
    if (!STATE.selectedWorkerId) return;

    STATE.activeStation = targetStation;
    if (btnGenerate) btnGenerate.disabled = true;

    try {
      // 0. Si el trabajador NO tiene passkey enrolada aún, enrolar automáticamente con biometría nativa
      if (btnGenerate && btnGenerate.dataset.needsEnroll === 'true') {
        btnGenerate.textContent = '🔐 1/2 Configurando sensor biométrico...';
        
        let deviceLabel = 'Smartphone Móvil';
        if (typeof window.registerPlatformBiometrics === 'function') {
          const res = await window.registerPlatformBiometrics({
            workerId: STATE.selectedWorkerId
          });
          deviceLabel = res.deviceTypeLabel;
        } else {
          await API.post('/api/v1/auth/passkey/register-challenge', { worker_id: STATE.selectedWorkerId });
          const isIos = /iPhone|iPad/i.test(navigator.userAgent);
          deviceLabel = isIos ? 'iPhone (Face ID)' : 'Android (Huella)';
          await API.post('/api/v1/auth/passkey/register-verify', {
            worker_id: STATE.selectedWorkerId,
            device_name: deviceLabel,
            credential: { credential_id: 'Cred_' + Date.now() }
          });
        }

        STATE.updateWorkerPasskeyStatus(STATE.selectedWorkerId, true, deviceLabel);
        btnGenerate.dataset.needsEnroll = 'false';
        
        const statusText = document.getElementById('workerPasskeyStatusText');
        const statusBox = document.getElementById('workerPasskeyStatusBox');
        if (statusText) statusText.textContent = `Activo en ${deviceLabel}`;
        if (statusBox) statusBox.className = 'alert-box alert-info';
      }

      if (btnGenerate) {
        if (targetStation === 'all') {
          btnGenerate.textContent = '⏳ Generando QR de Retiro Totalizado (Todos los Combos)...';
        } else if (targetStation === '2') {
          btnGenerate.textContent = '⏳ 2/2 Generando QR Estación 2: Combo Proteico...';
        } else {
          btnGenerate.textContent = '⏳ 2/2 Generando QR Estación 1: Víveres Secos...';
        }
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
        } else if (targetStation === '1') {
          const ent1 = currentWorker.entitlements.find(e => 
            e.shift === 'estacion_1' || 
            (e.combo_name && e.combo_name.toLowerCase().includes('víveres'))
          );
          entitlementId = ent1 ? ent1.entitlement_id : currentWorker.entitlements[0].entitlement_id;
        } else {
          // targetStation === 'all' (Retiro Único Totalizado)
          entitlementId = currentWorker.entitlements[0].entitlement_id;
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
        if (targetStation === 'all') {
          banner.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(2, 132, 199, 0.22))';
          banner.style.borderColor = 'rgba(52, 211, 153, 0.5)';
          title.textContent = '🌟 RETIRO ÚNICO TOTALIZADO (VÍVERES + PROTEÍNA + ESPECIALES)';
          title.style.color = '#34d399';
          badgePill.className = 'badge badge-proteina';
          badgePill.textContent = '1 Solo Escaneo';
        } else if (targetStation === '2') {
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
        if (targetStation === 'all') {
          helpText.innerHTML = 'Presente este código único en la taquilla de almacén. Liquidará y despachará <strong>todos sus combos asignados</strong> (Víveres Secos + Proteína + Combos Especiales) en un único escaneo.';
          helpText.style.color = '#34d399';
        } else if (targetStation === '2') {
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
        nonceEl.textContent = 'Código de seguridad activo';
      }

      playAudioFeedback('success');
      window.showToast(targetStation === 'all'
        ? '¡Código QR de Retiro Único Totalizado activo!'
        : (targetStation === '2' ? '¡Código QR para Estación 2 (Combo Proteico) activo!' : '¡Código QR para Estación 1 (Víveres Secos) activo!'),
        'success');

      // Iniciar cuenta regresiva de 180 segundos
      startQrCountdown(180);

      // Iniciar escucha reactiva en tiempo real por SSE y sondeo de respaldo
      startDeliveryMonitoring(signData.qr_payload);

      if (btnGenerate) {
        if (targetStation === 'all') {
          btnGenerate.textContent = '🌟 Re-generar QR de Retiro Totalizado';
        } else if (targetStation === '2') {
          btnGenerate.textContent = '🍗 Re-generar QR Estación 2 (Combo Proteico)';
        } else {
          btnGenerate.textContent = '📦 Re-generar QR Estación 1 (Víveres Secos)';
        }
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

    if (data.station_1_delivered || isStation1Event || data.delivery_type === 'atomic_total_claim') {
      STATE.deliveredStations.add(1);
    }
    if (data.station_2_delivered || isStation2Event || data.delivery_type === 'atomic_total_claim') {
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
    const allDone = Boolean(data.all_completed || data.delivery_type === 'atomic_total_claim' || (station1Done && station2Done));

    // Determinar mensaje Toast exacto requerido por el usuario
    let targetToastMsg = data.latest_toast || data.toast_message || delivery.toast_message;
    if (!targetToastMsg) {
      if (data.delivery_type === 'atomic_total_claim') {
        targetToastMsg = '🎉 ¡RETIRO ÚNICO TOTALIZADO APROBADO! Todos sus combos han sido despachados.';
      } else if (isStation2Event || (station2Done && STATE.activeStation === '2')) {
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
      if (station1Done || data.delivery_type === 'atomic_total_claim') {
        badgeViveres.className = 'package-card-badge';
        badgeViveres.style.background = '#047857';
        badgeViveres.style.color = '#ffffff';
        badgeViveres.innerHTML = '✅ Retirado en Retiro Total';
      } else {
        badgeViveres.className = 'package-card-badge badge-viveres';
        badgeViveres.style.background = '#0284c7';
        badgeViveres.style.color = '#ffffff';
        badgeViveres.innerHTML = '⏳ Pendiente Estación 1';
      }
    }

    const badgeProteico = document.getElementById('badgeComboProteico');
    if (badgeProteico) {
      if (station2Done || data.delivery_type === 'atomic_total_claim') {
        badgeProteico.className = 'package-card-badge';
        badgeProteico.style.background = '#047857';
        badgeProteico.style.color = '#ffffff';
        badgeProteico.innerHTML = '✅ Retirado en Retiro Total';
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
      // AMBAS ESTACIONES O RETIRO TOTALIZADO COMPLETADO: FINALIZACIÓN TOTAL INSTANTÁNEA
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
        if (data.delivery_type === 'atomic_total_claim' || (data.combos_delivered && data.combos_delivered.length > 1)) {
          helpText.innerHTML = '<strong>🎉 ¡Retiro Único Totalizado Completado!</strong> Se han despachado todos sus combos asignados en un solo escaneo. Su teléfono móvil fue liberado exitosamente.';
        } else {
          helpText.innerHTML = '<strong>🎉 ¡Jornada Completa!</strong> Ha retirado su Bolsa de Víveres Secos (Estación 1) y su Combo Proteico Fresco (Estación 2).';
        }
        helpText.style.color = '#34d399';
      }

      if (statusBox) statusBox.className = 'alert-box alert-success';
      if (statusText) {
        statusText.innerHTML = '<strong>✅ Despacho Total Autorizado:</strong> Todos sus combos asignados han sido entregados con éxito en 1 solo escaneo en Almacén Sótano 1.';
      }

      // Actualizar insignia de candado de dispositivo liberado
      const deviceLockBadge = document.getElementById('deviceLockBadgeContainer');
      const deviceLockText = document.getElementById('deviceLockText');
      if (deviceLockBadge && deviceLockText) {
        deviceLockText.textContent = '🔓 Candado de dispositivo liberado automáticamente tras completar el retiro totalizado.';
        deviceLockBadge.style.display = 'block';
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
      if (locEl) locEl.textContent = 'Almacén Central MIPPCI - Sótano 1 (Despacho Total)';
      
      let dateVal = delivery.delivered_at;
      if (typeof dateVal === 'string' && !dateVal.endsWith('Z') && !dateVal.includes('+')) {
        dateVal = dateVal.replace(' ', 'T') + 'Z';
      }
      const dateObj = dateVal ? new Date(dateVal) : new Date();
      if (timeEl) {
        timeEl.textContent = dateObj.toLocaleTimeString('es-VE', { 
          timeZone: 'America/Caracas', 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit', 
          hour12: true 
        });
      }
      
      const shortId = delivery.delivery_id ? delivery.delivery_id.substring(0, 8).toUpperCase() : 'OK-' + Date.now().toString().slice(-6);
      if (idEl) idEl.textContent = `#DEL-${shortId}`;
      if (methodEl) {
        if (delivery.delivery_type === 'atomic_total_claim') {
          methodEl.textContent = '⚡ Retiro Único Totalizado (1 Escaneo QR)';
        } else if (delivery.verification_method === 'passkey_nfc') {
          methodEl.textContent = 'Validación Segura por Proximidad NFC';
        } else if (delivery.verification_method === 'delegated_proxy_qr') {
          methodEl.textContent = 'Validación por Retiro Delegado';
        } else if (delivery.verification_method && delivery.verification_method.includes('manual')) {
          methodEl.textContent = 'Validación Manual en Mesa';
        } else {
          methodEl.textContent = 'Validación Segura con Celular (FIDO2)';
        }
      }

      const pill1 = document.getElementById('receiptPillStation1');
      const s1 = document.getElementById('receiptPillStation1Status');
      if (pill1 && s1) {
        pill1.style.borderColor = '#34d399';
        pill1.style.background = 'rgba(16, 185, 129, 0.2)';
        s1.innerHTML = '✅ Retirado en Retiro Total (Víveres)';
        s1.style.color = '#34d399';
      }

      const pill2 = document.getElementById('receiptPillStation2');
      const s2 = document.getElementById('receiptPillStation2Status');
      if (pill2 && s2) {
        pill2.style.borderColor = '#34d399';
        pill2.style.background = 'rgba(16, 185, 129, 0.2)';
        s2.innerHTML = '✅ Retirado en Retiro Total (Proteína)';
        s2.style.color = '#34d399';
      }

      if (btnGenerate) {
        btnGenerate.disabled = true;
        btnGenerate.style.background = 'linear-gradient(135deg, #059669, #047857)';
        btnGenerate.style.borderColor = '#34d399';
        btnGenerate.innerHTML = '<span>✅ Retiro Totalizado Finalizado (Todos los Bultos Entregados)</span>';
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
    btnEnroll.textContent = '🔐 Configurando acceso seguro...';

    try {
      let deviceName = 'Smartphone Corporativo';
      if (typeof window.registerPlatformBiometrics === 'function') {
        const bioRes = await window.registerPlatformBiometrics({
          workerId: STATE.selectedWorkerId,
          statusCallback: (msg) => {
            btnEnroll.textContent = msg;
          }
        });
        deviceName = bioRes.deviceTypeLabel;
      } else {
        // Fallback directo
        await API.post('/api/v1/auth/passkey/register-challenge', { worker_id: STATE.selectedWorkerId });
        deviceName = /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone (Face ID)' : 'Android (Huella)';
        await API.post('/api/v1/auth/passkey/register-verify', {
          worker_id: STATE.selectedWorkerId,
          device_name: deviceName,
          credential: { credential_id: 'Cred_' + Date.now() }
        });
      }

      // 3. ACTUALIZACIÓN REACTIVA INMEDIATA EN MEMORIA Y ESTADO (0 retardo)
      STATE.updateWorkerPasskeyStatus(STATE.selectedWorkerId, true, deviceName);

      // 4. Refrescar la tarjeta y el selector del simulador de inmediato
      await updateWorkerCard();
      await loadWorkerSelect(true);

      // 5. Notificación no bloqueante y sonido institucional
      playAudioFeedback('success');
      window.showToast('🎉 ¡Acceso seguro activado con éxito!\nYa puede generar sus códigos de retiro.', 'success');

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

  // Manejador del Comprobante Digital Consolidado (Modal Fase 3: Retiro Único Totalizado)
  const openConsolidatedModal = () => {
    const modal = document.getElementById('consolidatedReceiptModalBackdrop');
    if (!modal) return;

    const workerName = document.getElementById('receiptWorkerName')?.textContent || (STATE.currentUser ? STATE.currentUser.full_name : 'Carlos Mendoza');
    const workerDoc = document.getElementById('receiptWorkerDoc')?.textContent || (STATE.currentUser ? STATE.currentUser.document_id : 'V-18456123');
    const timestamp = document.getElementById('receiptTimestamp')?.textContent || new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    const txId = document.getElementById('receiptDeliveryId')?.textContent || '#TX-ATOMIC-' + Date.now().toString().slice(-6);

    const nameEl = document.getElementById('modalConsolidatedWorkerName');
    const docEl = document.getElementById('modalConsolidatedWorkerDoc');
    const timeEl = document.getElementById('modalConsolidatedTimestamp');
    const txEl = document.getElementById('modalConsolidatedTxId');
    const combosListEl = document.getElementById('modalConsolidatedCombosList');
    const grossWeightEl = document.getElementById('modalConsolidatedGrossWeight');
    const countEl = document.getElementById('modalConsolidatedCombosCount');

    if (nameEl) nameEl.textContent = workerName;
    if (docEl) docEl.textContent = workerDoc;
    if (timeEl) timeEl.textContent = `${new Date().toLocaleDateString('es-VE')} · ${timestamp}`;
    if (txEl) txEl.textContent = txId;

    const combos = [
      { name: 'Bolsa de Víveres Secos (Canasta Básica)', icon: '🌾', mesa: 'Mesa 1', weight: 14.5, desc: 'Harina, arroz, pasta, aceite, azúcar, granos, sardinas' },
      { name: 'Combo Proteico Fresco (Cadena de Frío)', icon: '🍗', mesa: 'Mesa 2', weight: 14.0, desc: 'Pollo entero refrigerado, carne molida, mortadela' }
    ];

    if (combosListEl) {
      combosListEl.innerHTML = combos.map(c => `
        <div style="background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 6px; padding: 0.5rem 0.65rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; color: #f1f5f9; font-size: 0.78rem;">
              <span>${c.icon}</span> <strong>${c.name}</strong>
              <span class="badge" style="font-size: 0.62rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; margin-left: 0.35rem; padding: 0.1rem 0.4rem;">${c.mesa}</span>
            </div>
            <div style="font-size: 0.68rem; color: #94a3b8; margin-top: 0.15rem;">${c.desc}</div>
          </div>
          <div style="text-align: right; min-width: 65px;">
            <span style="font-weight: 800; color: #34d399; font-size: 0.75rem;">${c.weight} kg</span>
            <div style="font-size: 0.62rem; color: #34d399;">✅ Entregado</div>
          </div>
        </div>
      `).join('');
    }

    if (countEl) countEl.textContent = `${combos.length} Combos Liquidados`;
    if (grossWeightEl) grossWeightEl.textContent = `~28.5 kg`;

    modal.classList.add('active');
  };

  document.getElementById('btnOpenConsolidatedReceiptModal')?.addEventListener('click', openConsolidatedModal);
  document.getElementById('btnCloseConsolidatedReceiptModal')?.addEventListener('click', () => {
    document.getElementById('consolidatedReceiptModalBackdrop')?.classList.remove('active');
  });
  document.getElementById('btnCloseConsolidatedReceiptModalBtn')?.addEventListener('click', () => {
    document.getElementById('consolidatedReceiptModalBackdrop')?.classList.remove('active');
  });
  document.getElementById('btnPrintConsolidatedReceipt')?.addEventListener('click', () => {
    window.print();
  });

  // Carga inicial
  loadWorkerSelect();
};
