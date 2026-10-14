import type { DollApi } from './api';
import type { CutoutResult } from './cutout';

export type { CutoutResult } from './cutout';

const MAX_SIDE = 640;
const TOLERANCE = 46;

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the photo."));
    img.src = uri;
  });
}

/**
 * Browser version (used by the web demo): flood-fills the background in from the photo's edges
 * and makes it transparent. Works for plushies on a fairly plain background.
 */
export async function cutOutPlushie(uri: string, _api?: DollApi): Promise<CutoutResult> {
  const img = await loadImage(uri);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cutout is not supported in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Breadth-first fill from every border pixel across colors close to where the fill started.
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const seedColor = new Int32Array(w * h * 3);
  let head = 0;
  let tail = 0;
  const push = (i: number, r: number, g: number, b: number) => {
    bg[i] = 1;
    queue[tail++] = i;
    seedColor[i * 3] = r;
    seedColor[i * 3 + 1] = g;
    seedColor[i * 3 + 2] = b;
  };
  const near = (i: number, r: number, g: number, b: number) => {
    const dr = px[i * 4] - r;
    const dg = px[i * 4 + 1] - g;
    const db = px[i * 4 + 2] - b;
    return dr * dr + dg * dg + db * db < TOLERANCE * TOLERANCE;
  };
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = y * w + x;
      if (!bg[i]) push(i, px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = y * w + x;
      if (!bg[i]) push(i, px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    const r = seedColor[i * 3];
    const g = seedColor[i * 3 + 1];
    const b = seedColor[i * 3 + 2];
    const neighbors = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const n of neighbors) {
      if (n >= 0 && !bg[n] && near(n, r, g, b)) push(n, r, g, b);
    }
  }

  let kept = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) {
        px[i * 4 + 3] = 0;
        continue;
      }
      kept++;
      // Soften the edge: subject pixels touching the background get half opacity.
      const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
      if (edge) px[i * 4 + 3] = Math.min(px[i * 4 + 3], 140);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const coverage = kept / (w * h);
  if (coverage < 0.03 || coverage > 0.97) throw new Error("Couldn't find the plushie against this background.");
  ctx.putImageData(data, 0, 0);

  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')?.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return { uri: out.toDataURL('image/png'), method: 'device' };
}
