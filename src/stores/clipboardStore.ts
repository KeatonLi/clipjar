import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClipboardItem, FilterType, AppSettings, GroupedItems } from '../types';
import { APP_CONFIG, DEFAULT_SETTINGS } from '../utils/constants';

interface ClipboardState {
  items: ClipboardItem[];
  selectedId: number | null;
  searchQuery: string;
  filterType: FilterType;
  selectedTag: string | null;
  isLoading: boolean;
  settings: AppSettings;
  showSettings: boolean;

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
export function getFilteredItems(state: ClipboardState): ClipboardItem[] {
  let items = [...state.items];

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
export function getGroupedItems(state: ClipboardState): GroupedItems {
  return groupItems(getFilteredItems(state));
}

/** 获取选中的项目 */
export function getSelectedItem(state: ClipboardState): ClipboardItem | null {
  return state.items.find(item => item.id === state.selectedId) || null;
}

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

      setItems: items => set({ items }),

      addItem: item => {
        const state = get();
        // 重复检测
        const isDuplicate = state.items.some(
          existing =>
            existing.content === item.content &&
            Math.abs(existing.createdAt - item.createdAt) < APP_CONFIG.DUPLICATE_WINDOW
        );
        if (isDuplicate) return;

        // 截断过长内容
        const truncatedItem: ClipboardItem = {
          ...item,
          content: item.content.length > APP_CONFIG.MAX_CONTENT_LENGTH
            ? item.content.substring(0, APP_CONFIG.MAX_CONTENT_LENGTH)
            : item.content,
        };

        // 分离收藏和非收藏
        const favoriteItems = state.items.filter(i => i.isFavorite);
        const normalItems = state.items.filter(i => !i.isFavorite);

        // 新项目添加到非收藏列表前面
        const newNormalItems = [truncatedItem, ...normalItems];

        // 限制非收藏数量
        const limitedNormalItems = newNormalItems.slice(0, state.settings.maxHistoryItems);

        // 合并并按时间排序
        const mergedItems = [...favoriteItems, ...limitedNormalItems];
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
            item.id === id ? { ...item, useCount: item.useCount + 1 } : item
          ),
        })),

      setShowSettings: show => set({ showSettings: show }),

      clearAll: () => set({ items: [] }),
    }),
    {
      name: 'clipjar-storage',
      partialize: state => ({ 
        settings: state.settings,
        items: state.items,
      }),
    }
  )
);
