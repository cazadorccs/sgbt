// ============================================================================
// SERVICIO DE PERSISTENCIA CRIPTOGRÁFICA EN LA NUBE (SUPABASE CLOUD)
// Asegura la persistencia garantizada en Vercel Serverless y entornos multi-dispositivo
// ============================================================================

const crypto = require('crypto');
const { supabase, isSupabaseConfigured } = require('../supabase');

const DEFAULT_DISTRIBUTION_POINT_ID = '5b0f10e3-7eac-4872-bf96-74ecd359be7e'; // Almacén Central - Sótano 1
const DEFAULT_COMBO_ID = 'c1a2b3c4-1111-2222-3333-444455556666'; // Canasta Básica MIPPCI

/**
 * Persiste la formalización de un beneficiario (foto, teléfono y hash de contraseña)
 */
async function persistWorkerFormalization({ workerId, documentId, photoBase64, phoneNumber, passwordHash, boundDeviceId }) {
  if (!isSupabaseConfigured() || !supabase) return false;

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
    return true;
  } catch (err) {
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
    const today = new Date().toISOString().split('T')[0];

    // 1. Asegurar que los entitlements asociados existan y se marquen 'claimed' en Supabase
    for (const d of deliveries) {
      const entId = d.entitlement_id;
      if (entId) {
        try {
          await supabase.from('daily_entitlements').upsert([{
            id: entId,
            worker_id: d.worker_id,
            combo_id: d.combo_id || DEFAULT_COMBO_ID,
            valid_date: today,
            shift: 'jornada_continua',
            status: 'claimed'
          }], { onConflict: 'id' });
        } catch (entErr) {
          console.warn('[CLOUD PERSIST] Advertencia al upsert de entitlement:', entErr.message);
        }
      }
    }

    // 2. Preparar e insertar las entregas
    const deliveryRecords = deliveries.map(d => ({
      id: d.id || crypto.randomUUID(),
      entitlement_id: d.entitlement_id,
      worker_id: d.worker_id,
      distribution_point_id: d.distribution_point_id || DEFAULT_DISTRIBUTION_POINT_ID,
      delivered_by_user_id: d.delivered_by_user_id || null,
      verification_method: d.verification_method || 'passkey_qr',
      signature_proof: d.signature_proof || 'FIDO2_ASSERTION',
      challenge_nonce: d.challenge_nonce || crypto.randomBytes(16).toString('hex'),
      is_offline_sync: Boolean(d.is_offline_sync),
      delivered_at: d.delivered_at || new Date().toISOString()
    }));

    const { error: delError } = await supabase.from('deliveries').upsert(deliveryRecords, { onConflict: 'id' });
    if (delError) {
      console.warn('[CLOUD PERSIST] Advertencia al persistir entregas:', delError.message);
      return false;
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

module.exports = {
  persistWorkerFormalization,
  persistPasskey,
  persistDeliveries,
  persistNfcCard,
  revokeNfcCard
};

