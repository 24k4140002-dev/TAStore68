export const META_GRAPH_VERSION = 'v19.0';
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
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              const compressed = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressed);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Generate unique zero-width characters and random tag to prevent duplicate content flags
export function generateSmartAntiSpam(text, pageIndex = 0, totalPages = 1) {
  if (!text || totalPages <= 1) return text;
  const zeroWidthSpaces = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
  const zws = Array.from({ length: (pageIndex % 5) + 1 }, () =>
    zeroWidthSpaces[Math.floor(Math.random() * zeroWidthSpaces.length)]
  ).join('');
  const randomTag = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${text}${zws}\n\n🏷️ [#${randomTag}]`;
}

export async function safeFetch(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Phản hồi không hợp lệ từ Facebook (${res.status})`);
    }
    if (!res.ok || json?.error) {
      let msg = json?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      const code = json?.error?.code;
      if (code === 4 || code === 17 || code === 32 || code === 613 || String(msg).toLowerCase().includes('limit reach')) {
        msg = 'Facebook đang giới hạn số lượt yêu cầu trong chốc lát (Rate limit #4). Vui lòng đợi 1-2 phút rồi thử lại.';
      }
      const err = new Error(msg);
      err.code = code;
      throw err;
    }
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Kết nối Facebook quá chậm. Kiểm tra mạng.');
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

// Utility to run async tasks in throttled chunks to prevent Facebook rate limiting
export async function runInChunks(items, fn, chunkSize = 3, delayMs = 120) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const res = await Promise.allSettled(chunk.map(fn));
    results.push(...res);
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

  const duplicatePages = pages.filter(p =>
    (nameCounts[p.name] > 1 || p.fan_count === undefined) && !likesCache[p.id]
  );

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
    `${API_BASE}/me/accounts?fields=id,name,category,access_token,picture{data{url}},tasks&limit=100&access_token=${encodeURIComponent(cleanToken)}`
  );
  const rawPages = res.data || [];
  if (rawPages.length === 0) return [];

  // Automatically enrich duplicate-named pages with real fan_count from Facebook
  const enriched = await enrichPagesWithLikes(rawPages, cleanToken);
  return enriched;
}

// Fetch conversations for a specific page with participant avatars & snippet (supports pagination)
export async function fetchPageConversations(pageId, pageName, pageToken, afterCursor = null) {
  if (!pageId || !pageToken) return [];
  try {
    let url = `${API_BASE}/${pageId}/conversations?fields=id,updated_time,unread_count,participants{id,name,picture{data{url}}},can_reply,messages.limit(1){id,message,created_time,from,attachments{mime_type,file_url,image_data}}&limit=50&access_token=${encodeURIComponent(pageToken)}`;
    if (afterCursor) {
      url += `&after=${encodeURIComponent(afterCursor)}`;
    }
    const res = await safeFetch(url);

    if (!res.data) return [];

    // Load local read map
    let readMap = {};
    try {
      readMap = JSON.parse(localStorage.getItem('metapost_read_map') || '{}');
    } catch {}

    return res.data.map(conv => {
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

      // Unread logic:
      // 1. If user previously viewed this conversation (in readMap), check if a NEW message arrived after read timestamp
      // 2. Otherwise, trust Facebook Graph API's conv.unread_count
      const readUntil = readMap[conv.id];
      const msgTime = conv.updated_time || lastMsg?.created_time;
      let effectiveUnread = conv.unread_count || 0;

      if (readUntil && msgTime) {
        if (new Date(msgTime).getTime() <= new Date(readUntil).getTime()) {
          effectiveUnread = 0; // Already read
        } else {
          effectiveUnread = effectiveUnread > 0 ? effectiveUnread : 1; // New message after read
        }
      }

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
        status: 'open',
        is_starred: false,
        unread_count: effectiveUnread,
        labels: savedLabels || [],
        reply_deadline: lastMsg?.created_time
          ? new Date(new Date(lastMsg.created_time).getTime() + 24 * 3600 * 1000).toISOString()
          : null
      };
    });

    conversations.nextCursor = res.paging?.cursors?.after || null;
    conversations.hasMore = !!(res.paging?.next || res.paging?.cursors?.after);
    return conversations;
  } catch (err) {
    console.warn(`Fetch conversations failed for ${pageName}:`, err.message);
    return [];
  }
}

// Quick scan: fetch unread summary across ALL pages (lightweight, only counts)
export async function fetchAllPagesUnreadSummary(allPages, fbToken) {
  if (!allPages || allPages.length === 0) return { total: 0, perPage: [] };

  // Load read tracking from localStorage
  let readMap = {};
  try {
    readMap = JSON.parse(localStorage.getItem('metapost_read_map') || '{}');
  } catch {}

  const results = await runInChunks(allPages, async (page) => {
    const token = page.access_token || fbToken;
    try {
      const res = await safeFetch(
        `${API_BASE}/${page.id}/conversations?fields=id,updated_time,unread_count&limit=30&access_token=${encodeURIComponent(token)}`
      );
      const convs = res.data || [];
      let unread = 0;
      convs.forEach(c => {
        const readUntil = readMap[c.id];
        let isConvUnread = (c.unread_count || 0) > 0;
        if (readUntil && c.updated_time) {
          if (new Date(c.updated_time).getTime() <= new Date(readUntil).getTime()) {
            isConvUnread = false; // Already read
          } else {
            isConvUnread = true; // New message arrived
          }
        }
        if (isConvUnread) unread++;
      });
      return {
        pageId: page.id,
        pageName: page.name,
        pagePicture: page.picture?.data?.url || null,
        unreadCount: unread,
        totalConversations: convs.length
      };
    } catch (e) {
      return { pageId: page.id, pageName: page.name, pagePicture: null, unreadCount: 0, totalConversations: 0 };
    }
  }, 3, 100);

  const perPage = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const total = perPage.reduce((sum, p) => sum + p.unreadCount, 0);
  return { total, perPage };
}

// Fetch messages for a conversation
export async function fetchConversationMessages(conversationId, pageToken) {
  if (!conversationId || !pageToken) return [];
  const res = await safeFetch(
    `${API_BASE}/${conversationId}/messages?fields=id,created_time,from,message,attachments{id,mime_type,name,size,file_url,image_data},sticker&limit=100&access_token=${encodeURIComponent(pageToken)}`
  );
  const msgs = (res.data || []).reverse();
  msgs.forEach(msg => {
    if (msg.sticker) {
      msg.is_sticker = true;
      if (msg.attachments?.data) {
        msg.attachments.data.forEach(a => { a.is_sticker = true; });
      }
    }
  });
  return msgs;
}

// Send Messenger message
export async function sendMessengerMessage(psid, messageText, pageToken, file = null) {
  if (!psid || !pageToken) throw new Error('Thiếu thông tin người nhận hoặc token');

  if (file) {
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
  }

  return safeFetch(`${API_BASE}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      messaging_type: 'RESPONSE',
      message: { text: messageText }
    })
  });
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

