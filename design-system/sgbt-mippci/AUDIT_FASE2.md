# Informe de Auditoría Estructural y de Layout — Fase 2 (SGBT MIPPCI)

> **Fecha:** 2026-11-11  
> **Superficies auditadas (`Operate`):** `public/index.html`, `public/coseg.html`, `public/supervisor.html`, `public/entregas.html`, `public/simulador.html`, `public/templates/modals.html` y `public/css/styles.css`.  
> **Metodología:** `impeccable audit` + `impeccable detect --json` + `better-layout` + `make-interfaces-feel-better` + `ui-ux-pro-max`.  
> **Nota de alcance:** Análisis estático y de código fuente; no se ejecutó captura visual en navegador headless en esta fase (ver sección de falsos positivos y verificación en vivo recomendada al iniciar Fase 3).

---

## 1. Veredicto de Integridad e Health Score (`impeccable audit`)

### Implementation Integrity Verdict: **NO APTO / REQUIERE CONSOLIDACIÓN (FAIL parcial)**
El proyecto posee una identidad clara (*Instrumento Cívico de Alta Legibilidad*) y controles de dominio avanzados (Passkeys, Merkle, Offline-First, modo Adulto Mayor, pruebas WCAG para Dark Mode), pero la implementación presenta **deriva estructural activa**:
1. Dos archivos divergentes para la misma consola (`public/index.html` vs `public/coseg.html`) más 5 pares duplicados byte a byte.
2. Tres sistemas de variables CSS incompatibles entre `styles.css`, `entregas.html`, `supervisor.html` y `simulador.html`.
3. Más de **3,100 atributos `style="..."` inline** en HTML/modales que neutralizan el sistema de tokens y obligan a `styles.css` a mantener `394` `!important` y selectores `[style*="..."]`.

### Audit Health Score

| # | Dimensión | Puntaje (0–4) | Hallazgo Clave Verificado |
|---|---|---:|---|
| 1 | **Accessibility** | **2 / 4** | Dark Mode probado (`test:wcag`), pero `index.html`/`coseg.html` bloquean zoom (`user-scalable=no`), inputs `< 16px` (`77` casos), sin skip links, y contrastes Light Mode `< 4.5:1` (`#0284c7` sobre blanco `4.1:1`, `#10b981` sobre `#e1f7f0` `2.3:1`). |
| 2 | **Performance** | **2 / 4** | Sin bundler pesado (ventaja), pero `12` `transition: all` en `styles.css` (+ `14` en HTML), `.pulse-dot` con animación infinita en header y duplicación de CSS inline (`30.5 KB` extra en 3 HTMLs). |
| 3 | **Theming** | **2 / 4** | `:root` + `[data-theme="dark"]` + `senior-accessible-mode` bien planteados, pero socavados por `604` hex literales en `styles.css`, `974` inline en `index.html`, `866` en `modals.html` y `simulador.html` fijo en oscuro sin `ThemeManager`. |
| 4 | **Responsive Design** | **2 / 4** | Modales con `min(92vh, 92dvh)` y safe-area parcial, pero `3` `100vh` en `styles.css`, `0` `@container`, `13` propiedades físicas (`margin/padding-left/right`), `scroll-padding` incompleto y `177` botones con inline compacto en `index`/`modals`/`supervisor`. |
| 5 | **Implementation Integrity** | **1 / 4** | Deriva `index.html` vs `coseg.html` + `1,505` hallazgos en `impeccable detect` (`3` error, `878` warning, `624` advisory) y jerarquía plana en `entregas.html` (`1.16:1`). |
| **Total** | | **9 / 20** | **Poor — Requiere consolidación estructural antes de rediseñar nuevas vistas** |

---

## 2. Evaluación `better-layout` por Superficie

