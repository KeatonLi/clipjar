import { memo, useCallback } from 'react';
import { Star, Copy, Check, X, Trash2, Link, Code, FileText, Image } from 'lucide-react';
import { ContentType, type ClipboardItem } from '../../types';

// 格式化时间
const formatTime = (timestamp: number): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  if (timestamp >= today) return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (timestamp >= yesterday) return '昨天';

  const diff = Date.now() - timestamp;
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days}天前`;
  }
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

const truncate = (text: string, len: number = 120) => {
  return text.length > len ? text.substring(0, len) + '...' : text;
};

// 内容类型配置
const typeConfig = {
  [ContentType.LINK]: { icon: Link, color: 'text-blue-500', bg: 'bg-blue-50', label: '链接' },
  [ContentType.CODE]: { icon: Code, color: 'text-purple-500', bg: 'bg-purple-50', label: '代码' },
  [ContentType.IMAGE]: { icon: Image, color: 'text-green-500', bg: 'bg-green-50', label: '图片' },
  [ContentType.TEXT]: { icon: FileText, color: 'text-surface-400', bg: 'bg-surface-100', label: '文本' },
};

interface ItemRowProps {
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
}

export const ItemRow = memo(({
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
}: ItemRowProps) => {
  const handleCopy = useCallback(() => onCopy(item), [onCopy, item]);
  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(item.id);
  }, [onToggleFavorite, item.id]);
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(item.id);
  }, [onDelete, item.id]);
  const handleSave = useCallback(() => onSaveNote(item.id), [onSaveNote, item.id]);
  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onStartEdit(item.id, item.note);
  }, [onStartEdit, item.id, item.note]);

  const typeInfo = typeConfig[item.contentType] || typeConfig[ContentType.TEXT];
  const TypeIcon = typeInfo.icon;

  return (
    <div
      className={`group relative flex flex-col p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'bg-white border-primary-300 shadow-card'
          : item.isFavorite
          ? 'bg-amber-50/30 border-amber-200/50 hover:border-amber-300/50'
          : 'bg-white border-transparent hover:border-surface-200 shadow-card hover:shadow-card-hover'
      }`}
      onClick={handleCopy}
    >
      {/* 收藏标记 */}
      {item.isFavorite && (
        <div className="absolute -top-1 -right-1">
          <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
            <Star className="w-3 h-3 text-white fill-white" />
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex gap-3">
        {/* 类型图标 */}
        <div className={`shrink-0 w-10 h-10 rounded-xl ${typeInfo.bg} flex items-center justify-center`}>
          <TypeIcon className={`w-5 h-5 ${typeInfo.color}`} />
        </div>

        {/* 文本内容 */}
        <div className="flex-1 min-w-0">
          {item.contentType === ContentType.IMAGE && item.imagePath ? (
            <div className="mt-1">
              <img
                src={item.imagePath}
                alt="图片"
                className="max-w-full h-auto max-h-[100px] rounded-xl border border-surface-200 object-contain"
                loading="lazy"
              />
            </div>
          ) : (
            <p className="text-sm text-surface-700 leading-relaxed break-all line-clamp-3">
              {truncate(item.content, 200)}
            </p>
          )}
        </div>
      </div>

      {/* 备注区域 */}
      {item.isFavorite && (
        <div className="mt-3 pt-3 border-t border-surface-100">
          {isEditingNote ? (
            <div className="flex items-start gap-2">
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="添加备注..."
                className="flex-1 text-xs bg-white border border-primary-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                rows={2}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={handleSave}
                  className="w-7 h-7 rounded-lg bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}
                  className="w-7 h-7 rounded-lg bg-surface-100 text-surface-500 flex items-center justify-center hover:bg-surface-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 cursor-pointer group/note"
              onClick={handleStartEdit}
            >
              {item.note ? (
                <span className="text-xs text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg font-medium">
                  {item.note}
                </span>
              ) : (
                <span className="text-xs text-surface-400 hover:text-primary-500 flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-surface-100 flex items-center justify-center text-[10px]">+</span>
                  添加备注
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between mt-3 pt-2">
        {/* 左侧：时间和类型 */}
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-medium text-surface-400">
            {formatTime(item.createdAt)}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${typeInfo.bg} ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={handleToggle}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              item.isFavorite
                ? 'text-amber-400 bg-amber-50'
                : 'text-surface-300 hover:text-amber-400 hover:bg-amber-50'
            }`}
          >
            <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
          </button>
          
          <button
            onClick={handleCopy}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              isCopied
                ? 'text-green-500 bg-green-50'
                : 'text-surface-300 hover:text-primary-500 hover:bg-primary-50'
            }`}
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          
          <button
            onClick={handleDelete}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-surface-300 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

ItemRow.displayName = 'ItemRow';
