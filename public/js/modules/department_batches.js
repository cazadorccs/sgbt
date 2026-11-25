// public/js/modules/department_batches.js
// ============================================================================
// MÓDULO: ENTREGAS MASIVAS POR DEPENDENCIA Y CADENA DE APROBACIÓN (FASE 4)
// Flujo: Solicitud de Lote -> Revisión RRHH -> Despacho en Almacén -> Acta SHA-256
// ============================================================================

(function(window) {
  'use strict';

  const DepartmentBatches = {
    currentOrders: [],
    departments: [],
    entes: [],
    combos: [],
    currentDepartmentMembers: [],
    selectedDelegate: null,
    currentOrderInReview: null,
    currentOrderInDispatch: null,

    /**
     * Inicialización del módulo y vinculación de eventos
     */
    init: function() {
      this.bindEvents();
      console.log('🏢 [DepartmentBatches] Módulo de Lotes Institucionales inicializado v4.0');
    },

    /**
     * Vinculación de listeners de la interfaz
     */
    bindEvents: function() {
      // 1. Botón tab y navegación
      const tabBtn = document.querySelector('.portal-subtab[data-subtab="subtab-department-batches"]');
      if (tabBtn) {
        tabBtn.addEventListener('click', () => {
          this.loadData();
        });
      }

      // 2. Botón refrescar
      const btnRefresh = document.getElementById('btnRefreshDepartmentBatches');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          this.loadData();
        });
      }

      // 3. Filtros de búsqueda
      const searchInput = document.getElementById('filterBatchOrdersInput');
      if (searchInput) {
        searchInput.addEventListener('input', () => this.renderOrdersTable());
      }
      const statusSelect = document.getElementById('filterBatchStatusSelect');
      if (statusSelect) {
        statusSelect.addEventListener('change', () => this.renderOrdersTable());
      }

      // 4. Modal Crear Solicitud
      const btnOpenCreate = document.getElementById('btnOpenCreateBatchModal');
      if (btnOpenCreate) {
        btnOpenCreate.addEventListener('click', () => this.openCreateModal());
      }
      const btnCloseCreate = document.getElementById('btnCloseCreateBatchModal');
      const btnCancelCreate = document.getElementById('btnCancelCreateBatchModal');
      if (btnCloseCreate) btnCloseCreate.addEventListener('click', () => this.closeCreateModal());
      if (btnCancelCreate) btnCancelCreate.addEventListener('click', () => this.closeCreateModal());

      const createForm = document.getElementById('createBatchOrderForm');
      if (createForm && !createForm._hasBatchListener) {
        createForm._hasBatchListener = true;
        createForm.addEventListener('submit', (e) => this.submitCreateOrder(e));
      }

      const deptSelect = document.getElementById('createBatchDeptSelect');
      if (deptSelect && !deptSelect._hasBatchListener) {
        deptSelect._hasBatchListener = true;
        deptSelect.addEventListener('change', () => this.updateCreateProjection());
      }
      const comboSelect = document.getElementById('createBatchComboSelect');
      if (comboSelect && !comboSelect._hasBatchListener) {
        comboSelect._hasBatchListener = true;
        comboSelect.addEventListener('change', () => this.updateCreateProjection());
      }

      // 5–8. Delegación universal para modales inyectados asíncronamente desde templates/modals.html
      document.addEventListener('click', (e) => {
        if (e.target.closest('#btnCloseCreateBatchModal, #btnCancelCreateBatchModal')) {
          this.closeCreateModal();
        } else if (e.target.closest('#btnCloseReviewBatchModal')) {
          this.closeReviewModal();
        } else if (e.target.closest('#btnApproveBatchOrder')) {
          e.preventDefault();
          this.submitReviewOrder('approve');
        } else if (e.target.closest('#btnRejectBatchOrder')) {
          e.preventDefault();
          this.submitReviewOrder('reject');
        } else if (e.target.closest('#btnCloseDispatchBatchModal, #btnCancelDispatchBatchModal')) {
          this.closeDispatchModal();
        } else if (e.target.closest('#btnConfirmBatchDispatch')) {
          e.preventDefault();
          this.submitDispatchOrder();
        } else if (e.target.closest('#btnCloseBatchActaModal, #btnCloseBatchActaModalBtn')) {
          this.closeActaModal();
        } else if (e.target.closest('#btnPrintBatchActa')) {
          e.preventDefault();
          this.printActa();
        }
      });

      document.addEventListener('change', (e) => {
        if (!e.target) return;
        if (e.target.id === 'createBatchDeptSelect' && !e.target._hasBatchListener) {
          this.updateCreateProjection();
        } else if (e.target.classList && e.target.classList.contains('batch-delegate-checkbox')) {
          const workerId = e.target.getAttribute('data-worker-id') || '';
          this.selectDelegateById(e.target.checked ? workerId : '');
        }
      });

      document.addEventListener('input', (e) => {
        if (!e.target) return;
        if (e.target.id === 'createBatchDeptSearch') {
          this.renderEnteSelectOptions(e.target.value);
        } else if (e.target.id === 'createBatchMemberSearch') {
          this.renderDepartmentMembersList(e.target.value);
        }
      });

      document.addEventListener('submit', (e) => {
        if (e.target && e.target.id === 'createBatchOrderForm' && !e.target._hasBatchListener) {
          this.submitCreateOrder(e);
        }
      });

      // 9. Re-vincular al completarse la inyección de plantillas HTML
      window.addEventListener('templates:loaded', () => {
        const createForm = document.getElementById('createBatchOrderForm');
        if (createForm && !createForm._hasBatchListener) {
          createForm._hasBatchListener = true;
          createForm.addEventListener('submit', (e) => this.submitCreateOrder(e));
        }
        const deptSelect = document.getElementById('createBatchDeptSelect');
        if (deptSelect && !deptSelect._hasBatchListener) {
          deptSelect._hasBatchListener = true;
          deptSelect.addEventListener('change', () => this.updateCreateProjection());
        }
      });
    },

    /**
     * Carga todas las métricas, órdenes y dependencias
     */
    loadData: async function() {
      try {
        await Promise.all([
          this.loadStats(),
          this.loadOrders(),
          this.loadDepartments()
        ]);
      } catch (err) {
        console.error('❌ [DepartmentBatches] Error cargando datos de lotes:', err);
      }
    },

    /**
     * Carga KPIs generales e inventario
     */
    loadStats: async function() {
      try {
        const res = await API.get('/api/v1/department-batches/stats');
        if (res && res.success && res.stats) {
          const s = res.stats;
          const elTotal = document.getElementById('deptKpiTotalDepts');
          const elPending = document.getElementById('deptKpiPendingReview');
          const elApproved = document.getElementById('deptKpiApproved');
          const elCombos = document.getElementById('deptKpiCombosDispatched');
          const badgePending = document.getElementById('badgePendingBatches');

          if (elTotal) elTotal.textContent = s.total_departments;
          if (elPending) elPending.textContent = s.pending_review_orders;
          if (elApproved) elApproved.textContent = s.approved_awaiting_dispatch;
          if (elCombos) elCombos.textContent = s.total_combos_delivered_in_batches;

          if (badgePending) {
            if (s.pending_review_orders > 0) {
              badgePending.textContent = s.pending_review_orders;
              badgePending.style.display = 'inline-block';
            } else {
              badgePending.style.display = 'none';
            }
          }

          // Renderizar lista de inventario de combos
          this.combos = s.combos_inventory || [];
          this.renderStockList(this.combos);
        }
      } catch (e) {
        console.warn('[DepartmentBatches] Error cargando stats:', e);
      }
    },

    /**
     * Renderiza inventario disponible para lotes
     */
    renderStockList: function(combos) {
      const container = document.getElementById('departmentBatchStockList');
      if (!container) return;

      if (!combos || combos.length === 0) {
        container.innerHTML = '<div style="font-size: 0.75rem; color: #94a3b8; text-align: center; padding: 1rem;">No hay combos activos registrados.</div>';
        return;
      }

      container.innerHTML = combos.map(c => {
        const stock = (c.stock !== null && c.stock !== undefined) ? c.stock : 5000;
        const isLow = stock < 200;
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 0.55rem 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">${c.icon || '📦'}</span>
              <div>
                <strong style="font-size: 0.82rem; color: #f8fafc; display: block;">${window.escapeHtml(c.name)}</strong>
                <span style="font-size: 0.68rem; color: #94a3b8;">${c.weight_kg || 14} kg &middot; ${c.category || 'Alimenticio'}</span>
              </div>
            </div>
            <div style="text-align: right;">
              <span class="badge ${isLow ? 'badge-inactivo' : 'badge-activo'}" style="font-size: 0.72rem; font-weight: 800;">
                ${stock} disp.
              </span>
            </div>
          </div>
        `;
      }).join('');
    },

    /**
     * Carga listado de dependencias censadas
     */
    loadDepartments: async function() {
      try {
        const res = await API.get('/api/v1/department-batches/departments');
        if (res && res.success) {
          this.departments = res.departments || [];
          this.entes = res.entes || [];
          this.renderCoverageList(this.departments);
        }
      } catch (e) {
        console.warn('[DepartmentBatches] Error cargando dependencias:', e);
      }
    },

    /**
     * Renderiza tarjeta de cobertura de dependencias
     */
    renderCoverageList: function(depts) {
      const container = document.getElementById('departmentBatchCoverageList');
      if (!container) return;

      if (!depts || depts.length === 0) {
        container.innerHTML = '<div style="font-size: 0.75rem; color: #94a3b8; text-align: center; padding: 1rem;">No hay dependencias registradas.</div>';
        return;
      }

      container.innerHTML = depts.map(d => {
        const total = d.total_workers || 0;
        const claimed = d.claimed_workers_today || 0;
        const pct = total > 0 ? Math.round((claimed / total) * 100) : 0;
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.74rem;">
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 230px;" title="${window.escapeHtml(d.name)}">
              <strong style="color: #e2e8f0;">${window.escapeHtml(d.name)}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 0.45rem;">
              <span style="color: #94a3b8; font-size: 0.68rem;">${claimed}/${total} (${pct}%)</span>
              ${d.active_batch_orders_today > 0 ? '<span class="badge badge-viveres" style="font-size: 0.6rem; padding: 1px 5px;">Lote Activo</span>' : ''}
            </div>
          </div>
        `;
      }).join('');
    },

    /**
     * Carga pipeline de órdenes de lote
     */
    loadOrders: async function() {
      try {
        const res = await API.get('/api/v1/department-batches/orders');
        if (res && res.success && res.orders) {
          this.currentOrders = res.orders;
          this.renderOrdersTable();
        }
      } catch (e) {
        console.warn('[DepartmentBatches] Error cargando órdenes:', e);
      }
    },

    /**
     * Renderiza la tabla de órdenes de lote con filtros dinámicos
     */
    renderOrdersTable: function() {
      const tbody = document.getElementById('departmentBatchesTableBody');
      if (!tbody) return;

      const q = (document.getElementById('filterBatchOrdersInput')?.value || '').trim().toLowerCase();
      const statusFilter = document.getElementById('filterBatchStatusSelect')?.value || 'all';

      let filtered = this.currentOrders;

      if (statusFilter !== 'all') {
        filtered = filtered.filter(o => o.status === statusFilter);
      }

      if (q) {
        filtered = filtered.filter(o => {
          return (o.order_number && o.order_number.toLowerCase().includes(q)) ||
                 (o.department_name && o.department_name.toLowerCase().includes(q)) ||
                 (o.delegate_name && o.delegate_name.toLowerCase().includes(q)) ||
                 (o.delegate_document_id && o.delegate_document_id.toLowerCase().includes(q));
        });
      }

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
              No se encontraron órdenes de lote con los filtros aplicados.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map(order => {
        let statusBadge = '';
        if (order.status === 'pending_review') {
          statusBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 0.7rem; font-weight: 700;">🟡 Pendiente RRHH</span>';
        } else if (order.status === 'approved') {
          statusBadge = '<span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 0.7rem; font-weight: 700;">🔵 Aprobado Almacén</span>';
        } else if (order.status === 'dispatched') {
          statusBadge = '<span class="badge" style="background: rgba(52, 211, 153, 0.2); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); font-size: 0.7rem; font-weight: 700;">🟢 Despachado</span>';
        } else if (order.status === 'rejected') {
          statusBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 0.7rem; font-weight: 700;">🔴 Rechazado</span>';
        }

        // Acciones permitidas según estado y rol
        let actionsHtml = '';
         if (order.status === 'pending_review') {
           actionsHtml = `
             <button class="btn btn-outline" onclick="window.DepartmentBatches.openReviewModal('${order.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; border-color: #f59e0b; color: #fbbf24;" title="Revisar y Autorizar Solicitud">
               ⚖️ Revisar
             </button>
             <button class="btn btn-outline" onclick="window.DepartmentBatches.editDelegate('${order.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; border-color: #38bdf8; color: #38bdf8;" title="Editar Delegado Receptor">
               ✏️ Editar
             </button>
             <button class="btn btn-outline" onclick="window.DepartmentBatches.deleteOrder('${order.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; border-color: #ef4444; color: #fca5a5;" title="Eliminar Orden">
               🗑️ Eliminar
             </button>
           `;
         } else if (order.status === 'approved') {
           actionsHtml = `
             <button class="btn btn-primary" onclick="window.DepartmentBatches.openDispatchModal('${order.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; background: linear-gradient(135deg, #059669, #047857); border-color: #34d399;" title="Ejecutar Despacho en Almacén">
               📦 Despachar
             </button>
             <button class="btn btn-outline" onclick="window.DepartmentBatches.editDelegate('${order.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; border-color: #38bdf8; color: #38bdf8;" title="Editar Delegado Receptor">
               ✏️ Editar
             </button>
             <button class="btn btn-outline" onclick="window.DepartmentBatches.deleteOrder('${order.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; border-color: #ef4444; color: #fca5a5;" title="Eliminar Orden">
               🗑️ Eliminar
             </button>
           `;
         } else if (order.status === 'dispatched') {
          actionsHtml = `
            <button class="btn btn-outline" onclick="window.DepartmentBatches.viewActa('${order.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; border-color: #38bdf8; color: #38bdf8;" title="Ver Acta Oficial de Entrega con Sello SHA-256">
              📜 Ver Acta
            </button>
          `;
        }

        return `
          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
            <td style="padding: 0.6rem 0.75rem; font-family: monospace; font-weight: 800; color: #38bdf8;">
              ${order.order_number}
            </td>
            <td style="padding: 0.6rem 0.75rem;">
              <strong style="color: #f8fafc; display: block;">${window.escapeHtml(order.department_name)}</strong>
              <span style="font-size: 0.68rem; color: #64748b;">Código: ${order.department_code || '--'}</span>
            </td>
            <td style="padding: 0.6rem 0.75rem;">
              <span style="color: #e2e8f0; font-weight: 600; display: block;">${window.escapeHtml(order.delegate_name)}</span>
              <span style="font-size: 0.68rem; color: #94a3b8;">${order.delegate_document_id} ${order.delegate_phone ? `&middot; ${order.delegate_phone}` : ''}</span>
            </td>
            <td style="padding: 0.6rem 0.75rem; text-align: center; font-weight: 700; color: #f8fafc;">
              ${order.total_beneficiaries}
            </td>
            <td style="padding: 0.6rem 0.75rem; text-align: center; font-weight: 800; color: #38bdf8;">
              ${order.total_combos}
            </td>
            <td style="padding: 0.6rem 0.75rem; text-align: center; color: #34d399; font-weight: 600;">
              ${order.total_weight_kg ? `${order.total_weight_kg} kg` : '--'}
            </td>
            <td style="padding: 0.6rem 0.75rem; text-align: center;">
              ${statusBadge}
            </td>
            <td style="padding: 0.6rem 0.75rem; text-align: right;">
              ${actionsHtml}
            </td>
          </tr>
        `;
      }).join('');
    },

    /**
     * Abre modal para crear solicitud de lote
     */
    openCreateModal: async function() {
      const modal = document.getElementById('createDepartmentBatchModalBackdrop');
      if (!modal) return;

      const deptSelect = document.getElementById('createBatchDeptSelect');
      const deptSearch = document.getElementById('createBatchDeptSearch');
      const memberSearch = document.getElementById('createBatchMemberSearch');
      if (deptSelect) {
        deptSelect.innerHTML = '<option value="">Cargando Entes con personal activo...</option>';
      }
      if (deptSearch) deptSearch.value = '';
      if (memberSearch) memberSearch.value = '';

      // Resetear campos y selección de delegado
      this.currentDepartmentMembers = [];
      this.selectDelegateById('');
      const notesEl = document.getElementById('createBatchNotes');
      const summaryBox = document.getElementById('createBatchSummaryBox');
      if (notesEl) notesEl.value = '';
      if (summaryBox) summaryBox.style.display = 'none';

      modal.classList.add('active');

      // Refrescar catálogo de combos (si aún no está cargado) y Entes en vivo
      const tasks = [this.loadDepartments()];
      if (!this.combos || this.combos.length === 0) {
        tasks.push(this.loadStats());
      }
      await Promise.all(tasks);

      this.renderEnteSelectOptions('');
    },

    /**
     * Renderiza las opciones del select dinámico de Entes según el término de búsqueda
     */
    renderEnteSelectOptions: function(searchTerm = '') {
      const deptSelect = document.getElementById('createBatchDeptSelect');
      if (!deptSelect) return;

      const allEntes = (this.entes && this.entes.length > 0)
        ? this.entes.filter(e => (e.total_workers || 0) > 0)
        : this.departments.filter(d => d.is_ente_group && (d.total_workers || 0) > 0);

      const q = String(searchTerm || '').trim().toLowerCase();
      const filtered = q
        ? allEntes.filter(e => String(e.ente || e.name || '').toLowerCase().includes(q))
        : allEntes;

      const prevValue = deptSelect.value;

      if (filtered.length === 0) {
        deptSelect.innerHTML = '<option value="">Sin Entes coincidentes...</option>';
        deptSelect.value = '';
        this.updateCreateProjection();
        return;
      }

      deptSelect.innerHTML = (filtered.length > 1 || !q ? '<option value="">Seleccione un Ente...</option>' : '') +
        filtered.map(e => `<option value="${window.escapeHtml(e.id)}">${window.escapeHtml(e.ente || e.name)} (${e.total_workers} beneficiarios)</option>`).join('');

      if (q && filtered.length === 1) {
        deptSelect.value = filtered[0].id;
        this.updateCreateProjection();
      } else if (prevValue && filtered.some(e => e.id === prevValue)) {
        deptSelect.value = prevValue;
      } else if (prevValue && !filtered.some(e => e.id === prevValue)) {
        deptSelect.value = '';
        this.updateCreateProjection();
      }
    },

    closeCreateModal: function() {
      const modal = document.getElementById('createDepartmentBatchModalBackdrop');
      if (modal) modal.classList.remove('active');
    },

    /**
     * Actualiza proyección en vivo de beneficiarios, combos e integrantes al seleccionar Ente
     */
    updateCreateProjection: async function() {
      const deptId = document.getElementById('createBatchDeptSelect')?.value;
      const summaryBox = document.getElementById('createBatchSummaryBox');
      this.selectDelegateById('');
      this.currentDepartmentMembers = [];
      const memberSearch = document.getElementById('createBatchMemberSearch');
      if (memberSearch) memberSearch.value = '';

      if (!deptId) {
        if (summaryBox) summaryBox.style.display = 'none';
        return;
      }

      const dept = [...(this.entes || []), ...(this.departments || [])].find(d => d.id === deptId);
      if (!dept) return;

      const workersCount = dept.total_workers || 0;
      const combosPerWorker = Math.max(1, (this.combos || []).length);
      const avgWeightPerWorker = (this.combos && this.combos.length > 0)
        ? this.combos.reduce((acc, item) => acc + (Number(item.weight_kg) || 14), 0)
        : 14.5;

      const totalCombos = workersCount * combosPerWorker;
      const totalWeight = Math.round(workersCount * avgWeightPerWorker);

      const elW = document.getElementById('createBatchCalcWorkers');
      const elC = document.getElementById('createBatchCalcCombos');
      const elKg = document.getElementById('createBatchCalcWeight');

      if (elW) elW.textContent = workersCount;
      if (elC) elC.textContent = totalCombos;
      if (elKg) elKg.textContent = `${totalWeight} kg`;

      if (summaryBox) summaryBox.style.display = 'block';

      await this.loadDepartmentMembersPreview(deptId);
    },

    /**
     * Carga la lista nominal de integrantes del Ente seleccionado para escoger Delegado mediante check
     */
    loadDepartmentMembersPreview: async function(deptId) {
      const listEl = document.getElementById('createBatchMembersList');
      const countBadge = document.getElementById('createBatchMembersCountBadge');
      if (!listEl) return;

      this._activeMembersFetchScope = deptId;
      if (countBadge) countBadge.textContent = 'Consultando integrantes...';
      listEl.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 0.45rem;">Cargando nómina del Ente...</div>';

      try {
        const res = await API.get(`/api/v1/department-batches/departments/${encodeURIComponent(deptId)}/beneficiaries`);
        if (this._activeMembersFetchScope !== deptId) return;

        const workers = (res && res.success && Array.isArray(res.workers)) ? res.workers : [];
        this.currentDepartmentMembers = workers;
        this.renderDepartmentMembersList(document.getElementById('createBatchMemberSearch')?.value || '');
      } catch (e) {
        if (this._activeMembersFetchScope !== deptId) return;
        this.currentDepartmentMembers = [];
        if (countBadge) countBadge.textContent = 'Error consultando';
        listEl.innerHTML = `<div style="color:#fca5a5; padding:0.4rem;">Error cargando integrantes: ${window.escapeHtml(e.message || 'Error de red')}</div>`;
      }
    },

    /**
     * Renderiza la lista filtrable de integrantes con check button para designar al Delegado Receptor
     */
    renderDepartmentMembersList: function(searchTerm = '') {
      const listEl = document.getElementById('createBatchMembersList');
      const countBadge = document.getElementById('createBatchMembersCountBadge');
      if (!listEl) return;

      const workers = this.currentDepartmentMembers || [];
      const q = String(searchTerm || '').trim().toLowerCase();
      const filtered = q
        ? workers.filter(w =>
            String(w.full_name || '').toLowerCase().includes(q) ||
            String(w.document_id || '').toLowerCase().includes(q) ||
            String(w.department_name || '').toLowerCase().includes(q) ||
            String(w.job_title || '').toLowerCase().includes(q)
          )
        : workers;

      if (countBadge) {
        countBadge.textContent = q
          ? `${filtered.length} de ${workers.length} coincidencia(s)`
          : `${workers.length} integrante(s) activo(s)`;
      }

      if (filtered.length === 0) {
        listEl.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 0.5rem;">No se encontraron integrantes con ese criterio.</div>';
        return;
      }

      const MAX_VISIBLE = 120;
      const visible = filtered.slice(0, MAX_VISIBLE);
      const selectedId = this.selectedDelegate ? this.selectedDelegate.id : '';

      let html = visible.map((w) => {
        const isChecked = w.id === selectedId;
        const stBadge = w.daily_status === 'claimed'
          ? '<span style="color:#34d399;">Entregado</span>'
          : '<span style="color:#38bdf8;">Pendiente</span>';
        const sub = [w.department_name || w.ente || 'MIPPCI', w.job_title || w.worker_type].filter(Boolean).join(' · ');
        const rowBg = isChecked ? 'rgba(14, 165, 233, 0.22)' : 'rgba(15, 23, 42, 0.55)';
        const rowBorder = isChecked ? '1px solid rgba(56, 189, 248, 0.7)' : '1px solid rgba(148, 163, 184, 0.14)';

        return `
          <label style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; background:${rowBg}; border:${rowBorder}; border-radius:6px; padding:0.35rem 0.55rem; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:0.5rem; min-width:0; flex:1;">
              <input type="checkbox" class="batch-delegate-checkbox" data-worker-id="${window.escapeHtml(w.id)}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; accent-color:#38bdf8; cursor:pointer; flex-shrink:0;" />
              <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                <strong style="color:#f8fafc;">${window.escapeHtml(w.full_name)}</strong>
                <span style="color:#94a3b8; font-family:monospace;">(${window.escapeHtml(w.document_id)})</span>
                ${sub ? `<span style="color:#64748b; font-size:0.66rem;"> · ${window.escapeHtml(sub)}</span>` : ''}
              </div>
            </div>
            <div style="flex-shrink:0; font-size:0.66rem; font-weight:700;">${stBadge}</div>
          </label>
        `;
      }).join('');

      if (filtered.length > MAX_VISIBLE) {
        html += `<div style="text-align:center; color:#94a3b8; font-size:0.68rem; padding:0.35rem;">Mostrando primeros ${MAX_VISIBLE} de ${filtered.length}. Use el filtro superior para ubicar rápidamente al delegado.</div>`;
      }

      listEl.innerHTML = html;
    },

    /**
     * Selecciona o limpia al Delegado Receptor Acreditado mediante check button (selección única)
     */
    selectDelegateById: function(workerId) {
      const worker = workerId
        ? (this.currentDepartmentMembers || []).find(w => w.id === workerId) || null
        : null;
      this.selectedDelegate = worker;

      const elName = document.getElementById('createBatchDelegateName');
      const elDoc = document.getElementById('createBatchDelegateDoc');
      const elPhone = document.getElementById('createBatchDelegatePhone');
      const cardEl = document.getElementById('createBatchSelectedDelegateCard');

      if (elName) elName.value = worker ? worker.full_name : '';
      if (elDoc) elDoc.value = worker ? worker.document_id : '';
      if (elPhone) elPhone.value = worker ? (worker.phone_number || '') : '';

      // Sincronizar estado de checkboxes visibles (un solo check activo)
      document.querySelectorAll('#createBatchMembersList .batch-delegate-checkbox').forEach(cb => {
        cb.checked = Boolean(worker && cb.getAttribute('data-worker-id') === worker.id);
      });

      if (cardEl) {
        if (worker) {
          cardEl.style.background = 'rgba(16, 185, 129, 0.12)';
          cardEl.style.border = '1.5px solid rgba(52, 211, 153, 0.55)';
          cardEl.style.color = '#e2e8f0';
          cardEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <div>
                <div style="font-size:0.68rem; font-weight:800; color:#34d399; text-transform:uppercase;">✅ Delegado Receptor Seleccionado</div>
                <div style="font-weight:700; color:#f8fafc; margin-top:0.1rem;">${window.escapeHtml(worker.full_name)}</div>
                <div style="font-size:0.72rem; color:#94a3b8;">C.I. ${window.escapeHtml(worker.document_id)}${worker.phone_number ? ` · Tel: ${window.escapeHtml(worker.phone_number)}` : ''}</div>
              </div>
              <button type="button" class="btn btn-outline" style="padding:0.2rem 0.55rem; font-size:0.68rem;" onclick="window.DepartmentBatches && window.DepartmentBatches.selectDelegateById('')">Quitar</button>
            </div>
          `;
        } else {
          cardEl.style.background = 'rgba(15, 23, 42, 0.65)';
          cardEl.style.border = '1px dashed rgba(56, 189, 248, 0.35)';
          cardEl.style.color = '#94a3b8';
          cardEl.innerHTML = '☑️ Seleccione primero el Ente y marque el <strong style="color: #38bdf8;">check</strong> de un integrante para asignarlo como <strong>Delegado Receptor Acreditado</strong>.';
        }
      }

      // Re-renderizar estilos activos en filas visibles
      if (this.currentDepartmentMembers && this.currentDepartmentMembers.length > 0) {
        this.renderDepartmentMembersList(document.getElementById('createBatchMemberSearch')?.value || '');
      }
    },

    /**
     * Envía la solicitud de orden de lote al backend (Stage 1)
     */
    submitCreateOrder: async function(e) {
      if (e) e.preventDefault();

      const deptId = document.getElementById('createBatchDeptSelect')?.value;
      const delName = document.getElementById('createBatchDelegateName')?.value;
      const delDoc = document.getElementById('createBatchDelegateDoc')?.value;
      const delPhone = document.getElementById('createBatchDelegatePhone')?.value;
      const notes = document.getElementById('createBatchNotes')?.value;

      if (!deptId) {
        if (typeof window.showToast === 'function') {
          window.showToast('Por favor seleccione el Ente solicitante (*)', 'warning');
        }
        return;
      }

      if (!delName || !delDoc) {
        if (typeof window.showToast === 'function') {
          window.showToast('Por favor marque el check de un integrante como Delegado Receptor Acreditado (*)', 'warning');
        }
        return;
      }

      const btn = document.getElementById('btnSubmitCreateBatchOrder');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Registrando...';
      }

      try {
        const res = await API.post('/api/v1/department-batches/orders', {
          department_id: deptId,
          combo_id: null,
          delegate_name: delName,
          delegate_document_id: delDoc,
          delegate_phone: delPhone,
          notes: notes
        });

        if (res && res.success) {
          if (typeof window.showToast === 'function') {
            window.showToast(`✅ ${res.message}`, 'success');
          }
          this.closeCreateModal();
          await this.loadData();
        } else {
          throw new Error(res.error || 'Error creando orden');
        }
      } catch (err) {
        console.error('Error registrando orden:', err);
        if (typeof window.showToast === 'function') {
          window.showToast(err.message || 'Error registrando orden de lote', 'error');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '📝 Registrar Solicitud de Lote';
        }
      }
    },

    /**
     * Abre modal para revisión de RRHH (Stage 2)
     */
    openReviewModal: function(orderId) {
      const order = this.currentOrders.find(o => o.id === orderId);
      if (!order) return;

      this.currentOrderInReview = order;

      const modal = document.getElementById('reviewDepartmentBatchModalBackdrop');
      if (!modal) return;

      document.getElementById('reviewBatchOrderId').value = order.id;
      document.getElementById('reviewBatchOrderNumber').textContent = order.order_number;
      document.getElementById('reviewBatchDeptName').textContent = order.department_name;
      document.getElementById('reviewBatchDelegate').textContent = `${order.delegate_name} (${order.delegate_document_id})`;
      document.getElementById('reviewBatchWorkers').textContent = order.total_beneficiaries;
      document.getElementById('reviewBatchCombos').textContent = order.total_combos;
      document.getElementById('reviewBatchWeight').textContent = order.total_weight_kg ? `${order.total_weight_kg} kg` : '--';
      document.getElementById('reviewBatchNotesInput').value = order.review_notes || '';

      modal.classList.add('active');
    },

    closeReviewModal: function() {
      const modal = document.getElementById('reviewDepartmentBatchModalBackdrop');
      if (modal) modal.classList.remove('active');
      this.currentOrderInReview = null;
    },

    /**
     * Envía la resolución de revisión (Aprobar / Rechazar)
     */
    submitReviewOrder: async function(action) {
      const orderId = document.getElementById('reviewBatchOrderId')?.value;
      const notes = document.getElementById('reviewBatchNotesInput')?.value;

      if (!orderId) return;

      const btnApprove = document.getElementById('btnApproveBatchOrder');
      const btnReject = document.getElementById('btnRejectBatchOrder');

      if (btnApprove) btnApprove.disabled = true;
      if (btnReject) btnReject.disabled = true;

      try {
        const res = await API.post(`/api/v1/department-batches/orders/${orderId}/review`, {
          action: action,
          review_notes: notes
        });

        if (res && res.success) {
          if (typeof window.showToast === 'function') {
            window.showToast(`⚖️ ${res.message}`, 'success');
          }
          this.closeReviewModal();
          await this.loadData();
        } else {
          throw new Error(res.error || 'Error procesando revisión');
        }
      } catch (err) {
        console.error('Error revisando orden:', err);
        if (typeof window.showToast === 'function') {
          window.showToast(err.message || 'Error en revisión de orden', 'error');
        }
      } finally {
        if (btnApprove) btnApprove.disabled = false;
        if (btnReject) btnReject.disabled = false;
      }
    },

    /**
     * Abre modal de despacho físico en almacén (Stage 3)
     */
    openDispatchModal: function(orderId) {
      const order = this.currentOrders.find(o => o.id === orderId);
      if (!order) return;

      this.currentOrderInDispatch = order;

      const modal = document.getElementById('dispatchDepartmentBatchModalBackdrop');
      if (!modal) return;

      document.getElementById('dispatchBatchOrderId').value = order.id;
      document.getElementById('dispatchBatchOrderNumber').textContent = order.order_number;
      document.getElementById('dispatchBatchDeptName').textContent = order.department_name;
      document.getElementById('dispatchBatchDelegate').textContent = `${order.delegate_name} (${order.delegate_document_id})`;
      document.getElementById('dispatchBatchCombosCount').textContent = `${order.total_combos} Combos`;
      document.getElementById('dispatchBatchGrossWeight').textContent = order.total_weight_kg ? `${order.total_weight_kg} kg` : '--';
      document.getElementById('dispatchBatchTokenInput').value = order.delegate_claim_token || 'TOKEN-REQUERIDO';

      modal.classList.add('active');
    },

    closeDispatchModal: function() {
      const modal = document.getElementById('dispatchDepartmentBatchModalBackdrop');
      if (modal) modal.classList.remove('active');
      this.currentOrderInDispatch = null;
    },

    /**
     * Ejecuta el despacho atómico en almacén
     */
    submitDispatchOrder: async function() {
      const orderId = document.getElementById('dispatchBatchOrderId')?.value;
      const token = document.getElementById('dispatchBatchTokenInput')?.value;

      if (!orderId) return;

      const btn = document.getElementById('btnConfirmBatchDispatch');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Ejecutando Despacho...';
      }

      try {
        const res = await API.post(`/api/v1/department-batches/orders/${orderId}/dispatch`, {
          delegate_token: token
        });

        if (res && res.success) {
          if (typeof window.showToast === 'function') {
            window.showToast(`🎉 ${res.message}`, 'success');
          }
          if (window.AudioCore && typeof window.AudioCore.play === 'function') {
            window.AudioCore.play('success');
          }

          this.closeDispatchModal();
          await this.loadData();

          // Actualizar contadores en vivo del panel de despacho manual y KPIs globales
          if (window.ManualDispatch && typeof window.ManualDispatch.loadTodaySummary === 'function') {
            window.ManualDispatch.loadTodaySummary().catch(() => {});
          }
          if (typeof window.loadManualDispatchStats === 'function') {
            window.loadManualDispatchStats().catch(() => {});
          }
          if (typeof window.refreshPortalData === 'function') {
            window.refreshPortalData().catch(() => {});
          }

          // Abrir automáticamente el acta digital oficial
          setTimeout(() => {
            this.viewActa(orderId);
          }, 400);
        } else {
          throw new Error(res.error || 'Error despachando lote');
        }
      } catch (err) {
        console.error('Error despachando orden:', err);
        if (typeof window.showToast === 'function') {
          window.showToast(err.message || 'Error despachando lote en almacén', 'error');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '🚀 Ejecutar Despacho Masivo en Almacén';
        }
      }
    },

    /**
     * Consulta y despliega el Acta Digital Oficial con firma SHA-256
     */
    viewActa: async function(orderId) {
      try {
        const res = await API.get(`/api/v1/department-batches/orders/${orderId}/acta`);
        if (!res || !res.success || !res.acta) {
          throw new Error(res?.error || 'Acta no disponible');
        }

        const a = res.acta;
        const modal = document.getElementById('departmentBatchActaModalBackdrop');
        if (!modal) return;

        document.getElementById('actaOrderNumber').textContent = a.order_number;
        document.getElementById('actaDeptName').textContent = a.department_name;
        document.getElementById('actaDeptCode').textContent = a.department_code || 'S/C';
        document.getElementById('actaCostCenter').textContent = a.cost_center || '00-00-00';
        document.getElementById('actaDelegateName').textContent = a.delegate.name;
        document.getElementById('actaDelegateDoc').textContent = a.delegate.document_id;
        document.getElementById('actaDelegatePhone').textContent = a.delegate.phone || 'N/A';

        document.getElementById('actaTotalBeneficiaries').textContent = a.metrics.total_beneficiaries;
        document.getElementById('actaTotalCombos').textContent = a.metrics.total_combos;
        document.getElementById('actaTotalWeight').textContent = `${a.metrics.total_weight_kg || 0} kg`;

        document.getElementById('actaSignRequested').textContent = a.signatories.requested_by;
        document.getElementById('actaSignReviewed').textContent = a.signatories.reviewed_by;
        document.getElementById('actaSignDispatched').textContent = a.signatories.dispatched_by;

        const hash = a.digital_acta_hash || 'SHA256-PENDING';
        document.getElementById('actaHashLabel').textContent = hash;
        document.getElementById('actaDateStamp').textContent = a.dates.dispatched_at ? new Date(a.dates.dispatched_at).toLocaleString('es-VE') : new Date().toLocaleString('es-VE');

        // Muestra nominal de funcionarios
        const sampleTbody = document.getElementById('actaBeneficiariesSampleBody');
        if (sampleTbody) {
          if (a.beneficiaries_sample && a.beneficiaries_sample.length > 0) {
            sampleTbody.innerHTML = a.beneficiaries_sample.map(w => `
              <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
                <td style="padding: 0.3rem 0.5rem; font-family: monospace; color: #38bdf8;">${w.document_id}</td>
                <td style="padding: 0.3rem 0.5rem; color: #f8fafc;">${window.escapeHtml(w.full_name)}</td>
                <td style="padding: 0.3rem 0.5rem; color: #94a3b8;">${window.escapeHtml(w.job_title || 'Titular')}</td>
                <td style="padding: 0.3rem 0.5rem; color: #34d399;">${window.escapeHtml(w.combo_name || 'Combo')}</td>
              </tr>
            `).join('');
          } else {
            sampleTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 0.75rem; color: #94a3b8;">Muestra nominal consolidada registrada en base de datos.</td></tr>';
          }
        }

        // Generar QR de Validación Criptográfica del Acta (usando QRCodeGenerator / node-qrcode)
        const qrContainer = document.getElementById('actaQrTarget');
        if (qrContainer) {
          qrContainer.innerHTML = '';
          const qrText = `MIPPCI-ACTA:${a.order_number}:HASH:${hash.slice(0, 16)}`;
          try {
            if (window.QRCodeGenerator && typeof window.QRCodeGenerator.render === 'function') {
              window.QRCodeGenerator.render('actaQrTarget', qrText, { size: 72 });
            } else if (typeof QRCode !== 'undefined' && typeof QRCode.toCanvas === 'function') {
              const canvas = document.createElement('canvas');
              qrContainer.appendChild(canvas);
              QRCode.toCanvas(canvas, qrText, { width: 72, margin: 1 });
            }
          } catch (qrErr) {
            console.warn('[ACTA QR WARN]', qrErr.message);
          }
        }

        modal.classList.add('active');
      } catch (err) {
        console.error('Error visualizando acta:', err);
        if (typeof window.showToast === 'function') {
          window.showToast(err.message || 'Error obteniendo acta de lote', 'error');
        }
      }
    },

    closeActaModal: function() {
      const modal = document.getElementById('departmentBatchActaModalBackdrop');
      if (modal) modal.classList.remove('active');
    },

    /**
     * Editar Delegado Receptor de una orden
     */
    editDelegate: async function(orderId) {
      const order = this.currentOrders.find(o => o.id === orderId);
      if (!order) return;
      const name = window.prompt('Nombre del Delegado Receptor:', order.delegate_name || '');
      if (name === null) return;
      const doc = window.prompt('Cédula del Delegado Receptor:', order.delegate_document_id || '');
      if (doc === null) return;
      const phone = window.prompt('Teléfono del Delegado Receptor:', order.delegate_phone || '');
      if (phone === null) return;
      try {
        const res = await API.patch(`/api/v1/department-batches/orders/${orderId}`, {
          delegate_name: name,
          delegate_document_id: doc,
          delegate_phone: phone
        });
        if (res && res.success) {
          if (typeof window.showToast === 'function') window.showToast(res.message, 'success');
          await this.loadData();
        } else {
          throw new Error(res.error || 'Error actualizando');
        }
      } catch (err) {
        if (typeof window.showToast === 'function') window.showToast(err.message || 'Error actualizando orden', 'error');
      }
    },

    /**
     * Eliminar una orden de lote
     */
    deleteOrder: async function(orderId) {
      const order = this.currentOrders.find(o => o.id === orderId);
      if (!order) return;
      if (!window.confirm(`¿Eliminar la orden ${order.order_number}? Esta acción no se puede deshacer.`)) return;
      try {
        const res = await API.delete(`/api/v1/department-batches/orders/${orderId}`);
        if (res && res.success) {
          if (typeof window.showToast === 'function') window.showToast(res.message, 'success');
          await this.loadData();
        } else {
          throw new Error(res.error || 'Error eliminando');
        }
      } catch (err) {
        if (typeof window.showToast === 'function') window.showToast(err.message || 'Error eliminando orden', 'error');
      }
    },

    /**
     * Imprime el acta oficial
     */
    printActa: function() {
      window.print();
    }
  };

  window.DepartmentBatches = DepartmentBatches;

  // Auto-inicialización al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DepartmentBatches.init());
  } else {
    DepartmentBatches.init();
  }

})(window);
