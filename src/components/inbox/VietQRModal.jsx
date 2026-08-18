import React, { useState } from 'react';
import { X, QrCode, Send, Download, Check, Sparkles, Building2, CreditCard, User, Banknote } from 'lucide-react';
import { VIETQR_BANKS, generateVietQRUrl } from '../../services/facebookApi';

export default function VietQRModal({ isOpen, onClose, onSendQR, customerName, defaultAmount = '' }) {
  // Persistent Bank Config
  const savedBankConfig = (() => {
    try {
      return JSON.parse(localStorage.getItem('metapost_bank_config') || '{}');
    } catch {
      return {};
    }
  })();

  const [bankCode, setBankCode] = useState(savedBankConfig.bankCode || 'MB');
  const [accountNo, setAccountNo] = useState(savedBankConfig.accountNo || '');
  const [accountName, setAccountName] = useState(savedBankConfig.accountName || '');
  const [amount, setAmount] = useState(defaultAmount || '');
  const [memo, setMemo] = useState(() => {
    const nameSlug = (customerName || 'khach').replace(/[^a-zA-Z0-9]/g, '');
    return `TAStore68 ${nameSlug}`.trim();
  });

  const [isSending, setIsSending] = useState(false);
  const [isSavedBank, setIsSavedBank] = useState(false);

  if (!isOpen) return null;

  const qrUrl = generateVietQRUrl({
    bankCode,
    accountNo,
    accountName,
    amount,
    memo
  });

  const handleSaveBankConfig = () => {
    const config = { bankCode, accountNo, accountName };
    localStorage.setItem('metapost_bank_config', JSON.stringify(config));
    setIsSavedBank(true);
    setTimeout(() => setIsSavedBank(false), 2000);
  };

  const handleSendToChat = async () => {
    if (!accountNo.trim()) {
      alert('Vui lòng nhập Số tài khoản ngân hàng');
      return;
    }

    setIsSending(true);
    try {
      // Save bank config for next time
      handleSaveBankConfig();

      // Fetch the generated QR image as a Blob
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const qrFile = new File([blob], `vietqr_${Date.now()}.png`, { type: 'image/png' });

      const formattedAmount = amount ? Number(amount).toLocaleString('vi-VN') + ' đ' : '';
      const textMessage = `Dạ shop gửi bạn mã VietQR chuyển khoản thanh toán nhanh:\n• Số tiền: ${formattedAmount || 'Theo thỏa thuận'}\n• Ngân hàng: ${bankCode}\n• STK: ${accountNo} - ${accountName}\n• Nội dung: ${memo}\n\nBạn quét mã QR trên ứng dụng ngân hàng là đúng chính xác 100% số tiền và nội dung ạ! ✨`;

      await onSendQR({ file: qrFile, text: textMessage });
      onClose();
    } catch (e) {
      console.error('Error sending QR:', e);
      alert('Không thể gửi mã QR vào chat: ' + e.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Tạo Mã VietQR Thanh Toán</h3>
              <p className="text-xs text-slate-500">Tự sinh mã QR có sẵn số tiền & nội dung gửi khách</p>
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
          {/* Top: Inputs */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" /> Ngân hàng *
                </label>
                <select
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  {VIETQR_BANKS.map(b => (
                    <option key={b.code} value={b.code}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Số tài khoản (STK) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: 0987654321"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  className="w-full p-2 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" /> Tên chủ tài khoản *
                </label>
                <input
                  type="text"
                  required
                  placeholder="NGUYEN VAN A"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value.toUpperCase())}
                  className="w-full p-2 text-xs font-bold uppercase rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5 text-slate-400" /> Số tiền (VNĐ)
                </label>
                <input
                  type="number"
                  placeholder="Ví dụ: 250000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full p-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nội dung chuyển khoản
              </label>
              <input
                type="text"
                placeholder="TAStore68 Ao Bong Da"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* QR Preview Card */}
          {accountNo ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
              <div className="bg-white p-2.5 rounded-xl shadow-md border border-slate-100 max-w-[220px]">
                <img
                  src={qrUrl}
                  alt="VietQR Code"
                  className="w-full h-auto rounded-lg object-contain"
                />
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-2">
                {amount ? Number(amount).toLocaleString('vi-VN') + ' đ' : 'Chưa nhập số tiền'}
              </p>
              <p className="text-[11px] text-slate-500">
                {bankCode} • {accountNo} • {accountName || 'CHỦ TÀI KHOẢN'}
              </p>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 text-center text-amber-700 dark:text-amber-300 text-xs font-medium">
              Vui lòng nhập Số tài khoản và Tên chủ tài khoản ở trên để tạo mã QR chuẩn VietQR.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={handleSaveBankConfig}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-medium"
          >
            {isSavedBank ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : null}
            <span>{isSavedBank ? 'Đã lưu STK mặc định' : 'Lưu STK làm mặc định'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Huỷ
            </button>
            <button
              type="button"
              disabled={isSending || !accountNo}
              onClick={handleSendToChat}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Đang gửi...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Gửi Vào Chat Messenger</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
