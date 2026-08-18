import React, { useState, useMemo, memo } from 'react';
import {
  Search,
  MessageSquare,
  MessagesSquare,
  CheckCircle2,
  Star,
  Archive,
  AlertTriangle,
  Tag,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Key,
  Edit3
} from 'lucide-react';
import { getInitials, getAvatarColor, formatTimeAgo, getPageDisplayName } from '../../services/facebookApi';
import CustomerAvatar from '../common/CustomerAvatar';

// ⚡ Memoized Conversation Card for 60/120fps smooth scrolling
const ConversationCard = memo(function ConversationCard({
  conv,
  isActive,
  isAllPages,
  pageDisplayName,
  onSelect
}) {
  const isUnread = conv.unread_count > 0;
  const isStarred = conv.is_starred || conv.status === 'starred';

  return (
    <div
      onClick={onSelect}
      className={`group flex items-start gap-3.5 p-3.5 cursor-pointer transition-smooth relative gpu-layer conversation-card-layer ${
        isActive
          ? 'bg-blue-50/90 dark:bg-blue-950/50 border-l-4 border-l-brand-500'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
      }`}
    >
      {/* Avatar with fallback */}
      <div className="relative flex-shrink-0">
        <CustomerAvatar
          url={conv.avatar_url}
          name={conv.customer_name}
          size="w-12 h-12"
          textClass="text-sm font-bold"
        />

        <span
          className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white border-2 border-white dark:border-slate-900 ${
            conv.conversation_type === 'messenger' ? 'bg-blue-600' : 'bg-emerald-600'
          }`}
        >
          {conv.conversation_type === 'messenger' ? '⚡' : '💬'}
        </span>
      </div>

      {/* Body info (Clear 15px font) */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1 mb-1">
          <h4 className={`text-[15px] truncate flex items-center gap-1.5 ${isUnread ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>
            {conv.customer_name}
            {isStarred && <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" />}
          </h4>
          <span className="text-xs text-slate-400 font-medium flex-shrink-0">
            {formatTimeAgo(conv.last_message_at)}
          </span>
        </div>

        <p className={`text-[13.5px] truncate leading-normal ${isUnread ? 'font-semibold text-slate-900 dark:text-slate-100' : 'font-normal text-slate-500 dark:text-slate-400'}`}>
          {conv.snippet || '...'}
        </p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {isAllPages && (
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[150px] border border-slate-200/60 dark:border-slate-700/60">
              {pageDisplayName || conv.page_name}
            </span>
          )}
          {(conv.labels || []).slice(0, 3).map((l, idx) => (
            <span
              key={idx}
              className="px-2.5 py-0.5 rounded-md text-[11.5px] font-bold text-white shadow-xs truncate max-w-[120px]"
              style={{ background: l.color || '#10b981' }}
            >
              {l.emoji || '🏷️'} {l.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
});

export default function ConversationSidebar({
  pages,
  allPages = [],
  visiblePageIds = [],
  onOpenPageManager,
  selectedPageId,
  onSelectPage,
  conversations,
  activeConversation,
  onSelectConversation,
  channelFilter,
  onChannelFilterChange,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
  selectedLabelId,
  onSelectLabel,
  allLabels,
  onOpenLabelsManager,
  onRefresh,
  isLoading,
  onMarkAllAsRead,
  onOpenTokenModal,
  onLoadMore,
  isLoadingMore,
  hasMore = true,
  activeTab,
  onSwitchTab
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [pageNicknames, setPageNicknames] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('metapost_page_nicknames') || '{}');
    } catch {
      return {};
    }
  });

  const handleEditNickname = () => {
    if (selectedPageId === 'all') return;
    const targetPage = pages.find(p => p.id === selectedPageId);
    if (!targetPage) return;
    const currentNick = pageNicknames[selectedPageId] || '';
    const newNick = window.prompt(
      `Đặt biệt danh phân biệt cho Fanpage "${targetPage.name}":\n(Ví dụ: "Page Chính", "Page Phụ", "Page 15k Like")`,
      currentNick
    );
    if (newNick !== null) {
      const updated = { ...pageNicknames, [selectedPageId]: newNick.trim() };
      if (!newNick.trim()) delete updated[selectedPageId];
      setPageNicknames(updated);
      localStorage.setItem('metapost_page_nicknames', JSON.stringify(updated));
    }
  };

  const hasActiveFilter = Boolean(
    searchQuery.trim() ||
    channelFilter !== 'all' ||
    statusFilter !== 'all' ||
    selectedLabelId
  );

  const handleClearFilters = () => {
    onSearchChange('');
    onChannelFilterChange('all');
    onStatusFilterChange('all');
    onSelectLabel(null);
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      if (selectedPageId !== 'all' && conv.page_id !== selectedPageId) return false;
      if (channelFilter !== 'all' && conv.conversation_type !== channelFilter) return false;

      if (statusFilter === 'unread' && conv.unread_count === 0) return false;
      if (statusFilter === 'starred' && !conv.is_starred && conv.status !== 'starred') return false;
      if (statusFilter === 'done' && conv.status !== 'done' && conv.status !== 'closed') return false;
      if (statusFilter === 'archived' && conv.status !== 'archived') return false;
      if (statusFilter === 'spam' && conv.status !== 'spam') return false;
      if (statusFilter === 'open' && (conv.status === 'done' || conv.status === 'closed' || conv.status === 'archived' || conv.status === 'spam')) return false;

      if (selectedLabelId && !conv.labels?.some(l => l.id === selectedLabelId)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = conv.customer_name?.toLowerCase().includes(q);
        const matchSnippet = conv.snippet?.toLowerCase().includes(q);
        if (!matchName && !matchSnippet) return false;
      }

      return true;
    });
  }, [conversations, selectedPageId, channelFilter, statusFilter, selectedLabelId, searchQuery]);

  const unreadTotal = conversations.filter(c => c.unread_count > 0).length;

  return (
    <aside className="w-full h-full flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Compact Header — Only Page Selector & Action Icons */}
      <div className="p-2 sm:p-2.5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900 z-10 space-y-1.5">
        {/* Mobile-Only Top Navigation Strip */}
        <div className="flex md:hidden items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-xs text-brand-600 dark:text-brand-400">TAStore68</span>
            <span className="px-1.5 py-0.2 rounded bg-brand-50 dark:bg-brand-950 text-[10px] font-black text-brand-600 border border-brand-200/50">PRO</span>
          </div>

          <div className="flex items-center gap-1">
            {onSwitchTab && (
              <>
                <button
                  type="button"
                  onClick={() => onSwitchTab('post')}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 flex items-center gap-1"
                  title="Chuyển sang Đăng Bài Đa Page"
                >
                  <span>📝 Đăng bài</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchTab('ads')}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:bg-slate-200 flex items-center gap-1"
                  title="Chuyển sang Báo Cáo Ads"
                >
                  <span>📊 Ads</span>
                </button>
              </>
            )}
            {onOpenTokenModal && (
              <button
                type="button"
                onClick={onOpenTokenModal}
                className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-amber-500 hover:bg-slate-200"
                title="Quản lý Token"
              >
                <Key className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5">
          {/* Page Dropdown */}
          <div className="relative flex-1 min-w-0">
            <select
              value={selectedPageId}
              onChange={(e) => onSelectPage(e.target.value)}
              className="w-full pl-3 pr-7 py-2 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none transition-smooth truncate cursor-pointer"
            >
              <option value="all">📂 Tất cả Fanpage ({pages.length})</option>
              {pages.map(p => (
                <option key={p.id} value={p.id}>
                  🚩 {getPageDisplayName(p, pages, pageNicknames)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>

          {/* Quick Nickname Edit */}
          {selectedPageId !== 'all' && (
            <button
              onClick={handleEditNickname}
              className="p-2 rounded-xl text-slate-500 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-smooth flex-shrink-0"
              title="Đặt biệt danh cho Page này"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}

          {/* Page Visibility Manager Button (⚙️ Ẩn/Hiện Trang) */}
          <button
            onClick={onOpenPageManager}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-smooth flex-shrink-0"
            title="Quản lý Ẩn/Hiện các Fanpage hoạt động"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Toggle Search & Filters Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-xl border transition-smooth relative flex-shrink-0 ${
              showFilters || hasActiveFilter
                ? 'bg-brand-500 text-white border-brand-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
            title={showFilters ? 'Ẩn bộ lọc' : 'Mở tìm kiếm & lọc tin nhắn'}
          >
            <Search className="w-4 h-4" />
            {hasActiveFilter && !showFilters && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 animate-pulse"></span>
            )}
          </button>

          {/* Refresh Messages Button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={`p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-smooth flex-shrink-0 ${isLoading ? 'animate-spin text-brand-500' : ''}`}
            title="Làm mới tin nhắn"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Collapsible Search & Filter Panel (Only shown when user clicks 🔍 Filter button) */}
        {showFilters && (
          <div className="pt-2 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150 border-t border-slate-100 dark:border-slate-800">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên khách hàng, nội dung..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-smooth"
              />
            </div>

            {/* Channel Switcher */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400">
              <button
                onClick={() => onChannelFilterChange('all')}
                className={`py-1.5 rounded-lg text-center transition-smooth ${channelFilter === 'all' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-sm font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`}
              >
                Tất cả
              </button>
              <button
                onClick={() => onChannelFilterChange('messenger')}
                className={`py-1.5 rounded-lg text-center flex items-center justify-center gap-1 transition-smooth ${channelFilter === 'messenger' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-sm font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> Inbox
              </button>
              <button
                onClick={() => onChannelFilterChange('comment')}
                className={`py-1.5 rounded-lg text-center flex items-center justify-center gap-1 transition-smooth ${channelFilter === 'comment' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-sm font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`}
              >
                <MessagesSquare className="w-3.5 h-3.5 text-emerald-500" /> Comment
              </button>
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs touch-scroll-x overscroll-x-contain">
              <button
                onClick={() => onStatusFilterChange('all')}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition-smooth flex-shrink-0 ${statusFilter === 'all' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
              >
                Tất cả
              </button>
              <button
                onClick={() => onStatusFilterChange('unread')}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium flex items-center gap-1.5 transition-smooth flex-shrink-0 ${statusFilter === 'unread' ? 'bg-brand-500 text-white font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
              >
                <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 animate-pulse"></span>
                Chưa đọc
                {unreadTotal > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${statusFilter === 'unread' ? 'bg-white text-brand-600' : 'bg-brand-500 text-white'}`}>
                    {unreadTotal}
                  </span>
                )}
              </button>
              <button
                onClick={() => onStatusFilterChange('open')}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition-smooth flex-shrink-0 ${statusFilter === 'open' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
              >
                Đang mở
              </button>
              <button
                onClick={() => onStatusFilterChange('starred')}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium flex items-center gap-1 transition-smooth flex-shrink-0 ${statusFilter === 'starred' ? 'bg-amber-500 text-white font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
              >
                <Star className="w-3.5 h-3.5 fill-current" /> Gắn sao
              </button>
              <button
                onClick={() => onStatusFilterChange('done')}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium flex items-center gap-1 transition-smooth flex-shrink-0 ${statusFilter === 'done' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã xong
              </button>
              <button
                onClick={() => onStatusFilterChange('spam')}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium flex items-center gap-1 transition-smooth flex-shrink-0 ${statusFilter === 'spam' ? 'bg-red-600 text-white font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Spam
              </button>
            </div>

            {/* Reset Filters action */}
            {hasActiveFilter && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-[11px] font-bold text-red-500 hover:underline"
                >
                  ✕ Xóa toàn bộ bộ lọc
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversations List (Touch-scroll-y) — Maximum Vertical Space */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 touch-scroll-y overscroll-contain">
        {pages.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center mb-3">
              <Key className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Chưa tải được Fanpage</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
              Hãy kiểm tra lại Facebook Token hoặc bấm nút bên dưới để dán lại Token.
            </p>
            {onOpenTokenModal && (
              <button
                onClick={onOpenTokenModal}
                className="mt-3 px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold shadow-md shadow-brand-500/20 hover:bg-brand-600 transition-smooth"
              >
                🔑 Cấu hình Token Facebook
              </button>
            )}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <MessageSquare className="w-12 h-12 stroke-[1.5] mb-2.5 opacity-50" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Không có cuộc trò chuyện nào</p>
            <p className="text-xs text-slate-400 mt-0.5">Thử chọn thư mục khác hoặc đổi từ khóa tìm kiếm</p>
          </div>
        ) : (
          filteredConversations.map(conv => (
            <ConversationCard
              key={conv.fb_conversation_id}
              conv={conv}
              isActive={activeConversation?.fb_conversation_id === conv.fb_conversation_id}
              isAllPages={selectedPageId === 'all'}
              pageDisplayName={getPageDisplayName(conv.page_id, pages, pageNicknames) || conv.page_name}
              onSelect={() => onSelectConversation(conv)}
            />
          ))
        )}

        {/* Load More Button */}
        {conversations.length >= 20 && hasMore && onLoadMore && (
          <div className="p-3 text-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 transition-smooth flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {isLoadingMore ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></span>
                  <span>Đang tải tin nhắn cũ hơn...</span>
                </>
              ) : (
                <>
                  <span>📥 Tải thêm 50 hội thoại cũ hơn</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs sm:text-[13px] text-slate-500 font-semibold bg-slate-50/50 dark:bg-slate-800/30 gap-2">
        <span>Tổng: {conversations.length}</span>
        {unreadTotal > 0 ? (
          <button
            onClick={onMarkAllAsRead}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 font-bold hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors text-xs shadow-xs"
          >
            ✓ Đã đọc tất cả ({unreadTotal})
          </button>
        ) : (
          <span className="text-emerald-500">✓ Đã đọc hết</span>
        )}
      </div>
    </aside>
  );
}
