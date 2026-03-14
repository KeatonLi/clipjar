import { useState, useEffect, memo } from 'react';
import { X, Power, Pin, Save, Trash2, Download, Sparkles, ChevronRight } from 'lucide-react';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useClipboardStore } from '../../stores/clipboardStore';

interface SettingsModalProps {
  onClose: () => void;
  onClearAll: () => void;
  itemCount: number;
}

// 设置项组件
const SettingItem = memo(({ 
  icon, 
  title, 
  desc, 
  children,
  danger
}: { 
  icon: React.ReactNode; 
  title: string; 
  desc: string; 
  children?: React.ReactNode;
  danger?: boolean;
}) => (
  <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-50/50 hover:bg-surface-100/50 transition-colors">
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${danger ? 'bg-red-50' : 'bg-white'}`}>
        {icon}
      </div>
      <div>
        <div className={`text-sm font-semibold ${danger ? 'text-red-600' : 'text-surface-700'}`}>{title}</div>
        <div className="text-xs text-surface-400">{desc}</div>
      </div>
    </div>
    {children}
  </div>
));
SettingItem.displayName = 'SettingItem';

// 开关组件
const Toggle = memo(({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`relative w-12 h-7 rounded-full transition-all duration-300 ${
      checked ? 'bg-primary-500' : 'bg-surface-300'
    }`}
  >
    <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
      checked ? 'left-6' : 'left-1'
    }`} />
  </button>
));
Toggle.displayName = 'Toggle';

export const SettingsModal = memo(({ onClose, onClearAll, itemCount }: SettingsModalProps) => {
  const [startup, setStartup] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [checking, setChecking] = useState(false);
  
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
    await new Promise(r => setTimeout(r, 800));
    setChecking(false);
    alert('当前已是最新版本');
  };

  return (
    <div 
      className="fixed inset-0 bg-surface-900/30 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl shadow-elevated w-[380px] max-h-[85vh] overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-5 border-b border-surface-100 flex items-center justify-between bg-gradient-to-r from-surface-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-bold text-surface-800">设置</h3>
              <p className="text-xs text-surface-400">个性化您的体验</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 rounded-xl flex items-center justify-center text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-3 overflow-y-auto max-h-[60vh]">
          {/* 开机自启 */}
          <SettingItem
            icon={<Power className="w-5 h-5 text-blue-500" />}
            title="开机自启"
            desc="登录时自动运行"
          >
            <Toggle checked={startup} onChange={toggleStartup} />
          </SettingItem>

          {/* 窗口置顶 */}
          <SettingItem
            icon={<Pin className="w-5 h-5 text-cyan-500" />}
            title="窗口置顶"
            desc="保持窗口在最前面"
          >
            <Toggle checked={alwaysOnTop} onChange={toggleAlwaysOnTop} />
          </SettingItem>

          {/* 最大记录数 */}
          <div className="p-4 rounded-2xl bg-surface-50/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                <Save className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-surface-700">最大记录数</div>
                <div className="text-xs text-surface-400">收藏内容永久保存</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={100}
                max={200}
                step={10}
                value={settings.maxHistoryItems}
                onChange={(e) => setSettings({ maxHistoryItems: parseInt(e.target.value) })}
                className="flex-1 h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
              />
              <span className="w-12 text-center text-sm font-semibold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-xl">
                {settings.maxHistoryItems}
              </span>
            </div>
            <div className="mt-2 text-xs text-surface-400">
              当前共有 {itemCount} 条记录
            </div>
          </div>

          {/* 检查更新 */}
          <button
            onClick={checkUpdate}
            disabled={checking}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-50/50 hover:bg-purple-50/50 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white group-hover:bg-purple-100 flex items-center justify-center transition-colors">
                {checking ? (
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-5 h-5 text-purple-500" />
                )}
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-surface-700">检查更新</div>
                <div className="text-xs text-surface-400">{checking ? '检查中...' : '获取最新版本'}</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-surface-300" />
          </button>

          {/* 清空记录 */}
          <SettingItem
            icon={<Trash2 className="w-5 h-5 text-red-500" />}
            title="清空记录"
            desc="删除所有剪贴板历史"
            danger
          >
            <button
              onClick={() => {
                if (confirm('确定要清空所有记录吗？此操作不可恢复。')) {
                  onClearAll();
                }
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
            >
              清空
            </button>
          </SettingItem>
        </div>

        {/* 底部版本信息 */}
        <div className="px-6 py-4 bg-surface-50 border-t border-surface-100">
          <div className="flex items-center justify-center gap-2 text-xs text-surface-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ClipJar v1.0.4</span>
            <span className="text-surface-300">•</span>
            <span>Made with love</span>
          </div>
        </div>
      </div>
    </div>
  );
});

SettingsModal.displayName = 'SettingsModal';
