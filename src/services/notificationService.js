// TAStore68 Pro — Notification Service with Web Audio API + HTML5 Audio Fallback & Web Push
import { shouldRefreshPushRegistration, shouldUseServerPush } from './pushState.js';

let audioCtx = null;
let isAudioUnlocked = false;
let serviceWorkerMessageListenerInstalled = false;
let serviceWorkerNavigateCallback = null;
const deliveredMessageKeys = new Map();
const MESSAGE_DEDUPE_WINDOW_MS = 10 * 60_000;

export function createNotificationEventKey(pageId, convId, messageId) {
  if (!messageId) return '';
  return `${pageId || 'all'}:${convId || 'unknown'}:${messageId}`;
}

function claimStoredNotificationEvent(key, now) {
  try {
    const storageKey = 'metapost_notification_dedupe';
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const freshEntries = Object.entries(stored)
      .filter(([, storedAt]) => now - Number(storedAt) <= MESSAGE_DEDUPE_WINDOW_MS)
      .slice(-200);
    const freshMap = Object.fromEntries(freshEntries);
    if (freshMap[key]) return false;
    freshMap[key] = now;
    localStorage.setItem(storageKey, JSON.stringify(freshMap));
  } catch {
    // In private/restricted storage mode, the in-memory map still prevents
    // duplicates within the current tab.
  }
  return true;
}

async function claimNotificationEvent(pageId, convId, messageId) {
  const key = createNotificationEventKey(pageId, convId, messageId);
  if (!key) return true;

  const now = Date.now();
  for (const [storedKey, storedAt] of deliveredMessageKeys) {
    if (now - storedAt > MESSAGE_DEDUPE_WINDOW_MS) deliveredMessageKeys.delete(storedKey);
  }
  if (deliveredMessageKeys.has(key)) return false;

  const claimAcrossTabs = () => claimStoredNotificationEvent(key, now);
  const claimed = typeof navigator !== 'undefined' && navigator.locks?.request
    ? await navigator.locks.request(
        'metapost-notification-claim',
        { mode: 'exclusive' },
        claimAcrossTabs
      )
    : claimAcrossTabs();
  if (!claimed) return false;

  deliveredMessageKeys.set(key, now);
  if (deliveredMessageKeys.size > 500) {
    deliveredMessageKeys.delete(deliveredMessageKeys.keys().next().value);
  }
  return true;
}

// Generate 0.5s crystal dual-tone "Ting Ting" Bell chime (WAV PCM Base64 Data URI)
function generateChimeDataUri() {
  const sampleRate = 22050;
  const duration = 0.45;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // WAV Header
  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // Audio format 1 (PCM)
  view.setUint16(22, 1, true);  // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true);  // Block align
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Generate Samples: Tone 1 (1318 Hz E6) + Tone 2 (1760 Hz A6) with exponential decay
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Tone 1 at t=0
    if (t < 0.3) {
      const decay1 = Math.exp(-t * 12);
      sample += Math.sin(2 * Math.PI * 1318.51 * t) * 0.45 * decay1;
    }

    // Tone 2 at t >= 0.08
    if (t >= 0.08) {
      const t2 = t - 0.08;
      const decay2 = Math.exp(-t2 * 10);
      sample += Math.sin(2 * Math.PI * 1760.00 * t2) * 0.55 * decay2;
    }

    // Clamp to 16-bit PCM
    const clamped = Math.max(-1, Math.min(1, sample));
    const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    view.setInt16(44 + i * 2, pcm, true);
  }

  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

const CHIME_DATA_URI = generateChimeDataUri();

let globalAudioEl = null;

function getOrCreateAudioElement() {
  if (typeof document === 'undefined') return null;
  if (!globalAudioEl) {
    globalAudioEl = document.getElementById('meta-global-chime');
    if (!globalAudioEl) {
      globalAudioEl = document.createElement('audio');
      globalAudioEl.id = 'meta-global-chime';
      globalAudioEl.src = CHIME_DATA_URI;
      globalAudioEl.preload = 'auto';
      globalAudioEl.setAttribute('playsinline', 'true');
      globalAudioEl.setAttribute('webkit-playsinline', 'true');
      globalAudioEl.style.display = 'none';
      if (document.body) {
        document.body.appendChild(globalAudioEl);
      }
    }
  }
  return globalAudioEl;
}

