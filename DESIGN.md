# ClipJar - 跨平台剪贴板管理器 设计文档

## 1. 项目概述

ClipJar 是一个基于 Web 技术开发的跨平台桌面应用，用于保存和管理剪贴板历史记录，支持 macOS 和 Windows 系统。

## 2. 技术方案

### 2.1 核心技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 框架 | **Tauri v2** | Rust 编写的轻量级 Electron 替代品 |
| 前端 | **React + TypeScript** | 现代化 UI 开发 |
| 样式 | **Tailwind CSS** | 原子化 CSS 框架 |
| 状态管理 | **Zustand** | 轻量级状态管理 |
| 本地存储 | **SQLite (via Tauri SQL)** | 结构化数据存储 |
| 剪贴板监听 | **Tauri Clipboard API** | 系统级剪贴板访问 |

### 2.2 为什么选择 Tauri?

- **包体积小**: 相比 Electron，打包后体积 < 5MB
- **内存占用低**: Rust 后端，内存占用显著降低
- **原生性能**: 剪贴板监听和文件操作使用原生 API
- **跨平台**: 一套代码支持 macOS 和 Windows
- **安全性**: 默认安全沙箱机制

## 3. 功能设计

### 3.1 核心功能

```
┌─────────────────────────────────────────────────────────┐
│                      功能模块                            │
├─────────────────────────────────────────────────────────┤
│  剪贴板监听  │  历史记录管理  │  搜索筛选  │  快速粘贴   │
├─────────────────────────────────────────────────────────┤
│  分类标签    │  收藏置顶     │  数据导出  │  快捷键支持 │
└─────────────────────────────────────────────────────────┘
```

### 3.2 功能详情

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 自动监听 | 后台监听剪贴板变化，自动保存 | P0 |
| 历史列表 | 按时间倒序展示剪贴板历史 | P0 |
| 文本预览 | 支持文本内容的预览和展开 | P0 |
| 图片预览 | 支持图片缩略图预览 | P0 |
| 快速搜索 | 支持内容搜索和筛选 | P1 |
| 分类标签 | 自定义标签分类管理 | P1 |
| 收藏置顶 | 重要内容置顶收藏 | P1 |
| 快捷键 | 全局快捷键唤起应用 | P1 |
| 数据导出 | JSON/CSV 格式导出 | P2 |
| 云同步 | 跨设备数据同步（未来版本）| P3 |

## 4. 数据结构设计

### 4.1 数据库 Schema

```sql
-- 剪贴板记录表
CREATE TABLE clipboard_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,              -- 文本内容（如果是图片则为空）
    content_type TEXT NOT NULL,         -- 'text' | 'image' | 'file'
    image_path TEXT,                    -- 图片本地存储路径
    source_app TEXT,                    -- 来源应用
    created_at INTEGER NOT NULL,        -- 创建时间戳
    updated_at INTEGER NOT NULL,        -- 更新时间戳
    is_favorite BOOLEAN DEFAULT 0,      -- 是否收藏
    use_count INTEGER DEFAULT 0,        -- 使用次数
    tags TEXT                           -- 标签 JSON 数组
);

-- 标签表
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#3B82F6',
    created_at INTEGER NOT NULL
);

-- 索引优化
CREATE INDEX idx_clipboard_created ON clipboard_items(created_at DESC);
CREATE INDEX idx_clipboard_type ON clipboard_items(content_type);
CREATE INDEX idx_clipboard_favorite ON clipboard_items(is_favorite);
```

### 4.2 TypeScript 类型定义

```typescript
// 剪贴板内容类型
enum ContentType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
}

// 剪贴板条目
interface ClipboardItem {
  id: number;
  content: string;
  contentType: ContentType;
  imagePath?: string;
  sourceApp?: string;
  createdAt: number;
  updatedAt: number;
  isFavorite: boolean;
  useCount: number;
  tags: string[];
}

// 应用状态
interface AppState {
  items: ClipboardItem[];
  searchQuery: string;
  selectedType: ContentType | 'all';
  selectedTag: string | null;
  settings: AppSettings;
}

// 应用设置
interface AppSettings {
  maxHistoryItems: number;      // 最大保存条数 (默认 500)
  autoCleanup: boolean;         // 自动清理
  cleanupDays: number;          // 清理天数
  globalShortcut: string;       // 全局快捷键
  startAtLogin: boolean;        // 开机启动
}
```

## 5. 应用架构

### 5.1 项目结构

