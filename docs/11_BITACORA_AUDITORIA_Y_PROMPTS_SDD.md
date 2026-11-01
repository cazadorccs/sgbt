# Bitácora de Auditoría, Remediación SDD y Catálogo de Prompts Clave
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI
**Fecha de Registro:** 31 de Octubre de 2026  
**Roles Operativos de Auditoría:**  
1. *Ingeniero de Software Principal y Auditor de Seguridad Senior*  
2. *Arquitecto de Software Senior y Auditor de Calidad SDD (Spec-Driven Development)*  
**Repositorio Remoto:** `https://github.com/cazadorccs/sgbt.git` | **Producción:** `https://sgbt-bice.vercel.app/`

---

## 1. Contexto y Objetivos de la Intervención

Tras una etapa de desarrollo acelerado con inteligencia artificial (*vibecoding*), se requirió una auditoría forense integral de código para:
1. Inspeccionar arquitectura, dependencias y riesgos de acoplamiento.
2. Identificar y mitigar vulnerabilidades de seguridad, manejo de secretos y exposición de errores.
3. Detectar decisiones ocultas o supuestos arbitrarios de la IA no validados con las reglas de negocio.
4. Efectuar ingeniería inversa de la especificación para alinear el sistema con el estándar **SDD (Spec-Driven Development)** bajo el enfoque **Spec-Anchored**.
5. Implementar casos límite (*edge cases*) y mecanismos de anulación controlada y protección temporal.

---

## 2. Inventario de Prompts Maestros Utilizados

A continuación se registran los prompts exactos ejecutados para guiar el diagnóstico, blindaje y remediación del sistema:

### Prompt 1: Auditoría Técnica y DevSecOps en 5 Fases
```text
Actúa como un Ingeniero de Software Principal y Auditor de Seguridad Senior. Necesito que audites, verifiques y optimices mi aplicación desarrollada con vibecoding siguiendo un flujo estricto por fases. NO modifiques ni apliques cambios en el código de forma automática hasta que yo apruebe el plan de acción.

Sigue rigurosamente estas 5 fases:

FASE 1: Análisis de Contexto y Arquitectura
1. Inspecciona la estructura completa de carpetas, dependencias y archivos raíz.
2. Identifica el stack tecnológico principal (frameworks, ORM, base de datos, APIs externas).
3. Mapea el flujo de datos principal (endpoints, servicios, controladores, modelos).
4. Resume cómo opera el sistema actualmente y lista las anomalías evidentes (código muerto, dependencias no usadas, inconsistencias de arquitectura).

FASE 2: Protección de Funcionalidad Existente
1. Antes de cualquier refactor, documenta qué partes críticas del sistema están acopladas y podrían romperse.
2. Establece como regla de oro: cero regresiones funcionales. Cualquier cambio debe mantener intacto el comportamiento actual de la app.
3. Si sugieres cambios, especifica exactamente qué archivos se tocarán, qué líneas cambiarán y por qué es indispensable hacerlo.

FASE 3: Refactorización y Mantenibilidad
1. Detecta y descompón funciones monolíticas o con responsabilidades mezcladas en módulos pequeños y específicos.
2. Renombra variables y funciones crípticas por nombres explícitos y descriptivos.
3. Elimina lógica duplicada (principio DRY) y añade tipado estricto (type hints) o validación de esquemas donde falte.
4. Reduce comentarios obvios y mantén un estilo de código limpio y consistente.

FASE 4: Cobertura de Pruebas y Casos Límite
1. Revisa las pruebas unitarias y de integración existentes o genera la suite de pruebas básica si no existen.
2. Diseña pruebas para casos límite (edge cases): entradas nulas/vacías, tipos de datos erróneos, timeouts, errores de conexión a la base de datos.
3. No asumas que nada funciona hasta que los tests se ejecuten y pasen al 100%. Muestra los comandos y la salida esperada.

FASE 5: Auditoría de Seguridad y Resiliencia
1. Valida la sanitización de todas las entradas de usuario para prevenir inyecciones SQL/NoSQL, XSS, SSRF y manipulaciones de parámetros.
2. Audita el manejo de secretos y credenciales (verificar que no haya API keys ni tokens en duro en el código, solo en variables de entorno).
3. Revisa los mecanismos de autenticación, autorización y manejo seguro de sesiones o JWT.
4. Implementa manejo explícito de excepciones (bloques try/except o catch específicos con logging controlado, sin exponer stack traces al cliente).

ENTREGABLE INICIAL
Entrega únicamente el reporte de la FASE 1 junto con el Plan de Implementación priorizado (de crítico a menor impacto). Espera mi confirmación antes de proceder a la generación o modificación de código.
```

