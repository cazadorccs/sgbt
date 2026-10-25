# ADR-0005: Desacoplamiento de Controladores y Modularización en Capa de Servicios

**Date**: 2026-10-24
**Status**: accepted
**Deciders**: Equipo de Desarrollo Backend y Calidad de Software MIPPCI / SGBT

## Context

El controlador de autenticación (`backend/controllers/auth.controller.js`) creció hasta acumular más de 800 líneas de código, asumiendo múltiples responsabilidades ajenas a la capa HTTP:
1. Generación y verificación de desafíos criptográficos WebAuthn / FIDO2.
2. Gestión de conexiones en tiempo real Server-Sent Events (SSE) y difusión de eventos de despacho.
3. Generación y firma de desafíos diarios de supervisor (`daily-qr`).

Esta concentración violaba el Principio de Responsabilidad Única (SRP), dificultaba la realización de pruebas unitarias aisladas sin levantar servidores HTTP y elevaba el riesgo de regresiones durante el mantenimiento del sistema.

## Decision

Desacoplamos la lógica de negocio y criptografía extrayéndola hacia una capa dedicada de servicios en `backend/services/`:

1. **`backend/services/passkey.service.js`**:
   - Encapsula la interacción con `@simplewebauthn/server` o motores WebAuthn compatibles.
   - Administra el almacenamiento temporal de desafíos de registro y autenticación con control de expiración.
   - Valida respuestas de credenciales, verificaciones biométricas y extracción de claves públicas ECDSA.
2. **`backend/services/sse.service.js`**:
   - Gestiona el registro de clientes SSE conectados (`/api/v1/auth/delivery-stream`).
   - Envía pings de mantenimiento (keep-alive) cada 30 segundos para evitar cortes de intermediarios o proxies.
   - Emite difusiones seguras de eventos de entrega (`broadcastDelivery`) de forma desacoplada de la ruta HTTP que registra el despacho.
3. **`backend/services/supervisor.service.js`**:
   - Genera el token QR diario firmado con HMAC-SHA256 (`daily-qr`).
   - Calcula expiraciones exactas a la medianoche (23:59:59) del día en curso.
   - Valida la integridad del token del supervisor cuando un operador escanea el código en el punto de entrega.

Los controladores en `backend/controllers/` quedan estrictamente limitados a la validación de entrada HTTP, invocación del servicio respectivo y respuesta con códigos de estado semánticos (200, 201, 400, 401, 500).

## Alternatives Considered

### Alternative 1: Mantener toda la lógica dentro de los controladores
- **Pros**: Menos archivos en el proyecto; navegación inicial más compacta.
- **Cons**: Archivos monolíticos de difícil lectura; imposibilidad de reutilizar funciones de verificación en scripts CLI o tareas en segundo plano sin instanciar objetos `req` y `res`.
- **Why not**: Genera deuda técnica insostenible conforme crecen las funcionalidades del sistema.

### Alternative 2: Arquitectura de Microservicios Independientes
- **Pros**: Aislamiento total de procesos; escalabilidad horizontal independiente.
- **Cons**: Sobrecarga operativa inmensa (orquestación Kubernetes/Docker, serialización RPC/HTTP entre servicios locales, consumo elevado de RAM en terminales portátiles de almacén).
- **Why not**: Inadecuado e impracticable para despliegues offline ligeros en centros de distribución.

## Consequences

### Positive
- Código limpio, legible y modular con estricta adherencia a buenas prácticas SOLID.
- Capacidad de probar unitariamente servicios criptográficos y de streaming sin simular peticiones Express.
- Reducción del tamaño de `auth.controller.js` a un controlador conciso y legible.
- Reutilización de servicios en tareas batch y comandos CLI de administración.

### Negative
- Aumento en el número de archivos en el árbol del proyecto (`backend/services/`).

### Risks
- **Desincronización de estado en SSE si se escala a múltiples instancias**: Mitigado mediante el servicio de sincronización de base de datos y la arquitectura distribuida por almacenes independientes.
