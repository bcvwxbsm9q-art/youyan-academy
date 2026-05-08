/**
 * ============================================================
 * 个人中心增强功能 - 移动端优化版本
 * ============================================================
 */

(function() {
    'use strict';

    let learningChart = null;

    document.addEventListener('DOMContentLoaded', function() {
        // 初始化数据 API
        if (window.DataAPI) {
            window.DataAPI.init().then(() => {
                initCenter();
            }).catch(err => {
                console.error('DataAPI 初始化失败:', err);
                initCenter();
            });
        } else {
            initCenter();
        }

        // 移动端菜单
        const mobileMenuBtn = document.getElementById('mobile-menu-button');
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenuBtn && mobileMenu) {
            mobileMenuBtn.addEventListener('click', () => {
                mobileMenu.classList.toggle('hidden');
            });
        }

        // 用户菜单切换
        const userMenuBtn = document.getElementById('user-menu-button');
        const userMenu = document.getElementById('user-menu');
        if (userMenuBtn && userMenu) {
            userMenuBtn.addEventListener('click', function() {
                userMenu.classList.toggle('hidden');
            });

            // 点击其他地方关闭用户菜单
            document.addEventListener('click', function(event) {
                if (!userMenuBtn.contains(event.target) && !userMenu.contains(event.target)) {
                    userMenu.classList.add('hidden');
                }
            });
        }

        // 桌面端侧边导航切换
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const tab = this.dataset.tab;
                switchTab(tab);
            });
        });

        // 移动端底部导航切换
        document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item').forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const tab = this.dataset.tab;
                switchTab(tab);
                
                // 更新激活状态
                document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
            });
        });

        // 初始化图表
        initLearningChart();
    });

    /**
     * 初始化个人中心
     */
    function initCenter() {
        loadMyCourses();
        updateStats();
    }

    /**
     * 切换标签页
     */
    function switchTab(tabName) {
        // 隐藏所有内容
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        // 显示目标内容
        const targetContent = document.getElementById(`${tabName}-content`);
        if (targetContent) {
            targetContent.classList.remove('hidden');
            targetContent.classList.add('fade-in');
        }

        // 更新桌面端导航状态
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('nav-active');
                btn.classList.remove('hover:bg-gray-100', 'dark:hover:bg-gray-700');
            } else {
                btn.classList.remove('nav-active');
                btn.classList.add('hover:bg-gray-100', 'dark:hover:bg-gray-700');
            }
        });
    }

    /**
     * 加载我的课程
     */
    function loadMyCourses() {
        const api = window.DataAPI;
        const allCourses = (api && api.getCourses()) || [];
        
        // 模拟用户已学课程（实际应从用户数据获取）
        const inProgressIds = [1, 2];
        const completedIds = [3, 4, 5];

        const inProgressCourses = inProgressIds.map(id => allCourses.find(c => c.id === id)).filter(Boolean);
        const completedCourses = completedIds.map(id => allCourses.find(c => c.id === id)).filter(Boolean);

        renderInProgressCourses(inProgressCourses);
        renderCompletedCourses(completedCourses);
    }

    /**
     * 渲染进行中的课程
     */
    function renderInProgressCourses(courses) {
        const container = document.getElementById('in-progress-courses');
        if (!container) return;

        if (!courses.length) {
            container.innerHTML = `
                <div class="empty-state py-8">
                    <div class="empty-state-icon"><i class="fa fa-book"></i></div>
                    <div class="empty-state-title">暂无进行中的课程</div>
                    <div class="empty-state-desc">快去课程中心开始学习吧</div>
                </div>
            `;
            return;
        }

        container.innerHTML = courses.map(c => {
            const progress = Math.floor(Math.random() * 60) + 20; // 模拟进度
            
            return `
            <div class="bg-white dark:bg-darkgray rounded-xl shadow-md overflow-hidden card-hover cursor-pointer" onclick="location.href='player.html?courseId=${c.id}'">
                <div class="flex flex-col sm:flex-row">
                    <div class="sm:w-48 flex-shrink-0">
                        <img src="${c.cover || ''}" alt="${c.title}" class="w-full h-32 sm:h-full object-cover" onerror="this.src='https://placehold.co/192x128/667eea/white?text=Course'">
                    </div>
                    <div class="p-4 flex-1">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-gray-800 dark:text-white line-clamp-2">${c.title}</h4>
                            <span class="tag tag-orange ml-2 flex-shrink-0">进行中</span>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <i class="fa fa-user mr-1"></i>${(api && api.getLecturerName(c.lecturerId)) || '待定讲师'}
                        </p>
                        <div class="mb-2">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-gray-600 dark:text-gray-400">学习进度</span>
                                <span class="font-medium text-primary">${progress}%</span>
                            </div>
                            <div class="progress-enhanced">
                                <div class="progress-bar" style="width: ${progress}%"></div>
                            </div>
                        </div>
                        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span><i class="fa fa-clock-o mr-1"></i>已学 ${Math.floor(progress / 10)} 小时</span>
                            <button class="text-primary hover:underline font-medium">继续学习</button>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    /**
     * 渲染已完成的课程
     */
    function renderCompletedCourses(courses) {
        const container = document.getElementById('completed-courses');
        if (!container) return;

        if (!courses.length) {
            container.innerHTML = `
                <div class="empty-state py-8">
                    <div class="empty-state-icon"><i class="fa fa-check-circle"></i></div>
                    <div class="empty-state-title">暂无完成的课程</div>
                    <div class="empty-state-desc">完成课程后在这里查看记录</div>
                </div>
            `;
            return;
        }

        container.innerHTML = courses.map(c => {
            const completedDate = new Date().toLocaleDateString('zh-CN');
            
            return `
            <div class="bg-white dark:bg-darkgray rounded-xl shadow-md overflow-hidden card-hover cursor-pointer" onclick="location.href='player.html?courseId=${c.id}'">
                <div class="flex flex-col sm:flex-row">
                    <div class="sm:w-48 flex-shrink-0">
                        <img src="${c.cover || ''}" alt="${c.title}" class="w-full h-32 sm:h-full object-cover" onerror="this.src='https://placehold.co/192x128/10b981/white?text=Done'">
                    </div>
                    <div class="p-4 flex-1">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-gray-800 dark:text-white line-clamp-2">${c.title}</h4>
                            <span class="tag tag-green ml-2 flex-shrink-0">已完成</span>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <i class="fa fa-calendar mr-1"></i>完成于 ${completedDate}
                        </p>
                        <div class="flex items-center gap-4 text-sm">
                            <button class="text-primary hover:underline font-medium">
                                <i class="fa fa-play mr-1"></i>复习
                            </button>
                            <button class="text-gray-600 dark:text-gray-400 hover:underline">
                                <i class="fa fa-download mr-1"></i>下载证书
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    /**
     * 更新统计数据
     */
    function updateStats() {
        // 模拟数据动画
        animateValue('stat-hours', 0, 24.5, 1500, val => val.toFixed(1));
        animateValue('stat-completed', 0, 8, 1500);
        animateValue('stat-progress', 0, 68, 1500, val => val + '%');
    }

    /**
     * 数值动画
     */
    function animateValue(elementId, start, end, duration, formatFn) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const range = end - start;
        const increment = range / (duration / 16);
        let current = start;
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            
            if (progress < duration) {
                current += increment;
                element.textContent = formatFn ? formatFn(current) : Math.floor(current);
                requestAnimationFrame(step);
            } else {
                element.textContent = formatFn ? formatFn(end) : end;
            }
        }

        requestAnimationFrame(step);
    }

    /**
     * 初始化学习进度图表
     */
    function initLearningChart() {
        const ctx = document.getElementById('learning-chart');
        if (!ctx) return;

        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#9ca3af' : '#6b7280';
        const gridColor = isDark ? '#374151' : '#e5e7eb';

        learningChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
                datasets: [{
                    label: '学习时长（小时）',
                    data: [2.5, 3.2, 1.8, 4.1, 3.5, 5.2, 4.2],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1f2937' : '#fff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: gridColor,
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y + ' 小时';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: textColor
                        }
                    },
                    y: {
                        grid: {
                            color: gridColor
                        },
                        ticks: {
                            color: textColor,
                            callback: function(value) {
                                return value + 'h';
                            }
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // 监听暗黑模式变化
    const observer = new MutationObserver(() => {
        if (learningChart) {
            learningChart.destroy();
            setTimeout(initLearningChart, 100);
        }
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
    });

})();
