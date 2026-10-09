import type { AppSettings, ClipboardItem } from '../types';

// Leave room under the WebView's common 5 MiB localStorage quota.
// Count UTF-16 code units, including JSON/base64 overhead, rather than decoded images.
export const MAX_PERSISTED_BYTES = 4 * 1024 * 1024;
export const MAX_PERSISTED_IMAGE_BYTES = 500 * 1024;
export const MAX_STORED_ITEMS = 100;
const MAX_CONTENT_LENGTH = 10000;

export function serializedBytes(value: unknown): number {
  return JSON.stringify(value).length * 2;
}

export function retainItems(items: ClipboardItem[], settings: AppSettings, now = Date.now()): ClipboardItem[] {
  const cutoff = now - settings.cleanupDays * 86400000;
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const favorites = sorted.filter(item => item.isFavorite);
  const normal = sorted.filter(item => !item.isFavorite && (!settings.autoCleanup || item.createdAt > cutoff));
  return [...favorites, ...normal.slice(0, settings.maxHistoryItems)]
    .slice(0, MAX_STORED_ITEMS)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function persistedSnapshot(items: ClipboardItem[], settings: AppSettings) {
  const saved = retainItems(items, settings).map(item => {
    const encodedImageLength = item.imagePath?.split(',')[1]?.length ?? 0;
    return {
      ...item,
      content: item.content.slice(0, MAX_CONTENT_LENGTH),
      note: item.note?.slice(0, 200),
      tags: item.tags.slice(0, 32).map(tag => tag.slice(0, 64)),
      sourceApp: item.sourceApp?.slice(0, 200),
      imagePath: encodedImageLength * 3 / 4 > MAX_PERSISTED_IMAGE_BYTES ? undefined : item.imagePath,
    };
  });
  const snapshot = { items: saved, settings };
  // Include Zustand's persistence envelope in the budget.
  let bytes = serializedBytes({ state: snapshot, version: 0 });
  // Keep all retained text/notes and favorites. Remove older image payloads first;
  // ordinary history images go before favorite images.
  const candidates = saved.filter(item => item.imagePath).sort((a, b) =>
    Number(a.isFavorite) - Number(b.isFavorite) || a.createdAt - b.createdAt
  );
  for (const item of candidates) {
    if (bytes <= MAX_PERSISTED_BYTES) break;
    const before = serializedBytes(item);
    item.imagePath = undefined;
    bytes -= before - serializedBytes(item);
  }
  if (bytes > MAX_PERSISTED_BYTES) {
    // Never silently delete text or favorite notes to make a snapshot fit.
    // Preserve the previous saved snapshot if unusually large metadata cannot fit.
    throw new Error('剪贴记录文字或备注超过存储上限，请减少记录数量后重试。');
  }
  return snapshot;
}

interface StringStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

/** Avoid rewriting the entire history for selection/search or other unchanged snapshots. */
export function deduplicatedStorage(storage: StringStorage): StringStorage {
  const lastWritten = new Map<string, string>();
  return {
    getItem(name) {
      const value = storage.getItem(name);
      if (value === null) lastWritten.delete(name);
      else lastWritten.set(name, value);
      return value;
    },
    setItem(name, value) {
      if (lastWritten.get(name) === value) return;
      // Cache only successful writes so a failed write can be retried.
      storage.setItem(name, value);
      lastWritten.set(name, value);
    },
    removeItem(name) {
      storage.removeItem(name);
      lastWritten.delete(name);
    },
  };
}
