const { execSync } = require('child_process');
const fs = require('fs');
const cwd = 'E:/培训相关/桌面/learning';

// 1. Get git log for dashboard.html
try {
  const log = execSync('git --no-pager log --oneline -5 dashboard.html', { cwd, encoding: 'utf8' });
  fs.writeFileSync(cwd + '/tmp/git_info.txt', '=== GIT LOG ===\n' + log + '\n');
} catch(e) {
  fs.writeFileSync(cwd + '/tmp/git_info.txt', '=== GIT LOG FAILED ===\n' + e.message + '\n');
}

// 2. Count lines in backup vs current
const backupLines = fs.readFileSync(cwd + '/dashboard.html.bak_20260612_2216', 'utf8').split('\n').length;
const currentLines = fs.readFileSync(cwd + '/dashboard.html', 'utf8').split('\n').length;
const addedLines = currentLines - backupLines;

fs.appendFileSync(cwd + '/tmp/git_info.txt', '\n=== LINE STATS ===\n');
fs.appendFileSync(cwd + '/tmp/git_info.txt', 'Backup lines: ' + backupLines + '\n');
fs.appendFileSync(cwd + '/tmp/git_info.txt', 'Current lines: ' + currentLines + '\n');
fs.appendFileSync(cwd + '/tmp/git_info.txt', 'Added: ' + addedLines + '\n');

// 3. Find exam-related code sections in current file
const currentContent = fs.readFileSync(cwd + '/dashboard.html', 'utf8');
const examMatches = [];
const lines = currentContent.split('\n');
let inExamSection = false;
let examStart = 0;

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/exam|paper|question|test|quiz|scr|scoring|choice|answer/i.test(l) && 
      (l.includes('function') || l.includes('<!--') || l.includes('//') || l.includes('var ') || l.includes('let ') || l.includes('const ') || l.includes('class'))) {
    if (!inExamSection) {
      examStart = i + 1;
      inExamSection = true;
    }
  }
  if (inExamSection && l.trim() === '' && i - examStart > 50) {
    examMatches.push({start: examStart, end: i + 1});
    inExamSection = false;
  }
}

fs.appendFileSync(cwd + '/tmp/git_info.txt', '\n=== POTENTIAL EXAM CODE SECTIONS ===\n');
examMatches.forEach(m => {
  fs.appendFileSync(cwd + '/tmp/git_info.txt', 'Lines ' + m.start + ' - ' + m.end + '\n');
});

// Also search for keywords
const keywords = ['paperQuestion', 'paperQuestions', 'renderPaper', 'savePaper', 'addQuestion', 
  'examEditor', 'paperHistory', 'questionBank', 'examList', 'paperList', 'examForm'];
keywords.forEach(kw => {
  const regex = new RegExp(kw, 'gi');
  const matches = currentContent.match(regex);
  if (matches) {
    fs.appendFileSync(cwd + '/tmp/git_info.txt', `  "${kw}" found ${matches.length} times\n`);
  }
});

console.log('Analysis written to tmp/git_info.txt');