```
clipjar/
├── src/
│   ├── components/           # React 组件
│   │   ├── Header/          # 顶部搜索栏
│   │   ├── Sidebar/         # 侧边栏分类
│   │   ├── ClipboardList/   # 剪贴板列表
│   │   ├── ClipboardItem/   # 单条记录卡片
│   │   ├── ImagePreview/    # 图片预览
│   │   └── Settings/        # 设置面板
│   ├── hooks/               # 自定义 Hooks
│   │   ├── useClipboard.ts  # 剪贴板监听
│   │   ├── useDatabase.ts   # 数据库操作
│   │   └── useShortcut.ts   # 快捷键管理
│   ├── stores/              # Zustand 状态管理
│   │   └── clipboardStore.ts
│   ├── types/               # TypeScript 类型
│   ├── utils/               # 工具函数
│   └── App.tsx              # 主应用
├── src-tauri/               # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs          # 入口文件
│   │   ├── clipboard.rs     # 剪贴板监听模块
│   │   ├── database.rs      # 数据库模块
│   │   └── commands.rs      # 前端调用命令
│   └── Cargo.toml
├── public/                  # 静态资源
├── package.json
├── tailwind.config.js
└── tauri.conf.json          # Tauri 配置
```

### 5.2 架构流程图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │   UI     │  │  State   │  │  Hooks   │  │  Events  │    │
│  │Components│  │ Zustand  │  │ Clipboard│  │  Tauri   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
└───────┼─────────────┼─────────────┼─────────────┼──────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                          │
                    invoke / listen
                          │
┌─────────────────────────┼──────────────────────────────────┐
│                   Tauri Bridge                            │
│              (Rust + JavaScript Bridge)                   │
└─────────────────────────┼──────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│   Clipboard │  │  Database   │  │    File     │
│   Listener  │  │  (SQLite)   │  │   System    │
│  (OS Native)│  │             │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

## 6. 界面设计

### 6.1 主界面布局

```
┌─────────────────────────────────────────────────────────┐
│  🔍 搜索剪贴板内容...                    ⚙️  [—] [×]   │  ← Header
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  📋 全部  │  ┌──────────────────────────────────────┐   │
│  ⭐ 收藏  │  │ 📄 项目设计文档内容...               │   │
│  🏷️ 标签  │  │    2分钟前 · 来自 VS Code            │   │
│          │  └──────────────────────────────────────┘   │
│ ──────── │  ┌──────────────────────────────────────┐   │
│          │  │ 🖼️  screenshot.png                   │   │
│  📝 文本  │  │    [图片预览]  5分钟前 · 来自 Chrome │   │
│  🖼️ 图片  │  └──────────────────────────────────────┘   │
│  📁 文件  │  ┌──────────────────────────────────────┐   │
│          │  │ 📄 https://github.com/...            │   │
│ ──────── │  │    10分钟前 · 来自 Safari            │   │
│          │  └──────────────────────────────────────┘   │
│  ⚙️ 设置  │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
     ↑                    ↑
   Sidebar            Main Content
```

### 6.2 快捷键设计

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + Shift + V` | 全局唤起应用 |
| `Cmd/Ctrl + K` | 聚焦搜索框 |
| `Esc` | 隐藏窗口 |
| `Cmd/Ctrl + D` | 删除选中项 |
| `Cmd/Ctrl + F` | 收藏/取消收藏 |
| `↑/↓` | 上下切换选中 |
| `Enter` | 复制并粘贴选中项 |

## 7. 存储方案

### 7.1 数据存储路径

| 平台 | 数据目录 |
|------|---------|
| macOS | `~/Library/Application Support/ClipJar/` |
| Windows | `%APPDATA%/ClipJar/` |

### 7.2 存储内容

```
ClipJar/
├── database.db          # SQLite 数据库
├── images/              # 剪贴板图片缓存
│   ├── 2024/
│   │   ├── 01/
│   │   │   ├── img_001.png
│   │   │   └── img_002.jpg
│   └── ...
├── config.json          # 应用配置
└── logs/                # 日志文件
```

### 7.3 数据清理策略

- **数量限制**: 默认最多保存 500 条记录
- **时间限制**: 可选自动清理 30/60/90 天前的记录
- **图片清理**: 删除记录时同步删除对应图片文件
- **收藏保护**: 收藏的内容不会被自动清理

## 8. 开发计划

### 8.1 第一阶段 - MVP (2周)

- [x] 项目初始化 (Tauri + React)
- [x] 数据库设计和实现
- [x] 剪贴板监听功能
- [x] 基础 UI 界面
- [x] 文本内容保存和展示

### 8.2 第二阶段 - 功能完善 (1周)

- [ ] 图片内容支持
- [ ] 搜索功能
- [ ] 收藏功能
- [ ] 快捷键支持
- [ ] 设置面板

### 8.3 第三阶段 - 优化发布 (1周)

- [ ] 性能优化
- [ ] 打包发布
- [ ] 自动更新
- [ ] 使用文档

## 9. 技术风险与解决方案

| 风险 | 解决方案 |
|------|---------|
| 剪贴板监听性能 | 使用 Tauri 原生 API，避免轮询 |
| 图片存储过大 | 压缩图片，限制单张大小 |
| 数据库性能 | 添加索引，限制历史条数 |
| 跨平台兼容性 | 使用 Tauri 抽象层，平台特定代码条件编译 |

## 10. 参考资源

- [Tauri 官方文档](https://tauri.app/)
- [Tauri v2 剪贴板插件](https://v2.tauri.app/plugin/clipboard/)
- [Tauri SQL 插件](https://v2.tauri.app/plugin/sql/)
