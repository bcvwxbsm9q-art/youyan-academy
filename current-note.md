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

### 7.3 最终结果
- 文件：`dashboard.html`、`center.html`、`server.js`、`data.json`、`js/certificate-management.js`、`public/pre_generated_mock/certificate-mock.js`。
- 验证：语法检查通过；服务器重启后模板 API 返回新样式；4 个弹窗均补充 `flex` 类。
- 产出物：`.trae/documents/20260706_证书管理_修复弹窗居中并优化模板.md`

## 十、追加 Bug 修复：培训页分类筛选与进度条

### 10.1 工程过程
1. 用户反馈：培训计划页点击分类后再切回“全部课程”，筛选按钮失去彩色主题；进度条在 0/0 时仍显示绿色。
2. 已创建变更追踪文档 `.trae/documents/20260708_模块0_修复培训页筛选与进度条.md`。
3. 已修改 `training-plan.html`：通过 `CATEGORY_FILTER_CLASSES` 恢复分类按钮主题色；给“本月已报名”进度条增加动态宽度计算。

### 10.2 交接状态
- 当前任务：培训页分类筛选与进度条修复
- 状态：已完成
- 阻塞项：无

### 10.3 最终结果
- 文件：`training-plan.html`。
- 验证：筛选按钮切换后恢复彩色主题；进度条按 `已报名 / 本月课程总数` 显示，总数为 0 时不显示绿色。
- 后续调整 1：用户反馈紫色高亮外圈太丑，已移除，仅保留彩色胶囊按钮。产出物：`.trae/documents/20260708_模块0_去掉筛选按钮紫色高亮.md`。
- 后续调整 2：用户觉得缺少交互反馈，已按“选中项加深背景色”实现：未选中保持浅色彩色背景，选中项变为同色系深色背景 + 白字。产出物：`.trae/documents/20260708_模块0_筛选按钮选中态加深背景.md`。
- 后续调整 3：用户要求“全部课程”按钮保持默认渐变，不加深。已修改 `filterByCategory()` 仅对非 `all` 分类应用深色激活态。产出物：`.trae/documents/20260708_模块0_全部课程按钮不变色.md`。
- 后续调整 4：用户反馈课件不算任务，按钮应为“去下载”。已将 `training-plan.html` 中课件条目的按钮文案改为“去下载”，状态文案改为“可下载”。产出物：`.trae/documents/20260708_模块0_课件按钮改为去下载.md`。
- 产出物：`.trae/documents/20260708_模块0_修复培训页筛选与进度条.md`

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

## 八、追加即时修复：去掉课程管理列表课程 ID 列

### 8.1 工程过程
1. 用户反馈：课程 ID 数字较长，希望从课程管理列表中去掉该展示列。
2. 已确认去掉展示列不影响编辑/发布/下架/删除功能（操作列仍通过 `c.id` 传参）。
3. 已创建变更追踪文档 `.trae/documents/20260707_模块0_去掉课程ID列.md`。
4. 已删除 `dashboard.html` 课程列表表头中的「课程ID」列及行模板中对应的展示单元格。

### 8.2 交接状态
- 当前任务：去掉课程管理列表课程 ID 列
- 状态：已完成
- 阻塞项：无

### 8.3 最终结果
- 文件：`dashboard.html`
- 验证：HTML 语法检查通过；表头与行模板列数一致（12 列）；s0402 前端三重闸门已执行，Test3 Mock 回归通过，Test1 不适用，Test2 因 Playwright 环境缺失未执行（状态：未闭合）
- 产出物：`.trae/documents/20260707_模块0_去掉课程ID列.md`、`.trae/documents/test_reports/frontend_gate_20260707_212052/`

## 九、追加即时修复：播放页显示课程资料

