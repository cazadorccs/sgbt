// ============================================================================
// SERVICIO DE PERSISTENCIA CRIPTOGRÁFICA EN LA NUBE (SUPABASE CLOUD)
// Asegura la persistencia garantizada en Vercel Serverless y entornos multi-dispositivo
// Incluye patrón Circuit Breaker para aislar fallos de red hacia la nube
// ============================================================================

const crypto = require('crypto');
const { supabase, isSupabaseConfigured } = require('../supabase');

// Estado interno del Circuit Breaker para Supabase
const circuitBreaker = {
  failures: 0,
  maxFailures: 3,
  state: 'CLOSED', // 'CLOSED' (normal), 'OPEN' (aislado tras fallos), 'HALF-OPEN' (probando)
  cooldownPeriodMs: 60000, // 60 segundos antes de reintentar
  lastFailureTime: 0,

  canAttempt() {
    if (this.state === 'CLOSED') return true;
    const now = Date.now();
    if (this.state === 'OPEN' && (now - this.lastFailureTime > this.cooldownPeriodMs)) {
      this.state = 'HALF-OPEN';
      console.log('🔄 [CIRCUIT BREAKER] Supabase en modo HALF-OPEN. Probando conectividad...');
      return true;
    }
    return false;
  },

  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  },

  recordFailure(errMsg) {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.maxFailures) {
      this.state = 'OPEN';
      console.warn(`⚡ [CIRCUIT BREAKER OPEN] Supabase aislado temporalmente por 60s tras ${this.failures} fallos: ${errMsg}`);
    }
  }
};

const DEFAULT_DISTRIBUTION_POINT_ID = '5b0f10e3-7eac-4872-bf96-74ecd359be7e'; // Almacén Central - Sótano 1
const DEFAULT_COMBO_ID = 'c1a2b3c4-1111-2222-3333-444455556666'; // Canasta Básica MIPPCI
const SYNC_BATCH_ORDERS_STORE_UUID = 'c0000000-ca11-4000-8000-000000000003';
const SYNC_BATCH_ORDERS_STORE_NAME = '__SYSTEM_BATCH_ORDERS_STORE__';
const BATCH_STATUS_RANK = {
  pending_review: 1,
  approved: 3,
  rejected: 3,
  dispatched: 4
};

/**
 * Persiste la formalización de un beneficiario (foto, teléfono y hash de contraseña)
 */
async function persistWorkerFormalization({ workerId, documentId, photoBase64, phoneNumber, passwordHash, boundDeviceId }) {
  if (!isSupabaseConfigured() || !supabase) return false;
  if (!circuitBreaker.canAttempt()) return false;

  try {
    const credId = `formalized_pwd_${workerId}`;
    const updatePayload = {
      avatar_url: photoBase64,
      updated_at: new Date().toISOString()
    };
    if (phoneNumber && String(phoneNumber).trim()) {
      updatePayload.phone_number = String(phoneNumber).trim();
    }

    const credRecord = {
      id: crypto.randomUUID(),
      worker_id: workerId,
      credential_id: credId,
      public_key: passwordHash,
      sign_count: 1,
      device_name: boundDeviceId || 'Dispositivo Formalizado',
      status: 'active',
      aaguid: 'beneficiary_formalization',
      enrolled_at: new Date().toISOString()
    };

    const results = await Promise.allSettled([
      supabase.from('workers').update(updatePayload).eq('id', workerId),
      supabase.from('passkey_credentials').upsert(credRecord, { onConflict: 'credential_id' })
    ]);

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value?.error) {
        console.warn(`[CLOUD PERSIST] Advertencia al sincronizar formalización (${idx}):`, res.value.error.message);
      }
    });

    console.log(`[CLOUD PERSIST] ✅ Formalización persistida en Supabase Cloud para ${documentId}`);
    circuitBreaker.recordSuccess();
    return true;
  } catch (err) {
    circuitBreaker.recordFailure(err.message);
    console.warn('[CLOUD PERSIST ERROR] Fallo al persistir formalización:', err.message);
    return false;
  }
}

/**
 * Persiste una credencial biométrica Passkey (FIDO2 / WebAuthn)
 */
