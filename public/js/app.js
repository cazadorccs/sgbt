// ============================================================================
// BIO-COMBOS PLATAFORMA INTEGRAL - CLIENTE Y SIMULADOR
// ============================================================================

const STATE = {
  isOnline: true,
  currentView: 'view-login',
  currentSubtab: 'subtab-dashboard',
  currentUser: null,
  selectedWorkerId: null,
  activeQrPayload: null,
  qrTimerInterval: null,
  localCache: {
    workers: [],
    publicKeys: {},
    nfcCards: {},
    entitlements: {},
    deliveredEntitlements: new Set(),
    syncQueue: []
  },
  operatorOverridesCount: 0,
  supervisorId: '8022233344', // Lic. Claudia Patricia Vega (Supervisor)
  operatorId: 'd1112222-3333-4444-5555-666677778888' // Miguel Ángel Torres (Operador)
};

// Web Audio API Synth para feedback auditivo de comedor industrial
function playAudioFeedback(type = 'success') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
      osc.frequency.setValueAtTime(164.81, audioCtx.currentTime + 0.15); // E3
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    }
  } catch (e) {
    console.warn('AudioContext no disponible:', e);
  }
}

// ----------------------------------------------------------------------------
// INICIALIZACIÓN
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupGeneralSettings();
  setupNetworkToggle();
  setupWorkerSimulator();
  setupDistributorSimulator();
  setupPayrollSimulator();
  initCombosManagement();
  checkSystemDbStatus();
  setupPwa();
  setupAuth();
  setupUserMenuDropdown();
  initSetupWizard();

  // Cargar datos iniciales del portal
  refreshPortalData();
  // Precargar paquete diario inicial para el distribuidor
  downloadDailyPack();

  // Inicializar características Enterprise B2G (Marca Blanca, Nómina, Jornadas y Notificaciones)
  initEnterpriseFeatures();

  // Verificar si hay sesión activa o ir a Login
  checkAuthSession();
});

// Chequeo de Motor de Base de Datos (Supabase Cloud vs. SQLite Local) & Estado de Inicialización
async function checkSystemDbStatus() {
  try {
    const res = await fetch('/api/v1/system/status');
    const data = await res.json();
    const pill = document.getElementById('dbStatusPill');
    const text = document.getElementById('dbStatusText');
    if (pill && text) {
      if (data.database_engine === 'supabase_cloud') {
        text.textContent = `🟢 Supabase Cloud (${data.supabase_details?.latencyMs || 25}ms)`;
        pill.style.borderColor = 'rgba(16, 185, 129, 0.6)';
        pill.style.color = '#34d399';
      } else {
        text.textContent = '💾 SQLite Local (Offline-Ready)';
        pill.style.borderColor = 'rgba(102, 204, 255, 0.4)';
        pill.style.color = 'var(--sea-onahau)';
      }
    }

    // Comprobar si el sistema está pendiente de inicialización (Puesta a Cero)
    const setupBanner = document.getElementById('setupPendingBanner');
    if (data.is_initialized === false) {
      if (setupBanner) setupBanner.style.display = 'block';
      // Si no hay usuario activo, dirigir automáticamente al Asistente de Configuración
      if (!STATE.currentUser) {
        navigateTo('view-setup-wizard');
      }
    } else {
      if (setupBanner) setupBanner.style.display = 'none';
    }
  } catch (e) {
    console.warn('No se pudo consultar estado de la BD:', e);
  }
}

// Checklist interactivo de entrega de bultos
window.toggleChecklistItem = function(cardEl) {
  if (!cardEl) return;
  cardEl.classList.toggle('checked');
};

