import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIPBOARD_STORAGE_KEY, completeLegacyMigration, readLegacySnapshot } from '../src/stores/legacyStorage.ts';
import type { AppSettings, ClipboardItem } from '../src/types';

const settings: AppSettings = { maxHistoryItems: 100, autoCleanup: true, cleanupDays: 30, globalShortcut: 'Win', startAtLogin: false, showPreview: true };
const item: ClipboardItem = { id: 1234.5, content: 'original\n  content', contentType: 'text' as ClipboardItem['contentType'], createdAt: 1, updatedAt: 1, isFavorite: true, useWeight: 0, tags: [], imagePath: 'data:image/png;base64,AAAA' };
function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test('migration reads original images, old timestamps and fractional IDs without retention writes', () => {
  const original = JSON.stringify({ state: { items: [item], settings }, version: 0 });
  const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: original });
  assert.deepEqual(readLegacySnapshot(storage).items, [item]);
  assert.equal(storage.getItem(CLIPBOARD_STORAGE_KEY), original);
});

test('failed or incomplete native import leaves every legacy byte untouched', () => {
  const original = JSON.stringify({ state: { items: [item], settings }, version: 0 });
  const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: original, 'clipjar-items': JSON.stringify([item]) });
  completeLegacyMigration(storage, false, settings);
  assert.equal(storage.getItem(CLIPBOARD_STORAGE_KEY), original);
  assert.ok(storage.getItem('clipjar-items'));
});

test('only a confirmed native import replaces image history with settings-only persistence', () => {
  const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: JSON.stringify({ state: { items: [item], settings }, version: 0 }), 'clipjar-items': JSON.stringify([item]) });
  completeLegacyMigration(storage, true, settings);
  assert.deepEqual(JSON.parse(storage.getItem(CLIPBOARD_STORAGE_KEY)!), { state: { settings }, version: 0 });
  assert.equal(storage.getItem('clipjar-items'), null);
});

test('a settings-envelope write failure preserves both original history sources', () => {
  const original = JSON.stringify({ state: { items: [item], settings }, version: 0 });
  const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: original, 'clipjar-items': JSON.stringify([item]) });
  const broken = { ...storage, setItem: () => { throw new Error('quota exceeded'); } };
  assert.throws(() => completeLegacyMigration(broken, true, settings), /quota/);
  assert.equal(storage.getItem(CLIPBOARD_STORAGE_KEY), original);
  assert.ok(storage.getItem('clipjar-items'));
});

test('both legacy sources merge without resurrecting duplicate records', () => {
  const other = { ...item, id: 2, content: 'other record' };
  const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: JSON.stringify({ state: { items: [item], settings }, version: 0 }), 'clipjar-items': JSON.stringify([item, other]) });
  assert.deepEqual(readLegacySnapshot(storage).items, [item, other]);
});

test('malformed history produces an actionable error while preserving the original storage', () => {
  const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: '{bad JSON' });
  assert.throws(() => readLegacySnapshot(storage), /原始数据已保留/);
  assert.equal(storage.getItem(CLIPBOARD_STORAGE_KEY), '{bad JSON');
});

test('legacy separate shortcut preference migrates over the old default setting', () => {
  const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: JSON.stringify({ state: { items: [item], settings }, version: 0 }), clipjar_shortcut_mode: 'CommandOrControl+Shift+V' });
  assert.equal(readLegacySnapshot(storage).settings.globalShortcut, 'CommandOrControl+Shift+V');
});

test('valid JSON with an invalid envelope or history structure never becomes empty migrated history', () => {
  const invalid = [
    null, [], 'history', {}, { items: [item] },
    { state: null }, { state: [] }, { state: {} },
    { state: { items: { 0: item } } }, { state: { items: null, settings } },
    { state: { items: false, settings } }, { state: { settings: null } },
    { state: { settings: {} } }, { state: { settings: { maxHistoryItems: 100 } } },
    { state: { settings }, items: [item] },
    { state: { items: [], settings }, version: 1 },
  ];
  for (const value of invalid) {
    const raw = JSON.stringify(value);
    const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: raw, 'clipjar-items': JSON.stringify([item]) });
    const original = [...storage.values];
    assert.throws(() => readLegacySnapshot(storage), /原始数据已保留/, `must reject ${raw}`);
    assert.deepEqual([...storage.values], original, 'both history sources remain byte-for-byte unchanged');
  }
});

test('non-array standalone history is rejected even when the primary envelope is valid', () => {
  for (const value of [null, {}, { items: [item] }, 'history', 42]) {
    const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: JSON.stringify({ state: { items: [item], settings }, version: 0 }), 'clipjar-items': JSON.stringify(value) });
    const original = [...storage.values];
    assert.throws(() => readLegacySnapshot(storage), /clipjar-items.*原始数据已保留/);
    assert.deepEqual([...storage.values], original);
  }
});

test('settings must have recognized fields and correct types before any migration is allowed', () => {
  const invalidSettings = [null, [], 'settings', 100, { maxHistoryItems: '100' }, { autoCleanup: 1 }, { globalShortcut: null }, { items: [item] }];
  for (const value of invalidSettings) {
    for (const key of ['clipjar-settings', CLIPBOARD_STORAGE_KEY]) {
      const raw = key === CLIPBOARD_STORAGE_KEY ? JSON.stringify({ state: { items: [item], settings: value }, version: 0 }) : JSON.stringify(value);
      const storage = memoryStorage({ [key]: raw });
      assert.throws(() => readLegacySnapshot(storage), /原始数据已保留/);
      assert.equal(storage.getItem(key), raw);
    }
  }
});

test('an explicit valid settings-only envelope remains readable after native import', () => {
  const storage = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: JSON.stringify({ state: { settings }, version: 0 }) });
  assert.deepEqual(readLegacySnapshot(storage), { items: [], settings, found: true });
});

test('explicit empty history and missing storage are distinguished from malformed data', () => {
  assert.deepEqual(readLegacySnapshot(memoryStorage({})), { items: [], settings: {}, found: false });
  assert.deepEqual(readLegacySnapshot(memoryStorage({ [CLIPBOARD_STORAGE_KEY]: JSON.stringify({ state: { items: [] }, version: 0 }) })), { items: [], settings: {}, found: true });
  assert.deepEqual(readLegacySnapshot(memoryStorage({ 'clipjar-items': '[]', 'clipjar-settings': JSON.stringify({ maxHistoryItems: 300 }) })), { items: [], settings: { maxHistoryItems: 300 }, found: true });
  const empty = memoryStorage({ [CLIPBOARD_STORAGE_KEY]: '' });
  assert.throws(() => readLegacySnapshot(empty), /原始数据已保留/);
  assert.equal(empty.getItem(CLIPBOARD_STORAGE_KEY), '');
});
