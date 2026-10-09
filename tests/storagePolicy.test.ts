import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicatedStorage, persistedSnapshot, retainItems, serializedBytes, MAX_PERSISTED_BYTES } from '../src/stores/storagePolicy.ts';
import type { AppSettings, ClipboardItem } from '../src/types';

const now = Date.now();
const settings: AppSettings = { maxHistoryItems: 100, autoCleanup: true, cleanupDays: 30, globalShortcut: 'Win', startAtLogin: false, showPreview: true };
const item = (id: number, extra: Partial<ClipboardItem> = {}): ClipboardItem => ({ id, content: `record ${id}`, contentType: 'text' as ClipboardItem['contentType'], createdAt: now - id * 1000, updatedAt: now, isFavorite: false, useWeight: 0, tags: [], ...extra });
const image = 'data:image/png;base64,' + 'A'.repeat(400 * 1024);

test('aggregate image history stays under the full serialized storage budget', () => {
  const items = Array.from({ length: 40 }, (_, i) => item(i, { imagePath: image }));
  assert.ok(serializedBytes({ state: { items, settings }, version: 0 }) > MAX_PERSISTED_BYTES * 4);
  const result = persistedSnapshot(items, settings);
  assert.ok(serializedBytes({ state: result, version: 0 }) <= MAX_PERSISTED_BYTES);
  assert.equal(result.items.length, 40);
  assert.equal(items.every(i => i.imagePath === image), true, 'live image previews must not be mutated');
});

test('favorite images get priority and metadata survives the budget reduction', () => {
  const items = Array.from({ length: 15 }, (_, i) => item(i, { imagePath: image, isFavorite: i === 14, note: '重要备注' }));
  const result = persistedSnapshot(items, settings);
  assert.equal(result.items.find(i => i.id === 14)?.imagePath, image);
  assert.equal(result.items.find(i => i.id === 13)?.imagePath, undefined);
  assert.equal(result.items.every(i => i.note === '重要备注'), true);
  assert.equal(result.items[0].imagePath, image, 'newest ordinary image has priority over old ordinary images');
});

test('legacy history gets bounded immediately, keeping an old favorite', () => {
  const items = Array.from({ length: 250 }, (_, i) => item(i));
  items.push(item(999, { isFavorite: true, createdAt: 1 }));
  const result = retainItems(items, { ...settings, maxHistoryItems: 10 }, now);
  assert.equal(result.length, 11);
  assert.ok(result.some(i => i.id === 999));
  assert.deepEqual(result.filter(i => !i.isFavorite).map(i => i.id), Array.from({ length: 10 }, (_, i) => i));
});

test('age cleanup respects the switch and keeps favorites', () => {
  const old = item(1, { createdAt: now - 40 * 86400000 });
  const favorite = item(2, { ...old, id: 2, isFavorite: true });
  assert.deepEqual(retainItems([old, favorite], settings, now).map(i => i.id), [2]);
  assert.equal(retainItems([old, favorite], { ...settings, autoCleanup: false }, now).length, 2);
});

test('UTF-16 JSON budget includes escaping, base64 and envelope overhead', () => {
  const items = Array.from({ length: 100 }, (_, i) => item(i, { content: '中\\"'.repeat(4000), note: '备注'.repeat(100), tags: Array(32).fill('标签'.repeat(32)), imagePath: image }));
  const result = persistedSnapshot(items, settings);
  assert.ok(serializedBytes({ state: result, version: 0 }) <= MAX_PERSISTED_BYTES);
});

test('unchanged snapshots only write once, while real content changes persist', () => {
  const values = new Map<string, string>();
  let writes = 0;
  const storage = deduplicatedStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); writes++; }, removeItem: key => { values.delete(key); } });
  const first = JSON.stringify({ state: persistedSnapshot([item(1)], settings), version: 0 });
  for (let i = 0; i < 100; i++) storage.setItem('clipjar-storage', first);
  assert.equal(writes, 1);
  storage.setItem('clipjar-storage', JSON.stringify({ state: persistedSnapshot([item(2)], settings), version: 0 }));
  assert.equal(writes, 2);
  storage.removeItem('clipjar-storage');
  storage.setItem('clipjar-storage', first);
  assert.equal(writes, 3);
});

test('rehydrated snapshot is not rewritten when its value is unchanged', () => {
  let writes = 0;
  const storage = deduplicatedStorage({ getItem: () => 'existing snapshot', setItem: () => { writes++; }, removeItem: () => {} });
  assert.equal(storage.getItem('clipjar-storage'), 'existing snapshot');
  storage.setItem('clipjar-storage', 'existing snapshot');
  assert.equal(writes, 0);
});

test('a failed storage write is not cached and can be retried', () => {
  let attempts = 0;
  const storage = deduplicatedStorage({ getItem: () => null, setItem: () => { if (++attempts === 1) throw new Error('quota exceeded'); }, removeItem: () => {} });
  assert.throws(() => storage.setItem('clipjar-storage', 'value'), /quota exceeded/);
  storage.setItem('clipjar-storage', 'value');
  storage.setItem('clipjar-storage', 'value');
  assert.equal(attempts, 2);
});


test('oversized text is rejected instead of exceeding the quota or silently deleting favorite content', () => {
  const items = Array.from({ length: 100 }, (_, i) => item(i, { content: '\u0000'.repeat(10000), isFavorite: true }));
  assert.throws(() => persistedSnapshot(items, settings), /存储上限/);
  assert.equal(items.every(i => i.content.length === 10000), true);
});
