// ============================================================================
// MODULE: DISTRIBUTOR & SCANNER (DESPACHO, CÁMARA QR, NFC, OFFLINE ENGINE)
// ============================================================================

let liveCameraScanner = null;
let currentFacingMode = 'environment'; // 'environment' (cámara trasera/posterior por defecto) o 'user' (frontal)
let availableCameraDevices = [];
let selectedCameraDeviceId = null;
let pendingContingencyWorker = null;

window.toggleChecklistItem = function(cardEl) {
  if (!cardEl) return;
  cardEl.classList.toggle('checked');
};

window.setupDistributorSimulator = function() {
  document.getElementById('btnDownloadDailyPack')?.addEventListener('click', downloadDailyPack);
  document.getElementById('btnScanWorkerGeneratedQr')?.addEventListener('click', scanWorkerQr);
  document.getElementById('btnSimulateNfcTap')?.addEventListener('click', simulateNfcTap);
  document.getElementById('btnSimulateSupervisorDailyQr')?.addEventListener('click', simulateSupervisorDailyQrApproval);
  document.getElementById('btnDistributorShowSupervisorQr')?.addEventListener('click', loadAndShowSupervisorDailyQrModal);
  document.getElementById('btnSyncDeferredQueue')?.addEventListener('click', syncDeferredQueue);
  
  // Selector de Estaciones de Despacho (Estación 1: Víveres, Estación 2: Proteína, Unificado)
  setupStationTabs();

  // Controles de Cámara Real en Vivo
  document.getElementById('btnStartCameraScanner')?.addEventListener('click', startLiveCameraScanner);
  document.getElementById('btnStopCameraScanner')?.addEventListener('click', stopLiveCameraScanner);
  document.getElementById('btnFlipCameraLive')?.addEventListener('click', toggleCameraFacing);
  document.getElementById('btnFlipCameraStandby')?.addEventListener('click', toggleCameraFacing);
  document.getElementById('btnFlipCameraGlobal')?.addEventListener('click', toggleCameraFacing);

  // Botón para escanear QR detectado en tiempo real desde otra pestaña o dispositivo
  document.getElementById('btnQuickScanDetectedQr')?.addEventListener('click', () => {
    scanWorkerQr();
  });

  // Selector de cámara física
  const camSelect = document.getElementById('cameraDeviceSelect');
  camSelect?.addEventListener('change', async (e) => {
    selectedCameraDeviceId = e.target.value;
    const dev = availableCameraDevices.find(d => d.id === selectedCameraDeviceId);
    if (dev) {
      const lbl = (dev.label || '').toLowerCase();
      if (lbl.includes('front') || lbl.includes('user') || lbl.includes('delantera') || lbl.includes('selfie')) {
        currentFacingMode = 'user';
      } else {
        currentFacingMode = 'environment';
      }
    }
    if (liveCameraScanner && liveCameraScanner.isScanning) {
      await stopLiveCameraScanner();
      await startLiveCameraScanner();
    }
  });

  // Intenta listar cámaras en background si ya hay permisos
  refreshCameraDevicesList();

  // Carga alternativa de foto o captura de pantalla de QR
  const btnUpload = document.getElementById('btnUploadQrImage');
  const fileInput = document.getElementById('inputUploadQrImage');
  btnUpload?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', handleQrImageUpload);

  // Entrada manual o pegado de QR
  document.getElementById('btnPasteQrManual')?.addEventListener('click', handleManualQrPaste);

  document.getElementById('btnCloseFeedbackOverlay')?.addEventListener('click', () => {
    document.getElementById('distributorFeedbackOverlay').classList.remove('active');
  });

  // Módulo de Contingencia y Delegación
  document.getElementById('btnSearchContingencyWorker')?.addEventListener('click', searchContingencyWorker);
  document.getElementById('contingencyDocInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchContingencyWorker();
    }
  });
  document.getElementById('btnAuthorizeSupervisorOverride')?.addEventListener('click', executeSupervisorOverride);
  document.getElementById('btnOpenDelegationModalTrigger')?.addEventListener('click', () => {
    if (typeof window.openDelegationModal === 'function') {
      window.openDelegationModal();
    }
  });

  // Escuchar sincronización en tiempo real de QR generado por el beneficiario (Multi-pestaña)
  setupRealtimeQrSyncListener();
};

function setupStationTabs() {
  STATE.activeStation = STATE.activeStation || '1';
  const tab1 = document.getElementById('btnStationTab1');
  const tab2 = document.getElementById('btnStationTab2');
  const tabAll = document.getElementById('btnStationTabAll');
  const badge = document.getElementById('activeStationBadge');

  function updateStationUI(st) {
    STATE.activeStation = String(st);
    if (tab1) tab1.className = 'btn btn-outline' + (STATE.activeStation === '1' ? ' active-station-tab' : '');
    if (tab2) tab2.className = 'btn btn-outline' + (STATE.activeStation === '2' ? ' active-station-tab-proteina' : '');
    if (tabAll) tabAll.className = 'btn btn-outline' + (STATE.activeStation === 'all' ? ' active-station-tab-unificado' : '');

    if (badge) {
      if (STATE.activeStation === '1') {
        badge.className = 'badge badge-viveres';
        badge.style.background = '#0284c7';
        badge.style.color = '#fff';
        badge.textContent = '📦 Estación 1: Víveres';
      } else if (STATE.activeStation === '2') {
        badge.className = 'badge badge-proteina';
        badge.style.background = '#059669';
        badge.style.color = '#fff';
        badge.textContent = '🍗 Estación 2: Proteínas';
      } else {
        badge.className = 'badge badge-activo';
        badge.style.background = '#4f46e5';
        badge.style.color = '#fff';
        badge.textContent = '⚡ Despacho Unificado';
      }
    }
  }

  window.updateDistributorStationUI = updateStationUI;

  tab1?.addEventListener('click', () => updateStationUI('1'));
  tab2?.addEventListener('click', () => updateStationUI('2'));
  tabAll?.addEventListener('click', () => updateStationUI('all'));

  updateStationUI(STATE.activeStation || '1');
}

window.downloadDailyPack = downloadDailyPack;

