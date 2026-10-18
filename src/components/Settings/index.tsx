import { useState, useEffect } from 'react';
import { X, Power, Pin, Keyboard, Pause, Play, Trash2, HardDrive, ExternalLink } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';
import { useClipboardStore } from '../../stores/clipboardStore';
import { isNativeClipboard } from '../../lib/clipboardClient';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { APP_CONFIG, SHORTCUT_PRESETS } from '../../utils/constants';

function Toggle({ enabled, label, disabled, onToggle }: { enabled: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return <button type="button" className={`setting-toggle ${enabled ? 'enabled' : ''}`} role="switch" aria-checked={enabled} aria-label={label} disabled={disabled} onClick={onToggle}><span /></button>;
}
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function SettingsModal({ onClose, shortcutError = '', onShortcutChange }: { onClose: () => void; shortcutError?: string; onShortcutChange: (mode: string) => Promise<void> }) {
  const { settings, stats, items, initialized, setSettings, clearAll, pauseCapture } = useClipboardStore();
  const [startup, setStartup] = useState(settings.startAtLogin);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [limit, setLimit] = useState(String(settings.maxHistoryItems));
  const [confirmClear, setConfirmClear] = useState(false);
  const ref = useDialogFocus(onClose);
  const native = isNativeClipboard();
  const ordinaryCount = stats?.ordinaryCount ?? items.filter(item => !item.isFavorite && !item.isSnippet).length;
  useEffect(() => { setLimit(String(settings.maxHistoryItems)); }, [settings.maxHistoryItems]);
  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    Promise.all([isEnabled(), getCurrentWindow().isAlwaysOnTop()]).then(([enabled, onTop]) => {
      if (!cancelled) { setStartup(enabled); setAlwaysOnTop(onTop); }
    }).catch(error => { if (!cancelled) setLocalError(`无法读取窗口设置：${String(error)}`); });
    return () => { cancelled = true; };
  }, [native]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setLocalError('');
    try { await action(); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };
  const saveLimit = async () => {
    const value = Number(limit);
    if (!Number.isInteger(value) || value < 10 || value > 500) throw new Error('请输入 10 到 500 之间的整数。');
    await setSettings({ maxHistoryItems: value });
  };
  const currentPresetExists = SHORTCUT_PRESETS.some(preset => preset.value === settings.globalShortcut);
  const storagePercent = stats ? Math.min(100, stats.totalBytes / stats.budgetBytes * 100) : 0;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div ref={ref} className="dialog-panel settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-heading" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <header className="dialog-header"><h2 id="settings-heading">设置</h2><button type="button" className="icon-button" aria-label="关闭设置" onClick={onClose}><X size={18} /></button></header>
        <div className="dialog-body settings-content">
          {localError && <p className="inline-error" role="alert">{localError}</p>}
          {shortcutError && shortcutError !== localError && <p className="inline-error" role="alert">{shortcutError}</p>}
          <section className="storage-summary" aria-label="本地存储占用">
            <div className="storage-heading"><span><HardDrive size={15} />本地存储</span><strong>{stats ? megabytes(stats.totalBytes) : '读取中…'}</strong></div>
            <progress value={storagePercent} max={100} aria-label="存储容量使用比例" />
            <p>{stats ? `${stats.itemCount} 条内容 · 容量上限 ${megabytes(stats.budgetBytes)}` : '正在读取存储统计'}</p>
          </section>
          <section className="settings-section">
            <h3>记录与保留</h3>
            {native && <div className="setting-block"><div className="setting-title"><Pause size={16} /><span>{stats?.isPaused ? '后台记录已暂停' : '后台记录'}</span></div><p>{stats?.isPaused && stats.pausedUntil ? `将在 ${new Date(stats.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 恢复` : '暂停期间的剪贴内容不会保存'}</p><div className="setting-button-row">{stats?.isPaused ? <button type="button" className="secondary-button" disabled={busy || !initialized} onClick={() => void run(() => pauseCapture(0))}><Play size={13} />恢复记录</button> : <><button type="button" className="secondary-button" disabled={busy || !initialized} onClick={() => void run(() => pauseCapture(15))}>暂停 15 分钟</button><button type="button" className="secondary-button" disabled={busy || !initialized} onClick={() => void run(() => pauseCapture(60))}>暂停 1 小时</button></>}</div></div>}
            <div className="setting-block"><label htmlFor="history-limit" className="setting-title">普通历史上限</label><p>保留最近 10–500 条，收藏和片段单独保留</p><div className="setting-button-row"><input id="history-limit" type="number" min={10} max={500} className="text-field count-field" value={limit} onChange={e => setLimit(e.target.value)} disabled={busy || !initialized} /><span className="subtle-hint">条</span><button type="button" className="secondary-button" disabled={busy || !initialized || limit === String(settings.maxHistoryItems)} onClick={() => void run(saveLimit)}>应用</button></div></div>
            <div className="setting-row"><div><span className="setting-title">自动清理旧历史</span><p>收藏和片段不会自动删除</p></div><Toggle label="自动清理旧历史" enabled={settings.autoCleanup} disabled={busy || !initialized} onToggle={() => void run(() => setSettings({ autoCleanup: !settings.autoCleanup }))} /></div>
            {settings.autoCleanup && <div className="setting-row setting-days"><label htmlFor="cleanup-days">保留时间</label><select id="cleanup-days" className="select-field" value={settings.cleanupDays} disabled={busy || !initialized} onChange={e => void run(() => setSettings({ cleanupDays: Number(e.target.value) }))}>{![7, 30, 90, 365].includes(settings.cleanupDays) && <option value={settings.cleanupDays}>{settings.cleanupDays} 天</option>}<option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option><option value={365}>1 年</option></select></div>}
          </section>
          <section className="settings-section"><h3>快捷键与窗口</h3>
            <div className="setting-block"><label htmlFor="global-shortcut" className="setting-title"><Keyboard size={16} />唤起快捷键</label><select id="global-shortcut" className="select-field shortcut-select" value={settings.globalShortcut} disabled={busy || !initialized} onChange={e => { const mode = e.target.value; void run(() => onShortcutChange(mode)); }}>{!currentPresetExists && <option value={settings.globalShortcut}>{settings.globalShortcut}（当前设置）</option>}{SHORTCUT_PRESETS.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select><p>窗口隐藏时也能快速打开</p></div>
            {native ? <><div className="setting-row"><div><span className="setting-title"><Power size={16} />开机自启</span><p>登录电脑时自动运行</p></div><Toggle label="开机自启" enabled={startup} disabled={busy || !initialized} onToggle={() => void run(async () => { if (startup) await disable(); else await enable(); setStartup(!startup); await setSettings({ startAtLogin: !startup }); })} /></div><div className="setting-row"><div><span className="setting-title"><Pin size={16} />窗口置顶</span><p>查找内容时保持在最前面</p></div><Toggle label="窗口置顶" enabled={alwaysOnTop} disabled={busy} onToggle={() => void run(async () => { await getCurrentWindow().setAlwaysOnTop(!alwaysOnTop); setAlwaysOnTop(!alwaysOnTop); })} /></div></> : <p className="subtle-hint">后台记录、全局快捷键和窗口设置在桌面应用中生效。</p>}
          </section>
          <section className="settings-section cleanup-section"><h3>整理空间</h3><p>清空普通历史，保留收藏和常用片段。</p>{confirmClear ? <div className="clear-confirm"><p>清空 {ordinaryCount} 条普通记录？</p><div className="setting-button-row"><button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmClear(false)}>取消</button><button type="button" className="danger-button" disabled={busy} onClick={() => void run(async () => { await clearAll(); setConfirmClear(false); })}>确认清空</button></div></div> : <button type="button" className="danger-button" disabled={busy || !initialized || ordinaryCount === 0} onClick={() => setConfirmClear(true)}><Trash2 size={14} />清空普通历史</button>}</section>
        </div>
        <footer className="dialog-footer settings-footer"><span>ClipJar v{APP_CONFIG.VERSION}</span><button type="button" className="text-link" onClick={() => void run(async () => { if (native) await invoke('plugin:shell|open', { path: 'https://github.com/KeatonLi/clipjar/releases', with: null }); else window.open('https://github.com/KeatonLi/clipjar/releases', '_blank', 'noopener,noreferrer'); })}>查看更新<ExternalLink size={12} /></button></footer>
      </div>
    </div>
  );
}
