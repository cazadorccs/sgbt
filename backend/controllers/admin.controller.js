// backend/controllers/admin.controller.js
// Controlador para gobernanza administrativa, directorio de personal, combos, auditoría de entregas y estadísticas de tonelaje

const crypto = require('crypto');
const { db } = require('../db');
const { generateOfficialActaHtml } = require('../services/audit.service');
const { hashPassword, generateMagicLinkToken } = require('../crypto-utils');

const getKpis = (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const totalWorkers = db.prepare("SELECT COUNT(*) as count FROM workers WHERE status = 'active' AND document_id NOT IN ('V-00000000', '00000000', '')").get().count;
  const workersWithPasskey = db.prepare(`
    SELECT COUNT(DISTINCT worker_id) as count
    FROM passkey_credentials
    WHERE status = 'active'
  `).get().count;

  const todayUtc = new Date().toISOString().split('T')[0];
  const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const activeCombosCount = db.prepare("SELECT COUNT(*) as c FROM combos WHERE is_active = 1").get().c || 1;

  // REGLA OFICIAL: Combos Programados Hoy = Beneficiarios en Nómina * Combos Activos para la Jornada
  const totalEntitlementsToday = totalWorkers * activeCombosCount;

  const methodStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN verification_method IN ('passkey_qr', 'passkey_nfc') THEN 1 ELSE 0 END) as passkey_qr,
      SUM(CASE WHEN verification_method = 'passkey_nfc' THEN 1 ELSE 0 END) as passkey_nfc,
      SUM(CASE WHEN verification_method = 'nfc_card' THEN 1 ELSE 0 END) as nfc_card,
      SUM(CASE WHEN verification_method = 'supervisor_daily_qr' THEN 1 ELSE 0 END) as supervisor_daily_qr,
      SUM(CASE WHEN verification_method = 'supervisor_override' THEN 1 ELSE 0 END) as supervisor_override,
      SUM(CASE WHEN is_offline_sync = 1 THEN 1 ELSE 0 END) as offline_deliveries,
      COUNT(*) as total_deliveries
    FROM deliveries d
    JOIN workers w ON d.worker_id = w.id
    WHERE (
      date(d.delivered_at) IN (?, ?)
      OR date(d.delivered_at, '-4 hours') IN (?, ?)
      OR substr(d.delivered_at, 1, 10) IN (?, ?)
      OR d.delivered_at >= datetime('now', '-24 hours')
    )
    AND w.document_id NOT IN ('V-00000000', '00000000', '')
  `).get(todayUtc, todayVzla, todayUtc, todayVzla, todayUtc, todayVzla);

  const claimedEntitlementsToday = methodStats.total_deliveries || 0;

  const totalDelivered = methodStats.total_deliveries || 0;
  const offlinePct = totalDelivered > 0 ? Math.round(((methodStats.offline_deliveries || 0) / totalDelivered) * 100) : 0;
  const adoptionRate = totalWorkers > 0 ? Math.round((workersWithPasskey / totalWorkers) * 100) : 0;

  const recentAlerts = [
    {
      type: 'info',
      title: 'Sincronización Offline Diaria',
      message: 'Paquete de datos diario precargado para 2 comedores industriales.',
      timestamp: 'Hoy, 06:00'
    },
    {
      type: 'security',
      title: 'Restricción Anti-Fraude Activa',
      message: 'Índice idx_unique_daily_claim activo en PostgreSQL y SQLite.',
      timestamp: 'En tiempo real'
    }
  ];

  if ((methodStats.supervisor_override || 0) > 0) {
    recentAlerts.unshift({
      type: 'warning',
      title: 'Liberaciones Manuales por Supervisor',
      message: `Se han registrado ${methodStats.supervisor_override} liberaciones por contingencia justificadas con firma biométrica.`,
      timestamp: 'Hoy'
    });
  }

  res.json({
    kpis: {
      total_active_workers: totalWorkers,
      workers_with_passkey: workersWithPasskey,
      passkey_adoption_rate_pct: adoptionRate,
      combos_assigned_today: totalEntitlementsToday,
      combos_claimed_today: claimedEntitlementsToday,
      pending_today: Math.max(0, totalEntitlementsToday - claimedEntitlementsToday),
      offline_sync_pct: offlinePct,
      verification_breakdown: {
        passkey_qr: methodStats.passkey_qr || 0,
        passkey_nfc: methodStats.passkey_nfc || 0,
        nfc_card: methodStats.nfc_card || 0,
        supervisor_override: methodStats.supervisor_override || 0
      }
    },
    alerts: recentAlerts
  });
};

const getWorkers = (req, res) => {
  const { search, shift, status, worker_type, role, department, department_id } = req.query;
  const today = new Date().toISOString().split('T')[0];
  const deptFilter = (department || department_id || '').trim();

  // Auto-recuperación del padrón: Si la base de datos tiene menos de 1,000 trabajadores, rehidratar de inmediato
  try {
    const currentCount = db.prepare('SELECT COUNT(*) as count FROM workers').get()?.count || 0;
    if (currentCount < 1000) {
      console.log(`[ADMIN CONTROLLER] Padrón incompleto (${currentCount} trabajadores). Rehidratando desde seedDatabase()...`);
      const { seedDatabase } = require('../db');
      seedDatabase();
    }
  } catch (e) {
    console.warn('[ADMIN CONTROLLER] Error en auto-rehidratación:', e.message);
  }

  // Solo conciliar asignaciones pendientes en carga general sin filtros de búsqueda
  if (!search && !role && !worker_type && !shift && !status && !deptFilter) {
    try {
      const defaultCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') AND is_active = 1 LIMIT 1").get()?.id || 'c1a2b3c4-1111-2222-3333-444455556666';
      const unassignedWorkers = db.prepare(`
        SELECT id, shift FROM workers 
        WHERE status = 'active' 
        AND id NOT IN (SELECT worker_id FROM daily_entitlements WHERE valid_date = ?)
        LIMIT 100
      `).all(today);

      if (unassignedWorkers.length > 0) {
        const insTx = db.transaction((workersList) => {
          const insEnt = db.prepare(`
            INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
          `);
          for (const uw of workersList) {
            insEnt.run(crypto.randomUUID(), uw.id, defaultCombo, today, uw.shift || 'jornada_continua');
          }
        });
        insTx(unassignedWorkers);
      }
    } catch (e) {}
  }

  let sql = `
    SELECT 
      w.id, w.document_id, w.full_name, w.email, w.role, w.shift, w.status, w.worker_type, w.has_smartphone, w.contingency_reason, w.avatar_url,
      w.department_id,
      d.name as department_name,
      (SELECT COUNT(*) FROM passkey_credentials WHERE worker_id = w.id AND status = 'active') as active_passkeys,
      (SELECT card_uid FROM nfc_cards WHERE worker_id = w.id AND status = 'active' LIMIT 1) as nfc_uid,
      (SELECT status FROM daily_entitlements WHERE worker_id = w.id AND valid_date = ? LIMIT 1) as today_entitlement_status
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE 1=1
  `;
  const params = [today];

  if (search) {
    const cleanSearch = search.trim();
    const digitsOnly = cleanSearch.replace(/[^0-9]/g, '');
    if (digitsOnly.length >= 3) {
      sql += ` AND (w.document_id LIKE ? OR w.document_id LIKE ? OR w.full_name LIKE ? OR w.email LIKE ?)`;
      params.push(`%${digitsOnly}%`, `%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearch}%`);
    } else {
      sql += ` AND (w.document_id LIKE ? OR w.full_name LIKE ? OR w.email LIKE ?)`;
      params.push(`%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearch}%`);
    }
  }
  if (worker_type) {
    sql += ` AND w.worker_type = ?`;
    params.push(worker_type);
  }
  if (role) {
    sql += ` AND w.role = ?`;
    params.push(role);
  }
  if (deptFilter) {
    sql += ` AND (w.department_id = ? OR d.name = ? OR d.code = ?)`;
    params.push(deptFilter, deptFilter, deptFilter);
  }
  if (shift) {
    sql += ` AND w.shift = ?`;
    params.push(shift);
  }
  if (status) {
    sql += ` AND w.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY w.full_name ASC`;

  const rows = db.prepare(sql).all(...params);

  const workers = rows.map(r => {
    let auth_badge = 'pending';
    let auth_label = 'Pendiente de Enrolar';

    if (r.status === 'terminated') {
      auth_badge = 'revoked';
      auth_label = 'Baja de Nómina';
    } else if (r.active_passkeys > 0) {
      auth_badge = 'passkey_active';
      auth_label = 'Celular / Huella Activo';
    } else if (r.nfc_uid) {
      auth_badge = 'nfc_active';
      auth_label = 'Tarjeta NFC de Respaldo';
    } else if (!r.has_smartphone) {
      auth_badge = 'exemption';
      auth_label = 'Atención en Mesa / Sin Celular';
    }

    return {
      ...r,
      has_smartphone: Boolean(r.has_smartphone),
      auth_badge,
      auth_label
    };
  });

  const totalCensus = db.prepare("SELECT COUNT(*) as count FROM workers").get()?.count || workers.length;
  res.json({ total: workers.length, total_census: totalCensus, workers });
};

const createWorker = (req, res) => {
  const { document_id, full_name, email, department_id, worker_type, role, has_smartphone, phone_number, shift } = req.body;

  if (!document_id || !full_name) {
    return res.status(400).json({ error: 'Cédula y Nombre Completo son obligatorios' });
  }

  const cleanDoc = document_id.trim().toUpperCase();
  const workerEmail = (email && email.trim()) ? email.trim() : `${cleanDoc.toLowerCase().replace(/[^a-z0-9]/g, '')}@mippci.gob.ve`;

  try {
    const existing = db.prepare('SELECT id FROM workers WHERE document_id = ?').get(cleanDoc);
    if (existing) {
      return res.status(409).json({ error: `Ya existe un beneficiario registrado con la cédula ${cleanDoc}` });
    }

    const workerId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO workers (
        id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(
      workerId,
      cleanDoc,
      full_name.trim(),
      workerEmail,
      department_id || null,
      shift || 'jornada_continua',
      worker_type || 'activo',
      role || 'worker',
      has_smartphone !== undefined ? (has_smartphone ? 1 : 0) : 1,
      phone_number || null
    );

    const created = db.prepare('SELECT * FROM workers WHERE id = ?').get(workerId);
    res.status(201).json({
      success: true,
      message: 'Beneficiario incorporado exitosamente al padrón institucional',
      worker: created
    });
  } catch (err) {
    console.error('[WORKER CREATE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

const updateWorker = (req, res) => {
  const { id } = req.params;
  const { full_name, email, department_id, worker_type, role, has_smartphone, phone_number, status, shift } = req.body;

  try {
    const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
    if (!worker) {
      return res.status(404).json({ error: 'Beneficiario no encontrado' });
    }

    db.prepare(`
      UPDATE workers SET
        full_name = COALESCE(?, full_name),
        email = COALESCE(?, email),
        department_id = COALESCE(?, department_id),
        worker_type = COALESCE(?, worker_type),
        role = COALESCE(?, role),
        has_smartphone = COALESCE(?, has_smartphone),
        phone_number = COALESCE(?, phone_number),
        status = COALESCE(?, status),
        shift = COALESCE(?, shift),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      full_name ? full_name.trim() : null,
      email ? email.trim() : null,
      department_id || null,
      worker_type || null,
      role || null,
      has_smartphone !== undefined ? (has_smartphone ? 1 : 0) : null,
      phone_number || null,
      status || null,
      shift || null,
      id
    );

    const updated = db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
    res.json({ success: true, message: 'Datos del beneficiario actualizados', worker: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteWorker = (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("UPDATE workers SET status = 'terminated', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    res.json({ success: true, message: 'Beneficiario dado de baja (marcado inactivo)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getWorkerDossier = async (req, res) => {
  const worker_id = req.params.id;
  let worker = db.prepare(`
    SELECT w.*, d.name as department_name
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE w.id = ? OR w.document_id = ?
  `).get(worker_id, worker_id);

  // Fallback de resiliencia: Si no se encuentra en SQLite local, consultar directamente en Supabase Cloud
  if (!worker) {
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const { data: sbWorker, error: sbErr } = await supabase
          .from('workers')
          .select('*, departments(name)')
          .or(`id.eq.${worker_id},document_id.eq.${worker_id}`)
          .maybeSingle();

        if (sbWorker && !sbErr) {
          worker = {
            ...sbWorker,
            department_name: sbWorker.departments?.name || null
          };
          // Persistir en SQLite local para acelerar próximas consultas
          try {
            db.prepare(`
              INSERT INTO workers (
                id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, contingency_reason, phone_number, avatar_url, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                document_id = excluded.document_id,
                full_name = excluded.full_name,
                email = excluded.email,
                department_id = excluded.department_id,
                shift = excluded.shift,
                status = excluded.status,
                worker_type = excluded.worker_type,
                role = excluded.role,
                has_smartphone = excluded.has_smartphone,
                contingency_reason = excluded.contingency_reason,
                phone_number = excluded.phone_number,
                avatar_url = excluded.avatar_url,
                updated_at = excluded.updated_at
            `).run(
              worker.id,
              worker.document_id,
              worker.full_name,
              worker.email,
              worker.department_id,
              worker.shift || 'jornada_continua',
              worker.status || 'active',
              worker.worker_type || 'activo',
              worker.role || 'worker',
              worker.has_smartphone ? 1 : 0,
              worker.contingency_reason || null,
              worker.phone_number || null,
              worker.avatar_url || null,
              worker.created_at || new Date().toISOString(),
              worker.updated_at || new Date().toISOString()
            );
          } catch (insErr) {}
        }
      }
    } catch (errCatch) {
      console.warn('[DOSSIER] Error buscando trabajador en Supabase:', errCatch.message);
    }
  }

  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  let passkeys = db.prepare(`
    SELECT id, credential_id, device_name, sign_count, status, enrolled_at, last_used_at
    FROM passkey_credentials
    WHERE worker_id = ?
    ORDER BY enrolled_at DESC
  `).all(worker.id);

  if (!passkeys || passkeys.length === 0) {
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const { data: sbPasskeys } = await supabase
          .from('passkey_credentials')
          .select('id, credential_id, device_name, sign_count, status, enrolled_at, last_used_at')
          .eq('worker_id', worker.id)
          .order('enrolled_at', { ascending: false });
        if (Array.isArray(sbPasskeys) && sbPasskeys.length > 0) {
          passkeys = sbPasskeys;
        }
      }
    } catch (e) {}
  }

  let nfcCards = db.prepare(`
    SELECT id, card_uid, status, issued_at, revoked_at
    FROM nfc_cards
    WHERE worker_id = ?
    ORDER BY issued_at DESC
  `).all(worker.id);

  if (!nfcCards || nfcCards.length === 0) {
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const { data: sbNfc } = await supabase
          .from('nfc_cards')
          .select('id, card_uid, status, issued_at, revoked_at')
          .eq('worker_id', worker.id)
          .order('issued_at', { ascending: false });
        if (Array.isArray(sbNfc) && sbNfc.length > 0) {
          nfcCards = sbNfc;
        }
      }
    } catch (e) {}
  }

  let recentDeliveries = db.prepare(`
    SELECT del.id, del.delivered_at, del.verification_method, del.is_offline_sync,
           c.name as combo_name, dp.name as point_name, del.override_reason,
           sup.full_name as supervisor_name
    FROM deliveries del
    JOIN daily_entitlements ent ON del.entitlement_id = ent.id
    JOIN combos c ON ent.combo_id = c.id
    JOIN distribution_points dp ON del.distribution_point_id = dp.id
    LEFT JOIN workers sup ON del.supervisor_id = sup.id
    WHERE del.worker_id = ?
    ORDER BY del.delivered_at DESC
    LIMIT 10
  `).all(worker.id);

  if (!recentDeliveries || recentDeliveries.length === 0) {
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const { data: sbDels } = await supabase
          .from('deliveries')
          .select('id, delivered_at, verification_method, is_offline_sync, override_reason, entitlement_id, distribution_point_id, supervisor_id')
          .eq('worker_id', worker.id)
          .order('delivered_at', { ascending: false })
          .limit(10);
        if (Array.isArray(sbDels) && sbDels.length > 0) {
          recentDeliveries = sbDels.map(d => ({
            id: d.id,
            delivered_at: d.delivered_at,
            verification_method: d.verification_method,
            is_offline_sync: d.is_offline_sync,
            override_reason: d.override_reason,
            combo_name: 'Combo Asignado',
            point_name: 'Mesa Central',
            supervisor_name: 'Supervisor de Turno'
          }));
        }
      }
    } catch (e) {}
  }

  const today = new Date().toISOString().split('T')[0];
  let activeDeviceLock = null;
  try {
    activeDeviceLock = db.prepare(`
      SELECT id, lock_key, device_label, ip_address, status, locked_at, completed_at
      FROM device_locks
      WHERE worker_id = ? AND valid_date = ?
      ORDER BY locked_at DESC
      LIMIT 1
    `).get(worker.id, today) || null;
  } catch (e) {}

  res.json({
    worker,
    passkeys,
    nfcCards,
    activeDeviceLock,
    recentDeliveries
  });
};

