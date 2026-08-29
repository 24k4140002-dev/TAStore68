import { fromMetaBudget, toMetaBudget } from '../utils/adsMoney.js';

const configuredGraphVersion = import.meta.env?.VITE_META_GRAPH_VERSION || 'v26.0';
export const META_GRAPH_VERSION = /^v\d+\.\d+$/.test(configuredGraphVersion)
  ? configuredGraphVersion
  : 'v26.0';
export const API_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

// Strip invisible characters, smart quotes, zero-width spaces, and newlines (common on iOS)
export function cleanFacebookToken(token) {
  if (!token) return '';
  return String(token)
    .replace(/["'”’‘“]/g, '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t\s]/g, '')
    .trim();
}

// Client-side HTML5 Canvas Smart Image Compression (5MB -> 400KB in ~50ms)
export async function compressImage(file, maxDimension = 1920, quality = 0.82) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    const keepOriginal = () => resolve(file);

    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        if (outputType === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              const compressed = new File([blob], file.name, {
                type: outputType,
                lastModified: Date.now()
              });
              resolve(compressed);
            } else {
              resolve(file);
            }
          },
          outputType,
          quality
        );
      };
      img.onerror = keepOriginal;
      img.src = e.target.result;
    };
    reader.onerror = keepOriginal;
    reader.readAsDataURL(file);
  });
}

// Kept for backward compatibility. Meta does not document invisible text
// mutations as an anti-spam technique, so always preserve the user's content.
export function generateSmartAntiSpam(text) {
  return text;
}

