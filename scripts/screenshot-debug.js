const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('file:///' + path.join(__dirname, 'cert-text-align-debug.html'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'cert-text-align-debug.png'), fullPage: true });
  await browser.close();
  console.log('已生成对比截图:', path.join(__dirname, 'cert-text-align-debug.png'));
})();
