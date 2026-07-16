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
  const testUserId = 1780909174403;
  const token = createToken(admin);
  let certId = null;
  let userCertId = null;

  // 1. 清理旧测试证书
  const listRes = await request('GET', '/api/certificates', null, token);
  const certs = (listRes.body.data || []);
  for (const c of certs) {
    if (c.name && c.name.startsWith('消息中心测试证书')) {
      await request('DELETE', `/api/certificates/${c.id}`, null, token);
    }
  }

  // 2. 创建证书定义
  const createRes = await request('POST', '/api/certificates', {
    name: '消息中心测试证书-' + Date.now(),
    dept: '测试部',
    validityType: 'permanent',
    validityDays: null,
    prefix: 'MSG',
    startNumber: 1,
    digits: 4,
    templateId: 'tpl-completion-gold',
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
        { type: 'text', x: 397, y: 420, text: '表现优异，特授予【年度最佳学员】称号。', fontSize: 20, color: '#555555', textAlign: 'center' },
        { type: 'text', x: 397, y: 560, text: '证书编号：{{certNo}}', fontSize: 16, color: '#666666', textAlign: 'center' },
        { type: 'text', x: 397, y: 600, text: '颁发日期：{{date}}', fontSize: 16, color: '#666666', textAlign: 'center' },
        { type: 'seal', x: 580, y: 720, text: '游雁学院\n认证专用章', size: 100, color: '#764ba2' }
      ]
    }
  }, token);
  certId = createRes.body.data && createRes.body.data.id;
  if (await assert('创建证书定义返回 200', createRes.status >= 200 && createRes.status < 300)) passed++; else failed++;

  // 3. 手动颁发给用户
  const issueRes = await request('POST', `/api/certificates/${certId}/issue`, { userIds: [testUserId], sourceType: 'manual' }, token);
  if (await assert('颁发证书返回成功', issueRes.body.success === true)) passed++; else failed++;
  userCertId = issueRes.body.data && issueRes.body.data[0] && issueRes.body.data[0].id;

  // 4. 验证通知包含 userCertificateId
  const notifRes = await request('GET', '/api/notifications', null, token);
  const notifications = notifRes.body.data || [];
  const certNotif = notifications.find(n => n.type === 'certificate' && String(n.userId) === String(testUserId));
  if (await assert('存在证书类型通知', !!certNotif)) passed++; else failed++;
  if (certNotif) {
    if (await assert('证书通知包含 userCertificateId', !!certNotif.userCertificateId, `userCertificateId=${certNotif.userCertificateId}`)) passed++; else failed++;
    if (await assert('证书通知 userCertificateId 匹配颁发记录', String(certNotif.userCertificateId) === String(userCertId), `通知=${certNotif.userCertificateId}, 记录=${userCertId}`)) passed++; else failed++;
  }

  // 5. 浏览器验证消息中心弹窗
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[openDetail]') || text.includes('证书')) {
        console.log('[PAGE CONSOLE]', text);
      }
    });
    page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));

    await page.goto(`${BASE}/messages.html`);
    const authPayload = { token, user: { id: testUserId, username: '15302206488', realName: '许志坚', role: 'admin' } };
    await page.evaluate((payload) => {
      localStorage.setItem('token', payload.token);
      localStorage.setItem('user', JSON.stringify(payload.user));
    }, authPayload);
    await page.goto(`${BASE}/messages.html`);
    await page.waitForTimeout(1500);

    // 等待证书通知行出现
    const certRow = await page.waitForSelector('tr[data-id]', { timeout: 5000 }).catch(() => null);
    if (await assert('消息列表存在证书通知行', !!certRow)) passed++; else failed++;

    // 验证类型徽章显示为证书通知
    const badgeText = await page.$eval('tr[data-id] .type-certificate', el => el.textContent).catch(() => '');
    if (await assert('证书通知类型徽章显示为「🏆 证书通知」', badgeText.includes('证书通知'), `badge=${badgeText}`)) passed++; else failed++;

    // 点击打开详情
    const firstRow = await page.$('tr[data-id]');
    if (firstRow) {
      await firstRow.click();
      await page.waitForTimeout(3000);

      // 验证弹窗中证书图片已生成
      const certImg = await page.$('.cert-preview-wrapper img');
      if (await assert('证书通知弹窗中显示证书图片', !!certImg)) passed++; else failed++;
      if (certImg) {
        const src = await certImg.getAttribute('src');
        if (await assert('证书图片使用 data URL', src && src.startsWith('data:image'), `src=${src ? src.slice(0, 50) : 'null'}`)) passed++; else failed++;
      }

      // 验证下载/查看大图按钮存在
      const downloadBtn = await page.$('.cert-btn-download');
      const viewBtn = await page.$('.cert-btn-view');
      if (await assert('证书弹窗存在下载图片按钮', !!downloadBtn)) passed++; else failed++;
      if (await assert('证书弹窗存在查看大图按钮', !!viewBtn)) passed++; else failed++;

      // 点击查看大图
      if (viewBtn) {
        await viewBtn.click();
        await page.waitForTimeout(500);
        const bigImg = await page.$('#msg-cert-image-modal img');
        if (await assert('证书大图弹窗显示', !!bigImg)) passed++; else failed++;
      }
    }

    await browser.close();
  } catch (e) {
    console.error('[BROWSER ERROR]', e.message);
    if (browser) await browser.close();
    failed++;
  }

  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
