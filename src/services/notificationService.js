// TAStore68 Pro — Notification Service with Web Audio API + HTML5 Audio Fallback & Web Push

let audioCtx = null;
let isAudioUnlocked = false;

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
  try {
    const el = getOrCreateAudioElement();
    if (el) {
      el.play().then(() => {
        el.pause();
        el.currentTime = 0;
        isAudioUnlocked = true;
      }).catch(() => {});
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

// Auto-unlock on first user tap anywhere on the screen
if (typeof window !== 'undefined') {
  ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { once: false, passive: true });
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
 * Check if Web Notification is supported by device
 */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
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
  if (isNotificationSupported()) {
    try {
      if (Notification.permission === 'granted') {
        const title = `${customerName} • ${pageName}`;
        const body = messageText || 'Khách hàng vừa gửi tin nhắn mới';
        const tag = convId ? `chat-${convId}` : 'chat-general';

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
      }
    } catch (e) {
      console.warn('Trigger notification error:', e);
    }
  }
}
