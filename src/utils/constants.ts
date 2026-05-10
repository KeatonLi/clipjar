/** 应用常量配置 */

export const APP_CONFIG = {
  // 版本 - 与 package.json 保持一致
  VERSION: '1.0.6',
  APP_NAME: 'ClipJar',

  // 剪贴板轮询间隔 (ms)
  CLIPBOARD_POLL_INTERVAL: 500,

  // 最大内容长度限制 (字符)
  MAX_CONTENT_LENGTH: 10000,

  // 默认最大历史记录数
  DEFAULT_MAX_HISTORY: 100,

  // 列表显示最大条数
  LIST_DISPLAY_LIMIT: 50,

  // 复制成功提示持续时间 (ms)
  COPY_SUCCESS_DURATION: 1500,

  // 重复检测时间窗口 (ms)
  DUPLICATE_WINDOW: 1000,

  // GitHub 地址
  GITHUB_URL: 'https://github.com/KeatonLi/clipjar',

  // 搜索防抖延迟 (ms)
  SEARCH_DEBOUNCE_MS: 150,

  // 图片压缩尺寸
  IMAGE_MAX_WIDTH: 800,
  IMAGE_MAX_HEIGHT: 600,
} as const;

/** 存储键名 */
export const STORAGE_KEYS = {
  ITEMS: 'clipjar-items',
  SETTINGS: 'clipjar-settings',
  SHORTCUT_MODE: 'clipjar_shortcut_mode',
} as const;

/** 默认设置 */
export const DEFAULT_SETTINGS = {
  maxHistoryItems: 100,
  autoCleanup: true,
  cleanupDays: 30,
  globalShortcut: 'Win', // 双击 Win 唤起窗口
  startAtLogin: false,
  showPreview: true,
} as const;

/** 可选的快捷键模式 */
export const SHORTCUT_PRESETS = [
  { label: '双击 Win (推荐)', value: 'Win', description: '双击 Windows 键' },
  { label: '双击 Option', value: 'Option', description: '双击 Mac Option 键' },
  { label: 'Ctrl+Shift+V', value: 'CommandOrControl+Shift+V', description: '传统组合键' },
] as const;
