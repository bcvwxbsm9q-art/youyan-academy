const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const port = 3003;

// 创建 uploads 目录
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 中间件配置
app.use(express.json({ limit: '50mb' }));  // 解析 JSON 请求体
app.use(express.urlencoded({ extended: true, limit: '50mb' }));  // 解析 URL 编码的请求体

// 禁止 HTML 页面缓存（确保浏览器始终获取最新版本）
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// 静态文件服务 - 必须放在其他路由之前
app.use('/uploads', express.static(uploadsDir));  // 上传的文件
app.use(express.static(path.join(__dirname)));     // 前端页面和资源

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.query.type || 'misc';
    const targetDir = path.join(uploadsDir, subDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB限制
  fileFilter: (req, file, cb) => {
    // 允许的文件类型
    const allowedTypes = {
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      video: ['video/mp4', 'video/mpeg', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
      document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
                 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                 'text/plain', 'text/csv'],
      misc: ['*']
    };
    
    const type = req.query.type || 'misc';
    const allowed = type === 'misc' ? 
      [...allowedTypes.image, ...allowedTypes.video, ...allowedTypes.document] : 
      allowedTypes[type] || allowedTypes.misc;
    
    if (allowed.includes(file.mimetype) || allowedTypes.misc.includes('*')) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
    }
  }
});

// 数据存储文件路径
const DATA_FILE = path.join(__dirname, 'data.json');

// 默认管理员手机号（首次启动时自动创建）
const DEFAULT_ADMIN_PHONE = '15302206488';

// 简单的 JWT 实现
const JWT_SECRET = 'youyan-academy-secret-key-2024';
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天

function createToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + TOKEN_EXPIRY
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  try {
    const [encoded, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('hex');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
}

// 导入题库管理路由
const questionRoutes = require('./routes/question-routes');

// 中间件
app.use(express.static(__dirname, {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));
app.use(express.json());

// CORS支持
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 请求日志
app.use((req, res, next) => {
  const ignore = ['/favicon.ico'];
  if (!ignore.includes(req.path)) {
    console.log(`${new Date().toLocaleString('zh-CN')} - ${req.method} ${req.url}`);
  }
  next();
});

// ============================================================
// 数据读写工具
// ============================================================
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('写入数据失败:', e.message);
    return false;
  }
}

// 初始化管理员账号（服务器启动时调用）
function initDefaultAdmin() {
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  // 检查默认管理员是否已存在
  let adminUser = data.registered_users.find(u => u.username === DEFAULT_ADMIN_PHONE || u.phone === DEFAULT_ADMIN_PHONE);
  
  if (!adminUser) {
    // 创建默认管理员账号
    adminUser = {
      id: Date.now(),
      username: DEFAULT_ADMIN_PHONE,
      passwordHash: hashPassword(DEFAULT_ADMIN_PHONE),
      email: '',
      phone: DEFAULT_ADMIN_PHONE,
      realName: '系统管理员',
      department: '管理部',
      role: 'admin',
      avatar: '',
      createdAt: new Date().toLocaleString('zh-CN'),
      lastLogin: null,
      status: 'active'
    };
    data.registered_users.push(adminUser);
    writeData(data);
    console.log(`  默认管理员账号已创建: ${DEFAULT_ADMIN_PHONE}`);
  } else if (adminUser.role !== 'admin') {
    // 确保管理员角色正确，并重置密码为默认值
    adminUser.role = 'admin';
    adminUser.passwordHash = hashPassword(DEFAULT_ADMIN_PHONE);
    writeData(data);
    console.log(`  管理员账号角色已修正: ${DEFAULT_ADMIN_PHONE}`);
  } else {
    console.log(`  管理员账号已存在: ${DEFAULT_ADMIN_PHONE}`);
  }
}

// 从 course_ratings 计算课程平均评分
function getCourseAvgRating(data, courseId) {
  // 从 course_ratings 获取评分
  const ratings = (data.course_ratings || []).filter(r => r.courseId === courseId);
  // 同时从 course_interaction 数据获取评分（前端 DataAPI 存储的评分）
  const interactionKey = 'course_interaction_' + courseId;
  const interaction = data[interactionKey];
  if (interaction && interaction.ratingCount > 0) {
    // 合并两个来源评分数据
    const interactionSum = interaction.ratingSum || 0;
    const interactionCount = interaction.ratingCount || 0;
    const ratingsSum = ratings.reduce((s, r) => s + r.score, 0);
    const totalSum = interactionSum + ratingsSum;
    const totalCount = interactionCount + ratings.length;
    // 去重：如果 course_ratings 中的 userId 在 interaction 中也存在，只计算一次
    const interactionUserIds = new Set(Object.keys(interaction.userRatings || {}).map(String));
    let dedupSum = interactionSum;
    let dedupCount = interactionCount;
    ratings.forEach(r => {
      if (!interactionUserIds.has(String(r.userId))) {
        dedupSum += r.score;
        dedupCount++;
      }
    });
    if (dedupCount > 0) return Math.round((dedupSum / dedupCount) * 10) / 10;
  }
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((s, r) => s + r.score, 0) / ratings.length) * 10) / 10;
}

// ============================================================
// API 路由
// ============================================================

// API 响应禁止缓存
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// GET /api/data      - 获取所有数据（动态计算lecturers的courseCount）
app.get('/api/data', (req, res) => {
  const data = readData();
  // 动态计算每个讲师的课程数
  if (data.lecturers && data.management_courses) {
    data.lecturers = data.lecturers.map(l => ({
      ...l,
      courseCount: (data.management_courses || []).filter(c => String(c.lecturerId) === String(l.id)).length
    }));
  }
  res.json(data);
});

// GET /api/data/courses  - dashboard.html 兼容路由
app.get('/api/data/courses', (req, res) => {
  const data = readData();
  const courses = (data.management_courses || []).map(c => ({
    id: c.id,
    title: c.title,
    category: c.category || c.categoryId || '',
    duration_minutes: c.duration ? Math.floor(c.duration / 60) : (c.duration_minutes || 0),
    view_count: c.views || c.view_count || 0,
    status: c.status || 'draft',
    cover_image: c.cover || c.cover_image || '',
    categoryId: c.categoryId,
    lecturerId: c.lecturerId,
    description: c.description || '',
    videos: c.videos || [],
    rating: getCourseAvgRating(data, c.id) ?? c.rating ?? 0,
    createdAt: c.createdAt || ''
  }));
  res.json(courses);
});

// GET /api/data/categories - dashboard.html 兼容路由
app.get('/api/data/categories', (req, res) => {
  const data = readData();
  const categories = (data.course_categories || []).map(c => ({
    id: c.id,
    name: c.name,
    course_count: (data.management_courses || []).filter(course =>
      String(course.categoryId) === String(c.id) ||
      (c.children || []).some(sub => String(course.categoryId) === String(sub.id))
    ).length
  }));
  res.json(categories);
});

// GET /api/data/users - dashboard.html 兼容路由
app.get('/api/data/users', (req, res) => {
  const data = readData();
  const users = (data.registered_users || []).map(u => {
    const user = { ...u };
    delete user.passwordHash;
    return {
      id: user.id,
      username: user.username,
      real_name: user.realName || user.real_name || user.username,
      email: user.email || '',
      department: user.department || '',
      role: user.role === 'admin' ? 'admin' : (user.role || 'student'),
      status: user.status || 'active',
      created_at: user.createdAt || user.created_at || ''
    };
  });
  res.json(users);
});

// GET /api/data/:key - 获取指定键数据
app.get('/api/data/:key', (req, res) => {
  const key = req.params.key;
  const data = readData();
  if (data[key] !== undefined) {
    res.json(data[key]);
  } else {
    res.status(404).json({ error: '数据不存在' });
  }
});

// POST /api/sync/:key - 同步单个数据（前端数据保存时调用）
app.post('/api/sync/:key', (req, res) => {
  const key = req.params.key;
  const val = req.body;
  const data = readData();
  data[key] = val;
  if (writeData(data)) {
    res.json({ success: true, key });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// POST /api/sync-all  - 批量同步多个键
app.post('/api/sync-all', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: '请求体格式错误' });
  }
  const data = readData();
  let count = 0;
  for (const [key, val] of Object.entries(updates)) {
    data[key] = val;
    count++;
  }
  if (writeData(data)) {
    res.json({ success: true, count });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// POST /api/migrate  - 从 localStorage 迁移所有数据
app.post('/api/migrate', (req, res) => {
  const localData = req.body;
  const data = readData();
  let count = 0;
  for (const [key, val] of Object.entries(localData)) {
    if (val !== null && val !== undefined) {
      data[key] = val;
      count++;
    }
  }
  if (writeData(data)) {
    res.json({ success: true, message: `成功写入 ${count} 个数据项`, count });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// POST /api/reset   - 重置为默认种子数据
app.post('/api/reset', (req, res) => {
  const seedPath = path.join(__dirname, 'data-seed.json');
  try {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    if (writeData(seed)) {
      res.json({ success: true, message: '数据已重置为默认值' });
    } else {
      res.status(500).json({ success: false, error: '重置失败' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: '种子数据文件不存在' });
  }
});

// GET /api/health    - 健康检查
app.get('/api/health', (req, res) => {
  const data = readData();
  const questionBanks = data.question_banks || [];
  const allQuestions = questionBanks.reduce((acc, b) => acc + (b.questions || []).length, 0);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stats: {
      users: (data.registered_users || []).length,
      courses: (data.management_courses || []).length,
      question_banks: questionBanks.length,
      questions: allQuestions
    }
  });
});

// ============================================================
// 用户认证 API
// ============================================================

// 获取所有数据（用于首页初始化）
app.get('/api/data', (req, res) => {
  const data = readData();
  res.json(data);
});

// 用户注册
app.post('/api/auth/register', (req, res) => {
  const { username, password, email, phone, realName, department } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }
  
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ success: false, error: '用户名长度必须在3-20个字符之间' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: '密码长度至少6个字符' });
  }
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  // 检查用户名是否已存在
  if (data.registered_users.some(u => u.username === username)) {
    return res.status(400).json({ success: false, error: '用户名已存在' });
  }
  
  // 检查邮箱是否已存在（如果提供了邮箱）
  if (email && data.registered_users.some(u => u.email === email)) {
    return res.status(400).json({ success: false, error: '该邮箱已被注册' });
  }
  
  // 检查手机号是否已存在（如果提供了手机号）
  if (phone && data.registered_users.some(u => u.phone === phone)) {
    return res.status(400).json({ success: false, error: '该手机号已被注册' });
  }
  
  // 创建新用户
  const newUser = {
    id: Date.now(),
    username,
    passwordHash: hashPassword(password),
    email: email || '',
    phone: phone || '',
    realName: realName || username,
    department: department || '',
    role: 'user',
    avatar: '',
    createdAt: new Date().toLocaleString('zh-CN'),
    lastLogin: null,
    status: 'active'
  };
  
  data.registered_users.push(newUser);
  
  if (writeData(data)) {
    // 创建 token
    const token = createToken(newUser);
    const userInfo = { ...newUser };
    delete userInfo.passwordHash;
    
    res.json({
      success: true,
      message: '注册成功',
      data: {
        token,
        user: userInfo
      }
    });
  } else {
    res.status(500).json({ success: false, error: '注册失败，请稍后重试' });
  }
});

// 用户登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  // 查找用户（支持用户名、邮箱、手机号登录）
  const user = data.registered_users.find(u => 
    (u.username === username || u.email === username || u.phone === username)
  );
  
  if (!user) {
    return res.status(401).json({ success: false, error: '用户不存在' });
  }
  
  if (user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ success: false, error: '密码错误' });
  }
  
  if (user.status !== 'active') {
    return res.status(401).json({ success: false, error: '账户已被禁用' });
  }
  
  // 更新最后登录时间
  user.lastLogin = new Date().toLocaleString('zh-CN');
  writeData(data);
  
  // 创建 token
  const token = createToken(user);
  const userInfo = { ...user };
  delete userInfo.passwordHash;
  
  res.json({
    success: true,
    message: '登录成功',
    data: {
      token,
      user: userInfo
    }
  });
});

// 验证 token / 获取当前用户信息
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }
  
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  
  if (!payload) {
    return res.status(401).json({ success: false, error: '令牌无效或已过期' });
  }
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  const user = data.registered_users.find(u => u.id === payload.id);
  if (!user) {
    return res.status(401).json({ success: false, error: '用户不存在' });
  }
  const userInfo = { ...user };
  delete userInfo.passwordHash;
  
  res.json({
    success: true,
    data: { user: userInfo }
  });
});

// 管理员专属 - 获取所有注册用户列表
app.get('/api/auth/users', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }
  
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  
  if (!payload || payload.role !== 'admin') {
    return res.status(403).json({ success: false, error: '需要管理员权限' });
  }
  
  const data = readData();
  const users = (data.registered_users || []).map(u => {
    const user = { ...u };
    delete user.passwordHash;
    return user;
  });
  
  res.json({
    success: true,
    data: { users }
  });
});

