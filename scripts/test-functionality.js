/**
 * 游雁学院 - 功能完整性测试脚本
 * 通过 HTTP API 测试所有核心功能模块
 */

const http = require('http');
const path = require('path');

// 测试配置
const BASE_URL = 'http://localhost:3003';

// 颜色输出
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(type, message, status = '') {
    const statusColor = status === 'PASS' ? colors.green : status === 'FAIL' ? colors.red : colors.yellow;
    const prefix = status ? `[${statusColor}${status}${colors.reset}]` : `[${colors.blue}TEST${colors.reset}]`;
    console.log(`${prefix} ${message}`);
}

function logSection(title) {
    console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.blue}${title}${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);
}

// HTTP请求封装
function request(method, urlPath, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(body)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: body
                    });
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// 测试结果统计
const results = {
    passed: 0,
    failed: 0,
    total: 0,
    errors: []
};

function recordTest(name, passed, error = '') {
    results.total++;
    if (passed) {
        results.passed++;
        log('info', name, 'PASS');
    } else {
        results.failed++;
        log('error', `${name}${error ? ': ' + error : ''}`, 'FAIL');
        results.errors.push({ name, error });
    }
}

// ============================================================
// 测试用例
// ============================================================

async function testHealthCheck() {
    logSection('1. 健康检查测试');

    try {
        const res = await request('GET', '/api/health');
        recordTest('健康检查 API', res.status === 200 && res.data.status === 'ok');
        if (res.data.database) console.log(`   数据库状态: ${res.data.database}`);
        if (res.data.stats) {
            console.log(`   统计数据: 用户 ${res.data.stats.users || 0}, 课程 ${res.data.stats.courses || 0}`);
        }
    } catch (e) {
        recordTest('健康检查 API', false, e.message);
    }
}

