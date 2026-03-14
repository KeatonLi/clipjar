import { memo, useCallback } from 'react';
import { Star, Copy, Check, X, Trash2 } from 'lucide-react';
import { TypeIcon } from '../TypeIcon';
import { ContentType, type ClipboardItem } from '../../types';

// 格式化时间 - 移到组件外避免重复创建
const formatTime = (timestamp: number): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  if (timestamp >= today.getTime()) return '今天';
  if (timestamp >= yesterday.getTime()) return '昨天';

  const diff = Date.now() - timestamp;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

const truncate = (text: string, len: number = 100) => {
  return text.length > len ? text.substring(0, len) + '...' : text;
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

// 使用 memo 避免不必要的重渲染
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
  // 使用 useCallback 稳定回调引用
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

  return (
    <div
      className={`group flex flex-col justify-between p-3 rounded-xl transition-all duration-200 cursor-pointer border min-h-[80px] ${
        isSelected
          ? 'bg-gradient-to-r from-primary-50 to-primary-50/70 border-primary-200 shadow-sm'
          : 'bg-white border-slate-100 hover:border-primary-200/60 hover:shadow-card hover:-translate-y-0.5'
      }`}
      onDoubleClick={handleCopy}
    >
      {/* 文字内容区域 */}
      <div className="flex-1" onClick={handleCopy}>
        {item.contentType === ContentType.IMAGE && item.imagePath ? (
          <div className="mt-1">
            <img
              src={item.imagePath}
              alt="剪贴板图片"
              className="max-w-full h-auto rounded-lg border border-slate-200"
              style={{ maxHeight: '120px', objectFit: 'contain' }}
              loading="lazy"
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
                  onClick={handleSave}
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
              onClick={handleStartEdit}
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

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <button
            onClick={handleToggle}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              item.isFavorite
                ? 'text-amber-400 bg-amber-50'
                : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50/50'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              isCopied
                ? 'text-green-500 bg-green-50'
                : 'text-slate-300 hover:text-green-500 hover:bg-green-50/50'
            }`}
          >
            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50/50 transition-all duration-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

ItemRow.displayName = 'ItemRow';
