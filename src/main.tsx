import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 移除预定义的 loading div，让 React 接管
const root = document.getElementById('root')!

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// 清理 loading 样式（React 渲染完成后自动移除）
const cleanup = () => {
  // 移除 loading 相关的内联样式
  const styles = document.querySelectorAll('style')
  styles.forEach(style => {
    if (style.textContent?.includes('app-loading')) {
      style.remove()
    }
  })
  // 移除 loading div 的内容
  root.classList.add('app-loaded')
}

// 在 React 渲染完成后清理
const observer = new MutationObserver(() => {
  if (root.children.length > 0) {
    cleanup()
    observer.disconnect()
  }
})
observer.observe(root, { childList: true })

// 超时保护：3秒后强制清理
setTimeout(() => {
  cleanup()
  observer.disconnect()
}, 3000)
