const fs = require('fs');
const h = fs.readFileSync('e:\\培训相关\\桌面\\learning\\dashboard.html', 'utf8');
const s = h.indexOf('<script>', h.indexOf('data-sync.js')) + 8;
const e = h.lastIndexOf('</script>');
const c = h.substring(s, e);

// Find ALL < characters not inside strings (properly handling template literals)
let result = [];
let inStr = false, strChar = '', escaped = false, tplDepth = 0;

for (let i = 0; i < c.length; i++) {
  const ch = c[i];
  
  if (escaped) { escaped = false; continue; }
  
  if (!inStr) {
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = true;
      strChar = ch;
      if (ch === '`') tplDepth++;
      continue;
    }
  } else {
    if (ch === '\\') { escaped = true; continue; }
    if (ch === strChar) {
      if (strChar === '`') tplDepth--;
      inStr = false;
      continue;
    }
    // Inside template literal, track nested `
    if (ch === '`' && strChar === '`') tplDepth++;
  }
  
  if (!inStr && ch === '<') {
    const ctx = c.substring(i, Math.min(c.length, i + 60));
    // Only flag real HTML tags, not comparison operators etc.
    if (/^<[a-zA-Z\/!]/.test(ctx)) {
      result.push({ pos: i, ctx: ctx });
      if (result.length >= 10) break; // Limit output
    }
  }
}

if (result.length > 0) {
  console.log('Found ' + result.length + ' raw < tokens:');
  result.forEach(r => {
    const lineNum = c.substring(0, r.pos).split('\n').length;
    console.log('  pos ' + r.pos + ' (line ~' + lineNum + '): ' + r.ctx);
  });
} else {
  console.log('No raw HTML found. Error may be from other syntax issue.');
}
