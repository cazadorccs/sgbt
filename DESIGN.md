---
name: "SGBT MIPPCI Design System"
description: "Sistema de diseño institucional Offline-First para gestión, despacho y auditoría de beneficios alimentarios MIPPCI con soporte Light, Dark y Adulto Mayor."
colors:
  sea-pacific: "#0284c7"
  accent-primary-hover: "#0369a1"
  sea-malibu: "#0ea5e9"
  sea-anakiwa: "#38bdf8"
  sea-onahau: "#e0f2fe"
  bg-primary: "#f8fafc"
  bg-surface-0: "#f1f5f9"
  bg-surface-card: "#ffffff"
  border-subtle: "rgba(226, 232, 240, 0.9)"
  text-main: "#0f172a"
  text-muted: "#334155"
  text-dim: "#64748b"
  text-subtle: "#94a3b8"
  accent-emerald: "#10b981"
  badge-green-bg: "#ecfdf5"
  badge-green-text: "#065f46"
  accent-amber: "#f59e0b"
  badge-amber-bg: "#fffbeb"
  badge-amber-text: "#92400e"
  accent-rose: "#ef4444"
  badge-red-bg: "#fef2f2"
  badge-red-text: "#991b1b"
  dark-bg-primary: "#0a0f1d"
  dark-bg-surface-0: "#0f172a"
  dark-bg-surface-1: "#141e33"
  dark-bg-surface-2: "#1e293b"
  dark-border-subtle: "#25334d"
  dark-text-main: "#f8fafc"
  dark-text-muted: "#cbd5e1"
  dark-text-dim: "#94a3b8"
typography:
  display:
    fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.02em"
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: "0.9rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.sea-pacific}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.65rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-primary-hover}"
  button-icon-header:
    backgroundColor: "{colors.bg-surface-card}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    width: "44px"
    height: "44px"
  card-surface:
    backgroundColor: "{colors.bg-surface-card}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  input-field:
    backgroundColor: "{colors.bg-surface-card}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.sm}"
    padding: "0.65rem 0.9rem"
---

# DESIGN.md — Sistema de Diseño SGBT MIPPCI

## Overview

**Estrella Norte creativa:** *Instrumento Cívico de Alta Legibilidad*. SGBT no busca parecer una aplicación de entretenimiento ni un panel genérico de startup; funciona como una consola operativa gubernamental limpia, predecible y confiable bajo cualquier condición de luz o conectividad.

Este documento codifica los tokens reales extraídos de `public/css/styles.css` y fija las reglas normativas para unificar progresivamente todas las vistas bajo `public/` en sus tres modos visuales: **Claro institucional** (predeterminado en consolas `/entregas`, `/supervisor` y vistas administrativas), **Oscuro OLED/Almacén** (`[data-theme="dark"]` / `body.dark-mode`) y **Accesible Adulto Mayor** (`body.senior-accessible-mode`).

## Colors

### Paleta Institucional y Superficies (Modo Claro — `:root`)

| Rol | Token CSS | Valor Canónico | Uso |
|---|---|---|---|
| Acento Primario | `--sea-pacific` / `--accent-primary` | `#0284c7` | CTA principal, cabecera activa, foco, marca MIPPCI |
| Primario Hover | `--accent-primary-hover` | `#0369a1` | Hover sobre botón primario, enlaces activos de alto contraste |
| Fondo Base | `--bg-primary` | `#f8fafc` | Lienzo principal de página |
| Superficie Nivel 0 | `--bg-surface-0` | `#f1f5f9` | Fondos secundarios, cabeceras de tabla, zonas agrupadas |
| Tarjetas y Modales | `--bg-surface-card` | `#ffffff` | Contenedores elevados, inputs, diálogos |
| Borde Sutil | `--border-subtle` | `rgba(226, 232, 240, 0.9)` | Delimitación limpia de tarjetas y tablas |
| Texto Principal | `--text-main` | `#0f172a` | Títulos, valores KPI, nombres y cédulas |
| Texto Secundario | `--text-muted` | `#334155` | Cuerpo de texto y descripciones |
| Texto Atenuado | `--text-dim` | `#64748b` | Etiquetas auxiliares, metadatos (ratio >= 4.5:1) |
| Texto Sutil | `--text-subtle` | `#94a3b8` | Exclusivo para estados deshabilitados / placeholders (>= 3:1) |

