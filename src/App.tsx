import { useState, useEffect, useCallback, memo } from 'react';
import { useClipboardStore, getFilteredItems } from './stores/clipboardStore';
import { ContentType } from './types';
import { useGlobalShortcut } from './hooks/useGlobalShortcut';
import { Search, X, Settings, LayoutGrid, Star, Sparkles } from 'lucide-react';
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

// 底部状态栏
const StatusBar = memo(({ count, isFavorite }: { count: number; isFavorite: boolean }) => (
  <div className="px-5 py-3 bg-surface-50/80 backdrop-blur border-t border-surface-200 flex justify-between items-center shrink-0">
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <span className="w-2 h-2 rounded-full bg-green-500 block" />
        <span className="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping opacity-40" />
      </div>
      <span className="text-xs font-medium text-surface-600">
        {count} 条记录
      </span>
    </div>
    <span className="text-xs text-surface-400">
      {isFavorite ? '收藏永久保存' : '点击复制，双击打开'}
    </span>
  </div>
));
StatusBar.displayName = 'StatusBar';

// 空状态
const EmptyState = memo(({ isFavorite }: { isFavorite: boolean }) => (
  <div className="flex flex-col items-center justify-center h-full text-surface-400 px-8">
    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mb-6 shadow-glow">
      {isFavorite ? (
        <Star className="w-10 h-10 text-primary-500 fill-primary-500" />
      ) : (
        <Sparkles className="w-10 h-10 text-primary-500" />
      )}
    </div>
    <h3 className="text-base font-semibold text-surface-700 mb-1">
      {isFavorite ? '还没有收藏的内容' : '剪贴板为空'}
    </h3>
    <p className="text-sm text-surface-400 text-center max-w-[240px]">
      {isFavorite 
        ? '点击条目上的星标图标，将重要内容添加到收藏' 
        : '复制任何内容，它会自动出现在这里'}
    </p>
  </div>
));
EmptyState.displayName = 'EmptyState';

// Tab 按钮
const TabButton = memo(({ 
  active, 
  onClick, 
  icon: Icon, 
  label, 
  count 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: React.ElementType; 
  label: string; 
  count: number;
}) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-sm font-medium transition-all duration-300 ${
      active
        ? 'bg-white text-primary-600 shadow-card ring-1 ring-surface-200'
        : 'text-surface-500 hover:text-surface-700 hover:bg-surface-100/50'
    }`}
  >
    <Icon className={`w-4 h-4 transition-transform duration-300 ${active ? 'scale-110' : ''}`} />
    <span>{label}</span>
    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full transition-colors ${
      active 
        ? 'bg-primary-50 text-primary-600' 
        : 'bg-surface-200 text-surface-500'
    }`}>
      {count}
    </span>
  </button>
));
TabButton.displayName = 'TabButton';

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
  const [isFocused, setIsFocused] = useState(false);
  
  const lastContentRef = useClipboardStore(state => state.lastContent);

  useGlobalShortcut(settings.globalShortcut);

  const filteredItems = getFilteredItems({
    ...store,
    searchQuery: search,
    filterType: tab === 'fav' ? 'favorite' : 'all',
  });

  const displayItems = filteredItems.slice(0, 50);

  // 剪贴板监听
  useEffect(() => {
    let mounted = true;

    const checkClipboard = async () => {
      if (!mounted) return;
      
      try {
        const text = await readText();
        if (text && text.trim() && text !== lastContentRef) {
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
        // 忽略错误
      }
    };

    checkClipboard();
    const interval = setInterval(checkClipboard, 1000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [addItem, lastContentRef]);

  // 复制
  const handleCopy = useCallback(async (item: { id: number; content: string }) => {
    try {
      await writeText(item.content);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
      
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
        getCurrentWindow().then(w => w.hide());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayItems, selectedIndex, handleCopy, editingNoteId]);

  const saveNote = useCallback((id: number) => {
    updateNote(id, noteContent.trim());
    setEditingNoteId(null);
    setNoteContent('');
  }, [noteContent, updateNote]);

  const favCount = items.filter(i => i.isFavorite).length;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-surface-50 via-white to-primary-50/30 text-surface-800 overflow-hidden">
      {/* 顶部栏 */}
      <div className="px-5 py-4 bg-white/70 backdrop-blur-xl border-b border-surface-200/60 shrink-0">
        {/* Logo 区域 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-button">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-surface-800 tracking-tight">ClipJar</h1>
              <p className="text-xs text-surface-400">剪贴板管理器</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-surface-400 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            placeholder="搜索剪贴板内容..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`w-full bg-surface-100 border-2 rounded-2xl pl-11 pr-10 py-3 text-sm text-surface-700 placeholder:text-surface-400 transition-all duration-200 outline-none ${
              isFocused 
                ? 'bg-white border-primary-300 shadow-glow' 
                : 'border-transparent hover:bg-surface-50'
            }`}
          />
          {search ? (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-surface-200/60 flex items-center justify-center text-surface-400 hover:bg-surface-300 hover:text-surface-600 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="px-5 py-3 bg-white/40 shrink-0">
        <div className="flex gap-2 p-1.5 bg-surface-100/80 rounded-2xl">
          <TabButton
            active={tab === 'all'}
            onClick={() => setTab('all')}
            icon={LayoutGrid}
            label="全部"
            count={items.length}
          />
          <TabButton
            active={tab === 'fav'}
            onClick={() => setTab('fav')}
            icon={Star}
            label="收藏"
            count={favCount}
          />
        </div>
      </div>

      {/* 列表区域 */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
        {displayItems.length === 0 ? (
          <EmptyState isFavorite={tab === 'fav'} />
        ) : (
          <div className="space-y-2.5">
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
