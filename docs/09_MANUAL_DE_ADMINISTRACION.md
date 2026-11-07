# Manual de Administración
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Perfil del Administrador y Acceso a la Consola Segura (`/coseg`)

El perfil de **Administrador** está reservado para el personal autorizado de la Dirección General de Gestión Humana y la Dirección General de Tecnologías de la Información y la Comunicación (DGTIC). 

- **URL de Acceso Directo:** `https://sgbt-bice.vercel.app/coseg` (o `http://localhost:3000/coseg`).
- **Mecanismo de Ingreso y Segregación Estricta:** 
  1. En la pantalla inicial o en `/coseg`, seleccione la modalidad **Administrar Sistema**.
  2. Ingrese su **Cédula de Identidad** (ej. `13537582`) o su **Correo Electrónico Institucional**.
  3. Ingrese el **PIN de Seguridad Administrativo Oficial** (`ADMIN_ACCESS_SECRET`).
  4. **Segregación Trail of Bits:** El sistema **rechaza terminantemente el uso de contraseñas de beneficiario** para ingresar al panel de administración. Solo se concederá acceso y alcance administrativo (`session_scope: 'admin'`) si se valida el PIN oficial.
  5. Si un usuario con rol administrativo ingresa mediante el portal público de beneficiarios (con su clave personal de 4 dígitos), se le otorgará alcance de beneficiario y tendrá restringidas todas las rutas y operaciones de gestión hasta que ingrese por la consola formal con su PIN.

---

### 2. Módulo de Gestión de Nómina y Padrón de Trabajadores

#### 2.1 Carga Masiva desde Archivo Excel
1. Navegue al menú lateral y seleccione **Padrón de Nómina**.
2. Presione el botón **Importar Nómina Excel**.
3. Seleccione el archivo suministrado por Recursos Humanos en formato `.xlsx` o `.xls`.
4. El archivo debe contener al menos las siguientes columnas (el sistema tolera mayúsculas o variaciones de cabecera):
   - `Cédula` o `Cedula` (ej. `V-12345678`)
   - `Nombres y Apellidos` o `Nombre`
   - `Correo` o `Email`
   - `Departamento` o `Dirección`
   - `Tipo` (Activo, Contratado, Jubilado, Pensionado)
5. El sistema presentará una **Vista Previa de Validación**:
   - Total de registros detectados.
   - Cantidad de trabajadores nuevos vs. existentes a actualizar.
   - Detalle de filas rechazadas por inconsistencia o duplicidad.
6. Presione **Confirmar e Importar Nómina**.

#### 2.2 Sincronización y Auditoría en Supabase Cloud
El sistema ahora persiste automáticamente cada cambio en la nube. Para auditar y verificar que todos los datos se encuentran íntegramente respaldados en Supabase Cloud, ejecute:
```powershell
npm run verify:cloud
```
El script evaluará las 7 tablas maestras, credenciales formalizadas, passkeys WebAuthn, entregas y tarjetas NFC, arrojando un reporte de conformidad en tiempo real.

#### 2.3 Directorio de Empleados y Padrón con Contadores en Tiempo Real
1. En la pestaña **Directorio de Empleados**, el sistema presenta una barra superior de métricas consolidadas:
   - **Total Padrón:** Cantidad neta de funcionarios registrados (ej. 1,138+ funcionarios).
   - **Personal Activo:** Total de funcionarios activos y contratados.
   - **Personal Jubilado:** Total de jubilados y pensionados.
   - **Formalizados:** Cantidad y porcentaje de funcionarios que ya completaron su auto-registro fotográfico y asignaron contraseña institucional.
2. Dispone de un buscador en tiempo real por Cédula, Nombres, Departamento o Correo, así como filtros por estatus de formalización (`precargado` vs. `registrado`).

#### 2.4 Módulo de Gestión de Credenciales y Contraseñas
1. Al hacer clic en cualquier trabajador dentro del Directorio o presionar el botón **Gestionar Credenciales**, se despliega el modal administrativo de contraseñas.
2. **Acciones Disponibles para Administradores:**
   - **Asignación Manual de Contraseña:** Permite definir directamente una contraseña temporal segura para el funcionario en caso de contingencia.
   - **Restablecer a Estatus Precargado (Auto-Registro):** Elimina la contraseña previa y regresa al funcionario al estatus `precargado`, forzando que en su próximo ingreso deba realizar el flujo de auto-enrolamiento con captura fotográfica.
   - **Revocación Inmediata de Passkeys:** Botón de emergencia para desvincular celulares extraviados o cambiados.

---

### 3. Módulo de Planificación de Jornadas de Entrega

#### 3.1 Apertura y Configuración de una Nueva Jornada
1. Seleccione **Gestión de Jornadas** en el panel principal.
2. Presione el botón **Crear Jornada**:
   - **Título:** Asigne una denominación institucional clara (ej. `Jornada Ordinaria Noviembre 2026`).
   - **Rango de Fechas:** Defina la fecha de inicio y la fecha de finalización del operativo.
   - **Población Objetivo:** Seleccione si la convocatoria aplica a toda la nómina (`all`) o a departamentos específicos.
   - **Selección de Combos:** Marque los beneficios a entregar en simultáneo (ej. *Víveres, Higiene, Limpieza, Charcutería*).
3. Presione **Guardar y Generar Asignaciones**.
   - El sistema calculará e insertará automáticamente las cuotas individuales (`daily_entitlements`) para cada trabajador convocado.
4. Cuando inicie la atención física en los almacenes, cambie el estatus de la jornada a **En Curso**.

#### 3.2 Monitoreo de Despacho en Vivo
En la pestaña **Monitoreo en Tiempo Real**, el administrador puede visualizar:
- Curva de entregas por minuto vía Server-Sent Events (SSE).
- Desglose de porcentaje de avance por dirección o ente adscrito.
- Alertas de intentos de doble retiro bloqueados automáticamente por el sistema.

#### 3.3 Cierre y Emisión de Actas de Auditoría
1. Al culminar el período de retiro, cambie el estatus de la jornada a **Finalizada**.
2. Diríjase a **Auditoría y Actas**.
3. Seleccione la jornada y presione **Generar Acta Ministerial**:
   - Se compila un reporte consolidado con: total formalizado, combos retirados, balance de rezagados y porcentaje de cumplimiento.
   - El sistema genera un sello digital inmutable (*hash SHA-256*).
4. Descargue el documento para su archivo formal y firma de las autoridades correspondientes.
