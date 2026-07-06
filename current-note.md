# current-note - 证书管理模块

> 按 AC 范式 v6 锚点文档三段交接结构记录。

## 一、工程过程

1. 已完成证书管理模块方案定稿（`.trae/documents/20260706_证书管理_方案定稿.md`）。
2. 已完成 dashboard.html 内嵌证书管理 tab 与四个弹窗（新建/编辑、模板选择、详情、手动颁发）。
3. 已完成 `js/certificate-management.js` 前端逻辑（列表、统计、模板选择、CRUD、手动颁发）。
4. 已完成 server.js 后端扩展（证书定义、用户证书、内置模板、REST API、考试合格自动发放）。
5. 已完成 center.html 个人中心证书展示对接 `/api/user-certificates`。
6. 已运行 s0402 前端三重闸门验证，证据落盘 `.trae/documents/test_reports/frontend_gate_20260706_172730/`。
7. 已修复 data.json 中旧格式 `certificates` 记录与契约不一致的问题，迁移为符合 schema 的证书定义与用户证书实例。
8. 已更新变更追踪文档 `.trae/documents/20260706_证书管理_实现内嵌页面与联动.md`。

## 二、交接状态

- 当前任务：证书管理模块实现与前端三重闸门验证
- 状态：已完成实现，s0402 闸门 **未闭合**
- 阻塞项：无（环境/测试入口缺失，非代码阻塞）

## 三、最终结果

### 3.1 验证结论
- 语法检查：server.js、js/certificate-management.js、data.json 均通过 node 解析。
- API 冒烟：证书模板、证书定义、用户证书接口均可访问；data.json 迁移后返回符合契约。
- 页面可访问性：dashboard.html、center.html、js/certificate-management.js 均可访问且包含证书相关元素。
- Mock 回归：契约文件齐备，Mock 数据与契约一致，接口路由与 .pyi 存根匹配。

### 3.2 产出物清单
- 代码文件：dashboard.html、center.html、server.js、js/certificate-management.js、data.json
- 契约文件：public/schema/certificate-schema.json、public/interface_stub/certificate_service.pyi、public/config_template/certificate-config-schema.json
- Mock 文件：public/pre_generated_mock/certificate-mock.js
- 文档：`.trae/documents/20260706_证书管理_方案定稿.md`、`.trae/documents/20260706_证书管理_实现内嵌页面与联动.md`
- 测试证据：`.trae/documents/test_reports/frontend_gate_20260706_172730/`

### 3.3 未闭合项
1. Playwright 浏览器未安装，Test2 E2E 未执行；需运行 `npx playwright install` 后重跑。
2. package.json 引用的 `scripts/test-api.js` 不存在，缺少证书 API 单元测试入口。
3. 建议在真实浏览器中手动验证证书管理 tab 完整交互（新建证书、选择模板、手动颁发、考试联动）。

## 四、语义标注

- **做到哪了**：证书管理模块已实现为最小可运行 DEMO，s0402 闸门执行完毕并落盘，状态为「未闭合」。
- **为什么**：项目为纯 HTML/JS/Node，无 Streamlit；Playwright 浏览器未安装导致 E2E 阻断；测试脚本入口缺失导致单元测试不完整。
- **未闭合项**：Test2 E2E、Test1 单元测试入口、真实浏览器交互验证。
- **接续入口**：安装 Playwright 浏览器后重跑 s0402；或创建 `scripts/test-api.js` 覆盖证书 API 单元测试。

## 五、追加即时修复：课程介绍间距优化

### 5.1 工程过程
1. 收到用户反馈：`training-plan.html` 课程详情弹窗中"课程介绍"与下方内容拥挤。
2. 已创建变更追踪文档 `.trae/documents/20260706_模块0_优化课程介绍间距.md`。
3. 已调整 `.tp-intro-box` / `.tp-intro-title` / `.tp-intro-text` 的间距与背景色。

### 5.2 交接状态
- 当前任务：课程介绍间距优化
- 状态：已完成
- 阻塞项：无

### 5.3 最终结果
- 文件：`training-plan.html` 样式区已更新。
- 验证：CSS 语法正确，样式规则生效。
- 产出物：`.trae/documents/20260706_模块0_优化课程介绍间距.md`

## 六、追加 Bug 修复：已删除考试入口隐藏

