const fs = require('fs');
const path = require('path');

const dims = { w: 410, h: 594 };
const padX = Math.round(dims.w * 0.14);
const innerW = dims.w - padX * 2;
const design = {
  layout: 'portrait',
  background: { type: 'preset', value: 'v1' },
  borderColor: '#764ba2',
  accentColor: '#9333ea',
  fontFamily: "'STSong','SimSun','Times New Roman',serif",
  elements: [
    { id: 't1', type: 'text', key: 'title', x: padX, y: 77, w: innerW, h: 52, text: '{{title}}', fontSize: 38, fontWeight: 'bold', letterSpacing: 4, fontStyle: 'normal', textAlign: 'center', color: '#1a365d', underline: false, fontFamily: "'STSong','SimSun','Times New Roman',serif" },
    { id: 's1', type: 'text', key: 'subtitle', x: padX, y: 113, w: innerW, h: 20, text: 'CERTIFICATE OF HONORS', fontSize: 12, fontWeight: 'normal', letterSpacing: 2, fontStyle: 'normal', textAlign: 'center', color: '#64748b', underline: false, fontFamily: 'Arial,sans-serif' },
    { id: 'n1', type: 'text', key: 'name', x: padX, y: 160, w: Math.round(innerW * 0.60), h: 24, text: '{{name}}', fontSize: 15, fontWeight: 'bold', fontStyle: 'normal', textAlign: 'left', color: '#334155', underline: true, fontFamily: "'STSong','SimSun','Times New Roman',serif" },
    { id: 'c1', type: 'text', key: 'content', x: padX, y: 202, w: innerW, h: 120, text: '　　在本公司工作期间，认真负责，表现\n优秀，现授予【年度优秀员工】荣誉称号。特\n发此证，以示表彰。', fontSize: 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left', lineHeight: 2, color: '#334155', underline: false, fontFamily: "'STSong','SimSun','Times New Roman',serif" },
    { id: 'co1', type: 'text', key: 'company', x: Math.round(padX + innerW * 0.38), y: 476, w: Math.round(innerW * 0.62), h: 22, text: '{{company}}', fontSize: 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'right', color: '#334155', underline: false, fontFamily: "'STSong','SimSun','Times New Roman',serif" },
    { id: 'd1', type: 'text', key: 'date', x: Math.round(padX + innerW * 0.44), y: 505, w: Math.round(innerW * 0.56), h: 22, text: '{{date}}', fontSize: 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'right', color: '#334155', underline: false, fontFamily: "'STSong','SimSun','Times New Roman',serif" }
  ],
  seal: null
};
const fill = {
  title: '荣誉证书',
  name: '张三',
  certNo: 'V1-20260716-0001',
  date: '2026-07-16',
  company: '广州游雁网络科技有限公司',
  content: '在本公司工作期间，认真负责，表现优秀，现授予【年度优秀员工】荣誉称号。特发此证，以示表彰。'
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fillTokens(text, fill) {
  return String(text == null ? '' : text).replace(/\{\{(\w+)\}\}/g, (m, k) => (fill[k] !== undefined ? fill[k] : m));
}

function renderRichText(text, fill) {
  const t = fillTokens(text, fill);
  const esc = s => escapeHtml(s).replace(/\n/g, '<br>');
  return String(t).split(/(【(?:#[0-9a-fA-F]{6}:)?[^】]*】)/g).map(p => {
    if (p.startsWith('【') && p.endsWith('】')) {
      const inner = p.slice(1, -1);
      const m = inner.match(/^#([0-9a-fA-F]{6}):(.*)$/);
      if (m) return '<span style="color:#' + m[1].toLowerCase() + ';font-weight:bold;">' + esc(m[2]) + '</span>';
      return '<span style="color:#c41e0f;font-weight:bold;">' + esc(inner) + '</span>';
    }
    return esc(p);
  }).join('');
}

function fileToDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/png';
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const bgUri = fileToDataUri(path.join(__dirname, '..', 'uploads', 'cert-templates', 'cert-v1.png'));

function renderDesignPageInner(d, scale, fill) {
  const pw = dims.w * scale, ph = dims.h * scale;
  const bc = d.borderColor, ac = d.accentColor;
  let s = `<div style="width:${pw}px;height:${ph}px;position:relative;overflow:hidden;background-image:url('${bgUri}');background-size:cover;background-position:center;">`;
  s += `<div style="position:absolute;inset:${6 * scale}px;border:${2 * scale}px solid ${bc};opacity:0.4;pointer-events:none;"></div>`;
  s += `<div style="position:absolute;inset:${12 * scale}px;border:1px solid ${bc};opacity:0.22;pointer-events:none;"></div>`;
  [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']].forEach(([v, h]) => {
    s += `<div style="position:absolute;${v}:${10 * scale}px;${h}:${10 * scale}px;width:${10 * scale}px;height:${10 * scale}px;border-${v === 'top' ? 'top' : 'bottom'}:${3 * scale}px solid ${ac};border-${h}:${3 * scale}px solid ${ac};opacity:0.6;"></div>`;
  });
  (d.elements || []).forEach(el => {
    const fs = el.fontSize * scale;
    const lh = el.lineHeight != null ? el.lineHeight : (el.key === 'content' ? 1.5 : 1.2);
    s += `<div class="cert-design-el" style="left:${el.x * scale}px;top:${el.y * scale}px;width:${el.w * scale}px;height:${el.h * scale}px;font-size:${fs}px;font-weight:${el.fontWeight};font-style:${el.fontStyle};color:${el.color};font-family:${el.fontFamily};letter-spacing:${el.letterSpacing || 0}px;display:flex;align-items:center;overflow:hidden;padding:${el.key === 'content' ? '0 4px' : '2px 6px'};box-sizing:border-box;border:1px solid red;"><div style="display:block;width:100%;text-align:${el.textAlign};line-height:${lh};text-decoration:${el.underline ? 'underline' : 'none'};">${renderRichText(el.text, fill)}</div></div>`;
  });
  s += '</div>';
  return s;
}

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:0;}</style></head><body>${renderDesignPageInner(design, 3.4756, fill)}</body></html>`;
fs.writeFileSync(path.join(__dirname, 'cert-inspect.html'), html);
console.log('HTML written to scripts/cert-inspect.html');
