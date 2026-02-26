import { Search, Settings, X, Minus, Square } from 'lucide-react';
import { useClipboardStore } from '../../stores/clipboardStore';

export function Header() {
  const { searchQuery, setSearchQuery } = useClipboardStore();

  return (
    <header className="h-16 glass border-b border-neutral-200/60 flex items-center px-4 gap-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-glow">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <span className="font-semibold text-lg text-neutral-800">ClipJar</span>
      </div>

      {/* 搜索框 */}
      <div className="flex-1 max-w-2xl">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="搜索剪贴板内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10 pr-10 py-2 text-sm bg-white/80"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-1 shrink-0">
        <button className="btn-ghost p-2" title="设置">
          <Settings className="w-5 h-5" />
        </button>

        <div className="w-px h-5 bg-neutral-200 mx-1" />

        {/* 窗口控制按钮 */}
        <button
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          title="最小化"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          title="最大化"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          className="p-2 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
