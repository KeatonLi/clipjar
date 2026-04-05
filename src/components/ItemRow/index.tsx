import { memo, useCallback } from 'react';
import { Star, Copy, Trash2, Check, X, Link, Code, Image as ImageIcon, FileText } from 'lucide-react';
import type { ClipboardItem } from '../../types';
import { ContentType } from '../../types';
import { formatTime, truncate } from '../../utils';

/** Type badge component */
const TypeBadge = memo(({ type }: { type: ContentType }) => {
  if (type === ContentType.LINK) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium">
        <Link className="w-3 h-3" />
        链接
      </span>
    );
  }
  if (type === ContentType.CODE) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 text-violet-600 text-xs font-medium">
        <Code className="w-3 h-3" />
        代码
      </span>
    );
  }
  if (type === ContentType.IMAGE) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium">
        <ImageIcon className="w-3 h-3" />
        图片
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-medium">
      <FileText className="w-3 h-3" />
      文本
    </span>
  );
});

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

export const ItemRow = memo(function ItemRow({
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
}: ItemRowProps) {
  const handleCopy = useCallback(() => onCopy(item), [item, onCopy]);
  const handleDelete = useCallback(() => onDelete(item.id), [item.id, onDelete]);
  const handleToggleFavorite = useCallback(() => onToggleFavorite(item.id), [item.id, onToggleFavorite]);
  const handleStartEdit = useCallback(() => onStartEdit(item.id, item.note), [item.id, item.note, onStartEdit]);
  const handleSaveNote = useCallback(() => onSaveNote(item.id), [item.id, onSaveNote]);

  return (
    <div
      className={`group relative flex flex-col p-4 rounded-2xl transition-all duration-200 cursor-pointer border ${
        isSelected
          ? 'bg-sky-50 border-sky-300 shadow-md shadow-sky-100'
          : 'bg-white border-neutral-200 hover:border-sky-200 hover:shadow-lg'
      }`}
      onDoubleClick={handleCopy}
    >
      {/* Main content row */}
      <div className="flex items-start gap-3">
        {/* Content */}
        <div className="flex-1 min-w-0" onClick={handleCopy}>
          {item.contentType === ContentType.IMAGE && item.imagePath ? (
            <div className="mt-1">
              <img
                src={item.imagePath}
                alt="剪贴板图片"
                className="max-w-full h-auto rounded-xl border border-neutral-200"
                style={{ maxHeight: '120px', objectFit: 'contain' }}
                loading="lazy"
              />
            </div>
          ) : (
            <p className="text-sm text-neutral-700 leading-relaxed line-clamp-3">
              {truncate(item.content)}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className={`flex items-center gap-1 shrink-0 transition-opacity ${
          isSelected || isCopied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <button
            onClick={handleToggleFavorite}
            className={`p-2 rounded-xl transition-all ${
              item.isFavorite
                ? 'text-amber-500 bg-amber-50'
                : 'text-neutral-400 hover:text-amber-500 hover:bg-amber-50'
            }`}
            title={item.isFavorite ? '取消收藏' : '收藏'}
          >
            <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={handleCopy}
            className={`p-2 rounded-xl transition-all ${
              isCopied
                ? 'text-emerald-500 bg-emerald-50'
                : 'text-neutral-400 hover:text-emerald-500 hover:bg-emerald-50'
            }`}
            title="复制"
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-xl text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom meta row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
        <div className="flex items-center gap-2">
          <TypeBadge type={item.contentType} />
          <span className="text-xs text-neutral-400">{formatTime(item.createdAt)}</span>
        </div>

        {item.isFavorite && (
          <div
            className="flex items-center gap-1 text-xs text-amber-600 cursor-pointer hover:text-amber-700"
            onClick={handleStartEdit}
          >
            <span className="bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
              {item.note || '+ 添加备注'}
            </span>
          </div>
        )}
      </div>

      {/* Note editing */}
      {isEditingNote && item.isFavorite && (
        <div className="mt-3 pt-3 border-t border-neutral-100 animate-fade-in">
          <div className="flex items-start gap-2">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="添加备注..."
              className="flex-1 text-sm bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
              rows={2}
              autoFocus
              maxLength={200}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={handleSaveNote}
                className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