// ============================================================================
// CONFIGURACIÓN GENERAL & ACCESIBILIDAD (ALTO CONTRASTE / FUENTE GRANDE)
// ============================================================================
function setupGeneralSettings() {
  const btnOpen = document.getElementById('btnOpenGeneralSettings');
  const modalBackdrop = document.getElementById('generalSettingsModalBackdrop');
  const btnClose = document.getElementById('btnCloseGeneralSettingsModal');
  const btnApply = document.getElementById('btnApplyGeneralSettings');
  const toggleHighContrast = document.getElementById('toggleHighContrastSetting');
  const labelStatus = document.getElementById('labelHighContrastStatus');
  const btnMobileToggle = document.getElementById('btnDeviceAccessibilityToggle');

  function applyHighContrast(enabled, save = true) {
    if (enabled) {
      document.body.classList.add('senior-accessible-mode');
    } else {
      document.body.classList.remove('senior-accessible-mode');
    }

    if (toggleHighContrast) {
      toggleHighContrast.checked = !!enabled;
    }

    if (labelStatus) {
      labelStatus.textContent = enabled ? 'Activado' : 'Desactivado';
      labelStatus.style.color = enabled ? '#0284c7' : '#64748b';
    }

    if (btnMobileToggle) {
      btnMobileToggle.textContent = enabled ? '👓 Normal' : '👁️ Grande';
    }

    if (save) {
      try {
        localStorage.setItem('sgbt_high_contrast', enabled ? 'true' : 'false');
      } catch (e) {
        console.warn('No se pudo guardar la preferencia de accesibilidad:', e);
      }
    }
  }

  // Restaurar preferencia almacenada
  try {
    const isSavedHighContrast = localStorage.getItem('sgbt_high_contrast') === 'true';
    if (isSavedHighContrast) {
      applyHighContrast(true, false);
    }
  } catch (e) {
    console.warn('Error leyendo localStorage de accesibilidad:', e);
  }

  // Toggle Switch dentro del Modal de Configuración General
  toggleHighContrast?.addEventListener('change', (e) => {
    applyHighContrast(e.target.checked, true);
  });

  // Tabs internas del Modal de Configuración
  const tabBrandingBtn = document.getElementById('btnSettingsTabBranding');
  const tabPreferencesBtn = document.getElementById('btnSettingsTabPreferences');
  const tabDangerBtn = document.getElementById('btnSettingsTabDanger');
  const sectionBranding = document.getElementById('settingsSectionBranding');
  const sectionPreferences = document.getElementById('settingsSectionPreferences');
  const sectionDanger = document.getElementById('settingsSectionDanger');

  tabBrandingBtn?.addEventListener('click', () => {
    tabBrandingBtn.classList.add('active');
    tabPreferencesBtn?.classList.remove('active');
    tabDangerBtn?.classList.remove('active');
    if (sectionBranding) sectionBranding.style.display = 'block';
    if (sectionPreferences) sectionPreferences.style.display = 'none';
    if (sectionDanger) sectionDanger.style.display = 'none';
  });

  tabPreferencesBtn?.addEventListener('click', () => {
    tabPreferencesBtn.classList.add('active');
    tabBrandingBtn?.classList.remove('active');
    tabDangerBtn?.classList.remove('active');
    if (sectionPreferences) sectionPreferences.style.display = 'block';
    if (sectionBranding) sectionBranding.style.display = 'none';
    if (sectionDanger) sectionDanger.style.display = 'none';
  });

  tabDangerBtn?.addEventListener('click', () => {
    tabDangerBtn.classList.add('active');
    tabBrandingBtn?.classList.remove('active');
    tabPreferencesBtn?.classList.remove('active');
    if (sectionDanger) sectionDanger.style.display = 'block';
    if (sectionBranding) sectionBranding.style.display = 'none';
    if (sectionPreferences) sectionPreferences.style.display = 'none';
  });

  // Selector de Archivo de Logotipo en Modal de Configuración
  const modalLogoBtn = document.getElementById('btnSettingsSelectLogo');
  const modalLogoFileInput = document.getElementById('settingsLogoFileInput');
  const modalLogoPreviewBox = document.getElementById('settingsLogoPreviewBox');
  const modalLogoUrlInput = document.getElementById('settingsLogoUrlInput');
  const modalPrimaryColorInput = document.getElementById('settingsPrimaryColorInput');
  const modalSecondaryColorInput = document.getElementById('settingsSecondaryColorInput');
  const modalBrandingForm = document.getElementById('settingsBrandingForm');
  const modalBrandingAlertBox = document.getElementById('settingsBrandingAlertBox');
  const modalBtnResetBranding = document.getElementById('btnSettingsResetBranding');

  modalLogoBtn?.addEventListener('click', () => modalLogoFileInput?.click());

  modalLogoFileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor seleccione un archivo de imagen válido (PNG, JPG, SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      if (modalLogoPreviewBox) {
        modalLogoPreviewBox.innerHTML = `<img src="${base64}" style="max-height: 70px; max-width: 100%; object-fit: contain;" alt="Logo Previa" />`;
      }
      modalLogoPreviewBox.dataset.base64 = base64;
      if (modalLogoUrlInput) modalLogoUrlInput.value = '';
    };
    reader.readAsDataURL(file);
  });

  modalLogoUrlInput?.addEventListener('input', () => {
    const url = modalLogoUrlInput.value.trim();
    if (url && modalLogoPreviewBox) {
      modalLogoPreviewBox.innerHTML = `<img src="${url}" style="max-height: 70px; max-width: 100%; object-fit: contain;" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='⚠️';" alt="Preview" />`;
      delete modalLogoPreviewBox.dataset.base64;
    }
  });

  modalPrimaryColorInput?.addEventListener('input', () => {
    document.documentElement.style.setProperty('--sea-pacific', modalPrimaryColorInput.value);
    document.documentElement.style.setProperty('--accent-primary', modalPrimaryColorInput.value);
  });

  modalSecondaryColorInput?.addEventListener('input', () => {
    document.documentElement.style.setProperty('--sea-malibu', modalSecondaryColorInput.value);
    document.documentElement.style.setProperty('--accent-secondary', modalSecondaryColorInput.value);
  });

  modalBtnResetBranding?.addEventListener('click', () => {
    if (!confirm('¿Restablecer la identidad institucional a los valores estándar de MIPPCI?')) return;
    document.getElementById('settingsEntityNameInput').value = 'Ministerio del Poder Popular para la Comunicación y la Información';
    document.getElementById('settingsEntityShortInput').value = 'MIPPCI';
    document.getElementById('settingsSloganInput').value = 'Bienestar y Soberanía Alimentaria Institucional';
    document.getElementById('settingsLogoUrlInput').value = '';
    if (modalPrimaryColorInput) modalPrimaryColorInput.value = '#0284c7';
    if (modalSecondaryColorInput) modalSecondaryColorInput.value = '#0ea5e9';
    if (modalLogoPreviewBox) {
      modalLogoPreviewBox.innerHTML = '<svg class="icon-svg icon-lg" style="color: #94a3b8;" viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2l10 5H2l10-5z"/></svg>';
      delete modalLogoPreviewBox.dataset.base64;
    }
    document.documentElement.style.setProperty('--sea-pacific', '#0284c7');
    document.documentElement.style.setProperty('--accent-primary', '#0284c7');
    document.documentElement.style.setProperty('--sea-malibu', '#0ea5e9');
  });

  modalBrandingForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!STATE.currentUser || STATE.currentUser.role !== 'admin') {
      alert('Acceso no autorizado: Solo los administradores pueden modificar la marca y logotipos.');
      return;
    }

    const entity_name = document.getElementById('settingsEntityNameInput')?.value.trim();
    const entity_short_name = document.getElementById('settingsEntityShortInput')?.value.trim();
    const slogan = document.getElementById('settingsSloganInput')?.value.trim();
    const primary_color = modalPrimaryColorInput?.value;
    const secondary_color = modalSecondaryColorInput?.value;
    const logo_url = modalLogoPreviewBox?.dataset?.base64 || modalLogoUrlInput?.value.trim() || '';

    try {
      const res = await fetch('/api/v1/tenant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_name,
          entity_short_name,
          slogan,
          logo_url,
          primary_color,
          secondary_color
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      if (modalBrandingAlertBox) {
        modalBrandingAlertBox.textContent = `Identidad institucional actualizada correctamente.`;
        modalBrandingAlertBox.style.display = 'block';
        setTimeout(() => { modalBrandingAlertBox.style.display = 'none'; }, 4000);
      }

      await loadTenantSettings();
      playAudioFeedback('success');

    } catch (err) {
      alert('Error guardando configuración de marca: ' + err.message);
    }
  });

  // Apertura y Cierre del Modal con verificación de rol de Administrador
  btnOpen?.addEventListener('click', () => {
    if (typeof window.closeUserMenu === 'function') {
      window.closeUserMenu();
    }
    if (!STATE.currentUser || (STATE.currentUser.role !== 'admin' && STATE.currentUser.role !== 'director')) {
      alert('Acceso restringido: El panel de Configuración y Marca Institucional solo está disponible para Administradores del Sistema.');
      return;
    }
    loadTenantSettings();
    if (modalBackdrop) {
      modalBackdrop.classList.add('active');
    }
  });

  const closeModal = () => {
    if (modalBackdrop) {
      modalBackdrop.classList.remove('active');
    }
  };

  btnClose?.addEventListener('click', closeModal);
  btnApply?.addEventListener('click', closeModal);

  // Cerrar al hacer clic en el backdrop oscuro exterior
  modalBackdrop?.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeModal();
    }
  });

  // Atajo de teclado ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop?.classList.contains('active')) {
      closeModal();
    }
  });

  // Botón rápido en la vista móvil del beneficiario (si existe)
  btnMobileToggle?.addEventListener('click', () => {
    const current = document.body.classList.contains('senior-accessible-mode');
    applyHighContrast(!current, true);
  });

  // --------------------------------------------------------------------------
  // ZONA DE PELIGRO: DESCARGA DE BACKUP Y PUESTA A CERO
  // --------------------------------------------------------------------------
  const btnDownloadBackupManual = document.getElementById('btnDownloadBackupManual');
  btnDownloadBackupManual?.addEventListener('click', () => {
    window.location.href = '/api/v1/admin/export-backup';
  });

  const modalResetConfirm = document.getElementById('factoryResetConfirmModalBackdrop');
  const btnOpenResetConfirm = document.getElementById('btnOpenFactoryResetConfirmModal');
  const btnCloseResetConfirm = document.getElementById('btnCloseFactoryResetConfirmModal');
  const btnCancelResetConfirm = document.getElementById('btnCancelFactoryResetConfirm');
  const inputResetPhrase = document.getElementById('inputFactoryResetPhrase');
  const btnExecuteResetConfirm = document.getElementById('btnExecuteFactoryResetConfirm');
  const alertResetBox = document.getElementById('factoryResetAlertBox');

  const closeResetModal = () => {
    if (modalResetConfirm) modalResetConfirm.classList.remove('active');
  };

  btnOpenResetConfirm?.addEventListener('click', () => {
    if (inputResetPhrase) inputResetPhrase.value = '';
    if (btnExecuteResetConfirm) {
      btnExecuteResetConfirm.disabled = true;
      btnExecuteResetConfirm.textContent = 'Proceder con la Puesta a Cero';
    }
    if (alertResetBox) alertResetBox.style.display = 'none';
    if (modalResetConfirm) modalResetConfirm.classList.add('active');
  });

  btnCloseResetConfirm?.addEventListener('click', closeResetModal);
  btnCancelResetConfirm?.addEventListener('click', closeResetModal);

  modalResetConfirm?.addEventListener('click', (e) => {
    if (e.target === modalResetConfirm) closeResetModal();
  });

  inputResetPhrase?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (btnExecuteResetConfirm) {
      btnExecuteResetConfirm.disabled = (val !== 'REINICIAR SISTEMA');
    }
  });

  btnExecuteResetConfirm?.addEventListener('click', async () => {
    if (inputResetPhrase?.value.trim() !== 'REINICIAR SISTEMA') return;

    btnExecuteResetConfirm.disabled = true;
    btnExecuteResetConfirm.textContent = 'Descargando backup y restableciendo...';

    try {
      // 1. Descarga automática preventiva del backup JSON
      try {
        const bkRes = await fetch('/api/v1/admin/export-backup');
        if (bkRes.ok) {
          const blob = await bkRes.blob();
          const dUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = dUrl;
          a.download = `sgbt_backup_preventivo_${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(dUrl);
        }
      } catch (errBk) {
        console.warn('Advertencia en descarga preventiva:', errBk);
      }

      // 2. Ejecutar Factory Reset en backend
      const keep_templates = document.getElementById('checkKeepTemplatesReset')?.checked ?? true;
      const res = await fetch('/api/v1/admin/factory-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phrase: 'REINICIAR SISTEMA',
          keep_templates
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al ejecutar puesta a cero.');

      // 3. Cerrar modales y limpiar sesión activa
      closeResetModal();
      closeModal();
      STATE.currentUser = null;
      try {
        localStorage.removeItem('sgbt_user');
        sessionStorage.clear();
      } catch (e) {}

      // 4. Iniciar Asistente de Configuración Inicial
      playAudioFeedback('success');
      alert('✅ Sistema restablecido a cero exitosamente. Se ha descargado un respaldo JSON preventivo en su equipo.\n\nA continuación configure la plataforma paso a paso.');

      initSetupWizard();
      navigateTo('view-setup-wizard');

    } catch (err) {
      if (alertResetBox) {
        alertResetBox.textContent = err.message;
        alertResetBox.style.display = 'block';
      }
      btnExecuteResetConfirm.disabled = false;
      btnExecuteResetConfirm.textContent = 'Proceder con la Puesta a Cero';
    }
  });
}

// ============================================================================
// ASISTENTE DE PRIMERA CONFIGURACIÓN (SETUP WIZARD - PUESTA A CERO)
// ============================================================================
let wizardCurrentStep = 1;
let wizardParsedWorkers = [];

function initSetupWizard() {
  wizardCurrentStep = 1;
  wizardParsedWorkers = [];

  const indicators = [1, 2, 3, 4, 5].map(i => document.getElementById(`wizardStepIndicator-${i}`));
  const stepContents = [1, 2, 3, 4, 5].map(i => document.getElementById(`wizardStepContent-${i}`));
  const alertBox = document.getElementById('wSetupAlertBox');

  function renderWizardStep(step) {
    wizardCurrentStep = step;
    if (alertBox) alertBox.style.display = 'none';

    indicators.forEach((ind, idx) => {
      if (!ind) return;
      const stepNum = idx + 1;
      ind.classList.remove('active', 'completed');
      if (stepNum === step) {
        ind.classList.add('active');
      } else if (stepNum < step) {
        ind.classList.add('completed');
      }
    });

    stepContents.forEach((sc, idx) => {
      if (!sc) return;
      sc.style.display = (idx + 1 === step) ? 'block' : 'none';
    });

    if (step === 5) {
      updateWizardSummary();
    }
  }

  function updateWizardSummary() {
    const adminDoc = document.getElementById('wAdminDocInput')?.value.trim() || '-';
    const adminName = document.getElementById('wAdminNameInput')?.value.trim() || '-';
    const tenantName = document.getElementById('wTenantNameInput')?.value.trim() || '-';
    const tenantShort = document.getElementById('wTenantShortInput')?.value.trim() || '-';
    const pointName = document.getElementById('wPointNameInput')?.value.trim() || '-';
    const pointCode = document.getElementById('wPointCodeInput')?.value.trim() || '-';
    const comboName = document.getElementById('wComboNameInput')?.value.trim() || '-';

    const sTenant = document.getElementById('wSummaryTenant');
    const sAdmin = document.getElementById('wSummaryAdmin');
    const sPoint = document.getElementById('wSummaryPoint');
    const sCombo = document.getElementById('wSummaryCombo');

    if (sTenant) sTenant.textContent = `${tenantName} (${tenantShort})`;
    if (sAdmin) sAdmin.textContent = `${adminName} (${adminDoc})`;
    if (sPoint) sPoint.textContent = `${pointName} (${pointCode})`;
    if (sCombo) sCombo.textContent = comboName;
  }

  // Sincronizar colores en Paso 2
  const colorPicker = document.getElementById('wTenantPrimaryColor');
  const colorHex = document.getElementById('wTenantPrimaryColorHex');
  colorPicker?.addEventListener('input', () => {
    if (colorHex) colorHex.value = colorPicker.value;
  });
  colorHex?.addEventListener('input', () => {
    if (colorPicker && /^#[0-9A-Fa-f]{6}$/.test(colorHex.value)) {
      colorPicker.value = colorHex.value;
    }
  });

  // Selector de Logo en Paso 2
  const logoFileInput = document.getElementById('wTenantLogoFileInput');
  const logoUrlInput = document.getElementById('wTenantLogoUrl');
  logoFileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (logoUrlInput) {
        logoUrlInput.value = ev.target.result;
      }
    };
    reader.readAsDataURL(file);
  });

  // Botón desde Banner de Login
  const btnBanner = document.getElementById('btnOpenWizardFromBanner');
  btnBanner?.addEventListener('click', () => {
    renderWizardStep(1);
    navigateTo('view-setup-wizard');
  });

  // Validaciones y Navegación Paso 1
  const btnNext1 = document.getElementById('btnWizardNext-1');
  btnNext1?.addEventListener('click', () => {
    const doc = document.getElementById('wAdminDocInput')?.value.trim();
    const name = document.getElementById('wAdminNameInput')?.value.trim();
    const email = document.getElementById('wAdminEmailInput')?.value.trim();

    if (!doc || !name || !email) {
      alert('Por favor complete todos los campos obligatorios del Administrador (*).');
      return;
    }
    renderWizardStep(2);
  });

  // Navegación Paso 2
  const btnPrev2 = document.getElementById('btnWizardPrev-2');
  const btnNext2 = document.getElementById('btnWizardNext-2');
  btnPrev2?.addEventListener('click', () => renderWizardStep(1));
  btnNext2?.addEventListener('click', () => {
    const name = document.getElementById('wTenantNameInput')?.value.trim();
    const shortName = document.getElementById('wTenantShortInput')?.value.trim();
    if (!name || !shortName) {
      alert('Por favor complete el nombre oficial y siglas del Ente Gubernamental (*).');
      return;
    }
    renderWizardStep(3);
  });

  // Navegación Paso 3
  const btnPrev3 = document.getElementById('btnWizardPrev-3');
  const btnNext3 = document.getElementById('btnWizardNext-3');
  btnPrev3?.addEventListener('click', () => renderWizardStep(2));
  btnNext3?.addEventListener('click', () => {
    const name = document.getElementById('wPointNameInput')?.value.trim();
    const code = document.getElementById('wPointCodeInput')?.value.trim();
    if (!name || !code) {
      alert('Por favor complete el nombre y código de la Sede de Despacho (*).');
      return;
    }
    renderWizardStep(4);
  });

  // Navegación Paso 4
  const btnPrev4 = document.getElementById('btnWizardPrev-4');
  const btnNext4 = document.getElementById('btnWizardNext-4');
  btnPrev4?.addEventListener('click', () => renderWizardStep(3));
  btnNext4?.addEventListener('click', () => {
    const name = document.getElementById('wComboNameInput')?.value.trim();
    if (!name) {
      alert('Por favor ingrese el nombre del Beneficio o Combo Inicial (*).');
      return;
    }
    renderWizardStep(5);
  });

  // Navegación Paso 5 (Atrás)
  const btnPrev5 = document.getElementById('btnWizardPrev-5');
  btnPrev5?.addEventListener('click', () => renderWizardStep(4));

  // Carga Masiva Opcional de Nómina CSV en Paso 5
  const csvInput = document.getElementById('wPayrollCsvFileInput');
  const csvStatus = document.getElementById('wPayrollFileStatus');
  csvInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          alert('El archivo CSV debe contener cabecera y registros.');
          return;
        }
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/["']/g, ''));
        
        wizardParsedWorkers = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
          const row = {};
          headers.forEach((h, idx) => { row[h] = parts[idx] || ''; });
          
          const docId = row.cedula || row.document_id || row.ci || parts[0];
          const fullName = row.nombre || row.full_name || row.nombres || parts[1];
          if (docId && fullName) {
            wizardParsedWorkers.push({
              document_id: docId.includes('-') ? docId : `V-${docId}`,
              full_name: fullName,
              email: row.email || row.correo || '',
              phone_number: row.telefono || row.phone || ''
            });
          }
        }

        if (csvStatus) {
          csvStatus.textContent = `✅ ${wizardParsedWorkers.length} beneficiarios detectados en el archivo CSV.`;
          csvStatus.style.display = 'block';
        }
      } catch (err) {
        alert('Error leyendo archivo CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Ejecución Final del Setup
  const btnFinal = document.getElementById('btnExecuteSetupFinal');
  btnFinal?.addEventListener('click', async () => {
    const adminDoc = document.getElementById('wAdminDocInput')?.value.trim();
    const adminName = document.getElementById('wAdminNameInput')?.value.trim();
    const adminEmail = document.getElementById('wAdminEmailInput')?.value.trim();
    const adminPhone = document.getElementById('wAdminPhoneInput')?.value.trim();

    const tenantName = document.getElementById('wTenantNameInput')?.value.trim();
    const tenantShort = document.getElementById('wTenantShortInput')?.value.trim();
    const tenantSlogan = document.getElementById('wTenantSloganInput')?.value.trim();
    const tenantColor = document.getElementById('wTenantPrimaryColor')?.value || '#0284c7';
    const tenantLogo = document.getElementById('wTenantLogoUrl')?.value.trim() || '';

    const pointName = document.getElementById('wPointNameInput')?.value.trim();
    const pointCode = document.getElementById('wPointCodeInput')?.value.trim();
    const pointAddress = document.getElementById('wPointAddressInput')?.value.trim();

    const comboName = document.getElementById('wComboNameInput')?.value.trim();
    const comboCat = document.getElementById('wComboCategorySelect')?.value || 'bolsa_viveres';
    const comboItems = document.getElementById('wComboItemsInput')?.value.trim();

    btnFinal.disabled = true;
    btnFinal.textContent = 'Inicializando plataforma...';
    if (alertBox) alertBox.style.display = 'none';

    try {
      const res = await fetch('/api/v1/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin: {
            document_id: adminDoc,
            full_name: adminName,
            email: adminEmail,
            phone_number: adminPhone
          },
          tenant: {
            entity_name: tenantName,
            entity_short_name: tenantShort,
            slogan: tenantSlogan,
            primary_color: tenantColor,
            logo_url: tenantLogo
          },
          distribution_point: {
            name: pointName,
            location_code: pointCode,
            address: pointAddress
          },
          combo: {
            name: comboName,
            category: comboCat,
            items_detail: comboItems
          },
          workers: wizardParsedWorkers
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al inicializar la plataforma.');

      // Ocultar banner de setup pendiente
      const setupBanner = document.getElementById('setupPendingBanner');
      if (setupBanner) setupBanner.style.display = 'none';

      // Loguear al nuevo Superadmin
      if (data.admin) {
        localStorage.setItem('sgbt_user', JSON.stringify(data.admin));
        STATE.currentUser = data.admin;
        applyUserSession(data.admin);
      }

      await loadTenantSettings();
      await loadWorkersDirectory();
      await loadCombosCatalog();

      playAudioFeedback('success');
      alert(`🎉 ¡Plataforma Inicializada con Éxito!\n\nBienvenido Administrador ${data.admin.full_name}. El sistema está en marcha en modo productivo limpio.`);

      navigateTo('view-portal');

    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message;
        alertBox.style.display = 'block';
      }
      btnFinal.disabled = false;
      btnFinal.innerHTML = `
        <svg class="icon-svg icon-xs" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        <span>🚀 Iniciar Operaciones de la Plataforma</span>
      `;
    }
  });

  renderWizardStep(1);
}

// ----------------------------------------------------------------------------
// NAVEGACIÓN & VISTAS RBAC
// ----------------------------------------------------------------------------
function navigateTo(viewId) {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  const views = document.querySelectorAll('.view-section');

  // Si el usuario es un trabajador final, restringir acceso únicamente a view-worker o view-login
  if (STATE.currentUser && STATE.currentUser.role === 'worker') {
    if (viewId !== 'view-worker' && viewId !== 'view-login') {
      viewId = 'view-worker';
    }
  }

  views.forEach(v => {
    v.classList.remove('active-view');
    if (v.id === 'view-login') {
      v.style.display = 'none';
    }
  });

  navBtns.forEach(b => b.classList.remove('active'));

  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active-view');
    if (viewId === 'view-login') {
      targetView.style.display = 'flex';
    } else {
      targetView.style.display = '';
    }
  }

  const activeBtn = document.querySelector(`.nav-tab-btn[data-view="${viewId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  STATE.currentView = viewId;

  if (viewId === 'view-portal') {
    const visibleSubtab = Array.from(document.querySelectorAll('.portal-content-block')).find(b => b.style.display !== 'none');
    if (!visibleSubtab) {
      const dashBtn = document.querySelector('.portal-subtab[data-subtab="subtab-dashboard"]');
      if (dashBtn) dashBtn.click();
    }
    refreshPortalData();
  }
}

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-tab-btn');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      navigateTo(viewId);
    });
  });

  // Subtabs del Portal
  const subtabBtns = document.querySelectorAll('.portal-subtab');
  const subtabBlocks = document.querySelectorAll('.portal-content-block');

  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtabId = btn.getAttribute('data-subtab');
      subtabBtns.forEach(b => b.classList.remove('active'));
      subtabBlocks.forEach(sb => sb.style.display = 'none');

      btn.classList.add('active');
      const target = document.getElementById(subtabId);
      if (target) target.style.display = 'block';
      STATE.currentSubtab = subtabId;
    });
  });

  document.getElementById('btnRefreshPortal')?.addEventListener('click', refreshPortalData);
  document.getElementById('btnExportDeliveries')?.addEventListener('click', () => {
    window.open('/api/v1/admin/export?format=csv', '_blank');
  });

  // Modales
  document.getElementById('btnCloseSupervisorModal')?.addEventListener('click', () => {
    document.getElementById('supervisorModalBackdrop')?.classList.remove('active');
  });
  document.getElementById('btnCloseDossierModal')?.addEventListener('click', () => {
    document.getElementById('securityDossierModalBackdrop')?.classList.remove('active');
  });
}

