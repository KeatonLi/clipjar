import { useEffect, useState } from 'react';
import { X, Copy, Bookmark, Pencil } from 'lucide-react';
import type { ClipboardItem } from '../../types';
import { useClipboardStore } from '../../stores/clipboardStore';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface ContentPreviewProps {
  item: ClipboardItem;
  onClose: () => void;
  onCopy: (item: ClipboardItem) => Promise<void>;
  onSnippet: (item: ClipboardItem) => void;
}

export function ContentPreview({ item, onClose, onCopy, onSnippet }: ContentPreviewProps) {
  const getImageSource = useClipboardStore(state => state.getImageSource);
  const [image, setImage] = useState(item.imagePath ?? '');
  const [imageError, setImageError] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');
  const ref = useDialogFocus(onClose);
  useEffect(() => {
    if (item.contentType !== 'image') return;
    let cancelled = false;
    getImageSource(item.id).then(source => { if (!cancelled) setImage(source); }).catch(error => { if (!cancelled) setImageError(String(error)); });
    return () => { cancelled = true; };
  }, [item.id, item.contentType, getImageSource]);
  const copy = async () => {
    if (copying) return;
    setCopying(true);
    setCopyError('');
    try { await onCopy(item); onClose(); } catch (error) { setCopyError(error instanceof Error ? error.message : String(error)); setCopying(false); }
  };
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div ref={ref} className="dialog-panel content-preview" role="dialog" aria-modal="true" aria-labelledby="preview-heading" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <header className="dialog-header"><h2 id="preview-heading">{item.title || '内容预览'}</h2><button type="button" className="icon-button" aria-label="关闭预览" onClick={onClose}><X size={18} /></button></header>
        <div className="dialog-body preview-body">
          {item.contentType === 'image' ? image ? <img className="full-image" src={image} alt="剪贴板图片完整预览" /> : <p className={imageError ? 'inline-error' : 'subtle-hint'} role="status">{imageError || '正在读取图片…'}</p> : <pre className={`full-text ${item.contentType === 'code' ? 'is-code' : ''}`}>{item.content}</pre>}
          {item.note && <p className="preview-note">备注：{item.note}</p>}
          {copyError && <p className="inline-error" role="alert">{copyError}</p>}
        </div>
        <footer className="dialog-footer">
          {item.contentType !== 'image' ? <button type="button" className="secondary-button" onClick={() => { onClose(); onSnippet(item); }}>{item.isSnippet ? <Pencil size={14} /> : <Bookmark size={14} />}{item.isSnippet ? '编辑片段' : '保存为片段'}</button> : <span className="subtle-hint">{item.imageWidth} × {item.imageHeight}</span>}
          <button type="button" className="primary-button" onClick={() => void copy()} disabled={copying}><Copy size={14} />{copying ? '复制中…' : '复制内容'}</button>
        </footer>
      </div>
    </div>
  );
}
