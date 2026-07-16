const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const file = path.join(__dirname, 'cert-debug-render.html');
  await page.goto('file:///' + file.replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.cert-design-el'));
    return els.map((el, i) => {
      const inner = el.querySelector('div');
      const style = window.getComputedStyle(inner);
      const range = document.createRange();
      range.selectNodeContents(inner);
      const textRect = range.getBoundingClientRect();
      return {
        index: i,
        text: inner.textContent.slice(0, 30).replace(/\n/g, '\\n'),
        textAlign: style.textAlign,
        parentWidth: el.getBoundingClientRect().width,
        parentLeft: el.getBoundingClientRect().left,
        innerWidth: inner.getBoundingClientRect().width,
        innerLeft: inner.getBoundingClientRect().left,
        textLeft: textRect.left,
        textRight: textRect.right,
        textWidth: textRect.width
      };
    });
  });
  console.table(result);
  await browser.close();
})();
