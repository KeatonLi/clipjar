import { create } from 'zustand';
import type { AppSettings, ClipboardBootstrap, ClipboardItem, ClipboardItemUpdates, FilterType, GroupedItems, LibraryTab, StorageStats } from '../types';
import { APP_CONFIG, DEFAULT_SETTINGS } from '../utils/constants';
import { clipboardClient, isNativeClipboard } from '../lib/clipboardClient';
import { normalizeSettings, queryClipboardItems, validateSnippetDraft } from './clipboardModel';
import { CLIPBOARD_STORAGE_KEY, completeLegacyMigration, readLegacySnapshot } from './legacyStorage';
import { deduplicatedStorage, MAX_PERSISTED_BYTES, persistedSnapshot, retainItems, serializedBytes, type StringStorage } from './storagePolicy';

export { queryClipboardItems, validateSnippetDraft } from './clipboardModel';

export interface ClipboardState {
  items: ClipboardItem[];
  selectedId: number | null;
  searchQuery: string;
  filterType: FilterType;
  tab: LibraryTab;
  selectedTag: string | null;
  isLoading: boolean;
  initialized: boolean;
  error: string | null;
  settings: AppSettings;
  stats: StorageStats | null;
  showSettings: boolean;
  initialize: () => Promise<void>;
  dismissError: () => void;
  setItems: (items: ClipboardItem[]) => Promise<void>;
  addItem: (item: ClipboardItem) => Promise<void>;
  updateItem: (id: number, updates: ClipboardItemUpdates) => Promise<void>;
  updateNote: (id: number, note: string) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  toggleFavorite: (id: number) => Promise<void>;
  createSnippet: (title: string, content: string) => Promise<ClipboardItem>;
  editSnippet: (id: number, title: string, content: string) => Promise<void>;
  copyItem: (item: ClipboardItem) => Promise<void>;
  getImageSource: (id: number, thumbnail?: boolean) => Promise<string>;
  setSelectedId: (id: number | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: FilterType) => void;
  setTab: (tab: LibraryTab) => void;
  setSelectedTag: (tag: string | null) => void;
  setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  incrementUseCount: (id: number) => Promise<void>;
  setShowSettings: (show: boolean) => void;
  clearAll: () => Promise<void>;
  pauseCapture: (minutes: 0 | 15 | 60) => Promise<void>;
  cleanupOldItems: () => Promise<void>;
  getMemoryUsage: () => number;
  debugMemory: () => { totalItems: number; textItems: number; imageItems: number; textSizeBytes: number; imageSizeBytes: number; estimatedMemoryMB: number };
}

let initializePromise: Promise<void> | null = null;
let storage: StringStorage | null = null;
let mutationQueue: Promise<unknown> = Promise.resolve();
const imageCache = new Map<string, Promise<string>>();
let acceptedRevision = -1;

function getStorage(): StringStorage {
  if (!storage) storage = deduplicatedStorage(localStorage);
  return storage;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '操作失败，请重试。';
}

function browserStats(items: ClipboardItem[], settings: AppSettings): StorageStats {
  const totalBytes = serializedBytes({ state: { items, settings }, version: 0 });
  const imageBytes = items.reduce((sum, item) => sum + (item.imagePath?.length ?? 0) * 2, 0);
  return {
    itemCount: items.length,
    ordinaryCount: items.filter(item => !item.isFavorite && !item.isSnippet).length,
    snippetCount: items.filter(item => item.isSnippet).length,
    favoriteCount: items.filter(item => item.isFavorite).length,
    imageCount: items.filter(item => item.imagePath).length,
    imageBytes,
    metadataBytes: Math.max(0, totalBytes - imageBytes),
    totalBytes,
    budgetBytes: MAX_PERSISTED_BYTES,
    metadataBudgetBytes: MAX_PERSISTED_BYTES,
    isPaused: false,
    lastError: null,
  };
}

function applySnapshot(snapshot: ClipboardBootstrap): void {
  // A background capture can arrive while an earlier command response is in flight.
  if (snapshot.revision < acceptedRevision) return;
  acceptedRevision = snapshot.revision;
  const ids = new Set(snapshot.items.map(item => item.id));
  for (const key of imageCache.keys()) if (!ids.has(Number(key.slice(key.indexOf(':') + 1)))) imageCache.delete(key);
  useClipboardStore.setState(state => ({
    items: snapshot.items,
    settings: normalizeSettings(snapshot.settings),
    stats: snapshot.stats,
    selectedId: state.selectedId !== null && ids.has(state.selectedId) ? state.selectedId : null,
  }));
}

