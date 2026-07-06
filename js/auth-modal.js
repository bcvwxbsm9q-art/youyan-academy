/**
 * AuthModal - 统一登录弹窗模块
 * 支持：账号密码登录、短信验证码登录、钉钉/飞书/微信/企微扫码登录
 * 账号由管理员统一发放，前端不再提供自主注册入口
 */

(function() {
    'use strict';

    const API_BASE = window.location.origin + '/api';

    // 扫码登录提供商配置
    const QR_PROVIDERS = [
        { key: 'dingtalk', name: '钉钉登录', color: '#3370FF', icon: dingtalkIcon() },
        { key: 'feishu',   name: '飞书登录', color: '#3370FF', icon: feishuIcon() },
        { key: 'wechat',   name: '微信登录', color: '#07C160', icon: wechatIcon() },
        { key: 'wecom',    name: '企微登录', color: '#2B7EE1', icon: wecomIcon() }
    ];

    function dingtalkIcon() {
        return `<svg viewBox="0 0 24 24" class="w-7 h-7" fill="currentColor"><path d="M16.76 2.5c-.3 0-.55.06-.75.18-.2.12-.36.28-.48.48-.12.2-.18.45-.18.75v.02c0 .16.02.3.06.42l.06.18-2.58 1.02c-.24.1-.46.24-.64.42-.18.18-.32.4-.42.64l-1.02 2.58-.18-.06a1.5 1.5 0 0 0-.42-.06c-.3 0-.55.06-.75.18-.2.12-.36.28-.48.48-.12.2-.18.45-.18.75s.06.55.18.75c.12.2.28.36.48.48.2.12.45.18.75.18.3 0 .55-.06.75-.18.2-.12.36-.28.48-.48.12-.2.18-.45.18-.75v-.02a1.5 1.5 0 0 0-.06-.42l-.06-.18 2.58-1.02c.24-.1.46-.24.64-.42.18-.18.32-.4.42-.64l1.02-2.58.18.06c.12.04.26.06.42.06.3 0 .55-.06.75-.18.2-.12.36-.28.48-.48.12-.2.18-.45.18-.75s-.06-.55-.18-.75c-.12-.2-.28-.36-.48-.48-.2-.12-.45-.18-.75-.18zM12 8.5c-.3 0-.55.06-.75.18-.2.12-.36.28-.48.48-.12.2-.18.45-.18.75s.06.55.18.75c.12.2.28.36.48.48.2.12.45.18.75.18s.55-.06.75-.18c.2-.12.36-.28.48-.48.12-.2.18-.45.18-.75s-.06-.55-.18-.75c-.12-.2-.28-.36-.48-.48-.2-.12-.45-.18-.75-.18zm-4.24 3.5c-.3 0-.55.06-.75.18-.2.12-.36.28-.48.48-.12.2-.18.45-.18.75s.06.55.18.75c.12.2.28.36.48.48.2.12.45.18.75.18.3 0 .55-.06.75-.18.2-.12.36-.28.48-.48.12-.2.18-.45.18-.75s-.06-.55-.18-.75c-.12-.2-.28-.36-.48-.48-.2-.12-.45-.18-.75-.18zM12 15c-.3 0-.55.06-.75.18-.2.12-.36.28-.48.48-.12.2-.18.45-.18.75s.06.55.18.75c.12.2.28.36.48.48.2.12.45.18.75.18s.55-.06.75-.18c.2-.12.36-.28.48-.48.12-.2.18-.45.18-.75s-.06-.55-.18-.75c-.12-.2-.28-.36-.48-.48-.2-.12-.45-.18-.75-.18z"/></svg>`;
    }
    function feishuIcon() {
        return `<svg viewBox="0 0 24 24" class="w-7 h-7" fill="currentColor"><path d="M12 2L4 6v12l8 4 8-4V6l-8-4zm0 2.5l6 3-6 3-6-3 6-3zM6 8.5l6 3v7.5l-6-3v-7.5zm12 0v7.5l-6 3V11.5l6-3z"/></svg>`;
    }
    function wechatIcon() {
        return `<svg viewBox="0 0 24 24" class="w-7 h-7" fill="currentColor"><path d="M9.5 4C5.36 4 2 6.97 2 10.6c0 1.86 1.02 3.52 2.64 4.68l-.66 1.98 2.52-1.26c.78.24 1.62.38 2.5.38.17 0 .33-.01.5-.02-.1-.48-.16-.98-.16-1.49 0-3.47 3.36-6.28 7.5-6.28.3 0 .59.02.88.05C17.28 6.13 13.77 4 9.5 4zm-2.6 3.9c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm5.2 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm4.4 4.1c-3.59 0-6.5 2.46-6.5 5.5 0 3.04 2.91 5.5 6.5 5.5.74 0 1.45-.1 2.12-.27l2.13 1.07-.56-1.67c1.36-1.02 2.31-2.48 2.31-4.13 0-3.04-2.91-5.5-6.5-5.5zm-2.7 2.5c.41 0 .75.34.75.75s-.34.75-.75.75-.75-.34-.75-.75.34-.75.75-.75zm5.4 0c.41 0 .75.34.75.75s-.34.75-.75.75-.75-.34-.75-.75.34-.75.75-.75z"/></svg>`;
    }
    function wecomIcon() {
        return `<svg viewBox="0 0 24 24" class="w-7 h-7" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5zm5.5-1c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
    }

    // 弹窗HTML模板
    const modalTemplate = `
    <!-- 统一认证弹窗 -->
    <div id="auth-modal" class="fixed inset-0 bg-black/60 z-[9999] hidden flex items-center justify-center p-4" style="backdrop-filter: blur(4px);">
        <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl transform transition-all relative" style="max-height: 90vh; overflow-y: auto;">
            <!-- 头部 -->
            <div class="relative bg-gradient-to-r from-primary to-secondary p-6 text-center text-white rounded-t-2xl">
                <!-- 右上角模式切换 -->
                <button type="button" onclick="AuthModal.toggleMode()" id="auth-mode-toggle" class="absolute top-3 right-3 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors" title="切换扫码登录">
                    <i class="fa fa-qrcode text-xl"></i>
                </button>

                <div class="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
                    <i class="fa fa-graduation-cap text-3xl"></i>
                </div>
                <h2 class="text-xl font-bold" id="auth-modal-title">欢迎来到游雁学院</h2>
                <p class="text-white/80 text-sm mt-1" id="auth-modal-subtitle">企业统一身份认证</p>
            </div>

            <!-- 账号登录区域 -->
            <div id="auth-account-panel">
                <!-- 标签页切换 -->
                <div class="flex border-b border-gray-200">
                    <button onclick="AuthModal.switchTab('password')" id="tab-password" class="flex-1 py-3 text-center font-medium text-primary border-b-2 border-primary transition-colors">
                        密码登录
                    </button>
                    <button onclick="AuthModal.switchTab('sms')" id="tab-sms" class="flex-1 py-3 text-center font-medium text-gray-500 hover:text-primary transition-colors">
                        验证码登录
                    </button>
                </div>

                <!-- 密码登录表单 -->
                <div id="auth-password-form" class="p-6 space-y-4">
                    <div class="relative">
                        <i class="fa fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input
                            type="text"
                            id="auth-username"
                            class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                            placeholder="请输入手机号"
                            autocomplete="tel"
                        >
                    </div>
                    <div class="relative">
                        <i class="fa fa-lock absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input
                            type="password"
                            id="auth-password"
                            class="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                            placeholder="请输入密码"
                            autocomplete="current-password"
                        >
                        <button type="button" onclick="AuthModal.togglePassword('auth-password')" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <i class="fa fa-eye" id="auth-password-toggle-icon"></i>
                        </button>
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
                </div>

                <!-- 验证码登录表单 -->
                <div id="auth-sms-form" class="p-6 space-y-4 hidden">
                    <div class="relative">
                        <i class="fa fa-mobile absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                        <input
                            type="text"
                            id="auth-sms-phone"
                            class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                            placeholder="请输入手机号"
                            autocomplete="tel"
                        >
                    </div>
                    <div class="relative flex gap-2">
                        <div class="relative flex-1">
                            <i class="fa fa-shield absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input
                                type="text"
                                id="auth-sms-code"
                                class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                placeholder="请输入验证码"
                                maxlength="6"
                            >
                        </div>
                        <button type="button" onclick="AuthModal.sendSmsCode()" id="auth-sms-send-btn" class="px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                            获取验证码
                        </button>
                    </div>
                    <button onclick="AuthModal.handleSmsLogin()" id="auth-sms-login-btn" class="w-full py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-lg font-medium hover:opacity-90 transition-all flex items-center justify-center">
                        <i class="fa fa-sign-in mr-2"></i>登录
                    </button>
                </div>
            </div>

            <!-- 扫码登录区域 -->
            <div id="auth-qr-panel" class="hidden p-6">
                <!-- 选择扫码方式 -->
                <div id="auth-qr-select">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="h-px flex-1 bg-gray-200"></div>
                        <span class="text-sm text-gray-500">选择扫码登录方式</span>
                        <div class="h-px flex-1 bg-gray-200"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 mb-6">
                        ${QR_PROVIDERS.map(p => `
                            <button type="button" onclick="AuthModal.selectQrProvider('${p.key}')" class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-colors">
                                <span style="color:${p.color}">${p.icon}</span>
                                <span class="text-sm font-medium text-gray-700">${p.name}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- 二维码展示 -->
                <div id="auth-qr-code" class="hidden text-center">
                    <div id="auth-qr-placeholder" class="w-48 h-48 mx-auto bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center mb-4 overflow-hidden">
                        <i class="fa fa-qrcode text-6xl text-gray-300"></i>
                    </div>
                    <p class="text-sm text-gray-500 mb-4">
                        请使用<span id="auth-qr-provider-name" class="font-medium text-gray-700">钉钉</span>扫描二维码登录
                        <button type="button" onclick="AuthModal.refreshQrCode()" class="ml-1 text-primary hover:underline text-sm"><i class="fa fa-refresh mr-0.5"></i>刷新</button>
                    </p>
                    <div class="flex justify-center gap-4 mb-4">
                        ${QR_PROVIDERS.map(p => `
                            <button type="button" onclick="AuthModal.selectQrProvider('${p.key}')" class="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100" title="${p.name}">
                                <span style="color:${p.color}">${p.icon}</span>
                            </button>
                        `).join('')}
                    </div>
                    <p id="auth-qr-status" class="text-xs text-gray-400 min-h-[1rem]"></p>
                </div>

                <div class="text-center">
                    <button type="button" onclick="AuthModal.switchMode('account')" class="text-sm text-primary hover:underline">工号登录</button>
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
    let currentTab = 'password';
    let currentMode = 'account'; // 'account' | 'qr'
    let isSubmitting = false;
    let onSuccessCallback = null;
    let smsCountdown = 0;
    let smsTimer = null;
    let qrProvider = null;
    let qrToken = null;
    let qrPollingTimer = null;
    let qrExpireTimer = null;

    // 内存验证码（生产环境应接入短信服务商并存储到 Redis/DB）
    const smsCodeStore = new Map();

    // 初始化
    function init(options = {}) {
        if (!document.getElementById('auth-modal')) {
            document.body.insertAdjacentHTML('beforeend', modalTemplate);
        }

        if (options.onSuccess) {
            onSuccessCallback = options.onSuccess;
        }

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

            clearForms();
            switchMode('account');
            if (options.tab === 'sms') {
                switchTab('sms');
            } else {
                switchTab('password');
            }

            setTimeout(() => {
                const input = document.getElementById('auth-username') || document.getElementById('auth-sms-phone');
                if (input) input.focus();
            }, 100);
        }
    }

    // 关闭弹窗
    function close() {
        stopQrPolling();
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

    // 切换登录标签页
    function switchTab(tab) {
        currentTab = tab;
        const passwordForm = document.getElementById('auth-password-form');
        const smsForm = document.getElementById('auth-sms-form');
        const tabPassword = document.getElementById('tab-password');
        const tabSms = document.getElementById('tab-sms');

        if (tab === 'sms') {
            passwordForm.classList.add('hidden');
            smsForm.classList.remove('hidden');
            tabSms.classList.add('text-primary', 'border-primary');
            tabSms.classList.remove('text-gray-500');
            tabPassword.classList.remove('text-primary', 'border-primary');
            tabPassword.classList.add('text-gray-500');
        } else {
            passwordForm.classList.remove('hidden');
            smsForm.classList.add('hidden');
            tabPassword.classList.add('text-primary', 'border-primary');
            tabPassword.classList.remove('text-gray-500');
            tabSms.classList.remove('text-primary', 'border-primary');
            tabSms.classList.add('text-gray-500');
        }
    }

    // 切换登录模式：账号登录 / 扫码登录
    function switchMode(mode) {
        currentMode = mode || (currentMode === 'account' ? 'qr' : 'account');
        const accountPanel = document.getElementById('auth-account-panel');
        const qrPanel = document.getElementById('auth-qr-panel');
        const modeToggle = document.getElementById('auth-mode-toggle');

        if (currentMode === 'qr') {
            accountPanel.classList.add('hidden');
            qrPanel.classList.remove('hidden');
            if (modeToggle) {
                modeToggle.innerHTML = '<i class="fa fa-desktop text-xl"></i>';
                modeToggle.title = '切换工号登录';
            }
            showQrSelect();
        } else {
            accountPanel.classList.remove('hidden');
            qrPanel.classList.add('hidden');
            if (modeToggle) {
                modeToggle.innerHTML = '<i class="fa fa-qrcode text-xl"></i>';
                modeToggle.title = '切换扫码登录';
            }
            stopQrPolling();
        }
    }

    function toggleMode() {
        switchMode();
    }

    // 清空表单
    function clearForms() {
        const username = document.getElementById('auth-username');
        if (username) username.value = '';
        const password = document.getElementById('auth-password');
        if (password) password.value = '';
        const remember = document.getElementById('auth-remember');
        if (remember) remember.checked = false;

        const smsPhone = document.getElementById('auth-sms-phone');
        if (smsPhone) smsPhone.value = '';
        const smsCode = document.getElementById('auth-sms-code');
        if (smsCode) smsCode.value = '';

        resetSmsCountdown();
    }

    // 切换密码可见性
    function togglePassword(inputId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(inputId + '-toggle-icon');
        if (!input || !icon) return;
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

    // 通用登录成功处理
    function handleLoginSuccess(result, remember) {
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

        if (remember) {
            localStorage.setItem('token', result.data.token);
            localStorage.setItem('user', JSON.stringify(result.data.user));
        } else {
            sessionStorage.setItem('token', result.data.token);
            sessionStorage.setItem('user', JSON.stringify(result.data.user));
        }

        showToast('登录成功！', 'success');

        setTimeout(() => {
            close();
            if (onSuccessCallback) {
                onSuccessCallback(result.data);
            }
            window.dispatchEvent(new CustomEvent('userLoginSuccess', {
                detail: { user: result.data.user }
            }));
        }, 500);
    }

    // 处理密码登录
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
                handleLoginSuccess(result, remember);
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

    // 发送短信验证码
    async function sendSmsCode() {
        const phoneInput = document.getElementById('auth-sms-phone');
        const phone = phoneInput ? phoneInput.value.trim() : '';

        if (!phone) {
            showToast('请输入手机号', 'error');
            return;
        }

        if (smsCountdown > 0) return;

        const sendBtn = document.getElementById('auth-sms-send-btn');
        sendBtn.disabled = true;
        sendBtn.textContent = '发送中...';

        try {
            const response = await fetch(`${API_BASE}/auth/sms-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                showToast('验证码已发送', 'success');
                startSmsCountdown();
            } else {
                showToast(result.error || '发送失败', 'error');
                sendBtn.disabled = false;
                sendBtn.textContent = '获取验证码';
            }
        } catch (error) {
            console.error('发送验证码错误:', error);
            showToast('网络错误，请稍后重试', 'error');
            sendBtn.disabled = false;
            sendBtn.textContent = '获取验证码';
        }
    }

    function startSmsCountdown() {
        smsCountdown = 60;
        const sendBtn = document.getElementById('auth-sms-send-btn');
        sendBtn.disabled = true;
        sendBtn.textContent = `${smsCountdown}s 后重发`;
        smsTimer = setInterval(() => {
            smsCountdown--;
            if (smsCountdown <= 0) {
                resetSmsCountdown();
            } else {
                sendBtn.textContent = `${smsCountdown}s 后重发`;
            }
        }, 1000);
    }

    function resetSmsCountdown() {
        if (smsTimer) {
            clearInterval(smsTimer);
            smsTimer = null;
        }
        smsCountdown = 0;
        const sendBtn = document.getElementById('auth-sms-send-btn');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = '获取验证码';
        }
    }

    // 处理短信验证码登录
    async function handleSmsLogin() {
        if (isSubmitting) return;

        const phone = document.getElementById('auth-sms-phone').value.trim();
        const code = document.getElementById('auth-sms-code').value.trim();

        if (!phone || !code) {
            showToast('请输入手机号和验证码', 'error');
            return;
        }

        const loginBtn = document.getElementById('auth-sms-login-btn');
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>登录中...';
        isSubmitting = true;

        try {
            const response = await fetch(`${API_BASE}/auth/sms-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, code })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // 短信登录默认记住我，便于扫码/验证码场景
                handleLoginSuccess(result, true);
            } else {
                showToast(result.error || '登录失败', 'error');
            }
        } catch (error) {
            console.error('验证码登录错误:', error);
            showToast('网络错误，请稍后重试', 'error');
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fa fa-sign-in mr-2"></i>登录';
            isSubmitting = false;
        }
    }

    // 扫码登录：显示选择面板
    function showQrSelect() {
        const selectPanel = document.getElementById('auth-qr-select');
        const codePanel = document.getElementById('auth-qr-code');
        if (selectPanel) selectPanel.classList.remove('hidden');
        if (codePanel) codePanel.classList.add('hidden');
        stopQrPolling();
    }

    // 扫码登录：选择提供商
    async function selectQrProvider(provider) {
        qrProvider = provider;
        const p = QR_PROVIDERS.find(x => x.key === provider);
        if (!p) return;

        const selectPanel = document.getElementById('auth-qr-select');
        const codePanel = document.getElementById('auth-qr-code');
        const nameEl = document.getElementById('auth-qr-provider-name');
        const placeholder = document.getElementById('auth-qr-placeholder');
        const statusEl = document.getElementById('auth-qr-status');

        if (selectPanel) selectPanel.classList.add('hidden');
        if (codePanel) codePanel.classList.remove('hidden');
        if (nameEl) nameEl.textContent = p.name.replace('登录', '');
        if (statusEl) statusEl.textContent = '正在获取二维码...';

        placeholder.innerHTML = '<i class="fa fa-spinner fa-spin text-3xl text-gray-300"></i>';

        try {
            const response = await fetch(`${API_BASE}/auth/qr/${provider}/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();

            if (response.ok && result.success && result.data) {
                qrToken = result.data.qrToken;
                // 展示二维码图片；如果没有返回二维码地址，则展示占位符
                if (result.data.qrUrl) {
                    placeholder.innerHTML = `<img src="${result.data.qrUrl}" class="w-full h-full object-contain" alt="${p.name}">`;
                } else {
                    placeholder.innerHTML = `<div class="text-center"><i class="fa fa-qrcode text-5xl text-gray-300"></i><p class="text-xs text-gray-400 mt-2">二维码占位</p></div>`;
                }
                if (statusEl) statusEl.textContent = '请使用手机扫码';
                startQrPolling(provider, qrToken);
            } else {
                placeholder.innerHTML = '<div class="text-center"><i class="fa fa-exclamation-circle text-4xl text-red-300"></i><p class="text-xs text-gray-400 mt-2">获取失败</p></div>';
                if (statusEl) statusEl.textContent = result.error || '二维码获取失败';
            }
        } catch (error) {
            console.error('二维码初始化错误:', error);
            placeholder.innerHTML = '<div class="text-center"><i class="fa fa-exclamation-circle text-4xl text-red-300"></i><p class="text-xs text-gray-400 mt-2">网络错误</p></div>';
            if (statusEl) statusEl.textContent = '网络错误，请刷新重试';
        }
    }

    function refreshQrCode() {
        if (qrProvider) {
            selectQrProvider(qrProvider);
        } else {
            showQrSelect();
        }
    }

    function startQrPolling(provider, token) {
        stopQrPolling();
        const statusEl = document.getElementById('auth-qr-status');

        // 60 秒后过期
        if (qrExpireTimer) clearTimeout(qrExpireTimer);
        qrExpireTimer = setTimeout(() => {
            stopQrPolling();
            if (statusEl) statusEl.textContent = '二维码已过期，请点击刷新';
        }, 60000);

        qrPollingTimer = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE}/auth/qr/${provider}/status?token=${token}`);
                const result = await response.json();

                if (!response.ok || !result.success) return;

                const status = result.data && result.data.status;
                if (status === 'scanned') {
                    if (statusEl) statusEl.textContent = '扫码成功，等待确认...';
                } else if (status === 'confirmed' && result.data.user) {
                    stopQrPolling();
                    if (statusEl) statusEl.textContent = '登录成功';
                    handleLoginSuccess({ data: { token: result.data.token, user: result.data.user } }, true);
                } else if (status === 'expired') {
                    stopQrPolling();
                    if (statusEl) statusEl.textContent = '二维码已过期，请点击刷新';
                }
            } catch (e) {
                // 忽略轮询网络抖动
            }
        }, 3000);
    }

    function stopQrPolling() {
        if (qrPollingTimer) {
            clearInterval(qrPollingTimer);
            qrPollingTimer = null;
        }
        if (qrExpireTimer) {
            clearTimeout(qrExpireTimer);
            qrExpireTimer = null;
        }
    }

    // 导出API
    window.AuthModal = {
        init,
        show,
        close,
        isVisible,
        switchTab,
        switchMode,
        toggleMode,
        togglePassword,
        showToast,
        handleLogin,
        sendSmsCode,
        handleSmsLogin,
        selectQrProvider,
        refreshQrCode
    };
})();