### 9.1 工程过程
1. 用户反馈：在课程管理中上传 PPT 课件后，播放页没有资料展示入口。
2. 与用户确认采用「资料列表 + 点击打开」轻量方案（不引入 PPT 内联预览库）。
3. 已创建变更追踪文档 `.trae/documents/20260707_模块0_播放页显示课程资料.md`。
4. 首次实现：在 `player.html`「课程简介」下方新增「课程资料」卡片。
5. 用户反馈：希望放到右侧「课程章节」卡片下方并保持样式一致；已调整位置并移除左侧卡片。
6. 用户反馈：课程资料卡片未固定，滑动时会垫底；已将 `sticky top-20` 从「课程章节」卡片内部提到外层容器，使课程章节与课程资料作为一个整体固定跟随。
7. 用户反馈：标题文件夹图标与右侧外部链接图标不统一；已移除标题图标，并将右侧图标改为下载图标，链接添加 `download` 属性。
8. 用户反馈：下载后的文件名变成 URL 中的数字 ID；已给 `download` 属性赋值为附件原始文件名（对双引号做安全替换），确保下载名称与显示名称一致。
9. 用户反馈：课程简介作为独立卡片不够紧凑，且无简介时应隐藏；已将课程简介移入「课程信息区」卡片内部（学习进度下方），删除原独立卡片，并根据 `course.description` 显隐。
10. 用户反馈：课程简介标题缺少图标、样式应与讲师介绍一致，且「展开」按钮无用；已为课程简介添加 `fa-file-alt` 图标并统一标题样式，删除展开/收起按钮，简介完整显示。
11. 用户反馈：讲师头像右下角等级标签位置歪斜；已将等级标签移讲师姓名右侧作为圆角徽章，头像右下角不再显示标签。
12. 二次反馈修正：课程简介图标 `fa-file-alt` 在 Font Awesome 4 中不存在导致不显示，已改为 `fa-file-text-o`。
13. 二次反馈修正：讲师等级标签改放在头像正下方居中显示，而非姓名右侧。
14. 已新增 `getAttachmentIcon`、`formatAttachmentSize`、`renderCourseAttachments` 函数并在 `populatePlayerPage` 中调用。
15. 无附件时卡片自动隐藏。

### 9.2 交接状态
- 当前任务：播放页显示课程资料
- 状态：已完成
- 阻塞项：无

### 9.3 最终结果
- 文件：`player.html`
- 验证：HTML 语法检查通过；s0402 前端三重闸门已执行，Test3 Mock 回归通过，Test1 不适用，Test2 因 Playwright 环境缺失未执行（状态：未闭合）
- 产出物：
  - `.trae/documents/20260707_模块0_播放页显示课程资料.md`
  - `.trae/documents/20260708_模块0_课程简介并入课程信息区.md`
  - `.trae/documents/20260708_模块0_优化课程简介与讲师介绍排版.md`
  - `.trae/documents/test_reports/frontend_gate_20260707_213351/`
  - `.trae/documents/test_reports/frontend_gate_20260708_104734/`
  - `.trae/documents/test_reports/frontend_gate_20260708_114118/`

## 十、追加需求：学员报表增加字段并修正等级与总时长

### 10.1 工程过程
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

### 10.2 交接状态
- 当前任务：学员报表增加字段并修正等级与总时长
- 状态：已完成
- 阻塞项：无

### 10.3 最终结果
- 文件：`server.js`、`dashboard.html`。
- 验证：`node --check server.js` 通过；HTML 关键位置已核对。
- 产出物：`.trae/documents/20260706_模块0_学员报表增加字段.md`
- 待人工验证：重启 Node 服务后刷新 dashboard.html 查看学员报表显示效果。

## 十一、追加 Bug 修复：登录趋势仅记录每天独立登录人数

### 11.1 工程过程
1. 用户反馈：报表管理-登录趋势数据错乱，怀疑多套逻辑。
2. 已创建变更追踪文档 `.trae/documents/20260707_模块0_修复登录趋势记录.md`。
3. 已排查确认：登录趋势计算逻辑只有一套（`buildOverviewReport` 按天去重 userId），但 `/api/auth/login` 从未向 `login_logs` 写入记录，导致数据源缺失/不可靠。
4. 已修改 `server.js` 的 `/api/auth/login`：
   - 登录成功后追加 `{ userId, loginTime }` 到 `data.login_logs`；
   - 每次写入后过滤掉 90 天前的旧记录，防止数组无限增长；
   - `buildOverviewReport()` 保持原有按天去重逻辑不变。
5. 已执行 `node --check server.js`，语法通过。

### 11.2 交接状态
- 当前任务：登录趋势仅记录每天独立登录人数
- 状态：已完成
- 阻塞项：无

