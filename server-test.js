/**
 * 游雁学院 - 测试服务器
 * 简化版：仅提供静态文件服务，用于测试前端界面
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = 3003;

// 中间件
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(__dirname));

// 请求日志
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleString('zh-CN');
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: '服务器运行中（测试模式 - 无数据库）',
        mode: 'test',
        timestamp: new Date().toISOString()
    });
});

// 模拟登录接口（返回假数据）
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username && password) {
        res.json({
            success: true,
            token: 'test-token-' + Date.now(),
            user: {
                id: 1,
                username: username,
                real_name: '测试用户',
                email: 'test@example.com',
                department: '测试部',
                role: 'admin'
            }
        });
    } else {
        res.status(400).json({ success: false, message: '请提供用户名和密码' });
    }
});

// 模拟课程数据
app.get('/api/courses', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 1, title: 'JavaScript 入门', description: '学习 JavaScript 基础', cover_image: '/images/course1.jpg' },
            { id: 2, title: 'Node.js 实战', description: '使用 Node.js 构建后端服务', cover_image: '/images/course2.jpg' },
            { id: 3, title: 'React 高级', description: '深入学习 React 框架', cover_image: '/images/course3.jpg' }
        ]
    });
});

// 404 处理
app.use((req, res) => {
    // 尝试查找文件
    let filePath = path.join(__dirname, req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
    }
    res.status(404).send('文件未找到: ' + req.path);
});

// 启动服务器
app.listen(port, () => {
    console.log('');
    console.log('========================================');
    console.log('   游雁学院 - 测试服务器');
    console.log('========================================');
    console.log('');
    console.log(`✅ 服务器已启动！`);
    console.log(`🌐 访问地址: http://localhost:${port}`);
    console.log(`📱 首页: http://localhost:${port}/index.html`);
    console.log('');
    console.log('📋 可用页面:');
    console.log(`   - 首页:     http://localhost:${port}/index.html`);
    console.log(`   - 首页:     http://localhost:${port}/index.html (弹窗登录)`);
    console.log(`   - 课程页:   http://localhost:${port}/course.html`);
    console.log(`   - 管理后台: http://localhost:${port}/dashboard.html`);
    console.log('');
    console.log('⚠️  注意: 这是测试服务器，数据操作将被模拟');
    console.log('   如需完整功能，请安装 Windows SDK 后运行完整服务器');
    console.log('');
});