// Audio Unlocker for iOS Safari & Android
export function unlockAudio() {
  if (isAudioUnlocked) return;
  // Chrome and iOS only allow AudioContext startup during an active user
  // gesture. Ignore programmatic calls instead of producing autoplay warnings.
  if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) {
    return;
  }
  try {
    const el = getOrCreateAudioElement();
    if (el) {
      const wasMuted = el.muted;
      el.muted = true;
      el.play().then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = wasMuted;
        isAudioUnlocked = true;
      }).catch(() => {
        el.muted = wasMuted;
      });
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx) {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      const buffer = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
      isAudioUnlocked = true;
    }
  } catch (e) {
    console.warn('Audio unlock error:', e);
  }
}

// Auto-unlock silently on the first real user gesture. The chime itself must
// only be audible when a newly arrived message is detected.
if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { once: true, passive: true });
  });
}

/**
 * Play Dual-Tone "Ting Ting" Notification Chime (iOS Messenger style)
 */
export function playNotificationChime() {
  try {
    // 1. Device Vibration (Haptic feedback on phones)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([200, 100, 200]); } catch {}
    }

    // 2. Primed HTML5 Audio element (Works 100% on iOS PWA & Safari)
    const el = getOrCreateAudioElement();
    if (el) {
      el.currentTime = 0;
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Fallback: Web Audio API
          if (audioCtx) {
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            playWebAudioChime(audioCtx);
          }
        });
      }
      return;
    }

    // 3. Fallback: Web Audio API
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      playWebAudioChime(audioCtx);
    }
  } catch (e) {
    console.warn('Play chime error:', e);
  }
}

function playWebAudioChime(ctx) {
  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1318.51, now);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760.00, now + 0.08);
    gain2.gain.setValueAtTime(0.5, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.51);
  } catch {}
}

/**
 * Register Service Worker for Web Push & Lock Screen Notifications
 */
export async function registerServiceWorker(onNavigateCallback = null) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    if (typeof onNavigateCallback === 'function') {
      serviceWorkerNavigateCallback = onNavigateCallback;
    }

    const reg = await navigator.serviceWorker.register('/sw.js?v=6', {
      scope: '/',
      updateViaCache: 'none'
    });
    reg.update().catch(() => {});

    // Listen for messages from SW when user clicks notification
    if (!serviceWorkerMessageListenerInstalled) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PUSH_DELIVERED') {
          const receivedPages = JSON.parse(localStorage.getItem('metapost_push_received_pages') || '{}');
          receivedPages[event.data.pageId] = Date.now();
          localStorage.setItem('metapost_push_received_pages', JSON.stringify(receivedPages));
          window.dispatchEvent(new CustomEvent('metapost-push-webhook-ready'));
        }
        if (event.data?.type === 'NAVIGATE_TO_CONVERSATION') {
          const { pageId, convId, senderPsid } = event.data;
          if (serviceWorkerNavigateCallback) {
            serviceWorkerNavigateCallback(pageId, convId, senderPsid);
          }
        }
      });
      serviceWorkerMessageListenerInstalled = true;
    }

    return reg;
  } catch (err) {
    console.warn('ServiceWorker registration error:', err);
    return null;
  }
}

/**
 * Check if Web Notification is supported by device
 */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isIosNotificationInstallRequired(
  navigatorLike = typeof navigator !== 'undefined' ? navigator : null,
  windowLike = typeof window !== 'undefined' ? window : null
) {
  const userAgent = String(navigatorLike?.userAgent || '');
  const isIos = /iPad|iPhone|iPod/i.test(userAgent)
    || (navigatorLike?.platform === 'MacIntel' && Number(navigatorLike?.maxTouchPoints || 0) > 1);
  const isStandalone = Boolean(
    navigatorLike?.standalone
    || windowLike?.matchMedia?.('(display-mode: standalone)')?.matches
  );
  return isIos && !isStandalone;
}

