import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { createShortcutHandler } from '../utils/shortcut';

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;
export type ShortcutMode = string;
export interface ShortcutStatus {
  state: 'unavailable' | 'registering' | 'registered' | 'error';
  message: string;
}

export function useGlobalShortcut(shortcutMode: ShortcutMode) {
  // Serialize registration/cleanup, including StrictMode and rapid setting changes.
  const queue = useRef(Promise.resolve());
  const [status, setStatus] = useState<ShortcutStatus>({
    state: isTauri ? 'registering' : 'unavailable',
    message: isTauri ? '正在注册快捷键…' : '浏览器中可保存偏好，系统唤起仅桌面端可用。'
  });

  useEffect(() => {
    if (!isTauri || !shortcutMode) return;
    setStatus({ state: 'registering', message: '正在注册快捷键…' });
    let active = true;
    let registered = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const normalized = shortcutMode.toLowerCase().trim();
    const doublePress = ['win', 'super', 'cmd', 'command', 'option', 'alt'].includes(normalized);
    const key = doublePress
      ? ['option', 'alt'].includes(normalized)
        ? 'Alt'
        : 'Super'
      : shortcutMode;
    const reportError = (error: unknown) => {
      console.error('[ClipJar] 快捷键注册/注销失败:', error);
      if (active)
        setStatus({
          state: 'error',
          message: '快捷键注册失败，可能已被占用。请选择另一组快捷键。'
        });
    };
    const handler = createShortcutHandler(doublePress, () => {
      if (!active) return;
      const window = getCurrentWindow();
      void window
        .show()
        .then(() => {
          if (!active) return;
          clearTimeout(focusTimer);
          focusTimer = setTimeout(() => {
            if (active) void window.setFocus().catch(reportError);
          }, 100);
        })
        .catch(reportError);
    });

    queue.current = queue.current
      .then(async () => {
        if (!active) return;
        if (await isRegistered(key)) throw new Error(`快捷键已被占用: ${key}`);
        if (!active) return;
        await register(key, (event) => {
          if (active) handler(event);
        });
        registered = true;
        if (active) setStatus({ state: 'registered', message: '快捷键已生效' });
      })
      .catch(reportError);

    return () => {
      active = false;
      clearTimeout(focusTimer);
      queue.current = queue.current
        .then(async () => {
          if (registered) {
            await unregister(key);
            registered = false;
          }
        })
        .catch(reportError);
    };
  }, [shortcutMode]);
  return status;
}
