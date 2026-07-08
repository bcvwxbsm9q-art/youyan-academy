/**
 * 考试评分逻辑按题型测试
 * 覆盖题型：single(单选)、multiple(多选)、judge(判断)、fill(填空)、essay(简答)
 * 验证点：各题型得分、漏选得分、及格线、满分汇总、得分率
 */

// ============================================================
// 1. 评分工具函数（与 server.js 中逻辑保持一致）
// ============================================================

function normalizeJudgeAnswer(val) {
  const v = String(val || '').trim().toLowerCase();
  if (['a', '正确', 'true', '1', '对', 'yes'].includes(v)) return true;
  if (['b', '错误', 'false', '0', '错', 'no'].includes(v)) return false;
  return null;
}

function judgeAnswerToAB(val) {
  const b = normalizeJudgeAnswer(val);
  if (b === true) return 'A';
  if (b === false) return 'B';
  return val;
}

function scoreQuestion(q, eq, userAnswer, partialScore) {
  const qScore = eq.score !== undefined && eq.score !== null ? eq.score : 1;
  let isCorrect = false;
  let earnedScore = 0;

  if (q.type === 'multiple') {
    const ua = (userAnswer || '').replace(/\s/g, '').split('').sort().join('');
    const caRaw = Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '');
    const ca = caRaw.replace(/\s/g, '').split('').sort().join('');
    isCorrect = ua === ca && ua !== '';
    if (isCorrect) {
      earnedScore = qScore;
    } else if (ua !== '') {
      const correctSet = new Set(ca.split(''));
      const userSet = new Set(ua.split(''));
      const hasWrong = [...userSet].some(ch => !correctSet.has(ch));
      if (!hasWrong && userSet.size > 0) {
        if (partialScore !== null) {
          earnedScore = partialScore;
        } else {
          earnedScore = Math.round(qScore * userSet.size / correctSet.size);
        }
      }
    }
  } else if (q.type === 'judge') {
    const userBool = normalizeJudgeAnswer(userAnswer);
    const correctBool = normalizeJudgeAnswer(q.answer);
    isCorrect = userBool !== null && userBool === correctBool;
    earnedScore = isCorrect ? qScore : 0;
  } else {
    isCorrect = String(userAnswer).trim() === String(q.answer || '').trim() && userAnswer !== '';
    earnedScore = isCorrect ? qScore : 0;
  }

  return { isCorrect, earnedScore, qScore };
}

function scoreExam(exam, questions, answers) {
  const examQuestions = exam.questions || [];
  let correctCount = 0;
  let totalScore = 0;
  const detail = [];

  examQuestions.forEach(eq => {
    const q = questions.find(qq => qq.id === eq.questionId);
    if (!q) return;
    const partialScore = eq.partialScore !== undefined && eq.partialScore !== null ? eq.partialScore : null;
    const userAnswer = (answers || {})[String(q.id)] || '';
    const { isCorrect, earnedScore, qScore } = scoreQuestion(q, eq, userAnswer, partialScore);

    if (isCorrect) correctCount++;
    totalScore += earnedScore;

    detail.push({
      questionId: q.id,
      type: q.type,
      userAnswer: q.type === 'judge' ? judgeAnswerToAB(userAnswer) : userAnswer,
      correctAnswer: q.type === 'judge' ? judgeAnswerToAB(q.answer) : (Array.isArray(q.answer) ? q.answer.join('') : (q.answer || '')),
      isCorrect,
      earnedScore,
      qScore
    });
  });

  const finalScore = Math.round(totalScore);
  const fullScore = examQuestions.reduce((s, eq) => s + (eq.score !== undefined && eq.score !== null ? eq.score : 1), 0);
  const effectivePassingScore = (exam.passingScore !== undefined && exam.passingScore !== null)
    ? exam.passingScore
    : Math.max(1, Math.ceil(fullScore * 0.6));
  const passed = finalScore >= effectivePassingScore;
  const percent = fullScore > 0 ? Math.round(finalScore / fullScore * 100) : 0;

  return { finalScore, fullScore, effectivePassingScore, passed, percent, correctCount, detail };
}

// ============================================================
// 2. 测试题库
// ============================================================

const testQuestions = [
  { id: 101, type: 'single', title: '单选题示例', answer: 'A' },
  { id: 102, type: 'multiple', title: '多选题示例（设置漏选分）', answer: ['A', 'B', 'C'] },
  { id: 103, type: 'multiple', title: '多选题示例（无漏选分，按比例）', answer: 'ACD' },
  { id: 104, type: 'judge', title: '判断题示例', answer: '正确' },
  { id: 105, type: 'fill', title: '填空题示例', answer: '光合作用' },
  { id: 106, type: 'essay', title: '简答题示例', answer: '通过氧化还原反应释放能量。' }
];

