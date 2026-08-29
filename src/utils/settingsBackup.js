export const SETTINGS_BACKUP_VERSION = 1;
export const MAX_SETTINGS_BACKUP_BYTES = 1024 * 1024;

export const SAFE_SETTINGS = [
  { key: 'metapost_templates', label: 'Bài mẫu', type: 'array' },
  { key: 'metapost_quick_replies', label: 'Câu trả lời nhanh', type: 'array' },
  { key: 'metapost_visible_page_ids', label: 'Danh sách Page hiển thị', type: 'array' },
  { key: 'metapost_page_nicknames', label: 'Tên gợi nhớ của Page', type: 'object' },
  { key: 'metapost_auto_rules', label: 'Luật tự động', type: 'object' },
  { key: 'metapost_ads_rule_config', label: 'Thiết lập cảnh báo Ads', type: 'object' },
  { key: 'metapost_all_labels', label: 'Danh mục nhãn cục bộ', type: 'array' },
  { key: 'metapost_all_tags', label: 'Danh mục tag cục bộ', type: 'array' },
  { key: 'metapost_theme', label: 'Giao diện sáng/tối', type: 'string' },
  { key: 'metapost_focus_mode', label: 'Chế độ tập trung', type: 'string' }
];

const BLOCKED_PROPERTY_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeJson(value, depth = 0) {
  if (depth > 8) throw new Error('Dữ liệu sao lưu lồng quá sâu.');
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 2000) throw new Error('Dữ liệu sao lưu có danh sách quá lớn.');
    return value.map(item => sanitizeJson(item, depth + 1));
  }
  if (isPlainObject(value)) {
    const clean = {};
    for (const [key, child] of Object.entries(value)) {
      if (BLOCKED_PROPERTY_NAMES.has(key)) continue;
      clean[key] = sanitizeJson(child, depth + 1);
    }
    return clean;
  }
  throw new Error('Dữ liệu sao lưu chứa kiểu không được hỗ trợ.');
}

function parseStoredValue(raw, type) {
  if (type === 'string') return raw;
  try {
    const value = JSON.parse(raw);
    if (type === 'array' && !Array.isArray(value)) return undefined;
    if (type === 'object' && !isPlainObject(value)) return undefined;
    return sanitizeJson(value);
  } catch {
    return undefined;
  }
}

function validateValue(value, type, label) {
  if (type === 'string') {
    if (typeof value !== 'string' || value.length > 10000) throw new Error(`${label} không hợp lệ.`);
    return value;
  }
  if (type === 'array' && !Array.isArray(value)) throw new Error(`${label} phải là danh sách.`);
  if (type === 'object' && !isPlainObject(value)) throw new Error(`${label} phải là thiết lập dạng đối tượng.`);
  return sanitizeJson(value);
}

export function normalizePostTemplate(template, index = 0) {
  if (!isPlainObject(template)) return null;
  const name = String(template.name || '').trim().slice(0, 120);
  const content = String(template.content || '').slice(0, 20000);
  if (!name || !content.trim()) return null;
  const type = ['photo', 'video', 'text'].includes(template.type) ? template.type : 'photo';
  return {
    id: String(template.id || `tpl_import_${Date.now()}_${index}`).slice(0, 160),
    name,
    content,
    link: String(template.link || '').slice(0, 2000),
    type
  };
}

export function createSafeSettingsBackup(storage, createdAt = new Date().toISOString()) {
  const data = {};
  for (const setting of SAFE_SETTINGS) {
    const raw = storage.getItem(setting.key);
    if (raw === null) continue;
    const parsed = parseStoredValue(raw, setting.type);
    if (parsed !== undefined) data[setting.key] = parsed;
  }

  if (Array.isArray(data.metapost_templates)) {
    data.metapost_templates = data.metapost_templates
      .map(normalizePostTemplate)
      .filter(Boolean)
      .slice(0, 500);
  }

  return {
    app: 'metapost-studio',
    version: SETTINGS_BACKUP_VERSION,
    createdAt,
    security: {
      excludesTokens: true,
      excludesCustomerData: true,
      excludesBankDetails: true
    },
    data
  };
}

export function restoreSafeSettingsBackup(storage, backup) {
  if (!isPlainObject(backup) || backup.app !== 'metapost-studio') {
    throw new Error('Đây không phải file sao lưu của MetaPost Studio.');
  }
  if (backup.version !== SETTINGS_BACKUP_VERSION || !isPlainObject(backup.data)) {
    throw new Error('Phiên bản file sao lưu chưa được hỗ trợ.');
  }

  const imported = [];
  for (const setting of SAFE_SETTINGS) {
    if (!Object.prototype.hasOwnProperty.call(backup.data, setting.key)) continue;
    let value = validateValue(backup.data[setting.key], setting.type, setting.label);
    if (setting.key === 'metapost_templates') {
      value = value.map(normalizePostTemplate).filter(Boolean).slice(0, 500);
    }
    storage.setItem(setting.key, setting.type === 'string' ? value : JSON.stringify(value));
    imported.push(setting.key);
  }

  if (imported.length === 0) throw new Error('File không có thiết lập hợp lệ để khôi phục.');
  return imported;
}

export function readStoredArray(storage, key) {
  const parsed = parseStoredValue(storage.getItem(key), 'array');
  return Array.isArray(parsed) ? parsed : [];
}

export function readStoredObject(storage, key) {
  const parsed = parseStoredValue(storage.getItem(key), 'object');
  return isPlainObject(parsed) ? parsed : {};
}
