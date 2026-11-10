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

#### RF-09: Árbol Merkle Criptográfico de Auditoría Ministerial (RFC 6962 / SHA-256)
- Estructuración de todos los despachos de la jornada en un Árbol Merkle binario balanceado de 14 capas.
- Generación de pruebas de inclusión logarítmicas $O(\log_2 N)$ (Merkle Proof de 13 hashes, ~416 bytes) verificables matemáticamente en menos de 110 µs.
- Emisión del Acta Oficial Ministerial de Despacho con sello digital de integridad SHA-256 inmutable y desglose de toneladas por dirección.
- Endpoint de verificación pública: `GET /api/v1/admin/audit/merkle-verify`.

#### RF-10: Auto-Verificación Criptográfica en el Carnet del Beneficiario
- Endpoint de autoservicio `GET /api/v1/auth/my-merkle-proof` para que cualquier funcionario o jubilado verifique desde su teléfono móvil la autenticidad e inclusión de su entrega en la raíz del árbol ministerial sin requerir perfil de administrador.
- Interfaz gráfica modal con certificado de inmutabilidad digital, detalle de capas y botón de copiado de la prueba SHA-256.

#### RF-11: Alertas Web Push en Segundo Plano con VAPID (RFC 8291 / RFC 8292)
- Canal de notificaciones push asimétricas firmado con par de claves ECDSA P-256 (prime256v1).
- Persistencia de suscripciones de dispositivos en tabla relacional `push_subscriptions`.
- Notificaciones de escritorio y móviles emitidas por el Service Worker (`public/sw.js`) con pantalla apagada o navegador cerrado ante inicio de jornadas o retiros confirmados.
- Endpoints de suscripción: `/api/v1/notifications/vapid-public-key`, `/api/v1/notifications/subscribe`, `/api/v1/notifications/unsubscribe`.

#### RF-12: Delta Daily-Packs y Micro-Caché In-Memory para Despacho Offline
- Sincronización ultrarrápida mediante paquetes diarios comprimidos y soporte de deltas (`?since=...`), reduciendo el tamaño en red en -99.78% (de 1.15 MB a 2.56 KB).
- Micro-caché en memoria con tiempo de respuesta de 0.07 ms (197x de aceleración) y soporte completo de cabecera `ETag` SHA-1 (HTTP 304 Not Modified).
- Arranque instantáneo del servidor en < 28 ms con streaming asíncrono en segundo plano desde Supabase Cloud.

#### RF-13: Estación de Supervisión y Despacho Manual Dedicada para Laptops (/supervisor)
- Vista web autónoma e independiente de la consola de superadministración, diseñada ergonómicamente para laptops y computadoras en mesas de atención del almacén sótano.
- Consulta instantánea de beneficiarios mediante campo de búsqueda de cédula de gran formato, compatible con teclado físico y pistolas lectoras de código de barras USB/Bluetooth.
- Despacho y descuento de combos con selección de cuota asignada y registro obligatorio de motivo de contingencia (adulto mayor sin celular, dispositivo descargado, falla biométrica, comisión de servicio o contingencia operativa).
- Incorporación rápida al vuelo de funcionarios no censados sin requerir salir de la estación de supervisión.
- Visualización interactiva del Código QR Diario de Supervisor para autorizar excepciones ante despachadores móviles.
- **Ergonomía visual y accesibilidad:** Interfaz configurada de manera predeterminada en **Modo Claro** para máxima visibilidad en almacenes y puestos físicos, con botón toggle integrado en la barra superior para alternar fluidamente entre Modo Claro y Modo Oscuro según la iluminación del entorno (WCAG 2.2 AA).
- Segregación estricta de privilegios (Principio de Menor Privilegio): el supervisor opera sin visibilidad de las opciones técnicas de superadministrador (respaldos de BD, migración, edición de campañas, gestión de roles de usuarios ni configuración de marca).

---

### 3. Requisitos No Funcionales

#### RNF-01: Rendimiento y Latencia
- El tiempo de validación y respuesta de un retiro en terminal de almacén debe ser menor a 300 milisegundos bajo red local (promedio medido: 0.08 ms).
- Soporte para escaneos continuos de al menos 60 entregas por minuto por estación de trabajo (capacidad probada: > 13,000 req/s).

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
- Cobertura de pruebas automatizadas del 100% (10 suites, 47 pruebas unitarias, de contrato y E2E pasando sin fallos).

#### RNF-05: Empaquetado APK Android Nativo Automatizado (TWA)
- Soporte de instalación nativa Android mediante Trusted Web Activity (TWA) conforme a la especificación oficial de Google.
- Pipeline automatizado mediante `npm run apk:package` (`scripts/package_android_apk.js`) que valida artefactos, Digital Asset Links y genera el andamiaje Gradle en `build/android/`.
- Firma institucional inmutable vinculada al almacén de claves `android.keystore`.