// Fetch custom labels from Facebook Page along with users that have them (silent fallback)
export async function fetchPageLabelsWithUsers(pageId, pageToken) {
  if (!pageId || !pageToken) return { labels: [], userLabelsMap: {} };
  try {
    const res = await safeFetch(
      `${API_BASE}/${pageId}/custom_labels?fields=id,name,page_label_name,users&limit=50&access_token=${encodeURIComponent(pageToken)}`
    );
    const labels = [];
    const userLabelsMap = {};

    (res.data || []).forEach(l => {
      const name = l.name || l.page_label_name || 'Nhãn';
      const labelObj = {
        id: l.id,
        name: name,
        emoji: getEmojiForLabel(name),
        color: getColorForLabel(name)
      };
      labels.push(labelObj);

      const users = l.users?.data || [];
      users.forEach(u => {
        if (!userLabelsMap[u.id]) userLabelsMap[u.id] = [];
        userLabelsMap[u.id].push(labelObj);
      });
    });

    return { labels, userLabelsMap };
  } catch {
    return { labels: [], userLabelsMap: {} };
  }
}

// Fetch custom labels from Facebook Page
export async function fetchPageLabels(pageId, pageToken) {
  const result = await fetchPageLabelsWithUsers(pageId, pageToken);
  return result.labels;
}

