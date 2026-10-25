# ADR-0006: Garantía de Idempotencia HTTP y Formato Estándar de Error RFC 7807

**Date**: 2026-10-25
**Status**: accepted
**Deciders**: Equipo de Arquitectura de APIs, Ciberseguridad y Operaciones de Almacén MIPPCI

## Context

En los centros de distribución y depósitos de alimentos, la conectividad de red suele ser fluctuante. Cuando un operador registra un despacho o sube un lote de nómina, una pérdida transitoria de paquetes TCP o una desconexión Wi-Fi puede provocar que el navegador o terminal reintente automáticamente la solicitud HTTP mutadora (`POST`, `PUT`, `PATCH`), o que el operario presione dos veces el botón de confirmación.

Sin un mecanismo de idempotencia, estos reintentos pueden provocar doble registro de entrega, descontar inventario repetidamente o bloquear al beneficiario por falso positivo de intento fraudulento. Asimismo, los formatos heterogéneos de error (`{ error: '...' }`, `{ message: '...' }`, cadenas planas) dificultan la gestión consistente en clientes móviles y pasarelas de integración.

## Decision

Adoptamos una estrategia estandarizada de idempotencia y reporte de problemas:

1. **Cabecera de Idempotencia (`Idempotency-Key` / `X-Idempotency-Key`)**:
   - Todo endpoint mutador bajo `/api/` es interceptado por `backend/middleware/idempotency.middleware.js`.
   - La primera solicitud exitosa (HTTP 200-299) almacena la clave, código de estado, cabeceras y cuerpo JSON en la tabla `idempotency_keys` en SQLite local. Se emite la cabecera `X-Cache-Lookup: MISS-IDEMPOTENT`.
   - Reintentos con la misma clave son respondidos inmediatamente desde la caché local con `X-Cache-Lookup: HIT-IDEMPOTENT`, retornando el mismo resultado sin reejecutar transacciones ni afectar inventario.
2. **Estándar RFC 7807 (Problem Details for HTTP APIs)**:
   - Integramos `res.problem(...)` en `backend/middleware/error.middleware.js` para emitir respuestas `application/problem+json`.
   - Estructura uniforme: `type`, `title`, `status`, `detail`, `instance`, `timestamp` y parámetros inválidos opcionales (`invalid-params`).
   - Mantenimiento estricto de compatibilidad retrospectiva para clientes existentes.

## Alternatives Considered

### Alternative 1: Bloqueo solo mediante UI en el frontend (deshabilitar botón)
- **Pros**: Cero lógica adicional en el backend.
- **Cons**: No protege contra reintentos automáticos del navegador, pérdida de ACK de red, ataques de repetición maliciosos ni scripts automatizados.
- **Why not**: Insuficiente para operaciones con impacto físico en inventarios de alimentos.

### Alternative 2: Bloqueo basado en huella digital del body JSON (MD5 / SHA-256)
- **Pros**: No requiere que el cliente envíe una cabecera explícita.
- **Cons**: Falsos positivos si dos personas de una misma familia o lote registran exactamente la misma cantidad o combo en instantes cercanos.
- **Why not**: La clave generada por el cliente (`Idempotency-Key`) es el estándar universal de la industria (IETF Draft Idempotency-Key).

## Consequences

### Positive
- Protección total contra entregas duplicadas ocasionadas por inestabilidad de red en almacenes.
- Intercambio de errores estandarizado, legible por máquinas y conforme a RFC 7807.
- Auditoría precisa de reintentos mediante índices temporales en `idempotency_keys`.

### Negative
- Ligero consumo de almacenamiento en disco para la tabla `idempotency_keys` (mitigado mediante índices de fecha para depuración automática periódica).

### Risks
- **Reutilización de una misma clave para solicitudes con payload diferente**: Mitigado limitando el alcance por usuario y endpoint.
