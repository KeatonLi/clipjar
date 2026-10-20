import { useState } from 'react';
import { Copy, Star, ZoomIn, Image as ImageIcon } from 'lucide-react';
import type { ClipboardItem } from '../../types';

export function ImageInspector({
  item,
  onCopy,
  onPreview,
  onToggleFavorite
}: {
  item: ClipboardItem;
  onCopy(item: ClipboardItem): Promise<void>;
  onPreview(item: ClipboardItem): void;
  onToggleFavorite(id: number): void;
}) {
  const [broken, setBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    if (broken || busy || !item.imagePath) return;
    setBusy(true);
    try {
      await onCopy(item);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="image-inspector" aria-label="图片快速预览">
      {item.imagePath && !broken ? (
        <button
          type="button"
          className="inspector-media"
          onClick={() => onPreview(item)}
          aria-label="放大选中图片"
        >
          <img src={item.imagePath} alt="选中记录的图片" onError={() => setBroken(true)} />
        </button>
      ) : (
        <div className="inspector-unavailable" role="status">
          <ImageIcon size={28} />
          <p>图片数据不可用，请重新复制原图。</p>
        </div>
      )}
      <div className="inspector-footer">
        <div className="inspector-caption">
          <strong>{item.note || '剪贴板图片'}</strong>
          <p>
            {item.imageWidth && item.imageHeight
              ? `${item.imageWidth} × ${item.imageHeight}`
              : '图片'}
            <span>本地保存</span>
          </p>
        </div>
        <div className="inspector-actions">
          <button
            type="button"
            className="icon-button inspector-zoom"
            aria-label="放大图片"
            title="放大图片 · 空格"
            disabled={broken || !item.imagePath}
            onClick={() => onPreview(item)}
          >
            <ZoomIn size={18} />
          </button>
          <button
            type="button"
            className={`icon-button inspector-favorite ${item.isFavorite ? 'is-favorite' : ''}`}
            aria-label={item.isFavorite ? '取消收藏图片' : '收藏图片'}
            aria-pressed={item.isFavorite}
            onClick={() => onToggleFavorite(item.id)}
          >
            <Star size={18} fill={item.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="primary-button inspector-copy"
            disabled={broken || busy || !item.imagePath}
            onClick={() => void copy()}
          >
            <Copy size={16} />
            {busy ? '正在复制…' : '复制图片'}
          </button>
        </div>
      </div>
    </section>
  );
}
