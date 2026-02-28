import { useState, useEffect, useCallback, useRef } from 'react';
import { useClipboardStore } from './stores/clipboardStore';
import { type ClipboardItem, ContentType } from './types';
import { useGlobalShortcut } from './hooks/useGlobalShortcut';
import { Star, Copy, Trash2, Search, X, Check, Settings, Grid, Heart, Power, Bell, Trash, Save, Download, Keyboard } from 'lucide-react';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

// 检测内容类型
const detectContentType = (content: string): ContentType => {
  if (/^https?:\/\/\S+$/i.test(content)) return ContentType.LINK;
  if (/[{};]|function|const|let|var|import|export/.test(content) && content.includes('\n')) return ContentType.CODE;
  return ContentType.TEXT;
};

// 格式化时间
const formatTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
};

// 截断文本
const truncate = (text: string, len: number = 100) => {
  return text.length > len ? text.substring(0, len) + '...' : text;
};

export default function App() {
  const { items, addItem, deleteItem, toggleFavorite, updateNote, clearAll } = useClipboardStore();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const lastContentRef = useRef('');

  // 全局快捷键
  useGlobalShortcut();

  // 剪贴板监听
  useEffect(() => {
    let mounted = true;

    const checkClipboard = async () => {
      if (!mounted) return;
      try {
        const text = await readText();
        if (text && text.trim() && text !== lastContentRef.current) {
          console.log('[ClipJar] 检测到新内容:', text.substring(0, 30));
          lastContentRef.current = text;
          const newItem: ClipboardItem = {
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
          console.log('[ClipJar] 已添加新条目，当前共', useClipboardStore.getState().items.length, '条');
        }
      } catch (err) {
        console.log('[ClipJar] 读取剪贴板失败:', err);
      }
    };

    // 立即检查一次
    checkClipboard();

    // 每500ms检查一次剪贴板
    const interval = setInterval(checkClipboard, 500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [addItem]);

  // 复制到剪贴板
  const handleCopy = useCallback(async (item: ClipboardItem) => {
    try {
      await writeText(item.content);
      lastContentRef.current = item.content;
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.log('[ClipJar] 复制失败:', err);
    }
  }, []);

  // 保存备注
  const saveNote = useCallback((id: number) => {
    updateNote(id, noteContent.trim());
    setEditingNoteId(null);
    setNoteContent('');
  }, [noteContent, updateNote]);

  // 过滤项目
  let filteredItems = items;
  if (search) {
    filteredItems = items.filter(item =>
      item.content.toLowerCase().includes(search.toLowerCase()) ||
      (item.note && item.note.toLowerCase().includes(search.toLowerCase()))
    );
  }
  if (tab === 'fav') {
    filteredItems = filteredItems.filter(i => i.isFavorite);
  }
  filteredItems = filteredItems.slice(0, 50);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white text-slate-800">
      {/* 顶部搜索栏 */}
      <div className="px-4 py-3 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-100 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 pt-3 pb-2 bg-white">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setTab('all')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'all' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Grid className="w-4 h-4" />
            全部
          </button>
          <button
            onClick={() => setTab('fav')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'fav' ? 'bg-white shadow-sm text-amber-500' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Heart className="w-4 h-4" />
            收藏
          </button>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              {tab === 'fav' ? <Heart className="w-8 h-8 text-amber-400" /> : <Copy className="w-8 h-8 text-blue-400" />}
            </div>
            <p className="text-sm">{tab === 'fav' ? '还没有收藏的内容' : '复制内容会自动保存到这里'}</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredItems.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                isCopied={copiedId === item.id}
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

      {/* 底部统计 */}
      <div className="px-4 py-2 bg-white border-t border-slate-200 text-xs text-slate-400 flex justify-between">
        <span>{items.length} 条记录</span>
        <span>{tab === 'fav' ? `${filteredItems.length} 收藏` : '点击复制'}</span>
      </div>

      {/* 设置弹窗 */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onClearAll={clearAll} itemCount={items.length} />
      )}
    </div>
  );
}

// 设置弹窗组件
function SettingsModal({ onClose, onClearAll, itemCount }: { onClose: () => void; onClearAll: () => void; itemCount: number }) {
  const [startup, setStartup] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ hasUpdate: boolean; version?: string; notes?: string } | null>(null);

  // 检查更新
  const checkUpdate = useCallback(async () => {
    setChecking(true);
    setUpdateInfo(null);
    try {
      const res = await fetch('https://api.github.com/repos/clipjar/clipjar/releases/latest');
      const data = await res.json();
      const latestVersion = data.tag_name?.replace('v', '') || '0.0.0';
      const currentVersion = '1.0.1';

      // 比较版本
      const hasUpdate = latestVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0;

      setUpdateInfo({
        hasUpdate,
        version: latestVersion,
        notes: data.body || '暂无更新说明'
      });

      if (!hasUpdate) {
        alert(`当前已是最新版本 v${currentVersion}`);
      }
    } catch {
      alert('检查更新失败，请稍后重试');
    } finally {
      setChecking(false);
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-80 max-h-[80%] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold">设置</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-2 space-y-1">
          {/* 开机自启 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors"
            onClick={() => setStartup(!startup)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Power className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">开机自启</div>
                <div className="text-xs text-slate-400">登录时自动运行</div>
              </div>
            </div>
            <div className={`w-10 h-6 rounded-full transition-colors ${startup ? 'bg-blue-500' : 'bg-slate-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${startup ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* 通知提醒 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors"
            onClick={() => setNotifications(!notifications)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Bell className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">通知提醒</div>
                <div className="text-xs text-slate-400">新内容复制提醒</div>
              </div>
            </div>
            <div className={`w-10 h-6 rounded-full transition-colors ${notifications ? 'bg-blue-500' : 'bg-slate-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${notifications ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* 全局快捷键 */}
          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Keyboard className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">唤起快捷键</div>
                <div className="text-xs text-slate-400">双击 Ctrl 唤起</div>
              </div>
            </div>
            <span className="text-indigo-500 text-xs font-medium">Ctrl+Shift+V</span>
          </div>

          {/* 记录数量 */}
          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <Save className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">本地存储</div>
                <div className="text-xs text-slate-400">{itemCount} 条记录已保存</div>
              </div>
            </div>
            <span className="text-green-500 text-xs">自动保存</span>
          </div>

          <div className="h-px bg-slate-100 my-2" />

          {/* 检查更新 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-purple-50 transition-colors"
            onClick={checkUpdate}
            disabled={checking}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                {checking ? (
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4 text-purple-500" />
                )}
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">检查更新</div>
                <div className="text-xs text-slate-400">{checking ? '检查中...' : '获取最新版本'}</div>
              </div>
            </div>
            <span className="text-purple-500 text-xs">v1.0.1</span>
          </button>

          {/* 更新提示 */}
          {updateInfo?.hasUpdate && (
            <div className="mx-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-700">发现新版本 v{updateInfo.version}</span>
                <button
                  onClick={() => window.open('https://github.com/clipjar/clipjar/releases', '_blank')}
                  className="text-xs bg-purple-500 text-white px-3 py-1 rounded-full hover:bg-purple-600"
                >
                  下载
                </button>
              </div>
              <div className="text-xs text-purple-600/70 line-clamp-2">{updateInfo.notes}</div>
            </div>
          )}

          {/* 清空记录 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-red-50 transition-colors"
            onClick={() => {
              if (confirm('确定要清空所有记录吗？')) {
                onClearAll();
              }
            }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <Trash className="w-4 h-4 text-red-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">清空记录</div>
                <div className="text-xs text-slate-400">删除所有剪贴板历史</div>
              </div>
            </div>
          </button>

          {/* 版本 */}
          <div className="text-center py-3 text-xs text-slate-400">
            ClipJar v1.0.1
          </div>
        </div>
      </div>
    </div>
  );
}

// 单条记录组件
function ItemRow({
  item,
  isCopied,
  onCopy,
  onDelete,
  onToggleFavorite,
  isEditingNote,
  noteContent,
  setNoteContent,
  onStartEdit,
  onSaveNote,
  onCancelEdit,
}: {
  item: ClipboardItem;
  isCopied: boolean;
  onCopy: (item: ClipboardItem) => void;
  onDelete: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  isEditingNote: boolean;
  noteContent: string;
  setNoteContent: (v: string) => void;
  onStartEdit: (id: number, note: string | undefined) => void;
  onSaveNote: (id: number) => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="group flex flex-col p-3 rounded-xl hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onCopy(item)}>
          <p className="text-sm text-slate-700 line-clamp-2">{truncate(item.content)}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
            <span>{formatTime(item.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id); }}
            className={`p-1.5 rounded-lg transition-colors ${item.isFavorite ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}
          >
            <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(item); }}
            className={`p-1.5 rounded-lg transition-colors ${isCopied ? 'text-green-500' : 'text-slate-300 hover:text-green-500'}`}
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 备注区域 - 收藏时显示 */}
      {item.isFavorite && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          {isEditingNote ? (
            <div className="flex items-start gap-2">
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="添加备注..."
                className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-blue-400"
                rows={2}
                autoFocus
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => onSaveNote(item.id)}
                  className="p-1 rounded text-green-500 hover:bg-green-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={onCancelEdit}
                  className="p-1 rounded text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="text-xs text-slate-500 cursor-pointer hover:text-blue-500 flex items-center gap-1"
              onClick={() => onStartEdit(item.id, item.note)}
            >
              {item.note ? (
                <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded">{item.note}</span>
              ) : (
                <span className="text-slate-400">+ 添加备注</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
