/**
 * 用户认证路由
 * 处理注册、登录、登出、Token 验证等功能
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');

const router = express.Router();

// 数据库路径
const DB_PATH = path.join(__dirname, '../data/academy.db');

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET || 'youyan-academy-secret-key-2026';
const JWT_EXPIRES_IN = '7d';

// 获取数据库连接
function getDb() {
  return new Database(DB_PATH);
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 生成 JWT Token
 */
function generateToken(user) {
  const jti = uuidv4();
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      jti: jti
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  
  return { token, jti };
}

/**
 * 验证 Token 中间件
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 检查 token 是否在黑名单中
    const db = getDb();
    const session = db.prepare(
      'SELECT * FROM user_sessions WHERE token_jti = ? AND is_valid = 0'
    ).get(decoded.jti);
    db.close();
    
    if (session) {
      return res.status(401).json({ error: '令牌已失效' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token 验证失败:', err.message);
    return res.status(403).json({ error: '令牌无效或已过期' });
  }
}

// ============================================================
// 路由处理
// ============================================================

/**
 * POST /api/auth/register - 用户注册
 */
router.post('/register', async (req, res) => {
  const db = getDb();
  
  try {
    const { username, email, password, realName, phone, department } = req.body;
    
    // 验证必填字段
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码为必填项' });
    }
    
    // 检查是否允许注册
    const setting = db.prepare(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'allow_registration'"
    ).get();
    
    if (setting && setting.setting_value === 'false') {
      return res.status(403).json({ error: '当前不允许注册' });
    }
    
    // 检查用户名是否已存在
    const existingUser = db.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).get(username, email);
    
    if (existingUser) {
      return res.status(409).json({ error: '用户名或邮箱已被使用' });
    }
    
    // 密码加密
    const passwordHash = await bcrypt.hash(password, 10);
    
    // 插入新用户
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, real_name, phone, department, role)
      VALUES (?, ?, ?, ?, ?, ?, 'student')
    `).run(username, email || null, passwordHash, realName || null, phone || null, department || null);
    
    // 获取新用户信息
    const newUser = db.prepare(
      'SELECT id, username, email, real_name, avatar, department, role, points, credits, created_at FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);
    
    // 记录登录
    db.prepare(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(result.lastInsertRowid);
    
    db.close();
    
    // 生成 Token
    const { token, jti } = generateToken(newUser);
    
    // 保存会话
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 天后过期
    db.prepare(`
      INSERT INTO user_sessions (user_id, token_jti, expires_at)
      VALUES (?, ?, ?)
    `).run(newUser.id, jti, expiresAt);
    
    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: newUser,
        token
      }
    });
    
  } catch (err) {
    console.error('注册失败:', err.message);
    db.close();
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

/**
 * POST /api/auth/login - 用户登录
 */
router.post('/login', async (req, res) => {
  const db = getDb();
  
  try {
    const { username, password } = req.body;
    
    // 验证必填字段
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码为必填项' });
    }
    
    // 查找用户（支持用户名、邮箱、手机号登录）
    const user = db.prepare(`
      SELECT id, username, email, real_name, avatar, department, role, password_hash, status
      FROM users
      WHERE username = ? OR email = ? OR phone = ?
    `).get(username, username, username);
    
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 检查账户状态
    if (user.status !== 'active') {
      return res.status(403).json({ error: '账户已被禁用' });
    }
    
    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 更新最后登录时间
    db.prepare(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(user.id);
    
    // 准备返回的用户数据（不包含密码）
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      real_name: user.real_name,
      avatar: user.avatar,
      department: user.department,
      role: user.role
    };
    
    db.close();
    
    // 生成 Token
    const { token, jti } = generateToken(userData);
    
    // 保存会话
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    db.prepare(`
      INSERT INTO user_sessions (user_id, token_jti, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, jti, expiresAt);
    
    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: userData,
        token
      }
    });
    
  } catch (err) {
    console.error('登录失败:', err.message);
    db.close();
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

/**
 * POST /api/auth/logout - 用户登出
 */
router.post('/logout', authenticateToken, (req, res) => {
  const db = getDb();
  
  try {
    // 将 token 加入黑名单
    db.prepare(`
      UPDATE user_sessions
      SET is_valid = 0
      WHERE token_jti = ?
    `).run(req.user.jti);
    
    db.close();
    
    res.json({
      success: true,
      message: '登出成功'
    });
    
  } catch (err) {
    console.error('登出失败:', err.message);
    db.close();
    res.status(500).json({ error: '登出失败' });
  }
});

/**
 * GET /api/auth/me - 获取当前用户信息
 */
router.get('/me', authenticateToken, (req, res) => {
  const db = getDb();
  
  try {
    const user = db.prepare(`
      SELECT id, username, email, real_name, avatar, department, position, role, 
             points, credits, last_login_at, created_at
      FROM users
      WHERE id = ?
    `).get(req.user.userId);
    
    if (!user) {
      db.close();
      return res.status(404).json({ error: '用户不存在' });
    }
    
    db.close();
    
    res.json({
      success: true,
      data: user
    });
    
  } catch (err) {
    console.error('获取用户信息失败:', err.message);
    db.close();
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

/**
 * PUT /api/auth/profile - 更新用户资料
 */
router.put('/profile', authenticateToken, (req, res) => {
  const db = getDb();
  
  try {
    const { realName, avatar, phone, department, position } = req.body;
    
    db.prepare(`
      UPDATE users
      SET real_name = ?, avatar = ?, phone = ?, department = ?, position = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(realName || null, avatar || null, phone || null, department || null, position || null, req.user.userId);
    
    const updatedUser = db.prepare(`
      SELECT id, username, email, real_name, avatar, department, position, role, points, credits
      FROM users
      WHERE id = ?
    `).get(req.user.userId);
    
    db.close();
    
    res.json({
      success: true,
      message: '资料更新成功',
      data: updatedUser
    });
    
  } catch (err) {
    console.error('更新资料失败:', err.message);
    db.close();
    res.status(500).json({ error: '更新资料失败' });
  }
});

/**
 * PUT /api/auth/password - 修改密码
 */
router.put('/password', authenticateToken, async (req, res) => {
  const db = getDb();
  
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请提供旧密码和新密码' });
    }
    
    // 获取当前用户
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.userId);
    
    // 验证旧密码
    const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
    
    if (!validPassword) {
      db.close();
      return res.status(401).json({ error: '旧密码错误' });
    }
    
    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // 更新密码
    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPasswordHash, req.user.userId);
    
    // 使所有现有 token 失效（安全考虑）
    db.prepare(`
      UPDATE user_sessions
      SET is_valid = 0
      WHERE user_id = ?
    `).run(req.user.userId);
    
    db.close();
    
    res.json({
      success: true,
      message: '密码修改成功，请重新登录'
    });
    
  } catch (err) {
    console.error('修改密码失败:', err.message);
    db.close();
    res.status(500).json({ error: '修改密码失败' });
  }
});

module.exports = {
  router,
  authenticateToken
};
