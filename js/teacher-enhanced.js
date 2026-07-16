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
        'senior': { class: 'level-senior', name: '高级讲师', icon: 'fa-star' },
        'intermediate': { class: 'level-intermediate', name: '中级讲师', icon: 'fa-graduation-cap' },
        'junior': { class: 'level-junior', name: '初级讲师', icon: 'fa-user' },
        'intern': { class: 'level-intern', name: '见习讲师', icon: 'fa-leaf' }
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

    /**
     * 获取讲师平均评分（基于该讲师所有课程的评分计算）
     * @param {number} lecturerId 讲师ID
     * @returns {number|null} 平均评分，如果没有课程或课程没有评分则返回 null
     */
    function getLecturerAverageRating(lecturerId) {
        const api = window.DataAPI;
        if (!api) return null;
        const courses = getLecturerCourses(lecturerId);
        if (!courses || courses.length === 0) {
            return null;
        }
        
        // 从课程互动数据中读取真实评分（ratingSum / ratingCount）
        let totalRatingSum = 0;
        let totalRatingCount = 0;
        
        courses.forEach(course => {
            const ik = 'course_interaction_' + course.id;
            const idata = api.get(ik);
            if (idata && idata.ratingCount && idata.ratingCount > 0 && idata.ratingSum != null) {
                totalRatingSum += idata.ratingSum;
                totalRatingCount += idata.ratingCount;
            }
        });
        
        if (totalRatingCount === 0) {
            return null;
        }
        
        return totalRatingSum / totalRatingCount;
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
     * 显示讲师详情（弹窗）- Premium 升级版
     */
    window.showTeacherDetail = function(lecturerId) {
        const api = window.DataAPI;
        const lecturer = allLecturers.find(l => l.id === lecturerId);

        if (!lecturer) return;

        const levelInfo = LEVEL_STYLES[lecturer.level] || LEVEL_STYLES['intern'];

        // 动态计算该讲师的课程数、总点赞量和平均评分
        const courseCount = getLecturerCourseCount(lecturer.id);
        const totalLikes = getLecturerTotalLikes(lecturer.id);
        const avgRating = getLecturerAverageRating(lecturer.id);
        const ratingDisplay = avgRating !== null ? avgRating.toFixed(1) : '--';
        const hasRating = avgRating !== null;

        // 工具：基于字符串生成稳定的渐变色（用于专长标签）
        const hash = (str) => {
            let h = 0;
            for (let i = 0; i < (str || '').length; i++) {
                h = (h << 5) - h + str.charCodeAt(i);
                h |= 0;
            }
            return Math.abs(h);
        };
        // 专长领域标签：统一主题紫色渐变（与全站 #667eea → #764ba2 一致）
        const skillColors = () => 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

        // 个人简介模块：仅当有内容时渲染（用户明确要求）
        const hasIntro = lecturer.intro && String(lecturer.intro).trim().length > 0;

        // 专长领域：仅当有标签时渲染
        const hasSkills = lecturer.skills && lecturer.skills.length > 0;

        // 课程数据
        const courses = api ? getLecturerCourses(lecturer.id) : [];
        const coursesHtml = courses.length === 0
            ? `<div class="tc-empty-courses">
                    <div class="tc-empty-icon"><i class="fa fa-book"></i></div>
                    <div class="tc-empty-text">该讲师暂无授课课程</div>
               </div>`
            : courses.slice(0, 3).map(c => `
                <div class="tc-course-item" onclick="location.href='player.html?courseId=${c.id}'">
                    <img src="${c.cover || ''}" alt="${c.title}" class="tc-course-cover" onerror="this.src='https://placehold.co/96x64/667eea/white?text=课'">
                    <div class="tc-course-meta">
                        <div class="tc-course-title">${c.title}</div>
                        <div class="tc-course-sub">
                            <span><i class="fa fa-clock-o"></i>${Math.floor((c.duration || 0) / 60)}分钟</span>
                            <span><i class="fa fa-user-o"></i>${(c.views || 0) > 10000 ? ((c.views / 10000).toFixed(1) + '万') : (c.views || 0)}人学习</span>
                        </div>
                    </div>
                    <i class="fa fa-angle-right tc-course-arrow"></i>
                </div>
            `).join('');

        // 评分显示（去掉星星，只显示数字）
        const starsHtml = hasRating
            ? `<div class="tc-metric-stars"><span class="tc-metric-val">${ratingDisplay}</span></div>`
            : `<div class="tc-metric-stars"><span class="tc-metric-val muted">--</span></div>`;

        // 个人简介 HTML（条件渲染）
        const introHtml = hasIntro ? `
            <div class="tc-section">
                <div class="tc-section-head">
                    <i class="fa fa-info-circle"></i>
                    <span>个人简介</span>
                </div>
                <div class="tc-intro-card">
                    <span class="tc-intro-quote">"</span>
                    <p class="tc-intro-text">${lecturer.intro}</p>
                </div>
            </div>
        ` : '';

        // 专长领域 HTML（条件渲染）
        const skillsHtml = hasSkills ? `
            <div class="tc-section">
                <div class="tc-section-head">
                    <i class="fa fa-tags"></i>
                    <span>专长领域</span>
                </div>
                <div class="tc-skill-list">
                    ${lecturer.skills.map(s => `
                        <span class="tc-skill-chip" style="background:${skillColors()}">${s}</span>
                    `).join('')}
                </div>
            </div>
        ` : '';

        const modalHtml = `
            <div class="tc-mask" onclick="closeTeacherModal()">
                <div class="tc-modal" onclick="event.stopPropagation()">
                    <!-- 顶部 Hero 区（紫色渐变 + 装饰光斑） -->
                    <div class="tc-hero">
                        <div class="tc-hero-glow tc-hero-glow-1"></div>
                        <div class="tc-hero-glow tc-hero-glow-2"></div>
                        <button class="tc-close" onclick="closeTeacherModal()" aria-label="关闭">
                            <i class="fa fa-times"></i>
                        </button>
                        <div class="tc-hero-title">讲师简介</div>
                    </div>

                    <!-- 悬浮头像（横跨 hero 和 body 边界） -->
                    <div class="tc-avatar-wrap">
                        <div class="tc-avatar-ring ${levelInfo.class}">
                            <img src="${lecturer.avatar || ''}" alt="${lecturer.name}" class="tc-avatar" onerror="this.src='https://placehold.co/200x200/667eea/white?text=${encodeURIComponent(lecturer.name.charAt(0))}'">
                        </div>
                    </div>

                    <!-- 滚动内容区 -->
                    <div class="tc-body">
                        <!-- 名字 + 级别 -->
                        <div class="tc-name-block">
                            <h3 class="tc-name">${lecturer.name}</h3>
                            <span class="tc-level-badge ${levelInfo.class}">
                                <i class="fa ${levelInfo.icon}"></i>${levelInfo.name}
                            </span>
                        </div>

                        <!-- 三个指标卡 -->
                        <div class="tc-metric-row">
                            <div class="tc-metric">
                                <div class="tc-metric-icon"><i class="fa fa-book"></i></div>
                                <div class="tc-metric-num">${courseCount}</div>
                                <div class="tc-metric-label">门课程</div>
                            </div>
                            <div class="tc-metric-divider"></div>
                            <div class="tc-metric">
                                <div class="tc-metric-icon"><i class="fa fa-thumbs-o-up"></i></div>
                                <div class="tc-metric-num">${totalLikes}</div>
                                <div class="tc-metric-label">累计点赞</div>
                            </div>
                            <div class="tc-metric-divider"></div>
                            <div class="tc-metric">
                                <div class="tc-metric-icon"><i class="fa fa-star"></i></div>
                                ${starsHtml}
                                <div class="tc-metric-label">学员评分</div>
                            </div>
                        </div>

                        ${introHtml}
                        ${skillsHtml}

                        <!-- 授课课程 -->
                        <div class="tc-section">
                            <div class="tc-section-head">
                                <i class="fa fa-book"></i>
                                <span>授课课程</span>
                                ${courses.length > 3 ? `<span class="tc-section-extra">共 ${courses.length} 门</span>` : ''}
                            </div>
                            <div class="tc-course-list">
                                ${coursesHtml}
                            </div>
                        </div>
                    </div>

                    <!-- 底部关闭按钮 -->
                    <div class="tc-footer">
                        <button class="tc-close-btn" onclick="closeTeacherModal()">关闭</button>
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

        // 触发进入动画（下一帧加 class 触发动画）
        requestAnimationFrame(() => {
            const modal = modalDiv.querySelector('.tc-modal');
            if (modal) modal.classList.add('tc-modal-in');
        });
    };

    window.closeTeacherModal = function() {
        const modal = document.querySelector('.teacher-modal-container');
        if (modal) modal.remove();
    };

})();
