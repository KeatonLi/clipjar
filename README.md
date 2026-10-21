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

## 界面预览

[查看 Nova 组件版实际界面](docs/ui-preview.md)：使用 shadcn/ui Nova、Lucide、Motion 和 Zustand，保留钴蓝与白色主题。[组件来源与选型说明](docs/component-system.md)。截图使用独立示例数据，同时提供浏览器与 Linux Tauri 原生窗口的运行证据。

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
| `Space` | 预览选中条目的全文或图片 |
| `Enter` | 复制选中项并隐藏 |
| `Ctrl+K` / `⌘K` | 聚焦搜索 |
| `Esc` | 关闭弹窗；列表中清除搜索和选择 |

历史记录每批显示 50 条，可通过“加载更多”访问后续记录；方向键到达当前批次末尾时会继续加载。搜索和收藏筛选作用于全部保留记录。

点击记录旁的预览图标或按空格查看全文。图片记录点击后展开大图，可以直接收藏、放大或复制；聚焦图片记录后按 Enter 复制。完整预览支持适应窗口和实际大小切换，按 Enter 复制、按 Esc 关闭。浏览器开发模式仅提供查看和搜索，系统剪贴板、自启与置顶须在桌面端使用。设置读取失败会显示重试；超过 5 秒未响应也会退出加载状态。

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

### 回归检查

使用 Node.js 22.6+（已验证 Node.js 24）运行：

```bash
npm test
npm run test:history
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
```

浏览器交互回归（运行真实 React 页面，使用隔离示例数据和模拟原生接口）：

```bash
# 如果系统中没有 Chromium，先安装 Playwright 的浏览器
npx playwright install chromium
npm run test:browser
```

测试会自动启动并关闭独立 Vite 服务。可用 `CLIPJAR_CHROMIUM_PATH` 指定浏览器，`CLIPJAR_TEST_PORT` 指定测试端口，`CLIPJAR_ARTIFACT_DIR` 保存截图。覆盖超过 50 条历史的访问、跨批次键盘导航、预览与焦点恢复、平台快捷键、设置失败/超时重试和小窗口布局。模拟测试不能替代 Windows/macOS 的真实桌面验收。

浏览器回归还覆盖内联图片复制的原始像素、损坏图片保护、420 × 600 图片操作区、隐私暂停、删除撤销与迁移。真实原生冒烟可在桌面会话中运行：

```bash
npm run tauri -- build --debug --no-bundle
npm run test:native
```

原生冒烟使用隔离数据，验证系统文字/图片剪贴板、隐藏窗口采集、图片持久化、快捷键注册/注销与隐私暂停。跨平台 CI 会在 Windows 与 macOS 执行；当前版本的具体结果见[封板记录](docs/freeze-report.md)。

---

## ⚡ 性能优化

ClipJar 针对内存占用做了以下优化：

| 优化项 | 策略 |
|--------|------|
| 条目限制 | 默认最多保存 100 条普通历史（可设置），收藏不受数量和过期清理限制 |
| 内容截断 | 超长文本自动截断至 10000 字符 |
| 图片压缩 | 大图片自动压缩或只保留缩略图 |
| 存储预算 | 持久化快照限制为 4 MiB，超额时先省略旧图片负载，保留条目和备注 |
| 定期清理 | 默认自动清理 30 天前的非收藏记录 |
| 节流监听 | 剪贴板监听间隔 500ms，隐藏到托盘后仍继续采集 |

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

桌面版记录与设置统一保存在本地 SQLite，图片独立保存为 PNG。升级会先备份旧缓存再迁移，支持删除撤销、保留收藏的清空和隐私暂停。详见[存储与迁移说明](docs/native-history.md)。

可修改以下选项：

- **最大记录数**：10-500 条普通历史（默认 100），收藏独立保留
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
