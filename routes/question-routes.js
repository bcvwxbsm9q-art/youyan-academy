/**
 * 题库和试题管理 API 路由 (v2)
 * 支持：题库CRUD、试题CRUD、批量操作、Excel导入导出
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

// 上传配置
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { question_banks: [], questions: [] };
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

const uploadsDir = path.join(__dirname, '..', 'uploads');

/**
 * 安全删除上传文件
 * @param {string} url - /uploads/{type}/{filename} 格式的路径
 * @param {string} context - 用于日志标注删除上下文
 */
function tryDeleteUploadFile(url, context) {
  if (!url || typeof url !== 'string') return;
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
  // 兜底：递归扫描题目所有字段（含题干/解析富文本里内嵌的 /uploads/ 图片），避免遗漏
  try {
    const blob = JSON.stringify(question);
    const re = /\/uploads\/[^"'\s)\\]+/g;
    let m;
    while ((m = re.exec(blob)) !== null) urls.push(m[0]);
  } catch (e) {}
  return [...new Set(urls)].filter(u => typeof u === 'string' && u.startsWith('/uploads/'));
}

/**
 * 删除试题后，清理所有课程互动视频里引用了这些题的节点
 * （避免从题库删除试题后，互动视频编辑器中仍显示已删的题）
 * @param {Array<number>|Set<number>|number} ids
 * @param {Object} data
 * @returns {number} 清理的节点数
 */
function purgeInteractionNodesForQuestions(ids, data) {
  const idSet = ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : [ids]);
  if (!data || !Array.isArray(data.management_courses)) return 0;
  let removed = 0;
  data.management_courses.forEach(course => {
    if (!course || !Array.isArray(course.videos)) return;
    course.videos.forEach(video => {
      if (!video || !Array.isArray(video.interactionNodes)) return;
      const before = video.interactionNodes.length;
      video.interactionNodes = video.interactionNodes.filter(node => {
        if (!node) return false;
        // 仅处理引用了试题的节点（question / survey 都通过 questionRefs 引用题）
        const refs = Array.isArray(node.questionRefs)
          ? node.questionRefs
          : (node.questionId !== undefined && node.questionId !== null ? [{ questionId: node.questionId }] : null);
        if (!refs) return true; // 知识点等无题引用的节点保留
        const remaining = refs.filter(r => !(r && idSet.has(Number(r.questionId))));
        if (Array.isArray(node.questionRefs)) node.questionRefs = remaining;
        // 题引用全部失效 → 整节点删除
        return remaining.length > 0;
      });
      removed += before - video.interactionNodes.length;
    });
  });
  return removed;
}

/**
 * 清理"孤儿题"：bankId 在现存题库中找不到对应题库的题
 * 场景：创建题时若没选/没找到题库会得到 bankId=0；删完所有题库后这些题仍残留
 * @param {Object} data
 * @returns {number} 清理的题数
 */
function pruneOrphanQuestions(data) {
  if (!data) return 0;
  const banks = data.question_banks || [];
  const validIds = new Set();
  banks.forEach(b => {
    const n = Number(b.id);
    if (!isNaN(n)) validIds.add(n);
  });
  const before = (data.questions || []).length;
  data.questions = (data.questions || []).filter(q => {
    const bid = q.bankId;
    if (bid == null) return false;
    const n = Number(bid);
    return !isNaN(n) && validIds.has(n);
  });
  return before - data.questions.length;
}

const TYPE_NAMES = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };
const DIFF_NAMES = { easy: '简单', medium: '中等', hard: '困难' };

// ========== 题库管理 API ==========

router.get('/question-banks', (req, res) => {
  const data = readData();
  const banks = data.question_banks || [];
  const questions = data.questions || [];

  const enriched = banks.map(bank => {
    const qs = questions.filter(q => q.bankId === bank.id);
    const typeCounts = {};
    qs.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
    return {
      ...bank,
      questionCount: qs.length,
      typeCounts
    };
  });

  res.json({ success: true, data: enriched });
});

router.get('/question-banks/search', (req, res) => {
  const { name, category, date } = req.query;
  const data = readData();
  let banks = data.question_banks || [];
  if (name) banks = banks.filter(b => b.name.includes(name));
  if (category) banks = banks.filter(b => b.category === category);
  if (date) banks = banks.filter(b => (b.createdAt || '').startsWith(date));
  res.json(banks);
});

router.get('/question-banks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const bank = (data.question_banks || []).find(b => b.id === id);
  if (!bank) return res.status(404).json({ success: false, error: '题库不存在' });

  const qs = (data.questions || []).filter(q => q.bankId === id);
  res.json({ success: true, data: { ...bank, questions: qs, questionCount: qs.length } });
});

