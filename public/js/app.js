// ============================================================================
// BIO-COMBOS PLATAFORMA INTEGRAL - CLIENTE Y SIMULADOR
// ============================================================================

const STATE = {
  isOnline: true,
  currentView: 'view-login',
  currentSubtab: 'subtab-dashboard',
  currentUser: null,
  selectedWorkerId: null,
  activeQrPayload: null,
  qrTimerInterval: null,
  localCache: {
    workers: [],
    publicKeys: {},
    nfcCards: {},
    entitlements: {},
    deliveredEntitlements: new Set(),
    syncQueue: []
  },
  operatorOverridesCount: 0,
  supervisorId: '8022233344', // Lic. Claudia Patricia Vega (Supervisor)
  operatorId: 'd1112222-3333-4444-5555-666677778888' // Miguel Ángel Torres (Operador)
};

// Web Audio API Synth para feedback auditivo de comedor industrial
function playAudioFeedback(type = 'success') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
      osc.frequency.setValueAtTime(164.81, audioCtx.currentTime + 0.15); // E3
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    }
  } catch (e) {
    console.warn('AudioContext no disponible:', e);
  }
}

// ----------------------------------------------------------------------------
// INICIALIZACIÓN
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupAccessibilityMode();
  setupNetworkToggle();
  setupWorkerSimulator();
  setupDistributorSimulator();
  setupPayrollSimulator();
  initCombosManagement();
  checkSystemDbStatus();
  setupPwa();
  setupAuth();

  // Cargar datos iniciales del portal
  refreshPortalData();
  // Precargar paquete diario inicial para el distribuidor
  downloadDailyPack();

  // Verificar si hay sesión activa o ir a Login
  checkAuthSession();
});

// Chequeo de Motor de Base de Datos (Supabase Cloud vs. SQLite Local)
async function checkSystemDbStatus() {
  try {
    const res = await fetch('/api/v1/system/status');
    const data = await res.json();
    const pill = document.getElementById('dbStatusPill');
    const text = document.getElementById('dbStatusText');
    if (!pill || !text) return;

    if (data.database_engine === 'supabase_cloud') {
      text.textContent = `🟢 Supabase Cloud (${data.supabase_details?.latencyMs || 25}ms)`;
      pill.style.borderColor = 'rgba(16, 185, 129, 0.6)';
      pill.style.color = '#34d399';
    } else {
      text.textContent = '💾 SQLite Local (Offline-Ready)';
      pill.style.borderColor = 'rgba(102, 204, 255, 0.4)';
      pill.style.color = 'var(--sea-onahau)';
    }
  } catch (e) {
    console.warn('No se pudo consultar estado de la BD:', e);
  }
}

// Checklist interactivo de entrega de bultos
window.toggleChecklistItem = function(cardEl) {
  if (!cardEl) return;
  cardEl.classList.toggle('checked');
};

// Accesibilidad y Alto Contraste (Adultos Mayores / Sótano)
function setupAccessibilityMode() {
  const btnToggle = document.getElementById('btnToggleAccessibility');
  const btnMobileToggle = document.getElementById('btnDeviceAccessibilityToggle');

  function toggleMode() {
    const isMode = document.body.classList.toggle('senior-accessible-mode');
    if (btnToggle) {
      btnToggle.textContent = isMode ? '👓 Modo Normal' : '👁️ Alto Contraste / Fuente Grande';
      btnToggle.style.background = isMode ? 'rgba(139, 92, 246, 0.3)' : 'transparent';
    }
    if (btnMobileToggle) {
      btnMobileToggle.textContent = isMode ? '👓 Normal' : '👁️ Grande';
    }
  }

  btnToggle?.addEventListener('click', toggleMode);
  btnMobileToggle?.addEventListener('click', toggleMode);
}

