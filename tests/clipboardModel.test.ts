import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, queryClipboardItems, validateSnippetDraft } from '../src/stores/clipboardModel.ts';
import { retainItems } from '../src/stores/storagePolicy.ts';
import type { AppSettings, ClipboardItem } from '../src/types';

const now = Date.now();
const settings: AppSettings = { maxHistoryItems: 100, autoCleanup: true, cleanupDays: 30, globalShortcut: 'CommandOrControl+Shift+V', startAtLogin: false, showPreview: true };
const item = (id: number, extra: Partial<ClipboardItem> = {}): ClipboardItem => ({ id, content: `record ${id}`, contentType: 'text' as ClipboardItem['contentType'], createdAt: now - id * 1000, updatedAt: now - id * 1000, isFavorite: false, useWeight: 0, tags: [], ...extra });

test('search combines tab, type and multiple terms across name, content and note', () => {
  const items = [
    item(1, { title: '工作邮箱', content: 'hello@example.com', note: '客户联系', isSnippet: true }),
    item(2, { title: '工作主页', content: 'https://example.com', note: '客户联系', isSnippet: true, contentType: 'link' as ClipboardItem['contentType'] }),
    item(3, { title: '工作', note: '客户联系', isFavorite: true }),
  ];
  assert.deepEqual(queryClipboardItems(items, { tab: 'snippets', type: 'link' as ClipboardItem['contentType'], search: '  工作   客户  ' }).map(item => item.id), [2]);
  assert.deepEqual(queryClipboardItems(items, { tab: 'history', type: 'all', search: '工作 客户' }).map(item => item.id), [3]);
});

test('all matching history rows remain reachable beyond the old 50-row cap', () => {
  const items = Array.from({ length: 500 }, (_, index) => item(index));
  assert.equal(queryClipboardItems(items, { tab: 'history', type: 'all', search: '' }).length, 500);
  assert.deepEqual(queryClipboardItems(items, { tab: 'history', type: 'all', search: 'record 499' }).map(item => item.id), [499]);
});

test('favorite snippets remain discoverable in both collections and newest edits rise first', () => {
  const items = [item(1, { isSnippet: true, isFavorite: true, updatedAt: now - 10 }), item(2, { isSnippet: true, updatedAt: now })];
  assert.deepEqual(queryClipboardItems(items, { tab: 'snippets', type: 'all', search: '' }).map(item => item.id), [2, 1]);
  assert.deepEqual(queryClipboardItems(items, { tab: 'favorites', type: 'all', search: '' }).map(item => item.id), [1]);
});

test('snippets and favorites survive age and ordinary-history count cleanup', () => {
  const items = Array.from({ length: 600 }, (_, index) => item(index));
  items.push(item(999, { isSnippet: true, title: 'Old snippet', createdAt: 1 }));
  items.push(item(1000, { isFavorite: true, createdAt: 1 }));
  const retained = retainItems(items, { ...settings, maxHistoryItems: 500 }, now);
  assert.equal(retained.length, 502);
  assert.equal(retained.filter(item => !item.isFavorite && !item.isSnippet).length, 500);
  assert.ok(retained.some(item => item.id === 999));
  assert.ok(retained.some(item => item.id === 1000));
});

test('history settings clamp to 10–500 and ignore non-finite limits', () => {
  assert.equal(normalizeSettings({ ...settings, maxHistoryItems: 1 }).maxHistoryItems, 10);
  assert.equal(normalizeSettings({ ...settings, maxHistoryItems: 5000 }).maxHistoryItems, 500);
  assert.equal(normalizeSettings({ ...settings, maxHistoryItems: Number.NaN }).maxHistoryItems, 100);
  assert.equal(retainItems(Array.from({ length: 50 }, (_, index) => item(index)), { ...settings, maxHistoryItems: 0 }, now).length, 10);
});

test('snippet validation preserves exact copyable content and rejects invalid drafts', () => {
  const content = '  const answer = 42;\n  console.log(answer);\n';
  assert.deepEqual(validateSnippetDraft('  Debug command  ', content), { title: 'Debug command', content, contentType: 'code' });
  assert.equal(validateSnippetDraft('Homepage', 'https://example.com').contentType, 'link');
  assert.throws(() => validateSnippetDraft(' ', 'content'), /名称/);
  assert.throws(() => validateSnippetDraft('Name', ' \n '), /内容/);
  assert.throws(() => validateSnippetDraft('x'.repeat(81), 'content'), /80/);
  assert.throws(() => validateSnippetDraft('Name', 'x'.repeat(10001)), /10,000/);
});
