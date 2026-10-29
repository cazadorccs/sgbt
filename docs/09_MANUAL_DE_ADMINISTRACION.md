# Manual de Administración
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Perfil del Administrador y Acceso a la Consola

El perfil de **Administrador** está reservado para el personal autorizado de la Dirección General de Gestión Humana y la Dirección General de Tecnologías de la Información y la Comunicación (DGTIC). 

- **URL de Acceso:** `http://localhost:3000` (o dominio institucional asignado).
- **Mecanismo de Ingreso:** Credenciales institucionales acompañadas de segundo factor de autenticación (TOTP).

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

#### 2.2 Sincronización con la Base Central de Supabase
Tras completar la importación de nómina, transmita los datos a la nube ejecutando:
```powershell
node backend/sync-to-supabase.js
```
O presionando el botón **Sincronizar con Supabase Cloud** en la consola de administración.

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