const examWithPartial = {
  id: 1,
  title: '全题型评分测试（含漏选分）',
  passingScore: 60,
  questions: [
    { questionId: 101, score: 10 },                        // 单选 10
    { questionId: 102, score: 20, partialScore: 5 },       // 多选 20，漏选 5
    { questionId: 103, score: 20 },                        // 多选 20，按比例
    { questionId: 104, score: 10 },                        // 判断 10
    { questionId: 105, score: 20 },                        // 填空 20
    { questionId: 106, score: 40 }                         // 简答 40
  ]
};

const examWithoutPassingScore = {
  id: 2,
  title: '及格线默认计算测试',
  questions: [
    { questionId: 101, score: 10 },
    { questionId: 104, score: 10 }
  ]
};

// ============================================================
// 3. 测试用例
// ============================================================

const testCases = [
  // ---------------- 单选题 ----------------
  {
    name: '单选：回答正确得满分',
    exam: examWithPartial,
    answers: { '101': 'A' },
    expect: { finalScore: 10, fullScore: 120, passed: false, percent: 8 }
  },
  {
    name: '单选：回答错误得 0 分',
    exam: examWithPartial,
    answers: { '101': 'B' },
    expect: { finalScore: 0, fullScore: 120, percent: 0 }
  },
  {
    name: '单选：未作答得 0 分',
    exam: examWithPartial,
    answers: { '101': '' },
    expect: { finalScore: 0, fullScore: 120, percent: 0 }
  },

  // ---------------- 多选题 ----------------
  {
    name: '多选：全部选对得满分（partialScore 配置）',
    exam: examWithPartial,
    answers: { '102': 'ABC' },
    expectDetail: { questionId: 102, earnedScore: 20, isCorrect: true }
  },
  {
    name: '多选：漏选（无错选）按 partialScore 给分',
    exam: examWithPartial,
    answers: { '102': 'AB' },
    expectDetail: { questionId: 102, earnedScore: 5, isCorrect: false }
  },
  {
    name: '多选：错选得 0 分',
    exam: examWithPartial,
    answers: { '102': 'ABD' },
    expectDetail: { questionId: 102, earnedScore: 0, isCorrect: false }
  },
  {
    name: '多选：未作答得 0 分',
    exam: examWithPartial,
    answers: { '102': '' },
    expectDetail: { questionId: 102, earnedScore: 0, isCorrect: false }
  },
  {
    name: '多选：无 partialScore，漏选按比例给分',
    exam: examWithPartial,
    answers: { '103': 'AD' },
    expectDetail: { questionId: 103, earnedScore: 13, isCorrect: false } // round(20*2/3)=13
  },
  {
    name: '多选：无 partialScore，全对得满分',
    exam: examWithPartial,
    answers: { '103': 'ACD' },
    expectDetail: { questionId: 103, earnedScore: 20, isCorrect: true }
  },

  // ---------------- 判断题 ----------------
  {
    name: '判断：回答正确（A）得满分',
    exam: examWithPartial,
    answers: { '104': 'A' },
    expectDetail: { questionId: 104, earnedScore: 10, isCorrect: true }
  },
  {
    name: '判断：回答正确（"正确"）得满分',
    exam: examWithPartial,
    answers: { '104': '正确' },
    expectDetail: { questionId: 104, earnedScore: 10, isCorrect: true }
  },
  {
    name: '判断：回答正确（"true"）得满分',
    exam: examWithPartial,
    answers: { '104': 'true' },
    expectDetail: { questionId: 104, earnedScore: 10, isCorrect: true }
  },
  {
    name: '判断：回答错误（B）得 0 分',
    exam: examWithPartial,
    answers: { '104': 'B' },
    expectDetail: { questionId: 104, earnedScore: 0, isCorrect: false }
  },
  {
    name: '判断：未作答得 0 分',
    exam: examWithPartial,
    answers: { '104': '' },
    expectDetail: { questionId: 104, earnedScore: 0, isCorrect: false }
  },

  // ---------------- 填空题 ----------------
  {
    name: '填空：精确匹配得满分',
    exam: examWithPartial,
    answers: { '105': '光合作用' },
    expectDetail: { questionId: 105, earnedScore: 20, isCorrect: true }
  },
  {
    name: '填空：前后空格忽略后匹配得满分',
    exam: examWithPartial,
    answers: { '105': '  光合作用  ' },
    expectDetail: { questionId: 105, earnedScore: 20, isCorrect: true }
  },
  {
    name: '填空：错误答案得 0 分',
    exam: examWithPartial,
    answers: { '105': '呼吸作用' },
    expectDetail: { questionId: 105, earnedScore: 0, isCorrect: false }
  },
  {
    name: '填空：未作答得 0 分',
    exam: examWithPartial,
    answers: { '105': '' },
    expectDetail: { questionId: 105, earnedScore: 0, isCorrect: false }
  },

  // ---------------- 简答题 ----------------
  {
    name: '简答：精确匹配得满分',
    exam: examWithPartial,
    answers: { '106': '通过氧化还原反应释放能量。' },
    expectDetail: { questionId: 106, earnedScore: 40, isCorrect: true }
  },
  {
    name: '简答：答案错误得 0 分',
    exam: examWithPartial,
    answers: { '106': '我不知道' },
    expectDetail: { questionId: 106, earnedScore: 0, isCorrect: false }
  },

  // ---------------- 整卷与及格线 ----------------
  {
    name: '整卷：全部正确得满分并及格',
    exam: examWithPartial,
    answers: { '101': 'A', '102': 'ABC', '103': 'ACD', '104': 'A', '105': '光合作用', '106': '通过氧化还原反应释放能量。' },
    expect: { finalScore: 120, fullScore: 120, passed: true, percent: 100, correctCount: 6 }
  },
  {
    name: '整卷：部分得分，得分率与及格判定正确',
    exam: examWithPartial,
    answers: { '101': 'A', '102': 'AB', '103': 'AD', '104': 'B', '105': '光合作用', '106': '' },
    expect: { finalScore: 48, fullScore: 120, passed: false, percent: 40, correctCount: 2 }
  },
  {
    name: '及格线：未设置时按 60% 向上取整',
    exam: examWithoutPassingScore,
    answers: { '101': 'A', '104': 'A' },
    expect: { finalScore: 20, fullScore: 20, effectivePassingScore: 12, passed: true, percent: 100 }
  },
  {
    name: '及格线：未设置时低分不过',
    exam: examWithoutPassingScore,
    answers: { '101': 'B', '104': 'A' },
    expect: { finalScore: 10, fullScore: 20, effectivePassingScore: 12, passed: false, percent: 50 }
  }
];

