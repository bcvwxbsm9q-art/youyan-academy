const fs = require('fs');
const vm = require('vm');
const path = require('path');
const filePath = path.join(__dirname, 'dashboard.html');
const html = fs.readFileSync(filePath, 'utf-8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m;
let idx = 0;
const errors = [];
while ((m = re.exec(html)) !== null) {
  idx++;
  const code = m[1];
  if (!code.trim()) continue;
  try {
    new vm.Script(code, { filename: 'script#' + idx });
  } catch (e) {
    errors.push('Script #' + idx + ' ERROR: ' + e.message);
    // try to show surrounding lines
    const stack = e.stack || '';
    errors.push(stack.split('\n').slice(0, 4).join('\n'));
  }
}
const out = errors.length
  ? 'FOUND ERRORS:\n' + errors.join('\n\n')
  : 'ALL ' + idx + ' SCRIPT BLOCKS OK';
fs.writeFileSync(path.join(__dirname, '_syntax_result.txt'), out, 'utf-8');
