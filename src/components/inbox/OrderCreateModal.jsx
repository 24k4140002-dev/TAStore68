import React, { useState } from 'react';
import { X, ShoppingBag, DollarSign, Package, Check, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function OrderCreateModal({ customer, conversation, onClose, onOrderCreated }) {
  const [productName, setProductName] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('confirmed');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productName.trim() || !amount) return;

    setLoading(true);
    try {
      const newOrder = {
        id: 'ord_' + Date.now(),
        customer_name: customer?.name || conversation?.customer_name,
        customer_psid: customer?.psid || conversation?.customer_psid,
        product_name: productName.trim(),
        amount: Number(amount),
        quantity: Number(quantity),
        note: note.trim(),
        status,
        created_at: new Date().toISOString()
      };

      // Fire confetti effect!
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch {}

      if (onOrderCreated) {
        onOrderCreated(newOrder);
      }

      onClose();
    } catch (err) {
      alert('Lỗi tạo đơn: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Tạo Đơn Đặt Hàng Mới</h3>
              <p className="text-xs text-slate-500">Khách hàng: {customer?.name || conversation?.customer_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên sản phẩm / Dịch vụ *
            </label>
            <input
              type="text"
              required
              placeholder="VD: Áo đấu CLB Hades FC (Size L)"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-smooth"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tổng tiền (VNĐ) *
              </label>
              <input
                type="number"
                required
                min="0"
                step="1000"
                placeholder="VD: 350000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-smooth"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số lượng
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-smooth"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Trạng thái đơn
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-smooth"
            >
              <option value="confirmed">✅ Đã xác nhận / Đang chuẩn bị</option>
              <option value="shipped">🚚 Đang giao hàng</option>
              <option value="completed">🎉 Hoàn thành / Đã thanh toán</option>
              <option value="cancelled">❌ Đã huỷ</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú đơn hàng (Địa chỉ, số ĐT, yêu cầu in ấn...)
            </label>
            <textarea
              rows="3"
              placeholder="VD: In số 10 tên Tùng, ship giờ hành chính..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-smooth resize-none"
            ></textarea>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-smooth disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Tạo Đơn Hàng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
