/**
 * notification.js - 通知系统共享逻辑
 * 依赖：页面需包含 #notification-bell-wrapper、#notification-panel、#notification-badge、#notification-list
 * 用户对象从 localStorage/sessionStorage 的 'user' 键读取
 */

(function () {
  var notificationPanelOpen = false;

  function getToken() {
    var userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!userStr) return null;
    try { return JSON.parse(userStr); } catch (e) { return null; }
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var now = new Date();
    var diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  async function loadNotificationBadge() {
    var user = getToken();
    if (!user) return;
    try {
      var res = await fetch('/api/notifications');
      var result = await res.json();
      var list = (result.success && result.data) ? result.data : [];
      var unreadCount = list.filter(function(n){ return !n.read; }).length;
      var badge = document.getElementById('notification-badge');
      if (!badge) return;
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (e) { /* ignore */ }
  }

  window.toggleNotificationPanel = async function () {
    var panel = document.getElementById('notification-panel');
    if (!panel) return;
    if (notificationPanelOpen) { closeNotificationPanel(); return; }
    panel.classList.remove('hidden');
    notificationPanelOpen = true;
    await loadNotifications();
    setTimeout(function () {
      var handler = function (e) {
        var p = document.getElementById('notification-panel');
        var w = document.getElementById('notification-bell-wrapper');
        if (p && !p.contains(e.target) && w && !w.contains(e.target)) { closeNotificationPanel(); document.removeEventListener('click', handler); }
      };
      document.addEventListener('click', handler);
    }, 100);
  };

  window.closeNotificationPanel = function () {
    var panel = document.getElementById('notification-panel');
    if (panel) panel.classList.add('hidden');
    notificationPanelOpen = false;
  };

  async function loadNotifications() {
    var user = getToken();
    if (!user) return;
    var listEl = document.getElementById('notification-list');
    if (listEl) listEl.innerHTML = '<div class="px-4 py-8 text-center text-slate-400 text-sm">加载中...</div>';
    try {
      var res = await fetch('/api/notifications');
      var result = await res.json();
      var list = (result.success && result.data) ? result.data : [];
      renderNotificationList(list);
      var unreadCount = list.filter(function(n){ return !n.read; }).length;
      var badge = document.getElementById('notification-badge');
      if (badge) {
        if (unreadCount > 0) { badge.textContent = unreadCount > 99 ? '99+' : unreadCount; badge.classList.remove('hidden'); }
        else { badge.classList.add('hidden'); }
      }
    } catch (e) {
      listEl = document.getElementById('notification-list');
      if (listEl) listEl.innerHTML = '<div class="px-4 py-8 text-center text-red-400 text-sm">加载失败</div>';
    }
  }

  // 跳转到考试页（先标已读再跳转）
  window.goToExam = async function (examId, notifyId) {
    if (notifyId) {
      try { await fetch('/api/notifications/' + notifyId + '/read', { method: 'PUT' }); } catch(e){}
    }
    window.location.href = 'exam.html?id=' + examId;
  };

  function renderNotificationList(list) {
    var listEl = document.getElementById('notification-list');
    if (!listEl) return;
    if (!list || list.length === 0) { listEl.innerHTML = '<div class="px-4 py-8 text-center text-slate-400 text-sm">暂无消息</div>'; return; }
    var typeIcons = {
      'learning_reminder': 'fa-book',
      'application_reviewed': 'fa-check-circle',
      'system': 'fa-cog',
      'announcement': 'fa-bullhorn',
      'training_assign': 'fa-calendar-check',
      'exam': 'fa-file-text'
    };
    listEl.innerHTML = list.map(function (n) {
      var icon = typeIcons[n.type] || 'fa-bell';
      var isExam = n.type === 'exam';
      var clickAction;
      if (isExam && n.examId) { clickAction = 'goToExam(' + n.examId + ',' + n.id + ')'; }
      else if (n.type === 'training_assign' && n.trainingId) { clickAction = "window.location.href='messages.html'"; }
      else { clickAction = 'markNotificationRead(' + n.id + ')'; }
      var bgClass = n.read ? 'opacity-60' : (isExam ? 'bg-amber-50/30' : 'bg-blue-50/30');
      var iconColorClass = n.read ? 'text-slate-400' : (isExam ? 'text-amber-500' : 'text-primary');
      var titleColor = n.read ? '' : (isExam ? 'text-amber-600' : 'text-primary');
      var btnHtml = (isExam && n.examId)
        ? '<button onclick="event.stopPropagation();goToExam(' + n.examId + ',' + n.id + ')" class="mt-2 text-xs px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:opacity-90 font-medium"><i class="fa fa-play mr-1"></i>进入考试</button>'
        : '';
      return '<div class="px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition cursor-pointer ' + bgClass + '" onclick="' + clickAction + '">' +
        '<div class="flex items-start gap-2">' +
          '<i class="fa ' + icon + ' text-xs mt-1 ' + iconColorClass + '"></i>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-slate-800 ' + titleColor + '">' + escapeHtml(n.title) + '</p>' +
            '<p class="text-xs text-slate-500 mt-1 line-clamp-2">' + escapeHtml(n.content) + '</p>' +
            btnHtml +
            '<p class="text-[11px] text-slate-400 mt-1">' + formatTime(n.createdAt) + '</p>' +
          '</div>' +
        '</div></div>';
    }).join('');
  }

  window.markNotificationRead = async function (id) {
    try { await fetch('/api/notifications/' + id + '/read', { method: 'PUT' }); await loadNotifications(); } catch (e) {}
  };

  window.markAllNotificationsRead = async function () {
    try {
      // 先获取所有通知，找出未读的ID
      var res = await fetch('/api/notifications');
      var result = await res.json();
      var list = (result.success && result.data) ? result.data : [];
      var unreadIds = list.filter(function(n){ return !n.read; }).map(function(n){ return n.id; });
      if (unreadIds.length === 0) return;
      // 批量标记已读
      await fetch('/api/notifications/batch-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds })
      });
      await loadNotifications();
    } catch (e) {}
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () { loadNotificationBadge(); setInterval(loadNotificationBadge, 60000); });
  }
})();
