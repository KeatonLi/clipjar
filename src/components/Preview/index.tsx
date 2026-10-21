import { IconButton } from '@/components/ui/icon-button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Copy, X, FileText, Code, Link, Image as ImageIcon, ZoomIn, ZoomOut } from 'lucide-react';
import type { ClipboardItem } from '../../types';

const types = {
  text: { title: '文本预览', Icon: FileText },
  code: { title: '代码预览', Icon: Code },
  link: { title: '链接预览', Icon: Link },
  image: { title: '图片预览', Icon: ImageIcon },
  file: { title: '内容预览', Icon: FileText }
};

export function Preview({
  item,
  onClose,
  onCopy,
  error
}: {
  item: ClipboardItem;
  onClose(): void;
  onCopy(item: ClipboardItem): Promise<void>;
  error: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brokenImage, setBrokenImage] = useState(false);
  const { title, Icon } = types[item.contentType];
  const isImage = item.contentType === 'image';
  const canCopy = !isImage || Boolean(item.imagePath && !brokenImage);
  const copy = async () => {
    if (busy || !canCopy) return;
    setBusy(true);
    try {
      await onCopy(item);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="preview-panel"
        showCloseButton={false}
        aria-describedby="preview-description"
        onKeyDown={(e) => {
          if (
            e.key === 'Enter' &&
            !e.nativeEvent.isComposing &&
            !(e.target as HTMLElement).closest('button,a,input,textarea')
          ) {
            e.preventDefault();
            void copy();
          }
        }}
      >
        <header className="modal-header">
          <div className="modal-heading">
            <span className="modal-icon">
              <Icon size={18} />
            </span>
            <div>
              <DialogTitle id="preview-title">{title}</DialogTitle>
              <DialogDescription id="preview-description">
                {isImage
                  ? '查看已保存的图片'
                  : `${item.content.length.toLocaleString()} 个字符 · 完整内容`}
              </DialogDescription>
            </div>
          </div>
          <IconButton
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <X size={18} />
          </IconButton>
        </header>
        <div
          className={`preview-content ${isImage ? 'is-image' : ''} ${zoomed ? 'is-zoomed' : ''}`}
          tabIndex={0}
          aria-label="完整内容"
        >
          {isImage ? (
            item.imagePath && !brokenImage ? (
              <img
                src={item.imagePath}
                alt="已保存的剪贴板图片"
                onError={() => setBrokenImage(true)}
              />
            ) : (
              <p className="preview-unavailable">这条记录的图片数据已不可用，请重新复制原图。</p>
            )
          ) : (
            <pre className={item.contentType === 'code' ? 'preview-code' : ''}>{item.content}</pre>
          )}
        </div>
        {item.note && <p className="preview-note">备注 · {item.note}</p>}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          {isImage && item.imagePath && !brokenImage ? (
            <Button
              variant="outline"
              size="sm"
              className="secondary-button"
              aria-pressed={zoomed}
              onClick={() => setZoomed(!zoomed)}
            >
              {zoomed ? <ZoomOut size={15} /> : <ZoomIn size={15} />}
              {zoomed ? '适应窗口' : '实际大小'}
            </Button>
          ) : (
            <span className="muted-hint">Esc 关闭 · Enter 复制</span>
          )}
          <Button
            variant="default"
            size="default"
            className="primary-button"
            onClick={() => void copy()}
            disabled={busy || !canCopy}
          >
            <Copy size={15} />
            {busy ? '正在复制…' : '复制内容'}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
