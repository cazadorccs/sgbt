// ============================================================================
// MODULE: PAYROLL SSOT, CSV INGESTION, DISCREPANCIES & KILL-SWITCH
// ============================================================================

let parsedCsvWorkers = [];

window.setupPayrollSimulator = function() {
  const logsConsole = document.getElementById('payrollLogsConsole');
  function appendLog(msg) {
    if (logsConsole) {
      logsConsole.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logsConsole.textContent;
    }
  }

  // 1. Webhook
  document.getElementById('btnSendPayrollWebhook')?.addEventListener('click', async () => {
    const doc = document.getElementById('whDocInput')?.value;
    const name = document.getElementById('whNameInput')?.value;
    const email = document.getElementById('whEmailInput')?.value;
    const workerType = document.getElementById('whWorkerTypeSelect')?.value || 'activo';
    const shift = document.getElementById('whShiftSelect')?.value || 'diurno';

    const payload = {
      event_id: `evt_${Date.now()}`,
      event_type: 'employee.updated',
      timestamp: new Date().toISOString(),
      data: {
        document_id: doc,
        full_name: name,
        email: email,
        worker_type: workerType,
        shift: shift,
        status: 'active',
        has_smartphone: workerType !== 'jubilado'
      }
    };

    try {
      const signature = 'sha256=test_signature_for_local_demo';
      const data = await API.post('/api/v1/payroll/webhook', payload);
      appendLog(`Webhook respondido: ${JSON.stringify(data)}`);
      window.showToast('Webhook de nómina procesado con éxito', 'success');
      if (typeof refreshPortalData === 'function') refreshPortalData();
    } catch (err) {
      appendLog(`Error webhook: ${err.message}`);
      window.showToast('Error webhook: ' + err.message, 'error');
    }
  });

  // 2. Tab switcher (CSV vs JSON)
  const tabCsvBtn = document.getElementById('tabPayrollCsvBtn');
  const tabJsonBtn = document.getElementById('tabPayrollJsonBtn');
  const csvContainer = document.getElementById('payrollCsvContainer');
  const jsonContainer = document.getElementById('payrollJsonContainer');

  tabCsvBtn?.addEventListener('click', () => {
    tabCsvBtn.style.background = '#0284c7';
    tabCsvBtn.style.color = '#ffffff';
    if (tabJsonBtn) {
      tabJsonBtn.style.background = 'transparent';
      tabJsonBtn.style.color = '#94a3b8';
    }
    if (csvContainer) csvContainer.style.display = 'block';
    if (jsonContainer) jsonContainer.style.display = 'none';
  });

  tabJsonBtn?.addEventListener('click', () => {
    tabJsonBtn.style.background = '#0284c7';
    tabJsonBtn.style.color = '#ffffff';
    if (tabCsvBtn) {
      tabCsvBtn.style.background = 'transparent';
      tabCsvBtn.style.color = '#94a3b8';
    }
    if (jsonContainer) jsonContainer.style.display = 'block';
    if (csvContainer) csvContainer.style.display = 'none';
  });

  // Manejo de Carga CSV
  const csvDropzone = document.getElementById('payrollCsvDropzone');
  const csvFileInput = document.getElementById('payrollCsvFileInput');
  const csvPreview = document.getElementById('payrollCsvPreviewSummary');
  const csvStatsText = document.getElementById('payrollCsvStatsText');
  const btnProcessCsv = document.getElementById('btnProcessCsvBatch');
  let loadedCsvText = '';

  csvDropzone?.addEventListener('click', () => csvFileInput?.click());

  csvDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    csvDropzone.style.borderColor = '#10b981';
    csvDropzone.style.background = 'rgba(16, 185, 129, 0.08)';
  });

  csvDropzone?.addEventListener('dragleave', () => {
    csvDropzone.style.borderColor = '#0284c7';
    csvDropzone.style.background = 'rgba(2, 132, 199, 0.04)';
  });

  csvDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    csvDropzone.style.borderColor = '#0284c7';
    csvDropzone.style.background = 'rgba(2, 132, 199, 0.04)';
    if (e.dataTransfer?.files?.length) {
      handleCsvFile(e.dataTransfer.files[0]);
    }
  });

  csvFileInput?.addEventListener('change', (e) => {
    if (e.target.files?.length) {
      handleCsvFile(e.target.files[0]);
    }
  });

  function handleCsvFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      window.showToast('Por favor seleccione un archivo con formato .CSV', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      loadedCsvText = event.target.result;
      const lines = loadedCsvText.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
      const rowCount = Math.max(0, lines.length - 1);
      
      if (csvPreview) csvPreview.style.display = 'block';
      if (csvStatsText) {
        csvStatsText.innerHTML = `
          <strong>Archivo:</strong> ${file.name} (${(file.size / 1024).toFixed(1)} KB)<br>
          <strong>Registros detectados:</strong> ${rowCount} trabajadores listos para ingesta.<br>
          <strong>Encabezado:</strong> <code style="font-size:0.68rem; color:#38bdf8;">${lines[0].substring(0, 70)}...</code>
        `;
      }
      if (btnProcessCsv) btnProcessCsv.style.display = 'block';
      appendLog(`Archivo CSV "${file.name}" cargado en memoria (${rowCount} filas detectadas).`);
    };
    reader.readAsText(file, 'utf-8');
  }

  btnProcessCsv?.addEventListener('click', async () => {
    if (!loadedCsvText) return;
    btnProcessCsv.disabled = true;
    btnProcessCsv.textContent = '⏳ Procesando e ingiriendo nómina...';
    try {
      const data = await API.post('/api/v1/payroll/batch-import', {
        batch_id: `batch_csv_${Date.now()}`,
        source: 'csv_upload',
        csvText: loadedCsvText
      });
      if (data.success) {
        appendLog(`✓ INGESTA CSV EXITOSA: ${data.processed} procesados (${data.updated} actualizados en DB, ${data.failed} omitidos).`);
        window.showToast(`¡Sincronización completada!\n${data.processed} trabajadores procesados.`, 'success');
        if (csvPreview) csvPreview.style.display = 'none';
        if (btnProcessCsv) btnProcessCsv.style.display = 'none';
        loadedCsvText = '';
        if (csvFileInput) csvFileInput.value = '';
        if (typeof refreshPortalData === 'function') refreshPortalData();
      }
    } catch (err) {
      appendLog(`Error de red al procesar CSV: ${err.message}`);
      window.showToast('Error de conexión al servidor: ' + err.message, 'error');
    } finally {
      btnProcessCsv.disabled = false;
      btnProcessCsv.textContent = '🚀 Ingerir Nómina desde CSV a Base de Datos';
    }
  });

  // 2.2 JSON Batch Import (SFTP Simulator)
  document.getElementById('btnSendBatchImport')?.addEventListener('click', async () => {
    try {
      const workers = JSON.parse(document.getElementById('batchJsonInput').value);
      const data = await API.post('/api/v1/payroll/batch-import', {
        batch_id: `batch_${Date.now()}`,
        source: 'sftp_pgp_import',
        workers
      });
      appendLog(`Carga masiva JSON completada: ${data.processed} procesados, ${data.failed} fallidos.`);
      window.showToast(`Carga masiva: ${data.processed} procesados`, 'success');
      if (typeof refreshPortalData === 'function') refreshPortalData();
    } catch (e) {
      window.showToast('Error en formato JSON: ' + e.message, 'error');
    }
  });

  // 3. Kill-Switch
  const killSelect = document.getElementById('killSwitchWorkerSelect');
  async function loadKillSwitchSelect() {
    if (!killSelect) return;
    try {
      const data = await API.get('/api/v1/admin/workers?status=active');
      killSelect.innerHTML = '';
      data.workers.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `${w.full_name} (${w.document_id})`;
        killSelect.appendChild(opt);
      });
    } catch (err) {
      console.warn('Error al cargar lista de kill-switch:', err);
    }
  }

  loadKillSwitchSelect();

  document.getElementById('btnExecuteKillSwitch')?.addEventListener('click', async () => {
    if (!killSelect) return;
    const workerId = killSelect.value;
    const reason = document.getElementById('killSwitchReasonInput')?.value || 'Revocación disciplinaria';

    if (!confirm('⚠️ ¿ESTÁ SEGURO DE EJECUTAR EL KILL-SWITCH? Esto revocará en cascada todas las credenciales Passkey, tarjetas NFC y beneficios del trabajador de forma inmediata.')) return;

    try {
      const data = await API.post(`/api/v1/payroll/employees/${workerId}/terminate`, {
        reason,
        authorized_by: 'admin_hr_supervisor'
      });
      appendLog(`KILL-SWITCH EJECUTADO: ${data.message} (Passkeys: ${data.summary.passkeysRevoked}, NFC: ${data.summary.nfcRevoked})`);
      window.showToast(data.message, 'warning');
      loadKillSwitchSelect();
      if (typeof refreshPortalData === 'function') refreshPortalData();
    } catch (err) {
      window.showToast('Error ejecutando Kill-Switch: ' + err.message, 'error');
    }
  });
};

