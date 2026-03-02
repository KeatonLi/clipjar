/** 应用常量配置 */

export const APP_CONFIG = {
  // 版本
  VERSION: '1.0.3',
  
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
  globalShortcut: 'CommandOrControl+Shift+V',
  startAtLogin: false,
  showPreview: true,
} as const;