function setupRealtimeQrSyncListener() {
  const showBanner = (workerName, docId, payload, station) => {
    const banner = document.getElementById('liveQrDetectedBanner');
    const info = document.getElementById('liveQrDetectedInfo');
    if (banner && info) {
      STATE.activeQrPayload = payload;
      const targetStation = station || (payload && payload.station) || '1';
      STATE.activeStation = targetStation;
      const isS2 = String(targetStation) === '2';
      const stationBadge = isS2 
        ? '<span class="badge badge-proteina" style="background:#059669; color:#fff; font-size:0.75rem; padding: 0.2rem 0.5rem;">🍗 Estación 2: Combo Proteico (Cadena de Frío)</span>' 
        : '<span class="badge badge-viveres" style="background:#0284c7; color:#fff; font-size:0.75rem; padding: 0.2rem 0.5rem;">📦 Estación 1: Bulto Víveres Secos</span>';

      info.innerHTML = `<strong>${workerName || 'Beneficiario'}</strong> &middot; Cédula: <strong>${docId || 'V-18456123'}</strong><br>${stationBadge} &middot; <small style="color: #6ee7b7;">Código QR válido listo para entregar.</small>`;
      banner.style.display = 'block';

      if (typeof window.updateDistributorStationUI === 'function') {
        window.updateDistributorStationUI(targetStation);
      }
      playAudioFeedback('success');
    }
  };

  if ('BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel('sgbt_qr_channel');
      bc.onmessage = (e) => {
        if (e.data && e.data.type === 'NEW_QR_GENERATED') {
          console.log('[DISTRIBUIDOR] QR recibido por canal BroadcastChannel:', e.data);
          showBanner(e.data.worker_name, e.data.doc_id, e.data.payload, e.data.station);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'sgbt_active_qr_payload' && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue);
        const name = localStorage.getItem('sgbt_active_qr_worker_name') || 'Carlos Mendoza';
        const doc = localStorage.getItem('sgbt_active_qr_doc') || 'V-18456123';
        const st = localStorage.getItem('sgbt_active_station') || (payload && payload.station) || '1';
        showBanner(name, doc, payload, st);
      } catch (err) {}
    }
  });

  try {
    const stored = localStorage.getItem('sgbt_active_qr_payload');
    const storedTime = localStorage.getItem('sgbt_active_qr_timestamp');
    if (stored && storedTime) {
      const elapsed = (Date.now() - parseInt(storedTime, 10)) / 1000;
      if (elapsed < 180) {
        const payload = JSON.parse(stored);
        const name = localStorage.getItem('sgbt_active_qr_worker_name') || 'Carlos Mendoza';
        const doc = localStorage.getItem('sgbt_active_qr_doc') || 'V-18456123';
        const st = localStorage.getItem('sgbt_active_station') || (payload && payload.station) || '1';
        showBanner(name, doc, payload, st);
      }
    }
  } catch (e) {}
}

function broadcastDeliveryApproval(deliveryResult, payload = {}) {
  try {
    const data = {
      type: 'DELIVERY_APPROVED',
      timestamp: Date.now(),
      worker_id: (deliveryResult.worker && deliveryResult.worker.id) || deliveryResult.worker_id || payload.wid,
      document_id: (deliveryResult.worker && deliveryResult.worker.document_id) || deliveryResult.document_id,
      entitlement_id: payload.ent,
      nonce: payload.nonce,
      station: deliveryResult.station || (STATE.activeStation === '2' ? 2 : 1),
      toast_message: deliveryResult.toast_message,
      delivery: deliveryResult
    };
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('sgbt_qr_channel');
      bc.postMessage(data);
      bc.close();
    }
    localStorage.setItem('sgbt_last_delivery_event', JSON.stringify(data));
  } catch (e) {
    console.warn('[DELIVERY BROADCAST ERROR]', e);
  }
}
window.broadcastDeliveryApproval = broadcastDeliveryApproval;

async function refreshCameraDevicesList() {
  if (typeof Html5Qrcode === 'undefined') return;
  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      availableCameraDevices = devices;
      const camSelect = document.getElementById('cameraDeviceSelect');
      const selectWrapper = document.getElementById('cameraSelectWrapper');
      if (camSelect) {
        camSelect.innerHTML = '';
        devices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.id;
          let label = dev.label || `Cámara ${idx + 1}`;
          opt.textContent = label;
          camSelect.appendChild(opt);
        });
        if (selectedCameraDeviceId) {
          camSelect.value = selectedCameraDeviceId;
        }
        if (selectWrapper) {
          selectWrapper.style.display = devices.length > 1 ? 'flex' : 'none';
        }
      }
    }
  } catch (e) {
    console.warn('[CAMERA] Enumeración pasiva de cámaras no permitida todavía:', e);
  }
}

async function toggleCameraFacing() {
  if (availableCameraDevices && availableCameraDevices.length > 1) {
    // Si tenemos una lista de múltiples cámaras físicas
    const currentId = selectedCameraDeviceId || (document.getElementById('cameraDeviceSelect')?.value);
    let nextIdx = 0;
    if (currentId) {
      const idx = availableCameraDevices.findIndex(d => d.id === currentId);
      if (idx !== -1) {
        nextIdx = (idx + 1) % availableCameraDevices.length;
      }
    } else {
      nextIdx = 1;
    }
    const nextDev = availableCameraDevices[nextIdx];
    selectedCameraDeviceId = nextDev.id;
    const camSelect = document.getElementById('cameraDeviceSelect');
    if (camSelect) camSelect.value = nextDev.id;

    const lbl = (nextDev.label || '').toLowerCase();
    if (lbl.includes('front') || lbl.includes('user') || lbl.includes('delantera') || lbl.includes('selfie')) {
      currentFacingMode = 'user';
    } else {
      currentFacingMode = 'environment';
    }
  } else {
    // Alternar facingMode entre posterior y frontal
    selectedCameraDeviceId = null;
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  }

  const isBack = currentFacingMode === 'environment';
  window.showToast(`Cámara cambiada: ${isBack ? '📷 Posterior / Trasera' : '🤳 Frontal'}`, 'info');

  const btnStart = document.getElementById('btnStartCameraScanner');
  if (btnStart) {
    btnStart.textContent = `📹 Iniciar Escáner (Cámara ${isBack ? 'Trasera' : 'Frontal'})`;
  }

  const badge = document.getElementById('cameraStatusBadge');
  if (badge && liveCameraScanner && liveCameraScanner.isScanning) {
    badge.textContent = `🟢 Cámara Activa (${isBack ? 'Trasera' : 'Frontal'})`;
  }

  if (liveCameraScanner && liveCameraScanner.isScanning) {
    await stopLiveCameraScanner();
    await startLiveCameraScanner();
  }
}
window.toggleCameraFacing = toggleCameraFacing;

