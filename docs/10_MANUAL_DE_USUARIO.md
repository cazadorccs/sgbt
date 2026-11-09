# Manual de Usuario y Operaciones
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Guía para el Funcionario / Beneficiario

Esta sección describe el procedimiento para que cualquier trabajador activo, jubilado o contratado consulte y retire sus beneficios institucionales.

#### 1.1 Acceso al Sistema
1. Abra el navegador web en su teléfono móvil o computadora e ingrese al enlace institucional (`https://sgbt-bice.vercel.app/` o enlace local).
2. Ingrese su número de Cédula de Identidad (ej. `V-18456123`).

#### 1.2 Formalización de Beneficiario (Paso Único Inicial)
Si el beneficiario aún no ha completado su expediente digital en el sistema:
1. El sistema desplegará el asistente de **Formalización de Beneficiario**.
2. **Fotografía de Perfil:**
   - **Tomar Foto:** Puede presionar "Tomar Foto" para activar la cámara frontal de su teléfono o webcam en vivo.
   - **Subir desde Galería:** O bien, puede presionar "Cargar Imagen" para seleccionar una fotografía nítida directamente desde la galería de fotos o archivos de su teléfono inteligente.
3. **Contraseña y Vinculación de Dispositivo:**
   - Defina una contraseña de seguridad institucional para su cuenta.
   - Confirme la contraseña y presione **Completar Formalización**.
4. **Persistencia Criptográfica Garantizada:**
   - La formalización, su foto, su contraseña y su dispositivo móvil quedan registrados de forma permanente en Supabase Cloud.
   - Al salir del sistema, cerrar el navegador o reiniciar sesión, sus datos permanecen guardados y accederá directamente a su carnet de beneficios sin que el sistema vuelva a solicitarle la formalización.

#### 1.3 Activación de Biometría (Passkey FIDO2)
1. Para ingresar en el futuro sin escribir contraseñas, presione **Activar Acceso Biométrico / Passkey**.
2. Confirme con la huella digital, FaceID o el PIN de su teléfono inteligente.
3. A partir de ese momento, podrá autenticarse instantáneamente en menos de 1 segundo.

#### 1.4 Consulta de Combos Asignados
- En la pantalla principal observará las jornadas activas y los combos asignados (por ejemplo: *Bolsa de Víveres Secos, Combo Proteico en Cadena de Frío, Higiene y Limpieza*).
- Podrá verificar la fecha límite de retiro, el peso total asignado y el punto de entrega.

#### 1.5 Generación del Comprobante para Retiro en Almacén
1. Cuando se encuentre físicamente en la fila del almacén o punto de despacho, presione **Generar Comprobante de Retiro**.
2. La pantalla generará un **Código QR dinámico firmado criptográficamente**:
   - El código incluye una cuenta regresiva de **180 segundos**.
   - Muestre la pantalla de su teléfono al operador del punto de despacho.
   - Una vez escaneado y confirmado el retiro, el código cambiará de color a verde y la pantalla confirmará que su beneficio fue entregado con éxito.

#### 1.6 Recuperación de Contraseña Olvidada (Autoservicio)
En caso de olvidar o extraviar su contraseña institucional asignada durante la formalización:
1. En la pantalla de inicio de sesión de beneficiarios, presione el enlace **"¿Olvidó su contraseña? Recupérela aquí"**.
2. En la ventana emergente, ingrese:
   - Su número de **Cédula de Identidad** (ej. `V-18456123`).
   - Su **Correo Electrónico Institucional** o su **Número Telefónico** registrado en nómina.
3. Presione el botón **Verificar Identidad**. El sistema corroborará sus datos contra el padrón oficial en menos de 1 segundo.
4. Al confirmar su identidad, ingrese su **Nueva Contraseña** (mínimo 4 caracteres) y escríbala nuevamente en el campo de confirmación.
5. Presione **Guardar Nueva Contraseña**.
6. Recibirá una confirmación exitosa y podrá ingresar de inmediato a su carnet de beneficiario utilizando su nueva clave.

