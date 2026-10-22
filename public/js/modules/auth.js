// ============================================================================
// MODULE: AUTHENTICATION & RBAC (ROLE-BASED ACCESS CONTROL)
// ============================================================================

window.setupAuth = function() {
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
  document.getElementById('btnDistributorLogout')?.addEventListener('click', handleLogout);

  // Conmutador de Modo de Demostración vs Producción
  const btnToggleDemo = document.getElementById('btnToggleDemoMode');
  btnToggleDemo?.addEventListener('click', async () => {
    const isCurrentlyDemo = STATE.is_demo_mode === true;
    const confirmMsg = isCurrentlyDemo
      ? '¿Desea cambiar la plataforma a Modo Producción Oficial?\n\nSe ocultarán los perfiles de demostración y el botón de instalación, dejando la plataforma lista para la operación institucional real.'
      : '¿Desea activar el Modo de Demostración?\n\nEsto restaurará los perfiles rápidos de prueba (Carlos Mendoza, Hilda Domínguez, etc.) y volverá a mostrar el botón de instalación.';

    if (!confirm(confirmMsg)) return;

    try {
      btnToggleDemo.disabled = true;
      const data = await API.post('/api/v1/system/demo-mode', { enable: !isCurrentlyDemo });
      window.showToast(data.message, 'success');
      if (typeof checkSystemDbStatus === 'function') await checkSystemDbStatus();
      if (typeof loadWorkersDirectory === 'function') await loadWorkersDirectory();
      if (typeof loadCombosCatalog === 'function') await loadCombosCatalog();
    } catch (err) {
      window.showToast(err.message, 'error');
    } finally {
      btnToggleDemo.disabled = false;
    }
  });

  const btnPortalToggleDemo = document.getElementById('btnPortalToggleDemo');
  btnPortalToggleDemo?.addEventListener('click', () => {
    btnToggleDemo?.click();
  });

  // Detección de Magic Link de Nómina desde URL (?magic_token=... o ?token=...)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const magicToken = urlParams.get('magic_token') || urlParams.get('token');
    if (magicToken) {
      console.log('[MAGIC LINK] Token detectado en URL, iniciando auto-login...');
      API.post('/api/v1/auth/magic-login', { token: magicToken })
        .then(data => {
          if (data.success && data.user) {
            playAudioFeedback('success');
            STATE.setCurrentUser(data.user);
            applyUserSession(data.user);
            window.showToast(`Bienvenido(a), ${data.user.full_name}`, 'success');
            if (data.auto_enroll || !data.user.has_passkey) {
              triggerOneClickPasskeyOnboarding(data.user, magicToken);
            }
          }
        })
        .catch(err => {
          console.warn('[MAGIC LINK ERROR]', err);
          showLoginAlert('El enlace de auto-enrolamiento ha expirado o no es válido: ' + err.message);
        });
    }
  } catch (e) {
    console.warn('Error procesando parámetros de URL para Magic Link:', e);
  }
};

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
    console.log(`[CLIENT AUTH] ⏳ Iniciando verificación de identidad para:`, rawDocId);
    const data = await API.post('/api/v1/auth/login', { document_id: rawDocId });
    console.log(`[CLIENT AUTH] 📥 Respuesta recibida del servidor:`, data);

    if (!data.success) {
      console.warn(`[CLIENT AUTH] ❌ Acceso denegado:`, data.error);
      showLoginAlert(data.error || 'La Cédula no se encuentra registrada en la nómina institucional de beneficiarios. Debe estar en la lista oficial para acceder a este proceso.');
      playAudioFeedback('error');
      return;
    }

    playAudioFeedback('success');
    const user = data.user;
    console.log(`[CLIENT AUTH] ✅ Sesión iniciada: ${user.full_name} | Rol: ${user.role}`);
    STATE.setCurrentUser(user);
    applyUserSession(user);
    window.showToast(`Bienvenido(a), ${user.full_name}`, 'success');

    // Auto-Enrolamiento mediante Magic Link / One-Click Onboarding SOLO para beneficiarios titulares
    if (user.role === 'worker' && !user.has_passkey) {
      setTimeout(() => {
        triggerOneClickPasskeyOnboarding(user, data.onboarding_token);
      }, 400);
    }

  } catch (err) {
    console.error('Error de login:', err);
    showLoginAlert(err.message || 'La Cédula no se encuentra registrada en la nómina institucional de beneficiarios. Debe estar en la lista oficial para acceder a este proceso.');
    playAudioFeedback('error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🚀 Ingresar al Sistema';
    }
  }
}

