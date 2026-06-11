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
