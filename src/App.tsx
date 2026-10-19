import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useClipboardStore } from './stores/clipboardStore';
import { type ClipboardItem } from './types';
import { useGlobalShortcut, type ShortcutMode } from './hooks/useGlobalShortcut';
import { APP_CONFIG } from './utils/constants';
import {
  Search,
  X,
  Settings,
  Star,
  Clipboard,
  ChevronDown,
  Pause,
  Play,
  ShieldCheck,
  Layers,
  Clock3
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { SettingsModal } from './components/Settings';
import { ItemRow } from './components/ItemRow';
import { Preview } from './components/Preview';
import { detectPlatform } from './utils/desktop';
import { capturePaused } from './stores/historyPolicy';

const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;

export default function App() {
  const {
    items,
    deleteItem,
    toggleFavorite,
    updateNote,
    clearAll,
    clearHistory,
    initialize,
    isLoading,
    operationError,
    clearError,
    undo,
    undoDelete,
    pauseUntil,
    setCapturePause,
    resumeCapture,
    storageBytes,
    migrationBackup,
    settings,
    setSettings
  } = useClipboardStore();

  // UI State
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const shortcutMode = settings.globalShortcut;
  const setShortcutMode = (mode: ShortcutMode) => setSettings({ globalShortcut: mode });
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

  const [clock, setClock] = useState(Date.now);
  const [pauseMenu, setPauseMenu] = useState(false);
  const pauseControls = useRef<HTMLDivElement>(null);
  const paused = capturePaused(pauseUntil, clock);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const deadline = Math.max(pauseUntil ?? 0, undo?.expiresAt ?? 0);
    if (deadline <= Date.now()) return;
    const timer = setInterval(() => {
      tick();
      if (Date.now() >= deadline) clearInterval(timer);
    }, 1000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [pauseUntil, undo?.expiresAt]);
  useEffect(() => {
    if (!pauseMenu) return;
    const outside = (event: PointerEvent) => {
      if (!pauseControls.current?.contains(event.target as Node)) setPauseMenu(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [pauseMenu]);

  // Search debounce
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const shortcutStatus = useGlobalShortcut(shortcutMode);

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
      await invoke('copy_history_item', { id: item.id });

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
      if (e.key === 'Escape' && pauseMenu) {
        e.preventDefault();
        setPauseMenu(false);
        return;
      }
      if (editingNoteId !== null || (e.target as HTMLElement).closest('.capture-controls')) return;
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
    openPreview,
    pauseMenu
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
              <Clipboard size={19} strokeWidth={1.8} />
            </span>
            <span className="brand-copy">
              <span className="brand-name">ClipJar</span>
              <span className="brand-caption">你的剪贴空间</span>
            </span>
          </div>
          <div className="header-tools">
            <div
              className={`capture-controls ${!isTauri ? 'is-preview' : ''} ${paused ? 'is-paused' : ''}`}
              ref={pauseControls}
            >
              <span className="capture-state">
                {paused ? <Pause size={13} /> : <ShieldCheck size={13} />}
                {isLoading
                  ? '正在连接本地记录…'
                  : !isTauri
                    ? '浏览器预览'
                    : paused
                      ? pauseUntil === 0
                        ? '已暂停记录'
                        : `已暂停 · ${Math.max(1, Math.ceil(((pauseUntil ?? clock) - clock) / 60000))} 分钟后恢复`
                      : '记录中'}
              </span>
              {paused ? (
                <button type="button" className="capture-button" onClick={resumeCapture}>
                  <Play size={12} />
                  恢复记录
                </button>
              ) : (
                <button
                  type="button"
                  className="capture-button"
                  disabled={!isTauri || isLoading}
                  aria-expanded={pauseMenu}
                  aria-controls="pause-options"
                  title={!isTauri ? '系统采集仅桌面端可用' : '暂停期间不会读取或保存剪贴内容'}
                  onClick={() => setPauseMenu(!pauseMenu)}
                >
                  <Pause size={12} />
                  暂停
                  <ChevronDown size={11} />
                </button>
              )}
              {pauseMenu && (
                <div
                  id="pause-options"
                  className="pause-options"
                  role="group"
                  aria-label="暂停时长"
                >
                  {[
                    { label: '暂停 15 分钟', value: 15 },
                    { label: '暂停 1 小时', value: 60 },
                    { label: '直到手动恢复', value: null }
                  ].map((option) => (
                    <button
                      type="button"
                      key={option.label}
                      onClick={() => {
                        setCapturePause(option.value);
                        setPauseMenu(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                  <p>恢复后仅记录新复制的内容</p>
                </div>
              )}
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
              <Layers size={14} strokeWidth={1.8} />
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
            {!search && <Clock3 size={12} aria-hidden="true" />}
            {search ? `${matchedItems.length} 条匹配` : '最近复制'}
          </span>
        </nav>
      </header>

      <main className="clipboard-content" aria-label={tab === 'fav' ? '收藏记录' : '剪贴记录'}>
        {operationError && (
          <div role="alert" className="operation-banner">
            <span>{operationError}</span>
            <button type="button" onClick={() => void initialize()}>
              重新连接
            </button>
            <button type="button" onClick={clearError} aria-label="关闭操作提示">
              <X size={14} />
            </button>
          </div>
        )}
        {copyError && (
          <p role="alert" className="px-4 py-2 text-sm text-red-600">
            {copyError}
          </p>
        )}
        {isLoading ? (
          <div className="empty-state" role="status">
            <h1>正在加载本地记录</h1>
            <p>首次升级时会先备份并迁移旧数据。</p>
          </div>
        ) : filteredItems.length === 0 ? (
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

      {undo && undo.expiresAt > clock && (
        <div className="undo-toast" role="status">
          <span>已删除一条记录</span>
          <button type="button" onClick={undoDelete}>
            撤销 <span>{Math.min(10, Math.ceil((undo.expiresAt - clock) / 1000))}s</span>
          </button>
        </div>
      )}
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
          onClearHistory={clearHistory}
          storageBytes={storageBytes}
          migrationBackup={migrationBackup}
          operationError={operationError}
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
