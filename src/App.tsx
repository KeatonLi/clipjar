import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useClipboardStore } from './stores/clipboardStore';
import { type ClipboardItem, ContentType } from './types';
import { useGlobalShortcut, type ShortcutMode } from './hooks/useGlobalShortcut';
import { detectContentType } from './utils';
import {
  convertImageToBase64,
  resizeImage,
  estimateImageSize,
  decodeClipboardImage
} from './utils/image';
import { APP_CONFIG, STORAGE_KEYS } from './utils/constants';
import { Search, X, Settings, Star, Clipboard, ChevronDown } from 'lucide-react';
import { readText, readImage, writeText, writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { Image as TauriImage } from '@tauri-apps/api/image';
import { createClipboardMonitor, writeClipboardItem } from './utils/clipboard';
import { SettingsModal } from './components/Settings';
import { ItemRow } from './components/ItemRow';
import { Preview } from './components/Preview';
import { detectPlatform } from './utils/desktop';

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
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const [shortcutMode, setShortcutMode] = useState<ShortcutMode>(() => {
    return localStorage.getItem(STORAGE_KEYS.SHORTCUT_MODE) || 'CommandOrControl+Shift+V';
  });
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copyError, setCopyError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [visibleLimit, setVisibleLimit] = useState<number>(APP_CONFIG.LIST_DISPLAY_LIMIT);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const closePreview = useCallback(() => setPreviewId(null), []);
  const openPreview = useCallback((item: ClipboardItem) => {
    setCopyError('');
    setPreviewId(item.id);
  }, []);
  const searchInput = useRef<HTMLInputElement>(null);
  const pendingRowFocus = useRef<number | null>(null);
  const platform = detectPlatform(navigator.platform);
  const previewItem = items.find((item) => item.id === previewId);

  const monitorRef = useRef<ReturnType<typeof createClipboardMonitor> | null>(null);

  // Search debounce
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const shortcutStatus = useGlobalShortcut(shortcutMode);

  // Sync to backend
  const syncToBackend = useCallback(async (item: ClipboardItem) => {
    if (!isTauri) return;
    try {
      await invoke('add_clipboard_item', {
        content: item.content,
        contentType: item.contentType
      });
    } catch (err) {
      console.warn('[ClipJar] 后端同步失败:', err);
    }
  }, []);

  // Keep recording while hidden in the tray. Only unmounting stops the monitor.
  useEffect(() => {
    if (!isTauri) return;
    const save = (
      content: string,
      contentType: ContentType,
      image?: { dataUrl: string; width: number; height: number }
    ) => {
      const now = Date.now();
      const item: ClipboardItem = {
        id: now + Math.random(),
        content,
        contentType,
        createdAt: now,
        updatedAt: now,
        isFavorite: false,
        useWeight: 0,
        tags: [],
        ...(image && {
          imagePath: image.dataUrl,
          imageWidth: image.width,
          imageHeight: image.height
        })
      };
      addItem(item);
      void syncToBackend(item);
    };
    const monitor = createClipboardMonitor({
      readText,
      readImage,
      encodeImage: (image) =>
        estimateImageSize(image.width, image.height) > 1024 * 1024
          ? resizeImage(image, APP_CONFIG.IMAGE_MAX_WIDTH, APP_CONFIG.IMAGE_MAX_HEIGHT)
          : convertImageToBase64(image),
      onText: (text) => save(text.slice(0, APP_CONFIG.MAX_CONTENT_LENGTH), detectContentType(text)),
      onImage: (image) => save(`[图片 ${image.width}x${image.height}]`, ContentType.IMAGE, image),
      onError: (error) => console.warn('[ClipJar] 读取剪贴板失败:', error)
    });
    monitorRef.current = monitor;
    void monitor.poll();
    const interval = setInterval(() => void monitor.poll(), APP_CONFIG.CLIPBOARD_POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      monitor.stop();
      if (monitorRef.current === monitor) monitorRef.current = null;
    };
  }, [addItem, syncToBackend]);

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
    if (!isTauri) {
      setCopyError('系统剪贴板仅桌面端可用；浏览器中可以查看和搜索示例记录。');
      return;
    }

    try {
      setCopyError('');
      await writeClipboardItem<TauriImage>(item, {
        writeText,
        decodeImage: decodeClipboardImage,
        createImage: (rgba, width, height) => TauriImage.new(rgba, width, height),
        writeImage
      });
      if (item.contentType !== ContentType.IMAGE) monitorRef.current?.markTextCopied(item.content);

      const currentWindow = getCurrentWindow();
      await currentWindow.hide();
      setPreviewId(null);

      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), APP_CONFIG.COPY_SUCCESS_DURATION);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : '复制失败，请重试。');
      console.error('[ClipJar] 复制失败:', err);
    }
  }, []);

  // Note save handler
  const handleSaveNote = useCallback(
    (id: number) => {
      const trimmed = noteContent.trim();
      if (trimmed.length <= 200) {
        updateNote(id, trimmed);
      }
      setEditingNoteId(null);
      setNoteContent('');
    },
    [noteContent, updateNote]
  );

  // Filtered items
  const matchedItems = useMemo(() => {
    let result = items;

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      result = result.filter(
        (item) =>
          item.content.toLowerCase().includes(query) ||
          (item.note && item.note.toLowerCase().includes(query))
      );
    }

    if (tab === 'fav') {
      result = result.filter((i) => i.isFavorite);
    }

    return result;
  }, [items, debouncedSearch, tab]);
  const filteredItems = matchedItems.slice(0, visibleLimit);
  useEffect(() => {
    setVisibleLimit(APP_CONFIG.LIST_DISPLAY_LIMIT);
  }, [debouncedSearch, tab]);
  useEffect(() => {
    if (pendingRowFocus.current === null) return;
    const button =
      document.querySelectorAll<HTMLButtonElement>('.clip-content-button')[pendingRowFocus.current];
    if (button) {
      pendingRowFocus.current = null;
      button.focus();
    }
  }, [filteredItems.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings || previewItem || e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.current?.focus();
        return;
      }
      if (editingNoteId !== null) return;
      const target = e.target as HTMLElement;
      if (target.closest('textarea, [contenteditable="true"]')) return;
      if (e.key === 'Enter' && target.closest('button')) return;
      const selectRow = (index: number) => {
        if (!filteredItems.length) return;
        setSelectedIndex(index);
        if (target.closest('.clipboard-row')) {
          document.querySelectorAll<HTMLButtonElement>('.clip-content-button')[index]?.focus();
        }
      };

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (
            selectedIndex === filteredItems.length - 1 &&
            filteredItems.length < matchedItems.length
          ) {
            if (target.closest('.clipboard-row')) pendingRowFocus.current = selectedIndex + 1;
            setVisibleLimit((limit) => limit + APP_CONFIG.LIST_DISPLAY_LIMIT);
            setSelectedIndex(selectedIndex + 1);
          } else selectRow(Math.min(selectedIndex + 1, filteredItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          selectRow(Math.max(selectedIndex - 1, 0));
          break;
        case ' ':
          if (
            !target.closest('input, button:not(.clip-content-button)') &&
            selectedIndex >= 0 &&
            filteredItems[selectedIndex]
          ) {
            e.preventDefault();
            openPreview(filteredItems[selectedIndex]);
          }
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
  }, [
    filteredItems,
    matchedItems.length,
    selectedIndex,
    handleCopy,
    editingNoteId,
    showSettings,
    previewItem,
    openPreview
  ]);

  // Reset selection when search/tab changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [search, tab]);

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, filteredItems.length - 1));
  }, [filteredItems.length]);

  return (
    <div className="clipjar-shell">
      <header className="app-header">
        <div className="brand-row">
          <div className="brand">
            <span className="brand-mark">
              <Clipboard size={17} strokeWidth={1.8} />
            </span>
            <span className="brand-name">ClipJar</span>
            <span className="brand-caption">随手复制，随时找回</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="icon-button"
            aria-label="打开设置"
            title="设置"
          >
            <Settings size={18} strokeWidth={1.7} />
          </button>
        </div>

        <div className="search-field">
          <Search size={18} strokeWidth={1.7} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索剪贴内容或备注"
            placeholder="搜索内容或备注…"
            ref={searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {!search && <span className="search-key">{platform === 'mac' ? '⌘ K' : 'Ctrl K'}</span>}
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="icon-button search-clear"
              aria-label="清除搜索"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <nav className="filter-row" aria-label="剪贴记录筛选">
          <div className="filter-tabs">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`filter-tab ${tab === 'all' ? 'is-active' : ''}`}
              aria-pressed={tab === 'all'}
            >
              全部<span className="tab-count">{items.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('fav')}
              className={`filter-tab ${tab === 'fav' ? 'is-active' : ''}`}
              aria-pressed={tab === 'fav'}
            >
              <Star size={14} strokeWidth={1.8} />
              收藏<span className="tab-count">{items.filter((i) => i.isFavorite).length}</span>
            </button>
          </div>
          <span className="filter-caption">
            {search ? `${matchedItems.length} 条匹配` : '最近复制'}
          </span>
        </nav>
      </header>

      <main className="clipboard-content" aria-label={tab === 'fav' ? '收藏记录' : '剪贴记录'}>
        {copyError && (
          <p role="alert" className="px-4 py-2 text-sm text-red-600">
            {copyError}
          </p>
        )}
        {filteredItems.length === 0 ? (
          <div className="empty-state" role="status">
            <span className="empty-symbol">
              {search ? (
                <Search size={28} strokeWidth={1.3} />
              ) : tab === 'fav' ? (
                <Star size={28} strokeWidth={1.3} />
              ) : (
                <Clipboard size={28} strokeWidth={1.3} />
              )}
            </span>
            <h1>
              {search
                ? '没有找到匹配内容'
                : tab === 'fav'
                  ? '把常用内容留在这里'
                  : '从一次复制开始'}
            </h1>
            <p>
              {search
                ? '试试其他关键词，或清除搜索。'
                : tab === 'fav'
                  ? '点击记录旁的星标，下次就能快速找到。'
                  : '复制文字、链接或图片，记录会出现在这里。'}
            </p>
            {search && (
              <button type="button" className="quiet-button" onClick={() => setSearch('')}>
                清除搜索
              </button>
            )}
          </div>
        ) : (
          <div className="history-results">
            <ul className="clipboard-list">
              {filteredItems.map((item, index) => (
                <li key={item.id}>
                  <ItemRow
                    item={item}
                    isCopied={copiedId === item.id}
                    isSelected={selectedIndex === index}
                    onSelect={() => setSelectedIndex(index)}
                    onCopy={handleCopy}
                    onPreview={openPreview}
                    onDelete={deleteItem}
                    onToggleFavorite={toggleFavorite}
                    isEditingNote={editingNoteId === item.id}
                    noteContent={noteContent}
                    setNoteContent={setNoteContent}
                    onStartEdit={(id, note) => {
                      setEditingNoteId(id);
                      setNoteContent(note || '');
                    }}
                    onSaveNote={handleSaveNote}
                    onCancelEdit={() => {
                      setEditingNoteId(null);
                      setNoteContent('');
                    }}
                  />
                </li>
              ))}
            </ul>
            {filteredItems.length < matchedItems.length && (
              <button
                className="load-more"
                onClick={() => setVisibleLimit((limit) => limit + APP_CONFIG.LIST_DISPLAY_LIMIT)}
              >
                <ChevronDown size={16} />
                加载更多<span>还有 {matchedItems.length - filteredItems.length} 条</span>
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>
          {filteredItems.length < matchedItems.length
            ? `已显示 ${filteredItems.length} / ${matchedItems.length} 条`
            : search || tab === 'fav'
              ? `${matchedItems.length} 条匹配 · 共 ${items.length} 条`
              : `${items.length} 条记录`}
        </span>
        <div className="keyboard-hints">
          <span>
            <kbd>↑↓</kbd> 选择
          </span>
          <span>
            <kbd>Space</kbd> 预览
          </span>
          <span>
            <kbd>↵</kbd> 复制
          </span>
        </div>
      </footer>

      {previewItem && (
        <Preview
          key={previewItem.id}
          item={previewItem}
          onClose={closePreview}
          onCopy={handleCopy}
          error={copyError}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={closeSettings}
          onClearAll={clearAll}
          itemCount={items.length}
          shortcutMode={shortcutMode}
          shortcutStatus={shortcutStatus}
          onShortcutChange={setShortcutMode}
          settings={settings}
          setSettings={setSettings}
        />
      )}
    </div>
  );
}
