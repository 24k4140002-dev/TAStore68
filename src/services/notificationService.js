// Web Audio API Crystal Clear "Ting Ting" Chime Synthesizer (0 dependencies, 0 latency)
let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play Dual-Tone "Ting Ting" Notification Chime (iOS Messenger style)
 */
export function playNotificationChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: High crisp Bell (F6 - 1396.91 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1318.51, now); // E6
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    // Tone 2: Bright Sweet Chime (A6 - 1760.00 Hz) at +0.09s
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760.00, now + 0.09); // A6
    gain2.gain.setValueAtTime(0.4, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.56);
  } catch (e) {
    console.warn('Audio chime error:', e);
  }
}

/**
 * Register Service Worker for Web Push & Lock Screen Notifications
 */
export async function registerServiceWorker(onNavigateCallback = null) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    // Listen for messages from SW when user clicks notification
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NAVIGATE_TO_CONVERSATION') {
        const { pageId, convId } = event.data;
        if (onNavigateCallback) {
          onNavigateCallback(pageId, convId);
        }
      }
    });

    return reg;
  } catch (err) {
    console.warn('ServiceWorker registration error:', err);
    return null;
  }
}

/**
 * Check if Web Notification is supported by device (iOS 16.4+ / Android / Desktop)
 */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Request Notification Permission from User
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    // Unlock AudioContext on user click
    getAudioContext();
    const perm = await Notification.requestPermission();
    localStorage.setItem('metapost_notification_permission', perm);
    return perm;
  } catch (e) {
    return 'denied';
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
  playSound = true
}) {
  // 1. Play "Ting Ting" Chime
  if (playSound) {
    playNotificationChime();
  }

  // 2. Trigger System Lock Screen Notification if allowed
  if (isNotificationSupported() && Notification.permission === 'granted') {
    const title = `${customerName} • ${pageName}`;
    const body = messageText || 'Khách hàng vừa gửi tin nhắn mới';
    const tag = convId ? `chat-${convId}` : 'chat-general';

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: avatarUrl || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='25' fill='%232563eb'/><text x='50%' y='65%' font-size='50' font-weight='900' fill='white' text-anchor='middle' font-family='sans-serif'>TA</text></svg>",
            badge: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%232563eb'/></svg>",
            data: { pageId, convId, customerName },
            tag,
            renotify: true,
            vibrate: [200, 100, 200]
          });
          return;
        }
      }

      // Fallback
      new Notification(title, { body, tag });
    } catch (e) {
      console.warn('Trigger notification error:', e);
    }
  }
}
