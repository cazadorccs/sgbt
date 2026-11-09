// scripts/activate_jornada_27nov.js
// Planifica y activa la Gran Jornada Integral del 27 de Noviembre con 4 combos institucionales

const crypto = require('crypto');
const { db } = require('../backend/db');
const { syncCampaignsToCloud } = require('../backend/controllers/campaigns.controller');

async function main() {
  console.log('--- ACTUALIZANDO JORNADA 27 DE NOVIEMBRE 2026 CON 4 COMBOS ---');

  const campId = 'camp_20261127_programada';
  const pointId = 'b12f492f-ebb3-430f-bc20-26ca4aa5b865';
  const comboIds = [
    'c1a2b3c4-1111-2222-3333-444455556666',
    'c1a2b3c4-1111-2222-3333-444455557777',
    '3df50537-3333-4fce-8bdc-f4ecbb567adf',
    '2e39c4a5-0611-4a03-b10c-08ef7e270684'
  ];

  // 1. Finalizar la jornada previa de octubre
  db.prepare("UPDATE delivery_campaigns SET status = 'finalizada' WHERE id = 'camp_20261023_integral'").run();

  // 2. Actualizar la jornada del 27 de Noviembre a EN_CURSO con los 4 combos
  db.prepare(`
    INSERT INTO delivery_campaigns (
      id, name, description, start_date, end_date, combo_id, target_group, distribution_point_id, status, notification_sent, created_at
    ) VALUES (
      ?,
      'Gran Jornada Integral de Despacho Institucional (4 Combos) - 27 de Noviembre 2026',
      'Despacho integral con los 4 combos institucionales (Bolsa de Víveres Secos, Combo Charcutería, Combo de Higiene Personal y Combo de Limpieza) para todo el personal del MIPPCI.',
      '2026-11-27',
      '2026-11-27',
      ?,
      'all',
      ?,
      'en_curso',
      1,
      '2026-11-05 08:00:00'
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      combo_id = excluded.combo_id,
      target_group = excluded.target_group,
      distribution_point_id = excluded.distribution_point_id,
      status = 'en_curso',
      notification_sent = 1
  `).run(campId, comboIds[0], pointId);

  // 3. Vincular los 4 combos a la campaña en campaign_combos
  for (const cId of comboIds) {
    db.prepare(`
      INSERT INTO campaign_combos (campaign_id, combo_id, distribution_point_id)
      VALUES (?, ?, ?)
      ON CONFLICT(campaign_id, combo_id) DO UPDATE SET
        distribution_point_id = excluded.distribution_point_id
    `).run(campId, cId, pointId);
  }

  // 4. Asegurar asignaciones de los 4 combos para todos los trabajadores activos
  const workers = db.prepare("SELECT id FROM workers WHERE status = 'active'").all();
  console.log(`Trabajadores activos encontrados: ${workers.length}`);

  const todayStr = new Date().toISOString().split('T')[0];

  const insEnt = db.prepare(`
    INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status, campaign_id, distribution_point_id)
    VALUES (?, ?, ?, ?, 'jornada_continua', 'pending', ?, ?)
  `);

  let count27 = 0;
  let countToday = 0;

  for (const w of workers) {
    for (const cId of comboIds) {
      insEnt.run(crypto.randomUUID(), w.id, cId, '2026-11-27', campId, pointId);
      count27++;
      insEnt.run(crypto.randomUUID(), w.id, cId, todayStr, campId, pointId);
      countToday++;
    }
  }
  console.log(`Asignaciones 27/11 generadas/aseguradas: ${count27}`);
  console.log(`Asignaciones fecha actual (${todayStr}) generadas/aseguradas: ${countToday}`);

  // 5. Notificación institucional
  db.prepare(`
    INSERT INTO system_notifications (id, campaign_id, title, message, target_group, notification_type, created_at)
    VALUES (
      ?,
      ?,
      'Gran Jornada Integral 27 de Noviembre Activa (4 Combos)',
      'Se informa a todo el personal del MIPPCI que se encuentra activa y planificada la Gran Jornada de Despacho Integral para el viernes 27 de noviembre de 2026 con 4 combos simultáneos: Víveres Secos, Charcutería, Higiene Personal y Limpieza.',
      'all',
      'jornada',
      CURRENT_TIMESTAMP
    )
  `).run(crypto.randomUUID(), campId);

  // 6. Sincronizar hacia Supabase Cloud
  await syncCampaignsToCloud();
  console.log('✓ Sincronización a Supabase Cloud completada.');
}

main().then(() => {
  console.log('✅ Jornada del 27 de Noviembre activada con 4 combos exitosamente.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error en activación de jornada:', err);
  process.exit(1);
});
