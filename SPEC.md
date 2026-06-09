# 游雁学院后台管理系统规范

## 1. 项目概述

**项目名称**: 游雁学院后台管理系统
**项目类型**: 企业学习平台管理后台
**核心功能**: 课程管理、分类管理、讲师管理、数据统计
**目标用户**: 平台管理员

## 2. 系统架构

### 2.1 技术栈
- **前端**: HTML5 + Tailwind CSS + Vanilla JavaScript
- **后端**: Node.js + Express.js
- **数据存储**: JSON 文件 (data.json)
- **端口**: 3003

### 2.2 页面结构
```
dashboard.html       - 管理后台主页（入口，含考试管理）
admin-course.html   - 课程管理页面
admin-category.html - 分类管理页面
admin-lecturer.html - 讲师管理页面
admin-stats.html    - 数据统计页面
```

## 3. 功能模块详细设计

### 3.1 课程管理

#### 功能列表
- [x] 课程列表展示（分页、筛选）
- [x] 新增课程（弹窗表单）
- [x] 编辑课程
- [x] 删除课程（二次确认）
- [x] 上架/下架课程
- [x] 课程分类联动
- [x] 讲师选择联动
- [x] 视频上传（本地/URL）
- [x] 自动识别视频时长
- [x] 封面图片上传
- [x] 发布后同步至首页、课程中心

#### 课程弹窗字段
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 课程名称 | text | 是 | 最长100字符 |
| 课程封面 | file/url | 是 | 支持本地上传或URL |
| 课程分类 | select | 是 | 一级+二级联动 |
| 讲师 | select | 是 | 从讲师列表选择 |
| 课程描述 | textarea | 否 | 最长500字符 |
| 视频 | file/url | 是 | 支持单个/多个视频 |
| 发布/取消 | button | - | 发布保存，取消不保存 |

#### 课程状态
- `draft`: 草稿
- `published`: 已发布
- `offline`: 已下架

### 3.2 分类管理

#### 功能列表
- [x] 树形结构展示一级/二级分类
- [x] 新增一级分类
- [x] 新增二级分类
- [x] 编辑分类名称
- [x] 删除分类（二次确认，有课程时禁止删除）
- [x] 拖拽排序
- [x] 实时同步至课程中心

#### 分类数据结构
```json
{
  "id": 1,
  "name": "技术",
  "key": "tech",
  "icon": "fa-code",
  "children": [
    { "id": 11, "name": "前端开发", "key": "frontend" }
  ]
}
```

### 3.3 讲师管理

#### 功能列表
- [x] 讲师列表展示（卡片/表格视图）
- [x] 新增讲师（弹窗表单）
- [x] 编辑讲师
- [x] 删除讲师（二次确认）
- [x] 讲师状态启用/禁用
- [x] 头像上传/预览
- [x] 等级设置（首席/高级/中级/初级）
- [x] 标签管理
- [x] 实时同步至讲师风采页面

#### 讲师弹窗字段
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 讲师类型 | select | 是 | 内聘/外聘 |
| 讲师姓名 | text | 是 | 最长50字符 |
| 部门 | text | 否 | 所属部门 |
| 头像 | file | 否 | 支持预览 |
| 等级 | select | 是 | 首席/高级/中级/初级 |
| 标签 | tag-input | 否 | 多个标签 |
| 登记时间 | date | 是 | 默认当天 |

### 3.4 数据统计

#### 功能列表
- [x] 课程数据统计与导出
- [x] 讲师数据统计与导出
- [x] 学员数据统计与导出
- [x] 学习记录数据导出
- [x] Excel 格式导出（CSV）

#### 统计指标
| 模块 | 指标 | 说明 |
|------|------|------|
| 课程 | 总数、已发布、草稿、已下架 | 按状态分类统计 |
| 讲师 | 总数、启用、禁用 | 按状态分类统计 |
| 学员 | 总数、活跃、活跃率 | 学习情况统计 |
| 学习记录 | 记录数、总时长、平均时长 | 学习时长统计 |

#### 导出字段

