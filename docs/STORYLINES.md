# Propuestas de Storyline para el Video: Proceso de Entrega y Despacho SGBT (MIPPCI)

Video explicativo de alta definición (1920×1080 @ 30fps) basado en pantallas reales del sistema SGBT, animado con el framework HyperFrames (HTML/CSS + GSAP frame-by-frame).

---

## Opción A (Recomendada): "La Jornada Perfecta" (Flujo Real de Principio a Fin)
> **Razón de la recomendación:** Es la historia más directa, humana y pedagógica; guía al espectador exactamente a través de la experiencia del funcionario y del operador sin distracciones técnicas innecesarias.

- **Dispositivo y Forma:** El ejemplo trabajado de principio a fin (*The worked example*) con cadena de objeto a objeto (*Object-to-object chain*).
- **Los primeros 2 segundos:** Primer plano del Carnet Digital Móvil en un smartphone; el código QR dinámico parpadea con su aura esmeralda y los datos del funcionario: "SAHIB ALEXANDER FRANCO VILLANUEVA — 13537582".
- **Línea de Beats:**
  1. *Hook (0-4s):* Funcionario abre su carnet móvil con su QR dinámico protegido.
  2. *Escaneo (4-8s):* La cámara del operador en almacén escanea el código instantáneamente.
  3. *Verificación (8-14s):* La Mesa de Despacho proyecta la foto oficial, departamento y combos asignados.
  4. *Idempotencia (14-18s):* El sistema valida la regla de única entrega diaria y habilita el botón verde "Confirmar Entrega".
  5. *Entrega & Sello (18-24s):* Personal de almacén entrega los combos físicos y se genera el sello digital.
  6. *Payoff (24-30s):* El carnet se actualiza a "Despachado con Éxito" y los datos sincronizan con el tablero ministerial.
- **Look:** Azul marino institucional (#0284c7, #0f172a), componentes UI reales con esquinas redondeadas y tipografía moderna Inter.
- **Sonido:** Ritmo corporativo moderno de precisión, con efectos sonoros de escaneo óptico (bip) y confirmación exitosa.

---

## Opción B: "El Escudo Antifraude y Resiliencia Offline" (Enfoque Técnico y Seguridad)
- **Dispositivo y Forma:** Enfoque en la regla de no duplicidad (`idx_unique_daily_claim`) y la resiliencia en sótanos/almacenes sin conexión. Zoom continuo y cortes analíticos de alta velocidad (*Split-screen & continuous dive*).
- **Los primeros 2 segundos:** Pantalla con alerta de almacén sin señal que conmuta en verde brillante: "MODO OFFLINE ACTIVO — MOTOR SQLITE AUTÓNOMO".
- **Línea de Beats:**
  1. *Hook (0-4s):* El almacén pierde conexión pero el sistema sigue despachando con el Paquete Diario local.
  2. *Escaneo Rápido (4-9s):* Múltiples escaneos de funcionarios atendidos en segundos.
  3. *Intento de Doble Reclamo (9-15s):* Un funcionario intenta retirar por segunda vez; el sistema dispara una alerta roja con el historial del primer retiro.
  4. *Despacho Legítimo (15-22s):* Validación correcta de beneficiario legítimo y entrega física.
  5. *Payoff (22-30s):* Vuelve el internet y la cola local se sincroniza en milisegundos con Supabase Cloud.
- **Look:** Estilo centro de mando cibernético, fondo oscuro slate, badges esmeralda y ámbar de alta visibilidad.
- **Sonido:** Pulso electrónico dinámico, clics mecánicos y sfx de escaneo láser.

---

## Opción C: "El Viaje del Combo: De la Nube al Trabajador" (Visión Estratégica Ministerial)
- **Dispositivo y Forma:** Perspectiva macro a micro. Un plano secuencia continuo (*One continuous take*) que viaja desde el tablero del Ministro/Director General hasta la entrega en manos del trabajador.
- **Los primeros 2 segundos:** Dashboard ministerial con gráficas de barras animadas y el contador en tiempo real: "2.267 Beneficiarios · Jornada Activa MIPPCI".
- **Línea de Beats:**
  1. *Hook (0-5s):* Dirección General activa la jornada y supervisa la asignación por dependencias.
  2. *Viaje al Almacén (5-11s):* La cámara desciende fluidamente al punto de entrega en almacén.
  3. *Atención en Vivo (11-19s):* Funcionario presenta su cédula/carnet y es despachado con su combo.
  4. *Trazabilidad en Vivo (19-25s):* El despacho resta de los pendientes y suma a los atendidos en el monitor superior.
  5. *Payoff (25-30s):* Comprobante enviado por WhatsApp al funcionario y reporte de contraloría sellado.
- **Look:** Estilo gubernamental B2G Enterprise prémium, con sutiles gradientes dorados y celestes sobre fondo blanco y azul profundo.
- **Sonido:** Orquesta moderna ascendente con clímax inspirador.

