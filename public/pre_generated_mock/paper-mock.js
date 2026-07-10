/**
 * 试卷管理模块预生成 Mock
 * 作用：开发期默认替身，真实 API 就绪后通过切换导入路径替换。
 * 与契约对齐：public/schema/paper-schema.json
 * 版本：1.1.0
 */

(function (global) {
  'use strict';

  const DEFAULT_PAPERS = [
    {
      id: 'paper-001',
      name: '示例固定试卷',
      categoryId: '1780974142620',
      categoryName: '技术',
      type: 'fixed',
      description: '用于演示固定试卷结构的示例数据',
      questions: [
        {
          questionId: 1,
          score: 5,
          partialScore: 0,
          order: 0,
          content: '示例单选题题干',
          type: 'single',
          options: [{ label: 'A', text: '选项 A' }, { label: 'B', text: '选项 B' }],
          answer: 'A',
          explanation: '示例解析'
        }
      ],
      totalScore: 5,
      duration: 60,
      passScore: 60,
      maxAttempts: 0,
      shuffle: false,
      showAnswer: true,
      uniformScore: 5,
      status: 'enabled',
      creator: '管理员',
      createdBy: '管理员',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
  ];

  // Mock API 响应
  const PaperMockAPI = {
    getPapers: (keyword, categoryId, type) => Promise.resolve({ code: 0, data: DEFAULT_PAPERS }),
    getPaper: (id) => Promise.resolve({ code: 0, data: DEFAULT_PAPERS.find(p => String(p.id) === String(id)) || null }),
    createPaper: (payload) => Promise.resolve({ code: 0, data: { ...payload, id: payload.id || ('paper-' + Date.now()) } }),
    updatePaper: (id, payload) => Promise.resolve({ code: 0, data: { ...payload, id } }),
    deletePaper: (id) => Promise.resolve({ code: 0, message: '试卷已删除，关联引用已清理' }),
    migrateLocalPapers: (localPapers) => Promise.resolve({ code: 0, migrated: (localPapers || []).length }),
    error: (code, msg) => Promise.resolve({ code, message: msg })
  };

  global.PaperMockAPI = PaperMockAPI;
  global.PaperMockData = {
    papers: DEFAULT_PAPERS
  };
})(typeof window !== 'undefined' ? window : global);
