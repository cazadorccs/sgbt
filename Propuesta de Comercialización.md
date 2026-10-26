# Propuesta de Comercialización y Modelos de Negocio
## Plataforma de Gestión de Bienestar y Transferencias Institucionales (SGBT)
**Sistema de Despacho de Beneficios con Passkeys FIDO2 y Motor Offline-First**

---

## Executive Summary (Resumen Ejecutivo)

El **Sistema de Gestión de Bienestar y Transferencias (SGBT)** es una solución tecnológica de clase empresarial diseñada para resolver una de las mayores ineficiencias en la entrega de beneficios, combos alimenticios y dotaciones corporativas/institucionales: **la pérdida de control, las colas interminables, la duplicidad de entregas y el colapso operativo en zonas sin conectividad a Internet (sótanos, almacenes, depósitos o sedes remotas)**.

A diferencia de las soluciones web tradicionales o el registro manual en hojas de cálculo, SGBT combina **arquitectura estricta Offline-First**, **autenticación biométrica de última generación mediante hardware seguro (Passkeys FIDO2 / WebAuthn)**, **garantía matemática de idempotencia (RFC 7807)** y **generación automática de actas de auditoría oficial**.

---

## 1. Propuesta de Valor Diferencial

| Reto Habitual en Almacén / Entrega | Solución Tradicional | Solución SGBT |
| :--- | :--- | :--- |
| **Falta de cobertura en sótanos/almacenes** | El sistema se cae; se recurre al papel manual que genera extravíos y descontrol. | **Motor Offline-First:** Terminales operan 100% desconectados vía IndexedDB y Service Workers v2.6. |
| **Fraude por suplantación y capturas de pantalla** | Carnets en PDF o códigos QR estáticos que se comparten por mensajería. | **Passkeys FIDO2 + QR Dinámico:** Firma biométrica local con expiración forzada a 180 segundos. |
| **Doble entrega por reintentos de red** | Peticiones duplicadas causan descuento doble de inventario. | **Middleware de Idempotencia:** Detección de claves duplicadas (`HIT-IDEMPOTENT`) e índice único de reclamo diario. |
| **Tiempos de espera y cuellos de botella** | Búsqueda manual por nombre o cédula (>45 seg/persona). | **Lectura óptica y validación en < 2 segundos**, confirmada con retroalimentación háptica y acústica. |
| **Auditoría y conciliación lenta** | Días o semanas consolidando listas físicas firmadas. | **Actas oficiales con firma criptográfica SHA-256**, desglose por dependencia y KPIs en tiempo real (SSE). |

---

## 2. Segmentos de Clientes Objetivo (Target Market)

### A. Sector Público / Entes Gubernamentales (B2G)
- **Clientes Potenciales:** Ministerios, Gobernaciones, Alcaldías, Institutos Autónomos, Corporaciones Públicas, Empresas del Estado y Cajas de Ahorro.
- **Caso de Uso:** Entrega controlada de bolsas de alimentos secos, combos proteicos en cadena de frío, juguetes navideños, combos escolares y dotación de uniformes a empleados públicos y jubilados.

### B. Sector Corporativo Privado e Industrial (B2B)
- **Clientes Potenciales:** Empresas agroindustriales, petroleras, manufactureras, empresas de logística, centros de distribución y minería con personal masivo en plantas.
- **Caso de Uso:** Asignación de beneficios alimenticios contractuales, control de acceso a comedores de planta y entrega de kits de seguridad industrial (EPP).

### C. Organizaciones No Gubernamentales y Programas Humanitarios (NGOs)
- **Clientes Potenciales:** Agencias de cooperación, fundaciones y bancos de alimentos.
- **Caso de Uso:** Distribución controlada de víveres e insumos médicos en operativos de campo, garantizando a los donantes auditoría forense inmutable de que cada insumo llegó a su beneficiario real.

---

## 3. Modelos de Comercialización

### Modelo 1: B2G / GovTech — Licenciamiento On-Premise + Mantenimiento Anual
*Recomendado para ministerios y entes públicos que requieren soberanía de datos y almacenamiento en centros de datos propios.*

1. **Licencia de Despliegue e Implantación (Fee Único Inicial):**
   - Instalación y puesta a punto en servidores dedicados del cliente (Docker / Linux On-Premise).
   - Personalización institucional completa (*White-Label* con membrete, logotipo y colores del ente).
   - Carga masiva y saneamiento del padrón inicial de trabajadores.
   - Configuración del catálogo de combos y sedes de distribución.
   - **Rango de Precio Sugerido:** $4,500 – $12,000 USD (según volumen de nómina y sedes).

2. **Contrato Anual de Soporte, Actualizaciones y SLAs (20% – 25% del valor de la licencia):**
   - Parches periódicos de seguridad y actualizaciones normativas.
   - Soporte técnico de guardia durante jornadas de despacho masivo.
   - Respaldo programado de bases de datos y monitoreo de integridad.
   - **Rango de Precio Sugerido:** $1,200 – $3,000 USD / año.

