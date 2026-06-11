import re

# 读取文件
with open('center.html', 'r', encoding='utf-8') as f:
    content = f.read()

print("开始应用修改...")

# 修改1: 删除"学习统计"Tab中的"已完成课程明细"部分
pattern1 = r'\s+<!-- 课程完成明细 -->\s+<div class="bg-gray-50 rounded-xl p-6">\s+<h4 class="font-bold text-gray-700 mb-4">\s+<i class="fa fa-list-ul mr-2 text-gray-500"></i>已完成课程明细\s+</h4>\s+<div id="completed-courses-list" class="space-y-3">\s+<div class="text-center py-8 text-gray-400">\s+<i class="fa fa-inbox text-4xl mb-2"></i>\s+<p>暂无已完成的课程</p>\s+<p class="text-sm mt-1">开始学习视频课程，完成后将显示在这里</p>\s+</div>\s+</div>\s+</div>'
content = re.sub(pattern1, '', content)
print("✓ 已删除'已完成课程明细'部分")

# 修改2: 简化"我的课程"Tab - 删除统计卡片
pattern2 = r'<!-- 我的课程 -->\s+<div class="tab-content active" id="my-courses-content">\s+<!-- 学习统计 -->\s+<div class="grid grid-cols-3 gap-6 mb-6">.*?</div>\s+<!-- 学习图表 -->\s+<div class="bg-white rounded-xl shadow-md p-6 mb-6">.*?</div>'
replacement2 = '''<!-- 我的课程 -->
                        <div class="tab-content active" id="my-courses-content">'''
content = re.sub(pattern2, replacement2, content, flags=re.DOTALL)
print("✓ 已简化'我的课程'Tab（删除统计卡片和图表）")

# 修改3: 删除JavaScript中对已删除元素的引用 - 删除 initLearningChart() 调用
pattern3 = r'\s+initLearningChart\(\);'
content = re.sub(pattern3, '', content)
print("✓ 已删除 initLearningChart() 调用")

# 修改4: 删除对 binded-email 的引用
pattern4 = r"\s+// 更新邮箱\s+document\.getElementById\('binded-email'\)\.textContent = currentUser\.email \|\| '未绑定';"
content = re.sub(pattern4, '', content)
print("✓ 已删除对 binded-email 的引用")

# 写入文件
with open('center.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n所有修改已成功应用！")
