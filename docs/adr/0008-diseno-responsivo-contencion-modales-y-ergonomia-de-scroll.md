# ADR-0008: Diseño Responsivo, Contención Estricta de Modales y Ergonomía de Scroll

**Date**: 2026-10-25
**Status**: accepted
**Deciders**: Equipo de UI/UX, Frontend & Arquitectura de Software MIPPCI / SGBT

## Context

A medida que el sistema incorporó padrones institucionales masivos (>1,130 beneficiarios cargados) y 15 ventanas modales complejas (configuración de marca, carga masiva de nómina CSV, difusión WhatsApp por roles, entrega en vivo y carnet digital), surgieron retos ergonómicos y de usabilidad:

1. **Desbordamiento de Modales en Móviles**: Modales con anchos fijos inline (`max-width: 680px`, `980px`) y tablas internas sin contención horizontal se salían de los límites en pantallas estrechas (360px–375px), ocultando botones de acción y controles.
2. **Pérdida del Botón de Cerrar**: Al hacer scroll dentro de modales largos, la cabecera con el botón de cierre (`X`) se desplazaba fuera del viewport, atrapando al usuario.
3. **Scroll Infinito en Tablas Masivas**: El Directorio de Empleados y el Padrón de Auditoría se renderizaban en el flujo regular del documento, forzando un desplazamiento vertical de miles de píxeles para acceder a controles de filtrado o paginación.
4. **Colapso de Pestañas en Móvil**: La barra de subpestañas del panel administrativo se dividía en 3 a 4 filas verticales, consumiendo excesivo espacio vertical útil.
5. **Bloqueo del Perfil en Pantallas Pequeñas**: Reglas CSS heredadas (`.system-pills { display: none !important; }`) ocultaban el menú del usuario en dispositivos móviles, impidiendo ver la cuenta conectada y cerrar sesión.

## Decision

Adoptamos las directrices modernas de los estándares de diseño `make-interfaces-feel-better` y `frontend-design-direction`:

1. **Contención Dinámica por Viewport Clamping**:
   - Todo diálogo modal (`.modal-dialog`) implementa `max-width: min(calc(100vw - 1rem), 540px) !important;` y `max-height: min(92vh, 92dvh) !important;`, con variantes proporcionales para modales anchos (`modal-lg`, `modal-xl`).
   - Se aplicó `overscroll-behavior: contain;` y `overflow-x: hidden;` en `.modal-backdrop`, impidiendo el scroll no deseado de la página de fondo.

2. **Cabecera Fija en Modales (Sticky Header)**:
   - Se definió `position: sticky; top: -1rem; z-index: 30;` para `.modal-header-polished` y las cabeceras de diálogo, garantizando que el título y el botón de cerrar (`X`) permanezcan permanentemente visibles y accesibles durante el desplazamiento.

3. **Contención de Tablas Masivas (`.table-scroll-container`)**:
   - Se crearon contenedores con altura acotada (`max-height: clamp(380px, 58vh, 620px); overflow-y: auto; overflow-x: auto; -webkit-overflow-scrolling: touch;`).
   - Se fijó el encabezado de las tablas (`thead th { position: sticky; top: 0; z-index: 10; }`), eliminando el scroll vertical global infinito y facilitando la lectura de columnas en listas de gran tamaño.

4. **Navegación Móvil Horizontal Fluida**:
   - En pantallas $\le 768\text{px}$, la barra `.portal-subtab-bar` cambia a desplazamiento horizontal táctil (`flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none;`), simulando la experiencia de pestañas nativas de aplicación móvil.

5. **Hit-Areas Táctiles y Accesibilidad (WCAG 2.2 AA)**:
   - Botones, disparadores de menú y botones de cierre poseen dimensiones mínimas de $44 \times 44\text{px}$.
   - Se apilaron verticalmente los botones de pie de modal en móviles (`flex-direction: column-reverse; width: 100%;`), priorizando la acción principal al alcance del pulgar.

6. **Preservación del Menú de Usuario Móvil**:
   - En móviles se preserva `#userSessionPill` y su disparador de avatar, compactando el encabezado y permitiendo el despliegue del menú flotante de opciones institucionales y cierre de sesión.

7. **Números Tabulares y Tipografía**:
   - Se aplicó `font-variant-numeric: tabular-nums` a contadores, montos y cédulas de identidad, y `text-wrap: balance` a encabezados institucionales para prevenir saltos y líneas huérfanas.

## Alternatives Considered

### Alternative 1: Paginación estricta de servidor a 10 registros por vista
- **Pros**: Reduce la cantidad de DOM en pantalla.
- **Cons**: Entorpece la búsqueda visual rápida que los operarios de almacén realizan al contrastar físicamente cédulas con la nómina en modo offline.
- **Why not**: La contención por scroll virtualizado/scrollable container con encabezado fijo ofrece velocidad inmediata sin degradar la visualización del padrón completo.

### Alternative 2: Paginadores modales de múltiples pasos (Wizards) para todo
- **Pros**: Modales más pequeños por pantalla.
- **Cons**: Aumenta la fricción y el número de clics requeridos para tareas administrativas de configuración o difusión.
- **Why not**: Un modal continuo con cabecera sticky y botones apilables en móvil ofrece menor carga cognitiva y mayor agilidad.

## Consequences

### Positive
- Experiencia de usuario coherente y pulida tanto en smartphones de 360px como en terminales de escritorio de alta resolución.
- Eliminación total de scrollbars horizontales descontroladas y desbordamiento de márgenes en ventanas modales.
- El usuario siempre tiene a la vista el botón para cancelar o cerrar un modal sin importar la longitud de su contenido.
- Navegación ágil en el padrón de beneficiarios y auditorías con encabezados siempre visibles.

### Negative
- Requiere disciplina en el desarrollo de futuros modales para no sobreescribir las reglas de contención con anchos fijos sin viewport clamp.

### Risks
- **Desbordamiento por contenido preformateado o tablas no envueltas**: Mitigado exigiendo la clase `.table-scroll-container` o `overflow-x: auto;` en cualquier elemento tabular embebido.
