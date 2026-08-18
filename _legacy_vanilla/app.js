/**
 * METAPOST STUDIO v2.0 - JAVASCRIPT CORE ENGINE
 * Official Facebook Graph API integration for cross-page publishing
 * Features: Permanent Tokens, Post Scheduling, Templates, Smart Anti-Spam, Auto-Compress, Retry
 */

(function () {
  'use strict';

  // ==========================================================
  // CONFIG & CONSTANTS
  // ==========================================================
  const GRAPH_API_VERSION = 'v19.0';
  const API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
  const DEFAULT_TIMEOUT_MS = 45000;

  // ==========================================================
  // APP STATE
  // ==========================================================
  const state = {
    token: '',
    tokenType: 'unknown', // 'temporary' | 'long_lived' | 'permanent'
    appId: localStorage.getItem('metapost_app_id') || '',
    appSecret: localStorage.getItem('metapost_app_secret') || '',
    pages: [],
    selectedPages: new Set(),
    postType: 'photo', // 'photo' | 'text' | 'video'
    photos: [], // Array of { file: File, previewUrl: string, originalSize: number, compressedBlob: Blob }
    video: null, // { file: File, previewUrl: string }
    postText: '',
    postLink: '',
    isScheduled: false,
    scheduleTimestamp: null,
    delayMs: 3000,
    isPublishing: false,
    cancelRequested: false,
    failedPages: [],
    theme: localStorage.getItem('metapost_theme') || 'light',
    history: JSON.parse(localStorage.getItem('metapost_history') || '[]'),
    templates: JSON.parse(localStorage.getItem('metapost_templates') || '[]')
  };

  // ==========================================================
  // DOM ELEMENT REFERENCES
  // ==========================================================
  const dom = {
    // Header & Global
    btnThemeToggle: document.getElementById('btnThemeToggle'),
    btnOpenPermTokenModal: document.getElementById('btnOpenPermTokenModal'),
    btnOpenGuide: document.getElementById('btnOpenGuide'),
    btnViewHistory: document.getElementById('btnViewHistory'),
    historyCount: document.getElementById('historyCount'),
    toastContainer: document.getElementById('toastContainer'),

    // Step 1: Token
    fbTokenInput: document.getElementById('fbTokenInput'),
    btnToggleTokenVisibility: document.getElementById('btnToggleTokenVisibility'),
    chkSaveToken: document.getElementById('chkSaveToken'),
    btnClearToken: document.getElementById('btnClearToken'),
    btnFetchPages: document.getElementById('btnFetchPages'),
    tokenStatusBadge: document.getElementById('tokenStatusBadge'),
    tokenTypeBanner: document.getElementById('tokenTypeBanner'),
    tokenTypeTitle: document.getElementById('tokenTypeTitle'),
    tokenTypeDesc: document.getElementById('tokenTypeDesc'),

    // Step 2: Pages
    pageSearchInput: document.getElementById('pageSearchInput'),
    btnSelectAllPages: document.getElementById('btnSelectAllPages'),
    btnDeselectAllPages: document.getElementById('btnDeselectAllPages'),
    pagesListContainer: document.getElementById('pagesListContainer'),
    pagesEmptyState: document.getElementById('pagesEmptyState'),
    selectedPagesCount: document.getElementById('selectedPagesCount'),

    // Step 3: Composer
    tabButtons: document.querySelectorAll('.post-type-tabs .tab-btn'),
    templateSelect: document.getElementById('templateSelect'),
    btnSaveTemplate: document.getElementById('btnSaveTemplate'),
    btnManageTemplates: document.getElementById('btnManageTemplates'),
    postContent: document.getElementById('postContent'),
    charCount: document.getElementById('charCount'),
    chipEmojis: document.querySelectorAll('.chip-emoji'),
    delaySelect: document.getElementById('delaySelect'),
    chkSmartAntiSpam: document.getElementById('chkSmartAntiSpam'),

    // Schedule Controls
    btnPublishNow: document.getElementById('btnPublishNow'),
    btnSchedule: document.getElementById('btnSchedule'),
    scheduleDatetimeBox: document.getElementById('scheduleDatetimeBox'),
    scheduleTimeInput: document.getElementById('scheduleTimeInput'),

    // Media Sections
    mediaPhotoSection: document.getElementById('mediaPhotoSection'),
    mediaLinkSection: document.getElementById('mediaLinkSection'),
    mediaVideoSection: document.getElementById('mediaVideoSection'),
    photoDropzone: document.getElementById('photoDropzone'),
    photoFileInput: document.getElementById('photoFileInput'),
    photoPreviewGrid: document.getElementById('photoPreviewGrid'),
    postLinkInput: document.getElementById('postLinkInput'),
    videoDropzone: document.getElementById('videoDropzone'),
    videoFileInput: document.getElementById('videoFileInput'),
    videoPreviewContainer: document.getElementById('videoPreviewContainer'),
    videoPreviewElement: document.getElementById('videoPreviewElement'),
    btnRemoveVideo: document.getElementById('btnRemoveVideo'),

    // Publish Actions
    btnStartPublish: document.getElementById('btnStartPublish'),
    publishButtonText: document.getElementById('publishButtonText'),

    // Live Mockup
    mockAvatar: document.getElementById('mockAvatar'),
    mockPageName: document.getElementById('mockPageName'),
    mockPublishTimeText: document.getElementById('mockPublishTimeText'),
    mockContent: document.getElementById('mockContent'),
    mockMediaContainer: document.getElementById('mockMediaContainer'),

    // Publish Progress Modal
    publishModal: document.getElementById('publishModal'),
    publishProgressBar: document.getElementById('publishProgressBar'),
    progressBarAria: document.getElementById('progressBarAria'),
    publishProgressStatus: document.getElementById('publishProgressStatus'),
    publishProgressPercent: document.getElementById('publishProgressPercent'),
    publishResultsList: document.getElementById('publishResultsList'),
    btnCancelPublish: document.getElementById('btnCancelPublish'),
    btnRetryFailed: document.getElementById('btnRetryFailed'),
    btnDonePublish: document.getElementById('btnDonePublish'),
    btnClosePublishModal: document.getElementById('btnClosePublishModal'),

    // Permanent Token Modal
    permTokenModal: document.getElementById('permTokenModal'),
    appIdInput: document.getElementById('appIdInput'),
    appSecretInput: document.getElementById('appSecretInput'),
    shortTokenInput: document.getElementById('shortTokenInput'),
    btnToggleSecretVisibility: document.getElementById('btnToggleSecretVisibility'),
    btnExecutePermanentToken: document.getElementById('btnExecutePermanentToken'),
    btnCancelPermToken: document.getElementById('btnCancelPermToken'),
    btnClosePermTokenModal: document.getElementById('btnClosePermTokenModal'),

    // Guide Modal
    guideModal: document.getElementById('guideModal'),
    btnCloseGuideModal: document.getElementById('btnCloseGuideModal'),
    btnCloseGuideModalBtn: document.getElementById('btnCloseGuideModalBtn'),

    // Templates Modal
    templatesModal: document.getElementById('templatesModal'),
    templatesListContainer: document.getElementById('templatesListContainer'),
    btnCloseTemplatesModal: document.getElementById('btnCloseTemplatesModal'),
    btnCloseTemplatesModalBtn: document.getElementById('btnCloseTemplatesModalBtn'),

    // History Modal
    historyModal: document.getElementById('historyModal'),
    btnCloseHistoryModal: document.getElementById('btnCloseHistoryModal'),
    btnCloseHistoryModalBtn: document.getElementById('btnCloseHistoryModalBtn'),
    historyListContainer: document.getElementById('historyListContainer'),
    btnClearAllHistory: document.getElementById('btnClearAllHistory')
  };

  // ==========================================================
  // INITIALIZATION
  // ==========================================================
  function initApp() {
    applyTheme(state.theme);
    updateHistoryBadge();
    renderTemplatesDropdown();

    // Set default schedule time to +1 hour from now
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
    const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dom.scheduleTimeInput.value = isoLocal;

    // Check saved token
    const savedToken = localStorage.getItem('metapost_fb_token');
    const isPerm = localStorage.getItem('metapost_is_permanent') === 'true';

    if (savedToken) {
      dom.fbTokenInput.value = savedToken;
      state.token = savedToken;
      state.tokenType = isPerm ? 'permanent' : 'temporary';
      dom.btnClearToken.style.display = 'inline-block';
      updateTokenTypeBanner();
      fetchUserPages(false);
    }

    bindEvents();
    renderLiveMockup();
  }

  // ==========================================================
  // EVENT BINDINGS
  // ==========================================================
  function bindEvents() {
    // Theme toggle
    dom.btnThemeToggle.addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(state.theme);
      localStorage.setItem('metapost_theme', state.theme);
    });

    // Token Visibility
    dom.btnToggleTokenVisibility.addEventListener('click', () => {
      const isPass = dom.fbTokenInput.type === 'password';
      dom.fbTokenInput.type = isPass ? 'text' : 'password';
      dom.btnToggleTokenVisibility.innerHTML = isPass
        ? '<i class="fa-regular fa-eye-slash"></i>'
        : '<i class="fa-regular fa-eye"></i>';
    });

    // Clear Token
    dom.btnClearToken.addEventListener('click', () => {
      localStorage.removeItem('metapost_fb_token');
      localStorage.removeItem('metapost_is_permanent');
      dom.fbTokenInput.value = '';
      state.token = '';
      state.tokenType = 'unknown';
      state.pages = [];
      state.selectedPages.clear();
      dom.btnClearToken.style.display = 'none';
      dom.tokenTypeBanner.style.display = 'none';
      renderPagesList();
      updateTokenStatus(false);
      showToast('Đã xóa Token đã lưu.', 'info');
    });

    // Fetch Pages Button
    dom.btnFetchPages.addEventListener('click', () => {
      fetchUserPages(true);
    });

    // Search Pages
    dom.pageSearchInput.addEventListener('input', debounce((e) => {
      renderPagesList(e.target.value.trim().toLowerCase());
    }, 150));

    // Select/Deselect All Pages
    dom.btnSelectAllPages.addEventListener('click', () => {
      state.pages.forEach(p => state.selectedPages.add(p.id));
      renderPagesList(dom.pageSearchInput.value.trim().toLowerCase());
      updatePublishButton();
      renderLiveMockup();
    });

    dom.btnDeselectAllPages.addEventListener('click', () => {
      state.selectedPages.clear();
      renderPagesList(dom.pageSearchInput.value.trim().toLowerCase());
      updatePublishButton();
      renderLiveMockup();
    });

    // Post Type Tab Switcher
    dom.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        dom.tabButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        state.postType = btn.getAttribute('data-type');
        switchPostTypeView(state.postType);
        renderLiveMockup();
      });
    });

    // Text Content Typing
    dom.postContent.addEventListener('input', (e) => {
      state.postText = e.target.value;
      dom.charCount.textContent = state.postText.length;
      renderLiveMockupDebounced();
      updatePublishButton();
    });

    // Quick Emoji Click
    dom.chipEmojis.forEach(chip => {
      chip.addEventListener('click', () => {
        const emoji = chip.getAttribute('data-insert');
        insertAtCursor(dom.postContent, emoji);
        state.postText = dom.postContent.value;
        dom.charCount.textContent = state.postText.length;
        renderLiveMockup();
        updatePublishButton();
      });
    });

    // Post Link Input
    dom.postLinkInput.addEventListener('input', (e) => {
      state.postLink = e.target.value.trim();
      renderLiveMockupDebounced();
      updatePublishButton();
    });

    // Schedule Mode Toggles
    dom.btnPublishNow.addEventListener('click', () => {
      dom.btnPublishNow.classList.add('active');
      dom.btnSchedule.classList.remove('active');
      dom.scheduleDatetimeBox.style.display = 'none';
      state.isScheduled = false;
      state.scheduleTimestamp = null;
      dom.mockPublishTimeText.textContent = 'Vừa xong';
      updatePublishButton();
    });

    dom.btnSchedule.addEventListener('click', () => {
      dom.btnSchedule.classList.add('active');
      dom.btnPublishNow.classList.remove('active');
      dom.scheduleDatetimeBox.style.display = 'flex';
      state.isScheduled = true;
      updateScheduleTime();
      updatePublishButton();
    });

    dom.scheduleTimeInput.addEventListener('change', updateScheduleTime);

    // Delay Selection
    dom.delaySelect.addEventListener('change', (e) => {
      state.delayMs = parseInt(e.target.value, 10);
    });

    // Photo Dropzone & File Input
    dom.photoDropzone.addEventListener('click', () => dom.photoFileInput.click());
    dom.photoDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dom.photoFileInput.click();
      }
    });
    dom.photoFileInput.addEventListener('change', (e) => handlePhotoFiles(e.target.files));
    setupDragDrop(dom.photoDropzone, handlePhotoFiles);

    // Video Dropzone & File Input
    dom.videoDropzone.addEventListener('click', () => dom.videoFileInput.click());
    dom.videoDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dom.videoFileInput.click();
      }
    });
    dom.videoFileInput.addEventListener('change', (e) => handleVideoFile(e.target.files[0]));
    dom.btnRemoveVideo.addEventListener('click', removeVideo);
    setupDragDrop(dom.videoDropzone, (files) => handleVideoFile(files[0]));

    // Templates Events
    dom.templateSelect.addEventListener('change', loadSelectedTemplate);
    dom.btnSaveTemplate.addEventListener('click', saveCurrentAsTemplate);
    dom.btnManageTemplates.addEventListener('click', openTemplatesModal);
    dom.btnCloseTemplatesModal.addEventListener('click', () => closeModal(dom.templatesModal));
    dom.btnCloseTemplatesModalBtn.addEventListener('click', () => closeModal(dom.templatesModal));

    // Permanent Token Modal Events
    dom.btnOpenPermTokenModal.addEventListener('click', openPermTokenModal);
    dom.btnClosePermTokenModal.addEventListener('click', () => closeModal(dom.permTokenModal));
    dom.btnCancelPermToken.addEventListener('click', () => closeModal(dom.permTokenModal));
    dom.btnExecutePermanentToken.addEventListener('click', executePermanentTokenUpgrade);
    dom.btnToggleSecretVisibility.addEventListener('click', () => {
      const isPass = dom.appSecretInput.type === 'password';
      dom.appSecretInput.type = isPass ? 'text' : 'password';
      dom.btnToggleSecretVisibility.innerHTML = isPass
        ? '<i class="fa-regular fa-eye-slash"></i>'
        : '<i class="fa-regular fa-eye"></i>';
    });

    // Start Publish Button
    dom.btnStartPublish.addEventListener('click', startPublishingFlow);
    dom.btnCancelPublish.addEventListener('click', requestCancelPublish);
    dom.btnRetryFailed.addEventListener('click', retryFailedPages);

    // Modals
    dom.btnOpenGuide.addEventListener('click', () => openModal(dom.guideModal));
    dom.btnCloseGuideModal.addEventListener('click', () => closeModal(dom.guideModal));
    dom.btnCloseGuideModalBtn.addEventListener('click', () => closeModal(dom.guideModal));

    dom.btnViewHistory.addEventListener('click', openHistoryModal);
    dom.btnCloseHistoryModal.addEventListener('click', () => closeModal(dom.historyModal));
    dom.btnCloseHistoryModalBtn.addEventListener('click', () => closeModal(dom.historyModal));
    dom.btnClearAllHistory.addEventListener('click', clearHistory);

    dom.btnDonePublish.addEventListener('click', () => closeModal(dom.publishModal));
    dom.btnClosePublishModal.addEventListener('click', () => closeModal(dom.publishModal));

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        [dom.guideModal, dom.historyModal, dom.templatesModal, dom.permTokenModal].forEach(m => {
          if (m.style.display === 'flex') closeModal(m);
        });
      }
    });
  }

  // ==========================================================
  // SAFE FETCH WRAPPER WITH TIMEOUT & ERROR NORMALIZATION
  // ==========================================================
  async function safeFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      let json;
      try {
        json = await response.json();
      } catch (parseErr) {
        throw new Error(`Máy chủ Facebook trả về phản hồi không hợp lệ (${response.status}: ${response.statusText})`);
      }

      if (!response.ok) {
        const fbMessage = json?.error?.message || `Lỗi HTTP ${response.status}: ${response.statusText}`;
        const err = new Error(fbMessage);
        err.code = json?.error?.code;
        err.errorSubcode = json?.error?.error_subcode;
        throw err;
      }

      if (json?.error) {
        const err = new Error(json.error.message);
        err.code = json.error.code;
        throw err;
      }

      return json;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Quá thời gian kết nối (${timeoutMs / 1000}s). Vui lòng kiểm tra mạng.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==========================================================
  // THEME MANAGEMENT
  // ==========================================================
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      dom.btnThemeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      dom.btnThemeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
  }

  // ==========================================================
  // PERMANENT TOKEN EXCHANGE LOGIC
  // ==========================================================
  function openPermTokenModal() {
    dom.appIdInput.value = state.appId;
    dom.appSecretInput.value = state.appSecret;
    dom.shortTokenInput.value = dom.fbTokenInput.value.trim();
    openModal(dom.permTokenModal);
  }

  async function executePermanentTokenUpgrade() {
    const appId = dom.appIdInput.value.trim();
    const appSecret = dom.appSecretInput.value.trim();
    const shortToken = dom.shortTokenInput.value.trim();

    if (!appId || !appSecret || !shortToken) {
      showToast('Vui lòng nhập đầy đủ App ID, App Secret và Token ngắn hạn.', 'warning');
      return;
    }

    dom.btnExecutePermanentToken.disabled = true;
    dom.btnExecutePermanentToken.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nâng cấp Token...';

    try {
      // 1. Save App ID & Secret for next time
      state.appId = appId;
      state.appSecret = appSecret;
      localStorage.setItem('metapost_app_id', appId);
      localStorage.setItem('metapost_app_secret', appSecret);

      // 2. Exchange short-lived User Token for long-lived User Token (60 days)
      const exchangeUrl = `${API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
      const exchangeData = await safeFetch(exchangeUrl);

      const longLivedUserToken = exchangeData.access_token;
      if (!longLivedUserToken) {
        throw new Error('Không nhận được Long-lived Token từ Facebook.');
      }

      // 3. Query /me/accounts using the Long-lived User Token
      // Every Page Access Token returned from a Long-Lived User Token is PERMANENT (never expires)!
      const accountsUrl = `${API_BASE}/me/accounts?fields=id,name,picture.type(large),access_token,category,tasks&limit=150&access_token=${encodeURIComponent(longLivedUserToken)}`;
      const accountsData = await safeFetch(accountsUrl);

      if (!accountsData.data || accountsData.data.length === 0) {
        throw new Error('Không tìm thấy Fanpage nào để cấp quyền vĩnh viễn.');
      }

      // Update state with permanent tokens
      state.token = longLivedUserToken;
      state.tokenType = 'permanent';
      state.pages = accountsData.data;
      state.selectedPages = new Set(state.pages.map(p => p.id));

      dom.fbTokenInput.value = state.token;
      localStorage.setItem('metapost_fb_token', state.token);
      localStorage.setItem('metapost_is_permanent', 'true');
      dom.btnClearToken.style.display = 'inline-block';

      updateTokenStatus(true, state.pages.length);
      updateTokenTypeBanner();
      renderPagesList();
      updatePublishButton();
      renderLiveMockup();

      closeModal(dom.permTokenModal);
      showToast('🎉 Đã kích hoạt Token Vĩnh Viễn thành công! Token của bạn sẽ không bao giờ hết hạn.', 'success');
    } catch (err) {
      console.error('Permanent token error:', err);
      showToast(`Không thể tạo Token vĩnh viễn: ${err.message}`, 'error');
    } finally {
      dom.btnExecutePermanentToken.disabled = false;
      dom.btnExecutePermanentToken.innerHTML = '<i class="fa-solid fa-bolt"></i> Nâng Cấp Sang Token Vĩnh Viễn';
    }
  }

  function updateTokenTypeBanner() {
    dom.tokenTypeBanner.style.display = 'flex';
    if (state.tokenType === 'permanent') {
      dom.tokenTypeBanner.style.background = 'var(--accent-success-bg)';
      dom.tokenTypeBanner.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      dom.tokenTypeBanner.querySelector('.diag-icon').innerHTML = '<i class="fa-solid fa-infinity" style="color: var(--accent-success);"></i>';
      dom.tokenTypeTitle.textContent = 'Trạng thái: Token Vĩnh Viễn ♾️';
      dom.tokenTypeDesc.textContent = 'Mã truy cập các Fanpage không bao giờ hết hạn. Bạn có thể sử dụng bất cứ lúc nào.';
    } else {
      dom.tokenTypeBanner.style.background = 'var(--accent-purple-bg)';
      dom.tokenTypeBanner.style.borderColor = 'rgba(139, 92, 246, 0.25)';
      dom.tokenTypeBanner.querySelector('.diag-icon').innerHTML = '<i class="fa-solid fa-clock" style="color: var(--accent-purple);"></i>';
      dom.tokenTypeTitle.textContent = 'Loại Token: Tạm thời (~1 - 2 giờ)';
      dom.tokenTypeDesc.textContent = 'Bấm nút "Token Vĩnh Viễn" ở góc trên để nâng cấp dùng mãi mãi.';
    }
  }

  // ==========================================================
  // FACEBOOK GRAPH API - FETCH PAGES
  // ==========================================================
  async function fetchUserPages(showFeedback = true) {
    const rawToken = dom.fbTokenInput.value.trim();
    if (!rawToken) {
      if (showFeedback) showToast('Vui lòng dán Token Facebook trước!', 'error');
      return;
    }

    state.token = rawToken;
    dom.btnFetchPages.disabled = true;
    dom.btnFetchPages.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu...';

    try {
      const fields = 'id,name,picture.type(large),access_token,category,tasks';
      let apiUrl = `${API_BASE}/me/accounts?fields=${fields}&limit=100&access_token=${encodeURIComponent(state.token)}`;
      
      let allPages = [];
      let nextUrl = apiUrl;

      // Handle pagination up to 300 pages
      while (nextUrl && allPages.length < 300) {
        const data = await safeFetch(nextUrl);
        if (data.data) {
          allPages = allPages.concat(data.data);
        }
        nextUrl = data.paging?.next || null;
      }

      if (allPages.length === 0) {
        state.pages = [];
        updateTokenStatus(false);
        renderPagesList();
        showToast('Không tìm thấy Fanpage nào được quản lý bởi tài khoản này.', 'warning');
        return;
      }

      state.pages = allPages;
      state.selectedPages = new Set(state.pages.map(p => p.id));

      if (dom.chkSaveToken.checked) {
        localStorage.setItem('metapost_fb_token', state.token);
        dom.btnClearToken.style.display = 'inline-block';
      }

      updateTokenStatus(true, state.pages.length);
      updateTokenTypeBanner();
      renderPagesList();
      updatePublishButton();
      renderLiveMockup();

      if (showFeedback) {
        showToast(`Đã tải thành công ${state.pages.length} Fanpage!`, 'success');
      }
    } catch (err) {
      console.error('Fetch pages error:', err);
      updateTokenStatus(false);
      if (showFeedback) {
        let msg = err.message;
        if (err.code === 190) {
          msg = 'Token đã hết hạn hoặc không hợp lệ. Vui lòng tạo mã mới.';
        }
        showToast(`Không thể tải Page: ${msg}`, 'error');
      }
    } finally {
      dom.btnFetchPages.disabled = false;
      dom.btnFetchPages.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tải danh sách Fanpage';
    }
  }

  function updateTokenStatus(isConnected, count = 0) {
    if (isConnected) {
      dom.tokenStatusBadge.className = 'status-tag status-connected';
      dom.tokenStatusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã kết nối (${count} Page)`;
    } else {
      dom.tokenStatusBadge.className = 'status-tag status-idle';
      dom.tokenStatusBadge.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Chưa kết nối';
    }
  }

  // ==========================================================
  // RENDER FANPAGES LIST (WITH ESCAPED HTML)
  // ==========================================================
  function renderPagesList(filterQuery = '') {
    const container = dom.pagesListContainer;
    container.innerHTML = '';

    const filteredPages = state.pages.filter(page => {
      if (!filterQuery) return true;
      const name = (page.name || '').toLowerCase();
      const cat = (page.category || '').toLowerCase();
      return name.includes(filterQuery) || cat.includes(filterQuery);
    });

    if (state.pages.length === 0) {
      container.appendChild(dom.pagesEmptyState);
      dom.selectedPagesCount.textContent = 'Đã chọn: 0/0';
      return;
    }

    if (filteredPages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-search"></i>
          <p>Không tìm thấy Page khớp từ khóa</p>
        </div>`;
      return;
    }

    dom.selectedPagesCount.textContent = `Đã chọn: ${state.selectedPages.size}/${state.pages.length}`;

    filteredPages.forEach(page => {
      const isSelected = state.selectedPages.has(page.id);
      const avatarUrl = page.picture?.data?.url || '';
      const safeName = escapeHtml(page.name);
      const safeCategory = escapeHtml(page.category || 'Trang Facebook');
      const safeId = escapeHtml(page.id);

      const itemEl = document.createElement('div');
      itemEl.className = `page-item ${isSelected ? 'selected' : ''}`;
      itemEl.innerHTML = `
        <input type="checkbox" ${isSelected ? 'checked' : ''} data-id="${safeId}" aria-label="Chọn ${safeName}">
        <img class="page-avatar" src="${escapeHtml(avatarUrl)}" alt="${safeName}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'36\' height=\'36\' fill=\'%23cbd5e1\'><rect width=\'36\' height=\'36\' rx=\'18\'/></svg>'">
        <div class="page-info">
          <div class="page-name" title="${safeName}">${safeName}</div>
          <div class="page-category">${safeCategory} · ID: ${safeId}</div>
        </div>
      `;

      itemEl.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          const chk = itemEl.querySelector('input[type="checkbox"]');
          chk.checked = !chk.checked;
        }
        const isChecked = itemEl.querySelector('input[type="checkbox"]').checked;
        if (isChecked) {
          state.selectedPages.add(page.id);
          itemEl.classList.add('selected');
        } else {
          state.selectedPages.delete(page.id);
          itemEl.classList.remove('selected');
        }
        dom.selectedPagesCount.textContent = `Đã chọn: ${state.selectedPages.size}/${state.pages.length}`;
        updatePublishButton();
        renderLiveMockup();
      });

      container.appendChild(itemEl);
    });
  }

  // ==========================================================
  // COMPOSER & MEDIA HANDLERS (GIỮ NGUYÊN 100% ẢNH GỐC)
  // ==========================================================
  function switchPostTypeView(type) {
    dom.mediaPhotoSection.style.display = type === 'photo' ? 'block' : 'none';
    dom.mediaLinkSection.style.display = type === 'text' ? 'block' : 'none';
    dom.mediaVideoSection.style.display = type === 'video' ? 'block' : 'none';
  }

  function setupDragDrop(zoneElement, callback) {
    ['dragenter', 'dragover'].forEach(eventName => {
      zoneElement.addEventListener(eventName, (e) => {
        e.preventDefault();
        zoneElement.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      zoneElement.addEventListener(eventName, (e) => {
        e.preventDefault();
        zoneElement.classList.remove('dragover');
      });
    });

    zoneElement.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        callback(e.dataTransfer.files);
      }
    });
  }

  function handlePhotoFiles(files) {
    const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (newFiles.length === 0) {
      showToast('Vui lòng chỉ chọn file hình ảnh (JPG, PNG, WEBP...)', 'warning');
      return;
    }

    if (state.photos.length + newFiles.length > 10) {
      showToast('Chỉ cho phép chọn tối đa 10 ảnh cho 1 bài viết.', 'warning');
    }

    const availableSlots = 10 - state.photos.length;
    const toAdd = newFiles.slice(0, availableSlots);

    // GIỮ NGUYÊN 100% FILE GỐC, KHÔNG QUA NÉN HAY GIẢM ĐỘ PHÂN GIẢI
    toAdd.forEach(file => {
      const previewUrl = URL.createObjectURL(file);
      state.photos.push({
        file: file, // File gốc 100%
        previewUrl: previewUrl,
        originalSize: file.size
      });
    });

    renderPhotoPreviews();
    renderLiveMockup();
    updatePublishButton();
  }

  function renderPhotoPreviews() {
    dom.photoPreviewGrid.innerHTML = '';
    state.photos.forEach((photoObj, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb-card';
      thumb.innerHTML = `
        <img src="${escapeHtml(photoObj.previewUrl)}" alt="Ảnh sản phẩm">
        <button type="button" class="btn-remove-thumb" title="Xóa ảnh" aria-label="Xóa ảnh"><i class="fa-solid fa-xmark"></i></button>
      `;
      thumb.querySelector('.btn-remove-thumb').addEventListener('click', (e) => {
        e.stopPropagation();
        URL.revokeObjectURL(photoObj.previewUrl);
        state.photos.splice(index, 1);
        renderPhotoPreviews();
        renderLiveMockup();
        updatePublishButton();
      });
      dom.photoPreviewGrid.appendChild(thumb);
    });
  }

  function handleVideoFile(file) {
    if (!file || !file.type.startsWith('video/')) {
      showToast('Vui lòng chọn 1 file video (MP4, MOV...)', 'warning');
      return;
    }

    if (state.video?.previewUrl) {
      URL.revokeObjectURL(state.video.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    state.video = { file, previewUrl };

    dom.videoPreviewElement.src = previewUrl;
    dom.videoPreviewContainer.style.display = 'flex';
    dom.videoDropzone.style.display = 'none';

    renderLiveMockup();
    updatePublishButton();
  }

  function removeVideo() {
    if (state.video?.previewUrl) {
      URL.revokeObjectURL(state.video.previewUrl);
    }
    state.video = null;
    dom.videoPreviewElement.src = '';
    dom.videoPreviewContainer.style.display = 'none';
    dom.videoDropzone.style.display = 'flex';
    dom.videoFileInput.value = '';
    renderLiveMockup();
    updatePublishButton();
  }

  function updateScheduleTime() {
    if (!state.isScheduled) return;
    const val = dom.scheduleTimeInput.value;
    if (!val) return;

    const dateObj = new Date(val);
    const now = new Date();

    // Facebook requires scheduled time between 10 minutes and 75 days in the future
    const minTime = new Date(now.getTime() + 10 * 60 * 1000);
    if (dateObj < minTime) {
      showToast('Thời gian hẹn giờ phải cách thời điểm hiện tại ít nhất 10 phút!', 'warning');
    }

    state.scheduleTimestamp = Math.floor(dateObj.getTime() / 1000);
    dom.mockPublishTimeText.textContent = `Hẹn giờ: ${dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${dateObj.toLocaleDateString('vi-VN')}`;
  }

  function insertAtCursor(myField, myValue) {
    if (myField.selectionStart || myField.selectionStart === 0) {
      const startPos = myField.selectionStart;
      const endPos = myField.selectionEnd;
      myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
      myField.selectionStart = startPos + myValue.length;
      myField.selectionEnd = startPos + myValue.length;
    } else {
      myField.value += myValue;
    }
    myField.focus();
  }

  function updatePublishButton() {
    const selectedCount = state.selectedPages.size;
    const actionVerb = state.isScheduled ? 'Lên lịch cho' : 'Đăng lên';
    dom.publishButtonText.textContent = `${actionVerb} ${selectedCount} Fanpage đã chọn`;

    const hasContent = state.postText.trim().length > 0 ||
                       (state.postType === 'photo' && state.photos.length > 0) ||
                       (state.postType === 'video' && state.video !== null) ||
                       (state.postType === 'text' && state.postLink.length > 0);

    dom.btnStartPublish.disabled = (selectedCount === 0 || !hasContent || state.isPublishing);
  }

  // ==========================================================
  // TEMPLATES MANAGEMENT
  // ==========================================================
  function renderTemplatesDropdown() {
    dom.templateSelect.innerHTML = '<option value="">-- Chọn bài mẫu đã lưu --</option>';
    state.templates.forEach((tpl, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${tpl.name} (${tpl.type})`;
      dom.templateSelect.appendChild(opt);
    });
  }

  function saveCurrentAsTemplate() {
    if (!state.postText.trim()) {
      showToast('Vui lòng nhập nội dung bài viết trước khi lưu mẫu!', 'warning');
      return;
    }

    const tplName = prompt('Nhập tên cho mẫu bài viết này (Ví dụ: Mẫu áo bóng đá, Mẫu khuyến mãi):');
    if (!tplName || !tplName.trim()) return;

    state.templates.push({
      name: tplName.trim(),
      content: state.postText,
      type: state.postType,
      link: state.postLink
    });

    localStorage.setItem('metapost_templates', JSON.stringify(state.templates));
    renderTemplatesDropdown();
    showToast(`Đã lưu mẫu "${tplName.trim()}" thành công!`, 'success');
  }

  function loadSelectedTemplate(e) {
    const idx = e.target.value;
    if (idx === '') return;

    const tpl = state.templates[idx];
    if (!tpl) return;

    dom.postContent.value = tpl.content;
    state.postText = tpl.content;
    dom.charCount.textContent = state.postText.length;

    if (tpl.link) {
      dom.postLinkInput.value = tpl.link;
      state.postLink = tpl.link;
    }

    renderLiveMockup();
    updatePublishButton();
    showToast(`Đã tải mẫu: ${tpl.name}`, 'info');
  }

  function openTemplatesModal() {
    renderTemplatesList();
    openModal(dom.templatesModal);
  }

  function renderTemplatesList() {
    dom.templatesListContainer.innerHTML = '';
    if (state.templates.length === 0) {
      dom.templatesListContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-regular fa-bookmark"></i>
          <p>Chưa có mẫu bài viết nào</p>
          <small>Soạn bài viết và bấm "Lưu mẫu" để lưu các bài đăng thường dùng.</small>
        </div>`;
      return;
    }

    state.templates.forEach((tpl, idx) => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-meta">
          <strong>${escapeHtml(tpl.name)}</strong>
          <p>${escapeHtml(tpl.content)}</p>
        </div>
        <div class="template-card-actions">
          <button class="btn-sm btn-outline btn-apply-tpl" data-idx="${idx}">Sử dụng</button>
          <button class="btn-sm btn-ghost text-btn-danger btn-del-tpl" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;

      card.querySelector('.btn-apply-tpl').addEventListener('click', () => {
        dom.postContent.value = tpl.content;
        state.postText = tpl.content;
        dom.charCount.textContent = state.postText.length;
        if (tpl.link) {
          dom.postLinkInput.value = tpl.link;
          state.postLink = tpl.link;
        }
        renderLiveMockup();
        updatePublishButton();
        closeModal(dom.templatesModal);
        showToast(`Đã áp dụng mẫu: ${tpl.name}`, 'success');
      });

      card.querySelector('.btn-del-tpl').addEventListener('click', () => {
        if (confirm(`Xóa mẫu "${tpl.name}"?`)) {
          state.templates.splice(idx, 1);
          localStorage.setItem('metapost_templates', JSON.stringify(state.templates));
          renderTemplatesDropdown();
          renderTemplatesList();
          showToast('Đã xóa mẫu bài viết.', 'info');
        }
      });

      dom.templatesListContainer.appendChild(card);
    });
  }

  // ==========================================================
  // SMART ANTI-SPAM CONTENT GENERATOR
  // ==========================================================
  function generateSmartAntiSpam(baseText, pageIndex, totalPages) {
    if (!baseText || totalPages <= 1 || !dom.chkSmartAntiSpam.checked) {
      return baseText;
    }

    let text = baseText;

    // Strategy 1: Permute hashtags if present
    const hashtagRegex = /#[\p{L}\p{N}_]+/gu;
    const hashtags = text.match(hashtagRegex);

    if (hashtags && hashtags.length > 1) {
      const shiftedTags = [...hashtags];
      // Rotate hashtags based on page index
      for (let i = 0; i < (pageIndex % hashtags.length); i++) {
        shiftedTags.push(shiftedTags.shift());
      }
      let tagIndex = 0;
      text = text.replace(hashtagRegex, () => shiftedTags[tagIndex++] || '');
    }

    // Strategy 2: Invisible Zero-Width Space insertion
    // Inserts zero-width spaces (\u200B) between words
    const zwsCount = (pageIndex % 3) + 1;
    const zws = '\u200B'.repeat(zwsCount);

    // Strategy 3: Random short SKU/ID code at end
    const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    return `${text}${zws}\n\n🏷️ [Mã: #${randomId}]`;
  }

  // ==========================================================
  // FACEBOOK LIVE MOCKUP PREVIEW
  // ==========================================================
  function renderLiveMockup() {
    const firstSelectedId = Array.from(state.selectedPages)[0];
    const targetPage = state.pages.find(p => p.id === firstSelectedId);

    if (targetPage) {
      dom.mockPageName.textContent = targetPage.name;
      const avatarUrl = targetPage.picture?.data?.url;
      if (avatarUrl) {
        dom.mockAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(targetPage.name)}">`;
      } else {
        dom.mockAvatar.innerHTML = '<i class="fa-solid fa-store"></i>';
      }
    } else {
      dom.mockPageName.textContent = state.pages.length > 0 ? 'Chưa chọn Page' : 'Tên Fanpage của bạn';
      dom.mockAvatar.innerHTML = '<i class="fa-solid fa-store"></i>';
    }

    // Body Text
    if (state.postText.trim().length > 0) {
      dom.mockContent.innerHTML = escapeHtml(state.postText);
    } else {
      dom.mockContent.innerHTML = '<span class="placeholder-text">Nội dung bài viết bạn soạn sẽ hiển thị thực tế tại đây...</span>';
    }

    // Media Preview
    dom.mockMediaContainer.innerHTML = '';

    if (state.postType === 'photo' && state.photos.length > 0) {
      const count = state.photos.length;
      if (count === 1) {
        dom.mockMediaContainer.innerHTML = `
          <div class="mockup-grid-1">
            <img src="${escapeHtml(state.photos[0].previewUrl)}" alt="Preview">
          </div>`;
      } else if (count === 2) {
        dom.mockMediaContainer.innerHTML = `
          <div class="mockup-grid-2">
            <img src="${escapeHtml(state.photos[0].previewUrl)}" alt="Preview 1">
            <img src="${escapeHtml(state.photos[1].previewUrl)}" alt="Preview 2">
          </div>`;
      } else if (count === 3) {
        dom.mockMediaContainer.innerHTML = `
          <div class="mockup-grid-3">
            <img src="${escapeHtml(state.photos[0].previewUrl)}" alt="Preview 1">
            <img src="${escapeHtml(state.photos[1].previewUrl)}" alt="Preview 2">
            <img src="${escapeHtml(state.photos[2].previewUrl)}" alt="Preview 3">
          </div>`;
      } else if (count === 4) {
        dom.mockMediaContainer.innerHTML = `
          <div class="mockup-grid-4">
            <img src="${escapeHtml(state.photos[0].previewUrl)}" alt="Preview 1">
            <img src="${escapeHtml(state.photos[1].previewUrl)}" alt="Preview 2">
            <img src="${escapeHtml(state.photos[2].previewUrl)}" alt="Preview 3">
            <img src="${escapeHtml(state.photos[3].previewUrl)}" alt="Preview 4">
          </div>`;
      } else {
        dom.mockMediaContainer.innerHTML = `
          <div class="mockup-grid-more">
            <img src="${escapeHtml(state.photos[0].previewUrl)}" alt="Preview 1">
            <img src="${escapeHtml(state.photos[1].previewUrl)}" alt="Preview 2">
            <img src="${escapeHtml(state.photos[2].previewUrl)}" alt="Preview 3">
            <div class="grid-item-more">
              <img src="${escapeHtml(state.photos[3].previewUrl)}" alt="Preview 4">
              <div class="more-overlay">+${count - 3}</div>
            </div>
          </div>`;
      }
    } else if (state.postType === 'video' && state.video) {
      dom.mockMediaContainer.innerHTML = `
        <div class="mockup-grid-1">
          <video src="${escapeHtml(state.video.previewUrl)}" controls style="width: 100%; max-height: 280px;"></video>
        </div>`;
    } else if (state.postType === 'text' && state.postLink) {
      let domain = 'link';
      try {
        domain = new URL(state.postLink).hostname;
      } catch (e) {}
      dom.mockMediaContainer.innerHTML = `
        <div class="mock-link-preview">
          <div class="link-domain">${escapeHtml(domain)}</div>
          <div class="link-title">${escapeHtml(state.postLink)}</div>
        </div>`;
    }
  }

  const renderLiveMockupDebounced = debounce(renderLiveMockup, 80);

  // ==========================================================
  // PUBLISHING WORKFLOW (GRAPH API POSTS)
  // ==========================================================
  async function startPublishingFlow() {
    const targetPages = state.pages.filter(p => state.selectedPages.has(p.id));
    if (targetPages.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 Fanpage để đăng bài.', 'error');
      return;
    }

    state.isPublishing = true;
    state.cancelRequested = false;
    state.failedPages = [];
    updatePublishButton();

    // Prepare Results UI
    dom.publishResultsList.innerHTML = '';
    updateProgressBar(0, `Bắt đầu đăng lên ${targetPages.length} Fanpage...`);
    dom.btnDonePublish.style.display = 'none';
    dom.btnClosePublishModal.style.display = 'none';
    dom.btnRetryFailed.style.display = 'none';
    dom.btnCancelPublish.style.display = 'inline-flex';

    // Render initial pending rows
    targetPages.forEach(page => {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.id = `resultRow_${page.id}`;
      row.innerHTML = `
        <div class="result-page-meta">
          <img class="result-avatar" src="${escapeHtml(page.picture?.data?.url || '')}" alt="">
          <span class="result-name">${escapeHtml(page.name)}</span>
        </div>
        <span class="result-status-badge badge-pending">
          <i class="fa-solid fa-clock"></i> Đang chờ
        </span>
      `;
      dom.publishResultsList.appendChild(row);
    });

    openModal(dom.publishModal);

    await executePublishLoop(targetPages);
  }

  async function executePublishLoop(pagesToPublish) {
    let successCount = 0;
    let failCount = 0;
    const historyResults = [];

    for (let i = 0; i < pagesToPublish.length; i++) {
      if (state.cancelRequested) {
        showToast('Đã dừng tiến trình đăng bài.', 'warning');
        break;
      }

      const page = pagesToPublish[i];
      const row = document.getElementById(`resultRow_${page.id}`);

      const percent = Math.round((i / pagesToPublish.length) * 100);
      updateProgressBar(percent, `Đang xử lý [${i + 1}/${pagesToPublish.length}]: ${page.name}...`);

      if (row) {
        row.querySelector('.result-status-badge').className = 'result-status-badge badge-running';
        row.querySelector('.result-status-badge').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
      }

      const finalMessage = generateSmartAntiSpam(state.postText, i, pagesToPublish.length);

      try {
        const publishRes = await postToSinglePage(page, finalMessage);
        successCount++;

        if (row) {
          const postLink = getPostUrl(page.id, publishRes.id || publishRes.post_id);
          row.querySelector('.result-status-badge').className = 'result-status-badge badge-success';
          row.querySelector('.result-status-badge').innerHTML = `
            <i class="fa-solid fa-circle-check"></i> ${state.isScheduled ? 'Đã lên lịch' : 'Thành công'}
            <a href="${escapeHtml(postLink)}" target="_blank" rel="noopener noreferrer" class="text-link" style="margin-left: 6px;" title="Xem trên Facebook"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          `;
        }
        historyResults.push({ pageName: page.name, pageId: page.id, success: true, postId: publishRes.id });
      } catch (err) {
        console.error(`Post failed for ${page.name}:`, err);
        failCount++;
        state.failedPages.push(page);

        if (row) {
          row.querySelector('.result-status-badge').className = 'result-status-badge badge-error';
          row.querySelector('.result-status-badge').innerHTML = `
            <i class="fa-solid fa-triangle-exclamation"></i> Thất bại: ${escapeHtml(err.message)}
            <button type="button" class="btn-retry-single" data-id="${escapeHtml(page.id)}">Thử lại</button>
          `;
          row.querySelector('.btn-retry-single').addEventListener('click', () => retrySinglePage(page));
        }
        historyResults.push({ pageName: page.name, pageId: page.id, success: false, error: err.message });
      }

      // Delay between posts
      if (i < pagesToPublish.length - 1 && state.delayMs > 0 && !state.cancelRequested) {
        await sleep(state.delayMs);
      }
    }

    // Finish
    updateProgressBar(100, `Hoàn tất! Thành công: ${successCount} | Thất bại: ${failCount}`);
    dom.btnDonePublish.style.display = 'inline-flex';
    dom.btnClosePublishModal.style.display = 'inline-flex';
    dom.btnCancelPublish.style.display = 'none';

    if (state.failedPages.length > 0) {
      dom.btnRetryFailed.style.display = 'inline-flex';
    }

    state.isPublishing = false;
    updatePublishButton();

    // Record History Log
    saveToHistory({
      timestamp: new Date().toISOString(),
      content: state.postText,
      type: state.postType,
      mediaCount: state.postType === 'photo' ? state.photos.length : (state.video ? 1 : 0),
      total: pagesToPublish.length,
      success: successCount,
      fail: failCount,
      results: historyResults
    });
  }

  function requestCancelPublish() {
    state.cancelRequested = true;
    dom.publishProgressStatus.textContent = 'Đang dừng tiến trình...';
  }

  async function retryFailedPages() {
    if (state.failedPages.length === 0) return;
    const toRetry = [...state.failedPages];
    state.failedPages = [];
    dom.btnRetryFailed.style.display = 'none';
    state.isPublishing = true;
    state.cancelRequested = false;
    dom.btnCancelPublish.style.display = 'inline-flex';
    await executePublishLoop(toRetry);
  }

  async function retrySinglePage(page) {
    const row = document.getElementById(`resultRow_${page.id}`);
    if (row) {
      row.querySelector('.result-status-badge').className = 'result-status-badge badge-running';
      row.querySelector('.result-status-badge').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang thử lại...';
    }

    const finalMessage = generateSmartAntiSpam(state.postText, 0, 1);

    try {
      const publishRes = await postToSinglePage(page, finalMessage);
      const postLink = getPostUrl(page.id, publishRes.id || publishRes.post_id);
      if (row) {
        row.querySelector('.result-status-badge').className = 'result-status-badge badge-success';
        row.querySelector('.result-status-badge').innerHTML = `
          <i class="fa-solid fa-circle-check"></i> ${state.isScheduled ? 'Đã lên lịch' : 'Thành công'}
          <a href="${escapeHtml(postLink)}" target="_blank" rel="noopener noreferrer" class="text-link" style="margin-left: 6px;"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        `;
      }
      state.failedPages = state.failedPages.filter(p => p.id !== page.id);
      if (state.failedPages.length === 0) dom.btnRetryFailed.style.display = 'none';
      showToast(`Đăng thành công lên ${page.name}!`, 'success');
    } catch (err) {
      if (row) {
        row.querySelector('.result-status-badge').className = 'result-status-badge badge-error';
        row.querySelector('.result-status-badge').innerHTML = `
          <i class="fa-solid fa-triangle-exclamation"></i> Thất bại: ${escapeHtml(err.message)}
          <button type="button" class="btn-retry-single" data-id="${escapeHtml(page.id)}">Thử lại</button>
        `;
        row.querySelector('.btn-retry-single').addEventListener('click', () => retrySinglePage(page));
      }
      showToast(`Vẫn lỗi trên ${page.name}: ${err.message}`, 'error');
    }
  }

  /**
   * Dispatches the post to FB Graph API based on post type
   */
  async function postToSinglePage(page, messageText) {
    const pageToken = page.access_token;
    if (!pageToken) {
      throw new Error('Thiếu Page Access Token (Quyền quản trị)');
    }

    // 1. Text & Optional Link Post
    if (state.postType === 'text' || (state.postType === 'photo' && state.photos.length === 0)) {
      const url = `${API_BASE}/${page.id}/feed`;
      const formData = new FormData();
      formData.append('message', messageText);
      formData.append('access_token', pageToken);

      if (state.postLink) {
        formData.append('link', state.postLink);
      }

      if (state.isScheduled && state.scheduleTimestamp) {
        formData.append('published', 'false');
        formData.append('scheduled_publish_time', state.scheduleTimestamp);
      }

      return await safeFetch(url, { method: 'POST', body: formData });
    }

    // 2. Single Photo Post
    if (state.postType === 'photo' && state.photos.length === 1) {
      const url = `${API_BASE}/${page.id}/photos`;
      const formData = new FormData();
      formData.append('source', state.photos[0].file);
      formData.append('caption', messageText);
      formData.append('access_token', pageToken);

      if (state.isScheduled && state.scheduleTimestamp) {
        formData.append('published', 'false');
        formData.append('scheduled_publish_time', state.scheduleTimestamp);
      }

      return await safeFetch(url, { method: 'POST', body: formData });
    }

    // 3. Multi-Photo Post (Upload unreleased photos first, then attach to feed)
    if (state.postType === 'photo' && state.photos.length > 1) {
      const mediaFbidArray = [];

      for (let p = 0; p < state.photos.length; p++) {
        const uploadUrl = `${API_BASE}/${page.id}/photos`;
        const photoForm = new FormData();
        photoForm.append('source', state.photos[p].file);
        photoForm.append('published', 'false');
        photoForm.append('access_token', pageToken);

        const photoJson = await safeFetch(uploadUrl, { method: 'POST', body: photoForm });
        mediaFbidArray.push({ media_fbid: photoJson.id });
      }

      // Create multi-photo feed post
      const feedUrl = `${API_BASE}/${page.id}/feed`;
      const feedForm = new FormData();
      feedForm.append('message', messageText);
      feedForm.append('attached_media', JSON.stringify(mediaFbidArray));
      feedForm.append('access_token', pageToken);

      if (state.isScheduled && state.scheduleTimestamp) {
        feedForm.append('published', 'false');
        feedForm.append('scheduled_publish_time', state.scheduleTimestamp);
      }

      return await safeFetch(feedUrl, { method: 'POST', body: feedForm });
    }

    // 4. Video Post
    if (state.postType === 'video' && state.video) {
      const url = `${API_BASE}/${page.id}/videos`;
      const formData = new FormData();
      formData.append('source', state.video.file);
      formData.append('description', messageText);
      formData.append('access_token', pageToken);

      if (state.isScheduled && state.scheduleTimestamp) {
        formData.append('published', 'false');
        formData.append('scheduled_publish_time', state.scheduleTimestamp);
      }

      return await safeFetch(url, { method: 'POST', body: formData }, 90000); // 90s for video
    }

    throw new Error('Loại bài đăng không hợp lệ');
  }

  function updateProgressBar(percent, statusText) {
    dom.publishProgressBar.style.width = `${percent}%`;
    dom.progressBarAria.setAttribute('aria-valuenow', percent);
    dom.publishProgressPercent.textContent = `${percent}%`;
    if (statusText) dom.publishProgressStatus.textContent = statusText;
  }

  function getPostUrl(pageId, postId) {
    if (!postId) return `https://www.facebook.com/${pageId}`;
    if (postId.includes('_')) {
      const parts = postId.split('_');
      return `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
    }
    return `https://www.facebook.com/${pageId}/posts/${postId}`;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ==========================================================
  // HISTORY MANAGEMENT
  // ==========================================================
  function saveToHistory(entry) {
    state.history.unshift(entry);
    if (state.history.length > 50) state.history.pop();
    localStorage.setItem('metapost_history', JSON.stringify(state.history));
    updateHistoryBadge();
  }

  function updateHistoryBadge() {
    dom.historyCount.textContent = state.history.length;
  }

  function openHistoryModal() {
    renderHistoryList();
    openModal(dom.historyModal);
  }

  function renderHistoryList() {
    dom.historyListContainer.innerHTML = '';
    if (state.history.length === 0) {
      dom.historyListContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <p>Chưa có lịch sử đăng bài nào</p>
        </div>`;
      return;
    }

    state.history.forEach(item => {
      const timeStr = new Date(item.timestamp).toLocaleString('vi-VN');
      const card = document.createElement('div');
      card.className = 'history-card';
      card.innerHTML = `
        <div class="history-header">
          <span class="history-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(timeStr)}</span>
          <span class="badge-count">${item.success}/${item.total} thành công</span>
        </div>
        <div class="history-content">${escapeHtml(item.content || '(Bài không có văn bản)')}</div>
        <div class="history-targets">
          ${item.results.map(r => `
            <span class="status-tag ${r.success ? 'status-connected' : 'status-idle'}" style="font-size: 0.72rem;">
              ${escapeHtml(r.pageName)} ${r.success ? '✅' : '❌'}
            </span>
          `).join('')}
        </div>
      `;
      dom.historyListContainer.appendChild(card);
    });
  }

  function clearHistory() {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử đăng bài?')) {
      state.history = [];
      localStorage.removeItem('metapost_history');
      updateHistoryBadge();
      renderHistoryList();
      showToast('Đã xóa sạch lịch sử.', 'info');
    }
  }

  // ==========================================================
  // UTILITIES & TOASTS
  // ==========================================================
  function openModal(modalEl) {
    modalEl.style.display = 'flex';
  }

  function closeModal(modalEl) {
    modalEl.style.display = 'none';
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-xmark';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Run on DOM ready
  document.addEventListener('DOMContentLoaded', initApp);
})();
