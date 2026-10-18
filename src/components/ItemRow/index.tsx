import { memo, useEffect, useRef, useState } from 'react';
import { Star, Copy, Check, X, Link, Code, Image as ImageIcon, FileText, Bookmark, MoreHorizontal, Pencil, Trash2, Maximize2 } from 'lucide-react';
import type { ClipboardItem } from '../../types';
import { ContentType } from '../../types';
import { formatTime, truncate } from '../../utils';
import { useClipboardStore } from '../../stores/clipboardStore';

const contentTypes = {
  [ContentType.TEXT]: { label: '文本', Icon: FileText }, [ContentType.CODE]: { label: '代码', Icon: Code },
  [ContentType.LINK]: { label: '链接', Icon: Link }, [ContentType.IMAGE]: { label: '图片', Icon: ImageIcon }, [ContentType.FILE]: { label: '文件', Icon: FileText },
};

function Highlight({ text, search }: { text: string; search: string }) {
  const terms = search.trim().split(/\s+/).filter(Boolean).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return <>{text}</>;
  const expression = new RegExp(`(${terms.join('|')})`, 'gi');
  const lower = new Set(search.trim().toLocaleLowerCase().split(/\s+/));
  return <>{text.split(expression).map((part, index) => lower.has(part.toLocaleLowerCase()) ? <mark key={index}>{part}</mark> : part)}</>;
}

function searchExcerpt(content: string, search: string): string {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const positions = terms.map(term => content.toLocaleLowerCase().indexOf(term)).filter(index => index >= 0);
  const start = positions.length ? Math.max(0, Math.min(...positions) - 60) : 0;
  return `${start ? '…' : ''}${truncate(content.slice(start), 220)}`;
}

interface ItemRowProps {
  item: ClipboardItem;
  search: string;
  isCopied: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onCopy: (item: ClipboardItem) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onToggleFavorite: (id: number) => Promise<void>;
  onPreview: () => void;
  onSnippet: () => void;
  isEditingNote: boolean;
  noteContent: string;
  setNoteContent: (value: string) => void;
  onStartEdit: () => void;
  onSaveNote: () => Promise<void>;
  onCancelEdit: () => void;
}

