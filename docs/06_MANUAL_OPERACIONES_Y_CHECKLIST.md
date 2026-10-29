# Manual de Operaciones y Lista de Comprobación para Producción
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Lista de Comprobación Previa al Despliegue (*Go-Live Checklist*)

Antes de poner en marcha una jornada de entrega masiva o abrir la plataforma a usuarios finales, el administrador técnico debe completar obligatoriamente la siguiente lista de verificación:

- [ ] **1. Verificación del Entorno y Dependencias:**
  ```powershell
  node -v      # Requiere Node.js v18.0.0 o superior
  npm install  # Comprobar que no existan módulos faltantes
  ```
- [ ] **2. Ejecución de la Suite Completa de Pruebas Automatizadas:**
  ```powershell
  npm test
  ```
  *Criterio de aprobación:* 100% de pruebas aprobadas (mínimo 41 pruebas pasando sin fallos).
- [ ] **3. Aplicación de Migraciones de Base de Datos:**
  ```powershell
  npm run db:migrate
  ```
  *Criterio de aprobación:* Esquema relacional con soporte multi-ente, jornadas y restricciones de unicidad actualizado.
- [ ] **4. Comprobación de Conectividad con Supabase Cloud:**
  ```powershell
  npm run test:supabase
  ```
  *Criterio de aprobación:* Conexión REST confirmada y latencia promedio inferior a 800 ms.
- [ ] **5. Generación de Respaldo Preventivo de Base de Datos:**
  ```powershell
  npm run db:dump
  ```
  *Criterio de aprobación:* Generación exitosa del archivo `.sql` en el directorio de respaldos.
- [ ] **6. Verificación de Terminales Ópticas de Almacén:**
  - Cámaras de escaneo enfocando a distancia estándar (15 a 30 cm).
  - Almacenamiento local IndexedDB operativo en el navegador de la terminal.
  - Modo sin conexión validado desconectando el cable de red durante una prueba piloto.

---

### 2. Procedimientos Operativos Estándar (SOP)

#### SOP-01: Puesta en Marcha del Servidor Local
1. Inicie el servicio principal en la estación o servidor del almacén:
   ```powershell
   npm start
   ```
2. Acceda a la consola institucional: `http://localhost:3000` (o la dirección IP asignada en la red local institucional).

#### SOP-02: Carga y Actualización de Nómina Institucional
1. Ingrese con credenciales de **Administrador**.
2. Diríjase a la sección **Padrón de Nómina**.
3. Seleccione el archivo Excel suministrado por Gestión Humana (`.xlsx`).
4. Revise el panel de previsualización:
   - Verifique el total de registros detectados.
   - Si existen advertencias de cédulas duplicadas o formatos inválidos, subsánelas antes de presionar **Confirmar e Importar**.
5. Finalizada la carga, ejecute la sincronización con la nube:
   ```powershell
   npm run db:sync:supabase
   ```

#### SOP-03: Planificación y Apertura de Jornada de Despacho
1. En la consola administrativa, ingrese a **Gestión de Jornadas**.
2. Pulse **Nueva Jornada Institucional**:
   - Asigne el título (ej. `Jornada Institucional Noviembre 2026`).
   - Defina la fecha de inicio y cierre.
   - Seleccione los combos a distribuir (Víveres, Higiene, Limpieza, Charcutería).
   - Indique la población objetivo (General o por Departamentos).
3. Presione **Crear y Asignar Cuotas**. El sistema generará automáticamente las asignaciones correspondientes a cada trabajador formalizado.
4. Cambie el estado de la jornada a `en_curso` al iniciar la atención en los comedores o almacenes.

#### SOP-04: Cierre de Jornada y Emisión del Acta Ministerial
1. Finalizado el horario de atención, cambie el estado de la jornada a `finalizada`.
2. Diríjase a **Auditoría Ministerial**.
3. Pulse **Generar Acta Digital de Cierre**:
   - El sistema calculará automáticamente: porcentaje de cobertura, total de combos entregados, total de rezagados y métricas de adopción biométrica.
   - Se emitirá un resumen inmutable con sello criptográfico (*SHA-256 Hash*).
4. Exporte el acta en formato PDF para la firma de las autoridades correspondientes.

---

### 3. Procedimiento de Recuperación y Contingencia ante Fallos

| Escenario de Incidencia | Causa Probable | Protocolo de Actuación |
| :--- | :--- | :--- |
| **Pérdida total de conexión a Internet** | Falla de proveedor externo / enlace satelital. | El sistema continúa despachando en red local con SQLite. Los operadores no detienen la cola; los datos se acumulan localmente y se transmiten a la nube al restablecerse el enlace. |
| **Corte abrupto de energía en almacén** | Interrupción eléctrica sin UPS. | El motor SQLite en modo WAL previene la corrupción de archivos. Al reiniciar la estación, el sistema ejecuta la recuperación automática de diario en el arranque. |
| **Doble escaneo accidental en terminal** | Operador pasó el código dos veces seguidas. | El índice `idx_unique_daily_claim` rechaza la segunda lectura. La terminal emite un aviso visual en amarillo ("Entrega ya registrada") sin duplicar el descuento de inventario. |
| **Falla en el hardware de escáner óptico** | Suciedad en lente o cámara inoperativa. | El operador conmuta al modo **Búsqueda por Cédula de Identidad**, requiriendo confirmación visual del documento físico del trabajador. |