export async function getBackgroundNotificationStatus() {
  if (
    !isNotificationSupported()
    || Notification.permission !== 'granted'
    || !('serviceWorker' in navigator)
    || !('PushManager' in window)
  ) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration?.pushManager) return false;
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function disableBackgroundNotifications() {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          keepalive: true
        }).catch(() => null);
        await subscription.unsubscribe().catch(() => false);
      }
    }
  } finally {
    localStorage.removeItem('metapost_push_enabled');
    localStorage.removeItem('metapost_push_page_count');
    localStorage.removeItem('metapost_push_webhook_ready');
    localStorage.removeItem('metapost_push_received_pages');
    localStorage.removeItem('metapost_push_registered_at');
    localStorage.removeItem('metapost_push_selection_signature');
  }
}

/**
 * Request Notification Permission from User
 */
export async function requestNotificationPermission() {
  unlockAudio();
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const perm = await Notification.requestPermission();
    localStorage.setItem('metapost_notification_permission', perm);
    return perm;
  } catch (e) {
    return 'denied';
  }
}

export function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
}

/**
 * Register this device with the server. The Facebook token is only used by the
 * server to verify the Pages currently managed by the user and is never saved.
 */
export async function enableBackgroundNotifications(fbToken, { sendTest = true } = {}) {
  if (!fbToken) throw new Error('Bạn cần kết nối Facebook trước khi bật thông báo.');
  if (!isNotificationSupported() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (isIosNotificationInstallRequired()) {
      throw new Error('Trên iPhone/iPad: mở bằng Safari, chọn Chia sẻ → Thêm vào Màn hình chính, rồi mở shortcut để bật chuông.');
    }
    throw new Error('Thiết bị hoặc trình duyệt này chưa hỗ trợ thông báo nền. Hãy dùng Chrome/Edge mới hoặc shortcut Màn hình chính trên iPhone.');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Quyền thông báo đang bị chặn trong cài đặt trình duyệt.'
      : 'Bạn chưa cho phép thông báo.');
  }

  const registration = await registerServiceWorker();
  if (!registration) throw new Error('Không thể khởi động dịch vụ thông báo.');

  let subscription = await registration.pushManager.getSubscription();
  const selectedPages = getSelectedPushPages();
  const selectionSignature = getPushSelectionSignature(selectedPages);
  const refreshRegistration = shouldRefreshPushRegistration({
    enabled: localStorage.getItem('metapost_push_enabled') === 'true',
    permission,
    hasSubscription: Boolean(subscription),
    lastRegisteredAt: localStorage.getItem('metapost_push_registered_at'),
    storedSelectionSignature: localStorage.getItem('metapost_push_selection_signature'),
    currentSelectionSignature: selectionSignature
  });
  if (!sendTest && !refreshRegistration) {
    return {
      permission,
      pageCount: Number(localStorage.getItem('metapost_push_page_count') || 0),
      testSent: false,
      webhookAttempted: 0,
      webhookLinkedCount: Number(localStorage.getItem('metapost_push_webhook_linked_count') || 0),
      webhookFailures: [],
      webhookObserved: false,
      lastWebhookAt: null,
      diagnostics: null,
      registrationReused: true
    };
  }

  const configResponse = await fetch('/api/push/config', { cache: 'no-store' });
  const config = await configResponse.json().catch(() => ({}));
  if (!configResponse.ok || !config.publicKey) {
    throw new Error(config.error || 'Máy chủ thông báo chưa sẵn sàng.');
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey)
    });
  }

  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${fbToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      sendTest: Boolean(sendTest),
      ensureWebhook: Boolean(sendTest),
      ...selectedPages
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể đăng ký thông báo nền.');

  localStorage.setItem('metapost_push_enabled', 'true');
  localStorage.setItem('metapost_push_page_count', String(result.pageCount || 0));
  localStorage.setItem('metapost_push_registered_at', String(Date.now()));
  localStorage.setItem('metapost_push_selection_signature', selectionSignature);
  let diagnostics = null;
  if (sendTest) {
    try {
      const statusResponse = await fetch('/api/push/status', {
        method: 'POST', headers: { Authorization: `Bearer ${fbToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(getSelectedPushPages()), signal: AbortSignal.timeout(20_000)
      });
      if (statusResponse.ok) diagnostics = await statusResponse.json();
    } catch { /* Device registration remains valid; report diagnostics as unknown. */ }
  }
  return {
    permission,
    pageCount: result.pageCount || 0,
    testSent: Boolean(result.testSent),
    webhookAttempted: Number(result.webhookAttempted || 0),
    webhookLinkedCount: Number(result.webhookLinkedCount || 0),
    webhookFailures: Array.isArray(result.webhookFailures) ? result.webhookFailures : [],
    appWebhookReady: result.appWebhookReady !== false,
    appWebhookUpdated: Boolean(result.appWebhookUpdated),
    appWebhookError: result.appWebhookError || null,
    webhookObserved: Boolean(result.webhookObserved),
    lastWebhookAt: result.lastWebhookAt || null,
    diagnostics
  };
}

function getSelectedPushPages() {
  try {
    const pageIds = JSON.parse(localStorage.getItem('metapost_visible_page_ids') || '[]');
    return Array.isArray(pageIds) && pageIds.length ? { pageIds } : {};
  } catch { return {}; }
}

function getPushSelectionSignature(selectedPages = getSelectedPushPages()) {
  if (Array.isArray(selectedPages.pageIds) && selectedPages.pageIds.length > 0) {
    return `selected:${[...selectedPages.pageIds].map(String).sort().join(',')}`;
  }
  try {
    const pages = JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]');
    const ids = Array.isArray(pages) ? pages.map(page => String(page?.id || '')).filter(Boolean).sort() : [];
    return `all:${ids.join(',')}`;
  } catch {
    return 'all:';
  }
}

/**
 * Dispatch Lock Screen or In-App Notification with Sound
 */
export async function triggerNewMessageNotification({
  pageId = 'all',
  pageName = 'Fanpage',
  convId = '',
  customerName = 'Khách hàng',
  messageText = 'Tin nhắn mới',
  avatarUrl = null,
  messageId = '',
  playSound = true,
  forceLocal = false
}) {
  if (!(await claimNotificationEvent(pageId, convId, messageId))) {
    return { delivered: false, reason: 'duplicate' };
  }

  // Once server Web Push is enabled, Meta's webhook owns both the OS alert and
  // its sound. Polling remains for UI freshness but must not create a second ding.
  let receivedPages = {};
  try { receivedPages = JSON.parse(localStorage.getItem('metapost_push_received_pages') || '{}'); } catch {}
  if (!forceLocal && shouldUseServerPush({
    enabled: localStorage.getItem('metapost_push_enabled') === 'true',
    permission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
    pageId, receivedPages
  })) {
    return { delivered: false, reason: 'server-push-enabled' };
  }

  // 1. Play "Ting Ting" Chime
  if (playSound) {
    playNotificationChime();
  }

  // 2. Trigger System Lock Screen Notification if allowed
  if (isNotificationSupported()) {
    try {
      if (Notification.permission === 'granted') {
        const title = `${pageName} • ${customerName}`;
        const body = messageText || 'Khách hàng vừa gửi tin nhắn mới';
        const tag = convId ? `chat-${pageId}-${convId}` : `chat-${pageId}`;

        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            await reg.showNotification(title, {
              body,
              icon: avatarUrl || '/icon.svg',
              badge: '/badge.svg',
              data: { pageId, pageName, convId, customerName, messageId },
              tag,
              renotify: true,
              silent: false,
              vibrate: [200, 100, 200]
            });
            return;
          }
        }

        // Fallback
        new Notification(title, { body, tag, silent: false, data: { pageId, pageName, convId, messageId } });
      }
    } catch (e) {
      console.warn('Trigger notification error:', e);
    }
  }
  return { delivered: true };
}