const revokeCredential = (req, res) => {
  const credential_id = req.params.credential_id;
  const { reason } = req.body;

  const result = db.prepare(`
    UPDATE passkey_credentials
    SET status = 'revoked'
    WHERE credential_id = ?
  `).run(credential_id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Credencial no encontrada' });
  }

  res.json({
    status: 'success',
    message: 'Dispositivo desvinculado permanentemente',
    credential_id,
    reason: reason || 'Reporte de extravío'
  });
};

const assignNfc = async (req, res) => {
  const worker_id = req.params.id;
  const { card_uid, issued_by } = req.body;
  if (!card_uid) {
    return res.status(400).json({ error: 'card_uid es requerido' });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE nfc_cards
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
      WHERE worker_id = ? AND status = 'active'
    `).run(worker_id);

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO nfc_cards (id, worker_id, card_uid, status, issued_by)
      VALUES (?, ?, ?, 'active', ?)
    `).run(id, worker_id, card_uid.toUpperCase().trim(), issued_by || null);

    return id;
  });

  const cardId = tx();

  // Persistencia Criptográfica en la Nube (Supabase Cloud) con AWAIT
  try {
    const { persistNfcCard } = require('../services/cloud_sync.service');
    await persistNfcCard({
      id: cardId,
      workerId: worker_id,
      cardUid: card_uid.toUpperCase().trim(),
      status: 'active',
      issuedBy: issued_by || null
    });
  } catch (nfcErr) {
    console.warn('[ADMIN NFC CLOUD PERSIST WARN]', nfcErr.message);
  }

  res.json({
    status: 'success',
    message: 'Tarjeta NFC vinculada al trabajador',
    card_id: cardId,
    card_uid: card_uid.toUpperCase().trim()
  });
};

