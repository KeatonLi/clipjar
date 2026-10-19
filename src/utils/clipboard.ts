import type { ClipboardItem, ImageData } from '../types';

export interface NativeImage {
  size(): Promise<{ width: number; height: number }>;
  rgba(): Promise<Uint8Array>;
  close(): Promise<void>;
}

interface MonitorOptions {
  readText(): Promise<string>;
  readImage(): Promise<NativeImage>;
  encodeImage(image: ImageData): Promise<string>;
  onText(text: string): void;
  onImage(image: { width: number; height: number; dataUrl: string }): void;
  onError(error: unknown): void;
}

const MAX_IMAGE_PIXELS = 4096 * 4096;
const MAX_BASE64_SIZE = 5 * 1024 * 1024;

/** Poll independently of window visibility; image handles always belong to this poll. */
export function createClipboardMonitor(options: MonitorOptions) {
  let stopped = false;
  let processing = false;
  let lastText = '';
  let lastImage: { width: number; height: number; rgba: Uint8Array } | null = null;

  return {
    async poll() {
      if (stopped || processing) return;
      processing = true;
      try {
        // An image-only clipboard can reject readText. Still try reading its image.
        const text = await options.readText().catch(() => '');
        if (stopped) return;
        if (text.trim() && text !== lastText) options.onText(text);
        lastText = text;

        const image = await options.readImage().catch(() => null);
        if (!image) {
          lastImage = null;
          return;
        }
        try {
          if (stopped) return;
          const { width, height } = await image.size();
          if (!width || !height || width * height > MAX_IMAGE_PIXELS || stopped) return;
          const rgba = await image.rgba();
          if (rgba.length !== width * height * 4) throw new Error('图片像素数据不完整');
          if (stopped) return;
          if (lastImage?.width === width && lastImage.height === height &&
              rgba.every((value, index) => value === lastImage!.rgba[index])) return;

          const dataUrl = await options.encodeImage({ width, height, rgba: async () => rgba.slice() });
          if (stopped || dataUrl.length > MAX_BASE64_SIZE) return;
          options.onImage({ width, height, dataUrl });
          lastImage = { width, height, rgba };
        } finally {
          await image.close();
        }
      } catch (error) {
        if (!stopped) options.onError(error);
      } finally {
        processing = false;
      }
    },
    markTextCopied(text: string) { lastText = text; },
    stop() {
      stopped = true;
      lastImage = null;
    },
  };
}

interface WriterOptions<T extends NativeImage> {
  writeText(text: string): Promise<void>;
  decodeImage(source: string): Promise<{ width: number; height: number; rgba: Uint8Array }>;
  createImage(rgba: Uint8Array, width: number, height: number): Promise<T>;
  writeImage(image: T): Promise<void>;
}

/** Copy actual pixels, including legacy JPEG snapshots, rather than their text label. */
export async function writeClipboardItem<T extends NativeImage>(item: ClipboardItem, options: WriterOptions<T>): Promise<void> {
  if (item.contentType !== 'image') {
    await options.writeText(item.content);
    return;
  }
  if (!item.imagePath) throw new Error('这条图片记录已无图片数据，无法复制。');
  const { rgba, width, height } = await options.decodeImage(item.imagePath);
  const image = await options.createImage(rgba, width, height);
  try {
    await options.writeImage(image);
  } finally {
    await image.close();
  }
}