async function startLiveCameraScanner() {
  const standbyBox = document.getElementById('cameraStandbyBox');
  const liveContainer = document.getElementById('liveCameraContainer');
  const badge = document.getElementById('cameraStatusBadge');
  const camSelect = document.getElementById('cameraDeviceSelect');

  if (typeof Html5Qrcode === 'undefined') {
    window.showToast('Biblioteca de cámara no cargada aún. Recargue la página.', 'warning');
    return;
  }

  try {
    if (liveCameraScanner && liveCameraScanner.isScanning) {
      await liveCameraScanner.stop();
      liveCameraScanner.clear();
      liveCameraScanner = null;
    }

    if (standbyBox) standbyBox.style.display = 'none';
    if (liveContainer) liveContainer.style.display = 'block';

    const isInitialBack = currentFacingMode === 'environment';
    if (badge) {
      badge.textContent = `🟢 Cámara Activa (${isInitialBack ? 'Trasera' : 'Frontal'})`;
      badge.className = 'badge badge-proteina';
    }

    liveCameraScanner = new Html5Qrcode("cameraQrReader");

    // Intentar enumerar dispositivos por si ya se tienen permisos previos
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        availableCameraDevices = devices;
        if (camSelect) {
          camSelect.innerHTML = '';
          devices.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.id;
            opt.textContent = dev.label || `Cámara ${idx + 1}`;
            camSelect.appendChild(opt);
          });
          const selectWrapper = document.getElementById('cameraSelectWrapper');
          if (selectWrapper) selectWrapper.style.display = devices.length > 1 ? 'flex' : 'none';

          // Si no hay cámara forzada por el usuario y se busca cámara trasera, identificarla
          if (!selectedCameraDeviceId && currentFacingMode === 'environment') {
            const backCam = devices.find(d => 
              (d.label || '').toLowerCase().includes('back') || 
              (d.label || '').toLowerCase().includes('trasera') || 
              (d.label || '').toLowerCase().includes('rear') || 
              (d.label || '').toLowerCase().includes('environment')
            );
            if (backCam) {
              selectedCameraDeviceId = backCam.id;
            }
          }
          if (selectedCameraDeviceId) {
            camSelect.value = selectedCameraDeviceId;
          }
        }
      }
    } catch (e) {
      console.warn('[CAMERA] Enumeración previa de dispositivos:', e);
    }

    // Configuración de la cámara a iniciar:
    // Si hay un selectedCameraDeviceId explícito, usarlo.
    // De lo contrario, usar { facingMode: currentFacingMode } ("environment" por defecto para posterior).
    let cameraParam;
    if (selectedCameraDeviceId) {
      cameraParam = selectedCameraDeviceId;
    } else {
      cameraParam = { facingMode: currentFacingMode };
    }

    const config = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
        return { width: Math.floor(edge), height: Math.floor(edge) };
      },
      aspectRatio: 1.0
    };

    let lastScannedRaw = '';
    let lastScannedTime = 0;
    let isScanCooldown = false;

    function showCameraScanHUD(isSuccess, title, subtitle) {
      const hud = document.getElementById('cameraScanHUD');
      const icon = document.getElementById('cameraScanHUDIcon');
      const t = document.getElementById('cameraScanHUDTitle');
      const s = document.getElementById('cameraScanHUDSub');

      if (!hud) return;

      hud.style.display = 'block';
      if (isSuccess) {
        hud.style.background = 'rgba(6, 78, 59, 0.94)';
        hud.style.border = '1.5px solid #10b981';
        hud.style.boxShadow = '0 6px 25px rgba(16, 185, 129, 0.5)';
        if (icon) icon.textContent = '✅';
      } else {
        hud.style.background = 'rgba(127, 29, 29, 0.94)';
        hud.style.border = '1.5px solid #ef4444';
        hud.style.boxShadow = '0 6px 25px rgba(239, 68, 68, 0.5)';
        if (icon) icon.textContent = '🛑';
      }

      if (t) t.textContent = title;
      if (s) s.innerHTML = subtitle;

      playAudioFeedback(isSuccess ? 'success' : 'error');

      clearTimeout(hud._timer);
      hud._timer = setTimeout(() => {
        hud.style.display = 'none';
      }, isSuccess ? 1300 : 1900);
    }

    const onScanSuccess = async (decodedText) => {
      const cleanText = decodedText.trim();
      if (isScanCooldown || (lastScannedRaw === cleanText && (Date.now() - lastScannedTime < 2800))) {
        return;
      }
      lastScannedRaw = cleanText;
      lastScannedTime = Date.now();
      isScanCooldown = true;

      try {
        let payload;
        if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
          payload = JSON.parse(cleanText);
        } else if (cleanText.startsWith('%7B') || cleanText.startsWith('%7b')) {
          payload = JSON.parse(decodeURIComponent(cleanText));
        } else {
          try {
            payload = JSON.parse(atob(cleanText));
          } catch (e) {
            payload = JSON.parse(cleanText);
          }
        }

        // Modo Ráfaga Continuo: Procesa el QR sin apagar la cámara
        await processQrPayload(payload, true /* isLiveCamera */);

      } catch (err) {
        console.error('[QR PARSE ERROR]', err, decodedText);
        showCameraScanHUD(false, 'FORMATO NO RECONOCIDO', 'El código escaneado no corresponde al protocolo SGBT.');
      } finally {
        setTimeout(() => {
          isScanCooldown = false;
        }, 1300);
      }
    };

    const onScanFailure = () => {};

    try {
      await liveCameraScanner.start(cameraParam, config, onScanSuccess, onScanFailure);
    } catch (startErr) {
      console.warn('[CAMERA] Falló inicio con cameraParam:', cameraParam, startErr);
      // Fallback 1: Intentar con facingMode directo
      try {
        await liveCameraScanner.start({ facingMode: currentFacingMode }, config, onScanSuccess, onScanFailure);
      } catch (fallbackErr) {
        // Fallback 2: Intentar con la cámara opuesta (por si el teléfono solo expone una lente o permisos limitados)
        const altMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        console.warn('[CAMERA] Intentando fallback con modo opuesto:', altMode, fallbackErr);
        await liveCameraScanner.start({ facingMode: altMode }, config, onScanSuccess, onScanFailure);
        currentFacingMode = altMode;
      }
    }

    if (badge) {
      const activeBack = currentFacingMode === 'environment';
      badge.textContent = `🟢 Cámara ${activeBack ? 'Trasera' : 'Frontal'}`;
      badge.className = 'badge badge-proteina';
    }

    // Refrescar lista de cámaras ahora con permisos otorgados
    refreshCameraDevicesList();

  } catch (err) {
    console.error('[CAMERA ERROR]', err);
    window.showToast('No se pudo acceder a la cámara: ' + (err.message || err), 'error');
    stopLiveCameraScanner();
  }
}

