// ============================================================================
// VALIDADOR DE CONFIGURACIÓN TWA / ANDROID APK (BUBBLEWRAP READY)
// ============================================================================

const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('📱 VALIDACIÓN DE ARTEFACTOS TWA Y EMPAQUETADO ANDROID APK');
console.log('================================================================\n');

let hasErrors = false;

// 1. Validar Web App Manifest
const manifestPath = path.join(__dirname, '../public/manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('❌ Falta public/manifest.json');
  hasErrors = true;
} else {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.start_url || !manifest.icons || !manifest.name) {
      console.error('❌ manifest.json no contiene campos mínimos obligatorios.');
      hasErrors = true;
    } else {
      console.log(`✅ Web Manifest válido: "${manifest.name}" (${manifest.icons.length} iconos definidos)`);
    }
  } catch (e) {
    console.error('❌ Error de sintaxis en manifest.json:', e.message);
    hasErrors = true;
  }
}

// 2. Validar Digital Asset Links
const assetlinksPath = path.join(__dirname, '../public/.well-known/assetlinks.json');
if (!fs.existsSync(assetlinksPath)) {
  console.error('❌ Falta public/.well-known/assetlinks.json');
  hasErrors = true;
} else {
  try {
    const assetlinks = JSON.parse(fs.readFileSync(assetlinksPath, 'utf8'));
    if (!Array.isArray(assetlinks) || assetlinks.length === 0 || !assetlinks[0].target?.package_name) {
      console.error('❌ assetlinks.json no tiene el formato esperado por Android.');
      hasErrors = true;
    } else {
      console.log(`✅ Digital Asset Links válido para paquete Android: "${assetlinks[0].target.package_name}"`);
    }
  } catch (e) {
    console.error('❌ Error de sintaxis en assetlinks.json:', e.message);
    hasErrors = true;
  }
}

// 3. Validar TWA Manifest de Bubblewrap
const twaManifestPath = path.join(__dirname, '../twa-manifest.json');
if (!fs.existsSync(twaManifestPath)) {
  console.error('❌ Falta twa-manifest.json en la raíz del proyecto');
  hasErrors = true;
} else {
  try {
    const twaManifest = JSON.parse(fs.readFileSync(twaManifestPath, 'utf8'));
    if (!twaManifest.packageId || !twaManifest.host) {
      console.error('❌ twa-manifest.json incompleto.');
      hasErrors = true;
    } else {
      console.log(`✅ TWA Manifest válido: Host="${twaManifest.host}", Package="${twaManifest.packageId}"`);
    }
  } catch (e) {
    console.error('❌ Error de sintaxis en twa-manifest.json:', e.message);
    hasErrors = true;
  }
}

// 4. Validar existencia de iconos físicos
const icon192 = path.join(__dirname, '../public/icons/icon-192.png');
const icon512 = path.join(__dirname, '../public/icons/icon-512.png');
if (fs.existsSync(icon192) && fs.existsSync(icon512)) {
  console.log('✅ Iconos requeridos para Android encontrados (192px y 512px)');
} else {
  console.warn('⚠️ Uno o más iconos recomendados no están en public/icons/');
}

console.log('\n================================================================');
if (hasErrors) {
  console.error('❌ CONFORMIDAD TWA INCOMPLETA: Corrija los errores indicados.');
  process.exit(1);
} else {
  console.log('🎉 TODOS LOS ARTEFACTOS TWA ESTÁN 100% LISTOS PARA BUBBLEWRAP');
  console.log('   Para compilar el APK ejecute: npx @bubblewrap/cli build');
  console.log('================================================================');
  process.exit(0);
}

