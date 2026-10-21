// backend/controllers/tenant.controller.js
// Controlador para configuración institucional, marca y modo de validación B2G

const { db } = require('../db');

const getSettings = (req, res) => {
  try {
    let tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
    if (!tenant) {
      tenant = {
        id: 'current_tenant',
        entity_name: 'Ministerio del Poder Popular para la Comunicación y la Información',
        entity_short_name: 'MIPPCI',
        slogan: 'Bienestar y Soberanía Alimentaria Institucional',
        logo_url: '',
        primary_color: '#0284c7',
        secondary_color: '#0ea5e9'
      };
    }

    const distributionPoints = db.prepare('SELECT id, name, location_code, address FROM distribution_points WHERE is_active = 1').all();
    const departments = db.prepare('SELECT id, code, name FROM departments ORDER BY name ASC').all();

    res.json({
      tenant,
      distributionPoints,
      departments
    });
  } catch (err) {
    console.error('[TENANT GET ERROR]', err);
    res.status(500).json({ error: 'Error al obtener configuración del ente' });
  }
};

const updateSettings = (req, res) => {
  const { entity_name, entity_short_name, slogan, logo_url, primary_color, secondary_color, supervisor_qr_mode } = req.body;

  if (!entity_name || !entity_name.trim()) {
    return res.status(400).json({ error: 'El nombre del ente gubernamental es requerido' });
  }

  try {
    const qrMode = (supervisor_qr_mode !== undefined) ? (supervisor_qr_mode ? 1 : 0) : null;

    db.prepare(`
      INSERT INTO tenant_settings (id, entity_name, entity_short_name, slogan, logo_url, primary_color, secondary_color, updated_at)
      VALUES ('current_tenant', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        entity_name = excluded.entity_name,
        entity_short_name = excluded.entity_short_name,
        slogan = excluded.slogan,
        logo_url = excluded.logo_url,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      entity_name.trim(),
      (entity_short_name || 'GOB').trim().toUpperCase(),
      (slogan || '').trim(),
      logo_url || '',
      primary_color || '#0284c7',
      secondary_color || '#0ea5e9'
    );

    if (qrMode !== null) {
      db.prepare("UPDATE tenant_settings SET supervisor_qr_mode = ? WHERE id = 'current_tenant'").run(qrMode);
    }

    const updated = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
    res.json({
      success: true,
      message: 'Identidad y configuración institucional guardadas exitosamente',
      tenant: updated
    });
  } catch (err) {
    console.error('[TENANT POST ERROR]', err);
    res.status(500).json({ error: 'Error al actualizar configuración institucional' });
  }
};

const updateValidationMode = (req, res) => {
  try {
    const { supervisor_qr_mode } = req.body;
    const modeVal = supervisor_qr_mode ? 1 : 0;

    db.prepare(`
      UPDATE tenant_settings 
      SET supervisor_qr_mode = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 'current_tenant'
    `).run(modeVal);

    const updated = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
    res.json({
      success: true,
      supervisor_qr_mode: modeVal === 1,
      message: modeVal === 1
        ? 'Modo de validación por Código QR Diario del Supervisor ACTIVADO. Las entregas a beneficiarios sin smartphone se autorizan con el QR diario en mesa.'
        : 'Modo de validación por Tarjeta Física NFC ACTIVADO. Las entregas a beneficiarios sin smartphone requieren lectura de tarjeta NFC/RFID.',
      tenant: updated
    });
  } catch (err) {
    console.error('[VALIDATION MODE ERROR]', err);
    res.status(500).json({ error: 'Error al actualizar el modo de validación: ' + err.message });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  updateValidationMode
};
