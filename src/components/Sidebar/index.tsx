import {
  LayoutGrid,
  Star,
  Image as ImageIcon,
  FileText,
  Code,
  Link,
  Tags,
  Settings,
  StickyNote,
} from 'lucide-react';
import { useClipboardStore } from '../../stores/clipboardStore';
import { ContentType, type FilterType } from '../../types';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
  highlight?: boolean;
}

function NavItem({ icon, label, count, isActive, onClick, highlight }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`nav-item w-full ${isActive ? 'active' : ''} ${highlight ? 'highlight' : ''}`}
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </button>
  );
}

export function Sidebar() {
  const { filterType, setFilterType, items, setShowSettings } = useClipboardStore();

  const getCount = (type: FilterType) => {
    if (type === 'all') return items.length;
    if (type === 'favorite') return items.filter((i) => i.isFavorite).length;
    return items.filter((i) => i.contentType === type).length;
  };

  // 获取有备注的条目数量
  const noteCount = items.filter((i) => i.note && i.note.trim().length > 0).length;

  const navItems: { type: FilterType; icon: React.ReactNode; label: string; highlight?: boolean }[] = [
    { type: 'all', icon: <LayoutGrid className="w-4 h-4" />, label: '全部' },
    { type: 'favorite', icon: <Star className="w-4 h-4" />, label: '收藏', highlight: true },
  ];

  const typeItems: { type: FilterType; icon: React.ReactNode; label: string }[] = [
    { type: ContentType.TEXT, icon: <FileText className="w-4 h-4" />, label: '文本' },
    { type: ContentType.CODE, icon: <Code className="w-4 h-4" />, label: '代码' },
    { type: ContentType.LINK, icon: <Link className="w-4 h-4" />, label: '链接' },
    { type: ContentType.IMAGE, icon: <ImageIcon className="w-4 h-4" />, label: '图片' },
  ];

  return (
    <aside className="w-56 bg-white border-r border-neutral-200/60 flex flex-col">
      <div className="p-3 space-y-1">
        {navItems.map((item) => (
          <NavItem
            key={item.type}
            icon={item.icon}
            label={item.label}
            count={getCount(item.type)}
            isActive={filterType === item.type}
            onClick={() => setFilterType(item.type)}
            highlight={item.highlight}
          />
        ))}
      </div>

      <div className="mx-3 h-px bg-neutral-100" />

      <div className="p-3">
        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 px-4">
          类型
        </h3>
        <div className="space-y-1">
          {typeItems.map((item) => (
            <NavItem
              key={item.type}
              icon={item.icon}
              label={item.label}
              count={getCount(item.type)}
              isActive={filterType === item.type}
              onClick={() => setFilterType(item.type)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1" />

      {/* 备注筛选 */}
      <div className="p-3 border-t border-neutral-100">
        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 px-4 flex items-center gap-1">
          <StickyNote className="w-3 h-3" />
          备注
        </h3>
        <button
          className="nav-item w-full"
          onClick={() => setFilterType('all')}
        >
          <StickyNote className="w-4 h-4" />
          <span className="flex-1 text-left">有备注的内容</span>
          {noteCount > 0 && (
            <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
              {noteCount}
            </span>
          )}
        </button>
      </div>

      {/* 标签区域 - 预留 */}
      <div className="p-3 border-t border-neutral-100">
        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 px-4 flex items-center gap-1">
          <Tags className="w-3 h-3" />
          标签
        </h3>
        <div className="px-4 py-2 text-sm text-neutral-400">
          暂无标签
        </div>
      </div>

      <div className="p-3 border-t border-neutral-100">
        <button className="nav-item w-full" onClick={() => setShowSettings(true)}>
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}
