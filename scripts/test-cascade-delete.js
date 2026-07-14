/**
 * 级联删除 API 级验证脚本
 * 通过管理员账号登录后，创建含测试文件的临时实体，再调用 DELETE 接口，
 * 验证数据库记录与 uploads/ 下的文件是否一并清理。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:3003';
const ADMIN_USERNAME = '15302206488';
const ADMIN_PASSWORD = '000000';
const ROOT = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

let token = null;
let passed = 0;
let failed = 0;
const cleanupEntities = [];

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

function request(method, endpoint, body, auth = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (auth && token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers
      },
      (res) => {
        let chunks = '';
        res.on('data', c => chunks += c);
        res.on('end', () => {
          let bodyObj = null;
          try { bodyObj = JSON.parse(chunks); } catch (e) { bodyObj = chunks; }
          resolve({ status: res.statusCode, body: bodyObj });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function ensureUploadsSubdir(subdir) {
  const dir = path.join(UPLOADS_DIR, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createTestFile(subdir, filename) {
  const dir = ensureUploadsSubdir(subdir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, `test-${Date.now()}`);
  return `/uploads/${subdir}/${filename}`;
}

function fileExists(url) {
  const match = String(url).match(/^\/uploads\/([^/]+)\/(.+)$/);
  if (!match) return false;
  return fs.existsSync(path.join(UPLOADS_DIR, match[1], match[2]));
}

async function login() {
  const res = await request('POST', '/api/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }, false);
  assert('管理员登录成功', res.status === 200 && res.body?.success, `status=${res.status}`);
  token = res.body?.data?.token;
  assert('获取到 token', !!token);
}

async function testPaperCascade() {
  console.log('\n--- 测试：试卷删除级联 ---');
  const questionImg = createTestFile('images', `paper-q-${Date.now()}.png`);
  const paperRes = await request('POST', '/api/papers', {
    name: `级联测试试卷-${Date.now()}`,
    categoryId: 'cat-test',
    type: 'fixed',
    questions: [
      {
        questionId: 'q-1',
        score: 5,
        order: 0,
        content: '题干',
        type: 'single',
        options: [{ label: 'A', text: 'A' }],
        answer: 'A',
        image: questionImg
      }
    ],
    status: 'draft'
  });
  assert('创建测试试卷成功', paperRes.status === 201 && paperRes.body?.success, `status=${paperRes.status}`);
  const paperId = paperRes.body?.data?.id;
  assert('试卷 ID 存在', !!paperId);

  const examRes = await request('POST', '/api/exams', {
    title: `级联测试考试-${Date.now()}`,
    paperId: paperId,
    paperName: '级联测试试卷',
    duration: 60,
    passingScore: 60
  });
  assert('创建关联考试成功', examRes.status === 200 && examRes.body?.success, `status=${examRes.status}`);
  const examId = examRes.body?.exam?.id;

  const delRes = await request('DELETE', `/api/papers/${paperId}`);
  assert('删除试卷成功', delRes.status === 200 && delRes.body?.success, `status=${delRes.status}`);

  const getRes = await request('GET', `/api/papers/${paperId}`);
  assert('试卷已不存在', getRes.status === 404, `status=${getRes.status}`);

  assert('题目图片文件已删除', !fileExists(questionImg), `文件仍存在: ${questionImg}`);

  if (examId) {
    const examGet = await request('GET', `/api/exams/${examId}`);
    const examData = examGet.body?.data || examGet.body;
    assert('关联考试 paperId 已置空', examData?.paperId == null, `paperId=${examData?.paperId}`);
    assert('关联考试 paperName 已置空', !examData?.paperName, `paperName=${examData?.paperName}`);
    cleanupEntities.push({ type: 'exam', id: examId });
  }
}

async function testBannerCascade() {
  console.log('\n--- 测试：轮播图删除级联 ---');
  const coverUrl = createTestFile('covers', `banner-${Date.now()}.png`);
  const bannerRes = await request('POST', '/api/banners', {
    img: coverUrl,
    courseId: null,
    announcementId: null,
    status: 'published'
  });
  assert('创建测试轮播图成功', bannerRes.status === 200 && bannerRes.body?.success, `status=${bannerRes.status}`);
  const bannerId = bannerRes.body?.banner?.id;
  assert('轮播图 ID 存在', !!bannerId);

  const delRes = await request('DELETE', `/api/banners/${bannerId}`);
  assert('删除轮播图成功', delRes.status === 200 && delRes.body?.success, `status=${delRes.status}`);
  assert('轮播图封面文件已删除', !fileExists(coverUrl), `文件仍存在: ${coverUrl}`);
}

async function testNoticeCascade() {
  console.log('\n--- 测试：公告删除级联 ---');
  const noticeImg = createTestFile('images', `notice-${Date.now()}.png`);
  const noticeRes = await request('POST', '/api/notices', {
    title: `级联测试公告-${Date.now()}`,
    content: `<p>内容<img src="${noticeImg}"></p>`,
    status: 'published'
  });
  assert('创建测试公告成功', noticeRes.status === 200 && noticeRes.body?.success, `status=${noticeRes.status}`);
  const noticeId = noticeRes.body?.notice?.id || noticeRes.body?.data?.id;
  assert('公告 ID 存在', !!noticeId);

  // 创建访问记录
  await request('POST', `/api/notices/${noticeId}/visit`, { userId: 'test-user', username: '测试用户' });

  const delRes = await request('DELETE', `/api/notices/${noticeId}`);
  assert('删除公告成功', delRes.status === 200 && delRes.body?.success, `status=${delRes.status}`);
  assert('公告正文图片已删除', !fileExists(noticeImg), `文件仍存在: ${noticeImg}`);

  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  const visits = (data.notice_visits || []).filter(v => v.noticeId === noticeId);
  assert('公告访问记录已清空', visits.length === 0, `剩余 ${visits.length} 条`);
}

async function testQuestionBankCascade() {
  console.log('\n--- 测试：题库删除级联 ---');
  const qImg = createTestFile('images', `question-${Date.now()}.png`);

  // 先确保有分类
  const catRes = await request('POST', '/api/categories', { name: `级联测试分类-${Date.now()}`, parentId: null });
  const categoryId = catRes.body?.data?.id || catRes.body?.category?.id || 1;

  const bankRes = await request('POST', '/api/question-banks', {
    name: `级联测试题库-${Date.now()}`,
    categoryId: categoryId,
    description: '测试'
  });
  assert('创建测试题库成功', bankRes.status === 201 && bankRes.body?.success, `status=${bankRes.status}`);
  const bankId = bankRes.body?.data?.id;
  assert('题库 ID 存在', !!bankId);

  const questionRes = await request('POST', '/api/questions', {
    bankId: bankId,
    title: '测试题目',
    type: 'single',
    options: [{ label: 'A', text: '选项A', image: qImg }],
    answer: 'A'
  });
  assert('创建测试题目成功', questionRes.status === 201 && questionRes.body?.success, `status=${questionRes.status}`);
  const questionId = questionRes.body?.data?.id;

  const delRes = await request('DELETE', `/api/question-banks/${bankId}`);
  assert('删除题库成功', delRes.status === 200 && delRes.body?.success, `status=${delRes.status}`);
  assert('题目图片已删除', !fileExists(qImg), `文件仍存在: ${qImg}`);

  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  const remainingQuestions = (data.questions || []).filter(q => q.bankId === bankId);
  assert('题库下题目已清空', remainingQuestions.length === 0, `剩余 ${remainingQuestions.length} 题`);
}

async function testLecturerCascade() {
  console.log('\n--- 测试：讲师删除级联 ---');
  const avatarUrl = createTestFile('avatars', `lecturer-${Date.now()}.png`);
  const lecturerRes = await request('POST', '/api/lecturers', {
    name: `级联测试讲师-${Date.now()}`,
    avatar: avatarUrl,
    title: '测试职称',
    bio: '测试简介'
  });
  assert('创建测试讲师成功', lecturerRes.status === 200 && lecturerRes.body?.success, `status=${lecturerRes.status}`);
  const lecturerId = lecturerRes.body?.lecturer?.id;
  assert('讲师 ID 存在', !!lecturerId);

  // 添加课酬记录
  await request('POST', '/api/lecturer-payment-records', {
    lecturerId: lecturerId,
    amount: 100,
    date: '2026-07-13'
  });

  const delRes = await request('DELETE', `/api/lecturers/${lecturerId}`);
  assert('删除讲师成功', delRes.status === 200 && delRes.body?.success, `status=${delRes.status}`);
  assert('讲师头像已删除', !fileExists(avatarUrl), `文件仍存在: ${avatarUrl}`);

  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  const payments = (data.lecturer_payment_records || []).filter(r => String(r.lecturerId) === String(lecturerId));
  assert('讲师课酬记录已清空', payments.length === 0, `剩余 ${payments.length} 条`);
}

async function testUserCascade() {
  console.log('\n--- 测试：用户删除级联 ---');
  const suffix = String(Date.now()).slice(-8);
  const username = `cu${suffix}`;
  const phone = `138${suffix}`;
  const avatarUrl = createTestFile('avatars', `user-${suffix}.png`);

  const regRes = await request('POST', '/api/auth/register', {
    username: username,
    password: '123456',
    phone: phone,
    realName: '级联测试用户',
    department: '测试部'
  }, false);
  assert('创建测试用户成功', regRes.status === 200 && regRes.body?.success, `status=${regRes.status}, body=${JSON.stringify(regRes.body)}`);
  const userId = regRes.body?.data?.user?.id;
  assert('用户 ID 存在', !!userId);

  // 注册接口不接收 avatar，通过更新接口设置头像
  await request('PUT', `/api/auth/users/${userId}`, { avatar: avatarUrl });

  // 添加一些关联数据
  await request('POST', '/api/notices/1/visit', { userId: String(userId), username: '级联测试用户' });

  const delRes = await request('DELETE', `/api/auth/users/${userId}`);
  assert('删除用户成功', delRes.status === 200 && delRes.body?.success, `status=${delRes.status}`);
  assert('用户头像已删除', !fileExists(avatarUrl), `文件仍存在: ${avatarUrl}`);

  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  const user = (data.registered_users || []).find(u => u.id === userId);
  assert('用户主记录已删除', !user);
  assert('用户学习记录动态键已清理', data[`user_learning_${userId}`] === undefined);
}

async function cleanup() {
  console.log('\n--- 清理残留测试数据 ---');
  for (const item of cleanupEntities) {
    try {
      await request('DELETE', `/api/exams/${item.id}`);
    } catch (e) {
      // ignore
    }
  }
}

async function main() {
  console.log('开始级联删除 API 验证...');
  await login();
  await testPaperCascade();
  await testBannerCascade();
  await testNoticeCascade();
  await testQuestionBankCascade();
  await testLecturerCascade();
  await testUserCascade();
  await cleanup();
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
