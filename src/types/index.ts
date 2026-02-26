// 剪贴板内容类型
export enum ContentType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  CODE = 'code',
  LINK = 'link',
}

// 剪贴板条目
export interface ClipboardItem {
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

// 标签
export interface Tag {
  id: number;
  name: string;
  color: string;
  createdAt: number;
}

// 筛选类型
export type FilterType = ContentType | 'all' | 'favorite';

// 应用设置
export interface AppSettings {
  maxHistoryItems: number;
  autoCleanup: boolean;
  cleanupDays: number;
  globalShortcut: string;
  startAtLogin: boolean;
  showPreview: boolean;
}

// 应用状态
export interface AppState {
  items: ClipboardItem[];
  filteredItems: ClipboardItem[];
  selectedId: number | null;
  searchQuery: string;
  filterType: FilterType;
  selectedTag: string | null;
  isLoading: boolean;
  settings: AppSettings;
}

// 剪贴板事件
export interface ClipboardEvent {
  content: string;
  contentType: ContentType;
  imageData?: Uint8Array;
}

// 列表分组
export interface GroupedItems {
  today: ClipboardItem[];
  yesterday: ClipboardItem[];
  thisWeek: ClipboardItem[];
  earlier: ClipboardItem[];
}
