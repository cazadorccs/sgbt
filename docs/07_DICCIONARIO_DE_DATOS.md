# Diccionario de Datos del Sistema
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Resumen de Entidades de Base de Datos

El sistema gestiona diecisiete (17) tablas relacionales estructuradas para garantizar alta velocidad transaccional en almacén y consolidación íntegra en la nube.

| Nombre de Tabla | Propósito y Función | Clave Primaria (PK) |
| :--- | :--- | :--- |
| **`departments`** | Catálogo de direcciones generales, viceministerios y entes adscritos. | `id` (TEXT/UUID) |
| **`workers`** | Padrón unificado de beneficiarios, operadores, supervisores y administradores. | `id` (TEXT/UUID) |
| **`passkey_credentials`** | Registro de claves públicas biométricas FIDO2 / WebAuthn por trabajador. | `id` (TEXT/UUID) |
| **`nfc_cards`** | Registro de tarjetas físicas de proximidad para contingencia. | `id` (TEXT/UUID) |
| **`combos`** | Catálogo de combos alimenticios e insumos institucionales. | `id` (TEXT/UUID) |
| **`distribution_points`** | Puntos físicos de distribución (comedores, depósitos, sedes). | `id` (TEXT/UUID) |
| **`delivery_campaigns`** | Jornadas planificadas de entrega masiva. | `id` (TEXT/UUID) |
| **`campaign_combos`** | Tabla de unión multi-combo asociada a cada jornada. | `(campaign_id, combo_id)` |
| **`daily_entitlements`** | Asignaciones individuales de retiro emitidas a cada beneficiario. | `id` (TEXT/UUID) |
| **`deliveries`** | Registro inmutable de entregas físicas efectuadas. | `id` (TEXT/UUID) |
| **`department_batch_orders`**| Órdenes de despacho por lote institucional a delegados autorizados. | `id` (TEXT/UUID) |
| **`ministerial_actas`** | Actas digitales de cierre y auditoría con sello criptográfico. | `id` (TEXT/UUID) |
| **`tenant_settings`** | Configuración institucional de marca blanca del ente público. | `id` (TEXT) |
| **`system_notifications`** | Registro de notificaciones emitidas al personal y operadores. | `id` (TEXT/UUID) |
| **`device_locks`** | Registro de candados de hardware para evitar préstamo de teléfonos. | `id` (TEXT/UUID) |
| **`user_mfa`** | Claves de doble factor (TOTP / códigos de respaldo) para supervisores. | `worker_id` (TEXT/UUID) |
| **`payroll_sync_logs`** | Bitácora de ingesta y carga de nómina desde archivos Excel. | `id` (TEXT/UUID) |

---

### 2. Especificación Detallada de Columnas y Atributos

#### Tabla: `workers`
| Columna | Tipo SQL | Nulo | Descripción y Reglas de Negocio |
| :--- | :--- | :---: | :--- |
| `id` | TEXT | No | Identificador universal único (UUID v4). |
| `document_id` | TEXT | No | Cédula de Identidad única con prefijo formal (ej. `V-14567890`). Índice único. |
| `full_name` | TEXT | No | Nombres y apellidos completos según cédula de identidad. |
| `email` | TEXT | No | Correo electrónico de contacto institucional. Índice único. |
| `department_id` | TEXT | Sí | Clave foránea referenciando `departments.id`. |
| `shift` | TEXT | No | Turno laboral: `mañana`, `tarde`, `jornada_continua`. Predeterminado: `jornada_continua`. |
| `status` | TEXT | No | Condición laboral: `active` (activo), `suspended` (suspendido), `terminated` (egresado). |
| `worker_type` | TEXT | No | Clasificación: `activo`, `jubilado`, `pensionado`, `contratado`. |
| `role` | TEXT | No | Nivel de acceso: `worker`, `operator`, `supervisor`, `admin`. |
| `has_smartphone` | INTEGER | No | `1` si posee teléfono propio con biometría; `0` para régimen de contingencia. |
| `phone_number` | TEXT | Sí | Teléfono celular de contacto para alertas SMS o institucionales. |
| `contingency_reason`| TEXT | Sí | Justificación administrativa si opera bajo régimen asistido. |
| `created_at` | TEXT | No | Estampa de tiempo UTC de creación en el sistema. |
| `updated_at` | TEXT | No | Estampa de tiempo UTC de última actualización. |