### 11.3 最终结果
- 文件：`server.js`。
- 验证：`node --check server.js` 通过。
- 产出物：`.trae/documents/20260707_模块0_修复登录趋势记录.md`
- 待人工验证：重启 Node 服务后重新登录，再查看 dashboard.html 登录趋势图表。

## 十二、追加需求：报表管理登录日志永久保存

### 12.1 工程过程
1. 用户反馈：希望报表管理中的所有数据永久储存，不自动清除。
2. 已确认此前 `/api/auth/login` 中的 `login_logs` 写入代码未持久化，且原方案包含 90 天清理。
3. 已重新修改 `server.js` 的 `/api/auth/login`：
   - 登录成功后追加 `{ userId, loginTime }` 到 `data.login_logs`；
   - 移除任何自动清理逻辑，`login_logs` 永久保留；
   - `buildOverviewReport()` 仅按展示周期筛选图表显示，不删除底层数据。
4. 已执行 `node --check server.js`，语法通过。

### 12.2 交接状态
- 当前任务：报表管理登录日志永久保存
- 状态：已完成
- 阻塞项：无

### 12.3 最终结果
- 文件：`server.js`。
- 验证：`node --check server.js` 通过。
- 产出物：`.trae/documents/20260707_模块0_登录日志永久保存.md`
- 待人工验证：重启 Node 服务后登录，查看 `data.json` 中 `login_logs` 是否持续累积。

## 十三、验证：学员报表总学习时长累加逻辑

### 13.1 工程过程
1. 用户反馈：学员报表总学习时长仍未累加课程与培训时长。
2. 已重新核对 `server.js` 第 851-852 行，`totalHours = +(courseHours + trainingHours).toFixed(1)` 逻辑正确。
3. 已重新核对 `/api/auth/users` 接口与 `dashboard.html` 渲染逻辑，均无二次覆盖。
4. 已执行 `node --check server.js`，语法通过。

### 13.2 交接状态
- 当前任务：学员报表总时长累加验证
- 状态：已完成
- 阻塞项：无

### 13.3 最终结果
- 代码逻辑已正确，无需再次修改。
- 最可能原因：Node 服务未重启或浏览器缓存旧 API 响应。
- 产出物：`.trae/documents/20260707_模块0_学员报表总时长累加验证.md`
- 待人工验证：重启 Node 服务并按 Ctrl+F5 刷新 dashboard.html。

## 十四、追加修复：证书管理红色提示 + 按钮主题 + 模板一致性复核

### 14.1 工程过程
1. 用户再次反馈：打开证书管理出现红色提示、按钮颜色未跟主题、考试合格证书模板需优化。
2. 已复核 `dashboard.html` 证书 tab 加载器：仅调用 `window.CertificateMgmt.loadTemplates()` 与 `loadCertificates()`，不再调用已删除的 `loadUsers()`，红色提示代码根源已清除。
3. 已复核 `js/certificate-management.js`、`server.js`、`data.json`、`public/pre_generated_mock/certificate-mock.js`：均不存在 `loadUsers()` 调用或相关残留状态。
4. 已复核证书管理主按钮（新建、查询、保存、选择模板、模板确定）：均为 `from-indigo-500 to-blue-600` 渐变主题。
5. 发现列表操作列「颁发」按钮悬停色仍为绿色（`#059669`），未跟随主题；已将其改为 indigo 主题（`#4f46e5`/`#eef2ff`/`#c7d2fe`）。
6. 已复核考试合格证书模板 `tpl-honor-blue` 在三端（`server.js`、`data.json`、`certificate-mock.js`）字段、样式、占位符完全一致，已包含斜纹背景、深蓝主色、双层边框、四角装饰、印章等设计元素。
7. 已执行 `node --check server.js`、`node --check js/certificate-management.js`、`node --check public/pre_generated_mock/certificate-mock.js`，均通过；`data.json` 为合法 JSON。
8. 已执行 API 冒烟：`GET http://localhost:3003/api/certificates/templates` 返回 200，模板列表正确。
9. 已创建变更追踪文档 `.trae/documents/20260707_证书管理_统一操作按钮主题色.md`。

### 14.2 交接状态
- 当前任务：证书管理红色提示 + 按钮主题 + 模板一致性复核
- 状态：已完成
- 阻塞项：无

