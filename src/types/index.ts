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
  imageWidth?: number;      // 图片宽度
  imageHeight?: number;     // 图片高度
  sourceApp?: string;
  createdAt: number;
  updatedAt: number;
  isFavorite: boolean;
  useWeight: number;
  tags: string[];
  note?: string; // 备注
  title?: string;
  isSnippet?: boolean;
  // Native images stay in the application data directory, not WebView storage.
  hasImage?: boolean;
}

export type ClipboardItemUpdates = Partial<Pick<ClipboardItem, 'title' | 'content' | 'contentType' | 'note' | 'isSnippet' | 'tags'>>;

// 标签
export interface Tag {
  id: number;
  name: string;
  color: string;
  createdAt: number;
}

// 筛选类型
export type FilterType = ContentType | 'all' | 'favorite';
export type LibraryTab = 'history' | 'favorites' | 'snippets';
export type ContentFilter = ContentType | 'all';

export interface StorageStats {
  itemCount: number;
  ordinaryCount: number;
  snippetCount: number;
  favoriteCount: number;
  imageCount: number;
  imageBytes: number;
  metadataBytes: number;
  totalBytes: number;
  budgetBytes: number;
  metadataBudgetBytes: number;
  isPaused: boolean;
  pausedUntil?: number | null;
  lastError: string | null;
}

export interface ClipboardBootstrap {
  revision: number;
  items: ClipboardItem[];
  settings: AppSettings;
  stats: StorageStats;
  migrationComplete: boolean;
}

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

// 图片数据类型
export interface ImageData {
  width: number;
  height: number;
  rgba: () => Promise<Uint8Array>;
}

// 列表分组
export interface GroupedItems {
  today: ClipboardItem[];
  yesterday: ClipboardItem[];
  thisWeek: ClipboardItem[];
  earlier: ClipboardItem[];
}
