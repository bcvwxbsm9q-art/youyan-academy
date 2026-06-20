const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'dashboard.html');

// Watch for changes and strip BOM
let lastContent = '';
function stripBOM() {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('[' + new Date().toLocaleTimeString() + '] BOM stripped');
  }
}

// Initial strip
stripBOM();

// Watch file
fs.watchFile(filePath, { interval: 500 }, () => {
  stripBOM();
});

console.log('Watching dashboard.html for BOM...');
