import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AppSettings, ClipboardBootstrap, ClipboardItem, ClipboardItemUpdates, StorageStats } from '../types';

export function isNativeClipboard(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

export const clipboardClient = {
  bootstrap(legacyItems?: ClipboardItem[], legacySettings?: AppSettings): Promise<ClipboardBootstrap> {
    return invoke('get_clipboard_bootstrap', { legacyItems, legacySettings });
  },
  subscribe(onSnapshot: (snapshot: ClipboardBootstrap) => void): Promise<UnlistenFn> {
    return listen<ClipboardBootstrap>('clipboard-history-changed', event => onSnapshot(event.payload));
  },
  add(item: ClipboardItem): Promise<ClipboardItem | null> {
    return invoke('add_clipboard_item', { content: item.content, contentType: item.contentType });
  },
  update(id: number, updates: ClipboardItemUpdates): Promise<ClipboardItem> {
    return invoke('update_clipboard_item', { id, updates });
  },
  remove(id: number): Promise<void> {
    return invoke('delete_clipboard_item', { id });
  },
  toggleFavorite(id: number): Promise<boolean> {
    return invoke('toggle_favorite', { id });
  },
  createSnippet(title: string, content: string, contentType: ClipboardItem['contentType']): Promise<ClipboardItem> {
    return invoke('create_snippet', { title, content, contentType });
  },
  updateSettings(settings: Partial<AppSettings>): Promise<void> {
    return invoke('update_clipboard_settings', { settings });
  },
  clearHistory(): Promise<void> {
    return invoke('clear_history', { includeProtected: false });
  },
  copy(id: number): Promise<void> {
    return invoke('copy_clipboard_item', { id });
  },
  image(id: number, thumbnail = false): Promise<string> {
    return invoke(thumbnail ? 'get_image_thumbnail' : 'get_image_data', { id });
  },
  stats(): Promise<StorageStats> {
    return invoke('get_storage_stats');
  },
  pause(minutes: 0 | 15 | 60): Promise<void> {
    return invoke('pause_capture', { durationMinutes: minutes });
  },
};
