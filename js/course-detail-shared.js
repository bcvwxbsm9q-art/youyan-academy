/* ==========================================================================
 * course-detail-shared.js — 课程详情"基本信息卡"共享渲染函数
 *
 * PC 端 (training-plan.html 模态) + 移动端 (m/course-detail.html) 共用。
 * 输出 HTML 使用 css/tp-detail.css 中的 .tp-info-* 类名，两端视觉一致。
 *
 * 用法：
 *   <script src="/js/course-detail-shared.js"></script>
 *   <script>
 *     const html = CourseDetailShared.renderCourseDetailBody(course, options);
 *     document.getElementById('container').innerHTML = html;
 *   </script>
 *
 * 输入 course 字段（兼容 PC 端 + 移动端两种来源）：
 *   - id, name            课程名
 *   - project             项目分类（新雁计划 / 入职培训等）
 *   - content             课程介绍正文
 *   - date                培训日期（中文 '8月27日' / '2026-08-27' 均可）
 *   - time                时间范围字符串 '20:00-21:00'
 *   - instructor          讲师
 *   - location            地点
 * ========================================================================== */

(function (global) {
  'use strict';

  // 工具：HTML 转义
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 工具：把任意日期字段转 '8月27日' 形式
  function fmtMonthDay(input) {
    if (!input) return '待定';
    if (typeof input === 'string' && /^\d{1,2}月\d{1,2}日$/.test(input)) return input;
    var d = (input instanceof Date) ? input : new Date(String(input).replace(' ', 'T'));
    if (isNaN(d)) return String(input);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  /**
   * 渲染课程/培训基本信息卡 HTML 字符串
   * @param {Object} course
   * @param {Object} [options]
   * @param {boolean} [options.showIntro=true]  是否显示"课程介绍"块
   * @param {boolean} [options.showFooter=false] 是否显示底部分隔条（PC 端模态用）
   * @param {string}  [options.footerHtml]      自定义 footer HTML（PC 端传 enrolled avatars）
   * @returns {string}
   */
  function renderCourseDetailBody(course, options) {
    if (!course) return '';
    var opts = Object.assign({ showIntro: true, showFooter: false, footerHtml: '' }, options || {});

    // 课程分类标签（"新雁计划" 这种带颜色的 pill）
    var project = course.project || course.projectName || '';
    var projTagHtml = '';
    if (project) {
      // 浅紫底 + 品牌紫字
      projTagHtml =
        '<span class="tp-category-tag" style="background:rgba(102,126,234,.1);color:#667eea;">' +
          esc(project) +
        '</span>';
    }

    // 课程介绍
    var introHtml = '';
    if (opts.showIntro && course.content) {
      introHtml =
        '<div class="tp-intro-box">' +
          '<div class="tp-intro-title"><i class="fa fa-info-circle"></i>课程介绍</div>' +
          '<div class="tp-intro-text">' + esc(course.content) + '</div>' +
        '</div>';
    }

    // 信息四宫格：日期 / 时间 / 讲师 / 地点
    var monthDay = fmtMonthDay(course.date || course.startTime);
    var time = course.time || '';
    var instructor = course.instructor || '待定';
    var location = course.location || '待定';

    var infoItems = [
      { icon: 'fa-calendar-o', label: '日期', value: monthDay, full: monthDay },
      { icon: 'fa-clock-o',    label: '时间', value: time || '待定', full: time || '待定' },
      { icon: 'fa-user-o',     label: '讲师', value: instructor, full: instructor },
      { icon: 'fa-map-marker', label: '地点', value: location, full: location }
    ];
    var infoGridHtml = infoItems.map(function (it) {
      return '<div class="tp-info-mini-card" title="' + esc(it.label + '：' + it.full) + '">' +
        '<div class="tp-info-mini-icon"><i class="fa ' + it.icon + '"></i></div>' +
        '<div class="tp-info-mini-text">' +
          '<div class="tp-info-mini-label">' + esc(it.label) + '</div>' +
          '<div class="tp-info-mini-value">' + esc(it.value) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // 拼装卡片
    var html =
      '<div class="tp-info-card">' +
        '<div class="tp-info-body" style="padding: 0;">' +
          projTagHtml +
          '<h2 class="tp-course-title">' + esc(course.name || '未命名培训') + '</h2>' +
          introHtml +
          '<div class="tp-info-grid">' + infoGridHtml + '</div>' +
        '</div>' +
        (opts.showFooter && opts.footerHtml
          ? '<div class="tp-info-footer" style="border-top: 1px solid #f3f4f6; margin-top: 1rem;">' + opts.footerHtml + '</div>'
          : '') +
      '</div>';

    return html;
  }

  // 暴露到全局
  global.CourseDetailShared = {
    renderCourseDetailBody: renderCourseDetailBody,
    esc: esc,
    fmtMonthDay: fmtMonthDay
  };
})(typeof window !== 'undefined' ? window : globalThis);