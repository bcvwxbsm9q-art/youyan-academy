
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#667eea',
            secondary: '#764ba2',
          }
        }
      }
    }
  
;

    // dataSync 兼容层：将 window.dataSync.getData/setData 映射到 DataAPI
    if (!window.dataSync) {
      window.dataSync = {
        getData(key) {
          if (window.DataAPI && window.DataAPI.get) {
            return window.DataAPI.get(key) || [];
          }
          return safeParse(key, []);
        },
        async setData(key, value) {
          if (window.DataAPI && window.DataAPI.set) {
            await window.DataAPI.set(key, value);
          } else {
            localStorage.setItem(key, JSON.stringify(value));
          }
        }
      };
    }
    // ========== 全局配置 ==========
    const API = window.location.origin + '/api';

    // 弹窗生命周期内 newly 上传但未最终保存的本地文件，关闭弹窗时清理
    let pendingBannerImages = [];
    let pendingNoticeImages = [];
    let pendingCourseFiles = [];      // 元素: { url, type: 'cover'|'video'|'attachment' }
    let pendingLecturerAvatar = [];   // 讲师头像
    let pendingTrainingCourseware = []; // 培训课件
    // 编辑公告时记录原始正文里的图片 URL，保存后若被删除则清理磁盘文件（避免孤儿文件）
    let originalNoticeImages = [];

    // 编辑时记录原始封面/头像路径，保存新图后清理旧文件（避免孤儿文件）
    let originalCourseCover = '';
    let originalLecturerAvatar = '';

    // 从富文本 HTML 中提取所有图片 URL（兼容带查询参数的情况）
    function extractImageUrls(html) {
      if (!html || typeof html !== 'string') return [];
      const urls = [];
      const re = /<img[^>]+src=["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        // 归一化：去掉查询字符串，统一以 /uploads/ 开头用于后续比对
        let u = m[1];
        try { u = new URL(u, location.origin).pathname; } catch (e) { /* 相对路径容错 */ }
        if (u) urls.push(u);
      }
      return [...new Set(urls)];
    }

    // 当前弹窗类型，用于点击遮罩层时路由到对应的关闭清理函数
    let currentModalType = null;

    /**
     * 根据 /uploads/{type}/{filename} 删除单个上传文件
     * @param {string} url
     */
    async function deleteUploadFileByUrl(url) {
      if (!url || typeof url !== 'string') return;
      const match = url.match(/^\/uploads\/([^/]+)\/(.+)$/);
      if (!match) return;
      const [, type, filename] = match;
      try {
        await fetch(`${API}/upload/${type}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      } catch (e) {
        console.warn('删除临时文件失败:', url, e);
      }
    }

    // ========== 登录功能（统一认证） ==========

    // 检查是否已登录（使用统一 token）
    function checkLogin() {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const userInfo = document.getElementById('user-info');

      if (token) {
        // 已登录，显示用户信息
        if (userInfo) {
          userInfo.classList.remove('hidden');
          userInfo.classList.add('flex');

          // 显示用户名
          const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              const usernameEl = document.getElementById('admin-username');
              if (usernameEl && user.realName) {
                usernameEl.textContent = user.realName;
              }
            } catch(e) {
              console.error('解析用户信息失败:', e);
            }
          }
        }
        return true;
      } else {
        // 未登录（AuthGuard 会处理重定向）
        if (userInfo) {
          userInfo.classList.add('hidden');
          userInfo.classList.remove('flex');
        }
        return false;
      }
    }

    // 退出登录（使用统一认证）
    function handleLogout() {
      if (AuthGuard) {
        AuthGuard.logout();
      } else {
        if (confirm('确定要退出登录吗?')) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('user');
          toast('已退出登录');
          window.location.href = 'index.html';
        }
      }
    }

    // 页面加载时检查登录状态
    document.addEventListener('DOMContentLoaded', () => {
      checkLogin();
    });

    // 数据存储
    let data = {
      courses: [],
      categories: [],
      lecturers: [],
      training: [],
      notices: [],
      users: []
    };

    let isInitialized = false;

    // ========== 初始化 ==========
    document.addEventListener('DOMContentLoaded', async () => {
      if (isInitialized) return;
      isInitialized = true;

      updateTime();
      setInterval(updateTime, 1000);

      // 初始化 DataAPI(读取 localStorage 中的互动数据)
      if (window.DataAPI?.init) await window.DataAPI.init();

      try {
        await loadAllData();
      } catch (error) {
        console.error('初始化加载数据失败:', error);
        toast('数据加载失败,部分功能可能受限', 'warning');
      }

      try {
        switchTab('dashboard');
      } catch (error) {
        console.error('切换标签页失败:', error);
      }

      // 初始化用户管理筛选器
      initUserFilters();

      // 培训列表上传图片按钮已改为 onclick 直接绑定
    });

    function updateTime() {
      const now = new Date();
      document.getElementById('current-time').textContent = now.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }

    async function loadAllData() {
      try {
        const [coursesRes, catsRes, lectRes, trainRes, noticesRes, surveysRes, examsRes, paymentRecordsRes] = await Promise.all([
          fetch(API + '/courses'),
          fetch(API + '/categories'),
          fetch(API + '/lecturers'),
          fetch(API + '/training'),
          fetch(API + '/notices'),
          fetch(API + '/surveys'),
          fetch(API + '/exams'),
          fetch(API + '/lecturer-payment-records')
        ]);
        data.courses = await coursesRes.json();
        data.categories = await catsRes.json();
        const lectJson = await lectRes.json();
        data.lecturers = lectJson.data || lectJson;
        data.training = await trainRes.json();
        data.notices = await noticesRes.json();

        const surveysJson = await surveysRes.json();
        data.surveys = surveysJson.data || surveysJson || [];

        const examsJson = await examsRes.json();
        data.exams = examsJson || [];

        const paymentRecordsJson = await paymentRecordsRes.json();
        data.lecturer_payment_records = paymentRecordsJson.data || [];

        // 加载用户数据(报表模块需要)
        try {
          const token = localStorage.getItem('token') || sessionStorage.getItem('token');
          const usersRes = await fetch(API + '/auth/users', {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (usersRes.ok) {
            const usersJson = await usersRes.json();
            allUsers = (usersJson.data && usersJson.data.users) ? usersJson.data.users : (usersJson.data || usersJson || []);
          }
        } catch(e) {
          console.warn('[Dashboard] 加载用户数据失败:', e);
        }

        // 从 localStorage 同步最新的课程数据(浏览量等由播放页写入本地)
        if (window.DataAPI) {
          const localCourses = window.DataAPI.getCourses();
          if (localCourses && localCourses.length > 0) {
            // 用本地的浏览量覆盖服务器数据(因为浏览量只存本地)
            data.courses.forEach(serverCourse => {
              const localCourse = localCourses.find(c => String(c.id) === String(serverCourse.id));
              if (localCourse && localCourse.views !== undefined) {
                serverCourse.views = localCourse.views;
              }
            });
          }
        }

        // 确保分类是数组格式
        if (!Array.isArray(data.categories)) {
          data.categories = [];
        }

        // 广播数据变更,通知其他页面(如课程中心)同步
        console.log('[Dashboard] loadAllData完成,准备广播分类变更');
        if (window.DataSync) {
          localStorage.setItem('categories_sync_time', Date.now().toString());
          window.DataSync.broadcast(DataSync.EventTypes.CATEGORIES);
          console.log('[Dashboard] 已广播分类变更事件');
        } else {
          console.warn('[Dashboard] DataSync未加载,无法广播');
        }

        // 更新分类筛选下拉
        updateCategoryFilter();
        // 更新培训项目筛选下拉
        updateTrainingProjectFilter();
        // 数据加载完成后刷新各面板(无论当前显示哪个 tab)
        if (document.getElementById('notice-list')) renderNotices();
        if (document.getElementById('portal-notice-list')) renderPortalNotices();
        if (document.getElementById('portal-category-list')) renderPortalCategories();
      } catch (e) {
        console.error('加载数据失败', e);
        toast('数据加载失败', 'error');
      }
    }

    function updateCategoryFilter() {
      const select = document.getElementById('course-category-filter');
      if (!select) return;
      const options = data.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      select.innerHTML = '<option value="">全部分类</option>' + options;
    }

    function updateTrainingProjectFilter() {
      const select = document.getElementById('training-project-filter');
      if (!select) return;
      // 从实际数据中提取项目列表
      const projects = [...new Set((data.training || []).map(e => e.project).filter(Boolean))];
      const options = projects.map(p => `<option value="${p}">${p}</option>`).join('');
      select.innerHTML = '<option value="">全部项目</option>' + options;
    }



    // ========== 子标签页切换 ==========
    function switchSubTab(tabName, subTabName) {
      const subtabBtns = document.querySelectorAll('.subtab-btn');
      subtabBtns.forEach(btn => btn.classList.remove('active', 'bg-indigo-600', 'text-white'));
      subtabBtns.forEach(btn => btn.classList.add('text-slate-600', 'hover:bg-slate-100'));

      const activeBtn = document.querySelector(`.subtab-btn:not([onclick*="${tabName}"])`);
      const targetBtn = Array.from(subtabBtns).find(btn => btn.onclick && btn.onclick.toString().includes(tabName) && btn.onclick.toString().includes(subTabName));
      if (targetBtn) {
        targetBtn.classList.add('active', 'bg-indigo-600', 'text-white');
        targetBtn.classList.remove('text-slate-600', 'hover:bg-slate-100');
      }

      const subtabContents = document.querySelectorAll('.subtab-content');
      subtabContents.forEach(content => content.classList.add('hidden'));

      const targetContent = document.getElementById(`${tabName}-${subTabName}`);
      if (targetContent) {
        targetContent.classList.remove('hidden');
      }

      // 切换到轮播管理时加载数据
      if (tabName === 'portal' && subTabName === 'carousel') {
        loadCarousels();
      }

      // 切换到分类管理时渲染分类列表
      if (tabName === 'portal' && subTabName === 'categories') {
        renderPortalCategories();
      }

      // 切换到讲师报名时加载数据
      if (tabName === 'portal' && subTabName === 'lecturer-apply') {
        loadLecturerApplications();
      }

      // 考试相关功能已迁移至独立的题库管理和试卷管理页面

    }

    // ========== 轮播管理 ==========
    async function loadCarousels() {
      const tbody = document.getElementById('carousel-list');
      if (!tbody) return;

      try {
        const res = await fetch(API + '/banners');
        const banners = await res.json();

        if (!banners || banners.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                <i class="fas fa-images text-4xl mb-3 block"></i>
                <p>暂无轮播图</p>
                <p class="text-sm">点击上方按钮添加</p>
              </td>
            </tr>`;
          return;
        }

        // 按排序号升序排列
        const sortedBanners = [...banners].sort((a, b) => (a.order || 99) - (b.order || 99));

        tbody.innerHTML = sortedBanners.map(b => {
          const checked = bannerSelectedIds.has(String(b.id)) ? 'checked' : '';
          return `
          <tr class="hover:bg-slate-50 transition">
            <td class="pl-5 pr-2 py-4 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" class="banner-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleBannerSelect('${b.id}')" ${checked}>
            </td>
            <!-- 封面图 -->
            <td class="px-6 py-4">
              <div class="w-32 h-20 rounded-lg overflow-hidden bg-slate-100">
                <img src="${escHtml(b.img)}" alt="${escHtml(b.courseTitle||b.announcementTitle||'')}" class="w-full h-full object-cover" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22128%22 height=%2280%22><rect fill=%22%23e2e8f0%22 width=%22128%22 height=%2280%22/><text x=%2264%22 y=%2245%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2212%22>暂无封面</text></svg>'">
              </div>
            </td>

            <!-- 关联公告 -->
            <td class="px-6 py-4 text-sm text-slate-700">
              ${b.announcementTitle ? escHtml(b.announcementTitle) : '<span class="text-slate-400">未关联</span>'}
            </td>

            <!-- 关联课程 -->
            <td class="px-6 py-4 text-sm text-slate-700">
              ${b.courseTitle ? escHtml(b.courseTitle) : '<span class="text-slate-400">未关联</span>'}
            </td>

            <!-- 排序 -->
            <td class="px-6 py-4 text-center text-sm text-slate-600">
              <span class="px-2 py-1 bg-slate-100 rounded-md font-medium">${b.order || '-'}</span>
            </td>

            <!-- 状态 -->
            <td class="px-6 py-4 text-center">
              ${b.status === 'draft'
                ? '<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">草稿</span>'
                : '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">已发布</span>'
              }
            </td>

            <!-- 操作 -->
            <td class="px-6 py-4 text-center">
              <button onclick="editCarousel(${b.id})" class="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs hover:bg-indigo-100 transition mr-2">
                <i class="fas fa-edit mr-1"></i>编辑
              </button>
              <button onclick="deleteCarousel(${b.id})" class="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100 transition">
                <i class="fas fa-trash mr-1"></i>删除
              </button>
            </td>
          </tr>`;
        }).join('');
      } catch (err) {
        console.error('加载轮播图失败:', err);
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="px-6 py-12 text-center text-red-400">
              <i class="fas fa-exclamation-circle text-3xl mb-2 block"></i>
              <p>加载失败,请刷新重试</p>
            </td>
          </tr>`;
      }
    }

    // 轮播图可搜索下拉缓存
    let carouselCourses = [];
    let carouselAnnouncements = [];
    let carouselEditingBanner = null;
    let originalCarouselImg = '';   // 编辑时原始封面路径，保存新图后需清理旧文件
    const initializedSearchableSelects = new Set();

    function initCarouselSearchableSelect(container, items, textInput, hiddenInput) {
      const dropdown = container.querySelector('.select-dropdown');

      function renderOptions(filter) {
        const term = String(filter || '').trim().toLowerCase();
        const filtered = items.filter(item => {
          const label = String(item.title || item.name || '').toLowerCase();
          return label.includes(term);
        });
        if (filtered.length === 0) {
          dropdown.innerHTML = '<div class="px-4 py-2 text-sm text-slate-400">无匹配结果</div>';
          return;
        }
        dropdown.innerHTML = filtered.map(item =>
          `<div class="select-option px-4 py-2 text-sm hover:bg-indigo-50 cursor-pointer text-slate-700 truncate" data-value="${item.id}" data-label="${escHtml(item.title || item.name)}">${escHtml(item.title || item.name)}</div>`
        ).join('');
      }

      function bindOnce() {
        if (initializedSearchableSelects.has(container)) return;
        textInput.addEventListener('focus', () => {
          renderOptions(textInput.value);
          dropdown.classList.remove('hidden');
        });
        textInput.addEventListener('input', () => {
          renderOptions(textInput.value);
          dropdown.classList.remove('hidden');
        });
        dropdown.addEventListener('click', (e) => {
          const option = e.target.closest('.select-option');
          if (!option) return;
          textInput.value = option.dataset.label;
          hiddenInput.value = option.dataset.value;
          dropdown.classList.add('hidden');
        });
        document.addEventListener('click', (e) => {
          if (!container.contains(e.target)) dropdown.classList.add('hidden');
        });
        initializedSearchableSelects.add(container);
      }

      bindOnce();
      renderOptions(textInput.value);
    }

    async function loadCarouselCourseOptions() {
      const container = document.querySelector('[data-target="carousel-course"]');
      const textInput = document.getElementById('carousel-course-text');
      const hiddenInput = document.getElementById('carousel-course');
      try {
        const res = await fetch(API + '/courses');
        const courses = await res.json();
        carouselCourses = (courses || []).filter(c => c.status === 'published');
        initCarouselSearchableSelect(container, carouselCourses, textInput, hiddenInput);
        if (carouselEditingBanner && carouselEditingBanner.courseId) {
          const course = carouselCourses.find(c => c.id === carouselEditingBanner.courseId);
          if (course) {
            textInput.value = course.title;
            hiddenInput.value = course.id;
          }
        }
      } catch (err) {
        textInput.placeholder = '加载课程失败';
      }
    }

    async function loadCarouselAnnouncementOptions() {
      const container = document.querySelector('[data-target="carousel-announcement"]');
      const textInput = document.getElementById('carousel-announcement-text');
      const hiddenInput = document.getElementById('carousel-announcement');
      try {
        const res = await fetch(API + '/notices');
        const notices = await res.json();
        carouselAnnouncements = notices || [];
        initCarouselSearchableSelect(container, carouselAnnouncements, textInput, hiddenInput);
        if (carouselEditingBanner && carouselEditingBanner.announcementId) {
          const notice = carouselAnnouncements.find(n => n.id === carouselEditingBanner.announcementId);
          if (notice) {
            textInput.value = notice.title;
            hiddenInput.value = notice.id;
          }
        }
      } catch (err) {
        textInput.placeholder = '加载公告失败';
      }
    }

    function openCarouselModal(banner = null) {
      carouselEditingBanner = banner || null;
      originalCarouselImg = banner ? (banner.img || '') : '';
      document.getElementById('carousel-id').value = banner ? banner.id : '';
      document.getElementById('carousel-order').value = banner ? banner.order || '' : '';
      document.getElementById('carousel-status').value = banner ? banner.status || 'published' : 'published';
      document.getElementById('carousel-cover-url').value = banner ? banner.img || '' : '';
      document.getElementById('carouselModalTitle').textContent = banner ? '编辑轮播图' : '添加轮播图';

      // 封面预览
      const placeholder = document.getElementById('carousel-cover-placeholder');
      const img = document.getElementById('carousel-cover-img');
      if (banner && banner.img) {
        img.src = banner.img;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
      } else {
        img.src = '';
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
      }

      // 清空可搜索下拉
      document.getElementById('carousel-course-text').value = '';
      document.getElementById('carousel-course').value = '';
      document.getElementById('carousel-announcement-text').value = '';
      document.getElementById('carousel-announcement').value = '';

      // 加载课程和公告列表
      loadCarouselCourseOptions();
      loadCarouselAnnouncementOptions();

      const modal = document.getElementById('carouselModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeCarouselModal() {
      // 清理本次弹窗内上传但未保存的临时图片
      pendingBannerImages.forEach(url => deleteUploadFileByUrl(url));
      pendingBannerImages = [];

      const modal = document.getElementById('carouselModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      document.getElementById('carouselForm').reset();
      document.getElementById('carousel-cover-img').classList.add('hidden');
      document.getElementById('carousel-cover-placeholder').classList.remove('hidden');
      carouselEditingBanner = null;
      originalCarouselImg = '';
    }

    // 编辑时回填关联课程和公告
    async function editCarousel(id) {
      try {
        const res = await fetch(API + '/banners');
        const banners = await res.json();
        const banner = banners.find(b => b.id === id);
        if (banner) {
          openCarouselModal(banner);
        }
      } catch (err) {
        toast('获取轮播图信息失败', 'error');
      }
    }

    async function handleCarouselCoverUpload(input) {
      const file = input.files[0];
      if (!file) return;

      // 替换前的封面（可能是本次会话临时上传的，也可能是编辑时的原始封面）
      const prevCover = document.getElementById('carousel-cover-url').value.trim();

      const formData = new FormData();
      formData.append('file', file);

      try {
        input.disabled = true;
        const res = await fetch(API + '/upload?type=covers', {
          method: 'POST',
          body: formData
        });
        const result = await res.json();
        if (result.success) {
          // 若替换的是本次会话内已上传的临时图片，立即删除旧文件，避免项目里残留孤儿图
          if (prevCover && pendingBannerImages.includes(prevCover) && prevCover !== result.url) {
            pendingBannerImages = pendingBannerImages.filter(u => u !== prevCover);
            await deleteUploadFileByUrl(prevCover);
          }
          document.getElementById('carousel-cover-url').value = result.url;
          const img = document.getElementById('carousel-cover-img');
          img.src = result.url;
          img.classList.remove('hidden');
          document.getElementById('carousel-cover-placeholder').classList.add('hidden');
          pendingBannerImages.push(result.url);
          toast('封面上传成功');
        } else {
          toast(result.error || '上传失败', 'error');
        }
      } catch (err) {
        toast('上传失败', 'error');
      } finally {
        input.disabled = false;
        input.value = '';
      }
    }

    async function saveCarousel(e) {
      e.preventDefault();
      const id = document.getElementById('carousel-id').value;
      const coverUrl = document.getElementById('carousel-cover-url').value.trim();

      if (!coverUrl) {
        toast('请上传封面图片', 'error');
        return;
      }

      const bannerData = {
        img: coverUrl,
        courseId: document.getElementById('carousel-course').value ? parseInt(document.getElementById('carousel-course').value) : null,
        announcementId: document.getElementById('carousel-announcement').value ? parseInt(document.getElementById('carousel-announcement').value) : null,
        order: parseInt(document.getElementById('carousel-order').value) || 99,
        status: document.getElementById('carousel-status').value
      };

      try {
        const url = id ? `${API}/banners/${id}` : `${API}/banners`;
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bannerData)
        });
        const result = await res.json();
        if (result.success) {
          // 编辑时若封面被替换，清理原来的项目文件图片
          if (id && originalCarouselImg && originalCarouselImg !== coverUrl) {
            await deleteUploadFileByUrl(originalCarouselImg);
          }
          // 新封面已落到 banner 上，清空 pending（不再当作临时文件删除）
          pendingBannerImages = [];
          originalCarouselImg = '';
          toast(id ? '轮播图已更新' : '轮播图已添加');
          closeCarouselModal();
          loadCarousels();
        } else {
          toast(result.error || '保存失败', 'error');
        }
      } catch (err) {
        toast('保存失败', 'error');
      }
    }

    async function deleteCarousel(id) {
      if (!confirm('确定删除这个轮播图吗？封面图片将一并清理。')) return;
      try {
        const res = await fetch(`${API}/banners/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
          toast('轮播图已删除');
          loadCarousels();
        } else {
          toast(result.error || '删除失败', 'error');
        }
      } catch (err) {
        toast('删除失败', 'error');
      }
    }

    function escJs(str) {
      return escHtml(str).replace(/'/g, "\\'");
    }

    // ========== 标签切换 ==========
    function switchTab(name) {
      // 隐藏所有标签页（同时使用 class 和 style 双重保障）
      var allTabs = document.querySelectorAll('.tab-content');
      allTabs.forEach(function(el) {
        el.classList.add('hidden');
        el.style.setProperty('display', 'none', 'important');
      });
      var sidebarItems = document.querySelectorAll('.sidebar-item');
      sidebarItems.forEach(function(el) { el.classList.remove('active'); });

      // 显示目标标签页
      var tabEl = document.getElementById('tab-' + name);
      if (tabEl) {
        tabEl.classList.remove('hidden');
        tabEl.style.setProperty('display', 'block', 'important');
        // 同时确保所有父元素可见
        var p = tabEl.parentElement;
        while (p && p !== document.body) {
          if (p.style.display === 'none') p.style.setProperty('display', '', 'important');
          if (p.classList.contains('hidden')) p.classList.remove('hidden');
          p = p.parentElement;
        }
      } else {
        return;
      }
      var btnEl = document.querySelector('[data-tab="' + name + '"]');
      if (btnEl) { btnEl.classList.add('active'); }

      // 对于有子标签页的标签，自动切换到第一个子标签页
      if (name === 'portal') {
        switchSubTab('portal', 'carousel');
      }

      // 切换到其他标签页时，关闭编辑器
      if (name !== 'exam-schedule') {
        const editorContainer = document.getElementById('unifiedEditorContainer');
        if (editorContainer && editorContainer.style.display !== 'none' && editorMode === 'exam') {
          closeUnifiedEditor();
        }
      }
      if (name !== 'paper-mgmt') {
        const editorContainer = document.getElementById('unifiedEditorContainer');
        if (editorContainer && editorContainer.style.display !== 'none' && editorMode === 'paper') {
          closeUnifiedEditor();
        }
      }

      // 加载对应标签页数据（带错误处理）
      var loaders = {
        dashboard: async function() { await loadAllData(); loadDashboard(); },
        courses: renderCourses,
        categories: renderCategories,
        lecturers: renderLecturers,
        training: renderTraining,
        notices: renderNotices,
        users: loadUsers,
        portal: loadCarousels,
        'question-bank': loadBankList,
        'paper-mgmt': loadPapers,
        'exam-schedule': loadExamMgmtList,
        survey: loadSurveyList,
        reports: loadReports,
        certificates: function() {
          if (window.CertificateMgmt) {
            window.CertificateMgmt.loadTemplates();
            window.CertificateMgmt.loadCertificates();
          }
        }
      };
      if (loaders[name]) {
        try {
          var result = loaders[name]();
          if (result && typeof result.then === 'function') {
            result.catch(function(err) {
              toast('加载' + name + '数据失败: ' + err.message, 'error');
            });
          }
        } catch(err) {
          toast('加载' + name + '数据失败: ' + err.message, 'error');
        }
      }
    }

    // ========== Toast 提示 ==========
    function toast(msg, type = 'success') {
      const t = document.getElementById('toast');
      const colors = {
        success: 'bg-emerald-500 text-white',
        error: 'bg-red-500 text-white',
        warning: 'bg-amber-500 text-white'
      };
      t.className = `fixed bottom-6 right-6 px-6 py-3 rounded-xl shadow-lg z-50 transform transition-all duration-300 ${colors[type] || colors.success}`;
      t.innerHTML = `<i class="fas ${type === 'error' ? 'fa-times-circle' : 'fa-check-circle'} mr-2"></i>${msg}`;
      t.classList.remove('hidden', 'translate-y-4', 'opacity-0');
      setTimeout(() => {
        t.classList.add('translate-y-4', 'opacity-0');
        setTimeout(() => t.classList.add('hidden'), 300);
      }, 3000);
    }

    // 计算环比增长率：基于 createdAt 字段统计本月 vs 上月新增数量
    function calculateMonthGrowthRate(items) {
      if (!Array.isArray(items) || items.length === 0) return 0;
      const now = new Date();
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

      let thisMonthCount = 0;
      let lastMonthCount = 0;

      items.forEach(item => {
        const dateStr = item.createdAt || item.created_at || item.createTime || '';
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        const m = d.getMonth();
        if (y === thisYear && m === thisMonth) {
          thisMonthCount++;
        } else if (y === lastMonthYear && m === lastMonth) {
          lastMonthCount++;
        }
      });

      if (lastMonthCount === 0) {
        return thisMonthCount > 0 ? 100 : 0;
      }
      return Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100);
    }

    // ========== 数据统计 ==========
    async function loadDashboard() {
      document.getElementById('stat-courses').textContent = data.courses.length;
      document.getElementById('stat-lecturers').textContent = data.lecturers.length;
      // 修复用户总数显示
      const userCount = (allUsers || []).length || (data.users || []).length || (data.registered_users || []).length;
      document.getElementById('stat-users').textContent = userCount;
      // 改为培训总数（与培训管理模块数据源一致）
      const trainingCount = (data.training || []).length;
      document.getElementById('stat-categories').textContent = trainingCount;

      document.getElementById('stat-categories-child').textContent = trainingCount;

      // 基于 createdAt 计算真实的环比增长率，并根据正负显示红/绿色和箭头方向
      function setGrowthDisplay(wrapId, valueId, rate) {
        const wrap = document.getElementById(wrapId);
        const valueEl = document.getElementById(valueId);
        if (!wrap || !valueEl) return;
        const isPositive = rate >= 0;
        wrap.className = isPositive ? 'text-green-500' : 'text-red-500';
        wrap.innerHTML = `<i class="fas fa-arrow-${isPositive ? 'up' : 'down'} mr-1"></i><span id="${valueId}">${Math.abs(rate)}</span>%`;
      }

      setGrowthDisplay('stat-courses-growth-wrap', 'stat-courses-growth', calculateMonthGrowthRate(data.courses));
      setGrowthDisplay('stat-lecturers-growth-wrap', 'stat-lecturers-growth', calculateMonthGrowthRate(data.lecturers));
      setGrowthDisplay('stat-users-growth-wrap', 'stat-users-growth', calculateMonthGrowthRate(allUsers || data.users || []));
    }

    // ========== 课程管理 ==========
    function renderCourses() {
      // 刷新缓存以获取最新的互动数据(浏览量、点赞、评分)
      if (window.DataAPI && typeof window.DataAPI.refreshFromLocalStorage === 'function') {
        window.DataAPI.refreshFromLocalStorage();
      }

      const search = document.getElementById('course-search').value.toLowerCase();
      const status = document.getElementById('course-status-filter').value;
      const categoryId = document.getElementById('course-category-filter').value;

      let filtered = data.courses.filter(c => {
        const matchSearch = !search || c.title.toLowerCase().includes(search);
        const matchStatus = !status || c.status === status;
        const matchCategory = !categoryId || c.categoryId == categoryId;
        return matchSearch && matchStatus && matchCategory;
      });

      document.getElementById('course-count').textContent = filtered.length;

      if (filtered.length === 0) {
        document.getElementById('course-list').innerHTML = `
          <tr>
            <td colspan="12" class="px-6 py-12 text-center text-slate-400">
              <i class="fas fa-inbox text-3xl mb-3"></i>
              <p>暂无课程数据</p>
            </td>
          </tr>`;
        return;
      }

      const statusMap = {
        published: { class: 'bg-emerald-100 text-emerald-700', text: '已发布' },
        draft: { class: 'bg-amber-100 text-amber-700', text: '草稿' },
        offline: { class: 'bg-slate-100 text-slate-600', text: '已下架' }
      };

      document.getElementById('course-list').innerHTML = filtered.map(c => {
        const cat = data.categories.find(x => x.id == c.categoryId);
        const subcat = cat?.children?.find(s => s.id == c.subcategoryId);
        const lect = data.lecturers.find(x => x.id == c.lecturerId);
        const st = statusMap[c.status] || statusMap.draft;
        const videoCount = c.videos?.length || 0;
        const durationMin = Math.floor((c.duration || 0) / 60);

        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0">
            <!-- 选择 -->
            <td class="pl-5 pr-2 py-4 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" class="course-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleCourseSelect('${c.id}')" ${courseSelectedIds.has(String(c.id)) ? 'checked' : ''}>
            </td>
            <!-- 课程封面 -->
            <td class="px-5 py-4">
              <div class="w-16 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                <img src="${c.cover || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2250%22><rect fill=%22%23e2e8f0%22 width=%2280%22 height=%2250%22/><text x=%2240%22 y=%2228%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2210%22>暂无封面</text></svg>'}" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2250%22><rect fill=%22%23e2e8f0%22 width=%2280%22 height=%2250%22/><text x=%2240%22 y=%2228%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2210%22>暂无封面</text></svg>'">
              </div>
            </td>
            <!-- 课程名称 -->
            <td class="px-5 py-4">
              <p class="font-medium text-slate-800 truncate text-sm" style="max-width: 180px;" title="${c.title}">${c.title}</p>
            </td>
            <!-- 分类 -->
            <td class="px-5 py-4">
              <p class="text-sm text-slate-700">${cat?.name || '-'}${subcat ? ' / ' + subcat.name : ''}</p>
            </td>
            <!-- 讲师 -->
            <td class="px-5 py-4">
              <p class="text-sm text-slate-700">${lect?.name || '-'}</p>
            </td>
            <!-- 时长 -->
            <td class="px-5 py-4 text-center">
              <div class="flex flex-col items-center gap-0.5">
                <span class="text-sm text-slate-700">${durationMin > 0 ? durationMin + '分钟' : '0分钟'}</span>
                ${videoCount > 0 ? `<span class="text-xs text-blue-500"><i class="fas fa-video mr-0.5"></i>${videoCount}</span>` : ''}
              </div>
            </td>
            <!-- 观看 -->
            <td class="px-5 py-4 text-center text-sm text-slate-700">${(c.views || 0).toLocaleString()}</td>
            <!-- 点赞 -->
            <td class="px-5 py-4 text-center text-sm text-slate-700">${(function(){
                var ik = 'course_interaction_' + c.id;
                var id = window.DataAPI ? window.DataAPI.get(ik) : null;

                // 如果内存缓存中没有,尝试从 localStorage 直接读取
                if (!id) {
                    try {
                        var stored = localStorage.getItem('learning_platform_data');
                        if (stored) {
                            var parsed = JSON.parse(stored);
                            if (parsed[ik]) {
                                id = parsed[ik];
                            }
                        }
                    } catch(e) { console.warn('读取本地数据失败:', e); }
	                }

	                return (id && id.likes) ? id.likes : (c.likes || 0);
            })()}</td>
            <!-- 评分 -->
            <td class="px-5 py-4 text-center text-sm text-slate-700">${(function(){
                var ik = 'course_interaction_' + c.id;
                var id = window.DataAPI ? window.DataAPI.get(ik) : null;

                // 如果内存缓存中没有,尝试从 localStorage 直接读取
                if (!id) {
                    try {
                        var stored = localStorage.getItem('learning_platform_data');
                        if (stored) {
                            var parsed = JSON.parse(stored);
                            if (parsed[ik]) {
                                id = parsed[ik];
                            }
                        }
                    } catch(e) { console.warn('读取本地数据失败:', e); }
	                }

	                if (id && id.ratingCount > 0) return (id.ratingSum / id.ratingCount).toFixed(1);
                return (c.rating || 0).toFixed(1);
            })()}</td>
            <!-- 状态 -->
            <td class="px-5 py-4 text-center">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${st.class}">${st.text}</span>
            </td>
            <!-- 创建时间 -->
            <td class="px-5 py-4 text-center text-xs text-slate-500">${c.createdAt || '-'}</td>
            <!-- 更新时间 -->
            <td class="px-5 py-4 text-center text-xs text-slate-500">${c.updatedAt || '-'}</td>
            <!-- 操作 -->
            <td class="px-5 py-4 text-center">
              <div class="flex items-center justify-center space-x-1">
                <button onclick="editCourse(${c.id})" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md transition" title="编辑">
                  <i class="fas fa-edit text-sm"></i>
                </button>
                <button onclick="openInteractionEditor(${c.id})" class="p-1.5 text-purple-600 hover:bg-purple-50 rounded-md transition" title="制作互动视频">
                  <i class="fas fa-film text-sm"></i>
                </button>
                <button onclick="openInteractionStats(${c.id})" class="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-md transition" title="互动数据">
                  <i class="fas fa-chart-bar text-sm"></i>
                </button>
                <button onclick="toggleCourseStatus(${c.id})" class="p-1.5 ${c.status === 'published' ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'} rounded-md transition" title="${c.status === 'published' ? '下架' : '发布'}">
                  <i class="fas ${c.status === 'published' ? 'fa-arrow-down' : 'fa-arrow-up'} text-sm"></i>
                </button>
                <button onclick="deleteCourse(${c.id})" class="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition" title="删除">
                  <i class="fas fa-trash text-sm"></i>
                </button>
              </div>
            </td>
          </tr>`;
      }).join('');
    }

    function getFilteredCourses() {
      const search = document.getElementById('course-search').value.toLowerCase();
      const status = document.getElementById('course-status-filter').value;
      const categoryId = document.getElementById('course-category-filter').value;
      return data.courses.filter(c => {
        const matchSearch = !search || c.title.toLowerCase().includes(search);
        const matchStatus = !status || c.status === status;
        const matchCategory = !categoryId || c.categoryId == categoryId;
        return matchSearch && matchStatus && matchCategory;
      });
    }

    function toggleCourseSelect(id) {
      const sid = String(id);
      if (courseSelectedIds.has(sid)) courseSelectedIds.delete(sid);
      else courseSelectedIds.add(sid);
      updateCourseSelectAllState();
      updateCourseBatchActionBar();
    }

    function toggleCourseSelectAll() {
      const checked = document.getElementById('courseSelectAll').checked;
      const visible = getFilteredCourses();
      if (checked) visible.forEach(c => courseSelectedIds.add(String(c.id)));
      else visible.forEach(c => courseSelectedIds.delete(String(c.id)));
      renderCourses();
      updateCourseBatchActionBar();
    }

    function updateCourseSelectAllState() {
      const visible = getFilteredCourses();
      const allChecked = visible.length > 0 && visible.every(c => courseSelectedIds.has(String(c.id)));
      const el = document.getElementById('courseSelectAll');
      if (el) el.checked = allChecked;
    }

    function updateCourseBatchActionBar() {
      const bar = document.getElementById('courseBatchActionBar');
      const count = document.getElementById('courseBatchCount');
      if (!bar || !count) return;
      if (courseSelectedIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = `已选 ${courseSelectedIds.size} 项`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function clearCourseSelection() {
      courseSelectedIds.clear();
      const el = document.getElementById('courseSelectAll');
      if (el) el.checked = false;
      renderCourses();
      updateCourseBatchActionBar();
    }

    async function batchDeleteCourses() {
      const ids = Array.from(courseSelectedIds);
      if (!ids.length) return;
      if (!confirm(`确定删除选中的 ${ids.length} 门课程吗？`)) return;
      let success = 0, fail = 0;
      for (const id of ids) {
        try {
          const ok = await deleteCourse(id, false);
          if (ok) success++; else fail++;
        } catch (e) { fail++; }
      }
      clearCourseSelection();
      await loadAllData();
      renderCourses();
      toast(`删除完成：成功 ${success}，失败 ${fail}`);
    }

    function batchChangeCourseCategory() {
      if (courseSelectedIds.size === 0) return;
      showBatchCategoryPicker('course', async (categoryId) => {
        const ids = Array.from(courseSelectedIds);
        let success = 0, fail = 0;
        for (const id of ids) {
          try {
            const res = await fetch(API + '/courses/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categoryId })
            });
            if (res.ok) success++; else fail++;
          } catch (e) { fail++; }
        }
        toast(`调整分类完成：成功 ${success}，失败 ${fail}`);
        clearCourseSelection();
        await loadAllData();
        renderCourses();
      });
    }

    function formatDuration(seconds) {
      if (!seconds) return '0分钟';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return h > 0 ? `${h}小时${m}分钟` : `${m}分钟`;
    }

    function openCourseModal(course = null) {
      currentModalType = 'course';
      const isEdit = !!course;
      originalCourseCover = course?.cover || '';
      const parentOptions = data.categories.map(c => `<option value="${c.id}" ${course?.categoryId == c.id ? 'selected' : ''}>${c.name}</option>`).join('');
      const lectOptions = data.lecturers.map(l => `<option value="${l.id}" ${course?.lecturerId == l.id ? 'selected' : ''}>${l.name}</option>`).join('');
      const coverUrl = course?.cover || '';
      const selectedCategoryId = course?.categoryId || '';
      const selectedSubcategoryId = course?.subcategoryId || '';

      // 获取当前选中的一级分类下的二级分类
      const selectedCategory = data.categories.find(c => c.id == selectedCategoryId);
      const subcategoryOptions = selectedCategory?.children?.map(s =>
        `<option value="${s.id}" ${course?.subcategoryId == s.id ? 'selected' : ''}>${s.name}</option>`
      ).join('') || '';

      // 已上传的附件
      const attachments = course?.attachments || [];
      const videos = course?.videos || [];

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
            <h3 class="text-lg font-semibold text-slate-800">${isEdit ? '编辑课程' : '添加课程'}</h3>
            <button onclick="closeCourseModal()" class="text-slate-400 hover:text-slate-600 transition"><i class="fas fa-times text-xl"></i></button>
          </div>
          <form onsubmit="saveCourse(event, ${course?.id || 'null'})" class="p-6 space-y-5">
            <!-- 课程封面 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-2">课程封面 <span class="text-red-500">*</span></label>
              <div class="flex items-start space-x-4">
                <div id="cover-preview" class="w-40 h-24 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 cursor-pointer hover:border-indigo-400 transition overflow-hidden" onclick="document.getElementById('c-cover-file').click()">
                  ${coverUrl ? `<img src="${coverUrl}" class="w-full h-full object-cover">` : `<div class="text-center"><i class="fas fa-image text-slate-300 text-2xl mb-1"></i><p class="text-xs text-slate-400">点击上传</p></div>`}
                </div>
                <div class="flex-1">
                  <input type="file" id="c-cover-file" accept="image/*" class="hidden" onchange="handleCoverUpload(this)">
                  <input type="text" id="c-cover" value="${coverUrl}" class="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm" placeholder="或输入封面URL">
                  <p class="text-xs text-slate-400 mt-1">支持 JPG、PNG 格式,建议尺寸 400x225</p>
                </div>
              </div>
            </div>

            <!-- 课程名称 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">课程名称 <span class="text-red-500">*</span></label>
              <input type="text" id="c-title" value="${course?.title || ''}" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="输入课程名称">
            </div>

            <!-- 分类联动 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">一级分类 <span class="text-red-500">*</span></label>
                <select id="c-category" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" onchange="onCategoryChange(this.value)">
                  <option value="">请选择一级分类</option>
                  ${parentOptions}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">二级分类</label>
                <select id="c-subcategory" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">请选择二级分类</option>
                  ${subcategoryOptions}
                </select>
              </div>
            </div>

            <!-- 讲师 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">讲师 <span class="text-red-500">*</span></label>
              <select id="c-lecturer" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">请选择讲师</option>
                ${lectOptions}
              </select>
            </div>

            <!-- 课程描述 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">课程描述</label>
              <textarea id="c-desc" rows="3" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none" placeholder="输入课程描述">${course?.description || ''}</textarea>
            </div>

            <!-- 视频上传 -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-slate-700">课程视频</label>
                <button type="button" onclick="openInteractionEditor(${course?.id || 'null'})" class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg hover:from-purple-600 hover:to-indigo-700 transition" title="为已上传的视频制作互动节点">
                  <i class="fas fa-film mr-1.5"></i>制作互动视频
                </button>
              </div>
              <div id="video-upload-area" class="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-indigo-400 transition cursor-pointer" onclick="document.getElementById('c-video-file').click()">
                <i class="fas fa-video text-slate-400 text-2xl mb-2"></i>
                <p class="text-sm text-slate-500">点击或拖拽上传视频</p>
                <p class="text-xs text-slate-400 mt-1">支持 MP4、MOV、AVI 格式</p>
              </div>
              <input type="file" id="c-video-file" accept="video/*" class="hidden" multiple onchange="handleVideoUpload(this)">
              <div id="video-list" class="mt-3 space-y-2">
                ${videos.map((v, i) => `
                  <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                    <div class="flex items-center space-x-3">
                      <i class="fas fa-play-circle text-blue-500"></i>
                      <span class="text-sm text-slate-700 truncate max-w-xs">${v.title || v.url}</span>
                      ${v.duration ? `<span class="text-xs text-slate-400 ml-1">${formatDuration(Math.round(v.duration))}</span>` : ''}
                    </div>
                    <button type="button" onclick="removeVideo(${i})" class="text-red-500 hover:text-red-700"><i class="fas fa-times"></i></button>
                  </div>
                `).join('')}
              </div>
              <!-- 总时长自动统计 -->
              <div id="video-duration-summary" class="mt-2 px-3 py-2 bg-indigo-50 rounded-lg flex items-center justify-between ${videos.length > 0 ? '' : 'hidden'}">
                <span class="text-sm text-indigo-700"><i class="fas fa-clock mr-1.5"></i>课程总时长</span>
                <span id="total-duration-text" class="text-sm font-semibold text-indigo-700">${formatDuration(videos.reduce((sum, v) => sum + (v.duration || 0), 0))}</span>
              </div>
              <input type="hidden" id="c-videos" value='${JSON.stringify(videos)}'>
            </div>

            <!-- 文档/资料上传 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-2">课程资料(文档、图片等)</label>
              <div id="doc-upload-area" class="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-indigo-400 transition cursor-pointer" onclick="document.getElementById('c-doc-file').click()">
                <i class="fas fa-file-alt text-slate-400 text-2xl mb-2"></i>
                <p class="text-sm text-slate-500">点击或拖拽上传资料</p>
                <p class="text-xs text-slate-400 mt-1">支持 PDF、Word、Excel、图片等(可多选)</p>
              </div>
              <input type="file" id="c-doc-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif" multiple class="hidden" onchange="handleDocUpload(this)">
              <div id="doc-list" class="mt-3 space-y-2">
                ${attachments.map((a, i) => `
                  <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                    <div class="flex items-center space-x-3">
                      <i class="fas ${getDocIcon(a.type)} text-emerald-500"></i>
                      <span class="text-sm text-slate-700 truncate max-w-xs">${a.name || a.url}</span>
                    </div>
                    <button type="button" onclick="removeAttachment(${i})" class="text-red-500 hover:text-red-700"><i class="fas fa-times"></i></button>
                  </div>
                `).join('')}
              </div>
              <input type="hidden" id="c-attachments" value='${JSON.stringify(attachments)}'>
            </div>

            <!-- 状态 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-2">状态</label>
              <div class="flex space-x-4">
                <label class="flex items-center"><input type="radio" name="c-status" value="published" ${(course?.status || 'published') === 'published' ? 'checked' : ''} class="mr-2">发布</label>
                <label class="flex items-center"><input type="radio" name="c-status" value="draft" ${course?.status === 'draft' ? 'checked' : ''} class="mr-2">草稿</label>
                <label class="flex items-center"><input type="radio" name="c-status" value="offline" ${course?.status === 'offline' ? 'checked' : ''} class="mr-2">下架</label>
              </div>
            </div>

            <div class="flex justify-end space-x-3 pt-4 border-t">
              <button type="button" onclick="closeCourseModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition">取消</button>
              <button type="submit" class="btn-primary px-6 py-2.5 text-white rounded-xl font-medium">保存</button>
            </div>
          </form>
        </div>
      `);

      // 初始化拖拽上传
      initDragDrop();
    }

    // 分类联动 - 一级分类变化时更新二级分类
    function onCategoryChange(categoryId) {
      const subcategorySelect = document.getElementById('c-subcategory');
      subcategorySelect.innerHTML = '<option value="">请选择二级分类</option>';

      if (!categoryId) return;

      const category = data.categories.find(c => c.id == categoryId);
      if (category && category.children && category.children.length > 0) {
        category.children.forEach(child => {
          const option = document.createElement('option');
          option.value = child.id;
          option.textContent = child.name;
          subcategorySelect.appendChild(option);
        });
      }
    }

    // 获取文档图标
    function getDocIcon(type) {
      if (!type) return 'fa-file';
      if (type.includes('pdf')) return 'fa-file-pdf text-red-500';
      if (type.includes('word') || type.includes('doc')) return 'fa-file-word text-blue-500';
      if (type.includes('excel') || type.includes('sheet') || type.includes('xls')) return 'fa-file-excel text-green-500';
      if (type.includes('image') || type.includes('jpg') || type.includes('png') || type.includes('gif')) return 'fa-file-image text-purple-500';
      return 'fa-file-alt text-slate-500';
    }

    // 处理课程封面上传
    async function handleCoverUpload(input) {
      const file = input.files[0];
      if (!file) return;

      // 替换前的封面（可能是本次会话临时上传的，也可能是编辑时的原始封面）
      const prevCover = document.getElementById('c-cover').value.trim();

      const formData = new FormData();
      formData.append('file', file);

      try {
        input.disabled = true;
        const response = await fetch(API + '/upload?type=covers', {
          method: 'POST',
          body: formData
        });
        const result = await response.json();

        if (result.success) {
          // 若替换的是本次会话内已上传的临时封面，立即删除旧文件，避免项目里残留孤儿图
          if (prevCover && prevCover !== result.url) {
            const pendingIdx = pendingCourseFiles.findIndex(p => p.url === prevCover && p.type === 'cover');
            if (pendingIdx >= 0) {
              pendingCourseFiles.splice(pendingIdx, 1);
              await deleteUploadFileByUrl(prevCover);
            }
          }
          document.getElementById('c-cover').value = result.url;
          document.getElementById('cover-preview').innerHTML = `<img src="${result.url}" class="w-full h-full object-cover">`;
          pendingCourseFiles.push({ url: result.url, type: 'cover' });
          toast('封面上传成功');
        } else {
          toast(result.error || '上传失败', 'error');
        }
      } catch (err) {
        toast('上传失败', 'error');
      } finally {
        input.disabled = false;
      }
    }

    // 获取视频文件的时长(通过 HTML5 Video API)
    function getVideoDuration(file) {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;

        const url = URL.createObjectURL(file);
        video.src = url;

        video.onloadedmetadata = () => {
          const duration = video.duration;
          URL.revokeObjectURL(url);
          resolve(isFinite(duration) ? Math.round(duration) : 0);
        };

        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(0);
        };

        // 超时保护:5秒内无法读取则返回0
        setTimeout(() => {
          URL.revokeObjectURL(url);
          resolve(0);
        }, 5000);
      });
    }

    // 更新总时长显示
    function updateDurationSummary() {
      const videos = JSON.parse(document.getElementById('c-videos').value || '[]');
      const totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0);
      const summaryEl = document.getElementById('video-duration-summary');
      const textEl = document.getElementById('total-duration-text');
      if (summaryEl) {
        if (videos.length > 0) {
          summaryEl.classList.remove('hidden');
        } else {
          summaryEl.classList.add('hidden');
        }
      }
      if (textEl) {
        textEl.textContent = formatDuration(totalDuration);
      }
    }

    // 处理视频上传(带进度条)
    async function handleVideoUpload(input) {
      const files = Array.from(input.files);
      if (files.length === 0) return;

      const videoList = document.getElementById('video-list');
      const videos = JSON.parse(document.getElementById('c-videos').value || '[]');

      for (const file of files) {
        // 为每个文件创建进度条 UI
        const progressId = 'video-progress-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const progressItem = document.createElement('div');
        progressItem.className = 'bg-slate-50 rounded-lg p-3';
        progressItem.id = progressId;
        progressItem.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-3">
              <i class="fas fa-cloud-upload-alt text-indigo-500 animate-pulse"></i>
              <span class="text-sm text-slate-700 truncate max-w-xs">${file.name}</span>
            </div>
            <span class="text-xs text-slate-400 progress-percent">0%</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div class="progress-bar h-full rounded-full transition-all duration-300 ease-out" style="width: 0%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"></div>
          </div>
          <p class="text-xs text-slate-400 mt-1 progress-status">正在上传...</p>
        `;
        videoList.appendChild(progressItem);

        try {
          const result = await uploadWithProgress(file, 'videos', progressId);

          if (result.success) {
            // 自动识别视频时长
            const videoDuration = await getVideoDuration(file);

            pendingCourseFiles.push({ url: result.url, type: 'video' });

            videos.push({
              url: result.url,
              title: file.name,
              size: result.size,
              type: result.mimetype,
              duration: videoDuration
            });

            const index = videos.length - 1;
            const durationStr = videoDuration > 0 ? formatDuration(videoDuration) : '';
            // 替换进度条为完成状态
            const item = document.getElementById(progressId);
            if (item) {
              item.innerHTML = `
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-3">
                    <i class="fas fa-check-circle text-green-500"></i>
                    <span class="text-sm text-slate-700 truncate max-w-xs">${file.name}</span>
                    ${durationStr ? `<span class="text-xs text-slate-400 ml-1">⏱ ${durationStr}</span>` : ''}
                  </div>
                  <button type="button" onclick="removeVideo(${index})" class="text-red-500 hover:text-red-700"><i class="fas fa-times"></i></button>
                </div>
              `;
              item.id = `video-item-${index}`;
            }
          } else {
            // 上传失败
            const item = document.getElementById(progressId);
            if (item) {
              item.innerHTML = `
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-3">
                    <i class="fas fa-exclamation-circle text-red-500"></i>
                    <span class="text-sm text-red-600 truncate max-w-xs">${file.name} 上传失败</span>
                  </div>
                  <button type="button" onclick="this.closest('.bg-slate-50').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
                </div>
              `;
            }
          }
        } catch (err) {
          console.error('上传失败', err);
          const item = document.getElementById(progressId);
          if (item) {
            item.innerHTML = `
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <i class="fas fa-exclamation-circle text-red-500"></i>
                  <span class="text-sm text-red-600 truncate max-w-xs">${file.name} 上传失败</span>
                </div>
                <button type="button" onclick="this.closest('.bg-slate-50').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
              </div>
            `;
          }
        }
      }

      document.getElementById('c-videos').value = JSON.stringify(videos);
      input.value = '';
      updateDurationSummary();
    }

    // 带 XHR 进度追踪的文件上传
    function uploadWithProgress(file, type, progressId) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);

        // 进度追踪
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            const item = document.getElementById(progressId);
            if (item) {
              const bar = item.querySelector('.progress-bar');
              const pct = item.querySelector('.progress-percent');
              const status = item.querySelector('.progress-status');
              if (bar) bar.style.width = percent + '%';
              if (pct) pct.textContent = percent + '%';
              if (status) {
                if (percent >= 100) {
                  status.textContent = '正在处理...';
                } else {
                  const loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
                  const totalMB = (e.total / 1024 / 1024).toFixed(1);
                  status.textContent = `${loadedMB}MB / ${totalMB}MB`;
                }
              }
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          } else {
            reject(new Error('上传失败: ' + xhr.status));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.addEventListener('abort', () => reject(new Error('上传已取消')));

        xhr.open('POST', API + '/upload?type=' + type);
        xhr.send(formData);
      });
    }

    // 处理文档上传(支持批量,带进度条)
    async function handleDocUpload(input) {
      const files = Array.from(input.files);
      if (files.length === 0) return;

      const docList = document.getElementById('doc-list');
      const attachments = JSON.parse(document.getElementById('c-attachments').value || '[]');

      for (const file of files) {
        // 根据文件类型选择上传目录
        let uploadType = 'documents';
        if (file.type.startsWith('image/')) {
          uploadType = 'images';
        }

        // 为每个文件创建进度条 UI
        const progressId = 'doc-progress-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const progressItem = document.createElement('div');
        progressItem.className = 'bg-slate-50 rounded-lg p-3';
        progressItem.id = progressId;
        progressItem.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-3">
              <i class="fas fa-cloud-upload-alt text-emerald-500 animate-pulse"></i>
              <span class="text-sm text-slate-700 truncate max-w-xs">${file.name}</span>
            </div>
            <span class="text-xs text-slate-400 progress-percent">0%</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div class="progress-bar h-full rounded-full transition-all duration-300 ease-out" style="width: 0%; background: linear-gradient(135deg, #34d399 0%, #10b981 100%);"></div>
          </div>
        `;
        docList.appendChild(progressItem);

        try {
          const result = await uploadWithProgress(file, uploadType, progressId);

          if (result.success) {
            pendingCourseFiles.push({ url: result.url, type: 'attachment' });

            attachments.push({
              url: result.url,
              name: file.name,
              size: result.size,
              type: result.mimetype
            });

            const index = attachments.length - 1;
            const item = document.getElementById(progressId);
            if (item) {
              item.innerHTML = `
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-3">
                    <i class="fas ${getDocIcon(file.type)}"></i>
                    <span class="text-sm text-slate-700 truncate max-w-xs">${file.name}</span>
                  </div>
                  <button type="button" onclick="removeAttachment(${index})" class="text-red-500 hover:text-red-700"><i class="fas fa-times"></i></button>
                </div>
              `;
              item.id = `doc-item-${index}`;
            }
          } else {
            const item = document.getElementById(progressId);
            if (item) {
              item.innerHTML = `
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-3">
                    <i class="fas fa-exclamation-circle text-red-500"></i>
                    <span class="text-sm text-red-600 truncate max-w-xs">${file.name} 上传失败</span>
                  </div>
                  <button type="button" onclick="this.closest('.bg-slate-50').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
                </div>
              `;
            }
          }
        } catch (err) {
          console.error('上传失败', err);
          const item = document.getElementById(progressId);
          if (item) {
            item.innerHTML = `
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <i class="fas fa-exclamation-circle text-red-500"></i>
                  <span class="text-sm text-red-600 truncate max-w-xs">${file.name} 上传失败</span>
                </div>
                <button type="button" onclick="this.closest('.bg-slate-50').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
              </div>
            `;
          }
        }
      }

      document.getElementById('c-attachments').value = JSON.stringify(attachments);
      input.value = '';
    }

    // 删除视频
    function removeVideo(index) {
      const videos = JSON.parse(document.getElementById('c-videos').value || '[]');
      videos.splice(index, 1);
      document.getElementById('c-videos').value = JSON.stringify(videos);
      const item = document.getElementById(`video-item-${index}`);
      if (item) item.remove();
      // 重新渲染列表
      renderVideoList(videos);
      updateDurationSummary();
    }

    // 删除附件
    function removeAttachment(index) {
      const attachments = JSON.parse(document.getElementById('c-attachments').value || '[]');
      attachments.splice(index, 1);
      document.getElementById('c-attachments').value = JSON.stringify(attachments);
      const item = document.getElementById(`doc-item-${index}`);
      if (item) item.remove();
      // 重新渲染列表
      renderAttachmentList(attachments);
    }

    // 渲染视频列表
    function renderVideoList(videos) {
      const videoList = document.getElementById('video-list');
      if (!videoList) return;
      videoList.innerHTML = videos.map((v, i) => `
        <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3" id="video-item-${i}">
          <div class="flex items-center space-x-3">
            <i class="fas fa-play-circle text-blue-500"></i>
            <span class="text-sm text-slate-700 truncate max-w-xs">${v.title || v.url}</span>
            ${v.duration ? `<span class="text-xs text-slate-400 ml-1">⏱ ${formatDuration(Math.round(v.duration))}</span>` : ''}
          </div>
          <button type="button" onclick="removeVideo(${i})" class="text-red-500 hover:text-red-700"><i class="fas fa-times"></i></button>
        </div>
      `).join('');
    }

    // 渲染附件列表
    function renderAttachmentList(attachments) {
      const docList = document.getElementById('doc-list');
      if (!docList) return;
      docList.innerHTML = attachments.map((a, i) => `
        <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3" id="doc-item-${i}">
          <div class="flex items-center space-x-3">
            <i class="fas ${getDocIcon(a.type)} text-emerald-500"></i>
            <span class="text-sm text-slate-700 truncate max-w-xs">${a.name || a.url}</span>
          </div>
          <button type="button" onclick="removeAttachment(${i})" class="text-red-500 hover:text-red-700"><i class="fas fa-times"></i></button>
        </div>
      `).join('');
    }

    // 初始化拖拽上传
    function initDragDrop() {
      ['video-upload-area', 'doc-upload-area'].forEach(areaId => {
        const area = document.getElementById(areaId);
        if (!area) return;

        area.addEventListener('dragover', (e) => {
          e.preventDefault();
          area.classList.add('border-indigo-400', 'bg-indigo-50');
        });

        area.addEventListener('dragleave', (e) => {
          e.preventDefault();
          area.classList.remove('border-indigo-400', 'bg-indigo-50');
        });

        area.addEventListener('drop', (e) => {
          e.preventDefault();
          area.classList.remove('border-indigo-400', 'bg-indigo-50');

          const files = e.dataTransfer.files;
          if (files.length > 0) {
            const inputId = areaId === 'video-upload-area' ? 'c-video-file' : 'c-doc-file';
            const input = document.getElementById(inputId);
            const dataTransfer = new DataTransfer();
            files.forEach(f => dataTransfer.items.add(f));
            input.files = dataTransfer.files;

            if (areaId === 'video-upload-area') {
              handleVideoUpload(input);
            } else {
              handleDocUpload(input);
            }
          }
        });
      });
    }

    async function saveCourse(e, id) {
      e.preventDefault();
      const categorySelect = document.getElementById('c-category');
      const subcategorySelect = document.getElementById('c-subcategory');
      const lecturerSelect = document.getElementById('c-lecturer');

      const title = document.getElementById('c-title').value.trim();
      if (!title) {
        toast('请输入课程名称', 'error');
        return;
      }

      const categoryId = categorySelect.value ? parseInt(categorySelect.value) : null;
      if (!categoryId) {
        toast('请选择一级分类', 'error');
        return;
      }

      const subcategoryId = subcategorySelect.value ? parseInt(subcategorySelect.value) : null;
      const lecturerId = lecturerSelect.value ? parseInt(lecturerSelect.value) : null;
      if (!lecturerId) {
        toast('请选择讲师', 'error');
        return;
      }

      // 安全解析 videos 和 attachments
      let videos = [];
      try { videos = JSON.parse(document.getElementById('c-videos').value || '[]'); } catch(e) { videos = []; }
      let attachments = [];
      try { attachments = JSON.parse(document.getElementById('c-attachments').value || '[]'); } catch(e) { attachments = []; }

      // 自动计算课程总时长(所有视频时长之和)
      const totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0);

      // 编辑时继承原课程的浏览量和评分,避免被清零
      const existingCourse = id ? (data.courses.find(c => String(c.id) === String(id)) || {}) : {};

      const formData = {
        title,
        cover: document.getElementById('c-cover').value.trim() || 'https://via.placeholder.com/400x225',
        categoryId,
        subcategoryId,
        lecturerId,
        description: document.getElementById('c-desc').value.trim(),
        status: document.querySelector('input[name="c-status"]:checked')?.value || 'draft',
        videos,
        attachments,
        duration: totalDuration
      };
      // 编辑时继承原课程的浏览量和评分；若原数据没有这些字段，则不覆盖，让后端保留计算值
      if (id && existingCourse) {
        if (existingCourse.views !== undefined) formData.views = existingCourse.views;
        if (existingCourse.rating !== undefined) formData.rating = existingCourse.rating;
      } else {
        formData.views = 0;
        formData.rating = 0;
      }

      // 禁用保存按钮,防止重复提交
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>保存中...';
      }

      try {
        let res, result;
        if (id) {
          res = await fetch(API + '/courses/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        } else {
          res = await fetch(API + '/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        }
        result = await res.json();

        if (result.success || res.ok) {
          // 编辑时若封面被替换，清理原来的项目文件图片
          const newCover = document.getElementById('c-cover').value.trim();
          if (id && originalCourseCover && originalCourseCover !== newCover) {
            await deleteUploadFileByUrl(originalCourseCover);
          }
          pendingCourseFiles = [];
          toast(id ? '课程已更新' : '课程已添加');
          closeCourseModal();
          await loadAllData();
          renderCourses();
          // 广播课程变更,通知其他页面(如播放页)刷新数据
          try {
            localStorage.setItem('youyan_academy_sync', JSON.stringify({
              type: 'courses', timestamp: Date.now(), source: '/dashboard.html'
            }));
          } catch(e) { console.warn('同步广播失败:', e); }
        } else {
          toast(result.error || '操作失败', 'error');
        }
      } catch (err) {
        console.error('保存课程失败:', err);
        toast('保存失败: ' + (err.message || '网络错误'), 'error');
      } finally {
        // 恢复按钮
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '保存';
        }
      }
    }

    function editCourse(id) {
      const course = data.courses.find(c => c.id === id);
      if (course) openCourseModal(course);
    }

    function closeCourseModal() {
      pendingCourseFiles.forEach(item => deleteUploadFileByUrl(item.url));
      pendingCourseFiles = [];
      originalCourseCover = '';
      currentModalType = null;
      closeModal();
    }

    async function toggleCourseStatus(id) {
      const course = data.courses.find(c => c.id === id);
      if (!course) return;
      const newStatus = course.status === 'published' ? 'offline' : 'published';
      try {
        const res = await fetch(API + '/courses/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...course, status: newStatus })
        });
        const result = await res.json();
        if (result.success || res.ok) {
          toast(newStatus === 'published' ? '课程已发布' : '课程已下架');
          await loadAllData();
          renderCourses();
          try { localStorage.setItem('youyan_academy_sync', JSON.stringify({ type: 'courses', timestamp: Date.now(), source: '/dashboard.html' })); } catch(e) { console.warn('同步广播失败:', e); }
        }      } catch (err) {
        toast('操作失败', 'error');
      }
    }

    async function deleteCourse(id, askConfirm = true) {
      if (askConfirm && !confirm('确定删除这门课程吗？相关视频、课件、评分、学习进度等将一并清理。')) return false;
      try {
        const res = await fetch(API + '/courses/' + id, { method: 'DELETE' });
        const result = await res.json();
        if (result.success || res.ok) {
          if (askConfirm) {
            toast('课程已删除');
            await loadAllData();
            renderCourses();
            try { localStorage.setItem('youyan_academy_sync', JSON.stringify({ type: 'courses', timestamp: Date.now(), source: '/dashboard.html' })); } catch(e) { console.warn('同步广播失败:', e); }
          }
          return true;
        } else {
          if (askConfirm) toast(result.error || '删除失败', 'error');
          return false;
        }
      } catch (err) {
        if (askConfirm) toast('删除失败', 'error');
        return false;
      }
    }

    // ========== 分类管理 ==========
    function renderCategories() {
      document.getElementById('cat-parent-count').textContent = data.categories.length;
      const childCount = data.categories.reduce((sum, c) => sum + (c.children?.length || 0), 0);
      document.getElementById('cat-child-count').textContent = childCount;
      document.getElementById('cat-course-count').textContent = data.courses.length;

      if (data.categories.length === 0) {
        document.getElementById('category-list').innerHTML = `
          <div class="col-span-2 bg-white rounded-2xl p-12 text-center text-slate-400">
            <i class="fas fa-folder-open text-4xl mb-4"></i>
            <p>暂无分类数据</p>
          </div>`;
        return;
      }

      document.getElementById('category-list').innerHTML = data.categories.map(cat => `
        <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div class="p-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <i class="fas ${cat.icon || 'fa-folder'} text-xl"></i>
                <div>
                  <span class="font-semibold">${cat.name}</span>
                  <span class="text-xs opacity-75 ml-2">${cat.key || ''}</span>
                </div>
              </div>
              <div class="flex items-center space-x-2">
                <button onclick="openCategoryModal('child', ${cat.id})" class="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition" title="添加子分类">
                  <i class="fas fa-plus"></i>
                </button>
                <button onclick="editCategory(${cat.id})" class="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition" title="编辑">
                  <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteCategory(${cat.id})" class="p-2 bg-white/20 hover:bg-red-500 rounded-lg transition" title="删除">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="p-4">
            <p class="text-xs text-slate-400 mb-3">子分类 (${cat.children?.length || 0})</p>
            <div class="flex flex-wrap gap-2">
              ${(cat.children || []).map(child => `
                <span class="inline-flex items-center px-3 py-1.5 bg-slate-100 rounded-lg text-sm">
                  ${child.name}
                  <button onclick="editCategory(${cat.id}, ${child.id})" class="ml-2 text-slate-400 hover:text-blue-500"><i class="fas fa-edit text-xs"></i></button>
                  <button onclick="deleteCategory(${cat.id}, ${child.id})" class="ml-1 text-slate-400 hover:text-red-500"><i class="fas fa-times text-xs"></i></button>
                </span>
              `).join('') || '<span class="text-slate-400 text-sm">暂无子分类</span>'}
            </div>
          </div>
        </div>
      `).join('');

      // 同步更新站点管理子标签的分类列表
      renderPortalCategories();
    }

    // renderPortalCategories - 站点管理子标签用(精简列表风格)
    function renderPortalCategories() {
      const container = document.getElementById('portal-category-list');
      if (!container) return;

      if (data.categories.length === 0) {
        container.innerHTML = `
          <div class="bg-white rounded-xl shadow-sm p-8 text-center text-slate-400">
            <i class="fas fa-folder-open text-3xl mb-2 block"></i>
            <p>暂无分类,点击右上角按钮添加</p>
          </div>`;
        return;
      }

      container.innerHTML = data.categories.map((cat, idx) => {
        const colorMap = ['indigo', 'pink', 'emerald', 'orange', 'purple', 'blue', 'teal', 'red'];
        const color = colorMap[idx % colorMap.length];
        const childCount = cat.children?.length || 0;
        return `
          <div class="bg-white rounded-xl shadow-sm p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 bg-${color}-100 rounded-lg flex items-center justify-center text-${color}-600 font-bold text-sm">${idx + 1}</span>
                <span class="font-medium text-slate-800">${cat.name}</span>
                ${cat.key ? `<span class="text-xs text-slate-400">(${cat.key})</span>` : ''}
              </div>
              <div class="flex items-center gap-1.5">
                <button onclick="openCategoryModal('child', ${cat.id})" class="w-7 h-7 bg-green-50 hover:bg-green-100 rounded-full flex items-center justify-center text-green-600 transition" title="添加二级分类">
                  <i class="fas fa-plus text-xs"></i>
                </button>
                <button onclick="editCategory(${cat.id})" class="w-7 h-7 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-600 transition" title="编辑分类">
                  <i class="fas fa-edit text-xs"></i>
                </button>
                <button onclick="deleteCategory(${cat.id})" class="w-7 h-7 bg-red-50 hover:bg-red-100 rounded-full flex items-center justify-center text-red-600 transition" title="删除分类">
                  <i class="fas fa-trash text-xs"></i>
                </button>
              </div>
            </div>
            ${childCount > 0 ? `
              <div class="flex flex-wrap gap-2 pl-11">
                ${cat.children.map(child => `
                  <span class="inline-flex items-center px-2.5 py-0.5 bg-${color}-50 text-${color}-600 rounded-full text-xs">
                    ${child.name}
                    <button onclick="editCategory(${cat.id}, ${child.id})" class="ml-1.5 hover:text-${color}-800"><i class="fas fa-edit text-[10px]"></i></button>
                    <button onclick="deleteCategory(${cat.id}, ${child.id})" class="ml-0.5 hover:text-red-500"><i class="fas fa-times text-[10px]"></i></button>
                  </span>
                `).join('')}
              </div>
            ` : '<p class="pl-11 text-xs text-slate-400">暂无子分类</p>'}
          </div>`;
      }).join('');
    }

    function openCategoryModal(type, parentId = null, child = null) {
      const isChild = type === 'child';
      const parentCat = parentId ? data.categories.find(c => c.id === parentId) : null;

      let modalContent = `
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-semibold text-slate-800">${child ? '编辑' : '添加'}${isChild ? '二级' : '一级'}分类</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <form onsubmit="saveCategory(event, '${type}', ${parentId || 'null'}, ${child?.id || 'null'})" class="p-6 space-y-4">
            ${isChild && parentCat ? `<div><label class="block text-sm text-slate-500 mb-1">父分类</label><p class="font-medium">${parentCat.name}</p></div>` : ''}
            ${!isChild ? `
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">分类名称 <span class="text-red-500">*</span></label>
                <input type="text" id="cat-name" value="${child?.name || ''}" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">标识(key)</label>
                <input type="text" id="cat-key" value="${child?.key || parentCat?.key || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="如: frontend">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">图标</label>
                <div class="flex flex-wrap gap-2">
                  ${['fa-sitemap', 'fa-code', 'fa-paint-brush', 'fa-line-chart', 'fa-users', 'fa-book', 'fa-gamepad', 'fa-chart-bar'].map(icon => `
                    <button type="button" onclick="selectIcon(this, '${icon}')" class="icon-btn w-10 h-10 rounded-lg border ${(child?.key || parentCat?.icon) === icon ? 'bg-indigo-100 border-indigo-500' : 'border-slate-200'} flex items-center justify-center hover:border-indigo-300">
                      <i class="fas ${icon}"></i>
                    </button>
                  `).join('')}
                </div>
                <input type="hidden" id="cat-icon" value="${parentCat?.icon || 'fa-folder'}">
              </div>
            ` : `
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">分类名称 <span class="text-red-500">*</span></label>
                <input type="text" id="cat-child-name" value="${child?.name || ''}" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">标识(key)</label>
                <input type="text" id="cat-child-key" value="${child?.key || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="如: game-planning">
              </div>
            `}
            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" onclick="closeModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">取消</button>
              <button type="submit" class="btn-primary px-6 py-2.5 text-white rounded-xl font-medium">保存</button>
            </div>
          </form>
        </div>`;

      showModal(modalContent);
    }

    function selectIcon(btn, icon) {
      document.querySelectorAll('.icon-btn').forEach(b => {
        b.classList.remove('bg-indigo-100', 'border-indigo-500');
        b.classList.add('border-slate-200');
      });
      btn.classList.add('bg-indigo-100', 'border-indigo-500');
      btn.classList.remove('border-slate-200');
      document.getElementById('cat-icon').value = icon;
    }

    async function saveCategory(e, type, parentId, childId) {
      e.preventDefault();

      try {
        if (type === 'parent') {
          const name = document.getElementById('cat-name').value.trim();
          const key = document.getElementById('cat-key').value.trim();
          const icon = document.getElementById('cat-icon').value;

          if (childId) {
            // 编辑一级分类
            const cat = data.categories.find(c => c.id === parentId);
            if (!cat) return;
            const res = await fetch(API + '/categories/' + parentId, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...cat, name, key, icon })
            });
            if (res.ok) {
              toast('分类已更新');
              closeModal();
              await loadAllData();
              renderCategories();
              // 额外广播一次,确保其他页面收到通知
              if (window.DataSync) {
                window.DataSync.broadcast(DataSync.EventTypes.CATEGORIES);
              }
            }
          } else {
            // 新增一级分类
            const res = await fetch(API + '/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, key, icon, children: [] })
            });
            if (res.ok) {
              toast('分类已添加');
              closeModal();
              await loadAllData();
              renderCategories();
              // 额外广播一次,确保其他页面收到通知
              if (window.DataSync) {
                window.DataSync.broadcast(DataSync.EventTypes.CATEGORIES);
              }
            }
          }
        } else {
          // 子分类
          const name = document.getElementById('cat-child-name').value.trim();
          const key = document.getElementById('cat-child-key').value.trim();
          const parent = data.categories.find(c => c.id === parentId);
          if (!parent) return;

          if (childId) {
            // 编辑子分类
            const child = parent.children.find(c => c.id === childId);
            if (child) { child.name = name; child.key = key; }
          } else {
            // 新增子分类
            parent.children = parent.children || [];
            parent.children.push({ id: Date.now(), name, key });
          }

          const res = await fetch(API + '/categories/' + parentId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parent)
          });
          if (res.ok) {
            toast('子分类已保存');
            closeModal();
            await loadAllData();
            renderCategories();
            // 额外广播一次,确保其他页面收到通知
            if (window.DataSync) {
              window.DataSync.broadcast(DataSync.EventTypes.CATEGORIES);
            }
          }
        }
      } catch (err) {
        console.error('保存分类失败:', err);
        toast('操作失败', 'error');
      }
    }

    function editCategory(parentId, childId) {
      if (!childId) {
        const cat = data.categories.find(c => c.id === parentId);
        if (cat) openCategoryModal('parent', parentId, cat);
      } else {
        const parent = data.categories.find(c => c.id === parentId);
        const child = parent?.children?.find(c => c.id === childId);
        if (child) openCategoryModal('child', parentId, child);
      }
    }

    async function deleteCategory(parentId, childId) {
      if (!confirm('确定删除该分类吗？其下子分类将一并删除；若存在课程将无法删除。')) return;

      try {
        if (!childId) {
          // 删除一级分类
          if (data.courses.some(c => String(c.categoryId) === String(parentId))) {
            toast('该分类下有课程，不能删除', 'error');
            return;
          }
          const res = await fetch(API + '/categories/' + parentId, { method: 'DELETE' });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result.success !== false) {
            toast('分类已删除');
            await loadAllData();
            renderCategories();
            // 广播通知其他页面
            if (window.DataSync) {
              window.DataSync.broadcast(DataSync.EventTypes.CATEGORIES);
            }
          } else {
            toast(result.error || '删除失败', 'error');
          }
        } else {
          // 删除子分类
          const parent = data.categories.find(c => c.id === parentId);
          if (data.courses.some(c => String(c.subcategoryId) === String(childId))) {
            toast('该分类下有课程，不能删除', 'error');
            return;
          }
          parent.children = parent.children.filter(c => c.id !== childId);
          const res = await fetch(API + '/categories/' + parentId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parent)
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result.success !== false) {
            toast('子分类已删除');
            await loadAllData();
            renderCategories();
            // 广播通知其他页面
            if (window.DataSync) {
              window.DataSync.broadcast(DataSync.EventTypes.CATEGORIES);
            }
          } else {
            toast(result.error || '删除失败', 'error');
          }
        }
      } catch (err) {
        console.error('删除分类失败:', err);
        toast('删除失败', 'error');
      }
    }

    // ========== 讲师管理 ==========
    function renderLecturers() {
      try {
        console.log('开始渲染讲师列表,讲师数量:', data.lecturers.length);

        // 搜索和筛选
        const searchEl = document.getElementById('lecturer-search');
        const statusEl = document.getElementById('lecturer-status-filter');
        const levelEl = document.getElementById('lecturer-level-filter');
        const search = searchEl ? searchEl.value.toLowerCase() : '';
        const status = statusEl ? statusEl.value : '';
        const level = levelEl ? levelEl.value : '';

        let filtered = data.lecturers.filter(l => {
          const matchSearch = !search || (
            (l.name && l.name.toLowerCase().includes(search)) ||
            (l.department && l.department.toLowerCase().includes(search)) ||
            (l.position && l.position.toLowerCase().includes(search))
          );
          const matchStatus = !status || l.status === status;
          const matchLevel = !level || l.level === level;
          return matchSearch && matchStatus && matchLevel;
        });

        const tbody = document.getElementById('lecturer-list');
        const countEl = document.getElementById('lecturer-count');

        if (!tbody) {
          console.error('讲师列表tbody元素不存在');
          return;
        }

        if (data.lecturers.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="12" class="px-6 py-12 text-center text-slate-400">
                <i class="fas fa-chalkboard-teacher text-4xl mb-4"></i>
                <p>暂无讲师数据</p>
              </td>
            </tr>`;
          countEl.textContent = '0';
          console.log('讲师列表为空');
          return;
        }

      const levelMap = {
        senior: { class: 'bg-blue-100 text-blue-700', text: '高级讲师' },
        intermediate: { class: 'bg-emerald-100 text-emerald-700', text: '中级讲师' },
        junior: { class: 'bg-slate-100 text-slate-600', text: '初级讲师' },
        intern: { class: 'bg-orange-100 text-orange-700', text: '见习讲师' }
      };

      countEl.textContent = String(filtered.length);

      tbody.innerHTML = filtered.map(lect => {
        const lv = levelMap[lect.level] || levelMap.junior;
        const courseCount = lect.courseCount ?? data.courses.filter(c => c.lecturerId === lect.id).length;
        const totalPayment = (data.lecturer_payment_records || [])
          .filter(r => String(r.lecturerId) === String(lect.id))
          .reduce((s, r) => s + (Number(r.bonus) || 0), 0);
        const yearsAsInstructor = lect.yearsAsInstructor;
        const skills = lect.skills || [];
        const skillsHtml = skills.length > 0 ?
          skills.map(skill => `<span class="inline-block px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-600 mr-1 mb-1">${skill}</span>`).join('') :
          '<span class="text-xs text-slate-400">-</span>';

        const checked = lecturerSelectedIds.has(String(lect.id)) ? 'checked' : '';
        return `
          <tr class="hover:bg-slate-50 transition" data-lecturer-id="${lect.id}">
            <td class="pl-5 pr-2 py-4 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" class="lecturer-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleLecturerSelect('${lect.id}')" ${checked}>
            </td>
            <td class="px-4 py-4">
              <div class="flex items-center gap-3 cursor-pointer" onclick="showLecturerDetail(${lect.id})">
                <img src="${lect.avatar || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full object-cover border border-slate-200">
                <span class="font-medium text-slate-800 hover:text-indigo-600">${lect.name}</span>
              </div>
            </td>
            <td class="px-4 py-4 text-sm text-slate-600">
              ${lect.department || '-'}
            </td>
            <td class="px-4 py-4 text-sm text-slate-600">
              ${lect.title || '-'}
            </td>
            <td class="px-4 py-4 text-center text-sm text-slate-600">
              ${yearsAsInstructor !== null && yearsAsInstructor !== undefined ? `<span class="font-medium">${yearsAsInstructor} 年</span>` : '<span class="text-slate-400">-</span>'}
            </td>
            <td class="px-4 py-4 text-center">
              <span class="px-3 py-1 rounded-full text-xs font-medium ${lv.class}">${lv.text}</span>
            </td>
            <td class="px-4 py-4">
              <div class="flex flex-wrap gap-1 max-w-[200px]">
                ${skillsHtml}
              </div>
            </td>
            <td class="px-4 py-4 text-center text-sm text-slate-600">
              <span class="font-medium">${courseCount}</span>
            </td>
            <td class="px-4 py-4 text-center text-sm cursor-pointer hover:bg-slate-100 rounded-lg" onclick="openPaymentRecordsModal(${lect.id})">
              <span class="font-medium text-emerald-600">¥${Number(totalPayment).toLocaleString()}</span>
            </td>
            <td class="px-4 py-4 text-center text-sm text-slate-600">
              ${lect.regDate || '-'}
            </td>
            <td class="px-4 py-4 text-center">
              <span class="px-3 py-1 rounded-full text-xs font-medium ${
                lect.status === 'enabled'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }">
                ${lect.status === 'enabled' ? '启用' : '禁用'}
              </span>
            </td>
            <td class="px-4 py-4 text-center">
              <div class="flex items-center justify-center gap-2">
                <button onclick="openPaymentRecordsModal(${lect.id})"
                  class="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition" title="课酬结算">
                  <i class="fas fa-money-bill-wave"></i>
                </button>
                <button onclick="editLecturer(${lect.id})"
                  class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition" title="编辑">
                  <i class="fas fa-edit"></i>
                </button>
                <button onclick="toggleLecturerStatus(${lect.id})"
                  class="p-2 ${lect.status === 'enabled' ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'} rounded-lg transition"
                  title="${lect.status === 'enabled' ? '禁用' : '启用'}">
                  <i class="fas ${lect.status === 'enabled' ? 'fa-ban' : 'fa-check'}"></i>
                </button>
                <button onclick="deleteLecturer(${lect.id})"
                  class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition" title="删除">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>`;
      }).join('');

      countEl.textContent = data.lecturers.length;
      console.log('讲师列表渲染完成');
    } catch (error) {
      console.error('渲染讲师列表失败:', error);
      toast('讲师列表渲染失败: ' + error.message, 'error');
    }
    }

    function toggleLecturerSelect(id) {
      const sid = String(id);
      if (lecturerSelectedIds.has(sid)) lecturerSelectedIds.delete(sid);
      else lecturerSelectedIds.add(sid);
      updateLecturerSelectAllState();
      updateLecturerBatchActionBar();
    }

    function toggleLecturerSelectAll() {
      const checked = document.getElementById('lecturerSelectAll').checked;
      if (checked) data.lecturers.forEach(l => lecturerSelectedIds.add(String(l.id)));
      else data.lecturers.forEach(l => lecturerSelectedIds.delete(String(l.id)));
      renderLecturers();
      updateLecturerBatchActionBar();
    }

    function updateLecturerSelectAllState() {
      const allChecked = data.lecturers.length > 0 && data.lecturers.every(l => lecturerSelectedIds.has(String(l.id)));
      const el = document.getElementById('lecturerSelectAll');
      if (el) el.checked = allChecked;
    }

    function updateLecturerBatchActionBar() {
      const bar = document.getElementById('lecturerBatchActionBar');
      const count = document.getElementById('lecturerBatchCount');
      if (!bar || !count) return;
      if (lecturerSelectedIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = `已选 ${lecturerSelectedIds.size} 项`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function clearLecturerSelection() {
      lecturerSelectedIds.clear();
      const el = document.getElementById('lecturerSelectAll');
      if (el) el.checked = false;
      renderLecturers();
      updateLecturerBatchActionBar();
    }

    async function batchDeleteLecturers() {
      const ids = Array.from(lecturerSelectedIds);
      if (!ids.length) return;
      if (!confirm(`确定删除选中的 ${ids.length} 位讲师吗？`)) return;
      let success = 0, fail = 0;
      for (const id of ids) {
        try {
          const ok = await deleteLecturer(id, false);
          if (ok) success++; else fail++;
        } catch (e) { fail++; }
      }
      clearLecturerSelection();
      await loadAllData();
      renderLecturers();
      toast(`删除完成：成功 ${success}，失败 ${fail}`);
    }

    // ========== 讲师课酬结算 ==========
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function openPaymentRecordsModal(lecturerId) {
      const lect = (data.lecturers || []).find(l => l.id === lecturerId);
      if (!lect) return;

      const records = (data.lecturer_payment_records || [])
        .filter(r => String(r.lecturerId) === String(lecturerId))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      const levelMap = { senior: '高级讲师', intermediate: '中级讲师', junior: '初级讲师', intern: '见习讲师' };
      const totalBonus = records.reduce((s, r) => s + (Number(r.bonus) || 0), 0);

      const rowsHtml = records.map(r => {
        let project = '-';
        if (r.type === 'course') {
          const c = (data.courses || []).find(c => String(c.id) === String(r.courseId));
          project = c ? `<span class="text-slate-700">${escapeHtml(c.title)}</span>` : '<span class="text-slate-400">课程已删除</span>';
        } else if (r.type === 'training') {
          const t = (data.training || []).find(t => String(t.id) === String(r.trainingId));
          project = t ? `<span class="text-slate-700">${escapeHtml(t.name)}</span>` : '<span class="text-slate-400">培训已删除</span>';
        } else if (r.type === 'manual') {
          project = `<span class="text-slate-700">${escapeHtml(r.manualText || '')}</span>`;
        }
        return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 text-sm text-slate-700">${r.date || '-'}</td>
            <td class="px-4 py-3 text-sm">${project}</td>
            <td class="px-4 py-3 text-sm text-center">${r.averageRating !== null && r.averageRating !== undefined ? `<span class="font-medium text-amber-600">${r.averageRating}</span>` : '<span class="text-slate-400">-</span>'}</td>
            <td class="px-4 py-3 text-sm text-center font-medium text-emerald-600">¥${Number(r.bonus || 0).toLocaleString()}</td>
            <td class="px-4 py-3 text-center">
              <button onclick="deletePaymentRecord(${r.id}, ${lect.id})" class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition" title="删除"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`;
      }).join('');

      const emptyHtml = `
        <tr>
          <td colspan="5" class="px-6 py-12 text-center text-slate-400">
            <i class="fas fa-file-invoice-dollar text-4xl mb-4"></i>
            <p>暂无课酬记录</p>
          </td>
        </tr>`;

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <div>
              <h3 class="text-lg font-semibold text-slate-800">${lect.name} - 课酬结算</h3>
              <p class="text-xs text-slate-400 mt-1">${lect.department || ''} · ${levelMap[lect.level] || lect.levelName || ''}</p>
            </div>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-6 overflow-y-auto flex-1">
            <div class="overflow-x-auto rounded-xl border border-slate-200 mb-4">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th class="px-4 py-3 text-left font-semibold">授课日期</th>
                    <th class="px-4 py-3 text-left font-semibold">项目</th>
                    <th class="px-4 py-3 text-center font-semibold">课程评分平均值</th>
                    <th class="px-4 py-3 text-center font-semibold">课酬奖金</th>
                    <th class="px-4 py-3 text-center font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">${records.length > 0 ? rowsHtml : emptyHtml}</tbody>
              </table>
            </div>
            <div class="bg-slate-50 rounded-xl p-4 text-center">
              <p class="text-xs text-slate-500 mb-1">累计课酬</p>
              <p class="text-xl font-bold text-indigo-600">¥${Number(totalBonus).toLocaleString()}</p>
            </div>
          </div>
          <div class="flex justify-end space-x-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
            <button type="button" onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm">关闭</button>
            <button type="button" onclick="openPaymentRecordForm(${lect.id})" class="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium"><i class="fas fa-plus mr-1"></i>新增记录</button>
          </div>
        </div>
      `);
    }

    function openPaymentRecordForm(lecturerId) {
      const lect = (data.lecturers || []).find(l => l.id === lecturerId);
      if (!lect) return;

      const today = new Date().toISOString().split('T')[0];
      const trainingOptions = (data.training || []).map(t => `<option value="${escapeHtml(t.name)}" data-id="${t.id}">${escapeHtml(t.name)}</option>`).join('');

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-semibold text-slate-800">新增课酬记录 - ${lect.name}</h3>
            <button onclick="openPaymentRecordsModal(${lect.id})" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <form onsubmit="savePaymentRecord(event, ${lect.id})" class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">授课日期 <span class="text-red-500">*</span></label>
              <input type="date" id="pr-date" value="${today}" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">关联培训/项目 <span class="text-red-500">*</span></label>
              <input type="text" id="pr-project" list="pr-training-list" oninput="handlePaymentProjectInput()" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="选择培训或手动填写">
              <datalist id="pr-training-list">${trainingOptions}</datalist>
              <input type="hidden" id="pr-training-id">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">课程评分平均值</label>
                <input type="number" id="pr-rating" step="0.1" min="0" max="5" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="自动填充，可修改">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">课酬奖金 <span class="text-red-500">*</span></label>
                <input type="number" id="pr-bonus" min="0" step="100" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="输入奖金金额">
              </div>
            </div>
            <div class="flex justify-end space-x-3 pt-2">
              <button type="button" onclick="openPaymentRecordsModal(${lect.id})" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">取消</button>
              <button type="submit" class="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium">保存</button>
            </div>
          </form>
        </div>
      `);
    }

    function handlePaymentProjectInput() {
      const input = document.getElementById('pr-project');
      const hidden = document.getElementById('pr-training-id');
      if (!input || !hidden) return;

      const value = input.value.trim();
      const training = (data.training || []).find(t => t.name === value);
      if (training) {
        hidden.value = training.id;
        fillPaymentRating(training.id);
      } else {
        hidden.value = '';
      }
    }

    async function fillPaymentRating(trainingId) {
      const ratingInput = document.getElementById('pr-rating');
      if (!ratingInput || !trainingId) return;
      try {
        const res = await fetch(API + '/training/' + trainingId + '/survey-average');
        const result = await res.json();
        if (result.averageRating !== null && result.averageRating !== undefined) {
          ratingInput.value = result.averageRating;
        }
      } catch (e) {
        console.warn('获取培训评分失败', e);
      }
    }

    async function savePaymentRecord(e, lecturerId) {
      e.preventDefault();
      const date = document.getElementById('pr-date').value;
      const bonus = document.getElementById('pr-bonus').value;
      const averageRating = document.getElementById('pr-rating').value;
      const trainingId = document.getElementById('pr-training-id').value;
      const projectText = document.getElementById('pr-project').value.trim();

      if (!date) { toast('请选择授课日期', 'error'); return; }
      if (!projectText) { toast('请填写关联培训/项目', 'error'); return; }
      if (bonus === '' || bonus === null || bonus === undefined) { toast('请输入课酬奖金', 'error'); return; }

      const payload = {
        lecturerId,
        date,
        bonus: Number(bonus) || 0
      };

      if (trainingId) {
        payload.type = 'training';
        payload.trainingId = trainingId;
      } else {
        payload.type = 'manual';
        payload.manualText = projectText;
      }

      const ratingVal = parseFloat(averageRating);
      payload.averageRating = isNaN(ratingVal) ? null : ratingVal;

      try {
        const res = await fetch(API + '/lecturer-payment-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          toast('记录已添加');
          await loadAllData();
          renderLecturers();
          openPaymentRecordsModal(lecturerId);
        } else {
          toast(result.error || '保存失败', 'error');
        }
      } catch (err) {
        toast('保存失败', 'error');
        console.error(err);
      }
    }

    async function deletePaymentRecord(recordId, lecturerId) {
      if (!confirm('确定删除这条课酬记录吗？')) return;
      try {
        const res = await fetch(API + '/lecturer-payment-records/' + recordId, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
          toast('记录已删除');
          await loadAllData();
          renderLecturers();
          openPaymentRecordsModal(lecturerId);
        } else {
          toast(result.error || '删除失败', 'error');
        }
      } catch (err) {
        toast('删除失败', 'error');
        console.error(err);
      }
    }

    function openLecturerModal(lecturer = null) {
      const isEdit = !!lecturer;
      originalLecturerAvatar = lecturer?.avatar || '';
      const levelOptions = ['senior', 'intermediate', 'junior', 'intern'].map(l =>
        `<option value="${l}" ${lecturer?.level === l ? 'selected' : ''}>${l === 'senior' ? '高级讲师' : l === 'intermediate' ? '中级讲师' : l === 'junior' ? '初级讲师' : '见习讲师'}</option>`
      ).join('');
      const avatarUrl = lecturer?.avatar || '';
      const skills = lecturer?.skills || [];
      const skillsHtml = skills.map(skill =>
        `<span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 mr-2 mb-2 skill-tag">
          ${skill}
          <button type="button" onclick="removeSkillTag(this)" class="ml-1 text-indigo-500 hover:text-indigo-900"><i class="fas fa-times"></i></button>
        </span>`
      ).join('');

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-semibold text-slate-800">${isEdit ? '编辑讲师' : '添加讲师'}</h3>
            <button onclick="closeLecturerModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <form onsubmit="saveLecturer(event, ${lecturer?.id || 'null'})" class="p-6 space-y-4">
            <!-- 头像上传区域 -->
            <div class="flex items-center space-x-6">
              <div class="flex-shrink-0">
                <div id="avatar-preview" class="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer hover:border-indigo-400 transition" onclick="document.getElementById('l-avatar-file').click()">
                  ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover">` : `<i class="fas fa-user text-slate-300 text-3xl"></i>`}
                </div>
                <input type="file" id="l-avatar-file" accept="image/*" class="hidden" onchange="handleAvatarUpload(this)">
              </div>
              <div class="flex-1">
                <label class="block text-sm font-medium text-slate-700 mb-1">头像</label>
                <p class="text-xs text-slate-400 mb-2">支持 JPG、PNG、GIF 格式,点击图片区域上传</p>
                <input type="text" id="l-avatar" value="${avatarUrl}" class="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm" placeholder="或输入头像URL">
              </div>
            </div>
            <!-- 姓名和等级 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">姓名 <span class="text-red-500">*</span></label>
                <input type="text" id="l-name" value="${lecturer?.name || ''}" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">等级</label>
                <select id="l-level" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">${levelOptions}</select>
              </div>
            </div>
            <!-- 部门和岗位 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">部门</label>
                <input type="text" id="l-dept" value="${lecturer?.department || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="技术部">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">岗位</label>
                <input type="text" id="l-title" value="${lecturer?.title || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="前端工程师">
              </div>
            </div>
            <!-- 开始担任讲师日期 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">开始担任讲师日期</label>
              <input type="date" id="l-start-teaching-date" value="${lecturer?.startTeachingDate || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <!-- 标签 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">标签 <span class="text-xs text-slate-400">(最多5个,按回车添加)</span></label>
              <div class="border border-slate-200 rounded-xl p-3 bg-white">
                <div id="skills-container" class="flex flex-wrap gap-2 mb-2 min-h-[32px]">
                  ${skillsHtml}
                </div>
                <input type="text" id="l-skill-input" class="w-full px-2 py-1.5 border-0 outline-none text-sm" placeholder="输入标签后按回车..." onkeydown="handleSkillInput(event)">
              </div>
              <input type="hidden" id="l-skills" value='${JSON.stringify(skills)}'>
            </div>
            <!-- 简介 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">简介</label>
              <textarea id="l-intro" rows="3" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="讲师简介">${lecturer?.intro || ''}</textarea>
            </div>
            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" onclick="closeLecturerModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">取消</button>
              <button type="submit" class="btn-primary px-6 py-2.5 text-white rounded-xl font-medium">保存</button>
            </div>
          </form>
        </div>
      `);
    }

    // 处理讲师头像上传
    async function handleAvatarUpload(input) {
      const file = input.files[0];
      if (!file) return;

      // 替换前的头像（可能是本次会话临时上传的，也可能是编辑时的原始头像）
      const prevAvatar = document.getElementById('l-avatar').value.trim();

      const formData = new FormData();
      formData.append('file', file);

      try {
        input.disabled = true;
        const response = await fetch(API + '/upload?type=avatars', {
          method: 'POST',
          body: formData
        });
        const result = await response.json();

        if (result.success) {
          // 若替换的是本次会话内已上传的临时头像，立即删除旧文件，避免项目里残留孤儿图
          if (prevAvatar && prevAvatar !== result.url && pendingLecturerAvatar.includes(prevAvatar)) {
            pendingLecturerAvatar = pendingLecturerAvatar.filter(u => u !== prevAvatar);
            await deleteUploadFileByUrl(prevAvatar);
          }
          document.getElementById('l-avatar').value = result.url;
          document.getElementById('avatar-preview').innerHTML = `<img src="${result.url}" class="w-full h-full object-cover">`;
          pendingLecturerAvatar.push(result.url);
          toast('头像上传成功');
        } else {
          toast(result.error || '上传失败', 'error');
        }
      } catch (err) {
        toast('上传失败', 'error');
      } finally {
        input.disabled = false;
      }
    }

    // 处理标签输入
    function handleSkillInput(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        const input = document.getElementById('l-skill-input');
        const skill = input.value.trim();

        if (!skill) return;

        const container = document.getElementById('skills-container');
        const currentSkills = Array.from(container.querySelectorAll('.skill-tag')).map(tag =>
          tag.textContent.trim().replace('×', '').trim()
        );

        // 检查是否超过5个
        if (currentSkills.length >= 5) {
          toast('最多只能添加5个标签', 'error');
          return;
        }

        // 检查是否重复
        if (currentSkills.includes(skill)) {
          toast('该标签已存在', 'error');
          return;
        }

        // 添加标签
        const tagHtml = `
          <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 mr-2 mb-2 skill-tag">
            ${skill}
            <button type="button" onclick="removeSkillTag(this)" class="ml-1 text-indigo-500 hover:text-indigo-900"><i class="fas fa-times"></i></button>
          </span>
        `;
        container.insertAdjacentHTML('beforeend', tagHtml);
        input.value = '';

        // 更新隐藏字段
        updateSkillsHiddenField();
      }
    }

    // 删除标签
    function removeSkillTag(button) {
      button.parentElement.remove();
      updateSkillsHiddenField();
    }

    // 更新隐藏字段的值
    function updateSkillsHiddenField() {
      const container = document.getElementById('skills-container');
      const skills = Array.from(container.querySelectorAll('.skill-tag')).map(tag =>
        tag.childNodes[0].textContent.trim()
      );
      document.getElementById('l-skills').value = JSON.stringify(skills);
    }

    async function saveLecturer(e, id) {
      e.preventDefault();
      const levelNames = { senior: '高级讲师', intermediate: '中级讲师', junior: '初级讲师', intern: '见习讲师' };
      const skills = JSON.parse(document.getElementById('l-skills').value || '[]');
      // 动态计算该讲师的课程数
      const tempName = document.getElementById('l-name').value.trim();
      const existingLecturer = id ? (data.lecturers || []).find(l => l.id === id) : null;
      const lecturerIdForCount = id || (existingLecturer ? existingLecturer.id : Date.now());
      const dynamicCourseCount = (data.management_courses || []).filter(c => String(c.lecturerId) === String(existingLecturer ? existingLecturer.id : lecturerIdForCount)).length;

      const formData = {
        name: tempName,
        department: document.getElementById('l-dept').value.trim(),
        title: document.getElementById('l-title').value.trim(),
        level: document.getElementById('l-level').value,
        levelName: levelNames[document.getElementById('l-level').value],
        avatar: document.getElementById('l-avatar').value.trim() || 'https://via.placeholder.com/60',
        intro: document.getElementById('l-intro').value.trim(),
        startTeachingDate: document.getElementById('l-start-teaching-date').value || null,
        status: 'enabled',
        type: 'internal',
        skills: skills,
        courseCount: dynamicCourseCount,
        regDate: existingLecturer ? (existingLecturer.regDate || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]
      };

      try {
        let res;
        if (id) {
          res = await fetch(API + '/lecturers/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...formData, id })
          });
        } else {
          res = await fetch(API + '/lecturers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        }
        if (res.ok) {
          // 编辑时若头像被替换，清理原来的项目文件图片
          const newAvatar = document.getElementById('l-avatar').value.trim();
          if (id && originalLecturerAvatar && originalLecturerAvatar !== newAvatar) {
            await deleteUploadFileByUrl(originalLecturerAvatar);
          }
          pendingLecturerAvatar = [];
          toast(id ? '讲师已更新' : '讲师已添加');
          closeLecturerModal();
          await loadAllData();
          renderLecturers();
        }
      } catch (err) {
        toast('操作失败', 'error');
      }
    }

    function editLecturer(id) {
      const lect = data.lecturers.find(l => l.id === id);
      if (lect) openLecturerModal(lect);
    }

    function closeLecturerModal() {
      pendingLecturerAvatar.forEach(url => deleteUploadFileByUrl(url));
      pendingLecturerAvatar = [];
      originalLecturerAvatar = '';
      closeModal();
    }

    async function toggleLecturerStatus(id) {
      const lect = data.lecturers.find(l => l.id === id);
      if (!lect) return;
      const newStatus = lect.status === 'enabled' ? 'disabled' : 'enabled';
      try {
        const res = await fetch(API + '/lecturers/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...lect, status: newStatus })
        });
        if (res.ok) {
          toast(newStatus === 'enabled' ? '讲师已启用' : '讲师已禁用');
          await loadAllData();
          renderLecturers();
        }
      } catch (err) {
        toast('操作失败', 'error');
      }
    }

    async function deleteLecturer(id, askConfirm = true) {
      if (askConfirm && !confirm('确定删除这位讲师吗？其头像、课酬记录、讲师申请关联将被清理。如该讲师下存在课程，将无法删除。')) return false;
      try {
        const res = await fetch(API + '/lecturers/' + id, { method: 'DELETE' });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success !== false) {
          if (askConfirm) {
            toast('讲师已删除');
            await loadAllData();
            renderLecturers();
          }
          return true;
        } else {
          if (askConfirm) toast(result.error || '删除失败', 'error');
          return false;
        }
      } catch (err) {
        if (askConfirm) toast('删除失败', 'error');
        return false;
      }
    }

    // 显示讲师详情弹窗
    function showLecturerDetail(id) {
      const lect = data.lecturers.find(l => l.id === id);
      if (!lect) return;

      const lv = levelMap[lect.level] || levelMap.junior;
      const lectCourses = data.courses.filter(c => c.lecturerId === lect.id);
      const courseCount = lectCourses.length;

      // 学员数：该讲师参与的培训活动次数（作为教学活跃度指标）
      const studentCount = (data.training || []).filter(t => t.instructor === lect.name).length;

      // 评分：该讲师所有课程的平均评分
      let rating = '--';
      const ratedCourses = lectCourses.filter(c => (c.ratingCount || 0) > 0);
      if (ratedCourses.length > 0) {
        const avgRating = ratedCourses.reduce((sum, c) => {
          const cr = c.ratingSum || 0;
          const cc = c.ratingCount || 1;
          return sum + (cr / cc);
        }, 0) / ratedCourses.length;
        rating = avgRating.toFixed(1);
      }

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-[400px]">
          <div class="relative h-24 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-2xl flex items-center justify-center">
            <button onclick="closeModal()" class="absolute top-3 right-3 text-white/80 hover:text-white transition">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="flex justify-center -mt-14">
            <img src="${lect.avatar || 'https://via.placeholder.com/80'}"
              class="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg">
          </div>

          <div class="px-6 pt-3 pb-6 text-center">
            <h3 class="text-lg font-bold text-slate-800 mb-2">${lect.name}</h3>
            <span class="inline-block px-3 py-1 rounded-full text-xs font-medium ${lv.class} mb-4">${lv.text}</span>

            <div class="flex items-center justify-center gap-8 mt-4 mb-5">
              <div class="text-center">
                <p class="text-2xl font-bold text-slate-800">${courseCount}</p>
                <p class="text-xs text-slate-500">门课程</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-slate-800">${studentCount}</p>
                <p class="text-xs text-slate-500">学员数</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-slate-800">${rating}</p>
                <p class="text-xs text-slate-500">评分</p>
              </div>
            </div>

            <div class="text-left border-t border-slate-100 pt-4">
              <h4 class="text-sm font-semibold text-slate-700 mb-2">
                <i class="fas fa-user mr-1 text-indigo-500"></i>个人简介
              </h4>
              <p class="text-sm text-slate-600 leading-relaxed line-clamp-3">${lect.intro || '暂无简介'}</p>
            </div>

            <div class="text-left border-t border-slate-100 pt-4 mt-4">
              <h4 class="text-sm font-semibold text-slate-700 mb-2">
                <i class="fas fa-book mr-1 text-indigo-500"></i>授课课程
              </h4>
              ${courseCount > 0 ?
                `<p class="text-sm text-slate-600">共 ${courseCount} 门课程</p>` :
                '<p class="text-sm text-slate-400">暂无课程</p>'
              }
            </div>
          </div>

          <div class="px-6 pb-5">
            <button onclick="closeModal()" class="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition">
              关闭
            </button>
          </div>
        </div>
      `);
    }

    // ========== 培训管理 ==========
    let trainingViewMode = 'list';
    let trainingCurrentYear = new Date().getFullYear();
    let trainingCurrentMonth = new Date().getMonth();

    const trainingCategories = {
      '新雁计划': { color: 'bg-orange-100 text-orange-700', icon: 'fa-rocket' },
      '游雁学堂': { color: 'bg-blue-100 text-blue-700', icon: 'fa-graduation-cap' },
      '鸿雁计划': { color: 'bg-green-100 text-green-700', icon: 'fa-users' },
      'AI实践分享': { color: 'bg-amber-100 text-amber-700', icon: 'fa-laptop' },
      '雏雁训练营': { color: 'bg-pink-100 text-pink-700', icon: 'fa-building' }
    };

    // 2026年国家法定节假日
    const trainingHolidays = {
      '2026-01-01': '元旦',
      '2026-01-28': '春节',
      '2026-01-29': '春节',
      '2026-01-30': '春节',
      '2026-01-31': '春节',
      '2026-02-01': '春节',
      '2026-02-02': '春节',
      '2026-02-03': '春节',
      '2026-04-04': '清明',
      '2026-04-05': '清明',
      '2026-05-01': '劳动节',
      '2026-05-02': '劳动节',
      '2026-05-03': '劳动节',
      '2026-06-19': '端午',
      '2026-06-20': '端午',
      '2026-09-25': '中秋',
      '2026-10-01': '国庆',
      '2026-10-02': '国庆',
      '2026-10-03': '国庆',
      '2026-10-04': '国庆',
      '2026-10-05': '国庆',
      '2026-10-06': '国庆',
      '2026-10-07': '国庆',
    };

    let analyticsTrainingId = null;
    let analyticsCurrentTab = 'overview';
    let _analyticsEnrollData = null;
    let _analyticsOverviewData = null;
    let _analyticsSelectedUserIds = new Set();
    let _analyticsSurveyData = null;
    let _analyticsExamData = null;
    let _analyticsAttendanceData = null;

    function switchTrainingView(mode) {
      trainingViewMode = mode;
      document.getElementById('view-btn-calendar').classList.toggle('active', mode === 'calendar');
      document.getElementById('view-btn-list').classList.toggle('active', mode === 'list');
      document.getElementById('training-calendar-view').classList.toggle('hidden', mode !== 'calendar');
      document.getElementById('training-list-view').classList.toggle('hidden', mode !== 'list');
      document.getElementById('training-analytics-view').classList.toggle('hidden', mode !== 'analytics');
      document.getElementById('training-add-btn').style.display = (mode === 'list') ? 'flex' : 'none';
      // 隐藏顶部切换按钮的高亮（analytics模式下两个都不active）
      if (mode === 'analytics') {
        document.getElementById('view-btn-calendar').classList.remove('active');
        document.getElementById('view-btn-list').classList.remove('active');
      }
      renderTraining();
    }

    function renderTraining() {
      if (trainingViewMode === 'calendar') {
        renderTrainingCalendar();
      } else if (trainingViewMode === 'list') {
        renderTrainingList();
      }
      // analytics模式下不需要渲染列表/日历
    }

    function exitAnalytics() {
      switchTrainingView('list');
    }

    function openTrainingAnalytics(trainingId) {
      analyticsTrainingId = trainingId;
      analyticsCurrentTab = 'overview';
      const event = data.training.find(x => x.id === trainingId);
      const name = event ? event.name : '培训';
      const project = event ? event.project : '';
      const instructor = event ? (event.instructor || '') : '';
      document.getElementById('analytics-training-name').textContent = name;
      document.getElementById('analytics-training-sub').textContent = [project, instructor].filter(Boolean).join(' · ');
      switchTrainingView('analytics');
      switchAnalyticsTab('overview');
    }

    function switchAnalyticsTab(tab) {
      analyticsCurrentTab = tab;
      // 更新标签按钮样式
      document.querySelectorAll('.analytics-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.add('text-slate-600');
      });
      const activeBtn = document.getElementById('analytics-tab-' + tab);
      if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.classList.remove('text-slate-600');
      }
      // 渲染对应内容
      const tid = analyticsTrainingId;
      if (tab === 'overview') renderAnalyticsOverview(tid);
      else if (tab === 'enroll') renderAnalyticsEnroll(tid);
      else if (tab === 'survey') renderAnalyticsSurvey(tid);
      else if (tab === 'exam') renderAnalyticsExam(tid);
      else if (tab === 'attendance') renderAnalyticsAttendance(tid);
    }

    // ========== 数据分析 - 数据总览 ==========
    function renderOverviewPct(pct) {
      if (pct === null || pct === undefined) return '<span class="text-slate-300">-</span>';
      const cls = pct >= 100 ? 'bg-emerald-50 text-emerald-600' : (pct > 0 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500');
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${cls}">${pct}%</span>`;
    }

    async function renderAnalyticsOverview(trainingId) {
      const container = document.getElementById('analytics-content');
      container.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div><span class="ml-3 text-slate-500">加载数据总览...</span></div>';
      try {
        const res = await fetch(API + '/training/' + trainingId + '/overview');
        const result = await res.json();
        const overview = result.data || {};
        const summary = overview.summary || {};
        const users = overview.users || [];
        const training = overview.training || {};
        _analyticsOverviewData = { overview, trainingId };

        const total = summary.total || 0;
        const avgCompletionRate = summary.avgCompletionRate ?? 0;
        const signinRate = summary.signinRate ?? 0;
        const surveyRate = summary.surveyRate ?? 0;
        const examPassRate = summary.examPassRate ?? 0;
        const signinEnabled = summary.signinEnabled;
        const surveyEnabled = summary.surveyEnabled;
        const examEnabled = summary.examEnabled;

        // 汇总卡片
        const summaryCards = `
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div class="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-xl p-4">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><i class="fas fa-users text-indigo-500 text-sm"></i></div>
                <span class="text-xs text-indigo-600/70">参与人数</span>
              </div>
              <p class="text-2xl font-bold text-indigo-700">${total}</p>
            </div>
            <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><i class="fas fa-chart-line text-emerald-500 text-sm"></i></div>
                <span class="text-xs text-emerald-600/70">平均完成率</span>
              </div>
              <p class="text-2xl font-bold text-emerald-700">${avgCompletionRate}%</p>
            </div>
            ${signinEnabled ? `
            <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><i class="fas fa-clipboard-check text-blue-500 text-sm"></i></div>
                <span class="text-xs text-blue-600/70">考勤完成率</span>
              </div>
              <p class="text-2xl font-bold text-blue-700">${signinRate}%</p>
            </div>` : ''}
            ${surveyEnabled ? `
            <div class="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-4">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center"><i class="fas fa-poll text-purple-500 text-sm"></i></div>
                <span class="text-xs text-purple-600/70">调研完成率</span>
              </div>
              <p class="text-2xl font-bold text-purple-700">${surveyRate}%</p>
            </div>` : ''}
            ${examEnabled ? `
            <div class="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-4">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><i class="fas fa-file-alt text-amber-500 text-sm"></i></div>
                <span class="text-xs text-amber-600/70">考试通过率</span>
              </div>
              <p class="text-2xl font-bold text-amber-700">${examPassRate}%</p>
            </div>` : ''}
          </div>`;

        // 学员明细行
        const rows = users.length > 0
          ? users.map((u, i) => {
            const seed = encodeURIComponent(u.userName || u.userId);
            const avatarUrl = u.avatar && u.avatar.startsWith('http') ? u.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
            const sourceLabel = u.source === 'assigned'
              ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-50 text-cyan-600">任务指派</span>'
              : (u.source === 'self'
                ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600">主动报名</span>'
                : '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">未报名</span>');
            const isIncomplete = u.completionRate < 100;
            const examTitle = u.examPassed ? '已通过' : (u.examScore !== null ? `得分 ${u.examScore}，未通过` : '未参加');
            const checked = _analyticsSelectedUserIds.has(String(u.userId));
            return `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
              <td class="px-4 py-3">
                <input type="checkbox" class="overview-row-check w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" value="${u.userId}" ${checked ? 'checked' : ''} onchange="toggleOverviewRowSelect(${u.userId})">
              </td>
              <td class="px-4 py-3 text-sm text-slate-500">${i + 1}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2.5">
                  <img src="${avatarUrl}" class="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm" />
                  <span class="text-sm font-medium text-slate-800">${u.userName || '-'}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-slate-600">${u.department || '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${u.position || '-'}</td>
              <td class="px-4 py-3">${sourceLabel}</td>
              <td class="px-4 py-3">${renderOverviewPct(u.signinPct)}</td>
              <td class="px-4 py-3">${renderOverviewPct(u.surveyPct)}</td>
              <td class="px-4 py-3" title="${examTitle}">${renderOverviewPct(u.examPct)}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div class="h-full ${u.completionRate >= 100 ? 'bg-emerald-500' : (u.completionRate > 0 ? 'bg-amber-500' : 'bg-red-400')} rounded-full transition-all duration-500" style="width: ${u.completionRate}%"></div>
                  </div>
                  <span class="text-xs font-medium ${u.completionRate >= 100 ? 'text-emerald-600' : (u.completionRate > 0 ? 'text-amber-600' : 'text-red-500')}">${u.completionRate}%</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-2">
                  <button onclick="remindUserTraining(${trainingId}, ${u.userId}, '${(u.userName || '').replace(/'/g, '\\\'')}')" class="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-medium hover:bg-indigo-100 transition" title="发送消息中心提醒">
                    <i class="fas fa-bell mr-1"></i>催促
                  </button>
                  ${isIncomplete ? `
                  <button onclick="delayUserTraining(${trainingId}, ${u.userId}, '${(u.userName || '').replace(/'/g, '\\\'')}')" class="px-2.5 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-medium hover:bg-amber-100 transition" title="延期并提醒">
                    <i class="fas fa-clock mr-1"></i>延期
                  </button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')
          : `<tr><td colspan="11" class="px-4 py-12 text-center text-slate-400">
              <i class="fas fa-chart-pie text-3xl mb-3 block text-slate-300"></i>
              <p>暂无参与人员</p>
            </td></tr>`;

        // 未完成的学员数量
        const incompleteCount = users.filter(u => u.completionRate < 100).length;

        container.innerHTML = `
          <div class="p-6">
            <!-- 汇总卡片 -->
            ${summaryCards}

            <!-- 学员明细 -->
            <div class="mt-6">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                  <h4 class="text-sm font-semibold text-slate-700"><i class="fas fa-list-ul text-indigo-400 mr-2"></i>学员完成明细</h4>
                  ${incompleteCount > 0 ? `<span class="px-2 py-0.5 rounded-full bg-red-50 text-red-500 text-[10px] font-medium">${incompleteCount} 人未完成</span>` : ''}
                </div>
                <div class="flex items-center gap-2">
                  ${incompleteCount > 0 ? `
                  <button onclick="batchRemindSelected(${trainingId})" class="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition">
                    <i class="fas fa-bullhorn mr-1"></i>批量催促
                  </button>
                  <button onclick="batchDelaySelected(${trainingId})" class="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-xs font-medium hover:bg-amber-100 transition">
                    <i class="fas fa-calendar-plus mr-1"></i>批量延期
                  </button>` : ''}
                  <button onclick="exportAnalyticsOverview()" class="px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-50 transition">
                    <i class="fas fa-file-excel mr-1"></i>导出
                  </button>
                </div>
              </div>
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full">
                  <thead class="bg-slate-50"><tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                      <input type="checkbox" id="overview-select-all" onchange="toggleOverviewSelectAll(this.checked)" class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">姓名</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">部门</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">岗位</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">报名情况</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">考勤</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">调研</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">考试</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">完成率</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500">操作</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>`;
      } catch (err) {
        container.innerHTML = '<div class="text-center py-20 text-slate-400"><i class="fas fa-exclamation-circle text-3xl mb-3 block"></i><p>加载数据总览失败</p></div>';
      }
    }

    async function sendTrainingNotification(trainingId, userIds, type = 'remind') {
      const event = data.training.find(x => x.id === trainingId);
      const name = event ? event.name : '培训';
      const title = type === 'delay' ? '培训学习时间延期' : '培训学习提醒';
      const content = type === 'delay'
        ? `您参与的「${name}」学习时间已延期，请合理安排时间尽快完成学习任务。`
        : `您报名的「${name}」尚未完成，请尽快完成学习任务。`;
      let sent = 0;
      for (const userId of userIds) {
        try {
          const res = await fetch(API + '/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, title, content, type: 'training', trainingId })
          });
          if (res.ok) sent++;
        } catch (e) { /* ignore */ }
      }
      return sent;
    }

    async function remindUserTraining(trainingId, userId, userName) {
      const sent = await sendTrainingNotification(trainingId, [userId], 'remind');
      toast(sent > 0 ? `已向 ${userName || '该学员'} 发送催促提醒` : '发送提醒失败', sent > 0 ? 'success' : 'error');
    }

    function getSelectedOrIncompleteUsers() {
      if (!_analyticsOverviewData || !_analyticsOverviewData.overview) return [];
      const users = _analyticsOverviewData.overview.users || [];
      if (_analyticsSelectedUserIds.size > 0) {
        return users.filter(u => _analyticsSelectedUserIds.has(String(u.userId)));
      }
      return users.filter(u => u.completionRate < 100);
    }

    function toggleOverviewSelectAll(checked) {
      if (!_analyticsOverviewData || !_analyticsOverviewData.overview) return;
      const users = _analyticsOverviewData.overview.users || [];
      if (checked) {
        users.forEach(u => _analyticsSelectedUserIds.add(String(u.userId)));
      } else {
        _analyticsSelectedUserIds.clear();
      }
      document.querySelectorAll('.overview-row-check').forEach(cb => {
        cb.checked = checked;
      });
    }

    function toggleOverviewRowSelect(userId) {
      const uid = String(userId);
      if (_analyticsSelectedUserIds.has(uid)) {
        _analyticsSelectedUserIds.delete(uid);
      } else {
        _analyticsSelectedUserIds.add(uid);
      }
      updateOverviewSelectAllState();
    }

    function updateOverviewSelectAllState() {
      const selectAll = document.getElementById('overview-select-all');
      if (!selectAll || !_analyticsOverviewData || !_analyticsOverviewData.overview) return;
      const users = _analyticsOverviewData.overview.users || [];
      const allChecked = users.length > 0 && users.every(u => _analyticsSelectedUserIds.has(String(u.userId)));
      selectAll.checked = allChecked;
      selectAll.indeterminate = !allChecked && _analyticsSelectedUserIds.size > 0;
    }

    async function remindAllIncomplete(trainingId) {
      const targets = getSelectedOrIncompleteUsers();
      if (targets.length === 0) { toast('没有未完成的学员', 'warning'); return; }
      if (!confirm(`确定向 ${targets.length} 名学员发送催促提醒？`)) return;
      const sent = await sendTrainingNotification(trainingId, targets.map(u => u.userId), 'remind');
      toast(`已向 ${sent} 名学员发送催促提醒`);
    }

    async function batchRemindSelected(trainingId) {
      const targets = getSelectedOrIncompleteUsers();
      if (targets.length === 0) { toast('没有可催促的学员', 'warning'); return; }
      const scopeTip = _analyticsSelectedUserIds.size > 0 ? '已勾选' : '未完成';
      if (!confirm(`确定向 ${targets.length} 名${scopeTip}学员发送催促提醒？`)) return;
      const sent = await sendTrainingNotification(trainingId, targets.map(u => u.userId), 'remind');
      toast(`已向 ${sent} 名学员发送催促提醒`);
    }

    function openDelayModal(trainingId, userIds) {
      const event = data.training.find(x => x.id === trainingId);
      const name = event ? event.name : '培训';
      const currentEnd = event && event.endTime ? new Date(event.endTime).toLocaleString('zh-CN', { hour12: false }) : '未设置';
      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-semibold text-slate-800">延期学习</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <form onsubmit="confirmDelayTraining(event, ${trainingId})" class="p-6 space-y-4">
            <div class="bg-slate-50 rounded-xl p-4 text-sm">
              <p class="text-slate-500 mb-1">培训名称</p>
              <p class="font-medium text-slate-800">${name}</p>
              <p class="text-slate-500 mt-2 mb-1">当前截止时间</p>
              <p class="font-medium text-slate-800">${currentEnd}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">延期天数 <span class="text-red-500">*</span></label>
              <div class="flex items-center gap-2">
                <input type="number" id="delay-days" min="1" max="365" value="3" required class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500">
                <span class="text-sm text-slate-500">天</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" id="delay-notify" checked class="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500">
              <label for="delay-notify" class="text-sm text-slate-600">同时发送延期通知给学员</label>
            </div>
            <input type="hidden" id="delay-target-ids" value="${userIds.join(',')}">
            <div class="flex justify-end space-x-3 pt-2">
              <button type="button" onclick="closeModal()" class="px-5 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm">取消</button>
              <button type="submit" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition">确认延期</button>
            </div>
          </form>
        </div>`);
    }

    function delayUserTraining(trainingId, userId, userName) {
      openDelayModal(trainingId, [userId]);
    }

    function delayAllTraining(trainingId) {
      const targets = getSelectedOrIncompleteUsers();
      if (targets.length === 0) { toast('没有需要延期的学员', 'warning'); return; }
      openDelayModal(trainingId, targets.map(u => u.userId));
    }

    function batchDelaySelected(trainingId) {
      const targets = getSelectedOrIncompleteUsers();
      if (targets.length === 0) { toast('没有可延期的学员', 'warning'); return; }
      openDelayModal(trainingId, targets.map(u => u.userId));
    }

    async function confirmDelayTraining(e, trainingId) {
      e.preventDefault();
      const days = parseInt(document.getElementById('delay-days').value) || 0;
      if (days <= 0) { toast('请输入有效的延期天数', 'error'); return; }
      const event = data.training.find(x => x.id === trainingId);
      const currentEnd = event && event.endTime ? event.endTime : toLocalDateTimeInput(new Date());
      const newEnd = new Date(new Date(currentEnd).getTime() + days * 24 * 60 * 60 * 1000);
      const newEndStr = toLocalDateTimeInput(newEnd);
      const idsStr = document.getElementById('delay-target-ids').value;
      const userIds = idsStr ? idsStr.split(',').map(id => id.trim()).filter(Boolean) : [];
      if (userIds.length === 0) { toast('没有需要延期的学员', 'error'); return; }
      try {
        // 给指定学员的报名记录设置个人延期时间
        const res = await fetch(API + '/training/' + trainingId + '/enrollments/extend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds, extendedEndTime: newEndStr })
        });
        const result = await res.json();
        if (!result.success) { toast(result.error || '延期失败', 'error'); return; }
        const notify = document.getElementById('delay-notify').checked;
        if (notify && userIds.length > 0) {
          const sent = await sendTrainingNotification(trainingId, userIds, 'delay');
          toast(`已延期 ${days} 天，并通知 ${sent} 名学员`);
        } else {
          toast(`已延期 ${days} 天`);
        }
        closeModal();
      } catch (err) {
        toast('延期操作失败', 'error');
      }
    }

    function exportAnalyticsOverview() {
      if (!_analyticsOverviewData || !_analyticsOverviewData.overview) { toast('暂无数据可导出', 'warning'); return; }
      const event = data.training.find(x => x.id === _analyticsOverviewData.trainingId);
      const name = event ? event.name : '培训';
      const users = _analyticsOverviewData.overview.users || [];
      const headers = ['序号', '姓名', '部门', '岗位', '报名来源', '考勤', '调研', '考试', '完成率'];
      const rows = users.map((u, i) => [
        i + 1,
        u.userName || '-',
        u.department || '-',
        u.position || '-',
        u.source === 'assigned' ? '任务指派' : (u.source === 'self' ? '主动报名' : '未报名'),
        u.signinPct === null ? '未启用' : (u.signinPct + '%'),
        u.surveyPct === null ? '未启用' : (u.surveyPct + '%'),
        u.examPct === null ? '未启用' : (u.examPct + '%'),
        u.completionRate + '%'
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '数据总览');
      XLSX.writeFile(wb, name + '_数据总览_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('数据总览导出成功');
    }

    // ========== 数据分析 - 报名分析 ==========
    async function renderAnalyticsEnroll(trainingId) {
      const container = document.getElementById('analytics-content');
      container.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div><span class="ml-3 text-slate-500">加载报名数据...</span></div>';
      try {
        const res = await fetch(API + '/training/' + trainingId + '/enrollments');
        const result = await res.json();
        const enrollments = result.data || [];
        _analyticsEnrollData = { enrollments, trainingId };

        // 部门统计
        const deptStats = {};
        enrollments.forEach(e => {
          const dept = e.userDepartment || '未知部门';
          deptStats[dept] = (deptStats[dept] || 0) + 1;
        });
        const sortedDepts = Object.entries(deptStats).sort((a, b) => b[1] - a[1]);
        const maxDeptCount = sortedDepts.length > 0 ? sortedDepts[0][1] : 1;

        const deptBars = sortedDepts.map(([dept, count]) => {
          const pct = Math.round((count / maxDeptCount) * 100);
          return `
            <div class="flex items-center gap-3">
              <span class="text-xs text-slate-600 w-24 truncate text-right">${dept}</span>
              <div class="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div class="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all duration-500 flex items-center justify-end pr-2" style="width: ${pct}%">
                  ${pct > 20 ? `<span class="text-[10px] text-white font-medium">${count}</span>` : ''}
                </div>
              </div>
              ${pct <= 20 ? `<span class="text-xs text-slate-500 w-6">${count}</span>` : '<span class="w-6"></span>'}
            </div>`;
        }).join('') || '<p class="text-sm text-slate-400 text-center py-4">暂无报名数据</p>';

        // 报名人员表格
        const rows = enrollments.length > 0
          ? enrollments.map((e, i) => {
            const seed = encodeURIComponent(e.userName || e.userId);
            const avatarUrl = e.userAvatar && e.userAvatar.startsWith('http') ? e.userAvatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
            return `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
              <td class="px-4 py-3 text-sm text-slate-500">${i + 1}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2.5">
                  <img src="${avatarUrl}" class="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm" />
                  <span class="text-sm font-medium text-slate-800">${e.userName || '-'}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-slate-600">${e.userDepartment || '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${e.userPhone || '-'}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${e.source === 'assigned' ? 'bg-cyan-50 text-cyan-600' : 'bg-indigo-50 text-indigo-600'}">${e.source === 'assigned' ? '指派' : '自主报名'}</span>
              </td>
              <td class="px-4 py-3 text-sm text-slate-500">${e.enrolledAt ? new Date(e.enrolledAt).toLocaleString('zh-CN') : '-'}</td>
              <td class="px-4 py-3 text-right">
                <button onclick="removeEnrollmentAndRefresh(${e.id}, ${trainingId})" class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="移除"><i class="fas fa-times text-xs"></i></button>
              </td>
            </tr>`;
          }).join('')
          : `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">
              <i class="fas fa-users text-3xl mb-3 block text-slate-300"></i>
              <p>暂无报名人员</p>
            </td></tr>`;

        // 来源统计
        const selfCount = enrollments.filter(e => e.source !== 'assigned').length;
        const assignedCount = enrollments.filter(e => e.source === 'assigned').length;

        container.innerHTML = `
          <div class="p-6">
            <!-- 概览卡片 -->
            <div class="grid grid-cols-4 gap-4 mb-6">
              <div class="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><i class="fas fa-users text-indigo-500 text-sm"></i></div>
                  <span class="text-xs text-indigo-600/70">报名总人数</span>
                </div>
                <p class="text-2xl font-bold text-indigo-700">${enrollments.length}</p>
              </div>
              <div class="bg-gradient-to-br from-cyan-50 to-cyan-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center"><i class="fas fa-user-plus text-cyan-500 text-sm"></i></div>
                  <span class="text-xs text-cyan-600/70">指派人数</span>
                </div>
                <p class="text-2xl font-bold text-cyan-700">${assignedCount}</p>
              </div>
              <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><i class="fas fa-hand-pointer text-emerald-500 text-sm"></i></div>
                  <span class="text-xs text-emerald-600/70">自主报名</span>
                </div>
                <p class="text-2xl font-bold text-emerald-700">${selfCount}</p>
              </div>
              <div class="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><i class="fas fa-building text-amber-500 text-sm"></i></div>
                  <span class="text-xs text-amber-600/70">涉及部门</span>
                </div>
                <p class="text-2xl font-bold text-amber-700">${sortedDepts.length}</p>
              </div>
            </div>
            <!-- 部门分布 -->
            <div class="mb-6">
              <h4 class="text-sm font-semibold text-slate-700 mb-3"><i class="fas fa-chart-bar text-indigo-400 mr-2"></i>部门分布</h4>
              <div class="space-y-2">${deptBars}</div>
            </div>
            <!-- 报名人员明细 -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-semibold text-slate-700"><i class="fas fa-list-ul text-indigo-400 mr-2"></i>报名人员明细</h4>
                <div class="flex items-center gap-2">
                  <button onclick="openAssignHistoryModal(${trainingId})" class="px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-100 transition">
                    <i class="fas fa-history mr-1"></i>指派记录
                  </button>
                  <button onclick="exportAnalyticsEnroll()" class="px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-50 transition">
                    <i class="fas fa-file-excel mr-1"></i>导出
                  </button>
                  <button onclick="openAssignStudentsModal(${trainingId})" class="px-3 py-1.5 bg-cyan-50 text-cyan-600 rounded-lg text-xs font-medium hover:bg-cyan-100 transition">
                    <i class="fas fa-user-plus mr-1"></i>指派学员
                  </button>
                </div>
              </div>
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full">
                  <thead class="bg-slate-50"><tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">姓名</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">部门</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">电话</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">来源</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">报名时间</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500">操作</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>`;
      } catch (err) {
        container.innerHTML = '<div class="text-center py-20 text-slate-400"><i class="fas fa-exclamation-circle text-3xl mb-3 block"></i><p>加载报名数据失败</p></div>';
      }
    }

    // ========== 数据分析 - 导出Excel ==========
    function exportAnalyticsEnroll() {
      if (!_analyticsEnrollData || !_analyticsEnrollData.enrollments) { toast('暂无数据可导出', 'warning'); return; }
      const event = data.training.find(x => x.id === _analyticsEnrollData.trainingId);
      const name = event ? event.name : '培训';
      const enrollments = _analyticsEnrollData.enrollments;

      const headers = ['序号', '姓名', '部门', '岗位', '电话', '来源', '报名时间'];
      const rows = enrollments.map((e, i) => [
        i + 1,
        e.userName || '-',
        e.userDepartment || '-',
        e.userPosition || '-',
        e.userPhone || '-',
        e.source === 'assigned' ? '指派' : '自主报名',
        e.enrolledAt ? new Date(e.enrolledAt).toLocaleString('zh-CN') : '-'
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      // 设置列宽
      ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 22 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '报名数据');
      XLSX.writeFile(wb, name + '_报名分析_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('报名数据导出成功');
    }

    // 兼容两种 answers 格式：数组 [{questionId, value}] 和对象 {"1": value}
    function getSurveyAnswerValue(answers, questionId) {
      if (!answers) return null;
      if (Array.isArray(answers)) {
        const ans = answers.find(a => a.questionId === questionId);
        if (!ans) return null;
        return ans.value !== undefined ? ans.value : (ans.text || null);
      }
      return answers[questionId] ?? answers[String(questionId)] ?? null;
    }

    function exportAnalyticsSurvey() {
      if (!_analyticsSurveyData || !_analyticsSurveyData.survey) { toast('暂无数据可导出', 'warning'); return; }
      const event = data.training.find(x => x.id === _analyticsSurveyData.trainingId);
      const name = event ? event.name : '培训';
      const { survey, responses } = _analyticsSurveyData;

      // 构建表头：序号 + 姓名 + 部门 + 岗位 + 提交时间 + 各题目
      const questionTitles = (survey.questions || []).map(q => q.title || q.text || '题目');
      const headers = ['序号', '填写人', '部门', '岗位', '提交时间', ...questionTitles];
      const rows = responses.map((r, i) => {
        const answers = (survey.questions || []).map(q => {
          const val = getSurveyAnswerValue(r.answers, q.id);
          return val !== null && val !== undefined ? String(val) : '-';
        });
        return [
          i + 1,
          r.userName || '匿名',
          r.department || '-',
          r.position || '-',
          r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '-',
          ...answers
        ];
      });
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, ...questionTitles.map(() => ({ wch: 20 }))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '调研数据');
      XLSX.writeFile(wb, name + '_调研分析_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('调研数据导出成功');
    }

    function exportAnalyticsExam() {
      if (!_analyticsExamData || !_analyticsExamData.exam) { toast('暂无数据可导出', 'warning'); return; }
      const event = data.training.find(x => x.id === _analyticsExamData.trainingId);
      const name = event ? event.name : '培训';
      const { exam, attempts } = _analyticsExamData;

      const headers = ['序号', '姓名', '部门', '岗位', '考试次数', '最高分', '是否通过', '最近提交时间'];
      // 按学员聚合
      const userMap = {};
      attempts.forEach(a => {
        const uid = String(a.userId);
        if (!userMap[uid]) {
          userMap[uid] = {
            userName: a.userName || a.userId || '-',
            department: a.department || '-',
            position: a.position || '-',
            attempts: []
          };
        }
        userMap[uid].attempts.push(a);
      });
      const users = Object.values(userMap).map(u => {
        u.attempts.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
        const completedAttempts = u.attempts.filter(a => a.status === 'completed' && a.score !== null);
        u.bestScore = completedAttempts.length > 0 ? Math.max(...completedAttempts.map(a => a.score || 0)) : '-';
        u.passed = completedAttempts.some(a => a.passed);
        u.latestCompletedAt = completedAttempts[0]?.completedAt || u.attempts[0]?.completedAt;
        return u;
      });

      const rows = users.map((u, i) => [
        i + 1,
        u.userName,
        u.department,
        u.position,
        u.attempts.length,
        u.bestScore,
        u.passed ? '通过' : '未通过',
        u.latestCompletedAt ? new Date(u.latestCompletedAt).toLocaleString('zh-CN') : '-'
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 22 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '考试数据');
      XLSX.writeFile(wb, name + '_考试分析_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('考试数据导出成功');
    }

    function exportAnalyticsAttendance() {
      if (!_analyticsAttendanceData || !_analyticsAttendanceData.signins) { toast('暂无数据可导出', 'warning'); return; }
      const { signins, event, absentNames, expectedCount, actualCount } = _analyticsAttendanceData;
      const name = event ? event.name : '培训';

      // Sheet 1: 签到明细
      const headers = ['序号', '姓名', '部门', '岗位', '签到时间', '状态'];
      const rows = signins.map((s, i) => [
        i + 1,
        s.userName || '-',
        s.department || '-',
        s.position || '-',
        s.signedAt ? new Date(s.signedAt).toLocaleString('zh-CN') : '-',
        '已签到'
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 8 }];

      // Sheet 2: 考勤汇总
      const summaryHeaders = ['项目', '数值'];
      const absentCount = Math.max(0, (expectedCount || 0) - (actualCount || 0));
      const rate = expectedCount > 0 ? Math.round((actualCount / expectedCount) * 100) + '%' : '-';
      const summaryRows = [
        ['培训课题', name],
        ['讲师', event ? (event.instructor || '-') : '-'],
        ['应到人数', expectedCount || 0],
        ['实到人数', actualCount || 0],
        ['缺卡人数', absentCount],
        ['签到率', rate],
        ['缺卡人员', (absentNames || []).join('、') || '无']
      ];
      const ws2 = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
      ws2['!cols'] = [{ wch: 12 }, { wch: 40 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '签到明细');
      XLSX.utils.book_append_sheet(wb, ws2, '考勤汇总');
      XLSX.writeFile(wb, name + '_考勤分析_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('考勤数据导出成功');
    }

    async function removeEnrollmentAndRefresh(enrollId, trainingId) {
      if (!confirm('确定移除该学员的报名?')) return;
      try {
        const res = await fetch(API + '/training/' + trainingId + '/enrollments/' + enrollId, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
          toast('已移除报名');
          renderAnalyticsEnroll(trainingId);
        } else {
          toast(result.error || '移除失败', 'error');
        }
      } catch (err) {
        toast('操作失败', 'error');
      }
    }

    // ========== 数据分析 - 调研分析 ==========
    async function renderAnalyticsSurvey(trainingId) {
      const container = document.getElementById('analytics-content');
      container.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div><span class="ml-3 text-slate-500">加载调研数据...</span></div>';
      try {
        const [statusRes, respRes] = await Promise.all([
          fetch(API + '/training/' + trainingId + '/service-status'),
          fetch(API + '/training/' + trainingId + '/survey-responses')
        ]);
        const status = await statusRes.json();
        const respResult = await respRes.json();
        const survey = respResult.survey;
        const responses = respResult.data || [];
        _analyticsSurveyData = { survey, responses, trainingId };

        if (!survey) {
          container.innerHTML = `
            <div class="text-center py-20 text-slate-400">
              <i class="fas fa-poll text-4xl mb-4 block text-slate-300"></i>
              <p class="text-lg font-medium text-slate-600 mb-2">未关联满意度调研</p>
              <p class="text-sm mb-4">请先为该培训配置关联的满意度调研</p>
              <button onclick="editTraining(${trainingId})" class="px-5 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition text-sm font-medium">去配置调研</button>
            </div>`;
          return;
        }

        // 评分统计
        const ratingQuestions = (survey.questions || []).filter(q => q.type === 'rating');
        const ratingStats = ratingQuestions.map(q => {
          const values = responses.map(r => getSurveyAnswerValue(r.answers, q.id))
            .filter(v => v !== null && v !== undefined && v !== '');
          const avg = values.length > 0 ? (values.reduce((a, b) => a + parseFloat(b), 0) / values.length) : 0;
          return { title: q.title, avg: avg.toFixed(1), count: values.length };
        });

        const overallAvg = ratingStats.length > 0
          ? (ratingStats.reduce((s, r) => s + parseFloat(r.avg), 0) / ratingStats.length).toFixed(1)
          : '-';

        const ratingCards = ratingStats.map(r => `
          <div class="bg-slate-50 rounded-xl p-4">
            <p class="text-xs text-slate-500 mb-2 truncate" title="${r.title}">${r.title}</p>
            <div class="flex items-end gap-2">
              <p class="text-2xl font-bold text-slate-800">${r.avg}</p>
              <span class="text-xs text-slate-400 pb-1">/ 5分</span>
            </div>
            <div class="mt-2 bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div class="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style="width: ${(parseFloat(r.avg) / 5 * 100)}%"></div>
            </div>
            <p class="text-[10px] text-slate-400 mt-1">${r.count} 人评分</p>
          </div>`).join('');

        // 文本题统计
        const textQuestions = (survey.questions || []).filter(q => q.type !== 'rating');
        const textBlocks = textQuestions.map(q => {
          const answers = responses.map(r => getSurveyAnswerValue(r.answers, q.id))
            .filter(v => v !== null && v !== undefined && v !== '');
          const answerItems = answers.slice(0, 10).map(a => `<div class="p-2 bg-slate-50 rounded-lg text-xs text-slate-600">${a}</div>`).join('');
          return `
            <div class="mb-4">
              <h5 class="text-sm font-medium text-slate-700 mb-2">${q.title} <span class="text-xs text-slate-400">(${answers.length}条回答)</span></h5>
              <div class="space-y-1.5 max-h-40 overflow-y-auto">${answerItems || '<p class="text-xs text-slate-400">暂无回答</p>'}</div>
            </div>`;
        }).join('');

        // 填写人列表
        const responseRows = responses.length > 0
          ? responses.map((r, i) => `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
              <td class="px-4 py-2.5 text-sm text-slate-500">${i + 1}</td>
              <td class="px-4 py-2.5 text-sm font-medium text-slate-800">${r.userName || '匿名'}</td>
              <td class="px-4 py-2.5 text-sm text-slate-600">${r.department || '-'}</td>
              <td class="px-4 py-2.5 text-sm text-slate-500">${r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '-'}</td>
            </tr>`).join('')
          : `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400 text-sm">暂无人填写</td></tr>`;

        container.innerHTML = `
          <div class="p-6">
            <div class="grid grid-cols-3 gap-4 mb-6">
              <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><i class="fas fa-star text-blue-500 text-sm"></i></div>
                  <span class="text-xs text-blue-600/70">综合评分</span>
                </div>
                <p class="text-2xl font-bold text-blue-700">${overallAvg}</p>
              </div>
              <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><i class="fas fa-user-check text-emerald-500 text-sm"></i></div>
                  <span class="text-xs text-emerald-600/70">填写人数</span>
                </div>
                <p class="text-2xl font-bold text-emerald-700">${responses.length}</p>
              </div>
              <div class="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center"><i class="fas fa-question-circle text-purple-500 text-sm"></i></div>
                  <span class="text-xs text-purple-600/70">题目数量</span>
                </div>
                <p class="text-2xl font-bold text-purple-700">${(survey.questions || []).length}</p>
              </div>
            </div>
            ${ratingCards ? `<div class="mb-6"><h4 class="text-sm font-semibold text-slate-700 mb-3"><i class="fas fa-chart-line text-blue-400 mr-2"></i>评分统计</h4><div class="grid grid-cols-2 md:grid-cols-3 gap-3">${ratingCards}</div></div>` : ''}
            ${textBlocks ? `<div class="mb-6"><h4 class="text-sm font-semibold text-slate-700 mb-3"><i class="fas fa-comments text-blue-400 mr-2"></i>文字回答</h4>${textBlocks}</div>` : ''}
            <div>
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-semibold text-slate-700"><i class="fas fa-list-ul text-blue-400 mr-2"></i>填写人员明细</h4>
                <button onclick="exportAnalyticsSurvey()" class="px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-50 transition">
                  <i class="fas fa-file-excel mr-1"></i>导出
                </button>
              </div>
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full">
                  <thead class="bg-slate-50"><tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">填写人</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">部门</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">提交时间</th>
                  </tr></thead>
                  <tbody>${responseRows}</tbody>
                </table>
              </div>
            </div>
          </div>`;
      } catch (err) {
        container.innerHTML = '<div class="text-center py-20 text-slate-400"><i class="fas fa-exclamation-circle text-3xl mb-3 block"></i><p>加载调研数据失败</p></div>';
      }
    }

    // ========== 数据分析 - 考试分析 ==========
    async function renderAnalyticsExam(trainingId) {
      const container = document.getElementById('analytics-content');
      container.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div><span class="ml-3 text-slate-500">加载考试数据...</span></div>';
      try {
        const [statusRes, resultRes] = await Promise.all([
          fetch(API + '/training/' + trainingId + '/service-status'),
          fetch(API + '/training/' + trainingId + '/exam-results')
        ]);
        const status = await statusRes.json();
        const result = await resultRes.json();
        const exam = result.exam;
        const attempts = result.data || [];
        _analyticsExamData = { exam, attempts, trainingId };

        if (!exam) {
          container.innerHTML = `
            <div class="text-center py-20 text-slate-400">
              <i class="fas fa-file-alt text-4xl mb-4 block text-slate-300"></i>
              <p class="text-lg font-medium text-slate-600 mb-2">未关联考试</p>
              <p class="text-sm mb-4">请先为该培训配置关联的考试</p>
              <button onclick="editTraining(${trainingId})" class="px-5 py-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition text-sm font-medium">去配置考试</button>
            </div>`;
          return;
        }

        // 按学员聚合考试记录
        const userMap = {};
        attempts.forEach(a => {
          const uid = String(a.userId);
          if (!userMap[uid]) {
            userMap[uid] = {
              userId: a.userId,
              userName: a.userName || '未知用户',
              department: a.department || '-',
              position: a.position || '-',
              attempts: []
            };
          }
          userMap[uid].attempts.push(a);
        });
        const users = Object.values(userMap).map(u => {
          u.attempts.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
          const completedAttempts = u.attempts.filter(a => a.status === 'completed' && a.score !== null);
          u.bestScore = completedAttempts.length > 0 ? Math.max(...completedAttempts.map(a => a.score || 0)) : '-';
          u.passed = completedAttempts.some(a => a.passed);
          u.attemptCount = u.attempts.length;
          u.latestCompletedAt = completedAttempts[0]?.completedAt || u.attempts[0]?.completedAt;
          return u;
        });

        const passedCount = users.filter(u => u.passed).length;

        // 整体分数统计采用"最高分"策略（每人取最好成绩）
        const userBestScores = users
          .map(u => (typeof u.bestScore === 'number' ? u.bestScore : null))
          .filter(s => s !== null);
        const avgScore = userBestScores.length > 0
          ? (userBestScores.reduce((s, sc) => s + sc, 0) / userBestScores.length).toFixed(1)
          : '-';
        const maxScore = userBestScores.length > 0 ? Math.max(...userBestScores) : '-';
        const minScore = userBestScores.length > 0 ? Math.min(...userBestScores) : '-';
        const passRate = users.length > 0 ? Math.round((passedCount / users.length) * 100) : 0;

        // 分数段分布（按每人最高分统计）
        const scoreRanges = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '60以下': 0 };
        userBestScores.forEach(s => {
          if (s >= 90) scoreRanges['90-100']++;
          else if (s >= 80) scoreRanges['80-89']++;
          else if (s >= 70) scoreRanges['70-79']++;
          else if (s >= 60) scoreRanges['60-69']++;
          else scoreRanges['60以下']++;
        });
        const maxRange = Math.max(...Object.values(scoreRanges), 1);

        const rangeBars = Object.entries(scoreRanges).map(([range, count]) => {
          const pct = Math.round((count / maxRange) * 100);
          const color = range === '60以下' ? 'from-red-400 to-red-500' : range.startsWith('6') ? 'from-amber-400 to-amber-500' : 'from-emerald-400 to-emerald-500';
          return `
            <div class="flex items-center gap-3">
              <span class="text-xs text-slate-600 w-16 text-right">${range}</span>
              <div class="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div class="h-full bg-gradient-to-r ${color} rounded-full flex items-center justify-end pr-2" style="width: ${pct}%">
                  ${pct > 20 ? `<span class="text-[10px] text-white font-medium">${count}</span>` : ''}
                </div>
              </div>
              ${pct <= 20 ? `<span class="text-xs text-slate-500 w-6">${count}</span>` : '<span class="w-6"></span>'}
            </div>`;
        }).join('');

        const rows = users.length > 0
          ? users.map((u, i) => `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
              <td class="px-4 py-2.5 text-sm text-slate-500">${i + 1}</td>
              <td class="px-4 py-2.5 text-sm font-medium text-slate-800">${u.userName}</td>
              <td class="px-4 py-2.5 text-sm text-slate-600">${u.department}</td>
              <td class="px-4 py-2.5">
                <button onclick='openUserAttemptsModal(${JSON.stringify(u).replace(/'/g, "&#39;")})' class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition" title="查看每次考试记录">
                  <i class="fas fa-history mr-1"></i>${u.attemptCount} 次
                </button>
              </td>
              <td class="px-4 py-2.5 text-sm font-semibold ${u.passed ? 'text-emerald-600' : 'text-red-500'}">${u.bestScore}</td>
              <td class="px-4 py-2.5">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${u.passed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}">${u.passed ? '通过' : '未通过'}</span>
              </td>
              <td class="px-4 py-2.5 text-sm text-slate-500">${u.latestCompletedAt ? new Date(u.latestCompletedAt).toLocaleString('zh-CN') : '-'}</td>
              <td class="px-4 py-2.5">
                <button onclick='openUserAttemptDetailModal(${JSON.stringify(u).replace(/'/g, "&#39;")})' class="px-2.5 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-medium hover:bg-amber-100 transition" title="查看每次作答明细">
                  <i class="fas fa-eye mr-1"></i>查看详情
                </button>
              </td>
            </tr>`).join('')
          : `<tr><td colspan="8" class="px-4 py-12 text-center text-slate-400 text-sm">暂无人参加考试</td></tr>`;

        container.innerHTML = `
          <div class="p-6">
            <div class="grid grid-cols-5 gap-4 mb-6">
              <div class="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><i class="fas fa-users text-amber-500 text-sm"></i></div>
                  <span class="text-xs text-amber-600/70">参与人数</span>
                </div>
                <p class="text-2xl font-bold text-amber-700">${users.length}</p>
              </div>
              <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><i class="fas fa-chart-line text-blue-500 text-sm"></i></div>
                  <span class="text-xs text-blue-600/70">平均分</span>
                </div>
                <p class="text-2xl font-bold text-blue-700">${avgScore}</p>
              </div>
              <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><i class="fas fa-check-circle text-emerald-500 text-sm"></i></div>
                  <span class="text-xs text-emerald-600/70">通过率</span>
                </div>
                <p class="text-2xl font-bold text-emerald-700">${passRate}%</p>
              </div>
              <div class="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center"><i class="fas fa-trophy text-green-500 text-sm"></i></div>
                  <span class="text-xs text-green-600/70">最高分</span>
                </div>
                <p class="text-2xl font-bold text-green-700">${maxScore}</p>
              </div>
              <div class="bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center"><i class="fas fa-arrow-down text-red-500 text-sm"></i></div>
                  <span class="text-xs text-red-600/70">最低分</span>
                </div>
                <p class="text-2xl font-bold text-red-700">${minScore}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h4 class="text-sm font-semibold text-slate-700 mb-3"><i class="fas fa-chart-bar text-amber-400 mr-2"></i>分数段分布</h4>
                <div class="space-y-2">${rangeBars}</div>
              </div>
              <div class="flex items-center justify-center">
                <div class="relative w-36 h-36">
                  <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path class="text-slate-200" stroke="currentColor" stroke-width="3.5" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path class="text-emerald-500" stroke="currentColor" stroke-width="3.5" fill="none" stroke-dasharray="${passRate}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-2xl font-bold text-slate-800">${passRate}%</span>
                    <span class="text-[10px] text-slate-400">通过率</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-semibold text-slate-700"><i class="fas fa-list-ul text-amber-400 mr-2"></i>考试成绩明细</h4>
                <button onclick="exportAnalyticsExam()" class="px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-50 transition">
                  <i class="fas fa-file-excel mr-1"></i>导出
                </button>
              </div>
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full">
                  <thead class="bg-slate-50"><tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">姓名</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">部门</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">考试次数</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">最高分</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">状态</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">最近提交时间</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500">操作</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>`;
      } catch (err) {
        container.innerHTML = '<div class="text-center py-20 text-slate-400"><i class="fas fa-exclamation-circle text-3xl mb-3 block"></i><p>加载考试数据失败</p></div>';
      }
    }

    function openUserAttemptsModal(userData) {
      const attempts = (userData.attempts || []).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
      const rows = attempts.length > 0
        ? attempts.map((a, idx) => `
          <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
            <td class="px-4 py-3 text-sm text-slate-500">第 ${attempts.length - idx} 次</td>
            <td class="px-4 py-3 text-sm font-semibold ${a.passed ? 'text-emerald-600' : 'text-red-500'}">${a.score ?? '-'}</td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${a.passed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}">${a.passed ? '通过' : '未通过'}</span>
            </td>
            <td class="px-4 py-3 text-sm text-slate-600">${a.correctCount ?? '-'}/${a.totalQuestions ?? '-'}</td>
            <td class="px-4 py-3 text-sm text-slate-500">${a.completedAt ? new Date(a.completedAt).toLocaleString('zh-CN') : '-'}</td>
            <td class="px-4 py-3 text-sm text-slate-500">${a.durationUsed ? Math.round(a.durationUsed / 60) + ' 分钟' : '-'}</td>
          </tr>`).join('')
        : '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400 text-sm">暂无考试记录</td></tr>';

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <div>
              <h3 class="text-lg font-semibold text-slate-800">${userData.userName} 的考试记录</h3>
              <p class="text-xs text-slate-400 mt-0.5">共 ${attempts.length} 次考试，最佳分数 ${userData.bestScore ?? '-'} 分</p>
            </div>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-6 overflow-auto">
            <div class="overflow-x-auto rounded-xl border border-slate-100">
              <table class="w-full">
                <thead class="bg-slate-50"><tr>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">次数</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">分数</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">状态</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">正确题数</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">提交时间</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">用时</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </div>`);
    }

    async function openUserAttemptDetailModal(userData) {
      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <div>
              <h3 class="text-lg font-semibold text-slate-800">${userData.userName} 的作答明细</h3>
              <p class="text-xs text-slate-400 mt-0.5">正在加载题目与答案...</p>
            </div>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-6 overflow-auto flex-1 flex items-center justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
          </div>
        </div>`);

      try {
        const exam = _analyticsExamData && _analyticsExamData.exam;
        if (!exam || !exam.questions || exam.questions.length === 0) {
          toast('该考试未配置题目，无法查看作答明细', 'warning');
          closeModal();
          return;
        }

        const questionsRes = await fetch(API + '/questions');
        const questionsResult = await questionsRes.json();
        const allQuestions = questionsResult.data || [];
        const questionMap = {};
        allQuestions.forEach(q => { questionMap[String(q.id)] = q; });

        const attempts = (userData.attempts || []).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
        let attemptsHtml = '';
        attempts.forEach((attempt, idx) => {
          const answers = attempt.answers || {};
          const attemptQuestionsHtml = exam.questions.map((pq, qidx) => {
            const q = questionMap[String(pq.questionId)];
            if (!q) return '';
            const userAnswer = answers[String(pq.questionId)];
            const isCorrect = isAnswerCorrect(q, userAnswer);
            const answerText = renderUserAnswer(q, userAnswer);
            const correctText = renderCorrectAnswer(q);
            return `
              <div class="border border-slate-100 rounded-xl p-4 mb-3 ${isCorrect ? 'bg-emerald-50/30' : 'bg-red-50/30'}">
                <div class="flex items-start gap-3 mb-3">
                  <span class="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold">${qidx + 1}</span>
                  <div class="flex-1">
                    <p class="text-sm font-medium text-slate-800">${escHtml(q.content || q.title || '无题')}</p>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium mt-1 ${isCorrect ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}">${isCorrect ? '回答正确' : '回答错误'}</span>
                  </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div class="bg-white rounded-lg p-3 border border-slate-100">
                    <p class="text-xs text-slate-400 mb-1">学员答案</p>
                    <div class="text-slate-700">${answerText}</div>
                  </div>
                  <div class="bg-white rounded-lg p-3 border border-slate-100">
                    <p class="text-xs text-slate-400 mb-1">参考答案</p>
                    <div class="text-slate-700">${correctText}</div>
                  </div>
                </div>
              </div>`;
          }).join('');

          attemptsHtml += `
            <div class="mb-6">
              <div class="flex items-center gap-3 mb-3 pb-2 border-b border-slate-100">
                <span class="px-3 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-600">第 ${attempts.length - idx} 次</span>
                <span class="text-sm font-semibold ${attempt.passed ? 'text-emerald-600' : 'text-red-500'}">${attempt.score ?? '-'} 分</span>
                <span class="text-xs text-slate-400">${attempt.completedAt ? new Date(attempt.completedAt).toLocaleString('zh-CN') : '-'}</span>
                ${attempt.durationUsed ? `<span class="text-xs text-slate-400">用时 ${Math.round(attempt.durationUsed / 60)} 分钟</span>` : ''}
              </div>
              ${attemptQuestionsHtml}
            </div>`;
        });

        showModal(`
          <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 class="text-lg font-semibold text-slate-800">${userData.userName} 的作答明细</h3>
                <p class="text-xs text-slate-400 mt-0.5">共 ${attempts.length} 次作答</p>
              </div>
              <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
            </div>
            <div class="p-6 overflow-auto">${attemptsHtml || '<p class="text-center text-slate-400 py-8">暂无作答数据</p>'}</div>
          </div>`);
      } catch (err) {
        toast('加载作答明细失败', 'error');
        closeModal();
      }
    }

    function isChoiceType(type) {
      return type === 'choice' || type === 'single' || type === 'multiple';
    }

    function normalizeAnswerToIndices(answer) {
      if (answer === undefined || answer === null || answer === '') return [];
      if (Array.isArray(answer)) return answer.map(x => parseInt(x)).filter(x => !isNaN(x));
      if (typeof answer === 'number') return [answer];
      const str = String(answer).trim().toUpperCase();
      if (/^[A-Z]+$/.test(str)) return str.split('').map(ch => ch.charCodeAt(0) - 65);
      const num = parseInt(str);
      return isNaN(num) ? [] : [num];
    }

    function isAnswerCorrect(q, userAnswer) {
      if (userAnswer === undefined || userAnswer === null || userAnswer === '') return false;
      if (q.type === 'judge') {
        const userVal = String(userAnswer).toLowerCase();
        const correctVal = String(q.answer).toLowerCase();
        const userBool = userVal === 'true' || userVal === '1' || userVal === '正确';
        const correctBool = correctVal === 'true' || correctVal === '1' || correctVal === '正确';
        return userBool === correctBool;
      }
      if (isChoiceType(q.type)) {
        const userIndices = normalizeAnswerToIndices(userAnswer);
        const correctIndices = normalizeAnswerToIndices(q.answer);
        if (userIndices.length === 0 || correctIndices.length === 0) return false;
        return userIndices.length === correctIndices.length && userIndices.every(idx => correctIndices.includes(idx));
      }
      // 填空/简答：简单文本对比
      return String(userAnswer).trim() === String(q.answer || '').trim();
    }

    function renderUserAnswer(q, answer) {
      if (answer === undefined || answer === null || answer === '') return '<span class="text-slate-400">未作答</span>';
      if (isChoiceType(q.type)) {
        const selected = normalizeAnswerToIndices(answer);
        if (selected.length === 0) return escHtml(String(answer));
        const labels = selected.map(idx => {
          const opt = (q.options || [])[idx];
          return opt !== undefined ? String.fromCharCode(65 + idx) + '. ' + escHtml(String(opt)) : '-';
        });
        return labels.join('<br>');
      }
      if (q.type === 'judge') {
        const val = String(answer).toLowerCase();
        return val === 'true' || val === '1' || val === '正确' ? '正确' : (val === 'false' || val === '0' || val === '错误' ? '错误' : escHtml(String(answer)));
      }
      return escHtml(String(answer));
    }

    function renderCorrectAnswer(q) {
      if (isChoiceType(q.type)) {
        const correct = normalizeAnswerToIndices(q.answer);
        if (correct.length === 0) return escHtml(String(q.answer || ''));
        const labels = correct.map(idx => {
          const opt = (q.options || [])[idx];
          return opt !== undefined ? String.fromCharCode(65 + idx) + '. ' + escHtml(String(opt)) : '-';
        });
        return labels.join('<br>');
      }
      if (q.type === 'judge') {
        const val = String(q.answer).toLowerCase();
        return val === 'true' || val === '1' || val === '正确' ? '正确' : (val === 'false' || val === '0' || val === '错误' ? '错误' : escHtml(String(q.answer)));
      }
      return escHtml(String(q.answer || ''));
    }

    // ========== 数据分析 - 考勤分析 ==========
    async function renderAnalyticsAttendance(trainingId) {
      const container = document.getElementById('analytics-content');
      container.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div><span class="ml-3 text-slate-500">加载考勤数据...</span></div>';
      try {
        const res = await fetch(API + '/training/' + trainingId + '/signins');
        const result = await res.json();
        const signins = result.data || [];
        const event = data.training.find(x => x.id === trainingId);
        _analyticsAttendanceData = { signins, event, trainingId };

        // 获取报名人数作为应到人数
        let expectedCount = 0;
        try {
          const enrollRes = await fetch(API + '/training/' + trainingId + '/enroll-count');
          const enrollData = await enrollRes.json();
          expectedCount = enrollData.count || 0;
        } catch(e) { /* ignore */ }

        const actualCount = signins.length;
        const absentCount = Math.max(0, expectedCount - actualCount);
        const attendanceRate = expectedCount > 0 ? Math.round((actualCount / expectedCount) * 100) : 0;

        // 签到时间分布
        let earliestSignin = '-', latestSignin = '-';
        if (signins.length > 0) {
          const sorted = [...signins].sort((a, b) => new Date(a.signedAt) - new Date(b.signedAt));
          earliestSignin = new Date(sorted[0].signedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          latestSignin = new Date(sorted[sorted.length - 1].signedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }

        // 获取报名人员列表来计算缺卡人员
        let absentNames = [];
        try {
          const enrollRes = await fetch(API + '/training/' + trainingId + '/enrollments');
          const enrollData = await enrollRes.json();
          const enrolledUsers = (enrollData.data || []).map(e => e.userId);
          const signedUserIds = new Set(signins.map(s => s.userId));
          const enrollments = enrollData.data || [];
          absentNames = enrollments.filter(e => !signedUserIds.has(e.userId)).map(e => e.userName || '未知');
        } catch(e) { /* ignore */ }
        _analyticsAttendanceData.absentNames = absentNames;
        _analyticsAttendanceData.expectedCount = expectedCount;
        _analyticsAttendanceData.actualCount = actualCount;

        const rows = signins.length > 0
          ? signins.map((s, i) => {
            const seed = encodeURIComponent(s.userName || s.userId);
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
            return `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
              <td class="px-4 py-2.5 text-sm text-slate-500">${i + 1}</td>
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2">
                  <img src="${avatarUrl}" class="w-7 h-7 rounded-full object-cover" />
                  <span class="text-sm font-medium text-slate-800">${s.userName || '-'}</span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-sm text-slate-600">${s.department || '-'}</td>
              <td class="px-4 py-2.5 text-sm text-slate-500">${new Date(s.signedAt).toLocaleString('zh-CN')}</td>
              <td class="px-4 py-2.5">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-600">已签到</span>
              </td>
            </tr>`;
          }).join('')
          : `<tr><td colspan="5" class="px-4 py-12 text-center text-slate-400 text-sm">暂无签到记录</td></tr>`;

        container.innerHTML = `
          <div class="p-6">
            <div class="grid grid-cols-4 gap-4 mb-6">
              <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><i class="fas fa-clipboard-check text-emerald-500 text-sm"></i></div>
                  <span class="text-xs text-emerald-600/70">签到率</span>
                </div>
                <p class="text-2xl font-bold text-emerald-700">${expectedCount > 0 ? attendanceRate + '%' : '-'}</p>
              </div>
              <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><i class="fas fa-user-clock text-blue-500 text-sm"></i></div>
                  <span class="text-xs text-blue-600/70">应到人数</span>
                </div>
                <p class="text-2xl font-bold text-blue-700">${expectedCount}</p>
              </div>
              <div class="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center"><i class="fas fa-check text-green-500 text-sm"></i></div>
                  <span class="text-xs text-green-600/70">实到人数</span>
                </div>
                <p class="text-2xl font-bold text-green-700">${actualCount}</p>
              </div>
              <div class="bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center"><i class="fas fa-user-times text-red-500 text-sm"></i></div>
                  <span class="text-xs text-red-600/70">缺卡人数</span>
                </div>
                <p class="text-2xl font-bold text-red-700">${absentCount}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h4 class="text-sm font-semibold text-slate-700 mb-3"><i class="fas fa-info-circle text-emerald-400 mr-2"></i>签到概况</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between p-2 bg-slate-50 rounded-lg"><span class="text-slate-500">培训课题</span><span class="font-medium text-slate-800">${event ? event.name : '-'}</span></div>
                  <div class="flex justify-between p-2 bg-slate-50 rounded-lg"><span class="text-slate-500">讲师</span><span class="font-medium text-slate-800">${event ? (event.instructor || '-') : '-'}</span></div>
                  <div class="flex justify-between p-2 bg-slate-50 rounded-lg"><span class="text-slate-500">最早签到</span><span class="font-medium text-emerald-600">${earliestSignin}</span></div>
                  <div class="flex justify-between p-2 bg-slate-50 rounded-lg"><span class="text-slate-500">最晚签到</span><span class="font-medium text-amber-600">${latestSignin}</span></div>
                </div>
              </div>
              ${absentNames.length > 0 ? `
              <div>
                <h4 class="text-sm font-semibold text-slate-700 mb-3"><i class="fas fa-user-times text-red-400 mr-2"></i>缺卡人员</h4>
                <div class="flex flex-wrap gap-2">
                  ${absentNames.map(name => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600"><i class="fas fa-user text-[8px]"></i>${name}</span>`).join('')}
                </div>
              </div>` : ''}
            </div>
            <div>
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-semibold text-slate-700"><i class="fas fa-list-ul text-emerald-400 mr-2"></i>签到明细</h4>
                <button onclick="exportAnalyticsAttendance()" class="px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-50 transition">
                  <i class="fas fa-file-excel mr-1"></i>导出
                </button>
              </div>
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full">
                  <thead class="bg-slate-50"><tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">姓名</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">部门</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">签到时间</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">状态</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>`;
      } catch (err) {
        container.innerHTML = '<div class="text-center py-20 text-slate-400"><i class="fas fa-exclamation-circle text-3xl mb-3 block"></i><p>加载考勤数据失败</p></div>';
      }
    }

    function renderTrainingCalendar() {
      const grid = document.getElementById('training-calendar-grid');
      if (!grid) return;
      grid.innerHTML = '';

      const firstDay = new Date(trainingCurrentYear, trainingCurrentMonth, 1);
      const lastDay = new Date(trainingCurrentYear, trainingCurrentMonth + 1, 0);
      const startDay = firstDay.getDay();
      const events = data.training || [];

      for (let i = 0; i < startDay; i++) {
        grid.innerHTML += '<div class="aspect-square"></div>';
      }

      for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr = `${trainingCurrentYear}-${String(trainingCurrentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = events.filter(e => e.date === dateStr);
        const todayLocal = new Date();
        const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth()+1).padStart(2,'0')}-${String(todayLocal.getDate()).padStart(2,'0')}`;
        const isToday = dateStr === todayStr;
        const holidayName = trainingHolidays[dateStr];
        const weekDay = new Date(trainingCurrentYear, trainingCurrentMonth, day).getDay();
        const isWeekend = weekDay === 0 || weekDay === 6;

        let cellClass = 'aspect-square rounded-lg p-2 cursor-pointer transition-all duration-300 border border-gray-100 overflow-hidden';
        if (holidayName) {
          cellClass += ' bg-gradient-to-br from-red-50 to-red-100 hover:shadow-md hover:-translate-y-0.5';
        } else if (isWeekend) {
          cellClass += ' bg-gradient-to-br from-purple-50 to-purple-100 hover:shadow-md hover:-translate-y-0.5';
        } else {
          cellClass += ' bg-gradient-to-br from-white to-gray-50 hover:shadow-md hover:-translate-y-0.5';
        }
        if (isToday) {
          cellClass += ' ring-2 ring-indigo-400/40 ring-offset-2';
        }

        let eventsHtml = '';
        if (dayEvents.length > 0) {
          eventsHtml = dayEvents.slice(0, 2).map(e => {
            const cat = trainingCategories[e.project] || { color: 'bg-gray-100 text-gray-600' };
            return `
              <div class="mt-1 truncate">
                <span class="${cat.color} inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold">
                  ${e.project}
                </span>
                <div class="mt-0.5 text-gray-800 text-sm font-medium truncate leading-tight">${e.name}</div>
                <div class="text-gray-400 text-xs truncate leading-tight">${e.instructor || ''}</div>
              </div>
            `;
          }).join('');
          if (dayEvents.length > 2) {
            eventsHtml += `<div class="mt-0.5 text-gray-400 text-[10px] text-center">+${dayEvents.length - 2}</div>`;
          }
        } else if (holidayName) {
          eventsHtml = `<div class="mt-1 text-red-500 text-xs font-medium text-center">${holidayName}</div>`;
        }

        grid.innerHTML += `
          <div class="${cellClass}" onclick="handleTrainingDayClick('${dateStr}')">
            <div class="flex flex-col h-full relative overflow-hidden">
              ${holidayName ? '<span class="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded flex items-center justify-center shadow-sm">休</span>' : ''}
              <div class="flex justify-between items-start">
                <span class="${isToday ? 'bg-indigo-500 text-white' : 'bg-purple-100 text-purple-600'} rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium shadow-sm">${day}</span>
                <span class="text-gray-400 text-[10px]">${dayEvents.length > 0 ? dayEvents.length + '场' : ''}</span>
              </div>
              ${eventsHtml}
            </div>
          </div>
        `;
      }

      document.getElementById('training-current-month').textContent = `${trainingCurrentYear}年${trainingCurrentMonth + 1}月`;
    }

    async function renderTrainingList() {
      const tbody = document.getElementById('training-table-body');
      const emptyState = document.getElementById('training-list-empty');
      let events = data.training || [];

      // 搜索和筛选
      const searchEl = document.getElementById('training-search');
      const projectEl = document.getElementById('training-project-filter');
      const search = searchEl ? searchEl.value.toLowerCase() : '';
      const project = projectEl ? projectEl.value : '';

      if (search || project) {
        events = events.filter(e => {
          const matchSearch = !search || (
            (e.project && e.project.toLowerCase().includes(search)) ||
            (e.name && e.name.toLowerCase().includes(search)) ||
            (e.instructor && e.instructor.toLowerCase().includes(search)) ||
            (e.location && e.location.toLowerCase().includes(search))
          );
          const matchProject = !project || e.project === project;
          return matchSearch && matchProject;
        });
      }

      if (events.length === 0 && (data.training || []).length > 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-search text-3xl mb-3"></i><p>未找到匹配的培训记录</p></td></tr>`;
        emptyState.classList.add('hidden');
        return;
      }

      if ((data.training || []).length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
      }
      emptyState.classList.add('hidden');

      // 批量获取报名人数
      const enrollCounts = {};
      try {
        const results = await Promise.all(events.map(e =>
          fetch(API + '/training/' + e.id + '/enroll-count').then(r => r.json()).then(d => ({ id: e.id, count: d.count || 0 }))
        ));
        results.forEach(r => { enrollCounts[r.id] = r.count; });
      } catch(e) { /* 获取失败不影响列表展示 */ }

      tbody.innerHTML = events.map(e => {
        const cat = trainingCategories[e.project] || { color: 'bg-slate-100 text-slate-600' };
        const start = e.startTime ? (e.startTime.includes('T') ? e.startTime.replace('T', ' ') : e.startTime) : '-';
        const end = e.endTime ? (e.endTime.includes('T') ? e.endTime.replace('T', ' ') : e.endTime) : '-';
        // 集成服务状态
        const hasSignin = e.signinEnabled;
        const hasSurvey = e.linkedSurveyId;
        const hasExam = e.linkedExamId;
        const serviceBadges = [];
        if (hasSignin) serviceBadges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600"><i class="fas fa-check-circle text-[8px]"></i>签到</span>`);
        if (hasSurvey) serviceBadges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600"><i class="fas fa-poll text-[8px]"></i>调研</span>`);
        if (hasExam) serviceBadges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600"><i class="fas fa-file-alt text-[8px]"></i>考试</span>`);
        const serviceHtml = serviceBadges.length > 0 ? `<div class="flex flex-wrap gap-1 justify-center">${serviceBadges.join('')}</div>` : '<span class="text-xs text-slate-300">-</span>';
        const enrollCount = enrollCounts[e.id] || 0;
        const checked = trainingSelectedIds.has(String(e.id)) ? 'checked' : '';
        return `
          <tr class="hover:bg-slate-50 transition-colors" data-training-id="${e.id}">
            <td class="pl-5 pr-2 py-4 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" class="training-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleTrainingSelect('${e.id}')" ${checked}>
            </td>
            <td class="px-6 py-4"><span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cat.color}"><i class="fas ${cat.icon || 'fa-tag'} text-[10px]"></i>${e.project}</span></td>
            <td class="px-6 py-4 text-sm font-medium text-slate-800">${e.name}</td>
            <td class="px-6 py-4 text-sm text-slate-600">${e.instructor || '-'}</td>
            <td class="px-6 py-4 text-sm text-slate-600">${e.location || '-'}</td>
            <td class="px-6 py-4 text-sm text-slate-600">${start}</td>
            <td class="px-6 py-4 text-sm text-slate-600">${end}</td>
            <td class="px-6 py-4 text-center">${serviceHtml}</td>
            <td class="px-6 py-4 text-center">
              <span class="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold ${enrollCount > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}">${enrollCount}</span>
            </td>
            <td class="px-6 py-4 text-right">
              <div class="flex items-center justify-end gap-1">
                <button onclick="openTrainingImageUpload(${e.id})" class="p-2 text-pink-500 hover:bg-pink-50 rounded-lg transition cursor-pointer" title="上传图片"><i class="fas fa-image"></i></button>
                <button onclick="openTrainingAnalytics(${e.id})" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="数据分析"><i class="fas fa-chart-pie"></i></button>
                <button onclick="openTrainingShareModal(${e.id})" class="p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition" title="分享"><i class="fas fa-share-alt"></i></button>
                <button onclick="downloadTrainingQR(${e.id}, this)" class="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition" title="下载签到海报"><i class="fas fa-qrcode"></i></button>
                <button onclick="editTraining(${e.id})" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition" title="编辑"><i class="fas fa-edit"></i></button>
                <button onclick="deleteTraining(${e.id})" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition" title="删除"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 下载移动端培训签到二维码海报（员工扫码进入 /m/training.html?id=ID）
    function downloadTrainingQR(id, btn) {
      const training = (data.training || []).find(t => String(t.id) === String(id));
      if (!training) { toast('培训不存在', 'error'); return; }
      if (typeof QRCode === 'undefined') { toast('二维码组件未加载', 'error'); return; }

      // 按钮 loading 态
      const trigger = btn || document.querySelector(`button[onclick*="downloadTrainingQR(${id}"]`);
      const origHtml = trigger ? trigger.innerHTML : '';
      if (trigger) {
        trigger.disabled = true;
        trigger.style.pointerEvents = 'none';
        trigger.style.opacity = '0.7';
        trigger.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      }

      const canvas = document.createElement('canvas');
      canvas.width = 654; canvas.height = 1066;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const fontBase = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';

      // 1) 背景
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, W, H);

      // 预计算签到时间文本（用于紫色头栏内展示）
      const fmtDateTime = (v) => {
        if (!v) return null;
        const s = v.includes('T') ? v.replace('T', ' ') : String(v);
        const [datePart, timePart] = s.split(' ');
        const m = datePart && datePart.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return { dateLabel: s, timeLabel: '' };
        const [, y, mo, d] = m;
        return { dateLabel: `${y}年${parseInt(mo)}月${parseInt(d)}日`, timeLabel: timePart || '' };
      };
      const sStart = fmtDateTime(training.signinStartTime || training.startTime);
      const sEnd = fmtDateTime(training.signinEndTime || training.endTime);
      let timeText = '签到时间：';
      if (sStart && sStart.timeLabel && sEnd && sEnd.timeLabel) {
        timeText += (sStart.dateLabel === sEnd.dateLabel)
          ? `${sStart.dateLabel} ${sStart.timeLabel} ~ ${sEnd.timeLabel}`
          : `${sStart.dateLabel} ${sStart.timeLabel} ~ ${sEnd.dateLabel} ${sEnd.timeLabel}`;
      } else if (sStart) {
        timeText += sStart.timeLabel ? `${sStart.dateLabel} ${sStart.timeLabel}` : sStart.dateLabel;
      } else {
        timeText += '待定，请关注培训通知';
      }

      // 2) 顶部紫色头栏（直角 banner，高度 280）
      const headerH = 280;
      const headerGrad = ctx.createLinearGradient(0, 0, W, headerH);
      headerGrad.addColorStop(0, '#667eea');
      headerGrad.addColorStop(1, '#764ba2');
      ctx.fillStyle = headerGrad;
      ctx.fillRect(0, 0, W, headerH);

      // 头栏装饰圆
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath(); ctx.arc(W - 40, 55, 100, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.arc(50, headerH - 25, 80, 0, Math.PI * 2); ctx.fill();

      // 标题
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = `bold 42px ${fontBase}`;
      ctx.fillText('签到二维码', W / 2, 95);

      // 培训名称
      ctx.font = `28px ${fontBase}`;
      fillTextWithWrap(ctx, training.name || training.project || '未命名培训', W / 2, 148, W - 80, 38, 'center');

      // 签到时间（头栏内，白色小字）
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `20px ${fontBase}`;
      ctx.fillText(timeText, W / 2, 210);

      // 3) 生成二维码
      const url = location.origin + '/m/training.html?id=' + id;
      const qrSize = 360;
      const qrContainer = document.createElement('div');
      qrContainer.style.position = 'fixed';
      qrContainer.style.left = '-9999px';
      document.body.appendChild(qrContainer);

      try {
        new QRCode(qrContainer, {
          text: url,
          width: qrSize,
          height: qrSize,
          colorDark: '#1e293b',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });

        setTimeout(() => {
          try {
            const qrCanvas = qrContainer.querySelector('canvas');
            const qrX = (W - qrSize) / 2;
            // 解决签到码：优先用已有，缺失则本地生成并尝试回写
            let signinId = training.signinId;
            if (!signinId) {
              signinId = String(1000 + Math.floor(Math.random() * 9000));
              try {
                fetch(`/api/training/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ signinId })
                }).catch(() => {});
              } catch (e) {}
            }

            // 二维码在「头栏下方 → 签到码」区域垂直居中（下方预留签到码空间）
            const qrTop = headerH + 50;
            const bottomBound = H - 150;
            const reserveCode = 78;
            const regionBottom = bottomBound - reserveCode;
            const cardH = qrSize + 32;
            const qrY = qrTop + Math.max(30, (regionBottom - qrTop - cardH) / 2) + 16;
            if (qrCanvas) {
              // 二维码白色底 + 细边框（直角，风格统一）
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
              ctx.strokeStyle = 'rgba(118, 75, 162, 0.15)';
              ctx.lineWidth = 2;
              ctx.strokeRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
              ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
            }

            // 签到码（二维码正下方，手机端可扫码或手动输入）
            const codeY = qrY + cardH + 30;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#764ba2';
            ctx.font = `22px ${fontBase}`;
            ctx.fillText('签到码', W / 2, codeY);
            ctx.fillStyle = '#1e293b';
            ctx.font = `bold 40px ${fontBase}`;
            // 数字间距拉开，便于识别
            const spaced = String(signinId).split('').join('  ');
            ctx.fillText(spaced, W / 2, codeY + 44);

            // 5) 底部提示
            ctx.fillStyle = '#764ba2';
            ctx.font = `26px ${fontBase}`;
            ctx.textAlign = 'center';
            ctx.fillText('长按或扫描查看', W / 2, H - 70);

            // 底部装饰线
            ctx.strokeStyle = 'rgba(118, 75, 162, 0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(W / 2 - 90, H - 40);
            ctx.lineTo(W / 2 + 90, H - 40);
            ctx.stroke();

            // 7) 下载
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = '签到二维码_' + (training.name || '培训') + '.png';
            document.body.appendChild(a); a.click(); a.remove();
            toast('签到二维码海报已下载');
          } catch (err) {
            console.error('[QR Poster] 绘制失败', err);
            toast('海报生成失败', 'error');
          } finally {
            if (qrContainer.parentNode) qrContainer.remove();
            if (trigger) {
              trigger.disabled = false;
              trigger.style.pointerEvents = '';
              trigger.style.opacity = '';
              trigger.innerHTML = origHtml;
            }
          }
        }, 180);
      } catch (e) {
        console.error('[QR] 生成失败', e);
        toast('二维码生成失败', 'error');
        if (qrContainer.parentNode) qrContainer.remove();
        if (trigger) {
          trigger.disabled = false;
          trigger.style.pointerEvents = '';
          trigger.style.opacity = '';
          trigger.innerHTML = origHtml;
        }
      }
    }

    function toggleTrainingSelect(id) {
      const sid = String(id);
      if (trainingSelectedIds.has(sid)) trainingSelectedIds.delete(sid);
      else trainingSelectedIds.add(sid);
      updateTrainingSelectAllState();
      updateTrainingBatchActionBar();
    }

    function toggleTrainingSelectAll() {
      const checked = document.getElementById('trainingSelectAll').checked;
      const visible = data.training || [];
      if (checked) visible.forEach(e => trainingSelectedIds.add(String(e.id)));
      else visible.forEach(e => trainingSelectedIds.delete(String(e.id)));
      renderTrainingList(visible);
      updateTrainingBatchActionBar();
    }

    function updateTrainingSelectAllState() {
      const visible = data.training || [];
      const allChecked = visible.length > 0 && visible.every(e => trainingSelectedIds.has(String(e.id)));
      const el = document.getElementById('trainingSelectAll');
      if (el) el.checked = allChecked;
    }

    function updateTrainingBatchActionBar() {
      const bar = document.getElementById('trainingBatchActionBar');
      const count = document.getElementById('trainingBatchCount');
      if (!bar || !count) return;
      if (trainingSelectedIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = `已选 ${trainingSelectedIds.size} 项`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function clearTrainingSelection() {
      trainingSelectedIds.clear();
      const el = document.getElementById('trainingSelectAll');
      if (el) el.checked = false;
      renderTrainingList(data.training || []);
      updateTrainingBatchActionBar();
    }

    async function batchDeleteTrainings() {
      const ids = Array.from(trainingSelectedIds);
      if (!ids.length) return;
      if (!confirm(`确定删除选中的 ${ids.length} 个培训吗？`)) return;
      let success = 0, fail = 0;
      for (const id of ids) {
        try {
          const ok = await deleteTraining(id, false);
          if (ok) success++; else fail++;
        } catch (e) { fail++; }
      }
      clearTrainingSelection();
      await loadAllData();
      renderTraining();
      toast(`删除完成：成功 ${success}，失败 ${fail}`);
    }

    // ========== 轮播管理 批量操作 ==========
    function toggleBannerSelect(id) {
      const sid = String(id);
      if (bannerSelectedIds.has(sid)) bannerSelectedIds.delete(sid);
      else bannerSelectedIds.add(sid);
      updateBannerBatchActionBar();
    }
    function toggleBannerSelectAll() {
      const checked = document.getElementById('bannerSelectAll').checked;
      bannerSelectedIds.clear();
      if (checked) {
        document.querySelectorAll('.banner-row-check').forEach(cb => {
          const val = cb.getAttribute('onchange')?.match(/toggleBannerSelect\(['"]?(\d+)['"]?\)/)?.[1];
          if (val) bannerSelectedIds.add(val);
        });
      }
      loadCarousels();
      updateBannerBatchActionBar();
    }
    function updateBannerBatchActionBar() {
      const bar = document.getElementById('bannerBatchActionBar');
      const count = document.getElementById('bannerBatchCount');
      if (!bar || !count) return;
      if (bannerSelectedIds.size > 0) { bar.classList.remove('hidden'); count.textContent = `已选 ${bannerSelectedIds.size} 项`; }
      else { bar.classList.add('hidden'); }
    }
    function clearBannerSelection() { bannerSelectedIds.clear(); loadCarousels(); updateBannerBatchActionBar(); }
    async function batchDeleteBanners() {
      const ids = Array.from(bannerSelectedIds); if (!ids.length) return;
      if (!confirm(`确定删除选中的 ${ids.length} 个轮播图吗？`)) return;
      for (const id of ids) { try { await deleteCarousel(Number(id)); } catch(e){} }
      clearBannerSelection(); toast(`已删除 ${ids.length} 个轮播图`);
    }

    // ========== 公告管理 批量操作 ==========
    function toggleNoticeSelect(id) {
      const sid = String(id);
      if (noticeSelectedIds.has(sid)) noticeSelectedIds.delete(sid); else noticeSelectedIds.add(sid);
      updateNoticeBatchActionBar();
    }
    function toggleNoticeSelectAll() {
      const checked = document.getElementById('noticeSelectAll').checked;
      noticeSelectedIds.clear();
      if (checked) { document.querySelectorAll('.notice-row-check').forEach(cb => { const m = cb.getAttribute('onchange')?.match(/toggleNoticeSelect\(['"]?(\d+)['"]?\)/); if(m) noticeSelectedIds.add(m[1]); }); }
      renderPortalNotices(); updateNoticeBatchActionBar();
    }
    function updateNoticeBatchActionBar() {
      const bar = document.getElementById('noticeBatchActionBar'), count = document.getElementById('noticeBatchCount');
      if(!bar||!count)return; if(noticeSelectedIds.size>0){bar.classList.remove('hidden');count.textContent=`已选 ${noticeSelectedIds.size} 项`;}else bar.classList.add('hidden');
    }
    function clearNoticeSelection() { noticeSelectedIds.clear(); renderPortalNotices(); updateNoticeBatchActionBar(); }
    async function batchDeleteNotices() {
      const ids=Array.from(noticeSelectedIds);if(!ids.length)return;
      if(!confirm(`确定删除选中的 ${ids.length} 条公告吗？`))return;
      for(const id of ids){try{await deleteNotice(Number(id));}catch(e){}} clearNoticeSelection(); toast(`已删除 ${ids.length} 条公告`);
    }

    // ========== 讲师报名 批量操作 ==========
    function toggleApplicationSelect(id) { const s=String(id); if(applicationSelectedIds.has(s)) applicationSelectedIds.delete(s); else applicationSelectedIds.add(s); updateApplicationBatchActionBar(); }
    function toggleApplicationSelectAll() {
      const c=document.getElementById('applicationSelectAll').checked; applicationSelectedIds.clear();
      if(c) document.querySelectorAll('.application-row-check').forEach(cb=>{const m=cb.getAttribute('onchange')?.match(/toggleApplicationSelect\(['"]?(\d+)['"]?\)/);if(m)applicationSelectedIds.add(m[1]);});
      loadLecturerApplications();updateApplicationBatchActionBar();
    }
    function updateApplicationBatchActionBar(){const b=document.getElementById('applicationBatchActionBar'),c=document.getElementById('applicationBatchCount');if(!b||!c)return;if(applicationSelectedIds.size>0){b.classList.remove('hidden');c.textContent=`已选 ${applicationSelectedIds.size} 项`;}else b.classList.add('hidden');}
    function clearApplicationSelection(){applicationSelectedIds.clear();loadLecturerApplications();updateApplicationBatchActionBar();}
    async function batchApproveApplications(){const ids=Array.from(applicationSelectedIds);if(!ids.length)return;if(!confirm(`批量通过 ${ids.length} 个？`))return;for(const i of ids){try{await approveApplication(Number(i),'approved');}catch(e){}}clearApplicationSelection();toast(`已通过 ${ids.length} 个`);}
    async function batchRejectApplications(){const ids=Array.from(applicationSelectedIds);if(!ids.length)return;if(!confirm(`批量拒绝 ${ids.length} 个？`))return;for(const i of ids){try{await approveApplication(Number(i),'rejected');}catch(e){}}clearApplicationSelection();toast(`已拒绝 ${ids.length} 个`);}
    async function batchDeleteApplications(){const ids=Array.from(applicationSelectedIds);if(!ids.length)return;if(!confirm(`删除 ${ids.length} 个？`))return;for(const i of ids){try{await deleteApplication(Number(i));}catch(e){}}clearApplicationSelection();toast(`已删除 ${ids.length} 个`);}

    // ========== 培训需求 批量操作 ==========
    function toggleTrainingReqSelect(id){const s=String(id);if(trainingReqSelectedIds.has(s))trainingReqSelectedIds.delete(s);else trainingReqSelectedIds.add(s);updateTrainingReqBatchActionBar();}
    function toggleTrainingReqSelectAll(){const c=document.getElementById('trainingReqSelectAll').checked;trainingReqSelectedIds.clear();if(c)document.querySelectorAll('.trainingReq-row-check').forEach(cb=>{const m=cb.getAttribute('onchange')?.match(/toggleTrainingReqSelect\(['"]([^'"]+)['"]?\)/);if(m)trainingReqSelectedIds.add(m[1]);});loadTrainingRequests();updateTrainingReqBatchActionBar();}
    function updateTrainingReqBatchActionBar(){const b=document.getElementById('trainingReqBatchActionBar'),c=document.getElementById('trainingReqBatchCount');if(!b||!c)return;if(trainingReqSelectedIds.size>0){b.classList.remove('hidden');c.textContent=`已选 ${trainingReqSelectedIds.size} 项`;}else b.classList.add('hidden');}
    function clearTrainingReqSelection(){trainingReqSelectedIds.clear();loadTrainingRequests();updateTrainingReqBatchActionBar();}
    async function batchApproveTrainingRequests(){const ids=Array.from(trainingReqSelectedIds);if(!ids.length)return;if(!confirm(`批量批准 ${ids.length} 条？`))return;for(const i of ids){try{await updateTrainingRequestStatus(i,'approved');}catch(e){}}clearTrainingReqSelection();toast(`已批准 ${ids.length} 条`);}
    async function batchRejectTrainingRequests(){const ids=Array.from(trainingReqSelectedIds);if(!ids.length)return;if(!confirm(`批量拒绝 ${ids.length} 条？`))return;for(const i of ids){try{await updateTrainingRequestStatus(i,'rejected');}catch(e){}}clearTrainingReqSelection();toast(`已拒绝 ${ids.length} 条`);}
    async function batchDeleteTrainingRequests(){const ids=Array.from(trainingReqSelectedIds);if(!ids.length)return;if(!confirm(`删除 ${ids.length} 条？`))return;for(const i of ids){try{await deleteTrainingRequest(i);}catch(e){}}clearTrainingReqSelection();toast(`已删除 ${ids.length} 条`);}

    function batchChangeTrainingCategory() {
      const trainingProjectOptions = Object.keys(trainingCategories || {}).map(name => ({ id: name, name }));
      showBatchCategoryPicker('training', async (categoryId) => {
        const ids = Array.from(trainingSelectedIds);
        let success = 0, fail = 0;
        for (const id of ids) {
          try {
            const res = await fetch(API + '/training/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project: categoryId })
            });
            if (res.ok) success++; else fail++;
          } catch (e) { fail++; }
        }
        toast(`调整分类完成：成功 ${success}，失败 ${fail}`);
        clearTrainingSelection();
        await loadAllData();
        renderTraining();
      }, trainingProjectOptions);
    }

    function handleTrainingDayClick(dateStr) {
      const events = (data.training || []).filter(e => e.date === dateStr);
      if (events.length === 0) {
        // 无培训时直接打开添加弹窗,并预填日期
        openTrainingModal(null, dateStr);
      } else {
        // 有培训时显示详情弹窗
        showTrainingDayModal(dateStr, events);
      }
    }

    function showTrainingDayModal(dateStr, events) {
      const d = new Date(dateStr);
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const dateText = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`;

      const eventsHtml = events.map(e => {
        const cat = trainingCategories[e.project] || { color: 'bg-slate-100 text-slate-600', icon: 'fa-tag' };
        const start = e.startTime ? (e.startTime.includes('T') ? e.startTime.split('T')[1].slice(0, 5) : e.startTime) : '-';
        const end = e.endTime ? (e.endTime.includes('T') ? e.endTime.split('T')[1].slice(0, 5) : e.endTime) : '-';
        return `
          <div class="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0">
              <i class="fas ${cat.icon} text-white text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-medium px-2 py-0.5 rounded-full ${cat.color}">${e.project}</span>
              </div>
              <h4 class="font-semibold text-slate-800 text-sm">${e.name}</h4>
              <p class="text-xs text-slate-500 mt-1 line-clamp-2">${e.content || ''}</p>
              <div class="flex items-center gap-3 mt-2 text-xs text-slate-400">
                <span><i class="fas fa-user mr-1"></i>${e.instructor || '-'}</span>
                <span><i class="fas fa-map-marker-alt mr-1"></i>${e.location || '-'}</span>
                <span><i class="fas fa-clock mr-1"></i>${start}-${end}</span>
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <button onclick="closeModal(); editTraining(${e.id})" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition" title="编辑"><i class="fas fa-edit text-xs"></i></button>
              <button onclick="closeModal(); deleteTraining(${e.id})" class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition" title="删除"><i class="fas fa-trash text-xs"></i></button>
            </div>
          </div>
        `;
      }).join('');

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h3 class="text-lg font-semibold text-slate-800">当天培训安排</h3>
              <p class="text-sm text-slate-500">${dateText}</p>
            </div>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
            ${eventsHtml}
          </div>
          <div class="px-6 pb-6 pt-2 border-t border-slate-100">
            <button onclick="closeModal(); openTrainingModal(null, '${dateStr}')" class="w-full py-2.5 btn-primary text-white rounded-xl font-medium transition">
              <i class="fas fa-plus mr-2"></i>添加新培训
            </button>
          </div>
        </div>
      `);
    }

    async function openTrainingImageUpload(trainingId) {
      const event = data.training.find(x => x.id === trainingId);
      if (!event) {
        toast('培训记录不存在', 'error');
        return;
      }

      // 优先使用服务端已持久化的 galleryImages，并兼容旧的 localStorage 数据
      const galleryLocal = safeParse('training_gallery', {});
      let galleryLocalData = galleryLocal[trainingId];
      if (!galleryLocalData && typeof trainingId === 'number') {
        galleryLocalData = galleryLocal[String(trainingId)];
      }
      if (!galleryLocalData && typeof trainingId === 'string') {
        galleryLocalData = galleryLocal[parseInt(trainingId)];
      }
      let existingImages = event.galleryImages && event.galleryImages.length
        ? event.galleryImages
        : ((galleryLocalData && galleryLocalData.images) ? galleryLocalData.images : []);

      // 迁移旧 localStorage 数据到服务端（一次机会）
      if ((!event.galleryImages || event.galleryImages.length === 0) && galleryLocalData && galleryLocalData.images && galleryLocalData.images.length > 0) {
        try {
          const migrateRes = await fetch(API + '/training/' + trainingId + '/gallery', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: galleryLocalData.images })
          });
          const migrateData = await migrateRes.json();
          if (migrateData.success) {
            event.galleryImages = migrateData.images;
            existingImages = migrateData.images;
            // 清除已迁移的本地数据
            delete galleryLocal[trainingId];
            delete galleryLocal[String(trainingId)];
            localStorage.setItem('training_gallery', JSON.stringify(galleryLocal));
          }
        } catch (err) {
          console.error('migrate training gallery error:', err);
        }
      }

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-image text-pink-500 mr-2"></i>上传培训图片</h3>
              <p class="text-sm text-slate-500">${event.name}</p>
            </div>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-6">
            <div id="upload-dropzone" class="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-pink-300 hover:bg-pink-50/30 transition cursor-pointer" onclick="document.getElementById('training-image-input').click()">
              <i class="fas fa-cloud-upload-alt text-4xl text-slate-300 mb-3"></i>
              <p class="text-sm text-slate-600 font-medium">点击或拖拽上传图片</p>
              <p class="text-xs text-slate-400 mt-1">支持 JPG、PNG、GIF，单张不超过 5MB</p>
              <input type="file" id="training-image-input" accept="image/*" multiple class="hidden" onchange="handleTrainingImageUpload(${trainingId}, this.files)">
            </div>
            <div id="upload-preview-area" class="mt-4 hidden">
              <p class="text-sm font-medium text-slate-700 mb-2">待上传图片：</p>
              <div id="upload-preview-list" class="grid grid-cols-4 gap-2"></div>
            </div>
            <div id="upload-existing-area" class="mt-4 ${existingImages.length > 0 ? '' : 'hidden'}">
              <p class="text-sm font-medium text-slate-700 mb-2">已有图片：</p>
              <div id="upload-existing-list" class="grid grid-cols-4 gap-2">
                ${existingImages.map((img, i) => `
                  <div class="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                    <img src="${img}" class="w-full h-full object-cover">
                    <button onclick="deleteTrainingImage(${trainingId}, ${i})" class="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            <button onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition">取消</button>
            <button id="upload-submit-btn" onclick="submitTrainingImages(${trainingId})" class="px-5 py-2 btn-primary text-white rounded-xl font-medium transition opacity-50 cursor-not-allowed" disabled>开始上传</button>
          </div>
        </div>
      `);

      // 拖拽上传支持
      setTimeout(() => {
        const dropzone = document.getElementById('upload-dropzone');
        if (dropzone) {
          dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('border-pink-400', 'bg-pink-50'); });
          dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('border-pink-400', 'bg-pink-50'); });
          dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-pink-400', 'bg-pink-50');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
              document.getElementById('training-image-input').files = files;
              handleTrainingImageUpload(trainingId, files);
            }
          });
        }
      }, 100);
    }

    let pendingUploadFiles = [];

    function handleTrainingImageUpload(trainingId, files) {
      pendingUploadFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (pendingUploadFiles.length === 0) {
        toast('请选择图片文件', 'warning');
        return;
      }

      const previewArea = document.getElementById('upload-preview-area');
      const previewList = document.getElementById('upload-preview-list');
      const submitBtn = document.getElementById('upload-submit-btn');

      previewArea.classList.remove('hidden');
      previewList.innerHTML = pendingUploadFiles.map((file, i) => {
        const url = URL.createObjectURL(file);
        return `
          <div class="relative aspect-square rounded-lg overflow-hidden border border-slate-200">
            <img src="${url}" class="w-full h-full object-cover">
            <button onclick="removePendingImage(${i})" class="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `;
      }).join('');

      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    function removePendingImage(index) {
      pendingUploadFiles.splice(index, 1);
      if (pendingUploadFiles.length === 0) {
        document.getElementById('upload-preview-area').classList.add('hidden');
        const submitBtn = document.getElementById('upload-submit-btn');
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
      } else {
        handleTrainingImageUpload(null, pendingUploadFiles);
      }
    }

    async function submitTrainingImages(trainingId) {
      if (pendingUploadFiles.length === 0) {
        toast('没有待上传的图片', 'warning');
        return;
      }

      const submitBtn = document.getElementById('upload-submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>上传中...';

      try {
        // 1. 批量上传到服务器
        const formData = new FormData();
        pendingUploadFiles.forEach(file => formData.append('files', file));
        const uploadRes = await fetch(API + '/upload/multiple?type=training-gallery', {
          method: 'POST',
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success || !Array.isArray(uploadData.files) || uploadData.files.length === 0) {
          toast(uploadData.error || '图片上传失败', 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = '开始上传';
          return;
        }
        const newUrls = uploadData.files.map(f => f.url);

        // 2. 获取服务端现有图片并合并
        const galleryRes = await fetch(API + '/training/' + trainingId + '/gallery');
        const galleryData = await galleryRes.json();
        const existingImages = (galleryData.success && Array.isArray(galleryData.images)) ? galleryData.images : [];
        const allImages = [...existingImages, ...newUrls];

        // 3. 保存到培训记录
        const saveRes = await fetch(API + '/training/' + trainingId + '/gallery', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: allImages })
        });
        const saveData = await saveRes.json();
        if (!saveData.success) {
          // 保存到培训记录失败，回滚删除刚上传的图片
          newUrls.forEach(url => deleteUploadFileByUrl(url));
          toast(saveData.error || '保存图片失败', 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = '开始上传';
          return;
        }

        // 4. 同步本地数据
        const event = data.training.find(x => x.id === trainingId || x.id === parseInt(trainingId) || x.id === String(trainingId));
        if (event) {
          event.galleryImages = saveData.images;
        }

        toast(`成功添加 ${newUrls.length} 张图片`, 'success');
        pendingUploadFiles = [];
        closeModal();
        renderTrainingList();
      } catch (err) {
        console.error('submitTrainingImages error:', err);
        toast('上传失败: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '开始上传';
      }
    }

    async function deleteTrainingImage(trainingId, imageIndex) {
      if (!confirm('确定要删除这张图片吗？')) return;

      try {
        const res = await fetch(API + '/training/' + trainingId + '/gallery/' + imageIndex, { method: 'DELETE' });
        const result = await res.json();
        if (!result.success) {
          toast(result.error || '删除失败', 'error');
          return;
        }

        // 同步本地数据
        const event = data.training.find(x => x.id === trainingId || x.id === parseInt(trainingId) || x.id === String(trainingId));
        if (event) {
          event.galleryImages = result.images;
        }

        toast('图片已删除', 'success');
        // 刷新弹窗
        openTrainingImageUpload(trainingId);
        renderTrainingList();
      } catch (err) {
        console.error('deleteTrainingImage error:', err);
        toast('删除失败: ' + err.message, 'error');
      }
    }

    function prevTrainingMonth() {
      if (trainingCurrentMonth === 0) {
        trainingCurrentMonth = 11;
        trainingCurrentYear--;
      } else {
        trainingCurrentMonth--;
      }
      renderTrainingCalendar();
    }

    function nextTrainingMonth() {
      if (trainingCurrentMonth === 11) {
        trainingCurrentMonth = 0;
        trainingCurrentYear++;
      } else {
        trainingCurrentMonth++;
      }
      renderTrainingCalendar();
    }

    function goToTrainingToday() {
      const today = new Date();
      trainingCurrentYear = today.getFullYear();
      trainingCurrentMonth = today.getMonth();
      renderTrainingCalendar();
    }

    // ========== 讲师下拉选择 ==========
    function showLecturerDropdown() {
      const dropdown = document.getElementById('t-instructor-dropdown');
      if (!dropdown) return;
      const list = data.lecturers || [];
      const html = list.map(l => `
        <div onclick="selectLecturer('${l.name.replace(/'/g, "\\'")}')" class="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0">
          <div class="font-medium">${l.name}</div>
          <div class="text-xs text-slate-400">${l.department || ''} ${l.levelName || ''}</div>
        </div>
      `).join('');
      dropdown.innerHTML = html || '<div class="px-4 py-3 text-sm text-slate-400 text-center">暂无讲师数据</div>';
      dropdown.classList.remove('hidden');
    }

    function filterLecturerDropdown(val) {
      const dropdown = document.getElementById('t-instructor-dropdown');
      if (!dropdown) return;
      const list = data.lecturers || [];
      const keyword = val.trim().toLowerCase();
      const filtered = keyword ? list.filter(l => l.name.toLowerCase().includes(keyword) || (l.department || '').toLowerCase().includes(keyword)) : list;
      const html = filtered.map(l => `
        <div onclick="selectLecturer('${l.name.replace(/'/g, "\\'")}')" class="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0">
          <div class="font-medium">${l.name}</div>
          <div class="text-xs text-slate-400">${l.department || ''} ${l.levelName || ''}</div>
        </div>
      `).join('');
      dropdown.innerHTML = html || '<div class="px-4 py-3 text-sm text-slate-400 text-center">无匹配讲师</div>';
      dropdown.classList.remove('hidden');
    }

    function selectLecturer(name) {
      const input = document.getElementById('t-instructor');
      const dropdown = document.getElementById('t-instructor-dropdown');
      if (input) input.value = name;
      if (dropdown) dropdown.classList.add('hidden');
    }

    // 点击外部关闭讲师下拉
    document.addEventListener('click', function(e) {
      const dropdown = document.getElementById('t-instructor-dropdown');
      const input = document.getElementById('t-instructor');
      if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
        dropdown.classList.add('hidden');
      }
    });

    // 培训弹窗全局状态
    let currentEditingTraining = null;
    let currentEditingTrainingId = null;
    let trainingUserPickerData = [];
    let trainingUserPickerTemp = new Set();

    async function openTrainingModal(training = null, prefillDate = null) {
      const isEdit = !!training;
      currentEditingTraining = training;
      currentEditingTrainingId = training?.id || null;

      // 确保 surveys / exams 已加载
      await loadAllData();
      const surveys = data.surveys || [];
      const exams = data.exams || [];

      const startTimeValue = training?.startTime || '';
      const endTimeValue = training?.endTime || '';

      // 处理 datetime-local 格式,支持手动输入
      const toDatetimeLocal = (val, fallbackDate, fallbackTime) => {
        if (!val) {
          if (fallbackDate) return `${fallbackDate}T${fallbackTime || '09:00'}`;
          return '';
        }
        const normalized = val.trim().replace(' ', 'T');
        if (normalized.includes('T')) return normalized;
        return normalized + 'T09:00';
      };

      const categoryOptions = Object.keys(trainingCategories).map(cat =>
        `<option value="${cat}" ${(training?.project || '') === cat ? 'selected' : ''}>${cat}</option>`
      ).join('');

      const surveyOptions = surveys.map(s => `<option value="${s.id}" ${training?.linkedSurveyId === s.id ? 'selected' : ''}>${escHtml(s.title)}</option>`).join('');

      const signinEnabled = training?.signinEnabled || false;
      const linkedExam = (training?.examEnabled && training?.linkedExamId)
        ? (exams.find(e => String(e.id) === String(training.linkedExamId)) || null)
        : null;
      const examEnabled = !!linkedExam;
      const surveyEnabled = training?.surveyEnabled || false;
      const coursewareEnabled = training?.coursewareEnabled || false;
      const signinStartValue = training?.signinStartTime || training?.startTime || startTimeValue;
      const signinEndValue = training?.signinEndTime || training?.endTime || endTimeValue;

      // 任务指派回填
      let accessType = training?.accessType || 'none';
      if (accessType === 'open' || accessType === 'public') accessType = 'public';
      else if (accessType === 'restricted') accessType = (training?.allowedUsers && training.allowedUsers.length) ? 'restricted' : 'none';
      else accessType = 'none';

      trainingUserPickerTemp = new Set();
      if (training?.allowedUsers && Array.isArray(training.allowedUsers)) {
        training.allowedUsers.forEach(uid => trainingUserPickerTemp.add(String(uid)));
      }

      showModal(`
        <div class="modal bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
            <h3 class="text-lg font-semibold text-slate-800">${isEdit ? '编辑' : '添加'}培训</h3>
            <button onclick="closeTrainingModal()" class="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"><i class="fas fa-times text-lg"></i></button>
          </div>
          <form id="training-form" onsubmit="saveTraining(event, ${training?.id || 'null'})" class="flex-1 overflow-y-auto p-6 space-y-5">

            <!-- 基本信息（折叠，默认展开） -->
            <div class="border border-slate-200 rounded-xl overflow-hidden">
              <div onclick="toggleTrainingPanel('basicInfo')" class="flex items-center justify-between px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition">
                <span class="text-sm font-semibold text-slate-800"><i class="fas fa-info-circle text-indigo-500 mr-2"></i>基本信息</span>
                <i id="basicInfo-chevron" class="fas fa-chevron-down text-slate-400 transition-transform"></i>
              </div>
              <div id="basicInfo" class="p-4 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">培训项目 <span class="text-red-500">*</span></label>
                    <select id="t-project" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="">请选择</option>
                      ${categoryOptions}
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">培训课题 <span class="text-red-500">*</span></label>
                    <input type="text" id="t-name" value="${escHtml(training?.name || '')}" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">培训内容</label>
                  <input type="text" id="t-content" value="${escHtml(training?.content || '')}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="relative">
                    <label class="block text-sm font-medium text-slate-700 mb-1">培训讲师 <span class="text-red-500">*</span></label>
                    <input type="text" id="t-instructor" value="${escHtml(training?.instructor || '')}" required
                           onfocus="showLecturerDropdown()" oninput="filterLecturerDropdown(this.value)"
                           class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                           placeholder="输入或选择讲师" autocomplete="off">
                    <div id="t-instructor-dropdown" class="absolute left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto hidden z-50"></div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">培训地点 <span class="text-red-500">*</span></label>
                    <input type="text" id="t-location" value="${escHtml(training?.location || '')}" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">开始时间 <span class="text-red-500">*</span></label>
                    <input type="datetime-local" id="t-start" value="${toDatetimeLocal(startTimeValue, prefillDate, '09:00')}" required
                           class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                    <p class="text-xs text-slate-400 mt-1">支持手动输入,如 2026-06-11 09:00</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">结束时间 <span class="text-red-500">*</span></label>
                    <input type="datetime-local" id="t-end" value="${toDatetimeLocal(endTimeValue, prefillDate, '17:00')}" required
                           class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                  </div>
                </div>
              </div>
            </div>

            <!-- 项目内容（折叠） -->
            <div class="border border-slate-200 rounded-xl overflow-hidden">
              <div onclick="toggleTrainingPanel('projectContent')" class="flex items-center justify-between px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition">
                <span class="text-sm font-semibold text-slate-800"><i class="fas fa-tasks text-emerald-500 mr-2"></i>项目内容</span>
                <i id="projectContent-chevron" class="fas fa-chevron-down text-slate-400 transition-transform"></i>
              </div>
              <div id="projectContent" class="hidden p-4">
                <input type="hidden" id="t-exam-id" value="${training?.linkedExamId || ''}">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <!-- 考勤卡片 -->
                  <div id="card-attendance" class="project-card relative rounded-xl border-2 ${signinEnabled ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'} p-4 transition cursor-pointer hover:shadow-md" onclick="onCardClick('attendance')">
                    <div class="flex items-center justify-between mb-3">
                      <div class="w-9 h-9 rounded-lg ${signinEnabled ? 'bg-emerald-100' : 'bg-slate-200'} flex items-center justify-center">
                        <i class="fas fa-check-circle ${signinEnabled ? 'text-emerald-500' : 'text-slate-400'} text-lg"></i>
                      </div>
                      <label class="relative inline-flex items-center cursor-pointer" onclick="event.stopPropagation()">
                        <input type="checkbox" id="t-attendance-enable" class="sr-only peer" ${signinEnabled ? 'checked' : ''} onchange="onModuleToggle('attendance', this.checked)">
                        <div class="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>
                    <div class="text-sm font-semibold text-slate-800">考勤</div>
                    <div class="text-xs text-slate-400 mt-0.5">签到时间+项目分享</div>
                    <div class="mt-3 text-xs ${signinEnabled ? 'text-emerald-600' : 'text-slate-400'} font-medium flex items-center gap-1">
                      <i class="fas fa-cog"></i><span>${signinEnabled ? '已配置' : '未启用'}</span>
                    </div>
                  </div>
                  <!-- 调研卡片 -->
                  <div id="card-survey" class="project-card relative rounded-xl border-2 ${surveyEnabled ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200 bg-slate-50'} p-4 transition cursor-pointer hover:shadow-md" onclick="onCardClick('survey')">
                    <div class="flex items-center justify-between mb-3">
                      <div class="w-9 h-9 rounded-lg ${surveyEnabled ? 'bg-blue-100' : 'bg-slate-200'} flex items-center justify-center">
                        <i class="fas fa-poll ${surveyEnabled ? 'text-blue-500' : 'text-slate-400'} text-lg"></i>
                      </div>
                      <label class="relative inline-flex items-center cursor-pointer" onclick="event.stopPropagation()">
                        <input type="checkbox" id="t-survey-enable" class="sr-only peer" ${surveyEnabled ? 'checked' : ''} onchange="onModuleToggle('survey', this.checked)">
                        <div class="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                      </label>
                    </div>
                    <div class="text-sm font-semibold text-slate-800">调研</div>
                    <div class="text-xs text-slate-400 mt-0.5">选择调研问卷</div>
                    <div class="mt-3 text-xs ${surveyEnabled ? 'text-blue-600' : 'text-slate-400'} font-medium flex items-center gap-1">
                      <i class="fas fa-cog"></i><span id="survey-card-status">${surveyEnabled ? '已选择' : '未启用'}</span>
                    </div>
                  </div>
                  <!-- 考试卡片 -->
                  <div id="card-exam" class="project-card relative rounded-xl border-2 ${examEnabled ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200 bg-slate-50'} p-4 transition cursor-pointer hover:shadow-md" onclick="onCardClick('exam')">
                    <div class="flex items-center justify-between mb-3">
                      <div class="w-9 h-9 rounded-lg ${examEnabled ? 'bg-amber-100' : 'bg-slate-200'} flex items-center justify-center">
                        <i class="fas fa-file-alt ${examEnabled ? 'text-amber-500' : 'text-slate-400'} text-lg"></i>
                      </div>
                      <label class="relative inline-flex items-center cursor-pointer" onclick="event.stopPropagation()">
                        <input type="checkbox" id="t-exam-enable" class="sr-only peer" ${examEnabled ? 'checked' : ''} onchange="onModuleToggle('exam', this.checked)">
                        <div class="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                      </label>
                    </div>
                    <div class="text-sm font-semibold text-slate-800">考试</div>
                    <div class="text-xs text-slate-400 mt-0.5">创建考试+试卷</div>
                    <div class="mt-3 text-xs ${examEnabled ? 'text-amber-600' : 'text-slate-400'} font-medium flex items-center gap-1">
                      <i class="fas fa-cog"></i><span id="exam-card-status">${examEnabled ? (linkedExam ? escHtml(linkedExam.title || '已配置') : '未配置') : '未启用'}</span>
                    </div>
                  </div>
                  <!-- 课件卡片 -->
                  <div id="card-courseware" class="project-card relative rounded-xl border-2 ${coursewareEnabled ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200 bg-slate-50'} p-4 transition cursor-pointer hover:shadow-md" onclick="onCardClick('courseware')">
                    <div class="flex items-center justify-between mb-3">
                      <div class="w-9 h-9 rounded-lg ${coursewareEnabled ? 'bg-rose-100' : 'bg-slate-200'} flex items-center justify-center">
                        <i class="fas fa-file-pdf ${coursewareEnabled ? 'text-rose-500' : 'text-slate-400'} text-lg"></i>
                      </div>
                      <label class="relative inline-flex items-center cursor-pointer" onclick="event.stopPropagation()">
                        <input type="checkbox" id="t-courseware-enable" class="sr-only peer" ${coursewareEnabled ? 'checked' : ''} onchange="onModuleToggle('courseware', this.checked)">
                        <div class="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                      </label>
                    </div>
                    <div class="text-sm font-semibold text-slate-800">课件</div>
                    <div class="text-xs text-slate-400 mt-0.5">上传培训课件</div>
                    <div class="mt-3 text-xs ${coursewareEnabled ? 'text-rose-600' : 'text-slate-400'} font-medium flex items-center gap-1">
                      <i class="fas fa-cog"></i><span id="courseware-card-status">${coursewareEnabled ? ((training?.coursewareFiles?.length || 0) + '个文件') : '未启用'}</span>
                    </div>
                  </div>
                </div>
                <p class="text-xs text-slate-400 mt-3">点击卡片或开启开关后，将打开右侧配置抽屉。关闭开关将禁用对应模块。</p>
              </div>
            </div>

            <!-- 任务指派（折叠） -->
            <div class="border border-slate-200 rounded-xl overflow-hidden">
              <div onclick="toggleTrainingPanel('taskAssignment')" class="flex items-center justify-between px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition">
                <span class="text-sm font-semibold text-slate-800"><i class="fas fa-user-cog text-cyan-500 mr-2"></i>任务指派</span>
                <i id="taskAssignment-chevron" class="fas fa-chevron-down text-slate-400 transition-transform"></i>
              </div>
              <div id="taskAssignment" class="hidden p-4 space-y-4">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium text-slate-700">指派范围</label>
                  <select id="t-access-type" onchange="onTrainingAccessTypeChange()" class="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="none" ${accessType === 'none' ? 'selected' : ''}>暂不指派</option>
                    <option value="public" ${accessType === 'public' ? 'selected' : ''}>全员开放</option>
                    <option value="restricted" ${accessType === 'restricted' ? 'selected' : ''}>指定学员</option>
                    <option value="import" ${accessType === 'import' ? 'selected' : ''}>导入学员</option>
                  </select>
                </div>
                <div id="t-allowed-users-wrap" class="${accessType === 'restricted' || accessType === 'import' ? '' : 'hidden'}">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm text-slate-600">已选 <span id="t-allowed-users-count">0</span> 人</span>
                    <button type="button" onclick="openTrainingUserPicker()" class="text-sm px-3 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition"><i class="fas fa-plus mr-1"></i>选择学员</button>
                  </div>
                  <div id="t-allowed-users-list" class="flex flex-wrap gap-2 max-h-32 overflow-y-auto"><p class="text-sm text-slate-400 w-full">未选择学员</p></div>
                </div>
                <div id="t-import-users-wrap" class="${accessType === 'import' ? '' : 'hidden'}">
                  <label class="block text-xs font-medium text-slate-600 mb-1">导入 Excel（包含学员姓名列）</label>
                  <input type="file" id="t-import-users-file" accept=".xlsx,.xls" onchange="onTrainingImportUsersFile()"
                    class="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100">
                  <p class="text-xs text-slate-400 mt-1">上传后会自动读取表格中的学员姓名并完成匹配导入</p>
                  <div id="t-import-users-result" class="mt-2 hidden"></div>
                </div>
              </div>
            </div>

          </form>
          <div class="flex justify-end items-center gap-3 p-6 border-t border-slate-100 flex-shrink-0 bg-slate-50">
            <button type="button" onclick="closeTrainingModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition">取消</button>
            <button type="submit" form="training-form" class="btn-primary px-6 py-2.5 text-white rounded-xl font-medium transition">保存</button>
          </div>
        </div>
      `);

      // 初始化指派学员列表显示
      userPickerMode = 'training';
      await loadExamUserPickerData();
      onTrainingAccessTypeChange();
      renderTrainingAllowedUsers();

      // 回填项目内容抽屉字段
      populateTrainingDrawers(training);
    }

    async function renderTrainingExamDisplay(examId) {
      const display = document.getElementById('t-exam-display');
      if (!display) return;
      if (!examId) {
        display.textContent = '不关联';
        display.className = 'text-sm text-slate-500 truncate';
        return;
      }
      try {
        const res = await fetch('/api/exams');
        const exams = await res.json();
        const exam = exams.find(e => String(e.id) === String(examId));
        if (exam) {
          display.textContent = exam.title || exam.name || '未命名考试';
          display.className = 'text-sm text-slate-800 truncate';
        } else {
          display.textContent = '考试不存在';
          display.className = 'text-sm text-red-500 truncate';
        }
      } catch (e) {
        display.textContent = '加载失败';
        display.className = 'text-sm text-red-500 truncate';
      }
    }

    function openTrainingExamPicker() {
      openPaperPickerModal(async (paper) => {
        toast('正在创建关联考试...');
        const result = await createExamFromPaper(paper);
        const exam = result?.exam;
        if (exam && exam.id) {
          document.getElementById('t-exam-id').value = exam.id;
          renderTrainingExamDisplay(exam.id);
          toast('考试配置成功');
        } else {
          toast('考试创建失败', 'error');
        }
      }, null);
    }

    async function createExamFromPaper(paper) {
      const questions = (paper.questions || []).map((q, idx) => ({
        questionId: q.questionId || q.id,
        score: q.score || 5,
        partialScore: q.partialScore !== undefined ? q.partialScore : (q.type === 'multiple' ? 0 : undefined),
        order: q.order !== undefined ? q.order : idx,
        content: q.content || '(题目内容)',
        type: q.type || 'single',
        options: q.options || [],
        answer: q.answer || '',
        explanation: q.explanation || ''
      }));
      const totalScore = questions.reduce((s, q) => s + (q.score || 0), 0) || 100;
      const payload = {
        title: paper.name || '未命名考试',
        description: '',
        duration: 60,
        totalScore: totalScore,
        passingScore: Math.max(1, Math.ceil(totalScore * 0.6)),
        status: 'draft',
        paperId: paper.id,
        paperName: paper.name,
        questions: questions,
        attemptsPolicy: 'unlimited',
        recordScore: 'highest',
        screenSwitchPolicy: 'unlimited',
        accessType: 'none',
        allowedUsers: null,
        showData: true,
        answerDetail: 'after_grade',
        viewQuestions: 'all',
        showCorrect: 'show',
        showAnalysis: 'show',
        viewRank: 'after_submit'
      };
      try {
        const res = await fetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('创建考试失败');
        return await res.json();
      } catch (e) {
        console.error('createExamFromPaper error:', e);
        return null;
      }
    }

    async function saveTraining(e, id) {
      e.preventDefault();
      // 规范化 id:字符串 'null' 或空值都转为 null,确保新增时走 POST 路径
      id = (id === 'null' || id === null || id === undefined || id === '') ? null : Number(id);
      let startVal = document.getElementById('t-start').value.trim().replace(' ', 'T');
      let endVal = document.getElementById('t-end').value.trim().replace(' ', 'T');

      if (!startVal || !endVal) {
        toast('请填写开始时间和结束时间', 'error');
        return;
      }
      if (new Date(startVal) >= new Date(endVal)) {
        toast('结束时间必须晚于开始时间', 'error');
        return;
      }

      const dateVal = startVal.split('T')[0];

      // 项目内容（4 模块开关）
      const attendanceEnabled = document.getElementById('t-attendance-enable')?.checked || false;
      const examEnabled = document.getElementById('t-exam-enable')?.checked || false;
      const surveyEnabled = document.getElementById('t-survey-enable')?.checked || false;
      const coursewareEnabled = document.getElementById('t-courseware-enable')?.checked || false;

      const signinStart = document.getElementById('t-signin-start')?.value || '';
      const signinEnd = document.getElementById('t-signin-end')?.value || '';

      // 校验
      if (attendanceEnabled && !signinStart) { toast('请在考勤抽屉中设置签到开始时间', 'error'); return; }
      if (examEnabled && !document.getElementById('t-exam-id')?.value) { toast('请创建考试后再保存', 'error'); return; }
      if (surveyEnabled && !document.getElementById('t-survey-id')?.value) { toast('请选择调研问卷', 'error'); return; }

      // 任务指派
      const accessTypeRaw = document.getElementById('t-access-type').value;
      const accessType = accessTypeRaw === 'import' ? 'restricted' : (accessTypeRaw || 'none');
      const allowedUsers = (accessTypeRaw === 'restricted' || accessTypeRaw === 'import')
        ? Array.from(trainingUserPickerTemp).map(uid => isNaN(Number(uid)) ? uid : Number(uid))
        : [];

      const formData = {
        project: document.getElementById('t-project').value,
        name: document.getElementById('t-name').value.trim(),
        content: document.getElementById('t-content').value.trim(),
        instructor: document.getElementById('t-instructor').value.trim(),
        location: document.getElementById('t-location').value.trim(),
        date: dateVal,
        startTime: startVal,
        endTime: endVal,
        signinEnabled: attendanceEnabled,
        signinCode: null,
        signinStartTime: attendanceEnabled ? signinStart.replace('T', ' ') : null,
        signinEndTime: attendanceEnabled ? signinEnd.replace('T', ' ') : null,
        examEnabled: examEnabled,
        surveyEnabled: surveyEnabled,
        coursewareEnabled: coursewareEnabled,
        linkedSurveyId: surveyEnabled ? (document.getElementById('t-survey-id')?.value ? parseInt(document.getElementById('t-survey-id').value) : null) : null,
        linkedExamId: examEnabled ? (document.getElementById('t-exam-id')?.value ? parseInt(document.getElementById('t-exam-id').value) : null) : null,
        accessType: accessType,
        allowedUsers: allowedUsers.length ? allowedUsers : null,
        coursewareFiles: coursewareEnabled ? (currentEditingTraining?.coursewareFiles || []) : []
      };

      try {
        let res;
        if (id) {
          res = await fetch(API + '/training/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        } else {
          res = await fetch(API + '/training', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        }
        if (res.ok) {
          const result = await res.json();
          const savedId = id || result.event?.id;

          // 保存指派学员
          if (savedId && allowedUsers.length > 0) {
            await fetch(API + '/training/' + savedId + '/assign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userIds: allowedUsers })
            });
          }

          pendingTrainingCourseware = [];
          toast(id ? '培训已更新' : '培训已添加');
          closeTrainingModal();
          await loadAllData();
          renderTraining();
        } else {
          const err = await res.json();
          toast(err.error || '操作失败', 'error');
        }
      } catch (err) {
        toast('操作失败: ' + err.message, 'error');
      }
    }

    function closeTrainingModal() {
      pendingTrainingCourseware.forEach(item => deleteUploadFileByUrl(item.url));
      pendingTrainingCourseware = [];
      closeModal();
    }

    // ========== 培训弹窗 - 折叠面板与项目内容 ==========

    function toggleTrainingPanel(id) {
      const panel = document.getElementById(id);
      const chevron = document.getElementById(id + '-chevron');
      if (panel) panel.classList.toggle('hidden');
      if (chevron) chevron.classList.toggle('rotate-180');
    }

    // ===== 项目内容模块抽屉相关函数 =====

    const MODULE_COLORS = {
      attendance: { active: 'border-emerald-400 bg-emerald-50/40', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-500', textColor: 'text-emerald-600', toggleColor: 'peer-checked:bg-emerald-500' },
      exam:       { active: 'border-amber-400 bg-amber-50/40',    iconBg: 'bg-amber-100',    iconColor: 'text-amber-500',    textColor: 'text-amber-600',    toggleColor: 'peer-checked:bg-amber-500' },
      survey:     { active: 'border-blue-400 bg-blue-50/40',      iconBg: 'bg-blue-100',     iconColor: 'text-blue-500',     textColor: 'text-blue-600',     toggleColor: 'peer-checked:bg-blue-500' },
      courseware: { active: 'border-rose-400 bg-rose-50/40',      iconBg: 'bg-rose-100',     iconColor: 'text-rose-500',     textColor: 'text-rose-600',     toggleColor: 'peer-checked:bg-rose-500' }
    };

    function openModuleDrawer(module) {
      const drawer = document.getElementById(module + 'Drawer');
      const overlay = document.getElementById(module + 'DrawerOverlay');
      if (!drawer || !overlay) return;
      overlay.classList.remove('hidden');
      drawer.classList.remove('translate-x-full');
      if (module === 'attendance') refreshProjectPosterPreview();
    }

    function closeModuleDrawer(module) {
      const drawer = document.getElementById(module + 'Drawer');
      const overlay = document.getElementById(module + 'DrawerOverlay');
      if (!drawer || !overlay) return;
      drawer.classList.add('translate-x-full');
      overlay.classList.add('hidden');
      // 调研：关闭抽屉时同步卡片状态文字
      if (module === 'survey') {
        const status = document.getElementById('survey-card-status');
        if (status) {
          const surveyId = document.getElementById('t-survey-id')?.value;
          status.textContent = surveyId ? '已选择' : '未启用';
        }
      }
    }

    function onModuleToggle(module, enabled) {
      updateModuleCardVisual(module, enabled);
      if (enabled) {
        if (module === 'exam') {
          // 考试模块：直接复用考试安排的 examModal
          const existingExamId = document.getElementById('t-exam-id')?.value;
          openExamModalFromTraining(existingExamId || null);
        } else {
          openModuleDrawer(module);
          if (module === 'survey') populateSurveyOptions();
          if (module === 'courseware') updateCoursewareUploadTip();
        }
      } else {
        closeModuleDrawer(module);
        clearModuleFields(module);
      }
    }

    function onCardClick(module) {
      const checkbox = document.getElementById('t-' + module + '-enable');
      if (!checkbox) return;
      if (!checkbox.checked) {
        // 未启用时点击卡片 → 启用并打开抽屉/弹窗
        checkbox.checked = true;
        onModuleToggle(module, true);
      } else {
        // 已启用时点击卡片 → 仅打开抽屉/弹窗
        if (module === 'exam') {
          const existingExamId = document.getElementById('t-exam-id')?.value;
          openExamModalFromTraining(existingExamId || null);
        } else {
          openModuleDrawer(module);
        }
      }
    }

    function updateModuleCardVisual(module, enabled) {
      const card = document.getElementById('card-' + module);
      if (!card) return;
      const colors = MODULE_COLORS[module];
      const iconWrapper = card.querySelector('.w-9.h-9');
      const icon = card.querySelector('.w-9.h-9 i');
      if (enabled) {
        card.className = card.className.replace(/border-slate-200 bg-slate-50/, colors.active);
        if (iconWrapper) iconWrapper.className = 'w-9 h-9 rounded-lg ' + colors.iconBg + ' flex items-center justify-center';
        if (icon) icon.className = icon.className.replace('text-slate-400', colors.iconColor);
      } else {
        card.className = card.className.replace(colors.active, 'border-slate-200 bg-slate-50');
        if (iconWrapper) iconWrapper.className = 'w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center';
        if (icon) icon.className = icon.className.replace(colors.iconColor, 'text-slate-400');
      }
    }

    function clearModuleFields(module) {
      if (module === 'attendance') {
        const s = document.getElementById('t-signin-start'); if (s) s.value = '';
        const e = document.getElementById('t-signin-end'); if (e) e.value = '';
      } else if (module === 'exam') {
        const id = document.getElementById('t-exam-id'); if (id) id.value = '';
        const status = document.getElementById('exam-card-status'); if (status) status.textContent = '未启用';
      } else if (module === 'survey') {
        const sel = document.getElementById('t-survey-id'); if (sel) sel.value = '';
      } else if (module === 'courseware') {
        const status = document.getElementById('courseware-card-status'); if (status) status.textContent = '未启用';
      }
    }

    // 考勤：从课程时间同步签到时间
    function syncSigninFromBasic() {
      const startInput = document.getElementById('t-start');
      const endInput = document.getElementById('t-end');
      const signinStart = document.getElementById('t-signin-start');
      const signinEnd = document.getElementById('t-signin-end');
      if (!startInput || !endInput) { toast('未找到课程时间字段', 'error'); return; }
      if (!startInput.value || !endInput.value) { toast('请先在基本信息中填写课程时间', 'error'); return; }
      if (signinStart) signinStart.value = startInput.value;
      if (signinEnd) signinEnd.value = endInput.value;
      refreshProjectPosterPreview();
      toast('已同步课程时间');
    }

    // 考勤：刷新项目分享海报预览
    function refreshProjectPosterPreview() {
      const container = document.getElementById('t-project-poster-preview');
      if (!container) return;
      const trainingId = currentEditingTrainingId;
      if (!trainingId) {
        container.innerHTML = '<p class="text-xs text-slate-400">保存培训后自动生成</p>';
        return;
      }
      const projectUrl = window.location.origin + '/training-signin.html?id=' + trainingId;
      container.innerHTML = '';
      try {
        new QRCode(container, { text: projectUrl, width: 180, height: 180, colorDark: '#1e293b', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      } catch (e) {
        container.innerHTML = '<p class="text-xs text-red-400">二维码生成失败</p>';
      }
    }

    // 考勤：确认签到设置成功
    function confirmSigninSettings() {
      const start = document.getElementById('t-signin-start')?.value;
      const end = document.getElementById('t-signin-end')?.value;
      if (!start || !end) { toast('请先设置签到开始和结束时间', 'error'); return; }
      toast('签到设置成功');
      closeModuleDrawer('attendance');
    }

    // 考勤：下载项目分享海报（使用 poster_light.png 模板）
    function downloadProjectPoster(btn) {
      const trainingId = currentEditingTrainingId;
      if (!trainingId) { toast('请先保存培训', 'error'); return; }
      const training = currentEditingTraining || {};
      const projectUrl = window.location.origin + '/training-signin.html?id=' + trainingId;

      // 按钮 loading 态（防止重复点击）
      const trigger = btn || document.querySelector('button[onclick*="downloadProjectPoster"]');
      const origHtml = trigger ? trigger.innerHTML : '';
      if (trigger) {
        trigger.disabled = true;
        trigger.style.pointerEvents = 'none';
        trigger.style.opacity = '0.7';
        trigger.innerHTML = '<i class="fas fa-spinner fa-spin"></i>生成中...';
      }

      const canvas = document.createElement('canvas');
      canvas.width = 750; canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;

      const bgImg = new Image();
      bgImg.onload = function() {
        // 绘制背景模板
        ctx.drawImage(bgImg, 0, 0, W, H);

        // 培训名称（标题栏下方居中）
        const title = training.name || training.project || '未命名培训';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        fillTextWithWrap(ctx, title, W / 2, 215, W - 120, 42, 'center');

        // 生成项目二维码并绘制
        const qrSize = 420;
        const qrContainer = document.createElement('div');
        qrContainer.style.position = 'fixed';
        qrContainer.style.left = '-9999px';
        document.body.appendChild(qrContainer);
        try {
          new QRCode(qrContainer, {
            text: projectUrl,
            width: qrSize,
            height: qrSize,
            colorDark: '#1e293b',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
          setTimeout(() => {
            const qrCanvas = qrContainer.querySelector('canvas');
            if (qrCanvas) {
              const qrX = (W - qrSize) / 2;
              const qrY = 330;
              ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
            }
            document.body.removeChild(qrContainer);

            // 地点（二维码下方）
            ctx.fillStyle = '#64748b';
            ctx.font = '26px sans-serif';
            ctx.textAlign = 'center';
            const locationText = training.location ? '地点：' + training.location : '地点待定';
            fillTextWithWrap(ctx, locationText, W / 2, 930, W - 140, 36, 'center');

            // 触发下载
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = '培训项目海报_' + (training.name || '培训') + '.png';
            a.click();
            toast('项目分享海报已下载');
            if (trigger) { trigger.disabled = false; trigger.style.pointerEvents = ''; trigger.style.opacity = ''; trigger.innerHTML = origHtml; }
          }, 100);
        } catch (e) {
          if (qrContainer.parentNode) document.body.removeChild(qrContainer);
          toast('海报生成失败', 'error');
          if (trigger) { trigger.disabled = false; trigger.style.pointerEvents = ''; trigger.style.opacity = ''; trigger.innerHTML = origHtml; }
        }
      };
      bgImg.onerror = function() {
        toast('海报模板加载失败', 'error');
        if (trigger) { trigger.disabled = false; trigger.style.pointerEvents = ''; trigger.style.opacity = ''; trigger.innerHTML = origHtml; }
      };
      bgImg.src = 'poster_light.png';
    }

    // 考试：从培训模块打开 examModal（复用考试安排的创建考试抽屉）
    let examModalFromTraining = false;
    function openExamModalFromTraining(examId = null) {
      examModalFromTraining = true;
      openExamModal(examId);
      // 隐藏 examModal 中的任务指派区块（培训弹窗已有任务指派，避免重复）
      const assignSection = document.getElementById('examAssignmentSection');
      if (assignSection) assignSection.style.display = 'none';
      // 从培训模块打开时，"发布"按钮改为"设置成功"（不触发考试通知，考试随培训项目走）
      const publishBtn = document.querySelector('button[onclick="saveExamAsPublished()"]');
      if (publishBtn) {
        publishBtn.innerHTML = '<i class="fas fa-check mr-1.5"></i>设置成功';
      }
      // 从培训模块打开时隐藏"存草稿"按钮（培训关联的考试只允许设置成功，不允许独立存草稿）
      const draftBtn = document.querySelector('button[onclick="saveExamAsDraft()"]');
      if (draftBtn) draftBtn.style.display = 'none';
      // 培训中的考试默认允许无限重考直到及格（用户可手动在考试设置里修改）
      setBtnGroupValue('examAttempts', 'until_pass');
    }

    // 调研：填充问卷选项
    function populateSurveyOptions() {
      const select = document.getElementById('t-survey-id');
      if (!select) return;
      const currentVal = select.value;
      const surveys = data.surveys || [];
      select.innerHTML = '<option value="">不关联</option>' + surveys.map(s =>
        `<option value="${s.id}">${escHtml(s.title)}</option>`
      ).join('');
      select.value = currentVal;
    }

    // 调研：确认选择问卷（替代原"完成"按钮，明确动作语义）
    function confirmSurveySelection() {
      const surveyId = document.getElementById('t-survey-id')?.value;
      if (!surveyId) { toast('请选择调研问卷', 'error'); return; }
      const surveys = data.surveys || [];
      const survey = surveys.find(s => String(s.id) === String(surveyId));
      toast('调研配置成功');
      closeModuleDrawer('survey');
    }

    // 课件：更新上传提示（已不再需要先保存培训）
    function updateCoursewareUploadTip() {
      const tip = document.getElementById('t-courseware-upload-tip');
      if (tip) tip.classList.add('hidden');
    }

    // 课件：更新卡片状态文字
    function updateCoursewareCardStatus() {
      const status = document.getElementById('courseware-card-status');
      if (!status) return;
      const count = currentEditingTraining?.coursewareFiles?.length || 0;
      status.textContent = count > 0 ? (count + '个文件') : '未配置';
    }

    // 回填抽屉字段（在 openTrainingModal 末尾调用）
    function populateTrainingDrawers(training) {
      // 考勤
      const signinStart = document.getElementById('t-signin-start');
      const signinEnd = document.getElementById('t-signin-end');
      const toDTLocal = (val) => {
        if (!val) return '';
        const n = String(val).trim().replace(' ', 'T');
        return n.includes('T') ? n : n + 'T09:00';
      };
      if (signinStart) signinStart.value = toDTLocal(training?.signinStartTime || training?.startTime || '');
      if (signinEnd) signinEnd.value = toDTLocal(training?.signinEndTime || training?.endTime || '');

      // 考试（t-exam-id 已在模板中设置，这里仅更新卡片状态文字）
      if (training?.linkedExamId) {
        fetch(API + '/exams').then(r => r.json()).then(exams => {
          const exam = exams.find(e => String(e.id) === String(training.linkedExamId));
          if (exam) {
            const status = document.getElementById('exam-card-status');
            if (status) status.textContent = exam.title || '已配置';
          }
        }).catch(() => {});
      }

      // 调研
      populateSurveyOptions();
      const surveySelect = document.getElementById('t-survey-id');
      if (surveySelect) surveySelect.value = training?.linkedSurveyId || '';

      // 课件
      const coursewareList = document.getElementById('t-courseware-list');
      if (coursewareList) coursewareList.innerHTML = renderTrainingCoursewareList(training?.coursewareFiles);
      updateCoursewareCardStatus();
      updateCoursewareUploadTip();
    }

    async function uploadTrainingCourseware(input, trainingId) {
      if (!input.files || !input.files.length) return;
      if (!currentEditingTraining) {
        currentEditingTraining = { coursewareFiles: [] };
      }
      const formData = new FormData();
      Array.from(input.files).forEach(f => formData.append('files', f));
      // 同时传递原始文件名，避免 multer 解析中文名编码错误
      Array.from(input.files).forEach(f => formData.append('originalNames', encodeURIComponent(f.name)));
      try {
        const res = await fetch(API + '/upload/multiple?type=courseware', {
          method: 'POST',
          body: formData
        });
        const result = await res.json();
        if (result.success && result.files) {
          const mapped = result.files.map(f => ({
            name: f.originalName || f.filename,
            url: f.url,
            size: f.size,
            mimetype: f.mimetype,
            filename: f.filename
          }));
          mapped.forEach(f => pendingTrainingCourseware.push(f));
          currentEditingTraining.coursewareFiles = (currentEditingTraining.coursewareFiles || []).concat(mapped);
          document.getElementById('t-courseware-list').innerHTML = renderTrainingCoursewareList(currentEditingTraining.coursewareFiles);
          updateCoursewareCardStatus();
          updateCoursewareUploadTip();
          toast('课件上传成功');
        } else {
          toast(result.error || '上传失败', 'error');
        }
      } catch (e) {
        toast('上传失败', 'error');
      }
      input.value = '';
    }

    function formatFileSize(bytes) {
      if (!bytes && bytes !== 0) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function renderTrainingCoursewareList(files) {
      if (!files || !files.length) return '<p class="text-sm text-slate-400">暂无课件</p>';
      return files.map((f, i) => {
        const sizeText = formatFileSize(f.size);
        return `
        <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
          <div class="flex items-center gap-2 min-w-0">
            <i class="fas fa-file text-slate-400"></i>
            <div class="min-w-0">
              <div class="text-xs text-slate-700 truncate">${escHtml(f.name)}</div>
              ${sizeText ? `<div class="text-[10px] text-slate-400">${sizeText}</div>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-1.5" id="cw-del-wrap-${i}">
            <a href="${f.url}" download="${escHtml(f.name || 'download')}" class="text-slate-400 hover:text-rose-500 text-xs px-1.5 py-1 rounded transition" title="下载"><i class="fas fa-download"></i></a>
            <button type="button" onclick="confirmDeleteCourseware(${i})" class="text-slate-400 hover:text-red-500 text-xs px-1.5 py-1 rounded transition" title="删除"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
      }).join('');
    }

    // 课件删除二次确认：点击后切换为"确认删除"按钮，3 秒内未点击则还原
    let coursewareConfirmTimer = null;
    function confirmDeleteCourseware(index) {
      const wrap = document.getElementById('cw-del-wrap-' + index);
      if (!wrap) return;
      const btn = wrap.querySelector('button[onclick*="confirmDeleteCourseware"]');
      if (!btn) return;
      // 已是确认态 → 执行删除
      if (wrap.dataset.confirming === '1') {
        clearTimeout(coursewareConfirmTimer);
        coursewareConfirmTimer = null;
        deleteTrainingCourseware(index);
        return;
      }
      // 切换为确认态
      wrap.dataset.confirming = '1';
      btn.className = 'text-red-500 bg-red-50 text-[11px] px-2 py-1 rounded transition';
      btn.innerHTML = '确认删除';
      btn.title = '';
      // 还原其他行的确认态
      document.querySelectorAll('[id^="cw-del-wrap-"]').forEach(el => {
        if (el !== wrap && el.dataset.confirming === '1') resetCoursewareConfirm(el.id.replace('cw-del-wrap-', ''));
      });
      coursewareConfirmTimer = setTimeout(() => resetCoursewareConfirm(index), 3000);
    }

    function resetCoursewareConfirm(index) {
      const wrap = document.getElementById('cw-del-wrap-' + index);
      if (!wrap) return;
      wrap.dataset.confirming = '0';
      const btn = wrap.querySelector('button[onclick*="confirmDeleteCourseware"]');
      if (btn) {
        btn.className = 'text-slate-400 hover:text-red-500 text-xs px-1.5 py-1 rounded transition';
        btn.innerHTML = '<i class="fas fa-trash"></i>';
        btn.title = '删除';
      }
    }

    async function deleteTrainingCourseware(index) {
      if (!currentEditingTraining || !currentEditingTraining.coursewareFiles) return;
      const file = currentEditingTraining.coursewareFiles[index];
      if (!file) return;
      const fileName = file.filename || file.url.split('/').pop();
      try {
        const res = await fetch(API + '/upload/courseware/' + encodeURIComponent(fileName), {
          method: 'DELETE'
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok || res.status === 404) {
          currentEditingTraining.coursewareFiles.splice(index, 1);
          document.getElementById('t-courseware-list').innerHTML = renderTrainingCoursewareList(currentEditingTraining.coursewareFiles);
          updateCoursewareCardStatus();
          toast('课件已删除');
        } else {
          toast(result.error || '删除失败', 'error');
        }
      } catch (e) {
        toast('删除失败', 'error');
      }
    }

    // ========== 培训弹窗 - 任务指派 ==========

    function onTrainingAccessTypeChange() {
      const accessType = document.getElementById('t-access-type').value;
      const allowedWrap = document.getElementById('t-allowed-users-wrap');
      const importWrap = document.getElementById('t-import-users-wrap');
      if (allowedWrap) allowedWrap.classList.toggle('hidden', accessType !== 'restricted' && accessType !== 'import');
      if (importWrap) importWrap.classList.toggle('hidden', accessType !== 'import');
    }

    async function openTrainingUserPicker() {
      await openUnifiedAssignPicker({
        mode: 'training',
        title: '选择学员',
        subtitle: '指定参加培训的学员',
        initialSelected: Array.from(trainingUserPickerTemp),
        onConfirm: () => {
          trainingUserPickerTemp = new Set(unifiedAssignState.selected);
          renderTrainingAllowedUsers();
        }
      });
    }

    async function onTrainingImportUsersFile() {
      const input = document.getElementById('t-import-users-file');
      const resultEl = document.getElementById('t-import-users-result');
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      try {
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const names = [];
        rows.forEach(row => {
          row.forEach(cell => {
            const v = cell !== undefined && cell !== null ? String(cell).trim() : '';
            if (v) names.push(v);
          });
        });
        if (!names.length) {
          resultEl.innerHTML = '<p class="text-xs text-red-500">未读取到任何姓名</p>';
          resultEl.classList.remove('hidden');
          return;
        }
        const res = await fetch('/api/data/users');
        const users = await res.json();
        const matched = [];
        const unmatched = [];
        const seen = new Set();
        names.forEach(name => {
          if (seen.has(name)) return;
          seen.add(name);
          const user = users.find(u => {
            const n = (u.real_name || u.username || '').trim();
            return n === name;
          });
          if (user) matched.push({ id: String(user.id), name: user.real_name || user.username });
          else unmatched.push(name);
        });
        matched.forEach(u => trainingUserPickerTemp.add(u.id));
        trainingUserPickerData.forEach(u => {
          u.selected = trainingUserPickerTemp.has(String(u.id));
        });
        renderTrainingAllowedUsers();
        let html = `<p class="text-xs text-emerald-600">成功导入 ${matched.length} 人</p>`;
        if (unmatched.length) {
          html += `<p class="text-xs text-amber-600 mt-0.5">未匹配 ${unmatched.length} 人：${escHtml(unmatched.slice(0, 5).join('、'))}${unmatched.length > 5 ? ' 等' : ''}</p>`;
        }
        resultEl.innerHTML = html;
        resultEl.classList.remove('hidden');
      } catch (e) {
        resultEl.innerHTML = '<p class="text-xs text-red-500">读取失败：' + escHtml(e.message) + '</p>';
        resultEl.classList.remove('hidden');
      }
    }

    function renderTrainingAllowedUsers() {
      const selected = trainingUserPickerData.filter(u => u.selected);
      const countEl = document.getElementById('t-allowed-users-count');
      const listEl = document.getElementById('t-allowed-users-list');
      if (countEl) countEl.textContent = selected.length;
      if (listEl) {
        if (selected.length === 0) {
          listEl.innerHTML = '<p class="text-sm text-slate-400 w-full">未选择学员</p>';
        } else {
          listEl.innerHTML = selected.map(u => `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs">
              ${escHtml(u.name)}
              <button type="button" onclick="removeTrainingAllowedUser('${u.id}')" class="text-indigo-400 hover:text-red-500">&times;</button>
            </span>
          `).join('');
        }
      }
    }

    function removeTrainingAllowedUser(id) {
      const sid = String(id);
      const user = trainingUserPickerData.find(u => String(u.id) === sid);
      if (user) user.selected = false;
      trainingUserPickerTemp.delete(id);
      trainingUserPickerTemp.delete(sid);
      trainingUserPickerTemp.delete(Number(id));
      renderTrainingAllowedUsers();
    }

    function editTraining(id) {
      const t = data.training.find(x => x.id === id);
      if (t) openTrainingModal(t);
    }

    async function deleteTraining(id, askConfirm = true) {
      if (askConfirm && !confirm('确定删除这个培训吗？学习风采、课件、报名/签到/考试/调研/指派记录将一并清理；独占的考试/调研也会被删除。')) return false;
      try {
        const res = await fetch(API + '/training/' + id, { method: 'DELETE' });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success !== false) {
          // 同步删除 localStorage 中的学习风采图片
          const gallery = safeParse('training_gallery', {});
          const strId = String(id);
          const numId = Number(id);
          let deleted = false;

          if (gallery[strId]) {
            delete gallery[strId];
            deleted = true;
          }
          if (gallery[numId]) {
            delete gallery[numId];
            deleted = true;
          }

          if (deleted) {
            localStorage.setItem('training_gallery', JSON.stringify(gallery));
            console.log(`[学习风采] 已同步删除培训 ${id} 的图片数据`);
          }

          if (askConfirm) {
            toast('培训已删除');
            await loadAllData();
            renderTraining();
          }
          return true;
        }
        if (askConfirm) toast(result.error || '删除失败', 'error');
        return false;
      } catch (err) {
        if (askConfirm) toast('删除失败', 'error');
        return false;
      }
    }

    // ========== 培训集成服务 (签到 + 满意度调研 + 考试) ==========

    async function viewTrainingSignins(trainingId) {
      try {
        const res = await fetch(API + '/training/' + trainingId + '/signins');
        const result = await res.json();
        const signins = result.data || [];
        const event = data.training.find(x => x.id === trainingId);
        const title = event ? event.name : '培训签到';

        const rows = signins.length > 0
          ? signins.map((s, i) => `
            <tr class="border-b border-slate-100">
              <td class="px-4 py-3 text-sm text-slate-600">${i + 1}</td>
              <td class="px-4 py-3 text-sm font-medium text-slate-800">${s.userName || '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${s.department || '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${new Date(s.signedAt).toLocaleString('zh-CN')}</td>
              <td class="px-4 py-3 text-right">
                <button onclick="deleteSignin(${s.id}, ${trainingId})" class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition" title="删除"><i class="fas fa-trash text-xs"></i></button>
              </td>
            </tr>`).join('')
          : `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400"><i class="fas fa-inbox text-2xl mb-2"></i><p>暂无签到记录</p></td></tr>`;

        showModal(`
          <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-check-circle text-emerald-500 mr-2"></i>签到数据</h3>
                <p class="text-sm text-slate-500">${title} · 共 ${signins.length} 人签到</p>
              </div>
              <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
            </div>
            <div class="p-6 overflow-y-auto">
              <table class="w-full">
                <thead class="bg-slate-50"><tr>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">姓名</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">部门</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">签到时间</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500">操作</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <p class="text-sm text-slate-500">签到人数：<strong class="text-slate-800">${signins.length}</strong></p>
              <button onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition">关闭</button>
            </div>
          </div>
        `);
      } catch (err) {
        toast('加载签到数据失败', 'error');
      }
    }

    async function deleteSignin(signinId, trainingId) {
      if (!confirm('确定删除这条签到记录?')) return;
      try {
        const res = await fetch(API + '/training/signins/' + signinId, { method: 'DELETE' });
        if (res.ok) {
          toast('签到记录已删除');
          closeModal();
          viewTrainingSignins(trainingId);
        } else {
          toast('删除失败', 'error');
        }
      } catch (err) {
        toast('删除失败', 'error');
      }
    }

    async function viewTrainingSurvey(trainingId) {
      try {
        const [statusRes, respRes] = await Promise.all([
          fetch(API + '/training/' + trainingId + '/service-status'),
          fetch(API + '/training/' + trainingId + '/survey-responses')
        ]);
        const status = await statusRes.json();
        const respResult = await respRes.json();
        const event = data.training.find(x => x.id === trainingId);
        const title = event ? event.name : '满意度调研';
        const survey = respResult.survey;
        const responses = respResult.data || [];

        if (!survey) {
          showModal(`
            <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
              <div class="text-center py-8">
                <i class="fas fa-poll text-4xl text-slate-300 mb-4"></i>
                <p class="text-lg font-medium text-slate-700 mb-2">未关联满意度调研</p>
                <p class="text-sm text-slate-400">请先为该培训配置关联的满意度调研</p>
                <button onclick="closeModal()" class="mt-4 px-6 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition">关闭</button>
              </div>
            </div>
          `);
          return;
        }

        // 统计评分题
        const ratingStats = {};
        (survey.questions || []).forEach(q => {
          if (q.type === 'rating') {
            const values = responses.map(r => {
              const ans = r.answers.find(a => a.questionId === q.id);
              return ans ? ans.value : null;
            }).filter(v => v !== null);
            const avg = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '-';
            ratingStats[q.id] = { avg, count: values.length };
          }
        });

        const statsHtml = (survey.questions || []).filter(q => q.type === 'rating').map(q => {
          const st = ratingStats[q.id] || { avg: '-', count: 0 };
          return `
            <div class="bg-slate-50 rounded-xl p-3">
              <p class="text-xs text-slate-500 mb-1">${q.title}</p>
              <p class="text-lg font-bold text-slate-800">${st.avg} <span class="text-xs font-normal text-slate-400">/ 5分 · ${st.count}人</span></p>
            </div>`;
        }).join('');

        const responseRows = responses.length > 0
          ? responses.map((r, i) => `
            <tr class="border-b border-slate-100">
              <td class="px-4 py-3 text-sm text-slate-600">${i + 1}</td>
              <td class="px-4 py-3 text-sm font-medium text-slate-800">${r.userName || '匿名'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${r.department || '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '-'}</td>
            </tr>`).join('')
          : `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400"><i class="fas fa-inbox text-2xl mb-2"></i><p>暂无人填写</p></td></tr>`;

        showModal(`
          <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-poll text-blue-500 mr-2"></i>满意度调研数据</h3>
                <p class="text-sm text-slate-500">${title} · ${survey.title} · 共 ${responses.length} 人填写</p>
              </div>
              <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
            </div>
            <div class="p-6 overflow-y-auto">
              ${statsHtml ? `<div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">${statsHtml}</div>` : ''}
              <table class="w-full">
                <thead class="bg-slate-50"><tr>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">填写人</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">部门</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">提交时间</th>
                </tr></thead>
                <tbody>${responseRows}</tbody>
              </table>
            </div>
            <div class="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <p class="text-sm text-slate-500">填写人数：<strong class="text-slate-800">${responses.length}</strong></p>
              <button onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition">关闭</button>
            </div>
          </div>
        `);
      } catch (err) {
        toast('加载调研数据失败', 'error');
      }
    }

    async function viewTrainingExam(trainingId) {
      try {
        const [statusRes, resultRes] = await Promise.all([
          fetch(API + '/training/' + trainingId + '/service-status'),
          fetch(API + '/training/' + trainingId + '/exam-results')
        ]);
        const status = await statusRes.json();
        const result = await resultRes.json();
        const event = data.training.find(x => x.id === trainingId);
        const title = event ? event.name : '考试';
        const exam = result.exam;
        const attempts = result.data || [];

        if (!exam) {
          showModal(`
            <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
              <div class="text-center py-8">
                <i class="fas fa-file-alt text-4xl text-slate-300 mb-4"></i>
                <p class="text-lg font-medium text-slate-700 mb-2">未关联考试</p>
                <p class="text-sm text-slate-400">请先为该培训配置关联的考试</p>
                <button onclick="closeModal()" class="mt-4 px-6 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition">关闭</button>
              </div>
            </div>
          `);
          return;
        }

        const passedCount = attempts.filter(a => a.passed).length;
        const avgScore = attempts.length > 0
          ? (attempts.reduce((s, a) => s + (a.score || 0), 0) / attempts.length).toFixed(1)
          : '-';

        const rows = attempts.length > 0
          ? attempts.map((a, i) => `
            <tr class="border-b border-slate-100">
              <td class="px-4 py-3 text-sm text-slate-600">${i + 1}</td>
              <td class="px-4 py-3 text-sm font-medium text-slate-800">${a.userName || a.userId || '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${a.score ?? '-'}</td>
              <td class="px-4 py-3 text-sm">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${a.passed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}">
                  ${a.passed ? '通过' : '未通过'}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-slate-600">${a.correctCount ?? '-'}/${a.totalQuestions ?? '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${a.submittedAt ? new Date(a.submittedAt).toLocaleString('zh-CN') : '-'}</td>
            </tr>`).join('')
          : `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400"><i class="fas fa-inbox text-2xl mb-2"></i><p>暂无人参加</p></td></tr>`;

        showModal(`
          <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-file-alt text-amber-500 mr-2"></i>考试数据</h3>
                <p class="text-sm text-slate-500">${title} · ${exam.name} · 及格线 ${exam.passingScore || 60}分</p>
              </div>
              <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
            </div>
            <div class="p-6 overflow-y-auto">
              <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="bg-slate-50 rounded-xl p-4 text-center">
                  <p class="text-2xl font-bold text-slate-800">${attempts.length}</p>
                  <p class="text-xs text-slate-500">参与人数</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 text-center">
                  <p class="text-2xl font-bold text-slate-800">${avgScore}</p>
                  <p class="text-xs text-slate-500">平均分</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 text-center">
                  <p class="text-2xl font-bold text-slate-800">${passedCount}</p>
                  <p class="text-xs text-slate-500">通过人数</p>
                </div>
              </div>
              <table class="w-full">
                <thead class="bg-slate-50"><tr>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">考生</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">得分</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">状态</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">正确/总数</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">提交时间</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <p class="text-sm text-slate-500">参与人数：<strong class="text-slate-800">${attempts.length}</strong> · 通过率：<strong class="text-slate-800">${attempts.length > 0 ? Math.round(passedCount / attempts.length * 100) : 0}%</strong></p>
              <button onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition">关闭</button>
            </div>
          </div>
        `);
      } catch (err) {
        toast('加载考试数据失败', 'error');
      }
    }

    // ========== 培训报名管理 ==========

    // 查看报名人员（数据统计）
    async function viewTrainingEnrollments(trainingId) {
      try {
        const res = await fetch(API + '/training/' + trainingId + '/enrollments');
        const result = await res.json();
        const enrollments = result.data || [];
        const event = data.training.find(x => x.id === trainingId);
        const title = event ? event.name : '培训报名';

        const rows = enrollments.length > 0
          ? enrollments.map((e, i) => {
            const seed = encodeURIComponent(e.userName || e.userId);
            const avatarUrl = e.userAvatar && e.userAvatar.startsWith('http') ? e.userAvatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
            return `
            <tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="px-4 py-3 text-sm text-slate-600">${i + 1}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <img src="${avatarUrl}" class="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm" />
                  <span class="text-sm font-medium text-slate-800">${e.userName || '-'}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-slate-600">${e.userDepartment || '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${e.userPhone || '-'}</td>
              <td class="px-4 py-3 text-sm text-slate-600">${e.enrolledAt ? new Date(e.enrolledAt).toLocaleString('zh-CN') : '-'}</td>
              <td class="px-4 py-3 text-right">
                <button onclick="removeEnrollment(${e.id}, ${trainingId})" class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition" title="移除"><i class="fas fa-times text-xs"></i></button>
              </td>
            </tr>`;
          }).join('')
          : `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">
              <i class="fas fa-users text-2xl mb-2 block"></i>
              <p>暂无报名人员</p>
              <p class="text-xs mt-1">点击"指派学员"按钮添加学员</p>
            </td></tr>`;

        // 部门统计
        const deptStats = {};
        enrollments.forEach(e => {
          const dept = e.userDepartment || '未知部门';
          deptStats[dept] = (deptStats[dept] || 0) + 1;
        });
        const deptBadges = Object.entries(deptStats).map(([dept, count]) =>
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">${dept}: ${count}</span>`
        ).join('');

        showModal(`
          <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-users text-indigo-500 mr-2"></i>报名数据统计</h3>
                <p class="text-sm text-slate-500">${title}</p>
              </div>
              <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
            </div>
            <div class="px-6 py-3 border-b border-slate-50 flex items-center justify-between">
              <div class="flex items-center gap-2 flex-wrap">${deptBadges || '<span class="text-xs text-slate-400">暂无数据</span>'}</div>
              <button onclick="openAssignStudentsModal(${trainingId})" class="px-3 py-1.5 bg-cyan-50 text-cyan-600 rounded-lg text-xs font-medium hover:bg-cyan-100 transition">
                <i class="fas fa-user-plus mr-1"></i>指派学员
              </button>
            </div>
            <div class="p-6 overflow-y-auto flex-1">
              <table class="w-full">
                <thead class="bg-slate-50"><tr>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">姓名</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">部门</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">电话</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">报名时间</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500">操作</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <p class="text-sm text-slate-500">报名总人数：<strong class="text-indigo-600">${enrollments.length}</strong></p>
              <button onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition">关闭</button>
            </div>
          </div>
        `);
      } catch (err) {
        toast('加载报名数据失败', 'error');
      }
    }

    // 移除单个报名
    async function removeEnrollment(enrollId, trainingId) {
      if (!confirm('确定移除该学员的报名?')) return;
      try {
        const res = await fetch(API + '/training/' + trainingId + '/enrollments/' + enrollId, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
          toast('已移除报名');
          viewTrainingEnrollments(trainingId); // 刷新
        } else {
          toast(result.error || '移除失败', 'error');
        }
      } catch (err) {
        toast('操作失败', 'error');
      }
    }

    // 分享培训任务
    function openTrainingShareModal(trainingId) {
      const event = data.training.find(x => x.id === trainingId);
      if (!event) return;
      const shareUrl = window.location.origin + '/training-signin.html?id=' + trainingId;
      const dingtalkUrl = 'dingtalk://page/link?url=' + encodeURIComponent(shareUrl);
      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-share-alt text-purple-500 mr-2"></i>分享</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-6 overflow-y-auto">
            <div class="mb-5">
              <span class="inline-block px-4 py-1.5 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg">企业内分享</span>
            </div>
            <div class="space-y-4 mb-6">
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">钉钉内链</label>
                <div class="flex items-center gap-2">
                  <input type="text" id="training-dingtalk-link" value="${dingtalkUrl}" readonly class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600">
                  <button onclick="copyTrainingShareLink('training-dingtalk-link')" class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition">复制链接</button>
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">分享链接</label>
                <div class="flex items-center gap-2">
                  <input type="text" id="training-share-link" value="${shareUrl}" readonly class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600">
                  <button onclick="copyTrainingShareLink('training-share-link')" class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition">复制链接</button>
                </div>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-3">生成海报</label>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                <div onclick="openTrainingPosterModal(${trainingId})" class="group cursor-pointer rounded-xl overflow-hidden border border-slate-200 hover:border-orange-300 hover:shadow-md transition bg-slate-50">
                  <div class="aspect-[9/16] bg-gradient-to-br from-indigo-50 via-white to-orange-50 relative p-3 flex flex-col items-center justify-center">
                    <div class="absolute top-3 left-3 text-[10px] font-bold text-orange-500">游雁学院</div>
                    <div class="w-full bg-orange-400 rounded-lg py-2 text-center mb-3">
                      <p class="text-[10px] text-white font-medium">分享码</p>
                      <p class="text-[8px] text-orange-100 truncate px-1">${escHtml(event.name || '培训分享')}</p>
                    </div>
                    <div class="w-12 h-12 bg-white rounded-lg border border-slate-100 flex items-center justify-center">
                      <i class="fas fa-qrcode text-slate-700 text-lg"></i>
                    </div>
                    <div class="mt-2 text-[8px] text-slate-400">长按或扫描查看</div>
                  </div>
                  <div class="px-3 py-2 bg-white text-center">
                    <p class="text-xs font-medium text-slate-700">简约模板</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="px-6 py-4 border-t border-slate-100 flex justify-end flex-shrink-0">
            <button onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition">关闭</button>
          </div>
        </div>
      `);
    }

    function copyTrainingShareLink(inputId) {
      const input = document.getElementById(inputId || 'training-share-link');
      if (!input) return;
      input.select();
      document.execCommand('copy');
      toast('链接已复制');
    }

    // 海报生成与预览
    function openTrainingPosterModal(trainingId) {
      const event = data.training.find(x => x.id === trainingId);
      if (!event) return;
      const shareUrl = window.location.origin + '/training-signin.html?id=' + trainingId;
      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <h3 class="text-lg font-semibold text-slate-800">海报预览</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-6 overflow-y-auto flex flex-col items-center">
            <div id="training-poster-wrap" class="rounded-xl overflow-hidden shadow-lg mb-5">
              <canvas id="training-poster-canvas" width="750" height="1334" class="w-full max-w-[280px] h-auto"></canvas>
            </div>
            <button onclick="downloadTrainingPoster()" class="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition flex items-center gap-2">
              <i class="fas fa-download"></i>保存到电脑
            </button>
          </div>
        </div>
      `);
      generateTrainingPoster(event, shareUrl);
    }

    let currentTrainingPosterCanvas = null;

    function generateTrainingPoster(event, shareUrl) {
      const canvas = document.getElementById('training-poster-canvas');
      if (!canvas) return;
      currentTrainingPosterCanvas = canvas;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;

      // 背景
      const gradient = ctx.createLinearGradient(0, 0, W, H);
      gradient.addColorStop(0, '#f8fafc');
      gradient.addColorStop(0.5, '#ffffff');
      gradient.addColorStop(1, '#fff7ed');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);

      // 装饰圆
      ctx.beginPath();
      ctx.arc(W * 0.85, H * 0.12, 120, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.08)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(W * 0.15, H * 0.88, 90, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
      ctx.fill();

      // Logo
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(70, 70, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('游', 70, 77);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('游雁学院', 105, 80);

      // 主卡片
      const cardX = 60;
      const cardY = 180;
      const cardW = W - 120;
      const cardH = H - 360;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, cardX, cardY, cardW, cardH, 24);
      ctx.fill();
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 10;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // 橙色标题栏
      const headerH = 180;
      ctx.fillStyle = '#f97316';
      roundRect(ctx, cardX, cardY, cardW, headerH, { tl: 24, tr: 24, br: 0, bl: 0 });
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('分享码', W / 2, cardY + 80);

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '30px sans-serif';
      const title = event.name || '未命名培训';
      const maxTitleWidth = cardW - 80;
      fillTextWithWrap(ctx, title, W / 2, cardY + 140, maxTitleWidth, 44, 'center');

      // 生成二维码并绘制
      const qrSize = 360;
      const qrContainer = document.createElement('div');
      qrContainer.style.position = 'fixed';
      qrContainer.style.left = '-9999px';
      document.body.appendChild(qrContainer);
      new QRCode(qrContainer, {
        text: shareUrl,
        width: qrSize,
        height: qrSize,
        colorDark: '#1e293b',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });

      setTimeout(() => {
        const qrCanvas = qrContainer.querySelector('canvas');
        if (qrCanvas) {
          const qrX = (W - qrSize) / 2;
          const qrY = cardY + headerH + 90;
          ctx.fillStyle = '#ffffff';
          roundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 16);
          ctx.fill();
          ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
        }
        document.body.removeChild(qrContainer);

        // 底部提示
        ctx.fillStyle = '#94a3b8';
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('长按或扫描查看', W / 2, H - 140);
      }, 100);
    }

    function roundRect(ctx, x, y, width, height, radius) {
      let r = radius;
      if (typeof radius === 'number') {
        r = { tl: radius, tr: radius, br: radius, bl: radius };
      }
      ctx.beginPath();
      ctx.moveTo(x + r.tl, y);
      ctx.lineTo(x + width - r.tr, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r.tr);
      ctx.lineTo(x + width, y + height - r.br);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r.br, y + height);
      ctx.lineTo(x + r.bl, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r.bl);
      ctx.lineTo(x, y + r.tl);
      ctx.quadraticCurveTo(x, y, x + r.tl, y);
      ctx.closePath();
    }

    function fillTextWithWrap(ctx, text, x, y, maxWidth, lineHeight, align) {
      const chars = text.split('');
      let line = '';
      const lines = [];
      for (let i = 0; i < chars.length; i++) {
        const testLine = line + chars[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line) {
          lines.push(line);
          line = chars[i];
        } else {
          line = testLine;
        }
      }
      lines.push(line);
      lines.slice(0, 2).forEach((l, i) => {
        ctx.textAlign = align || 'left';
        ctx.fillText(l, x, y + i * lineHeight);
      });
    }

    function downloadTrainingPoster() {
      const canvas = currentTrainingPosterCanvas;
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = '培训分享海报.png';
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast('海报已保存');
    }

    // 指派学员
    // ========== 通用学员指派弹窗状态与函数（培训/考试/报名分析共用） ==========
    let unifiedAssignState = {
      mode: 'training', // 'training' | 'exam' | 'assign'
      targetId: null,
      users: [],
      selected: new Set(),
      departments: {},
      currentDept: '全部',
      search: '',
      title: '选择学员',
      subtitle: '',
      onConfirm: null
    };

    async function ensureAllUsersLoaded() {
      if (allUsers && allUsers.length > 0) return;
      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const usersRes = await fetch(API + '/auth/users', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (usersRes.ok) {
          const usersJson = await usersRes.json();
          allUsers = (usersJson.data && usersJson.data.users) ? usersJson.data.users : (usersJson.data || usersJson || []);
        }
      } catch(e) { /* ignore */ }
    }

    async function openUnifiedAssignPicker(options) {
      const { mode, targetId, title, subtitle, initialSelected, onConfirm } = options || {};
      unifiedAssignState.mode = mode || 'training';
      unifiedAssignState.targetId = targetId || null;
      unifiedAssignState.title = title || '选择学员';
      unifiedAssignState.subtitle = subtitle || '';
      unifiedAssignState.onConfirm = onConfirm || null;
      unifiedAssignState.currentDept = '全部';
      unifiedAssignState.search = '';
      unifiedAssignState.selected = new Set((initialSelected || []).map(String));

      await ensureAllUsersLoaded();
      const users = allUsers || [];
      if (users.length === 0) {
        toast('暂无可用用户，请先添加用户', 'warning');
        return;
      }

      // 按部门分组
      const departments = { '全部': users };
      users.forEach(u => {
        const dept = u.department || '未分组';
        if (!departments[dept]) departments[dept] = [];
        departments[dept].push(u);
      });
      unifiedAssignState.departments = departments;
      unifiedAssignState.users = users;

      // 同步原有 temp Set，保证兼容
      if (mode === 'training') {
        trainingUserPickerTemp = new Set(unifiedAssignState.selected);
      } else if (mode === 'exam') {
        examUserPickerTemp = new Set(unifiedAssignState.selected);
      } else if (mode === 'assign') {
        assignExamUserPickerTemp = new Set(unifiedAssignState.selected);
      }

      const modal = document.getElementById('unifiedAssignModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.getElementById('unifiedAssignTitle').textContent = unifiedAssignState.title;
      document.getElementById('unifiedAssignSubtitle').textContent = unifiedAssignState.subtitle;
      document.getElementById('unifiedAssignSearch').value = '';
      renderUnifiedAssignPicker();
    }

    function closeUnifiedAssignPicker() {
      const modal = document.getElementById('unifiedAssignModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function renderUnifiedAssignPicker() {
      const state = unifiedAssignState;
      const users = state.users;
      const departments = state.departments;
      const selected = state.selected;
      const currentDept = state.currentDept;
      const search = state.search.toLowerCase();

      // 左侧部门列表
      const deptList = document.getElementById('unifiedAssignDeptList');
      const deptEntries = Object.entries(departments).filter(([name]) => name !== '全部').sort((a, b) => a[0].localeCompare(b[0]));
      const allCount = users.length;
      deptList.innerHTML = `
        <button onclick="switchUnifiedAssignDept('全部')" class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${currentDept === '全部' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}">
          <span>全部</span>
          <span class="text-xs ${currentDept === '全部' ? 'text-indigo-500' : 'text-slate-400'}">${allCount}</span>
        </button>
        ${deptEntries.map(([dept, deptUsers]) => {
          const isActive = currentDept === dept;
          return `
            <button onclick="switchUnifiedAssignDept('${escHtml(dept)}')" class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}">
              <span class="truncate text-left flex-1">${escHtml(dept)}</span>
              <span class="text-xs ${isActive ? 'text-indigo-500' : 'text-slate-400'} ml-2">${deptUsers.length}</span>
            </button>`;
        }).join('')}
      `;

      // 右侧学员列表
      const userList = document.getElementById('unifiedAssignUserList');
      let displayUsers = currentDept === '全部' ? users : (departments[currentDept] || []);
      if (search) {
        displayUsers = displayUsers.filter(u => (u.realName || u.username || '').toLowerCase().includes(search));
      }

      if (displayUsers.length === 0) {
        userList.innerHTML = '<p class="text-sm text-slate-400 text-center py-8 col-span-full">无匹配学员</p>';
      } else {
        const deptAllTarget = currentDept === '全部' ? users : (departments[currentDept] || []);
        const deptAllSelected = deptAllTarget.length > 0 && deptAllTarget.every(u => selected.has(String(u.id)));
        const deptAllIndeterminate = !deptAllSelected && deptAllTarget.some(u => selected.has(String(u.id)));
        const deptLabel = currentDept === '全部' ? '全部学员' : escHtml(currentDept);

        userList.innerHTML = `
          <label class="col-span-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 cursor-pointer hover:bg-slate-100 transition select-none">
            <input type="checkbox" id="unifiedAssignDeptAll" onchange="toggleUnifiedAssignAll()" class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" ${deptAllSelected ? 'checked' : ''}>
            <span class="text-sm text-slate-700 font-medium">全选${deptLabel}</span>
            <span class="text-xs text-slate-400 ml-auto">${deptAllTarget.length} 人</span>
          </label>
        ` + displayUsers.map(u => {
          const uid = String(u.id);
          const checked = selected.has(uid);
          const name = u.realName || u.username || '未知';
          return `
            <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition ${checked ? 'bg-indigo-50' : 'bg-white border border-slate-100'}">
              <input type="checkbox" class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" ${checked ? 'checked' : ''} onchange="toggleUnifiedAssignUser('${uid}')">
              <span class="text-sm text-slate-700 truncate">${escHtml(name)}</span>
            </label>`;
        }).join('');

        const deptAllCheckbox = document.getElementById('unifiedAssignDeptAll');
        if (deptAllCheckbox) deptAllCheckbox.indeterminate = deptAllIndeterminate;
      }

      // 更新已选计数
      document.getElementById('unifiedAssignCount').textContent = selected.size;
    }

    function switchUnifiedAssignDept(dept) {
      unifiedAssignState.currentDept = dept;
      renderUnifiedAssignPicker();
    }

    function toggleUnifiedAssignUser(userId) {
      const uid = String(userId);
      if (unifiedAssignState.selected.has(uid)) {
        unifiedAssignState.selected.delete(uid);
      } else {
        unifiedAssignState.selected.add(uid);
      }
      // 同步对应 temp Set
      if (unifiedAssignState.mode === 'training') {
        if (unifiedAssignState.selected.has(uid)) trainingUserPickerTemp.add(uid);
        else trainingUserPickerTemp.delete(uid);
      } else if (unifiedAssignState.mode === 'exam') {
        if (unifiedAssignState.selected.has(uid)) examUserPickerTemp.add(uid);
        else examUserPickerTemp.delete(uid);
      } else if (unifiedAssignState.mode === 'assign') {
        if (unifiedAssignState.selected.has(uid)) assignExamUserPickerTemp.add(uid);
        else assignExamUserPickerTemp.delete(uid);
      }
      renderUnifiedAssignPicker();
    }

    function toggleUnifiedAssignAll() {
      const allCheckbox = document.getElementById('unifiedAssignDeptAll');
      const checked = allCheckbox.checked;
      const state = unifiedAssignState;
      const targetUsers = state.currentDept === '全部' ? state.users : (state.departments[state.currentDept] || []);
      targetUsers.forEach(u => {
        const uid = String(u.id);
        if (checked) state.selected.add(uid);
        else state.selected.delete(uid);
      });
      // 同步 temp Set
      if (state.mode === 'training') {
        trainingUserPickerTemp = new Set(state.selected);
      } else if (state.mode === 'exam') {
        examUserPickerTemp = new Set(state.selected);
      } else if (state.mode === 'assign') {
        assignExamUserPickerTemp = new Set(state.selected);
      }
      renderUnifiedAssignPicker();
    }

    function filterUnifiedAssignUsers(keyword) {
      unifiedAssignState.search = keyword || '';
      renderUnifiedAssignPicker();
    }

    function syncUnifiedAssignToLegacyData() {
      const state = unifiedAssignState;
      const sync = (dataArr) => {
        dataArr.forEach(u => {
          u.selected = state.selected.has(String(u.id));
        });
      };
      if (state.mode === 'training') sync(trainingUserPickerData);
      else if (state.mode === 'exam') sync(examUserPickerData);
      else if (state.mode === 'assign') sync(assignExamUserPickerData);
    }

    async function confirmUnifiedAssignPicker() {
      const state = unifiedAssignState;
      const selectedIds = Array.from(state.selected).map(id => isNaN(Number(id)) ? id : Number(id));

      // 同步旧的数据数组，保证 renderAllowedUsers 显示正确
      syncUnifiedAssignToLegacyData();

      if (state.mode === 'training') {
        trainingUserPickerTemp = new Set(state.selected);
        renderTrainingAllowedUsers();
        closeUnifiedAssignPicker();
        return;
      }

      if (state.mode === 'exam') {
        examUserPickerTemp = new Set(state.selected);
        renderExamAllowedUsers();
        closeUnifiedAssignPicker();
        return;
      }

      if ((state.mode === 'assign' || state.mode === 'certificate') && state.targetId && typeof state.onConfirm === 'function') {
        await state.onConfirm(selectedIds);
        closeUnifiedAssignPicker();
        return;
      }

      closeUnifiedAssignPicker();
    }

    async function openAssignStudentsModal(trainingId) {
      try {
        const enrollRes = await fetch(API + '/training/' + trainingId + '/enrollments');
        const enrollData = await enrollRes.json();
        const enrolledIds = (enrollData.data || []).map(e => String(e.userId));
        const event = data.training.find(x => x.id === trainingId);

        await openUnifiedAssignPicker({
          mode: 'assign',
          targetId: trainingId,
          title: '指派学员',
          subtitle: event ? event.name : '培训指派',
          initialSelected: enrolledIds,
          onConfirm: async (selectedIds) => {
            const toAdd = selectedIds.filter(id => !enrolledIds.includes(String(id)));
            const toRemove = enrolledIds.filter(id => !selectedIds.includes(Number(id)));

            if (toAdd.length > 0) {
              const res = await fetch(API + '/training/' + trainingId + '/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: toAdd })
              });
              const result = await res.json();
              if (!result.success) {
                toast(result.error || '指派失败', 'error');
                return;
              }
            }

            for (const userId of toRemove) {
              await fetch(API + '/training/' + trainingId + '/enroll', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
              });
            }

            const msgs = [];
            if (toAdd.length > 0) msgs.push(`新增 ${toAdd.length} 人`);
            if (toRemove.length > 0) msgs.push(`移除 ${toRemove.length} 人`);
            toast(msgs.length > 0 ? msgs.join('，') : '无变更');

            await loadAllData();
            renderTrainingList();
            if (trainingViewMode === 'analytics' && analyticsTrainingId === trainingId) {
              await renderAnalyticsOverview(trainingId);
              await renderAnalyticsEnroll(trainingId);
            }
          }
        });
      } catch (err) {
        toast('加载失败', 'error');
      }
    }

    async function openAssignHistoryModal(trainingId) {
      try {
        const event = data.training.find(x => x.id === trainingId);
        const res = await fetch(API + '/training/' + trainingId + '/assign-history');
        const result = await res.json();
        const history = result.data || [];

        const rows = history.length > 0
          ? history.map((h, i) => `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
              <td class="px-4 py-3 text-sm text-slate-500">${i + 1}</td>
              <td class="px-4 py-3 text-sm text-slate-700 font-medium">
                ${h.count || 0} 人
                ${h.isInitial ? '<span class="ml-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px]">创建/编辑时指派</span>' : ''}
              </td>
              <td class="px-4 py-3 text-sm text-slate-600">
                <div class="flex flex-wrap gap-1">
                  ${(h.userNames || []).slice(0, 8).map(name => `<span class="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">${escHtml(name)}</span>`).join('')}
                  ${(h.userNames || []).length > 8 ? `<span class="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">+${h.userNames.length - 8} 人</span>` : ''}
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-slate-500">${h.assignedAt ? new Date(h.assignedAt).toLocaleString('zh-CN') : '-'}</td>
            </tr>`).join('')
          : `<tr><td colspan="4" class="px-4 py-12 text-center text-slate-400"><i class="fas fa-history text-3xl mb-3 block text-slate-300"></i><p>暂无指派记录</p></td></tr>`;

        showModal(`
          <div class="modal bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-history text-slate-500 mr-2"></i>指派记录</h3>
                <p class="text-sm text-slate-500">${event ? event.name : '培训指派'}</p>
              </div>
              <button onclick="closeModal()" class="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"><i class="fas fa-times text-lg"></i></button>
            </div>
            <div class="p-6 overflow-y-auto flex-1">
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full">
                  <thead class="bg-slate-50"><tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">序号</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">指派人数</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">学员名单</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">指派时间</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">关闭</button>
            </div>
          </div>
        `);
      } catch (err) {
        toast('加载指派记录失败', 'error');
      }
    }

    // 部门全选/取消
    function toggleDeptUsers(dept, checked) {
      const checkboxes = document.querySelectorAll(`.user-check[data-dept="${dept}"]`);
      checkboxes.forEach(cb => { cb.checked = checked; });
      updateAssignCount();
    }

    // 同步部门复选框状态
    function syncDeptCheckbox(dept) {
      const checkboxes = document.querySelectorAll(`.user-check[data-dept="${dept}"]`);
      const deptCb = document.querySelector(`.dept-check[data-dept="${dept}"]`);
      if (deptCb) {
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
        deptCb.checked = allChecked;
      }
    }

    // 搜索过滤
    function filterAssignUsers(keyword) {
      const labels = document.querySelectorAll('#assign-users-list label');
      const kw = keyword.trim().toLowerCase();
      labels.forEach(label => {
        const nameSpan = label.querySelector('span.text-xs');
        if (nameSpan) {
          const name = nameSpan.textContent.toLowerCase();
          label.style.display = (!kw || name.includes(kw)) ? '' : 'none';
        }
      });
      // 部门标题也做显隐处理
      document.querySelectorAll('#assign-users-list > div').forEach(deptDiv => {
        const visibleUsers = deptDiv.querySelectorAll('.grid label:not([style*="display: none"])');
        const deptHeader = deptDiv.querySelector('.flex.items-center.justify-between');
        if (deptHeader) {
          deptHeader.style.display = (kw && visibleUsers.length === 0) ? 'none' : '';
        }
      });
    }

    // 更新已选计数
    function updateAssignCount() {
      const count = document.querySelectorAll('#assign-users-list .user-check:checked').length;
      const el = document.getElementById('assign-count');
      if (el) el.textContent = `已选: ${count} 人`;
    }

    // 提交指派
    async function submitAssignStudents(trainingId) {
      const checkedIds = Array.from(document.querySelectorAll('#assign-users-list .user-check:checked'))
        .map(cb => parseInt(cb.dataset.userId));

      // 获取当前已报名ID
      try {
        const enrollRes = await fetch(API + '/training/' + trainingId + '/enrollments');
        const enrollData = await enrollRes.json();
        const currentEnrolledIds = new Set((enrollData.data || []).map(e => e.userId));

        const toAdd = checkedIds.filter(id => !currentEnrolledIds.has(id));
        const toRemove = Array.from(currentEnrolledIds).filter(id => !checkedIds.includes(id));

        // 批量添加
        if (toAdd.length > 0) {
          const res = await fetch(API + '/training/' + trainingId + '/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: toAdd })
          });
          const result = await res.json();
          if (!result.success) {
            toast(result.error || '指派失败', 'error');
            return;
          }
        }

        // 批量移除取消勾选的
        for (const userId of toRemove) {
          await fetch(API + '/training/' + trainingId + '/enroll', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          });
        }

        const msgs = [];
        if (toAdd.length > 0) msgs.push(`新增 ${toAdd.length} 人`);
        if (toRemove.length > 0) msgs.push(`移除 ${toRemove.length} 人`);
        toast(msgs.length > 0 ? msgs.join('，') : '无变更');

        closeModal();
        // 刷新数据
        await loadAllData();
        renderTrainingList();
        // 如果当前在数据分析视图，也刷新当前标签页
        if (trainingViewMode === 'analytics' && analyticsTrainingId === trainingId) {
          switchAnalyticsTab(analyticsCurrentTab);
        }
      } catch (err) {
        toast('操作失败', 'error');
      }
    }

    // ========== 用户管理 ==========
    let allUsers = [];
    let filteredUsers = [];
    let userCurrentPage = 1;
    const userPageSize = 10;

    // 加载用户列表
    async function loadUsers() {
      console.log('[User Management] 开始加载用户列表...');
      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        console.log('[User Management] Token:', token ? '存在' : '不存在');

        if (!token) {
          toast('请先登录', 'error');
          return;
        }

        console.log('[User Management] 请求API:', API + '/auth/users');
        const res = await fetch(API + '/auth/users', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log('[User Management] 响应状态:', res.status);

        if (res.ok) {
          const result = await res.json();
          console.log('[User Management] 获取到的用户数据:', result);
          allUsers = result.data.users || [];
          console.log('[User Management] 用户数量:', allUsers.length);
          filterAndRenderUsers();
        } else {
          const errorText = await res.text();
          console.error('[User Management] 加载失败:', res.status, errorText);
          toast('加载用户失败: ' + res.status, 'error');
        }
      } catch (err) {
        console.error('[User Management] 网络错误:', err);
        toast('网络错误', 'error');
      }
    }

    // 过滤并渲染用户
    function filterAndRenderUsers() {
      const searchTerm = document.getElementById('user-search-input')?.value.toLowerCase() || '';
      const roleFilter = document.getElementById('user-role-filter')?.value || 'all';
      const statusFilter = document.getElementById('user-status-filter')?.value || 'all';

      filteredUsers = allUsers.filter(user => {
        // 搜索过滤
        const matchSearch = !searchTerm ||
          (user.username && user.username.toLowerCase().includes(searchTerm)) ||
          (user.realName && user.realName.toLowerCase().includes(searchTerm)) ||
          (user.phone && user.phone.includes(searchTerm));

        // 角色过滤
        const matchRole = roleFilter === 'all' || user.role === roleFilter;

        // 状态过滤
        const matchStatus = statusFilter === 'all' || user.status === statusFilter;

        return matchSearch && matchRole && matchStatus;
      });

      // 更新统计
      updateUserStats();

      // 渲染列表
      userCurrentPage = 1;
      renderUserList();
    }

    // 更新用户统计
    function updateUserStats() {
      const total = allUsers.length;
      const active = allUsers.filter(u => u.status === 'active').length;
      const disabled = allUsers.filter(u => u.status === 'disabled').length;

      const today = new Date().toLocaleDateString('zh-CN');
      const todayCount = allUsers.filter(u => {
        if (!u.createdAt) return false;
        const createDate = new Date(u.createdAt.replace(/\//g, '-'));
        return createDate.toLocaleDateString('zh-CN') === today;
      }).length;

      document.getElementById('user-stat-total').textContent = total;
      document.getElementById('user-stat-active').textContent = active;
      document.getElementById('user-stat-disabled').textContent = disabled;
      document.getElementById('user-stat-today').textContent = todayCount;
    }

    // 用户批量选择逻辑
    function toggleUserSelect(id) {
      const sid = String(id);
      if (userSelectedIds.has(sid)) userSelectedIds.delete(sid);
      else userSelectedIds.add(sid);
      updateUserSelectAllState();
      updateUserBatchActionBar();
    }

    function toggleUserSelectAll() {
      const checked = document.getElementById('userSelectAll').checked;
      const start = (userCurrentPage - 1) * userPageSize;
      const end = start + userPageSize;
      const pageUsers = filteredUsers.slice(start, end);
      if (checked) pageUsers.forEach(u => userSelectedIds.add(String(u.id)));
      else pageUsers.forEach(u => userSelectedIds.delete(String(u.id)));
      renderUserList();
      updateUserBatchActionBar();
    }

    function updateUserSelectAllState() {
      const start = (userCurrentPage - 1) * userPageSize;
      const end = start + userPageSize;
      const pageUsers = filteredUsers.slice(start, end);
      const allChecked = pageUsers.length > 0 && pageUsers.every(u => userSelectedIds.has(String(u.id)));
      const el = document.getElementById('userSelectAll');
      if (el) el.checked = allChecked;
    }

    function updateUserBatchActionBar() {
      const bar = document.getElementById('userBatchActionBar');
      const count = document.getElementById('userBatchCount');
      if (!bar || !count) return;
      if (userSelectedIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = `已选 ${userSelectedIds.size} 项`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function clearUserSelection() {
      userSelectedIds.clear();
      const el = document.getElementById('userSelectAll');
      if (el) el.checked = false;
      renderUserList();
      updateUserBatchActionBar();
    }

    async function batchDeleteUsers() {
      const ids = Array.from(userSelectedIds);
      if (!ids.length) return;
      const currentUser = safeParse('user', null) || (function(){ try { return JSON.parse(sessionStorage.getItem('user')); } catch(e) { return null; } })() || {};
      const currentUserId = String(currentUser.id);
      const deletableIds = ids.filter(id => id !== currentUserId);
      if (!deletableIds.length) {
        toast('不能删除当前登录账号', 'error');
        return;
      }
      const batchConfirm = await showConfirmDialog({
        title: '🗑️ 批量删除用户',
        message: `确定要永久删除选中的 <strong>${deletableIds.length}</strong> 个用户吗？`,
        type: 'danger',
        confirmText: '确认批量删除',
        cancelText: '取消',
        detailText: `此操作将永久删除以下数量的用户账号：${deletableIds.length} 个\n\n⚠️ 此操作不可恢复！`
      });
      
      if (!batchConfirm) return;
      let success = 0, fail = 0;
      for (const id of deletableIds) {
        try {
          const ok = await deleteUser(parseInt(id), false);
          if (ok) success++; else fail++;
        } catch (e) { fail++; }
      }
      clearUserSelection();
      await loadUsers();
      toast(`删除完成：成功 ${success}，失败 ${fail}`);
    }

    // 渲染用户列表
    function renderUserList() {
      const tbody = document.getElementById('user-list');
      if (!tbody) return;

      const totalPages = Math.ceil(filteredUsers.length / userPageSize);
      const start = (userCurrentPage - 1) * userPageSize;
      const end = start + userPageSize;
      const pageUsers = filteredUsers.slice(start, end);

      if (pageUsers.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="px-6 py-12 text-center text-slate-400">
              <i class="fas fa-inbox text-4xl mb-3 block"></i>
              <p>暂无用户数据</p>
            </td>
          </tr>
        `;
        updateUserBatchActionBar();
        return;
      }

      const currentUser = safeParse('user', null) || (function(){ try { return JSON.parse(sessionStorage.getItem('user')); } catch(e) { return null; } })() || {};
      const currentUserId = currentUser.id;
      tbody.innerHTML = pageUsers.map(user => {
        const isCurrentUser = user.id === currentUserId;
        const roleMap = {
          admin: { text: '管理员', class: 'bg-red-100 text-red-700' },
          teacher: { text: '讲师', class: 'bg-blue-100 text-blue-700' },
          user: { text: '学员', class: 'bg-gray-100 text-gray-700' }
        };
        const roleInfo = roleMap[user.role] || roleMap.user;

        const statusInfo = user.status === 'active'
          ? { text: '正常', class: 'bg-green-100 text-green-700' }
          : { text: '禁用', class: 'bg-yellow-100 text-yellow-700' };

        // 完整显示手机号(管理员可见)
        const phone = user.phone || '-';
        const checked = userSelectedIds.has(String(user.id)) ? 'checked' : '';

        return `
          <tr class="hover:bg-slate-50 transition">
            <!-- 选择 -->
            <td class="pl-5 pr-2 py-4 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" class="user-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleUserSelect('${user.id}')" ${checked}>
            </td>
            <!-- 手机号 -->
            <td class="px-6 py-4 text-sm text-slate-700">${phone}</td>
            <!-- 姓名 -->
              <td class="px-6 py-4">
                <p class="font-medium text-slate-800">${user.realName || user.username}</p>
              </td>
              <!-- 部门 -->
              <td class="px-6 py-4 text-center text-sm text-slate-600">${user.department || '-'}</td>
              <!-- 岗位 -->
              <td class="px-6 py-4 text-center text-sm text-slate-600">${user.position || '-'}</td>
              <!-- 角色 -->
              <td class="px-6 py-4 text-center">
                <span class="px-2 py-1 ${roleInfo.class} rounded-full text-xs">${roleInfo.text}</span>
              </td>
              <!-- 状态 -->
              <td class="px-6 py-4 text-center">
                <span class="px-2 py-1 ${statusInfo.class} rounded-full text-xs">${statusInfo.text}</span>
              </td>
              <!-- 注册时间 -->
              <td class="px-6 py-4 text-center text-sm text-slate-500">${user.createdAt ? user.createdAt.split(' ')[0] : '-'}</td>
              <!-- 最后登录时间 -->
              <td class="px-6 py-4 text-center text-sm text-slate-500">${user.lastLogin || '-'}</td>
              <!-- 操作 -->
              <td class="px-6 py-4 text-center">
                <button onclick="editUser(${user.id})" class="text-indigo-600 hover:text-indigo-800 mr-2" title="编辑资料"><i class="fas fa-edit"></i></button>
                <button onclick="resetUserPassword(${user.id})" class="text-orange-600 hover:text-orange-800 mr-2" title="重置密码"><i class="fas fa-key"></i></button>
                <button onclick="resetUserLearningData(${user.id}, '${(user.realName || user.username || '').replace(/'/g, "\\'")}')" class="text-cyan-600 hover:text-cyan-800 mr-2" title="重置学习数据"><i class="fas fa-undo-alt"></i></button>
                <button onclick="openRoleSelector(${user.id})" class="mr-2 transition-colors ${getRoleButtonClass(user.role)}" title="更改角色身份" ${isCurrentUser ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>
                  <i class="fas ${getRoleIcon(user.role)}"></i>
                </button>
                <button onclick="toggleUserStatus(${user.id})" class="${user.status === 'active' ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'} mr-2" title="${user.status === 'active' ? '禁用' : '启用'}">
                  <i class="fas fa-${user.status === 'active' ? 'ban' : 'check'}"></i>
                </button>
                <button onclick="deleteUser(${user.id})" class="text-red-600 hover:text-red-800" title="删除用户"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `;
        }).join('');
        updateUserSelectAllState();
        updateUserBatchActionBar();

      // 更新分页
      renderUserPagination(totalPages);
    }

    // 渲染分页
    function renderUserPagination(totalPages) {
      const infoEl = document.getElementById('user-pagination-info');
      const buttonsEl = document.getElementById('user-pagination-buttons');

      if (infoEl) {
        infoEl.textContent = `共 ${filteredUsers.length} 条记录`;
      }

      if (buttonsEl) {
        if (totalPages <= 1) {
          buttonsEl.innerHTML = '';
          return;
        }

        let html = '';

        // 上一页
        html += `<button onclick="changeUserPage(${userCurrentPage - 1})" class="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-sm ${userCurrentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${userCurrentPage === 1 ? 'disabled' : ''}>上一页</button>`;

        // 页码
        for (let i = 1; i <= totalPages; i++) {
          if (i === 1 || i === totalPages || (i >= userCurrentPage - 1 && i <= userCurrentPage + 1)) {
            html += `<button onclick="changeUserPage(${i})" class="px-3 py-1.5 ${i === userCurrentPage ? 'bg-indigo-600 text-white' : 'border border-slate-200 hover:bg-slate-50'} rounded-lg transition text-sm">${i}</button>`;
          } else if (i === userCurrentPage - 2 || i === userCurrentPage + 2) {
            html += `<span class="px-2 text-slate-400">...</span>`;
          }
        }

        // 下一页
        html += `<button onclick="changeUserPage(${userCurrentPage + 1})" class="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-sm ${userCurrentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${userCurrentPage === totalPages ? 'disabled' : ''}>下一页</button>`;

        buttonsEl.innerHTML = html;
      }
    }

    // 切换页码
    function changeUserPage(page) {
      const totalPages = Math.ceil(filteredUsers.length / userPageSize);
      if (page < 1 || page > totalPages) return;
      userCurrentPage = page;
      renderUserList();
    }

    // 打开添加用户弹窗
    function openUserModal() {
      const content = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-semibold text-slate-800">添加新用户</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <form onsubmit="saveNewUser(event)" class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">真实姓名</label>
                <input type="text" id="new-user-realname" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="请输入真实姓名">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">手机号 <span class="text-red-500">*</span></label>
                <input type="tel" id="new-user-phone" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="请输入手机号">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">密码 <span class="text-red-500">*</span></label>
              <input type="password" id="new-user-password" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="至少6位">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">部门</label>
                <input type="text" id="new-user-department" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="请输入所属部门">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">岗位</label>
                <input type="text" id="new-user-position" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="请输入岗位">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">角色</label>
              <select id="new-user-role" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="user">学员</option>
                <option value="teacher">讲师</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" onclick="closeModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">取消</button>
              <button type="submit" class="btn-primary px-6 py-2.5 text-white rounded-xl font-medium">添加</button>
            </div>
          </form>
        </div>
      `;
      showModal(content);
    }

    // 保存新用户
    async function saveNewUser(event) {
      event.preventDefault();

      const phone = document.getElementById('new-user-phone').value.trim();
      const userData = {
        username: phone,
        password: document.getElementById('new-user-password').value,
        realName: document.getElementById('new-user-realname').value.trim(),
        phone: phone,
        department: document.getElementById('new-user-department').value.trim(),
        position: document.getElementById('new-user-position').value.trim(),
        role: document.getElementById('new-user-role').value
      };

      if (!userData.phone || !userData.password) {
        toast('手机号和密码不能为空', 'error');
        return;
      }

      if (userData.username.length < 3 || userData.username.length > 20) {
        toast('用户名长度必须在3-20个字符之间', 'error');
        return;
      }

      if (userData.password.length < 6) {
        toast('密码长度至少6个字符', 'error');
        return;
      }

      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch(`${API}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(userData)
        });

        const result = await res.json();

        if (res.ok && result.success) {
          toast('用户添加成功');
          closeModal();
          await loadUsers();
        } else {
          toast(result.error || '添加失败', 'error');
        }
      } catch (err) {
        console.error('添加用户错误:', err);
        toast('网络错误', 'error');
      }
    }

    // 编辑用户
    async function editUser(userId) {
      const user = allUsers.find(u => u.id === userId);
      if (!user) {
        toast('用户不存在', 'error');
        return;
      }

      const content = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-semibold text-slate-800">编辑用户资料</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <form onsubmit="saveUserEdit(event, ${userId})" class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">真实姓名</label>
                <input type="text" id="edit-user-realname" value="${user.realName || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">手机号</label>
                <input type="tel" id="edit-user-phone" value="${user.phone || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">部门</label>
                <input type="text" id="edit-user-department" value="${user.department || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">岗位</label>
                <input type="text" id="edit-user-position" value="${user.position || ''}" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="请输入岗位">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">角色</label>
              <select id="edit-user-role" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>学员</option>
                <option value="teacher" ${user.role === 'teacher' ? 'selected' : ''}>讲师</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
              </select>
            </div>
            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" onclick="closeModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">取消</button>
              <button type="submit" class="btn-primary px-6 py-2.5 text-white rounded-xl font-medium">保存</button>
            </div>
          </form>
        </div>
      `;
      showModal(content);
    }

    // 保存用户编辑
    async function saveUserEdit(event, userId) {
      event.preventDefault();

      const updateData = {
        realName: document.getElementById('edit-user-realname').value.trim(),
        phone: document.getElementById('edit-user-phone').value.trim(),
        department: document.getElementById('edit-user-department').value.trim(),
        position: document.getElementById('edit-user-position').value.trim(),
        role: document.getElementById('edit-user-role').value
      };

      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch(`${API}/auth/users/${userId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updateData)
        });

        if (res.ok) {
          toast('用户资料已更新');
          closeModal();
          await loadUsers();
        } else {
          const error = await res.json();
          toast(error.error || '更新失败', 'error');
        }
      } catch (err) {
        toast('网络错误', 'error');
      }
    }

    // 重置密码
    async function resetUserPassword(userId) {
      const user = allUsers.find(u => u.id === userId);
      if (!user) {
        toast('用户不存在', 'error');
        return;
      }

      const newPassword = await showInputDialog({
        title: '重置密码',
        message: `请为用户 <strong>${user.realName || user.username}</strong> 设置新密码：`,
        placeholder: '输入新密码（至少6位）',
        type: 'password',
        validator: (value) => {
          if (!value || value.length < 6) {
            return '密码长度不能少于6位';
          }
          return undefined;
        },
        confirmText: '确认重置'
      });

      if (newPassword === null) return;

      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch(`${API}/auth/users/${userId}/reset-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ newPassword: newPassword })
        });

        if (res.ok) {
          toast('密码重置成功');
        } else {
          const error = await res.json();
          toast(error.error || '重置失败', 'error');
        }
      } catch (err) {
        toast('网络错误', 'error');
      }
    }

    // 重置用户学习数据（清空所有学习相关记录，相当于新用户）
    async function resetUserLearningData(userId, userName) {
      const user = allUsers.find(u => u.id === userId);
      if (!user) {
        toast('用户不存在', 'error');
        return;
      }

      const confirmed = await showConfirmDialog({
        title: '⚠️ 清空学习数据',
        message: `确定要清空用户 <strong>${userName || user.realName || user.username}</strong> 的所有学习数据吗？`,
        type: 'danger',
        confirmText: '确认清空',
        cancelText: '取消',
        detailText: `此操作将永久删除以下数据（不可恢复）：

• 课程学习进度与时长
• 已完成课程记录
• 考试记录
• 培训报名、签到与指派记录
• 调研答卷记录
• 证书记录
• 课程评分/点赞/分享记录
• 学习会话、视频进度与笔记
• 通知、公告访问记录
• 登录历史与统计信息
• 徽章与经验值
• 其他本地缓存数据

⚠️ 此操作不可恢复，请谨慎操作！`
      });

      if (!confirmed) return;

      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch(`${API}/auth/users/${userId}/reset-learning-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          // 同时清除该用户在当前浏览器中的本地学习缓存
          const uid = String(userId);

          // 1. 清除独立的 localStorage 用户键
          const userKeys = [
            `user_learning_${uid}`,
            `learning_data_${uid}`,
            `user_likes_${uid}`,
            `user_shares_${uid}`,
            `user_ratings_${uid}`,
            `badges_unlocked_${uid}`,
            `badge_unlock_times_${uid}`,
            `user_total_exp_v3_${uid}`
          ];
          userKeys.forEach(key => localStorage.removeItem(key));

          // 2. 清除 learning_platform_data 中该用户的所有动态键（DataAPI 缓存）
          try {
            const platformData = JSON.parse(localStorage.getItem('learning_platform_data') || '{}');
            Object.keys(platformData).forEach(key => {
              if (
                key === `user_learning_${uid}` ||
                key === `learning_data_${uid}` ||
                key === `user_likes_${uid}` ||
                key === `user_shares_${uid}` ||
                key === `user_ratings_${uid}` ||
                key === `user_total_exp_v3_${uid}` ||
                key.startsWith(`study_session_${uid}_`) ||
                key.startsWith(`video_pos_${uid}_`) ||
                key.startsWith(`note_${uid}_`) ||
                key.startsWith(`course_interaction_${uid}_`)
              ) {
                delete platformData[key];
              }
            });
            localStorage.setItem('learning_platform_data', JSON.stringify(platformData));
          } catch (e) {
            console.error('清理 learning_platform_data 失败:', e);
          }

          // 3. 兜底：遍历所有 localStorage 键，删除包含该用户 ID 的学习相关键
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (
              key.includes(`_${uid}_`) ||
              key === `user_learning_${uid}` ||
              key === `learning_data_${uid}` ||
              key === `user_likes_${uid}` ||
              key === `user_shares_${uid}` ||
              key === `user_ratings_${uid}` ||
              key === `user_total_exp_v3_${uid}` ||
              key === `badges_unlocked_${uid}` ||
              key === `badge_unlock_times_${uid}`
            ) {
              localStorage.removeItem(key);
            }
          }

          toast('用户学习数据已清空');
        } else {
          const error = await res.json();
          toast(error.error || '重置失败', 'error');
        }
      } catch (err) {
        toast('网络错误', 'error');
      }
    }

    // 切换用户状态(禁用/启用)
    async function toggleUserStatus(userId) {
      const user = allUsers.find(u => u.id === userId);
      if (!user) {
        toast('用户不存在', 'error');
        return;
      }

      const isDisabling = user.status === 'active';
      const newStatus = isDisabling ? 'disabled' : 'active';
      const actionText = isDisabling ? '禁用' : '启用';

      const confirmed = await showConfirmDialog({
        title: isDisabling ? '🚫 禁用用户账号' : '✅ 启用用户账号',
        message: `确定要${actionText}用户 <strong>${user.realName || user.username}</strong> 吗？`,
        type: isDisabling ? 'warning' : 'success',
        confirmText: `确认${actionText}`,
        cancelText: '取消'
      });
      
      if (!confirmed) return;

      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch(`${API}/auth/users/${userId}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });

        if (res.ok) {
          toast(`用户已${actionText}`);
          await loadUsers();
        } else {
          const error = await res.json();
          toast(error.error || '操作失败', 'error');
        }
      } catch (err) {
        toast('网络错误', 'error');
      }
    }

    // 删除用户
    async function deleteUser(userId, askConfirm = true) {
      const user = allUsers.find(u => u.id === userId);
      if (!user) {
        toast('用户不存在', 'error');
        return false;
      }

      if (askConfirm) {
        const confirmed = await showConfirmDialog({
          title: '🗑️ 删除用户',
          message: `确定要永久删除用户 <strong>${user.realName || user.username}</strong> 吗？`,
          type: 'danger',
          confirmText: '确认删除',
          cancelText: '取消',
          detailText: '此操作将永久删除该用户账号及其所有关联数据，已获得的证书实例也将被清理，且无法恢复！'
        });
        
        if (!confirmed) return false;
      }

      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch(`${API}/auth/users/${userId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          if (askConfirm) toast('用户已删除');
          await loadUsers();
          return true;
        } else {
          const error = await res.json();
          toast(error.error || '删除失败', 'error');
          return false;
        }
      } catch (err) {
        console.error('删除用户失败:', err);
        toast('网络错误', 'error');
        return false;
      }
    }

    // ===== 角色管理系统 =====
    
    /**
     * 获取角色的按钮样式类
     */
    function getRoleButtonClass(role) {
      const styles = {
        admin: 'text-purple-600 hover:text-purple-800 bg-purple-50 px-3 py-1.5 rounded-lg text-xs font-medium border border-purple-200',
        teacher: 'text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-200',
        user: 'text-gray-500 hover:text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200'
      };
      return styles[role] || styles.user;
    }

    /**
     * 获取角色的图标
     */
    function getRoleIcon(role) {
      const icons = {
        admin: 'fa-user-shield',
        teacher: 'fa-chalkboard-teacher',
        user: 'fa-user-graduate'
      };
      return icons[role] || icons.user;
    }

    /**
     * 获取角色显示名称
     */
    function getRoleDisplayName(role) {
      const names = {
        admin: '管理员',
        teacher: '讲师',
        user: '学员'
      };
      return names[role] || '学员';
    }

    /**
     * 打开角色选择器弹窗
     */
    async function openRoleSelector(userId) {
      const user = allUsers.find(u => u.id === userId);
      if (!user) return;

      const currentUser = safeParse('user', null) || (function(){ try { return JSON.parse(sessionStorage.getItem('user')); } catch(e) { return null; } })();
      if (currentUser.id === userId) {
        toast('不能修改自己的权限', 'error');
        return;
      }

      const roles = [
        { 
          value: 'user', 
          name: '学员', 
          icon: '🎓',
          color: 'gray',
          description: '可以登录学习平台进行课程学习、考试、培训等',
          bgColor: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
          textColor: 'text-gray-700',
          badgeColor: 'bg-gray-100 text-gray-700'
        },
        { 
          value: 'teacher', 
          name: '讲师', 
          icon: '📚',
          color: 'blue',
          description: '可查看课程信息、授课安排、满意度、课酬津贴等',
          bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
          textColor: 'text-blue-700',
          badgeColor: 'bg-blue-100 text-blue-700'
        },
        { 
          value: 'admin', 
          name: '管理员', 
          icon: '⚙️',
          color: 'purple',
          description: '拥有管理后台全部权限，可管理用户、课程、数据等',
          bgColor: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
          textColor: 'text-purple-700',
          badgeColor: 'bg-purple-100 text-purple-700'
        }
      ];

      return new Promise((resolve) => {
        const modalHTML = `
          <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg transform transition-all animate-scaleIn overflow-hidden">
              <!-- 头部 -->
              <div class="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-5 border-b border-gray-100">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-xl font-bold text-gray-900">👤 设置用户身份</h3>
                  <button onclick="closeRoleSelector()" class="text-gray-400 hover:text-gray-600 transition-colors">
                    <i class="fas fa-times text-xl"></i>
                  </button>
                </div>
                <p class="text-sm text-gray-600">为用户 <span class="font-semibold text-indigo-600">${user.realName || user.username}</span> 选择合适的角色身份</p>
              </div>

              <!-- 当前状态 -->
              <div class="px-6 py-4 bg-gray-50 border-b border-gray-100">
                <div class="flex items-center gap-3 text-sm">
                  <span class="text-gray-500">当前身份：</span>
                  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${roles.find(r => r.value === user.role)?.badgeColor || ''}">
                    <i class="fas ${getRoleIcon(user.role)}"></i>
                    ${getRoleDisplayName(user.role)}
                  </span>
                </div>
              </div>

              <!-- 角色选择卡片 -->
              <div class="p-6 space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                ${roles.map(role => `
                  <label class="block cursor-pointer group">
                    <input type="radio" name="selected-role" value="${role.value}" class="sr-only peer" ${user.role === role.value ? 'checked' : ''}>
                    <div class="flex items-start gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${role.bgColor} peer-checked:border-${role.color}-400 peer-checked:ring-2 peer-checked:ring-${role.color}-200 peer-checked:shadow-md">
                      <!-- 图标 -->
                      <div class="text-3xl flex-shrink-0 mt-0.5">${role.icon}</div>
                      
                      <!-- 内容 -->
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-semibold ${role.textColor}">${role.name}</span>
                          <span class="hidden group-hover:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${role.badgeColor}">
                            点击选择
                          </span>
                        </div>
                        <p class="text-sm text-gray-600 leading-relaxed">${role.description}</p>
                      </div>

                      <!-- 选中指示器 -->
                      <div class="flex-shrink-0 mt-1">
                        <div class="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center transition-all peer-checked:border-${role.color}-500 peer-checked:bg-${role.color}-500">
                          <i class="fas fa-check text-white text-xs opacity-0 peer-checked:opacity-100"></i>
                        </div>
                      </div>
                    </div>
                  </label>
                `).join('')}
              </div>

              <!-- 底部按钮 -->
              <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                <button onclick="closeRoleSelector()" class="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300">
                  取消
                </button>
                <button id="confirm-role-btn" class="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:from-indigo-700 hover:to-purple-700 active:scale-95 flex items-center gap-2">
                  <i class="fas fa-check-circle"></i>
                  确认更改
                </button>
              </div>
            </div>
          </div>
        `;

        const dialogContainer = document.createElement('div');
        dialogContainer.id = 'role-selector-container';
        dialogContainer.innerHTML = modalHTML;
        document.body.appendChild(dialogContainer);

        // 绑定确认按钮事件（避免特殊字符问题）
        const confirmBtn = dialogContainer.querySelector('#confirm-role-btn');
        if (confirmBtn) {
          confirmBtn.onclick = () => window.confirmRoleChange(userId, user.realName || user.username);
        }

        // 关闭函数
        window.closeRoleSelector = (result) => {
          dialogContainer.remove();
          resolve(result);
        };

        window.confirmRoleChange = async (uid, userName) => {
          const selectedRole = document.querySelector('input[name="selected-role"]:checked')?.value;
          
          if (!selectedRole) {
            toast('请先选择一个角色', 'error');
            return;
          }

          if (selectedRole === user.role) {
            closeRoleSelector(false);
            return;
          }

          const oldRoleName = getRoleDisplayName(user.role);
          const newRoleName = getRoleDisplayName(selectedRole);

          console.log(`[角色变更] 用户ID: ${uid}, 当前: ${user.role}, 目标: ${selectedRole}`);

          // 二次确认
          const confirmResult = await showConfirmDialog({
            title: selectedRole === 'admin' ? '🔐 授予管理员权限' : selectedRole === 'teacher' ? '📚 设为讲师身份' : '🎓 改为学员身份',
            message: `确定要将用户 <strong>${userName}</strong> 的身份从「${oldRoleName}」改为「${newRoleName}」吗？`,
            type: selectedRole === 'admin' ? 'warning' : 'info',
            confirmText: `确认设为${newRoleName}`,
            cancelText: '取消'
          });

          if (!confirmResult) return;

          try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            
            // 方案1：尝试使用新的set-role API（需要重启服务器）
            console.log('[角色变更] 尝试调用 set-role API...');
            let res = await fetch(`${API}/auth/users/${userId}/set-role`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ role: selectedRole })
            });

            if (res.ok) {
              const result = await res.json();
              console.log('[角色变更] 成功:', result);
              toast(result.message || `✅ 已将用户身份更改为：${newRoleName}`, 'success');
              closeRoleSelector(true);
              await loadUsers();
              return;
            } 

            const error = await res.json();
            console.log('[角色变更] set-role 失败:', error);

            // 方案2：如果set-role不可用(404)，降级使用toggle-role + 直接修改数据
            if (res.status === 404 || error.error?.includes('not found')) {
              console.log('[角色变更] 降级使用兼容模式...');
              
              // 先通过toggle-role切换到中间状态
              if (selectedRole !== user.role) {
                const toggleRes = await fetch(`${API}/auth/users/${userId}/toggle-role`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (toggleRes.ok) {
                  const toggleResult = await toggleRes.json();
                  console.log('[角色变更] toggle成功:', toggleResult);
                  
                  // 如果目标就是admin或user，直接用toggle就够了
                  if ((selectedRole === 'admin' && user.role !== 'admin') || 
                      (selectedRole === 'user' && user.role === 'admin')) {
                    toast(`✅ 已将用户设为「${newRoleName}」`, 'success');
                    closeRoleSelector(true);
                    await loadUsers();
                    return;
                  }
                }
              }
              
              // 对于teacher角色，提示需要手动在编辑中设置
              if (selectedRole === 'teacher') {
                const manualConfirm = await showConfirmDialog({
                  title: '⚠️ 需要手动完成',
                  message: '将用户设为讲师需要更多配置信息。',
                  type: 'info',
                  detailText: `请按以下步骤操作：
1. 点击"取消"关闭此窗口
2. 在用户列表找到该用户，点击"编辑"按钮
3. 在弹出的编辑窗口中将"角色"改为"讲师"
4. 点击"保存"即可

或者您可以先重启服务器以启用完整的三角色管理功能。`,
                  confirmText: '我知道了',
                  cancelText: ''
                });
                
                closeRoleSelector(null);
                return;
              }
              
              toast(`⚠️ 身份已部分调整，建议刷新页面查看最新状态`);
              closeRoleSelector(true);
              await loadUsers();
              return;
            }

            // 其他错误
            console.error('[角色变更] 错误详情:', error);
            toast(error.error || '操作失败', 'error');
            
          } catch (err) {
            console.error('[角色变更] 异常:', err);
            toast('网络连接失败，请检查网络或联系管理员', 'error');
          }
        };

        // ESC关闭
        const escHandler = (e) => {
          if (e.key === 'Escape') {
            document.removeEventListener('keydown', escHandler);
            closeRoleSelector(null);
          }
        };
        document.addEventListener('keydown', escHandler);

        // 点击背景关闭
        dialogContainer.querySelector('.fixed').addEventListener('click', (e) => {
          if (e.target.classList.contains('fixed')) {
            closeRoleSelector(null);
          }
        });
      });
    }

    // 保持向后兼容的toggleUserRole函数（供其他地方调用）
    async function toggleUserRole(userId) {
      return openRoleSelector(userId);
    }

    // 搜索和筛选事件绑定
    let userFiltersInitialized = false;
    function initUserFilters() {
      if (userFiltersInitialized) return;
      userFiltersInitialized = true;
      const searchInput = document.getElementById('user-search-input');
      const roleFilter = document.getElementById('user-role-filter');
      const statusFilter = document.getElementById('user-status-filter');

      if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(() => {
            filterAndRenderUsers();
          }, 300);
        });
      }

      if (roleFilter) {
        roleFilter.addEventListener('change', filterAndRenderUsers);
      }

      if (statusFilter) {
        statusFilter.addEventListener('change', filterAndRenderUsers);
      }
    }

    // ========== 培训课程管理 ==========
    let currentManageProjectId = null;

    async function manageCourses(projectId) {
      currentManageProjectId = projectId;
      const project = data.training.find(t => t.id === projectId);
      if (!project) {
        toast('培训项目不存在', 'error');
        return;
      }

      // 直接使用本地数据
      renderCourseManagement(project);
    }

    function renderCourseManagement(project) {
      const courses = project.courses || [];

      let content = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <h3 class="text-lg font-semibold text-slate-800">${project.name} - 课程管理</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="flex-1 overflow-y-auto p-6">
            <div class="flex items-center justify-between mb-4">
              <span class="text-sm text-slate-500">共 ${courses.length} 门课程</span>
              <button onclick="openAddCourseModal()" class="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition text-sm">
                <i class="fas fa-plus mr-1"></i>添加课程
              </button>
            </div>
      `;

      if (courses.length === 0) {
        content += `
          <div class="text-center py-12 text-slate-400">
            <i class="fas fa-inbox text-4xl mb-4 block"></i>
            <p>暂无课程</p>
            <button onclick="openAddCourseModal()" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">添加第一个课程</button>
          </div>
        `;
      } else {
        content += '<div class="space-y-3">';
        courses.forEach((course, idx) => {
          content += `
            <div class="flex items-start gap-4 p-4 bg-slate-50 rounded-xl">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                ${idx + 1}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <h4 class="font-medium text-slate-800">${course.name}</h4>
                    <p class="text-sm text-slate-500 mt-0.5">
                      <i class="fas fa-user mr-1"></i>${course.instructor || '待定'}
                      <span class="mx-2">|</span>
                      <i class="fas fa-calendar mr-1"></i>${course.date || '待定'}
                      ${course.time ? `<span class="mx-2">|</span><i class="fas fa-clock mr-1"></i>${course.time}` : ''}
                    </p>
                    ${course.location ? `<p class="text-xs text-slate-400 mt-1"><i class="fas fa-map-marker-alt mr-1"></i>${course.location}</p>` : ''}
                  </div>
                  <div class="flex items-center gap-2">
                    <button onclick="deleteTrainingCourse(${course.id})" class="text-red-500 hover:bg-red-50 p-1.5 rounded" title="删除">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        });
        content += '</div>';
      }

      content += `
          </div>
        </div>
      `;

      showModal(content);
    }

    function openAddCourseModal() {
      const content = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-semibold text-slate-800">添加课程</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <form onsubmit="saveTrainingCourse(event)" class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">课程名称 <span class="text-red-500">*</span></label>
              <input type="text" id="course-name" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">讲师</label>
                <input type="text" id="course-instructor" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">分类</label>
                <select id="course-category" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="新雁计划">新雁计划</option>
                  <option value="游雁学堂">游雁学堂</option>
                  <option value="鸿雁计划">鸿雁计划</option>
                  <option value="AI实践分享">AI实践分享</option>
                  <option value="雏雁训练营">雏雁训练营</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">日期 <span class="text-red-500">*</span></label>
                <input type="date" id="course-date" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">时间</label>
                <input type="text" id="course-time" placeholder="例:09:00-11:30" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">时长</label>
                <input type="text" id="course-duration" placeholder="例:2.5小时" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">地点</label>
                <input type="text" id="course-location" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" onclick="closeModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">取消</button>
              <button type="submit" class="btn-primary px-6 py-2.5 text-white rounded-xl font-medium">添加</button>
            </div>
          </form>
        </div>
      `;
      showModal(content);
    }

    async function saveTrainingCourse(event) {
      event.preventDefault();

      const courseData = {
        name: document.getElementById('course-name').value.trim(),
        instructor: document.getElementById('course-instructor').value.trim(),
        category: document.getElementById('course-category').value,
        date: document.getElementById('course-date').value,
        time: document.getElementById('course-time').value.trim(),
        duration: document.getElementById('course-duration').value.trim(),
        location: document.getElementById('course-location').value.trim()
      };

      try {
        const res = await fetch(API + '/training/' + currentManageProjectId + '/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(courseData)
        });

        if (res.ok) {
          toast('课程已添加');
          closeModal();
          await loadAllData();
          renderTraining();
          // 重新打开课程管理
          manageCourses(currentManageProjectId);
        } else {
          toast('添加失败', 'error');
        }
      } catch (err) {
        toast('添加失败', 'error');
      }
    }

    async function deleteTrainingCourse(courseId) {
      if (!confirm('确定要删除这门课程吗?')) return;

      try {
        const res = await fetch(API + '/training/courses/' + courseId, { method: 'DELETE' });
        if (res.ok) {
          toast('课程已删除');
          await loadAllData();
          renderTraining();
          // 重新打开课程管理
          manageCourses(currentManageProjectId);
        } else {
          toast('删除失败', 'error');
        }
      } catch (err) {
        toast('删除失败', 'error');
      }
    }

    // ========== 公告管理 ==========
    function renderNotices() {
      const tbody = document.getElementById('notice-list');
      if (!tbody) return;

      if (data.notices.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-12 text-center text-slate-400">
              <i class="fas fa-bullhorn text-4xl mb-3 block"></i>
              <p>暂无公告</p>
              <button onclick="openNoticeModal()" class="mt-4 btn-primary px-6 py-2.5 text-white rounded-xl font-medium">发布公告</button>
            </td>
          </tr>`;
        return;
      }

      // 按置顶和发布时间排序
      const sortedNotices = [...data.notices].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt);
      });

      tbody.innerHTML = sortedNotices.map(n => `
        <tr class="hover:bg-slate-50 transition">
          <!-- 封面图 -->
          <td class="px-6 py-4">
            ${n.cover ? `
              <div class="w-24 h-16 rounded-lg overflow-hidden bg-slate-100">
                <img src="${n.cover}" class="w-full h-full object-cover">
              </div>
            ` : '<span class="text-slate-400 text-sm">无封面</span>'}
          </td>

          <!-- 标题 -->
          <td class="px-6 py-4">
            <div class="text-sm font-medium text-slate-800">${n.title}</div>
            <div class="text-xs text-slate-400 mt-1 line-clamp-1">
              ${n.content ? n.content.replace(/<[^>]+>/g, '').substring(0, 80) + '...' : '无内容'}
            </div>
          </td>

          <!-- 发布时间 -->
          <td class="px-6 py-4 text-sm text-slate-600">
            ${n.publishedAt || n.createdAt || '-'}
          </td>

          <!-- 访问量 -->
          <td class="px-6 py-4 text-sm">
            <button onclick="showNoticeVisits(${n.id}, decodeURIComponent('${encodeURIComponent(n.title || '公告')}'))" class="text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer" title="点击查看访问详情">
              ${n.visitCount || 0} 人
            </button>
          </td>

          <!-- 操作 -->
          <td class="px-6 py-4">
            <button onclick="togglePinNotice(${n.id})" class="px-3 py-1.5 rounded-lg text-xs font-medium transition mr-2 ${n.pinned ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}" title="${n.pinned ? '取消置顶' : '设为置顶'}">
              <i class="fas fa-thumbtack mr-1"></i>${n.pinned ? '已置顶' : '置顶'}
            </button>
            <button onclick="viewNotice(${n.id})" class="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs hover:bg-indigo-100 transition mr-2">
              <i class="fas fa-eye mr-1"></i>查看
            </button>
            <button onclick="editNotice(${n.id})" class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs hover:bg-blue-100 transition mr-2">
              <i class="fas fa-edit mr-1"></i>编辑
            </button>
            <button onclick="deleteNotice(${n.id})" class="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100 transition">
              <i class="fas fa-trash mr-1"></i>删除
            </button>
          </td>
        </tr>
      `).join('');

      // 同步更新站点管理子标签的公告列表
      renderPortalNotices();
    }

    // renderPortalNotices - 站点管理子标签用(精简表格风格)
    function renderPortalNotices() {
      const tbody = document.getElementById('portal-notice-list');
      if (!tbody) return;

      if (!data.notices || data.notices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-bullhorn text-2xl mb-2 block"></i><p>暂无公告</p></td></tr>`;
        return;
      }

      // 按置顶和发布时间排序
      const sorted = [...data.notices].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt);
      });

      tbody.innerHTML = sorted.map(n => {
        const checked = noticeSelectedIds.has(String(n.id)) ? 'checked' : '';
        return `
        <tr class="hover:bg-slate-50 transition">
          <td class="pl-5 pr-2 py-4 text-center" onclick="event.stopPropagation()">
            <input type="checkbox" class="notice-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleNoticeSelect('${n.id}')" ${checked}>
          </td>
          <td class="px-6 py-4">
            <div class="text-sm font-medium text-slate-800">${n.title}</div>
          </td>
          <td class="px-6 py-4 text-sm text-slate-600">
            ${n.publishedAt || n.createdAt || '-'}
          </td>
          <td class="px-6 py-4 text-sm">
            <button onclick="showNoticeVisits(${n.id}, decodeURIComponent('${encodeURIComponent(n.title || '公告')}'))" class="text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer" title="点击查看访问详情">
              ${n.visitCount || 0} 人
            </button>
          </td>
          <td class="px-6 py-4">
            <button onclick="togglePinNotice(${n.id})" class="px-2.5 py-1 rounded text-xs font-medium transition mr-1 ${n.pinned ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}" title="${n.pinned ? '取消置顶' : '设为置顶'}">
              <i class="fas fa-thumbtack"></i>
            </button>
            <button onclick="viewNotice(${n.id})" class="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded text-xs hover:bg-indigo-100 mr-1" title="查看">
              <i class="fas fa-eye"></i>
            </button>
            <button onclick="editNotice(${n.id})" class="px-2.5 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100 mr-1" title="编辑">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteNotice(${n.id})" class="px-2.5 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100" title="删除">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>`;
      }).join('');
    }

    function openNoticeModal(notice = null) {
      const isEdit = !!notice;
      const content = notice?.content || '';

      // 重置本次会话的上传追踪，并捕获编辑前的原始图片集合（用于保存时清理被删的孤儿文件）
      pendingNoticeImages = [];
      originalNoticeImages = extractImageUrls(content);

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          <!-- 头部 - 固定 -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <h3 class="text-lg font-semibold text-slate-800">${isEdit ? '编辑' : '发布'}公告</h3>
            <button onclick="closeNoticeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>

          <!-- 表单内容 - 可滚动 -->
          <form id="notice-form" onsubmit="saveNotice(event, ${notice?.id ?? 'null'})" class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- 标题 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">标题 <span class="text-red-500">*</span></label>
              <input type="text" id="n-title" value="${notice?.title || ''}" required class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="请输入公告标题">
            </div>

            <!-- 富文本编辑器 -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">内容 <span class="text-red-500">*</span></label>
              <div class="border border-slate-200 rounded-xl overflow-hidden" style="height: 400px; display: flex; flex-direction: column;">
                <div id="n-editor" class="bg-white flex-1" style="overflow-y: auto;"></div>
              </div>
              <input type="hidden" id="n-content" value="${content.replace(/"/g, '&quot;')}">
              <p class="text-xs text-slate-400 mt-1">支持文字、图片、标题、列表等格式(编辑器固定高度400px,内容过多时可滚动)</p>
            </div>
          </form>

          <!-- 底部按钮 - 固定 -->
          <div class="px-6 py-4 border-t border-slate-100 flex justify-end space-x-3 flex-shrink-0 bg-white">
            <button type="button" onclick="closeNoticeModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition">取消</button>
            <button type="button" onclick="document.getElementById('notice-form').requestSubmit()" class="btn-primary px-6 py-2.5 text-white rounded-xl font-medium shadow-lg transition">
              <i class="fas fa-paper-plane mr-2"></i>${notice?.status === 'draft' ? '发布' : (isEdit ? '保存' : '发布')}
            </button>
          </div>
        </div>
      `);

      // 初始化 Quill 编辑器
      setTimeout(() => {
        const quill = new Quill('#n-editor', {
          theme: 'snow',
          placeholder: '请输入公告内容...',
          modules: {
            toolbar: {
              container: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'font': [] }],
                [{ 'size': ['small', false, 'large', 'huge'] }],
                [{ 'align': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['blockquote', 'code-block'],
                ['link', 'image', 'video'],
                ['clean']
              ],
              handlers: {
                image: function() {
                  const input = document.createElement('input');
                  input.setAttribute('type', 'file');
                  input.setAttribute('accept', 'image/*');
                  input.classList.add('hidden');
                  input.onchange = async function() {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      toast('图片不能超过 5MB', 'warning');
                      return;
                    }
                    const formData = new FormData();
                    formData.append('file', file);
                    try {
                      const res = await fetch(API + '/upload?type=images', {
                        method: 'POST',
                        body: formData
                      });
                      const result = await res.json();
                      if (result.success && result.url) {
                        const range = quill.getSelection(true) || { index: quill.getLength() };
                        quill.insertEmbed(range.index, 'image', result.url);
                        quill.setSelection(range.index + 1);
                        pendingNoticeImages.push(result.url);
                      } else {
                        toast(result.error || '图片上传失败', 'error');
                      }
                    } catch (err) {
                      toast('图片上传失败', 'error');
                    }
                  };
                  input.click();
                }
              }
            }
          }
        });

        // 设置初始内容
        if (content) {
          quill.clipboard.dangerouslyPasteHTML(content);
        }

        // 监听内容变化,同步到隐藏字段
        quill.on('text-change', () => {
          const html = quill.root.innerHTML;
          document.getElementById('n-content').value = html;
        });

        // 将 quill 实例保存到全局变量
        window.noticeQuill = quill;
      }, 100);
    }

    async function saveNotice(e, id) {
      e.preventDefault();

      // 从 Quill 编辑器获取内容
      const content = document.getElementById('n-content').value;
      if (!content || content === '<p><br></p>') {
        toast('请输入公告内容', 'error');
        return;
      }

      const formData = {
        title: document.getElementById('n-title').value.trim(),
        content: content,
        status: 'published',  // 公告发布后直接为已发布状态
        pinned: 0,  // 默认不置顶，通过操作栏的置顶按钮控制
        publishedAt: new Date().toISOString().split('T')[0]
      };

      console.log('[Dashboard] 保存公告数据:', formData);

      try {
        let res;
        // id 为 null、undefined 或字符串 'null' 时走新建
        if (id && id !== 'null') {
          res = await fetch(API + '/notices/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        } else {
          res = await fetch(API + '/notices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        }
        if (res.ok) {
          // 以正文最终引用为准，清理两类孤儿图片：
          // 1) 本次会话上传但正文已删除的临时图
          // 2) 编辑前已存在、本次被删除的旧图（避免磁盘残留）
          const norm = (u) => { try { return new URL(u, location.origin).pathname; } catch (e) { return u; } };
          const finalImages = extractImageUrls(content); // 已归一化为 pathname
          const orphaned = [
            ...pendingNoticeImages.map(norm).filter(u => !finalImages.includes(u)),
            ...originalNoticeImages.map(norm).filter(u => !finalImages.includes(u))
          ];
          await Promise.all([...new Set(orphaned)].map(u => deleteUploadFileByUrl(u)));
          pendingNoticeImages = [];
          originalNoticeImages = [];
          toast(id ? '公告已更新' : '公告已发布');
          closeModal();
          await loadAllData();
          renderNotices();
          // 广播通知首页刷新
          if (window.DataSync) window.DataSync.broadcast('notices');
          console.log('[Dashboard] 已广播公告更新事件');
        } else {
          const errorData = await res.json();
          toast('操作失败: ' + (errorData.error || '未知错误'), 'error');
          console.error('[Dashboard] 保存公告失败:', errorData);
        }
      } catch (err) {
        toast('操作失败', 'error');
        console.error('[Dashboard] 保存公告异常:', err);
      }
    }

    function closeNoticeModal() {
      pendingNoticeImages.forEach(url => deleteUploadFileByUrl(url));
      pendingNoticeImages = [];
      originalNoticeImages = [];
      closeModal();
    }

    async function viewNotice(id) {
      const n = data.notices.find(x => x.id === id);
      if (!n) return;

      // 记录访问
      try {
        const currentUser = safeParse('user', null) || (function(){ try { return JSON.parse(sessionStorage.getItem('user')); } catch(e) { return null; } })() || {};
        await fetch(API + '/notices/' + id + '/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id || currentUser.username || 'admin',
            username: currentUser.displayName || currentUser.username || '管理员'
          })
        });
      } catch (e) {
        console.warn('[Dashboard] 记录访问失败:', e.message);
      }

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          <!-- 头部 - 固定 -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <h3 class="text-lg font-semibold text-slate-800">${n.title}</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>

          <!-- 内容区 - 可滚动 -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- 封面图 -->
            ${n.cover ? `
              <div class="mb-6 rounded-xl overflow-hidden">
                <img src="${n.cover}" class="w-full h-64 object-cover">
              </div>
            ` : ''}

            <!-- 元信息 -->
            <div class="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
              ${n.pinned ? '<span class="px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm font-medium"><i class="fas fa-thumbtack mr-1"></i>置顶</span>' : ''}
              <span class="text-sm text-slate-400">
                <i class="far fa-clock mr-1"></i>${n.publishedAt || n.createdAt}
              </span>
            </div>

            <!-- 内容 -->
            <div class="prose max-w-none">
              <div class="text-slate-700 leading-relaxed">
                ${n.content || '<p class="text-slate-400">暂无内容</p>'}
              </div>
            </div>
          </div>

          <!-- 底部按钮 - 固定 -->
          <div class="px-6 py-4 border-t border-slate-100 flex justify-end flex-shrink-0">
            <button onclick="closeModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition">关闭</button>
          </div>
        </div>
      `);
    }

    function editNotice(id) {
      const n = data.notices.find(x => x.id === id);
      if (n) openNoticeModal(n);
    }

    async function deleteNotice(id) {
      if (!confirm('确定删除这条公告吗？正文中上传的图片及访问记录将一并清理。')) return;
      try {
        const res = await fetch(API + '/notices/' + id, { method: 'DELETE' });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success !== false) {
          toast('公告已删除');
          await loadAllData();
          renderNotices();
          if (window.DataSync) window.DataSync.broadcast('notices');
        } else {
          toast(result.error || '删除失败', 'error');
        }
      } catch (err) {
        toast('删除失败', 'error');
      }
    }

    // 切换公告置顶状态（互斥置顶：同时只能有一条公告置顶）
    async function togglePinNotice(id) {
      // 确保 id 为数字类型
      const numId = parseInt(id);
      const notice = data.notices.find(n => n.id === numId);
      if (!notice) {
        console.error('[Dashboard] 找不到公告 id:', numId);
        return;
      }

      // 如果要取消置顶，直接设为0
      // 如果要设为置顶，需要先将其他公告的pinned设为0，再将当前公告设为1
      const newPinned = notice.pinned ? 0 : 1;
      const actionText = newPinned ? '置顶' : '取消置顶';

      try {
        // 如果设为置顶，先取消其他公告的置顶（确保互斥）
        if (newPinned === 1) {
          const unpinRes = await fetch(API + '/notices/unpin-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (!unpinRes.ok) {
            const errText = await unpinRes.text();
            toast('取消其他公告置顶失败: ' + errText, 'error');
            console.error('[Dashboard] unpin-all 失败:', errText);
            return;
          }
        }

        // 设置当前公告的置顶状态
        const res = await fetch(API + '/notices/' + numId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: newPinned })
        });
        if (res.ok) {
          toast(`公告已${actionText}`);
          await loadAllData();
          renderNotices();
          if (window.DataSync) window.DataSync.broadcast('notices');
        } else {
          const errText = await res.text();
          toast('操作失败: ' + errText, 'error');
          console.error('[Dashboard] PUT notices 失败:', errText);
        }
      } catch (err) {
        toast('操作失败', 'error');
        console.error('[Dashboard] 切换置顶状态异常:', err);
      }
    }

    // 显示公告访问详情弹窗
    async function showNoticeVisits(noticeId, noticeTitle) {
      // 安全转义标题中的 HTML 特殊字符
      const safeTitle = String(noticeTitle || '公告').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
          <!-- 头部 -->
          <div class="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <i class="fas fa-chart-bar text-white"></i>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-white">访问详情</h3>
                <p class="text-xs text-white/80">${safeTitle}</p>
              </div>
            </div>
            <button onclick="closeModal()" class="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <!-- 内容 -->
          <div id="visit-detail-body" class="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div class="flex items-center justify-center py-12 text-slate-400">
              <i class="fas fa-spinner fa-spin text-2xl mr-3"></i>
              <span>加载访问记录...</span>
            </div>
          </div>

          <!-- 底部 -->
          <div class="px-6 py-4 border-t border-slate-100 flex justify-end flex-shrink-0 bg-white">
            <button onclick="closeModal()" class="px-6 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm font-medium text-slate-600">关闭</button>
          </div>
        </div>
      `);

      // 等待一帧确保 DOM 渲染完成
      await new Promise(r => requestAnimationFrame(r));

      try {
        console.log('[Dashboard] 获取访问详情:', API + '/notices/' + noticeId + '/visits');
        const res = await fetch(API + '/notices/' + noticeId + '/visits');
        if (!res.ok) {
          const errText = await res.text();
          console.error('[Dashboard] 请求失败:', res.status, errText);
          throw new Error(res.status + ' ' + errText);
        }
        const respData = await res.json();
        const visits = respData.visits || [];
        const totalCount = respData.totalCount || visits.length;
        const body = document.getElementById('visit-detail-body');
        if (!body) {
          console.error('[Dashboard] visit-detail-body 未找到');
          return;
        }

        if (visits.length === 0) {
          body.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-slate-400">
              <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <i class="fas fa-user-slash text-2xl text-slate-300"></i>
              </div>
              <p class="text-sm">暂无访问记录</p>
            </div>
          `;
          return;
        }

        body.innerHTML = `
          <!-- 统计卡片 -->
          <div class="grid grid-cols-2 gap-4 mb-5">
            <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <div class="text-xs text-slate-400 mb-1">访问人数</div>
              <div class="text-2xl font-bold text-indigo-600">${totalCount}<span class="text-sm font-normal text-slate-500 ml-1">人</span></div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <div class="text-xs text-slate-400 mb-1">总访问次数</div>
              <div class="text-2xl font-bold text-purple-600">${visits.reduce((sum, v) => sum + (v.visitCount || 1), 0)}<span class="text-sm font-normal text-slate-500 ml-1">次</span></div>
            </div>
          </div>

          <!-- 访问列表表格 -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <h4 class="text-sm font-semibold text-slate-700">访问明细</h4>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="bg-slate-50">
                    <th class="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">姓名</th>
                    <th class="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">部门</th>
                    <th class="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">岗位</th>
                    <th class="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">首次访问时间</th>
                    <th class="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">访问次数</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${visits.map(v => `
                    <tr class="hover:bg-slate-50 transition">
                      <td class="px-5 py-3.5 text-sm font-medium text-slate-700">
                        <div class="flex items-center gap-2">
                          <div class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                            ${(v.name || '未').charAt(0)}
                          </div>
                          ${escHtml(v.name || '未知用户')}
                        </div>
                      </td>
                      <td class="px-5 py-3.5 text-sm text-slate-600">${escHtml(v.department || '—')}</td>
                      <td class="px-5 py-3.5 text-sm text-slate-600">${escHtml(v.position || '—')}</td>
                      <td class="px-5 py-3.5 text-sm text-slate-600">
                        <div class="flex items-center gap-1.5">
                          <i class="far fa-clock text-slate-400 text-xs"></i>
                          ${v.firstVisitAt ? new Date(v.firstVisitAt).toLocaleString('zh-CN') : '—'}
                        </div>
                      </td>
                      <td class="px-5 py-3.5 text-sm text-center">
                        <span class="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold text-xs">
                          ${v.visitCount || 1}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      } catch (err) {
        console.error('[Dashboard] 获取访问详情失败:', err);
        const body = document.getElementById('visit-detail-body');
        if (body) {
          body.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-red-400">
              <div class="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <i class="fas fa-exclamation-triangle text-2xl text-red-400"></i>
              </div>
              <p class="text-sm">加载失败: ${err.message}</p>
            </div>
          `;
        }
      }
    }

    // ========== 模态框工具 ==========
    function showModal(content) {
      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick="handleModalClick(event)">
          ${content}
        </div>`;
      container.classList.remove('hidden');
    }

    // ===== 专业确认对话框系统 =====
    
    /**
     * 显示确认对话框
     * @param {Object} options
     * @param {string} options.title - 标题
     * @param {string} options.message - 消息内容
     * @param {string} options.type - 类型: 'danger'(危险/红色) | 'warning'(警告/橙色) | 'info'(信息/蓝色) | 'success'(成功/绿色)
     * @param {string} options.confirmText - 确认按钮文字 (默认: "确定")
     * @param {string} options.cancelText - 取消按钮文字 (默认: "取消")
     * @param {string} options.detailText - 详细说明文字 (可选，显示在消息下方)
     * @returns {Promise<boolean>}
     */
    function showConfirmDialog({ title, message, type = 'info', confirmText = '确定', cancelText = '取消', detailText = '' }) {
      return new Promise((resolve) => {
        const icons = {
          danger: '<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>',
          warning: '<svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>',
          info: '<svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
          success: '<svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
        };
        
        const buttonStyles = {
          danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
          warning: 'bg-orange-500 hover:bg-orange-600 focus:ring-orange-400',
          info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
          success: 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
        };

        const bgColors = {
          danger: 'bg-red-50',
          warning: 'bg-orange-50',
          info: 'bg-blue-50',
          success: 'bg-green-50'
        };

        const modalHTML = `
          <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all animate-scaleIn overflow-hidden">
              <!-- 头部区域 -->
              <div class="${bgColors[type]} px-6 py-5 flex items-start gap-4">
                <div class="flex-shrink-0 mt-1">
                  ${icons[type]}
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="text-lg font-semibold text-gray-900 mb-1">${title}</h3>
                  <p class="text-sm text-gray-700 leading-relaxed">${message}</p>
                </div>
              </div>
              
              ${detailText ? `
              <!-- 详细信息区域 -->
              <div class="px-6 py-4 bg-gray-50 border-t border-gray-100">
                <div class="bg-white rounded-lg border border-gray-200 p-4 max-h-48 overflow-y-auto">
                  <p class="text-xs text-gray-600 leading-relaxed whitespace-pre-line">${detailText}</p>
                </div>
              </div>
              ` : ''}
              
              <!-- 按钮区域 -->
              <div class="px-6 py-4 bg-white border-t border-gray-100 flex justify-end gap-3">
                <button onclick="closeCustomDialog(false)" class="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300">
                  ${cancelText}
                </button>
                <button onclick="closeCustomDialog(true)" class="px-5 py-2.5 rounded-lg text-white font-medium shadow-sm transition-all focus:outline-none focus:ring-2 ${buttonStyles[type]} hover:shadow-md active:scale-95">
                  ${confirmText}
                </button>
              </div>
            </div>
          </div>
        `;

        // 创建临时容器
        const dialogContainer = document.createElement('div');
        dialogContainer.id = 'custom-dialog-container';
        dialogContainer.innerHTML = modalHTML;
        document.body.appendChild(dialogContainer);

        // 关闭函数
        window.closeCustomDialog = (result) => {
          dialogContainer.remove();
          resolve(result);
        };
        
        // 点击背景关闭（只响应取消）
        dialogContainer.querySelector('.fixed').addEventListener('click', (e) => {
          if (e.target.classList.contains('fixed')) {
            closeCustomDialog(false);
          }
        });
        
        // ESC键关闭
        const escHandler = (e) => {
          if (e.key === 'Escape') {
            document.removeEventListener('keydown', escHandler);
            closeCustomDialog(false);
          }
        };
        document.addEventListener('keydown', escHandler);
      });
    }

    /**
     * 显示输入对话框
     * @param {Object} options
     * @param {string} options.title - 标题
     * @param {string} options.message - 消息提示
     * @param {string} options.placeholder - 输入框占位符
     * @param {string} options.type - 类型: 'password' | 'text' | 'number' 等
     * @param {Function} options.validator - 验证函数 (value => string|undefined)
     * @param {string} options.confirmText - 确认按钮文字
     * @param {string} options.cancelText - 取消按钮文字
     * @returns {Promise<string|null>} 返回输入的值或null(取消)
     */
    async function showInputDialog({ title, message, placeholder, type = 'text', validator, confirmText = '确定', cancelText = '取消' }) {
      return new Promise((resolve) => {
        const modalHTML = `
          <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all animate-scaleIn overflow-hidden">
              <!-- 头部区域 -->
              <div class="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-5 flex items-start gap-4">
                <div class="flex-shrink-0 mt-1">
                  <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="text-lg font-semibold text-gray-900 mb-1">${title}</h3>
                  <p class="text-sm text-gray-700 leading-relaxed">${message}</p>
                </div>
              </div>
              
              <!-- 输入区域 -->
              <div class="px-6 py-5">
                <div class="relative">
                  <input 
                    type="${type}" 
                    id="dialog-input-field"
                    placeholder="${placeholder}"
                    class="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all outline-none text-base"
                    autofocus
                  >
                  <div id="dialog-input-error" class="mt-2 text-sm text-red-600 hidden"></div>
                </div>
              </div>
              
              <!-- 按钮区域 -->
              <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                <button id="dialog-cancel-btn" class="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300">
                  ${cancelText}
                </button>
                <button id="dialog-confirm-btn" class="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium shadow-sm hover:bg-indigo-700 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:shadow-md active:scale-95">
                  ${confirmText}
                </button>
              </div>
            </div>
          </div>
        `;

        // 创建容器
        const dialogContainer = document.createElement('div');
        dialogContainer.id = 'custom-dialog-container';
        dialogContainer.innerHTML = modalHTML;
        document.body.appendChild(dialogContainer);

        const inputField = dialogContainer.querySelector('#dialog-input-field');
        const errorDiv = dialogContainer.querySelector('#dialog-input-error');
        
        // 关闭函数
        window.closeInputDialog = (result) => {
          dialogContainer.remove();
          resolve(result);
        };

        // 取消按钮
        dialogContainer.querySelector('#dialog-cancel-btn').onclick = () => closeInputDialog(null);
        
        // 确认按钮
        dialogContainer.querySelector('#dialog-confirm-btn').onclick = () => {
          const value = inputField.value.trim();
          
          if (validator) {
            const errorMsg = validator(value);
            if (errorMsg) {
              errorDiv.textContent = errorMsg;
              errorDiv.classList.remove('hidden');
              inputField.classList.add('border-red-500');
              inputField.focus();
              return;
            }
          }
          
          if (!value && type !== 'number') {
            // 如果是必填项且为空
            if (!placeholder.includes('(可选)')) {
              errorDiv.textContent = '此字段不能为空';
              errorDiv.classList.remove('hidden');
              inputField.classList.add('border-red-500');
              inputField.focus();
              return;
            }
          }
          
          closeInputDialog(value);
        };

        // 回车提交
        inputField.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            dialogContainer.querySelector('#dialog-confirm-btn').click();
          } else {
            // 清除错误状态
            errorDiv.classList.add('hidden');
            inputField.classList.remove('border-red-500');
          }
        };

        // 聚焦输入框
        setTimeout(() => inputField.focus(), 100);

        // 点击背景关闭
        dialogContainer.querySelector('.fixed').addEventListener('click', (e) => {
          if (e.target.classList.contains('fixed')) {
            closeInputDialog(null);
          }
        });

        // ESC关闭
        const escHandler = (e) => {
          if (e.key === 'Escape') {
            document.removeEventListener('keydown', escHandler);
            closeInputDialog(null);
          }
        };
        document.addEventListener('keydown', escHandler);
      });
    }

    // 动画样式注入
    if (!document.getElementById('custom-dialog-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'custom-dialog-styles';
      styleSheet.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
      `;
      document.head.appendChild(styleSheet);
    }

    function handleModalClick(e) {
      if (!e.target.classList.contains('fixed')) return;
      // 若当前弹窗有对应的清理函数，优先走清理逻辑，避免临时文件残留
      if (currentModalType === 'course') {
        closeCourseModal();
      } else if (currentModalType === 'lecturer') {
        closeLecturerModal();
      } else if (currentModalType === 'training') {
        closeTrainingModal();
      } else if (currentModalType === 'notice') {
        closeNoticeModal();
      } else {
        closeModal();
      }
    }

    function closeModal() {
      const container = document.getElementById('modal-container');
      container.innerHTML = '';
      container.classList.add('hidden');
      // 关闭所有项目内容模块抽屉
      ['attendance', 'survey', 'courseware'].forEach(m => closeModuleDrawer(m));
      // 关闭考试创建抽屉（如果从培训模块打开）
      if (examModalFromTraining) closeExamModal();
    }

    // ===== 批量选择状态 =====
    let courseSelectedIds = new Set();
    let lecturerSelectedIds = new Set();
    let trainingSelectedIds = new Set();
    let surveySelectedIds = new Set();
    let bankSelectedIds = new Set();
    // 运营管理面板 - 多选
    let bannerSelectedIds = new Set();
    let noticeSelectedIds = new Set();
    let applicationSelectedIds = new Set();
    let trainingReqSelectedIds = new Set();
    let certSelectedIds = new Set();
    let userSelectedIds = new Set();

    // 通用批量分类选择弹窗
    function showBatchCategoryPicker(moduleName, onConfirm, categories = null) {
      const cats = categories || data.categories || [];
      const options = cats.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
      showModal(`
        <div class="modal bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-semibold text-slate-800">调整分类</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-6">
            <label class="block text-sm font-medium text-slate-700 mb-2">选择新分类</label>
            <select id="batch-category-select" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">请选择分类</option>
              ${options}
            </select>
          </div>
          <div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            <button onclick="closeModal()" class="px-5 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition">取消</button>
            <button onclick="window.__batchCategoryConfirm && window.__batchCategoryConfirm(document.getElementById('batch-category-select').value)" class="px-5 py-2 btn-primary text-white rounded-lg transition">确定</button>
          </div>
        </div>
      `);
      window.__batchCategoryConfirm = (categoryId) => {
        if (!categoryId) { toast('请选择分类', 'warning'); return; }
        closeModal();
        onConfirm(categoryId);
      };
    }

    // ========== 考试管理 v2（酷学院三模块设计） ==========
    let editingExamId = null;
    let selectedExamQuestions = [];

    // ========== 试题管理 ==========
    let currentBankId = null;
    
    async function loadBankList() {
      const tbody = document.getElementById('bankListBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</td></tr>';
      try {
        const res = await fetch('/api/question-banks');
        const result = await res.json();
        const banks = result.data || [];
        if (!banks.length) {
          tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-16 text-center text-slate-400"><i class="fas fa-database text-4xl mb-3 block opacity-30"></i><p>暂无题库，点击右上角"新建题库"开始</p></td></tr>';
          return;
        }
        tbody.innerHTML = banks.map(bank => {
          const tc = bank.typeCounts || {};
          const totalCount = (tc.single || 0) + (tc.multiple || 0) + (tc.judge || 0) + (tc.fill || 0) + (tc.essay || 0);
          const statusBadge = bank.status === 'active' ? '<span class="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-medium">启用</span>' : '<span class="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">停用</span>';
          const checked = bankSelectedIds.has(String(bank.id)) ? 'checked' : '';
          return `<tr class="hover:bg-slate-50/80 transition cursor-pointer group" data-bank-id="${bank.id}" onclick="openBankDetail(${bank.id})">
            <td class="pl-5 pr-2 py-4 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" class="bank-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleBankSelect('${bank.id}')" ${checked}>
            </td>
            <td class="px-5 py-4 whitespace-nowrap">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                  <i class="fas fa-database text-indigo-500 text-sm"></i>
                </div>
                <p class="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition">${escHtml(bank.name)}</p>
              </div>
            </td>
            <td class="px-5 py-4 whitespace-nowrap"><span class="text-sm text-slate-600">${getCategoryName(bank.categoryId)}</span></td>
            <td class="px-5 py-4 text-center whitespace-nowrap"><span class="text-sm font-semibold text-slate-700">${totalCount}</span> <span class="text-xs text-slate-400">题</span></td>
            <td class="px-5 py-4 text-center whitespace-nowrap text-sm text-slate-500">${escHtml(bank.createdBy || '管理员')}</td>
            <td class="px-5 py-4 text-center whitespace-nowrap">${statusBadge}</td>
            <td class="px-5 py-4 text-center whitespace-nowrap text-sm text-slate-500">${bank.createdAt || '-'}</td>
            <td class="px-5 py-4 text-center whitespace-nowrap" onclick="event.stopPropagation()">
              <div class="flex items-center justify-center gap-1">
                <button onclick="editBank(${bank.id})" class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition" title="编辑"><i class="fas fa-edit text-sm"></i></button>
                <button onclick="deleteBank(${bank.id})" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="删除"><i class="fas fa-trash text-sm"></i></button>
              </div>
            </td>
          </tr>`;
        }).join('');
        updateBankSelectAllState();
        updateBankBatchActionBar();
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-12 text-center text-red-500">加载失败: ' + e.message + '</td></tr>';
      }
    }

    function toggleBankSelect(id) {
      const sid = String(id);
      if (bankSelectedIds.has(sid)) bankSelectedIds.delete(sid);
      else bankSelectedIds.add(sid);
      updateBankSelectAllState();
      updateBankBatchActionBar();
    }

    function toggleBankSelectAll() {
      const checked = document.getElementById('bankSelectAll').checked;
      const visible = document.querySelectorAll('#bankListBody tr[data-bank-id]');
      const rows = Array.from(visible);
      if (checked) {
        rows.forEach(row => {
          const id = row.getAttribute('data-bank-id');
          if (id) bankSelectedIds.add(id);
        });
      } else {
        rows.forEach(row => {
          const id = row.getAttribute('data-bank-id');
          if (id) bankSelectedIds.delete(id);
        });
      }
      loadBankList();
      updateBankBatchActionBar();
    }

    function updateBankSelectAllState() {
      const rows = document.querySelectorAll('#bankListBody tr[data-bank-id]');
      const allChecked = rows.length > 0 && Array.from(rows).every(row => {
        const id = row.getAttribute('data-bank-id');
        return id && bankSelectedIds.has(id);
      });
      const el = document.getElementById('bankSelectAll');
      if (el) el.checked = allChecked;
    }

    function updateBankBatchActionBar() {
      const bar = document.getElementById('bankBatchActionBar');
      const count = document.getElementById('bankBatchCount');
      if (!bar || !count) return;
      if (bankSelectedIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = `已选 ${bankSelectedIds.size} 项`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function clearBankSelection() {
      bankSelectedIds.clear();
      const el = document.getElementById('bankSelectAll');
      if (el) el.checked = false;
      loadBankList();
      updateBankBatchActionBar();
    }

    async function batchDeleteBanks() {
      const ids = Array.from(bankSelectedIds);
      if (!ids.length) return;
      if (!confirm(`确定删除选中的 ${ids.length} 个题库吗？`)) return;
      let success = 0, fail = 0;
      for (const id of ids) {
        try {
          const ok = await deleteBank(id, false);
          if (ok) success++; else fail++;
        } catch (e) { fail++; }
      }
      clearBankSelection();
      loadBankList();
      toast(`删除完成：成功 ${success}，失败 ${fail}`);
    }

    function batchChangeBankCategory() {
      if (bankSelectedIds.size === 0) return;
      showBatchCategoryPicker('bank', async (categoryId) => {
        const ids = Array.from(bankSelectedIds);
        let success = 0, fail = 0;
        for (const id of ids) {
          try {
            const res = await fetch('/api/question-banks/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categoryId: parseInt(categoryId) })
            });
            if (res.ok) success++; else fail++;
          } catch (e) { fail++; }
        }
        toast(`调整分类完成：成功 ${success}，失败 ${fail}`);
        clearBankSelection();
        loadBankList();
      });
    }

    function getCategoryName(catId) {
      const cats = data.categories || [];
      for (const p of cats) {
        if (p.id === catId) return p.name;
        if (p.children) { const c = p.children.find(x => x.id === catId); if (c) return c.name; }
      }
      return catId > 10 && catId < 60 ? (cats.find(c => c.id === Math.floor(catId / 10) * 10)?.children?.find(x => x.id === catId)?.name || '未分类') : '未分类';
    }

    // ====== 新建题库 ======
    function openNewBankModal() {
      fillCategorySelect('newBankCategory');
      document.getElementById('newBankModal').classList.remove('hidden');
      document.getElementById('newBankModal').classList.add('flex');
    }
    function closeNewBankModal() {
      document.getElementById('newBankModal').classList.add('hidden');
      document.getElementById('newBankModal').classList.remove('flex');
    }
    async function createBank(e) {
      e.preventDefault();
      const name = document.getElementById('newBankName').value.trim();
      const categoryId = document.getElementById('newBankCategory').value;
      if (!name || !categoryId) return toast('请填写完整信息', 'warning');
      try {
        const res = await fetch('/api/question-banks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, categoryId: parseInt(categoryId) })
        });
        const result = await res.json();
        if (result.success) {
          closeNewBankModal();
          document.getElementById('newBankName').value = '';
          toast('题库创建成功！');
          loadBankList();
          // 刷新试卷导入弹窗的题库下拉（如果弹窗处于打开状态）
          const paperImportSel = document.getElementById('paperImportBankSelect');
          if (paperImportSel) {
            fetch('/api/question-banks')
              .then(res => res.json())
              .then(r => {
                const banks = r.data || [];
                paperImportSel.innerHTML = '<option value="">请选择目标题库</option>' +
                  banks.map(b => `<option value="${b.id}" ${b.id === result.data.id ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('');
              })
              .catch(() => {});
          }
          setTimeout(() => openBankDetail(result.data.id), 300);
        } else { toast(result.error || '创建失败', 'error'); }
      } catch (e) { toast('网络错误', 'error'); }
    }

    // ====== 编辑题库弹窗 ======
    function openEditBankModal() {
      fillCategorySelect('editBankCategory');
      document.getElementById('editBankModal').classList.remove('hidden');
      document.getElementById('editBankModal').classList.add('flex');
    }
    function closeEditBankModal() {
      document.getElementById('editBankModal').classList.add('hidden');
      document.getElementById('editBankModal').classList.remove('flex');
    }
    async function editBank(id) {
      try {
        const res = await fetch('/api/question-banks/' + id);
        const result = await res.json();
        const bank = result.data;
        if (!bank) return toast('题库不存在', 'error');
        document.getElementById('editBankId').value = bank.id;
        document.getElementById('editBankName').value = bank.name || '';
        fillCategorySelect('editBankCategory');
        setTimeout(() => {
          document.getElementById('editBankCategory').value = bank.categoryId || '';
        }, 100);
        openEditBankModal();
      } catch (e) { toast('加载题库失败', 'error'); }
    }
    async function saveEditBank(e) {
      e.preventDefault();
      const id = document.getElementById('editBankId').value;
      const name = document.getElementById('editBankName').value.trim();
      const categoryId = document.getElementById('editBankCategory').value;
      if (!name || !categoryId) return toast('请填写完整信息', 'warning');
      try {
        const res = await fetch('/api/question-banks/' + id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, categoryId: parseInt(categoryId) })
        });
        const result = await res.json();
        if (result.success) {
          closeEditBankModal();
          toast('题库已更新');
          loadBankList();
        } else { toast(result.error || '更新失败', 'error'); }
      } catch (e) { toast('更新失败', 'error'); }
    }

    // ====== 删除题库 ======
    async function deleteBank(id, askConfirm = true) {
      if (askConfirm && !confirm('删除题库将同时删除其中所有试题，确定继续？')) return false;
      try {
        const res = await fetch('/api/question-banks/' + id, { method: 'DELETE' });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success !== false) {
          if (askConfirm) {
            toast('题库已删除');
            loadBankList();
            if (currentBankId === id) closeBankDetail();
          }
          return true;
        }
        if (askConfirm) toast(result.error || '删除失败', 'error');
        return false;
      } catch (e) {
        if (askConfirm) toast('删除失败', 'error');
        return false;
      }
    }

    // ====== 导入题库：上传文件后自动识别名称 ======
    function onImportFileChange() {
      const file = document.getElementById('importFile').files[0];
      if (!file) return;
      const name = file.name.replace(/\.[^.]+$/, '');
      document.getElementById('importBankName').value = name;
    }

    // ====== 导入题库(Excel) ======
    function openImportBankModal() {
      fillCategorySelect('importBankCategory');
      document.getElementById('importFile').value = '';
      document.getElementById('importBankName').value = '';
      document.getElementById('importBankModal').classList.remove('hidden');
      document.getElementById('importBankModal').classList.add('flex');
    }
    function closeImportBankModal() {
      document.getElementById('importBankModal').classList.add('hidden');
      document.getElementById('importBankModal').classList.remove('flex');
    }
    async function doImportBank() {
      const name = document.getElementById('importBankName').value.trim();
      const categoryId = document.getElementById('importBankCategory').value;
      const file = document.getElementById('importFile').files[0];
      if (!name || !categoryId || !file) return toast('请填写完整信息并选择文件', 'warning');
      
      try {
        // 先创建题库
        const bankRes = await fetch('/api/question-banks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, categoryId: parseInt(categoryId) })
        });
        const bankResult = await bankRes.json();
        if (!bankResult.success) return toast(bankResult.error || '创建题库失败', 'error');
        const bankId = bankResult.data.id;

        // 上传Excel
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bankId', bankId);
        const importRes = await fetch('/api/questions/import', { method: 'POST', body: formData });
        const importResult = await importRes.json();
        
        if (importResult.success) {
          closeImportBankModal();
          toast(`导入完成：成功 ${importResult.imported} 题` + (importResult.failed ? `，失败 ${importResult.failed} 题` : ''));
          loadBankList();
        } else {
          toast(importResult.error || '导入失败', 'error');
        }
      } catch (e) { toast('导入失败: ' + e.message, 'error'); }
    }

    // ====== 打开/关闭试题详情子页面 ======
    async function openBankDetail(bankId) {
      currentBankId = bankId;
      try {
        const res = await fetch('/api/question-banks/' + bankId);
        const result = await res.json();
        const bank = result.data;
        if (!bank) return toast('题库不存在', 'error');
        document.getElementById('bankDetailName').textContent = '《' + bank.name + '》';
        document.getElementById('bankDetailCategory').textContent = getCategoryName(bank.categoryId);
        document.getElementById('bankListView').classList.add('hidden');
        document.getElementById('bankDetailView').classList.remove('hidden');
        loadBankQuestions(1);
      } catch (e) { toast('加载题库失败', 'error'); }
    }
    function closeBankDetail() {
      document.getElementById('bankDetailView').classList.add('hidden');
      document.getElementById('bankListView').classList.remove('hidden');
      currentBankId = null;
    }

    // ====== 题库内试题管理 ======
    let qbCurrentPage = 1;
    let qbTotalPages = 1;

    async function loadBankQuestions(page = 1) {
      qbCurrentPage = page;
      const tbody = document.getElementById('questionBankBody');
      if (!tbody || !currentBankId) return;
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</td></tr>';
      try {
        const params = new URLSearchParams({ bankId: currentBankId, page, pageSize: 20 });
        const kw = document.getElementById('qbSearch')?.value?.trim();
        const type = document.getElementById('qbTypeFilter')?.value;
        const diff = document.getElementById('qbDiffFilter')?.value;
        if (kw) params.set('keyword', kw);
        if (type && type !== 'all') params.set('type', type);
        if (diff && diff !== 'all') params.set('difficulty', diff);

        const res = await fetch('/api/questions?' + params);
        const result = await res.json();
        const questions = result.data || [];
        qbTotalPages = result.totalPages || 1;

        document.getElementById('qbPageInfo').textContent = `共 ${result.total || 0} 题，第 ${page}/${qbTotalPages} 页`;
        let pageBtns = '';
        for (let p = 1; p <= qbTotalPages; p++) {
          pageBtns += `<button onclick="loadBankQuestions(${p})" class="px-2.5 py-1 rounded text-xs ${p === qbCurrentPage ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${p}</button>`;
        }
        document.getElementById('qbPageBtns').innerHTML = pageBtns;

        if (!questions.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-database text-3xl mb-3 block opacity-50"></i><p>暂未添加试题，点击"添加试题"开始</p></td></tr>';
          return;
        }
        const typeName = t => ({ single:'单选题', multiple:'多选题', judge:'判断题', fill:'填空题', essay:'简答题' })[t] || t;
        const typeCls = t => ({ single:'bg-blue-50 text-blue-600', multiple:'bg-purple-50 text-purple-600', judge:'bg-amber-50 text-amber-600', fill:'bg-teal-50 text-teal-600', essay:'bg-rose-50 text-rose-600' })[t] || 'bg-slate-100 text-slate-600';
        const diffName = d => ({ easy:'简单', medium:'中等', hard:'困难' })[d] || d;
        const diffCls = d => ({ easy:'bg-green-100 text-green-700', medium:'bg-yellow-100 text-yellow-700', hard:'bg-red-100 text-red-700' })[d] || 'bg-slate-100 text-slate-600';

        tbody.innerHTML = questions.map(q => `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="px-5 py-3"><input type="checkbox" class="qb-cb" data-qid="${q.id}" onchange="updateQbBatchBtn()"></td>
            <td class="px-5 py-3 text-sm text-slate-700" style="min-width:0;"><div class="flex items-center gap-1.5 min-w-0">${(q.image || (q.optionImages && Object.keys(q.optionImages).length > 0)) ? ('<span class="text-indigo-400 flex-shrink-0" title="' + (q.image ? '含题干配图' : '') + ((q.image && q.optionImages && Object.keys(q.optionImages).length > 0) ? '；' : '') + (q.optionImages && Object.keys(q.optionImages).length > 0 ? '含选项配图(' + Object.keys(q.optionImages).length + ')' : '') + '"><i class="fas fa-image"></i></span>') : ''}<span class="truncate" title="${escHtml(q.title || '')}">${escHtml((q.title || '').substring(0, 80))}</span></div></td>
            <td class="px-5 py-3 text-center whitespace-nowrap"><span class="px-2.5 py-1 rounded-full text-xs font-medium ${typeCls(q.type)}">${typeName(q.type)}</span></td>
            <td class="px-5 py-3 text-center whitespace-nowrap"><span class="px-2.5 py-1 rounded-full text-xs font-medium ${diffCls(q.difficulty)}">${diffName(q.difficulty)}</span></td>
            <td class="px-5 py-3 text-center whitespace-nowrap">
              <div class="flex items-center justify-center gap-1">
                <button onclick="editQuestion(${q.id})" class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition" title="编辑"><i class="fas fa-edit text-sm"></i></button>
                <button onclick="copyQuestion(${q.id})" class="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition" title="复制"><i class="fas fa-copy text-sm"></i></button>
                <button onclick="deleteQuestion(${q.id})" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="删除"><i class="fas fa-trash text-sm"></i></button>
              </div>
            </td>
          </tr>`).join('');
        
        if (document.getElementById('qbSelectAll')) document.getElementById('qbSelectAll').checked = false;
        updateQbBatchBtn();
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-red-500">加载失败: ' + e.message + '</td></tr>';
      }
    }

    function toggleQbSelectAll() {
      const checked = document.getElementById('qbSelectAll').checked;
      document.querySelectorAll('#questionBankBody .qb-cb').forEach(cb => { cb.checked = checked; });
      updateQbBatchBtn();
    }
    function updateQbBatchBtn() {
      const count = document.querySelectorAll('#questionBankBody .qb-cb:checked').length;
      const btn = document.getElementById('qbBatchDeleteBtn');
      if (btn) {
        if (count > 0) { btn.classList.remove('hidden'); btn.innerHTML = `<i class="fas fa-trash mr-1"></i>批量删除(${count})`; }
        else btn.classList.add('hidden');
      }
    }
    async function batchDeleteQuestions() {
      const checked = document.querySelectorAll('#questionBankBody .qb-cb:checked');
      if (!checked.length) return;
      if (!confirm(`确定要删除选中的 ${checked.length} 道题目吗？`)) return;
      const ids = Array.from(checked).map(cb => parseInt(cb.dataset.qid));
      try {
        const res = await fetch('/api/questions/batch', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        const result = await res.json();
        if (result.success) { toast(`已删除 ${result.deleted} 道题目`); loadBankQuestions(qbCurrentPage); }
        else { toast(result.error || '删除失败', 'error'); }
      } catch (e) { toast('删除失败', 'error'); }
    }

    // ====== 试题编辑(复用原有模态，增加bankId) ======
    // ====== 试题编辑（弹窗模式） ======
    let qOptions = [];
    let qOptionImages = {};
    let qAnswer = '';
    let qAnswerMulti = [];

    // ====== 题目图片上传 ======
    function handleQImageSelect(input) {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('图片不能超过 5MB', 'warning'); input.value = ''; return; }
      previewQImage(file);
      uploadQImage(file);
    }

    function handleQImageDrop(e) {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('请上传图片文件', 'warning'); return; }
      if (file.size > 5 * 1024 * 1024) { toast('图片不能超过 5MB', 'warning'); return; }
      previewQImage(file);
      uploadQImage(file);
    }

    function handleQImagePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file && file.size <= 5 * 1024 * 1024) {
            e.preventDefault();
            previewQImage(file);
            uploadQImage(file);
          }
          break;
        }
      }
    }

    function previewQImage(file) {
      const reader = new FileReader();
      reader.onload = function(ev) {
        document.getElementById('qImagePreviewImg').src = ev.target.result;
        document.getElementById('qImagePreview').classList.remove('hidden');
        document.getElementById('qImageBtnText').textContent = '更换图片';
      };
      reader.readAsDataURL(file);
    }

    function clearQImage() {
      document.getElementById('qImageInput').value = '';
      document.getElementById('qImageUrl').value = '';
      document.getElementById('qImagePreviewImg').src = '';
      document.getElementById('qImagePreview').classList.add('hidden');
      document.getElementById('qImageBtnText').textContent = '添加图片';
    }

    function showExistingQImage(url) {
      if (!url) return;
      document.getElementById('qImagePreviewImg').src = url;
      document.getElementById('qImagePreview').classList.remove('hidden');
      document.getElementById('qImageBtnText').textContent = '更换图片';
      document.getElementById('qImageUrl').value = url;
    }

    async function uploadQImage(file) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(API + '/upload/image', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success || result.url) {
          document.getElementById('qImageUrl').value = result.url || result.data?.url || '';
          toast('图片上传成功', 'success');
        } else {
          // 后端可能未实现，回退到 base64 本地存储
          const reader = new FileReader();
          reader.onload = function(ev) {
            document.getElementById('qImageUrl').value = ev.target.result;
            toast('图片已本地存储');
          };
          reader.readAsDataURL(file);
        }
      } catch (err) {
        // 上传失败时用 base64 兜底
        const reader = new FileReader();
        reader.onload = function(ev) {
          document.getElementById('qImageUrl').value = ev.target.result;
          toast('图片已本地存储');
        };
        reader.readAsDataURL(file);
      }
    }

    function openQuestionModal(id = null) {
      qOptions = []; qOptionImages = {}; qAnswer = ''; qAnswerMulti = [];
      document.getElementById('qEditId').value = id || '';
      // 重置图片区域
      document.getElementById('qImageInput').value = '';
      document.getElementById('qImageUrl').value = '';
      document.getElementById('qImagePreview').classList.add('hidden');
      document.getElementById('qImageBtnText').textContent = '添加图片';
      const modal = document.getElementById('questionModal');
      modal.classList.remove('hidden'); modal.classList.add('flex');
      if (id) { loadQuestionForEdit(id); }
      else { qOptions = ['', '', '', '']; onQTypeChange(); }
    }

    function closeQuestionModal() {
      document.getElementById('questionModal').classList.add('hidden');
      document.getElementById('questionModal').classList.remove('flex');
    }

    async function loadQuestionForEdit(id) {
      try {
        const res = await fetch('/api/questions/' + id);
        const result = await res.json();
        const q = result.data;
        if (!q) { toast('题目不存在', 'error'); return; }
        document.getElementById('qTitle').value = q.title || '';
        document.getElementById('qType').value = q.type || 'single';
        document.getElementById('qDifficulty').value = q.difficulty || 'medium';
        document.getElementById('qExplanation').value = q.explanation || '';
        // 加载已有图片
        if (q.image) { showExistingQImage(q.image); } else { clearQImage(); }
        qOptions = (q.options && q.options.length > 0) ? q.options : ['', '', '', ''];
        qOptionImages = (q.optionImages && typeof q.optionImages === 'object') ? { ...q.optionImages } : {};
        if (q.type === 'multiple') {
          qAnswerMulti = Array.isArray(q.answer) ? q.answer : (q.answer ? [q.answer] : []);
          qAnswer = '';
        } else if (q.type === 'judge') {
          qOptions = ['正确', '错误'];
          qAnswer = q.answer;
        } else {
          qAnswer = typeof q.answer === 'string' ? q.answer : (Array.isArray(q.answer) ? q.answer.join('/') : JSON.stringify(q.answer));
        }
        onQTypeChange();
      } catch (e) { toast('加载题目失败', 'error'); }
    }

    function onQTypeChange() {
      const type = document.getElementById('qType').value;
      const optionsArea = document.getElementById('qOptionsArea');
      const answerText = document.getElementById('qAnswerText');
      const addOptBtn = document.getElementById('qAddOptionBtn');
      answerText.classList.add('hidden');
      optionsArea.classList.remove('hidden');
      if (type === 'judge') {
        qOptions = ['正确', '错误']; addOptBtn.classList.add('hidden');
        renderQOptions('single');
      } else if (type === 'single') {
        addOptBtn.classList.remove('hidden'); renderQOptions('single');
      } else if (type === 'multiple') {
        addOptBtn.classList.remove('hidden'); renderQOptions('multiple');
      } else {
        optionsArea.classList.add('hidden'); answerText.classList.remove('hidden');
        document.getElementById('qAnswerTextarea').value = qAnswer || '';
      }
    }

    function addQOption() { qOptions.push(''); onQTypeChange(); }

    // 处理选项图片上传
    function handleOptionImage(idx, input) {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('图片不能超过 5MB', 'warning'); input.value = ''; return; }
      if (!file.type.startsWith('image/')) { toast('请上传图片文件', 'warning'); return; }
      // 先本地预览
      const reader = new FileReader();
      reader.onload = function(ev) {
        qOptionImages[idx] = ev.target.result;
        onQTypeChange();
        // 尝试上传到服务器
        uploadOptionImageToServer(idx, file);
      };
      reader.readAsDataURL(file);
    }

    async function uploadOptionImageToServer(idx, file) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(API + '/upload/image', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success || result.url) {
          qOptionImages[idx] = result.url || result.data?.url || '';
          onQTypeChange();
        }
      } catch (e) { /* 保持 base64 */ }
    }

    // 预览选项大图
    function previewOptionImage(url) {
      showModal(`
        <div class="bg-white rounded-2xl shadow-2xl max-w-[90vw] max-h-[90vh] overflow-hidden">
          <div class="flex justify-end p-2">
            <button onclick="closeModal()" class="w-8 h-8 rounded-full bg-slate-800/60 text-white hover:bg-slate-800 flex items-center justify-center transition">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <img src="${url}" class="max-w-[90vw] max-h-[80vh] object-contain p-4">
        </div>
      `);
    }

    function renderQOptions(mode) {
      const list = document.getElementById('qOptionsList');
      list.innerHTML = qOptions.map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const optImg = qOptionImages[i] || '';
        const isAnswer = mode === 'multiple' ? qAnswerMulti.includes(letter) : (qAnswer === letter);
        const toggleHtml = mode === 'multiple'
          ? `<input type="checkbox" ${isAnswer?'checked':''} onchange="toggleMultiAnswer('${letter}',this.checked)" class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">`
          : `<input type="radio" name="qAnswerRadio" ${isAnswer?'checked':''} onchange="qAnswer='${letter}'" class="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500">`;
        return `<div class="p-3 rounded-lg hover:bg-slate-50 group border border-transparent hover:border-slate-200">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">${letter}</span>
            <input type="text" value="${escHtml(opt)}" onchange="qOptions[${i}]=this.value" placeholder="请输入选项内容" class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <label class="flex items-center gap-1.5 cursor-pointer flex-shrink-0 px-2">
              ${toggleHtml}
              <span class="text-xs font-medium text-slate-500 whitespace-nowrap">正确答案</span>
            </label>
            ${qOptions.length>2?`<button type="button" onclick="qOptions.splice(${i},1);delete qOptionImages[${i}];onQTypeChange()" class="p-1.5 text-orange-400 hover:text-orange-500 hover:bg-orange-50 rounded transition flex-shrink-0 text-xs"><i class="fas fa-trash-alt mr-1"></i>删除</button>`:'<span class="w-16 flex-shrink-0"></span>'}
          </div>
          <div class="flex items-center gap-2 mt-2 pl-11">
            ${optImg ? `<img src="${optImg}" class="w-10 h-10 rounded object-cover border border-slate-200 cursor-pointer" onclick="previewOptionImage('${optImg}')" title="点击查看大图">` : ''}
            <button type="button" onclick="document.getElementById('optImgInput-${i}').click()" class="flex items-center gap-1.5 px-2 py-1 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded transition text-xs" title="${optImg ? '更换图片' : '添加图片'}">
              <i class="far fa-image"></i>
              <span>${optImg ? '更换图片' : '添加图片'}</span>
            </button>
            <input type="file" id="optImgInput-${i}" accept="image/*" onchange="handleOptionImage(${i}, this)" class="hidden">
          </div>
        </div>`;
      }).join('');
    }

    function toggleMultiAnswer(letter, checked) {
      if (checked) { if (!qAnswerMulti.includes(letter)) qAnswerMulti.push(letter); }
      else { qAnswerMulti = qAnswerMulti.filter(a => a !== letter); }
    }

    async function saveQuestion() {
      const type = document.getElementById('qType').value;
      const id = document.getElementById('qEditId').value;
      let answer;
      if (type === 'multiple') answer = qAnswerMulti;
      else if (type === 'single' || type === 'judge') answer = qAnswer;
      else answer = document.getElementById('qAnswerTextarea').value.trim();

      if (!answer || (Array.isArray(answer) && answer.length === 0)) {
        toast('请设置正确答案', 'warning'); return;
      }
      const title = document.getElementById('qTitle').value.trim();
      if (!title) { toast('请输入题目内容', 'warning'); return; }

      const payload = {
        bankId: currentBankId,
        title,
        type,
        difficulty: document.getElementById('qDifficulty').value,
        options: (type === 'fill' || type === 'essay') ? [] : qOptions.filter(o => o.trim()),
        answer,
        explanation: document.getElementById('qExplanation').value.trim(),
        image: document.getElementById('qImageUrl').value || null,
        optionImages: Object.keys(qOptionImages).length > 0 ? qOptionImages : null,
        knowledge: ''
      };

      try {
        let res;
        if (id) {
          res = await fetch('/api/questions/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } else {
          res = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }
        const result = await res.json();
        if (result.success) {
          closeQuestionModal();
          loadBankQuestions(qbCurrentPage);
          toast(id ? '试题已更新' : '试题添加成功');
        } else { toast(result.error || '保存失败', 'error'); }
      } catch (e) { toast('网络错误', 'error'); }
    }

    async function editQuestion(id) { openQuestionModal(id); }

    async function deleteQuestion(id) {
      if (!confirm('确定要删除这道题目吗？已关联的考试也会移除该题，题目图片将一并删除。')) return;
      try {
        const res = await fetch('/api/questions/' + id, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) { toast('题目已删除'); loadBankQuestions(qbCurrentPage); }
        else { toast(result.error || '删除失败', 'error'); }
      } catch (e) { toast('删除失败', 'error'); }
    }

    async function copyQuestion(id) {
      try {
        const res = await fetch(`${API}/questions/${id}`);
        const result = await res.json();
        const q = result.data;
        if (!q) return;
        const payload = {
          bankId: currentBankId,
          title: q.title + '（复制）',
          type: q.type,
          difficulty: q.difficulty,
          options: q.options || [],
          answer: q.answer,
          image: q.image || null,
          optionImages: q.optionImages || null,
          knowledge: q.knowledge || '',
          explanation: q.explanation || q.analysis || ''
        };
        await fetch(`${API}/questions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        toast('试题已复制');
        loadBankQuestions(qbCurrentPage);
      } catch (e) { toast('复制失败', 'error'); }
    }

    // ====== 导入试题（已有题库内追加） ======
    function openImportQuestionsModal() {
      document.getElementById('importQuestionsFile').value = '';
      const modal = document.getElementById('importQuestionsModal');
      modal.classList.remove('hidden'); modal.classList.add('flex');
    }
    function closeImportQuestionsModal() {
      document.getElementById('importQuestionsModal').classList.add('hidden');
      document.getElementById('importQuestionsModal').classList.remove('flex');
    }
    async function doImportQuestions() {
      const file = document.getElementById('importQuestionsFile').files[0];
      if (!file || !currentBankId) return toast('请选择Excel文件', 'warning');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bankId', currentBankId);
      try {
        const res = await fetch('/api/questions/import', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success) {
          closeImportQuestionsModal();
          toast(`导入完成：成功 ${result.imported} 题` + (result.failed ? `，失败 ${result.failed} 题` : ''));
          loadBankQuestions(qbCurrentPage);
        } else { toast(result.error || '导入失败', 'error'); }
      } catch (e) { toast('导入失败: ' + e.message, 'error'); }
    }

    // ====== 试卷导入试题 ======
    function openPaperImportQuestionsModal() {
      document.getElementById('paperImportQuestionsFile').value = '';
      // 加载题库下拉列表
      const sel = document.getElementById('paperImportBankSelect');
      if (sel) {
        fetch('/api/question-banks')
          .then(res => res.json())
          .then(result => {
            const banks = result.data || [];
            sel.innerHTML = '<option value="">请选择目标题库</option>' +
              banks.map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');
          })
          .catch(() => { /* 静默失败，保持默认选项 */ });
      }
      const modal = document.getElementById('paperImportQuestionsModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closePaperImportQuestionsModal() {
      const modal = document.getElementById('paperImportQuestionsModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    async function doPaperImportQuestions() {
      const file = document.getElementById('paperImportQuestionsFile').files[0];
      if (!file) return toast('请选择Excel文件', 'warning');
      const bankId = document.getElementById('paperImportBankSelect')?.value;
      if (!bankId) return toast('请先选择目标题库', 'warning');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('bankId', bankId);

      try {
        const res = await fetch('/api/questions/import', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success) {
          closePaperImportQuestionsModal();
          toast(`导入完成：成功 ${result.imported} 题` + (result.failed ? `，失败 ${result.failed} 题` : ''));

          // 将导入的题目添加到当前试卷
          const importedQuestions = result.importedData || [];
          importedQuestions.forEach((q) => {
            paperQuestions.push({
              questionId: q.id,
              score: q.score || 0,
              order: paperQuestions.length,
              content: q.title || q.content || '(题目内容)',
              type: q.type || 'single',
              options: q.options || [],
              answer: q.answer || '',
              explanation: q.explanation || ''
            });
          });

          // 刷新 DataAPI 缓存，确保后续创建考试时能匹配到新导入的题目
          try {
            const freshRes = await fetch('/api/data/questions');
            if (freshRes.ok && window.DataAPI && window.DataAPI.set) {
              const freshQuestions = await freshRes.json();
              await window.DataAPI.set('questions', freshQuestions);
            }
          } catch(cacheErr) { /* 缓存刷新失败不影响主流程 */ }

          // 更新试卷编辑页显示
          if (editorMode) { renderUnifiedEditor(); } else { renderPaperQuestions(); }
        } else {
          toast(result.error || '导入失败', 'error');
        }
      } catch (e) {
        toast('导入失败: ' + e.message, 'error');
      }
    }

    function fillCategorySelect(selectId) {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      const cats = data.categories || [];
      let html = '<option value="">请选择分类</option>';
      cats.forEach(p => {
        html += `<option value="${p.id}">${p.name}</option>`;
      });
      sel.innerHTML = html;
    }

    async function loadExams() {
      const tbody = document.getElementById('examList');
      if (!tbody) { console.warn('examList 元素不存在,跳过加载'); return; }

      tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</td></tr>';
      try {
        const res = await fetch('/api/exams');
        const exams = await res.json();

        const statExamTotal = document.getElementById('examStatTotal');
        const statExamPublished = document.getElementById('examStatPublished');
        const statExamDraft = document.getElementById('examStatDraft');
        const statExamAttempts = document.getElementById('examStatAttempts');

        if (statExamTotal) statExamTotal.textContent = exams.length;
        if (statExamPublished) statExamPublished.textContent = exams.filter(e => e.status === 'published').length;
        if (statExamDraft) statExamDraft.textContent = exams.filter(e => e.status === 'draft').length;
        if (statExamAttempts) statExamAttempts.textContent = exams.reduce((s, e) => s + (e.attemptCount || 0), 0);

        if (!exams.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-file-alt text-3xl mb-3 block"></i><p>暂无考试,点击右上角"创建考试"开始</p></td></tr>';
          return;
        }
        const statusMap = {
          draft: { cls: 'bg-slate-100 text-slate-600', text: '草稿' },
          published: { cls: 'bg-emerald-100 text-emerald-700', text: '已发布' },
          closed: { cls: 'bg-red-100 text-red-600', text: '已结束' }
        };

        const formatTime = t => t ? new Date(t).toLocaleDateString('zh-CN') + ' ' + new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-';

        tbody.innerHTML = exams.map(exam => {
          const st = statusMap[exam.status] || statusMap.draft;
          const attemptInfo = exam.maxAttempts ? `${exam.attemptCount || 0}/${exam.maxAttempts}` : `${exam.attemptCount || 0}`;

          return `<tr class="hover:bg-slate-50/80 transition">
            <td class="px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                  <i class="fas fa-file-alt text-indigo-500 text-sm"></i>
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-800">${escHtml(exam.title)}</p>
                  <p class="text-xs text-slate-400 mt-0.5">${exam.description ? escHtml(exam.description.substring(0, 40)) : '暂无描述'}</p>
                </div>
              </div>
            </td>
            <td class="px-5 py-4 text-center text-sm text-slate-600">${exam.duration}分钟</td>
            <td class="px-5 py-4 text-center"><span class="text-sm font-semibold text-slate-700">${exam.questionCount || 0}</span> <span class="text-xs text-slate-400">题</span></td>
            <td class="px-5 py-4 text-center text-sm text-slate-600">${exam.passingScore}/${exam.totalScore}</td>
            <td class="px-5 py-4 text-center text-sm text-slate-600">${attemptInfo}</td>
            <td class="px-5 py-4 text-center">
              <span class="px-2.5 py-1 text-xs rounded-full font-medium ${st.cls}">${st.text}</span>
            </td>
            <td class="px-5 py-4 text-center">
              <div class="flex items-center justify-center gap-1">
                <button onclick="editExam(${exam.id})" class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition" title="编辑"><i class="fas fa-edit text-sm"></i></button>
                <button onclick="previewExam(${exam.id})" class="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition" title="预览"><i class="fas fa-eye text-sm"></i></button>
                ${exam.status === 'draft' ? `<button onclick="publishExam(${exam.id})" class="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition" title="发布"><i class="fas fa-paper-plane text-sm"></i></button>` : ''}
                ${exam.status === 'published' ? `<button onclick="closeExam(${exam.id})" class="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition" title="结束"><i class="fas fa-stop-circle text-sm"></i></button>` : ''}
                <button onclick="openExamDetailView(${exam.id}, 'students')" class="p-2 text-slate-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition" title="成绩"><i class="fas fa-chart-bar text-sm"></i></button>
                <button onclick="deleteExam(${exam.id})" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="删除"><i class="fas fa-trash text-sm"></i></button>
              </div>
            </td>
          </tr>`;
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-red-500">加载失败</td></tr>';
      }
    }

    // ====== 考试管理列表（酷学院风格） ======
    let examMgmtAllData = [];
    let examSelectedIds = new Set();
    let examSearchTimer = null;
    let examCurrentPage = 1;
    let examTotalPages = 1;
    let examPageSize = 10;
    let examSortField = '';
    let examSortOrder = 'asc';

    async function loadExamMgmtList() {
      const tbody = document.getElementById('examMgmtList');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="11" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</td></tr>';
      try {
        const res = await fetch('/api/exams');
        examMgmtAllData = await res.json();
        // 更新统计卡片
        const total = examMgmtAllData.length;
        const published = examMgmtAllData.filter(e => e.status === 'published').length;
        const totalAttempts = examMgmtAllData.reduce((s, e) => s + (e.attemptCount || 0), 0);
        // 通过率需从 attempts 数据中计算
        let passCount = 0, attemptTotal = 0;
        try {
          const attRes = await fetch('/api/data');
          const d = await attRes.json();
          const attempts = d.exam_attempts || [];
          attemptTotal = attempts.length;
          passCount = attempts.filter(a => a.passed).length;
        } catch(e) { console.warn('获取考试统计失败:', e); }
        el('exam-stat-total', total);
        el('exam-stat-published', published);
        el('exam-stat-attempts', totalAttempts);
        el('exam-stat-passrate', attemptTotal > 0 ? Math.round(passCount / attemptTotal * 100) + '%' : '0%');

        renderExamMgmtList();
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="11" class="px-6 py-12 text-center text-red-500">加载失败</td></tr>';
      }
    }

    function applyExamFilters() {
      const search = (document.getElementById('examSearchInput')?.value || '').trim().toLowerCase();
      const status = document.getElementById('examFilterStatus')?.value || 'all';
      let filtered = examMgmtAllData.filter(e => {
        if (search && !(e.title || '').toLowerCase().includes(search)) return false;
        if (status !== 'all' && e.status !== status) return false;
        return true;
      });
      // 排序
      if (examSortField) {
        filtered.sort((a, b) => {
          let av = a[examSortField] || 0;
          let bv = b[examSortField] || 0;
          if (examSortField === 'title') { av = av || ''; bv = bv || ''; }
          if (typeof av === 'string') av = av.toLowerCase();
          if (typeof bv === 'string') bv = bv.toLowerCase();
          if (av < bv) return examSortOrder === 'asc' ? -1 : 1;
          if (av > bv) return examSortOrder === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return filtered;
    }

    function renderExamMgmtList() {
      const tbody = document.getElementById('examMgmtList');
      const countEl = document.getElementById('examCount');
      const filtered = applyExamFilters();
      if (countEl) countEl.textContent = `共 ${filtered.length} 场考试`;

      // 分页计算
      examTotalPages = Math.max(1, Math.ceil(filtered.length / examPageSize));
      if (examCurrentPage > examTotalPages) examCurrentPage = examTotalPages;
      const start = (examCurrentPage - 1) * examPageSize;
      const end = start + examPageSize;
      const pageData = filtered.slice(start, end);

      // 更新分页控件
      const pagination = document.getElementById('examPagination');
      if (pagination) {
        if (filtered.length > examPageSize) {
          pagination.classList.remove('hidden');
          document.getElementById('examTotalCount').textContent = filtered.length;
          document.getElementById('examCurrentPageNum').textContent = examCurrentPage;
          document.getElementById('examTotalPageNum').textContent = examTotalPages;
          document.getElementById('examFirstPage').disabled = examCurrentPage <= 1;
          document.getElementById('examPrevPage').disabled = examCurrentPage <= 1;
          document.getElementById('examNextPage').disabled = examCurrentPage >= examTotalPages;
          document.getElementById('examLastPage').disabled = examCurrentPage >= examTotalPages;
        } else {
          pagination.classList.add('hidden');
        }
      }

      if (!pageData.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="px-6 py-16 text-center text-slate-400"><i class="fas fa-clipboard-list text-4xl mb-3 block opacity-30"></i><p>暂无考试</p><p class="text-xs mt-1">点击右上角"创建考试"开始安排考试</p></td></tr>';
        updateExamBatchActionBar();
        return;
      }

      const statusMap = {
        draft: { cls: 'bg-slate-100 text-slate-600', text: '未发布' },
        published: { cls: 'bg-emerald-100 text-emerald-700', text: '已发布' },
        closed: { cls: 'bg-red-100 text-red-600', text: '已结束' }
      };
      tbody.innerHTML = pageData.map(exam => {
        const checked = examSelectedIds.has(String(exam.id)) ? 'checked' : '';
        const st = statusMap[exam.status] || statusMap.draft;
        const statusCls = st.cls;
        const statusText = st.text;
        let toggleBtn = '';
        if (exam.status === 'draft') {
          toggleBtn = `<button onclick="publishExam(${exam.id})" class="p-1.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition flex-shrink-0" title="发布"><i class="fas fa-paper-plane text-xs"></i></button>`;
        } else if (exam.status === 'published') {
          toggleBtn = `<button onclick="closeExam(${exam.id})" class="p-1.5 text-amber-400 hover:text-amber-600 hover:bg-amber-50 rounded transition flex-shrink-0" title="结束"><i class="fas fa-stop-circle text-xs"></i></button>`;
        } else if (exam.status === 'closed') {
          toggleBtn = `<button onclick="publishExam(${exam.id})" class="p-1.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition flex-shrink-0" title="重新发布"><i class="fas fa-redo text-xs"></i></button>`;
        }
        const total = exam.attemptCount || 0;
        const completed = exam.completedCount || 0;
        const passed = exam.passCount || 0;
        const failed = exam.failCount || 0;
        const absent = exam.absentCount || 0;
        const unstarted = exam.unstartedCount || 0;
        const assigned = (exam.allowedUsers && Array.isArray(exam.allowedUsers)) ? exam.allowedUsers.length : 0;
        const attemptedUserCount = exam.attemptedUserCount || 0;
        let joinRate;
        if (assigned > 0) {
          joinRate = Math.round(attemptedUserCount / assigned * 100);
        } else {
          joinRate = attemptedUserCount > 0 ? 100 : 0;
        }
        const passRate = completed > 0 ? Math.round(passed / completed * 100) : 0;
        const absentRate = assigned > 0 ? Math.round((absent + unstarted) / assigned * 100) : 0;
        const createdAt = exam.createdAt || exam.created_at;
        const timeStr = createdAt ? new Date(createdAt).toLocaleDateString('zh-CN') : '—';
        return `<tr class="hover:bg-indigo-50/30 transition" data-exam-id="${exam.id}">
          <td class="pl-5 pr-2 py-3 text-center">
            <input type="checkbox" ${checked} onchange="toggleExamSelect('${exam.id}')" class="exam-row-check rounded border-slate-300 text-indigo-500 focus:ring-indigo-500 cursor-pointer">
          </td>
          <td class="px-2 py-3">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                <i class="fas fa-clipboard-check text-indigo-500 text-xs"></i>
              </div>
              <div class="min-w-0">
                <a href="javascript:;" onclick="openExamDetailView(${exam.id})" class="text-sm font-semibold text-indigo-600 hover:text-indigo-700 truncate block">${escHtml(exam.title)}</a>
                <p class="text-xs text-slate-400 mt-0.5">${exam.questionCount || 0} 道题</p>
              </div>
            </div>
          </td>
          <td class="px-2 py-3 text-center text-sm text-slate-600">${total}</td>
          <td class="px-2 py-3 text-center">
            <a href="javascript:;" onclick="openExamDetailView(${exam.id}, 'students')" class="text-sm font-medium text-indigo-600 hover:text-indigo-700">${completed}/${passed}/${failed}</a>
          </td>
          <td class="px-2 py-3 text-center text-sm text-slate-600">${unstarted}/${absent}</td>
          <td class="px-2 py-3 text-center text-sm text-slate-600">${joinRate}%</td>
          <td class="px-2 py-3 text-center text-sm text-slate-600">${passRate}%</td>
          <td class="px-2 py-3 text-center text-sm text-slate-600">${absentRate}%</td>
          <td class="px-2 py-3 text-center text-sm text-slate-500">${timeStr}</td>
          <td class="px-2 py-3 text-center">
            <span class="px-2 py-1 text-xs rounded-full font-medium ${statusCls}">${statusText}</span>
          </td>
          <td class="pr-4 pl-2 py-3">
            <div class="flex items-center justify-end gap-0.5 flex-nowrap">
              <button onclick="copyExam(${exam.id})" class="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition flex-shrink-0" title="复制"><i class="fas fa-copy text-xs"></i></button>
              <button onclick="openExamModal(${exam.id})" class="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition flex-shrink-0" title="编辑"><i class="fas fa-edit text-xs"></i></button>
              <button onclick="openExamAssignModal(${exam.id})" class="p-1.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition flex-shrink-0" title="指派学员"><i class="fas fa-user-check text-xs"></i></button>
              ${toggleBtn}
              <button onclick="openExamDetailView(${exam.id}, 'students')" class="p-1.5 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded transition flex-shrink-0" title="成绩"><i class="fas fa-chart-bar text-xs"></i></button>
              <button onclick="deleteExam(${exam.id})" class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition flex-shrink-0" title="删除"><i class="fas fa-trash text-xs"></i></button>
            </div>
          </td>
        </tr>`;
      }).join('');
      updateExamSelectAllState();
    }

    // ========== 统一编辑器（考试 + 试卷共用） ==========
    let editorMode = null; // 'exam' | 'paper' | null
    let examEditorData = null;

    // 编辑器适配器：封装考试/试卷两种模式的加载、保存差异
    const editorAdapter = {
      exam: {
        async load(id) {
          const examRes = await fetch('/api/exams');
          const allExams = await examRes.json();
          examEditorData = allExams.find(e => e.id === id || e.id === Number(id) || String(e.id) === String(id));
          if (!examEditorData) throw new Error('考试不存在');
          const qRes = await fetch('/api/exams/' + id + '/questions');
          const qResult = await qRes.json();
          return (qResult.questions || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(function(q) {
            var qd = q.questionDetail || q;
            return {
              questionId: q.questionId || q.id,
              score: q.score || qd.score || 5,
              partialScore: q.partialScore || 0,
              order: q.order || 0,
              content: qd.title || qd.content || '(无标题)',
              type: qd.type || 'single',
              options: qd.options || [],
              answer: qd.answer || '',
              explanation: qd.explanation || ''
            };
          });
        },
        async save(questions) {
          var payload = questions.map(function(q, i) {
            return { questionId: q.questionId || q.id, score: q.score || 5, order: i };
          });
          await fetch('/api/exams/' + examEditorData.id + '/questions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questions: payload })
          });
        },
        getTitle: function() { return examEditorData ? examEditorData.title : ''; },
        isPublish: false
      },
      paper: {
        async load(id) {
          var paper = papersAllData.find(function(p) { return p.id === id; });
          if (!paper) throw new Error('试卷不存在');
          editingPaperId = id;
          return (paper.questions || []).map(function(pq, idx) {
            return {
              questionId: pq.questionId,
              score: pq.score || 0,
              partialScore: pq.partialScore || 0,
              order: idx,
              content: pq.content || '(题目内容)',
              type: pq.type || 'single',
              options: pq.options || [],
              answer: pq.answer || '',
              explanation: pq.explanation || ''
            };
          });
        },
        async save(questions) {
          var paper = papersAllData.find(function(p) { return p.id === editingPaperId; });
          if (!paper) throw new Error('试卷不存在');
          var updated = { ...paper };
          updated.questions = questions.map(function(q, i) {
            return { questionId: q.questionId, score: q.score || 5, partialScore: q.partialScore || 0, order: i };
          });
          updated.totalScore = questions.reduce(function(s, q) { return s + (q.score || 0); }, 0);
          updated.updatedAt = new Date().toISOString();
          await savePaperToBackend(updated);
          var idx = papersAllData.findIndex(function(p) { return p.id === editingPaperId; });
          if (idx >= 0) papersAllData[idx] = updated;
        },
        getTitle: function() {
          var p = papersAllData.find(function(pp) { return pp.id === editingPaperId; });
          return p ? p.name : '';
        },
        isPublish: true
      }
    };

    // 隐藏/显示考试列表元素
    function toggleExamListViews(hide) {
      var tabContent = document.getElementById('tab-exam-schedule');
      var examList = document.getElementById('examListView');
      if (examList) examList.style.display = hide ? 'none' : '';
      var statCards = tabContent ? tabContent.querySelector('.grid.grid-cols-4') : null;
      if (statCards) statCards.style.display = hide ? 'none' : '';
      var filterBar = tabContent ? tabContent.querySelector('.flex.items-center.justify-between.mb-4') : null;
      if (filterBar) filterBar.style.display = hide ? 'none' : '';
      var filterRow = tabContent ? tabContent.querySelector('.flex.items-center.gap-3.mb-4') : null;
      if (filterRow) filterRow.style.display = hide ? 'none' : '';
      var batchBar = document.getElementById('examBatchActionBar');
      if (batchBar) batchBar.style.display = hide ? 'none' : '';
      var examTable = tabContent ? tabContent.querySelector('.bg-white.rounded-lg.border') : null;
      if (examTable) examTable.style.display = hide ? 'none' : '';
      var pagination = document.getElementById('examPagination');
      if (pagination) pagination.style.display = hide ? 'none' : '';
    }

    async function openExamEditor(examId) {
      console.log('[openExamEditor] 开始, examId:', examId, typeof examId);
      try {
        editorMode = 'exam';
        console.log('[openExamEditor] 正在加载考试数据...');
        paperQuestions = await editorAdapter.exam.load(examId);
        console.log('[openExamEditor] 加载完成, 题目数:', paperQuestions.length);
        toggleExamListViews(true);

        var tabContent = document.getElementById('tab-exam-schedule');
        console.log('[openExamEditor] tab-exam-schedule:', !!tabContent);
        if (tabContent) {
          console.log('[openExamEditor] tab display:', tabContent.style.display, 'hidden:', tabContent.classList.contains('hidden'));
        }
        // 确保 container 在正确的 tab 中（可能之前被试卷编辑器创建在了 paper-mgmt tab）
        var container = document.getElementById('unifiedEditorContainer');
        if (container && container.parentElement && container.parentElement.id !== 'tab-exam-schedule') {
          console.log('[openExamEditor] container 在错误的 tab 中, 当前父:', container.parentElement.id, '→ 移动到 exam-schedule');
          container.parentElement.removeChild(container);
          container = null;
        }
        if (!container) {
          container = document.createElement('div');
          container.id = 'unifiedEditorContainer';
          tabContent.appendChild(container);
          console.log('[openExamEditor] 创建了新 container');
        }
        container.style.display = 'block';
        container.classList.remove('hidden');
        renderUnifiedEditor();
        console.log('[openExamEditor] renderUnifiedEditor 完成, innerHTML长度:', container.innerHTML.length);
        // 诊断：如果容器为空，输出详细信息
        if (!container.innerHTML || container.innerHTML.length < 50) {
          console.error('[openExamEditor] 渲染内容为空! editorMode:', editorMode, 'editorAdapter[editorMode]:', !!editorAdapter[editorMode]);
          console.error('[openExamEditor] examEditorData:', examEditorData);
          console.error('[openExamEditor] paperQuestions.length:', paperQuestions.length);
          container.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;"><p style="font-size:16px;font-weight:600;">编辑器加载异常</p><p style="font-size:13px;color:#94a3b8;margin-top:8px;">请刷新页面重试，或查看控制台(F12)获取详细信息</p></div>';
        }
        enrichQuestionDetails();
        // 滚动到顶部确保编辑器可见
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        console.error('[openExamEditor] 打开考试编辑页失败:', e);
        toast('加载失败: ' + e.message, 'error');
        editorMode = null;
      }
    }

    // 统一关闭编辑器
    function closeUnifiedEditor() {
      var container = document.getElementById('unifiedEditorContainer');
      if (container) container.style.display = 'none';

      if (paperEditorReturnToPicker) {
        // 从试卷选择器进入的编辑流程：关闭行内编辑器并返回选择器
        const inlineModal = document.getElementById('inlinePaperEditorModal');
        if (inlineModal) {
          inlineModal.classList.add('hidden');
          inlineModal.classList.remove('flex');
        }
        // 将编辑器容器移回试卷管理 tab，避免影响原有试卷管理功能
        if (container) {
          container.parentElement.removeChild(container);
          document.getElementById('tab-paper-mgmt').appendChild(container);
        }
        const createdId = paperEditorCreatedPaperId;
        paperEditorReturnToPicker = false;
        paperEditorCreatedPaperId = null;
        editingPaperId = null;
        paperQuestions = [];
        editorMode = null;
        if (createdId) {
          // 重新打开试卷选择器并选中新试卷，恢复之前的回调
          openPaperPickerModal(paperPickerReturnCallback, createdId);
          paperPickerReturnCallback = null;
        }
        return;
      }

      if (editorMode === 'exam') {
        toggleExamListViews(false);
        examEditorData = null;
        loadExamMgmtList();
      } else if (editorMode === 'paper') {
        var listView = document.getElementById('paperListView');
        if (listView) listView.classList.remove('hidden');
        editingPaperId = null;
      }
      paperQuestions = [];
      editorMode = null;
    }
    // 兼容旧调用
    function closePaperEditor() { closeUnifiedEditor(); }

    // 异步补充题目详情（从题库获取选项、答案等）
    function enrichQuestionDetails() {
      fetch(API + '/questions?pageSize=9999')
        .then(function(res) { return res.json(); })
        .then(function(result) {
          var allQuestions = result.data || [];
          var updated = paperQuestions.map(function(pq) {
            var q = allQuestions.find(function(qq) { return qq.id === pq.questionId; });
            if (!q) return pq;
            return Object.assign({}, pq, {
              content: q.title || q.content || pq.content,
              type: q.type || pq.type,
              options: (q.options && q.options.length > 0) ? q.options : pq.options,
              answer: q.answer || pq.answer,
              explanation: q.explanation || pq.explanation
            });
          });
          var changed = updated.some(function(u, i) {
            return u.content !== paperQuestions[i].content || u.type !== paperQuestions[i].type ||
              (u.options || []).length !== (paperQuestions[i].options || []).length || u.answer !== paperQuestions[i].answer;
          });
          if (changed) { paperQuestions = updated; renderUnifiedEditor(); }
        })
        .catch(function(err) { console.warn('[UnifiedEditor] 题库详情补充加载失败（非致命）:', err); });
    }

    function renderUnifiedEditor() {
      var container = document.getElementById('unifiedEditorContainer');
      if (!container) return;
      var adapter = editorAdapter[editorMode];
      if (!adapter) return;
      var title = adapter.getTitle();
      var totalScore = paperQuestions.reduce(function(s, q) { return s + (q.score || 0); }, 0);
      var qCount = paperQuestions.length;
      var typeNames = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };
      var typeColors = { single: 'bg-blue-100 text-blue-700', multiple: 'bg-purple-100 text-purple-700', judge: 'bg-amber-100 text-amber-700', fill: 'bg-emerald-100 text-emerald-700', essay: 'bg-rose-100 text-rose-700' };
      var optLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      var isPaper = editorMode === 'paper';

      // 试卷模式：获取分类名
      var categoryBadge = '';
      if (isPaper) {
        var paper = papersAllData.find(function(p) { return p.id === editingPaperId; });
        if (paper) {
          var catName = paper.categoryName || paper.category || '';
          if (/^\d+$/.test(catName) || !catName) {
            var cat = (data.categories || []).find(function(c) { return String(c.id) === String(paper.category || paper.categoryId); });
            catName = cat ? cat.name : (paper.categoryName || paper.category || '未分类');
          }
          categoryBadge = '<span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">' + escHtml(catName || '未分类') + '</span>';
        }
      }

      // 渲染所有题目卡片
      var allQuestionsHtml = '';
      if (qCount === 0) {
        allQuestionsHtml = '<div class="text-center py-20 text-slate-400"><i class="fas fa-inbox text-5xl mb-4 block opacity-30"></i><p class="text-lg">暂无题目</p><p class="text-sm mt-2">请从左侧点击"题库选题"添加试题</p></div>';
      } else {
        for (var qi = 0; qi < paperQuestions.length; qi++) {
          var q = paperQuestions[qi];
          var options = q.options || [];
          var answer = q.answer;
          var score = q.score || 1;
          var answerArr = Array.isArray(answer) ? answer : (answer != null ? [String(answer)] : []);

          allQuestionsHtml += '<div id="exam-question-' + qi + '" class="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5 mb-4 group hover:border-indigo-200 transition">';
          // 题目头部
          allQuestionsHtml += '<div class="flex items-start gap-3">';
          // 序号徽章
          allQuestionsHtml += '<div class="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 flex items-center justify-center text-sm font-bold">' + (qi + 1) + '</div>';
          // 题目内容区
          allQuestionsHtml += '<div class="flex-1 min-w-0">';
          allQuestionsHtml += '<div class="flex items-center gap-2 flex-wrap mb-2">';
          allQuestionsHtml += '<span class="px-2 py-0.5 text-xs rounded-full font-medium ' + (typeColors[q.type] || 'bg-slate-100 text-slate-600') + '">' + (typeNames[q.type] || q.type) + '</span>';
          allQuestionsHtml += '<span class="font-medium text-slate-800 text-sm">' + escHtml(q.content || '(无标题)') + '</span>';
          allQuestionsHtml += '<span class="text-slate-400 text-xs ml-1">（' + score + ' 分）</span>';
          allQuestionsHtml += '</div>';

          // 选项渲染（单选/多选）
          if (options.length > 0 && (q.type === 'single' || q.type === 'multiple')) {
            allQuestionsHtml += '<div class="space-y-2 mt-2">';
            for (var oi = 0; oi < options.length; oi++) {
              var letter = String.fromCharCode(65 + oi);
              var isCorrect = answerArr.indexOf(letter) !== -1;
              var optBg = isCorrect ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600';
              var badgeBg = isCorrect ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600';
              allQuestionsHtml += '<div class="flex items-center gap-3 p-2.5 rounded-lg border ' + optBg + ' text-sm">';
              allQuestionsHtml += '<span class="font-bold flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ' + badgeBg + ' text-xs">' + letter + '</span>';
              allQuestionsHtml += '<span class="flex-1">' + escHtml(options[oi]) + '</span>';
              if (isCorrect) allQuestionsHtml += '<i class="fas fa-check-circle text-indigo-500"></i>';
              allQuestionsHtml += '</div>';
            }
            allQuestionsHtml += '</div>';
          } else if (q.type === 'judge') {
            var judgeAnswer = String(answer);
            allQuestionsHtml += '<div class="space-y-1.5 mt-2">';
            allQuestionsHtml += '<div class="p-2.5 rounded-lg border text-sm ' + (judgeAnswer === 'true' || judgeAnswer === '1' || judgeAnswer === '正确' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500') + '"><i class="fas fa-check mr-2"></i>正确</div>';
            allQuestionsHtml += '<div class="p-2.5 rounded-lg border text-sm ' + (judgeAnswer === 'false' || judgeAnswer === '0' || judgeAnswer === '错误' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500') + '"><i class="fas fa-times mr-2"></i>错误</div>';
            allQuestionsHtml += '</div>';
          } else if (q.type === 'fill') {
            allQuestionsHtml += '<div class="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm"><strong>参考答案：</strong>' + escHtml(Array.isArray(answer) ? answer.join(', ') : String(answer || '')) + '</div>';
          } else if (q.type === 'essay') {
            allQuestionsHtml += '<div class="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm"><strong>参考答案：</strong><br>' + escHtml(String(answer || '')) + '</div>';
          }

          allQuestionsHtml += '</div>'; // end content area

          // 操作控件（分值、上移、下移、删除）
          allQuestionsHtml += '<div class="flex items-center gap-2 flex-shrink-0 ml-2">';
          allQuestionsHtml += '<div class="flex items-center gap-1"><span class="text-xs text-slate-400">分值</span>';
          allQuestionsHtml += '<input type="number" value="' + (q.score || '') + '" min="0" max="100" onchange="updatePaperQuestionScore(' + qi + ', this.value)" class="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="分值"></div>';
          allQuestionsHtml += '<button type="button" onclick="movePaperQuestion(' + qi + ', -1)" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition" title="上移"' + (qi === 0 ? ' disabled style="pointer-events:none;opacity:0.3"' : '') + '><i class="fas fa-chevron-up text-xs"></i></button>';
          allQuestionsHtml += '<button type="button" onclick="movePaperQuestion(' + qi + ', 1)" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition" title="下移"' + (qi === qCount - 1 ? ' disabled style="pointer-events:none;opacity:0.3"' : '') + '><i class="fas fa-chevron-down text-xs"></i></button>';
          allQuestionsHtml += '<button type="button" onclick="removePaperQuestion(' + qi + ')" class="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="删除"><i class="fas fa-trash-alt text-xs"></i></button>';
          allQuestionsHtml += '</div>';

          allQuestionsHtml += '</div>'; // end flex items-start
          allQuestionsHtml += '</div>'; // end question card
        }
      }

      // 题号按钮
      var numButtons = '';
      for (var i = 0; i < qCount; i++) {
        numButtons += '<button onclick="scrollToExamQuestion(' + i + ')" class="w-10 h-10 rounded-lg text-sm font-medium transition hover:bg-indigo-100 hover:text-indigo-600 bg-slate-100 text-slate-600">' + (i + 1) + '</button>';
      }

      // 导入按钮：考试模式用 examImportModal，试卷模式用 paperImportQuestionsModal
      var importOnclick = isPaper ? 'openPaperImportQuestionsModal()' : 'openExamEditorImport()';
      // 选题按钮
      var pickOnclick = 'openPaperQuestionPicker()';
      // 设置按钮
      var settingsOnclick = 'openScoreSettingsModal()';

      // 顶栏右侧按钮
      var topRightBtns = '';
      topRightBtns += '<div class="flex items-center gap-1.5 px-3 py-2 bg-slate-100 rounded-full text-sm">';
      topRightBtns += '<span class="text-slate-400">总分：</span><span class="font-semibold text-slate-700" id="ueTotalScore">' + totalScore.toFixed(1) + '</span>';
      topRightBtns += '<span class="text-slate-300 mx-1">|</span>';
      topRightBtns += '<span class="text-slate-400">试题：</span><span class="font-semibold text-slate-700" id="ueQCount">' + qCount + '</span>';
      topRightBtns += '</div>';

      if (isPaper) {
        topRightBtns += '<button onclick="openPaperInfoDrawer()" class="px-4 py-2 text-sm text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"><i class="fas fa-cog mr-1.5"></i>设置</button>';
        var pubDisabled = qCount === 0 ? ' disabled' : '';
        var pubClass = qCount > 0 ? 'btn-primary px-4 py-2 text-sm text-white rounded-lg font-medium shadow-sm hover:shadow-md transition' : 'px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-400 font-medium transition';
        topRightBtns += '<button onclick="publishPaper()" id="pePublishBtn" class="' + pubClass + '"' + pubDisabled + '><i class="fas fa-paper-plane mr-1.5"></i>发布</button>';
      } else {
        topRightBtns += '<button onclick="' + settingsOnclick + '" class="px-4 py-2 text-sm text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition border border-slate-200"><i class="fas fa-cog mr-1.5"></i>设置</button>';
        topRightBtns += '<button onclick="saveUnifiedEditor()" class="px-5 py-2 text-sm bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600 transition shadow-sm"><i class="fas fa-check mr-1.5"></i>更新</button>';
      }

      // 试卷模式：信息抽屉 HTML
      var drawerHtml = '';
      if (isPaper) {
        var paper = papersAllData.find(function(p) { return p.id === editingPaperId; });
        drawerHtml = ''
          + '<div id="paperInfoDrawerOverlay" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] hidden transition-opacity" onclick="closePaperInfoDrawer()"></div>'
          + '<div id="paperInfoDrawer" class="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[80] transform translate-x-full transition-transform duration-300 flex flex-col">'
          + '  <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">'
          + '    <h3 class="text-lg font-bold text-slate-800"><i class="fas fa-cog text-indigo-500 mr-2"></i>试卷信息</h3>'
          + '    <button onclick="closePaperInfoDrawer()" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"><i class="fas fa-times"></i></button>'
          + '  </div>'
          + '  <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">'
          + '    <div><label class="block text-sm font-medium text-slate-700 mb-1.5">试卷名称 <span class="text-red-500">*</span></label>'
          + '    <input type="text" id="peName" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm" placeholder="请输入试卷名称" value="' + escHtml(paper ? paper.name : '') + '"></div>'
          + '    <div><label class="block text-sm font-medium text-slate-700 mb-1.5">试卷分类</label>'
          + '    <select id="peCategoryInput" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm bg-white"><option value="">请选择分类</option></select></div>'
          + '    <div><label class="block text-sm font-medium text-slate-700 mb-1.5">试卷类型</label>'
          + '    <select id="peType" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm bg-white">'
          + '      <option value="fixed"' + (paper && paper.type === 'fixed' ? ' selected' : '') + '>固定试卷</option>'
          + '      <option value="random"' + (paper && paper.type === 'random' ? ' selected' : '') + '>随机试卷</option>'
          + '    </select></div>'
          + '    <div><label class="block text-sm font-medium text-slate-700 mb-1.5">试卷说明</label>'
          + '    <textarea id="peDescInput" rows="3" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm resize-none" placeholder="请输入试卷说明...">' + escHtml(paper ? paper.description || '' : '') + '</textarea></div>'
          + '    <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-700 flex items-start gap-2">'
          + '      <i class="fas fa-info-circle mt-0.5"></i>'
          + '      <p>考试时长与及格分请在"考试安排"中设置，此处不再重复配置。</p>'
          + '    </div>'
          + '  </div>'
          + '  <div class="px-6 py-4 border-t border-slate-100 flex-shrink-0 flex gap-3">'
          + '    <button onclick="closePaperInfoDrawer()" class="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">取消</button>'
          + '    <button onclick="savePaperInfoFromDrawer()" class="flex-1 py-2.5 btn-primary text-white rounded-xl text-sm font-medium shadow-sm hover:shadow-md transition"><i class="fas fa-check mr-1.5"></i>保存</button>'
          + '  </div>'
          + '</div>';

        // 填充分类下拉（延迟到 DOM 渲染后）
        setTimeout(function() {
          if (typeof fillCategorySelect === 'function') fillCategorySelect('peCategoryInput');
          var catId = paper ? (paper.categoryId || paper.category || '') : '';
          var sel = document.getElementById('peCategoryInput');
          if (sel) sel.value = catId;
        }, 50);
      }

      // 构建完整 HTML
      var html = '';
      html += '<div style="display:flex;flex-direction:column;">';
      // 粘性顶栏
      html += '<div style="background:#fff;border-bottom:1px solid #e2e8f0;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;">';
      html += '  <div style="display:flex;align-items:center;gap:16px;flex:1;">';
      html += '    <button onclick="closeUnifiedEditor()" style="display:flex;align-items:center;gap:6px;font-size:14px;color:#64748b;background:none;border:none;cursor:pointer;padding:6px 12px;border-radius:8px;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-arrow-left"></i> 返回</button>';
      html += '    <div style="width:1px;height:24px;background:#e2e8f0;"></div>';
      html += '    <div>';
      html += '      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0;">' + escHtml(title) + '</h2>';
      if (categoryBadge) {
        html += '      <div class="flex items-center gap-2 mt-1">' + categoryBadge + '</div>';
      }
      html += '    </div>';
      html += '  </div>';
      html += '  <div style="display:flex;align-items:center;gap:12px;">' + topRightBtns + '</div>';
      html += '</div>';
      // 内容区：侧栏 + 题目列表
      html += '<div style="display:flex;padding:24px;gap:24px;max-width:1200px;width:100%;margin:0 auto;">';
      // 左侧栏
      html += '  <div style="width:220px;flex-shrink:0;">';
      html += '    <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:20px;position:sticky;top:80px;">';
      html += '      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
      html += '        <h4 style="font-size:14px;font-weight:600;color:#334155;margin:0;">试题列表 (' + qCount + ')</h4>';
      html += '        <button onclick="' + settingsOnclick + '" style="font-size:12px;color:#6366f1;background:none;border:none;cursor:pointer;"><i class="fas fa-sliders-h" style="margin-right:4px;"></i>分数设置</button>';
      html += '      </div>';
      html += '      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px;max-height:200px;overflow-y:auto;">' + numButtons + '</div>';
      html += '      <div style="display:flex;flex-direction:column;gap:8px;">';
      html += '        <button onclick="' + pickOnclick + '" style="width:100%;padding:10px;font-size:13px;border:1px solid #c7d2fe;color:#4f46e5;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;" onmouseover="this.style.background=\'#eef2ff\'" onmouseout="this.style.background=\'#fff\'"><i class="fas fa-plus" style="margin-right:6px;"></i>题库选题</button>';
      html += '        <button onclick="' + importOnclick + '" style="width:100%;padding:10px;font-size:13px;border:1px solid #e2e8f0;color:#64748b;border-radius:8px;background:#fff;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'#fff\'"><i class="fas fa-file-import" style="margin-right:6px;"></i>导入试题</button>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      // 主内容区
      html += '  <div style="flex:1;min-width:0;">' + allQuestionsHtml + '</div>';
      html += '</div>';
      html += '</div>';
      // 抽屉（仅试卷模式）
      html += drawerHtml;

      container.innerHTML = html;
    }

    function saveUnifiedEditor() {
      if (!editorMode || !editorAdapter[editorMode]) return;
      editorAdapter[editorMode].save(paperQuestions).then(function() {
        toast(editorMode === 'exam' ? '更新成功' : '保存成功');
      }).catch(function() {
        toast('保存失败', 'error');
      });
    }

    function scrollToExamQuestion(idx) {
      var el = document.getElementById('exam-question-' + idx);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function openExamEditorImport() {
      var fileInput = document.getElementById('examImportFile');
      if (fileInput) fileInput.value = '';
      var modal = document.getElementById('examImportModal');
      if (!modal) return;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeExamImportModal() {
      var modal = document.getElementById('examImportModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    async function doExamImport() {
      var file = document.getElementById('examImportFile').files[0];
      if (!file) return toast('请选择Excel文件', 'warning');
      if (editorMode === 'exam' && !examEditorData) return toast('考试数据丢失，请重新打开', 'error');

      var formData = new FormData();
      formData.append('file', file);
      formData.append('bankId', '0');

      try {
        var res = await fetch('/api/questions/import', { method: 'POST', body: formData });
        var result = await res.json();
        if (result.success) {
          closeExamImportModal();
          toast('导入完成：成功 ' + result.imported + ' 题' + (result.failed ? '，失败 ' + result.failed + ' 题' : ''));
          var importedQuestions = result.importedData || [];
          importedQuestions.forEach(function(q) {
            paperQuestions.push({
              questionId: q.id,
              score: q.score || 5,
              order: paperQuestions.length,
              content: q.title || q.content || '(导入题目)',
              type: q.type || 'single',
              options: q.options || [],
              answer: q.answer || '',
              explanation: q.explanation || ''
            });
          });
          renderUnifiedEditor();
        } else {
          toast(result.error || '导入失败', 'error');
        }
      } catch (e) {
        toast('导入失败: ' + e.message, 'error');
      }
    }

    function goExamPage(page) {
      if (page < 1 || page > examTotalPages) return;
      examCurrentPage = page;
      renderExamMgmtList();
    }

    function onExamPageSizeChange() {
      examPageSize = parseInt(document.getElementById('examPageSize').value) || 10;
      examCurrentPage = 1;
      renderExamMgmtList();
    }

    function onExamSearch() {
      clearTimeout(examSearchTimer);
      examSearchTimer = setTimeout(() => renderExamMgmtList(), 250);
    }
    function onExamFilterChange() { renderExamMgmtList(); }
    function resetExamFilters() {
      document.getElementById('examSearchInput').value = '';
      document.getElementById('examFilterStatus').value = 'all';
      renderExamMgmtList();
    }
    function toggleExamSelect(id) {
      const sid = String(id);
      if (examSelectedIds.has(sid)) examSelectedIds.delete(sid); else examSelectedIds.add(sid);
      updateExamSelectAllState();
      updateExamBatchActionBar();
    }
    function toggleExamSelectAll() {
      const checked = document.getElementById('examSelectAll').checked;
      const visible = applyExamFilters();
      if (checked) visible.forEach(e => examSelectedIds.add(String(e.id)));
      else visible.forEach(e => examSelectedIds.delete(String(e.id)));
      renderExamMgmtList();
      updateExamBatchActionBar();
    }

    function updateExamSelectAllState() {
      const visible = applyExamFilters();
      const allChecked = visible.length > 0 && visible.every(e => examSelectedIds.has(String(e.id)));
      const el = document.getElementById('examSelectAll');
      if (el) el.checked = allChecked;
    }

    function updateExamBatchActionBar() {
      const bar = document.getElementById('examBatchActionBar');
      const count = document.getElementById('examBatchCount');
      if (!bar || !count) return;
      if (examSelectedIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = `已选 ${examSelectedIds.size} 项`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function clearExamSelection() {
      examSelectedIds.clear();
      document.getElementById('examSelectAll').checked = false;
      renderExamMgmtList();
      updateExamBatchActionBar();
    }

    async function batchDeleteExams() {
      if (examSelectedIds.size === 0) return;
      if (!confirm(`确定删除选中的 ${examSelectedIds.size} 场考试吗？此操作不可恢复。`)) return;
      let success = 0, failed = 0;
      for (const id of examSelectedIds) {
        try {
          const res = await fetch('/api/exams/' + id, { method: 'DELETE' });
          if (res.ok) success++; else failed++;
        } catch (e) { failed++; }
      }
      toast(`批量删除完成：成功 ${success} 场，失败 ${failed} 场`);
      clearExamSelection();
      loadExamMgmtList();
    }

    async function batchPublishExams() {
      if (examSelectedIds.size === 0) return;
      if (!confirm(`确定发布选中的 ${examSelectedIds.size} 场考试吗？`)) return;
      let success = 0, failed = 0;
      for (const id of examSelectedIds) {
        try {
          const res = await fetch('/api/exams/' + id + '/status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }) });
          if (res.ok) success++; else failed++;
        } catch (e) { failed++; }
      }
      toast(`批量发布完成：成功 ${success} 场，失败 ${failed} 场`);
      clearExamSelection();
      loadExamMgmtList();
    }

    async function batchCloseExams() {
      if (examSelectedIds.size === 0) return;
      if (!confirm(`确定结束选中的 ${examSelectedIds.size} 场考试吗？`)) return;
      let success = 0, failed = 0;
      for (const id of examSelectedIds) {
        try {
          const res = await fetch('/api/exams/' + id + '/status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'closed' }) });
          if (res.ok) success++; else failed++;
        } catch (e) { failed++; }
      }
      toast(`批量结束完成：成功 ${success} 场，失败 ${failed} 场`);
      clearExamSelection();
      loadExamMgmtList();
    }

    let examUserPickerData = [];
    let examUserPickerTemp = new Set();

    function toggleBtn(btn) {
      const group = btn.getAttribute('data-group');
      const buttons = document.querySelectorAll(`.btn-toggle[data-group="${group}"]`);
      buttons.forEach(b => {
        b.classList.remove('bg-indigo-500', 'text-white');
        b.classList.add('bg-white', 'text-slate-600');
      });
      btn.classList.remove('bg-white', 'text-slate-600');
      btn.classList.add('bg-indigo-500', 'text-white');
      // 处理自定义输入框显示/隐藏
      if (group === 'examAttempts') {
        const customInput = document.getElementById('examAttemptsCustom');
        if (btn.getAttribute('data-value') === 'custom') {
          customInput.classList.remove('hidden');
        } else {
          customInput.classList.add('hidden');
        }
      } else if (group === 'examScreenSwitch') {
        const customInput = document.getElementById('examScreenSwitchCustom');
        if (btn.getAttribute('data-value') === 'custom') {
          customInput.classList.remove('hidden');
        } else {
          customInput.classList.add('hidden');
        }
      }
    }

    function toggleSwitch(name) {
      const checkbox = document.getElementById('examShowData');
      const toggle = document.getElementById('examDataToggle');
      const dot = document.getElementById('examDataDot');
      const label = document.getElementById('examDataLabel');
      if (checkbox.checked) {
        toggle.classList.remove('bg-slate-300');
        toggle.classList.add('bg-indigo-500');
        dot.style.left = '20px';
        label.textContent = '显示';
      } else {
        toggle.classList.remove('bg-indigo-500');
        toggle.classList.add('bg-slate-300');
        dot.style.left = '2px';
        label.textContent = '隐藏';
      }
    }

    function getBtnGroupValue(group) {
      const active = document.querySelector(`.btn-toggle[data-group="${group}"].bg-indigo-500`);
      return active ? active.getAttribute('data-value') : null;
    }

    function setBtnGroupValue(group, value) {
      const buttons = document.querySelectorAll(`.btn-toggle[data-group="${group}"]`);
      buttons.forEach(b => {
        if (b.getAttribute('data-value') === value) {
          b.classList.remove('bg-white', 'text-slate-600');
          b.classList.add('bg-indigo-500', 'text-white');
        } else {
          b.classList.remove('bg-indigo-500', 'text-white');
          b.classList.add('bg-white', 'text-slate-600');
        }
      });
    }

    let userPickerMode = 'exam'; // 'exam' / 'assign' / 'training'

    async function openExamUserPicker(mode) {
      const pickerMode = mode || 'exam';
      userPickerMode = pickerMode;
      const initialSelected = pickerMode === 'assign'
        ? Array.from(assignExamUserPickerTemp)
        : Array.from(examUserPickerTemp);
      await openUnifiedAssignPicker({
        mode: pickerMode,
        title: '选择学员',
        subtitle: pickerMode === 'assign' ? '指派参加考试的学员' : '指定可参加考试的学员',
        initialSelected,
        onConfirm: () => {
          if (pickerMode === 'assign') {
            assignExamUserPickerTemp = new Set(unifiedAssignState.selected);
            renderExamAllowedUsers();
          } else {
            examUserPickerTemp = new Set(unifiedAssignState.selected);
            renderExamAllowedUsers();
          }
        }
      });
    }

    async function loadExamUserPickerData() {
      try {
        const res = await fetch('/api/data/users');
        const users = await res.json();
        let targetData, targetTemp;
        if (userPickerMode === 'assign') {
          targetData = assignExamUserPickerData;
          targetTemp = assignExamUserPickerTemp;
        } else if (userPickerMode === 'training') {
          targetData = trainingUserPickerData;
          targetTemp = trainingUserPickerTemp;
        } else {
          targetData = examUserPickerData;
          targetTemp = examUserPickerTemp;
        }

        targetData.length = 0;
        users.forEach(u => {
          const uid = u.id;
          const selected = targetTemp.has(uid) || targetTemp.has(String(uid)) || targetTemp.has(Number(uid));
          targetData.push({
            id: uid,
            name: u.real_name || u.username || '未知',
            avatar: u.avatar || '',
            selected: selected
          });
        });
      } catch (e) {
        if (userPickerMode === 'assign') assignExamUserPickerData = [];
        else if (userPickerMode === 'training') trainingUserPickerData = [];
        else examUserPickerData = [];
      }
    }

    function renderExamAllowedUsers() {
      const sourceData = userPickerMode === 'assign' ? assignExamUserPickerData : examUserPickerData;
      const countId = userPickerMode === 'assign' ? 'assignAllowedUsersCount' : 'examAllowedUsersCount';
      const listId = userPickerMode === 'assign' ? 'assignAllowedUsersList' : 'examAllowedUsersList';

      const selected = sourceData.filter(u => u.selected);
      const count = document.getElementById(countId);
      const list = document.getElementById(listId);
      if (count) count.textContent = selected.length;
      if (list) {
        if (selected.length === 0) {
          list.innerHTML = '<p class="text-sm text-slate-400 w-full">未选择学员</p>';
        } else {
          list.innerHTML = selected.map(u => `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs">
              ${escHtml(u.name)}
              <button type="button" onclick="removeExamAllowedUser('${u.id}')" class="text-indigo-400 hover:text-red-500">&times;</button>
            </span>
          `).join('');
        }
      }
    }

    function removeExamAllowedUser(id) {
      const sourceData = userPickerMode === 'assign' ? assignExamUserPickerData : examUserPickerData;
      const targetTemp = userPickerMode === 'assign' ? assignExamUserPickerTemp : examUserPickerTemp;
      const sid = String(id);
      const user = sourceData.find(u => String(u.id) === sid);
      if (user) user.selected = false;
      targetTemp.delete(id);
      targetTemp.delete(sid);
      targetTemp.delete(Number(id));
      renderExamAllowedUsers();
    }

    function openExamModal(id = null) {
      editingExamId = id;
      selectedExamQuestions = [];
      pendingExamStatus = 'draft';
      document.getElementById('examId').value = id || '';
      document.getElementById('examModalTitle').textContent = id ? '编辑考试' : '创建考试';
      document.getElementById('examTitle').value = '';
      document.getElementById('examDesc').value = '';
      document.getElementById('examDuration').value = '60';
      document.getElementById('examPassingScore').value = '60';
      var _maxAttempts = document.getElementById('examMaxAttempts'); if (_maxAttempts) _maxAttempts.value = '0';
      document.getElementById('examPaperId').value = '';
      // 重置考试设置
      setBtnGroupValue('examAttempts', 'unlimited');
      var _attemptsCustom = document.getElementById('examAttemptsCustom'); if (_attemptsCustom) { _attemptsCustom.classList.add('hidden'); _attemptsCustom.value = '3'; }
      setBtnGroupValue('examRecordScore', 'highest');
      setBtnGroupValue('examScreenSwitch', 'unlimited');
      var _switchCustom = document.getElementById('examScreenSwitchCustom'); if (_switchCustom) { _switchCustom.classList.add('hidden'); _switchCustom.value = '3'; }
      var _shuffleQ = document.getElementById('examShuffleQuestions'); if (_shuffleQ) _shuffleQ.checked = false;
      var _shuffleO = document.getElementById('examShuffleOptions'); if (_shuffleO) _shuffleO.checked = false;
      // 重置学员查看设置
      var _showData = document.getElementById('examShowData'); if (_showData) _showData.checked = true;
      var _dataLabel = document.getElementById('examDataLabel'); if (_dataLabel) _dataLabel.textContent = '显示';
      var _dataToggle = document.getElementById('examDataToggle');
      if (_dataToggle) { _dataToggle.classList.remove('bg-slate-300'); _dataToggle.classList.add('bg-indigo-500'); }
      var _dataDot = document.getElementById('examDataDot'); if (_dataDot) _dataDot.style.left = '20px';
      setBtnGroupValue('examAnswerDetail', 'after_grade');
      setBtnGroupValue('examViewQuestions', 'all');
      setBtnGroupValue('examShowCorrect', 'show');
      setBtnGroupValue('examShowAnalysis', 'show');
      setBtnGroupValue('examViewRank', 'after_submit');
      renderSelectedQuestions();
      // 加载试卷下拉
      loadExamPaperOptions();
      // 重置并加载证书下拉
      document.getElementById('examCertificateId').value = '';
      refreshExamCertificateOptions();
      document.getElementById('examDrawerOverlay').classList.remove('hidden');
      document.getElementById('examModal').classList.remove('translate-x-full');
      if (id) loadExamForEdit(id);
    }

    // 加载试卷显示文本
    async function loadExamPaperOptions() {
      const paperId = document.getElementById('examPaperId').value;
      renderExamPaperDisplay(paperId);
    }

    function renderExamPaperDisplay(paperId) {
      const display = document.getElementById('exam-paper-display');
      if (!display) return;
      if (!paperId) {
        display.textContent = '请选择试卷';
        display.className = 'text-sm text-slate-500 truncate';
        return;
      }
      try {
        let papers = papersAllData;
        const paper = papers.find(p => String(p.id) === String(paperId));
        if (paper) {
          const qCount = (paper.questions || []).length;
          display.textContent = paper.name + (qCount ? ` (${qCount}题)` : '');
          display.className = 'text-sm text-slate-800 truncate';
        } else {
          display.textContent = '试卷不存在';
          display.className = 'text-sm text-red-500 truncate';
        }
      } catch(e) { console.error('加载试卷显示失败:', e); }
    }

    function openExamPaperPicker() {
      const currentId = document.getElementById('examPaperId').value || null;
      openPaperPickerModal((paper) => {
        document.getElementById('examPaperId').value = paper.id;
        renderExamPaperDisplay(paper.id);
        onExamPaperChange();
      }, currentId);
    }

    // 试卷变更时自动加载题目
    async function onExamPaperChange() {
      const paperId = document.getElementById('examPaperId').value;
      if (!paperId) {
        selectedExamQuestions = [];
        renderSelectedQuestions();
        return;
      }
      try {
        let paper = papersAllData.find(p => p.id === paperId);
        // 自动填充考试名称为试卷名称
        if (paper && !document.getElementById('examTitle').value.trim()) {
          document.getElementById('examTitle').value = paper.name;
        }
        if (paper && paper.questions) {
          // 从题库中加载题目详情（支持数字/字符串ID兼容匹配 + 服务端fallback）
          let allQuestions = [];
          if (window.dataSync && window.dataSync.getData) {
            allQuestions = window.dataSync.getData('questions') || [];
          } else {
            allQuestions = safeParse('questions', []);
          }
          // 如果本地题库为空，尝试从服务端实时拉取
          if (!allQuestions.length) {
            try {
              const res = await fetch('/api/data/questions');
              if (res.ok) allQuestions = await res.json();
            } catch(e) { /* 静默失败 */ }
          }
          selectedExamQuestions = paper.questions.map((pq, idx) => {
            // 宽松匹配：先严格 ===，再宽松 ==（覆盖数字/字符串ID混用场景）
            let q = allQuestions.find(qq => qq.id === pq.questionId);
            if (!q) q = allQuestions.find(qq => qq.id == pq.questionId);
            if (!q) q = allQuestions.find(qq => String(qq.id) === String(pq.questionId));
            return {
              questionId: pq.questionId,
              score: pq.score || 5,
              partialScore: pq.partialScore !== undefined ? pq.partialScore : (q && q.type === 'multiple' ? 0 : undefined),
              order: idx,
              content: q ? (q.title || q.content) : '(题目未找到)',
              type: q ? q.type : 'single'
            };
          });
          // 自动计算总分（用于保存时传递）
          const totalScore = selectedExamQuestions.reduce((s, q) => s + (q.score || 0), 0);
          renderSelectedQuestions();
        }
      } catch(e) { console.error('加载试卷题目失败:', e); }
    }

    function closeExamModal() {
      document.getElementById('examDrawerOverlay').classList.add('hidden');
      document.getElementById('examModal').classList.add('translate-x-full');
      editingExamId = null;
      selectedExamQuestions = [];
      // 恢复任务指派区块显示（从培训模块打开时隐藏过）
      const assignSection = document.getElementById('examAssignmentSection');
      if (assignSection) assignSection.style.display = '';
      // 恢复发布按钮文字（从培训模块打开时改成了"设置成功"）
      const publishBtn = document.querySelector('button[onclick="saveExamAsPublished()"]');
      if (publishBtn) {
        publishBtn.innerHTML = '<i class="fas fa-paper-plane mr-1.5"></i>发布';
      }
      // 恢复"存草稿"按钮显示（从培训模块打开时隐藏过）
      const draftBtn = document.querySelector('button[onclick="saveExamAsDraft()"]');
      if (draftBtn) draftBtn.style.display = '';
      // 从培训模块打开但未创建考试 → 回退 toggle 状态
      if (examModalFromTraining) {
        const examIdInput = document.getElementById('t-exam-id');
        if (!examIdInput || !examIdInput.value) {
          const toggle = document.getElementById('t-exam-enable');
          if (toggle) { toggle.checked = false; updateModuleCardVisual('exam', false); }
        }
      }
      examModalFromTraining = false;
    }

    // ========== 考试证书选择联动 ==========
    async function refreshExamCertificateOptions(selectedId) {
      const select = document.getElementById('examCertificateSelect');
      const hidden = document.getElementById('examCertificateId');
      if (!select) return;
      try {
        const res = await fetch('/api/certificates', { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') } });
        const result = await res.json();
        const certs = result.data || [];
        select.innerHTML = '<option value="">不颁发证书</option>' +
          certs.filter(c => c.status === 'enabled').map(c =>
            `<option value="${escHtml(String(c.id))}">${escHtml(c.name)}</option>`
          ).join('');
        const targetId = selectedId || (hidden ? hidden.value : '');
        if (targetId) {
          select.value = targetId;
          if (hidden && !selectedId) hidden.value = targetId;
        }
        if (hidden) hidden.value = select.value;
      } catch (e) {
        console.error('加载证书列表失败:', e);
      }
    }

    (function initExamCertificateSelect() {
      const select = document.getElementById('examCertificateSelect');
      const hidden = document.getElementById('examCertificateId');
      if (select && hidden) {
        select.addEventListener('change', function() {
          hidden.value = select.value;
        });
      }
    })();

    // ========== 考试抽屉 - 任务指派 ==========
    let assignExamUserPickerData = [];
    let assignExamUserPickerTemp = new Set();

    function onExamAccessTypeChange() {
      const accessType = document.getElementById('examAccessType').value;
      document.getElementById('examAllowedUsersContainer').classList.toggle('hidden', accessType !== 'restricted' && accessType !== 'import');
      document.getElementById('examImportUsersContainer').classList.toggle('hidden', accessType !== 'import');
    }

    async function onExamImportUsersFile() {
      const input = document.getElementById('examImportUsersFile');
      const resultEl = document.getElementById('examImportUsersResult');
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      try {
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const names = [];
        rows.forEach(row => {
          row.forEach(cell => {
            const v = cell !== undefined && cell !== null ? String(cell).trim() : '';
            if (v) names.push(v);
          });
        });
        if (!names.length) {
          resultEl.innerHTML = '<p class="text-xs text-red-500">未读取到任何姓名</p>';
          resultEl.classList.remove('hidden');
          return;
        }
        const res = await fetch('/api/data/users');
        const users = await res.json();
        const matched = [];
        const unmatched = [];
        const seen = new Set();
        names.forEach(name => {
          if (seen.has(name)) return;
          seen.add(name);
          const user = users.find(u => {
            const n = (u.real_name || u.username || '').trim();
            return n === name;
          });
          if (user) matched.push({ id: String(user.id), name: user.real_name || user.username });
          else unmatched.push(name);
        });
        matched.forEach(u => examUserPickerTemp.add(u.id));
        examUserPickerData.forEach(u => {
          u.selected = examUserPickerTemp.has(String(u.id));
        });
        renderExamAllowedUsers();
        let html = `<p class="text-xs text-emerald-600">成功导入 ${matched.length} 人</p>`;
        if (unmatched.length) {
          html += `<p class="text-xs text-amber-600 mt-0.5">未匹配 ${unmatched.length} 人：${escHtml(unmatched.slice(0, 5).join('、'))}${unmatched.length > 5 ? ' 等' : ''}</p>`;
        }
        resultEl.innerHTML = html;
        resultEl.classList.remove('hidden');
      } catch (e) {
        resultEl.innerHTML = '<p class="text-xs text-red-500">读取失败：' + escHtml(e.message) + '</p>';
        resultEl.classList.remove('hidden');
      }
    }

    // ========== 考试安排独立指派学员 ==========
    let currentAssignExamId = null;

    async function openExamAssignModal(examId) {
      currentAssignExamId = examId;
      userPickerMode = 'assign';
      assignExamUserPickerTemp = new Set();
      assignExamUserPickerData = [];
      document.getElementById('examAssignImportUsersResult').innerHTML = '';
      document.getElementById('examAssignImportUsersResult').classList.add('hidden');
      document.getElementById('examAssignImportUsersFile').value = '';

      try {
        const res = await fetch('/api/exams/' + examId);
        const result = await res.json();
        const exam = result.data || result.exam;
        if (exam) {
          document.getElementById('examAssignId').value = exam.id;
          document.getElementById('examAssignStartTime').value = exam.startTime ? toLocalDateTimeInput(exam.startTime) : '';
          document.getElementById('examAssignEndTime').value = exam.endTime ? toLocalDateTimeInput(exam.endTime) : '';
          let accessType = exam.accessType || 'none';
          if (accessType === 'open' || accessType === 'public') accessType = 'public';
          else if (accessType === 'restricted') accessType = (exam.allowedUsers && exam.allowedUsers.length) ? 'restricted' : 'none';
          else accessType = 'none';
          document.getElementById('examAssignAccessType').value = accessType;

          if (exam.allowedUsers && Array.isArray(exam.allowedUsers)) {
            assignExamUserPickerTemp = new Set(exam.allowedUsers.map(uid => String(uid)));
            const usersRes = await fetch('/api/data/users');
            const users = await usersRes.json();
            const userMap = new Map(users.map(u => [String(u.id), u.real_name || u.username || '未知']));
            assignExamUserPickerData = exam.allowedUsers.map(uId => ({
              id: uId,
              name: userMap.get(String(uId)) || ('学员' + uId),
              selected: true
            }));
          }
        }
      } catch (e) {
        console.error('加载考试指派数据失败', e);
      }

      onExamAssignAccessTypeChange();
      renderExamAllowedUsers();
      document.getElementById('examAssignDrawerOverlay').classList.remove('hidden');
      document.getElementById('examAssignModal').classList.remove('translate-x-full');
    }

    function closeExamAssignModal() {
      document.getElementById('examAssignDrawerOverlay').classList.add('hidden');
      document.getElementById('examAssignModal').classList.add('translate-x-full');
      currentAssignExamId = null;
    }

    function onExamAssignAccessTypeChange() {
      const accessType = document.getElementById('examAssignAccessType').value;
      document.getElementById('examAssignAllowedUsersContainer').classList.toggle('hidden', accessType !== 'restricted' && accessType !== 'import');
      document.getElementById('examAssignImportUsersContainer').classList.toggle('hidden', accessType !== 'import');
    }

    async function openExamAssignUserPicker() {
      userPickerMode = 'assign';
      await openUnifiedAssignPicker({
        mode: 'assign',
        targetId: currentAssignExamId,
        title: '选择学员',
        subtitle: '指派参加考试的学员',
        initialSelected: Array.from(assignExamUserPickerTemp),
        onConfirm: () => {
          assignExamUserPickerTemp = new Set(unifiedAssignState.selected);
          renderExamAllowedUsers();
        }
      });
    }

    async function onExamAssignImportUsersFile() {
      const input = document.getElementById('examAssignImportUsersFile');
      const resultEl = document.getElementById('examAssignImportUsersResult');
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      try {
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const names = [];
        rows.forEach(row => {
          row.forEach(cell => {
            const v = cell !== undefined && cell !== null ? String(cell).trim() : '';
            if (v) names.push(v);
          });
        });
        if (!names.length) {
          resultEl.innerHTML = '<p class="text-xs text-red-500">未读取到任何姓名</p>';
          resultEl.classList.remove('hidden');
          return;
        }
        const res = await fetch('/api/data/users');
        const users = await res.json();
        const matched = [];
        const unmatched = [];
        const seen = new Set();
        names.forEach(name => {
          if (seen.has(name)) return;
          seen.add(name);
          const user = users.find(u => {
            const n = (u.real_name || u.username || '').trim();
            return n === name;
          });
          if (user) matched.push({ id: String(user.id), name: user.real_name || user.username });
          else unmatched.push(name);
        });

        userPickerMode = 'assign';
        matched.forEach(u => {
          assignExamUserPickerTemp.add(u.id);
          if (!assignExamUserPickerData.find(x => String(x.id) === u.id)) {
            assignExamUserPickerData.push({ id: u.id, name: u.name, selected: true });
          }
        });
        assignExamUserPickerData.forEach(u => {
          u.selected = assignExamUserPickerTemp.has(String(u.id));
        });
        renderExamAllowedUsers();
        let html = `<p class="text-xs text-emerald-600">成功导入 ${matched.length} 人</p>`;
        if (unmatched.length) {
          html += `<p class="text-xs text-amber-600 mt-0.5">未匹配 ${unmatched.length} 人：${escHtml(unmatched.slice(0, 5).join('、'))}${unmatched.length > 5 ? ' 等' : ''}</p>`;
        }
        resultEl.innerHTML = html;
        resultEl.classList.remove('hidden');
      } catch (e) {
        resultEl.innerHTML = '<p class="text-xs text-red-500">读取失败：' + escHtml(e.message) + '</p>';
        resultEl.classList.remove('hidden');
      }
    }

    async function saveExamAssign() {
      if (!currentAssignExamId) return;
      const accessTypeRaw = document.getElementById('examAssignAccessType').value;
      const accessType = accessTypeRaw === 'import' ? 'restricted' : (accessTypeRaw || 'none');
      const startTime = document.getElementById('examAssignStartTime').value;
      const endTime = document.getElementById('examAssignEndTime').value;
      const allowedUsers = (accessTypeRaw === 'restricted' || accessTypeRaw === 'import')
        ? Array.from(assignExamUserPickerTemp).map(id => isNaN(Number(id)) ? id : Number(id))
        : [];

      const payload = {
        startTime: startTime ? new Date(startTime).toISOString() : null,
        endTime: endTime ? new Date(endTime).toISOString() : null,
        accessType: accessType,
        allowedUsers: allowedUsers.length ? allowedUsers : null
      };

      try {
        const res = await fetch('/api/exams/' + currentAssignExamId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          toast('指派已保存');
          closeExamAssignModal();
          loadExamMgmtList();
        } else {
          toast(result.error || '保存失败', 'error');
        }
      } catch (e) {
        toast('网络错误', 'error');
      }
    }

    async function loadExamForEdit(id) {
      try {
        const examRes = await fetch('/api/exams');
        const allExams = await examRes.json();
        const exam = allExams.find(e => e.id === id || e.id === Number(id) || String(e.id) === String(id));
        if (exam) {
          document.getElementById('examTitle').value = exam.title || '';
          document.getElementById('examDesc').value = exam.description || '';
          document.getElementById('examDuration').value = exam.duration || 60;
          document.getElementById('examPassingScore').value = exam.passingScore || 60;
          var _ma = document.getElementById('examMaxAttempts'); if (_ma) _ma.value = exam.maxAttempts || 0;
          var _sq = document.getElementById('examShuffleQuestions'); if (_sq) _sq.checked = !!exam.shuffleQuestions;
          // 恢复考试设置
          if (exam.attemptsPolicy) {
            setBtnGroupValue('examAttempts', exam.attemptsPolicy);
            var _ac = document.getElementById('examAttemptsCustom');
            if (_ac) {
              if (exam.attemptsPolicy === 'custom') {
                _ac.classList.remove('hidden');
                _ac.value = exam.attemptsCount || 3;
              } else {
                _ac.classList.add('hidden');
              }
            }
          }
          if (exam.recordScore) setBtnGroupValue('examRecordScore', exam.recordScore);
          if (exam.screenSwitchPolicy) {
            setBtnGroupValue('examScreenSwitch', exam.screenSwitchPolicy);
            var _sc = document.getElementById('examScreenSwitchCustom');
            if (_sc) {
              if (exam.screenSwitchPolicy === 'custom') {
                _sc.classList.remove('hidden');
                _sc.value = exam.screenSwitchCount || 3;
              } else {
                _sc.classList.add('hidden');
              }
            }
          }
          var _so = document.getElementById('examShuffleOptions'); if (_so) _so.checked = !!exam.shuffleOptions;
          // 恢复学员查看设置
          if (exam.showData !== undefined) {
            var _sd = document.getElementById('examShowData'); if (_sd) _sd.checked = !!exam.showData;
            var _dl = document.getElementById('examDataLabel'); if (_dl) _dl.textContent = exam.showData ? '显示' : '隐藏';
            var _dt = document.getElementById('examDataToggle');
            var _dd = document.getElementById('examDataDot');
            if (_dt) {
              if (exam.showData) {
                _dt.classList.remove('bg-slate-300');
                _dt.classList.add('bg-indigo-500');
                if (_dd) _dd.style.left = '20px';
              } else {
                _dt.classList.remove('bg-indigo-500');
                _dt.classList.add('bg-slate-300');
                if (_dd) _dd.style.left = '2px';
              }
            }
          }
          if (exam.answerDetail) setBtnGroupValue('examAnswerDetail', exam.answerDetail);
          if (exam.viewQuestions) setBtnGroupValue('examViewQuestions', exam.viewQuestions);
          if (exam.showCorrect) setBtnGroupValue('examShowCorrect', exam.showCorrect);
          if (exam.showAnalysis) setBtnGroupValue('examShowAnalysis', exam.showAnalysis);
          if (exam.viewRank) setBtnGroupValue('examViewRank', exam.viewRank);
          // 恢复关联试卷
          if (exam.paperId) {
            document.getElementById('examPaperId').value = exam.paperId;
            renderExamPaperDisplay(exam.paperId);
            // 优先使用考试自身保存的题目；无题目时再加载试卷题目
            if (!exam.questions || !exam.questions.length) {
              await onExamPaperChange();
            }
          }
          // 恢复已选题目
          if (exam.questions && exam.questions.length) {
            selectedExamQuestions = exam.questions.map((q, idx) => ({
              questionId: q.questionId,
              score: q.score || 5,
              partialScore: q.partialScore !== undefined ? q.partialScore : (q.type === 'multiple' ? 0 : undefined),
              order: q.order !== undefined ? q.order : idx,
              content: q.content || '(题目未找到)',
              type: q.type || 'single'
            }));
            renderSelectedQuestions();
          }
          // 恢复证书设置
          if (exam.certificateId) {
            document.getElementById('examCertificateId').value = exam.certificateId;
            await refreshExamCertificateOptions(exam.certificateId);
          }

        }
      } catch (e) { console.error(e); toast('加载考试数据失败', 'error'); }
    }

    function renderSelectedQuestions() {
      const container = document.getElementById('examSelectedQuestions');
      const hint = document.getElementById('examQuestionCountHint');
      if (!container) return;
      if (hint) hint.textContent = `已选 ${selectedExamQuestions.length} 题`;
      if (!selectedExamQuestions.length) {
        container.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">请选择关联试卷或手动添加题目</p>';
        return;
      }
      const typeNames = { single: '单选', multiple: '多选', judge: '判断', fill: '填空', essay: '问答' };
      container.innerHTML = selectedExamQuestions.map((q, i) => `
        <div class="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 text-sm">
          <span class="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">${i + 1}</span>
          <span class="flex-1 line-clamp-1">${escHtml(q.content)}</span>
          <span class="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">${typeNames[q.type] || ''}</span>
          <input type="number" value="${q.score}" min="1" max="100" onchange="updateQuestionScore(${i}, this.value)"
            class="w-14 px-1 border border-slate-200 rounded text-center text-xs focus:ring-1 focus:ring-indigo-500 outline-none" title="分值">
          ${q.type === 'multiple' ? `<input type="number" value="${q.partialScore !== undefined ? q.partialScore : ''}" min="0" max="100" placeholder="漏选" onchange="updateQuestionPartialScore(${i}, this.value)"
            class="w-14 px-1 border border-slate-200 rounded text-center text-xs focus:ring-1 focus:ring-indigo-500 outline-none" title="漏选得分">` : ''}
          <button type="button" onclick="removeSelectedQuestion(${i})" class="text-red-400 hover:text-red-600 transition" title="移除"><i class="fas fa-times"></i></button>
        </div>`).join('');
    }

    function updateQuestionScore(idx, val) {
      if (selectedExamQuestions[idx]) selectedExamQuestions[idx].score = parseInt(val) || 1;
    }

    function updateQuestionPartialScore(idx, val) {
      if (selectedExamQuestions[idx]) selectedExamQuestions[idx].partialScore = parseFloat(val) || 0;
    }

    function removeSelectedQuestion(idx) {
      selectedExamQuestions.splice(idx, 1);
      selectedExamQuestions.forEach((q, i) => q.order = i);
      renderSelectedQuestions();
    }

    let pendingExamStatus = 'draft';

    function saveExamAsDraft() {
      pendingExamStatus = 'draft';
      saveExam(null);
    }

    function saveExamAsPublished() {
      pendingExamStatus = 'published';
      saveExam(null);
    }

    async function saveExam(e) {
      if (e) e.preventDefault();
      const paperId = document.getElementById('examPaperId').value;
      const totalScore = selectedExamQuestions.reduce((s, q) => s + (q.score || 0), 0) || 100;
      const passingScore = parseInt(document.getElementById('examPassingScore').value) || 0;

      // 表单校验
      if (!paperId && selectedExamQuestions.length === 0) {
        toast('请选择关联试卷或手动添加题目', 'warning');
        return;
      }
      if (passingScore > totalScore) {
        toast('及格分数不能大于总分', 'warning');
        return;
      }

      // 获取试卷名称
      let paperName = '';
      if (paperId) {
        try {
          let papers = papersAllData;
          const paper = papers.find(p => p.id === paperId);
          if (paper) paperName = paper.name;
        } catch(e) { console.warn('获取试卷名称失败:', e); }
      }
      const attemptsPolicy = getBtnGroupValue('examAttempts') || 'unlimited';
      const screenSwitchPolicy = getBtnGroupValue('examScreenSwitch') || 'unlimited';
      // 任务指派：只有从培训模块打开时才由培训弹窗设置；考试安排页面独立维护指派
      let assignPayload = {};
      if (examModalFromTraining) {
        const accessTypeRaw = document.getElementById('t-access-type')?.value || 'none';
        const startTime = document.getElementById('t-start')?.value || '';
        const endTime = document.getElementById('t-end')?.value || '';
        const accessType = accessTypeRaw === 'import' ? 'restricted' : (accessTypeRaw || 'none');
        const allowedUsers = (accessTypeRaw === 'restricted' || accessTypeRaw === 'import')
          ? Array.from(trainingUserPickerTemp).map(id => isNaN(Number(id)) ? id : Number(id))
          : [];
        assignPayload = {
          startTime: startTime ? new Date(startTime).toISOString() : null,
          endTime: endTime ? new Date(endTime).toISOString() : null,
          accessType: accessType,
          allowedUsers: allowedUsers.length ? allowedUsers : null,
          fromTraining: true
        };
      }
      const payload = {
        title: document.getElementById('examTitle').value.trim(),
        description: document.getElementById('examDesc').value.trim(),
        duration: parseInt(document.getElementById('examDuration').value),
        totalScore: totalScore,
        passingScore: passingScore,
        status: pendingExamStatus,
        maxAttempts: (function(){ var _e = document.getElementById('examMaxAttempts'); return _e ? (parseInt(_e.value) || 0) : 0; })(),
        shuffleQuestions: (function(){ var _e = document.getElementById('examShuffleQuestions'); return _e ? _e.checked : false; })(),
        shuffleOptions: (function(){ var _e = document.getElementById('examShuffleOptions'); return _e ? _e.checked : false; })(),
        // 考试设置
        attemptsPolicy: attemptsPolicy,
        attemptsCount: (function(){ var _e = document.getElementById('examAttemptsCustom'); return attemptsPolicy === 'custom' && _e ? (parseInt(_e.value) || 3) : null; })(),
        recordScore: getBtnGroupValue('examRecordScore') || 'highest',
        screenSwitchPolicy: screenSwitchPolicy,
        screenSwitchCount: (function(){ var _e = document.getElementById('examScreenSwitchCustom'); return screenSwitchPolicy === 'custom' && _e ? (parseInt(_e.value) || 3) : null; })(),
        // 学员查看设置
        showData: (function(){ var _e = document.getElementById('examShowData'); return _e ? _e.checked : true; })(),
        answerDetail: getBtnGroupValue('examAnswerDetail') || 'after_grade',
        viewQuestions: getBtnGroupValue('examViewQuestions') || 'all',
        showCorrect: getBtnGroupValue('examShowCorrect') || 'show',
        showAnalysis: getBtnGroupValue('examShowAnalysis') || 'show',
        viewRank: getBtnGroupValue('examViewRank') || 'after_submit',
        questions: selectedExamQuestions,
        paperId: paperId || null,
        paperName: paperName,
        certificateId: (function(){ var _e = document.getElementById('examCertificateId'); return _e ? (_e.value || null) : null; })(),
        ...assignPayload
      };
      try {
        let res;
        if (editingExamId) {
          res = await fetch('/api/exams/' + editingExamId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          res = await fetch('/api/exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        const result = await res.json();
        if (result.success) {
          const newExamId = result.exam ? result.exam.id : editingExamId;
          // 如果是从培训模块打开的，关联到培训
          if (examModalFromTraining) {
            const idInput = document.getElementById('t-exam-id');
            if (idInput) idInput.value = newExamId;
            const status = document.getElementById('exam-card-status');
            if (status) status.textContent = document.getElementById('examTitle').value.trim() || '已配置';
            toast('考试配置成功');
          } else {
            toast(editingExamId ? '考试已更新' : '考试创建成功');
          }
          closeExamModal();
          loadExamMgmtList();
        } else {
          toast(result.error || '保存失败', 'error');
        }
      } catch (err) {
        toast('网络错误: ' + err.message, 'error');
      }
    }

    async function previewExam(id) {
      try {
        const res = await fetch('/api/exams/' + id + '/questions');
        const result = await res.json();
        const examRes = await fetch('/api/exams');
        const allExams = await examRes.json();
        const exam = allExams.find(e => e.id === id);
        document.getElementById('previewExamTitle').textContent = exam ? exam.title : '考试';
        const questions = result.questions || [];
        const typeNames = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '问答题' };
        if (questions.length === 0) {
          document.getElementById('examPreviewContent').innerHTML = '<p class="text-sm text-slate-400 text-center py-4">暂无题目</p>';
        } else {
          document.getElementById('examPreviewContent').innerHTML = questions.map((q, i) => {
            const detail = q.questionDetail || {};
            let optionsHtml = '';
            if (detail.options && Array.isArray(detail.options)) {
              optionsHtml = detail.options.map((opt, idx) => {
                const isCorrect = (Array.isArray(detail.answer) ? detail.answer : [detail.answer]).includes(String.fromCharCode(65 + idx));
                return `<div class="flex items-start gap-2 py-1 ${isCorrect ? 'text-emerald-700 font-medium' : 'text-slate-600'}">
                  <span class="flex-shrink-0 w-6 h-6 rounded-full border ${isCorrect ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-300 text-slate-500'} flex items-center justify-center text-xs font-bold">${String.fromCharCode(65 + idx)}</span>
                  <span class="text-sm">${escHtml(opt)}${isCorrect ? ' <i class="fas fa-check-circle text-emerald-500 ml-1"></i>' : ''}</span>
                </div>`;
              }).join('');
            }
            return `
              <div class="border border-slate-200 rounded-xl p-5 bg-white">
                <div class="flex items-center gap-2 mb-3">
                  <span class="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">${i + 1}</span>
                  <span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">${typeNames[detail.type] || ''}</span>
                  <span class="text-xs text-slate-400 ml-auto">${q.score || 1} 分</span>
                </div>
                <div class="text-sm text-slate-800 mb-3 font-medium">${escHtml(detail.title || detail.content || '(无内容)')}</div>
                ${optionsHtml ? `<div class="space-y-1 pl-2">${optionsHtml}</div>` : ''}
                ${detail.type === 'judge' ? `<div class="space-y-1 pl-2">
                  <div class="flex items-center gap-2 text-sm ${detail.answer === '正确' || detail.answer === 'true' || detail.answer === 'A' ? 'text-emerald-700 font-medium' : 'text-slate-600'}">
                    <span class="w-5 h-5 rounded-full border ${detail.answer === '正确' || detail.answer === 'true' || detail.answer === 'A' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'} flex items-center justify-center text-xs">对</span>
                    正确${detail.answer === '正确' || detail.answer === 'true' || detail.answer === 'A' ? ' <i class="fas fa-check-circle text-emerald-500 ml-1"></i>' : ''}
                  </div>
                  <div class="flex items-center gap-2 text-sm ${detail.answer === '错误' || detail.answer === 'false' || detail.answer === 'B' ? 'text-emerald-700 font-medium' : 'text-slate-600'}">
                    <span class="w-5 h-5 rounded-full border ${detail.answer === '错误' || detail.answer === 'false' || detail.answer === 'B' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'} flex items-center justify-center text-xs">错</span>
                    错误${detail.answer === '错误' || detail.answer === 'false' || detail.answer === 'B' ? ' <i class="fas fa-check-circle text-emerald-500 ml-1"></i>' : ''}
                  </div>
                </div>` : ''}
                ${detail.type === 'fill' || detail.type === 'essay' ? `<div class="mt-2 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                  <i class="fas fa-check-circle mr-1.5"></i>参考答案：${escHtml(detail.answer || '无')}
                </div>` : ''}
              </div>
            `;
          }).join('');
        }
        const modal = document.getElementById('examPreviewModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      } catch (e) {
        toast('加载预览失败', 'error');
      }
    }

    function closeExamPreview() {
      const modal = document.getElementById('examPreviewModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function editExam(id) { openExamModal(id); }

    async function deleteExam(id) {
      if (!confirm('确定要删除这个考试吗？相关成绩记录也将被清除，题目图片将一并删除。')) return;
      try {
        const res = await fetch('/api/exams/' + id, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) { loadExamMgmtList(); toast('考试已删除'); }
        else toast(result.error || '删除失败', 'error');
      } catch (e) { toast('删除失败', 'error'); }
    }

    async function copyExam(id) {
      try {
        const res = await fetch('/api/exams/' + id);
        const resJson = await res.json();
        const exam = resJson.data || resJson;
        if (!exam || exam.error) { toast('获取原考试数据失败', 'error'); return; }
        // 白名单复制：只保留考试定义字段，避免带入统计、作答、状态等运行时数据
        const whitelist = ['title','description','duration','totalScore','passingScore','maxAttempts','shuffleQuestions','shuffleOptions','attemptsPolicy','attemptsCount','recordScore','screenSwitchPolicy','screenSwitchCount','showData','answerDetail','viewQuestions','showCorrect','showAnalysis','viewRank','questions','paperId','paperName','certificateId'];
        const copyData = {};
        whitelist.forEach(k => { if (exam[k] !== undefined) copyData[k] = exam[k]; });
        copyData.title = (exam.title || '考试') + '副本';
        copyData.status = 'draft';
        copyData.startTime = null;
        copyData.endTime = null;
        copyData.accessType = 'none';
        copyData.allowedUsers = null;
        const createRes = await fetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(copyData)
        });
        const result = await createRes.json();
        if (result.success || result.id) { loadExamMgmtList(); toast('考试已复制'); }
        else toast(result.error || '复制失败', 'error');
      } catch (e) { toast('复制失败: ' + e.message, 'error'); }
    }

    async function publishExam(id) {
      try {
        const res = await fetch('/api/exams/' + id + '/status', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' })
        });
        const result = await res.json();
        if (result.success) { loadExamMgmtList(); toast('考试已发布'); }
        else toast(result.error, 'error');
      } catch (e) { toast('发布失败', 'error'); }
    }

    async function closeExam(id) {
      try {
        const res = await fetch('/api/exams/' + id + '/status', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'closed' })
        });
        const result = await res.json();
        if (result.success) { loadExamMgmtList(); toast('考试已结束'); }
        else toast(result.error, 'error');
      } catch (e) { toast('操作失败', 'error'); }
    }

    let currentExamResults = [];
    let currentExamResultTitle = '';

    async function viewExamResults(id, title) {
      document.getElementById('resultsExamTitle').textContent = title;
      currentExamResultTitle = title;
      const tbody = document.getElementById('examResultsBody');
      tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</td></tr>';
      const modal = document.getElementById('examResultsModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      try {
        const res = await fetch('/api/exams/' + id + '/results');
        const result = await res.json();
        const results = result.results || [];
        currentExamResults = results;
        if (!results.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">暂无成绩记录</td></tr>';
          return;
        }
        tbody.innerHTML = results.map(r => `
          <tr class="${r.passed ? '' : 'bg-red-50'}">
            <td class="px-3 py-3 font-medium text-slate-800">${escHtml(r.userName)}</td>
            <td class="px-3 py-3 font-bold ${r.passed ? 'text-green-600' : 'text-red-600'}">${r.score}分</td>
            <td class="px-3 py-3 text-slate-600">${r.correctCount || '-'}/${r.totalQuestions || '-'}</td>
            <td class="px-3 py-3">
              <span class="px-2 py-0.5 text-xs rounded-full font-medium ${r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">
                ${r.passed ? '通过' : '未通过'}
              </span>
            </td>
            <td class="px-3 py-3 text-slate-500 text-xs">${r.completedAt ? new Date(r.completedAt).toLocaleString() : '-'}</td>
          </tr>`).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-red-500">加载失败</td></tr>';
      }
    }

    function exportExamResults() {
      if (!currentExamResults || currentExamResults.length === 0) {
        toast('没有可导出的成绩数据', 'warning');
        return;
      }
      const headers = ['学员姓名', '部门', '岗位', '得分', '正确题数', '总题数', '是否通过', '提交时间'];
      const rows = currentExamResults.map(r => [
        r.userName || '未知',
        r.department || '-',
        r.position || '-',
        r.score || 0,
        r.correctCount || 0,
        r.totalQuestions || 0,
        r.passed ? '通过' : '未通过',
        r.completedAt ? new Date(r.completedAt).toLocaleString('zh-CN') : '-'
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '考试成绩');
      XLSX.writeFile(wb, (currentExamResultTitle || '考试') + '_成绩_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('成绩导出成功');
    }

    function closeExamResults() {
      const modal = document.getElementById('examResultsModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    // ========== 考试详情内嵌窗格 ==========
    let currentExamDetailId = null;
    let currentExamDetailTitle = '';
    let currentExamDetailData = { students: [], questions: [], exam: {} };
    let currentExamDetailStudentFilter = 'all';
    let currentExamDetailQuestionFilter = 'all';
    let currentExamStudentRecords = [];
    let currentExamStudentRecordTitle = '';

    function openExamDetailView(examId, tab) {
      currentExamDetailId = examId;
      currentExamDetailStudentFilter = 'all';
      currentExamDetailQuestionFilter = 'all';
      document.getElementById('examDetailStudentSearch').value = '';
      const listView = document.getElementById('examListView');
      listView.classList.add('hidden');
      listView.style.display = 'none';
      document.getElementById('examDetailView').classList.remove('hidden');
      loadExamDetailData(tab || 'students');
    }

    function closeExamDetailView() {
      document.getElementById('examDetailView').classList.add('hidden');
      const listView = document.getElementById('examListView');
      listView.classList.remove('hidden');
      listView.style.display = '';
      currentExamDetailId = null;
      currentExamDetailTitle = '';
      currentExamDetailData = { students: [], questions: [], exam: {} };
    }

    function switchExamDetailTab(tab) {
      const studentsPanel = document.getElementById('examDetailStudentsPanel');
      const questionsPanel = document.getElementById('examDetailQuestionsPanel');
      const studentsTab = document.getElementById('examDetailTabStudents');
      const questionsTab = document.getElementById('examDetailTabQuestions');
      if (tab === 'students') {
        studentsPanel.classList.remove('hidden');
        questionsPanel.classList.add('hidden');
        studentsTab.className = 'py-3 text-sm font-medium border-b-2 border-indigo-500 text-indigo-600 transition';
        questionsTab.className = 'py-3 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition';
        renderExamDetailStudents();
      } else {
        studentsPanel.classList.add('hidden');
        questionsPanel.classList.remove('hidden');
        studentsTab.className = 'py-3 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition';
        questionsTab.className = 'py-3 text-sm font-medium border-b-2 border-indigo-500 text-indigo-600 transition';
        renderExamDetailQuestions();
      }
    }

    async function loadExamDetailData(tab) {
      if (!currentExamDetailId) return;
      try {
        const [studentsRes, questionsRes] = await Promise.all([
          fetch('/api/exams/' + currentExamDetailId + '/students'),
          fetch('/api/exams/' + currentExamDetailId + '/question-stats')
        ]);
        const studentsData = await studentsRes.json();
        const questionsData = await questionsRes.json();
        currentExamDetailData.exam = studentsData.exam || {};
        currentExamDetailData.students = studentsData.students || [];
        currentExamDetailData.questions = questionsData.stats || [];
        currentExamDetailTitle = currentExamDetailData.exam.title || '考试详情';
        document.getElementById('examDetailTitle').textContent = currentExamDetailTitle;
        renderExamDetailStudentFilters();
        renderExamDetailQuestionFilters();
        switchExamDetailTab(tab);
      } catch (e) {
        toast('加载考试详情失败', 'error');
      }
    }

    function renderExamDetailStudentFilters() {
      const students = currentExamDetailData.students || [];
      const counts = {
        all: students.length,
        passed: students.filter(s => s.status === 'passed').length,
        failed: students.filter(s => s.status === 'failed').length,
        unstarted: students.filter(s => s.status === 'unstarted').length,
        absent: students.filter(s => s.status === 'absent').length,
        taking: students.filter(s => s.status === 'taking').length
      };
      const labels = {
        all: `全部(${counts.all})`,
        passed: `及格(${counts.passed})`,
        failed: `不及格(${counts.failed})`,
        unstarted: `未开始(${counts.unstarted})`,
        absent: `缺考(${counts.absent})`,
        taking: `考试中(${counts.taking})`
      };
      const filters = ['all', 'passed', 'failed', 'unstarted', 'absent', 'taking'];
      const container = document.getElementById('examDetailStudentFilters');
      container.innerHTML = filters.map(f => {
        const active = currentExamDetailStudentFilter === f ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300';
        return `<button onclick="setExamDetailStudentFilter('${f}')" class="px-3 py-1.5 text-xs border rounded-lg transition ${active}">${labels[f]}</button>`;
      }).join('');
    }

    function setExamDetailStudentFilter(filter) {
      currentExamDetailStudentFilter = filter;
      renderExamDetailStudentFilters();
      renderExamDetailStudents();
    }

    function formatExamDuration(seconds) {
      if (!seconds || seconds <= 0) return '-';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      return `${m}分${s}秒`;
    }

    function toLocalDateTimeInput(dateStr) {
      const d = new Date(dateStr);
      const pad = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function safeParse(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch(e) { return fallback; }
    }

    function renderExamDetailStudents() {
      const tbody = document.getElementById('examDetailStudentsBody');
      const search = (document.getElementById('examDetailStudentSearch').value || '').trim().toLowerCase();
      let students = currentExamDetailData.students || [];
      if (search) students = students.filter(s => (s.userName || '').toLowerCase().includes(search));
      if (currentExamDetailStudentFilter !== 'all') {
        students = students.filter(s => s.status === currentExamDetailStudentFilter);
      }
      if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="py-8 text-center text-slate-400">暂无学员数据</td></tr>';
        return;
      }
      tbody.innerHTML = students.map(s => {
        const statusClass = {
          passed: 'bg-emerald-100 text-emerald-700',
          failed: 'bg-rose-100 text-rose-600',
          unstarted: 'bg-slate-100 text-slate-500',
          taking: 'bg-blue-100 text-blue-600',
          absent: 'bg-indigo-100 text-indigo-600'
        }[s.status] || 'bg-slate-100 text-slate-500';
        const scoreDisplay = s.status === 'passed' || s.status === 'failed' ? (s.score ?? '-') : '-';
        const rateDisplay = s.status === 'passed' || s.status === 'failed' ? ((s.scoreRate ?? 0) + '%') : '-';
        return `<tr>
          <td class="px-3 py-3 text-slate-800">${escHtml(s.userName)}</td>
          <td class="px-3 py-3 text-slate-600">${escHtml(s.department)}</td>
          <td class="px-3 py-3 text-slate-600">${escHtml(s.phone)}</td>
          <td class="px-3 py-3 text-slate-500 text-xs">${s.joinTime}</td>
          <td class="px-3 py-3 text-center">
            <button onclick="openExamStudentRecords(${currentExamDetailId}, ${s.userId}, '${escJs(s.userName)}')" class="text-indigo-600 hover:text-indigo-700 text-sm font-medium">${s.attemptCount} <i class="fas fa-chevron-right text-xs"></i></button>
          </td>
          <td class="px-3 py-3 text-center font-medium text-slate-700">${scoreDisplay}</td>
          <td class="px-3 py-3 text-center text-slate-600">${rateDisplay}</td>
          <td class="px-3 py-3 text-center text-slate-600">${formatExamDuration(s.duration)}</td>
          <td class="px-3 py-3 text-center"><span class="px-2 py-0.5 text-xs rounded-full font-medium ${statusClass}">${s.statusText}</span></td>
          <td class="px-3 py-3 text-center">
            <button onclick="openExamStudentRecords(${currentExamDetailId}, ${s.userId}, '${escJs(s.userName)}')" class="text-indigo-600 hover:text-indigo-700 text-xs font-medium">查看详情</button>
          </td>
        </tr>`;
      }).join('');
    }

    let currentExamDetailAssignments = [];

    function renderExamDetailAssignments() {
      const tbody = document.getElementById('examDetailAssignmentsBody');
      const totalEl = document.getElementById('examDetailAssignmentTotal');
      const joinedEl = document.getElementById('examDetailAssignmentJoined');
      const pendingEl = document.getElementById('examDetailAssignmentPending');
      const search = (document.getElementById('examDetailAssignmentSearch').value || '').trim().toLowerCase();
      const allowedUsers = currentExamDetailData.allowedUsers || [];

      if (!allowedUsers.length) {
        totalEl.textContent = '0';
        joinedEl.textContent = '0';
        pendingEl.textContent = '0';
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400">本考试为全员开放，未记录具体指派学员</td></tr>';
        currentExamDetailAssignments = [];
        return;
      }

      const studentMap = {};
      (currentExamDetailData.students || []).forEach(s => { studentMap[String(s.userId)] = s; });

      let assignments = allowedUsers.map(uid => {
        const s = studentMap[String(uid)];
        return {
          userId: uid,
          userName: s ? s.userName : '未知用户',
          department: s ? (s.department || '-') : '-',
          position: s ? (s.position || '-') : '-',
          status: s ? s.status : 'unstarted',
          statusText: s ? s.statusText : '未考',
          score: s ? s.score : '-',
          attemptCount: s ? (s.attemptCount || 0) : 0
        };
      });

      if (search) {
        assignments = assignments.filter(a => (a.userName || '').toLowerCase().includes(search));
      }

      currentExamDetailAssignments = assignments;
      totalEl.textContent = allowedUsers.length;
      joinedEl.textContent = assignments.filter(a => a.status !== 'unstarted').length;
      pendingEl.textContent = assignments.filter(a => a.status === 'unstarted').length;

      if (!assignments.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400">暂无匹配的指派记录</td></tr>';
        return;
      }

      const statusClass = {
        passed: 'bg-emerald-100 text-emerald-700',
        failed: 'bg-rose-100 text-rose-600',
        unstarted: 'bg-slate-100 text-slate-500',
        taking: 'bg-blue-100 text-blue-600',
        absent: 'bg-indigo-100 text-indigo-600'
      };

      tbody.innerHTML = assignments.map(a => {
        const cls = statusClass[a.status] || statusClass.unstarted;
        const scoreDisplay = a.status === 'passed' || a.status === 'failed' ? (a.score ?? '-') : '-';
        return `<tr>
          <td class="px-3 py-3 text-slate-800">${escHtml(a.userName)}</td>
          <td class="px-3 py-3 text-slate-600">${escHtml(a.department)}</td>
          <td class="px-3 py-3 text-slate-600">${escHtml(a.position)}</td>
          <td class="px-3 py-3 text-center"><span class="px-2 py-0.5 text-xs rounded-full font-medium ${cls}">${a.statusText}</span></td>
          <td class="px-3 py-3 text-center font-medium text-slate-700">${scoreDisplay}</td>
          <td class="px-3 py-3 text-center text-slate-600">${a.attemptCount}</td>
          <td class="px-3 py-3 text-center">
            <button onclick="openExamStudentRecords(${currentExamDetailId}, ${a.userId}, '${escJs(a.userName)}')" class="text-indigo-600 hover:text-indigo-700 text-xs font-medium">查看详情</button>
          </td>
        </tr>`;
      }).join('');
    }

    function exportExamDetailAssignments() {
      if (!currentExamDetailAssignments || currentExamDetailAssignments.length === 0) {
        toast('没有可导出的指派记录', 'warning');
        return;
      }
      const headers = ['学员姓名', '部门', '岗位', '考试状态', '最高分', '考试次数'];
      const rows = currentExamDetailAssignments.map(a => [
        a.userName || '未知',
        a.department || '-',
        a.position || '-',
        a.statusText || '-',
        a.score !== null && a.score !== undefined && a.score !== '-' ? a.score : '-',
        a.attemptCount || 0
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '指派记录');
      XLSX.writeFile(wb, (currentExamDetailTitle || '考试') + '_指派记录_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('指派记录导出成功');
    }

    function renderExamDetailQuestionFilters() {
      const questions = currentExamDetailData.questions || [];
      const typeMap = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };
      const counts = { all: questions.length };
      Object.keys(typeMap).forEach(type => { counts[type] = questions.filter(q => q.type === type).length; });
      const filters = [['all', `全部试题(${counts.all})`], ['single', `单选题(${counts.single})`], ['multiple', `多选题(${counts.multiple})`], ['judge', `判断题(${counts.judge})`]];
      const container = document.getElementById('examDetailQuestionFilters');
      container.innerHTML = filters.map(([type, label]) => {
        const active = currentExamDetailQuestionFilter === type ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300';
        return `<button onclick="setExamDetailQuestionFilter('${type}')" class="px-3 py-1.5 text-xs border rounded-lg transition ${active}">${label}</button>`;
      }).join('');
    }

    function setExamDetailQuestionFilter(filter) {
      currentExamDetailQuestionFilter = filter;
      renderExamDetailQuestionFilters();
      renderExamDetailQuestions();
    }

    function renderExamDetailQuestions() {
      const tbody = document.getElementById('examDetailQuestionsBody');
      let questions = currentExamDetailData.questions || [];
      if (currentExamDetailQuestionFilter !== 'all') {
        questions = questions.filter(q => q.type === currentExamDetailQuestionFilter);
      }
      if (!questions.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="py-8 text-center text-slate-400">暂无答题数据</td></tr>';
        return;
      }
      tbody.innerHTML = questions.map(q => `
        <tr>
          <td class="px-3 py-3 text-slate-600">${q.order}</td>
          <td class="px-3 py-3 text-slate-800 max-w-xs truncate" title="${escHtml(q.title)}">${escHtml(q.title)}</td>
          <td class="px-3 py-3 text-slate-600">${escHtml(q.bankName)}</td>
          <td class="px-3 py-3 text-slate-600">${q.typeText}</td>
          <td class="px-3 py-3 text-slate-600">${escHtml(q.knowledge)}</td>
          <td class="px-3 py-3 text-slate-700 font-medium">${escHtml(q.correctAnswer)}</td>
          <td class="px-3 py-3 text-center">
            <span class="px-2 py-0.5 text-xs rounded-full font-medium ${q.correctRate >= 80 ? 'bg-emerald-100 text-emerald-700' : q.correctRate >= 60 ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-600'}">${q.correctRate}%</span>
          </td>
          <td class="px-3 py-3 text-center">
            <button onclick="showExamQuestionDetail(${q.questionId})" class="text-indigo-600 hover:text-indigo-700 text-xs font-medium">数据</button>
          </td>
        </tr>
      `).join('');
    }

    let currentExamAttemptDetail = null;
    let currentExamQuestionAnswers = null;

    async function showExamQuestionDetail(questionId) {
      const question = (currentExamDetailData.questions || []).find(q => q.questionId === questionId);
      if (!question) return;
      const modal = document.getElementById('examQuestionAnswersModal');
      const body = document.getElementById('examQuestionAnswersBody');
      const subtitle = document.getElementById('examQuestionAnswersSubtitle');
      subtitle.textContent = `第${question.order}题 · ${question.typeText} · 正确率 ${question.correctRate}%`;
      body.innerHTML = '<div class="py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</div>';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      try {
        const res = await fetch('/api/exams/' + currentExamDetailId + '/questions/' + questionId + '/answers');
        const result = await res.json();
        currentExamQuestionAnswers = result;
        const answers = result.answers || [];
        if (!answers.length) {
          body.innerHTML = '<div class="py-12 text-center text-slate-400">暂无答题数据</div>';
          return;
        }
        body.innerHTML = answers.map(a => {
          const resultClass = a.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600';
          const resultText = a.isCorrect ? '正确' : '错误';
          return `
          <div class="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-xs font-bold">${escHtml((a.userName || '?').charAt(0))}</div>
                <div>
                  <p class="text-sm font-semibold text-slate-800">${escHtml(a.userName)}</p>
                  <p class="text-xs text-slate-500">${escHtml(a.department)} · ${escHtml(a.phone)}</p>
                </div>
              </div>
              <span class="px-2 py-0.5 text-xs rounded-full font-medium ${resultClass}">${resultText}</span>
            </div>
            <div class="flex flex-wrap gap-4 text-sm">
              <div><span class="text-slate-400">学员答案：</span><span class="font-medium text-slate-700">${a.userAnswer ? escHtml(a.userAnswer) : '<span class="text-slate-400">未作答</span>'}</span></div>
              <div><span class="text-slate-400">正确答案：</span><span class="font-medium text-emerald-600">${escHtml(a.correctAnswer)}</span></div>
              <div><span class="text-slate-400">交卷时间：</span><span class="text-slate-600">${a.completedAt ? new Date(a.completedAt).toLocaleString('zh-CN') : '-'}</span></div>
            </div>
          </div>`;
        }).join('');
      } catch (e) {
        body.innerHTML = '<div class="py-12 text-center text-red-500">加载失败</div>';
      }
    }

    function closeExamQuestionAnswersModal() {
      const modal = document.getElementById('examQuestionAnswersModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      currentExamQuestionAnswers = null;
    }

    function exportExamQuestionAnswers() {
      if (!currentExamQuestionAnswers || !currentExamQuestionAnswers.answers || !currentExamQuestionAnswers.answers.length) {
        toast('没有可导出的答题数据', 'warning');
        return;
      }
      const q = currentExamQuestionAnswers.question || {};
      const headers = ['学员姓名', '部门', '岗位', '手机号', '学员答案', '正确答案', '是否正确', '交卷时间'];
      const rows = currentExamQuestionAnswers.answers.map(a => [
        a.userName, a.department, a.position, a.phone, a.userAnswer || '未作答', a.correctAnswer,
        a.isCorrect ? '正确' : '错误',
        a.completedAt ? new Date(a.completedAt).toLocaleString('zh-CN') : '-'
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '答题数据');
      XLSX.writeFile(wb, (currentExamDetailTitle || '考试') + '_第' + (q.order || '') + '题答题数据_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('答题数据导出成功');
    }

    async function openExamStudentRecords(examId, userId, userName) {
      currentExamStudentRecordTitle = `${escHtml(userName)} - ${currentExamDetailTitle || '考试记录'}`;
      document.getElementById('examStudentRecordsTitle').textContent = currentExamStudentRecordTitle;
      const tbody = document.getElementById('examStudentRecordsBody');
      tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</td></tr>';
      const modal = document.getElementById('examStudentRecordsModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      try {
        const res = await fetch('/api/exams/' + examId + '/students/' + userId + '/records');
        const result = await res.json();
        const records = result.records || [];
        currentExamStudentRecords = records;
        if (!records.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400">暂无考试记录</td></tr>';
          return;
        }
        tbody.innerHTML = records.map(r => {
          const resultClass = r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600';
          const resultText = r.status === 'completed' ? (r.passed ? '及格' : '不及格') : (r.status === 'abandoned' ? '缺考' : '进行中');
          const badge = r.isHighest ? '<span class="ml-1 px-1 py-0.5 text-[10px] border border-indigo-300 text-indigo-600 rounded">最高</span>' : '';
          return `<tr>
            <td class="px-3 py-3 text-slate-600">${r.completedAt ? new Date(r.completedAt).toLocaleString('zh-CN') : '-'}</td>
            <td class="px-3 py-3 text-center text-slate-600">${formatExamDuration(r.durationUsed)}</td>
            <td class="px-3 py-3 text-center text-slate-700 font-medium">${r.score}/${r.fullScore}${badge}</td>
            <td class="px-3 py-3 text-center text-slate-600">${r.scoreRate}%</td>
            <td class="px-3 py-3 text-center text-slate-600">系统</td>
            <td class="px-3 py-3 text-center"><span class="px-2 py-0.5 text-xs rounded-full font-medium ${resultClass}">${resultText}</span></td>
            <td class="px-3 py-3 text-center"><button onclick="openExamAttemptDetail(${r.id})" class="text-indigo-600 hover:text-indigo-700 text-xs font-medium">作答详情</button></td>
          </tr>`;
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-red-500">加载失败</td></tr>';
      }
    }

    function closeExamStudentRecordsModal() {
      const modal = document.getElementById('examStudentRecordsModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      currentExamStudentRecords = [];
    }

    function exportExamDetailStudents() {
      const students = currentExamDetailData.students || [];
      if (!students.length) { toast('没有可导出的学员数据', 'warning'); return; }
      const headers = ['姓名', '部门', '岗位', '登录手机号', '加入时间', '考试记录', '考试得分', '得分率', '作答时长', '状态'];
      const rows = students.map(s => [
        s.userName, s.department, s.position, s.phone, s.joinTime, s.attemptCount,
        s.status === 'passed' || s.status === 'failed' ? s.score : '-',
        s.status === 'passed' || s.status === 'failed' ? s.scoreRate + '%' : '-',
        formatExamDuration(s.duration),
        s.statusText
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '学员数据');
      XLSX.writeFile(wb, (currentExamDetailTitle || '考试') + '_学员数据_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('学员数据导出成功');
    }

    function exportExamDetailQuestions() {
      const questions = currentExamDetailData.questions || [];
      if (!questions.length) { toast('没有可导出的答题数据', 'warning'); return; }
      const headers = ['序号', '题目', '题库', '题型', '知识点', '正确答案', '正确人数', '答题人数', '正确率'];
      const rows = questions.map(q => [q.order, q.title, q.bankName, q.typeText, q.knowledge, q.correctAnswer, q.correctCount, q.totalCount, q.correctRate + '%']);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '答题数据');
      XLSX.writeFile(wb, (currentExamDetailTitle || '考试') + '_答题数据_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('答题数据导出成功');
    }

    function exportExamStudentRecords() {
      if (!currentExamStudentRecords.length) { toast('没有可导出的考试记录', 'warning'); return; }
      const headers = ['交卷时间', '作答时长', '总分', '得分', '得分率', '阅卷人', '考试结果'];
      const rows = currentExamStudentRecords.map(r => [
        r.completedAt ? new Date(r.completedAt).toLocaleString('zh-CN') : '-',
        formatExamDuration(r.durationUsed),
        r.fullScore,
        r.score,
        r.scoreRate + '%',
        '系统',
        r.status === 'completed' ? (r.passed ? '及格' : '不及格') : (r.status === 'abandoned' ? '缺考' : '进行中')
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '考试记录');
      XLSX.writeFile(wb, currentExamStudentRecordTitle + '_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('考试记录导出成功');
    }

    async function openExamAttemptDetail(attemptId) {
      const modal = document.getElementById('examAttemptDetailModal');
      const body = document.getElementById('examAttemptDetailBody');
      const subtitle = document.getElementById('examAttemptDetailSubtitle');
      body.innerHTML = '<div class="py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</div>';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      try {
        const res = await fetch('/api/exams/attempts/' + attemptId + '/detail');
        const result = await res.json();
        currentExamAttemptDetail = result;
        const attempt = result.attempt || {};
        const user = result.user || {};
        const exam = result.exam || {};
        subtitle.textContent = `${escHtml(user.userName || '')} · ${escHtml(exam.title || '')} · 得分 ${attempt.score || 0}/${exam.fullScore || exam.totalScore || 0}`;
        const details = result.details || [];
        if (!details.length) {
          body.innerHTML = '<div class="py-12 text-center text-slate-400">暂无作答数据</div>';
          return;
        }
        const typeTextMap = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };
        body.innerHTML = details.map(d => {
          const resultClass = d.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600';
          const resultText = d.userAnswer ? (d.isCorrect ? '正确' : '错误') : '未作答';
          const typeText = d.typeText || typeTextMap[d.type] || '单选题';
          const opts = d.options || {};
          const isArrayOpts = Array.isArray(opts);
          const optionsHtml = (isArrayOpts ? opts : Object.entries(opts)).map((item, idx) => {
            const k = isArrayOpts ? String.fromCharCode(65 + idx) : item[0];
            const v = isArrayOpts ? item : item[1];
            return `<div class="text-sm ${k === d.correctAnswer ? 'text-emerald-600 font-medium' : (k === d.userAnswer ? 'text-rose-600' : 'text-slate-600')}"><span class="inline-block w-5 text-xs">${k}.</span>${escHtml(v)}</div>`;
          }).join('');
          return `
          <div class="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition">
            <div class="flex items-start justify-between gap-4 mb-3">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2 py-0.5 text-[10px] font-semibold rounded bg-indigo-50 text-indigo-600">第${d.order}题</span>
                  <span class="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-600">${typeText}</span>
                  <span class="text-xs text-slate-400">${escHtml(d.knowledge || '')}</span>
                </div>
                <p class="text-sm font-medium text-slate-800">${escHtml(d.title)}</p>
              </div>
              <span class="px-2 py-0.5 text-xs rounded-full font-medium ${resultClass}">${resultText}</span>
            </div>
            <div class="space-y-1.5 mb-3 pl-1">${optionsHtml || '<div class="text-sm text-slate-400">非客观题，无选项</div>'}</div>
            <div class="flex flex-wrap gap-4 text-sm bg-slate-50 rounded-lg p-3">
              <div><span class="text-slate-400">学员答案：</span><span class="font-medium ${d.userAnswer ? (d.isCorrect ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}">${d.userAnswer ? escHtml(d.userAnswer) : '未作答'}</span></div>
              <div><span class="text-slate-400">正确答案：</span><span class="font-medium text-emerald-600">${escHtml(d.correctAnswer)}</span></div>
              <div><span class="text-slate-400">分值：</span><span class="text-slate-600">${d.score}分</span></div>
            </div>
            ${d.analysis ? `<div class="mt-3 text-sm text-slate-600 bg-indigo-50/50 border-l-2 border-indigo-400 pl-3 py-2 rounded-r-lg"><span class="text-indigo-600 font-medium">解析：</span>${escHtml(d.analysis)}</div>` : ''}
          </div>`;
        }).join('');
      } catch (e) {
        body.innerHTML = '<div class="py-12 text-center text-red-500">加载失败</div>';
      }
    }

    function closeExamAttemptDetailModal() {
      const modal = document.getElementById('examAttemptDetailModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      currentExamAttemptDetail = null;
    }

    function exportExamAttemptDetail() {
      if (!currentExamAttemptDetail || !currentExamAttemptDetail.details || !currentExamAttemptDetail.details.length) {
        toast('没有可导出的作答数据', 'warning');
        return;
      }
      const attempt = currentExamAttemptDetail.attempt || {};
      const user = currentExamAttemptDetail.user || {};
      const exam = currentExamAttemptDetail.exam || {};
      const headers = ['题号', '题型', '题目', '学员答案', '正确答案', '结果', '分值', '知识点'];
      const rows = currentExamAttemptDetail.details.map(d => [
        d.order, d.typeText, d.title, d.userAnswer || '未作答', d.correctAnswer,
        d.userAnswer ? (d.isCorrect ? '正确' : '错误') : '未作答',
        d.score, d.knowledge
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '作答详情');
      XLSX.writeFile(wb, (user.userName || '学员') + '_' + (exam.title || '考试') + '_作答详情_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('作答详情导出成功');
    }

    // ========== 试卷管理 ==========
    let editingPaperId = null;
    let paperQuestions = []; // 当前试卷的题目列表
    let paperQpAllQuestions = []; // 题目选择器中的题目列表
    let paperQpSelectedIds = new Set();
    let papersAllData = []; // 全部试卷数据缓存
    let paperSelectedIds = new Set(); // 列表中选中的试卷ID

    // 试卷后端化辅助函数
    async function fetchPapersAll() {
      const res = await fetch('/api/papers');
      const result = await res.json();
      return result.data || [];
    }

    async function migratePapersIfNeeded() {
      if (window.__papersMigrationDone) return;
      window.__papersMigrationDone = true;
      let localPapers = [];
      try {
        if (window.dataSync && window.dataSync.getData) {
          localPapers = window.dataSync.getData('papers') || [];
        } else {
          localPapers = safeParse('papers', []);
        }
      } catch (e) { localPapers = []; }
      if (!localPapers.length) return;
      try {
        const backend = await fetchPapersAll();
        if (backend.length) return;
      } catch (e) { return; }
      let success = 0;
      for (const p of localPapers) {
        try {
          const payload = { ...p, createdAt: p.createdAt || new Date().toISOString(), updatedAt: p.updatedAt || new Date().toISOString() };
          const res = await fetch('/api/papers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (res.ok) success++;
        } catch (e) { console.warn('迁移试卷失败:', p.id, e); }
      }
      if (success > 0) {
        toast(`已迁移 ${success} 份历史试卷到后端`, 'success');
        try { localStorage.removeItem('papers'); } catch (e) {}
      }
    }

    async function savePaperToBackend(paper) {
      if (!paper || !paper.id) throw new Error('试卷缺少ID');
      const payload = { ...paper };
      delete payload.id;
      delete payload.createdAt;
      const res = await fetch(`/api/papers/${paper.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok || result.success === false) throw new Error(result.error || '保存失败');
      return result.data || paper;
    }

    // 加载试卷列表
    async function loadPapers() {
      const tbody = document.getElementById('paperList');
      tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-16 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</td></tr>';

      try {
        await migratePapersIfNeeded();
        papersAllData = await fetchPapersAll();
        const filtered = applyPaperFilters();
        renderPaperList(filtered);
      } catch (e) {
        console.error('加载试卷失败:', e);
        tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-16 text-center text-red-500">加载失败，请重试</td></tr>';
      }
    }

    // 渲染试卷列表
    function renderPaperList(papers) {
      const tbody = document.getElementById('paperList');
      const countEl = document.getElementById('paperCount');
      countEl.textContent = `共 ${papers.length} 份试卷`;
      
      if (!papers.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-16 text-center text-slate-400"><i class="fas fa-folder-open text-4xl mb-3 block opacity-30"></i><p>暂无试卷</p><p class="text-xs mt-1">点击右上角"新建试卷"开始创建</p></td></tr>';
        updatePaperBatchActionBar();
        return;
      }

      tbody.innerHTML = papers.map(p => {
        const qCount = (p.questions || []).length;
        const isEnabled = p.status !== 'disabled' && p.status !== 'closed';
        const deptName = p.department || (p.categoryName && !/^\d+$/.test(p.categoryName) ? p.categoryName : '未分配');
        const paperType = p.type || 'fixed';
        const typeText = paperType === 'fixed' ? '固定试卷' : '随机试卷';
        const creator = p.creator || p.createdBy || '—';
        const createdAt = p.createdAt ? formatDateTime(p.createdAt) : '—';
        const updatedAt = p.updatedAt ? new Date(p.updatedAt).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '—';
        const checked = paperSelectedIds.has(p.id) ? 'checked' : '';
        
        return `
          <tr class="hover:bg-indigo-50/30 transition" data-id="${p.id}">
            <td class="pl-5 pr-3 py-4">
              <input type="checkbox" ${checked} onchange="togglePaperSelect('${p.id}')" class="paper-row-check rounded border-slate-300 text-indigo-500 focus:ring-indigo-500 cursor-pointer">
            </td>
            <td class="px-3 py-4">
              <a href="javascript:;" onclick="editPaper('${p.id}')" class="text-indigo-600 hover:text-indigo-700 font-medium line-clamp-1">${escHtml(p.name)}</a>
            </td>
            <td class="px-3 py-4">
              <span class="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-600 whitespace-nowrap">${escHtml(deptName)}</span>
            </td>
            <td class="px-3 py-4 text-sm text-slate-600">${typeText}</td>
            <td class="px-3 py-4 text-sm text-slate-700">${qCount}</td>
            <td class="px-3 py-4 text-sm text-slate-600">${escHtml(creator)}</td>
            <td class="px-3 py-4 text-sm text-slate-500 whitespace-nowrap">${updatedAt}</td>
            <td class="px-3 py-4">
              <span class="inline-flex items-center gap-1.5 text-sm">
                <span class="w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-emerald-500' : 'bg-indigo-500'}"></span>
                <span class="${isEnabled ? 'text-emerald-600' : 'text-indigo-500'}">${isEnabled ? '启用' : '停用'}</span>
              </span>
            </td>
            <td class="pl-3 pr-5 py-4">
              <div class="flex items-center gap-1">
                <button onclick="editPaper('${p.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition" title="编辑">
                  <i class="fas fa-pen text-sm"></i>
                </button>
                <button onclick="togglePaperStatus('${p.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition" title="停用/启用">
                  <i class="fas fa-power-off text-sm"></i>
                </button>
                <button onclick="duplicatePaper('${p.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition" title="复制试卷">
                  <i class="fas fa-copy text-sm"></i>
                </button>
                <button onclick="deletePaper('${p.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition" title="删除">
                  <i class="fas fa-trash-alt text-sm"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      updatePaperSelectAllState();
      updatePaperBatchActionBar();
    }

    // 应用筛选
    function applyPaperFilters() {
      const search = (document.getElementById('paperSearchInput')?.value || '').trim().toLowerCase();
      const status = document.getElementById('paperFilterStatus')?.value || 'all';
      const type = document.getElementById('paperFilterType')?.value || 'all';
      
      return papersAllData.filter(p => {
        if (search && !(p.name || '').toLowerCase().includes(search)) return false;
        if (status === 'enabled' && (p.status === 'disabled' || p.status === 'closed')) return false;
        if (status === 'disabled' && p.status !== 'disabled' && p.status !== 'closed') return false;
        if (type !== 'all' && (p.type || 'fixed') !== type) return false;
        return true;
      });
    }

    // 搜索输入
    let paperSearchTimer = null;
    function onPaperSearch() {
      clearTimeout(paperSearchTimer);
      paperSearchTimer = setTimeout(() => {
        renderPaperList(applyPaperFilters());
      }, 250);
    }

    // 筛选变更
    function onPaperFilterChange() {
      renderPaperList(applyPaperFilters());
    }

    // 重置筛选
    function resetPaperFilters() {
      document.getElementById('paperSearchInput').value = '';
      document.getElementById('paperFilterStatus').value = 'all';
      document.getElementById('paperFilterType').value = 'all';
      renderPaperList(applyPaperFilters());
    }

    // 选中切换
    function togglePaperSelect(id) {
      if (paperSelectedIds.has(id)) paperSelectedIds.delete(id);
      else paperSelectedIds.add(id);
      updatePaperSelectAllState();
      updatePaperBatchActionBar();
    }

    // 全选
    function togglePaperSelectAll() {
      const checked = document.getElementById('paperSelectAll').checked;
      const visible = applyPaperFilters();
      if (checked) {
        visible.forEach(p => paperSelectedIds.add(p.id));
      } else {
        visible.forEach(p => paperSelectedIds.delete(p.id));
      }
      renderPaperList(visible);
      updatePaperBatchActionBar();
    }

    function updatePaperSelectAllState() {
      const visible = applyPaperFilters();
      const allChecked = visible.length > 0 && visible.every(p => paperSelectedIds.has(p.id));
      const el = document.getElementById('paperSelectAll');
      if (el) el.checked = allChecked;
    }

    function updatePaperBatchActionBar() {
      const bar = document.getElementById('paperBatchActionBar');
      const count = document.getElementById('paperBatchCount');
      if (!bar || !count) return;
      if (paperSelectedIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = `已选 ${paperSelectedIds.size} 项`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function clearPaperSelection() {
      paperSelectedIds.clear();
      const el = document.getElementById('paperSelectAll');
      if (el) el.checked = false;
      renderPaperList(applyPaperFilters());
      updatePaperBatchActionBar();
    }

    async function batchDeletePapers() {
      const ids = Array.from(paperSelectedIds);
      if (!ids.length) return;
      if (!confirm(`确定删除选中的 ${ids.length} 份试卷吗？`)) return;
      let success = 0, fail = 0;
      for (const id of ids) {
        try {
          const ok = await deletePaper(id, false);
          if (ok) success++; else fail++;
        } catch (e) { fail++; }
      }
      clearPaperSelection();
      await loadPapers();
      toast(`删除完成：成功 ${success}，失败 ${fail}`);
    }

    function batchChangePaperCategory() {
      if (paperSelectedIds.size === 0) return;
      showBatchCategoryPicker('paper', async (categoryId) => {
        const category = data.categories.find(c => String(c.id) === String(categoryId));
        const categoryName = category ? category.name : categoryId;
        const ids = Array.from(paperSelectedIds);
        let success = 0;
        const updatedMap = new Map();
        papersAllData = papersAllData.map(p => {
          if (ids.includes(String(p.id))) {
            const updated = { ...p, categoryId, categoryName, department: categoryName, updatedAt: new Date().toISOString() };
            updatedMap.set(p.id, updated);
            return updated;
          }
          return p;
        });
        for (const paper of updatedMap.values()) {
          try {
            await savePaperToBackend(paper);
            success++;
          } catch (e) {
            console.warn('批量调整分类保存失败:', paper.id, e);
          }
        }
        await loadPapers();
        toast(`调整分类完成：${success} 份试卷`);
        clearPaperSelection();
        renderPaperList(applyPaperFilters());
      });
    }

    // 更多下拉菜单
    function togglePaperMoreMenu(id, e) {
      e?.stopPropagation();
      // 关闭其他菜单
      document.querySelectorAll('.paper-more-menu').forEach(m => m.remove());
      
      const row = document.querySelector(`tr[data-id="${id}"]`);
      if (!row) return;
      const moreCell = row.querySelector('td:last-child .relative');
      
      const menu = document.createElement('div');
      menu.className = 'paper-more-menu';
      menu.style.cssText = 'position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);z-index:50;min-width:120px;padding:4px 0;';
      menu.innerHTML = `
        <a href="javascript:;" onclick="togglePaperStatus('${id}')" class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">停用/启用</a>
        <a href="javascript:;" onclick="duplicatePaper('${id}')" class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">复制试卷</a>
        <a href="javascript:;" onclick="deletePaper('${id}')" class="block px-4 py-2 text-sm text-red-500 hover:bg-red-50">删除</a>
      `;
      moreCell.style.position = 'relative';
      moreCell.appendChild(menu);
      
      // 点击外部关闭
      setTimeout(() => {
        document.addEventListener('click', function close() {
          menu.remove();
          document.removeEventListener('click', close);
        }, { once: true });
      }, 0);
    }

    // 停用/启用
    async function togglePaperStatus(id) {
      const paper = papersAllData.find(p => p.id === id);
      if (!paper) return;
      const newStatus = paper.status === 'disabled' ? 'draft' : 'disabled';
      const updated = { ...paper, status: newStatus, updatedAt: new Date().toISOString() };
      try {
        await savePaperToBackend(updated);
        const idx = papersAllData.findIndex(p => p.id === id);
        if (idx >= 0) papersAllData[idx] = updated;
        renderPaperList(applyPaperFilters());
        toast(newStatus === 'disabled' ? '已停用' : '已启用');
      } catch (e) {
        toast('操作失败: ' + e.message, 'error');
      }
    }

    // 复制试卷
    async function duplicatePaper(id) {
      const paper = papersAllData.find(p => p.id === id);
      if (!paper) return;
      const copy = JSON.parse(JSON.stringify(paper));
      copy.id = 'paper_' + Date.now();
      copy.name = paper.name + ' - 副本';
      copy.status = 'draft';
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = new Date().toISOString();
      try {
        const res = await fetch('/api/papers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(copy)
        });
        const result = await res.json();
        if (!res.ok || result.success === false) {
          toast(result.error || '复制失败', 'error');
          return;
        }
        await loadPapers();
        toast('已复制');
      } catch (e) {
        toast('复制失败', 'error');
      }
    }

    // 格式化日期时间
    function formatDateTime(d) {
      const dt = new Date(d);
      const pad = n => String(n).padStart(2, '0');
      return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }

    // 打开试卷弹窗
    function openPaperModal(id = null) {
      editingPaperId = id;
      paperQuestions = [];
      // 重置从选择器进入编辑流程的状态，避免普通新建/编辑被错误路由回选择器
      paperEditorReturnToPicker = false;
      paperPickerReturnCallback = null;
      
      document.getElementById('paperId').value = id || '';
      document.getElementById('paperModalTitle').textContent = id ? '编辑试卷' : '新建试卷';
      document.getElementById('paperName').value = '';
      document.getElementById('paperCategory').value = '';
      document.getElementById('paperDesc').value = '';
      // 重置出卷方式为固定试卷
      const fixedRadio = document.querySelector('input[name="paperType"][value="fixed"]');
      if (fixedRadio) fixedRadio.checked = true;
      
      // 加载分类下拉（与试题管理使用相同数据源）
      fillCategorySelect('paperCategory');
      
      const modal = document.getElementById('paperModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      
      if (id) loadPaperForEdit(id);
    }

    // 关闭试卷弹窗
    function closePaperModal() {
      const modal = document.getElementById('paperModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      editingPaperId = null;
      paperQuestions = [];
    }

    // 试卷选择器相关
    let paperPickerCallback = null;
    let paperPickerSelectedId = null;
    let paperPickerPage = 1;
    let paperPickerKeyword = '';
    const paperPickerPageSize = 10;
    let paperEditorReturnToPicker = false;
    let paperEditorCreatedPaperId = null;
    let paperPickerReturnCallback = null;

    function openPaperPickerModal(onConfirm, selectedPaperId = null) {
      paperPickerCallback = onConfirm;
      paperPickerSelectedId = selectedPaperId;
      paperPickerPage = 1;
      paperPickerKeyword = '';
      const searchInput = document.getElementById('paper-picker-search');
      if (searchInput) searchInput.value = '';
      const modal = document.getElementById('paperPickerModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      renderPaperPickerList();
    }

    function closePaperPickerModal() {
      const modal = document.getElementById('paperPickerModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      paperPickerCallback = null;
      paperPickerSelectedId = null;
    }

    function getPaperPickerList() {
      let papers = papersAllData;
      if (paperPickerKeyword.trim()) {
        const kw = paperPickerKeyword.trim().toLowerCase();
        papers = papers.filter(p => (p.name || '').toLowerCase().includes(kw));
      }
      // 按创建时间倒序
      return papers.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    function renderPaperPickerList() {
      const list = getPaperPickerList();
      const total = list.length;
      const totalPages = Math.max(1, Math.ceil(total / paperPickerPageSize));
      if (paperPickerPage > totalPages) paperPickerPage = totalPages;
      const start = (paperPickerPage - 1) * paperPickerPageSize;
      const pageList = list.slice(start, start + paperPickerPageSize);

      const tbody = document.getElementById('paper-picker-list');
      const empty = document.getElementById('paper-picker-empty');
      if (total === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        renderPaperPickerPagination(0, 0);
        return;
      }
      empty.classList.add('hidden');
      tbody.innerHTML = pageList.map(p => {
        const checked = String(paperPickerSelectedId) === String(p.id) ? 'checked' : '';
        const typeLabel = p.type === 'random' ? '随机试卷' : '固定试卷';
        const createdAt = formatPaperDate(p.createdAt);
        return `
          <tr class="hover:bg-slate-50 cursor-pointer" onclick="selectPaperPickerRow('${p.id}')">
            <td class="px-5 py-3">
              <input type="radio" name="paper-picker-radio" value="${p.id}" ${checked} onclick="event.stopPropagation(); selectPaperPickerRow('${p.id}')"
                class="w-4 h-4 text-indigo-500 focus:ring-indigo-500 border-slate-300">
            </td>
            <td class="px-5 py-3 font-medium text-indigo-600">${escHtml(p.name || '未命名试卷')}</td>
            <td class="px-5 py-3 text-slate-600">${typeLabel}</td>
            <td class="px-5 py-3 text-slate-500">${createdAt}</td>
            <td class="px-5 py-3 text-slate-500">${escHtml(p.creator || p.createdBy || '-')}</td>
          </tr>
        `;
      }).join('');
      renderPaperPickerPagination(totalPages, total);
    }

    function renderPaperPickerPagination(totalPages, total) {
      const el = document.getElementById('paper-picker-pagination');
      if (totalPages <= 1) {
        el.innerHTML = `<span class="text-xs text-slate-400">共 ${total} 条</span>`;
        return;
      }
      let html = `<button onclick="changePaperPickerPage(${paperPickerPage - 1})" ${paperPickerPage <= 1 ? 'disabled' : ''} class="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white">&lt;</button>`;
      for (let i = 1; i <= totalPages; i++) {
        if (i === paperPickerPage) {
          html += `<span class="px-2 py-1 rounded bg-indigo-500 text-white text-xs">${i}</span>`;
        } else {
          html += `<button onclick="changePaperPickerPage(${i})" class="px-2 py-1 rounded border border-slate-200 hover:bg-white text-xs">${i}</button>`;
        }
      }
      html += `<button onclick="changePaperPickerPage(${paperPickerPage + 1})" ${paperPickerPage >= totalPages ? 'disabled' : ''} class="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white">&gt;</button>`;
      html += `<span class="text-xs text-slate-400 ml-2">共 ${total} 条</span>`;
      el.innerHTML = html;
    }

    function changePaperPickerPage(page) {
      const list = getPaperPickerList();
      const totalPages = Math.max(1, Math.ceil(list.length / paperPickerPageSize));
      if (page < 1 || page > totalPages) return;
      paperPickerPage = page;
      renderPaperPickerList();
    }

    function onPaperPickerSearch(input) {
      paperPickerKeyword = input.value;
      paperPickerPage = 1;
      renderPaperPickerList();
    }

    function selectPaperPickerRow(paperId) {
      paperPickerSelectedId = paperId;
      renderPaperPickerList();
    }

    function confirmPaperPicker() {
      if (!paperPickerSelectedId) {
        toast('请选择一份试卷', 'warning');
        return;
      }
      let papers = papersAllData;
      const paper = papers.find(p => String(p.id) === String(paperPickerSelectedId));
      if (paper && paperPickerCallback) {
        paperPickerCallback(paper);
      }
      closePaperPickerModal();
    }

    function createPaperFromPicker() {
      // 关闭选择器，打开新建试卷弹窗；保存后进入行内试卷编辑器，完成后返回选择器
      const returnCb = paperPickerCallback;
      closePaperPickerModal();
      openPaperModal();
      // 在 openPaperModal 重置状态后再标记：从选择器进入编辑流程
      paperPickerReturnCallback = returnCb;
      paperEditorReturnToPicker = true;
    }

    function formatPaperDate(dateStr) {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }

    // 加载试卷数据用于编辑
    async function loadPaperForEdit(id) {
      try {
        let paper = papersAllData.find(p => p.id === id);
        
        if (!paper) {
          toast('试卷不存在', 'error');
          return;
        }
        
        document.getElementById('paperName').value = paper.name || '';
        document.getElementById('paperCategory').value = paper.category || '';
        document.getElementById('paperDesc').value = paper.description || '';
        // 回填出卷方式
        const typeRadio = document.querySelector(`input[name="paperType"][value="${paper.type || 'fixed'}"]`);
        if (typeRadio) typeRadio.checked = true;
        // 弹窗已精简，duration/passScore 等字段在编辑页设置
        const elDuration = document.getElementById('paperDuration');
        if (elDuration) elDuration.value = paper.duration || 60;
        const elPassScore = document.getElementById('paperPassScore');
        if (elPassScore) elPassScore.value = paper.passScore || 60;
        const elMaxAttempts = document.getElementById('paperMaxAttempts');
        if (elMaxAttempts) elMaxAttempts.value = paper.maxAttempts || 0;
        const elShuffle = document.getElementById('paperShuffle');
        if (elShuffle) elShuffle.checked = !!paper.shuffle;
        const elShowAnswer = document.getElementById('paperShowAnswer');
        if (elShowAnswer) elShowAnswer.checked = paper.showAnswer !== false;
        
        // 加载题目
        paperQuestions = (paper.questions || []).map((q, idx) => ({
          questionId: q.questionId,
          score: q.score || 5,
          order: q.order !== undefined ? q.order : idx,
          content: q.content || '(题目内容)',
          type: q.type || 'single'
        }));
        
        renderPaperQuestions();
      } catch (e) {
        console.error('加载试卷失败:', e);
        toast('加载试卷失败', 'error');
      }
    }

    // 渲染试卷题目列表（弹窗内，已弃用，改用编辑页）
    function renderPaperQuestions() {
      // 如果在统一编辑器模式下，同步更新编辑器
      if (editorMode && document.getElementById('unifiedEditorContainer') && document.getElementById('unifiedEditorContainer').style.display !== 'none') {
        renderUnifiedEditor();
        return;
      }
      const container = document.getElementById('paperQuestionList');
      const statsEl = document.getElementById('paperQuestionStats');
      if (!container) return;
      
      const totalScore = paperQuestions.reduce((sum, q) => sum + (q.score || 0), 0);
      statsEl.textContent = `共 ${paperQuestions.length} 题，总分 ${totalScore} 分`;
      
      if (!paperQuestions.length) {
        container.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">暂未添加题目，请点击上方按钮从题库选择</p>';
        return;
      }
      
      const typeNames = { single: '单选', multiple: '多选', judge: '判断', fill: '填空', essay: '问答' };
      
      container.innerHTML = paperQuestions.map((q, i) => `
        <div class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 text-sm group hover:border-indigo-300 transition">
          <div class="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold cursor-move" title="拖拽排序">
            ${i + 1}
          </div>
          <div class="flex-1 min-w-0">
            <div class="line-clamp-1 font-medium text-slate-700">${escHtml(q.content)}</div>
            <div class="text-xs text-slate-400 mt-0.5">${typeNames[q.type] || q.type}</div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="text-xs text-slate-400">分值</span>
            <input type="number" value="${q.score}" min="1" max="100" onchange="updatePaperQuestionScore(${i}, this.value)"
              class="w-14 px-2 py-1 border border-slate-200 rounded-lg text-center text-xs focus:ring-2 focus:ring-indigo-500 outline-none">
            <button type="button" onclick="movePaperQuestion(${i}, -1)" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition" title="上移" ${i === 0 ? 'disabled' : ''}>
              <i class="fas fa-chevron-up text-xs"></i>
            </button>
            <button type="button" onclick="movePaperQuestion(${i}, 1)" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition" title="下移" ${i === paperQuestions.length - 1 ? 'disabled' : ''}>
              <i class="fas fa-chevron-down text-xs"></i>
            </button>
            <button type="button" onclick="removePaperQuestion(${i})" class="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="删除">
              <i class="fas fa-times text-xs"></i>
            </button>
          </div>
        </div>
      `).join('');
    }

    // 更新题目分值
    function updatePaperQuestionScore(idx, val) {
      if (paperQuestions[idx]) {
        paperQuestions[idx].score = parseInt(val) || 1;
        if (editorMode) {
          renderUnifiedEditor();
        } else {
          renderPaperQuestions();
        }
      }
    }

    // 移动题目位置
    function movePaperQuestion(idx, direction) {
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= paperQuestions.length) return;

      const temp = paperQuestions[idx];
      paperQuestions[idx] = paperQuestions[newIdx];
      paperQuestions[newIdx] = temp;

      // 更新order
      paperQuestions.forEach((q, i) => q.order = i);
      if (editorMode) {
        renderUnifiedEditor();
      } else {
        renderPaperQuestions();
      }
    }

    // 删除题目
    function removePaperQuestion(idx) {
      paperQuestions.splice(idx, 1);
      paperQuestions.forEach((q, i) => q.order = i);
      if (editorMode) {
        renderUnifiedEditor();
      } else {
        renderPaperQuestions();
      }
    }

    // 保存试卷
    async function savePaper(e) {
      if (e) e.preventDefault();

      const name = document.getElementById('paperName').value.trim();
      if (!name) {
        toast('请输入试卷名称', 'error');
        return;
      }
      if (name.length > 50) {
        toast('试卷名称不能超过 50 字', 'error');
        return;
      }

      const category = document.getElementById('paperCategory').value;
      if (!category) {
        toast('请选择试卷分类', 'error');
        return;
      }

      const isNew = !editingPaperId;
      const payload = {
        name: name,
        categoryId: category,
        categoryName: (data.categories || []).find(c => String(c.id) === String(category))?.name || '',
        description: document.getElementById('paperDesc').value.trim(),
        duration: 60,
        passScore: 60,
        maxAttempts: 0,
        shuffle: false,
        showAnswer: true,
        uniformScore: 5,
        questions: isNew ? [] : (paperQuestions || []).map((q, i) => ({
          questionId: q.questionId || q.id,
          score: q.score || 0,
          order: i,
          content: q.content,
          type: q.type,
          options: q.options || [],
          answer: q.answer || '',
          explanation: q.explanation || ''
        })),
        status: 'draft',
        type: document.querySelector('input[name="paperType"]:checked')?.value || 'fixed',
        updatedAt: new Date().toISOString(),
        creator: '当前用户',
        createdBy: '当前用户'
      };
      if (isNew) {
        payload.id = 'paper_' + Date.now();
        payload.createdAt = new Date().toISOString();
      }

      try {
        const url = isNew ? '/api/papers' : `/api/papers/${editingPaperId}`;
        const method = isNew ? 'POST' : 'PUT';
        const bodyPayload = isNew ? payload : { ...payload, id: editingPaperId };
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
        const result = await res.json();
        if (!res.ok || result.success === false) {
          toast(result.error || '保存失败', 'error');
          return;
        }

        const savedId = result.data?.id || payload.id;
        closePaperModal();
        await loadPapers();
        toast(isNew ? '试卷创建成功，正在进入编辑页面...' : '试卷已更新');

        if (isNew) {
          setTimeout(function() {
            try {
              if (paperEditorReturnToPicker) {
                openInlinePaperEditor(savedId);
              } else {
                openPaperEditor(savedId);
              }
            } catch (err) {
              console.error('[savePaper] 打开编辑器失败:', err);
              toast('打开编辑器失败: ' + err.message, 'error');
            }
          }, 400);
        }
      } catch (err) {
        toast('保存失败: ' + err.message, 'error');
      }
    }

    // 打开试卷编辑页面（内联全屏编辑）
    async function openPaperEditor(id) {
      console.log('[openPaperEditor] 开始, id:', id);
      editorMode = 'paper';
      var paper = papersAllData.find(function(p) { return p.id === id; });
      if (!paper) {
        console.error('[openPaperEditor] 试卷不存在! id:', id, 'papersAllData:', papersAllData.map(function(p){return p.id;}));
        toast('试卷不存在', 'error');
        editorMode = null;
        return;
      }
      editingPaperId = id;
      console.log('[openPaperEditor] 找到试卷:', paper.name, '题目数:', (paper.questions||[]).length);

      // 先用本地数据构建 paperQuestions
      paperQuestions = (paper.questions || []).map(function(pq, idx) {
        return {
          questionId: pq.questionId,
          score: pq.score || 0,
          partialScore: pq.partialScore || 0,
          order: idx,
          content: pq.content || '(题目内容)',
          type: pq.type || 'single',
          options: pq.options || [],
          answer: pq.answer || '',
          explanation: pq.explanation || ''
        };
      });

      // 隐藏试卷列表，显示编辑器
      var listView = document.getElementById('paperListView');
      console.log('[openPaperEditor] paperListView:', !!listView);
      if (listView) listView.classList.add('hidden');
      var container = document.getElementById('unifiedEditorContainer');
      console.log('[openPaperEditor] 已有container:', !!container);
      // 确保 container 在正确的 tab 中
      if (container && container.parentElement && container.parentElement.id !== 'tab-paper-mgmt') {
        console.log('[openPaperEditor] container 在错误的 tab 中, 当前父:', container.parentElement.id, '→ 移动到 paper-mgmt');
        container.parentElement.removeChild(container);
        container = null;
      }
      if (!container) {
        container = document.createElement('div');
        container.id = 'unifiedEditorContainer';
        document.getElementById('tab-paper-mgmt').appendChild(container);
        console.log('[openPaperEditor] 创建了新container');
      }
      container.style.display = 'block';
      container.classList.remove('hidden');
      renderUnifiedEditor();
      console.log('[openPaperEditor] renderUnifiedEditor 完成, container.innerHTML长度:', container.innerHTML.length);

      // 异步加载题库数据来补充题目详情
      enrichQuestionDetails();
    }

    // 从试卷选择器内打开行内试卷编辑器
    async function openInlinePaperEditor(id) {
      console.log('[openInlinePaperEditor] 开始, id:', id);
      editorMode = 'paper';
      paperEditorCreatedPaperId = id;
      var paper = papersAllData.find(function(p) { return p.id === id; });
      if (!paper) {
        console.error('[openInlinePaperEditor] 试卷不存在! id:', id);
        toast('试卷不存在', 'error');
        editorMode = null;
        return;
      }
      editingPaperId = id;

      // 构建 paperQuestions
      paperQuestions = (paper.questions || []).map(function(pq, idx) {
        return {
          questionId: pq.questionId,
          score: pq.score || 0,
          partialScore: pq.partialScore || 0,
          order: idx,
          content: pq.content || '(题目内容)',
          type: pq.type || 'single',
          options: pq.options || [],
          answer: pq.answer || '',
          explanation: pq.explanation || ''
        };
      });

      // 显示行内编辑器弹窗
      const inlineModal = document.getElementById('inlinePaperEditorModal');
      inlineModal.classList.remove('hidden');
      inlineModal.classList.add('flex');

      // 将统一编辑器容器移入行内弹窗
      var container = document.getElementById('unifiedEditorContainer');
      if (container) {
        container.parentElement.removeChild(container);
      } else {
        container = document.createElement('div');
        container.id = 'unifiedEditorContainer';
      }
      document.getElementById('inline-paper-editor-body').appendChild(container);
      container.style.display = 'block';
      container.classList.remove('hidden');

      renderUnifiedEditor();
      enrichQuestionDetails();
    }

    // [已统一到 renderUnifiedEditor] createPaperEditorView 和 renderPaperEditorQuestions 已合并到统一编辑器

    // 保存试卷编辑设置
    // 打开试卷信息抽屉
    function openPaperInfoDrawer() {
      const overlay = document.getElementById('paperInfoDrawerOverlay');
      const drawer = document.getElementById('paperInfoDrawer');
      if (overlay) overlay.classList.remove('hidden');
      if (drawer) drawer.classList.remove('translate-x-full');
    }

    // 关闭试卷信息抽屉
    function closePaperInfoDrawer() {
      const overlay = document.getElementById('paperInfoDrawerOverlay');
      const drawer = document.getElementById('paperInfoDrawer');
      if (overlay) overlay.classList.add('hidden');
      if (drawer) drawer.classList.add('translate-x-full');
    }

    // 从抽屉保存试卷信息
    async function savePaperInfoFromDrawer() {
      const paper = papersAllData.find(p => p.id === editingPaperId);
      if (!paper) { toast('试卷不存在', 'error'); return; }
      const name = document.getElementById('peName').value.trim();
      if (!name) { toast('请输入试卷名称', 'error'); return; }
      const updated = { ...paper };
      updated.name = name;
      const catSelect = document.getElementById('peCategoryInput');
      const catId = catSelect ? catSelect.value : '';
      updated.category = catId;
      updated.categoryId = catId;
      updated.categoryName = catSelect && catSelect.selectedIndex > 0 ? catSelect.options[catSelect.selectedIndex].text : '';
      updated.type = document.getElementById('peType').value;
      updated.description = document.getElementById('peDescInput').value.trim();
      updated.updatedAt = new Date().toISOString();
      try {
        await savePaperToBackend(updated);
        const idx = papersAllData.findIndex(p => p.id === editingPaperId);
        if (idx >= 0) papersAllData[idx] = updated;
        // 同步更新标题显示
        var peTitle = document.getElementById('peTitle');
        var peCategory = document.getElementById('peCategory');
        if (peTitle) peTitle.textContent = updated.name;
        if (peCategory) peCategory.textContent = updated.categoryName || '未分类';
        // 如果在统一编辑器中，重新渲染以更新顶栏标题
        if (editorMode === 'paper') renderUnifiedEditor();
        toast('试卷信息已保存');
        closePaperInfoDrawer();
      } catch(e) { toast('保存失败: ' + e.message, 'error'); }
    }

    async function savePaperEditorSettings() {
      const paper = papersAllData.find(p => p.id === editingPaperId);
      if (!paper) { toast('试卷不存在', 'error'); return; }
      const updated = { ...paper };
      updated.questions = paperQuestions.map((q, i) => ({
        questionId: q.questionId,
        score: q.score || 5,
        partialScore: q.partialScore || 0,
        order: i
      }));
      updated.totalScore = paperQuestions.reduce((s, q) => s + (q.score || 0), 0);
      updated.updatedAt = new Date().toISOString();
      try {
        await savePaperToBackend(updated);
        const idx = papersAllData.findIndex(p => p.id === editingPaperId);
        if (idx >= 0) papersAllData[idx] = updated;
        toast('设置已保存');
        renderPaperList(applyPaperFilters());
      } catch(e) { toast('保存失败: ' + e.message, 'error'); }
    }

    // 发布试卷
    async function publishPaper(id) {
      const paperId = id || editingPaperId;
      console.log('[publishPaper] paperId:', paperId, 'editingPaperId:', editingPaperId);
      const paper = papersAllData.find(p => p.id === paperId);
      if (!paper) {
        console.error('[publishPaper] 找不到试卷, paperId:', paperId, 'papersAllData:', papersAllData);
        toast('试卷数据异常，请刷新后重试', 'error');
        return;
      }
      console.log('[publishPaper] paper:', paper.name, 'paperQuestions:', paperQuestions.length);
      if ((paper.questions || []).length === 0 && paperQuestions.length === 0) {
        toast('请先添加题目再发布', 'error');
        return;
      }
      const updated = { ...paper };
      // 先保存题目
      updated.questions = paperQuestions.map((q, i) => ({
        questionId: q.questionId,
        score: q.score || 5,
        partialScore: q.partialScore || 0,
        order: i
      }));
      updated.status = 'published';
      updated.totalScore = paperQuestions.reduce((s, q) => s + (q.score || 0), 0);
      updated.updatedAt = new Date().toISOString();
      console.log('[publishPaper] 准备保存, questions:', updated.questions.length, 'totalScore:', updated.totalScore);
      try {
        await savePaperToBackend(updated);
        const idx = papersAllData.findIndex(p => p.id === paperId);
        if (idx >= 0) papersAllData[idx] = updated;
        console.log('[publishPaper] 保存成功');
        toast('试卷已发布');
        closePaperEditor();
        await loadPapers();
      } catch(e) {
        console.error('[publishPaper] 保存失败:', e);
        toast('发布失败: ' + e.message, 'error');
      }
    }

    // 编辑试卷
    async function editPaper(id) {
      openPaperEditor(id);
    }

    // 删除试卷
    async function deletePaper(id, askConfirm = true) {
      if (askConfirm && !confirm('确定删除这份试卷吗？试卷中的题目图片将一并清理，已关联考试将解除引用。')) return false;

      try {
        const res = await fetch(`/api/papers/${id}`, { method: 'DELETE' });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success !== false) {
          papersAllData = papersAllData.filter(p => p.id !== id);
          if (askConfirm) {
            await loadPapers();
            toast('试卷已删除');
          }
          return true;
        }
        if (askConfirm) toast(result.error || '删除失败', 'error');
        return false;
      } catch (e) {
        if (askConfirm) toast('删除失败', 'error');
        return false;
      }
    }

    // ========== 试卷题目选择器 ==========
    function openPaperQuestionPicker() {
      document.getElementById('paperQpSearch').value = '';
      document.getElementById('paperQpTypeFilter').value = 'all';
      document.getElementById('paperQpDiffFilter').value = '';
      document.getElementById('paperQpBankFilter').value = '';
      paperQpSelectedIds.clear();
      
      const modal = document.getElementById('paperQuestionPickerModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      // 加载题库列表到下拉框
      loadBankFilterOptions();
      loadPaperQuestionPool();
    }

    let paperQpBanks = []; // 缓存题库列表，供表格显示题库名称
    async function loadBankFilterOptions() {
      const sel = document.getElementById('paperQpBankFilter');
      try {
        const res = await fetch('/api/question-banks');
        const result = await res.json();
        const banks = result.data || [];
        paperQpBanks = banks;
        sel.innerHTML = '<option value="">全部题库</option>' + 
          banks.map(b => `<option value="${b.id}">${escHtml(b.name)}${b.questionCount ? ' (' + b.questionCount + '题)' : ''}</option>`).join('');
      } catch (e) {
        console.warn('加载题库列表失败:', e);
      }
    }

    function closePaperQuestionPicker() {
      const modal = document.getElementById('paperQuestionPickerModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      paperQpSelectedIds.clear();
    }

    async function loadPaperQuestionPool() {
      const tbody = document.getElementById('paperQuestionPoolBody');
      tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">加载中...</td></tr>';
      
      const bankFilter = document.getElementById('paperQpBankFilter').value;
      const typeFilter = document.getElementById('paperQpTypeFilter').value;
      const diffFilter = document.getElementById('paperQpDiffFilter').value;
      const search = document.getElementById('paperQpSearch').value.trim().toLowerCase();
      
      try {
        // 构建API查询参数
        const params = new URLSearchParams({ pageSize: '9999' });
        if (bankFilter) params.set('bankId', bankFilter);
        if (typeFilter !== 'all') params.set('type', typeFilter);
        if (diffFilter) params.set('difficulty', diffFilter);
        if (search) params.set('keyword', search);

        const res = await fetch('/api/questions?' + params);
        const result = await res.json();
        let questions = result.data || [];
        
        // 过滤已添加的题目
        const existingIds = new Set(paperQuestions.map(q => Number(q.questionId)));
        
        paperQpAllQuestions = questions.filter(q => {
          if (existingIds.has(q.id)) return false;
          return true;
        });
        
        if (!paperQpAllQuestions.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">暂无符合条件的题目</td></tr>';
          return;
        }
        
        const typeNames = { single: '单选', multiple: '多选', judge: '判断', fill: '填空', essay: '问答' };
        const bankById = id => (paperQpBanks || []).find(b => String(b.id) === String(id));

        tbody.innerHTML = paperQpAllQuestions.map(q => {
          const bank = bankById(q.bankId);
          const bankName = bank ? bank.name : (q.bankId ? '未知题库' : '未分类');
          return `
          <tr class="hover:bg-slate-50">
            <td class="py-3">
              <input type="checkbox" value="${q.id}" onchange="togglePaperQpSelection('${q.id}')" 
                ${paperQpSelectedIds.has(q.id) ? 'checked' : ''} class="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500">
            </td>
            <td class="py-3">
              <div class="text-sm text-slate-700 line-clamp-2">${escHtml(q.title || q.content || '(无标题)')}</div>
            </td>
            <td class="py-3">
              <span class="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-600 truncate max-w-[120px] inline-block" title="${escHtml(bankName)}">${escHtml(bankName)}</span>
            </td>
            <td class="py-3 text-center">
              <span class="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-600">${typeNames[q.type] || q.type}</span>
            </td>
            <td class="py-3 text-center">
              <span class="text-xs ${q.difficulty === 'easy' ? 'text-green-500' : q.difficulty === 'hard' ? 'text-red-500' : 'text-amber-500'}">
                ${q.difficulty === 'easy' ? '简单' : q.difficulty === 'hard' ? '困难' : '中等'}
              </span>
            </td>
          </tr>
        `}).join('');
        
        updatePaperQpCheckedCount();
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-red-500">加载失败</td></tr>';
      }
    }

    function togglePaperQpSelection(id) {
      const numId = Number(id);
      if (paperQpSelectedIds.has(numId)) {
        paperQpSelectedIds.delete(numId);
      } else {
        paperQpSelectedIds.add(numId);
      }
      updatePaperQpCheckedCount();
    }

    function togglePaperQpSelectAll() {
      const checked = document.getElementById('paperQpSelectAll').checked;
      if (checked) {
        paperQpAllQuestions.forEach(q => paperQpSelectedIds.add(q.id));
      } else {
        paperQpSelectedIds.clear();
      }
      loadPaperQuestionPool();
    }

    function updatePaperQpCheckedCount() {
      document.getElementById('paperQpCheckedCount').textContent = paperQpSelectedIds.size;
    }

    function confirmPaperQuestionPick() {
      if (!paperQpSelectedIds.size) {
        toast('请至少选择一道题目', 'error');
        return;
      }
      
      const uniformScoreEl = document.getElementById('peUniformScore');
      const defaultScore = uniformScoreEl ? (parseInt(uniformScoreEl.value) || 0) : 0;
      
      paperQpAllQuestions.forEach(q => {
        if (paperQpSelectedIds.has(q.id)) {
          paperQuestions.push({
            questionId: q.id,
            score: defaultScore,
            order: paperQuestions.length,
            content: q.title || q.content || '(无标题)',
            type: q.type,
            options: q.options || [],
            answer: q.answer || '',
            explanation: q.explanation || ''
          });
        }
      });
      
      // paperQuestions 是两种模式的唯一数据源，直接重新渲染
      if (editorMode) {
        renderUnifiedEditor();
      } else {
        renderPaperQuestions();
      }
      closePaperQuestionPicker();
      toast(`已添加 ${paperQpSelectedIds.size} 道题目`);
    }

    // ========== 分数设置弹窗 ==========
    let ssCurrentTab = 'type';
    let ssTypeScores = {}; // { single: 5, multiple: 10, ... }

    function openScoreSettingsModal() {
      if (!paperQuestions.length) {
        toast('请先添加题目再设置分数', 'error');
        return;
      }
      ssCurrentTab = 'type';
      switchScoreSettingsTab('type');
      const modal = document.getElementById('scoreSettingsModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeScoreSettingsModal() {
      const modal = document.getElementById('scoreSettingsModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function switchScoreSettingsTab(tab) {
      ssCurrentTab = tab;
      const typeTab = document.getElementById('ssTabType');
      const qTab = document.getElementById('ssTabQuestion');
      const typePanel = document.getElementById('ssTypePanel');
      const qPanel = document.getElementById('ssQuestionPanel');

      if (tab === 'type') {
        typeTab.className = 'px-4 py-3 text-sm font-medium border-b-2 border-indigo-500 text-indigo-600 transition';
        qTab.className = 'px-4 py-3 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition';
        typePanel.classList.remove('hidden');
        qPanel.classList.add('hidden');
        renderScoreSettingsByType();
      } else {
        qTab.className = 'px-4 py-3 text-sm font-medium border-b-2 border-indigo-500 text-indigo-600 transition';
        typeTab.className = 'px-4 py-3 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition';
        qPanel.classList.remove('hidden');
        typePanel.classList.add('hidden');
        renderScoreSettingsByQuestion();
      }
      updateSsTotalScore();
    }

    function renderScoreSettingsByType() {
      const typeNames = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };
      const typeCounts = {};
      paperQuestions.forEach(q => {
        typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
      });

      // 读取当前各题型的分值（从已有题目中取第一个该类型的分值）
      const currentScores = {};
      paperQuestions.forEach(q => {
        if (!(q.type in currentScores)) currentScores[q.type] = q.score || 0;
      });
      ssTypeScores = { ...currentScores };

      // 读取多选题漏选得分
      const multipleQ = paperQuestions.find(q => q.type === 'multiple');
      const multiplePartial = multipleQ ? (multipleQ.partialScore || 0) : 0;

      const container = document.getElementById('ssTypeList');
      container.innerHTML = Object.keys(typeNames).map(type => {
        const count = typeCounts[type] || 0;
        const score = ssTypeScores[type] || 0;
        const total = (count * score).toFixed(1);
        
        let extraField = '';
        if (type === 'multiple') {
          extraField = `
            <span class="text-sm text-slate-500 ml-4 whitespace-nowrap">漏选得分</span>
            <input type="number" id="ssPartialScore_multiple" value="${multiplePartial}" min="0" max="100" step="0.5"
              class="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm focus:ring-2 focus:ring-indigo-500 outline-none flex-shrink-0"
              placeholder="请输入">
          `;
        }

        return `
          <div class="flex items-center gap-3 py-4 border-b border-slate-100 flex-nowrap">
            <div class="w-24 text-sm font-semibold text-slate-700 whitespace-nowrap">[${typeNames[type]}]</div>
            <div class="flex items-center gap-1 text-sm text-slate-600 whitespace-nowrap">
              <span class="font-medium">${count}</span>
              <span>题 ×</span>
            </div>
            <span class="text-sm text-slate-500 ml-2 whitespace-nowrap">每题分值：</span>
            <input type="number" value="${count > 0 ? score : ''}" min="0" max="100" step="0.5"
              onchange="onSsTypeScoreChange('${type}', this.value)"
              class="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm focus:ring-2 focus:ring-indigo-500 outline-none flex-shrink-0"
              placeholder="请输入" ${count === 0 ? 'disabled' : ''}>
            <span class="text-sm text-slate-400 whitespace-nowrap">分/题</span>
            ${extraField && type === 'multiple' ? extraField : ''}
            <span class="text-sm text-slate-500 ml-auto whitespace-nowrap flex items-center gap-1">共<strong class="text-slate-700 font-semibold" id="ssTypeTotal_${type}">${total}</strong>分</span>
          </div>
        `;
      }).join('');
    }

    function onSsTypeScoreChange(type, value) {
      ssTypeScores[type] = parseFloat(value) || 0;
      const typeCounts = {};
      paperQuestions.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
      const count = typeCounts[type] || 0;
      const total = (count * ssTypeScores[type]).toFixed(1);
      const el = document.getElementById('ssTypeTotal_' + type);
      if (el) el.textContent = total;
      updateSsTotalScore();
    }

    function renderScoreSettingsByQuestion() {
      const typeNames = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };
      const tbody = document.getElementById('ssQuestionList');
      const emptyEl = document.getElementById('ssQuestionEmpty');

      if (!paperQuestions.length) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');

      tbody.innerHTML = paperQuestions.map((q, i) => {
        const partialScore = q.partialScore || 0;
        const isMultiple = q.type === 'multiple';
        return `
        <tr class="hover:bg-slate-50">
          <td class="py-3 pr-4">
            <div class="text-sm text-slate-700 line-clamp-1">${escHtml(q.content || '(无标题)')}</div>
          </td>
          <td class="py-3 text-center">
            <span class="text-xs text-slate-500">${typeNames[q.type] || q.type}</span>
          </td>
          <td class="py-3 text-center text-sm text-slate-600">${q.score || '-'}</td>
          <td class="py-3 text-center">
            <input type="number" value="${q.score || ''}" min="0" max="100" step="0.5"
              data-idx="${i}" onchange="onSsQuestionScoreChange(${i}, this.value)"
              class="w-20 px-2 py-1 border border-slate-200 rounded-lg text-center text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="请输入">
          </td>
          <td class="py-3 text-center">
            ${isMultiple ? `
              <input type="number" value="${partialScore}" min="0" max="100" step="0.5"
                data-idx="${i}" onchange="onSsPartialScoreChange(${i}, this.value)"
                class="w-20 px-2 py-1 border border-slate-200 rounded-lg text-center text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            ` : '<span class="text-slate-400">/</span>'}
          </td>
        </tr>
      `}).join('');
    }

    function onSsQuestionScoreChange(idx, value) {
      if (paperQuestions[idx]) {
        paperQuestions[idx].score = parseFloat(value) || 0;
      }
      updateSsTotalScore();
    }

    function onSsPartialScoreChange(idx, value) {
      if (paperQuestions[idx]) {
        paperQuestions[idx].partialScore = parseFloat(value) || 0;
      }
    }

    function updateSsTotalScore() {
      let total = 0;
      if (ssCurrentTab === 'type') {
        const typeCounts = {};
        paperQuestions.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
        Object.keys(typeCounts).forEach(type => {
          total += typeCounts[type] * (ssTypeScores[type] || 0);
        });
      } else {
        total = paperQuestions.reduce((sum, q) => sum + (q.score || 0), 0);
      }
      document.getElementById('ssTotalScore').textContent = total.toFixed(1);
    }

    function applyScoreSettings() {
      if (ssCurrentTab === 'type') {
        // 按题型批量设置
        paperQuestions.forEach(q => {
          if (ssTypeScores[q.type] !== undefined) {
            q.score = ssTypeScores[q.type];
          }
        });
        // 保存多选题漏选得分
        const partialInput = document.getElementById('ssPartialScore_multiple');
        if (partialInput) {
          const partialVal = parseFloat(partialInput.value) || 0;
          paperQuestions.forEach(q => {
            if (q.type === 'multiple') q.partialScore = partialVal;
          });
        }
      }
      // 按试题设分已在 onchange 中实时更新
      // paperQuestions 是两种模式的唯一数据源
      if (editorMode) {
        renderUnifiedEditor();
      } else {
        renderPaperQuestions();
      }
      closeScoreSettingsModal();
      toast('分数设置已应用');
    }

    // ========== 题目选择器 ==========
    let qpAllQuestions = [];

    let qpBanks = []; // 缓存题库列表，供考试选题表格显示题库名称
    function openQuestionPicker() {
      document.getElementById('qpSearch').value = '';
      document.getElementById('qpTypeFilter').value = 'all';
      document.getElementById('qpDiffFilter').value = '';
      document.getElementById('qpBankFilter').value = '';
      const modal = document.getElementById('questionPickerModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      loadQpBankFilterOptions();
      loadQuestionPool();
    }

    async function loadQpBankFilterOptions() {
      const sel = document.getElementById('qpBankFilter');
      try {
        const res = await fetch('/api/question-banks');
        const result = await res.json();
        const banks = result.data || [];
        qpBanks = banks;
        sel.innerHTML = '<option value="">全部题库</option>' +
          banks.map(b => `<option value="${b.id}">${escHtml(b.name)}${b.questionCount ? ' (' + b.questionCount + '题)' : ''}</option>`).join('');
      } catch (e) {
        console.warn('加载题库列表失败:', e);
      }
    }

    function closeQuestionPicker() {
      ivPickerTarget = null; // 关闭选择器时清理互动视频状态，避免影响考试/试卷选题
      const modal = document.getElementById('questionPickerModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    async function loadQuestionPool() {
      const tbody = document.getElementById('questionPoolBody');
      tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400">加载中...</td></tr>';
      try {
        const params = new URLSearchParams({ pageSize: 200 });
        const bankFilter = document.getElementById('qpBankFilter').value;
        const typeFilter = document.getElementById('qpTypeFilter').value;
        const diffFilter = document.getElementById('qpDiffFilter').value;
        const search = document.getElementById('qpSearch').value.trim();
        if (bankFilter) params.set('bankId', bankFilter);
        if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
        if (diffFilter && diffFilter !== 'all') params.set('difficulty', diffFilter);
        if (search) params.set('keyword', search);

        const res = await fetch('/api/questions?' + params);
        const result = await res.json();
        const questions = result.data || [];
        qpAllQuestions = questions;
        updateQpCheckState();
        if (!questions.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400">没有符合条件的题目</td></tr>';
          return;
        }
        const typeName = t => ({ single:'单选题', multiple:'多选题', judge:'判断题', fill:'填空题', essay:'问答题' })[t] || t;
        const diffName = d => ({ easy:'简单', medium:'中等', hard:'困难' })[d] || d;
        const bankById = id => (qpBanks || []).find(b => String(b.id) === String(id));
        tbody.innerHTML = questions.map((q, i) => {
          const bank = bankById(q.bankId);
          const bankName = bank ? bank.name : (q.bankId ? '未知题库' : '未分类');
          return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2"><input type="checkbox" class="qp-cb" data-idx="${i}" onchange="updateQpCheckedCount()" ${isQpSelected(q.id) ? 'checked disabled' : ''}></td>
            <td class="py-2 pr-4"><span class="line-clamp-2">${escHtml(q.title || q.content || '')}</span></td>
            <td class="py-2"><span class="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs truncate max-w-[120px] inline-block" title="${escHtml(bankName)}">${escHtml(bankName)}</span></td>
            <td class="py-2"><span class="px-1.5 py-0.5 bg-slate-100 rounded text-xs">${typeName(q.type)}</span></td>
            <td class="py-2"><span class="px-1.5 py-0.5 rounded text-xs ${q.difficulty==='hard'?'bg-red-100 text-red-600':q.difficulty==='easy'?'bg-green-100 text-green-600':'bg-yellow-100 text-yellow-700'}">${diffName(q.difficulty)}</span></td>
            <td class="py-2"><input type="number" value="${getQpScore(q.id)}" min="1" max="100" class="w-12 px-1 border border-slate-200 rounded text-center text-xs qp-score" data-qid="${q.id}" ${!isQpSelected(q.id)?'disabled':''}></td>
          </tr>`}).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-red-500">加载失败</td></tr>';
      }
    }

    function isQpSelected(questionId) {
      return selectedExamQuestions.some(sq => sq.questionId === questionId);
    }

    function getQpScore(questionId) {
      const found = selectedExamQuestions.find(sq => sq.questionId === questionId);
      return found ? found.score : 1;
    }

    function toggleQpSelectAll() {
      const checked = document.getElementById('qpSelectAll').checked;
      document.querySelectorAll('.qp-cb:not(:disabled)').forEach(cb => { cb.checked = checked; });
      updateQpCheckedCount();
    }

    function updateQpCheckState() {
      const cbs = Array.from(document.querySelectorAll('.qp-cb:not(:disabled)'));
      const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
      document.getElementById('qpSelectAll').checked = allChecked;
      document.getElementById('qpSelectAll').indeterminate = !allChecked && cbs.some(cb => cb.checked);
      updateQpCheckedCount();
    }

    function updateQpCheckedCount() {
      const count = Array.from(document.querySelectorAll('.qp-cb:checked')).length;
      document.getElementById('qpCheckedCount').textContent = count;
    }

    function confirmQuestionPick() {
      try {
        const checkedCbs = document.querySelectorAll('.qp-cb:checked');
        if (!checkedCbs.length) { toast('请先勾选要添加的题目', 'warning'); return; }
        // 互动视频模式：只有 ivState 仍存在时才落入互动节点，避免状态残留污染考试/试卷
        if (ivPickerTarget && ivState) {
          ivHandlePickedQuestions(checkedCbs);
          closeQuestionPicker();
          return;
        }
        const isPaperEditor = editorMode === 'paper' || (document.getElementById('unifiedEditorContainer') && document.getElementById('unifiedEditorContainer').style.display !== 'none');
        checkedCbs.forEach(cb => {
          const idx = parseInt(cb.dataset.idx);
          const q = qpAllQuestions[idx];
          if (q) {
            const scoreInput = document.querySelector(`.qp-score[data-qid="${q.id}"]`);
            const score = scoreInput ? parseInt(scoreInput.value) || 5 : 5;
            const qObj = {
              questionId: q.id,
              score: score,
              partialScore: q.type === 'multiple' ? 0 : undefined,
              content: q.title || q.content,
              type: q.type || 'single'
            };
            if (isPaperEditor) {
              if (!paperQuestions.some(pq => pq.questionId === q.id)) {
                qObj.order = paperQuestions.length;
                paperQuestions.push(qObj);
              }
            } else {
              if (!selectedExamQuestions.some(eq => eq.questionId === q.id)) {
                qObj.order = selectedExamQuestions.length;
                selectedExamQuestions.push(qObj);
              }
            }
          }
        });
        if (isPaperEditor) {
          if (editorMode) { renderUnifiedEditor(); } else { renderPaperQuestions(); }
        } else {
          renderSelectedQuestions();
        }
        closeQuestionPicker();
        toast(`已添加 ${checkedCbs.length} 道题目`);
      } catch (err) {
        console.error('confirmQuestionPick error:', err);
        toast('添加题目失败：' + (err && err.message ? err.message : '未知错误'), 'error');
      }
    }

    // ========== 互动视频编辑器（制作互动视频） ==========
    const IV_MAX_NODES = 20;
    let ivState = null;            // { courseId, course, videos:[...], currentVideoIndex }
    let ivPickerTarget = null;     // { videoIndex, nodeType, time }
    let ivPreviewCurrentQuestion = null; // 预览模式当前试题详情（用于渲染对错与解析）
    let ivInsertTime = 0;          // 当前插入位置（秒）
    let ivSelectedNodeId = null;   // 当前选中的节点 id
    let ivPreviewMode = false;
    let ivPreviewFired = new Set();
    let ivPreviewWatchdog = null;   // 预览模式节点触发看门狗定时器
    let ivLastRendered = { videoIndex: null, videoSrc: null }; // 记录上次完整渲染状态，用于增量刷新

    function fmtIvTime(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
    }
    function ivCurrentVideo() { return ivState ? ivState.videos[ivState.currentVideoIndex] : null; }
    function ivSecToPct(t, dur) { return dur ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0; }

    function openInteractionEditor(courseId) {
      courseId = parseInt(courseId);
      if (!courseId || isNaN(courseId)) { toast('请先从课程列表进入', 'warning'); return; }
      Promise.all([
        fetch('/api/courses').then(r => r.json()),
        fetch('/api/questions?pageSize=100000').then(r => r.json()).catch(() => null)
      ]).then(([courses, qres]) => {
        const course = (courses || []).find(c => c.id === courseId);
        if (!course) { toast('未找到课程', 'error'); return; }
        const videos = JSON.parse(JSON.stringify(course.videos || []));
        videos.forEach(v => { if (!Array.isArray(v.interactionNodes)) v.interactionNodes = []; });

        // ====== 本地草稿（储存记录）：双保险，避免服务端/题库异常导致节点丢失 ======
        const draftKey = 'ivideo_draft_' + courseId;
        let draft = null;
        let draftRestored = 0;
        try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (e) {}
        if (draft && Array.isArray(draft.videos)) {
          draft.videos.forEach((dv, i) => {
            if (videos[i] && Array.isArray(dv.interactionNodes)) {
              const srvNodes = videos[i].interactionNodes;
              // 取「节点更多」的一份，确保任何一侧的修改都不会丢
              if (dv.interactionNodes.length >= srvNodes.length) {
                const srvIds = new Set(srvNodes.map(n => n.id));
                // 合并：服务端有而草稿没有的也补回来（并集），避免草稿覆盖掉服务端新增
                const merged = dv.interactionNodes.slice();
                srvNodes.forEach(n => { if (!srvIds.has(n.id)) merged.push(n); });
                draftRestored += merged.length - srvNodes.length; // 仅统计从草稿补回的节点数
                videos[i].interactionNodes = merged;
              }
            }
          });
        }
        // 注意：不再做任何「根据题库比对自动删除节点」的操作——题库查询异常绝不应删除用户已插入的互动内容

        ivState = { courseId, course, videos, currentVideoIndex: 0 };
        ivInsertTime = 0; ivSelectedNodeId = null; ivPreviewMode = false; ivPreviewFired.clear();
        const view = document.getElementById('ivAppView');
        if (view) view.classList.remove('hidden');
        renderInteractionEditor();
        // 若有本地草稿比服务端多，提示已用本地记录恢复（不自动覆盖服务端，等用户点保存再同步）
        if (draftRestored > 0) {
          toast(`已从本地记录恢复 ${draftRestored} 处互动内容，记得点保存同步到服务端`, 'success');
        }
      })
      .catch(() => toast('加载课程失败', 'error'));
    }

    function ivSelectVideo(i) {
      if (!ivState) return;
      ivState.currentVideoIndex = i;
      ivInsertTime = 0; ivSelectedNodeId = null; ivPreviewFired.clear();
      ivStopPreview();
      renderInteractionEditor();
    }

    function ivTrackClick(e) {
      const track = e.currentTarget;
      const rect = track.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const v = ivCurrentVideo();
      const dur = v ? (v.duration || 0) : 0;
      const t = Math.max(0, Math.min(dur, frac * dur));
      // 预览模式：点击轨道仅跳转，不自动弹题（试题由 timeupdate 自然触发）
      if (ivPreviewMode) {
        ivResumePreview(); // 先关闭可能存在的 overlay
        const pv = document.getElementById('ivPreviewVideo');
        if (!pv) return;
        pv.currentTime = t;
        // 重置已触发集合：t 之前的节点视为已播放（不再弹出），t 及之后的节点待播放时触发
        (v.interactionNodes || []).forEach(n => {
          if (n.time < t - 0.001) ivPreviewFired.add(n.id);
          else ivPreviewFired.delete(n.id);
        });
        ivUpdateTrackFill();
        pv.play().catch(() => {});
        return;
      }
      // 编辑模式：点击轨道 → 同步视频位置 + 设置插入位置（两者联动）
      // 注意：不要调用 renderInteractionEditor() 重建 DOM，否则视频元素被替换、currentTime 丢失
      const pv = document.getElementById('ivPreviewVideo');
      if (pv) pv.currentTime = t;
      ivInsertTime = t;
      ivSelectedNodeId = null;
      ivUpdateTrackFill();
      // 仅更新插入位置线的显示，不重建视频
      const oldLine = document.querySelector('.iv-insert-line');
      if (oldLine) oldLine.remove();
      if (!ivPreviewMode) {
        const track = e.currentTarget;
        const insertLine = document.createElement('div');
        insertLine.className = 'absolute top-0 bottom-0 w-0.5 bg-purple-400 pointer-events-none z-20 iv-insert-line';
        insertLine.style.left = ivSecToPct(t, dur) + '%';
        const label = document.createElement('div');
        label.className = 'absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-purple-400 whitespace-nowrap font-medium bg-slate-800 px-1.5 rounded';
        label.textContent = '插入@' + fmtIvTime(t);
        insertLine.appendChild(label);
        track.appendChild(insertLine);
      }
    }

    // 预览模式下，点击视频本身也可以跳转（增强可用性）
    function ivPreviewVideoClick(e) {
      if (!ivPreviewMode) return;
      const pv = e.currentTarget;
      const rect = pv.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const t = frac * (pv.duration || 0);
      if (t < 0 || !isFinite(t)) return;
      // 预览模式点击视频画面：仅跳转，不自动弹题（与轨道行为一致）
      const v = ivCurrentVideo();
      ivResumePreview(); // 先关掉可能存在的 overlay
      pv.currentTime = t;
      (v.interactionNodes || []).forEach(n => {
        if (n.time < t - 0.001) ivPreviewFired.add(n.id);
        else ivPreviewFired.delete(n.id);
      });
      ivUpdateTrackFill();
      pv.play().catch(() => {});
    }

    // 轻量更新轨道「已播放/插入」进度填充，不触发整屏重绘
    function ivUpdateTrackFill() {
      const pv = document.getElementById('ivPreviewVideo');
      const v = ivCurrentVideo();
      const dur = v ? (v.duration || 0) : 0;
      // 优先用视频实际播放位置（编辑模式下视频也在播放），否则用插入光标位置
      let pct;
      if (pv && pv.currentTime > 0 && !ivPreviewMode) {
        // 编辑模式：视频播放中 → 轨道跟随视频进度
        pct = ivSecToPct(pv.currentTime, dur);
      } else if (ivPreviewMode && pv) {
        // 预览模式：轨道跟随预览进度
        pct = ivSecToPct(pv.currentTime, dur);
      } else {
        // 编辑模式未播放：显示插入光标
        pct = ivSecToPct(ivInsertTime, dur);
      }
      const fill = document.getElementById('ivTrackFill');
      if (fill) fill.style.width = pct + '%';
    }

    function ivSelectNode(id, e) {
      if (e) e.stopPropagation();
      // 预览模式：点击节点标记直接跳转到该节点并立即弹出预览，不整屏重绘
      if (ivPreviewMode) {
        const v = ivCurrentVideo();
        const n = (v && v.interactionNodes || []).find(x => x.id === id);
        if (n) {
          const pv = document.getElementById('ivPreviewVideo');
          if (pv) {
            pv.currentTime = n.time;
            (v.interactionNodes || []).forEach(m => { if (m.time < n.time - 0.001) ivPreviewFired.add(m.id); else ivPreviewFired.delete(m.id); });
            ivPreviewFired.add(n.id);
            ivUpdateTrackFill();
            ivShowPreviewOverlay(n, pv); // 直接弹出该题预览
          }
        }
        return;
      }
      ivSelectedNodeId = (ivSelectedNodeId === id) ? null : id;
      renderInteractionEditor();
    }

    function ivAddNode(node) {
      const v = ivCurrentVideo();
      if (!v) return;
      if (!Array.isArray(v.interactionNodes)) v.interactionNodes = [];
      if (v.interactionNodes.length >= IV_MAX_NODES) {
        toast('单个视频最多添加 ' + IV_MAX_NODES + ' 个节点', 'warning');
        return;
      }
      const dur = v.duration || 0;
      if (node.time >= dur) {
        toast('节点时间必须小于视频时长', 'warning');
        return;
      }
      if (node.time < 0) node.time = 0;
      node.id = 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      node.createdAt = new Date().toLocaleString('zh-CN');
      v.interactionNodes.push(node);
      v.interactionNodes.sort((a, b) => a.time - b.time);
      renderInteractionEditor();
    }

    // 更换节点的题目/问卷：重新打开选择器，替换后保留原节点时间
    function ivReplaceNodeQuestion(nodeId) {
      const v = ivCurrentVideo();
      if (!v) return;
      const node = (v.interactionNodes || []).find(n => n.id === nodeId);
      if (!node) { toast('节点不存在', 'error'); return; }
      if (node.type === 'survey' && node.surveyId) {
        // 问卷节点：从调研管理重新选择问卷
        fetch('/api/surveys')
          .then(r => r.json())
          .then(res => {
            const surveys = Array.isArray(res) ? res : (res.data || []);
            const options = surveys.map(s =>
              `<label class="flex items-center p-3 rounded-lg hover:bg-slate-50 cursor-pointer border border-slate-200 mb-2">
                <input type="radio" name="iv-survey-replace" value="${s.id}" class="w-4 h-4 accent-teal-600 mr-3" ${s.id === node.surveyId ? 'checked' : ''}>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-slate-800 truncate">${escHtml(s.title || '未命名调研')}</p>
                  <p class="text-xs text-slate-400">${(s.questions || []).length} 题</p>
                </div>
              </label>`
            ).join('');
            showModal('更换问卷',
              `<p class="text-sm text-slate-500 mb-3">当前：${escHtml(node.surveyTitle || '互动问卷')}</p>
               <div class="max-h-60 overflow-y-auto">${options}</div>`,
              () => {
                const selected = document.querySelector('input[name="iv-survey-replace"]:checked');
                if (!selected) { toast('请选择问卷', 'warning'); return false; }
                const surveyId = parseInt(selected.value);
                const survey = surveys.find(s => s.id === surveyId);
                if (survey) {
                  node.surveyId = surveyId;
                  node.surveyTitle = survey.title || '互动问卷';
                  node.questionRefs = (survey.questions || []).map(q => ({
                    questionId: q.id, score: q.score || 5,
                    content: q.title || q.content || '', type: q.type || 'single'
                  }));
                  renderInteractionEditor();
                  toast('已更换为：' + (survey.title || '未命名调研'));
                }
                return true;
              }, null, '确认更换');
          })
          .catch(() => toast('加载问卷失败', 'error'));
      } else {
        // 试题节点：打开题库选择器
        ivPickerTarget = { videoIndex: ivState.currentVideoIndex, nodeType: 'question', time: node.time, replaceNodeId: nodeId };
        openQuestionPicker();
      }
    }

    function ivSetNodeTime(id, val) {
      const v = ivCurrentVideo();
      if (!v) return;
      const n = (v.interactionNodes || []).find(x => x.id === id);
      if (!n) return;
      let t = parseFloat(val);
      if (isNaN(t)) return;
      const dur = v.duration || 0;
      t = Math.max(0, Math.min(dur - 0.1, t));
      n.time = t;
      v.interactionNodes.sort((a, b) => a.time - b.time);
      renderInteractionEditor();
    }

    function ivRemoveNode(id) {
      const v = ivCurrentVideo();
      if (!v) return;
      v.interactionNodes = (v.interactionNodes || []).filter(x => x.id !== id);
      if (ivSelectedNodeId === id) ivSelectedNodeId = null;
      renderInteractionEditor();
    }

    function ivAddQuestion() {
      const v = ivCurrentVideo();
      if (!v) { toast('请先选择视频', 'warning'); return; }
      ivPickerTarget = { videoIndex: ivState.currentVideoIndex, nodeType: 'question', time: ivInsertTime };
      openQuestionPicker();
    }

    function ivAddSurvey() {
      const v = ivCurrentVideo();
      if (!v) { toast('请先选择视频', 'warning'); return; }
      // 从调研管理获取问卷列表
      fetch('/api/surveys')
        .then(r => r.json())
        .then(res => {
          const surveys = Array.isArray(res) ? res : (res.data || []);
          if (surveys.length === 0) {
            toast('暂无调研问卷，请先在调研管理中创建', 'warning');
            return;
          }
          // 渲染问卷选择弹窗
          const options = surveys.map(s =>
            `<label class="flex items-center p-3 rounded-lg hover:bg-slate-50 cursor-pointer border border-slate-200 mb-2">
              <input type="radio" name="iv-survey-pick" value="${s.id}" class="w-4 h-4 accent-teal-600 mr-3">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 truncate">${escHtml(s.title || '未命名调研')}</p>
                <p class="text-xs text-slate-400">${(s.questions || []).length} 题 · ${s.status === 'published' ? '已发布' : '草稿'}</p>
              </div>
            </label>`
          ).join('');
          showModal('选择调研问卷',
            `<div class="max-h-60 overflow-y-auto">${options}</div>
             <p class="text-xs text-slate-400 mt-2">选择后将在 ${fmtIvTime(ivInsertTime)} 处插入问卷节点，播放时弹出该调研问卷</p>`,
            () => {
              const selected = document.querySelector('input[name="iv-survey-pick"]:checked');
              if (!selected) { toast('请选择一个问卷', 'warning'); return false; }
              const surveyId = parseInt(selected.value);
              const survey = surveys.find(s => s.id === surveyId);
              if (survey) {
                const refs = (survey.questions || []).map(q => ({
                  questionId: q.id,
                  score: q.score || 5,
                  content: q.title || q.content || '',
                  type: q.type || 'single'
                }));
                ivAddNode({
                  type: 'survey',
                  time: ivInsertTime,
                  surveyTitle: survey.title || '互动问卷',
                  surveyId: surveyId,
                  questionRefs: refs
                });
                toast('已插入问卷：' + (survey.title || '未命名调研') + '（' + refs.length + ' 题）');
              }
              return true;
            },
            null,
            '确认插入'
          );
        })
        .catch(() => toast('加载问卷列表失败', 'error'));
    }

    function ivAddKnowledge() {
      const v = ivCurrentVideo();
      if (!v) { toast('请先选择视频', 'warning'); return; }
      const html = `
        <div class="p-6">
          <h3 class="text-lg font-semibold text-slate-800 mb-4">插入知识点</h3>
          <div class="space-y-3">
            <div><label class="block text-sm text-slate-600 mb-1">标题</label><input id="ivKnowTitle" class="w-full px-3 py-2 border rounded-lg" placeholder="知识点标题"></div>
            <div><label class="block text-sm text-slate-600 mb-1">内容</label><textarea id="ivKnowContent" rows="3" class="w-full px-3 py-2 border rounded-lg" placeholder="知识点说明"></textarea></div>
            <div><label class="block text-sm text-slate-600 mb-1">图片URL（可选）</label><input id="ivKnowImg" class="w-full px-3 py-2 border rounded-lg" placeholder="https://..."></div>
            <div class="text-xs text-slate-400">插入位置：${fmtIvTime(ivInsertTime)}</div>
          </div>
          <div class="flex justify-end space-x-2 mt-5">
            <button onclick="closeModal()" class="px-4 py-2 text-sm rounded-lg border">取消</button>
            <button onclick="ivConfirmKnowledge()" class="px-4 py-2 text-sm rounded-lg text-white bg-gradient-to-r from-purple-500 to-indigo-600">确定</button>
          </div>
        </div>`;
      showModal(html);
    }

    function ivConfirmKnowledge() {
      const title = document.getElementById('ivKnowTitle').value.trim();
      const content = document.getElementById('ivKnowContent').value.trim();
      if (!title && !content) { toast('请填写标题或内容', 'warning'); return; }
      ivAddNode({ type: 'knowledge', time: ivInsertTime, title: title || '知识点', content, imageUrl: document.getElementById('ivKnowImg').value.trim() });
      closeModal();
    }

    // 题目选择器确认后落到互动节点
    function ivHandlePickedQuestions(checkedCbs) {
      const target = ivPickerTarget;
      if (!target || !ivState) return;
      const picked = [];
      checkedCbs.forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        const q = qpAllQuestions[idx];
        if (q) picked.push(q);
      });
      if (!picked.length) { ivPickerTarget = null; return; }

      // 更换模式：替换已有节点的题目
      if (target.replaceNodeId) {
        const v = ivCurrentVideo();
        const node = (v && v.interactionNodes || []).find(n => n.id === target.replaceNodeId);
        if (node) {
          const q = picked[0];
          node.questionRefs = [{ questionId: q.id, score: q.score || 5, content: q.title || q.content, type: q.type }];
          toast('已更换题目');
        }
        ivPickerTarget = null;
        renderInteractionEditor();
        return;
      }

      if (target.nodeType === 'question') {
        const q = picked[0];
        ivAddNode({ type: 'question', time: target.time, questionRefs: [{ questionId: q.id, score: q.score || 5, content: q.title || q.content, type: q.type }] });
        toast('已插入试题节点');
      } else if (target.nodeType === 'survey') {
        const refs = picked.map(q => ({ questionId: q.id, score: q.score || 5, content: q.title || q.content, type: q.type }));
        ivAddNode({ type: 'survey', time: target.time, surveyTitle: '互动问卷', questionRefs: refs });
        toast('已插入问卷节点（' + refs.length + ' 题）');
      }
      ivPickerTarget = null;
      renderInteractionEditor();
    }

    function ivAutosaveDraft(showToast = false) {
      if (!ivState) return;
      const draftKey = 'ivideo_draft_' + ivState.courseId;
      try {
        localStorage.setItem(draftKey, JSON.stringify({ videos: ivState.videos, updatedAt: new Date().toLocaleString('zh-CN') }));
        if (showToast) {
          toast('草稿已暂存（仅本地，学员端不可见）');
          const btn = document.getElementById('ivDraftBtn');
          if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check mr-1.5"></i>已暂存';
            btn.classList.add('bg-emerald-600', 'text-white');
            btn.classList.remove('bg-slate-700', 'text-slate-300');
            setTimeout(() => {
              if (!btn) return;
              btn.innerHTML = original;
              btn.classList.remove('bg-emerald-600', 'text-white');
              btn.classList.add('bg-slate-700', 'text-slate-300');
            }, 1500);
          }
        }
      } catch (e) { if (showToast) toast('暂存失败', 'error'); }
    }

    function ivSaveEditor() {
      if (!ivState) return;
      // 统计互动节点数用于日志
      const totalNodes = (ivState.videos || []).reduce((sum, v) => sum + (v.interactionNodes || []).length, 0);
      const payload = { videos: ivState.videos, updatedAt: new Date().toLocaleString('zh-CN') };
      console.log('[IV Save] 保存课程', ivState.courseId, '视频数:', ivState.videos.length, '互动节点总数:', totalNodes);
      fetch('/api/courses/' + ivState.courseId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            // 验证返回数据中是否包含 interactionNodes
            const savedVideos = res.course?.videos || [];
            const savedNodes = savedVideos.reduce((sum, v) => sum + (v.interactionNodes || []).length, 0);
            console.log('[IV Save] 服务器确认保存成功，返回视频数:', savedVideos.length, '节点数:', savedNodes);
            if (savedNodes === 0 && totalNodes > 0) {
              console.error('[IV Save] ⚠️ 警告：发送了', totalNodes, '个节点但服务器返回 0 个节点！data.json 可能未正确写入');
              toast('保存可能未完全生效，请刷新后检查', 'warning');
            }
            // 保存成功后同步本地草稿为最新（双保险：即使服务端出问题，本地记录仍在）
            try {
              localStorage.setItem('ivideo_draft_' + ivState.courseId, JSON.stringify({ videos: ivState.videos, updatedAt: new Date().toLocaleString('zh-CN') }));
            } catch (e) {}
            ivStopPreview();
            ivCloseEditor();
            if (typeof renderCourses === 'function') renderCourses();
          } else {
            toast('保存失败：' + (res.error || ''), 'error');
          }
        })
        .catch(err => { console.error('[IV Save] 网络错误:', err); toast('保存失败：网络异常', 'error'); });
    }

    function ivCloseEditor() {
      ivStopPreview();
      ivState = null;
      ivPickerTarget = null;
      ivLastRendered = { videoIndex: null, videoSrc: null };
      const view = document.getElementById('ivAppView');
      if (view) { view.classList.add('hidden'); view.innerHTML = ''; }
    }

    function renderInteractionEditor() {
      if (!ivState) return;
      const v = ivCurrentVideo();
      const previewSrc = v ? (v.url || '') : '';
      const normalizedSrc = previewSrc ? (previewSrc.startsWith('http') ? previewSrc : (previewSrc.startsWith('/') ? previewSrc : '/' + previewSrc)) : '';
      const root = document.getElementById('ivEditorRoot');
      const sameVideo = root && ivLastRendered.videoIndex === ivState.currentVideoIndex && ivLastRendered.videoSrc === normalizedSrc;
      if (sameVideo) {
        ivRefresh();
        return;
      }
      const dur = v ? (v.duration || 0) : 0;

      // ========== 左侧：视频列表（带序号+节点数标签）==========
      const videoListHtml = ivState.videos.map((vid, i) => {
        const nc = (vid.interactionNodes || []).length;
        const nodeTag = nc > 0
          ? `<span class="ml-1.5 text-[11px] px-1.5 py-0.5 rounded font-medium ${i === ivState.currentVideoIndex ? 'bg-indigo-500/20 text-indigo-300' : 'bg-purple-500/15 text-purple-400'}">互动节点数(${nc})</span>`
          : '';
        const activeCls = i === ivState.currentVideoIndex
          ? 'bg-slate-800/60 border-indigo-500/40 text-indigo-300 l-3'
          : 'border-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200';
        return `
          <button type="button" onclick="ivSelectVideo(${i})" class="w-full text-left px-3 py-2.5 rounded-lg border mb-1 transition text-sm ${activeCls}" style="${i === ivState.currentVideoIndex ? 'border-left:3px solid #818cf8; background:rgba(30,41,59,0.6);' : ''}">
            <div class="flex items-center">
              <span class="w-5 h-5 flex items-center justify-center rounded bg-slate-200 text-slate-600 text-xs font-semibold mr-2 flex-shrink-0">${i + 1}</span>
              <span class="truncate flex-1">${escHtml(vid.title || vid.url || ('视频' + (i + 1)))}</span>
            </div>
            ${nodeTag ? `<div class="mt-0.5 ml-7">${nodeTag}</div>` : ''}
          </button>`;
      }).join('');

      // ========== 中间：节点列表区 ==========
      const nodes = (v && v.interactionNodes) ? v.interactionNodes : [];
      let centerPanel = '';
      if (nodes.length === 0) {
        centerPanel = `
          <div class="flex flex-col items-center justify-center h-full text-slate-500 py-16">
            <div class="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4 border border-slate-700">
              <i class="far fa-image text-xl text-slate-500"></i>
            </div>
            <p class="text-sm font-medium text-slate-400 mb-1">暂未添加任何互动内容</p>
            <p class="text-xs text-slate-600">单个视频最多可添加${IV_MAX_NODES}个时间节点</p>
          </div>`;
      } else {
        // 节点卡片列表 — 仿参考图：时间+类型标签 | 内容预览 | 编辑/删除按钮
        const nodeCards = nodes.map((n, idx) => {
          const typeLabel = n.type === 'question' ? '试题' : (n.type === 'survey' ? '问卷' : '知识点');
          const typeColor = n.type === 'question' ? 'text-orange-400' : (n.type === 'survey' ? 'text-teal-400' : 'text-sky-400');
          const typeBg   = n.type === 'question' ? 'bg-orange-500/15 border-orange-500/25' : (n.type === 'survey' ? 'bg-teal-500/15 border-teal-500/25' : 'bg-sky-500/15 border-sky-500/25');
          const selCls = ivSelectedNodeId === n.id ? 'ring-1 ring-purple-500 bg-purple-500/5' : 'hover:bg-slate-800/60';
          // 内容预览文本
          let contentPreview = '';
          if (n.type === 'knowledge') contentPreview = escHtml(n.title || '');
          else if (n.type === 'survey') contentPreview = escHtml(n.surveyTitle || '');
          else if (n.questionRefs && n.questionRefs[0]) {
            const ref = n.questionRefs[0];
            const qType = ({ single:'单选题', multiple:'多选题', judge:'判断题', fill:'填空题', essay:'简答题' }[ref.type] || '');
            contentPreview = qType ? `<span class="text-slate-500">【${qType}】</span> ` : '';
            contentPreview += escHtml(ref.content || '');
          }
          return `
            <div class="group flex items-center px-3 py-2.5 rounded-lg border border-slate-700/50 cursor-pointer transition ${selCls}" onclick="ivSelectNode('${n.id}')">
              <!-- 时间 + 类型 -->
              <div class="flex items-center mr-3 flex-shrink-0 min-w-[85px]">
                <span class="text-xs text-slate-400 font-mono">${fmtIvTime(n.time)}</span>
                <span class="ml-2 text-xs px-1.5 py-0.5 rounded border ${typeBg} ${typeColor} font-medium">${typeLabel}</span>
              </div>
              <!-- 内容预览 -->
              <div class="flex-1 min-w-0">
                <p class="text-sm text-slate-300 truncate" title="${contentPreview.replace(/<[^>]+>/g, '')}">${contentPreview}</p>
              </div>
              <!-- 操作按钮（hover 显示） -->
              <div class="flex items-center space-x-1 ml-2 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                <button onclick="event.stopPropagation(); ivReplaceNodeQuestion('${n.id}')" class="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition" title="更换题目"><i class="fas fa-pen text-xs"></i></button>
                <button onclick="event.stopPropagation(); ivRemoveNode('${n.id}')" class="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition" title="删除节点"><i class="fas fa-times text-xs"></i></button>
              </div>
            </div>`;
        }).join('');
        centerPanel = `
          <div class="overflow-y-auto p-2 space-y-1" style="max-height:100%;">
            ${nodeCards}
          </div>`;

      }

      // ========== 右侧：视频播放器 ==========
      const previewHtml = v ? `
        <div class="relative bg-black rounded-xl overflow-hidden shadow-lg h-full flex flex-col">
          <video id="ivPreviewVideo" class="w-full h-full object-contain flex-1" controls src="${previewSrc.startsWith('http') ? previewSrc : (previewSrc.startsWith('/') ? previewSrc : '/' + previewSrc)}"></video>
          <div id="ivOverlay" class="absolute inset-0 hidden items-center justify-center bg-black/75 backdrop-blur-sm p-4 z-30 rounded-xl"></div>
        </div>` : '<div class="h-full flex items-center justify-center bg-slate-50 rounded-xl"><p class="text-slate-400 text-sm">该视频暂无可播放地址</p></div>';

      // ========== 底部：轨道 + 操作按钮 ==========
      const markersHtml = nodes.map(n => {
        const pct = ivSecToPct(n.time, dur);
        const color = n.type === 'question' ? 'bg-orange-500' : (n.type === 'survey' ? 'bg-teal-500' : 'bg-sky-500');
        const label = n.type === 'question' ? '题' : (n.type === 'survey' ? '卷' : '知');
        const selected = ivSelectedNodeId === n.id ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : '';
        return `<div class="absolute -top-1 bottom-0 w-2.5 ${color} ${selected} rounded cursor-pointer z-10" style="left:calc(${pct}% - 5px)" onclick="event.stopPropagation(); ivSelectNode('${n.id}', event)" title="${n.type === 'question' ? '试题' : n.type === 'survey' ? '问卷' : '知识点'} @ ${fmtIvTime(n.time)}"></div>`;
      }).join('');

      const insertPct = ivSecToPct(ivInsertTime, dur);
      const insertLine = ivPreviewMode ? '' : `<div class="absolute top-0 bottom-0 w-0.5 bg-purple-400 pointer-events-none z-20 iv-insert-line" style="left:${insertPct}%"><div class="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-purple-400 whitespace-nowrap font-medium bg-slate-800 px-1.5 rounded">插入@${fmtIvTime(ivInsertTime)}</div></div>`;

      const totalNodes = ivState.videos.reduce((s, vid) => s + (vid.interactionNodes || []).length, 0);

      const panel = `
        <div id="ivEditorRoot" class="w-screen h-screen flex flex-col bg-slate-900 text-slate-200">
          <!-- ====== 顶部栏 ====== -->
          <div id="ivHeaderBar" class="flex items-center justify-between px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex-shrink-0">
            <div class="flex items-center space-x-3">
              <button onclick="ivCloseEditor()" class="text-slate-400 hover:text-white transition"><i class="fas fa-arrow-left mr-1"></i>返回</button>
              <span class="text-slate-600">|</span>
              <h3 class="text-sm font-medium text-white"><i class="fas fa-film text-purple-400 mr-1.5"></i>视频编辑器<span id="ivTotalNodesBadge" class="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">${totalNodes}</span></h3>
            </div>
            <div class="flex items-center space-x-2">
              <button id="ivPreviewBtn" onclick="ivPreviewToggle()" class="px-3 py-1.5 text-sm rounded-lg transition flex items-center ${ivPreviewMode ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
                <i class="fas fa-eye mr-1.5"></i>${ivPreviewMode ? '退出预览' : '预览'}
              </button>
              <button id="ivDraftBtn" onclick="ivAutosaveDraft(true)" class="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition"><i class="fas fa-save mr-1.5"></i>暂存</button>
              <button onclick="ivSaveEditor()" class="px-4 py-1.5 text-sm rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:opacity-90 transition font-medium"><i class="fas fa-check mr-1.5"></i>保存</button>
            </div>
          </div>

          <!-- ====== 上部：三栏布局（视频列表 | 节点列表 | 播放器）====== -->
          <div class="flex flex-1 min-h-0 overflow-hidden">
            <!-- 左栏：视频列表 -->
            <div class="w-60 border-r border-slate-700 bg-slate-850 flex flex-col flex-shrink-0" style="background:#1a1f2e;">
              <div class="px-3 pt-3 pb-2 border-b border-slate-700/50">
                <p class="text-xs font-medium text-slate-400 uppercase tracking-wider">课程视频</p>
              </div>
              <div id="ivVideoListPanel" class="flex-1 overflow-y-auto p-2">
                ${videoListHtml || '<p class="text-xs text-slate-500 text-center py-4">暂无视频</p>'}
              </div>
            </div>

            <!-- 中栏：互动节点列表 -->
            <div class="w-72 border-r border-slate-700 bg-slate-850 flex flex-col flex-shrink-0" style="background:#151a27;">
              <div class="px-3 pt-3 pb-2 border-b border-slate-700/50 flex items-center justify-between">
                <p class="text-xs font-medium text-slate-400 uppercase tracking-wider">互动内容</p>
                <span id="ivNodeCountBadge" class="text-[10px] text-slate-500">${nodes.length}/${IV_MAX_NODES}</span>
              </div>
              <div id="ivNodeListPanel" class="flex-1 overflow-y-auto min-h-0">
                ${centerPanel}
              </div>
            </div>

            <!-- 右栏：视频播放器 -->
            <div id="ivPlayerPanel" class="flex-1 bg-slate-950 p-3 flex flex-col min-w-0">
              ${previewHtml}
            </div>
          </div>

          <!-- ====== 底部：时间轴轨道（全宽）====== -->
          <div id="ivTrackPanel" class="flex-shrink-0 border-t border-slate-700 bg-slate-800 px-4 pb-3 pt-2">
            <!-- 操作按钮行 -->
            <div class="flex items-center space-x-2 mb-2">
              <button onclick="ivAddQuestion()" class="px-3 py-1.5 text-xs rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition"><i class="fas fa-plus mr-1"></i>插入试题</button>
              <button onclick="ivAddSurvey()" class="px-3 py-1.5 text-xs rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 hover:bg-teal-500/30 transition"><i class="fas fa-plus mr-1"></i>插入问卷</button>
              <span class="ml-auto text-[10px] text-slate-500">${ivPreviewMode ? '点击轨道或画面可跳转 · 播放到节点自动弹出' : `点击轨道设置插入位置 · 当前 ${fmtIvTime(ivInsertTime)} / ${fmtIvTime(dur)}`}</span>
            </div>
            <!-- 轨道主体（加高，无刻度线） -->
            <div class="relative h-20 bg-slate-900 rounded-lg cursor-pointer select-none overflow-visible" style="box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);" onclick="ivTrackClick(event)">
              <!-- 进度填充 -->
              <div id="ivTrackFill" class="absolute top-0 bottom-0 left-0 bg-purple-500/15 pointer-events-none ${ivPreviewMode ? 'rounded-l-lg' : ''}" style="width:${ivSecToPct(ivPreviewMode ? 0 : ivInsertTime, dur)}%"></div>
              <!-- 节点标记 -->
              ${markersHtml}
              ${insertLine}
            </div>
          </div>
        </div>`;
      const ivView = document.getElementById('ivAppView');
      if (ivView) ivView.innerHTML = panel;
      if (v && previewSrc) {
        const pv = document.getElementById('ivPreviewVideo');
        if (pv) {
          pv.addEventListener('timeupdate', ivPreviewTimeupdate);
          pv.addEventListener('seeked', () => { ivUpdateTrackFill(); });
          pv.addEventListener('click', ivPreviewVideoClick);
          pv.style.cursor = ivPreviewMode ? 'pointer' : 'default';
        }
      }
      // 每次渲染后自动写入本地草稿（储存记录），确保修改不丢；静默保存不弹 toast
      ivLastRendered = { videoIndex: ivState.currentVideoIndex, videoSrc: normalizedSrc };
      ivAutosaveDraft(false);
    }

    function ivBuildVideoListHtml() {
      return ivState.videos.map((vid, i) => {
        const nc = (vid.interactionNodes || []).length;
        const nodeTag = nc > 0
          ? `<span class="ml-1.5 text-[11px] px-1.5 py-0.5 rounded font-medium ${i === ivState.currentVideoIndex ? 'bg-indigo-500/20 text-indigo-300' : 'bg-purple-500/15 text-purple-400'}">互动节点数(${nc})</span>`
          : '';
        const activeCls = i === ivState.currentVideoIndex
          ? 'bg-slate-800/60 border-indigo-500/40 text-indigo-300 l-3'
          : 'border-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200';
        return `
          <button type="button" onclick="ivSelectVideo(${i})" class="w-full text-left px-3 py-2.5 rounded-lg border mb-1 transition text-sm ${activeCls}" style="${i === ivState.currentVideoIndex ? 'border-left:3px solid #818cf8; background:rgba(30,41,59,0.6);' : ''}">
            <div class="flex items-center">
              <span class="w-5 h-5 flex items-center justify-center rounded bg-slate-200 text-slate-600 text-xs font-semibold mr-2 flex-shrink-0">${i + 1}</span>
              <span class="truncate flex-1">${escHtml(vid.title || vid.url || ('视频' + (i + 1)))}</span>
            </div>
            ${nodeTag ? `<div class="mt-0.5 ml-7">${nodeTag}</div>` : ''}
          </button>`;
      }).join('');
    }

    function ivBuildNodeListHtml() {
      const v = ivCurrentVideo();
      const nodes = (v && v.interactionNodes) ? v.interactionNodes : [];
      if (nodes.length === 0) {
        return `
          <div class="flex flex-col items-center justify-center h-full text-slate-500 py-16">
            <div class="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4 border border-slate-700">
              <i class="far fa-image text-xl text-slate-500"></i>
            </div>
            <p class="text-sm font-medium text-slate-400 mb-1">暂未添加任何互动内容</p>
            <p class="text-xs text-slate-600">单个视频最多可添加${IV_MAX_NODES}个时间节点</p>
          </div>`;
      }
      const nodeCards = nodes.map((n) => {
        const typeLabel = n.type === 'question' ? '试题' : (n.type === 'survey' ? '问卷' : '知识点');
        const typeColor = n.type === 'question' ? 'text-orange-400' : (n.type === 'survey' ? 'text-teal-400' : 'text-sky-400');
        const typeBg   = n.type === 'question' ? 'bg-orange-500/15 border-orange-500/25' : (n.type === 'survey' ? 'bg-teal-500/15 border-teal-500/25' : 'bg-sky-500/15 border-sky-500/25');
        const selCls = ivSelectedNodeId === n.id ? 'ring-1 ring-purple-500 bg-purple-500/5' : 'hover:bg-slate-800/60';
        let contentPreview = '';
        if (n.type === 'knowledge') contentPreview = escHtml(n.title || '');
        else if (n.type === 'survey') contentPreview = escHtml(n.surveyTitle || '');
        else if (n.questionRefs && n.questionRefs[0]) {
          const ref = n.questionRefs[0];
          const qType = ({ single:'单选题', multiple:'多选题', judge:'判断题', fill:'填空题', essay:'简答题' }[ref.type] || '');
          contentPreview = qType ? `<span class="text-slate-500">【${qType}】</span> ` : '';
          contentPreview += escHtml(ref.content || '');
        }
        return `
          <div class="group flex items-center px-3 py-2.5 rounded-lg border border-slate-700/50 cursor-pointer transition ${selCls}" onclick="ivSelectNode('${n.id}')">
            <div class="flex items-center mr-3 flex-shrink-0 min-w-[85px]">
              <span class="text-xs text-slate-400 font-mono">${fmtIvTime(n.time)}</span>
              <span class="ml-2 text-xs px-1.5 py-0.5 rounded border ${typeBg} ${typeColor} font-medium">${typeLabel}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-300 truncate" title="${contentPreview.replace(/<[^>]+>/g, '')}">${contentPreview}</p>
            </div>
            <div class="flex items-center space-x-1 ml-2 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
              <button onclick="event.stopPropagation(); ivReplaceNodeQuestion('${n.id}')" class="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition" title="更换题目"><i class="fas fa-pen text-xs"></i></button>
              <button onclick="event.stopPropagation(); ivRemoveNode('${n.id}')" class="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition" title="删除节点"><i class="fas fa-times text-xs"></i></button>
            </div>
          </div>`;
      }).join('');
      return `<div class="overflow-y-auto p-2 space-y-1" style="max-height:100%;">${nodeCards}</div>`;
    }

    function ivBuildTrackPanelHtml() {
      const v = ivCurrentVideo();
      const dur = v ? (v.duration || 0) : 0;
      const nodes = (v && v.interactionNodes) ? v.interactionNodes : [];
      const markersHtml = nodes.map(n => {
        const pct = ivSecToPct(n.time, dur);
        const color = n.type === 'question' ? 'bg-orange-500' : (n.type === 'survey' ? 'bg-teal-500' : 'bg-sky-500');
        const selected = ivSelectedNodeId === n.id ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : '';
        return `<div class="absolute -top-1 bottom-0 w-2.5 ${color} ${selected} rounded cursor-pointer z-10" style="left:calc(${pct}% - 5px)" onclick="event.stopPropagation(); ivSelectNode('${n.id}', event)" title="${n.type === 'question' ? '试题' : n.type === 'survey' ? '问卷' : '知识点'} @ ${fmtIvTime(n.time)}"></div>`;
      }).join('');
      const insertPct = ivSecToPct(ivInsertTime, dur);
      const insertLine = ivPreviewMode ? '' : `<div class="absolute top-0 bottom-0 w-0.5 bg-purple-400 pointer-events-none z-20 iv-insert-line" style="left:${insertPct}%"><div class="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-purple-400 whitespace-nowrap font-medium bg-slate-800 px-1.5 rounded">插入@${fmtIvTime(ivInsertTime)}</div></div>`;
      return `
        <div class="flex items-center space-x-2 mb-2">
          <button onclick="ivAddQuestion()" class="px-3 py-1.5 text-xs rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition"><i class="fas fa-plus mr-1"></i>插入试题</button>
          <button onclick="ivAddSurvey()" class="px-3 py-1.5 text-xs rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 hover:bg-teal-500/30 transition"><i class="fas fa-plus mr-1"></i>插入问卷</button>
          <span id="ivTrackHint" class="ml-auto text-[10px] text-slate-500">${ivPreviewMode ? '点击轨道或画面可跳转 · 播放到节点自动弹出' : `点击轨道设置插入位置 · 当前 ${fmtIvTime(ivInsertTime)} / ${fmtIvTime(dur)}`}</span>
        </div>
        <div class="relative h-20 bg-slate-900 rounded-lg cursor-pointer select-none overflow-visible" style="box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);" onclick="ivTrackClick(event)">
          <div id="ivTrackFill" class="absolute top-0 bottom-0 left-0 bg-purple-500/15 pointer-events-none ${ivPreviewMode ? 'rounded-l-lg' : ''}" style="width:${ivSecToPct(ivPreviewMode ? 0 : ivInsertTime, dur)}%"></div>
          ${markersHtml}
          ${insertLine}
        </div>`;
    }

    function ivRefresh() {
      if (!ivState) return;
      const v = ivCurrentVideo();
      const videoListPanel = document.getElementById('ivVideoListPanel');
      const nodeListPanel = document.getElementById('ivNodeListPanel');
      const trackPanel = document.getElementById('ivTrackPanel');
      const totalBadge = document.getElementById('ivTotalNodesBadge');
      const nodeCountBadge = document.getElementById('ivNodeCountBadge');
      const previewBtn = document.getElementById('ivPreviewBtn');
      const pv = document.getElementById('ivPreviewVideo');
      if (videoListPanel) videoListPanel.innerHTML = ivBuildVideoListHtml() || '<p class="text-xs text-slate-500 text-center py-4">暂无视频</p>';
      if (nodeListPanel) nodeListPanel.innerHTML = ivBuildNodeListHtml();
      if (trackPanel) trackPanel.innerHTML = ivBuildTrackPanelHtml();
      const totalNodes = ivState.videos.reduce((s, vid) => s + (vid.interactionNodes || []).length, 0);
      if (totalBadge) totalBadge.textContent = totalNodes;
      if (nodeCountBadge) nodeCountBadge.textContent = (((v && v.interactionNodes) ? v.interactionNodes : []).length) + '/' + IV_MAX_NODES;
      if (previewBtn) {
        previewBtn.className = 'px-3 py-1.5 text-sm rounded-lg transition flex items-center ' + (ivPreviewMode ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600');
        previewBtn.innerHTML = `<i class="fas fa-eye mr-1.5"></i>${ivPreviewMode ? '退出预览' : '预览'}`;
      }
      if (pv) pv.style.cursor = ivPreviewMode ? 'pointer' : 'default';
      ivAutosaveDraft(false);
    }

    function ivPreviewToggle() {
      if (!ivState) return;
      if (ivPreviewMode) { ivStopPreview(); return; }
      ivPreviewMode = true;
      ivPreviewFired.clear();
      ivSelectedNodeId = null;
      renderInteractionEditor();
      const pv = document.getElementById('ivPreviewVideo');
      if (pv) {
        pv.currentTime = 0;
        pv.style.cursor = 'pointer';
        // 确保视频加载后自动播放（兼容自动播放策略：失败则静音重试）
        let played = false;
        const tryPlay = (muted) => {
          if (muted) pv.muted = true;
          pv.play().then(() => { played = true; }).catch(() => {
            if (!muted) tryPlay(true); // 带声音失败 → 静音重试
          });
        };
        pv.addEventListener('loadeddata', function onLoaded() {
          if (ivPreviewMode && !played) tryPlay(false);
          pv.removeEventListener('loadeddata', onLoaded);
        });
        pv.addEventListener('error', () => toast('视频加载失败，请检查视频地址', 'error'));
        pv.load();
        tryPlay(false);
      }
      // 启动看门狗：每 200ms 检查节点触发（即使 timeupdate 不可靠也能触发）
      if (ivPreviewWatchdog) clearInterval(ivPreviewWatchdog);
      ivPreviewWatchdog = setInterval(() => {
        if (!ivPreviewMode) { clearInterval(ivPreviewWatchdog); ivPreviewWatchdog = null; return; }
        ivPreviewTimeupdate();
      }, 200);
      toast('预览模式：点击视频/轨道可跳转，播放到节点自动弹出互动');
    }

    function ivStopPreview() {
      ivPreviewMode = false;
      if (ivPreviewWatchdog) { clearInterval(ivPreviewWatchdog); ivPreviewWatchdog = null; }
      const pv = document.getElementById('ivPreviewVideo');
      if (pv) { try { pv.pause(); } catch (e) {} pv.style.cursor = 'default'; pv.muted = false; }
      const ov = document.getElementById('ivOverlay');
      if (ov) { ov.classList.add('hidden'); ov.classList.remove('flex'); ov.innerHTML = ''; }
      // 重新渲染以更新按钮状态（"退出预览" → "预览"）
      if (ivState) renderInteractionEditor();
    }

    function ivPreviewTimeupdate() {
      const pv = document.getElementById('ivPreviewVideo');
      if (!pv) return;
      // 始终同步轨道填充（编辑模式下视频播放时轨道也跟随）
      ivUpdateTrackFill();
      // 仅预览模式触发互动节点
      if (!ivPreviewMode) return;
      const v = ivCurrentVideo();
      const nodes = (v && v.interactionNodes) || [];
      for (const n of nodes) {
        if (!ivPreviewFired.has(n.id) && pv.currentTime >= n.time) {
          ivPreviewFired.add(n.id);
          ivShowPreviewOverlay(n, pv);
          break;
        }
      }
    }

    function ivShowPreviewOverlay(node, video) {
      video.pause();
      const ov = document.getElementById('ivOverlay');
      if (!ov) return;
      ov.classList.remove('hidden');
      ov.classList.add('flex');
      if (node.type === 'knowledge') {
        ov.innerHTML = `
          <div class="absolute inset-3 bg-white rounded-2xl shadow-2xl overflow-y-auto flex flex-col">
            <h4 class="font-semibold text-slate-800 text-xl md:text-2xl mb-4 pt-2 px-6">${escHtml(node.title || '知识点')}</h4>
            <p class="text-base text-slate-600 mb-6 whitespace-pre-wrap leading-relaxed px-6 flex-1">${escHtml(node.content || '')}</p>
            ${node.imageUrl ? `<div class="px-6 mb-4"><img src="${node.imageUrl}" class="max-h-64 rounded-xl object-contain"></div>` : ''}
            <div class="pb-5 px-6"><button onclick="ivResumePreview()" class="w-full py-3.5 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 font-medium transition text-lg">继续播放</button></div>
          </div>`;
        return;
      }
      if (node.type === 'survey') {
        const refs = node.questionRefs || [];
        const items = refs.map((r, i) => `<div class="mb-3"><p class="text-sm font-medium text-slate-700 mb-1">${i + 1}. ${escHtml(r.content || '')}</p><input class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="请输入你的回答"></div>`).join('');
        ov.innerHTML = `
          <div class="absolute inset-3 bg-white rounded-2xl shadow-2xl overflow-y-auto flex flex-col">
            <h4 class="font-semibold text-slate-800 text-xl mb-5 pt-2 px-6">${escHtml(node.surveyTitle || '互动问卷')}</h4>
            <div class="px-6 flex-1">${items}</div>
            <div class="pb-5 px-6"><button onclick="ivResumePreview()" class="w-full py-3.5 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 font-medium transition text-lg">提交并继续播放</button></div>
          </div>`;
        return;
      }
      // question：拉取题目详情以试判（兼容 questionRefs[].questionId 与旧格式 node.questionId）
      const qid = (node.questionRefs && node.questionRefs[0])
        ? node.questionRefs[0].questionId
        : (node.questionId != null ? node.questionId : null);
      if (qid == null) { ivResumePreview(); return; }
      fetch('/api/questions/' + qid)
        .then(r => r.json())
        .then(res => {
          const q = (res && res.data) ? res.data : res;
          if (!q || (res && res.success === false) || res.error) { ivResumePreview(); return; }
          ivRenderPreviewQuestion(q, ov, video);
        })
        .catch(() => ivResumePreview());
    }

        function ivRenderPreviewQuestion(q, ov, video) {
          ivPreviewCurrentQuestion = q;
          const type = q.type || 'single';
          const options = q.options || [];
          let body = '';
          if (type === 'multiple') {
            body = options.map((o, i) => {
              const letter = String.fromCharCode(65 + i);
              return `<label data-opt="${letter}" class="iv-opt-row flex items-center space-x-3 p-4 rounded-xl hover:bg-indigo-50 cursor-pointer transition border border-slate-200"><input type="checkbox" class="iv-opt w-5 h-5 accent-indigo-600" value="${letter}"><span class="text-base text-slate-800 font-medium">${escHtml(o)}</span></label>`;
            }).join('');
          } else if (type === 'judge') {
            body = `
              <label data-opt="A" class="iv-opt-row flex items-center space-x-3 p-4 rounded-xl hover:bg-indigo-50 cursor-pointer transition border border-slate-200"><input type="radio" name="ivq" class="iv-opt w-5 h-5 accent-indigo-600" value="A"><span class="text-base text-slate-800 font-medium">正确</span></label>
              <label data-opt="B" class="iv-opt-row flex items-center space-x-3 p-4 rounded-xl hover:bg-indigo-50 cursor-pointer transition border border-slate-200"><input type="radio" name="ivq" class="iv-opt w-5 h-5 accent-indigo-600" value="B"><span class="text-base text-slate-800 font-medium">错误</span></label>`;
          } else if (type === 'fill' || type === 'essay') {
            body = `<textarea class="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-base text-slate-800 focus:border-indigo-500 focus:outline-none" rows="3" placeholder="请输入你的答案"></textarea>`;
          } else {
            body = options.map((o, i) => {
              const letter = String.fromCharCode(65 + i);
              return `<label data-opt="${letter}" class="iv-opt-row flex items-center space-x-3 p-4 rounded-xl hover:bg-indigo-50 cursor-pointer transition border border-slate-200"><input type="radio" name="ivq" class="iv-opt w-5 h-5 accent-indigo-600" value="${letter}"><span class="text-base text-slate-800 font-medium">${escHtml(o)}</span></label>`;
            }).join('');
          }
          ov.innerHTML = `
            <div class="absolute inset-3 bg-white rounded-2xl shadow-2xl overflow-y-auto flex flex-col">
              <div class="flex items-center mb-5 pt-2 px-6">
                <span class="inline-flex items-center px-3 py-1.5 rounded-full bg-orange-100 text-orange-600 text-sm font-bold tracking-wide">互动试题</span>
                <span class="ml-3 text-sm text-slate-400">${({single:'单选题',multiple:'多选题',judge:'判断题',fill:'填空题',essay:'简答题'}[type]||'试题')}</span>
              </div>
              <p class="font-bold text-slate-900 text-lg md:text-xl lg:text-2xl mb-6 px-6 leading-relaxed">${escHtml(q.title || q.content || '')}</p>
              <div class="flex-1 mb-6 space-y-3 px-6" id="ivOptions">${body}</div>
              <div id="ivResult" class="text-base mb-4 px-6"></div>
              <div class="flex flex-nowrap justify-start gap-4 pb-5 px-6" id="ivPreviewBtnRow">
                <button id="ivPreviewSubmitBtn" onclick="ivPreviewSubmit('${type.replace(/'/g, '')}')" class="px-10 py-3 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 font-bold transition text-base shadow-lg shadow-indigo-300 whitespace-nowrap">提交答案</button>
                <button onclick="ivResumePreview()" class="px-10 py-3 rounded-xl border-2 border-slate-300 text-slate-700 hover:bg-slate-50 font-bold transition text-base whitespace-nowrap">继续播放</button>
              </div>
            </div>`;
        }

        function ivPreviewSubmit(type) {
          // 取当前覆盖的节点（最后一个 fired）
          const v = ivCurrentVideo();
          const nodes = (v && v.interactionNodes) || [];
          let node = null;
          for (const n of nodes) { if (ivPreviewFired.has(n.id)) node = n; }
          const q = ivPreviewCurrentQuestion;
          if (!q) { ivResumePreview(); return; }
          let userAnswer;
          if (type === 'multiple') {
            userAnswer = Array.from(document.querySelectorAll('#ivOverlay .iv-opt:checked')).map(c => c.value);
          } else if (type === 'judge') {
            const sel = document.querySelector('#ivOverlay input[name="ivq"]:checked');
            userAnswer = sel ? sel.value : '';
          } else if (type === 'fill' || type === 'essay') {
            const ta = document.querySelector('#ivOverlay textarea');
            userAnswer = ta ? ta.value : '';
          } else {
            const sel = document.querySelector('#ivOverlay input[name="ivq"]:checked');
            userAnswer = sel ? sel.value : '';
          }
          const verdict = ivJudgeLocal(q, userAnswer, type);

          // 正确选项字母集合（judge 归一化为 A/B）
          let correct = [];
          if (type === 'judge') {
            const ans = Array.isArray(q.answer) ? q.answer[0] : q.answer;
            const a = String(ans == null ? '' : ans).trim();
            correct = [(a.toUpperCase() === 'A' || a === '正确' || a.toLowerCase() === 'true') ? 'A' : 'B'];
          } else if (type === 'multiple' || type === 'single') {
            correct = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(x => String(x == null ? '' : x).trim()).filter(Boolean);
          }
          document.querySelectorAll('#ivOverlay .iv-opt-row').forEach(row => {
            const val = row.getAttribute('data-opt');
            const inp = row.querySelector('.iv-opt');
            const checked = inp && inp.checked;
            if (correct.includes(val)) {
              row.classList.add('bg-green-50', 'border', 'border-green-400');
              const tag = document.createElement('span'); tag.className = 'ml-auto text-green-600 text-xs font-medium whitespace-nowrap'; tag.textContent = '正确答案'; row.appendChild(tag);
            } else if (checked) {
              row.classList.add('bg-red-50', 'border', 'border-red-400');
              const tag = document.createElement('span'); tag.className = 'ml-auto text-red-600 text-xs font-medium whitespace-nowrap'; tag.textContent = '你的选择'; row.appendChild(tag);
            }
            if (inp) inp.disabled = true;
          });

          const resEl = document.getElementById('ivResult');
          const analysis = String(q.analysis || q.explanation || '').trim();
          let html = verdict
            ? '<div class="mb-2"><span class="inline-flex items-center px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">✅ 回答正确！</span></div>'
            : '<div class="mb-2"><span class="inline-flex items-center px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">❌ 回答错误</span></div>';
          if (analysis) {
            html += `<div class="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200"><p class="text-xs font-semibold text-slate-500 mb-1">📖 解析</p><p class="text-sm text-slate-700 whitespace-pre-wrap">${escHtml(analysis)}</p></div>`;
          } else if (!verdict) {
            html += '<p class="text-xs text-slate-400 mt-1">本题暂未配置解析</p>';
          }
          resEl.innerHTML = html;

          const sb = document.getElementById('ivPreviewSubmitBtn');
          if (sb) sb.style.display = 'none';
          // 答错时在按钮行追加「返回上一节点重新学习」，与「继续播放」并排左下角
          const btnRow = document.getElementById('ivPreviewBtnRow');
          let actions = document.getElementById('ivPreviewActions');
          if (!actions) {
            actions = document.createElement('div');
            actions.id = 'ivPreviewActions';
            if (btnRow) btnRow.appendChild(actions);
            else { actions.className = 'flex space-x-2 mt-3'; resEl.appendChild(actions); }
          }
          actions.innerHTML = verdict ? '' : `<button onclick="ivJumpPrevInPreview()" class="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition text-base whitespace-nowrap shadow-md">返回上一节点重新学习</button>`;
        }

    function ivJudgeLocal(q, userAnswer, type) {
      const correct = Array.isArray(q.answer) ? q.answer : [q.answer];
      if (type === 'multiple') {
        const ca = correct.map(x => String(x).trim()).sort().join(',');
        const ua = (Array.isArray(userAnswer) ? userAnswer : [userAnswer]).map(x => String(x).trim()).sort().join(',');
        return ua === ca && ua !== '';
      }
      if (type === 'judge') {
        const ub = (userAnswer === 'A');
        const cb = (String(correct[0]).trim().toUpperCase() === 'A' || String(correct[0]).trim() === '正确' || String(correct[0]).trim() === 'true');
        return ub === cb;
      }
      if (type === 'fill') {
        const ua = String(userAnswer || '').trim().toLowerCase();
        return ua !== '' && correct.map(x => String(x).trim().toLowerCase()).includes(ua);
      }
      return String(userAnswer || '').trim() === String(correct[0]).trim();
    }

    function ivResumePreview() {
      const ov = document.getElementById('ivOverlay');
      if (ov) { ov.classList.add('hidden'); ov.classList.remove('flex'); ov.innerHTML = ''; }
      const pv = document.getElementById('ivPreviewVideo');
      if (pv && ivPreviewMode) pv.play().catch(() => {});
    }

    function ivJumpPrevInPreview() {
      const v = ivCurrentVideo();
      const nodes = (v && v.interactionNodes) || [];
      const pv = document.getElementById('ivPreviewVideo');
      if (!pv) return;
      if (!nodes.length) { ivResumePreview(); return; }
      // 当前节点
      let cur = null;
      for (const n of nodes) { if (ivPreviewFired.has(n.id)) cur = n; }
      const prev = nodes.filter(n => cur && n.time < cur.time).sort((a, b) => b.time - a.time)[0];

      ivPreviewCurrentQuestion = null;
      if (prev) {
        // 回到上一题“结束后”的位置：标记 prev 为已触发（不弹），清除 prev 之后节点的已触发
        ivPreviewFired.add(prev.id);
        ivPreviewFired.forEach(id => {
          const nd = nodes.find(n => n.id === id);
          if (nd && nd.time > prev.time) ivPreviewFired.delete(id);
        });
        pv.currentTime = prev.time;
      } else {
        ivPreviewFired.clear();
        pv.currentTime = 0;
      }
      ivResumePreview();
    }

    // ========== 互动数据统计（内嵌面板） ==========
    let ivStatsCurrentTab = 'data'; // 'data' | 'interaction'

    function openInteractionStats(courseId) {
      courseId = parseInt(courseId);
      if (!courseId || isNaN(courseId)) { toast('请先从课程列表进入', 'warning'); return; }
      fetch('/api/courses/' + courseId + '/interaction-stats')
        .then(r => r.json())
        .then(res => {
          if (!res.success) { toast('加载统计失败', 'error'); return; }
          const agg = res.aggregate || {};
          const detail = res.detail || [];
          const course = (ivState && ivState.course) || (Array.isArray(window._dashboardCourses) ? window._dashboardCourses.find(c => c.id === courseId) : null) || { title: '课程详情' };

          // 查找课程信息
          const courseTitle = course.title || '课程详情';
          const creator = course.createdBy || course.creator || '';
          const durationStr = course.duration ? Math.floor(course.duration / 60) + '分钟' : '--';
          const learnerCount = agg.answererCount || 0;

          // 渲染内嵌面板
          const panel = document.getElementById('ivStatsPanel');
          if (!panel) {
            const el = document.createElement('div');
            el.id = 'ivStatsPanel';
            el.className = 'fixed inset-0 z-50 bg-white overflow-y-auto';
            document.body.appendChild(el);
          }
          document.getElementById('ivStatsPanel').innerHTML = renderIvStatsPanel(courseId, courseTitle, creator, durationStr, learnerCount, agg, detail, res);
          document.getElementById('ivStatsPanel').classList.remove('hidden');

          // 默认显示"数据"tab（直接传入已拉取的数据，避免重复请求与参数错位）
          ivStatsCurrentTab = 'data';
          switchIvStatsTab('data', courseId, null, res);
        })
        .catch(() => toast('加载统计失败', 'error'));
    }

    function closeIvStatsPanel() {
      const panel = document.getElementById('ivStatsPanel');
      if (panel) { panel.classList.add('hidden'); panel.innerHTML = ''; }
    }

    function renderIvStatsPanel(courseId, title, creator, duration, learnerCount, agg, detail, res) {
      return `
        <div class="min-h-screen bg-slate-50">
          <!-- 顶部导航栏 -->
          <div class="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <button onclick="closeIvStatsPanel()" class="text-slate-500 hover:text-slate-700 text-sm">&lt; 返回课程</button>
              <span class="text-slate-300">|</span>
              <h2 class="text-lg font-semibold text-slate-800">${escHtml(title)}</h2>
            </div>
            <div class="flex items-center space-x-6 text-sm text-slate-500">
              <span>创建人：${escHtml(creator)}</span>
              <span>课程时长：${duration}</span>
              <span>学习人数：${learnerCount}</span>
            </div>
          </div>

          <!-- Tab 切换 -->
          <div class="bg-white border-b px-6">
            <div class="flex space-x-1">
              <button id="ivstab-data" onclick="switchIvStatsTab('data', ${courseId}, this)" class="px-4 py-3 text-sm font-medium border-b-2 border-orange-500 text-orange-600">数据</button>
              <button id="ivstab-interaction" onclick="switchIvStatsTab('interaction', ${courseId}, this)" class="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700">视频答题互动</button>
            </div>
          </div>

          <!-- 内容区域 -->
          <div id="ivstats-content" class="p-6"></div>
        </div>`;
    }

    function switchIvStatsTab(tab, courseId, btn, res) {
      ivStatsCurrentTab = tab;
      // 更新 tab 样式
      document.querySelectorAll('[id^="ivstab-"]').forEach(b => {
        b.classList.remove('border-orange-500', 'text-orange-600');
        b.classList.add('border-transparent', 'text-slate-500');
      });
      // 防御：只有传入的是真实 DOM 元素才当作按钮处理（旧调用把数据对象误传为 btn）
      const activeBtn = (btn && btn.classList) ? btn : document.getElementById('ivstab-' + tab);
      if (activeBtn && activeBtn.classList) {
        activeBtn.classList.remove('border-transparent', 'text-slate-500');
        activeBtn.classList.add('border-orange-500', 'text-orange-600');
      }

      // 已传入数据 → 直接渲染并写入缓存（避免重复请求）；其次走缓存；最后才重新拉取
      if (res) {
        window._ivStatsCache = res;
        renderIvStatsContent(tab, courseId, res);
      } else if (window._ivStatsCache && window._ivStatsCache.detail) {
        renderIvStatsContent(tab, courseId, window._ivStatsCache);
      } else {
        const box = document.getElementById('ivstats-content');
        if (box) box.innerHTML = '<div class="text-center text-slate-400 py-12"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</div>';
        fetch('/api/courses/' + courseId + '/interaction-stats')
          .then(r => r.json())
          .then(r => { window._ivStatsCache = r; renderIvStatsContent(tab, courseId, r); })
          .catch(() => {
            const b = document.getElementById('ivstats-content');
            if (b) b.innerHTML = '<div class="text-center text-red-400 py-12">加载失败，请重试</div>';
          });
      }
    }

    function renderIvStatsContent(tab, courseId, res) {
      const container = document.getElementById('ivstats-content');
      if (!container) return;
      const agg = res.aggregate || {};
      const detail = res.detail || [];

      if (tab === 'data') {
        container.innerHTML = renderIvStatsDataTab(agg, detail, courseId);
      } else {
        container.innerHTML = renderIvStatsInteractionTab(agg, detail, courseId);
      }
    }

    /* ===== "数据" Tab：概览统计卡片 + 学员明细表格 ===== */
    function renderIvStatsDataTab(agg, detail, courseId) {
      const totalLearners = agg.answererCount || 0;
      const completedCount = agg.completedCount || (detail || []).filter(d => d.isCorrect === true).length || 0;
      const incompleteCount = Math.max(0, totalLearners - completedCount);
      const avgAccuracy = agg.avgAccuracy != null ? agg.avgAccuracy : 0;

      // 格式化 ISO 时间为 YYYY-MM-DD HH:mm
      function fmtDt(iso) {
        if (!iso) return '';
        try { const d = new Date(iso); return d.getFullYear() + '-' +
          String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' +
          String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }
        catch(e) { return iso; }
      }
      // 格式化秒数为 X分Y秒 或 X秒
      function fmtDur(sec) {
        if (!sec && sec !== 0) return '0秒';
        sec = Number(sec) || 0;
        if (sec < 60) return sec + '秒';
        const m = Math.floor(sec / 60), s = sec % 60;
        return m + '分' + (s > 0 ? s + '秒' : '');
      }

      // 学员明细行（统一使用英文字段，中文做 fallback）
      // 课程内"试题"节点集合（学习进度分母；正确率仅统计试题节点）
      const courseQNodeSet = new Set(agg.courseQuestionNodeIds || []);
      const learnerMap = {};
      (detail || []).forEach(d => {
        const key = d.userId || d.学员 || '_anon';
        if (!learnerMap[key]) {
          learnerMap[key] = { name: d.userName || d.学员 || '匿名', dept: d.department || d.部门 || '', pos: d.position || d.岗位 || '', firstTime: null, lastTime: null, totalTime: 0, attempts: 0, correct: 0, totalScore: 0, nodeSet: new Set(), nodeLast: {} };
        }
        const rec = learnerMap[key];
        rec.attempts++;
        const nid = String(d.nodeId || '');
        if (nid) rec.nodeSet.add(nid);
        const t = d.answeredAt || d.时间 || '';
        // 以"每个节点最高分那次作答"为准记录对错（与后端去重口径一致）
        if (nid && d.nodeType === 'question') {
          const sc = (d.score != null) ? Number(d.score) : (d.isCorrect === true ? 1 : 0);
          const prev = rec.nodeLast[nid];
          if (!prev
            || sc > prev.sc
            || (sc === prev.sc && d.isCorrect === true && !prev.isCorrect)
            || (sc === prev.sc && d.isCorrect === prev.isCorrect && (t || '') >= (prev.t || ''))) {
            rec.nodeLast[nid] = { t, isCorrect: d.isCorrect === true, score: d.score || 0, sc };
          }
        }
        rec.totalScore += d.score || 0;
        if (t) {
          if (!rec.firstTime || t < rec.firstTime) rec.firstTime = t;
          if (!rec.lastTime || t > rec.lastTime) rec.lastTime = t;
        }
        rec.totalTime += (d.timeSpentSec != null ? d.timeSpentSec : (d['耗时秒'] != null && d['耗时秒'] !== '-' ? Number(d['耗时秒']) : 0)) || 0;
      });

      const learners = Object.values(learnerMap);
      const learnerRows = learners.length ? learners.map(l => {
        // 正确率：仅统计"试题"节点，取每个节点最新一次作答
        let qCorrect = 0, qTotal = 0;
        Object.keys(l.nodeLast).forEach(nid => { qTotal++; if (l.nodeLast[nid].isCorrect) qCorrect++; });
        const accPct = qTotal > 0 ? Math.round(qCorrect / qTotal * 10000) / 100 : 0;
        const accColor = accPct >= 80 ? 'text-green-600' : accPct >= 50 ? 'text-orange-500' : 'text-red-500';
        // 学习进度：已作答的"课程内试题节点" / 课程内试题节点总数（完成度，与对错无关）
        const answeredQ = [...l.nodeSet].filter(id => courseQNodeSet.has(id)).length;
        const totalQ = (agg.totalQuestionNodes || 0);
        const progressPct = totalQ > 0 ? Math.min(100, Math.round(answeredQ / totalQ * 100)) : (l.attempts > 0 ? 100 : 0);
        const progColor = progressPct >= 80 ? 'bg-green-500' : progressPct >= 50 ? 'bg-orange-500' : 'bg-slate-300';
        return `<tr class="border-b hover:bg-slate-50">
          <td class="px-4 py-3 text-sm">${escHtml(l.name)}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(l.dept)}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(l.pos)}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${fmtDt(l.firstTime)}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${fmtDt(l.lastTime)}</td>
          <td class="px-4 py-3 text-sm">${fmtDur(l.totalTime)}</td>
          <td class="px-4 py-3"><div class="flex items-center"><div class="w-20 h-2 bg-slate-200 rounded-full"><div class="h-full rounded-full ${progColor}" style="width:${progressPct}%"></div></div><span class="text-xs text-slate-400 ml-2">${progressPct}%</span></div></td>
          <td class="px-4 py-3 text-sm font-medium ${accColor}">${accPct.toFixed(2)}%${qTotal > 1 ? ' <span class="text-xs text-slate-400">(' + qCorrect + '/' + qTotal + ')</span>' : ''}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">暂无作答数据</td></tr>';

      return `
        <!-- 统计卡片 -->
        <div class="grid grid-cols-3 gap-5 mb-6">
          <!-- 学习人数 -->
          <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <h3 class="text-sm font-medium text-slate-500 mb-3">学习人数</h3>
            <div class="flex items-end justify-between">
              <div>
                <div class="flex items-center space-x-1 text-slate-400 text-xs mb-1"><i class="fas fa-info-circle"></i><span>总人数</span></div>
                <div class="text-2xl font-bold text-slate-800">${totalLearners}</div>
                <div class="flex space-x-4 mt-2 text-sm"><span class="text-slate-600">已完成 <b>${completedCount}</b></span><span class="text-slate-400">未完成 <b>${incompleteCount}</b></span></div>
              </div>
              <button onclick="exportInteractionStatsExcel(${courseId})" class="px-3 py-1.5 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600"><i class="fas fa-download mr-1"></i>导出</button>
            </div>
          </div>
          <!-- 视频答题互动 -->
          <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <h3 class="text-sm font-medium text-slate-500 mb-3">视频答题互动</h3>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div><div class="text-2xl font-bold text-slate-800">${totalLearners}</div><div class="text-xs text-slate-400 mt-1">学习人数</div></div>
              <div><div class="text-2xl font-bold text-slate-800">${agg.totalQuestionNodes || 0}</div><div class="text-xs text-slate-400 mt-1">互动题数</div></div>
              <div><div class="text-2xl font-bold text-slate-800">${agg.totalAttempts || 0}</div><div class="text-xs text-slate-400 mt-1">总作答次数</div></div>
            </div>
            <div class="text-green-600 font-semibold mt-3">${avgAccuracy}%<span class="text-xs text-slate-400 font-normal ml-1">平均正确率</span></div>
          </div>
          <!-- 课程数据 -->
          <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <h3 class="text-sm font-medium text-slate-500 mb-3">课程数据</h3>
            <div class="grid grid-cols-4 gap-3 text-center">
              <div><div class="text-lg font-bold text-slate-800">${agg.playCount || 0}</div><div class="text-xs text-slate-400">播放次数</div></div>
              <div><div class="text-lg font-bold text-slate-800">${agg.likeCount || 0}</div><div class="text-xs text-slate-400">点赞数</div></div>
              <div><div class="text-lg font-bold text-slate-800">${agg.commentCount || 0}</div><div class="text-xs text-slate-400">评论数</div></div>
              <div><div class="text-lg font-bold text-slate-800">${agg.ratingAvg || 0}</div><div class="text-xs text-slate-400">评分</div></div>
            </div>
          </div>
        </div>

        <!-- 学员明细表格 -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div class="px-5 py-3 border-b flex items-center justify-between">
            <h3 class="font-medium text-slate-700">学员作答明细</h3>
            <input type="text" placeholder="根据姓名搜索" class="px-3 py-1.5 text-sm border rounded-lg w-48" oninput="filterIvStatsTable(this.value)">
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-slate-50 text-slate-500 text-left">
                <th class="px-4 py-3 font-medium">姓名</th>
                <th class="px-4 py-3 font-medium">部门</th>
                <th class="px-4 py-3 font-medium">岗位</th>
                <th class="px-4 py-3 font-medium">首次学习时间</th>
                <th class="px-4 py-3 font-medium">末次学习时间</th>
                <th class="px-4 py-3 font-medium">学习时长</th>
                <th class="px-4 py-3 font-medium">学习进度</th>
                <th class="px-4 py-3 font-medium">答题正确率</th>
              </tr></thead>
              <tbody id="ivstats-tbody">${learnerRows}</tbody>
            </table>
          </div>
          <div class="px-5 py-3 border-t text-right text-sm text-slate-400">共 ${learners.length} 条</div>
        </div>`;
    }

    /* ===== "视频答题互动" Tab：按视频/节点展开的详细统计 ===== */
    function renderIvStatsInteractionTab(agg, detail, courseId) {
      const totalAnswerers = agg.answererCount || 0;
      const avgAcc = agg.avgAccuracy != null ? agg.avgAccuracy : 0;

      // 格式化秒数为 X分Y秒 或 X秒
      function fmtDur(sec) { if (!sec && sec !== 0) return '0秒'; sec = Number(sec) || 0; return sec < 60 ? sec + '秒' : Math.floor(sec / 60) + '分' + (sec % 60 > 0 ? (sec % 60) + '秒' : ''); }

      // 按视频分组
      const videoGroups = {};
      (detail || []).forEach(d => {
        const vKey = d.videoTitle || d.视频 || ('视频' + (d.videoIndex || 0));
        if (!videoGroups[vKey]) videoGroups[vKey] = { title: vKey, nodes: {} };
        const nKey = d.nodeTime != null ? fmtIvTime(d.nodeTime) : (d.节点序号 || '?');
        if (!videoGroups[vKey].nodes[nKey]) videoGroups[vKey].nodes[nKey] = { time: nKey, type: d.nodeType || d.节点类型 || '试题', attempts: 0, correct: 0, totalTime: 0, answerers: {} };
        const nd = videoGroups[vKey].nodes[nKey];
        nd.attempts++;
        if (d.isCorrect === true) nd.correct++;
        nd.totalTime += (d.timeSpentSec != null ? d.timeSpentSec : (d['耗时秒'] != null && d['耗时秒'] !== '-' ? Number(d['耗时秒']) : 0)) || 0;
        const uKey = d.userId || d.学员 || '_anon';
        nd.answerers[uKey] = (nd.answerers[uKey] || 0) + 1;
      });

      let videoSections = '';
      Object.keys(videoGroups).forEach(vTitle => {
        const vg = videoGroups[vTitle];
        const nodeKeys = Object.keys(vg.nodes).sort();
        const nodeTotalAttempts = nodeKeys.reduce((s, k) => s + vg.nodes[k].attempts, 0);
        const nodeTotalCorrect = nodeKeys.reduce((s, k) => s + vg.nodes[k].correct, 0);
        const nodeAvgAcc = nodeTotalAttempts > 0 ? Math.round(nodeTotalCorrect / nodeTotalAttempts * 10000) / 100 : 0;

        const nodeRows = nodeKeys.map(nk => {
          const n = vg.nodes[k];
          const nAcc = n.attempts > 0 ? Math.round(n.correct / n.attempts * 10000) / 100 : 0;
          const nColor = nAcc >= 80 ? 'text-green-600' : nAcc >= 50 ? 'text-orange-500' : 'text-red-500';
          return `<tr class="border-b hover:bg-slate-50">
            <td class="px-4 py-3 text-sm text-slate-600">${nk}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 text-xs rounded bg-orange-100 text-orange-700">${n.type === 'question' ? '试题' : n.type === 'survey' ? '问卷' : n.type === 'knowledge' ? '知识点' : n.type}</span></td>
            <td class="px-4 py-3 text-sm">${Object.keys(n.answerers).length}</td>
            <td class="px-4 py-3 text-sm font-medium ${nColor}">${nAcc.toFixed(2)}%</td>
            <td class="px-4 py-3 text-sm text-slate-500">${fmtDur(n.totalTime)}</td>
          </tr>`;
        }).join('');

        videoSections += `
          <div class="border border-slate-200 rounded-lg mb-4 overflow-hidden">
            <div class="bg-slate-50 px-4 py-3 flex items-center justify-between cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
              <div class="flex items-center space-x-3">
                <i class="fas fa-chevron-down text-slate-400 transition"></i>
                <span class="font-medium text-slate-700">${escHtml(vTitle)}</span>
              </div>
              <div class="flex items-center space-x-6 text-sm text-slate-500">
                <span>互动节点数：<b>${nodeKeys.length}</b></span>
                <span>平均正确率：<b class="${nodeAvgAcc >= 80 ? 'text-green-600' : nodeAvgAcc >= 50 ? 'text-orange-500' : 'text-red-500'}">${nodeAvgAcc}%</b></span>
              </div>
            </div>
            <div>
              <table class="w-full text-sm">
                <thead><tr class="bg-white text-slate-500 text-left border-b">
                  <th class="px-4 py-2 font-medium">时间节点</th>
                  <th class="px-4 py-2 font-medium">互动类型</th>
                  <th class="px-4 py-2 font-medium">互动人数</th>
                  <th class="px-4 py-2 font-medium">平均正确率</th>
                  <th class="px-4 py-2 font-medium">平均耗时</th>
                </tr></thead>
                <tbody>${nodeRows || '<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400">暂无数据</td></tr>'}</tbody>
              </table>
            </div>
          </div>`;
      });

      return `
        <!-- 总览 -->
        <div class="mb-6 flex items-center space-x-4 text-sm">
          <span class="text-slate-500"><i class="fas fa-info-circle mr-1"></i>总人数：<b class="text-slate-800">${totalAnswerers}</b></span>
          <span class="text-slate-500">平均正确率：<b class="${avgAcc >= 80 ? 'text-green-600' : avgAcc >= 50 ? 'text-orange-500' : 'text-red-600'}">${avgAcc}.00%</b></span>
        </div>

        <!-- 按视频展开的节点详情 -->
        ${videoSections || '<div class="bg-white rounded-xl p-8 text-center text-slate-400 border border-dashed">暂无互动数据</div>'}`;
    }

    function filterIvStatsTable(keyword) {
      const rows = document.querySelectorAll('#ivstats-tbody tr');
      const kw = (keyword || '').toLowerCase();
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = (!kw || text.includes(kw)) ? '' : 'none';
      });
    }

    function exportInteractionStatsExcel(courseId) {
      fetch('/api/courses/' + courseId + '/interaction-stats')
        .then(r => r.json())
        .then(res => {
          if (!res.success) { toast('导出失败', 'error'); return; }
          const agg = res.aggregate || {};
          const detail = res.detail || [];
          const nodeHeaders = ['节点序号', '类型', '总作答数', '正确数', '正确率', '最高得分'];
          const nodeRows = (agg.perNode || []).map(n => [n.节点序号, n.类型, n.总作答数, n.正确数, n.正确率 + '%', n.最高得分]);
          const qHeaders = ['题目', '总作答数', '正确数', '正确率'];
          const qRows = (agg.perQuestion || []).map(q => [q.题目, q.总作答数, q.正确数, q.正确率 + '%']);
          const dHeaders = ['学员', '部门', '课程', '视频', '节点序号', '节点类型', '题目', '作答', '对错', '得分', '耗时秒', '时间'];
          const dRows = detail.map(d => [d.学员, d.部门, d.课程, d.视频, d.节点序号, d.节点类型, d.题目, d.作答, d.对错, d.得分, d.耗时秒, d.时间]);
          const wsNode = XLSX.utils.aoa_to_sheet([nodeHeaders, ...nodeRows]);
          const wsQ = XLSX.utils.aoa_to_sheet([qHeaders, ...qRows]);
          const wsD = XLSX.utils.aoa_to_sheet([dHeaders, ...dRows]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, wsD, '作答明细');
          XLSX.utils.book_append_sheet(wb, wsNode, '节点正确率');
          XLSX.utils.book_append_sheet(wb, wsQ, '题目正确率');
          XLSX.writeFile(wb, '互动视频数据_' + courseId + '_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
          toast('导出成功');
        })
        .catch(() => toast('导出失败', 'error'));
    }

    // ========== 跨页面数据同步 ==========
    // 页面可见性变化时刷新课程列表(用户从播放页切换回来时)
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && typeof renderCourses === 'function') {
        renderCourses();
      }
    });
    // 监听 localStorage 变化(其他标签页写入数据时:浏览量/点赞/评分)
    window.addEventListener('storage', function(e) {
      if ((e.key && e.key.indexOf('course_interaction') === 0) || e.key === 'learning_platform_data') {
        if (typeof renderCourses === 'function') renderCourses();
      }
    });

    // ========== 报表管理（酷学院风格 5 大模块）==========
    let rptTrendDays = 7; // 趋势图天数

    /* 切换报表 Tab */
    function switchReportTab(tab) {
      document.querySelectorAll('.rpt-tab-btn').forEach(b => {
        b.classList.remove('active');
      });
      const btn = document.querySelector(`.rpt-tab-btn[data-tab="${tab}"]`);
      if (btn) {
        btn.classList.add('active');
      }
      document.querySelectorAll('.rpt-tab-content').forEach(c => c.classList.add('hidden'));
      const content = document.getElementById('rpt-' + tab);
      if (content) content.classList.remove('hidden');

      // 进入对应报表时渲染数据
      if (tab === 'overview') renderOverview();
      if (tab === 'course')   renderCourseReport();
      if (tab === 'student')  renderStudentReport();
      if (tab === 'exam')     renderExamReport();
      if (tab === 'training')  renderTrainingReport();
    }

    /* 入口：加载报表 */
    function loadReports() {
      // 填充分类下拉（课程报表 + 培训报表）
      const crCat = document.getElementById('rpt-cr-cat');
      const trCat = document.getElementById('rpt-tr-cat');
      if (crCat) {
        crCat.innerHTML = '<option value="">全部分类</option>' +
          (data.categories || []).map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
      }
      if (trCat) {
        // 培训报表使用 training_events 的 project 作为分类
        const trainings = data.training_events || data.training || [];
        const projects = [...new Set(trainings.map(t => t.project).filter(Boolean))];
        trCat.innerHTML = '<option value="">全部分类</option>' +
          projects.map(p => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join('');
      }
      // 填充部门下拉（学员报表）
      const stDept = document.getElementById('rpt-st-dept');
      if (stDept) {
        const depts = [...new Set((allUsers || []).map(u => u.department).filter(Boolean))];
        stDept.innerHTML = '<option value="">全部部门</option>' + depts.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
      }
      switchReportTab('overview');
    }

    /* ============================================================
       1. 学习概览
       ============================================================ */
    /* 带重试的 fetch */
    async function fetchWithRetry(url, options = {}, retries = 3, delay = 500) {
      let lastError;
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(url, options);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (err) {
          lastError = err;
          if (i < retries - 1) await new Promise(r => setTimeout(r, delay * (i + 1)));
        }
      }
      throw lastError;
    }

    async function renderOverview() {
      const courses   = data.courses   || [];
      const lecturers = data.lecturers || [];
      const users     = allUsers       || [];
      const trainings = data.training  || [];
      const exams     = data.exams     || [];

      // 基础统计卡片
      el('rpt-ov-courses',   courses.length);
      el('rpt-ov-lecturers', lecturers.filter(l => l.status === 'enabled').length);
      el('rpt-ov-users',     users.length);
      el('rpt-ov-trainings', trainings.length);
      el('rpt-ov-exams',     exams.length);

      // 加载综合报表数据
      const trendEl = document.getElementById('rpt-trend-chart');
      if (trendEl) trendEl.innerHTML = '<div class="w-full text-center py-20 text-slate-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</div>';

      try {
        const result = await fetchWithRetry(`/api/reports/overview?days=${rptTrendDays}`, {}, 3, 500);
        const report = (result && result.success && result.data) ? result.data : {};

        // 学习总时长与周活跃
        el('rpt-ov-hours', (report.totalStudyHours || 0) + 'h');
        el('rpt-weekly-active', report.weeklyActive || 0);

        // 登录趋势
        renderTrendChart(report.loginTrend || []);

        // 热门课程 TOP5
        renderTopCourses(courses);

        // 部门学习排行榜 TOP10
        renderDeptRanking(report.deptRanking || []);

        // 个人学习排行榜 TOP10
        renderUserRanking(report.userRanking || []);

        // 课程分类分布
        renderCategoryChart(report.categoryDistribution || []);

        // 最近学习动态
        renderRecentActivity(report.recentActivities || []);
      } catch (error) {
        console.error('加载学习概览失败:', error);
        if (trendEl) {
          trendEl.innerHTML = `
            <div class="w-full h-full flex flex-col items-center justify-center text-slate-400 py-12">
              <i class="fas fa-exclamation-circle text-2xl mb-2 text-slate-300"></i>
              <p class="text-sm mb-3">加载失败，请刷新重试</p>
              <button onclick="renderOverview()" class="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs rounded-lg hover:bg-indigo-100 transition">
                <i class="fas fa-redo mr-1"></i>重新加载
              </button>
            </div>`;
        }
        // 降级渲染热门课程
        renderTopCourses(courses);
      }
    }

    /* 渲染登录趋势柱状图 */
    function renderTrendChart(list) {
      const chartEl = document.getElementById('rpt-trend-chart');
      if (!chartEl) return;
      const days = rptTrendDays;

      if (!list.length) {
        chartEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-20 w-full">暂无登录数据</p>';
        return;
      }

      const labels = list.map(x => x.label);
      const values = list.map(x => x.count || 0);
      const maxV = Math.max(...values, 1);
      const total = values.reduce((s, v) => s + v, 0);
      const avg = total / Math.max(days, 1);

      // 30 天使用更紧凑的间距和更细柱条
      const isCompact = days > 7;
      const gapClass = isCompact ? 'gap-0.5' : 'gap-1';
      const barMaxW = isCompact ? 'max-w-[18px]' : 'max-w-[36px]';
      const radiusClass = isCompact ? 'rounded-t-sm' : 'rounded-t-md';
      const labelStep = isCompact ? Math.ceil(days / 6) : 1;

      chartEl.innerHTML = `
        <div class="w-full h-full flex flex-col">
          <div class="flex-1 flex items-end ${gapClass} px-2">
            ${values.map((v, i) => {
              const h = maxV ? Math.max((v / maxV) * 100, 2) : 2;
              const showLabel = i % labelStep === 0;
              return `<div class="flex-1 flex flex-col items-center justify-end h-full group relative" title="${labels[i]}: ${v}人登录">
                <span class="text-[10px] text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition absolute -top-4 bg-slate-800 text-white px-1.5 py-0.5 rounded text-[10px]">${v}</span>
                <div class="w-full ${barMaxW} bg-gradient-to-t from-indigo-600 to-purple-400 ${radiusClass} shadow-sm transition-all group-hover:from-indigo-500 group-hover:to-purple-300" style="height:${h}%"></div>
                ${showLabel ? `<span class="text-[10px] text-slate-400 mt-1.5 whitespace-nowrap">${labels[i]}</span>` : ''}
              </div>`;
            }).join('')}
          </div>
          <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>近${days}天累计登录 <strong class="text-indigo-600">${total}</strong> 人次</span>
            <span>日均 <strong class="text-indigo-600">${Math.round(avg * 10) / 10}</strong> 人次</span>
          </div>
        </div>`;
    }

    /* 渲染热门课程 TOP5 */
    function renderTopCourses(courses) {
      const top5 = [...courses].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
      const maxViews = top5.length ? Math.max(...top5.map(c => c.views || 0), 1) : 1;
      const topEl = document.getElementById('rpt-top-courses');
      if (!topEl) return;
      topEl.innerHTML = top5.map((c, i) => {
        const pct = Math.round(((c.views || 0) / maxViews) * 100);
        const rankColors = ['from-amber-400 to-orange-500', 'from-slate-300 to-slate-400', 'from-amber-600 to-amber-700', 'from-slate-200 to-slate-300', 'from-slate-200 to-slate-300'];
        const badgeClass = i < 3 ? `bg-gradient-to-br ${rankColors[i]} text-white` : 'bg-slate-200 text-slate-600';
        return `<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition">
          <span class="w-6 h-6 rounded-full ${badgeClass} text-[10px] flex items-center justify-center font-bold shrink-0">${i + 1}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-700 truncate font-medium">${escHtml(c.title)}</p>
            <div class="w-full bg-slate-100 rounded-full h-1.5 mt-1.5">
              <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full transition-all" style="width:${pct}%"></div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="text-xs font-semibold text-slate-700">${(c.views || 0)}</span>
            <span class="text-[10px] text-slate-400 block">播放</span>
          </div>
        </div>`;
      }).join('') || '<p class="text-sm text-slate-400 text-center py-8">暂无数据</p>';
    }

    /* 渲染部门学习排行榜 TOP10 */
    function renderDeptRanking(list) {
      const el = document.getElementById('rpt-dept-ranking');
      if (!el) return;
      const maxAvg = list.length ? Math.max(...list.map(d => d.avgHours || 0), 1) : 1;
      el.innerHTML = list.map((d, i) => {
        const pct = Math.round(((d.avgHours || 0) / maxAvg) * 100);
        const rankClass = i === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' :
                          i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                          i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                          'bg-slate-100 text-slate-500';
        return `<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/40 transition">
          <span class="w-7 h-7 rounded-full ${rankClass} text-xs flex items-center justify-center font-bold shrink-0">${i + 1}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-slate-700 truncate">${escHtml(d.dept)}</span>
              <span class="text-xs font-semibold text-indigo-600">${d.avgHours}h/人</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-1.5">
              <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full" style="width:${pct}%"></div>
            </div>
          </div>
          <div class="text-right shrink-0 text-xs text-slate-500">
            <div class="font-medium text-slate-700">${d.userCount}人</div>
            <div>${d.totalHours}h</div>
          </div>
        </div>`;
      }).join('') || '<p class="text-sm text-slate-400 text-center py-8">暂无部门数据</p>';
    }

    /* 渲染个人学习排行榜 TOP10 */
    function renderUserRanking(list) {
      const el = document.getElementById('rpt-user-ranking');
      if (!el) return;
      const maxHours = list.length ? Math.max(...list.map(u => u.hours || 0), 1) : 1;
      el.innerHTML = list.map((u, i) => {
        const pct = Math.round(((u.hours || 0) / maxHours) * 100);
        const rankClass = i === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' :
                          i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                          i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                          'bg-slate-100 text-slate-500';
        const avatar = u.avatar ? `<img src="${escHtml(u.avatar)}" class="w-7 h-7 rounded-full object-cover border border-white shadow-sm" alt="">` :
                       `<div class="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 text-white text-xs flex items-center justify-center font-bold">${(u.realName || '未').charAt(0)}</div>`;
        return `<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/40 transition">
          <span class="w-7 h-7 rounded-full ${rankClass} text-xs flex items-center justify-center font-bold shrink-0">${i + 1}</span>
          ${avatar}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <div>
                <span class="text-sm font-medium text-slate-700 truncate">${escHtml(u.realName)}</span>
                <span class="text-[10px] text-slate-400 ml-1">${escHtml(u.department)}</span>
              </div>
              <span class="text-xs font-semibold text-orange-600">${u.hours}h</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-1.5">
              <div class="bg-gradient-to-r from-orange-400 to-amber-500 h-1.5 rounded-full" style="width:${pct}%"></div>
            </div>
          </div>
        </div>`;
      }).join('') || '<p class="text-sm text-slate-400 text-center py-8">暂无个人数据</p>';
    }

    /* 渲染课程分类分布 */
    function renderCategoryChart(list) {
      const el = document.getElementById('rpt-category-chart');
      if (!el) return;
      const total = list.reduce((s, c) => s + (c.count || 0), 0) || 1;
      const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500', 'bg-red-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'];
      el.innerHTML = list.map((c, i) => {
        const pct = Math.round(((c.count || 0) / total) * 100);
        const color = colors[i % colors.length];
        return `<div class="flex items-center gap-3">
          <div class="w-3 h-3 rounded-full ${color} shrink-0"></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between text-sm mb-1">
              <span class="text-slate-700 truncate">${escHtml(c.name)}</span>
              <span class="text-slate-500 text-xs">${c.count}门 (${pct}%)</span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-2">
              <div class="${color} h-2 rounded-full" style="width:${pct}%"></div>
            </div>
          </div>
        </div>`;
      }).join('') || '<p class="text-sm text-slate-400 text-center py-8">暂无分类数据</p>';
    }

    /* 渲染最近学习动态 */
    function renderRecentActivity(list) {
      const el = document.getElementById('rpt-recent-activity');
      if (!el) return;
      const now = new Date();
      el.innerHTML = list.map(a => {
        const time = a.time ? new Date(a.time) : null;
        const timeText = time ? formatRelativeTime(time, now) : '-';
        const avatar = a.avatar ? `<img src="${escHtml(a.avatar)}" class="w-9 h-9 rounded-full object-cover border border-white shadow-sm" alt="">` :
                       `<div class="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 text-white text-sm flex items-center justify-center font-bold">${(a.user || '未').charAt(0)}</div>`;
        return `<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/40 transition">
          ${avatar}
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-700">
              <span class="font-medium">${escHtml(a.user)}</span>
              <span class="text-slate-500"> 进行了学习</span>
            </p>
            <p class="text-xs text-slate-400 mt-0.5">${escHtml(a.department)} · 累计 ${a.hours}h</p>
          </div>
          <span class="text-xs text-slate-400 shrink-0">${timeText}</span>
        </div>`;
      }).join('') || '<p class="text-sm text-slate-400 text-center py-8">暂无学习动态</p>';
    }

    /* 相对时间格式化 */
    function formatRelativeTime(date, now = new Date()) {
      const diff = Math.floor((now - date) / 1000);
      if (diff < 60) return '刚刚';
      if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
      if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    function setTrendDays(days) {
      rptTrendDays = days;
      document.querySelectorAll('.rpt-trend-btn').forEach(b => {
        b.classList.remove('active');
      });
      const target = document.querySelector(`.rpt-trend-btn[onclick="setTrendDays(${days})"]`);
      if (target) {
        target.classList.add('active');
      }
      renderOverview();
    }

    /* 将秒转换为小时并格式化为 XH */
    function formatCourseDuration(seconds) {
      const s = Number(seconds) || 0;
      if (s <= 0) return '-';
      return +(s / 3600).toFixed(1) + 'H';
    }

    /* ============================================================
       2. 课程报表
       ============================================================ */
    function renderCourseReport() {
      const courses   = data.courses   || [];
      const lecturers = data.lecturers || [];
      const categories = data.categories || [];
      const timeVal   = document.getElementById('rpt-cr-time')?.value || 'all';
      const catVal    = document.getElementById('rpt-cr-cat')?.value || '';
      const kw        = (document.getElementById('rpt-cr-search')?.value || '').toLowerCase();

      // 时间过滤
      const now = new Date();
      function inRange(dateStr) {
        if (timeVal === 'all') return true;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const diff = (now - d) / (1000 * 60 * 60 * 24);
        if (timeVal === 'today')  return d.toDateString() === now.toDateString();
        if (timeVal === '7d')    return diff <= 7;
        if (timeVal === '30d')   return diff <= 30;
        if (timeVal === '180d')  return diff <= 180;
        if (timeVal === '365d')  return diff <= 365;
        return true;
      }

      let filtered = courses.filter(c => {
        if (!inRange(c.createdAt)) return false;
        if (catVal && String(c.categoryId) !== String(catVal)) return false;
        if (kw && !(c.title || '').toLowerCase().includes(kw)) return false;
        return true;
      });

      // 统计卡片
      const totalViews = filtered.reduce((s, c) => s + (parseInt(c.views) || 0), 0);
      el('rpt-cr-total',     filtered.length);
      el('rpt-cr-views',     totalViews);
      el('rpt-cr-avg',       filtered.length ? Math.round(totalViews / filtered.length) : 0);
      el('rpt-cr-published', filtered.filter(c => c.status === 'published').length);

      // 表格
      const tbody = document.getElementById('rpt-cr-tbody');
      if (!tbody) return;
      tbody.innerHTML = filtered.map(c => {
        const lect = lecturers.find(l => l.id == c.lecturerId);
        const cat  = categories.find(ct => ct.id == c.categoryId);
        const rating = c.rating != null ? Number(c.rating).toFixed(1) : '-';
        return `<tr class="hover:bg-indigo-50/50 transition">
          <td class="px-4 py-3 text-sm text-slate-700 font-medium">${escHtml(c.title)}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(cat?.name || '-')}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(lect?.name || '-')}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(c.createdBy || '许志坚')}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${(c.views || 0)}</td>
          <td class="px-4 py-3 text-sm text-center text-amber-600 font-medium">${rating}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${c.likes || 0}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${c.shares || 0}</td>
          <td class="px-4 py-3 text-sm text-center">
            <span class="cursor-pointer text-indigo-600 hover:underline font-medium" onclick="openCourseLearnersModal(${c.id})">${c.learners || 0}</span>
          </td>
          <td class="px-4 py-3 text-sm text-center text-green-600 font-medium">${c.finishers || 0}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-500">${formatCourseDuration(c.duration)}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-400">${(c.createdAt || '').split(' ')[0] || '-'}</td>
          <td class="px-4 py-3 text-sm text-center">
            <span class="px-2 py-0.5 rounded-full text-xs ${c.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
              ${c.status === 'published' ? '已发布' : '草稿'}</span>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="13" class="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>';
    }

    /* 课程学员详情弹窗 */
    async function openCourseLearnersModal(courseId) {
      const modal = document.getElementById('course-learners-modal');
      const titleEl = document.getElementById('course-learners-title');
      const tbody = document.getElementById('course-learners-tbody');
      if (!modal || !tbody) return;

      const course = (data.courses || []).find(c => String(c.id) === String(courseId));
      titleEl.textContent = course ? escHtml(course.title || '') : '';
      tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">加载中...</td></tr>';
      modal.classList.remove('hidden');

      try {
        const res = await fetch(`/api/courses/${courseId}/learners`);
        const payload = await res.json();
        const learners = payload.learners || [];
        if (!learners.length) {
          tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">暂无学员数据</td></tr>';
          return;
        }
        tbody.innerHTML = learners.map(l => `
          <tr class="hover:bg-indigo-50/50 transition">
            <td class="px-4 py-3 text-sm text-slate-700 font-medium">${escHtml(l.realName || '-')}</td>
            <td class="px-4 py-3 text-sm text-slate-500">${escHtml(l.department || '-')}</td>
            <td class="px-4 py-3 text-sm text-slate-500">${escHtml(l.position || '-')}</td>
            <td class="px-4 py-3 text-sm text-center text-slate-600">${l.hours != null ? l.hours + 'H' : '-'}</td>
            <td class="px-4 py-3 text-sm text-center">
              <span class="px-2 py-0.5 rounded-full text-xs ${l.status === '已完成' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">${l.status || '-'}</span>
            </td>
            <td class="px-4 py-3 text-sm text-center text-slate-500 whitespace-nowrap">${l.firstStudyTime || '-'}</td>
            <td class="px-4 py-3 text-sm text-center text-slate-500 whitespace-nowrap">${l.firstCompleteTime || '-'}</td>
            <td class="px-4 py-3 text-sm text-center">
              <div class="flex items-center justify-center gap-2">
                <span class="text-xs text-slate-600">${l.progress != null ? l.progress : 0}%</span>
                <div class="w-16 bg-slate-200 rounded-full h-1.5">
                  <div class="bg-gradient-to-r from-indigo-400 to-blue-500 h-1.5 rounded-full" style="width:${l.progress != null ? l.progress : 0}%"></div>
                </div>
              </div>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        console.error('加载课程学员详情失败:', err);
        tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-red-500">加载失败，请稍后重试</td></tr>';
      }
    }

    function closeCourseLearnersModal() {
      const modal = document.getElementById('course-learners-modal');
      if (modal) modal.classList.add('hidden');
    }

    /* ============================================================
       3. 学员报表
       ============================================================ */
    function renderStudentReport() {
      const users    = allUsers || [];
      const deptVal  = document.getElementById('rpt-st-dept')?.value || '';
      const statusVal = document.getElementById('rpt-st-status')?.value || '';
      const kw       = (document.getElementById('rpt-st-search')?.value || '').toLowerCase();

      let filtered = users.filter(u => {
        if (deptVal && u.department !== deptVal) return false;
        if (statusVal && u.status !== statusVal) return false;
        if (kw && !(u.realName || u.username || '').toLowerCase().includes(kw) && !(u.phone || '').includes(kw)) return false;
        return true;
      });

      // 统计卡片
      const activeUsers = users.filter(u => u.status === 'active').length;
      const depts = [...new Set(users.map(u => u.department).filter(Boolean))];
      el('rpt-st-total',  filtered.length);
      el('rpt-st-active', activeUsers);
      el('rpt-st-avghours', (filtered.length ? (filtered.reduce((s, u) => s + (parseFloat(u.totalHours) || 0), 0) / filtered.length).toFixed(1) : '0') + 'h');
      el('rpt-st-depts', depts.length);

      // 表格
      const tbody = document.getElementById('rpt-st-tbody');
      if (!tbody) return;
      tbody.innerHTML = filtered.map(u => `
        <tr class="hover:bg-indigo-50/50 transition">
          <td class="px-4 py-3 text-sm text-slate-700 font-medium">${escHtml(u.realName || u.username)}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(u.department || '-')}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(u.position || '-')}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-500">${escHtml({admin:'管理员',teacher:'讲师',user:'学员'}[u.role] || u.role || '-')}</td>
          <td class="px-4 py-3 text-sm text-center">
            <span class="w-2 h-2 rounded-full inline-block ${u.status === 'active' ? 'bg-green-500' : 'bg-red-500'}"></span>
            <span class="ml-1 text-xs ${u.status === 'active' ? 'text-green-600' : 'text-red-600'}">${u.status === 'active' ? '启用' : '禁用'}</span>
          </td>
          <td class="px-4 py-3 text-sm text-center text-indigo-600 font-medium">${u.totalHours || 0}h</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${u.trainingHours || 0}h</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${u.courseHours || 0}h</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${u.trainingCount || 0}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${u.courseCount || 0}</td>
          <td class="px-4 py-3 text-sm text-center text-amber-600 font-medium">${u.certificateCount || 0}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${u.examCount || 0}</td>
          <td class="px-4 py-3 text-sm text-center text-yellow-600 font-medium">${u.badgeCount || 0}</td>
          <td class="px-4 py-3 text-sm text-center text-purple-600 font-medium">LV${u.level || 1}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-400">${(u.createdAt || '').split(' ')[0] || '-'}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-400">${u.lastLogin || '-'}</td>
        </tr>`).join('') || '<tr><td colspan="16" class="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>';
    }

    /* ============================================================
       4. 考试报表
       ============================================================ */
    function renderExamReport() {
      const exams   = data.exams || [];
      const timeVal = document.getElementById('rpt-ex-time')?.value || 'all';
      const kw      = (document.getElementById('rpt-ex-search')?.value || '').toLowerCase();

      const now = new Date();
      function inRange(dateStr) {
        if (timeVal === 'all') return true;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const diff = (now - d) / (1000 * 60 * 60 * 24);
        if (timeVal === 'today')  return d.toDateString() === now.toDateString();
        if (timeVal === '7d')    return diff <= 7;
        if (timeVal === '30d')   return diff <= 30;
        if (timeVal === '180d')  return diff <= 180;
        if (timeVal === '365d')  return diff <= 365;
        return true;
      }

      let filtered = exams.filter(e => {
        if (!inRange(e.createdAt || e.startTime)) return false;
        if (kw && !(e.title || '').toLowerCase().includes(kw)) return false;
        return true;
      });

      // 统计卡片
      const allScores = filtered.flatMap(e => e.avgScore != null ? [parseFloat(e.avgScore)] : []);
      const avgScore  = allScores.length ? (allScores.reduce((s, v) => s + v, 0) / allScores.length).toFixed(1) : '-';
      const passCount = filtered.reduce((s, e) => s + (e.passCount || 0), 0);
      const completedCount = filtered.reduce((s, e) => s + (e.completedCount || 0), 0);
      const passRate  = completedCount ? Math.round(passCount / completedCount * 100) + '%' : '-';
      el('rpt-ex-total',      filtered.length);
      el('rpt-ex-participants', filtered.reduce((s, e) => s + (e.attemptCount || 0), 0));
      el('rpt-ex-avgscore',    avgScore);
      el('rpt-ex-passrate',    passRate);

      // 表格
      const tbody = document.getElementById('rpt-ex-tbody');
      if (!tbody) return;
      tbody.innerHTML = filtered.map(e => {
        const avg  = e.avgScore != null ? e.avgScore : '-';
        const max  = e.maxScore != null ? e.maxScore : '-';
        const prate = e.passRatePercent != null ? e.passRatePercent + '%' : '-';
        // 统一日期格式为 YYYY-MM-DD
        const dateStr = e.startTime || e.createdAt || '';
        const formattedDate = dateStr ? new Date(dateStr).toISOString().split('T')[0] : '-';
        return `<tr class="hover:bg-indigo-50/50 transition">
          <td class="px-4 py-3 text-sm text-slate-700 font-medium">${escHtml(e.title)}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${escHtml(e.creator || '许志坚')}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${escHtml(e.paperCategory || '-')}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${e.duration || 60}分钟</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${e.totalScore || 100}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${e.passingScore || 60}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${e.attemptCount || 0}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${avg}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-600">${max}</td>
          <td class="px-4 py-3 text-sm text-center text-green-600 font-medium">${prate}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-400">${formattedDate}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="11" class="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>';
    }

    /* ============================================================
       5. 培训报表
       ============================================================ */
    function renderTrainingReport() {
      // 使用 training_events 数据源（与培训管理模块一致）
      const trainings  = data.training_events || data.training || [];
      const timeVal    = document.getElementById('rpt-tr-time')?.value || 'all';
      const catVal     = document.getElementById('rpt-tr-cat')?.value || '';
      const kw         = (document.getElementById('rpt-tr-search')?.value || '').toLowerCase();

      const now = new Date();
      function inRange(dateStr) {
        if (timeVal === 'all') return true;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const diff = (now - d) / (1000 * 60 * 60 * 24);
        if (timeVal === 'today')  return d.toDateString() === now.toDateString();
        if (timeVal === '7d')    return diff <= 7;
        if (timeVal === '30d')   return diff <= 30;
        if (timeVal === '180d')  return diff <= 180;
        if (timeVal === '365d')  return diff <= 365;
        return true;
      }

      let filtered = trainings.filter(t => {
        // 兼容字段：startTime/date/createdAt
        const dateStr = t.startTime || t.date || t.createdAt;
        if (!inRange(dateStr)) return false;
        // 兼容字段：project/categoryId
        const category = t.project || t.categoryId || '';
        if (catVal && String(category) !== String(catVal)) return false;
        // 兼容字段：name/title
        const name = t.name || t.title || '';
        if (kw && !name.toLowerCase().includes(kw)) return false;
        return true;
      });

      // 根据日期判断状态（培训管理模块没有 status 字段）
      function getTrainingStatus(t) {
        if (t.status) return t.status;
        const endDate = t.endTime || t.date;
        if (!endDate) return 'scheduled';
        const end = new Date(endDate);
        if (end < now) return 'completed';
        const start = new Date(t.startTime || t.date);
        if (start <= now && end >= now) return 'ongoing';
        return 'scheduled';
      }

      const doneCount = filtered.reduce((s, t) => s + (t.completeCount || 0), 0);
      const totalPeople = filtered.reduce((s, t) => s + (t.totalCount || 0), 0);
      const totalAssign = filtered.reduce((s, t) => s + (t.assignCount || 0), 0);
      const totalActiveEnroll = filtered.reduce((s, t) => s + (t.activeEnrollCount || 0), 0);
      const rate = totalPeople > 0 ? Math.min(100, Math.round(doneCount / totalPeople * 100)) + '%' : '0%';

      el('rpt-tr-total',  filtered.length);
      el('rpt-tr-done',   doneCount);
      el('rpt-tr-people', totalPeople);
      el('rpt-tr-rate',   rate);

      const tbody = document.getElementById('rpt-tr-tbody');
      if (!tbody) return;

      function fmtDate(d) {
        if (!d) return '-';
        const s = String(d).split(' ')[0];
        if (!s) return '-';
        // 兼容 ISO 格式：2026-06-30T08:30
        if (s.includes('T')) return s.split('T')[0];
        return s;
      }

      tbody.innerHTML = filtered.map(t => {
        const name = t.name || t.title || '-';
        const instructor = t.instructor || '-';
        const project = t.project || '-';
        const totalCount = t.totalCount || 0;
        const enrollCount = t.activeEnrollCount || 0;
        const assignCount = t.assignCount || 0;
        const completeCount = t.completeCount || 0;
        const completionRate = t.completionRate != null ? t.completionRate + '%' : (totalCount > 0 ? Math.min(100, Math.round(completeCount / totalCount * 100)) + '%' : '0%');
        const status = getTrainingStatus(t);
        const statusMap = {scheduled:'待开始',ongoing:'进行中',completed:'已完成',cancelled:'已取消'};
        return `<tr class="hover:bg-indigo-50/50 transition">
          <td class="px-4 py-3 text-sm text-slate-700 font-medium">${escHtml(name)}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(project)}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(t.createdBy || '许志坚')}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${escHtml(instructor)}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-400">${fmtDate(t.createdAt)}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-400">${fmtDate(t.startTime || t.date)}</td>
          <td class="px-4 py-3 text-sm text-center text-slate-400">${fmtDate(t.endTime || t.date)}</td>
          <td class="px-4 py-3 text-sm text-center text-green-600 font-medium">${completeCount}</td>
          <td class="px-4 py-3 text-sm text-center text-indigo-600 font-medium">${totalCount}</td>
          <td class="px-4 py-3 text-sm text-center text-cyan-600">${assignCount}</td>
          <td class="px-4 py-3 text-sm text-center text-emerald-600">${enrollCount}</td>
          <td class="px-4 py-3 text-sm text-center text-indigo-600 font-medium">${completionRate}</td>
          <td class="px-4 py-3 text-sm text-center">
            <span class="px-2 py-0.5 rounded-full text-xs ${status === 'completed' ? 'bg-green-100 text-green-700' : status === 'ongoing' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}">
              ${statusMap[status] || status || '-'}</span>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="13" class="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>';
    }

    /* ============================================================
       通用：Excel 导出（使用 SheetJS 生成真正的 .xlsx）
       ============================================================ */
    function exportReportExcel(type) {
      let headers = [];
      let rows    = [];
      let filename = '';
      let sheetName = '报表数据';
      let colWidths = [];

      if (type === 'course') {
        headers = ['课程名称', '分类', '讲师', '创建人', '播放量', '课程评分', '点赞数', '转发数', '学习人数', '学完人数', '学习时长(H)', '创建时间', '状态'];
        (data.courses || []).forEach(c => {
          const lect = (data.lecturers || []).find(l => l.id == c.lecturerId);
          const cat  = (data.categories || []).find(ct => ct.id == c.categoryId);
          const rating = c.rating != null ? Number(c.rating).toFixed(1) : '';
          rows.push([c.title, cat?.name || '', lect?.name || '', c.createdBy || '许志坚', c.views || 0, rating, c.likes || 0, c.shares || 0, c.learners || 0, c.finishers || 0, formatCourseDuration(c.duration), (c.createdAt || '').split(' ')[0], c.status === 'published' ? '已发布' : '草稿']);
        });
        filename = '课程报表_' + new Date().toISOString().split('T')[0] + '.xlsx';
        sheetName = '课程报表';
        colWidths = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
      }
      if (type === 'student') {
        headers = ['姓名', '部门', '岗位', '角色', '状态', '总学习时长', '培训学习时长', '课程学习时长', '参与培训数', '学习课程数', '获得证书数', '学员考试数', '获得徽章数', '员工等级', '创建时间', '最后登录'];
        (allUsers || []).forEach(u => {
          rows.push([u.realName || u.username, u.department || '', u.position || '', {admin:'管理员',teacher:'讲师',user:'学员'}[u.role] || u.role || '', u.status === 'active' ? '启用' : '禁用', (u.totalHours || 0) + 'h', (u.trainingHours || 0) + 'h', (u.courseHours || 0) + 'h', u.trainingCount || 0, u.courseCount || 0, u.certificateCount || 0, u.examCount || 0, u.badgeCount || 0, 'LV' + (u.level || 1), (u.createdAt || '').split(' ')[0], u.lastLogin || '']);
        });
        filename = '学员报表_' + new Date().toISOString().split('T')[0] + '.xlsx';
        sheetName = '学员报表';
        colWidths = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 16 }];
      }
      if (type === 'exam') {
        headers = ['考试名称', '创建人', '试卷分类', '考试时长', '试卷总分', '及格分', '参与人数', '平均分', '最高分', '通过率', '考试时间'];
        (data.exams || []).forEach(e => {
          const avg = e.avgScore != null ? e.avgScore : '';
          const max = e.maxScore != null ? e.maxScore : '';
          const prate = e.passRatePercent != null ? e.passRatePercent + '%' : '';
          const dateStr = e.startTime || e.createdAt || '';
          const formattedDate = dateStr ? new Date(dateStr).toISOString().split('T')[0] : '';
          rows.push([e.title, e.creator || '许志坚', e.paperCategory || '', e.duration || 60, e.totalScore || 100, e.passingScore || 60, e.attemptCount || 0, avg, max, prate, formattedDate]);
        });
        filename = '考试报表_' + new Date().toISOString().split('T')[0] + '.xlsx';
        sheetName = '考试报表';
        colWidths = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
      }
      if (type === 'training') {
        headers = ['培训名称', '培训项目', '创建人', '讲师', '创建时间', '开始时间', '结束时间', '完成人数', '报名总人数', '指派人数', '自主报名', '培训完成率', '状态'];
        (data.training_events || data.training || []).forEach(t => {
          const name = t.name || t.title || '';
          const project = t.project || '';
          const instructor = t.instructor || '';
          const totalCount = t.totalCount || 0;
          const enrollCount = t.activeEnrollCount || 0;
          const assignCount = t.assignCount || 0;
          const completeCount = t.completeCount || 0;
          const completionRate = t.completionRate != null ? t.completionRate + '%' : (totalCount > 0 ? Math.min(100, Math.round(completeCount / totalCount * 100)) + '%' : '0%');
          function fmtCsvDate(d) {
            if (!d) return '';
            let s = String(d).split(' ')[0] || '';
            if (s.includes('T')) s = s.split('T')[0];
            return s;
          }
          const createdAt = fmtCsvDate(t.createdAt);
          const startTime = fmtCsvDate(t.startTime || t.date);
          const endTime = fmtCsvDate(t.endTime || t.date);
          const statusMap = {scheduled:'待开始',ongoing:'进行中',completed:'已完成',cancelled:'已取消'};
          rows.push([name, project, t.createdBy || '许志坚', instructor, createdAt, startTime, endTime, completeCount, totalCount, assignCount, enrollCount, completionRate, statusMap[t.status] || t.status || '']);
        });
        filename = '培训报表_' + new Date().toISOString().split('T')[0] + '.xlsx';
        sheetName = '培训报表';
        colWidths = [{ wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
      }

      // 生成 Excel（真正的 .xlsx）
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, filename);
      toast('导出成功：' + filename, 'success');
    }

    /* 工具：设置元素文本（id 存在时才操作） */
    function el(id, v) {
      const e = document.getElementById(id);
      if (e) e.textContent = v;
    }

    // ========== 调研管理 ==========
    let surveyQuestions = [];
    let currentSurveyId = null;
    let surveyStats = {};

    async function loadSurveyList() {
      const container = document.getElementById('survey-list-container');
      if (!container) return;

      try {
        const [surveysRes, statsRes] = await Promise.all([
          fetch('/api/surveys'),
          fetch('/api/surveys/stats')
        ]);
        const json = await surveysRes.json();
        const surveys = (json.success && json.data) ? json.data : (Array.isArray(json) ? json : []);

        if (statsRes.ok) {
          const statsJson = await statsRes.json();
          surveyStats = (statsJson.success && statsJson.data) ? statsJson.data : {};
        }
        const totalEl = document.getElementById('stat-total-surveys');
        const activeEl = document.getElementById('stat-active-surveys');
        const draftEl = document.getElementById('stat-draft-surveys');
        const responsesEl = document.getElementById('stat-total-responses');
        if (totalEl) totalEl.textContent = surveyStats.totalSurveys || surveys.length;
        if (activeEl) activeEl.textContent = surveyStats.activeSurveys || 0;
        if (draftEl) draftEl.textContent = surveyStats.draftSurveys || 0;
        if (responsesEl) responsesEl.textContent = surveyStats.totalResponses || 0;

        const surveyCountEl = document.getElementById('survey-count');
        if (surveyCountEl) surveyCountEl.textContent = surveys.length;

        if (!surveys.length) {
          container.innerHTML = `
            <tr>
              <td colspan="8" class="px-6 py-16 text-center text-slate-400">
                <i class="fas fa-poll text-4xl mb-3 block"></i>
                <p>暂未创建调研问卷</p>
                <button onclick="openSurveyModal()" class="mt-4 btn-primary px-6 py-2.5 text-white rounded-xl font-medium">创建第一个调研</button>
              </td>
            </tr>`;
          updateSurveyBatchActionBar();
          return;
        }

        const responsesBySurvey = surveyStats.responsesBySurvey || {};

        container.innerHTML = surveys.map(s => {
          const statusMap = { draft: '未发布', active: '已发布', published: '已发布', ended: '未发布' };
          const statusColor = { draft: 'bg-slate-100 text-slate-600', active: 'bg-emerald-100 text-emerald-700', published: 'bg-emerald-100 text-emerald-700', ended: 'bg-slate-100 text-slate-600' };
          const qCount = s.questions ? s.questions.length : 0;
          const rCount = responsesBySurvey[s.id] || 0;
          const checked = surveySelectedIds.has(String(s.id)) ? 'checked' : '';

          return `
            <tr class="hover:bg-slate-50 transition">
              <td class="pl-5 pr-2 py-4 text-center" onclick="event.stopPropagation()">
                <input type="checkbox" class="survey-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleSurveySelect('${s.id}')" ${checked}>
              </td>
              <td class="px-5 py-4">
                <p class="text-sm font-semibold text-slate-800">${escHtml(s.title || '未命名调研')}</p>
              </td>
              <td class="px-5 py-4">
                <p class="text-sm text-slate-500 max-w-xs truncate">${escHtml(s.description || '暂无描述')}</p>
              </td>
              <td class="px-5 py-4 text-center">
                <span class="text-sm text-slate-700 font-medium">${qCount}</span>
                <span class="text-xs text-slate-400 ml-0.5">题</span>
              </td>
              <td class="px-5 py-4 text-center">
                <span class="text-sm text-slate-700 font-medium">${rCount}</span>
                <span class="text-xs text-slate-400 ml-0.5">人</span>
              </td>
              <td class="px-5 py-4 text-center">
                <span class="px-2 py-1 ${statusColor[s.status] || 'bg-gray-100 text-gray-600'} rounded text-xs whitespace-nowrap">${statusMap[s.status] || s.status}</span>
              </td>
              <td class="px-5 py-4 text-center text-sm text-slate-500">
                ${s.createdAt ? new Date(s.createdAt).toLocaleDateString('zh-CN') : '未知'}
              </td>
              <td class="px-5 py-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <button onclick="toggleSurveyPublish(${s.id}, '${s.status}')" class="${s.status === 'active' || s.status === 'published' ? 'text-amber-500 hover:text-amber-700' : 'text-emerald-500 hover:text-emerald-700'} transition" title="${s.status === 'active' || s.status === 'published' ? '取消发布' : '发布'}"><i class="fas ${s.status === 'active' || s.status === 'published' ? 'fa-pause-circle' : 'fa-play-circle'}"></i></button>
                  <button onclick="editSurvey(${s.id})" class="text-indigo-500 hover:text-indigo-700 transition" title="编辑"><i class="fas fa-edit"></i></button>
                  <button onclick="copySurveyLink(${s.id})" class="text-sky-500 hover:text-sky-700 transition" title="复制链接"><i class="fas fa-link"></i></button>
                  <button onclick="viewSurveyResponses(${s.id})" class="text-teal-500 hover:text-teal-700 transition" title="数据"><i class="fas fa-chart-bar"></i></button>
                  <button onclick="duplicateSurvey(${s.id})" class="text-slate-400 hover:text-slate-600 transition" title="复制"><i class="fas fa-copy"></i></button>
                  <button onclick="deleteSurvey(${s.id})" class="text-red-500 hover:text-red-700 transition" title="删除"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>`;
        }).join('');
        updateSurveySelectAllState();
        updateSurveyBatchActionBar();
      } catch (e) {
        console.error('加载调研列表失败:', e);
        container.innerHTML = '<tr><td colspan="8" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-exclamation-triangle text-2xl mb-2 block"></i>加载失败</td></tr>';
      }
    }

    function toggleSurveySelect(id) {
      const sid = String(id);
      if (surveySelectedIds.has(sid)) surveySelectedIds.delete(sid);
      else surveySelectedIds.add(sid);
      updateSurveySelectAllState();
      updateSurveyBatchActionBar();
    }

    function toggleSurveySelectAll() {
      const checked = document.getElementById('surveySelectAll').checked;
      const visible = Array.from(document.querySelectorAll('.survey-row-check')).map(cb => cb.getAttribute('onchange').match(/toggleSurveySelect\('([^']+)'\)/)?.[1]).filter(Boolean);
      if (checked) visible.forEach(id => surveySelectedIds.add(String(id)));
      else visible.forEach(id => surveySelectedIds.delete(String(id)));
      loadSurveyList();
      updateSurveyBatchActionBar();
    }

    function updateSurveySelectAllState() {
      const checkboxes = Array.from(document.querySelectorAll('.survey-row-check'));
      const allChecked = checkboxes.length > 0 && checkboxes.every(cb => {
        const id = cb.getAttribute('onchange').match(/toggleSurveySelect\('([^']+)'\)/)?.[1];
        return id && surveySelectedIds.has(String(id));
      });
      const el = document.getElementById('surveySelectAll');
      if (el) el.checked = allChecked;
    }

    function updateSurveyBatchActionBar() {
      const bar = document.getElementById('surveyBatchActionBar');
      const count = document.getElementById('surveyBatchCount');
      if (!bar || !count) return;
      if (surveySelectedIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = `已选 ${surveySelectedIds.size} 项`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function clearSurveySelection() {
      surveySelectedIds.clear();
      const el = document.getElementById('surveySelectAll');
      if (el) el.checked = false;
      loadSurveyList();
      updateSurveyBatchActionBar();
    }

    async function batchDeleteSurveys() {
      const ids = Array.from(surveySelectedIds);
      if (!ids.length) return;
      if (!confirm(`确定删除选中的 ${ids.length} 个调研吗？`)) return;
      let success = 0, fail = 0;
      for (const id of ids) {
        try {
          const ok = await deleteSurvey(id, false);
          if (ok) success++; else fail++;
        } catch (e) { fail++; }
      }
      clearSurveySelection();
      await loadSurveyList();
      toast(`删除完成：成功 ${success}，失败 ${fail}`);
    }

    function copySurveyLink(id) {
      const url = window.location.origin + '/survey.html?id=' + id;
      navigator.clipboard.writeText(url).then(() => {
        toast('问卷链接已复制');
      }).catch(() => {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        toast('问卷链接已复制');
      });
    }

    async function toggleSurveyPublish(id, currentStatus) {
      const newStatus = (currentStatus === 'active' || currentStatus === 'published') ? 'draft' : 'published';
      try {
        const res = await fetch('/api/surveys/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          toast(newStatus === 'published' ? '调研已发布' : '已取消发布');
          loadSurveyList();
        } else {
          toast('操作失败', 'error');
        }
      } catch (e) {
        toast('操作失败: ' + e.message, 'error');
      }
    }

    async function duplicateSurvey(id) {
      try {
        const res = await fetch('/api/surveys/' + id);
        const json = await res.json();
        if (!json.success) { toast('获取调研失败', 'error'); return; }
        const original = json.data;
        const copyRes = await fetch('/api/surveys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: (original.title || '未命名') + ' (副本)',
            description: original.description || '',
            status: 'draft',
            questions: (original.questions || []).map((q, idx) => ({ ...q, id: idx + 1 }))
          })
        });
        if (copyRes.ok) {
          toast('已复制为新调研');
          loadSurveyList();
        } else {
          toast('复制失败', 'error');
        }
      } catch (e) {
        toast('复制失败: ' + e.message, 'error');
      }
    }

    function openSurveyModal(id = null) {
      surveyQuestions = [];
      currentSurveyId = null;
      const isEdit = id !== null;
      if (isEdit) {
        editSurvey(id);
        return;
      }
      renderSurveyModal(null, isEdit);
    }

    function renderSurveyModal(survey, isEdit) {
      if (survey) {
        surveyQuestions = (survey.questions || []).map((q, idx) => ({
          ...q,
          id: q.id || idx + 1,
          options: (q.options || ['']).map(opt => typeof opt === 'string' ? opt : (opt.label || ''))
        }));
      } else {
        surveyQuestions = [];
      }

      document.querySelectorAll('.survey-modal-overlay').forEach(el => el.remove());

      const modal = document.createElement('div');
      modal.className = 'survey-modal-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-start justify-center pt-8 pb-8';
      modal.onclick = function(e) { if (e.target === this) this.remove(); };

      const questionsHtml = surveyQuestions.map((q, idx) => `
        <div class="bg-white rounded-xl border border-slate-200 p-4 mb-3 question-item shadow-sm hover:shadow-md transition" data-idx="${idx}">
          <div class="flex items-center gap-2 mb-3">
            <span class="q-number flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs font-bold flex items-center justify-center">${idx + 1}</span>
            <select onchange="surveyQuestions[${idx}].type = this.value; renderSurveyQuestionItem(${idx})" class="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-300 outline-none">
              <option value="radio" ${q.type === 'radio' ? 'selected' : ''}>单选题</option>
              <option value="checkbox" ${q.type === 'checkbox' ? 'selected' : ''}>多选题</option>
              <option value="text" ${q.type === 'text' ? 'selected' : ''}>填空题</option>
              <option value="rating" ${q.type === 'rating' ? 'selected' : ''}>评分题</option>
            </select>
            <label class="flex items-center gap-1 text-xs ml-auto cursor-pointer select-none">
              <input type="checkbox" ${q.required ? 'checked' : ''} onchange="surveyQuestions[${idx}].required = this.checked" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
              <span class="text-slate-600">必答</span>
            </label>
            <button onclick="removeSurveyQuestion(${idx})" class="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition text-sm"><i class="fas fa-trash-alt"></i></button>
          </div>
          <input type="text" value="${escHtml(q.title || '')}" placeholder="请输入题目内容" onchange="surveyQuestions[${idx}].title = this.value" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
          <div id="q-options-${idx}">${renderQuestionOptions(idx, q)}</div>
        </div>
      `).join('');

      modal.innerHTML = `
        <div class="bg-slate-50 rounded-2xl w-full max-w-2xl max-h-[calc(100vh-4rem)] flex flex-col shadow-2xl relative overflow-hidden" onclick="event.stopPropagation()">
          <div class="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 px-6 py-5 flex-shrink-0 flex items-center justify-between">
            <div>
              <h2 class="text-xl font-bold text-white">${isEdit ? '编辑调研' : '创建调研'}</h2>
              <p class="text-white/60 text-sm mt-0.5">${isEdit ? '修改调研内容和题目' : '设计新的调研问卷'}</p>
            </div>
            <button onclick="this.closest('.survey-modal-overlay').remove()" class="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition"><i class="fas fa-times"></i></button>
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 class="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><i class="fas fa-info-circle text-indigo-400"></i>基本信息</h3>
              <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label class="block text-xs font-medium text-slate-500 mb-1.5">调研标题 <span class="text-red-500">*</span></label>
                  <input type="text" id="survey-title" value="${escHtml(survey ? survey.title || '' : '')}" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm" placeholder="如:培训满意度调研">
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-500 mb-1.5">发布状态</label>
                  <select id="survey-status" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-sm">
                    <option value="draft" ${survey && survey.status === 'draft' ? 'selected' : ''}>未发布</option>
                    <option value="published" ${survey && (survey.status === 'active' || survey.status === 'published') ? 'selected' : ''}>已发布</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">调研描述</label>
                <textarea id="survey-desc" rows="2" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm resize-none" placeholder="简要描述调研目的(选填)">${escHtml(survey ? survey.description || '' : '')}</textarea>
              </div>
            </div>
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div class="flex items-center mb-4">
                <h3 class="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <i class="fas fa-list-ol text-purple-400"></i>题目列表
                  <span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full text-xs font-bold">${surveyQuestions.length}</span>
                </h3>
              </div>
              <div id="questions-container">
                ${questionsHtml || `
                  <div class="text-center py-8 text-slate-400">
                    <i class="fas fa-inbox text-2xl mb-2 block"></i>
                    <p class="text-sm">暂无题目,点击下方按钮添加</p>
                  </div>`}
              </div>
            </div>
          </div>
          <div class="px-6 pb-5 pt-4 flex items-center gap-3 bg-white border-t border-slate-100">
            <button onclick="addSurveyQuestion()" class="px-4 py-3 rounded-xl border-2 border-dashed border-indigo-300 text-indigo-600 font-medium hover:bg-indigo-50 hover:border-indigo-400 transition text-sm flex items-center gap-2">
              <i class="fas fa-plus"></i>添加题目
            </button>
            <div class="flex-1"></div>
            <button onclick="this.closest('.survey-modal-overlay').remove()" class="px-5 py-3 rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition text-sm">取消</button>
            <button onclick="saveSurvey()" class="px-5 py-3 rounded-xl btn-primary text-white font-medium hover:opacity-90 transition text-sm shadow-lg"><i class="fas fa-save mr-2"></i>${isEdit ? '保存修改' : '创建调研'}</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function renderQuestionOptions(idx, q) {
      if (q.type === 'radio' || q.type === 'checkbox') {
        const options = q.options || [''];
        return options.map((opt, oi) => `
          <div class="flex items-center gap-2 mb-1.5">
            <span class="flex-shrink-0 w-5 h-5 rounded bg-slate-100 text-xs text-slate-500 font-medium flex items-center justify-center">${String.fromCharCode(65 + oi)}</span>
            <input type="text" value="${escHtml(typeof opt === 'string' ? opt : (opt.label || opt))}" placeholder="选项 ${String.fromCharCode(65 + oi)}" onchange="surveyQuestions[${idx}].options[${oi}] = this.value" class="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent">
            ${options.length > 1 ? `<button onclick="surveyQuestions[${idx}].options.splice(${oi},1); renderSurveyQuestionItem(${idx})" class="w-6 h-6 rounded flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition text-xs"><i class="fas fa-times"></i></button>` : ''}
          </div>
        `).join('') + `
          <button onclick="surveyQuestions[${idx}].options.push(''); renderSurveyQuestionItem(${idx})" class="text-xs text-indigo-600 hover:text-indigo-800 mt-2 flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 transition"><i class="fas fa-plus"></i>添加选项</button>`;
      } else if (q.type === 'rating') {
        const max = q.maxRating || 5;
        return `<div class="flex items-center gap-1.5 py-1">
          ${Array.from({length: max}, (_, i) => `<i class="fas fa-star text-lg ${i < max ? 'text-amber-400' : 'text-slate-200'}"></i>`).join('')}
          <span class="text-xs text-slate-400 ml-2 bg-amber-50 px-2 py-0.5 rounded-full">${max} 分制</span>
        </div>`;
      } else {
        return '<div class="py-1"><span class="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg"><i class="fas fa-align-left mr-1"></i>用户将看到文本输入框</span></div>';
      }
    }

    function renderSurveyQuestionItem(idx) {
      const container = document.getElementById('q-options-' + idx);
      if (container && surveyQuestions[idx]) {
        container.innerHTML = renderQuestionOptions(idx, surveyQuestions[idx]);
      }
    }

    function getCurrentSurveyData() {
      return {
        title: document.getElementById('survey-title')?.value || '',
        description: document.getElementById('survey-desc')?.value || '',
        status: document.getElementById('survey-status')?.value || 'draft',
        questions: surveyQuestions.map((q, idx) => ({ ...q, id: q.id || idx + 1 }))
      };
    }

    function addSurveyQuestion() {
      const maxId = surveyQuestions.reduce((max, q) => Math.max(max, q.id || 0), 0);
      const newQ = { id: maxId + 1, type: 'radio', title: '', required: false, options: [''] };
      surveyQuestions.push(newQ);
      const idx = surveyQuestions.length - 1;

      const container = document.getElementById('questions-container');
      if (!container) return;
      const emptyHint = container.querySelector('.text-center');
      if (emptyHint && container.children.length === 1) emptyHint.remove();

      const div = document.createElement('div');
      div.className = 'bg-white rounded-xl border border-slate-200 p-4 mb-3 question-item shadow-sm hover:shadow-md transition';
      div.innerHTML = `
        <div class="flex items-center gap-2 mb-3">
          <span class="q-number flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs font-bold flex items-center justify-center">${idx + 1}</span>
          <select onchange="surveyQuestions[${idx}].type = this.value; renderSurveyQuestionItem(${idx})" class="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-300 outline-none">
            <option value="radio" selected>单选题</option>
            <option value="checkbox">多选题</option>
            <option value="text">填空题</option>
            <option value="rating">评分题</option>
          </select>
          <label class="flex items-center gap-1 text-xs ml-auto cursor-pointer select-none">
            <input type="checkbox" onchange="surveyQuestions[${idx}].required = this.checked" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
            <span class="text-slate-600">必答</span>
          </label>
          <button onclick="removeSurveyQuestion(${idx})" class="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition text-sm"><i class="fas fa-trash-alt"></i></button>
        </div>
        <input type="text" placeholder="请输入题目内容" onchange="surveyQuestions[${idx}].title = this.value" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
        <div id="q-options-${idx}">${renderQuestionOptions(idx, newQ)}</div>
      `;
      container.appendChild(div);

      const badge = container.closest('.bg-white')?.querySelector('.bg-indigo-50');
      if (badge) badge.textContent = surveyQuestions.length;

      div.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function removeSurveyQuestion(idx) {
      surveyQuestions.splice(idx, 1);

      const container = document.getElementById('questions-container');
      if (!container) return;

      const items = container.querySelectorAll('.question-item');
      if (items[idx]) items[idx].remove();

      if (surveyQuestions.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-slate-400"><i class="fas fa-inbox text-2xl mb-2 block"></i><p class="text-sm">暂无题目，点击下方按钮添加</p></div>';
      } else {
        const remaining = container.querySelectorAll('.question-item');
        remaining.forEach((item, newIdx) => {
          const numEl = item.querySelector('.q-number');
          if (numEl) numEl.textContent = newIdx + 1;
          const sel = item.querySelector('select');
          if (sel) sel.setAttribute('onchange', 'surveyQuestions[' + newIdx + '].type = this.value; renderSurveyQuestionItem(' + newIdx + ')');
          const cb = item.querySelector('input[type="checkbox"]');
          if (cb) cb.setAttribute('onchange', 'surveyQuestions[' + newIdx + '].required = this.checked');
          const delBtn = item.querySelector('.fa-trash-alt')?.closest('button');
          if (delBtn) delBtn.setAttribute('onclick', 'removeSurveyQuestion(' + newIdx + ')');
          const titleInput = item.querySelector('input[type="text"]');
          if (titleInput && titleInput.placeholder === '请输入题目内容') titleInput.setAttribute('onchange', 'surveyQuestions[' + newIdx + '].title = this.value');
          const optDiv = item.querySelector('[id^="q-options-"]');
          if (optDiv) {
            optDiv.id = 'q-options-' + newIdx;
            optDiv.innerHTML = renderQuestionOptions(newIdx, surveyQuestions[newIdx]);
          }
        });
      }

      const badge = container.closest('.bg-white')?.querySelector('.bg-indigo-50');
      if (badge) badge.textContent = surveyQuestions.length;
    }
    async function saveSurvey() {
      const title = document.getElementById('survey-title').value.trim();
      const description = document.getElementById('survey-desc').value.trim();
      const status = document.getElementById('survey-status').value;

      if (!title) { toast('请输入调研标题', 'warning'); return; }
      if (surveyQuestions.length === 0) { toast('请至少添加一个题目', 'warning'); return; }

      const normalizedQuestions = surveyQuestions.map((q, idx) => ({
        ...q,
        id: q.id || idx + 1,
        options: (q.options || []).map(opt => typeof opt === 'string' ? opt : (opt.label || opt))
      }));

      const body = { title, description, status, questions: normalizedQuestions };
      const isEdit = currentSurveyId !== null && currentSurveyId !== undefined;
      const url = isEdit ? '/api/surveys/' + currentSurveyId : '/api/surveys';
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) {
          toast(isEdit ? '调研已更新' : '调研已创建');
          document.querySelectorAll('.survey-modal-overlay').forEach(el => el.remove());
          currentSurveyId = null;
          loadSurveyList();
        } else {
          toast('保存失败', 'error');
        }
      } catch (e) {
        toast('保存失败: ' + e.message, 'error');
      }
    }

    async function editSurvey(id) {
      currentSurveyId = id;
      try {
        const res = await fetch('/api/surveys/' + id);
        const json = await res.json();
        const survey = json.success ? json.data : json;
        renderSurveyModal(survey, true);
      } catch (e) {
        toast('获取调研信息失败', 'error');
        currentSurveyId = null;
      }
    }

    async function deleteSurvey(id, askConfirm = true) {
      if (askConfirm && !confirm('确定删除这个调研吗？题目图片及所有答卷记录将一并清理。')) return false;
      try {
        const res = await fetch('/api/surveys/' + id, { method: 'DELETE' });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success !== false) {
          if (askConfirm) { toast('调研已删除'); loadSurveyList(); }
          return true;
        }
        if (askConfirm) toast(result.error || '删除失败', 'error');
        return false;
      } catch (e) {
        if (askConfirm) toast('删除失败: ' + e.message, 'error');
        return false;
      }
    }

    // 兼容调研作答记录的两种 answers 格式：数组或对象
    function normalizeSurveyAnswers(answers) {
      if (!answers) return [];
      if (Array.isArray(answers)) return answers;
      if (typeof answers === 'object') {
        return Object.entries(answers).map(([questionId, value]) => ({
          questionId: isNaN(Number(questionId)) ? questionId : Number(questionId),
          value
        }));
      }
      return [];
    }

    async function viewSurveyResponses(surveyId) {
      try {
        const [res, surveyRes] = await Promise.all([
          fetch('/api/surveys/' + surveyId + '/responses'),
          fetch('/api/surveys/' + surveyId)
        ]);
        const json = await res.json();
        const responses = json.data || [];
        const surveyJson = await surveyRes.json();
        const survey = surveyJson.data || {};
        const questions = survey.questions || [];

        // 缓存数据供导出使用（将对象格式 answers 统一为数组，避免后续处理报错）
        window._surveyExportData = {
          survey,
          questions,
          responses: responses.map(r => ({ ...r, answers: normalizeSurveyAnswers(r.answers) }))
        };

        const modal = document.createElement('div');
        modal.className = 'survey-modal-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-start justify-center pt-8 pb-8';
        modal.onclick = function(e) { if (e.target === this) this.remove(); };

        // 题目统计
        const questionStats = questions.map(q => {
          const stats = { question: q, answers: {} };
          responses.forEach(r => {
            const answer = normalizeSurveyAnswers(r.answers).find(a => String(a.questionId) === String(q.id));
            if (answer && answer.value !== undefined && answer.value !== null && answer.value !== '') {
              const key = Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value);
              stats.answers[key] = (stats.answers[key] || 0) + 1;
            }
          });
          return stats;
        });

        modal.innerHTML = `
          <div class="bg-slate-50 rounded-2xl w-full max-w-4xl max-h-[calc(100vh-4rem)] flex flex-col shadow-2xl relative overflow-hidden" onclick="event.stopPropagation()">
            <div class="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-5 flex-shrink-0 flex items-center justify-between">
              <div>
                <h2 class="text-xl font-bold text-white">调研数据</h2>
                <p class="text-white/60 text-sm mt-0.5">${escHtml(survey.title || '')} · ${responses.length} 人提交</p>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="exportSurveyExcel()" class="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition flex items-center gap-1.5"><i class="fas fa-download"></i>导出表格</button>
                <button onclick="this.closest('.survey-modal-overlay').remove()" class="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition"><i class="fas fa-times"></i></button>
              </div>
            </div>
            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <!-- 题目统计 -->
              ${questionStats.length > 0 ? `
                <div class="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 class="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><i class="fas fa-chart-pie text-teal-500"></i>题目统计</h3>
                  <div class="space-y-4">
                    ${questionStats.map((qs, i) => `
                      <div class="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <p class="text-sm font-medium text-slate-700 mb-2"><span class="text-indigo-500 mr-1">${i+1}.</span> ${escHtml(qs.question.title || '未命名题目')}</p>
                        ${Object.keys(qs.answers).length > 0 ? `
                          <div class="space-y-1.5">
                            ${Object.entries(qs.answers).sort((a,b) => b[1]-a[1]).map(([key, count]) => {
                              const pct = responses.length > 0 ? Math.round(count / responses.length * 100) : 0;
                              return '<div class="flex items-center gap-2">' +
                                '<span class="text-xs text-slate-600 w-28 truncate flex-shrink-0">' + escHtml(key) + '</span>' +
                                '<div class="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">' +
                                '<div class="h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full" style="width:' + pct + '%"></div>' +
                                '</div>' +
                                '<span class="text-xs text-slate-500 w-16 text-right flex-shrink-0">' + count + '人 ' + pct + '%</span>' +
                              '</div>';
                            }).join('')}
                          </div>
                        ` : '<p class="text-xs text-slate-400">暂无作答数据</p>'}
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- 填写记录 -->
              <div class="bg-white rounded-xl border border-slate-200 p-5">
                <h3 class="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><i class="fas fa-clipboard-list text-indigo-500"></i>填写记录 <span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full text-xs font-bold">${responses.length}</span></h3>
                ${responses.length === 0 ? '<p class="text-center text-slate-400 py-8 text-sm">暂无作答记录</p>' : `
                  <div class="divide-y divide-slate-100">
                    ${responses.map((r, i) => {
                      return '<div class="flex items-center justify-between py-3 px-2 hover:bg-slate-50 rounded-lg transition">' +
                        '<div class="flex items-center gap-3">' +
                          '<div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center flex-shrink-0">' +
                            '<i class="fas fa-user text-white text-xs"></i>' +
                          '</div>' +
                          '<div>' +
                            '<p class="text-sm font-medium text-slate-700">' + escHtml(r.userName || '匿名用户') + '</p>' +
                            '<p class="text-xs text-slate-400">' + (r.department ? escHtml(r.department) + ' · ' : '') + (r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '-') + '</p>' +
                          '</div>' +
                        '</div>' +
                        '<button onclick="viewResponseDetail(' + i + ')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-medium transition">查看详情</button>' +
                      '</div>';
                    }).join('')}
                  </div>
                `}
              </div>
            </div>
            <div class="px-6 pb-5 pt-3 bg-white border-t border-slate-100">
              <button onclick="this.closest('.survey-modal-overlay').remove()" class="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition text-sm">关闭</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      } catch (e) { toast('获取数据失败: ' + e.message, 'error'); }
    }

    function exportSurveyExcel() {
      const data = window._surveyExportData;
      if (!data || !data.responses || !data.responses.length) {
        toast('暂无数据可导出', 'warning');
        return;
      }
      const { survey, questions, responses } = data;
      const headers = ['序号', '姓名', '部门', '岗位', '提交时间', ...questions.map((q, i) => (i+1) + '.' + (q.title || '题目' + (i+1)))];
      const rows = responses.map((r, i) => {
        const answers = normalizeSurveyAnswers(r.answers);
        return [
          i + 1,
          r.userName || '匿名用户',
          r.department || '',
          r.position || '',
          r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '-',
          ...questions.map(q => {
            const a = answers.find(x => String(x.questionId) === String(q.id));
            if (!a) return '';
            return Array.isArray(a.value) ? a.value.join('; ') : String(a.value || '');
          })
        ];
      });
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      // 设置列宽
      ws['!cols'] = [
        { wch: 6 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
        ...questions.map(() => ({ wch: 25 }))
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '调研数据');
      XLSX.writeFile(wb, (survey.title || '调研数据') + '_' + new Date().toLocaleDateString('zh-CN') + '.xlsx');
      toast('Excel 已导出');
    }


    function viewResponseDetail(responseIdx) {
      const data = window._surveyExportData;
      if (!data) return;
      const { questions, responses } = data;
      const r = responses[responseIdx];
      if (!r) return;
      const answers = normalizeSurveyAnswers(r.answers);

      const detailModal = document.createElement('div');
      detailModal.className = 'survey-modal-overlay fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-start justify-center pt-8 pb-8';
      detailModal.onclick = function(e) { if (e.target === this) this.remove(); };

      const answerHtml = questions.map((q, qi) => {
        const a = answers.find(x => String(x.questionId) === String(q.id));
        let val = '未回答';
        if (a) {
          if (q.type === 'rating') {
            const labels = {1:'很不满意',2:'不满意',3:'一般',4:'满意',5:'很满意'};
            val = a.value + '星 ' + (labels[a.value] || '');
          } else {
            val = Array.isArray(a.value) ? a.value.join(', ') : (a.value || '未回答');
          }
        }
        return '<div class="py-3 border-b border-slate-100 last:border-0">' +
          '<p class="text-xs text-slate-400 mb-1">' + (qi+1) + '. ' + escHtml(q.title || '') + '</p>' +
          '<p class="text-sm text-slate-800 font-medium">' + escHtml(val) + '</p>' +
        '</div>';
      }).join('');

      detailModal.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-lg max-h-[calc(100vh-4rem)] flex flex-col shadow-2xl" onclick="event.stopPropagation()">
          <div class="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div>
              <h3 class="text-lg font-bold text-white">填写详情</h3>
              <p class="text-white/60 text-sm">${escHtml(r.userName || '匿名用户')}${r.department ? ' · ' + escHtml(r.department) : ''} · ${r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '-'}</p>
            </div>
            <button onclick="this.closest('.survey-modal-overlay').remove()" class="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition"><i class="fas fa-times"></i></button>
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-4">
            ${answerHtml}
          </div>
          <div class="px-6 pb-4 pt-3 border-t border-slate-100">
            <button onclick="this.closest('.survey-modal-overlay').remove()" class="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition text-sm">关闭</button>
          </div>
        </div>
      `;
      document.body.appendChild(detailModal);
    }

    // ========== 工具函数 ==========
    function escHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // ========== 讲师报名管理 ==========
    
    // 加载讲师报名列表
    async function loadLecturerApplications() {
      try {
        const res = await fetch('/api/lecturer-applications');
        if (!res.ok) throw new Error('加载失败');
        const result = await res.json();
        const applications = result.data || [];
        
        const tbody = document.getElementById('lecturer-apply-list');
        if (!tbody) return;
        
        if (applications.length === 0) {
          tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-inbox text-4xl mb-3 block"></i><p>暂无讲师报名申请</p></td></tr>';
          return;
        }
        
        const experienceMap = {
          'none': '暂无',
          '1-2': '1-2次',
          '3-4': '3-4次',
          '5+': '5次及以上'
        };
        
        const statusMap = {
          'pending': '<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">待审核</span>',
          'approved': '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">已通过</span>',
          'rejected': '<span class="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">已拒绝</span>'
        };
        
        tbody.innerHTML = applications.map(app => {
          const checked = applicationSelectedIds.has(String(app.id)) ? 'checked' : '';
          return `
          <tr class="hover:bg-slate-50 transition">
            <td class="pl-5 pr-2 py-3 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" class="application-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleApplicationSelect('${app.id}')" ${checked}>
            </td>
            <td class="px-4 py-3 text-sm text-slate-800">${escHtml(app.name)}</td>
            <td class="px-4 py-3 text-sm text-slate-600">${escHtml(app.department)}</td>
            <td class="px-4 py-3 text-sm text-slate-600">
              <div class="flex flex-wrap gap-1 max-w-[150px]">
                ${(app.skills || []).map(s => `<span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs">${escHtml(s)}</span>`).join('') || '<span class="text-slate-400 text-xs">无</span>'}
              </div>
            </td>
            <td class="px-4 py-3 text-sm text-slate-600">${experienceMap[app.experience] || app.experience || '-'}</td>
            <td class="px-4 py-3 text-sm text-slate-600 max-w-[150px] truncate" title="${escHtml(app.intro)}">${escHtml(app.intro) || '-'}</td>
            <td class="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate" title="${escHtml(app.reason)}">${escHtml(app.reason) || '-'}</td>
            <td class="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">${app.createdAt ? new Date(app.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
            <td class="px-4 py-3">${statusMap[app.status] || app.status}</td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-center gap-2">
                ${app.status === 'pending' ? `
                  <button onclick="approveApplication(${app.id}, 'approved')" class="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg text-xs font-medium transition">
                    <i class="fas fa-check mr-1"></i>通过
                  </button>
                  <button onclick="approveApplication(${app.id}, 'rejected')" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition">
                    <i class="fas fa-times mr-1"></i>拒绝
                  </button>
                ` : ''}
                <button onclick="deleteApplication(${app.id})" class="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg text-xs font-medium transition">
                  <i class="fas fa-trash mr-1"></i>删除
                </button>
              </div>
            </td>
          </tr>`;
        }).join('');
      } catch (e) {
        console.error('加载讲师报名列表失败:', e);
        toast('加载失败: ' + e.message, 'error');
      }
    }
    
    // 审批申请
    async function approveApplication(id, status) {
      const actionText = status === 'approved' ? '通过' : '拒绝';
      if (!confirm(`确定要${actionText}该申请吗？`)) return;
      
      try {
        const res = await fetch(`/api/lecturer-applications/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        
        if (!res.ok) throw new Error('操作失败');
        
        toast(`申请已${actionText}`);
        loadLecturerApplications();
      } catch (e) {
        toast('操作失败: ' + e.message, 'error');
      }
    }
    
    // 删除申请
    async function deleteApplication(id) {
      if (!confirm('确定要删除该申请吗？此操作不可恢复。')) return;
      
      try {
        const res = await fetch(`/api/lecturer-applications/${id}`, {
          method: 'DELETE'
        });
        
        if (!res.ok) throw new Error('删除失败');
        
        toast('申请已删除');
        loadLecturerApplications();
      } catch (e) {
        toast('删除失败: ' + e.message, 'error');
      }
    }
    
    // 查看申请详情
    async function viewApplicationDetail(id) {
      try {
        const res = await fetch('/api/lecturer-applications');
        if (!res.ok) throw new Error('加载失败');
        const result = await res.json();
        const app = (result.data || []).find(a => a.id === id);
        
        if (!app) {
          toast('申请不存在', 'error');
          return;
        }
        
        const experienceMap = {
          'none': '暂无',
          '1-2': '1-2次',
          '3-4': '3-4次',
          '5+': '5次及以上'
        };
        
        const statusMap = {
          'pending': '待审核',
          'approved': '已通过',
          'rejected': '已拒绝'
        };
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center';
        modal.onclick = function(e) { if (e.target === this) this.remove(); };
        
        modal.innerHTML = `
          <div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl m-4" onclick="event.stopPropagation()">
            <div class="bg-gradient-primary px-6 py-4 flex-shrink-0">
              <h2 class="text-xl font-bold text-white"><i class="fa fa-file-alt mr-2"></i>申请详情</h2>
            </div>
            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">姓名</label>
                  <p class="text-sm font-medium text-slate-800">${escHtml(app.name)}</p>
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">部门</label>
                  <p class="text-sm font-medium text-slate-800">${escHtml(app.department)}</p>
                </div>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">擅长领域</label>
                <div class="flex flex-wrap gap-2">
                  ${(app.skills || []).map(s => `<span class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-xs">${escHtml(s)}</span>`).join('') || '<span class="text-slate-400 text-sm">无</span>'}
                </div>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">授课经验</label>
                <p class="text-sm font-medium text-slate-800">${experienceMap[app.experience] || app.experience || '未填写'}</p>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">个人简介</label>
                <p class="text-sm text-slate-700 whitespace-pre-wrap">${escHtml(app.intro) || '未填写'}</p>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">申请原因</label>
                <p class="text-sm text-slate-700 whitespace-pre-wrap">${escHtml(app.reason) || '未填写'}</p>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">申请状态</label>
                <p class="text-sm font-medium">${statusMap[app.status] || app.status}</p>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">申请时间</label>
                <p class="text-sm text-slate-700">${new Date(app.createdAt).toLocaleString('zh-CN')}</p>
              </div>
            </div>
            <div class="px-6 pb-5 pt-2 border-t flex gap-3">
              <button onclick="this.closest('.fixed').remove()" class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition">关闭</button>
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
      } catch (e) {
        toast('加载详情失败: ' + e.message, 'error');
      }
    }
    
    // 监听运营管理标签页切换，加载讲师报名数据
    const originalSwitchSubTab = window.switchSubTab;
    if (originalSwitchSubTab) {
      window.switchSubTab = function(parent, child) {
        originalSwitchSubTab(parent, child);
        if (parent === 'portal' && child === 'lecturer-apply') {
          loadLecturerApplications();
        }
        if (parent === 'portal' && child === 'training-requests') {
          loadTrainingRequests();
        }
      };
    }

    // ========== 培训需求管理功能 ==========

    // 加载培训需求列表
    async function loadTrainingRequests() {
      try {
        let requests = [];
        
        // 尝试从服务器获取
        try {
          const res = await fetch('/api/training-requests');
          if (res.ok) {
            const result = await res.json();
            requests = result.data || [];
          }
        } catch (e) {
          console.log('从服务器获取失败，使用本地数据:', e.message);
        }
        
        // 如果服务器没有数据，从 localStorage 获取
        if (requests.length === 0) {
          requests = safeParse('training_requests', []);
        }
        
        // 按状态筛选
        const statusFilter = document.getElementById('training-request-status-filter')?.value || 'all';
        if (statusFilter !== 'all') {
          requests = requests.filter(r => r.status === statusFilter);
        }
        
        // 按时间倒序排列
        requests.sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime));

        // 渲染列表
        renderTrainingRequestList(requests);
        
      } catch (e) {
        console.error('加载培训需求失败:', e);
        toast('加载培训需求失败: ' + e.message, 'error');
      }
    }

    // 更新培训需求统计
    function updateTrainingRequestStats() {
      let requests = safeParse('training_requests', []);
      
      // 尝试合并服务器数据
      try {
        const serverData = localStorage.getItem('training_requests_server');
        if (serverData) {
          const serverRequests = JSON.parse(serverData);
          requests = [...requests, ...serverRequests];
        }
      } catch (e) { console.warn('读取培训请求数据失败:', e); }

      const stats = {
        total: requests.length,
        pending: requests.filter(r => r.status === 'pending').length,
        approved: requests.filter(r => r.status === 'approved').length,
        rejected: requests.filter(r => r.status === 'rejected').length,
        completed: requests.filter(r => r.status === 'completed').length
      };

      // 更新徽章（统计卡片已于 2026-07-09 移除，仅保留侧边栏待处理数量徽章）
      const badge = document.getElementById('training-request-badge');
      if (badge) {
        if (stats.pending > 0) {
          badge.textContent = stats.pending;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    }

    // 渲染培训需求列表
    function renderTrainingRequestList(requests) {
      const tbody = document.getElementById('training-request-list');
      if (!tbody) return;
      
      if (requests.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="px-6 py-12 text-center text-slate-400">
              <i class="fas fa-inbox text-4xl mb-3 block"></i>
              <p>暂无培训需求</p>
            </td>
          </tr>
        `;
        return;
      }
      
      const statusMap = {
        'pending': '<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">待处理</span>',
        'approved': '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">已批准</span>',
        'rejected': '<span class="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">已拒绝</span>',
        'completed': '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">已完成</span>'
      };
      
      tbody.innerHTML = requests.map(req => {
        const checked = trainingReqSelectedIds.has(String(req.id)) ? 'checked' : '';
        return `
        <tr class="hover:bg-slate-50 transition">
          <td class="pl-5 pr-2 py-3 text-center" onclick="event.stopPropagation()">
            <input type="checkbox" class="trainingReq-row-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="toggleTrainingReqSelect('${req.id}')" ${checked}>
          </td>
          <td class="px-4 py-3 text-sm font-medium text-slate-800">${escHtml(req.submitterName)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${escHtml(req.department)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">
            <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs">${escHtml(req.trainingType)}</span>
          </td>
          <td class="px-4 py-3 text-sm text-slate-800 font-medium max-w-[150px] truncate" title="${escHtml(req.topic)}">${escHtml(req.topic)}</td>
          <td class="px-4 py-3 text-sm text-slate-600 max-w-[100px] truncate" title="${escHtml(req.targetAudience || '')}">${escHtml(req.targetAudience) || '-'}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${escHtml(req.expectedTime) || '-'}</td>
          <td class="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">${req.submitTime ? new Date(req.submitTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
          <td class="px-4 py-3">${statusMap[req.status] || req.status}</td>
          <td class="px-4 py-3">
            <div class="flex items-center justify-center gap-2">
              <button onclick="viewTrainingRequestDetail('${req.id}')" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition">
                <i class="fas fa-eye mr-1"></i>查看
              </button>
              ${req.status === 'pending' ? `
                <button onclick="updateTrainingRequestStatus('${req.id}', 'approved')" class="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg text-xs font-medium transition">
                  <i class="fas fa-check mr-1"></i>批准
                </button>
                <button onclick="updateTrainingRequestStatus('${req.id}', 'rejected')" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition">
                  <i class="fas fa-times mr-1"></i>拒绝
                </button>
              ` : ''}
              <button onclick="deleteTrainingRequest('${req.id}')" class="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg text-xs font-medium transition">
                <i class="fas fa-trash mr-1"></i>删除
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // 查看培训需求详情
    async function viewTrainingRequestDetail(id) {
      try {
        // 从 localStorage 获取
        let requests = safeParse('training_requests', []);
        let req = requests.find(r => r.id === id);
        
        if (!req) {
          toast('需求记录不存在', 'error');
          return;
        }
        
        const statusMap = {
          'pending': '待处理',
          'approved': '已批准',
          'rejected': '已拒绝',
          'completed': '已完成'
        };
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center';
        modal.onclick = function(e) { if (e.target === this) this.remove(); };
        
        modal.innerHTML = `
          <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl m-4" onclick="event.stopPropagation()">
            <div class="bg-gradient-primary px-6 py-4 flex-shrink-0">
              <h2 class="text-xl font-bold text-white"><i class="fa fa-clipboard-list mr-2"></i>培训需求详情</h2>
            </div>
            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">提交人</label>
                  <p class="text-sm font-medium text-slate-800">${escHtml(req.submitterName)}</p>
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">部门</label>
                  <p class="text-sm font-medium text-slate-800">${escHtml(req.department)}</p>
                </div>
              </div>
              <div class="border-t border-slate-100 pt-4">
                <label class="block text-xs text-slate-500 mb-1">培训类型</label>
                <p class="text-sm font-medium text-slate-800">${escHtml(req.trainingType)}</p>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">培训主题</label>
                <p class="text-sm font-medium text-slate-800">${escHtml(req.topic)}</p>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">培训对象</label>
                <p class="text-sm text-slate-700">${escHtml(req.targetAudience) || '未填写'}</p>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">期望时间</label>
                <p class="text-sm text-slate-700">${escHtml(req.expectedTime) || '未填写'}</p>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">需求描述</label>
                <p class="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">${escHtml(req.description) || '未填写'}</p>
              </div>
              <div class="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">当前状态</label>
                  <p class="text-sm font-medium">${statusMap[req.status] || req.status}</p>
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">提交时间</label>
                  <p class="text-sm text-slate-700">${new Date(req.submitTime).toLocaleString('zh-CN')}</p>
                </div>
              </div>
            </div>
            <div class="px-6 pb-5 pt-2 border-t flex gap-3">
              ${req.status === 'pending' ? `
                <button onclick="updateTrainingRequestStatus('${req.id}', 'approved'); this.closest('.fixed').remove();" class="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition">
                  <i class="fas fa-check mr-2"></i>批准
                </button>
                <button onclick="updateTrainingRequestStatus('${req.id}', 'rejected'); this.closest('.fixed').remove();" class="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition">
                  <i class="fas fa-times mr-2"></i>拒绝
                </button>
              ` : ''}
              <button onclick="this.closest('.fixed').remove()" class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition">关闭</button>
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
      } catch (e) {
        toast('加载详情失败: ' + e.message, 'error');
      }
    }

    // 更新培训需求状态
    async function updateTrainingRequestStatus(id, status) {
      const actionText = status === 'approved' ? '批准' : (status === 'rejected' ? '拒绝' : '完成');
      if (!confirm(`确定要${actionText}该培训需求吗？`)) return;
      
      try {
        // 尝试发送到服务器
        try {
          const res = await fetch(`/api/training-requests/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, updateTime: new Date().toISOString() })
          });
          if (res.ok) {
            toast(`需求已${actionText}`);
            loadTrainingRequests();
            return;
          }
        } catch (e) {
          console.log('服务器更新失败，使用本地存储:', e.message);
        }
        
        // 本地更新
        let requests = safeParse('training_requests', []);
        const index = requests.findIndex(r => r.id === id);
        if (index !== -1) {
          requests[index].status = status;
          requests[index].updateTime = new Date().toISOString();
          localStorage.setItem('training_requests', JSON.stringify(requests));
          toast(`需求已${actionText}（本地保存）`);
          loadTrainingRequests();
        }
      } catch (e) {
        toast('操作失败: ' + e.message, 'error');
      }
    }

    // 删除培训需求
    async function deleteTrainingRequest(id) {
      if (!confirm('确定要删除该培训需求吗？此操作不可恢复。')) return;
      
      try {
        // 尝试发送到服务器
        try {
          const res = await fetch(`/api/training-requests/${id}`, { method: 'DELETE' });
          if (res.ok) {
            toast('需求已删除');
            loadTrainingRequests();
            return;
          }
        } catch (e) {
          console.log('服务器删除失败，使用本地存储:', e.message);
        }
        
        // 本地删除
        let requests = safeParse('training_requests', []);
        requests = requests.filter(r => r.id !== id);
        localStorage.setItem('training_requests', JSON.stringify(requests));
        toast('需求已删除（本地保存）');
        loadTrainingRequests();
      } catch (e) {
        toast('删除失败: ' + e.message, 'error');
      }
    }

    // 导出培训需求
    function exportTrainingRequests() {
      try {
        let requests = safeParse('training_requests', []);
	        
	        if (requests.length === 0) {
	          toast('没有可导出的数据', 'error');
          return;
        }
        
        const statusMap = {
          'pending': '待处理',
          'approved': '已批准',
          'rejected': '已拒绝',
          'completed': '已完成'
        };
        
        // CSV 表头
        const headers = ['提交人', '部门', '岗位', '邮箱', '培训类型', '培训主题', '培训对象', '期望时间', '需求描述', '状态', '提交时间'];
        
        // CSV 内容
        const rows = requests.map(req => [
          req.submitterName,
          req.department,
          req.position,
          req.email,
          req.trainingType,
          req.topic,
          req.targetAudience || '',
          req.expectedTime || '',
          (req.description || '').replace(/\n/g, ' '),
          statusMap[req.status] || req.status,
          new Date(req.submitTime).toLocaleString('zh-CN')
        ]);
        
        // 构建 CSV
        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
        
        // 下载
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `培训需求_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        toast('导出成功');
      } catch (e) {
        toast('导出失败: ' + e.message, 'error');
      }
    }

    // 页面加载时更新徽章
    document.addEventListener('DOMContentLoaded', () => {
      updateTrainingRequestStats();
    });
  