/** Persistence succeeds before browser state changes; a quota error leaves the previous data intact. */
function saveBrowser(items: ClipboardItem[], settings = useClipboardStore.getState().settings): void {
  const snapshot = persistedSnapshot(items, normalizeSettings(settings));
  getStorage().setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify({ state: snapshot, version: 0 }));
  const state = useClipboardStore.getState();
  useClipboardStore.setState({
    items: snapshot.items,
    settings: snapshot.settings,
    stats: browserStats(snapshot.items, snapshot.settings),
    selectedId: snapshot.items.some(item => item.id === state.selectedId) ? state.selectedId : null,
  });
}

/** Serialize mutations so a slower refresh cannot undo a later user action. */
function runMutation<T>(operation: () => Promise<T> | T): Promise<T> {
  const task = mutationQueue.then(async () => {
    await useClipboardStore.getState().initialize();
    useClipboardStore.setState({ error: null });
    try {
      const result = await operation();
      if (isNativeClipboard()) {
        try { applySnapshot(await clipboardClient.bootstrap()); }
        catch (error) { useClipboardStore.setState({ error: `操作已完成，但列表刷新失败：${errorMessage(error)}` }); }
      }
      return result;
    } catch (error) {
      useClipboardStore.setState({ error: errorMessage(error) });
      throw error;
    }
  });
  mutationQueue = task.catch(() => {});
  return task;
}

function findItem(id: number): ClipboardItem {
  const item = useClipboardStore.getState().items.find(record => record.id === id);
  if (!item) throw new Error('这条记录已不存在。');
  return item;
}

