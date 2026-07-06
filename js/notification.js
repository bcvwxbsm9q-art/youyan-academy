/**
 * notification.js - 通知系统共享逻辑
 * 职责：刷新顶部未读数徽标；提供消息中心页面所需的通知操作函数。
 * 依赖：页面需包含 #notification-bell-wrapper、#notification-badge
 * 用户对象从 localStorage/sessionStorage 的 'user' 键读取
 */

(function () {
  // 获取 Bearer token（对齐 auth-guard 和 messages.html 的方式）
  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  // 获取用户信息对象
  function getUserInfo() {
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
    var token = getToken();
    if (!token) return;
    try {
      var headers = {};
      headers['Authorization'] = 'Bearer ' + token;
      var res = await fetch('/api/notifications', { headers: headers });
      if (!res.ok) return;
      var result = await res.json();
      var list = (result.success && result.data) ? result.data : [];
      // 过滤掉用户在消息中心已删除的消息
      var deletedIds = new Set((JSON.parse(localStorage.getItem('messages_deleted_ids') || '[]')).map(function(id){ return String(id); }));
      list = list.filter(function(n){ return !deletedIds.has(String(n.id)); });
      var unreadCount = list.filter(function(n){ return !n.read; }).length;
      var badge = document.getElementById('notification-badge');
      if (!badge) return;
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (e) {
      console.warn('[Notification] 加载未读数失败:', e.message);
    }
  }

  // 跳转到考试页（先标已读再跳转，携带当前页作为返回地址）
  window.goToExam = async function (examId, notifyId) {
    if (notifyId) {
      try {
        var token = getToken();
        var headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;
        await fetch('/api/notifications/' + notifyId + '/read', { method: 'PUT', headers: headers });
      } catch(e){}
    }
    var backUrl = encodeURIComponent(location.pathname.replace(/^\//, '') || 'index.html');
    window.location.href = 'exam.html?id=' + examId + '&returnUrl=' + backUrl;
  };

  window.markNotificationRead = async function (id) {
    var token = getToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try { await fetch('/api/notifications/' + id + '/read', { method: 'PUT', headers: headers }); await loadNotificationBadge(); } catch (e) {}
  };

  window.markAllNotificationsRead = async function () {
    var token = getToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      // 先获取所有通知，找出未读的ID
      var res = await fetch('/api/notifications', { headers: headers });
      var result = await res.json();
      var list = (result.success && result.data) ? result.data : [];
      // 过滤掉用户在消息中心已删除的消息
      var deletedIds = new Set((JSON.parse(localStorage.getItem('messages_deleted_ids') || '[]')).map(function(id){ return String(id); }));
      list = list.filter(function(n){ return !deletedIds.has(String(n.id)); });
      var unreadIds = list.filter(function(n){ return !n.read; }).map(function(n){ return n.id; });
      if (unreadIds.length === 0) return;
      // 批量标记已读
      await fetch('/api/notifications/batch-read', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ ids: unreadIds })
      });
      await loadNotificationBadge();
    } catch (e) {}
  };

  if (typeof document !== 'undefined') {
    // 启动徽章刷新
    function startBadgeRefresh() {
      loadNotificationBadge();
      // 每60秒自动刷新未读数
      if (!startBadgeRefresh._timer) {
        startBadgeRefresh._timer = setInterval(loadNotificationBadge, 60000);
      }
    }

    // 停止定时器（页面卸载时）
    window.addEventListener('beforeunload', function () {
      if (startBadgeRefresh._timer) {
        clearInterval(startBadgeRefresh._timer);
        startBadgeRefresh._timer = null;
      }
    });

    document.addEventListener('DOMContentLoaded', function () {
      // 初次尝试加载
      startBadgeRefresh();

      // 如果 token 还没准备好（auth-guard 异步），等待并重试
      var retries = 0;
      var retryInterval = setInterval(function () {
        retries++;
        if (getToken()) {
          clearInterval(retryInterval);
          loadNotificationBadge();
        } else if (retries >= 50) {
          // 5秒后仍未获取到 token，放弃等待
          clearInterval(retryInterval);
          console.warn('[Notification] 等待 token 超时，将不会显示通知徽章');
        }
      }, 100);
    });

    // 监听登录/登出事件，及时更新徽章
    window.addEventListener('userLoginSuccess', function () { loadNotificationBadge(); });
    window.addEventListener('authChange', function () { loadNotificationBadge(); });
    window.addEventListener('userProfileUpdated', function () { loadNotificationBadge(); });
  }
})();
