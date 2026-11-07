import asyncio
import edge_tts
import os

SCRIPTS = {
    "c4": {
        "file": "docs/diagrams/audio/c4-containers.mp3",
        "title": "Arquitectura de Contenedores C4 (Nivel 2)",
        "text": (
            "Bienvenido al diagrama de Arquitectura de Contenedores C4 del Sistema de Gestión de Beneficios de los Trabajadores del MIPPCI. "
            "En el extremo superior izquierdo observamos los tres actores clave: el Trabajador Beneficiario, el Operador de Despacho en Almacén, y el Administrador de Seguridad Institucional. "
            "La plataforma opera con una arquitectura modular desacoplada: una Progressive Web App instalable para móviles y terminales de escritorio, comunicada con una pasarela API RESTful protegida bajo estándares estrictos de la directiva Trail of Bits. "
            "La capa de seguridad integra autenticación biométrica FIDO2 y Passkeys mediante criptografía asimétrica ECDSA P-256. "
            "Para garantizar la continuidad operativa en sótanos y depósitos sin cobertura de internet, el sistema implementa un motor de datos híbrido Offline-First con base de datos SQLite en modo WAL local, el cual sincroniza automáticamente por lotes e idempotencia hacia Supabase Cloud una vez restablecida la conectividad."
        )
    },
    "sequence": {
        "file": "docs/diagrams/audio/user-journey-sequence.mp3",
        "title": "Flujo Criptográfico QR y Tap NFC P2P",
        "text": (
            "Este diagrama de secuencia ilustra el protocolo criptográfico punto a punto para la entrega segura de beneficios alimenticios. "
            "El proceso inicia cuando el funcionario beneficiario abre su credencial digital y autoriza la transacción mediante biometría local en el chip seguro de su dispositivo. "
            "El dispositivo genera una aserción criptográfica firmada con su llave privada ECDSA, emitiendo un código QR dinámico de alta densidad con validez estricta de ciento ochenta segundos, o bien transmitiéndolo por proximidad NFC al terminal del almacén. "
            "El lector del operador captura el payload criptográfico y lo envía a la pasarela de validación con cabecera de Idempotencia. "
            "El sistema verifica la firma digital, comprueba que no existan retiros previos en la jornada mediante el índice único de base de datos, y emite un recibo inmutable con vibración y confirmación auditiva en menos de doscientos milisegundos."
        )
    },
    "erd": {
        "file": "docs/diagrams/audio/modelo-datos-erd.mp3",
        "title": "Modelo de Datos Relacional ERD Integral",
        "text": (
            "Presentamos el Modelo de Datos Entidad Relación del SGBT MIPPCI, optimizado para consistencia transaccional y resiliencia offline. "
            "La entidad central de Trabajadores almacena la identidad institucional, cédula, departamento y datos de contacto, vinculada a la tabla de Credenciales WebAuthn para llaves públicas y contadores de firmas anti-clonación. "
            "El subsistema de asignaciones administra las campañas y lotes institucionales de combos alimenticios, coordinado con la tabla de Entregas. "
            "La regla de integridad más crítica es el índice relacional estricto, idx unique daily claim, que imposibilita matemáticamente el despacho duplicado de un mismo beneficio en una misma fecha. "
            "Adicionalmente, cada evento de seguridad, mutación administrativa o sincronización queda registrado de forma indeleble en la bitácora de auditoría forense ministerial."
        )
    },
    "twa": {
        "file": "docs/diagrams/audio/distribucion-movil-twa.mp3",
        "title": "Distribución Móvil Dual: PWA vs APK TWA Kiosco",
        "text": (
            "El presente diagrama detalla la estrategia de distribución móvil diferenciada para el ecosistema ministerial. "
            "Para los trabajadores y beneficiarios, el despliegue es una Progressive Web App edge to edge, accesible vía navegador web o instalable al inicio sin necesidad de tiendas comerciales, con caché inteligente de Service Worker y tarjeta de identificación offline. "
            "Por su parte, para los operadores de almacén en campo, el sistema provee un paquete nativo APK empaquetado con Trusted Web Activities y Bubblewrap. "
            "Este APK nativo desbloquea capacidades avanzadas de hardware: modo Kiosco dedicado, bloqueo de suspensión de pantalla mediante Wake Lock, lectura directa de hardware NFC, y un motor SQLite local persistente que asegura la fluidez en jornadas masivas de entrega."
        )
    }
}

async def generate():
    voice = "es-VE-SebastianNeural"
    print(f"🎙️ Generando pistas de audio institucionales con voz neuronal: {voice}...")
    
    for key, item in SCRIPTS.items():
        output_path = item["file"]
        print(f"  -> Generando: {item['title']} -> {output_path}")
        communicate = edge_tts.Communicate(item["text"], voice=voice, rate="+0%", pitch="+0Hz")
        await communicate.save(output_path)
        size_kb = os.path.getsize(output_path) / 1024
        print(f"     ✅ Generado exitosamente ({size_kb:.1f} KB)")

if __name__ == "__main__":
    asyncio.run(generate())