// 管理员 - 更新用户状态
app.put('/api/auth/users/:id/status', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }
  
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  
  if (!payload || payload.role !== 'admin') {
    return res.status(403).json({ success: false, error: '需要管理员权限' });
  }
  
  const userId = parseInt(req.params.id);
  const { status } = req.body;
  
  if (!['active', 'disabled'].includes(status)) {
    return res.status(400).json({ success: false, error: '无效的状态值' });
  }
  
  const data = readData();
  const userIndex = data.registered_users?.findIndex(u => u.id === userId);
  
  if (userIndex === -1 || userIndex === undefined) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  
  data.registered_users[userIndex].status = status;
  
  if (writeData(data)) {
    const user = { ...data.registered_users[userIndex] };
    delete user.passwordHash;
    res.json({ success: true, data: { user } });
  } else {
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// 管理员 - 删除用户
app.delete('/api/auth/users/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }
  
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  
  if (!payload || payload.role !== 'admin') {
    return res.status(403).json({ success: false, error: '需要管理员权限' });
  }
  
  const userId = parseInt(req.params.id);
  
  // 不能删除自己
  if (payload.id === userId) {
    return res.status(400).json({ success: false, error: '不能删除自己的账户' });
  }
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  const userIndex = data.registered_users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  
  data.registered_users.splice(userIndex, 1);
  
  if (writeData(data)) {
    res.json({ success: true, message: '用户已删除' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// 管理员 - 更新用户资料
app.put('/api/auth/users/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }
  
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  
  if (!payload || payload.role !== 'admin') {
    return res.status(403).json({ success: false, error: '需要管理员权限' });
  }
  
  const userId = parseInt(req.params.id);
  const updates = req.body;
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  const userIndex = data.registered_users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  
  // 更新允许的字段
  const allowedFields = ['realName', 'email', 'phone', 'department', 'role'];
  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      data.registered_users[userIndex][field] = updates[field];
    }
  });
  
  if (writeData(data)) {
    const user = { ...data.registered_users[userIndex] };
    delete user.passwordHash;
    res.json({ success: true, data: { user } });
  } else {
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// 管理员 - 重置用户密码
app.post('/api/auth/users/:id/reset-password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }
  
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  
  if (!payload || payload.role !== 'admin') {
    return res.status(403).json({ success: false, error: '需要管理员权限' });
  }
  
  const userId = parseInt(req.params.id);
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ success: false, error: '密码不能少于6位' });
  }
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  const userIndex = data.registered_users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  
  // 更新密码
  data.registered_users[userIndex].passwordHash = hashPassword(newPassword.trim());
  
  if (writeData(data)) {
    res.json({ 
      success: true, 
      message: '密码重置成功',
      data: { 
        username: data.registered_users[userIndex].username
      } 
    });
  } else {
    res.status(500).json({ success: false, error: '重置失败' });
  }
});

// 管理员 - 切换用户管理员权限
app.put('/api/auth/users/:id/toggle-role', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }
  
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  
  if (!payload || payload.role !== 'admin') {
    return res.status(403).json({ success: false, error: '需要管理员权限' });
  }
  
  const userId = parseInt(req.params.id);
  
  // 不允许撤销自己的管理员权限
  if (payload.id === userId) {
    return res.status(400).json({ success: false, error: '不能修改自己的权限' });
  }
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  const userIndex = data.registered_users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  
  // 切换角色
  const currentRole = data.registered_users[userIndex].role;
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  data.registered_users[userIndex].role = newRole;
  
  if (writeData(data)) {
    const user = { ...data.registered_users[userIndex] };
    delete user.passwordHash;
    res.json({ 
      success: true, 
      message: newRole === 'admin' ? '已授予管理员权限' : '已撤销管理员权限',
      data: { user } 
    });
  } else {
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// ============================================================
// 课程管理 API
// ============================================================

// GET /api/courses - 获取所有课程
app.get('/api/courses', (req, res) => {
  const data = readData();
  const courses = (data.management_courses || []).map(c => ({
    ...c,
    rating: getCourseAvgRating(data, c.id) ?? c.rating ?? 0
  }));
  res.json(courses);
});

// POST /api/courses - 添加课程
app.post('/api/courses', (req, res) => {
  const course = req.body;
  const data = readData();
  if (!data.management_courses) data.management_courses = [];
  course.id = Date.now();
  course.createdAt = new Date().toLocaleString('zh-CN');
  course.updatedAt = course.createdAt;
  data.management_courses.push(course);
  if (writeData(data)) {
    res.json({ success: true, course });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/courses/:id - 更新课程
app.put('/api/courses/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  const data = readData();
  const index = data.management_courses?.findIndex(c => c.id === id);
  if (index !== -1) {
    updates.updatedAt = new Date().toLocaleString('zh-CN');
    data.management_courses[index] = { ...data.management_courses[index], ...updates };
    if (writeData(data)) {
      res.json({ success: true, course: data.management_courses[index] });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '课程不存在' });
  }
});

// DELETE /api/courses/:id - 删除课程
app.delete('/api/courses/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (data.management_courses) {
    data.management_courses = data.management_courses.filter(c => c.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '课程列表不存在' });
  }
});

// ============================================================
// 讲师管理 API
// ============================================================

// GET /api/lecturers - 获取所有讲师（动态计算courseCount）
app.get('/api/lecturers', (req, res) => {
  const data = readData();
  const courses = data.management_courses || [];
  const lecturers = (data.lecturers || []).map(l => ({
    ...l,
    courseCount: courses.filter(c => String(c.lecturerId) === String(l.id)).length
  }));
  res.json({ success: true, data: lecturers });
});

// POST /api/lecturers - 添加讲师
app.post('/api/lecturers', (req, res) => {
  const lecturer = req.body;
  const data = readData();
  if (!data.lecturers) data.lecturers = [];
  lecturer.id = Date.now();
  data.lecturers.push(lecturer);
  if (writeData(data)) {
    res.json({ success: true, lecturer });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/lecturers/:id - 更新讲师
app.put('/api/lecturers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  const data = readData();
  const index = data.lecturers?.findIndex(l => l.id === id);
  if (index !== -1) {
    data.lecturers[index] = { ...data.lecturers[index], ...updates };
    if (writeData(data)) {
      res.json({ success: true, lecturer: data.lecturers[index] });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '讲师不存在' });
  }
});

// DELETE /api/lecturers/:id - 删除讲师
app.delete('/api/lecturers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (data.lecturers) {
    data.lecturers = data.lecturers.filter(l => l.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '讲师列表不存在' });
  }
});

// ============================================================
// 培训项目管理 API (新版 - 扁平化培训事件)
// ============================================================

// GET /api/training - 获取所有培训事件
app.get('/api/training', (req, res) => {
  const data = readData();
  res.json(data.training_events || []);
});

// GET /api/training/schedule - 获取所有培训课程日程（用于用户端培训页面）
app.get('/api/training/schedule', (req, res) => {
  const data = readData();
  const events = data.training_events || [];
  const enrollments = data.training_enrollments || [];
  const users = data.registered_users || [];

  // 转换为前端需要的格式
  const schedule = events.map(event => {
    const startDate = event.startTime ? new Date(event.startTime) : null;
    const endDate = event.endTime ? new Date(event.endTime) : null;
    const dateStr = event.date || (startDate && !isNaN(startDate) ? startDate.toISOString().split('T')[0] : '');
    const startTimeStr = event.startTime?.includes('T')
      ? event.startTime.split('T')[1].slice(0, 5)
      : (event.startTime || '');
    const endTimeStr = event.endTime?.includes('T')
      ? event.endTime.split('T')[1].slice(0, 5)
      : (event.endTime || '');
    const durationMs = (startDate && endDate && !isNaN(startDate) && !isNaN(endDate)) ? (endDate - startDate) : 0;
    const durationHours = durationMs > 0 ? (durationMs / (1000 * 60 * 60)).toFixed(1) : '0.0';

    // 报名人数及用户详情
    const eventEnrollments = enrollments.filter(e => e.trainingId === event.id);
    const enrolledUsers = eventEnrollments.map(e => {
      const user = users.find(u => u.id === e.userId);
      return {
        userId: e.userId,
        name: user ? (user.realName || user.username) : '未知用户',
        avatar: user ? (user.avatar || '') : '',
        department: user ? (user.department || '') : ''
      };
    });

    return {
      id: event.id,
      name: event.name,
      category: event.project,
      projectName: event.project,
      instructor: event.instructor,
      date: dateStr,
      time: `${startTimeStr}-${endTimeStr}`,
      duration: `${durationHours}小时`,
      location: event.location,
      content: event.content,
      startTime: event.startTime,
      endTime: event.endTime,
      enrollCount: eventEnrollments.length,
      enrolledUsers: enrolledUsers
    };
  });

  // 按日期排序
  schedule.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  res.json({ success: true, data: schedule });
});

// ============================================================
// 培训集成服务 API (签到 + 满意度调研 + 考试)
// 注意：这些路由必须在 /api/training/:id 之前定义，避免被通用路由捕获
// ============================================================

// GET /api/training/:id/signins - 获取某培训事件的签到列表
app.get('/api/training/:id/signins', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const signins = (data.training_signins || []).filter(s => s.trainingId === trainingId);
  res.json({ success: true, data: signins });
});

// POST /api/training/:id/signin - 员工签到
app.post('/api/training/:id/signin', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const { userId, code } = req.body;
  
  if (!userId || !code) {
    return res.status(400).json({ success: false, error: '缺少用户ID或签到码' });
  }
  
  const event = (data.training_events || []).find(e => e.id === trainingId);
  if (!event) {
    return res.status(404).json({ success: false, error: '培训事件不存在' });
  }
  
  if (!event.signinEnabled) {
    return res.status(400).json({ success: false, error: '该培训未开启签到' });
  }
  
  if (event.signinCode && event.signinCode !== code) {
    return res.status(400).json({ success: false, error: '签到码错误' });
  }
  
  if (!data.training_signins) data.training_signins = [];
  
  // 检查是否已签到
  const alreadySigned = data.training_signins.some(s => s.trainingId === trainingId && s.userId == userId);
  if (alreadySigned) {
    return res.status(400).json({ success: false, error: '您已签到，无需重复签到' });
  }
  
  const user = (data.registered_users || []).find(u => u.id == userId);
  const signin = {
    id: Date.now(),
    trainingId,
    userId: user ? user.id : userId,
    userName: user ? (user.realName || user.username) : '未知用户',
    department: user ? (user.department || '') : '',
    signedAt: new Date().toISOString(),
    method: 'code'
  };
  data.training_signins.push(signin);
  
  if (writeData(data)) {
    res.json({ success: true, data: signin });
  } else {
    res.status(500).json({ success: false, error: '签到失败' });
  }
});

// DELETE /api/training/signins/:signinId - 删除签到记录（管理员）
app.delete('/api/training/signins/:signinId', (req, res) => {
  const data = readData();
  const signinId = parseInt(req.params.signinId);
  if (!data.training_signins) data.training_signins = [];
  const idx = data.training_signins.findIndex(s => s.id === signinId);
  if (idx === -1) return res.status(404).json({ success: false, error: '签到记录不存在' });
  data.training_signins.splice(idx, 1);
  if (writeData(data)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// GET /api/training/:id/survey-responses - 获取某培训事件的调研结果
app.get('/api/training/:id/survey-responses', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const event = (data.training_events || []).find(e => e.id === trainingId);
  if (!event) return res.status(404).json({ success: false, error: '培训事件不存在' });
  
  const surveyId = event.linkedSurveyId;
  if (!surveyId) {
    return res.json({ success: true, data: [], survey: null, total: 0 });
  }
  
  const survey = (data.surveys || []).find(s => s.id === surveyId);
  const responses = (data.survey_responses || []).filter(r => r.surveyId === surveyId && r.trainingId == trainingId);
  
  res.json({ success: true, data: responses, survey, total: responses.length });
});

// GET /api/training/:id/exam-results - 获取某培训事件的考试结果
app.get('/api/training/:id/exam-results', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const event = (data.training_events || []).find(e => e.id === trainingId);
  if (!event) return res.status(404).json({ success: false, error: '培训事件不存在' });
  
  const examId = event.linkedExamId;
  if (!examId) {
    return res.json({ success: true, data: [], exam: null, total: 0 });
  }
  
  const exam = (data.exams || []).find(e => e.id === examId);
  const attempts = (data.exam_attempts || []).filter(a => a.examId === examId);
  
  res.json({ success: true, data: attempts, exam, total: attempts.length });
});

// GET /api/training/:id/service-status - 获取培训集成服务状态概览
app.get('/api/training/:id/service-status', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const event = (data.training_events || []).find(e => e.id === trainingId);
  if (!event) return res.status(404).json({ success: false, error: '培训事件不存在' });
  
  const signinCount = (data.training_signins || []).filter(s => s.trainingId === trainingId).length;
  const surveyCount = event.linkedSurveyId 
    ? (data.survey_responses || []).filter(r => r.surveyId === event.linkedSurveyId && r.trainingId == trainingId).length 
    : 0;
  const examCount = event.linkedExamId 
    ? (data.exam_attempts || []).filter(a => a.examId === event.linkedExamId).length 
    : 0;
  
  res.json({
    success: true,
    signin: { enabled: event.signinEnabled || false, count: signinCount },
    survey: { linkedId: event.linkedSurveyId || null, count: surveyCount },
    exam: { linkedId: event.linkedExamId || null, count: examCount }
  });
});

// GET /api/training/:id - 获取单个培训事件
app.get('/api/training/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const event = data.training_events?.find(e => e.id === id);
  if (event) {
    res.json(event);
  } else {
    res.status(404).json({ success: false, error: '培训事件不存在' });
  }
});

// POST /api/training - 添加培训事件
app.post('/api/training', (req, res) => {
  const event = req.body;
  const data = readData();
  if (!data.training_events) data.training_events = [];
  event.id = Date.now();
  data.training_events.push(event);
  if (writeData(data)) {
    res.json({ success: true, event });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/training/:id - 更新培训事件
app.put('/api/training/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  const data = readData();
  const index = data.training_events?.findIndex(e => e.id === id);
  if (index !== -1) {
    data.training_events[index] = { ...data.training_events[index], ...updates };
    if (writeData(data)) {
      res.json({ success: true, event: data.training_events[index] });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '培训事件不存在' });
  }
});

// DELETE /api/training/:id - 删除培训事件
app.delete('/api/training/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (data.training_events) {
    data.training_events = data.training_events.filter(e => e.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '培训事件列表不存在' });
  }
});

// ============================================================
// 培训报名 API
// ============================================================

// GET /api/training/:id/enrollments - 获取某培训事件的报名列表（含用户详情）
app.get('/api/training/:id/enrollments', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const enrollments = (data.training_enrollments || []).filter(e => e.trainingId === trainingId);
  const users = data.registered_users || [];

  // 关联用户信息
  const enriched = enrollments.map(e => {
    const user = users.find(u => u.id === e.userId);
    return {
      ...e,
      userName: user ? (user.realName || user.username) : '未知用户',
      userDepartment: user ? (user.department || '-') : '-',
      userPhone: user ? (user.phone || '-') : '-',
      userAvatar: user ? (user.avatar || '') : ''
    };
  });

  res.json({ success: true, data: enriched, total: enriched.length });
});

