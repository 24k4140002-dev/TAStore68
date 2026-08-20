import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_BASE,
  META_GRAPH_VERSION,
  cleanFacebookToken,
  generateSmartAntiSpam
} from '../src/services/facebookApi.js';

test('uses the supported Graph API version by default', () => {
  assert.equal(META_GRAPH_VERSION, 'v26.0');
  assert.equal(API_BASE, 'https://graph.facebook.com/v26.0');
});

test('cleans copied Facebook tokens without changing their value', () => {
  assert.equal(cleanFacebookToken('  “EAA\u200Babc 123”\n'), 'EAAabc123');
});

test('anti-spam leaves single-page content untouched', () => {
  assert.equal(generateSmartAntiSpam('Nội dung', 0, 1), 'Nội dung');
});