#### Tabla: `delivery_campaigns`
| Columna | Tipo SQL | Nulo | Descripción y Reglas de Negocio |
| :--- | :--- | :---: | :--- |
| `id` | TEXT | No | Identificador universal único (UUID v4). |
| `name` | TEXT | No | Nombre oficial de la jornada institucional. |
| `description` | TEXT | Sí | Justificación o motivo de la entrega. |
| `start_date` | TEXT | No | Fecha de inicio de retiro en formato ISO `YYYY-MM-DD`. |
| `end_date` | TEXT | No | Fecha de culminación formal de la jornada. |
| `target_group` | TEXT | No | Población convocada: `all`, departamentos o tipos de nómina. |
| `distribution_point_id`| TEXT | Sí | Clave foránea referenciando `distribution_points.id`. |
| `status` | TEXT | No | Estado: `programada`, `en_curso`, `finalizada`, `cancelada`. |
| `notification_sent` | INTEGER | No | `1` si se notificó al personal; `0` si está pendiente. |
| `created_at` | TEXT | No | Estampa de tiempo UTC de registro de la jornada. |

#### Tabla: `campaign_combos`
| Columna | Tipo SQL | Nulo | Descripción y Reglas de Negocio |
| :--- | :--- | :---: | :--- |
| `campaign_id` | TEXT | No | Clave foránea referenciando `delivery_campaigns.id` (ON DELETE CASCADE). |
| `combo_id` | TEXT | No | Clave foránea referenciando `combos.id` (ON DELETE CASCADE). |
| `created_at` | TEXT | No | Estampa de tiempo UTC de vinculación. |
| **PK Compuesta** | — | — | `PRIMARY KEY (campaign_id, combo_id)` |

#### Tabla: `daily_entitlements`
| Columna | Tipo SQL | Nulo | Descripción y Reglas de Negocio |
| :--- | :--- | :---: | :--- |
| `id` | TEXT | No | Identificador universal único (UUID v4). |
| `worker_id` | TEXT | No | Clave foránea referenciando `workers.id` (ON DELETE CASCADE). |
| `combo_id` | TEXT | No | Clave foránea referenciando `combos.id` (ON DELETE RESTRICT). |
| `valid_date` | TEXT | No | Fecha asignada para el retiro `YYYY-MM-DD`. |
| `shift` | TEXT | No | Turno habilitado. |
| `status` | TEXT | No | Estado del derecho: `pending` (pendiente), `claimed` (retirado), `expired` (caducado). |
| `campaign_id` | TEXT | Sí | Clave foránea vinculante a `delivery_campaigns.id`. |
| **Restricción Única**| — | — | `UNIQUE (worker_id, valid_date, combo_id)` |

#### Tabla: `deliveries`
| Columna | Tipo SQL | Nulo | Descripción y Reglas de Negocio |
| :--- | :--- | :---: | :--- |
| `id` | TEXT | No | Identificador universal único (UUID v4) del evento de despacho. |
| `entitlement_id` | TEXT | No | Clave foránea referenciando `daily_entitlements.id`. |
| `worker_id` | TEXT | No | Clave foránea referenciando `workers.id`. |
| `distribution_point_id`| TEXT | No | Clave foránea referenciando `distribution_points.id`. |
| `delivered_by_user_id`| TEXT | Sí | Operador de almacén responsable de la entrega. |
| `verification_method` | TEXT | No | Método: `passkey_qr`, `nfc_card`, `supervisor_override`. |
| `signature_proof` | TEXT | Sí | Criptograma de firma ECDSA P-256 verificado en servidor. |
| `challenge_nonce` | TEXT | Sí | Reto de 32 bytes de un solo uso para prevenir repetición. |
| `supervisor_id` | TEXT | Sí | Identificador del supervisor en caso de contingencia. |
| `override_reason` | TEXT | Sí | Causa justificada de la contingencia en almacén. |
| `is_offline_sync` | INTEGER | No | `1` si el retiro ocurrió sin conexión y se sincronizó luego; `0` si fue en línea. |
| `delivered_at` | TEXT | No | Estampa de tiempo exacta de la entrega física. |
| `synced_at` | TEXT | No | Estampa de tiempo de sincronización con la base de datos central. |
| **Índice Anti-Fraude**| — | — | `CREATE UNIQUE INDEX idx_unique_daily_claim ON deliveries(worker_id, entitlement_id)` |