// Create new custom label on Facebook Page
export async function createPageLabel(pageId, pageToken, labelName) {
  if (!pageId || !pageToken || !labelName) return null;
  try {
    const res = await safeFetch(
      `${API_BASE}/${pageId}/custom_labels?name=${encodeURIComponent(labelName)}&access_token=${encodeURIComponent(pageToken)}`,
      { method: 'POST' }
    );
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
    await safeFetch(
      `${API_BASE}/${labelId}/users?user=${encodeURIComponent(userPsid)}&access_token=${encodeURIComponent(pageToken)}`,
      { method: 'POST' }
    );
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
    await safeFetch(
      `${API_BASE}/${labelId}/users?user=${encodeURIComponent(userPsid)}&access_token=${encodeURIComponent(pageToken)}`,
      { method: 'DELETE' }
    );
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
    let targetLabelId = label.id;

    // If ID is not a real Facebook numeric ID (e.g. meta_ordered), look up or create on FB Page
    if (!targetLabelId || targetLabelId.startsWith('meta_') || isNaN(Number(targetLabelId))) {
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
    if (targetLabelId && userPsid && !targetLabelId.startsWith('meta_')) {
      await assignLabelToUser(targetLabelId, userPsid, pageToken);
    }

    return { ...label, id: targetLabelId || label.id };
  } catch (e) {
    console.warn('syncAssignPageLabel error:', e.message);
    return label;
  }
}

// Smart helper: Unassign label from customer (PSID) on Facebook Page
export async function syncUnassignPageLabel(pageId, pageToken, labelIdOrName, userPsid) {
  if (!pageId || !pageToken || !userPsid) return;
  try {
    let targetLabelId = labelIdOrName;
    if (typeof labelIdOrName === 'string' && (labelIdOrName.startsWith('meta_') || isNaN(Number(labelIdOrName)))) {
      const existingLabels = await fetchPageLabels(pageId, pageToken);
      const match = existingLabels.find(l => l.id === labelIdOrName || l.name.toLowerCase().trim() === labelIdOrName.toLowerCase().trim());
      if (match) targetLabelId = match.id;
    }
    if (targetLabelId && !String(targetLabelId).startsWith('meta_')) {
      await unassignLabelFromUser(targetLabelId, userPsid, pageToken);
    }
  } catch (e) {
    console.warn('syncUnassignPageLabel error:', e.message);
  }
}

// Post to a single Facebook Page (supports text, link, 1 photo, multi-photo album, video, scheduling, anti-spam)
export async function publishToFacebookPage(page, {
  postType = 'photo',
  postText = '',
  postLink = '',
  mediaFiles = [],
  isScheduled = false,
  scheduleTimestamp = null,
  smartAntiSpam = true,
  pageIndex = 0,
  totalPages = 1
}) {
  const pageToken = page.access_token;
  if (!pageToken) {
    throw new Error('Thiếu Page Access Token (Quyền quản trị trang)');
  }

  const finalMessage = smartAntiSpam
    ? generateSmartAntiSpam(postText, pageIndex, totalPages)
    : postText;

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

    return await safeFetch(url, { method: 'POST', body: formData });
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

    return await safeFetch(url, { method: 'POST', body: formData });
  }

  // 3. Multi-Photo Post (Upload unreleased photos first, then attach to feed)
  if (postType === 'photo' && mediaFiles.length > 1) {
    const mediaFbidArray = [];

    for (let p = 0; p < mediaFiles.length; p++) {
      const uploadUrl = `${API_BASE}/${page.id}/photos`;
      const photoForm = new FormData();
      photoForm.append('source', mediaFiles[p]);
      photoForm.append('published', 'false');
      photoForm.append('access_token', pageToken);

      const photoJson = await safeFetch(uploadUrl, { method: 'POST', body: photoForm });
      mediaFbidArray.push({ media_fbid: photoJson.id });
    }

    // Create multi-photo feed post
    const feedUrl = `${API_BASE}/${page.id}/feed`;
    const feedForm = new FormData();
    feedForm.append('message', finalMessage);
    feedForm.append('attached_media', JSON.stringify(mediaFbidArray));
    feedForm.append('access_token', pageToken);

    if (isScheduled && scheduleTimestamp) {
      feedForm.append('published', 'false');
      feedForm.append('scheduled_publish_time', scheduleTimestamp);
    }

    return await safeFetch(feedUrl, { method: 'POST', body: feedForm });
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

    return await safeFetch(url, { method: 'POST', body: formData }, 120000); // 120s timeout for video
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

// Exchange short-lived token for long-lived permanent token (via Vercel Serverless /api/meta/exchange-token)
export async function exchangePermanentToken(shortToken, customAppId = '', customAppSecret = '') {
  const cleanShort = cleanFacebookToken(shortToken);
  if (!cleanShort) {
    throw new Error('Vui lòng nhập Token ngắn hạn (bắt đầu bằng EAA...)');
  }

  // Attempt serverless endpoint first (keeps App Secret safe on server)
  try {
    const res = await fetch('/api/meta/exchange-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shortToken: cleanShort,
        appId: customAppId,
        appSecret: customAppSecret
      })
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      return data.access_token;
    }
    if (data.error && !customAppId) {
      throw new Error(data.error);
    }
  } catch (e) {
    if (!customAppId || !customAppSecret) throw e;
  }

  // Direct Graph API fallback if custom credentials provided
  const exchangeUrl = `${API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(customAppId)}&client_secret=${encodeURIComponent(customAppSecret)}&fb_exchange_token=${encodeURIComponent(cleanShort)}`;
  const directRes = await safeFetch(exchangeUrl);
  return directRes.access_token;
}