async function testAuthModule() {
    logSection('2. 用户认证模块测试');
    let testToken = null;
    const testUsername = `testuser_${Date.now()}`;

    // 2.1 注册新用户
    try {
        const res = await request('POST', '/api/auth/register', {
            username: testUsername,
            email: `${testUsername}@test.com`,
            password: 'Test123456',
            realName: '测试用户'
        });
        recordTest('用户注册', res.status === 201 && res.data.success === true);
        if (res.data.data?.token) {
            testToken = res.data.data.token;
            log('info', '注册成功，获得 Token');
        }
    } catch (e) {
        recordTest('用户注册', false, e.message);
    }

    // 2.2 管理员登录
    try {
        const res = await request('POST', '/api/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        recordTest('管理员登录', res.status === 200 && res.data.success === true);
        if (res.data.data?.token) {
            testToken = res.data.data.token;
            log('info', '管理员登录成功');
        }
    } catch (e) {
        recordTest('管理员登录', false, e.message);
    }

    // 2.3 学生账户登录
    try {
        const res = await request('POST', '/api/auth/login', {
            username: 'student',
            password: 'student123'
        });
        recordTest('学生登录', res.status === 200 && res.data.success === true);
        if (res.data.data?.user?.role === 'student') {
            log('info', '学生角色验证正确');
        }
    } catch (e) {
        recordTest('学生登录', false, e.message);
    }

    // 2.4 错误密码测试
    try {
        const res = await request('POST', '/api/auth/login', {
            username: 'admin',
            password: 'wrongpassword'
        });
        recordTest('错误密码拒绝', res.status === 401);
    } catch (e) {
        recordTest('错误密码拒绝', false, e.message);
    }

    // 2.5 无效用户名测试
    try {
        const res = await request('POST', '/api/auth/login', {
            username: 'nonexistent_user_xxx',
            password: 'anypassword'
        });
        recordTest('无效用户名拒绝', res.status === 401);
    } catch (e) {
        recordTest('无效用户名拒绝', false, e.message);
    }

    // 2.6 获取当前用户信息
    if (testToken) {
        try {
            const res = await request('GET', '/api/auth/me', null, testToken);
            recordTest('获取当前用户', res.status === 200 && res.data.success === true);
            if (res.data.data) {
                console.log(`   用户名: ${res.data.data.username}, 角色: ${res.data.data.role}`);
            }
        } catch (e) {
            recordTest('获取当前用户', false, e.message);
        }
    } else {
        recordTest('获取当前用户', false, '无有效 Token');
    }

    // 2.7 无效 Token 测试
    try {
        const res = await request('GET', '/api/auth/me', null, 'invalid-token-12345');
        recordTest('无效 Token 拒绝', res.status === 403 || res.status === 401);
    } catch (e) {
        recordTest('无效 Token 拒绝', false, e.message);
    }

    // 2.8 无 Token 访问受保护资源
    try {
        const res = await request('GET', '/api/auth/me', null, null);
        recordTest('无 Token 拒绝访问', res.status === 401);
    } catch (e) {
        recordTest('无 Token 拒绝访问', false, e.message);
    }

    // 2.9 登出功能
    if (testToken) {
        try {
            const res = await request('POST', '/api/auth/logout', null, testToken);
            recordTest('用户登出', res.status === 200 && res.data.success === true);
        } catch (e) {
            recordTest('用户登出', false, e.message);
        }
    }

    return testToken;
}

async function testDataAPI(token) {
    logSection('3. 数据 API 测试');

    // 3.1 获取所有数据
    try {
        const res = await request('GET', '/api/data');
        recordTest('获取所有数据', res.status === 200 && typeof res.data === 'object');
        if (res.data) {
            console.log(`   用户数: ${res.data.users?.length || 0}`);
            console.log(`   课程数: ${res.data.courses?.length || 0}`);
            console.log(`   题库数: ${res.data.question_banks?.length || 0}`);
            console.log(`   公告数: ${res.data.notices?.length || 0}`);
            console.log(`   Banner数: ${res.data.banners?.length || 0}`);
        }
    } catch (e) {
        recordTest('获取所有数据', false, e.message);
    }

    // 3.2 获取用户列表
    try {
        const res = await request('GET', '/api/data/users');
        recordTest('获取用户列表', res.status === 200 && Array.isArray(res.data));
        if (Array.isArray(res.data)) {
            const hasAdmin = res.data.some(u => u.username === 'admin');
            recordTest('管理员账户存在', hasAdmin);
        }
    } catch (e) {
        recordTest('获取用户列表', false, e.message);
    }

    // 3.3 获取课程列表
    try {
        const res = await request('GET', '/api/data/courses');
        recordTest('获取课程列表', res.status === 200 && Array.isArray(res.data));
    } catch (e) {
        recordTest('获取课程列表', false, e.message);
    }

    // 3.4 获取题库列表
    try {
        const res = await request('GET', '/api/data/question_banks');
        recordTest('获取题库列表', res.status === 200 && Array.isArray(res.data));
    } catch (e) {
        recordTest('获取题库列表', false, e.message);
    }

    // 3.5 获取公告列表
    try {
        const res = await request('GET', '/api/data/notices');
        recordTest('获取公告列表', res.status === 200 && Array.isArray(res.data));
    } catch (e) {
        recordTest('获取公告列表', false, e.message);
    }

    // 3.6 获取 Banner 列表
    try {
        const res = await request('GET', '/api/data/banners');
        recordTest('获取 Banner 列表', res.status === 200 && Array.isArray(res.data));
    } catch (e) {
        recordTest('获取 Banner 列表', false, e.message);
    }

    // 3.7 无效 key 返回 404
    try {
        const res = await request('GET', '/api/data/invalid_key_xxx');
        recordTest('无效 key 返回 404', res.status === 404);
    } catch (e) {
        recordTest('无效 key 返回 404', false, e.message);
    }
}

async function testQuestionBankAPI(token) {
    logSection('4. 题库管理 API 测试');

    let createdBankId = null;
    let createdQuestionId = null;
    const uniqueName = `测试题库_${Date.now()}`;

    // 4.1 获取所有题库
    try {
        const res = await request('GET', '/api/questions/question-banks');
        recordTest('获取题库列表', res.status === 200 && Array.isArray(res.data));
        console.log(`   当前题库数: ${res.data.length || 0}`);
    } catch (e) {
        recordTest('获取题库列表', false, e.message);
    }

    // 4.2 创建新题库
    try {
        const res = await request('POST', '/api/questions/question-banks', {
            name: uniqueName,
            category: '技术培训',
            description: '自动化测试创建的题库',
            status: 'active'
        });
        recordTest('创建新题库', res.status === 201);
        if (res.data?.id) {
            createdBankId = res.data.id;
            console.log(`   创建的题库 ID: ${createdBankId}`);
        }
    } catch (e) {
        recordTest('创建新题库', false, e.message);
    }

    // 4.3 重复创建题库测试
    try {
        const res = await request('POST', '/api/questions/question-banks', {
            name: uniqueName,
            category: '技术培训'
        });
        recordTest('重复题库名处理', res.status === 201 || res.status === 200);
    } catch (e) {
        recordTest('重复题库名处理', false, e.message);
    }

    // 4.4 获取单个题库
    if (createdBankId) {
        try {
            const res = await request('GET', `/api/questions/question-banks/${createdBankId}`);
            recordTest('获取单个题库', res.status === 200 && res.data.id === createdBankId);
            if (res.data.name) console.log(`   题库名称: ${res.data.name}`);
        } catch (e) {
            recordTest('获取单个题库', false, e.message);
        }
    }

    // 4.5 更新题库
    if (createdBankId) {
        try {
            const res = await request('PUT', `/api/questions/question-banks/${createdBankId}`, {
                name: `更新后的题库_${Date.now()}`,
                description: '测试更新描述'
            });
            recordTest('更新题库', res.status === 200);
        } catch (e) {
            recordTest('更新题库', false, e.message);
        }
    }

    // 4.6 创建试题 - 单选题
    if (createdBankId) {
        try {
            const res = await request('POST', '/api/questions/questions', {
                bankId: createdBankId,
                type: 'single_choice',
                content: '自动化测试创建的选择题？',
                options: [
                    { label: 'A', text: '选项 A - 正确' },
                    { label: 'B', text: '选项 B' },
                    { label: 'C', text: '选项 C' },
                    { label: 'D', text: '选项 D' }
                ],
                answer: 'A',
                analysis: '这是答案解析',
                difficulty: 'medium'
            });
            recordTest('创建单选题', res.status === 201);
            if (res.data?.id) {
                createdQuestionId = res.data.id;
                console.log(`   创建的试题 ID: ${createdQuestionId}`);
            }
        } catch (e) {
            recordTest('创建单选题', false, e.message);
        }
    }

    // 4.7 创建试题 - 多选题
    if (createdBankId) {
        try {
            const res = await request('POST', '/api/questions/questions', {
                bankId: createdBankId,
                type: 'multiple_choice',
                content: '自动化测试创建的多选题？',
                options: [
                    { label: 'A', text: '选项 A' },
                    { label: 'B', text: '选项 B - 正确' },
                    { label: 'C', text: '选项 C - 正确' },
                    { label: 'D', text: '选项 D' }
                ],
                answer: 'B,C',
                difficulty: 'hard'
            });
            recordTest('创建多选题', res.status === 201);
        } catch (e) {
            recordTest('创建多选题', false, e.message);
        }
    }

    // 4.8 获取题库下的试题
    if (createdBankId) {
        try {
            const res = await request('GET', `/api/questions/questions?bankId=${createdBankId}`);
            recordTest('获取试题列表(按题库)', res.status === 200 && Array.isArray(res.data));
            console.log(`   题库试题数: ${res.data.length || 0}`);
        } catch (e) {
            recordTest('获取试题列表(按题库)', false, e.message);
        }
    }

    // 4.9 获取单个试题
    if (createdQuestionId) {
        try {
            const res = await request('GET', `/api/questions/questions/${createdQuestionId}`);
            recordTest('获取单个试题', res.status === 200 && res.data.id === createdQuestionId);
        } catch (e) {
            recordTest('获取单个试题', false, e.message);
        }
    }

    // 4.10 按类型筛选试题
    if (createdBankId) {
        try {
            const res = await request('GET', `/api/questions/questions?bankId=${createdBankId}&type=single_choice`);
            recordTest('按类型筛选试题', res.status === 200 && Array.isArray(res.data));
        } catch (e) {
            recordTest('按类型筛选试题', false, e.message);
        }
    }

    // 4.11 按难度筛选试题
    if (createdBankId) {
        try {
            const res = await request('GET', `/api/questions/questions?bankId=${createdBankId}&difficulty=medium`);
            recordTest('按难度筛选试题', res.status === 200 && Array.isArray(res.data));
        } catch (e) {
            recordTest('按难度筛选试题', false, e.message);
        }
    }

    // 4.12 更新试题
    if (createdQuestionId) {
        try {
            const res = await request('PUT', `/api/questions/questions/${createdQuestionId}`, {
                content: '更新后的试题内容',
                difficulty: 'easy'
            });
            recordTest('更新试题', res.status === 200);
        } catch (e) {
            recordTest('更新试题', false, e.message);
        }
    }

    // 4.13 删除试题
    if (createdQuestionId) {
        try {
            const res = await request('DELETE', `/api/questions/questions/${createdQuestionId}`);
            recordTest('删除试题', res.status === 200);
        } catch (e) {
            recordTest('删除试题', false, e.message);
        }
    }

    // 4.14 验证试题已删除
    if (createdQuestionId) {
        try {
            const res = await request('GET', `/api/questions/questions/${createdQuestionId}`);
            recordTest('验证试题已删除', res.status === 404);
        } catch (e) {
            recordTest('验证试题已删除', false, e.message);
        }
    }

    // 4.15 删除题库
    if (createdBankId) {
        try {
            const res = await request('DELETE', `/api/questions/question-banks/${createdBankId}`);
            recordTest('删除题库', res.status === 200);
        } catch (e) {
            recordTest('删除题库', false, e.message);
        }
    }

    // 4.16 验证题库已删除
    if (createdBankId) {
        try {
            const res = await request('GET', `/api/questions/question-banks/${createdBankId}`);
            recordTest('验证题库已删除', res.status === 404);
        } catch (e) {
            recordTest('验证题库已删除', false, e.message);
        }
    }

    // 4.17 获取不存在的题库
    try {
        const res = await request('GET', '/api/questions/question-banks/999999999');
        recordTest('获取不存在的题库', res.status === 404);
    } catch (e) {
        recordTest('获取不存在的题库', false, e.message);
    }
}

async function testFileUploads() {
    logSection('5. 文件上传 API 测试');

    // 5.1 无文件上传测试
    try {
        const url = new URL('/api/upload', BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Length': '0'
            }
        };

        const result = await new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, data: JSON.parse(body) });
                    } catch (e) {
                        resolve({ status: res.statusCode, data: body });
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });

        recordTest('无文件上传拒绝', result.status === 400);
    } catch (e) {
        recordTest('无文件上传拒绝', false, e.message);
    }
}

