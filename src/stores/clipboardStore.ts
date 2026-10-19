import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ClipboardItem, FilterType, AppSettings, GroupedItems } from '../types';
import { ContentType } from '../types';
import { APP_CONFIG, DEFAULT_SETTINGS } from '../utils/constants';
import { getBase64Size } from '../utils/image';
import { deduplicatedStorage, persistedSnapshot, retainItems } from './storagePolicy';
import { mergeClipboardItem, snapshotIsCurrent } from './historyPolicy';
import {
  isNative,
  connectHistory,
  historyAction,
  refreshHistory,
  type HistoryAction,
  type HistorySnapshot,
  type UndoNotice
} from '../services/nativeHistory';

// 内存限制配置
const MEMORY_CONFIG = {
  MAX_IMAGE_SIZE_MB: 2, // 单张图片最大大小 (MB)
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000 // 清理间隔 (5分钟)
} as const;

interface ClipboardState {
  revision: number;
  operationError: string;
  pauseUntil: number | null;
  undo: UndoNotice | null;
  storageBytes: number;
  migrationBackup: string | null;
  initialize: () => Promise<void>;
  clearError: () => void;
  clearHistory: () => void;
  undoDelete: () => void;
  setCapturePause: (minutes: number | null) => void;
  resumeCapture: () => void;
  items: ClipboardItem[];
  selectedId: number | null;
  searchQuery: string;
  filterType: FilterType;
  selectedTag: string | null;
  isLoading: boolean;
  settings: AppSettings;
  showSettings: boolean;

  // Actions
  setItems: (items: ClipboardItem[]) => void;
  addItem: (item: ClipboardItem) => void;
  updateItem: (id: number, updates: Partial<ClipboardItem>) => void;
  updateNote: (id: number, note: string) => void;
  deleteItem: (id: number) => void;
  toggleFavorite: (id: number) => void;
  setSelectedId: (id: number | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: FilterType) => void;
  setSelectedTag: (tag: string | null) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  incrementUseCount: (id: number) => void;
  setShowSettings: (show: boolean) => void;
  clearAll: () => void;
  cleanupOldItems: () => void;
  getMemoryUsage: () => number;
  debugMemory: () => {
    totalItems: number;
    textItems: number;
    imageItems: number;
    textSizeBytes: number;
    imageSizeBytes: number;
    estimatedMemoryMB: number;
  };
}

/** 计算项目的内存占用估计值 */
function estimateItemSize(item: ClipboardItem): number {
  let size = item.content.length * 2; // 字符串占用的字节数 (UTF-16)

  if (item.imagePath) {
    size += getBase64Size(item.imagePath);
  }

  if (item.note) {
    size += item.note.length * 2;
  }

  size += item.tags.length * 20; // 标签估计

  return size;
}

/** 按时间分组 */
function groupItems(items: ClipboardItem[]): GroupedItems {
  const now = Date.now();
  const today = new Date(now).setHours(0, 0, 0, 0);
  const yesterday = today - 24 * 60 * 60 * 1000;
  const thisWeekStart = today - (new Date(today).getDay() || 7) * 24 * 60 * 60 * 1000;

  return {
    today: items.filter((item) => item.createdAt >= today),
    yesterday: items.filter((item) => item.createdAt >= yesterday && item.createdAt < today),
    thisWeek: items.filter((item) => item.createdAt >= thisWeekStart && item.createdAt < yesterday),
    earlier: items.filter((item) => item.createdAt < thisWeekStart)
  };
}

/** 获取过滤后的项目 */
export function getFilteredItems(
  state: Pick<ClipboardState, 'items' | 'searchQuery' | 'filterType' | 'selectedTag'>
): ClipboardItem[] {
  let items = state.items;

  // 搜索过滤
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    items = items.filter(
      (item) =>
        item.content.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        (item.note && item.note.toLowerCase().includes(query))
    );
  }

  // 类型/收藏过滤
  if (state.filterType === 'favorite') {
    items = items.filter((item) => item.isFavorite);
  } else if (state.filterType !== 'all') {
    items = items.filter((item) => item.contentType === state.filterType);
  }

  // 标签过滤
  if (state.selectedTag) {
    items = items.filter((item) => item.tags.includes(state.selectedTag!));
  }

  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

/** 获取分组后的项目 */
export function getGroupedItems(
  state: Pick<ClipboardState, 'items' | 'searchQuery' | 'filterType' | 'selectedTag'>
): GroupedItems {
  return groupItems(getFilteredItems(state));
}

