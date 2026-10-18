import { useEffect, useRef } from 'react';
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

/** Only the currently mounted mode can activate; all register/cleanup work is serialized. */
export function useGlobalShortcut(mode: ShortcutMode, onError?: (message: string) => void): void {
  const errorCallback = useRef(onError);
  errorCallback.current = onError;

  useEffect(() => {
    if (!isNativeClipboard() || !mode.trim()) return;
    const owner = Symbol('ClipJar shortcut');
    const shortcut = resolveShortcut(mode);
    let cancelled = false;
    const report = (error: unknown) => {
      if (!cancelled) errorCallback.current?.(`快捷键「${mode}」无法启用：${describeError(error)}${shortcut.doublePress ? '。请尝试 Ctrl/⌘ + Shift + V。' : ''}`);
    };
    const activate = async () => {
      if (cancelled || !registry.owns(owner)) return;
      try {
        const window = getCurrentWindow();
        await window.show();
        if (!cancelled && registry.owns(owner)) await window.setFocus();
      } catch (error) {
        if (!cancelled) errorCallback.current?.(`快捷键无法打开窗口：${describeError(error)}`);
      }
    };
    const trigger = createShortcutTrigger(shortcut.doublePress, () => { void activate(); });

    void registry.register(owner, shortcut.key, trigger, () => cancelled).catch(report);

    return () => {
      cancelled = true;
      void registry.release(owner).catch(() => { /* Retain ownership for the next registration to retry. */ });
    };
  }, [mode]);
}
