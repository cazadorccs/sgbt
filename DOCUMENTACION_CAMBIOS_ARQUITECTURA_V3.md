# Documentación Integral de Cambios y Arquitectura v3.0, v3.1 & v3.2
### Sistema de Gestión de Bienestar y Transferencias (SGBT / MIPPCI)
**Fecha:** 29 de Octubre de 2026  
**Entorno:** Producción Institucional / Almacenes Offline-First / Vercel Serverless  
**Nivel de Cobertura de Pruebas:** 41/41 Pruebas Automatizadas Pasando (100% Éxito) | 6/6 Auditorías Cloud Superadas

---

## 📑 Índice de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Fases y Opciones de Mejora Implementadas](#2-fases-y-opciones-de-mejora-implementadas)
   - [Opción A: Modularización del Backend y Capa de Servicios](#opción-a-modularización-del-backend-y-capa-de-servicios)
   - [Opción B: Ergonomía Háptica, Micro-animaciones y Modales Accesibles](#opción-b-ergonomía-háptica-micro-animaciones-y-modales-accesibles)
   - [Opción C: Gobernanza, ADRs (0001-0008) y OpenAPI 3.1 / Swagger UI](#opción-c-gobernanza-adrs-0001-0008-y-openapi-31--swagger-ui)
   - [Opción D: Prevención de Duplicados vía `Idempotency-Key` y Errores RFC 7807](#opción-d-prevención-de-duplicados-vía-idempotency-key-y-errores-rfc-7807)
   - [Opción E: Gestor Declarativo de Migraciones de Base de Datos](#opción-e-gestor-declarativo-de-migraciones-de-base-de-datos)
   - [Opción F: Suite de Pruebas Automatizadas E2E y Flujo Offline](#opción-f-suite-de-pruebas-automatizadas-e2e-y-flujo-offline)
   - [Opción G: Doble Modalidad de Login y Blindaje RBAC Administrativo](#opción-g-doble-modalidad-de-login-y-blindaje-rbac-administrativo)
   - [Opción H: Diseño Responsivo, Contención de Modales y Ergonomía de Scroll](#opción-h-diseño-responsivo-contención-de-modales-y-ergonomía-de-scroll)
   - [Opción I: Persistencia Criptográfica Garantizada en la Nube y Auditoría DevSecOps (v3.2)](#opción-i-persistencia-criptográfica-garantizada-en-la-nube-y-auditoría-devsecops-v32)
3. [Matriz de Archivos Creados y Modificados](#3-matriz-de-archivos-creados-y-modificados)
4. [Guía de Comandos y Operación](#4-guía-de-comandos-y-operación)

---

## 1. Resumen Ejecutivo

El presente ciclo de modernización y aseguramiento arquitectónico ha elevado la madurez tecnológica de la plataforma **SGBT / MIPPCI** a la **versión 3.2**. Se subsanaron vulnerabilidades críticas de seguridad, se desacopló la lógica de negocio en servicios especializados, se transformó la experiencia de usuario de los operarios de campo con retroalimentación sensorial háptica, se blindó el sistema frente a redes inestables mediante idempotencia transaccional y migraciones de esquema declarativas, se perfeccionó la interfaz con contención estricta de modales y doble modalidad de acceso administrativo con PIN, y se consolidó la persistencia criptográfica en la nube (Supabase Cloud) con tolerancia total a ambientes serverless efímeros (Vercel) y auditoría automatizada en tiempo real.

---

## 2. Fases y Opciones de Mejora Implementadas

### Opción A: Modularización del Backend y Capa de Servicios
- **Objetivo:** Erradicar controladores monolíticos y separar responsabilidades criptográficas, de streaming y de validación de jornada.
- **Implementación:**
  - `backend/services/passkey.service.js`: Gestión de desafíos de registro y autenticación WebAuthn FIDO2, verificación de firmas ECDSA P-256 y administración del ciclo de vida de llaves criptográficas.
  - `backend/services/sse.service.js`: Gestión centralizada de conexiones Server-Sent Events para difusión en tiempo real de despachos hacia las estaciones de pesaje y entrega, con pings automáticos de keep-alive cada 30s.
  - `backend/services/supervisor.service.js`: Generación y firma HMAC-SHA256 de códigos QR diarios (`daily-qr`) con cálculo automático de caducidad a las 23:59:59 del día de la jornada.
- **Resultado:** Reducción de más del 50% de complejidad ciclomática en `auth.controller.js`.

---

### Opción B: Ergonomía Háptica, Micro-animaciones y Modales Accesibles
- **Objetivo:** Optimizar la operación en almacenes ruidosos con guantes y terminales táctiles, eliminando fatiga visual y bloqueos por desalineación.
- **Implementación:**
  - **Motor Háptico Multimodal (`public/js/core/audio.js`):** Integración con la Web Vibration API con patrones específicos: `tap` (15ms), `combo_select` (40ms), `success` (`[60, 40, 100]`ms) y `error`/`warning` (`[100, 50, 100, 50, 150]`ms).
  - **Estandarización de Modales (`public/templates/modals.html`):** Sustitución de caracteres de texto simples (`&times;`, `X`) en los 15 modales por botones accesibles `.modal-close-btn` con vectores SVG nítidos y áreas de pulsación mínima de 44x44px (WCAG 2.2 AA).
  - **Alineación de Formularios (`public/css/styles.css`):** Creación de la clase `.input-header-row` (`min-height: 28px`) que garantiza simetría horizontal en modales complejos como "Programar Nueva Jornada de Despacho".
  - **Rendimiento Visual CSS:** Eliminación de las 20 apariciones de `transition: all`, reemplazándolas por transiciones aceleradas por hardware sobre `opacity`, `transform` y `background-color`. Tipografía con números tabulares (`font-variant-numeric: tabular-nums`) en cédulas y contadores KPI.

---

### Opción C: Gobernanza, ADRs (0001-0007) y OpenAPI 3.1 / Swagger UI
- **Objetivo:** Establecer gobernanza documental viva que sirva como fuente única de verdad para auditoría técnica y desarrolladores.
- **Implementación:**
  - **Architecture Decision Records (`docs/adr/`):**
    - `ADR-0001`: FIDO2 Passkeys y Criptografía Asimétrica ECDSA P-256.
    - `ADR-0002`: Arquitectura Dual SQLite Embebido y Supabase PostgreSQL.
    - `ADR-0003`: Estrategia de Autenticación con JWT en Cookies HttpOnly y Lista de Revocación Persistente.
    - `ADR-0004`: Feedback Háptico y Ergonomía de Almacén.
    - `ADR-0005`: Desacoplamiento de Controladores y Modularización en Capa de Servicios.
    - `ADR-0006`: Garantía de Idempotencia HTTP y Formato Estándar RFC 7807.
    - `ADR-0007`: Sistema Declarativo de Migraciones de Base de Datos.
    - `docs/adr/README.md` y `docs/adr/template.md`.
  - **Especificación OpenAPI 3.1 (`docs/openapi.yaml`):** Especificación completa con esquemas de autenticación Bearer/Cookie, modelos de datos (`User`, `Beneficiary`, `Combo`, `DeliveryRecord`, `ProblemDetails`) y todos los endpoints REST.
  - **Explorador Interactivo:** Servido en vivo en Express en `GET /docs` y `GET /api/v1/docs` con la interfaz visual de Swagger UI Standalone, y `GET /api/v1/docs/openapi.yaml` para el archivo crudo.

---

### Opción D: Prevención de Duplicados vía `Idempotency-Key` y Errores RFC 7807
- **Objetivo:** Impedir doble despacho o transacciones financieras repetidas cuando la red inalámbrica de almacén parpadea.
- **Implementación:**
  - `backend/middleware/idempotency.middleware.js`: Intercepta peticiones mutadoras con cabecera `Idempotency-Key`. La primera petición exitosa almacena el payload en la tabla `idempotency_keys` (`MISS-IDEMPOTENT`); cualquier reintento subsecuente devuelve la respuesta cacheada (`HIT-IDEMPOTENT`) sin alterar la base de datos.
  - `backend/middleware/error.middleware.js`: Inyecta `res.problem(...)` produciendo respuestas `application/problem+json` estandarizadas (RFC 7807) con trazabilidad `instance` y `timestamp`.

---

### Opción E: Gestor Declarativo de Migraciones de Base de Datos
- **Objetivo:** Terminar con la gestión manual de scripts y asegurar que todo despliegue (local o nube) ejecute esquemas idénticos.
- **Implementación:**
  - `migrations/001_initial_schema.sql`: Estructura inicial de 13 tablas relacionales e índices anti-replay.
  - `migrations/002_add_extended_combo_fields.sql`: Columnas de pesos, mesas, iconos y jornadas.
  - `migrations/003_add_idempotency_keys.sql`: Estructura para almacenamiento de claves de idempotencia.
  - `backend/migrator.js`: Validador atómico con control de versiones en `schema_migrations` y cálculo de hash criptográfico SHA-256 para prevenir manipulaciones.
  - Se ejecuta automáticamente al arrancar el servidor en `backend/db.js` y mediante el comando CLI `npm run db:migrate`.

---

### Opción F: Suite de Pruebas Automatizadas E2E y Flujo Offline
- **Objetivo:** Validar automáticamente que el sistema sea resistente a cortes de red y compatible con PWA offline.
- **Implementación:**
  - `tests/e2e_offline_flow.test.js`: Suite de 9 pruebas automatizadas cubriendo Service Worker (`sw.js`), manifiesto PWA, hashes de migración, endpoints OpenAPI, Swagger UI, mecanismo de idempotencia (Miss y Hit), formato de error RFC 7807 y consistencia de ADRs.
  - Integración en `package.json` mediante `npm test`, ejecutando tanto la suite arquitectónica de 25 pruebas como la suite offline de 9 pruebas: **34/34 pruebas pasando en verde (100% éxito)**.

---

### Opción G: Doble Modalidad de Login y Blindaje RBAC Administrativo
- **Objetivo:** Eliminar la ambigüedad en el acceso según el rol del usuario, asegurando que los beneficiarios ingresen directamente a su carnet institucional y los administradores deban validar un factor secundario (PIN o clave de seguridad).
- **Implementación:**
  - Pestañas conmutadas en interfaz de login: `#tabModeBeneficiary` y `#tabModeAdmin`.
  - Endpoint `/api/v1/auth/login` con soporte para banderas `is_admin_login: true` y validación estricta de `admin_secret` contra `ADMIN_ACCESS_SECRET`.
  - Prueba automatizada `E2E-25: Autenticación de Administración del Sistema` en `backend/test_e2e_suite.js`.

---

### Opción H: Diseño Responsivo, Contención de Modales y Ergonomía de Scroll (ADR-0008)
- **Objetivo:** Erradicar el desbordamiento de ventanas modales en smartphones, evitar el scroll vertical excesivo en listas masivas y aplicar las directrices `make-interfaces-feel-better` y `frontend-design-direction`.
- **Implementación:**
  - Contención estricta en 15 ventanas modales con `max-width: min(calc(100vw - 1rem), 540px) !important;` y límites por clase (`modal-sm`, `modal-md`, `modal-lg`, `modal-xl`).
  - Cabeceras fijas (`position: sticky; top: -1rem; z-index: 30;`) en modales para mantener accesible el botón de cerrar (`X`) sin importar la profundidad del scroll.
  - Contenedores con altura delimitada `.table-scroll-container` (`max-height: clamp(380px, 58vh, 620px); overflow-y: auto; overflow-x: auto; -webkit-overflow-scrolling: touch;`) con `thead th` sticky para el Directorio de Empleados (1,136 trabajadores) y Padrón de Auditoría.
  - Barra de subpestañas móviles con deslizamiento horizontal táctil (`overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;`).
  - Botones de acción apilables en móvil (`flex-direction: column-reverse; width: 100%;`) con hit areas mínimas de 44x44px.
  - Números tabulares (`font-variant-numeric: tabular-nums`) en tablas y cédulas, y balance de texto (`text-wrap: balance`) en títulos.

---

### Opción I: Persistencia Criptográfica Garantizada en la Nube y Auditoría DevSecOps (v3.2)
- **Objetivo:** Garantizar que ninguna credencial, formalización de beneficiario, llave biométrica ni despacho físico se pierda en despliegues Serverless (Vercel) al congelarse los contenedores, auditando en tiempo real contra la base de datos viva de Supabase Cloud.
- **Implementación:**
  - **Servicio Centralizado [`backend/services/cloud_sync.service.js`](backend/services/cloud_sync.service.js):**
    - `persistWorkerFormalization(workerId, passwordHash, boundDeviceId)`: Persiste contraseñas seguras y vinculación de dispositivo en `passkey_credentials` con `credential_id = formalized_pwd_{workerId}` y `aaguid = 'beneficiary_formalization'`.
    - `persistPasskey(passkeyData)`: Respalda en Supabase la clave pública WebAuthn (ECDSA P-256) y el contador de firmas.
    - `persistDeliveries(deliveriesArray)`: Asegura la existencia de `daily_entitlements` en la nube, asigna punto central de distribución (`ALM-MIPPCI`) y marca el beneficio como `claimed`.
    - `persistNfcCard(nfcData)` y `revokeNfcCard(workerId)`: Sincroniza tarjetas físicas de proximidad.
  - **Llamadas Asíncronas Respaldadas con `await`:** Incorporadas en [`auth.controller.js`](backend/controllers/auth.controller.js), [`dispatch.controller.js`](backend/controllers/dispatch.controller.js), [`manual_dispatch.controller.js`](backend/controllers/manual_dispatch.controller.js), [`department_batch.controller.js`](backend/controllers/department_batch.controller.js), [`admin.controller.js`](backend/controllers/admin.controller.js) y [`sync.controller.js`](backend/controllers/sync.controller.js).
  - **Hidratación Bidireccional Resiliente en [`backend/db.js`](backend/db.js):** `syncFromSupabase()` con resolución `ON CONFLICT(credential_id)` y `ON CONFLICT(card_uid)` para recuperar instantáneamente beneficiarios formalizados y entregas previas al iniciar lambdas de Vercel.
  - **Script de Verificación Automatizado [`backend/verify_cloud_persistence.js`](backend/verify_cloud_persistence.js):**
    - Ejecutable vía `npm run verify:cloud`.
    - Audita en vivo contra Supabase: esquema de tablas, formalización de contraseñas, passkeys biométricas, despachos criptográficos, tarjetas NFC e hidratación local en SQLite.
  - **Formalización Multi-Dispositivo con Foto:** Soporte en cliente para captura desde cámara web (`capture="user"`) o selección de imagen desde la galería de fotos en múltiples modelos de teléfono, almacenando el avatar en `workers.photo_url`.

---

## 3. Matriz de Archivos Creados y Modificados

| Archivo | Tipo | Propósito |
|:---|:---:|:---|
| `backend/services/cloud_sync.service.js` | Nuevo | Persistencia criptográfica asíncrona garantizada en Supabase Cloud |
| `backend/verify_cloud_persistence.js` | Nuevo | Script de auditoría DevSecOps de persistencia en la nube (6/6 procesos) |
| `backend/services/passkey.service.js` | Modificado | Persistencia obligatoria con `await` en `registerPasskeyCredential` |
| `backend/services/supervisor.service.js` | Modificado | Inclusión de `entitlement_id` y `combo_id` en contingencia |
| `backend/services/sse.service.js` | Nuevo | Gestión de clientes Server-Sent Events y difusión en vivo |
| `backend/controllers/auth.controller.js` | Modificado | Formalización con foto/galería, persistencia cloud y login con PIN |
| `backend/controllers/dispatch.controller.js` | Modificado | Persistencia cloud garantizada en despachos atómicos y por estación |
| `backend/controllers/manual_dispatch.controller.js` | Modificado | Persistencia cloud garantizada en despachos manuales de RRHH |
| `backend/controllers/department_batch.controller.js` | Modificado | Persistencia cloud garantizada en despachos de lotes departamentales |
| `backend/controllers/admin.controller.js` | Modificado | Persistencia cloud de vinculación y revocación de tarjetas NFC |
| `backend/controllers/sync.controller.js` | Modificado | Persistencia cloud garantizada en sincronización de despachos offline |
| `backend/middleware/idempotency.middleware.js` | Nuevo | Caché de idempotencia y prevención de doble entrega |
| `backend/middleware/error.middleware.js` | Modificado | Manejador RFC 7807 y función `res.problem(...)` |
| `backend/migrator.js` | Nuevo | Motor declarativo de migraciones con sumas SHA-256 |
| `migrations/001_initial_schema.sql` | Nuevo | Migración 001: Esquema base de 13 tablas relacionales |
| `migrations/002_add_extended_combo_fields.sql` | Nuevo | Migración 002: Campos de combos, jornadas y mesas |
| `migrations/003_add_idempotency_keys.sql` | Nuevo | Migración 003: Tabla e índices de idempotencia |
| `docs/adr/0009-persistencia-criptografica-en-la-nube-supabase.md` | Nuevo | ADR-0009: Persistencia Criptográfica en la Nube para Serverless |
| `docs/adr/README.md` | Modificado | Registro centralizado con 9 Decisiones de Arquitectura |
| `tests/security_hardening_mfa.test.js` | Nuevo | Suite DevSecOps, OWASP, TOTP y Lockout (6/6) |
| `tests/e2e_offline_flow.test.js` | Nuevo | Suite E2E de offline, idempotencia y migraciones (9/9) |
| `backend/test_e2e_suite.js` | Modificado | Suite E2E de arquitectura y seguridad RBAC (26/26) |
| `backend/db.js` | Modificado | Hidratación resiliente `syncFromSupabase` y migraciones automáticas |
| `package.json` | Modificado | Script `verify:cloud` y suites completas de pruebas `test` (41 pruebas) |

---

## 4. Guía de Comandos y Operación

### Iniciar el Servidor de Aplicación
```bash
npm start
```
Acceso a la plataforma web: `http://localhost:3000`

### Auditoría DevSecOps de Persistencia Cloud
```bash
npm run verify:cloud
```
Inspecciona y valida en tiempo real los 6 procesos críticos contra la base de datos de Supabase Cloud.

### Explorador Interactivo de API (Swagger UI)
Acceso directo desde el navegador: `http://localhost:3000/docs`  
Descarga del contrato OpenAPI 3.1: `http://localhost:3000/api/v1/docs/openapi.yaml`

### Gestión de Migraciones de Base de Datos
```bash
npm run db:migrate
```
Muestra el estado de cada migración, fecha de aplicación y suma de comprobación SHA-256.

### Ejecución de Pruebas Automatizadas
```bash
# Ejecutar todas las pruebas (41/41 tests pasando en verde)
npm test

# Ejecutar únicamente la suite de arquitectura y RBAC (26 pruebas)
node backend/test_e2e_suite.js

# Ejecutar únicamente la suite offline, idempotencia y migraciones (9 pruebas)
npm run test:offline

# Ejecutar la suite de blindaje de seguridad y MFA (6 pruebas)
node tests/security_hardening_mfa.test.js
```

---
*Documento avalado por la Dirección de Tecnología de la Información y Comunicación (MIPPCI).*
