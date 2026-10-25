# Registro de Decisiones de Arquitectura (ADRs)

Este repositorio documenta las decisiones estructurales, de seguridad y diseño tomadas durante la evolución de la **Plataforma Integral de Gestión y Despacho de Combos Alimenticios con Passkeys y Sincronización Offline-First (SGBT / MIPPCI)**.

Todas las decisiones se gestionan bajo el estándar de Michael Nygard y las guías de ingeniería del equipo.

## Índice de Decisiones

| ADR | Título | Estado | Fecha | Decisores |
|:---:|:---|:---:|:---:|:---|
| [ADR-0001](0001-fido2-passkeys-como-factor-de-identidad.md) | FIDO2 Passkeys y Criptografía Asimétrica ECDSA P-256 como Factor Primario de Identidad | **accepted** | 2026-10-20 | Arquitectura TI & Seguridad |
| [ADR-0002](0002-arquitectura-dual-sqlite-wasm-supabase.md) | Arquitectura Dual de Persistencia: SQLite Embebido Local y Supabase PostgreSQL en la Nube | **accepted** | 2026-10-21 | Arquitectura de Datos & DevOps |
| [ADR-0003](0003-estrategia-revocacion-jwt-cookies-httponly.md) | Estrategia de Autenticación con JWT en Cookies HttpOnly y Lista de Revocación Persistente | **accepted** | 2026-10-22 | Ciberseguridad & Backend |
| [ADR-0004](0004-feedback-haptico-y-ergonomia-de-almacen.md) | Motor de Feedback Háptico, Ergonomía Táctil y Estándares de Diseño para Almacenes | **accepted** | 2026-10-24 | UI/UX & Operaciones Logísticas |
| [ADR-0005](0005-modularizacion-servicios-backend.md) | Desacoplamiento de Controladores y Modularización en Capa de Servicios | **accepted** | 2026-10-24 | Backend & Calidad de Software |

---

## Cómo Proponer una Nueva Decisión

1. Copie el archivo [`template.md`](template.md) asignando el siguiente número secuencial (ejemplo: `0006-titulo-de-la-decision.md`).
2. Complete las secciones: **Context**, **Decision**, **Alternatives Considered** y **Consequences**.
3. Someta el cambio a revisión técnica del equipo.
4. Una vez aprobado, actualice el estado a `accepted` y agréguelo a la tabla anterior.
