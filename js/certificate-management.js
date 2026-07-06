/**
 * 证书管理模块前端逻辑
 * 内嵌在 dashboard.html 的 tab-certificates 中使用
 */

(function () {
  'use strict';

  // ===== 状态 =====
  let certificates = [];
  let templates = [];
  let users = [];
  let currentDetailCertificate = null;
  let currentDetailTab = 'active';
  let selectedTemplateId = '';
  let editingCertificateId = null;

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

  async function loadUsers() {
    const res = await apiGet('/api/data/users');
    users = res || [];
  }

  // ===== 渲染证书列表 =====
  function renderCertificateList() {
    const tbody = $('#certificate-list-body');
    if (!tbody) return;

    if (certificates.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">暂无证书，点击「新建证书」创建</td></tr>`;
      return;
    }

    tbody.innerHTML = certificates.map(cert => {
      const statusBadge = cert.status === 'enabled'
        ? '<span class="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">启用</span>'
        : '<span class="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">停用</span>';
      const validityText = cert.validityType === 'permanent' ? '永久有效' : `固定期限（${cert.validityDays}天）`;
      return `
        <tr class="border-b hover:bg-slate-50">
          <td class="px-4 py-3 text-sm">${escapeHtml(cert.name)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(cert.dept || '-')}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${validityText}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${cert.activeCount || 0}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${cert.expiredCount || 0}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(cert.creator || '-')}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${formatDateTime(cert.createdAt)}</td>
          <td class="px-4 py-3 text-sm">${statusBadge}</td>
          <td class="px-4 py-3 text-sm">
            <div class="flex items-center space-x-2">
              <button onclick="window.CertificateMgmt.openCertificateDetail('${cert.id}')" class="text-blue-600 hover:text-blue-800" title="查看"><i class="fas fa-eye"></i></button>
              <button onclick="window.CertificateMgmt.openCertificateModal('${cert.id}')" class="text-indigo-600 hover:text-indigo-800" title="编辑"><i class="fas fa-edit"></i></button>
              <button onclick="window.CertificateMgmt.openIssueModal('${cert.id}')" class="text-emerald-600 hover:text-emerald-800" title="颁发"><i class="fas fa-medal"></i></button>
              <button onclick="window.CertificateMgmt.toggleCertificateStatus('${cert.id}')" class="text-amber-600 hover:text-amber-800" title="启用/停用"><i class="fas fa-toggle-on"></i></button>
              <button onclick="window.CertificateMgmt.deleteCertificate('${cert.id}')" class="text-red-600 hover:text-red-800" title="删除"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
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

    selectedTemplateId = cert ? cert.templateId : (templates[0]?.id || '');
    updateTemplatePreview();
    toggleValidityDays();

    openModal('certificate-modal');
  }

  function closeCertificateModal() {
    closeModal('certificate-modal');
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

  async function deleteCertificate(certId) {
    if (!confirm('确定删除该证书定义吗？')) return;
    const res = await apiDelete('/api/certificates/' + certId);
    if (res.success) {
      showToast('证书已删除', 'success');
      loadCertificates();
    } else {
      showToast(res.error || '删除失败', 'error');
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
      const activeClass = selectedTemplateId === tpl.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-slate-50';
      return `
        <div onclick="window.CertificateMgmt.selectTemplate('${tpl.id}')" class="cursor-pointer border rounded-xl p-3 transition ${activeClass}">
          <div class="h-24 rounded-lg mb-2 flex items-center justify-center text-4xl" style="background:${tpl.style.background}; color:${tpl.style.primaryColor}; border: 2px solid ${tpl.style.borderColor};">
            <i class="fas fa-certificate"></i>
          </div>
          <p class="text-sm font-medium text-slate-800 text-center">${escapeHtml(tpl.name)}</p>
          <p class="text-xs text-slate-500 text-center mt-1">${tpl.layout === 'portrait' ? '竖版' : '横版'}</p>
        </div>
      `;
    }).join('');
  }

  function selectTemplate(tplId) {
    selectedTemplateId = tplId;
    renderTemplatePicker();
    updateTemplatePreview();
  }

  function confirmTemplateSelection() {
    closeModal('certificate-template-modal');
    updateTemplatePreview();
  }

  function updateTemplatePreview() {
    const tpl = templates.find(t => t.id === selectedTemplateId);
    const preview = $('#cert-template-preview');
    if (!preview) return;
    if (!tpl) {
      preview.innerHTML = '<span class="text-slate-400">请选择模板</span>';
      return;
    }
    preview.innerHTML = `
      <div class="h-40 rounded-lg flex flex-col items-center justify-center p-4 text-center" style="background:${tpl.style.background}; color:${tpl.style.primaryColor}; border: 2px solid ${tpl.style.borderColor}; font-family:${tpl.style.fontFamily};">
        <div class="text-lg font-bold mb-2">${escapeHtml(tpl.placeholders.find(p => p.key === 'title')?.defaultValue || '证书标题')}</div>
        <div class="text-sm opacity-80">${escapeHtml(tpl.placeholders.find(p => p.key === 'name')?.defaultValue || '姓名')}</div>
      </div>
      <p class="text-xs text-slate-500 text-center mt-2">${escapeHtml(tpl.name)}</p>
    `;
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
      btn.classList.toggle('border-blue-500 text-blue-600', btn.dataset.tab === currentDetailTab);
      btn.classList.toggle('border-transparent text-slate-500 hover:text-slate-700', btn.dataset.tab !== currentDetailTab);
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
      <tr class="border-b hover:bg-slate-50">
        <td class="px-4 py-3 text-sm">${escapeHtml(uc.userName || uc.userId)}</td>
        <td class="px-4 py-3 text-sm text-blue-600">${escapeHtml(uc.certNo)}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${uc.sourceType === 'manual' ? '手动发放' : uc.sourceType === 'exam' ? '考试通过' : '培训完成'}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${formatDateTime(uc.issueAt)}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${formatDateTime(uc.effectiveAt)}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${uc.expireAt ? formatDateTime(uc.expireAt) : '无期限'}</td>
        <td class="px-4 py-3 text-sm">
          ${currentDetailTab === 'active'
            ? `<button onclick="window.CertificateMgmt.revokeUserCertificate('${uc.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-undo"></i> 撤销</button>`
            : `<span class="text-slate-400">-</span>`}
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

  // ===== 手动发放 =====
  function openIssueModal(certId) {
    const cert = certificates.find(c => c.id === certId);
    if (!cert) return;
    $('#issue-cert-name').textContent = cert.name;
    $('#issue-cert-id').value = cert.id;
    renderIssueUserList();
    openModal('certificate-issue-modal');
  }

  function renderIssueUserList() {
    const keyword = $('#issue-user-search')?.value?.toLowerCase() || '';
    const list = users.filter(u => {
      const name = (u.realName || u.username || '').toLowerCase();
      const dept = (u.department || '').toLowerCase();
      return name.includes(keyword) || dept.includes(keyword);
    });

    const container = $('#issue-user-list');
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = '<div class="text-center py-4 text-slate-400">无匹配学员</div>';
      return;
    }

    container.innerHTML = list.map(u => `
      <label class="flex items-center p-2 hover:bg-slate-50 rounded cursor-pointer">
        <input type="checkbox" value="${u.id}" class="issue-user-checkbox w-4 h-4 text-blue-600 rounded border-slate-300">
        <span class="ml-3 text-sm text-slate-700">${escapeHtml(u.realName || u.username || u.id)}</span>
        <span class="ml-2 text-xs text-slate-500">${escapeHtml(u.department || '')}</span>
      </label>
    `).join('');
  }

  async function submitIssue() {
    const certId = $('#issue-cert-id').value;
    const checked = $$('.issue-user-checkbox:checked');
    const userIds = checked.map(cb => cb.value);
    if (userIds.length === 0) return showToast('请选择要颁发的学员', 'error');

    const res = await apiPost('/api/certificates/' + certId + '/issue', { userIds, sourceType: 'manual' });
    if (res.success) {
      showToast(`成功颁发 ${res.data.length} 人${res.errors.length ? '，失败 ' + res.errors.length + ' 人' : ''}`, 'success');
      closeModal('certificate-issue-modal');
      loadCertificates();
      if (currentDetailCertificate && currentDetailCertificate.id === certId) {
        renderCertificateDetail();
      }
    } else {
      showToast(res.error || '颁发失败', 'error');
    }
  }

  // ===== 证书渲染（通用，用于详情弹窗和个人中心） =====
  function renderCertificateHTML(userCert, certificate, template) {
    const user = userCert.userName || '学员';
    const company = userCert.userDepartment || '广州游雁网络科技有限公司';
    const date = formatDateTime(userCert.issueAt).split(' ')[0];
    const title = certificate.name || '荣誉证书';
    const content = '成绩合格，特发此证，以资鼓励。';

    const isPortrait = template.layout === 'portrait';
    const width = isPortrait ? '210mm' : '297mm';
    const height = isPortrait ? '297mm' : '210mm';

    return `
      <div class="certificate-render-wrap" style="width:${width}; height:${height}; background:${template.style.background}; color:${template.style.primaryColor}; font-family:${template.style.fontFamily}; border:12px double ${template.style.borderColor}; box-sizing:border-box; padding:48px; position:relative; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
        <div style="position:absolute; top:24px; left:24px; right:24px; bottom:24px; border:2px solid ${template.style.borderColor}; opacity:0.4;"></div>
        <div style="position:absolute; top:36px; left:36px; right:36px; bottom:36px; border:1px solid ${template.style.borderColor}; opacity:0.3;"></div>
        <div style="font-size:14px; letter-spacing:4px; text-transform:uppercase; opacity:0.7; margin-bottom:12px;">Certificate of Achievement</div>
        <h1 style="font-size:42px; font-weight:bold; margin-bottom:36px; letter-spacing:6px;">${escapeHtml(title)}</h1>
        <div style="font-size:18px; margin-bottom:24px;">兹证明</div>
        <div style="font-size:36px; font-weight:bold; margin-bottom:36px; border-bottom:2px solid ${template.style.borderColor}; padding:0 48px 12px;">${escapeHtml(user)}</div>
        <div style="font-size:18px; line-height:1.8; max-width:80%; margin-bottom:48px;">${escapeHtml(content)}</div>
        <div style="margin-top:auto; display:flex; justify-content:space-between; width:70%; font-size:16px;">
          <div>证书编号：${escapeHtml(userCert.certNo)}</div>
          <div>颁发日期：${date}</div>
        </div>
        <div style="margin-top:12px; font-size:14px; opacity:0.8;">${escapeHtml(company)}</div>
      </div>
    `;
  }

  function printCertificate(userCertId) {
    apiGet('/api/user-certificates/' + userCertId).then(res => {
      if (!res.success) return showToast(res.error || '加载失败', 'error');
      const uc = res.data;
      const tpl = uc.template;
      if (!tpl) return showToast('模板不存在', 'error');

      const win = window.open('', '_blank');
      win.document.write(`
        <html><head><title>证书打印</title>
        <style>
          @media print { body { margin:0; } .cert-print { page-break-after:always; } }
          body { display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f3f4f6; }
        </style></head><body>
        <div class="cert-print">${renderCertificateHTML(uc, { name: uc.certificateName }, tpl)}</div>
        <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
        </body></html>
      `);
      win.document.close();
    });
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
    $('#cert-template-picker-btn')?.addEventListener('click', openTemplatePicker);
    $('#cert-template-confirm')?.addEventListener('click', confirmTemplateSelection);
    $('#cert-template-cancel')?.addEventListener('click', () => closeModal('certificate-template-modal'));
    $('#cert-search-btn')?.addEventListener('click', loadCertificates);
    $('#cert-search-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadCertificates(); });
    $('#cert-status-filter')?.addEventListener('change', loadCertificates);
    $('#cert-dept-filter')?.addEventListener('change', loadCertificates);
    $('#cert-new-btn')?.addEventListener('click', () => openCertificateModal());
    $('#issue-user-search')?.addEventListener('input', renderIssueUserList);
    $('#issue-submit-btn')?.addEventListener('click', submitIssue);
    $('#issue-cancel-btn')?.addEventListener('click', () => closeModal('certificate-issue-modal'));

    $$('.cert-detail-tab').forEach(btn => {
      btn.addEventListener('click', () => switchDetailTab(btn.dataset.tab));
    });
  }

  // 暴露到全局
  window.CertificateMgmt = {
    init,
    loadCertificates,
    loadTemplates,
    loadUsers,
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
    submitIssue,
    deleteCertificate,
    toggleCertificateStatus,
    printCertificate,
    renderCertificateHTML
  };

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
