# ADR-0004: Motor de Feedback Háptico, Ergonomía Táctil y Estándares de Diseño para Almacenes

**Date**: 2026-10-24
**Status**: accepted
**Deciders**: Equipo de UI/UX, Operaciones Logísticas de Campo y Desarrollo Frontend MIPPCI

## Context

Los operadores en puntos de despacho y almacenes trabajan en ambientes ruidosos (tráfico de montacargas, ventiladores industriales, aglomeraciones), manipulando tabletas y terminales portátiles con guantes de trabajo o manos en movimiento continuo. 

El feedback meramente visual (pequeños textos en pantalla) pasa desapercibido, provocando dobles pulsaciones involuntarias, retrasos en la confirmación de entregas y errores en la selección de combos. Asimismo, interfaces con áreas táctiles reducidas (< 40px) y botones de cierre desalineados o heterogéneos entre ventanas modales degradan severamente la velocidad de despacho.

## Decision

Adoptamos un estándar de ingeniería de diseño y ergonomía física en la interfaz de usuario:

1. **Motor de Feedback Háptico Multimodal (`public/js/core/audio.js`)**:
   - Integración nativa con la Web Vibration API (`navigator.vibrate`) con patrones sensoriales diferenciados:
     - `tap`: 15ms de micro-vibración para confirmación de clics interactivos.
     - `combo_select`: 40ms de vibración firme al seleccionar una opción de combo alimenticio.
     - `success`: ráfaga dual `[60, 40, 100]` ms para confirmación indiscutible de despacho exitoso.
     - `error` / `warning`: secuencia de alerta `[100, 50, 100, 50, 150]` ms para advertir duplicidad o intento fraudulento.
   - Respaldo sonoro sutil mediante Web Audio API sintetizado para dispositivos de escritorio o terminales sin motor háptico.
2. **Ergonomía Táctil e Interacción**:
   - Tamaño objetivo mínimo de pulsación de 44x44px (cumpliendo WCAG 2.2 Nivel AA) en botones primarios, modales y botones de cierre.
   - Reemplazo de caracteres de texto simples (`&times;`, `X`) por botones estandarizados `.modal-close-btn` con iconos SVG vectoriales nítidos y accesibles (`aria-label="Cerrar modal"`).
   - Estructuración de filas simétricas con `.input-header-row` (`min-height: 28px`) para evitar desalineación entre campos paralelos de formularios modales.
3. **Optimización Tipográfica y Renderizado**:
   - Aplicación de `font-variant-numeric: tabular-nums` en cédulas, IDs y contadores KPI para evitar saltos de layout durante actualizaciones en vivo.
   - Balance tipográfico (`text-wrap: balance` y `text-wrap: pretty`) en encabezados y modales informativos.
   - Erradicación total de `transition: all` en CSS, reemplazándolo por transiciones selectivas sobre propiedades aceleradas por GPU (`transform`, `opacity`, `background-color`, `border-color`).

## Alternatives Considered

### Alternative 1: Solo Notificaciones Visuales Clásicas (Toasts y Modales)
- **Pros**: Cero integración con APIs de hardware del dispositivo.
- **Cons**: Los operarios frecuentemente no miran la pantalla mientras entregan la bolsa de comida o verifican el carnet físico, lo que ocasiona confusiones y dudas sobre si el escaneo fue aceptado.
- **Why not**: Genera cuellos de botella e incertidumbre en las líneas de despacho rápido.

### Alternative 2: Beep Acústico Estridente Constante
- **Pros**: Se escucha a distancia.
- **Cons**: Fatiga auditiva severa para los operadores tras 4 a 6 horas continuas de jornada; molesto e inaudible en ambientes extremadamente ruidosos.
- **Why not**: El feedback háptico en la mano del operario es silencioso, privado e instantáneamente perceptible.

## Consequences

### Positive
- Aumento medible en la velocidad y confianza del operario durante el despacho continuo.
- Disminución de dobles entregas accidentales y toques erróneos.
- Reducción drástica de la fatiga visual del personal de logística.
- Estética y consistencia visual premium en los 15 modales de la suite.

### Negative
- La Vibration API requiere interacción previa del usuario (gesto de usuario) conforme a las políticas de seguridad de navegadores modernos basados en Chromium / WebKit.

### Risks
- **Dispositivos antiguos o navegadores sin soporte de `navigator.vibrate`**: Mitigado mediante degradación elegante (guard clauses `if ('vibrate' in navigator)` sin lanzar excepciones).
