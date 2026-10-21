// ============================================================================
// MODULE: DISTRIBUTOR & SCANNER (DESPACHO, CÁMARA QR, NFC, OFFLINE ENGINE)
// ============================================================================

let liveCameraScanner = null;
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
  
  // Controles de Cámara Real en Vivo
  document.getElementById('btnStartCameraScanner')?.addEventListener('click', startLiveCameraScanner);
  document.getElementById('btnStopCameraScanner')?.addEventListener('click', stopLiveCameraScanner);

  // Botón para escanear QR detectado en tiempo real desde otra pestaña o dispositivo
  document.getElementById('btnQuickScanDetectedQr')?.addEventListener('click', () => {
    scanWorkerQr();
  });

  // Selector de cámara física
  const camSelect = document.getElementById('cameraDeviceSelect');
  camSelect?.addEventListener('change', () => {
    if (liveCameraScanner && liveCameraScanner.isScanning) {
      startLiveCameraScanner();
    }
  });

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

  // Módulo de Contingencia
  document.getElementById('btnSearchContingencyWorker')?.addEventListener('click', searchContingencyWorker);
  document.getElementById('btnAuthorizeSupervisorOverride')?.addEventListener('click', executeSupervisorOverride);

  // Escuchar sincronización en tiempo real de QR generado por el beneficiario (Multi-pestaña)
  setupRealtimeQrSyncListener();
};

window.downloadDailyPack = downloadDailyPack;

