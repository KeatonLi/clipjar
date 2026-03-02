import { useEffect, useCallback, useRef } from 'react';

const isTauri = !!window.__TAURI__;

function convertToTauriShortcut(shortcut: string): string {
  const parts = shortcut.split('+').map(p => p.trim());
  const result: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      result.push('CommandOrControl');
    } else if (lower === 'alt') {
      result.push('Alt');
    } else if (lower === 'shift') {
      result.push('Shift');
    } else if (lower === 'cmd' || lower === 'command') {
      result.push('Super');
    } else if (lower === 'super') {
      result.push('Super');
    } else {
      result.push(part.toUpperCase());
    }
  }

  return result.join('+');
}

export type ShortcutMode = string;

export function useGlobalShortcut(shortcutMode: ShortcutMode) {
  const modeRef = useRef(shortcutMode);
  const registeredRef = useRef<string | null>(null);

  useEffect(() => {
    modeRef.current = shortcutMode;
    localStorage.setItem('clipjar_shortcut_mode', shortcutMode);
  }, [shortcutMode]);

  const toggleWindow = useCallback(async () => {
    if (!isTauri) return;

    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      const isVisible = await appWindow.isVisible();

      if (isVisible) {
        await appWindow.hide();
      } else {
        await appWindow.show();
        await appWindow.setFocus();
      }
    } catch {
      // 静默处理窗口切换错误
    }
  }, []);

  const registerShortcut = useCallback(async () => {
    if (!isTauri) return;

    try {
      const { register, unregister, isRegistered } = await import('@tauri-apps/plugin-global-shortcut');

      const tauriKey = convertToTauriShortcut(modeRef.current);

      if (registeredRef.current && registeredRef.current !== tauriKey) {
        try {
          const wasRegistered = await isRegistered(registeredRef.current);
          if (wasRegistered) {
            await unregister(registeredRef.current);
          }
        } catch {
          // 静默处理注销错误
        }
      }

      const alreadyRegistered = await isRegistered(tauriKey);

      if (!alreadyRegistered) {
        await register(tauriKey, () => {
          toggleWindow();
        });
      }

      registeredRef.current = tauriKey;
    } catch {
      // 静默处理注册错误
    }
  }, [toggleWindow]);

  useEffect(() => {
    registerShortcut();
  }, [registerShortcut]);

  useEffect(() => {
    const timer = setTimeout(() => {
      registerShortcut();
    }, 100);
    return () => clearTimeout(timer);
  }, [shortcutMode, registerShortcut]);
}

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}