async function copyBrowserItem(item: ClipboardItem): Promise<void> {
  if (!navigator.clipboard) throw new Error('当前浏览器无法访问剪贴板，请使用桌面应用或安全连接。');
  if (item.contentType === 'image') {
    if (!item.imagePath) throw new Error('这张图片的原始数据已不可用。');
    if (!navigator.clipboard.write || typeof globalThis.ClipboardItem === 'undefined') {
      throw new Error('当前浏览器不支持复制图片，请使用桌面应用。');
    }
    let blob = await (await fetch(item.imagePath)).blob();
    if (blob.type !== 'image/png') {
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('图片转换失败。');
        context.drawImage(bitmap, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片转换失败。')), 'image/png'));
      } finally { bitmap.close(); }
    }
    await navigator.clipboard.write([new globalThis.ClipboardItem({ 'image/png': blob })]);
  } else {
    await navigator.clipboard.writeText(item.content);
  }
  try {
    saveBrowser(useClipboardStore.getState().items.map(record => record.id === item.id ? { ...record, useWeight: record.useWeight + 1 } : record));
  } catch (error) {
    useClipboardStore.setState({ error: `已复制，但使用次数未保存：${errorMessage(error)}` });
  }
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  items: [],
  selectedId: null,
  searchQuery: '',
  filterType: 'all',
  tab: 'history',
  selectedTag: null,
  isLoading: false,
  initialized: false,
  error: null,
  settings: { ...DEFAULT_SETTINGS },
  stats: null,
  showSettings: false,

  initialize: () => {
    if (get().initialized) return Promise.resolve();
    if (initializePromise) return initializePromise;
    set({ isLoading: true, error: null });
    initializePromise = Promise.resolve().then(async () => {
      let unlisten: (() => void) | undefined;
      try {
        const legacy = readLegacySnapshot(getStorage());
        const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...legacy.settings });
        if (isNativeClipboard()) {
          unlisten = await clipboardClient.subscribe(applySnapshot);
          const snapshot = await clipboardClient.bootstrap(legacy.found ? legacy.items : undefined, legacy.found ? settings : undefined);
          applySnapshot(snapshot);
          // No native records or image payloads are ever written to localStorage.
          if (legacy.found) completeLegacyMigration(getStorage(), snapshot.migrationComplete, snapshot.settings);
        } else {
          saveBrowser(legacy.items, settings);
          if (legacy.found) {
            getStorage().removeItem('clipjar-items');
            getStorage().removeItem('clipjar_shortcut_mode');
          }
        }
        set({ initialized: true, isLoading: false });
      } catch (error) {
        unlisten?.();
        set({ isLoading: false, error: errorMessage(error) });
        throw error;
      } finally {
        initializePromise = null;
      }
    });
    return initializePromise;
  },

  dismissError: () => set({ error: null }),
  setItems: items => runMutation(() => {
    if (isNativeClipboard()) throw new Error('桌面剪贴记录由本地数据库管理。');
    saveBrowser(items);
  }),
  addItem: item => runMutation(async () => {
    if (isNativeClipboard()) { await clipboardClient.add(item); return; }
    if (get().items.some(record => !record.isSnippet && record.contentType === item.contentType && record.content === item.content && record.imagePath === item.imagePath && Math.abs(record.createdAt - item.createdAt) < APP_CONFIG.DUPLICATE_WINDOW)) return;
    if (item.content.length > APP_CONFIG.MAX_CONTENT_LENGTH) throw new Error('内容最多 10,000 个字符。');
    saveBrowser([item, ...get().items]);
  }),
  updateItem: (id, updates) => runMutation(async () => {
    const item = findItem(id);
    if (isNativeClipboard()) { await clipboardClient.update(id, updates); return; }
    if (item.contentType === 'image' && (updates.content !== undefined || updates.contentType !== undefined || updates.isSnippet === true)) {
      throw new Error('图片内容不能改为文字片段；可修改备注或收藏。');
    }
    const replacement = { ...item, ...updates, id, updatedAt: Date.now() };
    if (replacement.isSnippet) replacement.title = validateSnippetDraft(replacement.title ?? '', replacement.content).title;
    saveBrowser(get().items.map(record => record.id === id ? replacement : record));
  }),
  updateNote: (id, note) => {
    if (note.length > 200) {
      const error = new Error('备注最多 200 个字符。');
      set({ error: error.message });
      return Promise.reject(error);
    }
    return get().updateItem(id, { note });
  },
  deleteItem: id => runMutation(async () => {
    if (isNativeClipboard()) { await clipboardClient.remove(id); return; }
    saveBrowser(get().items.filter(item => item.id !== id));
  }),
  toggleFavorite: id => runMutation(async () => {
    if (isNativeClipboard()) { await clipboardClient.toggleFavorite(id); return; }
    const item = findItem(id);
    saveBrowser(get().items.map(record => record.id === id ? { ...record, isFavorite: !item.isFavorite, updatedAt: Date.now() } : record));
  }),
  createSnippet: (title, content) => runMutation(async () => {
    const draft = validateSnippetDraft(title, content);
    if (isNativeClipboard()) return clipboardClient.createSnippet(draft.title, draft.content, draft.contentType);
    const now = Date.now();
    const id = Math.max(now, ...get().items.map(item => Math.floor(item.id) + 1));
    const item: ClipboardItem = { id, ...draft, createdAt: now, updatedAt: now, isFavorite: false, isSnippet: true, hasImage: false, useWeight: 0, tags: [] };
    saveBrowser([item, ...get().items]);
    return item;
  }),
  editSnippet: (id, title, content) => runMutation(async () => {
    const item = findItem(id);
    if (!item.isSnippet) throw new Error('请先将内容保存为常用片段。');
    const draft = validateSnippetDraft(title, content);
    if (isNativeClipboard()) { await clipboardClient.update(id, { ...draft, isSnippet: true }); return; }
    saveBrowser(get().items.map(record => record.id === id ? { ...record, ...draft, updatedAt: Date.now() } : record));
  }),
  copyItem: item => runMutation(async () => {
    if (isNativeClipboard()) await clipboardClient.copy(item.id);
    else await copyBrowserItem(findItem(item.id));
  }),
  getImageSource: async (id, thumbnail = false) => {
    const mode = thumbnail ? 'thumbnail' : 'full';
    const key = `${mode}:${id}`;
    try {
      const item = findItem(id);
      if (item.imagePath) return item.imagePath;
      if (!isNativeClipboard() || !item.hasImage) throw new Error('图片预览已不可用。');
      let pending = imageCache.get(key);
      if (!pending) {
        pending = clipboardClient.image(id, thumbnail);
        imageCache.set(key, pending);
        const modeKeys = [...imageCache.keys()].filter(key => key.startsWith(`${mode}:`));
        while (modeKeys.length > (thumbnail ? 96 : 4)) imageCache.delete(modeKeys.shift()!);
      } else {
        // Keep frequently viewed previews at the end of their bounded cache.
        imageCache.delete(key);
        imageCache.set(key, pending);
      }
      return await pending;
    } catch (error) {
      imageCache.delete(key);
      throw error;
    }
  },
  setSelectedId: selectedId => set({ selectedId }),
  setSearchQuery: searchQuery => set({ searchQuery }),
  setFilterType: filterType => set({ filterType }),
  setTab: tab => set({ tab }),
  setSelectedTag: selectedTag => set({ selectedTag }),
  setSettings: updates => runMutation(async () => {
    const settings = normalizeSettings({ ...get().settings, ...updates });
    if (isNativeClipboard()) { await clipboardClient.updateSettings(settings); return; }
    saveBrowser(get().items, settings);
  }),
  incrementUseCount: id => runMutation(() => {
    if (isNativeClipboard()) return; // Native copy updates usage in the same transaction.
    const item = findItem(id);
    saveBrowser(get().items.map(record => record.id === id ? { ...record, useWeight: item.useWeight + 1 } : record));
  }),
  setShowSettings: showSettings => set({ showSettings }),
  clearAll: () => runMutation(async () => {
    if (isNativeClipboard()) { await clipboardClient.clearHistory(); return; }
    saveBrowser(get().items.filter(item => item.isFavorite || item.isSnippet));
  }),
  pauseCapture: minutes => runMutation(async () => {
    if (!isNativeClipboard()) throw new Error('后台记录暂停功能请在桌面应用中使用。');
    await clipboardClient.pause(minutes);
  }),
  cleanupOldItems: () => runMutation(() => {
    if (isNativeClipboard()) return;
    const retained = retainItems(get().items, get().settings);
    if (retained.length !== get().items.length || retained.some((item, index) => item !== get().items[index])) saveBrowser(retained);
  }),
  getMemoryUsage: () => serializedBytes(get().items) / 1024 / 1024,
  debugMemory: () => {
    const items = get().items;
    const imageItems = items.filter(item => item.hasImage || item.imagePath);
    const imageSizeBytes = imageItems.reduce((sum, item) => sum + (item.imagePath?.length ?? 0) * 2, 0);
    const textSizeBytes = serializedBytes(items.map(item => ({ ...item, imagePath: undefined })));
    return { totalItems: items.length, textItems: items.length - imageItems.length, imageItems: imageItems.length, textSizeBytes, imageSizeBytes, estimatedMemoryMB: (textSizeBytes + imageSizeBytes) / 1024 / 1024 };
  },
}));

