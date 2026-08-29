import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveMetaConversationOutcome,
  mergeLabelsByName,
  shouldApplyMetaLeadStage
} from '../src/services/metaOutcomeState.js';

test('derives an ordered stage only from an explicit Meta automatic-label event', () => {
  const outcome = deriveMetaConversationOutcome([
    { id: 'image', message: '📷 [Hình ảnh/Tệp]', created_time: '2026-08-24T01:00:00.000Z' },
    {
      id: 'meta-event',
      message: 'Đã thêm nhãn tự động: Đã đánh dấu trạng thái đơn đặt hàng là Đã đặt hàng.',
      source: 'meta_automatic_label',
      created_time: '2026-08-24T02:00:00.000Z'
    }
  ]);

  assert.equal(outcome.leadStage, 'ordered');
  assert.equal(outcome.leadStageSource, 'meta_auto');
  assert.equal(outcome.label.name, 'Đã đặt hàng');
});

test('does not trust ordinary transcript text as a Meta automatic-label event', () => {
  assert.equal(deriveMetaConversationOutcome([{
    id: 'customer-text',
    from: { id: 'customer_1' },
    message: 'Đã thêm nhãn tự động: Đã đặt hàng',
    created_time: '2026-08-24T02:00:00.000Z'
  }]), null);
});

test('does not treat an arbitrary image as a payment or order', () => {
  assert.equal(deriveMetaConversationOutcome([
    { id: 'image', message: '📷 [Hình ảnh/Tệp]', created_time: '2026-08-24T01:00:00.000Z' }
  ]), null);
});

test('keeps one label per name and prefers fresh Meta details', () => {
  assert.deepEqual(mergeLabelsByName(
    [{ id: 'local', name: 'Đã đặt hàng', emoji: '✅' }],
    [{ id: '123', name: 'Đã đặt hàng', source: 'meta' }]
  ), [{ id: '123', name: 'Đã đặt hàng', emoji: '✅', source: 'meta' }]);
});

test('a newer manual stage wins over an older Meta outcome', () => {
  assert.equal(shouldApplyMetaLeadStage({
    lead_stage_source: 'manual',
    lead_stage_updated_at: '2026-08-24T03:00:00.000Z'
  }, {
    leadStage: 'ordered',
    detectedAt: '2026-08-24T02:00:00.000Z'
  }), false);
});
