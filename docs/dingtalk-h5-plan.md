# 有研学院 · 钉钉工作台 H5 接入方案

> 目标：把现有「有研学院」学习平台以 H5 微应用形式挂到钉钉工作台，实现手机端
> **播放视频、查看公告、扫码签到、考试、调研**，并让这些移动端数据在**管理后台可查看、可导出**。
> 定位：**薄接入层 + 最大化复用现有后端**，不推倒重做。

---

## 一、现状盘点（已具备，可直接复用）

后端 `server.js` 已存在完整能力，无需从零开发：

| 能力 | 现有接口 / 数据 | 说明 |
|------|----------------|------|
| 培训事件 | `training_events`（含 `signinEnabled` / `signinCode` / `signinStartTime` / `signinEndTime` / `surveyEnabled` / `linkedSurveyId`） | 签到与调研已和培训打通 |
| 签到 | `GET/POST /api/training/:id/signins`、`POST /api/training/:id/signin` | 已写 `training_signins`，当前为「按钮点击」式，**缺扫码** |
| 调研 | `GET /api/surveys/:id`、`POST /api/surveys/:id/responses`、`/api/training/:id/survey-responses` | 完整 CRUD + 答卷 |
| 考试 | `/api/exams/:id/take|enter|submit|abandon`、`/api/training/:id/exam-results` | 完整考试流程 + 成绩 |
| 公告 | `GET /api/notices`、`/api/notices/:id/visit`、`/api/notifications`（公告自动转通知） | 公告查看现成 |
| 视频 | `player.html` + `/uploads/videos/*` | 播放现成，仅需钉钉 webview 适配 |
| 导出 | `GET /api/export/*`（xlsx） | 现有导出模式可直接套用签到/考试/调研 |
| 用户 | `data.registered_users`（id / username / phone / realName / department / position） | **缺 `dingtalkUserId` 字段** |

**结论**：真正要新建的只有 4 块——①钉钉免登鉴权 ②JSAPI 签名 ③扫码签到流程 ④管理后台"移动端数据"看板；其余全部复用。

---

## 二、目标架构

```
员工手机(钉钉工作台)
      │  点击工作台应用
      ▼
┌─────────────────────────────────────┐
│  H5 微应用 (复用现有页面 + 适配层)      │
│  视频 / 公告 / 扫码签到 / 考试 / 调研    │
└─────────────────────────────────────┘
      │ 免登 authCode          │ dd.config / 扫一扫
      ▼                        ▼
┌──────────────┐        ┌────────────────────┐
│ 钉钉开放平台   │        │   Express 后端       │
│ token/userid  │◄───────│  (Railway, HTTPS)   │
└──────────────┘ 验签    └────────────────────┘
                                  │ 读写
                                  ▼
                          data.json (registered_users + 各类记录)
                                  ▲
                                  │ 查看 / 导出 (xlsx)
                                  │
                          管理后台 dashboard.html
                          (新增: 钉钉签到 / 移动端数据看板)
```

---

## 三、需要新建的 4 块能力

### 1) 钉钉免登鉴权（后端）
- 环境变量：`DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET` / `AGENT_ID` / `CORP_ID`（放 Railway 环境变量，不入仓库）
- `GET /api/dingtalk/jsapi-config?url=xxx`：返回 `dd.config` 所需签名（appId / timestamp / nonceStr / signature），后端缓存 `jsapi_ticket`
- `POST /api/dingtalk/login`：前端拿 `authCode` → 后端调钉钉 `user/getuserinfo` 换 `dingtalkUserId` → 映射到 `registered_users` → 签发现有 JWT
- `registered_users` 增加 `dingtalkUserId` 字段；首次免登按**手机号**自动匹配（推荐），匹配不到则由管理员在后台导入映射或手动绑定

### 2) JSAPI 适配层（前端 `js/dingtalk-sdk.js`）
- 检测 UA（`navigator.userAgent.includes('DingTalk')`），非钉钉环境降级为现有 JWT 登录
- 封装：`initConfig()`（dd.config 签名）、`getAuthCode()`（免登）、`scanQR()`（扫一扫）
- 所有现有页面（index / course / player / messages / exam / survey）统一引用，零侵入式增强

### 3) 扫码签到流程（核心新功能）
- **管理后台**：培训详情页新增「生成签到码」按钮 → 后端生成带 `token` 的签到 URL：`/checkin.html?token=xxx&trainingId=yyy`
- **大屏/物料**：用 `qrcode` 库（前端）或后端生成二维码图片，投影/打印
- **手机端**：员工用钉钉「扫一扫」扫二维码 → 在钉钉内打开 `checkin.html` → 免登识别身份 → `POST /api/training/:id/signin`（携带内部 userId，复用现有去重/时间窗逻辑）
- 可选增强：地理位置围栏、签到码有效期、防代签（同一设备/同一钉钉号）

