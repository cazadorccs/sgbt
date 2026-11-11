# Inventario de Inconsistencias UI/UX en `public/` (Fase 1)

> **Alcance:** Auditoría estática de solo lectura sobre los archivos en `public/` realizada el **2026-11-11** antes de aplicar cambios en vistas de producción.  
> **Metodología:** `impeccable` (`extract` / `craft-floor`), `better-layout`, `make-interfaces-feel-better` y `ui-ux-pro-max`.

---

## 1. Resumen Ejecutivo de Hallazgos Críticos

| ID | Hallazgo | Severidad | Impacto en SGBT |
|---|---|---|---|
| **INV-01** | **Duplicación y deriva entre páginas HTML de rutas operativas** | **HIGH** | Roto de paridad en producción y doble mantenimiento |
| **INV-02** | **3,900+ estilos inline y 796 mutaciones `.style` con hex fijos** | **HIGH** | Rompe Dark Mode, Senior Mode y obliga a parches fragilísimos en CSS |
| **INV-03** | **Fragmentación de sistemas de tokens entre `styles.css`, `/entregas`, `/supervisor` y `/simulador`** | **HIGH** | Tres nomenclaturas de variables distintas y choque de tema por defecto |
| **INV-04** | **394 `!important` y reglas `[style*="..."]` en `public/css/styles.css`** | **HIGH** | Deuda de especificidad que bloquea un sistema limpio de componentes |
| **INV-05** | **Ausencia total de Skip Links y tipografía inconexa en `/entregas`, `/supervisor`, `/simulador`** | **MEDIUM** | Navegación por teclado deficiente y cambio de tipografía entre rutas |
| **INV-06** | **12 `transition: all` en `styles.css` + en HTML locales, y usos de `100vh`** | **MEDIUM** | Violación directa de `make-interfaces-feel-better` y saltos de barra móvil |
| **INV-07** | **Uso extendido de emojis como iconos funcionales vs regla SVG del proyecto** | **LOW/MED** | Inconsistencia visual entre plataforma/SO y ruptura de la guía editorial |

---

## 2. Detalle por Categoría

### A. Duplicación de archivos HTML y deriva activa (`INV-01`)

Se detectaron **5 pares de archivos HTML duplicados con hash SHA-256 idéntico**, además de una **deriva crítica** entre `public/index.html` y `public/coseg.html`:

1. **`public/index.html` (3,538 líneas, SHA `fc9189c5cd`) vs `public/coseg.html` (3,521 líneas, SHA `5399ae4402`):**
   - `vercel.json` reescribe `/coseg` y `/coseg/(.*)` hacia `/public/index.html`, mientras `public/coseg.html` y `public/coseg/index.html` contienen una versión distinta:
     - `index.html` incluye `#networkSyncPill` y los enlaces de recuperación de contraseña (`#btnForgotBeneficiaryPassword`, `#btnOpenRecoveryModalGlobal`, `#btnOpenRecoveryModalAdmin`), ausentes en `coseg.html`.
     - `coseg.html` incluye el acceso directo `💻 Estación Supervisor` y `autofocus`, ausentes en `index.html`.
2. **Copias idénticas redundantes (mismo contenido byte a byte):**
   - `public/coseg.html` === `public/coseg/index.html` (`5399ae4402`)
   - `public/entregas.html` === `public/entregas/index.html` (`1027d528ee`)
   - `public/supervisor.html` === `public/supervisor/index.html` (`7227e3ce87`)
   - `public/simulador.html` === `public/simulador/index.html` (`51d8b350e2`)
   - `public/manual_usuario_interactivo.html` === `public/docs/manual_usuario_interactivo.html` (`89768fad32`)

**Acción recomendada (Fase 2):** unificar una sola fuente HTML por ruta y alinear `vercel.json` + `backend/server.js` (o generación/enlace único) para eliminar riesgo de deriva.

---

### B. Fragmentación de hojas de estilo y tokens (`INV-03`, `INV-04`)

Análisis de `public/css/styles.css` (5,438 líneas):
- **Tokens declarados (`--*`):** `61` variables en `:root` y bloques de tema.
- **Colores hexadecimales literales:** `604` ocurrencias (`90` valores hex únicos) fuera de la capa de variables semánticas (`#ffffff` 75x, `#38bdf8` 47x, `#0284c7` 43x, `#0f172a` 31x, `#f8fafc` 30x, `#1e293b` 23x, `#0369a1` 21x).
- **Reglas `!important`:** `394` ocurrencias.
- **Parches de compatibilidad Dark Mode (líneas `3888–3893` y `4234–4298`):** selectores de atributo `body.dark-mode [style*="color: ..."]` y `[style*="background: ..."]` creados para sobreescribir estilos inline rígidos.
- **Desincronización de versiones CSS en HTML operativos:**
  - `public/index.html` y `public/coseg.html`: `/css/styles.css?v=2.7` (+ 2 `<link>` a Google Fonts)
  - `public/entregas.html`: `/css/styles.css` (sin query version, **sin Google Fonts**, + bloque `<style>` interno de `16,987` bytes con tokens propios `:root, [data-theme="light"]` que redefinen `--border-subtle`, `--text-main`, `--bg-card`, `--primary`)
  - `public/supervisor.html`: `/css/styles.css?v=3.8` (**sin Google Fonts**, + bloque `<style>` interno de `7,389` bytes con namespace paralelo `--sup-bg`, `--sup-panel`, `--sup-primary`)
  - `public/simulador.html`: `/css/styles.css?v=4.0` (**sin Google Fonts**, **sin `theme_manager.js`**, + `<style>` interno de `6,168` bytes con `--bg-dark-sim`, fuente de sistema `-apple-system, BlinkMacSystemFont, "Segoe UI"` y fondo oscuro fijo)

