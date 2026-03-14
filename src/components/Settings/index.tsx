import { useState, useEffect, memo } from 'react';
import { X, Power, Bell, Pin, Keyboard, Save, Trash, Download } from 'lucide-react';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useClipboardStore } from '../../stores/clipboardStore';

interface SettingsModalProps {
  onClose: () => void;
  onClearAll: () => void;
  itemCount: number;
}

// 使用 memo 避免父组件重渲染时刷新
export const SettingsModal = memo(({ onClose, onClearAll, itemCount }: SettingsModalProps) => {
  const [startup, setStartup] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ hasUpdate: boolean; version?: string } | null>(null);
  
  const { settings, setSettings } = useClipboardStore();

  useEffect(() => {
    const init = async () => {
      try {
        setStartup(await isEnabled());
        setAlwaysOnTop(await getCurrentWindow().isAlwaysOnTop());
      } catch (err) {
        console.error('初始化设置失败:', err);
      }
    };
    init();
  }, []);

  const toggleStartup = async () => {
    try {
      if (startup) await disable();
      else await enable();
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

  const checkUpdate = async () => {
    setChecking(true);
    try {
      // 简化更新检查
      await new Promise(r => setTimeout(r, 1000));
      setUpdateInfo({ hasUpdate: false });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-80 max-h-[75vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">设置</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-3 space-y-1 overflow-y-auto max-h-[60vh]">
          {/* 开机自启 */}
          <ToggleItem 
            icon={<Power className="w-4 h-4 text-blue-600" />} 
            title="开机自启" 
            desc="登录时自动运行" 
            checked={startup} 
            onChange={toggleStartup} 
          />

          {/* 窗口置顶 */}
          <ToggleItem 
            icon={<Pin className="w-4 h-4 text-cyan-600" />} 
            title="窗口置顶" 
            desc="保持窗口在最前面" 
            checked={alwaysOnTop} 
            onChange={toggleAlwaysOnTop} 
          />

          {/* 最大记录数 */}
          <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <Save className="w-4 h-4 text-green-600" />
              <div>
                <div className="text-sm font-medium text-slate-700">最大记录数</div>
                <div className="text-xs text-slate-400">收藏永久保存</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={10}
                max={200}
                value={settings.maxHistoryItems}
                onChange={(e) => setSettings({ maxHistoryItems: parseInt(e.target.value) || 50 })}
                className="w-24 px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-center"
              />
              <span className="text-xs text-slate-400">条（非收藏）</span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              当前: {itemCount} 条记录
            </div>
          </div>

          {/* 检查更新 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-purple-50/60 transition-all"
            onClick={checkUpdate}
            disabled={checking}
          >
            <div className="flex items-center gap-3">
              {checking ? (
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-purple-600" />
              )}
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">检查更新</div>
                <div className="text-xs text-slate-400">{checking ? '检查中...' : '获取最新版本'}</div>
              </div>
            </div>
            <span className="text-xs text-slate-400">v1.0.3</span>
          </button>

          {/* 清空记录 */}
          <button
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-red-50/60 transition-all"
            onClick={() => {
              if (confirm('确定要清空所有记录吗？')) {
                onClearAll();
              }
            }}
          >
            <div className="flex items-center gap-3">
              <Trash className="w-4 h-4 text-red-600" />
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">清空记录</div>
                <div className="text-xs text-slate-400">删除所有剪贴板历史</div>
              </div>
            </div>
          </button>

          {/* 版本 */}
          <div className="text-center py-3 text-xs text-slate-400">
            ClipJar v1.0.3
          </div>
        </div>
      </div>
    </div>
  );
});

SettingsModal.displayName = 'SettingsModal';

// 开关项组件
interface ToggleItemProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}

const ToggleItem = memo(({ icon, title, desc, checked, onChange }: ToggleItemProps) => (
  <button
    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50/80 transition-all"
    onClick={onChange}
  >
    <div className="flex items-center gap-3">
      <div className="p-2 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl">
        {icon}
      </div>
      <div className="text-left">
        <div className="text-sm font-medium text-slate-700">{title}</div>
        <div className="text-xs text-slate-400">{desc}</div>
      </div>
    </div>
    <div className={`w-11 h-6 rounded-full transition-all ${checked ? 'bg-primary-500' : 'bg-slate-200'}`}>
      <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-all mt-0.5 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </div>
  </button>
));
ToggleItem.displayName = 'ToggleItem';
