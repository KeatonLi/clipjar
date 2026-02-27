import { X, RotateCcw, Info, Rocket, Trash2 } from 'lucide-react';
import { useClipboardStore } from '../../stores/clipboardStore';

export function Settings() {
  const { settings, setSettings, showSettings, setShowSettings } = useClipboardStore();

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h2 className="text-lg font-semibold text-neutral-800">设置</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-800">通用</h3>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Rocket className="w-4 h-4 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-neutral-700">开机自启</p>
                  <p className="text-xs text-neutral-400">系统启动时自动运行</p>
                </div>
              </div>
              <button
                onClick={() => setSettings({ startAtLogin: !settings.startAtLogin })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.startAtLogin ? 'bg-primary-500' : 'bg-neutral-200'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    settings.startAtLogin ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Info className="w-4 h-4 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-neutral-700">显示预览</p>
                  <p className="text-xs text-neutral-400">在列表中显示内容预览</p>
                </div>
              </div>
              <button
                onClick={() => setSettings({ showPreview: !settings.showPreview })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.showPreview ? 'bg-primary-500' : 'bg-neutral-200'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    settings.showPreview ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-800">历史记录</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-700">最大记录数</p>
                <p className="text-xs text-neutral-400">超过后自动删除旧记录</p>
              </div>
              <select
                value={settings.maxHistoryItems}
                onChange={(e) => setSettings({ maxHistoryItems: Number(e.target.value) })}
                className="input w-24 text-center"
              >
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-700">自动清理</p>
                <p className="text-xs text-neutral-400">自动删除旧记录</p>
              </div>
              <button
                onClick={() => setSettings({ autoCleanup: !settings.autoCleanup })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.autoCleanup ? 'bg-primary-500' : 'bg-neutral-200'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    settings.autoCleanup ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {settings.autoCleanup && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-700">保留天数</p>
                  <p className="text-xs text-neutral-400">超过天数自动清理</p>
                </div>
                <select
                  value={settings.cleanupDays}
                  onChange={(e) => setSettings({ cleanupDays: Number(e.target.value) })}
                  className="input w-24 text-center"
                >
                  <option value={7}>7 天</option>
                  <option value={14}>14 天</option>
                  <option value={30}>30 天</option>
                  <option value={90}>90 天</option>
                </select>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-800">快捷键</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-700">全局快捷键</p>
                <p className="text-xs text-neutral-400">唤起应用窗口</p>
              </div>
              <div className="px-3 py-2 bg-neutral-100 rounded-lg text-sm font-mono text-neutral-600">
                {settings.globalShortcut.replace('CommandOrControl', 'Ctrl')}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100 space-y-3">
            <button
              onClick={() => {
                if (confirm('确定要清空所有剪贴板记录吗？')) {
                  useClipboardStore.getState().setItems([]);
                }
              }}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              清空所有记录
            </button>
            
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              重置所有设置
            </button>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-primary-50 to-primary-100/50 rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-glow shrink-0">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-neutral-800">ClipJar</p>
              <p className="text-xs text-neutral-500 mt-1">版本 1.0.0 · 跨平台剪贴板管理器</p>
              <p className="text-xs text-neutral-400 mt-1">自动保存剪贴板历史，复制粘贴更高效</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
