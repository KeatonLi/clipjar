import { useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useClipboardStore } from '../stores/clipboardStore';
import { type ClipboardItem, ContentType } from '../types';

const isTauri = !!window.__TAURI__;

const detectContentType = (content: string): ContentType => {
  if (/^https?:\/\/\S+$/i.test(content)) {
    return ContentType.LINK;
  }
  if (/[{};]|function|const|let|var|import|export/.test(content) && content.includes('\n')) {
    return ContentType.CODE;
  }
  return ContentType.TEXT;
};

interface ClipboardEvent {
  content: string;
  timestamp: number;
}

export function useClipboard() {
  const { addItem: storeAddItem } = useClipboardStore();
  const lastContentRef = useRef('');

  const initClipboard = useCallback(() => {
    if (!isTauri) {
      const interval = setInterval(async () => {
        try {
          const text = await navigator.clipboard.readText();
          const lastContent = lastContentRef.current;
          
          if (text && text !== lastContent) {
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
            console.log('New clipboard item:', text.substring(0, 50));
          }
        } catch {
          // 忽略剪贴板读取错误
        }
      }, 1000);

      return () => clearInterval(interval);
    }

    let unlisten: (() => void) | null = null;

    listen<ClipboardEvent>('clipboard-change', (event) => {
      const { content } = event.payload;
      const lastContent = lastContentRef.current;
      
      if (content && content !== lastContent) {
        lastContentRef.current = content;
        
        const newItem: ClipboardItem = {
          id: Date.now(),
          content,
          contentType: detectContentType(content),
          sourceApp: 'System',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isFavorite: false,
          useCount: 0,
          tags: [],
        };
        
        storeAddItem(newItem);
        console.log('New clipboard item from backend:', content.substring(0, 50));
      }
    }).then((fn: () => void) => { unlisten = fn; });

    return () => { if (unlisten) unlisten(); };
  }, [storeAddItem]);

  const copyToClipboard = useCallback(async (content: string) => {
    try {
      if (isTauri) {
        await invoke('write_clipboard_text', { text: content });
      } else {
        await navigator.clipboard.writeText(content);
      }
      return true;
    } catch {
      console.error('Failed to copy');
      return false;
    }
  }, []);

  const copyToClipboardNative = copyToClipboard;

  return {
    initClipboard,
    copyToClipboard,
    copyToClipboardNative,
  };
}

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}
