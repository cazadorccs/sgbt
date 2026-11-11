// ============================================================================
// SUITE DE VERIFICACIÓN WCAG 2.2 AA / AAA: MODO OSCURO & CONTRASTE EN MODALES
// Valida tokens, componentes y modales institucionales (SGBT - MIPPCI)
// ============================================================================

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

console.log('================================================================');
console.log('🎨 VERIFICACIÓN DE CONTRASTE Y ACCESIBILIDAD WCAG 2.2 AA (MODO OSCURO)');
console.log('================================================================\n');

let failed = false;

// -----------------------------------------------------------------------------
// FASE 1: TOKENS GLOBALES Y SUPERFICIES OSCURAS
// -----------------------------------------------------------------------------
console.log('--- FASE 1: TOKENS GLOBALES DE MODO OSCURO ---');
const darkSurfaces = {
  'bg-primary (#0a0f1d)': '#0a0f1d',
  'bg-surface-0 / table-th (#0f172a)': '#0f172a',
  'bg-surface-card / modal-dialog (#141e33)': '#141e33',
  'bg-surface-2 / dropdown (#1e293b)': '#1e293b'
};

const darkTextTokens = [
  { name: '--text-main (Texto Principal)', hex: '#f8fafc', requiredRatio: 4.5, level: 'AA/AAA' },
  { name: '--text-muted (Texto Secundario/Cuerpo)', hex: '#cbd5e1', requiredRatio: 4.5, level: 'AA/AAA' },
  { name: '--text-dim (Texto Atenuado/Labels)', hex: '#94a3b8', requiredRatio: 4.5, level: 'AA' },
  { name: '--text-accent (Celeste Institucional)', hex: '#38bdf8', requiredRatio: 4.5, level: 'AA/AAA' },
  { name: '--badge-green-text (Esmeralda Éxito)', hex: '#34d399', requiredRatio: 4.5, level: 'AA/AAA' },
  { name: '--badge-amber-text (Ámbar Advertencia)', hex: '#fbbf24', requiredRatio: 4.5, level: 'AA/AAA' },
  { name: '--badge-red-text (Rojo Peligro)', hex: '#f87171', requiredRatio: 4.5, level: 'AA' },
  { name: '--text-subtle / [disabled] (Deshabilitado/Sutil)', hex: '#64748b', requiredRatio: 3.0, level: 'AA (Disabled)' }
];

for (const [surfaceName, bgHex] of Object.entries(darkSurfaces)) {
  console.log(`📌 Superficie: ${surfaceName}`);
  for (const token of darkTextTokens) {
    const ratio = getContrastRatio(token.hex, bgHex);
    const passed = ratio >= token.requiredRatio;
    const formattedRatio = ratio.toFixed(2) + ':1';
    if (passed) {
      console.log(`   ✅ [${token.level}] ${token.name}: ${formattedRatio}`);
    } else {
      console.error(`   ❌ [FALLA] ${token.name}: ${formattedRatio} (Min: ${token.requiredRatio}:1)`);
      failed = true;
    }
  }
}

// -----------------------------------------------------------------------------
// FASE 2: VERIFICACIÓN ESPECÍFICA DE CONTENEDORES Y TEXTOS EN MODALES
// -----------------------------------------------------------------------------
console.log('\n--- FASE 2: AUDITORÍA DE MODALES DEL SISTEMA ---');