// POST /api/training/:id/enroll - 用户自主报名
app.post('/api/training/:id/enroll', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: '缺少 userId' });

  // 检查培训是否存在
  const training = (data.training_events || []).find(t => t.id === trainingId);
  if (!training) return res.status(404).json({ success: false, error: '培训不存在' });

  if (!data.training_enrollments) data.training_enrollments = [];

  // 检查是否已报名
  const existing = data.training_enrollments.find(e => e.trainingId === trainingId && e.userId === userId);
  if (existing) return res.status(400).json({ success: false, error: '已报名，无需重复操作' });

  data.training_enrollments.push({
    id: Date.now(),
    trainingId,
    userId: Number(userId) || userId,
    enrolledAt: new Date().toISOString(),
    source: 'self'
  });

  writeData(data);
  const count = data.training_enrollments.filter(e => e.trainingId === trainingId).length;
  res.json({ success: true, message: '报名成功', enrollCount: count });
});

// DELETE /api/training/:id/enroll - 用户取消报名
app.delete('/api/training/:id/enroll', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: '缺少 userId' });

  if (!data.training_enrollments) data.training_enrollments = [];
  const idx = data.training_enrollments.findIndex(e => e.trainingId === trainingId && e.userId === userId);
  if (idx === -1) return res.status(404).json({ success: false, error: '未找到报名记录' });

  data.training_enrollments.splice(idx, 1);
  writeData(data);
  const count = data.training_enrollments.filter(e => e.trainingId === trainingId).length;
  res.json({ success: true, message: '已取消报名', enrollCount: count });
});

// POST /api/training/:id/assign - 管理员指派学员（支持批量）
app.post('/api/training/:id/assign', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const { userIds } = req.body; // 数组

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ success: false, error: '请选择至少一名学员' });
  }

  const training = (data.training_events || []).find(t => t.id === trainingId);
  if (!training) return res.status(404).json({ success: false, error: '培训不存在' });

  if (!data.training_enrollments) data.training_enrollments = [];

  let addedCount = 0;
  userIds.forEach(uid => {
    const existing = data.training_enrollments.find(e => e.trainingId === trainingId && e.userId === uid);
    if (!existing) {
      data.training_enrollments.push({
        id: Date.now() + addedCount,
        trainingId,
        userId: Number(uid) || uid,
        enrolledAt: new Date().toISOString(),
        source: 'assigned'
      });
      addedCount++;
    }
  });

  writeData(data);
  const totalCount = data.training_enrollments.filter(e => e.trainingId === trainingId).length;
  res.json({ success: true, message: `已指派 ${addedCount} 名学员`, added: addedCount, enrollCount: totalCount });
});

// DELETE /api/training/:id/enrollments/:enrollId - 管理员删除某条报名记录
app.delete('/api/training/:id/enrollments/:enrollId', (req, res) => {
  const data = readData();
  const enrollId = parseInt(req.params.enrollId);
  if (!data.training_enrollments) data.training_enrollments = [];
  const idx = data.training_enrollments.findIndex(e => e.id === enrollId);
  if (idx === -1) return res.status(404).json({ success: false, error: '未找到报名记录' });
  data.training_enrollments.splice(idx, 1);
  writeData(data);
  res.json({ success: true, message: '已移除' });
});

// GET /api/training/:id/enroll-count - 快速获取报名人数（用于列表页）
app.get('/api/training/:id/enroll-count', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const count = (data.training_enrollments || []).filter(e => e.trainingId === trainingId).length;
  res.json({ success: true, count });
});

// POST /api/training/:projectId/courses - 为培训项目添加课程
app.post('/api/training/:projectId/courses', (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const course = req.body;
  const data = readData();
  
  const projectIndex = data.training_projects?.findIndex(p => p.id === projectId);
  if (projectIndex === -1) {
    return res.status(404).json({ success: false, error: '培训项目不存在' });
  }
  
  if (!data.training_projects[projectIndex].courses) {
    data.training_projects[projectIndex].courses = [];
  }
  
  course.id = Date.now();
  course.projectId = projectId;
  data.training_projects[projectIndex].courses.push(course);
  
  if (writeData(data)) {
    res.json({ success: true, course });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/training/courses/:courseId - 更新培训课程
app.put('/api/training/courses/:courseId', (req, res) => {
  const courseId = parseInt(req.params.courseId);
  const updates = req.body;
  const data = readData();
  
  let updated = false;
  for (const project of data.training_projects || []) {
    const courseIndex = project.courses?.findIndex(c => c.id === courseId);
    if (courseIndex !== -1) {
      project.courses[courseIndex] = { ...project.courses[courseIndex], ...updates };
      updated = true;
      break;
    }
  }
  
  if (updated && writeData(data)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: '课程不存在' });
  }
});

// DELETE /api/training/courses/:courseId - 删除培训课程
app.delete('/api/training/courses/:courseId', (req, res) => {
  const courseId = parseInt(req.params.courseId);
  const data = readData();
  
  let deleted = false;
  for (const project of data.training_projects || []) {
    if (project.courses) {
      const initialLength = project.courses.length;
      project.courses = project.courses.filter(c => c.id !== courseId);
      if (project.courses.length < initialLength) {
        deleted = true;
        break;
      }
    }
  }
  
  if (deleted && writeData(data)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: '课程不存在' });
  }
});


// ============================================================
// 课程评分 API
// ============================================================

// GET /api/courses/:id/ratings - 获取课程评分信息（含当前用户评分）
app.get('/api/courses/:id/ratings', (req, res) => {
  const courseId = parseInt(req.params.id);
  const userId = req.query.userId || '';
  const data = readData();

  // 从 course_ratings 获取评分
  const ratings = (data.course_ratings || []).filter(r => r.courseId === courseId);

  // 同时从 course_interaction 数据获取评分（前端 DataAPI 存储的评分）
  const interactionKey = 'course_interaction_' + courseId;
  const interaction = data[interactionKey];

  let totalSum = ratings.reduce((s, r) => s + r.score, 0);
  let totalCount = ratings.length;
  let myRating = null;

  // 合并 interaction 数据（去重）
  if (interaction && interaction.ratingCount > 0) {
    const interactionUserIds = new Set(Object.keys(interaction.userRatings || {}).map(String));
    const ratingsUserIds = new Set(ratings.map(r => String(r.userId)));

    // 将 interaction 中的评分加入总计
    totalSum += (interaction.ratingSum || 0);
    totalCount += (interaction.ratingCount || 0);

    // 去除 course_ratings 中重复的用户评分（interaction 中已有的不重复计算）
    ratings.forEach(r => {
      if (interactionUserIds.has(String(r.userId))) {
        totalSum -= r.score;
        totalCount--;
      }
    });

    // 当前用户评分：优先从 interaction 获取
    if (userId && interaction.userRatings && interaction.userRatings[userId] !== undefined) {
      myRating = interaction.userRatings[userId];
    }
  }

  // 如果 interaction 中没有当前用户评分，从 course_ratings 获取
  if (!myRating && userId) {
    myRating = ratings.find(r => String(r.userId) === String(userId))?.score || null;
  }

  const avg = totalCount > 0 ? Math.round((totalSum / totalCount) * 10) / 10 : 0;
  res.json({ success: true, avgRating: avg, ratingCount: totalCount, myRating });
});

