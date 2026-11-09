# Manual del Sistema
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Descripción Técnica y Pila Tecnológica

El sistema está construido siguiendo principios de alta densidad funcional, cero dependencias infladas y soberanía tecnológica:
- **Backend:** Node.js con Express modular.
- **Bases de Datos Híbridas:**
  - *Local de alta velocidad:* SQLite nativo con `better-sqlite3` en modo WAL (`Write-Ahead Logging`) para operaciones sub-milisegundo en puntos de despacho.
  - *Respaldo WebAssembly:* Motor `sql.js` (WASM) para compatibilidad sin compilación C++ en entornos tipo contenedor o Serverless.
  - *Nube Ministerial:* Supabase Cloud (PostgreSQL 15+) para consolidación centralizada de nóminas y reportes.
- **Frontend:** Single Page Application (SPA) / Progressive Web App (PWA) construida en JavaScript nativo (Vanilla ES6+), HTML5 semántico y CSS moderno con temas claro/oscuro integrados.
- **Seguridad Criptográfica:** WebAuthn / FIDO2 Level 3, firmas asimétricas ECDSA P-256 (SHA-256), Árbol Merkle RFC 6962 para trazabilidad inmutable, Web Push VAPID (RFC 8291/8292) y RFC 7807 para control de idempotencia.
- **Empaquetado Android Nativo:** Pipeline Trusted Web Activity (TWA) compatible con Bubblewrap CLI y compilación Gradle (`build/android/`).

---

### 2. Estructura del Repositorio de Código

```text
Bolsa/
├── backend/                  <-- Capa de servicios y lógica de negocio
│   ├── controllers/          <-- Controladores de dominio desacoplados (auth, dispatch, admin, system, campaigns, ministerial_audit, notifications, etc.)
│   ├── middleware/           <-- Middleware (seguridad, idempotencia, RFC 7807, auth, audit_logger)
│   ├── routes/               <-- Rutas RESTful bajo prefijo /api/v1/
│   ├── services/             <-- Capa de Servicios Especializados
│   │   ├── audit.service.js      <-- Árbol Merkle RFC 6962, pruebas de inclusión O(log N) y Actas
│   │   ├── cloud_sync.service.js <-- Persistencia criptográfica asíncrona garantizada en Supabase
│   │   ├── logger.service.js     <-- Bitácora relacional de auditoría y Server-Sent Events
│   │   ├── mfa.service.js        <-- Autenticación Multifactor TOTP RFC 6238 y Backup Codes
│   │   ├── passkey.service.js    <-- Criptografía FIDO2 / WebAuthn ECDSA P-256
│   │   ├── push.service.js       <-- Notificaciones Web Push VAPID RFC 8291/8292 en segundo plano
│   │   ├── session.service.js    <-- Gestión de sesiones persistentes y amarre de dispositivo
│   │   ├── sse.service.js        <-- Difusión Server-Sent Events en tiempo real
│   │   └── supervisor.service.js <-- QR diario y firmas HMAC-SHA256
│   ├── crypto-utils.js       <-- Utilidades de generación de claves, tokens HMAC y firma ECDSA P-256
│   ├── db.js                 <-- Conector relacional SQLite / WASM con hidratación cloud
│   ├── migrator.js           <-- Motor de migraciones con checksums SHA-256
│   ├── server.js             <-- Bootstrap modular del servidor Express con CORS y HTTPS
│   └── test_e2e_suite.js     <-- Suite E2E de arquitectura (26 pruebas)
├── benchmarks/               <-- Arnés de optimización y pruebas de estrés continuas
│   ├── benchmark_daily_pack_sync.js     <-- Delta Daily-Packs y micro-caché (0.07ms)
│   ├── benchmark_merkle_audit.js        <-- Construcción de Árbol Merkle y pruebas logarítmicas
│   ├── benchmark_offline_dispatch.js    <-- Despacho transaccional offline
│   ├── benchmark_supabase_cold_start.js <-- Cold-start ultrarrápido (<28ms)
│   └── benchmark_use_cases_audit.js     <-- Auditoría integral de los 26 casos de uso (100% PASS)
├── scripts/                  <-- Automatización operativa y empaquetado
│   ├── package_android_apk.js <-- Pipeline automatizado de empaquetado APK Android (TWA)
│   ├── validate_twa.js        <-- Validador de conformidad TWA
│   └── seed_jornadas_historico.js <-- Datos históricos de prueba
├── public/                   <-- Capa de presentación (Frontend SPA/PWA)
│   ├── css/styles.css        <-- Design System sin transition: all, contención modal y sticky tables
│   ├── js/core/              <-- Motor de audio/háptica, estado reactivo, API y toast
│   ├── js/modules/           <-- Módulos de beneficiario, despacho, admin, nómina y auditoría
│   ├── templates/modals.html <-- 16 ventanas modales accesibles y responsivas
│   ├── sw.js                 <-- Service Worker Offline-First & Web Push Listener (Caché PWA)
│   └── manifest.json         <-- Manifiesto PWA instalable
├── migrations/               <-- Scripts SQL versionados declarativos (001, 002, 003)
├── docs/                     <-- Biblioteca documental formal y manuales
│   ├── adr/                  <-- 10 Decisiones de Arquitectura Formales (ADR 0001 - 0010)
│   ├── openapi.yaml          <-- Contrato REST completo en OpenAPI 3.1
│   └── diagrams/             <-- Diagramas autónomos interactivos de Archify
├── tests/                    <-- Batería completa de 10 suites automatizadas (100% pasadas)
└── package.json              <-- Manifiesto de scripts y dependencias
```

