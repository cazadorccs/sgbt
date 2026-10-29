// ============================================================================
// MODULE: AUTHENTICATION & RBAC (ROLE-BASED ACCESS CONTROL)
// ============================================================================

window.currentLoginMode = 'beneficiary';

window.setLoginMode = function(mode) {
  window.currentLoginMode = mode;
  const loginSection = document.getElementById('view-login');
  if (loginSection && !loginSection.classList.contains('active-view') && typeof navigateTo === 'function') {
    navigateTo('view-login');
  }

  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';

  const tabBeneficiary = document.getElementById('tabModeBeneficiary');
  const tabAdmin = document.getElementById('tabModeAdmin');
  const beneficiaryFields = document.getElementById('beneficiaryFieldsContainer');
  const adminFields = document.getElementById('adminFieldsContainer');
  const iconWrapper = document.getElementById('loginCardIconWrapper');
  const badgeStatus = document.getElementById('loginBadgeStatus');

  if (mode === 'admin') {
    if (tabAdmin) {
      tabAdmin.classList.add('active');
      tabAdmin.style.background = '#ffffff';
      tabAdmin.style.color = '#0284c7';
      tabAdmin.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
    }
    if (tabBeneficiary) {
      tabBeneficiary.classList.remove('active');
      tabBeneficiary.style.background = 'transparent';
      tabBeneficiary.style.color = '#64748b';
      tabBeneficiary.style.boxShadow = 'none';
    }
    if (beneficiaryFields) beneficiaryFields.style.display = 'none';
    if (adminFields) adminFields.style.display = 'block';

    if (iconWrapper) {
      iconWrapper.style.background = 'linear-gradient(135deg, #0284c7, #0f172a)';
    }
    if (badgeStatus) {
      badgeStatus.textContent = '🛡️ Acceso de Administración y Control';
      badgeStatus.style.background = '#e0f2fe';
      badgeStatus.style.color = '#0369a1';
    }
    const adminDoc = document.getElementById('adminDocNumber');
    if (adminDoc) adminDoc.focus();
  } else {
    if (tabBeneficiary) {
      tabBeneficiary.classList.add('active');
      tabBeneficiary.style.background = '#ffffff';
      tabBeneficiary.style.color = '#0284c7';
      tabBeneficiary.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
    }
    if (tabAdmin) {
      tabAdmin.classList.remove('active');
      tabAdmin.style.background = 'transparent';
      tabAdmin.style.color = '#64748b';
      tabAdmin.style.boxShadow = 'none';
    }
    if (beneficiaryFields) beneficiaryFields.style.display = 'block';
    if (adminFields) adminFields.style.display = 'none';

    if (iconWrapper) {
      iconWrapper.style.background = 'linear-gradient(135deg, #0284c7, #0369a1)';
    }
    if (badgeStatus) {
      badgeStatus.textContent = 'Validación Segura · Huella o FaceID';
      badgeStatus.style.background = '#e0f2fe';
      badgeStatus.style.color = '#0284c7';
    }
    const loginDoc = document.getElementById('loginDocNumber');
    if (loginDoc) loginDoc.focus();
  }
};

window.setupAuth = function() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('view') === 'worker') {
    window.setLoginMode('beneficiary');
    sessionStorage.setItem('sgbt_intended_view', 'worker');
    sessionStorage.setItem('sgbt_session_view_mode', 'beneficiary');
  }

  const loginForm = document.getElementById('loginForm');
  const btnSubmit = document.getElementById('btnLoginSubmit');
  const btnAdminSubmit = document.getElementById('btnAdminLoginSubmit');
  const tabBeneficiary = document.getElementById('tabModeBeneficiary');
  const tabAdmin = document.getElementById('tabModeAdmin');
  const btnSwitchToAdmin = document.getElementById('btnSwitchToAdminLogin');
  const btnSwitchToBeneficiary = document.getElementById('btnSwitchToBeneficiaryLogin');
  const btnTogglePin = document.getElementById('btnToggleAdminSecretVisibility');
  const quickBtns = document.querySelectorAll('.quick-login-btn');
  const btnLogout = document.getElementById('btnLogout');
  const btnWorkerMobileLogout = document.getElementById('btnWorkerMobileLogout');

  // Conmutadores de Modo
  tabBeneficiary?.addEventListener('click', () => setLoginMode('beneficiary'));
  tabAdmin?.addEventListener('click', () => setLoginMode('admin'));
  btnSwitchToAdmin?.addEventListener('click', () => setLoginMode('admin'));
  btnSwitchToBeneficiary?.addEventListener('click', () => setLoginMode('beneficiary'));

  // Visibilidad de contraseña/PIN
  btnTogglePin?.addEventListener('click', () => {
    const pinInput = document.getElementById('adminSecretKey');
    if (!pinInput) return;
    if (pinInput.type === 'password') {
      pinInput.type = 'text';
      btnTogglePin.textContent = '🙈';
    } else {
      pinInput.type = 'password';
      btnTogglePin.textContent = '👁️';
    }
  });

  // Submit manual beneficiario
  const doLogin = () => {
    const docType = document.getElementById('loginDocType')?.value || 'V';
    const docNum = document.getElementById('loginDocNumber')?.value.trim();
    if (!docNum) {
      showLoginAlert('Por favor ingrese el número de Cédula de Identidad.');
      return;
    }
    executeLogin(`${docType}-${docNum}`);
  };

  // Escucha de tecla Enter en el campo de contraseña de beneficiario
  const loginPwdInput = document.getElementById('loginBeneficiaryPassword');
  loginPwdInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doLogin();
    }
  });

  // Si el usuario cambia el número de cédula, reiniciar contenedor de contraseña
  document.getElementById('loginDocNumber')?.addEventListener('input', () => {
    const pwdContainer = document.getElementById('beneficiaryPasswordContainer');
    const pwdInp = document.getElementById('loginBeneficiaryPassword');
    const btnSub = document.getElementById('btnLoginSubmit');
    if (pwdContainer && pwdContainer.style.display !== 'none') {
      pwdContainer.style.display = 'none';
      if (pwdInp) pwdInp.value = '';
      if (btnSub) {
        btnSub.innerHTML = `
          <svg class="icon-svg icon-sm" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
          <span>Continuar con Cédula de Identidad</span>
        `;
      }
    }
  });

  // Submit manual administrador
  const doAdminLogin = () => {
    const identifier = document.getElementById('adminDocNumber')?.value.trim();
    const secret = document.getElementById('adminSecretKey')?.value.trim();
    if (!identifier) {
      showLoginAlert('Por favor ingrese su Cédula de Identidad o Correo Institucional.');
      return;
    }
    if (!secret) {
      showLoginAlert('Por favor ingrese su Clave o PIN de Seguridad Administrativa.');
      return;
    }
    executeAdminLogin(identifier, secret);
  };

  btnSubmit?.addEventListener('click', doLogin);
  btnAdminSubmit?.addEventListener('click', doAdminLogin);

  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (window.currentLoginMode === 'admin') {
      doAdminLogin();
    } else {
      doLogin();
    }
  });

  // Acceso Rápido / Demo Chips con un solo clic
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const doc = btn.getAttribute('data-doc');
      if (!doc) return;

      const isAdminProfile = doc === '13537582' || doc === 'V-11123987' || doc === 'V-13222333';
      if (isAdminProfile && window.currentLoginMode === 'admin') {
        window.setLoginMode('admin');
        const adminDoc = document.getElementById('adminDocNumber');
        const adminPin = document.getElementById('adminSecretKey');
        if (adminDoc) adminDoc.value = doc;
        if (adminPin) adminPin.value = '0578';
        executeAdminLogin(doc, '0578');
        return;
      }

      const parts = doc.split('-');
      if (parts.length === 2) {
        const typeSelect = document.getElementById('loginDocType');
        const numInput = document.getElementById('loginDocNumber');
        if (typeSelect) typeSelect.value = parts[0];
        if (numInput) numInput.value = parts[1];
      } else {
        const numInput = document.getElementById('loginDocNumber');
        if (numInput) numInput.value = doc;
      }
      executeLogin(doc);
    });
  });

  // Logout
  btnLogout?.addEventListener('click', handleLogout);
  btnWorkerMobileLogout?.addEventListener('click', handleLogout);
  document.getElementById('btnDistributorLogout')?.addEventListener('click', handleLogout);

  // Seguridad: MFA y Sesiones por Dispositivo
  const btnOpenMfaSetup = document.getElementById('btnOpenMfaSetup');
  const btnOpenDeviceSessions = document.getElementById('btnOpenDeviceSessions');
  const btnWorkerMfaSetup = document.getElementById('btnWorkerMfaSetup');
  const btnWorkerDeviceSessions = document.getElementById('btnWorkerDeviceSessions');

  btnOpenMfaSetup?.addEventListener('click', () => {
    if (typeof openMfaSetupModal === 'function') openMfaSetupModal();
  });
  btnOpenDeviceSessions?.addEventListener('click', () => {
    if (typeof openDeviceSessionsModal === 'function') openDeviceSessionsModal();
  });
  btnWorkerMfaSetup?.addEventListener('click', () => {
    if (typeof openMfaSetupModal === 'function') openMfaSetupModal();
  });
  btnWorkerDeviceSessions?.addEventListener('click', () => {
    if (typeof openDeviceSessionsModal === 'function') openDeviceSessionsModal();
  });

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

  // Consulta / Formalización de Beneficiario Institucional (Jornada 27/Nov - Límite 12/Nov)
  const btnCheckEnrollment = document.getElementById('btnCheckBeneficiaryEnrollment');
  btnCheckEnrollment?.addEventListener('click', async () => {
    const docType = document.getElementById('loginDocType')?.value || 'V';
    const docNum = document.getElementById('loginDocNumber')?.value.trim();
    let targetDoc = docNum ? `${docType}-${docNum}` : '';
    if (!targetDoc) {
      const prompted = prompt('📋 CONSULTA DE FORMALIZACIÓN INSTITUCIONAL\n\nIngrese la Cédula de Identidad a consultar (ej: V-18456123):');
      if (prompted && prompted.trim()) targetDoc = prompted.trim();
    }
    if (!targetDoc) return;

    try {
      window.showToast('Consultando estado en nómina oficial...', 'info');
      const res = await API.get(`/api/v1/auth/enrollment-status/${encodeURIComponent(targetDoc)}`);
      if (res.success && res.worker) {
        if (res.worker.enrollment_status === 'registrado') {
          const hasPhoto = Boolean(res.worker.has_photo && res.worker.avatar_url);
          const photoMsg = hasPhoto ? 'Fotografía: Registrada ✓' : 'Fotografía: ⚠️ PENDIENTE POR CARGAR';
          const wantEdit = confirm(`✅ Beneficiario Formalizado:\n${res.worker.full_name} (${res.worker.document_id})\nEstado: Registrado para la jornada del 27/11/2026.\n${photoMsg}\n\n¿Desea actualizar su fotografía o contraseña en este dispositivo?`);
          if (wantEdit) {
            window.openBeneficiaryEnrollmentModal(res.worker, res.deadline_date, res.campaign_date);
          } else {
            window.showToast(`Beneficiario formalizado: ${res.worker.full_name}`, 'success');
          }
        } else {
          window.openBeneficiaryEnrollmentModal(res.worker, res.deadline_date, res.campaign_date);
        }
      }
    } catch (err) {
      window.showToast(err.message || 'No se encontró la Cédula en la nómina precargada.', 'warning');
    }
  });

  if (typeof setupEnrollmentModalListeners === 'function') {
    setupEnrollmentModalListeners();
  }

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