export function getFilteredItems(state: Pick<ClipboardState, 'items' | 'searchQuery' | 'filterType' | 'selectedTag'> & Partial<Pick<ClipboardState, 'tab'>>): ClipboardItem[] {
  return queryClipboardItems(state.items, {
    tab: state.filterType === 'favorite' ? 'favorites' : state.tab ?? 'history',
    type: state.filterType === 'favorite' ? 'all' : state.filterType,
    search: state.searchQuery,
    tag: state.selectedTag,
  });
}

export function getGroupedItems(state: Parameters<typeof getFilteredItems>[0]): GroupedItems {
  const items = getFilteredItems(state);
  const today = new Date().setHours(0, 0, 0, 0);
  const yesterday = today - 86400000;
  const weekStart = today - ((new Date(today).getDay() || 7) - 1) * 86400000;
  return {
    today: items.filter(item => item.createdAt >= today),
    yesterday: items.filter(item => item.createdAt >= yesterday && item.createdAt < today),
    thisWeek: items.filter(item => item.createdAt >= weekStart && item.createdAt < yesterday),
    earlier: items.filter(item => item.createdAt < Math.min(weekStart, yesterday)),
  };
}

export function getSelectedItem(state: Pick<ClipboardState, 'items' | 'selectedId'>): ClipboardItem | null {
  return state.items.find(item => item.id === state.selectedId) ?? null;
}
