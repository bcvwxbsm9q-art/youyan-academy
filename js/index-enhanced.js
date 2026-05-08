/**
 * ============================================================
 * 首页增强功能 - 移动端优化版本
 * 支持前后端数据联动
 * ============================================================
 */

(function() {
    'use strict';

    // API 配置
    const API_BASE = window.location.origin;
    const API_SERVER = `${API_BASE}/api`;

    // 标签样式映射
    const TAG_STYLES = {
        '技术': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        '前端开发': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        '后端开发': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        '移动开发': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        '运营': 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
        '数据分析': 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
        '新媒体运营': 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
        '美术': 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
        '平面设计': 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
        'UI设计': 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
        '3D建模': 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
        '软技能': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        '职场沟通': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        '团队管理': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        '策划': 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
        '游戏策划': 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
        '活动策划': 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
    };

    // 等待 DOM 加载完成
    document.addEventListener('DOMContentLoaded', function() {
        // 初始化数据
        initData();

        // 移动端菜单切换
        const mobileMenuBtn = document.getElementById('mobile-menu-button');
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenuBtn && mobileMenu) {
            mobileMenuBtn.addEventListener('click', function() {
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

        // 监听数据同步事件
        if (window.DataSync) {
            window.DataSync.listen(DataSync.EventTypes.ALL, function(event) {
                console.log('[Index] 数据更新:', event.type);
                renderAll();
            });
        }
    });

    /**
     * 初始化数据
     */
    async function initData() {
        if (window.DataAPI) {
            try {
                await window.DataAPI.init();
                renderAll();
            } catch (err) {
                console.error('数据初始化失败:', err);
                renderAll();
            }
        } else {
            renderAll();
        }
    }

    /**
     * 渲染所有内容
     */
    function renderAll() {
        renderBanners();
        renderNotice();
        renderFeaturedCourses();
        renderFeaturedLecturers();
        renderStats();
    }

    /**
     * 从服务器获取数据
     */
    async function fetchFromAPI(endpoint) {
        try {
            const response = await fetch(`${API_SERVER}${endpoint}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.error(`获取 ${endpoint} 失败:`, e);
        }
        return null;
    }

    /**
     * 渲染轮播图
     */
    function renderBanners() {
        const container = document.getElementById('banner-container');
        const indicators = document.getElementById('banner-indicators');
        
        if (!container || !indicators) return;

        // 优先使用 DataAPI 的数据
        let banners = [];
        if (window.DataAPI) {
            banners = window.DataAPI.getBanners();
        }

        // 如果没有数据，添加默认 Banner
        if (!banners || banners.length === 0) {
            banners = [
                {
                    id: 1,
                    img: 'https://p26-doubao-search-sign.byteimg.com/labis/3e50046a89d633ced89e4d242d60f064~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32',
                    order: 1,
                    title: '欢迎来到游雁学院',
                    description: '持续学习，成就更好的自己'
                }
            ];
        }

        const sorted = [...banners].sort((a, b) => (a.order || 0) - (b.order || 0));

        const slides = sorted.map((b, i) => {
            const clickHandler = b.courseId ? 
                `onclick="location.href='player.html?courseId=${b.courseId}'"` : 
                `onclick="location.href='course.html'"`;
            return `
            <div class="carousel-slide absolute inset-0 transition-opacity duration-500 ${i===0?'opacity-100':'opacity-0'}" ${clickHandler}>
                ${b.img ? `<img src="${b.img}" alt="${b.title||'Banner'}" class="w-full h-full object-cover cursor-pointer" onerror="this.parentElement.querySelector('div').style.display='flex'">` : ''}
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-center justify-center">
                    <div class="text-center text-white px-4">
                        <h2 class="text-2xl md:text-4xl font-bold mb-4">${b.title || ''}</h2>
                        <p class="text-sm md:text-lg opacity-90">${b.description || ''}</p>
                        ${b.courseId ? '<div class="mt-3"><span class="px-4 py-2 bg-white/20 backdrop-blur rounded-full text-white text-sm">点击查看课程</span></div>' : ''}
                    </div>
                </div>
            </div>
        `}).join('');

        const dots = sorted.map((b, i) =>
            `<button class="carousel-indicator ${i===0?'active':''}" data-idx="${i}" aria-label="第${i+1}张"></button>`
        ).join('');

        // 保留按钮
        const prevBtn = document.getElementById('prev-slide');
        const nextBtn = document.getElementById('next-slide');
        
        // 清空容器（保留按钮）
        const tempPrev = prevBtn ? prevBtn.cloneNode(true) : null;
        const tempNext = nextBtn ? nextBtn.cloneNode(true) : null;
        container.innerHTML = slides;
        if (tempPrev) container.appendChild(tempPrev);
        if (tempNext) container.appendChild(nextBtn);
        
        indicators.innerHTML = dots;
        
        initCarousel(sorted.length);
    }

    let currentSlide = 0;
    let carouselTimer = null;

    function initCarousel(totalSlides) {
        const slides = document.querySelectorAll('.carousel-slide');
        const indicators = document.querySelectorAll('.carousel-indicator');
        
        if (!slides.length) return;

        function goToSlide(index) {
            slides.forEach((slide, i) => {
                slide.classList.toggle('opacity-100', i === index);
                slide.classList.toggle('opacity-0', i !== index);
            });
            indicators.forEach((dot, i) => {
                dot.classList.toggle('active', i === index);
            });
            currentSlide = index;
        }

        function nextSlide() {
            const next = (currentSlide + 1) % totalSlides;
            goToSlide(next);
        }

        // 自动轮播
        if (totalSlides > 1 && !carouselTimer) {
            carouselTimer = setInterval(nextSlide, 5000);
        }

        // 指示器点击
        indicators.forEach(dot => {
            dot.addEventListener('click', () => {
                const idx = parseInt(dot.dataset.idx);
                goToSlide(idx);
                if (carouselTimer) {
                    clearInterval(carouselTimer);
                    carouselTimer = setInterval(nextSlide, 5000);
                }
            });
        });

        // 按钮事件
        const prevBtn = document.getElementById('prev-slide');
        const nextBtn = document.getElementById('next-slide');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                const prev = (currentSlide - 1 + totalSlides) % totalSlides;
                goToSlide(prev);
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextSlide();
            });
        }
    }

    /**
     * 渲染公告
     */
    function renderNotice() {
        const el = document.getElementById('notice-content');
        if (!el) return;

        let notices = [];
        if (window.DataAPI) {
            notices = window.DataAPI.getNotices() || [];
        }
        
        const published = notices.filter(n => n.status === 'published');
        
        if (!published.length) {
            el.innerHTML = `
                <i class="fa fa-bullhorn text-primary text-lg md:text-xl"></i>
                <span class="text-gray-600 dark:text-gray-300 text-sm md:text-base">暂无最新公告</span>
            `;
            return;
        }
        
        const latest = published[0];
        el.innerHTML = `
            <i class="fa fa-bullhorn text-primary text-lg md:text-xl"></i>
            <button onclick="showNoticeDetail(${latest.id})" class="text-gray-700 dark:text-gray-200 text-sm md:text-base hover:text-primary transition">
                ${latest.title}
            </button>
            ${latest.urgent ? '<span class="ml-2 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded">紧急</span>' : ''}
        `;
    }

    /**
     * 显示公告详情弹窗
     */
    window.showNoticeDetail = function(noticeId) {
        let notices = [];
        if (window.DataAPI) {
            notices = window.DataAPI.getNotices() || [];
        }
        const notice = notices.find(n => n.id === noticeId);
        if (!notice) return;

        const modal = document.createElement('div');
        modal.id = 'notice-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeNoticeModal()"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <div class="flex items-center justify-between px-6 py-4 border-b">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
                            <i class="fas fa-bullhorn text-white"></i>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-800">${notice.title || '公告详情'}</h3>
                            <p class="text-xs text-gray-500">${notice.publishedAt || notice.createdAt || ''}</p>
                        </div>
                    </div>
                    <button onclick="closeNoticeModal()" class="text-gray-400 hover:text-gray-600 transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto p-6">
                    <div class="prose max-w-none">
                        ${notice.content || '暂无内容'}
                    </div>
                </div>
                ${notice.urgent ? '<div class="px-6 py-3 bg-red-50 border-t"><span class="text-red-600 text-sm"><i class="fas fa-exclamation-circle mr-1"></i>紧急公告</span></div>' : ''}
            </div>
        `;
        document.body.appendChild(modal);
        modal.classList.add('animate-fade-in');
    };

    window.closeNoticeModal = function() {
        const modal = document.getElementById('notice-modal');
        if (modal) modal.remove();
    };

    /**
     * 渲染精品课程
     */
    function renderFeaturedCourses() {
        const container = document.getElementById('featured-courses-inner');
        if (!container) return;

        let courses = [];
        if (window.DataAPI) {
            const fcIds = window.DataAPI.getFeaturedCourseIds();
            const allCourses = window.DataAPI.getPublishedCourses();
            
            if (fcIds && fcIds.length > 0) {
                courses = fcIds.map(id => allCourses.find(c => String(c.id) === String(id))).filter(Boolean);
            } else {
                courses = allCourses.slice(0, 4);
            }
        }

        if (!courses.length) {
            container.innerHTML = `
                <div class="empty-state col-span-full">
                    <div class="empty-state-icon"><i class="fa fa-book"></i></div>
                    <div class="empty-state-title">暂无精品课程</div>
                    <div class="empty-state-desc">敬请期待更多优质课程上线</div>
                </div>
            `;
            return;
        }

        container.innerHTML = courses.map(c => {
            const catName = window.DataAPI ? window.DataAPI.getCategoryName(c.categoryId) : '通用';
            const lecName = window.DataAPI ? window.DataAPI.getLecturerName(c.lecturerId) : '待定讲师';
            const lecAvatar = window.DataAPI ? window.DataAPI.getLecturerAvatar(c.lecturerId) : '';
            const learners = (c.views || 0) > 10000 ? (c.views / 10000).toFixed(1) + '万' : (c.views || 0);
            const rating = (c.rating || 0).toFixed(1);
            const duration = Math.floor((c.duration || 0) / 60);

            return `
            <div class="card-enhanced course-card cursor-pointer fade-in" onclick="location.href='player.html?courseId=${c.id}'">
                <div class="course-card-image-wrapper relative">
                    <img src="${c.cover || ''}" alt="${c.title || ''}" class="course-card-image w-full h-40 md:h-44 object-cover" onerror="this.src='https://placehold.co/400x225/667eea/white?text=${encodeURIComponent((c.title || '').substring(0, 8))}'">
                    <div class="course-card-badge">
                        <i class="fa fa-play-circle mr-1"></i>${duration}分钟
                    </div>
                </div>
                <div class="p-4">
                    <div class="flex items-center mb-2">
                        <span class="text-xs ${TAG_STYLES[catName]||'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'} px-2 py-1 rounded">${catName}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                            <i class="fa fa-user mr-1"></i>${learners}
                        </span>
                    </div>
                    <h3 class="font-bold mb-2 line-clamp-2 h-12 text-gray-800 dark:text-white">${c.title || ''}</h3>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                            ${lecAvatar ? `<img src="${lecAvatar}" alt="${lecName}" class="w-6 h-6 rounded-full" onerror="this.style.display='none'">` : ''}
                            <span class="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[100px]">${lecName}</span>
                        </div>
                        <div class="flex items-center text-yellow-500">
                            <i class="fa fa-star text-xs"></i>
                            <span class="text-xs ml-1">${rating}</span>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    /**
     * 渲染明星讲师
     */
    function renderFeaturedLecturers() {
        const container = document.getElementById('featured-lecturers-grid');
        if (!container) return;

        let featured = [];
        if (window.DataAPI) {
            const flIds = window.DataAPI.getFeaturedLecturerIds();
            const allLecturers = window.DataAPI.getEnabledLecturers();
            
            if (flIds && flIds.length > 0) {
                featured = flIds.map(id => allLecturers.find(l => String(l.id) === String(id))).filter(Boolean);
            } else {
                featured = allLecturers.slice(0, 6);
            }
        }

        if (!featured.length) {
            container.innerHTML = `
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold text-gray-800 dark:text-white">明星讲师</h2>
                    <a href="teacher.html" class="text-primary hover:underline flex items-center text-base">全部 <i class="fa fa-angle-right ml-1"></i></a>
                </div>
                <div class="empty-state col-span-full">
                    <div class="empty-state-icon"><i class="fa fa-users"></i></div>
                    <div class="empty-state-title">暂无讲师信息</div>
                    <div class="empty-state-desc">敬请期待更多优秀讲师加入</div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-bold text-gray-800 dark:text-white">明星讲师</h2>
                <a href="teacher.html" class="text-primary hover:underline flex items-center text-base">全部 <i class="fa fa-angle-right ml-1"></i></a>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${featured.map(l => {
                    const skills = l.skills || [];
                    const skillTags = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());
                    const levelName = l.levelName || '讲师';
                    const courseCount = l.courseCount || 0;
                    
                    return `
                    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" onclick="location.href='teacher.html'">
                        <div class="flex items-center space-x-4">
                            <div class="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 border-2 border-primary">
                                <img src="${l.avatar || ''}" alt="${l.name}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/64x64/667eea/white?text=${encodeURIComponent(l.name.charAt(0))}'">
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="font-bold text-gray-800 dark:text-white mb-1">${l.name}</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">${levelName}</p>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">${courseCount}个原创内容</p>
                                <div class="flex flex-wrap gap-2">
                                    ${skillTags.slice(0, 2).map(skill => `
                                        <span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">${skill}</span>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * 渲染统计数据
     */
    function renderStats() {
        let courses = [];
        let lecturers = [];
        
        if (window.DataAPI) {
            courses = window.DataAPI.getCourses() || [];
            lecturers = window.DataAPI.getEnabledLecturers() || [];
        }

        const courseCount = courses.length;
        const lecturerCount = lecturers.length;
        
        // 模拟学习人数
        const learnerCount = 1280;
        const totalHours = Math.max(520, courses.reduce((sum, c) => sum + Math.floor((c.duration || 0) / 3600), 0));

        animateNumber('stat-courses', courseCount, 0);
        animateNumber('stat-teachers', lecturerCount, 0);
        animateNumber('stat-learners', learnerCount, 0);
        animateNumber('stat-hours', totalHours, 0);
    }

    /**
     * 数字动画
     */
    function animateNumber(elementId, target, duration = 1500) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const start = 0;
        const increment = target / (duration / 16);
        let current = start;

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                element.textContent = target.toLocaleString();
                clearInterval(timer);
            } else {
                element.textContent = Math.floor(current).toLocaleString();
            }
        }, 16);
    }

})();