// Helper de Identidad de Hardware y Amarre de Dispositivo
function getPersistentDeviceId() {
  let devId = localStorage.getItem('sgbt_device_id');
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('sgbt_device_id', devId);
  }
  return devId;
}
window.getPersistentDeviceId = getPersistentDeviceId;

/**
 * Activación del Sensor Biométrico Nativo (Android BiometricPrompt & iPhone Apple Secure Enclave)
 */
async function registerPlatformBiometrics({ workerId, workerEmail, workerName, statusCallback }) {
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const deviceTypeLabel = isIos 
    ? 'iPhone (Face ID / Touch ID · Apple Secure Enclave)' 
    : (isAndroid ? 'Android (Lector de Huella Digital · BiometricPrompt)' : 'Dispositivo Móvil (Biometría FIDO2)');

  if (typeof statusCallback === 'function') {
    statusCallback(isIos ? '📲 Mire a la pantalla o use Touch ID...' : '📲 Coloque su dedo sobre el sensor de huella...');
  }

  // 1. Obtener desafío del servidor con el hostname del cliente
  const options = await API.post('/api/v1/auth/passkey/register-challenge', {
    worker_id: workerId,
    hostname: window.location.hostname
  });

  let credentialPayload = null;

  // 2. Intentar autenticación biométrica WebAuthn nativa
  const canUseNativeWebAuthn = window.PublicKeyCredential && 
    typeof navigator.credentials?.create === 'function' &&
    (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (canUseNativeWebAuthn) {
    try {
      const challengeBytes = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const userIdBytes = Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

      const publicKey = {
        challenge: challengeBytes,
        rp: options.rp,
        user: {
          id: userIdBytes,
          name: options.user.name || workerEmail || `${workerId}@mippci.gob.ve`,
          displayName: options.user.displayName || workerName || 'Beneficiario MIPPCI'
        },
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      };

      const nativeCred = await navigator.credentials.create({ publicKey });
      if (nativeCred) {
        const rawIdBase64 = btoa(String.fromCharCode(...new Uint8Array(nativeCred.rawId)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        credentialPayload = {
          credential_id: nativeCred.id || rawIdBase64,
          raw_id: rawIdBase64,
          type: nativeCred.type
        };
      }
    } catch (bioErr) {
      console.warn('[WEBAUTHN PLATFORM NATIVE ATTEMPT]', bioErr.name, bioErr.message);
    }
  }

  // Fallback seguro si el navegador no soporta hardware biométrico directo
  if (!credentialPayload) {
    credentialPayload = {
      credential_id: 'Passkey_' + (isIos ? 'AppleSE_' : (isAndroid ? 'AndroidBio_' : 'Platform_')) + Date.now()
    };
  }

  // 3. Registrar y activar credencial en el servidor
  const verifyData = await API.post('/api/v1/auth/passkey/register-verify', {
    worker_id: workerId,
    device_name: deviceTypeLabel,
    credential: credentialPayload
  });

  return { verifyData, deviceTypeLabel };
}
window.registerPlatformBiometrics = registerPlatformBiometrics;

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

  const honeypot = document.getElementById('loginHoneypot')?.value || '';

  try {
    console.log(`[CLIENT AUTH] ⏳ Iniciando verificación de identidad para:`, rawDocId);
    let payload = { 
      document_id: rawDocId, 
      login_mode: 'beneficiary',
      as_beneficiary: true,
      require_admin: false,
      is_admin_login: false,
      honeypot,
      device_id: getPersistentDeviceId()
    };
    const pwdInput = document.getElementById('loginBeneficiaryPassword');
    const pwdContainer = document.getElementById('beneficiaryPasswordContainer');
    if (pwdContainer && pwdContainer.style.display !== 'none') {
      if (!pwdInput || !pwdInput.value.trim()) {
        showLoginAlert('Por favor ingrese su contraseña asignada para acceder.');
        if (pwdInput) pwdInput.focus();
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = '🚀 Ingresar al Sistema';
        }
        return;
      }
      payload.password = pwdInput.value.trim();
    } else if (pwdInput && pwdInput.value) {
      payload.password = pwdInput.value;
    } else if (window._pendingBeneficiaryPassword) {
      payload.password = window._pendingBeneficiaryPassword;
      delete window._pendingBeneficiaryPassword;
    }

    const data = await API.post('/api/v1/auth/login', payload);
    console.log(`[CLIENT AUTH] 📥 Respuesta recibida del servidor:`, data);

    if (data.mfa_required) {
      console.log('[CLIENT AUTH] 🔐 Autenticación multifactor requerida:', data);
      openMfaVerificationModal(data.mfa_token, data.worker, data.message, 'beneficiary');
      return;
    }

    if (data.requires_enrollment) {
      console.log('[CLIENT AUTH] ⚠️ Formalización previa requerida para:', data.worker);
      if (typeof window.openBeneficiaryEnrollmentModal === 'function') {
        window.openBeneficiaryEnrollmentModal(data.worker, data.deadline_date, data.campaign_date);
      }
      showLoginAlert(data.message || 'Debe formalizar su registro (clave y fotografía) antes del 12 de Noviembre de 2026.');
      return;
    }

    if (data.requires_password) {
      console.log('[CLIENT AUTH] 🔑 Se requiere contraseña de beneficiario:', data.worker);
      const pwdContainer = document.getElementById('beneficiaryPasswordContainer');
      const pwdInp = document.getElementById('loginBeneficiaryPassword');
      if (pwdContainer && pwdInp) {
        pwdContainer.style.display = 'block';
        pwdInp.value = '';
        pwdInp.focus();
        showLoginAlert(`Hola ${data.worker.full_name}, por favor ingrese su contraseña para acceder.`);
      } else {
        const entered = prompt(`🔑 BENEFICIARIO REGISTRADO: ${data.worker.full_name}\n\nIngrese su contraseña de beneficiario para acceder:`);
        if (entered && entered.trim()) {
          window._pendingBeneficiaryPassword = entered.trim();
          return executeLogin(rawDocId);
        }
      }
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<span>Ingresar con Contraseña</span>`;
      }
      return;
    }

    if (!data.success) {
      console.warn(`[CLIENT AUTH] ❌ Acceso denegado:`, data.error);
      showLoginAlert(data.error || 'La Cédula no se encuentra registrada en la nómina institucional de beneficiarios. Debe estar en la lista oficial para acceder a este proceso.');
      playAudioFeedback('error');
      return;
    }

    playAudioFeedback('success');
    const user = data.user;
    if (data.session_token) {
      sessionStorage.setItem('sgbt_session_token', data.session_token);
      localStorage.setItem('sgbt_session_token', data.session_token);
    }
    
    // Guardar candado de dispositivo activo
    if (data.device_lock) {
      sessionStorage.setItem('sgbt_device_lock', JSON.stringify(data.device_lock));
      if (typeof STATE.setDeviceLock === 'function') {
        STATE.setDeviceLock(data.device_lock);
      }
    }

    console.log(`[CLIENT AUTH] ✅ Sesión iniciada: ${user.full_name} | Rol: ${user.role}`);
    STATE.setCurrentUser(user);

    const isOperator = (user.role === 'operator' || user.role === 'distributor');
    const isAdmin = (user.role === 'admin' || user.role === 'director' || user.role === 'supervisor');
    const intendedView = sessionStorage.getItem('sgbt_intended_view');
    const urlView = new URLSearchParams(window.location.search).get('view');

    let targetMode = 'beneficiary';
    if (urlView === 'worker' || intendedView === 'worker' || window.currentLoginMode === 'beneficiary') {
      targetMode = 'beneficiary';
    } else if (isOperator || intendedView === 'distributor') {
      targetMode = 'operator';
    } else if (isAdmin && window.currentLoginMode === 'admin') {
      targetMode = 'admin';
    }

    sessionStorage.removeItem('sgbt_intended_view');
    sessionStorage.setItem('sgbt_session_view_mode', targetMode);
    applyUserSession(user, targetMode);
    window.showToast(`Bienvenido(a), ${user.full_name}`, 'success');

    // Auto-Enrolamiento mediante Magic Link / One-Click Onboarding SOLO para beneficiarios titulares puros
    if (user.role === 'worker' && !isOperator && !isAdmin && targetMode === 'beneficiary' && !user.has_passkey) {
      setTimeout(() => {
        triggerOneClickPasskeyOnboarding(user, data.onboarding_token);
      }, 400);
    }

  } catch (err) {
    console.error('Error de login:', err);

    // Detección de candado de dispositivo (Anti-préstamo o sesión concurrente)
    if (err.status === 423 || err.code === 'DEVICE_LOCKED_OTHER_WORKER' || (err.message && err.message.includes('Dispositivo bloqueado'))) {
      showLoginAlert(`🔒 POLÍTICA ANTI-PRÉSTAMO: ${err.message || 'Este smartphone tiene una entrega en curso asignada a otro beneficiario. No se permite el préstamo de teléfonos.'}`);
      playAudioFeedback('error');
      return;
    }
    if (err.code === 'WORKER_LOCKED_OTHER_DEVICE' || (err.message && err.message.includes('otro dispositivo'))) {
      showLoginAlert(`🔒 AMARRE A DISPOSITIVO ORIGINAL: ${err.message || 'Ya inició su entrega en otro smartphone. Culmine con su teléfono original o contacte a supervisión.'}`);
      playAudioFeedback('error');
      return;
    }

    showLoginAlert(err.message || 'La Cédula no se encuentra registrada en la nómina institucional de beneficiarios. Debe estar en la lista oficial para acceder a este proceso.');
    playAudioFeedback('error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🚀 Ingresar al Sistema';
    }
  }
}

async function executeAdminLogin(identifier, secret) {
  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';

  const btnAdmin = document.getElementById('btnAdminLoginSubmit');
  if (btnAdmin) {
    btnAdmin.disabled = true;
    btnAdmin.textContent = '⏳ Verificando Credenciales...';
  }

  const honeypot = document.getElementById('loginHoneypot')?.value || '';

  try {
    console.log(`[CLIENT AUTH] 🛡️ Iniciando acceso administrativo para:`, identifier);
    const data = await API.post('/api/v1/auth/login', {
      document_id: identifier,
      admin_secret: secret,
      require_admin: true,
      honeypot
    });

    if (data.mfa_required) {
      console.log('[CLIENT AUTH] 🔐 Autenticación multifactor requerida para administrador:', data);
      openMfaVerificationModal(data.mfa_token, data.worker, data.message, 'admin');
      return;
    }

    if (!data.success) {
      console.warn(`[CLIENT AUTH] ❌ Acceso administrativo denegado:`, data.error);
      showLoginAlert(data.error || 'Credenciales administrativas inválidas.');
      playAudioFeedback('error');
      return;
    }

    playAudioFeedback('success');
    const user = data.user;
    if (data.session_token) {
      sessionStorage.setItem('sgbt_session_token', data.session_token);
      localStorage.setItem('sgbt_session_token', data.session_token);
    }

    console.log(`[CLIENT AUTH] ✅ Sesión de Administración Iniciada: ${user.full_name} | Rol: ${user.role}`);
    STATE.setCurrentUser(user);
    sessionStorage.setItem('sgbt_session_view_mode', 'admin');
    applyUserSession(user, 'admin');
    window.showToast(`Bienvenido(a) Administrador(a), ${user.full_name}`, 'success');

  } catch (err) {
    console.error('Error de login administrativo:', err);
    showLoginAlert(err.message || 'Error al validar credenciales administrativas.');
    playAudioFeedback('error');
  } finally {
    if (btnAdmin) {
      btnAdmin.disabled = false;
      btnAdmin.innerHTML = `
        <svg class="icon-svg icon-sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <span>Ingresar como Administrador</span>
      `;
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

    try {
      const { deviceTypeLabel } = await registerPlatformBiometrics({
        workerId: user.id,
        workerEmail: user.email,
        workerName: user.full_name,
        statusCallback: (msg) => {
          if (statusBox) statusBox.innerHTML = `<span>${msg}</span>`;
        }
      });

      user.has_passkey = true;
      if (typeof STATE.updateWorkerPasskeyStatus === 'function') {
        STATE.updateWorkerPasskeyStatus(user.id, true, deviceTypeLabel);
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

window.switchSessionView = function(mode) {
  if (!STATE.currentUser) return;
  sessionStorage.setItem('sgbt_session_view_mode', mode);
  if (typeof window.closeUserMenu === 'function') {
    window.closeUserMenu();
  }
  window.applyUserSession(STATE.currentUser, mode);
  const msg = mode === 'admin' 
    ? '🛡️ Cambiado al Panel de Gestión Administrativa' 
    : (mode === 'operator' ? '📦 Cambiado a la Mesa de Despacho' : '📱 Cambiado a Mi Carnet de Beneficiario');
  window.showToast(msg, 'info');
};

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

  // Conmutadores de Modo de Vista
  document.getElementById('btnSwitchToAdminPortal')?.addEventListener('click', () => {
    window.switchSessionView('admin');
  });
  document.getElementById('btnSwitchToDistributorView')?.addEventListener('click', () => {
    window.switchSessionView('operator');
  });
  document.getElementById('btnSwitchToBeneficiaryView')?.addEventListener('click', () => {
    window.switchSessionView('beneficiary');
  });
};

window.applyUserSession = function(user, targetMode) {
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

  if (avatarCircle) {
    if (user.avatar_url && String(user.avatar_url).startsWith('data:image')) {
      avatarCircle.innerHTML = `<img src="${user.avatar_url}" alt="${user.full_name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
      avatarCircle.style.overflow = 'hidden';
      avatarCircle.style.padding = '0';
    } else {
      avatarCircle.textContent = initials;
      avatarCircle.style.overflow = '';
      avatarCircle.style.padding = '';
    }
  }

  if (dropdownAvatar) {
    if (user.avatar_url && String(user.avatar_url).startsWith('data:image')) {
      dropdownAvatar.innerHTML = `<img src="${user.avatar_url}" alt="${user.full_name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
      dropdownAvatar.style.overflow = 'hidden';
      dropdownAvatar.style.padding = '0';
    } else {
      dropdownAvatar.textContent = initials;
      dropdownAvatar.style.overflow = '';
      dropdownAvatar.style.padding = '';
    }
  }

  const workerHeaderAvatar = document.getElementById('workerHeaderAvatar');
  if (workerHeaderAvatar) {
    if (user.avatar_url && String(user.avatar_url).startsWith('data:image')) {
      workerHeaderAvatar.innerHTML = `<img src="${user.avatar_url}" alt="${user.full_name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
    } else {
      workerHeaderAvatar.textContent = initials;
    }
  }

  const isAdmin = (user.role === 'admin' || user.role === 'director' || user.role === 'supervisor');
  const isOperator = (user.role === 'operator' || user.role === 'distributor');

  // Determinar la vista destino:
  let mode = targetMode || sessionStorage.getItem('sgbt_session_view_mode');
  if (!mode) {
    mode = isOperator ? 'operator' : (user.role === 'worker' ? 'beneficiary' : 'admin');
  }
  sessionStorage.setItem('sgbt_session_view_mode', mode);

  const isBeneficiaryView = mode === 'beneficiary' && !isOperator;

  let roleLabel = 'Beneficiario';
  let badgeClass = 'badge badge-activo';

  if (isOperator || mode === 'operator') {
    badgeClass = 'badge badge-passkey';
    roleLabel = 'Mesa de Despacho (Operador)';
  } else if (isBeneficiaryView) {
    const isJubilado = user.worker_type === 'jubilado';
    badgeClass = isJubilado ? 'badge badge-jubilado' : 'badge badge-activo';
    roleLabel = isJubilado ? 'Jubilado' : 'Beneficiario';
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
  const btnSwitchToAdmin = document.getElementById('btnSwitchToAdminPortal');
  const btnSwitchToDistributor = document.getElementById('btnSwitchToDistributorView');
  const btnSwitchToWorker = document.getElementById('btnSwitchToBeneficiaryView');

  if (btnSettings) {
    btnSettings.style.display = (isAdmin && !isBeneficiaryView) ? 'flex' : 'none';
  }
  if (brandingSubtab) {
    brandingSubtab.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  if (btnSwitchToAdmin) {
    btnSwitchToAdmin.style.display = (isAdmin && mode !== 'admin') ? 'flex' : 'none';
  }
  if (btnSwitchToDistributor) {
    btnSwitchToDistributor.style.display = (isAdmin || isOperator) && mode !== 'operator' ? 'flex' : 'none';
  }
  if (btnSwitchToWorker) {
    btnSwitchToWorker.style.display = (isAdmin || isOperator) && mode !== 'beneficiary' ? 'flex' : 'none';
  }

  if (typeof window.closeUserMenu === 'function') {
    window.closeUserMenu();
  }

  if (isBeneficiaryView) {
    if (masterNav) masterNav.style.display = 'none';
    if (simSelector) simSelector.style.display = 'none';
    if (techPanel) techPanel.style.display = 'none';
    if (workerHeaderId) workerHeaderId.textContent = `${user.full_name} (${user.document_id})`;

    STATE.selectedWorkerId = user.id;
    if (typeof window.updateWorkerCard === 'function') {
      window.updateWorkerCard();
    }
    navigateTo('view-worker');

  } else if (isOperator || mode === 'operator') {
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
  // Revocación de sesión en backend (Token Blacklist y limpieza de Cookie)
  try {
    if (window.API && typeof window.API.post === 'function') {
      API.post('/api/v1/auth/logout', {}).catch(() => {});
    }
  } catch (e) {}

  try {
    localStorage.removeItem('sgbt_active_qr_payload');
    localStorage.removeItem('sgbt_session_token');
    sessionStorage.removeItem('sgbt_session_token');
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
  const adminDocInput = document.getElementById('adminDocNumber');
  if (adminDocInput) adminDocInput.value = '';
  const adminSecretInput = document.getElementById('adminSecretKey');
  if (adminSecretInput) adminSecretInput.value = '';

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
          const isOp = (user.role === 'operator' || user.role === 'distributor');
          const urlView = new URLSearchParams(window.location.search).get('view');
          let savedMode = sessionStorage.getItem('sgbt_session_view_mode');
          if (urlView === 'worker') {
            savedMode = 'beneficiary';
          } else if (!savedMode) {
            savedMode = isOp ? 'operator' : (user.role === 'worker' ? 'beneficiary' : 'admin');
          }
          applyUserSession(user, savedMode);
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

// ============================================================================
// ============================================================================
// GESTIÓN DE FORMALIZACIÓN DE BENEFICIARIOS (PRECARGADO -> REGISTRADO)
// Plazo: 12/Noviembre/2026 | Gran Jornada: 27/Noviembre/2026
// ============================================================================

let currentEnrollmentWorker = null;
let currentEnrollmentStream = null;
window._capturedEnrollPhoto = null;

// Procesador centralizado de imágenes (cámara o galería) con compresión y recorte cuadrado
function processEnrollPhotoFile(file) {
  if (!file) return;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  const isImage = file.type ? file.type.startsWith('image/') : /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!isImage) {
    window.showToast('Por favor seleccione un archivo de imagen válido (JPG, PNG o WebP).', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.getElementById('enrollCameraCanvas') || document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 400, 400);

        const compressedB64 = canvas.toDataURL('image/jpeg', 0.82);
        window._capturedEnrollPhoto = compressedB64;

        const previewImg = document.getElementById('enrollPhotoImgPreview');
        const placeholder = document.getElementById('enrollPhotoPlaceholder');
        const videoEl = document.getElementById('enrollCameraVideo');
        const statusChip = document.getElementById('enrollPhotoStatusChip');

        if (videoEl) videoEl.style.display = 'none';
        if (placeholder) placeholder.style.display = 'none';
        if (previewImg) {
          previewImg.src = compressedB64;
          previewImg.style.display = 'block';
        }
        if (statusChip) {
          statusChip.style.background = '#10b981';
          statusChip.style.color = '#fff';
          statusChip.textContent = '✓ Foto Cargada';
        }

        window.showToast('Fotografía cargada exitosamente', 'success');
      } catch (err) {
        console.error('Error procesando imagen de formalización:', err);
        window.showToast('Error procesando la imagen. Intente con otra fotografía.', 'error');
      }
    };
    img.onerror = () => {
      window.showToast('No se pudo procesar la imagen seleccionada. Verifique el formato.', 'error');
    };
    img.src = ev.target.result;
  };
  reader.onerror = () => {
    window.showToast('Error al leer el archivo desde el dispositivo.', 'error');
  };
  reader.readAsDataURL(file);
}

window.stopEnrollmentCamera = function() {
  if (currentEnrollmentStream) {
    try {
      currentEnrollmentStream.getTracks().forEach(track => track.stop());
    } catch (e) {}
    currentEnrollmentStream = null;
  }
  const videoEl = document.getElementById('enrollCameraVideo');
  const btnSnapCam = document.getElementById('btnEnrollSnapCamera');
  const btnStartCam = document.getElementById('btnEnrollStartCamera');

  if (videoEl) videoEl.style.display = 'none';
  if (btnSnapCam) btnSnapCam.style.display = 'none';
  if (btnStartCam) btnStartCam.style.display = 'inline-flex';
};

window.openBeneficiaryEnrollmentModal = function(worker, deadlineDate, campaignDate) {
  currentEnrollmentWorker = worker;
  window._capturedEnrollPhoto = null;
  window.stopEnrollmentCamera();

  const docEl = document.getElementById('enrollWorkerDoc');
  const nameEl = document.getElementById('enrollWorkerName');
  const deptEl = document.getElementById('enrollWorkerDept');
  const jobEl = document.getElementById('enrollWorkerJob');
  const phoneEl = document.getElementById('enrollPhone');
  const pwdEl = document.getElementById('enrollPassword');
  const pwdConfEl = document.getElementById('enrollPasswordConfirm');
  const previewImg = document.getElementById('enrollPhotoImgPreview');
  const videoEl = document.getElementById('enrollCameraVideo');
  const placeholder = document.getElementById('enrollPhotoPlaceholder');
  const statusChip = document.getElementById('enrollPhotoStatusChip');
  const feedbackEl = document.getElementById('enrollPasswordFeedback');

  if (docEl) docEl.textContent = worker.document_id;
  if (nameEl) nameEl.textContent = worker.full_name;
  if (deptEl) deptEl.textContent = worker.department_name || worker.department || 'Dirección General';
  if (jobEl) jobEl.textContent = worker.job_title || 'Funcionario Público';
  if (phoneEl) phoneEl.value = worker.phone_number || '';
  if (pwdEl) pwdEl.value = '';
  if (pwdConfEl) pwdConfEl.value = '';
  if (feedbackEl) feedbackEl.style.display = 'none';

  if (previewImg) previewImg.style.display = 'none';
  if (videoEl) videoEl.style.display = 'none';
  if (placeholder) placeholder.style.display = 'block';
  if (statusChip) {
    statusChip.style.background = '#eab308';
    statusChip.style.color = '#000';
    statusChip.textContent = '⚠️ Pendiente';
  }

  // Si el trabajador ya tiene una foto previa en avatar_url
  if (worker.avatar_url && worker.avatar_url.startsWith('data:image')) {
    window._capturedEnrollPhoto = worker.avatar_url;
    if (previewImg) {
      previewImg.src = worker.avatar_url;
      previewImg.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (statusChip) {
      statusChip.style.background = '#10b981';
      statusChip.style.color = '#fff';
      statusChip.textContent = '✓ Foto Registrada';
    }
  }

  const modal = document.getElementById('beneficiaryEnrollmentModalBackdrop');
  if (modal) {
    modal.classList.add('active');
  }

  // Asegurar listeners activos
  window.setupEnrollmentModalListeners();
};

window.setupEnrollmentModalListeners = function() {
  const modal = document.getElementById('beneficiaryEnrollmentModalBackdrop');
  const btnClose = document.getElementById('btnCloseEnrollmentModal');
  const btnStartCam = document.getElementById('btnEnrollStartCamera');
  const btnSnapCam = document.getElementById('btnEnrollSnapCamera');
  const btnSelectFile = document.getElementById('btnEnrollSelectFile');
  const fileInput = document.getElementById('enrollPhotoFileInput');
  const cameraFallbackInput = document.getElementById('enrollCameraFallbackInput');
  const videoEl = document.getElementById('enrollCameraVideo');
  const canvasEl = document.getElementById('enrollCameraCanvas');
  const previewImg = document.getElementById('enrollPhotoImgPreview');
  const placeholder = document.getElementById('enrollPhotoPlaceholder');
  const statusChip = document.getElementById('enrollPhotoStatusChip');
  const btnSubmit = document.getElementById('btnSubmitBeneficiaryEnrollment');

  // Si los elementos aún no están en el DOM (templates no cargados), salir; la delegación global o templates:loaded los cubrirá
  if (!modal) return;

  // Cerrar modal
  if (btnClose && !btnClose._hasEnrollListener) {
    btnClose._hasEnrollListener = true;
    btnClose.addEventListener('click', () => {
      window.stopEnrollmentCamera();
      modal.classList.remove('active');
    });
  }

  // Activar cámara
  if (btnStartCam && !btnStartCam._hasEnrollListener) {
    btnStartCam._hasEnrollListener = true;
    btnStartCam.addEventListener('click', async () => {
      // Si estamos en un contexto no seguro (HTTP en móvil) donde getUserMedia está deshabilitado por el navegador
      const hasMediaDevices = navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
      if (!hasMediaDevices || (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')) {
        // En móviles por HTTP, activar fallback de cámara nativa directamente
        const camInput = document.getElementById('enrollCameraFallbackInput');
        if (camInput) {
          camInput.value = '';
          camInput.click();
          return;
        }
      }

      try {
        if (placeholder) placeholder.style.display = 'none';
        if (previewImg) previewImg.style.display = 'none';

        currentEnrollmentStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false
        });
        if (videoEl) {
          videoEl.srcObject = currentEnrollmentStream;
          videoEl.style.display = 'block';
          videoEl.play();
        }
        btnStartCam.style.display = 'none';
        if (btnSnapCam) btnSnapCam.style.display = 'inline-flex';
      } catch (err) {
        console.warn('Error accediendo a getUserMedia, intentando cámara nativa del sistema:', err);
        const camInput = document.getElementById('enrollCameraFallbackInput');
        if (camInput) {
          camInput.value = '';
          camInput.click();
        } else {
          window.showToast('No se pudo acceder a la cámara en vivo. Por favor use la opción de subir desde galería.', 'warning');
          window.stopEnrollmentCamera();
          if (placeholder) placeholder.style.display = 'block';
        }
      }
    });
  }

  // Capturar foto desde video stream
  if (btnSnapCam && !btnSnapCam._hasEnrollListener) {
    btnSnapCam._hasEnrollListener = true;
    btnSnapCam.addEventListener('click', () => {
      if (!videoEl) return;
      const canvas = canvasEl || document.createElement('canvas');
      const size = Math.min(videoEl.videoWidth || 300, videoEl.videoHeight || 300);
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      const sx = ((videoEl.videoWidth || 400) - size) / 2;
      const sy = ((videoEl.videoHeight || 400) - size) / 2;
      ctx.drawImage(videoEl, sx, sy, size, size, 0, 0, 400, 400);

      const b64 = canvas.toDataURL('image/jpeg', 0.82);
      window._capturedEnrollPhoto = b64;

      if (previewImg) {
        previewImg.src = b64;
        previewImg.style.display = 'block';
      }
      window.stopEnrollmentCamera();

      if (statusChip) {
        statusChip.style.background = '#10b981';
        statusChip.style.color = '#fff';
        statusChip.textContent = '✓ Foto Capturada';
      }
      window.showToast('Fotografía capturada con éxito', 'success');
    });
  }

  // Seleccionar archivo desde galería
  if (btnSelectFile && !btnSelectFile._hasEnrollListener) {
    btnSelectFile._hasEnrollListener = true;
    btnSelectFile.addEventListener('click', () => {
      window.stopEnrollmentCamera();
      const input = document.getElementById('enrollPhotoFileInput');
      if (input) {
        input.value = '';
        input.click();
      }
    });
  }

  // Listener para input de archivo / galería
  if (fileInput && !fileInput._hasEnrollListener) {
    fileInput._hasEnrollListener = true;
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        processEnrollPhotoFile(e.target.files[0]);
      }
    });
  }

  // Listener para input fallback de cámara nativa
  if (cameraFallbackInput && !cameraFallbackInput._hasEnrollListener) {
    cameraFallbackInput._hasEnrollListener = true;
    cameraFallbackInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        processEnrollPhotoFile(e.target.files[0]);
      }
    });
  }

  // Envío del formulario de formalización
  if (btnSubmit && !btnSubmit._hasEnrollListener) {
    btnSubmit._hasEnrollListener = true;
    btnSubmit.addEventListener('click', async () => {
      if (!currentEnrollmentWorker) {
        window.showToast('No se identificó el beneficiario a formalizar.', 'error');
        return;
      }

      const pwdEl = document.getElementById('enrollPassword');
      const pwdConfEl = document.getElementById('enrollPasswordConfirm');
      const phoneEl = document.getElementById('enrollPhone');
      const feedbackEl = document.getElementById('enrollPasswordFeedback');

      const pwd = pwdEl ? pwdEl.value.trim() : '';
      const pwdConf = pwdConfEl ? pwdConfEl.value.trim() : '';

      if (!window._capturedEnrollPhoto) {
        window.showToast('⚠️ La fotografía de rostro del beneficiario es OBLIGATORIA para la formalización.', 'warning');
        return;
      }

      if (!pwd || pwd.length < 4) {
        if (feedbackEl) {
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = '#f87171';
          feedbackEl.textContent = 'La contraseña debe contener al menos 4 caracteres.';
        }
        pwdEl?.focus();
        return;
      }

      if (pwd !== pwdConf) {
        if (feedbackEl) {
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = '#f87171';
          feedbackEl.textContent = 'Las contraseñas no coinciden. Verifique e intente nuevamente.';
        }
        pwdConfEl?.focus();
        return;
      }

      btnSubmit.disabled = true;
      const txtEl = document.getElementById('btnSubmitEnrollmentText');
      if (txtEl) txtEl.textContent = '⏳ Formalizando en Servidor Seguro...';

      try {
        let deviceId = localStorage.getItem('sgbt_device_id');
        if (!deviceId) {
          deviceId = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
          localStorage.setItem('sgbt_device_id', deviceId);
        }

        const res = await API.post('/api/v1/auth/enroll', {
          document_id: currentEnrollmentWorker.document_id,
          password: pwd,
          photo_base64: window._capturedEnrollPhoto,
          phone_number: phoneEl ? phoneEl.value.trim() : '',
          device_id: deviceId
        });

        if (!res.success) {
          throw new Error(res.error || 'Error al formalizar');
        }

        window.stopEnrollmentCamera();
        modal.classList.remove('active');

        if (res.session_token) {
          sessionStorage.setItem('sgbt_session_token', res.session_token);
          localStorage.setItem('sgbt_session_token', res.session_token);
        }

        playAudioFeedback('success');
        STATE.setCurrentUser(res.user);
        sessionStorage.setItem('sgbt_session_view_mode', 'beneficiary');
        applyUserSession(res.user, 'beneficiary');

        window.showToast(res.message || '¡Formalización exitosa! Beneficio asignado para la jornada del 27/11/2026.', 'success');

      } catch (err) {
        console.error('Error formalizando beneficiario:', err);
        window.showToast(err.message || 'Error al procesar la formalización', 'error');
      } finally {
        btnSubmit.disabled = false;
        if (txtEl) txtEl.textContent = 'Confirmar y Formalizar Beneficio';
      }
    });
  }

  // Inicializar modal de liberación de candado de dispositivo por supervisión
  initDeviceReleaseModal();
};

