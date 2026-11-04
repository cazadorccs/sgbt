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
        text.textContent = '🟢 Sistema en Línea';
        pill.style.borderColor = 'rgba(16, 185, 129, 0.6)';
        pill.style.color = '#34d399';
      } else {
        text.textContent = '💾 Modo Local (Sin Conexión)';
        pill.style.borderColor = 'rgba(102, 204, 255, 0.4)';
        pill.style.color = 'var(--sea-onahau)';
      }
    }

    const isDemo = Boolean(
      data.is_demo_mode === true || data.is_demo_mode === 1 || 
      (data.tenant && (data.tenant.is_demo_mode === true || data.tenant.is_demo_mode === 1))
    );
    STATE.is_demo_mode = isDemo;
    STATE.is_initialized = data.is_initialized !== false && (data.tenant ? data.tenant.is_initialized !== 0 : true);

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

  if (STATE.currentUser) {
    const isWorker = STATE.currentUser.role === 'worker';
    const isOp = STATE.currentUser.role === 'operator' || STATE.currentUser.role === 'distributor';

    if (isWorker) {
      if (viewId !== 'view-worker' && viewId !== 'view-login') {
        viewId = 'view-worker';
      }
    } else if (isOp) {
      // Blindaje estricto de rol: La mesa de despacho solo puede ver la pantalla de mesa de despacho
      if (viewId !== 'view-distributor' && viewId !== 'view-login') {
        viewId = 'view-distributor';
      }
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

  const activeBtns = document.querySelectorAll(`.nav-tab-btn[data-view="${viewId}"]`);
  activeBtns.forEach(btn => btn.classList.add('active'));

  // Visibilidad de barra de navegación inferior móvil
  const bottomNav = document.getElementById('mobileBottomNav');
  if (bottomNav) {
    if (viewId === 'view-login') {
      bottomNav.style.display = 'none';
    } else {
      bottomNav.style.display = '';
    }
  }

  STATE.currentView = viewId;

  if (viewId === 'view-portal') {
    const visibleSubtab = Array.from(document.querySelectorAll('.portal-content-block')).find(b => b.style.display !== 'none');
    if (!visibleSubtab) {
      const manualBtn = document.querySelector('.portal-subtab[data-subtab="subtab-manual-dispatch"]') || document.querySelector('.portal-subtab[data-subtab="subtab-dashboard"]');
      if (manualBtn) manualBtn.click();
    }
    if (typeof refreshPortalData === 'function') refreshPortalData();
    if (window.ManualDispatch && typeof window.ManualDispatch.loadTodaySummary === 'function') {
      window.ManualDispatch.loadTodaySummary();
    }
  } else if (viewId === 'view-distributor') {
    if (window.ManualDispatch && typeof window.ManualDispatch.loadTodaySummary === 'function') {
      window.ManualDispatch.loadTodaySummary();
    }
  }
}

window.navigateTo = navigateTo;

/**
 * Comparte el enlace oficial de la APK Android por WhatsApp o Web Share API
 * Enlace Oficial: https://sgbt-bice.vercel.app/download/sgbt-v3.7.apk
 */
window.shareApkViaWhatsApp = function() {
  const apkUrl = 'https://sgbt-bice.vercel.app/download/sgbt-v3.7.apk';
  const text = `📲 *Sistema SGBT - MIPPCI: APK Oficial Android (v3.7)*\n\nDescarga e instala el aplicativo oficial para terminales de almacén y entrega de beneficios institucionales:\n🔗 ${apkUrl}\n\n_Ministerio del Poder Popular para la Comunicación y la Información_`;

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  if (navigator.share) {
    navigator.share({
      title: 'APK Oficial Android v3.7 - SGBT MIPPCI',
      text: text,
      url: apkUrl
    }).catch(() => {
      window.open(waUrl, '_blank');
    });
  } else {
    window.open(waUrl, '_blank');
  }
};

/**
 * Detecta si la aplicación se ejecuta dentro del aplicativo APK Android o PWA
 */
window.isApkEnvironment = function() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isAndroidWv = /wv|Android.*Version\/[\d.]+/i.test(navigator.userAgent) || document.referrer.includes('android-app://');
  const isApkParam = new URLSearchParams(window.location.search).get('source') === 'apk' || sessionStorage.getItem('sgbt_apk_mode') === 'true';
  return isStandalone || isAndroidWv || isApkParam;
};

/**
 * Aplica restricciones en el Módulo de Gestión (Sidebar Drawer) para la APK:
 * Oculta "Navegación del Sistema" y expone exclusivamente las "Herramientas Móviles".
 */