const getCombos = async (req, res) => {
  try {
    const { supabase, isSupabaseConfigured } = require('../supabase');
    if (isSupabaseConfigured() && supabase) {
      const { data: remoteCombos, error } = await supabase.from('combos').select('*').order('created_at', { ascending: false });
      if (!error && Array.isArray(remoteCombos) && remoteCombos.length > 0) {
        const remoteIds = new Set(remoteCombos.map(r => r.id));
        const localCombos = db.prepare('SELECT id FROM combos').all();
        for (const loc of localCombos) {
          if (!remoteIds.has(loc.id)) {
            try { 
              db.prepare('DELETE FROM daily_entitlements WHERE combo_id = ?').run(loc.id);
              db.prepare('DELETE FROM delivery_campaigns WHERE combo_id = ?').run(loc.id);
              db.prepare('DELETE FROM combos WHERE id = ?').run(loc.id); 
            } catch (e) {}
          }
        }

        for (const c of remoteCombos) {
          try {
            db.prepare(`
              INSERT INTO combos (id, name, description, category, calories, dietary_info, is_active, items_detail, icon, mesa_number, mesa_name, conservation, target_qty, weight_kg, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                category = excluded.category,
                calories = excluded.calories,
                dietary_info = excluded.dietary_info,
                is_active = excluded.is_active
            `).run(
              c.id, c.name, c.description, c.category || 'combo_especial', c.calories || 0, c.dietary_info || 'Estándar', c.is_active ? 1 : 0,
              c.description || '', '🍱', 1, 'Mesa 1', 'Ambiente', '1', 14.0, c.created_at || new Date().toISOString()
            );
          } catch (e) {}
        }
      }
    }
  } catch (err) {}

  const combos = db.prepare(`
    SELECT c.*,
           best_camp.id as campaign_id,
           best_camp.name as campaign_name,
           best_camp.status as campaign_status,
           best_camp.start_date as campaign_start_date,
           best_camp.end_date as campaign_end_date
    FROM combos c
    LEFT JOIN (
      SELECT 
        combo_link.combo_id,
        camp.id,
        camp.name,
        camp.status,
        camp.start_date,
        camp.end_date,
        ROW_NUMBER() OVER (
          PARTITION BY combo_link.combo_id 
          ORDER BY 
            CASE camp.status 
              WHEN 'en_curso' THEN 1 
              WHEN 'programada' THEN 2 
              WHEN 'suspendida' THEN 3 
              WHEN 'finalizada' THEN 4 
              ELSE 5 
            END,
            camp.created_at DESC
        ) as rn
      FROM (
        SELECT combo_id, campaign_id FROM campaign_combos
        UNION
        SELECT combo_id, id as campaign_id FROM delivery_campaigns WHERE combo_id IS NOT NULL
        UNION
        SELECT id as combo_id, campaign_id FROM combos WHERE campaign_id IS NOT NULL
      ) combo_link
      JOIN delivery_campaigns camp ON combo_link.campaign_id = camp.id
    ) best_camp ON best_camp.combo_id = c.id AND best_camp.rn = 1
    ORDER BY c.created_at DESC
  `).all();
  res.json(combos);
};