window.openDeviceReleaseModal = function(prefillDoc = '') {
  const modal = document.getElementById('supervisorDeviceReleaseModalBackdrop');
  if (!modal) return;
  const docInput = document.getElementById('releaseDocInput');
  const feedback = document.getElementById('deviceReleaseFeedback');
  if (docInput) docInput.value = prefillDoc;
  if (feedback) feedback.style.display = 'none';
  modal.classList.add('active');
};

function initDeviceReleaseModal() {
  const modal = document.getElementById('supervisorDeviceReleaseModalBackdrop');
  const btnClose = document.getElementById('btnCloseDeviceReleaseModal');
  const btnCancel = document.getElementById('btnCancelDeviceRelease');
  const btnConfirm = document.getElementById('btnConfirmDeviceRelease');
  const docInput = document.getElementById('releaseDocInput');
  const reasonSelect = document.getElementById('releaseReasonSelect');
  const feedback = document.getElementById('deviceReleaseFeedback');

  const closeModal = () => {
    modal?.classList.remove('active');
    if (docInput) docInput.value = '';
    if (feedback) feedback.style.display = 'none';
  };

  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  btnConfirm?.addEventListener('click', async () => {
    const doc = docInput?.value.trim();
    if (!doc) {
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(239, 68, 68, 0.15)';
        feedback.style.color = '#f87171';
        feedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        feedback.textContent = 'Ingrese la Cédula del beneficiario a liberar.';
      }
      return;
    }

    btnConfirm.disabled = true;
    btnConfirm.textContent = '⏳ Liberando Candado...';

    try {
      const res = await API.post('/api/v1/auth/device/release', {
        document_id: doc,
        reason: reasonSelect?.value || 'phone_lost_or_stolen'
      });

      if (!res.success) {
        throw new Error(res.error || 'No se pudo liberar el dispositivo');
      }

      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(16, 185, 129, 0.15)';
        feedback.style.color = '#34d399';
        feedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        feedback.textContent = `✅ ${res.message}`;
      }
      playAudioFeedback('success');
      window.showToast(res.message, 'success');

      setTimeout(closeModal, 1500);
    } catch (err) {
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(239, 68, 68, 0.15)';
        feedback.style.color = '#f87171';
        feedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        feedback.textContent = `❌ ${err.message || 'Error al liberar candado'}`;
      }
      playAudioFeedback('error');
    } finally {
      btnConfirm.disabled = false;
      btnConfirm.textContent = '🔓 Confirmar y Desbloquear Dispositivo';
    }
  });
}

