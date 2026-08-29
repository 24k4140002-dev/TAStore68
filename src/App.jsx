import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  MessageSquare,
  Send,
  Moon,
  Sun,
  Key,
  Maximize2,
  Minimize2,
  TrendingUp,
  Bell,
  BellRing,
  Settings
} from 'lucide-react';
import CRMInbox from './components/inbox/CRMInbox';
import { cleanFacebookToken } from './services/facebookApi';
import { isStandaloneApp, shouldApplySyncToken } from './utils/tokenSync';
import {
  getPushHealth,
  PUSH_PAGE_SELECTION_CHANGED_EVENT
} from './services/pushState';
import {
  registerServiceWorker,
  enableBackgroundNotifications,
  getBackgroundNotificationStatus,
  disableBackgroundNotifications
} from './services/notificationService';

import TokenModal from './components/common/TokenModal';
const PostStudio = lazy(() => import('./components/post/PostStudio'));
const AdsStudio = lazy(() => import('./components/ads/AdsStudio'));
const AdminStudio = lazy(() => import('./components/admin/AdminStudio'));

function clearInboxSessionCaches() {
  const keysToRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('metapost_inbox_cache')) keysToRemove.push(key);
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  localStorage.removeItem('metapost_active_conv_id');
}

export default function App() {
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox' | 'post' | 'ads' | 'admin'
  const [fbToken, setFbToken] = useState(() => cleanFacebookToken(localStorage.getItem('metapost_fb_token') || ''));
  const [theme, setTheme] = useState(() => localStorage.getItem('metapost_theme') || 'light');
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tokenSessionId, setTokenSessionId] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(() => localStorage.getItem('metapost_focus_mode') === 'true');
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const handledSyncTokenRef = useRef('');
  const [notifPermission, setNotifPermission] = useState(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification.permission === 'string') {
        return Notification.permission;
      }
    } catch {}
    return 'default';
  });
  const [notificationNotice, setNotificationNotice] = useState('');
  const [pushEnabled, setPushEnabled] = useState(() => (
    typeof window !== 'undefined'
    && 'Notification' in window
    && Notification.permission === 'granted'
    && localStorage.getItem('metapost_push_enabled') === 'true'
  ));
  const [pushHealth, setPushHealth] = useState(() => {
    if (Number(localStorage.getItem('metapost_push_webhook_failed_count') || 0) > 0) return 'partial';
    try {
      const receivedPages = JSON.parse(localStorage.getItem('metapost_push_received_pages') || '{}');
      if (Object.values(receivedPages).some(value => Date.now() - Number(value || 0) < 24 * 60 * 60_000)) return 'ready';
    } catch {}
    return 'waiting';
  });
  const [notificationTarget, setNotificationTarget] = useState(null);

  const openNotificationTarget = useCallback((pageId, convId, senderPsid) => {
    const target = {
      pageId: String(pageId || 'all'),
      convId: String(convId || ''),
      senderPsid: String(senderPsid || ''),
      nonce: `${Date.now()}-${Math.random()}`
    };
    setActiveTab('inbox');
    if (target.pageId !== 'all') localStorage.setItem('metapost_selected_page_id', target.pageId);
    if (target.convId) {
      localStorage.setItem('metapost_active_conv_id', target.convId);
      localStorage.setItem('metapost_pending_conv_id', target.convId);
    }
    if (target.senderPsid) localStorage.setItem('metapost_pending_sender_psid', target.senderPsid);
    setNotificationTarget(target);
  }, []);

  // 1. Register Service Worker for Web Push & Lock Screen Notifications
  useEffect(() => {
    registerServiceWorker(openNotificationTarget).then(async registration => {
      if (!registration) {
        setPushEnabled(false);
        return;
      }
      const browserHasSubscription = await getBackgroundNotificationStatus();
      setPushEnabled(
        browserHasSubscription
        && localStorage.getItem('metapost_push_enabled') === 'true'
      );
    });

    // Handle initial launch from Lock Screen Notification Click URL query params
    const params = new URLSearchParams(window.location.search);
    const pId = params.get('pageId');
    const cId = params.get('convId');
    const senderPsid = params.get('senderPsid');
    if (pId || cId || senderPsid) {
      openNotificationTarget(pId, cId, senderPsid);
      // Clean query string from browser bar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [openNotificationTarget]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    const markPushReady = () => setPushHealth(current => current === 'partial' ? current : 'ready');
    window.addEventListener('metapost-push-webhook-ready', markPushReady);
    return () => window.removeEventListener('metapost-push-webhook-ready', markPushReady);
  }, []);

  const handleToggleNotification = async () => {
    setNotificationNotice('Đang đăng ký thông báo cho các Page...');
    try {
      const result = await enableBackgroundNotifications(fbToken);
      setNotifPermission(result.permission);
      setPushEnabled(true);
      const failedCount = result.webhookFailures.length;
      const setupFailureCount = failedCount + (result.appWebhookReady === false ? 1 : 0);
      const nextHealth = getPushHealth({
        failedCount: setupFailureCount,
        callbackReady: result.appWebhookReady !== false && result.diagnostics?.callbackReady !== false,
        received: Boolean(result.webhookObserved)
      });
      setPushHealth(nextHealth);
      localStorage.setItem('metapost_push_webhook_failed_count', String(setupFailureCount));
      localStorage.setItem('metapost_push_webhook_linked_count', String(result.webhookLinkedCount));
      const failedNames = result.webhookFailures.slice(0, 3).map(item => item.pageName).join(', ');
      if (result.appWebhookReady === false) {
        setPushHealth('partial');
        setNotificationNotice(`Thiết bị đã đăng ký nhưng callback Meta App chưa bật được: ${result.appWebhookError || 'Meta từ chối cấu hình.'}`);
      } else if (failedCount > 0) {
        setNotificationNotice(
          `Đã gửi yêu cầu thông báo thử. Meta liên kết được ${result.webhookLinkedCount}/${result.webhookAttempted} Page; ${failedCount} Page lỗi${failedNames ? `: ${failedNames}` : ''}.`
        );
      } else if (result.diagnostics?.appCredentialsValid === false) {
        setPushHealth('partial');
        setNotificationNotice('Thiết bị đã đăng ký, nhưng Meta không chấp nhận thông tin ứng dụng trên máy chủ. Cần kiểm tra META_APP_ID / META_APP_SECRET trong Vercel; không cần dán lại token chat.');
      } else if (result.diagnostics?.callbackReady === false) {
        setNotificationNotice('Thiết bị đã đăng ký, nhưng Webhook của ứng dụng Meta chưa trỏ đúng về máy chủ hoặc chưa bật sự kiện messages. Thông báo tin khách chưa được xác nhận.');
      } else if (!result.diagnostics?.callbackCheckAvailable) {
        setNotificationNotice('Thiết bị đã đăng ký và đã gửi yêu cầu thông báo thử. Chưa kiểm tra được callback Meta; chưa thể xác nhận thông báo tin khách khi khóa màn hình.');
      } else {
        setNotificationNotice(
          `Đã gửi thông báo thử; callback Meta ${result.appWebhookUpdated ? 'vừa được cập nhật' : 'đã đúng'}, liên kết ${result.webhookLinkedCount}/${result.webhookAttempted} Page. ${result.webhookObserved ? 'Máy chủ đã nhận ít nhất một tin khách thật. ' : 'Chưa ghi nhận tin khách thật; nếu khách đang nhắn mà vẫn bằng 0 thì cần kiểm tra Meta App đang ở Live và quyền pages_messaging có Advanced Access. '}Hãy thử một tin mới khi khóa màn hình.`
        );
      }
    } catch (error) {
      setNotifPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
      setPushEnabled(false);
      setNotificationNotice(error.message || 'Không thể bật thông báo.');
    }
    window.setTimeout(() => setNotificationNotice(''), 12_000);
  };

  useEffect(() => {
    let stopped = false;
    const syncPushRegistration = () => {
      if (
        !fbToken
        || notifPermission !== 'granted'
        || localStorage.getItem('metapost_push_enabled') !== 'true'
      ) return;
      enableBackgroundNotifications(fbToken, { sendTest: false })
        .then(result => {
          if (stopped) return;
          setNotifPermission(result.permission);
          setPushEnabled(true);
        })
        .catch(() => {
          if (!stopped) setPushEnabled(false);
        });
    };

    syncPushRegistration();
    window.addEventListener(PUSH_PAGE_SELECTION_CHANGED_EVENT, syncPushRegistration);
    return () => {
      stopped = true;
      window.removeEventListener(PUSH_PAGE_SELECTION_CHANGED_EVENT, syncPushRegistration);
    };
  }, [fbToken, notifPermission]);

  const toggleFocusMode = () => {
    const next = !isFocusMode;
    setIsFocusMode(next);
    localStorage.setItem('metapost_focus_mode', String(next));
  };

  // Sync theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('metapost_theme', theme);
  }, [theme]);

  // Safari and an iOS Home Screen app use separate storage. Keep the sync hash
  // in Safari so a newly-created shortcut can consume it on first launch.
  useEffect(() => {
    const consumeSyncHash = () => {
      const hash = window.location.hash;
      if (!hash || !hash.includes('sync_token=')) return;
      try {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const rawToken = params.get('sync_token');
        const rawPages = params.get('sync_pages');
        const clean = cleanFacebookToken(rawToken);
        const storedToken = cleanFacebookToken(localStorage.getItem('metapost_fb_token') || '');
        const isStandalone = isStandaloneApp(window);

        if (!clean || handledSyncTokenRef.current === clean || !shouldApplySyncToken(storedToken, clean)) {
          handledSyncTokenRef.current = clean;
          // The Safari tab keeps the hash only so a newly installed Home Screen
          // app can inherit it. Once inside the standalone app, remove it even
          // when this token was already present.
          if (clean && isStandalone) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
          return;
        }

        if (clean) {
          handledSyncTokenRef.current = clean;
          let pages = null;
          if (rawPages) {
            try {
              pages = JSON.parse(decodeURIComponent(rawPages));
            } catch {}
          }
          handleSaveToken(clean, pages);
          if (isStandalone) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
      } catch (e) {
        console.warn('Sync hash parse error:', e);
      }
    };
    consumeSyncHash();
    window.addEventListener('hashchange', consumeSyncHash);
    window.addEventListener('pageshow', consumeSyncHash);
    return () => {
      window.removeEventListener('hashchange', consumeSyncHash);
      window.removeEventListener('pageshow', consumeSyncHash);
    };
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleSaveToken = (newToken, loadedPages = null) => {
    const clean = cleanFacebookToken(newToken);
    setFbToken(clean);
    setTokenSessionId(value => value + 1);
    try {
      clearInboxSessionCaches();
      localStorage.setItem('metapost_fb_token', clean);
      localStorage.setItem('metapost_is_permanent', 'true');
      if (loadedPages && Array.isArray(loadedPages) && loadedPages.length > 0) {
        localStorage.setItem('metapost_pages_cache', JSON.stringify(loadedPages));
        const pageIds = new Set(loadedPages.map(page => page.id));
        let visibleIds = [];
        try {
          const parsedVisibleIds = JSON.parse(localStorage.getItem('metapost_visible_page_ids') || '[]');
          visibleIds = Array.isArray(parsedVisibleIds) ? parsedVisibleIds : [];
        } catch {}
        const stillVisible = Array.isArray(visibleIds) ? visibleIds.filter(id => pageIds.has(id)) : [];
        if (stillVisible.length > 0) localStorage.setItem('metapost_visible_page_ids', JSON.stringify(stillVisible));
        else localStorage.removeItem('metapost_visible_page_ids');
      } else {
        localStorage.removeItem('metapost_pages_cache');
      }
      localStorage.removeItem('metapost_selected_page_id');
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  };

  const handleClearToken = () => {
    setFbToken('');
    setPushEnabled(false);
    setPushHealth('waiting');
    setTokenSessionId(value => value + 1);
    setActiveTab('inbox');
    disableBackgroundNotifications().catch(() => {});
    try {
      clearInboxSessionCaches();
      [
        'metapost_fb_token',
        'metapost_is_permanent',
        'metapost_pages_cache',
        'metapost_visible_page_ids',
        'metapost_selected_page_id',
        'metapost_selected_ad_acc',
        'metapost_push_enabled',
        'metapost_push_page_count',
        'metapost_push_webhook_ready',
        'metapost_push_received_pages',
        'metapost_push_registered_at',
        'metapost_push_selection_signature',
        'metapost_push_webhook_failed_count',
        'metapost_push_webhook_linked_count'
      ].forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.warn('Không thể xóa hoàn toàn Token khỏi trình duyệt:', e);
    }
  };

  return (
    <div className="h-[100dvh] min-h-0 w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans fixed inset-0">
      {/* Top Main Navigation Header (Always accessible across Mobile & Desktop, safe from iPhone Notch) */}
      <header className={`${isFocusMode ? 'hidden' : 'flex'} flex-col justify-center flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 pt-[env(safe-area-inset-top,0px)] z-30`}>
        <div className="h-[48px] sm:h-[56px] w-full px-2.5 sm:px-4 lg:px-6 flex items-center justify-between">
        {/* Left: Brand Logo & Module Tabs */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white flex items-center justify-center font-black shadow-md shadow-brand-500/20 text-[11px] sm:text-xs tracking-tighter">
              TA68
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white">TAStore68</span>
                <span className="px-1.5 py-0.2 rounded-md bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 font-extrabold text-[10px] uppercase tracking-wider border border-brand-200/50 dark:border-brand-800/50">
                  Pro
                </span>
              </div>
            </div>
          </div>

          {/* Module Switcher Tabs (Accessible on ALL devices) */}
          <nav className="flex items-center gap-0.5 sm:gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('inbox')}
              className={`min-h-8 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs leading-none whitespace-nowrap font-bold flex items-center gap-1 sm:gap-1.5 transition-smooth ${
                activeTab === 'inbox'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageSquare className="hidden sm:block w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <span className="hidden sm:inline">CRM Inbox Pro</span>
              <span className="sm:hidden">Inbox</span>
            </button>
            <button
              onClick={() => setActiveTab('post')}
              className={`min-h-8 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs leading-none whitespace-nowrap font-bold flex items-center gap-1 sm:gap-1.5 transition-smooth ${
                activeTab === 'post'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Send className="hidden sm:block w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <span className="hidden sm:inline">Đăng Bài Đa Page</span>
              <span className="sm:hidden">Đăng bài</span>
            </button>
            <button
              onClick={() => setActiveTab('ads')}
              className={`min-h-8 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs leading-none whitespace-nowrap font-bold flex items-center gap-1 sm:gap-1.5 transition-smooth ${
                activeTab === 'ads'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="hidden sm:block w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
              <span className="hidden sm:inline">Báo Cáo Ads</span>
              <span className="sm:hidden">Ads</span>
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`min-h-8 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs leading-none whitespace-nowrap font-bold flex items-center gap-1 sm:gap-1.5 transition-smooth ${
                activeTab === 'admin'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Quản trị, bài mẫu và sao lưu"
            >
              <Settings className="hidden sm:block w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span className="hidden sm:inline">Quản trị</span>
              <span className="sm:hidden">QT</span>
            </button>
          </nav>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Online status indicator */}
          <div className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${
            isOnline
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60'
              : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200/60 dark:border-red-800/60'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            <span>{isOnline ? 'Có kết nối mạng' : 'Mất kết nối mạng'}</span>
          </div>

          {/* Notification & Sound Toggle button */}
          <button
            onClick={handleToggleNotification}
            aria-pressed={pushEnabled}
            className={`w-8 h-8 p-0 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-smooth ${
              pushEnabled
                ? pushHealth === 'ready'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
                  : pushHealth === 'partial'
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100'
                    : 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100'
                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={pushEnabled
              ? pushHealth === 'ready'
                ? 'Webhook Meta và thông báo nền đã được ghi nhận; bấm để kiểm tra lại'
                : 'Thiết bị đã đăng ký nhưng chưa nhận được tin khách thật; bấm để kiểm tra lại'
              : 'Bật thông báo màn hình khóa theo từng Page'}
          >
            {pushEnabled ? (
              <BellRing className="w-3.5 h-3.5 text-blue-500" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
            <span className="hidden lg:inline">
              {pushEnabled
                ? pushHealth === 'ready' ? 'Đã nhận Push' : pushHealth === 'partial' ? 'Chuông cần kiểm tra' : 'Chờ tin thật'
                : 'Bật Chuông'}
            </span>
          </button>

          {/* Token Config button */}
          <button
            onClick={() => setIsTokenModalOpen(true)}
            className={`w-8 h-8 p-0 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-smooth ${
              fbToken
                ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                : 'bg-amber-700 text-white border-amber-800 animate-bounce'
            }`}
            title="Quản lý Facebook Token"
          >
            <Key className={`w-3.5 h-3.5 ${fbToken ? 'text-amber-500' : 'text-white'}`} />
            <span className="hidden md:inline">{fbToken ? 'Token Đã Kết Nối' : 'Nhập Token FB'}</span>
          </button>

          {/* Focus Mode Toggle (Desktop only) */}
          <button
            onClick={toggleFocusMode}
            className="hidden md:flex p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-smooth"
            title="Chế độ tập trung (Thu gọn menu)"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 p-0 sm:w-auto sm:h-auto sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-smooth flex items-center justify-center"
            title="Đổi giao diện Sáng / Tối"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />}
          </button>
        </div>
        </div>
      </header>

      {/* Floating Focus Mode Expand Button (When header is collapsed on Desktop) */}
      {notificationNotice && (
        <div className="fixed top-[calc(env(safe-area-inset-top,0px)+58px)] right-3 z-[70] max-w-[min(360px,calc(100vw-24px))] rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg dark:border-blue-900 dark:bg-slate-900 dark:text-slate-200">
          {notificationNotice}
        </div>
      )}
      {isFocusMode && (
        <button
          onClick={toggleFocusMode}
          className="fixed top-3 right-3 z-50 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-brand-500 shadow-md transition-smooth flex items-center gap-1.5 text-xs font-bold cursor-pointer animate-in fade-in"
          title="Hiện lại thanh menu"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span>Hiện Menu</span>
        </button>
      )}

      {/* Main View Area */}
      <Suspense fallback={
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-2"></div>
          <p className="text-xs font-semibold">Đang tải mô-đun...</p>
        </div>
      }>
        {activeTab === 'inbox' ? (
          <CRMInbox
            key={`inbox-${tokenSessionId}`}
            fbToken={fbToken}
            notificationTarget={notificationTarget}
            onOpenTokenModal={() => setIsTokenModalOpen(true)}
          />
        ) : activeTab === 'post' ? (
          <PostStudio
            key={`post-${tokenSessionId}`}
            fbToken={fbToken}
          />
        ) : activeTab === 'ads' ? (
          <AdsStudio
            key={`ads-${tokenSessionId}`}
            fbToken={fbToken}
            onOpenTokenModal={() => setIsTokenModalOpen(true)}
          />
        ) : (
          <AdminStudio />
        )}

        {/* Token Modal */}
        {isTokenModalOpen && (
          <TokenModal
            currentToken={fbToken}
            onClose={() => setIsTokenModalOpen(false)}
            onSave={handleSaveToken}
            onClear={handleClearToken}
          />
        )}
      </Suspense>
    </div>
  );
}