async function testPageAccessibility() {
    logSection('6. 页面可访问性测试');

    const pages = [
        { path: '/login.html', name: '登录页' },
        { path: '/register.html', name: '注册页' },
        { path: '/index.html', name: '首页' },
        { path: '/course.html', name: '课程中心' },
        { path: '/teacher.html', name: '讲师风采' },
        { path: '/center.html', name: '个人中心' },
        { path: '/dashboard.html', name: '学习仪表盘' },
        { path: '/player.html', name: '视频播放器' },
        { path: '/admin.html', name: '管理后台' }
    ];

    for (const page of pages) {
        try {
            const res = await request('GET', page.path);
            const isHtml = typeof res.data === 'string' && (res.data.includes('<!DOCTYPE') || res.data.includes('<html'));
            recordTest(`${page.name} (${page.path})`, res.status === 200 && isHtml);
        } catch (e) {
            recordTest(`${page.name} (${page.path})`, false, e.message);
        }
    }
}

async function testErrorHandling() {
    logSection('7. 错误处理测试');

    // 7.1 无效路由返回 404
    try {
        const res = await request('GET', '/api/invalid/route/xxx');
        recordTest('无效 API 路由返回 404', res.status === 404);
    } catch (e) {
        recordTest('无效 API 路由返回 404', false, e.message);
    }

    // 7.2 POST 到 GET 路由
    try {
        const res = await request('POST', '/api/data');
        recordTest('错误方法拒绝', res.status >= 400);
    } catch (e) {
        recordTest('错误方法拒绝', false, e.message);
    }

    // 7.3 缺少必填字段
    try {
        const res = await request('POST', '/api/auth/register', {
            username: 'test'
            // 缺少 password
        });
        recordTest('缺少必填字段拒绝', res.status === 400);
    } catch (e) {
        recordTest('缺少必填字段拒绝', false, e.message);
    }
}

