# Guía de Seguridad, Control de Accesos y Privacidad
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Modelo de Control de Acceso Basado en Roles (RBAC) y Alcance de Sesión (Scope)

El acceso a las rutas y operaciones del sistema está estrictamente segregado según el principio de mínimo privilegio (PoLP) y separación de funciones:

| Rol | Alcance de Permisos | Alcance de Sesión (`scope`) | Vía de Autenticación | Rutas Permitidas |
| :--- | :--- | :---: | :--- | :--- |
| **`worker`** (Beneficiario) | Consulta de sus combos asignados, estado de reclamo y generación de QR de retiro. No puede acceder a datos de terceros ni a la consola de almacén ni gobernanza. | `beneficiary` | Formalización con foto / Contraseña personal / Passkey Biométrica (FIDO2 / WebAuthn). | `/api/v1/auth/me`, `/api/v1/auth/generate-qr`, `/api/v1/combos`, `/api/v1/auth/delivery-status`, `/api/v1/auth/my-receipts` |
| **`operator`** (Operador de Almacén) | Lectura óptica de comprobantes QR, escaneo NFC y registro de entregas. No puede modificar nóminas ni alterar jornadas. | `admin` (restringido) | Credencial institucional + Asignación a punto de distribución. | `/api/v1/dispatch/*`, `/api/v1/verify/qr`, `/api/v1/manual-dispatch/deliver` |
| **`supervisor`** (Fiscal de Despacho) | Autorización de retiros en contingencia, anulación justificada de bloqueos y resolución de incidencias en almacén. | `admin` | Credencial institucional con MFA (TOTP RFC 6238) y QR diario. | `/api/v1/manual-dispatch/*`, `/api/v1/supervisor/*`, `/api/v1/auth/supervisor/*` |
| **`admin`** (Gestión Humana / TI) | Control total de nómina, importación Excel, planificación y cierre de jornadas, auditoría ministerial y sincronización con Supabase. | `admin` | Consola `/coseg` (Cédula de administrador + PIN oficial `ADMIN_ACCESS_SECRET`). | `/api/v1/admin/*`, `/api/v1/payroll/*`, `/api/v1/campaigns/*`, `/api/v1/sync/*`, `/api/v1/system/logs/*` |

> [!IMPORTANT]
> **Aislamiento Criptográfico por Alcance (`session_scope`):**  
> Si un usuario con rol de Administrador en la base de datos ingresa al portal mediante el formulario de beneficiarios (usando su clave personal), el token generado posee `session_scope = 'beneficiary'`. El middleware `requireRole` bloquea de inmediato cualquier petición a `/api/v1/admin/*` con código **HTTP 403 Forbidden (`ADMIN_SCOPE_REQUIRED`)**, impidiendo accesos administrativos sin la autenticación secundaria formal.

---

### 2. Segregación Criptográfica Estricta de Credenciales (Trail of Bits)

1. **Blindaje de la Consola Administrativa (`/coseg`):**
   - La consola administrativa exige **exclusivamente** el PIN o Secreto Administrativo Oficial (`ADMIN_ACCESS_SECRET`).
   - Se prohíbe de forma terminante acceder a la consola administrativa con la contraseña de 4 dígitos de beneficiario. Si se intenta, el servidor responde con **HTTP 401 Unauthorized**:
     > *"Clave o PIN de seguridad administrativa incorrecto. No se permite acceder a la consola administrativa con contraseña de beneficiario."*
2. **Blindaje del Portal de Beneficiarios (`/`):**
   - El formulario de beneficiario exige **exclusivamente** la contraseña personal del beneficiario o su Passkey FIDO2.
   - El PIN administrativo es explícitamente rechazado en el portal de beneficiarios (**HTTP 401 Unauthorized**).
3. **Control en Frontend (`switchSessionView`):**
   - El cliente web intercepta cualquier intento de cambiar a la vista de administración (`mode: 'admin'`) y valida que `STATE.currentUser.session_scope === 'admin'`. Si el usuario no ingresó por `/coseg` con su PIN, es redirigido a la pantalla de login administrativo con notificación de seguridad.

---

### 3. Sistema de Gestión y Recuperación de Contraseñas

1. **Autoservicio de Recuperación en Dos Pasos:**
   - **Paso 1 (Solicitud y Verificación):** Endpoint `POST /api/v1/auth/password-recovery/request`. El funcionario ingresa su Cédula y su Correo o Teléfono oficial registrado en nómina. Si los datos coinciden de forma estricta, el servidor genera un token criptográfico HMAC-SHA256 con vigencia de 15 minutos (`typ: 'password_recovery'`).
   - **Paso 2 (Restablecimiento):** Endpoint `POST /api/v1/auth/password-recovery/confirm`. El usuario ingresa la nueva contraseña junto con el token emitido. El servidor valida la firma criptográfica, aplica hash seguro (`scrypt`/PBKDF2) y actualiza el registro en la base de datos y Supabase Cloud.
2. **Gestión Administrativa de Contraseñas:**
   - Endpoint `POST /api/v1/admin/workers/:id/password` (exclusivo para roles `admin` y `director`).
   - Permite asignar una contraseña temporal personalizada o restablecer el estatus del funcionario a `precargado` para exigir un nuevo proceso de auto-enrolamiento y formalización en su siguiente inicio de sesión.
   - Toda modificación de contraseña queda asentada en la bitácora de auditoría con la identidad del administrador actuante y la IP de origen.