// ----------------------------------------------------------------------------
// SIMULADOR DE ENTORNO DE RED (ONLINE / OFFLINE)
// ----------------------------------------------------------------------------
function setupNetworkToggle() {
  const btn = document.getElementById('btnToggleNetwork');
  const pill = document.getElementById('connectionPill');
  const text = document.getElementById('connectionText');
  const dropdownLabel = document.getElementById('networkToggleItemLabel');

  function toggle() {
    STATE.isOnline = !STATE.isOnline;
    if (STATE.isOnline) {
      if (pill) {
        pill.className = 'status-pill status-pill-compact online';
        pill.title = 'Estado del entorno de red: Online (Clic para conmutar simulación)';
      }
      if (text) text.textContent = 'Online';
      if (dropdownLabel) dropdownLabel.textContent = 'Simular Desconexión';
    } else {
      if (pill) {
        pill.className = 'status-pill status-pill-compact offline';
        pill.title = 'Estado del entorno de red: Desconectado / Offline (Clic para reconectar)';
      }
      if (text) text.textContent = 'Offline';
      if (dropdownLabel) dropdownLabel.textContent = 'Restablecer Red Online';
    }
  }

  btn?.addEventListener('click', () => {
    toggle();
    if (typeof window.closeUserMenu === 'function') {
      window.closeUserMenu();
    }
  });

  pill?.addEventListener('click', toggle);
  pill?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
}

// ----------------------------------------------------------------------------
// 1. PORTAL WEB DE ADMINISTRACIÓN Y GOBERNANZA
// ----------------------------------------------------------------------------
async function refreshPortalData() {
  try {
    // 1. KPIs
    const kpiRes = await fetch('/api/v1/admin/kpis');
    const kpiData = await kpiRes.json();
    const { kpis, alerts } = kpiData;

    document.getElementById('kpiTotalWorkers').textContent = kpis.total_active_workers;
    document.getElementById('kpiAssignedToday').textContent = kpis.combos_assigned_today;
    document.getElementById('kpiClaimedRatio').textContent = `${kpis.combos_claimed_today} entregados hoy (${kpis.pending_today} pendientes)`;
    document.getElementById('kpiPasskeyAdoption').textContent = `${kpis.passkey_adoption_rate_pct}%`;
    document.getElementById('kpiPasskeyCount').textContent = `${kpis.workers_with_passkey} credenciales activas`;
    document.getElementById('kpiOfflinePct').textContent = `${kpis.offline_sync_pct}%`;

    // Barras de progreso de desglose
    const totalDel = kpis.combos_claimed_today || 1;
    const b = kpis.verification_breakdown;
    const passkeyPct = Math.round((b.passkey_qr / totalDel) * 100) || 0;
    const nfcPct = Math.round((b.nfc_card / totalDel) * 100) || 0;
    const supPct = Math.round((b.supervisor_override / totalDel) * 100) || 0;

    document.getElementById('barCountPasskey').textContent = `${b.passkey_qr} entregas (${passkeyPct}%)`;
    document.getElementById('barFillPasskey').style.width = `${passkeyPct}%`;

    document.getElementById('barCountNfc').textContent = `${b.nfc_card} entregas (${nfcPct}%)`;
    document.getElementById('barFillNfc').style.width = `${nfcPct}%`;

    document.getElementById('barCountSupervisor').textContent = `${b.supervisor_override} entregas (${supPct}%)`;
    document.getElementById('barFillSupervisor').style.width = `${supPct}%`;

    // Alertas
    const alertsContainer = document.getElementById('dashboardAlertsList');
    alertsContainer.innerHTML = '';
    alerts.forEach(a => {
      const alertDiv = document.createElement('div');
      alertDiv.className = `alert-box alert-${a.type === 'warning' ? 'warning' : a.type === 'danger' ? 'danger' : 'info'}`;
      alertDiv.innerHTML = `
        <div>
          <strong>${a.title}</strong>
          <p style="font-size: 0.75rem; margin-top: 0.2rem;">${a.message}</p>
          <span style="font-size: 0.65rem; opacity: 0.7;">${a.timestamp}</span>
        </div>
      `;
      alertsContainer.appendChild(alertDiv);
    });

    // 2. Directorio de Trabajadores
    await loadWorkersDirectory();

    // 3. Catálogo de Combos
    await loadCombosCatalog();

    // 4. Planificación de Jornadas de Despacho
    await loadCampaigns();

    // 5. Configuración Institucional y Marca
    await loadTenantSettings();

    // 6. Notificaciones y Avisos de Jornadas
    await loadNotifications();

    // 7. Auditoría de Entregas
    await loadAuditDeliveries();

  } catch (err) {
    console.error('Error cargando datos del portal:', err);
  }
}

async function loadWorkersDirectory() {
  const search = document.getElementById('searchWorkerInput')?.value || '';
  const workerType = document.getElementById('filterWorkerTypeSelect')?.value || '';
  const shift = document.getElementById('filterShiftSelect')?.value || '';
  const status = document.getElementById('filterStatusSelect')?.value || '';

  const url = `/api/v1/admin/workers?search=${encodeURIComponent(search)}&worker_type=${encodeURIComponent(workerType)}&shift=${encodeURIComponent(shift)}&status=${encodeURIComponent(status)}`;
  const res = await fetch(url);
  const data = await res.json();

  const tbody = document.getElementById('workersTableBody');
  tbody.innerHTML = '';

  data.workers.forEach(w => {
    const tr = document.createElement('tr');

    let badgeClass = 'badge-pending';
    let badgeIcon = '⏳';
    if (w.auth_badge === 'passkey_active') {
      badgeClass = 'badge-passkey';
      badgeIcon = '🔐';
    } else if (w.auth_badge === 'nfc_active') {
      badgeClass = 'badge-nfc';
      badgeIcon = '💳';
    } else if (w.auth_badge === 'revoked') {
      badgeClass = 'badge-revoked';
      badgeIcon = '🛑';
    } else if (w.auth_badge === 'exemption') {
      badgeClass = 'badge-override';
      badgeIcon = '⚠️';
    }

    // Insignia de condición de personal (Jubilado / Activo / Contratado)
    let condBadge = '<span class="badge badge-activo">🏢 Funcionario Activo</span>';
    if (w.worker_type === 'jubilado') {
      condBadge = '<span class="badge badge-jubilado">👴 Personal Jubilado</span>';
    } else if (w.worker_type === 'contratado') {
      condBadge = '<span class="badge badge-contratado">📋 Personal Contratado</span>';
    }

    const entitlementBadge = w.today_entitlement_status === 'claimed'
      ? '<span class="badge badge-passkey">Entregado</span>'
      : w.today_entitlement_status === 'pending'
      ? '<span class="badge badge-override">Pendiente</span>'
      : '<span class="badge" style="background: rgba(255,255,255,0.05); color: #94a3b8;">Sin Asignar</span>';

    tr.innerHTML = `
      <td class="text-mono" style="font-weight: 600;">${w.document_id}</td>
      <td>
        <div style="font-weight: 600;">${w.full_name}</div>
        <div style="font-size: 0.75rem; color: var(--text-dim);">${w.email}</div>
      </td>
      <td>${condBadge}</td>
      <td>${w.department_name || 'Sin Asignar'}</td>
      <td style="text-transform: capitalize;">${w.shift.replace('_', ' ')}</td>
      <td>
        <span class="badge ${badgeClass}">${badgeIcon} ${w.auth_label}</span>
      </td>
      <td>${entitlementBadge}</td>
      <td>
        <button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="openSecurityDossier('${w.id}')">
          🛡️ Expediente
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Búsqueda y filtros en vivo en directorio
document.getElementById('searchWorkerInput')?.addEventListener('input', loadWorkersDirectory);
document.getElementById('filterWorkerTypeSelect')?.addEventListener('change', loadWorkersDirectory);
document.getElementById('filterShiftSelect')?.addEventListener('change', loadWorkersDirectory);
document.getElementById('filterStatusSelect')?.addEventListener('change', loadWorkersDirectory);

async function loadCombosCatalog() {
  try {
    const res = await fetch('/api/v1/admin/combos');
    const combos = await res.json();
    const grid = document.getElementById('combosCatalogGrid');
    if (!grid) return;
    grid.innerHTML = '';

    combos.forEach(c => {
      const card = document.createElement('div');
      
      let cardClass = 'package-card';
      let icon = '⭐';
      let tagClass = 'badge-viveres';
      let categoryLabel = c.category.replace('_', ' ').toUpperCase();

      switch (c.category) {
        case 'bolsa_viveres':
          cardClass += ' viveres-card';
          icon = '📦';
          tagClass = 'badge-viveres';
          categoryLabel = 'VÍVERES SECOS';
          break;
        case 'combo_proteico':
          cardClass += ' proteina-card';
          icon = '🍗';
          tagClass = 'badge-proteina';
          categoryLabel = 'PROTEÍNA FRESCA';
          break;
        case 'utiles_escolares':
          cardClass += ' escolar-card';
          icon = '🎒';
          tagClass = 'badge-escolar';
          categoryLabel = 'ÚTILES ESCOLARES';
          break;
        case 'combo_higienico':
          cardClass += ' higienico-card';
          icon = '🧼';
          tagClass = 'badge-higienico';
          categoryLabel = 'HIGIENE & ASEO';
          break;
        case 'dotacion_uniformes':
          cardClass += ' dotacion-card';
          icon = '🦺';
          tagClass = 'badge-dotacion';
          categoryLabel = 'DOTACIÓN & UNIFORME';
          break;
        case 'combo_navideno':
          cardClass += ' especial-card';
          icon = '🎁';
          tagClass = 'badge-proteina';
          categoryLabel = 'EDICIÓN NAVIDEÑA';
          break;
        case 'combo_salud':
          cardClass += ' higienico-card';
          icon = '💊';
          tagClass = 'badge-higienico';
          categoryLabel = 'BOTIQUÍN & SALUD';
          break;
        default:
          cardClass += ' especial-card';
          icon = '⭐';
          tagClass = 'badge-viveres';
          break;
      }

      // Convertir rubros separados por comas o saltos de línea a viñetas si existen
      const rubros = (c.description || '').split(/,|\n/).map(r => r.trim()).filter(Boolean);
      const rubrosHtml = rubros.length > 0 
        ? `<div style="margin: 0.6rem 0; font-size: 0.76rem; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem 0.75rem;">
             <strong style="color: #0284c7; display: block; margin-bottom: 0.25rem;">📋 Rubros Incluidos:</strong>
             <ul style="margin: 0; padding-left: 1.1rem; line-height: 1.4;">
               ${rubros.slice(0, 5).map(item => `<li>${item}</li>`).join('')}
               ${rubros.length > 5 ? `<li style="color: #64748b; font-style: italic;">... y ${rubros.length - 5} rubros más</li>` : ''}
             </ul>
           </div>`
        : `<p style="font-size: 0.8rem; color: #64748b; margin-bottom: 0.6rem;">${c.description || 'Sin descripción'}</p>`;

      card.innerHTML = `
        <div class="package-card-header">
          <div class="package-card-title">
            <span>${icon} ${c.name}</span>
          </div>
          <span class="package-card-badge ${tagClass}">${categoryLabel}</span>
        </div>
        ${rubrosHtml}
        <div class="combo-meta" style="font-size: 0.75rem; border-top: 1px solid #f1f5f9; padding-top: 0.6rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.4rem;">
          <span style="color: #475569;">📦 ${c.dietary_info || 'Almacén Estándar'}</span>
          <span style="color: ${c.is_active ? '#16a34a' : '#ef4444'}; font-weight: 600;">
            ${c.is_active ? '● Activo' : '○ Inactivo'}
          </span>
          <button class="btn btn-outline btn-delete-combo" data-id="${c.id}" style="padding: 0.15rem 0.5rem; font-size: 0.7rem; border-color: #fca5a5; color: #dc2626; margin-left: auto;">
            🗑️ Eliminar
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    // Eventos para botones de eliminar
    document.querySelectorAll('.btn-delete-combo').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Desea eliminar o retirar este beneficio del catálogo activo?')) return;
        
        try {
          const delRes = await fetch(`/api/v1/admin/combos/${id}`, { method: 'DELETE' });
          const delData = await delRes.json();
          alert(delData.message || 'Actualizado');
          loadCombosCatalog();
        } catch (err) {
          alert('Error al eliminar beneficio: ' + err.message);
        }
      });
    });

  } catch (err) {
    console.error('[LOAD COMBOS ERROR]', err);
  }
}

