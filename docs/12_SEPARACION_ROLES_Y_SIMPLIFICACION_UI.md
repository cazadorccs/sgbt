# Especificación Técnica y Arquitectura de Simplificación de Vistas por Rol
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI
**Fecha de Publicación:** 1 de Noviembre de 2026  
**Área Responsable:** Dirección de Tecnología y Sistemas / Auditoría de Arquitectura de Software & UX  
**Referencia de Commits:** `2f66d04`, `981e530`  
**Producción:** `https://sgbt-bice.vercel.app/` | **Repositorio:** `https://github.com/cazadorccs/sgbt.git`

---

## 1. Resumen Ejecutivo y Diagnóstico

Durante las iteraciones de desarrollo acelerado con inteligencia artificial (*vibecoding*), la interfaz gráfica acumuló deuda técnica visual y de segregación de responsabilidades:
- **Sobrecarga de la Mesa de Despacho:** La vista operativa del despachador (`view-distributor`) contenía botones de prueba de desarrollador (`⚡ Simular Escaneo QR`, `📁 Cargar Foto / Archivo QR`, `📋 Pegar Código Manual`, `💳 Tarjeta NFC Física`), herramientas de diagnóstico (`📋 Logs`), casillas de verificación editables que permitían a un despachador alterar o desmarcar combos asignados por nómina, y un módulo completo de emisión de contingencias perteneciente exclusivamente al rol de **Supervisor**.
- **Saturación en Vista Beneficiario:** La pantalla móvil del trabajador (`view-worker`) mostraba selectores de suplantación/simulación de beneficiarios, paneles explicativos de texto redundante y botones de configuración de seguridad secundarios que distraían del objetivo central: **retirar su beneficio en mesa de forma rápida**.
- **Falta de Segregación RBAC en la UI:** Los permisos de contingencia y supervisión no contaban con un canal exclusivo, lo que provocaba cuellos de botella en la fila física de entrega en el almacén sótano.

Para subsanar esto de raíz, se aplicaron las directrices de las skills especializadas:
- **`design-taste-frontend` (`taste-skill` / Anti-Slop Directive `references/app-screens.md`):** Erradicación de toggles de prueba dejados en producción, controles de desarrollador y sobre-ornamentación.
- **`ui-ux-pro-max`:** Ergonomía móvil, áreas táctiles seguras (mínimo 44×44px), principio de **divulgación progresiva** (*progressive disclosure*) y **segregación estricta de roles**.

---

## 2. Matriz de Segregación de Roles (4 Vistas Esenciales)

El sistema ahora garantiza que cada usuario interactúe únicamente con las herramientas indispensables para su misión:

| Rol | Objetivo Único | Elementos Visibles Permitidos | Elementos Eliminados / Restringidos |
| :--- | :--- | :--- | :--- |
| **1. Beneficiario** | **Retirar su Combo** | • Carnet digital (Nombre, Cédula, Foto)<br>• Cuota asignada (Víveres / Proteína)<br>• QR dinámico con temporizador<br>• Comprobante verde de entrega | ❌ Selector "Simular Beneficiario"<br>❌ Paneles técnicos explicativos<br>❌ Opciones complejas de 2FA en pantalla principal |
| **2. Mesa de Despacho** | **Escanear y Despachar** | • Visor de escáner (Cámara trasera con HUD)<br>• Resumen de Combos Asignados (**Solo Lectura**)<br>• Botón rápido de retiro delegado<br>• Contador de entregas en mesa hoy | ❌ Botón `📋 Logs`<br>❌ Botones de simulación, carga de fotos o pegar texto<br>❌ Checkboxes para alterar combos asignados<br>❌ Generador de contingencia de supervisor |
| **3. Supervisor** | **Estación Laptop Dedicada (`/supervisor`)** | • Búsqueda rápida por Cédula (lector o teclado)<br>• Ficha de combos y validación de excepciones<br>• Despacho manual en 1 clic con motivo obligatorio<br>• Incorporación rápida de funcionarios no censados<br>• Monitoreo en vivo de despachos de hoy<br>• Visualización de QR Diario de Supervisor | ❌ Sin acceso a configuración de marca o tenant<br>❌ Sin opciones de reseteo o migración de BD<br>❌ Sin gestión de campañas ni edición de roles<br>❌ Sin menús de gobernanza de Super-Administrador |
| **4. Administrador** | **Gobierno y Control (`/coseg`)** | • Padrón de beneficiarios y nómina<br>• Métricas en vivo (Programados, Despachados, Pendientes)<br>• Auditoría ministerial y visor de logs<br>• Enlace directo a Puesto de Supervisión Laptop | ❌ No incluye botones de simulación operativa |

---

## 3. Puesto Dedicado de Supervisión en Laptop (`/supervisor`)

Para garantizar la fluidez de las jornadas masivas en el almacén sótano del MIPPCI, se implementó una **estación web dedicada para laptops y computadoras de mesa (`/supervisor`)**:

1. **Aislamiento de Privilegios (Least Privilege Principle):**
   - Los supervisores de mesa pueden iniciar sesión con su Cédula y PIN de Supervisor sin requerir perfil de super-administrador.
   - La pantalla está desprovista de pestañas de configuración técnica, edición de bases de datos o cambios en el catálogo maestro.
2. **Ergonomía de Atención Masiva:**
   - Campo de búsqueda de cédula de gran formato compatible con pistolas de lectura de código de barras USB/Bluetooth y teclado numérico.
   - Selección ágil de combos con cálculo automático de peso en kilogramos.
   - Menú desplegable estandarizado con los motivos oficiales de excepción (Adulto Mayor, Falla Biometría, Dispositivo Descargado, etc.).
