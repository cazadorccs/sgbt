# Page Override — Consola Administrativa COSEG (`/coseg`)

> **Superficie:** `public/index.html` + `public/coseg.html` (unificar fuente única en Fase 3) + `public/templates/modals.html`  
> **Modo `impeccable`:** `Operate` (gestión administrativa de alta densidad)  
> **Hereda de:** `design-system/sgbt-mippci/MASTER.md`

---

## Overrides respecto a `MASTER.md`

| Eje | Regla específica para `/coseg` | Razón operativa |
|---|---|---|
| **Densidad (`--density`)** | **Alta legible (`0.85`)** en tablas/filtros; **Estándar (`1.0`)** en modales | Supervisión de 1,138+ funcionarios, semáforo departamental e importación Excel |
| **Tema por defecto** | Respeta `sgbt_theme` (`ThemeManager`) con paridad estricta Claro/Oscuro | Uso prolongado en oficinas administrativas y salas de situación |
| **Acción Primaria Única** | Contexto por pestaña activa (ej. *Importar Nómina*, *Crear Jornada*, *Auditar Acta*) | Evitar múltiples botones primarios compitiendo en una misma barra |
| **Tablas y Contención** | `.table-scroll-container` con `max-height: clamp(380px, 58dvh, 620px)` y `thead th` sticky | Erradicar scroll infinito en pantalla completa (ADR-0008) |
| **Búsquedas y Filtros** | Buscadores (`#searchWorkerInput`, etc.) con botón limpiar (`X`) interno >= `40x40px` y retención de foco | Limpieza rápida de consultas por cédula o nombre |
| **Filas Inspectables** | Columna Dependencia con `aria-expanded`, chevron rotatorio SVG y subtabla acotada | Evitar saturar el semáforo manteniendo trazabilidad nominal |

## Restricciones de Migración (Fase 3)
- Unificar `public/index.html` y `public/coseg.html` (eliminando deriva entre `#networkSyncPill`, enlaces de recuperación y acceso a `/supervisor`).
- Extraer las 866 reglas `style="..."` de `modals.html` y 974 de `index.html` a clases CSS semánticas en `styles.css`.
- Sustituir `#0284c7` sobre blanco en texto normal / botón blanco cuando baje de `4.5:1` (usar `#0369a1` como `--accent-primary-text` / CTA sólido en Claro).

