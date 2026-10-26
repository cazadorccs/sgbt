# Guía de Demostración Rápida (Live Demo en 5 Minutos)
## Plataforma de Gestión de Bienestar y Transferencias (SGBT)

Esta guía describe el guion paso a paso para realizar una demostración ejecutiva de alto impacto ante directores de tecnología, gerentes de recursos humanos, administradores de almacén o comisiones de compras, **demostrando la resiliencia offline en vivo**.

---

## 🎯 Objetivo de la Demostración
Demostrar en **menos de 5 minutos** que:
1. El sistema opera de forma ágil e intuitiva tanto para el beneficiario como para el operador de almacén.
2. La entrega se realiza de forma **100% desconectada de Internet**, validando la firma criptográfica en hardware y emitiendo feedback háptico.
3. El administrador institucional cuenta con trazabilidad total en tiempo real y generación instantánea del Acta Oficial de Despacho.

---

## 👥 Perfiles Pre-cargados para la Demostración

| Perfil | Nombre | Cédula | Rol / Misión en la Demo |
| :--- | :--- | :---: | :--- |
| **Super Administrador** | Msc. Sahib A Franco | `13537582` | Monitoreo de KPIs, auditoría y emisión de actas ministeriales. |
| **Beneficiario Activo** | Carlos Eduardo Mendoza | `V-18456123` | Solicitud y exhibición del Carnet Digital y código QR dinámico temporal. |
| **Operador de Almacén** | Miguel Ángel Torres | `V-14111222` | Escaneo en mesa de despacho con cámara y confirmación háptica. |

---

## ⏱️ Guion de Demostración (Minuto a Minuto)

### Minuto 0:00 – 1:00 | Apertura y Vista del Beneficiario
1. Inicie la aplicación en `http://localhost:3000` (o abra la PWA instalada en su dispositivo móvil).
2. En la pantalla de inicio, haga clic en el chip rápido **Carlos Mendoza (V-18.456.123)**.
3. **Puntos Clave a Destacar:**
   - Visualización instantánea del carnet digital con el detalle de combos asignados (Ej: 1 Combo Proteico + 1 Bolsa de Víveres Secos).
   - El beneficiario presiona **"Generar QR de Retiro"**.
   - Muestre el contador regresivo de **180 segundos**: *"Este código QR es temporal y está firmado con criptografía ECDSA P-256 en el chip del teléfono; si alguien toma una captura de pantalla y la envía por WhatsApp, caduca de inmediato y no puede ser reutilizado."*

---

### Minuto 1:00 – 3:00 | El Momento "Efecto WOW" (Operación 100% Offline)
1. Abra una segunda pestaña o ventana de incógnito en `http://localhost:3000`.
2. Haga clic en el chip rápido **Miguel Torres (V-14.111.222 - Operador Mesa)**.
3. Se abrirá la **Mesa de Despacho y Escáner**.
4. **Desconexión Intencional de Red:**
   - En las Herramientas de Desarrollador del navegador (o apagando el WiFi del teléfono/laptop), active el modo **Offline** (Sin conexión).
   - Señale el indicador de estado en la interfaz: se mostrará en color ámbar/rojo indicando **"Modo Desconectado / Offline Engine Activo"**.
5. **Simulación de Escaneo y Retiro:**
   - En la mesa de despacho, presione **"Simular Escaneo de Prueba"** (o apunte la cámara al QR de Carlos Mendoza).
   - **Resultado Inmediato (< 2 segundos):**
     - La pantalla muestra **"¡Entrega Despachada Exitosamente!"**.
     - El dispositivo vibra con el patrón sensorial háptico y emite el tono sonoro de confirmación.
     - La transacción se guarda en `IndexedDB` local con cabecera `Idempotency-Key`.
6. **Reintento Inmediato (Prueba de Idempotencia y Cero Duplicados):**
   - Vuelva a escanear el mismo código QR o presione reintentar.
   - El sistema detecta el duplicado y responde: *"Beneficio ya reclamado en la jornada de hoy. Transacción previa confirmada."* No descuenta stock dos veces.

---

### Minuto 3:00 – 4:00 | Sincronización Automática
1. Restablezca la conexión a Internet / desactive el modo Offline.
2. Muestre cómo el Service Worker v2.6 detecta la reconexión y sincroniza automáticamente en segundo plano (`Background Sync`) la entrega pendiente hacia la base de datos central sin requerir ninguna acción del operador.
3. El indicador pasa a verde: **"Sincronizado con Supabase Cloud / Servidor Central"**.

---

### Minuto 4:00 – 5:00 | Cierre con el Portal del Administrador y Acta Oficial
1. En la pantalla de inicio, seleccione el conmutador **"Administrar Sistema"**.
2. Seleccione el chip rápido de **Msc. Sahib A Franco (C.I. 13537582)** (clave por defecto `0578`).
3. **Puntos Clave a Destacar en el Dashboard:**
   - El contador de entregas del día refleja instantáneamente la entrega de Carlos Mendoza en tiempo real vía Server-Sent Events (SSE).
   - Acceda a la pestaña **"Nómina y Despachos"** y presione **"Descargar Acta Oficial"**.
   - Muestre el documento generado: membrete ministerial formal, tabla desglosada por dependencias, tonelaje métrico total entregado y el **Sello Criptográfico SHA-256** inmutable.

---

## 💡 Mensaje de Cierre (Call to Action)
> *"Como han visto, en condiciones de sótano o corte total de telecomunicaciones, la operación nunca se detiene, el inventario nunca se duplica y la auditoría es automática. El siguiente paso sugerido es iniciar una **Prueba de Concepto (PoC) controlada de 30 días** en su próxima jornada de entrega."*
