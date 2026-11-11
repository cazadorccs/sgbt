# Design System Master File — SGBT MIPPCI

> **LOGIC:** Al diseñar, auditar o rediseñar una página específica de SGBT, revisa primero `design-system/sgbt-mippci/pages/[page-name].md`.
> Si existe ese archivo, sus reglas de densidad, tema por defecto y disposición **anulan o especializan** este archivo Master.
> En ausencia de override específico, aplica estrictamente estas reglas maestras.

---

**Project:** SGBT MIPPCI (Sistema de Gestión de Bienestar y Transferencias)
**Updated:** 2026-11-11
**Category:** Government / Public Service / Offline-First Operational PWA
**Framework Stack:** Vanilla HTML5 + CSS Custom Properties + Vanilla JS ES5/ES6 (Express + Vercel, sin bundler)
**Methodology Stack:** `impeccable` + `ui-ux-pro-max` + `better-layout` + `make-interfaces-feel-better`

---

## 1. Global Design System Rules

### Color Palette (Normativa Dual Light + Dark + Senior Mode)

Fuente de verdad CSS en `public/css/styles.css` (ver también `DESIGN.md`):

| Role | Light Mode (`:root`) | Dark Mode (`[data-theme="dark"]`) | CSS Variable |
|---|---|---|---|
| Accent / CTA | `#0284c7` | `#0284c7` / `#38bdf8` (texto) | `--sea-pacific` / `--accent-primary` |
| Accent Hover | `#0369a1` | `#38bdf8` | `--accent-primary-hover` |
| Background | `#f8fafc` | `#0a0f1d` | `--bg-primary` |
| Surface Level 0 | `#f1f5f9` | `#0f172a` | `--bg-surface-0` |
| Card / Modal | `#ffffff` | `#141e33` | `--bg-surface-card` |
| Elevated Surface | `#ffffff` | `#1e293b` | `--bg-surface-2` |
| Border Subtle | `rgba(226, 232, 240, 0.9)` | `#25334d` | `--border-subtle` |
| Text Main | `#0f172a` | `#f8fafc` | `--text-main` |
| Text Muted | `#334155` | `#cbd5e1` | `--text-muted` |
| Text Dim (Labels) | `#64748b` | `#94a3b8` | `--text-dim` |
| Text Subtle (Disabled) | `#94a3b8` | `#64748b` | `--text-subtle` |
| Success | `#10b981` (`#ecfdf5` / `#065f46`) | `#34d399` (`rgba(16,185,129,0.18)`) | `--accent-emerald` / `--badge-green-*` |
| Warning / Offline Queue | `#f59e0b` (`#fffbeb` / `#92400e`) | `#fbbf24` (`rgba(245,158,11,0.18)`) | `--accent-amber` / `--badge-amber-*` |
| Destructive / Critical | `#ef4444` (`#fef2f2` / `#991b1b`) | `#f87171` (`rgba(239,68,68,0.18)`) | `--accent-rose` / `--badge-red-*` |

**Modo Accesible Adulto Mayor (`body.senior-accessible-mode`):**
- Fondo `#f1f5f9`, tarjetas `#ffffff`, texto `#000000`, bordes `2.5px solid #0284c7`, base tipográfica `19px`, controles `>= 50-52px` de alto y contraste >= 7:1 (AAA).

### Typography

