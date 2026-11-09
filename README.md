# SGBT - Plataforma de Bienestar Alimentario Institucional
### Sistema de Despacho de Víveres y Combos Proteicos con Passkeys FIDO2 y Arquitectura Offline-First (MIPPCI)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20%20%7C%20v22-green.svg)](https://nodejs.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20v5.0-brightgreen.svg)]()
[![E2E Tests](https://img.shields.io/badge/Test%20Suites-10%2F10%20Passed%20(100%25)-success.svg)]()
[![Cloud Audit](https://img.shields.io/badge/Cloud%20Persistence-6%2F6%20Verified-blue.svg)]()
[![Merkle Audit](https://img.shields.io/badge/Merkle%20Audit-RFC%206962%20SHA--256-blueviolet.svg)]()
[![Web Push](https://img.shields.io/badge/Web%20Push-VAPID%20RFC%208291%2F8292-teal.svg)]()
[![Android APK](https://img.shields.io/badge/Android%20APK-TWA%20Bubblewrap%20Ready-green.svg)]()
[![OpenAPI](https://img.shields.io/badge/OpenAPI-v3.1.0-orange.svg)](http://localhost:3000/docs)
[![Security](https://img.shields.io/badge/Security-Trail%20of%20Bits%20%7C%20FIDO2%20Passkeys-blueviolet.svg)]()

---

## 🏛️ Descripción General

El **Sistema de Gestión de Bienestar y Transferencias (SGBT)** es una plataforma tecnológica institucional diseñada para la gestión, auditoría y entrega automatizada de beneficios alimenticios (Bolsas de Víveres Secos, Combos Proteicos en Cadena de Frío, Útiles Escolares y Combos Especiales) a trabajadores activos, contratados, jubilados y pensionados del sector público.

La plataforma resuelve el desafío crítico de la **operación en sótanos, almacenes y depósitos sin cobertura celular o conexión a Internet**, mediante una arquitectura estricta **Offline-First**, validación criptográfica en hardware seguro (**Passkeys FIDO2 / WebAuthn**), prevención de duplicados vía `Idempotency-Key` y reconciliación asíncrona garantizada con índice anti-fraude estricto (`idx_unique_daily_claim`).

---

## ✨ Características Principales

1. **Autenticación Biométrica FIDO2 / Passkeys:**
   - Enrolamiento en hardware seguro (Apple Secure Enclave, Android StrongBox / Keystore).
   - Generación de códigos QR temporales firmados con **ECDSA P-256** que impiden capturas de pantalla o transferencias indebidas.
   - Verificación local offline en terminales de almacén en **< 2 ms** sin requerir conexión a internet.

2. **Arquitectura Modular con Capa de Servicios y Doble Motor de Persistencia:**
   - **Servicios Desacoplados:** Criptografía (`passkey.service.js`), streaming en tiempo real (`sse.service.js`) y jornadas (`supervisor.service.js`).
   - **On-Premise / Servidores Dedicados:** Motor de alto rendimiento `better-sqlite3` con precompilación de sentencias en memoria y migración directa a PostgreSQL 15+.
   - **Serverless / Cloud:** Motor WebAssembly `sql.js` compilado de C/C++ a WASM para lambdas efímeras (Vercel) con réplica opcional hacia Supabase REST.

3. **Garantía de Idempotencia y Formato Estándar RFC 7807:**
   - Soporte de cabecera `Idempotency-Key` / `X-Idempotency-Key` para operaciones de despacho y nómina. Reintentos causados por inestabilidad de red retornan el resultado cacheado (`HIT-IDEMPOTENT`) impidiendo dobles entregas.
   - Respuestas de error estandarizadas con `application/problem+json` (RFC 7807).

4. **Gestor Declarativo de Migraciones de Base de Datos:**
   - Scripts SQL versionados en `migrations/` con control criptográfico SHA-256 en la tabla `schema_migrations`.
   - Ejecución transaccional automática en el arranque del servidor y vía comando CLI `npm run db:migrate`.

5. **Mesa de Despacho y Ergonomía para Operadores de Almacén:**
   - Escáner multi-cámara en vivo (`Html5Qrcode`) con conmutación dinámica de lentes.
   - **Feedback Háptico Sensorial Multimodal:** Patrones vibratorios (`tap`, `combo_select`, `success`, `error`) con respaldo por síntesis Web Audio API.
   - Áreas táctiles mínimas de 44x44px (WCAG 2.2 AA) y alineación simétrica en ventanas modales.

6. **Gobernanza Viva y Documentación OpenAPI 3.1:**
   - 8 Decisiones de Arquitectura Formales (ADRs) documentadas en `docs/adr/`.
   - Explorador interactivo visual Swagger UI integrado en `/docs` y especificación OpenAPI 3.1 descargable en `/api/v1/docs/openapi.yaml`.

7. **Doble Modalidad de Login y Segregación Criptográfica Estricta (ADR-0010):**
   - Acceso conmutado en interfaz y backend: **Beneficiarios / Almacén** (ingreso mediante Cédula y contraseña de beneficiario / Passkey FIDO2) vs. **Consola Administrativa Segura (`/coseg`)** (exige validación estricta de rol administrativo y verificación exclusiva del PIN oficial `ADMIN_ACCESS_SECRET`).
   - Principio de Menor Privilegio: Un beneficiario no puede elevar privilegios a la consola de administración usando su clave de 4 dígitos, y el PIN administrativo no puede ser usado para usurpar el retiro de combos de un beneficiario.
   - Las sesiones emiten alcance explícito (`session_scope: 'admin' | 'beneficiary'`). Las rutas `/api/v1/admin/*` exigen elevación administrativa confirmada.

8. **Diseño Responsivo, Contención de Modales y Ergonomía de Scroll (ADR-0008):**
   - Contención estricta en 15 ventanas modales con `max-width: min(calc(100vw - 1rem), ...)` y `max-height: min(92vh, 92dvh)`.
   - Cabeceras fijas (`position: sticky; top: -1rem; z-index: 30;`) en modales para que el botón de cerrar y título permanezcan permanentemente visibles al hacer scroll.
   - Contenedores con altura delimitada `.table-scroll-container` (`max-height: clamp(380px, 58vh, 620px)`) y encabezados fijos (`thead th` sticky) para tablas masivas de nómina (1,138+ trabajadores) y auditoría, erradicando el scroll vertical global infinito.
   - Barra de subpestañas móviles con deslizamiento horizontal táctil nativo sin desborde ni amontonamiento de filas.

9. **Persistencia Criptográfica Garantizada en la Nube y Auditoría DevSecOps (ADR-0009):**
   - **Servicio Centralizado `cloud_sync.service.js`:** Desacopla la sincronización con Supabase Cloud REST API aplicando esperas asíncronas (`await`) que impiden la pérdida de datos cuando las lambdas de Vercel Serverless se congelan al responder al cliente.
   - **Persistencia de 5 Procesos Críticos:** Formalización de beneficiario y credenciales (`passkey_credentials`), llaves públicas FIDO2 WebAuthn, entregas físicas y liquidaciones con resolución de llaves foráneas (`deliveries` / `daily_entitlements`), y vinculación / revocación de tarjetas NFC (`nfc_cards`).
   - **Herramienta de Auditoría en Vivo:** Script automatizado (`npm run verify:cloud`) que ejecuta una inspección integral de los 6 procesos de integridad contra la nube en menos de 6 segundos.

10. **Formalización Multi-Dispositivo de Beneficiarios y Recuperación de Contraseñas:**
    - Carga de fotografía del beneficiario con compatibilidad total en múltiples teléfonos: selección desde cámara web en vivo (`capture="user"`) o carga de archivo desde la galería de fotos del dispositivo.
    - Asignación de contraseña institucional con hashing seguro (`scrypt`/PBKDF2) y vinculación criptográfica del dispositivo (`bound_device_id`).
    - **Autoservicio de Recuperación:** Flujo en dos pasos con verificación de Cédula y datos de nómina (correo o teléfono institucional), emisión de token HMAC temporal y reasignación de contraseña sin intervención manual de soporte técnico.
    - **Gestión Administrativa:** Panel para directores que permite cambiar contraseñas manualmente o restablecer funcionarios al estatus `precargado` para forzar su enrolamiento inicial.

11. **Blindaje de Ciberseguridad y Directivas de APIs (Trail of Bits & OWASP API Top 10):**
    - **CORS Restrictivo:** Lista blanca estricta (`https://sgbt-bice.vercel.app`, dominios Vercel institucionales autorizados y localhost en dev).
    - **Prevención de DoS:** Límite estándar de 2MB para JSON general, y 50MB exclusivo para importación masiva de nómina y subida de fotografías.
    - **Prevención BOLA/IDOR:** Asociación automática de credenciales al ID de sesión autenticado (`req.user.id`) en el enrolamiento de Passkeys FIDO2 y protección RBAC en logs de auditoría (`/api/v1/system/logs/*`).
    - **Secretos Dinámicos:** Generación criptográfica aleatoria de 256 bits en memoria para contingencias en producción, erradicando claves predeterminadas hardcodeadas.
    - **Cumplimiento RFC 6585 & RFC 7807:** Cabecera `Retry-After` ante bloqueos `HTTP 429` y ofuscación de mensajes de error internos 500 en producción.

12. **Árbol Merkle Criptográfico de Auditoría Ministerial (RFC 6962 / SHA-256):**
    - Sellado inmutable de toda la jornada mediante un Árbol Merkle binario balanceado de 14 capas.
    - Pruebas de inclusión logarítmicas $O(\log_2 N)$ de 13 hashes (~416 bytes) verificables en menos de 110 µs.
    - Verificación pública e individual mediante `/api/v1/admin/audit/merkle-verify` y emisión de Acta Oficial de Despacho con sello digital SHA-256.

13. **Auto-Verificación Criptográfica para el Beneficiario:**
    - Endpoint autenticado `GET /api/v1/auth/my-merkle-proof` para que cualquier funcionario o jubilado verifique la inmutabilidad de su entrega desde su teléfono móvil.
    - Ventana modal con certificado criptográfico, comprobación de integridad y copia de la prueba matemática al portapapeles.

14. **Web Push Notifications en Segundo Plano con VAPID (RFC 8291 / RFC 8292):**
    - Alertas push directas al dispositivo mediante el Service Worker (`public/sw.js`), operativas con la pantalla apagada o el navegador cerrado.
    - Subscripciones persistentes en tabla relacional `push_subscriptions` y generación asimétrica de claves ECDSA P-256 (prime256v1).
    - Endpoints de suscripción `/api/v1/notifications/vapid-public-key` y `/api/v1/notifications/subscribe`.

15. **Pipeline Automatizado de Empaquetado APK Android Nativo (TWA):**
    - Comando CLI automatizado `npm run apk:package` (`scripts/package_android_apk.js`).
    - Validación pre-flight de los 6 artefactos obligatorios (Manifest, AssetLinks, TWA Manifest, Keystore, Iconos).
    - Generación automática del andamiaje nativo Android Gradle en `build/android/` con scripts de compilación para Windows y Linux.

16. **Optimizaciones de Rendimiento Extremo con Autoresearch:**
    - **Delta Daily-Packs:** Reducción de transferencia en red de 1.15 MB a 2.56 KB (-99.78%) con micro-caché in-memory a 0.07 ms (197x de aceleración) y soporte de cabecera `ETag` (HTTP 304).
    - **Cold-Start Instantáneo de Supabase Cloud:** Desacoplamiento del arranque local en SQLite (< 28 ms vs 2,281 ms, 88x de mejora) con hidratación streaming en segundo plano y transacciones atómicas batch.

---

## 🧱 Estructura del Proyecto (Arquitectura Modular v5.0)

```text
├── backend/
│   ├── controllers/            # Controladores desacoplados por dominio
│   │   ├── admin.controller.js
│   │   ├── auth.controller.js  # Login, formalización, passkeys, recuperación de claves
│   │   ├── campaigns.controller.js
│   │   ├── deliveries_report.controller.js
│   │   ├── department_batch.controller.js
│   │   ├── dispatch.controller.js
│   │   ├── manual_dispatch.controller.js
│   │   ├── ministerial_audit.controller.js
│   │   ├── payroll.controller.js
│   │   ├── sync.controller.js
│   │   ├── system.controller.js
│   │   └── tenant.controller.js
│   ├── middleware/             # Middleware (Seguridad, Idempotencia, RFC 7807, Auth, Auditoría)
│   │   ├── audit_logger.middleware.js # Registro universal de actividad y trazas
│   │   ├── auth.middleware.js         # Verificación criptográfica JWT, RBAC y Device-Bound
│   │   ├── error.middleware.js        # Formato Problem Details RFC 7807 y ofuscación 500
│   │   ├── idempotency.middleware.js  # Control de duplicados por Idempotency-Key
│   │   ├── security.middleware.js     # HSTS, CSP, XSS Sanitizer, Rate Limiting y Lockout
│   │   └── validator.middleware.js    # Validación estricta de esquemas y DTOs
│   ├── routes/                 # Rutas RESTful bajo prefijo canónico /api/v1/
│   ├── services/               # Capa de Servicios Especializados
│   │   ├── audit.service.js      # Árbol Merkle RFC 6962, pruebas de inclusión O(log N) y Actas
│   │   ├── cloud_sync.service.js # Sincronización criptográfica garantizada hacia Supabase Cloud
│   │   ├── logger.service.js     # Bitácora relacional de auditoría y Server-Sent Events
│   │   ├── mfa.service.js        # Autenticación Multifactor TOTP RFC 6238 y Backup Codes
│   │   ├── passkey.service.js    # Criptografía FIDO2 / WebAuthn ECDSA P-256
│   │   ├── push.service.js       # Notificaciones Web Push VAPID RFC 8291/8292 en segundo plano
│   │   ├── session.service.js    # Gestión de sesiones persistentes y amarre de dispositivo
│   │   ├── sse.service.js        # Server-Sent Events en tiempo real
│   │   └── supervisor.service.js # Firmas HMAC-SHA256 y QR diario de fiscalización
│   ├── crypto-utils.js         # Utilidades ECDSA P-256, Nonce, Tokens HMAC y WebAuthn
│   ├── db.js                   # Abstracción híbrida SQLite / Supabase Cloud con hidratación
│   ├── migrator.js             # Motor declarativo de migraciones versionadas
│   ├── server.js               # Bootstrap modular del servidor Express con CORS y HTTPS
│   └── test_e2e_suite.js       # Suite E2E de arquitectura (26/26 pruebas)
│
├── benchmarks/                 # Arnés de Optimización Continua (Autoresearch)
│   ├── benchmark_daily_pack_sync.js     # Delta Daily-Packs y micro-caché in-memory
│   ├── benchmark_merkle_audit.js        # Árbol Merkle RFC 6962 y pruebas O(log N)
│   ├── benchmark_offline_dispatch.js    # Rendimiento de despacho local offline
│   ├── benchmark_supabase_cold_start.js # Cold-start instantáneo (<28ms)
│   └── benchmark_use_cases_audit.js     # Auditoría de 26/26 casos de uso (100% PASS)
│
├── scripts/                    # Scripts de Mantenimiento y Empaquetado
│   ├── package_android_apk.js  # Pipeline automatizado de empaquetado APK Android (TWA)
│   ├── validate_twa.js         # Validador de artefactos y conformidad TWA
│   └── seed_jornadas_historico.js # Semillero institucional de jornadas
│
├── docs/
│   ├── adr/                    # Architecture Decision Records (0001 - 0010)
│   ├── openapi.yaml            # Contrato OpenAPI 3.1 oficial de la API REST
│   └── INFORME_AUTORESEARCH_OPTIMIZACIONES.md # Informe técnico maestro de optimizaciones
│
├── migrations/                 # Scripts SQL de migración declarativa
│   ├── 001_initial_schema.sql
│   ├── 002_add_extended_combo_fields.sql
│   └── 003_add_idempotency_keys.sql
│
├── tests/                      # Batería de 10 suites automatizadas (100% Pasadas)
│   ├── contract_openapi.test.js        # Validación contra contrato OpenAPI 3.1 (9/9)
│   ├── e2e_offline_flow.test.js        # Flujo Offline, Idempotencia y RFC 7807 (9/9)
│   ├── edge_cases_dispatch.test.js     # Casos límite y resiliencia en almacén (10/10)
│   ├── evolution_features.test.js      # Merkle Beneficiario, Web Push VAPID y Pipeline APK (6/6)
│   ├── sdd_remediation_spec.test.js    # Especificación de remediación SDD (8/8)
│   ├── security_auth_bypass.test.js    # Suite Trail of Bits: Auth Bypass y Segregación (9/9)
│   ├── security_hardening_mfa.test.js  # DevSecOps, OWASP, TOTP y Lockout (6/6)
│   ├── user_password_management.test.js# Gestión y recuperación de contraseñas (8/8)
│   └── wcag_dark_mode_contrast.test.js # Accesibilidad WCAG 2.2 AA y contraste UI (8/8)
│
├── public/
│   ├── css/styles.css          # Design System responsivo sin transition: all, contención modal y sticky tables
│   ├── js/core/                # Motor de audio/háptica, estado reactivo, API y toast
│   ├── js/modules/             # Módulos de beneficiario, despacho, admin, nómina y auditoría
│   ├── templates/modals.html   # 16 ventanas modales accesibles (.modal-close-btn) y responsivas
│   ├── sw.js                   # Service Worker Offline-First & Web Push Listener (Caché PWA)
│   └── manifest.json           # Manifiesto PWA instalable
│
├── DOCUMENTACION_CAMBIOS_ARQUITECTURA_V3.md # Informe técnico maestro de cambios
└── package.json
```

---

## 🚀 Puesta en Marcha Local

### Prerrequisitos
- **Node.js:** Versión 20.x o 22.x LTS.
- **Git**

### Instalación y Ejecución
```bash
# 1. Clonar el repositorio
git clone https://github.com/cazadorccs/sgbt.git
cd sgbt

# 2. Instalar dependencias
npm install

# 3. Ejecutar o verificar migraciones de base de datos
npm run db:migrate

# 4. Iniciar el servidor
npm start
```

La aplicación estará disponible inmediatamente en `http://localhost:3000`.  
La documentación interactiva de la API está disponible en `http://localhost:3000/docs`.

---

## 🗺️ Diagramas de Arquitectura e Ingeniería (Archify)

El proyecto incluye diagramas visuales e interactivos elaborados bajo el estándar **Archify v3.2.0** (`showcase quality`) agrupados en el directorio [`docs/diagrams/`](docs/diagrams/README.md):

1. **[Diagrama de Arquitectura C4 (Nivel 2 - Contenedores)](docs/diagrams/c4-containers.html):** Mapeo de actores institucionales, capas PWA, servicios backend (Cripto, Idempotencia, SSE) y persistencia híbrida SQLite + Supabase.
2. **[Diagrama de Secuencia y User Journey](docs/diagrams/user-journey-sequence.html):** Flujo de retiro cronológico paso a paso con Passkeys FIDO2, Secure Enclave, escaneo de QR dinámico y feedback sensorial háptico.
3. **[Diagrama de Modelo de Datos Relacional (ERD)](docs/diagrams/modelo-datos-erd.html):** Estructura relacional SQLite / Supabase dividida en 3 dominios funcionales (Identidad, Beneficios y Auditoría) con integridad referencial e idempotencia.

---

## 🧪 Ejecución de Pruebas Automatizadas y Auditoría Cloud

El proyecto cuenta con suites de pruebas automatizadas y auditoría de persistencia que verifican el 100% de la funcionalidad del sistema:

```bash
# 1. Ejecutar las 10 suites completas de pruebas (47/47 pruebas en verde - 100% éxito)
npm test

# 2. Auditar en vivo la persistencia criptográfica en Supabase Cloud (6/6 procesos)
npm run verify:cloud

# 3. Validar y empaquetar el proyecto APK Android Nativo (TWA)
npm run apk:package

# 4. Ejecutar la suite de nuevas funcionalidades (Merkle, Web Push, APK)
npm run test:evolution

# 5. Ejecutar la suite de flujo offline, idempotencia y migraciones (9 pruebas)
npm run test:offline

# 6. Ejecutar la auditoría programática exhaustiva de Casos de Uso (26/26 PASS)
node benchmarks/benchmark_use_cases_audit.js
```

---

## 👥 Perfiles de Prueba Pre-cargados (Demostración)

| Rol Institucional | Funcionario | Cédula | Modo de Verificación |
| :--- | :--- | :---: | :--- |
| **Administrador General** | Msc. Sahib A Franco | `13537582` | Portal Web / Gobernanza |
| **Beneficiario Activo** | Carlos Eduardo Mendoza | `V-18456123` | Passkeys Biométricas (FIDO2) |
| **Adulto Mayor (Jubilado)** | Hilda Teresa Domínguez | `V-06894321` | Tarjeta de Proximidad NFC |
| **Operador de Despacho** | Miguel Ángel Torres | `V-14111222` | Mesa de Despacho / Escáner |
| **Supervisor de Jornada** | Claudia Patricia Vega | `V-13222333` | QR Diario / Firma Biométrica |

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Desarrollado con soberanía tecnológica para el **Ministerio del Poder Popular para la Comunicación y la Información (MIPPCI)**.
