import { useEffect, useCallback } from 'react';

const isTauri = !!window.__TAURI__;

export function useGlobalShortcut() {
  const toggleWindow = useCallback(async () => {
    if (!isTauri) return;
    
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const window = getCurrentWindow();
      const isVisible = await window.isVisible();

      if (isVisible) {
        await window.hide();
      } else {
        await window.show();
        await window.setFocus();
      }
    } catch (err) {
      console.error('Failed to toggle window:', err);
    }
  }, []);

  useEffect(() => {
    if (!isTauri) return;

    let unregisterFn: (() => void) | null = null;

    const setupShortcut = async () => {
      try {
        const { register, unregister } = await import('@tauri-apps/plugin-global-shortcut');
        
        await register('CommandOrControl+Shift+V', () => {
          toggleWindow();
        });
        console.log('Global shortcut registered: Cmd/Ctrl+Shift+V');

        unregisterFn = async () => {
          try {
            await unregister('CommandOrControl+Shift+V');
          } catch (err) {
            console.error('Failed to unregister shortcut:', err);
          }
        };
      } catch (err) {
        console.error('Failed to register global shortcut:', err);
      }
    };

    setupShortcut();

    return () => {
      if (unregisterFn) {
        unregisterFn();
      }
    };
  }, [toggleWindow]);

  return { toggleWindow };
}

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}
