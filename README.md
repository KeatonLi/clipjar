# ClipJar - 跨平台剪贴板管理器

一款基于 Tauri + React 开发的轻量级剪贴板管理工具，支持 macOS 和 Windows 系统。自动保存剪贴板历史，让复制粘贴更高效。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri)
![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react)

## 界面预览

![主界面](screenshots/main.png)
*主界面 - 剪贴板历史列表*

![设置面板](screenshots/settings.png)
*设置面板 - 快捷键、最大记录数等配置*

## 功能特性

- 📋 **自动监听** - 后台实时监听剪贴板变化，自动保存历史记录
- 🔍 **智能搜索** - 支持内容和备注搜索，快速找到需要的剪贴项
- 🏷️ **类型识别** - 自动识别文本、代码、链接等内容类型并显示图标
- ⭐ **收藏功能** - 重要内容一键收藏，永久保存不计入限制
- 📝 **备注支持** - 为收藏内容添加备注，方便记忆
- ⌨️ **全局快捷键** - 自定义快捷键快速唤起应用
- ⌨️ **键盘导航** - 支持上下键选择、Enter 复制、Esc 取消
- 💾 **本地存储** - 浏览器 localStorage 存储，数据安全可靠
- 🎨 **精美界面** - 白色淡蓝色主题，简洁优雅的视觉体验

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 桌面框架 | Tauri v2 (Rust) |
| 状态管理 | Zustand (persist middleware) |
| 样式方案 | Tailwind CSS |
| 存储方案 | localStorage |
| 图标库 | Lucide React |

## 安装运行

### 环境要求

- Node.js >= 18
- Rust >= 1.70
- macOS 或 Windows 系统

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发服务器（带热更新）
npm run tauri dev
```

### 构建发布

```bash
# 构建生产版本
npm run tauri build
```

构建完成后，安装包位于 `src-tauri/target/release/bundle/` 目录。

## 项目结构

```
clipjar/
├── src/                          # React 前端源码
│   ├── components/              # UI 组件
│   │   ├── Header/             # 顶部搜索栏
│   │   ├── Sidebar/            # 侧边栏导航
│   │   ├── ClipboardList/      # 剪贴板列表
│   │   └── ClipboardItem/      # 单条记录卡片
│   ├── hooks/                  # 自定义 Hooks
│   ├── stores/                 # Zustand 状态管理
│   ├── types/                  # TypeScript 类型定义
│   └── App.tsx                 # 主应用组件
├── src-tauri/                   # Rust 后端源码
│   ├── src/
│   │   ├── main.rs             # 程序入口
│   │   ├── clipboard.rs        # 剪贴板监听
│   │   └── database.rs         # 数据库操作
│   └── Cargo.toml              # Rust 依赖配置
├── DESIGN.md                    # 设计文档
└── README.md                    # 项目说明
```

## 使用说明

### 基本操作

| 操作 | 说明 |
|------|------|
| 复制内容 | 正常使用 `Ctrl/Cmd + C`，内容自动保存到 ClipJar |
| 唤起应用 | 按 `Ctrl/Cmd + Shift + V` 或点击托盘图标 |
| 粘贴历史 | 点击列表项或按 `Enter` 复制到剪贴板 |
| 收藏内容 | 点击星标图标，收藏内容不会被自动清理 |
| 删除记录 | 点击垃圾桶图标或按 `Delete` 键 |

### 内容类型

应用会自动识别不同类型的内容：

- **文本** - 普通文字内容
- **代码** - 包含代码特征的多行文本
- **链接** - URL 地址，支持一键打开
- **图片** - 剪贴板图片（开发中）

### 数据存储

数据使用浏览器 localStorage 本地存储，不会上传到云端。

- **macOS**: 数据存储在浏览器本地存储中
- **Windows**: 数据存储在浏览器本地存储中

## 开发计划

- [x] 基础剪贴板监听和存储
- [x] 文本、代码、链接类型识别
- [x] 搜索和筛选功能
- [x] 收藏功能
- [x] 全局快捷键
- [ ] 图片内容支持
- [ ] 标签管理
- [ ] 数据导入导出
- [ ] 自动清理策略
- [ ] 云同步功能

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

[MIT](LICENSE) © ClipJar

## 致谢

- [Tauri](https://tauri.app/) - 优秀的跨平台桌面应用框架
- [React](https://react.dev/) - 前端 UI 框架
- [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS 框架
- [Lucide](https://lucide.dev/) - 精美的图标库
