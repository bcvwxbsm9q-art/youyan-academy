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

    /* ---------- 公告详情页跳转（真实移动端页面 m/notice.html） ---------- */
    // 由 index.html 公告 Ticker 调用：跳转到独立详情页，URL 带 ?id=
    goNotice: function (id) {
      location.href = '/m/notice.html?id=' + encodeURIComponent(id || '');
    },

    /* ---------- 更多 · 分享面板 ---------- */
    openSharePanel: function () {
      // 避免重复创建
      if (document.getElementById('m-share-mask')) { App.closeSharePanel(); return; }
      var mask = document.createElement('div');
      mask.id = 'm-share-mask';
      mask.className = 'm-share-mask';
      var panel = document.createElement('div');
      panel.id = 'm-share-panel';
      panel.className = 'm-share-panel';

      // 注：分享给联系人列表依赖钉钉通讯录数据，后端接入前暂不展示。
      // 后续接入钉钉后，可在此处拉取真实联系人并渲染 .m-share__sec 区块。
      // 与导航栏保持一致的品牌 LOGO（紫渐变 SVG）
      var brandLogo =
        '<svg class="m-share__logo" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">' +
          '<defs><linearGradient id="mShareLogoGrad" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/>' +
          '</linearGradient></defs>' +
          '<rect x="0" y="0" width="32" height="32" rx="9" fill="url(#mShareLogoGrad)"/>' +
          '<path d="M16 7 L27 12 L16 17 L5 12 Z" fill="#fff"/>' +
          '<path d="M9.5 13.5 V19.5 C9.5 19.5 12.5 21.6 16 21.6 C19.5 21.6 22.5 19.5 22.5 19.5 V13.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
          '<circle cx="27" cy="12" r="1.7" fill="#fff"/>' +
        '</svg>';
      panel.innerHTML =
        '<div class="m-share__hd">' +
          '<div class="m-share__brand">' +
            brandLogo +
            '<span class="m-share__name">游雁学院</span>' +
          '</div>' +
          '<button class="m-share__x" id="m-share-close"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="m-share__grid">' +
          '<button class="m-share__action" data-action="dingtalk">' +
            '<div class="m-share__action-icon m-share__action-icon--blue">' +
              '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1890ff" aria-hidden="true">' +
                '<path d="M19.773 4.053c-1.293-1.204-3.43-1.732-5.348-1.732-4.838 0-8.767 2.923-8.767 6.524 0 1.978 1.343 3.913 2.898 5.202l-1.068 3.94c-.231.857.562 1.546 1.316.986l4.065-2.953c.977.249 1.964.374 2.892.374 4.838 0 8.766-2.923 8.766-6.524 0-2.63-1.387-4.681-4.365-5.717h-.389z"/>' +
              '</svg>' +
            '</div>' +
            '<span class="m-share__action-label">分享到钉钉</span>' +
          '</button>' +
          '<button class="m-share__action" data-action="float">' +
            '<div class="m-share__action-icon m-share__action-icon--gray"><i class="fa-regular fa-window-maximize"></i></div>' +
            '<span class="m-share__action-label">添加到浮窗</span>' +
          '</button>' +
          '<button class="m-share__action" data-action="about">' +
            '<div class="m-share__action-icon m-share__action-icon--gray"><i class="fa-solid fa-circle-info"></i></div>' +
            '<span class="m-share__action-label">关于</span>' +
          '</button>' +
        '</div>' +
        '<div class="m-share__cancel-bar">' +
          '<button class="m-share__cancel-btn" id="m-share-cancel">取消</button>' +
        '</div>';

      document.body.appendChild(mask);
      document.body.appendChild(panel);

      // 动画入场
      requestAnimationFrame(function () {
        mask.classList.add('is-open');
        panel.classList.add('is-open');
      });
      window.lockScroll();

      // 事件绑定
      document.getElementById('m-share-close').addEventListener('click', function () { App.closeSharePanel(); });
      document.getElementById('m-share-cancel').addEventListener('click', function () { App.closeSharePanel(); });
      mask.addEventListener('click', function () { App.closeSharePanel(); });

      // 操作按钮点击
      Array.prototype.forEach.call(panel.querySelectorAll('.m-share__action'), function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.getAttribute('data-action');
          App.closeSharePanel();
          switch (action) {
            case 'dingtalk': App.toast('已复制链接，请在钉钉中打开'); break;
            case 'float':
              try { window.addToHomeScreen && window.addToHomeScreen(); } catch(e){}
              App.toast('请使用浏览器「添加到主屏幕」功能');
              break;
            case 'about': App.alert({ title: '关于', message: '游雁学院 v1.0\n广州游雁网络科技有限公司\n© 2026 All Rights Reserved' }); break;
          }
        });
      });
    },
    closeSharePanel: function () {
      var mask = document.getElementById('m-share-mask');
      var panel = document.getElementById('m-share-panel');
      if (mask) { mask.classList.remove('is-open'); setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 260); }
      if (panel) { panel.classList.remove('is-open'); setTimeout(function () { if (panel.parentNode) panel.parentNode.removeChild(panel); }, 360); }
      window.unlockScroll();
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

  // 导航栏滚动后轻微背景（始终无边框，保持融入页面）
  function bindNavScroll() {
    var navs = document.querySelectorAll('.m-nav');
    if (!navs.length) return;
    var onScroll = function () {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      for (var i = 0; i < navs.length; i++) {
        if (y > 8) navs[i].classList.add('is-scrolled');
        else navs[i].classList.remove('is-scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindNavScroll);
  } else {
    bindNavScroll();
  }

  window.App = App;
})();