window.applyApkSidebarRestrictions = function() {
  const isApk = window.isApkEnvironment();
  const currentUser = window.STATE?.currentUser || (typeof sessionManager !== 'undefined' ? sessionManager.getUser() : null);
  const isBeneficiary = currentUser?.role === 'worker' || sessionStorage.getItem('sgbt_session_view_mode') === 'beneficiary';

  const navSystemLabel = document.getElementById('sidebarNavLabelSystem');
  const masterNav = document.getElementById('masterNav');

  // Si está en el aplicativo APK o en sesión de beneficiario: NO mostrar "Navegación del Sistema"
  if (isApk || isBeneficiary) {
    if (navSystemLabel) navSystemLabel.style.display = 'none';
    if (masterNav) masterNav.style.display = 'none';
  } else {
    if (navSystemLabel) navSystemLabel.style.display = '';
    if (masterNav) masterNav.style.display = 'flex';
  }
};

function setupNavigation() {
  const sidebarDrawer = document.getElementById('appSidebarDrawer');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const btnCloseSidebar = document.getElementById('btnCloseSidebar');

  function openSidebar() {
    if (typeof window.applyApkSidebarRestrictions === 'function') {
      window.applyApkSidebarRestrictions();
    }
    if (sidebarDrawer) {
      sidebarDrawer.classList.add('open');
      sidebarDrawer.setAttribute('aria-hidden', 'false');
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.classList.add('open');
      sidebarBackdrop.setAttribute('aria-hidden', 'false');
    }
    if (btnToggleSidebar) {
      btnToggleSidebar.setAttribute('aria-expanded', 'true');
    }
    document.body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    if (sidebarDrawer) {
      sidebarDrawer.classList.remove('open');
      sidebarDrawer.setAttribute('aria-hidden', 'true');
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.classList.remove('open');
      sidebarBackdrop.setAttribute('aria-hidden', 'true');
    }
    if (btnToggleSidebar) {
      btnToggleSidebar.setAttribute('aria-expanded', 'false');
    }
    document.body.classList.remove('sidebar-open');
  }

  window.openSidebar = openSidebar;
  window.closeSidebar = closeSidebar;

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sidebarDrawer && sidebarDrawer.classList.contains('open');
      if (isOpen) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  const btnBottomNavMore = document.getElementById('bottomNavMore');
  if (btnBottomNavMore) {
    btnBottomNavMore.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sidebarDrawer && sidebarDrawer.classList.contains('open');
      if (isOpen) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', () => {
      closeSidebar();
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      closeSidebar();
    });
  }

  // Cerrar sidebar con la tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebarDrawer && sidebarDrawer.classList.contains('open')) {
      closeSidebar();
    }
  });

  const navBtns = document.querySelectorAll('.nav-tab-btn');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      navigateTo(viewId);
      closeSidebar();
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
// 3. CONMUTADOR DE ENTORNO DE RED (ONLINE / OFFLINE) Y ESCUCHA NATIVA
// ----------------------------------------------------------------------------
function setupNetworkToggle() {
  const btn = document.getElementById('btnToggleNetwork');
  const pill = document.getElementById('connectionPill');
  const text = document.getElementById('connectionText');
  const dropdownLabel = document.getElementById('networkToggleItemLabel');

  function updateNetworkUI(isOnline) {
    STATE.isOnline = isOnline;
    if (isOnline) {
      if (pill) {
        pill.className = 'status-pill status-pill-compact online';
        pill.title = 'Estado del entorno de red: Online (Clic para conmutar simulación)';
      }
      if (text) text.textContent = 'Online';
      if (dropdownLabel) dropdownLabel.textContent = 'Simular Desconexión';
      if (typeof window.syncDeferredQueue === 'function') {
        window.syncDeferredQueue(true);
      }
    } else {
      if (pill) {
        pill.className = 'status-pill status-pill-compact offline';
        pill.title = 'Estado del entorno de red: Desconectado / Offline (Clic para reconectar)';
      }
      if (text) text.textContent = 'Offline';
      if (dropdownLabel) dropdownLabel.textContent = 'Restablecer Red Online';
    }
  }

  function toggle() {
    updateNetworkUI(!STATE.isOnline);
  }

  // Escucha activa de cambios en la conexión de datos móviles y Wi-Fi del dispositivo
  window.addEventListener('online', () => {
    console.log('[NETWORK] 📶 Conexión de red restablecida a nivel de sistema operativo.');
    updateNetworkUI(true);
  });

  window.addEventListener('offline', () => {
    console.warn('[NETWORK] 🚫 Pérdida de conectividad móvil / Wi-Fi detectada.');
    updateNetworkUI(false);
  });

  // Estado inicial basado en la conectividad del dispositivo
  if (typeof navigator.onLine === 'boolean') {
    STATE.isOnline = navigator.onLine;
    updateNetworkUI(navigator.onLine);
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
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) {
    if (btnInstall) btnInstall.style.display = 'none';
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstall) {
      btnInstall.innerHTML = '📲 Instalar App';
      btnInstall.style.display = 'inline-flex';
      btnInstall.onclick = async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        console.log('[PWA] Elección de instalación:', choice.outcome);
        if (choice.outcome === 'accepted') {
          if (window.showToast) window.showToast('¡Instalando Bienestar MIPPCI en tu dispositivo!', 'success');
        }
        deferredInstallPrompt = null;
        btnInstall.style.display = 'none';
      };
    }
  });

  // Soporte de guía para dispositivos iOS (Safari)
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIos && !isStandalone && btnInstall) {
    btnInstall.innerHTML = '📲 Instalar App';
    btnInstall.style.display = 'inline-flex';
    btnInstall.onclick = () => {
      if (window.showToast) {
        window.showToast('Para instalar en iPhone: Pulsa el botón Compartir (cuadrado con flecha hacia arriba) y selecciona "Agregar a pantalla de inicio".', 'info', 7000);
      } else {
        alert('Para instalar en iPhone: Pulsa el botón Compartir y selecciona "Agregar a pantalla de inicio".');
      }
    };
  }

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplicación instalada exitosamente.');
    if (btnInstall) btnInstall.style.display = 'none';
    if (window.showToast) window.showToast('¡Bienestar MIPPCI instalado con éxito en tu dispositivo!', 'success');
  });
}

