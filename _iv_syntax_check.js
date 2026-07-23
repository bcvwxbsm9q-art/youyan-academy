const fs = require('fs');
const path = 'E:/培训相关/桌面/learning/dashboard.html';
const html = fs.readFileSync(path, 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, idx = 0, errors = 0;
while ((m = re.exec(html)) !== null) {
  const attrs = m[1] || '';
  if (/\bsrc\s*=/.test(attrs)) continue; // 跳过外部脚本
  const code = m[2];
  idx++;
  try {
    // 仅解析，不执行（浏览器全局变量不会触发错误）
    new Function(code);
  } catch (e) {
    errors++;
    console.log(`[脚本块 #${idx}] 语法错误: ${e.message}`);
  }
}
console.log(`共检查 ${idx} 个内联脚本块，语法错误 ${errors} 个`);
process.exit(errors ? 1 : 0);