// Fetch assigned custom labels for a specific customer (PSID)
export async function fetchUserLabels(userPsid, pageToken) {
  if (!userPsid || !pageToken) return [];
  try {
    const res = await safeFetch(
      `${API_BASE}/${userPsid}/custom_labels?fields=id,name,page_label_name&access_token=${encodeURIComponent(pageToken)}`
    );
    return (res.data || []).map(l => ({
      id: l.id,
      name: l.name || l.page_label_name,
      emoji: '🏷️',
      color: '#3b82f6'
    }));
  } catch (e) {
    return [];
  }
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
    const res = await fetch(
      `${API_BASE}/me/adaccounts?fields=id,name,account_id,account_status,currency,amount_spent,balance,spend_cap&limit=50&access_token=${clean}`
    );
    const data = await res.json();
    if (data.error) {
      console.warn('Fetch ad accounts error:', data.error);
      return { error: data.error };
    }
    return data.data || [];
  } catch (err) {
    console.error('fetchAdAccounts network error:', err);
    return { error: { message: err.message } };
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
    const res = await fetch(
      `${API_BASE}/${adAccountId}/insights?fields=spend,impressions,clicks,cpc,cpm,ctr,reach,actions,cost_per_action_type&date_preset=${datePreset}&access_token=${clean}`
    );
    const data = await res.json();
    if (data.error) return { error: data.error };
    
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
    console.error('fetchAdAccountInsights error:', err);
    return { error: { message: err.message } };
  }
}

/**
 * Fetch Campaigns with their Insights for specific date preset
 */
export async function fetchCampaignsWithInsights(adAccountId, token, datePreset = 'today') {
  const clean = cleanFacebookToken(token);
  if (!clean || !adAccountId) return [];
  try {
    const fields = `id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(${datePreset}){spend,impressions,clicks,cpc,cpm,ctr,reach,actions,cost_per_action_type}`;
    const res = await fetch(
      `${API_BASE}/${adAccountId}/campaigns?fields=${fields}&limit=50&access_token=${clean}`
    );
    const data = await res.json();
    if (data.error) return { error: data.error };

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
        daily_budget: camp.daily_budget ? parseInt(camp.daily_budget, 10) / 100 : null, // FB returns in cents / hundredths
        lifetime_budget: camp.lifetime_budget ? parseInt(camp.lifetime_budget, 10) / 100 : null,
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
    console.error('fetchCampaignsWithInsights error:', err);
    return { error: { message: err.message } };
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

  const res = await fetch(`${API_BASE}/${campaignId}`, {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Lỗi cập nhật chiến dịch');
  return data;
}

/**
 * Update Campaign Daily Budget
 */
export async function updateCampaignBudget(campaignId, dailyBudgetVnd, token) {
  const clean = cleanFacebookToken(token);
  if (!clean || !campaignId) throw new Error('Missing token or campaign ID');

  const formData = new URLSearchParams();
  // Facebook API expects budget in cents / smallest currency unit (for VND, 1 VND = 100 hundredths)
  formData.append('daily_budget', Math.round(dailyBudgetVnd * 100));
  formData.append('access_token', clean);

  const res = await fetch(`${API_BASE}/${campaignId}`, {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Lỗi cập nhật ngân sách');
  return data;
}