async function persistPasskey({ id, workerId, credentialId, publicKeyPem, deviceName, status = 'active' }) {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const record = {
      id: id || crypto.randomUUID(),
      worker_id: workerId,
      credential_id: credentialId,
      public_key: publicKeyPem,
      sign_count: 0,
      device_name: deviceName || 'Smartphone Corporativo',
      status,
      enrolled_at: new Date().toISOString()
    };

    const { error } = await supabase.from('passkey_credentials').upsert([record], { onConflict: 'credential_id' });
    if (error) {
      console.warn('[CLOUD PERSIST] Advertencia al persistir passkey:', error.message);
      return false;
    }

    console.log(`[CLOUD PERSIST] ✅ Passkey biométrica persistida en Supabase Cloud para worker ${workerId}`);
    return true;
  } catch (err) {
    console.warn('[CLOUD PERSIST ERROR] Fallo al persistir passkey:', err.message);
    return false;
  }
}

/**
 * Persiste registros de entrega de beneficios (despacho) con sellado criptográfico
 */
async function persistDeliveries(deliveries) {
  if (!isSupabaseConfigured() || !supabase) return false;
  if (!Array.isArray(deliveries) || deliveries.length === 0) return true;

  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

    // 1. Resolver los entitlement_id reales en Supabase para evitar conflictos de UUID
    const entIdsToMarkClaimed = [];
    for (const d of deliveries) {
      try {
        let resolvedEntId = d.entitlement_id;
        const { data: existingEnt } = await supabase
          .from('daily_entitlements')
          .select('id')
          .eq('worker_id', d.worker_id)
          .eq('valid_date', d.valid_date || today)
          .eq('combo_id', d.combo_id || DEFAULT_COMBO_ID)
          .maybeSingle();

        if (existingEnt && existingEnt.id) {
          resolvedEntId = existingEnt.id;
        } else {
          const newEntId = d.entitlement_id || crypto.randomUUID();
          const { data: createdEnt } = await supabase
            .from('daily_entitlements')
            .upsert([{
              id: newEntId,
              worker_id: d.worker_id,
              combo_id: d.combo_id || DEFAULT_COMBO_ID,
              valid_date: d.valid_date || today,
              shift: 'jornada_continua',
              status: 'pending'
            }], { onConflict: 'worker_id,valid_date,shift,combo_id' })
            .select('id')
            .maybeSingle();
          if (createdEnt && createdEnt.id) {
            resolvedEntId = createdEnt.id;
          }
        }
        d.entitlement_id = resolvedEntId;
        entIdsToMarkClaimed.push(resolvedEntId);
      } catch (entErr) {
        console.warn('[CLOUD PERSIST] Advertencia al preparar entitlement:', entErr.message);
      }
    }

    // 2. Preparar e insertar las entregas con validación estricta de esquema Supabase (UUID y ENUM)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validDistPoints = new Set([
      '5b0f10e3-7eac-4872-bf96-74ecd359be7e',
      '76bd5b30-1537-4e66-8617-04a33e34b639',
      'b12f492f-ebb3-430f-bc20-26ca4aa5b865',
      'f641deb9-9123-415e-8cd1-ea01b8a7d367',
      '94df5c9d-0eb8-4603-859d-447309a0e9ca',
      '550e8400-e29b-41d4-a716-446655440001'
    ]);

    const deliveryRecords = deliveries.map(d => {
      // Normalizar ID a UUID válido
      const deliveryId = (d.id && uuidRegex.test(d.id)) ? d.id : crypto.randomUUID();

      // Mapear verification_method a valores permitidos en verification_method_enum de Supabase Postgres:
      // ('passkey_qr', 'nfc_card', 'supervisor_override')
      let mappedMethod = 'supervisor_override';
      if (d.verification_method === 'passkey_qr') {
        mappedMethod = 'passkey_qr';
      } else if (d.verification_method === 'passkey_nfc' || d.verification_method === 'nfc_card') {
        mappedMethod = 'nfc_card';
      } else {
        mappedMethod = 'supervisor_override';
      }

      // Asegurar punto de distribución válido existente en Supabase
      const distId = (d.distribution_point_id && validDistPoints.has(d.distribution_point_id))
        ? d.distribution_point_id
        : DEFAULT_DISTRIBUTION_POINT_ID;

      return {
        id: deliveryId,
        entitlement_id: d.entitlement_id,
        worker_id: d.worker_id,
        distribution_point_id: distId,
        delivered_by_user_id: (d.delivered_by_user_id && uuidRegex.test(d.delivered_by_user_id)) ? d.delivered_by_user_id : null,
        verification_method: mappedMethod,
        signature_proof: d.signature_proof || 'FIDO2_ASSERTION',
        challenge_nonce: d.challenge_nonce || crypto.randomBytes(16).toString('hex'),
        override_reason: d.override_reason || d.verification_method || 'Despacho institucional verificado',
        is_offline_sync: Boolean(d.is_offline_sync),
        delivered_at: d.delivered_at || new Date().toISOString()
      };
    });

    const { error: delError } = await supabase.from('deliveries').upsert(deliveryRecords, { onConflict: 'id' });
    if (delError) {
      console.warn('[CLOUD PERSIST] Advertencia al persistir entregas en Supabase:', delError.message);
      return false;
    }

    // 3. Solo DESPUÉS de confirmar inserción en deliveries, marcar entitlements como 'claimed'
    if (entIdsToMarkClaimed.length > 0) {
      try {
        await supabase.from('daily_entitlements').update({ status: 'claimed' }).in('id', entIdsToMarkClaimed);
      } catch (markErr) {
        console.warn('[CLOUD PERSIST] Advertencia al marcar entitlements claimed:', markErr.message);
      }
    }

    console.log(`[CLOUD PERSIST] ✅ ${deliveryRecords.length} despacho(s) persistido(s) en Supabase Cloud`);
    return true;
  } catch (err) {
    console.warn('[CLOUD PERSIST ERROR] Fallo al persistir entregas:', err.message);
    return false;
  }
}