---

### Prompt 2: Auditoría Inversa y Alineación con SDD (Spec-Driven Development)
```text
Actúa como un Arquitecto de Software Senior y Auditor de Calidad especializado en la metodología SDD (Spec-Driven Development).

He desarrollado la aplicación/módulo adjunto utilizando "vibecoding" (generación iterativa de código asistida por IA). Tu objetivo es realizar una auditoría inversa de este código para evaluar su solidez, detectar lagunas lógicas y alinearlo con los estándares de desarrollo guiado por especificaciones.

Analiza el código adjunto y genera un reporte estructurado en las siguientes 5 secciones:

1. Detección de "Decisiones Ocultas" y Suposiciones Arbitrarias
Identifica qué decisiones de lógica de negocio o arquitectura asumió la IA por su cuenta sin una especificación explícita previa:
- ¿Qué comportamientos por defecto fueron implementados sin validación expresa?
- ¿Dónde hay ambigüedades técnicas que podrían fallar bajo condiciones reales?

2. Ingeniería Inversa de la Especificación
Reconstruye la especificación formal que este código parece intentar cumplir:
- Objetivo: Qué problema resuelve y para qué usuario.
- Requisitos funcionales: Qué permite hacer el sistema en su estado actual.
- Reglas de negocio y restricciones deducidas: Condiciones observadas en el código (y cuáles faltan).
- Criterios de aceptación: Formato observable (Dado que / Si / Entonces) de lo que hoy está implementado.

3. Auditoría del Plan Técnico
Evalúa la arquitectura implementada en torno a los 4 pilares técnicos de SDD:
- Modelo de entidades y relaciones: ¿Es consistente y escalable la estructura de datos?
- Ubicación de las validaciones de negocio: ¿Se validan en la capa correcta o están dispersas/incompletas?
- Mecanismo de persistencia: ¿Cómo se gestionan las transacciones, integridad referencial y almacenamiento?
- Gestión de errores y respuestas: ¿El sistema devuelve respuestas coherentes y controladas ante fallos, o expone errores de bajo nivel?

4. Matriz de Pruebas y Casos Límite (Gap Analysis)
Contrasta el código contra los casos críticos habituales e indica si están cubiertos, parcialmente cubiertos o ausentes:
- Manejo de entradas duplicadas o estados concurrentes.
- Manejo de límites máximos de capacidad o cuotas.
- Búsqueda u operaciones sobre identificadores inexistentes (IDs inválidos/nulos).
- Coherencia y tipado de las respuestas de error frente a entradas maliciosas o malformadas.

5. Plan de Remediación y Nivel SDD Recomendado
- Lista de refactorizaciones técnicas prioritarias para cerrar las brechas detectadas.
- Recomendación de estrategia documental: ¿conviene adoptar un enfoque Spec-Anchored (mantener una especificación actualizada junto al código para futuras iteraciones) o Spec-as-Source?
```

---

## 3. Matriz de Cambios y Correcciones Realizadas

