/**
 * 题库和试题管理 API 路由
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

// 读取数据
function readData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return { question_banks: [], questions: [] };
    }
}

// 写入数据
function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('写入数据失败:', e.message);
        return false;
    }
}

// ========== 题库管理 API ==========

/**
 * GET /api/question-banks - 获取所有题库
 */
router.get('/question-banks', (req, res) => {
    const data = readData();
    const banks = data.question_banks || [];
    
    // 统计每个题库的试题数量
    const questions = data.questions || [];
    const banksWithCount = banks.map(bank => ({
        ...bank,
        questionCount: questions.filter(q => q.bankId === bank.id).length
    }));
    
    res.json(banksWithCount);
});

/**
 * GET /api/question-banks/search - 搜索题库
 */
router.get('/question-banks/search', (req, res) => {
    const { name, category, date } = req.query;
    const data = readData();
    let banks = data.question_banks || [];

    if (name) {
        banks = banks.filter(b => b.name.includes(name));
    }
    if (category) {
        banks = banks.filter(b => b.category === category);
    }
    if (date) {
        banks = banks.filter(b => b.createdAt.startsWith(date));
    }

    res.json(banks);
});

/**
 * GET /api/question-banks/:id - 获取单个题库详情
 */
router.get('/question-banks/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const data = readData();
    const banks = data.question_banks || [];
    const bank = banks.find(b => b.id === id);

    if (!bank) {
        return res.status(404).json({ error: '题库不存在' });
    }

    // 统计该题库的试题数量
    const questions = data.questions || [];
    const bankWithCount = {
        ...bank,
        questionCount: questions.filter(q => q.bankId === id).length
    };

    res.json(bankWithCount);
});

/**
 * POST /api/question-banks - 创建新题库
 */
router.post('/question-banks', (req, res) => {
    const { name, category, description, status } = req.body;
    
    if (!name || !category) {
        return res.status(400).json({ error: '题库名称和分类为必填项' });
    }

    const data = readData();
    const banks = data.question_banks || [];
    
    const newBank = {
        id: Date.now(),
        name,
        category,
        description: description || '',
        status: status || 'active',
        questionCount: 0,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    banks.push(newBank);
    data.question_banks = banks;

    if (writeData(data)) {
        res.status(201).json(newBank);
    } else {
        res.status(500).json({ error: '保存失败' });
    }
});

/**
 * PUT /api/question-banks/:id - 更新题库
 */
router.put('/question-banks/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const updates = req.body;

    const data = readData();
    const banks = data.question_banks || [];
    const index = banks.findIndex(b => b.id === id);

    if (index === -1) {
        return res.status(404).json({ error: '题库不存在' });
    }

    banks[index] = {
        ...banks[index],
        ...updates,
        updatedAt: new Date().toISOString()
    };

    data.question_banks = banks;

    if (writeData(data)) {
        res.json(banks[index]);
    } else {
        res.status(500).json({ error: '更新失败' });
    }
});

/**
 * DELETE /api/question-banks/:id - 删除题库
 */
router.delete('/question-banks/:id', (req, res) => {
    const id = parseInt(req.params.id);

    const data = readData();
    let banks = data.question_banks || [];
    const index = banks.findIndex(b => b.id === id);

    if (index === -1) {
        return res.status(404).json({ error: '题库不存在' });
    }

    // 同时删除该题库下的所有试题
    let questions = data.questions || [];
    questions = questions.filter(q => q.bankId !== id);
    data.questions = questions;

    banks.splice(index, 1);
    data.question_banks = banks;

    if (writeData(data)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: '删除失败' });
    }
});

// ========== 试题管理 API ==========

/**
 * GET /api/questions - 获取试题列表
 */
router.get('/questions', (req, res) => {
    const { bankId, type, difficulty } = req.query;
    const data = readData();
    let questions = data.questions || [];

    if (bankId) {
        questions = questions.filter(q => q.bankId === parseInt(bankId));
    }
    if (type) {
        questions = questions.filter(q => q.type === type);
    }
    if (difficulty) {
        questions = questions.filter(q => q.difficulty === difficulty);
    }

    res.json(questions);
});

/**
 * GET /api/questions/:id - 获取单个试题详情
 */
router.get('/questions/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const data = readData();
    const questions = data.questions || [];
    const question = questions.find(q => q.id === id);

    if (!question) {
        return res.status(404).json({ error: '试题不存在' });
    }

    res.json(question);
});

/**
 * POST /api/questions - 创建新试题
 */
router.post('/questions', (req, res) => {
    const { bankId, type, content, options, answer, analysis, knowledge, difficulty } = req.body;

    if (!bankId || !type || !content || !answer) {
        return res.status(400).json({ error: '必填项不能为空' });
    }

    const data = readData();
    const questions = data.questions || [];

    const newQuestion = {
        id: Date.now(),
        bankId: parseInt(bankId),
        type,
        content,
        options: options || [],
        answer,
        analysis: analysis || '',
        knowledge: knowledge || '',
        difficulty: difficulty || 'medium',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    questions.push(newQuestion);
    data.questions = questions;

    if (writeData(data)) {
        res.status(201).json(newQuestion);
    } else {
        res.status(500).json({ error: '保存失败' });
    }
});

/**
 * PUT /api/questions/:id - 更新试题
 */
router.put('/questions/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const updates = req.body;

    const data = readData();
    const questions = data.questions || [];
    const index = questions.findIndex(q => q.id === id);

    if (index === -1) {
        return res.status(404).json({ error: '试题不存在' });
    }

    questions[index] = {
        ...questions[index],
        ...updates,
        updatedAt: new Date().toISOString()
    };

    data.questions = questions;

    if (writeData(data)) {
        res.json(questions[index]);
    } else {
        res.status(500).json({ error: '更新失败' });
    }
});

/**
 * DELETE /api/questions/:id - 删除试题
 */
router.delete('/questions/:id', (req, res) => {
    const id = parseInt(req.params.id);

    const data = readData();
    const questions = data.questions || [];
    const index = questions.findIndex(q => q.id === id);

    if (index === -1) {
        return res.status(404).json({ error: '试题不存在' });
    }

    questions.splice(index, 1);
    data.questions = questions;

    if (writeData(data)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: '删除失败' });
    }
});

/**
 * POST /api/questions/import - 导入试题（Excel）
 */
router.post('/questions/import', async (req, res) => {
    // TODO: 实现 Excel 文件解析和导入
    // 需要使用 xlsx 或 exceljs 库
    res.json({ 
        success: 0, 
        failed: 0, 
        error: 'Excel 导入功能需要安装 xlsx 库，请联系管理员配置' 
    });
});

/**
 * GET /api/questions/export - 导出试题（Excel）
 */
router.get('/questions/export', async (req, res) => {
    // TODO: 实现 Excel 文件生成和导出
    res.status(501).json({ error: '导出功能开发中' });
});

module.exports = router;
