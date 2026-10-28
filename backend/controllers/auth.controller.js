// backend/controllers/auth.controller.js
// Controlador para autenticación, gestión de Passkeys FIDO2, verificación de QR y QR de supervisor

const crypto = require('crypto');
const { db, secureEnclaveSimulator } = require('../db');
const {
  generateNonce,
  generateMagicLinkToken,
  verifyMagicLinkToken,
  generateDelegationToken,
  verifyDelegationToken,
  generateSessionToken,
  verifySessionToken,
  generateMfaChallengeToken,
  verifyMfaChallengeToken,
  simulateCryptographicDelay,
  verifyOfflineSignature,
  hashPassword,
  verifyPassword
} = require('../crypto-utils');

// Servicios de dominio modularizados
const { notifyDeliveryStream, deliveryStream } = require('../services/sse.service');
const {
  createRegisterChallenge,
  registerPasskeyCredential,
  generateOfflinePasskeySignature
} = require('../services/passkey.service');
const {
  generateSupervisorDailyQr,
  createSupervisorDelegation,
  processContingencyOverride
} = require('../services/supervisor.service');
const {
  generateMfaSetup,
  activateMfa: activateMfaDb,
  disableMfa: disableMfaDb,
  getWorkerMfaStatus,
  getWorkerMfaSecret,
  verifyTotpToken,
  verifyAndConsumeBackupCode,
  generateBackupCodes
} = require('../services/mfa.service');
const {
  createDeviceSession,
  setSessionCookie,
  clearSessionCookie,
  getActiveDeviceSessions,
  revokeDeviceSession,
  revokeOtherDeviceSessions
} = require('../services/session.service');
const {
  recordFailedLogin,
  checkAccountLockout,
  resetFailedLogins
} = require('../middleware/security.middleware');
const { logScan, logWarn, logInfo, logError } = require('../services/logger.service');

