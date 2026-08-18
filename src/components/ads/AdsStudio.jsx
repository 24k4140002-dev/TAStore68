import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  MessageSquare,
  Eye,
  MousePointer,
  RefreshCw,
  SlidersHorizontal,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Layers,
  Search,
  Key,
  HelpCircle,
  Edit2,
  Check,
  X
} from 'lucide-react';
import {
  fetchAdAccounts,
  fetchAdAccountInsights,
  fetchCampaignsWithInsights,
  toggleCampaignStatus,
  updateCampaignBudget
} from '../../services/facebookApi';

const DATE_PRESETS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'yesterday', label: 'Hôm qua' },
  { id: 'last_7d', label: '7 ngày qua' },
  { id: 'this_month', label: 'Tháng này' },
  { id: 'last_30d', label: '30 ngày qua' }
];

function formatVnd(val) {
  if (!val && val !== 0) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(val);
}

function formatNumber(val) {
  if (!val && val !== 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(val);
}

export default function AdsStudio({ fbToken, onOpenTokenModal, activeTab, onSwitchTab }) {
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(() => localStorage.getItem('metapost_selected_ad_acc') || '');
  const [datePreset, setDatePreset] = useState('today');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // High-level Account Insights
  const [accountInsights, setAccountInsights] = useState(null);

  // Campaigns list
  const [campaigns, setCampaigns] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'PAUSED'

  // Budget editing state
  const [editingBudgetId, setEditingBudgetId] = useState(null);
  const [editBudgetValue, setEditBudgetValue] = useState('');
  const [isUpdatingBudget, setIsUpdatingBudget] = useState(false);

  // 1. Fetch Ad Accounts on mount
  useEffect(() => {
    if (!fbToken) return;

    async function loadAccounts() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchAdAccounts(fbToken);
        if (res.error) {
          setErrorMsg(res.error.message || 'Không thể lấy danh sách tài khoản quảng cáo.');
          setAdAccounts([]);
        } else if (Array.isArray(res) && res.length > 0) {
          setAdAccounts(res);
          const saved = localStorage.getItem('metapost_selected_ad_acc');
          if (saved && res.some(a => a.id === saved)) {
            setSelectedAccountId(saved);
          } else {
            setSelectedAccountId(res[0].id);
            localStorage.setItem('metapost_selected_ad_acc', res[0].id);
          }
        } else {
          setAdAccounts([]);
          setErrorMsg('Token hiện tại chưa có quyền `ads_read` hoặc tài khoản Facebook này chưa có Tài khoản Quảng cáo nào.');
        }
      } catch (err) {
        setErrorMsg('Lỗi kết nối Facebook Ads API.');
      } finally {
        setIsLoading(false);
      }
    }

    loadAccounts();
  }, [fbToken]);

  // 2. Fetch Insights & Campaigns when selected Account or Date Preset changes
  const loadDashboardData = useCallback(async () => {
    if (!fbToken || !selectedAccountId) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const [insightsRes, campaignsRes] = await Promise.all([
        fetchAdAccountInsights(selectedAccountId, fbToken, datePreset),
        fetchCampaignsWithInsights(selectedAccountId, fbToken, datePreset)
      ]);

      if (insightsRes?.error) {
        setErrorMsg(insightsRes.error.message);
      } else {
        setAccountInsights(insightsRes);
      }

      if (campaignsRes?.error) {
        console.warn('Campaigns error:', campaignsRes.error);
      } else if (Array.isArray(campaignsRes)) {
        setCampaigns(campaignsRes);
      }
    } catch (err) {
      setErrorMsg('Không thể tải chỉ số quảng cáo.');
    } finally {
      setIsLoading(false);
    }
  }, [fbToken, selectedAccountId, datePreset]);

  useEffect(() => {
    if (selectedAccountId) {
      loadDashboardData();
    }
  }, [selectedAccountId, datePreset, loadDashboardData]);

  // Handle Ad Account Change
  const handleAccountChange = (accId) => {
    setSelectedAccountId(accId);
    localStorage.setItem('metapost_selected_ad_acc', accId);
  };

  // Handle Toggle Campaign Active / Paused
  const handleToggleStatus = async (campaign) => {
    const nextStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    // Optimistic UI update
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: nextStatus } : c));

    try {
      await toggleCampaignStatus(campaign.id, nextStatus, fbToken);
    } catch (err) {
      alert(`Lỗi khi ${nextStatus === 'ACTIVE' ? 'bật' : 'tắt'} chiến dịch: ${err.message}`);
      // Revert on error
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: campaign.status } : c));
    }
  };

  // Handle Save Budget
  const handleSaveBudget = async (campaignId) => {
    const num = parseInt(editBudgetValue.replace(/\D/g, ''), 10);
    if (!num || num < 20000) {
      alert('Ngân sách tối thiểu là 20.000 ₫/ngày');
      return;
    }

    setIsUpdatingBudget(true);
    try {
      await updateCampaignBudget(campaignId, num, fbToken);
      setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, daily_budget: num } : c));
      setEditingBudgetId(null);
    } catch (err) {
      alert(`Lỗi đổi ngân sách: ${err.message}`);
    } finally {
      setIsUpdatingBudget(false);
    }
  };

  // Filtered Campaigns
  const filteredCampaigns = campaigns.filter(c => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      return c.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const selectedAccount = adAccounts.find(a => a.id === selectedAccountId);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 overflow-y-auto font-sans p-3 sm:p-5 lg:p-6 space-y-5">
      {/* 1. Top Header Bar (Account Selector, Date Presets, Refresh) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {/* Left: Account Dropdown & Mobile Switcher */}
        <div className="flex items-center justify-between md:justify-start gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="relative min-w-[160px] sm:min-w-[220px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                Tài khoản quảng cáo
              </label>
              <div className="relative">
                <select
                  value={selectedAccountId}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  disabled={adAccounts.length === 0 || isLoading}
                  className="w-full pl-2.5 pr-7 py-1.5 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none truncate cursor-pointer"
                >
                  {adAccounts.length === 0 ? (
                    <option value="">Chưa có tài khoản Ads</option>
                  ) : (
                    adAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.account_id}) - {acc.currency}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
              </div>
            </div>
          </div>

          {/* Mobile Tab Quick Switcher */}
          {onSwitchTab && (
            <div className="flex md:hidden items-center gap-1">
              <button
                type="button"
                onClick={() => onSwitchTab('inbox')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200"
              >
                💬 Inbox
              </button>
              <button
                type="button"
                onClick={() => onSwitchTab('post')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200"
              >
                📝 Đăng bài
              </button>
            </div>
          )}
        </div>

        {/* Right: Date Presets & Refresh */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
          {/* Date Presets Pills */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {DATE_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setDatePreset(p.id)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-smooth ${
                  datePreset === p.id
                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadDashboardData}
            disabled={isLoading || !selectedAccountId}
            className={`p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-smooth flex-shrink-0 ${
              isLoading ? 'animate-spin text-brand-500' : ''
            }`}
            title="Làm mới số liệu Ads"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Error / Permission Notice Banner */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3 text-amber-800 dark:text-amber-300 animate-in fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-sm mb-1 text-amber-900 dark:text-amber-200">Cần quyền đọc Tài khoản Quảng cáo (`ads_read`)</h4>
            <p className="leading-relaxed mb-2">
              {errorMsg}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onOpenTokenModal}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-smooth flex items-center gap-1.5 shadow-xs"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Cập nhật Token Facebook</span>
              </button>
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-bold hover:bg-amber-100 transition-smooth"
              >
                ↗ Mở Meta Graph Explorer để cấp quyền `ads_read` & `ads_management`
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 3. KPI Summary Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Tổng chi tiêu */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              💸 Tiền đã tiêu
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {formatVnd(accountInsights?.spend || 0)}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {DATE_PRESETS.find(p => p.id === datePreset)?.label}
          </p>
        </div>

        {/* Card 2: Tin nhắn thu về */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              💬 Tin nhắn bắt đầu
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
            {formatNumber(accountInsights?.messagingCount || 0)}{' '}
            <span className="text-xs font-semibold text-slate-400">mess</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Từ khách hàng nhấn vào Ads
          </p>
        </div>

        {/* Card 3: Chi phí / 1 Tin nhắn (Cost per Message) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              🎯 Chi phí / Tin nhắn
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-black tracking-tight ${
            (accountInsights?.costPerMessage || 0) <= 25000 && (accountInsights?.costPerMessage || 0) > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : (accountInsights?.costPerMessage || 0) <= 45000
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}>
            {formatVnd(accountInsights?.costPerMessage || 0)}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {accountInsights?.costPerMessage ? 'Giá trung bình mỗi cuộc trò chuyện' : 'Chưa có dữ liệu tin nhắn'}
          </p>
        </div>

        {/* Card 4: Lượt Click & CPM */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              👁️ Hiển thị & Click
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <MousePointer className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {formatNumber(accountInsights?.clicks || 0)}{' '}
            <span className="text-xs font-semibold text-slate-400">/ {formatNumber(accountInsights?.impressions || 0)} views</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            CTR: {accountInsights?.ctr?.toFixed(2) || '0.00'}% • CPM: {formatVnd(accountInsights?.cpm || 0)}
          </p>
        </div>
      </div>

      {/* 4. Campaigns Breakdown Table / List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Table Controls Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-500" />
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              Danh sách Chiến dịch ({filteredCampaigns.length})
            </h3>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-smooth ${statusFilter === 'ALL' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs' : 'text-slate-500'}`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-2.5 py-1 rounded-lg transition-smooth ${statusFilter === 'ACTIVE' ? 'bg-emerald-500 text-white shadow-xs' : 'text-slate-500'}`}
              >
                Đang chạy
              </button>
              <button
                onClick={() => setStatusFilter('PAUSED')}
                className={`px-2.5 py-1 rounded-lg transition-smooth ${statusFilter === 'PAUSED' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500'}`}
              >
                Tạm dừng
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên chiến dịch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 w-44 sm:w-56"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-semibold">Đang tải số liệu chiến dịch...</p>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-1">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy chiến dịch nào</p>
            <p className="text-xs">Thử thay đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 min-w-[220px]">Tên chiến dịch</th>
                  <th className="py-3 px-4">Ngân sách / ngày</th>
                  <th className="py-3 px-4 text-right">Chi tiêu</th>
                  <th className="py-3 px-4 text-center">Tin nhắn</th>
                  <th className="py-3 px-4 text-right">Giá / Mess</th>
                  <th className="py-3 px-4 text-right">Clicks (CTR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredCampaigns.map(camp => {
                  const isActive = camp.status === 'ACTIVE';
                  const isEditing = editingBudgetId === camp.id;

                  return (
                    <tr
                      key={camp.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-smooth"
                    >
                      {/* Active Toggle Switch */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(camp)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                          title={isActive ? 'Bấm để Tạm dừng' : 'Bấm để Bật chạy'}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isActive ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      {/* Campaign Name */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                          {camp.name}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {camp.id}
                        </span>
                      </td>

                      {/* Daily Budget (Editable) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editBudgetValue}
                              onChange={(e) => setEditBudgetValue(e.target.value)}
                              className="w-24 px-2 py-1 text-xs font-bold rounded-lg border border-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveBudget(camp.id)}
                              disabled={isUpdatingBudget}
                              className="p-1 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingBudgetId(null)}
                              className="p-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              {camp.daily_budget ? formatVnd(camp.daily_budget) : 'Trọn đời'}
                            </span>
                            {camp.daily_budget && (
                              <button
                                onClick={() => {
                                  setEditingBudgetId(camp.id);
                                  setEditBudgetValue(String(camp.daily_budget));
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-brand-500 transition-smooth"
                                title="Đổi ngân sách ngày"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Spend */}
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatVnd(camp.spend)}
                      </td>

                      {/* Messages Count */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {camp.messagingCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs border border-emerald-200/60 dark:border-emerald-800/60">
                            {camp.messagingCount} mess
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">-</span>
                        )}
                      </td>

                      {/* Cost per Message */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {camp.costPerMessage > 0 ? (
                          <span className={`font-black text-xs ${
                            camp.costPerMessage <= 25000
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : camp.costPerMessage <= 45000
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}>
                            {formatVnd(camp.costPerMessage)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">-</span>
                        )}
                      </td>

                      {/* Clicks & CTR */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {formatNumber(camp.clicks)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          CTR {camp.ctr?.toFixed(2) || '0.00'}%
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
