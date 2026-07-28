/* =========================================================
   游雁学院 · 移动端公共逻辑
   - 登录门禁（复用 PC 端 auth-modal.js 的登录 UI 与 token 存储）
   - 底部 Tab 导航 / Toast / Loading / 页面初始化
   ========================================================= */
(function () {
  'use strict';

  var TABS = [
    { key: 'home',  label: '首页', icon: 'fa-house',        page: 'index.html' },
    { key: 'training', label: '培训', icon: 'fa-calendar-check', page: 'training.html' },
    { key: 'course', label: '课程', icon: 'fa-book-open',    page: 'course.html' },
    { key: 'mine',  label: '我的', icon: 'fa-user',         page: 'mine.html' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var App = {
    TABS: TABS,
    esc: esc,

    /* ---------- 用户 / 登录 ---------- */
    isLoggedIn: function () { return window.Api ? Api.isLoggedIn() : false; },
    user: function () { return window.Api ? Api.getUser() : null; },
    userId: function () {
      var u = App.user();
      return u ? (u.id || u.userId) : null;
    },
    userName: function () {
      var u = App.user();
      if (!u) return '';
      return (u.real_name && u.real_name.trim()) ||
             (u.realName && u.realName.trim()) ||
             (u.username && u.username.trim()) || '学员';
    },

    ensureAuth: function (onSuccess) {
      if (App.isLoggedIn()) { if (onSuccess) onSuccess(); return true; }
      if (window.AuthModal) {
        AuthModal.show({
          onSuccess: function () {
            if (onSuccess) onSuccess();
            else location.reload();
          }
        });
      }
      return false;
    },

    logout: function () {
      if (!confirm('确定要退出登录吗？')) return;
      try {
        localStorage.removeItem('token'); localStorage.removeItem('user');
        sessionStorage.removeItem('token'); sessionStorage.removeItem('user');
      } catch (e) {}
      location.reload();
    },

    /* ---------- 导航 ---------- */
    nav: function (page) { location.href = '/m/' + page; },

    /* ---------- Toast ---------- */
    toast: function (msg, type) {
      var t = document.getElementById('m-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'm-toast'; t.className = 'm-toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.background = (type === 'error') ? 'rgba(190,30,40,.94)' : 'rgba(20,22,32,.92)';
      // 触发动画
      void t.offsetWidth;
      t.classList.add('is-show');
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.classList.remove('is-show'); }, 2200);
    },

    /* ---------- Loading ---------- */
    showLoading: function (msg) {
      var el = document.getElementById('m-loading');
      if (!el) {
        el = document.createElement('div');
        el.id = 'm-loading'; el.className = 'm-loading';
        el.innerHTML = '<div class="m-spin"></div><div style="margin-left:10px">' + (msg || '加载中...') + '</div>';
        document.body.appendChild(el);
      }
      el.style.display = 'flex';
    },
    hideLoading: function () {
      var el = document.getElementById('m-loading');
      if (el) el.style.display = 'none';
    },

    /* ---------- 底部 Tab ---------- */
    renderTabBar: function (active) {
      var bar = document.getElementById('tabbar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'tabbar';
        document.body.appendChild(bar);
      }
      var cur = location.pathname.split('/').pop();
      bar.className = 'm-tabbar';
      bar.innerHTML = TABS.map(function (t) {
        var isActive = (t.key === active);
        // 通知红点：仅“我的”页根据未读做预留（这里简单用 class）
        return '<button class="m-tab ' + (isActive ? 'is-active' : '') + '" data-page="' + t.page + '">' +
                 '<i class="fa-solid ' + t.icon + '"></i>' +
                 '<span>' + t.label + '</span>' +
               '</button>';
      }).join('');
      Array.prototype.forEach.call(bar.querySelectorAll('.m-tab'), function (btn) {
        btn.addEventListener('click', function () {
          var p = btn.getAttribute('data-page');
          if (p === cur) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
          App.nav(p);
        });
      });
    },

    /* ---------- 页面初始化 ---------- */
    // opts: { active, requireAuth, onReady }
    initPage: function (opts) {
      opts = opts || {};
      App.renderTabBar(opts.active);
      App._updateHeaderUser();

      if (opts.requireAuth && !App.isLoggedIn()) {
        App.ensureAuth(function () { location.reload(); });
        return;
      }
      if (typeof opts.onReady === 'function') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', opts.onReady);
        } else {
          opts.onReady();
        }
      }
    },

    _updateHeaderUser: function () {
      var el = document.getElementById('m-user-name');
      if (el) el.textContent = App.userName();
    },

    /* ---------- 底部弹层 (sheet) ---------- */
    _ensureSheet: function () {
      if (!document.getElementById('m-mask')) {
        var mask = document.createElement('div');
        mask.className = 'm-sheet-mask'; mask.id = 'm-mask';
        mask.addEventListener('click', App.closeSheet);
        document.body.appendChild(mask);
      }
      if (!document.getElementById('m-sheet')) {
        var sheet = document.createElement('div');
        sheet.className = 'm-sheet'; sheet.id = 'm-sheet';
        sheet.innerHTML =
          '<button class="m-sheet__close" onclick="App.closeSheet()"><i class="fa-solid fa-xmark"></i></button>' +
          '<div class="m-sheet__grip"></div>' +
          '<div id="m-sheet-body"></div>';
        document.body.appendChild(sheet);
      }
    },
    openSheet: function (html) {
      App._ensureSheet();
      document.getElementById('m-sheet-body').innerHTML = html;
      document.getElementById('m-mask').classList.add('is-open');
      document.getElementById('m-sheet').classList.add('is-open');
      // 锁定滚动（带 scrollbar-gutter 兜底，永不抖动）
      window.lockScroll();
    },
    closeSheet: function () {
      var mask = document.getElementById('m-mask');
      var sheet = document.getElementById('m-sheet');
      if (mask) mask.classList.remove('is-open');
      if (sheet) sheet.classList.remove('is-open');
      window.unlockScroll();
    },

    /* ---------- 自定义确认 / 提示弹层（替代原生 confirm/alert） ---------- */
    // cfg: { title, message, confirmText, cancelText, danger, onConfirm, onCancel }
    confirm: function (cfg) {
      cfg = cfg || {};
      var html =
        '<div class="m-sheet__hd"><div class="m-sheet__title">' + App.esc(cfg.title || '确认操作') + '</div></div>' +
        '<div class="m-sheet__body">' +
          (cfg.message ? '<p style="font-size:14px;color:var(--ink-2);line-height:1.6;margin:0 0 16px">' + App.esc(cfg.message) + '</p>' : '') +
          '<div style="display:flex;gap:10px">' +
            '<button class="m-btn m-btn--ghost m-btn--block" id="m-cfm-cancel">' + App.esc(cfg.cancelText || '取消') + '</button>' +
            '<button class="m-btn m-btn--block' + (cfg.danger ? ' m-btn--danger' : '') + '" id="m-cfm-ok">' + App.esc(cfg.confirmText || '确定') + '</button>' +
          '</div>' +
        '</div>';
      App.openSheet(html);
      var cancel = document.getElementById('m-cfm-cancel');
      var ok = document.getElementById('m-cfm-ok');
      if (cancel) cancel.addEventListener('click', function () { App.closeSheet(); if (cfg.onCancel) cfg.onCancel(); });
      if (ok) ok.addEventListener('click', function () { App.closeSheet(); if (cfg.onConfirm) cfg.onConfirm(); });
    },
    alert: function (cfg) {
      cfg = cfg || {};
      var html =
        '<div class="m-sheet__hd"><div class="m-sheet__title">' + App.esc(cfg.title || '提示') + '</div></div>' +
        '<div class="m-sheet__body">' +
          (cfg.message ? '<p style="font-size:14px;color:var(--ink-2);line-height:1.6;margin:0 0 16px">' + App.esc(cfg.message) + '</p>' : '') +
          '<button class="m-btn m-btn--block" id="m-alt-ok">' + App.esc(cfg.confirmText || '我知道了') + '</button>' +
        '</div>';
      App.openSheet(html);
      var ok = document.getElementById('m-alt-ok');
      if (ok) ok.addEventListener('click', function () { App.closeSheet(); if (cfg.onConfirm) cfg.onConfirm(); });
    },

    /* ---------- 工具 ---------- */
    fmtDate: function (s) {
      if (!s) return '';
      var d = new Date(String(s).replace(' ', 'T'));
      if (isNaN(d)) return s;
      return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
    },
    fmtDateTime: function (s) {
      if (!s) return '';
      var d = new Date(String(s).replace(' ', 'T'));
      if (isNaN(d)) return s;
      var p = function (n) { return n < 10 ? '0' + n : n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    },
    // 取培训的开始/结束时间的“时分”
    fmtHM: function (s) {
      if (!s) return '';
      var d = new Date(String(s).replace(' ', 'T'));
      if (isNaN(d)) return s;
      var p = function (n) { return n < 10 ? '0' + n : n; };
      return p(d.getHours()) + ':' + p(d.getMinutes());
    }
  };

  window.App = App;
})();