// ============================================================
// 4. 断言执行
// ============================================================

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  期望: ${expected}\n  实际: ${actual}`);
  }
}

console.log(`开始执行 ${testCases.length} 个评分测试用例...\n`);

testCases.forEach((tc, idx) => {
  try {
    const result = scoreExam(tc.exam, testQuestions, tc.answers);

    if (tc.expect) {
      if (tc.expect.finalScore !== undefined) assertEqual(result.finalScore, tc.expect.finalScore, '总分不一致');
      if (tc.expect.fullScore !== undefined) assertEqual(result.fullScore, tc.expect.fullScore, '满分不一致');
      if (tc.expect.passed !== undefined) assertEqual(result.passed, tc.expect.passed, '及格判定不一致');
      if (tc.expect.percent !== undefined) assertEqual(result.percent, tc.expect.percent, '得分率不一致');
      if (tc.expect.correctCount !== undefined) assertEqual(result.correctCount, tc.expect.correctCount, '正确题数不一致');
      if (tc.expect.effectivePassingScore !== undefined) assertEqual(result.effectivePassingScore, tc.expect.effectivePassingScore, '及格线不一致');
    }

    if (tc.expectDetail) {
      const d = result.detail.find(x => x.questionId === tc.expectDetail.questionId);
      if (!d) throw new Error(`未找到题目 ${tc.expectDetail.questionId} 的评分详情`);
      if (tc.expectDetail.earnedScore !== undefined) assertEqual(d.earnedScore, tc.expectDetail.earnedScore, '单题得分不一致');
      if (tc.expectDetail.isCorrect !== undefined) assertEqual(d.isCorrect, tc.expectDetail.isCorrect, '单题是否正确不一致');
    }

    console.log(`[PASS] ${idx + 1}. ${tc.name}`);
    passedCount++;
  } catch (err) {
    console.log(`[FAIL] ${idx + 1}. ${tc.name}`);
    console.log(`       ${err.message}`);
    failedCount++;
    failures.push({ name: tc.name, error: err.message });
  }
});

console.log(`\n==============================`);
console.log(`测试完成：通过 ${passedCount} / 失败 ${failedCount} / 总计 ${testCases.length}`);
console.log(`==============================`);

if (failedCount > 0) {
  console.log('\n失败用例摘要：');
  failures.forEach(f => console.log(` - ${f.name}`));
  process.exit(1);
}
