/**
 * 试卷实体三层契约自检脚本
 * 不依赖外部校验库，手动检查 schema、interface stub、config template 的关键约束。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'public', 'schema', 'paper-schema.json');
const STUB_PATH = path.join(ROOT, 'public', 'interface_stub', 'paper_service.pyi');
const CONFIG_PATH = path.join(ROOT, 'public', 'config_template', 'paper-config-schema.json');

let passed = 0;
let failed = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

console.log('\n--- 1. 数据契约 schema 检查 ---');
{
  const schema = readJSON(SCHEMA_PATH);
  assert('schema 是合法 JSON', !!schema);
  assert('schema 包含 Paper 定义', !!schema.definitions.Paper);
  assert('schema 包含 PaperQuestion 定义', !!schema.definitions.PaperQuestion);
  assert('schema 包含 PaperOption 定义', !!schema.definitions.PaperOption);

  const paper = schema.definitions.Paper;
  const required = paper.required || [];
  assert('Paper 必填字段包含 id,name,type,status,createdAt,updatedAt',
    ['id', 'name', 'type', 'status', 'createdAt', 'updatedAt'].every(f => required.includes(f)));

  const statusEnum = paper.properties.status.enum || [];
  assert('Paper status 枚举包含 draft/published/enabled/disabled',
    ['draft', 'published', 'enabled', 'disabled'].every(s => statusEnum.includes(s)));

  const typeEnum = paper.properties.type.enum || [];
  assert('Paper type 枚举包含 fixed/random',
    ['fixed', 'random'].every(s => typeEnum.includes(s)));

  const qTypes = schema.definitions.PaperQuestion.properties.type.enum || [];
  assert('PaperQuestion type 枚举包含 single/multiple/judge/fill/essay',
    ['single', 'multiple', 'judge', 'fill', 'essay'].every(t => qTypes.includes(t)));

  ['duration', 'passScore', 'maxAttempts', 'shuffle', 'showAnswer', 'uniformScore'].forEach(field => {
    assert(`Paper 包含字段 ${field}`, !!paper.properties[field], `缺失 ${field}`);
  });

  const optionProps = schema.definitions.PaperOption.properties || {};
  assert('PaperOption 包含 label 字段', !!optionProps.label);
  assert('PaperOption 包含 text 字段', !!optionProps.text);
}

console.log('\n--- 2. 接口契约 stub 检查 ---');
{
  const stub = readText(STUB_PATH);
  assert('stub 文件可读', stub.length > 0);
  assert('stub 声明 list_papers 方法', /def list_papers/.test(stub));
  assert('stub 声明 get_paper 方法', /def get_paper/.test(stub));
  assert('stub 声明 create_paper 方法', /def create_paper/.test(stub));
  assert('stub 声明 update_paper 方法', /def update_paper/.test(stub));
  assert('stub 声明 delete_paper 方法', /def delete_paper/.test(stub));
  assert('stub 包含状态枚举 PaperStatus', /PaperStatus\s*=/.test(stub));
  assert('stub 包含 draft/published/enabled/disabled', /"draft".+"published".+"enabled".+"disabled"/.test(stub));
  assert('stub 版本号 1.1.0', /版本：1\.1\.0/.test(stub));
}

console.log('\n--- 3. 配置契约检查 ---');
{
  const config = readJSON(CONFIG_PATH);
  assert('config 是合法 JSON', !!config);
  assert('config 包含 paper 业务配置', !!config.properties.paper);
  assert('config 包含 migration 迁移配置', !!config.properties.migration);

  const paperProps = config.properties.paper.properties || {};
  assert('config defaultStatus 枚举包含 draft/published/enabled/disabled',
    (paperProps.defaultStatus.enum || []).length === 4);
  ['defaultDuration', 'defaultPassScore', 'defaultMaxAttempts', 'defaultShuffle', 'defaultShowAnswer'].forEach(field => {
    assert(`config 包含 ${field}`, !!paperProps[field], `缺失 ${field}`);
  });
  assert('config 版本号 1.1.0', /1\.1\.0/.test(config.description));
}

console.log('\n--- 4. 样本数据合规检查 ---');
{
  const schema = readJSON(SCHEMA_PATH);
  const sample = {
    id: 'paper-test-001',
    name: '契约测试试卷',
    categoryId: 'cat-1',
    categoryName: '技术',
    type: 'fixed',
    description: '测试',
    questions: [
      {
        questionId: 1,
        score: 5,
        partialScore: 0,
        order: 0,
        content: '题干',
        type: 'single',
        options: [{ label: 'A', text: '选项A' }],
        answer: 'A',
        explanation: '解析'
      }
    ],
    totalScore: 5,
    duration: 60,
    passScore: 60,
    maxAttempts: 0,
    shuffle: false,
    showAnswer: true,
    uniformScore: 5,
    status: 'draft',
    creator: '管理员',
    createdBy: '管理员',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const paperReq = schema.definitions.Paper.required || [];
  assert('样本满足 Paper 必填字段', paperReq.every(f => sample[f] != null));
  assert('样本 status 在枚举内', schema.definitions.Paper.properties.status.enum.includes(sample.status));
  assert('样本 type 在枚举内', schema.definitions.Paper.properties.type.enum.includes(sample.type));
  assert('样本 question type 在枚举内',
    schema.definitions.PaperQuestion.properties.type.enum.includes(sample.questions[0].type));
}

console.log(`\nTotal: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
