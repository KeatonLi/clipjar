# ClipJar 组件体系

按用户指定的选型统一当前正在使用的界面：**shadcn/ui Nova + Lucide + Motion + Zustand**。主题保留钴蓝 `#2344b6` 与白色；分栏和拖拽尚无对应功能，因此没有引入 react-resizable-panels 或 dnd-kit。

## 来源与配置

- `components.json`：`radix-nova`，Lucide，React 客户端组件。
- 基础组件来自 [shadcn/ui 官方 Radix 源码](https://github.com/shadcn-ui/ui/tree/ba1503c64472b82256d9de95e2e62c5901a38e8b/apps/v4/registry/bases/radix/ui)。shadcn/ui 以源码形式接入，并不要求安装一个运行时组件包。
- Nova 样式来自同一提交的 [style-nova.css](https://github.com/shadcn-ui/ui/blob/ba1503c64472b82256d9de95e2e62c5901a38e8b/apps/v4/registry/styles/style-nova.css)，仅保留当前组件的样式段。使用默认白色菜单；主题变量在 `src/styles/tokens.css`。
- 状态选择器来自 shadcn 4.22.1；Tailwind 4 通过 Vite 插件编译。旧版 Tailwind/PostCSS 配置已移除。
- Nova 的 Geist 可变字体从 npm 自托管；中文使用系统字体回退，不依赖运行时字体 CDN。
- 授权文件随前端资源分发：`public/licenses/`。

Tailwind 4 和当前 Nova 样式需要现代 WebView（Safari 16.4+ 或 Chromium 111+）。本轮桌面矩阵验证 Windows 当前 WebView2 与 macOS 15；仓库历史打包配置中的旧 macOS 最低版本不代表这次迁移已验证兼容，分发安装包前需单独校正最低系统要求。

## 实际采用的组件

| 界面 | 基础组件 | 行为 |
| --- | --- | --- |
| 操作按钮、图标按钮 | Button、Tooltip | 统一尺寸/变体，图标操作有可访问名称和提示 |
| 搜索、记录上限、备注 | Input、Textarea | 保留搜索、防抖、数值校验和备注保存 |
| 最近 / 收藏 | ToggleGroup | 单选筛选，保留计数与键盘导航 |
| 暂停时长 | DropdownMenu | 方向键导航、Escape 关闭、焦点返回触发器 |
| 开机自启、窗口置顶 | Switch | 保留真实原生状态、失败重试、超时与禁用状态 |
| 快捷键设置 | RadioGroup | 单选语义，支持方向键选择 |
| 设置、全文和图片预览 | Dialog | 模态隔离、焦点约束、Escape 与焦点恢复 |
| 清空历史 / 全部数据 | AlertDialog | 明确确认或取消，初始焦点在取消；普通历史清空保留收藏 |
| 列表与图片工作区 | ItemRow、ImageInspector | 业务组件组合上述基础控件，保留原生复制与图片损坏保护 |

## 动效与状态

弹窗、确认框、菜单、工具提示的入场，开关滑块和撤销提示使用 `motion/react`。全局 `MotionConfig reducedMotion="user"`，各动效也读取减少动态效果偏好。Nova 的交互颜色过渡保留；原有 CSS 入场动画由 Motion 接管。

Radix 管理组件语义、菜单和模态行为；额外适配了由应用状态打开弹窗时的焦点返回。菜单已处理的按键不会继续触发列表快捷键，避免关闭菜单时丢失图片选择。

Zustand 继续保存应用状态。桌面历史和图片仍由 Rust/SQLite 持久化，组件迁移没有改用浏览器保存原生历史。

添加控件时复用 `src/components/ui/`，按需从同一 Nova 体系添加；不要为同一功能混入另一套控件。升级官方源码时保留项目中的 Motion 和焦点返回适配。

[实际界面](ui-preview.md) · [本次验证](freeze-report.md)
