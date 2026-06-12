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

// 管理员账号配置
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin2026';

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

// 从 course_ratings 计算课程平均评分
function getCourseAvgRating(data, courseId) {
  const ratings = (data.course_ratings || []).filter(r => r.courseId === courseId);
  if (ratings.length === 0) return null;  // 无人评分返回 null，前端兜底显示 0
  return Math.round((ratings.reduce((s, r) => s + r.score, 0) / ratings.length) * 10) / 10;
}

// ============================================================
// API 路由
// ============================================================

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
  
  // 首先检查是否是管理员登录
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const adminUser = {
      id: 0,
      username: ADMIN_USERNAME,
      role: 'admin',
      realName: '系统管理员',
      email: 'admin@youyan.com',
      avatar: ''
    };
    const token = createToken(adminUser);
    return res.json({
      success: true,
      message: '管理员登录成功',
      data: {
        token,
        user: adminUser
      }
    });
  }
  
  // 查找普通用户
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
  
  let user;
  if (payload.id === 0 && payload.role === 'admin') {
    user = {
      id: 0,
      username: ADMIN_USERNAME,
      role: 'admin',
      realName: '系统管理员',
      email: 'admin@youyan.com',
      avatar: ''
    };
  } else {
    user = data.registered_users.find(u => u.id === payload.id);
    if (!user) {
      return res.status(401).json({ success: false, error: '用户不存在' });
    }
    user = { ...user };
    delete user.passwordHash;
  }
  
  res.json({
    success: true,
    data: { user }
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
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  const userIndex = data.registered_users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  
  // 生成随机密码（8位字母数字组合）
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let newPassword = '';
  for (let i = 0; i < 8; i++) {
    newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // 更新密码
  data.registered_users[userIndex].passwordHash = hashPassword(newPassword);
  
  if (writeData(data)) {
    res.json({ 
      success: true, 
      message: '密码重置成功',
      data: { 
        username: data.registered_users[userIndex].username,
        newPassword: newPassword 
      } 
    });
  } else {
    res.status(500).json({ success: false, error: '重置失败' });
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
      endTime: event.endTime
    };
  });

  // 按日期排序
  schedule.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  res.json({ success: true, data: schedule });
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
  const ratings = (data.course_ratings || []).filter(r => r.courseId === courseId);
  const avg = ratings.length > 0
    ? Math.round((ratings.reduce((s, r) => s + r.score, 0) / ratings.length) * 10) / 10
    : 0;
  const myRating = userId ? ratings.find(r => r.userId === userId)?.score : null;
  res.json({ success: true, avgRating: avg, ratingCount: ratings.length, myRating });
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
  // 关联题目数量
  const enriched = exams.map(exam => ({
    ...exam,
    questionCount: (exam.questions || []).length,
    attemptCount: (data.exam_attempts || []).filter(a => a.examId === exam.id).length
  }));
  res.json(enriched);
});