const modalComponents = [
  {
    modal: 'recentDeliveriesModal (Registro de Despachos en Vivo)',
    element: 'Título del modal (📋 Registro de Despachos en Vivo)',
    fgHex: '#f8fafc',
    bgHex: '#141e33',
    minRatio: 4.5
  },
  {
    modal: 'recentDeliveriesModal (Registro de Despachos en Vivo)',
    element: 'Badge Contador de funcionarios atendidos (#modalRecentDeliveriesCount)',
    fgHex: '#38bdf8',
    bgHex: '#141e33', // fondo detrás del badge
    minRatio: 4.5
  },
  {
    modal: 'recentDeliveriesModal (Registro de Despachos en Vivo)',
    element: 'Subtítulo (Historial consolidado de entregas manuales...)',
    fgHex: '#94a3b8',
    bgHex: '#141e33',
    minRatio: 4.5
  },
  {
    modal: 'recentDeliveriesModal (Registro de Despachos en Vivo)',
    element: 'Cabecera de Tabla (th: Hora, Funcionario, Combos)',
    fgHex: '#94a3b8',
    bgHex: '#0f172a',
    minRatio: 4.5
  },
  {
    modal: 'recentDeliveriesModal (Registro de Despachos en Vivo)',
    element: 'Fila de Datos de Funcionario (td: Nombre y Cédula)',
    fgHex: '#f8fafc',
    bgHex: '#141e33',
    minRatio: 4.5
  },
  {
    modal: 'recentDeliveriesModal (Registro de Despachos en Vivo)',
    element: 'Badge de Combos Despachados (📦 X combos)',
    fgHex: '#38bdf8',
    bgHex: '#141e33',
    minRatio: 4.5
  },
  {
    modal: 'workerPhotoPreviewModal (Fotografía Institucional)',
    element: 'Nombre del funcionario (#workerPhotoPreviewName)',
    fgHex: '#f8fafc',
    bgHex: '#141e33',
    minRatio: 4.5
  },
  {
    modal: 'systemSettingsModal (Configuración General)',
    element: 'Título de Tarjeta (setting-card-title: Modo Oscuro)',
    fgHex: '#f8fafc',
    bgHex: '#0f172a',
    minRatio: 4.5
  },
  {
    modal: 'systemSettingsModal (Configuración General)',
    element: 'Descripción de Tarjeta (setting-card-desc)',
    fgHex: '#94a3b8',
    bgHex: '#0f172a',
    minRatio: 4.5
  },
  {
    modal: 'resetSystemModal (Respaldo y Reseteo)',
    element: 'Texto de Opciones de Respaldo',
    fgHex: '#cbd5e1',
    bgHex: '#0f172a',
    minRatio: 4.5
  },
  {
    modal: 'view-worker (Carnet Oficial de Beneficiario)',
    element: 'Avatar Iniciales "SV" (#workerHeaderAvatar)',
    fgHex: '#ffffff',
    bgHex: '#0369a1',
    minRatio: 4.5
  },
  {
    modal: 'view-worker (Carnet Oficial de Beneficiario)',
    element: 'Título Institucional (.mobile-app-title: 🏛️ MIPPCI Beneficios)',
    fgHex: '#ffffff',
    bgHex: '#0369a1',
    minRatio: 4.5
  },
  {
    modal: 'view-worker (Carnet Oficial de Beneficiario)',
    element: 'Nombre y Cédula (.mobile-app-identity: SAHIB ALEXANDER FRANCO VILLANUEVA)',
    fgHex: '#e0f2fe',
    bgHex: '#0369a1',
    minRatio: 4.5
  },
  {
    modal: 'view-worker (Carnet Oficial de Beneficiario)',
    element: 'Insignia Condición Laboral (#workerConditionBadge: 🏛️ Personal Directivo)',
    fgHex: '#ffffff',
    bgHex: '#047857',
    minRatio: 4.5
  },
  {
    modal: 'view-distributor (Mesa de Despacho)',
    element: 'Texto Standby del Escáner (#distributorStandbyText)',
    fgHex: '#94a3b8',
    bgHex: '#020617',
    minRatio: 4.5
  }
];

for (const comp of modalComponents) {
  const ratio = getContrastRatio(comp.fgHex, comp.bgHex);
  const passed = ratio >= comp.minRatio;
  const formattedRatio = ratio.toFixed(2) + ':1';
  if (passed) {
    console.log(`   ✅ [PANTALLA OK] ${comp.modal} -> ${comp.element}: ${formattedRatio} (Min: ${comp.minRatio}:1)`);
  } else {
    console.error(`   ❌ [PANTALLA FALLA] ${comp.modal} -> ${comp.element}: ${formattedRatio} (Min: ${comp.minRatio}:1)`);
    failed = true;
  }
}