| Módulo / Archivo Afectado | Naturaleza del Cambio | Justificación de Ingeniería | Commits Relacionados |
| :--- | :--- | :--- | :---: |
| **`backend/server.js`** | Exportación dual `module.exports = app; module.exports.app = app;` | Compatibilidad entre tests automatizados en Node.js y el runner serverless de Vercel (`api/index.js`). | `eb06162` |
| **`backend/sync-to-supabase.js`** | Consolidación y eliminación de script redundante `sync_to_supabase.js`. | Principio DRY. Se eliminó código muerto que generaba discrepancias de sincronización. | `eb06162` |
| **`scratch/archive/`** | Aislamiento y archivado de 11 scripts ad-hoc huérfanos de la raíz. | Higiene de repositorio. Se limpiaron pruebas manuales no estandarizadas. | `eb06162` |
| **`tests/edge_cases_dispatch.test.js`** | Creación de suite de casos límite (5 pruebas automatizadas). | Verificación de payloads corruptos, inyecciones SQL, HMAC alterado, 404 RFC 7807 y buffer overflows. | `eb06162` |
| **`backend/services/delivery.service.js`** | Implementación de `validateClockSkew()` y `voidDelivery()`. | Regla SDD: Protección contra desfase de reloj (> 4h) y anulación atómica reversible de entregas erróneas (ventana 15 min). | `3f2e691` |
| **`backend/services/passkey.service.js`** | Centralización de la regla pura `assertWorkerCanClaim(workerId)`. | Desacoplamiento de validaciones dispersas en controladores hacia una función pura de dominio. | `3f2e691` |
| **`backend/controllers/dispatch.controller.js`** | Controlador `voidDeliveryController`. | Exposición del endpoint de reversión con registro en `system_activity_logs` y notificación SSE en vivo. | `3f2e691` |
| **`backend/routes/dispatch.routes.js`** | Ruta `POST /api/v1/dispatch/void` con RBAC. | Restricción de acceso para roles autorizados (`supervisor`, `admin`, `director`). | `3f2e691` |
| **`docs/openapi.yaml`** | Registro contractual del endpoint `/dispatch/void` y esquemas RFC 7807. | Enfoque **Spec-Anchored**: la especificación formal OpenAPI se mantiene sincronizada con el código fuente. | `3f2e691` |
| **`tests/sdd_remediation_spec.test.js`** | Suite de verificación de invariantes SDD (3/3 pruebas). | Comprobación de invariantes de reloj, nómina y reversión transaccional en base de datos. | `3f2e691` |
| **`package.json`** | Adición de scripts `test:edge` y `test:sdd`, integrados en `npm test`. | Integración continua y ejecución permanente de las compuertas de calidad. | `eb06162`, `3f2e691` |

---

## 4. Evidencia de Ejecución de Pruebas Automatizadas

### A. Casos Límite (`npm run test:edge`):
```text
================================================================
🧪 SUITE: CASOS LÍMITE (EDGE CASES) Y RESILIENCIA DE SEGURIDAD
================================================================
  ✅ EDGE-01: Rechazo seguro de JSON malformado (sin colapso del servidor)
  ✅ EDGE-02: Neutralización de inyección SQL en parámetros de consulta
  ✅ EDGE-03: Rechazo de token QR adulterado o parámetros incompletos
  ✅ EDGE-04: Respuesta RFC 7807 ante rutas inexistentes (404 Not Found)
  ✅ EDGE-05: Mitigación de desbordamiento de búfer y payloads gigantes
================================================================
🎉 TODOS LOS CASOS LÍMITE (5/5) PASARON EXITOSAMENTE
================================================================
```

### B. Invariantes SDD (`npm run test:sdd`):
```text
================================================================
📐 VERIFICACIÓN DE INVARIANTES Y REMEDIACIÓN SDD (SPEC-DRIVEN)
================================================================
  ✅ SDD-01: Protección de Clock Skew (Rechazo de dispositivos con desfase > 4h)
  ✅ SDD-02: Centralización de invariante de nómina pura (assertWorkerCanClaim)
  ✅ SDD-03: Anulación reversible de despacho y restauración de asignación (voidDelivery)
================================================================
🎉 TODAS LAS REGLAS DE REMEDIACIÓN SDD (3/3) PASARON AL 100%
================================================================
```

---

## 5. Directrices de Gobernanza para Futuras Iteraciones

1. **Enfoque Spec-Anchored Obligatorio:** Antes de modificar controladores o endpoints, se debe actualizar primero el contrato en [`docs/openapi.yaml`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/docs/openapi.yaml).
2. **Cero Regresiones Funcionales:** Todo cambio de código debe validar la suite completa de pruebas:
   ```bash
   npm test
   npm run verify:cloud
   ```
3. **Manejo Estricto de Errores RFC 7807:** Las respuestas erróneas deben emitir `application/problem+json` sin exponer volcados de memoria ni consultas SQL internas al cliente.
