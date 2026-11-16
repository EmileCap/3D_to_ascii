export function sobel(pixels, width, height, threshold = 0.18) {
  const output = new Float32Array(width * height);
  const luminance = (x, y) => {
    x = Math.max(0, Math.min(width - 1, x));
    y = Math.max(0, Math.min(height - 1, y));
    const i = (y * width + x) * 4;
    return (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
  };
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx = -luminance(x - 1, y - 1) + luminance(x + 1, y - 1) - 2 * luminance(x - 1, y) + 2 * luminance(x + 1, y) - luminance(x - 1, y + 1) + luminance(x + 1, y + 1);
      const gy = -luminance(x - 1, y - 1) - 2 * luminance(x, y - 1) - luminance(x + 1, y - 1) + luminance(x - 1, y + 1) + 2 * luminance(x, y + 1) + luminance(x + 1, y + 1);
      output[y * width + x] = Math.hypot(gx, gy) >= threshold ? Math.atan2(gy, gx) : 0;
    }
  }
  return output;
}

export function edgeGlyph(angle) {
  const absolute = Math.abs(angle);
  if (absolute < 0.35 || absolute > 2.8) return '-';
  if (absolute < 1.2) return '/';
  if (absolute < 1.95) return '|';
  return String.fromCharCode(92);
}