// POST /api/courses/:id/ratings - 提交/更新课程评分（只能评一次，可以修改）
app.post('/api/courses/:id/ratings', (req, res) => {
  const courseId = parseInt(req.params.id);
  const { userId, score } = req.body;
  if (!userId || !score || score < 1 || score > 5) {
    return res.status(400).json({ success: false, error: '参数无效：需要 userId（1-50字符）和 score（1-5）' });
  }
  const data = readData();
  if (!data.course_ratings) data.course_ratings = [];
  // 查找已有评分（一个用户对同一课程只能有一条评分）
  const existingIdx = data.course_ratings.findIndex(r => r.courseId === courseId && r.userId === userId);
  if (existingIdx >= 0) {
    data.course_ratings[existingIdx].score = score;
    data.course_ratings[existingIdx].updatedAt = new Date().toISOString();
  } else {
    data.course_ratings.push({
      id: Date.now(),
      userId,
      courseId,
      score,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  // 重算课程平均分并写回
  const courseRatings = data.course_ratings.filter(r => r.courseId === courseId);
  const avgRating = Math.round((courseRatings.reduce((s, r) => s + r.score, 0) / courseRatings.length) * 10) / 10;
  const course = (data.management_courses || []).find(c => c.id === courseId);
  if (course) course.rating = avgRating;
  if (writeData(data)) {
    res.json({ success: true, avgRating, ratingCount: courseRatings.length, myRating: score });
  } else {
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// ============================================================
// 考试管理 API
// ============================================================

// GET /api/exams - 获取所有考试
app.get('/api/exams', (req, res) => {
  const data = readData();
  const exams = data.exams || [];
  const attempts = data.exam_attempts || [];
  // 关联题目数量及参考/通过/不及格等统计
  const enriched = exams.map(exam => {
    const examAttempts = attempts.filter(a => a.examId === exam.id);
    const completed = examAttempts.filter(a => a.status === 'completed');
    const passed = completed.filter(a => a.passed).length;
    const failed = completed.length - passed;
    const absent = examAttempts.filter(a => a.status === 'abandoned').length;
    const unstarted = (exam.allowedUsers && Array.isArray(exam.allowedUsers))
      ? Math.max(0, exam.allowedUsers.length - examAttempts.length)
      : 0;
    return {
      ...exam,
      questionCount: (exam.questions || []).length,
      attemptCount: examAttempts.length,
      completedCount: completed.length,
      passCount: passed,
      failCount: failed,
      absentCount: absent,
      unstartedCount: unstarted
    };
  });
  res.json(enriched);
});

// POST /api/exams - 创建考试
app.post('/api/exams', (req, res) => {
  const {
    title, description, duration, passingScore, totalScore, bankId,
    shuffleQuestions, shuffleOptions, showAnswer, status, questions,
    startTime, endTime, maxAttempts, paperId, paperName, allowedUsers,
    accessType,
    // 考试设置
    attemptsPolicy, attemptsCount, recordScore, screenSwitchPolicy, screenSwitchCount,
    // 学员查看设置
    showData, answerDetail, viewQuestions, showCorrect, showAnalysis, viewRank
  } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: '考试名称不能为空' });
  }
  const data = readData();
  if (!data.exams) data.exams = [];
  const newExam = {
    id: Date.now(),
    title,
    description: description || '',
    duration: parseInt(duration) || 60,
    passingScore: parseInt(passingScore) || 60,
    totalScore: parseInt(totalScore) || 100,
    bankId: bankId || null,
    shuffleQuestions: !!shuffleQuestions,
    shuffleOptions: !!shuffleOptions,
    showAnswer: !!showAnswer,
    status: status || 'draft',
    questions: questions || [],
    startTime: startTime || null,
    endTime: endTime || null,
    maxAttempts: parseInt(maxAttempts) || 0,
    paperId: paperId || null,
    paperName: paperName || '',
    allowedUsers: allowedUsers || null,
    accessType: accessType || 'open',
    // 考试设置
    attemptsPolicy: attemptsPolicy || 'unlimited',
    attemptsCount: attemptsPolicy === 'custom' ? (parseInt(attemptsCount) || 3) : null,
    recordScore: recordScore || 'highest',
    screenSwitchPolicy: screenSwitchPolicy || 'unlimited',
    screenSwitchCount: screenSwitchPolicy === 'custom' ? (parseInt(screenSwitchCount) || 3) : null,
    // 学员查看设置
    showData: showData !== undefined ? !!showData : true,
    answerDetail: answerDetail || 'after_grade',
    viewQuestions: viewQuestions || 'all',
    showCorrect: showCorrect || 'show',
    showAnalysis: showAnalysis || 'show',
    viewRank: viewRank || 'after_submit',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.exams.push(newExam);
  if (writeData(data)) {
    // 创建时直接发布，发送通知
    let notifiedCount = 0;
    if (newExam.status === 'published') {
      notifiedCount = sendExamNotifications(data, newExam);
    }
    res.json({ success: true, exam: newExam, notifiedCount });
  } else {
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// PUT /api/exams/:id - 更新考试
app.put('/api/exams/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const exams = data.exams || [];
  const index = exams.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  const updates = req.body;
  const oldStatus = exams[index].status;
  const oldAllowedUsers = exams[index].allowedUsers;
  delete updates.id; // 不允许修改ID
  delete updates.createdAt; // 不允许修改创建时间
  updates.updatedAt = new Date().toISOString();
  data.exams[index] = { ...exams[index], ...updates };
  if (writeData(data)) {
    let notifiedCount = 0;
    // 场景1：状态从非published变为published → 发送通知
    if (oldStatus !== 'published' && updates.status === 'published') {
      notifiedCount = sendExamNotifications(data, data.exams[index]);
    }
    // 场景2：考试已发布，且 allowedUsers 发生变化（任务指派）→ 补发通知给新增学员
    if (data.exams[index].status === 'published' && updates.allowedUsers !== undefined) {
      notifiedCount = sendExamNotifications(data, data.exams[index]);
    }
    res.json({ success: true, exam: data.exams[index], notifiedCount });
  } else {
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// DELETE /api/exams/:id - 删除考试
app.delete('/api/exams/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const exams = data.exams || [];
  const index = exams.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  exams.splice(index, 1);
  // 同时删除相关成绩记录
  if (data.exam_attempts) {
    data.exam_attempts = data.exam_attempts.filter(a => a.examId !== id);
  }
  if (writeData(data)) {
    res.json({ success: true, message: '考试已删除' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// PUT /api/exams/:id/status - 发布/下架考试
app.put('/api/exams/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!['draft', 'published', 'closed'].includes(status)) {
    return res.status(400).json({ success: false, error: '无效的状态值' });
  }
  const data = readData();
  const exams = data.exams || [];
  const index = exams.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  const oldStatus = exams[index].status;
  exams[index].status = status;
  exams[index].updatedAt = new Date().toISOString();
  if (writeData(data)) {
    // 发布考试时发送通知
    if (oldStatus !== 'published' && status === 'published') {
      const notifiedCount = sendExamNotifications(data, exams[index]);
      res.json({ success: true, exam: exams[index], notifiedCount });
    } else {
      res.json({ success: true, exam: exams[index] });
    }
  } else {
    res.status(500).json({ success: false, error: '状态更新失败' });
  }
});

// GET /api/exams/:id - 获取单条考试详情
app.get('/api/exams/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  res.json({ success: true, data: exam });
});

// GET /api/exams/:id/questions - 获取考试题目详情（含完整题目内容）
app.get('/api/exams/:id/questions', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  const allQuestions = data.questions || [];
  const examQuestions = (exam.questions || []).map(eq => {
    const q = allQuestions.find(qq => qq.id === eq.questionId);
    return { ...eq, questionDetail: q || null };
  });
  res.json({ success: true, questions: examQuestions });
});

// PUT /api/exams/:id/questions - 设置考试题目
app.put('/api/exams/:id/questions', (req, res) => {
  const id = parseInt(req.params.id);
  const { questions } = req.body;
  const data = readData();
  const exams = data.exams || [];
  const index = exams.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  exams[index].questions = questions || [];
  exams[index].updatedAt = new Date().toISOString();
  if (writeData(data)) {
    res.json({ success: true, questions: exams[index].questions });
  } else {
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// GET /api/exams/:id/results - 获取考试成绩列表
app.get('/api/exams/:id/results', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const attempts = (data.exam_attempts || []).filter(a => a.examId === id);
  // 关联用户信息（使用 registered_users 主表）
  const users = data.registered_users || [];
  const results = attempts.map(a => {
    const user = users.find(u => String(u.id) === String(a.userId));
    return { ...a, userName: user ? (user.realName || user.username) : '未知用户' };
  }).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  res.json({ success: true, results });
});

// GET /api/exams/:id/students - 获取考试的学员聚合数据
app.get('/api/exams/:id/students', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) return res.status(404).json({ success: false, error: '考试不存在' });

  const users = data.registered_users || [];
  const attempts = (data.exam_attempts || []).filter(a => a.examId === id);
  const fullScore = exam.totalScore || (exam.questions || []).reduce((s, q) => s + (q.score || 1), 0);
  const recordScore = exam.recordScore || 'highest';

  // 确定候选学员范围
  let candidateUsers = [];
  if (exam.accessType === 'restricted' && exam.allowedUsers && exam.allowedUsers.length > 0) {
    candidateUsers = exam.allowedUsers.map(uid => users.find(u => String(u.id) === String(uid))).filter(Boolean);
  } else {
    candidateUsers = users.filter(u => u.role !== 'admin');
  }

  const students = candidateUsers.map(user => {
    const userAttempts = attempts.filter(a => String(a.userId) === String(user.id))
      .sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0));
    const completedAttempts = userAttempts.filter(a => a.status === 'completed');
    const takingAttempts = userAttempts.filter(a => a.status === 'taking');
    const abandonedAttempts = userAttempts.filter(a => a.status === 'abandoned');

    let status = 'unstarted';
    let statusText = '未考';
    let selectedAttempt = null;

    if (takingAttempts.length > 0) {
      status = 'taking';
      statusText = '进行中';
    } else if (abandonedAttempts.length > 0 && completedAttempts.length === 0) {
      status = 'absent';
      statusText = '缺考';
    } else if (completedAttempts.length > 0) {
      selectedAttempt = recordScore === 'latest'
        ? completedAttempts[0]
        : completedAttempts.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (selectedAttempt.passed) {
        status = 'passed';
        statusText = '及格';
      } else {
        status = 'failed';
        statusText = '不及格';
      }
    }

    const score = selectedAttempt ? (selectedAttempt.score || 0) : 0;
    const scoreRate = fullScore > 0 ? Math.round(score / fullScore * 100) : 0;
    const duration = selectedAttempt ? (selectedAttempt.durationUsed || 0) : 0;
    const joinTime = userAttempts.length > 0
      ? new Date(userAttempts[userAttempts.length - 1].startedAt || userAttempts[userAttempts.length - 1].completedAt).toLocaleString('zh-CN')
      : (user.createdAt || user.created_at ? new Date(user.createdAt || user.created_at).toLocaleString('zh-CN') : '-');

    return {
      userId: user.id,
      userName: user.realName || user.username || '未知',
      department: user.department || '-',
      phone: user.phone || '-',
      joinTime,
      attemptCount: userAttempts.length,
      score,
      fullScore,
      scoreRate,
      duration,
      status,
      statusText,
      selectedAttemptId: selectedAttempt ? selectedAttempt.id : null
    };
  });

  res.json({ success: true, exam: { id: exam.id, title: exam.title, passingScore: exam.passingScore || 60, totalScore: exam.totalScore, recordScore, fullScore }, students });
});

// GET /api/exams/:id/students/:userId/records - 获取某学员在某考试下的所有考试记录
app.get('/api/exams/:id/students/:userId/records', (req, res) => {
  const id = parseInt(req.params.id);
  const userId = req.params.userId;
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) return res.status(404).json({ success: false, error: '考试不存在' });
  const user = (data.registered_users || []).find(u => String(u.id) === String(userId));

  const attempts = (data.exam_attempts || [])
    .filter(a => a.examId === id && String(a.userId) === String(userId))
    .sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0));

  const fullScore = exam.totalScore || (exam.questions || []).reduce((s, q) => s + (q.score || 1), 0);
  const highestScore = attempts.filter(a => a.status === 'completed').length > 0
    ? Math.max(...attempts.filter(a => a.status === 'completed').map(a => a.score || 0))
    : null;

  const records = attempts.map(a => {
    const score = a.status === 'completed' ? (a.score || 0) : 0;
    const scoreRate = fullScore > 0 ? Math.round(score / fullScore * 100) : 0;
    return {
      id: a.id,
      status: a.status,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      durationUsed: a.durationUsed || 0,
      score,
      fullScore,
      scoreRate,
      passed: a.passed || false,
      correctCount: a.correctCount || 0,
      totalQuestions: a.totalQuestions || 0,
      isHighest: a.status === 'completed' && score === highestScore,
      isLatest: a === attempts[0]
    };
  });

  res.json({
    success: true,
    exam: { id: exam.id, title: exam.title, passingScore: exam.passingScore || 60, totalScore: exam.totalScore, recordScore: exam.recordScore || 'highest', fullScore },
    user: user ? { id: user.id, userName: user.realName || user.username || '未知', department: user.department || '-', phone: user.phone || '-' } : null,
    records
  });
});

// GET /api/exams/attempts/:attemptId/detail - 获取单次考试作答详情
app.get('/api/exams/attempts/:attemptId/detail', (req, res) => {
  const attemptId = parseInt(req.params.attemptId);
  const data = readData();
  const attempt = (data.exam_attempts || []).find(a => a.id === attemptId);
  if (!attempt) return res.status(404).json({ success: false, error: '考试记录不存在' });

  const exam = (data.exams || []).find(e => e.id === attempt.examId);
  if (!exam) return res.status(404).json({ success: false, error: '考试不存在' });

  const user = (data.registered_users || []).find(u => String(u.id) === String(attempt.userId));
  const allQuestions = data.questions || [];

  const fullScore = exam.totalScore || (exam.questions || []).reduce((s, q) => s + (q.score || 1), 0);
  const details = (exam.questions || []).map((eq, idx) => {
    const q = allQuestions.find(qq => qq.id === eq.questionId) || {};
    const userAnswer = (attempt.answers || {})[String(eq.questionId)] || '';
    const correctAnswer = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');
    let isCorrect = false;
    if (q.type === 'multiple') {
      const ua = String(userAnswer || '').replace(/\s/g, '').split('').sort().join('');
      const ca = String(correctAnswer || '').replace(/\s/g, '').split('').sort().join('');
      isCorrect = ua === ca && ua !== '';
    } else if (q.type === 'judge' || q.type === 'single') {
      isCorrect = String(userAnswer).trim() === String(correctAnswer).trim() && userAnswer !== '';
    }
    const optionMap = {};
    (q.options || []).forEach((opt, i) => { optionMap[String.fromCharCode(65 + i)] = opt.text || opt || ''; });
    return {
      order: eq.order !== undefined ? eq.order + 1 : idx + 1,
      questionId: eq.questionId,
      title: q.title || q.content || '(无标题)',
      type: q.type || 'single',
      typeText: ({ single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' })[q.type] || '单选题',
      options: optionMap,
      userAnswer,
      correctAnswer,
      isCorrect,
      score: eq.score || 1,
      knowledge: q.knowledge || q.category || '-',
      analysis: q.analysis || ''
    };
  });

  res.json({
    success: true,
    exam: { id: exam.id, title: exam.title, passingScore: exam.passingScore || 60, totalScore: exam.totalScore, fullScore },
    user: user ? { id: user.id, userName: user.realName || user.username || '未知', department: user.department || '-', phone: user.phone || '-' } : null,
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      durationUsed: attempt.durationUsed || 0,
      score: attempt.score || 0,
      passed: attempt.passed || false,
      correctCount: attempt.correctCount || 0,
      totalQuestions: attempt.totalQuestions || 0
    },
    details
  });
});

// GET /api/exams/:id/questions/:questionId/answers - 获取某题所有学员作答
app.get('/api/exams/:id/questions/:questionId/answers', (req, res) => {
  const id = parseInt(req.params.id);
  const questionId = parseInt(req.params.questionId);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) return res.status(404).json({ success: false, error: '考试不存在' });

  const eq = (exam.questions || []).find(q => q.questionId === questionId);
  if (!eq) return res.status(404).json({ success: false, error: '题目不存在' });

  const allQuestions = data.questions || [];
  const q = allQuestions.find(qq => qq.id === questionId) || {};
  const correctAnswer = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');

  const completedAttempts = (data.exam_attempts || [])
    .filter(a => a.examId === id && a.status === 'completed')
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  const answers = completedAttempts.map(a => {
    const user = (data.registered_users || []).find(u => String(u.id) === String(a.userId));
    const userAnswer = (a.answers || {})[String(questionId)] || '';
    let isCorrect = false;
    if (q.type === 'multiple') {
      const ua = String(userAnswer || '').replace(/\s/g, '').split('').sort().join('');
      const ca = String(correctAnswer || '').replace(/\s/g, '').split('').sort().join('');
      isCorrect = ua === ca && ua !== '';
    } else if (q.type === 'judge' || q.type === 'single') {
      isCorrect = String(userAnswer).trim() === String(correctAnswer).trim() && userAnswer !== '';
    }
    return {
      attemptId: a.id,
      userId: a.userId,
      userName: user ? (user.realName || user.username || '未知') : '未知',
      department: user ? (user.department || '-') : '-',
      phone: user ? (user.phone || '-') : '-',
      completedAt: a.completedAt,
      userAnswer,
      correctAnswer,
      isCorrect,
      score: a.score || 0
    };
  });

  res.json({
    success: true,
    exam: { id: exam.id, title: exam.title },
    question: {
      questionId,
      order: eq.order !== undefined ? eq.order + 1 : 1,
      title: q.title || q.content || '(无标题)',
      type: q.type || 'single',
      typeText: ({ single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' })[q.type] || '单选题',
      correctAnswer,
      knowledge: q.knowledge || q.category || '-'
    },
    answers
  });
});

// GET /api/exams/:id/question-stats - 获取考试的答题数据统计
app.get('/api/exams/:id/question-stats', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) return res.status(404).json({ success: false, error: '考试不存在' });

  const allQuestions = data.questions || [];
  const examQuestions = (exam.questions || []).map((eq, idx) => {
    const q = allQuestions.find(qq => qq.id === eq.questionId);
    return {
      questionId: eq.questionId,
      order: eq.order !== undefined ? eq.order + 1 : idx + 1,
      score: eq.score || 1,
      ...(q || {})
    };
  });

  const completedAttempts = (data.exam_attempts || [])
    .filter(a => a.examId === id && a.status === 'completed');

  const typeMap = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };

  const stats = examQuestions.map(q => {
    const correctAnswer = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');
    let correctCount = 0;
    const optionStats = {};
    (q.options || []).forEach((opt, idx) => { optionStats[String.fromCharCode(65 + idx)] = 0; });

    completedAttempts.forEach(a => {
      const userAnswer = (a.answers || {})[String(q.questionId)] || '';
      let isCorrect = false;
      if (q.type === 'multiple') {
        const ua = (userAnswer || '').replace(/\s/g, '').split('').sort().join('');
        const ca = (correctAnswer || '').replace(/\s/g, '').split('').sort().join('');
        isCorrect = ua === ca && ua !== '';
      } else if (q.type === 'judge') {
        isCorrect = String(userAnswer).trim() === String(correctAnswer).trim() && userAnswer !== '';
      } else {
        isCorrect = String(userAnswer).trim() === String(correctAnswer).trim() && userAnswer !== '';
      }
      if (isCorrect) correctCount++;

      // 选项统计（仅对客观题）
      if (q.type === 'single' || q.type === 'multiple' || q.type === 'judge') {
        const ans = String(userAnswer || '').replace(/\s/g, '').split('');
        ans.forEach(ch => { if (optionStats[ch] !== undefined) optionStats[ch]++; });
      }
    });

    const totalCount = completedAttempts.length;
    const correctRate = totalCount > 0 ? Math.round(correctCount / totalCount * 100) : 0;

    return {
      questionId: q.questionId,
      order: q.order,
      title: q.title || q.content || '(无标题)',
      bankName: (q.bankName || q.bank || '-'),
      type: q.type || 'single',
      typeText: typeMap[q.type] || '单选题',
      knowledge: q.knowledge || q.category || '-',
      correctAnswer,
      correctCount,
      totalCount,
      correctRate,
      optionStats
    };
  });

  res.json({ success: true, exam: { id: exam.id, title: exam.title }, stats });
});

// GET /api/user/exam-records - 获取当前用户的考试记录（供个人中心徽章计算）
app.get('/api/user/exam-records', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  const data = readData();
  const userId = currentUser.id;
  // 优先从 user_learning_{userId}.examRecords 读取
  const learningKey = `user_learning_${userId}`;
  const learningData = data[learningKey] || {};
  let examRecords = learningData.examRecords || [];
  // 如果 user_learning 中没有，从 exam_attempts 中补充
  if (examRecords.length === 0) {
    const attempts = (data.exam_attempts || []).filter(a =>
      String(a.userId) === String(userId) && a.status === 'completed'
    );
    examRecords = attempts.map(a => {
      const exam = (data.exams || []).find(e => e.id === a.examId);
      return {
        examId: a.examId,
        examTitle: exam ? exam.title : '',
        score: a.score || 0,
        fullScore: exam ? exam.totalScore || 100 : 100,
        passed: a.passed || false,
        correctCount: a.correctCount || 0,
        totalQuestions: a.totalQuestions || 0,
        completedAt: a.completedAt || null,
        attemptId: a.id
      };
    });
  }
  res.json({ success: true, examRecords });
});

// GET/POST /api/exams/:id/take - 学员开始考试（获取试卷）
const takeExamHandler = (req, res) => {
  const id = parseInt(req.params.id);
  const userId = req.query.userId || (req.body && req.body.userId);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id && e.status === 'published');
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在或未发布' });
  }

  // 如果是限制访问的考试，检查 userId 是否在 allowedUsers 中
  if (exam.accessType === 'restricted' && exam.allowedUsers && exam.allowedUsers.length > 0) {
    const allowedIds = exam.allowedUsers.map(uid => String(uid));
    if (!allowedIds.includes(String(userId))) {
      return res.status(403).json({ success: false, error: '您未被指派参加此考试' });
    }
  }

  // 考试次数限制
  const attempts = data.exam_attempts || [];
  const userAttempts = attempts.filter(a => String(a.userId) === String(userId) && a.examId === id);
  const completedAttempts = userAttempts.filter(a => a.status === 'completed');
  if (exam.attemptsPolicy === 'until_pass') {
    if (completedAttempts.some(a => a.passed)) {
      return res.status(403).json({ success: false, error: '您已通过该考试，无法再次参加' });
    }
  } else if (exam.attemptsPolicy === 'custom') {
    const maxCount = exam.attemptsCount || 3;
    if (completedAttempts.length >= maxCount) {
      return res.status(403).json({ success: false, error: `您已达到最大考试次数（${maxCount}次）` });
    }
  }

  const allQuestions = data.questions || [];
  let examQuestions = (exam.questions || [])
    .map(eq => {
      const q = allQuestions.find(qq => qq.id === eq.questionId);
      return q ? { ...q, score: eq.score || 1, order: eq.order || 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);

  // 试题乱序
  if (exam.shuffleQuestions) {
    examQuestions = examQuestions.sort(() => Math.random() - 0.5);
  }

  // 选项乱序：生成映射，正确答案按新顺序重新计算
  let optionMappings = {};
  if (exam.shuffleOptions) {
    examQuestions = examQuestions.map(q => {
      if (!q.options || q.options.length <= 1) return q;
      const indices = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
      const shuffledOptions = indices.map(i => q.options[i]);
      const oldAnswer = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');
      const newAnswer = oldAnswer.split('').map(ch => {
        const oldIdx = ch.charCodeAt(0) - 65;
        if (oldIdx < 0 || oldIdx >= indices.length) return ch;
        const newIdx = indices.indexOf(oldIdx);
        return String.fromCharCode(65 + newIdx);
      }).sort().join('');
      optionMappings[q.id] = { indices, newAnswer, options: shuffledOptions };
      return { ...q, options: shuffledOptions, originalAnswer: q.answer, answer: newAnswer };
    });
  }

  // 去掉答案
  const safeQuestions = examQuestions.map(({ answer, analysis, originalAnswer, ...rest }) => rest);

  // 复用或创建 prepared attempt，记录选项映射与试题顺序
  const oneHourAgo = Date.now() - 3600000;
  let attempt = attempts.find(a => String(a.userId) === String(userId) && a.examId === id && a.status === 'prepared');
  // 清理该用户该考试过旧的 prepared 记录
  data.exam_attempts = attempts.filter(a => !(String(a.userId) === String(userId) && a.examId === id && a.status === 'prepared' && new Date(a.startedAt || 0).getTime() < oneHourAgo && a !== attempt));
  if (!attempt) {
    attempt = {
      id: Date.now(),
      examId: id,
      userId: userId,
      status: 'prepared',
      startedAt: new Date().toISOString(),
      answers: {},
      score: null,
      passed: null,
      optionMappings,
      shuffledQuestionIds: exam.shuffleQuestions ? examQuestions.map(q => q.id) : null
    };
    data.exam_attempts.push(attempt);
  } else {
    attempt.optionMappings = optionMappings;
    attempt.shuffledQuestionIds = exam.shuffleQuestions ? examQuestions.map(q => q.id) : null;
    attempt.startedAt = new Date().toISOString();
  }
  writeData(data);

  // 计算及格线百分比（exam.html 使用 passScore 作为百分比显示）
  const fullScore = exam.totalScore || examQuestions.reduce((s, eq) => s + (eq.score || 1), 0);
  const passScorePercent = fullScore > 0 ? Math.round((exam.passingScore || 60) / fullScore * 100) : 60;

  res.json({
    success: true,
    exam: { ...exam, questions: undefined, passScore: passScorePercent, name: exam.title },
    questions: safeQuestions,
    totalQuestions: examQuestions.length,
    duration: exam.duration * 60, // 转换为秒
    attemptId: attempt.id
  });
};
app.get('/api/exams/:id/take', takeExamHandler);
app.post('/api/exams/:id/take', takeExamHandler);

// POST /api/exams/:id/enter - 学员进入考试（记录开始）
app.post('/api/exams/:id/enter', (req, res) => {
  const id = parseInt(req.params.id);
  const { userId, attemptId: bodyAttemptId } = req.body;
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!data.exam_attempts) data.exam_attempts = [];

  // 优先使用 take 阶段已创建的 prepared attempt
  let attempt;
  if (bodyAttemptId) {
    attempt = data.exam_attempts.find(a => a.id === bodyAttemptId);
  }
  if (!attempt) {
    attempt = data.exam_attempts.find(a => String(a.userId) === String(userId) && a.examId === id && a.status === 'prepared');
  }

  if (!attempt) {
    // 兜底：新建 taking attempt
    attempt = {
      id: Date.now(),
      examId: id,
      userId: userId,
      status: 'taking',
      startedAt: new Date().toISOString(),
      answers: {},
      score: null,
      passed: null
    };
    data.exam_attempts.push(attempt);
  } else {
    attempt.status = 'taking';
    if (!attempt.startedAt) attempt.startedAt = new Date().toISOString();
  }
  writeData(data);

  // 返回 session 对象供 exam.html 使用
  const durationSeconds = (exam ? exam.duration || 60 : 60) * 60;
  const elapsed = attempt.startedAt ? Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000) : 0;
  const remainingSeconds = Math.max(0, durationSeconds - elapsed);
  res.json({
    success: true,
    attemptId: attempt.id,
    session: {
      attemptId: attempt.id,
      deadline: new Date(Date.now() + remainingSeconds * 1000).toISOString(),
      remainingSeconds,
      expired: remainingSeconds <= 0
    }
  });
});

