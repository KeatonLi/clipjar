import { useEffect, useCallback, useRef } from 'react';

const isTauri = !!window.__TAURI__;

// 转换自定义快捷键为 Tauri 格式
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
      // 普通按键
      result.push(part.toUpperCase());
    }
  }

  return result.join('+');
}

export type ShortcutMode = string;

export function useGlobalShortcut(shortcutMode: ShortcutMode) {
  const modeRef = useRef(shortcutMode);
  const registeredRef = useRef<string | null>(null);

  // 同步外部传入的模式
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
    } catch (err) {
      console.error('切换窗口失败:', err);
    }
  }, []);

  // 注册/更新全局快捷键
  const registerShortcut = useCallback(async () => {
    if (!isTauri) return;

    try {
      const { register, unregister, isRegistered } = await import('@tauri-apps/plugin-global-shortcut');

      // 转换快捷键格式
      const tauriKey = convertToTauriShortcut(modeRef.current);
      console.log(`[ClipJar] 尝试注册快捷键: ${modeRef.current} -> ${tauriKey}`);

      // 如果已注册其他快捷键，先注销
      if (registeredRef.current && registeredRef.current !== tauriKey) {
        try {
          const wasRegistered = await isRegistered(registeredRef.current);
          if (wasRegistered) {
            await unregister(registeredRef.current);
            console.log(`[ClipJar] 已注销快捷键: ${registeredRef.current}`);
          }
        } catch (e) {
          console.log('[ClipJar] 注销快捷键失败:', e);
        }
      }

      // 检查当前快捷键是否已注册
      const alreadyRegistered = await isRegistered(tauriKey);

      if (!alreadyRegistered) {
        await register(tauriKey, () => {
          console.log('[ClipJar] 快捷键触发');
          toggleWindow();
        });
        console.log(`[ClipJar] 全局快捷键已注册: ${modeRef.current}`);
      }

      registeredRef.current = tauriKey;
    } catch (err) {
      console.error('[ClipJar] 注册全局快捷键失败:', err);
    }
  }, [toggleWindow]);

  // 首次加载时注册
  useEffect(() => {
    registerShortcut();
  }, [registerShortcut]);

  // 当模式改变时重新注册
  useEffect(() => {
    // 延迟一点执行，确保状态已更新
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
