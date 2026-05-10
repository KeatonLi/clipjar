import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useClipboardStore } from './stores/clipboardStore';
import { type ClipboardItem, ContentType, type ImageData } from './types';
import { useGlobalShortcut, type ShortcutMode } from './hooks/useGlobalShortcut';
import { detectContentType } from './utils';
import { convertImageToBase64, resizeImage, estimateImageSize } from './utils/image';
import { APP_CONFIG, STORAGE_KEYS } from './utils/constants';
import {
  Search, X, Settings, Grid, Heart, Clipboard
} from 'lucide-react';
import { readText, readImage, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { SettingsModal } from './components/Settings';
import { ItemRow } from './components/ItemRow';

// 图片大小限制
const MAX_IMAGE_PIXELS = 4096 * 4096;
const MAX_BASE64_SIZE = 5 * 1024 * 1024;

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;

export default function App() {
  const {
    items,
    addItem,
    deleteItem,
    toggleFavorite,
    updateNote,
    clearAll,
    settings,
    setSettings
  } = useClipboardStore();

  // UI State
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [shortcutMode, setShortcutMode] = useState<ShortcutMode>(() => {
    return localStorage.getItem(STORAGE_KEYS.SHORTCUT_MODE) || 'CommandOrControl+Shift+V';
  });
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Refs for clipboard monitoring
  const lastContentRef = useRef('');
  const lastImageRef = useRef('');
  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search debounce
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Visibility tracking for performance
  const isVisibleRef = useRef(true);

  useGlobalShortcut(shortcutMode);

  // Sync to backend
  const syncToBackend = useCallback(async (item: ClipboardItem) => {
    if (!isTauri) return;
    try {
      await invoke('add_clipboard_item', {
        content: item.content,
        contentType: item.contentType,
      });
    } catch (err) {
      console.warn('[ClipJar] 后端同步失败:', err);
    }
  }, []);

  // Cleanup function for clipboard polling
  const cleanupClipboardPolling = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Clipboard polling effect
  useEffect(() => {
    if (!isTauri) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkClipboard = async () => {
      if (!isVisibleRef.current || isProcessingRef.current) return;

      // Check abort signal
      if (abortControllerRef.current?.signal.aborted) return;

      isProcessingRef.current = true;

      try {
        // Read text
        const text = await readText();
        if (text?.trim() && text !== lastContentRef.current) {
          lastContentRef.current = text;

          const newItem: ClipboardItem = {
            id: Date.now() + Math.random(),
            content: text.slice(0, APP_CONFIG.MAX_CONTENT_LENGTH),
            contentType: detectContentType(text),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isFavorite: false,
            useWeight: 0,
            tags: [],
          };

          addItem(newItem);
          syncToBackend(newItem);
        }

        // Read image
        try {
          const imageData = await readImage() as unknown as ImageData;
          if (imageData?.width && imageData?.height) {
            const pixelCount = imageData.width * imageData.height;

            // Skip oversized images
            if (pixelCount > MAX_IMAGE_PIXELS) {
              lastImageRef.current = `${imageData.width}x${imageData.height}`;
              return;
            }

            const imageKey = `${imageData.width}x${imageData.height}`;
            if (imageKey !== lastImageRef.current) {
              lastImageRef.current = imageKey;

              const estimatedSize = estimateImageSize(imageData.width, imageData.height);
              let base64: string;

              if (estimatedSize > 1024 * 1024) {
                base64 = await resizeImage(imageData, APP_CONFIG.IMAGE_MAX_WIDTH, APP_CONFIG.IMAGE_MAX_HEIGHT);
              } else {
                base64 = await convertImageToBase64(imageData);
              }

              if (base64.length > MAX_BASE64_SIZE) {
                return;
              }

              const newItem: ClipboardItem = {
                id: Date.now() + Math.random(),
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

              addItem(newItem);
              syncToBackend(newItem);
            }
          }
        } catch {
          // No image in clipboard
        }
      } catch (err) {
        console.warn('[ClipJar] 读取剪贴板失败:', err);
      } finally {
        isProcessingRef.current = false;
      }
    };

    // Initial read
    checkClipboard();

    // Set up polling
    intervalId = setInterval(checkClipboard, APP_CONFIG.CLIPBOARD_POLL_INTERVAL);

    return () => {
      cleanupClipboardPolling();
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [addItem, syncToBackend, cleanupClipboardPolling]);

  // Visibility change handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Search debounce effect
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, APP_CONFIG.SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [search]);

  // Copy handler
  const handleCopy = useCallback(async (item: ClipboardItem) => {
    if (!isTauri) return;

    try {
      if (item.contentType === ContentType.IMAGE && item.imagePath) {
        await writeText(item.content);
      } else {
        await writeText(item.content);
        lastContentRef.current = item.content;
      }

      const currentWindow = getCurrentWindow();
      await currentWindow.hide();

      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), APP_CONFIG.COPY_SUCCESS_DURATION);
    } catch (err) {
      console.error('[ClipJar] 复制失败:', err);
    }
  }, []);

  // Note save handler
  const handleSaveNote = useCallback((id: number) => {
    const trimmed = noteContent.trim();
    if (trimmed.length <= 200) {
      updateNote(id, trimmed);
    }
    setEditingNoteId(null);
    setNoteContent('');
  }, [noteContent, updateNote]);

  // Filtered items
  const filteredItems = useMemo(() => {
    let result = items;

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      result = result.filter(item =>
        item.content.toLowerCase().includes(query) ||
        (item.note && item.note.toLowerCase().includes(query))
      );
    }

    if (tab === 'fav') {
      result = result.filter(i => i.isFavorite);
    }

    return result.slice(0, APP_CONFIG.LIST_DISPLAY_LIMIT);
  }, [items, debouncedSearch, tab]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNoteId !== null) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          if (selectedIndex >= 0 && filteredItems[selectedIndex]) {
            e.preventDefault();
            handleCopy(filteredItems[selectedIndex]);
          }
          break;
        case 'Escape':
          setSelectedIndex(-1);
          setSearch('');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, selectedIndex, handleCopy, editingNoteId]);

  // Reset selection when search/tab changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [search, tab]);

  return (
    <div className="h-screen flex flex-col text-slate-800 overflow-hidden font-sans relative">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-blue-300/50 to-cyan-300/50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-sky-300/40 to-blue-300/40 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-200/20 to-cyan-200/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative px-6 py-5 glass-dark border-b border-blue-100/30 shrink-0">
        {/* Logo & Search Row */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-500 flex items-center justify-center shadow-blue animate-float">
              <Clipboard className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-2xl gradient-text">ClipJar</span>
              <span className="text-xs text-blue-500/70 font-medium">剪贴板管理器</span>
            </div>
          </div>

          <div className="relative flex-1 max-w-lg mx-4">
            <div className="relative flex items-center">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
              <input
                type="text"
                placeholder="搜索剪贴内容..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/90 border border-blue-200/50 rounded-2xl pl-12 pr-12 py-3.5 text-sm text-slate-700 placeholder:text-blue-300/80 focus:outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all shadow-sm"
              />
            </div>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-500 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="p-3 rounded-2xl glass text-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm"
            title="设置"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => setTab('all')}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-semibold transition-all ${
              tab === 'all'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-blue'
                : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50/70'
            }`}
          >
            <Grid className="w-4 h-4" />
            全部
            <span className={`px-2 py-0.5 text-xs rounded-lg font-medium ${
              tab === 'all' ? 'bg-white/25' : 'bg-blue-100 text-blue-600'
            }`}>
              {items.length}
            </span>
          </button>
          <button
            onClick={() => setTab('fav')}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-semibold transition-all ${
              tab === 'fav'
                ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-[0_4px_14px_rgba(251,146,60,0.3)]'
                : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50/70'
            }`}
          >
            <Heart className="w-4 h-4" />
            收藏
            <span className={`px-2 py-0.5 text-xs rounded-lg font-medium ${
              tab === 'fav' ? 'bg-white/25' : 'bg-amber-100 text-amber-600'
            }`}>
              {items.filter(i => i.isFavorite).length}
            </span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto min-h-0 relative">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 animate-scale-in">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-200 to-cyan-200 rounded-full blur-3xl opacity-40 animate-pulse-soft" />
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-blue-100 via-sky-100 to-cyan-100 flex items-center justify-center shadow-blue border-4 border-white/50">
                {tab === 'fav' ? (
                  <Heart className="w-14 h-14 text-amber-400 animate-pulse-soft" />
                ) : (
                  <Clipboard className="w-14 h-14 text-blue-400" />
                )}
              </div>
            </div>
            <p className="text-xl font-semibold text-slate-700 mb-2">
              {tab === 'fav' ? '暂无收藏' : '暂无记录'}
            </p>
            <p className="text-sm text-slate-400 mb-6">
              {tab === 'fav' ? '收藏重要内容方便快速访问' : `使用 ${shortcutMode} 唤起`}
            </p>
            {tab === 'all' && (
              <div className="px-5 py-3 rounded-2xl bg-blue-50/70 border border-blue-100/50 text-sm text-blue-500/80">
                复制内容后自动保存到这里
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-3 relative">
            {filteredItems.map((item, index) => (
              <div
                key={item.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <ItemRow
                  item={item}
                  isCopied={copiedId === item.id}
                  isSelected={selectedIndex === index}
                  onCopy={handleCopy}
                  onDelete={deleteItem}
                  onToggleFavorite={toggleFavorite}
                  isEditingNote={editingNoteId === item.id}
                  noteContent={noteContent}
                  setNoteContent={setNoteContent}
                  onStartEdit={(id, note) => { setEditingNoteId(id); setNoteContent(note || ''); }}
                  onSaveNote={handleSaveNote}
                  onCancelEdit={() => { setEditingNoteId(null); setNoteContent(''); }}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative px-6 py-4 glass-dark border-t border-blue-100/30 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <span className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-75" />
            <span className="relative w-2.5 h-2.5 bg-emerald-500 rounded-full" />
          </div>
          <span className="text-xs text-slate-500 font-medium">{items.length} 条记录</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded-lg bg-slate-100 text-slate-500 font-mono text-xs border border-slate-200">↑↓</kbd>
            选择
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded-lg bg-slate-100 text-slate-500 font-mono text-xs border border-slate-200">Enter</kbd>
            复制
          </span>
        </div>
      </footer>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onClearAll={clearAll}
          itemCount={items.length}
          shortcutMode={shortcutMode}
          onShortcutChange={setShortcutMode}
          settings={settings}
          setSettings={setSettings}
        />
      )}
    </div>
  );
}