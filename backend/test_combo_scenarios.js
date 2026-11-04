// backend/test_combo_scenarios.js
// Simulación exhaustiva de todos los escenarios de suspensión, activación y vinculación de combos

const assert = require('assert');
const { db } = require('./db');
const { getCampaigns, updateCampaignStatus, syncCampaignsToCloud } = require('./controllers/campaigns.controller');

async function runSimulation() {
  console.log('\n================================================================');
  console.log('🧪 INICIANDO SIMULACIÓN DE ESCENARIOS DE JORNADAS Y COMBOS');
  console.log('================================================================\n');

  // Esperar brevemente para permitir que la hidratación inicial de Supabase concluya
  await new Promise(r => setTimeout(r, 1200));

  const campA_Id = '51f3c32c-3b68-40f6-97ed-37f7c8e9441b'; // Gran Jornada Integral
  const campB_Id = 'faa028eb-97ef-4137-8120-0b0c580d657f'; // Gran Entrega de Pan de Queso

  // Simular mock de request y response
  function createMockReqRes(params = {}, body = {}, query = {}) {
    let statusCode = 200;
    let jsonResult = null;
    return {
      req: { params, body, query, user: { id: 'admin', full_name: 'Director TI', role: 'admin' }, ip: '127.0.0.1' },
      res: {
        status: (code) => { statusCode = code; return { json: (d) => { jsonResult = d; } }; },
        json: (d) => { jsonResult = d; }
      },
      getResult: () => ({ statusCode, jsonResult })
    };
  }

  // --- ESCENARIO 1: Activar Campaña A (Víveres y Proteína) ---
  console.log('🔹 ESCENARIO 1: Activar Campaña A (Víveres y Charcutería)');
  {
    const { req, res, getResult } = createMockReqRes({ id: campA_Id }, { status: 'en_curso' });
    await updateCampaignStatus(req, res);
    const { statusCode, jsonResult } = getResult();
    assert.strictEqual(statusCode, 200, 'Status code debe ser 200');
    assert.strictEqual(jsonResult.status, 'en_curso', 'Campaña A debe quedar en_curso');

    const campA = db.prepare('SELECT status FROM delivery_campaigns WHERE id = ?').get(campA_Id);
    const campB = db.prepare('SELECT status FROM delivery_campaigns WHERE id = ?').get(campB_Id);
    assert.strictEqual(campA.status, 'en_curso', 'Campaña A debe estar en_curso en DB');
    assert.strictEqual(campB.status, 'suspendida', 'Campaña B debe estar suspendida en DB');

    // Verificar combos devueltos para jornada activa
    const activeCamp = db.prepare("SELECT id, combo_id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campCombos = db.prepare(`
      SELECT cb.name FROM campaign_combos cc
      JOIN combos cb ON cc.combo_id = cb.id
      WHERE cc.campaign_id = ? AND cb.is_active = 1
    `).all(activeCamp.id);
    console.log('   ✅ Campaña A activa con combos:', campCombos.map(c => c.name));
    assert(campCombos.length >= 1, 'Campaña A debe tener combos vinculados');
  }

  // --- ESCENARIO 2: Suspender Campaña A ---
  console.log('\n🔹 ESCENARIO 2: Suspender Campaña A (Pausar entregas)');
  {
    const { req, res, getResult } = createMockReqRes({ id: campA_Id }, { status: 'suspendida' });
    await updateCampaignStatus(req, res);
    const { statusCode, jsonResult } = getResult();
    assert.strictEqual(statusCode, 200, 'Status code debe ser 200');
    assert.strictEqual(jsonResult.status, 'suspendida', 'Campaña A debe quedar suspendida');

    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    assert.strictEqual(activeCamp, undefined, 'No debe haber ninguna campaña en_curso');
    console.log('   ✅ Campaña A suspendida con éxito. Ninguna campaña activa en curso.');
  }

  // --- ESCENARIO 3: Activar Campaña B ("Gran Entrega de Pan de Queso") ---
  console.log('\n🔹 ESCENARIO 3: Activar Campaña B (Pan de Queso) y verificar exclusividad');
  {
    const { req, res, getResult } = createMockReqRes({ id: campB_Id }, { status: 'en_curso' });
    await updateCampaignStatus(req, res);
    const { statusCode, jsonResult } = getResult();
    assert.strictEqual(statusCode, 200, 'Status code debe ser 200');
    assert.strictEqual(jsonResult.status, 'en_curso', 'Campaña B debe quedar en_curso');

    const campA = db.prepare('SELECT status FROM delivery_campaigns WHERE id = ?').get(campA_Id);
    const campB = db.prepare('SELECT status FROM delivery_campaigns WHERE id = ?').get(campB_Id);
    assert.strictEqual(campB.status, 'en_curso', 'Campaña B debe estar en_curso');
    assert.strictEqual(campA.status, 'suspendida', 'Campaña A debe permanecer suspendida');

    // Verificar que el combo asignado a la jornada activa sea Pan de Queso
    const activeCamp = db.prepare("SELECT id, combo_id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campCombos = db.prepare(`
      SELECT cb.name FROM campaign_combos cc
      JOIN combos cb ON cc.combo_id = cb.id
      WHERE cc.campaign_id = ? AND cb.is_active = 1
    `).all(activeCamp.id);
    console.log('   ✅ Campaña B activa con combos:', campCombos.map(c => c.name));
    assert(campCombos.some(c => c.name.includes('Pan de Queso')), 'El combo de Campaña B debe ser Pan de Queso');
  }

  // --- ESCENARIO 4: Intentar activar Campaña A nuevamente (Auto-suspensión de B) ---
  console.log('\n🔹 ESCENARIO 4: Reactivar Campaña A y verificar auto-suspensión automática de B');
  {
    const { req, res, getResult } = createMockReqRes({ id: campA_Id }, { status: 'en_curso' });
    await updateCampaignStatus(req, res);
    const { statusCode, jsonResult } = getResult();
    assert.strictEqual(statusCode, 200, 'Status code debe ser 200');
    assert.strictEqual(jsonResult.status, 'en_curso');
    assert(jsonResult.suspended_others.length > 0, 'Debe reportar que auto-suspendió a Campaña B');

    const campA = db.prepare('SELECT status FROM delivery_campaigns WHERE id = ?').get(campA_Id);
    const campB = db.prepare('SELECT status FROM delivery_campaigns WHERE id = ?').get(campB_Id);
    assert.strictEqual(campA.status, 'en_curso', 'Campaña A debe quedar en_curso');
    assert.strictEqual(campB.status, 'suspendida', 'Campaña B debe quedar suspendida');
    console.log('   ✅ Campaña B fue suspendida automáticamente. Campaña A es la única activa.');
  }

  // --- ESCENARIO 5: Reactivar Campaña B para dejarla en el estado solicitado por el usuario ---
  console.log('\n🔹 ESCENARIO 5: Activar Campaña B (Pan de Queso) para operación solicitada');
  {
    const { req, res, getResult } = createMockReqRes({ id: campB_Id }, { status: 'en_curso' });
    await updateCampaignStatus(req, res);
    const { jsonResult } = getResult();
    console.log('   ✅', jsonResult.message);
  }

  console.log('\n================================================================');
  console.log('🎉 TODOS LOS ESCENARIOS SIMULADOS Y VERIFICADOS AL 100%');
  console.log('================================================================\n');
}

runSimulation().then(() => process.exit(0)).catch(err => {
  console.error('❌ Error en simulación:', err);
  process.exit(1);
});