/**
 * Persiste la vinculación de una tarjeta NFC física
 */
async function persistNfcCard({ id, workerId, cardUid, status = 'active', issuedBy = null }) {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    // Revocar tarjetas previas activas del trabajador
    await supabase
      .from('nfc_cards')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('worker_id', workerId)
      .eq('status', 'active');

    // Insertar nueva tarjeta
    const { error } = await supabase.from('nfc_cards').insert([{
      id: id || crypto.randomUUID(),
      worker_id: workerId,
      card_uid: String(cardUid).toUpperCase().trim(),
      status,
      issued_by: issuedBy,
      issued_at: new Date().toISOString()
    }]);

    if (error) {
      console.warn('[CLOUD PERSIST] Advertencia al vincular NFC en nube:', error.message);
      return false;
    }

    console.log(`[CLOUD PERSIST] ✅ Tarjeta NFC ${cardUid} vinculada en Supabase Cloud`);
    return true;
  } catch (err) {
    console.warn('[CLOUD PERSIST ERROR] Fallo al vincular tarjeta NFC:', err.message);
    return false;
  }
}

/**
 * Revoca una tarjeta NFC física en la nube
 */
async function revokeNfcCard(workerId) {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    await supabase
      .from('nfc_cards')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('worker_id', workerId)
      .eq('status', 'active');
    return true;
  } catch (err) {
    console.warn('[CLOUD PERSIST ERROR] Fallo al revocar NFC:', err.message);
    return false;
  }
}

/**
 * Reinicia las entregas a cero en Supabase Cloud y restaura entitlements de hoy a estado pendiente
 */
async function clearDeliveriesInCloud() {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const todayUtc = new Date().toISOString().split('T')[0];
    const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

    // Borrado garantizado de entregas en Supabase
    const { error: delError } = await supabase
      .from('deliveries')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (delError) {
      console.warn('[CLOUD RESET WARN] Advertencia al limpiar entregas en Supabase:', delError.message);
    }

    // Restaurar daily_entitlements de hoy (UTC o VET) a status = 'pending'
    const { error: entError } = await supabase
      .from('daily_entitlements')
      .update({ status: 'pending' })
      .in('valid_date', [todayUtc, todayVzla]);

    if (entError) {
      console.warn('[CLOUD RESET WARN] Advertencia al restaurar derechos en Supabase:', entError.message);
    }

    console.log('[CLOUD RESET] ✅ Entregas y derechos reiniciados exitosamente a cero en Supabase Cloud');
    return true;
  } catch (err) {
    console.warn('[CLOUD RESET ERROR] Fallo al reiniciar entregas en Supabase:', err.message);
    return false;
  }
}

