# Documento de Especificación de Requisitos de Software (SRS)
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Propósito y Delimitación del Problema

#### 1.1 Declaración del Problema Operativo
Históricamente, la entrega de beneficios institucionales y combos alimentarios ha operado mediante planillas impresas, firmas manuales susceptibles de adulteración, retrasos en la conciliación de nóminas y falta de trazabilidad en los puntos de despacho. Esta metodología introduce discrecionalidad, riesgo de doble retiro, disputas administrativas sobre asignaciones reales y demoras de semanas para consolidar un balance ministerial de entrega.

#### 1.2 Objetivo del Sistema
El **SGBT MIPPCI** tiene como meta erradicar la discrecionalidad mediante la digitalización criptográfica de extremo a extremo del proceso de asignación, despacho y fiscalización. La plataforma garantiza que:
1. Todo trabajador formalizado reciba con exactitud los combos asignados a su estatus institucional.
2. Cada retiro sea inmutablemente registrado mediante credenciales biométricas (Passkeys / FIDO2) o contingencia fiscalizada.
3. El almacén pueda despachar en modo sin conexión (*offline*) sin riesgo de fraude ni colisión por reintento.
4. Las autoridades institucionales cuenten con un balance en tiempo real y actas de cierre ministerial verificables.

#### 1.3 Alcance y Población Objetivo
- **Población Objetivo:** Funcionarios activos, personal contratado, jubilados y pensionados del Ministerio del Poder Popular para la Comunicación y la Información (MIPPCI) y entes adscritos (VTV, RNV, YVKE Mundial, AVN, Vive TV).
- **Operadores de Almacén:** Personal responsable del control físico de inventario y escaneo de credenciales en los puntos de despacho.
- **Administradores de Gestión Humana y TI:** Responsables de la carga de nóminas, configuración de catálogos y gobernanza de jornadas.

#### 1.4 Límites del Sistema (Fuera de Alcance)
- Cobros en dinero en efectivo, divisas o pasarelas de pago bancario (los beneficios se asignan por derecho laboral institucional).
- Gestión de compras y licitaciones de compras públicas con proveedores de alimentos.
- Logística de transporte de carga primaria desde puertos o plantas procesadoras hacia los almacenes centrales.

---

### 2. Requisitos Funcionales

#### RF-01: Gestión y Clasificación de Catálogo de Combos
- El sistema debe permitir el registro de combos con su denominación, descripción detallada, categoría nutricional, calorías e información dietética.
- Capacidad de activar o pausar combos sin eliminar el histórico de asignaciones previas.
- Asignación de combos a jornadas específicas mediante agrupaciones lógicas.

#### RF-02: Planificación y Control de Jornadas de Entrega
- Creación de jornadas con fecha de inicio, fecha de cierre, población objetivo (por tipo de trabajador o departamento) y punto de distribución.
- Capacidad de asociar múltiples combos simultáneos a una misma jornada (ej. Víveres, Higiene, Limpieza y Charcutería).
- Emisión masiva de asignaciones diarias (`daily_entitlements`) vinculadas a la jornada.
- Control de estados de la jornada: `programada`, `en_curso`, `finalizada`, `cancelada`.

#### RF-03: Identificación, Formalización y Retiro Criptográfico (Passkeys / FIDO2)
- El beneficiario no registrado puede completar su formalización capturando su fotografía mediante cámara web frontal en vivo (`capture="user"`) o seleccionando un archivo de imagen desde la galería de fotos de su dispositivo móvil.
- Asignación de contraseña institucional segura y vinculación física del dispositivo (`bound_device_id`), garantizando que al reiniciar sesión no se vuelva a exigir la formalización.
- El beneficiario formalizado debe poder enrolar su biometría (FaceID, TouchID, huella dactilar de Android o Windows Hello) sin depender de contraseñas compartidas.
- Generación de comprobante digital temporal mediante código QR dinámico firmado con expiración máxima de 180 segundos.
- Mecanismo de validación criptográfica en servidor mediante clave pública ECDSA P-256.

