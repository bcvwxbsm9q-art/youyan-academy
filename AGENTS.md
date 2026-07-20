## 前端用户页面清单
以下页面是面向终端用户的页面，共享同一套框架逻辑（navbar、通知铃铛、认证等），修改公共逻辑时**必须同步更新所有页面**：

| 页面 | 文件路径 | 说明 |
|------|----------|------|
| 首页 | `index.html` | 平台首页 |
| 培训 | `training-plan.html` | 培训计划 |
| 课程 | `course.html` | 课程列表/详情 |
| 讲师 | `teacher.html` | 讲师展示页 |
| 个人中心 | `center.html` | 用户个人主页 |
| 播放页 | `player.html` | 课程视频播放 |
| 消息中心 | `messages.html` | 通知消息列表 |

### 共享依赖（修改时需同步检查）
- **`js/auth-guard.js`** — 登录认证守卫，所有页面均引用
- **`js/auth-modal.js`** — 登录弹窗组件，所有页面均引用
- **`js/notification.js`** — 通知铃铛系统（未读徽章、通知面板、标记已读），所有页面均应引用
- **Navbar 结构** — 用户信息、铃铛、退出按钮等 HTML 结构保持一致

### 已知修复记录（2026-06-20）
- [x] 修复 notification.js API 调用与 server.js 返回格式不匹配的问题：统一使用 `GET /api/notifications` + 从 `result.data` 数组计算未读数
- [x] 修复 `markAllNotificationsRead` 调用了不存在的 `PUT /read-all` 端点，改为先获取未读ID再调用 `POST /batch-read`
- [x] training-plan.html 缺少 `notification.js` 引用，已补上

---

## 课程播放页容错处理
- [x] 修复 player.html 中 populatePlayerPage 函数，增加对 course.videos 为空但 course.video 存在的兼容逻辑。
- [x] 确保视频 URL 相对路径（如 /uploads/videos/xxx.mp4）能正确解析并加载。
- [x] 修复大纲渲染逻辑，当 videos 缺失时提供友好提示或自动构建单章节列表，避免点击无响应。

### 已修复的额外问题（2026-06-10）
- [x] 修复 `let videos` / `const videos` 同一作用域重复声明导致函数崩溃
- [x] 修复 `const catInfo` 重复声明（改为 `detailedCatInfo`）
- [x] 修复 `favoriteIcon?.className = xxx` 可选链赋值语法错误
- [x] `<video>` 标签添加 `playsinline muted` 支持自动播放
- [x] 实现静音自动播放 → 尝试取消静音 → 降级提示的渐进式策略

## 证书管理（2026-07-15 重构）

证书管理详见 `docs/证书管理.md`。核心约定：

- **12 套真实 PNG 模板**（v1-v6 竖版 + h1-h6 横版），定义在：
  - 前端：`js/certificate-management.js` 的 `CERT_TEMPLATES`
  - 后端：`server.js` 的 `BUILTIN_CERT_TEMPLATES`
  - **两端必须同步维护**
- **所见即所得**：管理后台预览与学员端展示统一由浏览器内 `html-to-image` 渲染（2026-07-17 已移除服务端 Playwright），与编辑器用同一套 `renderDesignPageInner` 逻辑，字体经 `mapCertFont()` 映射为 Web 字体，彻底一致
- 旧 4 套 CSS 渐变模板（tpl-honor-purple 等）已废弃，data.json 中的 `certificate_templates` 字段保留为空数组占位
- 证书 PNG **不再由服务端生成**：颁发时只建 `user_certificates` 记录（`imageUrl` 留空），`imageUrl` 缺失时前端自动用 `html-to-image` 渲染。详见 `docs/证书管理.md`
- 修改时务必同步更新 `docs/证书管理.md`
