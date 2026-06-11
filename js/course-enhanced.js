/**
 * ============================================================
 * 课程中心增强功能 - 左侧分类布局版本（支持二级分类）
 * ============================================================
 */

(function() {
    'use strict';

    // 防抖定时器：防止短时间内多次渲染导致卡片闪烁
    let _renderDebounceTimer = null;

    let allCourses = [];
    let filteredCourses = [];
    let categories = [];
    let currentCategoryId = 'all'; // 当前选中的分类
    let searchTerm = '';
    let sortBy = 'latest';

    // 标签样式映射
    const TAG_STYLES = {
        '技术': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        '运营': 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
        '美术': 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
        '软技能': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        '策划': 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
    };

    document.addEventListener('DOMContentLoaded', function() {
        // 初始化数据 API
        if (window.DataAPI) {
            window.DataAPI.init().then(() => {
                loadData();
            }).catch(err => {
                console.error('DataAPI 初始化失败:', err);
                loadData();
            });
        } else {
            loadData();
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

            document.addEventListener('click', function(event) {
                if (!userMenuBtn.contains(event.target) && !userMenu.contains(event.target)) {
                    userMenu.classList.add('hidden');
                }
            });
        }

        // 搜索功能
        const searchInput = document.getElementById('course-search');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', function() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    searchTerm = this.value.toLowerCase().trim();
                    filterAndRender();
                }, 300);
            });
        }

        // 排序筛选
        const sortFilter = document.getElementById('sort-filter');
        if (sortFilter) {
            sortFilter.addEventListener('change', function() {
                sortBy = this.value;
                filterAndRender();
            });
        }

        // 监听页面可见性变化，页面重新显示时刷新数据
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                console.log('[Course] 页面重新可见，刷新缓存和数据');
                if (window.DataAPI && window.DataAPI.refreshFromLocalStorage) {
                    window.DataAPI.refreshFromLocalStorage();
                }
                refreshData();
            }
        });

        // 监听storage变化（跨页面同步分类数据）
        window.addEventListener('storage', function(e) {
            console.log('[Course] storage事件触发:', e.key, e.newValue);
            if (e.key === 'categories_sync_time' || e.key === 'course_center_sync') {
                console.log('[Course] 检测到分类变更，刷新数据');
                refreshData();
            }
            // 监听播放页的数据变化（浏览量/点赞/评分）
            if (e.key === 'course_interaction_sync' || e.key === 'learning_platform_data') {
                console.log('[Course] 检测到互动数据变化，刷新缓存并重新渲染');
                if (window.DataAPI && window.DataAPI.refreshFromLocalStorage) {
                    window.DataAPI.refreshFromLocalStorage();
                }
                filterAndRender();
            }
        });

        // 监听 DataSync 模块的数据更新
        if (window.DataSync) {
            window.DataSync.listen(DataSync.EventTypes.ALL, function(event) {
                console.log('[Course] DataSync收到事件:', event.type, event);
                if (window.DataAPI && window.DataAPI.refreshFromLocalStorage) {
                    window.DataAPI.refreshFromLocalStorage();
                }
                refreshData();
            });
        }
    });

    /**
     * 获取默认分类数据
     */
    function getDefaultCategories() {
        return [
            { id: 1, name: '策划', key: 'planning', icon: 'fa-sitemap', children: [
                { id: 11, name: '游戏策划' },
                { id: 12, name: '活动策划' }
            ]},
            { id: 2, name: '美术', key: 'art', icon: 'fa-paint-brush', children: [
                { id: 21, name: '平面设计' },
                { id: 22, name: 'UI设计' },
                { id: 23, name: '3D建模' }
            ]},
            { id: 3, name: '技术', key: 'tech', icon: 'fa-code', children: [
                { id: 31, name: '前端开发' },
                { id: 32, name: '后端开发' },
                { id: 33, name: '移动开发' }
            ]},
            { id: 4, name: '运营', key: 'operation', icon: 'fa-line-chart', children: [
                { id: 41, name: '新媒体运营' },
                { id: 42, name: '数据分析' }
            ]},
            { id: 5, name: '软技能', key: 'softskill', icon: 'fa-users', children: [
                { id: 51, name: '职场沟通' },
                { id: 52, name: '团队管理' }
            ]}
        ];
    }

    /**
     * 加载数据
     */
    async function loadData() {
        const api = window.DataAPI;
        
        // 先从后端同步分类数据（保证与后台分类管理同步）
        if (api && api.syncCategoriesFromServer) {
            await api.syncCategoriesFromServer();
        }
        
        allCourses = (api && api.getCourses()) || [];
        categories = (api && api.getCategories()) || getDefaultCategories();
        
        // 如果分类为空，使用默认分类
        if (categories.length === 0) {
            categories = getDefaultCategories();
        }
        
        // 渲染左侧分类栏
        renderCategorySidebar();
        
        // 渲染课程
        filterAndRender();
    }
    
    /**
     * 刷新数据（从服务器重新加载，用于跨页面同步）
     */
    async function refreshData() {
        const api = window.DataAPI;
        
        // 从服务器重新加载所有数据（保证与后台管理联动）
        if (api && api.reloadFromServer) {
            await api.reloadFromServer();
        } else if (api && api.syncCategoriesFromServer) {
            await api.syncCategoriesFromServer();
        }
        
        allCourses = (api && api.getCourses()) || [];
        categories = (api && api.getCategories()) || getDefaultCategories();
        
        renderCategorySidebar();
        filterAndRender();
    }

    /**
     * 渲染左侧分类栏（一级分类可展开显示二级分类，无"全部"选项）
     */
    function renderCategorySidebar() {
        const container = document.getElementById('category-sidebar');
        if (!container || !categories.length) return;

        let html = `
            <a href="javascript:;" class="category-item ${currentCategoryId === 'all' ? 'active' : ''}" data-category="all">
                <i class="fa fa-th-large"></i>
                <span>全部课程</span>
            </a>
        `;

        categories.forEach(cat => {
            const hasChildren = cat.children && cat.children.length > 0;
            const isExpanded = String(currentCategoryId) === String(cat.id) || 
                               cat.children?.some(sub => String(sub.id) === String(currentCategoryId));
            
            if (hasChildren) {
                // 一级分类（带二级分类展开）
                html += `
                    <div class="category-parent">
                        <a href="javascript:;" class="category-item category-parent-item ${currentCategoryId === cat.id ? 'active' : ''}" data-category="${cat.id}">
                            <i class="fa ${cat.icon || 'fa-folder'}"></i>
                            <span>${cat.name}</span>
                            <i class="fa fa-angle-down category-arrow ml-auto text-xs transition-transform ${isExpanded ? 'expanded' : ''}"></i>
                        </a>
                        <div class="category-children" style="display: ${isExpanded ? 'block' : 'none'};">
                            ${cat.children.map(sub => `
                                <a href="javascript:;" class="category-item category-child-item ${currentCategoryId === sub.id ? 'active' : ''}" data-category="${sub.id}">
                                    <i class="fa fa-file-o"></i>
                                    <span>${sub.name}</span>
                                </a>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                // 一级分类（无二级分类）
                html += `
                    <a href="javascript:;" class="category-item ${currentCategoryId === cat.id ? 'active' : ''}" data-category="${cat.id}">
                        <i class="fa ${cat.icon || 'fa-folder'}"></i>
                        <span>${cat.name}</span>
                    </a>
                `;
            }
        });

        container.innerHTML = html;

        // 绑定点击事件
        container.querySelectorAll('.category-item[data-category]').forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                
                // 如果点击的是父级分类的箭头或标题，切换展开状态
                if (this.classList.contains('category-parent-item')) {
                    const parent = this.closest('.category-parent');
                    const children = parent.querySelector('.category-children');
                    const arrow = this.querySelector('.category-arrow');
                    
                    if (children.style.display === 'none' || !children.style.display) {
                        children.style.display = 'block';
                        if (arrow) arrow.style.transform = 'rotate(180deg)';
                    } else {
                        children.style.display = 'none';
                        if (arrow) arrow.style.transform = 'rotate(0deg)';
                    }
                }
                
                // 更新选中状态
                container.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                
                // 更新当前分类
                currentCategoryId = this.dataset.category;
                
                // 重新筛选
                filterAndRender();
            });
        });
    }

    /**
     * 筛选并渲染课程（带防抖，防止短时间内多次调用导致闪烁）
     */
    function filterAndRender() {
        if (_renderDebounceTimer) clearTimeout(_renderDebounceTimer);
        _renderDebounceTimer = setTimeout(function() {
            _renderDebounceTimer = null;
            _doFilterAndRender();
        }, 150);
    }

    function _doFilterAndRender() {
        // 筛选
        filteredCourses = allCourses.filter(course => {
            // 搜索匹配
            const matchSearch = !searchTerm || 
                (course.title && course.title.toLowerCase().includes(searchTerm)) ||
                (course.description && course.description.toLowerCase().includes(searchTerm));
            
            // 分类匹配
            let matchCategory = currentCategoryId === 'all';
            
            if (!matchCategory) {
                const courseCategoryId = course.categoryId;
                const courseSubcategoryId = course.subcategoryId;
                
                // 检查是否选中了一级分类
                const parentCat = categories.find(c => String(c.id) === String(currentCategoryId));
                if (parentCat) {
                    // 选中一级分类，匹配该分类及其所有二级分类的课程
                    const parentId = parentCat.id;
                    
                    // 直接匹配一级分类ID
                    if (courseCategoryId === parentId || String(courseCategoryId) === String(parentId)) {
                        matchCategory = true;
                    } else {
                        // 检查是否是该一级分类下的二级分类
                        if (parentCat.children) {
                            matchCategory = parentCat.children.some(sub => 
                                sub.id === courseCategoryId || String(sub.id) === String(courseCategoryId)
                            );
                        }
                    }
                } else {
                    // 选中二级分类，匹配二级分类ID
                    matchCategory = courseSubcategoryId === parseInt(currentCategoryId) || 
                                   String(courseSubcategoryId) === String(currentCategoryId);
                }
            }

            return matchSearch && matchCategory;
        });

        // 排序
        sortCourses();

        // 渲染
        renderCoursesByCategory();
    }

    /**
     * 排序课程
     */
    function sortCourses() {
        filteredCourses.sort((a, b) => {
            switch(sortBy) {
                case 'popular':
                    return (b.views || 0) - (a.views || 0);
                case 'rating':
                    return (b.rating || 0) - (a.rating || 0);
                case 'duration':
                    return (b.duration || 0) - (a.duration || 0);
                case 'latest':
                default:
                    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            }
        });
    }

    /**
     * 按分类渲染课程
     * - 全部课程时：直接显示所有课程卡片，不分组
     * - 选择分类时：显示该分类名称 + 课程卡片
     */
    function renderCoursesByCategory() {
        const container = document.getElementById('courses-by-category');
        const emptyState = document.getElementById('empty-state');
        
        if (!container) return;

        if (!filteredCourses.length) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        const api = window.DataAPI;
        let html = '';

        // 判断当前选中的是全部还是某个具体分类
        if (currentCategoryId === 'all') {
            // 全部课程：直接显示所有课程卡片，不分组
            html = `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${filteredCourses.map(c => renderCourseCard(c, api)).join('')}
                </div>
            `;
        } else {
            // 显示单个分类
            let cat, catName;
            
            // 检查是否是一级分类
            cat = categories.find(c => String(c.id) === String(currentCategoryId));
            if (cat) {
                catName = cat.name;
            } else {
                // 二级分类
                for (const parent of categories) {
                    if (parent.children) {
                        const sub = parent.children.find(s => String(s.id) === String(currentCategoryId));
                        if (sub) {
                            catName = sub.name;
                            cat = parent;
                            break;
                        }
                    }
                }
            }
            
            html = renderCategorySection(
                cat ? { id: cat.id, name: catName, icon: cat.icon || 'fa-folder' } : { id: currentCategoryId, name: '课程列表', icon: 'fa-book' },
                filteredCourses, 
                api
            );
        }

        container.innerHTML = html;
    }

    /**
     * 渲染分类区块
     */
    function renderCategorySection(category, courses, api) {
        const catName = category.name || '课程';
        const tagStyle = TAG_STYLES[catName] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';

        return `
            <div class="category-section mb-8 max-w-[1200px]">
                <div class="flex items-center mb-4">
                    <span class="inline-block ${tagStyle} px-3 py-1 rounded-lg text-sm font-medium mr-3">
                        <i class="fa ${category.icon || 'fa-folder'} mr-1"></i>${catName}
                    </span>
                    <span class="text-gray-500 dark:text-gray-400 text-sm">共 ${courses.length} 门课程</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${courses.map(c => renderCourseCard(c, api)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 渲染单个课程卡片 - 与首页统一样式
     */
    function renderCourseCard(c, api) {
        const lecName = (api && api.getLecturerName(c.lecturerId)) || '待定讲师';
        const lecAvatar = (api && api.getLecturerAvatar(c.lecturerId)) || '';
        const learners = (c.views || 0) > 10000 ? (c.views / 10000).toFixed(1) + '万' : (c.views || 0);
        const coverUrl = c.cover && c.cover.trim() ? c.cover : '';

        // 从互动数据中读取真实点赞数和评分
        let likes = 0;
        let realRating = null;
        if (api) {
            const interactionKey = `course_interaction_${c.id}`;
            const interactionData = api.get(interactionKey);
            if (interactionData) {
                likes = interactionData.likes || 0;
                // 优先使用互动数据中的平均分（更实时准确）
                if (interactionData.ratingCount > 0) {
                    realRating = (interactionData.ratingSum / interactionData.ratingCount).toFixed(1);
                }
            } else {
                // 如果内存缓存中没有，尝试从 localStorage 直接读取
                try {
                    const stored = localStorage.getItem('learning_platform_data');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (parsed[interactionKey]) {
                            const data = parsed[interactionKey];
                            likes = data.likes || 0;
                            if (data.ratingCount > 0) {
                                realRating = (data.ratingSum / data.ratingCount).toFixed(1);
                            }
                        }
                    }
                } catch(e) {
                    console.warn('[Course] 从 localStorage 读取互动数据失败:', e);
                }
            }
        }
        if (!likes) likes = c.likes || 0;
        const rating = realRating || (c.rating || 0).toFixed(1);

        return `
        <div class="card-enhanced course-card cursor-pointer fade-in group overflow-hidden rounded-xl shadow-sm hover:shadow-md transition-all duration-300" onclick="location.href='player.html?courseId=${c.id}'">
            <!-- Cover Area - Clean and simple -->
            <div class="relative h-40 overflow-hidden rounded-t-xl bg-gray-100">
                ${coverUrl ? `<img src="${coverUrl}" alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">` : '<div class="absolute inset-0 flex items-center justify-center text-gray-300"><i class="fa fa-image text-5xl"></i></div>'}
            </div>
            <!-- Info Area -->
            <div class="p-4 bg-white rounded-b-xl">
                <h4 class="font-bold text-gray-800 text-base mb-3 line-clamp-1">${c.title || ''}</h4>
                <div class="flex items-center mb-3">
                    <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center overflow-hidden mr-2 flex-shrink-0">
                        ${lecAvatar ? `<img src="${lecAvatar}" alt="${lecName}" class="w-full h-full object-cover" onerror="this.style.display='none';this.parentNode.innerHTML='<i class=\\'fa fa-user text-white text-xs\\'></i>'">` : `<i class="fa fa-user text-white text-xs"></i>`}
                    </div>
                    <span class="text-xs text-gray-500">${lecName}</span>
                </div>
                <div class="flex items-center justify-between text-xs text-gray-400">
                    <div class="flex items-center space-x-4">
                        <span class="flex items-center"><i class="fa fa-eye mr-1"></i>${learners}</span>
                        <span class="flex items-center"><i class="fa fa-thumbs-o-up mr-1"></i>${likes}</span>
                    </div>
                    <span class="flex items-center text-yellow-500"><i class="fa fa-star mr-1"></i>${rating}</span>
                </div>
            </div>
        </div>
        `;
    }

    // 暴露全局方法
    window.CoursePage = {
        refresh: function() {
            filterAndRender();
        },
        refreshData: function() {
            refreshData();
        }
    };

})();