---

### Modelo 2: Software como Servicio (SaaS Multitenant en la Nube)
*Ideal para empresas privadas, contratistas medianas y organizaciones con múltiples sedes que desean rapidez de adopción sin gestionar servidores.*

| Nivel de Plan | Capacidad de Beneficiarios | Sedes y Funcionalidades | Precio Mensual | Precio Anual (Ahorro 15%) |
| :--- | :--- | :--- | :--- | :--- |
| **Starter** | Hasta 300 beneficiarios | 1 Punto de Despacho, PWA Offline, Exportación Excel/PDF | **$89 USD/mes** | **$900 USD/año** |
| **Profesional** | Hasta 1,500 beneficiarios | 3 Puntos de Despacho, Passkeys FIDO2, SSE en Vivo, Soporte WhatsApp | **$249 USD/mes** | **$2,500 USD/año** |
| **Enterprise** | Ilimitados (>1,500) | Multi-Sede Ilimitada, API REST para sincronización con SAP/Nómina, SLAs 99.9% | **$499 USD/mes** | **$5,000 USD/año** |

---

### Modelo 3: Pago por Operativo / Despacho (Pay-per-Claim)
*Orientado a clientes con entregas estacionales o trimestrales (por ejemplo: operativos navideños, dotaciones bianuales o programas especiales).*

- **Esquema:** Sin costos fijos recurrentes mensuales.
- **Tarifa Transaccional:** **$0.08 a $0.18 USD** por entrega efectivamente verificada y registrada en el acta final.
- **Incluye:** Activación temporal de la plataforma durante los 15 días previos y posteriores a la jornada, soporte en vivo y emisión del Acta Ministerial Criptográfica consolidada.

---

## 4. Servicios de Valor Agregado y Módulos Adicionales (Upselling)

1. **Kit de Hardware "Almacén Seguro":**
   - Venta o alquiler de tablets/smartphones industriales pre-configurados en modo "Kiosco" (aplicación bloqueada a pantalla completa) con fundas anticaídas y cámaras de enfoque rápido optimizadas para lectura de códigos en poca luz.
2. **Módulo de Inclusión para Adultos Mayores (Tarjetas NFC/Mifare):**
   - Solución orientada a jubilados o personas sin teléfonos inteligentes. Permite enrolar una tarjeta plástica de proximidad segura vinculada a su cédula.
3. **Conector Personalizado con Sistemas de Nómina y ERP:**
   - Integración automática con SAP, Oracle, SIGECOF o archivos de texto bancario para altas, bajas y cambios de estatus sin intervención manual.
4. **Capacitación y Acompañamiento en Sitio:**
   - Jornadas de formación para operadores de almacén, supervisores de mesa y personal de auditoría interna.

---

## 5. Estrategia de Demostración y Cierre de Ventas (Pitch Operativo)

Para acelerar la toma de decisiones, se cuenta con un entorno de demostración inmediata preconfigurado en el repositorio:
1. **Demostración de Resiliencia Offline (Efecto "Wow"):**
   - El presentador abre la PWA del operador, **apaga intencionalmente el WiFi / datos móviles del equipo** y escanea el carnet del beneficiario.
   - El sistema valida la firma criptográfica en pantalla en < 2 segundos, emite la vibración sensorial y almacena la entrega localmente. Al restablecer la red, sincroniza automáticamente sin duplicados.
2. **Perfiles Pre-cargados para Validación Inmediata:**
   - `Administrador General`: Msc. Sahib Franco (C.I. `13537582`) — Demostración de KPIs, nómina y exportación de Actas.
   - `Beneficiario Activo`: Carlos Eduardo Mendoza (C.I. `V-18456123`) — Demostración de generación de QR con Passkey.
   - `Operador de Mesa`: Miguel Ángel Torres (C.I. `V-14111222`) — Demostración de escaneo de alta velocidad y feedback háptico.

---

## 6. Documentación y Diagramas de Soporte para Licitaciones

Para respaldar técnicamente pliegos de contratación o propuestas formales, el proyecto cuenta con diagramas interactivos auditables bajo estándar Archify (`showcase`):
- **Diagrama de Arquitectura C4 Nivel 2:** [`docs/diagrams/c4-containers.html`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/docs/diagrams/c4-containers.html)
- **Diagrama de Secuencia y Flujo Criptográfico:** [`docs/diagrams/user-journey-sequence.html`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/docs/diagrams/user-journey-sequence.html)
- **Diagrama de Modelo de Datos Relacional (ERD):** [`docs/diagrams/modelo-datos-erd.html`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/docs/diagrams/modelo-datos-erd.html)
- **Especificación Oficial de API:** [`docs/openapi.yaml`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/docs/openapi.yaml) (OpenAPI 3.1)
