// ============================================================================
// MODULE: COMBOS, LOGISTICS, CAMPAIGNS & DISTRIBUTION POINTS
// ============================================================================

let cachedDistributionPoints = [];
let cachedCombos = [];

window.loadCombosCatalog = async function() {
  const grid = document.getElementById('combosCatalogGrid');
  if (!grid) return;

  try {
    const combos = await API.get('/api/v1/admin/combos');
    cachedCombos = Array.isArray(combos) ? combos : [];
    grid.innerHTML = '';

    cachedCombos.forEach(c => {
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
      grid.appendChild(card);
    });

    // Delegación / Eventos para botones dinámicos
    document.querySelectorAll('.btn-toggle-combo').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        btn.disabled = true;
        try {
          const res = await API.patch(`/api/v1/admin/combos/${id}/toggle-status`, {});
          window.showToast(res.message, 'success');
          if (typeof SoundManager !== 'undefined' && SoundManager.playSuccess) SoundManager.playSuccess();
          loadCombosCatalog();
        } catch (err) {
          window.showToast('Error al cambiar estado: ' + err.message, 'error');
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
        
        try {
          const delData = await API.delete(`/api/v1/admin/combos/${id}`);
          window.showToast(delData.message || 'Beneficio eliminado', 'info');
          loadCombosCatalog();
        } catch (err) {
          window.showToast('Error al eliminar beneficio: ' + err.message, 'error');
        }
      });
    });

  } catch (err) {
    console.error('[LOAD COMBOS ERROR]', err);
  }
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

  if (!modal) return;

  const openModal = () => modal.classList.add('active');
  const closeModal = () => {
    modal.classList.remove('active');
    form?.reset();
    const idInput = document.getElementById('comboIdInput');
    if (idInput) idInput.value = '';
    const modalTitle = document.getElementById('comboModalTitle');
    if (modalTitle) modalTitle.textContent = '⚙️ Configurar Beneficio Institucional';
    const submitBtn = document.getElementById('btnSubmitCreateCombo');
    if (submitBtn) submitBtn.textContent = '💾 Guardar Beneficio';
  };

  btnOpen?.addEventListener('click', () => {
    form?.reset();
    const idInput = document.getElementById('comboIdInput');
    if (idInput) idInput.value = '';
    const modalTitle = document.getElementById('comboModalTitle');
    if (modalTitle) modalTitle.textContent = '⚙️ Configurar Nuevo Beneficio Institucional';
    const submitBtn = document.getElementById('btnSubmitCreateCombo');
    if (submitBtn) submitBtn.textContent = '💾 Guardar e Incorporar al Catálogo';
    if (activeCheckbox) activeCheckbox.checked = true;
    if (activeLabel) {
      activeLabel.textContent = 'ACTIVO';
      activeLabel.style.color = '#16a34a';
    }
    openModal();
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

  // Función pública para abrir el modal en modo edición
  window.openEditComboModal = function(combo) {
    if (!combo) return;
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

    if (idInput) idInput.value = combo.id;
    if (nameInput) nameInput.value = combo.name || '';
    if (catSelect) catSelect.value = combo.category || 'bolsa_viveres';
    if (logSelect) logSelect.value = combo.dietary_info || 'Almacén Seco / Logística Estándar';
    if (itemsInput) itemsInput.value = combo.items_detail || combo.description || '';
    if (mesaInput) mesaInput.value = combo.mesa_name || '';
    if (weightInput) weightInput.value = combo.weight_kg !== undefined ? combo.weight_kg : 14.0;
    if (groupSelect) groupSelect.value = combo.target_group || 'Todos los Trabajadores (Universal)';
    if (caloriesInput) caloriesInput.value = combo.calories || 0;

    const isActive = combo.is_active === 1 || combo.is_active === true;
    if (activeCheckbox) activeCheckbox.checked = isActive;
    if (activeLabel) {
      activeLabel.textContent = isActive ? 'ACTIVO' : 'INACTIVO';
      activeLabel.style.color = isActive ? '#16a34a' : '#dc2626';
    }

    if (modalTitle) modalTitle.textContent = `✏️ Editar Beneficio: ${combo.name}`;
    if (submitBtn) submitBtn.textContent = '💾 Actualizar Beneficio';

    openModal();
  };

  btnPresetEscolares?.addEventListener('click', () => {
    document.getElementById('comboIdInput').value = '';
    document.getElementById('comboNameInput').value = 'Combo Escolar "Paso a Clases" MIPPCI';
    document.getElementById('comboCategorySelect').value = 'utiles_escolares';
    document.getElementById('comboLogisticSelect').value = 'Almacén Seco / Logística Estándar';
    document.getElementById('comboItemsInput').value = '6 Cuadernos engrapados, 1 Morral tricolor impermeable, 1 Caja de lápices grafito 2B, 1 Juego de geometría, 1 Caja de creyones de madera, 1 Pega blanca líquida, 1 Tijera escolar, 1 Sacapuntas';
    document.getElementById('comboTargetGroupSelect').value = 'Personal con Hijos / Cargas Familiares';
    document.getElementById('comboCaloriesInput').value = '0';
    if (activeCheckbox) activeCheckbox.checked = true;
    openModal();
  });

  btnPresetHigienico?.addEventListener('click', () => {
    document.getElementById('comboIdInput').value = '';
    document.getElementById('comboNameInput').value = 'Combo Higiénico y Aseo Personal Institucional';
    document.getElementById('comboCategorySelect').value = 'combo_higienico';
    document.getElementById('comboLogisticSelect').value = 'Almacén Seco / Logística Estándar';
    document.getElementById('comboItemsInput').value = '4 Jabones de tocador en barra, 2 Cremas dentales con flúor, 2 Champús hidratantes, 2 Desodorantes en roll-on, 4 Rollos de papel higiénico, 1 Jabón lavaplatos líquido, 1 Detergente en polvo multiuso';
    document.getElementById('comboTargetGroupSelect').value = 'Todos los Trabajadores (Universal)';
    document.getElementById('comboCaloriesInput').value = '0';
    if (activeCheckbox) activeCheckbox.checked = true;
    openModal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const comboId = document.getElementById('comboIdInput')?.value;
    const name = document.getElementById('comboNameInput')?.value;
    const category = document.getElementById('comboCategorySelect')?.value;
    const logistic = document.getElementById('comboLogisticSelect')?.value;
    const items = document.getElementById('comboItemsInput')?.value;
    const mesa = document.getElementById('comboMesaInput')?.value;
    const weight = parseFloat(document.getElementById('comboWeightInput')?.value) || 14.0;
    const targetGroup = document.getElementById('comboTargetGroupSelect')?.value;
    const calories = parseInt(document.getElementById('comboCaloriesInput')?.value, 10) || 0;
    const isActive = document.getElementById('comboActiveCheckbox')?.checked ? 1 : 0;

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
      is_active: isActive
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
        window.showToast(`✅ ${data.message || 'Combo actualizado exitosamente'}`, 'success');
      } else {
        // MODO CREACIÓN (POST)
        const data = await API.post('/api/v1/admin/combos', payload);
        window.showToast(`✅ ${data.message}: "${data.combo.name}"`, 'success');
      }
      
      if (typeof SoundManager !== 'undefined' && SoundManager.playSuccess) SoundManager.playSuccess();
      closeModal();
      loadCombosCatalog();
    } catch (err) {
      window.showToast(`Error al procesar: ${err.message}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = comboId ? '💾 Actualizar Beneficio' : '💾 Guardar e Incorporar al Catálogo';
      }
    }
  });
};
      closeModal();
      loadCombosCatalog();
    } catch (err) {
      window.showToast(`Error al guardar: ${err.message}`, 'error');
    }
  });
};

window.loadCampaigns = async function() {
  const grid = document.getElementById('campaignsGrid');
  if (!grid) return;

  try {
    const campaigns = await API.get('/api/v1/admin/campaigns');
    grid.innerHTML = '';

    if (campaigns.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #64748b; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: var(--radius-md);">
          📅 No hay jornadas de entrega programadas. Haga clic en <strong>"+ Programar Nueva Jornada"</strong> para crear la primera.
        </div>
      `;
      return;
    }

    const comboSelect = document.getElementById('campaignComboSelect');
    if (comboSelect) {
      const combosList = await API.get('/api/v1/admin/combos');
      comboSelect.innerHTML = '';
      combosList.forEach(cb => {
        comboSelect.innerHTML += `<option value="${cb.id}">${cb.icon || '🍱'} ${cb.name} (${cb.category})</option>`;
      });
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
              <div class="stat-num">${c.total_eligible}</div>
              <div class="stat-lbl">Convocados</div>
            </div>
            <div class="campaign-stat-item">
              <div class="stat-num">${c.assigned_count}</div>
              <div class="stat-lbl">Asignados</div>
            </div>
            <div class="campaign-stat-item">
              <div class="stat-num" style="color: #10b981;">${c.claimed_count}</div>
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
  const alertBox = document.getElementById('campaignAlertBox');

  const today = new Date().toISOString().split('T')[0];
  const startInput = document.getElementById('campaignStartDateInput');
  const endInput = document.getElementById('campaignEndDateInput');
  if (startInput) startInput.value = today;
  if (endInput) endInput.value = today;

  btnOpen?.addEventListener('click', () => {
    form?.reset();
    const panel = document.getElementById('distributionPointFormPanel');
    if (panel) panel.style.display = 'none';
    if (startInput) startInput.value = today;
    if (endInput) endInput.value = today;
    if (alertBox) alertBox.style.display = 'none';
    modal?.classList.add('active');
  });

  const closeModal = () => {
    const panel = document.getElementById('distributionPointFormPanel');
    if (panel) panel.style.display = 'none';
    modal?.classList.remove('active');
  };
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('campaignNameInput')?.value.trim();
    const start_date = startInput?.value;
    const end_date = endInput?.value;
    const combo_id = document.getElementById('campaignComboSelect')?.value;
    const distribution_point_id = document.getElementById('campaignPointSelect')?.value;
    const target_group = document.getElementById('campaignTargetSelect')?.value;
    const description = document.getElementById('campaignDescriptionInput')?.value.trim();
    const auto_generate_entitlements = document.getElementById('campaignAutoEntitlementsCheck')?.checked;
    const notify_workers = document.getElementById('campaignNotifyCheck')?.checked;

    try {
      const data = await API.post('/api/v1/admin/campaigns', {
        name,
        start_date,
        end_date,
        combo_id,
        distribution_point_id,
        target_group,
        description,
        auto_generate_entitlements
      });

      if (notify_workers && data.campaign?.id) {
        await API.post(`/api/v1/admin/campaigns/${data.campaign.id}/notify`, {});
      }

      closeModal();
      await loadCampaigns();
      if (typeof loadNotifications === 'function') await loadNotifications();
      playAudioFeedback('success');
      window.showToast(`✅ ${data.message}`, 'success');

    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message;
        alertBox.style.display = 'block';
      }
    }
  });
};

window.reloadDistributionPoints = async function(selectedId = null) {
  try {
    const data = await API.get('/api/v1/distribution-points');
    if (data.success && Array.isArray(data.distributionPoints)) {
      cachedDistributionPoints = data.distributionPoints;
      const pointSelect = document.getElementById('campaignPointSelect');
      if (pointSelect) {
        pointSelect.innerHTML = '';
        cachedDistributionPoints.forEach(p => {
          const isSelected = selectedId ? (p.id === selectedId) : false;
          pointSelect.innerHTML += `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.name} (${p.location_code})</option>`;
        });
        if (selectedId) pointSelect.value = selectedId;
      }
    }
  } catch (err) {
    console.warn('Error al recargar sedes de despacho:', err);
  }
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
