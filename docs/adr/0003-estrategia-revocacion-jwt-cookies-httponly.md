# ADR-0003: Estrategia de Autenticación con JWT en Cookies HttpOnly y Lista de Revocación Persistente

**Date**: 2026-10-22
**Status**: accepted
**Deciders**: Equipo de Seguridad de la Información y Arquitectura Web MIPPCI

## Context

Las aplicaciones web de administración y los portales de supervisor manejan información confidencial del personal y control de inventarios críticos. El almacenamiento de tokens de sesión JWT en `localStorage` o `sessionStorage` deja a la aplicación indefensa frente a ataques de Cross-Site Scripting (XSS), donde scripts maliciosos pueden sustraer el token y usurpar la identidad de un supervisor de almacén o administrador.

Por otro lado, los JWT tradicionales no admiten revocación instantánea sin mantener estado: si un usuario cierra sesión o se sospecha de un compromiso de credenciales, el token sigue siendo matemáticamente válido hasta su fecha de caducidad (expiración).

## Decision

Adoptamos una arquitectura de sesión híbrida de alta seguridad:

1. **Tokens JWT en Cookies `HttpOnly`**:
   - Los tokens de sesión se transportan exclusivamente en cookies con directivas `HttpOnly; Secure; SameSite=Strict; Path=/`.
   - JavaScript en el navegador no tiene acceso de lectura al token, mitigando el robo por XSS.
   - Compatibilidad adicional con cabecera `Authorization: Bearer <token>` para clientes móviles nativos o herramientas de testing automatizado.
2. **Lista de Revocación Persistente (`revoked_tokens`)**:
   - Creamos la tabla `revoked_tokens (token TEXT PRIMARY KEY, revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP, reason TEXT)` en la base de datos local SQLite y caché en memoria.
   - En el endpoint `/api/v1/auth/logout`, el token actual es insertado en la lista de revocación y la cookie es destruida con expiración en el pasado (`Max-Age=0`).
   - El middleware `auth.middleware.js` valida tanto la firma criptográfica JWT como la ausencia del token en la tabla `revoked_tokens`.
3. **Control de Sesión Única por Supervisor / Operador**:
   - Al iniciar sesión con un usuario, cualquier token previo activo puede ser revocado automáticamente en cascada para impedir el uso simultáneo de la misma cuenta en múltiples dispositivos.

## Alternatives Considered

### Alternative 1: Almacenamiento en `localStorage`
- **Pros**: Sencillo de programar en clientes SPA (React/Vue/Vanilla).
- **Cons**: Vulnerable al 100% ante cualquier vulnerabilidad XSS introducida en dependencias NPM o scripts de terceros.
- **Why not**: Violación flagrante de OWASP ASVS Nivel 2 y directrices de ciberseguridad del Estado.

### Alternative 2: Sesiones Stateful en Redis
- **Pros**: Revocación sencilla eliminando la clave de sesión en Redis.
- **Cons**: Introduce una dependencia externa de infraestructura pesada (demonio Redis) que colapsa en estaciones de almacén aisladas o computadores portátiles sin Docker.
- **Why not**: Nuestra meta arquitectónica es cero dependencias pesadas en despliegues offline de almacén.

## Consequences

### Positive
- Protección robusta contra ataques XSS y exfiltración de credenciales.
- Capacidad de invalidar sesiones de forma inmediata al hacer clic en "Cerrar Sesión" o por decisión administrativa de bloqueo.
- Mantenimiento del rendimiento: la verificación de revocación en SQLite embebido se ejecuta en microsegundos usando índice B-Tree sobre la clave primaria.

### Negative
- Las peticiones CORS entre orígenes diferentes requieren configurar `credentials: 'include'` en el cliente `fetch()` y control estricto de `Access-Control-Allow-Origin` (sin comodín `*`).

### Risks
- **Crecimiento de la tabla `revoked_tokens`**: Mitigado programando una tarea de limpieza de tokens revocados cuya fecha `exp` original ya haya transcurrido.