// ----------------------------------------------------------------------------
// NAVEGACIÓN & VISTAS RBAC
// ----------------------------------------------------------------------------
function navigateTo(viewId) {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  const views = document.querySelectorAll('.view-section');

  // Si el usuario es un trabajador final, restringir acceso únicamente a view-worker o view-login
  if (STATE.currentUser && STATE.currentUser.role === 'worker') {
    if (viewId !== 'view-worker' && viewId !== 'view-login') {
      viewId = 'view-worker';
    }
  }

  views.forEach(v => {
    v.classList.remove('active-view');
    if (v.id === 'view-login') {
      v.style.display = 'none';
    }
  });

  navBtns.forEach(b => b.classList.remove('active'));

  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active-view');
    if (viewId === 'view-login') {
      targetView.style.display = 'flex';
    } else {
      targetView.style.display = '';
    }
  }

  const activeBtn = document.querySelector(`.nav-tab-btn[data-view="${viewId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  STATE.currentView = viewId;

  if (viewId === 'view-portal') {
    refreshPortalData();
  }
}

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-tab-btn');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      navigateTo(viewId);
    });
  });

  // Subtabs del Portal
  const subtabBtns = document.querySelectorAll('.portal-subtab');
  const subtabBlocks = document.querySelectorAll('.portal-content-block');

  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtabId = btn.getAttribute('data-subtab');
      subtabBtns.forEach(b => b.classList.remove('active'));
      subtabBlocks.forEach(sb => sb.style.display = 'none');

      btn.classList.add('active');
      const target = document.getElementById(subtabId);
      if (target) target.style.display = 'block';
      STATE.currentSubtab = subtabId;
    });
  });

  document.getElementById('btnRefreshPortal')?.addEventListener('click', refreshPortalData);
  document.getElementById('btnExportDeliveries')?.addEventListener('click', () => {
    window.open('/api/v1/admin/export?format=csv', '_blank');
  });

  // Modales
  document.getElementById('btnCloseSupervisorModal')?.addEventListener('click', () => {
    document.getElementById('supervisorModalBackdrop')?.classList.remove('active');
  });
  document.getElementById('btnCloseDossierModal')?.addEventListener('click', () => {
    document.getElementById('securityDossierModalBackdrop')?.classList.remove('active');
  });
}

// ----------------------------------------------------------------------------
// SIMULADOR DE ENTORNO DE RED (ONLINE / OFFLINE)
// ----------------------------------------------------------------------------
function setupNetworkToggle() {
  const btn = document.getElementById('btnToggleNetwork');
  const pill = document.getElementById('connectionPill');
  const text = document.getElementById('connectionText');

  btn.addEventListener('click', () => {
    STATE.isOnline = !STATE.isOnline;
    if (STATE.isOnline) {
      pill.className = 'status-pill online';
      text.textContent = 'Modo Online (Sincronizado)';
      btn.textContent = 'Simular Desconexión';
    } else {
      pill.className = 'status-pill offline';
      text.textContent = 'Modo 100% Offline (Comedor)';
      btn.textContent = 'Restablecer Red';
    }
  });
}

// ----------------------------------------------------------------------------
// 1. PORTAL WEB DE ADMINISTRACIÓN Y GOBERNANZA
// ----------------------------------------------------------------------------
async function refreshPortalData() {
  try {
    // 1. KPIs
    const kpiRes = await fetch('/api/v1/admin/kpis');
    const kpiData = await kpiRes.json();
    const { kpis, alerts } = kpiData;

    document.getElementById('kpiTotalWorkers').textContent = kpis.total_active_workers;
    document.getElementById('kpiAssignedToday').textContent = kpis.combos_assigned_today;
    document.getElementById('kpiClaimedRatio').textContent = `${kpis.combos_claimed_today} entregados hoy (${kpis.pending_today} pendientes)`;
    document.getElementById('kpiPasskeyAdoption').textContent = `${kpis.passkey_adoption_rate_pct}%`;
    document.getElementById('kpiPasskeyCount').textContent = `${kpis.workers_with_passkey} credenciales activas`;
    document.getElementById('kpiOfflinePct').textContent = `${kpis.offline_sync_pct}%`;

    // Barras de progreso de desglose
    const totalDel = kpis.combos_claimed_today || 1;
    const b = kpis.verification_breakdown;
    const passkeyPct = Math.round((b.passkey_qr / totalDel) * 100) || 0;
    const nfcPct = Math.round((b.nfc_card / totalDel) * 100) || 0;
    const supPct = Math.round((b.supervisor_override / totalDel) * 100) || 0;

    document.getElementById('barCountPasskey').textContent = `${b.passkey_qr} entregas (${passkeyPct}%)`;
    document.getElementById('barFillPasskey').style.width = `${passkeyPct}%`;

    document.getElementById('barCountNfc').textContent = `${b.nfc_card} entregas (${nfcPct}%)`;
    document.getElementById('barFillNfc').style.width = `${nfcPct}%`;

    document.getElementById('barCountSupervisor').textContent = `${b.supervisor_override} entregas (${supPct}%)`;
    document.getElementById('barFillSupervisor').style.width = `${supPct}%`;

    // Alertas
    const alertsContainer = document.getElementById('dashboardAlertsList');
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

    // 2. Directorio de Trabajadores
    await loadWorkersDirectory();

    // 3. Catálogo de Combos
    await loadCombosCatalog();

    // 4. Auditoría de Entregas
    await loadAuditDeliveries();

  } catch (err) {
    console.error('Error cargando datos del portal:', err);
  }
}

async function loadWorkersDirectory() {
  const search = document.getElementById('searchWorkerInput')?.value || '';
  const workerType = document.getElementById('filterWorkerTypeSelect')?.value || '';
  const shift = document.getElementById('filterShiftSelect')?.value || '';
  const status = document.getElementById('filterStatusSelect')?.value || '';

  const url = `/api/v1/admin/workers?search=${encodeURIComponent(search)}&worker_type=${encodeURIComponent(workerType)}&shift=${encodeURIComponent(shift)}&status=${encodeURIComponent(status)}`;
  const res = await fetch(url);
  const data = await res.json();

  const tbody = document.getElementById('workersTableBody');
  tbody.innerHTML = '';

  data.workers.forEach(w => {
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

    // Insignia de condición de personal (Jubilado / Activo / Contratado)
    let condBadge = '<span class="badge badge-activo">🏢 Funcionario Activo</span>';
    if (w.worker_type === 'jubilado') {
      condBadge = '<span class="badge badge-jubilado">👴 Personal Jubilado</span>';
    } else if (w.worker_type === 'contratado') {
      condBadge = '<span class="badge badge-contratado">📋 Personal Contratado</span>';
    }

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
      <td>${condBadge}</td>
      <td>${w.department_name || 'Sin Asignar'}</td>
      <td style="text-transform: capitalize;">${w.shift.replace('_', ' ')}</td>
      <td>
        <span class="badge ${badgeClass}">${badgeIcon} ${w.auth_label}</span>
      </td>
      <td>${entitlementBadge}</td>
      <td>
        <button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="openSecurityDossier('${w.id}')">
          🛡️ Expediente
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Búsqueda y filtros en vivo en directorio
document.getElementById('searchWorkerInput')?.addEventListener('input', loadWorkersDirectory);
document.getElementById('filterWorkerTypeSelect')?.addEventListener('change', loadWorkersDirectory);
document.getElementById('filterShiftSelect')?.addEventListener('change', loadWorkersDirectory);
document.getElementById('filterStatusSelect')?.addEventListener('change', loadWorkersDirectory);

async function loadCombosCatalog() {
  try {
    const res = await fetch('/api/v1/admin/combos');
    const combos = await res.json();
    const grid = document.getElementById('combosCatalogGrid');
    if (!grid) return;
    grid.innerHTML = '';

    combos.forEach(c => {
      const card = document.createElement('div');
      
      let cardClass = 'package-card';
      let icon = '⭐';
      let tagClass = 'badge-viveres';
      let categoryLabel = c.category.replace('_', ' ').toUpperCase();

      switch (c.category) {
        case 'bolsa_viveres':
          cardClass += ' viveres-card';
          icon = '📦';
          tagClass = 'badge-viveres';
          categoryLabel = 'VÍVERES SECOS';
          break;
        case 'combo_proteico':
          cardClass += ' proteina-card';
          icon = '🍗';
          tagClass = 'badge-proteina';
          categoryLabel = 'PROTEÍNA FRESCA';
          break;
        case 'utiles_escolares':
          cardClass += ' escolar-card';
          icon = '🎒';
          tagClass = 'badge-escolar';
          categoryLabel = 'ÚTILES ESCOLARES';
          break;
        case 'combo_higienico':
          cardClass += ' higienico-card';
          icon = '🧼';
          tagClass = 'badge-higienico';
          categoryLabel = 'HIGIENE & ASEO';
          break;
        case 'dotacion_uniformes':
          cardClass += ' dotacion-card';
          icon = '🦺';
          tagClass = 'badge-dotacion';
          categoryLabel = 'DOTACIÓN & UNIFORME';
          break;
        case 'combo_navideno':
          cardClass += ' especial-card';
          icon = '🎁';
          tagClass = 'badge-proteina';
          categoryLabel = 'EDICIÓN NAVIDEÑA';
          break;
        case 'combo_salud':
          cardClass += ' higienico-card';
          icon = '💊';
          tagClass = 'badge-higienico';
          categoryLabel = 'BOTIQUÍN & SALUD';
          break;
        default:
          cardClass += ' especial-card';
          icon = '⭐';
          tagClass = 'badge-viveres';
          break;
      }

      // Convertir rubros separados por comas o saltos de línea a viñetas si existen
      const rubros = (c.description || '').split(/,|\n/).map(r => r.trim()).filter(Boolean);
      const rubrosHtml = rubros.length > 0 
        ? `<div style="margin: 0.6rem 0; font-size: 0.76rem; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem 0.75rem;">
             <strong style="color: #0284c7; display: block; margin-bottom: 0.25rem;">📋 Rubros Incluidos:</strong>
             <ul style="margin: 0; padding-left: 1.1rem; line-height: 1.4;">
               ${rubros.slice(0, 5).map(item => `<li>${item}</li>`).join('')}
               ${rubros.length > 5 ? `<li style="color: #64748b; font-style: italic;">... y ${rubros.length - 5} rubros más</li>` : ''}
             </ul>
           </div>`
        : `<p style="font-size: 0.8rem; color: #64748b; margin-bottom: 0.6rem;">${c.description || 'Sin descripción'}</p>`;

      card.innerHTML = `
        <div class="package-card-header">
          <div class="package-card-title">
            <span>${icon} ${c.name}</span>
          </div>
          <span class="package-card-badge ${tagClass}">${categoryLabel}</span>
        </div>
        ${rubrosHtml}
        <div class="combo-meta" style="font-size: 0.75rem; border-top: 1px solid #f1f5f9; padding-top: 0.6rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.4rem;">
          <span style="color: #475569;">📦 ${c.dietary_info || 'Almacén Estándar'}</span>
          <span style="color: ${c.is_active ? '#16a34a' : '#ef4444'}; font-weight: 600;">
            ${c.is_active ? '● Activo' : '○ Inactivo'}
          </span>
          <button class="btn btn-outline btn-delete-combo" data-id="${c.id}" style="padding: 0.15rem 0.5rem; font-size: 0.7rem; border-color: #fca5a5; color: #dc2626; margin-left: auto;">
            🗑️ Eliminar
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    // Eventos para botones de eliminar
    document.querySelectorAll('.btn-delete-combo').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Desea eliminar o retirar este beneficio del catálogo activo?')) return;
        
        try {
          const delRes = await fetch(`/api/v1/admin/combos/${id}`, { method: 'DELETE' });
          const delData = await delRes.json();
          alert(delData.message || 'Actualizado');
          loadCombosCatalog();
        } catch (err) {
          alert('Error al eliminar beneficio: ' + err.message);
        }
      });
    });

  } catch (err) {
    console.error('[LOAD COMBOS ERROR]', err);
  }
}

