import { useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;

/** 转换快捷键格式为 Tauri 格式 */
function convertToTauriShortcut(shortcut: string): string {
  const parts = shortcut.split('+').map(p => p.trim().toLowerCase());
  const result: string[] = [];

  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') {
      result.push('CommandOrControl');
    } else if (part === 'alt') {
      result.push('Alt');
    } else if (part === 'shift') {
      result.push('Shift');
    } else if (part === 'cmd' || part === 'command' || part === 'super' || part === 'meta') {
      result.push('Super');
    } else if (part.length === 1) {
      result.push(part.toUpperCase());
    } else if (part) {
      const keyMap: Record<string, string> = {
        'escape': 'Escape',
        'esc': 'Escape',
        'tab': 'Tab',
        'space': 'Space',
        'enter': 'Return',
        'return': 'Return',
        'backspace': 'Backspace',
        'delete': 'Delete',
        'up': 'Up',
        'down': 'Down',
        'left': 'Left',
        'right': 'Right',
        'home': 'Home',
        'end': 'End',
        'pageup': 'PageUp',
        'pagedown': 'PageDown',
        'f1': 'F1', 'f2': 'F2', 'f3': 'F3', 'f4': 'F4',
        'f5': 'F5', 'f6': 'F6', 'f7': 'F7', 'f8': 'F8',
        'f9': 'F9', 'f10': 'F10', 'f11': 'F11', 'f12': 'F12',
      };
      result.push(keyMap[part] || part.toUpperCase());
    }
  }

  return result.join('+');
}

export type ShortcutMode = string;

function isValidShortcut(shortcut: string): boolean {
  if (!shortcut || shortcut.trim().length === 0) return false;
  const parts = shortcut.split('+').filter(p => p.trim());
  const hasModifier = parts.some(p =>
    ['ctrl', 'control', 'alt', 'shift', 'cmd', 'command', 'super', 'meta'].includes(p.toLowerCase())
  );
  const hasKey = parts.some(p => {
    const lower = p.toLowerCase();
    return !['ctrl', 'control', 'alt', 'shift', 'cmd', 'command', 'super', 'meta'].includes(lower);
  });
  return hasModifier && hasKey;
}

export function useGlobalShortcut(shortcutMode: ShortcutMode) {
  const registeredShortcutRef = useRef<string | null>(null);
  const isRegisteringRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // 防抖定时器 - 防止快捷键重复触发
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleWindow = useCallback(async () => {
    if (!isTauri) return;

    // 如果已经有待处理的切换操作，忽略新的触发
    if (debounceTimerRef.current) {
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const appWindow = getCurrentWindow();

        // 始终显示并置于前台，不再隐藏
        await appWindow.show();
        // 延迟获取焦点，确保窗口完全显示
        setTimeout(async () => {
          try {
            await appWindow.setFocus();
          } catch (err) {
            console.error('设置焦点失败:', err);
          }
        }, 100);
      } catch (err) {
        console.error('切换窗口失败:', err);
      } finally {
        // 300ms 内忽略后续的快捷键触发
        setTimeout(() => {
          debounceTimerRef.current = null;
        }, 300);
      }
    }, 100);
  }, []);

  const unregisterCurrent = useCallback(async () => {
    if (!isTauri || !registeredShortcutRef.current) return;

    try {
      const wasRegistered = await isRegistered(registeredShortcutRef.current);
      if (wasRegistered) {
        await unregister(registeredShortcutRef.current);
      }
    } catch {
      // 静默处理注销错误
    } finally {
      registeredShortcutRef.current = null;
    }
  }, []);

  const registerShortcut = useCallback(async (shortcut: string) => {
    if (!isTauri || isRegisteringRef.current) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const tauriKey = convertToTauriShortcut(shortcut);

    if (!isValidShortcut(shortcut)) {
      console.warn('无效的快捷键格式:', shortcut);
      return;
    }

    if (registeredShortcutRef.current === tauriKey) return;

    isRegisteringRef.current = true;

    try {
      await unregisterCurrent();

      const alreadyRegistered = await isRegistered(tauriKey);
      if (alreadyRegistered) {
        console.warn('快捷键已被占用:', tauriKey);
        return;
      }

      // 注册快捷键，只在按键时触发（不在按住不放时重复触发）
      await register(tauriKey, () => {
        toggleWindow();
      });

      registeredShortcutRef.current = tauriKey;
    } catch (err) {
      console.error('注册快捷键失败:', err);
    } finally {
      isRegisteringRef.current = false;
    }
  }, [toggleWindow, unregisterCurrent]);

  useEffect(() => {
    if (!isTauri || !shortcutMode) return;

    registerShortcut(shortcutMode);

    return () => {
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [shortcutMode, registerShortcut]);

  useEffect(() => {
    return () => {
      unregisterCurrent();
    };
  }, [unregisterCurrent]);
}
