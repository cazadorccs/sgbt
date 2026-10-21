// ============================================================================
// BIO-COMBOS PLATAFORMA INTEGRAL - BOOTSTRAP & ORCHESTRATOR
// Sistema Institucional de Entrega de Víveres, Proteína y Combos (MIPPCI)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. CHEQUEO DEL MOTOR DE BASE DE DATOS (SQLITE LOCAL VS SUPABASE CLOUD)
// ----------------------------------------------------------------------------
async function checkSystemDbStatus() {
  try {
    const data = await API.get('/api/v1/system/status');
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

    const isDemo = data.is_demo_mode === true || data.is_demo_mode === 1;
    STATE.is_demo_mode = isDemo;
    STATE.is_initialized = data.is_initialized !== false;

    const installBanner = document.getElementById('setupInstallBanner');
    const setupBanner = document.getElementById('setupPendingBanner');
    const demoContainer = document.getElementById('quickDemoProfilesContainer');
    const docHint = document.getElementById('loginDocHint');
    const demoToggleLabel = document.getElementById('demoModeToggleLabel');
    const demoToggleIcon = document.getElementById('demoModeToggleIcon');

    if (isDemo || data.is_initialized === false) {
      if (installBanner) installBanner.style.display = 'block';
      if (demoContainer) demoContainer.style.display = 'block';
      if (docHint) {
        docHint.textContent = 'Ingrese el número de cédula o seleccione un perfil rápido de demostración abajo.';
      }
      if (demoToggleLabel) {
        demoToggleLabel.textContent = '🛡️ Desactivar Demostración (Modo Producción)';
      }
      if (demoToggleIcon) {
        demoToggleIcon.textContent = '🛡️';
      }
    } else {
      if (installBanner) installBanner.style.display = 'none';
      if (setupBanner) setupBanner.style.display = 'none';
      if (demoContainer) demoContainer.style.display = 'none';
      if (docHint) {
        docHint.textContent = 'Ingrese su número de Cédula de Identidad para verificar su beneficio o ingresar.';
      }
      if (demoToggleLabel) {
        demoToggleLabel.textContent = '🧪 Activar Modo de Demostración';
      }
      if (demoToggleIcon) {
        demoToggleIcon.textContent = '🧪';
      }
    }

    const portalDemoBadge = document.getElementById('portalDemoModeBadge');
    if (portalDemoBadge) {
      if (isDemo) {
        portalDemoBadge.textContent = 'Modo Demostración Activo';
        portalDemoBadge.className = 'badge badge-jubilado';
      } else {
        portalDemoBadge.textContent = 'Producción Oficial (Activa)';
        portalDemoBadge.className = 'badge badge-activo';
      }
    }

    if (data.is_initialized === false && setupBanner) {
      setupBanner.style.display = 'block';
      if (!STATE.currentUser) {
        navigateTo('view-setup-wizard');
      }
    }
  } catch (e) {
    console.warn('No se pudo consultar estado de la BD:', e);
  }
}

window.checkSystemDbStatus = checkSystemDbStatus;
window.checkDatabaseStatus = checkSystemDbStatus;

// ----------------------------------------------------------------------------
// 2. NAVEGACIÓN Y GESTIÓN DE VISTAS (RBAC)
// ----------------------------------------------------------------------------
function navigateTo(viewId) {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  const views = document.querySelectorAll('.view-section');

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
    if (typeof refreshPortalData === 'function') refreshPortalData();
  }
}

window.navigateTo = navigateTo;

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

  document.getElementById('btnRefreshPortal')?.addEventListener('click', () => {
    if (typeof refreshPortalData === 'function') refreshPortalData();
  });
  
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
// 3. CONMUTADOR DE ENTORNO DE RED (ONLINE / OFFLINE)
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
// 4. PWA: SERVICE WORKER & INSTALACIÓN NATIVA
// ----------------------------------------------------------------------------
let deferredInstallPrompt = null;

function setupPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registrado. Scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Fallo al registrar Service Worker:', err);
        });
    });
  }

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
        console.log('[PWA] Elección de instalación:', choice.outcome);
        deferredInstallPrompt = null;
        btnInstall.style.display = 'none';
      });
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplicación instalada exitosamente.');
    if (btnInstall) btnInstall.style.display = 'none';
  });
}

// ----------------------------------------------------------------------------
// 5. BOOTSTRAP PRINCIPAL EN DOMCONTENTLOADED
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // 0. Carga e inyección modular de plantillas HTML y ventanas modales
  if (typeof loadTemplates === 'function') {
    await loadTemplates();
  }

  // 1. Núcleo UI y Navegación
  setupNavigation();
  if (typeof setupGeneralSettings === 'function') setupGeneralSettings();
  setupNetworkToggle();

  // 2. Módulos funcionales
  if (typeof setupWorkerSimulator === 'function') setupWorkerSimulator();
  if (typeof setupDistributorSimulator === 'function') setupDistributorSimulator();
  if (typeof setupPayrollSimulator === 'function') setupPayrollSimulator();
  if (typeof setupWorkerManagement === 'function') setupWorkerManagement();
  if (typeof setupCampaignsManagement === 'function') setupCampaignsManagement();
  if (typeof setupDistributionPointsManagement === 'function') setupDistributionPointsManagement();
  if (typeof initCombosManagement === 'function') initCombosManagement();

  // 3. Sistema y PWA
  await checkSystemDbStatus();
  setupPwa();

  // 4. Autenticación y RBAC
  if (typeof setupAuth === 'function') setupAuth();
  if (typeof setupUserMenuDropdown === 'function') setupUserMenuDropdown();
  if (typeof initSetupWizard === 'function') initSetupWizard();

  // 5. Marca institucional, configuración y avisos
  if (typeof setupTenantBranding === 'function') setupTenantBranding();
  if (typeof setupValidationModeToggle === 'function') setupValidationModeToggle();
  if (typeof setupSupervisorDailyQrModal === 'function') setupSupervisorDailyQrModal();
  if (typeof setupNotificationsSystem === 'function') setupNotificationsSystem();
  if (typeof setupWhatsAppShareSystem === 'function') setupWhatsAppShareSystem();

  // 6. Carga inicial de datos
  if (typeof loadTenantSettings === 'function') await loadTenantSettings();
  if (typeof refreshPortalData === 'function') await refreshPortalData();
  if (typeof downloadDailyPack === 'function') await downloadDailyPack();

  // 7. Restauración de sesión y Deep links
  if (typeof checkAuthSession === 'function') checkAuthSession();
  if (typeof handleUrlDeepLinks === 'function') handleUrlDeepLinks();

  console.log('✅ [SGBT] Plataforma modularizada y lista para operar.');
});
