/**
 * 题库管理系统 - 前端逻辑
 * 功能：题库管理、试题管理、导入导出
 */

// 当前选中的题库 ID
let currentBankId = null;
let selectedFile = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    loadQuestionBanks();
    updateStatistics();
});

// ========== 题库管理 ==========

/**
 * 加载题库列表
 */
async function loadQuestionBanks() {
    try {
        const response = await fetch('/api/question-banks');
        const banks = await response.json();
        renderQuestionBankList(banks);
        updateStatistics(banks);
    } catch (error) {
        console.error('加载题库失败:', error);
        showToast('加载题库失败', 'error');
    }
}

/**
 * 渲染题库列表
 */
function renderQuestionBankList(banks) {
    const tbody = document.getElementById('question-bank-list');
    if (!tbody) return;

    if (banks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-12 text-gray-400">
                    <i class="fa fa-inbox text-4xl mb-4"></i>
                    <p>暂无题库数据</p>
                    <button onclick="showCreateBankModal()" class="btn-primary mt-4 px-6 py-2 rounded-lg">
                        <i class="fa fa-plus mr-2"></i>新建题库
                    </button>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = banks.map(bank => `
        <tr>
            <td class="text-center">
                <input type="checkbox" class="rounded bank-checkbox" value="${bank.id}">
            </td>
            <td class="text-sm text-gray-500">${bank.id}</td>
            <td>
                <div class="font-medium text-gray-800">${bank.name}</div>
                ${bank.description ? `<div class="text-xs text-gray-400 mt-1">${bank.description}</div>` : ''}
            </td>
            <td>
                <span class="badge badge-primary">${getCategoryName(bank.category)}</span>
            </td>
            <td class="text-sm">${bank.questionCount || 0}</td>
            <td class="text-sm">${bank.usageCount || 0}</td>
            <td class="text-sm text-gray-500">${formatDate(bank.createdAt)}</td>
            <td>
                <span class="badge ${bank.status === 'active' ? 'badge-success' : 'badge-gray'}">
                    ${bank.status === 'active' ? '启用' : '停用'}
                </span>
            </td>
            <td class="text-center">
                <button onclick="enterQuestionManage(${bank.id}, '${bank.name}')" class="text-primary hover:text-blue-700 mx-1" title="管理试题">
                    <i class="fa fa-edit"></i>
                </button>
                <button onclick="editQuestionBank(${bank.id})" class="text-blue-600 hover:text-blue-800 mx-1" title="编辑">
                    <i class="fa fa-pencil"></i>
                </button>
                <button onclick="deleteQuestionBank(${bank.id})" class="text-red-600 hover:text-red-700 mx-1" title="删除">
                    <i class="fa fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * 显示新建题库模态框
 */
function showCreateBankModal() {
    document.getElementById('create-bank-modal').classList.remove('hidden');
}

/**
 * 关闭新建题库模态框
 */
function closeCreateBankModal() {
    document.getElementById('create-bank-modal').classList.add('hidden');
    document.getElementById('create-bank-form').reset();
}

/**
 * 保存题库
 */
async function saveQuestionBank(event) {
    event.preventDefault();
    
    const data = {
        name: document.getElementById('bank-name').value,
        category: document.getElementById('bank-category').value,
        description: document.getElementById('bank-description').value,
        status: 'active'
    };

    try {
        const response = await fetch('/api/question-banks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showToast('题库创建成功', 'success');
            closeCreateBankModal();
            loadQuestionBanks();
        } else {
            showToast('创建失败', 'error');
        }
    } catch (error) {
        console.error('创建题库失败:', error);
        showToast('创建失败', 'error');
    }
}

/**
 * 编辑题库
 */
async function editQuestionBank(id) {
    try {
        // 先获取题库详情
        const response = await fetch(`/api/question-banks/${id}`);
        if (!response.ok) {
            showToast('获取题库信息失败', 'error');
            return;
        }
        
        const bank = await response.json();
        
        // 填充表单数据
        document.getElementById('edit-bank-id').value = bank.id;
        document.getElementById('edit-bank-name').value = bank.name;
        document.getElementById('edit-bank-category').value = bank.category;
        document.getElementById('edit-bank-description').value = bank.description || '';
        document.getElementById('edit-bank-status').value = bank.status;
        
        // 显示编辑模态框
        document.getElementById('edit-bank-modal').classList.remove('hidden');
    } catch (error) {
        console.error('编辑题库失败:', error);
        showToast('加载题库信息失败', 'error');
    }
}

/**
 * 保存编辑的题库
 */
async function updateQuestionBank(event) {
    event.preventDefault();
    
    const id = document.getElementById('edit-bank-id').value;
    const data = {
        name: document.getElementById('edit-bank-name').value,
        category: document.getElementById('edit-bank-category').value,
        description: document.getElementById('edit-bank-description').value,
        status: document.getElementById('edit-bank-status').value
    };

    try {
        const response = await fetch(`/api/question-banks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showToast('题库更新成功', 'success');
            document.getElementById('edit-bank-modal').classList.add('hidden');
            loadQuestionBanks();
        } else {
            showToast('更新失败', 'error');
        }
    } catch (error) {
        console.error('更新题库失败:', error);
        showToast('更新失败', 'error');
    }
}

