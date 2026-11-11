# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Beneficiarios institucionales (trabajadores activos, contratados, jubilados y pensionados del MIPPCI):** consultan su estatus de asignación, presentan su carnet digital offline y generan códigos QR temporales o verifican su comprobante criptográfico desde teléfonos personales de gama diversa. Incluye población adulta mayor que requiere tipografía ampliada, alto contraste y objetivos táctiles grandes.
- **Operadores y supervisores de almacén (`/supervisor`, `/entregas`):** validan entregas mediante escáner multi-cámara, NFC o despacho manual por cédula en sótanos, galpones y mesas de distribución con iluminación variable y conectividad intermitente o nula.
- **Administradores y analistas COSEG (`/coseg`, `/`):** cargan y validan padrones desde Excel/CSV, gestionan jornadas y combos, supervisan el semáforo de formalización por dirección, emiten actas oficiales y verifican pruebas de auditoría Merkle.

## Product Purpose

**SGBT (Sistema de Gestión de Bienestar y Transferencias - MIPPCI)** digitaliza, formaliza y audita la entrega de beneficios alimenticios e institucionales (bolsas de víveres secos, combos proteicos en cadena de frío, útiles escolares y combos especiales), garantizando la trazabilidad por funcionario y evitando duplicidades incluso sin cobertura celular.

El éxito del producto se mide por:
- Validar y registrar un despacho en mesa en pocos toques (< 3 segundos operativos) sin errores de lectura ni dobles entregas diarias (`idx_unique_daily_claim` e `Idempotency-Key`).
- Mantener la operatividad completa Offline-First en almacenes sin Internet mediante PWA (`public/sw.js`) e IndexedDB (`public/js/core/offline_store.js`).
- Asegurar adopción inclusiva sin barreras para jubilados, pensionados y personal no técnico.

## Positioning

A diferencia de planillas administrativas o gestores web dependientes de conexión continua, SGBT combina verificación local criptográfica en hardware (**Passkeys FIDO2 / WebAuthn** y **QR ECDSA P-256** verificables offline en < 2 ms), segregación estricta de alcance (`session_scope: 'admin' | 'beneficiary'`), doble persistencia (`better-sqlite3` / `sql.js` WASM + sincronización Supabase vía `cloud_sync.service.js`) y sellado inmutable mediante **Árbol Merkle RFC 6962 (SHA-256)**.

## Operating Context

- **Condiciones físicas de uso:** almacenes y sótanos sin señal o con poca luz; áreas exteriores bajo luz solar intensa; oficinas administrativas en escritorio/laptop.
- **Superficies del sistema:**
  - *Operate (operación crítica):* `/` (`public/index.html`), `/coseg` (`public/coseg.html`), `/supervisor` (`public/supervisor.html`), `/entregas` (`public/entregas.html`), `/simulador` (`public/simulador.html`) y modales compartidos (`public/templates/modals.html`).
  - *Read / Persuade (documentación e institucional):* `public/manual_usuario_interactivo.html`, `public/architecture.html`, `public/workflow.html`, `public/diagrams/*`, `public/dossier.html`, `public/acta_oficial.html`, `public/propuesta_comercializacion.html`, `public/plan_financiamiento.html`, `public/brochure_pdf_source.html`, `public/logos.html`.
- **Arquitectura técnica obligatoria:** HTML, CSS y Vanilla JavaScript servidos desde Express (`backend/server.js`) y Vercel (`vercel.json`), sin paso de compilación ni bundler SPA.

## Capabilities and Constraints

- **Capacidades confirmadas:** carnet digital offline, enrolamiento fotográfico multi-dispositivo, biometría FIDO2/Passkeys, MFA TOTP con código QR (Google Authenticator / códigos de respaldo), despacho QR/NFC/manual, cola diferida offline, semáforo departamental e inspección de nómina por unidad, importación Excel/CSV, SSE en vivo y verificación Merkle.
- **Restricciones técnicas:**
  - Cero dependencias de frameworks frontend (React/Vue/Tailwind build) en las vistas de producción.
  - Compatibilidad con PWA instalable y Android TWA (`twa-manifest.json`, `manifest.json`).
  - Todo cambio en producción requiere respetar las políticas de `CSP`, `theme_manager.js` y la suite de pruebas (`npm test`).
- **Decisiones abiertas:** consolidación de rutas HTML duplicadas en `public/` (`coseg.html` vs `index.html`, copias en subcarpetas `/coseg/index.html`, `/entregas/index.html`, `/supervisor/index.html`, `/simulador/index.html`) pendiente de planificar en Fase 2.

## Brand Commitments

- **Identidad primaria:** **SGBT MIPPCI** con soporte multi-ente (`tenant_settings` para logotipo, siglas y color institucional primario).
- **Lenguaje y tono:** español institucional claro, directo y orientado a la acción y la recuperación de errores; evitar jerga técnica innecesaria en vistas de beneficiario.
- **Regla de iconografía:** usar iconografía vectorial SVG consistente en lugar de emojis como iconos de interfaz (declarado como principio rector en `public/css/styles.css` y alineado con `ui-ux-pro-max`).

## Evidence on Hand

- Especificaciones funcionales y técnicas: `README.md`, `1. PRD Documento de Requisitos de Producto (PRD).md`, `2. TRD - Documento de Requisitos Técnicos (TRD).md`, `3. UI-UX Design Specification.md`, `docs/adr/`.
- Pruebas automatizadas verificables en el repositorio: `npm test` (incluye `tests/wcag_dark_mode_contrast.test.js`, `tests/e2e_offline_flow.test.js`, `tests/security_hardening_mfa.test.js`, `tests/payroll_department_normalization.test.js` y suites API/contrato).
- *Ausencias:* no fabricar métricas de cobertura en campo ni testimonios de usuarios no documentados.

## Product Principles

1. **Confiabilidad operativa antes que ornamento:** cada pantalla de despacho o consulta debe seguir funcionando y leyéndose con claridad offline, en pantallas pequeñas y bajo estrés.
2. **Cero ambigüedad de estado:** éxito, alerta, duplicado, pendiente offline y rol autenticado deben ser inequívocos visualmente y en lectura asistida.
3. **Inclusión real por defecto:** la experiencia para adultos mayores y baja visión es un ciudadano de primera clase, no un parche posterior.
4. **Frontera clara de privilegios:** beneficiario, supervisor de despacho y administrador COSEG operan con flujos y alcances diferenciados.
5. **Trazabilidad auditable:** toda acción crítica refleja confirmación inmediata, contexto de unidad/fecha y respaldo verificable.

## Accessibility & Inclusion

- **Estándar objetivo:** **WCAG 2.2 AA** en todas las superficies y **WCAG 2.2 AAA** en textos principales y modo adulto mayor (`body.senior-accessible-mode`).
- **Requisitos obligatorios:** contraste >= 4.5:1 en texto normal y >= 3:1 en texto grande/controles; áreas táctiles >= 44x44px (>= 50-52px en `senior-accessible-mode`); tipografía base >= 16px en inputs móviles; foco visible (`:focus-visible`); y soporte estricto de `prefers-reduced-motion: reduce`.

