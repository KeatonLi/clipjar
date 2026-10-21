# Nova 组件迁移验证记录

2026-10-21（Asia/Shanghai）。当前应用版本 1.0.6，按用户指定的组件体系迁移并推送代码供查看。

验证代码：[`0515f0c`](https://github.com/KeatonLi/clipjar/commit/0515f0c439e2d6f79cc8559a0fe4e29c1248e9f1)。后续归档提交仅更新截图与说明。

## 本次变更

- 当前界面使用 shadcn/ui 官方 Nova（Radix）基础组件、Geist 字体和 Lucide 图标。
- 按钮、输入框、备注框、开关、筛选、快捷键单选、弹窗、暂停菜单、确认框和工具提示统一。
- 自定义动效使用 Motion，并响应减少动态效果偏好；Zustand 与 Rust/SQLite 数据通路保留。
- 修复菜单 Escape 影响背景选择、嵌套确认框取消后的焦点返回，以及 Motion 与撤销提示居中样式的冲突。
- 保留钴蓝白色构成。没有对应功能的分栏、拖拽不添加依赖。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm test` | 33 项通过。 |
| `npm run test:history` | 19 项存储与采集策略测试通过。 |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | 3 项诊断测试通过。 |
| `npm run test:browser` | 原有回归与新增 Nova 场景全部通过，无未处理页面异常。 |
| `npm run build` | TypeScript 与生产资源构建通过。 |
| 生产资源浏览器检查 | 直接加载 dist，主界面、设置、图片工作区和菜单可运行，无页面异常。 |
| `npm run tauri -- build --debug --no-bundle` | Linux 真实桌面二进制构建通过，包含生产前端资源。 |
| `npm run test:native` | Linux 真实系统剪贴板、图片保存、隐藏采集、快捷键和隐私暂停通过。 |
| 原生界面图片复制 | Linux Tauri 实际窗口点击复制成功，后端使用次数由 0 增至 1。 |
| [视觉 QA](../design-qa.md) | passed，含 480 × 720、420 × 600 与 Linux 原生窗口。 |

新增 Nova 回归验证菜单键盘打开、方向键导航、Escape 后保留选中图片并返回焦点、Tooltip 显示、快捷键单选键盘操作、减少动态效果、嵌套确认框取消与焦点恢复、清空普通历史保留收藏、取消全部清空，以及确认后删除全部数据。

原有回归继续覆盖 170 条历史和跨批次键盘导航、全文/图片预览、原始图片像素复制、设置失败/超时/重试、隐藏更新、暂停不补录、删除撤销、迁移保护和小窗口焦点约束。

Linux 云桌面使用 Xvfb，rootless PRoot 映射已安装的 WebKit 子进程路径；没有关闭 WebKit 沙箱。所有原生测试与截图使用隔离数据。

## Windows / macOS CI

[Desktop checks](https://github.com/KeatonLi/clipjar/actions/runs/39537168981) 整体 **success**，耗时 **2 分 57 秒**。

| 平台 | 前端与存储单测 | 浏览器回归 | 真实桌面构建 | 原生冒烟 |
| --- | --- | --- | --- | --- |
| [Windows](https://github.com/KeatonLi/clipjar/actions/runs/39537168981/job/119016376897) | 通过 | 通过 | 通过 | 通过 |
| [macOS 15](https://github.com/KeatonLi/clipjar/actions/runs/39537168981/job/119016376782) | 通过 | 通过 | 通过 | 通过 |

两个任务包括制品归档与收尾均完成。自动化通过不表示所有系统缩放、屏幕阅读器或安装包分发场景都经过人工验收。

本轮使用 Tailwind 4 与当前 Nova 样式，需要现代 WebView。旧系统兼容范围见[组件体系](component-system.md)；本轮发布的是 GitHub 代码与预览材料。

[查看实际截图](ui-preview.md) · [组件来源](component-system.md)