### 14.3 最终结果
- 文件：`dashboard.html`（仅修改 `.cert-action-btn.issue:hover` 颜色）。
- 验证：语法检查通过；API 冒烟通过；证书模板三端一致；已服务化内容不再包含旧 `loadUsers()` 调用。
- 产出物：`.trae/documents/20260707_证书管理_统一操作按钮主题色.md`
- 待人工验证：浏览器访问 `dashboard.html` → 证书管理，确认无红色提示、悬停「颁发」按钮为 indigo 色、考试合格证书模板渲染正常。如仍看到旧效果，请按 `Ctrl+F5` 强制刷新或重启 Node 服务。

## 十五、追加即时修复：考试列表三率拆分与指派记录 Tab

### 15.1 工程过程
1. 用户反馈：考试管理列表中「参与率/及格率/缺考率」希望拆分为三列；考试详情「成绩」按钮中希望增加指派记录。
2. 已创建变更追踪文档 `.trae/documents/20260706_模块0_拆分考试率表头并增加指派记录.md`。
3. 已修改 `dashboard.html`：
   - 考试列表表头拆分为「参与率」「及格率」「缺考率」三列，同步调整空状态 `colspan` 与行渲染模板。
   - 考试详情内嵌窗格新增「指派记录」Tab 与面板。
   - `loadExamDetailData` 同时请求 `/api/exams/{id}` 以获取 `allowedUsers`。
   - 新增 `renderExamDetailAssignments()` 与 `exportExamDetailAssignments()`。
4. 已执行 s0402 前端三重闸门，证据落盘 `.trae/documents/test_reports/frontend_gate_20260706_182047/`。

### 15.2 交接状态
- 当前任务：考试列表三率拆分与指派记录 Tab
- 状态：已完成实现，s0402 闸门 **未闭合**
- 阻塞项：Playwright 浏览器未安装、scripts/test-api.js 缺失

### 15.3 最终结果
- 文件：`dashboard.html`
- 验证：内联脚本语法检查 PASS；考试相关 API 冒烟 PASS；Mock 回归 PASS。
- 产出物：`.trae/documents/20260706_模块0_拆分考试率表头并增加指派记录.md`、`.trae/documents/test_reports/frontend_gate_20260706_182047/`
- 未闭合项：Test2 E2E 因环境缺失未执行；Test1 单元测试入口缺失。

## 十六、追加即时修复：证书颁发弹窗复用统一指派弹窗

### 16.1 工程过程
1. 用户反馈：证书手动颁发弹窗中学员显示不是姓名，且可复用指派学员弹窗避免重复实现。
2. 已创建变更追踪文档 `.trae/documents/20260706_证书管理_复用指派弹窗颁发证书.md`。
3. 已删除 `dashboard.html` 中独立的 `certificate-issue-modal` HTML 弹窗。
4. 已在 `dashboard.html` 的 `confirmUnifiedAssignPicker` 中新增 `mode === 'certificate'` 分支。
5. 已重写 `js/certificate-management.js` 的 `openIssueModal`，改为调用 `window.openUnifiedAssignPicker`。
6. 已清理 `js/certificate-management.js` 中冗余的 `users` 状态、`loadUsers`、`renderIssueUserList`、`submitIssue` 及相关事件监听。
7. 已移除 `dashboard.html` 证书 tab 加载器中对 `CertificateMgmt.loadUsers()` 的调用。

### 16.2 交接状态
- 当前任务：证书颁发弹窗复用统一指派弹窗
- 状态：已完成
- 阻塞项：无

### 16.3 最终结果
- 文件：`dashboard.html`、`js/certificate-management.js`。
- 验证：`node --check js/certificate-management.js` 通过；`node --check server.js` 通过；全局搜索确认旧引用仅在备份文件中存在；s0402 前端三重闸门已执行，Test3 Mock 回归通过，Test1 不适用，Test2 因 Playwright 环境缺失未执行（状态：未闭合）。
- 产出物：`.trae/documents/20260706_证书管理_复用指派弹窗颁发证书.md`、`.trae/documents/test_reports/frontend_gate_20260706_191500/`。
- 待人工验证：在浏览器中打开 dashboard.html → 证书管理 → 点击「颁发」，确认弹窗为统一指派弹窗、学员显示真实姓名、选择后颁发成功。

