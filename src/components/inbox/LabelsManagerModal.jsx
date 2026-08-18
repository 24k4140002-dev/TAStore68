import React, { useState } from 'react';
import { X, Tag, Plus, Trash2, Palette } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const PRESET_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4', '#64748b'
];

export default function LabelsManagerModal({ allLabels, allTags, onLabelsChange, onTagsChange, onClose }) {
  const [activeTab, setActiveTab] = useState('labels');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelEmoji, setNewLabelEmoji] = useState('🏷️');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[0]);

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[2]);
  const [loading, setLoading] = useState(false);

  const handleCreateLabel = async (e) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;

    setLoading(true);
    try {
      const labelObj = {
        name: newLabelName.trim(),
        emoji: newLabelEmoji.trim() || '🏷️',
        color: newLabelColor,
        sort_order: (allLabels?.length || 0) + 1
      };

      const { data, error } = await supabase.from('labels').insert([labelObj]).select();
      if (error) throw error;

      if (data && data[0]) {
        onLabelsChange([...allLabels, data[0]]);
        setNewLabelName('');
      }
    } catch (err) {
      alert('Lỗi tạo nhãn: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLabel = async (id) => {
    if (!confirm('Bạn có chắc muốn xoá nhãn này?')) return;
    try {
      await supabase.from('labels').delete().eq('id', id);
      onLabelsChange(allLabels.filter(l => l.id !== id));
    } catch (err) {
      alert('Lỗi xoá nhãn: ' + err.message);
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    setLoading(true);
    try {
      const tagObj = {
        name: newTagName.trim().replace(/^#/, ''),
        color: newTagColor
      };

      const { data, error } = await supabase.from('tags').insert([tagObj]).select();
      if (error) throw error;

      if (data && data[0]) {
        onTagsChange([...allTags, data[0]]);
        setNewTagName('');
      }
    } catch (err) {
      alert('Lỗi tạo tag: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (id) => {
    if (!confirm('Bạn có chắc muốn xoá tag này?')) return;
    try {
      await supabase.from('tags').delete().eq('id', id);
      onTagsChange(allTags.filter(t => t.id !== id));
    } catch (err) {
      alert('Lỗi xoá tag: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-500 flex items-center justify-center font-bold">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Quản Lý Nhãn & Thẻ CRM</h3>
              <p className="text-xs text-slate-500">Phân loại khách hàng và cuộc trò chuyện</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-2 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            onClick={() => setActiveTab('labels')}
            className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-smooth ${
              activeTab === 'labels'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            🏷️ Nhãn Hội Thoại ({allLabels.length})
          </button>
          <button
            onClick={() => setActiveTab('tags')}
            className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-smooth ${
              activeTab === 'tags'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            # Thẻ Sản Phẩm / Khách ({allTags.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'labels' ? (
            <>
              {/* Form Add Label */}
              <form onSubmit={handleCreateLabel} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Thêm Nhãn Mới</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Icon"
                    value={newLabelEmoji}
                    onChange={(e) => setNewLabelEmoji(e.target.value)}
                    className="w-14 px-2 py-2 text-center text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Tên nhãn (VD: Khách VIP, Đã cọc...)"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                {/* Colors */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-500">Màu:</span>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewLabelColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${newLabelColor === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110'}`}
                      style={{ background: c }}
                    />
                  ))}
                  <button
                    type="submit"
                    disabled={loading}
                    className="ml-auto px-4 py-1.5 text-xs font-bold rounded-lg bg-brand-500 hover:bg-brand-600 text-white flex items-center gap-1.5 transition-smooth"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
              </form>

              {/* List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh Sách Nhãn Hiện Có</h4>
                {allLabels.map(label => (
                  <div key={label.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-smooth">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full" style={{ background: label.color }}></span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {label.emoji} {label.name}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteLabel(label.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-smooth"
                      title="Xoá nhãn"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Form Add Tag */}
              <form onSubmit={handleCreateTag} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Thêm Tag Mới</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Tên tag (VD: ao-da-banh, khuyen-mai...)"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                {/* Colors */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-500">Màu:</span>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTagColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${newTagColor === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110'}`}
                      style={{ background: c }}
                    />
                  ))}
                  <button
                    type="submit"
                    disabled={loading}
                    className="ml-auto px-4 py-1.5 text-xs font-bold rounded-lg bg-brand-500 hover:bg-brand-600 text-white flex items-center gap-1.5 transition-smooth"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm Tag
                  </button>
                </div>
              </form>

              {/* List Tags */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh Sách Tag</h4>
                {allTags.map(tag => (
                  <div key={tag.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-smooth">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full" style={{ background: tag.color }}></span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        # {tag.name}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteTag(tag.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-smooth"
                      title="Xoá tag"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
