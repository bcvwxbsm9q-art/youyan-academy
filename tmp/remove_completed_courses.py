import re

# 读取文件
with open('center.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 定义要删除的部分（从"<!-- 课程完成明细 -->"到对应的结束标签）
pattern = r'\s+<!-- 课程完成明细 -->\s+<div class="bg-gray-50 rounded-xl p-6">\s+<h4 class="font-bold text-gray-700 mb-4">\s+<i class="fa fa-list-ul mr-2 text-gray-500"></i>已完成课程明细\s+</h4>\s+<div id="completed-courses-list" class="space-y-3">\s+<div class="text-center py-8 text-gray-400">\s+<i class="fa fa-inbox text-4xl mb-2"></i>\s+<p>暂无已完成的课程</p>\s+<p class="text-sm mt-1">开始学习视频课程，完成后将显示在这里</p>\s+</div>\s+</div>\s+</div>'

# 替换为空字符串
new_content = re.sub(pattern, '', content)

# 写入文件
with open('center.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Successfully removed "课程完成明细" section')
