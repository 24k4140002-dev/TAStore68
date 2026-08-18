import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import ConversationSidebar from './ConversationSidebar';
import ChatThread from './ChatThread';
import CustomerProfilePanel from './CustomerProfilePanel';
import UnreadBanner from './UnreadBanner';
import { triggerNewMessageNotification } from '../../services/notificationService';

const SharedMediaModal = lazy(() => import('./SharedMediaModal'));
const OrderCreateModal = lazy(() => import('./OrderCreateModal'));
const LabelsManagerModal = lazy(() => import('./LabelsManagerModal'));
const QuickRepliesModal = lazy(() => import('./QuickRepliesModal'));
const VietQRModal = lazy(() => import('./VietQRModal'));
const AutoRulesModal = lazy(() => import('./AutoRulesModal'));
const PageManagerModal = lazy(() => import('./PageManagerModal'));
import {
  fetchPages,
  fetchPageConversations,
  fetchConversationMessages,
  markConversationAsRead,
  sendMessengerMessage,
  sendCommentReply,
  sendPrivateReply,
  fetchAllPagesUnreadSummary,
  fetchPageLabels,
  fetchPageLabelsWithUsers,
  createPageLabel,
  assignLabelToUser,
  unassignLabelFromUser,
  fetchUserLabels,
  syncAssignPageLabel,
  syncUnassignPageLabel,
  runInChunks,
  DEFAULT_QUICK_REPLIES
} from '../../services/facebookApi';

// Default Meta Business Suite standard labels
const DEFAULT_META_LABELS = [
  { id: 'meta_lead', name: 'Tiềm năng', emoji: '⭐', color: '#f59e0b' },
  { id: 'meta_ordered', name: 'Đã chốt đơn', emoji: '✅', color: '#10b981' },
  { id: 'meta_consulting', name: 'Đang tư vấn', emoji: '💬', color: '#3b82f6' },
  { id: 'meta_followup', name: 'Cần follow-up', emoji: '📞', color: '#8b5cf6' },
  { id: 'meta_vip', name: 'Khách VIP', emoji: '👑', color: '#ec4899' },
  { id: 'meta_processing', name: 'Đang xử lý', emoji: '⚙️', color: '#ea580c' },
  { id: 'meta_cancelled', name: 'Đã hủy đơn', emoji: '❌', color: '#ef4444' }
];

// Helper: get read conversation map from localStorage
function getReadMap() {
  try {
    return JSON.parse(localStorage.getItem('metapost_read_map') || '{}');
  } catch { return {}; }
}
function saveReadMap(map) {
  localStorage.setItem('metapost_read_map', JSON.stringify(map));
}

