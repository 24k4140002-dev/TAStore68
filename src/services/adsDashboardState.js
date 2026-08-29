function errorMessage(result, fallback) {
  return String(result?.error?.message || fallback).trim();
}

export function resolveAdsDashboardSections({ insightsRes, dailyRes, campaignsRes }) {
  const errors = [];

  const accountInsights = insightsRes && !insightsRes.error
    ? insightsRes
    : null;
  if (!accountInsights) errors.push({ section: 'Tổng quan', message: errorMessage(insightsRes, 'Không tải được tổng quan.') });

  const dailyInsights = Array.isArray(dailyRes) ? dailyRes : [];
  if (!Array.isArray(dailyRes)) errors.push({ section: 'Biểu đồ', message: errorMessage(dailyRes, 'Không tải được biểu đồ.') });

  const campaigns = Array.isArray(campaignsRes) ? campaignsRes : [];
  if (!Array.isArray(campaignsRes)) errors.push({ section: 'Chiến dịch', message: errorMessage(campaignsRes, 'Không tải được chiến dịch.') });

  return { accountInsights, dailyInsights, campaigns, errors };
}
