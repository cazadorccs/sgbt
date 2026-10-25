# 📐 Guía Oficial de Instalación y Uso: Gestor de Diagramas Archify

> **Repositorio Oficial:** [tt-a1i/archify](https://github.com/tt-a1i/archify)  
> **Versión Instalada:** 3.2.0 (MIT License)  
> **Ámbito de Integración:** Ecosistema de Agentes Inteligentes (Antigravity IDE, Claude Code, Codex, Cursor, OpenCode)

---

## 1. 📌 ¿Qué es Archify?

**Archify** es un gestor y generador de diagramas técnicos interactivos y páginas explicativas (*explainers*) diseñado específicamente para agentes de Inteligencia Artificial y desarrolladores.

A diferencia de los diagramas estáticos tradicionales (PNG o Mermaid plano), Archify genera **archivos HTML autónomos (standalone)** con:
- 🎨 **Temas visuales modernos:** Modos Claro y Oscuro adaptativos con gradientes y tipografías pulidas.
- ⚡ **Interactividad total:** Zoom, paneo, resaltado de rutas críticas, filtrado de capas y conexiones dependientes.
- 🔗 **Evidencia trazable de código:** Vinculación directa a archivos, funciones y líneas de código del repositorio.
- 📤 **Exportación multipropósito:** Descarga con un clic en **PNG de alta resolución, SVG vectorial, video WebM interactivo o PDF**.
- 🌐 **Cero dependencias externas en tiempo de ejecución:** El archivo HTML resultante funciona 100% offline en cualquier navegador.

---

## 2. 📂 Ubicación de la Instalación

Archify quedó desplegado e integrado en dos niveles:

### A. Ámbito Local del Proyecto (Workspace MIPPCI / SGBT)
- **Directorio del Skill:** [`.agents/skills/archify/`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/.agents/skills/archify/)
- **Documento de Reglas y Directivas:** [`SKILL.md`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/.agents/skills/archify/SKILL.md)
- **Binario CLI Principal:** [`.agents/skills/archify/bin/archify.mjs`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/.agents/skills/archify/bin/archify.mjs)
- **Registro de Habilitación:** [`skills-lock.json`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/skills-lock.json)

### B. Ámbito Global del Sistema
- **Ruta Global:** `~/.agents/skills/archify/` (`C:\Users\alexa\.agents\skills\archify\`)
- *Beneficio:* Está disponible de inmediato para cualquier otro proyecto o repositorio que abras con tus agentes.

---

## 3. 📊 Tipos de Diagramas Soportados

| Tipo (`type`) | Caso de Uso Principal | Aplicación en el Proyecto SGBT |
| :--- | :--- | :--- |
| 🏗️ **`architecture`** | Arquitectura de sistemas, servidores, backend, frontend y nube. | Estructura Node.js + Express, SQLite/Supabase, Service Worker PWA y WebAuthn. |
| 🔄 **`workflow`** | Procesos de negocio, protocolos operativos y pasos de usuario. | Flujo de entrega en estación: Escaneo QR → Verificación → Deducción de Combo. |
| ⚡ **`sequence`** | Intercambio de mensajes, llamadas API y protocolos criptográficos. | Handshake criptográfico Passkeys: Challenge → Firma biométrica → Despacho. |
| 🗄️ **`erd`** | Esquema de base de datos relacional (Entidad-Relación). | Tablas `workers`, `combos`, `daily_entitlements`, `deliveries`, `audit_logs`. |
| 🌊 **`dataflow`** | Movimiento de datos, sincronización por lotes y tuberías. | Sincronización offline-first: IndexedDB local ↔ Cola diferida ↔ Supabase Cloud. |
| 🚦 **`lifecycle`** | Máquinas de estado y transiciones de ciclo de vida. | Ciclo de vida del beneficio: *Asignado → Pendiente → Reclamado / Retirado*. |
| 🌳 **`tree`** | Estructuras jerárquicas y dependencias. | Estructura departamental del MIPPCI y jerarquías de entes adscritos. |
| ⏱️ **`timeline` / `waterfall`** | Cronogramas de jornadas y métricas de latencia de red. | Desglose de tiempo de validación sub-segundo (<50ms en lectura de QR). |
| 📄 **`explainer`** | Páginas técnicas interactivas completas de una página. | Manual de contingencia interactivo con diagramas y pasos de solución. |

---

## 4. 💻 Comandos del CLI de Archify

Puedes invocar el motor de Archify directamente desde la consola mediante Node.js:

```bash
# Ver ayuda y comandos disponibles
node ".agents/skills/archify/bin/archify.mjs" --help

# Renderizar un diagrama desde un archivo JSON
node ".agents/skills/archify/bin/archify.mjs" render <tipo> <entrada.json> <salida.html> --quality showcase

# Validar la estructura y calidad visual de un diagrama
node ".agents/skills/archify/bin/archify.mjs" validate <tipo> <entrada.json>

# Proceso completo de finalización (validación estricta + renderizado + verificación)
node ".agents/skills/archify/bin/archify.mjs" finalize <tipo> <entrada.json> <salida.html> --quality showcase

# Ver catálogo de marcas e iconos incorporados
node ".agents/skills/archify/bin/archify.mjs" brands
```

---

## 5. 🗣️ Cómo Solicitar Diagramas a tu Asistente de IA

No necesitas escribir archivos JSON manualmente a menos que lo desees; puedes solicitarlo en lenguaje natural y el agente ejecutará Archify automáticamente:

### Ejemplo 1: Arquitectura del Sistema
> *"Usa Archify para crear un diagrama interactivo de la arquitectura del SGBT, mostrando la interacción entre la PWA de despacho, el servidor Node.js, la base de datos local SQLite y la sincronización con Supabase Cloud."*

### Ejemplo 2: Flujo Criptográfico de Passkeys
> *"Usa Archify para generar un diagrama de secuencia de cómo un funcionario firma con su huella/FaceID y la mesa de despacho valida el código QR en menos de 180 segundos."*

### Ejemplo 3: Esquema de Base de Datos (ERD)
> *"Usa Archify para generar el diagrama ERD de las tablas `combos`, `daily_entitlements` y `deliveries` con sus relaciones de clave foránea."*

### Ejemplo 4: Página Explicativa Técnica (*Explainer*)
> *"Haz una página interactiva (explainer) con Archify explicando el protocolo de contingencia cuando un trabajador no tiene teléfono inteligente."*

---

## 6. 🛠️ Mantenimiento y Actualizaciones

Para verificar si existen nuevas versiones de Archify desde el registro de skills:

```bash
# Actualizar en el proyecto local
npx skills update archify -p -y

# Actualizar en el entorno global
npx skills update archify -g -y
```

---
*Documentación generada para el Sistema de Gestión de Beneficios y Titulares (SGBT) - MIPPCI.*