---

### C. Inventario de estilos inline, HTML y JS (`INV-02`, `INV-05`, `INV-06`)

#### Vistas Operativas (`Operate`) y Plantillas

| Archivo | Líneas | `<style>` local | `style="..."` inline | Hex literales | `theme_manager.js` | Skip Link | `transition: all` | `100vh` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `public/index.html` | 3,538 | 0 | **974** | **513** | Sí | No | 9 | 0 |
| `public/coseg.html` | 3,521 | 0 | **969** | **512** | Sí | No | 9 | 0 |
| `public/templates/modals.html` | 3,114 | 0 | **866** | **442** | N/A | N/A | 0 | 0 |
| `public/supervisor.html` | 1,080 | 1 (`7.4 KB`) | **178** | **100** | Sí | No | 3 | 1 |
| `public/simulador.html` | 1,330 | 1 (`6.2 KB`) | **179** | **157** | **No** | No | 1 | 1 |
| `public/entregas.html` | 994 | 1 (`17.0 KB`) | 16 | **78** | **No** (custom) | No | 1 | 1 |

#### Módulos JavaScript con mayor inyección de estilos / colores fijos

| Módulo JS | Líneas | Asignaciones `.style.* =` | `style="..."` en template literals | Hex de 6 dígitos (`#RRGGBB`) |
|---|---:|---:|---:|---:|
| `public/js/modules/auth.js` | 2,632 | **199** | 20 | 65 |
| `public/js/modules/combos.js` | 2,036 | 51 | **113** | **154** |
| `public/js/modules/distributor.js` | 2,661 | 56 | **96** | **91** |
| `public/js/modules/admin.js` | 1,314 | 32 | **89** | **86** |
| `public/js/modules/beneficiary.js` | 1,735 | **102** | 65 | 74 |
| `public/js/modules/manual_dispatch.js` | 1,050 | 20 | 72 | 40 |
| `public/js/modules/ministerial_audit.js` | 814 | 9 | 58 | 65 |
| `public/js/modules/department_batches.js` | 784 | 5 | 42 | 33 |
| `public/js/core/toast.js` | 103 | **39** | 8 | 16 |
| `public/js/modules/share.js` | 797 | 40 | 7 | 26 |
| `public/js/app.js` | 625 | 28 | 0 | 1 |

#### Superficies Documentales y Comerciales (`Read` / `Persuade`)

- `public/dossier.html` (1,907 líneas, `115` inline styles, `138` hex, `4` `transition: all`, `12` `!important`), `public/plan_financiamiento.html`, `public/propuesta_comercializacion.html`, `public/brochure_pdf_source.html`, `public/acta_oficial.html`, `public/logos.html`, `public/manual_usuario_interactivo.html`, `public/architecture.html`, `public/workflow.html` y `public/diagrams/*.html`.
- Ninguna comparte `public/css/styles.css` ni tokens comunes (`hasStylesCss: false`, `hasThemeManager: false`).

---

### D. Hallazgos de Ingeniería Visual y Layout (`styles.css`)

1. **`transition: all` (12 instancias en `styles.css`):** líneas `746, 838, 892, 1259, 1956, 2431, 2450, 2539, 4506, 4845, 4973, 5051` (+ `9` en `index.html`/`coseg.html`, `3` en `supervisor.html`, `1` en `entregas.html`, `1` en `simulador.html`, `4` en `dossier.html`).
2. **`100vh` sin `dvh`:** `styles.css` líneas `133, 604, 2174` y `<style>` en `entregas.html`, `supervisor.html`, `simulador.html`.
3. **Senior Mode acoplado con `!important` (`styles.css` líneas `2875–2985` y `4304–4338`):** funciona en `index.html`, pero las páginas con tokens independientes (`entregas.html`, `supervisor.html`, `simulador.html`) no heredan coherentemente todos sus overrides.
4. **Cobertura positiva existente a preservar:** `styles.css` ya cuenta con `:focus-visible` en modo Claro y Oscuro (líneas `3646–3669`), `@media (prefers-reduced-motion: reduce)` (líneas `3682–3683`), `::selection` / `caret-color`, `text-wrap: balance/pretty` y `tabular-nums`.

---

## 3. Hoja de Ruta Recomendada (Entrada a Fase 2)

1. **Prioridad 1 — Unificación estructural y de rutas:** resolver la deriva `public/index.html` vs `public/coseg.html` (y copias duplicadas en subcarpetas) antes de editar componentes.
2. **Prioridad 2 — Extracción de CSS inline a clases semánticas:** atacar primero `public/templates/modals.html` (866 inline styles), `public/index.html` (974 inline styles) y los `<style>` embebidos de `entregas.html` y `supervisor.html`.
3. **Prioridad 3 — Refactor de tokens en JS (`combos.js`, `distributor.js`, `admin.js`, `beneficiary.js`, `auth.js`):** reemplazar strings HTML con `style="color: #..."` por clases semánticas (`.badge`, `.status-card`, `.text-muted`, etc.).
4. **Prioridad 4 — Auditoría `better-layout` + micro-pulido `make-interfaces-feel-better`:** eliminar los 12+ `transition: all`, reemplazar `100vh` por `100dvh`, añadir skip links y validar responsividad `320px–1440px` y zoom `200%`.

