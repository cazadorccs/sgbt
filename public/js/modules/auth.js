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
    const data = await API.post('/api/v1/auth/login', { document_id: rawDocId });

    if (!data.success) {
      showLoginAlert(data.error || 'Cédula no encontrada en el padrón institucional.');
      playAudioFeedback('error');
      return;
    }

    playAudioFeedback('success');
    const user = data.user;
    STATE.setCurrentUser(user);
    applyUserSession(user);
    window.showToast(`Bienvenido(a), ${user.full_name}`, 'success');

  } catch (err) {
    console.error('Error de login:', err);
    showLoginAlert(err.message || 'Error de conexión con el servidor.');
    playAudioFeedback('error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🚀 Ingresar al Sistema';
    }
  }
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
    navigateTo('view-distributor');

  } else {
    if (masterNav) masterNav.style.display = 'flex';
    if (simSelector) simSelector.style.display = 'block';
    if (techPanel) techPanel.style.display = 'block';
    STATE.supervisorId = user.document_id;
    navigateTo('view-portal');
  }
};

window.handleLogout = function() {
  STATE.setCurrentUser(null);
  
  if (typeof window.closeUserMenu === 'function') {
    window.closeUserMenu();
  }

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
};

window.checkAuthSession = function() {
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
  
  navigateTo('view-login');
};
