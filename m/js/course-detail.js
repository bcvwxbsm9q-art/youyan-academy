/* =========================================================
   游雁学院 · 移动端「培训详情」独立页逻辑
   - 复用 App / Api（common.js / api-client.js）
   - 与 training.html 共享培训计算逻辑，但渲染为整页（带返回键）
   - 不含视频播放：培训非视频课，故详情页只含 封面/讲师/信息/课件/任务
   ========================================================= */
(function () {
  'use strict';

  var AVATAR_COLORS = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#f093fb,#f5576c)',
    'linear-gradient(135deg,#4facfe,#00f2fe)',
    'linear-gradient(135deg,#43e97b,#38f9d7)',
    'linear-gradient(135deg,#fa709a,#fee140)'
  ];
  function avatarColor(idx) { return AVATAR_COLORS[(idx || 0) % AVATAR_COLORS.length]; }

  function fmtSigninTime(start, end) {
    if (!start) return '';
    var s = App.fmtHM(start), e = end ? App.fmtHM(end) : '';
    return e ? ('签到时间 ' + s + ' - ' + e) : ('签到时间 ' + s);
  }

  function calcStatus(t) {
    var req = (t.signinEnabled ? 1 : 0) +
              (t.surveyEnabled && t.linkedSurveyId ? 1 : 0) +
              (t.examEnabled && t.linkedExamId ? 1 : 0);
    if (!req) return null;
    var done = (t.signinDone ? 1 : 0) + (t.surveyDone ? 1 : 0) + (t.examDone ? 1 : 0);
    if (done === req) return { cls: 'is-done', label: '已完成' };
    if (done > 0) return { cls: 'is-doing', label: '进行中' };
    var sd = t.startTime ? new Date(t.startTime) : null;
    var past = sd ? sd <= new Date() : true;
    return past ? { cls: 'is-todo', label: '待完成' } : { cls: 'is-upcoming', label: '未开始' };
  }

  async function getTraining(id) {
    // 详情页独立打开，无需 allTrainings 缓存；直接拉详情
    var ev = await Api.trainingDetail(id);
    return await enrichDetail(ev);
  }

  async function enrichDetail(ev) {
    var uid = App.userId();
    var t = {
      id: ev.id, name: ev.name, project: ev.project, instructor: ev.instructor,
      location: ev.location, content: ev.content,
      date: App.fmtDate(ev.startTime),
      time: (App.fmtHM(ev.startTime) + (ev.endTime ? ' - ' + App.fmtHM(ev.endTime) : '')),
      signinEnabled: ev.signinEnabled, signinStartTime: ev.signinStartTime, signinEndTime: ev.signinEndTime, signinId: ev.signinId, signinDone: false,
      surveyEnabled: ev.surveyEnabled, linkedSurveyId: ev.linkedSurveyId, surveyDone: false,
      examEnabled: ev.examEnabled, linkedExamId: ev.linkedExamId, examDone: false,
      coursewareEnabled: ev.coursewareEnabled, coursewareFiles: ev.coursewareFiles || [],
      startTime: ev.startTime, endTime: ev.endTime
    };
    if (uid) {
      try {
        var s = await Api.trainingSignins(t.id);
        var arr = (s && s.data) ? s.data : (Array.isArray(s) ? s : []);
        t.signinDone = arr.some(function (x) { return String(x.userId) == String(uid); });
      } catch (e) {}
      if (t.linkedSurveyId) {
        try { var c = await Api.surveyCheck(t.linkedSurveyId, uid, t.id); t.surveyDone = !!(c && c.responded); } catch (e) {}
      }
      if (t.linkedExamId) {
        try {
          var recs = await Api.examRecords() || [];
          t.examDone = recs.some(function (r) { return String(r.examId) == String(t.linkedExamId); });
        } catch (e) {}
      }
    }
    return t;
  }

  function buildTasks(t) {
    var items = [];
    if (t.signinEnabled) items.push({ key:'signin', icon:'fa-circle-check', title:'考勤签到', tag:'必修', color:'#10b981', sub:fmtSigninTime(t.signinStartTime,t.signinEndTime), done:t.signinDone, act:'signin' });
    if (t.surveyEnabled && t.linkedSurveyId) items.push({ key:'survey', icon:'fa-chart-bar', title:'培训满意度调研', tag:'必修', color:'#0891b2', sub:'请根据本次培训真实感受填写', done:t.surveyDone, act:'survey' });
    if (t.examEnabled && t.linkedExamId) items.push({ key:'exam', icon:'fa-file-lines', title:'《' + t.name + '》培训考核', tag:'必修', color:'#d97706', sub:'完成考核以巩固学习成果', done:t.examDone, act:'exam' });
    if (t.coursewareEnabled && t.coursewareFiles && t.coursewareFiles.length) items.push({ key:'courseware', icon:'fa-folder-open', title:'培训课件（'+t.coursewareFiles.length+'个）', tag:'资料', color:'#7c3aed', sub:'培训相关资料，可自由下载', done:false, act:'courseware' });
    return items;
  }

  async function handleTask(act, t) {
    if (act === 'signin') return doSignin(t);
    if (act === 'survey') return openSurvey(t.linkedSurveyId, t.id, t);
    if (act === 'exam') {
      var back = encodeURIComponent(location.pathname + location.search);
      location.href = '/exam.html?id=' + t.linkedExamId + '&returnUrl=' + back + '&trainingId=' + t.id;
      return;
    }
    if (act === 'courseware') return openCourseware(t.coursewareFiles);
  }

  function doSignin(t) {
    App.confirm({
      title: '考勤签到',
      message: '确认签到「' + t.name + '」？签到后将记录你的参训情况。',
      confirmText: '确认签到',
      onConfirm: function () { doSigninActual(t); }
    });
  }

  async function doSigninActual(t) {
    App.showLoading('签到中...');
    try {
      await Api.signin(t.id, App.userId(), t.signinId);
      t.signinDone = true;
      App.hideLoading();
      App.toast('签到成功');
      App.closeSheet();
      refreshDetail();
    } catch (e) {
      App.hideLoading();
      App.toast(e.message || '签到失败', 'error');
    }
  }

  function openCourseware(files) {
    var html = '<div class="m-sheet__hd"><div class="m-sheet__title">培训课件</div></div><div class="m-sheet__body">' +
      files.map(function (f) {
        var name = (f.url || f).split('/').pop();
        return '<a class="m-row" href="' + App.esc(f.url || f) + '" download style="text-decoration:none">' +
          '<div class="m-row__ic"><i class="fa-solid fa-file-arrow-down"></i></div>' +
          '<div class="m-row__bd"><div class="m-row__t" style="font-size:13px">' + App.esc(name) + '</div></div>' +
          '<i class="m-row__arrow fa-solid fa-download"></i></a>';
      }).join('') + '</div>';
    App.openSheet(html);
  }

  /* ---------- 调研 ---------- */
  async function openSurvey(surveyId, trainingId, t) {
    App.showLoading();
    try {
      var survey = await Api.survey(surveyId);
      App.hideLoading();
      renderSurveySheet(survey, surveyId, trainingId, t);
    } catch (e) {
      App.hideLoading();
      App.toast('调研加载失败', 'error');
    }
  }

  function renderSurveySheet(survey, surveyId, trainingId, t) {
    var answers = {};
    var qs = survey.questions || [];
    var qHtml = qs.map(function (q, idx) {
      var reqMark = q.required ? '<span class="m-q__req">*</span>' : '';
      var inner = '';
      if (q.type === 'rating') {
        inner = '<div class="m-stars" data-q="' + q.id + '" data-type="rating">' +
          [1,2,3,4,5].map(function (n) { return '<i class="fa-solid fa-star" data-v="' + n + '"></i>'; }).join('') +
          '<span class="m-rate-val" id="rv-' + q.id + '"></span></div>';
      } else if (q.type === 'multiple') {
        inner = '<div data-q="' + q.id + '" data-type="multiple">' + (q.options || []).map(function (o) {
          return '<div class="m-opt" data-v="' + App.esc(o) + '"><i class="fa-regular fa-square"></i><span>' + App.esc(o) + '</span></div>';
        }).join('') + '</div>';
      } else if (q.type === 'judge') {
        inner = '<div data-q="' + q.id + '" data-type="single">' + ['正确','错误'].map(function (o) {
          return '<div class="m-opt" data-v="' + App.esc(o) + '"><i class="fa-regular fa-circle"></i><span>' + o + '</span></div>';
        }).join('') + '</div>';
      } else if (q.type === 'text') {
        inner = '<textarea class="m-input" data-q="' + q.id + '" data-type="text" rows="3" placeholder="请输入..."></textarea>';
      } else {
        inner = '<div data-q="' + q.id + '" data-type="single">' + (q.options || []).map(function (o) {
          return '<div class="m-opt" data-v="' + App.esc(o) + '"><i class="fa-regular fa-circle"></i><span>' + App.esc(o) + '</span></div>';
        }).join('') + '</div>';
      }
      return '<div class="m-q"><div class="m-q__t">' + (idx+1) + '. ' + App.esc(q.title) + reqMark + '</div>' + inner + '</div>';
    }).join('');

    var doneNote = t.surveyDone ? '<div class="m-badge m-badge--done" style="margin-bottom:12px;display:inline-block">您已填写过本调研</div>' : '';
    var html = '<div class="m-sheet__hd"><div class="m-sheet__title">' + App.esc(survey.title || '培训调研') + '</div></div>' +
      '<div class="m-sheet__body">' + doneNote +
        (survey.description ? '<p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">' + App.esc(survey.description) + '</p>' : '') +
        qHtml +
        (t.surveyDone ? '' : '<button class="m-btn m-btn--block" id="survey-submit" style="margin-top:16px">提交调研</button>') +
      '</div>';
    App.openSheet(html);

    var body = document.getElementById('m-sheet-body');
    body.querySelectorAll('.m-stars').forEach(function (box) {
      var qid = box.getAttribute('data-q');
      box.querySelectorAll('i').forEach(function (star) {
        star.addEventListener('click', function () {
          var v = parseInt(star.getAttribute('data-v'));
          answers[qid] = v;
          box.querySelectorAll('i').forEach(function (s, i) { s.classList.toggle('is-on', i < v); });
          document.getElementById('rv-' + qid).textContent = v + ' 分';
        });
      });
    });
    body.querySelectorAll('[data-type="single"]').forEach(function (box) {
      var qid = box.getAttribute('data-q');
      box.querySelectorAll('.m-opt').forEach(function (opt) {
        opt.addEventListener('click', function () {
          box.querySelectorAll('.m-opt').forEach(function (o) { o.classList.remove('is-sel'); o.querySelector('i').className = 'fa-regular fa-circle'; });
          opt.classList.add('is-sel'); opt.querySelector('i').className = 'fa-solid fa-circle-dot';
          answers[qid] = opt.getAttribute('data-v');
        });
      });
    });
    body.querySelectorAll('[data-type="multiple"]').forEach(function (box) {
      var qid = box.getAttribute('data-q');
      answers[qid] = [];
      box.querySelectorAll('.m-opt').forEach(function (opt) {
        opt.addEventListener('click', function () {
          opt.classList.toggle('is-sel');
          var on = opt.classList.contains('is-sel');
          opt.querySelector('i').className = on ? 'fa-regular fa-square-check' : 'fa-regular fa-square';
          var v = opt.getAttribute('data-v'), arr = answers[qid];
          if (on) { if (arr.indexOf(v) < 0) arr.push(v); } else { answers[qid] = arr.filter(function (x) { return x !== v; }); }
        });
      });
    });
    body.querySelectorAll('[data-type="text"]').forEach(function (ta) {
      var qid = ta.getAttribute('data-q');
      ta.addEventListener('input', function () { answers[qid] = ta.value; });
    });

    var submit = document.getElementById('survey-submit');
    if (submit) submit.addEventListener('click', function () { submitSurvey(survey, surveyId, trainingId, t, answers); });
  }

  async function submitSurvey(survey, surveyId, trainingId, t, answers) {
    for (var i = 0; i < survey.questions.length; i++) {
      var q = survey.questions[i];
      if (!q.required) continue;
      var v = answers[q.id];
      if (q.type === 'multiple') { if (!v || !v.length) return App.toast('第' + (i+1) + '题为必填', 'error'); }
      else if (v === undefined || v === null || v === '') return App.toast('第' + (i+1) + '题为必填', 'error');
    }
    App.showLoading('提交中...');
    try {
      await Api.surveyRespond(surveyId, { userId: App.userId(), userName: App.userName(), trainingId: trainingId, answers: answers });
      t.surveyDone = true;
      App.hideLoading();
      App.toast('调研提交成功');
      App.closeSheet();
      refreshDetail();
    } catch (e) { App.hideLoading(); App.toast(e.message || '提交失败', 'error'); }
  }

  /* ---------- 详情页渲染 ---------- */
  var currentTraining = null;

  function refreshDetail() {
    if (currentTraining) renderDetailPage(currentTraining);
  }

  function renderDetailPage(t) {
    currentTraining = t;
    var st = calcStatus(t);
    var badgeHtml = st ? '<span class="cs-badge cs-badge--' + st.cls + '">' + App.esc(st.label) + '</span>' : '';

    // 任务
    var tasks = buildTasks(t);
    var req = tasks.filter(function (x) { return x.tag === '必修'; }).length;
    var done = tasks.filter(function (x) { return x.done; }).length;
    var prog = req ? Math.round(done / req * 100) : 0;

    var taskHtml = tasks.length ? tasks.map(function (it) {
      var btn = it.done
        ? '<button class="m-task__btn m-task__btn--done" disabled>已完成</button>'
        : '<button class="m-task__btn m-task__btn--go" data-act="' + it.act + '">去完成</button>';
      return '<div class="m-task">' +
        '<div class="m-task__ic" style="background:' + it.color + '18;color:' + it.color + '"><i class="fa-solid ' + it.icon + '"></i></div>' +
        '<div class="m-task__main"><div class="m-task__title">' + App.esc(it.title) +
          ' <span class="m-task__tag" style="color:' + it.color + ';background:' + it.color + '18">' + it.tag + '</span></div>' +
          '<div class="m-task__sub">' + App.esc(it.sub) + '</div></div>' + btn + '</div>';
    }).join('') : '<p style="color:var(--ink-3);font-size:13px;text-align:center;padding:14px">暂无项目内容</p>';

    // 课件
    var cwHtml = '';
    if (t.coursewareEnabled && t.coursewareFiles && t.coursewareFiles.length) {
      cwHtml = '<div class="cd-section">' +
        '<h3 class="m-section__title"><i class="fa-solid fa-folder-open"></i>培训课件</h3>' +
        t.coursewareFiles.map(function (f) {
          var name = (f.url || f).split('/').pop();
          return '<a class="m-row" href="' + App.esc(f.url || f) + '" download data-cw style="text-decoration:none">' +
            '<div class="m-row__ic"><i class="fa-solid fa-file-arrow-down"></i></div>' +
            '<div class="m-row__bd"><div class="m-row__t" style="font-size:13px">' + App.esc(name) + '</div></div>' +
            '<i class="m-row__arrow fa-solid fa-download"></i></a>';
        }).join('') + '</div>';
    }

    // 基本信息卡：使用共享组件（PC 端模态 + 移动端页面共用）
    var sharedCardHtml = window.CourseDetailShared.renderCourseDetailBody(t, { showFooter: false });

    // 状态徽章（追加到课程名后面）
    var statusChip = badgeHtml ? '<span class="cd-status-chip">' + badgeHtml + '</span>' : '';

    // PC 端"项目内容"区块标题保持原样
    var tasksSectionHtml = tasks.length
      ? '<div class="cd-section">' +
          '<h3 class="m-section__title"><i class="fa-solid fa-list-check"></i>项目内容</h3>' +
          taskHtml +
          (req ? '<div class="m-prog" style="margin-top:6px">培训进度 <b>' + done + '/' + req + '</b></div><div class="m-bar"><div class="m-bar__fill" style="width:' + prog + '%"></div></div>' : '') +
        '</div>'
      : '';

    var html =
      // 返回课程列表链接（沿用 PC 端 .tp-info-back 视觉）
      '<button class="tp-info-back" onclick="CourseDetail.goBack()"><i class="fa-solid fa-arrow-left"></i><span>返回课程列表</span></button>' +
      // 基本信息区块
      '<div class="cd-section">' +
        '<h3 class="m-section__title"><i class="fa-solid fa-circle-info"></i>基本信息' + statusChip + '</h3>' +
        sharedCardHtml +
      '</div>' +
      // 课件
      cwHtml +
      // 项目内容
      tasksSectionHtml;

    var body = document.getElementById('cd-body');
    body.innerHTML = html;

    body.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleTask(btn.getAttribute('data-act'), currentTraining); });
    });
    body.querySelectorAll('[data-cw]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        e.preventDefault();
        openCourseware(currentTraining.coursewareFiles);
      });
    });
  }

  /* ---------- 入口 ---------- */
  function init() {
    var id = new URLSearchParams(location.search).get('id');
    var bodyEl = document.getElementById('cd-body');
    if (!id) {
      bodyEl.innerHTML = '<div class="m-empty"><i class="fa-regular fa-circle-xmark"></i>未指定培训</div>';
      return;
    }
    App.initPage({
      active: 'training',
      requireAuth: true,
      onReady: async function () {
        App.showLoading();
        try {
          var t = await getTraining(id);
          App.hideLoading();
          renderDetailPage(t);
        } catch (e) {
          App.hideLoading();
          bodyEl.innerHTML = '<div class="m-empty"><i class="fa-regular fa-circle-xmark"></i>培训信息加载失败' +
            '<div class="m-empty__acts"><button class="m-btn m-btn--ghost m-btn--sm" onclick="location.reload()">重新加载</button></div></div>';
        }
      }
    });
  }

  function goBack() {
    try { if (window.history.length > 1) { history.back(); return; } } catch (e) {}
    location.href = '/m/training.html';
  }

  window.CourseDetail = { init: init, goBack: goBack };
})();
