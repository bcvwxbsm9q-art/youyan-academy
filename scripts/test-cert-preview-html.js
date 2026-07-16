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

// 模拟前端 renderDesignPageInner 生成的内层 HTML（保留 {{token}} 占位）
function buildPreviewHtml() {
  return `<div class="cert-design-page" style="width:410px;height:594px;position:relative;overflow:hidden;background:linear-gradient(135deg,#f6d365 0%,#fda085 100%);">
    <div class="cert-design-el" style="left:57px;top:77px;width:296px;height:52px;font-size:38px;font-weight:bold;color:#1a365d;font-family:'STSong','SimSun','Times New Roman',serif;letter-spacing:4px;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;">
      <div style="display:block;width:100%;text-align:center;line-height:1.2;text-decoration:none;">{{title}}</div>
    </div>
    <div class="cert-design-el" style="left:57px;top:160px;width:178px;height:24px;font-size:15px;font-weight:bold;color:#334155;font-family:'STSong','SimSun','Times New Roman',serif;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;">
      <div style="display:block;width:100%;text-align:left;line-height:1.2;text-decoration:underline;">{{name}}</div>
    </div>
    <div class="cert-design-el" style="left:57px;top:202px;width:296px;height:120px;font-size:15px;color:#334155;font-family:'STSong','SimSun','Times New Roman',serif;display:flex;align-items:center;overflow:hidden;padding:0 4px;box-sizing:border-box;">
      <div style="display:block;width:100%;text-align:left;line-height:2;text-decoration:none;">　　在本公司工作期间，认真负责，表现<br>优秀，现授予<span style="color:#c41e0f;font-weight:bold;">年度优秀员工</span>荣誉称号。特<br>发此证，以示表彰。</div>
    </div>
    <div class="cert-design-el" style="left:146px;top:476px;width:207px;height:22px;font-size:15px;color:#334155;font-family:'STSong','SimSun','Times New Roman',serif;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;">
      <div style="display:block;width:100%;text-align:right;line-height:1.2;text-decoration:none;">{{company}}</div>
    </div>
    <div class="cert-design-el" style="left:161px;top:505px;width:192px;height:22px;font-size:15px;color:#334155;font-family:'STSong','SimSun','Times New Roman',serif;display:flex;align-items:center;overflow:hidden;padding:2px 6px;box-sizing:border-box;">
      <div style="display:block;width:100%;text-align:right;line-height:1.2;text-decoration:none;">{{date}}</div>
    </div>
  </div>`;
}

async function main() {
  const server = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  try {
    await waitForServer();
    const admin = { id: 1780909174403, username: '15302206488', role: 'admin' };
    const token = createToken(admin);

    const html = buildPreviewHtml();
    const fill = {
      title: '荣誉证书',
      name: '张三',
      date: '2026-07-16',
      company: '广州游雁网络科技有限公司'
    };

    const res = await request('POST', '/api/certificates/preview-html', { html, layout: 'portrait', fill }, token);
    if (!res.body.success) {
      console.error('preview-html 接口失败:', res.body.error || res.body);
      return;
    }
    const dataUrl = res.body.data.dataUrl;
    const base64 = dataUrl.split(',')[1];
    const buf = Buffer.from(base64, 'base64');
    const outPath = path.join(__dirname, 'test-preview-html-output.png');
    fs.writeFileSync(outPath, buf);
    console.log('已生成 preview-html PNG:', outPath);
    fs.writeFileSync(path.join(__dirname, 'test-preview-html.html'), html);
  } catch (e) {
    console.error('测试失败:', e.message);
  } finally {
    server.kill('SIGTERM');
  }
}

main();