async function stopLiveCameraScanner() {
  const standbyBox = document.getElementById('cameraStandbyBox');
  const liveContainer = document.getElementById('liveCameraContainer');
  const badge = document.getElementById('cameraStatusBadge');

  if (liveCameraScanner) {
    try {
      if (liveCameraScanner.isScanning) {
        await liveCameraScanner.stop();
      }
      liveCameraScanner.clear();
    } catch (e) {
      console.warn('Error al detener cámara:', e);
    }
    liveCameraScanner = null;
  }

  if (standbyBox) standbyBox.style.display = 'block';
  if (liveContainer) liveContainer.style.display = 'none';
  if (badge) {
    badge.textContent = 'Cámara Lista';
    badge.className = 'badge badge-viveres';
  }
}
window.startLiveCameraScanner = startLiveCameraScanner;
window.stopLiveCameraScanner = stopLiveCameraScanner;

async function handleQrImageUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    const scanner = new Html5Qrcode("cameraQrReader");
    const decodedText = await scanner.scanFile(file, true);
    scanner.clear();

    playAudioFeedback('success');
    let payload;
    const cleanText = decodedText.trim();
    if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
      payload = JSON.parse(cleanText);
    } else {
      try {
        payload = JSON.parse(atob(cleanText));
      } catch (err) {
        payload = JSON.parse(cleanText);
      }
    }

    await processQrPayload(payload);

  } catch (err) {
    console.error('[FILE SCAN ERROR]', err);
    window.showToast('No se detectó un código QR válido en la imagen: ' + (err.message || err), 'error');
  } finally {
    e.target.value = '';
  }
}

async function handleManualQrPaste() {
  const rawInput = prompt('Pegue el contenido JSON o texto completo del código QR:');
  if (!rawInput || !rawInput.trim()) return;

  try {
    const clean = rawInput.trim();
    let payload;
    if (clean.startsWith('{') && clean.endsWith('}')) {
      payload = JSON.parse(clean);
    } else {
      payload = JSON.parse(atob(clean));
    }
    await processQrPayload(payload);
  } catch (err) {
    window.showToast('Error decodificando QR manual: ' + err.message, 'error');
  }
}

