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
- **Seguridad Criptográfica:** WebAuthn / FIDO2 Level 3, firmas asimétricas ECDSA P-256 (SHA-256) y RFC 7807 para control de idempotencia.

---

### 2. Estructura del Repositorio de Código

```text
Bolsa/
├── backend/                  <-- Capa de servicios y lógica de negocio
│   ├── controllers/          <-- Controladores de dominio desacoplados (auth, dispatch, admin, system, campaigns, ministerial_audit, etc.)
│   ├── middleware/           <-- Middleware (seguridad, idempotencia, RFC 7807, auth, audit_logger)
│   ├── routes/               <-- Rutas RESTful bajo prefijo /api/v1/
│   ├── services/             <-- Capa de Servicios Especializados
│   │   ├── cloud_sync.service.js <-- Persistencia criptográfica asíncrona garantizada en Supabase
│   │   ├── logger.service.js     <-- Bitácora relacional de auditoría y Server-Sent Events
│   │   ├── mfa.service.js        <-- Autenticación Multifactor TOTP RFC 6238 y Backup Codes
│   │   ├── passkey.service.js    <-- Criptografía FIDO2 / WebAuthn ECDSA P-256
│   │   ├── session.service.js    <-- Gestión de sesiones persistentes y amarre de dispositivo
│   │   ├── sse.service.js        <-- Difusión Server-Sent Events en tiempo real
│   │   └── supervisor.service.js <-- QR diario y firmas HMAC-SHA256
│   ├── crypto-utils.js       <-- Utilidades de generación de claves, tokens HMAC y firma ECDSA P-256
│   ├── db.js                 <-- Conector relacional SQLite / WASM con hidratación cloud
│   ├── migrator.js           <-- Motor de migraciones con checksums SHA-256
│   ├── server.js             <-- Bootstrap modular del servidor Express con CORS y HTTPS
│   └── test_e2e_suite.js     <-- Suite E2E de arquitectura (26 pruebas)
├── public/                   <-- Capa de presentación (Frontend SPA/PWA)
│   ├── css/styles.css        <-- Design System sin transition: all, contención modal y sticky tables
│   ├── js/core/              <-- Motor de audio/háptica, estado reactivo, API y toast
│   ├── js/modules/           <-- Módulos de beneficiario, despacho, admin, nómina y auditoría
│   ├── templates/modals.html <-- 15 ventanas modales accesibles y responsivas
│   ├── sw.js                 <-- Service Worker Offline-First (Caché PWA)
│   └── manifest.json         <-- Manifiesto PWA instalable
├── migrations/               <-- Scripts SQL versionados declarativos (001, 002, 003)
├── docs/                     <-- Biblioteca documental formal y manuales
│   ├── adr/                  <-- 10 Decisiones de Arquitectura Formales (ADR 0001 - 0010)
│   ├── openapi.yaml          <-- Contrato REST completo en OpenAPI 3.1
│   └── diagrams/             <-- Diagramas autónomos interactivos de Archify
├── tests/                    <-- Batería completa de 9 suites automatizadas (100% pasadas)
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

---

### 4. Ciclo de Vida de los Datos de una Jornada

1. **Definición:** El administrador crea la jornada indicando la fecha de vigencia y los combos a incluir (`delivery_campaigns` y `campaign_combos`).
2. **Generación de Asignaciones:** Se emiten los derechos individuales (`daily_entitlements`) en estado `pending` para cada funcionario habilitado.
3. **Despacho Físico:** En el almacén se verifica la credencial o Cédula. El sistema registra la fila en `deliveries`.
4. **Mutación Atómica y Respaldo Cloud:** Se actualiza inmediatamente el derecho de `pending` a `claimed` y se consolida con `await` en Supabase Cloud vía `cloud_sync.service.js`.
5. **Cierre y Auditoría:** Al terminar la atención, la jornada pasa a estado `finalizada` y se genera el Acta Digital con sello criptográfico SHA-256.

---

### 5. Protocolos de Verificación y Calidad

El sistema cuenta con comandos de prueba continua que deben ejecutarse ante cualquier despliegue o cambio:
```bash
# Verificación de sintaxis de archivos JavaScript
node -c backend/server.js backend/db.js backend/services/cloud_sync.service.js

# Suite completa de pruebas E2E (41 pruebas, 100% pasando)
npm test

# Auditoría de persistencia criptográfica en Supabase Cloud
npm run verify:cloud
```
