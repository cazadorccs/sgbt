# Informe de Verificación WCAG, Regresión y Gobernanza — Fase 4 (SGBT MIPPCI)

> **Fecha:** 2026-11-11  
> **Metodología aplicada:** `ui-ux-pro-max` (10 categorías de prioridad + `pro-rules.md` + `quick-reference.md`) + `impeccable` (`craft-floor.md` + `detect`) + `MASTER.md` §4.  
> **Suite Automatizada Incorporada:** `tests/wcag_dark_mode_contrast.test.js` (`npm run test:wcag`) + `tests/ui_ux_governance.test.js` (`npm run test:ui`), integradas dentro de `npm test`.

---

## 1. Matriz de Verificación — 10 Categorías `ui-ux-pro-max` + `craft-floor`

| # | Categoría (`ui-ux-pro-max`) | Verificación en SGBT (Superficies `Operate`) | Estado | Mecanismo de Control / Prueba |
|---|---|---|---|---|
| 1 | **Accessibility (CRITICAL)** | Contraste Claro/Oscuro >= 4.5:1 (`#0369a1`, `#475569`, `#0f172a`, `#38bdf8`), `:focus-visible` de `3px`, `skip-link`, `<main>` landmarks en vistas `Operate`, `alt` en 100% de `<img>`, jerarquía `h1..h6` continua sin saltos. | **PASS** | `npm run test:wcag` + `npm run test:ui` |
| 2 | **Touch & Interaction (CRITICAL)** | `min-height: 44px` en `.btn`, `.btn-icon-header`, `.sidebar-tool-btn`, `.portal-subtab`, `.dropdown-item`; hit areas `::after` de `44x44px` en `.search-box-clear-btn` y `.btn-pill-action`; `touch-action: manipulation`. | **PASS** | `npm run test:ui` (`styles.css`) |
| 3 | **Performance (HIGH)** | Arquitectura Vanilla zero-bundler; `0` `transition: all` en `Operate`; eliminación de animaciones de pulso infinito en barras superiores (`.pulse-dot`, `.live-dot`); contención DOM en tablas y scroll. | **PASS** | `npm run test:ui` + `impeccable detect` |
| 4 | **Style Selection (HIGH)** | Lenguaje consistente *Instrumento Cívico de Alta Legibilidad* (`PRODUCT.md` / `DESIGN.md`); `.modal-dialog img[src=""]` oculta placeholders rotos antes de hidratar. | **PASS** | `npm run test:ui` + `MASTER.md` |
| 5 | **Layout & Responsive (HIGH)** | Zoom móvil desbloqueado (`maximum-scale=5.0`, sin `user-scalable=no`); `100dvh` en todas las vistas `Operate`; `scroll-padding-block-start: 5.25rem`; sincronía byte-a-byte de rutas espejo (`/coseg`, `/entregas`, `/supervisor`, `/simulador`). | **PASS** | `npm run test:ui` |
| 6 | **Typography & Color (MEDIUM)** | `Plus Jakarta Sans` + `JetBrains Mono` en consola, `/entregas` y `/supervisor`; `font-size: max(1rem, 16px)` móvil en inputs; `text-wrap: balance/pretty`; `--sup-*` y tokens Claro/Oscuro homogéneos. | **PASS** | `npm run test:wcag` + `npm run test:ui` |
| 7 | **Animation (MEDIUM)** | Transiciones con `transition-property` acotada y curvas explícitas; `@media (prefers-reduced-motion: reduce)` detiene también `.tg-center-crosshair` y `.tg-laser-line` del escáner QR. | **PASS** | `npm run test:ui` |
| 8 | **Forms & Feedback (MEDIUM)** | Todos los `<button>` dentro de `<form>` con `type=` explícito; foco protegido vía `:focus:not(:focus-visible)` + `:focus-visible`; `caret-color` tematizado; estados de error/contingencia con recuperación clara. | **PASS** | `npm run test:ui` + `test:e2e_suite` |
| 9 | **Navigation Patterns (HIGH)** | Navegación coherente entre `/coseg`, `/supervisor`, `/entregas` y carnet móvil; `.sidebar-logout-btn` y `.dropdown-item-danger` contrastadas y separadas visualmente del resto del menú. | **PASS** | `npm run test:ui` + `E2E-01B/01C` |
| 10 | **Charts & Data (LOW)** | `font-variant-numeric: tabular-nums` en KPIs, cédulas y celdas de tablas (`styles.css`, `entregas.html`, `supervisor.html`); cabecera jerárquica `1.45rem` en `/entregas`; semáforo nominal inspeccionable con alternativa tabular. | **PASS** | `npm run test:ui` + `test:payroll-dept` |

---

## 2. Verificación `craft-floor` (`impeccable`) — Superficies del Navegador

- **Selección de texto:** `::selection` estilizado para Claro y `body.dark-mode ::selection` para Oscuro.
- **Scrollbars:** `::-webkit-scrollbar`, track y thumb estilizados para Claro y Oscuro.
- **Cursor e hipervínculos:** `caret-color: var(--text-accent)` en `input, textarea, select` (`--sup-primary` en `/supervisor`) y `text-underline-offset: 0.18em` en enlaces `a`.
- **Anillo de foco:** `:focus-visible` de `3px` (`#0369a1` Claro / `#38bdf8` Oscuro) sin supresión destructiva (`:focus:not(:focus-visible)`).

---

## 3. Evolución de Riesgos (Fase 2 -> Fase 4)

- **Errores bloqueantes (`severity: error` en `impeccable detect`) sobre superficies `Operate`:** reducidos de `3` (pulsing-dots en headers) a **`0`**.
- **Zoom móvil bloqueado (`user-scalable=no`):** reducido a **`0`** en todo `public/`.
- **Deriva de rutas (`/index.html` vs `/coseg.html`, `/coseg/index.html`, `/entregas/index.html`, `/supervisor/index.html`, `/simulador/index.html`):** reducida a **`0` bytes** y vigilada automáticamente por `npm run test:ui`.
- **`100vh` y `transition: all` en superficies `Operate` y `styles.css`:** reducidos a **`0`**.

---

## 4. Reglas de Gobernanza Continua (CI / Pre-Commit)

Toda modificación futura sobre `public/` debe mantener en verde las `12` suites de `npm test`, especialmente:
1. `npm run test:wcag` — valida contraste numérico WCAG 2.2 AA/AAA en Modo Oscuro, Modales, Carnet y Modo Claro.
2. `npm run test:ui` — impide regresiones de `100vh`, `transition: all`, bloqueo de zoom, pérdida de `<main>` / `skip-link`, `alt` faltantes, saltos de encabezado, botones sin `type` en formularios o desincronización entre rutas espejo.

