import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Calendar,
  Image as ImageIcon,
  Video,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  Sliders,
  ShieldCheck,
  Plus,
  RefreshCw,
  Eye,
  X,
  RotateCcw,
  ExternalLink,
  Bookmark,
  Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  fetchPages,
  publishToFacebookPage,
  compressImage,
  getFacebookPostUrl,
  getPageDisplayName
} from '../../services/facebookApi';

export default function PostStudio({ fbToken, onOpenTokenModal }) {
  const [pages, setPages] = useState(() => JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]'));
  const [selectedPageIds, setSelectedPageIds] = useState([]);
  const [postType, setPostType] = useState('photo'); // 'photo' | 'text' | 'video'
  const [postContent, setPostContent] = useState('');
  const [postLink, setPostLink] = useState('');
  
  // Media files & compressed blobs
  const [mediaFiles, setMediaFiles] = useState([]); // Array of File
  const [mediaPreviews, setMediaPreviews] = useState([]); // Array of { url, type, name, size }
  const [isCompressing, setIsCompressing] = useState(false);
  const [autoCompress, setAutoCompress] = useState(true);
  const [smartAntiSpam, setSmartAntiSpam] = useState(true);

  // Scheduling & Delay
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(3);

  // Publishing Execution State
  const [isPublishing, setIsPublishing] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [publishProgress, setPublishProgress] = useState({ percent: 0, status: '', success: 0, fail: 0 });
  const [pageResults, setPageResults] = useState([]); // Array of { pageId, pageName, avatar, status: 'pending'|'running'|'success'|'error', postId, error }
  const [failedPages, setFailedPages] = useState([]);
  const cancelRequestedRef = useRef(false);

  // Templates & History
  const [templates, setTemplates] = useState(() => JSON.parse(localStorage.getItem('metapost_templates') || '[]'));
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('metapost_history') || '[]'));
  const [mobileTab, setMobileTab] = useState('composer'); // 'pages' | 'composer'

  const fileInputRef = useRef(null);

  // Load pages on mount
  useEffect(() => {
    if (fbToken) {
      fetchPages(fbToken).then(res => {
        if (res.length > 0) {
          setPages(res);
          localStorage.setItem('metapost_pages_cache', JSON.stringify(res));
        }
      });
    }
  }, [fbToken]);

  // Page selection helpers
  const handleSelectAllPages = () => {
    if (selectedPageIds.length === pages.length) {
      setSelectedPageIds([]);
    } else {
      setSelectedPageIds(pages.map(p => p.id));
    }
  };

  const handleTogglePage = (pageId) => {
    setSelectedPageIds(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  // Media upload with smart canvas compression
  const handleMediaUpload = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    setIsCompressing(true);
    try {
      const processed = [];
      for (const file of rawFiles) {
        if (file.type.startsWith('image/') && autoCompress) {
          const compressed = await compressImage(file, 1920, 0.82);
          processed.push(compressed);
        } else {
          processed.push(file);
        }
      }

      if (postType === 'video') {
        // Only keep 1 video
        const vid = processed.find(f => f.type.startsWith('video/')) || processed[0];
        setMediaFiles([vid]);
        setMediaPreviews([{ url: URL.createObjectURL(vid), type: vid.type, name: vid.name, size: vid.size }]);
      } else {
        // Multi-photo
        setMediaFiles(prev => [...prev, ...processed]);
        const newPreviews = processed.map(f => ({
          url: URL.createObjectURL(f),
          type: f.type,
          name: f.name,
          size: f.size
        }));
        setMediaPreviews(prev => [...prev, ...newPreviews]);
      }
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveMedia = (index) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => {
      const target = prev[index];
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Template handling
  const handleSaveTemplate = () => {
    if (!postContent.trim()) {
      alert('Vui lòng nhập nội dung bài viết trước khi lưu mẫu!');
      return;
    }
    const name = window.prompt('Nhập tên gợi nhớ cho mẫu bài viết (Ví dụ: "Mẫu áo đấu 2026", "Mẫu khuyến mãi"):');
    if (!name?.trim()) return;

    const newTpl = {
      id: 'tpl_' + Date.now(),
      name: name.trim(),
      content: postContent,
      link: postLink,
      type: postType
    };
    const updated = [newTpl, ...templates];
    setTemplates(updated);
    localStorage.setItem('metapost_templates', JSON.stringify(updated));
    alert('🎉 Đã lưu mẫu bài viết thành công!');
  };

  const handleSelectTemplate = (tplId) => {
    setSelectedTemplateId(tplId);
    if (!tplId) return;
    const tpl = templates.find(t => t.id === tplId);
    if (tpl) {
      setPostContent(tpl.content || '');
      setPostLink(tpl.link || '');
      if (tpl.type) setPostType(tpl.type);
    }
  };

  // Execute Publishing Loop
  const executePublishLoop = async (targetPagesToPublish) => {
    setIsPublishing(true);
    setShowProgressModal(true);
    cancelRequestedRef.current = false;

    // Initialize page results table
    const initialRows = targetPagesToPublish.map(p => ({
      pageId: p.id,
      pageName: p.name,
      avatar: p.picture?.data?.url || '',
      status: 'pending',
      postId: null,
      error: ''
    }));
    setPageResults(initialRows);

    let successCount = 0;
    let failCount = 0;
    const failedList = [];
    let scheduleUnix = null;

    if (isScheduled && scheduleTime) {
      scheduleUnix = Math.floor(new Date(scheduleTime).getTime() / 1000);
    }

    for (let i = 0; i < targetPagesToPublish.length; i++) {
      if (cancelRequestedRef.current) {
        break;
      }

      const page = targetPagesToPublish[i];

      // Update state to running
      setPageResults(prev => prev.map(r => r.pageId === page.id ? { ...r, status: 'running' } : r));
      const percent = Math.round((i / targetPagesToPublish.length) * 100);
      setPublishProgress({
        percent,
        status: `Đang đăng tải [${i + 1}/${targetPagesToPublish.length}]: ${page.name}...`,
        success: successCount,
        fail: failCount
      });

      try {
        const res = await publishToFacebookPage(page, {
          postType,
          postText: postContent,
          postLink,
          mediaFiles,
          isScheduled,
          scheduleTimestamp: scheduleUnix,
          smartAntiSpam,
          pageIndex: i,
          totalPages: targetPagesToPublish.length
        });

        successCount++;
        const postId = res?.id || res?.post_id || 'OK';

        setPageResults(prev => prev.map(r =>
          r.pageId === page.id
            ? { ...r, status: 'success', postId }
            : r
        ));
      } catch (err) {
        failCount++;
        failedList.push(page);
        setPageResults(prev => prev.map(r =>
          r.pageId === page.id
            ? { ...r, status: 'error', error: err.message }
            : r
        ));
      }

      // Safe Delay between pages
      if (i < targetPagesToPublish.length - 1 && delaySeconds > 0 && !cancelRequestedRef.current) {
        await new Promise(r => setTimeout(r, delaySeconds * 1000));
      }
    }

    setFailedPages(failedList);
    setPublishProgress({
      percent: 100,
      status: cancelRequestedRef.current
        ? `Đã dừng tiến trình! Hoàn thành: ${successCount} | Thất bại: ${failCount}`
        : `Hoàn tất! Thành công: ${successCount} | Thất bại: ${failCount}`,
      success: successCount,
      fail: failCount
    });

    if (successCount > 0) {
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch {}
    }

    // Save history
    const historyEntry = {
      id: 'post_' + Date.now(),
      content: postContent,
      type: postType,
      mediaCount: mediaFiles.length,
      total: targetPagesToPublish.length,
      success: successCount,
      fail: failCount,
      time: new Date().toISOString()
    };
    const updatedHistory = [historyEntry, ...history.slice(0, 29)];
    setHistory(updatedHistory);
    localStorage.setItem('metapost_history', JSON.stringify(updatedHistory));

    setIsPublishing(false);
  };

  const handleStartPublish = () => {
    if (selectedPageIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 Fanpage để đăng bài!');
      return;
    }
    if (!postContent.trim() && mediaFiles.length === 0 && !postLink.trim()) {
      alert('Vui lòng nhập nội dung bài viết hoặc chọn ảnh/video đính kèm!');
      return;
    }

    const targetPages = pages.filter(p => selectedPageIds.includes(p.id));
    executePublishLoop(targetPages);
  };

  const handleCancelPublish = () => {
    cancelRequestedRef.current = true;
  };

  const handleRetryFailed = () => {
    if (failedPages.length === 0) return;
    const toRetry = [...failedPages];
    executePublishLoop(toRetry);
  };

  const targetPagesCount = selectedPageIds.length;

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-full bg-slate-50 dark:bg-slate-950">
      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex items-center border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 gap-1.5 flex-shrink-0">
        <button
          onClick={() => setMobileTab('pages')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'pages'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          <span>🚩 Chọn Page</span>
          <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
            {selectedPageIds.length}/{pages.length}
          </span>
        </button>
        <button
          onClick={() => setMobileTab('composer')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'composer'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Soạn Bài & Đăng</span>
        </button>
      </div>

      {/* Left: Page Selection Column */}
      <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col ${
        mobileTab === 'pages' ? 'flex flex-1' : 'hidden md:flex'
      }`}>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Chọn Fanpage Đăng Bài</h3>
            <p className="text-xs text-slate-500">Đã chọn {selectedPageIds.length} / {pages.length} Page</p>
          </div>
          <button
            onClick={handleSelectAllPages}
            className="text-xs font-bold text-brand-500 hover:underline"
          >
            {selectedPageIds.length === pages.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
          </button>
        </div>

        {/* Page List (Touch-scrollable) */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 touch-scroll-y overscroll-contain">
          {pages.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Chưa có Fanpage nào. Hãy cấu hình Token Facebook để nạp danh sách.
            </div>
          ) : (
            pages.map(page => {
              const isSelected = selectedPageIds.includes(page.id);
              const displayName = getPageDisplayName(page, pages);
              return (
                <div
                  key={page.id}
                  onClick={() => handleTogglePage(page.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-smooth ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border-brand-500 ring-1 ring-brand-500'
                      : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500 cursor-pointer"
                  />
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {page.picture?.data?.url ? (
                      <img src={page.picture.data.url} alt={page.name} className="w-full h-full object-cover" />
                    ) : (
                      '🚩'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">{displayName}</h4>
                    <p className="text-[10px] text-slate-400 truncate">{page.category || 'Trang Facebook'}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Mobile Continue Button */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 md:hidden bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={() => setMobileTab('composer')}
            className="w-full py-2.5 rounded-xl bg-brand-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-brand-500/20"
          >
            <span>Tiếp tục soạn bài ({selectedPageIds.length} Page)</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Middle & Right: Post Composer Studio */}
      <div className={`flex-1 overflow-y-auto p-4 md:p-6 flex flex-col max-w-4xl mx-auto w-full space-y-6 touch-scroll-y overscroll-contain ${
        mobileTab === 'composer' ? 'flex' : 'hidden md:flex'
      }`}>
        {/* Post Form Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-card space-y-5">
          {/* Header & Mode Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-500" />
              Soạn Bài Đăng Đồng Loạt
            </h2>

            {/* Post Type Selector (Photo / Video / Text) */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setPostType('photo')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-smooth ${
                  postType === 'photo' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> Ảnh / Album
              </button>
              <button
                type="button"
                onClick={() => setPostType('video')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-smooth ${
                  postType === 'video' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-purple-500" /> Video
              </button>
              <button
                type="button"
                onClick={() => setPostType('text')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-smooth ${
                  postType === 'text' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                📝 Văn bản / Link
              </button>
            </div>
          </div>

          {/* Templates Selector Bar */}
          <div className="flex items-center gap-2 pt-1">
            <select
              value={selectedTemplateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-brand-500"
            >
              <option value="">-- Chọn bài mẫu đã lưu ({templates.length}) --</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  🔖 {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 transition-smooth flex-shrink-0"
              title="Lưu nội dung đang soạn thành mẫu mới"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-500" /> Lưu mẫu
            </button>
          </div>

          {/* Main Textarea */}
          <div>
            <textarea
              rows="5"
              placeholder="Nhập nội dung bài đăng... (Hỗ trợ hashtag, emoji, xuống dòng, tự động gắn mã chống trùng lặp)"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="w-full p-4 text-[16px] sm:text-sm leading-relaxed rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-smooth resize-none"
            ></textarea>
            <div className="flex justify-between items-center text-xs text-slate-400 mt-1 px-1">
              <span>{postContent.length} ký tự</span>
              <button
                type="button"
                onClick={() => setPostContent(prev => prev + ' #aobongda #hadesfc #sportswear')}
                className="text-brand-500 hover:underline font-bold"
              >
                + Thêm Hashtag mẫu
              </button>
            </div>
          </div>

          {/* Optional Link Input for Text Mode */}
          {postType === 'text' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Liên kết đính kèm (URL tuỳ chọn)
              </label>
              <input
                type="url"
                placeholder="https://tastore68.vn/san-pham..."
                value={postLink}
                onChange={(e) => setPostLink(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white"
              />
            </div>
          )}

          {/* Media Upload & Preview Section */}
          {postType !== 'text' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {postType === 'video' ? 'Video đính kèm' : `Ảnh đính kèm (${mediaPreviews.length})`}
                  </span>
                  {isCompressing && (
                    <span className="text-[11px] text-amber-500 font-bold flex items-center gap-1 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Đang nén ảnh nhẹ...
                    </span>
                  )}
                </div>
                <label className="cursor-pointer text-xs font-bold text-brand-500 hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Thêm file {postType === 'video' ? 'video' : 'ảnh'}
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple={postType === 'photo'}
                    accept={postType === 'video' ? 'video/*' : 'image/*'}
                    onChange={handleMediaUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {mediaPreviews.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {mediaPreviews.map((m, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group shadow-xs bg-slate-100 dark:bg-slate-800">
                      {m.type?.startsWith('video/') ? (
                        <video src={m.url} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={m.url} alt="Upload preview" className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveMedia(idx)}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-red-600/90 hover:bg-red-600 text-white text-xs opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                        title="Xóa tệp"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 rounded-xl p-6 text-center text-slate-400 cursor-pointer transition-colors"
                >
                  {postType === 'video' ? (
                    <Video className="w-8 h-8 mx-auto mb-1 opacity-50 text-purple-500" />
                  ) : (
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50 text-emerald-500" />
                  )}
                  <p className="text-xs font-semibold">
                    {postType === 'video' ? 'Bấm để chọn 1 video (MP4, MOV)' : 'Kéo thả hoặc bấm để chọn ảnh (Hỗ trợ nhiều ảnh album)'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tự động nén thông minh, tiết kiệm dung lượng</p>
                </div>
              )}
            </div>
          )}

          {/* Posting Options: Delay, Anti-Spam & Schedule */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            {/* Safe Delay */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Giãn cách an toàn (Safe Delay)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="2"
                  max="15"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="flex-1 accent-brand-500"
                />
                <span className="font-bold text-slate-700 dark:text-slate-300 w-8">{delaySeconds}s</span>
              </div>
            </div>

            {/* Smart Anti-Spam Checkbox */}
            <div className="flex items-center gap-2 pt-2 md:pt-4">
              <input
                type="checkbox"
                id="chkAntiSpam"
                checked={smartAntiSpam}
                onChange={(e) => setSmartAntiSpam(e.target.checked)}
                className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500"
              />
              <label htmlFor="chkAntiSpam" className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                Smart Anti-Spam (Chống quét trùng lặp)
              </label>
            </div>

            {/* Schedule */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Hẹn giờ đăng bài
                </label>
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="rounded text-brand-500"
                />
              </div>
              {isScheduled && (
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              )}
            </div>
          </div>

          {/* Publish Action Button */}
          <div className="pt-2">
            <button
              onClick={handleStartPublish}
              disabled={isPublishing || targetPagesCount === 0}
              className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-extrabold text-sm shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-smooth disabled:opacity-50 active:scale-[0.99]"
            >
              <Send className="w-4 h-4" />
              <span>{isScheduled ? 'Lên Lịch Đăng Cho' : 'Đăng Bài Ngay Lên'} {targetPagesCount} Fanpage Đã Chọn</span>
            </button>
          </div>
        </div>

        {/* Live Mockup Preview */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-card space-y-3">
          <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Eye className="w-4 h-4" /> Xem Trước Thực Tế (Live Facebook Preview)
          </h3>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-600 flex items-center justify-center font-black text-sm">
                🚩
              </div>
              <div>
                <p className="font-bold text-xs text-slate-900 dark:text-white">
                  {targetPagesCount > 0 ? `Đăng lên ${targetPagesCount} Fanpage` : 'Chưa chọn Fanpage'}
                </p>
                <p className="text-[10px] text-slate-400">Vừa xong • 🌐 Công khai</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
              {postContent || <span className="text-slate-400 italic">Nội dung bài viết sẽ hiển thị tại đây...</span>}
            </p>

            {mediaPreviews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl overflow-hidden">
                {mediaPreviews.slice(0, 3).map((m, i) => (
                  <div key={i} className="aspect-square bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    {m.type?.startsWith('video/') ? (
                      <video src={m.url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={m.url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Publishing Progress & Results Modal */}
      {showProgressModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Tiến Trình Đăng Bài Đa Page</h3>
                <p className="text-xs text-slate-500">{publishProgress.status}</p>
              </div>
              {!isPublishing && (
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Progress Bar */}
            <div className="p-6 pb-3 space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Tiến độ</span>
                <span>{publishProgress.percent}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all duration-300 rounded-full"
                  style={{ width: `${publishProgress.percent}%` }}
                ></div>
              </div>
            </div>

            {/* Per-Page Status List */}
            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2 divide-y divide-slate-100 dark:divide-slate-800/60 touch-scroll-y">
              {pageResults.map((row) => (
                <div key={row.pageId} className="pt-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                      {row.avatar ? <img src={row.avatar} alt="" className="w-full h-full object-cover" /> : '🚩'}
                    </div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{row.pageName}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {row.status === 'pending' && (
                      <span className="text-slate-400 font-medium">Đang chờ...</span>
                    )}
                    {row.status === 'running' && (
                      <span className="text-blue-500 font-bold flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang đăng...
                      </span>
                    )}
                    {row.status === 'success' && (
                      <div className="flex items-center gap-1 text-emerald-600 font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Thành công</span>
                        {row.postId && (
                          <a
                            href={getFacebookPostUrl(row.pageId, row.postId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-500 hover:underline ml-1"
                            title="Mở bài viết trên Facebook"
                          >
                            <ExternalLink className="w-3.5 h-3.5 inline" />
                          </a>
                        )}
                      </div>
                    )}
                    {row.status === 'error' && (
                      <span className="text-red-500 font-bold flex items-center gap-1" title={row.error}>
                        <AlertCircle className="w-4 h-4" /> Thất bại
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50">
              {isPublishing ? (
                <button
                  type="button"
                  onClick={handleCancelPublish}
                  className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 font-bold text-xs border border-red-200 dark:border-red-800 hover:bg-red-100"
                >
                  Dừng tiến trình
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {failedPages.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRetryFailed}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Thử lại {failedPages.length} Page lỗi
                    </button>
                  )}
                </div>
              )}

              {!isPublishing && (
                <button
                  type="button"
                  onClick={() => setShowProgressModal(false)}
                  className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs"
                >
                  Đóng
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
