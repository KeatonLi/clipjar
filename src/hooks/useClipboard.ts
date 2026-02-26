import { useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useClipboardStore } from '../stores/clipboardStore';
import { ContentType, type ClipboardItem } from '../types';

interface ClipboardChangeEvent {
  content: string;
  timestamp: number;
}

export function useClipboard() {
  const addItem = useClipboardStore((state) => state.addItem);
  const lastContent = useRef<string>('');

  const detectContentType = (content: string): ContentType => {
    // 检测链接
    if (/^https?:\/\/\S+$/i.test(content)) {
      return ContentType.LINK;
    }
    // 检测代码（包含特殊字符或缩进）
    if (/[{};]|function|const|let|var|import|export/.test(content) && content.includes('\n')) {
      return ContentType.CODE;
    }
    return ContentType.TEXT;
  };

  const createClipboardItem = (content: string): ClipboardItem => {
    const contentType = detectContentType(content);

    return {
      id: Date.now(),
      content,
      contentType,
      sourceApp: 'System',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isFavorite: false,
      useCount: 0,
      tags: [],
    };
  };

  const initClipboard = useCallback(() => {
    // 监听 Tauri 后端发送的剪贴板变化事件
    const setupListener = async () => {
      const unlisten = await listen<ClipboardChangeEvent>('clipboard-change', (event) => {
        const { content } = event.payload;

        // 避免重复添加
        if (content && content !== lastContent.current) {
          lastContent.current = content;
          const newItem = createClipboardItem(content);
          addItem(newItem);

          // 可选：显示系统通知
          console.log('New clipboard item:', content.substring(0, 50));
        }
      });

      return unlisten;
    };

    const unlistenPromise = setupListener();

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [addItem]);

  const copyToClipboard = useCallback(async (content: string) => {
    try {
      // 优先使用 Tauri API
      if (window.__TAURI__) {
        await invoke('write_clipboard_text', { text: content });
        return true;
      }
      // 降级使用 Web API
      await navigator.clipboard.writeText(content);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  }, []);

  const copyToClipboardNative = useCallback(async (content: string) => {
    try {
      await invoke('write_clipboard_text', { text: content });
      return true;
    } catch (err) {
      console.error('Failed to copy via Tauri:', err);
      return false;
    }
  }, []);

  return {
    initClipboard,
    createClipboardItem,
    copyToClipboard,
    copyToClipboardNative,
  };
}

// 扩展 Window 接口
declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}
