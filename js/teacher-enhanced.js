/**
 * ============================================================
 * 讲师风采增强功能 - 移动端优化版本
 * ============================================================
 */

(function() {
    'use strict';

    let allLecturers = [];
    let filteredLecturers = [];
    let currentLevel = 'all';

    // 等级样式映射
    const LEVEL_STYLES = {
        'chief': { class: 'level-chief', name: '首席讲师', icon: 'fa-star' },
        'senior': { class: 'level-senior', name: '高级讲师', icon: 'fa-certificate' },
        'intermediate': { class: 'level-intermediate', name: '中级讲师', icon: 'fa-graduation-cap' },
        'junior': { class: 'level-junior', name: '初级讲师', icon: 'fa-user' },
        'trainee': { class: 'level-trainee', name: '见习讲师', icon: 'fa-user-o' }
    };

    document.addEventListener('DOMContentLoaded', function() {
        // 初始化数据 API
        if (window.DataAPI) {
            window.DataAPI.init().then(() => {
                loadLecturers();
            }).catch(err => {
                console.error('DataAPI 初始化失败:', err);
                loadLecturers();
            });
        } else {
            loadLecturers();
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

        // 搜索功能
        const searchInput = document.getElementById('teacher-search');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', function() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    filterLecturers();
                }, 300);
            });
        }

        // 等级筛选
        document.querySelectorAll('[data-level]').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('[data-level]').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentLevel = this.dataset.level;
                filterLecturers();
            });
        });

        // 排序筛选
        const sortFilter = document.getElementById('sort-filter');
        if (sortFilter) {
            sortFilter.addEventListener('change', filterLecturers);
        }

        // 监听 DataSync 模块的数据更新
        if (window.DataSync) {
            window.DataSync.listen(DataSync.EventTypes.LECTURERS, function(event) {
                console.log('[Teacher] 讲师数据更新');
                loadLecturers();
            });
        }
    });

    /**
     * 加载讲师数据
     */
    function loadLecturers() {
        const api = window.DataAPI;
        allLecturers = (api && api.getLecturers()) || [];
        
        // 只显示启用的讲师
        allLecturers = allLecturers.filter(l => l.status === 'enabled');
        
        filterLecturers();
    }

    /**
     * 筛选和排序讲师
     */
    function filterLecturers() {
        const searchTerm = document.getElementById('teacher-search')?.value.toLowerCase() || '';
        const sortBy = document.getElementById('sort-filter')?.value || 'default';

        // 筛选
        filteredLecturers = allLecturers.filter(lecturer => {
            // 等级匹配
            const matchLevel = currentLevel === 'all' || lecturer.level === currentLevel;
            
            // 搜索匹配
            const matchSearch = !searchTerm || 
                lecturer.name.toLowerCase().includes(searchTerm) ||
                (lecturer.intro && lecturer.intro.toLowerCase().includes(searchTerm)) ||
                (lecturer.skills && lecturer.skills.some(s => s.toLowerCase().includes(searchTerm)));

            return matchLevel && matchSearch;
        });

        // 排序
        filteredLecturers.sort((a, b) => {
            switch(sortBy) {
                case 'courses':
                    return (b.courseCount || 0) - (a.courseCount || 0);
                case 'name':
                    return a.name.localeCompare(b.name, 'zh-CN');
                case 'default':
                default:
                    // 按等级排序
                    const levelOrder = ['chief', 'senior', 'intermediate', 'junior', 'trainee'];
                    return levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
            }
        });

        renderLecturers();
    }

    /**
     * 渲染讲师列表
     */
    function renderLecturers() {
        const container = document.getElementById('teacher-grid');
        const emptyState = document.getElementById('empty-state');
        const countEl = document.getElementById('teacher-count');
        
        if (!container) return;

        // 更新统计
        if (countEl) {
            countEl.textContent = filteredLecturers.length;
        }

        // 空状态
        if (!filteredLecturers.length) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        container.innerHTML = filteredLecturers.map(l => {
            const levelInfo = LEVEL_STYLES[l.level] || LEVEL_STYLES['trainee'];
            
            return `
            <div class="card-enhanced lecturer-card cursor-pointer fade-in" onclick="showTeacherDetail(${l.id})">
                <div class="lecturer-avatar-wrapper">
                    <img src="${l.avatar || ''}" alt="${l.name}" class="lecturer-avatar" onerror="this.src='https://placehold.co/100x100/667eea/white?text=${encodeURIComponent(l.name.charAt(0))}'">
                    <div class="lecturer-level-badge ${levelInfo.class}">
                        <i class="fa ${levelInfo.icon}"></i>
                    </div>
                </div>
                <h3 class="text-sm md:text-base font-bold mb-1 text-gray-800 dark:text-white">${l.name}</h3>
                <div class="text-xs ${levelInfo.class} text-white px-2 py-1 rounded-full inline-block mb-2">${levelInfo.name}</div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2 px-2 h-8">${l.intro || ''}</p>
                <div class="flex items-center justify-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                    <span><i class="fa fa-book mr-1"></i>${l.courseCount || 0}课程</span>
                    <span><i class="fa fa-users mr-1"></i>${(l.students || 0) > 1000 ? ((l.students / 1000).toFixed(1) + 'k') : (l.students || 0)}</span>
                </div>
            </div>
            `;
        }).join('');
    }

    /**
     * 显示讲师详情（弹窗）
     */
    window.showTeacherDetail = function(lecturerId) {
        const api = window.DataAPI;
        const lecturer = allLecturers.find(l => l.id === lecturerId);
        
        if (!lecturer) return;

        const levelInfo = LEVEL_STYLES[lecturer.level] || LEVEL_STYLES['trainee'];
        const catName = (api && api.getCategoryName(lecturer.categoryId)) || '';

        const modalHtml = `
            <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center" onclick="closeTeacherModal()">
                <div class="bg-white dark:bg-darkgray rounded-t-3xl w-full max-h-[85vh] overflow-y-auto slide-up" onclick="event.stopPropagation()">
                    <!-- 顶部指示条 -->
                    <div class="flex justify-center pt-3 pb-2">
                        <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                    </div>
                    
                    <!-- 头部背景 -->
                    <div class="h-28 bg-gradient-primary relative -mt-2">
                        <button class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors" onclick="closeTeacherModal()">
                            <i class="fa fa-close"></i>
                        </button>
                    </div>
                    
                    <!-- 头像和信息 -->
                    <div class="px-6 pb-6 -mt-16 text-center">
                        <img src="${lecturer.avatar || ''}" alt="${lecturer.name}" class="w-32 h-32 rounded-full border-4 border-white dark:border-darkgray mx-auto shadow-lg object-cover" onerror="this.src='https://placehold.co/128x128/667eea/white?text=${encodeURIComponent(lecturer.name.charAt(0))}'">
                        
                        <h2 class="text-xl font-bold mt-4 text-gray-800 dark:text-white">${lecturer.name}</h2>
                        <div class="inline-block mt-2 ${levelInfo.class} text-white px-4 py-1 rounded-full text-sm font-medium">${levelInfo.name}</div>
                        
                        <div class="flex items-center justify-center gap-6 mt-4 text-sm text-gray-600 dark:text-gray-400">
                            <div class="text-center">
                                <div class="font-bold text-lg text-gray-800 dark:text-white">${lecturer.courseCount || 0}</div>
                                <div class="text-xs">门课程</div>
                            </div>
                            <div class="text-center">
                                <div class="font-bold text-lg text-gray-800 dark:text-white">${(lecturer.students || 0) > 1000 ? ((lecturer.students / 1000).toFixed(1) + 'k') : (lecturer.students || 0)}</div>
                                <div class="text-xs">学员数</div>
                            </div>
                            <div class="text-center">
                                <div class="font-bold text-lg text-gray-800 dark:text-white">${lecturer.rating ? lecturer.rating.toFixed(1) : '--'}</div>
                                <div class="text-xs">评分</div>
                            </div>
                        </div>
                    </div>

                    <!-- 简介 -->
                    <div class="px-6 pb-6">
                        <h3 class="font-bold text-gray-800 dark:text-white mb-3 flex items-center">
                            <i class="fa fa-user mr-2 text-primary"></i>个人简介
                        </h3>
                        <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">${lecturer.intro || '暂无简介'}</p>
                    </div>

                    <!-- 专长领域 -->
                    ${lecturer.skills && lecturer.skills.length ? `
                    <div class="px-6 pb-6">
                        <h3 class="font-bold text-gray-800 dark:text-white mb-3 flex items-center">
                            <i class="fa fa-tags mr-2 text-primary"></i>专长领域
                        </h3>
                        <div class="flex flex-wrap gap-2">
                            ${lecturer.skills.map(skill => `<span class="tag tag-blue">${skill}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- 授课课程 -->
                    <div class="px-6 pb-6">
                        <h3 class="font-bold text-gray-800 dark:text-white mb-3 flex items-center">
                            <i class="fa fa-book mr-2 text-primary"></i>授课课程
                        </h3>
                        <div class="space-y-3">
                            ${(api && api.getCourses().filter(c => c.lecturerId === lecturer.id).slice(0, 3).map(c => `
                                <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors" onclick="location.href='player.html?courseId=${c.id}'">
                                    <img src="${c.cover || ''}" class="w-16 h-12 rounded object-cover flex-shrink-0" onerror="this.src='https://placehold.co/64x48/667eea/white?text=Course'">
                                    <div class="flex-1 min-w-0">
                                        <div class="text-sm font-medium text-gray-800 dark:text-white truncate">${c.title}</div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${Math.floor((c.duration || 0) / 60)}分钟 · ${(c.views || 0) > 10000 ? ((c.views / 10000).toFixed(1) + '万') : (c.views || 0)}人学习</div>
                                    </div>
                                </div>
                            `).join('')) || '<p class="text-sm text-gray-500">暂无课程</p>'}
                        </div>
                    </div>

                    <!-- 底部按钮 -->
                    <div class="px-6 pb-6 flex gap-3">
                        <button class="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors" onclick="closeTeacherModal()">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 移除已有 modal
        const existingModal = document.querySelector('.teacher-modal-container');
        if (existingModal) existingModal.remove();

        // 添加 modal
        const modalDiv = document.createElement('div');
        modalDiv.className = 'teacher-modal-container';
        modalDiv.innerHTML = modalHtml;
        document.body.appendChild(modalDiv);
    };

    window.closeTeacherModal = function() {
        const modal = document.querySelector('.teacher-modal-container');
        if (modal) modal.remove();
    };

})();
