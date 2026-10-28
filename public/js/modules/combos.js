// ============================================================================
// MODULE: COMBOS, LOGISTICS, CAMPAIGNS & DISTRIBUTION POINTS
// ============================================================================

let cachedDistributionPoints = [];
let cachedCombos = [];
let cachedCampaignsList = [];
let currentCombosGrouping = 'campaign'; // 'campaign' | 'flat'
let currentCombosCampaignFilter = 'all'; // 'all' | 'unassigned' | <uuid>
let currentCombosSortOrder = 'campaign_desc';

window.populateComboCampaignModalSelect = async function(selectedId = '') {
  const select = document.getElementById('comboCampaignSelect');
  if (!select) return;

  if (!cachedCampaignsList || cachedCampaignsList.length === 0) {
    try {
      const res = await API.get('/api/v1/admin/campaigns');
      cachedCampaignsList = Array.isArray(res) ? res : (res && res.campaigns ? res.campaigns : []);
    } catch (e) {
      console.warn('No se pudieron precargar jornadas para modal:', e);
    }
  }

  select.innerHTML = '<option value="">🌐 Sin Jornada Fija (Beneficio Permanente / Multijornada)</option>';
  cachedCampaignsList.forEach(camp => {
    const opt = document.createElement('option');
    opt.value = camp.id;
    const statusText = camp.status === 'active' ? 'EN CURSO' : (camp.status === 'scheduled' ? 'PROGRAMADA' : 'FINALIZADA');
    opt.textContent = `📅 ${camp.name} [${statusText}]`;
    if (camp.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
  if (selectedId) {
    select.value = selectedId;
  }
};

function updateCombosToolbarCampaignFilter() {
  const filterSelect = document.getElementById('filterCombosCampaignSelect');
  if (!filterSelect) return;

  const currentVal = filterSelect.value || currentCombosCampaignFilter || 'all';
  filterSelect.innerHTML = `
    <option value="all">🌐 Todas las Jornadas</option>
    <option value="unassigned">🌐 Combos Permanentes / Sin Jornada</option>
  `;

  cachedCampaignsList.forEach(camp => {
    const opt = document.createElement('option');
    opt.value = camp.id;
    const statusText = camp.status === 'active' ? 'En Curso' : (camp.status === 'scheduled' ? 'Programada' : 'Finalizada');
    opt.textContent = `📅 ${camp.name} (${statusText})`;
    filterSelect.appendChild(opt);
  });

  if ([...filterSelect.options].some(o => o.value === currentVal)) {
    filterSelect.value = currentVal;
  } else {
    filterSelect.value = 'all';
    currentCombosCampaignFilter = 'all';
  }
}

function buildComboCardElement(c) {
  const card = document.createElement('div');
  
  let cardClass = 'package-card';
  let icon = '⭐';
  let tagClass = 'badge-viveres';
  let categoryLabel = (c.category || '').replace('_', ' ').toUpperCase();

  switch (c.category) {
    case 'bolsa_viveres':
      cardClass += ' viveres-card';
      icon = '📦';
      tagClass = 'badge-viveres';
      categoryLabel = 'VÍVERES SECOS';
      break;
    case 'combo_proteico':
    case 'proteico':
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

  if (!c.is_active) {
    cardClass += ' combo-card-inactive';
  }

  const rubrosText = c.items_detail || c.description || '';
  const rubros = rubrosText.split(/,|\n/).map(r => r.trim()).filter(Boolean);
  const rubrosHtml = rubros.length > 0 
    ? `<div style="margin: 0.6rem 0; font-size: 0.76rem; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem 0.75rem;">
         <strong style="color: #0284c7; display: block; margin-bottom: 0.25rem;">📋 Rubros Incluidos:</strong>
         <ul style="margin: 0; padding-left: 1.1rem; line-height: 1.4;">
           ${rubros.slice(0, 5).map(item => `<li>${item}</li>`).join('')}
           ${rubros.length > 5 ? `<li style="color: #64748b; font-style: italic;">... y ${rubros.length - 5} rubros más</li>` : ''}
         </ul>
       </div>`
    : `<p style="font-size: 0.8rem; color: #64748b; margin-bottom: 0.6rem;">${c.description || 'Sin descripción'}</p>`;

  const isCold = (c.conservation || '').includes('Frío');

  // Badge de Jornada Institucional
  let campaignBadgeHtml = '';
  if (c.campaign_name) {
    const isAct = c.campaign_status === 'active';
    const isSched = c.campaign_status === 'scheduled';
    const bg = isAct ? '#dcfce7' : (isSched ? '#fef9c3' : '#f1f5f9');
    const color = isAct ? '#15803d' : (isSched ? '#854d0e' : '#475569');
    const border = isAct ? '#bbf7d0' : (isSched ? '#fef08a' : '#cbd5e1');
    const dot = isAct ? '🟢' : (isSched ? '🟡' : '⚪');
    campaignBadgeHtml = `
      <div style="margin: 0.35rem 0 0.5rem 0; display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; font-size: 0.72rem; background: ${bg}; color: ${color}; border: 1px solid ${border}; padding: 0.25rem 0.55rem; border-radius: 6px; font-weight: 700;">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;" title="Jornada: ${c.campaign_name}">
          📅 ${c.campaign_name}
        </span>
        <span style="font-size: 0.65rem; white-space: nowrap;">${dot} ${(c.campaign_status || 'activa').toUpperCase()}</span>
      </div>
    `;
  } else {
    campaignBadgeHtml = `
      <div style="margin: 0.35rem 0 0.5rem 0; display: flex; align-items: center; gap: 0.4rem; font-size: 0.7rem; background: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1; padding: 0.2rem 0.55rem; border-radius: 6px; font-weight: 600;">
        <span>🌐</span>
        <span>Beneficio Permanente / Multijornada</span>
      </div>
    `;
  }

  card.className = cardClass;
  card.style.opacity = c.is_active ? '1' : '0.78';
  card.style.border = c.is_active ? '1px solid rgba(2, 132, 199, 0.25)' : '1px dashed #cbd5e1';

  card.innerHTML = `
    <div class="package-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
      <div class="package-card-title">
        <span style="font-size: 1.05rem; font-weight: 800;">${c.icon || icon} ${c.name}</span>
      </div>
      <div style="display: flex; gap: 0.35rem; align-items: center;">
        <span class="package-card-badge ${tagClass}">${categoryLabel}</span>
        <span class="badge" style="background: ${c.is_active ? '#dcfce7' : '#fee2e2'}; color: ${c.is_active ? '#15803d' : '#991b1b'}; font-weight: 800; font-size: 0.68rem; padding: 0.2rem 0.5rem; border-radius: 999px; border: 1px solid ${c.is_active ? '#bbf7d0' : '#fecaca'};">
          ${c.is_active ? '● Activo' : '○ Inactivo'}
        </span>
      </div>
    </div>
    ${campaignBadgeHtml}
    ${c.mesa_name ? `
      <div style="display: flex; gap: 0.35rem; align-items: center; margin: 0.25rem 0 0.5rem 0; flex-wrap: wrap;">
        <span style="font-size: 0.72rem; font-weight: 800; background: #f1f5f9; color: #1e293b; padding: 0.15rem 0.5rem; border-radius: 4px; border: 1px solid #cbd5e1;">📍 ${c.mesa_name}</span>
        <span style="font-size: 0.72rem; font-weight: 700; background: ${isCold ? '#e0f2fe' : '#f0fdf4'}; color: ${isCold ? '#0369a1' : '#166534'}; padding: 0.15rem 0.5rem; border-radius: 4px; border: 1px solid ${isCold ? '#bae6fd' : '#bbf7d0'};">
          ${isCold ? '❄️ Cadena de Frío' : '🌡️ Ambiente'}
        </span>
        ${c.weight_kg ? `<span style="font-size: 0.7rem; color: #475569; font-weight: 700;">⚖️ ~${c.weight_kg} kg</span>` : ''}
        ${c.target_qty ? `<span style="font-size: 0.7rem; color: #64748b; font-weight: 600;">(Cuota: ${c.target_qty})</span>` : ''}
      </div>
    ` : ''}
    ${rubrosHtml}
    
    <!-- BARRA DE GESTIÓN: ACTIVAR/DESACTIVAR, EDITAR Y ELIMINAR -->
    <div class="combo-meta" style="font-size: 0.75rem; border-top: 1px solid #f1f5f9; padding-top: 0.65rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.4rem;">
      <span style="color: #64748b; font-size: 0.72rem;">📦 ${c.dietary_info || (c.conservation ? c.conservation : 'Almacén Estándar')}</span>
      <div style="display: flex; gap: 0.35rem; align-items: center; margin-left: auto;">
        <!-- BOTÓN ACTIVAR / DESACTIVAR -->
        <button class="btn btn-outline btn-toggle-combo" data-id="${c.id}" data-name="${c.name}" style="padding: 0.22rem 0.6rem; font-size: 0.72rem; font-weight: 700; border-radius: 6px; ${c.is_active ? 'border-color: #fde047; color: #854d0e; background: #fefce8;' : 'border-color: #86efac; color: #166534; background: #f0fdf4;'}" title="${c.is_active ? 'Desactivar este combo' : 'Activar este combo'}">
          ${c.is_active ? '⏸️ Desactivar' : '▶️ Activar'}
        </button>

        <!-- BOTÓN EDITAR -->
        <button class="btn btn-outline btn-edit-combo" data-id="${c.id}" style="padding: 0.22rem 0.6rem; font-size: 0.72rem; font-weight: 700; border-color: #bae6fd; color: #0284c7; background: #f0f9ff; border-radius: 6px;" title="Editar datos y rubros del combo">
          ✏️ Editar
        </button>

        <!-- BOTÓN ELIMINAR -->
        <button class="btn btn-outline btn-delete-combo" data-id="${c.id}" style="padding: 0.22rem 0.5rem; font-size: 0.72rem; border-color: #fca5a5; color: #dc2626; border-radius: 6px;" title="Eliminar del catálogo">
          🗑️
        </button>
      </div>
    </div>
  `;
  return card;
}

function attachComboCardActionListeners() {
  document.querySelectorAll('.btn-toggle-combo').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      try {
        let res;
        if (window.API && typeof window.API.patch === 'function') {
          res = await window.API.patch(`/api/v1/admin/combos/${id}/toggle-status`, {});
        } else {
          const resp = await fetch(`/api/v1/admin/combos/${id}/toggle-status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
          });
          res = await resp.json();
        }
        if (window.Toast && typeof window.Toast.success === 'function') {
          window.Toast.success(res.message);
        } else if (typeof window.showToast === 'function') {
          window.showToast(res.message, 'success');
        }
        if (typeof SoundManager !== 'undefined' && SoundManager.playSuccess) SoundManager.playSuccess();
        await loadCombosCatalog();
        if (typeof window.refreshPortalData === 'function') await window.refreshPortalData();
        if (window.ManualDispatch && typeof window.ManualDispatch.loadTodaySummary === 'function') {
          await window.ManualDispatch.loadTodaySummary();
        }
        window.dispatchEvent(new CustomEvent('combos:updated', { detail: res }));
      } catch (err) {
        console.error('[TOGGLE COMBO ERROR]', err);
        if (window.Toast && typeof window.Toast.error === 'function') {
          window.Toast.error('Error al cambiar estado: ' + err.message);
        } else if (typeof window.showToast === 'function') {
          window.showToast('Error al cambiar estado: ' + err.message, 'error');
        }
      } finally {
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('.btn-edit-combo').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const combo = cachedCombos.find(item => item.id === id);
      if (combo && typeof window.openEditComboModal === 'function') {
        window.openEditComboModal(combo);
      }
    });
  });

  document.querySelectorAll('.btn-delete-combo').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (!confirm('¿Desea eliminar o retirar este beneficio del catálogo activo?')) return;
      btn.disabled = true;
      try {
        let delData;
        if (window.API && typeof window.API.delete === 'function') {
          delData = await window.API.delete(`/api/v1/admin/combos/${id}`);
        } else {
          const resp = await fetch(`/api/v1/admin/combos/${id}`, { method: 'DELETE' });
          delData = await resp.json();
        }
        if (window.Toast && typeof window.Toast.info === 'function') {
          window.Toast.info(delData.message || 'Beneficio eliminado');
        } else if (typeof window.showToast === 'function') {
          window.showToast(delData.message || 'Beneficio eliminado', 'info');
        }
        await loadCombosCatalog();
        if (typeof window.refreshPortalData === 'function') await window.refreshPortalData();
        if (window.ManualDispatch && typeof window.ManualDispatch.loadTodaySummary === 'function') {
          await window.ManualDispatch.loadTodaySummary();
        }
        window.dispatchEvent(new CustomEvent('combos:updated', { detail: delData }));
      } catch (err) {
        console.error('[DELETE COMBO ERROR]', err);
        if (window.Toast && typeof window.Toast.error === 'function') {
          window.Toast.error('Error al eliminar beneficio: ' + err.message);
        } else if (typeof window.showToast === 'function') {
          window.showToast('Error al eliminar beneficio: ' + err.message, 'error');
        }
      } finally {
        btn.disabled = false;
      }
    });
  });
}

window.renderCombosView = function() {
  const grid = document.getElementById('combosCatalogGrid');
  if (!grid) return;

  grid.innerHTML = '';

  // 1. Filtrado
  let filtered = [...cachedCombos];
  if (currentCombosCampaignFilter === 'unassigned') {
    filtered = filtered.filter(c => !c.campaign_id);
  } else if (currentCombosCampaignFilter !== 'all') {
    filtered = filtered.filter(c => c.campaign_id === currentCombosCampaignFilter);
  }

  // Actualizar contador
  const badgeCounter = document.getElementById('combosCatalogCounterBadge');
  if (badgeCounter) {
    badgeCounter.textContent = `${filtered.length} ${filtered.length === 1 ? 'combo' : 'combos'}`;
  }

  // Si está vacío
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1.5rem; color: #475569; background: #ffffff; border: 2px dashed #cbd5e1; border-radius: var(--radius-md); box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📦</div>
        <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a; margin-bottom: 0.35rem;">No se encontraron beneficios con los filtros aplicados</div>
        <p style="font-size: 0.82rem; color: #64748b; margin-bottom: 1.25rem; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.45;">
          ${currentCombosCampaignFilter !== 'all' ? 'No hay combos asociados a la jornada seleccionada.' : 'Configure los combos institucionales para las jornadas de despacho.'}
        </p>
        <button type="button" class="btn btn-primary" onclick="if(typeof openCreateComboModal === 'function') openCreateComboModal();" style="font-size: 0.85rem; font-weight: 700; padding: 0.65rem 1.4rem; display: inline-flex; align-items: center; gap: 0.45rem;">
          <svg class="icon-svg icon-xs" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>Crear Nuevo Beneficio Institucional</span>
        </button>
      </div>
    `;
    return;
  }

  // 2. Ordenamiento
  filtered.sort((a, b) => {
    switch (currentCombosSortOrder) {
      case 'campaign_desc': {
        if (a.campaign_id && !b.campaign_id) return -1;
        if (!a.campaign_id && b.campaign_id) return 1;
        const dateA = a.campaign_start_date || a.created_at || '';
        const dateB = b.campaign_start_date || b.created_at || '';
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return (a.name || '').localeCompare(b.name || '');
      }
      case 'campaign_asc': {
        if (a.campaign_id && !b.campaign_id) return -1;
        if (!a.campaign_id && b.campaign_id) return 1;
        const dateA = a.campaign_start_date || a.created_at || '';
        const dateB = b.campaign_start_date || b.created_at || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.name || '').localeCompare(b.name || '');
      }
      case 'name_asc':
        return (a.name || '').localeCompare(b.name || '');
      case 'name_desc':
        return (b.name || '').localeCompare(a.name || '');
      case 'weight_desc':
        return (parseFloat(b.weight_kg) || 0) - (parseFloat(a.weight_kg) || 0);
      case 'status_active': {
        const actA = a.is_active ? 1 : 0;
        const actB = b.is_active ? 1 : 0;
        if (actB !== actA) return actB - actA;
        return (a.name || '').localeCompare(b.name || '');
      }
      default:
        return 0;
    }
  });

  // 3. Renderizado según modo de agrupación
  if (currentCombosGrouping === 'campaign') {
    const groups = new Map();
    filtered.forEach(c => {
      const key = c.campaign_id || '__unassigned__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    });

    const sortedGroupKeys = Array.from(groups.keys()).sort((k1, k2) => {
      if (k1 === '__unassigned__') return 1;
      if (k2 === '__unassigned__') return -1;
      const c1 = groups.get(k1)[0];
      const c2 = groups.get(k2)[0];
      if (currentCombosSortOrder === 'campaign_asc') {
        const d1 = c1.campaign_start_date || '';
        const d2 = c2.campaign_start_date || '';
        return d1.localeCompare(d2);
      } else {
        const d1 = c1.campaign_start_date || '';
        const d2 = c2.campaign_start_date || '';
        return d2.localeCompare(d1);
      }
    });

    sortedGroupKeys.forEach(key => {
      const combosInGroup = groups.get(key);
      const isUnassigned = key === '__unassigned__';
      const sample = combosInGroup[0];

      const groupSection = document.createElement('div');
      groupSection.className = 'campaign-combos-group-block';
      groupSection.style.cssText = `
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: var(--radius-md);
        box-shadow: 0 2px 6px rgba(0,0,0,0.03);
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      `;

      let headerHtml = '';
      if (isUnassigned) {
        headerHtml = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #e2e8f0; padding-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.4rem;">🌐</span>
              <div>
                <h4 style="margin: 0; font-size: 1rem; font-weight: 800; color: #1e293b;">Combos Permanentes & Multijornada</h4>
                <div style="font-size: 0.74rem; color: #64748b;">Disponibles para asignación libre o despachos generales en cualquier punto</div>
              </div>
            </div>
            <span class="badge" style="background: #f1f5f9; color: #475569; font-weight: 700; font-size: 0.74rem; padding: 0.3rem 0.65rem; border-radius: 999px; border: 1px solid #cbd5e1;">
              📦 ${combosInGroup.length} ${combosInGroup.length === 1 ? 'combo disponible' : 'combos disponibles'}
            </span>
          </div>
        `;
      } else {
        const statusBadge = sample.campaign_status === 'active'
          ? '<span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 800; font-size: 0.72rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid #bbf7d0;">🟢 En Curso</span>'
          : (sample.campaign_status === 'scheduled'
             ? '<span class="badge" style="background: #fef9c3; color: #854d0e; font-weight: 800; font-size: 0.72rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid #fef08a;">🟡 Programada</span>'
             : '<span class="badge" style="background: #f1f5f9; color: #475569; font-weight: 700; font-size: 0.72rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid #cbd5e1;">⚪ Finalizada</span>');

        const dateRangeText = (sample.campaign_start_date || sample.campaign_end_date)
          ? `🗓️ ${sample.campaign_start_date || ''} ${sample.campaign_end_date ? '→ ' + sample.campaign_end_date : ''}`
          : '';

        headerHtml = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.4rem;">📅</span>
              <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                  <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #0f172a;">${sample.campaign_name || 'Jornada Institucional'}</h4>
                  ${statusBadge}
                </div>
                ${dateRangeText ? `<div style="font-size: 0.74rem; color: #64748b; margin-top: 0.15rem; font-weight: 600;">${dateRangeText}</div>` : ''}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="badge" style="background: #e0f2fe; color: #0369a1; font-weight: 800; font-size: 0.74rem; padding: 0.3rem 0.65rem; border-radius: 999px; border: 1px solid #bae6fd;">
                🍱 ${combosInGroup.length} ${combosInGroup.length === 1 ? 'combo asignado' : 'combos asignados'}
              </span>
            </div>
          </div>
        `;
      }

      groupSection.innerHTML = headerHtml;

      const subGrid = document.createElement('div');
      subGrid.className = 'combos-group-subgrid';
      subGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;';

      combosInGroup.forEach(c => {
        subGrid.appendChild(buildComboCardElement(c));
      });

      groupSection.appendChild(subGrid);
      grid.appendChild(groupSection);
    });
  } else {
    // Cuadrícula plana continua
    const flatGrid = document.createElement('div');
    flatGrid.className = 'combos-flat-grid';
    flatGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem;';

    filtered.forEach(c => {
      flatGrid.appendChild(buildComboCardElement(c));
    });

    grid.appendChild(flatGrid);
  }

  // Delegar eventos de botones
  attachComboCardActionListeners();
};

window.loadCombosCatalog = async function() {
  const grid = document.getElementById('combosCatalogGrid');
  if (!grid) return;

  try {
    const [combosRes, campaignsRes] = await Promise.allSettled([
      API.get('/api/v1/admin/combos'),
      API.get('/api/v1/admin/campaigns')
    ]);

    if (combosRes.status === 'fulfilled') {
      const combos = combosRes.value;
      cachedCombos = Array.isArray(combos) ? combos : (combos && combos.combos ? combos.combos : []);
    } else {
      console.warn('Error cargando combos:', combosRes.reason);
    }

    if (campaignsRes.status === 'fulfilled') {
      const camps = campaignsRes.value;
      cachedCampaignsList = Array.isArray(camps) ? camps : (camps && camps.campaigns ? camps.campaigns : []);
    }

    updateCombosToolbarCampaignFilter();
    renderCombosView();
  } catch (err) {
    console.error('[LOAD COMBOS ERROR]', err);
  }
};

window.openCreateComboModal = async function(preset = null) {
  if (!document.getElementById('createComboModalBackdrop') && typeof loadTemplates === 'function') {
    await loadTemplates();
  }
  const modal = document.getElementById('createComboModalBackdrop');
  if (!modal) {
    console.error('Modal #createComboModalBackdrop no encontrado');
    return;
  }

  const form = document.getElementById('createComboForm');
  if (form) form.reset();

  const idInput = document.getElementById('comboIdInput');
  if (idInput) idInput.value = '';

  const modalTitle = document.getElementById('comboModalTitle');
  if (modalTitle) modalTitle.textContent = '⚙️ Configurar Nuevo Beneficio Institucional';

  const submitBtn = document.getElementById('btnSubmitCreateCombo');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Guardar e Incorporar al Catálogo';
  }

  const activeCheckbox = document.getElementById('comboActiveCheckbox');
  const activeLabel = document.getElementById('comboActiveLabel');
  if (activeCheckbox) activeCheckbox.checked = true;
  if (activeLabel) {
    activeLabel.textContent = 'ACTIVO';
    activeLabel.style.color = '#16a34a';
  }

  if (typeof populateComboCampaignModalSelect === 'function') {
    await populateComboCampaignModalSelect('');
  }

  if (preset === 'escolares') {
    const nameInput = document.getElementById('comboNameInput');
    const catSelect = document.getElementById('comboCategorySelect');
    const logSelect = document.getElementById('comboLogisticSelect');
    const itemsInput = document.getElementById('comboItemsInput');
    const mesaInput = document.getElementById('comboMesaInput');
    const weightInput = document.getElementById('comboWeightInput');
    const groupSelect = document.getElementById('comboTargetGroupSelect');
    const caloriesInput = document.getElementById('comboCaloriesInput');

    if (nameInput) nameInput.value = 'Combo Escolar "Paso a Clases" MIPPCI';
    if (catSelect) catSelect.value = 'utiles_escolares';
    if (logSelect) logSelect.value = 'Almacén Seco / Logística Estándar';
    if (itemsInput) itemsInput.value = '6 Cuadernos engrapados, 1 Morral tricolor impermeable, 1 Caja de lápices grafito 2B, 1 Juego de geometría, 1 Caja de creyones de madera, 1 Pega blanca líquida, 1 Tijera escolar, 1 Sacapuntas';
    if (mesaInput) mesaInput.value = 'Mesa 3 - Educación & Familia';
    if (weightInput) weightInput.value = 3.5;
    if (groupSelect) groupSelect.value = 'Personal con Hijos / Cargas Familiares';
    if (caloriesInput) caloriesInput.value = '0';
  } else if (preset === 'higienico') {
    const nameInput = document.getElementById('comboNameInput');
    const catSelect = document.getElementById('comboCategorySelect');
    const logSelect = document.getElementById('comboLogisticSelect');
    const itemsInput = document.getElementById('comboItemsInput');
    const mesaInput = document.getElementById('comboMesaInput');
    const weightInput = document.getElementById('comboWeightInput');
    const groupSelect = document.getElementById('comboTargetGroupSelect');
    const caloriesInput = document.getElementById('comboCaloriesInput');

    if (nameInput) nameInput.value = 'Combo Higiénico y Aseo Personal Institucional';
    if (catSelect) catSelect.value = 'combo_higienico';
    if (logSelect) logSelect.value = 'Almacén Seco / Logística Estándar';
    if (itemsInput) itemsInput.value = '4 Jabones de tocador en barra, 2 Cremas dentales con flúor, 2 Champús hidratantes, 2 Desodorantes en roll-on, 4 Rollos de papel higiénico, 1 Jabón lavaplatos líquido, 1 Detergente en polvo multiuso';
    if (mesaInput) mesaInput.value = 'Mesa 2 - Higiene & Aseo';
    if (weightInput) weightInput.value = 5.2;
    if (groupSelect) groupSelect.value = 'Todos los Trabajadores (Universal)';
    if (caloriesInput) caloriesInput.value = '0';
  }

  modal.classList.add('active');
};

window.openEditComboModal = async function(combo) {
  if (!combo) return;

  if (!document.getElementById('createComboModalBackdrop') && typeof loadTemplates === 'function') {
    await loadTemplates();
  }
  const modal = document.getElementById('createComboModalBackdrop');
  if (!modal) return;

  const idInput = document.getElementById('comboIdInput');
  const nameInput = document.getElementById('comboNameInput');
  const catSelect = document.getElementById('comboCategorySelect');
  const logSelect = document.getElementById('comboLogisticSelect');
  const itemsInput = document.getElementById('comboItemsInput');
  const mesaInput = document.getElementById('comboMesaInput');
  const weightInput = document.getElementById('comboWeightInput');
  const groupSelect = document.getElementById('comboTargetGroupSelect');
  const caloriesInput = document.getElementById('comboCaloriesInput');
  const modalTitle = document.getElementById('comboModalTitle');
  const submitBtn = document.getElementById('btnSubmitCreateCombo');
  const activeCheckbox = document.getElementById('comboActiveCheckbox');
  const activeLabel = document.getElementById('comboActiveLabel');

  if (idInput) idInput.value = combo.id;
  if (nameInput) nameInput.value = combo.name || '';
  if (catSelect) catSelect.value = combo.category || 'bolsa_viveres';
  if (logSelect) logSelect.value = combo.dietary_info || 'Almacén Seco / Logística Estándar';
  if (itemsInput) itemsInput.value = combo.items_detail || combo.description || '';
  if (mesaInput) mesaInput.value = combo.mesa_name || '';
  if (weightInput) weightInput.value = combo.weight_kg !== undefined ? combo.weight_kg : 14.0;
  if (groupSelect) groupSelect.value = combo.target_group || 'Todos los Trabajadores (Universal)';
  if (caloriesInput) caloriesInput.value = combo.calories || 0;

  if (typeof populateComboCampaignModalSelect === 'function') {
    await populateComboCampaignModalSelect(combo.campaign_id || '');
  }

  const isActive = combo.is_active === 1 || combo.is_active === true;
  if (activeCheckbox) activeCheckbox.checked = isActive;
  if (activeLabel) {
    activeLabel.textContent = isActive ? 'ACTIVO' : 'INACTIVO';
    activeLabel.style.color = isActive ? '#16a34a' : '#dc2626';
  }

  if (modalTitle) modalTitle.textContent = `✏️ Editar Beneficio: ${combo.name}`;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Actualizar Beneficio';
  }

  modal.classList.add('active');
};

window.initCombosManagement = function() {
  const modal = document.getElementById('createComboModalBackdrop');
  const btnOpen = document.getElementById('btnOpenCreateComboModal');
  const btnClose = document.getElementById('btnCloseCreateComboModal');
  const btnCancel = document.getElementById('btnCancelCreateCombo');
  const form = document.getElementById('createComboForm');
  const btnPresetEscolares = document.getElementById('btnPresetEscolares');
  const btnPresetHigienico = document.getElementById('btnPresetHigienico');
  const activeCheckbox = document.getElementById('comboActiveCheckbox');
  const activeLabel = document.getElementById('comboActiveLabel');

  // Toolbar de Agrupación, Filtro y Ordenamiento por Jornadas
  const btnGroupByCampaign = document.getElementById('btnGroupCombosByCampaign');
  const btnUngroup = document.getElementById('btnUngroupCombos');
  const filterCampaignSelect = document.getElementById('filterCombosCampaignSelect');
  const sortSelect = document.getElementById('sortCombosSelect');

  const setGroupingMode = (mode) => {
    currentCombosGrouping = mode;
    if (btnGroupByCampaign && btnUngroup) {
      if (mode === 'campaign') {
        btnGroupByCampaign.style.background = '#0284c7';
        btnGroupByCampaign.style.color = '#ffffff';
        btnUngroup.style.background = 'transparent';
        btnUngroup.style.color = '#475569';
      } else {
        btnUngroup.style.background = '#0284c7';
        btnUngroup.style.color = '#ffffff';
        btnGroupByCampaign.style.background = 'transparent';
        btnGroupByCampaign.style.color = '#475569';
      }
    }
    if (typeof renderCombosView === 'function') renderCombosView();
  };

  btnGroupByCampaign?.addEventListener('click', (e) => {
    e.preventDefault();
    setGroupingMode('campaign');
  });

  btnUngroup?.addEventListener('click', (e) => {
    e.preventDefault();
    setGroupingMode('flat');
  });

  filterCampaignSelect?.addEventListener('change', (e) => {
    currentCombosCampaignFilter = e.target.value;
    if (typeof renderCombosView === 'function') renderCombosView();
  });

  sortSelect?.addEventListener('change', (e) => {
    currentCombosSortOrder = e.target.value;
    if (typeof renderCombosView === 'function') renderCombosView();
  });

  const closeModal = () => {
    if (modal) modal.classList.remove('active');
    form?.reset();
    const idInput = document.getElementById('comboIdInput');
    if (idInput) idInput.value = '';
    const modalTitle = document.getElementById('comboModalTitle');
    if (modalTitle) modalTitle.textContent = '⚙️ Configurar Beneficio Institucional';
    const submitBtn = document.getElementById('btnSubmitCreateCombo');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '💾 Guardar Beneficio';
    }
  };

  btnOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    window.openCreateComboModal();
  });

  btnPresetEscolares?.addEventListener('click', (e) => {
    e.preventDefault();
    window.openCreateComboModal('escolares');
  });

  btnPresetHigienico?.addEventListener('click', (e) => {
    e.preventDefault();
    window.openCreateComboModal('higienico');
  });

  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  // Escuchar cambio del checkbox de estado en el modal
  activeCheckbox?.addEventListener('change', (e) => {
    if (activeLabel) {
      if (e.target.checked) {
        activeLabel.textContent = 'ACTIVO';
        activeLabel.style.color = '#16a34a';
      } else {
        activeLabel.textContent = 'INACTIVO';
        activeLabel.style.color = '#dc2626';
      }
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const comboId = document.getElementById('comboIdInput')?.value;
    const name = document.getElementById('comboNameInput')?.value?.trim();
    const category = document.getElementById('comboCategorySelect')?.value;
    const logistic = document.getElementById('comboLogisticSelect')?.value;
    const items = document.getElementById('comboItemsInput')?.value?.trim();
    const mesa = document.getElementById('comboMesaInput')?.value?.trim();
    const weight = parseFloat(document.getElementById('comboWeightInput')?.value) || 14.0;
    const targetGroup = document.getElementById('comboTargetGroupSelect')?.value;
    const calories = parseInt(document.getElementById('comboCaloriesInput')?.value, 10) || 0;
    const isActive = document.getElementById('comboActiveCheckbox')?.checked ? 1 : 0;
    const campaignId = document.getElementById('comboCampaignSelect')?.value || null;

    if (!name) {
      Toast.error('Debe ingresar el nombre del beneficio o combo.');
      return;
    }

    const payload = {
      name,
      category,
      description: items,
      items_detail: items,
      dietary_info: logistic,
      mesa_name: mesa,
      weight_kg: weight,
      target_group: targetGroup,
      calories,
      is_active: isActive,
      campaign_id: campaignId
    };

    const submitBtn = document.getElementById('btnSubmitCreateCombo');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      if (comboId) {
        // MODO EDICIÓN (PUT)
        const data = await API.put(`/api/v1/admin/combos/${comboId}`, payload);
        Toast.success(data.message || 'Combo actualizado exitosamente');
      } else {
        // MODO CREACIÓN (POST)
        const data = await API.post('/api/v1/admin/combos', payload);
        const comboName = (data && data.combo && data.combo.name) ? data.combo.name : name;
        Toast.success(`¡Combo "${comboName}" incorporado al catálogo exitosamente!`);
      }
      
      if (typeof SoundManager !== 'undefined' && SoundManager.playSuccess) SoundManager.playSuccess();
      closeModal();
      await loadCombosCatalog();
      if (typeof window.refreshPortalData === 'function') await window.refreshPortalData();
      if (window.ManualDispatch && typeof window.ManualDispatch.loadTodaySummary === 'function') {
        await window.ManualDispatch.loadTodaySummary();
      }
      window.dispatchEvent(new CustomEvent('combos:updated', { detail: { action: comboId ? 'updated' : 'created' } }));
    } catch (err) {
      console.error('[COMBO SAVE ERROR]', err);
      Toast.error(`Error al procesar combo: ${err.message}`);
    }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = comboId ? '💾 Actualizar Beneficio' : '💾 Guardar e Incorporar al Catálogo';
      }
    }
  });
};