---

### 4. Directivas de Endurecimiento de APIs y Gateway (OWASP API Top 10)

1. **CORS Restrictivo con Lista Blanca (CWE-942):**
   - Se eliminó el comodín `origin: true`. La API solo responde a peticiones originadas en:
     - `https://sgbt-bice.vercel.app`
     - Subdominios institucionales autorizados `*.vercel.app` y `*.mippci.gob.ve`.
     - `http://localhost:3000` exclusivamente en entornos de desarrollo y pruebas.
2. **Prevención de DoS por Payloads Masivos:**
   - El tamaño de carga global para peticiones JSON está limitado a **2MB**, previniendo saturación de memoria en el Event Loop.
   - Rutas con carga legítima de archivos (como ingesta de Excel `/api/v1/payroll/batch-import` o fotografías `/api/v1/auth/enroll`) cuentan con un límite específico de **50MB**.
3. **Prevención de BOLA / IDOR:**
   - En el enrolamiento de Passkeys (`/auth/passkey/register-verify`), la credencial se vincula estrictamente al ID del usuario autenticado (`req.user.id`), impidiendo la asociación maliciosa de llaves a terceros.
   - Las rutas de auditoría y diagnóstico (`/api/v1/system/logs/*`) están protegidas bajo `requireRole('admin', 'director')`.
4. **Cumplimiento RFC 6585 (Rate Limiting):**
   - El limitador de tasa emite la cabecera estándar `Retry-After: <segundos>` ante respuestas `HTTP 429 Too Many Requests`.
5. **Ofuscación de Errores Internos 500:**
   - En producción, las respuestas HTTP 500 retornan mensajes genéricos seguros conforme a RFC 7807, ocultando trazas de error de base de datos o rutas internas de disco.
6. **Secretos Dinámicos de 256 bits:**
   - Si no se define un secreto de sesión en las variables de entorno de producción, el sistema genera dinámicamente una clave criptográfica de 256 bits en memoria, impidiendo el uso de strings estáticos predecibles.

---

### 5. Gestión Criptográfica de Identidad y Formalización

1. **Formalización Multi-Dispositivo de Beneficiarios:**  
   - Los beneficiarios no registrados formalizan su expediente cargando una fotografía nítida (capturada en vivo por cámara o seleccionada desde su galería) y asignando una contraseña institucional segura.
   - El sistema vincula el identificador único del hardware (`bound_device_id`) y almacena el registro en `passkey_credentials` en Supabase Cloud (`formalized_pwd_{id}`).
   - Una vez formalizado, el usuario no vuelve a ser requerido para formalización, accediendo directamente a su carnet de beneficios.
2. **Arquitectura FIDO2 / WebAuthn:**  
   - Durante el enrolamiento biométrico, el dispositivo del trabajador genera un par de claves asimétricas en su circuito de hardware seguro (*Apple Secure Enclave, Android Titan M2 / StrongBox o TPM 2.0 en Windows*).
   - El servidor almacena únicamente la clave pública en formato PEM (`passkey_credentials.public_key`).
   - La clave privada jamás se transmite por la red ni sale del microchip del usuario.
3. **Firmas y Prevención Anti-Replay:**  
   Cada comprobante QR emitido contiene un reto aleatorio de 32 bytes (`challenge_nonce`) y una firma criptográfica con algoritmo ECDSA (Curva elíptica P-256 / SHA-256). El servidor valida la firma y comprueba que el `sign_count` sea estrictamente incremental para detectar clonaciones de credenciales.
4. **Vigencia Temporal Estricta:**  
   El código QR dinámico de retiro cuenta con un tiempo de vida máximo de **180 segundos**. Una vez expirado, la terminal de despacho rechaza la lectura de forma automática.

---

### 6. Seguridad en Persistencia y Resiliencia Eléctrica

1. **Modo WAL en SQLite (`Write-Ahead Logging`):**  
   Garantiza que ante un corte abrupto de energía en las estaciones de almacén no ocurra corrupción de base de datos (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL`).
2. **Candado de Dispositivo (`device_locks`):**  
   Mecanismo de hardware para impedir que un mismo dispositivo móvil sea utilizado sucesivamente para reclamar beneficios de múltiples cédulas no vinculadas, alertando sobre posible suplantación.

---

### 7. Auditoría DevSecOps y Verificación Continua de Persistencia

El sistema incorpora un mecanismo de auditoría viva para validar la integridad de la base remota en Supabase Cloud frente a los 6 vectores de persistencia:
```bash
npm run verify:cloud
```
1. Verificación del esquema y tablas activas.
2. Comprobación de persistencia de contraseña y formalización en `passkey_credentials`.
3. Comprobación de enrolamiento de Passkeys FIDO2 / WebAuthn.
4. Registro transaccional de entregas en `deliveries` con resolución de foreign keys a `daily_entitlements` y `distribution_points`.
5. Vinculación y revocación de tarjetas NFC en `nfc_cards`.
6. Hidratación bidireccional y resolución de conflictos `ON CONFLICT` en SQLite.
