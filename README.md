# SGBT - Plataforma de Bienestar Alimentario Institucional
### Sistema de Despacho de Víveres y Combos Proteicos con Passkeys FIDO2 y Arquitectura Offline-First (MIPPCI)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20%20%7C%20v22-green.svg)](https://nodejs.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20v2.5-brightgreen.svg)]()
[![E2E Tests](https://img.shields.io/badge/E2E%20Tests-17%2F17%20Passed-success.svg)]()
[![Security](https://img.shields.io/badge/Security-FIDO2%20%2F%20ECDSA%20P--256-blueviolet.svg)]()

---

## 🏛️ Descripción General

El **Sistema de Gestión de Bienestar y Transferencias (SGBT)** es una plataforma tecnológica institucional diseñada para la gestión, auditoría y entrega automatizada de beneficios alimenticios (Bolsas de Víveres Secos, Combos Proteicos en Cadena de Frío, Útiles Escolares y Combos Especiales) a trabajadores activos, contratados, jubilados y pensionados del sector público.

La plataforma resuelve el desafío crítico de la **operación en sótanos, almacenes y depósitos sin cobertura celular o conexión a Internet**, mediante una arquitectura estricta **Offline-First**, validación criptográfica en hardware seguro (**Passkeys FIDO2 / WebAuthn**) y reconciliación asíncrona garantizada con prevención absoluta de duplicados (`idx_unique_daily_claim`).

---

## ✨ Características Principales

1. **Autenticación Biométrica FIDO2 / Passkeys:**
   - Enrolamiento en hardware seguro (Apple Secure Enclave, Android StrongBox / Keystore).
   - Generación de códigos QR temporales firmados con **ECDSA P-256** (vigencia de 180 segundos) que impiden capturas de pantalla o transferencias indebidas.
   - Activación instantánea en **0 ms** sin necesidad de recargar la página.

2. **Arquitectura Offline-First con Doble Motor:**
   - **On-Premise / Servidores Dedicados:** Motor de alto rendimiento `better-sqlite3` con precompilación de sentencias en memoria y migración directa a PostgreSQL 15+.
   - **Serverless / Cloud:** Motor WebAssembly `sql.js` compilado de C/C++ a WASM para lambdas efímeras (Vercel) con réplica opcional hacia Supabase REST.

3. **Mesa de Despacho para Operadores de Almacén:**
   - Escáner multi-cámara en vivo (`Html5Qrcode`) con conmutación dinámica de lentes.
   - Cola de sincronización local (IndexedDB) para acumular despachos sin internet y enviarlos en bloque al restablecer la conexión.
   - Protocolo de contingencia para adultos mayores sin smartphone mediante tarjetas de proximidad NFC y firma biométrica supervisada de Gestión Humana.

4. **Portal de Gobernanza y Administración (B2G Multi-Ente):**
   - Personalización completa de marca (nombre institucional, acrónimo, logotipo y paleta cromática corporativa).
   - Asistente de configuración inicial (Setup Wizard de 5 Pasos).
   - Ingesta masiva de nómina mediante archivos CSV con validación de esquema.
   - Consola de auditoría logística con cálculo automático del tonelaje métrico distribuido.
   - Sistema de contingencia con descarga obligatoria de snapshot preventivo JSON antes de cualquier puesta a cero.

---

## 🧱 Estructura del Proyecto (Arquitectura Modular v2.5)

```text
├── backend/
│   ├── controllers/            # Controladores desacoplados por dominio
│   │   ├── admin.controller.js
│   │   ├── auth.controller.js
│   │   ├── campaigns.controller.js
│   │   ├── notifications.controller.js
│   │   ├── payroll.controller.js
│   │   ├── sync.controller.js
│   │   ├── system.controller.js
│   │   └── tenant.controller.js
│   ├── middleware/             # Middleware global de captura de errores
│   │   └── error.middleware.js
│   ├── routes/                 # Rutas RESTful bajo prefijo /api/v1/
│   │   ├── admin.routes.js
│   │   ├── auth.routes.js
│   │   ├── campaigns.routes.js
│   │   ├── notifications.routes.js
│   │   ├── payroll.routes.js
│   │   ├── sync.routes.js
│   │   ├── system.routes.js
│   │   ├── tenant.routes.js
│   │   └── index.js
│   ├── crypto-utils.js         # Utilidades ECDSA P-256, Nonce y WebAuthn
│   ├── db.js                   # Abstracción híbrida SQLite / Supabase
│   ├── server.js               # Bootstrap minimalista del servidor Express (67 líneas)
│   └── test_e2e_suite.js       # Suite automatizada de pruebas integrales E2E (17/17 tests)
│
├── public/
│   ├── css/
│   │   └── styles.css          # Design System institucional (Vanilla CSS)
│   ├── js/
│   │   ├── core/               # Núcleo de la aplicación
│   │   │   ├── api.js          # Wrapper de transporte HTTP tipado
│   │   │   ├── audio.js        # Síntesis Web Audio API para almacén
│   │   │   ├── state.js        # Event Bus reactivo centralizado (window.STATE)
│   │   │   ├── templates.js    # Cargador asíncrono de modales
│   │   │   └── toast.js        # Sistema de notificaciones no bloqueantes
│   │   ├── modules/            # Módulos funcionales desacoplados
│   │   │   ├── admin.js
│   │   │   ├── auth.js
│   │   │   ├── beneficiary.js
│   │   │   ├── combos.js
│   │   │   ├── distributor.js
│   │   │   ├── notifications.js
│   │   │   ├── payroll.js
│   │   │   ├── settings.js
│   │   │   └── share.js
│   │   ├── app.js              # Orquestador ligero de arranque (265 líneas)
│   │   ├── html5-qrcode.min.js # Motor de escaneo por cámara
│   │   └── qrcode.js           # Generador de códigos QR RFC
│   ├── templates/
│   │   └── modals.html         # 11 ventanas modales desacopladas del HTML inicial
│   ├── index.html              # Shell HTML ligero (1.854 líneas)
│   ├── sw.js                   # Service Worker Offline-First (Caché v2.6)
│   └── manifest.json           # Manifiesto PWA instalable
│
├── 1. PRD Documento de Requisitos de Producto (PRD).md
├── 2. TRD - Documento de Requisitos Técnicos (TRD).md
├── 3. UI-UX Design Specification.md
├── 4. Appflow - Flujos de Aplicación.md
├── 5. Backend Schema & API Specifications.md
├── 6. Implementation Plan.md
├── 8. Especificación Portal Web de Administración y Gobernanza.md
├── 9. Contrato API REST (Payloads JSON) - Ingesta de Nómina y Sincronización.md
└── package.json
```

---

## 🚀 Puesta en Marcha Local

### Prerrequisitos
- **Node.js:** Versión 20.x o 22.x LTS instalada.
- **Git**

### Instalación
```bash
# 1. Clonar el repositorio
git clone https://github.com/cazadorccs/sgbt.git
cd sgbt

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno (Opcional si usa SQLite local)
cp .env.example .env

# 4. Iniciar el servidor de desarrollo
npm start
```

La aplicación estará disponible inmediatamente en `http://localhost:3000`.

---

## 🧪 Ejecución de Pruebas Automatizadas (E2E)

Para ejecutar la suite completa de pruebas de extremo a extremo y verificar la integridad de todos los endpoints, criptografía y sincronización offline:

```bash
node backend/test_e2e_suite.js
```

**Resultado esperado:**
```text
================================================================
🚀 INICIANDO SUITE DE PRUEBAS E2E Y ARQUITECTURA (FASE 4)
================================================================
  ✅ E2E-01: Carga de Shell HTML y Contenedor de Modales (24ms)
  ✅ E2E-02: Carga de Plantilla Externa de Modales (/templates/modals.html) (2ms)
  ✅ E2E-03: Service Worker Manifest y Versión de Caché v2.6 (1ms)
  ✅ E2E-04: Estado del Sistema y Motor de Base de Datos (321ms)
  ✅ E2E-05: Configuración de Marca y Tenant (B2G) (3ms)
  ✅ E2E-06: Verificación y Login de Trabajador Beneficiario (1ms)
  ✅ E2E-07: Login de Administrador Institucional (2ms)
  ✅ E2E-08: Desafío Criptográfico Passkey (Register Challenge) (1ms)
  ✅ E2E-09: Expediente Digital de Seguridad del Trabajador (3ms)
  ✅ E2E-10: Descarga de Paquete Diario Criptográfico (Daily Pack) (2ms)
  ✅ E2E-11: Generación de QR Diario del Supervisor (1ms)
  ✅ E2E-12: Catálogo de Combos y Beneficios Institucionales (1ms)
  ✅ E2E-13: Puntos de Distribución / Sedes Físicas (2ms)
  ✅ E2E-14: Campañas / Jornadas de Despacho Planificadas (1ms)
  ✅ E2E-15: Avisos y Notificaciones del Sistema (1ms)
  ✅ E2E-16: Sincronización Batch de Despachos Offline (2ms)
  ✅ E2E-17: Estadísticas de Auditoría y KPIs de Gestión (1ms)
================================================================
📊 RESULTADO FINAL: 17/17 PRUEBAS EXITOSAS (0 FALLOS)
⏱️ TIEMPO TOTAL DE EJECUCIÓN: 370ms
================================================================
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
