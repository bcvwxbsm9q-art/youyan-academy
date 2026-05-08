# 游雁学院后台管理系统

## 概述

游雁学院后台管理系统为企业学习平台提供完整的后台管理功能，包括课程管理、分类管理、讲师管理、数据统计等模块。

## 功能模块

### 1. 课程管理 (`admin-course.html`)

**功能特性：**
- 课程列表展示（搜索、筛选、分页）
- 新增课程（弹窗表单）
- 编辑课程
- 删除课程（二次确认）
- 上架/下架课程
- 课程分类联动（一级+二级分类）
- 讲师选择联动
- 视频上传（支持单个/多个视频）
- 封面图片上传/URL
- 发布后自动同步至首页、课程中心

**课程弹窗字段：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 课程名称 | text | 是 | 最长100字符 |
| 课程封面 | file/url | 是 | 支持本地上传或URL |
| 课程分类 | select | 是 | 一级+二级联动 |
| 讲师 | select | 是 | 从讲师列表选择 |
| 课程描述 | textarea | 否 | 最长500字符 |
| 视频 | file/url | 是 | 支持单个/多个视频 |
| 发布/取消 | button | - | 发布保存，取消不保存 |

### 2. 分类管理 (`admin-category.html`)

**功能特性：**
- 树形结构展示一级/二级分类
- 新增一级分类
- 新增二级分类
- 编辑分类名称、标识、图标
- 删除分类（二次确认，有课程时禁止删除）
- 实时同步至课程中心

### 3. 讲师管理 (`admin-lecturer.html`)

**功能特性：**
- 讲师卡片列表展示
- 新增讲师（弹窗表单）
- 编辑讲师信息
- 删除讲师（二次确认）
- 讲师状态启用/禁用
- 头像上传/预览
- 等级设置（首席/高级/中级/初级）
- 标签管理
- 实时同步至讲师风采页面

**讲师弹窗字段：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 讲师类型 | select | 是 | 内聘/外聘 |
| 讲师姓名 | text | 是 | 最长50字符 |
| 部门 | text | 否 | 所属部门 |
| 头像 | file | 否 | 支持预览 |
| 等级 | select | 是 | 首席/高级/中级/初级 |
| 标签 | tag-input | 否 | 多个标签 |
| 登记时间 | date | 是 | 默认当天 |

### 4. 数据统计 (`admin-stats.html`)

**功能特性：**
- 课程数据统计与导出（CSV）
- 讲师数据统计与导出（CSV）
- 学员数据统计与导出（CSV）
- 学习记录数据导出（CSV）
- 分类数据导出（CSV）
- 全部数据导出（JSON）
- 导出日志记录

**导出字段：**

**课程导出**
- 课程ID、课程名称、分类、讲师、状态、时长、观看数、评分、创建时间

**讲师导出**
- 讲师ID、姓名、类型、部门、等级、课程数、状态、登记时间

**学员导出**
- 用户ID、用户名、姓名、部门、注册时间、最后登录、学习时长、完成课程数

**学习记录导出**
- 记录ID、用户ID、用户名、课程ID、课程名称、学习日期、学习时长

## 访问地址

### 前端页面
```
首页:       http://localhost:3003/
课程中心:   http://localhost:3003/course
讲师风采:   http://localhost:3003/teacher
个人中心:   http://localhost:3003/center
课程播放:   http://localhost:3003/player
```

### 管理后台
```
管理主页:   http://localhost:3003/admin.html
课程管理:   http://localhost:3003/admin-course.html
分类管理:   http://localhost:3003/admin-category.html
讲师管理:   http://localhost:3003/admin-lecturer.html
数据统计:   http://localhost:3003/admin-stats.html
```

### 其他管理页面
```
题库管理:   http://localhost:3003/admin-question.html
培训管理:   http://localhost:3003/admin-training.html
用户管理:   http://localhost:3003/admin-users.html
运营管理:   http://localhost:3003/admin-operation.html
```

## API 接口

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
GET    /api/stats                 - 获取统计数据
GET    /api/export/courses        - 导出课程数据(CSV)
GET    /api/export/lecturers      - 导出讲师数据(CSV)
GET    /api/export/users          - 导出学员数据(CSV)
GET    /api/export/learning-records - 导出学习记录(CSV)
GET    /api/export/categories     - 导出分类数据(CSV)
GET    /api/export/all            - 导出全部数据(JSON)
```

## 管理员账号

```
用户名: admin
密码: admin2026
```

## 数据同步机制

### 发布课程时同步
发布成功后，自动执行以下同步：
1. 更新 `course_center_sync` 数据
2. 同步至首页 Banner
3. 同步至课程中心

### 数据联动
- 课程管理 → 课程中心：发布后自动显示
- 分类管理 → 课程中心：实时更新分类列表
- 讲师管理 → 讲师风采：新增后自动显示

## 快速开始

### 1. 启动服务器
```bash
npm start
```

### 2. 访问管理后台
在浏览器中打开 `http://localhost:3003/admin.html`

### 3. 登录
使用管理员账号登录（admin / admin2026）

### 4. 开始管理
- 点击「课程管理」添加和管理课程
- 点击「分类管理」管理课程分类
- 点击「讲师管理」添加和管理讲师
- 点击「数据统计」导出所需数据

## 技术栈

- **前端**: HTML5 + Tailwind CSS + Vanilla JavaScript
- **后端**: Node.js + Express.js
- **数据存储**: JSON 文件
- **端口**: 3003

## 文件结构

```
├── admin.html           # 管理后台主页
├── admin-course.html    # 课程管理
├── admin-category.html  # 分类管理
├── admin-lecturer.html  # 讲师管理
├── admin-stats.html     # 数据统计
├── server.js           # 后端服务
├── data.json           # 数据存储
└── SPEC.md             # 功能规范文档
```

---
最后更新: 2026-04-29