---

### 3. Parámetros de Configuración del Sistema (`.env`)

| Variable | Tipo | Obligatorio | Descripción | Ejemplo |
| :--- | :--- | :---: | :--- | :--- |
| `PORT` | Número | No | Puerto de escucha HTTP del servidor local. | `3000` |
| `NODE_ENV` | Texto | No | Entorno de ejecución (`development`, `test` o `production`). | `production` |
| `APP_URL` | URL | No | URL pública canónica autorizada para CORS. | `https://sgbt-bice.vercel.app` |
| `SUPABASE_URL` | URL | Sí | Dirección del proyecto en Supabase Cloud. | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | JWT | Sí | Clave anónima pública de Supabase. | `eyJhbGci...` |
| `SUPABASE_SERVICE_KEY` | JWT | Sí | Clave con privilegios de servicio (Service Role). | `eyJhbGci...` |
| `ADMIN_ACCESS_SECRET` | Texto | Sí | PIN de seguridad administrativo exclusivo para `/coseg`. | `0578` (o secreto de producción) |
| `SESSION_JWT_SECRET` | Texto | Sí | Secreto para firma de tokens JWT de sesión (mínimo 32 caracteres). | `clave-secreta-institucional-mippci-2026` |
| `MAGIC_LINK_SECRET` | Texto | No | Secreto para tokens temporales de enrolamiento. | `secreto-magic-link-2026` |
| `DELEGATION_SECRET` | Texto | No | Secreto para tokens de delegación de supervisores. | `secreto-delegacion-supervisores-2026` |
| `VAPID_PUBLIC_KEY` | Base64URL | No | Clave pública ECDSA P-256 para Web Push (auto-generada si se omite). | `BMQ6_w2vN...` |
| `VAPID_PRIVATE_KEY` | Base64URL | No | Clave privada ECDSA P-256 para firma de alertas Web Push. | `SGBT_PRIV...` |

---

### 4. Ciclo de Vida de los Datos de una Jornada

1. **Definición:** El administrador crea la jornada indicando la fecha de vigencia y los combos a incluir (`delivery_campaigns` y `campaign_combos`).
2. **Generación de Asignaciones:** Se emiten los derechos individuales (`daily_entitlements`) en estado `pending` para cada funcionario habilitado.
3. **Despacho Físico:** En el almacén se verifica la credencial o Cédula. El sistema registra la fila en `deliveries`.
4. **Mutación Atómica y Respaldo Cloud:** Se actualiza inmediatamente el derecho de `pending` a `claimed` y se consolida con `await` en Supabase Cloud vía `cloud_sync.service.js`.
5. **Cierre y Auditoría:** Al terminar la atención, la jornada pasa a estado `finalizada`, se construye el Árbol Merkle (RFC 6962) y se emite el Acta Oficial Ministerial con sello SHA-256.

---

### 5. Protocolos de Verificación y Calidad

El sistema cuenta con comandos de prueba continua que deben ejecutarse ante cualquier despliegue o cambio:
```bash
# 1. Verificación de sintaxis de archivos JavaScript
node -c backend/server.js backend/db.js backend/services/cloud_sync.service.js

# 2. Suite completa de 10 suites de pruebas automatizadas (47 pruebas, 100% éxito)
npm test

# 3. Auditoría de persistencia criptográfica en Supabase Cloud
npm run verify:cloud

# 4. Empaquetado y validación del proyecto APK Android (TWA)
npm run apk:package

# 5. Suite de nuevas funcionalidades (Merkle, Web Push, APK)
npm run test:evolution
```