router.post('/question-banks', (req, res) => {
  const { name, categoryId, description } = req.body;
  if (!name || !categoryId) {
    return res.status(400).json({ success: false, error: '题库名称和分类为必填项' });
  }
  const data = readData();
  const banks = data.question_banks || [];
  const newBank = {
    id: Date.now(),
    name,
    categoryId: parseInt(categoryId),
    description: description || '',
    status: 'active',
    createdBy: '管理员',
    createdAt: new Date().toLocaleString('zh-CN'),
    updatedAt: new Date().toLocaleString('zh-CN')
  };
  banks.push(newBank);
  data.question_banks = banks;
  writeData(data);
  res.status(201).json({ success: true, data: newBank });
});

router.put('/question-banks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  const data = readData();
  const banks = data.question_banks || [];
  const index = banks.findIndex(b => b.id === id);
  if (index === -1) return res.status(404).json({ success: false, error: '题库不存在' });
  
  delete updates.id;
  updates.updatedAt = new Date().toLocaleString('zh-CN');
  banks[index] = { ...banks[index], ...updates };
  data.question_banks = banks;
  writeData(data);
  res.json({ success: true, data: banks[index] });
});

router.delete('/question-banks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  let banks = data.question_banks || [];
  const index = banks.findIndex(b => b.id === id);
  if (index === -1) return res.status(404).json({ success: false, error: '题库不存在' });

  // 删除该题库下所有题目的图片
  const questionsToDelete = (data.questions || []).filter(q => q.bankId === id);
  questionsToDelete.forEach(q => {
    collectQuestionFiles(q).forEach(url => tryDeleteUploadFile(url, `question-bank:${id}:question:${q.id}`));
  });

  // 同时删除该题库下的所有试题
  data.questions = (data.questions || []).filter(q => q.bankId !== id);
  // 清理互动视频里引用了这些题的节点
  purgeInteractionNodesForQuestions(questionsToDelete.map(q => q.id), data);
  banks.splice(index, 1);
  data.question_banks = banks;
  // 兜底：如果删完后没有任何题库了，清理所有 bankId 对不上现存题库的"孤儿题"
  // 避免"删完所有题库但题还在 picker 里"的残留
  if ((data.question_banks || []).length === 0) {
    pruneOrphanQuestions(data);
  }
  writeData(data);
  res.json({ success: true, message: '题库已删除，关联题目及图片已清理' });
});

// ========== 试题管理 API ==========

router.get('/questions', (req, res) => {
  const { bankId, type, difficulty, keyword, page, pageSize } = req.query;
  const data = readData();
  let questions = data.questions || [];

  if (bankId) questions = questions.filter(q => q.bankId === parseInt(bankId));
  if (type && type !== 'all') questions = questions.filter(q => q.type === type);
  if (difficulty && difficulty !== 'all') questions = questions.filter(q => q.difficulty === difficulty);
  if (keyword) {
    const kw = keyword.toLowerCase();
    questions = questions.filter(q =>
      (q.title || '').toLowerCase().includes(kw) || (q.content || '').toLowerCase().includes(kw)
    );
  }

  // 分页
  const pg = parseInt(page) || 1;
  const ps = parseInt(pageSize) || 20;
  const total = questions.length;
  const totalPages = Math.ceil(total / ps);
  const start = (pg - 1) * ps;
  const paged = questions.slice(start, start + ps);

  res.json({ success: true, data: paged, total, totalPages, page: pg, pageSize: ps });
});

