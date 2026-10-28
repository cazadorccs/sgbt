// scripts/seed_jornadas_historico.js
// Configura los 4 combos institucionales, la jornada histórica simulada del 23/10/2026
// y la jornada programada del 27/11/2026 con soporte de histórico de jornadas.

const crypto = require('crypto');
const { db } = require('../backend/db');

console.log('--- INICIANDO CONFIGURACIÓN DE COMBOS Y JORNADAS ---');

// 1. Garantizar tabla campaign_combos
db.exec(`
  CREATE TABLE IF NOT EXISTS campaign_combos (
    campaign_id TEXT NOT NULL REFERENCES delivery_campaigns(id) ON DELETE CASCADE,
    combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (campaign_id, combo_id)
  );
  CREATE INDEX IF NOT EXISTS idx_campaign_combos_camp ON campaign_combos(campaign_id);
`);
console.log('✓ Tabla campaign_combos verificada.');

// 2. Definir los cuatro combos requeridos
const combosData = [
  {
    id: 'c1a2b3c4-1111-2222-3333-444455556666',
    name: 'Combo de Víveres Secos (Canasta Básica)',
    description: '12 rubros esenciales de alimentación de la canasta básica familiar',
    category: 'bolsa_viveres',
    calories: 12000,
    dietary_info: 'Canasta Básica / Almacén Seco',
    is_active: 1,
    items_detail: '4 kg Harina de Maíz Precocida, 2 kg Arroz Blanco, 2 kg Pasta Larga, 1 Lt Aceite Vegetal, 1 kg Azúcar, 1 kg Granos Negros (Caraotas), 2 Latas de Sardinas en Aceite',
    icon: '🌾',
    mesa_number: 1,
    mesa_name: 'Mesa 1 - Víveres Secos',
    conservation: 'Ambiente',
    target_qty: '1',
    weight_kg: 14.5,
    stock: 5000
  },
  {
    id: '3df50537-3333-4fce-8bdc-f4ecbb567adf',
    name: 'Combo de Higiene Personal',
    description: 'Kit de artículos esenciales de higiene y aseo personal',
    category: 'combo_higienico',
    calories: 0,
    dietary_info: 'Higiene y Cuidado Personal',
    is_active: 1,
    items_detail: '4 artículos esenciales: 4 Jabones de Tocador, 1 Crema Dental (100ml), 1 Champú Familiar (400ml), 4 Rollos de Papel Higiénico',
    icon: '🧼',
    mesa_number: 2,
    mesa_name: 'Mesa 2 - Higiene y Aseo Personal',
    conservation: 'Ambiente',
    target_qty: '1',
    weight_kg: 5.2,
    stock: 5000
  },
  {
    id: '2e39c4a5-0611-4a03-b10c-08ef7e270684',
    name: 'Combo de Limpieza',
    description: 'Kit de artículos de limpieza y desinfección institucional y del hogar',
    category: 'combo_limpieza',
    calories: 0,
    dietary_info: 'Limpieza y Desinfección',
    is_active: 1,
    items_detail: 'Artículos de limpieza: 1 Detergente en Polvo (1kg), 1 Jabón Lavaplatos en Crema (500g), 1 Desinfectante Multiuso (1 Lt), 1 Cloro Concentrado (1 Lt)',
    icon: '🧹',
    mesa_number: 3,
    mesa_name: 'Mesa 3 - Artículos de Limpieza',
    conservation: 'Ambiente',
    target_qty: '1',
    weight_kg: 5.2,
    stock: 5000
  },
  {
    id: 'c1a2b3c4-1111-2222-3333-444455557777',
    name: 'Combo de Charcutería',
    description: 'Surtido de embutidos, charcutería y lácteos bajo estricta cadena de frío',
    category: 'combo_proteico',
    calories: 6500,
    dietary_info: 'Proteína y Charcutería Fresca',
    is_active: 1,
    items_detail: 'Cadena de frío: 1 Pieza Queso Blanco Semiduro (1.2 kg), 1 Jamón de Espalda Cocido (1.0 kg), 1 Mortadela Especial (1.0 kg), 1 Paquete de Salchichas (500g)',
    icon: '🧀',
    mesa_number: 4,
    mesa_name: 'Mesa 4 - Charcutería y Refrigerados',
    conservation: 'Refrigerado (Cadena de Frío)',
    target_qty: '1',
    weight_kg: 3.7,
    stock: 5000
  }
];

