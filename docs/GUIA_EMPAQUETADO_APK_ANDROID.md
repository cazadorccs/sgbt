# Guía de Empaquetado APK y Distribución Móvil Android
## Sistema de Gestión de Beneficios a Trabajadores (SGBT) — MIPPCI

---

### 1. Resumen Estratégico de la Hoja de Ruta

La distribución móvil de la plataforma SGBT opera bajo un **modelo híbrido optimizado**:

> [!NOTE] **Diagrama de Arquitectura y Distribución Móvil (Archify v3.2):**
> La topología de distribución híbrida (PWA Edge-to-Edge para Beneficiarios y APK TWA Bubblewrap para Almacén) está disponible como diagrama interactivo con controles de zoom, pan, modo oscuro/claro e inspección técnica de componentes:
> - 🌐 **Visor Interactivo en Vivo:** [distribucion-movil-twa.html](diagrams/distribucion-movil-twa.html) | [Centro de Diagramas SGBT](diagrams/index.html)
> - 📄 **Especificación Técnica Archify:** [distribucion-movil-twa.json](diagrams/distribucion-movil-twa.json)

1. **Beneficiarios (Trabajadores y Adultos Mayores):**
   - **Acceso Directo:** Ingresan desde el navegador móvil (Chrome, Safari, Firefox).
   - **Instalación con 1 Toque:** La aplicación muestra el botón interactivo **📲 Instalar App**.
   - **Borde a Borde (*Edge-to-Edge*):** Gracias a `viewport-fit=cover` y variables CSS `env(safe-area-inset-*)`, la interfaz fluye debajo del notch y la barra de gestos sin solapamientos.
   - **Cero Mantenimiento:** Se actualiza automáticamente sin reinstalaciones.
2. **Operadores de Almacén (Tabletas y Teléfonos Oficiales):**
   - **APK Nativo TWA:** Instalación del paquete `gob.ve.mippci.sgbt.apk`.
   - **Pantalla Siempre Activa (*Screen Wake Lock*):** La pantalla de la tableta no se suspende mientras el escáner de cámara o NFC esté operando.
   - **Pantalla Completa Real:** Gracias a los *Digital Asset Links* (`.well-known/assetlinks.json`), el sistema operativo oculta la barra de direcciones de Chrome.

---

### 2. Estructura de Archivos para TWA y Android

El repositorio cuenta con todos los artefactos requeridos por los estándares de Google:

| Archivo | Función y Propósito |
|:---|:---|
| [`public/manifest.json`](../public/manifest.json) | Manifiesto PWA con nombres, iconos (192px, 512px maskable), colores (`#0099cc`, `#040d16`) y accesos directos. |
| [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json) | Contrato Digital Asset Links que acredita ante Android que el dominio `sgbt-bice.vercel.app` es propietario de la app `gob.ve.mippci.sgbt`. |
| [`twa-manifest.json`](../twa-manifest.json) | Configuración del empaquetador oficial de Google (Bubblewrap) con soporte de notificaciones, pantalla completa y splash screen. |
| [`scripts/validate_twa.js`](../scripts/validate_twa.js) | Script de diagnóstico y validación previa de artefactos TWA. |
| [`scripts/package_android_apk.js`](../scripts/package_android_apk.js) | Pipeline automatizado de validación, generación de scaffold Gradle en `build/android/` y empaquetado APK. |

---

### 3. Pipeline Automatizado de Empaquetado (`npm run apk:package`)

Para verificar artefactos y generar automáticamente la estructura Gradle nativa para compilación local:
```bash
npm run apk:package
```
Este pipeline ejecuta:
1. Comprobación de los 6 artefactos obligatorios (`manifest.json`, `assetlinks.json`, `twa-manifest.json`, `android.keystore` e iconos 192/512px).
2. Generación automática del andamiaje Android Gradle en `build/android/`:
   - `AndroidManifest.xml` con permisos de Cámara, NFC, Internet y Vibrate.
   - `app/build.gradle` con dependencia oficial `com.google.androidbrowserhelper:androidbrowserhelper:2.5.0`.
   - Scripts de compilación unificados: `build_apk.bat` (Windows) y `build_apk.sh` (Linux/macOS).
3. Detección automática del entorno de compilación (Bubblewrap CLI y OpenJDK).

---

### 4. Guía Paso a Paso para Generar el Archivo APK con Bubblewrap

#### Prerrequisitos en la Estación de Trabajo del Técnico:
- **Node.js** v20 o v22 LTS instalado.
- **Java Development Kit (JDK 17 o superior)** (Bubblewrap lo descarga automáticamente si no existe).
- **Android SDK Command-line Tools** (Bubblewrap gestiona su descarga automática en la primera ejecución).

