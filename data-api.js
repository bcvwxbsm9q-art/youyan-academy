/**
 * ============================================================
 * DataAPI - 统一数据访问层
 * 实现前后端数据联动，支持本地存储和服务器API的统一接口
 * ============================================================
 */

(function() {
    'use strict';

    /**
     * 深度合并对象：target 优先（localStorage 数据）
     * - 普通值：target 覆盖 source
     * - 对象：递归合并，target 中的非空值保留
     * - 数组：target 优先
     */
    function deepMerge(source, target) {
        const result = { ...source };
        for (const key of Object.keys(target)) {
            if (!(key in source)) {
                result[key] = target[key];
            } else if (typeof target[key] === 'object' && target[key] !== null
                && !Array.isArray(target[key])
                && typeof source[key] === 'object' && source[key] !== null
                && !Array.isArray(source[key])) {
                result[key] = deepMerge(source[key], target[key]);
            } else if (Array.isArray(target[key]) || Array.isArray(source[key])) {
                // 数组：target（localStorage）优先
                result[key] = target[key];
            }
            // 其他情况：source 优先（已通过 ...source 包含）
        }
        return result;
    }

    // API 配置
    const API_BASE = window.location.origin;  // 使用当前域名
    const API_SERVER = `${API_BASE}/api`;     // 后端API服务器地址

    // API 端点
    const API = {
        // 数据同步
        GET_ALL: `${API_SERVER}/data`,
        SYNC: (key) => `${API_SERVER}/sync/${key}`,
        SYNC_ALL: `${API_SERVER}/sync-all`,
        
        // 认证
        LOGIN: `${API_SERVER}/auth/login`,
        REGISTER: `${API_SERVER}/auth/register`,
        ME: `${API_SERVER}/auth/me`,
        
        // 业务数据
        COURSES: `${API_SERVER}/courses`,
        LECTURERS: `${API_SERVER}/lecturers`,
        CATEGORIES: `${API_SERVER}/categories`,
        TRAINING: `${API_SERVER}/training`,
        USERS: `${API_SERVER}/users`,
        NOTICES: `${API_SERVER}/notices`,
        BANNERS: `${API_SERVER}/banners`,
        STATS: `${API_SERVER}/stats`
    };

    // 内存缓存
    let memoryCache = {};
    let isServerConnected = false;

    /**
     * DataAPI 主对象
     */
    const DataAPI = {
        /**
         * 初始化 - 尝试从服务器加载数据
         */
        async init() {
            try {
                // 尝试从服务器获取所有数据
                const response = await fetch(API.GET_ALL, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    // 深度合并：保留 localStorage 中的嵌套数据（如 videoProgress），不被服务器空对象覆盖
                    memoryCache = deepMerge(data, memoryCache);
                    isServerConnected = true;
                    console.log('[DataAPI] 已从服务器加载数据');
                    
                    // 保存到本地存储（用于离线支持）
                    this._saveToLocalStorage();
                    return true;
                }
            } catch (e) {
                console.log('[DataAPI] 服务器连接失败，使用本地存储');
                isServerConnected = false;
            }
            
            // 使用本地存储
            this._initLocalStorage();
            return true;
        },

        /**
         * 检查服务器连接状态
         */
        isServerConnected() {
            return isServerConnected;
        },

        /**
         * 初始化本地存储
         */
        _initLocalStorage() {
            const stored = localStorage.getItem('learning_platform_data');
            if (!stored) {
                this._loadDefaultData();
            } else {
                try {
                    const parsed = JSON.parse(stored);
                    memoryCache = { ...memoryCache, ...parsed };
                } catch (e) {
                    this._loadDefaultData();
                }
            }
        },

        /**
         * 加载默认数据
         */
        _loadDefaultData() {
            const defaultData = {
                management_courses: [
                    {
                        id: 1,
                        title: "视频课程在线学习 - 从小白到专家的进阶之路",
                        cover: "https://p26-doubao-search-sign.byteimg.com/labis/3e50046a89d633ced89e4d242d60f064~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32",
                        lecturerId: 1,
                        categoryId: 31,
                        videos: [
                            { title: "第一章：HTML基础", duration: 1800, url: "", watched: false, progress: 0 },
                            { title: "第二章：CSS样式", duration: 2100, url: "", watched: false, progress: 0 },
                            { title: "第三章：JavaScript入门", duration: 2400, url: "", watched: false, progress: 0 }
                        ],
                        duration: 6300,
                        rating: 4.8,
                        views: 12000,
                        status: "published"
                    },
                    {
                        id: 2,
                        title: "新年回好课 - 2024年企业运营策略与实践",
                        cover: "https://p11-doubao-search-sign.byteimg.com/labis/56e578a8ce507c83f91f47e08e2ec86d~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32",
                        lecturerId: 3,
                        categoryId: 41,
                        videos: [
                            { title: "企业运营概述", duration: 1500, url: "", watched: false, progress: 0 },
                            { title: "运营策略制定", duration: 1800, url: "", watched: false, progress: 0 }
                        ],
                        duration: 3300,
                        rating: 4.6,
                        views: 5200,
                        status: "published"
                    },
                    {
                        id: 3,
                        title: "平面设计进阶课程 - 14天在家安心学",
                        cover: "https://p3-doubao-search-sign.byteimg.com/labis/7cf2d040059ee347d85e5b21237a98b7~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32",
                        lecturerId: 2,
                        categoryId: 21,
                        videos: [
                            { title: "平面设计基础", duration: 1200, url: "", watched: false, progress: 0 },
                            { title: "色彩理论与配色", duration: 1500, url: "", watched: false, progress: 0 },
                            { title: "排版设计技巧", duration: 1800, url: "", watched: false, progress: 0 }
                        ],
                        duration: 4500,
                        rating: 4.9,
                        views: 8700,
                        status: "published"
                    },
                    {
                        id: 4,
                        title: "宅家舞蹈 - 12节在线直播跳操课",
                        cover: "https://p11-doubao-search-sign.byteimg.com/image/c4dfbfac6c444139eb6917c20c5531f7~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32",
                        lecturerId: 4,
                        categoryId: 51,
                        videos: [
                            { title: "热身运动", duration: 600, url: "", watched: false, progress: 0 },
                            { title: "基础舞蹈动作", duration: 1800, url: "", watched: false, progress: 0 }
                        ],
                        duration: 2400,
                        rating: 4.7,
                        views: 3500,
                        status: "published"
                    }
                ],
                lecturers: [
                    { id: 1, name: "朱子墨", avatar: "https://p3-doubao-search-sign.byteimg.com/tos-cn-i-xv4ileqgde/49e48d5ec11e46789459aaa59464547a~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32", title: "资深前端工程师", level: "chief", levelName: "首席讲师", department: "技术部", skills: ["前端开发", "JavaScript", "React"], status: "enabled", courseCount: 12, rating: 4.9 },
                    { id: 2, name: "柯博文", avatar: "https://p26-doubao-search-sign.byteimg.com/labis/a1205f7cab4c69cff4701b799f3cba04~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32", title: "设计总监", level: "senior", levelName: "高级讲师", department: "设计部", skills: ["游戏开发", "移动开发", "Unity"], status: "enabled", courseCount: 8, rating: 4.8 },
                    { id: 3, name: "屠建清", avatar: "https://p26-doubao-search-sign.byteimg.com/labis/d80a6f01a4c047e09b89bd106d2195fa~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32", title: "财务管理专家", level: "intermediate", levelName: "中级讲师", department: "财务部", skills: ["财务管理", "会计", "财务分析"], status: "enabled", courseCount: 6, rating: 4.7 },
                    { id: 4, name: "沈宇庭", avatar: "https://p26-doubao-search-sign.byteimg.com/tos-cn-i-6w9my0ksvp/76b4e1d0e75d42fd9dff3e3baff02596~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32", title: "企业管理专家", level: "senior", levelName: "高级讲师", department: "管理部", skills: ["企业管理", "战略规划", "团队建设"], status: "enabled", courseCount: 10, rating: 4.8 }
                ],
                course_categories: [
                    { id: 1, name: "策划", key: "planning", icon: "fa-sitemap", children: [{ id: 11, name: "游戏策划", key: "game-planning" }, { id: 12, name: "活动策划", key: "event-planning" }] },
                    { id: 2, name: "美术", key: "art", icon: "fa-paint-brush", children: [{ id: 21, name: "平面设计", key: "graphic" }, { id: 22, name: "UI设计", key: "ui" }, { id: 23, name: "3D建模", key: "3d" }] },
                    { id: 3, name: "技术", key: "tech", icon: "fa-code", children: [{ id: 31, name: "前端开发", key: "frontend" }, { id: 32, name: "后端开发", key: "backend" }, { id: 33, name: "移动开发", key: "mobile" }] },
                    { id: 4, name: "运营", key: "operation", icon: "fa-line-chart", children: [{ id: 41, name: "新媒体运营", key: "social" }, { id: 42, name: "数据分析", key: "data" }] },
                    { id: 5, name: "软技能", key: "softskill", icon: "fa-users", children: [{ id: 51, name: "职场沟通", key: "communication" }, { id: 52, name: "团队管理", key: "management" }] }
                ],
                index_banners: [
                    { id: 1, courseId: 1, img: "https://p26-doubao-search-sign.byteimg.com/labis/3e50046a89d633ced89e4d242d60f064~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32", order: 1, title: "欢迎来到游雁学院", description: "持续学习，成就更好的自己" },
                    { id: 2, courseId: 2, img: "https://p11-doubao-search-sign.byteimg.com/labis/56e578a8ce507c83f91f47e08e2ec86d~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32", order: 2, title: "提升技能，助力职业发展", description: "系统化培训，赋能团队成长" },
                    { id: 3, courseId: 3, img: "https://p3-doubao-search-sign.byteimg.com/labis/7cf2d040059ee347d85e5b21237a98b7~tplv-be4g95zd3a-image.jpeg?lk3s=feb11e32", order: 3, title: "专业讲师，优质课程", description: "行业专家倾情分享" }
                ],
                index_notices: [
                    { id: 1, title: "关于线上学习平台积分系统功能关闭下线的公告", content: "<p>尊敬的用户：为优化平台服务，积分系统将于近期关闭下线，请知悉。</p>", status: "published", createdAt: "2024-04-15", publishedAt: "2024-04-15" }
                ],
                index_featured_courses: [1, 2, 3],
                index_featured_lecturers: [1, 2]
            };
            memoryCache = { ...memoryCache, ...defaultData };
            this._saveToLocalStorage();
        },

        /**
         * 保存到本地存储
         */
        _saveToLocalStorage() {
            try {
                localStorage.setItem('learning_platform_data', JSON.stringify(memoryCache));
            } catch (e) {
                console.error('[DataAPI] 保存到本地存储失败:', e);
            }
        },

        /**
         * 从 localStorage 刷新内存缓存（供跨页面同步使用）
         * 当其他页面通过 DataSync 广播变更后，本页面调用此方法刷新本地缓存
         */
        refreshFromLocalStorage() {
            try {
                const stored = localStorage.getItem('learning_platform_data');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    // 合并到内存缓存，保留当前页面可能有的临时数据
                    Object.keys(parsed).forEach(key => {
                        memoryCache[key] = parsed[key];
                    });
                    console.log('[DataAPI] 内存缓存已从 localStorage 刷新');
                }
            } catch (e) {
                console.error('[DataAPI] 从 localStorage 刷新缓存失败:', e);
            }
        },

        /**
         * 从后端 API 获取数据
         */
        async fetchFromServer(endpoint) {
            try {
                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    return await response.json();
                }
            } catch (e) {
                console.error(`[DataAPI] 从服务器获取 ${endpoint} 失败:`, e);
            }
            return null;
        },

        /**
         * 同步数据到服务器
         */
        async syncToServer(key, value) {
            try {
                const response = await fetch(API.SYNC(key), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(value)
                });
                return response.ok;
            } catch (e) {
                console.error(`[DataAPI] 同步 ${key} 到服务器失败:`, e);
                return false;
            }
        },

        /**
         * 获取数据
         */
        get(key) {
            if (memoryCache[key] !== undefined) {
                return memoryCache[key];
            }
            return null;
        },

        /**
         * 设置数据
         */
        async set(key, value) {
            memoryCache[key] = value;
            this._saveToLocalStorage();
            
            // 尝试同步到服务器
            await this.syncToServer(key, value);
            
            // 触发跨页面同步
            if (window.DataSync) {
                window.DataSync.broadcast(key);
            }
            
            return true;
        },

        // ========== 课程相关 ==========

        /**
         * 获取课程列表
         */
        getCourses() {
            return this.get('management_courses') || [];
        },

        /**
         * 获取单个课程
         */
        getCourse(courseId) {
            const courses = this.getCourses();
            return courses.find(c => String(c.id) === String(courseId));
        },

        /**
         * 获取已发布的课程
         */
        getPublishedCourses() {
            return this.getCourses().filter(c => c.status === 'published');
        },

        // ========== 讲师相关 ==========

        /**
         * 获取所有讲师
         */
        getLecturers() {
            return this.get('lecturers') || [];
        },

        /**
         * 获取启用的讲师
         */
        getEnabledLecturers() {
            return this.getLecturers().filter(l => l.status === 'enabled');
        },

        /**
         * 获取单个讲师
         */
        getLecturer(lecturerId) {
            const lecturers = this.getLecturers();
            return lecturers.find(l => String(l.id) === String(lecturerId));
        },

        /**
         * 获取讲师名称
         */
        getLecturerName(lecturerId) {
            const lecturer = this.getLecturer(lecturerId);
            return lecturer ? lecturer.name : '未知讲师';
        },

        /**
         * 获取讲师头像
         */
        getLecturerAvatar(lecturerId) {
            const lecturer = this.getLecturer(lecturerId);
            return lecturer ? lecturer.avatar : '';
        },

        // ========== 分类相关 ==========

        /**
         * 获取分类
         */
        getCategories() {
            return this.get('course_categories') || [];
        },

        /**
         * 从服务器同步分类数据（保证与后台分类管理联动）
         */
        async syncCategoriesFromServer() {
            try {
                const data = await this.fetchFromServer(API.CATEGORIES);
                if (data && Array.isArray(data)) {
                    memoryCache.course_categories = data;
                    this._saveToLocalStorage();
                    console.log('[DataAPI] 分类数据已从服务器同步');
                    return true;
                }
            } catch (e) {
                console.error('[DataAPI] 同步分类数据失败:', e);
            }
            return false;
        },

        /**
         * 从服务器重新加载所有数据
         */
        async reloadFromServer() {
            try {
                const response = await fetch(API.GET_ALL, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    const data = await response.json();
                    memoryCache = { ...memoryCache, ...data };
                    isServerConnected = true;
                    this._saveToLocalStorage();
                    console.log('[DataAPI] 已从服务器重新加载数据');
                    return true;
                }
            } catch (e) {
                console.error('[DataAPI] 从服务器重新加载失败:', e);
            }
            return false;
        },

        /**
         * 获取分类名称
         */
        getCategoryName(categoryId) {
            const cats = this.getCategories();
            // 首先在一级分类中查找
            let cat = cats.find(c => String(c.id) === String(categoryId));
            if (cat) return cat.name;
            
            // 然后在二级分类中查找
            for (const parent of cats) {
                const child = parent.children?.find(c => String(c.id) === String(categoryId));
                if (child) return child.name;
            }
            return '未分类';
        },

        /**
         * 获取分类信息（包含父级）
         */
        getCategoryInfo(categoryId) {
            const cats = this.getCategories();
            // 首先在一级分类中查找
            let cat = cats.find(c => String(c.id) === String(categoryId));
            if (cat) return { parent: null, child: cat };
            
            // 然后在二级分类中查找
            for (const parent of cats) {
                const child = parent.children?.find(c => String(c.id) === String(categoryId));
                if (child) return { parent: parent, child: child };
            }
            return null;
        },

        // ========== 首页相关 ==========

        /**
         * 获取首页轮播图
         */
        getBanners() {
            return this.get('index_banners') || [];
        },

        /**
         * 获取首页公告
         */
        getNotices() {
            // 优先读取 'notices'，兼容 'index_notices'
            const notices = this.get('notices') || this.get('index_notices') || [];
            console.log('[DataAPI] getNotices 返回:', notices, '来源:', this.get('notices') ? 'notices' : (this.get('index_notices') ? 'index_notices' : 'default'));
            return notices;
        },

        /**
         * 同步公告数据（保证与管理后台联动）
         */
        async syncNoticesFromServer() {
            try {
                const data = await this.fetchFromServer(API.NOTICES);
                if (data && Array.isArray(data)) {
                    memoryCache.notices = data;
                    this._saveToLocalStorage();
                    console.log('[DataAPI] 公告数据已从服务器同步');
                    return true;
                }
            } catch (e) {
                console.error('[DataAPI] 同步公告数据失败:', e);
            }
            return false;
        },

        /**
         * 获取首页精选课程ID列表
         */
        getFeaturedCourseIds() {
            return this.get('index_featured_courses') || [];
        },

        /**
         * 获取首页明星讲师ID列表
         */
        getFeaturedLecturerIds() {
            return this.get('index_featured_lecturers') || [];
        },

        // ========== 工具方法 ==========

        /**
         * 格式化时长
         */
        formatDuration(seconds) {
            if (!seconds) return '0分钟';
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (hours > 0) {
                return `${hours}小时${minutes}分钟`;
            }
            return `${minutes}分钟`;
        },

        /**
         * 格式化日期
         */
        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        },

        /**
         * 计算注册天数
         */
        getRegisterDays(createdAt) {
            if (!createdAt) return 0;
            const registerDate = new Date(createdAt);
            const today = new Date();
            const diffTime = Math.abs(today - registerDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        },

        // ========== 认证相关 ==========

        /**
         * 用户登录
         */
        async login(username, password) {
            try {
                const response = await fetch(API.LOGIN, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const result = await response.json();
                
                if (result.success) {
                    localStorage.setItem('token', result.data.token);
                    localStorage.setItem('user', JSON.stringify(result.data.user));
                    return result.data;
                }
                return null;
            } catch (e) {
                console.error('[DataAPI] 登录失败:', e);
                return null;
            }
        },

        /**
         * 用户注册
         */
        async register(userData) {
            try {
                const response = await fetch(API.REGISTER, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData)
                });
                const result = await response.json();
                
                if (result.success) {
                    localStorage.setItem('token', result.data.token);
                    localStorage.setItem('user', JSON.stringify(result.data.user));
                    return result.data;
                }
                return null;
            } catch (e) {
                console.error('[DataAPI] 注册失败:', e);
                return null;
            }
        },

        /**
         * 获取当前登录用户
         */
        getCurrentUser() {
            const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
            return userStr ? JSON.parse(userStr) : null;
        },

        /**
         * 获取认证 Token
         */
        getToken() {
            return localStorage.getItem('token') || sessionStorage.getItem('token');
        },

        /**
         * 检查是否已登录
         */
        isLoggedIn() {
            return !!this.getToken();
        },

        /**
         * 检查是否是管理员
         */
        isAdmin() {
            const user = this.getCurrentUser();
            return user && user.role === 'admin';
        },

        /**
         * 退出登录
         */
        logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
        },

        // ========== 学习进度相关 ==========

        /**
         * 获取用户学习数据
         */
        getUserLearningData(userId) {
            const key = `user_learning_${userId}`;
            let data = this.get(key);
            if (!data) {
                data = {
                    totalHours: 0,
                    completedCourses: [],
                    videoProgress: {},
                    lastStudyTime: null,
                    studyDates: [],
                    ratings: 0,
                    shares: 0,
                    likes: 0
                };
                this.set(key, data);
            }
            // 兼容旧数据：如果没有新字段，初始化为0
            if (data.ratings === undefined) data.ratings = 0;
            if (data.shares === undefined) data.shares = 0;
            if (data.likes === undefined) data.likes = 0;
            return data;
        },

        /**
         * 更新视频进度
         */
        updateVideoProgress(userId, courseId, videoIndex, progress) {
            const data = this.getUserLearningData(userId);
            const key = `${courseId}_${videoIndex}`;
            data.videoProgress[key] = progress;
            
            const course = this.getCourse(courseId);
            if (course && course.videos) {
                const allWatched = course.videos.every((v, i) => {
                    const vKey = `${courseId}_${i}`;
                    return (data.videoProgress[vKey] || 0) >= 100;
                });
                
                if (allWatched && !data.completedCourses.includes(courseId)) {
                    data.completedCourses.push(courseId);
                }
            }
            
            const userKey = `user_learning_${userId}`;
            this.set(userKey, data);
            
            return {
                isCourseCompleted: data.completedCourses.includes(courseId)
            };
        },

        /**
         * 获取课程完成状态
         */
        isCourseCompleted(userId, courseId) {
            const data = this.getUserLearningData(userId);
            return data.completedCourses.includes(courseId);
        },

        // ========== 数据重置 ==========

        /**
         * 重置为默认数据
         */
        async resetToDefault() {
            try {
                const response = await fetch(`${API_SERVER}/reset`, { method: 'POST' });
                if (response.ok) {
                    this._loadDefaultData();
                    return true;
                }
            } catch (e) {
                console.error('[DataAPI] 重置失败:', e);
                this._loadDefaultData();
            }
            return false;
        },

        /**
         * 从服务器重新加载所有数据
         */
        async reload() {
            return await this.init();
        }

        // 暴露到全局
    };
    window.DataAPI = DataAPI;
    
    console.log('[DataAPI] 数据访问层已加载');
})();
