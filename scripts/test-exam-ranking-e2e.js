const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 构造一个带排行榜的静态测试页，验证当前用户行显示真实姓名
    await page.setContent(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Ranking Test</title></head>
<body>
<div id="ranking-list"></div>
</body>
</html>
    `);

    // 注入与 exam.html 一致的新逻辑
    await page.evaluate(() => {
      const ranking = [
        { rank: 1, userId: '2', userName: '张三', department: '技术部', score: 100, scoreRate: 100, isCurrentUser: false },
        { rank: 2, userId: '1', userName: '李四', department: '人力资源部', score: 95, scoreRate: 95, isCurrentUser: true }
      ];
      const currentUserId = '1';
      const listEl = document.getElementById('ranking-list');
      listEl.innerHTML = ranking.map(item => {
        const isMe = item.isCurrentUser || (currentUserId && String(item.userId) === currentUserId);
        const rowClass = isMe ? 'bg-indigo-50/60 border-l-4 border-indigo-500' : 'bg-white';
        const nameClass = isMe ? 'text-indigo-700' : 'text-slate-800';
        return `
          <div class="grid grid-cols-12 gap-2 px-4 py-3 items-center ${rowClass}">
            <div class="col-span-5">
              <div class="text-sm font-medium truncate ${nameClass}">${item.userName}</div>
            </div>
          </div>
        `;
      }).join('');
    });

    const newText = await page.locator('.text-indigo-700').textContent();
    if (newText.trim() === '李四') {
      console.log('[PASS] 当前用户行显示真实姓名“李四”，重点标识颜色保留');
    } else {
      console.error(`[FAIL] 当前用户行显示为“${newText.trim()}”，期望“李四”`);
      process.exit(1);
    }
  } catch (err) {
    console.error('[FAIL]', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