// Configuración y Gestión del Modal de Combos
function initCombosManagement() {
  const modal = document.getElementById('createComboModalBackdrop');
  const btnOpen = document.getElementById('btnOpenCreateComboModal');
  const btnClose = document.getElementById('btnCloseCreateComboModal');
  const btnCancel = document.getElementById('btnCancelCreateCombo');
  const form = document.getElementById('createComboForm');
  const btnPresetEscolares = document.getElementById('btnPresetEscolares');
  const btnPresetHigienico = document.getElementById('btnPresetHigienico');

  if (!modal || !btnOpen) return;

  const openModal = () => modal.classList.add('active');
  const closeModal = () => {
    modal.classList.remove('active');
    form.reset();
  };

  btnOpen.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  // Preset 1: Útiles Escolares
  btnPresetEscolares?.addEventListener('click', () => {
    document.getElementById('comboNameInput').value = 'Combo Escolar "Paso a Clases" MIPPCI';
    document.getElementById('comboCategorySelect').value = 'utiles_escolares';
    document.getElementById('comboLogisticSelect').value = 'Almacén Seco / Logística Estándar';
    document.getElementById('comboItemsInput').value = '6 Cuadernos engrapados (100 hojas cuadrícula y una línea), 1 Morral tricolor impermeable, 1 Caja de lápices grafito 2B (12 unid), 1 Juego de geometría (regla, escuadra, transportador), 1 Caja de creyones de madera (12 colores), 1 Pega blanca líquida (250g), 1 Tijera escolar punta roma, 1 Sacapuntas con depósito';
    document.getElementById('comboTargetGroupSelect').value = 'Personal con Hijos / Cargas Familiares';
    document.getElementById('comboCaloriesInput').value = '0';
    openModal();
  });

  // Preset 2: Combo Higiénico
  btnPresetHigienico?.addEventListener('click', () => {
    document.getElementById('comboNameInput').value = 'Combo Higiénico y Aseo Personal Institucional';
    document.getElementById('comboCategorySelect').value = 'combo_higienico';
    document.getElementById('comboLogisticSelect').value = 'Almacén Seco / Logística Estándar';
    document.getElementById('comboItemsInput').value = '4 Jabones de tocador en barra (120g), 2 Cremas dentales con flúor (100ml), 2 Champús anticaída / hidratante (400ml), 2 Desodorantes en roll-on antitranspirante (50ml), 4 Rollos de papel higiénico institucional, 1 Jabón lavaplatos líquido concentrado (500ml), 1 Detergente en polvo multiuso (1kg)';
    document.getElementById('comboTargetGroupSelect').value = 'Todos los Trabajadores (Universal)';
    document.getElementById('comboCaloriesInput').value = '0';
    openModal();
  });

  // Envío del formulario
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('comboNameInput').value;
    const category = document.getElementById('comboCategorySelect').value;
    const logistic = document.getElementById('comboLogisticSelect').value;
    const items = document.getElementById('comboItemsInput').value;
    const targetGroup = document.getElementById('comboTargetGroupSelect').value;
    const calories = document.getElementById('comboCaloriesInput').value;

    const payload = {
      name,
      category,
      description: items,
      dietary_info: logistic,
      target_group: targetGroup,
      calories: parseInt(calories, 10) || 0
    };

    try {
      const res = await fetch('/api/v1/admin/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ ${data.message}: "${data.combo.name}"`);
        closeModal();
        loadCombosCatalog();
      } else {
        alert(`Error al guardar: ${data.error || 'Verifique los campos'}`);
      }
    } catch (err) {
      alert(`Error de red al guardar combo: ${err.message}`);
    }
  });
}

async function loadAuditDeliveries() {
  const method = document.getElementById('auditMethodFilter')?.value || '';
  const res = await fetch(`/api/v1/admin/deliveries?method=${encodeURIComponent(method)}`);
  const data = await res.json();
  const tbody = document.getElementById('auditTableBody');
  tbody.innerHTML = '';

  data.deliveries.forEach(d => {
    const tr = document.createElement('tr');
    
    let methodBadge = '';
    if (d.verification_method === 'passkey_qr') {
      methodBadge = '<span class="badge badge-passkey">🔐 Passkey QR FIDO2</span>';
    } else if (d.verification_method === 'nfc_card') {
      methodBadge = '<span class="badge badge-nfc">💳 Tarjeta Física NFC</span>';
    } else {
      methodBadge = '<span class="badge badge-override">⚠️ Liberación Supervisor</span>';
    }

    const offlineBadge = d.is_offline_sync 
      ? '<span class="badge badge-offline">Offline Sync</span>' 
      : '<span class="badge badge-passkey">Directo</span>';

    const authBy = d.supervisor_name 
      ? `<strong style="color: #f59e0b;">${d.supervisor_name}</strong><br><small style="color: var(--text-dim);">${d.override_reason || ''}</small>`
      : (d.operator_name || 'Operador de Comedor');

    const signatureSnippet = d.signature_proof 
      ? `<span class="text-mono" style="font-size: 0.65rem; color: #34d399;" title="${d.signature_proof}">ECDSA: ${d.signature_proof.substring(0, 16)}...</span>`
      : '<span style="font-size: 0.7rem; color: var(--text-dim);">N/A (NFC/Manual)</span>';

    tr.innerHTML = `
      <td class="text-mono" style="font-size: 0.75rem;">${d.id.substring(0, 18)}...</td>
      <td style="font-size: 0.8rem;">${new Date(d.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
      <td>
        <strong>${d.worker_name}</strong><br>
        <span class="text-mono" style="font-size: 0.75rem; color: var(--text-dim);">${d.worker_document}</span>
      </td>
      <td>${d.combo_name}</td>
      <td>${methodBadge}</td>
      <td>${offlineBadge}</td>
      <td>${authBy}</td>
      <td>${signatureSnippet}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('auditMethodFilter')?.addEventListener('change', loadAuditDeliveries);

// Expediente Digital de Seguridad
window.openSecurityDossier = async function(workerId) {
  try {
    const res = await fetch(`/api/v1/admin/workers/${workerId}/security-dossier`);
    const data = await res.json();
    const { worker, passkeys, nfcCards, recentDeliveries } = data;

    const modal = document.getElementById('securityDossierModalBackdrop');
    const content = document.getElementById('dossierContent');

    let passkeysHtml = passkeys.length === 0 ? '<p style="color: var(--text-dim);">No tiene passkeys enroladas.</p>' : '';
    passkeys.forEach(p => {
      passkeysHtml += `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; color: #0f172a;">📱 ${p.device_name}</div>
            <div class="text-mono" style="font-size: 0.7rem; color: #64748b;">${p.credential_id}</div>
            <div style="font-size: 0.7rem; color: #475569;">Firmas emitidas: ${p.sign_count} &middot; Enrolado: ${new Date(p.enrolled_at).toLocaleDateString()}</div>
          </div>
          <div>
            ${p.status === 'active' 
              ? `<button class="btn btn-danger" style="font-size: 0.7rem; padding: 0.3rem 0.6rem;" onclick="revokePasskey('${p.credential_id}', '${worker.id}')">Revocar (Extravío)</button>`
              : '<span class="badge badge-revoked">Revocada</span>'}
          </div>
        </div>
      `;
    });

    let nfcHtml = nfcCards.length === 0 ? '<p style="color: #64748b;">Sin tarjetas NFC asociadas.</p>' : '';
    nfcCards.forEach(n => {
      nfcHtml += `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div class="text-mono" style="font-weight: 700; color: #0284c7;">💳 UID: ${n.card_uid}</div>
            <div style="font-size: 0.7rem; color: #64748b;">Emitida: ${new Date(n.issued_at).toLocaleDateString()}</div>
          </div>
          <span class="badge ${n.status === 'active' ? 'badge-nfc' : 'badge-revoked'}">${n.status.toUpperCase()}</span>
        </div>
      `;
    });

    let dossierBadge = '<span class="badge badge-activo">🏢 Funcionario Activo</span>';
    if (worker.worker_type === 'jubilado') {
      dossierBadge = '<span class="badge badge-jubilado">👴 Personal Jubilado</span>';
    } else if (worker.worker_type === 'contratado') {
      dossierBadge = '<span class="badge badge-contratado">📋 Personal Contratado</span>';
    }

    content.innerHTML = `
      <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.85rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <h4 style="color: #0f172a; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            ${worker.full_name}
            ${dossierBadge}
          </h4>
          <div style="font-size: 0.75rem; color: #475569; margin-top: 0.2rem;">Cédula: <span class="text-mono" style="color: #0f172a; font-weight: 700;">${worker.document_id}</span> &middot; Depto: ${worker.department_name || 'N/A'}</div>
        </div>
      </div>

      <div>
        <h5 style="font-size: 0.85rem; font-weight: 700; color: #10b981; margin-bottom: 0.5rem;">🔐 Credenciales Passkey (Hardware Enclave):</h5>
        ${passkeysHtml}
      </div>

      <div>
        <h5 style="font-size: 0.85rem; font-weight: 700; color: #06b6d4; margin-bottom: 0.5rem;">💳 Tarjetas Físicas NFC (Contingencia):</h5>
        ${nfcHtml}
        <div class="input-group" style="margin-top: 0.5rem;">
          <input id="assignNfcUidInput" type="text" class="form-input text-mono" placeholder="Nuevo UID (ej: 04E1F2A3B4)" style="font-size: 0.75rem;">
          <button class="btn btn-cyan" style="font-size: 0.75rem;" onclick="assignNfcCard('${worker.id}')">Vincular Nueva NFC</button>
        </div>
      </div>
    `;

    modal.classList.add('active');
  } catch (err) {
    alert('Error al abrir expediente: ' + err.message);
  }
};

window.revokePasskey = async function(credentialId, workerId) {
  if (!confirm('¿Desea revocar esta credencial Passkey inmediatamente? El dispositivo no podrá firmar más entregas.')) return;
  const res = await fetch(`/api/v1/admin/credentials/${encodeURIComponent(credentialId)}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Reporte de extravío por administrador' })
  });
  const data = await res.json();
  if (data.status === 'success') {
    alert('Credencial revocada con éxito.');
    openSecurityDossier(workerId);
    refreshPortalData();
  }
};