**课程导出**
- 课程ID、课程名称、分类、讲师、状态、时长、观看数、评分、创建时间

**讲师导出**
- 讲师ID、姓名、类型、部门、等级、课程数、状态、登记时间

**学员导出**
- 用户ID、用户名、姓名、部门、注册时间、最后登录、学习时长、完成课程数

**学习记录导出**
- 记录ID、用户ID、用户名、课程ID、课程名称、学习日期、学习时长

## 4. API 接口设计

### 4.1 课程管理
```
GET    /api/courses              - 获取所有课程
POST   /api/courses              - 添加课程
PUT    /api/courses/:id          - 更新课程
DELETE /api/courses/:id          - 删除课程
```

### 4.2 分类管理
```
GET    /api/categories            - 获取所有分类
POST   /api/categories            - 添加分类
PUT    /api/categories/:id        - 更新分类
DELETE /api/categories/:id        - 删除分类
```

### 4.3 讲师管理
```
GET    /api/lecturers             - 获取所有讲师
POST   /api/lecturers             - 添加讲师
PUT    /api/lecturers/:id          - 更新讲师
DELETE /api/lecturers/:id          - 删除讲师
```

### 4.4 数据统计
```
GET    /api/stats/courses         - 课程统计数据
GET    /api/stats/lecturers       - 讲师统计数据
GET    /api/stats/users           - 学员统计数据
GET    /api/export/courses        - 导出课程数据(CSV)
GET    /api/export/lecturers      - 导出讲师数据(CSV)
GET    /api/export/users          - 导出学员数据(CSV)
GET    /api/export/learning-records - 导出学习记录(CSV)
```

## 5. 数据同步机制

### 5.1 发布课程时同步
发布成功后，自动执行以下同步：
1. 更新 `course_center_sync` 数据
2. 更新 `index_featured_courses`（如果是精选课程）
3. 同步至首页 Banner

### 5.2 数据联动
- 课程管理 → 课程中心：发布后自动显示
- 分类管理 → 课程中心：实时更新分类列表
- 讲师管理 → 讲师风采：新增后自动显示

## 6. UI 设计规范

### 6.1 色彩系统
```
Primary:    #3B82F6 (蓝色)
Success:    #10B981 (绿色)
Warning:    #F59E0B (橙色)
Danger:     #EF4444 (红色)
Gray-50:   #F9FAFB
Gray-100:  #F3F4F6
Gray-200:  #E5E7EB
Gray-500:  #6B7280
Gray-700:  #374151
Gray-900:  #111827
```

### 6.2 组件样式
- 按钮：圆角 6px，hover 效果
- 卡片：圆角 8px，阴影
- 表格：隔行变色，hover 高亮
- 弹窗：居中显示，遮罩层 rgba(0,0,0,0.5)

### 6.3 响应式设计
- 桌面端：完整布局
- 平板端：侧边栏折叠
- 移动端：汉堡菜单

## 7. 验收标准

### 7.1 功能验收
- [x] 课程上传、下架、删除功能正常
- [x] 课程弹窗所有字段可正常填写和保存
- [x] 发布的课程同步显示在首页和课程中心
- [x] 分类增删改功能正常
- [x] 讲师增删改功能正常
- [x] 数据导出功能正常（CSV格式）

### 7.2 性能验收
- 页面加载时间 < 2秒
- API响应时间 < 500ms
- 数据同步延迟 < 1秒

### 7.3 兼容性验收
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 8. 测试地址

```
后台管理主页: http://localhost:3003/dashboard.html
课程管理:    http://localhost:3003/admin-course.html
分类管理:    http://localhost:3003/admin-category.html
讲师管理:    http://localhost:3003/admin-lecturer.html
数据统计:    http://localhost:3003/admin-stats.html

前端页面:
首页:       http://localhost:3003/
课程中心:   http://localhost:3003/course
讲师风采:   http://localhost:3003/teacher
个人中心:   http://localhost:3003/center
```

## 9. 管理员账号

```
用户名: admin
密码: admin2026
```
