import { useClipboardStore, getFilteredItems, getGroupedItems } from '../../stores/clipboardStore';
import { ClipboardItem } from '../ClipboardItem';
import { ClipboardX, Sparkles } from 'lucide-react';
import type { ClipboardItem as ClipboardItemType } from '../../types';

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

  return (
    <div className="h-full overflow-y-auto p-4">
      {!hasItems ? (
        <div className="empty-state h-full">
          <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mb-4">
            <ClipboardX className="w-10 h-10 text-primary-300" />
          </div>
          <h3 className="text-lg font-medium text-neutral-700 mb-1">
            暂无剪贴板记录
          </h3>
          <p className="text-sm text-neutral-400 max-w-xs">
            复制一些内容，它会自动出现在这里
          </p>
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl mx-auto">
          {Object.entries(groupedItems).map(
            ([key, items]) =>
              items.length > 0 && (
                <div key={key}>
                  <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
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
              )
          )}

          <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 text-sm">
            <Sparkles className="w-4 h-4" />
            <span>已加载全部内容</span>
          </div>
        </div>
      )}
    </div>
  );
}