| Superficie | Severidad Máxima | Hallazgos Estructurales Clave | Decisión `better-layout` |
|---|---|---|---|
| **Carnet / Consola `/` (`public/index.html`)** | **HIGH** | `user-scalable=no` / `maximum-scale=1.0`; `974` inline styles; `73` botones sin `type=`; `92` botones con sizing compacto inline; salto de heading `h3 -> h5`; tarjetas anidadas y bordes laterales de 3–4px; `175` emojis en UI. | **BLOCK** (corregir P0 viewport + tokens antes de liberar cambios visuales) |
| **Consola `/coseg` (`public/coseg.html`)** | **HIGH** | Deriva activa respecto a `public/index.html` (le faltan `#networkSyncPill` y 3 enlaces de recuperación de contraseña; `vercel.json` sirve `index.html`); copia duplicada en `public/coseg/index.html`. | **BLOCK** (unificar fuente única) |
| **Modales (`public/templates/modals.html`)** | **HIGH** | `866` inline styles; `35` inputs `< 16px`; `64` botones compactos inline; `3` `<img src="">` vacíos antes de hidratar (L117, L1737, L2705); contenedores `.panel-header` sin inset uniforme (`cramped-padding`). | **BLOCK** para nuevos modales hasta migrar clases base |
| **Estación `/supervisor` (`public/supervisor.html`)** | **MEDIUM** | Namespace paralelo `--sup-*` (`7.4 KB` `<style>`); sin Google Fonts; `178` inline styles; `19` botones compactos; `100vh`; sin skip link. | **CONDITIONAL (Approve para operación actual / Refactor en Fase 3)** |
| **Registro `/entregas` (`public/entregas.html`)** | **HIGH** | Jerarquía tipográfica plana (`body 12px`, ratio `1.16:1 < 1.25:1`); carece de `<main>` landmark; `<style>` local `17 KB` que colisiona con `--border-subtle` / `--text-main` de `styles.css`; sin `theme_manager.js` ni Google Fonts. | **BLOCK** para rediseño hasta restaurar `<main>` y escala tipográfica |
| **Simulador `/simulador` (`public/simulador.html`)** | **MEDIUM** | Sin `ThemeManager`; tipografía de sistema aislada; `179` inline styles; `100vh`; `7` botones sin `type=`. | **CONDITIONAL (Refactor en Fase 3)** |

---

## 3. Resultados Verificados de `impeccable detect` (Separación Real vs Falso Positivo)

Conteo agregado sobre `public/index.html`, `public/coseg.html`, `public/supervisor.html`, `public/entregas.html`, `public/simulador.html`, `public/templates/modals.html` y `public/css/styles.css`:
- **Total bruto:** `1,505` hallazgos (`3` `error`, `878` `warning`, `624` `advisory`).

### Hallazgos Reales Prioritarios
1. **`low-contrast` en Modo Claro (`480` warning / `90` advisory):**
   - `#ffffff` sobre `#0284c7` = **`4.1:1`** (bajo mínimo AA `4.5:1` en botones/avatares normales; subir a `#0369a1`).
   - `#10b981` sobre `#e1f7f0` = **`2.3:1`**, `#f59e0b` sobre `#ffffff` = **`2.1:1`**, `#d97706` sobre `#ffffff` = **`3.2:1`**, `#059669` sobre `#ffffff` = **`3.8:1`**, `#ffffff` sobre `#ef4444` = **`3.8:1`**.
   - `#64748b` sobre `#f1f5f9` (`--bg-surface-0`) = **`4.3:1`** (debe oscurecerse a `#475569` en `--bg-surface-0`).
2. **`pulsing-dot` en header (`error`, `index.html`, `coseg.html`, `supervisor.html`):** `.pulse-dot` con animación infinita `pulse-ring` en barra de navegación.
3. **`broken-image` en `modals.html` (`3` warning):** `<img src="">` en L117 (`#workerPhotoPreviewImg`), L1737 (`#enrollPhotoImgPreview`) y L2705 (`#mfaSetupQrImage`). Deben iniciarse ocultas o con estado vacío SVG hasta cargar datos reales.
4. **`skipped-heading` (`2` warning):** `<h3> "--" -> <h5> "📦 Combos Asignados de la Jornada"` en `index.html` y `coseg.html`.
5. **`flat-type-hierarchy` (`1` warning):** `entregas.html` tiene `body 12px`, `h4 13.6px`, `h3 15.2px`, `h2 17.6px` (paso máximo `1.16:1`, meta `>= 1.25:1`).
6. **`cramped-padding` (`23` warning) y `nested-cards` (`21` warning):** contenedores `.table-responsive`, `.panel-header` y tarjetas internas que usan bordes/sombras redundantes sin padding interno equilibrado.
7. **`side-tab` (`14` warning) y `border-accent-on-rounded` (`27` warning):** barras laterales gruesas (`border-left: 3px/4px`) y `border-top: 3px` sobre cajas redondeadas; sustituir por fondos tintados sutiles o iconos de estado.
8. **`undersized-ui-text` (`153` warning) y `tiny-text` (`110` warning):** etiquetas e inputs `< 14px`/`< 16px` distribuidos en tablas y formularios inline.
9. **`transition: all` (`12` en `styles.css`, `23` adicionales en HTML) y `outline: none` (`styles.css` L1446, L1644, L5075, L5365):** reemplazar por `transition-property` acotado y verificación de `:focus-visible`.