- **UI / Headings / Body (`--font-main`):** `'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
- **Technical / IDs / Crypto (`--font-mono`):** `'JetBrains Mono', 'Fira Code', monospace` (exclusivo para cédulas, códigos TOTP, hashes Merkle RFC 6962 y centros de costo).
- **Accessible Alternative (Senior / Documentación):** evaluar adopción opcional de `'Atkinson Hyperlegible'` bajo `.senior-accessible-mode` en Fase 3 si mejora discriminación de caracteres (`0/O`, `1/I/l`, `6/9`).
- **Offline Font Safety:** al ser PWA Offline-First, todo `<link>` a Google Fonts debe usar degradación segura `font-display: swap` y pila de sistema sin bloquear el primer render.
- **Type Mechanics (`make-interfaces-feel-better`):**
  - `h1..h6`, `.modal-title`, `.card-title`, `.section-title`: `text-wrap: balance;`
  - `p`, `.description`, `.modal-body`, `.toast-body`: `text-wrap: pretty;`
  - Números dinámicos, contadores, timers y cédulas: `font-variant-numeric: tabular-nums;`

### Spacing, Layout & Viewport Discipline (`better-layout`)

| Token | Value | Usage |
|---|---|---|
| `--space-xs` | `0.25rem` (`4px`) | Separación interna mínima |
| `--space-sm` | `0.5rem` (`8px`) | Gap entre icono y texto, inline badges |
| `--space-md` | `1rem` (`16px`) | Padding estándar de controles e inputs |
| `--space-lg` | `1.5rem` (`24px`) | Padding de tarjetas y separación de secciones |
| `--space-xl` | `2rem` (`32px`) | Márgenes mayores de bloques / modales |

**Reglas estructurales obligatorias:**
1. **Agrupar con espacio antes que con líneas:** preferir separación vertical/gap generosa en lugar de múltiples bordes divisorios y tarjetas anidadas.
2. **Altura dinámica móvil:** usar `100dvh` en lugar de `100vh`; respetar `env(safe-area-inset-*)`.
3. **Sticky Header Clearance:** aplicar `scroll-padding-block-start` igual a la altura de `.master-header` + `8px`.
4. **Cero desborde horizontal:** usar `minmax(0, 1fr)` en grids y probar desde `320px` hasta `1440px` + zoom al `200%`.
5. **Una acción primaria por vista/modal:** mantener alineación entre el orden lógico del DOM y el orden visual.

---

## 2. Component Specs (Actualizado — Sin Anti-Patrones)

### Buttons & Interactive Hit Areas
- **Regla estricta:** **PROHIBIDO `transition: all`** (viola `make-interfaces-feel-better` y degrada rendimiento). Declarar siempre `transition-property` explícita.
- **Área táctil mínima:** `min-width: 44px; min-height: 44px;` en botones principales e iconos de cabecera; mínimo `40x40px` (ideal `44x44px` vía pseudo-elemento `::after` expandido cuando sea necesario) en botones pequeños (`X` de limpiar búsqueda, toggles, acciones de fila).

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.65rem 1.25rem;
  border-radius: var(--radius-sm);
  font-weight: 600;
  cursor: pointer;
  transition-property: background-color, border-color, color, box-shadow, transform, opacity;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

.btn:active:not(:disabled) {
  transform: scale(0.96);
}

.btn-primary {
  background-color: var(--accent-primary);
  color: #ffffff;
  border: 1px solid transparent;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--accent-primary-hover);
}
```

### Cards & Concentric Radius
- Elevación declarada **una vez** (`border` o `box-shadow` sutil; evitar borde pesado + sombra intensa).
- **Concentricidad:** si una tarjeta tiene `border-radius: var(--radius-lg)` (`16px`) y `padding: 16px` (`1rem`), sus paneles o botones hijos inmediatos no deben exceder `8px` (`--radius-sm`), o usar `var(--radius-md)` (`12px`) con padding proporcional (`8px` -> `4px`/`6px`).

### Inputs, Buscadores & Focus Ring
- Tamaño de fuente mínimo `16px` (`1rem`) en formularios móviles.
- `:focus-visible` explícito de `2px–3px` usando `--border-focus` (nunca `outline: none` sin reemplazo visible).

---

## 3. Anti-Patterns (Prohibido en SGBT MIPPCI)

- ❌ **Estilos inline hardcodeados (`style="color: #...; background: #..."`)** en HTML o plantillas JS.
- ❌ **`!important` innecesario** o selectores `[style*="..."]` para simular soporte Dark Mode.
- ❌ **`transition: all` / `will-change: all` / animaciones no interruptibles o que ignoren `prefers-reduced-motion`**.
- ❌ **Emojis como iconografía funcional de sistema** (reemplazar progresivamente por SVG stroke uniforme en Fase 3; respetar texto descriptivo donde aporte claridad).
- ❌ **`100vh` rígido** en lugar de `100dvh`.
- ❌ **Gradientes púrpuras/genéricos ("AI slop")**, kickers decorativos sobre `<h1>` o tarjetas anidadas sin función.

---

## 4. Pre-Delivery Verification Checklist (Consolidado 4 Skills)

Antes de aprobar cualquier PR o rediseño de vista (Fase 2–4):
- [ ] **Tokens & Temas:** la vista funciona en Light Mode, Dark Mode (`[data-theme="dark"]`) y `senior-accessible-mode` sin colores hardcodeados ni parches `[style*="..."]`.
- [ ] **Contraste WCAG 2.2:** >= 4.5:1 texto normal y placeholders; >= 3:1 en texto grande, iconos y bordes activos (`npm run test:wcag` verde).
- [ ] **Hit Areas & Teclado:** controles >= 44x44px (o >= 40x40px en utilitarios compactos), foco visible `:focus-visible`, skip link presente y orden DOM = orden visual.
- [ ] **Layout (`better-layout`):** sin scroll horizontal entre `320px` y `1440px` ni con zoom al `200%`; cabeceras sticky no tapan objetivos de foco (`scroll-padding-block-start`); una acción primaria clara por pantalla.
- [ ] **Micro-pulido (`make-interfaces-feel-better`):** radios concéntricos, `tabular-nums` en cifras/cédulas, `text-wrap: balance/pretty`, sin `transition: all`, y respeto a `prefers-reduced-motion`.
- [ ] **Estados completos:** carga, vacío, error recuperable, offline con cola diferida y éxito verificados con datos reales largos (nombres de departamentos MIPPCI).