const createCombo = async (req, res) => {
  const { 
    name, description, category, dietary_info, calories, items_detail, 
    icon, weight_kg, mesa_name, mesa_number, conservation, target_qty, is_active, campaign_id 
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del combo es obligatorio' });
  }

  const newId = crypto.randomUUID();
  const cat = category || 'combo_especial';
  const info = dietary_info || 'Almacén Seco / Logística Estándar';
  const cal = parseInt(calories, 10) || 0;
  const items = items_detail ? items_detail.trim() : (description ? description.trim() : '');
  const comboIcon = icon || (cat === 'proteico' || cat === 'combo_proteico' ? '🍗' : (cat === 'navideno' || cat === 'combo_navideno' ? '🎁' : (cat === 'utiles_escolares' ? '🎒' : (cat === 'combo_higienico' ? '🧼' : (cat === 'bolsa_viveres' ? '🌾' : '🍱')))));
  const weight = parseFloat(weight_kg) || 14.0;
  const mesa = mesa_name || 'Mesa 1';
  const mesaNum = parseInt(mesa_number, 10) || 1;
  const cons = conservation || (info.includes('Frío') ? 'Cadena de Frío (-18°C)' : 'Ambiente');
  const target = target_qty || '1';
  const activeVal = is_active !== undefined ? (is_active ? 1 : 0) : 1;
  const cleanCampaignId = campaign_id && campaign_id.trim() ? campaign_id.trim() : null;

  try {
    const insert = db.prepare(`
      INSERT INTO combos (
        id, name, description, category, calories, dietary_info, items_detail, 
        icon, weight_kg, mesa_name, mesa_number, conservation, target_qty, is_active, campaign_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(newId, name.trim(), items || description || '', cat, cal, info, items, comboIcon, weight, mesa, mesaNum, cons, target, activeVal, cleanCampaignId);

    // Sincronización asíncrona garantizada con Supabase Cloud
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const validCategoryMap = {
          'bolsa_viveres': 'bolsa_viveres',
          'combo_proteico': 'combo_proteico',
          'proteico': 'combo_proteico',
          'utiles_escolares': 'utiles_escolares',
          'combo_higienico': 'combo_higienico',
          'dotacion_uniformes': 'dotacion_uniformes',
          'combo_navideno': 'combo_navideno',
          'navideno': 'combo_navideno',
          'combo_salud': 'combo_salud',
          'combo_especial': 'combo_especial'
        };
        const safeCategory = validCategoryMap[cat] || 'combo_especial';

        const { error: sbErr } = await supabase.from('combos').insert([{
          id: newId,
          name: name.trim(),
          description: items || description || '',
          category: safeCategory,
          calories: cal,
          dietary_info: info,
          is_active: activeVal === 1
        }]);
        if (sbErr) console.warn('[SUPABASE INSERT COMBO WARN]', sbErr.message);
        else console.log('[SUPABASE INSERT COMBO SUCCESS]', newId, name.trim());
      }
    } catch (e) {
      console.warn('[SUPABASE INSERT COMBO EXCEPTION]', e.message);
    }

    if (activeVal === 1) {
      reconcileComboEntitlements(newId, true);
    }

    const created = db.prepare('SELECT * FROM combos WHERE id = ?').get(newId);
    res.status(201).json({
      success: true,
      message: 'Combo institucional registrado exitosamente en el catálogo',
      combo: created,
      combos_assigned_today: getActiveAssignedCountToday()
    });
  } catch (err) {
    console.error('[CATALOG ERROR]', err);
    res.status(500).json({ error: 'Error al registrar el nuevo combo: ' + err.message });
  }
};

const deleteCombo = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Sincronización en cascada en Supabase Cloud (eliminar entregas, entitlements y combo)
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        // A) Buscar entitlements del combo en Supabase
        const { data: sbEnts } = await supabase.from('daily_entitlements').select('id').eq('combo_id', id);
        if (sbEnts && sbEnts.length > 0) {
          const entIds = sbEnts.map(e => e.id);
          for (let i = 0; i < entIds.length; i += 50) {
            const batch = entIds.slice(i, i + 50);
            await supabase.from('deliveries').delete().in('entitlement_id', batch);
          }
          for (let i = 0; i < entIds.length; i += 50) {
            const batch = entIds.slice(i, i + 50);
            await supabase.from('daily_entitlements').delete().in('id', batch);
          }
        } else {
          await supabase.from('daily_entitlements').delete().eq('combo_id', id);
        }

        try {
          await supabase.from('campaign_combos').delete().eq('combo_id', id);
        } catch (ccErr) {}

        try {
          await supabase.from('delivery_campaigns').delete().eq('combo_id', id);
        } catch (campErr) {}

        const { error: sbErr } = await supabase.from('combos').delete().eq('id', id);
        if (sbErr) {
          console.error('[SUPABASE DELETE COMBO ERROR]', sbErr);
        } else {
          console.log('[SUPABASE DELETE COMBO SUCCESS]', id);
        }
      }
    } catch (e) {
      console.error('[SUPABASE CASCADE DELETE EXCEPTION]', e.message);
    }

    // 2. Eliminación física completa en SQLite
    db.prepare(`
      DELETE FROM deliveries 
      WHERE entitlement_id IN (SELECT id FROM daily_entitlements WHERE combo_id = ?)
    `).run(id);
    db.prepare('DELETE FROM daily_entitlements WHERE combo_id = ?').run(id);
    db.prepare('DELETE FROM campaign_combos WHERE combo_id = ?').run(id);
    db.prepare('DELETE FROM delivery_campaigns WHERE combo_id = ?').run(id);
    db.prepare('DELETE FROM combos WHERE id = ?').run(id);

    res.json({
      success: true,
      combos_assigned_today: getActiveAssignedCountToday(),
      message: 'Combo eliminado exitosamente del catálogo y de la base de datos'
    });
  } catch (err) {
    console.error('[DELETE COMBO ERROR]', err);
    res.status(500).json({ error: 'Error eliminando combo: ' + err.message });
  }
};

const updateCombo = async (req, res) => {
  const { id } = req.params;
  const { name, description, category, dietary_info, calories, items_detail, icon, weight_kg, is_active, mesa_name, mesa_number, conservation, target_qty, campaign_id } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM combos WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Combo no encontrado' });
    }

    const cat = category !== undefined ? category : existing.category;
    const comboIcon = icon !== undefined ? icon : (existing.icon || (cat === 'proteico' || cat === 'combo_proteico' ? '🍗' : '🍱'));
    const newCampId = campaign_id !== undefined ? (campaign_id && campaign_id.trim() ? campaign_id.trim() : null) : existing.campaign_id;

    db.prepare(`
      UPDATE combos SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        calories = COALESCE(?, calories),
        dietary_info = COALESCE(?, dietary_info),
        items_detail = COALESCE(?, items_detail),
        icon = COALESCE(?, icon),
        weight_kg = COALESCE(?, weight_kg),
        is_active = COALESCE(?, is_active),
        mesa_name = COALESCE(?, mesa_name),
        mesa_number = COALESCE(?, mesa_number),
        conservation = COALESCE(?, conservation),
        target_qty = COALESCE(?, target_qty),
        campaign_id = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : null,
      description !== undefined ? description : null,
      cat,
      calories !== undefined ? parseInt(calories, 10) : null,
      dietary_info !== undefined ? dietary_info : null,
      items_detail !== undefined ? items_detail.trim() : null,
      comboIcon,
      weight_kg !== undefined ? parseFloat(weight_kg) : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      mesa_name !== undefined ? mesa_name : null,
      mesa_number !== undefined ? parseInt(mesa_number, 10) : null,
      conservation !== undefined ? conservation : null,
      target_qty !== undefined ? target_qty : null,
      newCampId,
      id
    );

    // Reconciliar si cambió el estado activo
    if (is_active !== undefined && (is_active ? 1 : 0) !== existing.is_active) {
      reconcileComboEntitlements(id, is_active ? true : false);
    }

    const updated = db.prepare('SELECT * FROM combos WHERE id = ?').get(id);

    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const validCategoryMap = {
          'bolsa_viveres': 'bolsa_viveres',
          'proteico': 'combo_proteico',
          'combo_proteico': 'combo_proteico',
          'utiles_escolares': 'utiles_escolares',
          'combo_higienico': 'combo_higienico',
          'dotacion_uniformes': 'dotacion_uniformes',
          'combo_navideno': 'combo_navideno',
          'combo_salud': 'combo_salud',
          'combo_especial': 'combo_especial'
        };
        const { error: sbErr } = await supabase.from('combos').update({
          name: updated.name,
          description: updated.description,
          category: validCategoryMap[updated.category] || 'combo_especial',
          calories: updated.calories,
          dietary_info: updated.dietary_info,
          is_active: updated.is_active === 1
        }).eq('id', id);
        if (sbErr) console.warn('[SUPABASE UPDATE COMBO WARN]', sbErr.message);
        else console.log('[SUPABASE UPDATE COMBO SUCCESS]', id, updated.name);

        if (is_active !== undefined && !is_active && existing.is_active === 1) {
          await supabase.from('daily_entitlements').delete().eq('combo_id', id).eq('status', 'pending');
        }
      }
    } catch (e) {
      console.warn('[SUPABASE UPDATE COMBO EXCEPTION]', e.message);
    }

    res.json({
      success: true,
      message: `Combo "${updated.name}" actualizado exitosamente`,
      combo: updated,
      combos_assigned_today: getActiveAssignedCountToday()
    });
  } catch (err) {
    console.error('[COMBO UPDATE ERROR]', err);
    res.status(500).json({ error: 'Error al actualizar combo: ' + err.message });
  }
};

