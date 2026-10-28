// ============================================================================
// SISTEMA INSTITUCIONAL DE CONTROL GLOBAL DE MODALES (CORE)
// SGBT MIPPCI - Gestión unificada de modales, tecla Escape y cierre delegado
// ============================================================================

(function(window, document) {
  'use strict';

  const ModalController = {
    /**
     * Obtiene la lista de todos los modales actualmente visibles en pantalla
     * @returns {HTMLElement[]} Modales visibles ordenados por nivel de capa (z-index / DOM)
     */
    getOpenModals: function() {
      const allBackdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
      
      const visibleModals = allBackdrops.filter(modal => {
        // Ignorar modales marcados como estáticos o protegidos contra cierre involuntario
        if (modal.getAttribute('data-static') === 'true' || modal.classList.contains('modal-static')) {
          return false;
        }

        const hasActiveClass = modal.classList.contains('active');
        const inlineDisplay = modal.style.display;
        const computedDisplay = window.getComputedStyle(modal).display;

        // Se considera abierto si tiene clase active o display distinto de 'none'
        return hasActiveClass || (inlineDisplay && inlineDisplay !== 'none') || (computedDisplay !== 'none' && computedDisplay !== '');
      });

      // Ordenar: modales con mayor z-index computado o posición más profunda en el DOM van al final
      visibleModals.sort((a, b) => {
        const zA = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
        const zB = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
        if (zA !== zB) return zA - zB;
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      return visibleModals;
    },

    /**
     * Retorna el modal superior activo (el que está visible más al frente)
     * @returns {HTMLElement|null}
     */
    getTopmostModal: function() {
      const open = this.getOpenModals();
      return open.length > 0 ? open[open.length - 1] : null;
    },

    /**
     * Cierra de forma unificada y segura cualquier ventana modal del sistema
     * @param {HTMLElement|string} modalElement O ID del elemento modal
     */
    close: function(modalElement) {
      const modal = typeof modalElement === 'string' ? document.getElementById(modalElement) : modalElement;
      if (!modal) return;

      // Respetar modales estáticos o de acción obligatoria
      if (modal.getAttribute('data-static') === 'true' || modal.classList.contains('modal-static')) {
        return;
      }

      // Remover clase de visibilidad
      modal.classList.remove('active');
      
      // Ocultar si tenía inline styles
      if (modal.style.display && modal.style.display !== 'none') {
        modal.style.display = 'none';
      }

      // Despachar evento para sincronización de componentes
      modal.dispatchEvent(new CustomEvent('modal:closed', { bubbles: true, detail: { modalId: modal.id } }));

      // Hook de compatibilidad con módulos específicos conocidos
      this._notifyModuleClose(modal.id);
    },

    /**
     * Abre un modal por ID o elemento
     * @param {HTMLElement|string} modalElement 
     */
    open: function(modalElement) {
      const modal = typeof modalElement === 'string' ? document.getElementById(modalElement) : modalElement;
      if (!modal) return;

      modal.classList.add('active');
      if (modal.style.display === 'none') {
        modal.style.display = 'flex';
      }

      modal.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true, detail: { modalId: modal.id } }));
    },

    /**
     * Notifica a controladores especializados al cerrarse un modal
     * @private
     */
    _notifyModuleClose: function(modalId) {
      switch (modalId) {
        case 'createDepartmentBatchModalBackdrop':
          if (window.DepartmentBatches && typeof window.DepartmentBatches.closeCreateModal === 'function') {
            window.DepartmentBatches.closeCreateModal();
          }
          break;
        case 'reviewDepartmentBatchModalBackdrop':
          if (window.DepartmentBatches && typeof window.DepartmentBatches.closeReviewModal === 'function') {
            window.DepartmentBatches.closeReviewModal();
          }
          break;
        case 'dispatchDepartmentBatchModalBackdrop':
          if (window.DepartmentBatches && typeof window.DepartmentBatches.closeDispatchModal === 'function') {
            window.DepartmentBatches.closeDispatchModal();
          }
          break;
        case 'departmentBatchActaModalBackdrop':
          if (window.DepartmentBatches && typeof window.DepartmentBatches.closeActaModal === 'function') {
            window.DepartmentBatches.closeActaModal();
          }
          break;
        case 'systemLogsModal':
          if (typeof window.closeSystemLogsModal === 'function') {
            window.closeSystemLogsModal();
          }
          break;
        case 'logDetailViewerModal':
          if (typeof window.closeLogDetailModal === 'function') {
            window.closeLogDetailModal();
          }
          break;
        case 'recentDeliveriesModalBackdrop':
          if (typeof window.closeRecentDeliveriesModal === 'function') {
            window.closeRecentDeliveriesModal();
          }
          break;
        case 'supervisorDailyQrModalBackdrop':
          if (typeof window.closeSupervisorDailyQrModal === 'function') {
            window.closeSupervisorDailyQrModal();
          }
          break;
        case 'notificationsModalBackdrop':
          if (typeof window.closeNotificationsModal === 'function') {
            window.closeNotificationsModal();
          }
          break;
        case 'whatsappShareModalBackdrop':
          if (typeof window.closeWhatsAppShareModal === 'function') {
            window.closeWhatsAppShareModal();
          }
          break;
        case 'fastIncorporateModalBackdrop':
          if (typeof window.closeFastIncorporateModal === 'function') {
            window.closeFastIncorporateModal();
          }
          break;
        case 'delegationModalBackdrop':
          if (typeof window.closeDelegationModal === 'function') {
            window.closeDelegationModal();
          }
          break;
        default:
          break;
      }
    },

    /**
     * Inicializa los listeners globales de eventos (Escape y Delegación de Clics)
     */
    init: function() {
      // 1. Manejo universal de tecla ESCAPE
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          const topModal = this.getTopmostModal();
          if (topModal) {
            e.preventDefault();
            e.stopPropagation();
            this.close(topModal);
          }
        }
      });

      // 2. Delegación global de clics para botones de cierre y backdrop
      document.addEventListener('click', (e) => {
        // A. Clic en botón de cierre explícito (incluso si fue inyectado dinámicamente)
        const closeBtn = e.target.closest(
          '.modal-close-btn, [data-dismiss="modal"], [data-modal-close], ' +
          '#btnCloseCreateBatchModal, #btnCancelCreateBatchModal, ' +
          '#btnCloseReviewBatchModal, #btnCloseDispatchBatchModal, #btnCancelDispatchBatchModal, ' +
          '#btnCloseBatchActaModal, #btnCloseEnrollmentModal, #btnCloseLogDetailViewer, #btnCloseSystemLogsModal'
        );

        if (closeBtn) {
          const modalBackdrop = closeBtn.closest('.modal-backdrop');
          if (modalBackdrop) {
            e.preventDefault();
            this.close(modalBackdrop);
            return;
          }
        }

        // B. Clic directo sobre el fondo oscuro (backdrop) para cerrar
        if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
          if (e.target.getAttribute('data-static') !== 'true' && !e.target.classList.contains('modal-static')) {
            this.close(e.target);
          }
        }
      });

      console.log('✅ [ModalController] Gestor universal de modales activo (Escape + Cierre Delegado).');
    }
  };

  window.ModalController = ModalController;

  // Auto-inicio
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ModalController.init());
  } else {
    ModalController.init();
  }

})(window, document);
