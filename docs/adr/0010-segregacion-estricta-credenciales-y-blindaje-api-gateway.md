# ADR-0010: Segregación Estricta de Credenciales y Blindaje de Seguridad en API Gateway

- **Estado:** Accepted
- **Fecha:** 2026-11-07
- **Decisores:** Arquitectura TI, Ciberseguridad & DevOps (MIPPCI)
- **Consultados:** Dirección General de Gestión Humana, Operaciones de Almacén
- **Contexto Técnico:** Auditoría de Ciberseguridad Trail of Bits y OWASP API Security Top 10

---

## 1. Contexto y Problemática

Durante las pruebas de auditoría y operaciones en producción, se identificaron vectores de riesgo relacionados con la separación de privilegios y la exposición de interfaces de programación de aplicaciones (APIs):

1. **Permisividad Cruzada de Credenciales:**
   - Un usuario con rol administrativo en la nómina podía ingresar a la consola de gobernanza (`/coseg` o `isExplicitAdminLogin`) utilizando su contraseña ordinaria de beneficiario de 4 dígitos (`worker.password_hash`), omitiendo la exigencia del PIN de seguridad administrativo (`ADMIN_ACCESS_SECRET`).
   - De manera recíproca, el PIN administrativo era aceptado como contraseña de beneficiario en el portal público de reclamos.
   - En el cliente web, la conmutación de vista (`switchSessionView('admin')`) permitía el acceso visual basándose en el rol del usuario sin comprobar que el token criptográfico poseyera un alcance administrativo formal (`session_scope === 'admin'`).

2. **Exposición en la Capa Gateway de APIs:**
   - La cabecera CORS utilizaba `origin: true` con `credentials: true` (CWE-942), permitiendo peticiones cross-origin autenticadas desde cualquier dominio malicioso.
   - El parser de cuerpo global aceptaba payloads JSON de hasta 50MB indiscriminadamente en todas las rutas, abriendo vectores de denegación de servicio (DoS) por saturación de memoria.
   - Los endpoints de auditoría y streaming de logs (`/api/v1/system/logs/*`) y de verificación de passkeys (`/api/v1/auth/passkey/register-verify`) carecían de verificación estricta de autorización, propiciando riesgos de fuga de información y *Broken Object Level Authorization* (BOLA / IDOR).

---

## 2. Decisión de Arquitectura

Se acuerda implementar un blindaje integral fundamentado en el **Principio de Menor Privilegio (PoLP)** y **Defensa en Profundidad**:

### 2.1. Segregación Criptográfica Estricta de Credenciales
- **Consola Administrativa (`/coseg`):** Acepta **únicamente** el PIN o secreto administrativo oficial (`ADMIN_ACCESS_SECRET`). Se elimina de raíz cualquier validación contra contraseñas de beneficiario. Si no se suministra el PIN correcto, se responde `401 Unauthorized`.
- **Portal de Beneficiarios (`/`):** Acepta **únicamente** la contraseña personal del beneficiario o su Passkey FIDO2. El PIN administrativo es explícitamente rechazado con `401 Unauthorized`.
- **Alcance de Sesión (`session_scope`):** 
  - Todo token emitido lleva un campo criptográfico `scope: 'admin' | 'beneficiary'`.
  - El middleware `requireRole` para endpoints administrativos exige estrictamente `session_scope === 'admin'`. Un administrador que inició sesión como beneficiario tiene denegado el acceso a `/api/v1/admin/*` con código `403 Forbidden` (`ADMIN_SCOPE_REQUIRED`).
  - El frontend prohíbe la conmutación a la consola administrativa si la sesión carece de `session_scope === 'admin'`, redirigiendo formalmente a la pantalla de ingreso con PIN.

### 2.2. Sistema de Gestión y Recuperación de Contraseñas
- **Recuperación de Autoservicio en Dos Pasos:**
  1. *Paso 1 (Validación de Identidad):* Endpoint `POST /api/v1/auth/password-recovery/request` valida Cédula de Identidad contra el correo o teléfono oficial registrado en nómina. Emite un token HMAC de un solo uso con vigencia de 15 minutos.
  2. *Paso 2 (Restablecimiento):* Endpoint `POST /api/v1/auth/password-recovery/confirm` valida el token y actualiza la contraseña con hashing criptográfico (`scrypt`/PBKDF2).
- **Gestión Administrativa:** Endpoint `POST /api/v1/admin/workers/:id/password` permite a directores autorizados asignar contraseñas manuales o restablecer al funcionario a estatus `precargado` para forzar su auto-registro.

### 2.3. Endurecimiento de la Capa de Transporte y Gateway
- **CORS Restrictivo:** Lista blanca estricta (`https://sgbt-bice.vercel.app`, dominios institucionales autorizados y localhost en entornos no productivos). Se bloquea cualquier origen no reconocido.
- **Redirección Forzada a HTTPS:** Redirección automática HTTP 301 en producción con preservación de cabeceras HSTS (`max-age=31536000; includeSubDomains; preload`).
- **Límites de Carga Granulares:** Límite estándar seguro de 2MB para JSON general, y 50MB restringido exclusivamente a rutas de ingesta masiva (`/payroll/batch-import`) y formalización fotográfica (`/auth/enroll`).
- **Protección contra BOLA/IDOR:** El endpoint `/auth/passkey/register-verify` valida la identidad del solicitante vinculando la credencial directamente al ID del token autenticado (`req.user.id`).
- **Protección de Auditoría:** Rutas `/system/logs`, `/system/logs/stream` y `/system/logs/download` protegidas bajo `requireRole('admin', 'director')`.
- **Cabecera `Retry-After`:** Cumplimiento RFC 6585 ante respuestas `HTTP 429 Too Many Requests`.
- **Ofuscación de Errores 500:** En producción, se enmascaran los mensajes de error internos del motor de base de datos para prevenir fugas de estructura relacional.
- **Secretos Dinámicos de 256 bits:** Si en producción no se provee un secreto de sesión en variables de entorno, se genera uno aleatorio seguro de 256 bits en memoria, impidiendo el uso de strings predecibles del repositorio.

---

## 3. Consecuencias

### Positivas
- **Inmunidad ante Suplantación Administrativa:** Queda erradicada la posibilidad de elevar privilegios en el portal de gobernanza mediante claves simples de beneficiario.
- **Mitigación Activa de OWASP API Security Top 10:** Se neutralizan las brechas de CORS (CWE-942), DoS por payload excesivo, IDOR/BOLA en credenciales y fuga de datos en logs de auditoría.
- **Autonomía Operativa de Beneficiarios:** Los trabajadores pueden recuperar el acceso a sus comprobantes de beneficios sin necesidad de soporte presencial de TI.
- **Trazabilidad Forense Garantizada:** Toda acción administrativa y de recuperación de credenciales queda debidamente registrada en la bitácora relacional de auditoría.

### Negativas / Restricciones
- Un director o administrador que desee alternar entre la consulta de sus propios combos y la consola de administración debe autenticarse dos veces con sus respectivas credenciales (contraseña de beneficiario para combos y PIN oficial para administración). Esto se asume como una restricción deseada de seguridad (Separación de Tareas).