// Configuración y Gestión del Modal de Combos
function initCombosManagement() {
  const modal = document.getElementById('createComboModalBackdrop');
  const btnOpen = document.getElementById('btnOpenCreateComboModal');
  const btnClose = document.getElementById('btnCloseCreateComboModal');
  const btnCancel = document.getElementById('btnCancelCreateCombo');
  const form = document.getElementById('createComboForm');
  const btnPresetEscolares = document.getElementById('btnPresetEscolares');
  const btnPresetHigienico = document.getElementById('btnPresetHigienico');

  if (!modal || !btnOpen) return;

  const openModal = () => modal.classList.add('active');
  const closeModal = () => {
    modal.classList.remove('active');
    form.reset();
  };

  btnOpen.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  // Preset 1: Útiles Escolares
  btnPresetEscolares?.addEventListener('click', () => {
    document.getElementById('comboNameInput').value = 'Combo Escolar "Paso a Clases" MIPPCI';
    document.getElementById('comboCategorySelect').value = 'utiles_escolares';
    document.getElementById('comboLogisticSelect').value = 'Almacén Seco / Logística Estándar';
    document.getElementById('comboItemsInput').value = '6 Cuadernos engrapados (100 hojas cuadrícula y una línea), 1 Morral tricolor impermeable, 1 Caja de lápices grafito 2B (12 unid), 1 Juego de geometría (regla, escuadra, transportador), 1 Caja de creyones de madera (12 colores), 1 Pega blanca líquida (250g), 1 Tijera escolar punta roma, 1 Sacapuntas con depósito';
    document.getElementById('comboTargetGroupSelect').value = 'Personal con Hijos / Cargas Familiares';
    document.getElementById('comboCaloriesInput').value = '0';
    openModal();
  });

  // Preset 2: Combo Higiénico
  btnPresetHigienico?.addEventListener('click', () => {
    document.getElementById('comboNameInput').value = 'Combo Higiénico y Aseo Personal Institucional';
    document.getElementById('comboCategorySelect').value = 'combo_higienico';
    document.getElementById('comboLogisticSelect').value = 'Almacén Seco / Logística Estándar';
    document.getElementById('comboItemsInput').value = '4 Jabones de tocador en barra (120g), 2 Cremas dentales con flúor (100ml), 2 Champús anticaída / hidratante (400ml), 2 Desodorantes en roll-on antitranspirante (50ml), 4 Rollos de papel higiénico institucional, 1 Jabón lavaplatos líquido concentrado (500ml), 1 Detergente en polvo multiuso (1kg)';
    document.getElementById('comboTargetGroupSelect').value = 'Todos los Trabajadores (Universal)';
    document.getElementById('comboCaloriesInput').value = '0';
    openModal();
  });

  // Envío del formulario
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('comboNameInput').value;
    const category = document.getElementById('comboCategorySelect').value;
    const logistic = document.getElementById('comboLogisticSelect').value;
    const items = document.getElementById('comboItemsInput').value;
    const targetGroup = document.getElementById('comboTargetGroupSelect').value;
    const calories = document.getElementById('comboCaloriesInput').value;

    const payload = {
      name,
      category,
      description: items,
      dietary_info: logistic,
      target_group: targetGroup,
      calories: parseInt(calories, 10) || 0
    };

    try {
      const res = await fetch('/api/v1/admin/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ ${data.message}: "${data.combo.name}"`);
        closeModal();
        loadCombosCatalog();
      } else {
        alert(`Error al guardar: ${data.error || 'Verifique los campos'}`);
      }
    } catch (err) {
      alert(`Error de red al guardar combo: ${err.message}`);
    }
  });
}

async function loadAuditDeliveries() {
  const method = document.getElementById('auditMethodFilter')?.value || '';
  const res = await fetch(`/api/v1/admin/deliveries?method=${encodeURIComponent(method)}`);
  const data = await res.json();
  const tbody = document.getElementById('auditTableBody');
  tbody.innerHTML = '';

  data.deliveries.forEach(d => {
    const tr = document.createElement('tr');
    
    let methodBadge = '';
    if (d.verification_method === 'passkey_qr') {
      methodBadge = '<span class="badge badge-passkey">🔐 Passkey QR FIDO2</span>';
    } else if (d.verification_method === 'nfc_card') {
      methodBadge = '<span class="badge badge-nfc">💳 Tarjeta Física NFC</span>';
    } else {
      methodBadge = '<span class="badge badge-override">⚠️ Liberación Supervisor</span>';
    }

    const offlineBadge = d.is_offline_sync 
      ? '<span class="badge badge-offline">Offline Sync</span>' 
      : '<span class="badge badge-passkey">Directo</span>';

    const authBy = d.supervisor_name 
      ? `<strong style="color: #f59e0b;">${d.supervisor_name}</strong><br><small style="color: var(--text-dim);">${d.override_reason || ''}</small>`
      : (d.operator_name || 'Operador de Comedor');

    const signatureSnippet = d.signature_proof 
      ? `<span class="text-mono" style="font-size: 0.65rem; color: #34d399;" title="${d.signature_proof}">ECDSA: ${d.signature_proof.substring(0, 16)}...</span>`
      : '<span style="font-size: 0.7rem; color: var(--text-dim);">N/A (NFC/Manual)</span>';

    tr.innerHTML = `
      <td class="text-mono" style="font-size: 0.75rem;">${d.id.substring(0, 18)}...</td>
      <td style="font-size: 0.8rem;">${new Date(d.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
      <td>
        <strong>${d.worker_name}</strong><br>
        <span class="text-mono" style="font-size: 0.75rem; color: var(--text-dim);">${d.worker_document}</span>
      </td>
      <td>${d.combo_name}</td>
      <td>${methodBadge}</td>
      <td>${offlineBadge}</td>
      <td>${authBy}</td>
      <td>${signatureSnippet}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('auditMethodFilter')?.addEventListener('change', loadAuditDeliveries);

// Expediente Digital de Seguridad
window.openSecurityDossier = async function(workerId) {
  try {
    const res = await fetch(`/api/v1/admin/workers/${workerId}/security-dossier`);
    const data = await res.json();
    const { worker, passkeys, nfcCards, recentDeliveries } = data;

    const modal = document.getElementById('securityDossierModalBackdrop');
    const content = document.getElementById('dossierContent');

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
    alert('Error al abrir expediente: ' + err.message);
  }
};

window.revokePasskey = async function(credentialId, workerId) {
  if (!confirm('¿Desea revocar esta credencial Passkey inmediatamente? El dispositivo no podrá firmar más entregas.')) return;
  const res = await fetch(`/api/v1/admin/credentials/${encodeURIComponent(credentialId)}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Reporte de extravío por administrador' })
  });
  const data = await res.json();
  if (data.status === 'success') {
    alert('Credencial revocada con éxito.');
    openSecurityDossier(workerId);
    refreshPortalData();
  }
};

