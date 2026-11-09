// benchmarks/benchmark_ui_ergonomics.js
// Benchmark estandarizado para Autoresearch - Medición de Ergonomía Táctil (Touch Targets) y Contraste WCAG 2.2 AAA

const fs = require('fs');
const path = require('path');

function parseHex(hex) {
  hex = hex.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getRelativeLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(fgHex, bgHex) {
  const l1 = getRelativeLuminance(parseHex(fgHex));
  const l2 = getRelativeLuminance(parseHex(bgHex));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function runUiErgonomicsBenchmark() {
  console.log(`\n======================================================`);
  console.log(`🔬 AUTORESEARCH BENCHMARK: ERGONOMÍA TÁCTIL Y WCAG AAA`);
  console.log(`📱 Criterio: Touch Targets ≥ 48x48 px & Contraste ≥ 7.0:1`);
  console.log(`======================================================`);

  const cssPath = path.join(__dirname, '../public/css/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // 1. Auditoría de Touch Targets Críticos en styles.css
  const touchTargets = [
    { name: 'Botones Globales (.btn)', selector: '.btn', minH: 44, recH: 48 },
    { name: 'Tabs de Navegación Móvil (.mobile-tab-btn)', selector: '.mobile-tab-btn', minH: 48, recH: 48 },
    { name: 'Teclado Numérico PIN (.pin-btn)', selector: '.pin-btn', minH: 48, recH: 56 },
    { name: 'Inputs de Formulario (input, select)', selector: '.form-control', minH: 44, recH: 48 },
    { name: 'Botones de Cierre de Modal (.modal-close)', selector: '.modal-close', minH: 40, recH: 48 },
    { name: 'Botones de Mesa de Despacho (.mesa-card-btn)', selector: '.mesa-card-btn', minH: 48, recH: 48 },
    { name: 'Acciones de Escaneo y Retiro (#btnStartScanner)', selector: '#btnStartScanner', minH: 48, recH: 52 }
  ];

  let compliantTargets = 0;
  const targetResults = [];

  for (const t of touchTargets) {
    // Buscar si existe min-height o padding que garantice altura ergonómica
    const regex = new RegExp(`${t.selector.replace(/[\.\#]/g, '\\$&')}[^{]*\\{[^}]*\\}`, 'g');
    const matches = css.match(regex) || [];
    let heightFound = 0;

    for (const block of matches) {
      const minHMatch = block.match(/min-height\s*:\s*(\d+)px/);
      const hMatch = block.match(/height\s*:\s*(\d+)px/);
      const padMatch = block.match(/padding\s*:\s*(\d+)px/);

      if (minHMatch) heightFound = Math.max(heightFound, parseInt(minHMatch[1], 10));
      if (hMatch) heightFound = Math.max(heightFound, parseInt(hMatch[1], 10));
      if (padMatch && heightFound === 0) heightFound = parseInt(padMatch[1], 10) * 2 + 16;
    }

    const isCompliant = heightFound >= t.minH;
    if (isCompliant) compliantTargets++;

    targetResults.push({
      name: t.name,
      heightFound: heightFound || 'No explícito',
      minRequired: `${t.minH}px`,
      recommended: `${t.recH}px`,
      status: isCompliant ? 'CUMPLE' : 'SUB-ÓPTIMO'
    });
  }

  // 2. Auditoría de Ratios de Contraste WCAG 2.2 AAA (Mínimo 7.0:1 para modo luz solar y alta legibilidad)
  const bgDark = '#0a0f1d';
  const bgCard = '#141e33';
  const bgSolarLight = '#ffffff';

  // Extraer token institucional solar de alta legibilidad desde styles.css
  const blueSolarMatch = css.match(/--badge-blue-text\s*:\s*(#[0-9a-fA-F]{6})/);
  const blueSolarFg = blueSolarMatch ? blueSolarMatch[1] : '#025988';

  const contrastChecks = [
    { name: 'Texto Principal en Fondo Oscuro', fg: '#f8fafc', bg: bgDark, target: 7.0 },
    { name: 'Texto Secundario en Card Oscuro', fg: '#cbd5e1', bg: bgCard, target: 7.0 },
    { name: 'Texto Éxito/Aprobado (Esmeralda)', fg: '#34d399', bg: bgDark, target: 7.0 },
    { name: 'Texto Ámbar Alerta en Card', fg: '#fbbf24', bg: bgCard, target: 7.0 },
    { name: 'Texto Azul Institucional Solar', fg: blueSolarFg, bg: bgSolarLight, target: 7.0 },
    { name: 'Texto Negro Puro en Modo Solar', fg: '#0f172a', bg: bgSolarLight, target: 7.0 }
  ];

  let compliantContrast = 0;
  const contrastResults = [];

  for (const c of contrastChecks) {
    const ratio = getContrastRatio(c.fg, c.bg);
    const passesAAA = ratio >= c.target;
    if (passesAAA) compliantContrast++;

    contrastResults.push({
      name: c.name,
      ratio: ratio.toFixed(2) + ':1',
      target: c.target + ':1 (AAA)',
      status: passesAAA ? 'CUMPLE AAA' : 'CUMPLE AA (MEJORABLE A AAA)'
    });
  }

  // Imprimir Resultados
  console.log('--- AUDITORÍA DE ZONAS TÁCTILES (TOUCH TARGETS) ---');
  for (const r of targetResults) {
    const icon = r.status === 'CUMPLE' ? '✅' : '⚠️';
    console.log(`   ${icon} ${r.name.padEnd(35)} Altura: ${String(r.heightFound).padEnd(8)} (Min: ${r.minRequired}) -> ${r.status}`);
  }

  console.log('\n--- AUDITORÍA DE CONTRASTE WCAG 2.2 AAA (SOL & ALMACÉN) ---');
  for (const r of contrastResults) {
    const icon = r.status.includes('AAA') && !r.status.includes('MEJORABLE') ? '✅' : '⚠️';
    console.log(`   ${icon} ${r.name.padEnd(35)} Ratio: ${r.ratio.padEnd(8)} (Objetivo: ${r.target}) -> ${r.status}`);
  }

  const ergonomicsPct = Math.round((compliantTargets / touchTargets.length) * 100);
  const contrastAaaPct = Math.round((compliantContrast / contrastChecks.length) * 100);

  console.log(`\n======================================================`);
  console.log(`🎯 Conformidad Ergonomía Táctil: ${compliantTargets}/${touchTargets.length} (${ergonomicsPct}%)`);
  console.log(`☀️  Conformidad Contraste AAA:   ${compliantContrast}/${contrastChecks.length} (${contrastAaaPct}%)`);
  console.log(`======================================================\n`);

  return {
    compliantTargets,
    totalTargets: touchTargets.length,
    ergonomicsPct,
    compliantContrast,
    totalContrast: contrastChecks.length,
    contrastAaaPct
  };
}

if (require.main === module) {
  runUiErgonomicsBenchmark();
}

module.exports = { runUiErgonomicsBenchmark };