export default function CRMInbox({ fbToken, onOpenTokenModal, activeTab, onSwitchTab }) {
  const [pages, setPages] = useState(() => JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]'));
  const [visiblePageIds, setVisiblePageIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('metapost_visible_page_ids') || '[]');
    } catch {
      return [];
    }
  });
  const [selectedPageId, setSelectedPageId] = useState(() => localStorage.getItem('metapost_selected_page_id') || 'all');
  const [conversations, setConversations] = useState(() => {
    const savedPageId = localStorage.getItem('metapost_selected_page_id') || 'all';
    try {
      const perPage = JSON.parse(localStorage.getItem(`metapost_inbox_cache_${savedPageId}`) || 'null');
      if (perPage && perPage.length > 0) return perPage;
      return JSON.parse(localStorage.getItem('metapost_inbox_cache') || '[]');
    } catch {
      return [];
    }
  });
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesNextCursor, setMessagesNextCursor] = useState(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // Computed active pages (filtered by user selection, e.g. 3-5 stores)
  const activePages = visiblePageIds.length > 0
    ? pages.filter(p => visiblePageIds.includes(p.id))
    : pages;

  // Mobile state: 'list' (shows sidebar) | 'chat' (shows thread)
  const [mobileView, setMobileView] = useState('list');
  const [isProfilePanelOpenOnMobile, setIsProfilePanelOpenOnMobile] = useState(false);

  // Filters
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState(null);

  // CRM Data
  const [allLabels, setAllLabels] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerCRMData, setCustomerCRMData] = useState(null);
  const [quickReplies, setQuickReplies] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('metapost_quick_replies') || 'null') || DEFAULT_QUICK_REPLIES;
    } catch {
      return DEFAULT_QUICK_REPLIES;
    }
  });

  // Unread Dashboard
  const [unreadSummary, setUnreadSummary] = useState(null);
  const [isUnreadScanning, setIsUnreadScanning] = useState(false);

  // Modals
  const [activeMediaModal, setActiveMediaModal] = useState(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isLabelsManagerOpen, setIsLabelsManagerOpen] = useState(false);
  const [isQuickRepliesOpen, setIsQuickRepliesOpen] = useState(false);
  const [isVietQROpen, setIsVietQROpen] = useState(false);
  const [isAutoRulesOpen, setIsAutoRulesOpen] = useState(false);
  const [isPageManagerOpen, setIsPageManagerOpen] = useState(false);
  const knownMessagesMapRef = useRef({});

  // 1. Load Meta & Page Labels (from localStorage & defaults)
  const loadLabelsAndTags = () => {
    try {
      const savedLabels = JSON.parse(localStorage.getItem('metapost_all_labels') || '[]');
      if (savedLabels && savedLabels.length > 0) {
        setAllLabels(savedLabels);
      } else {
        setAllLabels(DEFAULT_META_LABELS);
        localStorage.setItem('metapost_all_labels', JSON.stringify(DEFAULT_META_LABELS));
      }
    } catch {
      setAllLabels(DEFAULT_META_LABELS);
    }
  };

  // 2. Fetch Facebook Pages (Cache-first: always read from localStorage immediately, never call /me/accounts on mount)
  const loadPages = useCallback(async (forceRefresh = false) => {
    if (!fbToken) return [];
    try {
      const cached = JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]');
      if (!forceRefresh && cached && cached.length > 0) {
        setPages(cached);
        return cached;
      }
      const fetchedPages = await fetchPages(fbToken);
      if (fetchedPages.length > 0) {
        setPages(fetchedPages);
        localStorage.setItem('metapost_pages_cache', JSON.stringify(fetchedPages));
        return fetchedPages;
      }
    } catch {
      const cached = JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]');
      if (cached && cached.length > 0) {
        setPages(cached);
        return cached;
      }
    }
    return [];
  }, [fbToken]);

  const [pageCursors, setPageCursors] = useState({});
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 3. Fetch All Conversations in Parallel (Throttled to avoid Rate Limit #4, supports Silent Background Sync)
  const loadAllConversations = useCallback(async (currentPages = pages, silent = false) => {
    if (!fbToken || currentPages.length === 0) return;
    if (!silent) setIsLoadingConversations(true);

    try {
      const storedPageId = localStorage.getItem('metapost_selected_page_id') || selectedPageId;
      const targetPages = storedPageId === 'all'
        ? currentPages
        : currentPages.filter(p => p.id === storedPageId);

      // Fetch conversations in throttled batches (2 pages per batch, 200ms delay) to prevent Facebook Rate Limit #4
      const results = await runInChunks(
        targetPages,
        page => fetchPageConversations(page.id, page.name, page.access_token || fbToken),
        2,
        200
      );

      const combined = [];
      const newCursors = {};
      let anyHasMore = false;

      results.forEach(res => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          combined.push(...res.value);
          if (res.value.length > 0 && res.value[0]?.page_id) {
            newCursors[res.value[0].page_id] = res.value.nextCursor || null;
            if (res.value.hasMore) anyHasMore = true;
          }
        }
      });

      setPageCursors(newCursors);
      setHasMoreOlder(anyHasMore);

      // Apply read tracking, new message notification, and persistent labels
      const currentReadMap = getReadMap();
      combined.forEach(c => {
        // Read tracking
        const readUntil = currentReadMap[c.fb_conversation_id];
        if (readUntil && c.last_message_at) {
          if (new Date(c.last_message_at).getTime() <= new Date(readUntil).getTime()) {
            c.unread_count = 0;
          }
        }

        // New Message Audio & Lock Screen Notification Trigger
        const prevSnippet = knownMessagesMapRef.current[c.fb_conversation_id];
        if (prevSnippet !== undefined && prevSnippet !== c.snippet && c.unread_count > 0) {
          triggerNewMessageNotification({
            pageId: c.page_id,
            pageName: c.page_name,
            convId: c.fb_conversation_id,
            customerName: c.customer_name,
            messageText: c.snippet,
            avatarUrl: c.avatar_url,
            playSound: true
          });
        }
        knownMessagesMapRef.current[c.fb_conversation_id] = c.snippet;

        // Persistent Customer Labels from localStorage
        const savedLabels = JSON.parse(
          localStorage.getItem(`metapost_labels_${c.fb_conversation_id}`) ||
          (c.customer_psid ? localStorage.getItem(`metapost_labels_${c.customer_psid}`) : null) ||
          '[]'
        );

        if (savedLabels && savedLabels.length > 0) {
          c.labels = savedLabels;
        }
      });

      setConversations(combined);
      localStorage.setItem('metapost_inbox_cache', JSON.stringify(combined));
      localStorage.setItem(`metapost_inbox_cache_${storedPageId}`, JSON.stringify(combined));

      // Restore active conversation from localStorage on load/F5 (ONLY for Desktop 2-pane view, NEVER auto-open on mobile)
      const isDesktop = window.innerWidth >= 768;
      if (isDesktop) {
        const savedActiveId = localStorage.getItem('metapost_active_conv_id');
        if (savedActiveId) {
          const matched = combined.find(c => c.fb_conversation_id === savedActiveId);
          if (matched) {
            handleSelectConversation(matched, false);
          } else if (combined.length > 0) {
            handleSelectConversation(combined[0], false);
          }
        } else if (!activeConversation && combined.length > 0) {
          handleSelectConversation(combined[0], false);
        }
      }
    } catch (err) {
      console.error('Fetch all conversations error:', err);
    } finally {
      if (!silent) setIsLoadingConversations(false);
    }
  }, [fbToken, pages, selectedPageId, activeConversation]);

  // Load More / Older Conversations
  const handleLoadMoreConversations = async () => {
    if (isLoadingMore || !fbToken) return;
    setIsLoadingMore(true);

    try {
      const storedPageId = localStorage.getItem('metapost_selected_page_id') || selectedPageId;
      const targetPages = storedPageId === 'all'
        ? (activePages.length > 0 ? activePages : pages)
        : (activePages.length > 0 ? activePages : pages).filter(p => p.id === storedPageId);

      const nextResults = await runInChunks(
        targetPages,
        page => fetchPageConversations(page.id, page.name, page.access_token || fbToken, pageCursors[page.id]),
        2,
        200
      );

      const olderConvs = [];
      const updatedCursors = { ...pageCursors };
      let anyHasMore = false;

      nextResults.forEach(res => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          olderConvs.push(...res.value);
          if (res.value.length > 0 && res.value[0]?.page_id) {
            updatedCursors[res.value[0].page_id] = res.value.nextCursor || null;
            if (res.value.hasMore) anyHasMore = true;
          }
        }
      });

      setPageCursors(updatedCursors);
      setHasMoreOlder(anyHasMore);

      if (olderConvs.length > 0) {
        setConversations(prev => {
          const existingIds = new Set(prev.map(c => c.fb_conversation_id));
          const freshOlder = olderConvs.filter(c => !existingIds.has(c.fb_conversation_id));
          const merged = [...prev, ...freshOlder];
          localStorage.setItem('metapost_inbox_cache', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.warn('Load more conversations error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 4. Select Conversation & Load Messages
// Helper: Gentle audio chime on new message from customer
function playChimeSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

  // 4. Select Conversation with Instant SWR Cache
  const handleSelectConversation = async (conv, shouldSwitchMobileView = true) => {
    // Merge persistent labels before setting active conversation
    const savedLabels = JSON.parse(
      localStorage.getItem(`metapost_labels_${conv.fb_conversation_id}`) ||
      (conv.customer_psid ? localStorage.getItem(`metapost_labels_${conv.customer_psid}`) : null) ||
      'null'
    );
    const convWithLabels = {
      ...conv,
      labels: (savedLabels && savedLabels.length > 0) ? savedLabels : (conv.labels || [])
    };

    setActiveConversation(convWithLabels);
    localStorage.setItem('metapost_active_conv_id', conv.fb_conversation_id);
    if (shouldSwitchMobileView) {
      setMobileView('chat'); // Switch view on mobile to chat ONLY on explicit tap
    }

    // ⚡ INSTANT SWR CACHE: Render previously cached messages in 0.001s
    try {
      const cachedMsgs = JSON.parse(
        localStorage.getItem(`metapost_msgs_${conv.fb_conversation_id}`) ||
        sessionStorage.getItem(`metapost_msgs_${conv.fb_conversation_id}`) ||
        '[]'
      );
      if (cachedMsgs.length > 0) {
        setMessages(cachedMsgs);
        setIsLoadingMessages(false);
      } else {
        setIsLoadingMessages(true);
      }
    } catch {
      setIsLoadingMessages(true);
    }

    // Mark this conversation as read with current timestamp
    const nowIso = new Date().toISOString();
    const currentReadMap = getReadMap();
    currentReadMap[conv.fb_conversation_id] = nowIso;
    saveReadMap(currentReadMap);

    // Update the conversation's unread_count in state
    setConversations(prev => prev.map(c =>
      c.fb_conversation_id === conv.fb_conversation_id ? { ...c, unread_count: 0 } : c
    ));
    // Update the unread summary
    if (unreadSummary) {
      const pageOfConv = conv.page_id;
      setUnreadSummary(prev => {
        if (!prev) return prev;
        const updatedPerPage = prev.perPage.map(p =>
          p.pageId === pageOfConv ? { ...p, unreadCount: Math.max(0, p.unreadCount - (conv.unread_count > 0 ? 1 : 0)) } : p
        );
        return { total: updatedPerPage.reduce((s, p) => s + p.unreadCount, 0), perPage: updatedPerPage };
      });
    }

    try {
      // Sync read status with Facebook Meta Business Suite (non-blocking)
      markConversationAsRead(conv.fb_conversation_id, conv.page_token || fbToken);

      const msgs = await fetchConversationMessages(conv.fb_conversation_id, conv.page_token || fbToken, null, 80);
      if (Array.isArray(msgs) && msgs.length > 0) {
        setMessages(msgs);
        setMessagesNextCursor(msgs.nextCursor || null);
        setHasMoreMessages(!!msgs.hasMore);
        localStorage.setItem(`metapost_msgs_${conv.fb_conversation_id}`, JSON.stringify(msgs));
        sessionStorage.setItem(`metapost_msgs_${conv.fb_conversation_id}`, JSON.stringify(msgs));
      } else {
        setHasMoreMessages(false);
      }
      setIsLoadingMessages(false);

      // Background sync with Facebook custom labels if PSID exists
      if (conv.customer_psid) {
        fetchUserLabels(conv.customer_psid, conv.page_token || fbToken).then(fbLabels => {
          if (fbLabels && fbLabels.length > 0) {
            const currentCached = JSON.parse(
              localStorage.getItem(`metapost_labels_${conv.fb_conversation_id}`) || '[]'
            );
            const merged = [...currentCached];
            const existingKeys = new Set(merged.map(m => (m.name || '').toLowerCase()));
            fbLabels.forEach(fl => {
              if (!existingKeys.has((fl.name || '').toLowerCase())) {
                merged.push(fl);
              }
            });
            localStorage.setItem(`metapost_labels_${conv.fb_conversation_id}`, JSON.stringify(merged));
            if (conv.customer_psid) {
              localStorage.setItem(`metapost_labels_${conv.customer_psid}`, JSON.stringify(merged));
            }
            setActiveConversation(prev => prev?.fb_conversation_id === conv.fb_conversation_id ? { ...prev, labels: merged } : prev);
            setConversations(prev => prev.map(c => c.fb_conversation_id === conv.fb_conversation_id ? { ...c, labels: merged } : c));
          }
        });
      }

      // Load customer orders from localStorage
      if (conv.customer_psid) {
        const savedOrders = JSON.parse(localStorage.getItem(`orders_${conv.customer_psid}`) || '[]');
        setCustomerOrders(savedOrders);
      } else {
        setCustomerOrders([]);
      }

      // Load customer CRM data (phone, email, notes) from localStorage
      if (conv.customer_psid) {
        const savedCust = JSON.parse(localStorage.getItem(`metapost_cust_${conv.customer_psid}`) || '{}');
        const savedNotes = JSON.parse(localStorage.getItem(`metapost_notes_${conv.customer_psid}`) || '[]');
        setCustomerCRMData({
          phone: savedCust.phone || '',
          email: savedCust.email || '',
          notes: savedNotes
        });
      } else {
        setCustomerCRMData({ phone: '', email: '', notes: [] });
      }
    } catch (err) {
      console.error('Load messages error:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Load older messages (Yesterday, last week, etc.)
  const handleLoadOlderMessages = async () => {
    if (!activeConversation?.fb_conversation_id || isLoadingOlderMessages) return;
    setIsLoadingOlderMessages(true);
    try {
      const olderMsgs = await fetchConversationMessages(
        activeConversation.fb_conversation_id,
        activeConversation.page_token || fbToken,
        messagesNextCursor,
        50
      );
      if (Array.isArray(olderMsgs) && olderMsgs.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newOlder = olderMsgs.filter(m => !existingIds.has(m.id));
          const merged = [...newOlder, ...prev];
          localStorage.setItem(`metapost_msgs_${activeConversation.fb_conversation_id}`, JSON.stringify(merged));
          return merged;
        });
        setMessagesNextCursor(olderMsgs.nextCursor || null);
        setHasMoreMessages(!!olderMsgs.hasMore);
      } else {
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.warn('Load older messages error:', err);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  };

  // 5. Real-time Active Thread Polling (Sync new messages in 3-4s without page reload)
  useEffect(() => {
    if (!activeConversation?.fb_conversation_id || !fbToken) return;

    const pageId = activeConversation.page_id;
    const token = activeConversation.page_token || fbToken;

    const pollTimer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const latestMsgs = await fetchConversationMessages(convId, token);
        if (latestMsgs && latestMsgs.length > 0) {
          setMessages(prev => {
            const prevIds = new Set(prev.map(m => m.id));
            const hasNew = latestMsgs.some(m => !prevIds.has(m.id));
            if (hasNew) {
              // Check if newest message came from customer (not page)
              const lastMsg = latestMsgs[latestMsgs.length - 1];
              if (lastMsg?.from?.id && lastMsg.from.id !== pageId) {
                playChimeSound();
              }
              sessionStorage.setItem(`metapost_msgs_${convId}`, JSON.stringify(latestMsgs));
              return latestMsgs;
            }
            return prev;
          });
        }
      } catch (e) {}
    }, 4000);

    return () => clearInterval(pollTimer);
  }, [activeConversation?.fb_conversation_id, activeConversation?.page_id, activeConversation?.page_token, fbToken]);

  // 6. Send Message Handler with Optimistic UI
  const handleSendMessage = async ({ text, file, mode }) => {
    if (!activeConversation) return;
    const token = activeConversation.page_token || fbToken;

    // ⚡ Optimistic UI: Display message instantly
    if (text) {
      const tempId = 'temp_' + Date.now();
      const optimisticMsg = {
        id: tempId,
        message: text,
        created_time: new Date().toISOString(),
        from: { id: activeConversation.page_id, name: activeConversation.page_name },
        sending: true
      };
      setMessages(prev => [...prev, optimisticMsg]);
    }

    try {
      if (mode === 'messenger' && activeConversation.customer_psid) {
        await sendMessengerMessage(activeConversation.customer_psid, text, token, file);
      } else if (mode === 'public_comment' && activeConversation.id) {
        await sendCommentReply(activeConversation.id, text, token);
      } else if (mode === 'private_reply' && activeConversation.id) {
        await sendPrivateReply(activeConversation.id, text, token);
      }

      // Refresh messages
      const msgs = await fetchConversationMessages(activeConversation.fb_conversation_id, token);
      setMessages(msgs);
      sessionStorage.setItem(`metapost_msgs_${activeConversation.fb_conversation_id}`, JSON.stringify(msgs));
    } catch (err) {
      console.error('Send error:', err);
      // Remove temp message if failed
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp_')));
      throw err;
    }
  };

  // 6. Update Status
  const handleUpdateStatus = async (fbConvId, newStatus) => {
    setConversations(prev => prev.map(c => {
      if (c.fb_conversation_id === fbConvId) {
        return { ...c, status: newStatus, unread_count: (newStatus === 'done' ? 0 : c.unread_count) };
      }
      return c;
    }));

    if (activeConversation?.fb_conversation_id === fbConvId) {
      setActiveConversation(prev => ({ ...prev, status: newStatus }));
    }

    try {
      await supabase.from('conversations').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('fb_conversation_id', fbConvId);
    } catch (e) {}
  };

  // 7. Toggle Star
  const handleToggleStar = async (fbConvId) => {
    let nextStarred = false;
    setConversations(prev => prev.map(c => {
      if (c.fb_conversation_id === fbConvId) {
        nextStarred = !c.is_starred;
        return { ...c, is_starred: nextStarred };
      }
      return c;
    }));

    if (activeConversation?.fb_conversation_id === fbConvId) {
      setActiveConversation(prev => ({ ...prev, is_starred: nextStarred }));
    }

    try {
      await supabase.from('conversations').update({ is_starred: nextStarred }).eq('fb_conversation_id', fbConvId);
    } catch (e) {}
  };

  // 8. Toggle Unread
  const handleToggleUnread = async (fbConvId) => {
    const currentReadMap = getReadMap();
    setConversations(prev => prev.map(c => {
      if (c.fb_conversation_id === fbConvId) {
        const nextUnread = c.unread_count > 0 ? 0 : 1;
        if (nextUnread === 0) {
          currentReadMap[fbConvId] = new Date().toISOString();
        } else {
          delete currentReadMap[fbConvId];
        }
        return { ...c, unread_count: nextUnread };
      }
      return c;
    }));
    saveReadMap(currentReadMap);
  };

  // 9. Add / Remove Persistent Label (Syncs with LocalStorage & Meta Graph API)
  const handleAddLabel = async (label) => {
    if (!activeConversation) return;
    const currentLabels = activeConversation.labels || [];
    if (currentLabels.some(l => l.id === label.id || l.name?.toLowerCase() === label.name?.toLowerCase())) return;

    const newLabels = [...currentLabels, label];
    setActiveConversation(prev => ({ ...prev, labels: newLabels }));
    setConversations(prev => prev.map(c => c.fb_conversation_id === activeConversation.fb_conversation_id ? { ...c, labels: newLabels } : c));

    // Save to localStorage by BOTH conversation ID and customer PSID
    localStorage.setItem(`metapost_labels_${activeConversation.fb_conversation_id}`, JSON.stringify(newLabels));
    if (activeConversation.customer_psid) {
      localStorage.setItem(`metapost_labels_${activeConversation.customer_psid}`, JSON.stringify(newLabels));
    }

    // Call smart Meta Facebook Graph API sync
    syncAssignPageLabel(
      activeConversation.page_id,
      activeConversation.page_token || fbToken,
      label,
      activeConversation.customer_psid
    ).then(syncedLabel => {
      if (syncedLabel?.id && syncedLabel.id !== label.id) {
        const updated = newLabels.map(l => l.name === label.name ? syncedLabel : l);
        localStorage.setItem(`metapost_labels_${activeConversation.fb_conversation_id}`, JSON.stringify(updated));
        if (activeConversation.customer_psid) {
          localStorage.setItem(`metapost_labels_${activeConversation.customer_psid}`, JSON.stringify(updated));
        }
        setActiveConversation(prev => prev ? { ...prev, labels: updated } : prev);
      }
    });
  };

  const handleRemoveLabel = (labelId) => {
    if (!activeConversation) return;
    const newLabels = (activeConversation.labels || []).filter(l => l.id !== labelId && l.name !== labelId);
    setActiveConversation(prev => ({ ...prev, labels: newLabels }));
    setConversations(prev => prev.map(c => c.fb_conversation_id === activeConversation.fb_conversation_id ? { ...c, labels: newLabels } : c));

    // Save to localStorage
    localStorage.setItem(`metapost_labels_${activeConversation.fb_conversation_id}`, JSON.stringify(newLabels));
    if (activeConversation.customer_psid) {
      localStorage.setItem(`metapost_labels_${activeConversation.customer_psid}`, JSON.stringify(newLabels));
    }

    // Call Meta Facebook Graph API unassign
    syncUnassignPageLabel(
      activeConversation.page_id,
      activeConversation.page_token || fbToken,
      labelId,
      activeConversation.customer_psid
    );
  };

  // 10. Notes
  const handleAddNote = async (text) => {
    if (!activeConversation?.customer_psid) return;
    const newNote = { id: 'note_' + Date.now(), note_text: text, created_at: new Date().toISOString() };
    setCustomerCRMData(prev => {
      const updatedNotes = [newNote, ...(prev?.notes || [])];
      localStorage.setItem(`metapost_notes_${activeConversation.customer_psid}`, JSON.stringify(updatedNotes));
      return {
        ...prev,
        notes: updatedNotes
      };
    });
  };

  const handleDeleteNote = (noteId) => {
    if (!activeConversation?.customer_psid) return;
    setCustomerCRMData(prev => {
      const updatedNotes = (prev?.notes || []).filter(n => n.id !== noteId);
      localStorage.setItem(`metapost_notes_${activeConversation.customer_psid}`, JSON.stringify(updatedNotes));
      return {
        ...prev,
        notes: updatedNotes
      };
    });
  };

  // 11. Orders
  const handleOrderCreated = (order) => {
    const updated = [order, ...customerOrders];
    setCustomerOrders(updated);
    if (activeConversation?.customer_psid) {
      localStorage.setItem(`orders_${activeConversation.customer_psid}`, JSON.stringify(updated));
    }
  };

  // Scan unread across ALL pages (independent of selected page)
  const scanAllUnread = useCallback(async (allPages) => {
    if (!fbToken || !allPages || allPages.length === 0) return;
    setIsUnreadScanning(true);
    try {
      const summary = await fetchAllPagesUnreadSummary(allPages, fbToken);
      setUnreadSummary(summary);
    } catch (e) {
      console.warn('Unread scan error:', e.message);
    } finally {
      setIsUnreadScanning(false);
    }
  }, [fbToken]);

  // Handle clicking a page in the unread banner
  const handleUnreadPageClick = (pageId) => {
    if (pageId === 'all') {
      setSelectedPageId('all');
      localStorage.setItem('metapost_selected_page_id', 'all');
    } else {
      setSelectedPageId(pageId);
      localStorage.setItem('metapost_selected_page_id', pageId);
    }
    setStatusFilter('unread');
    loadAllConversations();
  };

  // Mark ALL conversations as read
  const handleMarkAllAsRead = () => {
    const nowIso = new Date().toISOString();
    const currentReadMap = getReadMap();
    conversations.forEach(c => {
      currentReadMap[c.fb_conversation_id] = nowIso;
    });
    saveReadMap(currentReadMap);

    // Reset all unread_count to 0
    setConversations(prev => prev.map(c => ({ ...c, unread_count: 0 })));

    // Reset unread summary
    setUnreadSummary(prev => {
      if (!prev) return prev;
      return {
        total: 0,
        perPage: prev.perPage.map(p => ({ ...p, unreadCount: 0 }))
      };
    });
  };

  // Initial Boot
  useEffect(() => {
    loadLabelsAndTags();
    loadPages(false).then(loadedPages => {
      const pagesToUse = loadedPages && loadedPages.length > 0 ? loadedPages : pages;
      if (pagesToUse && pagesToUse.length > 0) {
        const active = visiblePageIds.length > 0
          ? pagesToUse.filter(p => visiblePageIds.includes(p.id))
          : pagesToUse;
        loadAllConversations(active);
      }
    });

    // Fast background polling: check conversations every 15s
    const timer = setInterval(() => {
      if (fbToken) {
        const cachedPages = JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]');
        if (cachedPages.length > 0) {
          const currentVisible = JSON.parse(localStorage.getItem('metapost_visible_page_ids') || '[]');
          const active = currentVisible.length > 0
            ? cachedPages.filter(p => currentVisible.includes(p.id))
            : cachedPages;
          loadAllConversations(active, true);
        }
      }
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  // Real-time Active Conversation Silent Sync (Every 5s)
  useEffect(() => {
    if (!activeConversation?.fb_conversation_id || !fbToken) return;

    const activeTimer = setInterval(async () => {
      try {
        const msgs = await fetchConversationMessages(
          activeConversation.fb_conversation_id,
          activeConversation.page_token || fbToken
        );
        if (Array.isArray(msgs) && msgs.length > 0) {
          setMessages(prev => {
            if (msgs.length > prev.length) {
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg.from?.id !== activeConversation.page_id) {
                triggerNewMessageNotification({
                  pageId: activeConversation.page_id,
                  pageName: activeConversation.page_name,
                  convId: activeConversation.fb_conversation_id,
                  customerName: activeConversation.customer_name,
                  messageText: lastMsg.message,
                  avatarUrl: activeConversation.avatar_url,
                  playSound: true
                });
              }
              localStorage.setItem(`metapost_msgs_${activeConversation.fb_conversation_id}`, JSON.stringify(msgs));
              return msgs;
            }
            return prev;
          });
        }
      } catch {}
    }, 5000);

    return () => clearInterval(activeTimer);
  }, [activeConversation?.fb_conversation_id, activeConversation?.page_token, fbToken]);

  return (
    <div className="flex-1 flex overflow-hidden h-full h-[calc(100dvh-60px)] relative">
      {/* 1. Left Sidebar: Channels & Filtered Conversations (hidden on mobile if chat is open) */}
      <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
        {/* Global Unread Dashboard Banner */}
        <UnreadBanner
          unreadSummary={unreadSummary}
          isScanning={isUnreadScanning}
          onPageClick={handleUnreadPageClick}
          onMarkAllAsRead={handleMarkAllAsRead}
        />
        <ConversationSidebar
          pages={activePages.length > 0 ? activePages : pages}
          allPages={pages}
          visiblePageIds={visiblePageIds}
          onOpenPageManager={() => setIsPageManagerOpen(true)}
          selectedPageId={selectedPageId}
          onSelectPage={(pageId) => {
            setSelectedPageId(pageId);
            localStorage.setItem('metapost_selected_page_id', pageId);
            const targetPages = pageId === 'all'
              ? (activePages.length > 0 ? activePages : pages)
              : pages.filter(p => p.id === pageId);

            // ⚡ Instant SWR Switch: Render cached conversations in 0.001s without spinner
            try {
              const cachedForPage = JSON.parse(localStorage.getItem(`metapost_inbox_cache_${pageId}`) || 'null');
              if (cachedForPage && cachedForPage.length > 0) {
                setConversations(cachedForPage);
                // Background silent sync to pull any fresh messages without freezing screen
                loadAllConversations(targetPages, true);
                return;
              }
            } catch {}

            // If first time loading this page, load with spinner
            loadAllConversations(targetPages, false);
          }}
          conversations={conversations}
          activeConversation={activeConversation}
          onSelectConversation={(conv) => handleSelectConversation(conv, true)}
          channelFilter={channelFilter}
          onChannelFilterChange={setChannelFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedLabelId={selectedLabelId}
          onSelectLabel={setSelectedLabelId}
          allLabels={allLabels}
          onOpenLabelsManager={() => setIsLabelsManagerOpen(true)}
          onRefresh={() => loadAllConversations(activePages.length > 0 ? activePages : pages)}
          isLoading={isLoadingConversations}
          onMarkAllAsRead={handleMarkAllAsRead}
          onOpenTokenModal={onOpenTokenModal}
          onLoadMore={handleLoadMoreConversations}
          isLoadingMore={isLoadingMore}
          hasMore={hasMoreOlder}
          activeTab={activeTab}
          onSwitchTab={onSwitchTab}
        />
      </div>

      {/* 2. Middle: Chat Thread (Fullscreen on Mobile, standard column on Desktop) */}
      <div className={`flex-1 flex flex-col min-w-0 ${mobileView === 'list' ? 'hidden md:flex' : 'fixed inset-0 z-40 bg-white dark:bg-slate-950 flex flex-col md:relative md:inset-auto md:z-auto md:flex'}`}>
        <ChatThread
          conversation={activeConversation}
          messages={messages}
          isLoadingMessages={isLoadingMessages}
          onSendMessage={handleSendMessage}
          onUpdateStatus={handleUpdateStatus}
          onToggleStar={handleToggleStar}
          onToggleUnread={handleToggleUnread}
          onOpenMediaModal={setActiveMediaModal}
          onBackToList={() => {
            setMobileView('list');
            localStorage.removeItem('metapost_active_conv_id');
          }}
          onToggleProfilePanel={() => setIsProfilePanelOpenOnMobile(!isProfilePanelOpenOnMobile)}
          quickReplies={quickReplies}
          onOpenQuickRepliesModal={() => setIsQuickRepliesOpen(true)}
          onOpenVietQRModal={() => setIsVietQROpen(true)}
          onOpenAutoRulesModal={() => setIsAutoRulesOpen(true)}
          onLoadOlderMessages={handleLoadOlderMessages}
          hasMoreOlderMessages={hasMoreMessages}
          isLoadingOlderMessages={isLoadingOlderMessages}
        />
      </div>

      {/* 3. Right: Meta Business CRM Profile Panel (Desktop: side column, Mobile: slide-over drawer) */}
      {activeConversation && (
        <div className={`
          ${isProfilePanelOpenOnMobile ? 'fixed inset-y-0 right-0 z-40 w-80 shadow-2xl flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-right duration-200' : 'hidden xl:flex w-80 lg:w-88 flex-shrink-0 flex-col'}
        `}>
          {isProfilePanelOpenOnMobile && (
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between xl:hidden">
              <span className="font-bold text-sm">Hồ sơ khách hàng</span>
              <button
                onClick={() => setIsProfilePanelOpenOnMobile(false)}
                className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800"
              >
                ✕ Đóng
              </button>
            </div>
          )}
          <CustomerProfilePanel
            conversation={activeConversation}
            messages={messages}
            customerData={customerCRMData}
            orders={customerOrders}
            allLabels={allLabels}
            onAddLabel={handleAddLabel}
            onRemoveLabel={handleRemoveLabel}
            onAddNote={handleAddNote}
            onDeleteNote={handleDeleteNote}
            onOpenCreateOrder={() => setIsOrderModalOpen(true)}
            onOpenMediaModal={setActiveMediaModal}
            onOpenLabelsManager={() => setIsLabelsManagerOpen(true)}
          />
        </div>
      )}

      {/* Backdrop for Mobile Profile Drawer */}
      {isProfilePanelOpenOnMobile && (
        <div
          onClick={() => setIsProfilePanelOpenOnMobile(false)}
          className="fixed inset-0 bg-black/40 z-30 xl:hidden"
        />
      )}

      {/* Modals with Lazy Suspense */}
      <Suspense fallback={null}>
        {activeMediaModal && (
          <SharedMediaModal
            media={activeMediaModal}
            onClose={() => setActiveMediaModal(null)}
          />
        )}

        {isOrderModalOpen && (
          <OrderCreateModal
            conversation={activeConversation}
            customer={activeConversation}
            onClose={() => setIsOrderModalOpen(false)}
            onOrderCreated={handleOrderCreated}
          />
        )}

        {isLabelsManagerOpen && (
          <LabelsManagerModal
            allLabels={allLabels}
            allTags={allTags}
            onLabelsChange={setAllLabels}
            onTagsChange={setAllTags}
            onClose={() => setIsLabelsManagerOpen(false)}
          />
        )}

        {isQuickRepliesOpen && (
          <QuickRepliesModal
            isOpen={isQuickRepliesOpen}
            onClose={() => setIsQuickRepliesOpen(false)}
            quickReplies={quickReplies}
            onSaveQuickReplies={(updated) => {
              setQuickReplies(updated);
              localStorage.setItem('metapost_quick_replies', JSON.stringify(updated));
            }}
          />
        )}

        {isVietQROpen && (
          <VietQRModal
            isOpen={isVietQROpen}
            onClose={() => setIsVietQROpen(false)}
            customerName={activeConversation?.customer_name}
            onSendQR={async ({ file, text }) => {
              if (!activeConversation) return;
              await handleSendMessage({ text, file, mode: 'messenger' });
            }}
          />
        )}

        {isAutoRulesOpen && (
          <AutoRulesModal
            isOpen={isAutoRulesOpen}
            onClose={() => setIsAutoRulesOpen(false)}
          />
        )}

        {isPageManagerOpen && (
          <PageManagerModal
            allPages={pages}
            visiblePageIds={visiblePageIds}
            onSaveVisiblePages={(newIds) => {
              setVisiblePageIds(newIds);
              localStorage.setItem('metapost_visible_page_ids', JSON.stringify(newIds));
            }}
            onClose={() => setIsPageManagerOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
