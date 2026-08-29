import React, { useState } from 'react';
import { Check, Copy, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';

const EMPTY_REPLY = { shortcut: '/', title: '', text: '' };

function normalizeReply(reply, id) {
  let shortcut = String(reply.shortcut || '').trim().replace(/\s+/g, '');
  if (!shortcut.startsWith('/')) shortcut = `/${shortcut}`;
  shortcut = shortcut.slice(0, 20);
  const title = String(reply.title || '').trim().slice(0, 100);
  const text = String(reply.text || '').trim().slice(0, 10000);
  if (shortcut === '/' || !title || !text) return null;
  return { id: String(id), shortcut, title, text };
}

export default function QuickRepliesAdmin({ replies, onChange, onNotice }) {
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(EMPTY_REPLY);

  const resetForm = () => {
    setEditingId('');
    setForm(EMPTY_REPLY);
  };

  const startEdit = reply => {
    setEditingId(reply.id);
    setForm({ shortcut: reply.shortcut, title: reply.title, text: reply.text });
  };

  const handleSave = event => {
    event.preventDefault();
    const isNew = editingId === 'new';
    const id = isNew ? `qr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : editingId;
    const normalized = normalizeReply(form, id);
    if (!normalized) {
      onNotice({ type: 'error', text: 'Cần nhập phím tắt, tên ngắn và nội dung trả lời.' });
      return;
    }
    const duplicate = replies.some(reply => reply.id !== id && reply.shortcut.toLowerCase() === normalized.shortcut.toLowerCase());
    if (duplicate) {
      onNotice({ type: 'error', text: `Phím tắt ${normalized.shortcut} đã tồn tại.` });
      return;
    }
    const next = isNew
      ? [...replies, normalized]
      : replies.map(reply => reply.id === editingId ? normalized : reply);
    onChange(next);
    resetForm();
    onNotice({ type: 'success', text: isNew ? 'Đã thêm trả lời nhanh.' : 'Đã cập nhật trả lời nhanh.' });
  };

  const handleDuplicate = reply => {
    const baseShortcut = `${reply.shortcut}-copy`.slice(0, 20);
    let shortcut = baseShortcut;
    let index = 2;
    while (replies.some(item => item.shortcut.toLowerCase() === shortcut.toLowerCase())) {
      shortcut = `${baseShortcut.slice(0, 16)}-${index}`;
      index += 1;
    }
    const next = [...replies, {
      ...reply,
      id: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      shortcut,
      title: `${reply.title} (bản sao)`
    }];
    onChange(next);
    onNotice({ type: 'success', text: 'Đã nhân bản trả lời nhanh.' });
  };

  const handleDelete = reply => {
    if (!window.confirm(`Xóa trả lời nhanh ${reply.shortcut} — ${reply.title}?`)) return;
    onChange(replies.filter(item => item.id !== reply.id));
    if (editingId === reply.id) resetForm();
    onNotice({ type: 'success', text: 'Đã xóa trả lời nhanh.' });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white"><Zap className="h-4 w-4 text-amber-500" /> Trả lời nhanh ({replies.length})</h2>
          <p className="mt-1 text-[11px] text-slate-500">Chat chỉ hiện tên nút ngắn. Bấm nút sẽ điền nội dung vào ô soạn, không tự gửi.</p>
        </div>
        {!editingId && (
          <button type="button" onClick={() => setEditingId('new')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800"><Plus className="h-3.5 w-3.5" /> Thêm nội dung</button>
        )}
      </div>

      {editingId && (
        <form onSubmit={handleSave} className="mt-4 grid gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20 sm:grid-cols-[150px_minmax(0,1fr)]">
          <input value={form.shortcut} onChange={event => setForm(current => ({ ...current, shortcut: event.target.value }))} maxLength={20} placeholder="/size" className="rounded-xl border border-slate-200 bg-white p-3 font-mono text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800" />
          <input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} maxLength={100} placeholder="Tên ngắn: Bảng size" className="rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800" />
          <textarea value={form.text} onChange={event => setForm(current => ({ ...current, text: event.target.value }))} maxLength={10000} rows={6} placeholder="Nội dung đầy đủ sẽ được điền vào ô soạn khi bấm nút..." className="rounded-xl border border-slate-200 bg-white p-3 text-[16px] leading-relaxed outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 sm:col-span-2 sm:text-sm" />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-white dark:hover:bg-slate-800"><X className="h-3.5 w-3.5" /> Hủy</button>
            <button type="submit" className="inline-flex items-center gap-1 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800"><Check className="h-3.5 w-3.5" /> Lưu trả lời</button>
          </div>
        </form>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {replies.map(reply => (
          <article key={reply.id} className={`rounded-xl border p-3 transition-colors ${editingId === reply.id ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="rounded-md bg-amber-50 px-2 py-1 font-mono text-[11px] font-extrabold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">{reply.shortcut}</span>
                <h3 className="mt-2 truncate text-xs font-extrabold text-slate-900 dark:text-white">{reply.title}</h3>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <button type="button" onClick={() => startEdit(reply)} aria-label={`Sửa ${reply.shortcut}`} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => handleDuplicate(reply)} aria-label={`Nhân bản ${reply.shortcut}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Copy className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => handleDelete(reply)} aria-label={`Xóa ${reply.shortcut}`} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
