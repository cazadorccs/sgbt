# ADR-0002: Arquitectura Dual de Persistencia: SQLite Embebido Local y Supabase PostgreSQL en la Nube

**Date**: 2026-10-21
**Status**: accepted
**Deciders**: Equipo de Arquitectura de Datos y DevOps MIPPCI / SGBT

## Context

La solución debe garantizar continuidad operativa ininterrumpida tanto en despliegues aislados en terreno (laptops y servidores locales en centros de distribución) como en la nube central institucional (servidores de gobernanza, auditoría ministerial y panel ejecutivo en Supabase). 

Si la persistencia dependiera exclusivamente de una conexión de red hacia una base de datos remota, cualquier latencia, caída del ISP o congestión saturaría los lectores QR en los almacenes, generando aglomeraciones y fallos de servicio.

## Decision

Implementamos un modelo de arquitectura de datos híbrido / dual:

1. **Motor Local Primario (Zero-Latency Local Engine)**:
   - Empleamos SQLite embebido (`better-sqlite3` en entornos Node.js nativos y `sql.js` / WASM con persistencia IndexedDB en clientes PWA o entornos Serverless/Edge).
   - Los registros de nómina, llaves públicas registradas y transacciones de entrega inmediata se leen y escriben a latencia de milisegundos (< 2ms) localmente en disco.
2. **Almacén Central y Gobernanza Institucional (Supabase PostgreSQL)**:
   - PostgreSQL gestiona el consolidado nacional, la agregación de métricas de múltiples centros de acopio y auditoría forense.
3. **Protocolo de Sincronización Asíncrona Bidireccional (`/api/v1/sync`)**:
   - `pull`: Descarga lotes de nóminas, beneficiarios autorizados y catálogos de combos hacia la instancia local.
   - `push`: Envía en lotes idempotentes las entregas completadas offline cuando se detecta el restablecimiento de conectividad.
   - Manejo de unicidad a nivel de esquema mediante `idx_unique_daily_claim` en ambas bases de datos para impedir doble despacho en el mismo día.

## Alternatives Considered

### Alternative 1: Conexión Directa a PostgreSQL Centralizado sin Caché Local
- **Pros**: Una única base de datos y modelo de esquema sin necesidad de algoritmos de sincronización.
- **Cons**: Vulnerabilidad crítica ante caídas de red; latencia impredecible de 200ms a 5000ms por cada escaneo en horas pico.
- **Why not**: Inadmisible para un sistema de abastecimiento de alimentos de alta demanda ciudadana.

### Alternative 2: Bases de Datos NoSQL (MongoDB / Firebase Realtime DB)
- **Pros**: Sincronización offline nativa en SDKs de cliente.
- **Cons**: Falta de garantías transaccionales ACID estrictas en operaciones de deduplicación de beneficios; dificultad para auditorías contables del ministerio; vendor lock-in.
- **Why not**: Los despachos de alimentos requieren consistencia relacional e integridad referencial estricta para evitar desvíos de inventario.

## Consequences

### Positive
- Latencia de respuesta en escaneo inferior a 15 milisegundos en punto de entrega.
- Resiliencia total ante desconexiones de red durante horas o días enteros.
- Capacidad de despliegue ultraliviano en dispositivos con bajos recursos de hardware (Mini PCs, laptops, Raspberry Pi).

### Negative
- Necesidad de coordinar esquemas SQL equivalentes entre dialectos SQLite y PostgreSQL (tipos `DATETIME` vs `TIMESTAMPTZ`, booleanos enteros `1/0` vs `BOOLEAN`).
- Complejidad adicional en la resolución de conflictos y reintentos en el módulo de sincronización.

### Risks
- **Desincronización por desfase de reloj del sistema**: Mitigado validando marcas de tiempo ISO-8601 universales UTC y secuencias incrementales (`sequence_id`).