### Falsos Positivos / Matices Contextuales (No tratar como errores genéricos)
- **`.tg-center-crosshair` (`tgBreathing` en visor QR):** no es un badge decorativo "AI dot", sino la guía central del escáner de cámara; conservar funcionalidad asegurando freno bajo `@media (prefers-reduced-motion: reduce)`.
- **`ai-color-palette` (`#c084fc` / púrpura en `modals.html` y badges):** corresponde al código cromático institucional de personal **Jubilado** (`--badge-jubilado`). Conservar distinción semántica de rol, validando que su contraste Claro/Oscuro cumpla `>= 4.5:1`.
- **`overused-font` (`Plus Jakarta Sans`):** es la tipografía base oficial de `styles.css` (`--font-main`). No requiere reemplazo forzado en consola estándar, salvo evaluar `Atkinson Hyperlegible` en `senior-accessible-mode`.

---

## 4. Plan de Ejecución Priorizado para Fase 3 (Por Bloques Seguros)

### Lote 3.1 — P0 Bloqueantes de Accesibilidad, Contraste Claro y Deriva de Rutas
1. **Unificación `index.html` vs `coseg.html` (y copias duplicadas):** definir fuente única por ruta y limpiar deriva de `#networkSyncPill`, enlaces de recuperación y acceso `/supervisor`.
2. **Desbloqueo de zoom y landmarks:** retirar `user-scalable=no` y `maximum-scale=1.0` en `index.html`/`coseg.html`; añadir `<main>` en `entregas.html`, Skip Link en las 5 vistas `Operate`, y corregir `h3 -> h4` en combos.
3. **Corrección WCAG Modo Claro:** ajustar `--accent-primary` texto/botón sólido en Claro a `#0369a1` (`>= 4.5:1`), oscurecer `--text-dim` sobre `--bg-surface-0` a `#475569`, y alinear verdes/ámbar/rojos de texto sobre blanco; ampliar `tests/wcag_dark_mode_contrast.test.js` (o añadir suite hermana) para validar **también Modo Claro**.

### Lote 3.2 — Consolidación de Tokens CSS y Eliminación de `transition: all` / `100vh`
1. Reemplazar `12` `transition: all` y `3` `100vh` en `styles.css` (+ instancias en HTML).
2. Unificar `<style>` de `entregas.html` (`17 KB`) y `supervisor.html` (`7.4 KB`) dentro de `styles.css` bajo tokens comunes, conectando `ThemeManager` y fuentes con `font-display: swap`.
3. Añadir `scroll-padding-block-start` dinámico acorde a `.master-header`, expandir hit areas de utilitarios (ej. `.search-box-clear-btn`) a `>= 44x44px` y convertir propiedades físicas clave a lógicas CSS.

### Lote 3.3 — Desacoplamiento de Inline Styles y Pulido (`make-interfaces-feel-better`)
1. Migrar los `866` inline styles de `modals.html` y `974` de `index.html` a clases utilitarias/componentes semánticos, eliminando progresivamente los selectores parche `[style*="..."]` en `styles.css`.
2. Corregir los 3 `<img src="">` vacíos de `modals.html` (placeholder SVG / `hidden`), elevar inputs móviles a `>= 16px`, restaurar escala tipográfica en `entregas.html` (`>= 1.25:1`) y reemplazar `.pulse-dot` / bordes laterales de 4px por indicadores sobrios.
3. Migrar gradualmente plantillas HTML inyectadas en JS (`combos.js`, `distributor.js`, `admin.js`, `beneficiary.js`, `auth.js`) hacia clases CSS del sistema.