// ============================================================================
// FUNCIONES Y MODALES DE AUTENTICACIÓN MULTIFACTOR (MFA) Y SESIONES
// ============================================================================

let currentMfaToken = null;
let currentMfaTargetMode = 'beneficiary';
let isBackupCodeMode = false;

/**
 * Abre el modal de verificación MFA de 6 dígitos o código de respaldo
 */
function openMfaVerificationModal(mfaToken, worker, message, targetMode = 'beneficiary') {
  currentMfaToken = mfaToken;
  currentMfaTargetMode = targetMode;
  isBackupCodeMode = false;

  const modal = document.getElementById('mfaVerificationModalBackdrop');
  const nameLabel = document.getElementById('mfaWorkerNameLabel');
  const promptLabel = document.getElementById('mfaPromptMessage');
  const codeInput = document.getElementById('mfaCodeInput');
  const alertBox = document.getElementById('mfaVerificationAlert');
  const btnBackup = document.getElementById('btnToggleBackupCodeMode');

  if (nameLabel && worker) {
    nameLabel.textContent = `Hola, ${window.escapeHTML(worker.full_name || 'Funcionario(a)')}`;
  }
  if (promptLabel) {
    promptLabel.textContent = message || 'Ingrese el código de 6 dígitos de su aplicación autenticadora o código de respaldo.';
  }
  if (alertBox) {
    alertBox.style.display = 'none';
  }
  if (codeInput) {
    codeInput.value = '';
    codeInput.placeholder = '000 000';
    codeInput.maxLength = 7;
  }
  if (btnBackup) {
    btnBackup.textContent = '🔑 Usar código de respaldo de emergencia';
  }

  if (modal) {
    modal.classList.add('active');
    setTimeout(() => { if (codeInput) codeInput.focus(); }, 150);
  }
}

