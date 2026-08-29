import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyMetaPublishError,
  createPublishSnapshot,
  getConfirmedPostId
} from '../src/services/publishOutcome.js';

test('publish retry snapshot keeps the original content, files, and schedule', () => {
  const originalFile = { name: 'original.jpg' };
  const draftFiles = [originalFile];
  const snapshot = createPublishSnapshot({
    postType: 'photo',
    postText: 'Bài gốc',
    postLink: 'https://example.com/original',
    mediaFiles: draftFiles,
    isScheduled: true,
    scheduleTimestamp: 1780000000
  });

  draftFiles.push({ name: 'edited.jpg' });
  assert.equal(snapshot.postText, 'Bài gốc');
  assert.deepEqual(snapshot.mediaFiles, [originalFile]);
  assert.equal(snapshot.scheduleTimestamp, 1780000000);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.mediaFiles), true);
});

test('posting without a Meta post ID is unknown, never a fake success', () => {
  assert.equal(getConfirmedPostId({ id: '123_456' }), '123_456');
  assert.throws(() => getConfirmedPostId({ success: true }), { outcomeUnknown: true });
  const failure = classifyMetaPublishError({ message: 'Failed to fetch', httpStatus: 0 });
  assert.equal(failure.outcomeUnknown, true);
  assert.match(failure.hint, /tránh đăng trùng/);
});

test('classifies an expired Page token as explicit and non-transient', () => {
  const result = classifyMetaPublishError({
    code: 190,
    subcode: 463,
    httpStatus: 400,
    facebookMessage: 'Synthetic expired token',
    publishStage: 'feed'
  });

  assert.equal(result.reference, 'Meta #190/463');
  assert.equal(result.retryable, false);
  assert.match(result.hint, /kết nối lại Facebook/);
});

test('classifies rate limiting as retryable without suggesting content evasion', () => {
  const result = classifyMetaPublishError({ code: 4, message: 'Application request limit reached' });
  assert.equal(result.retryable, true);
  assert.match(result.hint, /chờ vài phút/);
  assert.doesNotMatch(result.hint, /ký tự|lách/i);
});

test('keeps the failed media index and stage for album diagnosis', () => {
  const result = classifyMetaPublishError({
    code: 100,
    message: 'Invalid image',
    publishStage: 'photo_upload',
    mediaIndex: 7
  });
  assert.equal(result.mediaIndex, 7);
  assert.equal(result.stage, 'photo_upload');
});