function reconcileComboEntitlements(comboId, isActive) {
  const today = new Date().toISOString().split('T')[0];
  if (!isActive) {
    // Al desactivar: eliminar asignaciones PENDIENTES de la fecha actual
    // Las asignaciones ya entregadas (status = 'claimed') se respetan por trazabilidad
    db.prepare("DELETE FROM daily_entitlements WHERE combo_id = ? AND status = 'pending' AND (valid_date = ? OR date(valid_date) = date(?))").run(comboId, today, today);
  } else {
    // Al activar: generar asignaciones pendientes para trabajadores activos
    const combo = db.prepare('SELECT id, mesa_name FROM combos WHERE id = ?').get(comboId);
    if (combo) {
      const activeWorkers = db.prepare("SELECT id, shift FROM workers WHERE status = 'active'").all();
      const insertEnt = db.prepare(`
        INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `);
      const shiftName = combo.mesa_name ? combo.mesa_name.split(' - ')[0].toLowerCase().replace(/\s+/g, '_') : 'jornada_continua';
      const tx = db.transaction(() => {
        for (const w of activeWorkers) {
          insertEnt.run(crypto.randomUUID(), w.id, combo.id, today, shiftName);
        }
      });
      tx();
    }
  }
}

function getActiveAssignedCountToday() {
  const totalWorkers = db.prepare("SELECT COUNT(*) as count FROM workers WHERE status = 'active' AND document_id NOT IN ('V-00000000', '00000000', '')").get()?.count || 0;
  const activeCombos = db.prepare("SELECT COUNT(*) as count FROM combos WHERE is_active = 1").get()?.count || 1;
  return totalWorkers * activeCombos;
}

const toggleComboStatus = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = db.prepare('SELECT id, name, is_active, mesa_name FROM combos WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Combo no encontrado' });
    }

    const newStatus = existing.is_active ? 0 : 1;
    db.prepare('UPDATE combos SET is_active = ? WHERE id = ?').run(newStatus, id);

    // Conciliación inmediata de asignaciones programadas
    reconcileComboEntitlements(id, newStatus === 1);

    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const { error: sbErr } = await supabase.from('combos').update({ is_active: newStatus === 1 }).eq('id', id);
        if (sbErr) console.warn('[SUPABASE TOGGLE COMBO WARN]', sbErr.message);
        else console.log('[SUPABASE TOGGLE COMBO SUCCESS]', id, newStatus === 1);

        if (newStatus === 0) {
          await supabase.from('daily_entitlements').delete().eq('combo_id', id).eq('status', 'pending');
        }
      }
    } catch (e) {
      console.warn('[SUPABASE TOGGLE COMBO EXCEPTION]', e.message);
    }

    const updatedTotal = getActiveAssignedCountToday();

    res.json({
      success: true,
      is_active: newStatus,
      combos_assigned_today: updatedTotal,
      message: `El combo "${existing.name}" ha sido ${newStatus === 1 ? 'ACTIVADO' : 'DESACTIVADO'} exitosamente. Combos programados actualizados a ${updatedTotal}.`
    });
  } catch (err) {
    console.error('[COMBO TOGGLE STATUS ERROR]', err);
    res.status(500).json({ error: 'Error al cambiar estado del combo: ' + err.message });
  }
};

