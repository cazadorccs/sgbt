# ADR-0007: Sistema Declarativo de Migraciones de Base de Datos con Integridad Criptográfica SHA-256

**Date**: 2026-10-25
**Status**: accepted
**Deciders**: Equipo de Arquitectura de Datos, DevOps e Infraestructura MIPPCI / SGBT

## Context

Históricamente, los esquemas de bases de datos se gestionaban a través de sentencias manuales de inicialización y sentencias `ALTER TABLE` dispersas protegidas por bloques `try/catch`. Esta práctica causaba incertidumbre sobre el estado exacto del esquema en diferentes despliegues de campo (versiones en terminales de almacén vs. instancias en la nube), dificultando las auditorías de consistencia y los despliegues continuos.

Se requería un mecanismo declarativo, versionado, atómico y verificable que garantizara que toda instancia de base de datos (SQLite local o PostgreSQL remoto) aplique las modificaciones estructurales en orden estricto.

## Decision

Implementamos un motor declarativo de migraciones versionadas en `backend/migrator.js` respaldado por el directorio `migrations/`:

1. **Scripts SQL Versionados (`migrations/NNN_nombre.sql`)**:
   - Cada migración es un archivo SQL autónomo e inmutable numerado secuencialmente (`001_initial_schema.sql`, `002_add_extended_combo_fields.sql`, `003_add_idempotency_keys.sql`).
2. **Tabla de Control `schema_migrations`**:
   - Registra `version` (clave primaria), `name`, `checksum` (hash SHA-256 del contenido) y `applied_at` (marca de tiempo UTC).
3. **Ejecución Transaccional Automática**:
   - Al arrancar el servidor (`backend/db.js`), el migrador inspecciona el directorio, detecta scripts pendientes y los ejecuta dentro de una transacción ACID.
   - Si una migración falla, se realiza rollback completo y se detiene el arranque para evitar inconsistencias.
4. **Comando CLI para Auditoría y Despliegues**:
   - `npm run db:migrate` permite auditar el estado del esquema, listar las migraciones aplicadas y verificar sus sumas de verificación criptográficas.

## Alternatives Considered

### Alternative 1: Herramientas externas pesadas (Flyway, Liquibase, Prisma Migrate)
- **Pros**: Funcionalidades avanzadas de linaje de datos.
- **Cons**: Dependencia de runtimes pesados (Java/JVM) o binarios nativos voluminosos incompatibles con entornos ligeros de almacén o lambdas Serverless en Vercel.
- **Why not**: Buscamos autonomía total con cero dependencias externas de infraestructura pesada.

### Alternative 2: Scripts manuales ad-hoc ejecutados por administradores
- **Pros**: Sencillo a corto plazo.
- **Cons**: Alto riesgo de omisión humana, desfases de esquema entre estaciones y falta de trazabilidad.
- **Why not**: Viola las directrices de DevSecOps y reproducibilidad del sistema.

## Consequences

### Positive
- Trazabilidad y reproducibilidad 100% auditable del ciclo de vida del esquema de base de datos.
- Detección inmediata de manipulaciones no autorizadas gracias al cálculo del hash SHA-256.
- Facilidad para incorporar nuevas funcionalidades en equipo sin conflictos de esquemas.

### Negative
- Una vez aplicada una migración en producción, no debe modificarse su archivo SQL original (cualquier corrección exige una nueva migración con número secuencial superior).

### Risks
- **Incompatibilidades de sintaxis entre dialectos SQLite y PostgreSQL**: Mitigado usando sintaxis SQL estándar compatible con ambos motores en los archivos de migración.
