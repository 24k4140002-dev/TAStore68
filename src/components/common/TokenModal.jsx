import React, { useEffect, useState } from 'react';
import { X, Key, ShieldCheck, Check, Zap, AlertCircle, CheckCircle2, QrCode, Smartphone, Copy, Trash2 } from 'lucide-react';
import { exchangePermanentToken, fetchPages, cleanFacebookToken } from '../../services/facebookApi';

export default function TokenModal({ currentToken, onClose, onSave, onClear }) {
  const [tab, setTab] = useState('direct'); // 'direct' | 'upgrade' | 'mobile_qr'
  const [tokenInput, setTokenInput] = useState(currentToken || '');
  const [shortToken, setShortToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isCopiedLink, setIsCopiedLink] = useState(false);
  const [mobileQrDataUrl, setMobileQrDataUrl] = useState('');
  const [mobileQrError, setMobileQrError] = useState('');

  // Generate Mobile Quick Sync URL
  const getMobileSyncUrl = () => {
    const activeToken = currentToken || tokenInput;
    if (!activeToken) return '';
    const origin = window.location.origin;
    return `${origin}/#sync_token=${encodeURIComponent(activeToken)}`;
  };

  const mobileSyncUrl = getMobileSyncUrl();

  // Remove legacy browser-stored app credentials from older releases.
  useEffect(() => {
    localStorage.removeItem('metapost_app_id');
    localStorage.removeItem('metapost_app_secret');
  }, []);

  // Generate the QR entirely on-device. The Facebook token is never sent to a
  // third-party QR service.
  useEffect(() => {
    let cancelled = false;
    setMobileQrDataUrl('');
    setMobileQrError('');

    if (tab !== 'mobile_qr' || !mobileSyncUrl) return () => {
      cancelled = true;
    };

    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(mobileSyncUrl, {
        width: 440,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' }
      }))
      .then((dataUrl) => {
        if (!cancelled) setMobileQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setMobileQrError('Không thể tạo mã QR trên thiết bị này.');
      });

    return () => {
      cancelled = true;
    };
  }, [mobileSyncUrl, tab]);

  const handleCopySyncLink = () => {
    if (!mobileSyncUrl) return;
    navigator.clipboard.writeText(mobileSyncUrl);
    setIsCopiedLink(true);
    setTimeout(() => setIsCopiedLink(false), 2000);
  };

  const handleClearToken = () => {
    if (!window.confirm('Gỡ Facebook Token và cache hội thoại có chứa Page Token khỏi thiết bị này? Đơn hàng, ghi chú và mẫu trả lời vẫn được giữ lại.')) return;
    onClear?.();
    onClose();
  };

  const handleDirectSave = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    const clean = cleanFacebookToken(tokenInput);
    if (!clean) {
      setErrorMessage('Vui lòng dán Access Token vào ô bên dưới');
      return;
    }

    setIsLoading(true);
    try {
      const pages = await fetchPages(clean);
      if (!pages || pages.length === 0) {
        setErrorMessage('Token không có quyền quản trị Fanpage nào hoặc đã hết hạn.');
        return;
      }
      setSuccessMessage(`🎉 Đã kết nối thành công ${pages.length} Fanpage!`);
      setTimeout(() => {
        onSave(clean, pages);
        onClose();
      }, 700);
    } catch (err) {
      if (err.message?.includes('190') || err.message?.includes('expired') || err.message?.includes('Session')) {
        setErrorMessage('⚠️ Token của bạn đã hết hạn (Facebook Error #190). Vui lòng lấy Token mới từ Graph API Explorer hoặc dùng tab Token Dài Hạn.');
      } else {
        setErrorMessage(`Lỗi xác thực Facebook: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgradePermanent = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    const cleanShort = cleanFacebookToken(shortToken);

    if (!cleanShort) {
      setErrorMessage('Vui lòng dán Token ngắn hạn vào ô bên dưới');
      return;
    }

    setIsLoading(true);
    try {
      // Exchange token securely via Vercel Serverless Function /api/meta/exchange-token
      const longLivedToken = await exchangePermanentToken(cleanShort);
      const pages = await fetchPages(longLivedToken);
      if (!pages || pages.length === 0) {
        setErrorMessage('Token đổi thành công nhưng không tìm thấy Fanpage nào.');
        return;
      }
      setSuccessMessage(`🎉 Đổi token dài hạn thành công! Đã kết nối ${pages.length} Fanpage.`);
      setTimeout(() => {
        onSave(longLivedToken, pages);
        onClose();
      }, 700);
    } catch (err) {
      setErrorMessage(`Lỗi đổi Token: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center font-bold">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Cấu Hình Facebook Token</h3>
              <p className="text-xs text-slate-500">Kết nối Fanpage để quản lý Chat & Đăng bài</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ cấu hình Facebook Token"
            title="Đóng"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab('direct')}
              className={`py-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 ${
                tab === 'direct'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Dán Token</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('upgrade')}
              className={`py-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 ${
                tab === 'upgrade'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Token Dài Hạn</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('mobile_qr')}
              className={`py-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 ${
                tab === 'mobile_qr'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-500" />
              <span>Quét QR Mobile</span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Tab 1: Direct Token Paste */}
          {tab === 'direct' && (
            <form onSubmit={handleDirectSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Access Token (Bắt đầu bằng EAA...) *
                </label>
                <textarea
                  rows="4"
                  required
                  placeholder="Dán token Facebook của bạn vào đây..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full p-3 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none transition-smooth resize-none break-all"
                ></textarea>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-2 text-red-700 dark:text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2 text-emerald-700 dark:text-emerald-300 text-xs">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{successMessage}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex items-start gap-2 text-slate-600 dark:text-slate-400 text-xs">
                <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-500" />
                <span>Token chỉ được lưu trên trình duyệt này. Không dùng ứng dụng trên máy lạ hoặc máy dùng chung.</span>
              </div>

              {currentToken && (
                <button
                  type="button"
                  onClick={handleClearToken}
                  className="w-full px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Gỡ Token khỏi thiết bị này</span>
                </button>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-500/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Đang kết nối Facebook...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Lưu & Kích Hoạt</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Tab 2: Long-lived Token Generator (Serverless Backend Exchange) */}
          {tab === 'upgrade' && (
            <form onSubmit={handleUpgradePermanent} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Token Ngắn Hạn (User Token từ Graph API Explorer) *
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="Dán token ngắn hạn (bắt đầu bằng EAA...) vào đây..."
                  value={shortToken}
                  onChange={(e) => setShortToken(e.target.value)}
                  className="w-full p-3 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none transition-smooth resize-none break-all"
                ></textarea>
                <p className="text-[11px] text-slate-400 mt-1">
                  Hệ thống đổi sang token dài hạn qua máy chủ. User token thường có thời hạn;
                  quyền Page còn phụ thuộc trạng thái tài khoản và ứng dụng Meta.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-2 text-red-700 dark:text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2 text-emerald-700 dark:text-emerald-300 text-xs">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{successMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-amber-700 hover:bg-amber-800 text-white shadow-md shadow-amber-500/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Đang đổi token...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Đổi & Kích Hoạt Token Dài Hạn</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Tab 3: Mobile QR Code Quick Sync */}
          {tab === 'mobile_qr' && (
            <div className="p-6 space-y-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                <Smartphone className="w-5 h-5" />
                <span>Đồng Bộ Sang Điện Thoại Không Cần Nhập Token</span>
              </div>
              <p className="text-xs text-slate-500 max-w-sm">
                Quét bằng Camera iPhone, mở link trong Safari rồi bấm <strong>Chia sẻ → Thêm vào Màn hình chính</strong>. Shortcut mới sẽ tự nhận Token ở lần mở đầu tiên.
              </p>

              <div className="w-full p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-left text-[11px] text-amber-800 dark:text-amber-200">
                Mã QR này chứa quyền truy cập Facebook. Chỉ quét trên thiết bị cá nhân,
                không chụp màn hình hoặc gửi cho người khác.
              </div>

              {mobileSyncUrl ? (
                <div className="p-4 bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col items-center">
                  {mobileQrDataUrl ? (
                    <img
                      src={mobileQrDataUrl}
                      alt="Mã QR đồng bộ token sang thiết bị cá nhân"
                      className="w-48 h-48 rounded-xl object-contain"
                    />
                  ) : (
                    <div className="w-48 h-48 rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                      {mobileQrError || 'Đang tạo mã QR trên thiết bị...'}
                    </div>
                  )}
                  <span className="text-[11px] text-slate-400 font-medium mt-2">
                    Quét → mở Safari → thêm shortcut ngay từ trang đó
                  </span>
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 text-xs">
                  Vui lòng lưu Token trên máy tính trước để tạo mã QR đồng bộ sang điện thoại.
                </div>
              )}

              {mobileSyncUrl && (
                <div className="w-full flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCopySyncLink}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-smooth"
                  >
                    {isCopiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopiedLink ? 'Đã sao chép liên kết!' : 'Sao chép link gửi qua Zalo'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  >
                    Đóng
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

