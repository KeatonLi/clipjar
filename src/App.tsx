import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useClipboardStore, getFilteredItems } from './stores/clipboardStore';
import { ContentType } from './types';
import { useGlobalShortcut } from './hooks/useGlobalShortcut';
import { Search, X, Settings, Grid, Heart } from 'lucide-react';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ItemRow } from './components/ItemRow';
import { SettingsModal } from './components/Settings';

// 检测内容类型
const detectContentType = (content: string): ContentType => {
  if (/^https?:\/\/\S+$/i.test(content)) return ContentType.LINK;
  if (/[{};]|function|const|let|var|import|export/.test(content) && content.includes('\n')) return ContentType.CODE;
  return ContentType.TEXT;
};

// 节流函数 - 优化高频操作
function throttle<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let lastTime = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTime >= delay) {
      lastTime = now;
      fn(...args);
    }
  };
}

// 底部状态栏 - 独立组件避免重渲染
const StatusBar = memo(({ count, isFavorite }: { count: number; isFavorite: boolean }) => (
  <div className="px-4 py-2.5 bg-white/70 backdrop-blur border-t border-slate-200/60 text-xs text-slate-500 flex justify-between items-center shrink-0">
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        {count} 条记录
      </span>
    </div>
    <span className="text-slate-400">
      {isFavorite ? '收藏永久保存' : '点击项目复制'}
    </span>
  </div>
));
StatusBar.displayName = 'StatusBar';

// 空状态组件
const EmptyState = memo(({ isFavorite }: { isFavorite: boolean }) => (
  <div className="flex flex-col items-center justify-center h-full text-slate-400">
    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-5 shadow-sm">
      {isFavorite ? (
        <Heart className="w-9 h-9 text-amber-400" />
      ) : (
        <span className="text-4xl">📋</span>
      )}
    </div>
    <p className="text-sm font-medium text-slate-500">
      {isFavorite ? '还没有收藏的内容' : '复制内容会自动保存到这里'}
    </p>
    <p className="text-xs text-slate-400 mt-1">
      {isFavorite ? '点击星标图标收藏重要内容' : '使用快捷键 ⌘⇧V 快速唤起'}
    </p>
  </div>
));
EmptyState.displayName = 'EmptyState';

export default function App() {
  const store = useClipboardStore();
  const { items, addItem, deleteItem, toggleFavorite, updateNote, clearAll, settings } = store;
  
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  
  const lastContentRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // 全局快捷键
  useGlobalShortcut(settings.globalShortcut);

  // 获取过滤后的项目
  const filteredItems = getFilteredItems({
    ...store,
    searchQuery: search,
    filterType: tab === 'fav' ? 'favorite' : 'all',
  });

  // 限制显示数量减少渲染压力
  const displayItems = filteredItems.slice(0, 30);

  // 剪贴板监听 - 使用更长的间隔和节流
  useEffect(() => {
    let mounted = true;
    abortControllerRef.current = new AbortController();

    const checkClipboard = async () => {
      if (!mounted) return;
      
      try {
        const text = await readText();
        if (text && text.trim() && text !== lastContentRef.current) {
          lastContentRef.current = text;
          
          const newItem = {
            id: Date.now(),
            content: text,
            contentType: detectContentType(text),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isFavorite: false,
            useCount: 0,
            tags: [],
          };
          
          addItem(newItem);
        }
      } catch (err) {
        // 忽略读取错误
      }
    };

    // 首次检查
    checkClipboard();

    // 使用 1000ms 间隔减少 CPU 占用
    const interval = setInterval(checkClipboard, 1000);
    
    // 窗口获得焦点时检查
    const handleFocus = () => checkClipboard();
    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      abortControllerRef.current?.abort();
    };
  }, [addItem]);

  // 复制到剪贴板
  const handleCopy = useCallback(async (item: { id: number; content: string }) => {
    try {
      await writeText(item.content);
      lastContentRef.current = item.content;
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
      
      // 复制后隐藏窗口
      const window = getCurrentWindow();
      await window.hide();
    } catch (err) {
      console.error('复制失败:', err);
    }
  }, []);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNoteId !== null) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, displayItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        handleCopy(displayItems[selectedIndex]);
      } else if (e.key === 'Escape') {
        setSelectedIndex(-1);
        setSearch('');
        // ESC 隐藏窗口
        getCurrentWindow().then(w => w.hide());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayItems, selectedIndex, handleCopy, editingNoteId]);

  // 保存备注
  const saveNote = useCallback((id: number) => {
    updateNote(id, noteContent.trim());
    setEditingNoteId(null);
    setNoteContent('');
  }, [noteContent, updateNote]);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-800 overflow-hidden">
      {/* 顶部搜索栏 */}
      <div className="px-4 py-3.5 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 flex items-center gap-3 shrink-0">
        <div className="relative flex-1 group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索剪贴板内容..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-100/80 border border-slate-200/60 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-primary-400/50 focus:ring-4 focus:ring-primary-100/30 transition-all"
          />
          {search ? (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200/60"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          ) : null}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2.5 rounded-xl text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-all"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 pt-3 pb-2 bg-white/50 shrink-0">
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl">
          <button
            onClick={() => setTab('all')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'all'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Grid className="w-4 h-4" />
            全部
            <span className="px-1.5 py-0.5 text-[10px] bg-slate-200/80 text-slate-600 rounded-full">
              {items.length}
            </span>
          </button>
          <button
            onClick={() => setTab('fav')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'fav'
                ? 'bg-white text-amber-500 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Heart className="w-4 h-4" />
            收藏
            <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-600 rounded-full">
              {items.filter(i => i.isFavorite).length}
            </span>
          </button>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {displayItems.length === 0 ? (
          <EmptyState isFavorite={tab === 'fav'} />
        ) : (
          <div className="p-2 space-y-1.5">
            {displayItems.map((item, index) => (
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
      </div>

      {/* 底部状态栏 */}
      <StatusBar count={items.length} isFavorite={tab === 'fav'} />

      {/* 设置弹窗 */}
      {showSettings && (
        <SettingsModal 
          onClose={() => setShowSettings(false)} 
          onClearAll={clearAll} 
          itemCount={items.length}
        />
      )}
    </div>
  );
}
