// ============================================================================
// MODULE: SHARING, TENANT BRANDING, SUPERVISOR QR & DEEP LINKS
// ============================================================================

let currentTenantData = null;
let activeWaShareRole = 'worker';
let activeWaCustomWorker = null;

window.loadTenantSettings = async function() {
  try {
    const data = await API.get('/api/v1/tenant/settings');
    currentTenantData = data;
    const { tenant, distributionPoints, departments } = data;

    if (!tenant) return;

    // 1. Actualizar títulos institucionales y cintillos
    const titleH1 = document.getElementById('brandTitleH1');
    const subtitleP = document.getElementById('brandSubtitleP');
    const logoContainer = document.getElementById('brandLogoContainer');
    const loginTitleH2 = document.querySelector('#view-login h2');
    const loginSubtitleP = document.querySelector('#view-login p');
    const loginLogoDiv = document.querySelector('#view-login div[style*="font-size: 3rem"]');
    const workersDirTitle = document.getElementById('workersDirectoryTitle');

    if (titleH1) titleH1.textContent = tenant.entity_name.toUpperCase();
    if (subtitleP) subtitleP.textContent = `${tenant.slogan || 'Gestión y Despacho de Beneficios Institucionales'} (${tenant.entity_short_name || 'MIPPCI'})`;
    if (loginTitleH2) loginTitleH2.textContent = `${tenant.entity_short_name} - ${tenant.entity_name}`;
    if (loginSubtitleP) loginSubtitleP.innerHTML = `Acceso Institucional por Rol &middot; ${tenant.slogan || 'Beneficios y Despacho'}`;
    if (workersDirTitle) workersDirTitle.textContent = `Directorio de Empleados y Padrón Institucional (${tenant.entity_short_name})`;

    // 2. Actualizar Logotipo
    if (tenant.logo_url && tenant.logo_url.trim()) {
      if (logoContainer) {
        logoContainer.innerHTML = `<img src="${tenant.logo_url}" class="brand-logo-img" alt="Logo ${tenant.entity_short_name}" />`;
      }
      if (loginLogoDiv) {
        loginLogoDiv.innerHTML = `<img src="${tenant.logo_url}" style="max-height: 70px; max-width: 180px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(2, 132, 199, 0.25));" alt="Logo Institucional" />`;
      }
      const previewBox = document.getElementById('brandingLogoPreviewContainer');
      if (previewBox) {
        previewBox.innerHTML = `<img src="${tenant.logo_url}" style="max-height: 80px; max-width: 100%; object-fit: contain;" alt="Vista Previa" />`;
      }
      const modalPreviewBox = document.getElementById('settingsLogoPreviewBox');
      if (modalPreviewBox) {
        modalPreviewBox.innerHTML = `<img src="${tenant.logo_url}" style="max-height: 70px; max-width: 100%; object-fit: contain;" alt="Vista Previa" />`;
      }
    } else {
      if (logoContainer && !logoContainer.querySelector('img')) {
        logoContainer.innerHTML = '<svg class="icon-svg icon-md" viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2l10 5H2l10-5z"/></svg>';
      }
    }

    // 3. Colores corporativos
    if (tenant.primary_color) {
      document.documentElement.style.setProperty('--sea-pacific', tenant.primary_color);
      document.documentElement.style.setProperty('--accent-primary', tenant.primary_color);
    }
    if (tenant.secondary_color) {
      document.documentElement.style.setProperty('--sea-malibu', tenant.secondary_color);
      document.documentElement.style.setProperty('--accent-secondary', tenant.secondary_color);
    }

    // 4. Llenar inputs
    const nameInput = document.getElementById('brandingEntityNameInput');
    const shortInput = document.getElementById('brandingEntityShortInput');
    const sloganInput = document.getElementById('brandingSloganInput');
    const urlInput = document.getElementById('brandingLogoUrlInput');
    const primaryInput = document.getElementById('brandingPrimaryColorInput');
    const secondaryInput = document.getElementById('brandingSecondaryColorInput');

    if (nameInput) nameInput.value = tenant.entity_name || '';
    if (shortInput) shortInput.value = tenant.entity_short_name || '';
    if (sloganInput) sloganInput.value = tenant.slogan || '';
    const cleanUrl = (tenant.logo_url && !tenant.logo_url.startsWith('data:')) ? tenant.logo_url : '';
    if (urlInput) urlInput.value = cleanUrl;
    if (primaryInput && tenant.primary_color) primaryInput.value = tenant.primary_color;
    if (secondaryInput && tenant.secondary_color) secondaryInput.value = tenant.secondary_color;

    // 5. Poblar selects dependientes
    const deptSelect = document.getElementById('newWorkerDepartment');
    if (deptSelect && departments) {
      deptSelect.innerHTML = '<option value="">-- Sin Departamento Asignado --</option>';
      departments.forEach(d => {
        deptSelect.innerHTML += `<option value="${d.id}">${d.name} (${d.code})</option>`;
      });
    }

    if (distributionPoints && typeof reloadDistributionPoints === 'function') {
      reloadDistributionPoints();
    }

    const isSupervisorQr = Boolean(tenant.supervisor_qr_mode === 1 || tenant.supervisor_qr_mode === true);
    updateValidationModeUI(isSupervisorQr);

  } catch (err) {
    console.warn('Error al cargar configuración del ente:', err);
  }
};

