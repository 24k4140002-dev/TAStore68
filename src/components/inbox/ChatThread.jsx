import React, { useState, useEffect, useRef } from 'react';
import { getChatImageSize } from '../../utils/chatImageSize';
import {
  Send,
  Image,
  Paperclip,
  Smile,
  CheckCircle2,
  Star,
  Mail,
  Archive,
  AlertTriangle,
  ExternalLink,
  Clock,
  Lock,
  MessagesSquare,
  MessageSquare,
  ShieldCheck,
  ChevronDown,
  X,
  Sparkles,
  ArrowLeft,
  Info,
  Zap,
  QrCode,
  ThumbsUp,
  Share2,
  FileText
} from 'lucide-react';
import {
  compressImage,
  formatDateTime,
  sendMessengerMessage,
  sendCommentReply,
  sendPrivateReply,
  isSticker,
  DEFAULT_QUICK_REPLIES
} from '../../services/facebookApi';
import {
  canStartMobileSwipeBack,
  getMobileSwipeBackOffset,
  shouldCompleteMobileSwipeBack
} from '../../utils/swipeBack';
import CustomerAvatar from '../common/CustomerAvatar';

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateDivider(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return 'Hôm nay';
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' });
}

function isDifferentDay(d1, d2) {
  if (!d1 || !d2) return true;
  return new Date(d1).toDateString() !== new Date(d2).toDateString();
}

