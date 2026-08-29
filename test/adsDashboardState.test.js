import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAdsDashboardSections } from '../src/services/adsDashboardState.js';

test('Ads dashboard clears failed sections instead of showing values from another period', () => {
  const result = resolveAdsDashboardSections({
    insightsRes: { error: { message: 'Synthetic insight failure' } },
    dailyRes: [{ date: '2026-08-28', spend: 10 }],
    campaignsRes: { error: { message: 'Synthetic campaign failure' } }
  });

  assert.equal(result.accountInsights, null);
  assert.deepEqual(result.dailyInsights, [{ date: '2026-08-28', spend: 10 }]);
  assert.deepEqual(result.campaigns, []);
  assert.deepEqual(result.errors.map(item => item.section), ['Tổng quan', 'Chiến dịch']);
});