// POST /api/exams/:id/submit - 提交考试答卷
app.post('/api/exams/:id/submit', (req, res) => {
  const id = parseInt(req.params.id);
  const { userId, attemptId, answers, durationUsed } = req.body;
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) return res.status(404).json({ success: false, error: '考试不存在' });

  // 查找 attempt 记录：优先使用 attemptId，否则按 userId+examId 查找最近的 "taking" 状态
  const attempts = data.exam_attempts || [];
  let attemptIndex = -1;
  if (attemptId) {
    attemptIndex = attempts.findIndex(a => a.id === attemptId);
  } else if (userId) {
    // 查找该用户该考试最近一次进行中的 attempt
    for (let i = attempts.length - 1; i >= 0; i--) {
      if (String(attempts[i].userId) === String(userId) && attempts[i].examId === id && attempts[i].status === 'taking') {
        attemptIndex = i;
        break;
      }
    }
  }

  const allQuestions = data.questions || [];
  const examQuestions = exam.questions || [];
  const papers = data.papers || [];
  const paper = exam.paperId ? papers.find(p => p.id === exam.paperId) : null;
  const paperQuestions = paper ? (paper.questions || []) : [];
  const attempt = attemptIndex !== -1 ? attempts[attemptIndex] : null;
  const optionMappings = attempt && attempt.optionMappings ? attempt.optionMappings : {};
  let correctCount = 0;
  let totalScore = 0;
  const detail = [];

  // 逐题评分，使用每道题的独立分值；若考试题目自身无漏选得分，回退到关联试卷设置
  examQuestions.forEach(eq => {
    const pq = paperQuestions.find(p => p.questionId === eq.questionId);
    if (eq.partialScore === undefined && pq && pq.partialScore !== undefined) {
      eq.partialScore = pq.partialScore;
    }
    const q = allQuestions.find(qq => qq.id === eq.questionId);
    if (!q) return;
    const qScore = eq.score || 1;
    const userAnswer = (answers || {})[String(q.id)] || '';
    // 选项乱序时，使用映射后的正确答案与选项
    const mapping = optionMappings[String(q.id)];
    const correctAnswerRaw = mapping ? mapping.newAnswer : (Array.isArray(q.answer) ? q.answer.join('') : (q.answer || ''));
    const options = mapping ? mapping.options : (q.options || []);
    // 多选题答案排序比较
    let isCorrect = false;
    let earnedScore = 0;
    if (q.type === 'multiple') {
      // 答案可能是数组或字符串（如 "A B C D" 或 "ABCD"），统一转为去除空格后的排序字符串
      const ua = (userAnswer || '').replace(/\s/g, '').split('').sort().join('');
      const ca = correctAnswerRaw.replace(/\s/g, '').split('').sort().join('');
      isCorrect = ua === ca && ua !== '';
      if (isCorrect) {
        earnedScore = qScore;
      } else if (ua !== '') {
        // 多选题部分正确：按试卷设置的漏选得分计算
        const correctSet = new Set(ca.split(''));
        const userSet = new Set(ua.split(''));
        // 漏选：用户选的都在正确答案中且数量不足 → 按漏选得分计
        // 错选：用户选了不在正确答案中的 → 0分
        const hasWrong = [...userSet].some(ch => !correctSet.has(ch));
        if (!hasWrong && userSet.size > 0) {
          const partialScore = eq.partialScore !== undefined ? eq.partialScore : (q.partialScore || 0);
          earnedScore = partialScore;
        }
      }
    } else {
      isCorrect = userAnswer === correctAnswerRaw && userAnswer !== '';
      earnedScore = isCorrect ? qScore : 0;
    }
    if (isCorrect) correctCount++;
    totalScore += earnedScore;
    detail.push({
      questionId: q.id,
      type: q.type || 'single',
      title: q.title || q.content || '',
      content: q.content || q.title || '',
      userAnswer: userAnswer,
      correctAnswer: correctAnswerRaw,
      isCorrect,
      score: earnedScore,
      fullScore: qScore,
      options,
      analysis: q.analysis || q.explanation || ''
    });
  });

  const finalScore = Math.round(totalScore);
  const fullScore = exam.totalScore || examQuestions.reduce((s, eq) => s + (eq.score || 1), 0);
  const passed = finalScore >= (exam.passingScore || 60);
  const percent = fullScore > 0 ? Math.round(finalScore / fullScore * 100) : 0;

  // 更新 attempt 记录（使用上面已查找到的 attemptIndex）
  if (attemptIndex !== -1) {
    attempts[attemptIndex] = {
      ...attempts[attemptIndex],
      status: 'completed',
      completedAt: new Date().toISOString(),
      answers: answers || {},
      score: finalScore,
      passed,
      correctCount,
      totalQuestions: examQuestions.length,
      durationUsed: durationUsed || 0
    };
  }

  // 同步考试记录到用户学习数据（供个人中心徽章计算使用）
  const learningKey = `user_learning_${userId}`;
  if (!data[learningKey]) data[learningKey] = {};
  if (!data[learningKey].examRecords) data[learningKey].examRecords = [];
  // 根据记录成绩策略（最高/最新）决定是否写入个人中心记录
  const recordScore = exam.recordScore || 'highest';
  const existingRecordIdx = data[learningKey].examRecords.findIndex(r => r.examId === id);
  const newExamRecord = {
    examId: id,
    examTitle: exam.title || '',
    score: finalScore,
    fullScore,
    passed,
    correctCount,
    totalQuestions: examQuestions.length,
    completedAt: new Date().toISOString(),
    attemptId: attemptIndex !== -1 ? attempts[attemptIndex].id : null
  };
  if (existingRecordIdx >= 0) {
    const existing = data[learningKey].examRecords[existingRecordIdx];
    if (recordScore === 'latest') {
      data[learningKey].examRecords[existingRecordIdx] = newExamRecord;
    } else if (recordScore === 'highest') {
      if (finalScore >= (existing.score || 0)) {
        data[learningKey].examRecords[existingRecordIdx] = newExamRecord;
      }
    }
  } else {
    data[learningKey].examRecords.push(newExamRecord);
  }

  writeData(data);
  res.json({
    success: true,
    result: {
      score: finalScore,
      fullScore,
      passed,
      correctCount,
      totalCount: examQuestions.length,
      totalQuestions: examQuestions.length,
      percent,
      durationUsed: durationUsed || 0,
      detail
    }
  });
});

