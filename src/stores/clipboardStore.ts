import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ClipboardItem, FilterType, AppSettings, GroupedItems } from '../types';
import { ContentType } from '../types';
import { APP_CONFIG, DEFAULT_SETTINGS } from '../utils/constants';
import { getBase64Size } from '../utils/image';

// 内存限制配置
const MEMORY_CONFIG = {
  MAX_ITEMS_IN_MEMORY: 100,        // 内存中最大项目数
  MAX_STORAGE_SIZE_MB: 10,         // 最大存储大小 (MB)
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

  return items.sort((a, b) => b.createdAt - a.createdAt);
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
        const limitedItems = items.slice(0, MEMORY_CONFIG.MAX_ITEMS_IN_MEMORY);
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

        // 分离收藏和非收藏
        const favoriteItems = state.items.filter(i => i.isFavorite);
        const normalItems = state.items.filter(i => !i.isFavorite);

        // 新项目添加到非收藏列表前面
        const newNormalItems = [processedItem, ...normalItems];

        // 限制非收藏数量
        const maxItems = state.settings.maxHistoryItems;
        const limitedNormalItems = newNormalItems.slice(0, maxItems);

        // 合并并限制总内存项目数
        const mergedItems = [...favoriteItems, ...limitedNormalItems]
          .slice(0, MEMORY_CONFIG.MAX_ITEMS_IN_MEMORY);
        
        const newItems = mergedItems.sort((a, b) => b.createdAt - a.createdAt);

        set({ items: newItems });
      },

      updateItem: (id, updates) =>
        set(state => ({
          items: state.items.map(item =>
            item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
          ),
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
          items: state.items.map(item =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ),
        })),

      setSelectedId: id => set({ selectedId: id }),

      setSearchQuery: query => set({ searchQuery: query }),

      setFilterType: type => set({ filterType: type }),

      setSelectedTag: tag => set({ selectedTag: tag }),

      setSettings: settings =>
        set(state => ({
          settings: { ...state.settings, ...settings },
        })),

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
        const now = Date.now();
        const cutoffTime = now - (state.settings.cleanupDays * 24 * 60 * 60 * 1000);

        // 只保留收藏项目和最近的项目
        const cleanedItems = state.items.filter(
          item => item.isFavorite || item.createdAt > cutoffTime
        );

        // 限制总数
        const favoriteItems = cleanedItems.filter(i => i.isFavorite);
        const normalItems = cleanedItems
          .filter(i => !i.isFavorite)
          .slice(0, state.settings.maxHistoryItems);
        
        const finalItems = [...favoriteItems, ...normalItems]
          .slice(0, MEMORY_CONFIG.MAX_ITEMS_IN_MEMORY);

        if (finalItems.length < state.items.length) {
          set({ items: finalItems });
        }
      },

      /** 获取当前内存使用量 (MB) */
      getMemoryUsage: () => {
        const state = get();
        const totalBytes = state.items.reduce((sum, item) => sum + estimateItemSize(item), 0);
        return totalBytes / (1024 * 1024);
      },
    }),
    {
      name: 'clipjar-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: state => {
        // 只保存必要的字段
        const itemsToSave = state.items
          .slice(0, 200) // 最多保存 200 条到 storage
          .map(item => ({
            ...item,
            // 如果图片太大，不保存到 storage
            imagePath: item.imagePath && getBase64Size(item.imagePath) > 500 * 1024
              ? undefined 
              : item.imagePath,
          }));

        return {
          settings: state.settings,
          items: itemsToSave,
        };
      },
      onRehydrateStorage: () => (state) => {
        // 从 storage 恢复后，进行清理
        if (state) {
          setTimeout(() => {
            state.cleanupOldItems();
          }, 1000);
        }
      },
    }
  )
);

// 定期清理
if (typeof window !== 'undefined') {
  setInterval(() => {
    useClipboardStore.getState().cleanupOldItems();
  }, MEMORY_CONFIG.CLEANUP_INTERVAL_MS);
}
