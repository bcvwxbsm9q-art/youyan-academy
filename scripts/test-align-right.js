const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Replicate actual server structure with scaled values
  const html1 = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:0;}</style></head><body>
    <div style="width:639.5px;height:76.4px;border:1px solid red;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;font-family:'STSong','SimSun','Times New Roman',serif;font-size:52.1px;">
      <div style="display:block;width:100%;text-align:right;line-height:1.2;text-decoration:none;">广州游雁网络科技有限公司</div>
    </div>
    <div style="margin-top:10px;width:576.9px;height:76.4px;border:1px solid blue;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;font-family:'STSong','SimSun','Times New Roman',serif;font-size:52.1px;">
      <div style="display:block;width:100%;text-align:right;line-height:1.2;text-decoration:none;">2026-07-16</div>
    </div>
    <div style="margin-top:10px;width:296px;height:120px;border:1px solid green;display:flex;align-items:center;overflow:hidden;padding:0 4px;box-sizing:border-box;font-family:'STSong','SimSun','Times New Roman',serif;font-size:15px;">
      <div style="display:block;width:100%;text-align:left;line-height:2;text-decoration:none;">　　在本公司工作期间，认真负责，表现<br>优秀，现授予<span style="color:#c41e0f;font-weight:bold;">年度优秀员工</span>荣誉称号。特<br>发此证，以示表彰。</div>
    </div>
  </body></html>`;

  await page.setContent(html1);
  await page.screenshot({ path: path.join(__dirname, 'test-align-right.png') });

  // Replicate editor old structure (inline-block span)
  const html2 = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:0;}</style></head><body>
    <div style="width:639.5px;height:76.4px;border:1px solid red;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;font-family:'STSong','SimSun','Times New Roman',serif;font-size:52.1px;text-align:right;">
      <span style="width:100%;display:inline-block;line-height:1.2;">广州游雁网络科技有限公司</span>
    </div>
    <div style="margin-top:10px;width:576.9px;height:76.4px;border:1px solid blue;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;font-family:'STSong','SimSun','Times New Roman',serif;font-size:52.1px;text-align:right;">
      <span style="width:100%;display:inline-block;line-height:1.2;">2026-07-16</span>
    </div>
    <div style="margin-top:10px;width:296px;height:120px;border:1px solid green;display:flex;align-items:center;overflow:hidden;padding:0 4px;box-sizing:border-box;font-family:'STSong','SimSun','Times New Roman',serif;font-size:15px;text-align:left;">
      <span style="width:100%;display:inline-block;line-height:2;">　　在本公司工作期间，认真负责，表现<br>优秀，现授予<span style="color:#c41e0f;font-weight:bold;">年度优秀员工</span>荣誉称号。特<br>发此证，以示表彰。</span>
    </div>
  </body></html>`;

  await page.setContent(html2);
  await page.screenshot({ path: path.join(__dirname, 'test-align-inlineblock.png') });

  await browser.close();
  console.log('done');
})();