export async function safeFetch(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestUrl = new URL(String(url), typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const headers = new Headers(options.headers || {});
    let accessToken = requestUrl.searchParams.get('access_token') || '';
    if (accessToken) requestUrl.searchParams.delete('access_token');

    const body = options.body;
    if (!accessToken && typeof FormData !== 'undefined' && body instanceof FormData) {
      accessToken = String(body.get('access_token') || '');
      if (accessToken) body.delete('access_token');
    }
    if (!accessToken && typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      accessToken = String(body.get('access_token') || '');
      if (accessToken) body.delete('access_token');
    }
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const fetchTarget = /^https?:/i.test(String(url)) ? requestUrl.toString() : `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
    const res = await fetch(fetchTarget, { ...options, headers, signal: controller.signal });
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Phản hồi không hợp lệ từ Facebook (${res.status})`);
    }
    if (!res.ok || json?.error) {
      const facebookError = json?.error || {};
      const originalMessage = facebookError.message || `HTTP ${res.status}: ${res.statusText}`;
      let msg = originalMessage;
      const code = facebookError.code;
      if (code === 4 || code === 17 || code === 32 || code === 613 || String(msg).toLowerCase().includes('limit reach')) {
        msg = 'Facebook đang giới hạn số lượt yêu cầu trong chốc lát (Rate limit #4). Vui lòng đợi 1-2 phút rồi thử lại.';
      }
      const err = new Error(msg);
      err.code = code;
      err.subcode = facebookError.error_subcode;
      err.facebookMessage = originalMessage;
      err.facebookType = facebookError.type;
      err.userTitle = facebookError.error_user_title;
      err.userMessage = facebookError.error_user_msg;
      err.httpStatus = res.status;
      err.transient = code === 1 || code === 2 || code === 4 || code === 17 || code === 32 || code === 341 || code === 613 || res.status >= 500;
      throw err;
    }
    return json;
  } catch (e) {
    if (e.name === 'AbortError') {
      const timeoutError = new Error('Kết nối Facebook quá chậm. Kiểm tra mạng.');
      timeoutError.transient = true;
      timeoutError.httpStatus = 0;
      throw timeoutError;
    }
    if (e instanceof TypeError) e.transient = true;
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

// Utility to run async tasks in throttled chunks to prevent Facebook rate limiting
export async function runInChunks(items, fn, chunkSize = 3, delayMs = 120, onChunk = null) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const res = await Promise.allSettled(chunk.map(fn));
    results.push(...res);
    if (typeof onChunk === 'function') {
      await onChunk(res, {
        startIndex: i,
        processedCount: Math.min(i + chunk.length, items.length),
        totalCount: items.length
      });
    }
    if (i + chunkSize < items.length && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

export function getInitials(name) {
  if (!name) return 'KH';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(name) {
  const colors = [
    '#1877f2', '#0d9488', '#8b5cf6', '#d97706',
    '#db2777', '#0284c7', '#4f46e5', '#16a34a'
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function isSticker(att, msg = null) {
  if (msg?.sticker || msg?.is_sticker || att?.is_sticker) return true;
  
  const url = typeof att === 'string' ? att : (att?.image_data?.url || att?.file_url || '');
  if (!url) return false;
  
  const lower = url.toLowerCase();
  
  // Facebook Sticker CDN paths and query patterns
  if (
    lower.includes('t39.1997-') ||     // Facebook Sticker CDN prefix
    lower.includes('t39.20818-') ||   // Facebook Animated Sticker CDN prefix
    lower.includes('t39.2365-') ||    // Facebook Sticker Pack prefix
    lower.includes('t39.2147-') ||
    lower.includes('t39.2081-') ||
    lower.includes('/stickers/') ||
    lower.includes('/sticker/') ||
    lower.includes('sticker_id') ||
    lower.includes('rsrc.php') ||
    lower.includes('/emojis/') ||
    lower.includes('static.xx.fbcdn.net') ||
    lower.includes('platform-lookaside.fbsbx.com/platform/stickers') ||
    lower.includes('lookaside.fbsbx.com') ||
    lower.includes('dst-png_s') ||
    (typeof att === 'object' && att?.image_data?.render_as_sticker) ||
    (typeof att === 'object' && att?.name && att.name.toLowerCase().includes('sticker'))
  ) {
    return true;
  }
  
  // If message has no text and attachment is square png
  if (msg && !msg.message && typeof att === 'object' && att?.image_data) {
    const { width, height } = att.image_data;
    if (width && height && width === height && width <= 480 && att.mime_type === 'image/png') {
      return true;
    }
  }
  
  return false;
}

export function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Helper: Format Likes count (e.g. 1062 -> '1.062 Like', 15200 -> '15.2k Like')
export function formatLikesCount(count) {
  if (count === undefined || count === null || isNaN(count)) return '';
  const num = Number(count);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M Like`;
  if (num >= 10000) return `${(num / 1000).toFixed(1)}k Like`;
  return `${num.toLocaleString('vi-VN')} Like`;
}

// Helper: Get Distinct Display Name for a Page (handling duplicate names via nickname, exact like count, or ID)
export function getPageDisplayName(pageOrPageId, allPages = [], nicknames = {}) {
  if (!pageOrPageId) return '';
  const page = typeof pageOrPageId === 'object' ? pageOrPageId : allPages.find(p => p.id === pageOrPageId);
  if (!page) return typeof pageOrPageId === 'string' ? pageOrPageId : '';

  const customNick = nicknames[page.id];
  if (customNick) {
    return `${customNick} (${page.name})`;
  }

  // Prioritize fan_count (Lượt Thích) over followers_count (Lượt Theo Dõi)
  const exactLikes = page.fan_count !== undefined && page.fan_count !== null
    ? page.fan_count
    : page.followers_count;

  const likeStr = formatLikesCount(exactLikes);

  if (likeStr) {
    return `${page.name} (${likeStr})`;
  }

  if (page.username) {
    return `${page.name} (@${page.username})`;
  }

  // If duplicate name exists with other pages and no like count yet, append last 4 digits of Page ID
  const duplicate = allPages.filter(p => p.name === page.name).length > 1;
  if (duplicate && page.id) {
    return `${page.name} (ID ...${page.id.slice(-4)})`;
  }

  return page.name;
}

// Fetch exact fan_count / followers_count from Page node for duplicate-named pages (cached)
export async function enrichPagesWithLikes(pages, fbToken) {
  if (!pages || pages.length === 0) return pages;

  let likesCache = {};
  try {
    likesCache = JSON.parse(localStorage.getItem('metapost_page_likes_cache') || '{}');
  } catch {}

  // Find duplicate named pages or pages missing fan_count and not in cache
  const nameCounts = {};
  pages.forEach(p => {
    nameCounts[p.name] = (nameCounts[p.name] || 0) + 1;
  });

  const duplicatePages = pages.filter(p => (
    nameCounts[p.name] > 1
    && p.fan_count === undefined
    && !likesCache[p.id]
  ));

  if (duplicatePages.length > 0) {
    await runInChunks(duplicatePages, async (page) => {
      const token = page.access_token || fbToken;
      try {
        const res = await safeFetch(
          `${API_BASE}/${page.id}?fields=fan_count,followers_count,username&access_token=${encodeURIComponent(token)}`
        );
        if (res) {
          likesCache[page.id] = {
            fan_count: res.fan_count,
            followers_count: res.followers_count,
            username: res.username || page.username
          };
        }
      } catch {
        // Silently continue without logging
      }
    }, 2, 150);

    try {
      localStorage.setItem('metapost_page_likes_cache', JSON.stringify(likesCache));
    } catch {}
  }

  return pages.map(p => {
    if (likesCache[p.id]) {
      return { ...p, ...likesCache[p.id] };
    }
    return p;
  });
}

// Fetch all managed pages with access tokens, pictures, fan count & username
export async function fetchPages(fbToken) {
  const cleanToken = (fbToken || '').trim();
  if (!cleanToken) return [];
  const res = await safeFetch(
    `${API_BASE}/me/accounts?fields=id,name,category,access_token,picture{data{url}},tasks,fan_count,followers_count,username&limit=100&access_token=${encodeURIComponent(cleanToken)}`
  );
  const rawPages = res.data || [];
  if (rawPages.length === 0) return [];

  // Automatically enrich duplicate-named pages with real fan_count from Facebook
  const enriched = await enrichPagesWithLikes(rawPages, cleanToken);
  return enriched;
}

// Fetch conversations for a specific page with participant avatars & snippet (supports pagination)
export async function fetchPageConversations(pageId, pageName, pageToken, afterCursor = null, limit = 50) {
  if (!pageId || !pageToken) return [];
  const safeLimit = Math.min(50, Math.max(5, Number(limit) || 50));
  let url = `${API_BASE}/${pageId}/conversations?fields=id,updated_time,unread_count,participants{id,name,picture{data{url}}},can_reply,messages.limit(1){id,message,created_time,from,attachments{mime_type,file_url,image_data}}&limit=${safeLimit}&access_token=${encodeURIComponent(pageToken)}`;
  if (afterCursor) {
    url += `&after=${encodeURIComponent(afterCursor)}`;
  }
  const res = await safeFetch(url);

  const conversations = (res.data || []).map(conv => {
      const participants = conv.participants?.data || [];
      const customer = participants.find(p => p.id !== pageId);
      const lastMsg = conv.messages?.data?.[0];
      const customerPsid = customer?.id || '';
      const avatarUrl = customer?.picture?.data?.url || null;

      // Load saved local labels for this conversation or customer
      let savedLabels = [];
      try {
        savedLabels = JSON.parse(
          localStorage.getItem(`metapost_labels_${conv.id}`) ||
          localStorage.getItem(`metapost_labels_${customerPsid}`) ||
          '[]'
        );
      } catch {}

      return {
        id: conv.id,
        fb_conversation_id: conv.id,
        page_id: pageId,
        page_name: pageName,
        page_token: pageToken,
        conversation_type: 'messenger',
        customer_psid: customerPsid,
        customer_name: customer?.name || 'Khách hàng',
        avatar_url: avatarUrl,
        snippet: lastMsg?.message || (lastMsg?.attachments ? '📷 [Hình ảnh/Tệp]' : '...'),
        last_message_at: conv.updated_time,
        can_reply: conv.can_reply !== false,
        last_sender_id: lastMsg?.from?.id,
        last_message_id: lastMsg?.id || '',
        status: 'open',
        is_starred: false,
        // Meta remains authoritative. A browser-local timestamp must never hide
        // a thread that another operator/device marked unread, nor reopen a
        // thread merely because the Page sent a newer reply.
        unread_count: Number(conv.unread_count || 0),
        meta_unread_count: Number(conv.unread_count || 0),
        labels: savedLabels || [],
        reply_deadline: lastMsg?.created_time
          ? new Date(new Date(lastMsg.created_time).getTime() + 24 * 3600 * 1000).toISOString()
          : null
      };
    });

  conversations.pageId = pageId;
  conversations.nextCursor = res.paging?.cursors?.after || null;
  conversations.hasMore = Boolean(res.paging?.next);
  return conversations;
}

// Lightweight heads used only for cross-Page new-message notifications.
// Keeping this separate avoids downloading 50 full conversation cards for
// every Page on each background notification check.
export async function fetchPageConversationHeads(pageId, pageName, pageToken, limit = 10) {
  if (!pageId || !pageToken) return [];
  const safeLimit = Math.min(20, Math.max(1, Number(limit) || 10));
  const res = await safeFetch(
    `${API_BASE}/${pageId}/conversations?fields=id,updated_time,participants{id,name,picture{data{url}}},messages.limit(1){id,message,created_time,from,attachments{mime_type}}&limit=${safeLimit}&access_token=${encodeURIComponent(pageToken)}`
  );

  const heads = (res.data || []).map(conversation => {
    const participants = conversation.participants?.data || [];
    const customer = participants.find(participant => participant.id !== pageId);
    const lastMessage = conversation.messages?.data?.[0];
    return {
      page_id: pageId,
      page_name: pageName,
      conversation_id: conversation.id,
      customer_name: customer?.name || 'Khách hàng',
      avatar_url: customer?.picture?.data?.url || null,
      message_id: lastMessage?.id || '',
      message_text: lastMessage?.message || (lastMessage?.attachments ? '📷 [Hình ảnh/Tệp]' : 'Tin nhắn mới'),
      message_created_at: lastMessage?.created_time || conversation.updated_time,
      sender_id: lastMessage?.from?.id || ''
    };
  });
  heads.pageId = pageId;
  return heads;
}

// Quick scan: fetch unread summary across ALL pages (lightweight, only counts)
export async function fetchAllPagesUnreadSummary(allPages, fbToken) {
  if (!allPages || allPages.length === 0) return { total: 0, perPage: [] };

  const results = await runInChunks(allPages, async (page) => {
    const token = page.access_token || fbToken;
    try {
      const res = await safeFetch(
        `${API_BASE}/${page.id}/conversations?fields=id,updated_time,unread_count&limit=30&access_token=${encodeURIComponent(token)}`
      );
      const convs = res.data || [];
      let unread = 0;
      convs.forEach(c => {
        if (Number(c.unread_count || 0) > 0) unread++;
      });
      return {
        pageId: page.id,
        pageName: page.name,
        pagePicture: page.picture?.data?.url || null,
        unreadCount: unread,
        totalConversations: convs.length
      };
    } catch (e) {
      return {
        pageId: page.id,
        pageName: page.name,
        pagePicture: page.picture?.data?.url || null,
        unreadCount: 0,
        totalConversations: 0,
        error: true,
        errorMessage: e?.message || 'Không đọc được Page này'
      };
    }
  }, 3, 100);

  const perPage = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const total = perPage.reduce((sum, p) => sum + p.unreadCount, 0);
  return { total, perPage };
}

// Fetch messages for a conversation (Ultra-fast direct fetch with 100-message default and pagination)
export async function fetchConversationMessages(conversationId, pageToken, cursor = null, limit = 100) {
  if (!conversationId || !pageToken) return [];
  try {
    let url = `${API_BASE}/${conversationId}/messages?fields=id,created_time,from,message,attachments{id,mime_type,name,size,file_url,image_data},sticker&limit=${limit}&access_token=${encodeURIComponent(pageToken)}`;
    if (cursor) {
      if (typeof cursor === 'string' && cursor.startsWith('http')) {
        url = cursor;
      } else {
        url += `&after=${encodeURIComponent(cursor)}`;
      }
    }
    const res = await safeFetch(url);
    const rawData = res?.data || [];
    const msgs = [...rawData].reverse();
    msgs.forEach(msg => {
      if (msg.sticker) {
        msg.is_sticker = true;
        if (msg.attachments?.data) {
          msg.attachments.data.forEach(a => { a.is_sticker = true; });
        }
      }
    });
    msgs.hasMore = Boolean(res?.paging?.next);
    msgs.nextCursor = res?.paging?.cursors?.after || res?.paging?.next || null;
    return msgs;
  } catch (err) {
    throw err;
  }
}

export async function fetchConversationReadState(conversationId, pageToken) {
  if (!conversationId || !pageToken) return null;
  const res = await safeFetch(
    `${API_BASE}/${conversationId}?fields=id,updated_time,unread_count&access_token=${encodeURIComponent(pageToken)}`
  );
  return {
    conversationId: String(res.id || conversationId),
    unreadCount: Number(res.unread_count || 0),
    updatedTime: res.updated_time || null
  };
}

// Send the supported Messenger seen action, then read the conversation back.
// A successful sender action alone is not treated as proof that Business Suite
// changed its Inbox unread state.
export async function markConversationAsRead(userPsid, pageToken, conversationId = '') {
  if (!userPsid || !pageToken) return false;
  const response = await safeFetch(`${API_BASE}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: userPsid },
      sender_action: 'mark_seen'
    })
  });

  if (!conversationId) {
    return { sent: true, confirmed: false, response };
  }

  let readState = null;
  let readbackError = null;
  const readbackDelays = [0, 300, 900, 1800];
  for (const delayMs of readbackDelays) {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      readState = await fetchConversationReadState(conversationId, pageToken);
      if (readState?.unreadCount === 0) break;
    } catch (error) {
      readbackError = error;
    }
  }

  return {
    sent: true,
    confirmed: readState?.unreadCount === 0,
    unreadCount: readState?.unreadCount ?? null,
    updatedTime: readState?.updatedTime || null,
    readbackError: readbackError?.message || null,
    response
  };
}