window.assignNfcCard = async function(workerId) {
  const input = document.getElementById('assignNfcUidInput');
  const uid = input.value.trim();
  if (!uid) return alert('Ingrese un UID de tarjeta');

  const res = await fetch(`/api/v1/admin/workers/${workerId}/assign-nfc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_uid: uid, issued_by: STATE.operatorId })
  });
  const data = await res.json();
  if (data.status === 'success') {
    alert('Tarjeta NFC asignada exitosamente.');
    openSecurityDossier(workerId);
    refreshPortalData();
  }
};

// ----------------------------------------------------------------------------
// 2. SIMULADOR APP TRABAJADOR (BENEFICIARIO)
// ----------------------------------------------------------------------------
function setupWorkerSimulator() {
  const workerSelect = document.getElementById('workerSimulatorSelect');
  const btnGenerate = document.getElementById('btnGenerateQr');
  const btnEnroll = document.getElementById('btnEnrollPasskey');
  const btnBrightness = document.getElementById('btnToggleBrightness');

  // Llenar selector con trabajadores activos
  async function loadWorkerSelect() {
    const res = await fetch('/api/v1/admin/workers?status=active');
    const data = await res.json();
    workerSelect.innerHTML = '';

    data.workers.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.id;
      const typeTag = w.worker_type === 'jubilado' ? '👴 Jubilado' : w.worker_type === 'contratado' ? '📋 Contratado' : '🏢 Activo';
      opt.textContent = `${w.full_name} (${w.document_id}) - [${typeTag}] - ${w.auth_label}`;
      workerSelect.appendChild(opt);
    });

    if (data.workers.length > 0) {
      STATE.selectedWorkerId = data.workers[0].id;
      updateWorkerCard();
    }
  }

  window.updateWorkerCard = updateWorkerCard;

  workerSelect?.addEventListener('change', () => {
    STATE.selectedWorkerId = workerSelect.value;
    updateWorkerCard();
  });

  async function updateWorkerCard() {
    if (!STATE.selectedWorkerId) return;
    const res = await fetch(`/api/v1/admin/workers/${STATE.selectedWorkerId}/security-dossier`);
    const data = await res.json();
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

    // Actualizar insignia de condición laboral en la barra superior móvil
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
      statusText.textContent = `Enrolada en ${activePasskey.device_name} (Sign count: ${activePasskey.sign_count})`;
      statusBox.className = 'alert-box alert-info';
      btnGenerate.disabled = false;
      btnGenerate.textContent = '⚡ Generar QR de Entrega (Firma Biométrica)';
    } else {
      statusText.textContent = worker.worker_type === 'jubilado' 
        ? 'Adulto Mayor en contingencia: Puede reclamar con Tarjeta NFC física en mesa.' 
        : 'Sin Passkey activa. Por favor enrole este dispositivo.';
      statusBox.className = 'alert-box alert-warning';
      btnGenerate.disabled = true;
      btnGenerate.textContent = worker.worker_type === 'jubilado' ? '💳 Beneficio por Tarjeta NFC' : '⚠️ Requiere Enrolar Passkey';
    }
  }

  // Generar QR firmado offline
  btnGenerate.addEventListener('click', async () => {
    if (!STATE.selectedWorkerId) return;

    try {
      // Obtener derecho de hoy
      const packRes = await fetch(`/api/v1/sync/daily-pack`);
      const pack = await packRes.json();
      const currentWorker = pack.active_workers.find(w => w.worker_id === STATE.selectedWorkerId);
      
      const entitlementId = currentWorker && currentWorker.entitlements.length > 0 
        ? currentWorker.entitlements[0].entitlement_id 
        : '770e8400-e29b-41d4-a716-446655440001';

      // Llamar al endpoint de firma biométrica simulada
      const signRes = await fetch('/api/v1/auth/passkey/sign-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: STATE.selectedWorkerId,
          entitlement_id: entitlementId
        })
      });

      const signData = await signRes.json();
      if (signData.error) {
        alert(signData.error);
        return;
      }

      STATE.activeQrPayload = signData.qr_payload;

      // Mostrar contenedor de QR
      const qrContainer = document.getElementById('workerQrContainer');
      qrContainer.style.display = 'flex';

      // Renderizar QR Code dinámico
      window.QRCodeGenerator.render('qrCodeTarget', signData.qr_raw_string);
      document.getElementById('qrNonceLabel').textContent = `Nonce: ${signData.qr_payload.nonce.substring(0, 24)}... (ES256)`;

      // Iniciar cuenta regresiva estricta de 60 segundos
      startQrCountdown(60);

    } catch (err) {
      alert('Error generando firma QR: ' + err.message);
    }
  });

  // Temporizador de 60 segundos con barra visual
  function startQrCountdown(seconds) {
    if (STATE.qrTimerInterval) clearInterval(STATE.qrTimerInterval);

    let remaining = seconds;
    const fill = document.getElementById('qrCountdownFill');
    const label = document.getElementById('qrTimerLabel');

    fill.style.width = '100%';
    label.textContent = `Expira en: ${remaining}s`;

    STATE.qrTimerInterval = setInterval(() => {
      remaining--;
      const pct = (remaining / seconds) * 100;
      fill.style.width = `${pct}%`;
      label.textContent = `Expira en: ${remaining}s`;

      if (remaining <= 0) {
        clearInterval(STATE.qrTimerInterval);
        label.textContent = '❌ Código QR expirado (Vigencia 60s)';
        fill.style.width = '0%';
        fill.style.background = '#f43f5e';
        STATE.activeQrPayload = null;
      }
    }, 1000);
  }

  // Enrolar Passkey
  btnEnroll.addEventListener('click', async () => {
    if (!STATE.selectedWorkerId) return;

    // Simular desafío FIDO2
    const challRes = await fetch('/api/v1/auth/passkey/register-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: STATE.selectedWorkerId })
    });
    const options = await challRes.json();

    // Simular autenticación biométrica nativa en el dispositivo
    const deviceName = navigator.userAgent.includes('iPhone') ? 'iPhone 15 Pro (Secure Enclave)' : 'Pixel 8 (Titan M2 TEE)';
    const verifyRes = await fetch('/api/v1/auth/passkey/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: STATE.selectedWorkerId,
        device_name: deviceName,
        credential: { credential_id: 'Cred_' + Date.now() }
      })
    });

    const verifyData = await verifyRes.json();
    alert(`🎉 ¡Passkey FIDO2 enrolada exitosamente!\nLlave pública registrada en el servidor central.`);
    updateWorkerCard();
    refreshPortalData();
  });

  // Toggle de brillo al 100%
  let isMaxBrightness = false;
  btnBrightness.addEventListener('click', () => {
    isMaxBrightness = !isMaxBrightness;
    const box = document.getElementById('qrDisplayBox');
    if (isMaxBrightness) {
      box.classList.add('max-brightness');
      btnBrightness.textContent = '💡 Brillo Normal';
    } else {
      box.classList.remove('max-brightness');
      btnBrightness.textContent = '💡 Brillo 100%';
    }
  });
}

// ----------------------------------------------------------------------------
// 3. MESA DE DESPACHO (CÁMARA REAL EN VIVO, ESCÁNER Y OFFLINE-FIRST)
// ----------------------------------------------------------------------------
let liveCameraScanner = null;

function setupDistributorSimulator() {
  document.getElementById('btnDownloadDailyPack')?.addEventListener('click', downloadDailyPack);
  document.getElementById('btnScanWorkerGeneratedQr')?.addEventListener('click', scanWorkerQr);
  document.getElementById('btnSimulateNfcTap')?.addEventListener('click', simulateNfcTap);
  document.getElementById('btnSyncDeferredQueue')?.addEventListener('click', syncDeferredQueue);
  
  // Controles de Cámara Real en Vivo
  document.getElementById('btnStartCameraScanner')?.addEventListener('click', startLiveCameraScanner);
  document.getElementById('btnStopCameraScanner')?.addEventListener('click', stopLiveCameraScanner);

  document.getElementById('btnCloseFeedbackOverlay')?.addEventListener('click', () => {
    document.getElementById('distributorFeedbackOverlay').classList.remove('active');
  });

  // Módulo de Contingencia
  document.getElementById('btnSearchContingencyWorker')?.addEventListener('click', searchContingencyWorker);
  document.getElementById('btnAuthorizeSupervisorOverride')?.addEventListener('click', executeSupervisorOverride);
}

// Iniciar Escáner con la Cámara Física del Dispositivo (Cámara Trasera)
async function startLiveCameraScanner() {
  const standbyBox = document.getElementById('cameraStandbyBox');
  const liveContainer = document.getElementById('liveCameraContainer');
  const badge = document.getElementById('cameraStatusBadge');

  if (typeof Html5Qrcode === 'undefined') {
    alert('Biblioteca de cámara no cargada aún. Recargue la página.');
    return;
  }

  try {
    if (liveCameraScanner && liveCameraScanner.isScanning) {
      await liveCameraScanner.stop();
    }

    standbyBox.style.display = 'none';
    liveContainer.style.display = 'block';
    if (badge) {
      badge.textContent = '🟢 Cámara Activa (Enfocando)';
      badge.className = 'badge badge-proteina';
    }

    liveCameraScanner = new Html5Qrcode("cameraQrReader");

    const config = {
      fps: 15,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.0
    };

    await liveCameraScanner.start(
      { facingMode: "environment" }, // Preferir cámara trasera de almacén
      config,
      async (decodedText) => {
        console.log('[CÁMARA QR] Código decodificado en vivo:', decodedText);
        playAudioFeedback('success');

        try {
          let payload;
          if (decodedText.startsWith('{') && decodedText.endsWith('}')) {
            payload = JSON.parse(decodedText);
          } else {
            // Decodificar Base64 si viene codificado
            try {
              payload = JSON.parse(atob(decodedText));
            } catch (e) {
              payload = JSON.parse(decodedText);
            }
          }

          // Detener temporalmente la cámara tras captura exitosa
          await stopLiveCameraScanner();
          await processQrPayload(payload);

        } catch (err) {
          showDistributorFeedback(false, 'FORMATO QR INVÁLIDO', 'El código escaneado no corresponde a una Passkey válida de la jornada.');
        }
      },
      (errorMessage) => {
        // Ignorar errores de frame mientras enfoca
      }
    );

  } catch (err) {
    console.error('[CAMERA ERROR]', err);
    alert('No se pudo acceder a la cámara en vivo:\n' + (err.message || err) + '\n\nNota: Si no estás en localhost, los navegadores requieren conexión segura HTTPS.');
    stopLiveCameraScanner();
  }
}

// Detener y liberar la cámara física
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

// Escanear el código QR activo generado por la App del Trabajador (Simulado o directo)
async function scanWorkerQr() {
  if (!STATE.activeQrPayload) {
    showDistributorFeedback(false, 'SIN CÓDIGO QR', 'Genere primero un código QR dinámico en la App del Trabajador.');
    return;
  }
  await processQrPayload(STATE.activeQrPayload);
}

// Procesamiento Criptográfico Unificado del Código QR (Cámara en Vivo o Simulación)
async function processQrPayload(payload) {
  if (!payload || !payload.wid || !payload.ent) {
    showDistributorFeedback(false, 'ESTRUCTURA CORRUPTA', 'El payload QR no posee los identificadores requeridos.');
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // 1. Verificación de vigencia máxima de 60s
  if (Math.abs(now - payload.ts) > 60) {
    showDistributorFeedback(false, 'QR EXPIRADO', 'El código QR ha superado los 60 segundos de validez anti-captura.');
    return;
  }

  // 2. Verificación de duplicados en la sesión local (idx_unique_daily_claim)
  if (STATE.localCache.deliveredEntitlements.has(payload.ent)) {
    showDistributorFeedback(false, 'INTENTO DE DUPLICADO', 'Alerta de Seguridad: Este beneficio ya fue entregado hoy (idx_unique_daily_claim).');
    return;
  }

  // 3. Verificación de firma criptográfica
  if (!STATE.isOnline) {
    // Validación 100% OFFLINE utilizando la clave pública en caché SQLite
    const pubKey = STATE.localCache.publicKeys[payload.wid];
    if (!pubKey) {
      showDistributorFeedback(false, 'PASSKEY NO ENCONTRADA', 'El trabajador no posee una clave pública activa en la base local.');
      return;
    }

    const worker = STATE.localCache.workers.find(w => w.worker_id === payload.wid);

    // Registrar en la cola diferida local con UUIDv4 e is_offline_sync = true
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
    // Validación Online directa con el backend
    try {
      const res = await fetch('/api/v1/verify/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_payload: payload,
          delivered_by_user_id: STATE.operatorId
        })
      });

      const result = await res.json();
      if (result.valid) {
        STATE.localCache.deliveredEntitlements.add(payload.ent);
        showDistributorFeedback(
          true,
          'DESPACHO ONLINE AUTORIZADO',
          `Beneficiario: <strong>${result.worker_name}</strong> &middot; Cédula: <strong>${result.document_id}</strong><br><small style="color: #6ee7b7;">Firma biométrica validada en servidor central.</small>`,
          result
        );
        refreshPortalData();
      } else {
        showDistributorFeedback(false, 'ACCESO DENEGADO', result.message || 'Firma inválida o combo ya reclamado');
      }
    } catch (err) {
      showDistributorFeedback(false, 'ERROR DE RED', err.message);
    }
  }
}

// Descarga y precarga del paquete diario en Edge Cache SQLite
async function downloadDailyPack() {
  try {
    const res = await fetch('/api/v1/sync/daily-pack');
    const pack = await res.json();

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

    document.getElementById('localDbWorkersCount').textContent = pack.total_workers;
    document.getElementById('localDbKeysCount').textContent = totalKeys;

    console.log('[DISTRIBUIDOR] Paquete diario SQLite precargado con éxito.');
  } catch (err) {
    console.error('Error descargando daily pack:', err);
  }
}

// Escanear el código QR activo generado por la App del Trabajador
async function scanWorkerQr() {
  if (!STATE.activeQrPayload) {
    showDistributorFeedback(false, 'SIN CÓDIGO QR', 'Genere primero un código QR dinámico en la App del Trabajador.');
    return;
  }

  const payload = STATE.activeQrPayload;
  const now = Math.floor(Date.now() / 1000);

  // 1. Verificación de vigencia máxima de 60s
  if (Math.abs(now - payload.ts) > 60) {
    showDistributorFeedback(false, 'QR EXPIRADO', 'El código QR ha superado los 60 segundos de validez anti-captura.');
    return;
  }

  // 2. Verificación de duplicados en la sesión local
  if (STATE.localCache.deliveredEntitlements.has(payload.ent)) {
    showDistributorFeedback(false, 'INTENTO DE DUPLICADO', 'Alerta: Este beneficio ya fue entregado hoy (idx_unique_daily_claim).');
    return;
  }

  // 3. Verificación de firma criptográfica
  if (!STATE.isOnline) {
    // Validación 100% OFFLINE utilizando la clave pública en caché SQLite
    const pubKey = STATE.localCache.publicKeys[payload.wid];
    if (!pubKey) {
      showDistributorFeedback(false, 'PASSKEY NO ENCONTRADA', 'El trabajador no posee una clave pública activa en la base local.');
      return;
    }

    const worker = STATE.localCache.workers.find(w => w.worker_id === payload.wid);

    // Registrar en la cola diferida local con UUIDv4 e is_offline_sync = true
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
    // Validación Online directa con el backend
    try {
      const res = await fetch('/api/v1/verify/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_payload: payload,
          delivered_by_user_id: STATE.operatorId
        })
      });

      const result = await res.json();
      if (result.valid) {
        STATE.localCache.deliveredEntitlements.add(payload.ent);
        showDistributorFeedback(
          true,
          'DESPACHO ONLINE AUTORIZADO',
          `Beneficiario: <strong>${result.worker_name}</strong> &middot; Cédula: <strong>${result.document_id}</strong><br><small style="color: #6ee7b7;">Firma biométrica validada en servidor central.</small>`,
          result
        );
        refreshPortalData();
      } else {
        showDistributorFeedback(false, 'ACCESO DENEGADO', result.message || 'Firma inválida o combo ya reclamado');
      }
    } catch (err) {
      showDistributorFeedback(false, 'ERROR DE RED', err.message);
    }
  }
}

// Simular lectura de tarjeta física NFC
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
    // Sincronizar de inmediato
    await fetch('/api/v1/sync/batch-deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
        device_id: 'distributor_tablet_01',
        deliveries: [deliveryRecord]
      })
    });
    showDistributorFeedback(
      true,
      'DESPACHO NFC AUTORIZADO',
      `Beneficiario: <strong>${worker ? worker.full_name : 'Hilda Domínguez'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-06894321'}</strong><br><small style="color: #38bdf8;">Tarjeta física NFC validada y sincronizada.</small>`,
      worker || { worker_type: 'jubilado' }
    );
    refreshPortalData();
  }
}

// Búsqueda para Contingencia (Nivel 1 & Nivel 2)
let pendingContingencyWorker = null;

function searchContingencyWorker() {
  const doc = document.getElementById('contingencyDocInput').value.trim();
  if (!doc) return alert('Ingrese un número de documento');

  const worker = STATE.localCache.workers.find(w => w.document_id === doc);
  if (!worker) {
    alert('Trabajador no encontrado en el padrón.');
    return;
  }

  pendingContingencyWorker = worker;
  const entitlement = STATE.localCache.entitlements[worker.worker_id];

  // Verificar si ya fue entregado
  if (entitlement && STATE.localCache.deliveredEntitlements.has(entitlement.entitlement_id)) {
    alert('ALERTA: Este trabajador ya reclamó su combo el día de hoy.');
    return;
  }

  // Verificar nivel de contingencia:
  // Si el trabajador tiene dispositivo extraviado o el operador superó 3 liberaciones -> Requiere Supervisor Nivel 2
  const requiresSupervisor = worker.contingency_reason === 'device_lost' || STATE.operatorOverridesCount >= 3;

  if (requiresSupervisor) {
    // Abrir Modal de Supervisor
    document.getElementById('modalBeneficiaryName').textContent = worker.full_name;
    document.getElementById('modalBeneficiaryDoc').textContent = worker.document_id;
    document.getElementById('modalBeneficiaryCombo').textContent = entitlement ? entitlement.combo_name : 'Combo Asignado';
    document.getElementById('supervisorModalBackdrop').classList.add('active');
  } else {
    // Liberación básica Nivel 1 (Operador)
    if (confirm(`¿Autorizar liberación manual Nivel 1 para ${worker.full_name}? (Quedan ${2 - STATE.operatorOverridesCount} liberaciones de operador)`)) {
      STATE.operatorOverridesCount++;
      document.getElementById('operatorOverridesCount').textContent = `${STATE.operatorOverridesCount} / 3 liberaciones de operador`;
      recordContingencyDelivery('supervisor_override', 'battery_dead_screen_broken', STATE.operatorId);
    }
  }
}

