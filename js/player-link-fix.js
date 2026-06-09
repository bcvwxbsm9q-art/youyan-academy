/**
 * 课程跳转登录检查模块
 * 确保用户在点击课程时已登录，未登录则跳转到登录页
 */

(function() {
    'use strict';

    /**
     * 跳转到课程播放器
     * @param {number|string} courseId - 课程ID
     */
    function goToPlayer(courseId) {
        // 浏览量 +1（异步发送，不阻塞跳转）
        try {
            fetch('/api/course-views', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId: String(courseId) }),
                keepalive: true  // 确保跳转后请求仍能完成
            }).catch(() => {});  // 静默失败，不影响用户体验
        } catch(e) {}

        // 检查是否已登录
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const user = (function() {
            const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
            if (userStr) {
                try {
                    return JSON.parse(userStr);
                } catch (e) {
                    return null;
                }
            }
            return null;
        })();

        if (!token || !user) {
            // 未登录，跳转到首页（会弹出登录弹窗）
            const returnUrl = encodeURIComponent(window.location.href);
            window.location.href = `index.html?returnUrl=${returnUrl}`;
            return;
        }

        // 已登录，跳转到播放器
        window.location.href = `player.html?courseId=${courseId}`;
    }

    /**
     * 跳转到课程播放器（通过事件对象）
     * @param {Event} event - 事件对象
     * @param {number|string} courseId - 课程ID
     */
    function goToPlayerEvent(event, courseId) {
        event.preventDefault();
        event.stopPropagation();
        goToPlayer(courseId);
    }

    /**
     * 初始化课程卡片点击事件
     * 替换现有的 onclick 处理逻辑
     */
    function initCourseCardLinks() {
        // 查找所有课程卡片
        document.querySelectorAll('.course-card').forEach(card => {
            // 获取课程ID
            const onclickAttr = card.getAttribute('onclick');
            const match = onclickAttr?.match(/courseId=(\d+)/);
            
            if (match && match[1]) {
                const courseId = match[1];
                
                // 替换 onclick 处理
                card.setAttribute('onclick', `;window.CoursePage?.goToPlayer?.(${courseId}) || goToCourse(${courseId})`);
                card.style.cursor = 'pointer';
            }
        });

        // 绑定使用 data-course-id 的元素
        document.querySelectorAll('[data-course-id]').forEach(el => {
            const courseId = el.getAttribute('data-course-id');
            el.addEventListener('click', function(e) {
                e.preventDefault();
                goToPlayer(courseId);
            });
            el.style.cursor = 'pointer';
        });
    }

    /**
     * 兼容函数：直接跳转到课程（用于 HTML onclick 属性）
     * @param {number|string} courseId - 课程ID
     */
    window.goToCourse = goToPlayer;

    // 导出到全局
    window.CoursePage = window.CoursePage || {};
    window.CoursePage.goToPlayer = goToPlayer;
    window.CoursePage.goToPlayerEvent = goToPlayerEvent;
    window.CoursePage.initCourseCardLinks = initCourseCardLinks;

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initCourseCardLinks, 300);
        });
    } else {
        setTimeout(initCourseCardLinks, 300);
    }

    // 监听 DOM 变化（用于动态加载的课程卡片）
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    setTimeout(initCourseCardLinks, 100);
                }
            });
        });
        
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }
})();
