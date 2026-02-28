import { useState, memo } from 'react';
import {
  Star,
  Copy,
  Trash2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Code,
  Link,
  Check,
  StickyNote,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import { useClipboardStore } from '../../stores/clipboardStore';
import { ContentType, type ClipboardItem as ClipboardItemType } from '../../types';

interface ClipboardItemProps {
  item: ClipboardItemType;
}

function getContentIcon(type: ContentType) {
  switch (type) {
    case ContentType.CODE:
      return <Code className="w-4 h-4" />;
    case ContentType.LINK:
      return <Link className="w-4 h-4" />;
    case ContentType.IMAGE:
      return <ImageIcon className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
}

function getContentIconColor(type: ContentType): string {
  switch (type) {
    case ContentType.CODE:
      return 'text-purple-500 bg-purple-50';
    case ContentType.LINK:
      return 'text-blue-500 bg-blue-50';
    case ContentType.IMAGE:
      return 'text-green-500 bg-green-50';
    default:
      return 'text-neutral-500 bg-neutral-100';
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // 小于1小时显示分钟
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return minutes < 1 ? '刚刚' : `${minutes} 分钟前`;
  }

  // 小于24小时显示小时
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} 小时前`;
  }

  // 否则显示具体时间
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 截断内容显示，优化内存
function truncateContent(content: string, maxLength: number = 500): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

export const ClipboardItem = memo(function ClipboardItem({ item }: ClipboardItemProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteContent, setNoteContent] = useState(item.note || '');

  const { selectedId, setSelectedId, toggleFavorite, deleteItem, incrementUseCount, updateNote } =
    useClipboardStore();

  const isSelected = selectedId === item.id;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.content);
      setIsCopied(true);
      incrementUseCount(item.id);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteItem(item.id);
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(item.id);
  };

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.contentType === ContentType.LINK) {
      window.open(item.content, '_blank');
    }
  };

  const handleSaveNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNote(item.id, noteContent.trim());
    setIsEditingNote(false);
  };

  const handleCancelNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNoteContent(item.note || '');
    setIsEditingNote(false);
  };

  return (
    <div
      className={`clipboard-card ${isSelected ? 'selected' : ''}`}
      onClick={() => setSelectedId(item.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3">
        {/* 类型图标 */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getContentIconColor(
            item.contentType
          )}`}
        >
          {getContentIcon(item.contentType)}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 min-w-0">
          {/* 顶部信息 */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs text-neutral-400">{formatTime(item.createdAt)}</span>
            {item.sourceApp && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="text-xs text-neutral-400">来自 {item.sourceApp}</span>
              </>
            )}
            {item.useCount > 0 && (
              <span className="text-xs text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded">
                使用 {item.useCount} 次
              </span>
            )}
            {item.isFavorite && (
              <span className="text-xs text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-current" />
                已收藏
              </span>
            )}
          </div>

          {/* 内容预览 - 截断显示 */}
          <div className="text-sm text-neutral-700 line-clamp-3 leading-relaxed">
            {item.contentType === ContentType.CODE ? (
              <pre className="font-mono text-xs bg-neutral-50 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                {truncateContent(item.content)}
              </pre>
            ) : item.contentType === ContentType.LINK ? (
              <a
                href={item.content}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {truncateContent(item.content)}
              </a>
            ) : (
              truncateContent(item.content)
            )}
          </div>

          {/* 标签 */}
          {item.tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {item.tags.map((tag) => (
                <span key={tag} className="tag-blue">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 备注区域 */}
          <div className="mt-3 pt-3 border-t border-neutral-100">
            {isEditingNote ? (
              <div className="flex items-start gap-2" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="添加备注..."
                  className="flex-1 text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100"
                  rows={2}
                  autoFocus
                />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={handleSaveNote}
                    className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 transition-colors"
                    title="保存"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelNote}
                    className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 transition-colors"
                    title="取消"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="flex items-start gap-2 cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingNote(true);
                }}
              >
                {item.note ? (
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-1">
                      <StickyNote className="w-3 h-3" />
                      <span>备注</span>
                    </div>
                    <p className="text-sm text-neutral-600 bg-neutral-50 rounded-lg px-3 py-2">
                      {item.note}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-primary-500 transition-colors py-1">
                    <Edit3 className="w-3 h-3" />
                    <span>添加备注</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div
          className={`flex items-center gap-1 shrink-0 transition-opacity duration-200 ${
            isHovered || isSelected ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* 收藏按钮 */}
          <button
            onClick={handleToggleFavorite}
            className={`p-1.5 rounded-lg transition-colors ${
              item.isFavorite
                ? 'text-amber-400 bg-amber-50'
                : 'text-neutral-400 hover:text-amber-400 hover:bg-amber-50'
            }`}
            title={item.isFavorite ? '取消收藏' : '收藏'}
          >
            <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
          </button>

          {/* 复制按钮 */}
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-lg transition-colors ${
              isCopied
                ? 'text-green-500 bg-green-50'
                : 'text-neutral-400 hover:text-primary-500 hover:bg-primary-50'
            }`}
            title="复制"
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* 打开链接按钮 */}
          {item.contentType === ContentType.LINK && (
            <button
              onClick={handleOpenLink}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-500 hover:bg-primary-50 transition-colors"
              title="打开链接"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {/* 删除按钮 */}
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
