import { useClipboardStore, getFilteredItems, getGroupedItems } from '../../stores/clipboardStore';
import { ClipboardItem } from '../ClipboardItem';
import { ClipboardX, Search, Filter } from 'lucide-react';
import type { ClipboardItem as ClipboardItemType } from '../../types';
import { useMemo } from 'react';

function formatGroupLabel(key: string): string {
  const labels: Record<string, string> = {
    today: '今天',
    yesterday: '昨天',
    thisWeek: '本周',
    earlier: '更早',
  };
  return labels[key] || key;
}

export function ClipboardList() {
  const state = useClipboardStore();
  const filteredItems = getFilteredItems(state);
  const groupedItems = getGroupedItems(state);

  const hasItems = filteredItems.length > 0;
  const hasSearchQuery = state.searchQuery.trim().length > 0;
  const isFiltering = state.filterType !== 'all';

  // 优化：使用 useMemo 缓存分组结果
  const groupEntries = useMemo(
    () => Object.entries(groupedItems).filter(([, items]) => items.length > 0),
    [groupedItems]
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      {!hasItems ? (
        <div className="empty-state h-full">
          {hasSearchQuery ? (
            <>
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                <Search className="w-10 h-10 text-amber-300" />
              </div>
              <h3 className="text-lg font-medium text-neutral-700 mb-1">
                未找到匹配结果
              </h3>
              <p className="text-sm text-neutral-400 max-w-xs">
                试试其他关键词，或清除搜索条件
              </p>
              {state.searchQuery && (
                <button
                  onClick={() => useClipboardStore.getState().setSearchQuery('')}
                  className="mt-4 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  清除搜索
                </button>
              )}
            </>
          ) : isFiltering ? (
            <>
              <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                <Filter className="w-10 h-10 text-primary-300" />
              </div>
              <h3 className="text-lg font-medium text-neutral-700 mb-1">
                没有匹配的内容
              </h3>
              <p className="text-sm text-neutral-400 max-w-xs">
                当前筛选条件下没有找到内容
              </p>
              <button
                onClick={() => useClipboardStore.getState().setFilterType('all')}
                className="mt-4 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              >
                显示全部
              </button>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                <ClipboardX className="w-10 h-10 text-primary-300" />
              </div>
              <h3 className="text-lg font-medium text-neutral-700 mb-1">
                暂无剪贴板记录
              </h3>
              <p className="text-sm text-neutral-400 max-w-xs">
                复制一些内容，它会自动出现在这里
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* 搜索结果统计 */}
          {hasSearchQuery && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 rounded-lg text-sm text-primary-600 mb-2">
              <Search className="w-4 h-4" />
              <span>
                找到 <strong>{filteredItems.length}</strong> 条匹配结果
              </span>
              <button
                onClick={() => useClipboardStore.getState().setSearchQuery('')}
                className="ml-auto text-xs hover:text-primary-800"
              >
                清除
              </button>
            </div>
          )}

          {groupEntries.map(([key, items]) => (
            <div key={key}>
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2 sticky top-0 bg-neutral-50/80 backdrop-blur-sm py-2 -mx-4 px-4 z-10">
                {formatGroupLabel(key)}
                <span className="text-neutral-300">·</span>
                <span className="text-neutral-400 font-normal">
                  {items.length} 条
                </span>
              </h2>
              <div className="space-y-2">
                {items.map((item: ClipboardItemType) => (
                  <ClipboardItem key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 text-sm">
            <span>共 {filteredItems.length} 条记录</span>
          </div>
        </div>
      )}
    </div>
  );
}
