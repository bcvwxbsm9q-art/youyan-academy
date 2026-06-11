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
        'intern': { class: 'level-intern', name: '实习讲师', icon: 'fa-user-o' }
    };

    // 防抖定时器
    let _renderDebounceTimer = null;

    /**
     * 获取讲师的所有课程（动态计算）
     */
    function getLecturerCourses(lecturerId) {
        const api = window.DataAPI;
        if (!api) return [];
        return api.getCourses().filter(c => String(c.lecturerId) === String(lecturerId));
    }

    /**
     * 获取讲师课程数（动态计算，不依赖静态 courseCount）
     */
    function getLecturerCourseCount(lecturerId) {
        return getLecturerCourses(lecturerId).length;
    }

    /**
     * 获取讲师总点赞量（汇总该讲师所有课程的 likes）
     */
    function getLecturerTotalLikes(lecturerId) {
        const api = window.DataAPI;
        if (!api) return 0;
        const courses = getLecturerCourses(lecturerId);
        let total = 0;
        courses.forEach(c => {
            const ik = 'course_interaction_' + c.id;
            const idata = api.get(ik);
            if (idata && idata.likes) total += idata.likes;
        });
        return total;
    }

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

        // 跨页面数据同步：监听 localStorage 变化（播放页点赞/评分后刷新点赞数）
        window.addEventListener('storage', function(e) {
            if (e.key === 'course_interaction_sync' || e.key === 'learning_platform_data') {
                console.log('[Teacher] 检测到课程互动数据变化，刷新讲师列表');
                if (window.DataAPI && window.DataAPI.refreshFromLocalStorage) {
                    window.DataAPI.refreshFromLocalStorage();
                }
                refreshLecturerCards();
            }
        });

        // 页面重新可见时刷新数据
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                if (window.DataAPI && window.DataAPI.refreshFromLocalStorage) {
                    window.DataAPI.refreshFromLocalStorage();
                }
                refreshLecturerCards();
            }
        });
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
                    return getLecturerCourseCount(b.id) - getLecturerCourseCount(a.id);
                case 'name':
                    return a.name.localeCompare(b.name, 'zh-CN');
                case 'default':
                default:
                    // 按等级排序
                    const levelOrder = ['chief', 'senior', 'intermediate', 'junior', 'intern'];
                    return levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
            }
        });

        renderLecturers();
    }

    /**
     * 防抖刷新讲师卡片（防止闪烁）
     */
    function refreshLecturerCards() {
        if (_renderDebounceTimer) clearTimeout(_renderDebounceTimer);
        _renderDebounceTimer = setTimeout(function() {
            _renderDebounceTimer = null;
            renderLecturers();
        }, 150);
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
            const levelInfo = LEVEL_STYLES[l.level] || LEVEL_STYLES['intern'];
            const skillsHtml = l.skills && l.skills.length > 0 ? `
                <div class="lecturer-tags">
                    ${l.skills.slice(0, 3).map(skill => `<span class="lecturer-tag">${skill}</span>`).join('')}
                    ${l.skills.length > 3 ? `<span class="lecturer-tag more">+${l.skills.length - 3}</span>` : ''}
                </div>
            ` : '<div class="lecturer-tags"></div>';

            // 动态计算课程数和总点赞量
            const courseCount = getLecturerCourseCount(l.id);
            const totalLikes = getLecturerTotalLikes(l.id);

            // 简介只在有内容时渲染，避免空占高度
            const introHtml = l.intro ? `<p class="text-xs text-gray-500 dark:text-gray-400 mb-1 line-clamp-2 px-2">${l.intro}</p>` : '';

            return `
            <div class="card-enhanced lecturer-card cursor-pointer fade-in" onclick="showTeacherDetail(${l.id})">
                <div class="lecturer-avatar-wrapper">
                    <img src="${l.avatar || ''}" alt="${l.name}" class="lecturer-avatar" onerror="this.src='https://placehold.co/100x100/667eea/white?text=${encodeURIComponent(l.name.charAt(0))}'">
                    <div class="lecturer-level-badge ${levelInfo.class}">
                        <i class="fa ${levelInfo.icon}"></i>
                    </div>
                </div>
                <h3 class="text-sm md:text-base font-bold mb-1 text-gray-800 dark:text-white">${l.name}</h3>
                <div class="text-xs ${levelInfo.class} text-white px-2 py-1 rounded-full inline-block mb-3">${levelInfo.name}</div>
                ${introHtml}
                ${skillsHtml}
                <div class="flex items-center justify-center gap-3 text-xs text-gray-600 dark:text-gray-400 mt-auto pt-2">
                    <span><i class="fa fa-book mr-1"></i>${courseCount}课程</span>
                    <span><i class="fa fa-thumbs-o-up mr-1"></i>${totalLikes}</span>
                </div>
            </div>
            `;
        }).join('');
    }

    /**
     * 显示讲师详情（弹窗）- 桌面端小窗口样式
     */
    window.showTeacherDetail = function(lecturerId) {
        const api = window.DataAPI;
        const lecturer = allLecturers.find(l => l.id === lecturerId);
        
        if (!lecturer) return;

        const levelInfo = LEVEL_STYLES[lecturer.level] || LEVEL_STYLES['intern'];
        const catName = (api && api.getCategoryName(lecturer.categoryId)) || '';

        // 动态计算该讲师的课程数和总点赞量
        const courseCount = getLecturerCourseCount(lecturer.id);
        const totalLikes = getLecturerTotalLikes(lecturer.id);

        const modalHtml = `
            <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-start justify-center pt-20 pb-8" onclick="closeTeacherModal()">
                <div class="bg-white rounded-2xl w-full max-w-md max-h-[calc(100vh-8rem)] flex flex-col shadow-xl transform transition-all scale-100 relative overflow-hidden" onclick="event.stopPropagation()">
                    <!-- 顶部标题栏 -->
                    <div class="bg-gradient-primary px-6 py-4 flex-shrink-0">
                        <h2 class="text-xl font-bold text-white">讲师简介</h2>
                    </div>
                    
                    <!-- 关闭按钮 -->
                    <button class="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/30 hover:bg-white/50 flex items-center justify-center text-white transition-all z-[20]" onclick="closeTeacherModal()">
                        <i class="fa fa-times"></i>
                    </button>
                    
                    <!-- 内容区域 -->
                    <div class="flex-1 overflow-y-auto px-5 py-4">
                        <!-- 基本信息卡片 -->
                        <div class="bg-gray-50 rounded-xl p-4 mb-4">
                            <div class="flex items-center gap-3">
                                <!-- 头像 -->
                                <img src="${lecturer.avatar || ''}" alt="${lecturer.name}" class="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg" onerror="this.src=''; this.innerHTML='${lecturer.name.charAt(0)}'">
                                
                                <!-- 信息 -->
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-semibold text-gray-800">${lecturer.name}</span>
                                        <span class="inline-block ${levelInfo.class} text-white px-2 py-0.5 rounded text-xs">${levelInfo.name}</span>
                                    </div>
                                    <div class="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                        <span><i class="fa fa-book mr-1"></i>${courseCount}门课程</span>
                                        <span><i class="fa fa-thumbs-o-up mr-1"></i>${totalLikes}点赞</span>
                                        <span><i class="fa fa-star mr-1 text-yellow-500"></i>${lecturer.rating ? lecturer.rating.toFixed(1) : '--'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 个人简介 -->
                        <div class="bg-gray-50 rounded-xl p-4 mb-4">
                            <h3 class="font-semibold text-gray-800 mb-2 flex items-center text-sm">
                                <i class="fa fa-info-circle mr-2 text-primary"></i>个人简介
                            </h3>
                            <p class="text-sm text-gray-600 leading-relaxed">${lecturer.intro || '暂无简介'}</p>
                        </div>

                        <!-- 专长领域 -->
                        ${lecturer.skills && lecturer.skills.length ? `
                        <div class="mb-4">
                            <h3 class="font-semibold text-gray-800 mb-3 text-sm flex items-center">
                                <i class="fa fa-tags mr-2 text-primary"></i>专长领域
                            </h3>
                            <div class="flex flex-wrap gap-2">
                                ${lecturer.skills.map(skill => `<span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">${skill}</span>`).join('')}
                            </div>
                        </div>
                        ` : ''}

                        <!-- 授课课程 -->
                        <div>
                            <h3 class="font-semibold text-gray-800 mb-3 text-sm flex items-center">
                                <i class="fa fa-book mr-2 text-primary"></i>授课课程
                            </h3>
                            <div class="space-y-2">
                                ${(api && getLecturerCourses(lecturer.id).slice(0, 3).map(c => {
                                    return `
                                    <div class="bg-gray-50 rounded-xl p-3 cursor-pointer hover:bg-gray-100 transition-colors">
                                        <div class="flex items-center gap-3">
                                            <img src="${c.cover || ''}" class="w-16 h-12 rounded-lg object-cover flex-shrink-0" onerror="this.src='https://placehold.co/64x48/667eea/white?text=课'">
                                            <div class="flex-1 min-w-0">
                                                <div class="text-sm font-medium text-gray-800 truncate">${c.title}</div>
                                                <div class="text-xs text-gray-500 mt-1">${Math.floor((c.duration || 0) / 60)}分钟 · ${(c.views || 0) > 10000 ? ((c.views / 10000).toFixed(1) + '万') : (c.views || 0)}人学习</div>
                                            </div>
                                        </div>
                                    </div>
                                    `;
                                }).join('')) || '<p class="text-sm text-gray-400 text-center py-4">暂无课程</p>'}
                            </div>
                        </div>
                    </div>

                    <!-- 底部按钮 -->
                    <div class="px-5 pb-4">
                        <button class="w-full py-3 rounded-xl bg-gradient-primary text-white font-medium hover:opacity-90 transition-all" onclick="closeTeacherModal()">
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
