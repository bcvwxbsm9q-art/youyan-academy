const fs = require('fs');
const base = 'E:/培训相关/桌面/learning';

// Read both files
const backup = fs.readFileSync(base + '/dashboard.html.bak_20260612_2216', 'utf8');
const current = fs.readFileSync(base + '/dashboard.html', 'utf8');

const bLines = backup.split('\n');
const cLines = current.split('\n');

console.log('Backup:', bLines.length, 'lines (clean)');
console.log('Current:', cLines.length, 'lines (garbled)');

// Strategy: Build a map of "code signature" -> backup line
// Signature = line with all Chinese + comments removed, only code structure
function codeSig(line) {
  return line
    .replace(/\/\/.*$/, '')           // remove // comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove /* */ comments
    .replace(/<!--[\s\S]*?-->/g, '')  // remove HTML comments
    // Remove ALL non-ASCII chars (handles garbled, Chinese, symbols, etc.)
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

// Build sig -> backup line map
const sigMap = {};
for (const line of bLines) {
  const sig = codeSig(line);
  if (sig.length >= 3 && !sigMap[sig]) {
    sigMap[sig] = line;
  }
}

// Also build exact normalized map
function normKey(line) {
  return line.replace(/\s+/g, ' ').trim();
}
const exactMap = {};
for (const line of bLines) {
  const k = normKey(line);
  if (k.length >= 3) exactMap[k] = line;
}

console.log('Backup signatures:', Object.keys(sigMap).length);
console.log('Backup exact keys:', Object.keys(exactMap).length);

// Now process current file line by line
const result = [];
let stats = { matchSig: 0, matchExact: 0, newCode: 0, empty: 0, garbled: 0 };

for (const cl of cLines) {
  // Try exact match first
  const nk = normKey(cl);
  if (nk.length >= 3 && exactMap[nk]) {
    result.push(exactMap[nk]);
    stats.matchExact++;
    continue;
  }
  
  // Try code signature match
  const sig = codeSig(cl);
  if (sig.length >= 3 && sigMap[sig]) {
    result.push(sigMap[sig]);
    stats.matchSig++;
    continue;
  }
  
  // Not in backup - check if it's real code or garbled
  if (cl.trim() === '') {
    result.push(cl);
    stats.empty++;
    continue;
  }
  
  // Count valid code characters
  const codeChars = (cl.match(/[a-zA-Z0-9{}()[\]<>.;:=,_\-+*\/!@#$%^&|"'`~\s]/g) || []).length;
  const totalChars = cl.length;
  const codeRatio = totalChars > 0 ? codeChars / totalChars : 0;
  
  if (codeRatio > 0.5 || codeChars > 10) {
    // This is real new code, keep it
    result.push(cl);
    stats.newCode++;
  } else {
    // Likely garbled Chinese - skip it (empty line)
    result.push('');
    stats.garbled++;
  }
}

// Post-process: clean up remaining garbled content
for (let i = 0; i < result.length; i++) {
  let line = result[i];
  
  // Fix line 1: remove leading garbage before <!DOCTYPE
  if (i === 0 && line.includes('<!DOCTYPE')) {
    line = line.substring(line.indexOf('<!DOCTYPE'));
  }
  
  // Remove long runs of ? characters (garbled text indicator)
  line = line.replace(/[?]{4,}/g, '');
  
  // Clean up double/multiple spaces from ? removals only (preserve indentation)
  const trimmed = line.trimStart();
  const indent = line.substring(0, line.length - trimmed.length);
  line = indent + trimmed.replace(/ {2,}/g, ' ');
  
  result[i] = line;
}

// Second pass: replace any remaining garbled comment lines (non-ASCII >3 chars with <40% ASCII)
for (let i = 0; i < result.length; i++) {
  let line = result[i];
  const trimmed = line.trim();
  if (trimmed.length === 0) continue;
  
  const nonAsciiCount = (trimmed.match(/[^\x00-\x7F]/g) || []).length;
  if (nonAsciiCount > 3 && nonAsciiCount / trimmed.length > 0.35) {
    // Keep HTML structure, remove garbled content within
    if (/^<!--|\/\/|<\?/.test(trimmed)) {
      line = line.replace(/[^\x00-\x7F]{2,}/g, '').replace(/\s{2,}/g, ' ').trim();
      const cleanSig = line.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '');
      if (cleanSig.length < 5) line = '';
    } else {
      line = '';
    }
  }
  
  result[i] = line;
}

// Write result
const outPath = base + '/dashboard_merged.html';
fs.writeFileSync(outPath, result.join('\n'), 'utf8');

console.log('\n=== MERGE RESULT ===');
console.log('Match exact:', stats.matchExact);
console.log('Match by code sig:', stats.matchSig);
console.log('New code kept:', stats.newCode);
console.log('Empty lines:', stats.empty);
console.log('Garbled (cleaned):', stats.garbled);
console.log('Total output:', result.length, 'lines');
console.log('Output:', outPath);
