# 游雁学院 - 企业在线学习平台

一个现代化的企业内部培训和学习管理系统。

## 功能特性

- **用户管理** - 注册、登录、个人中心
- **课程中心** - 课程浏览、搜索、分类筛选
- **讲师风采** - 讲师展示、等级筛选
- **学习跟踪** - 学习进度、数据统计
- **管理后台** - 培训管理、题库管理、知识库管理

## 技术栈

- **前端**: HTML5 + CSS3 + JavaScript
- **后端**: Node.js + Express
- **数据库**: SQLite
- **认证**: JWT

## 快速开始

### 本地运行

```bash
# 安装依赖
npm install

# 启动服务器
npm start

# 访问 http://localhost:3003
```

### 默认账号

- 管理员: `admin` / `admin2026`

## 目录结构

```
├── index.html          # 首页
├── login.html           # 登录页
├── register.html        # 注册页
├── course.html          # 课程中心
├── teacher.html         # 讲师风采
├── center.html          # 个人中心
├── admin.html           # 管理后台
├── server.js            # 服务器入口
├── data/                 # 数据存储
├── css/                  # 样式文件
├── js/                   # JavaScript文件
└── scripts/              # 脚本工具
```

## 部署

### Railway（推荐）

1. Fork 本项目到 GitHub
2. 在 [Railway](https://railway.app) 连接你的 GitHub
3. 选择仓库自动部署

### Docker

```bash
docker build -t youyan-academy .
docker run -p 3003:3003 youyan-academy
```

## License

MIT
