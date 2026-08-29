export const MAX_POST_PHOTOS = 50;
export const STABLE_POST_PHOTOS = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_RAW_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MIN_SCHEDULE_MINUTES = 10;
export const MAX_SCHEDULE_DAYS = 30;

export function parseStoredArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function filterVisiblePages(allPages, storedVisibleIds) {
  const pages = Array.isArray(allPages) ? allPages : [];
  const visibleIds = Array.isArray(storedVisibleIds) ? storedVisibleIds : [];
  if (visibleIds.length === 0) return pages;
  const allowed = new Set(visibleIds.map(String));
  return pages.filter(page => allowed.has(String(page.id)));
}

export function validatePostDraft({
  selectedPageIds = [],
  postType = 'photo',
  postContent = '',
  postLink = '',
  mediaFiles = [],
  isScheduled = false,
  scheduleTime = '',
  now = Date.now()
}) {
  if (selectedPageIds.length === 0) return 'Vui lòng chọn ít nhất 1 Fanpage để đăng bài.';
  if (!postContent.trim() && mediaFiles.length === 0 && !postLink.trim()) {
    return 'Vui lòng nhập nội dung bài viết hoặc chọn ảnh/video đính kèm.';
  }

  if (postLink.trim()) {
    try {
      const url = new URL(postLink.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    } catch {
      return 'Liên kết phải là URL đầy đủ bắt đầu bằng http:// hoặc https://.';
    }
  }

  if (postType === 'photo') {
    if (mediaFiles.some(file => !file.type?.startsWith('image/'))) return 'Bài ảnh chỉ nhận tệp hình ảnh.';
    if (mediaFiles.length > MAX_POST_PHOTOS) return `Chế độ thử nghiệm nhận tối đa ${MAX_POST_PHOTOS} ảnh mỗi bài.`;
  }

  if (postType === 'video') {
    if (mediaFiles.length !== 1 || !mediaFiles[0]?.type?.startsWith('video/')) {
      return 'Bài video cần đúng 1 tệp video.';
    }
  }

  if (isScheduled) {
    const scheduledAt = new Date(scheduleTime).getTime();
    if (!scheduleTime || !Number.isFinite(scheduledAt)) return 'Vui lòng chọn ngày giờ đăng hợp lệ.';
    const minTime = now + MIN_SCHEDULE_MINUTES * 60 * 1000;
    const maxTime = now + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000;
    if (scheduledAt < minTime) return `Giờ hẹn phải cách hiện tại ít nhất ${MIN_SCHEDULE_MINUTES} phút.`;
    if (scheduledAt > maxTime) return `Chỉ nên hẹn trong vòng ${MAX_SCHEDULE_DAYS} ngày để Meta xử lý ổn định.`;
  }

  return '';
}