#### Paso 1: Instalar la CLI Oficial de Bubblewrap (Google)
```bash
npm install -g @bubblewrap/cli
```

#### Paso 2: Generar el Proyecto Android y Llave de Firma (Keystore)
En la raíz del proyecto, ejecute:
```bash
bubblewrap init --manifest="https://sgbt-bice.vercel.app/manifest.json"
```
Bubblewrap formulará preguntas interactivas predeterminadas:
- **Package Name:** `gob.ve.mippci.sgbt`
- **Application Name:** `Sistema de Beneficios y Despacho MIPPCI`
- **Display Mode:** `standalone` o `fullscreen`
- **KeyStore:** Si no posee una llave de firma, Bubblewrap le ofrecerá crear una nueva (`android.keystore`). Introduzca las contraseñas institucionales de la DGTIC.

#### Paso 3: Obtener la Huella Digital SHA-256 del Keystore
Una vez generado el keystore, obtenga la huella digital SHA-256 ejecutando:
```bash
bubblewrap fingerprint
```
O mediante la herramienta `keytool` de Java:
```bash
keytool -list -v -keystore android.keystore -alias android
```
Copie la huella digital `SHA-256: XX:XX:XX:...` e incorpórela en [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json) en el arreglo `sha256_cert_fingerprints`.

#### Paso 4: Compilar el APK Firmado
```bash
bubblewrap build
```
O mediante el alias configurado en `package.json`:
```bash
npm run twa:build
```
Este comando generará:
- `app-release-signed.apk` (Archivo APK instalable directamente en dispositivos móviles y tabletas).
- `app-release-bundle.aab` (Android App Bundle para subir a tiendas privadas o Google Play Console).

---

### 5. Instalación en Tabletas de Almacén

#### Método A: Instalación Directa por Cable USB (ADB)
1. Active la **Depuración por USB** en los Ajustes de Desarrollador de la tableta Android.
2. Conecte la tableta a la computadora e instale con:
   ```bash
   adb install -r app-release-signed.apk
   ```

#### Método B: Distribución por Enlace Institucional
1. Copie el archivo `app-release-signed.apk` a un servidor de descargas interno o nube institucional.
2. Abra el enlace en el navegador de la tableta y presione **Descargar e Instalar**.

---

### 7. Especificaciones Técnicas del APK Release v3.7

| Parámetro | Valor de Producción |
|:---|:---|
| **Nombre del Paquete (Package ID)** | `app.vercel.sgbt_bice.twa` / `gob.ve.mippci.sgbt` |
| **Versión de la App (VersionName)** | `3.7` |
| **Código de Versión (VersionCode)** | `37` |
| **Esquema de Firma Criptográfica** | APK Signature Scheme v2 (Verificado con `apksigner`) |
| **Firma Digital (Certificate DN)** | `CN=SGBT-MIPPCI` |
| **Huella Digital SHA-256 Certificado** | `2C:9F:C3:5B:58:A0:B5:74:DA:34:79:44:2A:0D:8F:CF:B3:5A:B9:1E:A8:0D:7C:7C:C3:7A:D3:2C:19:3B:51:D5` |
| **Digital Asset Links** | 100% verificado contra `https://sgbt-bice.vercel.app/.well-known/assetlinks.json` |
| **Peso del Archivo** | 1.86 MB (1,865,755 bytes) |
| **Suma de Comprobación SHA-256 APK** | `5EC9A9E1A818A80698D7A9C01F1D3F4C8E5AF72BFE8C85AF7FE193DCE896F127` |
| **Rutas de Descarga Oficial** | `https://sgbt-bice.vercel.app/download/sgbt-v3.7.apk`<br>`https://sgbt-bice.vercel.app/download/sgbt.apk` |

Para evitar que los operarios de almacén cierren la aplicación, desvíen el uso de la tableta o alteren la configuración durante la jornada:

1. **Fijar Pantalla Nativo (Android Screen Pinning):**
   - Vaya a *Ajustes > Seguridad > Avanzado > Fijar aplicación (App Pinning)* y actívelo.
   - Abra la aplicación **Bienestar MIPPCI**.
   - En el menú de aplicaciones recientes, pulse el icono de la app y seleccione **Fijar**. La tableta quedará bloqueada dentro de SGBT hasta que un supervisor introduzca el PIN de desbloqueo.
2. **Lanzador Kiosco Dedicado (Opcional para Almacenes de Alto Tráfico):**
   - Se puede utilizar un lanzador de código abierto como **Fully Kiosk Browser** o configurar la app como *Device Owner* mediante Android Enterprise / MDM.