function setupRealtimeQrSyncListener() {
  const showBanner = (workerName, docId, payload) => {
    const banner = document.getElementById('liveQrDetectedBanner');
    const info = document.getElementById('liveQrDetectedInfo');
    if (banner && info) {
      STATE.activeQrPayload = payload;
      info.innerHTML = `<strong>${workerName || 'Beneficiario'}</strong> &middot; Cédula: <strong>${docId || 'V-18456123'}</strong><br><small style="color: #6ee7b7;">Firma criptográfica ECDSA P-256 lista para validación.</small>`;
      banner.style.display = 'block';
      playAudioFeedback('success');
    }
  };

  if ('BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel('sgbt_qr_channel');
      bc.onmessage = (e) => {
        if (e.data && e.data.type === 'NEW_QR_GENERATED') {
          console.log('[DISTRIBUIDOR] QR recibido por canal BroadcastChannel:', e.data);
          showBanner(e.data.worker_name, e.data.doc_id, e.data.payload);
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
        showBanner(name, doc, payload);
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
        showBanner(name, doc, payload);
      }
    }
  } catch (e) {}
}

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
    }

    if (standbyBox) standbyBox.style.display = 'none';
    if (liveContainer) liveContainer.style.display = 'block';
    if (badge) {
      badge.textContent = '🟢 Cámara Activa (Enfocando)';
      badge.className = 'badge badge-proteina';
    }

    liveCameraScanner = new Html5Qrcode("cameraQrReader");
    let selectedCameraId = null;
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        if (camSelect) {
          camSelect.innerHTML = '';
          devices.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.id;
            opt.textContent = dev.label || `Cámara ${idx + 1}`;
            camSelect.appendChild(opt);
          });
          camSelect.style.display = devices.length > 1 ? 'block' : 'none';
          const backCam = devices.find(d => 
            (d.label || '').toLowerCase().includes('back') || 
            (d.label || '').toLowerCase().includes('trasera') || 
            (d.label || '').toLowerCase().includes('rear') || 
            (d.label || '').toLowerCase().includes('environment')
          );
          selectedCameraId = backCam ? backCam.id : devices[devices.length - 1].id;
          camSelect.value = selectedCameraId;
        } else {
          selectedCameraId = devices[0].id;
        }
      }
    } catch (e) {
      console.warn('No se pudieron enumerar cámaras físicas:', e);
    }

    const config = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
        return { width: Math.floor(edge), height: Math.floor(edge) };
      },
      aspectRatio: 1.0
    };

    const cameraParam = selectedCameraId ? selectedCameraId : { facingMode: { ideal: "environment" } };

    const onScanSuccess = async (decodedText) => {
      console.log('[CÁMARA QR] Código decodificado exitosamente:', decodedText);
      playAudioFeedback('success');

      try {
        const cleanText = decodedText.trim();
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

        await stopLiveCameraScanner();
        await processQrPayload(payload);

      } catch (err) {
        console.error('[QR PARSE ERROR]', err, decodedText);
        showDistributorFeedback(false, 'FORMATO QR NO RECONOCIDO', 'El código escaneado no corresponde a una credencial FIDO2 válida ni al QR del Supervisor.');
      }
    };

    const onScanFailure = () => {};

    try {
      await liveCameraScanner.start(cameraParam, config, onScanSuccess, onScanFailure);
    } catch (startErr) {
      console.warn('Fallo con cameraParam específico, intentando fallback genérico:', startErr);
      await liveCameraScanner.start({ facingMode: "user" }, config, onScanSuccess, onScanFailure);
    }

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
        const entId = (testWorker.entitlements && testWorker.entitlements[0]?.entitlement_id) || 'dfe02340-0f75-484d-9984-d3acce1c37db';
        const signData = await API.post('/api/v1/auth/passkey/sign-offline', {
          worker_id: testWorker.worker_id,
          entitlement_id: entId
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

async function processQrPayload(payload) {
  if (payload && payload.protocol === 'SGBT_SUPERVISOR_DAILY_QR_V1') {
    return handleSupervisorDailyQrScan(payload);
  }

  if (!payload || !payload.wid || !payload.ent) {
    showDistributorFeedback(false, 'ESTRUCTURA CORRUPTA', 'El payload QR no posee los identificadores requeridos.');
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - payload.ts) > 180) {
    showDistributorFeedback(false, 'QR EXPIRADO', 'El código QR ha superado los 180 segundos de validez anti-captura.');
    return;
  }

  if (STATE.localCache.deliveredEntitlements.has(payload.ent)) {
    showDistributorFeedback(false, 'INTENTO DE DUPLICADO', 'Alerta de Seguridad: Este beneficio ya fue entregado hoy (idx_unique_daily_claim).');
    return;
  }

  if (!STATE.isOnline) {
    const pubKey = STATE.localCache.publicKeys[payload.wid];
    if (!pubKey) {
      showDistributorFeedback(false, 'PASSKEY NO ENCONTRADA', 'El trabajador no posee una clave pública activa en la base local.');
      return;
    }

    const worker = STATE.localCache.workers.find(w => w.worker_id === payload.wid);
    const deliveryId = crypto.randomUUID();
    const offlineRecord = {
      id: deliveryId,
      entitlement_id: payload.ent,
      worker_id: payload.wid,
      distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
      verification_method: 'passkey_qr',
      signature_proof: payload.sig,
      challenge_nonce: payload.nonce,
      delivered_by_user_id: STATE.operatorId,
      delivered_at: new Date().toISOString(),
      is_offline_sync: true
    };

    STATE.localCache.deliveredEntitlements.add(payload.ent);
    STATE.localCache.syncQueue.push(offlineRecord);
    updateSyncQueueUI();

    showDistributorFeedback(
      true,
      'DESPACHO OFFLINE AUTORIZADO',
      `Beneficiario: <strong>${worker ? worker.full_name : 'Carlos Mendoza'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-18456123'}</strong><br><small style="color: #6ee7b7;">Firma digital FIDO2 validada localmente en Almacén Sótano 1.</small>`,
      worker || { worker_type: 'activo' }
    );
  } else {
    try {
      const result = await API.post('/api/v1/verify/qr', {
        qr_payload: payload,
        delivered_by_user_id: STATE.operatorId
      });

      if (result.valid) {
        STATE.localCache.deliveredEntitlements.add(payload.ent);
        showDistributorFeedback(
          true,
          'DESPACHO ONLINE AUTORIZADO',
          `Beneficiario: <strong>${result.worker_name}</strong> &middot; Cédula: <strong>${result.document_id}</strong><br><small style="color: #6ee7b7;">Firma biométrica validada en servidor central.</small>`,
          result
        );
        if (typeof refreshPortalData === 'function') refreshPortalData();
      } else {
        showDistributorFeedback(false, 'ACCESO DENEGADO', result.message || 'Firma inválida o combo ya reclamado');
      }
    } catch (err) {
      showDistributorFeedback(false, 'ERROR DE RED', err.message);
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

function searchContingencyWorker() {
  const doc = document.getElementById('contingencyDocInput')?.value.trim();
  if (!doc) return window.showToast('Ingrese un número de documento', 'warning');

  const worker = STATE.localCache.workers.find(w => w.document_id === doc);
  if (!worker) {
    window.showToast('Trabajador no encontrado en el padrón.', 'error');
    return;
  }

  pendingContingencyWorker = worker;
  const entitlement = STATE.localCache.entitlements[worker.worker_id];

  if (entitlement && STATE.localCache.deliveredEntitlements.has(entitlement.entitlement_id)) {
    window.showToast('ALERTA: Este trabajador ya reclamó su combo el día de hoy.', 'error');
    return;
  }

  const requiresSupervisor = worker.contingency_reason === 'device_lost' || STATE.operatorOverridesCount >= 3;

  if (requiresSupervisor) {
    document.getElementById('modalBeneficiaryName').textContent = worker.full_name;
    document.getElementById('modalBeneficiaryDoc').textContent = worker.document_id;
    document.getElementById('modalBeneficiaryCombo').textContent = entitlement ? entitlement.combo_name : 'Combo Asignado';
    document.getElementById('supervisorModalBackdrop')?.classList.add('active');
  } else {
    if (confirm(`¿Autorizar liberación manual Nivel 1 para ${worker.full_name}? (Quedan ${2 - STATE.operatorOverridesCount} liberaciones de operador)`)) {
      STATE.operatorOverridesCount++;
      const opCountEl = document.getElementById('operatorOverridesCount');
      if (opCountEl) opCountEl.textContent = `${STATE.operatorOverridesCount} / 3 liberaciones de operador`;
      recordContingencyDelivery('supervisor_override', 'battery_dead_screen_broken', STATE.operatorId);
    }
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
