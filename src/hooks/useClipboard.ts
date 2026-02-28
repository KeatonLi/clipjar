import { useRef, useCallback } from 'react';
import { useClipboardStore } from '../stores/clipboardStore';
import { type ClipboardItem, ContentType } from '../types';

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
    // 直接使用前端轮询，更可靠
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
          console.log('[ClipJar] New clipboard item:', text.substring(0, 30));
        }
      } catch (err) {
        // 静默处理剪贴板读取错误
      }
    };

    // 立即检查一次
    checkClipboard();

    // 每800ms检查一次剪贴板
    intervalRef.current = window.setInterval(checkClipboard, 800);

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
      // 更新最后内容，避免触发自己的复制
      lastContentRef.current = content;
      return true;
    } catch {
      console.error('Failed to copy');
      return false;
    }
  }, []);

  return {
    initClipboard,
    copyToClipboard,
  };
}
