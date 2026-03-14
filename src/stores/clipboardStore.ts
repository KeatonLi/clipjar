import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClipboardItem, FilterType, AppSettings } from '../types';

interface ClipboardState {
  items: ClipboardItem[];
  lastContent: string;
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

const defaultSettings: AppSettings = {
  maxHistoryItems: 100, // 降低默认数量减少内存
  autoCleanup: true,
  cleanupDays: 7, // 缩短清理周期
  globalShortcut: 'CommandOrControl+Shift+V',
  startAtLogin: false,
  showPreview: true,
};

// 内存优化配置
const MAX_CONTENT_LENGTH = 5000; // 内容截断长度
const MAX_IMAGE_SIZE = 1024 * 1024; // 最大图片 1MB
const MAX_ITEMS_IN_MEMORY = 100; // 内存中最大条目数

// 压缩存储的图片数据
function compressImageData(item: ClipboardItem): ClipboardItem {
  if (item.contentType === 'image' && item.imagePath) {
    // 如果图片太大，只保留缩略图标识
    if (item.imagePath.length > MAX_IMAGE_SIZE) {
      return {
        ...item,
        imagePath: null, // 大图不存入内存
        content: '[图片 - 已压缩存储]',
      };
    }
  }
  return item;
}

// 清理过期数据
function cleanupOldItems(items: ClipboardItem[], days: number): ClipboardItem[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter(item => 
    item.isFavorite || item.createdAt > cutoff
  );
}

export function getFilteredItems(state: ClipboardState): ClipboardItem[] {
  let items = state.items;

  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    items = items.filter(
      item =>
        item.content.toLowerCase().includes(query) ||
        item.tags.some(tag => tag.toLowerCase().includes(query)) ||
        (item.note && item.note.toLowerCase().includes(query))
    );
  }

  if (state.filterType === 'favorite') {
    items = items.filter(item => item.isFavorite);
  } else if (state.filterType !== 'all') {
    items = items.filter(item => item.contentType === state.filterType);
  }

  if (state.selectedTag) {
    items = items.filter(item => item.tags.includes(state.selectedTag!));
  }

  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export const useClipboardStore = create<ClipboardState>()(
  persist(
    (set) => ({
      items: [],
      lastContent: '',
      selectedId: null,
      searchQuery: '',
      filterType: 'all',
      selectedTag: null,
      isLoading: false,
      settings: defaultSettings,
      showSettings: false,

      setItems: items => set({ items: items.slice(0, MAX_ITEMS_IN_MEMORY) }),

      addItem: item =>
        set(state => {
          // 检查重复
          const isDuplicate = state.items.some(
            existing =>
              existing.content === item.content &&
              Math.abs(existing.createdAt - item.createdAt) < 2000
          );
          if (isDuplicate) return state;

          // 压缩优化
          const optimizedItem = compressImageData({
            ...item,
            content: item.content.length > MAX_CONTENT_LENGTH
              ? item.content.substring(0, MAX_CONTENT_LENGTH) + '...'
              : item.content,
          });

          // 分离收藏和普通
          const favoriteItems = state.items.filter(i => i.isFavorite);
          const normalItems = state.items.filter(i => !i.isFavorite);

          // 添加新项并限制数量
          const newNormalItems = [optimizedItem, ...normalItems]
            .slice(0, state.settings.maxHistoryItems);

          // 合并并排序
          const newItems = [...favoriteItems, ...newNormalItems]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, MAX_ITEMS_IN_MEMORY);

          return { 
            items: newItems,
            lastContent: optimizedItem.content
          };
        }),

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
      // 限制存储大小
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 重新加载时清理过期数据
          const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
          state.items = state.items.filter(item => 
            item.isFavorite || item.createdAt > cutoff
          ).slice(0, MAX_ITEMS_IN_MEMORY);
        }
      },
    }
  )
);