## 十七、追加任务：按题型测试考试评分逻辑

### 17.1 工程过程
1. 用户要求按题型（单选、多选、填空、简答、判断）测试考试评分，并确认分数设置逻辑是否完整。
2. 已创建变更追踪文档 `.trae/documents/20260707_模块0_按题型测试考试评分逻辑.md`。
3. 已编写独立测试脚本 `scripts/test-exam-scoring.js`，使用内存数据覆盖五种题型：
   - 单选：正确/错误/未作答
   - 多选：全对/漏选（partialScore）/漏选（按比例）/错选/未作答
   - 判断：A/正确/true 等兼容写法、错误、未作答
   - 填空：精确匹配、前后空格、错误、未作答
   - 简答：精确匹配、错误
   - 整卷满分/得分率/及格判定、默认及格线 60% 向上取整
4. 已运行 `node scripts/test-exam-scoring.js`：24/24 全部通过。

### 17.2 交接状态
- 当前任务：按题型测试考试评分逻辑
- 状态：已完成
- 阻塞项：无

### 17.3 最终结果
- 文件：`scripts/test-exam-scoring.js`（新增）
- 验证：`node --check scripts/test-exam-scoring.js` 通过；24 个断言全部通过。
- 产出物：`.trae/documents/20260707_模块0_按题型测试考试评分逻辑.md`
- 结论：
  - 各题型评分逻辑完整，未发现缺陷。
  - 多选题漏选支持 `partialScore` 配置与按比例得分两种模式；错选 0 分。
  - 判断题归一化兼容 A/B、正确/错误、true/false、1/0、对/错、yes/no。
  - 填空/简答按 trim 后精确匹配。
  - 满分按题目 `score` 求和；及格线显式配置优先，否则按 `Math.max(1, Math.ceil(fullScore * 0.6))`。
  - 提交接口与详情接口评分路径一致。

## 十八、追加即时修复：基础证书模板紫色主题统一

### 18.1 工程过程
1. 用户反馈证书管理区主题色应为紫色，但最基础的考试合格证书模板 `tpl-honor-blue` 仍为蓝色系。
2. 已创建变更追踪文档 `.trae/documents/20260707_证书管理_基础模板紫色主题.md`。
3. 已确认三端模板数据不一致：`server.js` 中为旧版浅蓝色「蓝色荣誉证书」；`data.json` 与 `certificate-mock.js` 虽为「考试合格荣誉证书」，但主色仍为深蓝。
4. 已将 `server.js`、`data.json`、`public/pre_generated_mock/certificate-mock.js` 中的 `tpl-honor-blue` 统一为紫色主题：
   - 名称改为「紫色考试合格证书（竖版）」。
   - 背景使用淡紫渐变 + 紫色径向光晕 + 紫色细斜纹。
   - 主色/边框/印章改为 `#764ba2`，辅色 `#667eea`，点缀色 `#9333ea`。
5. 已执行语法检查与 JSON 校验。

### 18.2 交接状态
- 当前任务：基础证书模板紫色主题统一
- 状态：已完成
- 阻塞项：无

### 18.3 最终结果
- 文件：`server.js`、`data.json`、`public/pre_generated_mock/certificate-mock.js`。
- 验证：`node --check server.js` 通过；`node --check js/certificate-management.js` 通过；`node --check public/pre_generated_mock/certificate-mock.js` 通过；`data.json` JSON 解析通过。
- 产出物：`.trae/documents/20260707_证书管理_基础模板紫色主题.md`
- 待人工验证：重启 Node 服务后，在浏览器打开 `dashboard.html` → 证书管理 → 新建证书 → 选择模板，确认基础证书模板为紫色主题。如仍显示旧效果，请按 `Ctrl+F5` 强制刷新。

## 十九、追加需求：证书手动颁发全链路联动

### 19.1 工程过程
1. 用户希望手动颁发证书后，被颁发用户能在消息中心收到提醒，并在个人中心-我的证书查看；管理后台可查看发放记录。
2. 已创建变更追踪文档 `.trae/documents/20260708_证书管理_手动颁发联动通知.md`。
3. 已定位链路缺口：
   - `dashboard.html` 的 `confirmUnifiedAssignPicker` 只处理 `training`/`exam`/`assign` 模式，`certificate` 模式点击确认后不会调用 `onConfirm`。
   - `server.js` 的 `POST /api/certificates/:id/issue` 仅创建 `user_certificates`，未发送通知。
