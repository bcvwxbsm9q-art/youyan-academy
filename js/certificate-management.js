/**
 * 证书管理模块前端逻辑
 * 内嵌在 dashboard.html 的 tab-certificates 中使用
 */

(function () {
  'use strict';

  // ===== 状态 =====
  let certificates = [];
  let templates = [];
  let currentDetailCertificate = null;
  let currentDetailTab = 'active';
  let selectedTemplateId = '';
  let editingCertificateId = null;
  let certSelectedIds = new Set();
  let activeEdit = null; // 当前正在编辑的文字元素 { node, el, span }
  const COLOR_PRESETS = ['#c41e0f', '#1f2937', '#1e40af', '#15803d', '#b8860b', '#7c3aed', '#ea580c', '#0ea5e9', '#000000', '#ffffff'];

  // ===== 工具函数 =====
  function $(selector) { return document.querySelector(selector); }
  function $$ (selector) { return Array.from(document.querySelectorAll(selector)); }

  function formatDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type) {
    type = type || 'info';
    if (window.showToast) {
      window.showToast(message, type);
    } else {
      alert(message);
    }
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  // Drawer 抽屉式窗口（右滑动画）
  function openDrawerOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function closeDrawerOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  // ===== API =====
  async function apiGet(url) {
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') } });
    return res.json();
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
      },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  async function apiPut(url, body) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
      },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  async function apiDelete(url) {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    return res.json();
  }

  // ===== 加载数据 =====
  async function loadCertificates() {
    const keyword = $('#cert-search-input')?.value || '';
    const status = $('#cert-status-filter')?.value || '';
    const dept = $('#cert-dept-filter')?.value || '';
    let url = '/api/certificates?';
    if (keyword) url += 'keyword=' + encodeURIComponent(keyword) + '&';
    if (status) url += 'status=' + encodeURIComponent(status) + '&';
    if (dept) url += 'dept=' + encodeURIComponent(dept) + '&';
    const res = await apiGet(url);
    certificates = res.data || [];
    renderCertificateList();
    renderCertificateStats();
  }

  function renderCertificateStats() {
    const total = certificates.length;
    const enabled = certificates.filter(c => c.status === 'enabled').length;
    const issued = certificates.reduce((sum, c) => sum + (c.issuedCount || 0), 0);
    const active = certificates.reduce((sum, c) => sum + (c.activeCount || 0), 0);
    const setText = (id, val) => {
      const el = $('#' + id);
      if (el) el.textContent = val;
    };
    setText('cert-stat-total', total);
    setText('cert-stat-enabled', enabled);
    setText('cert-stat-issued', issued);
    setText('cert-stat-active', active);
  }

  async function loadTemplates() {
    const res = await apiGet('/api/certificates/templates');
    templates = res.data || [];
  }

  // ===== 渲染证书列表 =====
  function renderCertificateList() {
    const tbody = $('#certificate-list-body');
    if (!tbody) return;

    if (certificates.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">暂无证书，点击「新建证书」创建</td></tr>`;
      return;
    }

    tbody.innerHTML = certificates.map(cert => {
      const statusBadge = cert.status === 'enabled'
        ? '<span class="cert-badge cert-badge--on"><i class="fas fa-circle text-[8px]"></i>启用</span>'
        : '<span class="cert-badge cert-badge--off"><i class="fas fa-circle text-[8px]"></i>停用</span>';
      const validityText = cert.validityType === 'permanent' ? '永久有效' : `固定期限（${cert.validityDays}天）`;
      const checked = certSelectedIds.has(String(cert.id)) ? 'checked' : '';
      return `
        <tr class="border-b hover:bg-slate-50">
          <td class="pl-5 pr-2 py-3 text-center" onclick="event.stopPropagation()">
            <input type="checkbox" class="cert-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="window.CertificateMgmt.toggleCertSelect('${cert.id}')" ${checked}>
          </td>
          <td class="px-4 py-3 text-sm">${escapeHtml(cert.name)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(cert.dept || '-')}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${validityText}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${cert.activeCount || 0}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${cert.expiredCount || 0}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(cert.creator || '-')}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${formatDateTime(cert.createdAt)}</td>
          <td class="px-4 py-3 text-sm">${statusBadge}</td>
          <td class="px-4 py-3 text-sm">
            <div class="flex items-center gap-1.5">
              <button onclick="window.CertificateMgmt.openCertificateDetail('${cert.id}')" class="cert-action-btn view" title="查看"><i class="fas fa-eye"></i></button>
              <button onclick="window.CertificateMgmt.openCertificateModal('${cert.id}')" class="cert-action-btn edit" title="编辑"><i class="fas fa-edit"></i></button>
              <button onclick="window.CertificateMgmt.openIssueModal('${cert.id}')" class="cert-action-btn issue" title="颁发"><i class="fas fa-medal"></i></button>
              <button onclick="window.CertificateMgmt.toggleCertificateStatus('${cert.id}')" class="cert-action-btn toggle" title="启用/停用"><i class="fas fa-toggle-on"></i></button>
              <button onclick="window.CertificateMgmt.deleteCertificate('${cert.id}')" class="cert-action-btn del" title="删除"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    updateCertSelectAllState();
    updateCertBatchActionBar();
  }

  // ===== 证书批量选择逻辑 =====
  function toggleCertSelect(id) {
    const sid = String(id);
    if (certSelectedIds.has(sid)) certSelectedIds.delete(sid);
    else certSelectedIds.add(sid);
    updateCertSelectAllState();
    updateCertBatchActionBar();
    renderCertificateList();
  }

  function toggleCertSelectAll() {
    const el = document.getElementById('certSelectAll');
    const checked = el ? el.checked : false;
    if (checked) certificates.forEach(c => certSelectedIds.add(String(c.id)));
    else certificates.forEach(c => certSelectedIds.delete(String(c.id)));
    renderCertificateList();
    updateCertBatchActionBar();
  }

  function updateCertSelectAllState() {
    const allChecked = certificates.length > 0 && certificates.every(c => certSelectedIds.has(String(c.id)));
    const el = document.getElementById('certSelectAll');
    if (el) el.checked = allChecked;
  }

  function updateCertBatchActionBar() {
    const bar = document.getElementById('certBatchActionBar');
    const count = document.getElementById('certBatchCount');
    if (!bar || !count) return;
    if (certSelectedIds.size > 0) {
      bar.classList.remove('hidden');
      count.textContent = `已选 ${certSelectedIds.size} 项`;
    } else {
      bar.classList.add('hidden');
    }
  }

  function clearCertSelection() {
    certSelectedIds.clear();
    const el = document.getElementById('certSelectAll');
    if (el) el.checked = false;
    renderCertificateList();
    updateCertBatchActionBar();
  }

  async function batchDeleteCertificates() {
    const ids = Array.from(certSelectedIds);
    if (!ids.length) return;
    if (!confirm(`确定删除选中的 ${ids.length} 个证书吗？此操作不可恢复。`)) return;
    let success = 0, fail = 0;
    for (const id of ids) {
      try {
        const ok = await deleteCertificate(id, false);
        if (ok) success++; else fail++;
      } catch (e) { fail++; }
    }
    clearCertSelection();
    await loadCertificates();
    showToast(`删除完成：成功 ${success}，失败 ${fail}`);
  }

  // ===== 新建/编辑证书 =====
  function openCertificateModal(certId) {
    editingCertificateId = certId || null;
    selectedTemplateId = '';
    const cert = certId ? certificates.find(c => c.id === certId) : null;

    $('#cert-modal-title').textContent = certId ? '编辑证书' : '新建证书';
    $('#cert-name').value = cert ? cert.name : '';
    $('#cert-dept').value = cert ? (cert.dept || '') : '';
    $('#cert-validity-type').value = cert ? cert.validityType : 'permanent';
    $('#cert-validity-days').value = cert ? (cert.validityDays || '') : '';
    $('#cert-prefix').value = cert ? (cert.prefix || '') : '';
    $('#cert-start-number').value = cert ? (cert.startNumber || 1) : 1;
    $('#cert-digits').value = cert ? (cert.digits || 4) : 4;

    currentDesign = (cert && cert.design) ? deepClone(cert.design) : null;
    if (currentDesign) currentDesign._tpl = cert.templateId;
    editorState = null;

    selectedTemplateId = cert ? cert.templateId : (templates[0]?.id || '');
    updateTemplatePreview();
    toggleValidityDays();

    openDrawerOverlay('certificate-drawer-overlay');
  }

  function closeCertificateModal() {
    closeDrawerOverlay('certificate-drawer-overlay');
    editingCertificateId = null;
  }

  function toggleValidityDays() {
    const type = $('#cert-validity-type')?.value;
    const wrap = $('#cert-validity-days-wrap');
    if (!wrap) return;
    if (type === 'fixed') {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  }

  async function saveCertificate() {
    const payload = {
      name: $('#cert-name').value.trim(),
      dept: $('#cert-dept').value.trim(),
      validityType: $('#cert-validity-type').value,
      validityDays: $('#cert-validity-days').value,
      prefix: $('#cert-prefix').value.trim(),
      startNumber: parseInt($('#cert-start-number').value) || 1,
      digits: parseInt($('#cert-digits').value) || 4,
      templateId: selectedTemplateId,
      design: currentDesign,
      status: 'enabled'
    };

    if (!payload.name) return showToast('请输入证书名称', 'error');
    if (!payload.templateId) return showToast('请选择证书模板', 'error');

    let res;
    if (editingCertificateId) {
      res = await apiPut('/api/certificates/' + editingCertificateId, payload);
    } else {
      res = await apiPost('/api/certificates', payload);
    }

    if (res.success) {
      showToast(editingCertificateId ? '证书已更新' : '证书已创建', 'success');
      closeCertificateModal();
      loadCertificates();
    } else {
      showToast(res.error || '操作失败', 'error');
    }
  }

  async function toggleCertificateStatus(certId) {
    const cert = certificates.find(c => c.id === certId);
    if (!cert) return;
    const newStatus = cert.status === 'enabled' ? 'disabled' : 'enabled';
    const res = await apiPut('/api/certificates/' + certId, { status: newStatus });
    if (res.success) {
      showToast(newStatus === 'enabled' ? '证书已启用' : '证书已停用', 'success');
      loadCertificates();
    } else {
      showToast(res.error || '操作失败', 'error');
    }
  }

  async function deleteCertificate(certId, askConfirm = true) {
    const cert = certificates.find(c => c.id === certId);
    const activeCount = cert ? (cert.activeCount || 0) + (cert.expiredCount || 0) : 0;
    const msg = cert
      ? `确定删除证书「${cert.name}」吗？${activeCount > 0 ? `（将同时清理 ${activeCount} 条关联的颁发记录）` : ''}`
      : '确定删除该证书定义吗？';
    if (askConfirm && !confirm(msg)) return false;
    const res = await apiDelete('/api/certificates/' + certId);
    if (res.success) {
      if (askConfirm) showToast(res.message || '证书已删除', 'success');
      loadCertificates();
      return true;
    } else {
      if (askConfirm) showToast(res.error || '删除失败', 'error');
      return false;
    }
  }

  // ===== 模板选择器 =====
  function openTemplatePicker() {
    openModal('certificate-template-modal');
    renderTemplatePicker();
  }

  function renderTemplatePicker() {
    const grid = $('#certificate-template-grid');
    if (!grid) return;
    grid.innerHTML = templates.map(tpl => {
      const activeClass = selectedTemplateId === tpl.id ? 'active' : '';
      const isPortrait = tpl.layout === 'portrait';
      const bg = tpl.style.background;
      const bc = tpl.style.borderColor;
      const pc = tpl.style.primaryColor;
      const ac = tpl.style.accentColor || bc;
      const sc = tpl.style.sealColor || pc;
      const fn = tpl.style.fontFamily;
      const tTitle = escapeHtml(tpl.placeholders.find(p => p.key === 'title')?.defaultValue || '证书标题');
      const tName = escapeHtml(tpl.placeholders.find(p => p.key === 'name')?.defaultValue || '姓名');

      return `
        <div onclick="window.CertificateMgmt.selectTemplate('${tpl.id}')" class="cert-tpl-card ${activeClass}">
          <div class="h-[188px] rounded-xl mb-2.5 flex flex-col items-center justify-between p-2.5 text-center relative overflow-hidden shadow-md" style="background:${bg}; color:${pc}; border:5px double ${bc}; font-family:${fn};">

            <!-- 内层单线边框 -->
            <div style="position:absolute; inset:5px; border:1px solid ${bc}; opacity:0.30; pointer-events:none; border-radius:2px;"></div>

            <!-- 四角装饰 L 型 -->
            <div style="position:absolute; top:8px; left:8px; width:14px; height:14px; border-top:2.5px solid ${ac}; border-left:2.5px solid ${ac}; opacity:0.7;"></div>
            <div style="position:absolute; top:8px; right:8px; width:14px; height:14px; border-top:2.5px solid ${ac}; border-right:2.5px solid ${ac}; opacity:0.7;"></div>
            <div style="position:absolute; bottom:8px; left:8px; width:14px; height:14px; border-bottom:2.5px solid ${ac}; border-left:2.5px solid ${ac}; opacity:0.7;"></div>
            <div style="position:absolute; bottom:8px; right:8px; width:14px; height:14px; border-bottom:2.5px solid ${ac}; border-right:2.5px solid ${ac}; opacity:0.7;"></div>

            <!-- 顶部：CERTIFICATE + 装饰线 -->
            <div class="relative z-10 w-full pt-1">
              <div class="text-[9px] opacity-60 tracking-[0.25em] uppercase font-medium">Certificate</div>
              <div class="flex items-center gap-1.5 justify-center mt-0.5">
                <div class="flex-1 max-w-[24px]" style="height:1px; background:${ac}; opacity:0.45;"></div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="opacity:0.5; color:${ac};"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/></svg>
                <div class="flex-1 max-w-[24px]" style="height:1px; background:${ac}; opacity:0.45;"></div>
              </div>
            </div>

            <!-- 中部：标题 + 分隔线 + 姓名 -->
            <div class="relative z-10 flex-1 flex flex-col items-center justify-center px-1 -mt-1">
              <div class="text-[15px] font-bold leading-snug tracking-wide" style="text-shadow:0 1px 2px rgba(0,0,0,0.06);">${tTitle}</div>
              <div class="w-12 h-[2px] my-1.5 rounded-full" style="background:linear-gradient(90deg,transparent,${ac},transparent);"></div>
              <div class="text-[9px] opacity-60 mb-0.5">兹证明</div>
              <div class="text-[13px] font-semibold px-3 py-0.5 rounded" style="border-bottom:1.5px dashed ${bc}; opacity:0.9;">${tName}</div>
            </div>

            <!-- 底部：日期 + 印章 -->
            <div class="relative z-10 w-full flex items-end justify-between pb-0.5 px-1">
              <div class="text-[8px] opacity-50 leading-tight">
                <div>2026-07-06</div>
                <div class="scale-90 origin-left opacity-40">游雁科技</div>
              </div>
              <!-- 圆形印章 -->
              <div class="w-[34px] h-[34px] rounded-full flex flex-col items-center justify-center shrink-0" style="border:1.8px solid ${sc}; opacity:0.55; transform:rotate(-10deg);">
                <div class="text-[6px] font-bold tracking-wider leading-tight" style="color:${sc};">认证</div>
                <div class="w-[16px] h-px my-[2px]" style="background:${sc}; opacity:0.6;"></div>
                <div class="text-[5px]" style="color:${sc};">专用章</div>
              </div>
            </div>

          </div>
          <p class="text-sm font-semibold text-slate-800 text-center truncate">${escapeHtml(tpl.name)}</p>
          <p class="text-xs text-slate-400 text-center mt-0.5">${isPortrait ? '竖版' : '横版'}</p>
        </div>
      `;
    }).join('');
  }

  function selectTemplate(tplId) {
    selectedTemplateId = tplId;
    if (!(currentDesign && currentDesign._tpl === tplId)) currentDesign = null;
    renderTemplatePicker();
    updateTemplatePreview();
    closeModal('certificate-template-modal');
    openCertificateEditor();
  }

  function confirmTemplateSelection() {
    closeModal('certificate-template-modal');
    updateTemplatePreview();
  }

  // 防抖：编辑器文字/样式变更后等 600ms 再请求预览，避免每次按键都跑一次 Playwright
  let _previewTimer = null;
  function updateTemplatePreview() {
    const preview = $('#cert-template-preview');
    if (!preview) return;
    // 仅在应用样式(currentDesign)后显示真实预览图；未配置前隐藏容器保持空白
    if (currentDesign) {
      preview.style.display = '';
      preview.innerHTML = `
        <div class="flex items-center justify-center bg-slate-50 rounded-xl border border-slate-200" style="min-height:200px;">
          <div class="flex flex-col items-center text-slate-400 py-6">
            <i class="fa fa-spinner fa-spin text-2xl mb-2"></i>
            <span class="text-xs">生成预览图片…</span>
          </div>
        </div>
      `;
      if (_previewTimer) clearTimeout(_previewTimer);
      _previewTimer = setTimeout(() => renderCertPreviewPng(currentDesign, preview), 600);
      return;
    }
    preview.style.display = 'none';
    preview.innerHTML = '';
  }

  // 调用 /api/certificates/preview-html 拿所见即所得的 PNG dataURL
  // 前端直接把编辑器里渲染好的 HTML（保留 {{token}} 占位）传给服务端，服务端只做数据填充 + Playwright 截图，
  // 避免服务端再用另一套逻辑重绘，确保预览图与编辑器完全一致。
  async function renderCertPreviewPng(design, container) {
    try {
      const html = renderDesignPageInner(design, 1, PREVIEW_PLACEHOLDER_FILL);
      const res = await apiPost('/api/certificates/preview-html', { html, layout: design.layout });
      if (!res.success || !res.data || !res.data.dataUrl) {
        container.innerHTML = `<div class="text-xs text-red-500 p-3">预览失败：${res.error || '未知错误'}</div>`;
        return;
      }
      // 等比缩放到容器宽度（208px）
      container.innerHTML = `
        <div class="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm" style="position:relative; width:100%; padding-top:${(res.data.height / res.data.width) * 100}%;">
          <img src="${res.data.dataUrl}" alt="证书预览" class="absolute inset-0 w-full h-full object-contain" />
        </div>
        <p class="text-[11px] text-slate-400 mt-1.5 text-center">所见即所得 · 与颁发给学员的 PNG 一致</p>
      `;
    } catch (e) {
      container.innerHTML = `<div class="text-xs text-red-500 p-3">预览失败：${e.message}</div>`;
    }
  }

  // ===== 证书详情 =====
  async function openCertificateDetail(certId) {
    const res = await apiGet('/api/certificates/' + certId);
    if (!res.success) return showToast(res.error || '加载失败', 'error');
    currentDetailCertificate = res.data;
    currentDetailTab = 'active';
    renderCertificateDetail();
    openModal('certificate-detail-modal');
  }

  function closeCertificateDetail() {
    closeModal('certificate-detail-modal');
    currentDetailCertificate = null;
  }

  function switchDetailTab(tab) {
    currentDetailTab = tab;
    renderCertificateDetail();
  }

  async function renderCertificateDetail() {
    const cert = currentDetailCertificate;
    if (!cert) return;

    $('#cert-detail-title').textContent = cert.name;
    $('#cert-detail-meta').innerHTML = `
      <span class="text-sm text-slate-500">创建人：${escapeHtml(cert.creator || '-')}</span>
      <span class="text-sm text-slate-500">创建时间：${formatDateTime(cert.createdAt)}</span>
      <span class="text-sm text-slate-500">有效期：${cert.validityType === 'permanent' ? '永久有效' : `固定期限（${cert.validityDays}天）`}</span>
      <span class="text-sm text-slate-500">状态：${cert.status === 'enabled' ? '启用' : '停用'}</span>
    `;

    $$('.cert-detail-tab').forEach(btn => {
      btn.dataset.active = (btn.dataset.tab === currentDetailTab) ? 'true' : 'false';
    });

    const statusMap = { active: 'active', expired: 'expired', revoked: 'revoked' };
    const targetStatus = statusMap[currentDetailTab];
    const res = await apiGet('/api/user-certificates?certificateId=' + cert.id + '&status=' + targetStatus);
    const list = res.data || [];
    const tbody = $('#certificate-detail-body');

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400">暂无${currentDetailTab === 'active' ? '有效' : currentDetailTab === 'expired' ? '已过期' : '已撤销'}人员</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(uc => `
      <tr class="border-b hover:bg-indigo-50/50 transition-colors">
        <td class="px-4 py-3 text-sm">${escapeHtml(uc.userName || uc.userId)}</td>
        <td class="px-4 py-3 text-sm text-blue-600">${escapeHtml(uc.certNo)}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${uc.sourceType === 'manual' ? '手动发放' : uc.sourceType === 'exam' ? '考试通过' : '培训完成'}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${formatDateTime(uc.issueAt)}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${formatDateTime(uc.effectiveAt)}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${uc.expireAt ? formatDateTime(uc.expireAt) : '无期限'}</td>
        <td class="px-4 py-3 text-sm">
          ${currentDetailTab === 'active'
            ? `<button onclick="window.CertificateMgmt.revokeUserCertificate('${uc.id}')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition"><i class="fas fa-undo"></i> 撤销</button>`
            : `<span class="text-slate-300">-</span>`}
        </td>
      </tr>
    `).join('');
  }

  async function revokeUserCertificate(ucId) {
    if (!confirm('确定撤销该证书吗？')) return;
    const res = await apiPost('/api/user-certificates/' + ucId + '/revoke', { reason: '管理员手动撤销' });
    if (res.success) {
      showToast('证书已撤销', 'success');
      renderCertificateDetail();
      loadCertificates();
    } else {
      showToast(res.error || '撤销失败', 'error');
    }
  }

  // ===== 手动发放（复用统一学员指派弹窗） =====
  async function openIssueModal(certId) {
    const cert = certificates.find(c => c.id === certId);
    if (!cert) return;

    if (typeof window.openUnifiedAssignPicker !== 'function') {
      showToast('学员选择组件未加载，请刷新页面', 'error');
      return;
    }

    await window.openUnifiedAssignPicker({
      mode: 'certificate',
      targetId: certId,
      title: '颁发证书',
      subtitle: cert.name,
      initialSelected: [],
      onConfirm: async (selectedIds) => {
        if (!selectedIds || selectedIds.length === 0) {
          showToast('请选择要颁发的学员', 'error');
          return;
        }
        const res = await apiPost('/api/certificates/' + certId + '/issue', {
          userIds: selectedIds,
          sourceType: 'manual'
        });
        if (res.success) {
          showToast(`成功颁发 ${res.data.length} 人${res.errors.length ? '，失败 ' + res.errors.length + ' 人' : ''}`, 'success');
          loadCertificates();
          if (currentDetailCertificate && currentDetailCertificate.id === certId) {
            renderCertificateDetail();
          }
        } else {
          showToast(res.error || '颁发失败', 'error');
        }
      }
    });
  }

  // ===== 证书渲染（通用，用于详情弹窗和个人中心） =====
  function renderCertificateHTML(userCert, certificate, template) {
    if (certificate && certificate.design) {
      const fill = {
        title: certificate.name || '荣誉证书',
        name: userCert.userName || '学员',
        certNo: userCert.certNo || '',
        date: (userCert.issueAt ? formatDateTime(userCert.issueAt).split(' ')[0] : ''),
        company: userCert.userDepartment || '广州游雁网络科技有限公司',
        content: userCert.sourceType === 'exam'
          ? '通过考试考核，成绩合格，特发此证，以资鼓励。'
          : (userCert.sourceType === 'training'
            ? '已完成全部培训课程，考核合格，准予结业。'
            : '表现优异，特发此证，以资鼓励。')
      };
      return renderDesignPageInner(certificate.design, printScale(certificate.design.layout), fill);
    }
    const user = userCert.userName || '学员';
    const company = userCert.userDepartment || '广州游雁网络科技有限公司';
    const date = formatDateTime(userCert.issueAt).split(' ')[0];
    const title = certificate.name || '荣誉证书';
    const content = userCert.sourceType === 'exam'
      ? '通过考试考核，成绩合格，特发此证，以资鼓励。'
      : (userCert.sourceType === 'training'
        ? '已完成全部培训课程，考核合格，准予结业。'
        : '表现优异，特发此证，以资鼓励。');

    const isPortrait = template.layout === 'portrait';
    const width = isPortrait ? '210mm' : '297mm';
    const height = isPortrait ? '297mm' : '210mm';
    const sealColor = template.style.sealColor || template.style.primaryColor;
    const accentColor = template.style.accentColor || template.style.borderColor;
    const secondaryColor = template.style.secondaryColor || template.style.primaryColor;

    return `
      <div class="certificate-render-wrap" style="width:${width}; height:${height}; background:${template.style.background}; color:${template.style.primaryColor}; font-family:${template.style.fontFamily}; border:14px double ${template.style.borderColor}; box-sizing:border-box; padding:56px; position:relative; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
        <div style="position:absolute; top:28px; left:28px; right:28px; bottom:28px; border:2px solid ${template.style.borderColor}; opacity:0.4;"></div>
        <div style="position:absolute; top:42px; left:42px; right:42px; bottom:42px; border:1px solid ${template.style.borderColor}; opacity:0.3;"></div>

        <!-- 四角装饰 -->
        <div style="position:absolute; top:36px; left:36px; width:32px; height:32px; border-top:3px solid ${accentColor}; border-left:3px solid ${accentColor}; opacity:0.6;"></div>
        <div style="position:absolute; top:36px; right:36px; width:32px; height:32px; border-top:3px solid ${accentColor}; border-right:3px solid ${accentColor}; opacity:0.6;"></div>
        <div style="position:absolute; bottom:36px; left:36px; width:32px; height:32px; border-bottom:3px solid ${accentColor}; border-left:3px solid ${accentColor}; opacity:0.6;"></div>
        <div style="position:absolute; bottom:36px; right:36px; width:32px; height:32px; border-bottom:3px solid ${accentColor}; border-right:3px solid ${accentColor}; opacity:0.6;"></div>

        <div style="font-size:13px; letter-spacing:5px; text-transform:uppercase; opacity:0.65; margin-bottom:16px;">Certificate of Achievement</div>
        <h1 style="font-size:44px; font-weight:bold; margin-bottom:20px; letter-spacing:8px;">${escapeHtml(title)}</h1>
        <div style="width:120px; height:3px; background:${accentColor}; opacity:0.5; margin-bottom:32px;"></div>
        <div style="font-size:18px; margin-bottom:24px; opacity:0.85;">兹证明</div>
        <div style="font-size:38px; font-weight:bold; margin-bottom:36px; border-bottom:2px solid ${template.style.borderColor}; padding:0 56px 14px;">${escapeHtml(user)}</div>
        <div style="font-size:18px; line-height:1.9; max-width:78%; margin-bottom:48px; opacity:0.9;">${escapeHtml(content)}</div>

        <div style="margin-top:auto; display:flex; justify-content:space-between; width:72%; font-size:15px; opacity:0.9;">
          <div>证书编号：${escapeHtml(userCert.certNo)}</div>
          <div>颁发日期：${date}</div>
        </div>
        <div style="margin-top:14px; font-size:14px; opacity:0.75;">${escapeHtml(company)}</div>

        <!-- 印章 -->
        <div style="position:absolute; bottom:80px; right:90px; width:96px; height:96px; border:3px solid ${sealColor}; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0.75; transform:rotate(-12deg);">
          <div style="font-size:12px; letter-spacing:2px; font-weight:bold; color:${sealColor};">认证专用章</div>
          <div style="width:64px; height:1px; background:${sealColor}; margin:6px 0; opacity:0.7;"></div>
          <div style="font-size:10px; color:${sealColor};">${escapeHtml(company).slice(0, 8)}</div>
        </div>
      </div>
    `;
  }

  function printCertificate(userCertId) {
    apiGet('/api/user-certificates/' + userCertId).then(res => {
      if (!res.success) return showToast(res.error || '加载失败', 'error');
      const uc = res.data;
      const tpl = uc.template;
      if (!tpl && !uc.design) return showToast('模板不存在', 'error');

      apiGet('/api/certificates/' + uc.certificateId).then(cres => {
        const certDef = cres.data || {};
        const win = window.open('', '_blank');
        win.document.write(`
          <html><head><title>证书打印</title>
          <style>
            @media print { body { margin:0; } .cert-print { page-break-after:always; } }
            body { display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f3f4f6; }
          </style></head><body>
          <div class="cert-print">${renderCertificateHTML(uc, { name: uc.certificateName, design: certDef.design }, tpl)}</div>
          <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
          </body></html>
        `);
        win.document.close();
      });
    });
  }

  // ============================================================
  //  证书可视化编辑器
  // ============================================================
  let currentDesign = null;   // 已应用到当前证书的设计（随保存提交）
  let editorState = null;     // 编辑器内正在编辑的设计副本
  let selectedElId = null;    // 当前选中元素 id（文字 id 或 'seal'）

  // 画布尺寸严格对齐 PNG 模板原始比例，避免 background-size:cover 裁切长边
  // 竖版 PNG 1425x2064(0.690) → 410x594(0.690) | 横版 PNG 2598x1795(1.447) → 608x420(1.448)
  const EDITOR_PAGE = { portrait: { w: 410, h: 594 }, landscape: { w: 608, h: 420 } };
  // 输出/打印按 PNG 原始分辨率渲染（1:1 贴合模板背景，零裁切、零放大模糊）
  // 编辑画布(EDITOR_PAGE)是"设计稿坐标空间"，输出时按方向放大到源图原始尺寸
  const PAGE_NATIVE = { portrait: { w: 1425, h: 2064 }, landscape: { w: 2598, h: 1795 } };
  function printScale(layout) {
    const l = layout || 'portrait';
    return PAGE_NATIVE[l].w / EDITOR_PAGE[l].w;
  }

  const EDITOR_SAMPLE = {
    title: '荣誉证书', name: '$姓名$', certNo: '',
    date: '$颁发日期$', company: '$企业名称$',
    content: '在本公司工作期间，认真负责，表现优\n秀，现授予 年度优秀员工 荣誉称号。特发此\n证，以示表彰。'
  };

  // 传给服务端的占位 fill，让 renderDesignPageInner 输出仍保留 {{token}}，服务端再统一替换为真实数据
  const PREVIEW_PLACEHOLDER_FILL = {
    title: '{{title}}', name: '{{name}}', certNo: '{{certNo}}',
    date: '{{date}}', company: '{{company}}', content: '{{content}}',
    subtitle: '{{subtitle}}'
  };

    // ── 12 套证书模板（6 竖版 + 6 横版，基于真实 PNG 图片） ──
  const CERT_TEMPLATES = [
    // ── 竖版（portrait） ──
    {
      key: 'v1', name: '翠竹', orientation: 'portrait',
      bg: "url('/uploads/cert-templates/cert-v1.png') center/cover no-repeat",
      titleColor: '#1a365d',   textColor: '#334155', subtitleColor: '#64748b',
      accentColor: '#2c5282',  sealColor: '#c2410c',
      fontFamily: "'STSong','SimSun','Times New Roman',serif",
      layoutHint: { titleY: 0.185, subtitleY: 0.27, nameY: 0.37, contentY: 0.41, companyY: 0.68, dateY: 0.73 }
    },
    {
      key: 'v2', name: '白玉', orientation: 'portrait',
      bg: "url('/uploads/cert-templates/cert-v2.png') center/cover no-repeat",
      titleColor: '#5d4e37',   textColor: '#57534e', subtitleColor: '#a8a29e',
      accentColor: '#78716c',  sealColor: '#b45309',
      fontFamily: "'STFangsong','FangSong','SimSun',serif",
      layoutHint: { titleY: 0.185, subtitleY: 0.27, nameY: 0.37, contentY: 0.41, companyY: 0.68, dateY: 0.73 }
    },
    {
      key: 'v3', name: '金辉', orientation: 'portrait',
      bg: "url('/uploads/cert-templates/cert-v3.png') center/cover no-repeat",
      titleColor: '#7c5c00',   textColor: '#4a3c1a', subtitleColor: '#8b7355',
      accentColor: '#b8860b',  sealColor: '#a16207',
      fontFamily: "'STKaiti','KaiTi','SimSun',serif",
      layoutHint: { titleY: 0.185, subtitleY: 0.27, nameY: 0.37, contentY: 0.41, companyY: 0.68, dateY: 0.73 }
    },
    {
      key: 'v4', name: '墨韵', orientation: 'portrait',
      bg: "url('/uploads/cert-templates/cert-v4.png') center/cover no-repeat",
      titleColor: '#1e3a5f',   textColor: '#334155', subtitleColor: '#64748b',
      accentColor: '#1e40af',  sealColor: '#be123c',
      fontFamily: "'STSong','SimSun','Times New Roman',serif",
      layoutHint: { titleY: 0.185, subtitleY: 0.27, nameY: 0.37, contentY: 0.41, companyY: 0.68, dateY: 0.73 }
    },
    {
      key: 'v5', name: '蔚蓝', orientation: 'portrait',
      bg: "url('/uploads/cert-templates/cert-v5.png') center/cover no-repeat",
      titleColor: '#166534',   textColor: '#3f4c3a', subtitleColor: '#6b8068',
      accentColor: '#15803d',  sealColor: '#b45309',
      fontFamily: "'STSong','SimSun','Times New Roman',serif",
      layoutHint: { titleY: 0.185, subtitleY: 0.27, nameY: 0.37, contentY: 0.41, companyY: 0.68, dateY: 0.73 }
    },
    {
      key: 'v6', name: '朝阳', orientation: 'portrait',
      bg: "url('/uploads/cert-templates/cert-v6.png') center/cover no-repeat",
      titleColor: '#92400e',   textColor: '#4a3c1a', subtitleColor: '#8b7355',
      accentColor: '#b8860b',  sealColor: '#a16207',
      fontFamily: "'STKaiti','KaiTi','SimSun',serif",
      layoutHint: { titleY: 0.185, subtitleY: 0.27, nameY: 0.37, contentY: 0.41, companyY: 0.68, dateY: 0.73 }
    },
    // ── 横版（landscape） ──
    {
      key: 'h1', name: '典藏', orientation: 'landscape',
      bg: "url('/uploads/cert-templates/cert-h1.png') center/cover no-repeat",
      titleColor: '#1a365d',   textColor: '#334155', subtitleColor: '#64748b',
      accentColor: '#2c5282',  sealColor: '#c2410c',
      fontFamily: "'STSong','SimSun','Times New Roman',serif",
      layoutHint: { titleY: 0.15, subtitleY: 0.27, nameY: 0.46, contentY: 0.47, companyY: 0.71, dateY: 0.77 }
    },
    {
      key: 'h2', name: '锦绣', orientation: 'landscape',
      bg: "url('/uploads/cert-templates/cert-h2.png') center/cover no-repeat",
      titleColor: '#5d4e37',   textColor: '#57534e', subtitleColor: '#a8a29e',
      accentColor: '#78716c',  sealColor: '#b45309',
      fontFamily: "'STFangsong','FangSong','SimSun',serif",
      layoutHint: { titleY: 0.15, subtitleY: 0.27, nameY: 0.46, contentY: 0.47, companyY: 0.71, dateY: 0.77 }
    },
    {
      key: 'h3', name: '丹霞', orientation: 'landscape',
      bg: "url('/uploads/cert-templates/cert-h3.png') center/cover no-repeat",
      titleColor: '#92400e',   textColor: '#4a3c1a', subtitleColor: '#8b7355',
      accentColor: '#b8860b',  sealColor: '#a16207',
      fontFamily: "'STKaiti','KaiTi','SimSun',serif",
      layoutHint: { titleY: 0.15, subtitleY: 0.27, nameY: 0.46, contentY: 0.47, companyY: 0.71, dateY: 0.77 }
    },
    {
      key: 'h4', name: '春晒', orientation: 'landscape',
      bg: "url('/uploads/cert-templates/cert-h4.png') center/cover no-repeat",
      titleColor: '#166534',   textColor: '#3f4c3a', subtitleColor: '#6b8068',
      accentColor: '#15803d',  sealColor: '#b45309',
      fontFamily: "'STSong','SimSun','Times New Roman',serif",
      layoutHint: { titleY: 0.15, subtitleY: 0.27, nameY: 0.46, contentY: 0.47, companyY: 0.71, dateY: 0.77 }
    },
    {
      key: 'h5', name: '银素', orientation: 'landscape',
      bg: "url('/uploads/cert-templates/cert-h5.png') center/cover no-repeat",
      titleColor: '#374151',   textColor: '#4b5563', subtitleColor: '#6b7280',
      accentColor: '#4b5563',  sealColor: '#b91c1c',
      fontFamily: "'Microsoft YaHei','PingFang SC',sans-serif",
      layoutHint: { titleY: 0.15, subtitleY: 0.27, nameY: 0.46, contentY: 0.47, companyY: 0.71, dateY: 0.77 }
    },
    {
      key: 'h6', name: '紫宸', orientation: 'landscape',
      bg: "url('/uploads/cert-templates/cert-h6.png') center/cover no-repeat",
      titleColor: '#5b21b6',   textColor: '#3b3654', subtitleColor: '#7e6f9e',
      accentColor: '#7c3aed',  sealColor: '#be185d',
      fontFamily: "'STSong','SimSun','Times New Roman',serif",
      layoutHint: { titleY: 0.15, subtitleY: 0.27, nameY: 0.46, contentY: 0.47, companyY: 0.71, dateY: 0.77 }
    }
  ];

  // 向后兼容：BG_PRESETS 从 CERT_TEMPLATES 提取（供 bgCss 查找）
  const BG_PRESETS = CERT_TEMPLATES.map(t => ({ key: t.key, name: t.name, css: t.bg }));

  // ── 预制印章样式 ──
  const SEAL_PRESETS = [
    { key: 'circle-red',    name: '圆形公章',   text: '认证专用章', color: '#c41e0f', size: 80,  shape: 'circle',   rotation: -12, css: 'border-radius:50%;border:3px solid {c};' },
    { key: 'square-red',    name: '方形印章',   text: '合格',       color: '#b91c1c', size: 72,  shape: 'square',   rotation: -3,  css: 'border-radius:3px;border:3px solid {c};' },
    { key: 'star-gold',     name: '五角徽章',   text: '荣誉证书',   color: '#b8860b', size: 78,  shape: 'star',      rotation: 0,   css: 'border-radius:50%;border:2px solid {c};background:rgba(184,134,11,.08);' },
    { key: 'oval-blue',     name: '椭圆认证',   text: 'OFFICIAL',   color: '#1e40af', size: 86,  shape: 'oval',      rotation: -8,  css: 'border-radius:50%;border:2px solid {c};' },
    { key: 'diamond-purple',name: '菱形防伪',   text: '已核验',     color: '#7c3aed', size: 70,  shape: 'diamond',   rotation: 45,  css: 'border-radius:6px;border:2px solid {c};background:rgba(124,58,235,.06);' },
    { key: 'round-green',   name: '绿色圆章',   text: '通过',       color: '#15803d', size: 76,  shape: 'circle',   rotation: -5,  css: 'border-radius:50%;border:3px solid {c};' }
  ];

  function uid() { return 'el' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function fillTokens(text, fill) {
    return String(text == null ? '' : text).replace(/\{\{(\w+)\}\}/g, (m, k) => (fill[k] !== undefined ? fill[k] : m));
  }
  // 行内混色渲染：【文字】→ 红色加粗 span，其余正常转义。无标记时等价于 escapeHtml(fillTokens(...))
  function normalizeColor(c) {
    if (!c) return null;
    c = String(c).trim();
    if (c.charAt(0) === '#') {
      if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
      if (/^#[0-9a-fA-F]{3}$/.test(c)) return '#' + c.slice(1).split('').map(x => x + x).join('').toLowerCase();
      return null;
    }
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) return '#' + [+m[1], +m[2], +m[3]].map(x => x.toString(16).padStart(2, '0')).join('');
    return null;
  }
  // 【文字】→ 默认红；【#rrggbb:文字】→ 指定颜色（均加粗，作为强调着色）
  function renderRichText(text, fill) {
    const t = fillTokens(text, fill);
    const esc = s => escapeHtml(s).replace(/\n/g, '<br>'); // 换行符转 <br>，否则 HTML 会把 \n 折叠成空格
    return String(t).split(/(【(?:#[0-9a-fA-F]{6}:)?[^】]*】)/g).map(p => {
      if (p.startsWith('【') && p.endsWith('】')) {
        const inner = p.slice(1, -1);
        const m = inner.match(/^#([0-9a-fA-F]{6}):(.*)$/);
        if (m) return '<span style="color:#' + m[1].toLowerCase() + ';font-weight:bold;">' + esc(m[2]) + '</span>';
        return '<span style="color:#c41e0f;font-weight:bold;">' + esc(inner) + '</span>';
      }
      return esc(p);
    }).join('');
  }
  // 将 contentEditable 产生的 HTML 转回 【】 标记（WYSIWYG 编辑保存用）
  function htmlToMarkup(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    temp.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
    temp.querySelectorAll('div').forEach(d => { d.replaceWith(document.createTextNode('\n' + d.textContent)); });
    const toMark = node => {
      const c = node.getAttribute('color') || node.style.color;
      const hex = normalizeColor(c);
      if (hex) {
        const prefix = (hex === '#c41e0f') ? '' : '#' + hex.slice(1).toLowerCase() + ':';
        node.replaceWith(document.createTextNode('【' + prefix + node.textContent + '】'));
      }
    };
    temp.querySelectorAll('font').forEach(toMark); // 部分浏览器用 <font color>
    temp.querySelectorAll('span').forEach(toMark);
    return temp.textContent || '';
  }
  function bgCss(bg) {
    if (!bg) return '#ffffff';
    if (typeof bg === 'string') return `background:${bg};`;
    if (bg.type === 'image') return `background-image:url('${bg.value}');background-size:cover;background-position:center;`;
    return `background:${BG_PRESETS.find(p => p.key === bg.value)?.css || '#fff'};`;
  }

  function buildDefaultDesign(tpl) {
    const pc = tpl.style.primaryColor, bc = tpl.style.borderColor;
    const ac = tpl.style.accentColor || bc, sc = tpl.style.sealColor || pc;
    const fn = tpl.style.fontFamily;
    return {
      _tpl: tpl.id,
      layout: tpl.layout || 'portrait',
      background: { type: 'preset', value: tpl.id },
      borderColor: bc, accentColor: ac, fontFamily: fn,
      elements: [
        { id: uid(), type: 'text', key: 'title', x: 18, y: 65, w: 384, h: 48, text: '{{title}}', fontSize: 32, fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', color: pc, underline: false, fontFamily: fn },
        { id: uid(), type: 'text', key: 'subtitle', x: 63, y: 113, w: 294, h: 20, text: 'CERTIFICATE OF HONORS', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', color: '#64748b', underline: false, fontFamily: 'Arial,sans-serif' },
        { id: uid(), type: 'text', key: 'name', x: 34, y: 160, w: 352, h: 38, text: '{{name}}', fontSize: 26, fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', color: pc, underline: true, fontFamily: fn },
        { id: uid(), type: 'text', key: 'content', x: 34, y: 220, w: 352, h: 130, text: '{{content}}', fontSize: 14, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left', lineHeight: 1.5, color: '#475569', underline: false, fontFamily: fn },
        { id: uid(), type: 'text', key: 'company', x: 200, y: 493, w: 185, h: 22, text: '{{company}}', fontSize: 13, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'right', color: '#475569', underline: false, fontFamily: fn },
        { id: uid(), type: 'text', key: 'date', x: 235, y: 523, w: 150, h: 22, text: '{{date}}', fontSize: 13, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'right', color: '#475569', underline: false, fontFamily: fn }
      ],
      seal: null
    };
  }

  // 设计 → 页面 HTML（预览 / 打印通用，scale 决定尺寸）
  function renderDesignPageInner(d, scale, fill) {
    const dims = EDITOR_PAGE[d.layout];
    const pw = dims.w * scale, ph = dims.h * scale;
    const bc = d.borderColor, ac = d.accentColor;
    let s = `<div class="cert-design-page" style="width:${pw}px;height:${ph}px;position:relative;overflow:hidden;${bgCss(d.background)}">`;
    s += `<div style="position:absolute;inset:${6 * scale}px;border:${2 * scale}px solid ${bc};opacity:0.4;pointer-events:none;"></div>`;
    s += `<div style="position:absolute;inset:${12 * scale}px;border:1px solid ${bc};opacity:0.22;pointer-events:none;"></div>`;
    [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']].forEach(([v, h]) => {
      s += `<div style="position:absolute;${v}:${10 * scale}px;${h}:${10 * scale}px;width:${10 * scale}px;height:${10 * scale}px;border-${v === 'top' ? 'top' : 'bottom'}:${3 * scale}px solid ${ac};border-${h}:${3 * scale}px solid ${ac};opacity:0.6;"></div>`;
    });
    (d.elements || []).forEach(el => {
      const fs = el.fontSize * scale;
      const lh = el.lineHeight != null ? el.lineHeight : (el.key === 'content' ? 1.5 : 1.2);
      // 使用 row flex + 内部 block 正常文本流。
      // column flex 会把 <br> 与着色 <span> 拆成匿名 flex 项，导致换行/居中/重叠异常；
      // inline-block 内层会导致 text-align 在部分浏览器中不被继承，因此改用 block。
      s += `<div class="cert-design-el" style="left:${el.x * scale}px;top:${el.y * scale}px;width:${el.w * scale}px;height:${el.h * scale}px;font-size:${fs}px;font-weight:${el.fontWeight};font-style:${el.fontStyle};color:${el.color};font-family:${el.fontFamily};letter-spacing:${el.letterSpacing || 0}px;display:flex;align-items:center;overflow:hidden;padding:${el.key === 'content' ? '0 4px' : '2px 6px'};box-sizing:border-box;"><div style="display:block;width:100%;text-align:${el.textAlign};line-height:${lh};text-decoration:${el.underline ? 'underline' : 'none'};">${renderRichText(el.text, fill)}</div></div>`;
    });
    if (d.seal) {
      const sz = d.seal.size * scale, fs2 = Math.max(8, sz * 0.16);
      s += `<div class="cert-design-seal" style="left:${d.seal.x * scale}px;top:${d.seal.y * scale}px;width:${sz}px;height:${sz}px;color:${d.seal.color};border:${3 * scale}px solid ${d.seal.color};font-family:${d.fontFamily};"><div style="font-size:${fs2}px;font-weight:700;line-height:1.1;">${escapeHtml(fillTokens(d.seal.text, fill))}</div></div>`;
    }
    s += '</div>';
    return s;
  }

  function renderDesignPreviewBox(design, boxW, boxH) {
    const dims = EDITOR_PAGE[design.layout];
    const scale = Math.min(boxW / dims.w, boxH / dims.h);
    const pageW = dims.w * scale, pageH = dims.h * scale;
    const offX = (boxW - pageW) / 2, offY = (boxH - pageH) / 2;
    return `<div style="position:relative;width:${boxW}px;height:${boxH}px;overflow:hidden;background:#f8fafc;">
      <div style="position:absolute;left:${offX}px;top:${offY}px;width:${pageW}px;height:${pageH}px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.18);">
        ${renderDesignPageInner(design, scale, EDITOR_SAMPLE)}
      </div></div>`;
  }

  // ---------- 编辑器打开 / 关闭 ----------
  function openCertificateEditor() {
    // 不再需要先选模板——直接用第一套模板（蓝韵防伪）作为默认
    const defaultTplKey = (editorState && editorState._tplKey) || CERT_TEMPLATES[0].key;
    // 先保留已编辑的文字内容（如有保存的设计），再按模板【最新 layoutHint】重建布局，
    // 确保坐标调整（如横版 nameY/contentY/company x 等）在每次打开时都生效，而不是沿用旧的保存位置。
    if (currentDesign && currentDesign._tplKey === defaultTplKey) {
      editorState = deepClone(currentDesign); // 含已编辑文字
    } else if (!editorState || editorState._tplKey !== defaultTplKey) {
      editorState = { _tplKey: '', layout: 'portrait', elements: [], seal: null, background: { type: 'preset', value: '' } };
    }
    applyTemplate(defaultTplKey); // 始终按最新 layoutHint 重建坐标，保留 existingTexts 中的文字
    openDrawerOverlay('certificate-editor-drawer-overlay');
    syncEditorUI();
    renderEditorPage();
    // 抽屉滑入动画期间布局可能未稳定，下一帧再适配一次确保不被裁剪
    requestAnimationFrame(() => fitStage());
  }
  function closeEditor() { closeDrawerOverlay('certificate-editor-drawer-overlay'); }

  function syncEditorUI() {
    const d = editorState;
    $('#et-orient-portrait')?.classList.toggle('active', d.layout === 'portrait');
    $('#et-orient-landscape')?.classList.toggle('active', d.layout === 'landscape');
    renderBgGrid();
    selectElement(null);
  }

  // ── 右侧模板选择列表（按当前方向过滤，单列滚动） ──
  function renderTemplateGrid() {
    const grid = $('#et-bg-grid'); if (!grid) return;
    const currentOrient = editorState.layout || 'portrait';
    const filtered = CERT_TEMPLATES.filter(t => t.orientation === currentOrient);
    grid.innerHTML = filtered.map(t => {
      const active = editorState._tplKey === t.key;
      return `
        <div class="cert-tpl-swatch ${active ? 'active' : ''}" data-tpl="${t.key}" title="${t.name}">
          <div class="cert-tpl-swatch-preview" style="background:${t.bg};border:2px solid #e2e8f0;">
          </div>
          <p class="cert-tpl-swatch-name">${t.name}</p>
        </div>`;
    }).join('');
    grid.querySelectorAll('[data-tpl]').forEach(sw => {
      sw.addEventListener('click', () => applyTemplate(sw.dataset.tpl));
    });
  }

  // ── 应用一套完整证书模板 ──
  function applyTemplate(tplKey) {
    const t = CERT_TEMPLATES.find(x => x.key === tplKey); if (!t) return;
    const dims = EDITOR_PAGE[editorState.layout];
    // 使用模板专属布局提示（基于背景装饰区域计算），回退到默认值
    const lh = t.layoutHint || {};
    const ty = (lh.titleY || 0.13) * dims.h;
    const sy = (lh.subtitleY || 0.19) * dims.h;
    const ny = (lh.nameY || 0.27) * dims.h;
    const cy = (lh.contentY || 0.34) * dims.h;
    const coy = (lh.companyY || 0.80) * dims.h;
    const dy = (lh.dateY || 0.85) * dims.h;

    // 保留用户已编辑的文字内容（如果已有）
    const existingTexts = {};
    (editorState.elements || []).forEach(el => { if (el.type === 'text' && el.key) existingTexts[el.key] = el.text; });

    editorState._tplKey = tplKey;
    editorState.background = { type: 'preset', value: t.key };
    // 根据模板方向自动切换画布尺寸
    if (t.orientation) {
      editorState.layout = t.orientation;
      $('#et-orient-portrait')?.classList.toggle('active', t.orientation === 'portrait');
      $('#et-orient-landscape')?.classList.toggle('active', t.orientation === 'landscape');
    }
    editorState.accentColor = t.accentColor;
    editorState.fontFamily = t.fontFamily;
    editorState.titleColor = t.titleColor;
    editorState.subtitleColor = t.subtitleColor;
    editorState.textColor = t.textColor;
    editorState.sealColor = t.sealColor;

    // 构建默认元素（使用模板配色 + 模板专属坐标）
    // 竖版需要更大左右内边距避免与花边重叠，横版稍窄
    const padX = editorState.layout === 'portrait' ? dims.w * 0.14 : dims.w * 0.10;
    const innerW = dims.w - padX * 2; // 内容区宽度
    const isLand = editorState.layout === 'landscape';
    editorState.elements = [
      { id: uid(), type: 'text', key: 'title',
        x: padX, y: Math.round(ty), w: Math.round(innerW), h: isLand ? 46 : 52,
        text: existingTexts['title'] || '{{title}}',
        fontSize: isLand ? 34 : 38, fontWeight: 'bold', letterSpacing: isLand ? 3 : 4, fontStyle: 'normal', textAlign: 'center',
        color: t.titleColor, underline: false, fontFamily: t.fontFamily },
      { id: uid(), type: 'text', key: 'subtitle',
        x: padX, y: Math.round(sy), w: Math.round(innerW), h: 20,
        text: existingTexts['subtitle'] || 'CERTIFICATE OF HONORS',
        fontSize: 12, fontWeight: 'normal', letterSpacing: 2, fontStyle: 'normal', textAlign: 'center',
        color: '#64748b', underline: false, fontFamily: 'Arial,sans-serif' },
      { id: uid(), type: 'text', key: 'name',
        x: padX, y: Math.round(ny), w: Math.round(isLand ? innerW * 0.55 : innerW * 0.60), h: 24,
        text: existingTexts['name'] || '{{name}}',
        fontSize: 15, fontWeight: 'bold', fontStyle: 'normal', textAlign: 'left',
        color: t.textColor, underline: true, fontFamily: t.fontFamily },
      { id: uid(), type: 'text', key: 'content',
        x: padX, y: Math.round(cy), w: Math.round(innerW), h: isLand ? 100 : 120,
        text: existingTexts['content'] || (isLand
          ? '\u3000\u3000在本公司工作期间，认真负责，表现优秀，现授予【年度优秀员工】荣誉\n称号。特发此证，以示表彰。'
          : '\u3000\u3000在本公司工作期间，认真负责，表现\n优秀，现授予【年度优秀员工】荣誉称号。特\n发此证，以示表彰。'),
        fontSize: 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left', lineHeight: isLand ? 1.5 : 2,
        color: t.textColor, underline: false, fontFamily: t.fontFamily },
      { id: uid(), type: 'text', key: 'company',
        x: Math.round(padX + innerW * (isLand ? 0.55 : 0.30)), y: Math.round(coy), w: Math.round(innerW * (isLand ? 0.45 : 0.70)), h: 22,
        text: existingTexts['company'] || '{{company}}',
        fontSize: isLand ? 13 : 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'right',
        color: t.textColor, underline: false, fontFamily: t.fontFamily },
      { id: uid(), type: 'text', key: 'date',
        x: Math.round(padX + innerW * (isLand ? 0.60 : 0.35)), y: Math.round(dy), w: Math.round(innerW * (isLand ? 0.40 : 0.65)), h: 22,
        text: existingTexts['date'] || '{{date}}',
        fontSize: isLand ? 13 : 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'right',
        color: t.textColor, underline: false, fontFamily: t.fontFamily }
    ];
    // 默认不添加印章（用户可手动添加）
    editorState.seal = null;

    syncEditorUI();
    renderEditorPage();
  }

  // 向后兼容旧名
  function renderBgGrid() { renderTemplateGrid(); }

  // ---------- 画布渲染（可交互） ----------
  function handleHTML() {
    return `<div class="cert-el-move" data-move="1" title="拖动移动"></div>` +
      ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map(dir =>
      `<div class="cert-el-handle ${dir}" data-dir="${dir}"></div>`).join('');
  }
  function createTextNode(el) {
    const node = document.createElement('div');
    node.className = 'cert-el';
    node.dataset.id = el.id;
    applyTextNodeStyle(node, el);
    const lh = el.lineHeight != null ? el.lineHeight : (el.key === 'content' ? 1.5 : 1.2);
    node.innerHTML = `<div class="cert-el-text" style="display:block;width:100%;text-align:${el.textAlign};line-height:${lh};text-decoration:${el.underline ? 'underline' : 'none'};">${renderRichText(el.text, EDITOR_SAMPLE)}</div>` + handleHTML();
    return node;
  }
  function applyTextNodeStyle(node, el) {
    node.style.left = el.x + 'px'; node.style.top = el.y + 'px';
    node.style.width = el.w + 'px'; node.style.height = el.h + 'px';
    node.style.fontSize = el.fontSize + 'px';
    node.style.fontWeight = el.fontWeight; node.style.fontStyle = el.fontStyle;
    node.style.color = el.color; node.style.fontFamily = el.fontFamily;
    node.style.display = 'flex'; node.style.alignItems = 'center'; node.style.overflow = 'hidden';
    node.style.boxSizing = 'border-box';
    // 旧版本可能在外层遗留 text-align/line-height/text-decoration，先清空再以内层为准
    node.style.textAlign = ''; node.style.lineHeight = ''; node.style.textDecoration = '';
    if (el.letterSpacing) node.style.letterSpacing = el.letterSpacing + 'px';
    node.style.padding = el.key === 'content' ? '0 4px' : '2px 6px';
    const text = node.querySelector('.cert-el-text');
    if (text) {
      const lh = el.lineHeight != null ? el.lineHeight : (el.key === 'content' ? 1.5 : 1.2);
      text.style.display = 'block'; text.style.width = '100%';
      text.style.textAlign = el.textAlign; text.style.lineHeight = lh;
      text.style.textDecoration = el.underline ? 'underline' : 'none';
    }
  }
  function createSealNode(seal) {
    const node = document.createElement('div');
    node.className = 'cert-seal';
    node.dataset.id = 'seal';
    applySealNodeStyle(node, seal);
    const fs = Math.max(10, seal.size * 0.16);
    // 根据形状类型渲染不同的内部结构
    const shape = seal.shape || 'circle';
    let innerHtml = '';
    if (shape === 'star') {
      innerHtml = `<div class="cs-star">★</div><span class="cs-text">${escapeHtml(fillTokens(seal.text, EDITOR_SAMPLE))}</span>`;
    } else if (shape === 'diamond') {
      innerHtml = `<span class="cs-text cs-diamond-text">${escapeHtml(fillTokens(seal.text, EDITOR_SAMPLE))}</span>`;
    } else {
      innerHtml = `<span class="cs-text">${escapeHtml(fillTokens(seal.text, EDITOR_SAMPLE))}</span>`;
    }
    node.innerHTML = innerHtml +
      ['nw', 'ne', 'sw', 'se'].map(dir => `<div class="cert-el-handle ${dir}" data-dir="${dir}"></div>`).join('');
    const textEl = node.querySelector('.cs-text');
    if (textEl) textEl.style.fontSize = fs + 'px';
    return node;
  }
  function applySealNodeStyle(node, seal) {
    node.style.left = seal.x + 'px'; node.style.top = seal.y + 'px';
    node.style.width = seal.size + 'px'; node.style.height = seal.size + 'px';
    node.style.color = seal.color; node.style.fontFamily = editorState.fontFamily;
    // 应用形状样式
    const shape = seal.shape || 'circle';
    const c = seal.color;
    let baseCss = '';
    switch (shape) {
      case 'circle': baseCss = `border-radius:50%;border:3px solid ${c};`; break;
      case 'square': baseCss = `border-radius:3px;border:3px solid ${c};`; break;
      case 'star': baseCss = `border-radius:50%;border:2px solid ${c};background:rgba(184,134,11,.08);`; break;
      case 'oval': baseCss = `border-radius:50%;border:2px solid ${c};`; break;
      case 'diamond': baseCss = `border-radius:6px;border:2px solid ${c};background:rgba(124,58,235,.06);`; break;
      default: baseCss = `border-radius:50%;border:3px solid ${c};`;
    }
    node.style.cssText += baseCss;
    const rot = seal.rotation !== undefined ? seal.rotation : (shape === 'square' ? -3 : -12);
    node.style.transform = `rotate(${rot}deg)`;
  }
  // ── 应用印章预设 ──
  function applySealPreset(presetKey) {
    const p = SEAL_PRESETS.find(s => s.key === presetKey);
    if (!p) return;
    const dims = EDITOR_PAGE[editorState.layout];
    editorState.seal = {
      id: 'seal',
      text: p.text,
      x: Math.round(dims.w - p.size - 20),
      y: Math.round(dims.h - p.size - 20),
      size: p.size,
      color: p.color,
      shape: p.shape,
      rotation: p.rotation
    };
    // 替换画布上的印章节点
    const old = document.querySelector('#et-page [data-id="seal"]');
    if (old) old.remove();
    const node = createSealNode(editorState.seal);
    $('#et-page').appendChild(node);
    attachEl(node, editorState.seal, true);
    selectElement('seal');
    // 更新属性面板中的值
    $('#et-prop-seal-text').value = p.text;
    $('#et-prop-seal-size').value = p.size;
    $('#et-prop-seal-color').value = p.color;
    // 高亮当前选中预设
    renderSealPresets();
  }
  // ── 渲染印章预设选择器 ──
  function renderSealPresets() {
    const container = $('#et-seal-presets');
    if (!container) return;
    const curShape = editorState.seal?.shape || 'circle';
    const curColor = editorState.seal?.color || '';
    container.innerHTML = SEAL_PRESETS.map(p => {
      // 匹配逻辑：shape+color 最接近的算 active
      const isActive = (editorState.seal &&
        ((p.shape === curShape && p.color === curColor) ||
         (p.key === editorState.seal._presetKey)));
      return `<button class="et-seal-preset-btn ${isActive ? 'active' : ''}" data-preset="${p.key}" title="${p.name}">
        <div class="et-spb-preview" style="width:36px;height:36px;border:${p.shape==='square'?'3px':'2px'} solid ${p.color};border-radius:${p.shape==='square'?'3px':'50%'};transform:rotate(${p.rotation}deg);display:flex;align-items:center;justify-content:center;color:${p.color};font-size:7px;font-weight:700;background:${p.shape==='star'||p.shape==='diamond'?p.color+'14':''};">
          ${p.shape==='star'?'★':p.text.slice(0,2)}
        </div>
        <span>${p.name}</span>
      </button>`;
    }).join('');
    container.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => applySealPreset(btn.dataset.preset));
    });
  }

  function renderEditorPage() {
    const page = $('#et-page'); if (!page) return;
    const d = editorState;
    const dims = EDITOR_PAGE[d.layout];

    // 设置页面容器尺寸与背景
    page.style.width = dims.w + 'px';
    page.style.height = dims.h + 'px';
    page.style.cssText += bgCss(d.background);
    page.innerHTML = '';
    (d.elements || []).forEach(el => {
      const node = createTextNode(el);
      page.appendChild(node);
      attachEl(node, el);
    });
    if (d.seal) {
      const sn = createSealNode(d.seal);
      page.appendChild(sn);
      attachEl(sn, d.seal, true);
    }
    selectElement(null);
    fitStage();
  }

  // 让画布自动适配编辑区：竖版较高时按比例缩小，保证整张证书完整可见、不被上下裁剪
  function fitStage() {
    const stage = $('#et-stage'), fit = $('#et-fit'), page = $('#et-page');
    if (!stage || !fit || !page) return;
    const d = EDITOR_PAGE[editorState.layout];
    const pad = 64; // 与 .cert-editor-stage 的 padding:32px*2 一致
    const availW = Math.max(50, stage.clientWidth - pad);
    const availH = Math.max(50, stage.clientHeight - pad);
    const s = Math.min(availW / d.w, availH / d.h, 1); // 只缩小不放大
    page.style.transform = 'scale(' + s + ')';
    fit.style.width = (d.w * s) + 'px';
    fit.style.height = (d.h * s) + 'px';
  }

  // ---------- 元素事件：拖拽 / 缩放 / 选中 / 编辑 ----------
  let dragState = null;
  function openTextEdit(node, el) {
    const span = node.querySelector('.cert-el-text');
    if (!span || span.isContentEditable) return;
    // WYSIWYG 编辑：保持渲染后的 HTML（红字 span 可见），不切换到原始标记
    span.setAttribute('contenteditable', 'true');
    span.focus();
    // 光标置于末尾（不自动全选，防止误按键全删）
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(span);
    range.collapse(false); // 光标置于末尾
    sel.addRange(range);
    activeEdit = { node, el, span };
    span.addEventListener('blur', onEditBlur);
  }
  function onEditBlur() {
    if (!activeEdit) return;
    const { node, el, span } = activeEdit;
    if (!span.isContentEditable) return;
    // 将 contentEditable 产生的 HTML 转回 【】 标记保存
    el.text = htmlToMarkup(span.innerHTML);
    span.removeAttribute('contenteditable');
    span.removeEventListener('blur', onEditBlur);
    activeEdit = null;
    refreshTextNode(node, el);
    syncPropPanel();
  }
  function commitActiveEdit() {
    if (activeEdit) activeEdit.span.blur();
  }
  function attachEl(node, el, isSeal) {
    node.addEventListener('mousedown', e => onElMouseDown(e, el, isSeal, node));
    if (!isSeal) {
      node.addEventListener('dblclick', e => {
        e.preventDefault();
        selectElement(el.id);
        openTextEdit(node, el);
      });
    }
  }
  function onElMouseDown(e, el, isSeal, node) {
    if (e.target.isContentEditable) return; // 正在编辑文字，交给浏览器处理
    // 先保存并退出当前正在编辑的文字（防止 preventDefault 阻止 blur）
    const editing = document.querySelector('#et-page [contenteditable="true"]');
    if (editing) editing.blur();
    e.preventDefault(); e.stopPropagation();
    // 选中元素（单击 = 选中，双击 = 编辑文字，和 Canva/Figma 一致）
    const handle = e.target.closest('[data-dir]');
    selectElement(isSeal ? 'seal' : el.id);
    const page = $('#et-page');
    const rect = page.getBoundingClientRect();
    const scale = rect.width / EDITOR_PAGE[editorState.layout].w;
    if (handle) {
      dragState = { mode: 'resize', dir: handle.dataset.dir, id: isSeal ? 'seal' : el.id, isSeal, startX: e.clientX, startY: e.clientY, orig: isSeal ? { ...editorState.seal } : { ...el } };
    } else {
      const cur = isSeal ? editorState.seal : el;
      dragState = { mode: 'move', id: isSeal ? 'seal' : el.id, isSeal, startX: e.clientX, startY: e.clientY, ox: cur.x, oy: cur.y };
    }
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }
  function onDragMove(e) {
    if (!dragState) return;
    const page = $('#et-page');
    const rect = page.getBoundingClientRect();
    const scale = rect.width / EDITOR_PAGE[editorState.layout].w;
    const dx = (e.clientX - dragState.startX) / scale;
    const dy = (e.clientY - dragState.startY) / scale;
    const dims = EDITOR_PAGE[editorState.layout];
    const node = page.querySelector(`[data-id="${dragState.id}"]`);
    if (dragState.mode === 'move') {
      const cur = dragState.isSeal ? editorState.seal : editorState.elements.find(x => x.id === dragState.id);
      const w = dragState.isSeal ? cur.size : cur.w;
      const h = dragState.isSeal ? cur.size : cur.h;
      cur.x = clamp(dragState.ox + dx, 0, dims.w - w);
      cur.y = clamp(dragState.oy + dy, 0, dims.h - h);
      node.style.left = cur.x + 'px'; node.style.top = cur.y + 'px';
    } else {
      const o = dragState.orig;
      if (dragState.isSeal) {
        const ns = clamp(o.size + (dx + dy), 30, 220);
        editorState.seal.size = ns;
        editorState.seal.x = clamp(o.x + (o.size - ns) / 2, 0, dims.w - ns);
        editorState.seal.y = clamp(o.y + (o.size - ns) / 2, 0, dims.h - ns);
        refreshSealNode();
      } else {
        let { x, y, w, h } = o;
        if (dragState.dir.includes('e')) w = o.w + dx;
        if (dragState.dir.includes('w')) { x = o.x + dx; w = o.w - dx; }
        if (dragState.dir.includes('s')) h = o.h + dy;
        if (dragState.dir.includes('n')) { y = o.y + dy; h = o.h - dy; }
        w = Math.max(24, w); h = Math.max(18, h);
        const el = editorState.elements.find(x => x.id === dragState.id);
        el.x = clamp(x, 0, dims.w - w); el.y = clamp(y, 0, dims.h - h);
        el.w = w; el.h = h;
        refreshTextNode(node, el);
      }
    }
  }
  function onDragEnd() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    if (dragState && (dragState.mode === 'resize')) syncPropPanel();
    dragState = null;
  }
  function refreshTextNode(node, el) {
    applyTextNodeStyle(node, el);
    const span = node.querySelector('.cert-el-text');
    if (span && !span.isContentEditable) span.innerHTML = renderRichText(el.text, EDITOR_SAMPLE);
  }
  function refreshSealNode() {
    const node = $('#et-page [data-id="seal"]');
    if (node) { applySealNodeStyle(node, editorState.seal); const t = node.querySelector('.cs-text'); if (t) { t.textContent = fillTokens(editorState.seal.text, EDITOR_SAMPLE); t.style.fontSize = Math.max(10, editorState.seal.size * 0.16) + 'px'; } }
  }

  // ---------- 选中 / 属性面板 ----------
  function selectElement(id) {
    selectedElId = id;
    document.querySelectorAll('#et-page .cert-el, #et-page .cert-seal').forEach(n => n.classList.remove('selected'));
    if (id) { const node = document.querySelector(`#et-page [data-id="${id}"]`); if (node) node.classList.add('selected'); }
    syncPropPanel();
  }
  function selEl() {
    if (selectedElId === 'seal') return editorState.seal;
    if (selectedElId) return editorState.elements.find(x => x.id === selectedElId);
    return null;
  }
  function syncPropPanel() {
    const el = selEl();
    const empty = $('#et-prop-empty'), tg = $('#et-prop-text-group'), sg = $('#et-prop-seal-group');
    if (!el) { empty.classList.remove('hidden'); tg.classList.add('hidden'); sg.classList.add('hidden'); return; }
    empty.classList.add('hidden');
    if (selectedElId === 'seal') {
      tg.classList.add('hidden'); sg.classList.remove('hidden');
      $('#et-prop-seal-text').value = editorState.seal.text;
      $('#et-prop-seal-size').value = editorState.seal.size;
      $('#et-prop-seal-color').value = editorState.seal.color;
      renderSealPresets();
    } else {
      sg.classList.add('hidden'); tg.classList.remove('hidden');
      $('#et-prop-text').value = el.text;
      $('#et-prop-size').value = el.fontSize;
      $('#et-prop-color').value = el.color;
    }
    syncToolbarState();
  }
  function syncToolbarState() {
    const el = selEl(); if (!el || selectedElId === 'seal') {
      $('#et-bold').classList.remove('active'); $('#et-italic').classList.remove('active'); $('#et-underline').classList.remove('active');
      return;
    }
    $('#et-bold').classList.toggle('active', el.fontWeight === 'bold');
    $('#et-italic').classList.toggle('active', el.fontStyle === 'italic');
    $('#et-underline').classList.toggle('active', !!el.underline);
    $('#et-align-l').classList.toggle('active', el.textAlign === 'left');
    $('#et-align-c').classList.toggle('active', el.textAlign === 'center');
    $('#et-align-r').classList.toggle('active', el.textAlign === 'right');
    $('#et-font').value = el.fontFamily;
    $('#et-size').value = el.fontSize;
    const lhSel = $('#et-lineheight'); if (lhSel) lhSel.value = String(el.lineHeight != null ? el.lineHeight : (el.key === 'content' ? 1.5 : 1.2));
    const prev = $('#et-color-prev'); if (prev) prev.style.background = el.color;
  }

  // ---------- 工具栏操作 ----------
  function applyTextStyle(prop, value) {
    const el = selEl(); if (!el || selectedElId === 'seal') return;
    el[prop] = value;
    const node = document.querySelector(`#et-page [data-id="${el.id}"]`);
    if (node) refreshTextNode(node, el);
    syncToolbarState();
  }
  function toggleTextStyle(prop, on, off) {
    const el = selEl(); if (!el || selectedElId === 'seal') return;
    applyTextStyle(prop, el[prop] === on ? off : on);
  }
  // 字体颜色色板
  function buildColorSwatches() {
    const box = $('#et-color-swatches'); if (!box) return;
    box.innerHTML = '';
    COLOR_PRESETS.forEach(c => {
      const b = document.createElement('div');
      b.className = 'et-color-swatch';
      b.style.background = c;
      b.dataset.color = c;
      b.title = c;
      box.appendChild(b);
    });
  }
  // 给当前编辑中的局部选区着色（返回是否命中选区）
  function applyColorToSelection(color) {
    if (!activeEdit) return false;
    const span = activeEdit.span;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    if (!span.contains(sel.anchorNode) || !span.contains(sel.focusNode)) return false;
    try { document.execCommand('foreColor', false, color); } catch (e) {}
    activeEdit.el.text = htmlToMarkup(span.innerHTML);
    return true;
  }
  // 统一入口：编辑中有选区→局部着色；否则整段改色
  function applyFontColor(color) {
    color = color || '#1f2937';
    const span = document.querySelector('#et-page [contenteditable="true"]');
    const sel = window.getSelection();
    const editingSel = span && sel && sel.rangeCount > 0 && !sel.isCollapsed &&
      span.contains(sel.anchorNode) && span.contains(sel.focusNode);
    if (editingSel) {
      applyColorToSelection(color);
    } else {
      commitActiveEdit();
      applyTextStyle('color', color);
    }
    const prev = $('#et-color-prev'); if (prev) prev.style.background = color;
    const pc = $('#et-prop-color'); if (pc) pc.value = color;
  }
  function addTextElement() {
    const dims = EDITOR_PAGE[editorState.layout];
    const el = { id: uid(), type: 'text', x: Math.round(dims.w / 2 - 90), y: Math.round(dims.h / 2 - 16), w: 180, h: 32, text: '新文字', fontSize: 18, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', color: editorState.borderColor, underline: false, fontFamily: editorState.fontFamily };
    editorState.elements.push(el);
    const node = createTextNode(el); $('#et-page').appendChild(node); attachEl(node, el);
    selectElement(el.id);
  }
  function addSealElement() {
    const dims = EDITOR_PAGE[editorState.layout];
    editorState.seal = { id: 'seal', text: '考试合', x: Math.round(dims.w - 110), y: Math.round(dims.h - 110), size: 80, color: editorState.accentColor };
    const old = document.querySelector('#et-page [data-id="seal"]'); if (old) old.remove();
    const node = createSealNode(editorState.seal); $('#et-page').appendChild(node); attachEl(node, editorState.seal, true);
    selectElement('seal');
  }
  function deleteSelected() {
    if (selectedElId === 'seal') { editorState.seal = null; const n = document.querySelector('#et-page [data-id="seal"]'); if (n) n.remove(); selectElement(null); return; }
    if (!selectedElId) return;
    editorState.elements = editorState.elements.filter(x => x.id !== selectedElId);
    const n = document.querySelector(`#et-page [data-id="${selectedElId}"]`); if (n) n.remove();
    selectElement(null);
  }
  function bringToFront() {
    if (!selectedElId) return;
    const node = document.querySelector(`#et-page [data-id="${selectedElId}"]`);
    if (node) node.parentNode.appendChild(node);
  }
  function setLayout(orient) {
    editorState.layout = orient;
    const dims = EDITOR_PAGE[orient];
    (editorState.elements || []).forEach(el => {
      el.x = clamp(el.x, 0, dims.w - el.w); el.y = clamp(el.y, 0, dims.h - el.h);
    });
    if (editorState.seal) {
      editorState.seal.x = clamp(editorState.seal.x, 0, dims.w - editorState.seal.size);
      editorState.seal.y = clamp(editorState.seal.y, 0, dims.h - editorState.seal.size);
    }
    renderEditorPage();
    // 切换方向后刷新模版列表，若当前模版方向不匹配则自动选第一个对应方向的模版
    const curTpl = CERT_TEMPLATES.find(x => x.key === editorState._tplKey);
    if (!curTpl || curTpl.orientation !== orient) {
      const first = CERT_TEMPLATES.find(x => x.orientation === orient);
      if (first) { applyTemplate(first.key); return; }
    }
    renderBgGrid();
    $('#et-orient-portrait').classList.toggle('active', orient === 'portrait');
    $('#et-orient-landscape').classList.toggle('active', orient === 'landscape');
  }
  function setBackground(type, value) {
    editorState.background = { type, value };
    renderEditorPage();
    renderBgGrid();
  }
  function onBgUpload(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setBackground('image', reader.result); };
    reader.readAsDataURL(file);
  }
  function applyEditorDesign() {
    currentDesign = deepClone(editorState);
    closeEditor();
    updateTemplatePreview();
  }

  // ===== 初始化绑定 =====
  function init() {
    document.addEventListener('click', function (e) {
      const target = e.target.closest('[data-cert-action]');
      if (!target) return;
      const action = target.dataset.certAction;
      const id = target.dataset.certId;
      if (action === 'edit') openCertificateModal(id);
      if (action === 'detail') openCertificateDetail(id);
      if (action === 'issue') openIssueModal(id);
      if (action === 'toggle') toggleCertificateStatus(id);
      if (action === 'delete') deleteCertificate(id);
    });

    $('#cert-validity-type')?.addEventListener('change', toggleValidityDays);
    $('#cert-save-btn')?.addEventListener('click', saveCertificate);
    $('#cert-cancel-btn')?.addEventListener('click', closeCertificateModal);
    $('#cert-template-confirm')?.addEventListener('click', confirmTemplateSelection);
    $('#cert-template-cancel')?.addEventListener('click', () => closeModal('certificate-template-modal'));
    $('#cert-search-btn')?.addEventListener('click', loadCertificates);
    $('#cert-search-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadCertificates(); });
    $('#cert-status-filter')?.addEventListener('change', loadCertificates);
    $('#cert-dept-filter')?.addEventListener('change', loadCertificates);
    $('#cert-new-btn')?.addEventListener('click', () => openCertificateModal());

    // 编辑器
    $('#cert-design-editor-btn')?.addEventListener('click', openCertificateEditor);
    $('#et-add-text')?.addEventListener('click', addTextElement);
    $('#et-add-seal')?.addEventListener('click', addSealElement);
    $('#et-bold')?.addEventListener('click', () => toggleTextStyle('fontWeight', 'bold', 'normal'));
    $('#et-italic')?.addEventListener('click', () => toggleTextStyle('fontStyle', 'italic', 'normal'));
    $('#et-underline')?.addEventListener('click', () => toggleTextStyle('underline', true, false));
    $('#et-align-l')?.addEventListener('click', () => applyTextStyle('textAlign', 'left'));
    $('#et-align-c')?.addEventListener('click', () => applyTextStyle('textAlign', 'center'));
    $('#et-align-r')?.addEventListener('click', () => applyTextStyle('textAlign', 'right'));
    $('#et-size')?.addEventListener('input', e => applyTextStyle('fontSize', parseInt(e.target.value) || 16));
    $('#et-lineheight')?.addEventListener('change', e => applyTextStyle('lineHeight', parseFloat(e.target.value) || 1.5));
    $('#et-font')?.addEventListener('change', e => applyTextStyle('fontFamily', e.target.value));
    $('#et-delete')?.addEventListener('click', deleteSelected);
    $('#et-bringfront')?.addEventListener('click', bringToFront);
    // 字体颜色：色板弹层 + 选区/整段着色
    buildColorSwatches();
    $('#et-color-btn')?.addEventListener('mousedown', e => e.preventDefault()); // 保持编辑框焦点与选区
    $('#et-color-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const pop = $('#et-color-pop'); if (!pop) return;
      pop.classList.toggle('open');
      const cur = (selEl() && selEl().color) || '#1f2937';
      $$('#et-color-swatches .et-color-swatch').forEach(s => s.classList.toggle('active', !!s.dataset.color && s.dataset.color.toLowerCase() === String(cur).toLowerCase()));
    });
    $('#et-color-swatches')?.addEventListener('mousedown', e => { const sw = e.target.closest('.et-color-swatch'); if (sw) e.preventDefault(); });
    $('#et-color-swatches')?.addEventListener('click', e => {
      const sw = e.target.closest('.et-color-swatch'); if (!sw) return;
      applyFontColor(sw.dataset.color);
      $('#et-color-pop')?.classList.remove('open');
    });
    document.addEventListener('click', e => {
      const pop = $('#et-color-pop'); if (!pop) return;
      if (!e.target.closest('.et-color-wrap')) pop.classList.remove('open');
    });
    $('#et-orient-portrait')?.addEventListener('click', () => setLayout('portrait'));
    $('#et-orient-landscape')?.addEventListener('click', () => setLayout('landscape'));
    $('#et-bg-upload')?.addEventListener('change', onBgUpload);
    $('#et-apply')?.addEventListener('click', applyEditorDesign);
    $('#et-cancel')?.addEventListener('click', closeEditor);
    $('#et-prop-text')?.addEventListener('input', e => { const el = selEl(); if (el) { el.text = e.target.value; const n = document.querySelector(`#et-page [data-id="${el.id}"]`); if (n) refreshTextNode(n, el); } });
    $('#et-prop-size')?.addEventListener('input', e => { const el = selEl(); if (el) { el.fontSize = parseInt(e.target.value) || 16; const n = document.querySelector(`#et-page [data-id="${el.id}"]`); if (n) refreshTextNode(n, el); } });
    $('#et-prop-color')?.addEventListener('input', e => { const el = selEl(); if (el) { el.color = e.target.value; const n = document.querySelector(`#et-page [data-id="${el.id}"]`); if (n) refreshTextNode(n, el); } });
    $('#et-prop-seal-text')?.addEventListener('input', e => { if (editorState.seal) { editorState.seal.text = e.target.value; refreshSealNode(); } });
    $('#et-prop-seal-size')?.addEventListener('input', e => { if (editorState.seal) { editorState.seal.size = clamp(parseInt(e.target.value) || 80, 30, 220); refreshSealNode(); } });
    $('#et-prop-seal-color')?.addEventListener('input', e => { if (editorState.seal) { editorState.seal.color = e.target.value; refreshSealNode(); } });
    $('#et-stage')?.addEventListener('mousedown', e => { if (e.target.id === 'et-stage' || e.target.id === 'et-page') { const ed = document.querySelector('#et-page [contenteditable="true"]'); if (ed) ed.blur(); selectElement(null); } });

    // 键盘 Delete / Backspace 删除选中元素
    document.addEventListener('keydown', e => {
      // 只在编辑器打开时响应
      if (!$('#et-stage')?.offsetParent) return;
      // 编辑文字时绝不拦截退格/删除键（多重守卫）
      const active = document.activeElement;
      if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (document.querySelector('#et-page [contenteditable="true"]')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElId) {
        e.preventDefault();
        deleteSelected();
      }
    });

    // 窗口尺寸变化时重新适配画布（竖版/横版切换、缩放窗口都不会被裁剪）
    window.addEventListener('resize', () => fitStage());

    // Token 标签点击插入动态参数
    $$('.cert-token-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const el = selEl();
        if (!el || selectedElId === 'seal') return;
        const token = chip.dataset.token;
        el.text += token;
        const n = document.querySelector(`#et-page [data-id="${el.id}"]`);
        if (n) refreshTextNode(n, el);
        $('#et-prop-text').value = el.text;
      });
    });

    $$('.cert-detail-tab').forEach(btn => {
      btn.addEventListener('click', () => switchDetailTab(btn.dataset.tab));
    });
  }

  // 暴露到全局
  window.CertificateMgmt = {
    init,
    loadCertificates,
    loadTemplates,
    openCertificateModal,
    closeCertificateModal,
    openTemplatePicker,
    selectTemplate,
    confirmTemplateSelection,
    openCertificateDetail,
    closeCertificateDetail,
    switchDetailTab,
    revokeUserCertificate,
    openIssueModal,
    deleteCertificate,
    toggleCertificateStatus,
    printCertificate,
    renderCertificateHTML,
    openCertificateEditor,
    closeEditor,
    renderDesignPageInner,
    printScale,
    toggleCertSelect,
    toggleCertSelectAll,
    updateCertSelectAllState,
    updateCertBatchActionBar,
    clearCertSelection,
    batchDeleteCertificates
  };

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
