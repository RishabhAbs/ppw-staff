// Client-side image compression — runs the moment a user picks an image so the
// payload is already tiny by Save time. This mirrors the server's sharp transform
// (resize to max 800px wide, WebP quality ~0.75) so quality is unchanged, but it
// shrinks a 3–8 MB phone photo to ~40–80 KB BEFORE it leaves the device.
//
// Why this matters: the app used to send raw full-size images in one multipart
// request. A single image sometimes squeaked under nginx's body limit, but a bulk
// save of 3–4 images blew past it and 413'd at the proxy — failing on every device
// (web, laptop, Android). Compressing on select keeps the whole batch well under
// any limit and makes uploads fast. Works everywhere via the canvas API (no native
// plugin), so web / laptop / Android WebView all behave identically.

const MAX_WIDTH = 800; // matches backend sharp().resize({ width: 800 })
const QUALITY = 0.75; // matches backend .webp({ quality: 75 })

export interface CompressResult {
  file: File;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

/**
 * Compress an image File to a downscaled WebP. If anything fails (decode/encode
 * unsupported on an old WebView, or the result is somehow larger), the original
 * file is returned so the user is never blocked — the server still re-compresses
 * as a backstop.
 */
export async function compressImage(file: File): Promise<CompressResult> {
  const originalSize = file.size;

  // Non-images (shouldn't happen for image slots) pass through untouched.
  if (!file.type.startsWith('image/')) {
    return { file, width: 0, height: 0, originalSize, compressedSize: originalSize };
  }

  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

    const blob = await canvasToBlob(canvas, 'image/webp', QUALITY);
    // If WebP isn't supported the browser may fall back to PNG (bigger). In that
    // rare case, keep whichever is smaller — never send something larger.
    if (!blob || blob.size >= originalSize) {
      return { file, width, height, originalSize, compressedSize: originalSize };
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    const compressed = new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
    return { file: compressed, width, height, originalSize, compressedSize: compressed.size };
  } catch {
    // Any failure → fall back to the original; the server compresses it anyway.
    return { file, width: 0, height: 0, originalSize, compressedSize: originalSize };
  }
}

// Prefer createImageBitmap (fast, off-thread where supported); fall back to an
// <img> + object URL for older Android WebViews that lack it.
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> path */
    }
  }
  return await loadViaImgElement(file);
}

function loadViaImgElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), type, quality);
    } else {
      // Very old WebView fallback: dataURL → Blob.
      try {
        const dataUrl = canvas.toDataURL(type, quality);
        const [meta, b64] = dataUrl.split(',');
        const mime = /:(.*?);/.exec(meta)?.[1] || type;
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: mime }));
      } catch {
        resolve(null);
      }
    }
  });
}
