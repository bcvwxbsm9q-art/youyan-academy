const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:20px;}</style></head><body>
    <div id="outer" style="width:576.95px;height:76.46px;border:1px solid red;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;font-family:'STSong','SimSun','Times New Roman',serif;font-size:52.13px;">
      <div id="inner" style="display:block;width:100%;text-align:right;line-height:1.2;text-decoration:none;">2026-07-16</div>
    </div>
  </body></html>`;

  await page.setContent(html);
  const styles = await page.evaluate(() => {
    const outer = document.getElementById('outer');
    const inner = document.getElementById('inner');
    const outerRect = outer.getBoundingClientRect();
    const innerRect = inner.getBoundingClientRect();
    return {
      outer: { width: outerRect.width, height: outerRect.height },
      inner: { x: innerRect.x, width: innerRect.width, height: innerRect.height },
      text: { width: inner.scrollWidth }
    };
  });
  console.log(JSON.stringify(styles, null, 2));
  await page.screenshot({ path: path.join(__dirname, 'test-date-align.png') });
  await browser.close();
})();
