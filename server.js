const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
// 端口支持环境变量（Railway 等平台通过 PORT 注入；本地默认 3003）
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;

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

// ============================================================
// 级联删除工具函数
// ============================================================

/**
 * 安全删除上传文件
 * @param {string} url - /uploads/{type}/{filename} 格式的路径
 * @param {string} context - 用于日志标注删除上下文
 */
function tryDeleteUploadFile(url, context) {
  if (!url || typeof url !== 'string') return;
  // 忽略外链和 data URI
  if (url.startsWith('http') || url.startsWith('data:')) return;
  const match = url.match(/^\/uploads\/([^/]+)\/(.+)$/);
  if (!match) return;
  const [, type, filename] = match;
  const filePath = path.join(uploadsDir, type, filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[文件已删除][${context}] ${filePath}`);
    }
  } catch (err) {
    console.warn(`[文件删除失败][${context}] ${filePath}: ${err.message}`);
  }
}

/**
 * 从实体对象中提取指定字段的本地文件 URL
 * @param {Object} entity - 数据实体
 * @param {Array<string>} fields - 字段名列表，支持字符串字段、数组字段（取 url 或 value）、对象数组（取 url）
 */
function collectFilesFromEntity(entity, fields) {
  const urls = [];
  if (!entity || typeof entity !== 'object') return urls;
  fields.forEach(field => {
    const val = entity[field];
    if (!val) return;
    if (typeof val === 'string') {
      urls.push(val);
    } else if (Array.isArray(val)) {
      val.forEach(item => {
        if (typeof item === 'string') {
          urls.push(item);
        } else if (item && typeof item === 'object') {
          if (typeof item.url === 'string') urls.push(item.url);
          if (typeof item.value === 'string') urls.push(item.value);
        }
      });
    }
  });
  return urls.filter(url => typeof url === 'string' && url.startsWith('/uploads/'));
}

/**
 * 从富文本 HTML 中提取 /uploads/ 图片路径
 * @param {string} html
 */
function collectUrlsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const regex = /src=["'](\/uploads\/[^"']+)["']/g;
  const urls = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

/**
 * 递归收集题目中的图片（题干、选项等）
 * @param {Object} question
 */
function collectQuestionFiles(question) {
  const urls = [];
  if (!question || typeof question !== 'object') return urls;
  if (typeof question.image === 'string' && question.image.startsWith('/uploads/')) {
    urls.push(question.image);
  }
  if (question.optionImages && typeof question.optionImages === 'object') {
    Object.values(question.optionImages).forEach(url => {
      if (typeof url === 'string' && url.startsWith('/uploads/')) urls.push(url);
    });
  }
  if (Array.isArray(question.options)) {
    question.options.forEach(opt => {
      if (opt && typeof opt.image === 'string' && opt.image.startsWith('/uploads/')) {
        urls.push(opt.image);
      }
    });
  }
  return urls;
}

/**
 * 清理匹配前缀的动态键
 * @param {Object} data - data.json 根对象
 * @param {Array<string|RegExp>} patterns - 前缀字符串或正则
 */
function cleanupDynamicKeysByPatterns(data, patterns) {
  Object.keys(data).forEach(key => {
    const matched = patterns.some(pattern => {
      if (typeof pattern === 'string') return key.startsWith(pattern);
      return pattern.test(key);
    });
    if (matched) {
      delete data[key];
    }
  });
}

/**
 * 删除考试相关文件（题目图片）
 * @param {Object} exam
 */
function deleteExamFiles(exam) {
  if (!exam) return;
  (exam.questions || []).forEach(q => {
    collectQuestionFiles(q).forEach(url => tryDeleteUploadFile(url, `exam:${exam.id}`));
  });
}

/**
 * 删除调研相关文件（题目图片）
 * @param {Object} survey
 */
function deleteSurveyFiles(survey) {
  if (!survey) return;
  (survey.questions || []).forEach(q => {
    collectQuestionFiles(q).forEach(url => tryDeleteUploadFile(url, `survey:${survey.id}`));
  });
}

/**
 * 删除题库/试卷相关文件
 * @param {Object} bankOrPaper
 */
function deleteQuestionBankFiles(bankOrPaper) {
  if (!bankOrPaper) return;
  (bankOrPaper.questions || []).forEach(q => {
    collectQuestionFiles(q).forEach(url => tryDeleteUploadFile(url, `bank/paper:${bankOrPaper.id}`));
  });
}

/**
 * 清理用户关联数据（用于删除用户和重置学习数据）
 * @param {Object} data - data.json 根对象
 * @param {string} uid - 用户 ID（字符串）
 * @param {boolean} removeAvatar - 是否删除头像文件
 */
function cleanupUserRelatedData(data, uid, removeAvatar = false) {
  // 1. 清空用户学习主记录
  const learningKey1 = `user_learning_${uid}`;
  const learningKey2 = `learning_data_${uid}`;
  if (data[learningKey1] !== undefined) delete data[learningKey1];
  if (data[learningKey2] !== undefined) delete data[learningKey2];

  // 2. 清空考试记录
  if (data.exam_attempts) {
    data.exam_attempts = data.exam_attempts.filter(a => String(a.userId) !== uid);
  }

  // 3. 清空培训报名、签到与指派历史
  if (data.training_enrollments) {
    data.training_enrollments = data.training_enrollments.filter(e => String(e.userId) !== uid);
  }
  if (data.training_signins) {
    data.training_signins = data.training_signins.filter(s => String(s.userId) !== uid);
  }
  if (data.training_assign_history) {
    data.training_assign_history.forEach(h => {
      if (Array.isArray(h.userIds)) {
        h.userIds = h.userIds.filter(id => String(id) !== uid);
      }
    });
    data.training_assign_history = data.training_assign_history.filter(
      h => Array.isArray(h.userIds) && h.userIds.length > 0
    );
  }

  // 4. 清空调研答卷记录
  if (data.survey_responses) {
    data.survey_responses = data.survey_responses.filter(r => String(r.userId) !== uid);
  }

  // 5. 清空证书相关记录（兼容旧数据）
  if (data.certificates) {
    data.certificates = data.certificates.filter(c => String(c.userId) !== uid);
  }
  if (data.user_certificates) {
    data.user_certificates = data.user_certificates.filter(c => String(c.userId) !== uid);
  }
  if (data.certificateRecords) {
    data.certificateRecords = data.certificateRecords.filter(r => String(r.userId) !== uid);
  }

  // 6. 清空课程评分
  if (data.course_ratings) {
    data.course_ratings = data.course_ratings.filter(r => String(r.userId) !== uid);
  }

  // 7. 清理课程互动（点赞/评分/分享）并重新计算聚合
  Object.keys(data).forEach(key => {
    if (!key.startsWith('course_interaction_')) return;
    const interaction = data[key];
    if (!interaction || typeof interaction !== 'object') return;
    const courseIdStr = key.replace('course_interaction_', '');
    const courseIdNum = Number(courseIdStr);
    let changed = false;

    ['userLikes', 'userRatings', 'userShares'].forEach(prop => {
      const map = interaction[prop];
      if (map && typeof map === 'object' && map[uid] !== undefined) {
        delete map[uid];
        changed = true;
      }
    });

    if (!changed) return;

    const likes = Object.keys(interaction.userLikes || {}).length;
    const shares = Object.values(interaction.userShares || {}).reduce(
      (s, v) => s + (Number(v) || 0), 0
    );
    const ratingEntries = Object.entries(interaction.userRatings || {});
    const ratingCount = ratingEntries.length;
    const ratingSum = ratingEntries.reduce((s, [, v]) => s + (Number(v) || 0), 0);

    interaction.likes = likes;
    interaction.shares = shares;
    interaction.ratingCount = ratingCount;
    interaction.ratingSum = ratingSum;

    if (likes === 0 && shares === 0 && ratingCount === 0) {
      delete data[key];
    }

    const course = (data.management_courses || []).find(c => c.id === courseIdNum);
    if (course) {
      course.rating = getCourseAvgRating(data, courseIdNum) ?? 0;
      course.likes = likes;
      course.shares = shares;
    }
  });

  // 8. 清空登录日志
  if (data.login_logs) {
    data.login_logs = data.login_logs.filter(l => String(l.userId) !== uid);
  }

  // 9. 清空个人通知
  if (data.notifications) {
    data.notifications = data.notifications.filter(n => String(n.userId) !== uid);
  }

  // 10. 清空公告访问记录与通知已读记录
  if (data.notice_visits) {
    data.notice_visits = data.notice_visits.filter(v => String(v.userId) !== uid);
  }
  if (data.notification_reads) {
    data.notification_reads = data.notification_reads.filter(r => String(r.userId) !== uid);
  }

  // 11. 清空经验值、点赞、分享、评分汇总等动态用户键
  const dynamicUserKeys = [
    `user_total_exp_v3_${uid}`,
    `user_likes_${uid}`,
    `user_shares_${uid}`,
    `user_ratings_${uid}`
  ];
  dynamicUserKeys.forEach(key => {
    if (data[key] !== undefined) delete data[key];
  });

  // 12. 清空学习会话、视频位置、课程笔记等通配动态键
  Object.keys(data).forEach(key => {
    if (
      key.startsWith(`study_session_${uid}_`) ||
      key.startsWith(`video_pos_${uid}_`) ||
      key.startsWith(`note_${uid}_`)
    ) {
      delete data[key];
    }
  });

  // 13. 删除头像文件
  if (removeAvatar && data.registered_users) {
    const user = data.registered_users.find(u => String(u.id) === uid);
    if (user && user.avatar) {
      tryDeleteUploadFile(user.avatar, `user:${uid}`);
    }
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

// ============================================================
// 证书管理数据初始化与辅助函数
// ============================================================
function initCertificateData() {
  const data = readData();
  let changed = false;

  if (!data.certificates) {
    data.certificates = [];
    changed = true;
  }
  if (!data.user_certificates) {
    data.user_certificates = [];
    changed = true;
  }
  // 证书模板说明：
  // 旧版（4 个 CSS 渐变模板：tpl-honor-purple / tpl-completion-gold / tpl-excellent-green / tpl-skill-purple）已废弃。
  // 当前体系为 12 套真实 PNG 模板（v1-v6 竖版 + h1-h6 横版），定义在前端 CERT_TEMPLATES。
  // 端点 GET /api/certificates/templates 改为从 uploads/cert-templates 目录动态生成基本信息。
  if (!data.certificate_templates) {
    data.certificate_templates = [];
    changed = true;
  }

  if (changed) {
    writeData(data);
    console.log('  证书管理数据集合已初始化');
  } else {
    console.log('  证书管理数据集合已存在');
  }
}

function padNumber(num, digits) {
  return String(num).padStart(digits, '0');
}

function generateNextCertNo(data, certificate) {
  const issued = (data.user_certificates || []).filter(uc => String(uc.certificateId) === String(certificate.id));
  const maxNum = issued.reduce((max, uc) => {
    const match = uc.certNo.match(new RegExp(`^${certificate.prefix}(\\d+)$`));
    if (match) {
      const n = parseInt(match[1], 10);
      return n > max ? n : max;
    }
    return max;
  }, certificate.startNumber - 1);
  return certificate.prefix + padNumber(maxNum + 1, certificate.digits);
}

async function issueCertificateInternal(data, certificateId, userId, sourceType, sourceId) {
  if (!data.certificates) data.certificates = [];
  if (!data.user_certificates) data.user_certificates = [];

  const certificate = data.certificates.find(c => String(c.id) === String(certificateId));
  if (!certificate) return { success: false, error: '证书定义不存在' };
  if (certificate.status !== 'enabled') return { success: false, error: '证书已停用' };

  const existing = data.user_certificates.find(uc =>
    String(uc.certificateId) === String(certificateId) &&
    String(uc.userId) === String(userId) &&
    uc.status === 'active'
  );
  if (existing) return { success: false, error: '该用户已持有有效证书实例' };

  const now = new Date().toISOString();
  let expireAt = null;
  if (certificate.validityType === 'fixed' && certificate.validityDays) {
    expireAt = new Date(Date.now() + certificate.validityDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const certNo = generateNextCertNo(data, certificate);
  const userCert = {
    id: 'uc-' + Date.now() + '-' + Math.round(Math.random() * 1e9),
    certificateId: String(certificateId),
    userId: String(userId),
    certNo,
    company: certificate.company || DEFAULT_CERT_COMPANY,
    sourceType: sourceType || 'manual',
    sourceId: sourceId || null,
    issueAt: now,
    effectiveAt: now,
    expireAt,
    status: 'active',
    revokedAt: null,
    revokeReason: null
  };
  data.user_certificates.push(userCert);

  // 注意：证书 PNG 不再由服务端生成（已移除 Playwright）。
  // 学员端 / 消息端在浏览器内用 html-to-image 渲染并展示；若 userCert.imageUrl 已存在（历史文件）则优先复用。
  return { success: true, data: userCert };
}

// ============================================================
// 证书图片服务端生成
// ============================================================

const CERT_IMAGE_DIR = path.join(uploadsDir, 'certificates');
if (!fs.existsSync(CERT_IMAGE_DIR)) {
  fs.mkdirSync(CERT_IMAGE_DIR, { recursive: true });
}

// 证书 PNG 仅做「已生成文件」读取：实际渲染由前端 html-to-image 在浏览器内完成（无 Playwright 依赖）。
// 学员端 / 消息端在展示证书时，若 imageUrl 为空会自动用前端渲染生成，确保跨环境字体/版式一致，
// 也彻底消除了服务端无头 Chromium 在 Linux(Railway) 上字体缺失、卡死的问题。
function getCertificateImagePath(userCertId) {
  return path.join(CERT_IMAGE_DIR, `${userCertId}.png`);
}

async function ensureCertificateImage(data, userCert) {
  // 仅当图片文件真实存在于磁盘时才返回 URL；否则返回 null，由前端渲染一次后回传落盘。
  // 这杜绝了"只伪造 URL 不落盘"导致的每次打开都重新渲染的性能问题。
  if (userCert.imageUrl) {
    const p = path.join(uploadsDir, userCert.imageUrl.replace(/^\/uploads\//, ''));
    if (fs.existsSync(p)) return userCert.imageUrl;
  }
  const stdPath = getCertificateImagePath(userCert.id);
  if (fs.existsSync(stdPath)) {
    return `/uploads/certificates/${userCert.id}.png`;
  }
  return null;
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

// 计算培训事件关联问卷的平均评分
function getTrainingSurveyAverage(data, trainingId) {
  const event = (data.training_events || []).find(e => e.id === trainingId);
  if (!event || !event.linkedSurveyId) return null;

  const responses = (data.survey_responses || []).filter(
    r => r.surveyId === event.linkedSurveyId && r.trainingId == trainingId
  );

  let sum = 0;
  let count = 0;
  responses.forEach(r => {
    const answers = r.answers;
    if (Array.isArray(answers)) {
      answers.forEach(a => {
        if (a.type === 'rating' && typeof a.value === 'number') {
          sum += a.value;
          count++;
        }
      });
    } else if (answers && typeof answers === 'object') {
      Object.values(answers).forEach(v => {
        if (typeof v === 'number') {
          sum += v;
          count++;
        }
      });
    }
  });

  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

function getLecturerTotalPayment(data, lecturer) {
  return (data.lecturer_payment_records || [])
    .filter(r => String(r.lecturerId) === String(lecturer.id))
    .reduce((s, r) => s + (Number(r.bonus) || 0), 0);
}

function calcYearsAsInstructor(startTeachingDate) {
  if (!startTeachingDate) return null;
  const start = new Date(startTeachingDate);
  if (isNaN(start)) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const m = now.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < start.getDate())) years--;
  return years >= 0 ? years : 0;
}

// 计算课程互动与学习统计（用于报表）
function getCourseReportStats(data, courseId) {
  const interactionKey = 'course_interaction_' + courseId;
  const interaction = data[interactionKey] || {};

  let learners = 0;
  let finishers = 0;
  const prefix = courseId + '_';
  Object.keys(data).forEach(key => {
    if (!key.startsWith('user_learning_') && !key.startsWith('learning_data_')) return;
    const record = data[key];
    if (!record || typeof record !== 'object') return;
    const progress = record.videoProgress || {};
    const completed = record.completedCourses || [];
    if (Object.keys(progress).some(k => String(k).startsWith(prefix))) learners++;
    if (completed.some(id => String(id) === String(courseId))) finishers++;
  });

  return {
    likes: interaction.likes || 0,
    shares: interaction.shares || 0,
    learners,
    finishers
  };
}

// 获取某课程的学员学习明细（用于课程报表弹窗）
function getCourseLearnerDetails(data, course) {
  const cid = String(course.id);
  const users = data.registered_users || [];
  const prefix = cid + '_';
  const courseVideos = course.videos || [];

  return users.map(u => {
    const uid = String(u.id);
    const record = data['user_learning_' + uid] || data['learning_data_' + uid] || {};
    const progress = record.videoProgress || {};
    const completedCourses = record.completedCourses || [];
    const studyRecords = record.studyRecords || [];

    const courseProgressKeys = Object.keys(progress).filter(k => String(k).startsWith(prefix));
    const hasProgress = courseProgressKeys.length > 0;
    const manuallyCompleted = completedCourses.some(id => String(id) === cid);

    // 期望的视频进度键：以课程 videos 数组为准；若无 videos 则使用已有的进度键
    const expectedKeys = courseVideos.length > 0
      ? courseVideos.map((_, idx) => `${cid}_${idx}`)
      : courseProgressKeys;
    const allVideosFinished = expectedKeys.length > 0 && expectedKeys.every(k => Number(progress[k]) === 100);
    const isCompleted = manuallyCompleted || allVideosFinished;

    if (!hasProgress && !isCompleted) return null;

    // 学习时长：按该课程的 studyRecords duration 累加（秒 -> 小时）
    const courseStudyRecords = studyRecords.filter(r => String(r.courseId) === cid);
    const totalSeconds = courseStudyRecords.reduce((s, r) => s + (Number(r.duration) || 0), 0);
    const hours = +(totalSeconds / 3600).toFixed(1);

    // 首次学习时间
    const firstStudyTime = courseStudyRecords.length
      ? new Date(Math.min(...courseStudyRecords.map(r => new Date(r.timestamp).getTime()))).toLocaleString('zh-CN')
      : '-';

    // 首次完成学习时间：取该课程 studyRecords 中对应视频进度达到 100% 的最早记录
    let firstCompleteTime = '-';
    if (isCompleted) {
      const completeRecords = courseStudyRecords.filter(r => {
        const key = `${cid}_${r.videoIndex}`;
        return Number(progress[key]) === 100;
      });
      if (completeRecords.length) {
        firstCompleteTime = new Date(Math.min(...completeRecords.map(r => new Date(r.timestamp).getTime()))).toLocaleString('zh-CN');
      } else if (manuallyCompleted) {
        firstCompleteTime = '已完成（无明细时间）';
      }
    }

    // 学习进度：该课程所有视频的平均进度
    const avgProgress = expectedKeys.length
      ? Math.round(expectedKeys.reduce((s, k) => s + (Number(progress[k]) || 0), 0) / expectedKeys.length)
      : (isCompleted ? 100 : 0);

    return {
      userId: uid,
      realName: u.realName || u.username || '-',
      department: u.department || '-',
      position: u.position || '-',
      hours,
      status: isCompleted ? '已完成' : '学习中',
      firstStudyTime,
      firstCompleteTime,
      progress: avgProgress
    };
  }).filter(Boolean);
}

// 同步培训的 allowedUsers 到报名记录和指派历史（创建/编辑培训时自动调用）
function syncTrainingAllowedUsers(data, trainingId, allowedUsers) {
  if (!Array.isArray(allowedUsers) || allowedUsers.length === 0) return [];
  if (!data.training_enrollments) data.training_enrollments = [];
  if (!data.training_assign_history) data.training_assign_history = [];

  const newUserIds = [];
  allowedUsers.forEach(uid => {
    const numericUid = Number(uid) || uid;
    const existing = data.training_enrollments.find(e => e.trainingId === trainingId && e.userId === numericUid);
    if (!existing) {
      data.training_enrollments.push({
        id: Date.now() + newUserIds.length,
        trainingId,
        userId: numericUid,
        enrolledAt: new Date().toISOString(),
        source: 'assigned'
      });
      newUserIds.push(numericUid);
    }
  });

  if (newUserIds.length > 0) {
    data.training_assign_history.push({
      id: Date.now(),
      trainingId,
      userIds: newUserIds,
      assignedAt: new Date().toISOString()
    });
  }

  return newUserIds;
}

// 计算培训报表统计
function getTrainingReportStats(data, event) {
  const trainingId = event.id;
  const enrollments = (data.training_enrollments || []).filter(e => e.trainingId === trainingId);
  const signins = (data.training_signins || []).filter(s => s.trainingId === trainingId);
  const assigns = (data.training_assign_history || []).filter(a => a.trainingId === trainingId);

  // 任务指派人数：以 allowedUsers（创建/编辑培训时指派的人员）为基准，并与历史指派去重
  const assignedUserIds = new Set((event.allowedUsers || []).map(uid => String(uid)));

  // 主动报名人数：员工在培训页面点击报名（source === 'self'）
  const activeEnrollUserIds = new Set(enrollments.filter(e => e.source === 'self').map(e => String(e.userId)));
  const activeEnrollCount = activeEnrollUserIds.size;

  // 兼容旧数据：training_assign_history 中的人员也计入指派
  assigns.forEach(a => {
    if (Array.isArray(a.userIds)) {
      a.userIds.forEach(uid => assignedUserIds.add(String(uid)));
    }
  });

  // 总人数：主动报名 + 任务指派 去重
  const totalUserIds = new Set(activeEnrollUserIds);
  assignedUserIds.forEach(uid => totalUserIds.add(uid));
  // 兼容旧数据：source 缺失或 source === 'assigned' 的报名记录也计入总人数
  enrollments.forEach(e => {
    totalUserIds.add(String(e.userId));
    if (e.source !== 'self') {
      assignedUserIds.add(String(e.userId));
    }
  });
  const assignCount = assignedUserIds.size;
  const totalCount = totalUserIds.size;

  // 完成培训人数：已签到用户去重（作为培训内容完成的代理指标）
  const completeUserIds = new Set(signins.map(s => String(s.userId)));
  const completeCount = completeUserIds.size;

  // 培训完成率 = 完成人数 / 总人数
  const completionRate = totalCount > 0
    ? Math.min(100, Math.round((completeCount / totalCount) * 100))
    : 0;

  // 旧数据可能没有 createdAt，使用 id（时间戳）推导创建时间
  let createdAt = event.createdAt;
  if (!createdAt && trainingId) {
    const date = new Date(Number(trainingId));
    if (!isNaN(date)) createdAt = date.toLocaleString('zh-CN');
  }

  return { createdAt, totalCount, activeEnrollCount, assignCount, completeCount, completionRate };
}

// 构建培训数据分析总览
function buildTrainingOverview(data, trainingId) {
  const event = (data.training_events || []).find(e => e.id === trainingId);
  const examId = event?.linkedExamId || null;
  const users = data.registered_users || [];
  const enrollments = (data.training_enrollments || []).filter(e => e.trainingId === trainingId);
  const signins = (data.training_signins || []).filter(s => s.trainingId === trainingId);
  const surveyResponses = (data.survey_responses || []).filter(r => r.trainingId === trainingId);
  const examAttempts = (data.exam_attempts || []).filter(a => a.examId === examId);

  const signinEnabled = !!event?.signinEnabled;
  const surveyEnabled = !!event?.surveyEnabled;
  const examEnabled = !!event?.examEnabled && !!event?.linkedExamId;
  const coursewareEnabled = !!event?.coursewareEnabled && !!(event?.coursewareFiles?.length);

  // 关联用户：主动报名 + 任务指派（allowedUsers + assign_history） 去重
  const userIdSet = new Set();
  enrollments.forEach(e => userIdSet.add(String(e.userId)));
  (event?.allowedUsers || []).forEach(uid => userIdSet.add(String(uid)));
  (data.training_assign_history || [])
    .filter(a => a.trainingId === trainingId)
    .forEach(a => {
      if (Array.isArray(a.userIds)) {
        a.userIds.forEach(uid => userIdSet.add(String(uid)));
      }
    });

  const userList = Array.from(userIdSet).map(uid => {
    const u = users.find(user => String(user.id) === uid);
    const enrollment = enrollments.find(e => String(e.userId) === uid);
    const userName = u ? (u.realName || u.username || '未知用户') : '未知用户';

    let source = 'not-enrolled';
    if (enrollment) {
      source = enrollment.source === 'self' ? 'self' : (enrollment.source === 'assigned' ? 'assigned' : 'self');
    } else if ((event?.allowedUsers || []).some(id => String(id) === uid) ||
               (data.training_assign_history || []).some(a => a.trainingId === trainingId && Array.isArray(a.userIds) && a.userIds.some(id => String(id) === uid))) {
      source = 'assigned';
    }

    const signed = signins.some(s => String(s.userId) === uid);
    const surveyed = surveyResponses.some(r => String(r.userId) === uid);
    const userExamAttempts = examAttempts.filter(a => String(a.userId) === uid && a.examId === examId);
    const completedExamAttempts = userExamAttempts.filter(a => a.status === 'completed' && a.score !== null);
    const latestExam = completedExamAttempts.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))[0] || null;

    const signinPct = signinEnabled ? (signed ? 100 : 0) : null;
    const surveyPct = surveyEnabled ? (surveyed ? 100 : 0) : null;
    let examPct = null;
    if (examEnabled) {
      if (latestExam) {
        examPct = latestExam.passed ? 100 : 0;
      } else {
        examPct = null;
      }
    }

    // 完成率：按启用模块加权平均
    const enabledItems = [];
    if (signinEnabled) enabledItems.push(signinPct ?? 0);
    if (surveyEnabled) enabledItems.push(surveyPct ?? 0);
    if (examEnabled) enabledItems.push(examPct === null ? 0 : examPct);
    const completionRate = enabledItems.length > 0
      ? Math.round(enabledItems.reduce((s, v) => s + v, 0) / enabledItems.length)
      : 0;

    return {
      userId: u ? u.id : uid,
      userName,
      avatar: u?.avatar || '',
      department: u?.department || '-',
      position: u?.position || '-',
      source,
      signinPct,
      surveyPct,
      examPct,
      completionRate,
      examScore: latestExam ? latestExam.score : null,
      examPassed: latestExam ? latestExam.passed : false
    };
  });

  const total = userList.length;
  const avgCompletionRate = total > 0
    ? Math.round(userList.reduce((s, u) => s + u.completionRate, 0) / total)
    : 0;
  const signinRate = (signinEnabled && total > 0)
    ? Math.round(userList.filter(u => u.signinPct === 100).length / total * 100)
    : 0;
  const surveyRate = (surveyEnabled && total > 0)
    ? Math.round(userList.filter(u => u.surveyPct === 100).length / total * 100)
    : 0;

  let examPassRate = 0;
  if (examEnabled) {
    const examParticipants = userList.filter(u => u.examScore !== null);
    examPassRate = examParticipants.length > 0
      ? Math.round(examParticipants.filter(u => u.examPassed).length / examParticipants.length * 100)
      : 0;
  }

  return {
    summary: {
      total,
      avgCompletionRate,
      signinRate,
      surveyRate,
      examPassRate,
      signinEnabled,
      surveyEnabled,
      examEnabled,
      coursewareEnabled
    },
    users: userList,
    training: event || {}
  };
}

// 等级配置（与 center.html 保持一致）
const LEVEL_CONFIG = [
  { level: 1, name: '新手学员', expRequired: 0 },
  { level: 2, name: '初级学员', expRequired: 100 },
  { level: 3, name: '中级学员', expRequired: 300 },
  { level: 4, name: '高级学员', expRequired: 600 },
  { level: 5, name: '学习达人', expRequired: 1000 },
  { level: 6, name: '探究达人', expRequired: 1500 },
  { level: 7, name: '博学达人', expRequired: 2200 },
  { level: 8, name: '学术先锋', expRequired: 3000 },
  { level: 9, name: '研究学者', expRequired: 4000 },
  { level: 10, name: '资深学者', expRequired: 5500 },
  { level: 11, name: '卓越学者', expRequired: 7500 },
  { level: 12, name: '学术宗师', expRequired: 9999 }
];

function getLevelName(totalExp) {
  const info = getLevelInfo(totalExp);
  return info.name;
}

function getLevelInfo(totalExp) {
  let current = LEVEL_CONFIG[0];
  for (let i = 0; i < LEVEL_CONFIG.length; i++) {
    if (totalExp >= LEVEL_CONFIG[i].expRequired) {
      current = LEVEL_CONFIG[i];
    } else {
      break;
    }
  }
  return current;
}

// 计算连续学习天数（基于 studyRecords/studyDates 的日期去重后连续天数）
function calculateStreakDays(record) {
  const records = Array.isArray(record.studyRecords) ? record.studyRecords : [];
  const dates = new Set();
  records.forEach(r => {
    if (r && r.timestamp) {
      const d = new Date(r.timestamp);
      if (!isNaN(d)) {
        dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
    }
  });
  if (record.studyDates) {
    record.studyDates.forEach(d => {
      if (d) {
        const s = String(d).split(' ')[0].split('T')[0];
        if (s) dates.add(s);
      }
    });
  }
  const sorted = [...dates].sort();
  if (sorted.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const cur = new Date(sorted[i] + 'T00:00:00');
    const diff = (cur - prev) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else if (diff > 1) {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

// 基于服务端可获取数据计算当前满足条件的徽章数量（与 center.html 逻辑对齐）
function calculateBadgeCount(data, uid, stats) {
  const record = stats.record || {};
  const records = Array.isArray(record.studyRecords) ? record.studyRecords : [];

  const nightStudy = records.some(r => {
    if (!r || !r.timestamp) return false;
    const h = new Date(r.timestamp).getHours();
    return h >= 22;
  });
  const earlyStudy = records.some(r => {
    if (!r || !r.timestamp) return false;
    const h = new Date(r.timestamp).getHours();
    return h <= 6;
  });
  const weekendStudy = records.some(r => {
    if (!r || !r.timestamp) return false;
    const day = new Date(r.timestamp).getDay();
    return day === 0 || day === 6;
  });

  // 从课程互动数据中统计当前用户的点赞/评分/分享课程数
  let likesCount = record.likes || 0;
  let ratingsCount = record.ratings || 0;
  let sharesCount = record.shares || 0;
  Object.keys(data).forEach(key => {
    if (!key.startsWith('course_interaction_')) return;
    const interaction = data[key];
    if (!interaction || typeof interaction !== 'object') return;
    if (interaction.userLikes && interaction.userLikes[uid]) likesCount = Math.max(likesCount, 1);
    if (interaction.userShares && interaction.userShares[uid]) {
      sharesCount = Math.max(sharesCount, Number(interaction.userShares[uid]) || 1);
    }
    if (interaction.userRatings && interaction.userRatings[uid]) ratingsCount = Math.max(ratingsCount, 1);
  });

  const d = {
    hours: stats.totalHours || 0,
    completed: stats.courseCount || 0,
    streak: stats.streakDays || 0,
    days: stats.registerDays || 0,
    nightStudy,
    earlyStudy,
    weekendStudy,
    examCount: stats.examCount || 0,
    examPassed: stats.examPassed || 0,
    perfectScore: stats.perfectScore || false,
    trainingCount: stats.trainingCount || 0,
    certificateCount: stats.certificateCount || 0,
    likes: likesCount,
    ratings: ratingsCount,
    shares: sharesCount
  };

  // 徽章条件列表（与 center.html 的 BADGES 条件一一对应）
  const conditions = [
    d.hours >= 1, d.hours >= 10, d.hours >= 50, d.hours >= 100, d.hours >= 300, d.hours >= 500,
    d.completed >= 1, d.completed >= 5, d.completed >= 10, d.completed >= 20, d.completed >= 30, d.completed >= 50,
    d.streak >= 3, d.streak >= 7, d.streak >= 30, d.streak >= 60, d.streak >= 90, d.streak >= 100,
    d.earlyStudy, d.nightStudy, d.weekendStudy,
    d.examCount >= 1, d.examPassed >= 3, d.perfectScore,
    d.ratings >= 5, d.shares >= 5, d.likes >= 5,
    d.days >= 7, d.days >= 30, d.days >= 100, d.days >= 200, d.days >= 365,
    d.trainingCount >= 1, d.trainingCount >= 5, d.trainingCount >= 10, d.trainingCount >= 20, d.trainingCount >= 30,
    d.certificateCount >= 1, d.certificateCount >= 3, d.certificateCount >= 5, d.certificateCount >= 10, d.certificateCount >= 20
  ];

  return conditions.filter(Boolean).length;
}

// 计算学员报表所需的学习统计数据
function getUserLearningStats(data, userId, userInfo) {
  const uid = String(userId);
  const learningKey1 = 'user_learning_' + uid;
  const learningKey2 = 'learning_data_' + uid;
  const record = data[learningKey1] || data[learningKey2] || {};

  // 课程学习时长（秒 -> 小时，保留1位小数）
  const totalSeconds = Number(record.totalSeconds) || 0;
  const courseHours = +(totalSeconds / 3600).toFixed(1);

  // 培训学习时长：从培训签到记录估算（每次培训按1小时计，实际场景可细化）
  const trainingSignins = (data.training_signins || []).filter(s => String(s.userId) === uid);
  const trainingHours = trainingSignins.length;

  // 总学习时长 = 课程学习时长 + 培训学习时长
  const totalHours = +(courseHours + trainingHours).toFixed(1);

  // 学习课程数：videoProgress 中不同课程 ID 去重
  const progress = record.videoProgress || {};
  const courseIds = new Set();
  Object.keys(progress).forEach(key => {
    const courseId = String(key).split('_')[0];
    if (courseId) courseIds.add(courseId);
  });
  // 合并已完成课程
  (record.completedCourses || []).forEach(id => courseIds.add(String(id)));
  const courseCount = courseIds.size;

  // 参与培训数：报名 + 指派去重
  const trainingIds = new Set();
  (data.training_enrollments || []).forEach(e => {
    if (String(e.userId) === uid) trainingIds.add(String(e.trainingId));
  });
  (data.training_assign_history || []).forEach(a => {
    if (Array.isArray(a.userIds) && a.userIds.some(id => String(id) === uid)) {
      trainingIds.add(String(a.trainingId));
    }
  });
  const trainingCount = trainingIds.size;

  // 获得证书数
  const certificateCount = (data.certificateRecords || []).filter(r => String(r.userId) === uid && r.status === 'active').length;

  // 考试相关统计
  const userExamAttempts = (data.exam_attempts || []).filter(a => String(a.userId) === uid);
  const examCount = userExamAttempts.filter(a => a.status === 'completed' || a.passed === true).length;
  const examPassed = userExamAttempts.filter(a => a.passed === true).length;
  const perfectScore = userExamAttempts.some(a => Number(a.score) === 100);

  // 员工等级
  const expKey = 'user_total_exp_v3_' + uid;
  const totalExp = Number(data[expKey]) || 0;
  const levelInfo = getLevelInfo(totalExp);
  const levelName = levelInfo.name;
  const level = levelInfo.level;

  // 注册天数
  const createdAt = userInfo && userInfo.createdAt ? new Date(userInfo.createdAt) : null;
  const registerDays = createdAt && !isNaN(createdAt) ? Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  // 连续学习天数
  const streakDays = calculateStreakDays(record);

  // 临时统计对象（供徽章计算使用）
  const statsForBadges = {
    record,
    totalHours,
    courseCount,
    trainingCount,
    certificateCount,
    examCount,
    examPassed,
    perfectScore,
    streakDays,
    registerDays
  };
  const badgeCount = calculateBadgeCount(data, uid, statsForBadges);

  return {
    totalHours,
    courseHours,
    trainingHours,
    courseCount,
    trainingCount,
    certificateCount,
    examCount,
    badgeCount,
    level,
    levelName
  };
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
  const courses = (data.management_courses || []).map(c => {
    const reportStats = getCourseReportStats(data, c.id);
    return {
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
      likes: reportStats.likes,
      shares: reportStats.shares,
      learners: reportStats.learners,
      finishers: reportStats.finishers,
      createdAt: c.createdAt || ''
    };
  });
  res.json(courses);
});

// GET /api/courses/:id/learners - 课程学员学习明细（课程报表弹窗）
app.get('/api/courses/:id/learners', (req, res) => {
  const data = readData();
  const courseId = req.params.id;
  const course = (data.management_courses || []).find(c => String(c.id) === String(courseId));
  if (!course) {
    return res.status(404).json({ error: '课程不存在' });
  }
  const learners = getCourseLearnerDetails(data, course);
  res.json({
    courseId,
    courseTitle: course.title || '',
    learners
  });
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
      real_name: user.realName || user.username,
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
  const { username, password, email, phone, realName, department, position } = req.body;
  
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
    position: position || '',
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

  // 记录登录日志，永久保存，用于登录趋势统计
  if (!Array.isArray(data.login_logs)) data.login_logs = [];
  data.login_logs.push({
    userId: String(user.id),
    loginTime: new Date().toISOString()
  });

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
    const stats = getUserLearningStats(data, u.id, u);
    return {
      ...user,
      totalHours: stats.totalHours,
      trainingHours: stats.trainingHours,
      courseHours: stats.courseHours,
      trainingCount: stats.trainingCount,
      courseCount: stats.courseCount,
      certificateCount: stats.certificateCount,
      examCount: stats.examCount,
      badgeCount: stats.badgeCount,
      level: stats.level,
      levelName: stats.levelName
    };
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

  const uid = String(userId);
  // 级联清理用户关联数据与头像文件
  cleanupUserRelatedData(data, uid, true);
  
  // 重新定位用户索引（cleanupUserRelatedData 不会修改 registered_users 顺序，但保险起见）
  const finalIndex = data.registered_users.findIndex(u => u.id === userId);
  if (finalIndex !== -1) {
    data.registered_users.splice(finalIndex, 1);
  }
  
  if (writeData(data)) {
    res.json({ success: true, message: '用户已删除，关联数据已清理' });
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
  const allowedFields = ['realName', 'email', 'phone', 'department', 'position', 'role', 'avatar'];
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

// 管理员 - 重置用户学习数据（清空该用户的所有学习相关记录，相当于新用户）
app.post('/api/auth/users/:id/reset-learning-data', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }

  const token = authHeader.slice(7);
  const currentUser = verifyToken(token);

  if (!currentUser || currentUser.role !== 'admin') {
    return res.status(403).json({ success: false, error: '权限不足' });
  }

  try {
    const userId = String(req.params.id);
    const uid = userId;
    const data = readData();

    // 复用级联清理函数
    cleanupUserRelatedData(data, uid, false);

    // 重置用户账号基础字段（相当于新账号）
    if (data.registered_users) {
      const user = data.registered_users.find(u => String(u.id) === uid);
      if (user) {
        user.createdAt = new Date().toLocaleString('zh-CN');
        user.lastLogin = null;
      }
    }

    if (writeData(data)) {
      res.json({ success: true, message: '用户学习数据已清空' });
    } else {
      res.status(500).json({ success: false, error: '写入失败' });
    }
  } catch (error) {
    console.error('重置用户学习数据失败:', error);
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

// 管理员 - 设置用户角色（支持三角色：user/teacher/admin）
app.put('/api/auth/users/:id/set-role', (req, res) => {
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
  const { role } = req.body;
  
  // 验证角色值
  const validRoles = ['user', 'teacher', 'admin'];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ 
      success: false, 
      error: `无效的角色值，可选值：${validRoles.join('、')}` 
    });
  }
  
  // 不允许修改自己的权限
  if (payload.id === userId) {
    return res.status(400).json({ success: false, error: '不能修改自己的权限' });
  }
  
  const data = readData();
  if (!data.registered_users) data.registered_users = [];
  
  const userIndex = data.registered_users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  
  const oldRole = data.registered_users[userIndex].role;
  const newRole = role;
  
  // 更新角色
  data.registered_users[userIndex].role = newRole;
  
  // 如果设为讲师，确保有讲师相关字段
  if (newRole === 'teacher' && !data.registered_users[userIndex].title) {
    data.registered_users[userIndex].title = '内部讲师';
    data.registered_users[userIndex].level = 'intern';
    data.registered_users[userIndex].levelName = '见习讲师';
  }
  
  if (writeData(data)) {
    const user = { ...data.registered_users[userIndex] };
    delete user.passwordHash;
    
    const roleNames = { user: '学员', teacher: '讲师', admin: '管理员' };
    
    res.json({ 
      success: true, 
      message: `已将用户身份从「${roleNames[oldRole]}」改为「${roleNames[newRole]}」`,
      data: { 
        user,
        oldRole,
        newRole
      } 
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
  const courses = (data.management_courses || []).map(c => {
    const reportStats = getCourseReportStats(data, c.id);
    return {
      ...c,
      rating: getCourseAvgRating(data, c.id) ?? c.rating ?? 0,
      likes: reportStats.likes,
      shares: reportStats.shares,
      learners: reportStats.learners,
      finishers: reportStats.finishers,
      createdBy: c.createdBy || c.creator || '许志坚'
    };
  });
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
  if (!data.management_courses) {
    return res.status(404).json({ success: false, error: '课程列表不存在' });
  }

  const courseIndex = data.management_courses.findIndex(c => c.id === id);
  if (courseIndex === -1) {
    return res.status(404).json({ success: false, error: '课程不存在' });
  }

  // 前置校验：被培训引用时禁止删除
  const inTrainingEvent = (data.training_events || []).some(t => t.linkedCourseId === id);
  const inTrainingProject = (data.training_projects || []).some(p =>
    (p.courses || []).some(c => c.id === id)
  );
  if (inTrainingEvent || inTrainingProject) {
    return res.status(400).json({ success: false, error: '该课程已被培训关联，无法删除' });
  }

  const course = data.management_courses[courseIndex];

  // 删除课程相关文件
  collectFilesFromEntity(course, ['cover']).forEach(url => tryDeleteUploadFile(url, `course:${id}`));
  collectFilesFromEntity(course, ['videos']).forEach(url => tryDeleteUploadFile(url, `course:${id}`));
  collectFilesFromEntity(course, ['attachments']).forEach(url => tryDeleteUploadFile(url, `course:${id}`));

  // 清理关联数据
  if (data.course_ratings) {
    data.course_ratings = data.course_ratings.filter(r => r.courseId !== id);
  }
  if (data.index_featured_courses) {
    data.index_featured_courses = data.index_featured_courses.filter(c => c !== id);
  }
  if (data.index_banners) {
    data.index_banners.forEach(b => {
      if (b.courseId === id) b.courseId = null;
    });
  }
  if (data.my_courses) {
    data.my_courses = data.my_courses.filter(c => c.courseId !== id);
  }

  // 清理动态键
  delete data[`course_interaction_${id}`];
  delete data[`course_stats_${id}`];
  cleanupDynamicKeysByPatterns(data, [new RegExp(`^video_pos_\\d+_${id}_.*$`)]);

  // 清理所有用户学习记录中对该课程的引用
  Object.keys(data).forEach(key => {
    if (!key.startsWith('user_learning_')) return;
    const record = data[key];
    if (!record || typeof record !== 'object') return;
    if (Array.isArray(record.completedCourses)) {
      record.completedCourses = record.completedCourses.filter(cid => String(cid) !== String(id));
    }
    if (record.videoProgress && typeof record.videoProgress === 'object') {
      Object.keys(record.videoProgress).forEach(k => {
        if (k.startsWith(`${id}_`) || k.includes(`_${id}_`)) delete record.videoProgress[k];
      });
    }
  });

  // 删除课程主记录
  data.management_courses.splice(courseIndex, 1);

  if (writeData(data)) {
    res.json({ success: true, message: '课程已删除，关联数据已清理' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// ============================================================
// 讲师管理 API
// ============================================================

// GET /api/lecturers - 获取所有讲师（动态计算courseCount、totalPayment、yearsAsInstructor）
app.get('/api/lecturers', (req, res) => {
  const data = readData();
  const courses = data.management_courses || [];
  const lecturers = (data.lecturers || []).map(l => ({
    ...l,
    courseCount: courses.filter(c => String(c.lecturerId) === String(l.id)).length,
    totalPayment: getLecturerTotalPayment(data, l),
    yearsAsInstructor: calcYearsAsInstructor(l.startTeachingDate)
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
  if (!data.lecturers) {
    return res.status(404).json({ success: false, error: '讲师列表不存在' });
  }

  const lecturerIndex = data.lecturers.findIndex(l => l.id === id);
  if (lecturerIndex === -1) {
    return res.status(404).json({ success: false, error: '讲师不存在' });
  }

  // 前置校验：有关联课程时禁止删除
  const hasCourses = (data.management_courses || []).some(c => String(c.lecturerId) === String(id));
  if (hasCourses) {
    return res.status(400).json({ success: false, error: '该讲师下存在课程，无法删除' });
  }

  const lecturer = data.lecturers[lecturerIndex];

  // 删除头像文件
  if (lecturer.avatar) {
    tryDeleteUploadFile(lecturer.avatar, `lecturer:${id}`);
  }

  // 清理关联数据
  if (data.lecturer_payment_records) {
    data.lecturer_payment_records = data.lecturer_payment_records.filter(r => String(r.lecturerId) !== String(id));
  }
  if (data.lecturer_applications) {
    data.lecturer_applications = data.lecturer_applications.filter(
      a => String(a.lecturerId) !== String(id) && String(a.approvedLecturerId) !== String(id)
    );
  }
  if (data.index_featured_lecturers) {
    data.index_featured_lecturers = data.index_featured_lecturers.filter(l => l !== id);
  }
  if (data.index_featured_lecturers_v2) {
    data.index_featured_lecturers_v2 = data.index_featured_lecturers_v2.filter(l => l !== id);
  }

  // 删除讲师主记录
  data.lecturers.splice(lecturerIndex, 1);

  if (writeData(data)) {
    res.json({ success: true, message: '讲师已删除，关联数据已清理' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// ============================================================
// 讲师课酬记录 API
// ============================================================

// GET /api/lecturer-payment-records - 查询课酬记录
app.get('/api/lecturer-payment-records', (req, res) => {
  const data = readData();
  let records = data.lecturer_payment_records || [];
  if (req.query.lecturerId) {
    records = records.filter(r => String(r.lecturerId) === String(req.query.lecturerId));
  }
  res.json({ success: true, data: records });
});

// POST /api/lecturer-payment-records - 新增课酬记录
app.post('/api/lecturer-payment-records', (req, res) => {
  const data = readData();
  if (!data.lecturer_payment_records) data.lecturer_payment_records = [];

  const { lecturerId, date, type, courseId, trainingId, manualText, averageRating, bonus } = req.body;

  if (!lecturerId || !date || !type || bonus === undefined || bonus === null) {
    return res.status(400).json({ success: false, error: '讲师、日期、类型、奖金为必填项' });
  }

  if (type === 'course' && !courseId) {
    return res.status(400).json({ success: false, error: '关联课程不能为空' });
  }
  if (type === 'training' && !trainingId) {
    return res.status(400).json({ success: false, error: '关联培训不能为空' });
  }
  if (type === 'manual' && !manualText?.trim()) {
    return res.status(400).json({ success: false, error: '手动描述不能为空' });
  }

  let rating = averageRating !== undefined && averageRating !== null ? Number(averageRating) : null;
  if (rating === null || isNaN(rating)) {
    if (type === 'course' && courseId) {
      rating = getCourseAvgRating(data, parseInt(courseId));
    } else if (type === 'training' && trainingId) {
      rating = getTrainingSurveyAverage(data, parseInt(trainingId));
    }
  }

  const record = {
    id: Date.now(),
    lecturerId: parseInt(lecturerId),
    date,
    type,
    courseId: type === 'course' ? parseInt(courseId) : null,
    trainingId: type === 'training' ? parseInt(trainingId) : null,
    manualText: type === 'manual' ? manualText.trim() : null,
    averageRating: rating,
    bonus: Number(bonus) || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.lecturer_payment_records.push(record);
  if (writeData(data)) {
    res.json({ success: true, data: record });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// PUT /api/lecturer-payment-records/:id - 更新课酬记录
app.put('/api/lecturer-payment-records/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const index = (data.lecturer_payment_records || []).findIndex(r => r.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '记录不存在' });
  }

  const updates = req.body;
  const record = { ...data.lecturer_payment_records[index], ...updates, updatedAt: new Date().toISOString() };

  if (record.type === 'course' && record.courseId) {
    record.averageRating = getCourseAvgRating(data, parseInt(record.courseId));
  } else if (record.type === 'training' && record.trainingId) {
    record.averageRating = getTrainingSurveyAverage(data, parseInt(record.trainingId));
  }

  if (updates.averageRating !== undefined && updates.averageRating !== null) {
    record.averageRating = Number(updates.averageRating);
  }

  data.lecturer_payment_records[index] = record;
  if (writeData(data)) {
    res.json({ success: true, data: record });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// DELETE /api/lecturer-payment-records/:id - 删除课酬记录
app.delete('/api/lecturer-payment-records/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  if (!data.lecturer_payment_records) data.lecturer_payment_records = [];
  data.lecturer_payment_records = data.lecturer_payment_records.filter(r => r.id !== id);
  if (writeData(data)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// GET /api/training/:id/survey-average - 获取培训事件关联问卷的平均评分
app.get('/api/training/:id/survey-average', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const avg = getTrainingSurveyAverage(data, trainingId);
  res.json({ success: true, averageRating: avg });
});

// ============================================================
// 培训项目管理 API (新版 - 扁平化培训事件)
// ============================================================

// GET /api/training - 获取所有培训事件
app.get('/api/training', (req, res) => {
  const data = readData();
  const events = (data.training_events || []).map(event => ({
    ...event,
    ...getTrainingReportStats(data, event),
    createdBy: event.createdBy || event.creator || '许志坚'
  }));
  res.json(events);
});

// GET /api/training/schedule - 获取所有培训课程日程（用于用户端培训页面）
app.get('/api/training/schedule', (req, res) => {
  const data = readData();
  const events = data.training_events || [];
  const enrollments = data.training_enrollments || [];
  const users = data.registered_users || [];
  const currentUser = getCurrentUser(req);
  const uid = currentUser ? String(currentUser.id) : null;

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

    const signinDone = uid ? (data.training_signins || []).some(s => s.trainingId === event.id && String(s.userId) === uid) : false;
    const surveyDone = uid ? (data.survey_responses || []).some(r => r.trainingId === event.id && String(r.userId) === uid) : false;
    const examDone = uid ? (data.exam_attempts || []).some(a =>
      String(a.userId) === uid && (a.status === 'completed' || a.passed === true) &&
      (a.trainingId === event.id || a.examId === event.linkedExamId)
    ) : false;

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
      enrolledUsers: enrolledUsers,
      extendedEndTime: event.extendedEndTime || null,
      accessType: event.accessType || 'none',
      allowedUsers: event.allowedUsers || [],
      // 项目内容模块开关（与管理后台设置保持一致）
      signinEnabled: event.signinEnabled,
      signinStartTime: event.signinStartTime,
      signinEndTime: event.signinEndTime,
      signinCode: event.signinCode,
      signinDone,
      surveyEnabled: event.surveyEnabled,
      linkedSurveyId: event.linkedSurveyId,
      surveyDone,
      examEnabled: event.examEnabled,
      linkedExamId: event.linkedExamId,
      examDone,
      coursewareEnabled: event.coursewareEnabled,
      coursewareFiles: event.coursewareFiles || []
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
  const users = data.registered_users || [];
  const signins = (data.training_signins || [])
    .filter(s => s.trainingId === trainingId)
    .map(s => {
      const user = users.find(u => String(u.id) === String(s.userId));
      return {
        ...s,
        userName: s.userName || (user ? (user.realName || user.username) : '未知用户'),
        department: s.department || (user ? (user.department || '-') : '-'),
        position: user ? (user.position || '-') : '-'
      };
    });
  res.json({ success: true, data: signins });
});

// POST /api/training/:id/signin - 员工签到
app.post('/api/training/:id/signin', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const { userId, code, direct, method: reqMethod } = req.body;
  
  if (!userId) {
    return res.status(400).json({ success: false, error: '缺少用户ID' });
  }
  
  const event = (data.training_events || []).find(e => e.id === trainingId);
  if (!event) {
    return res.status(404).json({ success: false, error: '培训事件不存在' });
  }
  
  if (!event.signinEnabled) {
    return res.status(400).json({ success: false, error: '该培训未开启签到' });
  }
  
  // 所有签到均通过培训任务页点击按钮完成，不再校验签到码
  
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
    method: direct ? (reqMethod || 'direct') : 'code'
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
  const users = data.registered_users || [];
  const responses = (data.survey_responses || [])
    .filter(r => r.surveyId === surveyId && r.trainingId == trainingId)
    .map(r => {
      const user = users.find(u => String(u.id) === String(r.userId));
      return {
        ...r,
        userName: r.userName || (user ? (user.realName || user.username) : '匿名用户'),
        department: r.department || (user ? (user.department || '-') : '-'),
        position: user ? (user.position || '-') : '-'
      };
    });

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

  // 补充学员姓名、部门、岗位等用户信息（系统用户表为 registered_users）
  const userList = data.registered_users || [];
  const enrichedAttempts = attempts.map(a => {
    const user = userList.find(u => String(u.id) === String(a.userId));
    return {
      ...a,
      userName: user ? (user.realName || user.name || user.nickname || user.username || a.userName) : (a.userName || '未知用户'),
      department: user ? (user.department || a.department || '-') : (a.department || '-'),
      position: user ? (user.position || a.position || '-') : (a.position || '-')
    };
  });

  res.json({ success: true, data: enrichedAttempts, exam, total: enrichedAttempts.length });
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
  event.createdAt = new Date().toLocaleString('zh-CN');
  data.training_events.push(event);
  // 自动同步 allowedUsers 到报名记录和指派历史
  syncTrainingAllowedUsers(data, event.id, event.allowedUsers);
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
    // 自动同步 allowedUsers 到报名记录和指派历史
    syncTrainingAllowedUsers(data, id, data.training_events[index].allowedUsers);
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
  if (!data.training_events) {
    return res.status(404).json({ success: false, error: '培训事件列表不存在' });
  }

  const trainingIndex = data.training_events.findIndex(e => e.id === id);
  if (trainingIndex === -1) {
    return res.status(404).json({ success: false, error: '培训不存在' });
  }

  const training = data.training_events[trainingIndex];

  // 删除培训相关文件
  (training.galleryImages || []).forEach(url => tryDeleteUploadFile(url, `training:${id}`));
  (training.coursewareFiles || []).forEach(url => tryDeleteUploadFile(url, `training:${id}`));

  // 清理培训特有数据
  if (data.training_enrollments) {
    data.training_enrollments = data.training_enrollments.filter(e => e.trainingId !== id);
  }
  if (data.training_signins) {
    data.training_signins = data.training_signins.filter(s => s.trainingId !== id);
  }
  if (data.training_attendances) {
    data.training_attendances = data.training_attendances.filter(a => a.trainingId !== id);
  }
  if (data.training_exams) {
    data.training_exams = data.training_exams.filter(r => r.trainingId !== id);
  }
  if (data.training_surveys) {
    data.training_surveys = data.training_surveys.filter(r => r.trainingId !== id);
  }
  if (data.survey_responses) {
    data.survey_responses = data.survey_responses.filter(r => r.trainingId !== id);
  }
  if (data.training_assign_history) {
    data.training_assign_history = data.training_assign_history.filter(h => h.trainingId !== id);
  }
  if (data.my_enrolled_trainings) {
    data.my_enrolled_trainings = data.my_enrolled_trainings.filter(t => t.id !== id);
  }
  if (data.notifications) {
    data.notifications = data.notifications.filter(n => n.trainingId !== id);
  }

  // 处理关联的考试：仅删除被当前培训独占的，共享的解除引用
  if (training.linkedExamId) {
    const examId = training.linkedExamId;
    const otherTrainingRefs = (data.training_events || []).filter(t => t.id !== id && t.linkedExamId === examId).length;
    if (otherTrainingRefs === 0) {
      const exam = (data.exams || []).find(e => e.id === examId);
      if (exam) {
        deleteExamFiles(exam);
        if (data.exam_attempts) {
          data.exam_attempts = data.exam_attempts.filter(a => a.examId !== examId);
        }
        data.exams = (data.exams || []).filter(e => e.id !== examId);
      }
    }
  }

  // 处理关联的调研：仅删除被当前培训独占的，共享的解除引用
  if (training.linkedSurveyId) {
    const surveyId = training.linkedSurveyId;
    const otherTrainingRefs = (data.training_events || []).filter(t => t.id !== id && t.linkedSurveyId === surveyId).length;
    if (otherTrainingRefs === 0) {
      const survey = (data.surveys || []).find(s => s.id === surveyId);
      if (survey) {
        deleteSurveyFiles(survey);
        if (data.survey_responses) {
          data.survey_responses = data.survey_responses.filter(r => r.surveyId !== surveyId);
        }
        data.surveys = (data.surveys || []).filter(s => s.id !== surveyId);
      }
    }
  }

  // 处理关联的课程：解除 training_events 引用
  if (training.linkedCourseId) {
    // 课程本身是独立实体，不删除，只解除引用
  }

  // 删除旧版 training_projects 中同名/同 ID 项目及其嵌套 courses
  if (data.training_projects) {
    data.training_projects = data.training_projects.filter(p => {
      const matchById = p.id === id;
      const matchByName = p.project === training.project || p.name === training.name;
      if (matchById || matchByName) {
        // 删除项目下嵌套课程的文件
        (p.courses || []).forEach(c => {
          collectFilesFromEntity(c, ['cover', 'videos', 'attachments']).forEach(url => tryDeleteUploadFile(url, `training-project-course:${c.id}`));
        });
        return false;
      }
      return true;
    });
  }

  // 删除培训主记录
  data.training_events.splice(trainingIndex, 1);

  if (writeData(data)) {
    res.json({ success: true, message: '培训已删除，关联数据已清理' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
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
      userPosition: user ? (user.position || '-') : '-',
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

  // 当前业务：所有学员均可直接报名，不校验 accessType/allowedUsers
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

// GET /api/training/:id/gallery - 获取培训学习风采图片
app.get('/api/training/:id/gallery', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const training = (data.training_events || []).find(t => t.id === trainingId);
  if (!training) return res.status(404).json({ success: false, error: '培训不存在' });
  const images = training.galleryImages || [];
  res.json({ success: true, images });
});

// PUT /api/training/:id/gallery - 替换培训学习风采图片列表（新增/整体覆盖）
app.put('/api/training/:id/gallery', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const training = (data.training_events || []).find(t => t.id === trainingId);
  if (!training) return res.status(404).json({ success: false, error: '培训不存在' });
  const { images } = req.body || {};
  if (!Array.isArray(images)) {
    return res.status(400).json({ success: false, error: 'images 必须是数组' });
  }
  training.galleryImages = images.filter(url => typeof url === 'string' && url.trim());
  writeData(data);
  res.json({ success: true, images: training.galleryImages });
});

// DELETE /api/training/:id/gallery/:idx - 删除指定位置的学习风采图片
app.delete('/api/training/:id/gallery/:idx', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const idx = parseInt(req.params.idx);
  const training = (data.training_events || []).find(t => t.id === trainingId);
  if (!training) return res.status(404).json({ success: false, error: '培训不存在' });
  if (!Array.isArray(training.galleryImages)) training.galleryImages = [];
  if (idx < 0 || idx >= training.galleryImages.length) {
    return res.status(400).json({ success: false, error: '图片索引越界' });
  }

  // 先删除服务器文件
  const url = training.galleryImages[idx];
  tryDeleteUploadFile(url, `training-gallery:${trainingId}:${idx}`);

  training.galleryImages.splice(idx, 1);
  writeData(data);
  res.json({ success: true, images: training.galleryImages });
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

  const addedUserIds = [];
  userIds.forEach(uid => {
    const existing = data.training_enrollments.find(e => e.trainingId === trainingId && e.userId === uid);
    if (!existing) {
      data.training_enrollments.push({
        id: Date.now() + addedUserIds.length,
        trainingId,
        userId: Number(uid) || uid,
        enrolledAt: new Date().toISOString(),
        source: 'assigned'
      });
      addedUserIds.push(Number(uid) || uid);
    }
  });

  // 记录指派历史
  if (addedUserIds.length > 0) {
    if (!data.training_assign_history) data.training_assign_history = [];
    data.training_assign_history.push({
      id: Date.now(),
      trainingId,
      userIds: addedUserIds,
      assignedAt: new Date().toISOString()
    });
  }

  writeData(data);
  const totalCount = data.training_enrollments.filter(e => e.trainingId === trainingId).length;
  res.json({ success: true, message: `已指派 ${addedUserIds.length} 名学员`, added: addedUserIds.length, enrollCount: totalCount });
});

// GET /api/training/:id/assign-history - 获取培训指派历史
app.get('/api/training/:id/assign-history', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const users = data.registered_users || [];
  const getUserName = uid => {
    const u = users.find(user => String(user.id) === String(uid));
    return u ? (u.realName || u.username || '未知用户') : '未知用户';
  };

  // 1. 显式保存的指派历史
  const explicitHistory = (data.training_assign_history || [])
    .filter(h => h.trainingId === trainingId)
    .map(h => ({
      count: (h.userIds || []).length,
      userNames: (h.userIds || []).map(uid => getUserName(uid)),
      assignedAt: h.assignedAt
    }));

  // 2. 从报名记录反推指派批次，补齐历史数据缺口
  const assignedEnrollments = (data.training_enrollments || [])
    .filter(e => e.trainingId === trainingId && e.source === 'assigned');
  const enrollGroups = {};
  assignedEnrollments.forEach(e => {
    const key = String(e.enrolledAt || '');
    if (!enrollGroups[key]) enrollGroups[key] = [];
    enrollGroups[key].push(e);
  });
  const derivedHistory = Object.values(enrollGroups).map(group => ({
    count: group.length,
    userNames: group.map(e => getUserName(e.userId)),
    assignedAt: group[0].enrolledAt
  }));

  // 3. 将创建/编辑培训时设置的 allowedUsers 作为初始指派记录
  const event = (data.training_events || []).find(e => e.id === trainingId);
  const initialHistory = [];
  if (event && event.allowedUsers && event.allowedUsers.length > 0) {
    initialHistory.push({
      count: event.allowedUsers.length,
      userNames: event.allowedUsers.map(uid => getUserName(uid)),
      assignedAt: event.updatedAt || event.createdAt || null,
      isInitial: true
    });
  }

  // 4. 合并：按指派时间秒级去重，避免同一批次被重复显示
  const mergedMap = new Map();
  [...derivedHistory, ...explicitHistory].forEach(h => {
    const key = new Date(h.assignedAt || 0).toISOString().slice(0, 19);
    if (!mergedMap.has(key)) {
      mergedMap.set(key, { ...h });
    } else {
      const existing = mergedMap.get(key);
      const nameSet = new Set(existing.userNames || []);
      (h.userNames || []).forEach(name => nameSet.add(name));
      existing.userNames = Array.from(nameSet);
      existing.count = existing.userNames.length;
    }
  });

  const result = [
    ...initialHistory,
    ...Array.from(mergedMap.values())
      .sort((a, b) => new Date(b.assignedAt || 0) - new Date(a.assignedAt || 0))
  ];

  res.json({ success: true, data: result });
});

// GET /api/training/:id/overview - 获取培训数据分析总览
app.get('/api/training/:id/overview', (req, res) => {
  const data = readData();
  const trainingId = parseInt(req.params.id);
  const overview = buildTrainingOverview(data, trainingId);
  res.json({ success: true, data: overview });
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
  const event = (data.training_events || []).find(e => e.id === trainingId);
  const enrollmentUserIds = new Set((data.training_enrollments || [])
    .filter(e => e.trainingId === trainingId)
    .map(e => String(e.userId)));
  (event?.allowedUsers || []).forEach(uid => enrollmentUserIds.add(String(uid)));
  res.json({ success: true, count: enrollmentUserIds.size });
});

// 计算学习概览报表数据
function buildOverviewReport(data, days = 7) {
  const users = data.registered_users || [];
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;

  // 1. 登录趋势
  const loginLogs = data.login_logs || [];
  const trendMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * msPerDay);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    trendMap[label] = new Set();
  }
  loginLogs.forEach(log => {
    if (!log.loginTime) return;
    const loginDate = new Date(log.loginTime);
    const diffDays = Math.floor((now - loginDate) / msPerDay);
    if (diffDays < 0 || diffDays >= days) return;
    const label = `${loginDate.getMonth() + 1}/${loginDate.getDate()}`;
    if (trendMap[label]) trendMap[label].add(log.userId);
  });
  const loginTrend = Object.entries(trendMap).map(([label, set]) => ({ label, count: set.size }));

  // 2. 用户学习统计（合并 user_learning_* / learning_data_*）
  const userStats = users.map(u => {
    const id = u.id;
    const learningKey1 = 'user_learning_' + id;
    const learningKey2 = 'learning_data_' + id;
    const record = data[learningKey1] || data[learningKey2] || {};
    const totalSeconds = Number(record.totalSeconds) || 0;
    const completedCount = (record.completedCourses || []).length;
    const studyDates = record.studyDates || [];
    return {
      userId: id,
      realName: u.realName || u.username || '未知用户',
      department: u.department || '未分配',
      avatar: u.avatar || '',
      hours: +(totalSeconds / 3600).toFixed(1),
      completedCount,
      streakDays: studyDates.length,
      lastStudyTime: record.lastStudyTime || null
    };
  });

  // 3. 部门学习排行榜 TOP10（按部门人均学习时长）
  const deptGroups = {};
  userStats.forEach(u => {
    const dept = u.department;
    if (!deptGroups[dept]) deptGroups[dept] = { totalHours: 0, userCount: 0, completedCount: 0 };
    deptGroups[dept].totalHours += u.hours;
    deptGroups[dept].userCount += 1;
    deptGroups[dept].completedCount += u.completedCount;
  });
  const deptRanking = Object.entries(deptGroups)
    .map(([dept, stat]) => ({
      dept,
      totalHours: +stat.totalHours.toFixed(1),
      avgHours: +(stat.totalHours / Math.max(stat.userCount, 1)).toFixed(1),
      userCount: stat.userCount,
      completedCount: stat.completedCount
    }))
    .sort((a, b) => b.avgHours - a.avgHours)
    .slice(0, 10);

  // 4. 个人学习排行榜 TOP10（按学习时长）
  const userRanking = [...userStats]
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);

  // 5. 课程分类分布
  const courses = data.management_courses || [];
  const categories = data.course_categories || [];
  const catGroups = {};
  courses.forEach(c => {
    const cat = categories.find(ct => String(ct.id) === String(c.categoryId));
    const name = cat ? cat.name : '未分类';
    catGroups[name] = (catGroups[name] || 0) + 1;
  });
  const categoryDistribution = Object.entries(catGroups)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 6. 最近学习动态
  const recentActivities = [];
  userStats.forEach(u => {
    if (u.lastStudyTime) {
      recentActivities.push({
        user: u.realName,
        department: u.department,
        avatar: u.avatar,
        time: u.lastStudyTime,
        hours: u.hours
      });
    }
  });
  recentActivities.sort((a, b) => new Date(b.time) - new Date(a.time));

  // 7. 周活跃人数
  const weekAgo = new Date(now - 7 * msPerDay);
  const weeklyActive = userStats.filter(u => u.lastStudyTime && new Date(u.lastStudyTime) >= weekAgo).length;

  return {
    loginTrend,
    deptRanking,
    userRanking,
    categoryDistribution,
    recentActivities: recentActivities.slice(0, 10),
    weeklyActive,
    totalStudyHours: +userStats.reduce((s, u) => s + u.hours, 0).toFixed(1),
    totalCompletedCourses: userStats.reduce((s, u) => s + u.completedCount, 0)
  };
}

// GET /api/reports/login-trend - 登录趋势（兼容旧接口）
app.get('/api/reports/login-trend', (req, res) => {
  const data = readData();
  const days = parseInt(req.query.days) || 7;
  const report = buildOverviewReport(data, days);
  res.json({ success: true, data: report.loginTrend });
});

// GET /api/reports/overview - 学习概览综合报表
app.get('/api/reports/overview', (req, res) => {
  const data = readData();
  const days = parseInt(req.query.days) || 7;
  const report = buildOverviewReport(data, days);
  res.json({ success: true, data: report });
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

// DELETE /api/training/courses/:courseId - 删除培训课程（清理课程文件）
app.delete('/api/training/courses/:courseId', (req, res) => {
  const courseId = parseInt(req.params.courseId);
  const data = readData();
  
  let deleted = false;
  for (const project of data.training_projects || []) {
    if (project.courses) {
      const course = project.courses.find(c => c.id === courseId);
      if (course) {
        // 删除课程相关文件
        collectFilesFromEntity(course, ['cover', 'videos', 'attachments']).forEach(url =>
          tryDeleteUploadFile(url, `training-project-course:${courseId}`)
        );
        deleted = true;
      }
      const initialLength = project.courses.length;
      project.courses = project.courses.filter(c => c.id !== courseId);
      if (project.courses.length < initialLength) {
        deleted = true;
      }
    }
  }
  
  if (deleted && writeData(data)) {
    res.json({ success: true, message: '培训课程已删除，关联文件已清理' });
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
  const papers = data.papers || [];
  const banks = data.question_banks || [];
  const bankCategories = data.bank_categories || [];
  // 关联题目数量、考试人次、创建人、试卷分类、完成情况统计
  const enriched = exams.map(exam => {
    const paper = papers.find(p => p.id === exam.paperId);
    const bank = exam.bankId ? banks.find(b => b.id === exam.bankId) : null;
    const categoryId = paper?.categoryId || paper?.category || bank?.categoryId || null;
    const category = bankCategories.find(c => String(c.id) === String(categoryId));
    const attempts = (data.exam_attempts || []).filter(a => a.examId === exam.id);
    const completedAttempts = attempts.filter(a => a.status === 'completed');
    const passCount = completedAttempts.filter(a => a.passed === true).length;
    const failCount = completedAttempts.filter(a => a.passed === false).length;
    const absentCount = attempts.filter(a => a.status === 'abandoned').length;
    const completedScores = completedAttempts.map(a => a.score != null ? Number(a.score) : 0);
    const avgScore = completedScores.length ? Math.round((completedScores.reduce((s, v) => s + v, 0) / completedScores.length) * 10) / 10 : null;
    const maxScore = completedScores.length ? Math.max(...completedScores) : null;
    const passRatePercent = completedAttempts.length ? Math.round(passCount / completedAttempts.length * 100) : null;
    const attemptedUserIds = new Set(attempts.map(a => String(a.userId)));
    const allowedUsers = Array.isArray(exam.allowedUsers) ? exam.allowedUsers : [];
    const allowedSet = new Set(allowedUsers.map(id => String(id)));
    const allowedAttempted = new Set(allowedUsers.filter(id => attemptedUserIds.has(String(id))).map(id => String(id)));
    const unstartedCount = allowedSet.size > 0 ? Math.max(0, allowedSet.size - allowedAttempted.size) : 0;
    return {
      ...exam,
      questionCount: (exam.questions || []).length,
      attemptCount: attempts.length,
      attemptedUserCount: attemptedUserIds.size,
      completedCount: completedAttempts.length,
      passCount,
      failCount,
      absentCount,
      unstartedCount,
      avgScore,
      maxScore,
      passRatePercent,
      creator: exam.creator || exam.createdBy || '许志坚',
      paperCategory: category?.name || paper?.categoryName || bank?.name || '-',
      duration: exam.duration || (paper?.duration) || 60,
      totalScore: exam.totalScore || (paper?.questions ? paper.questions.reduce((s, q) => s + (q.score || 0), 0) : 100),
      passingScore: exam.passingScore || (paper?.passScore) || 60
    };
  });
  res.json(enriched);
});

// POST /api/exams - 创建考试
app.post('/api/exams', (req, res) => {
  const { title, description, duration, passingScore, totalScore, bankId, shuffleQuestions, showAnswer, status, questions, startTime, endTime, maxAttempts, paperId, paperName, allowedUsers, certificateId } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: '考试名称不能为空' });
  }
  const data = readData();
  if (!data.exams) data.exams = [];
  const questionList = questions || [];
  const computedTotalScore = questionList.reduce((s, q) => s + (q.score || 0), 0) || parseInt(totalScore) || 100;
  const newExam = {
    id: Date.now(),
    title,
    description: description || '',
    duration: parseInt(duration) || 60,
    passingScore: parseInt(passingScore) || 60,
    totalScore: computedTotalScore,
    bankId: bankId || null,
    shuffleQuestions: !!shuffleQuestions,
    showAnswer: !!showAnswer,
    status: status || 'draft',
    questions: questionList,
    startTime: startTime || null,
    endTime: endTime || null,
    maxAttempts: parseInt(maxAttempts) || 0,
    paperId: paperId || null,
    paperName: paperName || '',
    allowedUsers: allowedUsers || null,
    certificateId: certificateId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.exams.push(newExam);
  if (writeData(data)) {
    // 创建时直接发布，发送通知（培训模块创建的考试不在此处通知，统一在培训指派时通知）
    let notifiedCount = 0;
    if (newExam.status === 'published' && !req.body.fromTraining) {
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
  // 保存时强制以题目分值之和作为总分，避免手动填写的 totalScore 与题目分数不一致
  const savedQuestions = data.exams[index].questions || [];
  if (savedQuestions.length > 0) {
    data.exams[index].totalScore = savedQuestions.reduce((s, q) => s + (q.score || 0), 0);
  }
  if (writeData(data)) {
    let notifiedCount = 0;
    const fromTraining = !!updates.fromTraining;
    // 场景1：状态从非published变为published → 发送通知（培训模块创建的考试跳过）
    if (oldStatus !== 'published' && updates.status === 'published' && !fromTraining) {
      notifiedCount = sendExamNotifications(data, data.exams[index]);
    }
    // 场景2：考试已发布，且 allowedUsers 发生变化（任务指派）→ 补发通知给新增学员（培训模块创建的考试跳过）
    if (data.exams[index].status === 'published' && updates.allowedUsers !== undefined && !fromTraining) {
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

  const exam = exams[index];

  // 删除考试题目相关文件
  deleteExamFiles(exam);

  exams.splice(index, 1);

  // 删除相关成绩记录
  if (data.exam_attempts) {
    data.exam_attempts = data.exam_attempts.filter(a => a.examId !== id);
  }

  // 解除培训关联
  (data.training_events || []).forEach(t => {
    if (t.linkedExamId === id) t.linkedExamId = null;
  });

  // 清理培训-考试关联表
  if (data.training_exams) {
    data.training_exams = data.training_exams.filter(r => r.examId !== id);
  }

  // 清理相关通知
  if (data.notifications) {
    data.notifications = data.notifications.filter(n => n.examId !== id);
  }

  if (writeData(data)) {
    res.json({ success: true, message: '考试已删除，关联数据已清理' });
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
    // 发布考试时发送通知（培训模块创建的考试跳过，统一在培训指派时通知）
    if (oldStatus !== 'published' && status === 'published' && !req.body.fromTraining) {
      const notifiedCount = sendExamNotifications(data, exams[index]);
      res.json({ success: true, exam: exams[index], notifiedCount });
    } else {
      res.json({ success: true, exam: exams[index] });
    }
  } else {
    res.status(500).json({ success: false, error: '状态更新失败' });
  }
});

// GET /api/exams/:id/students - 获取考试学员状态统计
app.get('/api/exams/:id/students', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  const users = data.registered_users || [];
  const attempts = (data.exam_attempts || []).filter(a => a.examId === id);
  const allowedUsers = Array.isArray(exam.allowedUsers) ? exam.allowedUsers : [];
  let targetUserIds = [];
  if (allowedUsers.length > 0) {
    targetUserIds = allowedUsers.map(uid => String(uid));
  } else {
    targetUserIds = Array.from(new Set(attempts.map(a => String(a.userId))));
  }
  const statusTextMap = {
    passed: '及格',
    failed: '不及格',
    unstarted: '未考',
    taking: '进行中',
    absent: '缺考'
  };
  const fullScore = exam.totalScore || (exam.questions || []).reduce((s, q) => s + (q.score || 0), 0) || 100;
  const now = Date.now();
  const getAttemptDuration = (a) => {
    if (a.durationUsed !== undefined && a.durationUsed !== null) return a.durationUsed;
    if (a.completedAt && a.startedAt) {
      return Math.round((new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime()) / 1000);
    }
    if (a.startedAt) {
      return Math.round((now - new Date(a.startedAt).getTime()) / 1000);
    }
    return 0;
  };
  const students = targetUserIds.map(uid => {
    const user = users.find(u => String(u.id) === uid);
    const allUserAttempts = attempts.filter(a => String(a.userId) === uid).sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
    // 排除 10 秒内退出的无效记录（误操作/网络问题），进行中的尝试也不计入考试次数
    const meaningfulAttempts = allUserAttempts.filter(a => {
      if (a.status === 'completed') return true;
      if (a.status === 'abandoned') return getAttemptDuration(a) >= 10;
      return false;
    });
    const completedAttempts = meaningfulAttempts.filter(a => a.status === 'completed');
    const highestAttempt = completedAttempts.length
      ? completedAttempts.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0]
      : null;
    let status = 'unstarted';
    let score = null;
    let scoreRate = null;
    let duration = null;
    if (highestAttempt) {
      status = highestAttempt.passed ? 'passed' : 'failed';
      score = highestAttempt.score;
      scoreRate = fullScore > 0 ? Math.round((score || 0) / fullScore * 100) : 0;
      duration = highestAttempt.durationUsed || 0;
      if (!duration && highestAttempt.completedAt && highestAttempt.startedAt) {
        duration = Math.round((new Date(highestAttempt.completedAt) - new Date(highestAttempt.startedAt)) / 1000);
      }
    } else if (allUserAttempts.some(a => a.status === 'taking')) {
      status = 'taking';
    } else if (meaningfulAttempts.some(a => a.status === 'abandoned')) {
      status = 'absent';
    }
    const joinAttempt = allUserAttempts[allUserAttempts.length - 1];
    const joinTime = joinAttempt && joinAttempt.startedAt
      ? new Date(joinAttempt.startedAt).toLocaleString('zh-CN')
      : '-';
    return {
      userId: uid,
      userName: user ? (user.realName || user.username) : '未知用户',
      department: user ? (user.department || '-') : '-',
      position: user ? (user.position || '-') : '-',
      phone: user ? (user.phone || '-') : '-',
      joinTime,
      attemptCount: meaningfulAttempts.length,
      score: score !== null ? score : '-',
      scoreRate: scoreRate !== null ? scoreRate : '-',
      duration,
      status,
      statusText: statusTextMap[status] || status
    };
  });
  res.json({ success: true, exam: { id: exam.id, title: exam.title }, students });
});

// GET /api/exams/:id/question-stats - 获取考试题目统计
app.get('/api/exams/:id/question-stats', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  const allQuestions = data.questions || [];
  const attempts = (data.exam_attempts || []).filter(a => a.examId === id && a.status === 'completed');
  const questionBanks = data.question_banks || [];
  const typeTextMap = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };
  const stats = (exam.questions || []).map((eq, idx) => {
    const q = allQuestions.find(qq => qq.id === eq.questionId);
    if (!q) return null;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    const correctAnswerRaw = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');
    const correctAnswerDisplay = q.type === 'judge' ? judgeAnswerToAB(q.answer) : correctAnswerRaw;
    attempts.forEach(a => {
      const ua = ((a.answers || {})[String(q.id)] || '').toString();
      if (ua === '') {
        unansweredCount++;
        return;
      }
      let isCorrect = false;
      if (q.type === 'multiple') {
        const uaSorted = ua.replace(/\s/g, '').split('').sort().join('');
        const caSorted = correctAnswerRaw.replace(/\s/g, '').split('').sort().join('');
        isCorrect = uaSorted === caSorted && uaSorted !== '';
      } else if (q.type === 'judge') {
        const userBool = normalizeJudgeAnswer(ua);
        const correctBool = normalizeJudgeAnswer(correctAnswerRaw);
        isCorrect = userBool !== null && userBool === correctBool;
      } else {
        isCorrect = ua === correctAnswerRaw;
      }
      if (isCorrect) correctCount++;
      else wrongCount++;
    });
    const total = attempts.length;
    const bank = questionBanks.find(b => b.id === q.bankId);
    return {
      questionId: q.id,
      order: eq.order !== undefined ? eq.order : idx,
      type: q.type || 'single',
      typeText: typeTextMap[q.type] || '单选题',
      content: q.title || q.content || '(无标题)',
      title: q.title || q.content || '(无标题)',
      score: eq.score || q.score || 0,
      bankName: bank ? bank.name : '-',
      knowledge: q.knowledge || '-',
      correctAnswer: correctAnswerDisplay,
      correctCount,
      wrongCount,
      unansweredCount,
      total,
      totalCount: total,
      correctRate: total > 0 ? Math.round(correctCount / total * 100) : 0
    };
  }).filter(Boolean);
  res.json({ success: true, stats });
});

// GET /api/exams/:id/students/:userId/records - 获取某个学员的考试记录
app.get('/api/exams/:id/students/:userId/records', (req, res) => {
  const id = parseInt(req.params.id);
  const userId = req.params.userId;
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  const users = data.registered_users || [];
  const user = users.find(u => String(u.id) === String(userId));
  const fullScore = exam.totalScore || (exam.questions || []).reduce((s, q) => s + (q.score || 0), 0) || 100;
  const attempts = (data.exam_attempts || [])
    .filter(a => a.examId === id && String(a.userId) === String(userId) && a.status === 'completed')
    .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
  const highestScore = attempts.length
    ? Math.max(...attempts.map(a => a.score || 0))
    : 0;
  const records = attempts.map(a => {
    const score = a.score || 0;
    return {
      id: a.id,
      status: a.status,
      score,
      fullScore,
      scoreRate: fullScore > 0 ? Math.round(score / fullScore * 100) : 0,
      passed: a.passed || false,
      durationUsed: a.durationUsed || 0,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      isHighest: score === highestScore
    };
  });
  res.json({
    success: true,
    records,
    user: user ? { userId: user.id, userName: user.realName || user.username, department: user.department || '', position: user.position || '', phone: user.phone || '' } : null
  });
});

// GET /api/exams/:id/questions/:questionId/answers - 获取某道题的所有学员答题
app.get('/api/exams/:id/questions/:questionId/answers', (req, res) => {
  const id = parseInt(req.params.id);
  const questionId = parseInt(req.params.questionId);
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  const q = (data.questions || []).find(qq => qq.id === questionId);
  if (!q) {
    return res.status(404).json({ success: false, error: '题目不存在' });
  }
  const users = data.registered_users || [];
  const attempts = (data.exam_attempts || []).filter(a => a.examId === id && a.status === 'completed');
  const correctAnswerRaw = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');
  const answers = attempts.map(a => {
    const ua = ((a.answers || {})[String(questionId)] || '').toString();
    let isCorrect = false;
    if (q.type === 'multiple') {
      const uaSorted = ua.replace(/\s/g, '').split('').sort().join('');
      const caSorted = correctAnswerRaw.replace(/\s/g, '').split('').sort().join('');
      isCorrect = uaSorted === caSorted && uaSorted !== '';
    } else if (q.type === 'judge') {
      const userBool = normalizeJudgeAnswer(ua);
      const correctBool = normalizeJudgeAnswer(correctAnswerRaw);
      isCorrect = userBool !== null && userBool === correctBool;
    } else {
      isCorrect = ua !== '' && ua === correctAnswerRaw;
    }
    const user = users.find(u => String(u.id) === String(a.userId));
    return {
      userId: a.userId,
      userName: user ? (user.realName || user.username) : '未知用户',
      department: user ? (user.department || '-') : '-',
      position: user ? (user.position || '-') : '-',
      phone: user ? (user.phone || '-') : '-',
      userAnswer: q.type === 'judge' ? judgeAnswerToAB(ua) : ua,
      correctAnswer: q.type === 'judge' ? judgeAnswerToAB(q.answer) : correctAnswerRaw,
      isCorrect,
      completedAt: a.completedAt
    };
  });
  res.json({ success: true, question: { questionId: q.id, title: q.title || q.content || '', type: q.type }, answers });
});

// GET /api/exams/:id/ranking - 获取考试排行榜（取每个用户的最高成绩）
app.get('/api/exams/:id/ranking', (req, res) => {
  const id = parseInt(req.params.id);
  const currentUserId = req.query.userId ? String(req.query.userId) : '';
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }
  const users = data.registered_users || [];
  const attempts = (data.exam_attempts || []).filter(a => a.examId === id && a.status === 'completed');
  const fullScore = (exam.questions || []).reduce((s, q) => s + (q.score || 0), 0) || exam.totalScore || 100;
  const bestByUser = {};
  attempts.forEach(a => {
    const uid = String(a.userId);
    if (!bestByUser[uid] || (a.score || 0) > bestByUser[uid].score) {
      bestByUser[uid] = a;
    }
  });
  let ranking = Object.values(bestByUser).map(a => {
    const user = users.find(u => String(u.id) === String(a.userId));
    const score = a.score || 0;
    return {
      userId: a.userId,
      userName: user ? (user.realName || user.username) : '未知用户',
      department: user ? (user.department || '') : '',
      avatar: user ? (user.avatar || '') : '',
      score,
      scoreRate: fullScore > 0 ? Math.round(score / fullScore * 100) : 0,
      isCurrentUser: String(a.userId) === currentUserId
    };
  });
  ranking.sort((a, b) => b.score - a.score);
  ranking = ranking.map((item, idx) => ({ ...item, rank: idx + 1 }));
  res.json({ success: true, ranking });
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
  const attempts = (data.exam_attempts || []).filter(a => a.examId === id && a.status === 'completed');
  // 关联用户信息（使用 registered_users 主表）
  const users = data.registered_users || [];
  const results = attempts.map(a => {
    const user = users.find(u => String(u.id) === String(a.userId));
    return {
      ...a,
      userName: user ? (user.realName || user.username) : '未知用户',
      department: user ? (user.department || '-') : '-',
      position: user ? (user.position || '-') : '-'
    };
  }).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  res.json({ success: true, results });
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

// GET /api/user/trainings - 获取当前用户参与的培训列表及数量（供个人中心）
app.get('/api/user/trainings', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  const data = readData();
  const userId = String(currentUser.id);

  const trainingIds = new Set();

  // 主动报名或旧版报名记录
  (data.training_enrollments || []).forEach(e => {
    if (String(e.userId) === userId) {
      trainingIds.add(String(e.trainingId));
    }
  });

  // 任务指派记录
  (data.training_assign_history || []).forEach(a => {
    if (Array.isArray(a.userIds) && a.userIds.some(uid => String(uid) === userId)) {
      trainingIds.add(String(a.trainingId));
    }
  });

  const now = new Date();
  const list = Array.from(trainingIds).map(tid => {
    const event = (data.training_events || []).find(e => String(e.id) === tid);
    if (!event) return null;
    const start = event.startTime ? new Date(event.startTime) : null;
    const end = event.endTime ? new Date(event.endTime) : null;
    let trainingStatus = '未开始';
    if (end && now > end) trainingStatus = '已结束';
    else if (start && now >= start) trainingStatus = '进行中';
    else if (start && now < start) trainingStatus = '未开始';

    const signedIn = (data.training_signins || []).some(s => String(s.trainingId) === tid && String(s.userId) === userId);
    const examDone = event.linkedExamId
      ? (data.exam_attempts || []).some(a => String(a.examId) === String(event.linkedExamId) && String(a.userId) === userId && (a.status === 'completed' || a.passed === true))
      : null;
    const surveyDone = event.linkedSurveyId
      ? (data.survey_responses || []).some(r => String(r.surveyId) === String(event.linkedSurveyId) && String(r.userId) === userId && String(r.trainingId) === tid)
      : null;

    return {
      id: event.id,
      name: event.name || event.project || '未命名培训',
      project: event.project || '',
      instructor: event.instructor || '',
      location: event.location || '',
      startTime: event.startTime || null,
      endTime: event.endTime || null,
      trainingStatus,
      signedIn,
      examDone,
      surveyDone,
      signinEnabled: !!event.signinEnabled,
      examEnabled: !!event.examEnabled && !!event.linkedExamId,
      surveyEnabled: !!event.surveyEnabled && !!event.linkedSurveyId
    };
  }).filter(Boolean).sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));

  res.json({ success: true, count: trainingIds.size, trainingIds: Array.from(trainingIds), list });
});

// GET /api/user/login-days - 获取当前用户的实际登录天数（按日期去重）
app.get('/api/user/login-days', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: '未登录' });
  }

  const data = readData();
  const userId = String(currentUser.id);
  const loginLogs = data.login_logs || [];

  const dateSet = new Set();
  loginLogs.forEach(log => {
    if (String(log.userId) !== userId || !log.loginTime) return;
    const loginDate = new Date(log.loginTime);
    if (isNaN(loginDate.getTime())) return;
    const dateStr = loginDate.toISOString().split('T')[0];
    dateSet.add(dateStr);
  });

  const loginDates = Array.from(dateSet).sort();
  res.json({
    success: true,
    loginDays: loginDates.length,
    loginDates
  });
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

  const allQuestions = data.questions || [];
  let examQuestions = (exam.questions || [])
    .map(eq => {
      const q = allQuestions.find(qq => qq.id === eq.questionId);
      if (!q) return null;
      const score = eq.score !== undefined && eq.score !== null ? eq.score : 1;
      return {
        ...q,
        score,
        fullScore: score,
        partialScore: eq.partialScore !== undefined && eq.partialScore !== null ? eq.partialScore : null,
        order: eq.order !== undefined && eq.order !== null ? eq.order : 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);

  // 如果配置了随机打乱
  if (exam.shuffleQuestions) {
    examQuestions = examQuestions.sort(() => Math.random() - 0.5);
  }

  // 去掉答案
  const safeQuestions = examQuestions.map(({ answer, analysis, ...rest }) => rest);

  // 计算及格线百分比（exam.html 使用 passScore 作为百分比显示）
  const fullScore = exam.totalScore || examQuestions.reduce((s, eq) => s + (eq.score || 1), 0);
  const effectivePassingScore = (exam.passingScore !== undefined && exam.passingScore !== null)
    ? exam.passingScore
    : Math.max(1, Math.ceil(fullScore * 0.6));
  const passScorePercent = fullScore > 0 ? Math.round(effectivePassingScore / fullScore * 100) : 60;

  res.json({
    success: true,
    exam: { ...exam, questions: undefined, passScore: passScorePercent, name: exam.title },
    questions: safeQuestions,
    totalQuestions: examQuestions.length,
    duration: exam.duration * 60 // 转换为秒
  });
};
app.get('/api/exams/:id/take', takeExamHandler);
app.post('/api/exams/:id/take', takeExamHandler);

// POST /api/exams/:id/enter - 学员进入考试（记录开始）
app.post('/api/exams/:id/enter', (req, res) => {
  const id = parseInt(req.params.id);
  const { userId, trainingId } = req.body;
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!data.exam_attempts) data.exam_attempts = [];
  const attemptId = Date.now();
  const attempt = {
    id: attemptId,
    examId: id,
    userId: userId,
    status: 'taking',
    startedAt: new Date().toISOString(),
    answers: {},
    score: null,
    passed: null
  };
  if (trainingId) attempt.trainingId = parseInt(trainingId, 10);
  data.exam_attempts.push(attempt);
  writeData(data);
  // 返回 session 对象供 exam.html 使用
  const durationSeconds = (exam ? exam.duration || 60 : 60) * 60;
  res.json({
    success: true,
    attemptId,
    session: {
      attemptId,
      deadline: new Date(Date.now() + durationSeconds * 1000).toISOString(),
      remainingSeconds: durationSeconds,
      expired: false
    }
  });
});

// 判断题答案归一化：兼容 A/B、正确/错误、true/false 等多种写法
function normalizeJudgeAnswer(val) {
  const v = String(val || '').trim().toLowerCase();
  if (['a', '正确', 'true', '1', '对', 'yes'].includes(v)) return true;
  if (['b', '错误', 'false', '0', '错', 'no'].includes(v)) return false;
  return null;
}
function judgeAnswerToAB(val) {
  const b = normalizeJudgeAnswer(val);
  if (b === true) return 'A';
  if (b === false) return 'B';
  return val;
}

// POST /api/exams/:id/submit - 提交考试答卷
app.post('/api/exams/:id/submit', async (req, res) => {
  const id = parseInt(req.params.id);
  const { userId, attemptId, answers, durationUsed } = req.body;
  const data = readData();
  const exam = (data.exams || []).find(e => e.id === id);
  if (!exam) return res.status(404).json({ success: false, error: '考试不存在' });

  // 查找 attempt 记录：优先使用 attemptId（校验用户一致），否则按 userId+examId 查找最近的 "taking" 状态
  const attempts = data.exam_attempts || [];
  let attemptIndex = -1;
  if (attemptId) {
    attemptIndex = attempts.findIndex(a => a.id === attemptId && String(a.userId) === String(userId) && a.status === 'taking');
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
  let correctCount = 0;
  let totalScore = 0;
  const detail = [];

  // 逐题评分，使用每道题的独立分值
  examQuestions.forEach(eq => {
    const q = allQuestions.find(qq => qq.id === eq.questionId);
    if (!q) return;
    const qScore = eq.score !== undefined && eq.score !== null ? eq.score : 1;
    const partialScore = eq.partialScore !== undefined && eq.partialScore !== null ? eq.partialScore : null;
    const userAnswer = (answers || {})[String(q.id)] || '';
    // 多选题答案排序比较；判断题统一归一化比较；其它题型直接文本比对
    let isCorrect = false;
    let earnedScore = 0;
    if (q.type === 'multiple') {
      // 答案可能是数组或字符串（如 "A B C D" 或 "ABCD"），统一转为去除空格后的排序字符串
      const ua = (userAnswer || '').replace(/\s/g, '').split('').sort().join('');
      const caRaw = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');
      const ca = caRaw.replace(/\s/g, '').split('').sort().join('');
      isCorrect = ua === ca && ua !== '';
      if (isCorrect) {
        earnedScore = qScore;
      } else if (ua !== '') {
        // 漏选：用户选的都在正确答案中 → 按配置的漏选得分给分
        // 错选：用户选了不在正确答案中的 → 0分
        const correctSet = new Set(ca.split(''));
        const userSet = new Set(ua.split(''));
        const hasWrong = [...userSet].some(ch => !correctSet.has(ch));
        if (!hasWrong && userSet.size > 0) {
          if (partialScore !== null) {
            earnedScore = partialScore;
          } else {
            // 兼容旧数据：未配置漏选得分时按答对比例得分
            earnedScore = Math.round(qScore * userSet.size / correctSet.size);
          }
        }
      }
    } else if (q.type === 'judge') {
      const userBool = normalizeJudgeAnswer(userAnswer);
      const correctBool = normalizeJudgeAnswer(q.answer);
      isCorrect = userBool !== null && userBool === correctBool;
      earnedScore = isCorrect ? qScore : 0;
    } else {
      isCorrect = String(userAnswer).trim() === String(q.answer || '').trim() && userAnswer !== '';
      earnedScore = isCorrect ? qScore : 0;
    }
    if (isCorrect) correctCount++;
    totalScore += earnedScore;
    detail.push({
      questionId: q.id,
      type: q.type || 'single',
      title: q.title || q.content || '',
      content: q.content || q.title || '',
      userAnswer: q.type === 'judge' ? judgeAnswerToAB(userAnswer) : userAnswer,
      correctAnswer: q.type === 'judge' ? judgeAnswerToAB(q.answer) : (Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '')),
      isCorrect,
      score: earnedScore,
      fullScore: qScore,
      options: q.options || [],
      analysis: q.analysis || q.explanation || ''
    });
  });

  const finalScore = Math.round(totalScore);
  const fullScore = examQuestions.reduce((s, eq) => s + (eq.score !== undefined && eq.score !== null ? eq.score : 1), 0);
  const effectivePassingScore = (exam.passingScore !== undefined && exam.passingScore !== null)
    ? exam.passingScore
    : Math.max(1, Math.ceil(fullScore * 0.6));
  const passed = finalScore >= effectivePassingScore;
  const percent = fullScore > 0 ? Math.round(finalScore / fullScore * 100) : 0;

  // 更新 attempt 记录（使用上面已查找到的 attemptIndex）
  if (attemptIndex !== -1) {
    const existingTrainingId = attempts[attemptIndex].trainingId;
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
    // 补录培训关联ID（兼容旧尝试或从培训页进入时携带）
    const reqTrainingId = req.body.trainingId;
    if (!existingTrainingId && reqTrainingId) {
      attempts[attemptIndex].trainingId = parseInt(reqTrainingId, 10);
    }
  }

  // 考试合格后自动发放证书
  if (passed && exam.certificateId) {
    try {
      const autoIssue = await issueCertificateInternal(data, exam.certificateId, userId, 'exam', String(id));
      if (autoIssue.success) {
        console.log(`  自动发放证书: ${autoIssue.data.certNo} -> 用户 ${userId}`);
      } else {
        console.log(`  自动发放证书失败: ${autoIssue.error} (用户 ${userId}, 考试 ${id})`);
      }
    } catch (e) {
      console.error(`  自动发放证书异常: ${e.message} (用户 ${userId}, 考试 ${id})`);
    }
  }

  // 同步考试记录到用户学习数据（供个人中心徽章计算使用）
  const learningKey = `user_learning_${userId}`;
  if (!data[learningKey]) data[learningKey] = {};
  if (!data[learningKey].examRecords) data[learningKey].examRecords = [];
  // 避免重复记录同一次 attempt
  const existIdx = data[learningKey].examRecords.findIndex(r => r.attemptId === (attemptIndex !== -1 ? attempts[attemptIndex].id : null));
  const examRecord = {
    examId: id,
    examTitle: exam.title || '',
    score: finalScore,
    fullScore,
    passed,
    correctCount,
    totalQuestions: examQuestions.length,
    completedAt: new Date().toISOString(),
    attemptId: attemptIndex !== -1 ? attempts[attemptIndex].id : null,
    durationUsed: durationUsed || 0
  };
  if (existIdx >= 0) {
    data[learningKey].examRecords[existIdx] = examRecord;
  } else {
    data[learningKey].examRecords.push(examRecord);
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

// POST /api/exams/:id/abandon - 放弃考试（10秒内退出视为误操作，直接删除记录）
app.post('/api/exams/:id/abandon', (req, res) => {
  const id = parseInt(req.params.id);
  const { attemptId } = req.body;
  const data = readData();
  const attempts = data.exam_attempts || [];
  const index = attempts.findIndex(a => a.id === attemptId);
  if (index !== -1) {
    const startedAt = new Date(attempts[index].startedAt).getTime();
    const durationUsed = Math.round((Date.now() - startedAt) / 1000);
    if (durationUsed < 10) {
      attempts.splice(index, 1);
    } else {
      attempts[index].status = 'abandoned';
      attempts[index].completedAt = new Date().toISOString();
      attempts[index].durationUsed = durationUsed;
    }
    writeData(data);
  }
  res.json({ success: true });
});

// GET /api/exams/attempts/:attemptId/detail - 查看历史考试答题详情
app.get('/api/exams/attempts/:attemptId/detail', (req, res) => {
  const attemptId = parseInt(req.params.attemptId);
  const data = readData();
  const attempts = data.exam_attempts || [];
  const attempt = attempts.find(a => a.id === attemptId);
  if (!attempt) {
    return res.status(404).json({ success: false, error: '考试记录不存在' });
  }
  const exam = (data.exams || []).find(e => e.id === attempt.examId);
  if (!exam) {
    return res.status(404).json({ success: false, error: '考试不存在' });
  }

  const allQuestions = data.questions || [];
  const examQuestions = exam.questions || [];
  const details = [];
  let correctCount = 0;
  let totalScore = 0;

  examQuestions.forEach(eq => {
    const q = allQuestions.find(qq => qq.id === eq.questionId);
    if (!q) return;
    const qScore = eq.score !== undefined && eq.score !== null ? eq.score : 1;
    const partialScore = eq.partialScore !== undefined && eq.partialScore !== null ? eq.partialScore : null;
    const userAnswer = (attempt.answers || {})[String(q.id)] || '';
    let isCorrect = false;
    let earnedScore = 0;

    if (q.type === 'multiple') {
      const ua = (userAnswer || '').replace(/\s/g, '').split('').sort().join('');
      const caRaw = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');
      const ca = caRaw.replace(/\s/g, '').split('').sort().join('');
      isCorrect = ua === ca && ua !== '';
      if (isCorrect) {
        earnedScore = qScore;
      } else if (ua !== '') {
        const correctSet = new Set(ca.split(''));
        const userSet = new Set(ua.split(''));
        const hasWrong = [...userSet].some(ch => !correctSet.has(ch));
        if (!hasWrong && userSet.size > 0) {
          if (partialScore !== null) {
            earnedScore = partialScore;
          } else {
            earnedScore = Math.round(qScore * userSet.size / correctSet.size);
          }
        }
      }
    } else if (q.type === 'judge') {
      const userBool = normalizeJudgeAnswer(userAnswer);
      const correctBool = normalizeJudgeAnswer(q.answer);
      isCorrect = userBool !== null && userBool === correctBool;
      earnedScore = isCorrect ? qScore : 0;
    } else {
      isCorrect = String(userAnswer).trim() === String(q.answer || '').trim() && userAnswer !== '';
      earnedScore = isCorrect ? qScore : 0;
    }

    if (isCorrect) correctCount++;
    totalScore += earnedScore;

    details.push({
      questionId: q.id,
      type: q.type || 'single',
      title: q.title || q.content || '',
      content: q.content || q.title || '',
      userAnswer: q.type === 'judge' ? judgeAnswerToAB(userAnswer) : userAnswer,
      correctAnswer: q.type === 'judge' ? judgeAnswerToAB(q.answer) : (Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '')),
      isCorrect,
      score: earnedScore,
      fullScore: qScore,
      options: q.options || [],
      analysis: q.analysis || q.explanation || ''
    });
  });

  const fullScore = examQuestions.reduce((s, eq) => s + (eq.score || 1), 0);
  const effectivePassingScore = (exam.passingScore !== undefined && exam.passingScore !== null)
    ? exam.passingScore
    : Math.max(1, Math.ceil(fullScore * 0.6));
  const finalScore = typeof attempt.score === 'number' ? attempt.score : Math.round(totalScore);
  const passed = typeof attempt.passed === 'boolean' ? attempt.passed : finalScore >= effectivePassingScore;

  res.json({
    success: true,
    exam: { ...exam, questions: undefined, name: exam.title, totalScore: fullScore, fullScore, passingScore: effectivePassingScore },
    attempt: {
      ...attempt,
      score: finalScore,
      passed,
      correctCount: typeof attempt.correctCount === 'number' ? attempt.correctCount : correctCount,
      totalQuestions: examQuestions.length,
      fullScore
    },
    details
  });
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

// DELETE /api/users/:id - 删除用户（同时清理关联数据与头像）
app.delete('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (!data.users) {
    return res.status(404).json({ success: false, error: '用户列表不存在' });
  }

  const user = data.users.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }

  // 清理用户头像文件
  if (user.avatar) {
    tryDeleteUploadFile(user.avatar, `user:${id}`);
  }

  // 清理用户关联数据（含 registered_users 中的头像）
  cleanupUserRelatedData(data, String(id), true);

  // 删除用户主记录
  data.users = data.users.filter(u => u.id !== id);

  if (writeData(data)) {
    res.json({ success: true, message: '用户已删除，关联数据已清理' });
  } else {
    res.status(500).json({ success: false, error: '写入失败' });
  }
});

// ============================================================
// Banner管理 API
// ============================================================

// GET /api/banners - 获取所有Banner
app.get('/api/banners', (req, res) => {
  const data = readData();
  const banners = (data.index_banners || []).sort((a, b) => (a.order || 0) - (b.order || 0));
  // 附带关联课程和公告信息
  const courses = data.management_courses || [];
  const notices = data.notices || [];
  const enriched = banners.map(b => {
    const course = b.courseId ? courses.find(c => c.id === b.courseId) : null;
    const notice = b.announcementId ? notices.find(n => n.id === b.announcementId) : null;
    return { ...b, courseTitle: course ? course.title : null, announcementTitle: notice ? notice.title : null };
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
      announcementId: req.body.announcementId ? parseInt(req.body.announcementId) : null,
      order: data.index_banners.length + 1,
      status: 'published',
      createdAt: new Date().toISOString()
    };
  } else {
    // JSON 模式
    banner = req.body;
    banner.id = Date.now();
    banner.courseId = banner.courseId ? parseInt(banner.courseId) : null;
    banner.announcementId = banner.announcementId ? parseInt(banner.announcementId) : null;
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
  if (!data.index_banners) {
    return res.status(404).json({ success: false, error: 'Banner列表不存在' });
  }

  const bannerIndex = data.index_banners.findIndex(b => b.id === id);
  if (bannerIndex === -1) {
    return res.status(404).json({ success: false, error: 'Banner不存在' });
  }

  const banner = data.index_banners[bannerIndex];
  if (banner.img) {
    tryDeleteUploadFile(banner.img, `banner:${id}`);
  }

  data.index_banners.splice(bannerIndex, 1);

  if (writeData(data)) {
    res.json({ success: true, message: '轮播图已删除' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
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
  if (req.body.announcementId !== undefined) updates.announcementId = req.body.announcementId ? parseInt(req.body.announcementId) : null;
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

// DELETE /api/notices/:id - 删除公告（清理正文图片、访问记录、轮播引用）
app.delete('/api/notices/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();

  if (!data.notices) {
    return res.status(404).json({ success: false, error: '公告列表不存在' });
  }

  const noticeIndex = data.notices.findIndex(n => n.id === id);
  if (noticeIndex === -1) {
    return res.status(404).json({ success: false, error: '公告不存在' });
  }

  const notice = data.notices[noticeIndex];

  // 删除公告封面图
  if (notice.cover) {
    tryDeleteUploadFile(notice.cover, `notice:${id}:cover`);
  }

  // 删除正文中的 /uploads/ 图片
  collectUrlsFromHtml(notice.content).forEach(url => tryDeleteUploadFile(url, `notice:${id}`));

  // 删除公告访问记录
  if (data.notice_visits) {
    data.notice_visits = data.notice_visits.filter(v => v.noticeId !== id);
  }

  // 解除轮播图中对该公告的引用
  if (data.index_banners) {
    data.index_banners.forEach(b => {
      if (b.announcementId === id) b.announcementId = null;
    });
  }

  // 删除主记录
  data.notices.splice(noticeIndex, 1);

  if (writeData(data)) {
    res.json({ success: true, message: '公告已删除，关联数据已清理' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
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

// GET /api/notices/:id/visits - 获取公告访问详情（按用户聚合）
app.get('/api/notices/:id/visits', (req, res) => {
  const noticeId = parseInt(req.params.id);
  const data = readData();
  const users = data.registered_users || [];
  const visits = (data.notice_visits || []).filter(v => v.noticeId === noticeId);

  // 按 userId 聚合：计算访问次数和首次访问时间
  const userVisitMap = new Map();
  visits.forEach(v => {
    const userId = v.userId;
    const existed = userVisitMap.get(userId);
    if (existed) {
      existed.visitCount += 1;
      const current = new Date(v.visitedAt);
      if (current < new Date(existed.firstVisitAt)) {
        existed.firstVisitAt = v.visitedAt;
      }
    } else {
      const user = users.find(u => u.id === userId) || {};
      userVisitMap.set(userId, {
        userId: userId,
        name: user.realName || v.username || String(userId),
        department: user.department || '—',
        position: user.position || '—',
        firstVisitAt: v.visitedAt,
        visitCount: 1
      });
    }
  });

  const aggregated = Array.from(userVisitMap.values()).sort((a, b) =>
    new Date(b.firstVisitAt) - new Date(a.firstVisitAt)
  );

  res.json({
    success: true,
    noticeId: noticeId,
    totalCount: aggregated.length,
    visits: aggregated
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

// DELETE /api/surveys/:id - 删除调研（清理题目图片、答卷、培训引用）
app.delete('/api/surveys/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  if (!data.surveys) {
    return res.status(404).json({ success: false, error: '调研列表不存在' });
  }

  const surveyIndex = data.surveys.findIndex(s => s.id === id);
  if (surveyIndex === -1) {
    return res.status(404).json({ success: false, error: '调研不存在' });
  }

  const survey = data.surveys[surveyIndex];

  // 删除题目相关图片
  deleteSurveyFiles(survey);

  // 删除调研主记录
  data.surveys.splice(surveyIndex, 1);

  // 清理调研答卷
  if (data.survey_responses) {
    data.survey_responses = data.survey_responses.filter(r => r.surveyId !== id);
  }

  // 解除培训关联
  if (data.training_events) {
    data.training_events.forEach(t => {
      if (t.linkedSurveyId === id) t.linkedSurveyId = null;
    });
  }

  // 清理培训-调研关联表
  if (data.training_surveys) {
    data.training_surveys = data.training_surveys.filter(r => r.surveyId !== id);
  }

  if (writeData(data)) {
    res.json({ success: true, message: '调研已删除，关联数据已清理' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
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
        levelName: '见习讲师',
        avatar: '',
        intro: app.intro || '',
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
        r => String(r.userId) === String(currentUser.id) && String(r.noticeId) === String(notice.id)
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
      r => String(r.userId) === String(currentUser.id) && r.noticeId === noticeId
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
    // 处理个人通知（兼容数字 ID、notification_ 前缀 ID、nt- 前缀字符串 ID 等）
    const rawId = notificationId.startsWith('notification_')
      ? notificationId.slice('notification_'.length)
      : notificationId;
    const notification = data.notifications.find(n => String(n.id) === String(rawId));

    if (notification && String(notification.userId) === String(currentUser.id)) {
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
        r => String(r.userId) === String(currentUser.id) && r.noticeId === noticeId
      );
      if (!existingRead) {
        data.notification_reads.push({
          userId: currentUser.id,
          noticeId: noticeId,
          readAt: new Date().toISOString()
        });
      }
    } else {
      // 兼容数字 ID、notification_ 前缀 ID、nt- 前缀字符串 ID 等
      const rawId = id.startsWith('notification_')
        ? id.slice('notification_'.length)
        : id;
      const notification = data.notifications.find(
        n => String(n.id) === String(rawId) && String(n.userId) === String(currentUser.id)
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
    if (String(n.userId) !== String(currentUser.id)) return true;  // 保留其他用户的
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

  const notificationId = req.params.id;
  if (!notificationId) {
    return res.status(400).json({ success: false, error: '无效的通知ID' });
  }

  const data = readData();
  initNotificationsData(data);

  // 兼容数字 ID、notification_ 前缀 ID、nt- 前缀字符串 ID 等
  const rawId = notificationId.startsWith('notification_')
    ? notificationId.slice('notification_'.length)
    : notificationId;
  const index = data.notifications.findIndex(
    n => String(n.id) === String(rawId) && String(n.userId) === String(currentUser.id)
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

// DELETE /api/categories/:id - 删除分类（递归子分类、校验课程引用）
app.delete('/api/categories/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  if (!data.course_categories) {
    return res.status(404).json({ success: false, error: '分类列表不存在' });
  }

  const categoryIndex = data.course_categories.findIndex(c => c.id === id);
  if (categoryIndex === -1) {
    return res.status(404).json({ success: false, error: '分类不存在' });
  }

  const category = data.course_categories[categoryIndex];

  // 递归收集该分类及其所有子分类 ID
  const collectSubIds = (cat) => {
    const ids = [cat.id];
    (cat.children || []).forEach(child => {
      ids.push(child.id);
    });
    return ids;
  };
  const removedIds = new Set(collectSubIds(category));

  // 校验：被删分类或子分类下是否存在课程
  const hasCourses = (data.management_courses || []).some(c =>
    removedIds.has(c.categoryId) || removedIds.has(c.subcategoryId)
  );
  if (hasCourses) {
    return res.status(400).json({ success: false, error: '该分类或其子分类下存在课程，无法删除' });
  }

  // 移除分类
  data.course_categories.splice(categoryIndex, 1);

  // 兜底：将命中分类/子分类的课程 categoryId/subcategoryId 置空
  (data.management_courses || []).forEach(c => {
    if (removedIds.has(c.categoryId)) c.categoryId = null;
    if (removedIds.has(c.subcategoryId)) c.subcategoryId = null;
  });

  if (writeData(data)) {
    res.json({ success: true, message: '分类已删除' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
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
  
  const levelMap = { senior: '高级讲师', intermediate: '中级讲师', junior: '初级讲师', intern: '见习讲师' };
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
      const targetDir = path.join(uploadsDir, 'user-avatars');
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
    const newAvatarUrl = `/uploads/user-avatars/${req.file.filename}`;
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
  // multer 默认按 latin1 解析原始文件名，此处恢复为 UTF-8
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.filename,
    originalName: originalName,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

// POST /api/upload/multiple - 批量上传文件
app.post('/api/upload/multiple', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: '没有文件上传' });
  }

  // 前端会额外传入 originalNames 字段，避免 multer 解析编码问题
  const originalNames = req.body && req.body.originalNames;
  const nameList = Array.isArray(originalNames) ? originalNames : (originalNames ? [originalNames] : []);

  const files = req.files.map((file, i) => {
    let originalName = '';
    if (nameList[i]) {
      try {
        originalName = decodeURIComponent(nameList[i]);
      } catch (e) {
        originalName = nameList[i];
      }
    }
    if (!originalName) {
      // 降级：尝试从 multer 的 originalname 恢复 UTF-8
      originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    }
    return {
      url: `/uploads/${req.query.type || 'misc'}/${file.filename}`,
      filename: file.filename,
      originalName: originalName,
      size: file.size,
      mimetype: file.mimetype
    };
  });

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
// 试卷管理 API
// ============================================================

// GET /api/papers - 试卷列表
app.get('/api/papers', (req, res) => {
  const data = readData();
  let papers = (data.papers || []).slice();
  const { keyword, categoryId, type } = req.query;
  if (keyword) {
    const k = String(keyword).toLowerCase();
    papers = papers.filter(p => (p.name || '').toLowerCase().includes(k));
  }
  if (categoryId) {
    papers = papers.filter(p => String(p.categoryId) === String(categoryId));
  }
  if (type) {
    papers = papers.filter(p => p.type === type);
  }
  res.json({ success: true, data: papers });
});

// GET /api/papers/:id - 试卷详情
app.get('/api/papers/:id', (req, res) => {
  const data = readData();
  const id = req.params.id;
  const paper = (data.papers || []).find(p => String(p.id) === String(id));
  if (!paper) return res.status(404).json({ success: false, error: '试卷不存在' });
  res.json({ success: true, data: paper });
});

// POST /api/papers - 创建试卷
app.post('/api/papers', (req, res) => {
  const data = readData();
  if (!data.papers) data.papers = [];
  const payload = req.body || {};
  if (!payload.name) {
    return res.status(400).json({ success: false, error: '试卷名称为必填项' });
  }
  const now = new Date().toISOString();
  const paper = {
    id: payload.id || ('paper-' + Date.now()),
    name: payload.name,
    categoryId: payload.categoryId || null,
    categoryName: payload.categoryName || '',
    type: payload.type || 'fixed',
    description: payload.description || '',
    questions: payload.questions || [],
    totalScore: payload.totalScore || 0,
    status: payload.status || 'enabled',
    creator: payload.creator || payload.createdBy || '管理员',
    createdBy: payload.createdBy || payload.creator || '管理员',
    createdAt: payload.createdAt || now,
    updatedAt: now
  };
  data.papers.push(paper);
  if (writeData(data)) {
    res.status(201).json({ success: true, data: paper });
  } else {
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// PUT /api/papers/:id - 更新试卷
app.put('/api/papers/:id', (req, res) => {
  const data = readData();
  const id = req.params.id;
  const index = (data.papers || []).findIndex(p => String(p.id) === String(id));
  if (index === -1) return res.status(404).json({ success: false, error: '试卷不存在' });
  const updates = { ...req.body, updatedAt: new Date().toISOString() };
  delete updates.id;
  delete updates.createdAt;
  data.papers[index] = { ...data.papers[index], ...updates };
  if (writeData(data)) {
    res.json({ success: true, data: data.papers[index] });
  } else {
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// DELETE /api/papers/:id - 删除试卷（清理题目图片、解除考试引用）
app.delete('/api/papers/:id', (req, res) => {
  const data = readData();
  const id = req.params.id;
  const papers = data.papers || [];
  const index = papers.findIndex(p => String(p.id) === String(id));
  if (index === -1) return res.status(404).json({ success: false, error: '试卷不存在' });

  const paper = papers[index];

  // 删除试卷题目中的图片（若试卷内嵌题目对象包含图片字段）
  (paper.questions || []).forEach(q => {
    collectQuestionFiles(q).forEach(url => tryDeleteUploadFile(url, `paper:${id}:question:${q.questionId || q.id}`));
  });

  // 解除考试对试卷的引用
  if (data.exams) {
    data.exams.forEach(e => {
      if (String(e.paperId) === String(id)) {
        e.paperId = null;
        e.paperName = null;
      }
    });
  }

  papers.splice(index, 1);
  data.papers = papers;

  if (writeData(data)) {
    res.json({ success: true, message: '试卷已删除，关联引用已清理' });
  } else {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// ============================================================
// 证书管理 REST API
// ============================================================

// GET /api/certificates/templates - 内置模板列表（12 套真实 PNG 模板）
// v1-v6 竖版 + h1-h6 横版，基于 uploads/cert-templates/ 目录下的真实 PNG。
// 元数据（颜色/字体/版式）需与前端 certificate-management.js 的 CERT_TEMPLATES 保持一致；
// 修改时务必同步两端。
const BUILTIN_CERT_TEMPLATES = [
  // ── 竖版（portrait） ──
  { key: 'v1', name: '翠竹', layout: 'portrait', titleColor: '#1a365d', textColor: '#334155', subtitleColor: '#64748b', accentColor: '#2c5282', sealColor: '#c2410c', fontFamily: "'STSong','SimSun','Times New Roman',serif" },
  { key: 'v2', name: '白玉', layout: 'portrait', titleColor: '#5d4e37', textColor: '#57534e', subtitleColor: '#a8a29e', accentColor: '#78716c', sealColor: '#b45309', fontFamily: "'STFangsong','FangSong','SimSun',serif" },
  { key: 'v3', name: '金辉', layout: 'portrait', titleColor: '#7c5c00', textColor: '#4a3c1a', subtitleColor: '#8b7355', accentColor: '#b8860b', sealColor: '#a16207', fontFamily: "'STKaiti','KaiTi','SimSun',serif" },
  { key: 'v4', name: '墨韵', layout: 'portrait', titleColor: '#1e3a5f', textColor: '#334155', subtitleColor: '#64748b', accentColor: '#1e40af', sealColor: '#be123c', fontFamily: "'STSong','SimSun','Times New Roman',serif" },
  { key: 'v5', name: '蔚蓝', layout: 'portrait', titleColor: '#166534', textColor: '#3f4c3a', subtitleColor: '#6b8068', accentColor: '#15803d', sealColor: '#b45309', fontFamily: "'STSong','SimSun','Times New Roman',serif" },
  { key: 'v6', name: '朝阳', layout: 'portrait', titleColor: '#92400e', textColor: '#4a3c1a', subtitleColor: '#8b7355', accentColor: '#b8860b', sealColor: '#a16207', fontFamily: "'STKaiti','KaiTi','SimSun',serif" },
  // ── 横版（landscape） ──
  { key: 'h1', name: '典藏', layout: 'landscape', titleColor: '#1a365d', textColor: '#334155', subtitleColor: '#64748b', accentColor: '#2c5282', sealColor: '#c2410c', fontFamily: "'STSong','SimSun','Times New Roman',serif" },
  { key: 'h2', name: '锦绣', layout: 'landscape', titleColor: '#5d4e37', textColor: '#57534e', subtitleColor: '#a8a29e', accentColor: '#78716c', sealColor: '#b45309', fontFamily: "'STFangsong','FangSong','SimSun',serif" },
  { key: 'h3', name: '丹霞', layout: 'landscape', titleColor: '#92400e', textColor: '#4a3c1a', subtitleColor: '#8b7355', accentColor: '#b8860b', sealColor: '#a16207', fontFamily: "'STKaiti','KaiTi','SimSun',serif" },
  { key: 'h4', name: '春晒', layout: 'landscape', titleColor: '#166534', textColor: '#3f4c3a', subtitleColor: '#6b8068', accentColor: '#15803d', sealColor: '#b45309', fontFamily: "'STSong','SimSun','Times New Roman',serif" },
  { key: 'h5', name: '银素', layout: 'landscape', titleColor: '#374151', textColor: '#4b5563', subtitleColor: '#6b7280', accentColor: '#4b5563', sealColor: '#b91c1c', fontFamily: "'Microsoft YaHei','PingFang SC',sans-serif" },
  { key: 'h6', name: '紫宸', layout: 'landscape', titleColor: '#5b21b6', textColor: '#3b3654', subtitleColor: '#7e6f9e', accentColor: '#7c3aed', sealColor: '#be185d', fontFamily: "'STSong','SimSun','Times New Roman',serif" }
];
app.get('/api/certificates/templates', (req, res) => {
  // 转为前端模板选择器期望的格式：id/name/layout/style/thumbnail/placeholders
  const data = BUILTIN_CERT_TEMPLATES.map(t => ({
    id: t.key,
    name: t.name,
    layout: t.layout,
    thumbnail: `/uploads/cert-templates/cert-${t.key}.png`,
    style: {
      background: `url('/uploads/cert-templates/cert-${t.key}.png') center/cover no-repeat`,
      borderColor: t.titleColor,
      primaryColor: t.titleColor,
      secondaryColor: t.subtitleColor,
      accentColor: t.accentColor,
      sealColor: t.sealColor,
      fontFamily: t.fontFamily
    },
    placeholders: [
      { key: 'name', label: '姓名', defaultValue: '张三' },
      { key: 'title', label: '证书标题', defaultValue: t.layout === 'portrait' ? '荣誉证书' : '认证证书' },
      { key: 'content', label: '正文', defaultValue: '在本公司工作期间，认真负责，表现优\n秀，现授予 荣誉称号。特发此\n证，以示表彰。' },
      { key: 'company', label: '企业名称', defaultValue: '广州游雁网络科技有限公司' },
      { key: 'date', label: '颁发日期', defaultValue: new Date().toISOString().split('T')[0] }
    ]
  }));
  res.json({ success: true, data });
});

// 辅助：根据 templateId（v1-v6 / h1-h6）查找内置模板元数据
// 渲染时 cert.templateId 必须落在这 12 个键之内，旧版 tpl-* 已被清理。
function getBuiltinTemplate(templateId) {
  if (!templateId) return null;
  const t = BUILTIN_CERT_TEMPLATES.find(x => x.key === templateId);
  if (!t) return null;
  return {
    id: t.key,
    name: t.name,
    layout: t.layout,
    thumbnail: `/uploads/cert-templates/cert-${t.key}.png`,
    style: {
      background: `url('/uploads/cert-templates/cert-${t.key}.png') center/cover no-repeat`,
      borderColor: t.titleColor,
      primaryColor: t.titleColor,
      secondaryColor: t.subtitleColor,
      accentColor: t.accentColor,
      sealColor: t.sealColor,
      fontFamily: t.fontFamily
    }
  };
}

// 证书预览已改为前端（浏览器内 html-to-image）渲染，不再提供 Playwright 服务端预览端点。

const DEFAULT_CERT_COMPANY = '广州游雁网络科技有限公司';

// 兼容旧字段：证书定义由 dept 改为 company 后，部分历史数据仍只存了 dept。
// 读取/返回时自动归一化为 company；写入时清理 dept 字段。
function normalizeCertificate(c) {
  if (!c) return c;
  const company = c.company !== undefined && c.company !== '' ? c.company : (c.dept || DEFAULT_CERT_COMPANY);
  return { ...c, company, dept: undefined };
}

// GET /api/certificates - 证书定义列表
app.get('/api/certificates', (req, res) => {
  const data = readData();
  const { company, status, keyword } = req.query;
  let list = (data.certificates || []).slice();

  if (company) list = list.filter(c => c.company && c.company.includes(company));
  if (status) list = list.filter(c => c.status === status);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    list = list.filter(c => (c.name || '').toLowerCase().includes(k));
  }

  const userCerts = data.user_certificates || [];
  const enriched = list.map(c => {
    const cert = normalizeCertificate(c);
    const issued = userCerts.filter(uc => String(uc.certificateId) === String(c.id));
    const activeCount = issued.filter(uc => uc.status === 'active').length;
    const expiredCount = issued.filter(uc => uc.status === 'expired').length;
    const revokedCount = issued.filter(uc => uc.status === 'revoked').length;
    return { ...cert, activeCount, expiredCount, revokedCount, issuedCount: issued.length };
  });

  res.json({ success: true, data: enriched });
});

// GET /api/certificates/:id - 证书定义详情
app.get('/api/certificates/:id', (req, res) => {
  const data = readData();
  const certificate = (data.certificates || []).find(c => String(c.id) === String(req.params.id));
  if (!certificate) return res.status(404).json({ success: false, error: '证书不存在' });

  const userCerts = (data.user_certificates || []).filter(uc => String(uc.certificateId) === String(certificate.id));
  const activeCount = userCerts.filter(uc => uc.status === 'active').length;
  const expiredCount = userCerts.filter(uc => uc.status === 'expired').length;
  const revokedCount = userCerts.filter(uc => uc.status === 'revoked').length;

  res.json({
    success: true,
    data: { ...normalizeCertificate(certificate), activeCount, expiredCount, revokedCount, issuedCount: userCerts.length }
  });
});

// POST /api/certificates - 创建证书定义
app.post('/api/certificates', (req, res) => {
  const data = readData();
  if (!data.certificates) data.certificates = [];

  const payload = req.body || {};
  if (!payload.name || !payload.templateId) {
    return res.status(422).json({ success: false, error: '证书名称和模板必填' });
  }

  // 校验 templateId：必须是 12 套内置模板之一（v1-v6 竖版 + h1-h6 横版）
  if (!/^[vh]\d$/.test(payload.templateId)) {
    return res.status(422).json({ success: false, error: '模板必须是 12 套内置模板之一（v1-v6 / h1-h6）' });
  }

  // 校验证书编号前缀：必填 + 全局唯一（忽略大小写）
  const newPrefix = (payload.prefix || '').trim();
  if (!newPrefix) {
    return res.status(422).json({ success: false, error: '证书编号前缀必填' });
  }
  const prefixConflict = (data.certificates || []).some(c => (c.prefix || '').trim().toLowerCase() === newPrefix.toLowerCase());
  if (prefixConflict) {
    return res.status(422).json({ success: false, error: `证书编号前缀「${newPrefix}」已存在，请使用唯一前缀` });
  }

  const certificate = {
    id: 'cert-' + Date.now(),
    name: payload.name,
    company: payload.company || DEFAULT_CERT_COMPANY,
    dept: undefined,
    validityType: payload.validityType || 'permanent',
    validityDays: payload.validityType === 'fixed' ? parseInt(payload.validityDays) || 365 : null,
    prefix: payload.prefix || '',
    startNumber: parseInt(payload.startNumber) || 1,
    digits: parseInt(payload.digits) || 4,
    templateId: payload.templateId,
    status: payload.status || 'enabled',
    design: payload.design || null,
    creator: payload.creator || '许志坚',
    createdAt: new Date().toISOString()
  };
  data.certificates.push(certificate);
  writeData(data);
  res.json({ success: true, data: certificate });
});

// PUT /api/certificates/:id - 更新证书定义
app.put('/api/certificates/:id', (req, res) => {
  const data = readData();
  const index = (data.certificates || []).findIndex(c => String(c.id) === String(req.params.id));
  if (index === -1) return res.status(404).json({ success: false, error: '证书不存在' });

  const payload = req.body || {};
  const certificate = data.certificates[index];

  if (payload.name !== undefined) certificate.name = payload.name;
  if (payload.company !== undefined) {
    certificate.company = payload.company;
    delete certificate.dept;
  }
  if (payload.validityType !== undefined) certificate.validityType = payload.validityType;
  if (payload.validityType === 'fixed') {
    certificate.validityDays = parseInt(payload.validityDays) || 365;
  } else {
    certificate.validityDays = null;
  }
  if (payload.prefix !== undefined) {
    const updPrefix = (payload.prefix || '').trim();
    if (!updPrefix) {
      return res.status(422).json({ success: false, error: '证书编号前缀必填' });
    }
    const prefixConflict = (data.certificates || []).some(c =>
      String(c.id) !== String(certificate.id) && (c.prefix || '').trim().toLowerCase() === updPrefix.toLowerCase()
    );
    if (prefixConflict) {
      return res.status(422).json({ success: false, error: `证书编号前缀「${updPrefix}」已存在，请使用唯一前缀` });
    }
    certificate.prefix = payload.prefix;
    delete certificate.dept;
  }
  if (payload.startNumber !== undefined) certificate.startNumber = parseInt(payload.startNumber) || 1;
  if (payload.digits !== undefined) certificate.digits = parseInt(payload.digits) || 4;
  if (payload.templateId !== undefined) certificate.templateId = payload.templateId;
  if (payload.design !== undefined) certificate.design = payload.design;
  if (payload.status !== undefined) certificate.status = payload.status;

  writeData(data);
  res.json({ success: true, data: certificate });
});

// DELETE /api/certificates/:id - 删除证书定义（同时清理已颁发的关联记录）
app.delete('/api/certificates/:id', (req, res) => {
  const data = readData();
  const index = (data.certificates || []).findIndex(c => String(c.id) === String(req.params.id));
  if (index === -1) return res.status(404).json({ success: false, error: '证书不存在' });

  const cert = data.certificates[index];
  const issued = (data.user_certificates || []).filter(uc => String(uc.certificateId) === String(req.params.id));

  // 删除时同时清理该证书的所有颁发记录及其 PNG 图片
  let cleaned = 0;
  if (issued.length > 0 && data.user_certificates) {
    const beforeLen = data.user_certificates.length;
    // 先清理图片文件
    issued.forEach(uc => {
      if (uc.imageUrl) {
        tryDeleteUploadFile(uc.imageUrl, `certificate:${req.params.id}:uc:${uc.id}`);
      }
    });
    data.user_certificates = data.user_certificates.filter(uc => String(uc.certificateId) !== String(req.params.id));
    cleaned = beforeLen - data.user_certificates.length;
  }

  // 解除考试对该证书的引用
  (data.exams || []).forEach(e => {
    if (String(e.certificateId) === String(req.params.id)) e.certificateId = null;
  });

  // 清理与该证书相关的通知
  if (data.notifications) {
    data.notifications = data.notifications.filter(n => String(n.certificateId) !== String(req.params.id));
  }

  data.certificates.splice(index, 1);
  writeData(data);
  res.json({
    success: true,
    message: `「${cert.name}」已删除${cleaned > 0 ? `，同时清理了 ${cleaned} 条颁发记录` : ''}`
  });
});

// POST /api/certificates/:id/issue - 手动/批量颁发证书
app.post('/api/certificates/:id/issue', async (req, res) => {
  const data = readData();
  const certificate = (data.certificates || []).find(c => String(c.id) === String(req.params.id));
  if (!certificate) return res.status(404).json({ success: false, error: '证书不存在' });

  const { userIds, sourceType, sourceId } = req.body || {};
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(422).json({ success: false, error: '请选择要颁发的学员' });
  }

  const results = [];
  const errors = [];
  const now = Date.now();
  initNotificationsData(data);
  for (let idx = 0; idx < userIds.length; idx++) {
    const uid = userIds[idx];
    try {
      const result = await issueCertificateInternal(data, certificate.id, uid, sourceType || 'manual', sourceId || null);
      if (result.success) {
        results.push(result.data);
        data.notifications.push({
          id: 'nt-' + now + '-' + idx,
          userId: String(uid),
          title: '恭喜您获得证书',
          content: `您已获得《${certificate.name}》证书，证书编号：${result.data.certNo}。请在个人中心-我的证书查看。`,
          type: 'certificate',
          certificateId: String(certificate.id),
          userCertificateId: String(result.data.id),
          read: false,
          createdAt: new Date().toISOString()
        });
      } else {
        errors.push({ userId: uid, error: result.error });
      }
    } catch (e) {
      errors.push({ userId: uid, error: e.message || '颁发异常' });
    }
  }

  writeData(data);
  res.json({ success: true, data: results, errors });
});

// GET /api/user-certificates - 用户证书实例列表
app.get('/api/user-certificates', async (req, res) => {
  const data = readData();
  const { userId, certificateId, status } = req.query;
  let list = (data.user_certificates || []).slice();

  if (userId) list = list.filter(uc => String(uc.userId) === String(userId));
  if (certificateId) list = list.filter(uc => String(uc.certificateId) === String(certificateId));
  if (status) list = list.filter(uc => uc.status === status);

  // 过期状态自动修正
  list.forEach(uc => {
    if (uc.status === 'active' && uc.expireAt && new Date(uc.expireAt) < new Date()) {
      uc.status = 'expired';
    }
  });

  const certificates = data.certificates || [];
  const templates = data.certificate_templates || [];
  const users = data.registered_users || [];
  const enriched = await Promise.all(list.map(async uc => {
    const cert = certificates.find(c => String(c.id) === String(uc.certificateId)) || {};
    const template = getBuiltinTemplate(cert.templateId);
    const user = users.find(u => String(u.id) === String(uc.userId)) || {};
    // 为生成图片补充临时用户信息
    uc.userName = user.realName || user.username || '';
    uc.company = uc.company || cert.company || DEFAULT_CERT_COMPANY;
    uc.userDepartment = uc.company; // 兼容旧字段
    const imageUrl = await ensureCertificateImage(data, uc);
    return {
      ...uc,
      certificateName: cert.name || '',
      templateId: cert.templateId || '',
      template,
      design: cert.design || null,
      userName: uc.userName,
      company: uc.company,
      userDepartment: uc.company, // 兼容旧字段
      userPosition: user.position || '',
      imageUrl
    };
  }));

  res.json({ success: true, data: enriched });
});

// GET /api/user-certificates/:id - 用户证书实例详情
app.get('/api/user-certificates/:id', async (req, res) => {
  const data = readData();
  const uc = (data.user_certificates || []).find(u => String(u.id) === String(req.params.id));
  if (!uc) return res.status(404).json({ success: false, error: '证书记录不存在' });

  const cert = (data.certificates || []).find(c => String(c.id) === String(uc.certificateId)) || {};
  const user = (data.registered_users || []).find(u => String(u.id) === String(uc.userId)) || {};
  uc.userName = user.realName || user.username || '';
  uc.company = uc.company || cert.company || DEFAULT_CERT_COMPANY;
  uc.userDepartment = uc.company; // 兼容旧字段
  const imageUrl = await ensureCertificateImage(data, uc);
  res.json({
    success: true,
    data: {
      ...uc,
      certificateName: cert.name || '',
      template: getBuiltinTemplate(cert.templateId),
      design: cert.design || null,
      userName: uc.userName,
      company: uc.company,
      userDepartment: uc.company, // 兼容旧字段
      userPosition: user.position || '',
      imageUrl
    }
  });
});

// GET /api/user-certificates/:id/image - 直接获取/生成证书图片
app.get('/api/user-certificates/:id/image', async (req, res) => {
  const data = readData();
  const uc = (data.user_certificates || []).find(u => String(u.id) === String(req.params.id));
  if (!uc) return res.status(404).json({ success: false, error: '证书记录不存在' });

  const cert = (data.certificates || []).find(c => String(c.id) === String(uc.certificateId)) || {};
  const user = (data.registered_users || []).find(u => String(u.id) === String(uc.userId)) || {};
  uc.userName = user.realName || user.username || '';
  uc.company = uc.company || cert.company || DEFAULT_CERT_COMPANY;
  uc.userDepartment = uc.company; // 兼容旧字段
  const imageUrl = await ensureCertificateImage(data, uc);
  // 新架构下证书 PNG 由前端（浏览器内 html-to-image）生成；服务端仅返回已落盘的历史图片。
  // 无图时返回 404，前端会自动回退到客户端生成，避免产生 500 噪音。
  if (!imageUrl) return res.status(404).json({ success: false, error: '证书图片未生成（前端将自动渲染）' });
  res.redirect(imageUrl);
});

// POST /api/user-certificates/:id/image - 接收前端（浏览器内 html-to-image）渲染的证书 PNG 并落盘持久化
// 实现"首次加载渲染一次 → 永久保存至项目文件"，后续打开直接读取磁盘图片，避免重复渲染/大数据量性能问题。
// 管理员删除证书记录时，DELETE /api/certificates/:id 会经 tryDeleteUploadFile 清理该图片文件。
app.post('/api/user-certificates/:id/image', (req, res) => {
  const data = readData();
  const uc = (data.user_certificates || []).find(u => String(u.id) === String(req.params.id));
  if (!uc) return res.status(404).json({ success: false, error: '证书记录不存在' });

  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return res.status(400).json({ success: false, error: '缺少有效的图片数据' });
  }
  const matches = dataUrl.match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/);
  if (!matches) return res.status(400).json({ success: false, error: '图片格式不支持' });

  const imagePath = getCertificateImagePath(uc.id); // uploads/certificates/{id}.png
  try {
    if (!fs.existsSync(CERT_IMAGE_DIR)) fs.mkdirSync(CERT_IMAGE_DIR, { recursive: true });
    fs.writeFileSync(imagePath, Buffer.from(matches[1], 'base64'));
    const url = `/uploads/certificates/${uc.id}.png`;
    uc.imageUrl = url;
    writeData(data);
    console.log(`[证书图片已落盘][uc:${uc.id}] ${imagePath}`);
    res.json({ success: true, data: { imageUrl: url } });
  } catch (e) {
    console.error('[证书图片落盘失败]', e);
    res.status(500).json({ success: false, error: '保存证书图片失败' });
  }
});

// POST /api/user-certificates/:id/revoke - 撤销证书（硬删除颁发记录+图片，保留撤销日志）
app.post('/api/user-certificates/:id/revoke', (req, res) => {
  const data = readData();
  const ucs = data.user_certificates || [];
  const idx = ucs.findIndex(u => String(u.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, error: '证书记录不存在' });
  const uc = ucs[idx];
  if (uc.status !== 'active') return res.status(400).json({ success: false, error: '仅可撤销有效状态的证书' });

  // 1. 删除证书图片文件（标准路径 + imageUrl 指向的历史文件）
  try {
    if (uc.imageUrl) {
      const p = path.join(uploadsDir, String(uc.imageUrl).replace(/^\/uploads\//, ''));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const stdPath = getCertificateImagePath(uc.id);
    if (fs.existsSync(stdPath)) fs.unlinkSync(stdPath);
  } catch (e) {
    console.warn('[撤销] 删除证书图片失败:', e.message);
  }

  // 2. 补全撤销日志所需信息
  const user = (data.registered_users || []).find(u => String(u.id) === String(uc.userId)) || {};
  const certDef = (data.certificates || []).find(c => String(c.id) === String(uc.certificateId)) || {};
  if (!data.certificate_revoke_logs) data.certificate_revoke_logs = [];
  const log = {
    id: 'rvk-' + Date.now() + '-' + Math.round(Math.random() * 1e9),
    userCertId: uc.id,
    userId: uc.userId,
    userName: uc.userName || user.realName || user.username || String(uc.userId),
    certificateId: uc.certificateId,
    certificateName: uc.certificateName || certDef.name || '',
    certNo: uc.certNo || '',
    company: uc.company || certDef.company || DEFAULT_CERT_COMPANY,
    sourceType: uc.sourceType || '',
    issueAt: uc.issueAt || null,
    revokedAt: new Date().toISOString(),
    reason: req.body?.reason || '',
    operator: req.body?.operator || '管理员'
  };
  data.certificate_revoke_logs.push(log);

  // 3. 硬删除该颁发记录
  ucs.splice(idx, 1);
  writeData(data);
  res.json({ success: true, data: log });
});

// GET /api/certificate-revoke-logs - 撤销记录列表（支持按 certificateId 过滤）
app.get('/api/certificate-revoke-logs', (req, res) => {
  const data = readData();
  let logs = data.certificate_revoke_logs || [];
  if (req.query.certificateId) {
    logs = logs.filter(l => String(l.certificateId) === String(req.query.certificateId));
  }
  res.json({ success: true, data: logs });
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
  // 初始化证书管理数据
  initCertificateData();
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

