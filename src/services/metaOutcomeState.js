const ORDERED_LABEL_PATTERN = /(đã đặt hàng|đã chốt đơn|ordered)/i;
const AUTO_LABEL_PREFIX_PATTERN = /đã thêm nhãn tự động\s*:\s*/i;
const AUTO_ORDER_ACTIVITY_PATTERN = /hệ thống đã tự động tạo hoạt động về đơn đặt hàng/i;

function normalizeLabelName(value = '') {
  return value.trim().replace(/[.!。]+$/u, '').trim();
}

function labelKey(label = {}) {
  return (label.name || label.page_label_name || '').trim().toLocaleLowerCase('vi-VN');
}

function slugifyLabel(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'label';
}

export function mergeLabelsByName(existingLabels = [], incomingLabels = []) {
  const merged = new Map();

  existingLabels.forEach(label => {
    const key = labelKey(label);
    if (key) merged.set(key, label);
  });

  incomingLabels.forEach(label => {
    const key = labelKey(label);
    if (!key) return;
    const existing = merged.get(key) || {};
    if (label.source === 'meta_auto' && existing.source === 'meta') {
      merged.set(key, { ...label, ...existing });
      return;
    }
    merged.set(key, { ...existing, ...label });
  });

  return [...merged.values()];
}

export function deriveMetaConversationOutcome(messages = []) {
  let outcome = null;

  [...messages]
    .sort((a, b) => new Date(a.created_time || 0).getTime() - new Date(b.created_time || 0).getTime())
    .forEach(message => {
      // Graph transcript text is customer/Page-authored content. Never promote
      // a matching sentence to a confirmed Meta automation event unless the
      // caller supplies explicit structured provenance.
      if (message?.source !== 'meta_automatic_label' && message?.is_meta_automatic_label !== true) return;
      const text = String(message?.message || '').trim();
      if (!text) return;

      let labelName = '';
      if (AUTO_LABEL_PREFIX_PATTERN.test(text)) {
        const afterPrefix = text.replace(AUTO_LABEL_PREFIX_PATTERN, '');
        const orderStatusMatch = afterPrefix.match(/trạng thái đơn đặt hàng là\s+(.+)$/i);
        labelName = normalizeLabelName(orderStatusMatch?.[1] || afterPrefix);
      } else if (AUTO_ORDER_ACTIVITY_PATTERN.test(text)) {
        labelName = 'Đã đặt hàng';
      }

      if (!labelName) return;

      const isOrdered = ORDERED_LABEL_PATTERN.test(labelName);
      outcome = {
        detectedAt: message.created_time || null,
        label: {
          id: `meta_auto_${slugifyLabel(labelName)}`,
          name: labelName,
          emoji: isOrdered ? '✅' : '🏷️',
          color: isOrdered ? '#10b981' : '#3b82f6',
          source: 'meta_auto'
        },
        leadStage: isOrdered ? 'ordered' : null,
        leadStageSource: isOrdered ? 'meta_auto' : null
      };
    });

  return outcome;
}

export function shouldApplyMetaLeadStage(customerData = {}, outcome = null) {
  if (!outcome?.leadStage) return false;
  if (
    customerData.lead_stage_source === 'meta_auto'
    && customerData.lead_stage === outcome.leadStage
    && new Date(customerData.lead_stage_updated_at || 0).getTime() >= new Date(outcome.detectedAt || 0).getTime()
  ) {
    return false;
  }
  if (customerData.lead_stage_source !== 'manual') return true;

  const manualTime = new Date(customerData.lead_stage_updated_at || 0).getTime();
  const metaTime = new Date(outcome.detectedAt || 0).getTime();
  if (!Number.isFinite(manualTime) || manualTime <= 0) return false;
  return Number.isFinite(metaTime) && metaTime > manualTime;
}