// POST /api/exams/:id/abandon - 放弃考试
app.post('/api/exams/:id/abandon', (req, res) => {
  const id = parseInt(req.params.id);
  const { attemptId } = req.body;
  const data = readData();
  const attempts = data.exam_attempts || [];
  const index = attempts.findIndex(a => a.id === attemptId);
  if (index !== -1) {
    attempts[index].status = 'abandoned';
    attempts[index].completedAt = new Date().toISOString();
    writeData(data);
  }
  res.json({ success: true });
});

// 题库管理 API 已迁移至 routes/question-routes.js

// 注册题库管理路由（question-banks 等，放在我们路由之后避免冲突）
app.use('/api', questionRoutes);

// ============================================================
// 用户管理 API
// ============================================================

// GET /api/users - 获取所有用户
app.get('/api/users', (req, res) => {
  const data = readData();
  res.json(data.users || []);
});

// POST /api/users - 添加用户
app.post('/api/users', (req, res) => {
  const user = req.body;
  const data = readData();
  if (!data.users) data.users = [];
  user.id = Date.now();
  data.users.push(user);
  if (writeData(data)) {
    res.json({ success: true, user });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/users/:id - 更新用户
app.put('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  const data = readData();
  const index = data.users?.findIndex(u => u.id === id);
  if (index !== -1) {
    data.users[index] = { ...data.users[index], ...updates };
    if (writeData(data)) {
      res.json({ success: true, user: data.users[index] });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '用户不存在' });
  }
});

// DELETE /api/users/:id - 删除用户
app.delete('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (data.users) {
    data.users = data.users.filter(u => u.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '用户列表不存在' });
  }
});

// ============================================================
// Banner管理 API
// ============================================================

// GET /api/banners - 获取所有Banner
app.get('/api/banners', (req, res) => {
  const data = readData();
  const banners = (data.index_banners || []).sort((a, b) => (a.order || 0) - (b.order || 0));
  // 附带关联课程信息
  const courses = data.management_courses || [];
  const enriched = banners.map(b => {
    const course = b.courseId ? courses.find(c => c.id === b.courseId) : null;
    return { ...b, courseTitle: course ? course.title : null };
  });
  res.json(enriched);
});

// POST /api/banners - 添加Banner（支持上传封面）
app.post('/api/banners', upload.single('cover'), (req, res) => {
  const data = readData();
  if (!data.index_banners) data.index_banners = [];

  let banner;
  if (req.file) {
    // 文件上传模式
    const coverUrl = '/uploads/covers/' + req.file.filename;
    banner = {
      id: Date.now(),
      img: coverUrl,
      courseId: req.body.courseId ? parseInt(req.body.courseId) : null,
      order: data.index_banners.length + 1,
      status: 'published',
      createdAt: new Date().toISOString()
    };
  } else {
    // JSON 模式
    banner = req.body;
    banner.id = Date.now();
    banner.status = banner.status || 'published';
    banner.createdAt = banner.createdAt || new Date().toISOString();
  }

  data.index_banners.push(banner);
  if (writeData(data)) {
    res.json({ success: true, banner });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// DELETE /api/banners/:id - 删除Banner
app.delete('/api/banners/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (data.index_banners) {
    data.index_banners = data.index_banners.filter(b => b.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '删除失败' });
    }
  } else {
    res.status(404).json({ success: false, error: 'Banner列表不存在' });
  }
});