// ----------------------------------------------------------------------------
// 4.5. SISTEMA DE TOOLTIPS FLOTANTES ACCESIBLES (WCAG 2.2)
// ----------------------------------------------------------------------------
function setupGlobalTooltips() {
  let tooltipEl = null;

  function ensureTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'app-floating-tooltip';
      tooltipEl.setAttribute('role', 'tooltip');
      tooltipEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  document.addEventListener('pointerover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    const tip = ensureTooltip();
    tip.textContent = text;
    tip.classList.add('visible');

    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    // Posición centrada sobre el elemento
    let top = rect.top - tipRect.height - 8;
    let left = rect.left + (rect.width / 2) - (tipRect.width / 2);

    // Si se desborda por la parte superior, reposicionar abajo
    if (top < 8) {
      top = rect.bottom + 8;
    }
    // Evitar desbordes de los bordes laterales
    if (left < 10) left = 10;
    if (left + tipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tipRect.width - 10;
    }

    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  });

  document.addEventListener('pointerout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target && tooltipEl) {
      tooltipEl.classList.remove('visible');
    }
  });

  window.addEventListener('scroll', () => {
    if (tooltipEl && tooltipEl.classList.contains('visible')) {
      tooltipEl.classList.remove('visible');
    }
  }, { passive: true, capture: true });
}

// ----------------------------------------------------------------------------
// 5. BOOTSTRAP PRINCIPAL EN DOMCONTENTLOADED
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // 0. Carga e inyección modular de plantillas HTML y ventanas modales
  if (typeof loadTemplates === 'function') {
    await loadTemplates();
  }

  // 1. Núcleo UI, Navegación y Autenticación INMEDIATA (0 ms)
  setupNavigation();
  setupGlobalTooltips();
  if (typeof setupAuth === 'function') setupAuth();
  if (typeof setupUserMenuDropdown === 'function') setupUserMenuDropdown();
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

  // 3. Sistema y PWA (asíncrono, no bloquea interactividad UI)
  checkSystemDbStatus().catch(err => console.warn('checkSystemDbStatus warning:', err));
  setupPwa();

  // 4. Seguridad Bancaria de Sesión y Asistente Inicial
  if (window.SessionManager && typeof window.SessionManager.init === 'function') {
    window.SessionManager.init();
  }
  if (typeof initSetupWizard === 'function') initSetupWizard();

  // 5. Marca institucional, configuración y avisos
  if (typeof setupTenantBranding === 'function') setupTenantBranding();
  if (typeof setupValidationModeToggle === 'function') setupValidationModeToggle();
  if (typeof setupSupervisorDailyQrModal === 'function') setupSupervisorDailyQrModal();
  if (typeof setupNotificationsSystem === 'function') setupNotificationsSystem();
  if (typeof setupWhatsAppShareSystem === 'function') setupWhatsAppShareSystem();
  if (typeof setupDelegationModal === 'function') setupDelegationModal();

  // 6. Carga inicial de datos
  if (typeof loadTenantSettings === 'function') await loadTenantSettings();
  if (typeof refreshPortalData === 'function') await refreshPortalData();
  if (typeof downloadDailyPack === 'function') await downloadDailyPack();

  // 7. Restauración de sesión y Deep links
  if (typeof checkAuthSession === 'function') checkAuthSession();
  if (typeof handleUrlDeepLinks === 'function') handleUrlDeepLinks();

  console.log('✅ [SGBT] Plataforma modularizada y lista para operar.');
});
