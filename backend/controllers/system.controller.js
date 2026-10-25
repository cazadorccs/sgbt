// backend/controllers/system.controller.js
// Controlador para estado del sistema, diagnóstico, puesta a cero, backup y asistente de inicio

const crypto = require('crypto');
const { db, seedDatabase, secureEnclaveSimulator } = require('../db');
const { testSupabaseConnection, isSupabaseConfigured } = require('../supabase');
const { getOutboxStats } = require('../services/outbox.service');

const getStatus = async (req, res) => {
  try {
    const supabaseInfo = await testSupabaseConnection();
    let isInitialized = true;
    let isDemoMode = false;
    let hasAdmin = false;
    let tenantInfo = null;

    try {
      const tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
      if (tenant) {
        isInitialized = tenant.is_initialized === 1 || tenant.is_initialized === '1';
        isDemoMode = tenant.is_demo_mode === 1 || tenant.is_demo_mode === '1';
        tenantInfo = {
          entity_name: tenant.entity_name,
          entity_short_name: tenant.entity_short_name,
          slogan: tenant.slogan,
          logo_url: tenant.logo_url,
          primary_color: tenant.primary_color,
          secondary_color: tenant.secondary_color,
          is_demo_mode: isDemoMode
        };
      }
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM workers WHERE role = 'admin' OR role = 'director'").get();
      hasAdmin = adminCount && adminCount.count > 0;
    } catch (dbErr) {
      console.warn('[SYSTEM STATUS] Error consultando estado inicialización:', dbErr.message);
    }

    res.json({
      status: 'online',
      database_engine: supabaseInfo.connected ? 'supabase_cloud' : 'sqlite_local',
      supabase_configured: isSupabaseConfigured(),
      supabase_details: supabaseInfo,
      is_initialized: isInitialized,
      is_demo_mode: isDemoMode,
      has_admin: hasAdmin,
      tenant: tenantInfo,
      outbox: getOutboxStats(),
      server_time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const exportBackup = (req, res) => {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const backup = {
      export_version: '2.3',
      exported_at: new Date().toISOString(),
      tenant: db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get() || {},
      departments: db.prepare("SELECT * FROM departments").all(),
      distribution_points: db.prepare("SELECT * FROM distribution_points").all(),
      combos: db.prepare("SELECT * FROM combos").all(),
      workers: db.prepare("SELECT id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number FROM workers").all(),
      campaigns: db.prepare("SELECT * FROM delivery_campaigns").all(),
      daily_entitlements: db.prepare("SELECT * FROM daily_entitlements").all(),
      deliveries: db.prepare("SELECT * FROM deliveries").all(),
      payroll_sync_logs: db.prepare("SELECT * FROM payroll_sync_logs").all()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sgbt_backup_${dateStr}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('[EXPORT BACKUP ERROR]', err);
    res.status(500).json({ error: 'Error al generar el respaldo de la base de datos' });
  }
};

const factoryReset = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.env.SYSTEM_RESET_SECRET) {
    return res.status(500).json({
      error: 'Operación bloqueada por política DevSecOps: SYSTEM_RESET_SECRET no está configurado en el entorno de producción.'
    });
  }

  const { phrase, pin, key, keep_templates } = req.body;
  const provided = (phrase || pin || key || '').trim();
  const configuredSecret = (process.env.SYSTEM_RESET_SECRET || '0578').trim();
  const configuredPhrase = (process.env.SYSTEM_RESET_PHRASE || 'REINICIAR SISTEMA').trim();

  if (provided !== configuredPhrase && provided !== configuredSecret) {
    return res.status(400).json({
      error: `Debe ingresar la clave de seguridad institucional configurada o la frase "${configuredPhrase}" para autorizar la puesta a cero.`
    });
  }

  try {
    db.exec(`
      DELETE FROM deliveries;
      DELETE FROM daily_entitlements;
      DELETE FROM delivery_campaigns;
      DELETE FROM system_notifications;
      DELETE FROM passkey_credentials;
      DELETE FROM nfc_cards;
      DELETE FROM workers;
    `);

    if (!keep_templates) {
      db.exec(`
        DELETE FROM combos;
        DELETE FROM distribution_points;
        DELETE FROM departments;
      `);
    }

    db.prepare(`
      UPDATE tenant_settings
      SET is_initialized = 0,
          entity_name = 'Ente Institucional',
          entity_short_name = 'INSTITUCIÓN',
          slogan = 'Bienestar y Soberanía Alimentaria',
          logo_url = '',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 'current_tenant'
    `).run();

    if (secureEnclaveSimulator && typeof secureEnclaveSimulator.clear === 'function') {
      secureEnclaveSimulator.clear();
    }

    console.log('[FACTORY RESET] Base de datos puesta a cero exitosamente. is_initialized = 0.');

    res.json({
      success: true,
      message: 'Base de datos puesta a cero exitosamente. El sistema está listo para la primera configuración.',
      is_initialized: false
    });
  } catch (err) {
    console.error('[FACTORY RESET ERROR]', err);
    res.status(500).json({ error: 'Error al ejecutar la puesta a cero de la base de datos' });
  }
};

const initializeSetup = (req, res) => {
  const { admin, tenant, distribution_point, combo, combos, workers, clear_demo_data } = req.body;

  if (!admin || !admin.document_id || !admin.full_name) {
    return res.status(400).json({ error: 'Los datos del administrador son obligatorios (cédula y nombre).' });
  }

  try {
    if (clear_demo_data !== false) {
      db.exec(`
        DELETE FROM deliveries;
        DELETE FROM daily_entitlements;
        DELETE FROM delivery_campaigns;
        DELETE FROM system_notifications;
        DELETE FROM passkey_credentials;
        DELETE FROM nfc_cards;
        DELETE FROM workers;
        DELETE FROM combos;
        DELETE FROM distribution_points;
        DELETE FROM departments;
      `);
      if (secureEnclaveSimulator && typeof secureEnclaveSimulator.clear === 'function') {
        secureEnclaveSimulator.clear();
      }
    }

    if (tenant) {
      db.prepare(`
        UPDATE tenant_settings
        SET entity_name = COALESCE(?, entity_name),
            entity_short_name = COALESCE(?, entity_short_name),
            slogan = COALESCE(?, slogan),
            primary_color = COALESCE(?, primary_color),
            secondary_color = COALESCE(?, secondary_color),
            logo_url = COALESCE(?, logo_url),
            is_initialized = 1,
            is_demo_mode = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'current_tenant'
      `).run(
        tenant.entity_name || null,
        tenant.entity_short_name || null,
        tenant.slogan || null,
        tenant.primary_color || null,
        tenant.secondary_color || null,
        tenant.logo_url || null
      );
    } else {
      db.prepare(`
        UPDATE tenant_settings
        SET is_initialized = 1,
            is_demo_mode = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'current_tenant'
      `).run();
    }

    const deptId = 'd-general-001';
    db.prepare(`
      INSERT OR IGNORE INTO departments (id, name, code)
      VALUES (?, ?, ?)
    `).run(deptId, 'Dirección General de Gestión Humana', 'DGGH');

    const adminId = crypto.randomUUID();
    const adminDoc = admin.document_id.trim().toUpperCase();
    const adminEmail = admin.email || `${adminDoc.toLowerCase().replace(/[^0-9a-z]/g, '')}@mippci.gob.ve`;

    db.prepare(`
      INSERT OR REPLACE INTO workers (
        id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
      ) VALUES (?, ?, ?, ?, ?, 'jornada_continua', 'active', 'activo', 'admin', 1, ?)
    `).run(
      adminId,
      adminDoc,
      admin.full_name.trim(),
      adminEmail,
      deptId,
      admin.phone_number || '+58 412 0000000'
    );

    const createdPointId = 'dp-main-sede';
    if (distribution_point && distribution_point.name) {
      db.prepare(`
        INSERT OR REPLACE INTO distribution_points (id, name, location_code, address, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(
        createdPointId,
        distribution_point.name.trim(),
        distribution_point.location_code || 'SEDE-PRINCIPAL',
        distribution_point.address || 'Sede Ministerial'
      );
    } else {
      db.prepare(`
        INSERT OR IGNORE INTO distribution_points (id, name, location_code, address, is_active)
        VALUES (?, 'Almacén Principal - Sede Central', 'SEDE-CENTRAL', 'Piso PB, Despacho Institucional', 1)
      `).run(createdPointId);
    }

    const createdCombos = [];
    const combosToInsert = Array.isArray(combos) && combos.length > 0 
      ? combos 
      : (combo ? [combo] : [{
          name: 'Bolsa de Víveres y Alimentos Básicos',
          category: 'bolsa_viveres',
          description: 'Harina de maíz, arroz, pasta, caraotas negras, aceite, azúcar, leche en polvo',
          calories: 12000
        }]);

    const insertCombo = db.prepare(`
      INSERT INTO combos (id, name, category, description, calories, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    for (const c of combosToInsert) {
      if (!c.name) continue;
      const cId = crypto.randomUUID();
      insertCombo.run(
        cId,
        c.name.trim(),
        c.category || 'bolsa_viveres',
        c.description || 'Combo de víveres institucionales',
        c.calories || 10000
      );
      createdCombos.push({ id: cId, name: c.name });
    }

    let importedWorkersCount = 0;
    if (Array.isArray(workers) && workers.length > 0) {
      const insertWorker = db.prepare(`
        INSERT OR IGNORE INTO workers (
          id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `);

      for (const w of workers) {
        if (!w.document_id || !w.full_name) continue;
        const wDoc = w.document_id.trim().toUpperCase();
        if (wDoc === adminDoc) continue;

        insertWorker.run(
          crypto.randomUUID(),
          wDoc,
          w.full_name.trim(),
          w.email || `${wDoc.toLowerCase().replace(/[^0-9a-z]/g, '')}@mippci.gob.ve`,
          deptId,
          w.shift || 'jornada_continua',
          w.worker_type || 'activo',
          w.role || 'worker',
          1,
          w.phone_number || ''
        );
        importedWorkersCount++;
      }
    }

    console.log(`[SETUP COMPLETE] Instalación completada para: ${tenant?.entity_name || 'Ente'}. Admin: ${admin.full_name}. Modo producción activado. Nómina cargada: ${importedWorkersCount}`);

    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        supabase.from('workers').upsert([{
          id: adminId,
          document_id: adminDoc,
          full_name: admin.full_name.trim(),
          email: adminEmail,
          role: 'admin',
          worker_type: 'activo',
          status: 'active',
          has_smartphone: true,
          phone_number: admin.phone_number || '+58 412 0000000'
        }], { onConflict: 'document_id' }).then(() => {
          console.log('[SETUP] Administrador respaldado en Supabase Cloud.');
        }).catch(e => console.warn('[SETUP SUPABASE SYNC ERROR]', e.message));
      }
    } catch (e) {}

    const createdAdmin = db.prepare('SELECT id, document_id, full_name, email, role FROM workers WHERE id = ?').get(adminId);
    const updatedTenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();

    res.status(201).json({
      success: true,
      message: '¡Plataforma instalada e inicializada exitosamente en Modo Producción!',
      admin: createdAdmin,
      tenant: updatedTenant,
      combos: createdCombos,
      imported_workers: importedWorkersCount
    });

  } catch (err) {
    console.error('[SETUP INITIALIZE ERROR]', err);
    res.status(500).json({ error: 'Error durante la inicialización del sistema: ' + err.message });
  }
};

const samplePayrollCsv = (req, res) => {
  const csvContent = 
`cedula,nombre,email,telefono,departamento,turno,tipo_trabajador,tiene_telefono
V-18456123,Carlos Eduardo Mendoza,carlos.mendoza@mippci.gob.ve,+58 414 1234567,Dirección General de Gestión Humana,jornada_continua,activo,si
V-12345678,Roberto Alexander Gómez,roberto.gomez@mippci.gob.ve,+58 412 5551234,Dirección General de Comunicación Digital,jornada_continua,activo,si
V-06894321,Hilda Teresa Domínguez,hilda.dominguez@mippci.gob.ve,+58 424 9876543,Coordinación de Jubilados y Pensionados,jornada_continua,jubilado,no
V-21555666,Elena Sofía Morales,elena.morales@mippci.gob.ve,+58 416 7778899,Dirección General de Prensa Presidencial,mañana,activo,si
V-15888999,Andrés David Silva,andres.silva@mippci.gob.ve,+58 426 3334455,Dirección de Tecnología y Sistemas,tarde,contratado,si
V-14111222,Miguel Ángel Torres,miguel.torres@mippci.gob.ve,+58 414 0001122,Almacén y Servicios Generales,jornada_continua,activo,si
V-13222333,Claudia Patricia Vega,claudia.vega@mippci.gob.ve,+58 412 9998877,Dirección General de Gestión Humana,jornada_continua,activo,si
V-11123987,Juan Carlos Rivas,juan.rivas@mippci.gob.ve,+58 414 7776655,Dirección General de Gestión Humana,jornada_continua,activo,si`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nomina_oficial_mippci_plantilla.csv"');
  res.send('\uFEFF' + csvContent);
};

const toggleDemoMode = (req, res) => {
  const { enable } = req.body;

  try {
    const isDemo = enable !== false;
    db.prepare(`
      UPDATE tenant_settings
      SET is_demo_mode = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 'current_tenant'
    `).run(isDemo ? 1 : 0);

    if (isDemo) {
      seedDatabase(true);
      console.log('[DEMO MODE] Modo de demostración ACTIVADO y datos de prueba restaurados.');
    } else {
      console.log('[DEMO MODE] Modo de demostración DESACTIVADO. Sistema en Modo Producción.');
    }

    const tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();

    res.json({
      success: true,
      is_demo_mode: isDemo,
      message: isDemo 
        ? 'Modo de Demostración activado exitosamente con perfiles de prueba.' 
        : 'Modo Producción activado. La demostración ha sido ocultada.',
      tenant
    });
  } catch (err) {
    console.error('[DEMO MODE TOGGLE ERROR]', err);
    res.status(500).json({ error: 'Error al cambiar el modo de demostración: ' + err.message });
  }
};

module.exports = {
  getStatus,
  exportBackup,
  factoryReset,
  initializeSetup,
  samplePayrollCsv,
  toggleDemoMode
};
