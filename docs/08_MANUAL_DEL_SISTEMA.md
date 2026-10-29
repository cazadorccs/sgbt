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
│   ├── controllers/          <-- Controladores de dominio (payroll, system, etc.)
│   ├── routes/               <-- Definición de endpoints REST agrupados por módulo
│   ├── crypto-utils.js       <-- Utilidades de generación de claves y firma ECDSA P-256
│   ├── db.js                 <-- Conector relacional SQLite / WASM e inicializador DDL
│   ├── supabase.js           <-- Cliente de comunicación con Supabase Cloud
│   ├── sync-to-supabase.js   <-- Script de sincronización masiva hacia la nube
│   └── server.js             <-- Punto de entrada del servidor Express
├── public/                   <-- Capa de presentación (Frontend SPA/PWA)
│   ├── js/
│   │   ├── core/             <-- Estado global, audio feedback y utilidades
│   │   ├── modules/          <-- Controladores de vista (auth, combos, payroll, etc.)
│   │   └── app.js            <-- Inicializador de la interfaz de usuario
│   ├── index.html            <-- Estructura principal de la aplicación web
│   └── styles.css            <-- Sistema de diseño y estilos visuales
├── docs/                     <-- Biblioteca documental formal y manuales
│   ├── openapi.yaml          <-- Contrato REST completo en OpenAPI 3.0
│   └── diagrams/             <-- Diagramas autónomos interactivos de Archify
├── tests/                    <-- Suites de pruebas unitarias y de integración
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
| `JWT_SECRET` | Texto | Sí | Semilla secreta para la emisión de tokens de sesión. | `clave-secreta-institucional-mippci` |

---

### 4. Ciclo de Vida de los Datos de una Jornada

1. **Definición:** El administrador crea la jornada indicando la fecha de vigencia y los combos a incluir (`delivery_campaigns` y `campaign_combos`).
2. **Generación de Asignaciones:** Se emiten los derechos individuales (`daily_entitlements`) en estado `pending` para cada funcionario habilitado.
3. **Despacho Físico:** En el almacén se verifica la credencial o Cédula. El sistema registra la fila en `deliveries`.
4. **Mutación Atómica:** Un disparador de base de datos actualiza inmediatamente el derecho de `pending` a `claimed`.
5. **Cierre y Auditoría:** Al terminar la atención, la jornada pasa a estado `finalizada` y se genera el Acta Digital con sello criptográfico SHA-256.