async function scanWorkerQr() {
  let payload = STATE.activeQrPayload;

  if (!payload) {
    try {
      const stored = localStorage.getItem('sgbt_active_qr_payload');
      if (stored) {
        payload = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Error leyendo payload almacenado:', e);
    }
  }

  if (!payload || (Math.floor(Date.now() / 1000) - (payload.ts || 0) > 180)) {
    try {
      const pack = await API.get('/api/v1/sync/daily-pack');
      const testWorker = (pack.active_workers && pack.active_workers.find(w => w.document_id === 'V-18456123')) || (pack.active_workers && pack.active_workers[0]);
      if (testWorker) {
        const activeSt = STATE.activeStation || '1';
        const isS2 = activeSt === '2';
        const ent = testWorker.entitlements && testWorker.entitlements.find(e => isS2 
          ? (e.shift === 'estacion_2' || (e.combo_name && e.combo_name.toLowerCase().includes('prote')))
          : (e.shift === 'estacion_1' || (e.combo_name && e.combo_name.toLowerCase().includes('víveres')))
        );
        const entId = ent ? ent.entitlement_id : (testWorker.entitlements && testWorker.entitlements[0]?.entitlement_id);
        const signData = await API.post('/api/v1/auth/passkey/sign-offline', {
          worker_id: testWorker.worker_id,
          entitlement_id: entId,
          station: activeSt
        });
        if (signData && signData.qr_payload) {
          payload = signData.qr_payload;
          STATE.activeQrPayload = payload;
          console.log('[DISTRIBUIDOR] Token criptográfico generado para:', testWorker.full_name);
        }
      }
    } catch (err) {
      console.warn('Auto-sign test worker fallback error:', err);
    }
  }

  if (!payload) {
    showDistributorFeedback(false, 'SIN CÓDIGO QR', 'Genere primero un código QR dinámico en la App del Trabajador o acerque el dispositivo al escáner.');
    return;
  }

  await processQrPayload(payload);
}

async function processQrPayload(payload, isLiveCamera = false) {
  if (payload && payload.protocol === 'SGBT_SUPERVISOR_DAILY_QR_V1') {
    return handleSupervisorDailyQrScan(payload);
  }

  // Soporte para Código QR de Delegación Criptográfica Temporal (Retiro por Terceros)
  if (payload && payload.protocol === 'SGBT_DELEGATED_CLAIM_V1') {
    try {
      const result = await API.post('/api/v1/verify/qr', {
        qr_payload: payload,
        delivered_by_user_id: STATE.operatorId
      });

      if (result.valid) {
        if (isLiveCamera && typeof showCameraScanHUD === 'function') {
          showCameraScanHUD(
            true,
            'RETIRO DELEGADO VÁLIDO',
            `Titular: ${result.worker_name} &middot; Retira: ${result.delegate_name}`
          );
        } else {
          showDistributorFeedback(
            true,
            'DESPACHO POR DELEGACIÓN AUTORIZADO',
            `Titular: <strong>${result.worker_name}</strong> (${result.document_id})<br>Compañero que retira: <strong>${result.delegate_name}</strong> (${result.delegate_doc})<br><small style="color: #6ee7b7;">Autorizado mediante permiso del Supervisor.</small>`,
            result
          );
        }
        broadcastDeliveryApproval(result, payload);
        if (typeof refreshPortalData === 'function') refreshPortalData();
      } else {
        if (isLiveCamera && typeof showCameraScanHUD === 'function') {
          showCameraScanHUD(false, 'ACCESO DENEGADO', result.message || 'Delegación inválida');
        } else {
          showDistributorFeedback(false, 'ACCESO DENEGADO', result.message || 'Delegación inválida');
        }
      }
    } catch (err) {
      if (isLiveCamera && typeof showCameraScanHUD === 'function') {
        showCameraScanHUD(false, 'ERROR AL VALIDAR', err.message);
      } else {
        showDistributorFeedback(false, 'ERROR AL VALIDAR', err.message);
      }
    }
    return;
  }

  if (!payload || !payload.wid || !payload.ent) {
    if (isLiveCamera && typeof showCameraScanHUD === 'function') {
      showCameraScanHUD(false, 'ESTRUCTURA CORRUPTA', 'Payload incompleto');
    } else {
      showDistributorFeedback(false, 'ESTRUCTURA CORRUPTA', 'El payload QR no posee los identificadores requeridos.');
    }
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - payload.ts) > 180) {
    if (isLiveCamera && typeof showCameraScanHUD === 'function') {
      showCameraScanHUD(false, 'QR EXPIRADO', 'Vigencia de 180s superada');
    } else {
      showDistributorFeedback(false, 'QR EXPIRADO', 'El código QR ha superado los 180 segundos de validez anti-captura.');
    }
    return;
  }

  const qrStation = (payload && payload.station) ? String(payload.station) : (STATE.activeStation || '1');
  const stationCacheKey = payload.wid + '_station_' + qrStation;

  if (STATE.localCache.deliveredEntitlements.has(payload.ent) || STATE.localCache.deliveredEntitlements.has(stationCacheKey)) {
    const isStation2 = qrStation === '2';
    const comboLabel = isStation2 ? '🍗 Combo Proteico Fresco (Cadena de Frío)' : 'Bulto de Víveres Secos';
    if (isLiveCamera && typeof showCameraScanHUD === 'function') {
      showCameraScanHUD(false, 'INTENTO DE DUPLICADO', `${comboLabel} ya entregado hoy`);
    } else {
      showDistributorFeedback(false, 'INTENTO DE DUPLICADO', `Alerta de Seguridad: El ${comboLabel} de este titular ya fue retirado hoy en la Estación ${qrStation} (idx_unique_daily_claim).`);
    }
    return;
  }

  if (!STATE.isOnline) {
    const pubKey = STATE.localCache.publicKeys[payload.wid];
    if (!pubKey) {
      if (isLiveCamera && typeof showCameraScanHUD === 'function') {
        showCameraScanHUD(false, 'SIN REGISTRO PREVIO', 'El beneficiario no tiene dispositivo activo');
      } else {
        showDistributorFeedback(false, 'DISPOSITIVO NO REGISTRADO', 'El trabajador no posee un teléfono o método activo registrado en la base de datos.');
      }
      return;
    }

    const worker = STATE.localCache.workers.find(w => w.worker_id === payload.wid);
    const deliveryId = crypto.randomUUID();
    const offlineRecord = {
      id: deliveryId,
      entitlement_id: payload.ent,
      worker_id: payload.wid,
      distribution_point_id: qrStation === '2' ? '550e8400-e29b-41d4-a716-446655440001' : '550e8400-e29b-41d4-a716-446655440000',
      verification_method: 'passkey_qr',
      signature_proof: payload.sig,
      challenge_nonce: payload.nonce,
      delivered_by_user_id: STATE.operatorId,
      delivered_at: new Date().toISOString(),
      is_offline_sync: true
    };

    STATE.localCache.deliveredEntitlements.add(payload.ent);
    STATE.localCache.deliveredEntitlements.add(stationCacheKey);
    STATE.localCache.syncQueue.push(offlineRecord);
    updateSyncQueueUI();

    const isStation2Offline = qrStation === '2';
    const offlineComboTitle = isStation2Offline ? '🍗 Combo Proteico Fresco (Cadena de Frío)' : 'Bulto Víveres Secos';

    if (isLiveCamera && typeof showCameraScanHUD === 'function') {
      showCameraScanHUD(
        true,
        'DESPACHO VÁLIDO',
        `${worker ? worker.full_name : 'Beneficiario'} &middot; ${offlineComboTitle}`
      );
    } else {
      showDistributorFeedback(
        true,
        'DESPACHO AUTORIZADO',
        `Beneficiario: <strong>${worker ? worker.full_name : 'Carlos Mendoza'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-18456123'}</strong><br>Estación: <strong>Estación ${qrStation}</strong> &middot; <strong>${offlineComboTitle}</strong><br><small style="color: #6ee7b7;">Entrega validada correctamente en Almacén Sótano 1.</small>`,
        worker || { worker_type: 'activo' }
      );
    }
    broadcastDeliveryApproval({ valid: true, worker_name: worker ? worker.full_name : 'Beneficiario', document_id: worker ? worker.document_id : 'V-18456123', combo_name: offlineComboTitle, station: parseInt(qrStation, 10) }, payload);
  } else {
    try {
      const activeStation = qrStation;
      const result = await API.post('/api/v1/verify/qr', {
        qr_payload: payload,
        delivered_by_user_id: STATE.operatorId,
        station: activeStation
      });

      if (result.valid) {
        STATE.localCache.deliveredEntitlements.add(payload.ent);
        STATE.localCache.deliveredEntitlements.add(stationCacheKey);
        STATE.localCache.deliveredEntitlements.add(payload.wid + '_station_' + (result.station || activeStation));


        // Notificación Toast exacta por estación
        const toastMsg = result.toast_message || (result.station === 2 
          ? '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.'
          : '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.');

        window.showToast(toastMsg, 'success');
        playAudioFeedback('success');
        if (navigator.vibrate) navigator.vibrate([120, 80, 200]);

        if (isLiveCamera && typeof showCameraScanHUD === 'function') {
          showCameraScanHUD(
            true,
            'DESPACHO AUTORIZADO',
            `${result.worker_name} (${result.document_id}) &middot; ${result.combo_name}`
          );
        } else {
          showDistributorFeedback(
            true,
            'DESPACHO ONLINE AUTORIZADO',
            `Beneficiario: <strong>${result.worker_name}</strong> &middot; Cédula: <strong>${result.document_id}</strong><br>Estación: <strong>${result.station_name || ('Estación ' + (result.station || 1))}</strong> &middot; <strong>${result.combo_name}</strong><br><small style="color: #6ee7b7;">Firma biométrica validada en servidor central.</small>`,
            result
          );
        }
        broadcastDeliveryApproval(result, payload);
        if (typeof refreshPortalData === 'function') refreshPortalData();
      } else {
        const errMsg = result.message || 'Código QR no autorizado o beneficio ya reclamado';
        window.showToast(errMsg, 'error');
        playAudioFeedback('error');
        if (isLiveCamera && typeof showCameraScanHUD === 'function') {
          showCameraScanHUD(false, 'ACCESO DENEGADO', errMsg);
        } else {
          showDistributorFeedback(false, 'ACCESO DENEGADO', errMsg);
        }
      }
    } catch (err) {
      const errMsg = err.message || 'Error al validar código QR en el servidor central';
      window.showToast(errMsg, 'error');
      playAudioFeedback('error');
      if (isLiveCamera && typeof showCameraScanHUD === 'function') {
        showCameraScanHUD(false, 'ERROR AL VALIDAR', errMsg);
      } else {
        showDistributorFeedback(false, 'ERROR AL VALIDAR', errMsg);
      }
    }
  }
}

