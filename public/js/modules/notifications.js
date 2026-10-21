// ============================================================================
// MODULE: NOTIFICATIONS (IN-APP FEED & WEB PUSH API)
// ============================================================================

window.loadNotifications = async function() {
  const container = document.getElementById('notificationsListContainer');
  const badge = document.getElementById('notifBadgeCount');

  try {
    const notifs = await API.get('/api/v1/notifications');

    if (badge) {
      if (notifs.length > 0) {
        badge.textContent = notifs.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!container) return;
    container.innerHTML = '';

    if (notifs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #64748b;">
          <svg class="icon-svg icon-md" style="margin-bottom: 0.5rem; color: #94a3b8;" viewBox="0 0 24 24"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"></path></svg>
          <div>No hay notificaciones o avisos recientes.</div>
        </div>
      `;
      return;
    }

    notifs.forEach(n => {
      const item = document.createElement('div');
      item.className = 'notification-item-card is-new';

      item.innerHTML = `
        <div class="kpi-icon-bubble" style="background: #e0f2fe; color: #0284c7; flex-shrink: 0;">
          <svg class="icon-svg icon-sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        </div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
            <strong style="color: #0f172a; font-size: 0.88rem;">${n.title}</strong>
            <span style="font-size: 0.68rem; color: #94a3b8; white-space: nowrap;">
              ${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p style="font-size: 0.78rem; color: #475569; margin-top: 0.25rem; line-height: 1.35;">${n.message}</p>
        </div>
      `;

      container.appendChild(item);
    });

  } catch (err) {
    console.warn('Error al cargar notificaciones:', err);
  }
};

window.setupNotificationsSystem = function() {
  const modal = document.getElementById('notificationsModalBackdrop');
  const btnOpen = document.getElementById('btnNotificationsBell');
  const btnClose = document.getElementById('btnCloseNotificationsModal');
  const btnCloseBtn = document.getElementById('btnCloseNotificationsModalBtn');
  const btnToggleForm = document.getElementById('btnToggleNewAlertForm');
  const formBlock = document.getElementById('newAlertFormBlock');
  const btnSendAlert = document.getElementById('btnSendQuickAlert');
  const btnCancelAlert = document.getElementById('btnCancelQuickAlert');

  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => {
      Notification.requestPermission().catch(() => {});
    }, 3000);
  }

  btnOpen?.addEventListener('click', () => {
    loadNotifications();
    modal?.classList.add('active');
  });

  const closeModal = () => modal?.classList.remove('active');
  btnClose?.addEventListener('click', closeModal);
  btnCloseBtn?.addEventListener('click', closeModal);

  btnToggleForm?.addEventListener('click', () => {
    if (formBlock) {
      formBlock.style.display = formBlock.style.display === 'none' ? 'block' : 'none';
    }
  });

  btnCancelAlert?.addEventListener('click', () => {
    if (formBlock) formBlock.style.display = 'none';
  });

  btnSendAlert?.addEventListener('click', async () => {
    const title = document.getElementById('quickAlertTitleInput')?.value.trim();
    const message = document.getElementById('quickAlertMessageInput')?.value.trim();

    if (!title || !message) {
      window.showToast('Por favor ingrese título y mensaje para el aviso.', 'warning');
      return;
    }

    try {
      await API.post('/api/v1/notifications', { title, message, target_group: 'all' });

      document.getElementById('quickAlertTitleInput').value = '';
      document.getElementById('quickAlertMessageInput').value = '';
      if (formBlock) formBlock.style.display = 'none';

      sendBrowserNotification(title, message);
      playAudioFeedback('success');
      window.showToast('Aviso institucional enviado a todos los usuarios', 'success');
      await loadNotifications();

    } catch (err) {
      window.showToast('Error enviando aviso: ' + err.message, 'error');
    }
  });
};

window.sendBrowserNotification = function(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png'
      });
    }
  } catch (e) {
    console.warn('Web notification error:', e);
  }
};
