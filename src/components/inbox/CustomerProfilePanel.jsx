import React, { useState } from 'react';
import {
  User,
  ShoppingBag,
  Plus,
  Tag,
  FileText,
  Image as ImageIcon,
  Phone,
  Mail,
  MapPin,
  Clock,
  Sparkles,
  CheckCircle2,
  Trash2,
  DollarSign,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  X,
  Grid,
  CloudOff
} from 'lucide-react';
import { getInitials, getAvatarColor, formatDateTime, isSticker } from '../../services/facebookApi';
import CustomerAvatar from '../common/CustomerAvatar';

const SUGGESTED_LABELS = [
  { name: 'Khách hàng mới', color: '#06b6d4', emoji: '✨' },
  { name: 'Ưu tiên', color: '#ef4444', emoji: '🔥' },
  { name: 'Đã đặt hàng', color: '#10b981', emoji: '✅' },
  { name: 'Ngày hôm nay', color: '#8b5cf6', emoji: '📅' },
  { name: 'Cần gọi lại', color: '#f59e0b', emoji: '📞' }
];

export default function CustomerProfilePanel({
  conversation,
  messages,
  customerData,
  orders,
  allLabels,
  onAddLabel,
  onRemoveLabel,
  onAddNote,
  onDeleteNote,
  onOpenCreateOrder,
  onUpdateLeadStage,
  onOpenMediaModal,
  onOpenLabelsManager
}) {
  const [newNoteText, setNewNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isAllGalleryOpen, setIsAllGalleryOpen] = useState(false);
  const [isLabelPickerOpen, setIsLabelPickerOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState('');
  const [pendingLabelKey, setPendingLabelKey] = useState('');
  const [labelError, setLabelError] = useState('');

  if (!conversation) return null;

  const initials = getInitials(conversation.customer_name);
  const bgColor = getAvatarColor(conversation.customer_name);

  // Extract all real shared images (filter out stickers & icons)
  const sharedImages = [];
  messages.forEach(msg => {
    if (msg.sticker || msg.is_sticker) return; // Skip sticker messages
    const isFromPage = msg.from?.id === conversation.page_id;
    const atts = msg.attachments?.data || [];
    atts.forEach(att => {
      const imgUrl = att.image_data?.url || att.file_url;
      if (
        (att.mime_type?.startsWith('image/') || imgUrl?.match(/\.(jpeg|jpg|gif|png|webp)/i)) &&
        !isSticker(att, msg)
      ) {
        sharedImages.push({
          url: imgUrl,
          sender: isFromPage ? 'Shop' : conversation.customer_name,
          time: formatDateTime(msg.created_time)
        });
      }
    });
  });

  const handleCreateNoteSubmit = (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    if (onAddNote) {
      onAddNote(newNoteText.trim());
      setNewNoteText('');
      setIsAddingNote(false);
    }
  };

  const currentLabels = (conversation.labels || []).filter(label => (
    !label.page_id || label.page_id === conversation.page_id
  ));
  const leadStage = customerData?.lead_stage || 'potential';
  const labelsForCurrentPage = (allLabels || []).filter(label => (
    !label.page_id || label.page_id === conversation.page_id
  ));
  const availableLabels = [...labelsForCurrentPage.reduce((labelsByName, label) => {
    const key = (label.name || '').trim().toLocaleLowerCase('vi-VN');
    if (!key) return labelsByName;
    const existing = labelsByName.get(key);
    if (!existing || label.page_id === conversation.page_id) labelsByName.set(key, label);
    return labelsByName;
  }, new Map()).values()];
  const normalizedLabelSearch = labelSearch.trim().toLocaleLowerCase('vi-VN');
  const visibleAvailableLabels = availableLabels.filter(label => (
    !normalizedLabelSearch || label.name?.toLocaleLowerCase('vi-VN').includes(normalizedLabelSearch)
  ));
  const getLabelKey = label => String(label.id || label.name || '');
  const isLabelAssigned = label => currentLabels.some(current => (
    current.id === label.id || current.name?.trim().toLocaleLowerCase('vi-VN') === label.name?.trim().toLocaleLowerCase('vi-VN')
  ));
  const handleLabelToggle = async (label) => {
    const labelKey = getLabelKey(label);
    if (!labelKey || pendingLabelKey) return;
    setPendingLabelKey(labelKey);
    setLabelError('');
    try {
      if (isLabelAssigned(label)) {
        await onRemoveLabel?.(label.id || label.name);
      } else {
        await onAddLabel?.(label);
      }
    } catch (error) {
      setLabelError(error?.message || 'Meta chưa xác nhận thay đổi nhãn. Vui lòng thử lại.');
    } finally {
      setPendingLabelKey('');
    }
  };
  const leadStageSourceText = customerData?.lead_stage_source === 'meta_auto'
    ? '☁ Đồng bộ từ nhãn tự động của Meta'
    : customerData?.lead_stage_source === 'manual'
      ? '✍ Đã chỉnh thủ công trên thiết bị này'
      : '📱 Đang lưu trên thiết bị này';

  return (
    <aside className="w-full xl:w-80 2xl:w-88 min-w-0 flex-shrink-0 flex flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] select-none divide-y divide-slate-100 dark:divide-slate-800/80 text-xs sm:text-[13px]">
      {/* 1. Profile Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <CustomerAvatar
            url={conversation.avatar_url}
            name={conversation.customer_name}
            size="w-13 h-13"
            textClass="text-base font-bold"
          />

          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white truncate">
              {conversation.customer_name}
            </h3>
            <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
              PSID: {conversation.customer_psid || '—'}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {conversation.page_name}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
          <CloudOff className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>Đơn hàng và ghi chú vẫn lưu trên thiết bị này. Nhãn Facebook và giai đoạn do Meta tự động nhận diện sẽ được đồng bộ từ Meta.</span>
        </div>

        {/* Source badge */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-[13px]">
          <span className="text-slate-500 font-medium">Nguồn Traffic:</span>
          <span className={`font-bold flex items-center gap-1 ${conversation.source === 'ADS' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {conversation.source === 'ADS' ? '💰 Quảng Cáo (Ads)' : '🌱 Organic (Tự Nhiên)'}
          </span>
        </div>
      </div>

      {/* 2. Trạng thái đơn đặt hàng (Order Management) */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
            Trạng Thái Đơn Đặt Hàng
          </h4>
          <button
            onClick={onOpenCreateOrder}
            className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 transition-smooth border border-emerald-200/60 dark:border-emerald-800/60 text-xs"
          >
            <Plus className="w-3 h-3" /> Tạo đơn
          </button>
        </div>

        {orders && orders.length > 0 ? (
          <div className="space-y-2">
            {orders.map(ord => (
              <div key={ord.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                    {ord.product_name}
                  </span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    {Number(ord.amount).toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>SL: {ord.quantity || 1}</span>
                  <span>{new Date(ord.created_at).toLocaleDateString('vi-VN')}</span>
                </div>
                {ord.note && (
                  <p className="text-[11px] text-slate-500 italic mt-0.5 truncate">{ord.note}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-center py-2 italic text-[11px]">Chưa có đơn hàng nào</p>
        )}
      </div>

      {/* 3. Giai đoạn khách hàng tiềm năng (Lead Stages) */}
      <div className="p-4 space-y-2.5">
        <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          Giai Đoạn Khách Hàng
        </h4>

        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'potential', label: '⭐ Tiềm năng' },
            { id: 'consulting', label: '💬 Đang tư vấn' },
            { id: 'ordered', label: '✅ Đã đặt hàng' },
            { id: 'vip', label: '👑 Khách VIP' }
          ].map(stage => (
            <button
              key={stage.id}
              onClick={() => onUpdateLeadStage && onUpdateLeadStage(stage.id)}
                className={`min-h-10 p-2 rounded-xl text-center font-bold border transition-smooth text-xs ${
                leadStage === stage.id
                  ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 ring-1 ring-purple-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
              }`}
            >
              {stage.label}
            </button>
          ))}
        </div>
        <p className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${
          customerData?.lead_stage_source === 'meta_auto'
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
            : 'bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400'
        }`}>
          {leadStageSourceText}
        </p>
      </div>

      {/* 4. Nhãn & Gắn Tag Khách Hàng (Labels & Quick Tagging) */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-brand-500" />
            Nhãn Cuộc Trò Chuyện
          </h4>
          {onOpenLabelsManager && (
            <button
              onClick={onOpenLabelsManager}
              className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
            >
              + Quản lý nhãn
            </button>
          )}
        </div>

        {/* Assigned labels */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nhãn đã gắn ({currentLabels.length}):</span>
          <div className="flex flex-wrap gap-1.5 min-h-[26px] items-center">
            {currentLabels.length > 0 ? (
              currentLabels.map((lbl, lIdx) => (
                <span
                  key={lIdx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-white font-bold shadow-xs text-xs animate-in zoom-in-95 duration-150"
                  style={{ background: lbl.color || '#3b82f6' }}
                >
                  <span>{lbl.emoji || '🏷️'}</span>
                  <span>{lbl.name}</span>
                  {(lbl.source === 'meta' || lbl.source === 'meta_auto') && (
                    <span className="text-[9px] opacity-80" title="Đồng bộ từ Meta">☁</span>
                  )}
                  <button
                    onClick={() => handleLabelToggle(lbl)}
                    disabled={Boolean(pendingLabelKey)}
                    className="hover:opacity-75 ml-1 text-xs font-black"
                    title="Gỡ nhãn này"
                  >
                    ✕
                  </button>
                </span>
              ))
            ) : (
              <span className="text-slate-400 italic text-[11px]">Chưa gắn nhãn nào</span>
            )}
          </div>
        </div>

        {labelError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] font-semibold text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
            {labelError}
          </p>
        )}

        {/* Page-scoped label picker */}
        {availableLabels.length > 0 ? (
          <div className="space-y-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsLabelPickerOpen(open => !open)}
              className="flex min-h-9 w-full items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span>Chọn nhãn của Page ({availableLabels.length})</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isLabelPickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {isLabelPickerOpen && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-slate-800/40">
                <input
                  value={labelSearch}
                  onChange={event => setLabelSearch(event.target.value)}
                  placeholder="Tìm nhãn đúng sản phẩm..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900"
                />
                <p className="text-[10px] text-slate-500">Nút màu nhạt là nhãn có thể gắn; chỉ nhãn có dấu ✓ mới đang gắn.</p>
                <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
              {visibleAvailableLabels.map((lbl) => {
                const isAssigned = isLabelAssigned(lbl);
                const isPending = pendingLabelKey === getLabelKey(lbl);
                return (
                  <button
                    key={`${lbl.page_id || 'default'}_${lbl.id || lbl.name}`}
                    onClick={() => handleLabelToggle(lbl)}
                    disabled={Boolean(pendingLabelKey)}
                    className={`min-h-9 px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-all duration-150 border ${
                      isAssigned
                        ? 'ring-2 ring-brand-500 text-white shadow-xs border-transparent'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
                    }`}
                    style={isAssigned ? { background: lbl.color || '#64748b' } : undefined}
                  >
                    <span>{lbl.emoji || '🏷️'}</span>
                    <span>{lbl.name}</span>
                    <span className="text-[10px] ml-0.5 font-black">
                      {isPending ? '…' : isAssigned ? '✓' : '+'}
                    </span>
                  </button>
                );
              })}
                {visibleAvailableLabels.length === 0 && (
                  <span className="py-2 text-[11px] italic text-slate-400">Không tìm thấy nhãn phù hợp.</span>
                )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nhãn Gợi Ý Nhanh:</span>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_LABELS.map((sug, sIdx) => {
                const isAssigned = currentLabels.some(l => l.name === sug.name);
                return (
                  <button
                    key={sIdx}
                    onClick={() => {
                      if (isAssigned) {
                        onRemoveLabel && onRemoveLabel(sug.id || sug.name);
                      } else {
                        handleLabelToggle(sug);
                      }
                    }}
                    className={`px-2 py-1 rounded-md text-xs font-semibold transition-smooth border flex items-center gap-1 ${
                      isAssigned
                        ? 'bg-brand-500 text-white border-brand-600'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60'
                    }`}
                  >
                    <span>{sug.emoji}</span>
                    <span>{sug.name}</span>
                    <span>{isAssigned ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5. Ghi chú nội bộ (Notes) */}
      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-500" />
            Ghi Chú Nội Bộ
          </h4>
          <button
            onClick={() => setIsAddingNote(!isAddingNote)}
            className="text-brand-500 hover:underline font-bold text-xs"
          >
            {isAddingNote ? 'Đóng' : '+ Thêm'}
          </button>
        </div>

        {isAddingNote && (
          <form onSubmit={handleCreateNoteSubmit} className="space-y-2">
            <textarea
              rows="2"
              required
              placeholder="Nhập ghi chú cho nhân viên (khách không thấy)..."
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            ></textarea>
            <div className="flex justify-end gap-1.5">
              <button
                type="submit"
                className="px-3 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs"
              >
                Lưu ghi chú
              </button>
            </div>
          </form>
        )}

        {customerData?.notes && customerData.notes.length > 0 ? (
          <div className="space-y-2">
            {customerData.notes.map((note, nIdx) => (
              <div key={note.id || nIdx} className="p-2 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/60 text-slate-800 dark:text-slate-200 space-y-1">
                <p className="text-[11px] leading-relaxed">{note.note_text}</p>
                <div className="flex items-center justify-between text-[9px] text-slate-400">
                  <span>{formatDateTime(note.created_at)}</span>
                  <button onClick={() => onDeleteNote && onDeleteNote(note.id)} className="text-slate-400 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !isAddingNote && <p className="text-slate-400 italic text-[11px]">Chưa có ghi chú nào</p>
        )}
      </div>

      {/* 6. 📸 Ảnh Được Chia Sẻ (Shared Media Grid) */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
            <ImageIcon className="w-4 h-4 text-blue-500" />
            Ảnh Được Chia Sẻ ({sharedImages.length})
          </h4>
          {sharedImages.length > 0 && (
            <button
              onClick={() => setIsAllGalleryOpen(true)}
              className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-lg border border-blue-200/60 dark:border-blue-900/60"
            >
              <Grid className="w-3 h-3" /> Xem tất cả
            </button>
          )}
        </div>

        {sharedImages.length > 0 ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              {sharedImages.slice(0, 6).map((media, mIdx) => (
                <div
                  key={mIdx}
                  onClick={() => onOpenMediaModal && onOpenMediaModal(media)}
                  className="aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer group relative shadow-xs bg-slate-100 dark:bg-slate-800"
                >
                  <img
                    src={media.url}
                    alt={`Shared ${mIdx}`}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                    🔍
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setIsAllGalleryOpen(true)}
              className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs text-center transition-smooth border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Grid className="w-3.5 h-3.5 text-brand-500" />
              Mở Thư Viện ({sharedImages.length} ảnh)
            </button>
          </div>
        ) : (
          <p className="text-slate-400 italic text-center py-3 text-xs bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            Chưa có hình ảnh nào được gửi qua lại
          </p>
        )}
      </div>

      {/* 7. Thông tin liên hệ */}
      <div className="p-4 space-y-2.5 text-slate-600 dark:text-slate-400">
        <h4 className="font-bold text-slate-900 dark:text-white">Thông Tin Liên Hệ</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            <span>{customerData?.phone || 'Chưa có SĐT'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            <span>{customerData?.email || 'Chưa có Email'}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate">{customerData?.address || 'Chưa có địa chỉ'}</span>
          </div>
        </div>
      </div>

      {/* Modal: All Shared Media Gallery Grid */}
      {isAllGalleryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid className="w-5 h-5 text-brand-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Tất Cả Ảnh Được Chia Sẻ ({sharedImages.length} ảnh)
                </h3>
              </div>
              <button
                onClick={() => setIsAllGalleryOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-3 flex-1">
              {sharedImages.map((media, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setIsAllGalleryOpen(false);
                    if (onOpenMediaModal) onOpenMediaModal(media);
                  }}
                  className="aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer group relative shadow-xs"
                >
                  <img
                    src={media.url}
                    alt={`Photo ${idx}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                    🔍 Xem
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