window.updateValidationModeUI = function(isSupervisorQrMode) {
  STATE.supervisor_qr_mode = Boolean(isSupervisorQrMode);

  const switchEl = document.getElementById('switchSupervisorQrMode');
  const track = document.getElementById('toggleTrack');
  const knob = document.getElementById('toggleKnob');
  const badge = document.getElementById('validationModeBadge');
  const explanation = document.getElementById('validationModeExplanation');

  const distBadge = document.getElementById('distributorValidationModeBadge');
  const distText = document.getElementById('distributorStandbyText');
  const btnNfc = document.getElementById('btnSimulateNfcTap');
  const btnSupQr = document.getElementById('btnSimulateSupervisorDailyQr');
  const btnDistSupModal = document.getElementById('btnDistributorShowSupervisorQr');

  if (switchEl) switchEl.checked = STATE.supervisor_qr_mode;

  if (STATE.supervisor_qr_mode) {
    if (track) track.style.backgroundColor = '#0284c7';
    if (knob) knob.style.transform = 'translateX(20px)';
    if (badge) {
      badge.textContent = '🔑 QR Diario Supervisor ACTIVO';
      badge.style.background = '#e0f2fe';
      badge.style.color = '#0284c7';
      badge.style.border = '1px solid #bae6fd';
    }
    if (explanation) {
      explanation.innerHTML = '🔑 <strong>Modo Actual:</strong> Validación mediante <strong>Código QR Diario del Supervisor</strong> en posesión de mesa para beneficiarios sin smartphone. (Tarjetas NFC desactivadas).';
      explanation.style.background = '#f0fdf4';
      explanation.style.borderColor = '#bbf7d0';
      explanation.style.color = '#15803d';
    }
    if (distBadge) {
      distBadge.textContent = '🔑 Modo: QR Supervisor Diario';
      distBadge.style.background = 'rgba(2, 132, 199, 0.2)';
      distBadge.style.color = '#38bdf8';
      distBadge.style.border = '1px solid rgba(56, 189, 248, 0.4)';
    }
    if (distText) {
      distText.textContent = 'Enfoque el QR del trabajador o valide con el Código QR Diario del Supervisor para beneficiarios sin smartphone.';
    }
    if (btnNfc) btnNfc.style.display = 'none';
    if (btnSupQr) btnSupQr.style.display = 'inline-block';
    if (btnDistSupModal) btnDistSupModal.style.display = 'block';
  } else {
    if (track) track.style.backgroundColor = '#cbd5e1';
    if (knob) knob.style.transform = 'translateX(0px)';
    if (badge) {
      badge.textContent = '💳 Modo NFC Físico ACTIVO';
      badge.style.background = '#f1f5f9';
      badge.style.color = '#475569';
      badge.style.border = '1px solid #cbd5e1';
    }
    if (explanation) {
      explanation.innerHTML = 'ℹ️ <strong>Modo Actual:</strong> Se requiere tarjeta NFC física asignada al beneficiario para retirar en mesa.';
      explanation.style.background = '#f0f9ff';
      explanation.style.borderColor = '#bae6fd';
      explanation.style.color = '#0369a1';
    }
    if (distBadge) {
      distBadge.textContent = '💳 Modo: Tarjetas NFC';
      distBadge.style.background = 'rgba(56, 189, 248, 0.15)';
      distBadge.style.color = '#38bdf8';
      distBadge.style.border = '1px solid rgba(56, 189, 248, 0.3)';
    }
    if (distText) {
      distText.textContent = 'Enfoque el código QR dinámico del trabajador o acerque la tarjeta NFC física.';
    }
    if (btnNfc) btnNfc.style.display = 'inline-block';
    if (btnSupQr) btnSupQr.style.display = 'none';
    if (btnDistSupModal) btnDistSupModal.style.display = 'none';
  }
};

