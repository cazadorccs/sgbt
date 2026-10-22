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
          handleDeliveryApproved(statusRes);
          if (statusRes.all_completed) return;
        } else {
          STATE.deliveredStations = new Set();
          STATE._lastShownToast = null;
          // Si no ha retirado hoy, restaurar la vista para generación de QR
          const qrDisplayBox = document.getElementById('qrDisplayBox');
          const receiptBox = document.getElementById('workerDeliveryReceiptBox');
          if (receiptBox) receiptBox.style.display = 'none';
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

  // Generar QR firmado offline (o Enrolar + Generar en 1 Clic si no tiene passkey)
  btnGenerate?.addEventListener('click', async () => {
    if (!STATE.selectedWorkerId) return;

    btnGenerate.disabled = true;

    try {
      // 0. Si el trabajador NO tiene passkey enrolada aún, enrolar automáticamente en este mismo clic
      if (btnGenerate.dataset.needsEnroll === 'true') {
        btnGenerate.textContent = '🔐 1/2 Enrolando Passkey biométrica (FIDO2)...';
        
        // Desafío FIDO2
        await API.post('/api/v1/auth/passkey/register-challenge', { worker_id: STATE.selectedWorkerId });

        // Registro biométrico simulado o nativo
        const deviceName = navigator.userAgent.includes('iPhone') ? 'iPhone (Secure Enclave)' : 'Dispositivo Móvil (TEE / WebAuthn)';
        await API.post('/api/v1/auth/passkey/register-verify', {
          worker_id: STATE.selectedWorkerId,
          device_name: deviceName,
          credential: { credential_id: 'Cred_' + Date.now() }
        });

        // Actualizar estado reactivo sin recargar la página
        STATE.updateWorkerPasskeyStatus(STATE.selectedWorkerId, true, deviceName);
        btnGenerate.dataset.needsEnroll = 'false';
        
        const statusText = document.getElementById('workerPasskeyStatusText');
        const statusBox = document.getElementById('workerPasskeyStatusBox');
        if (statusText) statusText.textContent = `Enrolada en ${deviceName} (Activa)`;
        if (statusBox) statusBox.className = 'alert-box alert-info';
      }

      btnGenerate.textContent = '⏳ 2/2 Firmando criptográficamente (ECDSA P-256)...';

      // 1. Obtener derecho de hoy
      const pack = await API.get('/api/v1/sync/daily-pack');
      const currentWorker = pack.active_workers.find(w => w.worker_id === STATE.selectedWorkerId);
      
      const entitlementId = currentWorker && currentWorker.entitlements && currentWorker.entitlements.length > 0 
        ? currentWorker.entitlements[0].entitlement_id 
        : null;

      // 2. Firmar mediante enclave biométrico
      const signData = await API.post('/api/v1/auth/passkey/sign-offline', {
        worker_id: STATE.selectedWorkerId,
        entitlement_id: entitlementId
      });

      STATE.activeQrPayload = signData.qr_payload;

      // Sincronizar en localStorage y BroadcastChannel para pruebas multi-pestaña
      try {
        localStorage.setItem('sgbt_active_qr_payload', JSON.stringify(signData.qr_payload));
        localStorage.setItem('sgbt_active_qr_worker_name', (currentWorker && currentWorker.full_name) || 'Funcionario MIPPCI');
        localStorage.setItem('sgbt_active_qr_doc', (currentWorker && currentWorker.document_id) || '');
        localStorage.setItem('sgbt_active_qr_timestamp', Date.now().toString());

        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('sgbt_qr_channel');
          bc.postMessage({
            type: 'NEW_QR_GENERATED',
            payload: signData.qr_payload,
            worker_name: (currentWorker && currentWorker.full_name) || 'Funcionario MIPPCI',
            doc_id: (currentWorker && currentWorker.document_id) || ''
          });
          bc.close();
        }
      } catch (e) {
        console.warn('[QR SYNC ERROR]', e);
      }

      // Mostrar contenedor de QR y enfocar suavemente
      const qrContainer = document.getElementById('workerQrContainer');
      const qrDisplayBox = document.getElementById('qrDisplayBox');
      const receiptBox = document.getElementById('workerDeliveryReceiptBox');
      const helpText = document.getElementById('workerQrHelpText');

      if (qrContainer) {
        qrContainer.style.display = 'flex';
        qrContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (qrDisplayBox) qrDisplayBox.style.display = 'block';
      if (receiptBox) receiptBox.style.display = 'none';
      if (helpText) {
        helpText.textContent = 'Presente este código en el escáner del comedor. Funciona sin internet mediante criptografía asimétrica local.';
        helpText.style.color = '';
      }

      // Renderizar QR Code estándar RFC (Reed-Solomon real legible por cualquier cámara)
      if (window.QRCodeGenerator && typeof window.QRCodeGenerator.render === 'function') {
        window.QRCodeGenerator.render('qrCodeTarget', signData.qr_raw_string, { size: 260 });
      }
      
      const nonceEl = document.getElementById('qrNonceLabel');
      if (nonceEl) {
        nonceEl.textContent = `Nonce: ${signData.qr_payload.nonce.substring(0, 24)}... (ES256)`;
      }

      playAudioFeedback('success');
      window.showToast('¡Passkey activada y Código QR generado exitosamente en 1 Clic!', 'success');

      // Iniciar cuenta regresiva de 180 segundos (3 minutos)
      startQrCountdown(180);

      // Iniciar monitoreo reactivo de retiro aprobado
      startDeliveryMonitoring(signData.qr_payload);

      btnGenerate.textContent = '⚡ Generar Nuevo Código QR (Firma Biométrica)';

    } catch (err) {
      window.showToast('Error generando firma QR: ' + err.message, 'error');
      playAudioFeedback('error');
      btnGenerate.textContent = '⚡ Intentar Nuevamente';
    } finally {
      btnGenerate.disabled = false;
    }
  });

  // Monitoreo reactivo en tiempo real de la aprobación del despacho
  function startDeliveryMonitoring(qrPayload) {
    stopDeliveryMonitoring();

    const checkStatus = async () => {
      try {
        const wid = qrPayload.wid || STATE.selectedWorkerId;
        const nonce = qrPayload.nonce;
        const res = await API.get(`/api/v1/auth/delivery-status?worker_id=${encodeURIComponent(wid)}&nonce=${encodeURIComponent(nonce)}`);
        if (res && res.delivered) {
          handleDeliveryApproved(res);
        }
      } catch (e) {}
    };

    // 1. Sondeo periódico ultrarrápido (cada 1200ms)
    STATE.deliveryMonitorInterval = setInterval(checkStatus, 1200);

    // 2. Canal BroadcastChannel para actualización 0ms multi-pestaña
    if ('BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('sgbt_qr_channel');
        bc.onmessage = (e) => {
          if (e.data && e.data.type === 'DELIVERY_APPROVED') {
            const wid = qrPayload.wid || STATE.selectedWorkerId;
            if (e.data.worker_id === wid || (e.data.nonce && e.data.nonce === qrPayload.nonce)) {
              handleDeliveryApproved(e.data);
            }
          }
        };
        STATE._beneficiaryBc = bc;
      } catch (err) {}
    }

    // 3. Storage event listener (multi-pestaña complementario)
    const onStorage = (e) => {
      if (e.key === 'sgbt_last_delivery_event' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const wid = qrPayload.wid || STATE.selectedWorkerId;
          if (data.worker_id === wid || (data.nonce && data.nonce === qrPayload.nonce)) {
            handleDeliveryApproved(data);
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

    // Determinar mensaje Toast específico requerido por el usuario
    let targetToastMsg = data.latest_toast || data.toast_message || delivery.toast_message;
    if (!targetToastMsg) {
      if (isStation2Event || (station2Done && !station1Done)) {
        targetToastMsg = '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.';
      } else {
        targetToastMsg = '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.';
      }
    }

    // 1. Mostrar Toast en Pantalla y feedback háptico/sonoro (sin repetir el mismo toast en bucle)
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

    // 3. Actualizar caja de comprobante
    const qrDisplayBox = document.getElementById('qrDisplayBox');
    const receiptBox = document.getElementById('workerDeliveryReceiptBox');
    const helpText = document.getElementById('workerQrHelpText');

    if (receiptBox) {
      receiptBox.style.display = 'block';

      const nameEl = document.getElementById('receiptWorkerName');
      const docEl = document.getElementById('receiptWorkerDoc');
      const locEl = document.getElementById('receiptLocation');
      const timeEl = document.getElementById('receiptTimestamp');
      const idEl = document.getElementById('receiptDeliveryId');
      const methodEl = document.getElementById('receiptMethod');

      if (nameEl) nameEl.textContent = delivery.worker_name || 'Funcionario MIPPCI';
      if (docEl) docEl.textContent = delivery.document_id || 'V-18456123';
      if (locEl) locEl.textContent = delivery.distribution_point || (isStation2Event ? 'Estación 2: Cavas Frías' : 'Estación 1: Almacén Sótano 1');
      
      const dateObj = delivery.delivered_at ? new Date(delivery.delivered_at) : new Date();
      if (timeEl) timeEl.textContent = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const shortId = delivery.delivery_id ? delivery.delivery_id.substring(0, 8).toUpperCase() : 'OK-' + Date.now().toString().slice(-6);
      if (idEl) idEl.textContent = `#DEL-${shortId}`;
      
      if (methodEl) {
        if (delivery.verification_method === 'supervisor_override') {
          methodEl.textContent = 'Huella Supervisor (Contingencia)';
        } else if (delivery.verification_method === 'delegated_proxy_qr') {
          methodEl.textContent = 'QR Delegado Supervisor';
        } else {
          methodEl.textContent = 'Firma Hardware FIDO2 (ES256)';
        }
      }

      // Pastillas de estatus por estación dentro del comprobante
      const pill1 = document.getElementById('receiptPillStation1');
      const s1 = document.getElementById('receiptPillStation1Status');
      if (pill1 && s1) {
        if (station1Done) {
          pill1.style.borderColor = '#34d399';
          pill1.style.background = 'rgba(16, 185, 129, 0.2)';
          s1.innerHTML = '✅ Retirado en Estación 1 (Almacén)';
          s1.style.color = '#34d399';
        } else {
          pill1.style.borderColor = '#e2e8f0';
          pill1.style.background = 'rgba(255, 255, 255, 0.05)';
          s1.innerHTML = '⏳ Pendiente por retirar en Estación 1';
          s1.style.color = '#fbbf24';
        }
      }

      const pill2 = document.getElementById('receiptPillStation2');
      const s2 = document.getElementById('receiptPillStation2Status');
      if (pill2 && s2) {
        if (station2Done) {
          pill2.style.borderColor = '#34d399';
          pill2.style.background = 'rgba(16, 185, 129, 0.2)';
          s2.innerHTML = '✅ Retirado en Estación 2 (Cavas Frías)';
          s2.style.color = '#34d399';
        } else {
          pill2.style.borderColor = '#e2e8f0';
          pill2.style.background = 'rgba(255, 255, 255, 0.05)';
          s2.innerHTML = '⏳ Pendiente por retirar en Estación 2';
          s2.style.color = '#fbbf24';
        }
      }
    }

    // 4. Actualizar estado y visibilidad de QR según progreso
    const statusText = document.getElementById('workerPasskeyStatusText');
    const statusBox = document.getElementById('workerPasskeyStatusBox');

    if (allDone) {
      stopDeliveryMonitoring();
      if (STATE.qrTimerInterval) {
        clearInterval(STATE.qrTimerInterval);
        STATE.qrTimerInterval = null;
      }
      if (qrDisplayBox) qrDisplayBox.style.display = 'none';

      if (helpText) {
        helpText.innerHTML = '<strong>🎉 ¡Jornada Completa!</strong> Ha retirado su Bolsa de Víveres Secos (Estación 1) y su Combo Proteico Fresco (Estación 2).';
        helpText.style.color = '#34d399';
      }

      if (statusBox) statusBox.className = 'alert-box alert-success';
      if (statusText) {
        statusText.innerHTML = '<strong>✅ Despacho Total Autorizado:</strong> Sus 2 bultos han sido entregados con éxito en el Almacén Sótano 1.';
      }

      if (btnGenerate) {
        btnGenerate.disabled = true;
        btnGenerate.style.background = 'linear-gradient(135deg, #059669, #047857)';
        btnGenerate.style.borderColor = '#34d399';
        btnGenerate.innerHTML = '<span>✅ Retiro Completo Aprobado (2/2 Bultos)</span>';
      }

      receiptBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } else if (station1Done && !station2Done) {
      // Estación 1 lista, Estación 2 pendiente: mantener QR activo
      if (qrDisplayBox) qrDisplayBox.style.display = 'block';

      if (helpText) {
        helpText.innerHTML = '<strong>📦 Estación 1 Lista:</strong> Bulto de Víveres entregado. Diríjase a la <strong>Estación 2 (Cavas Frías)</strong> y presente este mismo código QR para su 🍗 Combo Proteico Fresco.';
        helpText.style.color = '#38bdf8';
      }

      if (statusBox) statusBox.className = 'alert-box alert-info';
      if (statusText) {
        statusText.innerHTML = '<strong>Paso 1 de 2 completado:</strong> Víveres Secos retirados. Siguiente paso: Pase a la <strong>Estación 2 (Cavas Frías)</strong>.';
      }

      if (btnGenerate) {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<span>🍗 Siguiente Paso: Retirar en Estación 2</span>';
      }

    } else if (station2Done && !station1Done) {
      // Estación 2 lista, Estación 1 pendiente
      if (qrDisplayBox) qrDisplayBox.style.display = 'block';

      if (helpText) {
        helpText.innerHTML = '<strong>🍗 Estación 2 Lista:</strong> Combo Proteico entregado. Diríjase a la <strong>Estación 1 (Almacén)</strong> y presente este mismo código QR para su 📦 Bulto Víveres Secos.';
        helpText.style.color = '#38bdf8';
      }

      if (statusBox) statusBox.className = 'alert-box alert-info';
      if (statusText) {
        statusText.innerHTML = '<strong>Paso 1 de 2 completado:</strong> Proteínas retiradas. Siguiente paso: Pase a la <strong>Estación 1 (Víveres)</strong>.';
      }

      if (btnGenerate) {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<span>📦 Siguiente Paso: Retirar en Estación 1</span>';
      }
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
