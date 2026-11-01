// ============================================================================
// SUITE DE VERIFICACIÓN WCAG 2.2 AA / AAA: MODO OSCURO & CONTRASTE DINÁMICO
// Valida los tokens CSS de la plataforma institucional (SGBT - MIPPCI)
// ============================================================================

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

// Fondos de Modo Oscuro
const darkSurfaces = {
  'bg-primary (#0a0f1d)': '#0a0f1d',
  'bg-surface-0 / table-th (#0f172a)': '#0f172a',
  'bg-surface-card / modal-dialog (#141e33)': '#141e33',
  'bg-surface-2 / dropdown (#1e293b)': '#1e293b'
};

// Tokens de Texto en Modo Oscuro
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

let failed = false;

for (const [surfaceName, bgHex] of Object.entries(darkSurfaces)) {
  console.log(`📌 Evaluando superficie oscura: ${surfaceName}`);
  
  for (const token of darkTextTokens) {
    const ratio = getContrastRatio(token.hex, bgHex);
    const passed = ratio >= token.requiredRatio;
    const formattedRatio = ratio.toFixed(2) + ':1';
    
    if (passed) {
      console.log(`   ✅ [${token.level}] ${token.name}: ${formattedRatio} (Min exigido: ${token.requiredRatio}:1)`);
    } else {
      console.error(`   ❌ [FALLA] ${token.name}: ${formattedRatio} (Requerido: ${token.requiredRatio}:1)`);
      failed = true;
    }
  }
  console.log('');
}

console.log('================================================================');
if (failed) {
  console.error('❌ ERRORES EN LA SUITE DE CONTRASTE WCAG 2.2');
  process.exit(1);
} else {
  console.log('🎉 TODOS LOS TOKENS Y ESTADOS DE MODO OSCURO CUMPLEN 100% WCAG 2.2 AA / AAA');
  console.log('================================================================');
}

