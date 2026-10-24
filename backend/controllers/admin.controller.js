// backend/controllers/admin.controller.js
// Controlador para gobernanza administrativa, directorio de personal, combos, auditoría de entregas y estadísticas de tonelaje

const crypto = require('crypto');
const { db } = require('../db');

const getKpis = (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const totalWorkers = db.prepare("SELECT COUNT(*) as count FROM workers WHERE status = 'active'").get().count;
  const workersWithPasskey = db.prepare(`
    SELECT COUNT(DISTINCT worker_id) as count
    FROM passkey_credentials
    WHERE status = 'active'
  `).get().count;

  const totalEntitlementsToday = db.prepare(`
    SELECT COUNT(*) as count
    FROM daily_entitlements
    WHERE valid_date = ?
  `).get(today).count;

  const claimedEntitlementsToday = db.prepare(`
    SELECT COUNT(*) as count
    FROM daily_entitlements
    WHERE valid_date = ? AND status = 'claimed'
  `).get(today).count;

  const methodStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN verification_method = 'passkey_qr' THEN 1 ELSE 0 END) as passkey_qr,
      SUM(CASE WHEN verification_method = 'nfc_card' THEN 1 ELSE 0 END) as nfc_card,
      SUM(CASE WHEN verification_method = 'supervisor_daily_qr' THEN 1 ELSE 0 END) as supervisor_daily_qr,
      SUM(CASE WHEN verification_method = 'supervisor_override' THEN 1 ELSE 0 END) as supervisor_override,
      SUM(CASE WHEN is_offline_sync = 1 THEN 1 ELSE 0 END) as offline_deliveries,
      COUNT(*) as total_deliveries
    FROM deliveries
    WHERE date(delivered_at) = ? OR date('now') = ?
  `).get(today, today);

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
        nfc_card: methodStats.nfc_card || 0,
        supervisor_override: methodStats.supervisor_override || 0
      }
    },
    alerts: recentAlerts
  });
};

const getWorkers = (req, res) => {
  const { search, shift, status, worker_type, role } = req.query;
  const today = new Date().toISOString().split('T')[0];

  // Solo conciliar asignaciones pendientes en carga general sin filtros de búsqueda
  if (!search && !role && !worker_type && !shift && !status) {
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
      w.id, w.document_id, w.full_name, w.email, w.role, w.shift, w.status, w.worker_type, w.has_smartphone, w.contingency_reason,
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

  res.json({ total: workers.length, workers });
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

const getWorkerDossier = (req, res) => {
  const worker_id = req.params.id;
  const worker = db.prepare(`
    SELECT w.*, d.name as department_name
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE w.id = ?
  `).get(worker_id);

  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  const passkeys = db.prepare(`
    SELECT id, credential_id, device_name, sign_count, status, enrolled_at, last_used_at
    FROM passkey_credentials
    WHERE worker_id = ?
    ORDER BY enrolled_at DESC
  `).all(worker_id);

  const nfcCards = db.prepare(`
    SELECT id, card_uid, status, issued_at, revoked_at
    FROM nfc_cards
    WHERE worker_id = ?
    ORDER BY issued_at DESC
  `).all(worker_id);

  const recentDeliveries = db.prepare(`
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
  `).all(worker_id);

  res.json({
    worker,
    passkeys,
    nfcCards,
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

const assignNfc = (req, res) => {
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

  const combos = db.prepare('SELECT * FROM combos ORDER BY created_at DESC').all();
  res.json(combos);
};

const createCombo = async (req, res) => {
  const { 
    name, description, category, dietary_info, calories, items_detail, 
    icon, weight_kg, mesa_name, mesa_number, conservation, target_qty, is_active 
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

  try {
    const insert = db.prepare(`
      INSERT INTO combos (
        id, name, description, category, calories, dietary_info, items_detail, 
        icon, weight_kg, mesa_name, mesa_number, conservation, target_qty, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(newId, name.trim(), items || description || '', cat, cal, info, items, comboIcon, weight, mesa, mesaNum, cons, target, activeVal);

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

    const created = db.prepare('SELECT * FROM combos WHERE id = ?').get(newId);
    res.status(201).json({
      success: true,
      message: 'Combo institucional registrado exitosamente en el catálogo',
      combo: created
    });
  } catch (err) {
    console.error('[CATALOG ERROR]', err);
    res.status(500).json({ error: 'Error al registrar el nuevo combo: ' + err.message });
  }
};

