import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClipboardItem,
  FilterType,
  AppSettings,
  GroupedItems,
} from '../types';

interface ClipboardState {
  // 数据
  items: ClipboardItem[];
  selectedId: number | null;
  searchQuery: string;
  filterType: FilterType;
  selectedTag: string | null;
  isLoading: boolean;

  // 设置
  settings: AppSettings;

  // 计算属性
  filteredItems: () => ClipboardItem[];
  groupedItems: () => GroupedItems;
  selectedItem: () => ClipboardItem | null;

  // 操作方法
  setItems: (items: ClipboardItem[]) => void;
  addItem: (item: ClipboardItem) => void;
  updateItem: (id: number, updates: Partial<ClipboardItem>) => void;
  deleteItem: (id: number) => void;
  toggleFavorite: (id: number) => void;
  setSelectedId: (id: number | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: FilterType) => void;
  setSelectedTag: (tag: string | null) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  incrementUseCount: (id: number) => void;
}

const defaultSettings: AppSettings = {
  maxHistoryItems: 500,
  autoCleanup: true,
  cleanupDays: 30,
  globalShortcut: 'CommandOrControl+Shift+V',
  startAtLogin: false,
  showPreview: true,
};

// 分组辅助函数
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

export const useClipboardStore = create<ClipboardState>()(
  persist(
    (set, get) => ({
      items: [],
      selectedId: null,
      searchQuery: '',
      filterType: 'all',
      selectedTag: null,
      isLoading: false,
      settings: defaultSettings,

      filteredItems: () => {
        const state = get();
        let items = [...state.items];

        // 搜索过滤
        if (state.searchQuery.trim()) {
          const query = state.searchQuery.toLowerCase();
          items = items.filter(
            item =>
              item.content.toLowerCase().includes(query) ||
              item.tags.some(tag => tag.toLowerCase().includes(query))
          );
        }

        // 类型过滤
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
      },

      groupedItems: () => {
        return groupItems(get().filteredItems());
      },

      selectedItem: () => {
        const state = get();
        return state.items.find(item => item.id === state.selectedId) || null;
      },

      setItems: items => set({ items }),

      addItem: item =>
        set(state => {
          // 检查是否重复（最近1秒内相同内容）
          const isDuplicate = state.items.some(
            existing =>
              existing.content === item.content &&
              Math.abs(existing.createdAt - item.createdAt) < 1000
          );
          if (isDuplicate) return state;

          const newItems = [item, ...state.items];
          // 限制最大数量
          if (newItems.length > state.settings.maxHistoryItems) {
            return { items: newItems.slice(0, state.settings.maxHistoryItems) };
          }
          return { items: newItems };
        }),

      updateItem: (id, updates) =>
        set(state => ({
          items: state.items.map(item =>
            item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
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
    }),
    {
      name: 'clipjar-settings',
      partialize: state => ({ settings: state.settings }),
    }
  )
);
