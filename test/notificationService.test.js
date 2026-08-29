import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNotificationEventKey,
  isIosNotificationInstallRequired,
  urlBase64ToUint8Array
} from '../src/services/notificationService.js';

test('notification identity separates the same conversation and message across Pages', () => {
  const pageOne = createNotificationEventKey('page_1', 'conversation_1', 'mid_1');
  const pageTwo = createNotificationEventKey('page_2', 'conversation_1', 'mid_1');

  assert.equal(pageOne, 'page_1:conversation_1:mid_1');
  assert.equal(pageTwo, 'page_2:conversation_1:mid_1');
  assert.notEqual(pageOne, pageTwo);
  assert.equal(createNotificationEventKey('page_1', 'conversation_1', ''), '');
});

test('VAPID public key conversion accepts URL-safe base64', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQID-_8')], [1, 2, 3, 251, 255]);
});

test('iPhone requires a Home Screen launch before Web Push is offered', () => {
  const iosNavigator = { userAgent: 'Mozilla/5.0 (iPhone)', standalone: false };
  const browserWindow = { matchMedia: () => ({ matches: false }) };
  assert.equal(isIosNotificationInstallRequired(iosNavigator, browserWindow), true);
  assert.equal(
    isIosNotificationInstallRequired({ ...iosNavigator, standalone: true }, browserWindow),
    false
  );
});
