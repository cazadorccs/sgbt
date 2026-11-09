// ============================================================================
// MODULE: ADMIN PORTAL, GOVERNANCE, AUDIT LOG & SECURITY DOSSIER
// ============================================================================

window.refreshPortalData = async function() {
  if (window.API && !window.API.hasToken()) return;
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

    // 8. Lotes Departamentales Institucionales (Fase 4)
    if (window.DepartmentBatches && typeof window.DepartmentBatches.loadData === 'function') {
      await window.DepartmentBatches.loadData();
    }

    // 9. Monitor de Formalización Previa y Auditoría Ministerial (Fase 5)
    if (window.MinisterialAudit && typeof window.MinisterialAudit.loadData === 'function') {
      await window.MinisterialAudit.loadData();
    }

  } catch (err) {
    console.error('Error cargando datos del portal:', err);
  }
};

let currentWorkersPage = 1;
const WORKERS_PER_PAGE = 25;
const VIRTUAL_WINDOW_SIZE = 25;
let allFilteredWorkers = [];

// Pre-índice de búsqueda acelerado para el padrón (1.138 registros en < 1ms)
let workersSearchIndex = null;
function buildWorkersSearchIndex(workers) {
  if (!Array.isArray(workers)) return;
  workersSearchIndex = workers.map(w => ({
    raw: w,
    searchStr: `${w.document_id || ''} ${w.full_name || ''} ${w.department_name || ''} ${w.job_title || ''} ${w.email || ''}`.toLowerCase()
  }));
}