export const ItemRow = memo(function ItemRow({ item, search, isCopied, isSelected, onSelect, onCopy, onDelete, onToggleFavorite, onPreview, onSnippet, isEditingNote, noteContent, setNoteContent, onStartEdit, onSaveNote, onCancelEdit }: ItemRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAbove, setMenuAbove] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(item.imagePath ?? '');
  const [imageError, setImageError] = useState('');
  const getImageSource = useClipboardStore(state => state.getImageSource);
  const { label, Icon } = contentTypes[item.contentType] ?? contentTypes[ContentType.TEXT];

  useEffect(() => { if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' }); }, [isSelected]);
  useEffect(() => {
    if (item.contentType !== ContentType.IMAGE) return;
    let cancelled = false;
    const load = () => getImageSource(item.id, true).then(source => { if (!cancelled) setImage(source); }).catch(() => { if (!cancelled) setImageError('图片预览暂时不可用'); });
    if (typeof IntersectionObserver === 'undefined') { void load(); return () => { cancelled = true; }; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); } }, { rootMargin: '80px' });
    if (rowRef.current) observer.observe(rowRef.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [item.id, item.contentType, getImageSource]);
  useEffect(() => {
    if (!menuOpen) { setConfirmDelete(false); return; }
    const close = (event: PointerEvent) => { if (!actionRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>(confirmDelete ? '.danger-action' : 'button')?.focus());
    return () => { document.removeEventListener('pointerdown', close); cancelAnimationFrame(frame); };
  }, [menuOpen, confirmDelete]);

  const act = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch { /* The store displays the error. */ } finally { setBusy(false); }
  };
  const menuAction = (action: () => void) => { setMenuOpen(false); action(); };

  return (
    <div ref={rowRef} className={`clipboard-row ${isSelected ? 'is-selected' : ''} ${item.isSnippet ? 'is-snippet' : ''}`}>
      <div className="clip-main">
        <button type="button" data-copy-id={item.id} className="clip-content-button" onClick={() => void act(() => onCopy(item))} onFocus={onSelect} disabled={busy} aria-label={`复制${item.title || label}：${truncate(item.content, 60)}`}>
          <span className="clip-type-icon" aria-hidden="true">{item.isSnippet ? <Bookmark size={17} strokeWidth={1.6} /> : <Icon size={17} strokeWidth={1.6} />}</span>
          <span className="clip-body">
            {item.title && <span className="clip-title"><Highlight text={item.title} search={search} /></span>}
            {item.contentType === ContentType.IMAGE ? image ? <span className="clip-image-preview"><img src={image} alt="剪贴板图片预览" loading="lazy" /></span> : <span className="image-placeholder"><ImageIcon size={23} strokeWidth={1.3} /><span>{imageError || '读取图片…'}</span></span> : <span className={`clip-text ${item.contentType === ContentType.CODE ? 'is-code' : ''}`}><Highlight text={searchExcerpt(item.content, search)} search={search} /></span>}
            <span className="clip-meta"><span>{label}</span>{item.contentType === ContentType.IMAGE && item.imageWidth && <><span aria-hidden="true">·</span><span>{item.imageWidth} × {item.imageHeight}</span></>}<span aria-hidden="true">·</span><span>{formatTime(item.isSnippet ? item.updatedAt : item.createdAt)}</span>{isCopied && <span className="copy-feedback">已复制</span>}</span>
          </span>
        </button>
        <div ref={actionRef} className="clip-actions" data-record-actions>
          <button type="button" onClick={() => void act(() => onToggleFavorite(item.id))} className={`icon-button favorite-button ${item.isFavorite ? 'is-favorite' : ''}`} disabled={busy} aria-label={item.isFavorite ? '取消收藏' : '收藏'} aria-pressed={item.isFavorite} title={item.isFavorite ? '取消收藏' : '收藏'}><Star size={15} strokeWidth={1.7} fill={item.isFavorite ? 'currentColor' : 'none'} /></button>
          <button type="button" onClick={() => void act(() => onCopy(item))} className="icon-button contextual-action" disabled={busy} aria-label="复制内容" title="复制">{isCopied ? <Check size={15} /> : <Copy size={15} strokeWidth={1.7} />}</button>
          <button ref={menuButtonRef} type="button" onClick={() => { const rect = menuButtonRef.current?.getBoundingClientRect(); setMenuAbove(!!rect && rect.bottom + 250 > window.innerHeight - 42); setMenuOpen(open => !open); }} className="icon-button contextual-action" aria-label="更多记录操作" aria-expanded={menuOpen} disabled={busy} title="更多"><MoreHorizontal size={17} /></button>
          {menuOpen && <div ref={menuRef} className={`record-popover ${menuAbove ? 'is-above' : ''}`} role="group" aria-label="记录操作" onBlur={event => { if (!actionRef.current?.contains(event.relatedTarget as Node)) setMenuOpen(false); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenuOpen(false); menuButtonRef.current?.focus(); } }}>
            <button type="button" onClick={() => menuAction(onPreview)}><Maximize2 size={14} />查看完整内容</button>
            {item.contentType !== ContentType.IMAGE && <button type="button" onClick={() => menuAction(onSnippet)}>{item.isSnippet ? <Pencil size={14} /> : <Bookmark size={14} />}{item.isSnippet ? '编辑片段' : '保存为片段'}</button>}
            <button type="button" onClick={() => menuAction(onStartEdit)}><Pencil size={14} />{item.note ? '编辑备注' : '添加备注'}</button>
            <div className="popover-divider" />
            {confirmDelete ? <><p className="popover-confirm">删除这个片段？</p><button type="button" className="danger-action" onClick={() => menuAction(() => void act(() => onDelete(item.id)))}><Trash2 size={14} />确认删除</button><button type="button" onClick={() => setConfirmDelete(false)}>取消</button></> : <button type="button" className="danger-action" onClick={() => item.isSnippet ? setConfirmDelete(true) : menuAction(() => void act(() => onDelete(item.id)))}><Trash2 size={14} />{item.isSnippet ? '删除片段' : '删除记录'}</button>}
          </div>}
        </div>
      </div>
      {item.note && !isEditingNote && <button type="button" className="clip-note has-note" onClick={onStartEdit}><Highlight text={item.note} search={search} /></button>}
      {isEditingNote && <div className="note-editor"><textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="添加备注，方便下次搜索…" aria-label="记录备注" rows={2} autoFocus maxLength={200} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancelEdit(); } }} /><div className="note-editor-footer"><span>{noteContent.length}/200</span><div><button type="button" className="icon-button" onClick={onCancelEdit} aria-label="取消编辑"><X size={16} /></button><button type="button" className="icon-button save-note" disabled={busy} onClick={() => void act(onSaveNote)} aria-label="保存备注"><Check size={16} /></button></div></div></div>}
    </div>
  );
});
