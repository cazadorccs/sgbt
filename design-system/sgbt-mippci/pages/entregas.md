# Page Override — Consola de Auditoría y Registro en Vivo (`/entregas`)

> **Superficie:** `public/entregas.html` (y copia `public/entregas/index.html`)  
> **Modo `impeccable`:** `Operate` (monitoreo continuo y auditoría diaria)  
> **Hereda de:** `design-system/sgbt-mippci/MASTER.md`

---

## Overrides respecto a `MASTER.md`

| Eje | Regla específica para `/entregas` | Razón operativa |
|---|---|---|
| **Densidad (`--density`)** | **Alta legible (`0.9`)** | Supervisión en vivo de KPIs, filtros por combo/mesa y bitácora del día |
| **Tema por defecto** | **Claro predeterminado** (`data-default-theme="light"`) con switch visible en cabecera | Decisión confirmada por el equipo operativo para monitoreo diurno |
| **Escala Tipográfica** | **Corregir jerarquía plana actual (`1.16:1` -> mínimo `1.25:1`)** y elevar texto base de tabla a `>= 14px` | Detección real en Fase 2: actualmente presenta body ~12px con poca diferencia entre niveles |
| **Landmarks HTML** | Envolver sección principal en `<main id="main-content">` + añadir Skip Link | Ausencia verificada de `<main>` en `public/entregas.html` |
| **Cifras y Horas** | Todo contador KPI, cédula y timestamp en `tabular-nums` | Evitar vibración lateral en actualizaciones SSE en vivo |

## Restricciones de Migración (Fase 3)
- Integrar `public/js/core/theme_manager.js` y eliminar el bloque `<style>` redundante (`17 KB` con `--bg-main`, `--bg-card`, `--primary`) unificándolo con `styles.css`.
- Reemplazar la regla `transition: all` y `100vh` por propiedades explícitas y `100dvh`.
- Añadir link a `Plus Jakarta Sans` y `JetBrains Mono` con fallback offline seguro.

