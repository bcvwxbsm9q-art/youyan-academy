## 项目架构
- 前端：原生 HTML/CSS/JavaScript + Tailwind CSS
- 后端：Node.js + Express (端口 3003)
- 数据库：SQLite (data/academy.db) + JSON 文件 (data.json)
- 认证：JWT Token (7 天有效期) + SHA256 密码加密
- 部署：Railway (免费额度 $5/月)

## 核心页面
- 前台：index.html (首页), course.html (课程中心), teacher.html (讲师风采), center.html (个人中心), player.html (课程播放)
- 后台：dashboard.html (管理后台，内置登录弹窗，含考试管理等全部功能)

## 关键修复记录
- 创建 data-api.js 和 js/data-sync.js 解决 DataAPI 缺失问题
- 在 player.html 等页面添加脚本引用修复课程播放功能
- 修复 admin.html 中 CSS 类名连写问题 (hiddenblock → hidden md:block) [admin.html 已合并至 dashboard.html 并删除]
- 修复所有 HTML 文件中文字符乱码问题

## 课程播放实现
- 视频文件存储：uploads/videos/ 目录
- 静态资源服务：Express 配置 express.static(__dirname)
- 数据加载：通过 /api/courses 接口获取课程信息
- 播放器：使用 HTML5 video 标签，支持学习进度跟踪

## 用户认证系统
- 注册接口：POST /api/auth/register
- 登录接口：POST /api/auth/login
- Token 验证：GET /api/auth/me
- 默认账户：admin/admin2026 (管理员), student/student123 (学生)

## 管理后台功能
- 题库管理：支持 5 种题型 (单选/多选/判断/填空/简答)
- 运营管理：公告/Banner/推荐/消息/活动/积分/标签
- 用户管理：用户列表/部门管理/角色管理
- 课程管理：课程 CRUD/上架下架/章节管理

## 部署配置
- railway.json: 指定 Nixpacks 构建器和 node server.js 启动命令
- .gitignore: 排除 node_modules, .env, data.json 等敏感文件
- 环境变量：ADMIN_USERNAME, ADMIN_PASSWORD, JWT_SECRET
