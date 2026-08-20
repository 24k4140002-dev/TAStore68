import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  MessageSquare,
  Send,
  Moon,
  Sun,
  Key,
  ShieldCheck,
  Sparkles,
  Layers,
  CheckCircle2,
  Database,
  Maximize2,
  Minimize2,
  TrendingUp,
  Bell,
  BellRing,
  Volume2
} from 'lucide-react';
import CRMInbox from './components/inbox/CRMInbox';
import { cleanFacebookToken } from './services/facebookApi';
import {
  registerServiceWorker,
  requestNotificationPermission,
  playNotificationChime,
  triggerNewMessageNotification,
  isNotificationSupported
} from './services/notificationService';

import TokenModal from './components/common/TokenModal';
const PostStudio = lazy(() => import('./components/post/PostStudio'));
const AdsStudio = lazy(() => import('./components/ads/AdsStudio'));

export default function App() {
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox' | 'post' | 'ads'
  const [fbToken, setFbToken] = useState(() => cleanFacebookToken(localStorage.getItem('metapost_fb_token') || ''));
  const [theme, setTheme] = useState(() => localStorage.getItem('metapost_theme') || 'light');
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(() => localStorage.getItem('metapost_focus_mode') === 'true');
  const [notifPermission, setNotifPermission] = useState(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification.permission === 'string') {
        return Notification.permission;
      }
    } catch {}
    return 'default';
  });

  // 1. Register Service Worker for Web Push & Lock Screen Notifications
  useEffect(() => {
    registerServiceWorker((pageId, convId) => {
      setActiveTab('inbox');
      if (pageId && pageId !== 'all') localStorage.setItem('metapost_selected_page_id', pageId);
      if (convId) localStorage.setItem('metapost_active_conv_id', convId);
    });

    // Handle initial launch from Lock Screen Notification Click URL query params
    const params = new URLSearchParams(window.location.search);
    const pId = params.get('pageId');
    const cId = params.get('convId');
    if (pId || cId) {
      setActiveTab('inbox');
      if (pId && pId !== 'all') localStorage.setItem('metapost_selected_page_id', pId);
      if (cId) localStorage.setItem('metapost_active_conv_id', cId);
      // Clean query string from browser bar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleToggleNotification = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    await triggerNewMessageNotification({
      pageId: 'all',
      pageName: 'TAStore68 Pro',
      customerName: 'Hệ Thống Thông Báo',
      messageText: '🔔 Chuông báo Ting Ting và thông báo màn hình khóa đã sẵn sàng!',
      playSound: true
    });
  };

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

  // Handle QR Sync URL Hash from PC to Mobile (e.g. #sync_token=...&sync_pages=...)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('sync_token=')) {
      try {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const rawToken = params.get('sync_token');
        const rawPages = params.get('sync_pages');
        const clean = cleanFacebookToken(rawToken);

        if (clean) {
          let pages = null;
          if (rawPages) {
            try {
              pages = JSON.parse(decodeURIComponent(rawPages));
            } catch {}
          }
          handleSaveToken(clean, pages);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          alert('🎉 Đã đồng bộ Token & Fanpage thành công sang điện thoại!');
        }
      } catch (e) {
        console.warn('Sync hash parse error:', e);
      }
    }
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleSaveToken = (newToken, loadedPages = null) => {
    const clean = cleanFacebookToken(newToken);
    setFbToken(clean);
    try {
      localStorage.setItem('metapost_fb_token', clean);
      localStorage.setItem('metapost_is_permanent', 'true');
      if (loadedPages && Array.isArray(loadedPages) && loadedPages.length > 0) {
        localStorage.setItem('metapost_pages_cache', JSON.stringify(loadedPages));
      } else {
        localStorage.removeItem('metapost_pages_cache');
      }
      localStorage.removeItem('metapost_inbox_cache');
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  };

  return (
    <div className="h-full h-[100dvh] w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans fixed inset-0">
      {/* Top Main Navigation Header (Always accessible across Mobile & Desktop, safe from iPhone Notch) */}
      <header className={`${isFocusMode ? 'hidden' : 'flex'} flex-col justify-center flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 pt-[env(safe-area-inset-top,0px)] z-30`}>
        <div className="h-[48px] sm:h-[56px] w-full px-2.5 sm:px-4 lg:px-6 flex items-center justify-between">
        {/* Left: Brand Logo & Module Tabs */}
        <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
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
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-smooth ${
                activeTab === 'inbox'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <span className="hidden sm:inline">CRM Inbox Pro</span>
              <span className="sm:hidden">Inbox</span>
            </button>
            <button
              onClick={() => setActiveTab('post')}
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-smooth ${
                activeTab === 'post'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <span className="hidden sm:inline">Đăng Bài Đa Page</span>
              <span className="sm:hidden">Đăng bài</span>
            </button>
            <button
              onClick={() => setActiveTab('ads')}
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-smooth ${
                activeTab === 'ads'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
              <span className="hidden sm:inline">Báo Cáo Ads</span>
              <span className="sm:hidden">Ads</span>
            </button>
          </nav>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Online status indicator */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span>Đang có mặt</span>
          </div>

          {/* Notification & Sound Toggle button */}
          <button
            onClick={handleToggleNotification}
            className={`p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-smooth ${
              notifPermission === 'granted'
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100'
                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title="Bật chuông & Thông báo tin nhắn màn hình khóa"
          >
            {notifPermission === 'granted' ? (
              <BellRing className="w-3.5 h-3.5 text-blue-500" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
            <span className="hidden lg:inline">{notifPermission === 'granted' ? 'Chuông Bật' : 'Bật Chuông'}</span>
          </button>

          {/* Token Config button */}
          <button
            onClick={() => setIsTokenModalOpen(true)}
            className={`p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-smooth ${
              fbToken
                ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                : 'bg-amber-500 text-white border-amber-600 animate-bounce'
            }`}
            title="Quản lý Facebook Token"
          >
            <Key className="w-3.5 h-3.5 text-amber-500" />
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
            className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-smooth"
            title="Đổi giao diện Sáng / Tối"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />}
          </button>
        </div>
        </div>
      </header>

      {/* Floating Focus Mode Expand Button (When header is collapsed on Desktop) */}
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
            fbToken={fbToken}
            onOpenTokenModal={() => setIsTokenModalOpen(true)}
          />
        ) : activeTab === 'post' ? (
          <PostStudio
            fbToken={fbToken}
          />
        ) : (
          <AdsStudio
            fbToken={fbToken}
            onOpenTokenModal={() => setIsTokenModalOpen(true)}
          />
        )}

        {/* Token Modal */}
        {isTokenModalOpen && (
          <TokenModal
            currentToken={fbToken}
            onClose={() => setIsTokenModalOpen(false)}
            onSave={handleSaveToken}
          />
        )}
      </Suspense>
    </div>
  );
}
