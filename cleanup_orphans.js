/**
 * 一次性数据修复：清理 bankId 对不上现存题库的"孤儿题"
 *
 * 背景：创建题时若没选/没找到题库，会得到 bankId=0；之后即使删完所有题库，
 * 这些 bankId=0 的题仍残留在 data.questions 里，picker 仍能选到。
 * 删题库只清 bankId===该题库id 的题，扫不到 bankId=0 的题。
 *
 * 用法：在项目根目录执行 `node cleanup_orphans.js`
 * 行为：
 *   1) 备份 data.json -> data.json.bak.2026-07-23
 *   2) 文本级精准替换顶层 questions 数组（不重序列化整个文件，git diff 极小）
 *   3) 写回，生成 cleanup_report.txt
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'data.json');
const BAK = DATA + '.bak.2026-07-23';
const REPORT = path.join(__dirname, 'cleanup_report.txt');

// 1) 备份
fs.copyFileSync(DATA, BAK);

// 2) 解析 + 过滤
const text = fs.readFileSync(DATA, 'utf8');
const data = JSON.parse(text);
const banks = data.question_banks || [];
const validIds = new Set();
for (const b of banks) {
  const n = Number(b.id);
  if (!isNaN(n)) validIds.add(n);
}
const oldQs = data.questions || [];
const newQs = oldQs.filter(q => {
  const bid = q.bankId;
  if (bid == null) return false;
  return validIds.has(Number(bid));
});
const removed = oldQs.length - newQs.length;

// 3) 文本级 splice：只替换顶层 "questions": [ ... ]，其他字段一字不动
const key = '"questions":';
const idx = text.indexOf(key);
if (idx === -1) {
  console.error('未找到顶层 questions 键，已中止（未写回）');
  process.exit(1);
}
let i = text.indexOf(':', idx);
let j = i + 1;
while (j < text.length && /\s/.test(text[j])) j++;
if (text[j] !== '[') {
  console.error('questions 键后未找到 [，已中止（未写回）');
  process.exit(1);
}
const start = j;

// 括号匹配找对应的 ]（跳过字符串内的方括号）
let depth = 0, end = -1, inStr = false, esc = false;
for (let k = start; k < text.length; k++) {
  const c = text[k];
  if (inStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === '"') inStr = false;
  } else {
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = k; break; } }
  }
}
if (end === -1) {
  console.error('questions 数组未找到匹配的 ]，已中止（未写回）');
  process.exit(1);
}

// 4) 序列化新数组（保持原始中文不转义，与文件其余部分风格一致）
function stringifyRaw(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
const inner = stringifyRaw(newQs);
const lines = inner.split('\n');
// 原始文件缩进：顶层键 2 空格，数组元素 { 在 4 空格，闭合 ] 在 2 空格
const block = [lines[0]]; // '[' 留在键那行
for (let l = 1; l < lines.length - 1; l++) block.push('  ' + lines[l]);
block.push('  ' + lines[lines.length - 1]); // ']'
const newArrayText = block.join('\n');

const newText = text.slice(0, start) + newArrayText + text.slice(end + 1);
fs.writeFileSync(DATA, newText, 'utf8');

// 5) 报告
const msg = [
  '备份: ' + BAK,
  '现存题库 ids: ' + (validIds.size ? [...validIds].join(',') : '(无)'),
  '清理孤儿题数: ' + removed,
  '剩余题数: ' + newQs.length
].join('\n') + '\n';
fs.writeFileSync(REPORT, msg, 'utf8');
console.log(msg);
