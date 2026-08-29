export const MOBILE_SWIPE_BACK_EDGE_PX = 32;
export const MOBILE_SWIPE_BACK_TRIGGER_PX = 72;
export const MOBILE_SWIPE_BACK_MAX_OFFSET_PX = 112;

export function canStartMobileSwipeBack({ startX, viewportWidth, touchCount = 1 }) {
  return touchCount === 1
    && viewportWidth < 768
    && startX >= 0
    && startX <= MOBILE_SWIPE_BACK_EDGE_PX;
}

export function getMobileSwipeBackOffset(startPoint, currentPoint) {
  if (!startPoint || !currentPoint) return 0;
  const deltaX = currentPoint.x - startPoint.x;
  const deltaY = currentPoint.y - startPoint.y;
  if (deltaX <= 0 || Math.abs(deltaY) > Math.max(18, deltaX * 0.9)) return 0;
  return Math.min(deltaX, MOBILE_SWIPE_BACK_MAX_OFFSET_PX);
}

export function shouldCompleteMobileSwipeBack(startPoint, endPoint) {
  if (!startPoint || !endPoint) return false;
  const deltaX = endPoint.x - startPoint.x;
  const deltaY = Math.abs(endPoint.y - startPoint.y);
  return deltaX >= MOBILE_SWIPE_BACK_TRIGGER_PX && deltaX > deltaY * 1.25;
}