### 4) 管理后台"移动端数据"看板（查看 + 导出）
- **查看**：复用现有 `GET /api/training/:id/signins`、`/survey-responses`、`/exam-results`，在 dashboard 新增面板
  - 签到：按培训维度列出签到人/时间/方式，统计签到率
  - 调研：答卷明细 + 题目维度统计
  - 考试：成绩明细 + 通过率 + 排名
- **导出**：新增 `GET /api/export/signins?trainingId=`、`/api/export/exam-results?trainingId=`、`/api/export/survey-responses?surveyId=` —— 直接复用现有 xlsx 导出封装
- **统一看板**：一个「移动端数据」汇总页，把签到率 / 调研参与率 / 考试通过率合并展示，支持按培训筛选、一键导出

---

## 四、对现有代码的改动范围（最小化）

| 文件 | 改动 |
|------|------|
| `server.js` | 新增钉钉路由（login / jsapi-config / 签到码生成）；`registered_users` 写入 `dingtalkUserId`；新增 3 个导出接口 |
| `data.json` | 用户记录增加 `dingtalkUserId` 字段（后端兼容旧数据） |
| `js/dingtalk-sdk.js` | **新增**，统一钉钉适配 |
| `checkin.html` | **新增**，扫码签到页 |
| `dashboard.html` | 新增「钉钉签到 / 移动端数据」侧边栏与面板 |
| 现有页面 | 仅追加引用 `dingtalk-sdk.js`，业务逻辑不变 |

---

## 五、部署与配置前置

1. **创建钉钉应用**：钉钉开发者后台 → 企业内部应用（H5 微应用），拿到 AppKey / AppSecret / AgentId
2. **工作台首页**：填写 Railway 公网 HTTPS 地址（如 `https://youyan.up.railway.app`）
3. **可信域名**：把该域名加入应用的「安全域名 / 可信域名」白名单（JSAPI 必填）
4. **出网验证**：Railway 服务需能访问 `oapi.dingtalk.com` / `qyapi.dingtalk.com`（拿 token / userid）。沙箱可能受限，但生产 Railway 一般可达；上线前务必做一次连通性测试
5. **HTTPS**：Railway 默认提供，满足钉钉 H5 强制 HTTPS 要求

---

## 六、风险与注意点

- **调试环境**：JSAPI 必须在钉钉容器内运行，需用钉钉开发者工具 / 真机联调，本地浏览器无法完整测试
- **免登服务端依赖**：后端要调钉钉 API，依赖出网可达性（见上）
- **视频自动播放**：钉钉 webview 有自动播放限制，需用户手势触发（现有 `player.html` 已做静音渐进策略，基本可用）
- **并发签到**：现有签到接口已有去重，大规模现场需加幂等 + 简单限流
- **身份映射质量**：手机号不全会导致免登后无法对应到内部账号，需先治理 `registered_users` 的手机号字段

---

## 七、实施阶段（建议顺序）

- **P0 准备**：创建钉钉应用、拿 Key/Secret、加域名白名单、出网连通性测试
- **P1 免登**：`/api/dingtalk/login` + `jsapi-config` + 用户表 `dingtalkUserId` + 身份映射
- **P2 适配层**：`js/dingtalk-sdk.js` + H5 入口 + 视频/公告在钉钉内跑通
- **P3 扫码签到**：签到码生成 + `checkin.html` + 接口联调
- **P4 考试/调研**：在钉钉内注入身份跑通现有流程
- **P5 管理后台**：查看 + 导出看板
- **P6 真机联调**：上线

---

## 八、团队技术能力提升（同步进行）

作为资深开发，我会把本次集成沉淀为团队标准，避免"一次性代码"：
- **代码评审清单**：钉钉免登安全（token 缓存、签名校验）、接口幂等、错误处理规范
- **统一 API 规范文档**：请求/响应包裹格式、`success` 约定、错误码
- **DingTalk 集成模板**：`dingtalk-sdk.js` + 后端鉴权骨架，作为后续微应用复用基线
- **评审机制**：每个阶段产出 PR，我做 Code Review 并标注"为什么这样写"，把经验留在代码里

---

## 九、需要你确认的几个关键点（决定 P1 怎么落地）

1. **钉钉身份映射策略**：按手机号自动匹配（推荐）/ 管理员导入 userid 映射 / 首次进入自动建号
2. **扫码签到交互**：钉钉「扫一扫」扫大屏二维码（推荐）/ H5 内调用扫一扫 / 两者都要
3. **现有"按钮签到"**：与扫码签到并存 / 用扫码签到替换
4. **钉钉应用权限**：是否由你（或贵司 IT）创建企业内部应用并拿到 AppKey/Secret？这决定 P0 能否启动