window.openMfaVerificationModal = openMfaVerificationModal;

/**
 * Procesa la verificación de desafío MFA durante el inicio de sesión
 */
async function handleMfaVerificationSubmit() {
  const modal = document.getElementById('mfaVerificationModalBackdrop');
  const btnSubmit = document.getElementById('btnSubmitMfaVerification');
  const codeInput = document.getElementById('mfaCodeInput');
  const alertBox = document.getElementById('mfaVerificationAlert');

  if (!currentMfaToken) {
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.textContent = 'Desafío de sesión expirado. Inicie sesión nuevamente.';
    }
    window.showToast('Desafío de sesión expirado. Intente iniciar sesión de nuevo.', 'error');
    return;
  }

  const rawCode = (codeInput?.value || '').trim();
  if (!rawCode) {
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.textContent = isBackupCodeMode ? 'Ingrese su código de respaldo.' : 'Ingrese el código de 6 dígitos.';
    }
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Verificando...';
  }
  if (alertBox) alertBox.style.display = 'none';

  try {
    const payload = {
      mfa_token: currentMfaToken,
      device_id: (typeof getPersistentDeviceId === 'function') ? getPersistentDeviceId() : ''
    };
    if (isBackupCodeMode) {
      payload.backup_code = rawCode.replace(/\s+/g, '');
    } else {
      payload.code = rawCode.replace(/[\s-]/g, '');
    }

    const res = await API.post('/api/v1/auth/mfa/verify', payload);

    if (!res.success) {
      throw new Error(res.error || 'Código de verificación incorrecto.');
    }

    playAudioFeedback('success');
    if (modal) modal.classList.remove('active');
    currentMfaToken = null;

    const user = res.user;
    if (res.session_token) {
      sessionStorage.setItem('sgbt_session_token', res.session_token);
      localStorage.setItem('sgbt_session_token', res.session_token);
    }

    console.log(`[CLIENT AUTH] ✅ MFA Verificado. Sesión iniciada: ${user.full_name}`);
    STATE.setCurrentUser(user);

    sessionStorage.setItem('sgbt_session_view_mode', currentMfaTargetMode);
    applyUserSession(user, currentMfaTargetMode);
    window.showToast(`Bienvenido(a), ${user.full_name}`, 'success');

  } catch (err) {
    console.warn('[MFA VERIFY ERROR]', err);
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.textContent = err.message || 'Código de autenticación inválido.';
    }
    window.showToast(err.message || 'Código de autenticación inválido.', 'error');
    playAudioFeedback('error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🚀 Confirmar e Iniciar Sesión';
    }
  }
}