const upsertCombo = db.prepare(`
  INSERT INTO combos (
    id, name, description, category, calories, dietary_info, is_active,
    items_detail, icon, mesa_number, mesa_name, conservation, target_qty, weight_kg, stock
  ) VALUES (
    @id, @name, @description, @category, @calories, @dietary_info, @is_active,
    @items_detail, @icon, @mesa_number, @mesa_name, @conservation, @target_qty, @weight_kg, @stock
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    calories = excluded.calories,
    dietary_info = excluded.dietary_info,
    is_active = excluded.is_active,
    items_detail = excluded.items_detail,
    icon = excluded.icon,
    mesa_number = excluded.mesa_number,
    mesa_name = excluded.mesa_name,
    conservation = excluded.conservation,
    target_qty = excluded.target_qty,
    weight_kg = excluded.weight_kg,
    stock = excluded.stock
`);

for (const combo of combosData) {
  upsertCombo.run(combo);
  console.log(`✓ Combo asegurado: ${combo.name} (${combo.category})`);
}

// 3. Obtener sede de despacho principal
const firstPoint = db.prepare("SELECT id FROM distribution_points WHERE location_code = 'ALM-MIPPCI' LIMIT 1").get()
  || db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
const distributionPointId = firstPoint ? firstPoint.id : 'b12f492f-ebb3-430f-bc20-26ca4aa5b865';

// 4. JORNADA HISTÓRICA: 23/10/2026 (FINALIZADA - ENTREGA 100% COMPLETA)
const histCampId = 'camp_20261023_historica';
const histCampName = 'Jornada Integral de Despacho Institucional - Octubre 2026';
const histDesc = 'Jornada efectuada el pasado viernes 23/10/2026. Despacho completo y simultáneo de los 4 combos institucionales (Víveres, Higiene, Limpieza y Charcutería) para la totalidad del personal.';

db.prepare(`
  INSERT INTO delivery_campaigns (
    id, name, description, start_date, end_date, combo_id, target_group, distribution_point_id, status, notification_sent
  ) VALUES (?, ?, ?, '2026-10-23', '2026-10-23', ?, 'all', ?, 'finalizada', 1)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    combo_id = excluded.combo_id,
    target_group = excluded.target_group,
    distribution_point_id = excluded.distribution_point_id,
    status = 'finalizada',
    notification_sent = 1
`).run(histCampId, histCampName, histDesc, combosData[0].id, distributionPointId);

// Vincular los 4 combos a la jornada histórica
for (const combo of combosData) {
  db.prepare(`
    INSERT OR IGNORE INTO campaign_combos (campaign_id, combo_id)
    VALUES (?, ?)
  `).run(histCampId, combo.id);
}
console.log('✓ Jornada histórica 23/10/2026 registrada y vinculada a 4 combos.');

// 5. JORNADA PROGRAMADA: 27/11/2026 (PROGRAMADA - PRÓXIMO VIERNES 27 DE NOVIEMBRE)
const proxCampId = 'camp_20261127_programada';
const proxCampName = 'Jornada Integral de Despacho Institucional - Noviembre 2026';
const proxDesc = 'Programación de despacho conjunto de los 4 combos institucionales (Víveres, Higiene, Limpieza y Charcutería) para el viernes 27 de noviembre de 2026.';

