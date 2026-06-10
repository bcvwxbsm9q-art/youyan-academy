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

    let isIndexInitialized = false;
    
    // 等待 DOM 加载完成
    document.addEventListener('DOMContentLoaded', function() {
        if (isIndexInitialized) return;
        isIndexInitialized = true;
        
        try {
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
                window.DataSync.listen(DataSync.EventTypes.ALL, async function(event) {
                    console.log('[Index] 数据更新:', event.type);
                    // 从服务器重新加载最新数据，确保缓存不陈旧
                    if (window.DataAPI && window.DataAPI.reloadFromServer) {
                        await window.DataAPI.reloadFromServer();
                    }
                    renderAll();
                });
            }
        } catch (error) {
            console.error('[Index] 初始化失败:', error);
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
     * 渲染轮播图（从 API 动态加载）
     */
    async function renderBanners() {
        const container = document.getElementById('banner-container');
        const indicators = document.getElementById('banner-indicators');
        
        if (!container || !indicators) return;

        let banners = [];

        // 从 API 获取轮播图数据
        try {
            const res = await fetch(`${API_SERVER}/banners`);
            if (res.ok) {
                banners = await res.json();
                // 只显示已发布的
                banners = banners.filter(b => b.status !== 'draft');
            }
        } catch (e) {
            console.error('加载轮播图失败:', e);
        }

        // 如果 API 无数据，回退到 DataAPI
        if (!banners || banners.length === 0) {
            if (window.DataAPI) {
                banners = window.DataAPI.getBanners();
            }
        }

        // 最终兜底
        if (!banners || banners.length === 0) {
            banners = [{
                id: 1,
                img: '',
                order: 1,
                title: '欢迎来到游雁学院',
                description: '持续学习，成就更好的自己'
            }];
        }

        const sorted = [...banners].sort((a, b) => (a.order || 0) - (b.order || 0));
        const total = sorted.length;

        // ---- 重建轮播 HTML ----
        // 第一张用 relative（撑开容器高度），其余 absolute 叠放
        const slidesHtml = sorted.map((b, i) => {
            const clickHandler = b.courseId ?
                `onclick="location.href='player.html?courseId=${b.courseId}'"` :
                `onclick="location.href='course.html'"`;
            const imgTag = b.img ?
                `<img src="${b.img}" alt="轮播图" class="w-full h-auto block">` :
                `<div class="w-full bg-gradient-to-br from-indigo-500 to-purple-600" style="padding-top:37.5%"></div>`;
            if (i === 0) {
                // 第一张 relative，撑开容器高度（用 style 强制覆盖任何外部 CSS）
                return `<div class="carousel-slide cursor-pointer" data-idx="0" ${clickHandler} style="position:relative;width:100%;">
                    ${imgTag}
                    ${b.courseId ? `<div style="position:absolute;bottom:24px;right:24px;z-index:10;"><span class="inline-block px-4 py-2 bg-white/20 backdrop-blur rounded-full text-white text-sm">点击查看课程 →</span></div>` : ''}
                </div>`;
            } else {
                // 其余绝对定位叠放，初始透明
                return `<div class="carousel-slide cursor-pointer" data-idx="${i}" ${clickHandler} style="position:absolute;top:0;left:0;right:0;bottom:0;opacity:0;transition:opacity 0.5s;z-index:${i+1};">
                    ${imgTag}
                    ${b.courseId ? `<div style="position:absolute;bottom:24px;right:24px;z-index:10;"><span class="inline-block px-4 py-2 bg-white/20 backdrop-blur rounded-full text-white text-sm">点击查看课程 →</span></div>` : ''}
                </div>`;
            }
        }).join('');

        const dotsHtml = sorted.map((b, i) =>
            `<button class="carousel-indicator ${i===0?'active':''}" data-idx="${i}" aria-label="第${i+1}张"></button>`
        ).join('');

        // 注入 slides 和控制按钮
        container.innerHTML = slidesHtml +
            `<button id="prev-slide" class="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/90 backdrop-blur-sm text-gray-800 flex items-center justify-center hover:bg-white transition-all shadow-lg hover:shadow-xl active:scale-95" style="z-index:30" aria-label="上一张"><i class="fa fa-chevron-left"></i></button>` +
            `<button id="next-slide" class="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/90 backdrop-blur-sm text-gray-800 flex items-center justify-center hover:bg-white transition-all shadow-lg hover:shadow-xl active:scale-95" style="z-index:30" aria-label="下一张"><i class="fa fa-chevron-right"></i></button>`;

        indicators.innerHTML = dotsHtml;

        initCarousel(container, total);
    }

    let currentSlide = 0;
    let carouselTimer = null;

    function initCarousel(container, totalSlides) {
        // 清除旧定时器
        if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; }
        currentSlide = 0;

        function getSlides() { return Array.from(container.querySelectorAll('.carousel-slide')); }
        function getDots()   { return Array.from(document.querySelectorAll('.carousel-indicator')); }

        function goToSlide(index) {
            getSlides().forEach((slide, i) => {
                const isFirst = slide.dataset.idx === '0';
                if (i === index) {
                    slide.style.opacity = '1';
                    slide.style.zIndex  = String(totalSlides + 2);
                } else {
                    slide.style.opacity = '0';
                    slide.style.zIndex  = isFirst ? '1' : String(parseInt(slide.dataset.idx) + 1);
                }
            });
            getDots().forEach((dot, i) => dot.classList.toggle('active', i === index));
            currentSlide = index;
        }

        function nextSlide() { goToSlide((currentSlide + 1) % totalSlides); }
        function prevSlide() { goToSlide((currentSlide - 1 + totalSlides) % totalSlides); }

        // 初始显示第一张
        goToSlide(0);

        // 自动轮播
        if (totalSlides > 1) {
            carouselTimer = setInterval(nextSlide, 5000);
        }

        // 指示器点击
        getDots().forEach(dot => {
            dot.addEventListener('click', () => {
                goToSlide(parseInt(dot.dataset.idx));
                if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = setInterval(nextSlide, 5000); }
            });
        });

        // 左右按钮（事件委托，只绑一次）
        container.addEventListener('click', function carouselClick(e) {
            if (e.target.closest('#prev-slide')) {
                e.stopPropagation();
                prevSlide();
                if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = setInterval(nextSlide, 5000); }
            } else if (e.target.closest('#next-slide')) {
                e.stopPropagation();
                nextSlide();
                if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = setInterval(nextSlide, 5000); }
            }
        });

        // 触摸滑动支持
        let touchStartX = 0;
        container.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        container.addEventListener('touchend', e => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                diff > 0 ? nextSlide() : prevSlide();
                if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = setInterval(nextSlide, 5000); }
            }
        }, { passive: true });
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
    window.showNoticeDetail = async function(noticeId) {
        let notices = [];
        
        // 优先从 API 获取
        try {
            const res = await fetch(`${API_SERVER}/notices`);
            if (res.ok) {
                notices = await res.json();
            }
        } catch (e) {
            console.error('加载公告失败:', e);
        }
        
        // 回退到 DataAPI
        if (!notices || notices.length === 0) {
            if (window.DataAPI) {
                notices = window.DataAPI.getNotices() || [];
            }
        }
        
        const notice = notices.find(n => n.id === noticeId);
        if (!notice) return;

        const modal = document.createElement('div');
        modal.id = 'notice-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeNoticeModal()"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col animate-fade-in">
                <!-- 头部 -->
                <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div class="flex items-center space-x-3 flex-1 min-w-0">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-bullhorn text-white"></i>
                        </div>
                        <div class="min-w-0">
                            <h3 class="font-semibold text-gray-800 text-lg truncate">${notice.title || '公告详情'}</h3>
                            <p class="text-xs text-gray-500 mt-0.5">
                                ${notice.pinned ? '<span class="text-red-500 mr-1"><i class="fas fa-thumbtack"></i>置顶</span>' : ''}
                                ${notice.publishedAt || notice.createdAt || ''}
                            </p>
                        </div>
                    </div>
                    <button onclick="closeNoticeModal()" class="text-gray-400 hover:text-gray-600 transition ml-2 flex-shrink-0">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <!-- 内容区 -->
                <div class="flex-1 overflow-y-auto">
                    <!-- 封面图 -->
                    ${notice.cover ? `
                        <div class="w-full h-48 md:h-64 overflow-hidden">
                            <img src="${notice.cover}" alt="${notice.title}" class="w-full h-full object-cover">
                        </div>
                    ` : ''}
                    
                    <!-- 富文本内容 -->
                    <div class="p-6 md:p-8">
                        <div class="prose prose-indigo max-w-none notice-content">
                            ${notice.content || '<p class="text-gray-400 text-center py-8">暂无内容</p>'}
                        </div>
                    </div>
                </div>
                
                <!-- 底部 -->
                <div class="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
                    <button onclick="closeNoticeModal()" class="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition font-medium">
                        关闭
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // 阻止事件冒泡
        modal.querySelector('.relative').addEventListener('click', (e) => e.stopPropagation());
        
        // ESC 键关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeNoticeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        // 锁定滚动
        document.body.style.overflow = 'hidden';
    };

    window.closeNoticeModal = function() {
        const modal = document.getElementById('notice-modal');
        if (modal) {
            modal.remove();
            // 恢复滚动
            document.body.style.overflow = '';
        }
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
                courses = allCourses.slice(0, 8);
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

        container.innerHTML = courses.map(c => renderNewCourseCard(c, window.DataAPI)).join('');
    }

    /**
     * 新版课程卡片 - 参考图设计
     */
    function renderNewCourseCard(c, api) {
        const lecName = (api && api.getLecturerName(c.lecturerId)) || '待定讲师';
        const lecAvatar = (api && api.getLecturerAvatar(c.lecturerId)) || '';
        const learners = (c.views || 0) > 10000 ? (c.views / 10000).toFixed(1) + '万' : (c.views || 0);
        const rating = (c.rating || 0).toFixed(1);
        const coverUrl = c.cover && c.cover.trim() ? c.cover : '';
        // 确定性伪数据（保持每次渲染一致）
        const seed = parseInt(c.id) || 1;
        const comments = c.comments || (seed * 7 + 3) % 20;
        const likes = c.likes || (seed * 13 + 5) % 50;

        return `
        <div class="card-enhanced course-card cursor-pointer fade-in group overflow-hidden" onclick="location.href='player.html?courseId=${c.id}'">
            <!-- Cover Area -->
            <div class="relative overflow-hidden" style="aspect-ratio: 16/10;">
                ${coverUrl ? `<img src="${coverUrl}" alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" onerror="this.style.display='none'">` : ''}
                <div class="absolute inset-0 bg-gradient-to-r from-[#3d3188]/95 via-[#4c3db2]/85 to-[#5d4ec7]/50">
                    <div class="absolute inset-0 opacity-20" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.05) 20px, rgba(255,255,255,0.05) 40px);"></div>
                </div>
                <!-- Green badge -->
                <div class="absolute top-2 right-2 z-20">
                    <span class="inline-block px-1.5 py-0.5 bg-green-500 text-white text-[10px] font-medium rounded-sm">创新课</span>
                </div>
                <!-- Text content -->
                <div class="absolute inset-0 z-10 flex flex-col justify-between p-3">
                    <div class="pr-8">
                        <h3 class="text-white font-bold text-sm leading-snug line-clamp-3" style="text-shadow: 0 1px 3px rgba(0,0,0,0.3);">${c.title || ''}</h3>
                        <p class="text-white/80 text-[10px] mt-1">讲师：${lecName}</p>
                    </div>
                    <div class="flex items-center text-white/60 text-[10px]">
                        <i class="fa fa-graduation-cap mr-1"></i>
                        <span>游雁学院</span>
                    </div>
                </div>
            </div>
            <!-- Info Area -->
            <div class="p-3 bg-white dark:bg-white">
                <h4 class="font-bold text-gray-800 text-sm mb-2 line-clamp-1">${c.title || ''}</h4>
                <div class="flex items-center mb-2">
                    <div class="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center overflow-hidden mr-2 flex-shrink-0">
                        ${lecAvatar ? `<img src="${lecAvatar}" alt="${lecName}" class="w-full h-full object-cover" onerror="this.style.display='none';this.parentNode.innerHTML='<i class=\\'fa fa-user text-white text-[8px]\\'></i>'">` : `<i class="fa fa-user text-white text-[8px]"></i>`}
                    </div>
                    <span class="text-xs text-gray-600 truncate">${lecName}</span>
                </div>
                <div class="flex items-center justify-between text-xs text-gray-500">
                    <div class="flex items-center space-x-2">
                        <span class="flex items-center"><i class="fa fa-eye mr-0.5 text-gray-400 text-[10px]"></i>${learners}</span>
                        <span class="flex items-center"><i class="fa fa-comment-o mr-0.5 text-gray-400 text-[10px]"></i>${comments}</span>
                        <span class="flex items-center"><i class="fa fa-thumbs-o-up mr-0.5 text-gray-400 text-[10px]"></i>${likes}</span>
                    </div>
                    <div class="flex items-center text-yellow-500 font-medium">
                        <i class="fa fa-star mr-0.5 text-[10px]"></i>${rating}
                    </div>
                </div>
            </div>
        </div>
        `;
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
                <h2 class="text-xl font-bold text-gray-800">明星讲师</h2>
                <a href="teacher.html" class="text-indigo-600 hover:text-indigo-700 hover:underline flex items-center text-sm font-medium">全部 <i class="fa fa-angle-right ml-1"></i></a>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${featured.map(l => {
                    const skills = l.skills || [];
                    const skillTags = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());
                    const levelName = l.levelName || '初级讲师';
                    const courseCount = l.courseCount || 0;
                    
                    return `
                    <div class="group bg-white rounded-2xl border border-gray-100 p-5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5" onclick="location.href='teacher.html'">
                        <div class="flex items-center space-x-4">
                            <div class="relative">
                                <div class="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-indigo-50 to-purple-50 p-0.5">
                                    <img src="${l.avatar || ''}" alt="${l.name}" class="w-full h-full rounded-full object-cover" onerror="this.src='https://placehold.co/64x64/f0f0f0/666?text=${encodeURIComponent(l.name.charAt(0))}'">
                                </div>
                                <div class="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full border-2 border-white"></div>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-800 text-lg mb-1 group-hover:text-indigo-600 transition-colors">${l.name}</h3>
                                <p class="text-sm text-gray-500 mb-1">${levelName}</p>
                                <p class="text-sm text-gray-400 mb-3">${courseCount}个原创内容</p>
                                <div class="flex flex-wrap gap-2">
                                    ${skillTags.slice(0, 2).map(skill => `
                                        <span class="text-xs font-medium bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full group-hover:bg-indigo-100 transition-colors">${skill}</span>
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