window.setupValidationModeToggle = function() {
  const switchEl = document.getElementById('switchSupervisorQrMode');
  if (!switchEl) return;

  switchEl.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    updateValidationModeUI(isChecked);

    try {
      const data = await API.post('/api/v1/tenant/settings/validation-mode', { supervisor_qr_mode: isChecked });
      STATE.supervisor_qr_mode = Boolean(data.supervisor_qr_mode);
      updateValidationModeUI(STATE.supervisor_qr_mode);
      playAudioFeedback('success');
      window.showToast(`⚙️ Configuración: ${data.message}`, 'success');
    } catch (err) {
      window.showToast('Error cambiando modo de validación: ' + err.message, 'error');
      updateValidationModeUI(!isChecked);
    }
  });
};

window.loadAndShowSupervisorDailyQrModal = async function() {
  const modal = document.getElementById('supervisorDailyQrModalBackdrop');
  if (!modal) return;

  try {
    const data = await API.get('/api/v1/supervisor/daily-qr');
    if (!data.success) throw new Error(data.error || 'No se pudo generar QR de supervisor');

    const qrContainer = document.getElementById('targetSupervisorDailyQr');
    const authCodeEl = document.getElementById('supervisorAuthCodeDisplay');
    const nameEl = document.getElementById('supervisorNameDisplay');
    const docEl = document.getElementById('supervisorDocDisplay');
    const dateEl = document.getElementById('supervisorDailyQrDate');
    const expiryEl = document.getElementById('supervisorExpiryDisplay');

    if (authCodeEl) authCodeEl.textContent = data.auth_code;
    if (nameEl) nameEl.textContent = data.supervisor.full_name;
    if (docEl) docEl.textContent = data.supervisor.document_id;
    if (dateEl) dateEl.textContent = `Fecha de Operación: ${data.date}`;
    if (expiryEl) expiryEl.textContent = `Válido hoy hasta las 23:59:59 (${data.date})`;

    STATE.activeSupervisorQrPayload = data.qr_payload;

    if (qrContainer) {
      qrContainer.innerHTML = '';
      if (window.QRCodeGenerator && typeof window.QRCodeGenerator.render === 'function') {
        window.QRCodeGenerator.render('targetSupervisorDailyQr', data.qr_payload);
      }
    }

    modal.classList.add('active');
  } catch (err) {
    window.showToast('Error generando QR del supervisor: ' + err.message, 'error');
  }
};

window.setupSupervisorDailyQrModal = function() {
  const modal = document.getElementById('supervisorDailyQrModalBackdrop');
  const btnOpen = document.getElementById('btnOpenSupervisorDailyQrModal');
  const btnClose = document.getElementById('btnCloseSupervisorDailyQrModal');
  const btnCloseBtn = document.getElementById('btnCloseSupervisorDailyQrModalBtn');
  const btnCopy = document.getElementById('btnCopySupervisorDailyQrToken');
  const btnPrint = document.getElementById('btnPrintSupervisorDailyQr');

  btnOpen?.addEventListener('click', loadAndShowSupervisorDailyQrModal);

  const closeModal = () => modal?.classList.remove('active');
  btnClose?.addEventListener('click', closeModal);
  btnCloseBtn?.addEventListener('click', closeModal);

  btnCopy?.addEventListener('click', () => {
    if (STATE.activeSupervisorQrPayload) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(STATE.activeSupervisorQrPayload);
      }
      window.showToast('📋 Código de autorización copiado al portapapeles.', 'success');
    }
  });

  btnPrint?.addEventListener('click', () => {
    window.print();
  });
};

