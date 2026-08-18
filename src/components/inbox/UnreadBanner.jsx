import React, { useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  ExternalLink,
  Inbox,
  CheckCheck
} from 'lucide-react';

export default function UnreadBanner({
  unreadSummary, // { total, perPage: [{ pageId, pageName, pagePicture, unreadCount, totalConversations }] }
  isScanning,
  onPageClick, // (pageId) => switch page + filter unread
  onMarkAllAsRead,
  onDismiss
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!unreadSummary) return null;

  const { total, perPage } = unreadSummary;
  const pagesWithUnread = perPage.filter(p => p.unreadCount > 0);

  // All caught up state
  if (total === 0 && !isScanning) {
    return (
      <div className="mx-3 mt-3 mb-1 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-2.5 select-none">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
          <CheckCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
            Tất cả đã đọc ✓
          </p>
          <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70">
            Không có tin nhắn chưa trả lời từ {perPage.length} page
          </p>
        </div>
      </div>
    );
  }

  // Scanning state
  if (isScanning) {
    return (
      <div className="mx-3 mt-3 mb-1 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 flex items-center gap-2.5 select-none animate-pulse">
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
          <Inbox className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-bounce" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
            Đang quét tin nhắn chưa đọc...
          </p>
          <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70">
            Kiểm tra {perPage.length || '...'} page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 mt-3 mb-1 select-none">
      {/* Main Banner - Clickable Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 rounded-xl bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20 border border-red-200/60 dark:border-red-800/40 flex items-center gap-2.5 hover:shadow-md transition-all duration-200 group"
      >
        {/* Bell Icon with Badge */}
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Bell className="w-4.5 h-4.5 text-red-600 dark:text-red-400" />
          </div>
          {/* Count Badge */}
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black shadow-lg shadow-red-500/30 animate-pulse">
            {total > 99 ? '99+' : total}
          </span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[13px] font-extrabold text-red-700 dark:text-red-300 leading-tight">
            {total} tin nhắn chưa trả lời
          </p>
          <p className="text-[11px] text-red-600/70 dark:text-red-400/60 leading-tight mt-0.5">
            Từ {pagesWithUnread.length}/{perPage.length} page
          </p>
        </div>

        {/* Mark All Read Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMarkAllAsRead?.();
          }}
          className="px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 text-[11px] font-bold text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"
          title="Đánh dấu tất cả đã đọc"
        >
          ✓ Đã đọc
        </button>

        {/* Expand Arrow */}
        {isExpanded
          ? <ChevronUp className="w-4 h-4 text-red-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-red-400 flex-shrink-0" />
        }
      </button>

      {/* Expanded Page List */}
      {isExpanded && (
        <div className="mt-1.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 overflow-hidden shadow-lg shadow-slate-200/40 dark:shadow-black/20 animate-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Chi tiết theo Page
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Bấm để lọc
            </span>
          </div>

          {/* Page Items */}
          <div className="max-h-[200px] overflow-y-auto">
            {perPage
              .sort((a, b) => b.unreadCount - a.unreadCount)
              .map((page) => (
                <button
                  key={page.pageId}
                  onClick={() => {
                    onPageClick(page.pageId);
                    setIsExpanded(false);
                  }}
                  disabled={page.unreadCount === 0}
                  className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left transition-all duration-150 border-b border-slate-50 dark:border-slate-800 last:border-0 ${
                    page.unreadCount > 0
                      ? 'hover:bg-red-50/60 dark:hover:bg-red-950/20 cursor-pointer'
                      : 'opacity-50 cursor-default'
                  }`}
                >
                  {/* Page Avatar */}
                  <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-700 border border-slate-200/60 dark:border-slate-600/60">
                    {page.pagePicture ? (
                      <img
                        src={page.pagePicture}
                        alt={page.pageName}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-slate-500">
                        {page.pageName?.charAt(0) || 'P'}
                      </div>
                    )}
                  </div>

                  {/* Page Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">
                      {page.pageName}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {page.totalConversations} hội thoại
                    </p>
                  </div>

                  {/* Unread Badge */}
                  {page.unreadCount > 0 ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-black">
                        {page.unreadCount}
                      </span>
                      <ExternalLink className="w-3 h-3 text-red-400" />
                    </div>
                  ) : (
                    <span className="text-[10px] text-emerald-500 font-bold flex-shrink-0">
                      ✓ OK
                    </span>
                  )}
                </button>
              ))}
          </div>

          {/* Footer: View All Unread */}
          {pagesWithUnread.length > 1 && (
            <button
              onClick={() => {
                onPageClick('all');
                setIsExpanded(false);
              }}
              className="w-full px-3 py-2.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-center gap-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/20 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Xem tất cả chưa đọc ({total})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
