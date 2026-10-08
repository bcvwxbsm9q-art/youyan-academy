// 页面大纲分析脚本：提取每个页面 title / 主标题 / 导航 / 共享依赖
const fs = require('fs');
const path = require('path');

const ROOT = 'E:/培训相关/桌面/learning';
const pages = [
  // PC 用户端
  'index.html','training-plan.html','course.html','teacher.html','center.html','player.html','messages.html',
  // PC 功能/返回型
  'exam.html','survey.html','training-signin.html','bank-detail.html',
  // PC 后台
  'dashboard.html','dashboard_merged.html',
  // 移动端 H5
  'm/index.html','m/training.html','m/course.html','m/course-detail.html','m/player.html','m/mine.html','m/messages.html','m/notice.html','m/notices.html'
];

function strip(s){ return (s||'').replace(/\s+/g,' ').trim(); }
function textOf(html, re, limit){
  const out=[]; let m; const r=new RegExp(re,'gi');
  while((m=r.exec(html))!==null && out.length<(limit||999)){ out.push(strip(m[1])); }
  return out;
}

const results=[];
for(const p of pages){
  const file=path.join(ROOT,p);
  if(!fs.existsSync(file)){ results.push({page:p,missing:true}); continue; }
  const html=fs.readFileSync(file,'utf8');
  const title=strip((html.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const h1=textOf(html,'<h1[^>]*>([\\s\\S]*?)<\\/h1>');
  const h2=textOf(html,'<h2[^>]*>([\\s\\S]*?)<\\/h2>');
  const h3=textOf(html,'<h3[^>]*>([\\s\\S]*?)<\\/h3>');
  // 导航链接：取 nav 内 a 标签文字
  const navBlock=(html.match(/<nav[\s\S]*?<\/nav>/i)||[html])[0];
  const navLinks=textOf(navBlock,'<a[^>]*>([\\s\\S]*?)<\\/a>',30).filter(t=>t && t.length<20);
  const deps=['auth-guard.js','auth-modal.js','notification.js','xp-system.js']
    .filter(d=>html.includes(d));
  results.push({page:p,title,sizeKB:Math.round(html.length/1024),h1,h2:h2.slice(0,15),h3:h3.slice(0,15),nav:navLinks.slice(0,12),deps});
}
console.log(JSON.stringify(results,null,1));