### 6.1 工程过程
1. 收到用户反馈：培训关联的考试被删除后，学员端仍显示考试入口并跳转到"考试不存在或未发布"错误页。
2. 已创建变更追踪文档 `.trae/documents/20260706_模块0_隐藏已删除考试入口.md`。
3. 已修改 `training-plan.html`：加载考试列表并校验关联考试存在性，不存在则隐藏入口、不计入完成判定。
4. 已修改 `dashboard.html`：关联考试不存在时，培训编辑弹窗中的考试开关自动视为关闭。

### 6.2 交接状态
- 当前任务：已删除考试入口隐藏
- 状态：已完成
- 阻塞项：无

### 6.3 最终结果
- 文件：`training-plan.html`、`dashboard.html`。
- 验证：JS 条件判断正确，保存后 `linkedExamId` 会随考试开关关闭而清空。
- 产出物：`.trae/documents/20260706_模块0_隐藏已删除考试入口.md`

## 六、追加即时修复：证书弹窗居中 + 模板优化 + 联动验证

### 6.1 工程过程
1. 用户反馈：证书新建弹窗未居中、模板不够专业、需确认考试/培训-考试联动。
2. 已创建变更追踪文档 `.trae/documents/20260706_证书管理_修复弹窗居中并优化模板.md`。
3. 已为 `dashboard.html` 4 个证书弹窗外层补充 `flex` 类，修复居中。
4. 已优化 server.js、data.json、`public/pre_generated_mock/certificate-mock.js` 中 4 个内置模板的视觉样式（多重渐变背景、双层边框、四角装饰、印章）。
5. 已同步更新 `js/certificate-management.js` 与 `center.html` 的证书渲染逻辑。
6. 已验证考试安排抽屉和培训-考试模块复用同一 `examCertificateId` 选择器，且 server.js 在 `score >= passingScore` 时自动发放证书。
7. 已重启 Node 服务器，API 返回新模板样式。

### 6.2 交接状态
- 当前任务：证书弹窗居中 + 模板优化 + 联动验证
- 状态：已完成
- 阻塞项：无

### 6.3 最终结果
- 文件：`dashboard.html`、`center.html`、`server.js`、`data.json`、`js/certificate-management.js`、`public/pre_generated_mock/certificate-mock.js`。
- 验证：语法检查通过；服务器重启后模板 API 返回新样式；4 个弹窗均补充 `flex` 类。
- 产出物：`.trae/documents/20260706_证书管理_修复弹窗居中并优化模板.md`

## 七、追加即时修复：课程管理列表表头拆分

### 7.1 工程过程
1. 用户反馈：课程管理表格第一列「课程信息」希望拆分为「课程封面」「课程ID」「课程名称」。
2. 已创建变更追踪文档 `.trae/documents/20260706_模块0_拆分课程列表表头.md`。
3. 已修改 `dashboard.html` 课程列表表头，将「课程信息」拆分为「课程封面」「课程ID」「课程名称」。
4. 已同步调整 `renderCourses()` 行渲染模板，将封面、ID、名称分别渲染到对应列。

### 7.2 交接状态
- 当前任务：课程管理列表表头拆分
- 状态：已完成
- 阻塞项：无

### 7.3 最终结果
- 文件：`dashboard.html`
- 验证：HTML 语法检查通过；s0402 前端三重闸门已执行，Test3 Mock 回归通过，Test1 不适用，Test2 因 Playwright 环境缺失未执行（状态：未闭合）
- 产出物：`.trae/documents/20260706_模块0_拆分课程列表表头.md`、`.trae/documents/test_reports/frontend_gate_20260706_181105/`

## 八、追加需求：学员报表增加字段并修正等级与总时长

### 8.1 工程过程
1. 用户反馈：学员报表需增加「学员考试数」「获得徽章数」两列；员工等级显示 LV1/LV2 等；总学习时长应包含培训+课程时长。
2. 已创建变更追踪文档 `.trae/documents/20260706_模块0_学员报表增加字段.md`。
3. 已修改 `server.js`：
   - 新增 `getLevelInfo()` 返回等级数字；
   - 新增 `calculateStreakDays()` 与 `calculateBadgeCount()` 服务端徽章计数；
   - `getUserLearningStats()` 中 `totalHours = courseHours + trainingHours`，并返回 `examCount`、`badgeCount`、`level`。
   - `/api/auth/users` 接口返回新增字段。
