# Especificación del Piloto Controlado (PoC de 30 Días)
## Validación en Campo: Plataforma de Gestión de Bienestar y Transferencias (SGBT)

Este documento formaliza el marco de trabajo, alcance, cronograma y métricas de éxito para llevar a cabo una **Prueba de Concepto (PoC - Proof of Concept) de 30 días** en un entorno operativo real (ministerio, gobernación, empresa manufacturera o planta industrial).

---

## 1. Justificación y Propósito del Piloto
El objetivo primordial de esta prueba de concepto es validar en campo real que la implementación de **SGBT** produce un retorno operativo inmediato:
- **Disminución radical del tiempo de espera y colas de entrega.**
- **Eliminación del 100% de los extravíos o reclamaciones duplicadas.**
- **Operatividad ininterrumpida en sótanos y áreas de baja cobertura.**
- **Ahorro sustancial de horas-hombre en la conciliación y cierre de auditoría.**

---

## 2. Alcance del Piloto

| Dimensión | Parámetro Acordado para el Piloto |
| :--- | :--- |
| **Duración:** | 30 días continuos (1 ciclo completo de jornada de despacho). |
| **Población Objetivo:** | Desde 300 hasta 1,500 trabajadores beneficiarios (1 a 3 dependencias/gerencias). |
| **Puntos de Despacho:** | 1 o 2 mesas simultáneas de entrega en almacén o comedor de planta. |
| **Operadores Involucrados:** | 2 operadores de mesa, 1 supervisor de almacén y 1 auditor/administrador de RRHH. |
| **Infraestructura:** | Dispositivos móviles existentes (smartphones Android/iOS) o tablets en modo kiosco. |

---

## 3. Cronograma de Implementación (4 Semanas)

### Semana 1: Parametrización y Carga de Padrón Inicial
- Creación del espacio de trabajo institucional (*branding*, membrete, sedes de entrega).
- Carga e importación del archivo de nómina de prueba (CSV o Excel de los funcionarios seleccionados).
- Parametrización del catálogo de beneficios (ej: *Bolsa de Víveres Secos 12kg* y *Combo Proteico Pollo/Carne 4kg*).
- Validación de credenciales de acceso para supervisores y operadores de mesa.

### Semana 2: Campaña de Enrolamiento y Difusión al Trabajador
- Envío masivo de enlace PWA a los trabajadores del piloto (vía correo o WhatsApp institucional).
- Enrolamiento guiado del carnet digital con Passkeys en teléfonos personales (opcionalmente enrolamiento de tarjetas físicas de contingencia para quienes no posean smartphone).
- Taller práctico de 45 minutos para los 2 operadores de almacén: uso del escáner, reconocimiento de feedback háptico y manejo de excepciones.

### Semana 3: Jornada Real de Despacho (Día D del Operativo)
- Ejecución de la jornada de entrega utilizando la plataforma SGBT en las mesas de almacén.
- Despacho mediante escaneo de QR dinámico temporal en < 2 segundos por beneficiario.
- Simulación deliberada de corte de conectividad para verificar el almacenamiento local (`IndexedDB`) sin interrumpir la cola.
- Reconciliación automática y monitoreo en vivo desde el dashboard del director.

### Semana 4: Auditoría, Medición de KPIs e Informe Ejecutivo de Resultados
- Extracción del Acta Oficial de Despacho consolidada con firma digital SHA-256.
- Encuesta breve de satisfacción de 3 preguntas enviada a los trabajadores participantes.
- Presentación del informe comparativo formal (*Antes vs. Después*) ante el comité de dirección para la decisión de adquisición definitiva.

---

## 4. Métricas de Éxito Clave (KPIs de Evaluación)

| Indicador de Gestión | Método Tradicional (Línea Base) | Meta del Piloto SGBT | Método de Medición |
| :--- | :--- | :--- | :--- |
| **Tiempo de Atención por Persona** | 45 a 90 segundos (búsqueda en lista de papel y firma manual con bolígrafo). | **< 3 segundos** | Medición por cronómetro en mesa de despacho. |
| **Tasa de Extravíos o Reclamos Duplicados** | 2% a 5% de quejas por supuesta doble entrega o falta de registro. | **0.00% (Cero Extravíos)** | Verificación contra índice relacional `idx_unique_daily_claim`. |
| **Tiempo de Generación del Acta de Auditoría** | 3 a 5 días hábiles recopilando y cuadrando hojas físicas. | **Instantáneo (< 10 segundos)** | Clic en botón "Exportar Acta Oficial" con sello SHA-256. |
| **Resiliencia ante Caídas de Red** | Colapso de la operación o regreso al papel improvisado. | **100% de entregas registradas** | Simulación de desconexión sin retrasos en la fila. |
| **Satisfacción del Beneficiario** | Insatisfacción por colas largas y desorganización. | **> 90% de aprobación** | Encuesta de satisfacción post-entrega. |

---

## 5. Compromisos de las Partes

### Por parte del Proveedor (Equipo SGBT):
- Provisión de la plataforma en la nube o despliegue On-Premise temporal.
- Capacitación y acompañamiento técnico presencial o remoto durante la jornada de despacho.
- Entrega del informe ejecutivo final con el análisis de datos, ahorros proyectados y recomendaciones.

### Por parte del Cliente (Institución / Empresa):
- Asignación de un coordinador del piloto (Gerente de RRHH o Jefe de Almacén).
- Suministro de la lista de trabajadores seleccionados (Nombre, Cédula, Correo/Teléfono).
- Disposición de 1 o 2 terminales móviles con cámara para la mesa de despacho.

---

## 6. Siguientes Pasos para Iniciar
1. Suscripción del acuerdo de confidencialidad y términos de la PoC.
2. Definición de la fecha de la próxima jornada de entrega.
3. Inicio de la **Semana 1** de configuración y carga de nómina.
