// ============================================================================
// MODULE: ADMIN PORTAL, GOVERNANCE, AUDIT LOG & SECURITY DOSSIER
// ============================================================================

window.refreshPortalData = async function() {
  try {
    // 1. KPIs
    const kpiData = await API.get('/api/v1/admin/kpis');
    const { kpis, alerts } = kpiData;

    const elTotalWorkers = document.getElementById('kpiTotalWorkers');
    const elAssignedToday = document.getElementById('kpiAssignedToday');
    const elClaimedRatio = document.getElementById('kpiClaimedRatio');
    const elPasskeyAdoption = document.getElementById('kpiPasskeyAdoption');
    const elPasskeyCount = document.getElementById('kpiPasskeyCount');
    const elOfflinePct = document.getElementById('kpiOfflinePct');

    if (elTotalWorkers) elTotalWorkers.textContent = kpis.total_active_workers;
    if (elAssignedToday) elAssignedToday.textContent = kpis.combos_assigned_today;
    if (elClaimedRatio) elClaimedRatio.textContent = `${kpis.combos_claimed_today} entregados hoy (${kpis.pending_today} pendientes)`;
    if (elPasskeyAdoption) elPasskeyAdoption.textContent = `${kpis.passkey_adoption_rate_pct}%`;
    if (elPasskeyCount) elPasskeyCount.textContent = `${kpis.workers_with_passkey} credenciales activas`;
    if (elOfflinePct) elOfflinePct.textContent = `${kpis.offline_sync_pct}%`;

    // Barras de progreso de verificación
    const totalDel = kpis.combos_claimed_today || 1;
    const b = kpis.verification_breakdown || { passkey_qr: 0, nfc_card: 0, supervisor_override: 0 };
    const passkeyPct = Math.round((b.passkey_qr / totalDel) * 100) || 0;
    const nfcPct = Math.round((b.nfc_card / totalDel) * 100) || 0;
    const supPct = Math.round((b.supervisor_override / totalDel) * 100) || 0;

    const barCountPasskey = document.getElementById('barCountPasskey');
    const barFillPasskey = document.getElementById('barFillPasskey');
    const barCountNfc = document.getElementById('barCountNfc');
    const barFillNfc = document.getElementById('barFillNfc');
    const barCountSupervisor = document.getElementById('barCountSupervisor');
    const barFillSupervisor = document.getElementById('barFillSupervisor');

    if (barCountPasskey) barCountPasskey.textContent = `${b.passkey_qr} entregas (${passkeyPct}%)`;
    if (barFillPasskey) barFillPasskey.style.width = `${passkeyPct}%`;
    if (barCountNfc) barCountNfc.textContent = `${b.nfc_card} entregas (${nfcPct}%)`;
    if (barFillNfc) barFillNfc.style.width = `${nfcPct}%`;
    if (barCountSupervisor) barCountSupervisor.textContent = `${b.supervisor_override} entregas (${supPct}%)`;
    if (barFillSupervisor) barFillSupervisor.style.width = `${supPct}%`;

    // Alertas
    const alertsContainer = document.getElementById('dashboardAlertsList');
    if (alertsContainer && alerts) {
      alertsContainer.innerHTML = '';
      alerts.forEach(a => {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert-box alert-${a.type === 'warning' ? 'warning' : a.type === 'danger' ? 'danger' : 'info'}`;
        alertDiv.innerHTML = `
          <div>
            <strong>${a.title}</strong>
            <p style="font-size: 0.75rem; margin-top: 0.2rem;">${a.message}</p>
            <span style="font-size: 0.65rem; opacity: 0.7;">${a.timestamp}</span>
          </div>
        `;
        alertsContainer.appendChild(alertDiv);
      });
    }

    // 2. Directorio de Trabajadores
    await loadWorkersDirectory();

    // 3. Catálogo de Combos
    if (typeof loadCombosCatalog === 'function') await loadCombosCatalog();

    // 4. Planificación de Jornadas de Despacho
    if (typeof loadCampaigns === 'function') await loadCampaigns();

    // 5. Configuración Institucional y Marca
    if (typeof loadTenantSettings === 'function') await loadTenantSettings();

    // 6. Notificaciones y Avisos de Jornadas
    if (typeof loadNotifications === 'function') await loadNotifications();

    // 7. Auditoría de Entregas & Estadísticas por Jornada
    await loadAuditStats();
    await loadAuditDeliveries();

  } catch (err) {
    console.error('Error cargando datos del portal:', err);
  }
};

let currentWorkersPage = 1;
const WORKERS_PER_PAGE = 25;
let allFilteredWorkers = [];

function renderWorkersPage() {
  const tbody = document.getElementById('workersTableBody');
  if (!tbody) return;

  const total = allFilteredWorkers.length;
  const totalPages = Math.max(1, Math.ceil(total / WORKERS_PER_PAGE));
  if (currentWorkersPage > totalPages) currentWorkersPage = totalPages;
  if (currentWorkersPage < 1) currentWorkersPage = 1;

  const startIdx = (currentWorkersPage - 1) * WORKERS_PER_PAGE;
  const endIdx = Math.min(startIdx + WORKERS_PER_PAGE, total);
  const pageWorkers = allFilteredWorkers.slice(startIdx, endIdx);

  tbody.innerHTML = '';

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #64748b;">No se encontraron trabajadores con los filtros seleccionados.</td></tr>';
  } else {
    const fragment = document.createDocumentFragment();
    pageWorkers.forEach(w => {
      const tr = document.createElement('tr');

      let badgeClass = 'badge-pending';
      let badgeIcon = '⏳';
      if (w.auth_badge === 'passkey_active') {
        badgeClass = 'badge-passkey';
        badgeIcon = '🔐';
      } else if (w.auth_badge === 'nfc_active') {
        badgeClass = 'badge-nfc';
        badgeIcon = '💳';
      } else if (w.auth_badge === 'revoked') {
        badgeClass = 'badge-revoked';
        badgeIcon = '🛑';
      } else if (w.auth_badge === 'exemption') {
        badgeClass = 'badge-override';
        badgeIcon = '⚠️';
      }

      let condBadge = '<span class="badge badge-activo">🏢 Funcionario Activo</span>';
      if (w.worker_type === 'jubilado') {
        condBadge = '<span class="badge badge-jubilado">👴 Personal Jubilado</span>';
      } else if (w.worker_type === 'contratado') {
        condBadge = '<span class="badge badge-contratado">📋 Personal Contratado</span>';
      }

      const currentRole = w.role || 'worker';
      let roleClass = 'badge-role-worker';
      if (currentRole === 'supervisor') roleClass = 'badge-role-supervisor';
      else if (currentRole === 'operator') roleClass = 'badge-role-operator';
      else if (currentRole === 'admin') roleClass = 'badge-role-admin';

      const roleSelectHtml = `
        <select class="form-select role-select-pill ${roleClass}" onchange="window.changeWorkerRole('${w.id}', this.value, '${w.full_name.replace(/'/g, "\\'")}')" title="Modificar rol y permisos operativos">
          <option value="worker" ${currentRole === 'worker' ? 'selected' : ''}>👤 Beneficiario Titular</option>
          <option value="operator" ${currentRole === 'operator' ? 'selected' : ''}>📦 Mesa de Despacho</option>
          <option value="supervisor" ${currentRole === 'supervisor' ? 'selected' : ''}>🛡️ Supervisor de Jornada</option>
          <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>👑 Administrador</option>
        </select>
      `;

      const entitlementBadge = w.today_entitlement_status === 'claimed'
        ? '<span class="badge badge-passkey">Entregado</span>'
        : w.today_entitlement_status === 'pending'
        ? '<span class="badge badge-override">Pendiente</span>'
        : '<span class="badge" style="background: rgba(255,255,255,0.05); color: #94a3b8;">Sin Asignar</span>';

      tr.innerHTML = `
        <td class="text-mono" style="font-weight: 600;">${w.document_id}</td>
        <td>
          <div style="font-weight: 600;">${w.full_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${w.email}</div>
        </td>
        <td>${roleSelectHtml}</td>
        <td>${condBadge}</td>
        <td>${w.department_name || 'Sin Asignar'}</td>
        <td style="text-transform: capitalize;">${(w.shift || '').replace('_', ' ')}</td>
        <td>
          <span class="badge ${badgeClass}">${badgeIcon} ${w.auth_label}</span>
        </td>
        <td>${entitlementBadge}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            <button class="btn btn-outline" style="padding: 0.25rem 0.55rem; font-size: 0.72rem;" onclick="openSecurityDossier('${w.id}')" title="Ver Dispositivos y Tarjetas">
              🛡️ Expediente
            </button>
            <button class="btn btn-outline" style="padding: 0.25rem 0.55rem; font-size: 0.72rem; color: #16a34a; border-color: #86efac; background: #f0fdf4;" onclick="sendWhatsAppInviteToWorker('${w.id}')" title="Enviar enlace de instalación personalizado por WhatsApp">
              📲 WhatsApp
            </button>
          </div>
        </td>
      `;
      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
  }

  // Actualizar controles de paginación
  const infoEl = document.getElementById('workersPaginationInfo');
  const pageTextEl = document.getElementById('workersCurrentPageText');
  const btnPrev = document.getElementById('btnPrevWorkersPage');
  const btnNext = document.getElementById('btnNextWorkersPage');

  if (infoEl) {
    if (total === 0) {
      infoEl.textContent = 'Mostrando 0 trabajadores';
    } else {
      infoEl.textContent = `Mostrando ${startIdx + 1} - ${endIdx} de ${total.toLocaleString()} trabajadores`;
    }
  }
  if (pageTextEl) {
    pageTextEl.textContent = `Página ${currentWorkersPage} de ${totalPages}`;
  }
  if (btnPrev) btnPrev.disabled = (currentWorkersPage <= 1);
  if (btnNext) btnNext.disabled = (currentWorkersPage >= totalPages);
}

window.loadWorkersDirectory = async function() {
  const search = document.getElementById('searchWorkerInput')?.value || '';
  const role = document.getElementById('filterRoleSelect')?.value || '';
  const workerType = document.getElementById('filterWorkerTypeSelect')?.value || '';
  const shift = document.getElementById('filterShiftSelect')?.value || '';
  const status = document.getElementById('filterStatusSelect')?.value || '';

  const tbody = document.getElementById('workersTableBody');
  if (!tbody) return;

  try {
    const url = `/api/v1/admin/workers?search=${encodeURIComponent(search)}&role=${encodeURIComponent(role)}&worker_type=${encodeURIComponent(workerType)}&shift=${encodeURIComponent(shift)}&status=${encodeURIComponent(status)}`;
    const data = await API.get(url);
    allFilteredWorkers = data.workers || [];
    currentWorkersPage = 1;
    renderWorkersPage();
  } catch (err) {
    console.error('Error cargando directorio de trabajadores:', err);
  }
};

window.changeWorkerRole = async function(workerId, newRole, workerName) {
  try {
    const res = await API.put(`/api/v1/admin/workers/${workerId}/role`, { role: newRole });
    if (res.success) {
      playAudioFeedback('success');
      window.showToast(res.message || `✅ Rol de ${workerName} actualizado.`, 'success');
      await window.loadWorkersDirectory();
    } else {
      throw new Error(res.error || 'Error al actualizar rol');
    }
  } catch (err) {
    playAudioFeedback('error');
    window.showToast('❌ Error: ' + err.message, 'error');
    await window.loadWorkersDirectory();
  }
};

window.loadAuditStats = async function() {
  const campaignId = document.getElementById('auditCampaignFilter')?.value || 'all';
  try {
    const data = await API.get(`/api/v1/admin/audit/stats?campaign_id=${encodeURIComponent(campaignId)}`);
    if (!data.success) return;

    const elWorkers = document.getElementById('statAuditWorkersCount');
    const elCoverage = document.getElementById('statAuditCoverageRate');
    const elTons = document.getElementById('statAuditTonsCount');
    const elKg = document.getElementById('statAuditKgCount');
    const elCombos = document.getElementById('statAuditCombosCount');
    const elCombosDetail = document.getElementById('statAuditCombosDetail');
    const elSecurityRate = document.getElementById('statAuditSecurityRate');
    const elSecurityBreakdown = document.getElementById('statAuditSecurityBreakdown');

    if (elWorkers) elWorkers.textContent = (data.kpis.total_workers || 0).toLocaleString();
    if (elCoverage) {
      elCoverage.textContent = `Cobertura: ${data.kpis.coverage_pct}% (${data.kpis.total_workers} de ${data.kpis.total_eligible} en padrón)`;
    }
    if (elTons) elTons.textContent = `${data.kpis.total_weight_tons} t`;
    if (elKg) {
      elKg.textContent = `${(data.kpis.total_weight_kg || 0).toLocaleString()} kg totales (prom. ${data.kpis.avg_kg_per_worker} kg / beneficiario)`;
    }
    if (elCombos) elCombos.textContent = `${(data.kpis.total_combos || 0).toLocaleString()} combos`;
    if (elCombosDetail) {
      elCombosDetail.textContent = data.selected_campaign 
        ? `Jornada: ${data.selected_campaign.name}` 
        : `Histórico consolidado (${(data.campaigns_list || []).length} jornadas)`;
    }

    const totalMethods = data.methods_breakdown?.total || 1;
    const passkeyPct = Math.round(((data.methods_breakdown?.passkey_qr || 0) / totalMethods) * 100);
    const nfcPct = Math.round(((data.methods_breakdown?.nfc_card || 0) / totalMethods) * 100);
    const supPct = Math.round((((data.methods_breakdown?.supervisor_daily_qr || 0) + (data.methods_breakdown?.supervisor_override || 0)) / totalMethods) * 100);

    if (elSecurityRate) elSecurityRate.textContent = `${passkeyPct}% QR Celular`;
    if (elSecurityBreakdown) {
      elSecurityBreakdown.textContent = `Celular: ${passkeyPct}% · Tarjeta: ${nfcPct}% · Mesa: ${supPct}% · 0% duplicados`;
    }

    const selectCampaign = document.getElementById('auditCampaignFilter');
    if (selectCampaign && selectCampaign.options.length <= 1 && data.campaigns_list) {
      data.campaigns_list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        const statusBadge = c.status === 'en_curso' ? '🟢 [En Curso]' : (c.status === 'finalizada' ? '📁 [Finalizada]' : '📅 [Programada]');
        opt.textContent = `${statusBadge} ${c.name} (${c.start_date})`;
        selectCampaign.appendChild(opt);
      });
      if (campaignId !== 'all') {
        selectCampaign.value = campaignId;
      }
    }

    const combosContainer = document.getElementById('auditCombosBreakdownList');
    if (combosContainer) {
      combosContainer.innerHTML = '';
      if (!data.combos_breakdown || data.combos_breakdown.length === 0) {
        combosContainer.innerHTML = '<div style="color: #64748b; font-size: 0.8rem; text-align: center; padding: 1rem;">No hay entregas registradas en esta jornada.</div>';
      } else {
        data.combos_breakdown.forEach(c => {
          const item = document.createElement('div');
          item.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.65rem 0.85rem;';
          item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <div style="display: flex; align-items: center; gap: 0.4rem; font-weight: 700; font-size: 0.82rem; color: #0f172a;">
                <span>${c.combo_icon || '🍱'}</span>
                <span>${c.combo_name}</span>
              </div>
              <div style="text-align: right;">
                <span style="font-weight: 800; color: #0284c7; font-size: 0.85rem;">${c.total_delivered.toLocaleString()} entregas</span>
                <span style="font-size: 0.72rem; color: #16a34a; font-weight: 700; margin-left: 0.35rem;">(${c.total_tons} t)</span>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: #64748b; margin-bottom: 0.25rem;">
              <span>Peso unitario: ${c.unit_weight_kg} kg · Total: ${c.total_kg.toLocaleString()} kg</span>
              <span>${c.percentage}% del volumen</span>
            </div>
            <div style="height: 6px; background: #e2e8f0; border-radius: 9999px; overflow: hidden;">
              <div style="width: ${c.percentage}%; height: 100%; background: linear-gradient(90deg, #0284c7, #10b981); border-radius: 9999px;"></div>
            </div>
          `;
          combosContainer.appendChild(item);
        });
      }
    }

    const deptContainer = document.getElementById('auditDepartmentsBreakdownList');
    if (deptContainer) {
      deptContainer.innerHTML = '';
      if (!data.departments_breakdown || data.departments_breakdown.length === 0) {
        deptContainer.innerHTML = '<div style="color: #64748b; font-size: 0.8rem; text-align: center; padding: 1rem;">No hay registros departamentales en esta selección.</div>';
      } else {
        data.departments_breakdown.forEach(d => {
          const item = document.createElement('div');
          item.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.6rem 0.85rem; display: flex; justify-content: space-between; align-items: center;';
          item.innerHTML = `
            <div>
              <div style="font-weight: 700; font-size: 0.8rem; color: #0f172a;">${d.department_name}</div>
              <div style="font-size: 0.7rem; color: #64748b;">${d.workers_count} trabajadores · ${d.combos_count} combos despachados</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 800; font-size: 0.85rem; color: #16a34a;">${d.total_tons} t</div>
              <div style="font-size: 0.68rem; color: #64748b;">alimentos</div>
            </div>
          `;
          deptContainer.appendChild(item);
        });
      }
    }
  } catch (err) {
    console.error('Error cargando estadísticas de auditoría:', err);
  }
};