export default function ChatThread({
  conversation,
  messages,
  isLoadingMessages,
  messageLoadError = '',
  onRetryMessages,
  onSendMessage,
  onUpdateStatus,
  onToggleStar,
  onOpenMediaModal,
  onBackToList,
  onToggleProfilePanel,
  quickReplies = DEFAULT_QUICK_REPLIES,
  onOpenQuickRepliesModal,
  onOpenVietQRModal,
  onLoadOlderMessages,
  hasMoreOlderMessages,
  isLoadingOlderMessages
}) {
  const [replyText, setReplyText] = useState('');
  const [replyMode, setReplyMode] = useState('messenger');
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedFilePreview, setAttachedFilePreview] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [actionNotice, setActionNotice] = useState(null);
  const [isSyncingMetaAction, setIsSyncingMetaAction] = useState(false);
  const [swipeBackOffset, setSwipeBackOffset] = useState(0);
  const [shortcutQuery, setShortcutQuery] = useState(null);
  const fileInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const prevLengthRef = useRef(messages.length);
  const swipeBackStartRef = useRef(null);

  useEffect(() => {
    setActionNotice(null);
    setSendError('');
    setSwipeBackOffset(0);
    swipeBackStartRef.current = null;
  }, [conversation?.fb_conversation_id]);

  const handleSwipeBackStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch || !canStartMobileSwipeBack({
      startX: touch.clientX,
      viewportWidth: window.innerWidth,
      touchCount: event.touches.length
    })) return;

    swipeBackStartRef.current = { x: touch.clientX, y: touch.clientY };
    setSwipeBackOffset(0);
  };

  const handleSwipeBackMove = (event) => {
    const startPoint = swipeBackStartRef.current;
    const touch = event.touches?.[0];
    if (!startPoint || !touch) return;
    setSwipeBackOffset(getMobileSwipeBackOffset(startPoint, { x: touch.clientX, y: touch.clientY }));
  };

  const finishSwipeBack = (event) => {
    const startPoint = swipeBackStartRef.current;
    const touch = event.changedTouches?.[0];
    swipeBackStartRef.current = null;
    setSwipeBackOffset(0);
    if (startPoint && touch && shouldCompleteMobileSwipeBack(
      startPoint,
      { x: touch.clientX, y: touch.clientY }
    )) {
      onBackToList?.();
    }
  };

  useEffect(() => {
    // Maintain scroll position when older messages are prepended to top
    if (scrollContainerRef.current && prevScrollHeightRef.current > 0) {
      const diff = scrollContainerRef.current.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) {
        scrollContainerRef.current.scrollTop = diff;
      }
      prevScrollHeightRef.current = 0;
      prevLengthRef.current = messages.length;
      return;
    }

    // Only auto-scroll to bottom on first load or when sending/receiving new message at bottom
    if (messages.length > prevLengthRef.current && !isLoadingOlderMessages) {
      const container = scrollContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    }
    prevLengthRef.current = messages.length;
  }, [messages, isLoadingOlderMessages]);

  const handleScroll = (e) => {
    const container = e.currentTarget;
    if (container.scrollTop < 80 && hasMoreOlderMessages && !isLoadingOlderMessages && onLoadOlderMessages) {
      prevScrollHeightRef.current = container.scrollHeight;
      onLoadOlderMessages();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) await prepareAttachedFile(file);
    e.target.value = '';
  };

  const prepareAttachedFile = async (file) => {
    if (!file) return false;
    if (file.size > 25 * 1024 * 1024) {
      setSendError('Ảnh/tệp vượt quá 25 MB nên Meta không thể nhận.');
      return false;
    }
    setSendError('');
    setReplyMode('messenger');
    const preparedFile = file.type.startsWith('image/')
      ? await compressImage(file, 2048, 0.88)
      : file;
    setAttachedFile(preparedFile);
    setAttachedFilePreview(previousPreview => {
      if (previousPreview) URL.revokeObjectURL(previousPreview);
      return preparedFile.type.startsWith('image/') ? URL.createObjectURL(preparedFile) : null;
    });
    return true;
  };

  const handlePaste = async (event) => {
    const imageItem = [...(event.clipboardData?.items || [])].find(item => item.type?.startsWith('image/'));
    if (!imageItem) return;
    const pastedBlob = imageItem.getAsFile();
    if (!pastedBlob) return;
    event.preventDefault();
    const extension = pastedBlob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const pastedFile = new File([pastedBlob], `anh-dan-${Date.now()}.${extension}`, {
      type: pastedBlob.type || 'image/png',
      lastModified: Date.now()
    });
    await prepareAttachedFile(pastedFile);
  };

  const handleRemoveFile = () => {
    if (attachedFilePreview) URL.revokeObjectURL(attachedFilePreview);
    setAttachedFile(null);
    setAttachedFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (textToSend = null) => {
    const finalContent = textToSend !== null ? textToSend : replyText.trim();
    if (!finalContent && !attachedFile) return;
    if (attachedFile && replyMode !== 'messenger') {
      setReplyMode('messenger');
      setSendError('Ảnh/tệp chỉ gửi trực tiếp qua Messenger. Mình đã chuyển về chế độ Messenger, bạn bấm gửi lại nhé.');
      return;
    }

    setIsSending(true);
    setSendError('');
    try {
      if (onSendMessage) {
        await onSendMessage({
          text: finalContent,
          file: attachedFile,
          mode: replyMode
        });
      }
      setReplyText('');
      handleRemoveFile();
    } catch (err) {
      if (err.textSent) setReplyText('');
      setSendError(err.message || 'Không thể gửi tin nhắn qua Meta.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendLike = () => {
    handleSend('👍');
  };

  const handleMetaAction = async (action, messages = {}) => {
    if (isSyncingMetaAction) return;
    setIsSyncingMetaAction(true);
    setSendError('');
    setActionNotice(null);
    try {
      const result = await action();
      if (result?.metaSynced === true) {
        setActionNotice({ tone: 'success', text: messages.synced });
      } else if (result?.localSaved) {
        setActionNotice({ tone: 'warning', text: messages.localOnly });
      }
    } catch (error) {
      setSendError(error.message || 'Meta chưa xác nhận thay đổi.');
    } finally {
      setIsSyncingMetaAction(false);
    }
  };

  if (!conversation) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-brand-500 shadow-card mb-3">
          <MessagesSquare className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Chọn một cuộc trò chuyện để xem</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Chọn Messenger hoặc Bình luận từ danh sách bên trái để phản hồi khách hàng và quản lý đơn hàng.
        </p>
      </main>
    );
  }

  const isDone = conversation.status === 'done' || conversation.status === 'closed';
  const isStarred = conversation.is_starred || conversation.status === 'starred';

  const handleTextChange = (e) => {
    const val = e.target.value;
    setReplyText(val);

    // Check for shortcut starting with '/'
    const lastSlashIdx = val.lastIndexOf('/');
    if (lastSlashIdx !== -1 && (lastSlashIdx === 0 || val[lastSlashIdx - 1] === ' ' || val[lastSlashIdx - 1] === '\n')) {
      const query = val.slice(lastSlashIdx);
      if (!query.includes(' ') && query.length <= 15) {
        setShortcutQuery({ query, slashIdx: lastSlashIdx });
        return;
      }
    }
    setShortcutQuery(null);
  };

  const handleSelectShortcut = (reply) => {
    if (shortcutQuery) {
      const prefix = replyText.slice(0, shortcutQuery.slashIdx);
      const suffix = replyText.slice(shortcutQuery.slashIdx + shortcutQuery.query.length);
      setReplyText(prefix + reply.text + suffix);
      setShortcutQuery(null);
    } else {
      setReplyText(reply.text);
    }
  };

  const matchingReplies = shortcutQuery
    ? quickReplies.filter(r =>
        r.shortcut.toLowerCase().includes(shortcutQuery.query.toLowerCase()) ||
        r.title.toLowerCase().includes(shortcutQuery.query.toLowerCase().replace('/', ''))
      )
    : [];

  return (
    <main
      className="flex-1 min-h-0 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950/40 relative overflow-hidden"
      onTouchStart={handleSwipeBackStart}
      onTouchMove={handleSwipeBackMove}
      onTouchEnd={finishSwipeBack}
      onTouchCancel={() => {
        swipeBackStartRef.current = null;
        setSwipeBackOffset(0);
      }}
      style={{ transform: swipeBackOffset > 0 ? `translateX(${swipeBackOffset}px)` : undefined }}
    >
      {swipeBackOffset > 0 && (
        <div
          className="pointer-events-none fixed left-3 top-1/2 z-50 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl md:hidden"
          style={{ opacity: Math.min(1, 0.35 + swipeBackOffset / 100) }}
        >
          <ArrowLeft className="h-5 w-5" />
        </div>
      )}
      {/* Header (Solid background & touch-friendly with iPhone Notch safe area) */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10 flex-shrink-0 pt-[env(safe-area-inset-top,0px)] md:pt-0">
        <div className="h-14 sm:h-16 px-3 sm:px-4 lg:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {/* Mobile Back Button (Large 44px tap target) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBackToList && onBackToList();
            }}
            className="md:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 flex-shrink-0 cursor-pointer shadow-xs active:scale-95 transition-transform"
            title="Quay lại danh sách"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Customer Avatar */}
          <div className="relative flex-shrink-0">
            <CustomerAvatar
              url={conversation.avatar_url}
              name={conversation.customer_name}
              size="w-9 h-9 sm:w-10 sm:h-10"
              textClass="text-xs sm:text-sm font-bold"
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] text-white border border-white dark:border-slate-900 ${
                conversation.conversation_type === 'messenger' ? 'bg-blue-600' : 'bg-emerald-600'
              }`}
            >
              {conversation.conversation_type === 'messenger' ? '⚡' : '💬'}
            </span>
          </div>

          {/* Customer Name & Page info */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {conversation.customer_name}
              </h3>
              {conversation.unread_count > 0 && (
                <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0"></span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate mt-0.2">
              {conversation.page_name} • {conversation.conversation_type === 'messenger' ? 'Messenger' : 'Bình luận'}
              {conversation.read_sync_state === 'pending' && ' • Đang đối chiếu đã đọc…'}
              {(conversation.read_sync_state === 'failed' || conversation.read_sync_state === 'unconfirmed') && ' • Meta chưa xác nhận đã đọc'}
            </p>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => handleMetaAction(
              () => onToggleStar(conversation.fb_conversation_id),
              conversation.is_starred
                ? {
                    synced: 'Đã gỡ nhãn Cần theo dõi trong app và trên Meta.',
                    localOnly: 'Đã gỡ Theo dõi trong app.'
                  }
                : {
                    synced: 'Đã bật Theo dõi trong app và gắn nhãn tùy chỉnh trên Meta.',
                    localOnly: 'Đã bật Theo dõi trong app; Meta chưa nhận nhãn tùy chỉnh.'
                  }
            )}
            disabled={isSyncingMetaAction}
            className={`p-2 rounded-xl border transition-smooth ${
              conversation.is_starred
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-500 border-amber-200 dark:border-amber-800'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'
            }`}
            title={conversation.is_starred ? 'Gỡ Theo dõi trong app' : 'Theo dõi trong app và thử gắn nhãn Meta'}
          >
            <Star className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={() => handleMetaAction(
              () => onUpdateStatus(conversation.fb_conversation_id, conversation.status === 'done' ? 'active' : 'done'),
              conversation.status === 'done'
                ? {
                    synced: 'Đã mở lại trong app và gỡ nhãn tùy chỉnh trên Meta.',
                    localOnly: 'Đã mở lại cuộc trò chuyện trong app.'
                  }
                : {
                    synced: 'Đã xử lý trong app và gắn nhãn tùy chỉnh trên Meta.',
                    localOnly: 'Đã xử lý trong app; Meta chưa nhận nhãn tùy chỉnh.'
                  }
            )}
            disabled={isSyncingMetaAction}
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1 sm:gap-1.5 border transition-smooth ${
              conversation.status === 'done'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
            }`}
            title="Đánh dấu trong app và thử đồng bộ nhãn tùy chỉnh Meta"
          >
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{conversation.status === 'done' ? 'Đã xử lý trong app' : 'Xử lý trong app'}</span>
          </button>

          <button
            onClick={onToggleProfilePanel}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-smooth"
            title="Hồ sơ & Đơn hàng"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
        </div>
      </div>

      {messageLoadError && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">{messageLoadError}</span>
          {onRetryMessages && (
            <button
              type="button"
              onClick={onRetryMessages}
              className="rounded-lg border border-amber-300 bg-white px-2 py-1 font-bold dark:border-amber-700 dark:bg-slate-900"
            >
              Thử lại
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area (With Messenger-style Consecutive Grouping & Infinite Scroll) */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-1 touch-scroll-y overscroll-contain"
      >
        {isLoadingMessages ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs font-semibold">Đang tải tin nhắn...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
            <MessageSquare className="w-12 h-12 stroke-[1.5] mb-2.5 opacity-50" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">Chưa có tin nhắn nào</p>
            <p className="text-xs text-slate-400 mt-1">Bắt đầu trò chuyện với khách hàng ở khung bên dưới</p>
          </div>
        ) : (
          <>
            {/* Top Loading Indicator on Scroll Up */}
            {isLoadingOlderMessages && (
              <div className="flex justify-center py-2">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {messages.map((msg, idx) => {
            const isFromPage = msg.from?.id === conversation.page_id;
            const prevMsg = messages[idx - 1];
            const nextMsg = messages[idx + 1];

            // Date divider check
            const showDateDivider = !prevMsg || isDifferentDay(prevMsg.created_time, msg.created_time);

            // Grouping calculations (within 5 minutes)
            const isPrevSame = prevMsg && (prevMsg.from?.id === msg.from?.id) && !isDifferentDay(prevMsg.created_time, msg.created_time) && ((new Date(msg.created_time) - new Date(prevMsg.created_time)) < 300000);
            const isNextSame = nextMsg && (nextMsg.from?.id === msg.from?.id) && !isDifferentDay(nextMsg.created_time, msg.created_time) && ((new Date(nextMsg.created_time) - new Date(msg.created_time)) < 300000);

            const isGroupStart = !isPrevSame;
            const isGroupEnd = !isNextSame;
            const isSingle = isGroupStart && isGroupEnd;

            // Rounded corner classes matching Facebook Messenger
            let bubbleRoundClass = 'rounded-2xl';
            if (isFromPage) {
              if (isSingle) bubbleRoundClass = 'rounded-2xl rounded-br-xs';
              else if (isGroupStart) bubbleRoundClass = 'rounded-2xl rounded-br-md';
              else if (isGroupEnd) bubbleRoundClass = 'rounded-2xl rounded-tr-md rounded-br-xs';
              else bubbleRoundClass = 'rounded-2xl rounded-r-md';
            } else {
              if (isSingle) bubbleRoundClass = 'rounded-2xl rounded-bl-xs';
              else if (isGroupStart) bubbleRoundClass = 'rounded-2xl rounded-bl-md';
              else if (isGroupEnd) bubbleRoundClass = 'rounded-2xl rounded-tl-md rounded-bl-xs';
              else bubbleRoundClass = 'rounded-2xl rounded-l-md';
            }

            const isBigEmojiOrSticker = msg.message === '👍' || msg.is_sticker;

            return (
              <React.Fragment key={msg.id || idx}>
                {/* Date Divider */}
                {showDateDivider && (
                  <div className="flex items-center justify-center my-4">
                    <span className="px-3 py-1 rounded-full bg-slate-200/70 dark:bg-slate-800/80 text-[11px] font-bold text-slate-600 dark:text-slate-300 shadow-2xs">
                      {formatDateDivider(msg.created_time)}
                    </span>
                  </div>
                )}

                {/* Message Bubble Row */}
                <div
                  className={`flex gap-2 items-end max-w-[90%] sm:max-w-[80%] lg:max-w-[72%] ${
                    isFromPage ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  } ${isGroupStart ? 'mt-2.5' : 'mt-0.5'}`}
                >
                  {/* Customer Avatar (Rendered only on the last message of the group) */}
                  {!isFromPage && (
                    <div className="w-7 sm:w-8 flex-shrink-0">
                      {isGroupEnd ? (
                        <CustomerAvatar
                          url={conversation.avatar_url}
                          name={conversation.customer_name}
                          size="w-7 h-7 sm:w-8 sm:h-8"
                          textClass="text-[10px] sm:text-[11px] font-bold"
                        />
                      ) : (
                        <div className="w-7 sm:w-8 h-1" />
                      )}
                    </div>
                  )}

                  {/* Bubble Content Stack */}
                  <div className={`space-y-1 ${isFromPage ? 'items-end' : 'items-start'} flex flex-col max-w-full`}>
                    {/* Quoted Message / Referral (If present) */}
                    {msg.shares?.data?.map((share, sIdx) => (
                      <a
                        key={sIdx}
                        href={share.link}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs border border-slate-200 dark:border-slate-700 hover:border-brand-500 transition-colors block max-w-xs shadow-xs"
                      >
                        <div className="flex items-center gap-1.5 text-brand-600 dark:text-brand-400 font-bold mb-0.5">
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Bài viết được chia sẻ</span>
                        </div>
                        <p className="font-bold text-slate-900 dark:text-white truncate">
                          {share.name || 'Xem liên kết trên Facebook'}
                        </p>
                        {share.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                            {share.description}
                          </p>
                        )}
                      </a>
                    ))}

                    {/* Text Message Bubble */}
                    {msg.message && (
                      isBigEmojiOrSticker ? (
                        <div className="text-3xl sm:text-4xl py-1 px-2 select-none">
                          {msg.message}
                        </div>
                      ) : (
                        <div
                          className={`px-3.5 sm:px-4 py-2 sm:py-2.5 text-[14.5px] sm:text-[15px] leading-relaxed whitespace-pre-wrap break-words shadow-2xs ${bubbleRoundClass} ${
                            isFromPage
                              ? 'bg-brand-500 text-white font-normal'
                              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/70'
                          }`}
                        >
                          {msg.message}
                        </div>
                      )
                    )}

                    {/* Standalone Sticker (If present without attachments) */}
                    {msg.sticker && (!msg.attachments?.data || msg.attachments.data.length === 0) && (
                      <div className="py-1">
                        <img
                          src={msg.sticker}
                          alt="Sticker"
                          loading="lazy"
                          decoding="async"
                          className="w-20 h-20 sm:w-24 sm:h-24 object-contain select-none"
                        />
                      </div>
                    )}

                    {/* Attachments (Photos, Voice Audio, Videos, Documents) */}
                    {msg.attachments?.data?.map((att, aIdx) => {
                      const isStickerAtt = msg.is_sticker || att.is_sticker || att.name?.includes('sticker') || att.file_url?.includes('sticker');
                      const isImg = att.image_data || att.mime_type?.startsWith('image/') || att.file_url?.match(/\.(jpeg|jpg|png|webp|gif)/i);
                      const isAudio = att.mime_type?.startsWith('audio/') || att.file_url?.match(/\.(mp3|m4a|aac|wav|ogg)/i);
                      const isVideo = att.mime_type?.startsWith('video/') || att.video_data || att.file_url?.match(/\.(mp4|mov|webm)/i);

                      if (isStickerAtt) {
                        const imgSource = att.image_data?.url || att.file_url || msg.sticker;
                        return (
                          <div key={aIdx} className="py-1">
                            <img
                              src={imgSource}
                              alt="Sticker"
                              loading="lazy"
                              decoding="async"
                              className="w-20 h-20 sm:w-24 sm:h-24 object-contain select-none"
                            />
                          </div>
                        );
                      }

                      if (isImg) {
                        const imgSource = att.image_data?.url || att.file_url;
                        const imageSize = getChatImageSize(att.image_data);
                        return (
                          <div
                            key={aIdx}
                            onClick={() => onOpenMediaModal && onOpenMediaModal(imgSource)}
                            style={{ width: imageSize.width, maxWidth: '100%' }}
                            className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[280px] cursor-pointer hover:opacity-90 transition-opacity relative group shadow-xs"
                          >
                            <img src={imgSource} alt="Ảnh trong cuộc trò chuyện" width={imageSize.width} height={imageSize.height}
                              loading="lazy" fetchPriority="low"
                              style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}` }}
                              decoding="async" className="w-full h-auto object-contain bg-slate-50 dark:bg-slate-800" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                              🔍 Xem ảnh
                            </div>
                          </div>
                        );
                      }

                      if (isAudio) {
                        return (
                          <div key={aIdx} className="p-2 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                            <audio controls preload="metadata" src={att.file_url} className="h-8 max-w-[240px]" />
                          </div>
                        );
                      }

                      if (isVideo) {
                        return (
                          <div key={aIdx} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[280px]">
                            <video controls preload="metadata" src={att.file_url || att.video_data?.url} className="w-full h-auto max-h-72" />
                          </div>
                        );
                      }

                      return (
                        <a
                          key={aIdx}
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-brand-600 dark:text-brand-400 font-semibold border border-slate-200 dark:border-slate-700 hover:underline"
                        >
                          <FileText className="w-4 h-4" />
                          <span>{att.name || 'Tệp đính kèm'}</span>
                        </a>
                      );
                    })}

                    {/* Timestamp (Rendered cleanly only on the last message of the group) */}
                    {isGroupEnd && (
                      <div className={`text-[10px] sm:text-[11px] text-slate-400 font-medium px-1 ${isFromPage ? 'text-right' : 'text-left'}`}>
                        {msg.sending ? 'Đang gửi…' : formatMessageTime(msg.created_time)}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </>
      )}
      </div>

      {/* Bottom Reply Area (Sleek Compact iOS-style) */}
      <div className="px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5 relative flex-shrink-0">
        {/* Floating '/' Shortcut Dropdown */}
        {shortcutQuery && matchingReplies.length > 0 && (
          <div className="absolute bottom-[calc(100%+8px)] left-3 right-3 bg-white dark:bg-slate-800 border border-brand-300 dark:border-brand-700 rounded-2xl shadow-2xl p-2 z-30 max-h-64 overflow-y-auto space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="px-3 py-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 mb-1">
              <span>⚡ Mẫu câu gợi ý cho "{shortcutQuery.query}"</span>
              <span className="text-[11px] text-slate-400 font-normal">Bấm để chọn</span>
            </div>
            {matchingReplies.map(reply => (
              <button
                key={reply.id}
                type="button"
                onClick={() => handleSelectShortcut(reply)}
                className="w-full text-left p-2.5 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-950/40 flex items-start gap-2.5 transition-all group"
              >
                <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-mono font-bold text-xs border border-amber-200/60 flex-shrink-0">
                  {reply.shortcut}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-brand-600 truncate">
                    {reply.title}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Compact Tool Strip & Quick Replies (Combined in 1 sleek line) */}
        <div className="relative min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 pr-7 sm:pr-0 touch-scroll-x overscroll-x-contain">
          {/* Quick mode & tools */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setReplyMode(prev => prev === 'messenger' ? 'public_comment' : (prev === 'public_comment' ? 'private_reply' : 'messenger'))}
              className={`min-h-9 px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border transition-smooth ${
                replyMode === 'messenger'
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 border-blue-200/60'
                  : (replyMode === 'public_comment'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 border-emerald-200/60'
                      : 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 border-purple-200/60')
              }`}
              title="Bấm để đổi chế độ gửi (Messenger / Comment / Nhắn riêng)"
            >
              {replyMode === 'messenger' && <><MessageSquare className="w-3 h-3 text-blue-500" /> Messenger</>}
              {replyMode === 'public_comment' && <><MessagesSquare className="w-3 h-3 text-emerald-500" /> Comment</>}
              {replyMode === 'private_reply' && <><Lock className="w-3 h-3 text-purple-500" /> Nhắn riêng</>}
            </button>

            {onOpenVietQRModal && (
              <button
                type="button"
                onClick={onOpenVietQRModal}
                className="min-h-9 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1 border border-emerald-500/20 hover:bg-emerald-500/20 transition-smooth"
                title="Tạo mã VietQR chuyển khoản nhanh"
              >
                <QrCode className="w-3 h-3" />
                <span>VietQR</span>
              </button>
            )}

            {onOpenQuickRepliesModal && (
              <button
                type="button"
                onClick={onOpenQuickRepliesModal}
                className="w-9 h-9 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-200/40 transition-smooth flex items-center justify-center"
                title="Quản lý mẫu câu"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Suggested Reply Chips */}
          <div className="flex min-w-max items-center gap-1 pr-2">
            {quickReplies.slice(0, 5).map((qr) => (
              <button
                key={qr.id}
                type="button"
                onClick={() => handleSelectShortcut(qr)}
                className="px-2.5 py-1.5 min-h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium whitespace-nowrap transition-smooth border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1 flex-shrink-0"
              >
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-[11px]">{qr.shortcut}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white dark:from-slate-900 to-transparent sm:hidden" aria-hidden="true" />
        </div>

        {/* File attachment preview */}
        {attachedFile && (
          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {attachedFilePreview ? (
              <img src={attachedFilePreview} alt="Preview" className="w-10 h-10 object-cover rounded-lg" />
            ) : (
              <Paperclip className="w-5 h-5 text-slate-500" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{attachedFile.name}</p>
              <p className="text-[10px] text-slate-400">☁ Meta • {(attachedFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={handleRemoveFile} className="p-1 text-slate-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {sendError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p className="flex-1 leading-relaxed">{sendError}</p>
            <button
              type="button"
              onClick={() => setSendError('')}
              className="rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/50"
              aria-label="Đóng thông báo lỗi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {actionNotice?.text && (
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
            actionNotice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'
          }`}>
            {actionNotice.tone === 'success'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            <p className="flex-1 leading-relaxed">{actionNotice.text}</p>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="rounded p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
              aria-label="Đóng thông báo trạng thái"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Input box (1 row sleek with Quick Like 👍) */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative flex items-center gap-1.5 sm:gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*,video/*,.pdf"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-11 h-11 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth border border-slate-200/80 dark:border-slate-700/80 flex-shrink-0 flex items-center justify-center"
            title="Đính kèm ảnh / tệp"
          >
            <Image className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <textarea
            id="metapost-message-input"
            name="message"
            rows="1"
            placeholder="Nhập tin nhắn... (gõ '/' chọn mẫu câu)"
            value={replyText}
            onChange={handleTextChange}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 min-w-0 min-h-11 px-3.5 py-2.5 text-[16px] sm:text-[14px] leading-snug rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-smooth resize-none max-h-24"
          ></textarea>

          {/* Send Button or Quick Like 👍 */}
          {replyText.trim() || attachedFile ? (
            <button
              type="submit"
              disabled={isSending}
              className="w-11 h-11 rounded-xl bg-brand-500 hover:bg-brand-600 text-white shadow-md shadow-brand-500/20 disabled:opacity-50 disabled:shadow-none transition-smooth flex items-center justify-center flex-shrink-0"
              title="Gửi tin nhắn"
            >
              {isSending ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <Send className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSendLike}
              disabled={isSending}
              className="w-11 h-11 rounded-xl text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-smooth flex items-center justify-center flex-shrink-0 active:scale-90"
              title="Gửi nút thích 👍"
            >
              <ThumbsUp className="w-5 h-5 fill-current" />
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