window.setupWorkerManagement = function() {
  const modalCreate = document.getElementById('createWorkerModalBackdrop');
  const btnOpenCreate = document.getElementById('btnOpenCreateWorkerModal');
  const btnCloseCreate = document.getElementById('btnCloseCreateWorkerModal');
  const btnCancelCreate = document.getElementById('btnCancelCreateWorker');
  const formCreate = document.getElementById('createWorkerForm');
  const alertCreate = document.getElementById('newWorkerAlertBox');

  const modalImport = document.getElementById('importPayrollModalBackdrop');
  const btnOpenImport = document.getElementById('btnOpenImportPayrollModal');
  const btnCloseImport = document.getElementById('btnCloseImportPayrollModal');
  const btnCancelImport = document.getElementById('btnCancelImportPayroll');
  const fileDropzone = document.getElementById('csvFileDropzone');
  const fileInput = document.getElementById('csvFileInput');
  const statusText = document.getElementById('csvFileStatusText');
  const previewContainer = document.getElementById('csvPreviewContainer');
  const previewBody = document.getElementById('csvPreviewTableBody');
  const btnExecuteImport = document.getElementById('btnExecuteBatchImport');
  const btnDownloadSample = document.getElementById('btnDownloadCsvSample');
  const alertCsv = document.getElementById('csvAlertBox');

  btnOpenCreate?.addEventListener('click', () => {
    formCreate?.reset();
    if (alertCreate) alertCreate.style.display = 'none';
    modalCreate?.classList.add('active');
  });

  const closeCreate = () => modalCreate?.classList.remove('active');
  btnCloseCreate?.addEventListener('click', closeCreate);
  btnCancelCreate?.addEventListener('click', closeCreate);

  formCreate?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const docType = document.getElementById('newWorkerDocType').value;
    const docNum = document.getElementById('newWorkerDocNumber').value.trim();
    const document_id = `${docType}-${docNum}`;
    const full_name = document.getElementById('newWorkerFullName').value.trim();
    const worker_type = document.getElementById('newWorkerType').value;
    const department_id = document.getElementById('newWorkerDepartment').value || null;
    const phone_number = document.getElementById('newWorkerPhone').value.trim() || null;
    const email = document.getElementById('newWorkerEmail').value.trim() || null;
    const has_smartphone = document.getElementById('newWorkerHasSmartphone').checked;

    try {
      const data = await API.post('/api/v1/admin/workers', {
        document_id,
        full_name,
        worker_type,
        department_id,
        phone_number,
        email,
        has_smartphone
      });

      closeCreate();
      if (typeof loadWorkersDirectory === 'function') await loadWorkersDirectory();
      playAudioFeedback('success');
      window.showToast(`✅ Beneficiario "${full_name}" (${document_id}) incorporado exitosamente.`, 'success');

    } catch (err) {
      if (alertCreate) {
        alertCreate.textContent = err.message;
        alertCreate.style.display = 'block';
      }
    }
  });

  btnOpenImport?.addEventListener('click', () => {
    parsedCsvWorkers = [];
    if (previewContainer) previewContainer.style.display = 'none';
    if (alertCsv) alertCsv.style.display = 'none';
    if (btnExecuteImport) btnExecuteImport.disabled = true;
    if (statusText) statusText.textContent = 'Ningún archivo seleccionado';
    modalImport?.classList.add('active');
  });

  const closeImport = () => modalImport?.classList.remove('active');
  btnCloseImport?.addEventListener('click', closeImport);
  btnCancelImport?.addEventListener('click', closeImport);

  fileDropzone?.addEventListener('click', () => fileInput?.click());
  fileDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropzone.classList.add('dragover');
  });
  fileDropzone?.addEventListener('dragleave', () => fileDropzone.classList.remove('dragover'));
  fileDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleCsvFile(e.dataTransfer.files[0]);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleCsvFile(e.target.files[0]);
    }
  });

  function handleCsvFile(file) {
    if (!file) return;
    if (statusText) statusText.textContent = `Archivo: ${file.name} (${Math.round(file.size / 1024)} KB)`;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      parseCsvContent(e.target.result);
    };
    reader.readAsText(file);
  }

  function parseCsvContent(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      window.showToast('El archivo CSV debe contener al menos la cabecera y una fila de datos.', 'warning');
      return;
    }

    const delimiter = lines[0].includes(';') ? ';' : ',';
    parsedCsvWorkers = [];
    if (previewBody) previewBody.innerHTML = '';

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length < 2) continue;

      let doc = parts[0] || '';
      if (!doc.startsWith('V-') && !doc.startsWith('E-')) {
        doc = 'V-' + doc.replace(/\D/g, '');
      }

      const name = parts[1] || '';
      const condition = parts[2] ? parts[2].toLowerCase() : 'activo';
      const phone = parts[3] || '';
      const email = parts[4] || '';

      if (!name) continue;

      parsedCsvWorkers.push({
        document_id: doc,
        full_name: name,
        worker_type: condition.includes('jub') ? 'jubilado' : (condition.includes('cont') ? 'contratado' : 'activo'),
        phone_number: phone,
        email: email
      });

      if (parsedCsvWorkers.length <= 10 && previewBody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${doc}</strong></td>
          <td>${name}</td>
          <td>${condition}</td>
          <td>${phone || '--'}</td>
        `;
        previewBody.appendChild(tr);
      }
    }

    if (parsedCsvWorkers.length > 0) {
      if (previewContainer) previewContainer.style.display = 'block';
      if (btnExecuteImport) btnExecuteImport.disabled = false;
      if (alertCsv) {
        alertCsv.className = 'alert-box alert-info';
        alertCsv.innerHTML = `📋 Se detectaron <strong>${parsedCsvWorkers.length} registros válidos</strong> listos para importar.`;
        alertCsv.style.display = 'block';
      }
    } else {
      window.showToast('No se pudieron extraer registros válidos del archivo CSV.', 'error');
    }
  }

  btnDownloadSample?.addEventListener('click', () => {
    const sampleCsv = 
`cedula,nombre_completo,condicion,telefono,correo
V-19876543,Ana Beatriz Morales,activo,+584141112233,ana.morales@ente.gob.ve
V-07654321,Pedro José Castillo,jubilado,+584129998877,pedro.castillo@ente.gob.ve
V-25111222,Mariana Elena Torres,contratado,+584163334455,mariana.torres@ente.gob.ve`;

    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_nomina_institucional.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  btnExecuteImport?.addEventListener('click', async () => {
    if (parsedCsvWorkers.length === 0) return;

    btnExecuteImport.disabled = true;
    const CHUNK_SIZE = 250;
    const totalBatches = Math.ceil(parsedCsvWorkers.length / CHUNK_SIZE);
    let totalImported = 0;

    try {
      for (let b = 0; b < totalBatches; b++) {
        const chunk = parsedCsvWorkers.slice(b * CHUNK_SIZE, (b + 1) * CHUNK_SIZE);
        btnExecuteImport.textContent = `⏳ Procesando lote ${b + 1} de ${totalBatches}... (${totalImported} registrados)`;

        const data = await API.post('/api/v1/admin/workers/batch', { workers: chunk });
        totalImported += (data.imported || 0);
      }

      window.showToast(`🎉 ¡Importación completada con éxito! Se procesaron ${totalImported} trabajadores.`, 'success');
      closeImport();
      if (typeof loadWorkersDirectory === 'function') await loadWorkersDirectory();
      playAudioFeedback('success');

    } catch (err) {
      window.showToast('Error durante la importación masiva: ' + err.message, 'error');
    } finally {
      btnExecuteImport.disabled = false;
      btnExecuteImport.textContent = '🚀 Iniciar Importación a Base de Datos';
    }
  });
};