### Paleta Semántica de Estado

- **Éxito / Entregado / Online:** `--accent-emerald` (`#10b981`), badge `--badge-green-bg` (`#ecfdf5`) + `--badge-green-text` (`#065f46`) + `--badge-green-border` (`#86efac`).
- **Advertencia / Cola Offline / Pendiente:** `--accent-amber` (`#f59e0b`), badge `--badge-amber-bg` (`#fffbeb`) + `--badge-amber-text` (`#92400e`) + `--badge-amber-border` (`#fde68a`).
- **Error / Bloqueo / Crítico:** `--accent-rose` (`#ef4444`), badge `--badge-red-bg` (`#fef2f2`) + `--badge-red-text` (`#991b1b`) + `--badge-red-border` (`#fecaca`).
- **Informativo / Activo:** `--badge-blue-bg` (`#e0f2fe`) + `--badge-blue-text` (`#025988`, ratio 7.53:1 AAA) + `--badge-blue-border` (`#bae6fd`).

### Variantes de Modo Oscuro (`[data-theme="dark"], body.dark-mode`) y Adulto Mayor

- **Oscuro (verificado en `tests/wcag_dark_mode_contrast.test.js`):** `--bg-primary: #0a0f1d`, `--bg-surface-0: #0f172a`, `--bg-surface-1 / card: #141e33`, `--bg-surface-2: #1e293b`, `--border-subtle: #25334d`, `--text-main: #f8fafc`, `--text-muted: #cbd5e1`, `--text-dim: #94a3b8`, `--text-accent: #38bdf8`.
- **Adulto Mayor (`body.senior-accessible-mode`):** eleva base tipográfica a `19px`, texto a `#000000`, fondo `#f1f5f9`, tarjetas `#ffffff` con borde sólido `2.5px solid #0284c7`, inputs `>= 50px` y botones `>= 52px`.
- **Multi-ente (`tenant_settings`):** puede sobreescribir el acento institucional manteniendo intactos los ratios de contraste WCAG 2.2 AA/AAA.

## Typography

- **Familia principal (`--font-main`):** `'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
- **Familia tabular/técnica (`--font-mono`):** `'JetBrains Mono', 'Fira Code', monospace` (reservada exclusivamente para cédulas, hashes Merkle, códigos TOTP, secretos y métricas técnicas; nunca como disfraz decorativo).
- **Reglas tipográficas obligatorias:**
  - Suavizado de fuentes en `html`: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;`.
  - Títulos con `text-wrap: balance;` y descripciones/cuerpo con `text-wrap: pretty;`.
  - Cifras dinámicas, KPIs, contadores, temporizadores y cédulas con `font-variant-numeric: tabular-nums;`.
  - Medida de lectura cómoda (65–75 caracteres en documentación `Read`), tamaño mínimo `16px` en inputs móviles para evitar zoom automático en iOS/Android.

## Layout

- **Modelo móvil / PWA Edge-to-Edge:** respeto estricto a `--safe-area-top/bottom/left/right` (`env(safe-area-inset-*)`) y `scroll-padding-block-start` equivalente a la altura de `.master-header` sticky para evitar que enlaces o focos queden ocultos detrás de la barra superior.
- **Altura de viewport segura:** usar `min-height: 100dvh` (nunca `100vh` rígido en móviles) y `max-height: min(92vh, 92dvh)` en modales.
- **Contención de tablas masivas (1,138+ trabajadores):** `.table-scroll-container` con `max-height: clamp(380px, 58dvh, 620px)` y `thead th` sticky; usar `minmax(0, 1fr)` en rejillas CSS para impedir desborde horizontal desde `320px` hasta `1440px+` y zoom al `200%`.
- **Breakpoints actuales en `styles.css`:** `@media (max-width: 1024px)`, `768px`, `680px`, `640px`, `prefers-reduced-motion: reduce`, `@media print` (objetivo en Fase 2: consolidar en puntos de quiebre consistentes por contenido y `@container` donde aplique).
- **Densidad diferenciada por superficie:**
  - *Carnet móvil y `/supervisor`:* baja/media densidad, tarjetas amplias, una acción primaria por paso.
  - *Consolas `/coseg` y `/entregas`:* alta densidad tabular ordenada por importancia, filtros inmediatos y acción primaria única por barra/modal.