// POST /api/exams - 创建考试
app.post('/api/exams', (req, res) => {
  const { title, description, duration, passingScore, totalScore, bankId, shuffleQuestions, showAnswer, status, questions, startTime, endTime, maxAttempts } = req.body;
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
    showAnswer: !!showAnswer,
    status: status || 'draft',
    questions: questions || [],
    startTime: startTime || null,
    endTime: endTime || null,
    maxAttempts: parseInt(maxAttempts) || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.exams.push(newExam);
  if (writeData(data)) {
    res.json({ success: true, exam: newExam });
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
  delete updates.id; // 不允许修改ID
  delete updates.createdAt; // 不允许修改创建时间
  updates.updatedAt = new Date().toISOString();
  data.exams[index] = { ...exams[index], ...updates };
  if (writeData(data)) {
    res.json({ success: true, exam: data.exams[index] });
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
  exams[index].status = status;
  exams[index].updatedAt = new Date().toISOString();
  if (writeData(data)) {
    res.json({ success: true, exam: exams[index] });
  } else {
    res.status(500).json({ success: false, error: '状态更新失败' });
  }
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
  // 关联用户信息
  const users = data.users || [];
  const results = attempts.map(a => {
    const user = users.find(u => u.id === a.userId);
    return { ...a, userName: user ? (user.real_name || user.username) : '未知用户' };
  }).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  res.json({ success: true, results });
});

// POST /api/exams/:id/take - 学员开始考试（获取试卷）
app.post('/api/exams/:id/take', (req, res) => {
  const id = parseInt(req.params.id);
  const { userId } = req.query;
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id && e.status === 'published');
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在或未发布' });
  }
  const allQuestions = data.questions || [];
  let examQuestions = (exam.questions || [])
    .map(eq => {
      const q = allQuestions.find(qq => qq.id === eq.questionId);
      return q ? { ...q, score: eq.score || 1, order: eq.order || 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);

  // 如果配置了随机打乱
  if (exam.shuffleQuestions) {
    examQuestions = examQuestions.sort(() => Math.random() - 0.5);
  }

  // 去掉答案
  const safeQuestions = examQuestions.map(({ answer, analysis, ...rest }) => rest);

  res.json({
    success: true,
    exam: { ...exam, questions: undefined },
    questions: safeQuestions,
    totalQuestions: examQuestions.length,
    duration: exam.duration * 60 // 转换为秒
  });
});

// POST /api/exams/:id/enter - 学员进入考试（记录开始）
app.post('/api/exams/:id/enter', (req, res) => {
  const id = parseInt(req.params.id);
  const { userId } = req.body;
  const data = readData();
  if (!data.exam_attempts) data.exam_attempts = [];
  const attemptId = Date.now();
  data.exam_attempts.push({
    id: attemptId,
    examId: id,
    userId: userId,
    status: 'taking',
    startedAt: new Date().toISOString(),
    answers: {},
    score: null,
    passed: null
  });
  writeData(data);
  res.json({ success: true, attemptId });
});

// POST /api/exams/:id/submit - 提交考试答卷
app.post('/api/exams/:id/submit', (req, res) => {
  const id = parseInt(req.params.id);
  const { userId, attemptId, answers } = req.body;
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) return res.status(404).json({ success: false, error: '考试不存在' });

  const allQuestions = data.questions || [];
  let correctCount = 0;
  let totalScore = 0;

  Object.entries(answers || {}).forEach(([questionId, userAnswer]) => {
    const q = allQuestions.find(qq => qq.id === parseInt(questionId));
    if (q) {
      const isCorrect = userAnswer === q.answer;
      if (isCorrect) correctCount++;
      totalScore += isCorrect ? (exam.totalScore / ((exam.questions || []).length) || 1) : 0;
    }
  });

  const finalScore = Math.round(totalScore);
  const passed = finalScore >= exam.passingScore;

  // 更新 attempt 记录
  const attempts = data.exam_attempts || [];
  const attemptIndex = attempts.findIndex(a => a.id === attemptId);
  if (attemptIndex !== -1) {
    attempts[attemptIndex] = {
      ...attempts[attemptIndex],
      status: 'completed',
      completedAt: new Date().toISOString(),
      answers: answers || {},
      score: finalScore,
      passed,
      correctCount,
      totalQuestions: (exam.questions || []).length
    };
  }

  writeData(data);
  res.json({ success: true, score: finalScore, passed, correctCount, totalQuestions: (exam.questions || []).length });
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

// ============================================================
// 题库管理 API (酷学院参考设计)
// ============================================================

// GET /api/questions - 获取所有题目（支持搜索和筛选）
app.get('/api/questions', (req, res) => {
  const data = readData();
  let questions = data.questions || [];
  
  // 关键词搜索
  const keyword = req.query.keyword;
  if (keyword) {
    const kw = keyword.toLowerCase();
    questions = questions.filter(q => 
      (q.title || '').toLowerCase().includes(kw) ||
      (q.content || '').toLowerCase().includes(kw) ||
      (q.tags || []).some(t => t.toLowerCase().includes(kw))
    );
  }
  
  // 按题型筛选
  const type = req.query.type;
  if (type && type !== 'all') {
    questions = questions.filter(q => q.type === type);
  }
  
  // 按难度筛选
  const difficulty = req.query.difficulty;
  if (difficulty && difficulty !== 'all') {
    questions = questions.filter(q => q.difficulty === difficulty);
  }
  
  // 分页
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const total = questions.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const paged = questions.slice(start, start + pageSize);
  
  res.json({ success: true, data: paged, total, totalPages, page, pageSize });
});

// GET /api/questions/stats - 题库统计
app.get('/api/questions/stats', (req, res) => {
  const data = readData();
  const questions = data.questions || [];
  const stats = {
    total: questions.length,
    byType: {},
    byDifficulty: {}
  };
  questions.forEach(q => {
    stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;
    stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
  });
  res.json({ success: true, data: stats });
});

// GET /api/questions/:id - 获取单个题目
app.get('/api/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const question = (data.questions || []).find(q => q.id === id);
  if (!question) {
    return res.status(404).json({ success: false, error: '题目不存在' });
  }
  res.json({ success: true, data: question });
});

// POST /api/questions - 添加题目
app.post('/api/questions', (req, res) => {
  const { title, type, difficulty, options, answer, explanation, tags, score } = req.body;
  if (!title || !type) {
    return res.status(400).json({ success: false, error: '题目内容和题型不能为空' });
  }
  const data = readData();
  if (!data.questions) data.questions = [];
  const question = {
    id: Date.now(),
    title: title.trim(),
    type,
    difficulty: difficulty || 'medium',
    options: options || [],
    answer: answer || '',
    explanation: explanation || '',
    tags: tags || [],
    score: score || 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.questions.push(question);
  if (writeData(data)) {
    res.json({ success: true, data: question });
  } else {
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// POST /api/questions/batch - 批量导入题目
app.post('/api/questions/batch', (req, res) => {
  const { questions: batch } = req.body;
  if (!batch || !Array.isArray(batch) || batch.length === 0) {
    return res.status(400).json({ success: false, error: '题目列表不能为空' });
  }
  const data = readData();
  if (!data.questions) data.questions = [];
  let added = 0;
  batch.forEach(q => {
    data.questions.push({
      id: Date.now() + added,
      title: (q.title || '').trim(),
      type: q.type || 'single',
      difficulty: q.difficulty || 'medium',
      options: q.options || [],
      answer: q.answer || '',
      explanation: q.explanation || '',
      tags: q.tags || [],
      score: q.score || 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    added++;
  });
  if (writeData(data)) {
    res.json({ success: true, total: added });
  } else {
    res.status(500).json({ success: false, error: '导入失败' });
  }
});

// PUT /api/questions/:id - 更新题目
app.put('/api/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const questions = data.questions || [];
  const index = questions.findIndex(q => q.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '题目不存在' });
  }
  const updates = req.body;
  delete updates.id;
  delete updates.createdAt;
  updates.updatedAt = new Date().toISOString();
  data.questions[index] = { ...questions[index], ...updates };
  if (writeData(data)) {
    res.json({ success: true, data: data.questions[index] });
  } else {
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// DELETE /api/questions/:id - 删除题目
app.delete('/api/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (!data.questions) {
    return res.status(404).json({ success: false, error: '题目不存在' });
  }
  const index = data.questions.findIndex(q => q.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '题目不存在' });
  }
  data.questions.splice(index, 1);
  // 同时从所有考试中移除该题目
  if (data.exams) {
    data.exams.forEach(exam => {
      if (exam.questions) {
        exam.questions = exam.questions.filter(q => q.questionId !== id);
      }
    });
  }
  if (writeData(data)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// DELETE /api/questions/batch - 批量删除题目
app.delete('/api/questions/batch', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'ID列表不能为空' });
  }
  const data = readData();
  if (!data.questions) {
    return res.status(404).json({ success: false, error: '题库为空' });
  }
  const idSet = new Set(ids);
  data.questions = data.questions.filter(q => !idSet.has(q.id));
  // 同时从所有考试中移除这些题目
  if (data.exams) {
    data.exams.forEach(exam => {
      if (exam.questions) {
        exam.questions = exam.questions.filter(q => !idSet.has(q.questionId));
      }
    });
  }
  if (writeData(data)) {
    res.json({ success: true, deleted: ids.length });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

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

// GET /api/notices - 获取所有公告
app.get('/api/notices', (req, res) => {
  const data = readData();
  res.json(data.notices || []);
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
        status: 'enabled',
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
    const statusText = req.body.status === 'approved' ? '已通过' : '已拒绝';
    
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
        title: '讲师申请结果通知',
        content: `您的讲师申请${statusText}，请查看。`,
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
      
      notifications.push({
        id: 'notice_' + notice.id,  // 前缀避免ID冲突
        originalId: notice.id,
        title: notice.title,
        content: notice.content,
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
    n => n.userId === currentUser.id
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
  
  const { ids } = req.body;  // ['notice_123', 'notification_456', ...]
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: '无效的ID列表' });
  }
  
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
  res.json({ success: true, count: ids.length });
});

// POST /api/notifications/batch-delete - 批量删除通知（仅限个人通知）
app.post('/api/notifications/batch-delete', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: '无效的ID列表' });
  }
  
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
  res.json({ success: true, count: personalIds.length });
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