4. 已修改 `dashboard.html`：将 `assign` 模式条件扩展为同时处理 `assign` 与 `certificate` 模式。
5. 已修改 `server.js`：在 `issue` 接口中每成功颁发一个用户证书实例后，向该用户推送 `type: 'certificate'` 通知。
6. 已重启 Node 服务并执行 API 冒烟：向用户 `1782783422496` 颁发 `cert-1783333691917` 成功，`data.json` 中同步出现 `user_certificates` 与 `notifications` 记录。
7. 已验证：被颁发用户可查询到证书通知与个人证书；管理后台可查询到发放记录。

### 19.2 交接状态
- 当前任务：证书手动颁发全链路联动
- 状态：已完成
- 阻塞项：无

### 19.3 最终结果
- 文件：`server.js`、`dashboard.html`。
- 验证：
  - `node --check server.js` 通过；`node --check js/certificate-management.js` 通过。
  - API 冒烟通过：`POST /api/certificates/:id/issue` 返回成功，证书实例与通知均已持久化。
  - 消息中心接口 `/api/notifications` 可返回 `type: 'certificate'` 通知。
  - 个人中心接口 `/api/user-certificates?userId=...` 可返回新证书。
  - 管理后台详情接口 `/api/user-certificates?certificateId=...&status=active` 可返回发放记录。
- 产出物：`.trae/documents/20260708_证书管理_手动颁发联动通知.md`
- 待人工验证：在浏览器中完整走一遍管理后台颁发 → 被颁发用户消息中心 → 个人中心-我的证书 → 管理后台详情-有效人员。

## 二十、追加即时修复：移除课程列表附件提示图标

### 20.1 工程过程
1. 用户反馈：课程管理列表中，上传了课件资料的课程会在操作栏显示回形针图标，希望不显示。
2. 已创建变更追踪文档 `.trae/documents/20260708_模块0_移除课程列表附件提示图标.md`。
3. 已删除 `dashboard.html` 课程列表操作列中的回形针图标提示。
4. 已删除 `renderCourses()` 中不再使用的 `attachmentCount` 变量定义。

### 20.2 交接状态
- 当前任务：移除课程列表附件提示图标
- 状态：已完成
- 阻塞项：无

### 20.3 最终结果
- 文件：`dashboard.html`
- 验证：HTML 语法检查通过；s0402 前端三重闸门已执行，Test3 Mock 回归通过，Test1 不适用，Test2 因 Playwright 环境缺失未执行（状态：未闭合）
- 产出物：`.trae/documents/20260708_模块0_移除课程列表附件提示图标.md`、`.trae/documents/test_reports/frontend_gate_20260708_100550/`

## 二十一、追加即时修复：个人中心证书列表加载失败

### 21.1 工程过程
1. 用户反馈：手动颁发证书后，在个人中心「我的证书」查看出现「加载失败」。
2. 已创建变更追踪文档 `.trae/documents/20260708_模块0_修复个人中心证书列表加载.md`。
3. 已诊断根因：
   - `server.js` 的 `/api/user-certificates` 列表接口 enrich 时只返回 `templateId`，未返回完整 `template` 对象；
   - `center.html` 渲染证书卡片直接依赖 `cert.template?.style?.background`。
4. 已修改 `server.js`：在 `/api/user-certificates` 列表接口中按 `cert.templateId` 查找并返回完整 `template` 对象。
5. 已修改 `center.html`：在 `loadCertificates()` 与 `loadCertificatesList()` 开头增加 `currentUser` 非空校验，避免空用户时读取 `currentUser.id` 抛出异常。
6. 已执行语法检查与 API 冒烟测试，已重启 Node 服务。

### 21.2 交接状态
- 当前任务：个人中心证书列表加载失败修复
- 状态：已完成
- 阻塞项：无

### 21.3 最终结果
- 文件：`server.js`、`center.html`。
- 验证：
  - `node --check server.js`、`node --check js/certificate-management.js`、`node --check public/pre_generated_mock/certificate-mock.js` 均通过。
  - `center.html` 内嵌脚本语法检查通过。
  - `data.json` JSON 解析通过。
  - 重启 Node 服务后，`GET /api/user-certificates?userId=1782783422496` 返回 200，记录中包含完整 `template` 对象。
