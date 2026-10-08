const { chromium } = require('playwright');
const crypto = require('crypto');

const SECRET = 'youyan-academy-secret-key-2024';
const uid = '1780909174403';
const payload = { id: uid, username: 't', role: 'user', exp: Date.now() + 86400000 };
const enc = Buffer.from(JSON.stringify(payload)).toString('base64');
const sig = crypto.createHmac('sha256', SECRET).update(enc).digest('hex');
const token = enc + '.' + sig;
const user = JSON.stringify({ id: uid, username: 't', role: 'user', realName: '测试', createdAt: new Date(Date.now() - 400 * 86400000).toISOString() });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript((t, u) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', u);
  }, token, user);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:3003/m/mine.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const res = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#m-ach-scroll .m-ach')];
    const info = items.map(el => {
      const badge = el.querySelector('.m-ach__badge');
      return {
        name: (el.querySelector('.m-ach__name') || {}).textContent,
        locked: el.classList.contains('is-locked'),
        bg: badge ? badge.getAttribute('style') : null
      };
    });
    const colored = info.filter(x => !x.locked && x.bg && x.bg.includes('gradient')).length;
    const locked = info.filter(x => x.locked).length;
    return {
      total: info.length,
      colored, locked,
      more: (document.getElementById('m-ach-more') || {}).textContent,
      gm_ach: (document.getElementById('gm-ach') || {}).textContent,
      sample: info.slice(0, 8)
    };
  });
  console.log('徽章总数:', res.total, '| 彩色:', res.colored, '| 锁定(灰):', res.locked);
  console.log('头部 more:', res.more, '| 网格 gm-ach:', res.gm_ach);
  console.log('前8个徽章渲染:');
  res.sample.forEach(s => console.log('  ', s.name, '| locked=' + s.locked, '| style=', s.bg));
  console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 5) : '(none)');
  await browser.close();
})();
