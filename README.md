# ClipJar

基于 Tauri、React 和 TypeScript 的本地剪贴板工具，支持 Windows 和 macOS。把复制过的内容找回来，把常用内容保存成片段。

## 当前开发版本

以下能力来自当前源码；已发布安装包可能尚未包含这些改动。[Checks 工作流](.github/workflows/checks.yml) 提供 Windows/macOS 构建与 Ubuntu 浏览器界面检查，桌面操作效果仍需在两平台试用验证。

| 能力 | 说明 |
|------|------|
| 后台记录 | Rust 每 700 ms 检查剪贴板，窗口隐藏或关闭到托盘后继续记录 |
| 图片复制 | 保存 PNG 原图，复制时写回系统图片剪贴板；按像素内容去重 |
| 历史与收藏 | 普通历史默认 100 条，可设为 10–500 条；收藏不参与自动淘汰 |
| 常用片段 | 新建、编辑、搜索并复制常用回复、地址和代码；片段不参与自动淘汰 |
| 搜索与预览 | 按类型、名称、内容和备注筛选，查看完整文字或图片，分批显示全部匹配记录 |
| 暂停记录 | 暂停 15 分钟或 1 小时，支持提前恢复；暂停期间内容不补录 |
| 容量管理 | 图片预算 64 MiB，元数据预算 4 MiB；优先清理普通历史，空间不足时显示错误并保留收藏和片段 |
| 桌面入口 | 全局快捷键、系统托盘、开机自启和窗口置顶 |

## 安装与试用

已发布安装包见 [GitHub Releases](https://github.com/KeatonLi/clipjar/releases)。Windows 使用 `*-setup.exe` 安装包，需要 WebView2；macOS 使用对应架构的 `.dmg`，将应用拖入 Applications。

当前开发版本的 Checks 工作流在构建成功后上传 Windows/macOS 可执行文件，供下载试用；这些产物不是安装包，也不会创建 Release。macOS 下载产物后可能需要重新赋予可执行权限；它面向工作流对应的架构。浏览器检查截图也作为工作流产物保存。

## 使用

正常复制文字、链接、代码或图片，ClipJar 会后台记录。按 `Ctrl / ⌘ + Shift + V` 或点击托盘打开窗口；点击记录或按 Enter 复制，再回到目标应用粘贴。

点击星标保留重要内容。选择“新建片段”保存常用片段；记录的“更多”菜单提供完整预览、保存为片段、备注和删除。设置中可修改普通历史数量、保留时间和唤起快捷键，也可查看存储占用或清空普通历史。

| 快捷键 | 功能 |
|--------|------|
| `Ctrl / ⌘ + Shift + V` | 打开窗口；可在设置中换成其他组合键 |
| `Ctrl / ⌘ + F` | 聚焦搜索 |
| `Ctrl / ⌘ + N` | 新建片段 |
| `↑` / `↓` | 选择记录 |
| `Enter` | 复制选中项；没有选中项时复制第一条 |
| `Esc` | 先关闭对话框或清除搜索，再隐藏主窗口 |
| `Ctrl / ⌘ + Enter` | 在片段编辑器中保存 |

## 数据存储

桌面历史由 Rust 管理，使用应用数据目录中的 `history/history.json` 和 `history/images/*.png`，通过临时文件及原子替换提交。ClipJar 不使用自建 SQLite 数据库，桌面图片不会再次写入 WebView localStorage。

首次启动会迁移旧版 localStorage 中的历史、收藏、备注、图片和快捷键设置。只有本地存储确认提交成功后才清理旧历史；迁移失败时保留原始数据并提示错误。普通历史按数量和时间设置保留，默认保留 30 天；收藏和片段受容量预算保护，空间不足时需要手动删除内容才能继续保存。

700 ms 轮询可能遗漏两次检查之间被快速覆盖的剪贴内容。容量预算约束 ClipJar 管理的历史和图片，不能约束 WebView 缓存、整个应用目录或临时写入峰值。过往几个 GB 文件的具体原因尚未确认，改动不会自动压缩旧 WebView 数据库。

实现说明见 [原生历史与迁移](docs/native-history.md)，历史排查记录见 [存储增长调查](docs/storage-investigation.md)。

## 开发与验证

需要 Node.js 24、Python 3、Rust stable，以及当前 Tauri 2 所需的 Windows/macOS 开发环境。Windows 使用 MSVC C++ 工具链；macOS 使用 Xcode Command Line Tools。

```sh
npm ci
npm run tauri dev
```

```sh
node --experimental-strip-types --test "tests/*.test.ts"
python -m unittest discover -s tests -p "test_*.py" -v
cargo test --manifest-path tests/native-history/Cargo.toml
npm run tauri build -- --no-bundle
```

Tauri 构建会通过 `beforeBuildCommand` 执行 `npm run build`，包括真实 TypeScript 编译和 Vite 构建。前端单独运行 `npm run dev` 可预览界面和使用浏览器本地片段库；系统后台记录、全局快捷键及窗口设置在桌面应用中生效。

Checks 会在 PR、手动运行和 `main` 分支推送时执行检查，功能分支通过 PR 检查避免重复构建。原生历史测试直接使用生产 `history.rs`，不依赖 WebView；完整 Tauri 构建另行验证桌面入口和插件编译。构建通过不能替代隐藏窗口捕获、图片粘贴、暂停恢复和旧数据迁移的桌面实测。

## 发布

版本号由维护者更新；`release.yml` 仅在推送 `v*` 标签时打包并创建 GitHub Release。普通分支 Checks 不发布版本。

## 许可证

[MIT](LICENSE)
