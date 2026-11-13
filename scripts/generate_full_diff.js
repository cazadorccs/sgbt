const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { db } = require(path.join(__dirname, '../backend/db'));

// 1. Read LISTADO DEF.csv
const csvRaw = fs.readFileSync(path.join(__dirname, '../LISTADO DEF.csv'), 'utf8');
const lines = csvRaw.split('\n').filter(l => l.trim().length > 0);

const csvRecords = [];
const csvByDoc = new Map();

for (let i = 1; i < lines.length; i++) {
  const p = lines[i].split(';');
  const nro = (p[0] || '').trim();
  const tipo = (p[1] || '').trim();
  const ced = (p[2] || '').trim().replace(/[^0-9]/g, '');
  const nombre = (p[3] || '').trim();
  const fechaIngreso = (p[4] || '').trim();
  const unidad = (p[5] || '').trim();
  const cargo = (p[6] || '').trim();

  if (ced) {
    const item = { nro, tipo, ced, nombre, fechaIngreso, unidad, cargo };
    csvRecords.push(item);
    csvByDoc.set(ced, item);
  }
}

// 2. Read bd.xlsx
const wb = xlsx.readFile(path.join(__dirname, '../bd.xlsx'));
const bdData = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const bdByDoc = new Map();
for (const r of bdData) {
  const ced = String(r['CEDULA'] || r['cedula'] || '').trim().replace(/[^0-9]/g, '');
  if (ced) {
    bdByDoc.set(ced, {
      ced,
      nombre: (r['NOMBRES Y APELLIDOS'] || '').trim(),
      unidad: (r['UNIDAD DE ADSCRIPCIÓN'] || '').trim(),
      cargo: (r['CARGO'] || '').trim(),
      fechaIngreso: r['FECHA DE INGRESO'] || ''
    });
  }
}

// 3. Read current DB
const dbWorkers = db.prepare('SELECT id, document_id, full_name, department_id, worker_type, role, status FROM workers').all();
const dbByDoc = new Map();
for (const w of dbWorkers) {
  const ced = w.document_id.replace(/[^0-9]/g, '');
  dbByDoc.set(ced, w);
}

// 4. Calculations
// A. In bd.xlsx but NOT in LISTADO DEF.csv (64 workers)
const removedFromOldPayroll = [];
for (const [ced, r] of bdByDoc.entries()) {
  if (!csvByDoc.has(ced)) {
    removedFromOldPayroll.push(r);
  }
}

// B. In LISTADO DEF.csv but NOT in bd.xlsx (21 workers)
const addedInNewPayroll = [];
for (const [ced, r] of csvByDoc.entries()) {
  if (!bdByDoc.has(ced)) {
    addedInNewPayroll.push(r);
  }
}

// C. In DB but NOT in LISTADO DEF.csv (79 workers: 64 from bd.xlsx + 15 demo/seed)
const inDbNotCsv = [];
for (const [ced, w] of dbByDoc.entries()) {
  if (!csvByDoc.has(ced)) {
    inDbNotCsv.push(w);
  }
}

console.log('=== RESUMEN EJECUTIVO DE DIFERENCIAS ===');
console.log('1. Total registros en LISTADO DEF.csv (NUEVA DATA DEFINITIVA):', csvRecords.length);
console.log('2. Total registros en bd.xlsx (NÓMINA ANTERIOR):', bdByDoc.size);
console.log('3. Coinciden en ambos listados:', csvRecords.length - addedInNewPayroll.length);
console.log('4. Nuevos ingresos en LISTADO DEF (incorporados):', addedInNewPayroll.length);
console.log('5. Desincorporados de nómina anterior (salieron en LISTADO DEF):', removedFromOldPayroll.length);
console.log('6. Registros en DB actual que no están en LISTADO DEF:', inDbNotCsv.length);

console.log('\n--- DETALLE DE LOS 21 NUEVOS INGRESOS (LISTADO DEF) ---');
addedInNewPayroll.forEach((r, idx) => {
  console.log(`${idx + 1}. C.I. V-${r.ced} | ${r.nombre} | ${r.tipo} | ${r.unidad}`);
});

console.log('\n--- DETALLE DE LOS DESINCORPORADOS (PRIMEROS 20 DE 64) ---');
removedFromOldPayroll.slice(0, 20).forEach((r, idx) => {
  console.log(`${idx + 1}. C.I. V-${r.ced} | ${r.nombre} | ${r.unidad}`);
});

// Guardar reporte completo en JSON para el análisis
fs.writeFileSync(
  path.join(__dirname, 'padron_diff_report.json'),
  JSON.stringify({
    resumen: {
      totalDefinitivo: csvRecords.length,
      totalNominaAnterior: bdByDoc.size,
      coincidentes: csvRecords.length - addedInNewPayroll.length,
      nuevosIngresos: addedInNewPayroll.length,
      desincorporados: removedFromOldPayroll.length,
      sobrantesEnDbActual: inDbNotCsv.length
    },
    nuevosIngresos: addedInNewPayroll,
    desincorporadosNominaAnterior: removedFromOldPayroll,
    sobrantesEnDbActual: inDbNotCsv
  }, null, 2)
);
console.log('\nReporte completo guardado en scripts/padron_diff_report.json');