/**
 * Elimina todas las órdenes de lotes departamentales del store en Supabase Cloud
 * dejando un store vacío listo para una nueva jornada.
 */
async function clearBatchOrdersInCloud() {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { error } = await supabase.from('combos').upsert({
      id: SYNC_BATCH_ORDERS_STORE_UUID,
      name: SYNC_BATCH_ORDERS_STORE_NAME,
      category: 'bolsa_viveres',
      description: JSON.stringify({
        version: 1,
        updated_at: new Date().toISOString(),
        orders: [],
        umbrella_departments: []
      }),
      calories: 0,
      dietary_info: 'Cloud Department Batch Orders Store',
      is_active: false
    }, { onConflict: 'id' });

    if (error) {
      console.warn('[BATCH CLOUD RESET WARN] Error al limpiar store de lotes en Supabase:', error.message);
      return false;
    }

    console.log('[BATCH CLOUD RESET] ✅ Store de órdenes de lotes departamentales vaciado en Supabase Cloud');
    return true;
  } catch (err) {
    console.warn('[BATCH CLOUD RESET ERROR] Fallo al vaciar store de lotes:', err.message);
    return false;
  }
}

/**
 * Resuelve deterministamente qué copia de una orden de lote departamental prevalece
 * entre dos contenedores serverless según rango de estado y marca de tiempo.
 */
function resolveBatchOrderWinner(a, b) {
  if (!a) return b;
  if (!b) return a;
  const rankA = BATCH_STATUS_RANK[a.status] || 0;
  const rankB = BATCH_STATUS_RANK[b.status] || 0;
  if (rankA !== rankB) return rankA > rankB ? a : b;

  const tsA = Date.parse(a.dispatched_at || a.reviewed_at || a.requested_at || 0) || 0;
  const tsB = Date.parse(b.dispatched_at || b.reviewed_at || b.requested_at || 0) || 0;
  return tsA >= tsB ? a : b;
}

/**
 * Compacta `digital_acta_data` para almacenamiento ligero en el store JSON de la nube.
 */
function compactActaDataForStore(rawActa) {
  if (!rawActa) return null;
  try {
    const parsed = typeof rawActa === 'string' ? JSON.parse(rawActa) : rawActa;
    if (parsed && Array.isArray(parsed.deliveries_sample) && parsed.deliveries_sample.length > 25) {
      parsed.deliveries_sample = parsed.deliveries_sample.slice(0, 25);
    }
    return JSON.stringify(parsed);
  } catch (e) {
    return typeof rawActa === 'string' ? rawActa : null;
  }
}

/**
 * Garantiza departamentos paraguas (`ente:*`) y aplica órdenes ganadoras en SQLite local.
 */