## Elevation & Depth

- **Regla de elevación única:** declarar elevación mediante borde sutil (`1px solid var(--border-subtle)`) o mediante sombra multicapa, evitando duplicar bordes pesados + sombras gigantes ("ghost card").
- **Escala oficial de sombras (`--shadow-xs` a `--shadow-floating`):** sombras neutras basadas en `rgba(15, 23, 42, ...)` en Claro y `rgba(0, 0, 0, ...)` en Oscuro, siempre con desplazamiento vertical positivo y difuminado suave.
- **Glassmorphism funcional limitado:** `backdrop-filter: blur(...)` reservado únicamente a `.master-header` y `.modal-backdrop` para continuidad contextual; nunca en tarjetas de datos.

## Shapes

- **Escala de radios:** `--radius-xs: 6px`, `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-xl: 24px`, `--radius-pill: 9999px`.
- **Regla de concéntricidad (`make-interfaces-feel-better`):** todo contenedor hijo redondeado dentro de otro con padding debe calcular `radio_interno = radio_externo - padding` (ej. tarjeta `16px` con padding `8px` -> elemento interno `8px`).
- **Imágenes y emblemas:** `outline: 1px solid rgba(15, 23, 42, 0.08); outline-offset: -1px;` sobre avatares, sellos y logos para preservar nitidez sin desbordar cajas.

## Components

- **Botones (`--transition-fast` / `0.15s cubic-bezier(0.16, 1, 0.3, 1)`):**
  - Área táctil mínima `44x44px` (`.btn-icon-header` ya cumple `44x44px`; los botones pequeños de tablas, limpiar búsqueda y switches deben expandirse al menos a `40x40px` / `44x44px` con pseudo-elemento si el icono visual es menor).
  - Transiciones explícitas únicamente sobre propiedades seguras (`background-color`, `border-color`, `color`, `box-shadow`, `transform`, `opacity`). Prohibido `transition: all`.
  - Respuesta táctil sutil en `:active` (`transform: scale(0.96)` solo en botones y bajo `!prefers-reduced-motion`).
- **Cajas de búsqueda e inputs:**
  - Todo buscador de padrón o entregas incluye botón de limpieza (`X`) posicionado dentro del campo, oculto cuando está vacío, con foco devuelto al input tras limpiar (`input.focus()`) y hit-area accesible.
- **Tablas y filas desplegables de auditoría:**
  - Encabezados alineados con sus columnas de datos, valores numéricos/cédulas en `tabular-nums`, filas inspectables con `aria-expanded` y contraste claro entre fila padre y detalle hijo.
- **Modales y drawers:**
  - Un único botón de cierre visible en cabecera sticky (`top: -1rem`), foco atrapado/gestionado y cierre con `Escape`.

## Do's and Don'ts

### Do
- **Usar siempre variables CSS semánticas** (`--bg-surface-card`, `--text-main`, `--border-subtle`, `--badge-*-*`) para que Claro, Oscuro y Adulto Mayor funcionen sin parches.
- **Sustituir emojis de interfaz por SVG inline** con `class="icon-svg icon-sm|md"` (trazo uniforme `stroke-width: 2`).
- **Incluir estados completos** en toda vista/tabla: carga (skeleton o indicador), vacío con acción de recuperación, error descriptivo (RFC 7807 legible) y offline en cola.
- **Garantizar `:focus-visible`** claro en modo Claro y Oscuro y enlace "Saltar al contenido" (skip link) en cada página operativa.

### Don't
- **No escribir `style="..."` con colores hex literales** en HTML o plantillas JS (`#0f172a`, `#ffffff`, `#e2e8f0`, etc.) que obligan a mantener selectores frágiles `[style*="..."]` en `styles.css`.
- **No usar `!important` como sustituto de especificidad limpia** ni `transition: all` / `will-change: all` / `100vh`.
- **No usar gradientes púrpuras/rosados genéricos ("AI slop")**, kickers/eyebrows innecesarios sobre encabezados principales ni tarjetas anidadas dentro de tarjetas.
- **No duplicar archivos HTML completos** entre raíz y subcarpetas si comparten ruta; definir una única fuente de verdad por pantalla en Fase 2.