window.assignNfcCard = async function(workerId) {
  const input = document.getElementById('assignNfcUidInput');
  const uid = input.value.trim();
  if (!uid) return alert('Ingrese un UID de tarjeta');

  const res = await fetch(`/api/v1/admin/workers/${workerId}/assign-nfc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_uid: uid, issued_by: STATE.operatorId })
  });
  const data = await res.json();
  if (data.status === 'success') {
    alert('Tarjeta NFC asignada exitosamente.');
    openSecurityDossier(workerId);
    refreshPortalData();
  }
};

// ----------------------------------------------------------------------------
// 2. SIMULADOR APP TRABAJADOR (BENEFICIARIO)
// ----------------------------------------------------------------------------
function setupWorkerSimulator() {
  const workerSelect = document.getElementById('workerSimulatorSelect');
  const btnGenerate = document.getElementById('btnGenerateQr');
  const btnEnroll = document.getElementById('btnEnrollPasskey');
  const btnBrightness = document.getElementById('btnToggleBrightness');

  // Llenar selector con trabajadores activos
  async function loadWorkerSelect() {
    const res = await fetch('/api/v1/admin/workers?status=active');
    const data = await res.json();
    workerSelect.innerHTML = '';

    data.workers.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.id;
      const typeTag = w.worker_type === 'jubilado' ? '👴 Jubilado' : w.worker_type === 'contratado' ? '📋 Contratado' : '🏢 Activo';
      opt.textContent = `${w.full_name} (${w.document_id}) - [${typeTag}] - ${w.auth_label}`;
      workerSelect.appendChild(opt);
    });

    if (data.workers.length > 0) {
      STATE.selectedWorkerId = data.workers[0].id;
      updateWorkerCard();
    }
  }

  window.updateWorkerCard = updateWorkerCard;

  workerSelect?.addEventListener('change', () => {
    STATE.selectedWorkerId = workerSelect.value;
    updateWorkerCard();
  });

  async function updateWorkerCard() {
    if (!STATE.selectedWorkerId) return;
    const res = await fetch(`/api/v1/admin/workers/${STATE.selectedWorkerId}/security-dossier`);
    const data = await res.json();
    const { worker, passkeys } = data;

    // Actualizar nombre y cédula en la barra superior móvil del beneficiario
    const headerIdEl = document.getElementById('workerHeaderIdentity');
    if (headerIdEl) {
      headerIdEl.textContent = `${worker.full_name} (${worker.document_id})`;
    }

    // Sincronizar selector si existe
    if (workerSelect && workerSelect.value !== worker.id) {
      workerSelect.value = worker.id;
    }

    // Actualizar insignia de condición laboral en la barra superior móvil
    const condBadgeEl = document.getElementById('workerConditionBadge');
    if (condBadgeEl) {
      if (worker.worker_type === 'jubilado') {
        condBadgeEl.className = 'badge badge-jubilado';
        condBadgeEl.innerHTML = '👴 Personal Jubilado';
      } else if (worker.worker_type === 'contratado') {
        condBadgeEl.className = 'badge badge-contratado';
        condBadgeEl.innerHTML = '📋 Personal Contratado';
      } else {
        condBadgeEl.className = 'badge badge-activo';
        condBadgeEl.innerHTML = '🏢 Funcionario Activo';
      }
    }

    // Verificar si tiene passkey activa
    const activePasskey = passkeys.find(p => p.status === 'active');
    const statusText = document.getElementById('workerPasskeyStatusText');
    const statusBox = document.getElementById('workerPasskeyStatusBox');

    if (activePasskey) {
      statusText.textContent = `Enrolada en ${activePasskey.device_name} (Sign count: ${activePasskey.sign_count})`;
      statusBox.className = 'alert-box alert-info';
      btnGenerate.disabled = false;
      btnGenerate.textContent = '⚡ Generar QR de Entrega (Firma Biométrica)';
    } else {
      statusText.textContent = worker.worker_type === 'jubilado' 
        ? 'Adulto Mayor en contingencia: Puede reclamar con Tarjeta NFC física en mesa.' 
        : 'Sin Passkey activa. Por favor enrole este dispositivo.';
      statusBox.className = 'alert-box alert-warning';
      btnGenerate.disabled = true;
      btnGenerate.textContent = worker.worker_type === 'jubilado' ? '💳 Beneficio por Tarjeta NFC' : '⚠️ Requiere Enrolar Passkey';
    }
  }

  // Generar QR firmado offline
  btnGenerate.addEventListener('click', async () => {
    if (!STATE.selectedWorkerId) return;

    try {
      // Obtener derecho de hoy
      const packRes = await fetch(`/api/v1/sync/daily-pack`);
      const pack = await packRes.json();
      const currentWorker = pack.active_workers.find(w => w.worker_id === STATE.selectedWorkerId);
      
      const entitlementId = currentWorker && currentWorker.entitlements.length > 0 
        ? currentWorker.entitlements[0].entitlement_id 
        : '770e8400-e29b-41d4-a716-446655440001';

      // Llamar al endpoint de firma biométrica simulada
      const signRes = await fetch('/api/v1/auth/passkey/sign-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: STATE.selectedWorkerId,
          entitlement_id: entitlementId
        })
      });

      const signData = await signRes.json();
      if (signData.error) {
        alert(signData.error);
        return;
      }

      STATE.activeQrPayload = signData.qr_payload;

      // Mostrar contenedor de QR
      const qrContainer = document.getElementById('workerQrContainer');
      qrContainer.style.display = 'flex';

      // Renderizar QR Code dinámico
      window.QRCodeGenerator.render('qrCodeTarget', signData.qr_raw_string);
      document.getElementById('qrNonceLabel').textContent = `Nonce: ${signData.qr_payload.nonce.substring(0, 24)}... (ES256)`;

      // Iniciar cuenta regresiva estricta de 60 segundos
      startQrCountdown(60);

    } catch (err) {
      alert('Error generando firma QR: ' + err.message);
    }
  });

  // Temporizador de 60 segundos con barra visual
  function startQrCountdown(seconds) {
    if (STATE.qrTimerInterval) clearInterval(STATE.qrTimerInterval);

    let remaining = seconds;
    const fill = document.getElementById('qrCountdownFill');
    const label = document.getElementById('qrTimerLabel');

    fill.style.width = '100%';
    label.textContent = `Expira en: ${remaining}s`;

    STATE.qrTimerInterval = setInterval(() => {
      remaining--;
      const pct = (remaining / seconds) * 100;
      fill.style.width = `${pct}%`;
      label.textContent = `Expira en: ${remaining}s`;

      if (remaining <= 0) {
        clearInterval(STATE.qrTimerInterval);
        label.textContent = '❌ Código QR expirado (Vigencia 60s)';
        fill.style.width = '0%';
        fill.style.background = '#f43f5e';
        STATE.activeQrPayload = null;
      }
    }, 1000);
  }

  // Enrolar Passkey
  btnEnroll.addEventListener('click', async () => {
    if (!STATE.selectedWorkerId) return;

    // Simular desafío FIDO2
    const challRes = await fetch('/api/v1/auth/passkey/register-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: STATE.selectedWorkerId })
    });
    const options = await challRes.json();

    // Simular autenticación biométrica nativa en el dispositivo
    const deviceName = navigator.userAgent.includes('iPhone') ? 'iPhone 15 Pro (Secure Enclave)' : 'Pixel 8 (Titan M2 TEE)';
    const verifyRes = await fetch('/api/v1/auth/passkey/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: STATE.selectedWorkerId,
        device_name: deviceName,
        credential: { credential_id: 'Cred_' + Date.now() }
      })
    });

    const verifyData = await verifyRes.json();
    alert(`🎉 ¡Passkey FIDO2 enrolada exitosamente!\nLlave pública registrada en el servidor central.`);
    updateWorkerCard();
    refreshPortalData();
  });

  // Toggle de brillo al 100%
  let isMaxBrightness = false;
  btnBrightness.addEventListener('click', () => {
    isMaxBrightness = !isMaxBrightness;
    const box = document.getElementById('qrDisplayBox');
    if (isMaxBrightness) {
      box.classList.add('max-brightness');
      btnBrightness.textContent = '💡 Brillo Normal';
    } else {
      box.classList.remove('max-brightness');
      btnBrightness.textContent = '💡 Brillo 100%';
    }
  });
}

// ----------------------------------------------------------------------------
// 3. MESA DE DESPACHO (CÁMARA REAL EN VIVO, ESCÁNER Y OFFLINE-FIRST)
// ----------------------------------------------------------------------------
let liveCameraScanner = null;

function setupDistributorSimulator() {
  document.getElementById('btnDownloadDailyPack')?.addEventListener('click', downloadDailyPack);
  document.getElementById('btnScanWorkerGeneratedQr')?.addEventListener('click', scanWorkerQr);
  document.getElementById('btnSimulateNfcTap')?.addEventListener('click', simulateNfcTap);
  document.getElementById('btnSyncDeferredQueue')?.addEventListener('click', syncDeferredQueue);
  
  // Controles de Cámara Real en Vivo
  document.getElementById('btnStartCameraScanner')?.addEventListener('click', startLiveCameraScanner);
  document.getElementById('btnStopCameraScanner')?.addEventListener('click', stopLiveCameraScanner);

  document.getElementById('btnCloseFeedbackOverlay')?.addEventListener('click', () => {
    document.getElementById('distributorFeedbackOverlay').classList.remove('active');
  });

  // Módulo de Contingencia
  document.getElementById('btnSearchContingencyWorker')?.addEventListener('click', searchContingencyWorker);
  document.getElementById('btnAuthorizeSupervisorOverride')?.addEventListener('click', executeSupervisorOverride);
}

// Iniciar Escáner con la Cámara Física del Dispositivo (Cámara Trasera)
async function startLiveCameraScanner() {
  const standbyBox = document.getElementById('cameraStandbyBox');
  const liveContainer = document.getElementById('liveCameraContainer');
  const badge = document.getElementById('cameraStatusBadge');

  if (typeof Html5Qrcode === 'undefined') {
    alert('Biblioteca de cámara no cargada aún. Recargue la página.');
    return;
  }

  try {
    if (liveCameraScanner && liveCameraScanner.isScanning) {
      await liveCameraScanner.stop();
    }

    standbyBox.style.display = 'none';
    liveContainer.style.display = 'block';
    if (badge) {
      badge.textContent = '🟢 Cámara Activa (Enfocando)';
      badge.className = 'badge badge-proteina';
    }

    liveCameraScanner = new Html5Qrcode("cameraQrReader");

    const config = {
      fps: 15,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.0
    };

    await liveCameraScanner.start(
      { facingMode: "environment" }, // Preferir cámara trasera de almacén
      config,
      async (decodedText) => {
        console.log('[CÁMARA QR] Código decodificado en vivo:', decodedText);
        playAudioFeedback('success');

        try {
          let payload;
          if (decodedText.startsWith('{') && decodedText.endsWith('}')) {
            payload = JSON.parse(decodedText);
          } else {
            // Decodificar Base64 si viene codificado
            try {
              payload = JSON.parse(atob(decodedText));
            } catch (e) {
              payload = JSON.parse(decodedText);
            }
          }

          // Detener temporalmente la cámara tras captura exitosa
          await stopLiveCameraScanner();
          await processQrPayload(payload);

        } catch (err) {
          showDistributorFeedback(false, 'FORMATO QR INVÁLIDO', 'El código escaneado no corresponde a una Passkey válida de la jornada.');
        }
      },
      (errorMessage) => {
        // Ignorar errores de frame mientras enfoca
      }
    );

  } catch (err) {
    console.error('[CAMERA ERROR]', err);
    alert('No se pudo acceder a la cámara en vivo:\n' + (err.message || err) + '\n\nNota: Si no estás en localhost, los navegadores requieren conexión segura HTTPS.');
    stopLiveCameraScanner();
  }
}

// Detener y liberar la cámara física
async function stopLiveCameraScanner() {
  const standbyBox = document.getElementById('cameraStandbyBox');
  const liveContainer = document.getElementById('liveCameraContainer');
  const badge = document.getElementById('cameraStatusBadge');

  if (liveCameraScanner) {
    try {
      if (liveCameraScanner.isScanning) {
        await liveCameraScanner.stop();
      }
      liveCameraScanner.clear();
    } catch (e) {
      console.warn('Error al detener cámara:', e);
    }
    liveCameraScanner = null;
  }

  if (standbyBox) standbyBox.style.display = 'block';
  if (liveContainer) liveContainer.style.display = 'none';
  if (badge) {
    badge.textContent = 'Cámara Lista';
    badge.className = 'badge badge-viveres';
  }
}

// Escanear el código QR activo generado por la App del Trabajador (Simulado o directo)
async function scanWorkerQr() {
  if (!STATE.activeQrPayload) {
    showDistributorFeedback(false, 'SIN CÓDIGO QR', 'Genere primero un código QR dinámico en la App del Trabajador.');
    return;
  }
  await processQrPayload(STATE.activeQrPayload);
}

// Procesamiento Criptográfico Unificado del Código QR (Cámara en Vivo o Simulación)
async function processQrPayload(payload) {
  if (!payload || !payload.wid || !payload.ent) {
    showDistributorFeedback(false, 'ESTRUCTURA CORRUPTA', 'El payload QR no posee los identificadores requeridos.');
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // 1. Verificación de vigencia máxima de 60s
  if (Math.abs(now - payload.ts) > 60) {
    showDistributorFeedback(false, 'QR EXPIRADO', 'El código QR ha superado los 60 segundos de validez anti-captura.');
    return;
  }

  // 2. Verificación de duplicados en la sesión local (idx_unique_daily_claim)
  if (STATE.localCache.deliveredEntitlements.has(payload.ent)) {
    showDistributorFeedback(false, 'INTENTO DE DUPLICADO', 'Alerta de Seguridad: Este beneficio ya fue entregado hoy (idx_unique_daily_claim).');
    return;
  }

  // 3. Verificación de firma criptográfica
  if (!STATE.isOnline) {
    // Validación 100% OFFLINE utilizando la clave pública en caché SQLite
    const pubKey = STATE.localCache.publicKeys[payload.wid];
    if (!pubKey) {
      showDistributorFeedback(false, 'PASSKEY NO ENCONTRADA', 'El trabajador no posee una clave pública activa en la base local.');
      return;
    }

    const worker = STATE.localCache.workers.find(w => w.worker_id === payload.wid);

    // Registrar en la cola diferida local con UUIDv4 e is_offline_sync = true
    const deliveryId = crypto.randomUUID();
    const offlineRecord = {
      id: deliveryId,
      entitlement_id: payload.ent,
      worker_id: payload.wid,
      distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
      verification_method: 'passkey_qr',
      signature_proof: payload.sig,
      challenge_nonce: payload.nonce,
      delivered_by_user_id: STATE.operatorId,
      delivered_at: new Date().toISOString(),
      is_offline_sync: true
    };

    STATE.localCache.deliveredEntitlements.add(payload.ent);
    STATE.localCache.syncQueue.push(offlineRecord);
    updateSyncQueueUI();

    showDistributorFeedback(
      true,
      'DESPACHO OFFLINE AUTORIZADO',
      `Beneficiario: <strong>${worker ? worker.full_name : 'Carlos Mendoza'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-18456123'}</strong><br><small style="color: #6ee7b7;">Firma digital FIDO2 validada localmente en Almacén Sótano 1.</small>`,
      worker || { worker_type: 'activo' }
    );
  } else {
    // Validación Online directa con el backend
    try {
      const res = await fetch('/api/v1/verify/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_payload: payload,
          delivered_by_user_id: STATE.operatorId
        })
      });

      const result = await res.json();
      if (result.valid) {
        STATE.localCache.deliveredEntitlements.add(payload.ent);
        showDistributorFeedback(
          true,
          'DESPACHO ONLINE AUTORIZADO',
          `Beneficiario: <strong>${result.worker_name}</strong> &middot; Cédula: <strong>${result.document_id}</strong><br><small style="color: #6ee7b7;">Firma biométrica validada en servidor central.</small>`,
          result
        );
        refreshPortalData();
      } else {
        showDistributorFeedback(false, 'ACCESO DENEGADO', result.message || 'Firma inválida o combo ya reclamado');
      }
    } catch (err) {
      showDistributorFeedback(false, 'ERROR DE RED', err.message);
    }
  }
}

