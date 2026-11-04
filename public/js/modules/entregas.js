// public/js/modules/entregas.js
// Controlador Frontend para la Pantalla Completa de Registro de Despachos en Vivo (/entregas)

(function () {
  'use strict';

  // Estado reactivo del módulo
  const state = {
    page: 1,
    limit: 50,
    date: 'today',
    customDate: '',
    search: '',
    method: 'all',
    pointId: 'all',
    operatorId: 'all',
    autoRefreshMs: 30000,
    timerId: null,
    isLoading: false,
    filterDebounceTimer: null
  };

  // Referencias al DOM
  const dom = {
    inputSearch: document.getElementById('inputSearch'),
    selectDate: document.getElementById('selectDate'),
    groupCustomDate: document.getElementById('groupCustomDate'),
    inputCustomDate: document.getElementById('inputCustomDate'),
    selectPoint: document.getElementById('selectPoint'),
    selectOperator: document.getElementById('selectOperator'),
    selectMethod: document.getElementById('selectMethod'),
    selectLimit: document.getElementById('selectLimit'),
    selectAutoRefresh: document.getElementById('selectAutoRefresh'),
    btnRefresh: document.getElementById('btnRefresh'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    btnExportCsv: document.getElementById('btnExportCsv'),
    btnPrintReport: document.getElementById('btnPrintReport'),
    btnToggleTheme: document.getElementById('btnToggleTheme'),
    themeIcon: document.getElementById('themeIcon'),
    tableBody: document.getElementById('tableBodyDeliveries'),
    badgeRecordsCount: document.getElementById('badgeRecordsCount'),
    tableStatusFeedback: document.getElementById('tableStatusFeedback'),
    paginationInfo: document.getElementById('paginationInfo'),
    paginationControls: document.getElementById('paginationControls'),
    kpiTotalDelivered: document.getElementById('kpiTotalDelivered'),
    kpiTotalDeliveredSub: document.getElementById('kpiTotalDeliveredSub'),
    kpiUniqueBeneficiaries: document.getElementById('kpiUniqueBeneficiaries'),
    kpiUniqueBeneficiariesSub: document.getElementById('kpiUniqueBeneficiariesSub'),
    kpiCoveragePct: document.getElementById('kpiCoveragePct'),
    kpiCoverageSub: document.getElementById('kpiCoverageSub'),
    kpiPasskeyAdoption: document.getElementById('kpiPasskeyAdoption'),
    kpiPasskeyAdoptionSub: document.getElementById('kpiPasskeyAdoptionSub'),
    printGeneratedTimestamp: document.getElementById('printGeneratedTimestamp'),
    liveStatusText: document.getElementById('liveStatusText')
  };

  // Inicialización
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initTheme();
    bindEvents();
    loadDeliveries();
    setupAutoRefresh();
  }

  // Configuración del Tema Claro / Oscuro
  function initTheme() {
    const savedTheme = localStorage.getItem('sgbt_theme') || 'dark';
    applyTheme(savedTheme);

    if (dom.btnToggleTheme) {
      dom.btnToggleTheme.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        localStorage.setItem('sgbt_theme', nextTheme);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (dom.themeIcon) {
      dom.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  // Enlace de Eventos del DOM
  function bindEvents() {
    // Búsqueda con debounce
    if (dom.inputSearch) {
      dom.inputSearch.addEventListener('input', () => {
        clearTimeout(state.filterDebounceTimer);
        state.filterDebounceTimer = setTimeout(() => {
          state.search = dom.inputSearch.value.trim();
          state.page = 1;
          loadDeliveries();
        }, 220);
      });
    }

    // Filtro de Fecha
    if (dom.selectDate) {
      dom.selectDate.addEventListener('change', () => {
        const val = dom.selectDate.value;
        if (val === 'custom') {
          dom.groupCustomDate.style.display = 'flex';
          state.date = dom.inputCustomDate.value || 'today';
        } else {
          dom.groupCustomDate.style.display = 'none';
          state.date = val;
        }
        state.page = 1;
        loadDeliveries();
      });
    }

    // Input de Fecha Específica
    if (dom.inputCustomDate) {
      dom.inputCustomDate.addEventListener('change', () => {
        if (dom.inputCustomDate.value) {
          state.date = dom.inputCustomDate.value;
          state.page = 1;
          loadDeliveries();
        }
      });
    }

    // Filtros de Punto, Operador y Método
    if (dom.selectPoint) {
      dom.selectPoint.addEventListener('change', () => {
        state.pointId = dom.selectPoint.value;
        state.page = 1;
        loadDeliveries();
      });
    }

    if (dom.selectOperator) {
      dom.selectOperator.addEventListener('change', () => {
        state.operatorId = dom.selectOperator.value;
        state.page = 1;
        loadDeliveries();
      });
    }

    if (dom.selectMethod) {
      dom.selectMethod.addEventListener('change', () => {
        state.method = dom.selectMethod.value;
        state.page = 1;
        loadDeliveries();
      });
    }

    // Selector de Registros por Página
    if (dom.selectLimit) {
      dom.selectLimit.addEventListener('change', () => {
        state.limit = parseInt(dom.selectLimit.value, 10) || 50;
        state.page = 1;
        loadDeliveries();
      });
    }

    // Selector de Auto-Refresco
    if (dom.selectAutoRefresh) {
      dom.selectAutoRefresh.addEventListener('change', () => {
        state.autoRefreshMs = parseInt(dom.selectAutoRefresh.value, 10) || 0;
        setupAutoRefresh();
      });
    }

    // Botón Refrescar
    if (dom.btnRefresh) {
      dom.btnRefresh.addEventListener('click', () => {
        loadDeliveries();
      });
    }

    // Botón Limpiar Filtros
    if (dom.btnResetFilters) {
      dom.btnResetFilters.addEventListener('click', resetFilters);
    }

    // Botón Exportar CSV
    if (dom.btnExportCsv) {
      dom.btnExportCsv.addEventListener('click', exportCsv);
    }

    // Botón Imprimir
    if (dom.btnPrintReport) {
      dom.btnPrintReport.addEventListener('click', printReport);
    }
  }

  // Restablecer filtros
  function resetFilters() {
    state.page = 1;
    state.search = '';
    state.date = 'today';
    state.customDate = '';
    state.method = 'all';
    state.pointId = 'all';
    state.operatorId = 'all';

    if (dom.inputSearch) dom.inputSearch.value = '';
    if (dom.selectDate) dom.selectDate.value = 'today';
    if (dom.groupCustomDate) dom.groupCustomDate.style.display = 'none';
    if (dom.inputCustomDate) dom.inputCustomDate.value = '';
    if (dom.selectPoint) dom.selectPoint.value = 'all';
    if (dom.selectOperator) dom.selectOperator.value = 'all';
    if (dom.selectMethod) dom.selectMethod.value = 'all';

    loadDeliveries();
  }

  // Configuración del Timer de Auto-Refresco
  function setupAutoRefresh() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }

    if (state.autoRefreshMs > 0) {
      if (dom.liveStatusText) dom.liveStatusText.textContent = 'EN VIVO';
      state.timerId = setInterval(() => {
        // Solo refrescar si la pestaña está activa y visible
        if (!document.hidden && !state.isLoading) {
          loadDeliveries(true);
        }
      }, state.autoRefreshMs);
    } else {
      if (dom.liveStatusText) dom.liveStatusText.textContent = 'PAUSADO';
    }
  }

  // Carga de Datos desde la API
  async function loadDeliveries(isBackground = false) {
    if (state.isLoading) return;
    state.isLoading = true;

    if (!isBackground) {
      showLoadingFeedback();
    }

    try {
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        date: state.date,
        search: state.search,
        method: state.method,
        point_id: state.pointId,
        operator_id: state.operatorId,
        _t: Date.now()
      });

      const res = await window.API.get(`/api/v1/deliveries/report?${params.toString()}`);

      if (res && res.success) {
        updateKpis(res.stats, res.current_date_vzla);
        updateFilterOptions(res.filter_options);
        renderTable(res.deliveries);
        renderPagination(res.pagination);

        if (dom.tableStatusFeedback) {
          const nowStr = new Intl.DateTimeFormat('es-VE', {
            timeZone: 'America/Caracas',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          }).format(new Date());
          dom.tableStatusFeedback.textContent = `Actualizado a las ${nowStr} (Caracas) • En sincronía cloud`;
        }
      } else {
        renderErrorState(res?.error || 'No se pudieron recuperar los registros de despacho.');
      }
    } catch (err) {
      console.warn('[ENTREGAS LOAD ERROR]', err);
      renderErrorState(err.message || 'Error de conexión con el servidor.');
    } finally {
      state.isLoading = false;
    }
  }

  // Actualizar Tarjetas de Métricas (KPIs)
  function updateKpis(stats, currentDateVzla) {
    if (!stats) return;

    if (dom.kpiTotalDelivered) {
      dom.kpiTotalDelivered.textContent = stats.total_delivered.toLocaleString();
    }
    if (dom.kpiTotalDeliveredSub) {
      dom.kpiTotalDeliveredSub.textContent = `Bultos despachados (${state.date === 'today' ? 'Jornada de Hoy' : 'Filtrado'})`;
    }

    if (dom.kpiUniqueBeneficiaries) {
      dom.kpiUniqueBeneficiaries.textContent = stats.unique_beneficiaries.toLocaleString();
    }
    if (dom.kpiUniqueBeneficiariesSub) {
      dom.kpiUniqueBeneficiariesSub.textContent = `De ${stats.total_active_workers.toLocaleString()} en padrón ministerial`;
    }

    if (dom.kpiCoveragePct) {
      dom.kpiCoveragePct.textContent = `${stats.coverage_pct}%`;
    }
    if (dom.kpiCoverageSub) {
      dom.kpiCoverageSub.textContent = `Meta: ${stats.total_assigned_combos.toLocaleString()} combos asignados`;
    }

    if (dom.kpiPasskeyAdoption) {
      const passkeyCount = (stats.methods?.passkey_qr || 0) + (stats.methods?.passkey_nfc || 0);
      const totalDel = stats.total_delivered || 1;
      const pct = stats.total_delivered > 0 ? ((passkeyCount / totalDel) * 100).toFixed(1) : 0;
      dom.kpiPasskeyAdoption.textContent = `${pct}%`;
    }
    if (dom.kpiPasskeyAdoptionSub) {
      const qr = stats.methods?.passkey_qr || 0;
      const nfc = stats.methods?.passkey_nfc || 0;
      dom.kpiPasskeyAdoptionSub.textContent = `${qr} QR • ${nfc} NFC • ${stats.methods?.supervisor_override || 0} Excepciones`;
    }
  }

  // Llenar opciones de filtros dinámicamente si no están ya seleccionados
  function updateFilterOptions(options) {
    if (!options) return;

    // Mesas / Puntos
    if (dom.selectPoint && options.points && dom.selectPoint.options.length <= 1) {
      const currentVal = dom.selectPoint.value;
      dom.selectPoint.innerHTML = '<option value="all">Todas las Mesas</option>';
      options.points.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        dom.selectPoint.appendChild(opt);
      });
      dom.selectPoint.value = currentVal;
    }

    // Operadores
    if (dom.selectOperator && options.operators && dom.selectOperator.options.length <= 1) {
      const currentVal = dom.selectOperator.value;
      dom.selectOperator.innerHTML = '<option value="all">Todos los Operadores</option>';
      options.operators.forEach(op => {
        const opt = document.createElement('option');
        opt.value = op.id;
        opt.textContent = op.full_name;
        dom.selectOperator.appendChild(opt);
      });
      dom.selectOperator.value = currentVal;
    }
  }

  // Renderizar Tabla de Entregas
  function renderTable(deliveries) {
    if (!dom.tableBody) return;

    if (!deliveries || deliveries.length === 0) {
      dom.tableBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state">
              <div class="empty-icon">📭</div>
              <div class="empty-title">Sin registros para el criterio seleccionado</div>
              <div class="empty-desc">No se encontraron entregas con los filtros actuales de fecha, mesa o búsqueda.</div>
              <button type="button" class="btn-nav" style="margin-top: 0.5rem;" onclick="window.resetEntregasFilters()">
                <span>🧹 Restablecer Filtros</span>
              </button>
            </div>
          </td>
        </tr>
      `;
      if (dom.badgeRecordsCount) dom.badgeRecordsCount.textContent = '0 registros';
      return;
    }

    if (dom.badgeRecordsCount) {
      dom.badgeRecordsCount.textContent = `${deliveries.length} de esta página`;
    }

    const htmlRows = deliveries.map(d => {
      // Método badge
      let methodClass = 'passkey-qr';
      let methodIcon = '🛡️';
      let methodLabel = 'Passkey QR';

      if (d.verification_method === 'passkey_nfc') {
        methodClass = 'passkey-nfc';
        methodIcon = '📱';
        methodLabel = 'Passkey NFC';
      } else if (d.verification_method === 'supervisor_override') {
        methodClass = 'supervisor';
        methodIcon = '⚠️';
        methodLabel = 'Autorización Manual';
      }

      return `
        <tr>
          <td style="text-align: center; color: var(--text-dim); font-weight: 700;">${d.row_number}</td>
          <td style="white-space: nowrap;">
            <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(d.time_formatted || '--')}</div>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${escapeHtml(d.date_formatted || '')}</div>
          </td>
          <td>
            <span class="cedula-badge">${escapeHtml(d.document_id)}</span>
          </td>
          <td>
            <div class="beneficiary-cell">
              <span class="beneficiary-name">${escapeHtml(d.full_name)}</span>
              <span class="beneficiary-dept">${escapeHtml(d.job_title || 'Funcionario')}</span>
            </div>
          </td>
          <td>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(d.department_name)}</span>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <span>${d.combo_icon || '📦'}</span>
              <span style="font-weight: 600;">${escapeHtml(d.combo_name)}</span>
            </div>
          </td>
          <td>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(d.distribution_point_name)}</span>
          </td>
          <td>
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-main);">${escapeHtml(d.operator_name)}</span>
          </td>
          <td>
            <span class="method-badge ${methodClass}" title="${escapeHtml(d.override_reason || 'Verificación Criptográfica Exitosa')}">
              <span>${methodIcon}</span>
              <span>${methodLabel}</span>
            </span>
          </td>
        </tr>
      `;
    }).join('');

    dom.tableBody.innerHTML = htmlRows;
  }

  // Renderizar Controles de Paginación
  function renderPagination(pagination) {
    if (!dom.paginationControls || !pagination) return;

    const { page, total_pages, total_records, limit } = pagination;
    const startRecord = total_records > 0 ? (page - 1) * limit + 1 : 0;
    const endRecord = Math.min(page * limit, total_records);

    if (dom.paginationInfo) {
      dom.paginationInfo.textContent = `Mostrando ${startRecord.toLocaleString()} a ${endRecord.toLocaleString()} de ${total_records.toLocaleString()} entregas`;
    }

    if (total_pages <= 1) {
      dom.paginationControls.innerHTML = '';
      return;
    }

    let buttonsHtml = '';

    // Botón Anterior
    buttonsHtml += `
      <button type="button" class="btn-page" ${page === 1 ? 'disabled' : ''} onclick="window.changeEntregasPage(${page - 1})">
        « Anterior
      </button>
    `;

    // Ventana inteligente de páginas (máximo 7 botones)
    const windowSize = 2;
    let startPage = Math.max(1, page - windowSize);
    let endPage = Math.min(total_pages, page + windowSize);

    if (startPage > 1) {
      buttonsHtml += `<button type="button" class="btn-page" onclick="window.changeEntregasPage(1)">1</button>`;
      if (startPage > 2) {
        buttonsHtml += `<span style="padding: 0 0.3rem; color: var(--text-dim);">...</span>`;
      }
    }

    for (let p = startPage; p <= endPage; p++) {
      buttonsHtml += `
        <button type="button" class="btn-page ${p === page ? 'active' : ''}" onclick="window.changeEntregasPage(${p})">
          ${p}
        </button>
      `;
    }

    if (endPage < total_pages) {
      if (endPage < total_pages - 1) {
        buttonsHtml += `<span style="padding: 0 0.3rem; color: var(--text-dim);">...</span>`;
      }
      buttonsHtml += `<button type="button" class="btn-page" onclick="window.changeEntregasPage(${total_pages})">${total_pages}</button>`;
    }

    // Botón Siguiente
    buttonsHtml += `
      <button type="button" class="btn-page" ${page === total_pages ? 'disabled' : ''} onclick="window.changeEntregasPage(${page + 1})">
        Siguiente »
      </button>
    `;

    dom.paginationControls.innerHTML = buttonsHtml;
  }

  // Feedback Visual de Carga
  function showLoadingFeedback() {
    if (dom.tableBody) {
      dom.tableBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state">
              <div class="empty-icon">⏳</div>
              <div class="empty-title">Actualizando entregas en vivo...</div>
              <div class="empty-desc">Consultando registros y balanceo de mesas.</div>
            </div>
          </td>
        </tr>
      `;
    }
  }

  // Estado de Error
  function renderErrorState(message) {
    if (dom.tableBody) {
      dom.tableBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state">
              <div class="empty-icon">⚠️</div>
              <div class="empty-title">Error al consultar entregas</div>
              <div class="empty-desc">${escapeHtml(message)}</div>
              <button type="button" class="btn-nav" style="margin-top: 0.5rem;" onclick="window.refreshEntregas()">
                <span>🔄 Reintentar</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }
  }

  // Exportar a CSV / Excel
  function exportCsv() {
    const params = new URLSearchParams({
      date: state.date,
      search: state.search,
      method: state.method,
      point_id: state.pointId,
      operator_id: state.operatorId,
      _t: Date.now()
    });

    const exportUrl = `/api/v1/deliveries/export-csv?${params.toString()}`;
    window.location.href = exportUrl;
  }

  // Imprimir / Generar PDF
  function printReport() {
    if (dom.printGeneratedTimestamp) {
      const nowStr = new Intl.DateTimeFormat('es-VE', {
        timeZone: 'America/Caracas',
        dateStyle: 'full',
        timeStyle: 'medium'
      }).format(new Date());
      dom.printGeneratedTimestamp.textContent = `Emisión oficial generada el: ${nowStr} (Hora de Caracas)`;
    }
    window.print();
  }

  // Utilidad de escape contra XSS
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Exposición global para callbacks en línea del HTML
  window.changeEntregasPage = function (newPage) {
    state.page = newPage;
    loadDeliveries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.resetEntregasFilters = function () {
    resetFilters();
  };

  window.refreshEntregas = function () {
    loadDeliveries();
  };

})();