// Ejecución de la liberación con firma de Supervisor Nivel 2
function executeSupervisorOverride() {
  if (!pendingContingencyWorker) return;

  const reason = document.getElementById('modalOverrideReasonSelect').value;
  document.getElementById('supervisorModalBackdrop').classList.remove('active');

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
    fetch('/api/v1/sync/batch-deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
        device_id: 'distributor_tablet_01',
        deliveries: [deliveryRecord]
      })
    }).then(() => {
      showDistributorFeedback(true, 'CONTINGENCIA APROBADA', `Autorizado con firma biométrica para ${worker.full_name}.`);
      refreshPortalData();
    });
  }
}

// Sincronización en lote de la cola diferida (Sync Queue)
async function syncDeferredQueue() {
  if (STATE.localCache.syncQueue.length === 0) {
    alert('No hay transacciones pendientes en la cola diferida.');
    return;
  }

  if (!STATE.isOnline) {
    alert('No hay conexión de red. Restablezca la conexión para transmitir la cola diferida.');
    return;
  }

  try {
    const queue = [...STATE.localCache.syncQueue];
    const res = await fetch('/api/v1/sync/batch-deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
        device_id: 'distributor_tablet_01',
        deliveries: queue
      })
    });

    const data = await res.json();
    alert(`☁️ Sincronización en Lote Completada:\n` +
          `• Procesadas exitosamente: ${data.processed}\n` +
          `• Duplicados bloqueados (Anti-Fraude): ${data.failed_duplicates}`);

    STATE.localCache.syncQueue = [];
    updateSyncQueueUI();
    refreshPortalData();
  } catch (err) {
    alert('Error transmitiendo lote: ' + err.message);
  }
}

function updateSyncQueueUI() {
  const counter = document.getElementById('syncQueueCounter');
  const list = document.getElementById('localSyncQueueList');
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

  overlay.className = `distributor-feedback-overlay ${isSuccess ? 'overlay-success' : 'overlay-error'} active`;
  icon.textContent = isSuccess ? '✅' : '🛑';
  t.textContent = title;
  s.innerHTML = subtitle;

  if (isSuccess) {
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
  } else {
    d.textContent = `Código de Anomalía: ERR_${Date.now().toString().slice(-6)} &middot; Revisión Requerida`;
  }

  playAudioFeedback(isSuccess ? 'success' : 'error');
}

// ----------------------------------------------------------------------------
// 4. SIMULADOR NÓMINA SSOT & CONTRATOS REST
// ----------------------------------------------------------------------------
function setupPayrollSimulator() {
  const logsConsole = document.getElementById('payrollLogsConsole');
  function appendLog(msg) {
    logsConsole.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logsConsole.textContent;
  }

  // 1. Webhook
  document.getElementById('btnSendPayrollWebhook').addEventListener('click', async () => {
    const doc = document.getElementById('whDocInput').value;
    const name = document.getElementById('whNameInput').value;
    const email = document.getElementById('whEmailInput').value;
    const workerType = document.getElementById('whWorkerTypeSelect')?.value || 'activo';
    const shift = document.getElementById('whShiftSelect').value;

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

    // Generar HMAC SHA256 simulado
    const signature = 'sha256=test_signature_for_local_demo';

    const res = await fetch('/api/v1/payroll/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payroll-Signature': signature
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    appendLog(`Webhook respondido: ${JSON.stringify(data)}`);
    refreshPortalData();
  });

  // 2. Batch Import
  document.getElementById('btnSendBatchImport').addEventListener('click', async () => {
    try {
      const workers = JSON.parse(document.getElementById('batchJsonInput').value);
      const res = await fetch('/api/v1/payroll/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: `batch_${Date.now()}`,
          source: 'sftp_pgp_import',
          workers
        })
      });

      const data = await res.json();
      appendLog(`Carga masiva completada: ${data.processed} procesados, ${data.failed} fallidos.`);
      refreshPortalData();
    } catch (e) {
      alert('Error en formato JSON: ' + e.message);
    }
  });

  // 3. Kill-Switch
  const killSelect = document.getElementById('killSwitchWorkerSelect');
  async function loadKillSwitchSelect() {
    const res = await fetch('/api/v1/admin/workers?status=active');
    const data = await res.json();
    killSelect.innerHTML = '';
    data.workers.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = `${w.full_name} (${w.document_id})`;
      killSelect.appendChild(opt);
    });
  }

  loadKillSwitchSelect();

  document.getElementById('btnExecuteKillSwitch').addEventListener('click', async () => {
    const workerId = killSelect.value;
    const reason = document.getElementById('killSwitchReasonInput').value;

    if (!confirm('⚠️ ¿ESTÁ SEGURO DE EJECUTAR EL KILL-SWITCH? Esto revocará en cascada todas las credenciales Passkey, tarjetas NFC y beneficios del trabajador de forma inmediata.')) return;

    const res = await fetch(`/api/v1/payroll/employees/${workerId}/terminate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason,
        authorized_by: 'admin_hr_supervisor'
      })
    });

    const data = await res.json();
    appendLog(`KILL-SWITCH EJECUTADO: ${data.message} (Passkeys revocadas: ${data.summary.passkeysRevoked}, NFC revocadas: ${data.summary.nfcRevoked})`);
    alert(data.message);
    loadKillSwitchSelect();
    refreshPortalData();
  });
}

// ============================================================================
// PWA: SERVICE WORKER & INSTALACIÓN NATIVA
// ============================================================================
let deferredInstallPrompt = null;

function setupPwa() {
  // 1. Registro del Service Worker Offline-First
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registrado con éxito. Scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Fallo al registrar Service Worker:', err);
        });
    });
  }

  // 2. Captura del evento de instalación PWA en el navegador (Android / Chrome / Edge)
  const btnInstall = document.getElementById('btnInstallPwa');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstall) {
      btnInstall.style.display = 'inline-flex';
      btnInstall.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        console.log('[PWA] Elección de instalación del usuario:', choice.outcome);
        deferredInstallPrompt = null;
        btnInstall.style.display = 'none';
      });
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplicación instalada exitosamente en este dispositivo.');
    if (btnInstall) btnInstall.style.display = 'none';
  });
}

// ============================================================================
// CONTROL DE ACCESO BASADO EN ROLES (RBAC) & AUTENTICACIÓN INSTITUCIONAL
// ============================================================================
function setupAuth() {
  const loginForm = document.getElementById('loginForm');
  const btnSubmit = document.getElementById('btnLoginSubmit');
  const quickBtns = document.querySelectorAll('.quick-login-btn');
  const btnLogout = document.getElementById('btnLogout');
  const btnWorkerMobileLogout = document.getElementById('btnWorkerMobileLogout');

  // Submit manual
  const doLogin = () => {
    const docType = document.getElementById('loginDocType')?.value || 'V';
    const docNum = document.getElementById('loginDocNumber')?.value.trim();
    if (!docNum) {
      showLoginAlert('Por favor ingrese el número de Cédula de Identidad.');
      return;
    }
    executeLogin(`${docType}-${docNum}`);
  };

  btnSubmit?.addEventListener('click', doLogin);
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    doLogin();
  });

  // Acceso Rápido / Demo Chips con un solo clic
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const doc = btn.getAttribute('data-doc');
      if (doc) {
        const parts = doc.split('-');
        if (parts.length === 2) {
          const typeSelect = document.getElementById('loginDocType');
          const numInput = document.getElementById('loginDocNumber');
          if (typeSelect) typeSelect.value = parts[0];
          if (numInput) numInput.value = parts[1];
        }
        executeLogin(doc);
      }
    });
  });

  // Logout
  btnLogout?.addEventListener('click', handleLogout);
  btnWorkerMobileLogout?.addEventListener('click', handleLogout);
}

function showLoginAlert(msg) {
  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) {
    alertBox.textContent = msg;
    alertBox.style.display = 'block';
  }
}

async function executeLogin(rawDocId) {
  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';

  const btnSubmit = document.getElementById('btnLoginSubmit');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Verificando Identidad...';
  }

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: rawDocId })
    });

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error('[API ERROR] Respuesta no es JSON:', rawText);
      showLoginAlert(`Error de comunicación con el servidor (${res.status}): Verifique la configuración en Vercel.`);
      playAudioFeedback('error');
      return;
    }

    if (!res.ok || !data.success) {
      showLoginAlert(data.error || 'Cédula no encontrada en el padrón institucional.');
      playAudioFeedback('error');
      return;
    }

    playAudioFeedback('success');
    const user = data.user;
    STATE.currentUser = user;
    localStorage.setItem('sgbt_user', JSON.stringify(user));
    applyUserSession(user);

  } catch (err) {
    console.error('Error de login:', err);
    showLoginAlert('Error de conexión con el servidor: ' + err.message);
    playAudioFeedback('error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🚀 Ingresar al Sistema';
    }
  }
}

function setupUserMenuDropdown() {
  const trigger = document.getElementById('btnUserMenuTrigger');
  const dropdown = document.getElementById('userMenuDropdown');

  if (!trigger || !dropdown) return;

  function toggleDropdown(e) {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
    trigger.setAttribute('aria-expanded', !isOpen);
  }

  function closeDropdown() {
    if (dropdown) dropdown.style.display = 'none';
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  window.closeUserMenu = closeDropdown;

  trigger.addEventListener('click', toggleDropdown);

  // Cerrar al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
      closeDropdown();
    }
  });

  // Cerrar al pulsar Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });
}

function applyUserSession(user) {
  const masterNav = document.getElementById('masterNav');
  const userPill = document.getElementById('userSessionPill');
  const userName = document.getElementById('userSessionName');
  const userRole = document.getElementById('userSessionRole');
  const simSelector = document.getElementById('workerSimulatorSelectorContainer');
  const techPanel = document.getElementById('workerSecurityExplanationPanel');
  const workerHeaderId = document.getElementById('workerHeaderIdentity');

  // Elementos del Avatar y Dropdown
  const avatarCircle = document.getElementById('userAvatarCircle');
  const dropdownAvatar = document.getElementById('dropdownAvatarLarge');
  const dropdownName = document.getElementById('dropdownUserName');
  const dropdownDoc = document.getElementById('dropdownUserDoc');
  const dropdownBadge = document.getElementById('dropdownUserBadge');

  // Iniciales del usuario para avatar (ej: Juan Carlos Rivas -> JR)
  const nameParts = (user.full_name || 'U').trim().split(/\s+/);
  const initials = nameParts.length >= 2 
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : nameParts[0].substring(0, 2).toUpperCase();

  if (avatarCircle) avatarCircle.textContent = initials;
  if (dropdownAvatar) dropdownAvatar.textContent = initials;

  let roleLabel = 'Beneficiario';
  let badgeClass = 'badge badge-activo';

  if (user.role === 'worker') {
    const isJubilado = user.worker_type === 'jubilado';
    badgeClass = isJubilado ? 'badge badge-jubilado' : 'badge badge-activo';
    roleLabel = isJubilado ? 'Jubilado' : 'Beneficiario';
  } else if (user.role === 'operator') {
    badgeClass = 'badge badge-passkey';
    roleLabel = 'Operador Almacén';
  } else if (user.role === 'admin' || user.role === 'director') {
    badgeClass = 'badge badge-override';
    roleLabel = 'Administrador Sistema';
  } else {
    badgeClass = 'badge badge-override';
    roleLabel = 'Gestión Humana';
  }

  // Actualizar sesión en la cabecera
  if (userPill) userPill.style.display = 'inline-block';
  if (userName) userName.textContent = user.full_name;
  if (userRole) userRole.textContent = roleLabel;

  if (dropdownName) dropdownName.textContent = user.full_name;
  if (dropdownDoc) dropdownDoc.textContent = `C.I. ${user.document_id || ''}`;
  if (dropdownBadge) {
    dropdownBadge.className = badgeClass;
    dropdownBadge.textContent = roleLabel;
  }

  // Control Estricto de Visibilidad de Configuración & Marca (Solo Administradores del Sistema)
  const btnSettings = document.getElementById('btnOpenGeneralSettings');
  const brandingSubtab = document.querySelector('.portal-subtab[data-subtab="subtab-branding"]');
  const isAdmin = (user.role === 'admin' || user.role === 'director');

  if (btnSettings) {
    btnSettings.style.display = isAdmin ? 'flex' : 'none';
  }
  if (brandingSubtab) {
    brandingSubtab.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  // Cerrar dropdown al iniciar sesión
  if (typeof window.closeUserMenu === 'function') {
    window.closeUserMenu();
  }

  // Comportamiento estricto según Rol:
  if (user.role === 'worker') {
    // 1. EL TRABAJADOR / JUBILADO SOLO VE LA VISTA BENEFICIARIO
    if (masterNav) masterNav.style.display = 'none';
    if (simSelector) simSelector.style.display = 'none';
    if (techPanel) techPanel.style.display = 'none';
    if (workerHeaderId) workerHeaderId.textContent = `${user.full_name} (${user.document_id})`;

    STATE.selectedWorkerId = user.id;
    if (typeof window.updateWorkerCard === 'function') {
      window.updateWorkerCard();
    }
    navigateTo('view-worker');

  } else if (user.role === 'operator') {
    // 2. OPERADOR DE MESA DE DESPACHO
    if (masterNav) masterNav.style.display = 'none';
    STATE.operatorId = user.id;
    navigateTo('view-distributor');

  } else {
    // 3. ADMINISTRADOR / SUPERVISOR / RRHH
    if (masterNav) masterNav.style.display = 'flex';
    if (simSelector) simSelector.style.display = 'block';
    if (techPanel) techPanel.style.display = 'block';
    STATE.supervisorId = user.document_id;
    navigateTo('view-portal');
  }
}

function handleLogout() {
  STATE.currentUser = null;
  localStorage.removeItem('sgbt_user');
  
  if (typeof window.closeUserMenu === 'function') {
    window.closeUserMenu();
  }

  // Ocultar botón de configuración al cerrar sesión
  const btnSettings = document.getElementById('btnOpenGeneralSettings');
  if (btnSettings) btnSettings.style.display = 'none';
  
  const userPill = document.getElementById('userSessionPill');
  const masterNav = document.getElementById('masterNav');
  if (userPill) userPill.style.display = 'none';
  if (masterNav) masterNav.style.display = 'none';

  const docInput = document.getElementById('loginDocNumber');
  if (docInput) docInput.value = '';

  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';

  navigateTo('view-login');
}

function checkAuthSession() {
  try {
    const saved = localStorage.getItem('sgbt_user');
    if (saved) {
      const user = JSON.parse(saved);
      if (user && user.id) {
        STATE.currentUser = user;
        applyUserSession(user);
        return;
      }
    }
  } catch (e) {
    console.warn('Error al leer sesión guardada:', e);
  }
  
  // Si no hay sesión previa guardada, mostrar la vista de Login
  navigateTo('view-login');
}

// ============================================================================
// CARACTERÍSTICAS ENTERPRISE MULTI-TENANT B2G, NÓMINA, JORNADAS Y AVISOS
// ============================================================================

let currentTenantData = null;
let parsedCsvWorkers = [];
let cachedDistributionPoints = [];

function initEnterpriseFeatures() {
  setupTenantBranding();
  setupWorkerManagement();
  setupCampaignsManagement();
  setupDistributionPointsManagement();
  setupNotificationsSystem();
  loadTenantSettings();
  loadNotifications();
}

// ----------------------------------------------------------------------------
// 1. CONFIGURACIÓN DEL ENTE GUBERNAMENTAL / MARCA BLANCA & LOGO
// ----------------------------------------------------------------------------
async function loadTenantSettings() {
  try {
    const res = await fetch('/api/v1/tenant/settings');
    const data = await res.json();
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

    // 2. Actualizar Logotipo (Si existe URL o Base64 cargado)
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
      if (logoContainer) {
        logoContainer.innerHTML = '<svg class="icon-svg icon-md" viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2l10 5H2l10-5z"/></svg>';
      }
    }

    // 3. Aplicar colores corporativos al documento
    if (tenant.primary_color) {
      document.documentElement.style.setProperty('--sea-pacific', tenant.primary_color);
      document.documentElement.style.setProperty('--accent-primary', tenant.primary_color);
    }
    if (tenant.secondary_color) {
      document.documentElement.style.setProperty('--sea-malibu', tenant.secondary_color);
      document.documentElement.style.setProperty('--accent-secondary', tenant.secondary_color);
    }

    // 4. Llenar campos del formulario de branding (tanto en portal como en modal de configuración)
    const nameInput = document.getElementById('brandingEntityNameInput');
    const shortInput = document.getElementById('brandingEntityShortInput');
    const sloganInput = document.getElementById('brandingSloganInput');
    const urlInput = document.getElementById('brandingLogoUrlInput');
    const primaryInput = document.getElementById('brandingPrimaryColorInput');
    const secondaryInput = document.getElementById('brandingSecondaryColorInput');

    const mNameInput = document.getElementById('settingsEntityNameInput');
    const mShortInput = document.getElementById('settingsEntityShortInput');
    const mSloganInput = document.getElementById('settingsSloganInput');
    const mUrlInput = document.getElementById('settingsLogoUrlInput');
    const mPrimaryInput = document.getElementById('settingsPrimaryColorInput');
    const mSecondaryInput = document.getElementById('settingsSecondaryColorInput');

    if (nameInput) nameInput.value = tenant.entity_name || '';
    if (mNameInput) mNameInput.value = tenant.entity_name || '';

    if (shortInput) shortInput.value = tenant.entity_short_name || '';
    if (mShortInput) mShortInput.value = tenant.entity_short_name || '';

    if (sloganInput) sloganInput.value = tenant.slogan || '';
    if (mSloganInput) mSloganInput.value = tenant.slogan || '';

    const cleanUrl = (tenant.logo_url && !tenant.logo_url.startsWith('data:')) ? tenant.logo_url : '';
    if (urlInput) urlInput.value = cleanUrl;
    if (mUrlInput) mUrlInput.value = cleanUrl;

    if (primaryInput && tenant.primary_color) primaryInput.value = tenant.primary_color;
    if (mPrimaryInput && tenant.primary_color) mPrimaryInput.value = tenant.primary_color;

    if (secondaryInput && tenant.secondary_color) secondaryInput.value = tenant.secondary_color;
    if (mSecondaryInput && tenant.secondary_color) mSecondaryInput.value = tenant.secondary_color;

    // 5. Poblar selects dependientes (Departamentos y Puntos de Entrega)
    const deptSelect = document.getElementById('newWorkerDepartment');
    if (deptSelect && departments) {
      deptSelect.innerHTML = '<option value="">-- Sin Departamento Asignado --</option>';
      departments.forEach(d => {
        deptSelect.innerHTML += `<option value="${d.id}">${d.name} (${d.code})</option>`;
      });
    }

    const pointSelect = document.getElementById('campaignPointSelect');
    if (pointSelect && distributionPoints) {
      cachedDistributionPoints = distributionPoints;
      populateDistributionPointsSelect();
    }

  } catch (err) {
    console.warn('Error al cargar configuración del ente:', err);
  }
}

function setupTenantBranding() {
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

  // Botón en Header para ir directo a la subpestaña de Marca Institucional
  btnOpenBranding?.addEventListener('click', () => {
    navigateTo('view-portal');
    const brandingTabBtn = document.querySelector('.portal-subtab[data-subtab="subtab-branding"]');
    if (brandingTabBtn) brandingTabBtn.click();
  });

  // Selector de archivo de logotipo con lectura Base64
  btnSelectFile?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor seleccione un archivo de imagen válido (PNG, JPG, SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      if (previewBox) {
        previewBox.innerHTML = `<img src="${base64}" style="max-height: 80px; max-width: 100%; object-fit: contain;" alt="Vista Previa" />`;
      }
      previewBox.dataset.base64 = base64;
      if (urlInput) urlInput.value = ''; // Limpiar URL si se subió archivo
    };
    reader.readAsDataURL(file);
  });

  // Previsualización de URL directa
  urlInput?.addEventListener('input', () => {
    const url = urlInput.value.trim();
    if (url && previewBox) {
      previewBox.innerHTML = `<img src="${url}" style="max-height: 80px; max-width: 100%; object-fit: contain;" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'font-size:2rem;\\'>⚠️</span>';" alt="Preview" />`;
      delete previewBox.dataset.base64;
    }
  });

  // Feedback en vivo al mover los colores
  primaryInput?.addEventListener('input', () => {
    document.documentElement.style.setProperty('--sea-pacific', primaryInput.value);
    document.documentElement.style.setProperty('--accent-primary', primaryInput.value);
  });

  secondaryInput?.addEventListener('input', () => {
    document.documentElement.style.setProperty('--sea-malibu', secondaryInput.value);
    document.documentElement.style.setProperty('--accent-secondary', secondaryInput.value);
  });

  // Restablecer por defecto
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

  // Guardar configuración del Ente Gubernamental
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entity_name = document.getElementById('brandingEntityNameInput').value.trim();
    const entity_short_name = document.getElementById('brandingEntityShortInput').value.trim();
    const slogan = document.getElementById('brandingSloganInput').value.trim();
    const primary_color = primaryInput.value;
    const secondary_color = secondaryInput.value;
    const logo_url = previewBox?.dataset?.base64 || urlInput.value.trim() || '';

    try {
      const res = await fetch('/api/v1/tenant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_name,
          entity_short_name,
          slogan,
          logo_url,
          primary_color,
          secondary_color
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      if (alertBox) {
        alertBox.textContent = `✅ ${data.message}`;
        alertBox.style.display = 'block';
        setTimeout(() => { alertBox.style.display = 'none'; }, 4000);
      }

      await loadTenantSettings();
      playAudioFeedback('success');

    } catch (err) {
      alert('Error guardando configuración: ' + err.message);
    }
  });
}