#### 1.7 Historial de Recibos y Auto-Verificación Merkle en el Carnet Móvil
Cada funcionario cuenta con respaldo inalterable de todos sus retiros pasados:
1. En la esquina superior de su carnet de beneficiario, presione **"📜 Mis Recibos"**.
2. Podrá visualizar todas las jornadas en las que ha retirado combos, con detalle de fecha, rubros recibidos, peso bruto (~28.5 kg) y firma digital.
3. Presione **"Ver Comprobante Oficial Detallado"** para abrir el comprobante consolidado.
4. Presione **"🛡️ Auditar en Árbol Merkle Ministerial (RFC 6962)"**:
   - El sistema validará matemáticamente en tiempo real la inclusión de su recibo contra la raíz del árbol ministerial sellado.
   - Observará el hash SHA-256 de su entrega, la raíz de la jornada y los niveles logarítmicos de la prueba de inclusión.
   - Puede presionar **"📋 Copiar Prueba SHA-256"** para respaldar su comprobante ante cualquier ente de control.

#### 1.8 Notificaciones Web Push en Segundo Plano
1. Al acceder a la plataforma, el sistema solicitará autorización para enviarle avisos push institucionales.
2. Presione **"Permitir"**. Su dispositivo quedará registrado de forma segura mediante un canal cifrado ECDSA P-256 (VAPID).
3. Recibirá alertas instantáneas con la pantalla apagada o la aplicación cerrada cuando:
   - Inicie una nueva jornada de distribución para su departamento.
   - Su combo sea escaneado y retirado en las mesas de despacho, garantizando protección anti-suplantación en tiempo real.

---

### 2. Guía para el Operador de Almacén (Punto de Despacho)

Esta sección describe el procedimiento para los operadores responsables de la entrega física de combos en los puntos de distribución.

#### 2.1 Preparación de la Estación de Despacho
1. Inicie sesión en la terminal o tableta del almacén con sus credenciales de operador.
2. Seleccione el **Punto de Distribución** correspondiente a su estación física (ej. `ALM-MIPPCI - Almacén Central`).
3. Asegúrese de que el lector óptico o la cámara de la tableta apunte hacia el área de escaneo de los beneficiarios.

#### 2.2 Proceso de Escaneo y Despacho
1. Solicite al beneficiario que acerque el código QR de su teléfono a la cámara, o acerque su tarjeta física NFC a la antena de proximidad (Tap-to-Claim).
2. **Resultados de la lectura en pantalla:**
   - 🟢 **Pantalla Verde con Sonido de Confirmación y Vibración Háptica:**  
     Indica que la asignación es válida y está pendiente. El operador entrega físicamente los combos indicados en pantalla (Víveres, Proteína, etc.) y el sistema liquida la entrega registrándola de inmediato en SQLite y en Supabase Cloud.
   - 🔴 **Pantalla Roja con Alerta Sonora:**  
     Indica que el combo ya fue retirado previamente, el código está vencido o no corresponde a una jornada activa. El sistema prohíbe la entrega para evitar doble despacho.
   - 🟡 **Pantalla Amarilla (Advertencia):**  
     Indica que el código expiró antes de ser escaneado. Solicite al beneficiario que presione "Actualizar Código" en su teléfono.

#### 2.3 Atención en Régimen de Contingencia (Sin Teléfono Móvil)
Si el beneficiario manifiesta no poseer teléfono inteligente, haberlo extraviado o tener problemas de batería:
1. Cambie a la pestaña **Búsqueda por Cédula de Identidad**.
2. Ingrese el número de Cédula y presione **Buscar**.
3. Verifique visualmente que los nombres en el documento de identidad coincidan con la ficha en pantalla.
4. Si la asignación está disponible, presione **Despachar por Contingencia**. La operación quedará asentada en la bitácora con trazabilidad de supervisor.

#### 2.4 Operación Continua sin Conexión (Modo Desconectado / Offline)
- Si la conexión a Internet o al servidor central se interrumpe, la terminal continuará leyendo y registrando entregas normalmente.
- En la esquina superior aparecerá un indicador naranja: **Modo Desconectado (Entregas en cola: X)**.
- Tan pronto regrese la conectividad, las entregas se sincronizarán automáticamente de forma segura. No detenga la fila ni apague la terminal mientras existan entregas pendientes en la cola local.
