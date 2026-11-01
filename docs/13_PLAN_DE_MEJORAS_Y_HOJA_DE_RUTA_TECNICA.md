# Hoja de Ruta Técnica y Recomendaciones de Evolución
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI
**Documento:** `docs/13_PLAN_DE_MEJORAS_Y_HOJA_DE_RUTA_TECNICA.md`  
**Fecha de Publicación:** 1 de Noviembre de 2026  
**Área Responsable:** Dirección de Tecnología y Sistemas / Auditoría de Arquitectura de Software  
**Producción:** `https://sgbt-bice.vercel.app/` | **Repositorio:** `https://github.com/cazadorccs/sgbt.git`

---

## 1. Resumen Ejecutivo

Con la consolidación de la arquitectura híbrida (SQLite WAL local + Supabase Cloud en la nube), el motor de contingencias de tres niveles, el Modo Oscuro nativo y la segregación estricta de las cuatro vistas esenciales (Beneficiario, Despacho, Supervisor y Administrador), el **SGBT** ha alcanzado una etapa de madurez operacional y estabilidad estructural.

El presente documento define el **Plan de Evolución y Recomendaciones Estratégicas** para elevar la plataforma a un estándar de sistema gubernamental de misión crítica, categorizado en cuatro pilares de ingeniería de software, ciberseguridad, experiencia de usuario (UX) y gobernanza ministerial.

---

## 2. Pilares de Mejora y Recomendaciones Técnicas

### Pilar 1: Logística de Almacén y Operatividad Offline

#### 1.1 Soporte para Impresoras Térmicas Portátiles Bluetooth / USB (ESC/POS 58mm / 80mm)
- **Justificación Operacional:** En jornadas con miles de funcionarios, la Contraloría Interna y la Dirección General de Gestión Humana requieren frecuentemente un comprobante físico o talón firmado como respaldo legal del despacho.
- **Arquitectura de Implementación:**
  - Uso de la **Web Bluetooth API** (`navigator.bluetooth`) y **Web Serial API** para conexión directa sin controladores complejos.
  - Generación de comandos binarios ESC/POS directamente en el cliente.
  - **Estructura del Ticket Impreso:**
    * Encabezado institucional: *REPÚBLICA BOLIVARIANA DE VENEZUELA · MIPPCI*.
    * Número de Despacho único (`#del-XXXX`) y hora exacta (VET).
    * Datos del Beneficiario: Cédula de Identidad, Nombre, Departamento.
    * Detalle de Combos Entregados (Bolsa de Víveres, Combo Proteico).
    * Código QR de verificación rápida para inspectores en puerta.
    * Línea de firma para conformidad del trabajador.

#### 1.2 Semáforo de Afluencia de Colas en Tiempo Real (Heatmap de Despacho)
- **Justificación Operacional:** Disminuye el hacinamiento en pasillos y sótanos, distribuyendo la carga de retiro de forma natural durante la jornada.
- **Arquitectura de Implementación:**
  - Cálculo de la tasa de despacho de los últimos 15 minutos por mesa mediante Server-Sent Events (SSE).
  - Indicador visual en el carnet del beneficiario:
    * 🟢 **Fluida (Espera < 5 min):** La taquilla está despejada.
    * 🟡 **Moderada (Espera 5 a 15 min):** Tránsito regular.
    * 🔴 **Concurrida (Espera > 15 min):** Se sugiere esperar antes de bajar.

#### 1.3 Decodificación Óptica de QR en Web Worker (Off-Main-Thread)
- **Justificación Operacional:** En dispositivos Android de gama media o baja utilizados en almacén, mantener el flujo de video a 30 FPS mientras se procesa la matriz matemática del QR puede saturar la CPU y ralentizar la interfaz.
- **Arquitectura de Implementación:**
  - Trasladar el motor `jsQR` o `html5-qrcode` a un `Worker` dedicado mediante `OffscreenCanvas`.
  - El hilo principal de renderizado queda 100% libre para animaciones y confirmaciones sonoras sub-segundo.

---

### Pilar 2: Seguridad, Criptografía y Anti-Fraude Institucional

#### 2.1 Notificaciones Instantáneas de Retiro Anti-Suplantación (Web Push & Telegram/SMS)
- **Justificación Operacional:** Alerta inmediata al funcionario en el segundo exacto en que su beneficio es marcado como entregado, impidiendo fraudes por usurpación de identidad o terceros no autorizados.
- **Arquitectura de Implementación:**
  - Notificación Push criptográfica mediante la **Web Push API** (`serviceWorkerRegistration.showNotification`).
  - Mensaje claro:  
    *«Su combo de Víveres y Proteína fue retirado con éxito hoy a las 10:45 AM en Mesa 1. Si usted no realizó este retiro, presione aquí para alertar a Supervisión»*.
  - Canal alternativo mediante Bot Institucional de Telegram o webhook ministerial.

