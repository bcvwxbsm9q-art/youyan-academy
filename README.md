# 游雁学院 - 企业在线学习平台

现代化的企业内部培训和学习管理系统，支持课程管理、培训计划、在线考试、证书管理等功能。

## 技术栈

- **前端**: HTML5 + CSS3 + Tailwind CSS + Vanilla JavaScript
- **后端**: Node.js + Express.js
- **数据库**: SQLite + JSON 文件 (data.json)
- **认证**: JWT Token（7 天有效期）+ SHA256 密码加密
- **端口**: 3003
- **部署**: Railway

## 快速开始

### 第 1 步：安装依赖

```bash
cd "E:\培训相关\桌面\learning"
npm install --registry=https://registry.npmmirror.com
```

### 第 2 步：初始化数据库

```bash
node scripts/init-database.js
```

### 第 3 步：启动服务器

```bash
# 开发环境
node server.js

# 生产环境
node server-production.js
```

### 第 4 步：访问平台

启动后访问 **http://localhost:3003**

### 默认账户

> 管理员密码已由默认值修改。当前管理员账号为 `15302206488`，密码 `000000`。

| 用户名 | 密码 | 角色 | 权限 |
|--------|------|------|------|
| 15302206488 | 000000 | 管理员 | 所有管理功能 |
| student | student123 | 学生 | 学习、答题、查看课程 |

**建议登录后立即修改密码。**

---

## 数据库结构

### 核心数据表

| 表名 | 用途 |
|------|------|
| users | 用户表 |
| user_sessions | 用户会话表（JWT 黑名单） |
| courses | 课程表 |
| question_banks | 题库表 |
| questions | 题目表 |
| user_course_progress | 用户课程进度表 |
| user_question_records | 用户答题记录表 |
| system_settings | 系统配置表 |
| notices | 公告表 |
| banners | Banner 表 |

---

## 前端页面清单

### 用户端

| 页面 | 文件 | 访问地址 |
|------|------|----------|
| 首页 | index.html | http://localhost:3003/ |
| 培训计划 | training-plan.html | http://localhost:3003/training-plan.html |
| 课程中心 | course.html | http://localhost:3003/course.html |
| 讲师风采 | teacher.html | http://localhost:3003/teacher.html |
| 个人中心 | center.html | http://localhost:3003/center.html |
| 课程播放 | player.html | http://localhost:3003/player.html |
| 消息中心 | messages.html | http://localhost:3003/messages.html |
| 考试页 | exam.html | http://localhost:3003/exam.html |
| 培训签到 | training-signin.html | http://localhost:3003/training-signin.html |
| 问卷调研 | survey.html | http://localhost:3003/survey.html |
| 题库详情 | bank-detail.html | http://localhost:3003/bank-detail.html |

### 管理后台

管理后台统一入口为 `dashboard.html`，内置登录弹窗，包含以下功能模块：

| 模块 | 功能 |
|------|------|
| 数据概览 | 用户/课程/学习时长统计面板 |
| 课程管理 | 课程 CRUD、上下架、分类联动、视频上传 |
| 分类管理 | 树形结构一级/二级分类 |
| 讲师管理 | 讲师 CRUD、等级、标签、头像 |
| 培训管理 | 培训项目、报名、证书 |
| 考试管理 | 题库、试卷、考试记录 |
| 运营管理 | 公告、Banner、推荐、消息推送、积分 |
| 用户管理 | 用户列表、部门、角色、权限 |
| 数据统计 | 多维度数据导出（CSV/JSON） |

---

## API 接口速查

### 课程管理

```
GET    /api/courses              - 获取所有课程
POST   /api/courses              - 添加课程
PUT    /api/courses/:id          - 更新课程
DELETE /api/courses/:id          - 删除课程
```

### 分类管理

```
GET    /api/categories            - 获取所有分类
POST   /api/categories            - 添加分类
PUT    /api/categories/:id        - 更新分类
DELETE /api/categories/:id        - 删除分类
```

### 讲师管理

```
GET    /api/lecturers             - 获取所有讲师
POST   /api/lecturers             - 添加讲师
PUT    /api/lecturers/:id         - 更新讲师
DELETE /api/lecturers/:id         - 删除讲师
```

### 数据统计与导出

