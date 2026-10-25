# ADR-0001: FIDO2 Passkeys y Criptografía Asimétrica ECDSA P-256 como Factor Primario de Identidad

**Date**: 2026-10-20
**Status**: accepted
**Deciders**: Equipo de Arquitectura de Sistemas TI MIPPCI, Especialistas en Ciberseguridad y Criptografía

## Context

El sistema de despacho y reclamo de combos alimenticios opera frecuentemente en depósitos, almacenes y puntos remotos con conectividad celular nula o intermitente. Los mecanismos tradicionales de autenticación (contraseñas en texto/hash remoto, códigos OTP vía SMS o llamadas telefónicas) colapsan sin conexión a Internet y son vulnerables a ataques de phishing, intercepción SIM swapping y suplantación de identidad por terceros.

Se requiere un mecanismo criptográfico no repudiable, verificable localmente por terminales de almacén y que garantice la identidad física del beneficiario sin depender de operadoras telefónicas ni de servidores en la nube en el instante del reclamo.

## Decision

Adoptamos el estándar abierto FIDO2 / WebAuthn Nivel 3 y criptografía asimétrica de curvas elípticas NIST P-256 (ECDSA / ES256).

1. El dispositivo del beneficiario genera localmente un par de llaves en su Enclave Seguro / TPM; la llave privada nunca abandona el dispositivo del titular.
2. La llave pública y el Credential ID se registran en la base de datos durante el enrolamiento presencial asistido.
3. El reclamo se realiza firmando criptográficamente un desafío temporal emitido diariamente por el supervisor (`daily-qr` firmado por HMAC-SHA256 con expiración a medianoche).
4. La firma generada por el beneficiario se codifica en un código QR dinámico que puede ser auditado y verificado offline por el escáner del despachador mediante la clave pública almacenada en la base SQLite local.

## Alternatives Considered

### Alternative 1: Códigos OTP vía SMS / WhatsApp
- **Pros**: Familiaridad para usuarios finales; no requiere soporte biométrico.
- **Cons**: Dependencia 100% de señal celular; costos de mensajería masiva; vulnerabilidad a robo de línea (SIM swapping) y demoras de entrega que paralizan colas de almacén.
- **Why not**: Totalmente inoperable en escenarios de contingencia o depósitos subterráneos sin cobertura.

### Alternative 2: Carnet con Código de Barras / Cédula Plástica Estática
- **Pros**: Muy bajo costo de emisión inicial; lectura rápida sin teléfono inteligente.
- **Cons**: Facilidad extrema de clonación, fotocopiado y préstamos de carnet entre personas no autorizadas; no proporciona no-repudio criptográfico.
- **Why not**: Genera fugas en inventario y denuncias de beneficiarios que afirman no haber recibido su combo.

### Alternative 3: Criptografía RSA 2048/4096
- **Pros**: Amplia compatibilidad histórica en bibliotecas criptográficas heredadas.
- **Cons**: Carga computacional pesada; firmas excesivamente largas que no caben de forma compacta en códigos QR de alta densidad legibles por cámaras de gama baja.
- **Why not**: ECDSA P-256 produce firmas de exactamente 64 bytes (R||S) y claves públicas compactas, ideales para códigos QR versión 4-6 con corrección de errores nivel M/Q.

## Consequences

### Positive
- Operación 100% autónoma en almacén sin requerir conectividad en el momento del escaneo.
- Garantía matemática de no repudio: solo quien posee el hardware físico y supera el biométrico local puede autorizar el despacho.
- Cero contraseñas almacenadas en servidores: imposibilidad de filtraciones masivas de credenciales.
- Cumplimiento de normativas FIDO2 y mejores prácticas OWASP.

### Negative
- Requiere que el beneficiario cuente con un smartphone compatible con WebAuthn/Biometría (o recurra a la estación de contingencia con verificación de supervisor).
- Curva de aprendizaje inicial para el personal de campo durante las jornadas de enrolamiento masivo.

### Risks
- **Extravío o rotura del terminal móvil del beneficiario**: Mitigado mediante el protocolo documentado de re-enrolamiento supervisado con revocación inmediata de la llave previa y registro de auditoría.
