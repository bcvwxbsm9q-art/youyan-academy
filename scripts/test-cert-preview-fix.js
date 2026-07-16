const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3003';
const JWT_SECRET = 'youyan-academy-secret-key-2024';

function createToken(user) {
  const payload = { id: user.id, username: user.username, role: user.role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

function request(method, pathStr, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = { hostname: 'localhost', port: 3003, path: pathStr, method, headers: { 'Content-Type': 'application/json' } };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function waitForServer(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      const req = http.get(`${BASE}/api/certificates/templates`, (res) => {
        if (res.statusCode === 200) return resolve();
        setTimeout(poll, 200);
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('server start timeout'));
        setTimeout(poll, 200);
      });
    };
    poll();
  });
}

async function main() {
  const server = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  try {
    await waitForServer();
    const admin = { id: 1780909174403, username: '15302206488', role: 'admin' };
    const token = createToken(admin);

    // 使用与前端 applyTemplate('v1') 一致的默认设计稿
    const dims = { w: 410, h: 594 };
    const padX = Math.round(dims.w * 0.14);
    const innerW = dims.w - padX * 2;
    const design = {
      _tplKey: 'v1',
      layout: 'portrait',
      background: { type: 'preset', value: 'v1' },
      borderColor: '#764ba2',
      accentColor: '#9333ea',
      fontFamily: "'STSong','SimSun','Times New Roman',serif",
      elements: [
        { id: 't1', type: 'text', key: 'title', x: padX, y: 77, w: innerW, h: 52, text: '{{title}}', fontSize: 38, fontWeight: 'bold', letterSpacing: 4, fontStyle: 'normal', textAlign: 'center', color: '#1a365d', underline: false, fontFamily: "'STSong','SimSun','Times New Roman',serif" },
        { id: 's1', type: 'text', key: 'subtitle', x: padX, y: 113, w: innerW, h: 20, text: 'CERTIFICATE OF HONORS', fontSize: 12, fontWeight: 'normal', letterSpacing: 2, fontStyle: 'normal', textAlign: 'center', color: '#64748b', underline: false, fontFamily: 'Arial,sans-serif' },
        { id: 'n1', type: 'text', key: 'name', x: padX, y: 160, w: Math.round(innerW * 0.60), h: 24, text: '{{name}}', fontSize: 15, fontWeight: 'bold', fontStyle: 'normal', textAlign: 'left', color: '#334155', underline: true, fontFamily: "'STSong','SimSun','Times New Roman',serif" },
        { id: 'c1', type: 'text', key: 'content', x: padX, y: 202, w: innerW, h: 120, text: '\u3000\u3000在本公司工作期间，认真负责，表现\n优秀，现授予【年度优秀员工】荣誉称号。特\n发此证，以示表彰。', fontSize: 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left', lineHeight: 2, color: '#334155', underline: false, fontFamily: "'STSong','SimSun','Times New Roman',serif" },
        { id: 'co1', type: 'text', key: 'company', x: Math.round(padX + innerW * 0.30), y: 476, w: Math.round(innerW * 0.70), h: 22, text: '{{company}}', fontSize: 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'right', color: '#334155', underline: false, fontFamily: "'STSong','SimSun','Times New Roman',serif" },
        { id: 'd1', type: 'text', key: 'date', x: Math.round(padX + innerW * 0.35), y: 505, w: Math.round(innerW * 0.65), h: 22, text: '{{date}}', fontSize: 15, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'right', color: '#334155', underline: false, fontFamily: "'STSong','SimSun','Times New Roman',serif" }
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

    const res = await request('POST', '/api/certificates/preview', { design, fill }, token);
    if (!res.body.success) {
      console.error('预览接口失败:', res.body.error || res.body);
      return;
    }
    const dataUrl = res.body.data.dataUrl;
    const base64 = dataUrl.split(',')[1];
    const buf = Buffer.from(base64, 'base64');
    const outPath = path.join(__dirname, 'test-preview-output.png');
    fs.writeFileSync(outPath, buf);
    console.log('已生成预览 PNG:', outPath);
    // 同时把请求 design 的 JSON 存下来，方便复现
    fs.writeFileSync(path.join(__dirname, 'test-preview-design.json'), JSON.stringify({ design, fill }, null, 2));
  } catch (e) {
    console.error('测试失败:', e.message);
  } finally {
    server.kill('SIGTERM');
  }
}

main();
