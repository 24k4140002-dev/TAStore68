import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_POST_PHOTOS,
  filterVisiblePages,
  parseStoredArray,
  validatePostDraft
} from '../src/utils/postStudio.js';

test('post studio accepts up to 50 experimental photos and rejects 51', () => {
  const base = {
    selectedPageIds: ['1'],
    postType: 'photo',
    postContent: 'Album thử nghiệm'
  };
  const photos = count => Array.from({ length: count }, (_, index) => ({
    name: `photo-${index}.jpg`,
    type: 'image/jpeg'
  }));

  assert.equal(MAX_POST_PHOTOS, 50);
  assert.equal(validatePostDraft({ ...base, mediaFiles: photos(50) }), '');
  assert.match(validatePostDraft({ ...base, mediaFiles: photos(51) }), /tối đa 50 ảnh/);
});

test('post studio only shows Pages enabled in Messenger page settings', () => {
  const pages = [{ id: '1' }, { id: '2' }, { id: '3' }];
  assert.deepEqual(filterVisiblePages(pages, ['1', '3']), [{ id: '1' }, { id: '3' }]);
  assert.deepEqual(filterVisiblePages(pages, []), pages);
});

test('post studio safely handles broken local storage arrays', () => {
  assert.deepEqual(parseStoredArray('{broken'), []);
  assert.deepEqual(parseStoredArray('{"not":"an array"}'), []);
});

test('post validation rejects invalid links and unsafe schedule times', () => {
  const base = {
    selectedPageIds: ['1'],
    postType: 'text',
    postContent: 'Nội dung',
    mediaFiles: []
  };
  assert.match(validatePostDraft({ ...base, postLink: 'javascript:alert(1)' }), /http/);
  assert.match(validatePostDraft({
    ...base,
    isScheduled: true,
    scheduleTime: new Date(Date.now() + 2 * 60 * 1000).toISOString()
  }), /10 phút/);
});

test('post validation requires exactly one video in video mode', () => {
  assert.match(validatePostDraft({
    selectedPageIds: ['1'],
    postType: 'video',
    postContent: 'Video',
    mediaFiles: []
  }), /đúng 1 tệp video/);
});
