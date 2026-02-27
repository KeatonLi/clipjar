import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClipboardItem, FilterType, AppSettings, GroupedItems } from '../types';

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
  deleteItem: (id: number) => void;
  toggleFavorite: (id: number) => void;
  setSelectedId: (id: number | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: FilterType) => void;
  setSelectedTag: (tag: string | null) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  incrementUseCount: (id: number) => void;
  setShowSettings: (show: boolean) => void;
}

const defaultSettings: AppSettings = {
  maxHistoryItems: 500,
  autoCleanup: true,
  cleanupDays: 30,
  globalShortcut: 'CommandOrControl+Shift+V',
  startAtLogin: false,
  showPreview: true,
};

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

export function getFilteredItems(state: ClipboardState): ClipboardItem[] {
  let items = [...state.items];

  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    items = items.filter(
      item =>
        item.content.toLowerCase().includes(query) ||
        item.tags.some(tag => tag.toLowerCase().includes(query))
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

export function getGroupedItems(state: ClipboardState): GroupedItems {
  return groupItems(getFilteredItems(state));
}

export function getSelectedItem(state: ClipboardState): ClipboardItem | null {
  return state.items.find(item => item.id === state.selectedId) || null;
}

export const useClipboardStore = create<ClipboardState>()(
  persist(
    (set) => ({
      items: [],
      selectedId: null,
      searchQuery: '',
      filterType: 'all',
      selectedTag: null,
      isLoading: false,
      settings: defaultSettings,
      showSettings: false,

      setItems: items => set({ items }),

      addItem: item =>
        set(state => {
          const isDuplicate = state.items.some(
            existing =>
              existing.content === item.content &&
              Math.abs(existing.createdAt - item.createdAt) < 1000
          );
          if (isDuplicate) return state;

          const newItems = [item, ...state.items];
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

      setShowSettings: show => set({ showSettings: show }),
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
