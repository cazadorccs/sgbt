// benchmarks/benchmark_frontend_pwa.js
// Benchmark estandarizado para Autoresearch - Medición de Peso del Frontend y Eficiencia de Carga PWA

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function runPwaBenchmark() {
  console.log(`\n======================================================`);
  console.log(`🔬 AUTORESEARCH BENCHMARK: PESO DEL FRONTEND Y PWA`);
  console.log(`📱 Componente: Shell PWA, Service Worker y Cache Assets`);
  console.log(`======================================================`);

  const swPath = path.join(__dirname, '../public/sw.js');
  if (!fs.existsSync(swPath)) {
    throw new Error('public/sw.js no encontrado');
  }

  const swCode = fs.readFileSync(swPath, 'utf8');
  const match = swCode.match(/const STATIC_ASSETS = \[(.*?)\];/s);
  if (!match) {
    throw new Error('STATIC_ASSETS no encontrado en public/sw.js');
  }

  const assets = eval('[' + match[1] + ']');
  let totalRawBytes = 0;
  let totalGzipBytes = 0;
  let missingCount = 0;
  const assetDetails = [];
  const fileHashMap = new Map();
  let duplicatedDownloadsBytes = 0;

  for (const urlPath of assets) {
    let relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
    if (relPath === 'coseg') relPath = 'coseg.html';
    if (relPath === 'entregas') relPath = 'entregas.html';

    const fullPath = path.join(__dirname, '../public', relPath);
    if (!fs.existsSync(fullPath)) {
      missingCount++;
      continue;
    }

    const buf = fs.readFileSync(fullPath);
    const gz = zlib.gzipSync(buf);

    totalRawBytes += buf.length;
    totalGzipBytes += gz.length;

    // Detectar si el mismo contenido en disco se descarga múltiples veces bajo diferentes URLs
    const hash = zlib.crc32(buf);
    if (fileHashMap.has(hash)) {
      duplicatedDownloadsBytes += buf.length;
    } else {
      fileHashMap.set(hash, urlPath);
    }

    assetDetails.push({
      url: urlPath,
      rawKb: Math.round((buf.length / 1024) * 10) / 10,
      gzipKb: Math.round((gz.length / 1024) * 10) / 10
    });
  }

  // Detectar estrategia de caché en SW
  const isStaleWhileRevalidate = swCode.includes('Stale-While-Revalidate') || swCode.includes('caches.match(event.request)') && swCode.includes('fetch(event.request).then(');
  const isNetworkFirst = swCode.includes('Network-First con fallback a Caché') && !swCode.includes('Stale-While-Revalidate');

  const totalRawKb = Math.round((totalRawBytes / 1024) * 10) / 10;
  const totalGzipKb = Math.round((totalGzipBytes / 1024) * 10) / 10;
  const dupKb = Math.round((duplicatedDownloadsBytes / 1024) * 10) / 10;

  console.log(`📦 Total Assets Precacheados:   ${assets.length} archivos`);
  console.log(`⚖️  Peso Total PWA (Raw):       ${totalRawKb} KB`);
  console.log(`⚡ Peso Total PWA (Gzip Wire):  ${totalGzipKb} KB`);
  console.log(`🔄 Descarga Redundante/Duplicada:${dupKb} KB`);
  console.log(`🚦 Estrategia de Entrega SW:   ${isStaleWhileRevalidate && !isNetworkFirst ? 'Stale-While-Revalidate (Instantánea)' : 'Network-First (Bloqueante en red lenta)'}`);
  console.log(`✅ Integridad de Assets:       ${missingCount === 0 ? '100% Presentes en disco' : `FALLO (${missingCount} faltantes)`}`);
  console.log(`======================================================\n`);

  return {
    totalAssets: assets.length,
    totalRawKb,
    totalGzipKb,
    dupKb,
    isStaleWhileRevalidate: isStaleWhileRevalidate && !isNetworkFirst,
    allPresent: missingCount === 0
  };
}

if (require.main === module) {
  try {
    const stats = runPwaBenchmark();
    process.exit(stats.allPresent ? 0 : 1);
  } catch (err) {
    console.error('Benchmark Error:', err);
    process.exit(1);
  }
}

module.exports = { runPwaBenchmark };