/**
 * 删除题库
 */
async function deleteQuestionBank(id) {
    if (!confirm('确定要删除这个题库吗？此操作不可恢复。')) return;

    try {
        const response = await fetch(`/api/question-banks/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('题库删除成功', 'success');
            loadQuestionBanks();
        } else {
            showToast('删除失败', 'error');
        }
    } catch (error) {
        console.error('删除题库失败:', error);
        showToast('删除失败', 'error');
    }
}

/**
 * 搜索题库
 */
async function searchQuestionBanks() {
    const name = document.getElementById('search-bank-name').value;
    const category = document.getElementById('search-category').value;
    const date = document.getElementById('search-date').value;

    const params = new URLSearchParams();
    if (name) params.append('name', name);
    if (category) params.append('category', category);
    if (date) params.append('date', date);

    try {
        const response = await fetch(`/api/question-banks/search?${params}`);
        const banks = await response.json();
        renderQuestionBankList(banks);
    } catch (error) {
        console.error('搜索题库失败:', error);
        showToast('搜索失败', 'error');
    }
}

/**
 * 更新统计数据
 */
function updateStatistics(banks) {
    if (!banks) return;
    
    document.getElementById('stat-total-banks').textContent = banks.length;
    document.getElementById('stat-total-questions').textContent = '0';
    document.getElementById('stat-single-choice').textContent = '0';
    document.getElementById('stat-multiple-choice').textContent = '0';
}
// ========== 试题管理 ==========

/**
 * 进入试题管理页面
 */
function enterQuestionManage(bankId, bankName) {
    currentBankId = bankId;
    document.getElementById('current-bank-name').textContent = bankName + ' - 试题管理';
    document.getElementById('section-question-bank').classList.add('hidden');
    document.getElementById('section-question-manage').classList.remove('hidden');
    loadQuestions(bankId);
}

/**
 * 加载试题列表
 */
async function loadQuestions(bankId) {
    try {
        const response = await fetch(`/api/questions?bankId=${bankId}`);
        const questions = await response.json();
        renderQuestionList(questions);
    } catch (error) {
        console.error('加载试题失败:', error);
        showToast('加载试题失败', 'error');
    }
}

/**
 * 渲染试题列表
 */
function renderQuestionList(questions) {
    const tbody = document.getElementById('question-list');
    if (!tbody) return;

    if (questions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-12 text-gray-400">
                    <i class="fa fa-inbox text-4xl mb-4"></i>
                    <p>暂无试题</p>
                    <div class="mt-4 space-x-3">
                        <button onclick="showCreateQuestionModal()" class="btn-primary px-6 py-2 rounded-lg">
                            <i class="fa fa-plus mr-2"></i>新建试题
                        </button>
                        <button onclick="showImportModal()" class="btn-secondary px-6 py-2 rounded-lg">
                            <i class="fa fa-upload mr-2"></i>导入试题
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = questions.map(q => `
        <tr>
            <td class="text-center">
                <input type="checkbox" class="rounded question-checkbox" value="${q.id}">
            </td>
            <td>
                <span class="badge ${getTypeBadgeClass(q.type)}">${getTypeName(q.type)}</span>
            </td>
            <td>
                <div class="text-sm text-gray-800 line-clamp-2">${q.content}</div>
            </td>
            <td>
                <span class="badge ${getDifficultyBadgeClass(q.difficulty)}">${getDifficultyName(q.difficulty)}</span>
            </td>
            <td class="text-xs text-gray-500">${q.knowledge || '-'}</td>
            <td class="text-sm text-gray-500">${formatDate(q.createdAt)}</td>
            <td class="text-center">
                <button onclick="editQuestion(${q.id})" class="text-blue-600 hover:text-blue-800 mx-1" title="编辑">
                    <i class="fa fa-pencil"></i>
                </button>
                <button onclick="deleteQuestion(${q.id})" class="text-red-600 hover:text-red-700 mx-1" title="删除">
                    <i class="fa fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * 显示新建试题模态框
 */
function showCreateQuestionModal() {
    document.getElementById('create-question-modal').classList.remove('hidden');
}

/**
 * 关闭新建试题模态框
 */
function closeCreateQuestionModal() {
    document.getElementById('create-question-modal').classList.add('hidden');
    resetQuestionForm();
}

/**
 * 重置试题表单
 */
function resetQuestionForm() {
    document.getElementById('create-question-form').reset();
    document.getElementById('options-container').classList.add('hidden');
    document.getElementById('answer-container').innerHTML = '';
}

/**
 * 题型变化处理
 */
function onQuestionTypeChange() {
    const type = document.getElementById('question-type').value;
    const optionsContainer = document.getElementById('options-container');
    const answerContainer = document.getElementById('answer-container');
    
    optionsContainer.classList.add('hidden');
    answerContainer.innerHTML = '';

    if (type === 'single' || type === 'multiple') {
        optionsContainer.classList.remove('hidden');
        renderOptionsInput(type);
    } else if (type === 'judge') {
        renderJudgeAnswer();
    } else if (type === 'fill') {
        renderFillAnswer();
    } else if (type === 'essay') {
        renderEssayAnswer();
    }
}

/**
 * 渲染选项输入（单选/多选）
 */
function renderOptionsInput(type) {
    const container = document.getElementById('options-list');
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    container.innerHTML = labels.map((label, index) => `
        <div class="option-item" data-label="${label}">
            <div class="option-label">${label}</div>
            <input type="text" class="form-input flex-1 option-input" 
                   placeholder="请输入选项内容" data-index="${index}">
            <input type="${type === 'single' ? 'radio' : 'checkbox'}" 
                   name="correct-answer" class="ml-3 correct-answer" value="${label}" title="设为正确答案">
        </div>
    `).join('');
}

/**
 * 渲染判断题答案
 */
function renderJudgeAnswer() {
    const container = document.getElementById('answer-container');
    container.innerHTML = `
        <label class="inline-flex items-center mr-6">
            <input type="radio" name="correct-answer" value="T" class="mr-2"> 正确
        </label>
        <label class="inline-flex items-center">
            <input type="radio" name="correct-answer" value="F" class="mr-2"> 错误
        </label>
    `;
}

/**
 * 渲染填空题答案
 */
function renderFillAnswer() {
    const container = document.getElementById('answer-container');
    container.innerHTML = `
        <input type="text" class="form-input w-full" id="fill-answer" 
               placeholder="请输入正确答案，多个答案用 | 分割">
    `;
}

/**
 * 渲染简答题答案
 */
function renderEssayAnswer() {
    const container = document.getElementById('answer-container');
    container.innerHTML = `
        <textarea class="form-input w-full" id="essay-answer" rows="3" 
                  placeholder="请输入参考答案要点"></textarea>
    `;
}

/**
 * 添加选项
 */
function addOption() {
    showToast('最多支持 8 个选项', 'info');
}

/**
 * 保存试题
 */
async function saveQuestion() {
    const type = document.getElementById('question-type').value;
    const content = document.getElementById('question-content').value;
    const difficulty = document.getElementById('question-difficulty').value;
    const knowledge = document.getElementById('question-knowledge').value;
    const analysis = document.getElementById('question-analysis').value;

    if (!type || !content) {
        showToast('请填写必填项', 'error');
        return;
    }

    let answer = null;
    let options = null;

    // 收集答案和选项
    if (type === 'single' || type === 'multiple') {
        const selectedAnswers = Array.from(document.querySelectorAll('input[name="correct-answer"]:checked'))
                                      .map(el => el.value);
        if (selectedAnswers.length === 0) {
            showToast('请选择正确答案', 'error');
            return;
        }
        answer = type === 'single' ? selectedAnswers[0] : selectedAnswers.join(',');
        
        options = Array.from(document.querySelectorAll('.option-input')).map(input => ({
            label: input.parentElement.querySelector('.option-label').textContent,
            content: input.value
        })).filter(opt => opt.content);
    } else if (type === 'judge') {
        const checked = document.querySelector('input[name="correct-answer"]:checked');
        if (!checked) {
            showToast('请选择正确答案', 'error');
            return;
        }
        answer = checked.value;
    } else if (type === 'fill') {
        answer = document.getElementById('fill-answer').value;
    } else if (type === 'essay') {
        answer = document.getElementById('essay-answer').value;
    }

    const data = {
        bankId: currentBankId,
        type,
        content,
        options,
        answer,
        analysis,
        knowledge,
        difficulty
    };

    try {
        const response = await fetch('/api/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showToast('试题保存成功', 'success');
            closeCreateQuestionModal();
            loadQuestions(currentBankId);
        } else {
            showToast('保存失败', 'error');
        }
    } catch (error) {
        console.error('保存试题失败:', error);
        showToast('保存失败', 'error');
    }
}

/**
 * 编辑试题
 */
async function editQuestion(id) {
    try {
        // 获取试题详情
        const response = await fetch(`/api/questions/${id}`);
        if (!response.ok) {
            showToast('获取试题信息失败', 'error');
            return;
        }
        
        const question = await response.json();
        
        // 填充表单数据
        document.getElementById('edit-question-id').value = question.id;
        document.getElementById('edit-question-type').value = question.type;
        document.getElementById('edit-question-content').value = question.content;
        document.getElementById('edit-question-difficulty').value = question.difficulty;
        document.getElementById('edit-question-knowledge').value = question.knowledge || '';
        document.getElementById('edit-question-analysis').value = question.analysis || '';
        
        // 根据题型渲染不同的编辑界面
        onEditQuestionTypeChange(question);
        
        // 显示编辑模态框
        document.getElementById('edit-question-modal').classList.remove('hidden');
    } catch (error) {
        console.error('编辑试题失败:', error);
        showToast('加载试题信息失败', 'error');
    }
}

/**
 * 编辑试题时根据题型渲染不同界面
 */
function onEditQuestionTypeChange(question) {
    const type = question.type;
    const optionsContainer = document.getElementById('edit-options-container');
    const answerContainer = document.getElementById('edit-answer-container');
    
    optionsContainer.classList.add('hidden');
    answerContainer.innerHTML = '';

    if (type === 'single' || type === 'multiple') {
        optionsContainer.classList.remove('hidden');
        renderEditOptionsInput(type, question.options, question.answer);
    } else if (type === 'judge') {
        renderEditJudgeAnswer(question.answer);
    } else if (type === 'fill') {
        renderEditFillAnswer(question.answer);
    } else if (type === 'essay') {
        renderEditEssayAnswer(question.answer);
    }
}

/**
 * 渲染编辑选项输入
 */
function renderEditOptionsInput(type, options, answer) {
    const container = document.getElementById('edit-options-list');
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const answers = answer.split(',');
    
    container.innerHTML = labels.map((label, index) => {
        const option = options ? options.find(o => o.label === label) : null;
        const content = option ? option.content : '';
        const isChecked = answers.includes(label) ? 'checked' : '';
        
        return `
        <div class="option-item" data-label="${label}">
            <div class="option-label">${label}</div>
            <input type="text" class="form-input flex-1 option-input" 
                   value="${content}" placeholder="请输入选项内容" data-index="${index}">
            <input type="${type === 'single' ? 'radio' : 'checkbox'}" 
                   name="edit-correct-answer" class="ml-3 correct-answer" value="${label}" ${isChecked}>
        </div>
    `;
    }).join('');
}

/**
 * 渲染编辑判断题答案
 */
function renderEditJudgeAnswer(answer) {
    const container = document.getElementById('edit-answer-container');
    const tChecked = answer === 'T' ? 'checked' : '';
    const fChecked = answer === 'F' ? 'checked' : '';
    
    container.innerHTML = `
        <label class="inline-flex items-center mr-6">
            <input type="radio" name="edit-correct-answer" value="T" class="mr-2" ${tChecked}> 正确
        </label>
        <label class="inline-flex items-center">
            <input type="radio" name="edit-correct-answer" value="F" class="mr-2" ${fChecked}> 错误
        </label>
    `;
}

/**
 * 渲染编辑填空题答案
 */
function renderEditFillAnswer(answer) {
    const container = document.getElementById('edit-answer-container');
    container.innerHTML = `
        <input type="text" class="form-input w-full" id="edit-fill-answer" 
               value="${answer}" placeholder="请输入正确答案，多个答案用 | 分割">
    `;
}

/**
 * 渲染编辑简答题答案
 */
function renderEditEssayAnswer(answer) {
    const container = document.getElementById('edit-answer-container');
    container.innerHTML = `
        <textarea class="form-input w-full" id="edit-essay-answer" rows="3" 
                  placeholder="请输入参考答案要点">${answer}</textarea>
    `;
}

/**
 * 保存编辑的试题
 */
async function updateQuestion() {
    const id = document.getElementById('edit-question-id').value;
    const type = document.getElementById('edit-question-type').value;
    const content = document.getElementById('edit-question-content').value;
    const difficulty = document.getElementById('edit-question-difficulty').value;
    const knowledge = document.getElementById('edit-question-knowledge').value;
    const analysis = document.getElementById('edit-question-analysis').value;

    if (!type || !content) {
        showToast('请填写必填项', 'error');
        return;
    }

    let answer = null;
    let options = null;

    // 收集答案和选项
    if (type === 'single' || type === 'multiple') {
        const selectedAnswers = Array.from(document.querySelectorAll('input[name="edit-correct-answer"]:checked'))
                                      .map(el => el.value);
        if (selectedAnswers.length === 0) {
            showToast('请选择正确答案', 'error');
            return;
        }
        answer = type === 'single' ? selectedAnswers[0] : selectedAnswers.join(',');
        
        options = Array.from(document.querySelectorAll('#edit-options-list .option-input')).map(input => ({
            label: input.parentElement.querySelector('.option-label').textContent,
            content: input.value
        })).filter(opt => opt.content);
    } else if (type === 'judge') {
        const checked = document.querySelector('input[name="edit-correct-answer"]:checked');
        if (!checked) {
            showToast('请选择正确答案', 'error');
            return;
        }
        answer = checked.value;
    } else if (type === 'fill') {
        answer = document.getElementById('edit-fill-answer').value;
    } else if (type === 'essay') {
        answer = document.getElementById('edit-essay-answer').value;
    }

    const data = {
        type,
        content,
        options,
        answer,
        analysis,
        knowledge,
        difficulty
    };

    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showToast('试题更新成功', 'success');
            document.getElementById('edit-question-modal').classList.add('hidden');
            loadQuestions(currentBankId);
        } else {
            showToast('更新失败', 'error');
        }
    } catch (error) {
        console.error('更新试题失败:', error);
        showToast('更新失败', 'error');
    }
}

/**
 * 删除试题
 */
async function deleteQuestion(id) {
    if (!confirm('确定要删除这道试题吗？')) return;

    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('试题删除成功', 'success');
            loadQuestions(currentBankId);
        } else {
            showToast('删除失败', 'error');
        }
    } catch (error) {
        console.error('删除试题失败:', error);
        showToast('删除失败', 'error');
    }
}
// ========== 导入导出功能 ==========

