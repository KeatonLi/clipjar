import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { isNativeClipboard } from '../lib/clipboardClient';
import { createShortcutTrigger, resolveShortcut } from './shortcutModel';
import { createShortcutRegistry } from './shortcutRegistry';

export type ShortcutMode = string;

const registry = createShortcutRegistry({
  isRegistered,
  unregister,
  register: (key, handler) => register(key, event => handler(event.state)),
});

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Register before persisting a change; failed changes leave the last usable shortcut active. */
export function useGlobalShortcut(mode: ShortcutMode, onError?: (message: string) => void): (nextMode: ShortcutMode, persist: () => Promise<void>) => Promise<void> {
  const errorCallback = useRef(onError);
  errorCallback.current = onError;
  const owner = useRef(Symbol('ClipJar shortcut'));
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const token = owner.current;
    return () => {
      mounted.current = false;
      if (isNativeClipboard()) void registry.release(token).catch(error => { console.warn('[ClipJar] 快捷键清理将在下次注册时重试：', error); });
    };
  }, []);

  const activate = useCallback(async () => {
    if (!mounted.current || !registry.owns(owner.current)) return;
    try {
      const window = getCurrentWindow();
      await window.show();
      if (mounted.current && registry.owns(owner.current)) await window.setFocus();
    } catch (error) {
      if (mounted.current) errorCallback.current?.(`快捷键无法打开窗口：${describeError(error)}`);
    }
  }, []);

  const applyMode = useCallback(async (nextMode: string, cancelled: () => boolean, persist?: () => Promise<void>) => {
    const shortcut = resolveShortcut(nextMode);
    try {
      if (!shortcut.key) throw new Error('快捷键不能为空');
      const result = await registry.register(owner.current, shortcut.key, createShortcutTrigger(shortcut.doublePress, () => { void activate(); }), cancelled, persist);
      if (!cancelled() && mounted.current) {
        if (result.warning) errorCallback.current?.(result.warning);
        else if (result.changed) errorCallback.current?.('');
      }
    } catch (error) {
      const message = `快捷键「${nextMode}」无法启用：${describeError(error)}${registry.owns(owner.current) ? '。原快捷键仍可使用。' : ''}${shortcut.doublePress ? '请尝试 Ctrl/⌘ + Shift + V。' : ''}`;
      if (!cancelled() && mounted.current) errorCallback.current?.(message);
      throw new Error(message);
    }
  }, [activate]);

  useEffect(() => {
    if (!isNativeClipboard() || !mode.trim()) return;
    let cancelled = false;
    void applyMode(mode, () => cancelled || !mounted.current).catch(() => {});
    // Only cancel obsolete requests; the committed binding survives mode changes.
    return () => { cancelled = true; };
  }, [mode, applyMode]);

  return useCallback(async (nextMode, persist) => {
    errorCallback.current?.('');
    if (!isNativeClipboard()) { await persist(); return; }
    await applyMode(nextMode, () => !mounted.current, persist);
  }, [applyMode]);
}
