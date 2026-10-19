import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AppSettings, ClipboardItem } from '../types';

export const isNative =
  typeof window !== 'undefined' && Boolean((window as { __TAURI__?: unknown }).__TAURI__);
export interface UndoNotice {
  token: string;
  expiresAt: number;
}
export interface HistorySnapshot {
  revision: number;
  items: ClipboardItem[];
  settings: AppSettings;
  pauseUntil: number | null;
  undo: UndoNotice | null;
  storageBytes: number;
  migrationBackup: string | null;
}
export type HistoryAction =
  | { type: 'favorite' | 'delete' | 'use'; id: number }
  | { type: 'note'; id: number; note: string }
  | { type: 'undo'; token: string }
  | { type: 'clear'; includeFavorites: boolean }
  | { type: 'settings'; settings: AppSettings }
  | { type: 'pause'; minutes: number | null }
  | { type: 'resume' };

export function normalizeSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return {
    ...snapshot,
    items: snapshot.items.map((item) => ({
      ...item,
      imagePath: item.imagePath ? convertFileSrc(item.imagePath) : undefined
    }))
  };
}
export async function connectHistory(
  apply: (snapshot: HistorySnapshot) => void,
  report: (message: string) => void
) {
  const cleanups: (() => void)[] = [];
  try {
    const legacy = localStorage.getItem('clipjar-storage');
    const shortcut = localStorage.getItem('clipjar_shortcut_mode');
    cleanups.push(
      await listen<HistorySnapshot>('history-changed', (event) =>
        apply(normalizeSnapshot(event.payload))
      )
    );
    cleanups.push(await listen<string>('capture-error', (event) => report(event.payload)));
    const snapshot = await invoke<HistorySnapshot>('initialize_history', { legacy, shortcut });
    apply(normalizeSnapshot(snapshot));
    // Rust has committed the import and its exact legacy backup before replying.
    try {
      localStorage.removeItem('clipjar-storage');
      localStorage.removeItem('clipjar_shortcut_mode');
    } catch {
      report('记录已迁移，但旧缓存未能清理；请重启后重试。');
    }
    return () => cleanups.forEach((stop) => stop());
  } catch (error) {
    cleanups.forEach((stop) => stop());
    throw error;
  }
}
export async function historyAction(action: HistoryAction) {
  return normalizeSnapshot(await invoke<HistorySnapshot>('history_action', { action }));
}
export async function refreshHistory() {
  return normalizeSnapshot(await invoke<HistorySnapshot>('history_snapshot'));
}
