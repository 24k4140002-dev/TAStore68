import React, { useMemo, useRef, useState } from 'react';
import {
  CloudOff,
  Copy,
  Database,
  Download,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import {
  MAX_SETTINGS_BACKUP_BYTES,
  SAFE_SETTINGS,
  createSafeSettingsBackup,
  normalizePostTemplate,
  readStoredArray,
  readStoredObject,
  restoreSafeSettingsBackup
} from '../../utils/settingsBackup';
import { DEFAULT_QUICK_REPLIES } from '../../services/facebookApi';
import QuickRepliesAdmin from './QuickRepliesAdmin';

const EMPTY_TEMPLATE = { name: '', content: '', link: '', type: 'photo' };

function saveTemplates(templates) {
  localStorage.setItem('metapost_templates', JSON.stringify(templates));
  window.dispatchEvent(new Event('metapost-settings-changed'));
}

export default function AdminStudio() {
  const [templates, setTemplates] = useState(() => readStoredArray(localStorage, 'metapost_templates'));
  const [quickReplies, setQuickReplies] = useState(() => {
    const stored = readStoredArray(localStorage, 'metapost_quick_replies');
    return stored.length > 0 ? stored : DEFAULT_QUICK_REPLIES;
  });
  const [form, setForm] = useState(EMPTY_TEMPLATE);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
  const importInputRef = useRef(null);

  const autoRules = readStoredObject(localStorage, 'metapost_auto_rules');
  const visiblePages = readStoredArray(localStorage, 'metapost_visible_page_ids');
  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    if (!query) return templates;
    return templates.filter(template =>
      `${template.name || ''} ${template.content || ''}`.toLocaleLowerCase('vi').includes(query)
    );
  }, [search, templates]);

  const resetForm = () => {
    setEditingId('');
    setForm(EMPTY_TEMPLATE);
  };

  const handleSaveTemplate = (event) => {
    event.preventDefault();
    const normalized = normalizePostTemplate({
      ...form,
      id: editingId || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    });
    if (!normalized) {
      setNotice({ type: 'error', text: 'Tên mẫu và nội dung không được để trống.' });
      return;
    }
    const next = editingId
      ? templates.map(template => template.id === editingId ? normalized : template)
      : [normalized, ...templates];
    setTemplates(next);
    saveTemplates(next);
    resetForm();
    setNotice({ type: 'success', text: editingId ? 'Đã cập nhật bài mẫu.' : 'Đã tạo bài mẫu mới.' });
  };

  const handleEditTemplate = (template) => {
    setEditingId(template.id);
    setForm({
      name: template.name || '',
      content: template.content || '',
      link: template.link || '',
      type: template.type || 'photo'
    });
  };

  const handleDuplicateTemplate = (template) => {
    const copy = {
      ...template,
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: `${template.name} (bản sao)`
    };
    const next = [copy, ...templates];
    setTemplates(next);
    saveTemplates(next);
    setNotice({ type: 'success', text: 'Đã nhân bản bài mẫu.' });
  };

  const handleDeleteTemplate = (template) => {
    if (!window.confirm(`Xóa bài mẫu “${template.name}”?`)) return;
    const next = templates.filter(item => item.id !== template.id);
    setTemplates(next);
    saveTemplates(next);
    if (editingId === template.id) resetForm();
    setNotice({ type: 'success', text: 'Đã xóa bài mẫu khỏi thiết bị này.' });
  };

  const handleExport = () => {
    if (localStorage.getItem('metapost_quick_replies') === null) {
      localStorage.setItem('metapost_quick_replies', JSON.stringify(quickReplies));
    }
    const backup = createSafeSettingsBackup(localStorage);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `metapost-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice({ type: 'success', text: 'Đã tạo file sao lưu an toàn. Token và dữ liệu khách không nằm trong file.' });
  };

  const handleQuickRepliesChange = next => {
    setQuickReplies(next);
    localStorage.setItem('metapost_quick_replies', JSON.stringify(next));
    window.dispatchEvent(new Event('metapost-settings-changed'));
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_SETTINGS_BACKUP_BYTES) {
      setNotice({ type: 'error', text: 'File sao lưu vượt quá 1 MB.' });
      return;
    }
    if (!window.confirm('Khôi phục các thiết lập trong file vào trình duyệt này? Thiết lập trùng tên sẽ được thay thế.')) return;

    try {
      const backup = JSON.parse(await file.text());
      const imported = restoreSafeSettingsBackup(localStorage, backup);
      setTemplates(readStoredArray(localStorage, 'metapost_templates'));
      if (imported.includes('metapost_quick_replies')) {
        setQuickReplies(readStoredArray(localStorage, 'metapost_quick_replies'));
      }
      setNeedsReload(true);
      setNotice({ type: 'success', text: `Đã khôi phục ${imported.length} nhóm thiết lập. Tải lại app để áp dụng toàn bộ.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thể đọc file sao lưu.' });
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] dark:bg-slate-950 sm:p-5 lg:p-7">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white sm:text-xl">
              <ShieldCheck className="h-5 w-5 text-brand-500" /> Quản trị & sao lưu
            </h1>
            <p className="mt-1 text-xs text-slate-500">Quản lý bài mẫu và chuyển thiết lập an toàn giữa các thiết bị.</p>
          </div>
          {needsReload && (
            <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm">
              <RefreshCw className="h-4 w-4" /> Tải lại để áp dụng
            </button>
          )}
        </div>

        {notice && (
          <div className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs font-semibold ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo"><X className="h-4 w-4" /></button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Bài mẫu', templates.length, FileText],
            ['Trả lời nhanh', quickReplies.length, Copy],
            ['Page hiển thị', visiblePages.length || 'Tất cả', Database],
            ['Luật tự động', Object.keys(autoRules).length, ShieldCheck]
          ].map(([label, value, Icon]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Icon className="mb-2 h-4 w-4 text-brand-500" />
              <p className="text-xl font-black text-slate-900 dark:text-white">{value}</p>
              <p className="text-[11px] font-semibold text-slate-500">{label}</p>
            </div>
          ))}
        </section>

        <QuickRepliesAdmin replies={quickReplies} onChange={handleQuickRepliesChange} onNotice={setNotice} />

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white"><Download className="h-4 w-4 text-emerald-500" /> Sao lưu thiết lập</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Xuất một file để cất giữ hoặc nhập trên điện thoại/máy tính khác. File không chứa Facebook Token, Page Token, tin nhắn, ghi chú khách, đơn hàng hay tài khoản ngân hàng.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SAFE_SETTINGS.slice(0, 6).map(setting => <span key={setting.key} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{setting.label}</span>)}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={handleExport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-600"><Download className="h-4 w-4" /> Tải file sao lưu</button>
              <button type="button" onClick={() => importInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Upload className="h-4 w-4" /> Khôi phục từ file</button>
              <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-amber-800 dark:text-amber-300"><CloudOff className="h-4 w-4" /> Đồng bộ thiết lập cloud chưa bật</h2>
            <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">Supabase hiện chỉ lưu đăng ký Web Push riêng tư. Bài mẫu, trả lời nhanh và cấu hình hiển thị vẫn nằm trên thiết bị này; hãy dùng file sao lưu để chuyển máy. Muốn đồng bộ cloud an toàn cần thêm đăng nhập Admin, phân quyền và RLS.</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <form onSubmit={handleSaveTemplate} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">{editingId ? <Pencil className="h-4 w-4 text-amber-500" /> : <Plus className="h-4 w-4 text-brand-500" />} {editingId ? 'Sửa bài mẫu' : 'Tạo bài mẫu'}</h2>
              {editingId && <button type="button" onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white">Hủy sửa</button>}
            </div>
            <input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} maxLength={120} placeholder="Tên gợi nhớ của mẫu" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800" />
            <select aria-label="Loại bài mẫu" value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
              <option value="photo">Ảnh / Album</option><option value="video">Video</option><option value="text">Văn bản / Link</option>
            </select>
            <textarea value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} rows={7} maxLength={20000} placeholder="Nội dung bài mẫu" className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-[16px] leading-relaxed outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 sm:text-sm" />
            <input value={form.link} onChange={event => setForm(current => ({ ...current, link: event.target.value }))} maxLength={2000} placeholder="Liên kết tùy chọn" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800" />
            <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-xs font-extrabold text-white hover:bg-brand-600"><Save className="h-4 w-4" /> {editingId ? 'Lưu thay đổi' : 'Tạo bài mẫu'}</button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Danh sách bài mẫu ({templates.length})</h2>
              <label className="relative block sm:w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm bài mẫu..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800" /></label>
            </div>
            <div className="mt-4 max-h-[540px] space-y-2 overflow-y-auto pr-1">
              {filteredTemplates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400 dark:border-slate-700">Chưa có bài mẫu phù hợp.</div>
              ) : filteredTemplates.map(template => (
                <article key={template.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="truncate text-xs font-extrabold text-slate-900 dark:text-white">{template.name}</h3><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">{template.content}</p></div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase text-slate-500 dark:bg-slate-800">{template.type || 'photo'}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleEditTemplate(template)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Pencil className="h-3 w-3" /> Sửa</button>
                    <button type="button" onClick={() => handleDuplicateTemplate(template)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Copy className="h-3 w-3" /> Nhân bản</button>
                    <button type="button" onClick={() => handleDeleteTemplate(template)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-600 dark:bg-rose-950/50 dark:text-rose-300"><Trash2 className="h-3 w-3" /> Xóa</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