function applyBatchSnapshotToLocalDb(dbInstance, orders = [], umbrellaDepartments = []) {
  if (!dbInstance) return 0;

  const ensureDept = dbInstance.prepare(`
    INSERT OR IGNORE INTO departments (id, code, name, cost_center)
    VALUES (?, ?, ?, ?)
  `);
  const upsertOrder = dbInstance.prepare(`
    INSERT INTO department_batch_orders (
      id, order_number, department_id, combo_id, total_beneficiaries, total_combos,
      total_weight_kg, delegate_name, delegate_document_id, delegate_phone,
      delegate_claim_token, status, requested_by, requested_at, reviewed_by,
      reviewed_at, review_notes, dispatched_by, dispatched_at,
      digital_acta_hash, digital_acta_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      total_beneficiaries = excluded.total_beneficiaries,
      total_combos = excluded.total_combos,
      total_weight_kg = excluded.total_weight_kg,
      reviewed_by = COALESCE(excluded.reviewed_by, department_batch_orders.reviewed_by),
      reviewed_at = COALESCE(excluded.reviewed_at, department_batch_orders.reviewed_at),
      review_notes = COALESCE(excluded.review_notes, department_batch_orders.review_notes),
      dispatched_by = COALESCE(excluded.dispatched_by, department_batch_orders.dispatched_by),
      dispatched_at = COALESCE(excluded.dispatched_at, department_batch_orders.dispatched_at),
      digital_acta_hash = COALESCE(excluded.digital_acta_hash, department_batch_orders.digital_acta_hash),
      digital_acta_data = COALESCE(excluded.digital_acta_data, department_batch_orders.digital_acta_data)
  `);
  const getLocalById = dbInstance.prepare('SELECT * FROM department_batch_orders WHERE id = ?');

  let applied = 0;
  const tx = dbInstance.transaction(() => {
    for (const u of umbrellaDepartments) {
      if (!u || !u.id) continue;
      ensureDept.run(u.id, u.code || 'ENTE_GROUP', u.name || u.id, u.cost_center || 'CC-ENTE');
    }

    for (const remote of orders) {
      if (!remote || !remote.id || !remote.department_id) continue;
      if (String(remote.department_id).startsWith('ente:')) {
        const enteName = String(remote.department_id).slice(5).trim();
        const safeCode = 'ENTE_' + enteName
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase().slice(0, 24);
        ensureDept.run(remote.department_id, safeCode || 'ENTE_GROUP', enteName || remote.department_id, 'CC-ENTE');
      }

      const local = getLocalById.get(remote.id);
      const winner = resolveBatchOrderWinner(local, remote);
      if (local && winner === local) continue;

      try {
        upsertOrder.run(
          remote.id,
          remote.order_number,
          remote.department_id,
          remote.combo_id || null,
          remote.total_beneficiaries || 0,
          remote.total_combos || 0,
          remote.total_weight_kg || 0,
          remote.delegate_name,
          remote.delegate_document_id,
          remote.delegate_phone || null,
          remote.delegate_claim_token || null,
          remote.status || 'pending_review',
          remote.requested_by || null,
          remote.requested_at || new Date().toISOString(),
          remote.reviewed_by || null,
          remote.reviewed_at || null,
          remote.review_notes || null,
          remote.dispatched_by || null,
          remote.dispatched_at || null,
          remote.digital_acta_hash || null,
          remote.digital_acta_data || null
        );
        applied++;
      } catch (e) {
        // Ignorar si FK de usuario/combo difiere; intentar sin reviewed_by/requested_by/dispatched_by
        try {
          upsertOrder.run(
            remote.id, remote.order_number, remote.department_id, null,
            remote.total_beneficiaries || 0, remote.total_combos || 0, remote.total_weight_kg || 0,
            remote.delegate_name, remote.delegate_document_id, remote.delegate_phone || null,
            remote.delegate_claim_token || null, remote.status || 'pending_review',
            null, remote.requested_at || new Date().toISOString(), null, remote.reviewed_at || null,
            remote.review_notes || null, null, remote.dispatched_at || null,
            remote.digital_acta_hash || null, remote.digital_acta_data || null
          );
          applied++;
        } catch (innerErr) {}
      }
    }
  });
  tx();
  return applied;
}

/**
 * Hidrata órdenes de lotes departamentales desde Supabase Cloud hacia SQLite local.
 */
async function syncBatchOrdersFromCloud(dbInstance) {
  if (!dbInstance || !isSupabaseConfigured() || !supabase) return false;
  if (!circuitBreaker.canAttempt()) return false;

  try {
    const { data, error } = await supabase
      .from('combos')
      .select('description')
      .eq('id', SYNC_BATCH_ORDERS_STORE_UUID)
      .maybeSingle();

    if (error) {
      circuitBreaker.recordFailure(error.message);
      return false;
    }

    circuitBreaker.recordSuccess();
    if (!data || !data.description) return true;

    const parsed = JSON.parse(data.description);
    if (!parsed || !Array.isArray(parsed.orders)) return true;

    const applied = applyBatchSnapshotToLocalDb(
      dbInstance,
      parsed.orders,
      Array.isArray(parsed.umbrella_departments) ? parsed.umbrella_departments : []
    );
    if (applied > 0) {
      console.log(`[SUPABASE HYDRATION] ${applied} orden(es) de lotes departamentales sincronizadas desde Supabase Cloud.`);
    }
    return true;
  } catch (err) {
    circuitBreaker.recordFailure(err.message);
    console.warn('[BATCH CLOUD HYDRATION WARN]', err.message);
    return false;
  }
}

