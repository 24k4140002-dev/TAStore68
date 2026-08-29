import React, { useState, useEffect, useCallback, useRef } from 'react';
import ConversationSidebar from './ConversationSidebar';
import ChatThread from './ChatThread';
import CustomerProfilePanel from './CustomerProfilePanel';
import UnreadBanner from './UnreadBanner';
import SharedMediaModal from './SharedMediaModal';
import OrderCreateModal from './OrderCreateModal';
import LabelsManagerModal from './LabelsManagerModal';
import QuickRepliesModal from './QuickRepliesModal';
import VietQRModal from './VietQRModal';
import PageManagerModal from './PageManagerModal';
import { triggerNewMessageNotification } from '../../services/notificationService';
import {
  confirmOptimisticMessage,
  createOptimisticMessage,
  isConversationRequestCurrent,
  mergeMessageWindow,
  removeOptimisticMessage
} from '../../services/messageState';
import {
  persistMessageCache,
  readMessageCache,
  setCacheItemWithMessageEviction
} from '../../services/messageCache';
import {
  mergeLabelsByName
} from '../../services/metaOutcomeState';
import {
  fetchPages,
  fetchPageConversations,
  fetchPageConversationHeads,
  getPageDisplayName,
  fetchConversationMessages,
  markConversationAsRead,
  canMarkConversationSeen,
  sendMessengerMessage,
  sendCommentReply,
  sendPrivateReply,
  fetchAllPagesUnreadSummary,
  fetchPageLabels,
  fetchUserLabels,
  syncAssignPageLabel,
  syncUnassignPageLabel,
  subscribeAllPagesWebhooks,
  runInChunks,
  DEFAULT_QUICK_REPLIES
} from '../../services/facebookApi';
import { runWithCrossTabSyncLock } from '../../utils/crossTabSync';
import { mergeRefreshedPageConversations } from '../../services/conversationRefresh';
import { PUSH_PAGE_SELECTION_CHANGED_EVENT } from '../../services/pushState';
import {
  applyConfirmedReadsToConversations,
  applyConfirmedReadsToSummary,
  collectConfirmedReadCandidates,
  createReadCandidate,
  filterCurrentReadCandidates,
  getConversationReadMarker,
  persistConfirmedReadsToInboxCaches
} from '../../services/readState';

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

function getStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const STATUS_MAP_KEY = 'metapost_status_map';
const STARRED_MAP_KEY = 'metapost_starred_map';
const INITIAL_MESSAGE_LIMIT = 30;
const ACTIVE_THREAD_SYNC_LIMIT = 10;
const ACTIVE_THREAD_SYNC_MS = 10_000;
const FOREGROUND_SELECTED_PAGE_SYNC_MS = 45_000;
const FOREGROUND_ALL_PAGES_SYNC_MS = 180_000;
const FOREGROUND_OTHER_PAGES_SYNC_MS = 60_000;
const BACKGROUND_SYNC_MS = 300_000;
const FOREGROUND_EVENT_COOLDOWN_MS = 15_000;
const META_DONE_LABEL = {
  id: 'meta_workflow_done',
  name: 'Đã xử lý',
  emoji: '✅',
  color: '#10b981',
  source: 'local'
};
const META_FOLLOWUP_LABEL = {
  id: 'meta_workflow_followup',
  name: 'Cần theo dõi',
  emoji: '⭐',
  color: '#f59e0b',
  source: 'local'
};

function hasLabelName(labels = [], name = '') {
  const target = name.trim().toLocaleLowerCase('vi-VN');
  return labels.some(label => (label.name || '').trim().toLocaleLowerCase('vi-VN') === target);
}

