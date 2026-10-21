import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { MotionConfig } from 'motion/react';
import { TooltipProvider } from './components/ui/tooltip';
import '@fontsource-variable/geist';
import './index.css';

const root = document.getElementById('root')!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user" transition={{ duration: 0.14, ease: 'easeOut' }}>
      <TooltipProvider delayDuration={400}>
        <App />
      </TooltipProvider>
    </MotionConfig>
  </React.StrictMode>
);

// React 渲染完成后添加 class 隐藏 loading
root.classList.add('app-loaded');
