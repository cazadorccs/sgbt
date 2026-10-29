# Guía de Seguridad, Control de Accesos y Privacidad
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Modelo de Control de Acceso Basado en Roles (RBAC)

El acceso a las rutas y operaciones del sistema está estrictamente segregado según el principio de mínimo privilegio:

| Rol | Alcance de Permisos | Vía de Autenticación | Rutas Permitidas |
| :--- | :--- | :--- | :--- |
| **`worker`** (Beneficiario) | Consulta de sus combos asignados, estatus de reclamo y generación de QR de retiro. No puede acceder a datos de terceros ni a la consola de almacén. | Passkey Biométrica (FIDO2 / WebAuthn) o Cédula asistida. | `/api/auth/me`, `/api/auth/generate-qr`, `/api/system/catalog` |
| **`operator`** (Operador de Almacén) | Lectura óptica de comprobantes QR, verificación de cédulas en punto físico y registro de entregas. No puede modificar nóminas ni alterar jornadas. | Credencial institucional + Asignación a punto de distribución. | `/api/dispatch/*`, `/api/auth/verify-qr`, `/api/auth/verify-cedula` |
| **`supervisor`** (Fiscal de Despacho) | Autorización de retiros en contingencia, anulación justificada de bloqueos y resolución de incidencias en almacén. | Credencial institucional con MFA (TOTP RFC 6238). | `/api/manual-dispatch/*`, `/api/dispatch/override` |
| **`admin`** (Gestión Humana / TI) | Carga masiva de nómina Excel, planificación y cierre de jornadas, auditoría ministerial y sincronización con Supabase. | Credencial con MFA + Amarre de sesión por token seguro. | `/api/payroll/*`, `/api/campaigns/*`, `/api/ministerial-audit/*`, `/api/sync/*` |

---

### 2. Gestión Criptográfica de Identidad (*Passwordless*)

1. **Ausencia de Contraseñas:**  
   El padrón de trabajadores no utiliza contraseñas compartidas ni preguntas de seguridad vulnerables a ingeniería social.
2. **Arquitectura FIDO2 / WebAuthn:**  
   - Durante el enrolamiento, el dispositivo del trabajador genera un par de claves asimétricas en su circuito de hardware seguro (*Apple Secure Enclave, Android Titan M2 / StrongBox o TPM 2.0 en Windows*).
   - El servidor almacena únicamente la clave pública en formato PEM (`passkey_credentials.public_key`).
   - La clave privada jamás se transmite por la red ni sale del microchip del usuario.
3. **Firmas y Prevención Anti-Replay:**  
   Cada comprobante QR emitido contiene un reto aleatorio de 32 bytes (`challenge_nonce`) y una firma criptográfica con algoritmo ECDSA (Curva elíptica P-256 / SHA-256). El servidor valida la firma y comprueba que el `sign_count` sea estrictamente incremental para detectar clonaciones de credenciales.
4. **Vigencia Temporal Estricta:**  
   El código QR dinámico de retiro cuenta con un tiempo de vida máximo de **180 segundos**. Una vez expirado, la terminal de despacho rechaza la lectura de forma automática.

---

### 3. Manejo de Secretos y Variables de Entorno

1. **Archivo de Configuración `.env`:**  
   - El archivo `.env` está expresamente excluido del repositorio mediante `.gitignore` para impedir fugas en repositorios remotos.
   - Existe un archivo plantilla [.env.example](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/.env.example) que detalla el formato de cada variable sin valores reales.
2. **Segregación de Llaves de Supabase:**  
   - `SUPABASE_ANON_KEY`: Utilizada únicamente para lectura pública de catálogos y consultas no privilegiadas.
   - `SUPABASE_SERVICE_KEY`: Restringida exclusivamente al backend seguro para sincronización de nómina y cuotas masivas; jamás se expone al código del navegador cliente.

---

### 4. Seguridad en Persistencia y Resiliencia Eléctrica

1. **Modo WAL en SQLite (`Write-Ahead Logging`):**  
   Garantiza que ante un corte abrupto de energía en las estaciones de almacén no ocurra corrupción de base de datos (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL`).
2. **Candado de Dispositivo (`device_locks`):**  
   Mecanismo de hardware para impedir que un mismo dispositivo móvil sea utilizado sucesivamente para reclamar beneficios de múltiples cédulas no vinculadas, alertando sobre posible suplantación.