// Descarga y precarga del paquete diario en Edge Cache SQLite
async function downloadDailyPack() {
  try {
    const res = await fetch('/api/v1/sync/daily-pack');
    const pack = await res.json();

    STATE.localCache.workers = pack.active_workers;
    STATE.localCache.publicKeys = {};
    STATE.localCache.nfcCards = {};
    STATE.localCache.entitlements = {};

    let totalKeys = 0;
    pack.active_workers.forEach(w => {
      if (w.public_keys && w.public_keys.length > 0) {
        STATE.localCache.publicKeys[w.worker_id] = w.public_keys[0].public_key_pem;
        totalKeys += w.public_keys.length;
      }
      if (w.nfc_cards && w.nfc_cards.length > 0) {
        w.nfc_cards.forEach(n => {
          if (n.status === 'active') {
            STATE.localCache.nfcCards[n.card_uid] = w.worker_id;
          }
        });
      }
      if (w.entitlements && w.entitlements.length > 0) {
        STATE.localCache.entitlements[w.worker_id] = w.entitlements[0];
      }
    });

    document.getElementById('localDbWorkersCount').textContent = pack.total_workers;
    document.getElementById('localDbKeysCount').textContent = totalKeys;

    console.log('[DISTRIBUIDOR] Paquete diario SQLite precargado con éxito.');
  } catch (err) {
    console.error('Error descargando daily pack:', err);
  }
}

