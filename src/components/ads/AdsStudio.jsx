import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  Search,
  Key,
  HelpCircle,
  Edit2,
  Check,
  X,
  ShieldAlert,
  BarChart2,
  ExternalLink,
  Settings,
  Sparkles,
  Flame,
  Info
} from 'lucide-react';
import {
  fetchAdAccounts,
  fetchAdAccountInsights,
  fetchDailyAccountInsights,
  fetchCampaignsWithInsights,
  fetchCampaignAds,
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

export default function AdsStudio({ fbToken, onOpenTokenModal }) {
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(() => localStorage.getItem('metapost_selected_ad_acc') || '');
  const [datePreset, setDatePreset] = useState('today');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // High-level Account Insights & Daily Trend
  const [accountInsights, setAccountInsights] = useState(null);
  const [dailyInsights, setDailyInsights] = useState([]);
  const [showTrendChart, setShowTrendChart] = useState(true);

  // Campaigns list
  const [campaigns, setCampaigns] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'PAUSED' | 'ALERT'

  // Budget editing state
  const [editingBudgetId, setEditingBudgetId] = useState(null);
  const [editBudgetValue, setEditBudgetValue] = useState('');
  const [isUpdatingBudget, setIsUpdatingBudget] = useState(false);

  // Campaign Ads Creative Drill-down
  const [expandedCampaignId, setExpandedCampaignId] = useState(null);
  const [campaignAdsMap, setCampaignAdsMap] = useState({});
  const [loadingAdsId, setLoadingAdsId] = useState(null);

  // Smart Anti-Loss Auto Rules State
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleConfig, setRuleConfig] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('metapost_ads_rule_config') || 'null') || {
        enabled: true,
        maxSpendZeroMsg: 100000, // 100k spend with 0 msg -> Alert
        maxCostPerMsg: 45000,    // > 45k / msg -> Alert
        minSpendToEvaluateCost: 50000,
        autoPause: false         // true: auto pause, false: flag alert only
      };
    } catch {
      return {
        enabled: true,
        maxSpendZeroMsg: 100000,
        maxCostPerMsg: 45000,
        minSpendToEvaluateCost: 50000,
        autoPause: false
      };
    }
  });

  const saveRuleConfig = (newCfg) => {
    setRuleConfig(newCfg);
    localStorage.setItem('metapost_ads_rule_config', JSON.stringify(newCfg));
    setIsRuleModalOpen(false);
  };

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

  // 2. Fetch Insights, Daily Trend & Campaigns
  const loadDashboardData = useCallback(async () => {
    if (!fbToken || !selectedAccountId) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const [insightsRes, dailyRes, campaignsRes] = await Promise.all([
        fetchAdAccountInsights(selectedAccountId, fbToken, datePreset),
        fetchDailyAccountInsights(selectedAccountId, fbToken, datePreset === 'today' ? 'last_7d' : datePreset),
        fetchCampaignsWithInsights(selectedAccountId, fbToken, datePreset)
      ]);

      if (insightsRes?.error) {
        setErrorMsg(insightsRes.error.message);
      } else {
        setAccountInsights(insightsRes);
      }

      if (Array.isArray(dailyRes)) {
        setDailyInsights(dailyRes);
      }

      if (campaignsRes?.error) {
        console.warn('Campaigns error:', campaignsRes.error);
      } else if (Array.isArray(campaignsRes)) {
        setCampaigns(campaignsRes);

        // Run Smart Anti-Loss Auto Rules if autoPause is enabled
        if (ruleConfig.enabled && ruleConfig.autoPause) {
          campaignsRes.forEach(async (camp) => {
            if (camp.status === 'ACTIVE') {
              const isZeroMsgLeak = camp.spend >= ruleConfig.maxSpendZeroMsg && camp.messagingCount === 0;
              const isExpensiveLeak = camp.spend >= ruleConfig.minSpendToEvaluateCost && camp.costPerMessage >= ruleConfig.maxCostPerMsg;
              if (isZeroMsgLeak || isExpensiveLeak) {
                try {
                  await toggleCampaignStatus(camp.id, 'PAUSED', fbToken);
                  setCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, status: 'PAUSED', autoPausedReason: isZeroMsgLeak ? 'Cháy tiền 0 tin nhắn' : 'Giá tin nhắn quá đắt' } : c));
                } catch (e) {
                  console.warn('Auto pause error:', e);
                }
              }
            }
          });
        }
      }
    } catch (err) {
      setErrorMsg('Không thể tải chỉ số quảng cáo.');
    } finally {
      setIsLoading(false);
    }
  }, [fbToken, selectedAccountId, datePreset, ruleConfig]);

  useEffect(() => {
    if (selectedAccountId) {
      loadDashboardData();
    }
  }, [selectedAccountId, datePreset, loadDashboardData]);

  // Handle Ad Account Change
  const handleAccountChange = (accId) => {
    setSelectedAccountId(accId);
    localStorage.setItem('metapost_selected_ad_acc', accId);
    setExpandedCampaignId(null);
  };

  // Handle Toggle Campaign Active / Paused
  const handleToggleStatus = async (campaign) => {
    const nextStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    // Optimistic UI update
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: nextStatus, autoPausedReason: null } : c));

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

  // Expand Campaign to drill-down into Ads Creatives
  const handleToggleExpandCampaign = async (campaignId) => {
    if (expandedCampaignId === campaignId) {
      setExpandedCampaignId(null);
      return;
    }

    setExpandedCampaignId(campaignId);
    if (!campaignAdsMap[campaignId]) {
      setLoadingAdsId(campaignId);
      try {
        const adsList = await fetchCampaignAds(campaignId, fbToken, datePreset);
        if (Array.isArray(adsList)) {
          setCampaignAdsMap(prev => ({ ...prev, [campaignId]: adsList }));
        }
      } catch (e) {
        console.warn('Load ads error:', e);
      } finally {
        setLoadingAdsId(null);
      }
    }
  };

  // Evaluate Campaign Alert Status
  const getCampaignAlert = (camp) => {
    if (!ruleConfig.enabled) return null;
    if (camp.status === 'ACTIVE') {
      if (camp.spend >= ruleConfig.maxSpendZeroMsg && camp.messagingCount === 0) {
        return {
          type: 'danger',
          label: `🚨 Cháy ${formatVnd(camp.spend)} chưa có tin nhắn nào!`
        };
      }
      if (camp.spend >= ruleConfig.minSpendToEvaluateCost && camp.costPerMessage >= ruleConfig.maxCostPerMsg) {
        return {
          type: 'warning',
          label: `⚠️ Giá đắt (${formatVnd(camp.costPerMessage)}/mess > ${formatVnd(ruleConfig.maxCostPerMsg)})`
        };
      }
    }
    if (camp.autoPausedReason) {
      return {
        type: 'danger',
        label: `🛑 Đã tự động ngắt: ${camp.autoPausedReason}`
      };
    }
    return null;
  };

  // Filtered Campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (statusFilter === 'ACTIVE' && c.status !== 'ACTIVE') return false;
      if (statusFilter === 'PAUSED' && c.status !== 'PAUSED') return false;
      if (statusFilter === 'ALERT') {
        const alert = getCampaignAlert(c);
        if (!alert) return false;
      }
      if (searchQuery.trim()) {
        return c.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [campaigns, statusFilter, searchQuery, ruleConfig]);

  const selectedAccount = adAccounts.find(a => a.id === selectedAccountId);

  // Maximum spend for daily chart scaling
  const maxDailySpend = useMemo(() => {
    if (dailyInsights.length === 0) return 1;
    return Math.max(...dailyInsights.map(d => d.spend), 10000);
  }, [dailyInsights]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 overflow-y-auto font-sans p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-5">
      {/* 1. Top Header Bar (Account Selector, Date Presets, Rules, Refresh) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {/* Left: Account Dropdown */}
        <div className="flex items-center justify-between md:justify-start gap-2.5">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="relative min-w-[150px] sm:min-w-[220px] max-w-[280px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                Tài khoản quảng cáo
              </label>
              <div className="relative">
                <select
                  value={selectedAccountId}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  disabled={adAccounts.length === 0 || isLoading}
                  className="w-full pl-2.5 pr-7 py-1 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none truncate cursor-pointer"
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
                <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Date Presets & Anti-Loss Rule Config */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-between md:justify-end">
          {/* Date Presets Pills */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {DATE_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setDatePreset(p.id)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-smooth ${
                  datePreset === p.id
                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Anti-Loss Rule Trigger Button */}
          <button
            onClick={() => setIsRuleModalOpen(true)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-smooth ${
              ruleConfig.enabled
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
            title="Cấu hình Quy tắc Chống Cháy Tài Khoản / Chặn Lỗ"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden sm:inline">Chặn Lỗ</span>
          </button>

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
            <p className="leading-relaxed mb-2">{errorMsg}</p>
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
              💬 Tin nhắn thu về
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

      {/* 4. Visual Daily Trend Chart (Interactive Breakdown) */}
      {dailyInsights.length > 0 && (
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-purple-500" />
              <h3 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                Biến động Chi tiêu & Số tin nhắn hàng ngày
              </h3>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              {dailyInsights.length} ngày gần nhất
            </span>
          </div>

          {/* Bar & Metric Columns */}
          <div className="grid grid-cols-7 gap-2 pt-2 items-end min-h-[140px]">
            {dailyInsights.map((day, idx) => {
              const heightPercent = Math.max(Math.round((day.spend / maxDailySpend) * 100), 8);
              const dateStr = day.date ? day.date.slice(5) : `D${idx + 1}`; // MM-DD

              return (
                <div key={idx} className="flex flex-col items-center gap-1.5 group">
                  {/* Tooltip on Hover / Focus */}
                  <div className="text-[10px] text-slate-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity text-center whitespace-nowrap">
                    {formatVnd(day.spend)}
                  </div>

                  {/* Vertical Bar */}
                  <div className="w-full max-w-[32px] h-[80px] bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-hidden flex flex-col justify-end p-0.5">
                    <div
                      className="w-full bg-gradient-to-t from-purple-600 to-indigo-500 rounded-lg transition-all duration-500"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>

                  {/* Day Date & Messages pill */}
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    {dateStr}
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                    day.messagingCount > 0
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400'
                  }`}>
                    {day.messagingCount} 💬
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Campaigns Breakdown Table / List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Table Controls Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-500" />
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              Chiến dịch Quảng cáo ({filteredCampaigns.length})
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
              <button
                onClick={() => setStatusFilter('ALERT')}
                className={`px-2.5 py-1 rounded-lg transition-smooth ${statusFilter === 'ALERT' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-500'}`}
              >
                🚨 Cảnh báo
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
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 w-36 sm:w-52"
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
                  <th className="py-3 px-3 sm:px-4">Trạng thái</th>
                  <th className="py-3 px-3 sm:px-4 min-w-[200px]">Tên chiến dịch & Bài viết</th>
                  <th className="py-3 px-3 sm:px-4">Ngân sách / ngày</th>
                  <th className="py-3 px-3 sm:px-4 text-right">Chi tiêu</th>
                  <th className="py-3 px-3 sm:px-4 text-center">Tin nhắn</th>
                  <th className="py-3 px-3 sm:px-4 text-right">Giá / Mess</th>
                  <th className="py-3 px-3 sm:px-4 text-right">Clicks (CTR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredCampaigns.map(camp => {
                  const isActive = camp.status === 'ACTIVE';
                  const isEditing = editingBudgetId === camp.id;
                  const isExpanded = expandedCampaignId === camp.id;
                  const alertInfo = getCampaignAlert(camp);
                  const adsList = campaignAdsMap[camp.id] || [];

                  return (
                    <React.Fragment key={camp.id}>
                      <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-smooth ${alertInfo?.type === 'danger' ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}`}>
                        {/* Active Toggle Switch */}
                        <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap">
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

                        {/* Campaign Name + Alert Badge */}
                        <td className="py-3.5 px-3 sm:px-4">
                          <div className="flex items-start gap-1.5">
                            <div className="flex-1">
                              <div className="font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                                {camp.name}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  ID: {camp.id}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleExpandCampaign(camp.id)}
                                  className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5"
                                >
                                  <span>Soi bài viết Ads</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              </div>

                              {/* Anti-Loss Warning Pill */}
                              {alertInfo && (
                                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold mt-1 ${
                                  alertInfo.type === 'danger'
                                    ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                    : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                }`}>
                                  {alertInfo.label}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Daily Budget (Editable) */}
                        <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap">
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
                        <td className="py-3.5 px-3 sm:px-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {formatVnd(camp.spend)}
                        </td>

                        {/* Messages Count */}
                        <td className="py-3.5 px-3 sm:px-4 text-center whitespace-nowrap">
                          {camp.messagingCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs border border-emerald-200/60 dark:border-emerald-800/60">
                              {camp.messagingCount} mess
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>

                        {/* Cost per Message */}
                        <td className="py-3.5 px-3 sm:px-4 text-right whitespace-nowrap">
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
                        <td className="py-3.5 px-3 sm:px-4 text-right whitespace-nowrap">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {formatNumber(camp.clicks)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            CTR {camp.ctr?.toFixed(2) || '0.00'}%
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Ads Creative Drilldown */}
                      {isExpanded && (
                        <tr className="bg-slate-100/60 dark:bg-slate-800/40">
                          <td colSpan={7} className="p-3 sm:p-4">
                            <div className="space-y-2">
                              <h5 className="font-extrabold text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Danh sách Bài viết Quảng cáo trong chiến dịch này</span>
                              </h5>

                              {loadingAdsId === camp.id ? (
                                <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                  <span className="w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></span>
                                  <span>Đang nạp dữ liệu bài viết quảng cáo...</span>
                                </div>
                              ) : adsList.length === 0 ? (
                                <p className="text-xs text-slate-400 py-2">Không tìm thấy bài viết quảng cáo nào trong chiến dịch này.</p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                  {adsList.map(ad => (
                                    <div key={ad.id} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-start gap-3 shadow-xs">
                                      {/* Ad Thumbnail */}
                                      {ad.creative?.imageUrl ? (
                                        <img
                                          src={ad.creative.imageUrl}
                                          alt={ad.name}
                                          className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-slate-100 dark:border-slate-800"
                                        />
                                      ) : (
                                        <div className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-xs flex-shrink-0 font-bold">
                                          Ads
                                        </div>
                                      )}

                                      {/* Ad Content & Stats */}
                                      <div className="flex-1 min-w-0">
                                        <h6 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                          {ad.name}
                                        </h6>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                                          {ad.creative?.body || ad.creative?.title || 'Không có mô tả text'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1.5 text-[11px] font-bold">
                                          <span className="text-slate-700 dark:text-slate-200">
                                            💸 {formatVnd(ad.spend)}
                                          </span>
                                          <span className="text-emerald-600 dark:text-emerald-400">
                                            💬 {ad.messagingCount} mess
                                          </span>
                                          {ad.costPerMessage > 0 && (
                                            <span className="text-purple-600 dark:text-purple-400">
                                              🎯 {formatVnd(ad.costPerMessage)}/m
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Smart Anti-Loss Rule Config Modal */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Quy Tắc Chống Cháy Tài Khoản / Chặn Lỗ Ads
                </h3>
              </div>
              <button
                onClick={() => setIsRuleModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Toggle Enable */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">Kích hoạt Quy Tắc Bảo Vệ</span>
                  <span className="text-[11px] text-slate-400">Tự động quét và cảnh báo các chiến dịch ngốn tiền bất thường</span>
                </div>
                <input
                  type="checkbox"
                  checked={ruleConfig.enabled}
                  onChange={(e) => setRuleConfig({ ...ruleConfig, enabled: e.target.checked })}
                  className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                />
              </label>

              {/* Threshold 1: Max Spend 0 Messages */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  1. Ngưỡng cảnh báo Chiến dịch Cháy 0 Tin Nhắn (VNĐ):
                </label>
                <input
                  type="number"
                  step="10000"
                  value={ruleConfig.maxSpendZeroMsg}
                  onChange={(e) => setRuleConfig({ ...ruleConfig, maxSpendZeroMsg: parseInt(e.target.value, 10) || 0 })}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                  placeholder="Ví dụ: 100000"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Nếu chiến dịch đã tiêu vượt mức này mà chưa ra tin nhắn nào $\rightarrow$ Cảnh báo ngay.</p>
              </div>

              {/* Threshold 2: Max Cost Per Message */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  2. Ngưỡng Giá Tin Nhắn Quá Đắt (VNĐ / Mess):
                </label>
                <input
                  type="number"
                  step="5000"
                  value={ruleConfig.maxCostPerMsg}
                  onChange={(e) => setRuleConfig({ ...ruleConfig, maxCostPerMsg: parseInt(e.target.value, 10) || 0 })}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                  placeholder="Ví dụ: 45000"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Nếu giá / tin nhắn vượt mức này (sau khi đã tiêu &gt; 50k) $\rightarrow$ Cảnh báo ngay.</p>
              </div>

              {/* Action Mode: Flag vs Auto-Pause */}
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 space-y-2">
                <span className="font-bold text-rose-900 dark:text-rose-300 block">Hành động khi vi phạm:</span>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="autoPause"
                      checked={!ruleConfig.autoPause}
                      onChange={() => setRuleConfig({ ...ruleConfig, autoPause: false })}
                      className="accent-rose-500"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200">Gắn cờ Đỏ cảnh báo 🚨 (Để người dùng tự quyết định)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="autoPause"
                      checked={ruleConfig.autoPause}
                      onChange={() => setRuleConfig({ ...ruleConfig, autoPause: true })}
                      className="accent-rose-500"
                    />
                    <span className="font-bold text-rose-700 dark:text-rose-300">Tự động TẠM DỪNG (Auto-Pause) chiến dịch ngay lập tức 🛑</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => saveRuleConfig(ruleConfig)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/20"
              >
                Lưu Quy Tắc
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
