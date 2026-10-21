import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Tauri 配置
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    // 优化构建
    rollupOptions: {
      output: {
        // 手动分包，优化加载
        manualChunks: {
          tauri: ['@tauri-apps/api', '@tauri-apps/plugin-clipboard-manager'],
          ui: ['radix-ui'],
          motion: ['motion/react']
        }
      }
    }
  },
  // 优化依赖预加载
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', 'lucide-react']
  }
});
