import { memo, useEffect, useRef } from 'react';
import {
  Star,
  Eye,
  Trash2,
  Check,
  X,
  Link,
  Code,
  Image as ImageIcon,
  FileText,
  MessageSquareText
} from 'lucide-react';
import type { ClipboardItem } from '../../types';
import { ContentType } from '../../types';
import { formatTime, truncate } from '../../utils';

const contentTypes = {
  [ContentType.TEXT]: { label: '文本', Icon: FileText },
  [ContentType.CODE]: { label: '代码', Icon: Code },
  [ContentType.LINK]: { label: '链接', Icon: Link },
  [ContentType.IMAGE]: { label: '图片', Icon: ImageIcon },
  [ContentType.FILE]: { label: '文件', Icon: FileText }
};

interface ItemRowProps {
  item: ClipboardItem;
  isCopied: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onCopy: (item: ClipboardItem) => void;
  onPreview: (item: ClipboardItem) => void;
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
  onSelect,
  onCopy,
  onPreview,
  onDelete,
  onToggleFavorite,
  isEditingNote,
  noteContent,
  setNoteContent,
  onStartEdit,
  onSaveNote,
  onCancelEdit
}: ItemRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { label, Icon } = contentTypes[item.contentType];
  const copiedAt = new Date(item.createdAt);
  const dateTime = Number.isFinite(copiedAt.getTime()) ? copiedAt.toISOString() : undefined;
  const dayLabel = dateTime ? formatTime(item.createdAt) : '时间未知';
  const timeLabel =
    dayLabel === '今天'
      ? `${dayLabel} ${copiedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : dayLabel;

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  return (
    <div
      ref={rowRef}
      data-type={item.contentType}
      className={`clipboard-row ${isSelected ? 'is-selected' : ''} ${isCopied ? 'is-copied' : ''}`}
    >
      <div className="clip-main">
        <button
          type="button"
          className="clip-content-button"
          onClick={() => onCopy(item)}
          onFocus={onSelect}
          aria-label={`复制${label}：${truncate(item.content, 60)}`}
        >
          <span className="clip-type-icon" aria-hidden="true">
            <Icon size={17} strokeWidth={1.6} />
          </span>
          <span className="clip-body">
            {item.contentType === ContentType.IMAGE && item.imagePath ? (
              <span className="clip-image-preview">
                <img src={item.imagePath} alt="剪贴板图片预览" loading="lazy" />
                <span className="clip-image-label">
                  {item.imageWidth && item.imageHeight
                    ? `${item.imageWidth} × ${item.imageHeight}`
                    : '图片'}
                </span>
              </span>
            ) : (
              <span
                className={`clip-text ${item.contentType === ContentType.CODE ? 'is-code' : ''}`}
              >
                {truncate(item.content, 180)}
              </span>
            )}
            <span className="clip-meta">
              <span className="clip-type-label">{label}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={dateTime}>{timeLabel}</time>
              {isCopied && (
                <span className="copy-feedback" role="status">
                  已复制
                </span>
              )}
            </span>
          </span>
        </button>
        <div className="clip-actions">
          <button
            type="button"
            onClick={() => onToggleFavorite(item.id)}
            className={`icon-button favorite-button ${item.isFavorite ? 'is-favorite' : ''}`}
            aria-label={item.isFavorite ? '取消收藏' : '收藏'}
            aria-pressed={item.isFavorite}
            title={item.isFavorite ? '取消收藏' : '收藏'}
          >
            <Star size={16} strokeWidth={1.7} fill={item.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={() => onPreview(item)}
            onFocus={onSelect}
            className="icon-button contextual-action preview-button"
            aria-label="预览完整内容"
            title="预览 · 空格"
          >
            <Eye size={16} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="icon-button contextual-action delete-button"
            aria-label="删除记录"
            title="删除"
          >
            <Trash2 size={16} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {item.isFavorite && !isEditingNote && (
        <button
          type="button"
          className={`clip-note ${item.note ? 'has-note' : ''}`}
          onClick={() => onStartEdit(item.id, item.note)}
        >
          {item.note && <MessageSquareText size={12} aria-hidden="true" />}
          <span>{item.note || '+ 添加备注'}</span>
        </button>
      )}

      {isEditingNote && item.isFavorite && (
        <div className="note-editor">
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="为这条收藏添加备注…"
            aria-label="收藏备注"
            rows={2}
            autoFocus
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                onCancelEdit();
              }
            }}
          />
          <div className="note-editor-footer">
            <span>{noteContent.length}/200</span>
            <div>
              <button
                type="button"
                className="icon-button"
                onClick={onCancelEdit}
                aria-label="取消编辑"
                title="取消"
              >
                <X size={16} />
              </button>
              <button
                type="button"
                className="icon-button save-note"
                onClick={() => onSaveNote(item.id)}
                aria-label="保存备注"
                title="保存"
              >
                <Check size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
