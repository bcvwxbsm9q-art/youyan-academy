# 试卷实体契约合规 Rubric

> 版本：1.1.0
> 对应契约：public/schema/paper-schema.json、public/interface_stub/paper_service.pyi、public/config_template/paper-config-schema.json

## 通过标准

以下检查项全部通过，方可视为试卷实体三层契约有效。

### 1. 数据契约 schema

- [ ] `paper-schema.json` 为合法 JSON Schema (draft-07)。
- [ ] 定义 `Paper`、`PaperQuestion`、`PaperOption` 三个类型。
- [ ] `Paper` 必填字段：`id`、`name`、`type`、`status`、`createdAt`、`updatedAt`。
- [ ] `Paper.status` 枚举值为：`draft`、`published`、`enabled`、`disabled`。
- [ ] `Paper.type` 枚举值为：`fixed`、`random`。
- [ ] `Paper` 包含字段：`categoryId`、`categoryName`、`category`、`description`、`questions`、`totalScore`、`duration`、`passScore`、`maxAttempts`、`shuffle`、`showAnswer`、`uniformScore`、`creator`、`createdBy`。
- [ ] `PaperQuestion` 必填字段：`questionId`。
- [ ] `PaperQuestion.type` 枚举值为：`single`、`multiple`、`judge`、`fill`、`essay`。
- [ ] `PaperQuestion.options` 数组项为 `PaperOption` 结构，至少包含 `label` 与 `text`。
- [ ] 顶层 `papers` 为数组，元素符合 `Paper` 定义。

### 2. 接口契约 stub

- [ ] `paper_service.pyi` 声明 `PaperService` 类。
- [ ] 包含方法：`list_papers`、`get_paper`、`create_paper`、`update_paper`、`delete_paper`、`migrate_local_papers`。
- [ ] 包含类型别名：`PaperStatus`、`PaperType`、`QuestionType`。
- [ ] 包含统一错误码 `ERROR_CODES`。
- [ ] 版本号与 schema/config 一致（1.1.0）。

### 3. 配置契约

- [ ] `paper-config-schema.json` 为合法 JSON Schema。
- [ ] 包含 `paper` 业务配置与 `migration` 迁移配置。
- [ ] `paper.defaultStatus` 枚举值与 `Paper.status` 一致。
- [ ] 包含默认字段：`defaultDuration`、`defaultPassScore`、`defaultMaxAttempts`、`defaultShuffle`、`defaultShowAnswer`。
- [ ] 版本号与 schema/stub 一致（1.1.0）。

### 4. 可验证性

- [ ] 存在 `scripts/test-paper-contract.js` 且可独立运行。
- [ ] 运行后所有断言通过。

### 5. Mock 一致性

- [ ] `public/pre_generated_mock/paper-mock.js` 中的默认 Paper 样本符合 schema。
- [ ] Mock API 方法签名与 `paper_service.pyi` 一致。
