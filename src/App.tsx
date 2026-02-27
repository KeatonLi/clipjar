import { useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ClipboardList } from './components/ClipboardList';
import { Settings } from './components/Settings';
import { useClipboardStore } from './stores/clipboardStore';
import { useClipboard } from './hooks/useClipboard';
import { useGlobalShortcut } from './hooks/useGlobalShortcut';

function App() {
  const { initClipboard } = useClipboard();
  useGlobalShortcut();
  const setItems = useClipboardStore(state => state.setItems);

  useEffect(() => {
    const cleanup = initClipboard();
    setItems([]);
    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-neutral-50/50">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ClipboardList />
        </main>
      </div>
      <Settings />
    </div>
  );
}

export default App;