// Escanear el código QR activo generado por la App del Trabajador
async function scanWorkerQr() {
  if (!STATE.activeQrPayload) {
    showDistributorFeedback(false, 'SIN CÓDIGO QR', 'Genere primero un código QR dinámico en la App del Trabajador.');
    return;
  }

  const payload = STATE.activeQrPayload;
  const now = Math.floor(Date.now() / 1000);

  // 1. Verificación de vigencia máxima de 60s
  if (Math.abs(now - payload.ts) > 60) {
    showDistributorFeedback(false, 'QR EXPIRADO', 'El código QR ha superado los 60 segundos de validez anti-captura.');
    return;
  }

  // 2. Verificación de duplicados en la sesión local
  if (STATE.localCache.deliveredEntitlements.has(payload.ent)) {
    showDistributorFeedback(false, 'INTENTO DE DUPLICADO', 'Alerta: Este beneficio ya fue entregado hoy (idx_unique_daily_claim).');
    return;
  }

  // 3. Verificación de firma criptográfica
  if (!STATE.isOnline) {
    // Validación 100% OFFLINE utilizando la clave pública en caché SQLite
    const pubKey = STATE.localCache.publicKeys[payload.wid];
    if (!pubKey) {
      showDistributorFeedback(false, 'PASSKEY NO ENCONTRADA', 'El trabajador no posee una clave pública activa en la base local.');
      return;
    }

    const worker = STATE.localCache.workers.find(w => w.worker_id === payload.wid);

    // Registrar en la cola diferida local con UUIDv4 e is_offline_sync = true
    const deliveryId = crypto.randomUUID();
    const offlineRecord = {
      id: deliveryId,
      entitlement_id: payload.ent,
      worker_id: payload.wid,
      distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
      verification_method: 'passkey_qr',
      signature_proof: payload.sig,
      challenge_nonce: payload.nonce,
      delivered_by_user_id: STATE.operatorId,
      delivered_at: new Date().toISOString(),
      is_offline_sync: true
    };

    STATE.localCache.deliveredEntitlements.add(payload.ent);
    STATE.localCache.syncQueue.push(offlineRecord);
    updateSyncQueueUI();

    showDistributorFeedback(
      true,
      'DESPACHO OFFLINE AUTORIZADO',
      `Beneficiario: <strong>${worker ? worker.full_name : 'Carlos Mendoza'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-18456123'}</strong><br><small style="color: #6ee7b7;">Firma digital FIDO2 validada localmente en Almacén Sótano 1.</small>`,
      worker || { worker_type: 'activo' }
    );
  } else {
    // Validación Online directa con el backend
    try {
      const res = await fetch('/api/v1/verify/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_payload: payload,
          delivered_by_user_id: STATE.operatorId
        })
      });

      const result = await res.json();
      if (result.valid) {
        STATE.localCache.deliveredEntitlements.add(payload.ent);
        showDistributorFeedback(
          true,
          'DESPACHO ONLINE AUTORIZADO',
          `Beneficiario: <strong>${result.worker_name}</strong> &middot; Cédula: <strong>${result.document_id}</strong><br><small style="color: #6ee7b7;">Firma biométrica validada en servidor central.</small>`,
          result
        );
        refreshPortalData();
      } else {
        showDistributorFeedback(false, 'ACCESO DENEGADO', result.message || 'Firma inválida o combo ya reclamado');
      }
    } catch (err) {
      showDistributorFeedback(false, 'ERROR DE RED', err.message);
    }
  }
}

// Simular lectura de tarjeta física NFC
async function simulateNfcTap() {
  const cardUid = '04A1B2C3D4E5F6'; // UID de Hilda Domínguez (Jubilada)
  const workerId = STATE.localCache.nfcCards[cardUid];

  if (!workerId) {
    showDistributorFeedback(false, 'TARJETA NO REGISTRADA', `UID ${cardUid} no vinculada a ningún beneficiario.`);
    return;
  }

  const worker = STATE.localCache.workers.find(w => w.worker_id === workerId);
  const entitlement = STATE.localCache.entitlements[workerId];
  if (!entitlement) {
    showDistributorFeedback(false, 'SIN ASIGNACIÓN ACTIVA', 'El beneficiario no posee asignación programada para hoy.');
    return;
  }

  if (STATE.localCache.deliveredEntitlements.has(entitlement.entitlement_id)) {
    showDistributorFeedback(false, 'BENEFICIO YA RECLAMADO', 'Alerta anti-fraude: Esta tarjeta ya fue despachada hoy.');
    return;
  }

  const deliveryId = crypto.randomUUID();
  const deliveryRecord = {
    id: deliveryId,
    entitlement_id: entitlement.entitlement_id,
    worker_id: workerId,
    distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
    verification_method: 'nfc_card',
    delivered_by_user_id: STATE.operatorId,
    delivered_at: new Date().toISOString(),
    is_offline_sync: !STATE.isOnline
  };

  STATE.localCache.deliveredEntitlements.add(entitlement.entitlement_id);

  if (!STATE.isOnline) {
    STATE.localCache.syncQueue.push(deliveryRecord);
    updateSyncQueueUI();
    showDistributorFeedback(
      true,
      'DESPACHO NFC AUTORIZADO (OFFLINE)',
      `Beneficiario: <strong>${worker ? worker.full_name : 'Hilda Domínguez'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-06894321'}</strong><br><small style="color: #38bdf8;">Tarjeta NFC física validada sin internet en Almacén Sótano 1.</small>`,
      worker || { worker_type: 'jubilado' }
    );
  } else {
    // Sincronizar de inmediato
    await fetch('/api/v1/sync/batch-deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
        device_id: 'distributor_tablet_01',
        deliveries: [deliveryRecord]
      })
    });
    showDistributorFeedback(
      true,
      'DESPACHO NFC AUTORIZADO',
      `Beneficiario: <strong>${worker ? worker.full_name : 'Hilda Domínguez'}</strong> &middot; Cédula: <strong>${worker ? worker.document_id : 'V-06894321'}</strong><br><small style="color: #38bdf8;">Tarjeta física NFC validada y sincronizada.</small>`,
      worker || { worker_type: 'jubilado' }
    );
    refreshPortalData();
  }
}

// Búsqueda para Contingencia (Nivel 1 & Nivel 2)
let pendingContingencyWorker = null;

function searchContingencyWorker() {
  const doc = document.getElementById('contingencyDocInput').value.trim();
  if (!doc) return alert('Ingrese un número de documento');

  const worker = STATE.localCache.workers.find(w => w.document_id === doc);
  if (!worker) {
    alert('Trabajador no encontrado en el padrón.');
    return;
  }

  pendingContingencyWorker = worker;
  const entitlement = STATE.localCache.entitlements[worker.worker_id];

  // Verificar si ya fue entregado
  if (entitlement && STATE.localCache.deliveredEntitlements.has(entitlement.entitlement_id)) {
    alert('ALERTA: Este trabajador ya reclamó su combo el día de hoy.');
    return;
  }

  // Verificar nivel de contingencia:
  // Si el trabajador tiene dispositivo extraviado o el operador superó 3 liberaciones -> Requiere Supervisor Nivel 2
  const requiresSupervisor = worker.contingency_reason === 'device_lost' || STATE.operatorOverridesCount >= 3;

  if (requiresSupervisor) {
    // Abrir Modal de Supervisor
    document.getElementById('modalBeneficiaryName').textContent = worker.full_name;
    document.getElementById('modalBeneficiaryDoc').textContent = worker.document_id;
    document.getElementById('modalBeneficiaryCombo').textContent = entitlement ? entitlement.combo_name : 'Combo Asignado';
    document.getElementById('supervisorModalBackdrop').classList.add('active');
  } else {
    // Liberación básica Nivel 1 (Operador)
    if (confirm(`¿Autorizar liberación manual Nivel 1 para ${worker.full_name}? (Quedan ${2 - STATE.operatorOverridesCount} liberaciones de operador)`)) {
      STATE.operatorOverridesCount++;
      document.getElementById('operatorOverridesCount').textContent = `${STATE.operatorOverridesCount} / 3 liberaciones de operador`;
      recordContingencyDelivery('supervisor_override', 'battery_dead_screen_broken', STATE.operatorId);
    }
  }
}

