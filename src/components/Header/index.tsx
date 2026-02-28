import { Search, X, Minus, Square, Command } from 'lucide-react';
import { useClipboardStore } from '../../stores/clipboardStore';
import { useState, useEffect, useRef } from 'react';

export function Header() {
  const { searchQuery, setSearchQuery, filterType } = useClipboardStore();
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 键盘快捷键聚焦搜索框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && isFocused) {
        setSearchQuery('');
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, setSearchQuery]);

  return (
    <header className="h-16 glass border-b border-neutral-200/60 flex items-center px-4 gap-4 shrink-0">
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

      <div className="flex-1 max-w-2xl">
        <div className={`relative transition-all duration-200 ${isFocused ? 'scale-[1.02]' : ''}`}>
          <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${isFocused ? 'text-primary-500' : 'text-neutral-400'}`} />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索内容、备注、标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`input pl-10 pr-20 py-2.5 text-sm bg-white/80 transition-all duration-200 ${
              isFocused ? 'border-primary-300 ring-2 ring-primary-100 shadow-sm' : ''
            }`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="p-0.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
                title="清除搜索 (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-0.5 text-xs text-neutral-300 bg-neutral-50 px-1.5 py-0.5 rounded">
                <Command className="w-3 h-3" />
                <span>F</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 当前筛选状态提示 */}
      {filterType !== 'all' && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-primary-50 rounded-lg text-xs text-primary-600">
          <span>筛选中:</span>
          <span className="font-medium">
            {filterType === 'favorite' ? '收藏' : filterType}
          </span>
          <button
            onClick={() => useClipboardStore.getState().setFilterType('all')}
            className="ml-1 hover:text-primary-800"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <div className="w-px h-5 bg-neutral-200 mx-1" />

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
