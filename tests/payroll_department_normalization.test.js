// tests/payroll_department_normalization.test.js
// Suite de pruebas para normalización canónica de departamentos y detección de discrepancias tipográficas en nómina

const assert = require('assert');
const { db } = require('../backend/db');
const { 
  canonicalizeDepartmentName, 
  sanitizeDepartmentDisplayName,
  handleBatchImport 
} = require('../backend/controllers/payroll.controller');

console.log('================================================================');
console.log('🧪 SUITE: NORMALIZACIÓN CANÓNICA DE DEPARTAMENTOS Y CONTROL DISCREPANCIAS');
console.log('================================================================');

// 1. Pruebas Unitarias de Funciones Canónicas
console.log('Test 1: Saneamiento y Canonicidad de Nombres');
const testCases = [
  {
    raw: 'OFICINA DE TECNOLOGIAS DE LA INFORMACION° Y LA COMUNICACION',
    canonical: 'OFICINA DE TECNOLOGIAS DE LA INFORMACION Y LA COMUNICACION',
    sanitized: 'OFICINA DE TECNOLOGIAS DE LA INFORMACION Y LA COMUNICACION'
  },
  {
    raw: 'DIRECCIÓN° GENERAL DE TRANSMISIONES',
    canonical: 'DIRECCION GENERAL DE TRANSMISIONES',
    sanitized: 'DIRECCIÓN GENERAL DE TRANSMISIONES'
  },
  {
    raw: 'OFICINA DE SEGURIDAD Y PROTECCIÓN° INTEGRAL',
    canonical: 'OFICINA DE SEGURIDAD Y PROTECCION INTEGRAL',
    sanitized: 'OFICINA DE SEGURIDAD Y PROTECCIÓN INTEGRAL'
  },
  {
    raw: 'DIRECCIÓN  DE CREATIVO',
    canonical: 'DIRECCION DE CREATIVO',
    sanitized: 'DIRECCIÓN DE CREATIVO'
  }
];

for (const tc of testCases) {
  const cResult = canonicalizeDepartmentName(tc.raw);
  assert.strictEqual(cResult, tc.canonical, `Canonical mismatch for "${tc.raw}"`);
  const sResult = sanitizeDepartmentDisplayName(tc.raw);
  assert.strictEqual(sResult, tc.sanitized, `Sanitize mismatch for "${tc.raw}"`);
  assert(!sResult.includes('°'), `Sanitized name should not contain ° symbol`);
}
console.log('  ✅ 1. Funciones de normalización purgan símbolos parásitos (°), acentos y dobles espacios correctamente.');

// 2. Simulación de Ingesta Masiva con Discrepancia Tipográfica de Departamento
console.log('Test 2: Detección y Advertencia de Discrepancia en Batch Import');

// Obtener departamento OTIC canónico en DB
const canonicalOtic = db.prepare("SELECT id, name FROM departments WHERE id = '253d9c31-f670-4301-aea5-60a04857cc3b'").get();
assert(canonicalOtic, 'El departamento canónico OTIC debe existir en DB');

const mockReq = {
  body: {
    batch_id: 'test_batch_discrepancy_' + Date.now(),
    source: 'test_suite',
    workers: [
      {
        document_id: 'V-99887766',
        full_name: 'Test Funcionario Con Grado OTIC',
        email: 'test.otic.grado@mippci.gob.ve',
        department_name: 'OFICINA DE TECNOLOGIAS DE LA INFORMACION° Y LA COMUNICACION', // con ° parásito
        shift: 'jornada_continua'
      }
    ]
  }
};

let capturedResponse = null;
const mockRes = {
  status: (code) => ({
    json: (data) => {
      capturedResponse = { code, data };
      return capturedResponse;
    }
  }),
  json: (data) => {
    capturedResponse = { code: 200, data };
    return capturedResponse;
  }
};

handleBatchImport(mockReq, mockRes);

assert(capturedResponse, 'Debe haber respondido a la petición');
assert.strictEqual(capturedResponse.code, 200, 'Debe responder HTTP 200');
assert(capturedResponse.data.success, 'Debe ser exitoso');

// Verificar advertencias generadas
assert(capturedResponse.data.department_warnings, 'Debe incluir department_warnings');
assert(capturedResponse.data.department_warnings.length > 0, 'Debe advertir al menos 1 discrepancia tipográfica');

const warning = capturedResponse.data.department_warnings[0];
assert.strictEqual(warning.raw_department, 'OFICINA DE TECNOLOGIAS DE LA INFORMACION° Y LA COMUNICACION');
assert.strictEqual(warning.resolved_department, canonicalOtic.name);
console.log(`  ✅ 2. Advertencia detectada y emitida: "${warning.message}"`);

// 3. Verificar que el trabajador fue asignado al departamento canónico y no a un duplicado
const importedWorker = db.prepare("SELECT department_id FROM workers WHERE document_id = 'V-99887766'").get();
assert(importedWorker, 'El trabajador debe haberse insertado');
assert.strictEqual(importedWorker.department_id, canonicalOtic.id, 'El trabajador debe estar asignado a la OTIC canónica');

// Verificar que no se creó ningún departamento nuevo con el símbolo °
const badDept = db.prepare("SELECT id FROM departments WHERE name LIKE '%INFORMACION°%'").get();
assert(!badDept, 'No debe crearse ningún departamento con el símbolo ° en la base de datos');
console.log('  ✅ 3. El trabajador fue asignado al ID canónico existente sin crear departamento fantasma con °.');

// Limpieza del trabajador de prueba
db.prepare("DELETE FROM workers WHERE document_id = 'V-99887766'").run();

console.log('================================================================');
console.log('🎉 TODAS LAS PRUEBAS DE NORMALIZACIÓN DEPARTAMENTAL PASARON AL 100%');
console.log('================================================================');
