# 📝 ClipJar - 轻量级剪贴板管理器

一款基于 **Tauri + React** 开发的高性能剪贴板管理工具，专注低内存占用和流畅体验。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)
![Size](https://img.shields.io/badge/size-<5MB-green.svg)

---

## ✨ 特性

| 特性 | 说明 |
|------|------|
| 🚀 **轻量快速** | 安装包 < 5MB，内存占用 < 100MB |
| 💾 **低内存设计** | 自动限制条目数，图片压缩存储 |
| ⌨️ **全局快捷键** | 默认 `Ctrl+Shift+V` 快速唤起 |
| ⭐ **收藏功能** | 重要内容永久保存，不受数量限制 |
| 📝 **备注支持** | 为收藏内容添加备注说明 |
| 🔍 **智能搜索** | 支持内容和备注搜索 |
| 🎯 **类型识别** | 自动识别链接、代码、文本 |
| 🖼️ **图片支持** | 支持剪贴板图片存储（自动压缩） |
| 🔔 **系统托盘** | 后台常驻，点击托盘图标唤起 |

---

## 📥 安装

### Windows

1. 下载 `ClipJar_x64-setup.exe`（推荐）
2. 双击运行安装向导
3. 自动安装 WebView2 运行时（如未安装）
4. 安装完成后桌面生成快捷方式

> ⚠️ **注意**：请下载 `*-setup.exe` 安装包，不要下载绿色版 `.exe`

### macOS

1. 下载对应架构的 `.dmg` 文件
2. 双击打开，将 ClipJar 拖到 Applications 文件夹

---

## 🚀 使用

### 基本操作

| 操作 | 说明 |
|------|------|
| 复制内容 | 正常使用 `Ctrl+C`，自动保存到 ClipJar |
| 唤起应用 | 按 `Ctrl+Shift+V` 或点击托盘图标 |
| 粘贴历史 | 点击列表项或按 `Enter` 复制并隐藏窗口 |
| 收藏内容 | 点击星标图标，收藏内容永久保存 |
| 删除记录 | 点击垃圾桶图标或按 `Delete` |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+V` | 唤起/隐藏应用 |
| `↑` / `↓` | 选择条目 |
| `Enter` | 复制选中项并隐藏 |
| `Esc` | 隐藏窗口 |

---

## 🛠️ 开发

### 环境要求

- Node.js >= 18
- Rust >= 1.70
- Windows 或 macOS

### 本地运行

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建
npm run tauri build
```

---

## ⚡ 性能优化

ClipJar 针对内存占用做了以下优化：

| 优化项 | 策略 |
|--------|------|
| 条目限制 | 默认最多保存 50 条（可设置），收藏除外 |
| 内容截断 | 超长文本自动截断至 5000 字符 |
| 图片压缩 | 大图片自动压缩或只保留缩略图 |
| 内存上限 | 内存中最多保留 100 条记录 |
| 定期清理 | 7 天前的非收藏记录自动清理 |
| 节流监听 | 剪贴板监听间隔 1000ms 减少 CPU 占用 |

---

## 📁 项目结构

```
clipjar/
├── src/                    # 前端源码 (React + TypeScript)
│   ├── components/         # UI 组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Zustand 状态管理
│   ├── types/              # TypeScript 类型
│   └── App.tsx             # 主应用组件
├── src-tauri/              # Tauri 后端 (Rust)
│   └── src/
│       └── main.rs         # 入口文件
├── scripts/                # 脚本工具
│   ├── bump-version.cjs    # 一键版本更新
│   ├── generate-favicon.cjs
│   ├── generate-ico.cjs
│   ├── release.sh          # Linux/Mac 发布
│   └── release-local.ps1   # Windows 本地发布
├── .github/workflows/      # GitHub Actions
│   └── release.yml         # 自动发布工作流
├── CHANGELOG.md           # 变更日志
└── README.md
```

---

## 🚢 发布

### 自动发布（推荐）

推送 GitHub tag 后会自动构建并创建 Release：

```bash
# 方式一：指定版本号
node scripts/bump-version.js 1.0.5

# 方式二：自动递增版本
node scripts/bump-version.js patch   # 1.0.4 → 1.0.5
node scripts/bump-version.js minor   # 1.0.4 → 1.1.0
node scripts/bump-version.js major   # 1.0.4 → 2.0.0

# 提交并打标签
git add -A
git commit -m "release: v1.0.5"
git tag v1.0.5
git push origin main --tags
```

推送 tag 后会自动在 GitHub Actions 构建：
- macOS (Intel + Apple Silicon)
- Windows
- Linux

### 本地打包

```bash
npm run tauri build
```

---

## 🔧 配置

设置存储在本地，可修改以下选项：

- **最大记录数**：10-200 条（默认 50）
- **开机自启**：登录时自动运行
- **窗口置顶**：保持窗口在最前面
- **唤起快捷键**：自定义快捷键

---

## 📄 许可证

[MIT](LICENSE) © ClipJar

---

## 🙏 致谢

- [Tauri](https://tauri.app/) - 轻量级跨平台框架
- [React](https://react.dev/) - 前端框架
- [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS
