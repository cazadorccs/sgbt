# ADR-0009: Persistencia Criptográfica Garantizada en la Nube (Supabase Cloud REST) para Entornos Serverless

**Estado:** Aceptado  
**Fecha:** 29 de Octubre de 2026  
**Autores:** Equipo de Arquitectura y Seguridad TI (MIPPCI / SGBT)  
**Relacionado con:** [ADR-0002](0002-arquitectura-dual-sqlite-wasm-supabase.md), [ADR-0005](0005-modularizacion-servicios-backend.md)

---

## 1. Contexto y Problemática

En despliegues serverless modernos (como Vercel Serverless Functions o AWS Lambda), los contenedores de ejecución son efímeros y se reciclan o congelan inmediatamente tras la emisión de una respuesta HTTP (`res.json()`). 

Durante las operaciones en producción se evidenciaron los siguientes riesgos y fallas:
1. **Pérdida de Formalización de Beneficiarios al Reiniciar Lambdas:** Cuando un beneficiario completaba su formalización (asignando contraseña segura, vinculando su dispositivo móvil y capturando su fotografía), los datos se escribían en la base SQLite efímera en `/tmp` y se enviaba una promesa asíncrona hacia Supabase Cloud sin `await`. Al congelarse la lambda de Vercel, la petición a la nube quedaba trunca. Al ingresar nuevamente en otra sesión o desde otro teléfono, el sistema volvía a solicitar la formalización.
2. **Restricciones de Esquema en Supabase Cloud:** La tabla remota `workers` en Supabase carecía de columnas de autenticación directa (`password_hash`, `enrollment_status`, `enrolled_at`). Un intento de actualizar estas columnas directamente en Supabase generaba errores silenciosos (`Column not found`).
3. **Restricciones de Integridad Referencial en Despachos (`deliveries`):** La tabla remota `deliveries` en Supabase Cloud exige `NOT NULL` en `entitlement_id` (vinculado a `daily_entitlements`) y `distribution_point_id` (vinculado a `distribution_points`). Despachos locales que intentaban persistirse sin asegurar primero la existencia del derecho (`daily_entitlements`) o sin un punto de distribución por defecto eran rechazados por la base de datos remota.
4. **Falta de Idempotencia en la Hidratación:** Al hidratar datos desde Supabase hacia SQLite (`syncFromSupabase`), conflictos de clave única en `credential_id` o `card_uid` abortaban la sincronización con advertencias de violación de restricción `UNIQUE`.

---

## 2. Decisión de Arquitectura

Se aprueba e implementa un subsistema centralizado de **Persistencia Criptográfica en la Nube con Espera Activa (`await`) y Reconciliación Bidireccional**:

### 2.1 Servicio Centralizado `cloud_sync.service.js`
Se crea el módulo [`backend/services/cloud_sync.service.js`](../../backend/services/cloud_sync.service.js), desacoplado de los controladores, que encapsula todas las operaciones de persistencia hacia Supabase Cloud:
- **`persistWorkerFormalization(workerId, passwordHash, boundDeviceId)`**: En lugar de alterar el esquema de `workers`, aprovecha la tabla `passkey_credentials` guardando un registro criptográfico estructurado (`credential_id = formalized_pwd_{workerId}`, `aaguid = 'beneficiary_formalization'`).
- **`persistPasskey(passkeyData)`**: Respalda en Supabase la clave pública WebAuthn (ECDSA P-256) y el contador de firmas.
- **`persistDeliveries(deliveriesArray)`**: Garantiza la existencia previa del `daily_entitlements` en la nube, asigna el punto de distribución por defecto (`ALM-MIPPCI`) ante valores nulos, actualiza el estado del beneficio a `claimed` y registra la entrega en `deliveries`.
- **`persistNfcCard(nfcData)` y `revokeNfcCard(workerId)`**: Sincroniza la activación o revocación de tarjetas físicas de proximidad.

### 2.2 Ejecución con `await` Obligatorio en Controladores
Todo controlador de mutación ([`auth.controller.js`](../../backend/controllers/auth.controller.js), [`dispatch.controller.js`](../../backend/controllers/dispatch.controller.js), [`manual_dispatch.controller.js`](../../backend/controllers/manual_dispatch.controller.js), [`department_batch.controller.js`](../../backend/controllers/department_batch.controller.js), [`admin.controller.js`](../../backend/controllers/admin.controller.js) y [`sync.controller.js`](../../backend/controllers/sync.controller.js)) debe invocar las funciones de `cloud_sync.service.js` de forma asíncrona explícita (`await`), asegurando que la escritura en Supabase concluya antes de retornar el HTTP 200/201 al cliente.

### 2.3 Hidratación Resiliente en SQLite (`db.js`)
Durante el bootstrap de cualquier instancia serverless, la función `syncFromSupabase()` descarga y reconcilia el estado remoto:
- `passkey_credentials`: Maneja `ON CONFLICT(credential_id) DO UPDATE SET...`.
- `nfc_cards`: Maneja `ON CONFLICT(card_uid) DO UPDATE SET...`.
- `daily_entitlements`: Marca los combos como `claimed` si ya existe un registro de despacho en `deliveries`.
- `workers`: Restaura el estado `enrollment_status = 'registrado'` y el hash de contraseña al detectar la credencial `formalized_pwd_{id}`.

### 2.4 Auditoría Automatizada DevSecOps (`verify:cloud`)
Se introduce el comando de verificación:
```bash
npm run verify:cloud
```
El script [`backend/verify_cloud_persistence.js`](../../backend/verify_cloud_persistence.js) audita en tiempo real contra la base de datos viva de Supabase Cloud los 6 procesos críticos:
1. Esquema de tablas activas.
2. Formalización y contraseña en la nube (`passkey_credentials`).
3. Registro de Passkey biométrico WebAuthn.
4. Despacho y liquidación de cuota (`deliveries` / `daily_entitlements`).
5. Vinculación y revocación de tarjetas NFC (`nfc_cards`).
6. Hidratación y reconciliación en SQLite local.

---

## 3. Consecuencias y Beneficios

### Positivas:
- **Cero Pérdida de Estado:** Ningún beneficiario formalizado vuelve a perder su estado al salir del sistema, ingresar desde otro navegador o tras el reciclaje de contenedores en Vercel.
- **Trazabilidad Institucional Garantizada:** Cada entrega física (por QR, cédula, contingencia o lote) se consolida en Supabase Cloud de forma inmutable.
- **Compatibilidad Híbrida 100%:** Si la red exterior está temporalmente inaccesible en almacén, SQLite local continúa despachando en sub-milisegundos y el servicio reporta advertencias no bloqueantes.
- **Auditoría Continua:** Cualquier miembro del equipo puede ejecutar `npm run verify:cloud` para validar la integridad de la base remota en menos de 6 segundos.

### Negativas / Mitigadas:
- *Latencia adicional en operaciones de mutación en la nube:* La invocación `await` añade ~100-300ms a la petición de formalización o despacho. Esta latencia es completamente imperceptible para el usuario y se compensa con el blindaje absoluto contra pérdida de datos.

