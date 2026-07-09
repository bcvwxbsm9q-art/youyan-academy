const http = require('http');

const BASE = 'http://localhost:3003';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 3003,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function assert(name, condition, details) {
  if (condition) {
    console.log(`[PASS] ${name}`);
    return true;
  }
  console.error(`[FAIL] ${name}${details ? ': ' + details : ''}`);
  return false;
}

async function run() {
  let passed = 0;
  let failed = 0;
  let testPaperId = null;

  try {
    // Test 1: GET /api/papers
    const listRes = await request('GET', '/api/papers');
    if (await assert('GET /api/papers returns 200', listRes.status === 200, `status=${listRes.status}`)) passed++; else failed++;
    if (await assert('GET /api/papers returns success', listRes.body && listRes.body.success === true)) passed++; else failed++;
    if (await assert('GET /api/papers returns array data', Array.isArray(listRes.body.data))) passed++; else failed++;

    // Test 2: POST /api/papers
    const createRes = await request('POST', '/api/papers', {
      name: '单元测试试卷-' + Date.now(),
      categoryId: 'cat-test',
      categoryName: '测试分类',
      description: '由 scripts/test-api.js 自动创建',
      questions: [],
      status: 'draft'
    });
    if (await assert('POST /api/papers returns 201', createRes.status === 201, `status=${createRes.status}`)) passed++; else failed++;
    if (await assert('POST /api/papers returns success', createRes.body && createRes.body.success === true)) passed++; else failed++;
    testPaperId = createRes.body && createRes.body.data && createRes.body.data.id;
    if (await assert('POST /api/papers returns paper id', !!testPaperId, `id=${testPaperId}`)) passed++; else failed++;

    // Test 3: PUT /api/papers/:id
    if (testPaperId) {
      const updateRes = await request('PUT', `/api/papers/${testPaperId}`, {
        name: '单元测试试卷-已更新',
        categoryId: 'cat-test',
        categoryName: '测试分类',
        description: '更新测试',
        questions: [],
        status: 'draft'
      });
      if (await assert('PUT /api/papers/:id returns 200', updateRes.status === 200, `status=${updateRes.status}`)) passed++; else failed++;
      if (await assert('PUT /api/papers/:id returns updated name', updateRes.body && updateRes.body.data && updateRes.body.data.name === '单元测试试卷-已更新')) passed++; else failed++;
    }

    // Test 4: DELETE /api/papers/:id
    if (testPaperId) {
      const deleteRes = await request('DELETE', `/api/papers/${testPaperId}`);
      if (await assert('DELETE /api/papers/:id returns 200', deleteRes.status === 200, `status=${deleteRes.status}`)) passed++; else failed++;
      if (await assert('DELETE /api/papers/:id returns success', deleteRes.body && deleteRes.body.success === true)) passed++; else failed++;

      const verifyRes = await request('GET', `/api/papers/${testPaperId}`);
      if (await assert('Deleted paper returns 404', verifyRes.status === 404, `status=${verifyRes.status}`)) passed++; else failed++;
    }

    // Test 5: GET /api/courses (smoke for cascade delete context)
    const coursesRes = await request('GET', '/api/courses');
    if (await assert('GET /api/courses returns 200', coursesRes.status === 200, `status=${coursesRes.status}`)) passed++; else failed++;

    console.log(`\nTotal: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('[ERROR]', err.message);
    if (testPaperId) {
      try {
        await request('DELETE', `/api/papers/${testPaperId}`);
      } catch (e) {
        // ignore cleanup error
      }
    }
    process.exit(1);
  }
}

run();