export function canMarkConversationSeen(conversation, now = Date.now()) {
  if (!conversation || Number(conversation.unread_count || 0) <= 0) return false;
  if (!conversation.customer_psid || !conversation.last_sender_id || !conversation.page_id) return false;
  if (String(conversation.last_sender_id) === String(conversation.page_id)) return false;
  if (conversation.can_reply === false) return false;
  const replyDeadline = Date.parse(conversation.reply_deadline || '');
  return Number.isFinite(replyDeadline) && replyDeadline > Number(now);
}

const PAGE_INBOX_APP_ID = '263902037430900';

function getFacebookErrorText(error) {
  return [
    error?.message,
    error?.facebookMessage,
    error?.userTitle,
    error?.userMessage
  ].filter(Boolean).join(' ').toLowerCase();
}

export function isThreadControlError(error) {
  const text = getFacebookErrorText(error);
  return Number(error?.subcode) === 2018300 || (
    Number(error?.code) === 10 && (
      text.includes('another app') ||
      text.includes('controlling this thread') ||
      text.includes('controls this thread') ||
      text.includes('thread owner') ||
      text.includes('thread_owner') ||
      text.includes('handover') ||
      text.includes('permission denied to access this thread') ||
      text.includes('kiểm soát thread')
    )
  );
}