window.setupTenantBranding = function() {
  const form = document.getElementById('brandingForm');
  const btnSelectFile = document.getElementById('btnSelectLogoFile');
  const fileInput = document.getElementById('brandingLogoFileInput');
  const previewBox = document.getElementById('brandingLogoPreviewContainer');
  const urlInput = document.getElementById('brandingLogoUrlInput');
  const primaryInput = document.getElementById('brandingPrimaryColorInput');
  const secondaryInput = document.getElementById('brandingSecondaryColorInput');
  const alertBox = document.getElementById('brandingAlertBox');
  const btnOpenBranding = document.getElementById('btnOpenBrandingModal');
  const btnReset = document.getElementById('btnResetBrandingDefaults');

  btnOpenBranding?.addEventListener('click', () => {
    navigateTo('view-portal');
    const brandingTabBtn = document.querySelector('.portal-subtab[data-subtab="subtab-branding"]');
    if (brandingTabBtn) brandingTabBtn.click();
  });

  btnSelectFile?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      window.showToast('Por favor seleccione un archivo de imagen válido (PNG, JPG, SVG).', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      if (previewBox) {
        previewBox.innerHTML = `<img src="${base64}" style="max-height: 80px; max-width: 100%; object-fit: contain;" alt="Vista Previa" />`;
      }
      previewBox.dataset.base64 = base64;
      if (urlInput) urlInput.value = '';
    };
    reader.readAsDataURL(file);
  });

  urlInput?.addEventListener('input', () => {
    const url = urlInput.value.trim();
    if (url && previewBox) {
      previewBox.innerHTML = `<img src="${url}" style="max-height: 80px; max-width: 100%; object-fit: contain;" alt="Preview" />`;
      delete previewBox.dataset.base64;
    }
  });

  primaryInput?.addEventListener('input', () => {
    document.documentElement.style.setProperty('--sea-pacific', primaryInput.value);
    document.documentElement.style.setProperty('--accent-primary', primaryInput.value);
  });

  secondaryInput?.addEventListener('input', () => {
    document.documentElement.style.setProperty('--sea-malibu', secondaryInput.value);
    document.documentElement.style.setProperty('--accent-secondary', secondaryInput.value);
  });

  btnReset?.addEventListener('click', () => {
    if (!confirm('¿Restablecer la identidad institucional a los valores estándar de MIPPCI?')) return;
    document.getElementById('brandingEntityNameInput').value = 'Ministerio del Poder Popular para la Comunicación y la Información';
    document.getElementById('brandingEntityShortInput').value = 'MIPPCI';
    document.getElementById('brandingSloganInput').value = 'Bienestar y Soberanía Alimentaria Institucional';
    document.getElementById('brandingLogoUrlInput').value = '';
    primaryInput.value = '#0284c7';
    secondaryInput.value = '#0ea5e9';
    if (previewBox) {
      previewBox.innerHTML = '<span style="font-size: 2.5rem;">🏛️</span>';
      delete previewBox.dataset.base64;
    }
    document.documentElement.style.setProperty('--sea-pacific', '#0284c7');
    document.documentElement.style.setProperty('--accent-primary', '#0284c7');
    document.documentElement.style.setProperty('--sea-malibu', '#0ea5e9');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entity_name = document.getElementById('brandingEntityNameInput')?.value.trim();
    const entity_short_name = document.getElementById('brandingEntityShortInput')?.value.trim();
    const slogan = document.getElementById('brandingSloganInput')?.value.trim();
    const primary_color = primaryInput?.value;
    const secondary_color = secondaryInput?.value;
    const logo_url = previewBox?.dataset?.base64 || urlInput?.value.trim() || '';

    try {
      const data = await API.post('/api/v1/tenant/settings', {
        entity_name,
        entity_short_name,
        slogan,
        logo_url,
        primary_color,
        secondary_color
      });

      if (alertBox) {
        alertBox.textContent = `✅ ${data.message}`;
        alertBox.style.display = 'block';
        setTimeout(() => { alertBox.style.display = 'none'; }, 4000);
      }

      await loadTenantSettings();
      playAudioFeedback('success');
      window.showToast('Configuración institucional guardada exitosamente', 'success');

    } catch (err) {
      window.showToast('Error guardando configuración: ' + err.message, 'error');
    }
  });
};