```
GET    /api/stats/courses         - 课程统计
GET    /api/stats/lecturers       - 讲师统计
GET    /api/stats/users           - 学员统计
GET    /api/export/courses        - 导出课程 (CSV)
GET    /api/export/lecturers      - 导出讲师 (CSV)
GET    /api/export/users          - 导出学员 (CSV)
GET    /api/export/learning-records - 导出学习记录 (CSV)
GET    /api/export/categories     - 导出分类 (CSV)
GET    /api/export/all            - 导出全部 (JSON)
```

### 题库管理

```
GET    /api/questions/banks              - 获取题库列表
POST   /api/questions/banks              - 创建题库
GET    /api/questions/banks/:id          - 获取题库详情
PUT    /api/questions/banks/:id          - 更新题库
DELETE /api/questions/banks/:id          - 删除题库
GET    /api/questions/banks/:id/questions - 获取题目列表
POST   /api/questions                    - 创建题目
```

### 认证

```
POST /api/auth/register      - 用户注册
POST /api/auth/login         - 用户登录
POST /api/auth/logout        - 用户登出
GET  /api/auth/me            - 获取当前用户
PUT  /api/auth/profile       - 更新资料
PUT  /api/auth/password      - 修改密码
```

### 通知

```
GET  /api/notifications                - 获取通知列表
PUT  /api/notifications/:id/read       - 标记单条已读
POST /api/notifications/batch-read     - 批量标记已读
POST /api/notifications/batch-delete   - 批量删除
```

### 通用

```
GET  /api/data              - 获取所有数据
GET  /api/data/:key         - 获取指定类型数据
POST /api/upload            - 上传文件
GET  /api/health            - 健康检查
```

---

## 部署

### Railway（推荐）

1. Fork 本项目到 GitHub
2. 在 [Railway](https://railway.app) 连接 GitHub
3. 选择仓库自动部署

### Docker

```bash
docker build -t youyan-academy .
docker run -p 3003:3003 youyan-academy
```

---

## 目录结构

```
├── index.html               # 首页
├── dashboard.html           # 管理后台（统一入口，含登录弹窗）
├── course.html              # 课程中心
├── teacher.html             # 讲师风采
├── center.html              # 个人中心
├── player.html              # 课程播放
├── exam.html                # 考试页
├── training-plan.html       # 培训计划
├── training-signin.html     # 培训签到
├── messages.html            # 消息中心
├── survey.html              # 问卷调研
├── bank-detail.html         # 题库详情
├── server.js                # 服务器入口
├── server-production.js     # 生产环境服务器
├── data-api.js              # 数据 API 层
├── data.json                # 主数据存储
├── routes/                  # 路由模块
│   ├── auth-routes.js       #   认证 API
│   └── question-routes.js   #   题库 API
├── css/                     # 样式文件
│   ├── admin.css            #   管理后台样式
│   └── mobile-enhanced.css  #   移动端增强样式
├── js/                      # 客户端脚本
│   ├── auth-guard.js        #   登录认证守卫
│   ├── auth-modal.js        #   登录弹窗组件
│   ├── notification.js      #   通知铃铛系统
│   ├── course-enhanced.js   #   课程页逻辑
│   ├── index-enhanced.js    #   首页逻辑
│   ├── teacher-enhanced.js  #   讲师页逻辑
│   ├── certificate-management.js  # 证书管理
│   ├── question-management.js     # 题库管理
│   └── data-sync.js         #   数据同步
├── scripts/                 # 工具脚本
│   ├── init-database.js     #   数据库初始化
│   └── test-*.js            #   测试脚本
└── uploads/                 # 上传资源
    ├── avatars/             #   用户头像
    ├── cert-templates/      #   证书模板
    ├── covers/              #   课程/活动封面
    ├── videos/              #   课程视频
    ├── images/              #   公告封面
    └── training/            #   培训图片
```

---

## 常见问题

**Q: npm 命令不存在？**
需要先安装 Node.js：https://nodejs.org/

**Q: 端口被占用？**
修改 `server.js` 中的端口号，或关闭占用 3003 端口的程序。

**Q: 数据库初始化失败？**
确保已安装依赖（`npm install`），再运行 `node scripts/init-database.js`。

**Q: 健康检查地址？**
访问 http://localhost:3003/api/health 查看服务状态。
