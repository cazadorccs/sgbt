// ============================================================================
// MÓDULO: DESPACHO MANUAL POR CÉDULA & INCORPORACIÓN A NÓMINA (PRIMERA JORNADA)
// Permite entrega de combos sin QR/NFC, descuento manual e incorporación al vuelo
// ============================================================================

window.ManualDispatch = (function() {
  let currentWorkerData = null;
  let departmentsCache = [];
  let cachedGroupedDeliveries = [];

  // Inicialización del módulo
  async function init() {
    setupEventListeners();
    await loadDepartmentsList();
    await loadTodaySummary();
  }

  // Configurar escuchadores de eventos
  function setupEventListeners() {
    // Formulario de búsqueda
    const searchForm = document.getElementById('formManualSearch');
    const searchInput = document.getElementById('inputManualCedula');
    const btnSearch = document.getElementById('btnSearchManual');

    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = searchInput ? searchInput.value.trim() : '';
        if (val) searchWorker(val);
      });
    }

    if (btnSearch) {
      btnSearch.addEventListener('click', (e) => {
        if (e) e.preventDefault();
        const val = searchInput ? searchInput.value.trim() : '';
        if (val) searchWorker(val);
      });
    }

    // Auto-búsqueda con tecla Enter en el input
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = searchInput.value.trim();
          if (val) searchWorker(val);
        }
      });
    }

    // Botón de entrega manual
    const btnDeliver = document.getElementById('btnExecuteManualDelivery');
    if (btnDeliver) {
      btnDeliver.addEventListener('click', executeDelivery);
    }

    // Feedback táctil al seleccionar/deseleccionar combos individuales
    document.addEventListener('change', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('manual-combo-checkbox')) {
        if (typeof window.triggerHaptic === 'function') {
          window.triggerHaptic('tick');
        }
      }
    });

    // Botón para abrir modal de incorporación rápida
    const btnOpenIncorporate = document.getElementById('btnOpenFastIncorporate');
    if (btnOpenIncorporate) {
      btnOpenIncorporate.addEventListener('click', () => {
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic('tick');
        const searchInput = document.getElementById('inputManualCedula');
        const typedCedula = searchInput ? searchInput.value.trim() : '';
        openFastIncorporateModal(typedCedula);
      });
    }

    // Formulario de incorporación rápida
    const formIncorporate = document.getElementById('formFastIncorporate');
    if (formIncorporate) {
      formIncorporate.addEventListener('submit', handleFastIncorporateSubmit);
    }

    const btnCloseIncorporate = document.getElementById('btnCloseFastIncorporateModal');
    if (btnCloseIncorporate) {
      btnCloseIncorporate.addEventListener('click', closeFastIncorporateModal);
    }

    // Botón de reinicio de entregas a 0
    const btnReset = document.getElementById('btnResetDeliveriesToZero');
    if (btnReset) {
      btnReset.addEventListener('click', handleResetDeliveries);
    }

    // Botón de refrescar resumen
    const btnRefresh = document.getElementById('btnRefreshManualSummary');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', loadTodaySummary);
    }

    // Botones para abrir modal de Registro de Despachos en Vivo
    const btnOpenModalKpi = document.getElementById('btnOpenRecentDeliveriesModal');
    const btnOpenModalBottom = document.getElementById('btnOpenRecentDeliveriesModalBottom');
    if (btnOpenModalKpi) {
      btnOpenModalKpi.addEventListener('click', openRecentDeliveriesModal);
    }
    if (btnOpenModalBottom) {
      btnOpenModalBottom.addEventListener('click', openRecentDeliveriesModal);
    }

    // Botones para cerrar modal de Despachos en Vivo
    const btnCloseModal = document.getElementById('btnCloseRecentDeliveriesModal');
    const btnFooterCloseModal = document.getElementById('btnFooterCloseRecentDeliveriesModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', closeRecentDeliveriesModal);
    }
    if (btnFooterCloseModal) {
      btnFooterCloseModal.addEventListener('click', closeRecentDeliveriesModal);
    }

    // Botón de refrescar dentro del modal
    const btnRefreshModal = document.getElementById('btnRefreshModalDeliveries');
    if (btnRefreshModal) {
      btnRefreshModal.addEventListener('click', async () => {
        btnRefreshModal.disabled = true;
        btnRefreshModal.textContent = '⏳ Cargando...';
        await loadTodaySummary();
        btnRefreshModal.disabled = false;
        btnRefreshModal.textContent = '🔄 Actualizar';
      });
    }

    // Cerrar modal al hacer clic en el backdrop fuera del diálogo
    const modalBackdrop = document.getElementById('recentDeliveriesModalBackdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeRecentDeliveriesModal();
      });
    }

    // Cerrar modal con tecla Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop && modalBackdrop.classList.contains('active')) {
        closeRecentDeliveriesModal();
      }
    });

    // Filtro en vivo dentro del modal
    const inputFilter = document.getElementById('inputFilterRecentDeliveries');
    if (inputFilter) {
      inputFilter.addEventListener('input', () => {
        const query = inputFilter.value.toLowerCase().trim();
        filterAndRenderModalDeliveries(query);
      });
    }
  }

  // Cargar lista de departamentos para el select de incorporación
  async function loadDepartmentsList() {
    try {
      const res = await API.get('/api/v1/admin/workers');
      // Extraer departamentos únicos de los trabajadores existentes
      if (res && res.departments) {
        departmentsCache = res.departments;
      }
    } catch (e) {
      console.warn('Error cargando departamentos:', e);
    }
  }

  // Cargar resumen de hoy y despachos recientes
  async function loadTodaySummary() {
    try {
      const data = await API.get('/api/v1/manual-dispatch/today-summary');
      if (data && data.stats) {
        const elWorkers = document.getElementById('manualKpiWorkers');
        const elAssigned = document.getElementById('manualKpiAssigned');
        const elDelivered = document.getElementById('manualKpiDelivered');
        const elPending = document.getElementById('manualKpiPending');

        if (elWorkers) elWorkers.textContent = data.stats.total_workers;
        if (elAssigned) elAssigned.textContent = data.stats.combos_assigned_today;
        if (elDelivered) elDelivered.textContent = data.stats.combos_delivered_today;
        if (elPending) elPending.textContent = data.stats.combos_pending_today;

        // Renderizar tabla de entregas recientes
        renderRecentDeliveries(data.recent_deliveries || []);
      }
    } catch (err) {
      console.error('Error cargando resumen manual:', err);
    }
  }

  // Renderizar despachos recientes simplificados y agrupados por funcionario
  function renderRecentDeliveries(deliveries) {
    const countBadge = document.getElementById('recentDeliveriesCount');
    const modalCountBadge = document.getElementById('modalRecentDeliveriesCount');

    if (!deliveries || deliveries.length === 0) {
      cachedGroupedDeliveries = [];
      if (countBadge) countBadge.textContent = '0 entregas';
      if (modalCountBadge) modalCountBadge.textContent = '0 entregas';
      renderEmptyState();
      return;
    }

    // Normalizar a lista agrupada por funcionario y momento de entrega
    const grouped = [];
    const map = new Map();

    for (const d of deliveries) {
      if (d.combos && Array.isArray(d.combos)) {
        grouped.push(d);
      } else {
        const timeKey = (d.delivered_at || '').substring(0, 19);
        const groupKey = `${d.document_id}_${timeKey}`;
        if (!map.has(groupKey)) {
          const item = {
            ...d,
            combos_count: 0,
            combos: []
          };
          map.set(groupKey, item);
          grouped.push(item);
        }
        const grp = map.get(groupKey);
        grp.combos_count++;
        grp.combos.push({
          name: d.combo_name,
          icon: d.combo_icon || '🍱'
        });
      }
    }

    cachedGroupedDeliveries = grouped;

    const totalCombosDelivered = grouped.reduce((sum, g) => sum + (g.combos_count || (g.combos ? g.combos.length : 1)), 0);
    const labelCount = `${grouped.length} funcionarios atendidos (${totalCombosDelivered} combos)`;
    
    if (countBadge) countBadge.textContent = labelCount;
    if (modalCountBadge) modalCountBadge.textContent = labelCount;

    // Renderizar en el modal y en tabla inline si existe
    const modalTbody = document.getElementById('modalRecentDeliveriesBody');
    const inlineTbody = document.getElementById('recentManualDeliveriesBody');

    if (modalTbody) renderTableRows(modalTbody, grouped);
    if (inlineTbody) renderTableRows(inlineTbody, grouped);
  }

  // Renderizar filas HTML en un elemento tbody
  function renderTableRows(tbodyEl, list) {
    if (!tbodyEl) return;

    if (!list || list.length === 0) {
      tbodyEl.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2.5rem; color: #94a3b8;">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📦</div>
            <div style="font-size: 0.95rem; font-weight: 600;">No se encontraron registros de entregas para este filtro.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbodyEl.innerHTML = list.map(d => {
      let timeStr = '--:--';
      if (d.delivered_at) {
        let dateVal = d.delivered_at;
        if (typeof dateVal === 'string' && !dateVal.endsWith('Z') && !dateVal.includes('+')) {
          dateVal = dateVal.replace(' ', 'T') + 'Z';
        }
        const dObj = new Date(dateVal);
        timeStr = !isNaN(dObj) 
          ? dObj.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
          : d.delivered_at;
      }

      let badgeMethod = '<span class="badge" style="background: #0284c7; color: white;">Manual RRHH</span>';
      if (d.verification_method === 'manual_incorporation_rrhh') {
        badgeMethod = '<span class="badge" style="background: #8b5cf6; color: white;">Incorporación Directa</span>';
      } else if (d.verification_method === 'passkey_qr') {
        badgeMethod = '<span class="badge" style="background: #10b981; color: white;">🛡️ Passkey QR</span>';
      } else if (d.verification_method === 'passkey_nfc') {
        badgeMethod = '<span class="badge" style="background: #06b6d4; color: white;">📶 Proximidad NFC</span>';
      } else if (d.verification_method === 'delegated_proxy_qr') {
        badgeMethod = '<span class="badge" style="background: #f59e0b; color: white;">🤝 Retiro Delegado</span>';
      }

      const combosList = d.combos || [{ name: d.combo_name || 'Combo Alimenticio', icon: d.combo_icon || '🍱' }];
      const count = d.combos_count || combosList.length;

      return `
        <tr style="border-bottom: 1px solid rgba(226, 232, 240, 0.7); transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          <td style="padding: 0.75rem 0.85rem; font-family: monospace; font-weight: 700; color: #0284c7; white-space: nowrap; vertical-align: middle;">
            ${timeStr}
          </td>
          <td style="padding: 0.75rem 0.85rem; vertical-align: middle;">
            <div style="font-weight: 700; color: #0f172a; font-size: 0.9rem;">${escapeHtml(d.full_name)}</div>
            <div style="font-size: 0.75rem; color: #64748b; font-family: monospace; margin-top: 0.1rem;">
              ${escapeHtml(d.document_id)} &middot; <span style="text-transform: capitalize; font-weight: 600;">${escapeHtml(d.worker_type || 'activo')}</span>
            </div>
          </td>
          <td style="padding: 0.75rem 0.85rem; font-size: 0.8rem; color: #334155; vertical-align: middle; max-width: 250px;">
            ${escapeHtml(d.department_name || 'Nómina Central')}
          </td>
          <td style="padding: 0.75rem 0.85rem; vertical-align: middle;">
            <div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                <span style="display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 800; font-size: 0.75rem; background: #0284c7; color: white; padding: 0.2rem 0.55rem; border-radius: 9999px;">
                  📦 ${count} ${count === 1 ? 'combo' : 'combos'}
                </span>
                ${combosList.map(c => `
                  <span style="display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 0.15rem 0.45rem; border-radius: 6px; font-weight: 600;">
                    <span>${c.icon}</span>
                    <span>${escapeHtml(c.name)}</span>
                  </span>
                `).join('')}
              </div>
            </div>
          </td>
          <td style="padding: 0.75rem 0.85rem; vertical-align: middle; white-space: nowrap;">
            ${badgeMethod}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Renderizar estado vacío en las tablas
  function renderEmptyState() {
    const emptyHtml = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📦</div>
          <div>No se han registrado entregas manuales todavía hoy. Las entregas están en 0.</div>
        </td>
      </tr>
    `;
    const modalTbody = document.getElementById('modalRecentDeliveriesBody');
    const inlineTbody = document.getElementById('recentManualDeliveriesBody');
    if (modalTbody) modalTbody.innerHTML = emptyHtml;
    if (inlineTbody) inlineTbody.innerHTML = emptyHtml;
  }

  // Abrir modal de entregas en vivo
  async function openRecentDeliveriesModal() {
    const modal = document.getElementById('recentDeliveriesModalBackdrop');
    if (!modal) return;

    modal.classList.add('active');

    // Limpiar filtro anterior
    const inputFilter = document.getElementById('inputFilterRecentDeliveries');
    if (inputFilter) {
      inputFilter.value = '';
      setTimeout(() => inputFilter.focus(), 100);
    }

    // Refrescar datos para mostrar siempre lo último
    await loadTodaySummary();
  }

  // Cerrar modal de entregas en vivo
  function closeRecentDeliveriesModal() {
    const modal = document.getElementById('recentDeliveriesModalBackdrop');
    if (modal) modal.classList.remove('active');
  }

  // Filtrar y renderizar entregas en el modal
  function filterAndRenderModalDeliveries(query = '') {
    const tbody = document.getElementById('modalRecentDeliveriesBody');
    if (!tbody) return;

    let items = cachedGroupedDeliveries;
    if (query) {
      items = cachedGroupedDeliveries.filter(d => {
        const full = `${d.full_name || ''} ${d.document_id || ''} ${d.department_name || ''}`.toLowerCase();
        return full.includes(query);
      });
    }

    renderTableRows(tbody, items);
  }

  // Buscar trabajador por cédula
  async function searchWorker(cedula) {
    const cardResult = document.getElementById('manualWorkerResultCard');
    const cardNotFound = document.getElementById('manualWorkerNotFoundCard');
    const loadingEl = document.getElementById('manualSearchLoading');

    if (loadingEl) loadingEl.style.display = 'block';
    if (cardResult) cardResult.style.display = 'none';
    if (cardNotFound) cardNotFound.style.display = 'none';

    try {
      const data = await API.get(`/api/v1/manual-dispatch/search/${encodeURIComponent(cedula)}`);
      if (loadingEl) loadingEl.style.display = 'none';

      if (!data.found) {
        currentWorkerData = null;
        showNotFound(data);
        return;
      }

      currentWorkerData = data;
      renderWorkerCard(data);
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      Toast.error('Error en la búsqueda: ' + err.message);
    }
  }

  // Mostrar mensaje cuando no se encuentra el trabajador
  function showNotFound(data) {
    const cardNotFound = document.getElementById('manualWorkerNotFoundCard');
    const searchedCedulaEl = document.getElementById('notFoundCedulaText');

    if (searchedCedulaEl) {
      searchedCedulaEl.textContent = data.suggested_cedula || data.searched_term;
    }

    if (cardNotFound) {
      cardNotFound.style.display = 'block';
    }
  }

  // Renderizar la ficha del trabajador encontrado y sus combos
  function renderWorkerCard(data) {
    const card = document.getElementById('manualWorkerResultCard');
    const { worker, summary, entitlements } = data;

    // Campos del trabajador
    document.getElementById('manualWorkerFullName').textContent = worker.full_name;
    document.getElementById('manualWorkerDocument').textContent = worker.document_id;
    document.getElementById('manualWorkerDepartment').textContent = worker.department_name || 'Sin Dirección Asignada';
    
    const workerTypeBadge = document.getElementById('manualWorkerTypeBadge');
    if (workerTypeBadge) {
      workerTypeBadge.textContent = worker.worker_type ? worker.worker_type.toUpperCase() : 'ACTIVO';
      workerTypeBadge.className = worker.worker_type === 'jubilado' ? 'badge badge-warning' : 'badge badge-success';
    }

    // Resumen de estado de entrega de hoy
    const statusBox = document.getElementById('manualDeliveryStatusBox');
    const btnDeliver = document.getElementById('btnExecuteManualDelivery');
    const secIdentity = document.getElementById('manualWorkerIdentitySection');
    const secCombos = document.getElementById('manualWorkerCombosSection');
    const secAction = document.getElementById('manualWorkerActionSection');
    const searchInput = document.getElementById('inputManualCedula');

    if (summary.is_fully_delivered) {
      // Ya retiró todos sus combos
      const lastDelivery = entitlements.find(e => e.delivery_id);
      const deliveryDate = (lastDelivery && lastDelivery.delivered_at) 
        ? new Date(lastDelivery.delivered_at) 
        : new Date();
      const hh = String(deliveryDate.getHours()).padStart(2, '0');
      const mm = String(deliveryDate.getMinutes()).padStart(2, '0');
      const deliveryTime = `${hh}:${mm}`;
      
      statusBox.className = 'alert-box alert-warning';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.85rem; padding: 0.25rem 0;">
          <span style="font-size: 1.8rem;">🛑</span>
          <div>
            <strong style="color: #b45309; font-size: 1rem; letter-spacing: 0.02em; display: block;">YA RETIRÓ TODOS SUS COMBOS HOY</strong>
            <p style="font-size: 0.85rem; color: #92400e; margin: 0.25rem 0 0 0; font-weight: 500;">
              El funcionario completó su cuota institucional asignada para la jornada (${summary.claimed_combos} combos entregados a las ${deliveryTime}).
            </p>
          </div>
        </div>
      `;

      // Ocultar las secciones de identidad, combos y botones para que SOLO muestre el mensaje
      if (secIdentity) secIdentity.style.display = 'none';
      if (secCombos) secCombos.style.display = 'none';
      if (secAction) secAction.style.display = 'none';

      // Limpiar campo de búsqueda y situar foco nuevamente
      if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 80);
      }

      if (btnDeliver) {
        btnDeliver.disabled = true;
        btnDeliver.innerHTML = `<span>✓ Todos los Combos Entregados</span>`;
        btnDeliver.style.opacity = '0.6';
      }
    } else {
      // Restaurar visibilidad de secciones si tiene combos pendientes
      if (secIdentity) secIdentity.style.display = 'flex';
      if (secCombos) secCombos.style.display = 'block';
      if (secAction) secAction.style.display = 'flex';
      
      if (summary.has_partial_delivery) {
      // Retiró parcialmente
      statusBox.className = 'alert-box alert-info';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">⏳</span>
          <div>
            <strong style="color: #0369a1; font-size: 0.95rem;">ENTREGA PARCIAL: TIENE COMBOS PENDIENTES</strong>
            <p style="font-size: 0.8rem; color: #0284c7; margin: 0.2rem 0 0 0;">
              Ya retiró ${summary.claimed_combos} combo(s). Restan ${summary.pending_combos} combo(s) por retirar en esta jornada.
            </p>
          </div>
        </div>
      `;
      if (btnDeliver) {
        btnDeliver.disabled = false;
        btnDeliver.innerHTML = `<span>📦 Despachar ${summary.pending_combos} Combo(s) Pendiente(s)</span>`;
        btnDeliver.style.opacity = '1';
      }
    } else {
      // Todo pendiente por retirar
      statusBox.className = 'alert-box alert-success';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">🟢</span>
          <div>
            <strong style="color: #047857; font-size: 0.95rem;">BENEFICIO DISPONIBLE &middot; PENDIENTE POR RETIRAR</strong>
            <p style="font-size: 0.8rem; color: #065f46; margin: 0.2rem 0 0 0;">
              Asignación activa para hoy: ${summary.total_combos} combos autorizados listos para descontar y entregar.
            </p>
          </div>
        </div>
      `;
      if (btnDeliver) {
        btnDeliver.disabled = false;
        btnDeliver.innerHTML = `<span>📦 REGISTRAR ENTREGA & DESCONTAR (${summary.pending_combos} COMBOS)</span>`;
        btnDeliver.style.opacity = '1';
      }
    }
  }

  // Renderizar desglose de combos en 2 columnas
    const combosContainer = document.getElementById('manualWorkerCombosList');
    if (combosContainer) {
      combosContainer.innerHTML = entitlements.map((ent, idx) => {
        const isClaimed = ent.status === 'claimed';
        const nameLower = (ent.combo_name || '').toLowerCase();
        let comboIcon = ent.icon && ent.icon !== '🍱' && ent.icon !== '📦' ? ent.icon : null;
        if (!comboIcon) {
          if (ent.category === 'bolsa_viveres' || nameLower.includes('víveres') || nameLower.includes('canasta')) comboIcon = '🌾';
          else if (ent.category === 'combo_proteico' || nameLower.includes('charcutería') || nameLower.includes('prote')) comboIcon = '🍗';
          else if (nameLower.includes('limpieza')) comboIcon = '🧹';
          else if (ent.category === 'combo_higienico' || nameLower.includes('higiene') || nameLower.includes('aseo')) comboIcon = '🧼';
          else if (ent.category === 'utiles_escolares' || nameLower.includes('escolar')) comboIcon = '🎒';
          else comboIcon = '📦';
        }

        const shiftLabel = ent.mesa_name || (
          ent.shift === 'estacion_1' || ent.category === 'bolsa_viveres' ? 'Mesa 1 &middot; Víveres Secos' :
          ent.shift === 'estacion_2' || ent.category === 'combo_proteico' ? 'Mesa 2 &middot; Charcutería / Proteína' :
          nameLower.includes('limpieza') ? 'Mesa 4 &middot; Artículos de Limpieza' :
          (ent.category === 'combo_higienico' || nameLower.includes('higiene')) ? 'Mesa 2 &middot; Higiene y Aseo Personal' :
          'Mesa de Despacho Institucional'
        );

        let itemsDetailBadge = '';
        if (ent.items_detail) {
          itemsDetailBadge = `<div style="font-size: 0.70rem; color: #0369a1; margin-top: 0.25rem; font-weight: 600; line-height: 1.2;">📦 Unidad: 1 combo (${escapeHtml(ent.items_detail)})</div>`;
        } else if (nameLower.includes('higiene')) {
          itemsDetailBadge = `<div style="font-size: 0.70rem; color: #0369a1; margin-top: 0.25rem; font-weight: 600; line-height: 1.2;">📦 Unidad: 1 combo (4 artículos: Jabón, Crema Dental, Champú y Papel)</div>`;
        } else if (nameLower.includes('limpieza')) {
          itemsDetailBadge = `<div style="font-size: 0.70rem; color: #0369a1; margin-top: 0.25rem; font-weight: 600; line-height: 1.2;">📦 Unidad: 1 combo (Artículos de limpieza del hogar)</div>`;
        }

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-radius: 10px; border: 1.5px solid ${isClaimed ? '#cbd5e1' : '#bae6fd'}; background: ${isClaimed ? '#f8fafc' : '#ffffff'}; box-shadow: ${isClaimed ? 'none' : '0 2px 6px rgba(2, 132, 199, 0.06)'}; height: 100%; box-sizing: border-box; transition: transform 0.15s ease, box-shadow 0.15s ease;">
            <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1; min-width: 0;">
              <span style="font-size: 1.65rem; flex-shrink: 0; width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center; background: ${isClaimed ? '#e2e8f0' : 'rgba(2, 132, 199, 0.08)'}; border-radius: 9px;">
                ${comboIcon}
              </span>
              <div style="min-width: 0; flex: 1;">
                <div style="font-weight: 700; color: #0f172a; font-size: 0.88rem; line-height: 1.25; word-break: break-word;">
                  ${escapeHtml(ent.combo_name)}
                </div>
                <div style="font-size: 0.74rem; color: #64748b; margin-top: 0.15rem; font-weight: 500;">
                  ${shiftLabel} ${ent.weight_kg ? `&middot; ~${ent.weight_kg} kg` : ''}
                </div>
                ${itemsDetailBadge}
              </div>
            </div>
            <div style="margin-left: 0.75rem; flex-shrink: 0;">
              ${isClaimed 
                ? '<span class="badge badge-success" style="background: #10b981; color: white; font-size: 0.75rem; padding: 0.35rem 0.65rem; border-radius: 6px; font-weight: 700;">✓ Entregado</span>'
                : `<label style="display: inline-flex; align-items: center; gap: 0.45rem; cursor: pointer; font-size: 0.82rem; font-weight: 700; color: #0284c7; background: #f0f9ff; padding: 0.4rem 0.75rem; border-radius: 8px; border: 1.5px solid #bae6fd; user-select: none;">
                    <input type="checkbox" class="manual-combo-checkbox" value="${ent.entitlement_id}" checked style="width: 17px; height: 17px; cursor: pointer; accent-color: #0284c7;" />
                    <span>Entregar</span>
                  </label>`
              }
            </div>
          </div>
        `;
      }).join('');
    }

    if (card) {
      card.style.display = 'block';
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Ejecutar entrega manual y descontar
  async function executeDelivery() {
    if (!currentWorkerData || !currentWorkerData.worker) return;

    // Obtener checkboxes seleccionados
    const checkedBoxes = Array.from(document.querySelectorAll('.manual-combo-checkbox:checked'));
    const entitlementIds = checkedBoxes.map(cb => cb.value);

    if (entitlementIds.length === 0) {
      Toast.warning('Debe seleccionar al menos un combo para entregar.');
      return;
    }

    const btnDeliver = document.getElementById('btnExecuteManualDelivery');
    if (btnDeliver) {
      btnDeliver.disabled = true;
      btnDeliver.innerHTML = `<span>⏳ Procesando Despacho...</span>`;
    }

    try {
      const payload = {
        worker_id: currentWorkerData.worker.id,
        entitlement_ids: entitlementIds,
        note: 'Entrega manual registrada en Portal RRHH'
      };

      const res = await API.post('/api/v1/manual-dispatch/deliver', payload);

      if (res.success) {
        if (typeof window.playAudioFeedback === 'function') {
          window.playAudioFeedback('delivery_approved');
        } else if (typeof window.triggerHaptic === 'function') {
          window.triggerHaptic('delivery_approved');
        }
        Toast.success(res.message);

        // Recargar datos del trabajador y resumen
        const docId = currentWorkerData.worker.document_id;
        await searchWorker(docId);
        await loadTodaySummary();

        // Limpiar el campo de búsqueda y reenfocar
        const searchInput = document.getElementById('inputManualCedula');
        if (searchInput) {
          searchInput.value = '';
          setTimeout(() => searchInput.focus(), 80);
        }
      } else {
        if (typeof window.playAudioFeedback === 'function') {
          window.playAudioFeedback('error');
        }
        Toast.error(res.error || 'Error al procesar la entrega.');
        if (btnDeliver) btnDeliver.disabled = false;
      }
    } catch (err) {
      if (typeof window.playAudioFeedback === 'function') {
        window.playAudioFeedback('error');
      }
      Toast.error('Fallo de conexión o error: ' + err.message);
      if (btnDeliver) btnDeliver.disabled = false;
    }
  }

  // Abrir modal de incorporación rápida
  function openFastIncorporateModal(prefilledCedula = '') {
    const modal = document.getElementById('fastIncorporateModalBackdrop');
    const inputCedula = document.getElementById('fastWorkerDoc');
    const selectDep = document.getElementById('fastWorkerDepartment');

    if (inputCedula) {
      // Limpiar prefijo para dejar solo los números si viene con V-
      const cleanDigits = prefilledCedula.replace(/[^0-9]/g, '');
      inputCedula.value = cleanDigits || prefilledCedula;
    }

    // Poblar departamentos
    if (selectDep && departmentsCache.length > 0) {
      selectDep.innerHTML = `
        <option value="">-- Seleccionar Dirección / Departamento --</option>
        ${departmentsCache.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('')}
      `;
    }

    if (modal) {
      modal.classList.add('active');
    }
  }

  // Cerrar modal de incorporación
  function closeFastIncorporateModal() {
    const modal = document.getElementById('fastIncorporateModalBackdrop');
    if (modal) modal.classList.remove('active');
  }

  // Procesar envío de incorporación rápida
  async function handleFastIncorporateSubmit(e) {
    e.preventDefault();

    const docType = document.getElementById('fastWorkerDocType')?.value || 'V';
    const docNumber = document.getElementById('fastWorkerDoc')?.value.trim();
    const fullName = document.getElementById('fastWorkerFullName')?.value.trim();
    const departmentName = document.getElementById('fastWorkerDepartment')?.value.trim();
    const workerType = document.getElementById('fastWorkerType')?.value || 'activo';
    const combosQty = document.getElementById('fastWorkerCombosQty')?.value || '2';
    const deliverNow = document.getElementById('fastWorkerDeliverNow')?.checked;

    if (!docNumber || !fullName) {
      Toast.warning('Cédula y Nombres Completos son obligatorios.');
      return;
    }

    const formattedCedula = `${docType}-${docNumber.replace(/[^0-9]/g, '')}`;

    const btnSubmit = document.getElementById('btnSubmitFastIncorporate');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Guardando e Incorporando...';
    }

    try {
      const payload = {
        document_id: formattedCedula,
        full_name: fullName,
        department_name: departmentName,
        worker_type: workerType,
        combos_qty: parseInt(combosQty, 10),
        deliver_now: deliverNow,
        note: 'Incorporación al vuelo por contingencia de primera jornada'
      };

      const res = await API.post('/api/v1/manual-dispatch/incorporate', payload);

      if (res.success) {
        if (typeof SoundManager !== 'undefined' && SoundManager.playSuccess) {
          SoundManager.playSuccess();
        }
        Toast.success(res.message);
        closeFastIncorporateModal();

        // Limpiar input de búsqueda con la nueva cédula y buscarla para mostrar su ficha
        const searchInput = document.getElementById('inputManualCedula');
        if (searchInput) searchInput.value = formattedCedula;

        await searchWorker(formattedCedula);
        await loadTodaySummary();
      } else {
        Toast.error(res.error || 'Error al incorporar trabajador.');
      }
    } catch (err) {
      Toast.error('Fallo de conexión o error: ' + err.message);
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = '🚀 Incorporar y Despachar Combos Ahora';
      }
    }
  }

  // Reiniciar entregas a 0 con confirmación y clave de seguridad 0578
  async function handleResetDeliveries() {
    const key = prompt(
      '🔒 AUTORIZACIÓN DE SEGURIDAD REQUERIDA:\n\n' +
      'Esta acción reiniciará a CERO (0) todas las entregas registradas hoy y restaurará las asignaciones a estado PENDIENTE.\n\n' +
      'Ingrese la clave de seguridad para autorizar:'
    );

    if (key === null) return; // Usuario canceló el diálogo

    if (key.trim() !== '0578') {
      Toast.error('Clave de seguridad incorrecta. Acción cancelada.');
      return;
    }

    try {
      const res = await API.post('/api/v1/manual-dispatch/reset-deliveries', { key: key.trim() });
      if (res.success) {
        Toast.success('¡Entregas reiniciadas a 0 exitosamente!');
        // Limpiar tarjeta actual si había alguien buscado
        const cardResult = document.getElementById('manualWorkerResultCard');
        if (cardResult) cardResult.style.display = 'none';

        const searchInput = document.getElementById('inputManualCedula');
        if (searchInput && searchInput.value) {
          searchWorker(searchInput.value);
        }

        await loadTodaySummary();
      } else {
        Toast.error(res.error || 'Error reiniciando entregas.');
      }
    } catch (err) {
      Toast.error('Error: ' + err.message);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    init,
    searchWorker,
    loadTodaySummary
  };
})();

// Helper global y auto-inicializar cuando el DOM esté listo
window.loadManualDispatchStats = () => {
  if (window.ManualDispatch && typeof window.ManualDispatch.loadTodaySummary === 'function') {
    return window.ManualDispatch.loadTodaySummary();
  }
};

window.addEventListener('combos:updated', () => {
  if (window.ManualDispatch && typeof window.ManualDispatch.loadTodaySummary === 'function') {
    window.ManualDispatch.loadTodaySummary();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (window.ManualDispatch && typeof window.ManualDispatch.init === 'function') {
    window.ManualDispatch.init();
  }
});
