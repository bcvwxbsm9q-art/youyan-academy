/**
 * AuthGuard - 页面访问控制模块
 * 核心逻辑：打开任何前端页面 → 未登录则强制弹登录框 → 登录后右上角显示真实姓名
 * 
 * 使用方式：
 * - 在需要登录的页面引入此脚本（和 auth-modal.js）
 * - 自动检查登录状态，未登录显示登录弹窗（不可关闭）
 * - 已登录用户右上角显示真实姓名和退出按钮
 */

(function() {
    'use strict';

    const API_BASE = window.location.origin + '/api';

    // 需要认证的页面
    const AUTH_REQUIRED_PAGES = [
        'index.html',
        'training-plan.html',
        'course.html',
        'teacher.html',
        'center.html',
        'player.html',
        'messages.html',
        'survey.html',
        'dashboard.html'
    ];

    // 公开页面（不需要登录）
    const PUBLIC_PAGES = [];

    /**
     * 获取存储的 token
     */
    function getToken() {
        return localStorage.getItem('token') || sessionStorage.getItem('token');
    }

    /**
     * 获取本地编辑的用户资料（独立于服务端数据）
     * 按用户ID隔离，防止切换用户时数据串扰
     */
    function getLocalProfile(userId) {
        const key = userId ? `user_profile_${userId}` : 'user_profile';
        const profileStr = localStorage.getItem(key);
        if (profileStr) {
            try {
                return JSON.parse(profileStr);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * 保存本地编辑的用户资料（按用户ID隔离）
     */
    function saveLocalProfile(userId, profile) {
        const key = userId ? `user_profile_${userId}` : 'user_profile';
        try {
            localStorage.setItem(key, JSON.stringify(profile));
            return true;
        } catch (e) {
            console.error('[saveLocalProfile] 保存失败:', e);
            return false;
        }
    }

    /**
     * 清除当前用户的本地资料
     */
    function clearLocalProfile(userId) {
        const keys = [];
        if (userId) {
            keys.push(`user_profile_${userId}`);
        }
        keys.push('user_profile');
        keys.forEach(key => localStorage.removeItem(key));
    }

    /**
     * 获取存储的用户信息
     */
    function getStoredUser() {
        const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * 清除所有认证信息
     */
    function clearAuth() {
        // 先记住当前用户ID用于清除 localProfile
        const user = getStoredUser();
        const userId = user ? (user.id || user.userId) : null;

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');

        // 清除本地资料
        if (userId) clearLocalProfile(userId);
        clearLocalProfile(null); // 兼容旧版本
    }

    /**
     * 获取当前页面文件名
     */
    function getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        return filename;
    }

    /**
     * 检查当前页面是否需要登录
     */
    function requiresAuth() {
        const page = getCurrentPage();
        if (PUBLIC_PAGES.includes(page)) return false;
        return true;
    }

    /**
     * 显示加载遮罩
     */
    function showLoadingOverlay() {
        const existing = document.getElementById('auth-loading-overlay');
        if (existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'auth-loading-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            z-index: 99998; color: white;
        `;
        overlay.innerHTML = `
            <div style="font-size: 64px; margin-bottom: 24px;"><i class="fa fa-graduation-cap"></i></div>
            <div style="font-size: 28px; font-bold; margin-bottom: 12px;">游雁学院</div>
            <div style="font-size: 14px; opacity: 0.8;">正在验证登录状态...</div>
            <div style="margin-top: 24px;"><i class="fa fa-spinner fa-spin fa-2x"></i></div>
        `;
        document.body.appendChild(overlay);
    }

    /**
     * 隐藏加载遮罩
     */
    function hideLoadingOverlay() {
        const overlay = document.getElementById('auth-loading-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';
            setTimeout(() => overlay.remove(), 300);
        }
    }

    /**
     * 异步验证 token 是否有效
     * 成功：更新 localStorage 中的 user 数据并返回 true
     * 失败：返回 false
     */
    async function validateToken() {
        const token = getToken();
        if (!token) return false;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(`${API_BASE}/auth/me`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data && data.data.user) {
                    const serverUser = data.data.user;

                    // 确保服务端返回的 real_name / realName 都有值
                    if (!serverUser.real_name && serverUser.realName) serverUser.real_name = serverUser.realName;
                    if (!serverUser.realName && serverUser.real_name) serverUser.realName = serverUser.real_name;
                    if (!serverUser.real_name && !serverUser.realName) {
                        serverUser.real_name = serverUser.realName = serverUser.username || '用户';
                    }

                    // 合并本地编辑的前端字段（部门、职位、手机）
                    // 注意：头像、姓名以服务端为准，不从 localProfile 合并
                    const localProfile = getLocalProfile(serverUser.id);
                    if (localProfile) {
                        if (localProfile.department) serverUser.department = localProfile.department;
                        if (localProfile.position) serverUser.position = localProfile.position;
                        if (localProfile.phone) serverUser.phone = localProfile.phone;
                    }

                    // 保存到当前 token 所在的存储（localStorage 或 sessionStorage）
                    if (localStorage.getItem('token')) {
                        localStorage.setItem('user', JSON.stringify(serverUser));
                    }
                    if (sessionStorage.getItem('token')) {
                        sessionStorage.setItem('user', JSON.stringify(serverUser));
                    }

                    // 通知各页面刷新
                    window.dispatchEvent(new CustomEvent('userProfileUpdated', {
                        detail: { user: serverUser }
                    }));

                    return true;
                }
            }
            return false;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('[AuthGuard] 验证超时(8s)，使用本地缓存');
            } else {
                console.error('[AuthGuard] Token验证失败:', error);
            }
            // 网络异常时降级：如果本地有 user 数据，暂时信任
            const user = getStoredUser();
            return user !== null;
        }
    }

    /**
     * 更新页面上用户信息显示
     * 已登录 → 显示真实姓名 + 退出按钮
     * 未登录 → 隐藏用户信息区域
     */
    function updateUserInfo() {
        const user = getStoredUser();
        const token = getToken();
        const isLoggedIn = !!token && !!user;

        const userInfoEl = document.getElementById('user-info');
        const mobileUserInfoEl = document.getElementById('mobile-user-info');

        if (isLoggedIn && user) {
            // 计算显示名：real_name > realName > username（跳过空字符串）
            const displayName =
                (user.real_name && user.real_name.trim() ? user.real_name.trim() : null) ||
                (user.realName && user.realName.trim() ? user.realName.trim() : null) ||
                (user.username && user.username.trim() ? user.username.trim() : null) ||
                '用户';

            if (displayName === '用户') {
                console.warn('[AuthGuard] 显示名为默认值，user:', JSON.stringify({real_name: user.real_name, realName: user.realName, username: user.username}));
            }

            // 桌面端
            if (userInfoEl) {
                userInfoEl.classList.remove('hidden');
                userInfoEl.classList.add('flex');
                const nameEl = document.getElementById('user-display-name');
                if (nameEl) nameEl.textContent = displayName;
                const logoutBtn = userInfoEl.querySelector('button[onclick*="logout"]');
                if (logoutBtn) logoutBtn.innerHTML = '<i class="fa fa-sign-out mr-1"></i>退出';
            }

            // 移动端
            if (mobileUserInfoEl) {
                mobileUserInfoEl.classList.remove('hidden');
                mobileUserInfoEl.classList.add('flex');
                const mobileNameEl = document.getElementById('mobile-user-name');
                if (mobileNameEl) mobileNameEl.textContent = displayName;
            }

            // 管理员链接：根据当前页面动态设置文本和链接
            if (user.role === 'admin') {
                const currentPage = getCurrentPage();
                const isDashboard = currentPage === 'dashboard.html';
                
                // 桌面端管理链接
                const desktopAdminLink = document.getElementById('desktop-admin-link');
                if (desktopAdminLink) {
                    desktopAdminLink.classList.remove('hidden');
                    if (isDashboard) {
                        desktopAdminLink.href = 'index.html';
                        desktopAdminLink.textContent = '学员端';
                    } else {
                        desktopAdminLink.href = 'dashboard.html';
                        desktopAdminLink.textContent = '管理端';
                    }
                }
                
                // 移动端管理链接
                const mobileAdminLink = document.getElementById('mobile-admin-link');
                if (mobileAdminLink) {
                    mobileAdminLink.classList.remove('hidden');
                    if (isDashboard) {
                        mobileAdminLink.href = 'index.html';
                        mobileAdminLink.innerHTML = '<i class="fa fa-user w-6"></i><span>学员端</span>';
                    } else {
                        mobileAdminLink.href = 'dashboard.html';
                        mobileAdminLink.innerHTML = '<i class="fa fa-cog w-6"></i><span>管理端</span>';
                    }
                }
            }
        } else {
            // 未登录：隐藏用户信息区域
            if (userInfoEl) {
                userInfoEl.classList.add('hidden');
                userInfoEl.classList.remove('flex');
            }
            if (mobileUserInfoEl) {
                mobileUserInfoEl.classList.add('hidden');
                mobileUserInfoEl.classList.remove('flex');
            }
        }
    }

    /**
     * 显示登录弹窗（强制，不可通过关闭按钮绕过）
     */
    function showLoginModal() {
        hideLoadingOverlay();
        AuthModal.show({
            tab: 'login',
            onSuccess: function(data) {
                // 登录成功 → 更新 UI → 刷新页面
                updateUserInfo();
                hideLoadingOverlay();
                window.location.reload();
            }
        });
        // 隐藏弹窗关闭按钮（强制登录，不可关闭）
        setTimeout(() => {
            const modal = document.getElementById('auth-modal');
            if (modal) {
                // 不阻止 ESC 关闭，但关闭后立即重新弹出
                // 通过监听 AuthModal.close 来实现
            }
        }, 100);
    }

    /**
     * 初始化认证检查（页面加载时自动执行）
     */
    async function init() {
        // 初始化弹窗组件
        AuthModal.init({
            onSuccess: function(data) {
                updateUserInfo();
                hideLoadingOverlay();
                window.location.reload();
            }
        });

        // 设置 storage 监听（跨页面同步）
        setupStorageListener();

        // 非认证页面：只更新 UI，不拦截
        if (!requiresAuth()) {
            updateUserInfo();
            return;
        }

        const token = getToken();

        // 没有 token → 立即弹登录框
        if (!token) {
            // dashboard页面未登录时，重定向到首页（首页会弹登录框）
            if (getCurrentPage() === 'dashboard.html') {
                window.location.href = 'index.html';
                return;
            }
            showLoginModal();
            return;
        }

        // 有 token → 显示加载遮罩，去服务端验证
        showLoadingOverlay();
        const isValid = await validateToken();

        if (!isValid) {
            // Token 无效 → 清除 → 弹登录框
            clearAuth();
            if (getCurrentPage() === 'dashboard.html') {
                window.location.href = 'index.html';
                return;
            }
            showLoginModal();
            return;
        }

        // Token 有效 → 检查 dashboard 访问权限
        if (getCurrentPage() === 'dashboard.html') {
            const user = getStoredUser();
            if (!user || user.role !== 'admin') {
                // 非管理员访问 dashboard → 重定向到首页
                hideLoadingOverlay();
                window.location.href = 'index.html';
                return;
            }
        }

        // Token 有效 → 隐藏遮罩 → 更新 UI
        hideLoadingOverlay();
        updateUserInfo();
    }

    /**
     * 退出登录
     */
    function logout() {
        if (confirm('确定要退出登录吗？')) {
            clearAuth();
            window.dispatchEvent(new CustomEvent('userLogout'));
            // dashboard 页面退出后重定向到首页（首页会弹登录框）
            if (getCurrentPage() === 'dashboard.html') {
                window.location.href = 'index.html';
                return;
            }
            updateUserInfo();
            // 学员页面退出后弹登录框
            showLoginModal();
        }
    }

    /**
     * 获取当前登录用户
     */
    function getCurrentUser() {
        return getStoredUser();
    }

    /**
     * 获取Token
     */
    function getCurrentToken() {
        return getToken();
    }

    /**
     * 重定向到登录（兼容旧代码）
     */
    function redirectToLogin() {
        showLoginModal();
    }

    /**
     * 检查登录状态但不阻止访问
     */
    function checkLoginStatus() {
        updateUserInfo();
        if (!getToken() && requiresAuth()) {
            showLoginModal();
        }
    }

    /**
     * 异步 requireAuth（供其他脚本调用）
     */
    async function requireAuth() {
        const token = getToken();
        if (!token) {
            showLoginModal();
            return false;
        }
        showLoadingOverlay();
        const isValid = await validateToken();
        if (!isValid) {
            clearAuth();
            showLoginModal();
            return false;
        }
        hideLoadingOverlay();
        return true;
    }

    /**
     * 监听跨页面登录状态变化
     */
    function setupStorageListener() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'token' || e.key === 'user') {
                updateUserInfo();
                window.dispatchEvent(new CustomEvent('authChange', {
                    detail: { isLoggedIn: !!localStorage.getItem('token') || !!sessionStorage.getItem('token') }
                }));
            }
        });
        window.addEventListener('userLoginSuccess', () => updateUserInfo());
        window.addEventListener('userLogout', () => updateUserInfo());
    }

    // 导出到全局
    window.AuthGuard = {
        requireAuth,
        initUI: updateUserInfo,
        init,
        checkLoginStatus,
        updateUserInfo,
        logout,
        getCurrentUser,
        getCurrentToken,
        getToken,
        redirectToLogin,
        getLocalProfile,
        saveLocalProfile,
        clearLocalProfile
    };

    // 页面加载时自动执行认证检查
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
    } else {
        setTimeout(init, 50);
    }

    window.addEventListener('beforeunload', () => hideLoadingOverlay());
})();
