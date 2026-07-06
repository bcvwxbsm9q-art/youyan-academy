/**
 * 证书管理模块预生成 Mock
 * 作用：开发期默认替身，真实 API 就绪后通过切换导入路径替换。
 * 与契约对齐：public/schema/certificate-schema.json
 */

(function (global) {
  'use strict';

  const DEFAULT_TEMPLATES = [
    {
      id: 'tpl-honor-blue',
      name: '蓝色荣誉证书（竖版）',
      layout: 'portrait',
      thumbnail: '',
      style: {
        background: 'linear-gradient(135deg, #f8fbff 0%, #e8f4fc 100%)',
        borderColor: '#1e5a8e',
        primaryColor: '#1e5a8e',
        fontFamily: '"Noto Serif SC", "SimSun", serif'
      },
      placeholders: [
        { key: 'name', label: '姓名', defaultValue: '张三' },
        { key: 'title', label: '证书标题', defaultValue: '荣誉证书' },
        { key: 'content', label: '正文', defaultValue: '表现优异，特发此证，以资鼓励。' },
        { key: 'company', label: '企业名称', defaultValue: '广州游雁网络科技有限公司' },
        { key: 'date', label: '颁发日期', defaultValue: '2026-07-06' }
      ]
    },
    {
      id: 'tpl-completion-gold',
      name: '金色结业证书（横版）',
      layout: 'landscape',
      thumbnail: '',
      style: {
        background: 'linear-gradient(135deg, #fffdf5 0%, #fcf3d8 100%)',
        borderColor: '#bfa05f',
        primaryColor: '#8a6d2f',
        fontFamily: '"Noto Serif SC", "SimSun", serif'
      },
      placeholders: [
        { key: 'name', label: '姓名', defaultValue: '李四' },
        { key: 'title', label: '证书标题', defaultValue: '结业证书' },
        { key: 'content', label: '正文', defaultValue: '已完成全部培训课程，考核合格，准予结业。' },
        { key: 'company', label: '企业名称', defaultValue: '广州游雁网络科技有限公司' },
        { key: 'date', label: '颁发日期', defaultValue: '2026-07-06' }
      ]
    },
    {
      id: 'tpl-excellent-green',
      name: '绿色优秀学员证书（竖版）',
      layout: 'portrait',
      thumbnail: '',
      style: {
        background: 'linear-gradient(135deg, #f5fff8 0%, #e3f5e9 100%)',
        borderColor: '#2d7a4e',
        primaryColor: '#2d7a4e',
        fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif'
      },
      placeholders: [
        { key: 'name', label: '姓名', defaultValue: '王五' },
        { key: 'title', label: '证书标题', defaultValue: '优秀学员证书' },
        { key: 'content', label: '正文', defaultValue: '学习态度认真，成绩突出，被评为优秀学员。' },
        { key: 'company', label: '企业名称', defaultValue: '广州游雁网络科技有限公司' },
        { key: 'date', label: '颁发日期', defaultValue: '2026-07-06' }
      ]
    },
    {
      id: 'tpl-skill-purple',
      name: '紫色技能认证证书（横版）',
      layout: 'landscape',
      thumbnail: '',
      style: {
        background: 'linear-gradient(135deg, #faf8ff 0%, #efe8fc 100%)',
        borderColor: '#6b4c9a',
        primaryColor: '#6b4c9a',
        fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif'
      },
      placeholders: [
        { key: 'name', label: '姓名', defaultValue: '赵六' },
        { key: 'title', label: '证书标题', defaultValue: '技能认证证书' },
        { key: 'content', label: '正文', defaultValue: '已通过相关技能考核，具备相应专业能力。' },
        { key: 'company', label: '企业名称', defaultValue: '广州游雁网络科技有限公司' },
        { key: 'date', label: '颁发日期', defaultValue: '2026-07-06' }
      ]
    }
  ];

  const DEFAULT_CERTIFICATES = [
    {
      id: 'cert-001',
      name: '优秀新员工认证',
      dept: '广州游雁网络科技',
      validityType: 'permanent',
      validityDays: null,
      prefix: 'YX',
      startNumber: 1,
      digits: 4,
      templateId: 'tpl-honor-blue',
      status: 'enabled',
      creator: '许志坚',
      createdAt: '2024-05-11T11:15:00.000Z'
    },
    {
      id: 'cert-002',
      name: '金牌管理员认证',
      dept: '广州游雁网络科技',
      validityType: 'permanent',
      validityDays: null,
      prefix: 'GL',
      startNumber: 1,
      digits: 4,
      templateId: 'tpl-completion-gold',
      status: 'enabled',
      creator: '公司',
      createdAt: '2021-01-24T20:31:00.000Z'
    },
    {
      id: 'cert-003',
      name: '新学员入学认证（示例）',
      dept: '广州游雁网络科技',
      validityType: 'fixed',
      validityDays: 365,
      prefix: 'RX',
      startNumber: 1,
      digits: 4,
      templateId: 'tpl-excellent-green',
      status: 'enabled',
      creator: '公司',
      createdAt: '2019-06-13T15:44:00.000Z'
    }
  ];

  const DEFAULT_USER_CERTIFICATES = [
    {
      id: 'uc-001',
      certificateId: 'cert-001',
      userId: 'u-001',
      certNo: 'YX0001',
      sourceType: 'manual',
      sourceId: null,
      issueAt: '2024-10-14T11:15:00.000Z',
      effectiveAt: '2024-10-14T11:15:00.000Z',
      expireAt: null,
      status: 'active',
      revokedAt: null,
      revokeReason: null
    }
  ];

  // Mock API 响应
  const CertificateMockAPI = {
    getTemplates: () => Promise.resolve({ code: 0, data: DEFAULT_TEMPLATES }),
    getCertificates: () => Promise.resolve({ code: 0, data: DEFAULT_CERTIFICATES }),
    getUserCertificates: () => Promise.resolve({ code: 0, data: DEFAULT_USER_CERTIFICATES }),
    // 统一错误响应示例
    error: (code, msg) => Promise.resolve({ code, message: msg })
  };

  global.CertificateMockAPI = CertificateMockAPI;
  global.CertificateMockData = {
    templates: DEFAULT_TEMPLATES,
    certificates: DEFAULT_CERTIFICATES,
    userCertificates: DEFAULT_USER_CERTIFICATES
  };
})(typeof window !== 'undefined' ? window : global);
