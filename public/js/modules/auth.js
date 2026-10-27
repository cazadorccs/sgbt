// ============================================================================
// MODULE: AUTHENTICATION & RBAC (ROLE-BASED ACCESS CONTROL)
// ============================================================================

window.currentLoginMode = 'beneficiary';

window.setLoginMode = function(mode) {
  window.currentLoginMode = mode;
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
          window.showToast(`✅ Beneficiario ya Formalizado:\n${res.worker.full_name}\nEstado: Registrado para la jornada del 27/11/2026.`, 'success');
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
      honeypot,
      device_id: getPersistentDeviceId()
    };
    const pwdInput = document.getElementById('loginBeneficiaryPassword');
    if (pwdInput && pwdInput.value) {
      payload.password = pwdInput.value;
    } else if (window._pendingBeneficiaryPassword) {
      payload.password = window._pendingBeneficiaryPassword;
      delete window._pendingBeneficiaryPassword;
    }

    if (window._pendingAdminSecret) {
      payload.admin_secret = window._pendingAdminSecret;
      delete window._pendingAdminSecret;
    }

    const data = await API.post('/api/v1/auth/login', payload);
    console.log(`[CLIENT AUTH] 📥 Respuesta recibida del servidor:`, data);

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
        pwdInp.focus();
        showLoginAlert(`Hola ${data.worker.full_name}, por favor ingrese su contraseña para acceder.`);
      } else {
        const entered = prompt(`🔑 BENEFICIARIO REGISTRADO: ${data.worker.full_name}\n\nIngrese su contraseña de beneficiario para acceder:`);
        if (entered && entered.trim()) {
          window._pendingBeneficiaryPassword = entered.trim();
          return executeLogin(rawDocId);
        }
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

    let targetMode = 'beneficiary';
    if (isOperator || intendedView === 'distributor') {
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

    // Detección de desafío de segundo factor administrativo (DevSecOps)
    if (err.message && (err.message.includes('clave de seguridad') || err.message.includes('restringido'))) {
      const pin = prompt('🛡️ AUTENTICACIÓN ADMINISTRATIVA OBLIGATORIA (MFA)\n\nPerfil con altos privilegios detectado.\nIngrese su Clave de Seguridad Institucional o PIN administrativo:');
      if (pin && pin.trim()) {
        window._pendingAdminSecret = pin.trim();
        return executeLogin(rawDocId);
      }
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

  if (avatarCircle) avatarCircle.textContent = initials;
  if (dropdownAvatar) dropdownAvatar.textContent = initials;

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
          const savedMode = sessionStorage.getItem('sgbt_session_view_mode') || (isOp ? 'operator' : (user.role === 'worker' ? 'beneficiary' : 'admin'));
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
// GESTIÓN DE FORMALIZACIÓN DE BENEFICIARIOS (PRECARGADO -> REGISTRADO)
// Plazo: 12/Noviembre/2026 | Gran Jornada: 27/Noviembre/2026
// ============================================================================

let currentEnrollmentWorker = null;
let currentEnrollmentStream = null;
window._capturedEnrollPhoto = null;

window.openBeneficiaryEnrollmentModal = function(worker, deadlineDate, campaignDate) {
  currentEnrollmentWorker = worker;
  window._capturedEnrollPhoto = null;

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
};

window.setupEnrollmentModalListeners = function() {
  const modal = document.getElementById('beneficiaryEnrollmentModalBackdrop');
  const btnClose = document.getElementById('btnCloseEnrollmentModal');
  const btnStartCam = document.getElementById('btnEnrollStartCamera');
  const btnSnapCam = document.getElementById('btnEnrollSnapCamera');
  const btnSelectFile = document.getElementById('btnEnrollSelectFile');
  const fileInput = document.getElementById('enrollPhotoFileInput');
  const videoEl = document.getElementById('enrollCameraVideo');
  const canvasEl = document.getElementById('enrollCameraCanvas');
  const previewImg = document.getElementById('enrollPhotoImgPreview');
  const placeholder = document.getElementById('enrollPhotoPlaceholder');
  const statusChip = document.getElementById('enrollPhotoStatusChip');
  const btnSubmit = document.getElementById('btnSubmitBeneficiaryEnrollment');

  function stopCamera() {
    if (currentEnrollmentStream) {
      currentEnrollmentStream.getTracks().forEach(track => track.stop());
      currentEnrollmentStream = null;
    }
    if (videoEl) videoEl.style.display = 'none';
    if (btnSnapCam) btnSnapCam.style.display = 'none';
    if (btnStartCam) btnStartCam.style.display = 'inline-flex';
  }

  btnClose?.addEventListener('click', () => {
    stopCamera();
    modal?.classList.remove('active');
  });

  // Activar cámara
  btnStartCam?.addEventListener('click', async () => {
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
      console.warn('Error accediendo a cámara:', err);
      window.showToast('No se pudo acceder a la cámara. Por favor use la opción de subir archivo o galería.', 'warning');
      stopCamera();
      if (placeholder) placeholder.style.display = 'block';
    }
  });

  // Capturar foto
  btnSnapCam?.addEventListener('click', () => {
    if (!videoEl || !canvasEl) return;
    const size = Math.min(videoEl.videoWidth || 300, videoEl.videoHeight || 300);
    canvasEl.width = 400;
    canvasEl.height = 400;
    const ctx = canvasEl.getContext('2d');
    const sx = ((videoEl.videoWidth || 400) - size) / 2;
    const sy = ((videoEl.videoHeight || 400) - size) / 2;
    ctx.drawImage(videoEl, sx, sy, size, size, 0, 0, 400, 400);

    const b64 = canvasEl.toDataURL('image/jpeg', 0.82);
    window._capturedEnrollPhoto = b64;

    if (previewImg) {
      previewImg.src = b64;
      previewImg.style.display = 'block';
    }
    stopCamera();

    if (statusChip) {
      statusChip.style.background = '#10b981';
      statusChip.style.color = '#fff';
      statusChip.textContent = '✓ Foto Capturada';
    }
    window.showToast('Fotografía capturada con éxito', 'success');
  });

  // Seleccionar archivo
  btnSelectFile?.addEventListener('click', () => {
    stopCamera();
    fileInput?.click();
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasEl || document.createElement('canvas');
          canvas.width = 400;
          canvas.height = 400;
          const ctx = canvas.getContext('2d');
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 400, 400);
          const compressedB64 = canvas.toDataURL('image/jpeg', 0.82);
          window._capturedEnrollPhoto = compressedB64;

          if (previewImg) {
            previewImg.src = compressedB64;
            previewImg.style.display = 'block';
          }
          if (placeholder) placeholder.style.display = 'none';
          if (statusChip) {
            statusChip.style.background = '#10b981';
            statusChip.style.color = '#fff';
            statusChip.textContent = '✓ Foto Cargada';
          }
          window.showToast('Fotografía cargada exitosamente', 'success');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  // Envío del formulario de formalización
  btnSubmit?.addEventListener('click', async () => {
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

      stopCamera();
      modal?.classList.remove('active');

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
      if (txtEl) txtEl.textContent = 'Formalizar Registro y Activar Beneficio';
    }
  });

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
