# SPEC: Proceso Integral de Entrega y Despacho de Combos SGBT (MIPPCI)

GOAL:    Explicar minuciosamente y a nivel de cada pantalla el proceso de entrega de combos alimenticios: desde la preparación del almacén y descarga del Daily Pack, el carnet móvil con QR dinámico y NFC, el escaneo óptico en la mesa de despacho, el blindaje de idempotencia (idx_unique_daily_claim), el despacho por contingencia asistida, hasta la auditoría ministerial en vivo y la emisión del acta oficial.
OUTPUT:  HyperFrames, 1920x1080, 30 fps
TIME:    36 s x 30 fps = 1080 frames (6 escenas de 6.0 segundos cada una)
LOOK:    Ground: Deep Slate (#090d16 y #0f172a) con acentos de cristal institucional (#141e33).
         Ink: #ffffff (título principal), #cbd5e1 (texto secundario), #94a3b8 (labels y metadatos).
         Accent: #0284c7 (Azul Institucional MIPPCI), #38bdf8 (Celeste Eléctrico), #10b981 (Esmeralda Despacho Aprobado), #f59e0b (Ámbar Contingencia).
         Display: Inter / system-ui, weight 800, tracking -0.02em.
         Mono: JetBrains Mono para hashes SHA-256, cédulas y restricciones SQL.
         Medium: Pantallas reales del sistema SGBT: Carnet Móvil en smartphone, Consola de Despacho en Almacén, Modal de Contingencia y Tablero de Control Ministerial.
         Depth: Sombra multicapa 0 25px 60px rgba(0, 0, 0, 0.8), bordes translúcidos 1px solid rgba(56, 189, 248, 0.25).

OBJECTS: 1. Smartphone Frame (view-worker): Carcasa móvil con App Bar MIPPCI, semáforo de afluencia, bultos (víveres + proteína), candado KEY-XXXX y QR dinámico de 60s.
         2. Terminal de Mesa de Despacho (view-distributor): Consola de almacén con visor láser, fotografía del funcionario, bultos y badge SQLCipher offline.
         3. Monitor de Idempotencia: Bloqueo de seguridad con constraint idx_unique_daily_claim y transición multiestación.
         4. Módulo de Contingencia y Sello Ministerial: Modal de supervisor para trabajadores asistidos y sello de auditoría con hash SHA-256.
         5. Consola Central Ministerial (view-admin): KPIs en tiempo real (tonelaje, 0.0% mermas), progreso por direcciones y emisión de Acta Oficial.

SHOTS:
  - Scene 1 (0-180 / 0.0s - 6.0s) [compositions/scene1.html]:
      Hero: Smartphone del trabajador con carnet institucional y QR dinámico rotativo.
      UI: App Bar oficial, semáforo de colas (<3 min), cuota de bultos y barra de cuenta regresiva de 60s.
      Banner: "Fase 1: Carnet Digital Oficial y Visor de Retiro Móvil" (Paso 01 / 06).
  - Scene 2 (180-360 / 6.0s - 12.0s) [compositions/scene2.html]:
      Hero: Apertura de Almacén en Mesa de Despacho y descarga del Paquete Diario Offline (Daily Pack).
      UI: Consola del operador, indicador SQLCipher, botón Daily Pack (2,267 beneficiarios en SQLite local) y lector láser activo.
      Banner: "Fase 2: Mesa de Despacho y Arquitectura Offline-First" (Paso 02 / 06).
  - Scene 3 (360-540 / 12.0s - 18.0s) [compositions/scene3.html]:
      Hero: Escaneo óptico en menos de 115 ms y verificación de identidad en pantalla.
      UI: Visor con HUD de confirmación, fotografía oficial del trabajador, adscripción y desglose físico de rubros.
      Banner: "Fase 3: Verificación Criptográfica y Validación Óptica" (Paso 03 / 06).
  - Scene 4 (540-720 / 18.0s - 24.0s) [compositions/scene4.html]:
      Hero: Escudo de Idempotencia estricta (idx_unique_daily_claim) y despacho multiestación.
      UI: Validación de reclamo único, prevención de duplicidad, y transición interactiva a Estación 2 (Cava Proteica).
      Banner: "Fase 4: Regla de Idempotencia y Despacho Multiestación" (Paso 04 / 06).
  - Scene 5 (720-900 / 24.0s - 30.0s) [compositions/scene5.html]:
      Hero: Despacho Asistido / Contingencia y Sello Criptográfico Inmutable.
      UI: Modal de supervisor asistido para adultos mayores sin móvil + estampado del sello "DESPACHADO" con UUID y SHA-256.
      Banner: "Fase 5: Contingencia Asistida y Sello Criptográfico" (Paso 05 / 06).
  - Scene 6 (900-1080 / 30.0s - 36.0s) [compositions/scene6.html]:
      Hero: Tablero de Auditoría Ministerial en Tiempo Real, Acta Oficial y Sincronización Cloud.
      UI: Dashboard con métricas de tonelaje, 0.0% mermas, Acta Ministerial descargable y sincronización PWA a Supabase.
      Banner: "Fase 6: Auditoría Ministerial y Conciliación Logística" (Paso 06 / 06).

QA:   Frame 90: QR dinámico del trabajador con temporizador visible.
      Frame 270: Consola del operador con botón Daily Pack y estado SQLCipher.
      Frame 450: Fotografía del funcionario y HUD de validación en visor láser.
      Frame 630: Badge de Idempotencia idx_unique_daily_claim y transición a estación proteica.
      Frame 810: Sello oficial ministerial con UUID y hash SHA-256.
      Frame 990: Tablero con KPIs en vivo y Acta Oficial Ministerial generada.