window.populateCampaignCombosSelect = async function(selectedId = null) {
  const comboSelect = document.getElementById('campaignComboSelect');
  if (!comboSelect) return;

  try {
    let combosList = [];
    try {
      const res = await API.get('/api/v1/admin/combos');
      combosList = Array.isArray(res) ? res : (res && res.combos ? res.combos : []);
    } catch (e) {
      console.warn('Advertencia obteniendo combos para jornada:', e.message);
    }

    if (combosList.length === 0) {
      combosList = [
        { id: 'c1a2b3c4-1111-2222-3333-444455556666', name: 'Bolsa de Víveres Secos (Canasta Básica MIPPCI)', icon: '🌾', category: 'bolsa_viveres' },
        { id: 'ae65fee7-79f6-48a3-bc41-a61c928876b5', name: 'Combo Proteico Fresco (Cadena de Frío)', icon: '🍗', category: 'combo_proteico' },
        { id: '3df50537-3333-4fce-8bdc-f4ecbb567adf', name: 'Combo Higiénico & Aseo del Hogar', icon: '🧼', category: 'combo_higienico' },
        { id: '0f74d741-6310-4d6c-b8e5-8cd6e76f9113', name: 'Combo de Útiles Escolares', icon: '🎒', category: 'utiles_escolares' }
      ];
    }

    comboSelect.innerHTML = '';
    combosList.forEach(cb => {
      const isSel = selectedId ? (cb.id === selectedId) : '';
      comboSelect.innerHTML += `<option value="${cb.id}" ${isSel}>${cb.icon || '🍱'} ${cb.name} (${cb.category || 'general'})</option>`;
    });
  } catch (err) {
    console.error('Error poblando combos select:', err);
    comboSelect.innerHTML = '<option value="c1a2b3c4-1111-2222-3333-444455556666">🌾 Bolsa de Víveres Secos (Canasta Básica MIPPCI)</option>';
  }
};

