import { useRef, useCallback, useEffect, useState } from 'react';
import { useClipboardStore } from '../stores/clipboardStore';
import { type ClipboardItem, ContentType, type ImageData } from '../types';
import { APP_CONFIG } from '../utils/constants';
import { readText, readImage, writeText, writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { convertImageToBase64, resizeImage, estimateImageSize } from '../utils/image';

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;

/** 内容去重使用的内容哈希 */
function createContentHash(content: string, imageKey?: string): string {
  return imageKey ? `img:${imageKey}` : `text:${content.slice(0, 200)}`;
}

/** 检测内容类型 */
function detectContentType(content: string): ContentType {
  if (/^https?:\/\/\S+$/i.test(content)) {
    return ContentType.LINK;
  }
  if (/[{};]|function|const|let|var|import|export/.test(content) && content.includes('\n')) {
    return ContentType.CODE;
  }
  return ContentType.TEXT;
}

interface ClipboardState {
  lastTextHash: string;
  lastImageHash: string;
  isReading: boolean;
  errorCount: number;
}

/** 剪贴板 Hook - 优化内存版本 */
export function useClipboard() {
  const { addItem } = useClipboardStore();
  const stateRef = useRef<ClipboardState>({
    lastTextHash: '',
    lastImageHash: '',
    isReading: false,
    errorCount: 0,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibilityRef = useRef(true);
  const [isEnabled, setIsEnabled] = useState(true);

  /** 处理文本内容 */
  const processText = useCallback(async (text: string) => {
    if (!text || !text.trim()) return;

    const hash = createContentHash(text);
    if (hash === stateRef.current.lastTextHash) return;

    // 截断过长内容以减少内存占用
    const maxLength = APP_CONFIG.MAX_CONTENT_LENGTH;
    const processedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '...'
      : text;

    const newItem: ClipboardItem = {
      id: Date.now(),
      content: processedText,
      contentType: detectContentType(processedText),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isFavorite: false,
      useWeight: 0,
      tags: [],
    };

    stateRef.current.lastTextHash = hash;
    addItem(newItem);
  }, [addItem]);

  /** 处理图片内容 */
  const processImage = useCallback(async (imageData: ImageData) => {
    if (!imageData?.width || !imageData?.height) return;

    const imageKey = `${imageData.width}x${imageData.height}`;
    const hash = createContentHash('', imageKey);
    
    if (hash === stateRef.current.lastImageHash) return;

    try {
      // 估计图片大小，如果太大则压缩
      const estimatedSize = estimateImageSize(imageData.width, imageData.height);
      let base64: string;

      if (estimatedSize > 1024 * 1024) {
        // 大于 1MB，进行压缩
        base64 = await resizeImage(imageData, 800, 600);
      } else {
        base64 = await convertImageToBase64(imageData);
      }

      const newItem: ClipboardItem = {
        id: Date.now(),
        content: `[图片 ${imageData.width}x${imageData.height}]`,
        contentType: ContentType.IMAGE,
        imagePath: base64,
        imageWidth: imageData.width,
        imageHeight: imageData.height,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isFavorite: false,
        useWeight: 0,
        tags: [],
      };

      stateRef.current.lastImageHash = hash;
      addItem(newItem);
    } catch (err) {
      console.error('处理图片失败:', err);
    }
  }, [addItem]);

  /** 读取剪贴板 */
  const readClipboard = useCallback(async () => {
    if (!isTauri || stateRef.current.isReading || !visibilityRef.current) return;

    stateRef.current.isReading = true;

    try {
      // 读取文本
      const text = await readText();
      if (text) {
        await processText(text);
      }

      // 读取图片
      try {
        const imageData = await readImage() as unknown as ImageData;
        if (imageData) {
          await processImage(imageData);
        }
      } catch {
        // 没有图片时静默处理
      }

      // 成功读取，重置错误计数
      stateRef.current.errorCount = 0;
    } catch (err) {
      stateRef.current.errorCount++;
      
      // 连续错误超过 5 次，暂停读取
      if (stateRef.current.errorCount > 5) {
        console.error('剪贴板读取失败次数过多，暂停读取');
        setIsEnabled(false);
      }
    } finally {
      stateRef.current.isReading = false;
    }
  }, [processText, processImage]);

  /** 复制到剪贴板 */
  const copyToClipboard = useCallback(async (content: string, imagePath?: string, contentType?: ContentType) => {
    if (!isTauri) return false;

    try {
      if (contentType === ContentType.IMAGE && imagePath) {
        // 图片类型
        const response = await fetch(imagePath);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await writeImage(uint8Array);
      } else {
        // 文本类型
        await writeText(content);
        stateRef.current.lastTextHash = createContentHash(content);
      }
      return true;
    } catch (err) {
      console.error('复制失败:', err);
      return false;
    }
  }, []);

  /** 启用/禁用剪贴板监听 */
  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    if (enabled) {
      stateRef.current.errorCount = 0;
    }
  }, []);

  // 页面可见性变化时暂停/恢复读取
  useEffect(() => {
    const handleVisibilityChange = () => {
      visibilityRef.current = document.visibilityState === 'visible';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // 剪贴板轮询
  useEffect(() => {
    if (!isTauri || !isEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 立即读取一次
    readClipboard();

    // 设置轮询间隔 - 根据应用是否在前台动态调整
    const poll = () => {
      if (visibilityRef.current) {
        readClipboard();
      }
    };

    intervalRef.current = setInterval(poll, APP_CONFIG.CLIPBOARD_POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isEnabled, readClipboard]);

  return {
    copyToClipboard,
    isEnabled,
    setEnabled,
    readClipboard,
  };
}
