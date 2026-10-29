# Manual de Usuario y Operaciones
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Guía para el Funcionario / Beneficiario

Esta sección describe el procedimiento para que cualquier trabajador activo, jubilado o contratado consulte y retire sus beneficios institucionales.

#### 1.1 Acceso al Sistema
1. Abra el navegador web en su teléfono móvil o computadora e ingrese al enlace institucional suministrado por la institución.
2. Ingrese su número de Cédula de Identidad (ej. `V-18923456`).

#### 1.2 Registro de Biometría (Passkey) — Paso Único
1. La primera vez que ingrese desde su dispositivo móvil personal, la pantalla le solicitará **Activar Acceso Seguro**.
2. Presione **Registrar Huella / Rostro**:
   - Su teléfono le pedirá confirmar con la huella digital, FaceID o el PIN de su dispositivo.
   - A partir de este momento, su teléfono queda vinculado de forma segura sin requerir contraseñas escritas.

#### 1.3 Consulta de Combos Asignados
- En la pantalla principal observará las jornadas activas y los combos asignados (por ejemplo: *Víveres, Higiene, Limpieza y Charcutería*).
- Podrá verificar la fecha límite de retiro y el punto de entrega asignado.

#### 1.4 Generación del Comprobante para Retiro en Almacén
1. Cuando se encuentre físicamente en la fila del almacén o comedor, presione **Generar Comprobante de Retiro**.
2. La pantalla generará un **Código QR dinámico**:
   - El código incluye una cuenta regresiva de **180 segundos**.
   - Muestre la pantalla de su teléfono al operador del punto de despacho.
   - Una vez escaneado y confirmado el retiro, el código cambiará de color y la pantalla confirmará que su beneficio fue entregado con éxito.

---

### 2. Guía para el Operador de Almacén (Punto de Despacho)

Esta sección describe el procedimiento para los operadores responsables de la entrega física de combos en los puntos de distribución.

#### 2.1 Preparación de la Estación de Despacho
1. Inicie sesión en la terminal o tableta del almacén con sus credenciales de operador.
2. Seleccione el **Punto de Distribución** correspondiente a su estación física.
3. Asegúrese de que el lector óptico o la cámara de la tableta apunte hacia el área de escaneo de los beneficiarios.

#### 2.2 Proceso de Escaneo y Despacho
1. Solicite al beneficiario que acerque el código QR de su teléfono a la cámara.
2. **Resultados de la lectura en pantalla:**
   - 🟢 **Pantalla Verde con Sonido de Confirmación:**  
     Indica que la asignación es válida y está pendiente. El operador procede a entregar físicamente los combos indicados en pantalla (Víveres, Higiene, etc.) y presiona **Confirmar Entrega**.
   - 🔴 **Pantalla Roja con Alerta Sonora:**  
     Indica que el código ya fue utilizado, está vencido o no corresponde a una jornada activa. El sistema prohíbe la entrega para evitar doble despacho.
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
