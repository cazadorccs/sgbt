# Page Override — Estación de Supervisión & Despacho Manual (`/supervisor`)

> **Superficie:** `public/supervisor.html` (y copia `public/supervisor/index.html`)  
> **Modo `impeccable`:** `Operate` (mesa de despacho y resolución de incidencias en almacén)  
> **Hereda de:** `design-system/sgbt-mippci/MASTER.md`

---

## Overrides respecto a `MASTER.md`

| Eje | Regla específica para `/supervisor` | Razón operativa |
|---|---|---|
| **Densidad (`--density`)** | **Estándar / Táctil (`1.1`)** | Estación de laptop/tablet en mesa con escáner QR y búsqueda manual |
| **Tema por defecto** | **Claro predeterminado** (`data-default-theme="light"`) con switch manual Claro/Oscuro | Visibilidad inmediata en escritorio iluminado sin perder modo Oscuro para galpones |
| **Acción Primaria Única** | **Validar / Registrar Despacho** (en QR o despacho manual por cédula) | Minimizar errores humanos durante picos de cola |
| **Escáner QR** | Selector explícito de cámara + retículo estable (`prefers-reduced-motion` compliant) | Múltiples lentes en laptops/tablets institucionales |
| **Feedback Sensorial** | Confirmación visual inequívoca (éxito / duplicado / offline) + háptica/audio opcional | Evitar doble despacho ante caídas momentáneas de red |

## Restricciones de Migración (Fase 3)
- Eliminar el namespace paralelo `--sup-*` en `<style>` interno de `supervisor.html` (`7.4 KB`) y mapear sus componentes a los tokens globales de `styles.css`.
- Cargar Google Fonts (`Plus Jakarta Sans`, `JetBrains Mono`) con `font-display: swap` para paridad tipográfica con `/`.
- Añadir enlace `Saltar al contenido` (`skip link`) y normalizar inputs a `font-size >= 16px`.

