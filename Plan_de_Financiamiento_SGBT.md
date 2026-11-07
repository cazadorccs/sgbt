# Plan Integral de Financiamiento y Presupuesto de Inversión
## Plataforma de Gestión de Beneficios y Transferencias Institucionales (SGBT)
**Sistema de Despacho de Beneficios con Passkeys FIDO2 y Motor Offline-First**

---

### Ficha Técnica de la Postulación a Financiamiento

| Campo | Detalle Institucional |
| :--- | :--- |
| **Nombre del Proyecto:** | Sistema de Gestión de Beneficios a Trabajadores (SGBT) |
| **Categoría / Vertical:** | GovTech / Logística Crítica / Identidad Soberana y Ciberseguridad |
| **Nivel de Madurez Tecnológica (TRL):** | **TRL 7** (Demostrado en entorno operativo real en sede MIPPCI con 1,136 beneficiarios) en ruta a **TRL 9** (Operativo multi-ente y escalamiento a nivel nacional). |
| **Monto Total del Financiamiento:** | **$68,500.00 USD** *(Sesenta y ocho mil quinientos dólares estadounidenses)* |
| **Duración de Ejecución del Fondo:** | **6 meses** (con modelo de sostenibilidad operativa a 24 meses) |
| **Ente Originador / Custodio:** | Dirección General de la Oficina de Tecnologías de la Información y la Comunicación (OTIC) · MIPPCI |
| **Responsable Técnico:** | Msc. Sahib A Franco — Director General de la OTIC |
| **Entorno de Demostración en Producción:** | [https://sgbt-bice.vercel.app/dossier](https://sgbt-bice.vercel.app/dossier) |

---

## 1. Resumen Ejecutivo de la Propuesta de Financiamiento

El **Sistema de Gestión de Beneficios a Trabajadores (SGBT)** es una plataforma tecnológica de clase gubernamental y grado bancario creada para erradicar las fallas estructurales históricas en la distribución masiva de beneficios alimenticios, dotaciones institucionales y transferencias en especie:
1. **Falta de cobertura en depósitos y sótanos:** Colapso de sistemas web convencionales que obliga al uso de planillas físicas en papel.
2. **Suplantación de identidad y retiros duplicados:** Vulnerabilidad de carnets impresos o códigos QR estáticos compartidos por mensajería.
3. **Pérdida de horas-hombre y semanas de conciliación manual:** Cuadre extenuante de inventario con mermas de entre un 8% y un 15% del tonelaje total.

El SGBT ya cuenta con un **MVP probado en campo al 100%** (Caso de Éxito MIPPCI: 1,136 beneficiarios atendidos, 16.47 toneladas de alimentos despachadas en menos de 3 horas, 0.00% de duplicados y conciliación inmediata rubricada con hash SHA-256).

### Objetivo del Financiamiento Solicitado:
Transicionar de la solución monosede validada (TRL 7) hacia una **plataforma federada multi-ente (TRL 9)** capaz de operar de manera concurrente en 10 instituciones públicas o corporativas, beneficiando de forma directa a más de **35,000 trabajadores y sus familias**, reduciendo los costos operativos de despacho en un **78%** y garantizando trazabilidad criptográfica inmutable ante órganos de auditoría y control de gestión.

---

## 2. Estudio de Mercado y Determinación del Monto de Financiamiento

Para determinar de forma científica y justificada el monto a solicitar, se realizó un análisis de costos comparativo entre:
- **Desarrollo a la medida tradicional desde cero (Agencia / Software Factory externa):** $120,000 – $180,000 USD (tiempo estimado de 14 a 18 meses).
- **Adquisición de software privativo internacional de logística (Licencias SAP / Oracle WMS):** $95,000 USD en licencias iniciales + $35,000 USD anuales de mantenimiento, sin arquitectura Offline-First ni biometría soberana FIDO2.
- **Sujeción al Modelo SGBT Financiado:** **$68,500.00 USD**, apalancado sobre una base de código ya funcional, reduciendo el riesgo de ejecución tecnológica a menos del 5%.

```
ESTRUCTURA DE AHORRO COMPARATIVO (BENCHMARK TECNOLÓGICO)
┌─────────────────────────────────────────────────────────────┬────────────────┐
│ Opción A: Desarrollo Externo a la Medida (Software House)   │ $150,000 USD   │
│ Opción B: ERP Propietario Comercial (SAP / Oracle WMS)       │ $130,000 USD   │
│ Opción C: Escalamiento y Maduración SGBT (Monto Solicitado) │  $68,500 USD   │
└─────────────────────────────────────────────────────────────┴────────────────┘
   AHORRO DIRECTO DE FONDOS RESPECTO AL MERCADO: 47.3% a 54.3%
```

---

## 3. Presupuesto Desglosado por Partidas de Inversión

El presupuesto total de **$68,500.00 USD** está distribuido en seis (6) cuentas de inversión rigurosamente estructuradas:

```
DISTRIBUCIÓN PORCENTUAL DEL PRESUPUESTO
┌──────────────────────────────────────────────────────────────────────────────┐
│  [■■■■■■■■■■■■■■■■]  Talento Humano e Ingeniería (38.7%) : $26,500 USD      │
│  [■■■■■■■■]          Hardware y Kioscos de Almacén (20.4%) : $14,000 USD      │
│  [■■■■■■]            Ciberseguridad y Auditoría (14.6%)    : $10,000 USD      │
│  [■■■■■]             Infraestructura Cloud y Red (12.4%)   :  $8,500 USD      │
│  [■■■■]              Despliegue Piloto y Formación (9.1%)  :  $6,200 USD      │
│  [■■]                Contingencias y Reserva (4.8%)        :  $3,300 USD      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### Partida 1: Talento Humano e Ingeniería de Software Especializada
*Duración: 6 meses de dedicación técnica intensiva para el escalamiento multi-tenant y endurecimiento de la plataforma.*

| Perfil / Rol Profesional | Dedicación | Tasa Mensual | Total Partida | Justificación Técnica del Rol |
| :--- | :---: | :---: | :---: | :--- |
| **Arquitecto de Software & Criptógrafo Lead** | 6 meses | $1,800.00 | $10,800.00 | Dirección del protocolo FIDO2 / WebAuthn, curvas ECDSA P-256, motor de firmas y sincronización SQLite WAL con Supabase/PostgreSQL. |
| **Ingeniero Frontend & Mobile PWA/TWA** | 6 meses | $1,300.00 | $7,800.00 | Optimización de la PWA Edge-to-Edge para beneficiarios, integración NFC P2P en Android y compilación de APK Kiosco con Wake Lock. |
| **Ingeniero Backend & DevSecOps** | 5 meses | $1,100.00 | $5,500.00 | Arquitectura de microservicios contenerizados (Docker/Kubernetes), políticas de Rate-Limiting, Idempotencia RFC 7807 y pipeline CI/CD. |
| **Especialista en QA, Automatización & E2E** | 4 meses | $600.00 | $2,400.00 | Ampliación de la suite de pruebas automatizadas (E2E Playwright, tests de penetración, simulación de cortes de red y estrés transaccional). |
| **SUBTOTAL PARTIDA 1:** | | | **$26,500.00** | *(38.7% del presupuesto total)* |

---

### Partida 2: Equipamiento de Campo, Terminales Kiosco y Hardware Seguro
*Adquisición de equipamiento físico para equipar 5 centros de despacho simultáneos en condiciones adversas de almacén.*

| Ítem / Descripción del Equipo | Cantidad | Costo Unitario | Total Partida | Especificaciones y Función Operativa |
| :--- | :---: | :---: | :---: | :--- |
| **Tablets Rugerizadas Industriales de Almacén** | 10 uds | $650.00 | $6,500.00 | Pantalla 10.1", Android 13 Enterprise, certificación militar MIL-STD-810G anticaídas, protección IP65 contra polvo/humedad y chip NFC integrado. |
| **Lectores Ópticos 2D / QR Inalámbricos de Alta Velocidad** | 10 uds | $180.00 | $1,800.00 | Escáneres industriales Bluetooth/USB capaces de decodificar pantallas de celulares con brillo mínimo o micas rayadas en < 150 ms. |
| **Lote de Tarjetas Criptográficas NFC Mifare DESFire EV3** | 2,500 uds | $1.20 | $3,000.00 | Solución de inclusión digital para adultos mayores o jubilados sin smartphones. Tarjetas de proximidad con cifrado AES-128. |
| **Sistemas de Respaldo Energético Portátil (UPS / Estaciones Litio)** | 5 uds | $340.00 | $1,700.00 | Baterías de alta capacidad para garantizar 8 horas continuas de despacho en mesas de almacén sin tomas eléctricas cercanas. |
| **Bases Ergonómicas con Bloqueo Antirrobo y Accesorios Kiosco** | 10 uds | $100.00 | $1,000.00 | Soportes mecánicos de seguridad para montaje en mesones de entrega rápida. |
| **SUBTOTAL PARTIDA 2:** | | | **$14,000.00** | *(20.4% del presupuesto total)* |

---

### Partida 3: Ciberseguridad, Auditoría Forense y Certificación Normativa
*Validación externa de grado bancario para garantizar la invulnerabilidad de la plataforma ante ciberataques y auditorías estatales.*

| Actividad / Servicio de Auditoría | Proveedor / Norma | Total Partida | Alcance Técnico |
| :--- | :--- | :---: | :--- |
| **Auditoría de Código Fuente Estática y Dinámica (SAST/DAST)** | Lineamientos Trail of Bits & OpenSSF | $3,500.00 | Análisis exhaustivo de desbordamientos, inyecciones, fuga de datos en reposo y gestión segura de memoria. |
| **Prueba de Penetración Externa (Penetration Testing / Red Team)** | Metodología OWASP Top 10 API Security | $3,500.00 | Intento de suplantación de identidad WebAuthn, ataques de repetición (*Replay Attacks*) y evasión de Idempotency-Key. |
| **Certificación de Cumplimiento de Datos Personales y Habeas Data** | Marco Ley de Infogobierno y Estándares FIDO Alliance | $3,000.00 | Certificación de que las biometrías nunca salen del dispositivo del usuario (Privacidad por Diseño / Zero-Knowledge). |
| **SUBTOTAL PARTIDA 3:** | | **$10,000.00** | *(14.6% del presupuesto total)* |

---

### Partida 4: Infraestructura de Servidores, Cloud y Conectividad Híbrida
*Cobertura de cómputo en la nube, dominios, licencias de red y servicios durante el período de desarrollo, pruebas y puesta en marcha (12 meses).*

| Componente de Infraestructura | Proveedor / Servicio | Duración | Total Partida | Justificación |
| :--- | :--- | :---: | :---: | :--- |
| **Clúster de Base de Datos PostgreSQL / Supabase Enterprise** | Supabase Cloud Dedicated Pro | 12 meses | $3,600.00 | Alta disponibilidad, réplica geográfica, copias de seguridad cada 60 segundos y conexiones SSL/TLS 1.3 estrictas. |
| **Instancias de Cómputo Backend y Edge CDN** | Vercel Enterprise / VPS Linux Docker | 12 meses | $2,400.00 | Alojamiento de la API REST, endpoints de Server-Sent Events (SSE) y entrega perimetral ultra-rápida de la PWA. |
| **Infraestructura de Pruebas de Carga Masiva** | K6 Cloud / Locust Cluster | Eventual | $1,000.00 | Simulación de estrés con 15,000 peticiones concurrentes de verificación de identidad. |
| **Servicios de Red Móvil de Respaldo (M2M Data SIMs)** | Operador de Telecomunicaciones | 12 meses | $1,500.00 | 10 tarjetas SIM con IP fija y APN corporativo seguro para sincronización de almacén cuando exista conectividad. |
| **SUBTOTAL PARTIDA 4:** | | | **$8,500.00** | *(12.4% del presupuesto total)* |

---

### Partida 5: Despliegue Piloto, Capacitación y Transferencia Tecnológica
*Operaciones en terreno para garantizar que el personal adopte el sistema sin fricción y con dominio absoluto.*

| Actividad de Despliegue | Entregable Concreto | Total Partida |
| :--- | :--- | :---: |
| **Jornadas de Formación a Operadores y Supervisores de Almacén** | 10 talleres presenciales prácticos con simulación de contingencias sin internet. | $2,200.00 |
| **Producción de Material Audiovisual y Manuales Multimedia** | Guías interactivas paso a paso, cápsulas de video para beneficiarios y afiches infográficos para los puntos de retiro. | $1,800.00 |
| **Soporte de Campo "In Situ" Durante Operativos Piloto** | Acompañamiento presencial de ingenieros de guardia durante 5 jornadas masivas de entrega real. | $2,200.00 |
| **SUBTOTAL PARTIDA 5:** | | **$6,200.00** |

---

### Partida 6: Fondo de Contingencia y Gestión de Riesgos
*Reserva técnica reglamentaria para mitigar variaciones imprevistas en costos de importación de hardware, fluctuaciones cambiarias o ajustes de laboratorio.*

| Rubro de Contingencia | Porcentaje de Cobertura | Total Partida |
| :--- | :---: | :---: |
| **Fondo de Reserva de Mitigación Operativa** | 4.8% del total del proyecto | **$3,300.00** |

---

### Resumen General del Presupuesto

$$\begin{array}{|l|r|c|}
\hline
\textbf{Categoría de Inversión} & \textbf{Monto (USD)} & \textbf{\%} \\
\hline
\text{Partida 1: Talento Humano e Ingeniería de Software} & \$26,500.00 & 38.7\% \\
\text{Partida 2: Equipamiento de Campo y Hardware Seguro} & \$14,000.00 & 20.4\% \\
\text{Partida 3: Ciberseguridad, Auditoría y Certificación} & \$10,000.00 & 14.6\% \\
\text{Partida 4: Infraestructura de Servidores y Cloud} & \$8,500.00 & 12.4\% \\
\text{Partida 5: Despliegue Piloto y Capacitación} & \$6,200.00 & 9.1\% \\
\text{Partida 6: Reserva de Contingencia} & \$3,300.00 & 4.8\% \\
\hline
\textbf{TOTAL GENERAL SOLICITADO} & \mathbf{\$68,500.00} & \mathbf{100.0\%} \\
\hline
\end{array}$$

---

## 4. Cronograma de Hitos y Desembolsos Vinculados a Resultados

Para garantizar la máxima transparencia ante el comité evaluador del concurso, los fondos no se solicitan en un pago único, sino mediante **cuatro (4) desembolsos condicionados al cumplimiento estricto de hitos técnicos auditables**:

```
CRONOGRAMA DE EJECUCIÓN E HITOS (GANTT TRIMESTRAL)
Mes 1              Mes 2              Mes 3              Mes 4              Mes 5              Mes 6
[--- HITO 1 ---]   [-------- HITO 2 --------]   [-------- HITO 3 --------]   [--- HITO 4 ---]
Desembolso 35%     Desembolso 30%               Desembolso 25%               Desembolso 10%
Arquitectura Base  Hardware & Multi-Ente        Piloto en 3 Entes           Certificación Final
```

| Hito | Plazo | Desembolso (%) | Monto (USD) | Entregable Técnico Verificable (Criterio de Éxito) |
| :---: | :---: | :---: | :---: | :--- |
| **Hito 1** | Mes 1 | **35%** | $23,975.00 | - Arranque del proyecto y contratación del equipo.<br>- Arquitectura Multi-Tenant desplegada en servidores de prueba.<br>- Especificación OpenAPI 3.1 certificada y suite de pruebas al 100%. |
| **Hito 2** | Mes 2-3 | **30%** | $20,550.00 | - Adquisición, configuración y puesta en modo Kiosco de las 10 tablets industriales rugerizadas.<br>- Programación de las 2,500 tarjetas criptográficas NFC para adultos mayores.<br>- Auditoría de seguridad estática y remediación de vulnerabilidades. |
| **Hito 3** | Mes 4-5 | **25%** | $17,125.00 | - Ejecución del Plan Piloto en tres (3) entes públicos o sedes simultáneas (atención de 5,000 trabajadores).<br>- Reporte de auditoría de penetración (Pen-test) aprobado sin hallazgos críticos.<br>- Emisión exitosa de las actas de despacho con hashes SHA-256. |
| **Hito 4** | Mes 6 | **10%** | $6,850.00 | - Informe final de impacto técnico-económico de la postulación.<br>- Manuales de usuario, transferencia de código y repositorio documental.<br>- Acta de cierre y balance de inversión liquidado al 100%. |

---

## 5. Análisis Costo-Beneficio y Retorno de Inversión (ROI)

### A. Retorno Financiero y Ahorro Directo para las Instituciones Beneficiarias

Tomando como base un despliegue institucional moderado en 3 entes públicos con una población combinada de **10,000 trabajadores** que reciben combos mensuales:

1. **Ahorro por Erradicación de Mermas y Desvíos (Cero Fraude):**
   - En sistemas tradicionales con planillas de papel se registra una merma promedio histórica del **8.5%** por duplicidad de retiros o retiros no autorizados.
   - En 10,000 combos valorados en $25 USD c/u = $250,000 USD/mes de dotación.
   - Una merma del 8.5% equivale a **$21,250.00 USD perdidos mensualmente**.
   - Con SGBT la duplicidad cae a **0.00%**, ahorrando **$255,000.00 USD anuales** solo en control de inventario.

2. **Ahorro en Horas-Hombre y Costo de Personal:**
   - La conciliación manual en papel consume un promedio de 160 horas de personal administrativo por operativo.
   - Con SGBT la conciliación es automática y toma **0 segundos** al cierre de la mesa. Ahorro de **$18,000 USD anuales** en horas extraordinarias y personal de soporte.

3. **Cálculo del Retorno de Inversión Social y Financiero (ROI):**

$$\text{ROI} = \frac{\text{Ahorro Anual Generado} - \text{Inversión en Financiamiento}}{\text{Inversión en Financiamiento}} \times 100$$

$$\text{ROI} = \frac{\$273,000.00 - \$68,500.00}{\$68,500.00} \times 100 = \mathbf{+298.5\% \text{ en el primer año}}$$

> **Conclusión Financiera:** El financiamiento del proyecto se **paga a sí mismo en menos de 3.2 meses** de operación gracias a los ahorros directos generados.

---

## 6. Sostenibilidad Financiera Post-Concurso (Business Model)

El proyecto SGBT está diseñado para ser **100% autosuficiente y financieramente rentable** una vez culminados los 6 meses de financiamiento del concurso, a través de los tres canales comerciales validados en la [Propuesta de Comercialización](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/Propuesta%20de%20Comercializaci%C3%B3n.md):

```
FLUJO DE INGRESOS POST-FINANCIAMIENTO (AÑO 1 AL AÑO 3)
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Licenciamiento B2G On-Premise : $6,000 – $12,000 USD por institución.    │
│ 2. Contratos de Mantenimiento y SLAs : 20% anual del valor de licencia.     │
│ 3. Modelo SaaS Corporativo B2B : Planes desde $249 a $499 USD/mes.          │
│ 4. Venta y Alquiler de Kioscos de Almacén : Margen de hardware del 30%.    │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Proyección de Ingresos Año 1 post-fondo:** $48,000 USD (6 entes incorporados).
- **Proyección de Ingresos Año 2:** $124,000 USD (18 entes incorporados + expansión SaaS privado).
- **Punto de Equilibrio (Break-Even Point):** Se alcanza en el **mes 8** (segundo mes post-financiamiento).

---

## 7. Matriz de Gestión de Riesgos y Mitigación

| Riesgo Identificado | Nivel de Impacto | Probabilidad | Estrategia de Mitigación Diseñada |
| :--- | :---: | :---: | :--- |
| **Resistencia al cambio de operadores de almacén** | Medio | Media | Interfaz táctil ultrarrápida que requiere menos de 3 toques por entrega, feedback sensorial por vibración y sonido, y acompañamiento presencial en las primeras 5 jornadas. |
| **Fallas eléctricas prolongadas en centros de entrega** | Alto | Media | Equipos dotados con baterías de litio portátiles de 8 horas de autonomía y modo de ahorro de energía estricto. |
| **Pérdida o daño de terminales en almacén** | Medio | Baja | Equipos rugerizados con certificación militar contra caídas de 1.5 metros sobre concreto y bases mecánicas con candado físico. |
| **Fluctuaciones cambiarias en importación de equipos** | Medio | Media | Fondo de contingencia del 4.8% ($3,300 USD) reservado para absorber sobrecostos de fletes e impuestos aduanales. |

---

## 8. Conclusiones y Factibilidad de la Postulación

1. **Proyecto Maduro y con Evidencia Empírica:** A diferencia de propuestas en fase de mera idea, el SGBT cuenta con un prototipo funcional desplegado, probado en auditoría real con más de 1,100 beneficiarios y documentado exhaustivamente.
2. **Monto Óptimo y Razonable:** Los **$68,500.00 USD** solicitados representan un presupuesto quirúrgico, sin partidas abultadas ni gastos suntuarios, orientado en un 73.7% a desarrollo de ingeniería, equipamiento de almacén y ciberseguridad.
3. **Impacto Social Inmediato:** Garantiza que los alimentos y beneficios lleguen a quienes verdaderamente les corresponden, eliminando la discrecionalidad y dignificando la experiencia del trabajador mediante tecnología de soberanía nacional.

---

*Documento elaborado para postulación a fondos de financiamiento, aceleración e innovación tecnológica institucional.*  
*Oficina de Tecnologías de la Información y la Comunicación (OTIC) · Ministerio del Poder Popular para la Comunicación y la Información (MIPPCI).*