/**
 * 显示导入模态框
 */
function showImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
}

/**
 * 关闭导入模态框
 */
function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
    selectedFile = null;
    document.getElementById('import-file').value = '';
    document.getElementById('import-preview').classList.add('hidden');
}

/**
 * 文件选择处理
 */
function onFileSelected() {
    const fileInput = document.getElementById('import-file');
    const file = fileInput.files[0];
    
    if (file) {
        selectedFile = file;
        document.getElementById('selected-file-name').textContent = file.name;
        document.getElementById('import-preview').classList.remove('hidden');
    }
}

/**
 * 开始导入
 */
async function startImport() {
    if (!selectedFile) {
        showToast('请选择要导入的文件', 'error');
        return;
    }

    // 检查文件类型
    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        showToast('请上传 Excel 文件（.xlsx 或.xls 格式）', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('bankId', currentBankId);

    try {
        showToast('正在导入试题...', 'info');
        
        const response = await fetch('/api/questions/import', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            const successCount = result.success || 0;
            const failedCount = result.failed || 0;
            showToast(`导入完成！成功：${successCount}道，失败：${failedCount}道`, 'success');
            closeImportModal();
            loadQuestions(currentBankId);
        } else {
            const errorMsg = result.error || '导入失败';
            showToast(`导入失败：${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('导入试题失败:', error);
        showToast('导入失败：服务器错误，请确保后端已安装 xlsx 库', 'error');
    }
}

/**
 * 导出试题
 */
async function exportQuestions() {
    if (!currentBankId) {
        showToast('请先选择题库', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/questions/export?bankId=${currentBankId}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `题库导出_${new Date().getTime()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('导出成功', 'success');
        } else {
            showToast('导出失败', 'error');
        }
    } catch (error) {
        console.error('导出试题失败:', error);
        showToast('导出失败', 'error');
    }
}

// ========== 页面切换 ==========

/**
 * 切换页面区域
 */
function showSection(section) {
    // 隐藏所有 section
    document.getElementById('section-question-bank').classList.add('hidden');
    document.getElementById('section-question-manage').classList.add('hidden');
    
    // 移除所有菜单激活状态
    document.querySelectorAll('.sidebar-active').forEach(el => {
        el.classList.remove('sidebar-active');
    });

    // 显示目标 section
    if (section === 'question-bank') {
        document.getElementById('section-question-bank').classList.remove('hidden');
        document.getElementById('menu-question-bank').classList.add('sidebar-active');
        loadQuestionBanks();
    } else if (section === 'exam-manage') {
        document.getElementById('menu-exam-manage').classList.add('sidebar-active');
        showToast('考试管理功能开发中', 'info');
    } else if (section === 'practice-manage') {
        document.getElementById('menu-practice-manage').classList.add('sidebar-active');
        showToast('练习管理功能开发中', 'info');
    } else if (section === 'exam-analysis') {
        document.getElementById('menu-exam-analysis').classList.add('sidebar-active');
        showToast('考试分析功能开发中', 'info');
    }
}

// ========== 工具函数 ==========

/**
 * 获取分类名称
 */
function getCategoryName(key) {
    const categories = {
        'planning': '策划',
        'art': '美术',
        'tech': '技术',
        'operation': '运营',
        'softskill': '软技能'
    };
    return categories[key] || key;
}

/**
 * 获取题型名称
 */
function getTypeName(type) {
    const types = {
        'single': '单选题',
        'multiple': '多选题',
        'judge': '判断题',
        'fill': '填空题',
        'essay': '简答题'
    };
    return types[type] || type;
}

/**
 * 获取题型标签样式
 */
function getTypeBadgeClass(type) {
    const classes = {
        'single': 'type-single',
        'multiple': 'type-multiple',
        'judge': 'type-judge',
        'fill': 'type-fill',
        'essay': 'type-essay'
    };
    return classes[type] || 'badge-gray';
}

/**
 * 获取难度名称
 */
function getDifficultyName(level) {
    const levels = {
        'easy': '简单',
        'medium': '中等',
        'hard': '困难'
    };
    return levels[level] || level;
}

/**
 * 获取难度标签样式
 */
function getDifficultyBadgeClass(level) {
    const classes = {
        'easy': 'badge-success',
        'medium': 'badge-warning',
        'hard': 'badge-danger'
    };
    return classes[level] || 'badge-gray';
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

/**
 * 显示提示消息
 */
function showToast(message, type = 'info') {
    // 简单的 toast 实现
    const colors = {
        'success': '#10b981',
        'error': '#ef4444',
        'info': '#667eea'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);
