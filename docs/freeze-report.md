# 钴蓝与白色版本封板检查

日期：2026-10-20（Asia/Shanghai）。应用版本维持 1.0.6；本轮完成代码与设计收口，没有发布安装包。

功能提交：[`5c9a85d`](https://github.com/KeatonLi/clipjar/commit/5c9a85d3e37515ff9de9896ac1e1e37a3b2bab4b)。

## 变更

- 按选中的钴蓝构成稿完成顶栏、白色列表、选中态、设置和预览。
- 增加图片内联工作区，保留原生图片像素复制、完整预览与键盘操作。
- 损坏图片禁止复制和放大，明确提示恢复方式。
- 将前端 Tauri API/插件版本对齐 Rust 锁文件，解决 CLI 构建时的版本检查失败。
- 明确跨平台浏览器测试中 Windows 快捷键场景的模拟平台，同时保留独立 macOS 快捷键测试。

## 本地完整验证

| 检查 | 结果 |
| --- | --- |
| `npm test` | 33 项通过。 |
| `cargo test --locked --manifest-path src-tauri/history-core/Cargo.toml` | 19 项存储/采集策略测试通过。 |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | 3 项诊断工具测试通过。 |
| `npm run test:browser` | 全部通过，未捕获未处理页面异常。 |
| `npm run tauri -- build --debug --no-bundle` | TypeScript、生产前端资源与 Linux Tauri 二进制构建通过。 |
| `npm run test:native` | 真实 Linux Tauri 二进制通过，输出 `CLIPJAR_NATIVE_SMOKE_PASSED`。 |
| 视觉对照 | [passed](../design-qa.md)，包含 480 × 720 与 420 × 600 状态。 |
| Linux 原生界面操作 | 实际窗口加载 SQLite 示例及本地图片；点击“复制图片”成功，后端使用次数由 0 增至 1。 |

浏览器回归包含 170 条历史、跨批次键盘导航、全文预览与焦点、Mac 快捷键、图片原生像素复制、隐藏更新、独立设置失败/超时/重试、暂停不补录、删除撤销、旧事件拒绝、迁移失败保护与恢复、新图片工作区及损坏图片保护。

原生冒烟包含系统文字/图片剪贴板、图片持久化、隐藏窗口继续采集、快捷键注册/注销、窗口显隐、暂停后不补录。Linux 云环境使用 Xvfb 和 rootless PRoot，将已安装的 WebKit 子进程路径映射到标准位置；没有关闭 WebKit 沙箱。测试使用临时数据目录，结束后清理。

## Windows / macOS

[Desktop checks #6](https://github.com/KeatonLi/clipjar/actions/runs/39390341577) 已完成，整体结果 **success**，耗时 6 分 22 秒，验证提交为 `5c9a85d`。

| 平台 | 单测与存储 | 浏览器回归 | 桌面二进制构建 | 真实原生冒烟 |
| --- | --- | --- | --- | --- |
| [Windows](https://github.com/KeatonLi/clipjar/actions/runs/39390341577/job/118520075656) | 通过 | 通过 | 通过 | 通过 |
| [macOS 15](https://github.com/KeatonLi/clipjar/actions/runs/39390341577/job/118520075892) | 通过 | 通过 | 通过 | 通过 |

两项任务均完成制品归档和收尾，所有步骤通过。该检查使用真实系统剪贴板与桌面二进制，浏览器场景另外使用模拟命令边界；自动化通过不等同于所有系统缩放、权限配置和安装包分发场景都已人工验证。

## 封板结果

本次范围内的设计、功能回归与三平台构建/原生冒烟已完成，没有遗留阻断项。后续截图与报告提交仅归档验收材料，不修改已验证的运行代码。

## 查看效果

[全部界面截图](ui-preview.md) · [设计稿对照](screenshots/cobalt-comparison.png)