// PUT /api/banners/:id - 更新Banner（支持上传封面）
app.put('/api/banners/:id', upload.single('cover'), (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const index = data.index_banners?.findIndex(b => b.id === id);
  if (index === -1 || index === undefined) {
    return res.status(404).json({ success: false, error: 'Banner不存在' });
  }

  const updates = {};
  if (req.file) {
    updates.img = '/uploads/covers/' + req.file.filename;
  }
  if (req.body.courseId !== undefined) updates.courseId = req.body.courseId ? parseInt(req.body.courseId) : null;
  if (req.body.order !== undefined) updates.order = parseInt(req.body.order);
  if (req.body.status !== undefined) updates.status = req.body.status;

  data.index_banners[index] = { ...data.index_banners[index], ...updates, updatedAt: new Date().toISOString() };
  if (writeData(data)) {
    res.json({ success: true, banner: data.index_banners[index] });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/banners/reorder - 批量更新排序
app.put('/api/banners/reorder', (req, res) => {
  const { orders } = req.body; // [{id, order}, ...]
  const data = readData();
  if (!data.index_banners || !Array.isArray(orders)) {
    return res.status(400).json({ success: false, error: '参数错误' });
  }
  orders.forEach(({ id, order }) => {
    const b = data.index_banners.find(b => b.id === id);
    if (b) b.order = order;
  });
  if (writeData(data)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// ============================================================
// 公告管理 API
// ============================================================

// GET /api/notices - 获取所有公告（含访问量）
app.get('/api/notices', (req, res) => {
  const data = readData();
  const notices = data.notices || [];
  const visits = data.notice_visits || [];
  
  // 为每条公告附加访问量统计
  const result = notices.map(n => ({
    ...n,
    visitCount: visits.filter(v => v.noticeId === n.id).length
  }));
  
  res.json(result);
});

// POST /api/notices - 添加公告
app.post('/api/notices', (req, res) => {
  const notice = req.body;
  const data = readData();
  if (!data.notices) data.notices = [];
  
  // 验证必填字段
  if (!notice.title || !notice.content) {
    return res.status(400).json({ success: false, error: '标题和内容不能为空' });
  }
  
  notice.id = Date.now();
  notice.createdAt = new Date().toISOString();
  notice.updatedAt = new Date().toISOString();
  
  data.notices.push(notice);
  
  // 注意：公告通知由 GET /api/notifications 从 notices 表动态生成，
  // 不在此处重复创建 notifications 记录，避免双重计数。
  
  if (writeData(data)) {
    res.json({ success: true, notice });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/notices/:id - 更新公告
app.put('/api/notices/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const index = data.notices?.findIndex(n => n.id === id);
  
  if (index === -1 || index === undefined) {
    return res.status(404).json({ success: false, error: '公告不存在' });
  }
  
  const updates = req.body;
  updates.updatedAt = new Date().toISOString();
  
  data.notices[index] = { ...data.notices[index], ...updates };
  if (writeData(data)) {
    res.json({ success: true, notice: data.notices[index] });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// POST /api/notices/unpin-all - 取消所有公告的置顶
app.post('/api/notices/unpin-all', (req, res) => {
  const data = readData();
  if (!data.notices) data.notices = [];
  
  let updatedCount = 0;
  data.notices.forEach(n => {
    if (n.pinned) {
      n.pinned = 0;
      n.updatedAt = new Date().toISOString();
      updatedCount++;
    }
  });
  
  if (writeData(data)) {
    console.log(`[公告] 已取消 ${updatedCount} 条公告的置顶`);
    res.json({ success: true, updatedCount });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// DELETE /api/notices/:id - 删除公告
app.delete('/api/notices/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  
  if (data.notices) {
    data.notices = data.notices.filter(n => n.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '删除失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '公告不存在' });
  }
});

// POST /api/notices/:id/visit - 记录公告访问
app.post('/api/notices/:id/visit', (req, res) => {
  const noticeId = parseInt(req.params.id);
  const { userId, username } = req.body;
  const data = readData();
  
  if (!data.notice_visits) data.notice_visits = [];
  
  // 同一用户对同一公告只记录一次
  const exists = data.notice_visits.find(v => v.noticeId === noticeId && v.userId === userId);
  if (exists) {
    exists.visitedAt = new Date().toISOString();
  } else {
    data.notice_visits.push({
      noticeId: noticeId,
      userId: userId || 'anonymous',
      username: username || '匿名用户',
      visitedAt: new Date().toISOString()
    });
  }
  
  if (writeData(data)) {
    res.json({ success: true, visitCount: data.notice_visits.filter(v => v.noticeId === noticeId).length });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// GET /api/notices/:id/visits - 获取公告访问详情
app.get('/api/notices/:id/visits', (req, res) => {
  const noticeId = parseInt(req.params.id);
  const data = readData();
  const visits = (data.notice_visits || []).filter(v => v.noticeId === noticeId);
  
  res.json({
    success: true,
    noticeId: noticeId,
    totalCount: visits.length,
    visits: visits.sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt))
  });
});

// ============================================================
// 调研管理 API
// ============================================================

// GET /api/surveys/stats - 获取调研统计概览（轻量接口，必须在 :id 路由之前）
app.get('/api/surveys/stats', (req, res) => {
  const data = readData();
  const surveys = data.surveys || [];
  const responses = data.survey_responses || [];
  res.json({
    success: true,
    data: {
      totalSurveys: surveys.length,
      activeSurveys: surveys.filter(s => s.status === 'active' || s.status === 'published').length,
      draftSurveys: surveys.filter(s => s.status === 'draft').length,
      endedSurveys: surveys.filter(s => s.status === 'ended').length,
      totalResponses: responses.length,
      responsesBySurvey: surveys.reduce((acc, s) => {
        acc[s.id] = responses.filter(r => r.surveyId === s.id).length;
        return acc;
      }, {})
    }
  });
});

// GET /api/surveys - 获取所有调研
app.get('/api/surveys', (req, res) => {
  const data = readData();
  if (!data.surveys) data.surveys = [];
  res.json({ success: true, data: data.surveys });
});

// GET /api/surveys/:id - 获取单个调研（含题目）
app.get('/api/surveys/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const survey = (data.surveys || []).find(s => s.id === id);
  if (!survey) return res.status(404).json({ success: false, error: '调研不存在' });
  res.json({ success: true, data: survey });
});

// POST /api/surveys - 创建调研（含题目）
app.post('/api/surveys', (req, res) => {
  const data = readData();
  if (!data.surveys) data.surveys = [];
  const survey = {
    id: Date.now(),
    title: req.body.title || '',
    description: req.body.description || '',
    status: req.body.status || 'draft',
    questions: req.body.questions || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.surveys.push(survey);
  if (writeData(data)) {
    res.json({ success: true, data: survey });
  } else {
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// PUT /api/surveys/:id - 更新调研（含题目）
app.put('/api/surveys/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const index = (data.surveys || []).findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ success: false, error: '调研不存在' });
  data.surveys[index] = { ...data.surveys[index], ...req.body, id, updatedAt: new Date().toISOString() };
  if (writeData(data)) {
    res.json({ success: true, data: data.surveys[index] });
  } else {
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// DELETE /api/surveys/:id - 删除调研
app.delete('/api/surveys/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  if (data.surveys) {
    data.surveys = data.surveys.filter(s => s.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '删除失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '调研不存在' });
  }
});

// GET /api/surveys/:id/responses - 获取调研作答记录
app.get('/api/surveys/:id/responses', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  if (!data.survey_responses) data.survey_responses = [];
  const users = data.registered_users || [];
  const responses = data.survey_responses.filter(r => r.surveyId === id).map(r => {
    const user = r.userId ? users.find(u => u.id === r.userId || u.id == r.userId) : null;
    return { ...r, department: r.department || (user ? (user.department || '') : '') };
  });
  res.json({ success: true, data: responses });
});

// GET /api/surveys/:id/check-responded - 检查用户是否已填写
app.get('/api/surveys/:id/check-responded', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const userId = req.query.userId;
  const trainingId = req.query.trainingId;
  const stageIdx = req.query.stageIdx;
  if (!data.survey_responses) data.survey_responses = [];
  const responded = data.survey_responses.some(r => {
    if (r.surveyId !== id) return false;
    if (r.userId != userId) return false;
    if (trainingId !== undefined && trainingId !== null && trainingId !== '') {
      if (r.trainingId != trainingId) return false;
    }
    if (stageIdx !== undefined && stageIdx !== null && stageIdx !== '') {
      if (r.stageIdx != stageIdx) return false;
    }
    return true;
  });
  res.json({ success: true, responded });
});

// POST /api/surveys/:id/responses - 提交调研作答
app.post('/api/surveys/:id/responses', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const survey = (data.surveys || []).find(s => s.id === id);
  if (!survey) return res.status(404).json({ success: false, error: '调研不存在' });
  if (!data.survey_responses) data.survey_responses = [];
  const users = data.registered_users || [];
  const userId = req.body.userId || null;
  const user = userId ? users.find(u => u.id === userId || u.id == userId) : null;
  const response = {
    id: Date.now(),
    surveyId: id,
    userId: userId,
    userName: req.body.userName || '匿名用户',
    department: req.body.department || (user ? (user.department || '') : ''),
    answers: req.body.answers || {},
    trainingId: req.body.trainingId || null,
    stageIdx: req.body.stageIdx != null ? req.body.stageIdx : null,
    submittedAt: new Date().toISOString()
  };
  data.survey_responses.push(response);
  if (writeData(data)) {
    res.json({ success: true, data: response });
  } else {
    res.status(500).json({ success: false, error: '提交失败' });
  }
});

// POST /api/surveys/:id/respond - 提交调研作答（别名）
app.post('/api/surveys/:id/respond', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const survey = (data.surveys || []).find(s => s.id === id);
  if (!survey) return res.status(404).json({ success: false, error: '调研不存在' });
  if (!data.survey_responses) data.survey_responses = [];
  const users = data.registered_users || [];
  const userId = req.body.userId || null;
  const user = userId ? users.find(u => u.id === userId || u.id == userId) : null;
  const response = {
    id: Date.now(),
    surveyId: id,
    userId: userId,
    userName: req.body.userName || '匿名用户',
    department: req.body.department || (user ? (user.department || '') : ''),
    answers: req.body.answers || {},
    trainingId: req.body.trainingId || null,
    stageIdx: req.body.stageIdx != null ? req.body.stageIdx : null,
    submittedAt: new Date().toISOString()
  };
  data.survey_responses.push(response);
  if (writeData(data)) {
    res.json({ success: true, data: response });
  } else {
    res.status(500).json({ success: false, error: '提交失败' });
  }
});

// ============================================================


// // ============================================================
// 讲师报名申请 API
// ============================================================

// GET /api/lecturer-applications - 获取所有报名申请
app.get('/api/lecturer-applications', (req, res) => {
  const data = readData();
  if (!data.lecturer_applications) data.lecturer_applications = [];
  res.json({ success: true, data: data.lecturer_applications });
});

// POST /api/lecturer-applications - 提交讲师报名
app.post('/api/lecturer-applications', (req, res) => {
  const data = readData();
  if (!data.lecturer_applications) data.lecturer_applications = [];
  const app = {
    id: Date.now(),
    name: req.body.name || '',
    department: req.body.department || '',
    skills: req.body.skills || [],
    experience: req.body.experience || '',
    intro: req.body.intro || '',
    reason: req.body.reason || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  data.lecturer_applications.push(app);
  if (writeData(data)) {
    res.json({ success: true, data: app });
  } else {
    res.status(500).json({ success: false, error: '提交失败' });
  }
});

// PUT /api/lecturer-applications/:id - 审核报名（通过/拒绝）
app.put('/api/lecturer-applications/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const index = (data.lecturer_applications || []).findIndex(a => a.id === id);
  if (index === -1) return res.status(404).json({ success: false, error: '申请不存在' });

  const oldStatus = data.lecturer_applications[index].status;
  data.lecturer_applications[index] = { ...data.lecturer_applications[index], ...req.body, id };

  // 审核通过则自动创建讲师
  if (req.body.status === 'approved') {
    const app = data.lecturer_applications[index];
    if (!data.lecturers) data.lecturers = [];
    const existing = data.lecturers.find(l => l.name === app.name);
    if (!existing) {
      data.lecturers.push({
        id: Date.now(),
        name: app.name,
        department: app.department,
        title: '内部讲师',
        level: 'intern',
        levelName: '实习讲师',
        avatar: '',
        intro: app.intro || '',
        paymentRate: 0,
        status: 'disabled',  // 审批通过后默认禁用，等上传头像后再启用
        type: 'internal',
        skills: app.skills || [],
        courseCount: 0,
        regDate: new Date().toISOString().split('T')[0]
      });
    }
  }

  // 发送消息通知（仅当状态发生变化时）
  if (oldStatus !== req.body.status && (req.body.status === 'approved' || req.body.status === 'rejected')) {
    const app = data.lecturer_applications[index];
    
    let title, content;
    if (req.body.status === 'approved') {
      title = '🎉 讲师申请已通过';
      content = `恭喜您！您的讲师申请已审核通过。接下来请等待人力资源部与您联系，安排后续事宜。如有疑问，请联系人力资源部-许志坚。`;
    } else {
      title = '讲师申请结果通知';
      content = `很遗憾，您的讲师申请未通过审核。感谢您的积极参与，期待下次合作！如有疑问，请联系人力资源部-许志坚。`;
    }
    
    // 查找申请人对应的用户ID（注意：用户数据存储在 registered_users 中）
    let userId = null;
    if (data.registered_users) {
      const user = data.registered_users.find(u => 
        u.realName === app.name || 
        u.real_name === app.name || 
        u.name === app.name ||
        u.username === app.name
      );
      if (user) {
        userId = user.id;
        console.log(`[通知] 找到用户: ${app.name}, userId: ${userId}`);
      } else {
        console.warn(`[通知] 未找到申请人 ${app.name} 对应的用户记录`);
      }
    } else {
      console.warn('[通知] data.registered_users 不存在');
    }
    
    // 如果找到用户ID，发送通知
    if (userId) {
      initNotificationsData(data);
      const notification = {
        id: Date.now(),
        userId: userId,
        title: title,
        content: content,
        type: 'system',
        read: false,
        createdAt: new Date().toISOString()
      };
      data.notifications.push(notification);
      console.log(`[通知] 已发送通知给用户 ${userId}:`, notification.title);
    } else {
      console.error('[通知] 无法发送通知：未找到用户ID');
    }
  }

  if (writeData(data)) {
    res.json({ success: true, data: data.lecturer_applications[index] });
  } else {
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// DELETE /api/lecturer-applications/:id - 删除申请
app.delete('/api/lecturer-applications/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  if (data.lecturer_applications) {
    data.lecturer_applications = data.lecturer_applications.filter(a => a.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '删除失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '申请不存在' });
  }
});

// ============================================================
// 通知管理 API
// ============================================================

// 获取当前登录用户
function getCurrentUser(req) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return null;
  return verifyToken(token);
}

// 初始化通知相关数据结构
function initNotificationsData(data) {
  if (!data.notifications) data.notifications = [];  // 个人通知
  if (!data.notification_reads) data.notification_reads = [];  // 已读记录
  return data;
}

// 统一发送考试通知（支持指定学员和全员开放）
function sendExamNotifications(data, exam) {
  initNotificationsData(data);
  const users = data.registered_users || [];
  let targetUsers = [];

  if (exam.allowedUsers && Array.isArray(exam.allowedUsers) && exam.allowedUsers.length > 0) {
    // 指定学员：只通知 selected users（用 String 比较兼容 number/string 类型不一致）
    const allowedIds = exam.allowedUsers.map(id => String(id));
    targetUsers = users.filter(u => allowedIds.includes(String(u.id)));
  } else {
    // 全员开放：通知所有活跃学员
    targetUsers = users.filter(u => u.status !== 'disabled');
  }

  if (targetUsers.length === 0) return 0;

  const now = Date.now();
  let addedCount = 0;
  targetUsers.forEach((user, i) => {
    // 避免重复通知（同一考试同一用户）
    const alreadyNotified = data.notifications.some(n =>
      String(n.userId) === String(user.id) && n.type === 'exam' && n.examId === exam.id
    );
    if (alreadyNotified) return;

    data.notifications.push({
      id: now + i,
      userId: user.id,
      title: '新考试安排',
      content: `您有一场新考试「${exam.title}」待参加，考试时长${exam.duration || 60}分钟，及格分数${exam.passingScore || 60}分，请尽快完成。`,
      type: 'exam',
      examId: exam.id,
      read: false,
      createdAt: new Date().toISOString()
    });
    addedCount++;
  });
  writeData(data);
  return addedCount;
}

// GET /api/notifications - 获取当前用户的通知（公告 + 个人通知）
app.get('/api/notifications', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  const data = readData();
  initNotificationsData(data);
  
  const notifications = [];
  
  // 1. 将已发布的公告转换为通知
  if (data.notices && Array.isArray(data.notices)) {
    const publishedNotices = data.notices.filter(n => n.status === 'published');
    publishedNotices.forEach(notice => {
      // 检查用户是否已读
      const readRecord = data.notification_reads.find(
        r => r.userId === currentUser.id && r.noticeId === notice.id
      );
      
      // 智能截取纯文本预览：去除HTML标签和base64图片后保留前120字
      let contentPreview = (notice.content || '')
        .replace(/<img[^>]*>/gi, '[图片]')     // 图片替换为[图片]
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')               // 去其余HTML标签
        .replace(/\s+/g, ' ')
        .trim();
      if (contentPreview.length > 120) {
        contentPreview = contentPreview.substring(0, 120) + '...';
      }
      
      notifications.push({
        id: 'notice_' + notice.id,  // 前缀避免ID冲突
        originalId: notice.id,
        title: notice.title,
        content: contentPreview || '点击查看公告详情',
        fullContent: notice.content || '',  // 保留原始 HTML 用于详情展示
        type: 'announcement',
        isHtml: true,
        read: !!readRecord,
        readAt: readRecord ? readRecord.readAt : null,
        createdAt: notice.publishedAt || notice.createdAt,
        pinned: notice.pinned || false
      });
    });
  }
  
  // 2. 添加用户的个人通知
  const userNotifications = data.notifications.filter(
    n => String(n.userId) === String(currentUser.id)
  );
  userNotifications.forEach(n => {
    notifications.push({
      ...n,
      id: 'notification_' + n.id
    });
  });
  
  // 3. 按时间倒序排序（置顶的排最前）
  notifications.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  res.json({ success: true, data: notifications });
});

// PUT /api/notifications/:id/read - 标记通知已读
app.put('/api/notifications/:id/read', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  const notificationId = req.params.id;
  const data = readData();
  initNotificationsData(data);
  
  // 处理公告类型的通知
  if (notificationId.startsWith('notice_')) {
    const noticeId = parseInt(notificationId.replace('notice_', ''));
    
    // 检查是否已有已读记录
    const existingRead = data.notification_reads.find(
      r => r.userId === currentUser.id && r.noticeId === noticeId
    );
    
    if (!existingRead) {
      data.notification_reads.push({
        userId: currentUser.id,
        noticeId: noticeId,
        readAt: new Date().toISOString()
      });
      writeData(data);
    }
    
    res.json({ success: true });
  } else {
    // 处理个人通知
    const notifId = parseInt(notificationId.replace('notification_', ''));
    const notification = data.notifications.find(n => n.id === notifId);
    
    if (notification && notification.userId === currentUser.id) {
      notification.read = true;
      notification.readAt = new Date().toISOString();
      writeData(data);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: '通知不存在' });
    }
  }
});

// POST /api/notifications/batch-read - 批量标记已读
app.post('/api/notifications/batch-read', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  let { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: '无效的ID列表' });
  }
  
  // 兼容纯数字ID和带前缀的ID格式
  ids = ids.map(id => {
    if (typeof id === 'number') return 'notification_' + id;
    if (typeof id === 'string' && !id.startsWith('notice_') && !id.startsWith('notification_')) {
      return 'notification_' + id;
    }
    return id;
  });
  
  const data = readData();
  initNotificationsData(data);
  
  ids.forEach(id => {
    if (id.startsWith('notice_')) {
      const noticeId = parseInt(id.replace('notice_', ''));
      const existingRead = data.notification_reads.find(
        r => r.userId === currentUser.id && r.noticeId === noticeId
      );
      if (!existingRead) {
        data.notification_reads.push({
          userId: currentUser.id,
          noticeId: noticeId,
          readAt: new Date().toISOString()
        });
      }
    } else {
      const notifId = parseInt(id.replace('notification_', ''));
      const notification = data.notifications.find(
        n => n.id === notifId && n.userId === currentUser.id
      );
      if (notification) {
        notification.read = true;
        notification.readAt = new Date().toISOString();
      }
    }
  });
  
  writeData(data);
  res.json({ success: true, updated: ids.length });
});

// POST /api/notifications/batch-delete - 批量删除通知（仅限个人通知）
app.post('/api/notifications/batch-delete', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  let { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: '无效的ID列表' });
  }
  
  // 兼容纯数字ID和带前缀的ID格式
  ids = ids.map(id => {
    if (typeof id === 'number') return 'notification_' + id;
    if (typeof id === 'string' && !id.startsWith('notice_') && !id.startsWith('notification_')) {
      return 'notification_' + id;
    }
    return id;
  });
  
  const data = readData();
  initNotificationsData(data);
  
  // 只能删除个人通知，不能删除公告
  const personalIds = ids
    .filter(id => id.startsWith('notification_'))
    .map(id => parseInt(id.replace('notification_', '')));
  
  data.notifications = data.notifications.filter(n => {
    if (n.userId !== currentUser.id) return true;  // 保留其他用户的
    return !personalIds.includes(n.id);  // 删除当前用户的指定通知
  });
  
  writeData(data);
  res.json({ success: true, deleted: personalIds.length });
});

// DELETE /api/notifications/:id - 删除单条通知（仅限个人通知）
app.delete('/api/notifications/:id', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  const notificationId = parseInt(req.params.id);
  if (isNaN(notificationId)) {
    return res.status(400).json({ success: false, error: '无效的通知ID' });
  }
  
  const data = readData();
  initNotificationsData(data);
  
  const index = data.notifications.findIndex(
    n => n.id === notificationId && n.userId === currentUser.id
  );
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '通知不存在或无权限删除' });
  }
  
  data.notifications.splice(index, 1);
  writeData(data);
  res.json({ success: true, message: '已删除该消息' });
});

// POST /api/notifications - 创建个人通知（系统内部调用）
app.post('/api/notifications', (req, res) => {
  const notification = req.body;
  
  // 验证必填字段
  if (!notification.userId || !notification.title || !notification.content) {
    return res.status(400).json({ success: false, error: '用户ID、标题和内容不能为空' });
  }
  
  const data = readData();
  initNotificationsData(data);
  
  notification.id = Date.now();
  notification.type = notification.type || 'system';
  notification.read = false;
  notification.createdAt = new Date().toISOString();
  
  data.notifications.push(notification);
  
  if (writeData(data)) {
    res.json({ success: true, notification });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// ============================================================
// 课程分类 API
// ============================================================

// GET /api/categories - 获取所有分类
app.get('/api/categories', (req, res) => {
  const data = readData();
  res.json(data.course_categories || []);
});

// POST /api/categories - 添加分类
app.post('/api/categories', (req, res) => {
  const category = req.body;
  const data = readData();
  if (!data.course_categories) data.course_categories = [];
  category.id = Date.now();
  data.course_categories.push(category);
  if (writeData(data)) {
    res.json({ success: true, category });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/categories/:id - 更新分类
app.put('/api/categories/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  const data = readData();
  const index = data.course_categories?.findIndex(c => c.id === id);
  if (index !== -1) {
    data.course_categories[index] = { ...data.course_categories[index], ...updates };
    if (writeData(data)) {
      res.json({ success: true, category: data.course_categories[index] });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '分类不存在' });
  }
});

// DELETE /api/categories/:id - 删除分类
app.delete('/api/categories/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (data.course_categories) {
    data.course_categories = data.course_categories.filter(c => c.id !== id);
    if (writeData(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } else {
    res.status(404).json({ success: false, error: '分类列表不存在' });
  }
});

// ============================================================
// 题库管理 API
// ============================================================

// GET /api/questions - 获取题目列表（支持分页和筛选）
app.get('/api/questions', (req, res) => {
  const data = readData();
  let questions = data.questions || [];
  
  // 筛选条件
  const { pageSize, page, bankId, type, difficulty, keyword } = req.query;
  
  // 按题库筛选
  if (bankId) {
    questions = questions.filter(q => String(q.bankId) === String(bankId));
  }
  
  // 按题型筛选
  if (type) {
    questions = questions.filter(q => q.type === type);
  }
  
  // 按难度筛选
  if (difficulty) {
    questions = questions.filter(q => q.difficulty === difficulty);
  }
  
  // 按关键词搜索
  if (keyword) {
    const kw = keyword.toLowerCase();
    questions = questions.filter(q => 
      (q.title || '').toLowerCase().includes(kw) ||
      (q.content || '').toLowerCase().includes(kw)
    );
  }
  
  // 分页
  const limit = parseInt(pageSize) || 100;
  const offset = (parseInt(page) - 1) * limit || 0;
  const paginatedQuestions = questions.slice(offset, offset + limit);
  
  res.json({ 
    success: true, 
    data: paginatedQuestions,
    total: questions.length,
    page: parseInt(page) || 1,
    pageSize: limit
  });
});

// ============================================================
// 数据统计 API
// ============================================================

// GET /api/stats - 获取统计数据
app.get('/api/stats', (req, res) => {
  const data = readData();
  const courses = data.management_courses || [];
  const lecturers = data.lecturers || [];
  const users = data.registered_users || [];
  const categories = data.course_categories || [];
  const exams = data.exams || [];
  const attempts = data.exam_attempts || [];

  const stats = {
    courses: {
      total: courses.length,
      published: courses.filter(c => c.status === 'published').length,
      draft: courses.filter(c => c.status === 'draft').length,
      offline: courses.filter(c => c.status === 'offline').length
    },
    exams: {
      total: exams.length,
      published: exams.filter(e => e.status === 'published').length,
      draft: exams.filter(e => e.status === 'draft').length,
      closed: exams.filter(e => e.status === 'closed').length,
      totalAttempts: attempts.length,
      completedAttempts: attempts.filter(a => a.status === 'completed').length,
      passRate: attempts.filter(a => a.status === 'completed' && a.passed).length / (attempts.filter(a => a.status === 'completed').length || 1) * 100
    },
    lecturers: {
      total: lecturers.length,
      enabled: lecturers.filter(l => l.status === 'enabled').length,
      disabled: lecturers.filter(l => l.status === 'disabled').length,
      chief: lecturers.filter(l => l.level === 'chief').length,
      senior: lecturers.filter(l => l.level === 'senior').length,
      intermediate: lecturers.filter(l => l.level === 'intermediate').length,
      junior: lecturers.filter(l => l.level === 'junior').length
    },
    users: {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      disabled: users.filter(u => u.status === 'disabled').length
    },
    categories: {
      parent: categories.length,
      child: categories.reduce((sum, c) => sum + (c.children?.length || 0), 0)
    }
  };
  
  res.json(stats);
});

// GET /api/export/courses - 导出课程数据(CSV)
app.get('/api/export/courses', (req, res) => {
  const data = readData();
  const courses = data.management_courses || [];
  const categories = data.course_categories || [];
  const lecturers = data.lecturers || [];
  
  const csvRows = ['课程ID,课程名称,一级分类,二级分类,讲师,状态,视频数,时长(秒),观看数,评分,创建时间'];
  
  courses.forEach(course => {
    const cat = categories.find(c => c.id === course.categoryId);
    const subCat = cat?.children?.find(s => s.id === course.subcategoryId);
    const lecturer = lecturers.find(l => l.id === course.lecturerId);
    const statusMap = { published: '已发布', draft: '草稿', offline: '已下架' };
    
    csvRows.push([
      course.id,
      `"${(course.title || '').replace(/"/g, '""')}"`,
      cat?.name || '',
      subCat?.name || '',
      lecturer?.name || '',
      statusMap[course.status] || course.status,
      course.videos?.length || 0,
      course.duration || 0,
      course.views || 0,
      course.rating || 0,
      course.createdAt || ''
    ].join(','));
  });
  
  const BOM = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=courses_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(BOM + csvRows.join('\n'));
});

// GET /api/export/lecturers - 导出讲师数据(CSV)
app.get('/api/export/lecturers', (req, res) => {
  const data = readData();
  const lecturers = data.lecturers || [];
  
  const levelMap = { chief: '首席讲师', senior: '高级讲师', intermediate: '中级讲师', junior: '初级讲师', intern: '实习讲师' };
  const typeMap = { internal: '内聘', external: '外聘' };
  
  const csvRows = ['讲师ID,姓名,类型,部门,等级,职称,课程数,状态,标签,登记时间'];
  
  lecturers.forEach(l => {
    csvRows.push([
      l.id,
      `"${(l.name || '').replace(/"/g, '""')}"`,
      typeMap[l.type] || '内聘',
      l.department || '',
      levelMap[l.level] || '',
      l.title || '',
      l.courseCount || 0,
      l.status === 'enabled' ? '启用' : '禁用',
      `"${(l.skills || []).join(';')}"`,
      l.regDate || ''
    ].join(','));
  });
  
  const BOM = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=lecturers_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(BOM + csvRows.join('\n'));
});

// GET /api/export/users - 导出用户数据(CSV)
app.get('/api/export/users', (req, res) => {
  const data = readData();
  const users = data.registered_users || [];
  
  const csvRows = ['用户ID,用户名,姓名,邮箱,手机,部门,角色,注册时间,最后登录,状态'];
  
  users.forEach(u => {
    csvRows.push([
      u.id,
      `"${(u.username || '').replace(/"/g, '""')}"`,
      u.realName || '',
      u.email || '',
      u.phone || '',
      u.department || '',
      u.role === 'admin' ? '管理员' : '普通用户',
      u.createdAt || '',
      u.lastLogin || '',
      u.status === 'active' ? '正常' : '禁用'
    ].join(','));
  });
  
  const BOM = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(BOM + csvRows.join('\n'));
});

// GET /api/export/learning-records - 导出学习记录(CSV)
app.get('/api/export/learning-records', (req, res) => {
  const data = readData();
  const history = data.learning_history || [];
  
  const csvRows = ['记录ID,课程ID,课程名称,学习日期,学习时长(分钟)'];
  
  history.forEach((r, i) => {
    csvRows.push([
      i + 1,
      r.courseId || '',
      `"${(r.courseName || '').replace(/"/g, '""')}"`,
      r.date || '',
      r.duration || 0
    ].join(','));
  });
  
  const BOM = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=learning_records_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(BOM + csvRows.join('\n'));
});

// GET /api/export/categories - 导出分类数据(CSV)
app.get('/api/export/categories', (req, res) => {
  const data = readData();
  const categories = data.course_categories || [];
  
  const csvRows = ['分类ID,分类名称,标识,图标,类型,父分类'];
  
  categories.forEach(cat => {
    csvRows.push([
      cat.id,
      `"${(cat.name || '').replace(/"/g, '""')}"`,
      cat.key || '',
      cat.icon || '',
      '一级分类',
      ''
    ].join(','));
    
    (cat.children || []).forEach(sub => {
      csvRows.push([
        sub.id,
        `"${(sub.name || '').replace(/"/g, '""')}"`,
        sub.key || '',
        '',
        '二级分类',
        cat.name
      ].join(','));
    });
  });
  
  const BOM = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=categories_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(BOM + csvRows.join('\n'));
});

// GET /api/export/all - 导出全部数据(JSON)
app.get('/api/export/all', (req, res) => {
  const data = readData();
  res.setHeader('Content-Type', 'application/json;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=all_data_${new Date().toISOString().split('T')[0]}.json`);
  res.json(data);
});

// ============================================================
// 静态页面路由
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/:page', (req, res) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send(`页面 "${page}" 未找到`);
    }
  });
});

// ============================================================
// 用户个人资料 API
// ============================================================

// POST /api/auth/avatar - 上传/更换头像（自动删除旧头像文件）
app.post('/api/auth/avatar', (req, res) => {
  // 创建专门的头像上传配置
  const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const targetDir = path.join(uploadsDir, 'avatars');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, uniqueSuffix + ext);
    }
  });
  
  const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('只允许上传图片文件'), false);
      }
    }
  }).single('avatar');
  
  avatarUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: '没有文件上传' });
    }

    const data = readData();
    if (!data.registered_users) data.registered_users = [];
    const userIndex = data.registered_users.findIndex(u => u.id === currentUser.id);
    if (userIndex === -1) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    const user = data.registered_users[userIndex];
    const oldAvatar = user.avatar || '';

    // 删除旧头像文件（仅当是服务器本地文件时）
    if (oldAvatar && oldAvatar.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, oldAvatar);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
          console.log(`  已删除旧头像: ${oldAvatar}`);
        } catch (e) {
          console.warn('  删除旧头像失败:', e.message);
        }
      }
    }

    // 更新头像 URL
    const newAvatarUrl = `/uploads/avatars/${req.file.filename}`;
    user.avatar = newAvatarUrl;

    if (writeData(data)) {
      const userInfo = { ...user };
      delete userInfo.passwordHash;
      res.json({ success: true, data: { avatar: newAvatarUrl, user: userInfo } });
    } else {
      res.status(500).json({ success: false, error: '保存失败' });
    }
  });
});

