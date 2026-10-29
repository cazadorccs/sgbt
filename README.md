# SGBT - Plataforma de Bienestar Alimentario Institucional
### Sistema de Despacho de Víveres y Combos Proteicos con Passkeys FIDO2 y Arquitectura Offline-First (MIPPCI)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20%20%7C%20v22-green.svg)](https://nodejs.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20v3.2-brightgreen.svg)]()
[![E2E Tests](https://img.shields.io/badge/E2E%20Tests-41%2F41%20Passed-success.svg)]()
[![Cloud Audit](https://img.shields.io/badge/Cloud%20Persistence-6%2F6%20Verified-blue.svg)]()
[![OpenAPI](https://img.shields.io/badge/OpenAPI-v3.1.0-orange.svg)](http://localhost:3000/docs)
[![Security](https://img.shields.io/badge/Security-FIDO2%20%2F%20ECDSA%20P--256-blueviolet.svg)]()

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

7. **Doble Modalidad de Login y Control de Acceso RBAC Estricto:**
   - Acceso conmutado en interfaz: **Beneficiarios / Almacén** (ingreso directo a su carnet de beneficiario mediante Cédula) vs. **Administrar Sistema** (exige validación de rol de administración y verificación de clave/PIN de seguridad institucional `ADMIN_ACCESS_SECRET`).
   - Previene que beneficiarios con cédulas registradas en el padrón visualicen el panel de gobernanza sin previa autenticación administrativa secundaria.

8. **Diseño Responsivo, Contención de Modales y Ergonomía de Scroll (ADR-0008):**
   - Contención estricta en 15 ventanas modales con `max-width: min(calc(100vw - 1rem), ...)` y `max-height: min(92vh, 92dvh)`.
   - Cabeceras fijas (`position: sticky; top: -1rem; z-index: 30;`) en modales para que el botón de cerrar y título permanezcan permanentemente visibles al hacer scroll.
   - Contenedores con altura delimitada `.table-scroll-container` (`max-height: clamp(380px, 58vh, 620px)`) y encabezados fijos (`thead th` sticky) para tablas masivas de nómina (1,136 trabajadores) y auditoría, erradicando el scroll vertical global infinito.
   - Barra de subpestañas móviles con deslizamiento horizontal táctil nativo sin desborde ni amontonamiento de filas.

9. **Persistencia Criptográfica Garantizada en la Nube y Auditoría DevSecOps (ADR-0009):**
   - **Servicio Centralizado `cloud_sync.service.js`:** Desacopla la sincronización con Supabase Cloud REST API aplicando esperas asíncronas (`await`) que impiden la pérdida de datos cuando las lambdas de Vercel Serverless se congelan al responder al cliente.
   - **Persistencia de 5 Procesos Críticos:** Formalización de beneficiario y credenciales (`passkey_credentials`), llaves públicas FIDO2 WebAuthn, entregas físicas y liquidaciones con resolución de llaves foráneas (`deliveries` / `daily_entitlements`), y vinculación / revocación de tarjetas NFC (`nfc_cards`).
   - **Herramienta de Auditoría en Vivo:** Script automatizado (`npm run verify:cloud`) que ejecuta una inspección integral de los 6 procesos de integridad contra la nube en menos de 6 segundos.

10. **Formalización Multi-Dispositivo de Beneficiarios:**
    - Carga de fotografía del beneficiario con compatibilidad total en múltiples teléfonos: selección desde cámara web en vivo (`capture="user"`) o carga de archivo desde la galería de fotos del dispositivo.
    - Asignación de contraseña institucional con hashing seguro y vinculación criptográfica del dispositivo (`bound_device_id`), garantizando que al reingresar al sistema el usuario mantenga su sesión formalizada sin volver a solicitar el proceso.

---

## 🧱 Estructura del Proyecto (Arquitectura Modular v3.2)

```text
├── backend/
│   ├── controllers/            # Controladores desacoplados por dominio
│   ├── middleware/             # Middleware (Seguridad, Idempotencia, RFC 7807, Auth)
│   │   ├── auth.middleware.js
│   │   ├── error.middleware.js
│   │   ├── idempotency.middleware.js
│   │   ├── security.middleware.js
│   │   └── validator.middleware.js
│   ├── routes/                 # Rutas RESTful bajo prefijo /api/v1/
│   ├── services/               # Capa de Servicios Especializados
│   │   ├── cloud_sync.service.js # Sincronización criptográfica garantizada hacia Supabase Cloud
│   │   ├── passkey.service.js    # Criptografía FIDO2 / WebAuthn ECDSA P-256
│   │   ├── sse.service.js        # Server-Sent Events en tiempo real
│   │   └── supervisor.service.js # Firmas HMAC-SHA256 y QR diario de fiscalización
│   ├── crypto-utils.js         # Utilidades ECDSA P-256, Nonce y WebAuthn
│   ├── db.js                   # Abstracción híbrida SQLite / Supabase Cloud con hidratación
│   ├── migrator.js             # Motor declarativo de migraciones versionadas
│   ├── server.js               # Bootstrap modular del servidor Express
│   ├── test_e2e_suite.js       # Suite E2E de arquitectura (26/26 pruebas)
│   └── verify_cloud_persistence.js # Script de auditoría DevSecOps de persistencia en la nube
│
├── docs/
│   ├── adr/                    # Architecture Decision Records (0001 - 0009)
│   │   ├── 0001-fido2-passkeys-como-factor-de-identidad.md
│   │   ├── 0002-arquitectura-dual-sqlite-wasm-supabase.md
│   │   ├── 0003-estrategia-revocacion-jwt-cookies-httponly.md
│   │   ├── 0004-feedback-haptico-y-ergonomia-de-almacen.md
│   │   ├── 0005-modularizacion-servicios-backend.md
│   │   ├── 0006-idempotencia-http-y-estandar-rfc-7807.md
│   │   ├── 0007-sistema-declarativo-migraciones-versionadas.md
│   │   ├── 0008-diseno-responsivo-contencion-modales-y-ergonomia-de-scroll.md
│   │   ├── 0009-persistencia-criptografica-en-la-nube-supabase.md
│   │   ├── README.md
│   │   └── template.md
│   └── openapi.yaml            # Contrato OpenAPI 3.1 oficial de la API REST
│
├── migrations/                 # Scripts SQL de migración declarativa
│   ├── 001_initial_schema.sql
│   ├── 002_add_extended_combo_fields.sql
│   └── 003_add_idempotency_keys.sql
│
├── tests/
│   ├── e2e_offline_flow.test.js     # Suite E2E Offline, Idempotencia y RFC 7807 (9/9)
│   └── security_hardening_mfa.test.js # Suite DevSecOps, OWASP, TOTP y Lockout (6/6)
│
├── public/
│   ├── css/styles.css          # Design System responsivo sin transition: all, contención modal y sticky tables
│   ├── js/core/                # Motor de audio/háptica, estado reactivo, API y toast
│   ├── js/modules/             # Módulos de beneficiario, despacho, admin y nómina
│   ├── templates/modals.html   # 15 ventanas modales accesibles (.modal-close-btn) y responsivas
│   ├── sw.js                   # Service Worker Offline-First (Caché PWA)
│   └── manifest.json           # Manifiesto PWA instalable
│
├── DOCUMENTACION_CAMBIOS_ARQUITECTURA_V3.md # Informe técnico maestro de cambios v3.0 y v3.1
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
# 1. Ejecutar todas las suites de pruebas (41/41 pruebas en verde - 100% éxito)
npm test

# 2. Auditar en vivo la persistencia criptográfica en Supabase Cloud (6/6 procesos)
npm run verify:cloud

# 3. Ejecutar únicamente la suite de arquitectura y RBAC (26 pruebas)
node backend/test_e2e_suite.js

# 4. Ejecutar la suite de flujo offline, idempotencia y migraciones (9 pruebas)
npm run test:offline

# 5. Ejecutar la suite de blindaje de seguridad, TOTP y mitigación OWASP (6 pruebas)
node tests/security_hardening_mfa.test.js
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
