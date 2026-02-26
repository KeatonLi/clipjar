import { useEffect, useCallback } from 'react';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useGlobalShortcut() {
  const toggleWindow = useCallback(async () => {
    try {
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
    const setupShortcut = async () => {
      try {
        // 注册全局快捷键 Cmd/Ctrl + Shift + V
        await register('CommandOrControl+Shift+V', () => {
          toggleWindow();
        });
        console.log('Global shortcut registered: Cmd/Ctrl+Shift+V');
      } catch (err) {
        console.error('Failed to register global shortcut:', err);
      }
    };

    setupShortcut();

    return () => {
      // 清理快捷键
      unregister('CommandOrControl+Shift+V').catch((err) => {
        console.error('Failed to unregister shortcut:', err);
      });
    };
  }, [toggleWindow]);

  return { toggleWindow };
}
