// scripts/simulate_100_scans.js
// Script CLI para simular el escaneo y despacho de las primeras 100 cédulas activas del MIPPCI

const crypto = require('crypto');
const { db } = require('../backend/db');

async function runCliSimulation() {
  console.log('\n================================================================');
  console.log('📱 SIMULACIÓN AUTOMATIZADA: 100 ENTREGAS (BENEFICIARIO -> MESA)');
  console.log('================================================================\n');

  const workers = db.prepare(`
    SELECT w.id, w.document_id, w.full_name, COALESCE(d.name, 'Nómina Central') as dept
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE w.status = 'active' AND w.document_id NOT IN ('V-00000000', '00000000', '')
    ORDER BY w.document_id ASC
    LIMIT 100
  `).all();

  console.log(`📋 Total beneficiarios en lote: ${workers.length}`);
  const combo = db.prepare("SELECT id, name, weight_kg FROM combos WHERE is_active = 1 LIMIT 1").get() || {
    id: 'c1a2b3c4-1111-2222-3333-444455556666',
    name: 'Bolsa de Víveres Secos (Canasta Básica MIPPCI)',
    weight_kg: 14.5
  };

  const supervisor = db.prepare("SELECT id FROM workers WHERE role IN ('admin', 'supervisor') LIMIT 1").get() || workers[0];
  const point = db.prepare("SELECT id FROM distribution_points WHERE is_active = 1 LIMIT 1").get();
  const pointId = point ? point.id : 'b12f492f-ebb3-430f-bc20-26ca4aa5b865';

  const todayUtc = new Date().toISOString().split('T')[0];
  const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

  let processed = 0;
  let totalWeight = 0;
  const startTime = Date.now();

  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    const nowIso = new Date().toISOString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const delId = crypto.randomUUID();
    const sigProof = crypto.createHash('sha256')
      .update(`${delId}:${w.document_id}:${combo.id}:${nowIso}:${nonce}`)
      .digest('hex');

    // Buscar o crear entitlement
    let ent = db.prepare(`
      SELECT id FROM daily_entitlements 
      WHERE worker_id = ? AND valid_date IN (?, ?) AND combo_id = ?
    `).get(w.id, todayUtc, todayVzla, combo.id);

    if (!ent) {
      const entId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status, distribution_point_id)
        VALUES (?, ?, ?, ?, 'jornada_continua', 'claimed', ?)
      `).run(entId, w.id, combo.id, todayVzla, pointId);
      ent = { id: entId };
    } else {
      db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?").run(ent.id);
    }

    // Insertar despacho
    db.prepare(`
      INSERT OR IGNORE INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at, override_reason
      ) VALUES (?, ?, ?, ?, ?, 'passkey_qr', ?, ?, 0, ?, 'Simulador CLI Automatizado (100 Lote)')
    `).run(delId, ent.id, w.id, pointId, supervisor.id, sigProof, nonce, nowIso);

    processed++;
    totalWeight += Number(combo.weight_kg);

    const progressPct = Math.round((processed / workers.length) * 100);
    const bar = '█'.repeat(Math.floor(progressPct / 5)) + '░'.repeat(20 - Math.floor(progressPct / 5));
    process.stdout.write(`\r[${bar}] ${progressPct}% | #${processed} C.I. ${w.document_id} (${w.full_name.substring(0, 24)})`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n\n================================================================');
  console.log(`✅ LOTE DE 100 ENTREGAS COMPLETADO EXITOSAMENTE`);
  console.log(`⏱️ Tiempo total    : ${durationSec}s (promedio: ${(durationSec / 100 * 1000).toFixed(1)}ms / entrega)`);
  console.log(`📦 Combos entregados: ${processed} unidades`);
  console.log(`⚖️ Tonelaje total   : ${totalWeight.toFixed(2)} kg (${(totalWeight / 1000).toFixed(3)} toneladas)`);
  console.log('================================================================\n');
}

runCliSimulation().then(() => process.exit(0)).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
