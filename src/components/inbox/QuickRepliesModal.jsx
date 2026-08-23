import React, { useState } from 'react';
import { X, Zap, Plus, Trash2, Edit2, Check, Sparkles, AlertCircle } from 'lucide-react';
import { DEFAULT_QUICK_REPLIES } from '../../services/facebookApi';

export default function QuickRepliesModal({ isOpen, onClose, quickReplies, onSaveQuickReplies }) {
  const [replies, setReplies] = useState(() => {
    if (quickReplies && quickReplies.length > 0) return quickReplies;
    return DEFAULT_QUICK_REPLIES;
  });

  const [editingId, setEditingId] = useState(null);
  const [formShortcut, setFormShortcut] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formText, setFormText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setEditingId(null);
    setFormShortcut('/');
    setFormTitle('');
    setFormText('');
    setIsAdding(true);
  };

  const handleStartEdit = (reply) => {
    setEditingId(reply.id);
    setFormShortcut(reply.shortcut);
    setFormTitle(reply.title);
    setFormText(reply.text);
    setIsAdding(false);
  };

  const handleSaveItem = (e) => {
    e.preventDefault();
    if (!formShortcut.trim() || !formText.trim()) return;

    let cleanShortcut = formShortcut.trim();
    if (!cleanShortcut.startsWith('/')) cleanShortcut = '/' + cleanShortcut;

    if (isAdding) {
      const newItem = {
        id: 'qr_' + Date.now(),
        shortcut: cleanShortcut,
        title: formTitle.trim() || cleanShortcut,
        text: formText.trim()
      };
      const updated = [...replies, newItem];
      setReplies(updated);
      onSaveQuickReplies(updated);
      setIsAdding(false);
    } else if (editingId) {
      const updated = replies.map(r =>
        r.id === editingId
          ? { ...r, shortcut: cleanShortcut, title: formTitle.trim() || cleanShortcut, text: formText.trim() }
          : r
      );
      setReplies(updated);
      onSaveQuickReplies(updated);
      setEditingId(null);
    }
  };

  const handleDelete = (id) => {
    const updated = replies.filter(r => r.id !== id);
    setReplies(updated);
    onSaveQuickReplies(updated);
    if (editingId === id) setEditingId(null);
  };

  const handleResetDefault = () => {
    setReplies(DEFAULT_QUICK_REPLIES);
    onSaveQuickReplies(DEFAULT_QUICK_REPLIES);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Quản Lý Tin Nhắn Mẫu & Phím Tắt</h3>
              <p className="text-xs text-slate-500">Gõ dấu "/" để gọi nhanh · Mẫu được lưu trên thiết bị này</p>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Add / Edit Form */}
          {(isAdding || editingId) && (
            <form onSubmit={handleSaveItem} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-brand-200 dark:border-brand-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
                  {isAdding ? '✨ Thêm Mẫu Mới' : '✏️ Chỉnh Sửa Mẫu'}
                </span>
                <button
                  type="button"
                  onClick={() => { setIsAdding(false); setEditingId(null); }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Đóng form
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phím tắt gọi nhanh *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="/stk hoặc /size"
                    value={formShortcut}
                    onChange={(e) => setFormShortcut(e.target.value)}
                    className="w-full p-2 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tiêu đề gợi nhớ
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Bảng chọn size áo"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nội dung tin nhắn *
                </label>
                <textarea
                  rows="4"
                  required
                  placeholder="Nhập nội dung mẫu tin nhắn trả lời khách..."
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setIsAdding(false); setEditingId(null); }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-brand-500 text-white hover:bg-brand-600 shadow-sm flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isAdding ? 'Thêm Mẫu' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          )}

          {/* List of Replies */}
          <div className="space-y-2.5">
            {replies.map(reply => (
              <div
                key={reply.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-smooth group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-mono font-bold text-xs border border-amber-200/60 dark:border-amber-800/60">
                      {reply.shortcut}
                    </span>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                      {reply.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleStartEdit(reply)}
                      className="p-1 rounded-md text-slate-400 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      title="Sửa"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(reply.id)}
                      className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800 font-sans">
                  {reply.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={handleResetDefault}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium"
          >
            Khôi phục mẫu mặc định
          </button>
          <div className="flex items-center gap-2">
            {!isAdding && !editingId && (
              <button
                type="button"
                onClick={handleStartAdd}
                className="px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold hover:bg-brand-600 shadow-md shadow-brand-500/20 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Thêm Mẫu Mới
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
