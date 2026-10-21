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
      if (qrContainer) {
        qrContainer.style.display = 'flex';
        qrContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

      btnGenerate.textContent = '⚡ Generar Nuevo Código QR (Firma Biométrica)';

    } catch (err) {
      window.showToast('Error generando firma QR: ' + err.message, 'error');
      playAudioFeedback('error');
      btnGenerate.textContent = '⚡ Intentar Nuevamente';
    } finally {
      btnGenerate.disabled = false;
    }
  });

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
