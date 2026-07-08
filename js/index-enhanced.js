/**
 * ============================================================
 * 首页增强功能 - 移动端优化版本
 * 支持前后端数据联动
 * ============================================================
 */

(function() {
    'use strict';

    // 防抖定时器：防止短时间内多次渲染导致卡片闪烁
    let _renderDebounceTimer = null;

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

    // 讲师等级样式映射
    const LECTURER_LEVEL_STYLES = {
        'chief': { class: 'level-chief', name: '首席讲师', icon: 'fa-star' },
        'senior': { class: 'level-senior', name: '高级讲师', icon: 'fa-certificate' },
        'intermediate': { class: 'level-intermediate', name: '中级讲师', icon: 'fa-graduation-cap' },
        'junior': { class: 'level-junior', name: '初级讲师', icon: 'fa-user' },
        'intern': { class: 'level-intern', name: '实习讲师', icon: 'fa-user-o' }
    };

    // 保存首页讲师数据供弹窗使用
    let _featuredLecturers = [];

    // HTML 转义
    function escapeHtml(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    // 富文本 HTML 消毒：仅保留安全标签，移除事件处理器和危险协议
    function sanitizeHtml(html) {
        if (!html) return '';
        const allowedTags = new Set(['p','br','strong','b','em','i','u','s','span','div','h1','h2','h3','h4','h5','h6','ul','ol','li','a','img','table','thead','tbody','tr','td','th','blockquote','pre','code','hr']);
        const allowedAttrs = new Set(['href','src','alt','title','class','style','target','width','height']);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
            if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
            const tag = node.tagName.toLowerCase();
            if (!allowedTags.has(tag)) return document.createTextNode(node.textContent || '');
            const el = document.createElement(tag);
            for (const attr of Array.from(node.attributes)) {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on')) continue;
                if (!allowedAttrs.has(name)) continue;
                let value = attr.value;
                if (name === 'href' || name === 'src') {
                    value = value.replace(/\s/g, '');
                    if (/^(javascript|vbscript):/i.test(value)) continue;
                    if (/^data:/i.test(value) && !/^data:image\//i.test(value)) continue;
                    if (tag === 'a' && name === 'href' && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
                        value = 'https://' + value;
                    }
                }
                el.setAttribute(name, value);
            }
            Array.from(node.childNodes).forEach(child => el.appendChild(walk(child)));
            return el;
        };
        const wrapper = document.createElement('div');
        Array.from(doc.body.childNodes).forEach(child => wrapper.appendChild(walk(child)));
        return wrapper.innerHTML;
    }
    
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

            // 监听数据同步事件
            if (window.DataSync) {
                window.DataSync.listen(DataSync.EventTypes.ALL, async function(event) {
                    console.log('[Index] 数据更新:', event.type);
                    // 从服务器重新加载最新数据，确保缓存不陈旧
                    if (window.DataAPI && window.DataAPI.reloadFromServer) {
                        await window.DataAPI.reloadFromServer();
                    }
                    // 同时刷新 localStorage 缓存（确保播放页的本地更新也能同步）
                    if (window.DataAPI && window.DataAPI.refreshFromLocalStorage) {
                        window.DataAPI.refreshFromLocalStorage();
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

        // 监听播放页的数据变化（浏览量/点赞/评分），实时刷新课程卡片（带防抖）
        window.addEventListener('storage', function(e) {
            if (e.key === 'course_interaction_sync' || e.key === 'learning_platform_data') {
                console.log('[Index] 检测到数据变化，刷新缓存并重新渲染');
                if (window.DataAPI && window.DataAPI.refreshFromLocalStorage) {
                    window.DataAPI.refreshFromLocalStorage();
                }
                refreshCourseCards();
            }
        });

        // 页面重新可见时刷新数据（带防抖）
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                console.log('[Index] 页面重新可见，刷新缓存');
                if (window.DataAPI && window.DataAPI.refreshFromLocalStorage) {
                    window.DataAPI.refreshFromLocalStorage();
                }
                renderAll();
            }
        });
    }

    /**
     * 渲染所有内容（带防抖，防止短时间内多次调用导致闪烁）
     */
    function renderAll() {
        if (_renderDebounceTimer) clearTimeout(_renderDebounceTimer);
        _renderDebounceTimer = setTimeout(async function() {
            _renderDebounceTimer = null;
            renderBanners();
            await renderNotice();  // 现在是async函数，需要await
            renderFeaturedCourses();
            await renderFeaturedLecturers();
        }, 150);
    }

    /**
     * 仅刷新课程卡片（带防抖）
     */
    function refreshCourseCards() {
        if (_renderDebounceTimer) clearTimeout(_renderDebounceTimer);
        _renderDebounceTimer = setTimeout(function() {
            _renderDebounceTimer = null;
            renderFeaturedCourses();
        }, 150);
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
            let clickHandler;
            if (b.announcementId) {
                clickHandler = `onclick="location.href='messages.html?noticeId=${encodeURIComponent(b.announcementId)}'"`;
            } else if (b.courseId) {
                clickHandler = `onclick="location.href='player.html?courseId=${b.courseId}'"`;
            } else {
                clickHandler = `onclick="location.href='course.html'"`;
            }
            const imgTag = b.img ?
                `<img src="${b.img}" alt="轮播图" class="w-full h-auto block">` :
                `<div class="w-full bg-gradient-to-br from-indigo-500 to-purple-600" style="padding-top:37.5%"></div>`;
            if (i === 0) {
                // 第一张 relative，撑开容器高度（用 style 强制覆盖任何外部 CSS）
                return `<div class="carousel-slide cursor-pointer" data-idx="0" ${clickHandler} style="position:relative;width:100%;">
                    ${imgTag}
                </div>`;
            } else {
                // 其余绝对定位叠放，初始透明
                return `<div class="carousel-slide cursor-pointer" data-idx="${i}" ${clickHandler} style="position:absolute;top:0;left:0;right:0;bottom:0;opacity:0;transition:opacity 0.5s;z-index:${i+1};">
                    ${imgTag}
                </div>`;
            }
        }).join('');

        const dotsHtml = sorted.map((b, i) =>
            `<button class="carousel-indicator ${i===0?'active':''}" data-idx="${i}" aria-label="第${i+1}张"></button>`
        ).join('');

        // 注入 slides 和控制按钮
        container.innerHTML = slidesHtml +
            `<button id="prev-slide" class="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/40 backdrop-blur-sm text-gray-600 flex items-center justify-center hover:bg-white/80 hover:text-gray-800 transition-all shadow-md hover:shadow-lg active:scale-95" style="z-index:30" aria-label="上一张"><i class="fa fa-chevron-left"></i></button>` +
            `<button id="next-slide" class="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/40 backdrop-blur-sm text-gray-600 flex items-center justify-center hover:bg-white/80 hover:text-gray-800 transition-all shadow-md hover:shadow-lg active:scale-95" style="z-index:30" aria-label="下一张"><i class="fa fa-chevron-right"></i></button>`;

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
     * 渲染公告 - 优先从API获取最新数据
     */
    async function renderNotice() {
        const el = document.getElementById('notice-content');
        if (!el) return;

        let notices = [];

        // 优先从API服务器获取最新公告数据
        try {
            const res = await fetch(`${API_SERVER}/notices`);
            if (res.ok) {
                const apiNotices = await res.json();
                if (Array.isArray(apiNotices) && apiNotices.length > 0) {
                    notices = apiNotices;
                    console.log('[Index] 从API获取到', notices.length, '条公告');
                }
            }
        } catch (e) {
            console.warn('[Index] 获取公告API失败，回退到本地缓存:', e.message);
        }

        // 回退到DataAPI缓存
        if (!notices.length && window.DataAPI) {
            notices = window.DataAPI.getNotices() || [];
        }

        // 按置顶和发布时间排序：置顶优先，然后按时间倒序
        const published = notices.filter(n => n.status === 'published')
            .sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0);
            });

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

        // 记录公告访问
        try {
          const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
          const user = userStr ? JSON.parse(userStr) : {};
          await fetch(`${API_SERVER}/notices/${noticeId}/visit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id || user.username || 'anonymous',
              username: user.displayName || user.username || '访客'
            })
          });
        } catch (e) {
          console.warn('[Index] 记录公告访问失败:', e.message);
        }

        // 注入弹窗动画样式（仅注入一次）
        if (!document.getElementById('notice-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'notice-modal-styles';
            style.textContent = `
                @keyframes noticeModalIn {
                    from { opacity: 0; transform: scale(0.97) translateY(12px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
                .notice-modal-enter {
                    animation: noticeModalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
                }
                .notice-scroll::-webkit-scrollbar { width: 4px; }
                .notice-scroll::-webkit-scrollbar-track { background: transparent; }
                .notice-scroll::-webkit-scrollbar-thumb { background: rgba(102,126,234,0.15); border-radius: 10px; }
                .notice-scroll::-webkit-scrollbar-thumb:hover { background: rgba(102,126,234,0.3); }
                .notice-content img { border-radius: 10px; max-width: 100%; }
                .notice-content p { margin-bottom: 1em; line-height: 1.8; color: #52525b; }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.id = 'notice-modal';
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8';
        modal.innerHTML = `
            <!-- 背景遮罩 -->
            <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeNoticeModal()"></div>

            <!-- 弹窗主体 -->
            <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col notice-modal-enter">
                <!-- 紫色渐变头部（全宽） -->
                <div class="relative bg-gradient-to-r from-[#667eea] to-[#764ba2] px-6 py-4 flex-shrink-0">
                    <!-- 头部内容 -->
                    <div class="relative flex items-center justify-between">
                        <div class="flex items-center gap-3.5 flex-1 min-w-0 pr-4">
                            <div class="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0 shadow-sm">
                                <i class="fa fa-bell text-white text-lg"></i>
                            </div>
                            <div class="min-w-0 self-center">
                                <h3 class="text-white font-bold text-[18px] leading-snug truncate">${escapeHtml(notice.title) || '公告详情'}</h3>
                                <div class="flex items-center gap-2 mt-1">
                                    <p class="text-white/75 text-[12px] font-medium">公告通知</p>
                                    ${notice.pinned ? '<span class="inline-flex items-center px-1.5 py-[2px] rounded-md text-[10px] font-semibold bg-white/20 text-white"><i class="fa fa-thumb-tack mr-0.5"></i>置顶</span>' : ''}
                                    <span class="text-white/65 text-[12px]">
                                        <i class="fa fa-regular fa-clock mr-1"></i>${notice.publishedAt || notice.createdAt || ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <!-- 关闭按钮 -->
                        <button onclick="closeNoticeModal()" class="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white/90 hover:text-white transition-all duration-200 flex-shrink-0 flex items-center justify-center group self-center">
                            <i class="fa fa-times text-base group-hover:rotate-90 inline-block transition-transform duration-300"></i>
                        </button>
                    </div>
                </div>

                <!-- 内容区 -->
                <div class="flex-1 overflow-y-auto notice-scroll">
                    <!-- 封面图 -->
                    ${notice.cover ? `
                        <div class="w-full h-48 md:h-56 overflow-hidden">
                            <img src="${escapeHtml(notice.cover)}" alt="${escapeHtml(notice.title)}" class="w-full h-full object-cover">
                        </div>
                    ` : ''}

                    <!-- 富文本内容 -->
                    <div class="p-6 md:p-7">
                        <div class="prose prose-slate max-w-none notice-content text-gray-600 leading-relaxed">
                            ${sanitizeHtml(notice.content) || '<p class="text-gray-300 text-center py-12"><i class="fa fa-inbox text-3xl mb-3 block opacity-40"></i>暂无内容</p>'}
                        </div>
                    </div>
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
            const inner = modal.querySelector('.notice-modal-enter');
            if (inner) {
                inner.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 1, 1)';
                inner.style.opacity = '0';
                inner.style.transform = 'scale(0.96) translateY(8px)';
            }
            const backdrop = modal.querySelector('.absolute.inset-0');
            if (backdrop) {
                backdrop.style.transition = 'opacity 0.2s ease';
                backdrop.style.opacity = '0';
            }
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 280);
        }
    };

    /**
     * 渲染精品课程（按热门程度降序展示，最多8个）
     */
    function renderFeaturedCourses() {
        const container = document.getElementById('featured-courses-inner');
        if (!container) return;

        let courses = [];
        if (window.DataAPI) {
            const fcIds = window.DataAPI.getFeaturedCourseIds();
            const allCourses = window.DataAPI.getPublishedCourses();
            const allSorted = [...allCourses].sort((a, b) => (b.views || 0) - (a.views || 0));

            if (fcIds && fcIds.length > 0) {
                const courseMap = new Map(allCourses.map(c => [String(c.id), c]));
                // 过滤掉已删除/不存在的课程ID，再按热门程度排序
                const featured = fcIds
                    .map(id => courseMap.get(String(id)))
                    .filter(Boolean)
                    .sort((a, b) => (b.views || 0) - (a.views || 0));

                const featuredIds = new Set(featured.map(c => String(c.id)));
                const remaining = allSorted.filter(c => !featuredIds.has(String(c.id)));

                courses = [...featured, ...remaining].slice(0, 8);
            } else {
                courses = allSorted.slice(0, 8);
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

    /**
     * 渲染明星讲师（实时从API获取数据）
     */
    async function renderFeaturedLecturers() {
        const container = document.getElementById('featured-lecturers-grid');
        if (!container) return;

        let featured = [];
        const levelRank = { chief: 5, senior: 4, intermediate: 3, junior: 2, intern: 1 };
        const sortLecturers = (lecturers) => lecturers.sort((a, b) => {
            const rankA = levelRank[a.level] || 0;
            const rankB = levelRank[b.level] || 0;
            if (rankB !== rankA) return rankB - rankA;
            return (b.courseCount || 0) - (a.courseCount || 0);
        });

        // 优先从API实时获取讲师数据（带动态courseCount）
        try {
            const res = await fetch(`${API_SERVER}/lecturers`);
            if (res.ok) {
                const result = await res.json();
                const allLecturers = (result.data || []).filter(l => l.status === 'enabled');
                featured = sortLecturers(allLecturers).slice(0, 6);
            }
        } catch (e) {
            console.warn('[Index] 获取讲师数据失败，回退到缓存:', e);
            // 回退到DataAPI缓存
            if (window.DataAPI) {
                const allLecturers = window.DataAPI.getEnabledLecturers();
                featured = sortLecturers(allLecturers).slice(0, 6);
            }
        }

        if (!featured.length) {
            container.innerHTML = `
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold text-gray-800 dark:text-white">明星讲师</h2>
                    <a href="teacher.html" class="text-primary hover:underline flex items-center text-base">查看全部 <i class="fa fa-angle-right ml-1"></i></a>
                </div>
                <div class="empty-state col-span-full">
                    <div class="empty-state-icon"><i class="fa fa-users"></i></div>
                    <div class="empty-state-title">暂无讲师信息</div>
                    <div class="empty-state-desc">敬请期待更多优秀讲师加入</div>
                </div>
            `;
            return;
        }

        // 保存数据供弹窗使用
        _featuredLecturers = featured;

        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-bold text-gray-800">明星讲师</h2>
                <a href="teacher.html" class="text-indigo-600 hover:text-indigo-700 hover:underline flex items-center text-sm font-medium">查看全部 <i class="fa fa-angle-right ml-1"></i></a>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${featured.map(l => {
                    const skills = l.skills || [];
                    const skillTags = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());
                    const levelName = l.levelName || '初级讲师';
                    const courseCount = l.courseCount || 0;
                    
                    return `
                    <div class="group bg-white rounded-2xl border border-gray-100 p-5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5" onclick="showLecturerDetail(${l.id})">
                        <div class="flex items-center space-x-4">
                            <div class="relative">
                                <div class="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-indigo-50 to-purple-50 p-0.5">
                                    <img src="${l.avatar || ''}" alt="${l.name}" class="w-full h-full rounded-full object-cover" onerror="this.src='https://placehold.co/64x64/f0f0f0/666?text=${encodeURIComponent((l.name || '师').charAt(0))}'">
                                </div>
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
     * 获取讲师的所有课程
     */
    function getLecturerCourses(lecturerId) {
        const api = window.DataAPI;
        if (!api) return [];
        return (api.getCourses() || []).filter(c => String(c.lecturerId) === String(lecturerId));
    }

    /**
     * 获取讲师总点赞量
     */
    function getLecturerTotalLikes(lecturerId) {
        const api = window.DataAPI;
        if (!api) return 0;
        const courses = getLecturerCourses(lecturerId);
        let total = 0;
        courses.forEach(c => {
            const idata = api.get('course_interaction_' + c.id);
            if (idata && idata.likes) total += idata.likes;
        });
        return total;
    }

    /**
     * 获取讲师平均评分
     */
    function getLecturerAvgRating(lecturerId) {
        const api = window.DataAPI;
        if (!api) return null;
        const courses = getLecturerCourses(lecturerId);
        if (!courses.length) return null;
        let sum = 0, count = 0;
        courses.forEach(c => {
            const idata = api.get('course_interaction_' + c.id);
            if (idata && idata.ratingCount > 0 && idata.ratingSum != null) {
                sum += idata.ratingSum;
                count += idata.ratingCount;
            }
        });
        return count > 0 ? sum / count : null;
    }

    /**
     * 显示讲师详情弹窗（与讲师页一致）
     */
    window.showLecturerDetail = function(lecturerId) {
        const api = window.DataAPI;
        const lecturer = _featuredLecturers.find(l => l.id === lecturerId) ||
                         (api && (api.getLecturers() || []).find(l => l.id === lecturerId));
        if (!lecturer) return;

        const levelInfo = LECTURER_LEVEL_STYLES[lecturer.level] || LECTURER_LEVEL_STYLES['intern'];
        const courseCount = getLecturerCourses(lecturer.id).length;
        const totalLikes = getLecturerTotalLikes(lecturer.id);
        const avgRating = getLecturerAvgRating(lecturer.id);
        const ratingDisplay = avgRating !== null ? avgRating.toFixed(1) : '--';

        const skills = lecturer.skills || [];
        const skillTags = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());

        const courses = getLecturerCourses(lecturer.id).slice(0, 3);

        const modalHtml = `
            <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-start justify-center pt-20 pb-8" onclick="closeLecturerModal()">
                <div class="bg-white rounded-2xl w-full max-w-md max-h-[calc(100vh-8rem)] flex flex-col shadow-xl relative overflow-hidden" onclick="event.stopPropagation()">
                    <div class="bg-gradient-primary px-6 py-4 flex-shrink-0">
                        <h2 class="text-xl font-bold text-white">讲师简介</h2>
                    </div>
                    <button class="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/30 hover:bg-white/50 flex items-center justify-center text-white transition-all z-[20]" onclick="closeLecturerModal()">
                        <i class="fa fa-times"></i>
                    </button>
                    <div class="flex-1 overflow-y-auto px-5 py-4">
                        <!-- 基本信息 -->
                        <div class="bg-gray-50 rounded-xl p-4 mb-4">
                            <div class="flex items-center gap-3">
                                <img src="${lecturer.avatar || ''}" alt="${lecturer.name}" class="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0" onerror="this.style.background='linear-gradient(135deg,#f97316,#ea580c)';this.innerHTML='<span class=\\'text-xl\\'>${(lecturer.name || '师').charAt(0)}</span>'">
                                <div>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-semibold text-gray-800">${lecturer.name}</span>
                                        <span class="inline-block ${levelInfo.class} text-white px-2 py-0.5 rounded text-xs">${levelInfo.name}</span>
                                    </div>
                                    <div class="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                        <span><i class="fa fa-book mr-1"></i>${courseCount}门课程</span>
                                        <span><i class="fa fa-thumbs-o-up mr-1"></i>${totalLikes}点赞</span>
                                        <span><i class="fa fa-star mr-1 text-yellow-500"></i>${ratingDisplay}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- 个人简介 -->
                        <div class="bg-gray-50 rounded-xl p-4 mb-4">
                            <h3 class="font-semibold text-gray-800 mb-2 flex items-center text-sm">
                                <i class="fa fa-info-circle mr-2 text-indigo-600"></i>个人简介
                            </h3>
                            <p class="text-sm text-gray-600 leading-relaxed">${lecturer.intro || '暂无简介'}</p>
                        </div>
                        <!-- 专长领域 -->
                        ${skillTags.length ? `
                        <div class="mb-4">
                            <h3 class="font-semibold text-gray-800 mb-3 text-sm flex items-center">
                                <i class="fa fa-tags mr-2 text-indigo-600"></i>专长领域
                            </h3>
                            <div class="flex flex-wrap gap-2">
                                ${skillTags.map(skill => `<span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">${skill}</span>`).join('')}
                            </div>
                        </div>
                        ` : ''}
                        <!-- 授课课程 -->
                        <div>
                            <h3 class="font-semibold text-gray-800 mb-3 text-sm flex items-center">
                                <i class="fa fa-book mr-2 text-indigo-600"></i>授课课程
                            </h3>
                            <div class="space-y-2">
                                ${courses.length ? courses.map(c => `
                                    <div class="bg-gray-50 rounded-xl p-3 cursor-pointer hover:bg-gray-100 transition-colors" onclick="closeLecturerModal(); location.href='player.html?courseId=${c.id}'">
                                        <div class="flex items-center gap-3">
                                            <img src="${c.cover || ''}" class="w-16 h-12 rounded-lg object-cover flex-shrink-0" onerror="this.src='https://placehold.co/64x48/667eea/white?text=课'">
                                            <div class="flex-1 min-w-0">
                                                <div class="text-sm font-medium text-gray-800 truncate">${c.title}</div>
                                                <div class="text-xs text-gray-500 mt-1">${Math.floor((c.duration || 0) / 60)}分钟 · ${(c.views || 0) > 10000 ? ((c.views / 10000).toFixed(1) + '万') : (c.views || 0)}人学习</div>
                                            </div>
                                        </div>
                                    </div>
                                `).join('') : '<p class="text-sm text-gray-400 text-center py-4">暂无课程</p>'}
                            </div>
                        </div>
                    </div>
                    <div class="px-5 pb-4">
                        <button class="w-full py-3 rounded-xl bg-gradient-primary text-white font-medium hover:opacity-90 transition-all" onclick="closeLecturerModal()">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 移除已有弹窗
        const existing = document.querySelector('.lecturer-detail-modal-container');
        if (existing) existing.remove();

        const modalDiv = document.createElement('div');
        modalDiv.className = 'lecturer-detail-modal-container';
        modalDiv.innerHTML = modalHtml;
        document.body.appendChild(modalDiv);

        // ESC 键关闭
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closeLecturerModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    };

    /**
     * 关闭讲师详情弹窗
     */
    window.closeLecturerModal = function() {
        const modal = document.querySelector('.lecturer-detail-modal-container');
        if (modal) modal.remove();
    };

})();
