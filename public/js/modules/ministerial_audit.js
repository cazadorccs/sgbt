// public/js/modules/ministerial_audit.js
// ============================================================================
// MÓDULO FRONTEND: MONITOR DE FORMALIZACIÓN PREVIA Y AUDITORÍA MINISTERIAL (FASE 5)
// Fecha Límite Cierre Censo: 12/Nov/2026 | Gran Jornada de Despacho: 27/Nov/2026
// ============================================================================

(function() {
  'use strict';

  const MinisterialAudit = {
    monitorData: null,
    rezagados: [],
    filteredRezagados: [],
    allDepartments: [],
    isCensusLocked: false,

    init() {
      console.log('⚖️ [MinisterialAudit] Inicializando Módulo de Auditoría Ministerial v5.0...');
      this.bindEvents();
    },

    bindEvents() {
      // Subtab click listener
      const tabBtn = document.querySelector('.portal-subtab[data-subtab="subtab-ministerial-audit"]');
      if (tabBtn) {
        tabBtn.addEventListener('click', () => {
          this.loadData();
        });
      }

      // Botón Actualizar Monitor
      const btnRefresh = document.getElementById('btnRefreshMinisterialMonitor');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          this.loadData();
          if (typeof window.showToast === 'function') {
            window.showToast('Monitor ministerial actualizado', 'info');
          }
        });
      }

      // Botón Exportar Rezagados CSV
      const btnExport = document.getElementById('btnExportRezagadosCsv');
      if (btnExport) {
        btnExport.addEventListener('click', () => this.exportRezagados());
      }

      // Botón Congelar / Prórroga Censo
      const btnToggleLock = document.getElementById('btnToggleCensusLock');
      if (btnToggleLock) {
        btnToggleLock.addEventListener('click', () => this.toggleCensusLock());
      }

      // Botón Emitir Acta Ministerial Definitiva
      const btnGenerateActa = document.getElementById('btnGenerateMinisterialActa');
      if (btnGenerateActa) {
        btnGenerateActa.addEventListener('click', () => this.generateActa());
      }

      // Botón Ver Última Acta Emitida
      const btnViewLatest = document.getElementById('btnViewLatestActaHeader');
      if (btnViewLatest) {
        btnViewLatest.addEventListener('click', () => this.viewActa('latest'));
      }

      // Filtro de dependencias en vivo
      const inputFilterDepts = document.getElementById('inputFilterMinisterialDepts');
      if (inputFilterDepts) {
        inputFilterDepts.addEventListener('input', (e) => {
          const query = e.target.value.toLowerCase().trim();
          this.renderDepartments(query);
        });
      }

      // Filtros de tabla de Rezagados
      const inputSearchRezagados = document.getElementById('inputSearchRezagados');
      if (inputSearchRezagados) {
        inputSearchRezagados.addEventListener('input', () => this.applyRezagadosFilter());
      }

      const selectDeptFilter = document.getElementById('selectRezagadosDeptFilter');
      if (selectDeptFilter) {
        selectDeptFilter.addEventListener('change', () => this.applyRezagadosFilter());
      }

      // Cierre del Modal del Acta
      const btnCloseModal = document.getElementById('btnCloseMinisterialActaModal');
      const btnCloseModalBtn = document.getElementById('btnCloseMinisterialActaModalBtn');
      const modalBackdrop = document.getElementById('ministerialActaModalBackdrop');

      if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
          modalBackdrop?.classList.remove('active');
        });
      }

      if (btnCloseModalBtn) {
        btnCloseModalBtn.addEventListener('click', () => {
          modalBackdrop?.classList.remove('active');
        });
      }

      // Botón Imprimir Acta Oficial
      const btnPrint = document.getElementById('btnPrintMinisterialActaModal');
      if (btnPrint) {
        btnPrint.addEventListener('click', () => this.printActa());
      }
    },

    getHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      const token = typeof window.STATE !== 'undefined' && window.STATE.token ? window.STATE.token : localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return headers;
    },

    async loadData() {
      try {
        const headers = this.getHeaders();

        // 1. Cargar Estadísticas y Monitor
        const statsRes = await fetch('/api/v1/audit/ministerial/stats', { headers });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) {
            this.monitorData = statsData.monitor;
            this.isCensusLocked = !!statsData.monitor.census_lock.is_locked;
            this.allDepartments = statsData.monitor.departments || [];
            this.renderStats(statsData.monitor);
            this.renderDepartments();
            this.populateDeptFilterSelect(this.allDepartments);
            this.renderActasHistory(statsData.monitor.latest_acta);
          }
        }

        // 2. Cargar Rezagados
        const rezRes = await fetch('/api/v1/audit/ministerial/rezagados?limit=500', { headers });
        if (rezRes.ok) {
          const rezData = await rezRes.json();
          if (rezData.success) {
            this.rezagados = rezData.rezagados || [];
            this.applyRezagadosFilter();
          }
        }
      } catch (err) {
        console.error('❌ [MinisterialAudit] Error cargando datos:', err);
      }
    },

    renderStats(data) {
      if (!data) return;

      const census = data.census || {};
      const lock = data.census_lock || {};

      // Padrón e Indicadores
      const totalCensusEl = document.getElementById('ministerialTotalCensus');
      if (totalCensusEl) totalCensusEl.textContent = Number(census.total_workers || 0).toLocaleString();

      const formCountEl = document.getElementById('ministerialFormalizedCount');
      if (formCountEl) formCountEl.textContent = Number(census.formalized_count || 0).toLocaleString();

      const formPctEl = document.getElementById('ministerialFormalizedPct');
      if (formPctEl) formPctEl.textContent = `${census.formalization_pct || 0}%`;

      const progressBar = document.getElementById('ministerialFormalizedProgressBar');
      if (progressBar) progressBar.style.width = `${Math.min(100, census.formalization_pct || 0)}%`;

      const rezCountEl = document.getElementById('ministerialRezagadosCount');
      if (rezCountEl) rezCountEl.textContent = Number(census.rezagados_count || 0).toLocaleString();

      const rezPctEl = document.getElementById('ministerialRezagadosPct');
      if (rezPctEl) rezPctEl.textContent = `${census.rezagados_pct || 0}%`;

      const passkeyCountEl = document.getElementById('ministerialPasskeyCount');
      if (passkeyCountEl) passkeyCountEl.textContent = Number(census.passkey_adoption_count || 0).toLocaleString();

      const passkeyPctEl = document.getElementById('ministerialPasskeyPct');
      if (passkeyPctEl) passkeyPctEl.textContent = `${census.passkey_adoption_pct || 0}%`;

      // Estado del Cierre del Padrón
      const badgeTab = document.getElementById('badgeCensusLockStatus');
      const lockBadge = document.getElementById('ministerialLockBadge');
      const lockIcon = document.getElementById('ministerialLockIcon');
      const btnToggleLock = document.getElementById('btnToggleCensusLock');

      if (lock.is_locked) {
        if (badgeTab) {
          badgeTab.textContent = '🔒 Congelado';
          badgeTab.style.background = '#ef4444';
        }
        if (lockBadge) {
          lockBadge.textContent = 'CONGELADO (12/Nov)';
          lockBadge.style.background = '#ef4444';
        }
        if (lockIcon) lockIcon.textContent = '🔒';
        if (btnToggleLock) {
          btnToggleLock.textContent = '🔓 Abrir Prórroga Extraordinaria';
          btnToggleLock.style.color = '#059669';
          btnToggleLock.style.borderColor = '#10b981';
        }
      } else {
        if (badgeTab) {
          badgeTab.textContent = 'Abierto';
          badgeTab.style.background = '#10b981';
        }
        if (lockBadge) {
          lockBadge.textContent = 'ABIERTO (En Censo)';
          lockBadge.style.background = '#10b981';
        }
        if (lockIcon) lockIcon.textContent = '🔓';
        if (btnToggleLock) {
          btnToggleLock.textContent = '🔒 Congelar al 12/Nov';
          btnToggleLock.style.color = '#b91c1c';
          btnToggleLock.style.borderColor = '#ef4444';
        }
      }
    },

    renderDepartments(filterQuery = '') {
      const tbody = document.getElementById('ministerialDeptsTableBody');
      if (!tbody) return;

      let list = this.allDepartments;
      if (filterQuery) {
        list = list.filter(d => 
          (d.name && d.name.toLowerCase().includes(filterQuery)) ||
          (d.code && d.code.toLowerCase().includes(filterQuery)) ||
          (d.cost_center && d.cost_center.toLowerCase().includes(filterQuery))
        );
      }

      if (list.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
              No se encontraron dependencias con el criterio especificado.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = list.map(dept => {
        let lightBadge = '';
        let barColor = '#10b981';

        if (dept.traffic_light === 'red') {
          lightBadge = '<span class="badge" style="background: #fee2e2; color: #dc2626; font-weight: 700;">🔴 Crítico</span>';
          barColor = '#ef4444';
        } else if (dept.traffic_light === 'yellow') {
          lightBadge = '<span class="badge" style="background: #fef3c7; color: #d97706; font-weight: 700;">🟡 Proceso</span>';
          barColor = '#f59e0b';
        } else {
          lightBadge = '<span class="badge" style="background: #d1fae5; color: #059669; font-weight: 700;">🟢 Óptimo</span>';
          barColor = '#10b981';
        }

        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 0.55rem 0.75rem;">${lightBadge}</td>
            <td style="padding: 0.55rem 0.75rem; font-weight: 600; color: #1e293b;">${window.escapeHtml(dept.name)}</td>
            <td style="padding: 0.55rem 0.75rem; color: #64748b;" class="text-mono">${window.escapeHtml(dept.cost_center || dept.code || 'S/C')}</td>
            <td style="padding: 0.55rem 0.75rem; text-align: right; font-weight: 600;">${dept.total_workers || 0}</td>
            <td style="padding: 0.55rem 0.75rem; text-align: right; color: #059669; font-weight: 700;">${dept.formalized_count || 0}</td>
            <td style="padding: 0.55rem 0.75rem; text-align: right; color: #dc2626; font-weight: 700;">${dept.rezagados_count || 0}</td>
            <td style="padding: 0.55rem 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <div style="flex: 1; background: #e2e8f0; height: 7px; border-radius: 9999px; overflow: hidden;">
                  <div style="width: ${Math.min(100, dept.formalization_pct || 0)}%; background: ${barColor}; height: 100%;"></div>
                </div>
                <span style="font-size: 0.72rem; font-weight: 700; min-width: 32px; text-align: right; color: #334155;">
                  ${dept.formalization_pct || 0}%
                </span>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    },

    populateDeptFilterSelect(depts) {
      const select = document.getElementById('selectRezagadosDeptFilter');
      if (!select) return;

      const currentVal = select.value;
      let optionsHtml = '<option value="">Todas las Dependencias</option>';

      depts.forEach(d => {
        optionsHtml += `<option value="${d.id}">${window.escapeHtml(d.name)} (${d.rezagados_count || 0} rezagados)</option>`;
      });

      select.innerHTML = optionsHtml;
      select.value = currentVal;
    },

    applyRezagadosFilter() {
      const searchVal = document.getElementById('inputSearchRezagados')?.value.toLowerCase().trim() || '';
      const deptFilter = document.getElementById('selectRezagadosDeptFilter')?.value || '';

      this.filteredRezagados = this.rezagados.filter(w => {
        const docId = (w.document_id || w.cedula || '').toLowerCase();
        const name = (w.full_name || '').toLowerCase();
        const pos = (w.job_title || w.position || '').toLowerCase();

        const matchesSearch = !searchVal || 
          docId.includes(searchVal) ||
          name.includes(searchVal) ||
          pos.includes(searchVal);

        const matchesDept = !deptFilter || String(w.department_id) === String(deptFilter);

        return matchesSearch && matchesDept;
      });

      const countEl = document.getElementById('rezagadosFilteredCount');
      if (countEl) {
        countEl.textContent = `${this.filteredRezagados.length} rezagados encontrados`;
      }

      this.renderRezagadosTable();
    },

    renderRezagadosTable() {
      const tbody = document.getElementById('rezagadosTableBody');
      if (!tbody) return;

      if (this.filteredRezagados.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
              No se encontraron funcionarios rezagados con los filtros aplicados.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.filteredRezagados.slice(0, 100).map(w => {
        const docId = w.document_id || w.cedula || '--';
        const job = w.job_title || w.position || 'Funcionario';
        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 0.5rem 0.75rem; font-weight: 700; color: #0284c7;" class="text-mono">
              ${window.escapeHtml(docId)}
            </td>
            <td style="padding: 0.5rem 0.75rem; font-weight: 600; color: #1e293b;">
              ${window.escapeHtml(w.full_name)}
            </td>
            <td style="padding: 0.5rem 0.75rem; color: #475569; font-size: 0.74rem;">
              ${window.escapeHtml(w.department_name || 'Sin Asignar')}
            </td>
            <td style="padding: 0.5rem 0.75rem; color: #64748b; font-size: 0.74rem;">
              ${window.escapeHtml(job)}
            </td>
            <td style="padding: 0.5rem 0.75rem; font-size: 0.74rem; color: #059669; font-weight: 600;">
              ${window.escapeHtml(w.combo_name || 'Estándar')}
            </td>
            <td style="padding: 0.5rem 0.75rem; text-align: center;">
              <span class="badge" style="background: #fef3c7; color: #b45309; font-size: 0.68rem; font-weight: 700;">
                ⏳ Precargado
              </span>
            </td>
            <td style="padding: 0.5rem 0.75rem; text-align: center;">
              <button class="btn btn-outline" onclick="window.MinisterialAudit.openRezagadoNotice('${docId}', '${window.escapeHtml(w.full_name)}', '${window.escapeHtml(w.department_name || '')}')" style="padding: 0.2rem 0.5rem; font-size: 0.68rem; border-color: #f59e0b; color: #d97706;" title="Generar Citación RRHH">
                📢 Notificar
              </button>
            </td>
          </tr>
        `;
      }).join('');
    },

    openRezagadoNotice(cedula, name, dept) {
      const noticeText = `Estimado(a) ${name} (C.I. ${cedula}), de la unidad ${dept}:\n\nSe le convoca formalmente con carácter de URGENCIA a completar su proceso de registro biométrico (Selfie + Clave de Acceso) en la plataforma institucional del MIPPCI antes del Cierre Definitivo del 12 de Noviembre de 2026, requisito indispensable para el retiro de su beneficio alimentario en la Gran Jornada Nacional del 27 de Noviembre de 2026.`;
      
      if (navigator.clipboard) {
        navigator.clipboard.writeText(noticeText).then(() => {
          if (typeof window.showToast === 'function') {
            window.showToast(`Convocatoria formal copiada al portapapeles para ${name}`, 'success');
          } else {
            alert(noticeText);
          }
        }).catch(() => {
          alert(noticeText);
        });
      } else {
        alert(noticeText);
      }
    },

    async exportRezagados() {
      try {
        const headers = this.getHeaders();
        const res = await fetch('/api/v1/audit/ministerial/rezagados/export', { headers });
        if (!res.ok) {
          throw new Error('Error al generar archivo CSV de rezagados.');
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rezagados_censo_mippci_cierre_12nov_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        if (typeof window.showToast === 'function') {
          window.showToast('Archivo CSV de Rezagados descargado con éxito.', 'success');
        }
      } catch (err) {
        console.error('❌ Error exportando CSV:', err);
        if (typeof window.showToast === 'function') {
          window.showToast(err.message, 'error');
        }
      }
    },

    async toggleCensusLock() {
      const isLocked = this.isCensusLocked;
      const confirmAction = confirm(
        isLocked 
          ? '¿Desea LEVANTAR el congelamiento del padrón y habilitar una prórroga extraordinaria de auto-formalización biométrica?'
          : '¿Desea CONGELAR el padrón institucional al 12/Nov/2026? A partir de este momento se bloquearán nuevas formalizaciones móviles (HTTP 423 Locked).'
      );

      if (!confirmAction) return;

      try {
        const headers = this.getHeaders();
        const res = await fetch('/api/v1/audit/ministerial/census-lock', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            lock: !isLocked,
            reason: isLocked ? 'Apertura de prórroga extraordinaria por RRHH' : 'Cierre formal de censo al 12 de Noviembre de 2026'
          })
        });

        const data = await res.json();
        if (data.success) {
          if (typeof window.showToast === 'function') {
            window.showToast(data.message, 'success');
          }
          await this.loadData();
        } else {
          throw new Error(data.error || 'Error cambiando estado del censo');
        }
      } catch (err) {
        console.error('❌ Error cambiando estado del censo:', err);
        if (typeof window.showToast === 'function') {
          window.showToast(err.message, 'error');
        }
      }
    },

    async generateActa() {
      const confirmGen = confirm(
        '¿Desea EMITIR el ACTA MINISTERIAL DEFINITIVA de la Gran Jornada 27/Nov?\n\n' +
        'Este instrumento calculará el tonelaje oficial de la carga, fijará el padrón definitivo y firmará criptográficamente el documento con SHA-256 para el Despacho del Ministro y la Inspectoría General.'
      );

      if (!confirmGen) return;

      try {
        const headers = this.getHeaders();
        const res = await fetch('/api/v1/audit/ministerial/acta', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            closing_notes: 'Cierre Definitivo de Padrón y Liquidación de Combos Gran Jornada 27/Nov'
          })
        });

        const data = await res.json();
        if (data.success) {
          if (typeof window.showToast === 'function') {
            window.showToast(`Acta Oficial ${data.acta.acta_number} generada con Sello SHA-256.`, 'success');
          }
          await this.loadData();
          this.viewActa(data.acta.id);
        } else {
          throw new Error(data.error || 'Error al emitir el acta ministerial');
        }
      } catch (err) {
        console.error('❌ Error emitiendo acta ministerial:', err);
        if (typeof window.showToast === 'function') {
          window.showToast(err.message, 'error');
        }
      }
    },

    async viewActa(actaId = 'latest') {
      try {
        const headers = this.getHeaders();
        const res = await fetch(`/api/v1/audit/ministerial/acta/${actaId}`, { headers });
        if (!res.ok) {
          throw new Error('No se encontró acta ministerial emitida.');
        }

        const data = await res.json();
        if (!data.success || !data.acta) {
          throw new Error('Datos de acta no disponibles.');
        }

        const acta = data.acta;
        const m = acta.metrics || {};

        // Inyectar en modal
        document.getElementById('ministerialActaNumber').textContent = acta.acta_number || '--';
        document.getElementById('ministerialActaGeneratedDate').textContent = acta.generated_at ? new Date(acta.generated_at).toLocaleString() : '--';
        document.getElementById('ministerialActaGeneratedBy').textContent = acta.generated_by || 'Despacho del Ministro';

        document.getElementById('ministerialActaTotalCensus').textContent = Number(m.total_workers_census || 0).toLocaleString();
        document.getElementById('ministerialActaTotalFormalized').textContent = Number(m.total_formalized || 0).toLocaleString();
        document.getElementById('ministerialActaFormalizationPct').textContent = `${m.formalization_pct || 0}%`;
        document.getElementById('ministerialActaTotalCombos').textContent = Number(m.total_combos_assigned || 0).toLocaleString();
        document.getElementById('ministerialActaGrossWeightTons').textContent = Number(m.total_gross_weight_tons || 0).toFixed(2);

        document.getElementById('ministerialActaPasskeyPct').textContent = `${m.passkey_adoption_pct || 0}%`;
        document.getElementById('ministerialActaTotalRezagados').textContent = Number(m.total_rezagados || 0).toLocaleString();
        document.getElementById('ministerialActaBlockedIncidents').textContent = Number(m.security_incidents_blocked || 0).toLocaleString();

        document.getElementById('ministerialActaHashLabel').textContent = acta.digital_acta_hash || '--';
        document.getElementById('ministerialActaDateStamp').textContent = acta.generated_at ? acta.generated_at.slice(0, 10) : '2026-11-27';

        // Muestra de top dependencias
        const topDeptsBody = document.getElementById('ministerialActaTopDeptsBody');
        if (topDeptsBody) {
          topDeptsBody.innerHTML = (acta.top_departments || []).map(d => `
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
              <td style="padding: 0.35rem 0.5rem; color: #f8fafc; font-weight: 600;">${window.escapeHtml(d.name)}</td>
              <td style="padding: 0.35rem 0.5rem; text-align: right; color: #94a3b8;">${d.total_workers || 0}</td>
              <td style="padding: 0.35rem 0.5rem; text-align: right; color: #34d399; font-weight: 700;">${d.formalized_count || 0}</td>
              <td style="padding: 0.35rem 0.5rem; text-align: right; color: #f87171; font-weight: 700;">${d.rezagados_count || 0}</td>
              <td style="padding: 0.35rem 0.5rem; text-align: center; color: #38bdf8; font-weight: 700;">${d.formalization_pct || 0}%</td>
            </tr>
          `).join('');
        }

        // Firmantes
        const sigs = acta.signatories || {};
        if (sigs.viceminister) document.getElementById('signMinisterialViceminister').textContent = sigs.viceminister.name;
        if (sigs.human_resources) document.getElementById('signMinisterialRrhh').textContent = sigs.human_resources.name;
        if (sigs.technology) document.getElementById('signMinisterialOtic').textContent = sigs.technology.name;
        if (sigs.audit_inspectorate) document.getElementById('signMinisterialAudit').textContent = sigs.audit_inspectorate.name;

        // Renderizar Código QR del Acta
        const qrTarget = document.getElementById('ministerialActaQrTarget');
        if (qrTarget) {
          qrTarget.innerHTML = '';
          if (typeof QRCode !== 'undefined') {
            new QRCode(qrTarget, {
              text: `MIPPCI-ACTA-MINISTERIAL:${acta.acta_number}:HASH:${acta.digital_acta_hash}`,
              width: 72,
              height: 72,
              colorDark: '#0f172a',
              colorLight: '#ffffff',
              correctLevel: QRCode.CorrectLevel.M
            });
          }
        }

        // Mostrar Modal
        const modalBackdrop = document.getElementById('ministerialActaModalBackdrop');
        if (modalBackdrop) modalBackdrop.classList.add('active');

      } catch (err) {
        console.error('❌ Error visualizando acta ministerial:', err);
        if (typeof window.showToast === 'function') {
          window.showToast(err.message, 'warning');
        }
      }
    },

    renderActasHistory(latestActa) {
      const container = document.getElementById('ministerialActasHistoryList');
      if (!container) return;

      if (!latestActa) {
        container.innerHTML = `
          <div style="background: rgba(15, 23, 42, 0.4); border: 1px dashed #475569; border-radius: 8px; padding: 1.25rem; text-align: center; color: #94a3b8; font-size: 0.78rem;">
            No se ha emitido ningún Acta Ministerial Definitiva hasta el momento.
            Haga clic en <strong>"📜 Emitir Acta Ministerial Definitiva"</strong> para consolidar y sellar el proceso.
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="font-size: 1.8rem;">📜</div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="text-mono" style="font-weight: 800; color: #38bdf8; font-size: 0.88rem;">
                  ${latestActa.acta_number}
                </span>
                <span class="badge" style="background: #065f46; color: #6ee7b7; font-size: 0.65rem;">
                  🔒 Sello SHA-256 Verificado
                </span>
              </div>
              <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 0.2rem;">
                Emitida el: <strong>${new Date(latestActa.generated_at).toLocaleString()}</strong> • 
                Padrón Consolidado: <strong>${latestActa.total_workers_census} funcionarios</strong> • 
                Cobertura: <strong>${latestActa.formalization_pct}%</strong>
              </div>
              <div class="text-mono" style="font-size: 0.65rem; color: #64748b; margin-top: 0.2rem;">
                Hash: ${latestActa.digital_acta_hash}
              </div>
            </div>
          </div>
          <button class="btn btn-outline" onclick="window.MinisterialAudit.viewActa('${latestActa.id}')" style="border-color: #38bdf8; color: #38bdf8; font-size: 0.78rem; padding: 0.45rem 0.85rem;">
            👁️ Inspeccionar Acta
          </button>
        </div>
      `;
    },

    printActa() {
      window.print();
    }
  };

  window.MinisterialAudit = MinisterialAudit;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MinisterialAudit.init());
  } else {
    MinisterialAudit.init();
  }
})();
