const { chromium } = require('playwright');
const crypto = require('crypto');
const http = require('http');

const BASE = 'http://localhost:3003';
const JWT_SECRET = 'youyan-academy-secret-key-2024';

function createToken(user) {
  const payload = { id: user.id, username: user.username, role: user.role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = { hostname: 'localhost', port: 3003, path, method, headers: { 'Content-Type': 'application/json' } };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, body: raw }); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function assert(name, condition, details) {
  if (condition) { console.log(`[PASS] ${name}`); return true; }
  console.error(`[FAIL] ${name}${details ? ': ' + details : ''}`); return false;
}

async function run() {
  let passed = 0, failed = 0;
  const admin = { id: 1780909174403, username: '15302206488', role: 'admin' };
  const testUserId = 1780909174403; // 使用管理员自身，避免 token 验证后 user 被覆盖
  const token = createToken(admin);

  // 1. 清理旧测试证书
  const listRes = await request('GET', '/api/certificates', null, token);
  const certs = (listRes.body.data || []);
  for (const c of certs) {
    if (c.name && c.name.startsWith('E2E测试证书')) {
      await request('DELETE', `/api/certificates/${c.id}`, null, token);
    }
  }

  // 2. 创建证书定义（使用紫色模板 + 自定义 design）
  const createRes = await request('POST', '/api/certificates', {
    name: 'E2E测试证书-' + Date.now(),
    dept: '测试部',
    validityType: 'permanent',
    validityDays: null,
    prefix: 'E2E',
    startNumber: 1,
    digits: 4,
    templateId: 'tpl-honor-purple',
    status: 'enabled',
    design: {
      layout: 'portrait',
      background: 'linear-gradient(160deg, #ffffff 0%, #f5f3ff 40%, #ede9fe 100%)',
      borderColor: '#764ba2',
      accentColor: '#9333ea',
      primaryColor: '#764ba2',
      secondaryColor: '#667eea',
      sealColor: '#764ba2',
      elements: [
        { type: 'text', x: 397, y: 180, text: '荣誉证书', fontSize: 48, color: '#764ba2', fontWeight: 'bold', textAlign: 'center' },
        { type: 'text', x: 397, y: 320, text: '{{name}}', fontSize: 36, color: '#333333', fontWeight: 'bold', textAlign: 'center' },
        { type: 'text', x: 397, y: 420, text: '{{content}}', fontSize: 20, color: '#555555', textAlign: 'center' },
        { type: 'text', x: 397, y: 560, text: '证书编号：{{certNo}}', fontSize: 16, color: '#666666', textAlign: 'center' },
        { type: 'text', x: 397, y: 600, text: '颁发日期：{{date}}', fontSize: 16, color: '#666666', textAlign: 'center' },
        { type: 'seal', x: 580, y: 720, text: '游雁学院\n认证专用章', size: 100, color: '#764ba2' }
      ]
    }
  }, token);
  console.log('[DEBUG] create certificate response:', createRes.status, JSON.stringify(createRes.body).slice(0, 500));
  if (await assert('创建证书定义返回 200/201', createRes.status >= 200 && createRes.status < 300, `status=${createRes.status}`)) passed++; else failed++;
  const certId = createRes.body.data && createRes.body.data.id;
  if (await assert('创建证书定义返回 id', !!certId, `id=${certId}`)) passed++; else failed++;

  // 3. 手动颁发给用户
  let issueRes;
  if (certId) {
    issueRes = await request('POST', `/api/certificates/${certId}/issue`, { userIds: [testUserId], sourceType: 'manual' }, token);
    if (await assert('颁发证书返回 200', issueRes.status === 200, `status=${issueRes.status}`)) passed++; else failed++;
    if (await assert('颁发证书返回成功', issueRes.body.success === true, JSON.stringify(issueRes.body))) passed++; else failed++;
  }

  // 4. 查询用户证书列表，确认包含 design 字段
  const userCertRes = await request('GET', `/api/user-certificates?userId=${testUserId}`, null, token);
  if (await assert('用户证书列表返回 200', userCertRes.status === 200)) passed++; else failed++;
  const userCerts = userCertRes.body.data || [];
  const issued = userCerts.find(uc => String(uc.certificateId) === String(certId));
  if (await assert('用户证书包含 design 字段', issued && issued.design && issued.design.elements && issued.design.elements.length > 0)) passed++; else failed++;

  // 5. 浏览器验证
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[renderCertificatePreviewHTML]') || text.includes('证书')) {
        console.log('[PAGE CONSOLE]', text);
      }
    });

    // 注入 token 和用户信息
    await page.goto(`${BASE}/center.html`);
    const authPayload = { token, user: { id: testUserId, username: '15302206488', realName: '许志坚', role: 'admin' } };
    await page.evaluate((payload) => {
      localStorage.setItem('token', payload.token);
      localStorage.setItem('user', JSON.stringify(payload.user));
    }, authPayload);

    // 刷新页面加载证书列表
    await page.goto(`${BASE}/center.html`);
    await page.waitForTimeout(1500);

    // 切换到「我的证书」tab
    const certTab = await page.$('[data-tab="certificates"]');
    if (certTab) {
      await certTab.click();
      await page.waitForTimeout(3000);
    }

    // 调试：检查 window.CertificateMgmt 与第一个证书的 design
    const certDebug = await page.evaluate(async () => {
      const cards = document.querySelectorAll('[data-cert-id]');
      if (!cards.length) return { cards: 0 };
      const firstId = cards[0].getAttribute('data-cert-id');
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/user-certificates/' + encodeURIComponent(firstId), { headers: { 'Authorization': 'Bearer ' + token } });
      const result = await res.json();
      const uc = result.data || {};
      let renderResult = null;
      let renderError = null;
      if (uc.design && window.CertificateMgmt && window.CertificateMgmt.renderDesignPageInner) {
        try {
          const fill = { title: uc.certificateName || '荣誉证书', name: uc.userName || '学员', certNo: uc.certNo || '', date: (uc.issueAt || '').split('T')[0] || '', company: uc.userDepartment || '', content: '表现优异，特发此证，以资鼓励。' };
          const scale = window.CertificateMgmt.printScale(uc.design.layout);
          renderResult = window.CertificateMgmt.renderDesignPageInner(uc.design, scale, fill).slice(0, 200);
        } catch (e) { renderError = e.message; }
      }
      return {
        cards: cards.length,
        firstId,
        hasMgmt: typeof window.CertificateMgmt !== 'undefined',
        hasRender: !!(window.CertificateMgmt && window.CertificateMgmt.renderDesignPageInner),
        hasDesign: !!(uc && uc.design),
        designKeys: uc && uc.design ? Object.keys(uc.design) : null,
        renderError,
        renderResult
      };
    });
    console.log('[DEBUG] cert debug:', certDebug);

    // 截图
    await page.screenshot({ path: 'scripts/test-cert-center-screenshot.png', fullPage: false });

    // 验证一行三个布局
    const gridClass = await page.$eval('#certificates-list', el => el.className).catch(() => null);
    if (await assert('证书列表容器存在且为 grid', !!gridClass && gridClass.includes('grid'))) passed++; else failed++;
    if (await assert('证书列表容器包含 md:grid-cols-3', gridClass && gridClass.includes('md:grid-cols-3'))) passed++; else failed++;

    // 验证弹窗存在
    const modalExists = await page.$('#certificate-image-modal') !== null;
    if (await assert('证书图片放大弹窗存在', modalExists)) passed++; else failed++;

    // 验证第一张证书图片已生成（非 hidden/占位）
    const firstImg = await page.$('.cert-image');
    if (firstImg) {
      const isHidden = await firstImg.evaluate(el => el.classList.contains('hidden'));
      const src = await firstImg.getAttribute('src');
      if (await assert('第一张证书图片已生成并可见', !isHidden && src && src.startsWith('data:image'))) passed++; else failed++;
    } else {
      if (await assert('存在证书图片元素', false)) passed++; else failed++;
    }

    // 点击放大
    const firstCard = await page.$('[data-cert-id]');
    if (firstCard) {
      await firstCard.click();
      await page.waitForTimeout(500);
      const modalHidden = await page.$eval('#certificate-image-modal', el => el.classList.contains('hidden')).catch(() => true);
      if (await assert('点击图片后弹窗显示', !modalHidden)) passed++; else failed++;
      const modalImgSrc = await page.$eval('#certificate-image-modal-img', el => el.src).catch(() => '');
      if (await assert('弹窗内大图使用 data URL', modalImgSrc.startsWith('data:image'))) passed++; else failed++;
    }

    await browser.close();
  } catch (e) {
    console.error('[BROWSER ERROR]', e.message);
    if (browser) await browser.close();
    failed++;
  }

  // 6. 验证旧版蓝色 ID 已删除
  const templatesRes = await request('GET', '/api/certificates/templates', null, token);
  const templates = templatesRes.body.data || [];
  const hasBlue = templates.some(t => t.id === 'tpl-honor-blue');
  if (await assert('模板列表无 tpl-honor-blue 残留', !hasBlue)) passed++; else failed++;

  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
