const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require(path.join(__dirname, '../backend/db'));
const { supabase, isSupabaseConfigured } = require(path.join(__dirname, '../backend/supabase'));

function sanitizeName(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
}

function canonicalize(str) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

async function runSync() {
  console.log('=== SINCRONIZACIÓN DEFINITIVA A SUPABASE Y SQLITE ===\n');

  // 1. Obtener departamentos de Supabase
  const { data: supaDepts, error: sdErr } = await supabase.from('departments').select('id, code, name');
  console.log('Departamentos en Supabase:', supaDepts ? supaDepts.length : 0);

  const supaDeptCanonical = new Map();
  if (supaDepts) {
    for (const d of supaDepts) {
      const c = canonicalize(d.name);
      if (c && !supaDeptCanonical.has(c)) supaDeptCanonical.set(c, d.id);
    }
  }

  // Leer departamentos locales
  const localDepts = db.prepare("SELECT id, code, name, cost_center FROM departments").all();
  const validUuidDepts = localDepts.filter(d => isUuid(d.id));

  // Insertar departamentos faltantes en Supabase
  for (const vd of validUuidDepts) {
    const { error } = await supabase.from('departments').upsert({
      id: vd.id,
      code: vd.code || ('DEP_' + crypto.randomBytes(3).toString('hex').toUpperCase()),
      name: vd.name,
      cost_center: vd.cost_center || 'CC-NOMINA'
    }, { onConflict: 'id' });
    if (!error) {
      const c = canonicalize(vd.name);
      if (c) supaDeptCanonical.set(c, vd.id);
    }
  }

  // 2. Leer CSV definitivo
  const csvPath = path.join(__dirname, '../LISTADO DEF.csv');
  const csvRaw = fs.readFileSync(csvPath, 'utf8');
  const lines = csvRaw.split('\n').filter(l => l.trim().length > 0);

  const definitiveWorkers = [];
  const definitiveCedulas = new Set();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    const nro = (parts[0] || '').trim();
    const tipo = (parts[1] || '').trim();
    const rawCed = (parts[2] || '').trim();
    const cleanDigits = rawCed.replace(/[^0-9]/g, '');
    const fullName = sanitizeName(parts[3] || '');
    const hireDate = (parts[4] || '').trim();
    const rawDept = (parts[5] || '').trim();
    const jobTitle = sanitizeName(parts[6] || '');

    if (!cleanDigits) continue;

    definitiveCedulas.add(cleanDigits);

    let workerType = 'activo';
    const lowTipo = tipo.toLowerCase();
    if (lowTipo.includes('jubilad') || lowTipo.includes('pensionad')) {
      workerType = 'jubilado';
    } else if (lowTipo.includes('contratad') || lowTipo.includes('obrero') || lowTipo.includes('avp')) {
      workerType = 'contratado';
    } else if (lowTipo.includes('comision')) {
      workerType = 'activo';
    }

    // Resolver ID de departamento en Supabase
    const cDept = canonicalize(rawDept);
    const supaDeptId = supaDeptCanonical.get(cDept) || null;

    definitiveWorkers.push({
      nro,
      document_id: cleanDigits,
      full_name: fullName,
      email: `${cleanDigits}@mippci.gob.ve`,
      department_id: supaDeptId,
      job_title: jobTitle,
      hire_date: hireDate,
      worker_type: workerType,
      shift: 'jornada_continua',
      status: 'active',
      has_smartphone: 1
    });
  }

  console.log(`Registros definitivos a sincronizar: ${definitiveWorkers.length}`);

  // 3. Mapear con IDs existentes en Supabase para no romper llaves primarias
  const { data: remoteWorkers, error: rwErr } = await supabase
    .from('workers')
    .select('id, document_id, role, avatar_url, phone_number, status');

  const remoteByDoc = new Map();
  if (remoteWorkers) {
    for (const rw of remoteWorkers) {
      const num = rw.document_id.replace(/[^0-9]/g, '');
      remoteByDoc.set(num, rw);
    }
  }

  const payloadForSupabase = [];

  for (const dw of definitiveWorkers) {
    const existing = remoteByDoc.get(dw.document_id);
    let workerId;
    let role = 'worker';
    let avatar_url = null;
    let phone_number = null;

    if (existing) {
      workerId = existing.id;
      role = existing.role || 'worker';
      avatar_url = existing.avatar_url;
      phone_number = existing.phone_number;
    } else {
      workerId = crypto.randomUUID();
    }

    payloadForSupabase.push({
      id: workerId,
      document_id: dw.document_id,
      full_name: dw.full_name,
      email: dw.email,
      department_id: dw.department_id,
      shift: dw.shift,
      status: 'active',
      worker_type: dw.worker_type,
      role: role,
      has_smartphone: dw.has_smartphone ? 1 : 0,
      avatar_url: avatar_url,
      phone_number: phone_number,
      updated_at: new Date().toISOString()
    });
  }

  console.log(`Enviando ${payloadForSupabase.length} registros definitivos a Supabase en bloques de 100...`);
  let supaUpserted = 0;
  for (let i = 0; i < payloadForSupabase.length; i += 100) {
    const chunk = payloadForSupabase.slice(i, i + 100);
    const { error } = await supabase.from('workers').upsert(chunk, { onConflict: 'id' });
    if (error) {
      console.error(`Error en chunk ${i}:`, error.message);
    } else {
      supaUpserted += chunk.length;
    }
  }
  console.log(`Supabase: ${supaUpserted} trabajadores activos sincronizados.`);

  // 4. Desincorporar en Supabase a los trabajadores que ya no están en la nómina definitiva
  const protectedDocs = new Set(['99995001', '18456123', '11123987', '00000000']);
  const idsToTerminateInSupabase = [];

  if (remoteWorkers) {
    for (const rw of remoteWorkers) {
      const num = rw.document_id.replace(/[^0-9]/g, '');
      if (!definitiveCedulas.has(num) && !protectedDocs.has(num) && rw.status === 'active') {
        idsToTerminateInSupabase.push(rw.id);
      }
    }
  }

  console.log(`Desincorporando en Supabase: ${idsToTerminateInSupabase.length} trabajadores no incluidos en la nómina definitiva...`);
  for (let i = 0; i < idsToTerminateInSupabase.length; i += 50) {
    const chunk = idsToTerminateInSupabase.slice(i, i + 50);
    const { error } = await supabase
      .from('workers')
      .update({ status: 'terminated', updated_at: new Date().toISOString() })
      .in('id', chunk);
    if (error) console.error('Error desincorporando lote en Supabase:', error.message);
  }

  // 5. Verificar recuento final en Supabase
  const { count: finalSupaActive } = await supabase
    .from('workers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .not('document_id', 'in', '("V-99995001","V-18456123","V-11123987","V-00000000","00000000")');

  console.log(`\n======================================================`);
  console.log(`PADRÓN ACTIVO OFICIAL EN SUPABASE: ${finalSupaActive} (Esperado: 1079)`);
  console.log(`======================================================\n`);
}

runSync().catch(console.error);
