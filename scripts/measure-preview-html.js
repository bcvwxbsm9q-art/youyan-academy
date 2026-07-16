const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const inner = fs.readFileSync(path.join(__dirname, 'test-preview-html.html'), 'utf8');

  // 无缩放，直接按编辑器尺寸渲染
  await page.setViewportSize({ width: 410, height: 594 });
  await page.setContent(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:0;}</style></head><body>${inner}</body></html>`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  const noScale = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.cert-design-el')).map((el, i) => {
      const innerDiv = el.querySelector('div');
      const textRange = document.createRange();
      textRange.selectNodeContents(innerDiv);
      const r = textRange.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      return { i, text: innerDiv.textContent.slice(0, 20).replace(/\n/g, '\\n'), align: window.getComputedStyle(innerDiv).textAlign, parentW: p.width, textLeft: r.left - p.left, textRight: r.right - p.left, textW: r.width };
    });
  });
  console.log('--- 无缩放 ---');
  console.table(noScale);

  // 按服务端缩放方式渲染
  const scale = 1425 / 410;
  await page.setViewportSize({ width: 1425, height: 2064 });
  await page.setContent(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:0;width:1425px;height:2064px;overflow:hidden;background:#fff;}</style></head><body><div style="transform:scale(${scale});transform-origin:top left;width:410px;height:594px;">${inner}</div></body></html>`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  const scaled = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.cert-design-el')).map((el, i) => {
      const innerDiv = el.querySelector('div');
      const textRange = document.createRange();
      textRange.selectNodeContents(innerDiv);
      const r = textRange.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      return { i, text: innerDiv.textContent.slice(0, 20).replace(/\n/g, '\\n'), align: window.getComputedStyle(innerDiv).textAlign, parentW: p.width, textLeft: r.left - p.left, textRight: r.right - p.left, textW: r.width };
    });
  });
  console.log('--- 服务端缩放 ---');
  console.table(scaled);
  await browser.close();
})();
