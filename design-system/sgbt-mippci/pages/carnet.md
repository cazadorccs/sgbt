# Page Override — Carnet Digital del Beneficiario (`/`)

> **Superficie:** `public/index.html` (vista móvil / trabajador autenticado)  
> **Modo `impeccable`:** `Operate` (acceso rápido en fila de despacho y consulta offline)  
> **Hereda de:** `design-system/sgbt-mippci/MASTER.md`

---

## Overrides respecto a `MASTER.md`

| Eje | Regla específica para Carnet `/` | Razón operativa |
|---|---|---|
| **Densidad (`--density`)** | **Baja / Espaciada (`1.25`)** | Lectura inmediata de pie en almacén o por adultos mayores sin fatiga visual |
| **Tema por defecto** | Respeta `sgbt_theme` (`ThemeManager`) + **acceso destacado a `senior-accessible-mode`** | Uso en teléfonos personales bajo luz solar exterior o sótano oscuro |
| **Viewport (`<meta>`)** | **Obligatorio permitir zoom (`maximum-scale=5.0`)** — eliminar `user-scalable=no` | Cumplimiento WCAG 2.2 SC 1.4.4 para baja visión |
| **Acción Primaria Única** | **Generar / Mostrar QR Dinámico de Despacho** (y verificación Merkle secundaria) | Evitar competir con menús secundarios durante la entrega en mesa |
| **Áreas Táctiles** | Mínimo **`48x48px`** (`52px` en modo Adulto Mayor) en acciones principales | Operación con una mano en cola de distribución |
| **Tipografía en Datos** | Cédula, vigencia QR y estado de combo con `tabular-nums`; inputs `>= 16px` | Prevenir auto-zoom en iOS/Android y saltos de reloj |

## Reglas de Contención Móvil
- Navegación inferior `.mobile-bottom-nav` con `padding-bottom: max(0.5rem, env(safe-area-inset-bottom))`.
- Tarjeta QR con marco de alto contraste fijo (`#ffffff` + `#0f172a` en módulos QR) incluso en Dark Mode, asegurando lectura óptica infalible para escáneres de almacén.
- Estado Offline debe mostrarse con indicador explícito en cabecera sin bloquear el acceso al carnet local cacheado en IndexedDB.