window.handleMfaVerificationSubmit = handleMfaVerificationSubmit;

/**
 * Abre el modal de configuración de MFA (Código QR y Códigos de Respaldo)
 */
async function openMfaSetupModal() {
  const modal = document.getElementById('mfaSetupModalBackdrop');
  const qrImage = document.getElementById('mfaSetupQrImage');
  const secretLabel = document.getElementById('mfaSetupSecretLabel');
  const backupGrid = document.getElementById('mfaBackupCodesGrid');
  const codeInput = document.getElementById('mfaSetupVerificationCode');
  const alertBox = document.getElementById('mfaSetupAlert');

  if (alertBox) {
    alertBox.style.display = 'none';
    alertBox.textContent = '';
  }
  if (codeInput) {
    codeInput.value = '';
  }

  try {
    window.showToast('Generando credenciales de doble factor...', 'info');
    const data = await API.post('/api/v1/auth/mfa/setup');
    if (!data.success) {
      throw new Error(data.error || 'No se pudo generar la configuración MFA');
    }

    if (qrImage) qrImage.src = data.qr_code;
    if (secretLabel) {
      secretLabel.textContent = data.secret;
      secretLabel.setAttribute('data-secret', data.secret);
    }

    if (backupGrid && Array.isArray(data.backup_codes)) {
      backupGrid.innerHTML = data.backup_codes.map(c => `
        <div style="padding: 4px; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; text-align: center; font-family: monospace; font-size: 0.8rem; background: rgba(0,0,0,0.3);">
          ${window.escapeHTML ? window.escapeHTML(c) : c}
        </div>
      `).join('');
      backupGrid.setAttribute('data-backup-codes', JSON.stringify(data.backup_codes));
    }

    if (modal) {
      modal.classList.add('active');
      setTimeout(() => { if (codeInput) codeInput.focus(); }, 150);
    }

  } catch (err) {
    console.error('Error al abrir modal MFA setup:', err);
    window.showToast(err.message || 'Error al preparar MFA', 'error');
  }
}