#### RF-04: Modos de Contingencia Fiscalizados
- En caso de beneficiarios sin teléfono inteligente, pérdida de dispositivo o problemas técnicos, el sistema provee:
  1. Despacho por Cédula de Identidad con comprobación de huella o firma asistida.
  2. Aprobación y anulación por Supervisor con registro obligatorio de motivo (`override_reason`).
  3. Despacho masivo por lote institucional con asignación de delegado departamental autorizado.
  4. Identificación y entrega de proximidad mediante tarjeta física NFC (`nfc_cards`).

#### RF-05: Operación en Almacén Desconectado (Offline Resilient)
- Las terminales de lectura deben validar y almacenar despachos localmente en IndexedDB si se interrumpe la conexión de red.
- Sincronización automática de cola de retiros al restablecer conectividad, aplicando cabeceras de idempotencia y validación contra el índice único anti-doble entrega (`idx_unique_daily_claim`).

#### RF-06: Ingesta Masiva y Conciliación de Nómina
- Carga de nómina institucional mediante hojas de cálculo Excel (`.xlsx`, `.xls`).
- Detección automática de columnas: Cédula, Nombres, Correo, Departamento, Tipo de Personal y Estatus.
- Validación de integridad con reporte de registros válidos y filas con error previo a la inserción definitiva.

#### RF-07: Persistencia Criptográfica Garantizada en la Nube (Supabase Cloud REST API)
- Capa de persistencia centralizada (`cloud_sync.service.js`) con ejecución asíncrona respaldada por `await` antes de responder al cliente HTTP, neutralizando el congelamiento de contenedores efímeros en Vercel Serverless.
- Respaldo atómico de formalización de beneficiarios, llaves biométricas WebAuthn, despachos físicos con resolución foránea (`entitlement_id`, `distribution_point_id`) y tarjetas NFC.
- Hidratación y reconciliación bidireccional en el arranque del servidor (`syncFromSupabase`) mediante manejo estricto de conflictos (`ON CONFLICT(credential_id)` y `ON CONFLICT(card_uid)`).

#### RF-08: Auditoría y Verificación DevSecOps Continua
- Disponibilidad del script de auditoría en vivo `npm run verify:cloud` que valida contra la base remota de Supabase Cloud los 6 procesos de integridad criptográfica y esquema relacional en < 6 segundos.

---

### 3. Requisitos No Funcionales

#### RNF-01: Rendimiento y Latencia
- El tiempo de validación y respuesta de un retiro en terminal de almacén debe ser menor a 300 milisegundos bajo red local.
- Soporte para escaneos continuos de al menos 60 entregas por minuto por estación de trabajo.

#### RNF-02: Disponibilidad y Tolerancia a Fallos
- Disponibilidad del 99.9% durante días de jornada activa mediante desacoplamiento SQLite local / Supabase Cloud.
- Si la conexión externa a Internet falla, la terminal de entrega continúa operando sin interrupción de servicio.
- Resiliencia absoluta en entornos serverless sin pérdida de credenciales ni despachos.

#### RNF-03: Seguridad y Confidencialidad
- Cero almacenamiento de contraseñas de beneficiarios en texto plano ni hashes reversibles.
- Las claves privadas biométricas jamás salen del circuito seguro del teléfono del usuario (*Secure Enclave / TPM*).
- Protección anti-repetición (*anti-replay attack*) mediante nonces de un solo uso vinculados a cada comprobante QR.
- Mitigación activa contra vulnerabilidades OWASP, inyección XSS, cookies `HttpOnly` y protección de cabeceras de seguridad.

#### RNF-04: Idempotencia y Prevención de Doble Despacho
- Todo intento de retransmisión por fallo de red o doble escaneo físico debe ser neutralizado a nivel de base de datos mediante restricción estricta de clave compuesta única (`worker_id`, `entitlement_id`).
- Cobertura de pruebas automatizadas del 100% (41/41 pruebas pasando sin fallos).
