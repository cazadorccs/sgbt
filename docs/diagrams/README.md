# Directorio de Diagramas de Arquitectura e Ingeniería — SGBT MIPPCI

Este directorio reúne los diagramas visuales interactivos y sus especificaciones técnicas de modelo en formato JSON, elaborados y validados con el motor **Archify v3.2.0** (`showcase quality`).

Cada diagrama es un archivo HTML autónomo (`standalone`), con capacidades nativas de:
- Visualización interactiva y reactiva (soporte para modo Claro / Oscuro con `data-theme`).
- Controles de navegación ergonómica (Zoom, Pan, Reset y pantalla completa).
- Panel de tarjetas descriptivas y metadatos con detalles técnicos de seguridad, auditoría e infraestructura.
- Vistas guiadas por dominios y trazado secuencial de flujos.

---

## 🗺️ Índice de Diagramas

| Diagrama | Tipo | Artefacto HTML Interactivo | Especificación JSON | Descripción de Enfoque |
| :--- | :--- | :--- | :--- | :--- |
| **Arquitectura General (C4 Nivel 2)** | `architecture` | [c4-containers.html](./c4-containers.html) | [c4-containers.json](./c4-containers.json) | Modelo de contenedores C4: actores institucionales, frontends PWA, servicios core backend (Cripto, Idempotencia, SSE) y persistencia híbrida SQLite WAL + Supabase Cloud. |
| **Flujo de Retiro y User Journey** | `sequence` | [user-journey-sequence.html](./user-journey-sequence.html) | [user-journey-sequence.json](./user-journey-sequence.json) | Secuencia cronológica del despacho con Passkeys FIDO2: biometría local en Secure Enclave, escaneo de QR dinámico temporal (180s), verificación ECDSA P-256, deducción atómica y feedback háptico. |
| **Modelo de Datos Relacional (ERD)** | `erd` | [modelo-datos-erd.html](./modelo-datos-erd.html) | [modelo-datos-erd.json](./modelo-datos-erd.json) | Modelo entidad-relación dividido en 3 dominios funcionales (Identidad, Beneficios y Auditoría), con integridad referencial estricta, índice de reclamo diario único e idempotencia. |

---

## 📋 Resumen Detallado por Diagrama

### 1. [Diagrama C4 de Contenedores](./c4-containers.html)
- **Actores y Perfiles:** Beneficiario (Smartphone personal), Operador de Almacén (Terminal de lectura offline) y Administrador TI (Gobernanza/RRHH).
- **Capa Frontend:** PWA Beneficiario (WebAuthn/Enclave), PWA Despacho (Cámara + IndexedDB) y Portal Web de Administración (RBAC).
- **Capa Backend y Servicios:** API REST Express, Middleware de Idempotencia (RFC 7807), Servicio Criptográfico ECDSA P-256 y Canal SSE en vivo.
- **Capa de Almacenamiento:** SQLite embebida de ultra-baja latencia (WAL) y replicación hacia Supabase Cloud.

### 2. [Diagrama de Secuencia y User Journey](./user-journey-sequence.html)
- **Fase 1 (Autenticación Biométrica):** Solicitud local al Secure Enclave/TPM, firma biométrica ECDSA P-256 sin contraseñas y generación de QR de retiro con expiración a los 180 s.
- **Fase 2 (Escaneo en Almacén):** Lectura óptica en punto de control y envío con cabecera `Idempotency-Key` a `/auth/verify-qr`.
- **Fase 3 (Idempotencia y Despacho):** Comprobación en `idx_unique_daily_claim`, inserción transaccional atómica, emisión de SSE a monitores institucionales y vibración háptica multimodal al operador.

### 3. [Diagrama de Modelo de Datos (ERD)](./modelo-datos-erd.html)
- **Dominio Identidad (`identity`):** `departments`, `workers` y `passkey_credentials`.
- **Dominio Beneficios (`benefits`):** `combos`, `campaigns` y `daily_entitlements`.
- **Dominio Auditoría (`audit`):** `deliveries` (con clave foránea compuesta, firma criptográfica y flag de sincronización), `idempotency_keys` (retención de claves y replay cacheado) y `audit_logs` (trazabilidad forense).

---

## 🛠️ Cómo Abrir o Previsualizar los Diagramas

Puedes abrir directamente cualquiera de los archivos `.html` en cualquier navegador web moderno:
```bash
# Ejemplo abriendo directamente desde la terminal o explorador:
start docs/diagrams/c4-containers.html
start docs/diagrams/user-journey-sequence.html
start docs/diagrams/modelo-datos-erd.html
```
O previsualizarlos a través del servidor local de la aplicación una vez iniciado.