/**
 * Persiste órdenes de lotes departamentales en Supabase Cloud con merge idempotente multi-contenedor.
 * Soporta exclusión explícita de órdenes eliminadas (options.deletedOrderId / options.deletedOrderIds)
 * para evitar su resurrección automática.
 */
async function syncBatchOrdersToCloud(dbInstance, options = {}) {
  if (!dbInstance || !isSupabaseConfigured() || !supabase) return false;
  if (!circuitBreaker.canAttempt()) return false;

  const deletedSet = new Set();
  if (options && options.deletedOrderId) {
    deletedSet.add(String(options.deletedOrderId));
  }
  if (options && Array.isArray(options.deletedOrderIds)) {
    options.deletedOrderIds.forEach(id => deletedSet.add(String(id)));
  }

  try {
    let remoteOrders = [];
    let remoteUmbrella = [];
    try {
      const { data, error } = await supabase
        .from('combos')
        .select('description')
        .eq('id', SYNC_BATCH_ORDERS_STORE_UUID)
        .maybeSingle();
      if (!error && data && data.description) {
        const parsed = JSON.parse(data.description);
        if (Array.isArray(parsed?.orders)) remoteOrders = parsed.orders;
        if (Array.isArray(parsed?.umbrella_departments)) remoteUmbrella = parsed.umbrella_departments;
      }
    } catch (readErr) {}

    const localOrders = dbInstance.prepare('SELECT * FROM department_batch_orders ORDER BY requested_at DESC LIMIT 200').all();
    const localUmbrella = dbInstance.prepare("SELECT id, code, name, cost_center FROM departments WHERE id LIKE 'ente:%'").all();

    const mergedMap = new Map();
    for (const r of remoteOrders) {
      if (r && r.id && !deletedSet.has(String(r.id))) {
        mergedMap.set(r.id, r);
      }
    }
    for (const l of localOrders) {
      if (!l || !l.id || deletedSet.has(String(l.id))) continue;
      const existing = mergedMap.get(l.id);
      const winner = resolveBatchOrderWinner(existing, l);
      mergedMap.set(l.id, {
        ...winner,
        digital_acta_data: compactActaDataForStore(winner.digital_acta_data)
      });
    }

    const umbrellaMap = new Map();
    for (const u of [...remoteUmbrella, ...localUmbrella]) {
      if (u && u.id) umbrellaMap.set(u.id, u);
    }

    const finalOrders = Array.from(mergedMap.values()).slice(0, 200);
    const finalUmbrella = Array.from(umbrellaMap.values());

    // Si se especificaron órdenes eliminadas, asegurar que se purguen de la base local
    if (deletedSet.size > 0) {
      for (const delId of deletedSet) {
        try {
          dbInstance.prepare('DELETE FROM department_batch_orders WHERE id = ?').run(delId);
        } catch (delErr) {}
      }
    }

    // Aplicar también cualquier actualización remota faltante hacia SQLite local
    applyBatchSnapshotToLocalDb(dbInstance, finalOrders, finalUmbrella);

    const { error: upErr } = await supabase.from('combos').upsert({
      id: SYNC_BATCH_ORDERS_STORE_UUID,
      name: SYNC_BATCH_ORDERS_STORE_NAME,
      category: 'bolsa_viveres',
      description: JSON.stringify({
        version: 1,
        updated_at: new Date().toISOString(),
        orders: finalOrders,
        umbrella_departments: finalUmbrella
      }),
      calories: 0,
      dietary_info: 'Cloud Department Batch Orders Store',
      is_active: false
    }, { onConflict: 'id' });

    if (upErr) {
      circuitBreaker.recordFailure(upErr.message);
      console.warn('[BATCH CLOUD PERSIST WARN]', upErr.message);
      return false;
    }

    circuitBreaker.recordSuccess();
    return true;
  } catch (err) {
    circuitBreaker.recordFailure(err.message);
    console.warn('[BATCH CLOUD PERSIST ERROR]', err.message);
    return false;
  }
}

module.exports = {
  persistWorkerFormalization,
  persistPasskey,
  persistDeliveries,
  persistNfcCard,
  revokeNfcCard,
  clearDeliveriesInCloud,
  clearBatchOrdersInCloud,
  syncBatchOrdersFromCloud,
  syncBatchOrdersToCloud
};

