import React, { useState } from 'react';
import { X, Bot, Shield, MessageSquare, Send, Check, Sparkles, AlertCircle } from 'lucide-react';

export default function AutoRulesModal({ isOpen, onClose, onSaveRules }) {
  const savedRules = (() => {
    try {
      return JSON.parse(localStorage.getItem('metapost_auto_rules') || '{}');
    } catch {
      return {};
    }
  })();

  const [autoHidePhone, setAutoHidePhone] = useState(savedRules.autoHidePhone ?? true);
  const [autoReplyComment, setAutoReplyComment] = useState(savedRules.autoReplyComment ?? true);
  const [commentReplyText, setCommentReplyText] = useState(
    savedRules.commentReplyText || 'Dạ shop đã gửi thông tin chi tiết qua tin nhắn cho bạn rồi ạ! Bạn kiểm tra hộp thư giúp shop nhé 🥰'
  );
  const [autoPrivateReply, setAutoPrivateReply] = useState(savedRules.autoPrivateReply ?? true);
  const [privateReplyText, setPrivateReplyText] = useState(
    savedRules.privateReplyText || 'Chào bạn, shop thấy bạn vừa quan tâm sản phẩm trên bài viết của shop. Bạn đang cần tư vấn mẫu hoặc size nào để shop hỗ trợ ngay nhé! ⚽✨'
  );

  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    const rules = {
      autoHidePhone,
      autoReplyComment,
      commentReplyText: commentReplyText.trim(),
      autoPrivateReply,
      privateReplyText: privateReplyText.trim()
    };
    localStorage.setItem('metapost_auto_rules', JSON.stringify(rules));
    if (onSaveRules) onSaveRules(rules);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center font-bold">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Tự Động Hóa Bình Luận Fanpage</h3>
              <p className="text-xs text-slate-500">Chống cướp khách & Chăm sóc khách tự động</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Rule 1: Auto Hide Phone */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Tự động ẩn bình luận chứa SĐT</h4>
                  <p className="text-[11px] text-slate-500">Chống đối thủ quét số điện thoại cướp khách hàng</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoHidePhone}
                  onChange={(e) => setAutoHidePhone(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>

          {/* Rule 2: Auto Reply Public Comment */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Tự động trả lời bình luận công khai</h4>
                  <p className="text-[11px] text-slate-500">Phản hồi lịch sự ngay trên bài viết</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoReplyComment}
                  onChange={(e) => setAutoReplyComment(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {autoReplyComment && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Mẫu câu trả lời bình luận:
                </label>
                <textarea
                  rows="2"
                  value={commentReplyText}
                  onChange={(e) => setCommentReplyText(e.target.value)}
                  className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                ></textarea>
              </div>
            )}
          </div>

          {/* Rule 3: Auto Private Message */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Tự động gửi tin nhắn riêng (Private Reply)</h4>
                  <p className="text-[11px] text-slate-500">Mở cuộc hội thoại Messenger với khách bình luận</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPrivateReply}
                  onChange={(e) => setAutoPrivateReply(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {autoPrivateReply && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Mẫu tin nhắn gửi vào Messenger khách:
                </label>
                <textarea
                  rows="3"
                  value={privateReplyText}
                  onChange={(e) => setPrivateReplyText(e.target.value)}
                  className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                ></textarea>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Huỷ
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20 flex items-center gap-1.5"
            >
              {isSaved ? <Check className="w-4 h-4" /> : null}
              <span>{isSaved ? 'Đã Lưu Kịch Bản' : 'Lưu Cài Đặt Tự Động'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
