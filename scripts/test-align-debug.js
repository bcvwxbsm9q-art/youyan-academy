const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:20px;}</style></head><body>
    <div id="outer" style="width:639.5px;height:76.4px;border:1px solid red;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;font-family:'STSong','SimSun','Times New Roman',serif;font-size:52.1px;">
      <div id="inner" style="display:block;width:100%;text-align:right;line-height:1.2;text-decoration:none;">广州游雁网络科技有限公司</div>
    </div>
  </body></html>`;

  await page.setContent(html);
  const styles = await page.evaluate(() => {
    const outer = document.getElementById('outer');
    const inner = document.getElementById('inner');
    const outerRect = outer.getBoundingClientRect();
    const innerRect = inner.getBoundingClientRect();
    return {
      outer: { width: outerRect.width, height: outerRect.height, display: getComputedStyle(outer).display, alignItems: getComputedStyle(outer).alignItems, overflow: getComputedStyle(outer).overflow },
      inner: { width: innerRect.width, height: innerRect.height, display: getComputedStyle(inner).display, textAlign: getComputedStyle(inner).textAlign, lineHeight: getComputedStyle(inner).lineHeight },
      text: { width: inner.scrollWidth, height: inner.scrollHeight }
    };
  });
  console.log(JSON.stringify(styles, null, 2));
  await page.screenshot({ path: path.join(__dirname, 'test-align-debug.png') });
  await browser.close();
})();
