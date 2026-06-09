## 课程播放页容错处理
- 修复 player.html 中 populatePlayerPage 函数，增加对 course.videos 为空但 course.video 存在的兼容逻辑。
- 确保视频 URL 相对路径（如 /uploads/videos/xxx.mp4）能正确解析并加载。
- 修复大纲渲染逻辑，当 videos 缺失时提供友好提示或自动构建单章节列表，避免点击无响应。