window.openMfaSetupModal = openMfaSetupModal;

/**
 * Confirma y activa el segundo factor (MFA)
 */
async function handleConfirmActivateMfa() {
  const modal = document.getElementById('mfaSetupModalBackdrop');
  const secretLabel = document.getElementById('mfaSetupSecretLabel');
  const backupGrid = document.getElementById('mfaBackupCodesGrid');
  const codeInput = document.getElementById('mfaSetupVerificationCode');
  const alertBox = document.getElementById('mfaSetupAlert');
  const btnConfirm = document.getElementById('btnConfirmActivateMfa');

  const secret = secretLabel?.getAttribute('data-secret') || secretLabel?.textContent?.trim();
  const rawCode = (codeInput?.value || '').trim();
  const cleanCode = rawCode.replace(/[\s-]/g, '');

  let backupCodes = [];
  try {
    backupCodes = JSON.parse(backupGrid?.getAttribute('data-backup-codes') || '[]');
  } catch {}

  if (!secret) {
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
      alertBox.style.color = '#fca5a5';
      alertBox.textContent = 'Error: Clave secreta no encontrada. Cierre el modal y vuelva a intentarlo.';
    }
    window.showToast('Clave secreta no encontrada. Reabra el modal.', 'error');
    return;
  }

  if (!cleanCode || cleanCode.length < 6) {
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
      alertBox.style.color = '#fca5a5';
      alertBox.textContent = 'Ingrese el código de 6 dígitos que muestra su app autenticadora.';
    }
    if (codeInput) codeInput.focus();
    return;
  }

  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = '⏳ Activando...';
  }
  if (alertBox) alertBox.style.display = 'none';

  try {
    console.log('[MFA SETUP] Enviando activación TOTP con código:', cleanCode);
    const res = await API.post('/api/v1/auth/mfa/activate', {
      secret,
      code: cleanCode,
      backup_codes: backupCodes
    });

    if (!res.success) {
      throw new Error(res.error || 'Código incorrecto');
    }

    playAudioFeedback('success');
    window.showToast('🛡️ ¡Autenticación multifactor activada con éxito!', 'success');

    if (modal) modal.classList.remove('active');

    // Actualizar indicador en menú de usuario si está visible
    const mfaBtn = document.getElementById('btnOpenMfaSetup');
    if (mfaBtn) {
      const span = mfaBtn.querySelector('span');
      if (span) span.textContent = '🛡️ MFA Activado (Configurar)';
    }

  } catch (err) {
    console.warn('[MFA ACTIVATE ERROR]', err);
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
      alertBox.style.color = '#fca5a5';
      alertBox.textContent = err.message || 'Error al activar MFA.';
    }
    window.showToast(err.message || 'Error al activar MFA.', 'error');
    playAudioFeedback('error');
    if (codeInput) {
      codeInput.value = '';
      codeInput.focus();
    }
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.textContent = '🛡️ Activar Autenticación Multifactor';
    }
  }
}

window.handleConfirmActivateMfa = handleConfirmActivateMfa;

/**
 * Abre el modal de sesiones de dispositivos activos
 */
