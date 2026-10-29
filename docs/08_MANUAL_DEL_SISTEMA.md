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
│   ├── controllers/          <-- Controladores de dominio desacoplados (auth, dispatch, admin, etc.)
│   ├── middleware/           <-- Middleware (seguridad, idempotencia, RFC 7807, auth)
│   ├── routes/               <-- Rutas RESTful bajo prefijo /api/v1/
│   ├── services/             <-- Capa de Servicios Especializados
│   │   ├── cloud_sync.service.js <-- Persistencia criptográfica asíncrona garantizada en Supabase
│   │   ├── passkey.service.js    <-- Criptografía FIDO2 / WebAuthn ECDSA P-256
│   │   ├── sse.service.js        <-- Difusión Server-Sent Events en tiempo real
│   │   └── supervisor.service.js <-- QR diario y firmas HMAC-SHA256
│   ├── crypto-utils.js       <-- Utilidades de generación de claves y firma ECDSA P-256
│   ├── db.js                 <-- Conector relacional SQLite / WASM con hidratación cloud
│   ├── migrator.js           <-- Motor de migraciones con checksums SHA-256
│   ├── server.js             <-- Bootstrap modular del servidor Express
│   ├── test_e2e_suite.js     <-- Suite E2E de arquitectura (26 pruebas)
│   └── verify_cloud_persistence.js <-- Verificación en vivo de persistencia cloud (6 procesos)
├── public/                   <-- Capa de presentación (Frontend SPA/PWA)
│   ├── css/styles.css        <-- Design System sin transition: all y contención modal
│   ├── js/core/              <-- Motor de audio/háptica, estado reactivo, API y toast
│   ├── js/modules/           <-- Módulos de beneficiario, despacho, admin y nómina
│   ├── templates/modals.html <-- 15 ventanas modales accesibles y responsivas
│   ├── sw.js                 <-- Service Worker Offline-First (Caché PWA)
│   └── manifest.json         <-- Manifiesto PWA instalable
├── migrations/               <-- Scripts SQL versionados declarativos (001, 002, 003)
├── docs/                     <-- Biblioteca documental formal y manuales
│   ├── adr/                  <-- 9 Decisiones de Arquitectura Formales (ADR 0001 - 0009)
│   ├── openapi.yaml          <-- Contrato REST completo en OpenAPI 3.1
│   └── diagrams/             <-- Diagramas autónomos interactivos de Archify
├── tests/                    <-- Suites E2E offline, idempotencia y seguridad
└── package.json              <-- Manifiesto de scripts y dependencias
```

---

### 3. Parámetros de Configuración del Sistema (`.env`)

| Variable | Tipo | Obligatorio | Descripción | Ejemplo |
| :--- | :--- | :---: | :--- | :--- |
| `PORT` | Número | No | Puerto de escucha HTTP del servidor local. | `3000` |
| `NODE_ENV` | Texto | No | Entorno de ejecución (`development` o `production`). | `production` |
| `SUPABASE_URL` | URL | Sí | Dirección del proyecto en Supabase Cloud. | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | JWT | Sí | Clave anónima pública de Supabase. | `eyJhbGci...` |
| `SUPABASE_SERVICE_KEY` | JWT | Sí | Clave con privilegios de servicio (Service Role). | `eyJhbGci...` |
| `ADMIN_ACCESS_SECRET` | Texto | Sí | PIN / Clave secreta para el acceso administrativo RBAC. | `admin1234` |
| `JWT_SECRET` | Texto | Sí | Semilla secreta para la emisión de tokens de sesión. | `clave-secreta-institucional-mippci` |

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