// ----------------------------------------------------------------------------
// 2. GESTIÓN DE BENEFICIARIOS (REGISTRO INDIVIDUAL & CARGA MASIVA CSV)
// ----------------------------------------------------------------------------
function setupWorkerManagement() {
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

  // Modal Crear Beneficiario
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
      const res = await fetch('/api/v1/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id,
          full_name,
          worker_type,
          department_id,
          phone_number,
          email,
          has_smartphone
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar beneficiario');

      closeCreate();
      await loadWorkersDirectory();
      playAudioFeedback('success');
      alert(`✅ Beneficiario "${full_name}" (${document_id}) incorporado exitosamente al padrón.`);

    } catch (err) {
      if (alertCreate) {
        alertCreate.textContent = err.message;
        alertCreate.style.display = 'block';
      }
    }
  });

  // Modal Importar Nómina CSV
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

  // Drag & drop y click para seleccionar CSV
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
    statusText.textContent = `Archivo: ${file.name} (${Math.round(file.size / 1024)} KB)`;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      parseCsvContent(e.target.result);
    };
    reader.readAsText(file);
  }

  function parseCsvContent(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      alert('El archivo CSV debe contener al menos la cabecera y una fila de datos.');
      return;
    }

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/["']/g, ''));

    parsedCsvWorkers = [];
    previewBody.innerHTML = '';

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

      if (parsedCsvWorkers.length <= 10) {
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
      previewContainer.style.display = 'block';
      btnExecuteImport.disabled = false;
      alertCsv.className = 'alert-box alert-info';
      alertCsv.innerHTML = `📋 Se detectaron <strong>${parsedCsvWorkers.length} registros válidos</strong> listos para importar.`;
      alertCsv.style.display = 'block';
    } else {
      alert('No se pudieron extraer registros válidos del archivo CSV.');
    }
  }

  // Descargar plantilla CSV modelo
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

  // Ejecutar importación masiva
  btnExecuteImport?.addEventListener('click', async () => {
    if (parsedCsvWorkers.length === 0) return;

    btnExecuteImport.disabled = true;
    btnExecuteImport.textContent = '⏳ Procesando nómina...';

    try {
      const res = await fetch('/api/v1/admin/workers/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers: parsedCsvWorkers })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error durante la importación');

      alertCsv.className = 'alert-box alert-success';
      alertCsv.innerHTML = `✅ ${data.message}`;
      playAudioFeedback('success');

      await loadWorkersDirectory();
      setTimeout(closeImport, 2500);

    } catch (err) {
      alertCsv.className = 'alert-box alert-danger';
      alertCsv.textContent = err.message;
      btnExecuteImport.disabled = false;
      btnExecuteImport.textContent = '🚀 Importar Beneficiarios';
    }
  });
}