#### 2.2 Acta Ministerial Digital de Cierre de Jornada con Sello SHA-256
- **Justificación Operacional:** Formalización legal de la jornada para el cierre de cuentas de bienes nacionales y auditoría pública.
- **Arquitectura de Implementación:**
  - Botón de cierre definitivo de jornada por el Director / Super Administrador.
  - Consolidación matemática irreversible:
    $$\text{Combos Totales} = \text{Entregados} + \text{Pendientes No Retirados} + \text{Mermas/Averiados}$$
  - Cálculo del hash criptográfico SHA-256 del lote completo de transacciones.
  - Generación de documento PDF oficial con marca de agua, firmas de los testigos de jornada y código QR para validación pública de autenticidad en el portal.

---

### Pilar 3: Gobernanza de Datos y Auditoría Interna

#### 3.1 Tablero de Auditoría de Contingencias (Dashboard de Excepciones)
- **Justificación Operacional:** Monitoreo y rendición de cuentas sobre los despachos realizados fuera del flujo biométrico estándar.
- **Arquitectura de Implementación:**
  - Gráficos de desglose porcentual:
    * Entregas regulares por Passkey biométrica (Huella / Rostro).
    * Entregas por Aprobación de Contingencia del Supervisor.
    * Entregas delegadas a terceros con Carta Aval.
  - Registro cronológico detallado de qué supervisor autorizó cada caso y el motivo justificado (`adulto_mayor_sin_smartphone`, `battery_dead_screen_broken`, etc.).

#### 3.2 Exportador Oficial en Formato de Contraloría y Gestión Humana (Excel/CSV)
- **Justificación Operacional:** Evita la transcripción manual de datos al cierre de mes para los reportes ante el Ministerio de Planificación y la Dirección de Finanzas.
- **Arquitectura de Implementación:**
  - Exportación con cabeceras formales estandarizadas (Cédula, Nombres, Departamento, Cargo, Código de Barra de Bulto, Fecha/Hora, Operador Responsable).
  - Descarga instantánea en formato `.xlsx` con hojas separadas por Dirección General.

---

### Pilar 4: Empaquetado y Distribución de la Aplicación Móvil (.APK)

#### 4.1 Generación Automatizada de la .APK Release v3.6
- **Justificación Operacional:** Poner a disposición de los operadores de almacén el instalador nativo Android actualizado, optimizado con el nuevo diseño ergonómico y Dark Mode.
- **Arquitectura de Implementación:**
  - Ejecución del script de compilación Gradle (`cd android && ./gradlew assembleRelease`).
  - Alineación de assets mediante `zipalign` y firma criptográfica con el almacén de claves del proyecto (`sgbt-release-key.jks`).
  - Hospedaje de la APK en el portal institucional (`/download/sgbt-v3.6.apk`) con código QR para descarga e instalación directa en las terminales de almacén.

---

## 3. Matriz de Priorización (Impacto vs. Complejidad)

| Iniciativa | Impacto Operativo | Complejidad Técnica | Fase Recomendada |
| :--- | :---: | :---: | :---: |
| **Acta Ministerial de Cierre con Sello SHA-256** | 🔴 Alto | 🟢 Baja | **Fase 1 (Inmediata)** |
| **Compilación y Distribución APK v3.6** | 🔴 Alto | 🟢 Baja | **Fase 1 (Inmediata)** |
| **Impresión Térmica Bluetooth (ESC/POS)** | 🔴 Alto | 🟡 Media | **Fase 2 (Corto Plazo)** |
| **Dashboard de Auditoría de Excepciones** | 🟡 Medio | 🟢 Baja | **Fase 2 (Corto Plazo)** |
| **Notificaciones Push Anti-Suplantación** | 🔴 Alto | 🟡 Media | **Fase 3 (Mediano Plazo)** |
| **Semáforo de Colas en Tiempo Real** | 🟡 Medio | 🟡 Media | **Fase 3 (Mediano Plazo)** |
| **QR Decoder en Web Worker** | 🟡 Medio | 🔴 Alta | **Fase 4 (Optimización)** |

---

## 4. Conclusión

La implementación escalonada de estas recomendaciones consolidará al **SGBT (MIPPCI)** como una referencia de modernización tecnológica en la gestión pública nacional, combinando velocidad logística, soberanía digital, trazabilidad inalterable y transparencia administrativa.
