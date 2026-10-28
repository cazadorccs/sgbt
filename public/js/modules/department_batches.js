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
    combos: [],
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
      if (createForm) {
        createForm.addEventListener('submit', (e) => this.submitCreateOrder(e));
      }

      const deptSelect = document.getElementById('createBatchDeptSelect');
      if (deptSelect) {
        deptSelect.addEventListener('change', () => this.updateCreateProjection());
      }
      const comboSelect = document.getElementById('createBatchComboSelect');
      if (comboSelect) {
        comboSelect.addEventListener('change', () => this.updateCreateProjection());
      }

      // 5. Modal Revisión RRHH
      const btnCloseReview = document.getElementById('btnCloseReviewBatchModal');
      if (btnCloseReview) btnCloseReview.addEventListener('click', () => this.closeReviewModal());

      const btnApprove = document.getElementById('btnApproveBatchOrder');
      if (btnApprove) {
        btnApprove.addEventListener('click', () => this.submitReviewOrder('approve'));
      }
      const btnReject = document.getElementById('btnRejectBatchOrder');
      if (btnReject) {
        btnReject.addEventListener('click', () => this.submitReviewOrder('reject'));
      }

      // 6. Modal Despacho en Almacén
      const btnCloseDispatch = document.getElementById('btnCloseDispatchBatchModal');
      const btnCancelDispatch = document.getElementById('btnCancelDispatchBatchModal');
      if (btnCloseDispatch) btnCloseDispatch.addEventListener('click', () => this.closeDispatchModal());
      if (btnCancelDispatch) btnCancelDispatch.addEventListener('click', () => this.closeDispatchModal());

      const btnConfirmDispatch = document.getElementById('btnConfirmBatchDispatch');
      if (btnConfirmDispatch) {
        btnConfirmDispatch.addEventListener('click', () => this.submitDispatchOrder());
      }

      // 7. Modal Acta Digital Oficial
      const btnCloseActa = document.getElementById('btnCloseBatchActaModal');
      const btnCloseActaBtn = document.getElementById('btnCloseBatchActaModalBtn');
      if (btnCloseActa) btnCloseActa.addEventListener('click', () => this.closeActaModal());
      if (btnCloseActaBtn) btnCloseActaBtn.addEventListener('click', () => this.closeActaModal());

      const btnPrintActa = document.getElementById('btnPrintBatchActa');
      if (btnPrintActa) {
        btnPrintActa.addEventListener('click', () => this.printActa());
      }
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
        if (res && res.success && res.departments) {
          this.departments = res.departments;
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
          `;
        } else if (order.status === 'approved') {
          actionsHtml = `
            <button class="btn btn-primary" onclick="window.DepartmentBatches.openDispatchModal('${order.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; background: linear-gradient(135deg, #059669, #047857); border-color: #34d399;" title="Ejecutar Despacho en Almacén">
              📦 Despachar
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

      // Cargar lista de dependencias si aún no se tiene
      if (this.departments.length === 0) {
        await this.loadDepartments();
      }

      const deptSelect = document.getElementById('createBatchDeptSelect');
      if (deptSelect) {
        deptSelect.innerHTML = '<option value="">Seleccione una Dependencia...</option>' +
          this.departments.map(d => `<option value="${d.id}">${window.escapeHtml(d.name)} (${d.total_workers} funcionarios)</option>`).join('');
      }

      // Cargar combos
      const comboSelect = document.getElementById('createBatchComboSelect');
      if (comboSelect) {
        comboSelect.innerHTML = '<option value="">Todos los Combos Activos de la Jornada</option>' +
          this.combos.map(c => `<option value="${c.id}">${c.icon || '📦'} ${window.escapeHtml(c.name)} (${c.weight_kg || 14} kg)</option>`).join('');
      }

      // Resetear campos
      document.getElementById('createBatchDelegateName').value = '';
      document.getElementById('createBatchDelegateDoc').value = '';
      document.getElementById('createBatchDelegatePhone').value = '';
      document.getElementById('createBatchNotes').value = '';
      document.getElementById('createBatchSummaryBox').style.display = 'none';

      modal.classList.add('active');
    },

    closeCreateModal: function() {
      const modal = document.getElementById('createDepartmentBatchModalBackdrop');
      if (modal) modal.classList.remove('active');
    },

    /**
     * Actualiza proyección en vivo de beneficiarios y combos al seleccionar dependencia
     */
    updateCreateProjection: function() {
      const deptId = document.getElementById('createBatchDeptSelect')?.value;
      const summaryBox = document.getElementById('createBatchSummaryBox');
      if (!deptId) {
        if (summaryBox) summaryBox.style.display = 'none';
        return;
      }

      const dept = this.departments.find(d => d.id === deptId);
      if (!dept) return;

      const workersCount = dept.total_workers || 0;
      const comboId = document.getElementById('createBatchComboSelect')?.value;

      let combosPerWorker = 2; // Víveres + Proteico por defecto
      let avgWeightPerWorker = 28.5;

      if (comboId) {
        const c = this.combos.find(item => item.id === comboId);
        combosPerWorker = 1;
        avgWeightPerWorker = c ? (c.weight_kg || 14) : 14;
      }

      const totalCombos = workersCount * combosPerWorker;
      const totalWeight = Math.round(workersCount * avgWeightPerWorker);

      const elW = document.getElementById('createBatchCalcWorkers');
      const elC = document.getElementById('createBatchCalcCombos');
      const elKg = document.getElementById('createBatchCalcWeight');

      if (elW) elW.textContent = workersCount;
      if (elC) elC.textContent = totalCombos;
      if (elKg) elKg.textContent = `${totalWeight} kg`;

      if (summaryBox) summaryBox.style.display = 'block';
    },

    /**
     * Envía la solicitud de orden de lote al backend (Stage 1)
     */
    submitCreateOrder: async function(e) {
      if (e) e.preventDefault();

      const deptId = document.getElementById('createBatchDeptSelect')?.value;
      const comboId = document.getElementById('createBatchComboSelect')?.value || null;
      const delName = document.getElementById('createBatchDelegateName')?.value;
      const delDoc = document.getElementById('createBatchDelegateDoc')?.value;
      const delPhone = document.getElementById('createBatchDelegatePhone')?.value;
      const notes = document.getElementById('createBatchNotes')?.value;

      if (!deptId || !delName || !delDoc) {
        if (typeof window.showToast === 'function') {
          window.showToast('Por favor complete los campos obligatorios (*)', 'warning');
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
          combo_id: comboId,
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

        // Generar QR de Validación Criptográfica del Acta
        const qrContainer = document.getElementById('actaQrTarget');
        if (qrContainer) {
          qrContainer.innerHTML = '';
          if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
              text: `MIPPCI-ACTA:${a.order_number}:HASH:${hash.slice(0, 16)}`,
              width: 72,
              height: 72,
              colorDark: "#0f172a",
              colorLight: "#ffffff",
              correctLevel: QRCode.CorrectLevel.M
            });
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
