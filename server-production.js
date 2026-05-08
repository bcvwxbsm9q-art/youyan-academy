/**
 * 游雁学院 - 生产环境服务器
 * 
 * 功能：
 * - SQLite 数据库支持
 * - JWT 用户认证
 * - 前后端数据联动
 * - 文件上传支持
 * - 生产环境优化
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const Database = require('better-sqlite3');

// 加载环境变量
dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

// ============================================================
// 配置
// ============================================================

// 数据库路径
const DB_PATH = path.join(__dirname, 'data', 'academy.db');

// 确保数据目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('✅ 创建数据目录:', dbDir);
}

// 检查数据库是否存在
const dbExists = fs.existsSync(DB_PATH);
if (!dbExists) {
    console.log('\n⚠️  数据库不存在！请先运行初始化脚本：');
    console.log('   node scripts/init-database.js\n');
}

// 文件上传配置
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 限制
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('不支持的文件类型'));
        }
    }
});

// ============================================================
// 中间件
// ============================================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(__dirname, {
    maxAge: '1d',
    etag: true,
    lastModified: true
}));

// 请求日志
app.use((req, res, next) => {
    const ignore = ['/favicon.ico'];
    if (!ignore.includes(req.path)) {
        console.log(`${new Date().toLocaleString('zh-CN')} - ${req.method} ${req.url}`);
    }
    next();
});

// ============================================================
// 数据库连接
// ============================================================

function getDb() {
    return new Database(DB_PATH);
}

// ============================================================
// 导入路由
// ============================================================

let authRoutes;
let questionRoutes;

try {
    const authModule = require('./routes/auth-routes');
    authRoutes = authModule.router;
    // 导出认证中间件供其他路由使用
    app.set('authenticateToken', authModule.authenticateToken);
    console.log('✅ 加载认证路由');
} catch (err) {
    console.error('❌ 加载认证路由失败:', err.message);
}

try {
    questionRoutes = require('./routes/question-routes');
    console.log('✅ 加载题库路由');
} catch (err) {
    console.error('❌ 加载题库路由失败:', err.message);
}

// ============================================================
// API 路由
// ============================================================

// 认证路由
if (authRoutes) {
    app.use('/api/auth', authRoutes);
    console.log('✅ 挂载认证 API: /api/auth');
}

// 题库路由
if (questionRoutes) {
    app.use('/api/questions', questionRoutes);
    console.log('✅ 挂载题库 API: /api/questions');
}

// ============================================================
// 通用数据 API（兼容旧版前端）
// ============================================================

app.get('/api/data', (req, res) => {
    const db = getDb();
    
    try {
        const data = {
            users: db.prepare('SELECT id, username, email, real_name, department, role FROM users').all(),
            courses: db.prepare('SELECT * FROM courses WHERE status = "published"').all(),
            question_banks: db.prepare('SELECT * FROM question_banks').all(),
            notices: db.prepare('SELECT * FROM notices WHERE status = "published"').all(),
            banners: db.prepare('SELECT * FROM banners WHERE status = "enabled" ORDER BY sort_order').all()
        };
        
        db.close();
        res.json(data);
    } catch (err) {
        console.error('获取数据失败:', err.message);
        res.status(500).json({ error: '获取数据失败' });
    }
});

// 按 key 获取数据
app.get('/api/data/:key', (req, res) => {
    const db = getDb();
    const key = req.params.key;
    
    try {
        let data;
        
        switch(key) {
            case 'users':
                data = db.prepare('SELECT id, username, email, real_name, department, role FROM users').all();
                break;
            case 'courses':
                data = db.prepare('SELECT * FROM courses WHERE status = "published"').all();
                break;
            case 'question_banks':
                data = db.prepare('SELECT * FROM question_banks').all();
                break;
            case 'notices':
                data = db.prepare('SELECT * FROM notices WHERE status = "published"').all();
                break;
            case 'banners':
                data = db.prepare('SELECT * FROM banners WHERE status = "enabled" ORDER BY sort_order').all();
                break;
            default:
                db.close();
                return res.status(404).json({ error: '数据不存在' });
        }
        
        db.close();
        res.json(data);
    } catch (err) {
        console.error('获取数据失败:', err.message);
        db.close();
        res.status(500).json({ error: '获取数据失败' });
    }
});

// ============================================================
// 文件上传 API
// ============================================================

app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '未选择文件' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        
        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.originalname,
            size: req.file.size
        });
    } catch (err) {
        console.error('文件上传失败:', err.message);
        res.status(500).json({ error: '文件上传失败' });
    }
});

// ============================================================
// 健康检查
// ============================================================

app.get('/api/health', (req, res) => {
    const db = getDb();
    
    try {
        // 检查数据库连接
        db.prepare('SELECT 1').get();
        
        const stats = {
            users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
            courses: db.prepare('SELECT COUNT(*) as count FROM courses').get().count,
            question_banks: db.prepare('SELECT COUNT(*) as count FROM question_banks').get().count,
            questions: db.prepare('SELECT COUNT(*) as count FROM questions').get().count
        };
        
        db.close();
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: 'connected',
            stats
        });
    } catch (err) {
        console.error('健康检查失败:', err.message);
        db.close();
        res.status(500).json({
            status: 'error',
            message: err.message
        });
    }
});

// ============================================================
// 错误处理
// ============================================================

app.use((err, req, res, next) => {
    console.error('服务器错误:', err.stack);
    
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            error: '文件上传错误',
            message: err.message
        });
    }
    
    res.status(err.status || 500).json({
        error: '服务器内部错误',
        message: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
    });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        error: '资源不存在',
        path: req.path
    });
});

// ============================================================
// 启动服务器
// ============================================================

app.listen(port, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 游雁学院服务器已启动');
    console.log('='.repeat(60));
    console.log(`📡 服务地址：http://localhost:${port}`);
    console.log(`📊 健康检查：http://localhost:${port}/api/health`);
    console.log(`🔐 登录页面：http://localhost:${port}/login.html`);
    console.log(`📝 注册页面：http://localhost:${port}/register.html`);
    console.log(`💾 数据库路径：${DB_PATH}`);
    console.log(`📁 上传目录：${uploadDir}`);
    console.log('='.repeat(60));
    console.log('\n💡 提示：');
    console.log('   - 默认管理员账户：admin / admin123');
    console.log('   - 默认学生账户：student / student123');
    console.log('   - 首次使用请确保已运行数据库初始化脚本');
    console.log('');
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('\n👋 收到 SIGTERM 信号，正在关闭服务器...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n👋 收到 SIGINT 信号，正在关闭服务器...');
    process.exit(0);
});

module.exports = app;