---

### 4. Historias de Usuario (User Stories)

#### HU-BEN-01: Retiro Rápido con Carnet Digital Móvil y Passkey FIDO2
- **Como** Funcionario titular o Jubilado del MIPPCI,
- **Quiero** acceder a mi carnet digital desde mi smartphone y generar un código QR dinámico firmado biométricamente,
- **Para** retirar mis combos en mesa de despacho en menos de 5 segundos sin presentar cédula física ni firmar planillas de papel.
- **Criterios de Aceptación:**
  1. El QR expira a los 180 segundos.
  2. Al ser escaneado con éxito, la pantalla se actualiza con un comprobante digital verde de entrega autorizada.

#### HU-DES-01: Escaneo Óptico y Despacho en Mesa de Almacén
- **Como** Operador de Mesa de Despacho en el almacén sótano,
- **Quiero** escanear los códigos QR presentados por los trabajadores mediante la cámara trasera del teléfono con visor HUD,
- **Para** verificar en tiempo real la identidad, confirmar los combos asignados y registrar la entrega de forma inmediata.
- **Criterios de Aceptación:**
  1. El sistema emite pitido sonoro ("BEEP") y feedback háptico ante escaneos válidos.
  2. Si el trabajador ya retiró hoy, despliega inmediatamente un overlay rojo de duplicidad bloqueando la entrega.

#### HU-SUP-01: Estación Dedicada de Supervisión y Despacho Manual en Laptops (/supervisor)
- **Como** Supervisor de Jornada / RRHH ubicado en una mesa de contingencia con una laptop,
- **Quiero** disponer de una vista única y dedicada (`/supervisor`) para buscar beneficiarios por cédula, verificar sus combos y registrar la entrega manual,
- **Para** atender ágilmente a los funcionarios que no poseen smartphone, tienen la batería agotada o presentan fallas biométricas, sin tener acceso ni distracciones con las opciones técnicas de superadministrador.
- **Criterios de Aceptación:**
  1. El supervisor inicia sesión con su Cédula y PIN de seguridad de supervisor.
  2. El campo de búsqueda por cédula tiene enfoque automático y admite escaneo directo con pistola lectora de código de barras.
  3. Cada despacho manual exige seleccionar el motivo de contingencia oficial (Adulto mayor, teléfono descargado, falla biométrica, comisión o contingencia operativa).
  4. La estación muestra los KPIs en vivo de la jornada y la tabla de auditoría en tiempo real.
  5. La vista no contiene opciones de configuración técnica, bases de datos ni gestión de roles de superadministrador.
  6. La estación inicia de forma predeterminada en Modo Claro e integra un botón visible en la cabecera para alternar fluidamente entre Modo Claro y Modo Oscuro, recordando la preferencia del operador.

#### HU-SUP-02: Incorporación al Vuelo de Funcionarios Rezagados
- **Como** Supervisor de Jornada,
- **Quiero** presionar el botón "Incorporar Funcionario Nuevo" cuando una cédula consultada no se encuentre en el padrón,
- **Para** cargar sus datos esenciales (Cédula, Nombre, Dirección, Condición) y asignarle de inmediato sus combos de la jornada sin detener la cola física de entrega.
- **Criterios de Aceptación:**
  1. El modal pre-llena la cédula digitada previamente.
  2. Guarda el registro en la base de datos local y sincroniza con Supabase Cloud.
  3. Habilita automáticamente el botón de entrega manual para el funcionario incorporado.

#### HU-ADM-01: Gobernanza y Balance Ministerial en Tiempo Real (/coseg)
- **Como** Administrador General o Director de Gestión Humana,
- **Quiero** supervisar la consola de gobernanza (`/coseg`) y tener acceso directo e irrestricto a la Estación de Trabajo de Supervisión (`/supervisor`),
- **Para** auditar el balance en tiempo real, intervenir operativamente en contingencias complejas de entrega y asegurar la transparencia del beneficio institucional.
- **Criterios de Aceptación:**
  1. Acceso mediante Cédula y PIN de Super Administrador con auditoría de operaciones críticas.
  2. Botón directo y permanente en la barra superior de navegación de `/coseg` para acceder con un clic a la Estación de Supervisión (`/supervisor`).
  3. Reconocimiento automático de privilegios de Super Administrador en `/supervisor`, con insignia `👑 SUPER ADMIN`, banner de control maestro y enlace de retorno a `/coseg`.
  4. Capacidad de auditar, ejecutar despachos de contingencia y reiniciar entregas con autorización de seguridad.
