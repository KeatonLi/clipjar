import { useState } from 'react';
import { X, Bookmark, Check } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { validateSnippetDraft } from '../../stores/clipboardModel';

interface SnippetEditorProps {
  title?: string;
  content?: string;
  editing?: boolean;
  onClose: () => void;
  onSave: (title: string, content: string) => Promise<void>;
}

export function SnippetEditor({ title = '', content = '', editing = false, onClose, onSave }: SnippetEditorProps) {
  const [name, setName] = useState(title);
  const [body, setBody] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ref = useDialogFocus(() => { if (!saving) onClose(); });

  const save = async () => {
    if (saving) return;
    try {
      const draft = validateSnippetDraft(name, body);
      setError('');
      setSaving(true);
      await onSave(draft.title, draft.content);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={() => { if (!saving) onClose(); }}>
      <div ref={ref} className="dialog-panel snippet-editor" role="dialog" aria-modal="true" aria-labelledby="snippet-heading" tabIndex={-1} onClick={e => e.stopPropagation()} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); } }}>
        <header className="dialog-header">
          <div className="dialog-heading"><Bookmark size={18} /><h2 id="snippet-heading">{editing ? '编辑片段' : '新建常用片段'}</h2></div>
          <button type="button" className="icon-button" aria-label="关闭片段编辑" onClick={onClose} disabled={saving}><X size={18} /></button>
        </header>
        <div className="dialog-body snippet-fields">
          <p className="dialog-description">把常用回复、地址或代码留下来，需要时一键复制。</p>
          <label className="field-label" htmlFor="snippet-name">片段名称<span>{name.length}/80</span></label>
          <input data-autofocus id="snippet-name" className="text-field" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="例如：邮件签名、常用命令" disabled={saving} autoComplete="off" />
          <label className="field-label" htmlFor="snippet-body">内容<span>{body.length.toLocaleString()}/10,000</span></label>
          <textarea id="snippet-body" className="text-field snippet-body" value={body} onChange={e => setBody(e.target.value)} maxLength={10000} placeholder="输入要反复使用的内容…" disabled={saving} spellCheck={false} />
          {error && <p className="inline-error" role="alert">{error}</p>}
        </div>
        <footer className="dialog-footer">
          <span className="subtle-hint">Ctrl / ⌘ + Enter 保存</span>
          <div className="dialog-buttons"><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>取消</button><button type="button" className="primary-button" onClick={() => void save()} disabled={saving}><Check size={14} />{saving ? '保存中…' : '保存片段'}</button></div>
        </footer>
      </div>
    </div>
  );
}