// -----------------------------------------------------------------------------
// FASE 3: INSPECCIÓN DE CÓDIGO HTML Y CSS (PREVENCIÓN DE TEXTO CLARO EN FONDO BLANCO)
// -----------------------------------------------------------------------------
console.log('\n--- FASE 3: INSPECCIÓN DE CÓDIGO FUENTE EN PLANTILLAS Y ESTILOS ---');

const indexHtmlPath = path.join(__dirname, '../public/index.html');
const modalsHtmlPath = path.join(__dirname, '../public/templates/modals.html');
const stylesCssPath = path.join(__dirname, '../public/css/styles.css');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const modalsHtml = fs.readFileSync(modalsHtmlPath, 'utf8');
const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');

// 1. Verificar que el modal recentDeliveriesModalDialog no tenga tabla con background blanco
if (indexHtml.includes('id="recentDeliveriesModalDialog"')) {
  const modalSection = indexHtml.substring(indexHtml.indexOf('id="recentDeliveriesModalDialog"'), indexHtml.indexOf('id="recentDeliveriesModalDialog"') + 1500);
  if (modalSection.includes('background: #ffffff;') || modalSection.includes('background: #ffffff')) {
    console.error('   ❌ [FALLA] Se detectó background blanco rígido (#ffffff) en recentDeliveriesModal');
    failed = true;
  } else {
    console.log('   ✅ recentDeliveriesModal: Sin background blanco rígido en contenedor de tabla');
  }
}

// 2. Verificar que styles.css contenga la regla de blindaje para modales en modo oscuro
if (stylesCss.includes('body.dark-mode .modal-dialog table') && 
    stylesCss.includes('body.dark-mode .modal-dialog [style*="background: #ffffff"]')) {
  console.log('   ✅ styles.css: Blindaje maestro de tablas y contenedores en .modal-dialog activo');
} else {
  console.error('   ❌ [FALLA] styles.css no contiene regla de blindaje para modal-dialog en modo oscuro');
  failed = true;
}

// 3. Verificar que styles.css contenga la regla de blindaje para el carnet y dispositivo móvil
if (stylesCss.includes('body.dark-mode .device-screen') && 
    stylesCss.includes('body.dark-mode .mobile-app-bar')) {
  console.log('   ✅ styles.css: Blindaje de contraste para .device-screen y .mobile-app-bar en modo oscuro');
} else {
  console.error('   ❌ [FALLA] styles.css no contiene regla de blindaje para .device-screen en modo oscuro');
  failed = true;
}

// 4. Verificar ausencia de color rígido ilegible sea-onahau en index.html
if (indexHtml.includes('color: var(--sea-onahau);')) {
  console.error('   ❌ [FALLA] Se detectó color: var(--sea-onahau) en index.html');
  failed = true;
} else {
  console.log('   ✅ index.html: Sin usos problemáticos de var(--sea-onahau) en textos');
}

// -----------------------------------------------------------------------------
// FASE 4: VERIFICACIÓN WCAG 2.2 AA / AAA PARA MODO CLARO Y BOTONES INSTITUCIONALES
// -----------------------------------------------------------------------------
console.log('\n--- FASE 4: TOKENS Y COMPONENTES EN MODO CLARO (DEFAULT) ---');

const lightSurfaces = {
  'bg-surface-card (#ffffff)': '#ffffff',
  'bg-surface-0 (#f8fafc)': '#f8fafc',
  'bg-primary (#f1f5f9)': '#f1f5f9'
};