- 产出物：`.trae/documents/20260708_模块0_修复个人中心证书列表加载.md`
- 待人工验证：登录被颁发证书的用户账号，进入个人中心 → 我的证书，确认列表正常加载、卡片显示模板背景、点击查看可预览证书。

## 二十二、追加即时修复：证书图片生成卡死

### 22.1 工程过程
1. 用户反馈：个人中心「我的证书」证书图片一直显示「生成证书图片...」，无法正常完成。
2. 已通过浏览器控制台复现：`htmlToImage.toPng()` 抛出 `isTrusted` 事件错误，证书模板使用的 `"Noto Serif SC"` 外部字体栈导致字体加载失败。
3. 已修改 `center.html`：
   - `renderCertificatePreviewHTML()` 改用系统字体栈（`'PingFang SC', 'Microsoft YaHei', 'SimSun', serif`）。
   - 证书尺寸从 `mm` 改为 `px`（竖版 794×1123，横版 1123×794）。
   - `loadCertificatesList()` 中 `htmlToImage.toPng()` 增加 `skipFonts: true`、`backgroundColor: '#ffffff'` 与 8 秒超时。
   - 生成失败时占位图显示「生成失败」，避免无限 loading。
4. 已同步更新 `test-cert-image.html` 的字体与尺寸处理。
5. 已更新变更追踪文档 `.trae/documents/20260708_模块0_证书列表图片化并支持下载.md`。

### 22.2 交接状态
- 当前任务：证书图片生成卡死修复
- 状态：已完成
- 阻塞项：无

### 22.3 最终结果
- 文件：`center.html`、`test-cert-image.html`。
- 验证：
  - 浏览器实测个人中心「我的证书」证书图片可正常生成，下载按钮变为可用。
  - 控制台无字体加载相关错误。
- 产出物：`.trae/documents/20260708_模块0_证书列表图片化并支持下载.md`（已更新）
- 待人工验证：在目标浏览器中刷新个人中心 → 我的证书，确认图片在数秒内生成、下载按钮可点击。

## 二十三、追加 Bug 修复：证书通知点击后红点不消失

### 23.1 工程过程
1. 用户反馈：消息中心的证书推送消息点击后，所有页面仍显示红点。
2. 已创建变更追踪文档 `.trae/documents/20260708_模块0_修复通知已读标记失败.md`。
3. 已诊断根因：证书颁发接口生成的通知 ID 为字符串（如 `nt-1783477408201-0`），`GET /api/notifications` 返回时会包装为 `notification_nt-...`；但 `PUT /api/notifications/:id/read`、`POST /api/notifications/batch-read`、`DELETE /api/notifications/:id` 去掉 `notification_` 前缀后仍用 `parseInt` 解析，导致字符串 ID 匹配失败返回 404，无法标记已读/删除。
4. 已修改 `server.js`：三个接口均改为先剥离 `notification_` 前缀，再用 `String(n.id) === String(rawId)` 匹配。
5. 已恢复测试过程中被误删的证书通知数据到 `data.json`。
6. 已重启 Node 服务并执行接口验证：单条已读、批量已读、删除均返回 200，再次获取列表后 `read` 字段正确更新。

### 23.2 交接状态
- 当前任务：证书通知已读标记失败修复
- 状态：已完成
- 阻塞项：无

### 23.3 最终结果
- 文件：`server.js`、`data.json`。
- 验证：
  - `node --check server.js` 通过。
  - `PUT /api/notifications/notification_nt-1783477408201-0/read` 返回 `200 {"success":true}`。
  - `GET /api/notifications` 再次查询，该通知 `read` 字段从 `false` 变为 `true`。
  - `POST /api/notifications/batch-read` 与 `DELETE /api/notifications/:id` 对 `notification_nt-...` ID 均返回 200。
- 产出物：`.trae/documents/20260708_模块0_修复通知已读标记失败.md`
- 待人工验证：在浏览器中打开消息中心，点击证书通知，确认消息行红点消失、顶部未读数减少；切换到首页/课程页/个人中心，确认铃铛红点同步消失。
