# Documentación Integral de Cambios y Arquitectura v4.0, v4.1 & v4.2
### Sistema de Gestión de Bienestar y Transferencias (SGBT / MIPPCI)
**Fecha:** 7 de Noviembre de 2026  
**Entorno:** Producción Institucional / Almacenes Offline-First / Vercel Serverless  
**Nivel de Cobertura de Pruebas:** 9 Suites de Pruebas Automatizadas Pasando (100% Éxito) | 6/6 Auditorías Cloud Superadas

---

## 📑 Índice de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Hitos y Mejoras Arquitecturales (v4.0 - v4.2)](#2-hitos-y-mejoras-arquitecturales-v40---v42)
   - [Hito 1: Segregación Criptográfica Estricta de Credenciales (ADR-0010)](#hito-1-segregación-criptográfica-estricta-de-credenciales-adr-0010)
   - [Hito 2: Sistema de Gestión y Autoservicio de Recuperación de Contraseñas](#hito-2-sistema-de-gestión-y-autoservicio-de-recuperación-de-contraseñas)
   - [Hito 3: Directorio Institucional de Empleados y Padrón con Métricas en Vivo](#hito-3-directorio-institucional-de-empleados-y-padrón-con-métricas-en-vivo)
   - [Hito 4: Auditoría de Ciberseguridad Trail of Bits y 10 Directivas de APIs](#hito-4-auditoría-de-ciberseguridad-trail-of-bits-y-10-directivas-de-apis)
   - [Hito 5: Endurecimiento de Gateway (CORS, DoS Payload Limit, Retry-After)](#hito-5-endurecimiento-de-gateway-cors-dos-payload-limit-retry-after)
   - [Hito 6: Suite Completa de Pruebas Automatizadas (9 Suites al 100%)](#hito-6-suite-completa-de-pruebas-automatizadas-9-suites-al-100)
3. [Matriz de Archivos Clave y Módulos](#3-matriz-de-archivos-clave-y-módulos)
4. [Guía de Comandos y Despliegue Continuo](#4-guía-de-comandos-y-despliegue-continuo)

---

## 1. Resumen Ejecutivo

La versión **v4.2** de la plataforma **SGBT / MIPPCI** representa un salto cualitativo en materia de **ciberseguridad defensiva, gobernanza de identidades y resiliencia de APIs**. 

Tras someter el código a una auditoría rigurosa basada en las directivas de **Trail of Bits** y el **OWASP API Security Top 10**, se erradicaron las brechas de permisividad cruzada entre credenciales de beneficiarios y PINs de administración, se implementó un sistema de autoservicio para la recuperación de contraseñas de funcionarios, se restringió la superficie de ataque en CORS y límites de carga DoS, y se blindaron los endpoints de auditoría y passkeys contra vulnerabilidades BOLA/IDOR.

---

## 2. Hitos y Mejoras Arquitecturales (v4.0 - v4.2)

### Hito 1: Segregación Criptográfica Estricta de Credenciales (ADR-0010)
- **Problemática Resuelta:** Anteriormente, un usuario con rol administrativo en el padrón podía iniciar sesión en la consola de gobernanza (`/coseg`) tipeando su contraseña ordinaria de beneficiario de 4 dígitos.
- **Implementación:**
  - La consola `/coseg` exige **estrictamente** el PIN administrativo oficial (`ADMIN_ACCESS_SECRET`). Las contraseñas de beneficiario son rechazadas con HTTP 401.
  - El portal de beneficiarios rechaza el PIN administrativo; solo admite la contraseña personal o Passkey FIDO2.
  - La sesión emite un alcance criptográfico explícito (`session_scope: 'admin' | 'beneficiary'`). Las rutas `/api/v1/admin/*` exigen validación de alcance administrativo, bloqueando cualquier token con alcance de beneficiario con HTTP 403 (`ADMIN_SCOPE_REQUIRED`).
  - La interfaz de usuario (`switchSessionView`) impide conmutar al panel de administración sin previa autenticación por PIN en `/coseg`.

### Hito 2: Sistema de Gestión y Autoservicio de Recuperación de Contraseñas
- **Autoservicio de Recuperación (2 Pasos):**
  - **Paso 1 (`POST /api/v1/auth/password-recovery/request`):** Valida la Cédula contra el correo o teléfono institucional registrado en nómina. Emite un token HMAC de 15 minutos.
  - **Paso 2 (`POST /api/v1/auth/password-recovery/confirm`):** Valida el token y graba la nueva clave con hashing seguro (`scrypt`/PBKDF2) en SQLite y Supabase Cloud.
- **Panel Administrativo de Credenciales (`POST /api/v1/admin/workers/:id/password`):**
  - Permite a los directores asignar contraseñas manuales o restablecer al funcionario a estatus `precargado` para forzar su auto-enrolamiento con captura de fotografía en el próximo ingreso.

### Hito 3: Directorio Institucional de Empleados y Padrón con Métricas en Vivo
- Barra superior de métricas consolidadas en tiempo real:
  - **Total Padrón:** Cómputo global de funcionarios.
  - **Personal Activo vs. Jubilados:** Desglose demográfico ministerial.
  - **Tasa de Formalización:** Porcentaje y total de trabajadores que han formalizado fotografía y contraseña.
- Prevención activa de registros duplicados por cédula y normalización automática de prefijos (`V-`, `E-`, etc.).

### Hito 4: Auditoría de Ciberseguridad Trail of Bits y 10 Directivas de APIs
- Evaluación y remediación de 10 vectores críticos:
  1. *HTTPS y HSTS:* Cabecera HSTS y redirección 301 forzada en producción.
  2. *Tokens y Sesiones:* Inyección de tokens en cookies seguras `HttpOnly`, `SameSite=Strict` y `Secure`.
  3. *WebAuthn FIDO2 Zero-Trust:* Prohibición de generación de claves privadas en el backend en entornos de producción.
  4. *Erradicación de Claves Hardcodeadas:* Supresión del PIN `'0578'` como bypass en código y generación aleatoria en memoria de 256 bits si faltan variables en producción.
  5. *Prevención BOLA/IDOR:* Vinculación de passkeys forzada al ID de sesión autenticado (`req.user.id`).
  6. *Protección de Logs:* Rutas `/api/v1/system/logs/*` protegidas con `requireRole('admin', 'director')`.
  7. *Cumplimiento RFC 6585:* Cabecera `Retry-After: <segundos>` en respuestas HTTP 429.
  8. *Versionado:* Prefijo canónico `/api/v1/` y contrato OpenAPI 3.1 sincronizado.
  9. *Restricción de Superficie:* Tamaño de payload JSON limitado a 2MB general y 50MB localizado.
  10. *Ofuscación de Errores:* Enmascaramiento de errores SQL y trazas internas en respuestas 500.

### Hito 5: Endurecimiento de Gateway (CORS, DoS Payload Limit, Retry-After)
- Se sustituyó `origin: true` por una lista blanca estricta autorizando exclusivamente `https://sgbt-bice.vercel.app`, dominios oficiales del ministerio y localhost en desarrollo.
- Bloqueo preventivo de ataques de compresión (CVE-2026-111497) y sanitización activa XSS recursiva en todas las entradas.

### Hito 6: Suite Completa de Pruebas Automatizadas (9 Suites al 100%)
La plataforma cuenta con 9 suites automatizadas que validan el 100% de los flujos:
1. `backend/test_e2e_suite.js` (E2E & Arquitectura)
2. `tests/e2e_offline_flow.test.js` (Flujo Offline e Idempotencia)
3. `tests/security_hardening_mfa.test.js` (MFA, TOTP y Lockout)
4. `tests/edge_cases_dispatch.test.js` (Casos Límite de Almacén)
5. `tests/sdd_remediation_spec.test.js` (Especificación SDD)
6. `tests/contract_openapi.test.js` (Contratos OpenAPI 3.1)
7. `tests/wcag_dark_mode_contrast.test.js` (Accesibilidad WCAG 2.2 AA)
8. `tests/security_auth_bypass.test.js` (Suite Trail of Bits: Segregación y Auth Bypass)
9. `tests/user_password_management.test.js` (Gestión y Recuperación de Contraseñas)

---

## 3. Matriz de Archivos Clave y Módulos

| Módulo / Archivo | Responsabilidad |
|---|---|
| [`backend/server.js`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/backend/server.js) | Bootstrap Express, CORS con lista blanca, límites de carga (2MB/50MB), HTTPS y rutas v1. |
| [`backend/controllers/auth.controller.js`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/backend/controllers/auth.controller.js) | Segregación estricta de credenciales, login con PIN, formalización y recuperación de claves. |
| [`backend/middleware/auth.middleware.js`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/backend/middleware/auth.middleware.js) | RBAC con verificación de `session_scope === 'admin'`, validación de tokens y amarre de hardware. |
| [`backend/middleware/security.middleware.js`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/backend/middleware/security.middleware.js) | HSTS, CSP, mitigación CVE-2026-111497, sanitización XSS, Rate Limiting y Retry-After. |
| [`backend/middleware/error.middleware.js`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/backend/middleware/error.middleware.js) | Estandarización RFC 7807 (Problem Details) y ofuscación de excepciones 500 en producción. |
| [`backend/services/passkey.service.js`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/backend/services/passkey.service.js) | Criptografía FIDO2 / WebAuthn, validación de llaves asimétricas ECDSA P-256. |
| [`public/js/modules/auth.js`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/public/js/modules/auth.js) | Lógica de cliente: login administrativo, formalización, modal de recuperación y control de vistas. |
| [`docs/adr/0010-segregacion-estricta-credenciales-y-blindaje-api-gateway.md`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/docs/adr/0010-segregacion-estricta-credenciales-y-blindaje-api-gateway.md) | Registro de decisión arquitectural de segregación y seguridad de APIs. |
| [`docs/openapi.yaml`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/docs/openapi.yaml) | Contrato OpenAPI 3.1 actualizado a v4.2.0 con los nuevos endpoints de contraseñas. |

---

## 4. Guía de Comandos y Despliegue Continuo

```bash
# Ejecutar la suite completa de 9 pruebas automatizadas (100% éxito)
npm test

# Ejecutar auditoría DevSecOps y persistencia en Supabase Cloud
npm run verify:cloud

# Ejecutar migraciones declarativas de base de datos
npm run db:migrate

# Iniciar servidor local de desarrollo
npm start
```