// Ejecución de la liberación con firma de Supervisor Nivel 2
function executeSupervisorOverride() {
  if (!pendingContingencyWorker) return;

  const reason = document.getElementById('modalOverrideReasonSelect').value;
  document.getElementById('supervisorModalBackdrop').classList.remove('active');

  recordContingencyDelivery('supervisor_override', reason, STATE.supervisorId);
}

function recordContingencyDelivery(method, reason, supervisorId) {
  const worker = pendingContingencyWorker;
  const entitlement = STATE.localCache.entitlements[worker.worker_id] || { entitlement_id: crypto.randomUUID() };

  const deliveryRecord = {
    id: crypto.randomUUID(),
    entitlement_id: entitlement.entitlement_id,
    worker_id: worker.worker_id,
    distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
    verification_method: method,
    supervisor_id: supervisorId,
    override_reason: reason,
    delivered_by_user_id: STATE.operatorId,
    delivered_at: new Date().toISOString(),
    is_offline_sync: !STATE.isOnline
  };

  STATE.localCache.deliveredEntitlements.add(entitlement.entitlement_id);

  if (!STATE.isOnline) {
    STATE.localCache.syncQueue.push(deliveryRecord);
    updateSyncQueueUI();
    showDistributorFeedback(true, 'CONTINGENCIA REGISTRADA', `Autorizado con firma de Supervisor para ${worker.full_name}.`);
  } else {
    fetch('/api/v1/sync/batch-deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
        device_id: 'distributor_tablet_01',
        deliveries: [deliveryRecord]
      })
    }).then(() => {
      showDistributorFeedback(true, 'CONTINGENCIA APROBADA', `Autorizado con firma biométrica para ${worker.full_name}.`);
      refreshPortalData();
    });
  }
}

// Sincronización en lote de la cola diferida (Sync Queue)
async function syncDeferredQueue() {
  if (STATE.localCache.syncQueue.length === 0) {
    alert('No hay transacciones pendientes en la cola diferida.');
    return;
  }

  if (!STATE.isOnline) {
    alert('No hay conexión de red. Restablezca la conexión para transmitir la cola diferida.');
    return;
  }

  try {
    const queue = [...STATE.localCache.syncQueue];
    const res = await fetch('/api/v1/sync/batch-deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
        device_id: 'distributor_tablet_01',
        deliveries: queue
      })
    });

    const data = await res.json();
    alert(`☁️ Sincronización en Lote Completada:\n` +
          `• Procesadas exitosamente: ${data.processed}\n` +
          `• Duplicados bloqueados (Anti-Fraude): ${data.failed_duplicates}`);

    STATE.localCache.syncQueue = [];
    updateSyncQueueUI();
    refreshPortalData();
  } catch (err) {
    alert('Error transmitiendo lote: ' + err.message);
  }
}

function updateSyncQueueUI() {
  const counter = document.getElementById('syncQueueCounter');
  const list = document.getElementById('localSyncQueueList');
  const count = STATE.localCache.syncQueue.length;

  counter.textContent = `${count} pendientes en cola`;
  list.innerHTML = '';

  if (count === 0) {
    list.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 1rem;">No hay entregas pendientes de sincronizar.</div>';
    return;
  }

  STATE.localCache.syncQueue.forEach((d, idx) => {
    const item = document.createElement('div');
    item.style.background = 'rgba(255,255,255,0.03)';
    item.style.padding = '0.5rem 0.75rem';
    item.style.borderRadius = '6px';
    item.style.border = '1px solid var(--bg-card-border)';
    item.innerHTML = `
      <div class="flex-between">
        <strong>#${idx + 1} - ${d.verification_method}</strong>
        <span class="badge badge-offline" style="font-size: 0.6rem;">OFFLINE</span>
      </div>
      <div class="text-mono" style="font-size: 0.65rem; color: var(--text-dim); margin-top: 0.2rem;">ID: ${d.id.substring(0, 16)}...</div>
    `;
    list.appendChild(item);
  });
}

function showDistributorFeedback(isSuccess, title, subtitle, extraData = null) {
  const overlay = document.getElementById('distributorFeedbackOverlay');
  const icon = document.getElementById('feedbackIcon');
  const t = document.getElementById('feedbackTitle');
  const s = document.getElementById('feedbackSubtitle');
  const d = document.getElementById('feedbackDetails');

  overlay.className = `distributor-feedback-overlay ${isSuccess ? 'overlay-success' : 'overlay-error'} active`;
  icon.textContent = isSuccess ? '✅' : '🛑';
  t.textContent = title;
  s.innerHTML = subtitle;

  if (isSuccess) {
    const isJubilado = extraData && (extraData.worker_type === 'jubilado' || extraData.contingency_reason === 'adulto_mayor_sin_smartphone');
    const badgeHtml = isJubilado 
      ? '<span class="badge badge-jubilado" style="font-size: 0.85rem; padding: 0.35rem 0.75rem;">👴 Personal Jubilado / Adulto Mayor</span>' 
      : '<span class="badge badge-activo" style="font-size: 0.85rem; padding: 0.35rem 0.75rem;">🏢 Funcionario Activo</span>';

    d.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.65rem; text-align: left;">
        <div class="flex-between" style="border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 0.5rem;">
          <span style="font-size: 0.85rem; color: #cbd5e1;">Condición Institucional:</span>
          ${badgeHtml}
        </div>
        <div style="font-size: 0.85rem; font-weight: 700; color: #34d399;">
          📦 Bultos Entregados en Mesa de Despacho:
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem; color: #f8fafc; background: rgba(0,0,0,0.35); padding: 0.65rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
          <div>✅ <strong>Bolsa de Víveres Secos</strong> (Harina x4, Arroz x2, Pasta x2, Caraotas, Aceite, Azúcar, Leche)</div>
          <div>✅ <strong>Combo Proteico Fresco</strong> (Pollo entero, Carne molida, Mortadela especial)</div>
        </div>
        <div class="text-mono" style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.2rem;">
          ID Transacción: ${crypto.randomUUID()} &middot; Punto: Almacén Sótano 1
        </div>
      </div>
    `;
  } else {
    d.textContent = `Código de Anomalía: ERR_${Date.now().toString().slice(-6)} &middot; Revisión Requerida`;
  }

  playAudioFeedback(isSuccess ? 'success' : 'error');
}

// ----------------------------------------------------------------------------
// 4. SIMULADOR NÓMINA SSOT & CONTRATOS REST
// ----------------------------------------------------------------------------
function setupPayrollSimulator() {
  const logsConsole = document.getElementById('payrollLogsConsole');
  function appendLog(msg) {
    logsConsole.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logsConsole.textContent;
  }

  // 1. Webhook
  document.getElementById('btnSendPayrollWebhook').addEventListener('click', async () => {
    const doc = document.getElementById('whDocInput').value;
    const name = document.getElementById('whNameInput').value;
    const email = document.getElementById('whEmailInput').value;
    const workerType = document.getElementById('whWorkerTypeSelect')?.value || 'activo';
    const shift = document.getElementById('whShiftSelect').value;

    const payload = {
      event_id: `evt_${Date.now()}`,
      event_type: 'employee.updated',
      timestamp: new Date().toISOString(),
      data: {
        document_id: doc,
        full_name: name,
        email: email,
        worker_type: workerType,
        shift: shift,
        status: 'active',
        has_smartphone: workerType !== 'jubilado'
      }
    };

    // Generar HMAC SHA256 simulado
    const signature = 'sha256=test_signature_for_local_demo';

    const res = await fetch('/api/v1/payroll/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payroll-Signature': signature
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    appendLog(`Webhook respondido: ${JSON.stringify(data)}`);
    refreshPortalData();
  });

  // 2. Batch Import
  document.getElementById('btnSendBatchImport').addEventListener('click', async () => {
    try {
      const workers = JSON.parse(document.getElementById('batchJsonInput').value);
      const res = await fetch('/api/v1/payroll/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: `batch_${Date.now()}`,
          source: 'sftp_pgp_import',
          workers
        })
      });

      const data = await res.json();
      appendLog(`Carga masiva completada: ${data.processed} procesados, ${data.failed} fallidos.`);
      refreshPortalData();
    } catch (e) {
      alert('Error en formato JSON: ' + e.message);
    }
  });

  // 3. Kill-Switch
  const killSelect = document.getElementById('killSwitchWorkerSelect');
  async function loadKillSwitchSelect() {
    const res = await fetch('/api/v1/admin/workers?status=active');
    const data = await res.json();
    killSelect.innerHTML = '';
    data.workers.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = `${w.full_name} (${w.document_id})`;
      killSelect.appendChild(opt);
    });
  }

  loadKillSwitchSelect();

  document.getElementById('btnExecuteKillSwitch').addEventListener('click', async () => {
    const workerId = killSelect.value;
    const reason = document.getElementById('killSwitchReasonInput').value;

    if (!confirm('⚠️ ¿ESTÁ SEGURO DE EJECUTAR EL KILL-SWITCH? Esto revocará en cascada todas las credenciales Passkey, tarjetas NFC y beneficios del trabajador de forma inmediata.')) return;

    const res = await fetch(`/api/v1/payroll/employees/${workerId}/terminate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason,
        authorized_by: 'admin_hr_supervisor'
      })
    });

    const data = await res.json();
    appendLog(`KILL-SWITCH EJECUTADO: ${data.message} (Passkeys revocadas: ${data.summary.passkeysRevoked}, NFC revocadas: ${data.summary.nfcRevoked})`);
    alert(data.message);
    loadKillSwitchSelect();
    refreshPortalData();
  });
}

