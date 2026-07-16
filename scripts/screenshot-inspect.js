const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1425, height: 2064 });
  await page.goto('file:///' + path.join(__dirname, 'cert-inspect.html'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'cert-inspect.png') });
  await browser.close();
  console.log('已生成:', path.join(__dirname, 'cert-inspect.png'));
})();