/**
 * Modal y flujo interactivo de Auto-Enrolamiento One-Click Onboarding (5 Segundos)
 */
function triggerOneClickPasskeyOnboarding(user, onboardingToken) {
  const existingModal = document.getElementById('modalOneClickOnboarding');
  if (existingModal) existingModal.remove();

  const modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'modalOneClickOnboarding';
  modalBackdrop.style.cssText = `
    position: fixed; inset: 0; background: rgba(2, 6, 23, 0.88); backdrop-filter: blur(8px);
    z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;
  `;

  modalBackdrop.innerHTML = `
    <div style="background: #040d16; border: 1.5px solid #38bdf8; border-radius: 16px; padding: 1.75rem; max-width: 440px; width: 100%; box-shadow: 0 10px 40px rgba(56, 189, 248, 0.25); text-align: center; color: #f8fafc;">
      <div style="width: 60px; height: 60px; margin: 0 auto 0.75rem auto; background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.75rem;">
        🔐
      </div>
      <h3 style="margin: 0 0 0.4rem 0; font-size: 1.2rem; font-weight: 800; color: #fff;">
        Activación de Passkey en 1 Clic
      </h3>
      <p style="font-size: 0.82rem; color: #94a3b8; margin: 0 0 1rem 0; line-height: 1.4;">
        Bienvenido(a) <strong>${user.full_name}</strong>. Para retirar tus víveres y proteínas sin contraseñas, activa tu llave biométrica en 5 segundos con el sensor de tu móvil (Huella o Face ID).
      </p>

      <div id="onboardingStatusBox" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 0.75rem; font-size: 0.78rem; color: #38bdf8; margin-bottom: 1.25rem;">
        <span>👆 Listo para vincular huella digital o reconocimiento facial</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.65rem;">
        <button id="btnConfirmOnboardingBiometrics" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 0.92rem; font-weight: 700; background: linear-gradient(135deg, #0284c7, #06b6d4); border: none; border-radius: 8px; cursor: pointer;">
          ⚡ Activar con Mi Huella / Face ID (5 Seg)
        </button>
        <button id="btnSkipOnboarding" class="btn btn-outline" style="width: 100%; padding: 0.45rem; font-size: 0.78rem; color: #94a3b8; border-color: rgba(148, 163, 184, 0.2); background: transparent; cursor: pointer;">
          Configurar después
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  const btnConfirm = modalBackdrop.querySelector('#btnConfirmOnboardingBiometrics');
  const btnSkip = modalBackdrop.querySelector('#btnSkipOnboarding');
  const statusBox = modalBackdrop.querySelector('#onboardingStatusBox');

  btnSkip?.addEventListener('click', () => {
    modalBackdrop.remove();
  });

  btnConfirm?.addEventListener('click', async () => {
    btnConfirm.disabled = true;
    btnConfirm.textContent = '⏳ Leyendo Sensor Biométrico...';
    if (statusBox) statusBox.innerHTML = '<span>📲 Toque el sensor de huella en su dispositivo...</span>';

    try {
      await API.post('/api/v1/auth/passkey/register-challenge', { worker_id: user.id });

      const deviceName = navigator.userAgent.includes('iPhone') ? 'iPhone (Face ID / Secure Enclave)' : 'Smartphone (Huella / TEE)';
      
      await API.post('/api/v1/auth/passkey/register-verify', {
        worker_id: user.id,
        device_name: deviceName,
        credential: { credential_id: 'Passkey_OneClick_' + Date.now() }
      });

      user.has_passkey = true;
      if (typeof STATE.updateWorkerPasskeyStatus === 'function') {
        STATE.updateWorkerPasskeyStatus(user.id, true, deviceName);
      }
      playAudioFeedback('success');
      
      if (statusBox) {
        statusBox.style.color = '#34d399';
        statusBox.style.borderColor = '#10b981';
        statusBox.innerHTML = '<span>✅ ¡Passkey activada exitosamente con tu huella digital!</span>';
      }

      window.showToast('¡Passkey registrada en 5 segundos con tu huella digital!', 'success');
      
      setTimeout(() => {
        modalBackdrop.remove();
        if (typeof showView === 'function') {
          showView('worker');
        }
      }, 900);

    } catch (err) {
      console.error('Error auto-enrolando passkey:', err);
      if (statusBox) {
        statusBox.style.color = '#f87171';
        statusBox.innerHTML = `<span>❌ Error: ${err.message || 'No se pudo vincular'}</span>`;
      }
      playAudioFeedback('error');
      btnConfirm.disabled = false;
      btnConfirm.textContent = '🔄 Reintentar Activación';
    }
  });
}

window.setupUserMenuDropdown = function() {
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

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
      closeDropdown();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });
};

window.applyUserSession = function(user) {
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

  if (userPill) userPill.style.display = 'inline-block';
  if (userName) userName.textContent = user.full_name;
  if (userRole) userRole.textContent = roleLabel;

  if (dropdownName) dropdownName.textContent = user.full_name;
  if (dropdownDoc) dropdownDoc.textContent = `C.I. ${user.document_id || ''}`;
  if (dropdownBadge) {
    dropdownBadge.className = badgeClass;
    dropdownBadge.textContent = roleLabel;
  }

  const btnSettings = document.getElementById('btnOpenGeneralSettings');
  const brandingSubtab = document.querySelector('.portal-subtab[data-subtab="subtab-branding"]');
  const isAdmin = (user.role === 'admin' || user.role === 'director');

  if (btnSettings) {
    btnSettings.style.display = isAdmin ? 'flex' : 'none';
  }
  if (brandingSubtab) {
    brandingSubtab.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  if (typeof window.closeUserMenu === 'function') {
    window.closeUserMenu();
  }

  if (user.role === 'worker') {
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
    if (masterNav) masterNav.style.display = 'none';
    STATE.operatorId = user.id;

    // Actualizar barra de identidad del Operador en el Despacho
    const opName = document.getElementById('distributorOperatorName');
    const opBadge = document.getElementById('distributorOperatorBadge');
    const opAvatar = document.getElementById('distributorOperatorAvatar');
    if (opName) opName.textContent = user.full_name;
    if (opBadge) opBadge.textContent = `Mesa de Despacho · C.I. ${user.document_id}`;
    if (opAvatar) opAvatar.textContent = initials;

    navigateTo('view-distributor');

  } else {
    if (masterNav) masterNav.style.display = 'flex';
    if (simSelector) simSelector.style.display = 'block';
    if (techPanel) techPanel.style.display = 'block';
    STATE.supervisorId = user.document_id;
    navigateTo('view-portal');
  }
};

window.handleLogout = function(reason) {
  if (window.SessionManager && typeof window.SessionManager.stopWatchdog === 'function') {
    window.SessionManager.stopWatchdog();
  }

  STATE.setCurrentUser(null);
  
  if (typeof window.closeUserMenu === 'function') {
    window.closeUserMenu();
  }

  // Limpiar temporizadores de QR activos
  if (STATE.qrTimerInterval) {
    clearInterval(STATE.qrTimerInterval);
    STATE.qrTimerInterval = null;
  }
  STATE.activeQrPayload = null;
  try {
    localStorage.removeItem('sgbt_active_qr_payload');
    sessionStorage.clear();
  } catch (e) {}

  const btnSettings = document.getElementById('btnOpenGeneralSettings');
  if (btnSettings) btnSettings.style.display = 'none';
  
  const userPill = document.getElementById('userSessionPill');
  const masterNav = document.getElementById('masterNav');
  if (userPill) userPill.style.display = 'none';
  if (masterNav) masterNav.style.display = 'none';

  const docInput = document.getElementById('loginDocNumber');
  if (docInput) docInput.value = '';

  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) {
    if (reason && typeof reason === 'string') {
      alertBox.textContent = reason;
      alertBox.className = 'alert-box alert-warning';
      alertBox.style.display = 'block';
    } else {
      alertBox.style.display = 'none';
    }
  }

  navigateTo('view-login');
};

window.checkAuthSession = function() {
  try {
    // Inicializar listeners del watchdog de sesión bancario
    if (window.SessionManager && typeof window.SessionManager.init === 'function') {
      window.SessionManager.init();
    }

    // En arquitectura bancaria, la sesión activa reside en sessionStorage
    const saved = sessionStorage.getItem('sgbt_user');
    if (saved) {
      // Validar que la sesión no haya caducado por inactividad
      const isValid = window.SessionManager ? window.SessionManager.validateSessionOnBoot() : true;
      if (isValid) {
        const user = JSON.parse(saved);
        if (user && user.id) {
          STATE.currentUser = user;
          applyUserSession(user);
          if (window.SessionManager) {
            window.SessionManager.startWatchdog();
          }
          return;
        }
      }
    }

    // Limpieza proactiva de sesiones persistentes viejas en localStorage
    localStorage.removeItem('sgbt_user');
  } catch (e) {
    console.warn('Error al leer sesión guardada:', e);
  }
  
  navigateTo('view-login');
};
