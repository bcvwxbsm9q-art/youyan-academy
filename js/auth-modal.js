/**
 * AuthModal - 统一登录/注册弹窗模块
 * 在所有页面使用统一的认证弹窗，提供登录和注册功能
 */

(function() {
    'use strict';

    const API_BASE = window.location.origin + '/api';

    // 弹窗HTML模板
    const modalTemplate = `
    <!-- 统一认证弹窗 -->
    <div id="auth-modal" class="fixed inset-0 bg-black/60 z-[9999] hidden flex items-center justify-center p-4" style="backdrop-filter: blur(4px);">
        <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl transform transition-all" style="max-height: 90vh; overflow-y: auto;">
            <!-- 头部 -->
            <div class="relative bg-gradient-to-r from-primary to-secondary p-6 text-center text-white">
                <div class="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
                    <i class="fa fa-graduation-cap text-3xl"></i>
                </div>
                <h2 class="text-xl font-bold" id="auth-modal-title">欢迎来到游雁学院</h2>
                <p class="text-white/80 text-sm mt-1" id="auth-modal-subtitle">请先登录或注册账户</p>
    
            </div>
            
            <!-- 标签页切换 -->
            <div class="flex border-b border-gray-200">
                <button onclick="AuthModal.switchTab('login')" id="tab-login" class="flex-1 py-3 text-center font-medium text-primary border-b-2 border-primary transition-colors">
                    登录
                </button>
                <button onclick="AuthModal.switchTab('register')" id="tab-register" class="flex-1 py-3 text-center font-medium text-gray-500 hover:text-primary transition-colors">
                    注册
                </button>
            </div>
            
            <!-- 登录表单 -->
            <div id="auth-login-form" class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        <i class="fa fa-phone mr-1 text-primary"></i>手机号
                    </label>
                    <input
                        type="text"
                        id="auth-username"
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        placeholder="请输入手机号"
                        autocomplete="tel"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        <i class="fa fa-lock mr-1 text-primary"></i>密码
                    </label>
                    <div class="relative">
                        <input 
                            type="password" 
                            id="auth-password" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all pr-12"
                            placeholder="请输入密码"
                            autocomplete="current-password"
                        >
                        <button type="button" onclick="AuthModal.togglePassword('auth-password')" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <i class="fa fa-eye" id="auth-password-toggle-icon"></i>
                        </button>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <label class="flex items-center">
                        <input type="checkbox" id="auth-remember" class="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary">
                        <span class="ml-2 text-sm text-gray-600">记住我</span>
                    </label>
                    <a href="#" class="text-sm text-primary hover:underline">忘记密码？</a>
                </div>
                <button onclick="AuthModal.handleLogin()" id="auth-login-btn" class="w-full py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-lg font-medium hover:opacity-90 transition-all flex items-center justify-center">
                    <i class="fa fa-sign-in mr-2"></i>登录
                </button>
                <div class="text-center text-sm text-gray-500 mt-2">
                    还没有账户？<a href="#" onclick="AuthModal.switchTab('register'); return false;" class="text-primary font-medium hover:underline">立即注册</a>
                </div>
            </div>
            
            <!-- 注册表单 -->
            <div id="auth-register-form" class="p-6 space-y-4 hidden">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        <i class="fa fa-phone mr-1 text-primary"></i>手机号 <span class="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        id="auth-reg-username"
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        placeholder="请输入手机号"
                        autocomplete="tel"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        <i class="fa fa-id-card mr-1 text-primary"></i>真实姓名
                    </label>
                    <input 
                        type="text" 
                        id="auth-reg-realname" 
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        placeholder="请输入真实姓名（支持中文）"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        <i class="fa fa-building mr-1 text-primary"></i>部门
                    </label>
                    <input 
                        type="text" 
                        id="auth-reg-department" 
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        placeholder="所在部门或班级"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        <i class="fa fa-lock mr-1 text-primary"></i>密码 <span class="text-red-500">*</span>
                    </label>
                    <div class="relative">
                        <input 
                            type="password" 
                            id="auth-reg-password" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all pr-12"
                            placeholder="至少6位字符"
                        >
                        <button type="button" onclick="AuthModal.togglePassword('auth-reg-password')" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <i class="fa fa-eye" id="auth-reg-password-toggle-icon"></i>
                        </button>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        <i class="fa fa-lock mr-1 text-primary"></i>确认密码 <span class="text-red-500">*</span>
                    </label>
                    <input 
                        type="password" 
                        id="auth-reg-confirm" 
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        placeholder="再次输入密码"
                    >
                </div>
                <div>
                    <label class="flex items-start">
                        <input type="checkbox" id="auth-agree-terms" class="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary mt-0.5">
                        <span class="ml-2 text-sm text-gray-600">
                            我已阅读并同意 <a href="#" class="text-primary hover:underline">《用户协议》</a> 和 <a href="#" class="text-primary hover:underline">《隐私政策》</a>
                        </span>
                    </label>
                </div>
                <button onclick="AuthModal.handleRegister()" id="auth-register-btn" class="w-full py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-lg font-medium hover:opacity-90 transition-all flex items-center justify-center">
                    <i class="fa fa-user-plus mr-2"></i>立即注册
                </button>
                <div class="text-center text-sm text-gray-500 mt-2">
                    已有账户？<a href="#" onclick="AuthModal.switchTab('login'); return false;" class="text-primary font-medium hover:underline">立即登录</a>
                </div>
            </div>
            
            <!-- 底部提示 -->
            <div class="p-4 bg-gray-50 rounded-b-2xl text-center">
                <p class="text-xs text-gray-400">
                    登录即表示您同意我们的服务条款
                </p>
            </div>
        </div>
    </div>
    
    <!-- Toast 提示 -->
    <div id="auth-toast" class="fixed top-4 right-4 px-6 py-3 rounded-lg text-white font-medium z-[10000] shadow-lg transform translate-x-full opacity-0 transition-all duration-300"></div>
    `;

    // 状态
    let currentTab = 'login';
    let isSubmitting = false;
    let onSuccessCallback = null;

    // 初始化
    function init(options = {}) {
        // 注入弹窗HTML
        if (!document.getElementById('auth-modal')) {
            document.body.insertAdjacentHTML('beforeend', modalTemplate);
        }
        
        // 设置成功回调
        if (options.onSuccess) {
            onSuccessCallback = options.onSuccess;
        }
        
        // 绑定键盘事件
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isVisible()) {
                close();
            }
        });
    }

    // 显示弹窗
    function show(options = {}) {
        init(options);
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.opacity = '1';
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            // 清空表单
            clearForms();
            
            // 设置默认标签页
            if (options.tab) {
                switchTab(options.tab);
            }
            
            // 自动聚焦用户名输入框
            setTimeout(() => {
                const usernameInput = document.getElementById('auth-username');
                if (usernameInput) usernameInput.focus();
            }, 100);
        }
    }

    // 关闭弹窗
    function close() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }, 200);
        }
    }

    // 是否可见
    function isVisible() {
        const modal = document.getElementById('auth-modal');
        return modal && !modal.classList.contains('hidden');
    }

    // 切换标签页
    function switchTab(tab) {
        currentTab = tab;
        const loginForm = document.getElementById('auth-login-form');
        const registerForm = document.getElementById('auth-register-form');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        
        if (tab === 'login') {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            tabLogin.classList.add('text-primary', 'border-primary');
            tabLogin.classList.remove('text-gray-500');
            tabRegister.classList.remove('text-primary', 'border-primary');
            tabRegister.classList.add('text-gray-500');
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            tabRegister.classList.add('text-primary', 'border-primary');
            tabRegister.classList.remove('text-gray-500');
            tabLogin.classList.remove('text-primary', 'border-primary');
            tabLogin.classList.add('text-gray-500');
        }
    }

    // 清空表单
    function clearForms() {
        // 登录表单
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-remember').checked = false;
        
        // 注册表单
        document.getElementById('auth-reg-username').value = '';
        document.getElementById('auth-reg-realname').value = '';
        document.getElementById('auth-reg-department').value = '';
        document.getElementById('auth-reg-password').value = '';
        document.getElementById('auth-reg-confirm').value = '';
        document.getElementById('auth-agree-terms').checked = false;
    }

    // 切换密码可见性
    function togglePassword(inputId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(inputId + '-toggle-icon');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    // 检查密码强度（已移除UI，保留函数避免引用报错）
    function checkPasswordStrength() {}

    // 显示Toast
    function showToast(message, type = 'success') {
        const toast = document.getElementById('auth-toast');
        if (toast) {
            toast.textContent = message;
            toast.className = 'fixed top-4 right-4 px-6 py-3 rounded-lg text-white font-medium z-[10000] shadow-lg transition-all duration-300';
            toast.classList.add(type === 'success' ? 'bg-green-500' : 'bg-red-500');
            toast.classList.remove('translate-x-full', 'opacity-0');
            
            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
            }, 3000);
        }
    }

    // 处理登录
    async function handleLogin() {
        if (isSubmitting) return;
        
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        const remember = document.getElementById('auth-remember').checked;
        
        if (!username || !password) {
            showToast('请输入手机号和密码', 'error');
            return;
        }
        
        const loginBtn = document.getElementById('auth-login-btn');
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>登录中...';
        isSubmitting = true;
        
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // 清除上一用户的残留数据
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
                try {
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key === 'user_profile' || key.startsWith('user_profile_')) {
                            keysToRemove.push(key);
                        }
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                } catch(e) {
                    localStorage.removeItem('user_profile');
                }

                // 保存Token和用户数据到同一个存储（记住我→localStorage，否则→sessionStorage）
                if (remember) {
                    localStorage.setItem('token', result.data.token);
                    localStorage.setItem('user', JSON.stringify(result.data.user));
                } else {
                    sessionStorage.setItem('token', result.data.token);
                    sessionStorage.setItem('user', JSON.stringify(result.data.user));
                }
                
                showToast('登录成功！', 'success');
                
                // 关闭弹窗
                setTimeout(() => {
                    close();
                    
                    // 触发成功回调
                    if (onSuccessCallback) {
                        onSuccessCallback(result.data);
                    }
                    
                    // 触发登录成功事件
                    window.dispatchEvent(new CustomEvent('userLoginSuccess', {
                        detail: { user: result.data.user }
                    }));
                }, 500);
            } else {
                showToast(result.error || '登录失败', 'error');
            }
        } catch (error) {
            console.error('登录错误:', error);
            showToast('网络错误，请稍后重试', 'error');
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fa fa-sign-in mr-2"></i>登录';
            isSubmitting = false;
        }
    }

    // 处理注册
    async function handleRegister() {
        if (isSubmitting) return;
        
        const username = document.getElementById('auth-reg-username').value.trim();
        const realName = document.getElementById('auth-reg-realname').value.trim();
        const department = document.getElementById('auth-reg-department').value.trim();
        const password = document.getElementById('auth-reg-password').value;
        const confirm = document.getElementById('auth-reg-confirm').value;
        const agreeTerms = document.getElementById('auth-agree-terms').checked;
        
        // 验证
        if (!username || !password) {
            showToast('请填写必填项', 'error');
            return;
        }
        
        if (password !== confirm) {
            showToast('两次输入的密码不一致', 'error');
            return;
        }
        
        if (!agreeTerms) {
            showToast('请同意用户协议', 'error');
            return;
        }
        
        const registerBtn = document.getElementById('auth-register-btn');
        registerBtn.disabled = true;
        registerBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>注册中...';
        isSubmitting = true;
        
        try {
            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    realName,
                    department,
                    password,
                    // 手机号注册
                    phone: username
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                showToast('注册成功！正在为您登录...', 'success');
                
                // 自动登录：保存 token 和 user 到 localStorage
                setTimeout(() => {
                    if (result.data && result.data.token) {
                        // 先清除旧数据
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        sessionStorage.removeItem('token');
                        sessionStorage.removeItem('user');
                        
                        // 注册后默认保存到 localStorage
                        localStorage.setItem('token', result.data.token);
                        localStorage.setItem('user', JSON.stringify(result.data.user));
                        
                        close();
                        
                        if (onSuccessCallback) {
                            onSuccessCallback(result.data);
                        }
                        
                        window.dispatchEvent(new CustomEvent('userLoginSuccess', {
                            detail: { user: result.data.user }
                        }));
                    } else {
                        // 切换到登录表单
                        switchTab('login');
                        document.getElementById('auth-username').value = username;
                        showToast('请使用刚注册的账户登录', 'success');
                    }
                }, 1000);
            } else {
                showToast(result.error || '注册失败', 'error');
            }
        } catch (error) {
            console.error('注册错误:', error);
            showToast('网络错误，请稍后重试', 'error');
        } finally {
            registerBtn.disabled = false;
            registerBtn.innerHTML = '<i class="fa fa-user-plus mr-2"></i>立即注册';
            isSubmitting = false;
        }
    }

    // 导出API
    window.AuthModal = {
        init,
        show,
        close,
        isVisible,
        switchTab,
        togglePassword,
        showToast,
        handleLogin,
        handleRegister
    };
})();
