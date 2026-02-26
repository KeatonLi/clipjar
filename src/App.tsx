import { useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ClipboardList } from './components/ClipboardList';
import { useClipboardStore } from './stores/clipboardStore';
import { useClipboard } from './hooks/useClipboard';
import { useGlobalShortcut } from './hooks/useGlobalShortcut';
import type { ClipboardItem } from './types';
import { ContentType } from './types';

function App() {
  const { initClipboard } = useClipboard();
  useGlobalShortcut(); // 初始化全局快捷键
  const setItems = useClipboardStore(state => state.setItems);

  useEffect(() => {
    // 初始化剪贴板监听
    const cleanup = initClipboard();

    // 加载初始数据（模拟）
    const mockData: ClipboardItem[] = [
      {
        id: 1,
        content: 'https://github.com/tauri-apps/tauri',
        contentType: ContentType.LINK,
        sourceApp: 'Chrome',
        createdAt: Date.now() - 1000 * 60 * 5,
        updatedAt: Date.now() - 1000 * 60 * 5,
        isFavorite: false,
        useCount: 0,
        tags: ['开发', '工具'],
      },
      {
        id: 2,
        content: 'npm create tauri-app@latest',
        contentType: ContentType.CODE,
        sourceApp: 'Terminal',
        createdAt: Date.now() - 1000 * 60 * 30,
        updatedAt: Date.now() - 1000 * 60 * 30,
        isFavorite: true,
        useCount: 3,
        tags: ['命令', 'Tauri'],
      },
      {
        id: 3,
        content: '项目设计文档需要包含：技术方案、功能设计、数据结构设计、界面设计等几个核心部分。',
        contentType: ContentType.TEXT,
        sourceApp: 'VS Code',
        createdAt: Date.now() - 1000 * 60 * 60 * 2,
        updatedAt: Date.now() - 1000 * 60 * 60 * 2,
        isFavorite: false,
        useCount: 1,
        tags: ['工作'],
      },
    ];
    setItems(mockData);

    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-neutral-50/50">
      {/* 顶部搜索栏 */}
      <Header />

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 剪贴板列表 */}
        <main className="flex-1 overflow-hidden">
          <ClipboardList />
        </main>
      </div>
    </div>
  );
}

export default App;