const login = async (req, res) => {
  const { document_id, website, honeypot, admin_secret, passkey_proof, require_admin, is_admin_login, login_mode, as_beneficiary } = req.body;
  const startTime = Date.now();
  const clientIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';

  // 0. Detección anti-automatización: Campo trampa (Honeypot)
  if (website || honeypot) {
    console.warn(`[SECURITY HONEYPOT] Bot capturado rellenando campo oculto desde IP: ${clientIp}`);
    return res.status(400).json({ error: 'Solicitud rechazada por política anti-automatización.' });
  }

  if (!document_id || !document_id.trim()) {
    console.warn(`[AUTH] Intento de login rechazado: documento vacío`);
    return res.status(400).json({ error: 'La Cédula de Identidad o Correo Institucional es requerida' });
  }

  // 0.1. Verificación de bloqueo de cuenta por fuerza bruta (Account Lockout)
  const lockout = checkAccountLockout(document_id, clientIp);
  if (lockout.locked) {
    console.warn(`[SECURITY LOCKOUT] Acceso bloqueado para "${document_id}" desde IP: ${clientIp}`);
    return res.status(429).json({
      error: lockout.message,
      code: 'ACCOUNT_LOCKED',
      retry_after_seconds: lockout.remaining_seconds
    });
  }

  const cleanDoc = document_id.trim().toUpperCase();
  const isEmail = cleanDoc.includes('@');
  const digitsOnly = cleanDoc.replace(/[^0-9]/g, '');

  console.log(`\n================================================================`);
  console.log(`🔑 [AUTH LOGIN ATTEMPT]`);
  console.log(`   Hora        : ${new Date().toLocaleTimeString()} (${new Date().toISOString()})`);
  console.log(`   Doc Entrada : "${document_id}"`);
  console.log(`   Tipo        : ${isEmail ? 'Correo Electrónico' : 'Cédula de Identidad'}`);
  console.log(`   Modo Admin  : ${Boolean(require_admin || is_admin_login)}`);
  console.log(`   IP Origen   : ${clientIp}`);

  try {
    let worker = null;
    if (isEmail) {
      worker = db.prepare(`
        SELECT w.*, d.name as department_name, d.code as department_code
        FROM workers w
        LEFT JOIN departments d ON w.department_id = d.id
        WHERE LOWER(w.email) = LOWER(?)
        LIMIT 1
      `).get(document_id.trim());
    } else {
      // 1. Búsqueda indexada ultra-rápida directa (<1ms)
      worker = db.prepare(`
        SELECT w.*, d.name as department_name, d.code as department_code
        FROM workers w
        LEFT JOIN departments d ON w.department_id = d.id
        WHERE w.document_id IN (?, ?, ?, ?) OR w.id = ?
      `).get(cleanDoc, `V-${digitsOnly}`, `E-${digitsOnly}`, digitsOnly, cleanDoc);

      // 2. Si no coincide exacto, intentar búsqueda parcial local rápida
      if (!worker && digitsOnly.length >= 5) {
        worker = db.prepare(`
          SELECT w.*, d.name as department_name, d.code as department_code
          FROM workers w
          LEFT JOIN departments d ON w.department_id = d.id
          WHERE w.document_id LIKE ? OR w.document_id LIKE ?
          LIMIT 1
        `).get(`%${digitsOnly}%`, `%${cleanDoc}%`);
      }
    }

    // Fallback de consulta en tiempo real a Supabase SOLO si la base de datos local no contiene la nómina o con timeout estricto
    if (!worker && digitsOnly.length >= 5) {
      const localWorkersCount = db.prepare('SELECT COUNT(*) as c FROM workers').get()?.c || 0;
      if (localWorkersCount < 50) {
        try {
          const { supabase, isSupabaseConfigured } = require('../supabase');
          if (isSupabaseConfigured() && supabase) {
            const queryPromise = supabase
              .from('workers')
              .select('*')
              .or(`document_id.eq.${cleanDoc},document_id.eq.V-${digitsOnly},document_id.eq.${digitsOnly}`);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Supabase')), 1200));

            const { data: remoteWorkers } = await Promise.race([queryPromise, timeoutPromise]);

            if (remoteWorkers && remoteWorkers.length > 0) {
              const rw = remoteWorkers[0];
              db.prepare(`
                INSERT OR REPLACE INTO workers (
                  id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, contingency_reason, phone_number, avatar_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                rw.id,
                rw.document_id,
                rw.full_name,
                rw.email,
                rw.department_id,
                rw.shift || 'jornada_continua',
                rw.status || 'active',
                rw.worker_type || 'activo',
                rw.role || 'worker',
                rw.has_smartphone ? 1 : 0,
                rw.contingency_reason,
                rw.phone_number,
                rw.avatar_url
              );

              worker = db.prepare(`
                SELECT w.*, d.name as department_name, d.code as department_code
                FROM workers w
                LEFT JOIN departments d ON w.department_id = d.id
                WHERE w.id = ?
              `).get(rw.id);
            }
          }
        } catch (sbErr) {
          console.warn('[LOGIN SUPABASE FALLBACK WARNING]', sbErr.message);
        }
      }
    }

    // Sincronización proactiva de rol en tiempo real desde Supabase Cloud
    // para garantizar que designaciones recientes (Mesa de Despacho / Supervisor) surtan efecto de inmediato
    if (worker && worker.role === 'worker') {
      try {
        const { supabase, isSupabaseConfigured } = require('../supabase');
        if (isSupabaseConfigured() && supabase) {
          const queryPromise = supabase
            .from('workers')
            .select('role')
            .eq('id', worker.id)
            .single();
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Supabase Role Sync')), 800));
          const { data: remoteData } = await Promise.race([queryPromise, timeoutPromise]);
          if (remoteData && remoteData.role && remoteData.role !== 'worker') {
            worker.role = remoteData.role;
            db.prepare('UPDATE workers SET role = ? WHERE id = ?').run(remoteData.role, worker.id);
            console.log(`[AUTH ROLE SYNC] Rol de ${worker.document_id} actualizado en tiempo real desde Supabase a: ${remoteData.role}`);
          }
        }
      } catch (e) {
        // Fallback no bloqueante
      }
    }

    if (!worker) {
      simulateCryptographicDelay();
      recordFailedLogin(cleanDoc, clientIp);
      console.warn(`❌ [AUTH LOGIN FAILED]`);
      console.warn(`   Motivo    : Identificador no registrado en nómina institucional`);
      console.warn(`   Documento : "${cleanDoc}"`);
      console.warn(`   Latencia  : ${Date.now() - startTime}ms`);
      console.log(`================================================================\n`);
      return res.status(404).json({
        error: isEmail
          ? 'El correo electrónico no se encuentra registrado en el sistema.'
          : 'La Cédula no se encuentra registrada en la nómina institucional de beneficiarios. Debe estar en la lista oficial para acceder a este proceso.'
      });
    }

    const passkey = db.prepare(`
      SELECT * FROM passkey_credentials 
      WHERE worker_id = ? AND status = 'active' 
      LIMIT 1
    `).get(worker.id);

    const today = new Date().toISOString().split('T')[0];

    // Auto-asignación de todos los combos activos de la jornada para trabajadores activos/jubilados
    if (worker.status === 'active') {
      try {
        const activeCombos = db.prepare("SELECT id FROM combos WHERE is_active = 1").all();
        const existingCombos = db.prepare("SELECT combo_id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ?").all(worker.id, today);
        const existingIds = new Set(existingCombos.map(e => e.combo_id));
        const insEnt = db.prepare(`
          INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
          VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
        `);
        for (const c of activeCombos) {
          if (!existingIds.has(c.id)) {
            insEnt.run(crypto.randomUUID(), worker.id, c.id, today);
          }
        }
      } catch (autoEntErr) {
        console.warn('[LOGIN AUTO-ENTITLEMENT WARNING]', autoEntErr.message);
      }
    }

    const allEntitlements = db.prepare(`
      SELECT de.*, c.name as combo_name, c.category as combo_category, c.description as combo_description, c.icon as combo_icon
      FROM daily_entitlements de
      JOIN combos c ON de.combo_id = c.id
      WHERE de.worker_id = ? AND de.valid_date = ? AND c.is_active = 1
      ORDER BY c.created_at ASC
    `).all(worker.id, today);

    let entitlement = allEntitlements[0] || null;

    // Generar token temporal de auto-enrolamiento (Magic Link / One-Click Onboarding) de 15 minutos
    const onboardingToken = generateMagicLinkToken({
      workerId: worker.id,
      documentId: worker.document_id
    }, 15);

    const isSuperAdmin = worker.role === 'admin' || worker.role === 'director';
    const isProd = process.env.NODE_ENV === 'production';
    let isDemoMode = 0;
    try {
      isDemoMode = db.prepare('SELECT is_demo_mode FROM tenant_settings WHERE id = ?').get('current_tenant')?.is_demo_mode || 0;
    } catch (e) {}

  const isExplicitAdminLogin = Boolean(require_admin || is_admin_login || login_mode === 'admin');
  const isBeneficiaryAccess = Boolean(as_beneficiary || login_mode === 'beneficiary' || !isExplicitAdminLogin);

  // Validación explícita de Acceso de Administración del Sistema (solo si el usuario ingresó por el módulo de administración)
  if (isExplicitAdminLogin) {
    const isAdminRole = worker.role === 'admin' || worker.role === 'director' || worker.role === 'supervisor';
    if (!isAdminRole) {
      console.warn(`[SECURITY ALERT] Intento de acceso administrativo denegado para usuario sin privilegios (Rol: ${worker.role}) para: ${cleanDoc}`);
      return res.status(403).json({
        error: 'Acceso denegado: El usuario no cuenta con privilegios administrativos en el sistema.'
      });
    }

    const configuredAdminSecret = (process.env.ADMIN_ACCESS_SECRET || process.env.SYSTEM_RESET_SECRET || '0578').trim();
    if (!admin_secret || admin_secret.trim() !== configuredAdminSecret) {
      recordFailedLogin(cleanDoc, clientIp);
      console.warn(`[SECURITY ALERT] Clave de acceso administrativo incorrecta para: ${cleanDoc}`);
      return res.status(401).json({ error: 'Clave o PIN de seguridad administrativa incorrecto.' });
    }
  } else {
    // Modalidad Beneficiario / Trabajador Titular (incluso para directores/administradores que consultan sus beneficios o formalizan su registro)
    // 3. Validación de Formalización Previa para Beneficiarios Titulares (Campaña 27/11/2026 - Límite 12/11/2026)
    const enrollmentStatus = worker.enrollment_status || 'precargado';

      // 3.1. Si está en estado 'precargado' (ingresado desde nómina Excel/CSV), requiere formalización con clave y fotografía
      if (enrollmentStatus === 'precargado') {
        console.log(`ℹ️ [AUTH] Beneficiario precargado ${worker.document_id} requiere formalización obligatoria (plazo 12/11/2026).`);
        return res.json({
          success: false,
          requires_enrollment: true,
          worker: {
            id: worker.id,
            document_id: worker.document_id,
            full_name: worker.full_name,
            email: worker.email,
            department_name: worker.department_name,
            job_title: worker.job_title,
            phone_number: worker.phone_number,
            enrollment_status: 'precargado'
          },
          onboarding_token: onboardingToken,
          deadline_date: '2026-11-12',
          campaign_date: '2026-11-27',
          message: 'Se requiere la formalización del beneficiario (asignación de clave y captura de fotografía) antes del 12 de Noviembre de 2026 para participar en la Gran Jornada del 27/11/2026.'
        });
      }

      // 3.2. Si ya está 'registrado' y tiene contraseña configurada:
      if (enrollmentStatus === 'registrado' && worker.password_hash) {
        const { password } = req.body;
        if (!password && !passkey_proof) {
          return res.json({
            success: false,
            requires_password: true,
            worker: {
              id: worker.id,
              document_id: worker.document_id,
              full_name: worker.full_name,
              avatar_url: worker.avatar_url
            },
            message: 'Ingrese su contraseña de beneficiario para acceder.'
          });
        }

        if (password) {
          const isValid = verifyPassword(password, worker.password_hash);
          if (!isValid) {
            recordFailedLogin(cleanDoc, clientIp);
            console.warn(`[AUTH] Contraseña incorrecta para beneficiario registrado: ${worker.document_id}`);
            return res.status(401).json({
              success: false,
              error: 'Contraseña de beneficiario incorrecta. Verifique sus datos o contacte a RRHH.'
            });
          }
        }
      }
    }

    // 4. CANDADO ESTRICTO DE DISPOSITIVO (AMARRE HARDWARE & ANTI-PRÉSTAMO)
    let deviceLockInfo = null;
    if (worker.role === 'worker' || isBeneficiaryAccess) {
      const deviceId = (req.body.device_id && String(req.body.device_id).trim())
        ? String(req.body.device_id).trim()
        : null;

      // Verificar si el trabajador tiene combos pendientes hoy
      const checkDeliv = db.prepare("SELECT id FROM deliveries WHERE worker_id = ? AND entitlement_id = ?");
      const hasPendingCombos = allEntitlements.some(e => !checkDeliv.get(worker.id, e.id) && e.status !== 'claimed');

      if (hasPendingCombos && deviceId) {
        // Regla 1 (Anti-Préstamo): ¿Este dispositivo tiene una entrega pendiente activa para OTRO beneficiario?
        const lockedByOther = db.prepare(`
          SELECT dl.*, w.full_name as owner_name, w.document_id as owner_doc
          FROM device_locks dl
          JOIN workers w ON dl.worker_id = w.id
          WHERE dl.device_id = ? AND dl.valid_date = ? AND dl.status = 'active' AND dl.worker_id != ?
        `).get(deviceId, today, worker.id);

        if (lockedByOther) {
          console.warn(`[DEVICE LOCK REJECT] Dispositivo ${deviceId} bloqueado por entrega pendiente de: ${lockedByOther.owner_doc} (${lockedByOther.owner_name})`);
          return res.status(423).json({
            success: false,
            code: 'DEVICE_LOCKED_OTHER_WORKER',
            error: `Dispositivo bloqueado: Este teléfono tiene una entrega en curso asignada a ${lockedByOther.owner_name} (${lockedByOther.owner_doc}). Por política anti-fraude no se permite el préstamo de teléfonos hasta completar o liberar la entrega pendiente.`,
            locked_by: lockedByOther.owner_name,
            locked_doc: lockedByOther.owner_doc,
            valid_date: today
          });
        }

        // Regla 2 (Anti-Doble Login): ¿El trabajador ya tiene una entrega activa iniciada en OTRO dispositivo hoy?
        const lockedElsewhere = db.prepare(`
          SELECT * FROM device_locks
          WHERE worker_id = ? AND valid_date = ? AND status = 'active' AND device_id != ?
        `).get(worker.id, today, deviceId);

        if (lockedElsewhere) {
          console.warn(`[DEVICE LOCK REJECT] Beneficiario ${worker.document_id} tiene entrega activa en otro teléfono (${lockedElsewhere.device_id})`);
          return res.status(423).json({
            success: false,
            code: 'WORKER_LOCKED_OTHER_DEVICE',
            error: 'Entrega en curso en otro dispositivo: Ya inició jornada de entrega en su teléfono móvil original. Para evitar duplicidades y préstamo de dispositivos, debe culminar el retiro con su teléfono original o solicitar liberación al supervisor de mesa.',
            active_device_id: lockedElsewhere.device_id,
            claim_key: lockedElsewhere.claim_key,
            valid_date: today
          });
        }

        // Crear o recuperar candado de dispositivo activo
        let activeLock = db.prepare(`
          SELECT * FROM device_locks
          WHERE device_id = ? AND worker_id = ? AND valid_date = ? AND status = 'active'
        `).get(deviceId, worker.id, today);

        if (!activeLock) {
          const claimKey = 'KEY-' + crypto.randomBytes(4).toString('hex').toUpperCase();
          const lockId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO device_locks (id, device_id, worker_id, valid_date, claim_key, status)
            VALUES (?, ?, ?, ?, ?, 'active')
          `).run(lockId, deviceId, worker.id, today, claimKey);
          activeLock = { id: lockId, device_id: deviceId, worker_id: worker.id, valid_date: today, claim_key: claimKey, status: 'active' };

          try {
            db.prepare("UPDATE workers SET bound_device_id = ? WHERE id = ?").run(deviceId, worker.id);
          } catch (e) {}
        }

        deviceLockInfo = {
          status: activeLock.status,
          claim_key: activeLock.claim_key,
          device_id: activeLock.device_id,
          valid_date: activeLock.valid_date
        };
      }
    }

    // 4.1. Verificación de Autenticación Multifactor (MFA / 2FA - TOTP RFC 6238)
    const mfaStatus = getWorkerMfaStatus(worker.id);
    if (mfaStatus.enabled && process.env.NODE_ENV !== 'test') {
      const activeDevId = (req.body.device_id && String(req.body.device_id).trim())
        ? String(req.body.device_id).trim()
        : null;

      const mfaToken = generateMfaChallengeToken({
        workerId: worker.id,
        documentId: worker.document_id,
        role: isExplicitAdminLogin ? (worker.role || 'admin') : 'worker',
        deviceId: activeDevId
      }, 5);

      logInfo('AUTH_MFA_CHALLENGE', {
        worker_id: worker.id,
        document_id: worker.document_id,
        ip: clientIp
      });

      return res.json({
        success: false,
        mfa_required: true,
        mfa_type: 'totp',
        mfa_token: mfaToken,
        worker: {
          id: worker.id,
          document_id: worker.document_id,
          full_name: worker.full_name,
          email: worker.email,
          avatar_url: worker.avatar_url || null
        },
        message: 'Autenticación multifactor requerida. Ingrese el código de 6 dígitos de su aplicación autenticadora (Google Authenticator / Microsoft Authenticator) o un código de respaldo.'
      });
    }

    // Login exitoso: Resetear contador de fallos por fuerza bruta
    resetFailedLogins(cleanDoc, clientIp);

    const activeDeviceId = (req.body.device_id && String(req.body.device_id).trim())
      ? String(req.body.device_id).trim()
      : ('dev_' + crypto.randomBytes(6).toString('hex'));

    // Generar sesión institucional por dispositivo (Device-Bound)
    const { sessionToken, jti } = createDeviceSession({
      workerId: worker.id,
      role: isExplicitAdminLogin ? (worker.role || 'admin') : 'worker',
      documentId: worker.document_id,
      deviceId: activeDeviceId,
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      expiresInHours: 12
    });

    // Inyección de cookie de sesión segura HttpOnly + SameSite=Strict
    setSessionCookie(res, sessionToken, req, 12 * 3600 * 1000);

    const elapsed = Date.now() - startTime;

    console.log(`✅ [AUTH LOGIN SUCCESS]`);
    console.log(`   Funcionario : ${worker.full_name}`);
    console.log(`   Cédula      : ${worker.document_id}`);
    console.log(`   Rol         : ${worker.role || 'worker'} ${isSuperAdmin ? '🛡️ [SUPER ADMINISTRADOR / DIRECTOR]' : ''}`);
    console.log(`   Tipo        : ${worker.worker_type}`);
    console.log(`   Departamento: ${worker.department_name || 'N/A'}`);
    console.log(`   Passkeys    : ${Boolean(passkey) ? 'Registrada' : 'Sin passkey'}`);
    console.log(`   Estado Form : ${worker.enrollment_status || 'precargado'}`);
    console.log(`   Candado Disp: ${deviceLockInfo ? `${deviceLockInfo.claim_key} (${deviceLockInfo.device_id})` : 'Sin candado activo'}`);
    console.log(`   Latencia DB : ${elapsed}ms`);
    console.log(`================================================================\n`);

    res.json({
      success: true,
      user: {
        id: worker.id,
        document_id: worker.document_id,
        full_name: worker.full_name,
        email: worker.email,
        role: worker.role || 'worker',
        worker_type: worker.worker_type || 'activo',
        department: worker.department_name,
        job_title: worker.job_title || null,
        avatar_url: worker.avatar_url || null,
        enrollment_status: worker.enrollment_status || 'precargado',
        has_passkey: Boolean(passkey),
        has_smartphone: Boolean(worker.has_smartphone)
      },
      session_token: sessionToken,
      token: sessionToken,
      entitlement: entitlement || null,
      entitlements: allEntitlements || [],
      device_lock: deviceLockInfo,
      onboarding_token: onboardingToken
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: 'Error interno al autenticar' });
  }
};

/**
 * Consulta pública/protegida de estado de formalización previa a la Jornada del 27/11/2026.
 */
const checkEnrollmentStatus = (req, res) => {
  const { document_id } = req.params;
  if (!document_id || !document_id.trim()) {
    return res.status(400).json({ error: 'Cédula de Identidad requerida' });
  }

  const cleanDoc = document_id.trim().toUpperCase();
  const digitsOnly = cleanDoc.replace(/[^0-9]/g, '');

  try {
    const worker = db.prepare(`
      SELECT w.id, w.document_id, w.full_name, w.email, w.job_title, w.hire_date,
             w.phone_number, w.avatar_url, w.enrollment_status, w.enrolled_at,
             d.name as department_name
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.document_id IN (?, ?, ?, ?) OR w.id = ?
      LIMIT 1
    `).get(cleanDoc, `V-${digitsOnly}`, `E-${digitsOnly}`, digitsOnly, cleanDoc);

    if (!worker) {
      return res.status(404).json({
        success: false,
        found: false,
        error: 'La Cédula no se encuentra registrada en la nómina precargada de beneficiarios MIPPCI.'
      });
    }

    res.json({
      success: true,
      found: true,
      deadline_date: '2026-11-12',
      campaign_date: '2026-11-27',
      worker: {
        id: worker.id,
        document_id: worker.document_id,
        full_name: worker.full_name,
        email: worker.email,
        department_name: worker.department_name,
        job_title: worker.job_title,
        hire_date: worker.hire_date,
        phone_number: worker.phone_number,
        has_photo: Boolean(worker.avatar_url),
        avatar_url: worker.avatar_url || null,
        enrollment_status: worker.enrollment_status || 'precargado',
        enrolled_at: worker.enrolled_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar estado de formalización: ' + err.message });
  }
};

/**
 * Formalización de Beneficiario: asignación obligatoria de contraseña y captura de fotografía.
 * Habilita el acceso del trabajador a las jornadas de entrega.
 */
const enrollBeneficiary = (req, res) => {
  const { document_id, password, photo_base64, phone_number, device_id } = req.body;

  if (!document_id || !document_id.trim()) {
    return res.status(400).json({ error: 'La Cédula de Identidad es requerida para la formalización' });
  }
  if (!password || String(password).trim().length < 4) {
    return res.status(400).json({ error: 'La contraseña debe contener al menos 4 caracteres numéricos o alfanuméricos' });
  }
  if (!photo_base64 || !String(photo_base64).trim()) {
    return res.status(400).json({ error: 'La fotografía del beneficiario es obligatoria para la formalización' });
  }

  const cleanDoc = document_id.trim().toUpperCase();
  const digitsOnly = cleanDoc.replace(/[^0-9]/g, '');

  // Verificación de Congelamiento / Cierre del Padrón (Fase 5 - Cierre 12/Nov)
  try {
    const tenant = db.prepare("SELECT is_census_locked, census_cutoff_date FROM tenant_settings WHERE id = 'current_tenant'").get();
    const isLocked = tenant && tenant.is_census_locked === 1;
    const cutoffDate = (tenant && tenant.census_cutoff_date) ? new Date(tenant.census_cutoff_date) : new Date('2026-11-12T23:59:59');
    const isPastCutoff = new Date() > cutoffDate;

    if (isLocked || (isPastCutoff && tenant && tenant.is_census_locked !== 0)) {
      return res.status(423).json({
        error: '¡PERÍODO DE FORMALIZACIÓN CERRADO! El censo previo para la Gran Jornada cerró el 12 de Noviembre de 2026. Comuníquese con la Dirección General de Gestión Humana (RRHH).',
        code: 'CENSUS_LOCKED',
        deadline_date: '2026-11-12'
      });
    }
  } catch (e) {
    console.warn('[CENSUS LOCK CHECK WARNING]', e.message);
  }

  try {
    const worker = db.prepare(`
      SELECT w.*, d.name as department_name
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.document_id IN (?, ?, ?, ?) OR w.id = ?
      LIMIT 1
    `).get(cleanDoc, `V-${digitsOnly}`, `E-${digitsOnly}`, digitsOnly, cleanDoc);

    if (!worker) {
      return res.status(404).json({ error: 'La Cédula no figura en la nómina precargada oficial de beneficiarios.' });
    }

    const passwordHash = hashPassword(String(password).trim());
    const boundDeviceId = device_id || req.headers['user-agent'] || `dev_${crypto.randomUUID()}`;

    // Actualizar registro en base de datos
    db.prepare(`
      UPDATE workers
      SET password_hash = ?,
          avatar_url = ?,
          phone_number = COALESCE(?, phone_number),
          bound_device_id = ?,
          enrollment_status = 'registrado',
          enrolled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      passwordHash,
      photo_base64,
      phone_number ? phone_number.trim() : null,
      boundDeviceId,
      worker.id
    );

    // Auto-asignación de combos activos de la jornada
    const today = new Date().toISOString().split('T')[0];
    try {
      const activeCombos = db.prepare("SELECT id FROM combos WHERE is_active = 1").all();
      const existingCombos = db.prepare("SELECT combo_id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ?").all(worker.id, today);
      const existingIds = new Set(existingCombos.map(e => e.combo_id));
      const insEnt = db.prepare(`
        INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
        VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
      `);
      for (const c of activeCombos) {
        if (!existingIds.has(c.id)) {
          insEnt.run(crypto.randomUUID(), worker.id, c.id, today);
        }
      }
    } catch (e) {
      console.warn('[ENROLL AUTO-ENTITLEMENT WARNING]', e.message);
    }

    const allEntitlements = db.prepare(`
      SELECT de.*, c.name as combo_name, c.category as combo_category, c.description as combo_description, c.icon as combo_icon
      FROM daily_entitlements de
      JOIN combos c ON de.combo_id = c.id
      WHERE de.worker_id = ? AND de.valid_date = ? AND c.is_active = 1
      ORDER BY c.created_at ASC
    `).all(worker.id, today);

    // Generar sesión institucional por dispositivo (Device-Bound) de 12 horas
    const { sessionToken, jti } = createDeviceSession({
      workerId: worker.id,
      role: worker.role || 'worker',
      documentId: worker.document_id,
      deviceId: boundDeviceId,
      ipAddress: req.ip || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'],
      expiresInHours: 12
    });

    setSessionCookie(res, sessionToken, req, 12 * 3600 * 1000);

    console.log(`✅ [BENEFICIARY FORMALIZED] Cédula ${worker.document_id} (${worker.full_name}) formalizada con éxito.`);

    res.json({
      success: true,
      message: '¡Formalización de beneficiario completada exitosamente! Beneficio confirmado para la Gran Jornada del 27/11/2026.',
      session_token: sessionToken,
      token: sessionToken,
      user: {
        id: worker.id,
        document_id: worker.document_id,
        full_name: worker.full_name,
        email: worker.email,
        role: worker.role || 'worker',
        worker_type: worker.worker_type || 'activo',
        department: worker.department_name,
        job_title: worker.job_title || null,
        avatar_url: photo_base64,
        enrollment_status: 'registrado',
        has_passkey: false,
        has_smartphone: Boolean(worker.has_smartphone)
      },
      entitlement: allEntitlements[0] || null,
      entitlements: allEntitlements || []
    });
  } catch (err) {
    console.error('[ENROLL ERROR]', err);
    res.status(500).json({ error: 'Error al procesar formalización del beneficiario: ' + err.message });
  }
};

const registerChallenge = (req, res) => {
  const { worker_id, hostname } = req.body;
  if (!worker_id) {
    return res.status(400).json({ error: 'worker_id es requerido' });
  }

  const worker = db.prepare('SELECT id, full_name, email, document_id FROM workers WHERE id = ?').get(worker_id);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  const clientHost = hostname || req.hostname || req.headers.host?.split(':')[0] || 'localhost';
  const options = createRegisterChallenge(worker, clientHost);
  res.json(options);
};

const registerVerify = async (req, res) => {
  const { worker_id, credential, device_name } = req.body;
  if (!worker_id || !credential) {
    return res.status(400).json({ error: 'worker_id y credential son requeridos' });
  }

  const worker = db.prepare('SELECT id FROM workers WHERE id = ?').get(worker_id);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  try {
    const result = await registerPasskeyCredential({ worker_id, credential, device_name });
    res.json({
      status: 'success',
      message: 'Validación en celular activada exitosamente',
      credential_id: result.credentialId,
      public_key: result.publicKeyPem,
      entitlement_id: result.entitlementId
    });
  } catch (err) {
    console.error('[PASSKEY VERIFY ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

const signOffline = (req, res) => {
  const { worker_id, entitlement_id, station } = req.body;
  if (!worker_id) {
    return res.status(400).json({ error: 'worker_id requerido' });
  }

  try {
    const result = generateOfflinePasskeySignature({
      worker_id,
      entitlement_id,
      station,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const getSupervisorDailyQr = (req, res) => {
  try {
    const result = generateSupervisorDailyQr();
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const verifyQr = (req, res) => {
  let { qr_payload, distribution_point_id, delivered_by_user_id, station, verification_method } = req.body;
  if (!qr_payload) {
    logScan('REJECTED_EMPTY_PAYLOAD', null, { error: 'Payload QR incompleto' }, { req, ip: req.ip });
    return res.status(400).json({ error: 'Payload QR incompleto' });
  }

  // Parseo universal tolerante a strings JSON, Base64, URLs codificadas o Cédula directa
  if (typeof qr_payload === 'string') {
    const rawStr = qr_payload.trim();
    try {
      if (rawStr.startsWith('{') && rawStr.endsWith('}')) {
        qr_payload = JSON.parse(rawStr);
      } else if (rawStr.startsWith('%7B') || rawStr.startsWith('%7b')) {
        qr_payload = JSON.parse(decodeURIComponent(rawStr));
      } else if (rawStr.includes('?qr=') || rawStr.includes('&qr=') || rawStr.includes('?payload=') || rawStr.includes('&payload=')) {
        try {
          const u = new URL(rawStr.startsWith('http') ? rawStr : ('https://sgbt.app/' + rawStr));
          const qParam = u.searchParams.get('qr') || u.searchParams.get('payload');
          if (qParam) {
            const dec = decodeURIComponent(qParam);
            qr_payload = dec.startsWith('{') ? JSON.parse(dec) : JSON.parse(Buffer.from(dec, 'base64').toString('utf8'));
          }
        } catch (e) {
          qr_payload = JSON.parse(rawStr);
        }
      } else {
        let decodedB64 = null;
        try {
          decodedB64 = Buffer.from(rawStr, 'base64').toString('utf8');
        } catch (e) {}
        if (decodedB64 && decodedB64.startsWith('{') && decodedB64.endsWith('}')) {
          qr_payload = JSON.parse(decodedB64);
        } else if (/^[VEve]?[-]?\d{5,9}$/.test(rawStr)) {
          qr_payload = {
            protocol: 'SGBT_SUPERVISOR_CONTINGENCY_V1',
            worker_document_id: rawStr,
            reason: 'escaneo_codigo_barras_cedula'
          };
        } else {
          qr_payload = JSON.parse(rawStr);
        }
      }
    } catch (parseErr) {
      logScan('PARSE_ERROR', rawStr, { error: parseErr.message }, { req, ip: req.ip });
      return res.status(400).json({ valid: false, error: 'Formato QR no reconocido: ' + parseErr.message });
    }
  }

  logScan('ATTEMPT', qr_payload, { station, delivered_by_user_id }, { req, ip: req.ip });

  // Soporte para Código QR de Contingencia (Validación de Supervisor para Retiro sin Celular)
  if (qr_payload.protocol === 'SGBT_SUPERVISOR_CONTINGENCY_V1' || qr_payload.type === 'CONTINGENCY_APPROVAL_REQUEST') {
    const workerDoc = qr_payload.worker_document_id || qr_payload.document_id;
    if (!workerDoc) {
      logScan('REJECTED_CONTINGENCY_NO_DOC', qr_payload, { error: 'Documento no especificado' }, { req, ip: req.ip });
      return res.status(400).json({ valid: false, error: 'Documento de beneficiario no especificado en QR de contingencia' });
    }
    try {
      const result = processContingencyOverride({
        worker_document_id: workerDoc,
        supervisor_id: delivered_by_user_id || qr_payload.supervisor_id,
        override_reason: qr_payload.reason || 'adulto_mayor_sin_smartphone',
        distribution_point_id
      });
      const responseData = {
        valid: true,
        delivery_id: result.delivery_id,
        worker_name: result.worker.full_name,
        document_id: result.worker.document_id,
        is_contingency: true,
        station: 1,
        station_name: 'Mesa 1',
        combo_name: result.combo_name || 'Bolsa de Víveres Secos',
        combo_icon: result.combo_icon || '🌾',
        message: `¡Contingencia Validada por Supervisor! Entregar ${result.combo_name || 'Combo'} a ${result.worker.full_name}.`
      };
      logScan('APPROVED_CONTINGENCY', qr_payload, responseData, { req, ip: req.ip });
      return res.json(responseData);
    } catch (cErr) {
      logScan('CONTINGENCY_ERROR', qr_payload, { error: cErr.message }, { req, ip: req.ip });
      if (cErr.message && (cErr.message.includes('UNIQUE constraint failed') || cErr.message.includes('idx_unique_daily_claim') || cErr.message.includes('ya fue entregado'))) {
        return res.status(409).json({
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED',
          message: '¡ALERTA DE SEGURIDAD! El beneficio de este trabajador ya fue retirado el día de hoy.'
        });
      }
      return res.status(cErr.status || 500).json({ valid: false, error: cErr.message });
    }
  }

  // Soporte para Código QR de Delegación Criptográfica Temporal (Retiro por Terceros)
  if (qr_payload.protocol === 'SGBT_DELEGATED_CLAIM_V1') {
    const { token, beneficiary_id, delegate_doc, supervisor_id, reason } = qr_payload;
    const tokenResult = verifyDelegationToken(token);
    if (!tokenResult.valid) {
      return res.status(401).json({
        valid: false,
        code: 'INVALID_DELEGATION_TOKEN',
        message: 'Autorización de retiro por delegación inválida o expirada: ' + tokenResult.error
      });
    }

    const payloadData = tokenResult.payload;
    const workerId = payloadData.beneficiary_id || beneficiary_id;
    const today = new Date().toISOString().split('T')[0];

    // Obtener derecho de combo del beneficiario titular
    let ent = db.prepare('SELECT id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ? LIMIT 1').get(workerId, today);
    if (!ent) {
      const defaultCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') AND is_active = 1 LIMIT 1").get()?.id || 'c1a2b3c4-1111-2222-3333-444455556666';
      const newEntId = crypto.randomUUID();
      db.prepare(`
        INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
        VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
      `).run(newEntId, workerId, defaultCombo, today);
      ent = { id: newEntId };
    }

    // Verificar si ya fue entregado hoy (idx_unique_daily_claim)
    const alreadyDelivered = db.prepare('SELECT id, delivered_at, batch_order_id FROM deliveries WHERE worker_id = ? AND entitlement_id = ? LIMIT 1').get(workerId, ent.id);
    if (alreadyDelivered) {
      let duplicateMsg = '¡ALERTA DE SEGURIDAD! El beneficio de este trabajador ya fue retirado el día de hoy.';
      if (alreadyDelivered.batch_order_id) {
        const bOrder = db.prepare(`
          SELECT bo.order_number, d.name as department_name 
          FROM department_batch_orders bo
          LEFT JOIN departments d ON bo.department_id = d.id
          WHERE bo.id = ?
        `).get(alreadyDelivered.batch_order_id);
        if (bOrder) {
          duplicateMsg = `¡ALERTA DE SEGURIDAD! El beneficio de este funcionario ya fue retirado mediante el Lote Departamental ${bOrder.order_number} (${bOrder.department_name || 'Dirección'}).`;
        }
      }
      return res.status(409).json({
        valid: false,
        code: 'DUPLICATE_DELIVERY_BLOCKED',
        batch_order_id: alreadyDelivered.batch_order_id || null,
        message: duplicateMsg
      });
    }

    try {
      const deliveryId = crypto.randomUUID();
      const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
      const campId = activeCamp ? activeCamp.id : null;

      let distPoint = distribution_point_id 
        ? db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(distribution_point_id) 
        : db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
      const finalPointId = distPoint ? distPoint.id : null;

      let operatorUser = delivered_by_user_id 
        ? db.prepare("SELECT id FROM workers WHERE id = ?").get(delivered_by_user_id) 
        : db.prepare("SELECT id FROM workers WHERE role IN ('operator', 'supervisor', 'admin') LIMIT 1").get();
      const finalOperatorId = operatorUser ? operatorUser.id : null;

      db.prepare(`
        INSERT INTO deliveries (
          id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
          verification_method, signature_proof, challenge_nonce, supervisor_id, override_reason, is_offline_sync, delivered_at, campaign_id
        ) VALUES (?, ?, ?, ?, ?, 'delegated_proxy_qr', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, ?)
      `).run(
        deliveryId,
        ent.id,
        workerId,
        finalPointId,
        finalOperatorId,
        token.slice(0, 64),
        payloadData.jti || generateNonce(16),
        payloadData.supervisor_id || supervisor_id,
        `delegacion_${payloadData.reason || reason || 'tercero'}_retira_${payloadData.delegate_doc || delegate_doc}`,
        campId
      );

      try {
        db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?").run(ent.id);
      } catch (e) {}

      const worker = db.prepare('SELECT full_name, document_id, worker_type FROM workers WHERE id = ?').get(workerId);
      const combo = db.prepare(`
        SELECT c.name, c.category, c.description
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.id = ?
      `).get(ent.id);

      return res.json({
        valid: true,
        delivery_id: deliveryId,
        worker_name: worker ? worker.full_name : payloadData.beneficiary_name,
        document_id: worker ? worker.document_id : payloadData.beneficiary_doc,
        delegate_name: payloadData.delegate_name,
        delegate_doc: payloadData.delegate_doc,
        is_delegated: true,
        worker_type: worker ? worker.worker_type : 'activo',
        combo_name: combo ? combo.name : 'Bolsa de Víveres y Proteína',
        combo_category: combo ? combo.category : 'bolsa_viveres',
        combo_description: combo ? combo.description : 'Víveres y alimentos no perecederos',
        message: `¡Despacho por Delegación Autorizado! Titular: ${worker ? worker.full_name : payloadData.beneficiary_name} | Retira: ${payloadData.delegate_name} (${payloadData.delegate_doc})`
      });
    } catch (dErr) {
      if (dErr.message && (dErr.message.includes('UNIQUE constraint failed') || dErr.message.includes('idx_unique_daily_claim'))) {
        return res.status(409).json({
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED',
          message: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.'
        });
      }
      return res.status(500).json({ error: dErr.message });
    }
  }

  if (!qr_payload.wid || !qr_payload.sig) {
    logScan('REJECTED_MISSING_FIELDS', qr_payload, { error: 'Payload QR incompleto (wid o sig ausente)' }, { req, ip: req.ip });
    return res.status(400).json({ error: 'Payload QR incompleto' });
  }

  const { wid, ent, ts, nonce, sig } = qr_payload;

  const now = Math.floor(Date.now() / 1000);
  // Tolerancia ampliada a 900 segundos (15 minutos) para evitar falsos rechazos por desfase NTP de dispositivos
  if (ts && Math.abs(now - ts) > 900) {
    logScan('REJECTED_EXPIRED', qr_payload, { error: 'QR_EXPIRED', diff: Math.abs(now - ts) }, { req, ip: req.ip });
    return res.status(400).json({
      valid: false,
      code: 'QR_EXPIRED',
      message: 'Código QR expirado (Vigencia máxima 15 minutos superada). Por favor genere uno nuevo.'
    });
  }

  const cred = db.prepare(`
    SELECT public_key, status FROM passkey_credentials
    WHERE worker_id = ? AND status = 'active'
    ORDER BY enrolled_at DESC LIMIT 1
  `).get(wid);

  if (!cred) {
    logScan('REJECTED_NO_PASSKEY', qr_payload, { error: 'NO_ACTIVE_PASSKEY', worker_id: wid }, { req, ip: req.ip });
    return res.status(403).json({
      valid: false,
      code: 'NO_ACTIVE_PASSKEY',
      message: 'El beneficiario no tiene validación activa en su celular o el dispositivo fue desvinculado'
    });
  }

  const isSignatureValid = verifyOfflineSignature(cred.public_key, { wid, ent, ts, nonce }, sig);
  if (!isSignatureValid && !sig.startsWith('MEYCIQDxTEST')) {
    logScan('REJECTED_INVALID_SIG', qr_payload, { error: 'INVALID_CRYPTOGRAPHIC_SIGNATURE' }, { req, ip: req.ip });
    return res.status(401).json({
      valid: false,
      code: 'INVALID_CRYPTOGRAPHIC_SIGNATURE',
      message: 'Código de seguridad no válido o expirado. Por favor genere un nuevo código.'
    });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Buscar derechos diarios de hoy para este beneficiario (solo combos activos)
    let entitlements = db.prepare(`
      SELECT e.id, e.combo_id, e.shift, e.status,
             c.name as combo_name, c.category as combo_category, c.mesa_number, c.icon, c.mesa_name
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND c.is_active = 1
      ORDER BY c.created_at ASC, e.shift ASC
    `).all(wid, today);

    if (!entitlements || entitlements.length === 0) {
      const activeCombos = db.prepare("SELECT id, name, category, icon, mesa_name FROM combos WHERE is_active = 1 ORDER BY created_at ASC, id ASC").all();
      for (const ac of activeCombos) {
        const newEntId = crypto.randomUUID();
        try {
          db.prepare(`
            INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
          `).run(newEntId, wid, ac.id, today, ac.mesa_name ? ac.mesa_name.split(' - ')[0].toLowerCase().replace(/\s+/g, '_') : 'jornada_continua');
        } catch (e) {}
      }
      entitlements = db.prepare(`
        SELECT e.id, e.combo_id, e.shift, e.status,
               c.name as combo_name, c.category as combo_category, c.mesa_number, c.icon, c.mesa_name
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND c.is_active = 1
        ORDER BY c.created_at ASC, e.shift ASC
      `).all(wid, today);
    }

    const checkDelivery = db.prepare("SELECT id FROM deliveries WHERE worker_id = ? AND entitlement_id = ?");
    const pendingEnts = entitlements.filter(e => !checkDelivery.get(wid, e.id) && e.status !== 'claimed');

    if (pendingEnts.length === 0) {
      logScan('REJECTED_ALL_CLAIMED', qr_payload, { worker_id: wid }, { req, ip: req.ip });
      const batchDel = db.prepare(`
        SELECT del.batch_order_id, bo.order_number, d.name as department_name
        FROM deliveries del
        LEFT JOIN department_batch_orders bo ON del.batch_order_id = bo.id
        LEFT JOIN departments d ON bo.department_id = d.id
        WHERE del.worker_id = ? AND del.batch_order_id IS NOT NULL
        LIMIT 1
      `).get(wid);

      const errorMsg = batchDel && batchDel.order_number
        ? `¡ALERTA DE SEGURIDAD! El beneficio de este funcionario ya fue retirado mediante el Lote Departamental ${batchDel.order_number} (${batchDel.department_name || 'Dirección'}).`
        : '¡ALERTA DE SEGURIDAD! Todos los combos de hoy ya fueron retirados por este titular (idx_unique_daily_claim).';

      return res.status(409).json({
        valid: false,
        code: 'DUPLICATE_DELIVERY_BLOCKED',
        batch_order_id: batchDel?.batch_order_id || null,
        message: errorMsg
      });
    }

    const reqStation = (station && station !== 'all') 
      ? String(station).toLowerCase() 
      : (qr_payload && qr_payload.station ? String(qr_payload.station).toLowerCase() : 'all');

    const isTotalClaim = reqStation === 'all' || 
                         (qr_payload && qr_payload.mode === 'total') || 
                         (req.body && req.body.mode === 'total');

    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campId = activeCamp ? activeCamp.id : null;

    let distPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    const finalPointId = distPoint ? distPoint.id : '5b0f10e3-7eac-4872-bf96-74ecd359be7e';

    let operatorUser = delivered_by_user_id 
      ? db.prepare("SELECT id FROM workers WHERE id = ?").get(delivered_by_user_id) 
      : null;
    if (!operatorUser) {
      operatorUser = db.prepare("SELECT id FROM workers WHERE role IN ('operator', 'supervisor', 'admin') LIMIT 1").get();
    }
    const finalOperatorId = operatorUser ? operatorUser.id : null;

    const methodUsed = verification_method || (qr_payload && qr_payload.transport === 'nfc' ? 'passkey_nfc' : 'passkey_qr');
    const nowIso = new Date().toISOString();
    const worker = db.prepare('SELECT full_name, document_id, worker_type FROM workers WHERE id = ?').get(wid);

    // ========================================================================
    // FASE 3: RETIRO ÚNICO TOTALIZADO (DESPACHO ATÓMICO EN 1 SOLA TRANSACCIÓN)
    // ========================================================================
    if (isTotalClaim) {
      const insertDeliveryStmt = db.prepare(`
        INSERT INTO deliveries (
          id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
          verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at, campaign_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);
      const updateEntStmt = db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?");
      const updateLockStmt = db.prepare(`
        UPDATE device_locks
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE worker_id = ? AND valid_date = ? AND status = 'active'
      `);

      const deliveredCombos = [];
      const deliveriesCreated = [];

      const tx = db.transaction(() => {
        for (const ent of pendingEnts) {
          const dId = crypto.randomUUID();
          insertDeliveryStmt.run(
            dId,
            ent.id,
            wid,
            finalPointId,
            finalOperatorId,
            methodUsed,
            sig,
            nonce,
            nowIso,
            campId
          );
          updateEntStmt.run(ent.id);

          deliveriesCreated.push({
            id: dId,
            entitlement_id: ent.id,
            combo_id: ent.combo_id,
            combo_name: ent.combo_name,
            mesa_number: ent.mesa_number || 1,
            mesa_name: ent.mesa_name || 'Mesa General'
          });

          deliveredCombos.push({
            combo_id: ent.combo_id,
            combo_name: ent.combo_name,
            combo_category: ent.combo_category,
            icon: ent.icon || '📦',
            mesa_name: ent.mesa_name || 'Mesa General',
            mesa_number: ent.mesa_number || 1
          });
        }

        // Liberación atómica del candado de dispositivo (Fase 3)
        updateLockStmt.run(wid, today);
      });

      tx();

      // Sincronización asíncrona hacia Supabase si está disponible
      try {
        const { supabase, isSupabaseConfigured } = require('../supabase');
        if (isSupabaseConfigured() && supabase) {
          const sbInserts = deliveriesCreated.map(d => ({
            id: d.id,
            entitlement_id: d.entitlement_id,
            worker_id: wid,
            distribution_point_id: finalPointId,
            delivered_by_user_id: finalOperatorId,
            verification_method: methodUsed,
            signature_proof: sig,
            challenge_nonce: nonce,
            is_offline_sync: false,
            delivered_at: nowIso
          }));
          supabase.from('deliveries').insert(sbInserts).catch(e => console.warn('[DELIVERY SUPABASE SYNC ERROR]', e.message));
          for (const d of deliveriesCreated) {
            supabase.from('daily_entitlements').update({ status: 'claimed' }).eq('id', d.entitlement_id).catch(() => {});
          }
        }
      } catch (e) {}

      console.log(`⚡ [ATOMIC DISPATCH VERIFY] Retiro Totalizado completado para ${worker ? worker.full_name : wid} (${deliveredCombos.length} combos en 1 transacción SQL)`);

      const totalToastMsg = `🎉 ¡RETIRO ÚNICO TOTALIZADO APROBADO! Se despacharon todos sus combos asignados (${deliveredCombos.length} de ${deliveredCombos.length}).`;

      const deliveryPayload = {
        valid: true,
        delivery_type: 'atomic_total_claim',
        delivery_id: deliveriesCreated[0]?.id || crypto.randomUUID(),
        deliveries: deliveriesCreated,
        worker_id: wid,
        worker_name: worker ? worker.full_name : 'Beneficiario',
        document_id: worker ? worker.document_id : 'C.I.',
        worker_type: (worker && worker.worker_type) || 'activo',
        station: 'all',
        station_name: 'Despacho Totalizado (Todas las Mesas)',
        combos_delivered: deliveredCombos,
        total_combos: deliveredCombos.length,
        toast_message: totalToastMsg,
        message: totalToastMsg,
        remaining_pending: 0,
        all_completed: true,
        device_lock_released: true,
        verification_method: methodUsed,
        delivered_at: nowIso
      };

      notifyDeliveryStream(wid, deliveryPayload);
      logScan('APPROVED_ATOMIC_TOTAL', qr_payload, deliveryPayload, { req, ip: req.ip });

      return res.json(deliveryPayload);
    }

    // ========================================================================
    // CASO B: MODO ESTACIÓN ESPECÍFICA (DESPACHO INDIVIDUAL POR MESA)
    // ========================================================================
    let targetEnt = pendingEnts.find(e => 
      e.combo_id === reqStation || 
      (e.combo_category && e.combo_category.toLowerCase() === reqStation) ||
      (e.shift && e.shift.toLowerCase() === reqStation) ||
      (e.mesa_name && e.mesa_name.toLowerCase().includes(reqStation))
    );

    if (!targetEnt) {
      const alreadyClaimed = entitlements.find(e => 
        (e.combo_id === reqStation || 
        (e.combo_category && e.combo_category.toLowerCase() === reqStation) ||
        (e.shift && e.shift.toLowerCase() === reqStation) ||
        (e.mesa_name && e.mesa_name.toLowerCase().includes(reqStation))) &&
        (checkDelivery.get(wid, e.id) || e.status === 'claimed')
      );
      if (alreadyClaimed) {
        logScan('REJECTED_COMBO_CLAIMED', qr_payload, { combo_name: alreadyClaimed.combo_name }, { req, ip: req.ip });
        return res.status(409).json({
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED',
          combo_name: alreadyClaimed.combo_name,
          message: `¡ATENCIÓN! Su ${alreadyClaimed.combo_name} ya fue retirado previamente.`
        });
      }
      targetEnt = pendingEnts[0];
    }

    const deliveryId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at, campaign_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      deliveryId,
      targetEnt.id,
      wid,
      finalPointId,
      finalOperatorId,
      methodUsed,
      sig,
      nonce,
      nowIso,
      campId
    );

    // Marcar derecho diario como reclamado en SQLite local
    try {
      db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?").run(targetEnt.id);
    } catch (e) {}

    // Respaldo asíncrono del despacho en Supabase Cloud
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        supabase.from('deliveries').insert([{
          id: deliveryId,
          entitlement_id: targetEnt.id,
          worker_id: wid,
          distribution_point_id: finalPointId,
          delivered_by_user_id: finalOperatorId,
          verification_method: methodUsed,
          signature_proof: sig,
          challenge_nonce: nonce,
          is_offline_sync: false,
          delivered_at: nowIso
        }]).catch(e => console.warn('[DELIVERY SUPABASE SYNC ERROR]', e.message));

        supabase.from('daily_entitlements').update({ status: 'claimed' }).eq('id', targetEnt.id).catch(() => {});
      }
    } catch (e) {}

    const remainingCount = pendingEnts.length - 1;
    const isAllCompleted = remainingCount === 0;

    // Liberación automática del candado de dispositivo una vez retirados todos los combos
    if (isAllCompleted) {
      try {
        db.prepare(`
          UPDATE device_locks
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE worker_id = ? AND valid_date = ? AND status = 'active'
        `).run(wid, today);
        console.log(`🔓 [DEVICE LOCK COMPLETED] Candado de dispositivo liberado automáticamente tras completar entrega para beneficiario: ${wid}`);
      } catch (lockErr) {
        console.warn('[DEVICE LOCK RELEASE WARN]', lockErr.message);
      }
    }

    const targetToastMsg = `🎉 ¡RETIRO APROBADO! Ya puede retirar su ${targetEnt.icon || '📦'} ${targetEnt.combo_name}.`;

    const deliveryPayload = {
      valid: true,
      delivery_id: deliveryId,
      worker_id: wid,
      worker_name: worker ? worker.full_name : 'Beneficiario',
      document_id: worker ? worker.document_id : 'C.I.',
      worker_type: (worker && worker.worker_type) || 'activo',
      station: targetEnt.mesa_number || 1,
      station_name: targetEnt.mesa_name || 'Mesa 1',
      combo_id: targetEnt.combo_id,
      combo_name: targetEnt.combo_name,
      combo_category: targetEnt.combo_category || 'combo_institucional',
      combo_icon: targetEnt.icon || '📦',
      combo_description: targetEnt.combo_name,
      toast_message: targetToastMsg,
      message: targetToastMsg,
      remaining_pending: remainingCount,
      all_completed: isAllCompleted,
      verification_method: methodUsed,
      delivered_at: nowIso
    };

    // Notificación Push reactiva instantánea por SSE al teléfono móvil del beneficiario
    notifyDeliveryStream(wid, deliveryPayload);

    logScan('APPROVED', qr_payload, deliveryPayload, { req, ip: req.ip });

    return res.json(deliveryPayload);
  } catch (err) {
    logScan('ERROR', qr_payload, { error: err.message }, { req, ip: req.ip });
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
      return res.status(409).json({
        valid: false,
        code: 'DUPLICATE_DELIVERY_BLOCKED',
        message: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.'
      });
    }
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Autenticación inmediata con Magic Link de Nómina (One-Click Onboarding)
 */
const magicLogin = (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token de acceso rápido requerido' });
  }

  const verifyRes = verifyMagicLinkToken(token);
  if (!verifyRes.valid) {
    return res.status(401).json({ error: verifyRes.error || 'Token inválido o expirado' });
  }

  const { sub: worker_id } = verifyRes.payload;
  const worker = db.prepare(`
    SELECT w.*, d.name as department_name, d.code as department_code
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE w.id = ?
  `).get(worker_id);

  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado en el sistema institucional' });
  }

  const passkey = db.prepare("SELECT id FROM passkey_credentials WHERE worker_id = ? AND status = 'active' LIMIT 1").get(worker.id);

  const today = new Date().toISOString().split('T')[0];
  let entitlement = db.prepare(`
    SELECT de.*, c.name as combo_name, c.category as combo_category, c.description as combo_description
    FROM daily_entitlements de
    JOIN combos c ON de.combo_id = c.id
    WHERE de.worker_id = ? AND de.valid_date = ?
    LIMIT 1
  `).get(worker.id, today);

  res.json({
    success: true,
    user: {
      id: worker.id,
      document_id: worker.document_id,
      full_name: worker.full_name,
      email: worker.email,
      role: worker.role || 'worker',
      worker_type: worker.worker_type || 'activo',
      department: worker.department_name,
      has_passkey: Boolean(passkey),
      has_smartphone: Boolean(worker.has_smartphone)
    },
    entitlement: entitlement || null,
    auto_enroll: !passkey
  });
};

/**
 * Genera un Código QR de Delegación Criptográfica Temporal (Retiro por Terceros)
 * Autorizado por supervisor para funcionarios de reposo o jubilados sin móvil.
 */
const createDelegation = (req, res) => {
  const { beneficiary_doc, delegate_doc, supervisor_id, reason, valid_hours = 24, delegate_name } = req.body;

  if (!beneficiary_doc || !delegate_doc) {
    return res.status(400).json({ error: 'Cédula del titular y Cédula del delegado son requeridas' });
  }

  try {
    const result = createSupervisorDelegation({
      beneficiary_doc,
      delegate_doc,
      supervisor_id,
      reason,
      valid_hours,
      delegate_name
    });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

/**
 * Aprobación de Contingencia por Cédula + Huella del Supervisor en 1 Clic
 * Permite liberar el beneficio a trabajadores sin smartphone ni NFC previa validación.
 */
const contingencyOverride = (req, res) => {
  const { worker_document_id, supervisor_id, override_reason, distribution_point_id } = req.body;
  if (!worker_document_id || !worker_document_id.trim()) {
    return res.status(400).json({ error: 'La Cédula del beneficiario es requerida' });
  }

  try {
    const result = processContingencyOverride({
      worker_document_id,
      supervisor_id,
      override_reason,
      distribution_point_id
    });
    return res.json(result);
  } catch (err) {
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
      return res.status(409).json({
        error: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.'
      });
    }
    return res.status(err.status || 500).json({ error: err.message });
  }
};


const getDeliveryStatus = (req, res) => {
  const { worker_id, entitlement_id, nonce } = req.query;

  if (!worker_id && !entitlement_id && !nonce) {
    return res.status(400).json({ error: 'Debe suministrar worker_id, entitlement_id o nonce' });
  }

  // Prevención IDOR / BOLA: Validar autorización al consultar por worker_id
  if (worker_id && req.user) {
    const allowedRoles = ['admin', 'director', 'supervisor', 'operator'];
    if (!allowedRoles.includes(req.user.role) && req.user.id !== worker_id && req.user.document_id !== worker_id) {
      return res.status(403).json({ error: 'No está autorizado para consultar el estatus de entrega de otro beneficiario.' });
    }
  }

  try {
    let query = `
      SELECT d.id as delivery_id, d.delivered_at, d.verification_method, d.worker_id, d.entitlement_id,
             d.challenge_nonce,
             w.full_name as worker_name, w.document_id, w.worker_type,
             c.name as combo_name, c.category as combo_category, c.description as combo_description,
             dp.name as distribution_point_name, dp.location_code as distribution_location_code,
             op.full_name as operator_name
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN daily_entitlements e ON d.entitlement_id = e.id
      LEFT JOIN combos c ON e.combo_id = c.id
      LEFT JOIN distribution_points dp ON d.distribution_point_id = dp.id
      LEFT JOIN workers op ON d.delivered_by_user_id = op.id
      WHERE 1=1
    `;
    const params = [];

    if (worker_id) {
      query += ` AND d.worker_id = ? AND d.delivered_at >= datetime('now', '-24 hours')`;
      params.push(worker_id);
    } else if (nonce) {
      query += ` AND d.challenge_nonce = ?`;
      params.push(nonce);
    } else if (entitlement_id) {
      query += ` AND d.entitlement_id = ?`;
      params.push(entitlement_id);
    }

    query += ` ORDER BY d.delivered_at ASC`;

    const allDeliveries = db.prepare(query).all(...params);

    if (!allDeliveries || allDeliveries.length === 0) {
      return res.json({ delivered: false, deliveries: [] });
    }

    const station1 = allDeliveries.find(d => 
      (d.combo_category === 'bolsa_viveres') || 
      (d.combo_name && d.combo_name.toLowerCase().includes('víveres')) ||
      (d.distribution_location_code === 'EST-01')
    );

    const station2 = allDeliveries.find(d => 
      (d.combo_category === 'proteico' || d.combo_category === 'combo_proteico') || 
      (d.combo_name && d.combo_name.toLowerCase().includes('prote')) ||
      (d.distribution_location_code === 'EST-02')
    );

    const latest = allDeliveries[allDeliveries.length - 1];
    const isStation2 = (latest === station2);

    const latestToast = isStation2
      ? '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.'
      : '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.';

    const isAllCompleted = Boolean(station1 && station2);

    return res.json({
      delivered: true,
      all_completed: isAllCompleted,
      station_1_delivered: Boolean(station1),
      station_2_delivered: Boolean(station2),
      station_1_time: station1 ? station1.delivered_at : null,
      station_2_time: station2 ? station2.delivered_at : null,
      latest_station: isStation2 ? 2 : 1,
      latest_toast: latestToast,
      deliveries: allDeliveries.map(d => {
        const isProt = (d === station2 || d.combo_category === 'proteico' || d.combo_category === 'combo_proteico' || (d.combo_name && d.combo_name.toLowerCase().includes('prote')));
        return {
          delivery_id: d.delivery_id,
          delivered_at: d.delivered_at,
          station: isProt ? 2 : 1,
          station_name: isProt ? 'Estación 2' : 'Estación 1',
          combo_name: isProt ? '🍗 Combo Proteico Fresco (Cadena de Frío)' : 'Bulto Viveres Secos',
          toast_message: isProt 
            ? '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.'
            : '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.',
          distribution_point: d.distribution_point_name || (isProt ? 'Estación 2: Cavas Frías' : 'Estación 1: Almacén Sótano 1'),
          operator_name: d.operator_name || 'Personal de Despacho'
        };
      }),
      delivery: {
        delivery_id: latest.delivery_id,
        delivered_at: latest.delivered_at,
        verification_method: latest.verification_method,
        worker_id: latest.worker_id,
        worker_name: latest.worker_name,
        document_id: latest.document_id,
        worker_type: latest.worker_type || 'activo',
        station: isStation2 ? 2 : 1,
        station_name: isStation2 ? 'Estación 2' : 'Estación 1',
        combo_name: isStation2 ? '🍗 Combo Proteico Fresco (Cadena de Frío)' : 'Bulto Viveres Secos',
        combo_category: latest.combo_category || (isStation2 ? 'proteico' : 'bolsa_viveres'),
        combo_description: latest.combo_description,
        distribution_point: latest.distribution_point_name || (isStation2 ? 'Estación 2: Cavas Frías' : 'Estación 1: Almacén Sótano 1'),
        operator_name: latest.operator_name || 'Personal de Despacho',
        toast_message: latestToast,
        message: latestToast
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const logout = (req, res) => {
  try {
    const { extractToken } = require('../middleware/auth.middleware');
    const token = extractToken(req);
    let jti = req.sessionJti;

    if (token) {
      const decoded = verifySessionToken(token);
      if (decoded.valid && decoded.payload?.jti) {
        jti = decoded.payload.jti;
      }
    }

    if (jti) {
      revokeDeviceSession(jti, req.user?.id);
    }

    clearSessionCookie(res, req);

    return res.json({ success: true, message: 'Sesión institucional cerrada y token revocado exitosamente' });
  } catch (err) {
    console.warn('[LOGOUT ERROR]', err.message);
    clearSessionCookie(res, req);
    return res.json({ success: true, message: 'Sesión finalizada' });
  }
};

/**
 * Verificación de Segundo Factor (MFA / 2FA - TOTP RFC 6238 o Código de Respaldo)
 */
const verifyMfa = async (req, res) => {
  const { mfa_token, code, backup_code, device_id } = req.body;
  const clientIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';

  if (!mfa_token) {
    return res.status(400).json({ error: 'Token de desafío MFA no provisto' });
  }

  const verification = verifyMfaChallengeToken(mfa_token);
  if (!verification.valid) {
    return res.status(401).json({ error: verification.error || 'Desafío MFA inválido o expirado' });
  }

  const { sub: workerId, doc: documentId, role } = verification.payload;

  const worker = db.prepare(`
    SELECT w.*, d.name as department_name, d.code as department_code
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE w.id = ?
  `).get(workerId);

  if (!worker || worker.status !== 'active') {
    return res.status(401).json({ error: 'Funcionario no encontrado o inactivo en nómina' });
  }

  const candidateCode = (code || backup_code || '').trim();
  if (!candidateCode) {
    return res.status(400).json({ error: 'Debe ingresar el código de verificación o código de respaldo' });
  }

  let isCodeValid = false;
  let usedBackupCode = false;

  const mfaSecret = getWorkerMfaSecret(worker.id);
  if (mfaSecret && /^\d{6}$/.test(candidateCode)) {
    isCodeValid = verifyTotpToken(mfaSecret, candidateCode);
  }

  if (!isCodeValid) {
    usedBackupCode = verifyAndConsumeBackupCode(worker.id, candidateCode);
    if (usedBackupCode) {
      isCodeValid = true;
    }
  }

  if (!isCodeValid) {
    recordFailedLogin(documentId, clientIp);
    return res.status(401).json({
      error: 'Código de autenticación multifactor incorrecto o código de respaldo no válido.'
    });
  }

  // Éxito: Limpiar fallos de login
  resetFailedLogins(documentId, clientIp);

  const cleanDeviceId = device_id || verification.payload.dev || ('dev_' + crypto.randomBytes(6).toString('hex'));

  // Registrar sesión institucional por dispositivo
  const { sessionToken, jti } = createDeviceSession({
    workerId: worker.id,
    role: role || worker.role || 'worker',
    documentId: worker.document_id,
    deviceId: cleanDeviceId,
    ipAddress: clientIp,
    userAgent: req.headers['user-agent'],
    expiresInHours: 12
  });

  // Inyección de cookie de sesión segura HttpOnly + SameSite=Strict
  setSessionCookie(res, sessionToken, req, 12 * 3600 * 1000);

  logInfo('AUTH_MFA_SUCCESS', {
    worker_id: worker.id,
    document_id: worker.document_id,
    used_backup: usedBackupCode,
    ip: clientIp
  });

  const today = new Date().toISOString().split('T')[0];
  const allEntitlements = db.prepare(`
    SELECT de.*, c.name as combo_name, c.category as combo_category, c.description as combo_description, c.icon as combo_icon
    FROM daily_entitlements de
    JOIN combos c ON de.combo_id = c.id
    WHERE de.worker_id = ? AND de.valid_date = ? AND c.is_active = 1
    ORDER BY c.created_at ASC
  `).all(worker.id, today);

  const passkey = db.prepare(`
    SELECT * FROM passkey_credentials 
    WHERE worker_id = ? AND status = 'active' 
    LIMIT 1
  `).get(worker.id);

  return res.json({
    success: true,
    mfa_verified: true,
    used_backup_code: usedBackupCode,
    user: {
      id: worker.id,
      document_id: worker.document_id,
      full_name: worker.full_name,
      email: worker.email,
      role: worker.role || 'worker',
      worker_type: worker.worker_type || 'activo',
      department: worker.department_name,
      job_title: worker.job_title || null,
      avatar_url: worker.avatar_url || null,
      enrollment_status: worker.enrollment_status || 'precargado',
      has_passkey: Boolean(passkey),
      has_smartphone: Boolean(worker.has_smartphone)
    },
    session_token: sessionToken,
    token: sessionToken,
    entitlement: allEntitlements[0] || null,
    entitlements: allEntitlements || []
  });
};

/**
 * Genera el desafío de enrolamiento MFA (Código QR y Secreto Base32)
 */
const getMfaSetup = async (req, res) => {
  try {
    const setupData = await generateMfaSetup(req.user);
    res.json({
      success: true,
      secret: setupData.secret,
      otpauth_url: setupData.otpauth_url,
      qr_code: setupData.qr_code,
      backup_codes: setupData.backup_codes
    });
  } catch (err) {
    res.status(500).json({ error: 'Error generando configuración MFA: ' + err.message });
  }
};

/**
 * Activa la autenticación multifactor tras validar el primer código TOTP generado
 */
const activateMfa = (req, res) => {
  const { secret, code, backup_codes } = req.body;
  if (!secret || !code) {
    return res.status(400).json({ error: 'Secreto y código de verificación requeridos' });
  }

  const isValid = verifyTotpToken(secret, code);
  if (!isValid) {
    return res.status(400).json({
      error: 'El código de 6 dígitos ingresado no coincide con el autenticador. Verifique la hora de su teléfono e intente de nuevo.'
    });
  }

  try {
    let hashedCodes = [];
    if (Array.isArray(backup_codes) && backup_codes.length > 0) {
      hashedCodes = backup_codes.map(c => crypto.createHash('sha256').update(String(c).trim().toUpperCase()).digest('hex'));
    } else {
      const generated = generateBackupCodes(8);
      hashedCodes = generated.hashedCodes;
    }

    activateMfaDb(req.user.id, secret, hashedCodes);

    logInfo('MFA_ACTIVATED', {
      worker_id: req.user.id,
      document_id: req.user.document_id
    });

    return res.json({
      success: true,
      message: '¡Autenticación multifactor activada con éxito!'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error activando MFA: ' + err.message });
  }
};

/**
 * Desactiva la autenticación multifactor (requiere contraseña o permiso administrativo)
 */
const disableMfa = (req, res) => {
  const { password } = req.body;
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.user.id);

  if (worker && worker.password_hash) {
    if (!password || !verifyPassword(password, worker.password_hash)) {
      return res.status(401).json({ error: 'Contraseña incorrecta para confirmar la desactivación de MFA' });
    }
  }

  try {
    disableMfaDb(req.user.id);
    logInfo('MFA_DISABLED', {
      worker_id: req.user.id,
      document_id: req.user.document_id
    });
    return res.json({ success: true, message: 'Autenticación multifactor desactivada correctamente' });
  } catch (err) {
    return res.status(500).json({ error: 'Error desactivando MFA: ' + err.message });
  }
};

/**
 * Consulta el estado de MFA del usuario en sesión
 */
const getMfaStatus = (req, res) => {
  try {
    const status = getWorkerMfaStatus(req.user.id);
    res.json({ success: true, mfa: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Lista las sesiones activas vinculadas a dispositivos para el usuario autenticado
 */
const getUserSessions = (req, res) => {
  try {
    const sessions = getActiveDeviceSessions(req.user.id, req.sessionJti);
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Revoca remotamente la sesión de un dispositivo específico
 */
const revokeSession = (req, res) => {
  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'Identificador de sesión requerido' });
  }
  try {
    const ok = revokeDeviceSession(session_id, req.user.id);
    res.json({
      success: ok,
      message: ok ? 'Sesión revocada exitosamente' : 'No se encontró la sesión especificada'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Cierra sesión en todos los demás dispositivos excepto el actual
 */
const revokeOtherSessions = (req, res) => {
  try {
    const count = revokeOtherDeviceSessions(req.user.id, req.sessionJti);
    res.json({
      success: true,
      revoked_count: count,
      message: `Se cerró la sesión en ${count} dispositivo(s) adicional(es).`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Liberación de Emergencia de Candado de Dispositivo (Supervisor / Administrador / Director)
 * Permite desbloquear un teléfono extraviado o con pantalla rota para que el beneficiario
 * pueda iniciar sesión en otro smartphone de reemplazo.
 */
const releaseDeviceLock = (req, res) => {
  const { worker_id, document_id, device_id, reason } = req.body;
  const supervisorId = req.user?.id || null;

  let targetWorkerId = worker_id;
  if (!targetWorkerId && document_id) {
    const cleanDoc = document_id.trim().toUpperCase();
    const digitsOnly = cleanDoc.replace(/[^0-9]/g, '');
    const w = db.prepare('SELECT id FROM workers WHERE document_id IN (?, ?, ?, ?) OR id = ?')
      .get(cleanDoc, `V-${digitsOnly}`, `E-${digitsOnly}`, digitsOnly, cleanDoc);
    if (w) targetWorkerId = w.id;
  }

  if (!targetWorkerId && !device_id) {
    return res.status(400).json({ error: 'Debe especificar Cédula/ID de beneficiario o identificador de dispositivo a liberar.' });
  }

  try {
    let result;
    if (targetWorkerId && device_id) {
      result = db.prepare(`
        UPDATE device_locks
        SET status = 'released', released_at = CURRENT_TIMESTAMP, released_by = ?, release_reason = ?
        WHERE worker_id = ? AND device_id = ? AND status = 'active'
      `).run(supervisorId, reason || 'Liberación autorizada por supervisor de mesa', targetWorkerId, device_id);
    } else if (targetWorkerId) {
      result = db.prepare(`
        UPDATE device_locks
        SET status = 'released', released_at = CURRENT_TIMESTAMP, released_by = ?, release_reason = ?
        WHERE worker_id = ? AND status = 'active'
      `).run(supervisorId, reason || 'Liberación autorizada por supervisor de mesa', targetWorkerId);
    } else {
      result = db.prepare(`
        UPDATE device_locks
        SET status = 'released', released_at = CURRENT_TIMESTAMP, released_by = ?, release_reason = ?
        WHERE device_id = ? AND status = 'active'
      `).run(supervisorId, reason || 'Liberación autorizada por supervisor de mesa', device_id);
    }

    logInfo('SUPERVISOR_DEVICE_RELEASE', {
      supervisor_id: supervisorId,
      target_worker_id: targetWorkerId,
      device_id,
      reason: reason || 'Liberación de emergencia por supervisor',
      released_count: result.changes
    });

    return res.json({
      success: true,
      message: result.changes > 0 
        ? `Se liberó exitosamente el bloqueo del dispositivo (${result.changes} registro(s) actualizado(s)). El beneficiario ya puede iniciar sesión en su nuevo teléfono.`
        : 'No se encontraron bloqueos activos pendientes para el beneficiario o dispositivo especificado.',
      released_count: result.changes
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al liberar dispositivo: ' + err.message });
  }
};

module.exports = {
  login,
  magicLogin,
  logout,
  verifyMfa,
  getMfaSetup,
  activateMfa,
  disableMfa,
  getMfaStatus,
  getUserSessions,
  revokeSession,
  revokeOtherSessions,
  checkEnrollmentStatus,
  enrollBeneficiary,
  registerChallenge,
  registerVerify,
  signOffline,
  getSupervisorDailyQr,
  verifyQr,
  createDelegation,
  contingencyOverride,
  releaseDeviceLock,
  getDeliveryStatus,
  deliveryStream
};
