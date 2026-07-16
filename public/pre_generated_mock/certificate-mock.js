/**
 * 证书管理模块预生成 Mock
 * 作用：开发期默认替身，真实 API 就绪后通过切换导入路径替换。
 * 与契约对齐：public/schema/certificate-schema.json
 */

(function (global) {
  'use strict';

  const DEFAULT_TEMPLATES = [
    {
      id: 'tpl-completion-gold',
      name: '金色结业证书（横版）',
      layout: 'landscape',
      thumbnail: '',
      style: {
        background: 'radial-gradient(ellipse at 50% 0%, rgba(191,160,95,0.18) 0%, transparent 60%), radial-gradient(ellipse at 50% 100%, rgba(191,160,95,0.12) 0%, transparent 60%), linear-gradient(135deg, #fffdf5 0%, #fcf6e3 50%, #f9efd0 100%)',
        borderColor: '#bfa05f',
        primaryColor: '#8a6d2f',
        secondaryColor: '#bfa05f',
        accentColor: '#8a6d2f',
        sealColor: '#bfa05f',
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
        background: 'radial-gradient(circle at 80% 20%, rgba(45,122,78,0.12) 0%, transparent 40%), radial-gradient(circle at 20% 80%, rgba(45,122,78,0.08) 0%, transparent 40%), linear-gradient(160deg, #ffffff 0%, #f2fbf5 50%, #e3f5e9 100%)',
        borderColor: '#2d7a4e',
        primaryColor: '#2d7a4e',
        secondaryColor: '#5aa87a',
        accentColor: '#2d7a4e',
        sealColor: '#2d7a4e',
        fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif'
      },
      placeholders: [
        { key: 'name', label: '姓名', defaultValue: '王五' },
        { key: 'title', label: '证书标题', defaultValue: '优秀学员证书' },
        { key: 'content', label: '正文', defaultValue: '学习态度认真，成绩突出，被评为优秀学员。' },
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
      templateId: 'tpl-completion-gold',
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