db.prepare(`
  INSERT INTO delivery_campaigns (
    id, name, description, start_date, end_date, combo_id, target_group, distribution_point_id, status, notification_sent
  ) VALUES (?, ?, ?, '2026-11-27', '2026-11-27', ?, 'all', ?, 'programada', 0)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    combo_id = excluded.combo_id,
    target_group = excluded.target_group,
    distribution_point_id = excluded.distribution_point_id,
    status = 'programada'
`).run(proxCampId, proxCampName, proxDesc, combosData[0].id, distributionPointId);

// Vincular los 4 combos a la jornada programada
for (const combo of combosData) {
  db.prepare(`
    INSERT OR IGNORE INTO campaign_combos (campaign_id, combo_id)
    VALUES (?, ?)
  `).run(proxCampId, combo.id);
}
console.log('✓ Jornada próxima 27/11/2026 programada y vinculada a 4 combos.');

// 6. SIMULAR ENTREGA COMPLETA PARA EL 23/10/2026
// Obtener todos los trabajadores activos
const activeWorkers = db.prepare("SELECT id, document_id, full_name, department_id FROM workers WHERE status = 'active'").all();
console.log(`Procesando simulación para ${activeWorkers.length} trabajadores activos...`);

const supervisor = db.prepare("SELECT id FROM workers WHERE role IN ('admin', 'supervisor') LIMIT 1").get()
  || db.prepare("SELECT id FROM workers LIMIT 1").get();
const supervisorId = supervisor ? supervisor.id : activeWorkers[0].id;

const simulateDeliveryTx = db.transaction(() => {
  const insertEntitlement = db.prepare(`
    INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status, campaign_id)
    VALUES (?, ?, ?, '2026-10-23', 'jornada_continua', 'claimed', ?)
    ON CONFLICT(worker_id, valid_date, combo_id) DO UPDATE SET
      status = 'claimed',
      campaign_id = excluded.campaign_id
  `);

  const getEntitlement = db.prepare(`
    SELECT id FROM daily_entitlements
    WHERE worker_id = ? AND valid_date = '2026-10-23' AND combo_id = ?
  `);

  const insertDelivery = db.prepare(`
    INSERT OR IGNORE INTO deliveries (
      id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
      verification_method, signature_proof, challenge_nonce, delivered_at, synced_at, campaign_id
    ) VALUES (?, ?, ?, ?, ?, 'passkey_qr', ?, ?, ?, ?, ?)
  `);

  // También preparar asignaciones pendientes para la jornada del 27/11/2026
  const insertProxEntitlement = db.prepare(`
    INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status, campaign_id)
    VALUES (?, ?, ?, '2026-11-27', 'jornada_continua', 'pending', ?)
    ON CONFLICT(worker_id, valid_date, combo_id) DO UPDATE SET
      campaign_id = excluded.campaign_id
  `);

  let simulatedCount = 0;
  let proxCount = 0;

  for (let i = 0; i < activeWorkers.length; i++) {
    const worker = activeWorkers[i];

    // Horas de entrega distribuidas entre las 08:30 y las 16:30 del 23/10/2026
    const minuteOffset = Math.floor((i / activeWorkers.length) * 480); // 480 minutos = 8 horas
    const hour = 8 + Math.floor((30 + minuteOffset) / 60);
    const minute = (30 + minuteOffset) % 60;
    const timeStr = `2026-10-23T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:15.000Z`;

    for (const combo of combosData) {
      // 1. Entitlement 23/10
      const entId = crypto.randomUUID();
      insertEntitlement.run(entId, worker.id, combo.id, histCampId);
      const currentEnt = getEntitlement.get(worker.id, combo.id);
      const validEntId = currentEnt ? currentEnt.id : entId;

      // 2. Delivery 23/10
      const delId = crypto.randomUUID();
      const mockNonce = crypto.randomBytes(16).toString('hex');
      const mockSig = Buffer.from(`MOCK_SIG_${worker.id}_${combo.id}_20261023`).toString('base64');
      insertDelivery.run(
        delId,
        validEntId,
        worker.id,
        distributionPointId,
        supervisorId,
        mockSig,
        mockNonce,
        timeStr,
        '2026-10-23 18:00:00',
        histCampId
      );
      simulatedCount++;

      // 3. Entitlement 27/11 (pending)
      insertProxEntitlement.run(crypto.randomUUID(), worker.id, combo.id, proxCampId);
      proxCount++;
    }
  }

  return { simulatedCount, proxCount };
});