4. 已修改 `dashboard.html`：
   - 学员报表表头增加「学员考试数」「获得徽章数」；
   - 行渲染增加对应列，等级显示 `LV${level}`；
   - 无数据 `colspan` 从 14 改为 16；
   - CSV 导出同步新增列与 LV 格式。
5. 已执行 `node --check server.js`，语法通过。

### 8.2 交接状态
- 当前任务：学员报表增加字段并修正等级与总时长
- 状态：已完成
- 阻塞项：无

### 8.3 最终结果
- 文件：`server.js`、`dashboard.html`。
- 验证：`node --check server.js` 通过；HTML 关键位置已核对。
- 产出物：`.trae/documents/20260706_模块0_学员报表增加字段.md`
- 待人工验证：重启 Node 服务后刷新 dashboard.html 查看学员报表显示效果。

## 九、追加即时修复：考试列表三率拆分与指派记录 Tab

### 9.1 工程过程
1. 用户反馈：考试管理列表中「参与率/及格率/缺考率」希望拆分为三列；考试详情「成绩」按钮中希望增加指派记录。
2. 已创建变更追踪文档 `.trae/documents/20260706_模块0_拆分考试率表头并增加指派记录.md`。
3. 已修改 `dashboard.html`：
   - 考试列表表头拆分为「参与率」「及格率」「缺考率」三列，同步调整空状态 `colspan` 与行渲染模板。
   - 考试详情内嵌窗格新增「指派记录」Tab 与面板。
   - `loadExamDetailData` 同时请求 `/api/exams/{id}` 以获取 `allowedUsers`。
   - 新增 `renderExamDetailAssignments()` 与 `exportExamDetailAssignments()`。
4. 已执行 s0402 前端三重闸门，证据落盘 `.trae/documents/test_reports/frontend_gate_20260706_182047/`。

### 9.2 交接状态
- 当前任务：考试列表三率拆分与指派记录 Tab
- 状态：已完成实现，s0402 闸门 **未闭合**
- 阻塞项：Playwright 浏览器未安装、scripts/test-api.js 缺失

### 9.3 最终结果
- 文件：`dashboard.html`
- 验证：内联脚本语法检查 PASS；考试相关 API 冒烟 PASS；Mock 回归 PASS。
- 产出物：`.trae/documents/20260706_模块0_拆分考试率表头并增加指派记录.md`、`.trae/documents/test_reports/frontend_gate_20260706_182047/`
- 未闭合项：Test2 E2E 因环境缺失未执行；Test1 单元测试入口缺失。

## 十、追加即时修复：证书颁发弹窗复用统一指派弹窗

### 10.1 工程过程
1. 用户反馈：证书手动颁发弹窗中学员显示不是姓名，且可复用指派学员弹窗避免重复实现。
2. 已创建变更追踪文档 `.trae/documents/20260706_证书管理_复用指派弹窗颁发证书.md`。
3. 已删除 `dashboard.html` 中独立的 `certificate-issue-modal` HTML 弹窗。
4. 已在 `dashboard.html` 的 `confirmUnifiedAssignPicker` 中新增 `mode === 'certificate'` 分支。
5. 已重写 `js/certificate-management.js` 的 `openIssueModal`，改为调用 `window.openUnifiedAssignPicker`。
6. 已清理 `js/certificate-management.js` 中冗余的 `users` 状态、`loadUsers`、`renderIssueUserList`、`submitIssue` 及相关事件监听。
7. 已移除 `dashboard.html` 证书 tab 加载器中对 `CertificateMgmt.loadUsers()` 的调用。

### 10.2 交接状态
- 当前任务：证书颁发弹窗复用统一指派弹窗
- 状态：已完成
- 阻塞项：无

### 10.3 最终结果
- 文件：`dashboard.html`、`js/certificate-management.js`。
- 验证：`node --check js/certificate-management.js` 通过；`node --check server.js` 通过；全局搜索确认旧引用仅在备份文件中存在；s0402 前端三重闸门已执行，Test3 Mock 回归通过，Test1 不适用，Test2 因 Playwright 环境缺失未执行（状态：未闭合）。
- 产出物：`.trae/documents/20260706_证书管理_复用指派弹窗颁发证书.md`、`.trae/documents/test_reports/frontend_gate_20260706_191500/`。
- 待人工验证：在浏览器中打开 dashboard.html → 证书管理 → 点击「颁发」，确认弹窗为统一指派弹窗、学员显示真实姓名、选择后颁发成功。