// PUT /api/auth/profile - 更新当前用户个人资料
app.put('/api/auth/profile', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }

  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  const userIndex = data.registered_users.findIndex(u => u.id === currentUser.id);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }

  const user = data.registered_users[userIndex];
  const { realName, department, position, phone, email } = req.body;
  if (realName !== undefined) user.realName = realName;
  if (department !== undefined) user.department = department;
  if (position !== undefined) user.position = position;
  if (phone !== undefined) user.phone = phone;
  if (email !== undefined) user.email = email;

  if (writeData(data)) {
    const userInfo = { ...user };
    delete userInfo.passwordHash;
    res.json({ success: true, data: { user: userInfo } });
  } else {
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// ============================================================
// 文件上传 API
// ============================================================

// POST /api/upload - 上传单个文件
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '没有文件上传' });
  }
  
  const fileUrl = `/uploads/${req.query.type || 'misc'}/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

// POST /api/upload/multiple - 批量上传文件
app.post('/api/upload/multiple', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: '没有文件上传' });
  }
  
  const files = req.files.map(file => ({
    url: `/uploads/${req.query.type || 'misc'}/${file.filename}`,
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    mimetype: file.mimetype
  }));
  
  res.json({
    success: true,
    files: files,
    count: files.length
  });
});


// DELETE /api/upload/:type/:filename - 删除上传的文件
app.delete('/api/upload/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const filePath = path.join(uploadsDir, type, filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: '文件已删除' });
  } else {
    res.status(404).json({ success: false, error: '文件不存在' });
  }
});

// POST /api/upload/notice-cover - 上传公告封面图
app.post('/api/upload/notice-cover', (req, res) => {
  // 动态设置上传目录为 images
  const uploadNoticeCover = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const targetDir = path.join(uploadsDir, 'images');
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        cb(null, targetDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
      }
    }),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('只允许上传图片文件'));
      }
    }
  }).single('cover');
  
  uploadNoticeCover(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未找到文件' });
    }
    
    const fileUrl = `/uploads/images/${req.file.filename}`;
    
    res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname
    });
  });
});

// ============================================================
// 错误处理
// ============================================================
app.use((req, res) => {
  res.status(404).send('请求的资源不存在');
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: '文件大小超过限制（最大500MB）' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  res.status(500).send('服务器内部错误');
});

// ============================================================
// 启动服务器
// ============================================================
const server = app.listen(port, () => {
  console.log('');
  console.log('========================================');
  console.log('  游雁学院 - 企业学习平台');
  console.log('========================================');
  console.log(`  服务器已启动: http://localhost:${port}`);
  console.log('');
  
  // 初始化管理员账号
  initDefaultAdmin();
  console.log('');
  
  console.log('  页面访问地址：');
  console.log(`  首页:       http://localhost:${port}/`);
  console.log(`  课程中心:   http://localhost:${port}/course`);
  console.log(`  讲师风采:   http://localhost:${port}/teacher`);
  console.log(`  个人中心:   http://localhost:${port}/center`);
  console.log(`  课程播放:   http://localhost:${port}/player`);
  console.log('');
  console.log('  管理后台：');
  console.log(`  管理主页:   http://localhost:${port}/dashboard.html`);
  console.log('');
  console.log('  API 接口：');
  console.log(`  获取全部数据: GET  http://localhost:${port}/api/data`);
  console.log(`  获取单条数据: GET  http://localhost:${port}/api/data/:key`);
  console.log(`  同步数据:     POST http://localhost:${port}/api/sync/:key`);
  console.log(`  批量同步:     POST http://localhost:${port}/api/sync-all`);
  console.log(`  数据迁移:     POST http://localhost:${port}/api/migrate`);
  console.log(`  数据重置:     POST http://localhost:${port}/api/reset`);
  console.log('');
  console.log('  CRUD 接口：');
  console.log(`  课程管理:     GET/POST   http://localhost:${port}/api/courses`);
  console.log(`  课程管理:     PUT/DELETE http://localhost:${port}/api/courses/:id`);
  console.log(`  讲师管理:     GET/POST   http://localhost:${port}/api/lecturers`);
  console.log(`  讲师管理:     PUT/DELETE http://localhost:${port}/api/lecturers/:id`);
  console.log(`  培训管理:     GET/POST   http://localhost:${port}/api/training`);
  console.log(`  培训管理:     PUT/DELETE http://localhost:${port}/api/training/:id`);
  console.log(`  用户管理:     GET/POST   http://localhost:${port}/api/users`);
  console.log(`  用户管理:     PUT/DELETE http://localhost:${port}/api/users/:id`);
  console.log(`  公告管理:     GET/POST   http://localhost:${port}/api/notices`);
  console.log(`  公告管理:     PUT/DELETE http://localhost:${port}/api/notices/:id`);
  console.log(`  Banner管理:  GET/POST   http://localhost:${port}/api/banners`);
  console.log(`  Banner管理:  DELETE     http://localhost:${port}/api/banners/:id`);
  console.log(`  分类管理:    GET/POST   http://localhost:${port}/api/categories`);
  console.log(`  分类管理:    PUT/DELETE http://localhost:${port}/api/categories/:id`);
  console.log('');
  console.log('========================================');
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  server.close(() => {
    console.log('服务器已停止');
    process.exit(0);
  });
});

