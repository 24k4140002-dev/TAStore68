import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { getPageDisplayName } from '../../services/facebookApi';

export default function PageManagerModal({
  allPages = [],
  visiblePageIds = [],
  onSaveVisiblePages,
  onClose,
  pageNicknames = {}
}) {
  const [selectedIds, setSelectedIds] = useState(() => {
    if (visiblePageIds && visiblePageIds.length > 0) {
      return [...visiblePageIds];
    }
    return allPages.map(p => p.id);
  });

  const handleToggle = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === allPages.length) {
      setSelectedIds([allPages[0]?.id].filter(Boolean));
    } else {
      setSelectedIds(allPages.map(p => p.id));
    }
  };

  const handleSave = () => {
    if (selectedIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 Fanpage để hiển thị!');
      return;
    }
    onSaveVisiblePages(selectedIds);
    localStorage.setItem('metapost_visible_page_ids', JSON.stringify(selectedIds));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Quản Lý Ẩn / Hiện Fanpage</h3>
            <p className="text-xs text-slate-500">
              Đang bật {selectedIds.length} / {allPages.length} Fanpage
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subheader action */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500">Chỉ chọn các trang bạn đang bán hàng</span>
          <button
            type="button"
            onClick={handleSelectAll}
            className="font-bold text-brand-500 hover:underline"
          >
            {selectedIds.length === allPages.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
          </button>
        </div>

        {/* List of Pages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 touch-scroll-y divide-y divide-slate-100 dark:divide-slate-800/60">
          {allPages.map(page => {
            const isChecked = selectedIds.includes(page.id);
            const displayName = getPageDisplayName(page, allPages, pageNicknames);
            return (
              <div
                key={page.id}
                onClick={() => handleToggle(page.id)}
                className={`pt-2 flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-smooth ${
                  isChecked
                    ? 'bg-blue-50/70 dark:bg-blue-950/40 border border-brand-300 dark:border-brand-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 opacity-60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {page.picture?.data?.url ? (
                      <img src={page.picture.data.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      '🚩'
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">{displayName}</h4>
                    <p className="text-[10px] text-slate-400 truncate">{page.category || 'Trang Facebook'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isChecked ? (
                    <span className="p-1 rounded-md bg-brand-500 text-white text-xs">
                      <Check className="w-4 h-4" />
                    </span>
                  ) : (
                    <span className="p-1 rounded-md border border-slate-300 dark:border-slate-600 text-transparent text-xs">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 px-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50">
          <span className="text-[11px] text-slate-400">
            Giảm tải Facebook & mượt mà hơn
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-brand-500 hover:bg-brand-600 text-white shadow-md shadow-brand-500/20"
            >
              Lưu & Áp Dụng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
