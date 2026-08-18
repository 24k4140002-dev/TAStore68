/**
 * METAPOST STUDIO — CRM Inbox Engine (inbox.js)
 * Facebook Graph API + Supabase integration for multi-page inbox management
 * Features: Messenger, Comments, Labels, Tags, Notes, Ads/Organic source tracking
 */

(function () {
  'use strict';

  // ==========================================================
  // CONFIG — Pre-configured Supabase (auto-filled)
  // ==========================================================
  const SUPABASE_DEFAULT_URL = 'https://svhrdnugpjocumycqddm.supabase.co';
  const SUPABASE_DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2aHJkbnVncGpvY3VteWNxZGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTczMDYsImV4cCI6MjEwMjUzMzMwNn0.-JC8UwzrUK0eNHCnHCqsL9yAyiernrhU74v9xWFJDxU';

  const GRAPH_API_VERSION = 'v19.0';
  const API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
  const POLL_INTERVAL_MS = 30000; // 30 seconds auto-refresh

  // ==========================================================
  // STATE
  // ==========================================================
  const state = {
    supabaseUrl: '',
    supabaseKey: '',
    db: null, // Supabase client
    fbToken: localStorage.getItem('metapost_fb_token') || '',
    pages: JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]'),
    selectedPageId: 'all',
    theme: localStorage.getItem('metapost_theme') || 'light',

    // Inbox state
    conversations: [],
    activeConversation: null,
    messages: [],
    currentFilter: { type: 'all', status: 'all', labelId: null },
    searchQuery: '',

    // CRM state (for active customer)
    activeCustomer: null,
    allLabels: [],
    allTags: [],
    customerLabels: [],
    customerTags: [],
    customerNotes: [],

    // Reply state
    replyMode: 'messenger', // messenger | public_comment | private_reply
    attachedFile: null,

    pollTimer: null,
    isLoading: false
  };

  // ==========================================================
  // UTILS
  // ==========================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getInitials(name) {
    if (!name) return 'KH';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getAvatarColor(name) {
    const colors = [
      '#1877f2', '#0d9488', '#8b5cf6', '#d97706',
      '#db2777', '#0284c7', '#4f46e5', '#16a34a'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  function renderAvatarHTML(name, avatarUrl) {
    const initials = getInitials(name);
    const bgColor = getAvatarColor(name);
    if (avatarUrl) {
      return `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="avatar-fallback" style="background:${bgColor}; display:none;">${initials}</div>`;
    }
    return `<div class="avatar-fallback" style="background:${bgColor};">${initials}</div>`;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  }

  function formatDatetime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatDateOnly(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  async function safeFetch(url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      let json;
      try { json = await res.json(); } catch (e) {
        throw new Error(`Phản hồi không hợp lệ từ Facebook (${res.status})`);
      }
      if (!res.ok || json?.error) {
        const msg = json?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        const err = new Error(msg);
        err.code = json?.error?.code;
        throw err;
      }
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Kết nối Facebook quá chậm. Kiểm tra mạng.');
      throw e;
    } finally { clearTimeout(tid); }
  }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-info-circle' };
    t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${escapeHtml(msg)}</span>`;
    container.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0'; t.style.transform = 'translateY(10px)';
      t.style.transition = 'all 0.3s ease';
      setTimeout(() => t.remove(), 300);
    }, 4000);
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  // ==========================================================
  // SETUP & SUPABASE CONNECTION
  // ==========================================================
  function initSetup() {
    const savedUrl = localStorage.getItem('inbox_supabase_url');
    const savedKey = localStorage.getItem('inbox_supabase_key');

    // Use saved credentials, or fall back to pre-configured defaults
    const url = savedUrl || SUPABASE_DEFAULT_URL;
    const key = savedKey || SUPABASE_DEFAULT_ANON_KEY;

    if (url && key) {
      // Auto-fill form fields in case user wants to see them
      const urlField = document.getElementById('setupSupabaseUrl');
      const keyField = document.getElementById('setupAnonKey');
      if (urlField) urlField.value = url;
      if (keyField) keyField.value = key;

      // Auto-connect (skip setup overlay)
      state.supabaseUrl = url;
      state.supabaseKey = key;
      connectSupabase();
    } else {
      document.getElementById('setupOverlay').style.display = 'flex';
    }

    document.getElementById('btnConnectSupabase').addEventListener('click', handleConnectSupabase);
    document.getElementById('btnToggleAnonKey').addEventListener('click', () => {
      const inp = document.getElementById('setupAnonKey');
      const btn = document.getElementById('btnToggleAnonKey');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.querySelector('i').className = inp.type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
    });
  }

  async function handleConnectSupabase() {
    const url = document.getElementById('setupSupabaseUrl').value.trim();
    const key = document.getElementById('setupAnonKey').value.trim();

    if (!url || !key) {
      showToast('Vui lòng nhập đầy đủ Supabase URL và Anon Key!', 'warning');
      return;
    }

    if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
      showToast('URL không đúng định dạng. Ví dụ: https://xxxxx.supabase.co', 'error');
      return;
    }

    const btn = document.getElementById('btnConnectSupabase');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối...';

    state.supabaseUrl = url;
    state.supabaseKey = key;

    const success = await connectSupabase();
    if (success) {
      localStorage.setItem('inbox_supabase_url', url);
      localStorage.setItem('inbox_supabase_key', key);
    } else {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-plug"></i> Kết nối Supabase & Mở CRM Inbox';
    }
  }

  async function connectSupabase() {
    try {
      if (!window.supabase) throw new Error('Supabase JS chưa được tải. Kiểm tra kết nối internet.');

      state.db = window.supabase.createClient(state.supabaseUrl, state.supabaseKey);

      // Test connection by querying labels table
      const { error } = await state.db.from('labels').select('id').limit(1);
      if (error) {
        if (error.code === '42P01') {
          throw new Error('Chưa chạy SQL schema! Vui lòng vào Supabase SQL Editor và chạy file db-setup.sql trước.');
        }
        throw new Error(`Supabase lỗi: ${error.message}`);
      }

      // Connection OK! Launch app
      document.getElementById('setupOverlay').style.display = 'none';
      document.getElementById('inboxApp').style.display = 'flex';
      showToast('Đã kết nối Supabase thành công!', 'success');

      await initApp();
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  }

  // ==========================================================
  // APP INITIALIZATION
  // ==========================================================
  async function initApp() {
    applyTheme(state.theme);
    bindEvents();

    // 1. INSTANT RENDER FROM LOCAL CACHE (0ms delay)
    const cachedConvs = JSON.parse(localStorage.getItem('metapost_inbox_cache') || '[]');
    if (cachedConvs.length > 0) {
      state.conversations = cachedConvs;
      renderConversationsList();
    }

    // 2. Load static metadata and pages in parallel
    await Promise.all([
      loadLabels(),
      loadTags(),
      populatePageFilter()
    ]);
    renderLabelQuickFilter();
    renderLabelsManagerList();
    renderTagsManagerList();

    if (!state.fbToken) {
      showToast('Không tìm thấy Facebook Token. Vui lòng kiểm tra token trên trang chủ MetaPost Studio.', 'warning');
      return;
    }

    // 3. Fast parallel fetch from Facebook & Supabase
    await fetchAndRenderInbox();
    startPolling();
  }

  // ==========================================================
  // EVENTS
  // ==========================================================
  function bindEvents() {
    // Theme
    document.getElementById('btnThemeToggle').addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(state.theme);
      localStorage.setItem('metapost_theme', state.theme);
    });

    // Page filter
    document.getElementById('inboxPageFilter').addEventListener('change', (e) => {
      state.selectedPageId = e.target.value;
      fetchAndRenderInbox();
    });

    // Refresh
    document.getElementById('btnRefreshInbox').addEventListener('click', () => {
      fetchAndRenderInbox(true);
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', debounce((e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      renderConversationsList();
    }, 200));

    // Type tabs
    document.querySelectorAll('.type-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.type-tab').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        state.currentFilter.type = btn.getAttribute('data-type');
        renderConversationsList();
      });
    });

    // Status chips
    document.querySelectorAll('.status-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.status-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.currentFilter.status = chip.getAttribute('data-status');
        renderConversationsList();
      });
    });

    // Reply mode selector
    document.querySelectorAll('.reply-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.reply-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.replyMode = btn.getAttribute('data-mode');
        document.getElementById('replyTextarea').focus();
      });
    });

    // Quick template chips
    document.querySelectorAll('.qt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const ta = document.getElementById('replyTextarea');
        ta.value = chip.getAttribute('data-text');
        ta.focus();
      });
    });

    // Send reply
    document.getElementById('btnSendReply').addEventListener('click', sendReply);
    document.getElementById('replyTextarea').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendReply();
      }
    });

    // Attach file
    document.getElementById('btnAttachFile').addEventListener('click', () => document.getElementById('attachFileInput').click());
    document.getElementById('attachFileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) handleAttachFile(e.target.files[0]);
    });

    // Thread status change
    const threadStatusSelect = document.getElementById('threadStatusSelect');
    if (threadStatusSelect) {
      threadStatusSelect.addEventListener('change', async (e) => {
        if (!state.activeConversation) return;
        await updateConversationStatus(state.activeConversation.fb_conversation_id, e.target.value);
        showToast('Đã cập nhật trạng thái!', 'success');
      });
    }

    // Mark Done / Re-open toggle
    const btnMarkDone = document.getElementById('btnMarkDone');
    if (btnMarkDone) {
      btnMarkDone.addEventListener('click', async () => {
        if (!state.activeConversation) return;
        const isDone = state.activeConversation.status === 'done' || state.activeConversation.status === 'closed';
        const newStatus = isDone ? 'open' : 'done';
        await updateConversationStatus(state.activeConversation.fb_conversation_id, newStatus);
        showToast(isDone ? 'Đã mở lại hội thoại!' : 'Đã đánh dấu xong!', 'success');
      });
    }

    // Star / Follow-up toggle
    const btnStarConv = document.getElementById('btnStarConv');
    if (btnStarConv) {
      btnStarConv.addEventListener('click', async () => {
        if (!state.activeConversation) return;
        const conv = state.activeConversation;
        conv.is_starred = !conv.is_starred;
        const starBtn = document.getElementById('btnStarConv');
        const starIcon = document.getElementById('starIcon');
        if (conv.is_starred) {
          if (starBtn) starBtn.classList.add('starred');
          if (starIcon) starIcon.className = 'fa-solid fa-star';
          showToast('Đã gắn sao theo dõi!', 'info');
        } else {
          if (starBtn) starBtn.classList.remove('starred');
          if (starIcon) starIcon.className = 'fa-regular fa-star';
          showToast('Đã bỏ gắn sao!', 'info');
        }
        renderConversationsList();
        if (state.db) {
          await state.db.from('conversations').update({ is_starred: conv.is_starred }).eq('fb_conversation_id', conv.fb_conversation_id);
        }
      });
    }

    // Mark as Unread
    const btnUnreadConv = document.getElementById('btnUnreadConv');
    if (btnUnreadConv) {
      btnUnreadConv.addEventListener('click', async () => {
        if (!state.activeConversation) return;
        const conv = state.activeConversation;
        conv.unread_count = conv.unread_count > 0 ? 0 : 1;
        renderConversationsList();
        showToast(conv.unread_count > 0 ? 'Đã đánh dấu là chưa đọc' : 'Đã đánh dấu là đã đọc', 'info');
        if (state.db) {
          await state.db.from('conversations').update({ unread_count: conv.unread_count }).eq('fb_conversation_id', conv.fb_conversation_id);
        }
      });
    }

    // Archive
    const btnArchiveConv = document.getElementById('btnArchiveConv');
    if (btnArchiveConv) {
      btnArchiveConv.addEventListener('click', async () => {
        if (!state.activeConversation) return;
        await updateConversationStatus(state.activeConversation.fb_conversation_id, 'archived');
        showToast('Đã lưu trữ hội thoại!', 'info');
      });
    }

    // Spam
    const btnSpamConv = document.getElementById('btnSpamConv');
    if (btnSpamConv) {
      btnSpamConv.addEventListener('click', async () => {
        if (!state.activeConversation) return;
        if (confirm('Chuyển hội thoại này vào thư mục Spam?')) {
          await updateConversationStatus(state.activeConversation.fb_conversation_id, 'spam');
          showToast('Đã chuyển vào Spam!', 'warning');
        }
      });
    }

    // Labels manager
    document.getElementById('btnManageLabels').addEventListener('click', () => {
      document.getElementById('labelsManagerModal').style.display = 'flex';
    });
    document.getElementById('btnCloseLabelsModal').addEventListener('click', () =>
      document.getElementById('labelsManagerModal').style.display = 'none');
    document.getElementById('btnCloseLabelsModalBtn').addEventListener('click', () =>
      document.getElementById('labelsManagerModal').style.display = 'none');

    // Manager tabs
    document.querySelectorAll('.manager-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.manager-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.getAttribute('data-tab');
        document.getElementById('labelsTab').style.display = tabName === 'labels' ? 'flex' : 'none';
        document.getElementById('tagsTab').style.display = tabName === 'tags' ? 'flex' : 'none';
      });
    });

    document.getElementById('labelsTab').style.display = 'flex';
    document.getElementById('labelsTab').style.flexDirection = 'column';
    document.getElementById('labelsTab').style.gap = '0.75rem';
    document.getElementById('tagsTab').style.display = 'none';

    document.getElementById('btnCreateLabel').addEventListener('click', createLabel);
    document.getElementById('btnCreateTag').addEventListener('click', createTag);

    // CRM Panel - Labels/Tags
    document.getElementById('btnAddLabel').addEventListener('click', toggleLabelPicker);
    document.getElementById('btnAddTag').addEventListener('click', toggleTagPicker);
    document.getElementById('btnAddNote').addEventListener('click', addNote);

    // Contact field edits
    document.querySelectorAll('.btn-edit-field').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.getAttribute('data-field');
        editContactField(field);
      });
    });

    // Mobile: back to list
    document.getElementById('btnBackToList').addEventListener('click', () => {
      document.getElementById('inboxThread').style.display = 'none';
      const sidebar = document.getElementById('inboxSidebar');
      sidebar.classList.add('mobile-show');
    });

    // Close pickers on outside click
    document.addEventListener('click', (e) => {
      const lp = document.getElementById('labelPicker');
      const tp = document.getElementById('tagPicker');
      if (lp && !e.target.closest('#labelPicker') && !e.target.closest('#btnAddLabel')) {
        lp.style.display = 'none';
      }
      if (tp && !e.target.closest('#tagPicker') && !e.target.closest('#btnAddTag')) {
        tp.style.display = 'none';
      }
    });

    // Close modal on overlay click
    document.getElementById('labelsManagerModal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('labelsManagerModal'))
        document.getElementById('labelsManagerModal').style.display = 'none';
    });

    // Keyboard close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('labelsManagerModal').style.display = 'none';
      }
    });
  }

  function applyTheme(theme) {
    document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
    const btn = document.getElementById('btnThemeToggle');
    if (btn) btn.innerHTML = theme === 'dark'
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }

  // ==========================================================
  // PAGE FILTER POPULATION (Preload Page Access Tokens)
  // ==========================================================
  async function populatePageFilter() {
    const select = document.getElementById('inboxPageFilter');
    if (!select) return;
    select.innerHTML = '<option value="all">Tất cả Fanpage</option>';

    if (!state.fbToken) return;
    try {
      // Preload access_token for all pages in a SINGLE request!
      const data = await safeFetch(
        `${API_BASE}/me/accounts?fields=id,name,access_token,picture&limit=100&access_token=${encodeURIComponent(state.fbToken)}`
      );
      if (data.data && Array.isArray(data.data)) {
        state.pages = data.data;
        localStorage.setItem('metapost_pages_cache', JSON.stringify(data.data));
        data.data.forEach(page => {
          const opt = document.createElement('option');
          opt.value = page.id;
          opt.textContent = page.name;
          select.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Could not load pages for filter:', err.message);
    }
  }

  // ==========================================================
  // FETCH INBOX (FAST PARALLEL CONCURRENT FETCH)
  // ==========================================================
  async function fetchAndRenderInbox(showSpinner = false) {
    if (!state.fbToken) return;
    if (state.isLoading) return;
    state.isLoading = true;

    const loadingEl = document.getElementById('convLoadingState');
    const emptyEl   = document.getElementById('convEmptyState');
    const refreshIcon = document.getElementById('refreshIcon');
    const refreshText = document.getElementById('refreshStatusText');

    if (showSpinner && (!state.conversations || state.conversations.length === 0)) {
      if (loadingEl) loadingEl.style.display = 'flex';
      if (emptyEl)   emptyEl.style.display   = 'none';
      const listEl = document.getElementById('conversationsList');
      if (listEl) listEl.innerHTML = '';
    }

    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    if (refreshText) refreshText.textContent = 'Đang tải tin nhắn...';

    try {
      if (state.pages.length === 0) {
        await populatePageFilter();
      }

      const pagesToFetch = state.selectedPageId === 'all'
        ? state.pages
        : state.pages.filter(p => p.id === state.selectedPageId);

      // PARALLEL FETCH: Fetch all pages simultaneously using Promise.allSettled
      const fetchPromises = pagesToFetch.map(async page => {
        const pageToken = page.access_token || state.fbToken;
        try {
          const convData = await safeFetch(
            `${API_BASE}/${page.id}/conversations?fields=id,updated_time,participants{id,name,picture{data{url}}},can_reply,messages.limit(1){id,message,created_time,from}&limit=30&access_token=${encodeURIComponent(pageToken)}`
          );

          if (!convData.data) return [];

          return convData.data.map(conv => {
            const participants = conv.participants?.data || [];
            const customer = participants.find(p => p.id !== page.id);
            const lastMsg = conv.messages?.data?.[0];
            const customerPsid = customer?.id || '';
            const avatarUrl = customer?.picture?.data?.url || (customerPsid && pageToken
              ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${customerPsid}/picture?type=square&height=100&width=100&access_token=${encodeURIComponent(pageToken)}`
              : '');

            return {
              id: conv.id,
              fb_conversation_id: conv.id,
              page_id: page.id,
              page_name: page.name,
              page_token: pageToken,
              conversation_type: 'messenger',
              customer_psid: customerPsid,
              customer_name: customer?.name || 'Khách hàng',
              avatar_url: avatarUrl,
              snippet: lastMsg?.message || '(Đính kèm tệp / ảnh)',
              last_message_at: conv.updated_time,
              can_reply: conv.can_reply !== false,
              last_sender_id: lastMsg?.from?.id,
              status: 'open',
              is_starred: false,
              reply_deadline: lastMsg?.created_time
                ? new Date(new Date(lastMsg.created_time).getTime() + 24 * 3600 * 1000).toISOString()
                : null
            };
          });
        } catch (e) {
          console.warn(`Parallel fetch error on ${page.name}:`, e.message);
          return [];
        }
      });

      const results = await Promise.allSettled(fetchPromises);
      const allConvs = [];
      results.forEach(res => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          allConvs.push(...res.value);
        }
      });

      // Update state & cache instantly
      state.conversations = allConvs;
      localStorage.setItem('metapost_inbox_cache', JSON.stringify(allConvs));

      // ⚡ RENDER NGAY LẬP TỨC (Không chờ Supabase để người dùng không phải đợi!)
      renderConversationsList();

      if (refreshText) {
        refreshText.textContent = `Cập nhật lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
      }

      // Sync Supabase CRM data asynchronously in background
      syncConversationsToSupabase(allConvs).then(() => {
        loadSupabaseCRMData().then(() => {
          renderConversationsList();
        });
      });

    } catch (err) {
      console.error('Inbox fetch error:', err);
      showToast(`Lỗi tải inbox: ${err.message}`, 'error');
    } finally {
      state.isLoading = false;
      if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    }
  }

  async function syncConversationsToSupabase(conversations) {
    if (!state.db || conversations.length === 0) return;
    try {
      // Upsert customers
      const customerUpserts = conversations
        .filter(c => c.customer_psid)
        .map(c => ({
          psid: c.customer_psid,
          page_id: c.page_id,
          first_name: c.customer_name.split(' ').slice(-1)[0] || c.customer_name,
          last_name: c.customer_name.split(' ').slice(0, -1).join(' ') || ''
        }));

      if (customerUpserts.length > 0) {
        await state.db.from('customers').upsert(customerUpserts, { onConflict: 'psid', ignoreDuplicates: false });
      }

      // Load customer IDs
      const psids = conversations.map(c => c.customer_psid).filter(Boolean);
      const { data: customers } = await state.db.from('customers').select('id,psid').in('psid', psids);
      const customerMap = {};
      if (customers) customers.forEach(c => { customerMap[c.psid] = c.id; });

      // Upsert conversations
      const convUpserts = conversations.map(c => ({
        fb_conversation_id: c.fb_conversation_id,
        customer_id: customerMap[c.customer_psid] || null,
        page_id: c.page_id,
        page_name: c.page_name,
        conversation_type: c.conversation_type,
        snippet: c.snippet?.substring(0, 300) || '',
        can_reply: c.can_reply,
        reply_deadline: c.reply_deadline,
        last_message_at: c.last_message_at
      }));

      await state.db.from('conversations').upsert(convUpserts, { onConflict: 'fb_conversation_id', ignoreDuplicates: false });
    } catch (err) {
      console.warn('Supabase sync error:', err.message);
    }
  }

  async function loadSupabaseCRMData() {
    if (!state.db) return;
    try {
      // Load conversations with labels from Supabase
      const fbIds = state.conversations.map(c => c.fb_conversation_id);
      if (fbIds.length === 0) return;

      const { data: dbConvs } = await state.db
        .from('conversations')
        .select(`
          fb_conversation_id,
          status,
          unread_count,
          conversation_labels(labels(id,name,color,emoji)),
          customer_id,
          customers(phone,email,source,ad_id)
        `)
        .in('fb_conversation_id', fbIds);

      if (dbConvs) {
        const dbMap = {};
        dbConvs.forEach(c => { dbMap[c.fb_conversation_id] = c; });

        state.conversations = state.conversations.map(c => {
          const db = dbMap[c.fb_conversation_id];
          if (db) {
            return {
              ...c,
              status: db.status || 'open',
              unread_count: db.unread_count || 0,
              is_starred: db.is_starred || db.status === 'starred',
              labels: db.conversation_labels?.map(l => l.labels).filter(Boolean) || [],
              customer_id: db.customer_id,
              customer_phone: db.customers?.phone,
              customer_email: db.customers?.email,
              source: db.customers?.source || 'organic',
              ad_id: db.customers?.ad_id
            };
          }
          return { ...c, labels: [], status: 'open', unread_count: 0 };
        });
      }
    } catch (err) {
      console.warn('CRM data load error:', err.message);
    }
  }

  // ==========================================================
  // RENDER CONVERSATIONS LIST
  // ==========================================================
  function renderConversationsList() {
    const container = document.getElementById('conversationsList');
    // These elements are SIBLINGS of container (not children), so safe after innerHTML=''
    const loadingEl = document.getElementById('convLoadingState');
    const emptyEl   = document.getElementById('convEmptyState');

    if (!container) return;
    container.innerHTML = '';
    if (loadingEl) loadingEl.style.display = 'none'; // always hide spinner when rendering

    let filtered = state.conversations;

    // Apply type filter
    if (state.currentFilter.type !== 'all') {
      filtered = filtered.filter(c => c.conversation_type === state.currentFilter.type);
    }

    // Apply status filter (Meta Business Suite Standard)
    if (state.currentFilter.status !== 'all') {
      if (state.currentFilter.status === 'unread') {
        filtered = filtered.filter(c => c.unread_count > 0);
      } else if (state.currentFilter.status === 'starred') {
        filtered = filtered.filter(c => c.is_starred || c.status === 'starred');
      } else if (state.currentFilter.status === 'done') {
        filtered = filtered.filter(c => c.status === 'done' || c.status === 'closed');
      } else if (state.currentFilter.status === 'open') {
        filtered = filtered.filter(c => !c.status || c.status === 'open' || c.status === 'pending');
      } else {
        filtered = filtered.filter(c => c.status === state.currentFilter.status);
      }
    }

    // Apply label filter
    if (state.currentFilter.labelId) {
      filtered = filtered.filter(c =>
        c.labels?.some(l => l.id === state.currentFilter.labelId)
      );
    }

    // Apply search
    if (state.searchQuery) {
      filtered = filtered.filter(c =>
        c.customer_name.toLowerCase().includes(state.searchQuery) ||
        (c.snippet || '').toLowerCase().includes(state.searchQuery)
      );
    }

    // Sort: unread first, then by last_message_at
    filtered.sort((a, b) => {
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (b.unread_count > 0 && a.unread_count === 0) return 1;
      return new Date(b.last_message_at) - new Date(a.last_message_at);
    });

    if (filtered.length === 0) {
      if (emptyEl) emptyEl.style.display = 'flex';
    } else {
      if (emptyEl) emptyEl.style.display = 'none';

      filtered.forEach(conv => {
        const el = buildConversationItem(conv);
        container.appendChild(el);
      });
    }

    // Update stats
    document.getElementById('totalConvCount').textContent = `${state.conversations.length} hội thoại`;
    document.getElementById('unreadConvCount').textContent =
      `${state.conversations.filter(c => c.unread_count > 0).length} chưa đọc`;
  }

  function buildConversationItem(conv) {
    const isActive = state.activeConversation?.fb_conversation_id === conv.fb_conversation_id;
    const isUnread = conv.unread_count > 0;
    const isStarred = conv.is_starred || conv.status === 'starred';
    const typeIcon = conv.conversation_type === 'messenger' ? 'type-messenger' : 'type-comment';
    const typeChar = conv.conversation_type === 'messenger'
      ? '<i class="fa-brands fa-facebook-messenger"></i>'
      : '<i class="fa-regular fa-comment"></i>';

    const div = document.createElement('div');
    div.className = `conv-item${isActive ? ' active' : ''}${isUnread ? ' unread' : ''}`;
    div.setAttribute('role', 'listitem');

    const labelsHtml = (conv.labels || []).slice(0, 3).map(l =>
      `<span class="label-chip-mini" style="background:${escapeHtml(l.color)}">${escapeHtml(l.emoji || '')} ${escapeHtml(l.name)}</span>`
    ).join('');

    const avatarHtml = renderAvatarHTML(
      conv.customer_name,
      conv.avatar_url || (conv.customer_psid && conv.page_token ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${conv.customer_psid}/picture?type=square&height=100&width=100&access_token=${encodeURIComponent(conv.page_token)}` : '')
    );

    div.innerHTML = `
      <div class="conv-avatar-wrap">
        <div class="conv-avatar">
          ${avatarHtml}
        </div>
        <span class="conv-type-badge ${typeIcon}">${typeChar}</span>
      </div>
      <div class="conv-body">
        <div class="conv-header-row">
          <span class="conv-name">
            ${escapeHtml(conv.customer_name)}
            ${isStarred ? '<i class="fa-solid fa-star conv-star-badge" title="Đã gắn sao theo dõi"></i>' : ''}
          </span>
          <span class="conv-time">${timeAgo(conv.last_message_at)}</span>
        </div>
        <div class="conv-snippet">${escapeHtml(conv.snippet || '...')}</div>
        ${labelsHtml ? `<div class="conv-labels-row">${labelsHtml}</div>` : ''}
      </div>
      ${isUnread ? '<div class="conv-unread-dot"></div>' : ''}
    `;

    div.addEventListener('click', () => selectConversation(conv));
    return div;
  }

  // ==========================================================
  // SELECT CONVERSATION & LOAD MESSAGES
  // ==========================================================
  async function selectConversation(conv) {
    state.activeConversation = conv;

    // Update UI
    document.getElementById('threadEmptyState').style.display = 'none';
    document.getElementById('threadContainer').style.display = 'flex';
    document.getElementById('crmPanelEmpty').style.display = 'none';
    document.getElementById('crmPanelContent').style.display = 'flex';

    // Mark active in list
    document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
    const matchEl = Array.from(document.querySelectorAll('.conv-item'))
      .find(el => el.querySelector('.conv-name')?.textContent === conv.customer_name);
    if (matchEl) matchEl.classList.add('active');

    // Update thread header
    document.getElementById('threadCustomerName').textContent = conv.customer_name;

    const sourceText = conv.source === 'ADS'
      ? `💰 Đến từ Ads${conv.ad_id ? ` · ID: ${conv.ad_id}` : ''}`
      : '🌱 Organic (Trực tiếp)';
    document.getElementById('threadSourceInfo').textContent =
      `${conv.page_name} · ${conv.conversation_type === 'messenger' ? 'Messenger' : 'Bình luận'} · ${sourceText}`;

    // Thread avatar
    const avatarHtml = renderAvatarHTML(
      conv.customer_name,
      conv.avatar_url || (conv.customer_psid && conv.page_token ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${conv.customer_psid}/picture?type=square&height=100&width=100&access_token=${encodeURIComponent(conv.page_token)}` : '')
    );
    const threadAvatarEl = document.getElementById('threadAvatar');
    if (threadAvatarEl) threadAvatarEl.innerHTML = avatarHtml;

    // Update CRM Panel avatar
    const crmAvatarEl = document.getElementById('crmAvatar');
    if (crmAvatarEl) crmAvatarEl.innerHTML = avatarHtml;

    // Status select
    const statusSelect = document.getElementById('threadStatusSelect');
    if (statusSelect) statusSelect.value = conv.status || 'open';

    // Update Mark Done button text & style
    const isDone = conv.status === 'done' || conv.status === 'closed';
    const markDoneText = document.getElementById('btnMarkDoneText');
    if (markDoneText) markDoneText.textContent = isDone ? 'Mở lại' : 'Xong';
    const markDoneBtn = document.getElementById('btnMarkDone');
    if (markDoneBtn) markDoneBtn.className = isDone ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';

    // Update Star button
    const isStarred = conv.is_starred || conv.status === 'starred';
    const starBtn = document.getElementById('btnStarConv');
    const starIcon = document.getElementById('starIcon');
    if (starBtn && starIcon) {
      if (isStarred) {
        starBtn.classList.add('starred');
        starIcon.className = 'fa-solid fa-star';
      } else {
        starBtn.classList.remove('starred');
        starIcon.className = 'fa-regular fa-star';
      }
    }

    // Update Meta Business Suite link
    const metaSuiteBtn = document.getElementById('btnOpenMetaSuite');
    if (metaSuiteBtn && conv.page_id) {
      metaSuiteBtn.href = `https://business.facebook.com/latest/inbox/all?page_id=${conv.page_id}`;
    }

    // Reply mode
    if (conv.conversation_type === 'comment') {
      document.getElementById('replyModeMessenger').style.display = 'none';
      document.getElementById('replyModePublic').style.display = 'inline-flex';
      document.getElementById('replyModePrivate').style.display = 'inline-flex';
      state.replyMode = 'public_comment';
      document.querySelectorAll('.reply-mode-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('replyModePublic').classList.add('active');
    } else {
      document.getElementById('replyModeMessenger').style.display = 'inline-flex';
      document.getElementById('replyModePublic').style.display = 'none';
      document.getElementById('replyModePrivate').style.display = 'none';
      state.replyMode = 'messenger';
      document.querySelectorAll('.reply-mode-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('replyModeMessenger').classList.add('active');
    }

    // 24h window check
    updateReplyWindowStatus(conv);

    // Mark as read in Supabase
    if (conv.unread_count > 0 && state.db) {
      await state.db.from('conversations')
        .update({ unread_count: 0 })
        .eq('fb_conversation_id', conv.fb_conversation_id);
      conv.unread_count = 0;
      renderConversationsList();
    }

    // Load messages & CRM profile
    await Promise.all([
      loadMessages(conv),
      loadCustomerCRMProfile(conv)
    ]);

    // Fetch customer avatar from FB
    if (conv.customer_psid) {
      fetchCustomerProfile(conv.customer_psid, conv.page_token);
    }
  }

  function updateReplyWindowStatus(conv) {
    const deadlineBadge = document.getElementById('replyDeadlineBadge');
    const replyBox = document.getElementById('replyBox');
    const closedNotice = document.getElementById('replyClosedNotice');
    const windowStatusEl = document.getElementById('windowStatus');

    if (!conv.can_reply) {
      deadlineBadge.style.display = 'flex';
      deadlineBadge.className = 'reply-deadline-badge deadline-expired';
      deadlineBadge.textContent = '🔒 Đã hết hạn reply';
      replyBox.style.display = 'none';
      closedNotice.style.display = 'flex';
      return;
    }

    replyBox.style.display = 'flex';
    closedNotice.style.display = 'none';

    if (conv.reply_deadline) {
      const deadline = new Date(conv.reply_deadline);
      const now = new Date();
      const diffMs = deadline - now;
      const diffHours = diffMs / (1000 * 3600);

      if (diffMs < 0) {
        deadlineBadge.style.display = 'flex';
        deadlineBadge.className = 'reply-deadline-badge deadline-expired';
        deadlineBadge.textContent = '🔒 Quá 24h';
        if (windowStatusEl) windowStatusEl.textContent = '⚠️ Cửa sổ 24h đã đóng';
        if (windowStatusEl) windowStatusEl.style.color = 'var(--accent-danger)';
      } else if (diffHours < 3) {
        deadlineBadge.style.display = 'flex';
        deadlineBadge.className = 'reply-deadline-badge deadline-warning';
        deadlineBadge.textContent = `⚠️ Còn ${Math.floor(diffHours)}h ${Math.floor((diffHours % 1) * 60)}p`;
        if (windowStatusEl) windowStatusEl.textContent = 'Còn ít thời gian để reply!';
        if (windowStatusEl) windowStatusEl.style.color = 'var(--accent-warning)';
      } else {
        deadlineBadge.style.display = 'none';
        if (windowStatusEl) windowStatusEl.textContent = `Cửa sổ đến ${deadline.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
        if (windowStatusEl) windowStatusEl.style.color = '';
      }
    } else {
      deadlineBadge.style.display = 'none';
      if (windowStatusEl) windowStatusEl.textContent = '';
    }
  }

  // ==========================================================
  // LOAD MESSAGES
  // ==========================================================
  async function loadMessages(conv) {
    const area = document.getElementById('messagesArea');
    area.innerHTML = '<div class="messages-loading"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải tin nhắn...</div>';

    try {
      const token = conv.page_token || state.fbToken;
      const data = await safeFetch(
        `${API_BASE}/${conv.fb_conversation_id}/messages?fields=id,created_time,from,message,attachments{mime_type,file_url,image_data}&limit=50&access_token=${encodeURIComponent(token)}`
      );

      const messages = (data.data || []).reverse();
      state.messages = messages;

      area.innerHTML = '';
      if (messages.length === 0) {
        area.innerHTML = '<div class="messages-loading">Chưa có tin nhắn nào</div>';
        return;
      }

      let lastDate = '';
      messages.forEach(msg => {
        const msgDate = new Date(msg.created_time).toDateString();
        if (msgDate !== lastDate) {
          const sep = document.createElement('div');
          sep.className = 'date-separator';
          sep.textContent = formatDateOnly(msg.created_time);
          area.appendChild(sep);
          lastDate = msgDate;
        }
        const isFromPage = msg.from?.id === conv.page_id;
        area.appendChild(buildMessageBubble(msg, isFromPage, conv.page_id));
      });

      // Sync last few messages to Supabase cache
      syncMessagesToSupabase(messages, conv);

      // Scroll to bottom
      area.scrollTop = area.scrollHeight;
    } catch (err) {
      area.innerHTML = `<div class="messages-loading" style="color:var(--accent-danger)">Lỗi tải tin nhắn: ${escapeHtml(err.message)}</div>`;
    }
  }

  function buildMessageBubble(msg, isFromPage, pageId) {
    const row = document.createElement('div');
    row.className = `message-row ${isFromPage ? 'from-page' : 'from-customer'}`;

    let contentHtml = '';

    if (msg.message) {
      contentHtml += escapeHtml(msg.message).replace(/\n/g, '<br>');
    }

    const atts = msg.attachments?.data || [];
    atts.forEach(att => {
      if (att.mime_type?.startsWith('image/') && att.image_data?.url) {
        contentHtml += `<img src="${escapeHtml(att.image_data.url)}" alt="Ảnh đính kèm" loading="lazy">`;
      } else if (att.file_url) {
        contentHtml += `<a href="${escapeHtml(att.file_url)}" target="_blank" rel="noopener noreferrer" style="color:#fff;text-decoration:underline;">📎 ${escapeHtml(att.mime_type || 'File đính kèm')}</a>`;
      }
    });

    if (!contentHtml) contentHtml = '<em style="opacity:0.7">Tin nhắn đặc biệt</em>';

    const avatarHtml = isFromPage
      ? '<div class="msg-avatar"><i class="fa-solid fa-store"></i></div>'
      : `<div class="msg-avatar" id="msgAvatar_${escapeHtml(msg.id)}"><i class="fa-solid fa-user"></i></div>`;

    row.innerHTML = `
      ${!isFromPage ? avatarHtml : ''}
      <div class="msg-bubble-wrap">
        <div class="msg-bubble">${contentHtml}</div>
        <div class="msg-time">${formatDatetime(msg.created_time)}</div>
      </div>
      ${isFromPage ? avatarHtml : ''}
    `;

    return row;
  }

  async function syncMessagesToSupabase(messages, conv) {
    if (!state.db || !conv.fb_conversation_id) return;
    try {
      const { data: dbConv } = await state.db
        .from('conversations')
        .select('id')
        .eq('fb_conversation_id', conv.fb_conversation_id)
        .single();

      if (!dbConv) return;

      const upserts = messages.slice(-20).map(msg => ({
        conversation_id: dbConv.id,
        fb_message_id: msg.id,
        sender_type: msg.from?.id === conv.page_id ? 'page' : 'customer',
        sender_id: msg.from?.id || '',
        sender_name: msg.from?.name || '',
        message_text: msg.message || null,
        attachments: msg.attachments?.data || [],
        created_at: msg.created_time
      }));

      await state.db.from('messages').upsert(upserts, { onConflict: 'fb_message_id', ignoreDuplicates: true });
    } catch (e) { /* silent sync */ }
  }

  // ==========================================================
  // FETCH CUSTOMER PROFILE FROM FB
  // ==========================================================
  async function fetchCustomerProfile(psid, pageToken) {
    try {
      const token = pageToken || state.fbToken;
      const profile = await safeFetch(
        `${API_BASE}/${psid}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(token)}`
      );

      // Update thread header avatar
      const threadAvatar = document.getElementById('threadAvatar');
      if (profile.profile_pic && threadAvatar) {
        threadAvatar.innerHTML = `<img src="${escapeHtml(profile.profile_pic)}" alt="${escapeHtml(profile.first_name || '')}">`;
      }

      // Update CRM avatar
      const crmAvatar = document.getElementById('crmAvatar');
      if (profile.profile_pic && crmAvatar) {
        crmAvatar.innerHTML = `<img src="${escapeHtml(profile.profile_pic)}" alt="${escapeHtml(profile.first_name || '')}">`;
      }

      if (profile.profile_pic) {
        if (state.activeConversation) state.activeConversation.avatar_url = profile.profile_pic;
        const convInList = state.conversations.find(c => c.customer_psid === psid);
        if (convInList) convInList.avatar_url = profile.profile_pic;
      }

      const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
      if (document.getElementById('crmCustomerName') && fullName)
        document.getElementById('crmCustomerName').textContent = fullName;

      // Update customer in Supabase
      if (state.db && psid) {
        await state.db.from('customers').update({
          first_name: profile.first_name || null,
          last_name: profile.last_name || null,
          profile_pic: profile.profile_pic || null,
          updated_at: new Date().toISOString()
        }).eq('psid', psid);
      }
    } catch (e) { /* profile fetch optional */ }
  }

  // ==========================================================
  // SEND REPLY
  // ==========================================================
  async function sendReply() {
    const conv = state.activeConversation;
    if (!conv) return;

    const ta = document.getElementById('replyTextarea');
    const text = ta.value.trim();

    if (!text && !state.attachedFile) {
      showToast('Vui lòng nhập nội dung hoặc đính kèm file!', 'warning');
      return;
    }

    const btnSend = document.getElementById('btnSendReply');
    btnSend.disabled = true;
    btnSend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
      const token = conv.page_token || state.fbToken;

      if (state.replyMode === 'messenger' && conv.customer_psid) {
        // Messenger Send API
        const payload = {
          recipient: { id: conv.customer_psid },
          messaging_type: 'RESPONSE'
        };

        if (state.attachedFile) {
          // File upload
          const formData = new FormData();
          formData.append('recipient', JSON.stringify({ id: conv.customer_psid }));
          formData.append('messaging_type', 'RESPONSE');
          const fileType = state.attachedFile.type.startsWith('image/') ? 'image' : 'file';
          formData.append('message', JSON.stringify({
            attachment: { type: fileType, payload: { is_reusable: true } }
          }));
          formData.append('filedata', state.attachedFile);

          await safeFetch(
            `${API_BASE}/me/messages?access_token=${encodeURIComponent(token)}`,
            { method: 'POST', body: formData },
            30000
          );
        } else {
          payload.message = { text: text };
          await safeFetch(
            `${API_BASE}/me/messages?access_token=${encodeURIComponent(token)}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
          );
        }

      } else if (state.replyMode === 'public_comment' && conv.fb_conversation_id) {
        // Public comment reply
        const form = new FormData();
        form.append('message', text);
        form.append('access_token', token);
        await safeFetch(
          `${API_BASE}/${conv.fb_conversation_id}/comments`,
          { method: 'POST', body: form }
        );

      } else if (state.replyMode === 'private_reply' && conv.fb_conversation_id) {
        // Private reply to comment
        const payload = {
          recipient: { comment_id: conv.fb_conversation_id },
          messaging_type: 'RESPONSE',
          message: { text: text }
        };
        await safeFetch(
          `${API_BASE}/me/messages?access_token=${encodeURIComponent(token)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
      }

      // Add optimistic bubble
      const area = document.getElementById('messagesArea');
      const optimisticMsg = {
        id: `opt_${Date.now()}`,
        created_time: new Date().toISOString(),
        from: { id: conv.page_id, name: conv.page_name },
        message: text
      };
      area.appendChild(buildMessageBubble(optimisticMsg, true, conv.page_id));
      area.scrollTop = area.scrollHeight;

      ta.value = '';
      state.attachedFile = null;
      document.getElementById('replyAttachmentPreview').style.display = 'none';
      document.getElementById('attachFileInput').value = '';
      showToast('Đã gửi tin nhắn thành công!', 'success');

      // Update snippet in conversations list
      conv.snippet = text;
      conv.last_message_at = new Date().toISOString();
      renderConversationsList();

    } catch (err) {
      showToast(`Gửi thất bại: ${err.message}`, 'error');
    } finally {
      btnSend.disabled = false;
      btnSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
  }

  function handleAttachFile(file) {
    state.attachedFile = file;
    const preview = document.getElementById('replyAttachmentPreview');
    preview.style.display = 'flex';

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      preview.innerHTML = `
        <img src="${escapeHtml(url)}" alt="Ảnh đính kèm">
        <span>${escapeHtml(file.name)}</span>
        <button class="btn btn-ghost btn-sm" id="btnRemoveAttach"><i class="fa-solid fa-xmark"></i></button>
      `;
    } else {
      preview.innerHTML = `
        <i class="fa-solid fa-file"></i>
        <span>${escapeHtml(file.name)}</span>
        <button class="btn btn-ghost btn-sm" id="btnRemoveAttach"><i class="fa-solid fa-xmark"></i></button>
      `;
    }

    document.getElementById('btnRemoveAttach').addEventListener('click', () => {
      state.attachedFile = null;
      preview.style.display = 'none';
      document.getElementById('attachFileInput').value = '';
    });
  }

  // ==========================================================
  // CRM PROFILE — LOAD
  // ==========================================================
  async function loadCustomerCRMProfile(conv) {
    if (!state.db) return;

    // Reset
    document.getElementById('crmCustomerName').textContent = conv.customer_name;
    document.getElementById('crmCustomerMeta').textContent = `PSID: ${conv.customer_psid || '—'} · ${conv.page_name}`;
    document.getElementById('crmAvatar').innerHTML = '<i class="fa-solid fa-user"></i>';

    // Source badge
    const sourceBadge = document.getElementById('crmSourceBadge');
    if (conv.source === 'ADS' || conv.ad_id) {
      sourceBadge.className = 'crm-source-badge source-ads';
      sourceBadge.innerHTML = `<i class="fa-solid fa-rectangle-ad"></i> Paid Ads${conv.ad_id ? ` · ID: ${escapeHtml(conv.ad_id)}` : ''}`;
    } else {
      sourceBadge.className = 'crm-source-badge source-organic';
      sourceBadge.innerHTML = '<i class="fa-solid fa-seedling"></i> Organic (Tự nhiên)';
    }

    // Contact fields
    updateContactField('phone', conv.customer_phone);
    updateContactField('email', conv.customer_email);

    // Stats
    document.getElementById('statFirstContact').textContent = formatDatetime(conv.last_message_at);
    document.getElementById('statLastContact').textContent = timeAgo(conv.last_message_at);
    document.getElementById('statSource').textContent = conv.source === 'ADS' ? '💰 Ads' : '🌱 Organic';

    if (!conv.fb_conversation_id) return;

    try {
      // Load conversation labels
      const { data: dbConv } = await state.db
        .from('conversations')
        .select('id,conversation_labels(labels(id,name,color,emoji))')
        .eq('fb_conversation_id', conv.fb_conversation_id)
        .single();

      if (dbConv) {
        state.activeConversation._db_id = dbConv.id;
        state.customerLabels = dbConv.conversation_labels?.map(l => l.labels).filter(Boolean) || [];
        renderConvLabels();
      }

      // Load customer tags & notes
      if (conv.customer_psid) {
        const { data: customerData } = await state.db
          .from('customers')
          .select(`
            id,
            phone,
            email,
            source,
            created_at,
            customer_tags(tags(id,name,color)),
            notes(id,content,author_name,created_at)
          `)
          .eq('psid', conv.customer_psid)
          .single();

        if (customerData) {
          state.activeCustomer = customerData;
          state.customerTags = customerData.customer_tags?.map(t => t.tags).filter(Boolean) || [];
          state.customerNotes = customerData.notes || [];

          updateContactField('phone', customerData.phone);
          updateContactField('email', customerData.email);

          document.getElementById('statFirstContact').textContent = formatDatetime(customerData.created_at);
          document.getElementById('statTotalMessages').textContent = state.messages.length;

          renderCustomerTags();
          renderNotes();
        }
      }
    } catch (e) {
      console.warn('CRM profile load error:', e.message);
    }
  }

  function updateContactField(field, value) {
    const span = document.querySelector(`.field-value[data-field="${field}"]`);
    if (!span) return;
    if (value) {
      span.textContent = value;
      span.className = 'field-value';
    } else {
      span.textContent = 'Chưa có';
      span.className = 'field-value empty';
    }
  }

  async function editContactField(field) {
    const current = document.querySelector(`.field-value[data-field="${field}"]`)?.textContent;
    const prompt_text = field === 'phone' ? 'Nhập số điện thoại khách:' : 'Nhập địa chỉ email khách:';
    const newValue = prompt(prompt_text, current === 'Chưa có' ? '' : current);
    if (newValue === null) return;

    updateContactField(field, newValue.trim() || null);

    if (state.db && state.activeCustomer?.id) {
      await state.db.from('customers')
        .update({ [field]: newValue.trim() || null })
        .eq('id', state.activeCustomer.id);
      showToast(`Đã cập nhật ${field === 'phone' ? 'SĐT' : 'Email'}!`, 'success');
    }
  }

  // ==========================================================
  // LABELS — SUPABASE
  // ==========================================================
  async function loadLabels() {
    if (!state.db) return;
    const { data } = await state.db.from('labels').select('*').order('sort_order');
    state.allLabels = data || [];
  }

  async function loadTags() {
    if (!state.db) return;
    const { data } = await state.db.from('tags').select('*').order('name');
    state.allTags = data || [];
  }

  function renderLabelQuickFilter() {
    const container = document.getElementById('labelQuickFilter');
    container.innerHTML = '';
    state.allLabels.forEach(label => {
      const chip = document.createElement('button');
      chip.className = `status-chip${state.currentFilter.labelId === label.id ? ' active' : ''}`;
      chip.textContent = `${label.emoji || ''} ${label.name}`;
      chip.style.borderColor = label.color;
      chip.addEventListener('click', () => {
        if (state.currentFilter.labelId === label.id) {
          state.currentFilter.labelId = null;
          chip.classList.remove('active');
        } else {
          state.currentFilter.labelId = label.id;
          document.querySelectorAll('#labelQuickFilter .status-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        }
        renderConversationsList();
      });
      container.appendChild(chip);
    });
  }

  function renderConvLabels() {
    const container = document.getElementById('crmLabels');
    container.innerHTML = '';
    state.customerLabels.forEach(label => {
      const chip = document.createElement('span');
      chip.className = 'label-chip';
      chip.style.background = label.color;
      chip.innerHTML = `${escapeHtml(label.emoji || '')} ${escapeHtml(label.name)} <span class="remove-chip" data-id="${label.id}">✕</span>`;
      chip.querySelector('.remove-chip').addEventListener('click', () => removeLabelFromConv(label.id));
      container.appendChild(chip);
    });
  }

  function renderCustomerTags() {
    const container = document.getElementById('crmTags');
    container.innerHTML = '';
    state.customerTags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'label-chip';
      chip.style.background = tag.color;
      chip.innerHTML = `# ${escapeHtml(tag.name)} <span class="remove-chip" data-id="${tag.id}">✕</span>`;
      chip.querySelector('.remove-chip').addEventListener('click', () => removeTagFromCustomer(tag.id));
      container.appendChild(chip);
    });
  }

  function toggleLabelPicker() {
    const picker = document.getElementById('labelPicker');
    if (picker.style.display === 'block') {
      picker.style.display = 'none';
      return;
    }

    const list = document.getElementById('labelPickerList');
    list.innerHTML = '';
    const current = new Set(state.customerLabels.map(l => l.id));

    state.allLabels.forEach(label => {
      const alreadyAdded = current.has(label.id);
      const item = document.createElement('div');
      item.className = 'label-picker-item';
      item.innerHTML = `
        <span class="label-dot" style="background:${escapeHtml(label.color)}"></span>
        <span style="flex:1">${escapeHtml(label.emoji || '')} ${escapeHtml(label.name)}</span>
        ${alreadyAdded ? '<i class="fa-solid fa-check" style="color:var(--accent-success);font-size:0.75rem;"></i>' : ''}
      `;
      if (!alreadyAdded) {
        item.addEventListener('click', () => addLabelToConv(label));
      }
      list.appendChild(item);
    });

    picker.style.display = 'block';
  }

  function toggleTagPicker() {
    const picker = document.getElementById('tagPicker');
    if (picker.style.display === 'block') {
      picker.style.display = 'none';
      return;
    }

    const list = document.getElementById('tagPickerList');
    list.innerHTML = '';
    const current = new Set(state.customerTags.map(t => t.id));

    state.allTags.forEach(tag => {
      const alreadyAdded = current.has(tag.id);
      const item = document.createElement('div');
      item.className = 'label-picker-item';
      item.innerHTML = `
        <span class="label-dot" style="background:${escapeHtml(tag.color)}"></span>
        <span style="flex:1"># ${escapeHtml(tag.name)}</span>
        ${alreadyAdded ? '<i class="fa-solid fa-check" style="color:var(--accent-success);font-size:0.75rem;"></i>' : ''}
      `;
      if (!alreadyAdded) {
        item.addEventListener('click', () => addTagToCustomer(tag));
      }
      list.appendChild(item);
    });

    picker.style.display = 'block';
  }

  async function addLabelToConv(label) {
    if (!state.db || !state.activeConversation?._db_id) return;
    document.getElementById('labelPicker').style.display = 'none';

    try {
      await state.db.from('conversation_labels').upsert({
        conversation_id: state.activeConversation._db_id,
        label_id: label.id
      }, { onConflict: 'conversation_id,label_id', ignoreDuplicates: true });

      state.customerLabels.push(label);
      renderConvLabels();

      // Update in list
      const conv = state.conversations.find(c => c.fb_conversation_id === state.activeConversation.fb_conversation_id);
      if (conv) {
        if (!conv.labels) conv.labels = [];
        conv.labels.push(label);
        renderConversationsList();
      }

      showToast(`Đã gán nhãn "${label.name}"!`, 'success');
    } catch (e) { showToast('Lỗi gán nhãn: ' + e.message, 'error'); }
  }

  async function removeLabelFromConv(labelId) {
    if (!state.db || !state.activeConversation?._db_id) return;
    try {
      await state.db.from('conversation_labels')
        .delete()
        .eq('conversation_id', state.activeConversation._db_id)
        .eq('label_id', labelId);

      state.customerLabels = state.customerLabels.filter(l => l.id !== labelId);
      renderConvLabels();

      const conv = state.conversations.find(c => c.fb_conversation_id === state.activeConversation.fb_conversation_id);
      if (conv) {
        conv.labels = (conv.labels || []).filter(l => l.id !== labelId);
        renderConversationsList();
      }
    } catch (e) { showToast('Lỗi xóa nhãn: ' + e.message, 'error'); }
  }

  async function addTagToCustomer(tag) {
    if (!state.db || !state.activeCustomer?.id) return;
    document.getElementById('tagPicker').style.display = 'none';

    try {
      await state.db.from('customer_tags').upsert({
        customer_id: state.activeCustomer.id,
        tag_id: tag.id
      }, { onConflict: 'customer_id,tag_id', ignoreDuplicates: true });

      state.customerTags.push(tag);
      renderCustomerTags();
      showToast(`Đã gán tag "${tag.name}"!`, 'success');
    } catch (e) { showToast('Lỗi gán tag: ' + e.message, 'error'); }
  }

  async function removeTagFromCustomer(tagId) {
    if (!state.db || !state.activeCustomer?.id) return;
    try {
      await state.db.from('customer_tags')
        .delete()
        .eq('customer_id', state.activeCustomer.id)
        .eq('tag_id', tagId);

      state.customerTags = state.customerTags.filter(t => t.id !== tagId);
      renderCustomerTags();
    } catch (e) { showToast('Lỗi xóa tag: ' + e.message, 'error'); }
  }

  // ==========================================================
  // NOTES
  // ==========================================================
  function renderNotes() {
    const list = document.getElementById('notesList');
    const badge = document.getElementById('notesCountBadge');
    badge.textContent = state.customerNotes.length;

    list.innerHTML = '';
    state.customerNotes.forEach(note => {
      const el = document.createElement('div');
      el.className = 'note-item';
      el.innerHTML = `
        <div class="note-content">${escapeHtml(note.content)}</div>
        <div class="note-meta">
          <span>${escapeHtml(note.author_name)} · ${timeAgo(note.created_at)}</span>
        </div>
        <button class="btn-delete-note" data-id="${note.id}" title="Xóa ghi chú">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;
      el.querySelector('.btn-delete-note').addEventListener('click', () => deleteNote(note.id));
      list.appendChild(el);
    });
  }

  async function addNote() {
    if (!state.db || !state.activeCustomer?.id) {
      showToast('Chưa kết nối database hoặc chưa chọn khách hàng!', 'warning');
      return;
    }

    const content = document.getElementById('newNoteInput').value.trim();
    if (!content) {
      showToast('Vui lòng nhập nội dung ghi chú!', 'warning');
      return;
    }

    try {
      const { data } = await state.db.from('notes').insert({
        customer_id: state.activeCustomer.id,
        conversation_id: state.activeConversation?._db_id || null,
        author_name: 'Admin',
        content: content
      }).select().single();

      if (data) {
        state.customerNotes.unshift(data);
        renderNotes();
        document.getElementById('newNoteInput').value = '';
        showToast('Đã lưu ghi chú!', 'success');
      }
    } catch (e) { showToast('Lỗi lưu ghi chú: ' + e.message, 'error'); }
  }

  async function deleteNote(noteId) {
    if (!state.db || !confirm('Xóa ghi chú này?')) return;
    try {
      await state.db.from('notes').delete().eq('id', noteId);
      state.customerNotes = state.customerNotes.filter(n => n.id !== noteId);
      renderNotes();
    } catch (e) { showToast('Lỗi xóa ghi chú: ' + e.message, 'error'); }
  }

  // ==========================================================
  // LABELS & TAGS MANAGER
  // ==========================================================
  async function createLabel() {
    const name = document.getElementById('newLabelName').value.trim();
    const color = document.getElementById('newLabelColor').value;
    const emoji = document.getElementById('newLabelEmoji').value.trim() || '🏷️';
    if (!name) { showToast('Nhập tên nhãn trước!', 'warning'); return; }

    try {
      const { data } = await state.db.from('labels')
        .insert({ name, color, emoji, sort_order: state.allLabels.length })
        .select().single();

      if (data) {
        state.allLabels.push(data);
        document.getElementById('newLabelName').value = '';
        renderLabelsManagerList();
        renderLabelQuickFilter();
        showToast(`Đã tạo nhãn "${name}"!`, 'success');
      }
    } catch (e) {
      if (e.message?.includes('unique')) showToast('Nhãn này đã tồn tại!', 'warning');
      else showToast('Lỗi tạo nhãn: ' + e.message, 'error');
    }
  }

  async function createTag() {
    const name = document.getElementById('newTagName').value.trim();
    const color = document.getElementById('newTagColor').value;
    if (!name) { showToast('Nhập tên tag trước!', 'warning'); return; }

    try {
      const { data } = await state.db.from('tags')
        .insert({ name, color })
        .select().single();

      if (data) {
        state.allTags.push(data);
        document.getElementById('newTagName').value = '';
        renderTagsManagerList();
        showToast(`Đã tạo tag "${name}"!`, 'success');
      }
    } catch (e) {
      if (e.message?.includes('unique')) showToast('Tag này đã tồn tại!', 'warning');
      else showToast('Lỗi tạo tag: ' + e.message, 'error');
    }
  }

  function renderLabelsManagerList() {
    const list = document.getElementById('labelsList');
    list.innerHTML = '';
    state.allLabels.forEach(label => {
      const el = document.createElement('div');
      el.className = 'manage-item-row';
      el.innerHTML = `
        <span class="manage-item-dot" style="background:${escapeHtml(label.color)}"></span>
        <span class="manage-item-name">${escapeHtml(label.emoji || '')} ${escapeHtml(label.name)}</span>
        <button class="btn-delete-item" data-id="${label.id}" title="Xóa nhãn">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
      el.querySelector('.btn-delete-item').addEventListener('click', async () => {
        if (!confirm(`Xóa nhãn "${label.name}"? Sẽ bị gỡ khỏi tất cả hội thoại.`)) return;
        await state.db.from('labels').delete().eq('id', label.id);
        state.allLabels = state.allLabels.filter(l => l.id !== label.id);
        renderLabelsManagerList();
        renderLabelQuickFilter();
        showToast('Đã xóa nhãn!', 'info');
      });
      list.appendChild(el);
    });
  }

  function renderTagsManagerList() {
    const list = document.getElementById('tagsList');
    list.innerHTML = '';
    state.allTags.forEach(tag => {
      const el = document.createElement('div');
      el.className = 'manage-item-row';
      el.innerHTML = `
        <span class="manage-item-dot" style="background:${escapeHtml(tag.color)}"></span>
        <span class="manage-item-name"># ${escapeHtml(tag.name)}</span>
        <button class="btn-delete-item" data-id="${tag.id}" title="Xóa tag">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
      el.querySelector('.btn-delete-item').addEventListener('click', async () => {
        if (!confirm(`Xóa tag "${tag.name}"?`)) return;
        await state.db.from('tags').delete().eq('id', tag.id);
        state.allTags = state.allTags.filter(t => t.id !== tag.id);
        renderTagsManagerList();
        showToast('Đã xóa tag!', 'info');
      });
      list.appendChild(el);
    });
  }

  // ==========================================================
  // STATUS UPDATE (Meta Business Suite Standard)
  // ==========================================================
  async function updateConversationStatus(fbConvId, newStatus) {
    const conv = state.conversations.find(c => c.fb_conversation_id === fbConvId);
    if (conv) {
      conv.status = newStatus;
      if (newStatus === 'done' || newStatus === 'closed') conv.unread_count = 0;
    }
    if (state.activeConversation && state.activeConversation.fb_conversation_id === fbConvId) {
      state.activeConversation.status = newStatus;
      const statusSelect = document.getElementById('threadStatusSelect');
      if (statusSelect) statusSelect.value = newStatus;
      const markDoneText = document.getElementById('btnMarkDoneText');
      const isDone = newStatus === 'done' || newStatus === 'closed';
      if (markDoneText) markDoneText.textContent = isDone ? 'Mở lại' : 'Xong';
      const markDoneBtn = document.getElementById('btnMarkDone');
      if (markDoneBtn) markDoneBtn.className = isDone ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
    }

    renderConversationsList();

    // Persist in local cache
    localStorage.setItem('metapost_inbox_cache', JSON.stringify(state.conversations));

    // Persist in Supabase
    if (state.db) {
      try {
        await state.db.from('conversations')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('fb_conversation_id', fbConvId);
      } catch (e) {
        console.warn('Supabase status update error:', e.message);
      }
    }
  }

  // ==========================================================
  // AUTO POLLING
  // ==========================================================
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => {
      if (!document.hidden) fetchAndRenderInbox(false);
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling();
    else startPolling();
  });

  window.addEventListener('beforeunload', stopPolling);

  // ==========================================================
  // BOOT
  // ==========================================================
  document.addEventListener('DOMContentLoaded', initSetup);
})();