3. **Incorporación al Vuelo:**
   - Botón directo `➕ Incorporar Funcionario Nuevo al Vuelo` para trabajadores rezagados o de ingreso reciente, permitiendo registrarlos e inmediatamente despachar su beneficio sin detener la fila física.
4. **Ergonomía Visual: Modo Claro Predeterminado y Selector de Tema:**
   - La estación inicia de forma **predeterminada en Modo Claro**, garantizando óptima visibilidad en ambientes de almacén e iluminación de oficina.
   - Dispone de un botón interactivo en la cabecera (`☀️ Modo Claro` / `🌙 Modo Oscuro`) con persistencia local (`localStorage`) que permite alternar a Modo Oscuro en cualquier momento cumpliendo el estándar WCAG 2.2 AA.
4. **Sincronización Transparente con Despachadores Móviles:**
   - Botón `📲 QR Diario Supervisor` para proyectar el token criptográfico del día ante los operadores móviles que requieren override de excepción.

---

## 3. Detalle de Cambios Técnicos por Archivo

### 3.1 `public/index.html`
- **Mesa de Despacho (`view-distributor`):**
  - Se eliminó el botón `btnDistributorOpenLogs` del encabezado operativo.
  - Se simplificó el selector de estación, consolidándolo en un badge claro y no invasivo (`activeStationBadge`).
  - Se transformó la lista de combos (`dispatchChecklist`) en un contenedor informativo de solo lectura con clase `.static-card` y `cursor: default`, impidiendo cualquier manipulación por parte del operador.
  - Se eliminó del cuerpo visual el bloque de `MÓDULO DE CONTINGENCIA Y APROBACIÓN 1-CLIC SUPERVISOR`, conservando únicamente las referencias ocultas requeridas por compatibilidad de eventos.
  - Se simplificó la caja en espera de la cámara (`cameraStandbyBox`), dejando un botón principal prominente: `📹 Iniciar Escáner de Cámara` y un botón secundario para consulta de retiros delegados (`btnOpenDelegationModalTrigger`).
- **Beneficiario (`view-worker`):**
  - Se ocultó por defecto el selector de simulación (`workerSimulatorSelectorContainer`, `display: none`).
  - Se ocultó el panel lateral de explicaciones técnicas (`workerSecurityExplanationPanel`, `display: none`).
  - Se ocultaron botones secundarios de administración de sesiones en el carnet principal para dejar limpio el botón de generación de QR dinámico.
- **Menú de Usuario:**
  - Se agregó el botón `btnOpenSupervisorContingencyModal` ("🛡️ Aprobación de Contingencia"), visible únicamente para usuarios con roles administrativos o de supervisión (`admin`, `director`, `supervisor`).

### 3.2 `public/templates/modals.html`
- **Modal 1 (`supervisorModalBackdrop`):**
  - Se incorporó un buscador directo de beneficiario por Cédula de Identidad (`supervisorContingencyDocInput` y `btnSupervisorSearchContingency`).
  - Permite a los supervisores consultar en tiempo real cualquier funcionario en el padrón, evaluar sus combos pendientes y emitir la autorización biométrica o por clave en un único modal centralizado.

### 3.3 `public/js/modules/distributor.js`
- **Inalterabilidad de Asignaciones:** Se reescribió `window.toggleChecklistItem` como función nula (`no-op`), evitando que los operadores puedan desactivar o excluir rubros de la cuota programada.
- **Renderizado Estático:** `renderAssignedCombosChecklist` ahora inyecta tarjetas estáticas con indicador visual permanente (`✓`) y sin manejadores `onclick` de mutación.
- **Buscador de Contingencia de Supervisión:** Se implementó `doSupervisorSearch` dentro del modal de supervisor, con búsqueda bidireccional local (caché IndexedDB) y remota (Supabase Cloud).

### 3.4 `public/js/modules/auth.js`
- **Visibilidad Estricta de Menús:** Los botones de logs del sistema (`btnOpenSystemLogs`) y contingencia (`btnOpenSupervisorContingencyModal`) se configuran dinámicamente para desplegarse únicamente cuando el usuario posee credenciales de gobernanza (`isAdmin && !isBeneficiaryView`), bloqueando el acceso a operadores de mesa y beneficiarios regulares.

### 3.5 `public/sw.js`
- Se incrementó la versión del caché del Service Worker a `mippci-bienestar-v3.6-streamlined`, forzando la actualización transparente de todos los dispositivos móviles y navegadores que operan offline en el sótano.

---

## 4. Garantía de Calidad y Verificación

1. **Chequeo de Sintaxis Node.js:**
   - `node -c public/js/modules/distributor.js` ➔ Exitoso (Código 0).
   - `node -c public/js/modules/auth.js` ➔ Exitoso (Código 0).
   - `node -c public/sw.js` ➔ Exitoso (Código 0).
2. **Suite de Pruebas Automatizadas:**
   - Ejecución de `npm test` cubriendo las suites E2E, flujo offline, blindaje MFA, casos límite, remediación SDD y contrato OpenAPI 3.1.
   - **Resultado:** **23/23 pruebas pasaron al 100%**.
3. **Despliegue Continuo:**
   - Commit semántico: `981e530` (`refactor(ui): segregar roles y simplificar vistas de despacho, beneficiario y supervisor`).
   - Sincronización automática con `origin main`.
   - Despliegue en producción verificado en Vercel.

