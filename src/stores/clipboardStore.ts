import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ClipboardItem, FilterType, AppSettings, GroupedItems } from '../types';
import { ContentType } from '../types';
import { APP_CONFIG, DEFAULT_SETTINGS } from '../utils/constants';
import { getBase64Size } from '../utils/image';
import { deduplicatedStorage, persistedSnapshot, retainItems } from './storagePolicy';

// 内存限制配置
const MEMORY_CONFIG = {
  MAX_IMAGE_SIZE_MB: 2,            // 单张图片最大大小 (MB)
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 清理间隔 (5分钟)
} as const;

interface ClipboardState {
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
  debugMemory: () => { totalItems: number; textItems: number; imageItems: number; textSizeBytes: number; imageSizeBytes: number; estimatedMemoryMB: number };
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
    today: items.filter(item => item.createdAt >= today),
    yesterday: items.filter(item => item.createdAt >= yesterday && item.createdAt < today),
    thisWeek: items.filter(item => item.createdAt >= thisWeekStart && item.createdAt < yesterday),
    earlier: items.filter(item => item.createdAt < thisWeekStart),
  };
}

/** 获取过滤后的项目 */
export function getFilteredItems(state: Pick<ClipboardState, 'items' | 'searchQuery' | 'filterType' | 'selectedTag'>): ClipboardItem[] {
  let items = state.items;

  // 搜索过滤
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    items = items.filter(
      item =>
        item.content.toLowerCase().includes(query) ||
        item.tags.some(tag => tag.toLowerCase().includes(query)) ||
        (item.note && item.note.toLowerCase().includes(query))
    );
  }

  // 类型/收藏过滤
  if (state.filterType === 'favorite') {
    items = items.filter(item => item.isFavorite);
  } else if (state.filterType !== 'all') {
    items = items.filter(item => item.contentType === state.filterType);
  }

  // 标签过滤
  if (state.selectedTag) {
    items = items.filter(item => item.tags.includes(state.selectedTag!));
  }

  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

/** 获取分组后的项目 */
export function getGroupedItems(state: Pick<ClipboardState, 'items' | 'searchQuery' | 'filterType' | 'selectedTag'>): GroupedItems {
  return groupItems(getFilteredItems(state));
}

/** 获取选中的项目 */
export function getSelectedItem(state: ClipboardState): ClipboardItem | null {
  return state.items.find(item => item.id === state.selectedId) || null;
}

/** 创建存储 - 带内存管理 */
export const useClipboardStore = create<ClipboardState>()(
  persist(
    (set, get) => ({
      items: [],
      selectedId: null,
      searchQuery: '',
      filterType: 'all',
      selectedTag: null,
      isLoading: false,
      settings: DEFAULT_SETTINGS,
      showSettings: false,

      setItems: items => {
        // 限制内存中的项目数
        const limitedItems = retainItems(items, get().settings);
        set({ items: limitedItems });
      },

      addItem: item => {
        const state = get();
        
        // 重复检测
        const duplicateWindow = APP_CONFIG.DUPLICATE_WINDOW;
        const isDuplicate = state.items.some(
          existing =>
            existing.content === item.content &&
            Math.abs(existing.createdAt - item.createdAt) < duplicateWindow
        );
        if (isDuplicate) return;

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
              contentType: ContentType.TEXT,
            };
          }
        }

        // 截断过长内容
        const maxLength = APP_CONFIG.MAX_CONTENT_LENGTH;
        if (processedItem.content.length > maxLength) {
          processedItem = {
            ...processedItem,
            content: processedItem.content.substring(0, maxLength) + '...',
          };
        }

        const newItems = retainItems([processedItem, ...state.items], state.settings);

        set({ items: newItems });
      },

      updateItem: (id, updates) =>
        set(state => ({
          items: retainItems(state.items.map(item =>
            item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
          ), state.settings),
        })),

      updateNote: (id, note) =>
        set(state => ({
          items: state.items.map(item =>
            item.id === id ? { ...item, note, updatedAt: Date.now() } : item
          ),
        })),

      deleteItem: id =>
        set(state => ({
          items: state.items.filter(item => item.id !== id),
          selectedId: state.selectedId === id ? null : state.selectedId,
        })),

      toggleFavorite: id =>
        set(state => ({
          items: retainItems(state.items.map(item =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ), state.settings),
        })),

      setSelectedId: id => set({ selectedId: id }),

      setSearchQuery: query => set({ searchQuery: query }),

      setFilterType: type => set({ filterType: type }),

      setSelectedTag: tag => set({ selectedTag: tag }),

      setSettings: settings =>
        set(state => {
          const nextSettings = { ...state.settings, ...settings };
          return { settings: nextSettings, items: retainItems(state.items, nextSettings) };
        }),

      incrementUseCount: id =>
        set(state => ({
          items: state.items.map(item =>
            item.id === id ? { ...item, useWeight: item.useWeight + 1 } : item
          ),
        })),

      setShowSettings: show => set({ showSettings: show }),

      clearAll: () => set({ items: [], selectedId: null }),

      /** 清理旧项目以释放内存 */
      cleanupOldItems: () => {
        const state = get();
        const finalItems = retainItems(state.items, state.settings);
        if (finalItems.length !== state.items.length || finalItems.some((item, index) => item !== state.items[index])) {
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
        const textItems = state.items.filter(i => !i.imagePath);
        const imageItems = state.items.filter(i => !!i.imagePath);

        let textSize = 0;
        textItems.forEach(item => {
          textSize += item.content.length * 2;
        });

        let imageSize = 0;
        let largeImages = 0;
        imageItems.forEach(item => {
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
        console.log(`- 图片条目: ${imageItems.length} (${(imageSize / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`- 大图片 (>500KB): ${largeImages}`);
        console.log(`估计总内存: ${(state.items.reduce((sum, i) => sum + estimateItemSize(i), 0) / 1024 / 1024).toFixed(2)} MB`);
        console.groupEnd();

        // 检查 localStorage 大小
        try {
          const storageSize = new Blob([JSON.stringify(localStorage.getItem('clipjar-storage'))]).size;
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
          estimatedMemoryMB: state.items.reduce((sum, i) => sum + estimateItemSize(i), 0) / 1024 / 1024,
        };
      },
    }),
    {
      name: 'clipjar-storage',
      storage: createJSONStorage(() => deduplicatedStorage(localStorage)),
      partialize: state => persistedSnapshot(state.items, state.settings),
      merge: (persisted, current) => {
        const saved = persisted as Partial<Pick<ClipboardState, 'items' | 'settings'>>;
        const settings = { ...current.settings, ...saved?.settings };
        return { ...current, settings, items: retainItems(saved?.items ?? [], settings) };
      },
      onRehydrateStorage: () => (state) => {
        // 从 storage 恢复后，进行清理
        if (state) {
          setTimeout(() => {
            const current = useClipboardStore.getState();
            current.setItems(current.items);
          }, 0);
        }
      },
    }
  )
);

// 定期清理 - 仅在页面可见时执行
if (typeof window !== 'undefined') {
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