function getWhatsAppShareTemplates() {
  const origin = window.location.origin || `${window.location.protocol}//${window.location.host}`;
  const entityName = currentTenantData?.tenant?.entity_name || 'Ministerio del Poder Popular para la Comunicación y la Información';
  const entityShort = currentTenantData?.tenant?.entity_short_name || 'MIPPCI';

  let workerGreeting = 'Estimado(a) trabajador(a):';
  let workerDeepUrl = `${origin}/?view=worker`;
  if (activeWaCustomWorker) {
    workerGreeting = `Estimado(a) *${activeWaCustomWorker.full_name}* (C.I. *${activeWaCustomWorker.document_id}*):`;
    workerDeepUrl = `${origin}/?view=worker&doc=${encodeURIComponent(activeWaCustomWorker.document_id)}`;
  }

  return {
    worker: {
      title: 'Portal del Beneficiario (PWA)',
      url: workerDeepUrl,
      message:
`🏛️ *${entityShort} - ${entityName}*
📦 *SISTEMA DE BIENESTAR SOCIAL Y BENEFICIOS INSTITUCIONALES*

${workerGreeting}
Por favor ingrese al siguiente enlace oficial para verificar su combo alimentario asignado, enrolar su biometría (Face ID / Huella dactilar) y generar su Código QR de retiro:

👉 *Acceso Directo:* ${workerDeepUrl}

*Instrucciones de Retiro:*
1️⃣ Abra el enlace en su smartphone.
2️⃣ Ingrese su número de Cédula de Identidad.
3️⃣ Enrole su Passkey biométrica con su huella o rostro.
4️⃣ Presente el código QR dinámico en la Mesa de Despacho del Comedor.

_Nota: Si es adulto mayor o jubilado, puede retirar directamente en mesa con su Tarjeta NFC física o validación asistida._`
    },
    distributor: {
      title: 'Mesa de Despacho (Operador)',
      url: `${origin}/?view=distributor`,
      message:
`🏛️ *${entityShort} - Mesa de Despacho y Entrega*
📦 *MÓDULO DE VALIDACIÓN Y CONTROL DE COMEDOR*

Estimado operador de almacén / mesa de entrega:
Utilice este enlace en la tablet o computadora de despacho para validar códigos QR con la cámara física, escanear tarjetas NFC y autorizar entregas institucionales en modo 100% Offline:

👉 *Mesa de Despacho:* ${origin}/?view=distributor`
    },
    supervisor: {
      title: 'Aprobación del Supervisor',
      url: `${origin}/?view=portal&tab=supervision`,
      message:
`🏛️ *${entityShort} - Supervisión de Entrega*
🔑 *CÓDIGO QR DIARIO DEL SUPERVISOR DE BIENESTAR*

Estimado(a) supervisor(a) institucional:
Acceda al portal de supervisión para generar el Código QR Diario de contingencia o autorizar excepciones de despacho para beneficiarios sin smartphone:

👉 *Portal de Supervisión:* ${origin}/?view=portal&tab=supervision`
    }
  };
}