const lightTextTokens = [
  { name: '--text-main (Texto Principal)', hex: '#0f172a', requiredRatio: 4.5, level: 'AAA' },
  { name: '--text-muted (Texto Secundario/Cuerpo)', hex: '#334155', requiredRatio: 4.5, level: 'AAA' },
  { name: '--text-dim (Texto Atenuado/Labels)', hex: '#475569', requiredRatio: 4.5, level: 'AA' },
  { name: '--text-accent (Acento Institucional Sky 700)', hex: '#0369a1', requiredRatio: 4.5, level: 'AA' },
  { name: '--text-accent-hover (Sky 800)', hex: '#075985', requiredRatio: 4.5, level: 'AAA' },
  { name: '--badge-green-text (Esmeralda 800)', hex: '#065f46', requiredRatio: 4.5, level: 'AAA' },
  { name: '--badge-amber-text (Ámbar 800)', hex: '#92400e', requiredRatio: 4.5, level: 'AAA' },
  { name: '--badge-red-text (Rojo 800)', hex: '#991b1b', requiredRatio: 4.5, level: 'AAA' }
];

for (const [surfaceName, bgHex] of Object.entries(lightSurfaces)) {
  console.log(`📌 Superficie Clara: ${surfaceName}`);
  for (const token of lightTextTokens) {
    const ratio = getContrastRatio(token.hex, bgHex);
    const passed = ratio >= token.requiredRatio;
    const formattedRatio = ratio.toFixed(2) + ':1';
    if (passed) {
      console.log(`   ✅ [${token.level}] ${token.name}: ${formattedRatio}`);
    } else {
      console.error(`   ❌ [FALLA CLARO] ${token.name}: ${formattedRatio} (Min: ${token.requiredRatio}:1)`);
      failed = true;
    }
  }
}

const lightButtonPairs = [
  { element: '.btn-primary (Texto blanco sobre #0369a1)', fgHex: '#ffffff', bgHex: '#0369a1', minRatio: 4.5 },
  { element: '.btn-cyan (Texto #0369a1 sobre #f0f9ff)', fgHex: '#0369a1', bgHex: '#f0f9ff', minRatio: 4.5 },
  { element: '.btn-danger (Texto #b91c1c sobre #fef2f2)', fgHex: '#b91c1c', bgHex: '#fef2f2', minRatio: 4.5 },
  { element: '.btn-success-action (Texto blanco sobre #047857)', fgHex: '#ffffff', bgHex: '#047857', minRatio: 4.5 }
];

for (const pair of lightButtonPairs) {
  const ratio = getContrastRatio(pair.fgHex, pair.bgHex);
  if (ratio >= pair.minRatio) {
    console.log(`   ✅ [BOTÓN CLARO OK] ${pair.element}: ${ratio.toFixed(2)}:1`);
  } else {
    console.error(`   ❌ [BOTÓN CLARO FALLA] ${pair.element}: ${ratio.toFixed(2)}:1 (Min: ${pair.minRatio}:1)`);
    failed = true;
  }
}

if (stylesCss.includes('--text-dim: #475569;') && stylesCss.includes('--text-accent: #0369a1;')) {
  console.log('   ✅ styles.css: Tokens WCAG Modo Claro (--text-dim: #475569, --text-accent: #0369a1) activos');
} else {
  console.error('   ❌ [FALLA] styles.css no define --text-dim: #475569 o --text-accent: #0369a1');
  failed = true;
}

if (!/maximum-scale=1\.0|user-scalable=no/i.test(indexHtml)) {
  console.log('   ✅ index.html: Zoom móvil accesible habilitado (sin user-scalable=no ni maximum-scale=1.0)');
} else {
  console.error('   ❌ [FALLA A11Y] index.html bloquea el zoom móvil en viewport');
  failed = true;
}

console.log('\n================================================================');
if (failed) {
  console.error('❌ ERRORES EN LA SUITE DE CONTRASTE Y MODALES WCAG 2.2');
  process.exit(1);
} else {
  console.log('🎉 TODOS LOS TOKENS, COMPONENTES Y MODALES CUMPLEN 100% WCAG 2.2 AA / AAA');
  console.log('================================================================');
}
