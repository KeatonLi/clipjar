import type { ClipboardItem } from '../types';

/** Browser preview follows the same merge policy; native history is owned by Rust. */
export function mergeClipboardItem(
  items: ClipboardItem[],
  incoming: ClipboardItem
): ClipboardItem[] {
  const existing = items.find(
    (item) =>
      item.contentType === incoming.contentType &&
      item.content === incoming.content &&
      item.imagePath === incoming.imagePath
  );
  const item = existing
    ? { ...existing, createdAt: incoming.createdAt, updatedAt: incoming.updatedAt }
    : incoming;
  return [item, ...items.filter((entry) => entry.id !== item.id)];
}
export function capturePaused(until: number | null, now = Date.now()) {
  return until !== null && (until === 0 || until > now);
}
export function snapshotIsCurrent(revision: number, current: number) {
  return Number.isSafeInteger(revision) && revision >= current;
}