window.reloadDistributionPoints = async function(selectedId = null) {
  const pointSelect = document.getElementById('campaignPointSelect');
  if (!pointSelect) return;

  try {
    let points = [];
    try {
      const data = await API.get('/api/v1/distribution-points');
      if (data && data.success && Array.isArray(data.distributionPoints)) {
        points = data.distributionPoints;
      }
    } catch (e) {
      console.warn('Advertencia obteniendo puntos de distribución:', e.message);
    }

    if (points.length === 0) {
      points = [
        { id: 'b12f492f-ebb3-430f-bc20-26ca4aa5b865', name: 'Almacén Central - Sede Principal MIPPCI', location_code: 'ALM-MIPPCI' },
        { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Almacén Central - Sótano 1 (Sede Principal)', location_code: 'ALM-S1' },
        { id: 'f641deb9-9123-415e-8cd1-ea01b8a7d367', name: 'Mesa 1 - Víveres Secos (Sótano 1)', location_code: 'MESA-01' },
        { id: '94df5c9d-0eb8-4603-859d-447309a0e9ca', name: 'Mesa 2 - Proteína y Aseo (Sótano 1)', location_code: 'MESA-02' }
      ];
    }

    cachedDistributionPoints = points;
    pointSelect.innerHTML = '';
    points.forEach(p => {
      const isSelected = selectedId ? (p.id === selectedId) : false;
      pointSelect.innerHTML += `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.name} (${p.location_code || 'SEDE'})</option>`;
    });
    if (selectedId) pointSelect.value = selectedId;
  } catch (err) {
    console.warn('Error al recargar sedes de despacho:', err);
    pointSelect.innerHTML = '<option value="b12f492f-ebb3-430f-bc20-26ca4aa5b865">Almacén Central - Sede Principal MIPPCI (ALM-MIPPCI)</option>';
  }
};

window.openCreateCampaignModal = async function() {
  // Asegurar que las plantillas y modales estén presentes en el DOM
  if (!document.getElementById('createCampaignModalBackdrop') && typeof loadTemplates === 'function') {
    await loadTemplates();
  }

  const modal = document.getElementById('createCampaignModalBackdrop');
  if (!modal) {
    console.error('Modal #createCampaignModalBackdrop no encontrado');
    return;
  }

  const form = document.getElementById('createCampaignForm');
  if (form) form.reset();

  const panel = document.getElementById('distributionPointFormPanel');
  if (panel) panel.style.display = 'none';

  const today = new Date().toISOString().split('T')[0];
  const startInput = document.getElementById('campaignStartDateInput');
  const endInput = document.getElementById('campaignEndDateInput');
  if (startInput) startInput.value = today;
  if (endInput) endInput.value = today;

  const alertBox = document.getElementById('campaignAlertBox');
  if (alertBox) alertBox.style.display = 'none';

  // Cargar combos y puntos de despacho para que el formulario nunca tenga campos vacíos
  await Promise.allSettled([
    window.populateCampaignCombosSelect(),
    window.reloadDistributionPoints()
  ]);

  modal.classList.add('active');
};

window.loadCampaigns = async function() {
  const grid = document.getElementById('campaignsGrid');
  if (!grid) return;

  // Cargar selects en segundo plano siempre
  window.populateCampaignCombosSelect().catch(() => {});
  window.reloadDistributionPoints().catch(() => {});

  try {
    let campaigns = [];
    try {
      const res = await API.get('/api/v1/admin/campaigns');
      campaigns = Array.isArray(res) ? res : (res && res.campaigns ? res.campaigns : []);
    } catch (e) {
      console.warn('Error al consultar jornadas:', e.message);
    }

    grid.innerHTML = '';

    if (!campaigns || campaigns.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1.5rem; color: #475569; background: #ffffff; border: 2px dashed #cbd5e1; border-radius: var(--radius-md); box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📅</div>
          <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a; margin-bottom: 0.35rem;">No hay jornadas de entrega programadas</div>
          <p style="font-size: 0.82rem; color: #64748b; margin-bottom: 1.25rem; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.45;">
            Planifique fechas de entrega institucional, asigne combos del catálogo y organice las estaciones de despacho.
          </p>
          <button type="button" class="btn btn-primary" onclick="if(typeof openCreateCampaignModal === 'function') openCreateCampaignModal();" style="font-size: 0.85rem; font-weight: 700; padding: 0.65rem 1.4rem; display: inline-flex; align-items: center; gap: 0.45rem;">
            <svg class="icon-svg icon-xs" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Programar Nueva Jornada Ahora</span>
          </button>
        </div>
      `;
      return;
    }

    campaigns.forEach(c => {
      const card = document.createElement('div');
      card.className = `campaign-card status-${c.status}`;

      const pct = c.assigned_count > 0 ? Math.round((c.claimed_count / c.assigned_count) * 100) : 0;

      let statusBadge = '<span class="badge badge-activo">Programada</span>';
      if (c.status === 'en_curso') {
        statusBadge = '<span class="badge badge-passkey" style="background:#10b981; color:#fff;">● En Curso (Activa)</span>';
      } else if (c.status === 'finalizada') {
        statusBadge = '<span class="badge" style="background:#64748b; color:#fff;">Finalizada</span>';
      }

      let targetLabel = 'Universal (Todos)';
      if (c.target_group === 'activo') targetLabel = 'Solo Personal Activo';
      else if (c.target_group === 'jubilado') targetLabel = 'Solo Jubilados y Pensionados';
      else if (c.target_group === 'contratado') targetLabel = 'Solo Personal Contratado';

      card.innerHTML = `
        <div>
          <div class="campaign-header-row">
            <div>
              <div class="campaign-title-text">${c.name}</div>
              <div class="campaign-dates-row">
                <span>🗓️ ${c.start_date} al ${c.end_date}</span>
                <span>&middot;</span>
                <span>📍 ${c.point_name || 'Almacén Central'}</span>
              </div>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div style="margin: 0.85rem 0; font-size: 0.8rem; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 0.65rem 0.85rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
              <strong style="color: var(--sea-pacific);">${c.combo_icon || '🍱'} ${c.combo_name || 'Bolsa de Beneficios'}</strong>
              <span class="badge" style="font-size: 0.68rem; background: #e0f2fe; color: #0369a1;">${targetLabel}</span>
            </div>
            <div style="font-size: 0.73rem; color: #64748b;">
              ${c.combo_items ? `<strong>Artículos:</strong> ${c.combo_items.slice(0, 100)}...` : (c.description || 'Sin detalles adicionales')}
            </div>
          </div>

          <div class="campaign-stats-grid">
            <div class="campaign-stat-item">
              <div class="stat-num">${c.total_eligible || 0}</div>
              <div class="stat-lbl">Convocados</div>
            </div>
            <div class="campaign-stat-item">
              <div class="stat-num">${c.assigned_count || 0}</div>
              <div class="stat-lbl">Asignados</div>
            </div>
            <div class="campaign-stat-item">
              <div class="stat-num" style="color: #10b981;">${c.claimed_count || 0}</div>
              <div class="stat-lbl">Despachados</div>
            </div>
          </div>

          <div style="margin-top: 0.75rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.2rem; color: #64748b;">
              <span>Progreso de Entrega:</span>
              <strong>${pct}% completado</strong>
            </div>
            <div class="progress-track" style="height: 6px;">
              <div class="progress-fill fill-emerald" style="width: ${pct}%;"></div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 0.75rem; flex-wrap: wrap;">
          <button class="btn btn-outline btn-notify-campaign" data-id="${c.id}" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; background: #fff; display: inline-flex; align-items: center; gap: 0.35rem;" title="Enviar notificación a la app de los beneficiarios">
            <svg class="icon-svg icon-xs" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            <span>${c.notification_sent ? 'Reenviar Aviso' : 'Notificar'}</span>
          </button>
          
          <div style="display: flex; gap: 0.35rem;">
            ${c.status === 'programada' ? `
              <button class="btn btn-primary btn-status-campaign" data-id="${c.id}" data-status="en_curso" style="font-size: 0.75rem; padding: 0.3rem 0.65rem;">
                Iniciar Jornada
              </button>
            ` : c.status === 'en_curso' ? `
              <button class="btn btn-outline btn-status-campaign" data-id="${c.id}" data-status="finalizada" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; border-color: #64748b;">
                Finalizar
              </button>
            ` : `
              <button class="btn btn-outline btn-status-campaign" data-id="${c.id}" data-status="en_curso" style="font-size: 0.75rem; padding: 0.3rem 0.65rem;">
                Reabrir
              </button>
            `}
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    document.querySelectorAll('.btn-notify-campaign').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        btn.textContent = '⏳ Notificando...';

        try {
          const nData = await API.post(`/api/v1/admin/campaigns/${id}/notify`, {});
          window.showToast(`📢 ${nData.message}`, 'success');
          playAudioFeedback('success');
          if (typeof sendBrowserNotification === 'function') {
            sendBrowserNotification(nData.notification.title, nData.notification.message);
          }
          if (typeof loadNotifications === 'function') await loadNotifications();
          await loadCampaigns();
        } catch (err) {
          window.showToast('Error al emitir notificación: ' + err.message, 'error');
          btn.disabled = false;
          btn.textContent = '📢 Notificar';
        }
      });
    });

    document.querySelectorAll('.btn-status-campaign').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const status = btn.getAttribute('data-status');

        try {
          await API.put(`/api/v1/admin/campaigns/${id}/status`, { status });
          await loadCampaigns();
        } catch (err) {
          window.showToast('Error actualizando estado: ' + err.message, 'error');
        }
      });
    });

  } catch (err) {
    console.error('Error cargando jornadas:', err);
  }
};