router.get('/questions/stats', (req, res) => {
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

router.get('/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const q = (data.questions || []).find(q => q.id === id);
  if (!q) return res.status(404).json({ success: false, error: '试题不存在' });
  res.json({ success: true, data: q });
});

router.post('/questions', (req, res) => {
  const { bankId, type, title, content, options, answer, explanation, analysis, difficulty, score, knowledge } = req.body;
  if (!title && !content) {
    return res.status(400).json({ success: false, error: '题目内容不能为空' });
  }
  const data = readData();
  const questions = data.questions || [];
  const newQ = {
    id: Date.now(),
    bankId: bankId ? parseInt(bankId) : 0,
    type: type || 'single',
    title: (title || content || '').trim(),
    content: (content || title || '').trim(),
    options: options || [],
    answer: answer || '',
    explanation: explanation || analysis || '',
    difficulty: difficulty || 'medium',
    score: score || 5,
    knowledge: knowledge || '',
    createdAt: new Date().toLocaleString('zh-CN'),
    updatedAt: new Date().toLocaleString('zh-CN')
  };
  questions.push(newQ);
  data.questions = questions;
  writeData(data);
  res.status(201).json({ success: true, data: newQ });
});

router.put('/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  const data = readData();
  const questions = data.questions || [];
  const index = questions.findIndex(q => q.id === id);
  if (index === -1) return res.status(404).json({ success: false, error: '试题不存在' });

  delete updates.id;
  delete updates.createdAt;
  updates.updatedAt = new Date().toLocaleString('zh-CN');
  // 兼容字段名映射
  if (updates.explanation && !updates.analysis) updates.analysis = updates.explanation;
  if (updates.analysis && !updates.explanation) updates.explanation = updates.analysis;
  questions[index] = { ...questions[index], ...updates };
  data.questions = questions;
  writeData(data);
  res.json({ success: true, data: questions[index] });
});

router.delete('/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const questions = data.questions || [];
  const index = questions.findIndex(q => q.id === id);
  if (index === -1) return res.status(404).json({ success: false, error: '试题不存在' });

  // 删除题目图片
  collectQuestionFiles(questions[index]).forEach(url => tryDeleteUploadFile(url, `question:${id}`));

  questions.splice(index, 1);
  data.questions = questions;
  // 同时从考试中移除
  if (data.exams) {
    data.exams.forEach(exam => {
      if (exam.questions) exam.questions = exam.questions.filter(q => q.questionId !== id);
    });
  }
  // 清理互动视频里引用了该题的节点
  purgeInteractionNodesForQuestions([id], data);
  writeData(data);
  res.json({ success: true, message: '试题已删除，关联图片已清理' });
});

// 批量删除试题
router.delete('/questions/batch', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'ID列表不能为空' });
  }
  const data = readData();
  const idSet = new Set(ids);

  // 删除待删题目的图片
  const questionsToDelete = (data.questions || []).filter(q => idSet.has(q.id));
  questionsToDelete.forEach(q => {
    collectQuestionFiles(q).forEach(url => tryDeleteUploadFile(url, `question-batch:${q.id}`));
  });

  data.questions = (data.questions || []).filter(q => !idSet.has(q.id));
  if (data.exams) {
    data.exams.forEach(exam => {
      if (exam.questions) exam.questions = exam.questions.filter(q => !idSet.has(q.questionId));
    });
  }
  // 清理互动视频里引用了这些题的节点
  purgeInteractionNodesForQuestions(ids, data);
  writeData(data);
  res.json({ success: true, deleted: ids.length, message: '试题已删除，关联图片已清理' });
});

// 批量创建试题
router.post('/questions/batch', (req, res) => {
  const { bankId, questions: batch } = req.body;
  if (!batch || !Array.isArray(batch) || batch.length === 0) {
    return res.status(400).json({ success: false, error: '题目列表不能为空' });
  }
  const data = readData();
  const questions = data.questions || [];
  let added = 0;
  batch.forEach((q, i) => {
    questions.push({
      id: Date.now() + i,
      bankId: parseInt(bankId) || 0,
      type: q.type || 'single',
      title: (q.title || q.content || '').trim(),
      content: (q.content || q.title || '').trim(),
      options: q.options || [],
      answer: q.answer || '',
      explanation: q.explanation || q.analysis || '',
      analysis: q.analysis || q.explanation || '',
      difficulty: q.difficulty || 'medium',
      score: q.score || 5,
      knowledge: q.knowledge || '',
      createdAt: new Date().toLocaleString('zh-CN'),
      updatedAt: new Date().toLocaleString('zh-CN')
    });
    added++;
  });
  data.questions = questions;
  writeData(data);
  res.json({ success: true, total: added });
});

// ========== Excel 导入 ==========

/**
 * POST /api/questions/import - 导入Excel试题
 * 支持上传 Excel 文件，自动识别5种题型Sheet
 */