/** 获取选中的项目 */
export function getSelectedItem(state: ClipboardState): ClipboardItem | null {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

let connection: Promise<void> | null = null;
let disposeNative: (() => void) | undefined;
let commandQueue = Promise.resolve();
const localTrash = new Map<string, ClipboardItem>();
function applySnapshot(snapshot: HistorySnapshot) {
  const state = useClipboardStore.getState();
  if (!snapshotIsCurrent(snapshot.revision, state.revision)) return;
  useClipboardStore.setState({ ...snapshot, isLoading: false });
}
function dispatch(action: HistoryAction | (() => HistoryAction)) {
  commandQueue = commandQueue.then(async () => {
    try {
      applySnapshot(await historyAction(typeof action === 'function' ? action() : action));
      useClipboardStore.setState({ operationError: '' });
    } catch (error) {
      // A reply may fail after a committed filesystem operation. Reconcile before retrying.
      try {
        applySnapshot(await refreshHistory());
      } catch {
        /* Keep the last good view. */
      }
      useClipboardStore.setState({
        operationError: typeof error === 'string' ? error : '操作未完成，请重试。'
      });
    }
  });
}

/** 创建存储 - 带内存管理 */
export const useClipboardStore = create<ClipboardState>()(
  persist(
    (set, get) => ({
      revision: -1,
      operationError: '',
      pauseUntil: null,
      undo: null,
      storageBytes: 0,
      migrationBackup: null,
      initialize: async () => {
        if (!isNative) return;
        if (get().operationError && connection && !get().isLoading) {
          disposeNative?.();
          disposeNative = undefined;
          connection = null;
        }
        if (!connection) {
          set({ isLoading: true, operationError: '' });
          connection = connectHistory(applySnapshot, (message) => set({ operationError: message }))
            .then((dispose) => {
              disposeNative = dispose;
            })
            .catch((error) => {
              connection = null;
              set({
                isLoading: false,
                operationError:
                  typeof error === 'string' ? error : '本地记录初始化失败，旧数据已保留，请重试。'
              });
            });
        }
        await connection;
      },
      clearError: () => set({ operationError: '' }),
      clearHistory: () => {
        if (isNative) dispatch({ type: 'clear', includeFavorites: false });
        else set((state) => ({ items: state.items.filter((item) => item.isFavorite), undo: null }));
      },
      undoDelete: () => {
        const undo = get().undo;
        if (!undo || undo.expiresAt <= Date.now()) {
          set({ undo: null });
          return;
        }
        if (isNative) dispatch({ type: 'undo', token: undo.token });
        else {
          const item = localTrash.get(undo.token);
          localTrash.delete(undo.token);
          if (item)
            set((state) => ({
              items: retainItems(
                mergeClipboardItem(state.items, { ...item, createdAt: Date.now() }),
                state.settings
              ),
              undo: null
            }));
        }
      },
      setCapturePause: (minutes) => {
        if (isNative) dispatch({ type: 'pause', minutes });
        else set({ pauseUntil: minutes === null ? 0 : Date.now() + minutes * 60000 });
      },
      resumeCapture: () => {
        if (isNative) dispatch({ type: 'resume' });
        else set({ pauseUntil: null });
      },
      items: [],
      selectedId: null,
      searchQuery: '',
      filterType: 'all',
      selectedTag: null,
      isLoading: isNative,
      settings: DEFAULT_SETTINGS,
      showSettings: false,

      setItems: (items) => {
        if (isNative) return;
        // 限制内存中的项目数
        const limitedItems = retainItems(items, get().settings);
        set({ items: limitedItems });
      },

      addItem: (item) => {
        const state = get();

        if (isNative) return;

        // 检查图片大小，过大的图片进行标记
        let processedItem = item;
        if (item.imagePath) {
          const imageSize = getBase64Size(item.imagePath);
          if (imageSize > MEMORY_CONFIG.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
            // 图片太大，只保存缩略图信息
            processedItem = {
              ...item,
              imagePath: undefined,
              content: `[图片 ${item.imageWidth || '?'}x${item.imageHeight || '?'}] (图片过大已省略)`,
              contentType: ContentType.TEXT
            };
          }
        }

        // 截断过长内容
        const maxLength = APP_CONFIG.MAX_CONTENT_LENGTH;
        if (processedItem.content.length > maxLength) {
          processedItem = {
            ...processedItem,
            content: processedItem.content.substring(0, maxLength) + '...'
          };
        }

        const newItems = retainItems(
          mergeClipboardItem(state.items, processedItem),
          state.settings
        );

        set({ items: newItems });
      },

      updateItem: (id, updates) => {
        if (isNative) {
          if (updates.note !== undefined) dispatch({ type: 'note', id, note: updates.note });
          return;
        }
        set((state) => ({
          items: retainItems(
            state.items.map((item) =>
              item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
            ),
            state.settings
          )
        }));
      },
      updateNote: (id, note) => {
        if (isNative) dispatch({ type: 'note', id, note });
        else
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id ? { ...item, note, updatedAt: Date.now() } : item
            )
          }));
      },
      deleteItem: (id) => {
        if (isNative) {
          dispatch({ type: 'delete', id });
          return;
        }
        const item = get().items.find((item) => item.id === id);
        if (!item) return;
        const token = `${Date.now()}-${id}`;
        localTrash.clear();
        localTrash.set(token, item);
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
          undo: { token, expiresAt: Date.now() + 10000 },
          selectedId: state.selectedId === id ? null : state.selectedId
        }));
      },
      toggleFavorite: (id) => {
        if (isNative) dispatch({ type: 'favorite', id });
        else
          set((state) => ({
            items: retainItems(
              state.items.map((item) =>
                item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
              ),
              state.settings
            )
          }));
      },

      setSelectedId: (id) => set({ selectedId: id }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setFilterType: (type) => set({ filterType: type }),

      setSelectedTag: (tag) => set({ selectedTag: tag }),

      setSettings: (settings) => {
        const nextSettings = { ...get().settings, ...settings };
        if (isNative)
          dispatch(() => ({ type: 'settings', settings: { ...get().settings, ...settings } }));
        else
          set((state) => ({
            settings: nextSettings,
            items: retainItems(state.items, nextSettings)
          }));
      },
      incrementUseCount: (id) => {
        if (isNative) dispatch({ type: 'use', id });
        else
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id ? { ...item, useWeight: item.useWeight + 1 } : item
            )
          }));
      },

      setShowSettings: (show) => set({ showSettings: show }),

      clearAll: () => {
        if (isNative) dispatch({ type: 'clear', includeFavorites: true });
        else {
          localTrash.clear();
          set({ items: [], selectedId: null, undo: null });
        }
      },

      /** 清理旧项目以释放内存 */
      cleanupOldItems: () => {
        if (isNative) return;
        const state = get();
        const finalItems = retainItems(state.items, state.settings);
        if (
          finalItems.length !== state.items.length ||
          finalItems.some((item, index) => item !== state.items[index])
        ) {
          set({ items: finalItems });
        }
      },

      /** 获取当前内存使用量 (MB) */
      getMemoryUsage: () => {
        const state = get();
        const totalBytes = state.items.reduce((sum, item) => sum + estimateItemSize(item), 0);
        return totalBytes / (1024 * 1024);
      },

      /** 调试：打印详细内存使用统计 */
      debugMemory: () => {
        const state = get();
        const textItems = state.items.filter((i) => !i.imagePath);
        const imageItems = state.items.filter((i) => !!i.imagePath);

        let textSize = 0;
        textItems.forEach((item) => {
          textSize += item.content.length * 2;
        });

        let imageSize = 0;
        let largeImages = 0;
        imageItems.forEach((item) => {
          if (item.imagePath) {
            const size = getBase64Size(item.imagePath);
            imageSize += size;
            if (size > 500 * 1024) {
              largeImages++;
            }
          }
        });

        console.group('📊 ClipJar 内存统计');
        console.log(`总条目: ${state.items.length}`);
        console.log(`- 文本条目: ${textItems.length} (${(textSize / 1024).toFixed(2)} KB)`);
        console.log(
          `- 图片条目: ${imageItems.length} (${(imageSize / 1024 / 1024).toFixed(2)} MB)`
        );
        console.log(`- 大图片 (>500KB): ${largeImages}`);
        console.log(
          `估计总内存: ${(state.items.reduce((sum, i) => sum + estimateItemSize(i), 0) / 1024 / 1024).toFixed(2)} MB`
        );
        console.groupEnd();

        // 检查 localStorage 大小
        try {
          const storageSize = new Blob([JSON.stringify(localStorage.getItem('clipjar-storage'))])
            .size;
          console.log(`localStorage 大小: ${(storageSize / 1024).toFixed(2)} KB`);
        } catch {
          // ignore
        }

        return {
          totalItems: state.items.length,
          textItems: textItems.length,
          imageItems: imageItems.length,
          textSizeBytes: textSize,
          imageSizeBytes: imageSize,
          estimatedMemoryMB:
            state.items.reduce((sum, i) => sum + estimateItemSize(i), 0) / 1024 / 1024
        };
      }
    }),
    {
      name: 'clipjar-storage',
      storage: createJSONStorage(() =>
        isNative
          ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
          : deduplicatedStorage(localStorage)
      ),
      partialize: (state) =>
        isNative
          ? { items: [], settings: state.settings }
          : persistedSnapshot(state.items, state.settings),
      merge: (persisted, current) => {
        const saved = persisted as Partial<Pick<ClipboardState, 'items' | 'settings'>>;
        const settings = { ...current.settings, ...saved?.settings };
        return { ...current, settings, items: retainItems(saved?.items ?? [], settings) };
      },
      onRehydrateStorage: () => (state) => {
        // 从 storage 恢复后，进行清理
        if (state && !isNative) {
          setTimeout(() => {
            const current = useClipboardStore.getState();
            current.setItems(current.items);
          }, 0);
        }
      }
    }
  )
);

// 定期清理 - 仅在页面可见时执行
if (typeof window !== 'undefined' && !isNative) {
  // 检查页面是否可见
  const isPageVisible = () => {
    return document.visibilityState === 'visible';
  };

  setInterval(() => {
    if (isPageVisible()) {
      useClipboardStore.getState().cleanupOldItems();
    }
  }, MEMORY_CONFIG.CLEANUP_INTERVAL_MS);

  // 页面可见性变化时立即清理
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      useClipboardStore.getState().cleanupOldItems();
    }
  });
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposeNative?.();
  });
