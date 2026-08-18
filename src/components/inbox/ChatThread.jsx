import React, { useState, useEffect, useRef } from 'react';
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
  Bot,
  Plus
} from 'lucide-react';
import {
  getInitials,
  getAvatarColor,
  formatDateTime,
  sendMessengerMessage,
  sendCommentReply,
  sendPrivateReply,
  isSticker,
  DEFAULT_QUICK_REPLIES
} from '../../services/facebookApi';

export default function ChatThread({
  conversation,
  messages,
  isLoadingMessages,
  onSendMessage,
  onUpdateStatus,
  onToggleStar,
  onToggleUnread,
  onOpenMediaModal,
  onBackToList,
  onToggleProfilePanel,
  quickReplies = DEFAULT_QUICK_REPLIES,
  onOpenQuickRepliesModal,
  onOpenVietQRModal,
  onOpenAutoRulesModal
}) {
  const [replyText, setReplyText] = useState('');
  const [replyMode, setReplyMode] = useState('messenger');
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedFilePreview, setAttachedFilePreview] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [shortcutQuery, setShortcutQuery] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAttachedFile(file);
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setAttachedFilePreview(url);
      } else {
        setAttachedFilePreview(null);
      }
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    setAttachedFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!replyText.trim() && !attachedFile) return;

    setIsSending(true);
    try {
      if (onSendMessage) {
        await onSendMessage({
          text: replyText.trim(),
          file: attachedFile,
          mode: replyMode
        });
      }
      setReplyText('');
      handleRemoveFile();
    } catch (err) {
      alert('Lỗi gửi tin nhắn: ' + err.message);
    } finally {
      setIsSending(false);
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
  const initials = getInitials(conversation.customer_name);
  const bgColor = getAvatarColor(conversation.customer_name);

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
    <main className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950/40 relative overflow-hidden h-full">
      {/* Header (Solid background & touch-friendly for Safari) */}
      <div className="h-16 px-3 sm:px-4 lg:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between z-10 flex-shrink-0">
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
            <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-white font-bold text-xs">
              {conversation.avatar_url ? (
                <img src={conversation.avatar_url} alt={conversation.customer_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: getAvatarColor(conversation.customer_name) }}>
                  {getInitials(conversation.customer_name)}
                </div>
              )}
            </div>
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
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white truncate">
                {conversation.customer_name}
              </h3>
              {conversation.unread_count > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500 flex-shrink-0"></span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {conversation.page_name} • {conversation.conversation_type === 'messenger' ? 'Messenger' : 'Bình luận'}
            </p>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => onToggleStar(conversation.fb_conversation_id)}
            className={`p-2 sm:p-2.5 rounded-xl border transition-smooth ${
              conversation.is_starred
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-500 border-amber-200 dark:border-amber-800'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'
            }`}
            title={conversation.is_starred ? 'Bỏ gắn sao' : 'Gắn sao theo dõi'}
          >
            <Star className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={() => onUpdateStatus(conversation.fb_conversation_id, conversation.status === 'done' ? 'active' : 'done')}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 border transition-smooth ${
              conversation.status === 'done'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
            }`}
            title="Đánh dấu đã hoàn thành xử lý"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="hidden sm:inline">{conversation.status === 'done' ? 'Đã Xử Lý' : 'Xong'}</span>
          </button>

          <button
            onClick={onToggleProfilePanel}
            className="p-2 sm:p-2.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-smooth"
            title="Hồ sơ & Đơn hàng"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Thread Container (Touch-scrollable) */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-4 touch-scroll-y overscroll-contain">
        {isLoadingMessages ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-2.5"></div>
            <p className="text-sm font-medium">Đang tải tin nhắn...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
            <MessageSquare className="w-12 h-12 stroke-[1.5] mb-2.5 opacity-50" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">Chưa có tin nhắn nào</p>
            <p className="text-xs text-slate-400 mt-1">Bắt đầu trò chuyện với khách hàng ở khung bên dưới</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isFromPage = msg.from?.id === conversation.page_id;
            return (
              <div
                key={msg.id || idx}
                className={`flex gap-3 max-w-[85%] lg:max-w-[75%] ${isFromPage ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                {!isFromPage && (
                  <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-white text-xs font-bold mt-0.5">
                    {conversation.avatar_url ? (
                      <img src={conversation.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: getAvatarColor(conversation.customer_name) }}>
                        {getInitials(conversation.customer_name)}
                      </div>
                    )}
                  </div>
                )}

                <div className={`space-y-1.5 ${isFromPage ? 'items-end' : 'items-start'} flex flex-col`}>
                  {msg.message && (
                    <div
                      className={`px-4.5 py-3 rounded-2xl text-[15px] sm:text-[15.5px] leading-relaxed whitespace-pre-wrap break-words shadow-xs ${
                        isFromPage
                          ? 'bg-brand-500 text-white rounded-br-xs font-normal'
                          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-bl-xs'
                      }`}
                    >
                      {msg.message}
                    </div>
                  )}

                  {/* Attachments */}
                  {msg.attachments?.data?.map((att, aIdx) => {
                    const isImg = att.image_data || att.mime_type?.startsWith('image/') || att.file_url?.match(/\.(jpeg|jpg|png|webp|gif)/i);
                    if (isImg) {
                      const imgSource = att.image_data?.url || att.file_url;
                      return (
                        <div
                          key={aIdx}
                          onClick={() => onOpenMediaModal && onOpenMediaModal(imgSource)}
                          className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[280px] cursor-pointer hover:opacity-90 transition-opacity relative group shadow-sm"
                        >
                          <img src={imgSource} alt="Attached image" className="w-full h-auto object-cover max-h-72" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                            🔍 Xem phóng to
                          </div>
                        </div>
                      );
                    }
                    return (
                      <a key={aIdx} href={att.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs sm:text-sm text-brand-600 dark:text-brand-400 font-semibold border border-slate-200 dark:border-slate-700">
                        <Paperclip className="w-4 h-4" /> Tệp đính kèm
                      </a>
                    );
                  })}

                  <div className={`text-[11.5px] text-slate-400 px-1 font-medium ${isFromPage ? 'text-right' : 'text-left'}`}>
                    {formatDateTime(msg.created_time)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Reply Area */}
      <div className="p-3.5 lg:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 relative">
        {/* Floating '/' Shortcut Dropdown */}
        {shortcutQuery && matchingReplies.length > 0 && (
          <div className="absolute bottom-[calc(100%+8px)] left-4 right-4 bg-white dark:bg-slate-800 border border-brand-300 dark:border-brand-700 rounded-2xl shadow-2xl p-2 z-30 max-h-64 overflow-y-auto space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {reply.text}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Action Toolbar: Quick Tools */}
        <div className="flex items-center justify-between gap-2">
          {/* Channel Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
            <button
              onClick={() => setReplyMode('messenger')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-smooth ${replyMode === 'messenger' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs font-bold' : ''}`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> Messenger
            </button>
            <button
              onClick={() => setReplyMode('public_comment')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-smooth ${replyMode === 'public_comment' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-xs font-bold' : ''}`}
            >
              <MessagesSquare className="w-3.5 h-3.5 text-emerald-500" /> Comment
            </button>
            <button
              onClick={() => setReplyMode('private_reply')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-smooth ${replyMode === 'private_reply' ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-white shadow-xs font-bold' : ''}`}
            >
              <Lock className="w-3.5 h-3.5 text-purple-500" /> Nhắn riêng
            </button>
          </div>

          {/* Quick Action Tools */}
          <div className="flex items-center gap-2">
            {onOpenVietQRModal && (
              <button
                type="button"
                onClick={onOpenVietQRModal}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200/60 dark:border-emerald-800/60 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-smooth shadow-xs"
                title="Tạo mã VietQR chuyển khoản nhanh"
              >
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>VietQR</span>
              </button>
            )}

            {onOpenAutoRulesModal && (
              <button
                type="button"
                onClick={onOpenAutoRulesModal}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-purple-100 border border-purple-200/60 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-smooth shadow-xs"
                title="Cài đặt kịch bản tự động bình luận"
              >
                <Bot className="w-4 h-4 text-purple-600" />
                <span className="hidden sm:inline">Tự Động</span>
              </button>
            )}

            {onOpenQuickRepliesModal && (
              <button
                type="button"
                onClick={onOpenQuickRepliesModal}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200/60 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-smooth shadow-xs"
                title="Quản lý phím tắt & mẫu câu trả lời nhanh"
              >
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline">Mẫu Câu</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Suggested Replies Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs touch-scroll-x overscroll-x-contain">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Phím tắt:
          </span>
          {quickReplies.slice(0, 6).map((qr) => (
            <button
              key={qr.id}
              onClick={() => handleSelectShortcut(qr)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-[13px] font-medium whitespace-nowrap transition-smooth border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5 flex-shrink-0"
            >
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">{qr.shortcut}</span>
              <span className="hidden sm:inline text-xs opacity-80">{qr.title.replace(/^[^\w\s]+/, '')}</span>
            </button>
          ))}
          {onOpenQuickRepliesModal && (
            <button
              onClick={onOpenQuickRepliesModal}
              className="px-2.5 py-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1 flex-shrink-0"
              title="Thêm mẫu mới"
            >
              <Plus className="w-3.5 h-3.5" /> Quản lý
            </button>
          )}
        </div>

        {/* File attachment preview */}
        {attachedFile && (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {attachedFilePreview ? (
              <img src={attachedFilePreview} alt="Preview" className="w-12 h-12 object-cover rounded-xl" />
            ) : (
              <Paperclip className="w-6 h-6 text-slate-500" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{attachedFile.name}</p>
              <p className="text-[11px] text-slate-400">{(attachedFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={handleRemoveFile} className="p-1.5 text-slate-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input box */}
        <form onSubmit={handleSend} className="relative flex items-center gap-2.5">
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
            className="p-3 rounded-2xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth border border-slate-200/80 dark:border-slate-700/80"
            title="Đính kèm ảnh / tệp"
          >
            <Image className="w-5 h-5" />
          </button>

          <textarea
            rows="2"
            placeholder="Nhập tin nhắn... (Gõ '/' để chọn nhanh mẫu câu tư vấn / size / STK)"
            value={replyText}
            onChange={handleTextChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 px-4 py-2.5 text-[16px] sm:text-[15px] leading-relaxed rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-smooth resize-none"
          ></textarea>

          <button
            type="submit"
            disabled={isSending || (!replyText.trim() && !attachedFile)}
            className="p-3.5 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:shadow-none transition-smooth flex items-center justify-center flex-shrink-0"
            title="Gửi tin nhắn"
          >
            {isSending ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