router.post('/questions/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '请上传Excel文件' });

    const bankId = parseInt(req.body.bankId) || 0;
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const data = readData();
    const questions = data.questions || [];

    const result = { success: 0, failed: 0, errors: [], importedData: [] };

    // Sheet名称与题型映射（支持常见命名）
    const sheetTypeMap = {
      '单选题': 'single', '单选': 'single',
      '多选题': 'multiple', '多选': 'multiple',
      '判断题': 'judge', '判断': 'judge',
      '填空题': 'fill', '填空': 'fill',
      '简答题': 'essay', '简答': 'essay', '问答题': 'essay'
    };

    for (const sheetName of workbook.SheetNames) {
      // 获取中文 sheet 名（处理乱码）
      const cleanName = sheetName.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
      const type = sheetTypeMatch(sheetName, sheetTypeMap);
      if (!type) continue; // 跳过不匹配的sheet

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

      // 跳过前3行（说明行+表头行）
      const dataRows = rows.slice(3).filter(row => row[0] !== null && row[0] !== undefined && String(row[0]).trim() !== '');

      for (const row of dataRows) {
        try {
          const q = parseQuestionRow(row, type);
          if (q) {
            q.bankId = bankId;
            q.id = Date.now() + questions.length + result.success;
            q.createdAt = new Date().toLocaleString('zh-CN');
            q.updatedAt = new Date().toLocaleString('zh-CN');
            questions.push(q);
            result.importedData.push(q);
            result.success++;
          }
        } catch (e) {
          result.failed++;
          result.errors.push(`[${cleanName}] 第${row[0]}题: ${e.message}`);
        }
      }
    }

    data.questions = questions;
    writeData(data);
    res.json({ success: true, imported: result.success, failed: result.failed, errors: result.errors, importedData: result.importedData });
  } catch (e) {
    console.error('Excel导入失败:', e);
    res.status(500).json({ success: false, error: '文件解析失败: ' + e.message });
  }
});

// ========== Excel 导出 ==========

router.get('/questions/export', (req, res) => {
  try {
    const { bankId } = req.query;
    const data = readData();
    let questions = data.questions || [];
    if (bankId) questions = questions.filter(q => q.bankId === parseInt(bankId));

    const wb = XLSX.utils.book_new();

    // 按题型分组
    const byType = { single: [], multiple: [], judge: [], fill: [], essay: [] };
    questions.forEach(q => { if (byType[q.type]) byType[q.type].push(q); });

    // 单选题
    if (byType.single.length > 0) {
      const header = ['编号', '题目', '正确答案', 'A', 'B', 'C', 'D', 'E', 'F', '知识点', '难度', '答案解析'];
      const rows = byType.single.map((q, i) => {
        const opts = q.options || [];
        return [i + 1, q.title, q.answer, ...opts.slice(0, 6), ...Array(Math.max(0, 6 - opts.length)).fill(''),
          q.knowledge || '', q.difficulty, q.explanation || ''];
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, '单选题');
    }

    // 多选题
    if (byType.multiple.length > 0) {
      const header = ['编号', '题目', '正确答案', 'A', 'B', 'C', 'D', 'E', 'F', '知识点', '难度', '答案解析'];
      const rows = byType.multiple.map((q, i) => {
        const opts = q.options || [];
        const ans = Array.isArray(q.answer) ? q.answer.join('') : q.answer;
        return [i + 1, q.title, ans, ...opts.slice(0, 6), ...Array(Math.max(0, 6 - opts.length)).fill(''),
          q.knowledge || '', q.difficulty, q.explanation || ''];
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, '多选题');
    }

    // 判断题
    if (byType.judge.length > 0) {
      const header = ['编号', '题目', '正确答案', '知识点', '难度', '答案解析'];
      const rows = byType.judge.map((q, i) => [i + 1, q.title, q.answer, q.knowledge || '', q.difficulty, q.explanation || '']);
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, '判断题');
    }

    // 填空题
    if (byType.fill.length > 0) {
      const header = ['编号', '题目', '答案', '知识点', '难度', '答案解析'];
      const rows = byType.fill.map((q, i) => [i + 1, q.title, 
        Array.isArray(q.answer) ? q.answer.join('/') : q.answer, 
        q.knowledge || '', q.difficulty, q.explanation || '']);
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, '填空题');
    }

    // 简答题
    if (byType.essay.length > 0) {
      const header = ['编号', '题目', '参考答案', '知识点', '难度', '答案解析'];
      const rows = byType.essay.map((q, i) => [i + 1, q.title, 
        Array.isArray(q.answer) ? q.answer.join('/') : q.answer,
        q.knowledge || '', q.difficulty, q.explanation || '']);
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, '简答题');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=题库导出.xlsx');
    res.send(buf);
  } catch (e) {
    console.error('导出失败:', e);
    res.status(500).json({ success: false, error: '导出失败' });
  }
});

// ========== 辅助函数 ==========

function sheetTypeMatch(sheetName, map) {
  for (const [key, type] of Object.entries(map)) {
    if (sheetName.includes(key)) return type;
  }
  return null;
}