function updateWhatsAppModalContent() {
  const templates = getWhatsAppShareTemplates();
  const current = templates[activeWaShareRole] || templates.worker;

  const previewBox = document.getElementById('waMessagePreviewContainer');
  const urlDisplay = document.getElementById('waDirectUrlDisplay');
  const roleDescText = document.getElementById('waRoleDescriptionText');

  if (previewBox) previewBox.textContent = current.message;
  if (urlDisplay) urlDisplay.value = current.url;

  if (roleDescText) {
    if (activeWaShareRole === 'worker') {
      roleDescText.textContent = activeWaCustomWorker 
        ? `Enlace personalizado para ${activeWaCustomWorker.full_name} (${activeWaCustomWorker.document_id}) con cédula pre-cargada para enrolar Passkey.`
        : 'Enlace dirigido a trabajadores del ministerio para instalar la aplicación en su smartphone, enrolar su Passkey biométrica y generar su código QR de retiro.';
    } else if (activeWaShareRole === 'distributor') {
      roleDescText.textContent = 'Enlace de acceso a la Mesa de Despacho para operadores con escáner de cámara en vivo y modo offline.';
    } else {
      roleDescText.textContent = 'Enlace para el Supervisor institucional para emitir el Código QR Diario de autorización en mesa.';
    }
  }

  document.querySelectorAll('.wa-role-tab').forEach(btn => {
    if (btn.dataset.tab === activeWaShareRole) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

window.setupWhatsAppShareSystem = function() {
  const modal = document.getElementById('whatsappShareModalBackdrop');
  if (!modal) return;

  const btnOpenHeader = document.getElementById('btnHeaderWhatsAppShare');
  const btnOpenMenu = document.getElementById('btnUserMenuWhatsAppShare');
  const btnOpenWorkers = document.getElementById('btnOpenWhatsAppShareModal');
  const btnClose = document.getElementById('btnCloseWhatsAppShareModal');
  const phoneInput = document.getElementById('waRecipientPhoneInput');
  const btnClearPhone = document.getElementById('btnClearWaPhone');
  const btnCopyFullMsg = document.getElementById('btnCopyWaFullMessage');
  const btnCopyUrl = document.getElementById('btnCopyWaDirectUrl');
  const btnLaunch = document.getElementById('btnLaunchWhatsApp');
  const tabBtns = document.querySelectorAll('.wa-role-tab');

  const openModal = (defaultRole = 'worker', workerData = null) => {
    activeWaShareRole = defaultRole;
    activeWaCustomWorker = workerData;
    if (phoneInput) {
      phoneInput.value = (workerData && workerData.phone_number) ? workerData.phone_number : '';
    }
    updateWhatsAppModalContent();
    modal.classList.add('active');
  };

  const closeModal = () => {
    modal.classList.remove('active');
    activeWaCustomWorker = null;
  };

  window.openWhatsAppShareModal = openModal;
  window.closeWhatsAppShareModal = closeModal;

  btnOpenHeader?.addEventListener('click', () => openModal('worker'));
  btnOpenMenu?.addEventListener('click', () => openModal('worker'));
  btnOpenWorkers?.addEventListener('click', () => openModal('worker'));
  btnClose?.addEventListener('click', closeModal);

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeWaShareRole = btn.dataset.tab;
      activeWaCustomWorker = null;
      updateWhatsAppModalContent();
    });
  });

  btnClearPhone?.addEventListener('click', () => {
    if (phoneInput) {
      phoneInput.value = '';
      phoneInput.focus();
    }
  });

  btnCopyUrl?.addEventListener('click', async () => {
    const templates = getWhatsAppShareTemplates();
    const current = templates[activeWaShareRole] || templates.worker;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(current.url);
      }
      btnCopyUrl.textContent = '✅ Enlace Copiado';
      playAudioFeedback('success');
      setTimeout(() => { btnCopyUrl.textContent = '🔗 Copiar Enlace'; }, 2000);
    } catch (e) {
      window.showToast('Enlace: ' + current.url, 'info');
    }
  });

  btnCopyFullMsg?.addEventListener('click', async () => {
    const templates = getWhatsAppShareTemplates();
    const current = templates[activeWaShareRole] || templates.worker;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(current.message);
      }
      btnCopyFullMsg.textContent = '✅ Mensaje Copiado';
      playAudioFeedback('success');
      setTimeout(() => { btnCopyFullMsg.textContent = '📋 Copiar Mensaje Completo'; }, 2500);
    } catch (e) {
      window.showToast('Seleccione el texto para copiarlo', 'info');
    }
  });

  btnLaunch?.addEventListener('click', () => {
    const templates = getWhatsAppShareTemplates();
    const current = templates[activeWaShareRole] || templates.worker;
    const phoneVal = phoneInput ? phoneInput.value.trim().replace(/\D/g, '') : '';
    const encodedText = encodeURIComponent(current.message);

    let waUrl = phoneVal
      ? `https://api.whatsapp.com/send?phone=${phoneVal}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    playAudioFeedback('success');
    window.open(waUrl, '_blank');
  });

  window.sendWhatsAppInviteToWorker = async function(workerId) {
    try {
      const data = await API.get(`/api/v1/admin/workers/${workerId}/security-dossier`);
      if (!data.worker) throw new Error('Beneficiario no encontrado');
      openModal('worker', data.worker);
    } catch (err) {
      window.showToast('Error cargando beneficiario: ' + err.message, 'error');
    }
  };
};

window.handleUrlDeepLinks = function() {
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view');
  const docParam = params.get('doc');
  const tabParam = params.get('tab');

  if (docParam) {
    const docInput = document.getElementById('loginDocNumber');
    const docType = document.getElementById('loginDocType');
    if (docInput) {
      let cleanDoc = docParam.trim();
      if (cleanDoc.toUpperCase().startsWith('V-') || cleanDoc.toUpperCase().startsWith('E-')) {
        if (docType) docType.value = cleanDoc.substring(0, 1).toUpperCase();
        cleanDoc = cleanDoc.substring(2);
      }
      docInput.value = cleanDoc;
    }
  }

  if (viewParam) {
    if (viewParam === 'worker') {
      if (STATE.currentUser && STATE.currentUser.role === 'worker') {
        navigateTo('view-worker');
      } else if (!STATE.currentUser) {
        navigateTo('view-login');
        const alertBox = document.getElementById('loginAlertBox');
        if (alertBox) {
          alertBox.className = 'alert-box alert-info';
          alertBox.innerHTML = `📲 <strong>Bienvenido al Portal del Beneficiario (MIPPCI):</strong><br>Ingrese su Cédula abajo para enrolar su huella/rostro y generar su QR de retiro.`;
          alertBox.style.display = 'block';
        }
      } else {
        navigateTo('view-worker');
      }
    } else if (viewParam === 'distributor') {
      const isOperatorRole = STATE.currentUser && (
        STATE.currentUser.role === 'operator' || 
        STATE.currentUser.role === 'distributor' || 
        STATE.currentUser.role === 'admin' || 
        STATE.currentUser.role === 'director' || 
        STATE.currentUser.role === 'supervisor'
      );

      if (isOperatorRole) {
        sessionStorage.setItem('sgbt_session_view_mode', 'operator');
        if (typeof applyUserSession === 'function') {
          applyUserSession(STATE.currentUser, 'operator');
        } else {
          navigateTo('view-distributor');
        }
      } else if (!STATE.currentUser) {
        sessionStorage.setItem('sgbt_intended_view', 'distributor');
        navigateTo('view-login');
        const alertBox = document.getElementById('loginAlertBox');
        if (alertBox) {
          alertBox.className = 'alert-box alert-info';
          alertBox.innerHTML = `📦 <strong>Mesa de Despacho (Distribución y Validación):</strong><br>Ingrese su Cédula de Identidad de operador para acceder al módulo de escaneo de QR y entregas de víveres.`;
          alertBox.style.display = 'block';
        }
        const badgeStatus = document.getElementById('loginBadgeStatus');
        if (badgeStatus) {
          badgeStatus.textContent = '📦 Mesa de Despacho · Validación y Entregas';
          badgeStatus.style.background = '#fef3c7';
          badgeStatus.style.color = '#b45309';
        }
      } else {
        navigateTo('view-worker');
        if (typeof window.showToast === 'function') {
          window.showToast('Su usuario está autenticado como Beneficiario Titular. Para operar la Mesa de Despacho, debe ingresar con un usuario designado como Operador.', 'warning');
        }
      }
    } else if (viewParam === 'portal') {
      if (STATE.currentUser && (STATE.currentUser.role === 'admin' || STATE.currentUser.role === 'director' || STATE.currentUser.role === 'supervisor')) {
        navigateTo('view-portal');
        if (tabParam) {
          const subtabBtn = document.querySelector(`.portal-subtab[data-subtab="subtab-${tabParam}"]`);
          if (subtabBtn) subtabBtn.click();
        }
      } else if (!STATE.currentUser) {
        navigateTo('view-login');
      } else {
        navigateTo('view-portal');
      }
    }
  }
};

window.openDelegationModal = function() {
  const modal = document.getElementById('delegationModalBackdrop');
  if (modal) {
    modal.classList.add('active');
    const formSec = document.getElementById('delegationFormSection');
    const resSec = document.getElementById('delegationResultSection');
    if (formSec) formSec.style.display = 'block';
    if (resSec) resSec.style.display = 'none';
  }
};

window.closeDelegationModal = function() {
  const modal = document.getElementById('delegationModalBackdrop');
  if (modal) modal.classList.remove('active');
};

window.setupDelegationModal = function() {
  const btnClose = document.getElementById('btnCloseDelegationModal');
  const btnGenerate = document.getElementById('btnGenerateDelegationQr');
  const btnReset = document.getElementById('btnResetDelegationForm');
  const btnShareWa = document.getElementById('btnShareDelegationWhatsApp');

  btnClose?.addEventListener('click', window.closeDelegationModal);

  let activeDelegationPayload = null;

  btnGenerate?.addEventListener('click', async () => {
    const benDoc = document.getElementById('delegationBeneficiaryDoc')?.value.trim();
    const delDoc = document.getElementById('delegationDelegateDoc')?.value.trim();
    const delName = document.getElementById('delegationDelegateName')?.value.trim();
    const reason = document.getElementById('delegationReasonSelect')?.value || 'reposo_medico';
    const hours = document.getElementById('delegationHoursSelect')?.value || '24';

    if (!benDoc || !delDoc) {
      window.showToast('Ingrese las Cédulas del titular y del compañero delegado', 'warning');
      return;
    }

    btnGenerate.disabled = true;
    btnGenerate.textContent = '⏳ Emitiendo autorización segura...';

    try {
      const data = await API.post('/api/v1/auth/supervisor/delegate', {
        beneficiary_doc: benDoc,
        delegate_doc: delDoc,
        delegate_name: delName,
        supervisor_id: STATE.currentUser?.id,
        reason,
        valid_hours: hours
      });

      if (!data.success) {
        throw new Error(data.error || 'Error al generar delegación');
      }

      activeDelegationPayload = data.delegation;
      playAudioFeedback('success');
      window.showToast(data.message, 'success');

      // Mostrar QR generado
      const formSec = document.getElementById('delegationFormSection');
      const resSec = document.getElementById('delegationResultSection');
      const summary = document.getElementById('delegationResultSummary');
      const qrDisplay = document.getElementById('delegationQrDisplay');

      if (summary) {
        summary.innerHTML = `
          Titular: <strong>${data.delegation.beneficiary_name}</strong> (${data.delegation.beneficiary_doc})<br>
          Retira Delegado: <strong>${data.delegation.delegate_name}</strong> (${data.delegation.delegate_doc})<br>
          Válido hasta: <span class="text-mono" style="color: #0284c7;">${new Date(data.delegation.valid_until).toLocaleString('es-VE')}</span>
        `;
      }

      if (qrDisplay) {
        qrDisplay.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
          new QRCode(qrDisplay, {
            text: data.qr_string,
            width: 220,
            height: 220,
            colorDark: '#040d16',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      }

      if (formSec) formSec.style.display = 'none';
      if (resSec) resSec.style.display = 'block';

    } catch (err) {
      console.error('Error generando delegación:', err);
      playAudioFeedback('error');
      window.showToast(err.message || 'Error generando delegación', 'error');
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.textContent = '⚡ Emitir Autorización con QR Firmado (Supervisor)';
    }
  });

  btnReset?.addEventListener('click', () => {
    const formSec = document.getElementById('delegationFormSection');
    const resSec = document.getElementById('delegationResultSection');
    if (formSec) formSec.style.display = 'block';
    if (resSec) resSec.style.display = 'none';
  });

  btnShareWa?.addEventListener('click', () => {
    if (!activeDelegationPayload) return;
    const msg = `🏛️ *AUTORIZACIÓN OFICIAL DE RETIRO DE VÍVERES Y PROTEÍNAS (MIPPCI)*\n\n` +
      `Estimado(a) *${activeDelegationPayload.delegate_name}* (C.I. *${activeDelegationPayload.delegate_doc}*):\n` +
      `Usted ha sido formalmente comisionado(a) y autorizado(a) por la Dirección de Gestión Humana para retirar el combo alimentario del funcionario titular:\n\n` +
      `👤 *Titular:* ${activeDelegationPayload.beneficiary_name} (${activeDelegationPayload.beneficiary_doc})\n` +
      `📋 *Motivo Justificado:* ${activeDelegationPayload.reason}\n` +
      `⏳ *Vigencia:* Hasta ${new Date(activeDelegationPayload.valid_until).toLocaleString('es-VE')}\n\n` +
      `Presente esta confirmación o el código QR en la Mesa de Despacho de Comedor para la entrega inmediata.`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  });
};
