# 互动视频预览「进度条无法跳转」修复概览

## 问题
管理后台 → 课程管理 → 制作互动视频，已插入试题后点「预览」，点击轨道/进度条**无法跳着预览**，行为诡异。用户判断「轨道应该只有一个」——即预览时应只保留这一条轨道，并把它当作可点击的进度条来跳转。

## 根因
1. 预览模式下 `<video>` 的 `controls` 被关掉（`ivPreviewToggle` 设 `pv.controls=false`），唯一剩下的轨道由 `ivTrackClick` 处理，但它只设置「插入位置」并调用 `renderInteractionEditor()`。
2. `renderInteractionEditor()` 是 `ivView.innerHTML = panel` **整屏重绘**：每次点击都会把 `<video>` 元素销毁重建 → `currentTime` 归零、`timeupdate` 监听被重复绑定。结果就是「点了不跳、越点越怪」。
3. 轨道在预览态从未承担「进度条/seek」职责，所以根本无法跳转。

## 改动（`dashboard.html`）
- 轨道新增 `#ivTrackFill` 进度填充条：预览态显示已播进度，编辑态显示插入位置。
- `ivTrackClick`：预览态改为 `pv.currentTime = t` 跳转 + 按落点重置 `ivPreviewFired`（落点之前的节点视为已播不再弹，落点及之后的待播时触发）+ 关闭当前弹层 + 续播；**关键 `return`，不再整屏重绘**。
- `ivSelectNode`：预览态点节点标记直接跳到该节点并预览（同样不重绘）。
- `ivPreviewTimeupdate`：每帧 `ivUpdateTrackFill()` 同步填充条（轻量，不重绘）。
- `timeupdate` 监听加 `pv._ivTimeBound` 去重标记，避免重复绑定。
- 预览态隐藏「插入位置线」与编辑态文案，轨道更纯粹。

## 效果
预览时轨道即唯一进度条：点击任意位置跳转预览、点击节点标记跳到该题；命中的题自动弹出可试答。

## 验证方式
本机启动服务（`start-server.bat` 或 `node server.js`）→ 课程管理 → 制作互动视频 → 插入试题 → 预览 → 点击轨道任意位置 / 节点标记，确认视频跳转且命中的题弹出。

## 给团队的代码质量提示
- 编辑器每次交互都 `innerHTML` 全量重绘，会销毁 `<video>`、重载视频、重复绑定监听。应改为**局部 DOM 更新**或状态 diff 渲染（只更新填充条/标记，不重建 video）。
- 预览期间的点「插入试题/问卷/知识点」等操作仍会触发全量重绘、破坏预览会话；建议这类编辑操作先退出预览再 render。

## 二次修复（点击后题界面仍不弹）
现象：跳转已能跑，但点击轨道/节点后**测试题界面不弹出**。
两个叠加原因：
1. 旧逻辑靠「播放越过点位再触发 `timeupdate` 弹题」，落在两题之间或最后一题之后时播放永远跨不到节点，不弹。
2. `ivShowPreviewOverlay` 取题号只认 `node.questionRefs[0].questionId`，**老格式节点用 `node.questionId`** → `qid == null` → 直接 `ivResumePreview()` 关掉刚弹的层，表现就是「点了没弹」。
修复：
- 预览态点击轨道/节点改为**确定性立即弹题**：取落点最近且 `time <= t` 的节点直接 `ivShowPreviewOverlay`（不再依赖播放跨越）；无命中节点才续播。
- `ivShowPreviewOverlay` 与 `ivPreviewSubmit` 取题号兼容 `questionRefs[].questionId` 与旧格式 `node.questionId` 两种结构，避免取到 null 被静默吞掉。
现状：正常插入的试题（带 questionRefs）与老格式节点均可正常弹出试答；若仍不弹，基本可定位为 `/api/questions/:id` 接口本身异常（非前端），需查 server 日志。

---

# 题库选题弹窗增加「题库名称」列

## 问题
管理后台的「从题库选择题目」弹窗表格只有：题目内容、题型、难度，**没有显示每道题属于哪个题库**。当多题库混合选题时很乱，难以区分来源。

## 改动（`dashboard.html`）
- **试卷选题弹窗**（`paperQuestionPickerModal`）：
  - 表格新增「题库」列（位于题目内容与题型之间）。
  - `loadBankFilterOptions` 加载题库列表时缓存到 `paperQpBanks`，`loadPaperQuestionPool` 按 `q.bankId` 反查题库名称显示。
  - 未匹配到题库时显示「未分类」或「未知题库」，并给出 `title` 完整名称提示。
  - 所有空状态/加载失败 `colspan` 从 4 同步改为 5。
- **考试/互动视频选题弹窗**（`questionPickerModal`）：
  - 筛选栏新增「全部题库」下拉框，支持按题库过滤。
  - 表格新增「题库」列。
  - 新增 `loadQpBankFilterOptions` 缓存题库到 `qpBanks`，`loadQuestionPool` 按 `q.bankId` 显示题库名称并提交 `bankId` 查询参数。
  - 所有空状态/加载失败 `colspan` 从 5 同步改为 6。

## 效果
两个选题弹窗都能一眼看到每道题来自哪个题库，并且考试/互动视频弹窗还能按题库过滤，避免多题库混在一起选题时混乱。

## 验证方式
起服务 → 考试管理/试卷管理/互动视频 → 打开「从题库选择题目」弹窗 → 确认表格出现「题库」列，名称正确；考试弹窗确认「全部题库」筛选有效。
