import { IconButton } from '@/components/ui/icon-button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Settings,
  Power,
  Pin,
  Keyboard,
  Download,
  Trash2,
  RefreshCw,
  Check,
  HardDrive,
  Monitor
} from 'lucide-react';
import type { ShortcutMode, ShortcutStatus } from '../../hooks/useGlobalShortcut';
import { APP_CONFIG } from '../../utils/constants';
import { detectPlatform, shortcutPresets, withTimeout } from '../../utils/desktop';

const native = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__;
const readStartup = () => isEnabled();
const writeStartup = (value: boolean) => (value ? enable() : disable());
const readPinned = () => getCurrentWindow().isAlwaysOnTop();
const writePinned = (value: boolean) => getCurrentWindow().setAlwaysOnTop(value);

function useNativeToggle(
  readValue: () => Promise<boolean>,
  writeValue: (value: boolean) => Promise<void>
) {
  const generation = useRef(0);
  const [state, setState] = useState({ status: native ? 'loading' : 'unavailable', value: false });
  const load = useCallback(async () => {
    if (!native) return;
    const current = ++generation.current;
    setState((old) => ({ ...old, status: 'loading' }));
    try {
      const value = await withTimeout(readValue);
      if (current === generation.current) setState({ status: 'ready', value });
    } catch {
      if (current === generation.current) setState((old) => ({ ...old, status: 'error' }));
    }
  }, [readValue]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const toggle = async () => {
    if (state.status !== 'ready') return;
    const current = ++generation.current;
    const value = !state.value;
    setState((old) => ({ ...old, status: 'loading' }));
    try {
      await withTimeout(() => writeValue(value));
      if (current === generation.current) setState({ status: 'ready', value });
    } catch {
      if (current === generation.current) setState((old) => ({ ...old, status: 'error' }));
    }
  };
  return { ...state, load, toggle };
}

function NativeToggle({
  label,
  setting
}: {
  label: string;
  setting: ReturnType<typeof useNativeToggle>;
}) {
  if (setting.status === 'error')
    return (
      <Button
        variant="ghost"
        size="sm"
        className="retry-button"
        onClick={() => void setting.load()}
        aria-label={`重试${label}`}
      >
        <RefreshCw size={13} />
        重试
      </Button>
    );
  return (
    <Switch
      aria-label={label}
      aria-busy={setting.status === 'loading'}
      disabled={setting.status !== 'ready'}
      checked={setting.value}
      onCheckedChange={() => void setting.toggle()}
    />
  );
}

interface SettingsModalProps {
  onClose(): void;
  onClearAll(): void;
  onClearHistory(): void;
  storageBytes: number;
  migrationBackup: string | null;
  operationError: string;
  itemCount: number;
  shortcutMode: ShortcutMode;
  onShortcutChange(mode: ShortcutMode): void;
  shortcutStatus: ShortcutStatus;
  settings: { maxHistoryItems: number };
  setSettings(s: { maxHistoryItems: number }): void;
}

export function SettingsModal({
  onClose,
  onClearAll,
  onClearHistory,
  storageBytes,
  migrationBackup,
  operationError,
  itemCount,
  shortcutMode,
  onShortcutChange,
  shortcutStatus,
  settings,
  setSettings
}: SettingsModalProps) {
  const startup = useNativeToggle(readStartup, writeStartup);
  const pinned = useNativeToggle(readPinned, writePinned);
  const platform = detectPlatform(navigator.platform);
  const presets = shortcutPresets(platform);
  const [update, setUpdate] = useState({ state: 'idle', message: '', url: '' });
  const [confirmClear, setConfirmClear] = useState<'history' | 'all' | null>(null);
  const [historyDraft, setHistoryDraft] = useState(String(settings.maxHistoryItems));
  useEffect(() => {
    setHistoryDraft(String(settings.maxHistoryItems));
  }, [settings.maxHistoryItems]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  let storageSize = '暂不可用';
  try {
    storageSize = `${((native ? storageBytes : (localStorage.getItem('clipjar-storage')?.length ?? 0) * 2) / 1024).toFixed(0)} KB`;
  } catch {
    /* Storage may be unavailable in private mode. */
  }

  const checkUpdate = async () => {
    setUpdate({ state: 'loading', message: '正在检查新版本…', url: '' });
    try {
      const response = await fetch(
        'https://api.github.com/repos/KeatonLi/clipjar/releases/latest',
        { signal: AbortSignal.timeout(8000) }
      );
      if (!response.ok) throw new Error('Update unavailable');
      const data = await response.json();
      if (typeof data.tag_name !== 'string') throw new Error('Invalid release');
      const version = data.tag_name.replace(/^v/, '');
      const newer = version.localeCompare(APP_CONFIG.VERSION, undefined, { numeric: true }) > 0;
      if (mounted.current)
        setUpdate({
          state: 'ready',
          message: newer ? `发现新版本 v${version}` : '当前已是最新版本',
          url: newer ? `${APP_CONFIG.GITHUB_URL}/releases/latest` : ''
        });
    } catch {
      if (mounted.current)
        setUpdate({ state: 'error', message: '暂时无法检查更新，请稍后重试。', url: '' });
    }
  };
  const stateDescription = (status: string) =>
    status === 'loading'
      ? '正在读取或应用设置…'
      : status === 'error'
        ? '未能完成操作，请重试'
        : status === 'unavailable'
          ? '仅桌面端可用'
          : '';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !confirmClear) onClose();
      }}
    >
      <DialogContent
        className="settings-panel"
        showCloseButton={false}
        aria-describedby="settings-description"
      >
        <header className="modal-header">
          <div className="modal-heading">
            <span className="modal-icon">
              <Settings size={18} />
            </span>
            <div>
              <DialogTitle id="settings-title">偏好设置</DialogTitle>
              <DialogDescription id="settings-description">
                通用、快捷键与本地数据
              </DialogDescription>
            </div>
          </div>
          <IconButton
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            onClick={onClose}
            aria-label="关闭设置"
          >
            <X size={18} />
          </IconButton>
        </header>
        <div className="settings-content">
          <div className="storage-summary">
            <span className="storage-icon">
              <HardDrive size={20} />
            </span>
            <div>
              <strong>{itemCount} 条本地记录</strong>
              <p>已存内容 {storageSize}</p>
            </div>
            <span className="local-badge">本地保存</span>
          </div>
          {!native && (
            <p className="environment-notice">
              <Monitor size={15} />
              浏览器预览 · 系统功能请在桌面端使用
            </p>
          )}
          {operationError && (
            <p className="inline-error" role="alert">
              {operationError}
            </p>
          )}
          <section className="settings-section" aria-labelledby="general-settings">
            <h3 id="general-settings">常规</h3>
            <div className="setting-row">
              <span className="setting-icon">
                <Power size={17} />
              </span>
              <div className="setting-label">
                <strong>开机自启</strong>
                <p>{stateDescription(startup.status) || '登录后自动运行，随时待命'}</p>
              </div>
              <NativeToggle label="开机自启" setting={startup} />
            </div>
            <div className="setting-row">
              <span className="setting-icon">
                <Pin size={17} />
              </span>
              <div className="setting-label">
                <strong>窗口置顶</strong>
                <p>{stateDescription(pinned.status) || '让剪贴记录保持在其他窗口上方'}</p>
              </div>
              <NativeToggle label="窗口置顶" setting={pinned} />
            </div>
          </section>
          <section className="settings-section" aria-labelledby="shortcut-settings">
            <h3 id="shortcut-settings">
              唤起快捷键{' '}
              <span>
                {platform === 'mac' ? 'macOS' : platform === 'windows' ? 'Windows' : 'Linux'}
              </span>
            </h3>
            <RadioGroup
              className="shortcut-options"
              aria-labelledby="shortcut-settings"
              value={shortcutMode}
              onValueChange={(value) => onShortcutChange(value as ShortcutMode)}
            >
              {presets.map((preset, index) => (
                <label
                  key={preset.value}
                  className={`shortcut-option ${shortcutMode === preset.value ? 'is-active' : ''}`}
                >
                  <RadioGroupItem value={preset.value} aria-label={preset.label} />
                  <span className="shortcut-key">
                    <Keyboard size={15} />
                    {preset.label}
                  </span>
                  <span className="shortcut-recommendation">{index === 0 ? '推荐' : '备用'}</span>
                  {shortcutMode === preset.value && <Check size={15} />}
                </label>
              ))}
            </RadioGroup>
            {!presets.some((preset) => preset.value === shortcutMode) && (
              <p className="setting-warning">
                当前偏好为「{shortcutMode}」。建议选择上方组合键，单独修饰键可能不受系统支持。
              </p>
            )}
            <p
              role={shortcutStatus.state === 'error' ? 'alert' : 'status'}
              className={`setting-status ${shortcutStatus.state === 'error' ? 'is-error' : ''}`}
            >
              {shortcutStatus.message}
            </p>
          </section>
          <section className="settings-section" aria-labelledby="data-settings">
            <h3 id="data-settings">记录与存储</h3>
            <div className="setting-row">
              <div className="setting-label">
                <strong>普通历史上限</strong>
                <p>收藏不受数量和过期清理限制</p>
              </div>
              <label className="history-limit">
                <Input
                  type="number"
                  aria-label="最大记录数"
                  min={10}
                  max={500}
                  value={historyDraft}
                  onChange={(event) => setHistoryDraft(event.target.value)}
                  onBlur={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    const next = Number.isFinite(value)
                      ? Math.max(10, Math.min(500, value))
                      : settings.maxHistoryItems;
                    setHistoryDraft(String(next));
                    if (next !== settings.maxHistoryItems) setSettings({ maxHistoryItems: next });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <span>条</span>
              </label>
            </div>
            <p className="storage-hint">
              {native
                ? '记录与图片保存在应用数据目录，图片独立存储。'
                : '浏览器预览使用本地缓存；桌面版图片独立存储。'}
            </p>
            {migrationBackup && (
              <p className="storage-hint">
                升级前的记录已备份；仅“清空全部数据”会同时删除迁移备份。
              </p>
            )}
          </section>
          <section className="settings-section" aria-labelledby="about-settings">
            <h3 id="about-settings">关于</h3>
            <div className="setting-row">
              <div className="setting-label">
                <strong>
                  ClipJar <span className="version-tag">v{APP_CONFIG.VERSION}</span>
                </strong>
                <p>随手复制，随时找回</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="secondary-button"
                disabled={update.state === 'loading'}
                onClick={() => void checkUpdate()}
              >
                <Download size={14} />
                {update.state === 'loading' ? '检查中…' : '检查更新'}
              </Button>
            </div>
            {update.message && (
              <p
                role={update.state === 'error' ? 'alert' : 'status'}
                className={`setting-status ${update.state === 'error' ? 'is-error' : ''}`}
              >
                {update.message}
                {update.url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-button"
                    onClick={() => {
                      if (native)
                        void invoke('plugin:shell|open', { path: update.url }).catch(() =>
                          setUpdate((old) => ({
                            ...old,
                            state: 'error',
                            message: '无法打开下载页，请稍后重试。'
                          }))
                        );
                      else window.open(update.url, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    前往下载
                  </Button>
                )}
              </p>
            )}
          </section>
          <div className="danger-zone history-clear">
            <div>
              <strong>清空普通历史</strong>
              <p>收藏及其备注会保留</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="secondary-button"
              onClick={() => setConfirmClear('history')}
            >
              清空历史
            </Button>
          </div>
          <div className="danger-zone">
            <div>
              <strong>清空全部数据</strong>
              <p>包含收藏与迁移备份，无法撤销</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="danger-button"
              onClick={() => setConfirmClear('all')}
            >
              <Trash2 size={14} />
              全部清空
            </Button>
          </div>
        </div>
        <footer className="settings-footer">
          偏好自动保存 <span>v{APP_CONFIG.VERSION}</span>
        </footer>
      </DialogContent>
      <AlertDialog
        open={confirmClear !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmClear(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmClear === 'all' ? '清空全部数据？' : '清空普通历史？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmClear === 'all'
                ? '所有记录、收藏、备注和迁移备份都将删除，无法撤销。'
                : '普通历史将被删除，收藏及其备注会保留。此操作无法撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmClear === 'all') onClearAll();
                else onClearHistory();
                setConfirmClear(null);
              }}
            >
              {confirmClear === 'all' ? '确认删除全部' : '确认清空历史'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
