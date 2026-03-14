import { useRef, useCallback } from 'react';
import { useClipboardStore } from '../stores/clipboardStore';
import { type ClipboardItem, ContentType } from '../types';
import { APP_CONFIG } from '../utils/constants';

const detectContentType = (content: string): ContentType => {
  if (/^https?:\/\/\S+$/i.test(content)) {
    return ContentType.LINK;
  }
  if (/[{};]|function|const|let|var|import|export/.test(content) && content.includes('\n')) {
    return ContentType.CODE;
  }
  return ContentType.TEXT;
};

export function useClipboard() {
  const { addItem: storeAddItem } = useClipboardStore();
  const lastContentRef = useRef('');
  const intervalRef = useRef<number | null>(null);

  const initClipboard = useCallback(() => {
    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const lastContent = lastContentRef.current;

        if (text && text.trim() && text !== lastContent) {
          lastContentRef.current = text;

          const newItem: ClipboardItem = {
            id: Date.now(),
            content: text,
            contentType: detectContentType(text),
            sourceApp: 'System',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isFavorite: false,
            useCount: 0,
            tags: [],
          };

          storeAddItem(newItem);
        }
      } catch {
        // 静默处理剪贴板读取错误
      }
    };

    checkClipboard();
    intervalRef.current = window.setInterval(checkClipboard, APP_CONFIG.CLIPBOARD_POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [storeAddItem]);

  const copyToClipboard = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      lastContentRef.current = content;
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    initClipboard,
    copyToClipboard,
  };
}