window.loadAuditDeliveries = async function() {
  const campaignId = document.getElementById('auditCampaignFilter')?.value || 'all';
  const method = document.getElementById('auditMethodFilter')?.value || '';
  const search = document.getElementById('auditSearchInput')?.value || '';

  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;

  try {
    const data = await API.get(`/api/v1/admin/deliveries?campaign_id=${encodeURIComponent(campaignId)}&method=${encodeURIComponent(method)}&search=${encodeURIComponent(search)}`);
    tbody.innerHTML = '';

    if (!data.deliveries || data.deliveries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #64748b;">No se encontraron registros de entregas para esta búsqueda o jornada.</td></tr>';
      return;
    }

    data.deliveries.forEach(d => {
      const tr = document.createElement('tr');
      
      let methodBadge = '';
      if (d.verification_method === 'passkey_qr') {
        methodBadge = '<span class="badge badge-passkey">📱 QR Celular</span>';
      } else if (d.verification_method === 'nfc_card') {
        methodBadge = '<span class="badge badge-nfc">💳 Tarjeta Física NFC</span>';
      } else if (d.verification_method === 'supervisor_daily_qr') {
        methodBadge = '<span class="badge" style="background:#0284c7; color:#fff;">🔑 QR Supervisor Diario</span>';
      } else {
        methodBadge = '<span class="badge badge-override">⚠️ Liberación Supervisor</span>';
      }

      const offlineBadge = d.is_offline_sync 
        ? '<span class="badge badge-offline">Offline Sync</span>' 
        : '<span class="badge badge-passkey">Directo</span>';

      const authBy = d.supervisor_name 
        ? `<strong style="color: #f59e0b;">${d.supervisor_name}</strong><br><small style="color: var(--text-dim);">${d.override_reason || 'Supervisión'}</small>`
        : (d.operator_name || 'Despachador Autorizado');

      const signatureSnippet = d.signature_proof 
        ? `<span class="text-mono" style="font-size: 0.65rem; color: #10b981;" title="${d.signature_proof}">Verificado: #${d.delivery_id ? d.delivery_id.substring(0, 8).toUpperCase() : 'OK'}</span>`
        : '<span style="font-size: 0.7rem; color: var(--text-dim);">N/A (NFC/Manual)</span>';

      const weightBadge = d.weight_kg ? `<span style="display:inline-block; font-size:0.7rem; font-weight:700; color:#15803d; background:#dcfce7; padding:1px 5px; border-radius:4px; margin-left:4px;">${d.weight_kg} kg</span>` : '';
      const campName = d.campaign_name || 'Jornada Regular';

      tr.innerHTML = `
        <td class="text-mono" style="font-size: 0.75rem;">${d.id.substring(0, 14)}...</td>
        <td style="font-size: 0.78rem;">
          <strong>${campName}</strong><br>
          <span style="color: #64748b; font-size: 0.72rem;">${new Date(d.delivered_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
        </td>
        <td>
          <strong>${d.worker_name}</strong><br>
          <span class="text-mono" style="font-size: 0.72rem; color: #0284c7; font-weight: 600;">${d.worker_document}</span>
        </td>
        <td style="font-size: 0.78rem; color: #475569;">
          ${d.department_name || 'Sede Principal'}
        </td>
        <td>
          <strong>${d.combo_name}</strong> ${weightBadge}
        </td>
        <td>${methodBadge}</td>
        <td>${offlineBadge}</td>
        <td>${authBy}</td>
        <td>${signatureSnippet}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error cargando auditoría de entregas:', err);
  }
};

window.openSecurityDossier = async function(workerId) {
  try {
    const data = await API.get(`/api/v1/admin/workers/${workerId}/security-dossier`);
    const { worker, passkeys, nfcCards } = data;

    const modal = document.getElementById('securityDossierModalBackdrop');
    const content = document.getElementById('dossierContent');
    if (!modal || !content) return;

    let passkeysHtml = passkeys.length === 0 ? '<p style="color: var(--text-dim);">No tiene passkeys enroladas.</p>' : '';
    passkeys.forEach(p => {
      passkeysHtml += `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; color: #0f172a;">📱 ${p.device_name}</div>
            <div class="text-mono" style="font-size: 0.7rem; color: #64748b;">${p.credential_id}</div>
            <div style="font-size: 0.7rem; color: #475569;">Firmas emitidas: ${p.sign_count} &middot; Enrolado: ${new Date(p.enrolled_at).toLocaleDateString()}</div>
          </div>
          <div>
            ${p.status === 'active' 
              ? `<button class="btn btn-danger" style="font-size: 0.7rem; padding: 0.3rem 0.6rem;" onclick="revokePasskey('${p.credential_id}', '${worker.id}')">Revocar (Extravío)</button>`
              : '<span class="badge badge-revoked">Revocada</span>'}
          </div>
        </div>
      `;
    });

    let nfcHtml = nfcCards.length === 0 ? '<p style="color: #64748b;">Sin tarjetas NFC asociadas.</p>' : '';
    nfcCards.forEach(n => {
      nfcHtml += `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div class="text-mono" style="font-weight: 700; color: #0284c7;">💳 UID: ${n.card_uid}</div>
            <div style="font-size: 0.7rem; color: #64748b;">Emitida: ${new Date(n.issued_at).toLocaleDateString()}</div>
          </div>
          <span class="badge ${n.status === 'active' ? 'badge-nfc' : 'badge-revoked'}">${n.status.toUpperCase()}</span>
        </div>
      `;
    });

    let dossierBadge = '<span class="badge badge-activo">🏢 Funcionario Activo</span>';
    if (worker.worker_type === 'jubilado') {
      dossierBadge = '<span class="badge badge-jubilado">👴 Personal Jubilado</span>';
    } else if (worker.worker_type === 'contratado') {
      dossierBadge = '<span class="badge badge-contratado">📋 Personal Contratado</span>';
    }

    content.innerHTML = `
      <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.85rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <h4 style="color: #0f172a; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            ${worker.full_name}
            ${dossierBadge}
          </h4>
          <div style="font-size: 0.75rem; color: #475569; margin-top: 0.2rem;">Cédula: <span class="text-mono" style="color: #0f172a; font-weight: 700;">${worker.document_id}</span> &middot; Depto: ${worker.department_name || 'N/A'}</div>
        </div>
      </div>

      <div>
        <h5 style="font-size: 0.85rem; font-weight: 700; color: #10b981; margin-bottom: 0.5rem;">🔐 Credenciales Passkey (Hardware Enclave):</h5>
        ${passkeysHtml}
      </div>

      <div>
        <h5 style="font-size: 0.85rem; font-weight: 700; color: #06b6d4; margin-bottom: 0.5rem;">💳 Tarjetas Físicas NFC (Contingencia):</h5>
        ${nfcHtml}
        <div class="input-group" style="margin-top: 0.5rem;">
          <input id="assignNfcUidInput" type="text" class="form-input text-mono" placeholder="Nuevo UID (ej: 04E1F2A3B4)" style="font-size: 0.75rem;">
          <button class="btn btn-cyan" style="font-size: 0.75rem;" onclick="assignNfcCard('${worker.id}')">Vincular Nueva NFC</button>
        </div>
      </div>
    `;

    modal.classList.add('active');
  } catch (err) {
    window.showToast('Error al abrir expediente: ' + err.message, 'error');
  }
};

window.revokePasskey = async function(credentialId, workerId) {
  if (!confirm('¿Desea revocar esta credencial Passkey inmediatamente? El dispositivo no podrá firmar más entregas.')) return;
  try {
    const data = await API.post(`/api/v1/admin/credentials/${encodeURIComponent(credentialId)}/revoke`, {
      reason: 'Reporte de extravío por administrador'
    });
    if (data.status === 'success') {
      window.showToast('Credencial revocada con éxito.', 'success');
      openSecurityDossier(workerId);
      refreshPortalData();
    }
  } catch (err) {
    window.showToast('Error revocando credencial: ' + err.message, 'error');
  }
};

window.assignNfcCard = async function(workerId) {
  const input = document.getElementById('assignNfcUidInput');
  const uid = input?.value.trim();
  if (!uid) return window.showToast('Ingrese un UID de tarjeta', 'warning');

  try {
    const data = await API.post(`/api/v1/admin/workers/${workerId}/assign-nfc`, {
      card_uid: uid,
      issued_by: STATE.operatorId
    });
    if (data.status === 'success') {
      window.showToast('Tarjeta NFC asignada exitosamente.', 'success');
      openSecurityDossier(workerId);
      refreshPortalData();
    }
  } catch (err) {
    window.showToast('Error asignando tarjeta NFC: ' + err.message, 'error');
  }
};

// Wire up events
document.addEventListener('DOMContentLoaded', () => {
  let searchWorkerTimeout;
  document.getElementById('searchWorkerInput')?.addEventListener('input', () => {
    clearTimeout(searchWorkerTimeout);
    searchWorkerTimeout = setTimeout(loadWorkersDirectory, 250);
  });

  document.getElementById('filterRoleSelect')?.addEventListener('change', loadWorkersDirectory);
  document.getElementById('filterWorkerTypeSelect')?.addEventListener('change', loadWorkersDirectory);
  document.getElementById('filterShiftSelect')?.addEventListener('change', loadWorkersDirectory);
  document.getElementById('filterStatusSelect')?.addEventListener('change', loadWorkersDirectory);

  document.getElementById('btnPrevWorkersPage')?.addEventListener('click', () => {
    if (currentWorkersPage > 1) {
      currentWorkersPage--;
      renderWorkersPage();
    }
  });

  document.getElementById('btnNextWorkersPage')?.addEventListener('click', () => {
    const totalPages = Math.ceil(allFilteredWorkers.length / WORKERS_PER_PAGE);
    if (currentWorkersPage < totalPages) {
      currentWorkersPage++;
      renderWorkersPage();
    }
  });

  document.getElementById('auditCampaignFilter')?.addEventListener('change', async () => {
    await loadAuditStats();
    await loadAuditDeliveries();
  });

  document.getElementById('auditMethodFilter')?.addEventListener('change', loadAuditDeliveries);

  let auditSearchTimeout;
  document.getElementById('auditSearchInput')?.addEventListener('input', () => {
    clearTimeout(auditSearchTimeout);
    auditSearchTimeout = setTimeout(loadAuditDeliveries, 300);
  });

  document.getElementById('btnExportAuditCsv')?.addEventListener('click', () => {
    const campaignId = document.getElementById('auditCampaignFilter')?.value || 'all';
    window.location.href = `/api/v1/admin/export?format=csv&campaign_id=${encodeURIComponent(campaignId)}`;
  });
});