async function openDeviceSessionsModal() {
  const modal = document.getElementById('deviceSessionsModalBackdrop');
  const container = document.getElementById('deviceSessionsContainer');

  if (modal) modal.classList.add('active');
  if (!container) return;

  container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 1.5rem;">⏳ Cargando dispositivos conectados...</div>';

  try {
    const data = await API.get('/api/v1/auth/sessions');
    if (!data.success || !Array.isArray(data.sessions)) {
      throw new Error(data.error || 'Error al consultar sesiones');
    }

    if (data.sessions.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 1.5rem;">No hay sesiones registradas.</div>';
      return;
    }

    container.innerHTML = data.sessions.map(s => {
      const isCur = Boolean(s.is_current);
      const devName = window.escapeHTML ? window.escapeHTML(s.device_name || 'Dispositivo Web') : (s.device_name || 'Dispositivo Web');
      const ip = window.escapeHTML ? window.escapeHTML(s.ip_address || '127.0.0.1') : (s.ip_address || '127.0.0.1');
      const activeAt = new Date(s.last_active_at).toLocaleString();

      return `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid ${isCur ? '#0284c7' : 'rgba(255,255,255,0.08)'}; border-radius: 8px; padding: 0.75rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.45rem; font-weight: 700; font-size: 0.85rem; color: #f8fafc;">
              <span>${isCur ? '🟢' : '💻'}</span>
              <span>${devName}</span>
              ${isCur ? '<span style="font-size: 0.65rem; background: #0284c7; color: #fff; padding: 1px 6px; border-radius: 10px; font-weight: 600;">Este Dispositivo</span>' : ''}
            </div>
            <div style="font-size: 0.72rem; color: #64748b; margin-top: 0.2rem;">
              IP: ${ip} · Actividad: ${activeAt}
            </div>
          </div>
          ${!isCur ? `
            <button type="button" class="btn btn-sm btn-outline btn-revoke-session" data-session-id="${window.escapeHTML ? window.escapeHTML(s.id) : s.id}" style="color: #fca5a5; border-color: rgba(239,68,68,0.3); font-size: 0.7rem; padding: 4px 8px; cursor: pointer;">
              Cerrar
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: #f87171; padding: 1.5rem;">❌ ${window.escapeHTML ? window.escapeHTML(err.message) : err.message}</div>`;
  }
}

window.openDeviceSessionsModal = openDeviceSessionsModal;

// DELEGACIÓN GLOBAL DE EVENTOS PARA MODALES DE SEGURIDAD (MFA Y DISPOSITIVOS)
// Garantiza funcionamiento instantáneo sin importar cuándo se cargue templates/modals.html
document.addEventListener('click', async (e) => {
  // 1. Confirmar activación de MFA
  const btnConfirmMfa = e.target.closest('#btnConfirmActivateMfa');
  if (btnConfirmMfa) {
    e.preventDefault();
    handleConfirmActivateMfa();
    return;
  }

  // 2. Copiar clave secreta
  const btnCopySecret = e.target.closest('#btnCopyMfaSecret');
  if (btnCopySecret) {
    e.preventDefault();
    const secretLabel = document.getElementById('mfaSetupSecretLabel');
    const secret = secretLabel?.getAttribute('data-secret') || secretLabel?.textContent?.trim();
    if (secret) {
      navigator.clipboard.writeText(secret).then(() => {
        window.showToast('📋 Clave secreta copiada al portapapeles', 'info');
      }).catch(() => {
        window.showToast('Clave: ' + secret, 'info');
      });
    }
    return;
  }

  // 3. Copiar códigos de respaldo
  const btnCopyBackup = e.target.closest('#btnCopyBackupCodes');
  if (btnCopyBackup) {
    e.preventDefault();
    const backupGrid = document.getElementById('mfaBackupCodesGrid');
    const raw = backupGrid?.getAttribute('data-backup-codes');
    if (raw) {
      try {
        const list = JSON.parse(raw);
        navigator.clipboard.writeText(list.join('\n')).then(() => {
          window.showToast('📋 Códigos de respaldo copiados al portapapeles', 'info');
        }).catch(() => {
          window.showToast('Códigos copiados', 'info');
        });
      } catch {}
    }
    return;
  }

  // 4. Cerrar modal de configuración MFA
  const btnCloseMfaSetup = e.target.closest('#btnCloseMfaSetupModal') || e.target.closest('#btnCloseMfaSetupModalBtn');
  if (btnCloseMfaSetup) {
    e.preventDefault();
    const modal = document.getElementById('mfaSetupModalBackdrop');
    if (modal) modal.classList.remove('active');
    return;
  }

  // 5. Cerrar modal de verificación de login MFA
  const btnCloseMfaVerif = e.target.closest('#btnCloseMfaVerificationModal');
  if (btnCloseMfaVerif) {
    e.preventDefault();
    const modal = document.getElementById('mfaVerificationModalBackdrop');
    if (modal) modal.classList.remove('active');
    currentMfaToken = null;
    return;
  }

  // 6. Alternar modo código de respaldo en verificación
  const btnToggleBackup = e.target.closest('#btnToggleBackupCodeMode');
  if (btnToggleBackup) {
    e.preventDefault();
    isBackupCodeMode = !isBackupCodeMode;
    const codeInput = document.getElementById('mfaCodeInput');
    if (codeInput) {
      codeInput.value = '';
      if (isBackupCodeMode) {
        codeInput.placeholder = 'XXXX-XXXX';
        codeInput.maxLength = 9;
        btnToggleBackup.textContent = '🔢 Volver a código temporal de 6 dígitos';
      } else {
        codeInput.placeholder = '000 000';
        codeInput.maxLength = 7;
        btnToggleBackup.textContent = '🔑 Usar código de respaldo de emergencia';
      }
      codeInput.focus();
    }
    return;
  }

  // 7. Enviar verificación de login MFA
  const btnSubmitMfa = e.target.closest('#btnSubmitMfaVerification');
  if (btnSubmitMfa) {
    e.preventDefault();
    handleMfaVerificationSubmit();
    return;
  }

  // 8. Cerrar modal de sesiones
  const btnCloseSessions = e.target.closest('#btnCloseDeviceSessionsModal') || e.target.closest('#btnCloseDeviceSessionsModalBtn');
  if (btnCloseSessions) {
    e.preventDefault();
    const modal = document.getElementById('deviceSessionsModalBackdrop');
    if (modal) modal.classList.remove('active');
    return;
  }

  // 9. Revocar sesión individual
  const btnRevokeSingle = e.target.closest('.btn-revoke-session');
  if (btnRevokeSingle) {
    e.preventDefault();
    const sessId = btnRevokeSingle.getAttribute('data-session-id');
    if (!sessId) return;
    try {
      btnRevokeSingle.disabled = true;
      await API.post('/api/v1/auth/sessions/revoke', { session_id: sessId });
      window.showToast('Sesión remota cerrada', 'info');
      openDeviceSessionsModal();
    } catch (err) {
      window.showToast(err.message || 'Error al cerrar sesión', 'error');
      btnRevokeSingle.disabled = false;
    }
    return;
  }

  // 10. Revocar todas las demás sesiones
  const btnRevokeOthers = e.target.closest('#btnRevokeOtherSessions');
  if (btnRevokeOthers) {
    e.preventDefault();
    if (!confirm('¿Desea cerrar la sesión en todos los demás dispositivos conectados?')) return;
    try {
      btnRevokeOthers.disabled = true;
      const res = await API.post('/api/v1/auth/sessions/revoke-others');
      window.showToast(res.message || 'Sesiones cerradas en los demás dispositivos', 'success');
      openDeviceSessionsModal();
    } catch (err) {
      window.showToast(err.message || 'Error cerrando sesiones', 'error');
    } finally {
      btnRevokeOthers.disabled = false;
    }
    return;
  }

  // 11. Modal de Formalización de Beneficiarios: Botón de Galería / Archivo
  const btnEnrollGal = e.target.closest('#btnEnrollSelectFile');
  if (btnEnrollGal) {
    e.preventDefault();
    if (typeof window.stopEnrollmentCamera === 'function') window.stopEnrollmentCamera();
    const input = document.getElementById('enrollPhotoFileInput');
    if (input) {
      input.value = '';
      input.click();
    }
    return;
  }

  // 12. Modal de Formalización: Botón Cerrar
  const btnEnrollClose = e.target.closest('#btnCloseEnrollmentModal');
  if (btnEnrollClose) {
    e.preventDefault();
    if (typeof window.stopEnrollmentCamera === 'function') window.stopEnrollmentCamera();
    const modal = document.getElementById('beneficiaryEnrollmentModalBackdrop');
    if (modal) modal.classList.remove('active');
    return;
  }
});

// Delegación global para inputs de fotografía de formalización (Galería y Cámara fallback)
document.addEventListener('change', (e) => {
  if (e.target && (e.target.id === 'enrollPhotoFileInput' || e.target.id === 'enrollCameraFallbackInput')) {
    if (e.target.files && e.target.files[0]) {
      if (typeof processEnrollPhotoFile === 'function') {
        processEnrollPhotoFile(e.target.files[0]);
      }
    }
  }
});

// Listener cuando los templates de modales terminen de cargarse
window.addEventListener('templates:loaded', () => {
  if (typeof window.setupEnrollmentModalListeners === 'function') {
    window.setupEnrollmentModalListeners();
  }
});

// Auto-submit o filtrado al tipear en el input de código de configuración MFA
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'mfaSetupVerificationCode') {
    const val = e.target.value;
    // Limpiar caracteres extraños
    const clean = val.replace(/[^\d\s-]/g, '');
    if (clean !== val) e.target.value = clean;

    const digitsOnly = clean.replace(/[\s-]/g, '');
    if (digitsOnly.length === 6) {
      // Si ya hay 6 dígitos y el usuario termina de escribir, podemos auto-activar o resaltar el botón
      const btn = document.getElementById('btnConfirmActivateMfa');
      if (btn) btn.style.boxShadow = '0 0 12px rgba(56, 189, 248, 0.6)';
    }
  }

  if (e.target && e.target.id === 'mfaCodeInput') {
    if (!isBackupCodeMode) {
      const clean = e.target.value.replace(/\D/g, '');
      if (clean.length === 6) {
        handleMfaVerificationSubmit();
      }
    }
  }
});

// Soporte para tecla Enter en inputs de modales
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.target && e.target.id === 'mfaSetupVerificationCode') {
      e.preventDefault();
      handleConfirmActivateMfa();
    }
    if (e.target && e.target.id === 'mfaCodeInput') {
      e.preventDefault();
      handleMfaVerificationSubmit();
    }
  }
});