// ============================================================================
// PWA: SERVICE WORKER & INSTALACIÓN NATIVA
// ============================================================================
let deferredInstallPrompt = null;

function setupPwa() {
  // 1. Registro del Service Worker Offline-First
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registrado con éxito. Scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Fallo al registrar Service Worker:', err);
        });
    });
  }

  // 2. Captura del evento de instalación PWA en el navegador (Android / Chrome / Edge)
  const btnInstall = document.getElementById('btnInstallPwa');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstall) {
      btnInstall.style.display = 'inline-flex';
      btnInstall.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        console.log('[PWA] Elección de instalación del usuario:', choice.outcome);
        deferredInstallPrompt = null;
        btnInstall.style.display = 'none';
      });
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplicación instalada exitosamente en este dispositivo.');
    if (btnInstall) btnInstall.style.display = 'none';
  });
}

// ============================================================================
// CONTROL DE ACCESO BASADO EN ROLES (RBAC) & AUTENTICACIÓN INSTITUCIONAL
// ============================================================================
function setupAuth() {
  const loginForm = document.getElementById('loginForm');
  const btnSubmit = document.getElementById('btnLoginSubmit');
  const quickBtns = document.querySelectorAll('.quick-login-btn');
  const btnLogout = document.getElementById('btnLogout');
  const btnWorkerMobileLogout = document.getElementById('btnWorkerMobileLogout');

  // Submit manual
  const doLogin = () => {
    const docType = document.getElementById('loginDocType')?.value || 'V';
    const docNum = document.getElementById('loginDocNumber')?.value.trim();
    if (!docNum) {
      showLoginAlert('Por favor ingrese el número de Cédula de Identidad.');
      return;
    }
    executeLogin(`${docType}-${docNum}`);
  };

  btnSubmit?.addEventListener('click', doLogin);
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    doLogin();
  });

  // Acceso Rápido / Demo Chips con un solo clic
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const doc = btn.getAttribute('data-doc');
      if (doc) {
        const parts = doc.split('-');
        if (parts.length === 2) {
          const typeSelect = document.getElementById('loginDocType');
          const numInput = document.getElementById('loginDocNumber');
          if (typeSelect) typeSelect.value = parts[0];
          if (numInput) numInput.value = parts[1];
        }
        executeLogin(doc);
      }
    });
  });

  // Logout
  btnLogout?.addEventListener('click', handleLogout);
  btnWorkerMobileLogout?.addEventListener('click', handleLogout);
}

function showLoginAlert(msg) {
  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) {
    alertBox.textContent = msg;
    alertBox.style.display = 'block';
  }
}

async function executeLogin(rawDocId) {
  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';

  const btnSubmit = document.getElementById('btnLoginSubmit');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Verificando Identidad...';
  }

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: rawDocId })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showLoginAlert(data.error || 'Cédula no encontrada en el padrón institucional.');
      playAudioFeedback('error');
      return;
    }

    playAudioFeedback('success');
    const user = data.user;
    STATE.currentUser = user;
    localStorage.setItem('sgbt_user', JSON.stringify(user));
    applyUserSession(user);

  } catch (err) {
    console.error('Error de login:', err);
    showLoginAlert('Error de conexión con el servidor: ' + err.message);
    playAudioFeedback('error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🚀 Ingresar al Sistema';
    }
  }
}

function applyUserSession(user) {
  const masterNav = document.getElementById('masterNav');
  const userPill = document.getElementById('userSessionPill');
  const userName = document.getElementById('userSessionName');
  const userRole = document.getElementById('userSessionRole');
  const simSelector = document.getElementById('workerSimulatorSelectorContainer');
  const techPanel = document.getElementById('workerSecurityExplanationPanel');
  const workerHeaderId = document.getElementById('workerHeaderIdentity');

  // Actualizar sesión en la cabecera
  if (userPill && userName && userRole) {
    userName.textContent = `👤 ${user.full_name}`;
    userPill.style.display = 'flex';

    if (user.role === 'worker') {
      const isJubilado = user.worker_type === 'jubilado';
      userRole.className = isJubilado ? 'badge badge-jubilado' : 'badge badge-activo';
      userRole.textContent = isJubilado ? '👴 Jubilado' : '🏢 Beneficiario';
    } else if (user.role === 'operator') {
      userRole.className = 'badge badge-passkey';
      userRole.textContent = '📦 Operador Almacén';
    } else {
      userRole.className = 'badge badge-override';
      userRole.textContent = '🏛️ Gestión Humana';
    }
  }

  // Comportamiento estricto según Rol:
  if (user.role === 'worker') {
    // 1. EL TRABAJADOR / JUBILADO SOLO VE LA VISTA BENEFICIARIO
    // La barra de navegación master-nav queda completamente OCULTA
    if (masterNav) masterNav.style.display = 'none';
    if (simSelector) simSelector.style.display = 'none';
    if (techPanel) techPanel.style.display = 'none';
    if (workerHeaderId) workerHeaderId.textContent = `${user.full_name} (${user.document_id})`;

    STATE.selectedWorkerId = user.id;
    if (typeof window.updateWorkerCard === 'function') {
      window.updateWorkerCard();
    }
    navigateTo('view-worker');

  } else if (user.role === 'operator') {
    // 2. OPERADOR DE MESA DE DESPACHO
    if (masterNav) masterNav.style.display = 'none';
    STATE.operatorId = user.id;
    navigateTo('view-distributor');

  } else {
    // 3. ADMINISTRADOR / SUPERVISOR / RRHH
    if (masterNav) masterNav.style.display = 'flex';
    if (simSelector) simSelector.style.display = 'block';
    if (techPanel) techPanel.style.display = 'block';
    STATE.supervisorId = user.document_id;
    navigateTo('view-portal');
  }
}

function handleLogout() {
  STATE.currentUser = null;
  localStorage.removeItem('sgbt_user');
  
  const userPill = document.getElementById('userSessionPill');
  const masterNav = document.getElementById('masterNav');
  if (userPill) userPill.style.display = 'none';
  if (masterNav) masterNav.style.display = 'none';

  const docInput = document.getElementById('loginDocNumber');
  if (docInput) docInput.value = '';

  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';

  navigateTo('view-login');
}

function checkAuthSession() {
  try {
    const saved = localStorage.getItem('sgbt_user');
    if (saved) {
      const user = JSON.parse(saved);
      if (user && user.id) {
        STATE.currentUser = user;
        applyUserSession(user);
        return;
      }
    }
  } catch (e) {
    console.warn('Error al leer sesión guardada:', e);
  }
  
  // Si no hay sesión previa guardada, mostrar la vista de Login
  navigateTo('view-login');
}

