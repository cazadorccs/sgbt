// ============================================================================
// MÓDULO: DESPACHO MANUAL POR CÉDULA & INCORPORACIÓN A NÓMINA (PRIMERA JORNADA)
// Permite entrega de combos sin QR/NFC, descuento manual e incorporación al vuelo
// ============================================================================

window.ManualDispatch = (function() {
  let currentWorkerData = null;
  let departmentsCache = [];

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
      btnSearch.addEventListener('click', () => {
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

    // Botón para abrir modal de incorporación rápida
    const btnOpenIncorporate = document.getElementById('btnOpenFastIncorporate');
    if (btnOpenIncorporate) {
      btnOpenIncorporate.addEventListener('click', () => {
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

  // Renderizar despachos recientes
  function renderRecentDeliveries(deliveries) {
    const tbody = document.getElementById('recentManualDeliveriesBody');
    const countBadge = document.getElementById('recentDeliveriesCount');
    if (countBadge) countBadge.textContent = `${deliveries.length} registros`;

    if (!tbody) return;

    if (deliveries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">📦</div>
            <div>No se han registrado entregas manuales todavía hoy. Las entregas están en 0.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = deliveries.map(d => {
      const timeStr = d.delivered_at ? new Date(d.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--';
      const badgeMethod = d.verification_method === 'manual_incorporation_rrhh'
        ? '<span class="badge" style="background: #8b5cf6; color: white;">Incorporación Directa</span>'
        : '<span class="badge" style="background: #0284c7; color: white;">Manual RRHH</span>';

      return `
        <tr style="border-bottom: 1px solid rgba(226, 232, 240, 0.7);">
          <td style="padding: 0.65rem 0.75rem; font-family: monospace; font-weight: 700; color: #0284c7;">
            ${timeStr}
          </td>
          <td style="padding: 0.65rem 0.75rem;">
            <div style="font-weight: 700; color: #0f172a;">${escapeHtml(d.full_name)}</div>
            <div style="font-size: 0.75rem; color: #64748b; font-family: monospace;">${escapeHtml(d.document_id)} &middot; <span style="text-transform: capitalize;">${escapeHtml(d.worker_type || 'activo')}</span></div>
          </td>
          <td style="padding: 0.65rem 0.75rem; font-size: 0.8rem; color: #334155;">
            ${escapeHtml(d.department_name || 'Nómina Central')}
          </td>
          <td style="padding: 0.65rem 0.75rem;">
            <span style="display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; font-size: 0.82rem; color: #047857; background: #ecfdf5; padding: 0.2rem 0.5rem; border-radius: 6px;">
              <span>${d.combo_icon || '🍱'}</span>
              <span>${escapeHtml(d.combo_name)}</span>
            </span>
          </td>
          <td style="padding: 0.65rem 0.75rem;">
            ${badgeMethod}
          </td>
        </tr>
      `;
    }).join('');
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

    if (summary.is_fully_delivered) {
      // Ya retiró todos sus combos
      const lastDelivery = entitlements.find(e => e.delivery_id);
      const deliveryTime = lastDelivery && lastDelivery.delivered_at 
        ? new Date(lastDelivery.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Hoy';
      
      statusBox.className = 'alert-box alert-warning';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">🛑</span>
          <div>
            <strong style="color: #b45309; font-size: 0.95rem;">YA RETIRÓ TODOS SUS COMBOS HOY</strong>
            <p style="font-size: 0.8rem; color: #92400e; margin: 0.2rem 0 0 0;">
              El funcionario completó su cuota institucional asignada para la jornada (${summary.claimed_combos} combos entregados a las ${deliveryTime}).
            </p>
          </div>
        </div>
      `;
      if (btnDeliver) {
        btnDeliver.disabled = true;
        btnDeliver.innerHTML = `<span>✓ Todos los Combos Entregados</span>`;
        btnDeliver.style.opacity = '0.6';
      }
    } else if (summary.has_partial_delivery) {
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

    // Renderizar desglose de combos
    const combosContainer = document.getElementById('manualWorkerCombosList');
    if (combosContainer) {
      combosContainer.innerHTML = entitlements.map((ent, idx) => {
        const isClaimed = ent.status === 'claimed';
        const shiftLabel = ent.shift === 'estacion_1' ? 'Mesa 1 &middot; Víveres Secos' : ent.shift === 'estacion_2' ? 'Mesa 2 &middot; Proteína Fresca' : 'Combo Asignado';

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid ${isClaimed ? '#cbd5e1' : '#bae6fd'}; background: ${isClaimed ? '#f8fafc' : '#f0f9ff'}; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 1.5rem;">${ent.icon || '🍱'}</span>
              <div>
                <div style="font-weight: 700; color: #0f172a; font-size: 0.88rem;">
                  ${escapeHtml(ent.combo_name)}
                </div>
                <div style="font-size: 0.72rem; color: #64748b;">
                  ${shiftLabel} ${ent.weight_kg ? `&middot; ~${ent.weight_kg} kg` : ''}
                </div>
              </div>
            </div>
            <div>
              ${isClaimed 
                ? '<span class="badge badge-success" style="background: #10b981; color: white; font-size: 0.75rem;">✓ Entregado</span>'
                : `<label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.82rem; font-weight: 700; color: #0284c7;">
                    <input type="checkbox" class="manual-combo-checkbox" value="${ent.entitlement_id}" checked style="width: 18px; height: 18px;" />
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
        if (typeof SoundManager !== 'undefined' && SoundManager.playSuccess) {
          SoundManager.playSuccess();
        }
        Toast.success(res.message);

        // Recargar datos del trabajador y resumen
        await searchWorker(currentWorkerData.worker.document_id);
        await loadTodaySummary();
      } else {
        Toast.error(res.error || 'Error al procesar la entrega.');
        if (btnDeliver) btnDeliver.disabled = false;
      }
    } catch (err) {
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

  // Reiniciar entregas a 0 con confirmación
  async function handleResetDeliveries() {
    const confirmReset = confirm(
      '⚠️ ATENCIÓN: ¿Está seguro de que desea REINICIAR TODAS LAS ENTREGAS A CERO?\n\n' +
      '- Se borrarán todos los registros de despachos realizados.\n' +
      '- Se restaurarán todos los combos de hoy a estado PENDIENTE.\n' +
      '- El contador de entregas quedará exactamente en 0.\n\n' +
      '¿Desea continuar con el reinicio?'
    );

    if (!confirmReset) return;

    try {
      const res = await API.post('/api/v1/manual-dispatch/reset-deliveries', {});
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

// Auto-inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  if (window.ManualDispatch && typeof window.ManualDispatch.init === 'function') {
    window.ManualDispatch.init();
  }
});
