Especificación Técnica Completa: App de Combos Alimenticios con Passkeys y Sincronización Offline
1. Visión General del Sistema
Aplicación móvil y plataforma backend orientada a optimizar el registro, asignación y entrega de combos alimenticios para trabajadores corporativos e industriales. Utiliza Passkeys (FIDO2 / WebAuthn) y biometría nativa del smartphone para garantizar entregas presenciales e irrefutables sin contraseñas ni códigos estáticos.
2. Autenticación Biométrica y Passkeys
Aislamiento por Hardware: La biometría (Face ID, Touch ID, huella dactilar) es procesada exclusivamente dentro del procesador seguro del dispositivo (Secure Enclave en iOS / TEE en Android). La app nunca accede a los datos biométricos puros.
APIs Nativas: Uso de LocalAuthentication en iOS y BiometricPrompt en Android.
Firma Criptográfica: El sensor biométrico autoriza el uso de una llave privada para firmar digitalmente las solicitudes o desafíos (challenges) de entrega.
3. Flujos Operativos y Experiencia de Usuario
Registro e Inscripción (Enrollment):
El trabajador se da de alta en la plataforma.
Genera su Passkey desde la App: la llave privada se guarda en el chip seguro del teléfono y la llave pública se envía al servidor backend.
Solicitud de Combos: Selección de menú, fecha y punto de entrega.
Verificación en el Punto de Distribución:
QR Dinámico Firmado: El teléfono genera una firma digital local con el ID del trabajador, combo y timestamp. La firma se convierte en un QR dinámico con tiempo de expiración (30-60s).
El distribuidor escanea el QR y el sistema valida la firma en tiempo real.
4. Arquitectura de Sincronización Offline (Offline-First)
El sistema garantiza el funcionamiento ininterrumpido en comedores subterráneos o sitios de trabajo con baja o nula conectividad mediante cuatro fases:
Precarga de Datos en la App del Distribuidor: Descarga diaria de trabajadores activos, llaves públicas FIDO2 y derechos de combos (daily entitlements) a una base de datos local (SQLite).
Firmado y Verificación Criptográfica Local: La Passkey del trabajador firma el paquete de datos en su celular sin requerir red. La App del distribuidor valida la firma localmente usando la llave pública precargada.
Cola de Sincronización Diferida (Sync Queue): Las entregas aprobadas offline se almacenan localmente en el dispositivo del distribuidor con un UUIDv4 como identificador de entrega y la bandera is_offline_sync = true.
Reconciliación e Idempotencia en Backend: Al recuperar conexión a internet, la cola se transmite al backend en lote. El servidor aplica reglas de idempotencia y registra la hora de sincronización (synced_at).
5. Modelo de Datos Relacional y Prevención de Fraudes
Esquema de base de datos optimizado para PostgreSQL:
workers: Información general del trabajador.
passkey_credentials: Registro de llaves públicas (credential_id, public_key, sign_count).
combos: Catálogo de menús alimenticios.
daily_entitlements: Asignación diaria de combos y turnos por trabajador.
distribution_points: Comedores y puntos móviles de entrega.
deliveries: Registro de entregas con prueba de firma (signature_proof), nonce y metadatos de sincronización.
Regla Anti-Fraude (Índice Único): Un índice único estricto ON deliveries (worker_id, entitlement_id) evita que un trabajador reclame el mismo combo dos veces en el mismo día, incluso si intenta escanear en diferentes puntos offline.
6. Planes de Contingencia
Validación por Supervisor: Autorización manual por cédula o número de empleado con firma biométrica del supervisor en caso de batería baja o pérdida del dispositivo.
Tarjeta NFC/RFID de Respaldo: Vinculada al perfil del trabajador para casos excepcionales.