import { useState, useEffect, useCallback, useRef } from 'react';
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

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;

export default function App() {
  const { items, addItem, deleteItem, toggleFavorite, updateNote, clearAll, settings, setSettings } = useClipboardStore();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [shortcutMode, setShortcutMode] = useState<ShortcutMode>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.SHORTCUT_MODE) || 'Ctrl+Shift+V';
    }
    return 'Ctrl+Shift+V';
  });
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const lastContentRef = useRef('');
  const lastImageRef = useRef('');
  const isProcessingRef = useRef(false);

  useGlobalShortcut(shortcutMode);

  const syncToBackend = useCallback(async (item: ClipboardItem) => {
    if (!isTauri) return;
    try {
      await invoke('add_clipboard_item', {
        content: item.content,
        contentType: item.contentType,
      });
    } catch (err) {
      console.error('同步到后端失败:', err);
    }
  }, []);

  useEffect(() => {
    if (!isTauri) return;

    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkClipboard = async () => {
      if (!mounted || isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const text = await readText();
        if (text && text.trim() && text !== lastContentRef.current) {
          lastContentRef.current = text;

          const newItem: ClipboardItem = {
            id: Date.now(),
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

        try {
          const imageData = await readImage() as unknown as ImageData;
          if (imageData?.width && imageData?.height) {
            const imageKey = `${imageData.width}x${imageData.height}`;
            if (imageKey !== lastImageRef.current) {
              lastImageRef.current = imageKey;

              const estimatedSize = estimateImageSize(imageData.width, imageData.height);
              let base64: string;

              if (estimatedSize > 1024 * 1024) {
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

              addItem(newItem);
              syncToBackend(newItem);
            }
          }
        } catch {
          // no image
        }
      } catch (err) {
        // silent fail
      } finally {
        isProcessingRef.current = false;
      }
    };

    checkClipboard();
    intervalId = setInterval(checkClipboard, APP_CONFIG.CLIPBOARD_POLL_INTERVAL);

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [addItem, syncToBackend]);

  const handleCopy = useCallback(async (item: ClipboardItem) => {
    if (!isTauri) return;

    try {
      if (item.contentType === ContentType.IMAGE && item.imagePath) {
        await writeText(item.content);
      } else {
        await writeText(item.content);
        lastContentRef.current = item.content;
      }

      const window = getCurrentWindow();
      await window.hide();

      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), APP_CONFIG.COPY_SUCCESS_DURATION);
    } catch (err) {
      console.error('复制失败:', err);
    }
  }, []);

  const saveNote = useCallback((id: number) => {
    const trimmed = noteContent.trim();
    if (trimmed.length <= 200) {
      updateNote(id, trimmed);
    }
    setEditingNoteId(null);
    setNoteContent('');
  }, [noteContent, updateNote]);

  const filteredItems = (() => {
    let result = items;
    if (search) {
      const query = search.toLowerCase();
      result = result.filter(item =>
        item.content.toLowerCase().includes(query) ||
        (item.note && item.note.toLowerCase().includes(query))
      );
    }
    if (tab === 'fav') {
      result = result.filter(i => i.isFavorite);
    }
    return result.slice(0, APP_CONFIG.LIST_DISPLAY_LIMIT);
  })();

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

  useEffect(() => {
    setSelectedIndex(-1);
  }, [search, tab]);

  return (
    <div className="h-screen flex flex-col bg-sky-50 text-neutral-800 overflow-hidden font-sans">
      {/* Header */}
      <header className="px-5 py-4 bg-white border-b border-sky-100 shrink-0">
        {/* Logo & Search Row */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-md shadow-sky-200">
              <Clipboard className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-xl text-neutral-800">ClipJar</span>
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400" />
            <input
              type="text"
              placeholder="搜索剪贴内容..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-sky-50 border border-sky-200 rounded-xl pl-10 pr-10 py-2.5 text-sm text-neutral-700 placeholder:text-sky-400 focus:outline-none focus:bg-white focus:border-sky-400 focus:ring-3 focus:ring-sky-100 transition-all"
            />
            {search ? (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-sky-100 transition-colors"
              >
                <X className="w-4 h-4 text-sky-400" />
              </button>
            ) : null}
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-xl text-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
            title="设置"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setTab('all')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === 'all'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-200'
                : 'text-sky-600 hover:text-sky-700 hover:bg-sky-100'
            }`}
          >
            <Grid className="w-4 h-4" />
            全部
            <span className={`px-2 py-0.5 text-xs rounded-lg ${
              tab === 'all' ? 'bg-white/20' : 'bg-sky-100 text-sky-600'
            }`}>
              {items.length}
            </span>
          </button>
          <button
            onClick={() => setTab('fav')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === 'fav'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
            }`}
          >
            <Heart className="w-4 h-4" />
            收藏
            <span className={`px-2 py-0.5 text-xs rounded-lg ${
              tab === 'fav' ? 'bg-white/20' : 'bg-amber-100 text-amber-600'
            }`}>
              {items.filter(i => i.isFavorite).length}
            </span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto min-h-0">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 animate-fade-in">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-200 flex items-center justify-center mb-5 shadow-inner">
              {tab === 'fav' ? (
                <Heart className="w-10 h-10 text-amber-500" />
              ) : (
                <Clipboard className="w-10 h-10 text-sky-400" />
              )}
            </div>
            <p className="text-base font-semibold text-neutral-700">
              {tab === 'fav' ? '暂无收藏' : '暂无记录'}
            </p>
            <p className="text-sm text-neutral-400 mt-1">
              {tab === 'fav' ? '收藏重要内容方便快速访问' : `快捷键 ${shortcutMode} 唤起`}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredItems.map((item, index) => (
              <ItemRow
                key={item.id}
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
                onSaveNote={saveNote}
                onCancelEdit={() => { setEditingNoteId(null); setNoteContent(''); }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-5 py-3 bg-white border-t border-sky-100 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs text-neutral-500">{items.length} 条记录</span>
        </div>
        <span className="text-xs text-neutral-400">
          {tab === 'fav' ? '收藏永久保存' : '双击复制'}
        </span>
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
