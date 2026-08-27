/* =========================================================
   游雁学院 · 移动端 API 客户端
   统一：token 注入、{success,data} 兼容、裸数组/对象兼容
   复用与 PC 端一致的认证头（Authorization: Bearer <token>）
   ========================================================= */
(function () {
  'use strict';

  var BASE = window.location.origin + '/api';

  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }
  function getUser() {
    var s = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  // 归一化响应：
  //  - {success:true, data:...} -> data
  //  - {success:false}          -> 抛错
  //  - 裸对象/数组（如 /api/training/:id 直接返回 event）-> 原样返回
  function unwrap(json) {
    if (json && json.success === true) {
      return (json.data !== undefined) ? json.data : json;
    }
    if (json && json.success === false) {
      throw new Error(json.error || '请求失败');
    }
    return json;
  }

  function headers(extra) {
    var h = { 'Content-Type': 'application/json' };
    var t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (extra) Object.assign(h, extra);
    return h;
  }

  async function request(method, path, body) {
    var opt = { method: method, headers: headers() };
    if (body !== undefined) opt.body = JSON.stringify(body);
    var res = await fetch(BASE + path, opt);
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (!res.ok) {
      var msg = (json && json.error) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return unwrap(json);
  }

  var Api = {
    BASE: BASE,
    getToken: getToken,
    getUser: getUser,
    isLoggedIn: function () { return !!getToken(); },

    get:  function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b); },
    put:  function (p, b) { return request('PUT', p, b); },

    // ---- 首页 ----
    banners: function () { return Api.get('/banners'); },
    notices: function () { return Api.get('/notices'); },

    // ---- 分类 ----
    categories: function () { return Api.get('/categories'); },

    // ---- 课程 ----
    courses: function () { return Api.get('/courses'); },
    // 后端无「按 id 取单门」路由：拉列表前端过滤（与 PC 播放器 loadCourseData 一致）
    course:  function (id) {
      return Api.get('/courses').then(function (list) {
        var arr = Array.isArray(list) ? list : [];
        return arr.filter(function (c) { return String(c.id) === String(id); })[0] || null;
      });
    },
    lecturers: function () { return Api.get('/lecturers'); },

    // ---- 培训 ----
    trainingList:  function () { return Api.get('/training'); },
    trainingSchedule: function () { return Api.get('/training/schedule'); },
    trainingDetail:  function (id) { return Api.get('/training/' + id); },
    trainingSignins: function (id) { return Api.get('/training/' + id + '/signins'); },

    // ---- 签到 ----
    signin: function (id, userId, code) {
      return Api.post('/training/' + id + '/signin', { userId: userId, code: code, method: 'mobile', direct: true });
    },
    // 按签到码定位培训（移动端输码/扫码通用）
    trainingBySignin: function (code) {
      return Api.get('/training/by-signin/' + encodeURIComponent(code));
    },

    // ---- 调研 ----
    survey: function (id) { return Api.get('/surveys/' + id); },
    surveyCheck: function (id, userId, trainingId) {
      var q = '?userId=' + encodeURIComponent(userId);
      if (trainingId) q += '&trainingId=' + encodeURIComponent(trainingId);
      return Api.get('/surveys/' + id + '/check-responded' + q);
    },
    surveyRespond: function (id, payload) { return Api.post('/surveys/' + id + '/respond', payload); },

    // ---- 考试（跳转 exam.html，无需接口） ----

    // ---- 我的 ----
    me: function () { return Api.get('/auth/me'); },
    profileUpdate: function (payload) { return Api.put('/auth/profile', payload); },
    examRecords: function () { return Api.get('/user/exam-records'); },
    certificates: function () { return Api.get('/user-certificates'); },
    userTrainings: function () { return Api.get('/user/trainings'); },
    notifications: function () { return Api.get('/notifications'); },
    markRead: function (id) { return Api.put('/notifications/' + id + '/read', {}); },
    markAllRead: async function (ids) { return Api.post('/notifications/batch-read', { ids: ids }); },

    // 解析扫描结果中的培训 ID
    // 支持：纯数字 / 含 id=123 / 含 training 关键词的 URL
    parseTrainingId: function (text) {
      if (!text) return null;
      text = String(text).trim();
      try {
        var u = new URL(text);
        var id = u.searchParams.get('id');
        if (id) return id;
      } catch (e) { /* 不是合法 URL，继续按文本解析 */ }
      var m = text.match(/[?&]id=(\d+)/i);
      if (m) return m[1];
      if (/^\d+$/.test(text)) return text;
      var m2 = text.match(/\d{6,}/);
      return m2 ? m2[0] : null;
    }
  };

  window.Api = Api;
})();