function parseQuestionRow(row, type) {
  if (!row || row.length === 0) return null;

  switch (type) {
    case 'single':
    case 'multiple': {
      // 列：0=编号, 1=题目, 2=正确答案, 3-14=选项ABCDEFGHIJKL, 15=知识点, 16=难度, 17=答案解析
      const title = row[1];
      if (!title || String(title).trim() === '') return null;
      const answer = String(row[2] || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
      if (!answer) return null;

      // 收集非空选项
      const options = [];
      for (let i = 3; i <= 14; i++) {
        const opt = row[i];
        if (opt !== null && opt !== undefined && String(opt).trim() !== '') {
          options.push(String(opt).trim());
        }
      }

      // 获取难度（中文映射）
      const diffRaw = String(row[16] || '').trim();
      const difficulty = ({ '简单': 'easy', '易': 'easy', '中等': 'medium', '中': 'medium', '困难': 'hard', '难': 'hard' })[diffRaw] || 'medium';

      return {
        type,
        title: String(title).trim(),
        content: String(title).trim(),
        options,
        answer: type === 'multiple' ? answer.split('').filter(a => a) : answer,
        explanation: String(row[17] || row[18] || '').trim(),
        analysis: String(row[17] || row[18] || '').trim(),
        difficulty,
        knowledge: String(row[15] || '').trim(),
        score: type === 'multiple' ? 5 : 3
      };
    }

    case 'judge': {
      // 列：0=编号, 1=题目, 2=正确答案(对/错), 3=知识点, 4=难度, 5=答案解析
      const title = row[1];
      if (!title || String(title).trim() === '') return null;
      const ansRaw = String(row[2] || '').trim();
      const answer = ansRaw === '对' || ansRaw === '正确' || ansRaw === '√' || ansRaw === 'true' || ansRaw === 'TRUE' ? '正确' : '错误';
      
      const diffRaw = String(row[4] || '').trim();
      const difficulty = ({ '简单': 'easy', '易': 'easy', '中等': 'medium', '中': 'medium', '困难': 'hard', '难': 'hard' })[diffRaw] || 'medium';

      return {
        type: 'judge',
        title: String(title).trim(),
        content: String(title).trim(),
        options: ['正确', '错误'],
        answer,
        explanation: String(row[5] || '').trim(),
        analysis: String(row[5] || '').trim(),
        difficulty,
        knowledge: String(row[3] || '').trim(),
        score: 2
      };
    }

    case 'fill': {
      // 列：0=编号, 1=题目, 2-13=空1-12, 14=知识点, 15=难度, 16=答案解析
      const title = row[1];
      if (!title || String(title).trim() === '') return null;
      const blanks = [];
      for (let i = 2; i <= 13; i++) {
        if (row[i] !== null && row[i] !== undefined && String(row[i]).trim() !== '') {
          blanks.push(String(row[i]).trim());
        }
      }

      const diffRaw = String(row[15] || '').trim();
      const difficulty = ({ '简单': 'easy', '易': 'easy', '中等': 'medium', '中': 'medium', '困难': 'hard', '难': 'hard' })[diffRaw] || 'medium';

      return {
        type: 'fill',
        title: String(title).trim(),
        content: String(title).trim(),
        options: [],
        answer: blanks.length === 1 ? blanks[0] : blanks,
        explanation: String(row[16] || '').trim(),
        analysis: String(row[16] || '').trim(),
        difficulty,
        knowledge: String(row[14] || '').trim(),
        score: 3
      };
    }

    case 'essay': {
      // 列：0=编号, 1=题目, 2-13=关键词, 14=知识点, 15=难度, 16=答案解析
      const title = row[1];
      if (!title || String(title).trim() === '') return null;
      const keywords = [];
      for (let i = 2; i <= 13; i++) {
        if (row[i] !== null && row[i] !== undefined && String(row[i]).trim() !== '') {
          keywords.push(String(row[i]).trim());
        }
      }

      const diffRaw = String(row[15] || '').trim();
      const difficulty = ({ '简单': 'easy', '易': 'easy', '中等': 'medium', '中': 'medium', '困难': 'hard', '难': 'hard' })[diffRaw] || 'medium';

      return {
        type: 'essay',
        title: String(title).trim(),
        content: String(title).trim(),
        options: [],
        answer: keywords.length === 1 ? keywords[0] : keywords,
        explanation: String(row[16] || '').trim(),
        analysis: String(row[16] || '').trim(),
        difficulty,
        knowledge: String(row[14] || '').trim(),
        score: 10
      };
    }

    default:
      return null;
  }
}

module.exports = router;
