import { useState, useEffect, useCallback, useRef } from 'react';
import { useClipboardStore } from './stores/clipboardStore';
import { type ClipboardItem, ContentType } from './types';
import { useGlobalShortcut, type ShortcutMode } from './hooks/useGlobalShortcut';
import { detectContentType, formatTime, truncate } from './utils';
import { APP_CONFIG, STORAGE_KEYS } from './utils/constants';
import { Star, Copy, Trash2, Search, X, Check, Settings, Grid, Heart, Power, Bell, Trash, Save, Download, Keyboard, Link, Code, Pin } from 'lucide-react';
import { readText, writeText, readImage, writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function App() {
  const { items, addItem, deleteItem, toggleFavorite, updateNote, clearAll, settings, setSettings } = useClipboardStore();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [shortcutMode, setShortcutMode] = useState<ShortcutMode>(() => {
    return localStorage.getItem(STORAGE_KEYS.SHORTCUT_MODE) || 'ctrl-shift-v';
  });
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const lastContentRef = useRef('');
  const lastImageRef = useRef('');

  // 全局快捷键
  useGlobalShortcut(shortcutMode);

  // 剪贴板监听
  useEffect(() => {
    let mounted = true;

    const checkClipboard = async () => {
      if (!mounted) return;
      try {
        // 检查文本
        const text = await readText();
        if (text && text.trim() && text !== lastContentRef.current) {
          console.log('[ClipJar] 检测到新文本:', text.substring(0, 30));
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

        // 检查图片
        try {
          const imageData = await readImage() as any;
          if (imageData && imageData.width && imageData.height) {
            const imageKey = `${imageData.width}x${imageData.height}`;
            if (imageKey !== lastImageRef.current) {
              console.log('[ClipJar] 检测到新图片:', imageKey);
              lastImageRef.current = imageKey;

              // 将 RGBA 数据转换为 base64 PNG
              const base64 = await convertImageToBase64(imageData);
              const newItem: ClipboardItem = {
                id: Date.now(),
                content: `[图片 ${imageData.width}x${imageData.height}]`,
                contentType: ContentType.IMAGE,
                imagePath: base64, // 存储 base64 数据
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isFavorite: false,
                useCount: 0,
                tags: [],
              };
              addItem(newItem);
              console.log('[ClipJar] 已添加图片条目');
            }
          }
        } catch (imgErr) {
          // 没有图片时忽略错误
        }
      } catch (err) {
        console.log('[ClipJar] 读取剪贴板失败:', err);
      }
    };

    // 将图片数据转换为 base64
    const convertImageToBase64 = async (imageData: any): Promise<string> => {
      const width = imageData.width;
      const height = imageData.height;
      // 获取 RGBA 数据
      const rgba = await imageData.rgba();
      // 创建 Canvas 来生成 PNG
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      const imageDataObj = ctx.createImageData(width, height);
      imageDataObj.data.set(rgba);
      ctx.putImageData(imageDataObj, 0, 0);

      return canvas.toDataURL('image/png');
    };

    // 立即检查一次
    checkClipboard();

    // 每500ms检查一次剪贴板
    const interval = setInterval(checkClipboard, APP_CONFIG.CLIPBOARD_POLL_INTERVAL);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [addItem]);

  // 复制到剪贴板
  const handleCopy = useCallback(async (item: ClipboardItem) => {
    try {
      // 如果是图片类型
      if (item.contentType === ContentType.IMAGE && item.imagePath) {
        // 将 base64 转换为 Blob 再写入剪贴板
        const response = await fetch(item.imagePath);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // 使用 writeImage 写入图片
        await writeImage(uint8Array);
        console.log('[ClipJar] 图片已复制');
      } else {
        // 文本类型
        await writeText(item.content);
        lastContentRef.current = item.content;
      }
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), APP_CONFIG.COPY_SUCCESS_DURATION);
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
  filteredItems = filteredItems.slice(0, APP_CONFIG.LIST_DISPLAY_LIMIT);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果正在编辑备注，不处理键盘导航
      if (editingNoteId !== null) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        handleCopy(filteredItems[selectedIndex]);
      } else if (e.key === 'Escape') {
        setSelectedIndex(-1);
        setSearch('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, selectedIndex, handleCopy, editingNoteId]);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-800 overflow-hidden">
      {/* 顶部搜索栏 */}
      <div className="px-4 py-3.5 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 flex items-center gap-3 shrink-0">
        <div className="relative flex-1 group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-colors group-focus-within:text-primary-500" />
          <input
            type="text"
            placeholder="搜索剪贴板内容..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-100/80 border border-slate-200/60 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-primary-400/50 focus:ring-4 focus:ring-primary-100/30 transition-all duration-200 hover:bg-white hover:border-slate-300"
          />
          {search ? (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
            </button>
          ) : (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:block">
              <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 rounded border border-slate-200">⌘F</kbd>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2.5 rounded-xl text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200 active:scale-95"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 pt-3 pb-2 bg-white/50 shrink-0">
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl">
          <button
            onClick={() => setTab('all')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              tab === 'all'
                ? 'bg-white text-primary-600 shadow-sm ring-1 ring-slate-200/60'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <Grid className="w-4 h-4" />
            全部
            <span className="px-1.5 py-0.5 text-[10px] bg-slate-200/80 text-slate-600 rounded-full min-w-[18px]">
              {items.length}
            </span>
          </button>
          <button
            onClick={() => setTab('fav')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              tab === 'fav'
                ? 'bg-white text-amber-500 shadow-sm ring-1 ring-slate-200/60'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <Heart className="w-4 h-4" />
            收藏
            <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-600 rounded-full min-w-[18px]">
              {items.filter(i => i.isFavorite).length}
            </span>
          </button>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-5 shadow-sm">
              {tab === 'fav' ? (
                <Heart className="w-9 h-9 text-amber-400" />
              ) : (
                <Copy className="w-9 h-9 text-primary-400" />
              )}
            </div>
            <p className="text-sm font-medium text-slate-500">
              {tab === 'fav' ? '还没有收藏的内容' : '复制内容会自动保存到这里'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {tab === 'fav' ? '点击星标图标收藏重要内容' : '使用快捷键 ⌘⇧V 快速唤起'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
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
      </div>

      {/* 底部统计 */}
      <div className="px-4 py-2.5 bg-white/70 backdrop-blur border-t border-slate-200/60 text-xs text-slate-500 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {items.length} 条记录
          </span>
        </div>
        <span className="text-slate-400">
          {tab === 'fav' ? '收藏永久保存' : '点击项目复制'}
        </span>
      </div>

      {/* 设置弹窗 */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onClearAll={clearAll} itemCount={items.length} shortcutMode={shortcutMode} onShortcutChange={setShortcutMode} settings={settings} setSettings={setSettings} />
      )}
    </div>
  );
}

// 设置弹窗组件
function SettingsModal({ onClose, onClearAll, itemCount, shortcutMode, onShortcutChange, settings, setSettings }: { onClose: () => void; onClearAll: () => void; itemCount: number; shortcutMode: ShortcutMode; onShortcutChange: (mode: ShortcutMode) => void; settings: { maxHistoryItems: number }; setSettings: (s: { maxHistoryItems: number }) => void }) {
  const [startup, setStartup] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ hasUpdate: boolean; version?: string; notes?: string } | null>(null);

  // 初始化状态
  useEffect(() => {
    const initSettings = async () => {
      try {
        // 检查自启状态
        const autoStartEnabled = await isEnabled();
        setStartup(autoStartEnabled);

        // 检查窗口置顶状态
        const window = getCurrentWindow();
        const isOnTop = await window.isAlwaysOnTop();
        setAlwaysOnTop(isOnTop);
      } catch (err) {
        console.log('[ClipJar] 初始化设置失败:', err);
      }
    };
    initSettings();
  }, []);

  // 切换自启
  const toggleStartup = async () => {
    try {
      if (startup) {
        await disable();
      } else {
        await enable();
      }
      setStartup(!startup);
    } catch (err) {
      console.log('[ClipJar] 切换自启失败:', err);
    }
  };

  // 切换置顶
  const toggleAlwaysOnTop = async () => {
    try {
      const window = getCurrentWindow();
      await window.setAlwaysOnTop(!alwaysOnTop);
      setAlwaysOnTop(!alwaysOnTop);
    } catch (err) {
      console.log('[ClipJar] 切换置顶失败:', err);
    }
  };

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
    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-elevated w-80 max-h-[75vh] overflow-hidden animate-scale-in border border-slate-100" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/50 to-white">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary-100 rounded-lg">
              <Settings className="w-4 h-4 text-primary-600" />
            </div>
            <h3 className="font-semibold text-slate-800">设置</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-2.5 space-y-1 overflow-y-auto max-h-[60vh]">
          {/* 开机自启 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50/80 transition-all duration-200 group"
            onClick={toggleStartup}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm">
                <Power className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">开机自启</div>
                <div className="text-xs text-slate-400">登录时自动运行</div>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-all duration-200 ${startup ? 'bg-primary-500 shadow-button shadow-primary-500/30' : 'bg-slate-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-all duration-200 mt-0.5 ${startup ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* 通知提醒 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50/80 transition-all duration-200 group"
            onClick={() => setNotifications(!notifications)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl shadow-sm">
                <Bell className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">通知提醒</div>
                <div className="text-xs text-slate-400">新内容复制提醒</div>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-all duration-200 ${notifications ? 'bg-primary-500 shadow-button shadow-primary-500/30' : 'bg-slate-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-all duration-200 mt-0.5 ${notifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* 窗口置顶 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50/80 transition-all duration-200 group"
            onClick={toggleAlwaysOnTop}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-xl shadow-sm">
                <Pin className="w-4 h-4 text-cyan-600" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">窗口置顶</div>
                <div className="text-xs text-slate-400">保持窗口在最前面</div>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-all duration-200 ${alwaysOnTop ? 'bg-primary-500 shadow-button shadow-primary-500/30' : 'bg-slate-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-all duration-200 mt-0.5 ${alwaysOnTop ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* 全局快捷键 */}
          <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl shadow-sm">
                <Keyboard className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">唤起快捷键</div>
                <div className="text-xs text-slate-400">点击输入框，按下想要的快捷键</div>
              </div>
            </div>
            <input
              type="text"
              readOnly
              value={shortcutMode}
              onKeyDown={(e) => {
                e.preventDefault();
                const keys: string[] = [];
                if (e.ctrlKey) keys.push('Ctrl');
                if (e.altKey) keys.push('Alt');
                if (e.shiftKey) keys.push('Shift');
                if (e.metaKey) keys.push('Cmd');

                // 添加按键
                if (e.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
                  keys.push(e.key.toUpperCase());
                }

                if (keys.length > 1) {
                  const newShortcut = keys.join('+');
                  onShortcutChange(newShortcut);
                }
              }}
              placeholder="点击此处设置快捷键"
              className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/50 text-center font-medium text-slate-700 transition-all duration-200 hover:border-slate-300"
            />
          </div>

          {/* 最大记录数量 */}
          <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm">
                  <Save className="w-4 h-4 text-green-600" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-slate-700">最大记录数</div>
                  <div className="text-xs text-slate-400">收藏永久保存，不计入限制</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="10"
                max="1000"
                value={settings.maxHistoryItems}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 100;
                  setSettings({ maxHistoryItems: Math.min(1000, Math.max(10, value)) });
                }}
                className="w-24 px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-4 focus:ring-green-100/50 text-center font-medium text-slate-700 transition-all duration-200 hover:border-slate-300"
              />
              <span className="text-xs text-slate-400">条（非收藏）</span>
            </div>
            <div className="mt-2.5 text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              当前: {itemCount} 条记录（收藏永久保存）
            </div>
          </div>

          <div className="h-px bg-slate-100 my-2" />

          {/* 检查更新 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-purple-50/60 transition-all duration-200 group"
            onClick={checkUpdate}
            disabled={checking}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-sm">
                {checking ? (
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4 text-purple-600" />
                )}
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">检查更新</div>
                <div className="text-xs text-slate-400">{checking ? '检查中...' : '获取最新版本'}</div>
              </div>
            </div>
            <span className="text-purple-600 text-xs font-medium bg-purple-50 px-2 py-1 rounded-full">v1.0.1</span>
          </button>

          {/* 更新提示 */}
          {updateInfo?.hasUpdate && (
            <div className="mx-1 p-3 bg-gradient-to-r from-purple-50 to-purple-100/50 rounded-xl border border-purple-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-700">发现新版本 v{updateInfo.version}</span>
                <button
                  onClick={() => window.open('https://github.com/clipjar/clipjar/releases', '_blank')}
                  className="text-xs bg-gradient-to-r from-purple-500 to-purple-600 text-white px-3 py-1.5 rounded-full hover:shadow-button-hover hover:shadow-purple-500/30 transition-all duration-200 font-medium"
                >
                  下载
                </button>
              </div>
              <div className="text-xs text-purple-600/70 line-clamp-2">{updateInfo.notes}</div>
            </div>
          )}

          {/* 清空记录 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-red-50/60 transition-all duration-200 group"
            onClick={() => {
              if (confirm('确定要清空所有记录吗？')) {
                onClearAll();
              }
            }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-sm">
                <Trash className="w-4 h-4 text-red-600" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">清空记录</div>
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

// 内容类型图标组件
const TypeIcon = ({ type }: { type: ContentType }) => {
  if (type === ContentType.LINK) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-medium">
        <Link className="w-3 h-3" />
        链接
      </span>
    );
  }
  if (type === ContentType.CODE) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-600 text-[10px] font-medium">
        <Code className="w-3 h-3" />
        代码
      </span>
    );
  }
  return null;
};

// 单条记录组件
function ItemRow({
  item,
  isCopied,
  isSelected,
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
  isSelected: boolean;
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
    <div
      className={`group flex flex-col justify-between p-3 rounded-xl transition-all duration-200 cursor-pointer border min-h-[80px] ${
        isSelected
          ? 'bg-gradient-to-r from-primary-50 to-primary-50/70 border-primary-200 shadow-sm'
          : 'bg-white border-slate-100 hover:border-primary-200/60 hover:shadow-card hover:-translate-y-0.5'
      }`}
      onDoubleClick={() => onCopy(item)}
    >
      {/* 文字内容区域 */}
      <div className="flex-1" onClick={() => onCopy(item)}>
        {item.contentType === ContentType.IMAGE && item.imagePath ? (
          <div className="mt-1">
            <img
              src={item.imagePath}
              alt="剪贴板图片"
              className="max-w-full h-auto rounded-lg border border-slate-200"
              style={{ maxHeight: '120px', objectFit: 'contain' }}
            />
          </div>
        ) : (
          <p className={`text-sm font-medium leading-relaxed line-clamp-2 ${isSelected ? 'text-slate-800' : 'text-slate-700'}`}>
            {truncate(item.content)}
          </p>
        )}
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
                className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-primary-400 focus:ring-3 focus:ring-primary-100/40 transition-all"
                rows={2}
                autoFocus
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => onSaveNote(item.id)}
                  className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={onCancelEdit}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="text-xs text-slate-500 cursor-pointer hover:text-primary-600 flex items-center gap-1.5 transition-colors group/note"
              onClick={() => onStartEdit(item.id, item.note)}
            >
              {item.note ? (
                <span className="bg-gradient-to-r from-amber-50 to-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-medium">
                  {item.note}
                </span>
              ) : (
                <>
                  <span className="text-slate-400 group-hover/note:text-primary-500">+</span>
                  <span className="text-slate-400 group-hover/note:text-primary-600">添加备注</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 底部区域：时间在左，按钮在右 */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <TypeIcon type={item.contentType} />
          <span className="time-badge">{formatTime(item.createdAt)}</span>
        </div>

        {/* 底部按钮区域 - 右下角 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id); }}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              item.isFavorite
                ? 'text-amber-400 bg-amber-50'
                : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50/50'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(item); }}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              isCopied
                ? 'text-green-500 bg-green-50'
                : 'text-slate-300 hover:text-green-500 hover:bg-green-50/50'
            }`}
          >
            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50/50 transition-all duration-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
