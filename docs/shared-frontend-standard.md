# 跨项目的前端组件约定

2026-10-21：沿用 ClipJar 已确认的组件选型，为其他项目完成第一批基础控件统一。统一组件来源、交互质量与维护方式，各产品继续保留自己的品牌颜色、布局和框架。

| 项目 | 基础控件 | 图标 / 动效 | 状态与边界 |
| --- | --- | --- | --- |
| [ClipJar](https://github.com/KeatonLi/clipjar/blob/main/docs/component-system.md) | shadcn/ui Nova / Radix | Lucide / Motion | Zustand；原生数据由 Rust / SQLite 持久化 |
| [LifeKernelOS](https://github.com/KeatonLi/LifeKernelOS/blob/main/docs/development/frontend-components.md) | 同源 Nova Button、Input、Textarea | Lucide / Motion | Zustand 管理收集箱开关；业务事实仍在客户端业务进程 |
| [个人站](https://github.com/KeatonLi/keaton-intro-website/blob/main/docs/frontend-components.md) | shadcn-vue / Reka，Nova 风格令牌 | Lucide；品牌图标保留 Nuxt Icon / Motion Vue | 保留 Nuxt SSR 与局部状态 |
| [Prompt Flow Craft](https://github.com/KeatonLi/prompt-flow-craft/blob/main/frontend/docs/frontend-components.md) | shadcn-vue / Reka，Nova 风格令牌；全局 AlertDialog | 全局通知 / 确认图标用 Lucide，动效用 Motion Vue | 保留现有 Pinia 与业务 API |
| [Kivo Git](https://github.com/KeatonLi/kivo-git/blob/main/docs/FRONTEND_COMPONENTS.md) | 保留 VS Code 原生入口及现有 Webview | Codicons、文件图标主题；宿主动效 | 保留消息桥与 VS Code 状态协议 |

## 新增界面的选择

React 项目从 ClipJar 的 Nova 基础组件复用；Vue 项目使用 shadcn-vue / Reka 对应实现，不为了一个按钮迁移框架。Vue 上游使用 `new-york-v4` 注册表，本次仅将所用基础控件的尺寸、圆角、焦点和变体适配为 Nova 风格，**不是官方 Vue Nova preset**。

- 已有同类控件先复用 `components/ui/`，不再逐页面手写一份。
- 动效按需使用对应框架的 Motion，尊重减少动态效果；状态库解决实际共享状态，Vue 已有 Pinia 时继续使用。
- 分栏、拖拽只有产品实际需要时再引入；不提前安装无用途的库。
- 每个仓库记录源码版本、授权与适配点；升级时回归绑定、禁用、键盘、焦点恢复及响应式场景。

这一批不是所有业务组件的全量迁移：LifeKernelOS 的既有模态控制器、Vue 的部分业务弹窗与原生选择控件继续保留；Prompt Flow Craft 的旧内联图标尚未全部替换。各仓库的记录和浏览器测试说明实际覆盖范围。
