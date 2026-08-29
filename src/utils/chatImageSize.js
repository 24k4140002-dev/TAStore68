export function getChatImageSize(imageData = {}) {
  const width = Number(imageData?.width);
  const height = Number(imageData?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    const scale = Math.min(280 / width, 288 / height, 1);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  // Reserve a stable frame even for old cached messages without dimensions.
  return { width: 240, height: 240 };
}