export function formatMessengerSendError(error, ownerAppId = '') {
  const text = getFacebookErrorText(error);
  const code = error?.code ? `#${error.code}` : '';
  const subcode = error?.subcode ? `/${error.subcode}` : '';
  const errorCode = code ? ` (Meta ${code}${subcode})` : '';

  if (isThreadControlError(error)) {
    const ownerLabel = ownerAppId === PAGE_INBOX_APP_ID
      ? 'Hộp thư Trang của Meta'
      : (ownerAppId ? `app ID ${ownerAppId}` : 'một ứng dụng Messenger khác');
    return new Error(
      `Cuộc trò chuyện vẫn đang do ${ownerLabel} kiểm soát${errorCode}. ` +
      'Vào Facebook Page → Cài đặt → Thiết lập Trang → Định tuyến cuộc trò chuyện Messenger, ' +
      'gỡ ứng dụng mặc định; sau đó vào Nhắn tin nâng cao và bật “Giành quyền kiểm soát cuộc trò chuyện” cho app đang cấp token MetaPost Studio.'
    );
  }

  if (
    text.includes('24 hour') ||
    text.includes('24-hour') ||
    text.includes('allowed window') ||
    text.includes('outside the window') ||
    text.includes('outside of the allowed')
  ) {
    return new Error(
      `Đã quá cửa sổ nhắn tin 24 giờ của Meta${errorCode}. Khách cần nhắn lại Fanpage trước khi bạn có thể phản hồi bằng tin nhắn thường.`
    );
  }

  if (
    Number(error?.code) === 190 ||
    text.includes('access token') && (text.includes('expired') || text.includes('invalid'))
  ) {
    return new Error(`Facebook Token đã hết hạn hoặc không còn hợp lệ${errorCode}. Hãy tạo token mới rồi kết nối lại Fanpage.`);
  }

  if (
    text.includes('pages_messaging') ||
    text.includes('permission') ||
    Number(error?.code) === 200
  ) {
    return new Error(
      `Token hoặc ứng dụng Meta đang thiếu quyền gửi Messenger${errorCode}. ` +
      'Hãy cấp pages_messaging cho đúng Meta App đã tạo token và kết nối lại Fanpage.'
    );
  }

  const publicMessage = error?.userMessage || error?.facebookMessage || error?.message || 'Meta từ chối gửi tin nhắn.';
  return new Error(`${publicMessage}${errorCode}`);
}

// Read the current owner so the UI can identify a stale routing lock by App ID.
export async function fetchThreadOwner(psid, pageToken) {
  if (!psid || !pageToken) return '';
  try {
    const res = await safeFetch(
      `${API_BASE}/me/thread_owner?recipient=${encodeURIComponent(psid)}&access_token=${encodeURIComponent(pageToken)}`
    );
    const owner = res?.data?.[0]?.thread_owner || res?.data?.[0]?.threadOwner;
    return String(owner?.app_id || owner?.appId || '');
  } catch {
    return '';
  }
}

async function metaLabelsRequest(operation, payload, pageToken) {
  const cleanToken = cleanFacebookToken(pageToken);
  if (!cleanToken) throw new Error('Thiếu Page Token để đồng bộ nhãn Meta.');

  return safeFetch('/api/meta/custom-labels', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ operation, ...payload, pageToken: cleanToken })
  }, 20000);
}

// Take or request thread control from another chatbot / handover app (Facebook Handover Protocol).
export async function takeThreadControl(psid, pageToken) {
  if (!psid || !pageToken) return null;

  let takeoverError = null;

  // Primary Receiver can take control immediately.
  try {
    const res = await safeFetch(`${API_BASE}/me/take_thread_control?access_token=${encodeURIComponent(pageToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: psid },
        metadata: 'TAStore68 Takeover'
      })
    });
    if (res?.success) return { ...res, action: 'taken' };
  } catch (e) {
    takeoverError = e;
  }

  // A Secondary Receiver can only request control. The current owner must release it.
  try {
    const res = await safeFetch(`${API_BASE}/me/request_thread_control?access_token=${encodeURIComponent(pageToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: psid },
        metadata: 'TAStore68 Request'
      })
    });
    if (res?.success) return { ...res, action: 'requested', takeoverError };
  } catch (e) {
    return { success: false, action: 'failed', takeoverError, requestError: e };
  }

  return { success: false, action: 'failed', takeoverError };
}

// Send Messenger message and only invoke Handover Protocol for the exact thread-control error.
export async function sendMessengerMessage(psid, messageText, pageToken, file = null) {
  if (!psid || !pageToken) throw new Error('Thiếu thông tin người nhận hoặc token');

  const sendText = async () => safeFetch(`${API_BASE}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text: messageText.trim() }
    })
  });

  const sendFile = async () => {
      const formData = new FormData();
      formData.append('recipient', JSON.stringify({ id: psid }));
      formData.append('message', JSON.stringify({
        attachment: {
          type: file.type.startsWith('image/') ? 'image' : 'file',
          payload: { is_reusable: true }
        }
      }));
      formData.append('filedata', file);

      return safeFetch(`${API_BASE}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
        method: 'POST',
        body: formData
      });
  };

  const sendWithThreadControl = async (sendOperation) => {
    try {
      return await sendOperation();
    } catch (err) {
      if (!isThreadControlError(err)) throw formatMessengerSendError(err);
      const ownerBeforeTakeover = await fetchThreadOwner(psid, pageToken);
      try {
        const takeover = await takeThreadControl(psid, pageToken);
        await new Promise(r => setTimeout(r, takeover?.action === 'taken' ? 350 : 800));
        return await sendOperation();
      } catch (retryErr) {
        const ownerAfterTakeover = await fetchThreadOwner(psid, pageToken);
        throw formatMessengerSendError(retryErr, ownerAfterTakeover || ownerBeforeTakeover);
      }
    }
  };

  const cleanText = messageText?.trim() || '';
  if (!cleanText && !file) throw new Error('Tin nhắn trống');

  let textResponse = null;
  let fileResponse = null;

  if (cleanText) {
    textResponse = await sendWithThreadControl(sendText);
  }

  if (file) {
    try {
      fileResponse = await sendWithThreadControl(sendFile);
    } catch (error) {
      if (textResponse) {
        error.textSent = true;
        error.textResponse = textResponse;
        error.message = `Đã gửi nội dung chữ lên Meta nhưng ảnh/tệp chưa gửi được. ${error.message}`;
      }
      throw error;
    }
  }

  return textResponse
    ? { ...textResponse, attachment_message_id: fileResponse?.message_id || null }
    : fileResponse;
}

// Send comment reply
export async function sendCommentReply(commentId, messageText, pageToken) {
  return safeFetch(`${API_BASE}/${commentId}/comments?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: messageText })
  });
}

// Send private reply from comment
export async function sendPrivateReply(commentId, messageText, pageToken) {
  return safeFetch(`${API_BASE}/${commentId}/private_replies?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: messageText })
  });
}

// Automatically subscribe a Facebook Page to the App's Webhooks (1-Click Auto Webhook)
export async function subscribePageWebhooks(pageId, pageToken) {
  if (!pageId || !pageToken) return null;
  try {
    return await safeFetch(
      `${API_BASE}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_reads,message_deliveries&access_token=${encodeURIComponent(pageToken)}`,
      { method: 'POST' }
    );
  } catch (e) {
    console.warn(`[AutoWebhook] Failed to subscribe page ${pageId}:`, e?.message);
    return null;
  }
}

// Automatically subscribe all active pages to Webhooks in the background
export async function subscribeAllPagesWebhooks(pages = []) {
  if (!Array.isArray(pages) || pages.length === 0) return;
  return runInChunks(pages, async (page) => {
    if (page?.id && page?.access_token) {
      await subscribePageWebhooks(page.id, page.access_token);
    }
  }, 3, 200);
}