function getLocalMap(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function saveLocalMap(key, map) {
  localStorage.setItem(key, JSON.stringify(map));
}

function applyLocalConversationState(conversation, statusMap, starredMap) {
  const id = conversation.fb_conversation_id;
  const hasDoneLabel = hasLabelName(conversation.labels, META_DONE_LABEL.name);
  const hasFollowupLabel = hasLabelName(conversation.labels, META_FOLLOWUP_LABEL.name);
  const savedStatus = statusMap[id];
  const hasSavedStatus = Object.prototype.hasOwnProperty.call(statusMap, id);
  const hasSavedStarred = Object.prototype.hasOwnProperty.call(starredMap, id);
  return {
    ...conversation,
    status: hasSavedStatus ? savedStatus : (hasDoneLabel ? 'done' : conversation.status),
    is_starred: hasSavedStarred
      ? Boolean(starredMap[id])
      : (hasFollowupLabel || Boolean(conversation.is_starred))
  };
}

export default function CRMInbox({ fbToken, notificationTarget = null, onOpenTokenModal }) {
  const [pages, setPages] = useState(() => getStoredArray('metapost_pages_cache'));
  const [visiblePageIds, setVisiblePageIds] = useState(() => getStoredArray('metapost_visible_page_ids'));
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
  const [messageLoadError, setMessageLoadError] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationLoadError, setConversationLoadError] = useState(null);

  // Computed active pages (filtered by user selection, e.g. 3-5 stores)
  const activePages = visiblePageIds.length > 0
    ? pages.filter(p => visiblePageIds.includes(p.id))
    : pages;

  // Mobile state: 'list' (shows sidebar) | 'chat' (shows thread)
  const [mobileView, setMobileView] = useState('list');
  const [isProfilePanelOpenOnMobile, setIsProfilePanelOpenOnMobile] = useState(false);

  const returnToMobileConversationList = useCallback((popHistory = true) => {
    setMobileView('list');
    setIsProfilePanelOpenOnMobile(false);
    localStorage.removeItem('metapost_active_conv_id');
    if (
      popHistory
      && window.innerWidth < 768
      && window.history.state?.metapostView === 'chat'
    ) {
      window.history.back();
    }
  }, []);

  useEffect(() => {
    // A refreshed mobile tab always starts on the list, so remove a stale
    // same-document chat history marker before the next conversation opens.
    if (window.innerWidth < 768 && window.history.state?.metapostView === 'chat') {
      window.history.replaceState(
        { ...window.history.state, metapostView: 'list', metapostConversationId: null },
        '',
        window.location.href
      );
    }

    const handleBrowserBack = () => {
      if (window.innerWidth < 768) returnToMobileConversationList(false);
    };
    window.addEventListener('popstate', handleBrowserBack);
    return () => window.removeEventListener('popstate', handleBrowserBack);
  }, [returnToMobileConversationList]);

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
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [readActionNotice, setReadActionNotice] = useState(null);

  // Modals
  const [activeMediaModal, setActiveMediaModal] = useState(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isLabelsManagerOpen, setIsLabelsManagerOpen] = useState(false);
  const [isQuickRepliesOpen, setIsQuickRepliesOpen] = useState(false);
  const [isVietQROpen, setIsVietQROpen] = useState(false);
  const [isPageManagerOpen, setIsPageManagerOpen] = useState(false);
  const notificationHeadsRef = useRef(new Map());
  const notificationMonitorRunningRef = useRef(false);
  const backgroundConversationSyncRunningRef = useRef(false);
  const activeConversationRef = useRef(activeConversation);
  const conversationsRef = useRef(conversations);
  const messageRequestIdRef = useRef(0);
  const conversationListRequestIdRef = useRef(0);
  const didRestoreActiveConversationRef = useRef(false);
  const handledNotificationTargetRef = useRef('');
  const loadedPageLabelsRef = useRef(new Set());
  const unsupportedPageLabelReadsRef = useRef(new Set());
  const unsupportedUserLabelReadsRef = useRef(new Set());
  const lastListSyncAtRef = useRef(0);
  const lastNotificationMonitorAtRef = useRef(0);
  activeConversationRef.current = activeConversation;
  conversationsRef.current = conversations;

  const applyMetaLabelsToConversation = useCallback((conversation, fbLabels) => {
    if (!conversation?.fb_conversation_id || !conversation?.customer_psid) return;

    const conversationId = conversation.fb_conversation_id;
    let currentCached = [];
    try {
      currentCached = JSON.parse(localStorage.getItem(`metapost_labels_${conversationId}`) || '[]');
    } catch {}

    // Meta is authoritative only for API-backed labels. App workflow state is
    // independent because Business Suite's native Inbox statuses are private.
    const retainedLabels = currentCached.filter(label => label.source !== 'meta' && label.source !== 'meta_auto');
    const pageScopedLabels = (fbLabels || []).map(label => ({ ...label, page_id: conversation.page_id }));
    const merged = mergeLabelsByName(retainedLabels, pageScopedLabels);
    const metaDone = hasLabelName(merged, META_DONE_LABEL.name);
    const metaFollowup = hasLabelName(merged, META_FOLLOWUP_LABEL.name);
    const statusMap = getLocalMap(STATUS_MAP_KEY);
    const starredMap = getLocalMap(STARRED_MAP_KEY);
    const hasLocalStatus = Object.prototype.hasOwnProperty.call(statusMap, conversationId);
    const hasLocalStarred = Object.prototype.hasOwnProperty.call(starredMap, conversationId);

    localStorage.setItem(`metapost_labels_${conversationId}`, JSON.stringify(merged));
    localStorage.setItem(`metapost_labels_${conversation.customer_psid}`, JSON.stringify(merged));
    setActiveConversation(prev => prev?.fb_conversation_id === conversationId ? {
      ...prev,
      labels: merged,
      status: metaDone && !hasLocalStatus ? 'done' : prev.status,
      is_starred: hasLocalStarred ? prev.is_starred : (metaFollowup || prev.is_starred)
    } : prev);
    setConversations(prev => prev.map(item => item.fb_conversation_id === conversationId ? {
      ...item,
      labels: merged,
      status: metaDone && !hasLocalStatus ? 'done' : item.status,
      is_starred: hasLocalStarred ? item.is_starred : (metaFollowup || item.is_starred)
    } : item));
  }, []);

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
        subscribeAllPagesWebhooks(fetchedPages).catch(() => {});
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
    if (silent && backgroundConversationSyncRunningRef.current) return;
    if (silent) backgroundConversationSyncRunningRef.current = true;
    const requestId = ++conversationListRequestIdRef.current;
    if (!silent) {
      setIsLoadingConversations(true);
      setConversationLoadError(null);
    }

    try {
      const storedPageId = localStorage.getItem('metapost_selected_page_id') || selectedPageId;
      const targetPages = storedPageId === 'all'
        ? currentPages
        : currentPages.filter(p => p.id === storedPageId);
      const conversationLimit = storedPageId === 'all' ? (silent ? 10 : 20) : 50;

      const progressiveConversationMap = new Map(
        conversationsRef.current.map(conversation => [conversation.fb_conversation_id, conversation])
      );
      const shouldRenderProgressively = storedPageId === 'all' && progressiveConversationMap.size === 0;
      const statusMapForProgress = getLocalMap(STATUS_MAP_KEY);
      const starredMapForProgress = getLocalMap(STARRED_MAP_KEY);

      // Fetch conversations in throttled batches (2 pages per batch, 200ms delay) to prevent Facebook Rate Limit #4
      const results = await runInChunks(
        targetPages,
        page => fetchPageConversations(page.id, page.name, page.access_token || fbToken, null, conversationLimit),
        2,
        200,
        batchResults => {
          if (silent || !shouldRenderProgressively) return;
          const latestSelectedPageId = localStorage.getItem('metapost_selected_page_id') || selectedPageId;
          if (requestId !== conversationListRequestIdRef.current || latestSelectedPageId !== storedPageId) return;

          batchResults.forEach(result => {
            if (result.status !== 'fulfilled' || !Array.isArray(result.value)) return;
            result.value.forEach(rawConversation => {
              const conversation = applyLocalConversationState(
                rawConversation,
                statusMapForProgress,
                starredMapForProgress
              );
              progressiveConversationMap.set(conversation.fb_conversation_id, conversation);
            });
          });
          const progressive = [...progressiveConversationMap.values()].sort(
            (left, right) => new Date(right.last_message_at || 0) - new Date(left.last_message_at || 0)
          );
          conversationsRef.current = progressive;
          setConversations(progressive);
        }
      );

      let combined = [];
      const newCursors = {};
      const failures = [];
      let anyHasMore = false;

      results.forEach((res, index) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          combined.push(...res.value);
          const resultPageId = res.value.pageId || res.value[0]?.page_id;
          if (resultPageId) {
            newCursors[resultPageId] = res.value.nextCursor || null;
            if (res.value.hasMore) anyHasMore = true;
          }
        } else if (res.status === 'rejected') {
          failures.push({ page: targetPages[index], error: res.reason });
        }
      });

      const latestSelectedPageId = localStorage.getItem('metapost_selected_page_id') || selectedPageId;
      if (requestId !== conversationListRequestIdRef.current || latestSelectedPageId !== storedPageId) {
        return;
      }

      setPageCursors(newCursors);
      setHasMoreOlder(anyHasMore);
      if (failures.length > 0) {
        const firstFailure = failures[0];
        setConversationLoadError({
          pageId: storedPageId,
          message: `${failures.map(item => item.page.name).join(', ')}: ${firstFailure?.error?.message || 'Meta chưa trả được danh sách hội thoại.'} Đang giữ dữ liệu lần tải trước.`,
          code: firstFailure?.error?.code,
          httpStatus: firstFailure?.error?.httpStatus
        });
        // Keep the last good cache instead of replacing it with an empty list
        // when Meta has returned an error for every requested Page.
        if (combined.length === 0) return;
      } else {
        setConversationLoadError(null);
      }

      // First-page polling must refresh matching conversations without
      // discarding older pages the operator already loaded in this view.
      combined = mergeRefreshedPageConversations(
        combined,
        conversationsRef.current,
        targetPages.map(page => page.id)
      );

      // Apply read tracking, new message notification, and persistent labels
      const statusMap = getLocalMap(STATUS_MAP_KEY);
      const starredMap = getLocalMap(STARRED_MAP_KEY);
      combined.forEach((rawConversation, index) => {
        const c = applyLocalConversationState(rawConversation, statusMap, starredMap);
        combined[index] = c;

        // The full list refresh already contains the newest message. Reuse it
        // for notifications instead of making another Graph request for the
        // same Page in the cross-Page monitor.
        const notificationKey = `${c.page_id}:${c.fb_conversation_id}`;
        const notificationMarker = c.last_message_id || `${c.last_message_at || ''}:${c.snippet || ''}`;
        const previousMarker = notificationHeadsRef.current.get(notificationKey);
        notificationHeadsRef.current.set(notificationKey, notificationMarker);
        if (
          previousMarker
          && previousMarker !== notificationMarker
          && c.last_sender_id
          && c.last_sender_id !== c.page_id
        ) {
          triggerNewMessageNotification({
            pageId: c.page_id,
            pageName: c.page_name,
            convId: c.fb_conversation_id,
            customerName: c.customer_name,
            messageId: c.last_message_id || notificationMarker,
            messageText: c.snippet,
            avatarUrl: c.avatar_url,
            playSound: true
          });
        }

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

      combined.sort(
        (left, right) => new Date(right.last_message_at || 0) - new Date(left.last_message_at || 0)
      );

      conversationsRef.current = combined;
      setConversations(combined);
      const serializedConversations = JSON.stringify(combined);
      setCacheItemWithMessageEviction(localStorage, 'metapost_inbox_cache', serializedConversations);
      setCacheItemWithMessageEviction(
        localStorage,
        `metapost_inbox_cache_${storedPageId}`,
        serializedConversations
      );

      // Restore active conversation from localStorage on load/F5 (ONLY for Desktop 2-pane view, NEVER auto-open on mobile)
      const isDesktop = window.innerWidth >= 768;
      if (isDesktop) {
        const currentActiveId = activeConversationRef.current?.fb_conversation_id;
        const refreshedActive = currentActiveId
          ? combined.find(c => c.fb_conversation_id === currentActiveId)
          : null;

        if (refreshedActive) {
          setActiveConversation(prev => prev ? { ...prev, ...refreshedActive } : refreshedActive);
        } else if (!currentActiveId) {
          const savedActiveId = localStorage.getItem('metapost_active_conv_id');
          const matched = savedActiveId
            ? combined.find(c => c.fb_conversation_id === savedActiveId)
            : null;
          const conversationToRestore = matched || combined[0];
          if (conversationToRestore) handleSelectConversation(conversationToRestore, false);
        }
      }
    } catch (err) {
      console.error('Fetch all conversations error:', err);
      if (requestId === conversationListRequestIdRef.current) {
        setConversationLoadError({
          pageId: localStorage.getItem('metapost_selected_page_id') || selectedPageId,
          message: err?.message || 'Không thể tải danh sách hội thoại.'
        });
      }
    } finally {
      if (silent) backgroundConversationSyncRunningRef.current = false;
      if (requestId === conversationListRequestIdRef.current) {
        setIsLoadingConversations(false);
      }
    }
  }, [fbToken, pages, selectedPageId]);

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
          const statusMap = getLocalMap(STATUS_MAP_KEY);
          const starredMap = getLocalMap(STARRED_MAP_KEY);
          const freshOlder = olderConvs
            .filter(c => !existingIds.has(c.fb_conversation_id))
            .map(c => applyLocalConversationState(c, statusMap, starredMap));
          const merged = [...prev, ...freshOlder];
          setCacheItemWithMessageEviction(
            localStorage,
            'metapost_inbox_cache',
            JSON.stringify(merged)
          );
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
  // 4. Select Conversation with Instant SWR Cache
  const handleSelectConversation = async (conv, shouldSwitchMobileView = true) => {
    const requestId = ++messageRequestIdRef.current;
    const conversationId = conv.fb_conversation_id;
    let hadCachedMessages = false;
    let cachedMessages = [];
    setMessageLoadError('');
    setIsLoadingOlderMessages(false);

    // Merge persistent labels before setting active conversation
    let savedLabels = null;
    try {
      savedLabels = JSON.parse(
        localStorage.getItem(`metapost_labels_${conv.fb_conversation_id}`) ||
        (conv.customer_psid ? localStorage.getItem(`metapost_labels_${conv.customer_psid}`) : null) ||
        'null'
      );
    } catch {}
    const trustedSavedLabels = Array.isArray(savedLabels)
      ? savedLabels.filter(label => label?.source !== 'meta_auto')
      : savedLabels;
    if (Array.isArray(savedLabels) && trustedSavedLabels.length !== savedLabels.length) {
      localStorage.setItem(`metapost_labels_${conversationId}`, JSON.stringify(trustedSavedLabels));
      if (conv.customer_psid) {
        localStorage.setItem(`metapost_labels_${conv.customer_psid}`, JSON.stringify(trustedSavedLabels));
      }
    }
    const convWithLabels = {
      ...conv,
      labels: (trustedSavedLabels && trustedSavedLabels.length > 0)
        ? trustedSavedLabels
        : (conv.labels || []).filter(label => label?.source !== 'meta_auto')
    };

    setActiveConversation(convWithLabels);
    localStorage.setItem('metapost_active_conv_id', conversationId);
    if (shouldSwitchMobileView) {
      setMobileView('chat'); // Switch view on mobile to chat ONLY on explicit tap
      setIsProfilePanelOpenOnMobile(false);
      if (window.innerWidth < 768 && window.history.state?.metapostView !== 'chat') {
        window.history.pushState(
          { ...window.history.state, metapostView: 'chat', metapostConversationId: conversationId },
          '',
          window.location.href
        );
      }
    }

    // ⚡ INSTANT SWR CACHE: Render previously cached messages in 0.001s
    cachedMessages = readMessageCache(conversationId);
    if (cachedMessages.length > 0) {
      hadCachedMessages = true;
      setMessages(cachedMessages);
      setIsLoadingMessages(false);
    } else {
      setMessages([]);
      setMessagesNextCursor(null);
      setHasMoreMessages(false);
      setIsLoadingMessages(true);
    }

    // Load local CRM details immediately instead of waiting for the Graph request.
    if (conv.customer_psid) {
      try {
        const savedOrders = JSON.parse(localStorage.getItem(`orders_${conv.customer_psid}`) || '[]');
        const rawSavedCust = JSON.parse(localStorage.getItem(`metapost_cust_${conv.customer_psid}`) || '{}');
        const savedCust = rawSavedCust.lead_stage_source === 'meta_auto'
          ? {
              ...rawSavedCust,
              lead_stage: 'potential',
              lead_stage_source: null,
              lead_stage_updated_at: null
            }
          : rawSavedCust;
        if (rawSavedCust.lead_stage_source === 'meta_auto') {
          localStorage.setItem(`metapost_cust_${conv.customer_psid}`, JSON.stringify(savedCust));
        }
        const savedNotes = JSON.parse(localStorage.getItem(`metapost_notes_${conv.customer_psid}`) || '[]');
        setCustomerOrders(savedOrders);
        setCustomerCRMData({
          ...savedCust,
          phone: savedCust.phone || '',
          email: savedCust.email || '',
          address: savedCust.address || '',
          lead_stage: savedCust.lead_stage || 'potential',
          notes: savedNotes
        });
      } catch {
        setCustomerOrders([]);
        setCustomerCRMData({ phone: '', email: '', address: '', lead_stage: 'potential', notes: [] });
      }
    } else {
      setCustomerOrders([]);
      setCustomerCRMData({ phone: '', email: '', address: '', lead_stage: 'potential', notes: [] });
    }

    // An explicit tap may ask Meta to mark the thread seen, but the red badge is
    // cleared only after a read-back confirms unread_count=0 for the same latest
    // message. A newer arrival while this request is pending stays unread.
    if (shouldSwitchMobileView && Number(conv.unread_count || 0) > 0) {
      const candidate = createReadCandidate(conv);
      const canSyncRead = canMarkConversationSeen(conv);
      const pendingState = canSyncRead ? 'pending' : 'unconfirmed';
      const setCandidateSyncState = (state) => {
        setActiveConversation(prev => (
          prev?.fb_conversation_id === conversationId
          && getConversationReadMarker(prev) === candidate.marker
            ? { ...prev, read_sync_state: state }
            : prev
        ));
        setConversations(prev => {
          const next = prev.map(item => (
            item.fb_conversation_id === conversationId
            && getConversationReadMarker(item) === candidate.marker
              ? { ...item, read_sync_state: state }
              : item
          ));
          conversationsRef.current = next;
          return next;
        });
      };
      setCandidateSyncState(pendingState);

      if (canSyncRead) {
        markConversationAsRead(
          conv.customer_psid,
          conv.page_token || fbToken,
          conversationId
        ).then(result => {
          if (!result?.confirmed) {
            setCandidateSyncState('unconfirmed');
            return;
          }
          const confirmedNow = filterCurrentReadCandidates(conversationsRef.current, [candidate]);
          if (confirmedNow.length === 0) return;
          const next = applyConfirmedReadsToConversations(conversationsRef.current, confirmedNow);
          persistConfirmedReadsToInboxCaches(localStorage, confirmedNow);
          conversationsRef.current = next;
          setConversations(next);
          setActiveConversation(prev => (
            prev?.fb_conversation_id === conversationId
            && getConversationReadMarker(prev) === candidate.marker
              ? { ...prev, unread_count: 0, meta_unread_count: 0, read_sync_state: 'confirmed' }
              : prev
          ));
          setUnreadSummary(prev => applyConfirmedReadsToSummary(prev, confirmedNow));
        }).catch(() => setCandidateSyncState('failed'));
      }
    }

    // Facebook labels are also background-only and must never delay message rendering.
    if (
      conv.page_id
      && !loadedPageLabelsRef.current.has(conv.page_id)
      && !unsupportedPageLabelReadsRef.current.has(conv.page_id)
    ) {
      loadedPageLabelsRef.current.add(conv.page_id);
      fetchPageLabels(conv.page_id, conv.page_token || fbToken).then(pageLabels => {
        if (pageLabels?.unsupported) {
          unsupportedPageLabelReadsRef.current.add(conv.page_id);
          return;
        }
        if (!Array.isArray(pageLabels) || pageLabels.length === 0) return;
        setAllLabels(prev => {
          const withoutOldPageLabels = prev.filter(label => label.page_id !== conv.page_id);
          const next = [...withoutOldPageLabels, ...pageLabels];
          localStorage.setItem('metapost_all_labels', JSON.stringify(next));
          return next;
        });
      }).catch(() => {
        loadedPageLabelsRef.current.delete(conv.page_id);
      });
    }

    if (conv.customer_psid && !unsupportedUserLabelReadsRef.current.has(conv.page_id)) {
      fetchUserLabels(conv.customer_psid, conv.page_token || fbToken).then(fbLabels => {
        if (fbLabels?.unsupported) {
          unsupportedUserLabelReadsRef.current.add(conv.page_id);
          return;
        }
        applyMetaLabelsToConversation(conv, fbLabels);
      }).catch(() => {});
    }

    try {
      const msgs = await fetchConversationMessages(
        conversationId,
        conv.page_token || fbToken,
        null,
        INITIAL_MESSAGE_LIMIT
      );

      if (Array.isArray(msgs) && msgs.length > 0) {
        const mergedMessages = mergeMessageWindow(cachedMessages, msgs);
        persistMessageCache(conversationId, mergedMessages);

        if (requestId === messageRequestIdRef.current) {
          setMessages(mergedMessages);
          setMessagesNextCursor(msgs.nextCursor || null);
          setHasMoreMessages(!!msgs.hasMore);
        }

      } else if (requestId === messageRequestIdRef.current) {
        if (!hadCachedMessages) setMessages([]);
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.error('Load messages error:', err);
      if (requestId === messageRequestIdRef.current) {
        setMessageLoadError(err?.message || 'Không tải được tin nhắn từ Meta.');
      }
    } finally {
      if (requestId === messageRequestIdRef.current) setIsLoadingMessages(false);
    }
  };

  // Load older messages (Yesterday, last week, etc.)
  const handleLoadOlderMessages = async () => {
    if (!activeConversation?.fb_conversation_id || isLoadingOlderMessages) return;
    const conversationId = activeConversation.fb_conversation_id;
    const selectionRequestId = messageRequestIdRef.current;
    const cursorAtStart = messagesNextCursor;
    setIsLoadingOlderMessages(true);
    setMessageLoadError('');
    try {
      const olderMsgs = await fetchConversationMessages(
        conversationId,
        activeConversation.page_token || fbToken,
        cursorAtStart,
        50
      );
      if (!isConversationRequestCurrent({
        activeConversationId: activeConversationRef.current?.fb_conversation_id,
        conversationId,
        currentRequestId: messageRequestIdRef.current,
        requestId: selectionRequestId
      })) return;
      if (Array.isArray(olderMsgs) && olderMsgs.length > 0) {
        setMessages(prev => {
          if (activeConversationRef.current?.fb_conversation_id !== conversationId) return prev;
          const existingIds = new Set(prev.map(m => m.id));
          const newOlder = olderMsgs.filter(m => !existingIds.has(m.id));
          const merged = [...newOlder, ...prev];
          persistMessageCache(conversationId, merged);
          return merged;
        });
        setMessagesNextCursor(olderMsgs.nextCursor || null);
        setHasMoreMessages(!!olderMsgs.hasMore);
      } else {
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.warn('Load older messages error:', err);
      if (isConversationRequestCurrent({
        activeConversationId: activeConversationRef.current?.fb_conversation_id,
        conversationId,
        currentRequestId: messageRequestIdRef.current,
        requestId: selectionRequestId
      })) {
        setMessageLoadError(err?.message || 'Không tải được lịch sử cũ từ Meta.');
      }
    } finally {
      if (isConversationRequestCurrent({
        activeConversationId: activeConversationRef.current?.fb_conversation_id,
        conversationId,
        currentRequestId: messageRequestIdRef.current,
        requestId: selectionRequestId
      })) setIsLoadingOlderMessages(false);
    }
  };

  // 5. Real-time Active Thread Polling (Sync new messages in 3-4s without page reload)
  useEffect(() => {
    if (!activeConversation?.fb_conversation_id || !fbToken) return;

    const convId = activeConversation.fb_conversation_id;
    const pageId = activeConversation.page_id;
    const pageName = activeConversation.page_name;
    const customerName = activeConversation.customer_name;
    const customerPsid = activeConversation.customer_psid;
    const avatarUrl = activeConversation.avatar_url;
    const token = activeConversation.page_token || fbToken;

    let isSyncing = false;
    let lastSyncAt = 0;
    const syncActiveThread = async () => {
      if (document.hidden || !navigator.onLine) return;
      if (isSyncing) return;
      if (Date.now() - lastSyncAt < 5_000) return;
      isSyncing = true;
      lastSyncAt = Date.now();
      try {
        const latestMsgs = await runWithCrossTabSyncLock(
          `active-thread-${convId}`,
          () => fetchConversationMessages(convId, token, null, ACTIVE_THREAD_SYNC_LIMIT),
          { leaseMs: 30_000 }
        );
        if (latestMsgs && latestMsgs.length > 0) {
          setMessages(prev => {
            const prevIds = new Set(prev.map(m => m.id));
            const newMessages = latestMsgs.filter(message => !prevIds.has(message.id));
            const hasNew = newMessages.length > 0;
            if (hasNew) {
              // Notify only for a genuinely new incoming message. Sent Page
              // messages and older records entering the window stay silent.
              const incomingMessage = [...newMessages]
                .reverse()
                .find(message => message?.from?.id && message.from.id !== pageId);
              if (incomingMessage) {
                triggerNewMessageNotification({
                  pageId,
                  pageName,
                  convId,
                  customerName,
                  messageId: incomingMessage.id,
                  messageText: incomingMessage.message || 'Khách hàng vừa gửi tin nhắn mới',
                  avatarUrl,
                  playSound: true
                });
              }
              const merged = mergeMessageWindow(prev, latestMsgs);
              persistMessageCache(convId, merged);
              return merged;
            }
            return prev;
          });
        }
      } catch (e) {
        // A later poll or focus event retries without interrupting the chat UI.
      } finally {
        isSyncing = false;
      }
    };

    const handleVisibilitySync = () => {
      if (!document.hidden) syncActiveThread();
    };
    const pollTimer = setInterval(syncActiveThread, ACTIVE_THREAD_SYNC_MS);
    window.addEventListener('focus', syncActiveThread);
    document.addEventListener('visibilitychange', handleVisibilitySync);

    return () => {
      clearInterval(pollTimer);
      window.removeEventListener('focus', syncActiveThread);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
    };
  }, [
    activeConversation?.fb_conversation_id,
    activeConversation?.page_id,
    activeConversation?.page_name,
    activeConversation?.customer_name,
    activeConversation?.customer_psid,
    activeConversation?.avatar_url,
    activeConversation?.page_token,
    fbToken
  ]);

  // Meta labels are refreshed when a conversation is selected or explicitly
  // changed. Continuous label polling caused needless Graph traffic and could
  // also erase the last good snapshot on Pages where Custom Labels is absent.

  // Notification clicks can arrive after Inbox has already mounted. Switch to
  // the correct Page first; the pending target effect below opens the chat as
  // soon as that Page's conversation list is available.
  useEffect(() => {
    if (!notificationTarget?.nonce || pages.length === 0) return;
    if (handledNotificationTargetRef.current === notificationTarget.nonce) return;
    const targetPageId = String(notificationTarget.pageId || 'all');
    const targetPages = targetPageId === 'all'
      ? (activePages.length > 0 ? activePages : pages)
      : pages.filter(page => String(page.id) === targetPageId);
    if (targetPages.length === 0) return;

    handledNotificationTargetRef.current = notificationTarget.nonce;
    setSelectedPageId(targetPageId);
    setConversationLoadError(null);
    localStorage.setItem('metapost_selected_page_id', targetPageId);
    if (notificationTarget.convId) {
      localStorage.setItem('metapost_pending_conv_id', String(notificationTarget.convId));
    }
    if (notificationTarget.senderPsid) {
      localStorage.setItem('metapost_pending_sender_psid', String(notificationTarget.senderPsid));
    }

    let cached = [];
    try {
      cached = JSON.parse(localStorage.getItem(`metapost_inbox_cache_${targetPageId}`) || '[]');
    } catch {}
    if (Array.isArray(cached) && cached.length > 0) {
      conversationsRef.current = cached;
      setConversations(cached);
      loadAllConversations(targetPages, false);
    } else {
      loadAllConversations(targetPages, false);
    }
  }, [notificationTarget?.nonce, pages, loadAllConversations]);

  // Open the exact customer after a lock-screen notification selected its Page.
  useEffect(() => {
    if (conversations.length === 0) return;
    const pendingSenderPsid = localStorage.getItem('metapost_pending_sender_psid');
    const pendingConversationId = localStorage.getItem('metapost_pending_conv_id');
    if (!pendingSenderPsid && !pendingConversationId) return;
    const matched = conversations.find(conversation => (
      (
        (pendingConversationId && String(conversation.fb_conversation_id || '') === pendingConversationId)
        || (pendingSenderPsid && String(conversation.customer_psid || '') === pendingSenderPsid)
      )
      && (selectedPageId === 'all' || String(conversation.page_id || '') === selectedPageId)
    ));
    if (!matched) return;
    localStorage.removeItem('metapost_pending_sender_psid');
    localStorage.removeItem('metapost_pending_conv_id');
    handleSelectConversation(matched, true);
  }, [conversations, selectedPageId]);

  // Restore the last desktop chat from the already-hydrated local cache on F5.
  useEffect(() => {
    if (
      didRestoreActiveConversationRef.current
      || localStorage.getItem('metapost_pending_sender_psid')
      || localStorage.getItem('metapost_pending_conv_id')
      || window.innerWidth < 768
      || conversations.length === 0
    ) return;
    didRestoreActiveConversationRef.current = true;
    const savedActiveId = localStorage.getItem('metapost_active_conv_id');
    const matched = savedActiveId
      ? conversations.find(c => c.fb_conversation_id === savedActiveId)
      : null;
    handleSelectConversation(matched || conversations[0], false);
  }, []);

  // 6. Send Message Handler with Optimistic UI
  const handleSendMessage = async ({ text, file, mode }) => {
    const conversationAtSend = activeConversationRef.current;
    if (!conversationAtSend) return;
    const token = conversationAtSend.page_token || fbToken;
    const conversationId = conversationAtSend.fb_conversation_id;
    const cleanText = text?.trim() || '';
    const tempId = cleanText ? `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : '';

    if (tempId) {
      const optimisticMsg = createOptimisticMessage({
        id: tempId,
        text: cleanText,
        createdAt: new Date().toISOString(),
        pageId: conversationAtSend.page_id,
        pageName: conversationAtSend.page_name
      });
      setMessages(prev => {
        const next = [...prev, optimisticMsg];
        persistMessageCache(conversationId, next);
        return next;
      });
    }

    try {
      let response;
      if (mode === 'messenger' && conversationAtSend.customer_psid) {
        response = await sendMessengerMessage(conversationAtSend.customer_psid, cleanText, token, file);
      } else if (mode === 'public_comment' && conversationAtSend.id) {
        response = await sendCommentReply(conversationAtSend.id, cleanText, token);
      } else if (mode === 'private_reply' && conversationAtSend.id) {
        response = await sendPrivateReply(conversationAtSend.id, cleanText, token);
      }

      if (tempId) {
        const cachedMessages = readMessageCache(conversationId);
        const confirmedCache = confirmOptimisticMessage(cachedMessages, tempId, response);
        persistMessageCache(conversationId, confirmedCache);

        if (activeConversationRef.current?.fb_conversation_id === conversationId) {
          setMessages(prev => confirmOptimisticMessage(prev, tempId, response));
        }
      }

      const sentAt = new Date().toISOString();
      const snippet = cleanText || (file ? '📎 Đã gửi tệp đính kèm' : 'Đã gửi phản hồi');
      setConversations(prev => prev.map(conversation =>
        conversation.fb_conversation_id === conversationId
          ? { ...conversation, snippet, last_message_at: sentAt }
          : conversation
      ));
      setActiveConversation(prev => prev?.fb_conversation_id === conversationId
        ? { ...prev, snippet, last_message_at: sentAt }
        : prev
      );

      // Attachments need Meta's normalized attachment payload. Refresh them in
      // the background, outside the send button's critical path.
      if (file) {
        fetchConversationMessages(conversationId, token, null, ACTIVE_THREAD_SYNC_LIMIT).then(freshMessages => {
          if (!Array.isArray(freshMessages) || freshMessages.length === 0) return;
          const cachedMessages = readMessageCache(conversationId);
          const mergedCache = mergeMessageWindow(cachedMessages, freshMessages);
          persistMessageCache(conversationId, mergedCache);
          if (activeConversationRef.current?.fb_conversation_id === conversationId) {
            setMessages(prev => mergeMessageWindow(prev, freshMessages));
          }
        }).catch(() => {});
      }

      return response;
    } catch (err) {
      console.error('Send error:', err);
      if (tempId && err.textSent) {
        const cachedMessages = readMessageCache(conversationId);
        const confirmedCache = confirmOptimisticMessage(cachedMessages, tempId, err.textResponse);
        persistMessageCache(conversationId, confirmedCache);
        if (activeConversationRef.current?.fb_conversation_id === conversationId) {
          setMessages(prev => confirmOptimisticMessage(prev, tempId, err.textResponse));
        }
      } else if (tempId) {
        const cachedMessages = readMessageCache(conversationId);
        persistMessageCache(conversationId, removeOptimisticMessage(cachedMessages, tempId));
        if (activeConversationRef.current?.fb_conversation_id === conversationId) {
          setMessages(prev => removeOptimisticMessage(prev, tempId));
        }
      }
      throw err;
    }
  };

  // 6. Update Status
  const handleUpdateStatus = async (fbConvId, newStatus) => {
    const target = activeConversationRef.current;
    if (!target || target.fb_conversation_id !== fbConvId) {
      throw new Error('Không tìm thấy cuộc trò chuyện cần cập nhật.');
    }

    const token = target.page_token || fbToken;
    const currentLabels = target.labels || [];
    let nextLabels = currentLabels;

    // Workflow state belongs to MetaPost Studio first. Meta Business Suite's
    // native Done/Follow up/Spam actions are not exposed by the public API, so
    // a custom Page label is only a best-effort secondary sync.
    setConversations(prev => prev.map(c => {
      if (c.fb_conversation_id === fbConvId) {
        return { ...c, status: newStatus };
      }
      return c;
    }));

    if (activeConversationRef.current?.fb_conversation_id === fbConvId) {
      setActiveConversation(prev => ({ ...prev, status: newStatus }));
    }

    const statusMap = getLocalMap(STATUS_MAP_KEY);
    statusMap[fbConvId] = newStatus;
    saveLocalMap(STATUS_MAP_KEY, statusMap);

    if (newStatus === 'done') {
      setStatusFilter('open');
      if (window.innerWidth < 768) {
        returnToMobileConversationList();
      }
    }

    const canSyncCustomLabel = Boolean(target.page_id && token && target.customer_psid);
    let metaSynced = null;

    if (newStatus === 'done') {
      if (canSyncCustomLabel) {
        const syncedLabel = await syncAssignPageLabel(
          target.page_id,
          token,
          META_DONE_LABEL,
          target.customer_psid
        );
        metaSynced = Boolean(syncedLabel?.metaSynced);
        if (metaSynced) nextLabels = mergeLabelsByName(currentLabels, [syncedLabel]);
      }
    } else {
      const assigned = currentLabels.find(label => hasLabelName([label], META_DONE_LABEL.name));
      if (canSyncCustomLabel && assigned?.source === 'meta') {
        metaSynced = await syncUnassignPageLabel(
          target.page_id,
          token,
          assigned.id,
          target.customer_psid
        );
      }
      nextLabels = currentLabels.filter(label => !hasLabelName([label], META_DONE_LABEL.name));
    }

    if (nextLabels !== currentLabels) {
      setConversations(prev => prev.map(c => (
        c.fb_conversation_id === fbConvId ? { ...c, labels: nextLabels } : c
      )));
      if (activeConversationRef.current?.fb_conversation_id === fbConvId) {
        setActiveConversation(prev => ({ ...prev, labels: nextLabels }));
      }
      localStorage.setItem(`metapost_labels_${fbConvId}`, JSON.stringify(nextLabels));
      if (target.customer_psid) {
        localStorage.setItem(`metapost_labels_${target.customer_psid}`, JSON.stringify(nextLabels));
      }
    }

    return { localSaved: true, metaSynced };
  };

  // 7. Toggle Star
  const handleToggleStar = async (fbConvId) => {
    const target = activeConversationRef.current;
    if (!target || target.fb_conversation_id !== fbConvId) {
      throw new Error('Không tìm thấy cuộc trò chuyện cần cập nhật.');
    }

    const currentLabels = target.labels || [];
    const nextStarred = !target.is_starred;
    let nextLabels = currentLabels;
    let metaSynced = null;
    const token = target.page_token || fbToken;
    const canSyncCustomLabel = Boolean(target.page_id && token && target.customer_psid);

    setConversations(prev => prev.map(c => (
      c.fb_conversation_id === fbConvId ? { ...c, is_starred: nextStarred } : c
    )));
    if (activeConversationRef.current?.fb_conversation_id === fbConvId) {
      setActiveConversation(prev => ({ ...prev, is_starred: nextStarred }));
    }

    const starredMap = getLocalMap(STARRED_MAP_KEY);
    starredMap[fbConvId] = nextStarred;
    saveLocalMap(STARRED_MAP_KEY, starredMap);

    if (nextStarred) {
      if (canSyncCustomLabel) {
        const syncedLabel = await syncAssignPageLabel(
          target.page_id,
          token,
          META_FOLLOWUP_LABEL,
          target.customer_psid
        );
        metaSynced = Boolean(syncedLabel?.metaSynced);
        if (metaSynced) nextLabels = mergeLabelsByName(currentLabels, [syncedLabel]);
      }
    } else {
      const assigned = currentLabels.find(label => hasLabelName([label], META_FOLLOWUP_LABEL.name));
      if (canSyncCustomLabel && assigned?.source === 'meta') {
        metaSynced = await syncUnassignPageLabel(
          target.page_id,
          token,
          assigned.id,
          target.customer_psid
        );
      }
      nextLabels = currentLabels.filter(label => !hasLabelName([label], META_FOLLOWUP_LABEL.name));
    }

    if (nextLabels !== currentLabels) {
      setConversations(prev => prev.map(c => (
        c.fb_conversation_id === fbConvId ? { ...c, labels: nextLabels } : c
      )));
      if (activeConversationRef.current?.fb_conversation_id === fbConvId) {
        setActiveConversation(prev => ({ ...prev, labels: nextLabels }));
      }
      localStorage.setItem(`metapost_labels_${fbConvId}`, JSON.stringify(nextLabels));
      if (target.customer_psid) {
        localStorage.setItem(`metapost_labels_${target.customer_psid}`, JSON.stringify(nextLabels));
      }
    }

    return { localSaved: true, metaSynced };
  };

  // 9. Add / Remove Persistent Label (Syncs with LocalStorage & Meta Graph API)
  const handleAddLabel = async (label) => {
    if (!activeConversation) return;
    const currentLabels = activeConversation.labels || [];
    if (currentLabels.some(l => l.id === label.id || l.name?.toLowerCase() === label.name?.toLowerCase())) return { metaSynced: true };

    const syncedLabel = await syncAssignPageLabel(
      activeConversation.page_id,
      activeConversation.page_token || fbToken,
      label,
      activeConversation.customer_psid
    );
    if (!syncedLabel?.metaSynced) throw new Error('Meta chưa xác nhận gắn nhãn nên web không lưu nhãn này.');

    const newLabels = mergeLabelsByName(currentLabels, [syncedLabel]);
    setActiveConversation(prev => prev ? { ...prev, labels: newLabels } : prev);
    setConversations(prev => prev.map(c => c.fb_conversation_id === activeConversation.fb_conversation_id ? { ...c, labels: newLabels } : c));
    localStorage.setItem(`metapost_labels_${activeConversation.fb_conversation_id}`, JSON.stringify(newLabels));
    if (activeConversation.customer_psid) localStorage.setItem(`metapost_labels_${activeConversation.customer_psid}`, JSON.stringify(newLabels));
    return { metaSynced: true };
  };

  const handleRemoveLabel = async (labelId) => {
    if (!activeConversation) return;
    const assignedLabel = (activeConversation.labels || []).find(l => l.id === labelId || l.name === labelId);
    if (!assignedLabel) return { metaSynced: true };
    const metaSynced = await syncUnassignPageLabel(
      activeConversation.page_id,
      activeConversation.page_token || fbToken,
      assignedLabel.id || assignedLabel.name,
      activeConversation.customer_psid
    );
    if (!metaSynced) throw new Error('Meta chưa xác nhận gỡ nhãn nên web giữ nguyên nhãn hiện tại.');

    const newLabels = (activeConversation.labels || []).filter(l => l.id !== labelId && l.name !== labelId);
    setActiveConversation(prev => ({ ...prev, labels: newLabels }));
    setConversations(prev => prev.map(c => c.fb_conversation_id === activeConversation.fb_conversation_id ? { ...c, labels: newLabels } : c));

    // Save to localStorage
    localStorage.setItem(`metapost_labels_${activeConversation.fb_conversation_id}`, JSON.stringify(newLabels));
    if (activeConversation.customer_psid) {
      localStorage.setItem(`metapost_labels_${activeConversation.customer_psid}`, JSON.stringify(newLabels));
    }

    return { metaSynced: true };
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

  const handleUpdateLeadStage = (leadStage) => {
    if (!activeConversation?.customer_psid) return;
    const storageKey = `metapost_cust_${activeConversation.customer_psid}`;
    let savedCustomer = {};
    try {
      savedCustomer = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {}
    const updatedAt = new Date().toISOString();
    localStorage.setItem(storageKey, JSON.stringify({
      ...savedCustomer,
      lead_stage: leadStage,
      lead_stage_source: 'manual',
      lead_stage_updated_at: updatedAt
    }));
    setCustomerCRMData(prev => ({
      ...prev,
      lead_stage: leadStage,
      lead_stage_source: 'manual',
      lead_stage_updated_at: updatedAt
    }));
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

  // Monitor the newest conversations on every enabled Page independently of
  // the Page currently open in the UI. This mirrors Meta's Page-separated
  // notification behavior without replacing the visible conversation list.
  const monitorAllPageNotifications = useCallback(async (allPages) => {
    if (!fbToken || !Array.isArray(allPages) || allPages.length === 0) return;
    if (notificationMonitorRunningRef.current) return;
    notificationMonitorRunningRef.current = true;

    try {
      let pageNicknames = {};
      try {
        pageNicknames = JSON.parse(localStorage.getItem('metapost_page_nicknames') || '{}');
      } catch {}
      const pagesWithDisplayNames = allPages.map(page => ({
        ...page,
        notification_name: getPageDisplayName(page, allPages, pageNicknames)
      }));
      const results = await runWithCrossTabSyncLock(
        'page-head-monitor',
        () => runInChunks(
          pagesWithDisplayNames,
          page => fetchPageConversationHeads(
            page.id,
            page.notification_name || page.name,
            page.access_token || fbToken,
            10
          ),
          2,
          250
        )
      );

      if (!Array.isArray(results)) return;

      results.forEach(result => {
        if (result.status !== 'fulfilled' || !Array.isArray(result.value)) return;
        result.value.forEach(head => {
          const conversationKey = `${head.page_id}:${head.conversation_id}`;
          const marker = head.message_id || `${head.message_created_at || ''}:${head.message_text || ''}`;
          const previousMarker = notificationHeadsRef.current.get(conversationKey);
          notificationHeadsRef.current.set(conversationKey, marker);

          if (
            previousMarker
            && previousMarker !== marker
            && head.sender_id
            && head.sender_id !== head.page_id
          ) {
            triggerNewMessageNotification({
              pageId: head.page_id,
              pageName: head.page_name,
              convId: head.conversation_id,
              customerName: head.customer_name,
              messageId: head.message_id || marker,
              messageText: head.message_text,
              avatarUrl: head.avatar_url,
              playSound: true
            });
          }
        });
      });
    } finally {
      notificationMonitorRunningRef.current = false;
    }
  }, [fbToken]);

  useEffect(() => {
    if (!fbToken) return undefined;

    let stopped = false;
    let timer = null;
    const scheduleNextMonitor = () => {
      if (stopped) return;
      clearTimeout(timer);
      const delay = document.hidden ? BACKGROUND_SYNC_MS : FOREGROUND_OTHER_PAGES_SYNC_MS;
      timer = setTimeout(runMonitor, delay);
    };
    const runMonitor = async () => {
      if (!navigator.onLine) {
        scheduleNextMonitor();
        return;
      }
      if (!document.hidden && Date.now() - lastNotificationMonitorAtRef.current < FOREGROUND_EVENT_COOLDOWN_MS) {
        scheduleNextMonitor();
        return;
      }
      lastNotificationMonitorAtRef.current = Date.now();
      try {
        const cachedPages = JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]');
        const currentVisible = JSON.parse(localStorage.getItem('metapost_visible_page_ids') || '[]');
        const enabledPages = currentVisible.length > 0
          ? cachedPages.filter(page => currentVisible.includes(page.id))
          : cachedPages;
        const currentSelectedPageId = localStorage.getItem('metapost_selected_page_id') || 'all';
        // A lightweight Page-head scan keeps foreground notifications timely
        // even when the full all-Page Inbox refresh is intentionally slower.
        const pagesOutsideVisibleList = currentSelectedPageId === 'all'
          ? enabledPages
          : enabledPages.filter(page => page.id !== currentSelectedPageId);
        if (pagesOutsideVisibleList.length > 0) {
          await monitorAllPageNotifications(pagesOutsideVisibleList);
        }
      } catch {
        // The next successful Page cache refresh will restore monitoring.
      } finally {
        scheduleNextMonitor();
      }
    };

    // The selected Page is already refreshed by the visible Inbox request.
    // Delay the first cross-Page fallback scan so opening/F5 never launches a
    // second burst of Graph requests before the operator can use the screen.
    scheduleNextMonitor();
    const handleForegroundMonitor = () => {
      if (!document.hidden) runMonitor();
    };
    window.addEventListener('focus', handleForegroundMonitor);
    window.addEventListener('online', handleForegroundMonitor);
    document.addEventListener('visibilitychange', handleForegroundMonitor);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', handleForegroundMonitor);
      window.removeEventListener('online', handleForegroundMonitor);
      document.removeEventListener('visibilitychange', handleForegroundMonitor);
    };
  }, [fbToken, monitorAllPageNotifications]);

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

  // Mark only loaded, eligible unread conversations. Each item must be
  // confirmed by Meta and still point at the same latest message before the UI
  // clears it. Unloaded Pages and messages arriving during the request remain.
  const handleMarkAllAsRead = async () => {
    if (isMarkingRead) return;
    setIsMarkingRead(true);
    setReadActionNotice(null);
    const unreadSnapshot = conversationsRef.current.filter(conversation => Number(conversation.unread_count || 0) > 0);
    const eligible = unreadSnapshot.filter(canMarkConversationSeen);
    const candidates = eligible.map(createReadCandidate);

    if (candidates.length === 0) {
      setUnreadSummary(prev => prev ? {
        ...prev,
        readNotice: {
          tone: 'warning',
          text: unreadSnapshot.length > 0
            ? 'Các tin đang tải chưa đủ điều kiện để Meta xác nhận đã đọc.'
            : 'Không có tin chưa đọc trong danh sách đang tải.'
        }
      } : prev);
      setReadActionNotice({
        tone: 'warning',
        text: unreadSnapshot.length > 0
          ? `Meta chưa cho app đánh dấu ${unreadSnapshot.length} tin này là đã đọc (thường do tin đã quá thời hạn xử lý hoặc thiếu thông tin người gửi). Dấu mới vẫn được giữ nguyên.`
          : 'Không có tin chưa đọc trong danh sách đang tải.'
      });
      setIsMarkingRead(false);
      return;
    }

    const eligibleIds = new Set(candidates.map(candidate => candidate.conversationId));
    setConversations(prev => {
      const next = prev.map(conversation => (
        eligibleIds.has(String(conversation.fb_conversation_id))
          ? { ...conversation, read_sync_state: 'pending' }
          : conversation
      ));
      conversationsRef.current = next;
      return next;
    });

    const results = await runInChunks(
      eligible,
      conversation => markConversationAsRead(
        conversation.customer_psid,
        conversation.page_token || fbToken,
        conversation.fb_conversation_id
      ),
      3,
      100
    );
    const confirmed = collectConfirmedReadCandidates(candidates, results);
    const applied = filterCurrentReadCandidates(conversationsRef.current, confirmed);
    const confirmedIds = new Set(applied.map(candidate => candidate.conversationId));
    const nextConversations = applyConfirmedReadsToConversations(
      conversationsRef.current.map(conversation => (
        eligibleIds.has(String(conversation.fb_conversation_id))
        && !confirmedIds.has(String(conversation.fb_conversation_id))
          ? { ...conversation, read_sync_state: 'unconfirmed' }
          : conversation
      )),
      applied
    );
    persistConfirmedReadsToInboxCaches(localStorage, applied);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    setUnreadSummary(prev => {
      const updated = applyConfirmedReadsToSummary(prev, applied);
      if (!updated) return updated;
      const unconfirmedCount = candidates.length - confirmed.length;
      const changedDuringSync = confirmed.length - applied.length;
      const skippedCount = unreadSnapshot.length - candidates.length;
      return {
        ...updated,
        readNotice: {
          tone: unconfirmedCount || changedDuringSync || skippedCount ? 'warning' : 'success',
          text: `Meta xác nhận ${applied.length}/${unreadSnapshot.length} tin đang tải.${
            changedDuringSync ? ` Giữ lại ${changedDuringSync} tin đã có cập nhật mới.` : ''
          }${unconfirmedCount || skippedCount ? ' Các tin còn lại chưa được Meta xác nhận nên vẫn giữ dấu mới, kể cả sau F5.' : ''}`
        }
      };
    });
    const unconfirmedCount = candidates.length - confirmed.length;
    const changedDuringSync = confirmed.length - applied.length;
    const skippedCount = unreadSnapshot.length - candidates.length;
    setReadActionNotice({
      tone: unconfirmedCount || changedDuringSync || skippedCount ? 'warning' : 'success',
      text: `Meta xác nhận ${applied.length}/${unreadSnapshot.length} tin đang tải.${
        changedDuringSync ? ` Giữ lại ${changedDuringSync} tin đã có cập nhật mới.` : ''
      }${unconfirmedCount || skippedCount ? ' Các tin còn lại chưa được Meta xác nhận nên vẫn giữ dấu mới, kể cả sau F5.' : ''}`
    });
    setIsMarkingRead(false);
  };

  // Initial Boot
  useEffect(() => {
    let stopped = false;
    let timer = null;
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

    // Adaptive list polling. A single selected Page stays responsive while the
    // expensive all-Page view refreshes less often. Cross-tab locking prevents
    // every open tab/shortcut from repeating the same Graph requests.
    const scheduleNextListSync = () => {
      if (stopped) return;
      clearTimeout(timer);
      const currentSelectedPageId = localStorage.getItem('metapost_selected_page_id') || 'all';
      const delay = document.hidden
        ? BACKGROUND_SYNC_MS
        : currentSelectedPageId === 'all'
          ? FOREGROUND_ALL_PAGES_SYNC_MS
          : FOREGROUND_SELECTED_PAGE_SYNC_MS;
      timer = setTimeout(runListSync, delay);
    };
    const runListSync = async () => {
      if (!document.hidden && Date.now() - lastListSyncAtRef.current < FOREGROUND_EVENT_COOLDOWN_MS) {
        scheduleNextListSync();
        return;
      }
      if (fbToken && navigator.onLine) {
        try {
          const cachedPages = JSON.parse(localStorage.getItem('metapost_pages_cache') || '[]');
          if (cachedPages.length > 0) {
            const currentVisible = JSON.parse(localStorage.getItem('metapost_visible_page_ids') || '[]');
            const active = currentVisible.length > 0
              ? cachedPages.filter(p => currentVisible.includes(p.id))
              : cachedPages;
            const currentSelectedPageId = localStorage.getItem('metapost_selected_page_id') || 'all';
            const targetPages = currentSelectedPageId === 'all'
              ? active
              : active.filter(page => page.id === currentSelectedPageId);
            lastListSyncAtRef.current = Date.now();
            await runWithCrossTabSyncLock(
              `conversation-list-${currentSelectedPageId}`,
              () => loadAllConversations(targetPages, true)
            );
          }
        } catch {
          // Transient network/storage errors must not erase Page preferences.
        }
      }
      scheduleNextListSync();
    };

    const handleForegroundListSync = () => {
      if (!document.hidden) runListSync();
    };
    scheduleNextListSync();
    window.addEventListener('focus', handleForegroundListSync);
    window.addEventListener('online', handleForegroundListSync);
    document.addEventListener('visibilitychange', handleForegroundListSync);

    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', handleForegroundListSync);
      window.removeEventListener('online', handleForegroundListSync);
      document.removeEventListener('visibilitychange', handleForegroundListSync);
    };
  }, [fbToken]);

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden relative">
      {/* 1. Left Sidebar: Channels & Filtered Conversations (hidden on mobile if chat is open) */}
      <div className={`w-full min-h-0 md:w-80 lg:w-96 flex-shrink-0 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
        {/* Global Unread Dashboard Banner */}
        <UnreadBanner
          unreadSummary={unreadSummary}
          isScanning={isUnreadScanning}
          onPageClick={handleUnreadPageClick}
          onMarkAllAsRead={handleMarkAllAsRead}
          isMarkingRead={isMarkingRead}
        />
        <ConversationSidebar
          pages={activePages.length > 0 ? activePages : pages}
          allPages={pages}
          visiblePageIds={visiblePageIds}
          onOpenPageManager={() => setIsPageManagerOpen(true)}
          selectedPageId={selectedPageId}
          onSelectPage={(pageId) => {
            setSelectedPageId(pageId);
            setConversationLoadError(null);
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
          isMarkingRead={isMarkingRead}
          readActionNotice={readActionNotice}
          onOpenTokenModal={onOpenTokenModal}
          onLoadMore={handleLoadMoreConversations}
          isLoadingMore={isLoadingMore}
          hasMore={hasMoreOlder}
          loadError={conversationLoadError}
        />
      </div>

      {/* 2. Middle: Chat Thread (Fullscreen on Mobile, standard column on Desktop) */}
        <div className={`flex-1 min-h-0 overflow-hidden flex flex-col min-w-0 ${mobileView === 'list' ? 'hidden md:flex' : 'fixed inset-0 z-40 bg-white dark:bg-slate-950 flex flex-col md:relative md:inset-auto md:z-auto md:flex'}`}>
        <ChatThread
          conversation={activeConversation}
          messages={messages}
          isLoadingMessages={isLoadingMessages}
          messageLoadError={messageLoadError}
          onRetryMessages={() => activeConversation && handleSelectConversation(activeConversation, false)}
          onSendMessage={handleSendMessage}
          onUpdateStatus={handleUpdateStatus}
          onToggleStar={handleToggleStar}
          onOpenMediaModal={setActiveMediaModal}
          onBackToList={returnToMobileConversationList}
          onToggleProfilePanel={() => setIsProfilePanelOpenOnMobile(!isProfilePanelOpenOnMobile)}
          quickReplies={quickReplies}
          onOpenQuickRepliesModal={() => setIsQuickRepliesOpen(true)}
          onOpenVietQRModal={() => setIsVietQROpen(true)}
          onLoadOlderMessages={handleLoadOlderMessages}
          hasMoreOlderMessages={hasMoreMessages}
          isLoadingOlderMessages={isLoadingOlderMessages}
        />
      </div>

      {/* 3. Right: Meta Business CRM Profile Panel (Desktop: side column, Mobile: slide-over drawer) */}
      {activeConversation && (
        <div className={`
          ${isProfilePanelOpenOnMobile ? 'fixed inset-0 z-50 w-full sm:inset-y-0 sm:left-auto sm:right-0 sm:w-96 shadow-2xl flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-right duration-200' : 'hidden xl:flex w-80 lg:w-88 flex-shrink-0 flex-col'}
        `}>
          {isProfilePanelOpenOnMobile && (
            <div className="sticky top-0 z-10 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur flex items-center justify-between xl:hidden">
              <span className="font-bold text-sm">Hồ sơ khách hàng</span>
              <button
                onClick={() => setIsProfilePanelOpenOnMobile(false)}
                className="min-h-10 px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800"
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
            onUpdateLeadStage={handleUpdateLeadStage}
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
          className="fixed inset-0 bg-black/40 z-40 xl:hidden"
        />
      )}

      {/* Modals */}
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

      {isPageManagerOpen && (
        <PageManagerModal
          allPages={pages}
          visiblePageIds={visiblePageIds}
          onSaveVisiblePages={(newIds) => {
            setVisiblePageIds(newIds);
            localStorage.setItem('metapost_visible_page_ids', JSON.stringify(newIds));
            window.dispatchEvent(new CustomEvent(PUSH_PAGE_SELECTION_CHANGED_EVENT, {
              detail: { pageIds: newIds }
            }));
          }}
          onClose={() => setIsPageManagerOpen(false)}
        />
      )}
    </div>
  );
}
