// ============================================================================
// SUITE DE GOBERNANZA UI/UX Y REGRESIÓN VISUAL — FASE 4 (SGBT - MIPPCI)
// Valida las 10 categorías de ui-ux-pro-max + craft-floor de impeccable +
// cero deriva de rutas + reglas MASTER.md sobre superficies Operate y styles.css
// ============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function assertCheck(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✅ [OK] ${label}`);
    passed++;
  } else {
    console.error(`  ❌ [FALLA] ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function readRel(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

console.log('================================================================');
console.log('🏛️ SUITE DE GOBERNANZA UI/UX & REGRESIÓN DE DESIGN SYSTEM (FASE 4)');
console.log('================================================================\n');

const stylesCss = readRel('public/css/styles.css');
const operatePages = [
  { name: 'Carnet / Consola Principal (index.html)', path: 'public/index.html', needsMain: true },
  { name: 'Consola /coseg (coseg.html)', path: 'public/coseg.html', needsMain: true },
  { name: 'Monitor en Vivo (/entregas)', path: 'public/entregas.html', needsMain: true },
  { name: 'Estación Supervisor (/supervisor)', path: 'public/supervisor.html', needsMain: true },
  { name: 'Simulador Dual (/simulador)', path: 'public/simulador.html', needsMain: false }
];
const modalsHtml = readRel('public/templates/modals.html');

// -----------------------------------------------------------------------------
// 1. INTEGRIDAD DE ARTEFACTOS RECTORES Y CERO DERIVA DE RUTAS
// -----------------------------------------------------------------------------
console.log('--- 1. Documentación Rectora & Sincronización de Rutas ---');

const designDocs = [
  'PRODUCT.md',
  'DESIGN.md',
  'design-system/sgbt-mippci/MASTER.md',
  'design-system/sgbt-mippci/INVENTORY.md',
  'design-system/sgbt-mippci/AUDIT_FASE2.md',
  'design-system/sgbt-mippci/AUDIT_FASE4.md'
];
for (const doc of designDocs) {
  assertCheck(fs.existsSync(path.join(ROOT, doc)), `Documento rector presente: ${doc}`);
}
const masterMd = readRel('design-system/sgbt-mippci/MASTER.md');
assertCheck(
  masterMd.includes('#0369a1') && masterMd.includes('#475569') && stylesCss.includes('--text-accent: #0369a1') && stylesCss.includes('--text-dim: #475569'),
  'MASTER.md y styles.css comparten los mismos tokens WCAG Claro (#0369a1 / #475569)'
);

const routeMirrors = [
  ['public/index.html', 'public/coseg.html'],
  ['public/index.html', 'public/coseg/index.html'],
  ['public/entregas.html', 'public/entregas/index.html'],
  ['public/supervisor.html', 'public/supervisor/index.html'],
  ['public/simulador.html', 'public/simulador/index.html']
];
for (const [src, mirror] of routeMirrors) {
  assertCheck(readRel(src) === readRel(mirror), `Sincronía byte-a-byte: ${src} === ${mirror}`);
}

// -----------------------------------------------------------------------------
// 2. ACCESIBILIDAD, LANDMARKS, FOCO Y VIEWPORT (Cat. 1 y 5 de ui-ux-pro-max)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Accesibilidad, Landmarks, Foco y Viewport Móvil ---');

for (const page of operatePages) {
  const html = readRel(page.path);
  assertCheck(
    !/user-scalable=no|maximum-scale=1\.0/i.test(html),
    `${page.name}: Zoom táctil habilitado (sin user-scalable=no / maximum-scale=1.0)`
  );
  assertCheck(
    html.includes('class="skip-link"'),
    `${page.name}: Incluye Skip Link accesible`
  );
  if (page.needsMain) {
    assertCheck(
      /<main\b/i.test(html),
      `${page.name}: Posee landmark <main>`
    );
  }

  // Verificar alt="" en todas las <img>
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const imgsWithoutAlt = imgs.filter(tag => !/\balt=/i.test(tag));
  assertCheck(
    imgsWithoutAlt.length === 0,
    `${page.name}: Todas las etiquetas <img> (${imgs.length}) tienen atributo alt`
  );

  // Verificar que ningún botón dentro de <form> carezca de type=
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)];
  let formBtnsWithoutType = 0;
  for (const fm of forms) {
    const btns = [...fm[0].matchAll(/<button\b[^>]*>/gi)].map(m => m[0]);
    formBtnsWithoutType += btns.filter(b => !/\btype=/i.test(b)).length;
  }
  assertCheck(
    formBtnsWithoutType === 0,
    `${page.name}: Botones dentro de <form> tienen atributo type explícito`
  );

  // Verificar jerarquía secuencial de encabezados h1..h6 sin saltos
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map(m => Number(m[1]));
  const skips = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      skips.push(`h${levels[i - 1]}->h${levels[i]}`);
    }
  }
  assertCheck(
    skips.length === 0,
    `${page.name}: Jerarquía de encabezados continua (sin saltos hN -> hN+2)`,
    skips.join(', ')
  );
}

// Modales: alt en imágenes y botones dentro de forms con type=
const modalImgs = [...modalsHtml.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
assertCheck(
  modalImgs.every(tag => /\balt=/i.test(tag)),
  `modals.html: Todas las <img> (${modalImgs.length}) tienen alt`
);
const modalForms = [...modalsHtml.matchAll(/<form\b[\s\S]*?<\/form>/gi)];
let modalFormBtnsMissingType = 0;
for (const fm of modalForms) {
  const btns = [...fm[0].matchAll(/<button\b[^>]*>/gi)].map(m => m[0]);
  modalFormBtnsMissingType += btns.filter(b => !/\btype=/i.test(b)).length;
}
assertCheck(
  modalFormBtnsMissingType === 0,
  'modals.html: Todos los botones dentro de <form> tienen atributo type explícito'
);

// CSS Focus & Ocultamiento seguro de imágenes pre-hidratación
assertCheck(
  stylesCss.includes(':focus-visible') && stylesCss.includes('3px solid #0369a1') && stylesCss.includes('3px solid #38bdf8'),
  'styles.css: Anillo de foco :focus-visible de alto contraste (3px Claro #0369a1 / Oscuro #38bdf8)'
);
assertCheck(
  stylesCss.includes('.modal-dialog img[src=""]'),
  'styles.css: Ocultamiento preventivo de <img src=""> en modales antes de hidratar'
);

// -----------------------------------------------------------------------------
// 3. INTERACCIÓN TÁCTIL, RENDIMIENTO Y MOVIMIENTO (Cat. 2, 3, 5, 7 y craft-floor)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Hit Areas, Viewport 100dvh, Movimiento y Craft Floor ---');

assertCheck(
  !/transition:\s*all/i.test(stylesCss),
  'styles.css: Cero declaraciones transition: all'
);
for (const page of operatePages) {
  assertCheck(
    !/transition:\s*all/i.test(readRel(page.path)),
    `${page.name}: Cero declaraciones transition: all en línea o <style>`
  );
}

assertCheck(
  !/100vh\b/i.test(stylesCss),
  'styles.css: Cero usos de 100vh rígido (reemplazado por 100dvh)'
);
for (const page of operatePages) {
  assertCheck(
    !/100vh\b/i.test(readRel(page.path)),
    `${page.name}: Cero usos de 100vh rígido`
  );
}

assertCheck(
  stylesCss.includes('scroll-padding-block-start:'),
  'styles.css: scroll-padding-block-start activo para despejar cabeceras sticky'
);
assertCheck(
  stylesCss.includes('@media (prefers-reduced-motion: reduce)') &&
  stylesCss.includes('.tg-center-crosshair'),
  'styles.css: prefers-reduced-motion cubre animaciones globales y guía QR (.tg-center-crosshair)'
);
assertCheck(
  !stylesCss.includes('animation: pulse-ring') && !readRel('public/entregas.html').includes('animation: pulse '),
  'styles.css / entregas.html: Cero puntos de pulso infinito en barra superior'
);
assertCheck(
  stylesCss.includes('.search-box-clear-btn::after') &&
  stylesCss.includes('width: 44px;') &&
  stylesCss.includes('height: 44px;'),
  'styles.css: Botón limpiar búsqueda expande hit area a 44x44px'
);
assertCheck(
  stylesCss.includes('min-height: 44px;') &&
  stylesCss.includes('.portal-subtab') &&
  stylesCss.includes('.dropdown-item'),
  'styles.css: Controles interactivos principales garantizan min-height: 44px'
);
assertCheck(
  stylesCss.includes('font-size: max(1rem, 16px);'),
  'styles.css: Regla móvil >= 16px en inputs/selects/textareas para prevenir auto-zoom iOS'
);

// Browser Surfaces & Tabular Numerals (craft-floor)
assertCheck(
  stylesCss.includes('::selection') &&
  stylesCss.includes('::-webkit-scrollbar-thumb') &&
  stylesCss.includes('caret-color:') &&
  stylesCss.includes('text-underline-offset:') &&
  stylesCss.includes('text-wrap: balance') &&
  stylesCss.includes('text-wrap: pretty') &&
  stylesCss.includes('font-variant-numeric: tabular-nums'),
  'styles.css: Craft-floor completo (selection, scrollbar, caret-color, underline-offset, text-wrap, tabular-nums)'
);

const entregasHtml = readRel('public/entregas.html');
const supervisorHtml = readRel('public/supervisor.html');
assertCheck(
  entregasHtml.includes('Plus+Jakarta+Sans') &&
  entregasHtml.includes('font-size: 1.45rem') &&
  entregasHtml.includes('font-variant-numeric: tabular-nums'),
  'entregas.html: Tipografía institucional, jerarquía >= 1.25x y cifras tabulares activas'
);
assertCheck(
  supervisorHtml.includes('Plus+Jakarta+Sans') &&
  supervisorHtml.includes('data-default-theme="light"') &&
  supervisorHtml.includes('font-variant-numeric: tabular-nums'),
  'supervisor.html: Tipografía institucional, tema claro por defecto y cifras tabulares activas'
);

// -----------------------------------------------------------------------------
// RESUMEN FINAL
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 BALANCE GOBERNANZA UI/UX: ${passed} OK | ${failed} FALLAS`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
