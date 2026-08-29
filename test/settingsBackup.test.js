import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSafeSettingsBackup,
  restoreSafeSettingsBackup
} from '../src/utils/settingsBackup.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    dump: () => Object.fromEntries(values)
  };
}

test('safe settings backup excludes tokens, customer data and bank details', () => {
  const storage = createStorage({
    metapost_templates: JSON.stringify([{ id: '1', name: 'Mẫu 1', content: 'Nội dung', type: 'photo' }]),
    metapost_quick_replies: JSON.stringify([{ id: 'q1', text: 'Xin chào' }]),
    metapost_fb_token: 'secret-token',
    metapost_pages_cache: JSON.stringify([{ id: 'page', access_token: 'page-secret' }]),
    metapost_msgs_customer: JSON.stringify([{ message: 'Riêng tư' }]),
    metapost_bank_config: JSON.stringify({ accountNo: '123456' })
  });

  const backup = createSafeSettingsBackup(storage, '2026-08-24T00:00:00.000Z');
  const serialized = JSON.stringify(backup);

  assert.equal(backup.data.metapost_templates.length, 1);
  assert.equal(backup.security.excludesTokens, true);
  assert.equal(serialized.includes('secret-token'), false);
  assert.equal(serialized.includes('page-secret'), false);
  assert.equal(serialized.includes('Riêng tư'), false);
  assert.equal(serialized.includes('123456'), false);
});

test('restore imports only allowlisted settings', () => {
  const storage = createStorage({ metapost_fb_token: 'keep-this-token' });
  const imported = restoreSafeSettingsBackup(storage, {
    app: 'metapost-studio',
    version: 1,
    data: {
      metapost_templates: [{ id: '1', name: 'Mẫu', content: 'Nội dung', type: 'photo' }],
      metapost_theme: 'dark',
      metapost_fb_token: 'malicious-replacement',
      metapost_bank_config: { accountNo: '999' }
    }
  });
  const stored = storage.dump();

  assert.deepEqual(imported.sort(), ['metapost_templates', 'metapost_theme']);
  assert.equal(stored.metapost_fb_token, 'keep-this-token');
  assert.equal(stored.metapost_bank_config, undefined);
  assert.equal(JSON.parse(stored.metapost_templates)[0].name, 'Mẫu');
});

test('restore rejects foreign or empty backup files', () => {
  const storage = createStorage();
  assert.throws(() => restoreSafeSettingsBackup(storage, { app: 'other', version: 1, data: {} }), /không phải file/);
  assert.throws(() => restoreSafeSettingsBackup(storage, { app: 'metapost-studio', version: 1, data: {} }), /không có thiết lập/);
});
