# Proceso de Entrega y Despacho de Combos Alimenticios — SGBT (MIPPCI)

El Sistema de Gestión de Beneficios a Trabajadores (**SGBT**) del Ministerio del Poder Popular para la Comunicación y la Información (**MIPPCI**) opera bajo una arquitectura de grado bancario **Offline-First**, segura y transparente, garantizando que cada trabajador reciba su beneficio de forma ágil sin posibilidad de duplicidad en la entrega ni demoras operativas.

---

## 🏛️ Fase 1: Preparación de la Jornada (Apertura de Almacén)

1. **Activación de la Mesa de Despacho:**
   - El operador o despachador en el almacén accede a la plataforma en su tablet, smartphone o estación de trabajo mediante credenciales institucionales o Passkeys criptográficas (FIDO2 / WebAuthn).
2. **Carga del Paquete Diario (*Daily Pack*):**
   - El sistema descarga y precarga en el navegador (o en la APK móvil Android oficial) el padrón actualizado de trabajadores y asignaciones del día en su motor de base de datos local SQLite/IndexedDB.
   - **Garantía Offline:** Si se interrumpe la conectividad a Internet o la red local en el almacén o sótano, la jornada continúa operando al 100% de manera autónoma.

---

## 📲 Fase 2: Identificación del Beneficiario

El funcionario se presenta en el punto de entrega y cuenta con dos vías de atención:

1. **Vía Digital (Carnet Móvil Institucional):**
   - El beneficiario ingresa su cédula de identidad en la aplicación móvil.
   - Se despliega su **Carnet Digital Oficial** con su fotografía institucional, departamento, condición laboral y un **Código QR Criptográfico dinámico** protegido contra capturas estáticas o falsificaciones.
2. **Vía Cédula Física / Asistida:**
   - En caso de que el beneficiario no disponga de su dispositivo móvil, el operador puede localizarlo al instante en el padrón local por número de cédula o nombre.

---

## 🔍 Fase 3: Escaneo y Validación Antifraude

1. **Escaneo Óptico en Vivo:**
   - El operador enfoca el lector óptico o la cámara del dispositivo al código QR del carnet del trabajador.
2. **Verificación Instantánea en Pantalla:**
   - La interfaz de la Mesa de Despacho proyecta de forma inmediata:
     - 📸 Fotografía oficial del funcionario.
     - 👤 Nombre completo, cédula y cargo institucional.
     - 🏢 Dirección o dependencia administrativa de adscripción.
     - 📦 Cantidad y tipo de combos asignados para la jornada (ej. Combo Proteico, Combo Seco).
3. **Escudo de Idempotencia (`idx_unique_daily_claim`):**
   - El motor relacional valida en milisegundos si el funcionario ya retiró su combo durante la fecha activa:
     - 🟢 **Habilitado:** Si la asignación está disponible, el control de confirmación se activa en color verde.
     - 🔴 **Bloqueo Inmediato:** Si el beneficio ya fue entregado previamente en el día, el sistema emite una alerta visual y sonora indicando la hora exacta y el operador que procesó la entrega previa, imposibilitando entregas duplicadas.

---

## 📦 Fase 4: Entrega Física y Confirmación

1. **Despacho Físico:**
   - El personal de almacén hace entrega física de los combos correspondientes al funcionario.
2. **Firma y Registro del Despacho:**
   - El operador pulsa **"Confirmar Entrega"**.
   - El sistema sella la transacción con un registro de auditoría ministerial (identificador único UUIDv4, operador responsable, combos entregados, marca de tiempo al milisegundo e IP/dispositivo).
3. **Comprobante Digital:**
   - En el dispositivo del trabajador, el carnet actualiza su estado en tiempo real a **"Despachado / Recibido con Éxito"**, con opción a consultar y compartir su comprobante digital vía WhatsApp.

---

## 🔄 Fase 5: Auditoría Ministerial y Sincronización en la Nube

1. **Sincronización Transparente:**
   - Al restablecerse la conectividad a Internet, todas las entregas efectuadas en modo fuera de línea se transmiten silenciosamente hacia **Supabase Cloud**.
2. **Tablero de Control para Dirección General:**
   - En la Dirección General y la Dirección de Gestión Humana, la consola de Auditoría Ministerial monitorea en vivo:
     - Total de combos despachados vs. remanentes por departamento.
     - Velocidad y volumen de atención por operador y hora.
     - Trazabilidad inmutable para fines de contraloría interna y rendición de cuentas.

