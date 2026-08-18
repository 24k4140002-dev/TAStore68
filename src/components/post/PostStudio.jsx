import React, { useState, useEffect } from 'react';
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
  Eye
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { fetchPages, safeFetch } from '../../services/facebookApi';

export default function PostStudio({ fbToken, onOpenTokenModal }) {
  const [pages, setPages] = useState(() => JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]'));
  const [selectedPageIds, setSelectedPageIds] = useState([]);
  const [postContent, setPostContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaPreviews, setMediaPreviews] = useState([]);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [isPosting, setIsPosting] = useState(false);
  const [postingLogs, setPostingLogs] = useState([]);
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('metapost_history') || '[]'));
  const [mobileTab, setMobileTab] = useState('composer'); // 'pages' | 'composer'

  // Load pages
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

  const handleMediaUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setMediaFiles(prev => [...prev, ...files]);
      const newPreviews = files.map(f => ({
        name: f.name,
        type: f.type,
        url: URL.createObjectURL(f)
      }));
      setMediaPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const handleRemoveMedia = (index) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Execute Multi-Page Posting
  const handlePublish = async () => {
    if (selectedPageIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 Fanpage để đăng bài!');
      return;
    }
    if (!postContent.trim() && mediaFiles.length === 0) {
      alert('Vui lòng nhập nội dung bài viết hoặc đính kèm ảnh/video!');
      return;
    }

    setIsPosting(true);
    setPostingLogs([]);

    const targetPages = pages.filter(p => selectedPageIds.includes(p.id));
    const newLogs = [];

    for (let i = 0; i < targetPages.length; i++) {
      const page = targetPages[i];
      const pageToken = page.access_token || fbToken;

      try {
        // Step log: Posting to page
        setPostingLogs(prev => [
          ...prev,
          { pageName: page.name, status: 'running', message: 'Đang đăng tải...' }
        ]);

        let endpoint = `https://graph.facebook.com/v19.0/${page.id}/feed`;
        const postData = {
          message: postContent,
          access_token: pageToken
        };

        if (isScheduled && scheduleTime) {
          const unixTime = Math.floor(new Date(scheduleTime).getTime() / 1000);
          postData.published = false;
          postData.scheduled_publish_time = unixTime;
        }

        const res = await safeFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postData)
        });

        // Update success log
        setPostingLogs(prev => prev.map(l =>
          l.pageName === page.name
            ? { pageName: page.name, status: 'success', message: `✅ Thành công (ID: ${res.id || 'OK'})` }
            : l
        ));

        // Delay between posts to protect page health
        if (i < targetPages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        }
      } catch (err) {
        setPostingLogs(prev => prev.map(l =>
          l.pageName === page.name
            ? { pageName: page.name, status: 'error', message: `❌ Thất bại: ${err.message}` }
            : l
        ));
      }
    }

    // Save to history
    const historyEntry = {
      id: 'post_' + Date.now(),
      content: postContent,
      pageCount: targetPages.length,
      time: new Date().toISOString(),
      mediaCount: mediaFiles.length
    };
    const updatedHistory = [historyEntry, ...history.slice(0, 19)];
    setHistory(updatedHistory);
    localStorage.setItem('metapost_history', JSON.stringify(updatedHistory));

    try {
      confetti({ particleCount: 70, spread: 60 });
    } catch {}

    setIsPosting(false);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-[calc(100vh-61px)] bg-slate-50 dark:bg-slate-950">
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
      <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col select-none ${
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

        {/* Page List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {pages.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Chưa có Fanpage nào. Hãy dán Facebook Token để tải danh sách.
            </div>
          ) : (
            pages.map(page => {
              const isSelected = selectedPageIds.includes(page.id);
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
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">{page.name}</h4>
                    <p className="text-[10px] text-slate-400 truncate">{page.category || 'Trang Facebook'}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Mobile bottom button to switch to composer */}
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

      {/* Middle & Right: Post Composer */}
      <div className={`flex-1 overflow-y-auto p-4 md:p-6 flex flex-col max-w-4xl mx-auto w-full space-y-6 ${
        mobileTab === 'composer' ? 'flex' : 'hidden md:flex'
      }`}>
        {/* Post Form Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-card space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-500" />
              Soạn Nội Dung Đăng Đồng Loạt
            </h2>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Chế độ Safe Delay {delaySeconds}s (Chống checkpoint)
            </div>
          </div>

          {/* Textarea */}
          <div>
            <textarea
              rows="5"
              placeholder="Bạn muốn chia sẻ nội dung gì hôm nay? (Hỗ trợ hashtag, biểu tượng cảm xúc, xuống dòng...)"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="w-full p-4 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-smooth resize-none"
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

          {/* Media Attachments Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Hình ảnh & Video đính kèm ({mediaPreviews.length})
              </span>
              <label className="cursor-pointer text-xs font-bold text-brand-500 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm file
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleMediaUpload}
                  className="hidden"
                />
              </label>
            </div>

            {mediaPreviews.length > 0 ? (
              <div className="grid grid-cols-4 gap-3">
                {mediaPreviews.map((m, idx) => (
                  <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group shadow-xs">
                    {m.type.startsWith('video/') ? (
                      <video src={m.url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={m.url} alt="Media" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => handleRemoveMedia(idx)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-600/80 hover:bg-red-600 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center text-slate-400">
                <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                <p className="text-xs font-medium">Kéo thả ảnh hoặc bấm "+ Thêm file" để đăng kèm hình ảnh/video</p>
              </div>
            )}
          </div>

          {/* Options: Delay & Schedule */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Giãn cách giữa các Page (Safe Delay)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="2"
                  max="20"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="flex-1 accent-brand-500"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-8">{delaySeconds}s</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
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
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              )}
            </div>
          </div>

          {/* Publish Action Button */}
          <div className="pt-2">
            <button
              onClick={handlePublish}
              disabled={isPosting || selectedPageIds.length === 0}
              className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-extrabold text-sm shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-smooth disabled:opacity-50"
            >
              {isPosting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Đang đăng lên các Fanpage...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Đăng Bài Ngay Lên {selectedPageIds.length} Fanpage Đã Chọn
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Posting Logs */}
        {postingLogs.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-card space-y-3">
            <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Tiến Trình Đăng Bài
            </h3>
            <div className="space-y-2">
              {postingLogs.map((log, lIdx) => (
                <div key={lIdx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{log.pageName}</span>
                  <span className={log.status === 'success' ? 'text-emerald-500 font-bold' : log.status === 'error' ? 'text-red-500 font-bold' : 'text-blue-500 font-bold'}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
