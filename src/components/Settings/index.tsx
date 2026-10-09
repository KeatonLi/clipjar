import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';
import {
  X, Settings, Power, Pin, Keyboard, Save, Download, Trash,
  AlertTriangle, HardDrive, RefreshCw
} from 'lucide-react';
import type { ShortcutMode } from '../../hooks/useGlobalShortcut';
import { STORAGE_KEYS, APP_CONFIG, SHORTCUT_PRESETS } from '../../utils/constants';

interface SettingsModalProps {
  onClose: () => void;
  onClearAll: () => void;
  itemCount: number;
  shortcutMode: ShortcutMode;
  onShortcutChange: (mode: ShortcutMode) => void;
  settings: { maxHistoryItems: number };
  setSettings: (s: { maxHistoryItems: number }) => void;
}

interface SettingRowProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ icon, iconBg, iconColor, title, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div>
          <div className="text-sm font-semibold text-neutral-700">{title}</div>
          <div className="text-xs text-neutral-400 mt-0.5">{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
  label: string;
}

function Toggle({ enabled, onToggle, label }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      className={`w-11 h-6 rounded-full transition-all duration-200 relative ${
        enabled ? 'bg-[#5377a7]' : 'bg-slate-300'
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${
          enabled ? 'left-5' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export function SettingsModal ({
  onClose,
  onClearAll,
  itemCount,
  shortcutMode,
  onShortcutChange,
  settings,
  setSettings
}: SettingsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === dialogRef.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const [startup, setStartup] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [checking, setChecking] = useState(false);
  const [memoryInfo, setMemoryInfo] = useState<{ itemCount: number; memoryMB: number } | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  useEffect(() => {
    const initSettings = async () => {
      try {
        const autoStartEnabled = await isEnabled();
        setStartup(autoStartEnabled);

        const window = getCurrentWindow();
        const isOnTop = await window.isAlwaysOnTop();
        setAlwaysOnTop(isOnTop);

        const stats = await invoke<{ itemCount: number; memoryMB: number }>('get_memory_stats');
        setMemoryInfo(stats);
      } catch (err) {
        console.error('初始化设置失败:', err);
      }
    };
    initSettings();
  }, []);

  const toggleStartup = async () => {
    try {
      if (startup) {
        await disable();
      } else {
        await enable();
      }
      setStartup(!startup);
    } catch (err) {
      console.error('切换自启失败:', err);
    }
  };

  const toggleAlwaysOnTop = async () => {
    try {
      const window = getCurrentWindow();
      await window.setAlwaysOnTop(!alwaysOnTop);
      setAlwaysOnTop(!alwaysOnTop);
    } catch (err) {
      console.error('切换置顶失败:', err);
    }
  };

  const checkUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('https://api.github.com/repos/KeatonLi/clipjar/releases/latest');
      const data = await res.json();
      const latestVersion = data.tag_name?.replace('v', '') || '0.0.0';
      const currentVersion = APP_CONFIG.VERSION;

      const hasUpdate = latestVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0;

      if (hasUpdate) {
        if (confirm(`发现新版本 v${latestVersion}\n\n是否前往下载页面？`)) {
          window.open('https://github.com/KeatonLi/clipjar/releases', '_blank');
        }
      } else {
        alert(`当前已是最新版本 v${currentVersion}`);
      }
    } catch {
      alert('检查更新失败，请稍后重试');
    } finally {
      setChecking(false);
    }
  }, []);

  const handleClearConfirm = () => {
    if (showConfirmClear) {
      onClearAll();
      setShowConfirmClear(false);
    } else {
      setShowConfirmClear(true);
      setTimeout(() => setShowConfirmClear(false), 3000);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/20 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="settings-panel bg-white rounded-xl shadow-xl overflow-hidden border border-neutral-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Settings className="w-4 h-4 text-[#5377a7]" />
            </div>
            <h3 id="settings-title" className="font-semibold text-base text-slate-800">设置</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭设置"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="settings-content px-5 py-3">
          {/* Memory stats */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white rounded-xl shadow-sm">
                <HardDrive className="w-5 h-5 text-[#5377a7]" />
              </div>
              <div>
                <div className="text-xs text-[#5377a7] mb-0.5">存储统计</div>
                <div className="text-sm font-semibold text-neutral-700">
                  {memoryInfo ? (
                    <span>{itemCount} 条剪贴记录</span>
                  ) : (
                    <span className="text-neutral-400">加载中...</span>
                  )}
                </div>
                {memoryInfo && (
                  <div className="text-xs text-neutral-400 mt-0.5">
                    内存占用约 {memoryInfo.memoryMB.toFixed(1)} MB
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <SettingRow
              icon={<Power className="w-4 h-4" />}
              iconBg="bg-slate-50"
              iconColor="text-[#5377a7]"
              title="开机自启"
              description="登录时自动运行"
            >
              <Toggle label="开机自启" enabled={startup} onToggle={toggleStartup} />
            </SettingRow>

            <div className="h-px bg-neutral-100 my-2" />

            <SettingRow
              icon={<Pin className="w-4 h-4" />}
              iconBg="bg-slate-100"
              iconColor="text-slate-500"
              title="窗口置顶"
              description="保持在最前面"
            >
              <Toggle label="窗口置顶" enabled={alwaysOnTop} onToggle={toggleAlwaysOnTop} />
            </SettingRow>

            <div className="h-px bg-slate-100 my-2" />

            <div className="py-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-slate-50 rounded-xl">
                  <Keyboard className="w-4 h-4 text-[#5377a7]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-neutral-700">唤起快捷键</div>
                  <div className="text-xs text-neutral-400">双击快捷键唤起窗口</div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {SHORTCUT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    aria-pressed={shortcutMode === preset.value}
                    onClick={() => {
                      onShortcutChange(preset.value);
                      localStorage.setItem(STORAGE_KEYS.SHORTCUT_MODE, preset.value);
                    }}
                    className={`w-full px-3 py-2.5 text-sm rounded-xl border transition-all text-left flex items-center justify-between ${
                      shortcutMode === preset.value
                        ? 'bg-[#edf3fa] border-[#9bb0cc] text-[#395d8a]'
                        : 'bg-slate-50/50 border-slate-200/50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{preset.label}</div>
                      <div className="text-xs text-slate-400">{preset.description}</div>
                    </div>
                    {shortcutMode === preset.value && (
                      <div className="w-2.5 h-2.5 bg-[#5377a7] rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-slate-100 my-2" />

            <div className="py-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-slate-50 rounded-xl">
                  <Save className="w-4 h-4 text-[#5377a7]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700">最大记录数</div>
                  <div className="text-xs text-slate-400">非收藏记录上限</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  aria-label="最大记录数"
                  min="10"
                  max="500"
                  value={settings.maxHistoryItems}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 100;
                    setSettings({ maxHistoryItems: Math.min(500, Math.max(10, value)) });
                  }}
                  className="w-24 px-3 py-2 text-sm bg-slate-50/50 border border-slate-200/50 rounded-xl focus:outline-none focus:border-blue-400 text-center font-semibold text-slate-700 transition-colors"
                />
                <span className="text-sm text-slate-500">条</span>
              </div>
            </div>

            <div className="h-px bg-slate-100 my-2" />

            <button
              className="w-full flex items-center justify-between py-3 rounded-xl hover:bg-slate-50/50 transition-colors"
              onClick={checkUpdate}
              disabled={checking}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-xl">
                  {checking ? (
                    <RefreshCw className="w-4 h-4 text-[#5377a7] animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 text-[#5377a7]" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700">检查更新</div>
                  <div className="text-xs text-slate-400">{checking ? '检查中...' : '获取最新版本'}</div>
                </div>
              </div>
              <span className="text-sm font-semibold text-[#5377a7] bg-slate-50 px-3 py-1 rounded-lg">v{APP_CONFIG.VERSION}</span>
            </button>

            <div className="h-px bg-slate-100 my-2" />

            <button
              className={`w-full flex items-center justify-between py-3 rounded-xl transition-colors ${
                showConfirmClear ? 'bg-red-50' : 'hover:bg-red-50/50'
              }`}
              onClick={handleClearConfirm}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${showConfirmClear ? 'bg-red-100' : 'bg-red-50'}`}>
                  {showConfirmClear ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Trash className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${showConfirmClear ? 'text-red-600' : 'text-slate-700'}`}>
                    {showConfirmClear ? '确认清空？' : '清空记录'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {showConfirmClear ? '再次点击确认删除' : '删除所有历史'}
                  </div>
                </div>
              </div>
              {showConfirmClear && (
                <span className="text-sm font-semibold text-red-500">确认</span>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-neutral-100 text-center shrink-0">
          <span className="text-xs text-slate-500">ClipJar v{APP_CONFIG.VERSION}</span>
        </div>
      </div>
    </div>
  );
}