// ----------------------------------------------------
// FACEBOOK PAGE CUSTOM LABELS API (Meta Business Suite Sync)
// ----------------------------------------------------

export function getEmojiForLabel(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('đặt') || lower.includes('chốt') || lower.includes('order')) return '✅';
  if (lower.includes('tiềm năng') || lower.includes('lead')) return '⭐';
  if (lower.includes('tư vấn') || lower.includes('chat')) return '💬';
  if (lower.includes('follow') || lower.includes('gọi')) return '📞';
  if (lower.includes('vip')) return '👑';
  if (lower.includes('xử lý')) return '⚙️';
  if (lower.includes('hủy') || lower.includes('cancel')) return '❌';
  if (lower.includes('thanh toán') || lower.includes('tiền')) return '💰';
  if (lower.includes('giao') || lower.includes('ship')) return '🚚';
  return '🏷️';
}

export function getColorForLabel(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('đặt') || lower.includes('chốt')) return '#10b981'; // Emerald/Green
  if (lower.includes('tiềm năng')) return '#f59e0b'; // Amber
  if (lower.includes('tư vấn')) return '#3b82f6'; // Blue
  if (lower.includes('follow') || lower.includes('gọi')) return '#8b5cf6'; // Purple
  if (lower.includes('vip')) return '#ec4899'; // Pink
  if (lower.includes('xử lý')) return '#ea580c'; // Orange
  if (lower.includes('hủy')) return '#ef4444'; // Red
  if (lower.includes('thanh toán')) return '#06b6d4'; // Cyan
  return '#64748b'; // Slate
}

// Fetch custom labels from a Facebook Page. User assignments are fetched by
// PSID because the current Custom Labels API no longer exposes a users field
// on the Page label list.
export async function fetchPageLabelsWithUsers(pageId, pageToken) {
  if (!pageId || !pageToken) return { labels: [], userLabelsMap: {} };
  const res = await metaLabelsRequest('list_page_labels', { pageId }, pageToken);
  const labels = [];

    (res.data || []).forEach(l => {
      const name = l.page_label_name || 'Nhãn';
      const labelObj = {
        id: l.id,
        name: name,
        emoji: getEmojiForLabel(name),
        color: getColorForLabel(name),
        page_id: pageId,
        source: 'meta'
      };
      labels.push(labelObj);
    });

  return { labels, userLabelsMap: {}, unsupported: Boolean(res.unsupported) };
}

// Fetch custom labels from Facebook Page
export async function fetchPageLabels(pageId, pageToken) {
  const result = await fetchPageLabelsWithUsers(pageId, pageToken);
  if (result.unsupported) {
    Object.defineProperty(result.labels, 'unsupported', { value: true });
  }
  return result.labels;
}

// Create new custom label on Facebook Page
export async function createPageLabel(pageId, pageToken, labelName) {
  if (!pageId || !pageToken || !labelName) return null;
  try {
    const res = await metaLabelsRequest('create_label', { pageId, labelName }, pageToken);
    return res;
  } catch (e) {
    console.warn('Create page label error:', e.message);
    throw e;
  }
}

// Assign label to customer (PSID) on Facebook Page
export async function assignLabelToUser(labelId, userPsid, pageToken) {
  if (!labelId || !userPsid || !pageToken) return false;
  try {
    await metaLabelsRequest('assign_label', { labelId, userPsid }, pageToken);
    return true;
  } catch (e) {
    console.warn('Assign label to user error:', e.message);
    return false;
  }
}

// Unassign label from customer (PSID) on Facebook Page
export async function unassignLabelFromUser(labelId, userPsid, pageToken) {
  if (!labelId || !userPsid || !pageToken) return false;
  try {
    await metaLabelsRequest('unassign_label', { labelId, userPsid }, pageToken);
    return true;
  } catch (e) {
    console.warn('Unassign label from user error:', e.message);
    return false;
  }
}

// Smart helper: Ensure label exists on Facebook Page and assign to customer (PSID)
export async function syncAssignPageLabel(pageId, pageToken, label, userPsid) {
  if (!pageId || !pageToken || !label) return label;
  try {
    let targetLabelId = label.page_id && label.page_id !== pageId ? null : label.id;

    // If ID is not a real Facebook numeric ID (e.g. meta_ordered), look up or create on FB Page
    if (!targetLabelId || String(targetLabelId).startsWith('meta_') || isNaN(Number(targetLabelId))) {
      const existingLabels = await fetchPageLabels(pageId, pageToken);
      const match = existingLabels.find(l => l.name.toLowerCase().trim() === label.name.toLowerCase().trim());
      if (match) {
        targetLabelId = match.id;
      } else {
        const created = await createPageLabel(pageId, pageToken, label.name);
        if (created?.id) {
          targetLabelId = created.id;
        }
      }
    }

    // Now assign the real Facebook label to user
    let metaSynced = false;
    if (targetLabelId && userPsid && !String(targetLabelId).startsWith('meta_')) {
      metaSynced = await assignLabelToUser(targetLabelId, userPsid, pageToken);
    }

    return {
      ...label,
      id: targetLabelId || label.id,
      page_id: pageId,
      source: metaSynced ? 'meta' : (label.source || 'local'),
      metaSynced
    };
  } catch (e) {
    console.warn('syncAssignPageLabel error:', e.message);
    return label;
  }
}

// Smart helper: Unassign label from customer (PSID) on Facebook Page
export async function syncUnassignPageLabel(pageId, pageToken, labelIdOrName, userPsid) {
  if (!pageId || !pageToken || !userPsid) return false;
  try {
    let targetLabelId = labelIdOrName;
    if (typeof labelIdOrName === 'string' && (labelIdOrName.startsWith('meta_') || isNaN(Number(labelIdOrName)))) {
      const existingLabels = await fetchPageLabels(pageId, pageToken);
      const match = existingLabels.find(l => l.id === labelIdOrName || l.name.toLowerCase().trim() === labelIdOrName.toLowerCase().trim());
      if (match) targetLabelId = match.id;
      else return false;
    }
    if (targetLabelId && !String(targetLabelId).startsWith('meta_')) {
      return await unassignLabelFromUser(targetLabelId, userPsid, pageToken);
    }
    return false;
  } catch (e) {
    console.warn('syncUnassignPageLabel error:', e.message);
    return false;
  }
}

async function cleanupUnpublishedPhotos(photoIds, pageToken) {
  if (photoIds.length === 0) return;
  await runInChunks(photoIds, async photoId => {
    const formData = new FormData();
    formData.append('access_token', pageToken);
    return safeFetch(`${API_BASE}/${photoId}`, { method: 'DELETE', body: formData });
  }, 2, 150);
}

