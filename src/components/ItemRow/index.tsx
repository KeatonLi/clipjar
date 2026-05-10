import { memo, useCallback } from 'react';
import { Star, Copy, Trash2, Check, X, Link, Code, Image as ImageIcon, FileText } from 'lucide-react';
import type { ClipboardItem } from '../../types';
import { ContentType } from '../../types';
import { formatTime, truncate } from '../../utils';

/** Type badge component */
const TypeBadge = memo(({ type }: { type: ContentType }) => {
  if (type === ContentType.LINK) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-600 text-xs font-semibold border border-blue-100/60">
        <Link className="w-3 h-3" />
        链接
      </span>
    );
  }
  if (type === ContentType.CODE) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-semibold border border-indigo-100/60">
        <Code className="w-3 h-3" />
        代码
      </span>
    );
  }
  if (type === ContentType.IMAGE) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-semibold border border-emerald-100/60">
        <ImageIcon className="w-3 h-3" />
        图片
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200/60">
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
      className={`group relative flex flex-col p-4 rounded-2xl transition-all duration-200 cursor-pointer glass card-hover ${
        isSelected
          ? 'border-2 border-blue-400 shadow-blue bg-white/95'
          : 'border border-white/60 shadow-sm bg-white/70 hover:bg-white/90'
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
                className="max-w-full h-auto rounded-xl border border-slate-200/50 shadow-sm"
                style={{ maxHeight: '120px', objectFit: 'contain' }}
                loading="lazy"
              />
            </div>
          ) : (
            <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
              {truncate(item.content)}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className={`flex items-center gap-1 shrink-0 transition-all duration-200 ${
          isSelected || isCopied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <button
            onClick={handleToggleFavorite}
            className={`p-2 rounded-xl transition-all ${
              item.isFavorite
                ? 'text-amber-500 bg-amber-50 shadow-sm'
                : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
            }`}
            title={item.isFavorite ? '取消收藏' : '收藏'}
          >
            <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={handleCopy}
            className={`p-2 rounded-xl transition-all ${
              isCopied
                ? 'text-emerald-500 bg-emerald-50 shadow-sm'
                : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'
            }`}
            title="复制"
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom meta row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100/60">
        <div className="flex items-center gap-2">
          <TypeBadge type={item.contentType} />
          <span className="text-xs text-slate-400">{formatTime(item.createdAt)}</span>
        </div>

        {item.isFavorite && (
          <div
            className="flex items-center gap-1 text-xs cursor-pointer group/note"
            onClick={handleStartEdit}
          >
            <span className="bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5 rounded-xl border border-amber-100/60 text-amber-600 group-hover/note:bg-gradient-to-r group-hover/note:from-amber-100 group-hover/note:to-orange-100 transition-all font-medium">
              {item.note || '+ 添加备注'}
            </span>
          </div>
        )}
      </div>

      {/* Note editing */}
      {isEditingNote && item.isFavorite && (
        <div className="mt-3 pt-3 border-t border-slate-100/60 animate-fade-in">
          <div className="flex items-start gap-2">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="添加备注..."
              className="flex-1 text-sm bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-blue-300 focus:ring-3 focus:ring-blue-100/50 transition-all"
              rows={2}
              autoFocus
              maxLength={200}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={handleSaveNote}
                className="p-2 rounded-xl text-emerald-500 hover:bg-emerald-50 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
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