window.setupCampaignsManagement = function() {
  const modal = document.getElementById('createCampaignModalBackdrop');
  const btnOpen = document.getElementById('btnOpenCreateCampaignModal');
  const btnClose = document.getElementById('btnCloseCreateCampaignModal');
  const btnCancel = document.getElementById('btnCancelCreateCampaign');
  const form = document.getElementById('createCampaignForm');
  const submitBtn = document.getElementById('btnSubmitCreateCampaign');
  const alertBox = document.getElementById('campaignAlertBox');

  const startInput = document.getElementById('campaignStartDateInput');
  const endInput = document.getElementById('campaignEndDateInput');

  btnOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    window.openCreateCampaignModal();
  });

  const closeModal = () => {
    const panel = document.getElementById('distributionPointFormPanel');
    if (panel) panel.style.display = 'none';
    modal?.classList.remove('active');
  };
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  async function handleCampaignSubmit(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const originalBtnContent = submitBtn ? submitBtn.innerHTML : 'Publicar Jornada';
    const name = document.getElementById('campaignNameInput')?.value.trim();
    const start_date = startInput?.value;
    const end_date = endInput?.value;
    const combo_id = document.getElementById('campaignComboSelect')?.value;
    const distribution_point_id = document.getElementById('campaignPointSelect')?.value;
    const target_group = document.getElementById('campaignTargetSelect')?.value;
    const description = document.getElementById('campaignDescriptionInput')?.value.trim();
    const auto_generate_entitlements = document.getElementById('campaignAutoEntitlementsCheck')?.checked !== false;
    const notify_workers = document.getElementById('campaignNotifyCheck')?.checked === true;

    if (!name) {
      if (alertBox) {
        alertBox.textContent = 'Por favor indique el nombre o título de la jornada.';
        alertBox.style.display = 'block';
      }
      Toast.error('Por favor indique el título de la jornada.');
      document.getElementById('campaignNameInput')?.focus();
      return;
    }

    if (!start_date || !end_date) {
      if (alertBox) {
        alertBox.textContent = 'Debe indicar fecha de inicio y fecha de cierre.';
        alertBox.style.display = 'block';
      }
      Toast.error('Debe indicar fecha de inicio y fecha de cierre.');
      return;
    }

    if (alertBox) alertBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ <span>Publicando Jornada...</span>';
    }

    try {
      const data = await API.post('/api/v1/admin/campaigns', {
        name,
        start_date,
        end_date,
        combo_id: combo_id || null,
        distribution_point_id: distribution_point_id || null,
        target_group: target_group || 'all',
        description: description || '',
        auto_generate_entitlements
      });

      if (notify_workers && data.campaign?.id) {
        try {
          await API.post(`/api/v1/admin/campaigns/${data.campaign.id}/notify`, {});
        } catch (notifErr) {
          console.warn('Aviso de notificación opcional:', notifErr.message);
        }
      }

      closeModal();
      await loadCampaigns();
      if (typeof loadNotifications === 'function') await loadNotifications();
      playAudioFeedback('success');
      Toast.success(`¡Jornada "${name}" publicada exitosamente!`);

    } catch (err) {
      console.error('[CAMPAIGN ERROR]', err);
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al programar la jornada.';
        alertBox.style.display = 'block';
      }
      Toast.error(err.message || 'Error al programar la jornada.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
      }
    }
  }

  form?.addEventListener('submit', handleCampaignSubmit);

  // Asegurar que clic directo en el botón también ejecute la acción si el evento submit es bloqueado
  submitBtn?.addEventListener('click', (e) => {
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    handleCampaignSubmit(e);
  });
};

