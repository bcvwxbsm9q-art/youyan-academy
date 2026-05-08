/**
 * 数据库初始化脚本
 * 创建所有必要的表结构和初始数据
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/academy.db');

// 确保数据目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('✅ 创建数据目录:', dbDir);
}

console.log('🚀 开始初始化数据库...');
console.log('📁 数据库路径:', DB_PATH);

// 删除旧数据库（如果存在）
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('🗑️  已删除旧数据库');
}

const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

console.log('\n📊 创建数据表...\n');

// ============================================================
// 1. 用户表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    real_name TEXT,
    avatar TEXT,
    department TEXT,
    position TEXT,
    role TEXT DEFAULT 'student',
    points INTEGER DEFAULT 0,
    credits INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✅ 创建用户表 (users)');

// ============================================================
// 2. 用户会话表（JWT Token 黑名单）
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_jti TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    is_valid INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);
console.log('✅ 创建用户会话表 (user_sessions)');

// ============================================================
// 3. 课程表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    cover_image TEXT,
    teacher_id INTEGER,
    category TEXT,
    duration_minutes INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    enroll_count INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    video_url TEXT,
    resources TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  )
`);
console.log('✅ 创建课程表 (courses)');

// ============================================================
// 4. 题库表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS question_banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    total_questions INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);
console.log('✅ 创建题库表 (question_banks)');

// ============================================================
// 5. 题目表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    content TEXT NOT NULL,
    options TEXT,
    answer TEXT NOT NULL,
    analysis TEXT,
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bank_id) REFERENCES question_banks(id) ON DELETE CASCADE
  )
`);
console.log('✅ 创建题目表 (questions)');

// ============================================================
// 6. 用户课程进度表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS user_course_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    progress_percent REAL DEFAULT 0,
    last_watched_position INTEGER DEFAULT 0,
    is_completed INTEGER DEFAULT 0,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(user_id, course_id)
  )
`);
console.log('✅ 创建用户课程进度表 (user_course_progress)');

// ============================================================
// 7. 用户答题记录表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS user_question_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    user_answer TEXT,
    is_correct INTEGER,
    time_spent_seconds INTEGER,
    answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )
`);
console.log('✅ 创建用户答题记录表 (user_question_records)');

// ============================================================
// 8. 系统配置表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✅ 创建系统配置表 (system_settings)');

// ============================================================
// 9. 公告表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT DEFAULT 'system',
    status TEXT DEFAULT 'draft',
    published_by INTEGER,
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (published_by) REFERENCES users(id)
  )
`);
console.log('✅ 创建公告表 (notices)');

// ============================================================
// 10. Banner 表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image TEXT,
    link TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'enabled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✅ 创建 Banner 表 (banners)');

// ============================================================
// 创建索引
// ============================================================
console.log('\n🔖 创建索引...\n');

db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
console.log('✅ 创建用户表索引');

db.exec('CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category)');
db.exec('CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status)');
console.log('✅ 创建课程表索引');

db.exec('CREATE INDEX IF NOT EXISTS idx_questions_bank_id ON questions(bank_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type)');
console.log('✅ 创建题目表索引');

db.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_jti)');
console.log('✅ 创建会话表索引');

// ============================================================
// 插入初始数据
// ============================================================
console.log('\n📝 插入初始数据...\n');

// 创建默认管理员账户（密码：admin123）
const adminPasswordHash = bcrypt.hashSync('admin123', 10);
db.prepare(`
  INSERT INTO users (username, email, real_name, password_hash, role, department, position)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run('admin', 'admin@youyan.com', '系统管理员', adminPasswordHash, 'admin', '技术部', '系统管理员');
console.log('✅ 创建默认管理员账户 (用户名：admin, 密码：admin123)');

// 创建测试学生账户（密码：student123）
const studentPasswordHash = bcrypt.hashSync('student123', 10);
db.prepare(`
  INSERT INTO users (username, email, real_name, password_hash, role, department)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('student', 'student@youyan.com', '测试学生', studentPasswordHash, 'student', '学习部');
console.log('✅ 创建测试学生账户 (用户名：student, 密码：student123)');

// 插入默认系统配置
db.exec(`
  INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('site_name', '游雁学院', '网站名称'),
    ('site_description', '专业的在线学习平台', '网站描述'),
    ('allow_registration', 'true', '是否允许注册'),
    ('default_avatar', '/images/default-avatar.png', '默认头像'),
    ('points_per_course', '10', '完成课程获得积分'),
    ('points_per_question', '1', '答对题目获得积分')
`);
console.log('✅ 插入默认系统配置');

// 插入示例 Banner
db.exec(`
  INSERT INTO banners (title, image, link, sort_order) VALUES
    ('欢迎加入游雁学院', 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=1200&h=400&fit=crop', '', 1),
    ('新课程上线', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&h=400&fit=crop', '', 2),
    ('限时优惠活动', 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&h=400&fit=crop', '', 3)
`);
console.log('✅ 插入示例 Banner 数据');

// 关闭数据库连接
db.close();

console.log('\n' + '='.repeat(60));
console.log('🎉 数据库初始化完成！');
console.log('='.repeat(60));
console.log('\n📋 默认账户信息：');
console.log('   管理员：admin / admin123');
console.log('   学生：student / student123');
console.log('\n💡 下一步：');
console.log('   1. 运行 npm start 启动服务器');
console.log('   2. 访问 http://localhost:3003/login.html');
console.log('   3. 使用默认账户登录测试');
console.log('');