// ----------------------------------------------------------------------------
// 3. PLANIFICACIÓN Y CRONOGRAMA DE JORNADAS DE DESPACHO
// ----------------------------------------------------------------------------
async function loadCampaigns() {
  const grid = document.getElementById('campaignsGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/v1/admin/campaigns');
    const campaigns = await res.json();

    grid.innerHTML = '';
    if (campaigns.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #64748b; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: var(--radius-md);">
          📅 No hay jornadas de entrega programadas. Haga clic en <strong>"+ Programar Nueva Jornada"</strong> para crear la primera.
        </div>
      `;
      return;
    }

    // Actualizar select de combos en el modal de jornadas
    const comboSelect = document.getElementById('campaignComboSelect');
    if (comboSelect) {
      const combosRes = await fetch('/api/v1/admin/combos');
      const combosList = await combosRes.json();
      comboSelect.innerHTML = '';
      combosList.forEach(cb => {
        comboSelect.innerHTML += `<option value="${cb.id}">${cb.icon || '🍱'} ${cb.name} (${cb.category})</option>`;
      });
    }

    campaigns.forEach(c => {
      const card = document.createElement('div');
      card.className = `campaign-card status-${c.status}`;

      const pct = c.assigned_count > 0 ? Math.round((c.claimed_count / c.assigned_count) * 100) : 0;

      let statusBadge = '<span class="badge badge-activo">Programada</span>';
      if (c.status === 'en_curso') {
        statusBadge = '<span class="badge badge-passkey" style="background:#10b981; color:#fff;">● En Curso (Activa)</span>';
      } else if (c.status === 'finalizada') {
        statusBadge = '<span class="badge" style="background:#64748b; color:#fff;">Finalizada</span>';
      }

      let targetLabel = 'Universal (Todos)';
      if (c.target_group === 'activo') targetLabel = 'Solo Personal Activo';
      else if (c.target_group === 'jubilado') targetLabel = 'Solo Jubilados y Pensionados';
      else if (c.target_group === 'contratado') targetLabel = 'Solo Personal Contratado';

      card.innerHTML = `
        <div>
          <div class="campaign-header-row">
            <div>
              <div class="campaign-title-text">${c.name}</div>
              <div class="campaign-dates-row">
                <span>🗓️ ${c.start_date} al ${c.end_date}</span>
                <span>&middot;</span>
                <span>📍 ${c.point_name || 'Almacén Central'}</span>
              </div>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div style="margin: 0.85rem 0; font-size: 0.8rem; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 0.65rem 0.85rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
              <strong style="color: var(--sea-pacific);">${c.combo_icon || '🍱'} ${c.combo_name || 'Bolsa de Beneficios'}</strong>
              <span class="badge" style="font-size: 0.68rem; background: #e0f2fe; color: #0369a1;">${targetLabel}</span>
            </div>
            <div style="font-size: 0.73rem; color: #64748b;">
              ${c.combo_items ? `<strong>Artículos:</strong> ${c.combo_items.slice(0, 100)}...` : (c.description || 'Sin detalles adicionales')}
            </div>
          </div>

          <!-- Métricas de Entrega -->
          <div class="campaign-stats-grid">
            <div class="campaign-stat-item">
              <div class="stat-num">${c.total_eligible}</div>
              <div class="stat-lbl">Convocados</div>
            </div>
            <div class="campaign-stat-item">
              <div class="stat-num">${c.assigned_count}</div>
              <div class="stat-lbl">Asignados</div>
            </div>
            <div class="campaign-stat-item">
              <div class="stat-num" style="color: #10b981;">${c.claimed_count}</div>
              <div class="stat-lbl">Despachados</div>
            </div>
          </div>

          <div style="margin-top: 0.75rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.2rem; color: #64748b;">
              <span>Progreso de Entrega:</span>
              <strong>${pct}% completado</strong>
            </div>
            <div class="progress-track" style="height: 6px;">
              <div class="progress-fill fill-emerald" style="width: ${pct}%;"></div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 0.75rem; flex-wrap: wrap;">
          <button class="btn btn-outline btn-notify-campaign" data-id="${c.id}" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; background: #fff; display: inline-flex; align-items: center; gap: 0.35rem;" title="Enviar notificación a la app de los beneficiarios">
            <svg class="icon-svg icon-xs" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            <span>${c.notification_sent ? 'Reenviar Aviso' : 'Notificar'}</span>
          </button>
          
          <div style="display: flex; gap: 0.35rem;">
            ${c.status === 'programada' ? `
              <button class="btn btn-primary btn-status-campaign" data-id="${c.id}" data-status="en_curso" style="font-size: 0.75rem; padding: 0.3rem 0.65rem;">
                Iniciar Jornada
              </button>
            ` : c.status === 'en_curso' ? `
              <button class="btn btn-outline btn-status-campaign" data-id="${c.id}" data-status="finalizada" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; border-color: #64748b;">
                Finalizar
              </button>
            ` : `
              <button class="btn btn-outline btn-status-campaign" data-id="${c.id}" data-status="en_curso" style="font-size: 0.75rem; padding: 0.3rem 0.65rem;">
                Reabrir
              </button>
            `}
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    // Eventos para botones de notificar y cambiar estado
    document.querySelectorAll('.btn-notify-campaign').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        btn.textContent = '⏳ Notificando...';

        try {
          const nRes = await fetch(`/api/v1/admin/campaigns/${id}/notify`, { method: 'POST' });
          const nData = await nRes.json();
          alert(`📢 ${nData.message}`);
          playAudioFeedback('success');
          sendBrowserNotification(nData.notification.title, nData.notification.message);
          await loadNotifications();
          await loadCampaigns();
        } catch (err) {
          alert('Error al emitir notificación: ' + err.message);
          btn.disabled = false;
          btn.textContent = '📢 Notificar Beneficiarios';
        }
      });
    });

    document.querySelectorAll('.btn-status-campaign').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const status = btn.getAttribute('data-status');

        try {
          await fetch(`/api/v1/admin/campaigns/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
          });
          await loadCampaigns();
        } catch (err) {
          alert('Error actualizando estado: ' + err.message);
        }
      });
    });

  } catch (err) {
    console.error('Error cargando jornadas:', err);
  }
}

function setupCampaignsManagement() {
  const modal = document.getElementById('createCampaignModalBackdrop');
  const btnOpen = document.getElementById('btnOpenCreateCampaignModal');
  const btnClose = document.getElementById('btnCloseCreateCampaignModal');
  const btnCancel = document.getElementById('btnCancelCreateCampaign');
  const form = document.getElementById('createCampaignForm');
  const alertBox = document.getElementById('campaignAlertBox');

  // Fechas por defecto (Hoy a fin de mes)
  const today = new Date().toISOString().split('T')[0];
  const startInput = document.getElementById('campaignStartDateInput');
  const endInput = document.getElementById('campaignEndDateInput');
  if (startInput) startInput.value = today;
  if (endInput) endInput.value = today;

  btnOpen?.addEventListener('click', () => {
    form?.reset();
    const panel = document.getElementById('distributionPointFormPanel');
    if (panel) panel.style.display = 'none';
    if (startInput) startInput.value = today;
    if (endInput) endInput.value = today;
    if (alertBox) alertBox.style.display = 'none';
    modal?.classList.add('active');
  });

  const closeModal = () => {
    const panel = document.getElementById('distributionPointFormPanel');
    if (panel) panel.style.display = 'none';
    modal?.classList.remove('active');
  };
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('campaignNameInput').value.trim();
    const start_date = startInput.value;
    const end_date = endInput.value;
    const combo_id = document.getElementById('campaignComboSelect').value;
    const distribution_point_id = document.getElementById('campaignPointSelect').value;
    const target_group = document.getElementById('campaignTargetSelect').value;
    const description = document.getElementById('campaignDescriptionInput').value.trim();
    const auto_generate_entitlements = document.getElementById('campaignAutoEntitlementsCheck').checked;
    const notify_workers = document.getElementById('campaignNotifyCheck').checked;

    try {
      const res = await fetch('/api/v1/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          start_date,
          end_date,
          combo_id,
          distribution_point_id,
          target_group,
          description,
          auto_generate_entitlements
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al programar la jornada');

      if (notify_workers && data.campaign?.id) {
        await fetch(`/api/v1/admin/campaigns/${data.campaign.id}/notify`, { method: 'POST' });
        sendBrowserNotification(`📢 ¡Nueva Jornada Programada!`, `${name} para retiro de combos.`);
      }

      closeModal();
      await loadCampaigns();
      await loadNotifications();
      playAudioFeedback('success');
      alert(`✅ ${data.message}`);

    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message;
        alertBox.style.display = 'block';
      }
    }
  });
}

// ----------------------------------------------------------------------------
// 3.1 GESTIÓN DINÁMICA DE SEDES / PUNTOS DE DESPACHO (MODIFICAR & AGREGAR)
// ----------------------------------------------------------------------------
function populateDistributionPointsSelect(selectedId = null) {
  const pointSelect = document.getElementById('campaignPointSelect');
  if (!pointSelect) return;
  pointSelect.innerHTML = '';
  if (cachedDistributionPoints.length === 0) {
    pointSelect.innerHTML = '<option value="">-- Sin Sedes Registradas --</option>';
    return;
  }
  cachedDistributionPoints.forEach(p => {
    const isSelected = selectedId ? (p.id === selectedId) : false;
    pointSelect.innerHTML += `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.name} (${p.location_code})</option>`;
  });
  if (selectedId) {
    pointSelect.value = selectedId;
  }
}

async function reloadDistributionPoints(selectedId = null) {
  try {
    const res = await fetch('/api/v1/distribution-points');
    const data = await res.json();
    if (data.success && Array.isArray(data.distributionPoints)) {
      cachedDistributionPoints = data.distributionPoints;
      populateDistributionPointsSelect(selectedId);
    }
  } catch (err) {
    console.warn('Error al recargar sedes de despacho:', err);
  }
}

function setupDistributionPointsManagement() {
  const btnAdd = document.getElementById('btnAddDistributionPoint');
  const btnEdit = document.getElementById('btnEditDistributionPoint');
  const panel = document.getElementById('distributionPointFormPanel');
  const btnCancel = document.getElementById('btnCancelDistributionPointForm');
  const btnClose = document.getElementById('btnClosePointPanel');
  const btnSave = document.getElementById('btnSaveDistributionPoint');
  const btnSaveText = document.getElementById('btnSavePointText');
  const titleText = document.getElementById('distributionPointFormTitleText');
  const alertBox = document.getElementById('pointFormAlert');
  const select = document.getElementById('campaignPointSelect');

  const idInput = document.getElementById('editPointId');
  const nameInput = document.getElementById('pointNameInput');
  const codeInput = document.getElementById('pointCodeInput');
  const addressInput = document.getElementById('pointAddressInput');

  const closePanel = () => {
    if (panel) panel.style.display = 'none';
    if (alertBox) alertBox.style.display = 'none';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (codeInput) codeInput.value = '';
    if (addressInput) addressInput.value = '';
  };

  btnCancel?.addEventListener('click', closePanel);
  btnClose?.addEventListener('click', closePanel);

  // Botón "Nueva" Sede
  btnAdd?.addEventListener('click', () => {
    closePanel();
    if (titleText) titleText.textContent = 'Nueva Sede de Despacho';
    if (btnSaveText) btnSaveText.textContent = 'Guardar y Asignar Sede';
    if (panel) {
      panel.style.display = 'block';
      nameInput?.focus();
    }
  });

  // Botón "Editar" Sede Seleccionada
  btnEdit?.addEventListener('click', () => {
    const currentId = select?.value;
    if (!currentId) {
      alert('Por favor seleccione una sede en la lista para modificar.');
      return;
    }
    const current = cachedDistributionPoints.find(p => p.id === currentId);
    if (!current) {
      alert('No se encontraron los datos de la sede seleccionada.');
      return;
    }

    if (idInput) idInput.value = current.id;
    if (nameInput) nameInput.value = current.name || '';
    if (codeInput) codeInput.value = current.location_code || '';
    if (addressInput) addressInput.value = current.address || '';
    if (titleText) titleText.textContent = 'Modificar Sede de Despacho';
    if (btnSaveText) btnSaveText.textContent = 'Actualizar Sede';
    if (alertBox) alertBox.style.display = 'none';
    if (panel) {
      panel.style.display = 'block';
      nameInput?.focus();
    }
  });

  // Guardar (POST o PUT)
  btnSave?.addEventListener('click', async () => {
    const editId = idInput?.value;
    const name = nameInput?.value.trim();
    const location_code = codeInput?.value.trim().toUpperCase();
    const address = addressInput?.value.trim();

    if (!name) {
      if (alertBox) {
        alertBox.textContent = 'El nombre de la sede es obligatorio.';
        alertBox.style.display = 'block';
      }
      return;
    }

    if (!location_code) {
      if (alertBox) {
        alertBox.textContent = 'El código de ubicación es obligatorio (ej: COM-01).';
        alertBox.style.display = 'block';
      }
      return;
    }

    btnSave.disabled = true;
    const originalText = btnSaveText?.textContent;
    if (btnSaveText) btnSaveText.textContent = 'Guardando...';

    try {
      const url = editId ? `/api/v1/distribution-points/${editId}` : '/api/v1/distribution-points';
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, location_code, address })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo guardar la sede de despacho.');
      }

      const savedPoint = data.point;
      await reloadDistributionPoints(savedPoint.id);
      closePanel();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message;
        alertBox.style.display = 'block';
      }
    } finally {
      btnSave.disabled = false;
      if (btnSaveText) btnSaveText.textContent = originalText;
    }
  });
}

// ----------------------------------------------------------------------------
// 4. SISTEMA DE NOTIFICACIONES (IN-APP & WEB PUSH)
// ----------------------------------------------------------------------------
async function loadNotifications() {
  const container = document.getElementById('notificationsListContainer');
  const badge = document.getElementById('notifBadgeCount');

  try {
    const res = await fetch('/api/v1/notifications');
    const notifs = await res.json();

    if (badge) {
      if (notifs.length > 0) {
        badge.textContent = notifs.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!container) return;
    container.innerHTML = '';

    if (notifs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #64748b;">
          <svg class="icon-svg icon-md" style="margin-bottom: 0.5rem; color: #94a3b8;" viewBox="0 0 24 24"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"></path></svg>
          <div>No hay notificaciones o avisos recientes.</div>
        </div>
      `;
      return;
    }

    notifs.forEach(n => {
      const item = document.createElement('div');
      item.className = 'notification-item-card is-new';

      item.innerHTML = `
        <div class="kpi-icon-bubble" style="background: #e0f2fe; color: #0284c7; flex-shrink: 0;">
          <svg class="icon-svg icon-sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        </div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
            <strong style="color: #0f172a; font-size: 0.88rem;">${n.title}</strong>
            <span style="font-size: 0.68rem; color: #94a3b8; white-space: nowrap;">
              ${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p style="font-size: 0.78rem; color: #475569; margin-top: 0.25rem; line-height: 1.35;">${n.message}</p>
        </div>
      `;

      container.appendChild(item);
    });

  } catch (err) {
    console.warn('Error al cargar notificaciones:', err);
  }
}

function setupNotificationsSystem() {
  const modal = document.getElementById('notificationsModalBackdrop');
  const btnOpen = document.getElementById('btnNotificationsBell');
  const btnClose = document.getElementById('btnCloseNotificationsModal');
  const btnCloseBtn = document.getElementById('btnCloseNotificationsModalBtn');
  const btnToggleForm = document.getElementById('btnToggleNewAlertForm');
  const formBlock = document.getElementById('newAlertFormBlock');
  const btnSendAlert = document.getElementById('btnSendQuickAlert');
  const btnCancelAlert = document.getElementById('btnCancelQuickAlert');

  // Solicitar permiso de notificaciones push nativas al navegador
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => {
      Notification.requestPermission().catch(() => {});
    }, 3000);
  }

  btnOpen?.addEventListener('click', () => {
    loadNotifications();
    modal?.classList.add('active');
  });

  const closeModal = () => modal?.classList.remove('active');
  btnClose?.addEventListener('click', closeModal);
  btnCloseBtn?.addEventListener('click', closeModal);

  btnToggleForm?.addEventListener('click', () => {
    if (formBlock) {
      formBlock.style.display = formBlock.style.display === 'none' ? 'block' : 'none';
    }
  });

  btnCancelAlert?.addEventListener('click', () => {
    if (formBlock) formBlock.style.display = 'none';
  });

  btnSendAlert?.addEventListener('click', async () => {
    const title = document.getElementById('quickAlertTitleInput')?.value.trim();
    const message = document.getElementById('quickAlertMessageInput')?.value.trim();

    if (!title || !message) {
      alert('Por favor ingrese título y mensaje para el aviso.');
      return;
    }

    try {
      const res = await fetch('/api/v1/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, target_group: 'all' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      document.getElementById('quickAlertTitleInput').value = '';
      document.getElementById('quickAlertMessageInput').value = '';
      if (formBlock) formBlock.style.display = 'none';

      sendBrowserNotification(title, message);
      playAudioFeedback('success');
      await loadNotifications();

    } catch (err) {
      alert('Error enviando aviso: ' + err.message);
    }
  });
}

function sendBrowserNotification(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png'
      });
    }
  } catch (e) {
    console.warn('Web notification error:', e);
  }
}


