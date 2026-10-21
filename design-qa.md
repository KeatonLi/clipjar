# ClipJar Nova 组件视觉 QA

final result: passed

2026-10-21（Asia/Shanghai）。按用户指定的 shadcn/ui Nova、Lucide、Motion、Zustand 统一当前界面，保留已选的钴蓝与白色构成。没有对应功能的分栏和拖拽不引入。

## 来源与对照

- 基础控件和 Nova 样式来自 shadcn/ui 官方提交 `ba1503c`，来源及局部适配见[组件体系](docs/component-system.md)。
- [构成对照](docs/screenshots/cobalt-comparison.png)：左为此前选中的概念稿，右为当前 Nova 实际界面。参考稿从 1024 × 1536 等比归一到 480 × 720；右图 CSS viewport 480 × 720、deviceScaleFactor 1，没有拉伸。
- [组件对照](docs/screenshots/nova-components.png)：本轮实际主界面、设置与确认弹窗，均使用隔离示例数据。

## 检查与修正

1. 统一 Button 尺寸与变体、Input、Textarea、Switch、ToggleGroup、RadioGroup、Dialog、AlertDialog、DropdownMenu 和 Tooltip。Lucide 保持唯一图标库；采用 Nova 默认 Geist 字体，中文系统回退。
2. 自写弹窗焦点逻辑由 Radix 模态管理替代；应用状态打开的弹窗补充焦点返回适配。确认框初始焦点在取消，取消或 Escape 后回到原清空按钮。
3. 暂停菜单支持键盘打开、方向键移动、Escape 关闭并返回触发器。修复菜单 Escape 继续触发列表快捷键、清掉图片选中态的问题。
4. 弹出内容、开关和撤销提示使用 Motion；减少动态效果偏好下不执行入场过渡。修正 Motion 与撤销提示水平居中样式冲突。
5. 保留钴蓝顶栏、纯白主体、连续列表和图片工作区。480 × 720 下主要图片操作可见，420 × 600 主体可滚动；设置和确认框在窗口内完整显示。

## 验收表面

| 表面 | 证据与结果 |
| --- | --- |
| 主界面和图片工作区 | [截图](docs/screenshots/main.png)，蓝白配色、文本阅读与操作层次保持一致。 |
| 设置与确认 | [设置](docs/screenshots/settings.png)、[确认框](docs/screenshots/clear-confirm.png)，危险操作与取消分开，背景隔离。 |
| 菜单与提示 | [暂停菜单](docs/screenshots/pause-menu.png)，默认白色 Nova 菜单；工具提示实际显示并通过回归。 |
| 完整预览 | [图片](docs/screenshots/image-preview.png)、[全文](docs/screenshots/content-preview.png)，滚动、复制、关闭与焦点返回通过回归。 |
| 小窗口 | [图片操作](docs/screenshots/small-image.png)、[定时暂停](docs/screenshots/small-paused.png)，无横向溢出，控件可达。 |
| 原生运行 | [Linux Tauri 客户区](docs/screenshots/native-linux.png)，实际二进制加载隔离 SQLite 记录与本地图片。 |

没有遗留 P0/P1/P2 视觉问题。自动化验证含正常与减少动态效果模式；没有据截图宣称屏幕阅读器或全部系统缩放均已验收。Windows/macOS 原生测试结果见[验证记录](docs/freeze-report.md)。