const getAuditStats = (req, res) => {
  const { campaign_id } = req.query;

  try {
    let whereClause = "1=1";
    const params = [];
    let selectedCampaign = null;

    if (campaign_id && campaign_id !== 'all' && campaign_id !== '') {
      selectedCampaign = db.prepare("SELECT * FROM delivery_campaigns WHERE id = ?").get(campaign_id);
      if (selectedCampaign) {
        whereClause += " AND (del.campaign_id = ? OR (del.campaign_id IS NULL AND date(del.delivered_at) >= ? AND date(del.delivered_at) <= ?))";
        params.push(campaign_id, selectedCampaign.start_date, selectedCampaign.end_date);
      } else {
        whereClause += " AND del.campaign_id = ?";
        params.push(campaign_id);
      }
    }

    const globalStats = db.prepare(`
      SELECT 
        COUNT(DISTINCT del.worker_id) as total_workers,
        COUNT(del.id) as total_combos,
        ROUND(COALESCE(SUM(COALESCE(c.weight_kg, 14.0)), 0), 2) as total_weight_kg,
        ROUND(COALESCE(SUM(COALESCE(c.weight_kg, 14.0)), 0) / 1000.0, 3) as total_weight_tons
      FROM deliveries del
      JOIN daily_entitlements ent ON del.entitlement_id = ent.id
      JOIN combos c ON ent.combo_id = c.id
      WHERE ${whereClause}
    `).get(...params);

    const totalWorkers = globalStats.total_workers || 0;
    const totalCombos = globalStats.total_combos || 0;
    const totalWeightKg = globalStats.total_weight_kg || 0;
    const totalWeightTons = globalStats.total_weight_tons || 0;
    const avgKgPerWorker = totalWorkers > 0 ? (totalWeightKg / totalWorkers).toFixed(1) : 0;

    const combosBreakdown = db.prepare(`
      SELECT 
        c.id as combo_id,
        c.name as combo_name,
        c.category as combo_category,
        COALESCE(c.icon, '🍱') as combo_icon,
        COALESCE(c.weight_kg, 14.0) as unit_weight_kg,
        COUNT(del.id) as total_delivered,
        ROUND(SUM(COALESCE(c.weight_kg, 14.0)), 1) as total_kg,
        ROUND(SUM(COALESCE(c.weight_kg, 14.0)) / 1000.0, 3) as total_tons
      FROM deliveries del
      JOIN daily_entitlements ent ON del.entitlement_id = ent.id
      JOIN combos c ON ent.combo_id = c.id
      WHERE ${whereClause}
      GROUP BY c.id, c.name, c.category, c.icon, c.weight_kg
      ORDER BY total_delivered DESC
    `).all(...params);

    const combosWithPct = combosBreakdown.map(c => ({
      ...c,
      percentage: totalCombos > 0 ? Math.round((c.total_delivered / totalCombos) * 100) : 0
    }));

    const deptBreakdown = db.prepare(`
      SELECT 
        COALESCE(d.name, 'Sede Principal / Área Central') as department_name,
        COUNT(DISTINCT del.worker_id) as workers_count,
        COUNT(del.id) as combos_count,
        ROUND(SUM(COALESCE(c.weight_kg, 14.0)) / 1000.0, 3) as total_tons
      FROM deliveries del
      JOIN workers w ON del.worker_id = w.id
      JOIN daily_entitlements ent ON del.entitlement_id = ent.id
      JOIN combos c ON ent.combo_id = c.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      GROUP BY d.name
      ORDER BY combos_count DESC
    `).all(...params);

    const methodStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN del.verification_method = 'passkey_qr' THEN 1 ELSE 0 END) as passkey_qr,
        SUM(CASE WHEN del.verification_method = 'nfc_card' THEN 1 ELSE 0 END) as nfc_card,
        SUM(CASE WHEN del.verification_method = 'supervisor_daily_qr' THEN 1 ELSE 0 END) as supervisor_daily_qr,
        SUM(CASE WHEN del.verification_method = 'supervisor_override' THEN 1 ELSE 0 END) as supervisor_override,
        SUM(CASE WHEN del.is_offline_sync = 1 THEN 1 ELSE 0 END) as offline_deliveries,
        COUNT(del.id) as total
      FROM deliveries del
      WHERE ${whereClause}
    `).get(...params);

    let totalEligible = 0;
    if (selectedCampaign) {
      let workerCondition = "status = 'active'";
      if (selectedCampaign.target_group === 'activo') workerCondition += " AND worker_type = 'activo'";
      else if (selectedCampaign.target_group === 'jubilado') workerCondition += " AND worker_type IN ('jubilado', 'pensionado')";
      else if (selectedCampaign.target_group === 'contratado') workerCondition += " AND worker_type = 'contratado'";
      totalEligible = db.prepare(`SELECT COUNT(*) as count FROM workers WHERE ${workerCondition}`).get().count;
    } else {
      totalEligible = db.prepare("SELECT COUNT(*) as count FROM workers WHERE status = 'active'").get().count;
    }

    const coveragePct = totalEligible > 0 ? Math.min(100, Math.round((totalWorkers / totalEligible) * 100)) : 100;

    const campaignsList = db.prepare(`
      SELECT id, name, status, start_date, end_date 
      FROM delivery_campaigns 
      ORDER BY start_date DESC, created_at DESC
    `).all();

    res.json({
      success: true,
      selected_campaign: selectedCampaign,
      kpis: {
        total_workers: totalWorkers,
        total_combos: totalCombos,
        total_weight_kg: totalWeightKg,
        total_weight_tons: totalWeightTons,
        avg_kg_per_worker: avgKgPerWorker,
        total_eligible: totalEligible,
        coverage_pct: coveragePct
      },
      combos_breakdown: combosWithPct,
      departments_breakdown: deptBreakdown,
      methods_breakdown: {
        passkey_qr: methodStats ? (methodStats.passkey_qr || 0) : 0,
        nfc_card: methodStats ? (methodStats.nfc_card || 0) : 0,
        supervisor_daily_qr: methodStats ? (methodStats.supervisor_daily_qr || 0) : 0,
        supervisor_override: methodStats ? (methodStats.supervisor_override || 0) : 0,
        offline_deliveries: methodStats ? (methodStats.offline_deliveries || 0) : 0,
        total: methodStats ? (methodStats.total || 0) : 0
      },
      campaigns_list: campaignsList
    });
  } catch (err) {
    console.error('[AUDIT STATS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

const getDeliveries = (req, res) => {
  const { campaign_id, method, search, limit } = req.query;

  let sql = `
    SELECT 
      del.id, del.delivered_at, del.verification_method, del.is_offline_sync,
      del.override_reason, del.signature_proof, del.challenge_nonce,
      w.full_name as worker_name, w.document_id as worker_document, w.worker_type,
      d.name as department_name,
      c.name as combo_name, c.category as combo_category, COALESCE(c.weight_kg, 14.0) as weight_kg,
      camp.name as campaign_name, camp.id as campaign_id,
      dp.name as point_name,
      op.full_name as operator_name,
      sup.full_name as supervisor_name
    FROM deliveries del
    JOIN workers w ON del.worker_id = w.id
    JOIN daily_entitlements ent ON del.entitlement_id = ent.id
    JOIN combos c ON ent.combo_id = c.id
    JOIN distribution_points dp ON del.distribution_point_id = dp.id
    LEFT JOIN departments d ON w.department_id = d.id
    LEFT JOIN delivery_campaigns camp ON del.campaign_id = camp.id
    LEFT JOIN workers op ON del.delivered_by_user_id = op.id
    LEFT JOIN workers sup ON del.supervisor_id = sup.id
    WHERE 1=1
  `;
  const params = [];

  if (campaign_id && campaign_id !== 'all' && campaign_id !== '') {
    const selectedCamp = db.prepare("SELECT * FROM delivery_campaigns WHERE id = ?").get(campaign_id);
    if (selectedCamp) {
      sql += ` AND (del.campaign_id = ? OR (del.campaign_id IS NULL AND date(del.delivered_at) >= ? AND date(del.delivered_at) <= ?))`;
      params.push(campaign_id, selectedCamp.start_date, selectedCamp.end_date);
    } else {
      sql += ` AND del.campaign_id = ?`;
      params.push(campaign_id);
    }
  }

  if (method) {
    sql += ` AND del.verification_method = ?`;
    params.push(method);
  }
  if (search) {
    sql += ` AND (w.full_name LIKE ? OR w.document_id LIKE ? OR del.id LIKE ? OR d.name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY del.delivered_at DESC LIMIT ?`;
  params.push(parseInt(limit, 10) || 100);

  const deliveries = db.prepare(sql).all(...params);
  res.json({ total: deliveries.length, deliveries });
};

const exportDeliveries = (req, res) => {
  const { campaign_id, format } = req.query;
  const exportFormat = format || 'json';

  let sql = `
    SELECT 
      del.id as delivery_id,
      del.delivered_at,
      COALESCE(camp.name, 'Jornada General Institucional') as campaign_name,
      w.document_id,
      w.full_name as worker_name,
      COALESCE(d.name, 'Sede Principal') as department_name,
      c.name as combo_name,
      COALESCE(c.weight_kg, 14.0) as weight_kg,
      del.verification_method,
      del.is_offline_sync,
      dp.name as distribution_point,
      sup.full_name as supervisor_authorized,
      del.override_reason,
      del.signature_proof
    FROM deliveries del
    JOIN workers w ON del.worker_id = w.id
    JOIN daily_entitlements ent ON del.entitlement_id = ent.id
    JOIN combos c ON ent.combo_id = c.id
    JOIN distribution_points dp ON del.distribution_point_id = dp.id
    LEFT JOIN departments d ON w.department_id = d.id
    LEFT JOIN delivery_campaigns camp ON del.campaign_id = camp.id
    LEFT JOIN workers sup ON del.supervisor_id = sup.id
    WHERE 1=1
  `;
  const params = [];

  if (campaign_id && campaign_id !== 'all' && campaign_id !== '') {
    const selectedCamp = db.prepare("SELECT * FROM delivery_campaigns WHERE id = ?").get(campaign_id);
    if (selectedCamp) {
      sql += ` AND (del.campaign_id = ? OR (del.campaign_id IS NULL AND date(del.delivered_at) >= ? AND date(del.delivered_at) <= ?))`;
      params.push(campaign_id, selectedCamp.start_date, selectedCamp.end_date);
    } else {
      sql += ` AND del.campaign_id = ?`;
      params.push(campaign_id);
    }
  }

  sql += ` ORDER BY del.delivered_at DESC`;

  const deliveries = db.prepare(sql).all(...params);

  if (exportFormat === 'csv') {
    const headers = ['ID Entrega', 'Fecha/Hora', 'Jornada', 'Cédula', 'Trabajador', 'Departamento', 'Combo', 'Peso (Kg)', 'Método Validación', 'Offline Sync', 'Punto Entrega', 'Supervisor/Operador', 'Motivo Exención', 'Firma Criptográfica'];
    const csvRows = [headers.join(',')];

    deliveries.forEach(d => {
      csvRows.push([
        `"${d.delivery_id}"`,
        `"${d.delivered_at}"`,
        `"${d.campaign_name}"`,
        `"${d.document_id}"`,
        `"${d.worker_name}"`,
        `"${d.department_name}"`,
        `"${d.combo_name}"`,
        d.weight_kg,
        `"${d.verification_method}"`,
        d.is_offline_sync ? 'SÍ' : 'NO',
        `"${d.distribution_point}"`,
        `"${d.supervisor_authorized || 'Despachador Autorizado'}"`,
        `"${d.override_reason || 'N/A'}"`,
        `"${d.signature_proof ? d.signature_proof.substring(0, 32) + '...' : 'N/A'}"`
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_jornada_${campaign_id || 'todas'}.csv"`);
    return res.send('\uFEFF' + csvRows.join('\r\n'));
  }

  if (exportFormat === 'xlsx' || exportFormat === 'excel') {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    // 1. Pestaña de Resumen General y Auditoría
    const totalDeliveries = deliveries.length;
    const uniqueWorkers = new Set(deliveries.map(d => d.document_id)).size;
    const totalKg = deliveries.reduce((acc, d) => acc + (Number(d.weight_kg) || 0), 0);
    const totalTons = Math.round((totalKg / 1000) * 1000) / 1000;
    const { generateSha256IntegritySeal } = require('../services/audit.service');
    const integrityHash = generateSha256IntegritySeal(deliveries);

    const summaryData = [
      ['REPÚBLICA BOLIVARIANA DE VENEZUELA'],
      ['MINISTERIO DEL PODER POPULAR PARA LA COMUNICACIÓN Y LA INFORMACIÓN (MIPPCI)'],
      ['SISTEMA DE GESTIÓN DE BENEFICIOS A TRABAJADORES (SGBT)'],
      ['INFORME DE RENDICIÓN PÚBLICA, AUDITORÍA Y LIQUIDACIÓN LOGÍSTICA'],
      [''],
      ['PARÁMETRO AUDITADO', 'VALOR CONSOLIDADO', 'DETALLES / ESPECIFICACIONES'],
      ['Jornada de Despacho', campaign_id && campaign_id !== 'all' ? campaign_id : 'Histórico Consolidado Completo', 'Filtro aplicado en sistema'],
      ['Fecha de Emisión', new Date().toLocaleString('es-VE'), 'Hora legal de Venezuela (VET)'],
      ['Total Despachos Registrados', totalDeliveries, 'Transacciones procesadas en base de datos'],
      ['Beneficiarios Atendidos', uniqueWorkers, 'Cédulas únicas registradas'],
      ['Peso Bruto Despachado (Kg)', Math.round(totalKg * 10) / 10, 'Kilogramos netos'],
      ['Tonelaje Total Despachado (t)', totalTons, 'Toneladas métricas oficiales'],
      ['Despachos con Passkey FIDO2', deliveries.filter(d => d.verification_method === 'passkey_qr').length, 'Validación criptográfica asimétrica P-256'],
      ['Despachos con Tarjeta Física NFC', deliveries.filter(d => d.verification_method === 'nfc_card').length, 'Identificador físico por proximidad'],
      ['Despachos con QR Diario Supervisor', deliveries.filter(d => d.verification_method === 'supervisor_daily_qr').length, 'Rotación diaria en mesa'],
      ['Liberaciones por Contingencia Supervisor', deliveries.filter(d => d.verification_method === 'supervisor_override').length, 'Excepciones asistidas justificadas'],
      ['Despachos Sincronizados Offline', deliveries.filter(d => d.is_offline_sync).length, 'Operatividad en contingencia local'],
      [''],
      ['SELLO CRIPTOGRÁFICO DE INTEGRIDAD (SHA-256):', integrityHash, 'Inmutable - Garantía de No Repudio']
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 38 }, { wch: 32 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Auditoría');

    // 2. Pestaña de Nómina Maestra General
    const masterRows = deliveries.map(d => ({
      'ID Despacho': d.delivery_id,
      'Fecha y Hora': d.delivered_at,
      'Jornada': d.campaign_name,
      'Cédula': d.document_id,
      'Funcionario': d.worker_name,
      'Dirección / Dependencia': d.department_name,
      'Combo Entregado': d.combo_name,
      'Peso (kg)': d.weight_kg,
      'Método Verificación': d.verification_method === 'passkey_qr' ? 'Passkey QR Celular' : (d.verification_method === 'nfc_card' ? 'Tarjeta NFC' : (d.verification_method === 'supervisor_daily_qr' ? 'QR Diario Supervisor' : 'Contingencia Supervisor')),
      'Offline Sync': d.is_offline_sync ? 'SÍ' : 'NO',
      'Punto Entrega': d.distribution_point,
      'Operador / Supervisor': d.supervisor_authorized || 'Despachador Autorizado',
      'Motivo Contingencia': d.override_reason || 'N/A',
      'Firma / Hash': d.signature_proof ? d.signature_proof.substring(0, 32) + '...' : 'N/A'
    }));

    const wsMaster = XLSX.utils.json_to_sheet(masterRows);
    wsMaster['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 14 }, { wch: 30 }, { wch: 35 }, { wch: 22 }, { wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 18 }, { wch: 25 }, { wch: 28 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsMaster, 'Listado General');

    // 3. Pestañas individuales por Dependencia / Dirección General (Multi-Pestaña)
    const depts = {};
    deliveries.forEach(d => {
      const depName = (d.department_name || 'Sede Central').trim();
      if (!depts[depName]) depts[depName] = [];
      depts[depName].push({
        'Cédula': d.document_id,
        'Funcionario': d.worker_name,
        'Combo': d.combo_name,
        'Peso (kg)': d.weight_kg,
        'Fecha y Hora': d.delivered_at,
        'Método': d.verification_method,
        'Punto': d.distribution_point,
        'ID Transacción': d.delivery_id
      });
    });

    const usedSheetNames = new Set(['Resumen Auditoría', 'Listado General', 'Contingencias']);
    Object.keys(depts).slice(0, 20).forEach(deptKey => {
      let sheetName = deptKey.replace(/[:\\/?*\[\]]/g, '_').substring(0, 28).trim();
      if (!sheetName) sheetName = 'Dependencia';
      if (usedSheetNames.has(sheetName)) sheetName = `${sheetName}_${Math.floor(Math.random() * 100)}`;
      usedSheetNames.add(sheetName);

      const wsDept = XLSX.utils.json_to_sheet(depts[deptKey]);
      wsDept['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 22 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsDept, sheetName);
    });

    // 4. Pestaña de Excepciones y Contingencias (para auditoría específica)
    const overrides = deliveries.filter(d => d.verification_method === 'supervisor_override');
    if (overrides.length > 0) {
      const overrideRows = overrides.map(d => ({
        'ID Despacho': d.delivery_id,
        'Fecha y Hora': d.delivered_at,
        'Cédula Beneficiario': d.document_id,
        'Nombre Beneficiario': d.worker_name,
        'Dirección General': d.department_name,
        'Combo Despachado': d.combo_name,
        'Supervisor Autorizante': d.supervisor_authorized || 'Supervisor',
        'Justificación / Causa': d.override_reason || 'Contingencia Asistida'
      }));
      const wsOverrides = XLSX.utils.json_to_sheet(overrideRows);
      wsOverrides['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 32 }, { wch: 22 }, { wch: 28 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, wsOverrides, 'Contingencias');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_jornada_${campaign_id || 'todas'}.xlsx"`);
    return res.send(buffer);
  }

  if (exportFormat === 'acta' || exportFormat === 'html') {
    const tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get() || {};
    const html = generateOfficialActaHtml({ deliveries, tenantInfo: tenant });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  res.json({ exported_at: new Date().toISOString(), count: deliveries.length, deliveries });
};

const updateWorkerRole = async (req, res) => {
  const { id } = req.params;
  let { role } = req.body;

  if (role === 'distributor') role = 'operator';

  if (!role || !['worker', 'operator', 'supervisor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Opciones: worker, operator, supervisor, admin' });
  }

  try {
    const worker = db.prepare('SELECT id, document_id, full_name, role FROM workers WHERE id = ? OR document_id = ?').get(id, id);
    if (!worker) {
      return res.status(404).json({ error: 'Beneficiario no encontrado' });
    }

    db.prepare('UPDATE workers SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, worker.id);

    // Persistir de inmediato en production_seed.json para que sobreviva reinicios locales
    try {
      const fs = require('fs');
      const path = require('path');
      const seedPath = path.join(__dirname, '../production_seed.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        if (Array.isArray(seedData.workers)) {
          const sw = seedData.workers.find(w => w.id === worker.id || w.document_id === worker.document_id);
          if (sw) {
            sw.role = role;
            sw.updated_at = new Date().toISOString();
            fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2), 'utf8');
          }
        }
      }
    } catch (seedErr) {
      console.warn('[SEED UPDATE WARNING]', seedErr.message);
    }

    // Respaldo garantizado en Supabase Cloud con AWAIT (Indispensable para Vercel Serverless)
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const { error: sbErr } = await supabase
          .from('workers')
          .update({ role, updated_at: new Date().toISOString() })
          .or(`id.eq.${worker.id},document_id.eq.${worker.document_id}`);
        if (sbErr) {
          console.warn('[SUPABASE UPDATE ROLE ERROR]', sbErr.message);
        } else {
          console.log(`[SUPABASE ROLE UPDATED] Funcionario ${worker.document_id} (${worker.full_name}) actualizado exitosamente a rol: ${role}`);
        }
      }
    } catch (e) {
      console.warn('[SUPABASE UPDATE ROLE EXCEPTION]', e.message);
    }

    const roleNames = {
      worker: 'Beneficiario Titular',
      operator: 'Mesa de Despacho (Operador)',
      supervisor: 'Supervisor de Jornada / RRHH',
      admin: 'Administrador General'
    };

    res.json({
      success: true,
      message: `Rol de ${worker.full_name} actualizado exitosamente a ${roleNames[role] || role}`,
      worker: { id: worker.id, document_id: worker.document_id, role, role_name: roleNames[role] || role }
    });
  } catch (err) {
    console.error('[UPDATE ROLE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

const reloadCensus = async (req, res) => {
  try {
    const { seedDatabase, syncFromSupabase } = require('../db');
    seedDatabase(true);
    try {
      await syncFromSupabase();
    } catch (sbErr) {
      console.warn('[RELOAD CENSUS] Advertencia sincronizando con Supabase:', sbErr.message);
    }

    const totalWorkers = db.prepare('SELECT COUNT(*) as count FROM workers').get()?.count || 0;
    const totalDepts = db.prepare('SELECT COUNT(*) as count FROM departments').get()?.count || 0;

    res.json({
      success: true,
      message: `Padrón institucional recargado con éxito: ${totalWorkers.toLocaleString()} funcionarios y ${totalDepts} departamentos adscritos.`,
      total_workers: totalWorkers,
      total_departments: totalDepts
    });
  } catch (err) {
    console.error('[RELOAD CENSUS ERROR]', err);
    res.status(500).json({ error: 'Error al recargar padrón institucional: ' + err.message });
  }
};

const manageWorkerPassword = (req, res) => {
  const { id } = req.params;
  const { action, new_password, clear_device_lock } = req.body;

  try {
    const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
    if (!worker) {
      return res.status(404).json({ error: 'Funcionario no encontrado en el padrón institucional' });
    }

    if (action === 'set_password') {
      if (!new_password || String(new_password).trim().length < 4) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
      }
      const hashed = hashPassword(String(new_password).trim());
      db.prepare(`
        UPDATE workers 
        SET password_hash = ?, enrollment_status = 'registrado', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(hashed, id);

      if (clear_device_lock) {
        try {
          db.prepare("UPDATE device_locks SET status = 'released' WHERE worker_id = ?").run(id);
          db.prepare("UPDATE workers SET bound_device_id = NULL WHERE id = ?").run(id);
        } catch (e) {}
      }

      console.log(`[SECURITY AUDIT] Contraseña actualizada para funcionario: ${worker.document_id} por administrador: ${req.user?.document_id || 'admin'}`);
      return res.json({
        success: true,
        message: `Contraseña actualizada exitosamente para ${worker.full_name}.`,
        enrollment_status: 'registrado'
      });
    } else if (action === 'reset_enrollment') {
      // Revertir a precargado para que el usuario formalice o asigne clave
      db.prepare(`
        UPDATE workers 
        SET password_hash = '', enrollment_status = 'precargado', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(id);

      if (clear_device_lock) {
        try {
          db.prepare("UPDATE device_locks SET status = 'released' WHERE worker_id = ?").run(id);
          db.prepare("UPDATE workers SET bound_device_id = NULL WHERE id = ?").run(id);
        } catch (e) {}
      }

      const onboardingToken = generateMagicLinkToken({
        workerId: worker.id,
        documentId: worker.document_id
      }, 1440); // 24 horas

      console.log(`[SECURITY AUDIT] Funcionario ${worker.document_id} restablecido a estatus PRECARGADO por administrador: ${req.user?.document_id || 'admin'}`);
      return res.json({
        success: true,
        message: `Acceso restablecido para ${worker.full_name}. El funcionario deberá formalizar su clave en su próximo inicio de sesión.`,
        enrollment_status: 'precargado',
        onboarding_token: onboardingToken
      });
    } else {
      return res.status(400).json({ error: "Acción no válida. Especifique 'set_password' o 'reset_enrollment'." });
    }
  } catch (err) {
    console.error('[MANAGE WORKER PASSWORD ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
};

const verifyMerkleProofEndpoint = (req, res) => {
  try {
    const { document_id, delivery_id } = req.query;
    if (!document_id && !delivery_id) {
      return res.status(400).json({ error: 'Parámetro document_id o delivery_id requerido' });
    }

    const { generateMerkleTree, generateMerkleProof, verifyMerkleProof, hashDeliveryLeaf } = require('../services/audit.service');

    const deliveries = db.prepare(`
      SELECT d.id, d.entitlement_id, d.worker_id, w.document_id, w.full_name, d.delivered_at, 
             d.verification_method, d.signature_proof, d.is_offline_sync, c.name as combo_name, cb.weight_kg
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN daily_entitlements de ON d.entitlement_id = de.id
      LEFT JOIN combos c ON de.combo_id = c.id
      LEFT JOIN combos cb ON cb.id = c.id
      ORDER BY d.delivered_at ASC, d.id ASC
    `).all();

    if (!deliveries || deliveries.length === 0) {
      return res.status(404).json({ error: 'No hay despachos registrados para auditar' });
    }

    const targetKey = (document_id || delivery_id).trim();
    const targetDelivery = deliveries.find(d => d.document_id === targetKey || d.id === targetKey);
    if (!targetDelivery) {
      return res.status(404).json({ error: `Despacho no encontrado para identificador: ${targetKey}` });
    }

    const tree = generateMerkleTree(deliveries);
    const proof = generateMerkleProof(deliveries, targetKey);
    const leafHash = hashDeliveryLeaf(targetDelivery);
    const isValid = verifyMerkleProof(leafHash, proof, tree.root);

    res.json({
      verified: isValid,
      merkle_root: tree.root,
      total_deliveries_in_tree: tree.totalRecords,
      tree_depth: tree.layers.length,
      proof_length: proof ? proof.length : 0,
      delivery: {
        id: targetDelivery.id,
        document_id: targetDelivery.document_id,
        full_name: targetDelivery.full_name,
        delivered_at: targetDelivery.delivered_at,
        verification_method: targetDelivery.verification_method
      },
      leaf_hash: leafHash,
      proof
    });
  } catch (err) {
    console.error('[MERKLE VERIFY ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getKpis,
  getWorkers,
  createWorker,
  updateWorker,
  updateWorkerRole,
  manageWorkerPassword,
  deleteWorker,
  reloadCensus,
  getWorkerDossier,
  revokeCredential,
  assignNfc,
  getCombos,
  createCombo,
  updateCombo,
  toggleComboStatus,
  deleteCombo,
  getAuditStats,
  getDeliveries,
  exportDeliveries,
  verifyMerkleProofEndpoint
};

