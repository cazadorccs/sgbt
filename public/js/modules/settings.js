// ============================================================================
// MODULE: SETTINGS, ACCESSIBILITY, FACTORY RESET & SETUP WIZARD
// ============================================================================

window.setupGeneralSettings = function() {
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

  try {
    const isSavedHighContrast = localStorage.getItem('sgbt_high_contrast') === 'true';
    if (isSavedHighContrast) {
      applyHighContrast(true, false);
    }
  } catch (e) {
    console.warn('Error leyendo localStorage de accesibilidad:', e);
  }

  toggleHighContrast?.addEventListener('change', (e) => {
    applyHighContrast(e.target.checked, true);
  });

  // Selector de expiración de sesión bancaria
  const selectSessionTimeout = document.getElementById('selectSessionTimeoutSetting');
  if (selectSessionTimeout && window.SessionManager) {
    const currentConfig = window.SessionManager.getConfig();
    selectSessionTimeout.value = currentConfig.inactivityMinutes.toString();

    selectSessionTimeout.addEventListener('change', (e) => {
      const mins = parseInt(e.target.value, 10);
      window.SessionManager.saveConfig(mins);
      if (typeof window.showToast === 'function') {
        window.showToast(`Seguridad bancaria: Sesión configurada a ${mins} minutos de inactividad.`, 'info');
      }
    });
  }

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

  btnOpen?.addEventListener('click', () => {
    if (typeof window.closeUserMenu === 'function') {
      window.closeUserMenu();
    }
    if (!STATE.currentUser || (STATE.currentUser.role !== 'admin' && STATE.currentUser.role !== 'director')) {
      window.showToast('Acceso restringido: Solo para Administradores del Sistema.', 'warning');
      return;
    }
    if (typeof loadTenantSettings === 'function') loadTenantSettings();
    if (modalBackdrop) modalBackdrop.classList.add('active');
  });

  const closeModal = () => {
    if (modalBackdrop) modalBackdrop.classList.remove('active');
  };

  btnClose?.addEventListener('click', closeModal);
  btnApply?.addEventListener('click', closeModal);

  modalBackdrop?.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  btnMobileToggle?.addEventListener('click', () => {
    const current = document.body.classList.contains('senior-accessible-mode');
    applyHighContrast(!current, true);
  });

  // Zona de peligro: Backup y Factory Reset
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
      btnExecuteResetConfirm.disabled = (val !== 'REINICIAR SISTEMA' && val !== '0578');
    }
  });

  btnExecuteResetConfirm?.addEventListener('click', async () => {
    const val = inputResetPhrase?.value.trim();
    if (val !== 'REINICIAR SISTEMA' && val !== '0578') return;

    btnExecuteResetConfirm.disabled = true;
    btnExecuteResetConfirm.textContent = 'Descargando backup y restableciendo...';

    try {
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

      const keep_templates = document.getElementById('checkKeepTemplatesReset')?.checked ?? true;
      const data = await API.post('/api/v1/admin/factory-reset', {
        phrase: val || '0578',
        pin: '0578',
        keep_templates
      });

      closeResetModal();
      closeModal();
      STATE.setCurrentUser(null);
      try {
        sessionStorage.clear();
      } catch (e) {}

      playAudioFeedback('success');
      window.showToast('✅ Sistema restablecido a cero exitosamente.', 'success');

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
};

window.initSetupWizard = function() {
  let wizardCurrentStep = 1;
  let wizardParsedWorkers = [];

  const indicators = [1, 2, 3, 4, 5].map(i => document.getElementById(`wizardStepIndicator-${i}`));
  const stepContents = [1, 2, 3, 4, 5].map(i => document.getElementById(`wizardStepContent-${i}`));
  const alertBox = document.getElementById('wSetupAlertBox');

  let wizardCombosList = [
    {
      id: 'm1',
      enabled: true,
      mesa_number: 1,
      mesa_name: 'Mesa 1 - Víveres Secos',
      name: 'Bolsa de Víveres Secos (Canasta Básica MIPPCI)',
      category: 'bolsa_viveres',
      conservation: 'Ambiente',
      target_qty: '1 bolsa por funcionario',
      calories: 1400,
      icon: '📦',
      items_detail: '4 kg Harina de Maíz, 2 kg Arroz, 2 kg Pasta, 1 Lt Aceite, 1 kg Azúcar, 1 kg Granos Negros, 2 Latas Sardinas, 1 Paquete Café (250g)'
    },
    {
      id: 'm2',
      enabled: true,
      mesa_number: 2,
      mesa_name: 'Mesa 2 - Higiene y Aseo Personal',
      name: 'Combo de Higiene Personal & Aseo del Hogar',
      category: 'combo_higienico',
      conservation: 'Ambiente',
      target_qty: '1 combo por trabajador',
      calories: 0,
      icon: '🧼',
      items_detail: '4 Jabones de Tocador, 1 Crema Dental, 1 Jabón Líquido Lavaplatos, 1 Detergente en Polvo (1kg), 1 Champú Familiar (400ml), 4 Rollos Papel Higiénico'
    },
    {
      id: 'm3',
      enabled: true,
      mesa_number: 3,
      mesa_name: 'Mesa 3 - Dotación Escolar',
      name: 'Dotación de Útiles Escolares',
      category: 'utiles_escolares',
      conservation: 'Ambiente',
      target_qty: '1 dotación por hijo',
      calories: 0,
      icon: '🎒',
      items_detail: '4 Cuadernos, 1 Caja Creyones de Madera, 1 Caja Lápices Grafito, 1 Juego Geometría, 1 Cartuchera y Morral'
    },
    {
      id: 'm4',
      enabled: true,
      mesa_number: 4,
      mesa_name: 'Mesa 4 - Proteínas y Cadena de Frío',
      name: 'Combo Proteico Fresco (Cadena de Frío)',
      category: 'combo_proteico',
      conservation: 'Cadena de Frío',
      target_qty: '1 combo por funcionario',
      calories: 1800,
      icon: '🍗',
      items_detail: '2 Pollos Enteros (4.2 kg), 1 Carne de Res para Guisar (1.5 kg), 1 Cartón de Huevos (30 unid), 1 Mortadela Especial (1 kg)'
    }
  ];

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

    if (step === 4) renderWizardCombos();
    if (step === 5) updateWizardSummary();
  }

  function renderWizardCombos() {
    const container = document.getElementById('wizardCombosContainer');
    if (!container) return;

    container.innerHTML = wizardCombosList.map((m, idx) => {
      const isCold = (m.conservation || '').includes('Frío');
      return `
        <div class="wizard-combo-card" data-index="${idx}" style="background: #ffffff; border: 1px solid ${m.enabled ? (isCold ? '#bae6fd' : '#cbd5e1') : '#e2e8f0'}; border-left: 5px solid ${m.enabled ? (isCold ? '#0284c7' : 'var(--sea-pacific)') : '#94a3b8'}; border-radius: var(--radius-sm); padding: 1rem 1.15rem; margin-bottom: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">${m.icon}</span>
              <span style="font-weight: 800; font-size: 0.88rem; color: #0f172a;">Estación N° ${m.mesa_number}</span>
              <span style="font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 9999px; font-weight: 700; background: ${isCold ? '#e0f2fe' : '#f1f5f9'}; color: ${isCold ? '#0369a1' : '#475569'};">
                ${isCold ? '❄️ Cadena de Frío' : '🌡️ Ambiente'}
              </span>
            </div>
            <label style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 600;">
              <input type="checkbox" class="w-combo-toggle" data-index="${idx}" ${m.enabled ? 'checked' : ''} />
              <span>${m.enabled ? 'Habilitada' : 'Deshabilitada'}</span>
            </label>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <input type="text" class="form-input w-input-mesa-name" data-index="${idx}" value="${m.mesa_name}" placeholder="Nombre de Mesa" />
            <input type="text" class="form-input w-input-combo-name" data-index="${idx}" value="${m.name}" placeholder="Nombre del Combo" />
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.w-combo-toggle').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (wizardCombosList[idx]) {
          wizardCombosList[idx].enabled = e.target.checked;
          renderWizardCombos();
        }
      });
    });

    container.querySelectorAll('.w-input-mesa-name').forEach(el => {
      el.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (wizardCombosList[idx]) wizardCombosList[idx].mesa_name = e.target.value;
      });
    });

    container.querySelectorAll('.w-input-combo-name').forEach(el => {
      el.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (wizardCombosList[idx]) wizardCombosList[idx].name = e.target.value;
      });
    });
  }

  function updateWizardSummary() {
    const adminDoc = document.getElementById('wAdminDocInput')?.value.trim() || '-';
    const adminName = document.getElementById('wAdminNameInput')?.value.trim() || '-';
    const tenantName = document.getElementById('wTenantNameInput')?.value.trim() || '-';
    const tenantShort = document.getElementById('wTenantShortInput')?.value.trim() || '-';
    const pointName = document.getElementById('wPointNameInput')?.value.trim() || '-';
    const pointCode = document.getElementById('wPointCodeInput')?.value.trim() || '-';

    const sTenant = document.getElementById('wSummaryTenant');
    const sAdmin = document.getElementById('wSummaryAdmin');
    const sPoint = document.getElementById('wSummaryPoint');
    const sComboCount = document.getElementById('wSummaryComboCount');

    if (sTenant) sTenant.textContent = `${tenantName} (${tenantShort})`;
    if (sAdmin) sAdmin.textContent = `${adminName} (${adminDoc})`;
    if (sPoint) sPoint.textContent = `${pointName} (${pointCode})`;

    const activeCombos = wizardCombosList.filter(c => c.enabled);
    if (sComboCount) sComboCount.textContent = `${activeCombos.length} mesas activas`;
  }

  document.getElementById('btnLaunchInstallWizard')?.addEventListener('click', () => {
    renderWizardCombos();
    renderWizardStep(1);
    navigateTo('view-setup-wizard');
  });

  document.getElementById('btnLaunchWizardFromLogin')?.addEventListener('click', () => {
    renderWizardCombos();
    renderWizardStep(1);
    navigateTo('view-setup-wizard');
  });

  document.getElementById('btnOpenWizardFromBanner')?.addEventListener('click', () => {
    renderWizardCombos();
    renderWizardStep(1);
    navigateTo('view-setup-wizard');
  });

  document.getElementById('btnCancelWizardToLogin')?.addEventListener('click', () => {
    navigateTo('view-login');
  });

  document.getElementById('btnWizardNext-1')?.addEventListener('click', () => renderWizardStep(2));
  document.getElementById('btnWizardPrev-2')?.addEventListener('click', () => renderWizardStep(1));
  document.getElementById('btnWizardNext-2')?.addEventListener('click', () => renderWizardStep(3));
  document.getElementById('btnWizardPrev-3')?.addEventListener('click', () => renderWizardStep(2));
  document.getElementById('btnWizardNext-3')?.addEventListener('click', () => renderWizardStep(4));
  document.getElementById('btnWizardPrev-4')?.addEventListener('click', () => renderWizardStep(3));
  document.getElementById('btnWizardNext-4')?.addEventListener('click', () => renderWizardStep(5));
  document.getElementById('btnWizardPrev-5')?.addEventListener('click', () => renderWizardStep(4));

  document.getElementById('btnExecuteSetupFinal')?.addEventListener('click', async () => {
    const adminDoc = document.getElementById('wAdminDocInput')?.value.trim();
    const adminName = document.getElementById('wAdminNameInput')?.value.trim();
    const adminEmail = document.getElementById('wAdminEmailInput')?.value.trim();
    const adminPhone = document.getElementById('wAdminPhoneInput')?.value.trim();
    const tenantName = document.getElementById('wTenantNameInput')?.value.trim();
    const tenantShort = document.getElementById('wTenantShortInput')?.value.trim();
    const tenantSlogan = document.getElementById('wTenantSloganInput')?.value.trim();
    const tenantColor = document.getElementById('wTenantPrimaryColor')?.value || '#0284c7';
    const pointName = document.getElementById('wPointNameInput')?.value.trim();
    const pointCode = document.getElementById('wPointCodeInput')?.value.trim();

    const activeCombos = wizardCombosList.filter(m => m.enabled);

    try {
      const data = await API.post('/api/v1/setup/initialize', {
        admin: { document_id: adminDoc, full_name: adminName, email: adminEmail, phone_number: adminPhone },
        tenant: { entity_name: tenantName, entity_short_name: tenantShort, slogan: tenantSlogan, primary_color: tenantColor },
        distribution_point: { name: pointName, location_code: pointCode },
        combos: activeCombos,
        workers: wizardParsedWorkers
      });

      if (data.admin) {
        STATE.setCurrentUser(data.admin);
        applyUserSession(data.admin);
      }

      window.showToast('🎉 ¡Plataforma instalada con éxito!', 'success');
      navigateTo('view-portal');

    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message;
        alertBox.style.display = 'block';
      }
    }
  });

  renderWizardStep(1);
};