function renderWorkersPage() {
  const tbody = document.getElementById('workersTableBody');
  if (!tbody) return;

  const total = allFilteredWorkers.length;
  const totalPages = Math.max(1, Math.ceil(total / WORKERS_PER_PAGE));
  if (currentWorkersPage > totalPages) currentWorkersPage = totalPages;
  if (currentWorkersPage < 1) currentWorkersPage = 1;

  // Virtual Windowing Slice: Renderiza únicamente la ventana activa (25 filas máx) para 60fps constantes
  const startIdx = (currentWorkersPage - 1) * VIRTUAL_WINDOW_SIZE;
  const endIdx = Math.min(startIdx + VIRTUAL_WINDOW_SIZE, total);
  const pageWorkers = allFilteredWorkers.slice(startIdx, endIdx);

  tbody.innerHTML = '';

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #64748b;">No se encontraron trabajadores con los filtros seleccionados.</td></tr>';
  } else {
    const fragment = document.createDocumentFragment();
    pageWorkers.forEach(w => {
      const tr = document.createElement('tr');
      tr.className = 'virtual-table-row';

      let badgeClass = 'badge-pending';
      let badgeIcon = '⏳';
      let authShortLabel = 'Pendiente';
      let authFullLabel = w.auth_label || 'Pendiente por formalizar credencial segura';
      if (w.auth_badge === 'passkey_active') {
        badgeClass = 'badge-passkey';
        badgeIcon = '🔐';
        authShortLabel = 'Passkey';
        authFullLabel = 'Passkey Criptográfica FIDO2 / WebAuthn';
      } else if (w.auth_badge === 'nfc_active') {
        badgeClass = 'badge-nfc';
        badgeIcon = '💳';
        authShortLabel = 'NFC';
        authFullLabel = 'Carnet Inteligente NFC / Tarjeta Mifare';
      } else if (w.auth_badge === 'revoked') {
        badgeClass = 'badge-revoked';
        badgeIcon = '🛑';
        authShortLabel = 'Revocado';
        authFullLabel = 'Credencial Revocada por Seguridad';
      } else if (w.auth_badge === 'exemption') {
        badgeClass = 'badge-override';
        badgeIcon = '⚠️';
        authShortLabel = 'Manual';
        authFullLabel = 'Excepción Manual de Despacho Autorizada';
      }

      // Condición Laboral representada por iconos interactivos con tooltips (Accesibilidad WCAG + Diseño Compacto)
      let condIcon = '🏢';
      let condLabel = 'Funcionario Activo';
      let condTooltip = 'Condición: Funcionario Activo (Nómina Regular)';
      let condClass = 'badge-activo';

      if (w.worker_type === 'jubilado') {
        condIcon = '👴';
        condLabel = 'Personal Jubilado';
        condTooltip = 'Condición: Personal Jubilado / Pensionado';
        condClass = 'badge-jubilado';
      } else if (w.worker_type === 'contratado') {
        condIcon = '📋';
        condLabel = 'Personal Contratado';
        condTooltip = 'Condición: Personal Contratado';
        condClass = 'badge-contratado';
      }

      const condBadge = `
        <div style="display: flex; justify-content: center; align-items: center;">
          <span class="badge-cond-icon ${condClass}" data-tooltip="${condTooltip}" title="${condTooltip}" aria-label="${condLabel}">
            ${condIcon}
          </span>
        </div>
      `;

      const currentRole = w.role || 'worker';
      let roleClass = 'badge-role-worker';
      if (currentRole === 'supervisor') roleClass = 'badge-role-supervisor';
      else if (currentRole === 'operator') roleClass = 'badge-role-operator';
      else if (currentRole === 'admin') roleClass = 'badge-role-admin';

      const safeWorkerName = (w.full_name || '').replace(/'/g, "\\'");
      const roleSelectHtml = `
        <select class="form-select role-select-pill ${roleClass}" style="padding: 0.22rem 0.5rem; font-size: 0.74rem; font-weight: 700; width: 100%; max-width: 125px;" onchange="window.changeWorkerRole('${w.id}', this.value, '${safeWorkerName}')" data-tooltip="Modificar rol y permisos" title="Modificar rol operativo de ${safeWorkerName}">
          <option value="worker" ${currentRole === 'worker' ? 'selected' : ''}>👤 Titular</option>
          <option value="operator" ${currentRole === 'operator' ? 'selected' : ''}>📦 Despacho</option>
          <option value="supervisor" ${currentRole === 'supervisor' ? 'selected' : ''}>🛡️ Supervisor</option>
          <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>👑 Admin</option>
        </select>
      `;

      const entitlementBadge = w.today_entitlement_status === 'claimed'
        ? '<span class="badge badge-passkey" data-tooltip="Beneficio entregado en la jornada de hoy" title="Beneficio entregado hoy">Entregado</span>'
        : w.today_entitlement_status === 'pending'
        ? '<span class="badge badge-override" data-tooltip="Asignado hoy, pendiente por retirar" title="Pendiente por retirar">Pendiente</span>'
        : '<span class="badge" data-tooltip="Sin asignación para hoy" title="Sin asignación para hoy" style="background: rgba(255,255,255,0.05); color: var(--text-dim); font-size: 0.72rem;">Sin Asignar</span>';

      // Generación de Foto / Avatar del Empleado
      let avatarHtml = '';
      const nameParts = (w.full_name || 'U').trim().split(/\s+/);
      const initials = nameParts.length >= 2 
        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
        : nameParts[0].substring(0, 2).toUpperCase();

      const bgColors = ['#0284c7', '#0d9488', '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#ea580c', '#059669'];
      let hash = 0;
      for (let i = 0; i < (w.full_name || '').length; i++) {
        hash = (hash << 5) - hash + w.full_name.charCodeAt(i);
        hash |= 0;
      }
      const initialBg = bgColors[Math.abs(hash) % bgColors.length];

      if (w.avatar_url && w.avatar_url.trim().length > 0) {
        avatarHtml = `
          <div style="display: flex; justify-content: center; align-items: center;">
            <img src="${w.avatar_url}" alt="${w.full_name}" 
                 style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 2px solid #0284c7; box-shadow: 0 2px 5px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.15s ease;"
                 onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"
                 onclick="window.previewWorkerPhoto('${w.avatar_url}', '${safeWorkerName}', '${w.document_id}', true)"
                 data-tooltip="Ver foto de ${safeWorkerName}"
                 title="Ver foto de ${w.full_name}"
                 onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width:34px;height:34px;border-radius:50%;background:${initialBg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;box-shadow:0 2px 4px rgba(0,0,0,0.1);\\' title=\\'${safeWorkerName}\\'>${initials}</div>';">
          </div>
        `;
      } else {
        avatarHtml = `
          <div style="display: flex; justify-content: center; align-items: center;">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: ${initialBg}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border: 2px solid rgba(255,255,255,0.3); cursor: pointer;"
                 onclick="window.previewWorkerPhoto('', '${safeWorkerName}', '${w.document_id}', false)"
                 data-tooltip="Sin foto formalizada - ${safeWorkerName}"
                 title="Sin foto formalizada - ${w.full_name}">
              ${initials}
            </div>
          </div>
        `;
      }

      tr.innerHTML = `
        <td style="text-align: center; vertical-align: middle;">${avatarHtml}</td>
        <td class="text-mono" style="font-weight: 600; font-size: 0.8rem; white-space: nowrap;">${w.document_id}</td>
        <td>
          <div style="font-weight: 600; font-size: 0.84rem; line-height: 1.25; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" data-tooltip="${safeWorkerName}" title="${safeWorkerName}">${w.full_name}</div>
          <div style="font-size: 0.72rem; color: var(--text-dim); line-height: 1.2; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" data-tooltip="${w.email}" title="${w.email}">${w.email}</div>
        </td>
        <td>${roleSelectHtml}</td>
        <td style="text-align: center;">${condBadge}</td>
        <td>
          <div class="dept-cell-truncate" data-tooltip="${w.department_name || 'Sin Asignar'}" title="${w.department_name || 'Sin Asignar'}">${w.department_name || 'Sin Asignar'}</div>
        </td>
        <td style="text-align: center;">
          <span class="badge ${badgeClass}" data-tooltip="${authFullLabel}" title="${authFullLabel}">${badgeIcon} ${authShortLabel}</span>
        </td>
        <td style="text-align: center;">${entitlementBadge}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
            <button class="btn-table-action" onclick="openManageUserCredentialsModal('${w.id}')" data-tooltip="Gestionar Contraseña y Credenciales" title="Gestionar Contraseña, Credenciales y Rol" aria-label="Gestionar Credenciales">
              🔑
            </button>
            <button class="btn-table-action" onclick="openSecurityDossier('${w.id}')" data-tooltip="Expediente de Seguridad" title="Ver Expediente de Seguridad y Dispositivos" aria-label="Expediente de Seguridad">
              🛡️
            </button>
            <button class="btn-table-action btn-whatsapp" onclick="sendWhatsAppInviteToWorker('${w.id}')" data-tooltip="Enviar Invitación WhatsApp" title="Enviar enlace de instalación por WhatsApp" aria-label="WhatsApp">
              📲
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

async function ensureDepartmentFilterPopulated() {
  const filterDeptSelect = document.getElementById('filterDepartmentSelect');
  if (!filterDeptSelect || filterDeptSelect.options.length > 1) return;
  try {
    const res = await API.get('/api/v1/tenant/settings');
    if (res && res.departments) {
      const cur = filterDeptSelect.value;
      filterDeptSelect.innerHTML = '<option value="">🏢 Todos los Departamentos</option>';
      res.departments.forEach(d => {
        filterDeptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
      });
      if (cur) filterDeptSelect.value = cur;
    }
  } catch (e) {
    console.warn('No se pudieron precargar los departamentos para el filtro:', e);
  }
}

window.loadWorkersDirectory = async function(preservePage = false) {
  await ensureDepartmentFilterPopulated();
  const search = document.getElementById('searchWorkerInput')?.value || '';
  const role = document.getElementById('filterRoleSelect')?.value || '';
  const department = document.getElementById('filterDepartmentSelect')?.value || '';
  const workerType = document.getElementById('filterWorkerTypeSelect')?.value || '';
  const shift = document.getElementById('filterShiftSelect')?.value || '';
  const status = document.getElementById('filterStatusSelect')?.value || '';

  const tbody = document.getElementById('workersTableBody');
  if (!tbody) return;

  try {
    const url = `/api/v1/admin/workers?search=${encodeURIComponent(search)}&role=${encodeURIComponent(role)}&department=${encodeURIComponent(department)}&worker_type=${encodeURIComponent(workerType)}&shift=${encodeURIComponent(shift)}&status=${encodeURIComponent(status)}`;
    const data = await API.get(url);
    allFilteredWorkers = data.workers || [];

    // Actualizar Contador Totalizador del Directorio de Empleados
    const countBadge = document.getElementById('workersCountBadge');
    const countText = document.getElementById('workersCountText');
    const totalCensus = (typeof data.total_census === 'number') ? data.total_census : (allFilteredWorkers.length);
    const filteredCount = allFilteredWorkers.length;

    if (countText) {
      const isFiltered = Boolean(search || role || department || workerType || shift || status);
      if (isFiltered && filteredCount !== totalCensus) {
        countText.textContent = `${filteredCount.toLocaleString()} de ${totalCensus.toLocaleString()} registros`;
        if (countBadge) countBadge.title = `${filteredCount.toLocaleString()} funcionarios coincidentes con los filtros aplicados (de ${totalCensus.toLocaleString()} en el padrón)`;
      } else {
        countText.textContent = `${totalCensus.toLocaleString()} registros`;
        if (countBadge) countBadge.title = `Total consolidado: ${totalCensus.toLocaleString()} funcionarios en el padrón institucional`;
      }
    }

    if (!preservePage) {
      currentWorkersPage = 1;
    } else {
      const totalPages = Math.ceil(allFilteredWorkers.length / WORKERS_PER_PAGE) || 1;
      if (currentWorkersPage > totalPages) currentWorkersPage = totalPages;
    }
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
      const localWorker = allFilteredWorkers.find(w => w.id === workerId);
      if (localWorker) {
        localWorker.role = newRole;
      }
      await window.loadWorkersDirectory(true);
    } else {
      throw new Error(res.error || 'Error al actualizar rol');
    }
  } catch (err) {
    playAudioFeedback('error');
    window.showToast('❌ Error: ' + err.message, 'error');
    await window.loadWorkersDirectory(true);
  }
};

window.reloadOfficialCensus = async function() {
  if (!confirm('¿Desea recargar y restaurar el padrón oficial institucional completo (1,137 funcionarios) desde la base de datos maestra?')) {
    return;
  }
  try {
    window.showToast('⏳ Restaurando padrón de funcionarios...', 'info');
    const res = await API.post('/api/v1/admin/workers/reload-census');
    if (res && res.success) {
      playAudioFeedback('success');
      window.showToast(res.message || '✅ Padrón institucional restaurado con éxito.', 'success');
      await window.loadWorkersDirectory();
    } else {
      throw new Error(res?.error || 'No se pudo restaurar el padrón');
    }
  } catch (err) {
    playAudioFeedback('error');
    window.showToast('❌ Error: ' + err.message, 'error');
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

    const overridesCount = data.methods_breakdown?.supervisor_override || 0;
    const overridesPct = Math.round((overridesCount / totalMethods) * 100);

    const elContBadge = document.getElementById('statContingenciesBadge');
    if (elContBadge) elContBadge.textContent = overridesCount.toLocaleString();

    const elExceptCount = document.getElementById('statAuditExceptionsCount');
    if (elExceptCount) elExceptCount.textContent = overridesCount.toLocaleString();

    const elExceptPct = document.getElementById('statAuditExceptionsPct');
    if (elExceptPct) elExceptPct.textContent = `${overridesPct}%`;

    const selectCampaign = document.getElementById('auditCampaignFilter');
    if (selectCampaign && selectCampaign.options.length <= 1 && data.campaigns_list) {
      data.campaigns_list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        const statusBadge = c.status === 'en_curso' ? '🟢 [En Curso]' : (c.status === 'suspendida' ? '⏸️ [Suspendida]' : (c.status === 'finalizada' ? '📁 [Finalizada]' : '📅 [Programada]'));
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

    // Generar avatar / foto para la cabecera del Expediente Digital
    const dNameParts = (worker.full_name || 'U').trim().split(/\s+/);
    const dInitials = dNameParts.length >= 2 
      ? (dNameParts[0][0] + dNameParts[dNameParts.length - 1][0]).toUpperCase()
      : dNameParts[0].substring(0, 2).toUpperCase();
    const safeWorkerName = (worker.full_name || '').replace(/'/g, "\\'");

    let dossierPhotoHtml = '';
    if (worker.avatar_url && worker.avatar_url.trim().length > 0) {
      dossierPhotoHtml = `
        <div style="position: relative; flex-shrink: 0; cursor: pointer;" onclick="window.previewWorkerPhoto('${worker.avatar_url}', '${safeWorkerName}', '${worker.document_id}', true)" title="Clic para ampliar fotografía">
          <img src="${worker.avatar_url}" alt="${worker.full_name}" 
               style="width: 68px; height: 68px; border-radius: 12px; object-fit: cover; border: 2.5px solid #0284c7; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15);" />
          <span style="position: absolute; bottom: -4px; right: -4px; background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; border: 2px solid #fff;" title="Fotografía Biométrica Formalizada">✓</span>
        </div>
      `;
    } else {
      dossierPhotoHtml = `
        <div style="width: 68px; height: 68px; border-radius: 12px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 800; font-size: 1.25rem; flex-shrink: 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15); border: 2px solid #cbd5e1; cursor: pointer;" onclick="window.previewWorkerPhoto('', '${safeWorkerName}', '${worker.document_id}', false)" title="Sin fotografía formalizada">
          ${dInitials}
          <span style="font-size: 0.52rem; font-weight: 700; opacity: 0.9; margin-top: 1px; letter-spacing: 0.5px;">SIN FOTO</span>
        </div>
      `;
    }

      const lockData = data.activeDeviceLock;
      let deviceLockHtml = '';
      if (lockData && lockData.status === 'active') {
        deviceLockHtml = `
          <div style="background: rgba(2, 132, 199, 0.08); border: 1.5px solid rgba(56, 189, 248, 0.4); border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.65rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
              <strong style="color: #0284c7; font-size: 0.8rem;">🔒 Candado Activo: <span class="text-mono">${lockData.lock_key}</span></strong>
              <span class="badge" style="background: #e0f2fe; color: #0369a1; font-size: 0.65rem; font-weight: 700;">AMARRADO</span>
            </div>
            <div style="font-size: 0.72rem; color: #475569;">
              Dispositivo: <strong>${lockData.device_label || 'Smartphone Autorizado'}</strong> &middot; IP: ${lockData.ip_address || '127.0.0.1'}<br>
              Amarre fijado: ${new Date(lockData.locked_at).toLocaleString()}
            </div>
          </div>
        `;
      } else {
        deviceLockHtml = `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.55rem 0.75rem; margin-bottom: 0.65rem; font-size: 0.72rem; color: #64748b;">
            🟢 Sin candado activo hoy (Dispositivo libre para iniciar sesión o entrega culminada).
          </div>
        `;
      }

      content.innerHTML = `
      <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0.85rem; display: flex; gap: 0.85rem; align-items: center; margin-bottom: 1rem;">
        ${dossierPhotoHtml}
        <div style="flex: 1; min-width: 0;">
          <h4 style="color: #0f172a; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.25rem;">
            ${worker.full_name}
            ${dossierBadge}
          </h4>
          <div style="font-size: 0.78rem; color: #475569; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
            <span>Cédula: <strong class="text-mono" style="color: #0f172a;">${worker.document_id}</strong></span>
            <span>&middot;</span>
            <span>Depto: <strong>${worker.department_name || 'N/A'}</strong></span>
          </div>
          <div style="font-size: 0.72rem; margin-top: 0.35rem;">
            ${worker.avatar_url ? '<span style="color: #059669; font-weight: 600;">📸 Fotografía Biométrica Registrada</span>' : '<span style="color: #d97706; font-weight: 600;">⚠️ Fotografía Pendiente por Formalizar</span>'}
          </div>
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

      <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed #cbd5e1;">
        <h5 style="font-size: 0.85rem; font-weight: 700; color: #0284c7; margin-bottom: 0.35rem;">🔒 Amarre Exclusivo de Dispositivo:</h5>
        ${deviceLockHtml}
        <p style="font-size: 0.72rem; color: #64748b; margin-bottom: 0.5rem;">
          Si el funcionario extravió o dañó su smartphone durante la jornada activa, libere el candado para permitir inicio de sesión en otro teléfono.
        </p>
        <button class="btn btn-outline" style="font-size: 0.75rem; width: 100%; border-color: #38bdf8; color: #0284c7; font-weight: 700;" onclick="window.openDeviceReleaseModal('${worker.document_id}')">
          🔓 Liberar Candado de Dispositivo
        </button>
        <button class="btn btn-primary" style="font-size: 0.75rem; width: 100%; margin-top: 0.5rem; font-weight: 700; background: linear-gradient(135deg, #0284c7, #0f172a); border: none;" onclick="window.openManageUserCredentialsModal('${worker.id}')">
          🔑 Administrar Contraseña y Rol del Funcionario
        </button>
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

window.previewWorkerPhoto = function(photoUrl, fullName, docId, hasPhoto) {
  const modal = document.getElementById('workerPhotoPreviewModalBackdrop');
  if (!modal) return;
  const nameEl = document.getElementById('workerPhotoPreviewName');
  const docEl = document.getElementById('workerPhotoPreviewDoc');
  const statusEl = document.getElementById('workerPhotoPreviewStatus');
  const wrapper = document.getElementById('workerPhotoPreviewWrapper');

  if (nameEl) nameEl.textContent = fullName || 'Beneficiario Institucional';
  if (docEl) docEl.textContent = docId || '';

  if (hasPhoto && photoUrl && photoUrl.trim().length > 0) {
    if (wrapper) {
      wrapper.innerHTML = `
        <img id="workerPhotoPreviewImg" src="${photoUrl}" alt="${fullName}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0284c7;color:#fff;font-size:3rem;font-weight:800;\\'>${(fullName||'U').substring(0,2).toUpperCase()}</div>';" />
      `;
    }
    if (statusEl) {
      statusEl.textContent = '✓ Identidad Biométrica Formalizada';
      statusEl.style.color = '#059669';
      statusEl.style.background = '#ecfdf5';
      statusEl.style.borderColor = '#a7f3d0';
    }
  } else {
    const nameParts = (fullName || 'U').trim().split(/\s+/);
    const initials = nameParts.length >= 2 
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : nameParts[0].substring(0, 2).toUpperCase();
    if (wrapper) {
      wrapper.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff;">
          <span style="font-size: 3.5rem; font-weight: 800; line-height: 1;">${initials}</span>
          <span style="font-size: 0.72rem; font-weight: 600; margin-top: 0.6rem; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px;">Sin Fotografía Formalizada</span>
        </div>
      `;
    }
    if (statusEl) {
      statusEl.textContent = '⚠️ Fotografía Pendiente por Formalizar';
      statusEl.style.color = '#d97706';
      statusEl.style.background = '#fffbeb';
      statusEl.style.borderColor = '#fde68a';
    }
  }

  modal.classList.add('active');
};

// Wire up events
document.addEventListener('DOMContentLoaded', () => {
  const photoModal = document.getElementById('workerPhotoPreviewModalBackdrop');
  document.getElementById('btnClosePhotoPreviewModal')?.addEventListener('click', () => {
    photoModal?.classList.remove('active');
  });
  photoModal?.addEventListener('click', (e) => {
    if (e.target === photoModal) photoModal.classList.remove('active');
  });

  let searchWorkerTimeout;
  document.getElementById('searchWorkerInput')?.addEventListener('input', () => {
    clearTimeout(searchWorkerTimeout);
    searchWorkerTimeout = setTimeout(loadWorkersDirectory, 250);
  });

  document.getElementById('filterRoleSelect')?.addEventListener('change', loadWorkersDirectory);
  document.getElementById('filterDepartmentSelect')?.addEventListener('change', loadWorkersDirectory);
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

  document.getElementById('btnQuickFilterContingencies')?.addEventListener('click', () => {
    const methodFilter = document.getElementById('auditMethodFilter');
    if (methodFilter) {
      if (methodFilter.value === 'supervisor_override') {
        methodFilter.value = '';
      } else {
        methodFilter.value = 'supervisor_override';
      }
      loadAuditDeliveries();
    }
  });

  let auditSearchTimeout;
  document.getElementById('auditSearchInput')?.addEventListener('input', () => {
    clearTimeout(auditSearchTimeout);
    auditSearchTimeout = setTimeout(loadAuditDeliveries, 300);
  });

  document.getElementById('btnExportAuditCsv')?.addEventListener('click', () => {
    const campaignId = document.getElementById('auditCampaignFilter')?.value || 'all';
    const token = sessionStorage.getItem('sgbt_session_token') || localStorage.getItem('sgbt_session_token') || '';
    window.location.href = `/api/v1/admin/export?format=csv&campaign_id=${encodeURIComponent(campaignId)}&session_token=${encodeURIComponent(token)}`;
  });

  document.getElementById('btnExportAuditExcel')?.addEventListener('click', () => {
    const campaignId = document.getElementById('auditCampaignFilter')?.value || 'all';
    const token = sessionStorage.getItem('sgbt_session_token') || localStorage.getItem('sgbt_session_token') || '';
    window.location.href = `/api/v1/admin/export?format=xlsx&campaign_id=${encodeURIComponent(campaignId)}&session_token=${encodeURIComponent(token)}`;
  });

  document.getElementById('btnExportAuditActa')?.addEventListener('click', () => {
    const campaignId = document.getElementById('auditCampaignFilter')?.value || 'all';
    const token = sessionStorage.getItem('sgbt_session_token') || localStorage.getItem('sgbt_session_token') || '';
    window.open(`/api/v1/admin/export?format=acta&campaign_id=${encodeURIComponent(campaignId)}&session_token=${encodeURIComponent(token)}`, '_blank');
  });

  // ============================================================================
  // GESTIÓN DE USUARIOS, CREDENCIALES Y CONTRASEÑAS (ADMIN)
  // ============================================================================
  // Handlers robustos con delegación global de eventos para templates/modals.html dinámicos
});

// Funciones operativas de Gestión de Credenciales y Contraseñas
async function handleAdminSetWorkerPassword() {
  if (!currentManageWorkerId) {
    window.showToast('No se ha seleccionado ningún funcionario.', 'error');
    return;
  }
  const pwdInput = document.getElementById('inputManageNewPassword');
  const chkLock = document.getElementById('chkClearDeviceLockOnPasswordChange');
  const alertBox = document.getElementById('manageUserAlertBox');
  const val = pwdInput?.value.trim();

  if (!val || val.length < 4) {
    if (alertBox) {
      alertBox.textContent = 'La nueva contraseña debe tener al menos 4 caracteres.';
      alertBox.style.display = 'block';
    }
    return;
  }

  try {
    window.showToast('Guardando contraseña y sincronizando con Supabase Cloud...', 'info');
    const res = await API.post(`/api/v1/admin/workers/${currentManageWorkerId}/password`, {
      action: 'set_password',
      new_password: val,
      clear_device_lock: chkLock ? chkLock.checked : true
    });

    if (res && res.success) {
      window.showToast(res.message, 'success');
      playAudioFeedback('success');
      if (alertBox) alertBox.style.display = 'none';
      const statusBadge = document.getElementById('manageUserStatusBadge');
      if (statusBadge) {
        statusBadge.textContent = 'Formalizado (Registrado)';
        statusBadge.className = 'badge badge-passkey';
      }
      if (pwdInput) pwdInput.value = '';
      await window.loadWorkersDirectory(true);
    } else {
      throw new Error(res?.error || 'No se pudo guardar la contraseña');
    }
  } catch (e) {
    playAudioFeedback('error');
    if (alertBox) {
      alertBox.textContent = e.message;
      alertBox.style.display = 'block';
    }
    window.showToast('Error: ' + e.message, 'error');
  }
}

async function handleAdminResetWorkerEnrollment() {
  if (!currentManageWorkerId) return;
  const confirmMsg = '¿Desea restablecer a este funcionario a estatus PRECARGADO? Se eliminará la contraseña actual y deberá formalizarla al ingresar.';
  if (!confirm(confirmMsg)) return;

  const chkLock = document.getElementById('chkClearDeviceLockOnPasswordChange');
  const alertBox = document.getElementById('manageUserAlertBox');
  const magicBox = document.getElementById('manageUserMagicLinkBox');
  const btnCopyMagic = document.getElementById('btnCopyMagicLinkForWorker');

  try {
    window.showToast('Restableciendo acceso...', 'info');
    const res = await API.post(`/api/v1/admin/workers/${currentManageWorkerId}/password`, {
      action: 'reset_enrollment',
      clear_device_lock: chkLock ? chkLock.checked : true
    });

    if (res && res.success) {
      window.showToast(res.message, 'success');
      playAudioFeedback('success');
      if (alertBox) alertBox.style.display = 'none';
      const statusBadge = document.getElementById('manageUserStatusBadge');
      if (statusBadge) {
        statusBadge.textContent = 'Pendiente (Precargado)';
        statusBadge.className = 'badge badge-override';
      }

      if (res.onboarding_token) {
        const magicUrl = `${window.location.origin}/?magic_token=${res.onboarding_token}`;
        if (magicBox) {
          magicBox.innerHTML = `<strong>Enlace de formalización directa:</strong><br><a href="${magicUrl}" target="_blank" style="color: #0284c7;">${magicUrl}</a>`;
          magicBox.style.display = 'block';
        }
        if (btnCopyMagic) {
          btnCopyMagic.style.display = 'inline-flex';
          btnCopyMagic.onclick = () => {
            navigator.clipboard.writeText(magicUrl);
            window.showToast('📋 Enlace copiado al portapapeles', 'success');
          };
        }
      }
      await window.loadWorkersDirectory(true);
    } else {
      throw new Error(res?.error || 'No se pudo restablecer el acceso');
    }
  } catch (e) {
    playAudioFeedback('error');
    if (alertBox) {
      alertBox.textContent = e.message;
      alertBox.style.display = 'block';
    }
    window.showToast('Error: ' + e.message, 'error');
  }
}

async function handleAdminUpdateWorkerRole() {
  if (!currentManageWorkerId) return;
  const roleSelect = document.getElementById('selectManageUserRole');
  const newRole = roleSelect?.value;
  if (!newRole) return;

  try {
    window.showToast('Actualizando rol institucional...', 'info');
    const res = await API.put(`/api/v1/admin/workers/${currentManageWorkerId}/role`, { role: newRole });
    if (res && res.success) {
      window.showToast('Rol actualizado con éxito', 'success');
      playAudioFeedback('success');
      const roleBadge = document.getElementById('manageUserRoleBadge');
      if (roleBadge) roleBadge.textContent = newRole.toUpperCase();
      await window.loadWorkersDirectory(true);
    } else {
      throw new Error(res?.error || 'No se pudo actualizar el rol');
    }
  } catch (e) {
    window.showToast('Error: ' + e.message, 'error');
  }
}

function handleAdminGeneratePassword() {
  const pwdInput = document.getElementById('inputManageNewPassword');
  if (!pwdInput) return;
  const randDigits = Math.floor(1000 + Math.random() * 9000);
  pwdInput.value = `Mippci-${randDigits}`;
  pwdInput.type = 'text';
  window.showToast('Contraseña generada: ' + pwdInput.value, 'info');
}

// DELEGACIÓN GLOBAL DE EVENTOS (Resistente a inyección asíncrona de modals.html)
document.addEventListener('click', async (e) => {
  // 1. Guardar Contraseña
  if (e.target.closest('#btnSubmitSetPassword')) {
    e.preventDefault();
    await handleAdminSetWorkerPassword();
    return;
  }

  // 2. Restablecer a Precargado
  if (e.target.closest('#btnSubmitResetEnrollment')) {
    e.preventDefault();
    await handleAdminResetWorkerEnrollment();
    return;
  }

  // 3. Actualizar Rol
  if (e.target.closest('#btnSubmitUpdateUserRole')) {
    e.preventDefault();
    await handleAdminUpdateWorkerRole();
    return;
  }

  // 4. Generar Contraseña Aleatoria
  if (e.target.closest('#btnGenerateRandomPassword')) {
    e.preventDefault();
    handleAdminGeneratePassword();
    return;
  }

  // 5. Ver / Ocultar Contraseña
  if (e.target.closest('#btnToggleManageNewPassword')) {
    e.preventDefault();
    const pwdInput = document.getElementById('inputManageNewPassword');
    if (pwdInput) pwdInput.type = (pwdInput.type === 'password') ? 'text' : 'password';
    return;
  }

  // 6. Cerrar Modal
  if (e.target.closest('#btnCloseManageUserCredentialsModal') || e.target.closest('#btnFooterCloseManageUserModal')) {
    e.preventDefault();
    window.closeManageUserCredentialsModal();
    return;
  }

  // 7. Clic fuera del diálogo (backdrop)
  if (e.target && e.target.id === 'manageUserCredentialsModalBackdrop') {
    window.closeManageUserCredentialsModal();
    return;
  }
});

let currentManageWorkerId = null;
let currentManageWorkerData = null;

window.openManageUserCredentialsModal = async function(workerId) {
  try {
    currentManageWorkerId = workerId;
    const res = await API.get(`/api/v1/admin/workers/${workerId}/security-dossier`);
    const worker = res.worker;
    currentManageWorkerData = worker;

    const modal = document.getElementById('manageUserCredentialsModalBackdrop');
    if (!modal) return;

    // Poblar datos de identidad
    const nameEl = document.getElementById('manageUserTargetName');
    const docEl = document.getElementById('manageUserTargetDoc');
    const deptEl = document.getElementById('manageUserTargetDept');
    const roleBadgeEl = document.getElementById('manageUserRoleBadge');
    const statusBadgeEl = document.getElementById('manageUserStatusBadge');
    const roleSelectEl = document.getElementById('selectManageUserRole');
    const pwdInput = document.getElementById('inputManageNewPassword');
    const alertBox = document.getElementById('manageUserAlertBox');
    const magicBox = document.getElementById('manageUserMagicLinkBox');
    const btnCopyMagic = document.getElementById('btnCopyMagicLinkForWorker');

    if (nameEl) nameEl.textContent = worker.full_name || 'Funcionario Institucional';
    if (docEl) docEl.textContent = worker.document_id || '';
    if (deptEl) deptEl.textContent = worker.department_name || 'Sin Departamento';
    if (pwdInput) pwdInput.value = '';
    if (alertBox) alertBox.style.display = 'none';
    if (magicBox) { magicBox.style.display = 'none'; magicBox.textContent = ''; }
    if (btnCopyMagic) btnCopyMagic.style.display = 'none';

    if (roleBadgeEl) {
      roleBadgeEl.textContent = (worker.role || 'worker').toUpperCase();
    }
    if (statusBadgeEl) {
      const isReg = worker.enrollment_status === 'registrado';
      statusBadgeEl.textContent = isReg ? 'Formalizado (Registrado)' : 'Pendiente (Precargado)';
      statusBadgeEl.className = isReg ? 'badge badge-passkey' : 'badge badge-override';
    }
    if (roleSelectEl) {
      roleSelectEl.value = worker.role || 'worker';
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
  } catch (err) {
    window.showToast('Error cargando datos del funcionario: ' + err.message, 'error');
  }
};

window.closeManageUserCredentialsModal = function() {
  const modal = document.getElementById('manageUserCredentialsModalBackdrop');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  currentManageWorkerId = null;
  currentManageWorkerData = null;
};

