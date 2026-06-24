const fs = require('fs');
const path = 'E:/培训相关/桌面/learning/dashboard.html';
const buf = fs.readFileSync(path);

// Check first bytes
console.log('BOM (UTF-8)?', buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF);
console.log('BOM (UTF-16 LE)?', buf[0] === 0xFF && buf[1] === 0xFE);
console.log('BOM (UTF-16 BE)?', buf[0] === 0xFE && buf[1] === 0xFF);
console.log('First 20 bytes (hex):', buf.slice(0, 20).toString('hex'));

// Try to read as UTF-8 and check for garbled characters
try {
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  console.log('\nFirst 5 lines:');
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const preview = lines[i].substring(0, 80);
    console.log(`  Line ${i + 1}: ${preview}`);
  }
  
  // Try restore: read as GBK, write as UTF-8
  try {
    const restored = buf.toString('gbk');
    // Check if Chinese chars appear
    const chineseCount = (restored.match(/[\u4e00-\u9fff]/g) || []).length;
    const questionCount = (restored.match(/\ufffd/g) || []).length;
    console.log(`\nGBK restore: Chinese chars=${chineseCount}, replacement chars=${questionCount}`);
    if (chineseCount > 100 && questionCount < 50) {
      console.log('GBK restore looks promising!');
      // Check first lines of restored version
      const rlines = restored.split('\n');
      for (let i = 0; i < Math.min(5, rlines.length); i++) {
        console.log(`  Line ${i + 1}: ${rlines[i].substring(0, 80)}`);
      }
    }
  } catch (e) {
    console.log('GBK restore failed:', e.message);
  }
  
  // Try latin1 encoding
  try {
    const lat = buf.toString('latin1');
    const chineseLat = (lat.match(/[\u00c0-\u00ff]{2,}/g) || []).length;
    console.log(`\nLatin1: multi-byte latin clusters=${chineseLat}`);
  } catch (e) {}
  
} catch (e) {
  console.log('Read error:', e.message);
}