async function runPublishStage(stage, task, details = {}) {
  try {
    return await task();
  } catch (error) {
    if (error && typeof error === 'object') {
      error.publishStage = stage;
      Object.assign(error, details);
    }
    throw error;
  }
}

// Post to a single Facebook Page (supports text, link, photo albums, video and scheduling)
export async function publishToFacebookPage(page, {
  postType = 'photo',
  postText = '',
  postLink = '',
  mediaFiles = [],
  isScheduled = false,
  scheduleTimestamp = null,
  onMediaProgress
}) {
  const pageToken = page.access_token;
  if (!pageToken) {
    throw new Error('Thiếu Page Access Token (Quyền quản trị trang)');
  }

  const finalMessage = postText;

  // 1. Text & Optional Link Post
  if (postType === 'text' || (postType === 'photo' && mediaFiles.length === 0)) {
    const url = `${API_BASE}/${page.id}/feed`;
    const formData = new FormData();
    formData.append('message', finalMessage);
    formData.append('access_token', pageToken);

    if (postLink) {
      formData.append('link', postLink);
    }

    if (isScheduled && scheduleTimestamp) {
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', scheduleTimestamp);
    }

    return runPublishStage('feed', () => safeFetch(url, { method: 'POST', body: formData }));
  }

  // 2. Single Photo Post
  if (postType === 'photo' && mediaFiles.length === 1) {
    const url = `${API_BASE}/${page.id}/photos`;
    const formData = new FormData();
    formData.append('source', mediaFiles[0]);
    formData.append('caption', finalMessage);
    formData.append('access_token', pageToken);

    if (isScheduled && scheduleTimestamp) {
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', scheduleTimestamp);
    }

    return runPublishStage('single_photo', () => safeFetch(url, { method: 'POST', body: formData }));
  }

  // 3. Multi-Photo Post (Upload unreleased photos first, then attach to feed)
  if (postType === 'photo' && mediaFiles.length > 1) {
    const mediaFbidArray = [];
    const uploadedPhotoIds = [];
    let feedRequestStarted = false;

    try {
      for (let p = 0; p < mediaFiles.length; p++) {
        const uploadUrl = `${API_BASE}/${page.id}/photos`;
        const photoForm = new FormData();
        photoForm.append('source', mediaFiles[p]);
        photoForm.append('published', 'false');
        photoForm.append('access_token', pageToken);

        const photoJson = await runPublishStage(
          'photo_upload',
          () => safeFetch(uploadUrl, { method: 'POST', body: photoForm }, 60000),
          { mediaIndex: p + 1 }
        );
        uploadedPhotoIds.push(photoJson.id);
        mediaFbidArray.push({ media_fbid: photoJson.id });
        onMediaProgress?.(p + 1, mediaFiles.length);
      }

      // Create one feed post from the unpublished photos.
      const feedUrl = `${API_BASE}/${page.id}/feed`;
      const feedForm = new FormData();
      feedForm.append('message', finalMessage);
      feedForm.append('attached_media', JSON.stringify(mediaFbidArray));
      feedForm.append('access_token', pageToken);

      if (isScheduled && scheduleTimestamp) {
        feedForm.append('published', 'false');
        feedForm.append('scheduled_publish_time', scheduleTimestamp);
      }

      feedRequestStarted = true;
      return await runPublishStage('album_feed', () => safeFetch(feedUrl, { method: 'POST', body: feedForm }, 60000));
    } catch (error) {
      // Delete only drafts created by this failed attempt. If the feed request
      // timed out or failed server-side, its outcome is uncertain, so keep them.
      const isConfirmedClientRejection = error.httpStatus >= 400 && error.httpStatus < 500;
      if (!feedRequestStarted || isConfirmedClientRejection) {
        await cleanupUnpublishedPhotos(uploadedPhotoIds, pageToken).catch(() => {});
      }
      throw error;
    }
  }

  // 4. Video Post
  if (postType === 'video' && mediaFiles.length > 0) {
    const url = `${API_BASE}/${page.id}/videos`;
    const formData = new FormData();
    formData.append('source', mediaFiles[0]);
    formData.append('description', finalMessage);
    formData.append('access_token', pageToken);

    if (isScheduled && scheduleTimestamp) {
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', scheduleTimestamp);
    }

    return runPublishStage('video_upload', () => safeFetch(url, { method: 'POST', body: formData }, 120000)); // 120s timeout for video
  }

  throw new Error('Loại bài đăng hoặc tệp đính kèm không hợp lệ.');
}

