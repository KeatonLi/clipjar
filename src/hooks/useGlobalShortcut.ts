import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { createShortcutHandler } from '../utils/shortcut';

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;
export type ShortcutMode = string;

export function useGlobalShortcut(shortcutMode: ShortcutMode) {
  // Serialize registration/cleanup, including StrictMode and rapid setting changes.
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (!isTauri || !shortcutMode) return;
    let active = true;
    let registered = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const normalized = shortcutMode.toLowerCase().trim();
    const doublePress = ['win', 'super', 'cmd', 'command', 'option', 'alt'].includes(normalized);
    const key = doublePress ? (['option', 'alt'].includes(normalized) ? 'Alt' : 'Super') : shortcutMode;
    const reportError = (error: unknown) => console.error('[ClipJar] 快捷键注册/注销失败:', error);
    const handler = createShortcutHandler(doublePress, () => {
      if (!active) return;
      const window = getCurrentWindow();
      void window.show().then(() => {
        if (!active) return;
        clearTimeout(focusTimer);
        focusTimer = setTimeout(() => {
          if (active) void window.setFocus().catch(reportError);
        }, 100);
      }).catch(reportError);
    });

    queue.current = queue.current.then(async () => {
      if (!active) return;
      if (await isRegistered(key)) throw new Error(`快捷键已被占用: ${key}`);
      if (!active) return;
      await register(key, event => { if (active) handler(event); });
      registered = true;
    }).catch(reportError);

    return () => {
      active = false;
      clearTimeout(focusTimer);
      queue.current = queue.current.then(async () => {
        if (registered) {
          await unregister(key);
          registered = false;
        }
      }).catch(reportError);
    };
  }, [shortcutMode]);
}
