Este documento detalla un sistema de entrega de alimentos sin conexión a internet que utiliza identificadores criptográficos seguros (Passkeys) para garantizar un funcionamiento continuo incluso en zonas sin red. El proceso inicia con una descarga matutina de información en el dispositivo del distribuidor, permitiendo que después los beneficiarios validen su identidad de forma local y biométrica usando el hardware de sus propios teléfonos. Una vez confirmada la entrega al instante mediante un código QR, el sistema almacena los registros de manera temporal en una base de datos local hasta que se restablezca la conectividad. Finalmente, al recuperar el acceso a internet, la aplicación sincroniza los datos en lote con el servidor central, el cual evita duplicados mediante validaciones estrictas para mantener la integridad de la información.

Diagrama de Arquitectura: Flujo Offline-First para Entrega de Combos con Passkeys
Este recurso documenta el diagrama de secuencia y la especificación técnica del flujo offline-first para la validación y entrega de combos alimenticios mediante Passkeys (FIDO2/WebAuthn).
Diagrama de Secuencia
┌─────────────────────────┐       ┌─────────────────────────┐       ┌─────────────────────────┐
│     SERVIDORES DE       │       │    APP DISTRIBUIDOR     │       │     APP TRABAJADOR      │
│  INFRAESTRUCTURA / DB   │       │     (Módulo Comedor)    │       │   (Celular Beneficiario)│
└────────────┬────────────┘       └────────────┬────────────┘       └────────────┬────────────┘
             │                                 │                                 │
  [FASE 1]   │ ─── Precarga diaria (JSON) ───► │                                 │
  PRECARGA   │     Descarga Llaves Públicas,   │                                 │
             │     Trabajadores y Entitlements │ (Guarda en SQLite Local)        │
             │                                 │                                 │
             │                                 │ ◄────── Muestra QR Firmado ──── │   [FASE 2]
             │                                 │   Firma con Passkey en hardware │  VALIDACIÓN
             │                                 │   (Secure Enclave/TEE sin red)  │    LOCAL
             │                                 │                                 │
             │                                 │ ── Valida firma con llave ──┐   │
             │                                 │    pública guardada en SQLite│   │
             │                                 │ ◄───────────────────────────┘   │
             │                                 │                                 │
             │                                 │ ── Registra en Sync Queue ───┐  │   [FASE 3]
             │                                 │    Genera UUIDv4 e sets      │  │  COLA DIFERIDA
             │                                 │    is_offline_sync = true    │  │ (SYNC QUEUE)
             │                                 │ ◄────────────────────────────┘  │
             │                                 │                                 │
  [FASE 4]   │ ◄── Transmisión Batch (JSON) ── │ (Se detecta señal de red)       │
 RECONCILIACIÓN│     Envía entregas acumuladas │                                 │
             │                                 │                                 │
             │ ── Ejecuta índice único ──────┐ │                                 │
             │    idx_unique_daily_claim     │ │                                 │
             │    Actualiza synced_at        │ │                                 │
             │ ◄─────────────────────────────┘ │                                 │
Fases del Flujo Offline
Fase 1: Precarga Diaria de Datos (Server ➔ App Distribuidor)
El dispositivo del distribuidor descarga la lista de trabajadores activos, sus llaves públicas FIDO2 registradas y los derechos de combos asignados (daily_entitlements).
Los datos se almacenan localmente en SQLite.
Fase 2: Validación Criptográfica Local (App Trabajador ➔ App Distribuidor)
El trabajador autoriza la autenticación biométrica (Face ID / Huella) en su smartphone.
La llave privada guardada en el chip seguro (Secure Enclave / TEE) firma la transacción localmente.
Se genera un código QR dinámico firmado.
La App del distribuidor escanea el QR y valida la firma usando la llave pública previamente almacenada en SQLite.
Fase 3: Cola de Sincronización Diferida (Sync Queue)
La entrega se valida al instante en la interfaz del distribuidor.
La transacción se guarda en la cola diferida de SQLite con un identificador único UUIDv4 y la bandera is_offline_sync = true.
Fase 4: Reconciliación e Idempotencia en Backend
Al detectar red, la App del distribuidor envía las entregas acumuladas en lote (batch JSON).
El servidor procesa el lote y valida la restricción de base de datos idx_unique_daily_claim (worker_id, entitlement_id).
Se rechaza cualquier intento de reentrada o entrega duplicada y se registra la fecha de sincronización synced_at.