import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, X, Settings, Star, Clipboard, Bookmark, Plus, Pause, Play, AlertCircle, Loader2 } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useClipboardStore, queryClipboardItems } from './stores/clipboardStore';
import { type ClipboardItem, ContentType, type LibraryTab, type ContentFilter } from './types';
import { isNativeClipboard } from './lib/clipboardClient';
import { useGlobalShortcut } from './hooks/useGlobalShortcut';
import { SettingsModal } from './components/Settings';
import { ItemRow } from './components/ItemRow';
import { SnippetEditor } from './components/SnippetEditor';
import { ContentPreview } from './components/ContentPreview';

const PAGE_SIZE = 60;
const typeFilters: { value: ContentFilter; label: string }[] = [
  { value: 'all', label: '全部类型' }, { value: ContentType.TEXT, label: '文本' },
  { value: ContentType.LINK, label: '链接' }, { value: ContentType.CODE, label: '代码' }, { value: ContentType.IMAGE, label: '图片' },
];
interface SnippetDraft { id?: number; title: string; content: string; }

export default function App() {
  const { items, settings, stats, isLoading, initialized, error, initialize, dismissError, copyItem,
    deleteItem, toggleFavorite, updateNote, createSnippet, editSnippet, pauseCapture, setSettings } = useClipboardStore();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<LibraryTab>('history');
  const [type, setType] = useState<ContentFilter>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [snippetDraft, setSnippetDraft] = useState<SnippetDraft | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [shortcutError, setShortcutError] = useState('');
  const [dismissedNativeError, setDismissedNativeError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const copyingRef = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const native = isNativeClipboard();
  const modalOpen = showSettings || snippetDraft !== null || previewId !== null;
  const filteredItems = useMemo(() => queryClipboardItems(items, { tab, type, search }), [items, tab, type, search]);
  const visibleItems = filteredItems.slice(0, visibleCount);
  const previewItem = items.find(item => item.id === previewId);
  const counts = useMemo(() => ({
    history: items.filter(item => !item.isSnippet).length,
    favorites: items.filter(item => item.isFavorite).length,
    snippets: items.filter(item => item.isSnippet).length,
  }), [items]);

  useEffect(() => { void initialize().catch(() => {}); }, [initialize]);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const changeShortcut = useGlobalShortcut(initialized ? settings.globalShortcut : '', setShortcutError);
  useEffect(() => { if (!stats?.lastError) setDismissedNativeError(''); }, [stats?.lastError]);

  const closeSettings = useCallback(() => setShowSettings(false), []);
  const closeSnippet = useCallback(() => setSnippetDraft(null), []);
  const closePreview = useCallback(() => setPreviewId(null), []);
  const openSnippet = useCallback((item?: ClipboardItem) => {
    setSnippetDraft(item ? { id: item.isSnippet ? item.id : undefined, title: (item.title || item.note || item.content.split('\n')[0]).slice(0, 80), content: item.content } : { title: '', content: '' });
  }, []);
  const handleCopy = useCallback(async (item: ClipboardItem) => {
    if (copyingRef.current) return;
    copyingRef.current = true;
    try {
      await copyItem(item);
      setCopiedId(item.id);
      setNotice('已复制到剪贴板');
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => { setCopiedId(null); setNotice(''); }, 1800);
      if (native) {
        try { await getCurrentWindow().hide(); } catch { setNotice('已复制，窗口暂时无法隐藏'); }
      }
    } finally { copyingRef.current = false; }
  }, [copyItem, native]);
  const saveSnippet = async (title: string, content: string) => {
    if (snippetDraft?.id !== undefined) await editSnippet(snippetDraft.id, title, content);
    else await createSnippet(title, content);
    setTab('snippets'); setType('all'); setSearch('');
  };
  const saveNote = async (id: number) => {
    try { await updateNote(id, noteContent.trim()); setEditingNoteId(null); setNoteContent(''); } catch { /* Store presents the error without discarding the draft. */ }
  };
  const runAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch { /* Store presents operation errors. */ } finally { setBusy(false); }
  };

  useEffect(() => { setSelectedId(null); setVisibleCount(PAGE_SIZE); }, [search, tab, type]);
  useEffect(() => { if (selectedId !== null && !filteredItems.some(item => item.id === selectedId)) setSelectedId(null); }, [filteredItems, selectedId]);
  useEffect(() => { if (previewId !== null && !items.some(item => item.id === previewId)) setPreviewId(null); }, [items, previewId]);
  useEffect(() => {
    if (editingNoteId !== null && !filteredItems.slice(0, visibleCount).some(item => item.id === editingNoteId)) {
      setEditingNoteId(null); setNoteContent('');
    }
  }, [filteredItems, visibleCount, editingNoteId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (modalOpen || editingNoteId !== null || event.isComposing || event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.closest('textarea, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); openSnippet(); return; }
      if (event.key === 'Enter' && target.closest('button')) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!filteredItems.length || target.closest('[data-record-actions]')) return;
        event.preventDefault();
        const index = filteredItems.findIndex(item => item.id === selectedId);
        const next = event.key === 'ArrowDown' ? Math.min(index + 1, filteredItems.length - 1) : Math.max(index - 1, 0);
        setVisibleCount(count => Math.max(count, next + 1));
        setSelectedId(filteredItems[next].id);
        if (target.closest('.clipboard-row')) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-copy-id="${filteredItems[next].id}"]`)?.focus());
      } else if (event.key === 'Enter') {
        const item = filteredItems.find(record => record.id === selectedId) ?? filteredItems[0];
        if (item) { event.preventDefault(); void handleCopy(item).catch(() => {}); }
      } else if (event.key === 'Escape') {
        if (search) { setSearch(''); setSelectedId(null); }
        else if (native) void getCurrentWindow().hide().catch(() => {});
        else setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, editingNoteId, filteredItems, selectedId, search, native, handleCopy, openSnippet]);

  const failure = error || (stats?.lastError !== dismissedNativeError ? stats?.lastError : '') || shortcutError;
  const noMatches = search.trim() !== '' || type !== 'all';
  const tabButtons = [
    { value: 'history' as const, label: '历史', Icon: Clipboard },
    { value: 'favorites' as const, label: '收藏', Icon: Star },
    { value: 'snippets' as const, label: '片段', Icon: Bookmark },
  ];

  return (
    <div className="clipjar-shell">
      <header className="app-header">
        <div className="brand-row">
          <div className="brand"><span className="brand-mark"><Clipboard size={17} strokeWidth={1.8} /></span><span className="brand-name">ClipJar</span><span className="brand-caption">随手复制，随时找回</span></div>
          <div className="header-actions">
            {native && <button type="button" className={`icon-button ${stats?.isPaused ? 'is-paused' : ''}`} disabled={busy || !initialized} onClick={() => void runAction(() => pauseCapture(stats?.isPaused ? 0 : 15))} aria-label={stats?.isPaused ? '恢复后台记录' : '暂停记录 15 分钟'} title={stats?.isPaused ? '恢复记录' : '暂停记录 15 分钟'}>{stats?.isPaused ? <Play size={16} /> : <Pause size={16} />}</button>}
            <button type="button" onClick={() => setShowSettings(true)} className="icon-button" aria-label="打开设置" title="设置"><Settings size={18} strokeWidth={1.7} /></button>
          </div>
        </div>
        <div className="search-field"><Search size={18} strokeWidth={1.7} aria-hidden="true" /><input ref={searchRef} type="search" aria-label="搜索内容、名称或备注" placeholder={tab === 'snippets' ? '搜索片段名称、内容…' : '搜索内容或备注…'} value={search} onChange={e => setSearch(e.target.value)} />{search ? <button type="button" onClick={() => setSearch('')} className="icon-button search-clear" aria-label="清除搜索"><X size={15} /></button> : <span className="search-shortcut">⌘ / Ctrl F</span>}</div>
        <nav className="filter-row" aria-label="内容库"><div className="filter-tabs">{tabButtons.map(({ value, label, Icon }) => <button key={value} type="button" className={`filter-tab ${tab === value ? 'is-active' : ''}`} onClick={() => { setTab(value); if (value === 'snippets' && type === ContentType.IMAGE) setType('all'); }} aria-pressed={tab === value}><Icon size={14} strokeWidth={1.7} />{label}<span className="tab-count">{counts[value]}</span></button>)}</div><button type="button" className="new-snippet-button" onClick={() => openSnippet()} disabled={!initialized} title="新建片段（Ctrl / ⌘ + N）"><Plus size={14} />新建片段</button></nav>
      </header>
      <div className="type-filter-row" aria-label="按内容类型筛选">{typeFilters.filter(filter => tab !== 'snippets' || filter.value !== ContentType.IMAGE).map(filter => <button key={filter.value} type="button" className={`type-filter ${type === filter.value ? 'is-active' : ''}`} onClick={() => setType(filter.value)} aria-pressed={type === filter.value}>{filter.label}</button>)}<span className="result-count">{filteredItems.length} 条</span></div>
      {failure && <div className="error-banner" role="alert"><AlertCircle size={15} /><span>{failure}</span>{!initialized && <button type="button" onClick={() => void initialize().catch(() => {})}>重试</button>}<button type="button" className="icon-button" aria-label="关闭错误提示" onClick={() => { dismissError(); setShortcutError(''); setDismissedNativeError(stats?.lastError || ''); }}><X size={14} /></button></div>}
      {!native && <div className="preview-mode-note">可新建和使用片段；自动记录请在桌面应用中使用。</div>}
      <main className="clipboard-content" aria-label={tab === 'history' ? '剪贴历史' : tab === 'favorites' ? '收藏记录' : '常用片段'}>
        {isLoading ? <div className="empty-state" role="status"><Loader2 className="loading-spinner" size={24} /><h1>正在读取内容库</h1><p>已有记录会安全地保留。</p></div> : filteredItems.length === 0 ? <div className="empty-state" role="status"><span className="empty-symbol">{noMatches ? <Search size={28} strokeWidth={1.3} /> : tab === 'snippets' ? <Bookmark size={28} strokeWidth={1.3} /> : tab === 'favorites' ? <Star size={28} strokeWidth={1.3} /> : <Clipboard size={28} strokeWidth={1.3} />}</span><h1>{noMatches ? '没有找到匹配内容' : tab === 'snippets' ? '常用内容，随时取用' : tab === 'favorites' ? '把重要内容留在这里' : '从一次复制开始'}</h1><p>{noMatches ? '试试其他关键词，或切换内容类型。' : tab === 'snippets' ? '保存一段回复、地址或代码，下次不用重新输入。' : tab === 'favorites' ? '点击星标收藏，记录会一直保留。' : native ? '复制文字、链接或图片，后台会为你留下记录。' : '在桌面应用中复制内容，会自动保存在这里。'}</p>{noMatches ? <button type="button" className="quiet-button" onClick={() => { setSearch(''); setType('all'); }}>清除筛选</button> : tab === 'snippets' && <button type="button" className="primary-button empty-cta" onClick={() => openSnippet()} disabled={!initialized}><Plus size={14} />新建第一个片段</button>}</div> : <><ul className="clipboard-list">{visibleItems.map(item => <li key={item.id}><ItemRow item={item} search={search} isCopied={copiedId === item.id} isSelected={selectedId === item.id} onSelect={() => setSelectedId(item.id)} onCopy={handleCopy} onDelete={deleteItem} onToggleFavorite={toggleFavorite} onPreview={() => setPreviewId(item.id)} onSnippet={() => openSnippet(item)} isEditingNote={editingNoteId === item.id} noteContent={noteContent} setNoteContent={setNoteContent} onStartEdit={() => { setEditingNoteId(item.id); setNoteContent(item.note || ''); }} onSaveNote={() => saveNote(item.id)} onCancelEdit={() => { setEditingNoteId(null); setNoteContent(''); }} /></li>)}</ul>{visibleCount < filteredItems.length && <button type="button" className="load-more-button" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>显示更多 <span>还有 {filteredItems.length - visibleCount} 条</span></button>}</>}
      </main>
      <footer className="app-footer"><span className="capture-status"><span className={`status-dot ${stats?.isPaused ? 'paused' : !native ? 'preview' : ''}`} />{!native ? '本地片段库' : !initialized ? '正在连接…' : stats?.isPaused ? '记录已暂停' : '后台记录中'}</span><div className="keyboard-hints"><span><kbd>↑↓</kbd>选择</span><span><kbd>↵</kbd>复制</span></div></footer>
      <span className="sr-only" role="status" aria-live="polite">{notice}</span>
      {notice && !native && <div className="copy-toast"><CheckIcon />{notice}</div>}
      {showSettings && <SettingsModal onClose={closeSettings} shortcutError={shortcutError} onShortcutChange={mode => changeShortcut(mode, () => setSettings({ globalShortcut: mode }))} />}
      {snippetDraft && <SnippetEditor title={snippetDraft.title} content={snippetDraft.content} editing={snippetDraft.id !== undefined} onClose={closeSnippet} onSave={saveSnippet} />}
      {previewItem && <ContentPreview item={previewItem} onClose={closePreview} onCopy={handleCopy} onSnippet={openSnippet} />}
    </div>
  );
}

function CheckIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>; }