async function downloadDailyPack() {
  try {
    const pack = await API.get('/api/v1/sync/daily-pack');

    STATE.localCache.workers = pack.active_workers;
    STATE.localCache.publicKeys = {};
    STATE.localCache.nfcCards = {};
    STATE.localCache.entitlements = {};

    let totalKeys = 0;
    pack.active_workers.forEach(w => {
      if (w.public_keys && w.public_keys.length > 0) {
        STATE.localCache.publicKeys[w.worker_id] = w.public_keys[0].public_key_pem;
        totalKeys += w.public_keys.length;
      }
      if (w.nfc_cards && w.nfc_cards.length > 0) {
        w.nfc_cards.forEach(n => {
          if (n.status === 'active') {
            STATE.localCache.nfcCards[n.card_uid] = w.worker_id;
          }
        });
      }
      if (w.entitlements && w.entitlements.length > 0) {
        STATE.localCache.entitlements[w.worker_id] = w.entitlements[0];
      }
    });

    const elWorkersCount = document.getElementById('localDbWorkersCount');
    const elKeysCount = document.getElementById('localDbKeysCount');
    if (elWorkersCount) elWorkersCount.textContent = pack.total_workers;
    if (elKeysCount) elKeysCount.textContent = totalKeys;

    console.log('[DISTRIBUIDOR] Paquete diario SQLite precargado con éxito.');
  } catch (err) {
    console.error('Error descargando daily pack:', err);
  }
}

async function simulateNfcTap() {
  const cardUid = '04A1B2C3D4E5F6'; // UID de Hilda Domínguez (Jubilada)
  const workerId = STATE.localCache.nfcCards[cardUid];

  if (!workerId) {
    showDistributorFeedback(false, 'TARJETA NO REGISTRADA', `UID ${cardUid} no vinculada a ningún beneficiario.`);
    return;
  }

  const worker = STATE.localCache.workers.find(w => w.worker_id === workerId);
  const entitlement = STATE.localCache.entitlements[workerId];
  if (!entitlement) {
    showDistributorFeedback(false, 'SIN ASIGNACIÓN ACTIVA', 'El beneficiario no posee asignación programada para hoy.');
    return;
  }

  if (STATE.localCache.deliveredEntitlements.has(entitlement.entitlement_id)) {
    showDistributorFeedback(false, 'BENEFICIO YA RECLAMADO', 'Alerta anti-fraude: Esta tarjeta ya fue despachada hoy.');
    return;
  }

  const deliveryId = crypto.randomUUID();
  const deliveryRecord = {
    id: deliveryId,
    entitlement_id: entitlement.entitlement_id,
    worker_id: workerId,
    distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
    verification_method: 'nfc_card',
    delivered_by_user_id: STATE.operatorId,
    delivered_at: new Date().toISOString(),
    is_offline_sync: !STATE.isOnline
  };

  STATE.localCache.deliveredEntitlements.add(entitlement.entitlement_id);

  if (!STATE.isOnline) {
    STATE.localCache.syncQueue.push(deliveryRecord);
    updateSyncQueueUI();
    showDistributorFeedback(
      true,
      'DESPACHO NFC AUTORIZADO (OFFLINE)',
      `Beneficiario: <strong>${worker ? worker.full_name : 'Hilda Domínguez'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-06894321'}</strong><br><small style="color: #38bdf8;">Tarjeta NFC física validada sin internet en Almacén Sótano 1.</small>`,
      worker || { worker_type: 'jubilado' }
    );
  } else {
    await API.post('/api/v1/sync/batch-deliveries', {
      distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
      device_id: 'distributor_tablet_01',
      deliveries: [deliveryRecord]
    });
    showDistributorFeedback(
      true,
      'DESPACHO NFC AUTORIZADO',
      `Beneficiario: <strong>${worker ? worker.full_name : 'Hilda Domínguez'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-06894321'}</strong><br><small style="color: #38bdf8;">Tarjeta física NFC validada y sincronizada.</small>`,
      worker || { worker_type: 'jubilado' }
    );
    if (typeof refreshPortalData === 'function') refreshPortalData();
  }
}

async function simulateSupervisorDailyQrApproval() {
  if (!STATE.supervisor_qr_mode) {
    showDistributorFeedback(false, 'MODO QR SUPERVISOR DESACTIVADO', 'El sistema está en modo Tarjeta NFC física. Active el switch en Configuración para usar el QR Diario del Supervisor.');
    return;
  }

  try {
    const data = await API.get('/api/v1/supervisor/daily-qr');
    const payload = JSON.parse(data.qr_payload);
    await handleSupervisorDailyQrScan(payload);
  } catch (err) {
    showDistributorFeedback(false, 'ERROR QR SUPERVISOR', err.message);
  }
}

async function handleSupervisorDailyQrScan(payload) {
  if (!STATE.supervisor_qr_mode) {
    showDistributorFeedback(false, 'MODO QR SUPERVISOR DESACTIVADO', 'El sistema está configurado en modo Tarjeta NFC. Active el switch en Configuración para autorizar mediante el QR del supervisor.');
    return;
  }

  let workerId = null;
  if (pendingContingencyWorker) {
    workerId = pendingContingencyWorker.worker_id || pendingContingencyWorker.id;
  } else if (STATE.selectedWorkerId) {
    const selWorker = STATE.localCache.workers.find(w => w.worker_id === STATE.selectedWorkerId);
    if (selWorker) workerId = selWorker.worker_id;
  }
  
  if (!workerId) {
    const hilda = STATE.localCache.workers.find(w => w.document_id === 'V-06894321' || w.worker_type === 'jubilado');
    workerId = hilda ? hilda.worker_id : '550e8400-e29b-41d4-a716-446655440003';
  }

  const worker = STATE.localCache.workers.find(w => w.worker_id === workerId) || {
    worker_id: workerId,
    full_name: 'Hilda Domínguez',
    document_id: 'V-06894321',
    worker_type: 'jubilado'
  };

  const entitlement = STATE.localCache.entitlements[workerId] || {
    entitlement_id: '770e8400-e29b-41d4-a716-446655440003'
  };

  if (STATE.localCache.deliveredEntitlements.has(entitlement.entitlement_id)) {
    showDistributorFeedback(false, 'BENEFICIO YA RECLAMADO', `Alerta anti-fraude: El beneficiario ${worker.full_name} (${worker.document_id}) ya recibió su beneficio hoy.`);
    return;
  }

  const deliveryId = crypto.randomUUID();
  const deliveryRecord = {
    id: deliveryId,
    entitlement_id: entitlement.entitlement_id,
    worker_id: workerId,
    distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
    verification_method: 'supervisor_daily_qr',
    supervisor_id: payload.supervisor_id || STATE.supervisorId,
    override_reason: `Aprobación mediante Código QR Diario del Supervisor (${payload.auth_code}) para beneficiario sin smartphone`,
    delivered_by_user_id: STATE.operatorId,
    delivered_at: new Date().toISOString(),
    is_offline_sync: !STATE.isOnline
  };

  STATE.localCache.deliveredEntitlements.add(entitlement.entitlement_id);

  if (!STATE.isOnline) {
    STATE.localCache.syncQueue.push(deliveryRecord);
    updateSyncQueueUI();
    showDistributorFeedback(
      true,
      'DESPACHO AUTORIZADO POR QR SUPERVISOR (OFFLINE)',
      `Beneficiario sin móvil: <strong>${worker.full_name}</strong> &middot; Cédula: <strong>${worker.document_id}</strong><br><small style="color: #38bdf8;">Código QR del Supervisor <strong>${payload.auth_code}</strong> validado sin internet en mesa.</small>`,
      worker
    );
  } else {
    try {
      await API.post('/api/v1/sync/batch-deliveries', {
        distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
        device_id: 'distributor_tablet_01',
        deliveries: [deliveryRecord]
      });

      showDistributorFeedback(
        true,
        'DESPACHO AUTORIZADO (QR SUPERVISOR)',
        `Beneficiario: <strong>${worker.full_name}</strong> &middot; Cédula: <strong>${worker.document_id}</strong><br><small style="color: #38bdf8;">Aprobado con el <strong>Código QR Diario del Supervisor</strong> (${payload.auth_code}). Válido para entrega del día sin smartphone.</small>`,
        worker
      );
      pendingContingencyWorker = null;
      if (typeof refreshPortalData === 'function') refreshPortalData();
    } catch (err) {
      showDistributorFeedback(false, 'ERROR AL REGISTRAR', err.message);
    }
  }
}

