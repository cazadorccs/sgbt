# SPEC: Proceso de Entrega y Despacho de Combos SGBT (MIPPCI)

GOAL:    El espectador (funcionario o supervisor) comprende con total claridad y confianza el flujo de entrega de combos alimenticios: desde la presentación del carnet móvil con QR dinámico, hasta el escaneo antifraude en almacén, la verificación de idempotencia y el sellado de auditoría ministerial.
OUTPUT:  HyperFrames, 1920x1080, 30 fps
TIME:    24 s x 30 fps = 720 frames (Tempo: 120 BPM, 15 frames per beat, 60 frames per bar)
LOOK:    Ground: Slate-50 (#f8fafc) institucional con acentos en Slate-900 (#0f172a).
         Ink: #0f172a (título principal), #334155 (texto secundario), #64748b (subtítulos y labels).
         Accent: #0284c7 (Azul MIPPCI) y #10b981 (Esmeralda de aprobación/despacho).
         Display: Inter / system-ui, weight 800, size 52px, tracking -0.03em.
         Body: Inter / system-ui, weight 600, size 26px, tracking -0.01em.
         Medium: Pantallas UI reales de la plataforma SGBT (Simulador móvil de carnet con borde telefónico y consola de despacho en almacén).
         Depth: Shadow offset 0 12px 35px rgba(15, 23, 42, 0.12), border-radius 24px, glass border 1px solid rgba(226, 232, 240, 0.9).
OBJECTS: 1. Smartphone Frame: Carcasa de dispositivo móvil (380x720px dentro del lienzo) con notch superior y pantalla táctil.
         2. Carnet Oficial MIPPCI: Cabecera azul institucional con avatar "SV", nombre de funcionario, cédula y código QR criptográfico dinámico con insignia de seguridad.
         3. Terminal de Mesa de Despacho: Consola táctil con visor de escaneo láser, ficha de trabajador, fotografía y listado de combos habilitados.
         4. Sello de Auditoría Ministerial: Sello gráfico de validación con marca temporal, hash SHA-256 e identificador de operador responsable.
MOTION:  Eases: power3.out (entradas de interfaz), power2.inOut (desplazamientos de cámara y paneos), back.out(1.4) (sellos de aprobación).
         Durations: 12 a 24 frames para transiciones de elementos; 45 frames para paneos de cámara.
SHOTS:
  - Shot 1 (0-150 / 0.0s - 5.0s):
      Hero move: El smartphone se eleva y centra con un suave push-in (+15% escala).
      Reads: "FASE 1: IDENTIFICACIÓN DEL BENEFICIARIO" (held 0.5s-4.5s) y datos del carnet digital.
      Handoff: La cámara se acerca al código QR dinámico que emite una onda de lectura.
  - Shot 2 (150-300 / 5.0s - 10.0s):
      Hero move: El escáner óptico de la Mesa de Despacho proyecta un haz de barrido láser sobre el QR.
      Reads: "FASE 2: ESCANEO Y LECTURA CRIPTOGRÁFICA" (held 5.5s-9.5s).
      Handoff: El haz se convierte en un pulso verde de validación y la vista rota hacia la pantalla del operador.
  - Shot 3 (300-480 / 10.0s - 16.0s):
      Hero move: Despliegue de la ficha de asignación con fotografía del trabajador y combos activos.
      Reads: "FASE 3: BLINDAJE ANTIFRAUDE E IDEMPOTENCIA" (held 10.5s-15.5s) con badge "Sin reclamos previos hoy: APROBADO".
      Handoff: El botón "Confirmar Entrega" pulsa y recibe el clic del operador.
  - Shot 4 (480-600 / 16.0s - 20.0s):
      Hero move: Sello de Auditoría Ministerial estampado con efecto back.out y generación del comprobante digital.
      Reads: "FASE 4: DESPACHO FÍSICO Y AUDITORÍA MINISTERIAL" (held 16.5s-19.5s).
      Handoff: El comprobante digital viaja de vuelta al smartphone del trabajador.
  - Shot 5 (600-720 / 20.0s - 24.0s):
      Hero move: Pantalla dividida: Carnet actualizado en verde "DESPACHADO CON ÉXITO" y métricas actualizadas en el Tablero Ministerial.
      Reads: "SISTEMA DE GESTIÓN DE BENEFICIOS A TRABAJADORES · MIPPCI" (held 20.5s-23.5s).
      Handoff: Freeze frame limpio de cierre institucional.
BANNED:  Fondos negros vacíos con partículas flotantes; animaciones que tapan el texto mientras se lee; degradados morados genéricos; efectos de neón ajenos a la identidad institucional; logos que rebotan sin propósito.
QA:      Frame 75: El código QR y los datos de SAHIB ALEXANDER FRANCO se leen nítidamente.
         Frame 225: La línea de escaneo láser pasa sobre el QR con claridad.
         Frame 390: La ficha de combos muestra los paquetes habilitados y la insignia verde de idempotencia.
         Frame 540: El sello de auditoría ministerial muestra fecha y UUID de transacción.
         Frame 660: La pantalla de cierre consolida el carnet despachado y el logotipo oficial MIPPCI.