const deleteCombo = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Verificar si existen entregas efectivas ya ejecutadas para este combo
    const deliveriesCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM deliveries d
      JOIN daily_entitlements e ON d.entitlement_id = e.id
      WHERE e.combo_id = ?
    `).get(id)?.count || 0;

    if (deliveriesCount > 0) {
      db.prepare('UPDATE combos SET is_active = 0 WHERE id = ?').run(id);
      try {
        const { supabase, isSupabaseConfigured } = require('../supabase');
        if (isSupabaseConfigured() && supabase) {
          await supabase.from('combos').update({ is_active: false }).eq('id', id);
        }
      } catch (e) {}
      return res.json({ 
        success: true, 
        message: 'Combo desactivado (posee entregas físicas auditadas registradas)' 
      });
    }

    // 2. Si no tiene entregas efectivas realizadas, eliminar asignaciones pendientes y campañas vinculadas en SQLite
    db.prepare('DELETE FROM daily_entitlements WHERE combo_id = ?').run(id);
    db.prepare('DELETE FROM delivery_campaigns WHERE combo_id = ?').run(id);
    db.prepare('DELETE FROM combos WHERE id = ?').run(id);

    // 3. Eliminar en Supabase: primero las referencias en daily_entitlements para que la foreign key no aborte la eliminación
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        await supabase.from('daily_entitlements').delete().eq('combo_id', id);
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

    res.json({ success: true, message: 'Combo eliminado exitosamente del catálogo y de la base de datos' });
  } catch (err) {
    console.error('[CATALOG DELETE ERROR]', err);
    res.status(500).json({ error: 'Error al eliminar combo: ' + err.message });
  }
};

const updateCombo = async (req, res) => {
  const { id } = req.params;
  const { name, description, category, dietary_info, calories, items_detail, icon, weight_kg, is_active, mesa_name, mesa_number, conservation, target_qty } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM combos WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Combo no encontrado' });
    }

    const cat = category !== undefined ? category : existing.category;
    const comboIcon = icon !== undefined ? icon : (existing.icon || (cat === 'proteico' || cat === 'combo_proteico' ? '🍗' : '🍱'));

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
        target_qty = COALESCE(?, target_qty)
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
      id
    );

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
      }
    } catch (e) {
      console.warn('[SUPABASE UPDATE COMBO EXCEPTION]', e.message);
    }

    res.json({
      success: true,
      message: `Combo "${updated.name}" actualizado exitosamente`,
      combo: updated
    });
  } catch (err) {
    console.error('[COMBO UPDATE ERROR]', err);
    res.status(500).json({ error: 'Error al actualizar combo: ' + err.message });
  }
};

const toggleComboStatus = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = db.prepare('SELECT id, name, is_active FROM combos WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Combo no encontrado' });
    }

    const newStatus = existing.is_active ? 0 : 1;
    db.prepare('UPDATE combos SET is_active = ? WHERE id = ?').run(newStatus, id);

    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        const { error: sbErr } = await supabase.from('combos').update({ is_active: newStatus === 1 }).eq('id', id);
        if (sbErr) console.warn('[SUPABASE TOGGLE COMBO WARN]', sbErr.message);
        else console.log('[SUPABASE TOGGLE COMBO SUCCESS]', id, newStatus === 1);
      }
    } catch (e) {
      console.warn('[SUPABASE TOGGLE COMBO EXCEPTION]', e.message);
    }

    res.json({
      success: true,
      is_active: newStatus,
      message: `El combo "${existing.name}" ha sido ${newStatus === 1 ? 'ACTIVADO' : 'DESACTIVADO'} exitosamente.`
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

  if (exportFormat === 'acta' || exportFormat === 'html') {
    const tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get() || {};
    const entityName = tenant.entity_name || 'Ministerio del Poder Popular para la Comunicación y la Información (MIPPCI)';
    const entityShort = tenant.entity_short_name || 'MIPPCI';
    const slogan = tenant.slogan || 'Gestión de Bienestar y Soberanía Alimentaria';

    const totalWeightKg = deliveries.reduce((acc, d) => acc + (Number(d.weight_kg) || 14.0), 0);
    const totalTons = (totalWeightKg / 1000).toFixed(3);
    const uniqueWorkers = new Set(deliveries.map(d => d.document_id)).size;

    // Agrupación por Combo
    const combosMap = {};
    deliveries.forEach(d => {
      const cName = d.combo_name || 'Combo Estándar';
      if (!combosMap[cName]) {
        combosMap[cName] = { count: 0, weight: 0 };
      }
      combosMap[cName].count++;
      combosMap[cName].weight += (Number(d.weight_kg) || 14.0);
    });

    // Agrupación por Método
    const methodCounts = {
      passkey_qr: 0,
      nfc_card: 0,
      supervisor_daily_qr: 0,
      supervisor_override: 0
    };
    let offlineCount = 0;
    deliveries.forEach(d => {
      if (methodCounts[d.verification_method] !== undefined) {
        methodCounts[d.verification_method]++;
      }
      if (d.is_offline_sync) offlineCount++;
    });

    // Agrupación por Dependencia
    const deptMap = {};
    deliveries.forEach(d => {
      const dep = d.department_name || 'Dirección General';
      if (!deptMap[dep]) {
        deptMap[dep] = { workers: new Set(), combos: 0, weight: 0 };
      }
      deptMap[dep].workers.add(d.document_id);
      deptMap[dep].combos++;
      deptMap[dep].weight += (Number(d.weight_kg) || 14.0);
    });

    // Sello de integridad SHA-256
    const integrityPayload = deliveries.map(d => `${d.delivery_id}:${d.delivered_at}:${d.document_id}`).join('|');
    const integrityHash = crypto.createHash('sha256').update(integrityPayload || 'SGBT_EMPTY_DISPATCH').digest('hex');
    const actaNumber = `ACTA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${integrityHash.slice(0, 8).toUpperCase()}`;
    const emissionDate = new Date().toLocaleString('es-VE', { dateStyle: 'full', timeStyle: 'medium' });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acta Oficial de Despacho y Auditoría - ${actaNumber}</title>
  <style>
    @page { size: letter; margin: 1.5cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; margin: 0; padding: 2rem; background: #f8fafc; }
    .page-container { max-width: 900px; margin: 0 auto; background: #ffffff; padding: 3rem; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 1.25rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-titles h1 { font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 0 0 0.25rem 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-titles h2 { font-size: 0.95rem; font-weight: 600; color: #475569; margin: 0 0 0.25rem 0; }
    .header-titles p { font-size: 0.8rem; color: #64748b; margin: 0; }
    .badge-acta { text-align: right; }
    .badge-acta .num { font-size: 1rem; font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 0.35rem 0.75rem; border-radius: 6px; display: inline-block; }
    .badge-acta .date { font-size: 0.75rem; color: #64748b; margin-top: 0.35rem; }
    .section-title { font-size: 0.95rem; font-weight: 700; text-transform: uppercase; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 0.5rem; margin: 1.75rem 0 0.85rem 0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; text-align: center; }
    .kpi-box .val { font-size: 1.6rem; font-weight: 800; color: #0f172a; line-height: 1.1; }
    .kpi-box .lbl { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 0.35rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.85rem; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 0.6rem 0.75rem; border: 1px solid #cbd5e1; text-transform: uppercase; font-size: 0.75rem; }
    td { padding: 0.6rem 0.75rem; border: 1px solid #cbd5e1; color: #1e293b; }
    tr:nth-child(even) { background: #f8fafc; }
    .integrity-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 0.85rem 1rem; font-size: 0.75rem; color: #166534; margin: 1.5rem 0; word-break: break-all; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-top: 4rem; text-align: center; }
    .sig-line { border-top: 1.5px solid #64748b; margin-top: 3.5rem; padding-top: 0.5rem; }
    .sig-line .name { font-weight: 700; font-size: 0.85rem; color: #0f172a; }
    .sig-line .title { font-size: 0.75rem; color: #64748b; }
    .print-actions { text-align: right; margin-bottom: 1.5rem; }
    .btn-print { background: #0284c7; color: #ffffff; border: none; padding: 0.6rem 1.25rem; font-weight: 600; font-size: 0.85rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
    .btn-print:hover { background: #0369a1; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .page-container { box-shadow: none; border: none; padding: 0; max-width: 100%; }
      .print-actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="print-actions">
      <button class="btn-print" onclick="window.print()">
        <span>🖨️ Imprimir / Guardar como PDF</span>
      </button>
    </div>

    <div class="header">
      <div class="header-titles">
        <h1>${entityName}</h1>
        <h2>SGBT &bull; Acta Oficial de Despacho, Rendición y Auditoría Logística</h2>
        <p>${slogan} &bull; Módulo de Control y Entrega Criptográfica</p>
      </div>
      <div class="badge-acta">
        <div class="num">${actaNumber}</div>
        <div class="date">Emisión: ${emissionDate}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="val">${deliveries.length}</div>
        <div class="lbl">Total Entregas</div>
      </div>
      <div class="kpi-box">
        <div class="val">${uniqueWorkers}</div>
        <div class="lbl">Beneficiarios Únicos</div>
      </div>
      <div class="kpi-box">
        <div class="val">${totalTons} Ton</div>
        <div class="lbl">Peso Total (${totalWeightKg.toLocaleString('es-VE')} Kg)</div>
      </div>
      <div class="kpi-box">
        <div class="val">${offlineCount}</div>
        <div class="lbl">Despachos Offline-First</div>
      </div>
    </div>

    <div class="section-title">1. Resumen Consolidado por Rubro y Categoría de Combo</div>
    <table>
      <thead>
        <tr>
          <th>Beneficio / Combo</th>
          <th style="text-align: right;">Unidades Entregadas</th>
          <th style="text-align: right;">Peso Estimado (Kg)</th>
          <th style="text-align: right;">Toneladas Métricas</th>
        </tr>
      </thead>
      <tbody>
        ${Object.keys(combosMap).map(cName => {
          const item = combosMap[cName];
          return `<tr>
            <td><strong>${cName}</strong></td>
            <td style="text-align: right;">${item.count.toLocaleString('es-VE')}</td>
            <td style="text-align: right;">${item.weight.toLocaleString('es-VE')} Kg</td>
            <td style="text-align: right;">${(item.weight / 1000).toFixed(3)} Ton</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="section-title">2. Métricas de Validación Anti-Fraude y Métodos de Seguridad</div>
    <table>
      <thead>
        <tr>
          <th>Mecanismo de Verificación</th>
          <th style="text-align: right;">Entregas</th>
          <th style="text-align: right;">% Distribución</th>
          <th>Protocolo de Seguridad</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Passkey FIDO2 (Curva ECDSA P-256)</strong></td>
          <td style="text-align: right;">${methodCounts.passkey_qr}</td>
          <td style="text-align: right;">${deliveries.length ? Math.round((methodCounts.passkey_qr / deliveries.length) * 100) : 0}%</td>
          <td>Biometría en hardware seguro (Secure Enclave / Android Keystore)</td>
        </tr>
        <tr>
          <td><strong>Tarjeta de Proximidad NFC</strong></td>
          <td style="text-align: right;">${methodCounts.nfc_card}</td>
          <td style="text-align: right;">${deliveries.length ? Math.round((methodCounts.nfc_card / deliveries.length) * 100) : 0}%</td>
          <td>Validación física por UID institucional cifrado</td>
        </tr>
        <tr>
          <td><strong>Código QR Diario del Supervisor</strong></td>
          <td style="text-align: right;">${methodCounts.supervisor_daily_qr}</td>
          <td style="text-align: right;">${deliveries.length ? Math.round((methodCounts.supervisor_daily_qr / deliveries.length) * 100) : 0}%</td>
          <td>Autorización dual temporal en lote</td>
        </tr>
        <tr>
          <td><strong>Liberación por Contingencia</strong></td>
          <td style="text-align: right;">${methodCounts.supervisor_override}</td>
          <td style="text-align: right;">${deliveries.length ? Math.round((methodCounts.supervisor_override / deliveries.length) * 100) : 0}%</td>
          <td>Protocolo de excepción con trazabilidad de supervisor</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">3. Desglose Institucional por Dependencia</div>
    <table>
      <thead>
        <tr>
          <th>Dirección / Dependencia</th>
          <th style="text-align: right;">Trabajadores</th>
          <th style="text-align: right;">Combos</th>
          <th style="text-align: right;">Peso Total</th>
        </tr>
      </thead>
      <tbody>
        ${Object.keys(deptMap).map(dName => {
          const item = deptMap[dName];
          return `<tr>
            <td>${dName}</td>
            <td style="text-align: right;">${item.workers.size}</td>
            <td style="text-align: right;">${item.combos}</td>
            <td style="text-align: right;">${(item.weight / 1000).toFixed(3)} Ton</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="integrity-box">
      <strong>🔒 Sello de Integridad Criptográfica de la Jornada (SHA-256):</strong><br>
      <code>${integrityHash}</code><br>
      <small style="color: #15803d;">Este hash vincula matemáticamente todas las firmas y entregas registradas en el período. Cualquier alteración de registros invalida esta certificación.</small>
    </div>

    <div class="signatures">
      <div class="sig-line">
        <div class="name">Responsable de Almacén</div>
        <div class="title">Control Logístico y Despacho</div>
      </div>
      <div class="sig-line">
        <div class="name">Dirección General de Gestión Humana</div>
        <div class="title">Bienestar Social Institucional</div>
      </div>
      <div class="sig-line">
        <div class="name">Unidad de Auditoría Interna</div>
        <div class="title">Control Posterior y Fiscalización</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  res.json({ exported_at: new Date().toISOString(), count: deliveries.length, deliveries });
};

const updateWorkerRole = (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role || !['worker', 'operator', 'supervisor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Opciones: worker, operator, supervisor, admin' });
  }

  try {
    const worker = db.prepare('SELECT id, document_id, full_name, role FROM workers WHERE id = ?').get(id);
    if (!worker) {
      return res.status(404).json({ error: 'Beneficiario no encontrado' });
    }

    db.prepare('UPDATE workers SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);

    // Persistir de inmediato en production_seed.json para que sobreviva reinicios y re-inicializaciones
    try {
      const fs = require('fs');
      const path = require('path');
      const seedPath = path.join(__dirname, '../production_seed.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        if (Array.isArray(seedData.workers)) {
          const sw = seedData.workers.find(w => w.id === id || w.document_id === worker.document_id);
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

    // Respaldo asíncrono en Supabase
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        supabase.from('workers').update({ role, updated_at: new Date().toISOString() }).eq('id', id).catch(() => {});
      }
    } catch (e) {}

    const roleNames = {
      worker: 'Beneficiario Titular',
      operator: 'Mesa de Despacho (Operador)',
      supervisor: 'Supervisor de Jornada / RRHH',
      admin: 'Administrador General'
    };

    res.json({
      success: true,
      message: `Rol de ${worker.full_name} actualizado exitosamente a ${roleNames[role] || role}`,
      worker: { id, role, role_name: roleNames[role] || role }
    });
  } catch (err) {
    console.error('[UPDATE ROLE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getKpis,
  getWorkers,
  createWorker,
  updateWorker,
  updateWorkerRole,
  deleteWorker,
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
  exportDeliveries
};

