# ClipJar 钴蓝与白色视觉验收

final result: passed

2026-10-20。依据用户明确选择的“钴蓝构成 + 白色”制作，参考稿为 [02-cobalt.png](docs/design/concepts/02-cobalt.png)。本次验收对象是已有桌面应用，保留真实历史记录、系统复制、收藏、备注、搜索与隐私暂停。

## 对照与观察

[并排对照](docs/screenshots/cobalt-comparison.png)：左为选中概念稿，右为实际运行页面。参考图从 1024 × 1536 等比缩至 480 × 720，实际截图为 480 × 720 CSS viewport、deviceScaleFactor 1，无拉伸。使用独立示例记录，时区 Asia/Shanghai。

- 钴蓝 `#2344b6` 集中在顶栏和主要动作；主体按用户要求使用纯白，替代概念稿的暖白。
- 保留大字标、半透明搜索框、下划线导航、连续列表与轻量选中态。480 × 720 下顶栏约 165 px，图片主操作位于可见范围内。
- 选中图片后，在记录下方显示大图、真实尺寸、放大、收藏与复制。图片点击用于选择，Enter 复制，Space 仍可打开完整预览。普通文本维持点击复制。
- 不编造图片文件名、格式或文件大小；未备注时显示“剪贴板图片”。建筑照片由出图模型生成，仅作为测试素材，不进入生产前端包。
- 设置与完整预览统一为钴蓝标题栏和白色内容。白色焦点轮廓用于蓝底控件，正文区保留蓝色焦点轮廓。

## 已检查表面

| 表面 | 结果与证据 |
| --- | --- |
| 主界面、图片操作 | [主界面](docs/screenshots/main.png)，无横向溢出；图片与复制动作在常用窗口内完整显示。 |
| 设置、全文、图片预览 | [设置](docs/screenshots/settings.png)、[全文](docs/screenshots/content-preview.png)、[图片预览](docs/screenshots/image-preview.png)，内容可滚动，关闭与焦点恢复正常。 |
| 420 × 600 小窗口 | [图片工作区](docs/screenshots/small-image.png)、[定时暂停](docs/screenshots/small-paused.png)，主体滚动，顶栏稳定，控制按钮不溢出。 |
| 暂停与删除撤销 | [暂停菜单](docs/screenshots/pause-menu.png)、[删除撤销](docs/screenshots/delete-undo.png)，状态和操作仍清楚可见。 |
| 图片错误状态 | 损坏图片显示说明并禁用复制与放大；重新选择恢复后的记录可正常预览和复制。 |
| Linux 原生运行 | [Tauri 窗口客户区](docs/screenshots/native-linux.png)，真实本地图片加载正常；点击图片复制成功，后端使用次数从 0 增至 1。 |
| 键盘、模态与反馈 | 170 条历史跨批次导航、搜索、Space、Escape、焦点约束、设置失败与重试均通过回归。 |

## 验证边界

主对照及各状态截图来自真实 React 页面与浏览器运行，使用隔离示例数据和原生命令模拟；另单独提供 Linux/Xvfb 的原生窗口截图，使用隔离 SQLite 数据。没有将它们标为 Windows/macOS 原生窗口截图。三平台构建与原生测试结果、完整命令见[封板记录](docs/freeze-report.md)。

没有未解决的 P0/P1/P2 视觉问题。P3：系统字体回退、系统标题栏和缩放的细微差异仍取决于用户的桌面环境。
