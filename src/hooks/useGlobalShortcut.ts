import { useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;

// 双击检测配置
const DOUBLE_PRESS_THRESHOLD_MS = 500; // 500ms 内双击视为有效

// 判断是否为"双击键"（单独的修饰键：Win、Option 或 Cmd）
function isDoublePressKey(shortcut: string): boolean {
  const normalized = shortcut.toLowerCase().trim();
  return normalized === 'win' || normalized === 'super' || normalized === 'cmd' || normalized === 'command' || normalized === 'option' || normalized === 'alt';
}

// 获取 Tauri 格式的修饰键
function getModifierKey(shortcut: string): string {
  const normalized = shortcut.toLowerCase().trim();
  if (normalized === 'win' || normalized === 'super') {
    return 'Super';
  }
  if (normalized === 'cmd' || normalized === 'command') {
    return 'Super'; // Tauri 中 Cmd = Super
  }
  if (normalized === 'option' || normalized === 'alt') {
    return 'Option';
  }
  return 'Super';
}

export type ShortcutMode = string;

export function useGlobalShortcut(shortcutMode: ShortcutMode) {
  const registeredShortcutRef = useRef<string | null>(null);
  const isRegisteringRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 双击检测状态
  const doublePressStateRef = useRef({
    firstPressTime: 0,
    isWaitingForSecondPress: false,
    resetTimer: null as ReturnType<typeof setTimeout> | null,
  });

  // 显示窗口的函数
  const showAndFocusWindow = useCallback(async () => {
    if (!isTauri) return;

    try {
      const appWindow = getCurrentWindow();
      await appWindow.show();
      // 延迟获取焦点，确保窗口完全显示
      setTimeout(async () => {
        try {
          await appWindow.setFocus();
        } catch (err) {
          console.warn('[ClipJar] 设置焦点失败:', err);
        }
      }, 100);
    } catch (err) {
      console.warn('[ClipJar] 显示窗口失败:', err);
    }
  }, []);

  // 双击检测处理器
  const handleDoublePress = useCallback(() => {
    const now = Date.now();
    const state = doublePressStateRef.current;

    if (state.isWaitingForSecondPress) {
      // 第二次点击
      const timeSinceFirstPress = now - state.firstPressTime;

      if (timeSinceFirstPress < DOUBLE_PRESS_THRESHOLD_MS) {
        // 双击检测成功！
        console.log('[ClipJar] 双击检测成功');

        // 清除重置定时器
        if (state.resetTimer) {
          clearTimeout(state.resetTimer);
          state.resetTimer = null;
        }

        // 重置状态
        state.isWaitingForSecondPress = false;
        state.firstPressTime = 0;

        // 显示窗口
        showAndFocusWindow();
        return;
      } else {
        // 超时了，当作第一次处理
        console.log('[ClipJar] 双击超时，重新计时');
        state.isWaitingForSecondPress = false;
      }
    }

    // 第一次点击
    state.firstPressTime = now;
    state.isWaitingForSecondPress = true;

    // 设置超时重置
    if (state.resetTimer) {
      clearTimeout(state.resetTimer);
    }
    state.resetTimer = setTimeout(() => {
      console.log('[ClipJar] 双击等待超时，重置');
      state.isWaitingForSecondPress = false;
      state.firstPressTime = 0;
      state.resetTimer = null;
    }, DOUBLE_PRESS_THRESHOLD_MS);

  }, [showAndFocusWindow]);

  // 标准快捷键处理器（单次触发）
  const handleSinglePress = useCallback(() => {
    showAndFocusWindow();
  }, [showAndFocusWindow]);

  // 注销当前快捷键
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

  // 注册快捷键
  const registerShortcut = useCallback(async (shortcut: string) => {
    if (!isTauri || isRegisteringRef.current) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // 判断是否为双击键
    const isDoublePress = isDoublePressKey(shortcut);

    // 获取要注册的键
    const tauriKey = isDoublePress ? getModifierKey(shortcut) : shortcut;

    console.log(`[ClipJar] 注册快捷键: ${shortcut} (${isDoublePress ? '双击' : '单击'}模式, Tauri key: ${tauriKey})`);

    if (registeredShortcutRef.current === tauriKey) return;

    isRegisteringRef.current = true;

    try {
      await unregisterCurrent();

      const alreadyRegistered = await isRegistered(tauriKey);
      if (alreadyRegistered) {
        console.warn('[ClipJar] 快捷键已被占用:', tauriKey);
        return;
      }

      // 注册快捷键
      await register(tauriKey, () => {
        if (isDoublePress) {
          handleDoublePress();
        } else {
          handleSinglePress();
        }
      });

      registeredShortcutRef.current = tauriKey;
      console.log('[ClipJar] 快捷键注册成功:', tauriKey);
    } catch (err) {
      console.error('[ClipJar] 注册快捷键失败:', err);
    } finally {
      isRegisteringRef.current = false;
    }
  }, [handleDoublePress, handleSinglePress, unregisterCurrent]);

  // 初始化和清理
  useEffect(() => {
    if (!isTauri || !shortcutMode) return;

    registerShortcut(shortcutMode);

    return () => {
      abortControllerRef.current?.abort();
      // 清除双击检测定时器
      if (doublePressStateRef.current.resetTimer) {
        clearTimeout(doublePressStateRef.current.resetTimer);
      }
    };
  }, [shortcutMode, registerShortcut]);

  // 组件卸载时注销
  useEffect(() => {
    return () => {
      unregisterCurrent();
    };
  }, [unregisterCurrent]);
}