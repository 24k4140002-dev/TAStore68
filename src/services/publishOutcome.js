const TRANSIENT_META_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export function createPublishSnapshot({
  postType,
  postText,
  postLink,
  mediaFiles,
  isScheduled,
  scheduleTimestamp
}) {
  const files = Object.freeze([...(Array.isArray(mediaFiles) ? mediaFiles : [])]);
  return Object.freeze({
    postType: String(postType || 'text'),
    postText: String(postText || ''),
    postLink: String(postLink || ''),
    mediaFiles: files,
    isScheduled: Boolean(isScheduled),
    scheduleTimestamp: isScheduled && Number.isFinite(Number(scheduleTimestamp))
      ? Number(scheduleTimestamp)
      : null
  });
}

export function getConfirmedPostId(response) {
  const id = response?.post_id || response?.id;
  if (typeof id === 'string' && id.trim()) return id;
  throw Object.assign(new Error('Meta chưa trả mã bài đăng. Cần kiểm tra Page trước khi thử lại để tránh đăng trùng.'), {
    outcomeUnknown: true, publishStage: 'publish'
  });
}

function compact(value, maxLength = 360) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function classifyMetaPublishError(error = {}) {
  const code = Number.isFinite(Number(error.code)) ? Number(error.code) : null;
  const subcode = Number.isFinite(Number(error.subcode)) ? Number(error.subcode) : null;
  const httpStatus = Number.isFinite(Number(error.httpStatus)) ? Number(error.httpStatus) : null;
  const stage = error.publishStage || 'publish';
  const message = compact(
    error.userMessage || error.facebookMessage || error.message || 'Meta từ chối yêu cầu đăng bài.'
  );

  let hint = 'Mở chi tiết Page trên Meta và kiểm tra quyền đăng, định dạng nội dung hoặc tệp.';
  const outcomeUnknown = Boolean(error.outcomeUnknown || ((!code || httpStatus >= 500) && /network|failed to fetch|quá chậm|timeout|kết nối/i.test(message)));
  if (outcomeUnknown) {
    hint = 'Chưa biết Meta đã đăng hay chưa. Mở Page kiểm tra bài gần nhất trước khi thử lại để tránh đăng trùng.';
  } else if (code === 190) {
    hint = 'Token của Page đã hết hạn hoặc không còn hợp lệ. Hãy kết nối lại Facebook rồi thử Page này.';
  } else if (code === 10 || code === 200) {
    hint = 'Ứng dụng hoặc tài khoản chưa có quyền đăng lên Page này. Kiểm tra quyền Page và nhiệm vụ được cấp.';
  } else if (TRANSIENT_META_CODES.has(code)) {
    hint = 'Meta đang giới hạn hoặc tạm lỗi. Không bấm liên tục; chờ vài phút rồi chỉ thử lại Page này.';
  } else if (code === 100 || code === 324) {
    hint = 'Meta không chấp nhận một tham số hoặc tệp ảnh/video của Page này. Kiểm tra định dạng, dung lượng và số ảnh.';
  } else if (code === 368 || code === 506) {
    hint = 'Meta có thể đang chặn nội dung hoặc nhận diện bài trùng. Không nên đổi ký tự để lách; hãy kiểm tra nội dung trong Meta.';
  } else if (/network|failed to fetch|quá chậm|timeout|kết nối/i.test(message)) {
    hint = 'Kết nối bị gián đoạn nên kết quả có thể chưa chắc chắn. Kiểm tra Page trước khi thử lại để tránh đăng trùng.';
  }

  const retryable = Boolean(
    error.transient
    || TRANSIENT_META_CODES.has(code)
    || (httpStatus !== null && httpStatus >= 500)
    || /network|failed to fetch|quá chậm|timeout|kết nối/i.test(message)
  );
  const reference = code === null
    ? (httpStatus ? `HTTP ${httpStatus}` : 'Lỗi kết nối')
    : `Meta #${code}${subcode ? `/${subcode}` : ''}`;

  return {
    code,
    subcode,
    httpStatus,
    stage,
    mediaIndex: Number(error.mediaIndex || 0) || null,
    message,
    hint,
    reference,
    retryable: retryable || outcomeUnknown,
    outcomeUnknown
  };
}
