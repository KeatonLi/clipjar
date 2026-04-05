import { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';
import {
  X, Settings, Power, Pin, Keyboard, Save, Download, Trash,
  AlertTriangle, HardDrive, RefreshCw
} from 'lucide-react';
import type { ShortcutMode } from '../../hooks/useGlobalShortcut';
import { STORAGE_KEYS } from '../../utils/constants';

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
}

function Toggle({ enabled, onToggle }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-11 h-6 rounded-full transition-all duration-200 relative ${
        enabled ? 'bg-sky-500' : 'bg-neutral-300'
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
      const currentVersion = '1.0.6';

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
      className="fixed inset-0 bg-neutral-900/30 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-80 max-h-[85vh] overflow-hidden animate-slide-up border border-neutral-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-100 rounded-xl">
              <Settings className="w-4 h-4 text-sky-600" />
            </div>
            <h3 className="font-display font-bold text-base text-neutral-800">设置</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {/* Memory stats */}
          <div className="p-4 rounded-xl bg-sky-50 border border-sky-100 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white rounded-xl shadow-sm">
                <HardDrive className="w-5 h-5 text-sky-500" />
              </div>
              <div>
                <div className="text-xs text-sky-600 mb-0.5">存储统计</div>
                <div className="text-sm font-semibold text-neutral-700">
                  {memoryInfo ? (
                    <span>前端 {itemCount} 条 · 后端 {memoryInfo.itemCount} 条</span>
                  ) : (
                    <span className="text-neutral-400">加载中...</span>
                  )}
                </div>
                {memoryInfo && (
                  <div className="text-xs text-neutral-400 mt-0.5">
                    内存占用 ~{memoryInfo.memoryMB.toFixed(1)} MB
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <SettingRow
              icon={<Power className="w-4 h-4" />}
              iconBg="bg-blue-50"
              iconColor="text-blue-500"
              title="开机自启"
              description="登录时自动运行"
            >
              <Toggle enabled={startup} onToggle={toggleStartup} />
            </SettingRow>

            <div className="h-px bg-neutral-100 my-2" />

            <SettingRow
              icon={<Pin className="w-4 h-4" />}
              iconBg="bg-cyan-50"
              iconColor="text-cyan-500"
              title="窗口置顶"
              description="保持在最前面"
            >
              <Toggle enabled={alwaysOnTop} onToggle={toggleAlwaysOnTop} />
            </SettingRow>

            <div className="h-px bg-neutral-100 my-2" />

            <div className="py-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-violet-50 rounded-xl">
                  <Keyboard className="w-4 h-4 text-violet-500" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-neutral-700">唤起快捷键</div>
                  <div className="text-xs text-neutral-400">按下快捷键组合</div>
                </div>
              </div>
              <input
                type="text"
                readOnly
                value={shortcutMode}
                onKeyDown={(e) => {
                  e.preventDefault();
                  const keys: string[] = [];
                  if (e.ctrlKey) keys.push('Ctrl');
                  if (e.altKey) keys.push('Alt');
                  if (e.shiftKey) keys.push('Shift');
                  if (e.metaKey) keys.push('Cmd');

                  if (e.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
                    keys.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
                  }

                  if (keys.length >= 2) {
                    const newShortcut = keys.join('+');
                    onShortcutChange(newShortcut);
                    localStorage.setItem(STORAGE_KEYS.SHORTCUT_MODE, newShortcut);
                  }
                }}
                className="w-full px-3 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-violet-400 text-center font-semibold text-neutral-700 transition-colors cursor-pointer hover:bg-neutral-100"
              />
            </div>

            <div className="h-px bg-neutral-100 my-2" />

            <div className="py-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-emerald-50 rounded-xl">
                  <Save className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-neutral-700">最大记录数</div>
                  <div className="text-xs text-neutral-400">非收藏记录上限</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={settings.maxHistoryItems}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 100;
                    setSettings({ maxHistoryItems: Math.min(500, Math.max(10, value)) });
                  }}
                  className="w-24 px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-400 text-center font-semibold text-neutral-700 transition-colors"
                />
                <span className="text-sm text-neutral-500">条</span>
              </div>
            </div>

            <div className="h-px bg-neutral-100 my-2" />

            <button
              className="w-full flex items-center justify-between py-3 rounded-xl hover:bg-purple-50/50 transition-colors"
              onClick={checkUpdate}
              disabled={checking}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-xl">
                  {checking ? (
                    <RefreshCw className="w-4 h-4 text-purple-500 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 text-purple-500" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-neutral-700">检查更新</div>
                  <div className="text-xs text-neutral-400">{checking ? '检查中...' : '获取最新版本'}</div>
                </div>
              </div>
              <span className="text-sm font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-lg">v1.0.6</span>
            </button>

            <div className="h-px bg-neutral-100 my-2" />

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
                  <div className={`text-sm font-semibold ${showConfirmClear ? 'text-red-600' : 'text-neutral-700'}`}>
                    {showConfirmClear ? '确认清空？' : '清空记录'}
                  </div>
                  <div className="text-xs text-neutral-400">
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
        <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-100 text-center">
          <span className="text-xs text-neutral-400">ClipJar v1.0.6</span>
        </div>
      </div>
    </div>
  );
}