const result = simulateDeliveryTx();
console.log(`✓ Entrega 100% completa simulada el 23/10/2026: ${result.simulatedCount} entregas registradas.`);
console.log(`✓ Asignaciones para jornada 27/11/2026 preparadas: ${result.proxCount} cuotas pendientes.`);

// 7. REGISTRAR ACTA MINISTERIAL OFICIAL DE CIERRE PARA EL 23/10/2026
const totalWorkers = activeWorkers.length;
const totalCombosDelivered = totalWorkers * 4;
const totalTons = Number(((totalWorkers * (14.5 + 5.2 + 5.2 + 3.7)) / 1000).toFixed(2));
const actaId = crypto.randomUUID();
const actaNumber = 'ACTA-20261023-MIPPCI-001';
const actaHash = crypto.createHash('sha256').update(`ACTA_20261023_${totalWorkers}_${totalCombosDelivered}_${totalTons}`).digest('hex');

const actaDataJson = JSON.stringify({
  jornada_id: histCampId,
  jornada_name: histCampName,
  fecha_despacho: '2026-10-23',
  sede: 'Almacén Central - Sede Principal MIPPCI',
  total_beneficiarios_convocados: totalWorkers,
  total_beneficiarios_atendidos: totalWorkers,
  porcentaje_asistencia: '100.0%',
  total_combos_despachados: totalCombosDelivered,
  toneladas_metricas_brutas: totalTons,
  desglose_combos: [
    { combo: 'Combo de Víveres Secos (Canasta Básica)', entregados: totalWorkers, peso_unitario_kg: 14.5 },
    { combo: 'Combo de Higiene Personal', entregados: totalWorkers, peso_unitario_kg: 5.2 },
    { combo: 'Combo de Limpieza', entregados: totalWorkers, peso_unitario_kg: 5.2 },
    { combo: 'Combo de Charcutería', entregados: totalWorkers, peso_unitario_kg: 3.7 }
  ],
  estado_conciliacion: 'Cerrada y Conciliada al 100%',
  firma_digital_sha256: actaHash
});

db.prepare(`
  INSERT INTO ministerial_actas (
    id, acta_number, acta_type, title, institution, campaign_date, census_cutoff_date,
    total_workers_census, total_formalized, total_rezagados, formalization_pct,
    total_combos_assigned, total_gross_weight_tons, passkey_adoption_pct,
    security_incidents_blocked, digital_acta_hash, digital_acta_data, generated_by
  ) VALUES (
    ?, ?, 'cierre_censo_y_despacho',
    'Acta de Cierre y Conciliación Oficial de Despacho - Jornada 23/10/2026',
    'Ministerio del Poder Popular para la Comunicación y la Información',
    '2026-10-23', '2026-10-23',
    ?, ?, 0, 100.0,
    ?, ?, 100.0,
    0, ?, ?, ?
  )
  ON CONFLICT(acta_number) DO UPDATE SET
    total_workers_census = excluded.total_workers_census,
    total_formalized = excluded.total_formalized,
    total_combos_assigned = excluded.total_combos_assigned,
    total_gross_weight_tons = excluded.total_gross_weight_tons,
    digital_acta_hash = excluded.digital_acta_hash,
    digital_acta_data = excluded.digital_acta_data
`).run(
  actaId,
  actaNumber,
  totalWorkers,
  totalWorkers,
  totalCombosDelivered,
  totalTons,
  actaHash,
  actaDataJson,
  supervisorId
);

console.log(`✓ Acta Ministerial Oficial ${actaNumber} registrada con hash ${actaHash.substring(0, 16)}...`);
console.log('--- FINALIZADO EXITOSAMENTE ---');