window.setupDistributionPointsManagement = function() {
  const btnAdd = document.getElementById('btnAddDistributionPoint');
  const btnEdit = document.getElementById('btnEditDistributionPoint');
  const panel = document.getElementById('distributionPointFormPanel');
  const btnCancel = document.getElementById('btnCancelDistributionPointForm');
  const btnClose = document.getElementById('btnClosePointPanel');
  const btnSave = document.getElementById('btnSaveDistributionPoint');
  const btnSaveText = document.getElementById('btnSavePointText');
  const titleText = document.getElementById('distributionPointFormTitleText');
  const alertBox = document.getElementById('pointFormAlert');
  const select = document.getElementById('campaignPointSelect');

  const idInput = document.getElementById('editPointId');
  const nameInput = document.getElementById('pointNameInput');
  const codeInput = document.getElementById('pointCodeInput');
  const addressInput = document.getElementById('pointAddressInput');

  const closePanel = () => {
    if (panel) panel.style.display = 'none';
    if (alertBox) alertBox.style.display = 'none';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (codeInput) codeInput.value = '';
    if (addressInput) addressInput.value = '';
  };

  btnCancel?.addEventListener('click', closePanel);
  btnClose?.addEventListener('click', closePanel);

  btnAdd?.addEventListener('click', () => {
    closePanel();
    if (titleText) titleText.textContent = 'Nueva Sede de Despacho';
    if (btnSaveText) btnSaveText.textContent = 'Guardar y Asignar Sede';
    if (panel) {
      panel.style.display = 'block';
      nameInput?.focus();
    }
  });

  btnEdit?.addEventListener('click', () => {
    const currentId = select?.value;
    if (!currentId) {
      window.showToast('Seleccione una sede de despacho de la lista para editarla.', 'warning');
      return;
    }

    const currentPoint = cachedDistributionPoints.find(p => p.id === currentId);
    if (!currentPoint) return;

    if (idInput) idInput.value = currentPoint.id;
    if (nameInput) nameInput.value = currentPoint.name;
    if (codeInput) codeInput.value = currentPoint.location_code;
    if (addressInput) addressInput.value = currentPoint.address || '';

    if (titleText) titleText.textContent = 'Editar Sede de Despacho';
    if (btnSaveText) btnSaveText.textContent = 'Actualizar Cambios';
    if (panel) {
      panel.style.display = 'block';
      nameInput?.focus();
    }
  });

  btnSave?.addEventListener('click', async () => {
    const editId = idInput?.value.trim();
    const name = nameInput?.value.trim();
    const location_code = codeInput?.value.trim();
    const address = addressInput?.value.trim();

    if (!name || !location_code) {
      if (alertBox) {
        alertBox.textContent = 'El nombre de la sede y el código de ubicación son obligatorios.';
        alertBox.style.display = 'block';
      }
      return;
    }

    btnSave.disabled = true;
    try {
      const url = editId ? `/api/v1/distribution-points/${editId}` : '/api/v1/distribution-points';
      const data = editId 
        ? await API.put(url, { name, location_code, address })
        : await API.post(url, { name, location_code, address });

      await reloadDistributionPoints(data.point?.id);
      closePanel();
      window.showToast('Sede de despacho guardada con éxito', 'success');
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message;
        alertBox.style.display = 'block';
      }
    } finally {
      btnSave.disabled = false;
    }
  });
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof initCombosManagement === 'function') initCombosManagement();
    });
  } else {
    setTimeout(() => {
      if (typeof initCombosManagement === 'function') initCombosManagement();
    }, 100);
  }
}