async function searchContingencyWorker() {
  const input = document.getElementById('contingencyDocInput');
  const resultBox = document.getElementById('contingencyWorkerResultBox');
  const doc = input?.value.trim();
  if (!doc) return window.showToast('Ingrese un número de Cédula', 'warning');

  const cleanDoc = doc.toUpperCase();
  const digits = doc.replace(/[^0-9]/g, '');

  let worker = STATE.localCache.workers.find(w => 
    w.document_id === cleanDoc || 
    (digits && w.document_id.replace(/[^0-9]/g, '') === digits)
  );

  if (!worker) {
    try {
      const data = await API.get(`/api/v1/admin/workers?search=${encodeURIComponent(digits || cleanDoc)}`);
      if (data && data.workers && data.workers.length > 0) {
        worker = data.workers[0];
      }
    } catch (e) {}
  }

  if (!worker) {
    if (resultBox) {
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div style="color: #f87171; font-size: 0.8rem; text-align: center; padding: 0.5rem;">
          ❌ La Cédula <strong>${doc}</strong> no se encuentra en la nómina institucional.
        </div>
      `;
    }
    playAudioFeedback('error');
    return;
  }

  pendingContingencyWorker = worker;
  const workerId = worker.worker_id || worker.id;
  const isJubilado = worker.worker_type === 'jubilado' || worker.contingency_reason === 'adulto_mayor_sin_smartphone';
  const typeBadge = isJubilado 
    ? '<span class="badge badge-jubilado" style="font-size: 0.68rem;">👴 Jubilado / Sin Móvil</span>'
    : '<span class="badge badge-activo" style="font-size: 0.68rem;">🏢 Funcionario Activo</span>';

  const isDelivered = STATE.localCache.deliveredEntitlements.has(workerId) || worker.today_claimed;

  if (resultBox) {
    resultBox.style.display = 'block';
    resultBox.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.65rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(56, 189, 248, 0.2); display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
              👤
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.85rem; color: #fff;">${worker.full_name}</div>
              <div class="text-mono" style="font-size: 0.75rem; color: #94a3b8;">${worker.document_id} &middot; ${worker.department_name || 'MIPPCI'}</div>
            </div>
          </div>
          <div>${typeBadge}</div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
          <span style="color: #94a3b8;">Beneficio del Día:</span>
          <span style="color: #34d399; font-weight: 700;">📦 Bolsa Víveres Secos + Combo Proteico</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
          <span style="color: #94a3b8;">Estatus de Despacho:</span>
          <span id="contingencyDeliveryStatusLabel" style="color: ${isDelivered ? '#f87171' : '#38bdf8'}; font-weight: 700;">
            ${isDelivered ? '🔴 Ya retirado hoy' : '🟢 Pendiente por retirar'}
          </span>
        </div>

        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <label style="font-size: 0.72rem; color: #cbd5e1; white-space: nowrap;">Motivo:</label>
          <select id="contingencyOverrideReasonInput" class="form-select" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; flex: 1;">
            <option value="adulto_mayor_sin_smartphone" ${isJubilado ? 'selected' : ''}>👴 Adulto mayor sin smartphone</option>
            <option value="device_lost">📱 Dispositivo extraviado o robado</option>
            <option value="battery_dead_screen_broken">🔋 Batería descargada / Pantalla rota</option>
            <option value="reposo_medico">🏥 Reposo médico justificado</option>
          </select>
        </div>

        <button type="button" id="btnExecuteOneClickOverride" class="btn btn-primary" style="width: 100%; padding: 0.65rem; font-size: 0.82rem; font-weight: 800; background: ${isDelivered ? '#475569' : 'linear-gradient(135deg, #059669, #10b981)'}; border: none; border-radius: 6px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); display: flex; align-items: center; justify-content: center; gap: 0.4rem; cursor: pointer;" ${isDelivered ? 'disabled' : ''}>
          <span>🛡️</span>
          <span>${isDelivered ? 'Beneficio Ya Reclamado Hoy' : 'Liberar Combo con Huella del Supervisor (1 Clic)'}</span>
        </button>
      </div>
    `;

    const btnExec = resultBox.querySelector('#btnExecuteOneClickOverride');
    btnExec?.addEventListener('click', async () => {
      btnExec.disabled = true;
      btnExec.innerHTML = '<span>⏳ Estampando Firma Biométrica de Supervisor...</span>';

      try {
        const reason = resultBox.querySelector('#contingencyOverrideReasonInput')?.value || 'adulto_mayor_sin_smartphone';
        const res = await API.post('/api/v1/auth/supervisor/contingency-override', {
          worker_document_id: worker.document_id,
          supervisor_id: STATE.currentUser?.id,
          override_reason: reason
        });

        playAudioFeedback('success');
        window.showToast(res.message, 'success');
        
        const statusLabel = resultBox.querySelector('#contingencyDeliveryStatusLabel');
        if (statusLabel) {
          statusLabel.textContent = '✅ Despachado exitosamente';
          statusLabel.style.color = '#34d399';
        }

        btnExec.style.background = '#047857';
        btnExec.innerHTML = '<span>✅ Despacho Autorizado con Huella del Supervisor</span>';
        STATE.localCache.deliveredEntitlements.add(workerId);

        broadcastDeliveryApproval(res, { wid: worker.id });
        if (typeof refreshPortalData === 'function') refreshPortalData();

      } catch (err) {
        console.error('Error liberando contingencia 1-clic:', err);
        playAudioFeedback('error');
        window.showToast(err.message || 'Error autorizando liberación', 'error');
        btnExec.disabled = false;
        btnExec.innerHTML = '<span>🔄 Reintentar Liberación con Huella</span>';
      }
    });
  }
}

function executeSupervisorOverride() {
  if (!pendingContingencyWorker) return;
  const reason = document.getElementById('modalOverrideReasonSelect')?.value || 'supervisor_approval';
  document.getElementById('supervisorModalBackdrop')?.classList.remove('active');
  recordContingencyDelivery('supervisor_override', reason, STATE.supervisorId);
}

function recordContingencyDelivery(method, reason, supervisorId) {
  const worker = pendingContingencyWorker;
  const entitlement = STATE.localCache.entitlements[worker.worker_id] || { entitlement_id: crypto.randomUUID() };

  const deliveryRecord = {
    id: crypto.randomUUID(),
    entitlement_id: entitlement.entitlement_id,
    worker_id: worker.worker_id,
    distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
    verification_method: method,
    supervisor_id: supervisorId,
    override_reason: reason,
    delivered_by_user_id: STATE.operatorId,
    delivered_at: new Date().toISOString(),
    is_offline_sync: !STATE.isOnline
  };

  STATE.localCache.deliveredEntitlements.add(entitlement.entitlement_id);

  if (!STATE.isOnline) {
    STATE.localCache.syncQueue.push(deliveryRecord);
    updateSyncQueueUI();
    showDistributorFeedback(true, 'CONTINGENCIA REGISTRADA', `Autorizado con firma de Supervisor para ${worker.full_name}.`);
  } else {
    API.post('/api/v1/sync/batch-deliveries', {
      distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
      device_id: 'distributor_tablet_01',
      deliveries: [deliveryRecord]
    }).then(() => {
      showDistributorFeedback(true, 'CONTINGENCIA APROBADA', `Autorizado con firma biométrica para ${worker.full_name}.`);
      if (typeof refreshPortalData === 'function') refreshPortalData();
    }).catch(err => {
      showDistributorFeedback(false, 'ERROR CONTINGENCIA', err.message);
    });
  }
}

async function syncDeferredQueue() {
  if (STATE.localCache.syncQueue.length === 0) {
    window.showToast('No hay transacciones pendientes en la cola diferida.', 'info');
    return;
  }

  if (!STATE.isOnline) {
    window.showToast('No hay conexión de red. Restablezca la conexión para transmitir.', 'warning');
    return;
  }

  try {
    const queue = [...STATE.localCache.syncQueue];
    const data = await API.post('/api/v1/sync/batch-deliveries', {
      distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
      device_id: 'distributor_tablet_01',
      deliveries: queue
    });

    window.showToast(`☁️ Sincronización en Lote:\n• Procesadas: ${data.processed}\n• Duplicados bloqueados: ${data.failed_duplicates}`, 'success');
    STATE.localCache.syncQueue = [];
    updateSyncQueueUI();
    if (typeof refreshPortalData === 'function') refreshPortalData();
  } catch (err) {
    window.showToast('Error transmitiendo lote: ' + err.message, 'error');
  }
}

function updateSyncQueueUI() {
  const counter = document.getElementById('syncQueueCounter');
  const list = document.getElementById('localSyncQueueList');
  if (!counter || !list) return;

  const count = STATE.localCache.syncQueue.length;
  counter.textContent = `${count} pendientes en cola`;
  list.innerHTML = '';

  if (count === 0) {
    list.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 1rem;">No hay entregas pendientes de sincronizar.</div>';
    return;
  }

  STATE.localCache.syncQueue.forEach((d, idx) => {
    const item = document.createElement('div');
    item.style.background = 'rgba(255,255,255,0.03)';
    item.style.padding = '0.5rem 0.75rem';
    item.style.borderRadius = '6px';
    item.style.border = '1px solid var(--bg-card-border)';
    item.innerHTML = `
      <div class="flex-between">
        <strong>#${idx + 1} - ${d.verification_method}</strong>
        <span class="badge badge-offline" style="font-size: 0.6rem;">OFFLINE</span>
      </div>
      <div class="text-mono" style="font-size: 0.65rem; color: var(--text-dim); margin-top: 0.2rem;">ID: ${d.id.substring(0, 16)}...</div>
    `;
    list.appendChild(item);
  });
}

function showDistributorFeedback(isSuccess, title, subtitle, extraData = null) {
  const overlay = document.getElementById('distributorFeedbackOverlay');
  const icon = document.getElementById('feedbackIcon');
  const t = document.getElementById('feedbackTitle');
  const s = document.getElementById('feedbackSubtitle');
  const d = document.getElementById('feedbackDetails');

  if (!overlay) return;

  overlay.className = `distributor-feedback-overlay ${isSuccess ? 'overlay-success' : 'overlay-error'} active`;
  if (icon) icon.textContent = isSuccess ? '✅' : '🛑';
  if (t) t.textContent = title;
  if (s) s.innerHTML = subtitle;

  if (isSuccess && d) {
    const isJubilado = extraData && (extraData.worker_type === 'jubilado' || extraData.contingency_reason === 'adulto_mayor_sin_smartphone');
    const badgeHtml = isJubilado 
      ? '<span class="badge badge-jubilado" style="font-size: 0.85rem; padding: 0.35rem 0.75rem;">👴 Personal Jubilado / Adulto Mayor</span>' 
      : '<span class="badge badge-activo" style="font-size: 0.85rem; padding: 0.35rem 0.75rem;">🏢 Funcionario Activo</span>';

    d.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.65rem; text-align: left;">
        <div class="flex-between" style="border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 0.5rem;">
          <span style="font-size: 0.85rem; color: #cbd5e1;">Condición Institucional:</span>
          ${badgeHtml}
        </div>
        <div style="font-size: 0.85rem; font-weight: 700; color: #34d399;">
          📦 Bultos Entregados en Mesa de Despacho:
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem; color: #f8fafc; background: rgba(0,0,0,0.35); padding: 0.65rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
          <div>✅ <strong>Bolsa de Víveres Secos</strong> (Harina x4, Arroz x2, Pasta x2, Caraotas, Aceite, Azúcar, Leche)</div>
          <div>✅ <strong>Combo Proteico Fresco</strong> (Pollo entero, Carne molida, Mortadela especial)</div>
        </div>
        <div class="text-mono" style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.2rem;">
          ID Transacción: ${crypto.randomUUID()} &middot; Punto: Almacén Sótano 1
        </div>
      </div>
    `;
  } else if (d) {
    d.textContent = `Código de Anomalía: ERR_${Date.now().toString().slice(-6)} &middot; Revisión Requerida`;
  }

  playAudioFeedback(isSuccess ? 'success' : 'error');
}