// ============================================================
// 主测试流程
// ============================================================

async function runTests() {
    console.log('\n');
    console.log(`${colors.green}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.green}    游雁学院 - 功能完整性测试${colors.reset}`);
    console.log(`${colors.green}${'='.repeat(60)}${colors.reset}`);
    console.log(`\n测试时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log(`测试地址: ${BASE_URL}`);

    // 检查服务器是否运行
    try {
        const testReq = await request('GET', '/api/health');
        console.log(`\n${colors.green}✓ 服务器连接成功${colors.reset}`);
    } catch (e) {
        console.log(`\n${colors.red}✗ 无法连接到服务器 ${BASE_URL}${colors.reset}`);
        console.log(`${colors.yellow}请确保服务器已启动: node server-production.js${colors.reset}`);
        process.exit(1);
    }

    // 执行测试
    await testHealthCheck();
    await testAuthModule();
    await testDataAPI();
    await testQuestionBankAPI();
    await testFileUploads();
    await testPageAccessibility();
    await testErrorHandling();

    // 输出测试结果汇总
    logSection('测试结果汇总');

    console.log(`\n${colors.green}✓ 通过: ${results.passed}${colors.reset}`);
    console.log(`${colors.red}✗ 失败: ${results.failed}${colors.reset}`);
    console.log(`总计: ${results.total} 项测试`);

    const passRate = ((results.passed / results.total) * 100).toFixed(1);
    const rateColor = results.failed === 0 ? colors.green : colors.yellow;
    console.log(`\n通过率: ${rateColor}${passRate}%${colors.reset}`);

    if (results.errors.length > 0) {
        console.log(`\n${colors.red}失败详情:${colors.reset}`);
        results.errors.forEach((err, i) => {
            console.log(`  ${i + 1}. ${err.name}`);
            console.log(`     错误: ${err.error}`);
        });
    }

    if (results.failed === 0) {
        console.log(`\n${colors.green}🎉 所有测试通过！系统功能完整。${colors.reset}\n`);
    } else {
        console.log(`\n${colors.yellow}⚠️  部分测试失败，请检查上述失败项。${colors.reset}\n`);
    }

    return results;
}

// 运行测试
runTests()
    .then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(err => {
        console.error('测试执行失败:', err);
        process.exit(1);
    });
