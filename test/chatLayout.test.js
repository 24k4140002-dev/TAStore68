import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chat auto-scroll stays inside the message pane instead of scrolling the whole Inbox', async () => {
  const chatThreadSource = await readFile(
    new URL('../src/components/inbox/ChatThread.jsx', import.meta.url),
    'utf8'
  );
  const inboxSource = await readFile(
    new URL('../src/components/inbox/CRMInbox.jsx', import.meta.url),
    'utf8'
  );
  const sidebarSource = await readFile(
    new URL('../src/components/inbox/ConversationSidebar.jsx', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(chatThreadSource, /messagesEndRef\.current\?\.scrollIntoView/);
  assert.match(chatThreadSource, /container\.scrollTop = container\.scrollHeight/);
  assert.match(inboxSource, /flex-1 min-h-0 flex overflow-hidden relative/);
  assert.doesNotMatch(inboxSource, /h-\[calc\(100dvh-60px\)\]/);
  assert.match(chatThreadSource, /flex-1 min-h-0 overflow-y-auto/);
  assert.match(chatThreadSource, /loading="lazy" fetchPriority="low"/);
  assert.match(chatThreadSource, /id="metapost-message-input"/);
  assert.match(chatThreadSource, /name="message"/);
  assert.match(sidebarSource, /MOBILE_CONVERSATION_BATCH_SIZE = 30/);
  assert.match(sidebarSource, /useState\(getConversationBatchSize\)/);
});