// Helper to get Facebook post link
export function getFacebookPostUrl(pageId, postId) {
  if (!postId) return `https://www.facebook.com/${pageId}`;
  if (String(postId).includes('_')) {
    const parts = String(postId).split('_');
    return `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
  }
  return `https://www.facebook.com/${pageId}/posts/${postId}`;
}

// Exchange a short-lived user token for a long-lived token via the server.
// App credentials never enter the browser bundle.
export async function exchangePermanentToken(shortToken) {
  const cleanShort = cleanFacebookToken(shortToken);
  if (!cleanShort) {
    throw new Error('Vui lòng nhập Token ngắn hạn (bắt đầu bằng EAA...)');
  }

  const res = await fetch('/api/meta/exchange-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ shortToken: cleanShort })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error || `Không thể đổi Token (HTTP ${res.status}).`);
  }
  return data.access_token;
}

// Fetch assigned custom labels for a specific customer (PSID)
export async function fetchUserLabels(userPsid, pageToken) {
  if (!userPsid || !pageToken) return [];
  const res = await metaLabelsRequest('list_user_labels', { userPsid }, pageToken);
  const labels = (res.data || []).map(l => ({
    id: l.id,
    name: l.page_label_name,
    emoji: getEmojiForLabel(l.page_label_name),
    color: getColorForLabel(l.page_label_name),
    source: 'meta'
  }));
  if (res.unsupported) Object.defineProperty(labels, 'unsupported', { value: true });
  return labels;
}

// Hide a Facebook Comment (e.g. comment containing customer phone number)
export async function hideComment(commentId, pageToken) {
  if (!commentId || !pageToken) return;
  return safeFetch(
    `${API_BASE}/${commentId}?is_hidden=true&access_token=${encodeURIComponent(pageToken)}`,
    { method: 'POST' }
  );
}

// List of popular Vietnamese Banks for VietQR
export const VIETQR_BANKS = [
  { code: 'MB', name: 'MBBank (Quân Đội)', bin: '970422' },
  { code: 'VCB', name: 'Vietcombank', bin: '970436' },
  { code: 'TCB', name: 'Techcombank', bin: '970407' },
  { code: 'ACB', name: 'ACB', bin: '970416' },
  { code: 'VPB', name: 'VPBank', bin: '970432' },
  { code: 'TPB', name: 'TPBank', bin: '970423' },
  { code: 'CTG', name: 'VietinBank', bin: '970415' },
  { code: 'BIDV', name: 'BIDV', bin: '970418' },
  { code: 'STB', name: 'Sacombank', bin: '970403' },
  { code: 'OCB', name: 'OCB', bin: '970448' },
  { code: 'MSB', name: 'MSB', bin: '970426' },
  { code: 'VIB', name: 'VIB', bin: '970441' },
  { code: 'VBA', name: 'Agribank', bin: '970405' },
  { code: 'CAKE', name: 'CAKE by VPBank', bin: '546034' },
  { code: 'TIMO', name: 'Timo by BVBank', bin: '963388' }
];

// Generate standard VietQR Image URL
export function generateVietQRUrl({ bankCode, accountNo, accountName, amount, memo }) {
  const cleanBank = (bankCode || 'MB').trim();
  const cleanAcc = (accountNo || '').trim();
  const cleanName = encodeURIComponent((accountName || '').trim());
  const cleanMemo = encodeURIComponent((memo || 'TAStore68 chuyen khoan').trim());
  const cleanAmount = parseInt(amount, 10) || 0;

  return `https://img.vietqr.io/image/${cleanBank}-${cleanAcc}-compact.png?amount=${cleanAmount}&addInfo=${cleanMemo}&accountName=${cleanName}`;
}

// Default Quick Reply Templates for Sports & Fashion Stores
export const DEFAULT_QUICK_REPLIES = [
  {
    id: 'qr_size',
    shortcut: '/size',
    title: '👕 Bảng tư vấn chọn size',
    text: `Dạ shop gửi bạn bảng size chuẩn form thể thao bên shop ạ:
• Size S: 45kg - 55kg (Cao 1m50 - 1m62)
• Size M: 56kg - 65kg (Cao 1m63 - 1m70)
• Size L: 66kg - 75kg (Cao 1m70 - 1m77)
• Size XL: 76kg - 85kg (Cao 1m77 - 1m84)
• Size XXL: 86kg - 95kg (Cao trên 1m80)

Bạn cho shop xin Chiều cao & Cân nặng để shop lấy size vừa vặn nhất cho bạn nhé! ✨`
  },
  {
    id: 'qr_stk',
    shortcut: '/stk',
    title: '💳 Thông tin chuyển khoản (STK)',
    text: `Dạ bạn chuyển khoản thanh toán qua STK shop nhé:
🏦 Ngân hàng: MB Bank
🔢 Số tài khoản: [Số tài khoản của bạn]
👤 Chủ tài khoản: [Tên chủ tài khoản]
📝 Nội dung: [Tên bạn hoặc SĐT]

Chuyển xong bạn chụp lại bill gửi shop để shop đóng gói gửi đi ngay nhé! Cảm ơn bạn nhiều ạ 🥰`
  },
  {
    id: 'qr_in',
    shortcut: '/in',
    title: '🖨️ Bảng giá in tên số & logo',
    text: `Dạ bên shop có hỗ trợ in tên số theo yêu cầu bằng công nghệ Decal PU thể thao cao cấp chống bong tróc:
• In Tên + Số áo: +30k / áo
• In Logo ngực / Logo tay / Nhà tài trợ: +15k - 20k / vị trí
• Thời gian in lấy ngay trong ngày.

Bạn muốn in Tên & Số gì nhắn shop lên demo cho bạn xem trước nha! ⚽🔥`
  },
  {
    id: 'qr_ship',
    shortcut: '/ship',
    title: '🚚 Thời gian & Phí giao hàng',
    text: `Dạ shop gửi hàng toàn quốc:
• Phí ship đồng giá: 25k (Miễn phí ship khi mua từ 2 bộ / đơn từ 300k).
• Nội tỉnh / lân cận: 1 - 2 ngày nhận hàng.
• Các tỉnh khác: 2 - 3 ngày nhận hàng.
• Khách được kiểm tra hàng trước khi thanh toán thoải mái ạ! 📦`
  },
  {
    id: 'qr_camon',
    shortcut: '/camon',
    title: '🎉 Cảm ơn đã chốt đơn',
    text: `Shop đã ghi nhận đơn hàng của bạn thành công! Đơn sẽ được kiểm tra kỹ và gửi đi sớm nhất. Khi nhận được hàng bạn mặc thử có bất kỳ vấn đề gì cứ nhắn shop hỗ trợ đổi size miễn phí nhé. Chúc bạn một ngày tràn đầy năng lượng! ❤️`
  }
];

// ==========================================
// 📊 FACEBOOK MARKETING & ADS API HELPERS
// ==========================================

/**
 * Fetch all Ad Accounts connected to this Facebook token
 */
export async function fetchAdAccounts(token) {
  const clean = cleanFacebookToken(token);
  if (!clean) return [];
  try {
    const data = await safeFetch(
      `${API_BASE}/me/adaccounts?fields=id,name,account_id,account_status,currency,min_daily_budget,amount_spent,balance,spend_cap&limit=50&access_token=${encodeURIComponent(clean)}`
    );
    return data.data || [];
  } catch (err) {
    return { error: { message: err.message, code: err.code, subcode: err.subcode } };
  }
}

/**
 * Extract Messaging conversations count & Cost per message from Facebook Insights
 */
export function extractMessagingStats(actions = [], costPerAction = [], totalSpend = 0) {
  let messagingCount = 0;
  let costPerMessage = 0;

  if (Array.isArray(actions)) {
    const msgAction = actions.find(a => 
      a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
      a.action_type === 'onsite_conversion.messaging_first_reply' ||
      a.action_type === 'onsite_conversion.total_messaging_connection'
    );
    if (msgAction) {
      messagingCount = parseInt(msgAction.value, 10) || 0;
    }
  }

  if (Array.isArray(costPerAction)) {
    const msgCost = costPerAction.find(a => 
      a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
      a.action_type === 'onsite_conversion.messaging_first_reply' ||
      a.action_type === 'onsite_conversion.total_messaging_connection'
    );
    if (msgCost) {
      costPerMessage = parseFloat(msgCost.value) || 0;
    }
  }

  // Fallback calculation if cost_per_action_type was omitted by FB API
  if (costPerMessage === 0 && messagingCount > 0 && totalSpend > 0) {
    costPerMessage = Math.round(totalSpend / messagingCount);
  }

  return { messagingCount, costPerMessage };
}

/**
 * Fetch Account-level High-level Insights (Spend, Impressions, Clicks, CPC, CPM, CTR)
 */
export async function fetchAdAccountInsights(adAccountId, token, datePreset = 'today') {
  const clean = cleanFacebookToken(token);
  if (!clean || !adAccountId) return null;
  try {
    const data = await safeFetch(
      `${API_BASE}/${encodeURIComponent(adAccountId)}/insights?fields=spend,impressions,clicks,cpc,cpm,ctr,reach,actions,cost_per_action_type&date_preset=${encodeURIComponent(datePreset)}&access_token=${encodeURIComponent(clean)}`
    );
    
    const insight = data.data?.[0] || null;
    if (!insight) {
      return {
        spend: 0,
        impressions: 0,
        clicks: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
        reach: 0,
        messagingCount: 0,
        costPerMessage: 0
      };
    }

    const spend = parseFloat(insight.spend || 0);
    const { messagingCount, costPerMessage } = extractMessagingStats(
      insight.actions,
      insight.cost_per_action_type,
      spend
    );

    return {
      spend,
      impressions: parseInt(insight.impressions || 0, 10),
      clicks: parseInt(insight.clicks || 0, 10),
      reach: parseInt(insight.reach || 0, 10),
      cpc: parseFloat(insight.cpc || 0),
      cpm: parseFloat(insight.cpm || 0),
      ctr: parseFloat(insight.ctr || 0),
      messagingCount,
      costPerMessage
    };
  } catch (err) {
    return { error: { message: err.message, code: err.code, subcode: err.subcode } };
  }
}

/**
 * Fetch Campaigns with their Insights for specific date preset
 */
export async function fetchCampaignsWithInsights(adAccountId, token, datePreset = 'today', currency = 'USD') {
  const clean = cleanFacebookToken(token);
  if (!clean || !adAccountId) return [];
  try {
    const fields = `id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(${datePreset}){spend,impressions,clicks,cpc,cpm,ctr,reach,actions,cost_per_action_type}`;
    const data = await safeFetch(
      `${API_BASE}/${encodeURIComponent(adAccountId)}/campaigns?fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(clean)}`
    );

    const rawList = data.data || [];
    return rawList.map(camp => {
      const insight = camp.insights?.data?.[0] || null;
      const spend = insight ? parseFloat(insight.spend || 0) : 0;
      const { messagingCount, costPerMessage } = extractMessagingStats(
        insight?.actions,
        insight?.cost_per_action_type,
        spend
      );

      return {
        id: camp.id,
        name: camp.name,
        status: camp.status, // 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
        objective: camp.objective,
        daily_budget: fromMetaBudget(camp.daily_budget, currency),
        lifetime_budget: fromMetaBudget(camp.lifetime_budget, currency),
        spend,
        impressions: insight ? parseInt(insight.impressions || 0, 10) : 0,
        clicks: insight ? parseInt(insight.clicks || 0, 10) : 0,
        reach: insight ? parseInt(insight.reach || 0, 10) : 0,
        cpc: insight ? parseFloat(insight.cpc || 0) : 0,
        cpm: insight ? parseFloat(insight.cpm || 0) : 0,
        ctr: insight ? parseFloat(insight.ctr || 0) : 0,
        messagingCount,
        costPerMessage
      };
    });
  } catch (err) {
    return { error: { message: err.message, code: err.code, subcode: err.subcode } };
  }
}

/**
 * Toggle Campaign Status (ACTIVE <-> PAUSED)
 */
export async function toggleCampaignStatus(campaignId, newStatus, token) {
  const clean = cleanFacebookToken(token);
  if (!clean || !campaignId) throw new Error('Missing token or campaign ID');

  const formData = new URLSearchParams();
  formData.append('status', newStatus);
  formData.append('access_token', clean);

  if (!['ACTIVE', 'PAUSED'].includes(newStatus)) throw new Error('Trạng thái chiến dịch không hợp lệ');
  return safeFetch(`${API_BASE}/${campaignId}`, {
    method: 'POST',
    body: formData
  });
}

/**
 * Update Campaign Daily Budget
 */
export async function updateCampaignBudget(campaignId, dailyBudget, token, currency = 'USD') {
  const clean = cleanFacebookToken(token);
  if (!clean || !campaignId) throw new Error('Missing token or campaign ID');

  const formData = new URLSearchParams();
  formData.append('daily_budget', String(toMetaBudget(dailyBudget, currency)));
  formData.append('access_token', clean);
  return safeFetch(`${API_BASE}/${campaignId}`, {
    method: 'POST',
    body: formData
  });
}

/**
 * Fetch Daily Insights Breakdown for Visual Trend Chart
 */
export async function fetchDailyAccountInsights(adAccountId, token, datePreset = 'last_7d') {
  const clean = cleanFacebookToken(token);
  if (!clean || !adAccountId) return [];
  try {
    const data = await safeFetch(
      `${API_BASE}/${encodeURIComponent(adAccountId)}/insights?fields=spend,impressions,clicks,cpc,cpm,ctr,actions,cost_per_action_type&time_increment=1&date_preset=${encodeURIComponent(datePreset)}&access_token=${encodeURIComponent(clean)}`
    );

    const rawList = data.data || [];
    return rawList.map(item => {
      const spend = parseFloat(item.spend || 0);
      const { messagingCount, costPerMessage } = extractMessagingStats(
        item.actions,
        item.cost_per_action_type,
        spend
      );
      return {
        date: item.date_start,
        spend,
        messagingCount,
        costPerMessage,
        impressions: parseInt(item.impressions || 0, 10),
        clicks: parseInt(item.clicks || 0, 10),
        ctr: parseFloat(item.ctr || 0)
      };
    });
  } catch (err) {
    return { error: { message: err.message, code: err.code, subcode: err.subcode } };
  }
}

/**
 * Fetch Ads (Creatives & Performance) inside a Campaign
 */
export async function fetchCampaignAds(campaignId, token, datePreset = 'today') {
  const clean = cleanFacebookToken(token);
  if (!clean || !campaignId) return [];
  try {
    const fields = `id,name,status,creative{id,title,body,image_url,thumbnail_url,effective_object_story_id},insights.date_preset(${datePreset}){spend,impressions,clicks,cpc,cpm,ctr,actions,cost_per_action_type}`;
    const data = await safeFetch(
      `${API_BASE}/${encodeURIComponent(campaignId)}/ads?fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(clean)}`
    );

    const rawList = data.data || [];
    return rawList.map(ad => {
      const insight = ad.insights?.data?.[0] || null;
      const spend = insight ? parseFloat(insight.spend || 0) : 0;
      const { messagingCount, costPerMessage } = extractMessagingStats(
        insight?.actions,
        insight?.cost_per_action_type,
        spend
      );

      return {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        creative: {
          title: ad.creative?.title || '',
          body: ad.creative?.body || '',
          imageUrl: ad.creative?.image_url || ad.creative?.thumbnail_url || '',
          storyId: ad.creative?.effective_object_story_id || null
        },
        spend,
        impressions: insight ? parseInt(insight.impressions || 0, 10) : 0,
        clicks: insight ? parseInt(insight.clicks || 0, 10) : 0,
        ctr: insight ? parseFloat(insight.ctr || 0) : 0,
        messagingCount,
        costPerMessage
      };
    });
  } catch (err) {
    return { error: { message: err.message, code: err.code, subcode: err.subcode } };
  }
}


