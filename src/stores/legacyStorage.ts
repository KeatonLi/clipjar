import type { AppSettings, ClipboardItem } from '../types';
import type { StringStorage } from './storagePolicy';

export const CLIPBOARD_STORAGE_KEY = 'clipjar-storage';

export interface LegacySnapshot {
  items: ClipboardItem[];
  settings: Partial<AppSettings>;
  found: boolean;
}

const settingTypes: Record<keyof AppSettings, 'number' | 'boolean' | 'string'> = {
  maxHistoryItems: 'number',
  autoCleanup: 'boolean',
  cleanupDays: 'number',
  globalShortcut: 'string',
  startAtLogin: 'boolean',
  showPreview: 'boolean',
};

function invalidShape(key: string, detail: string): never {
  throw new Error(`旧版存储「${key}」结构异常：${detail}原始数据已保留。`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, name);
}

function parseValue(raw: string | null, key: string): unknown {
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { throw new Error(`旧版存储「${key}」无法读取，原始数据已保留。`); }
}

function readSettings(value: unknown, key: string, full = false): Partial<AppSettings> {
  if (!isObject(value)) invalidShape(key, '设置必须为对象。');
  for (const [name, setting] of Object.entries(value)) {
    if (!hasOwn(settingTypes, name) || typeof setting !== settingTypes[name as keyof AppSettings] || typeof setting === 'number' && !Number.isFinite(setting)) {
      invalidShape(key, '设置字段或类型无效。');
    }
  }
  if (full && Object.keys(settingTypes).some(name => !hasOwn(value, name))) {
    invalidShape(key, '仅包含设置的存储必须具有完整设置。');
  }
  return value as Partial<AppSettings>;
}

function readItems(value: unknown, key: string): ClipboardItem[] {
  if (!Array.isArray(value)) invalidShape(key, '历史列表必须为数组。');
  for (const item of value) {
    if (!isObject(item) || typeof item.content !== 'string' || typeof item.id !== 'number' || !Number.isFinite(item.id)) {
      invalidShape(key, '剪贴记录格式无效。');
    }
  }
  return value as ClipboardItem[];
}

function readEnvelope(value: unknown): { items: ClipboardItem[]; settings: Partial<AppSettings> } {
  if (!isObject(value) || Object.keys(value).some(key => key !== 'state' && key !== 'version') || !isObject(value.state)) {
    invalidShape(CLIPBOARD_STORAGE_KEY, '必须具有有效的 state 对象。');
  }
  if (hasOwn(value, 'version') && value.version !== 0) invalidShape(CLIPBOARD_STORAGE_KEY, '存储版本无法识别。');
  const state = value.state;
  if (Object.keys(state).some(key => key !== 'items' && key !== 'settings')) invalidShape(CLIPBOARD_STORAGE_KEY, 'state 字段无法识别。');
  const hasItems = hasOwn(state, 'items');
  const hasSettings = hasOwn(state, 'settings');
  if (!hasItems && !hasSettings) invalidShape(CLIPBOARD_STORAGE_KEY, '缺少历史列表或完整设置。');
  return {
    items: hasItems ? readItems(state.items, CLIPBOARD_STORAGE_KEY) : [],
    settings: hasSettings ? readSettings(state.settings, CLIPBOARD_STORAGE_KEY, !hasItems) : {},
  };
}

/** Migration reads original content before any new retention or snapshot writes. */
export function readLegacySnapshot(storage: StringStorage): LegacySnapshot {
  const primaryValue = parseValue(storage.getItem(CLIPBOARD_STORAGE_KEY), CLIPBOARD_STORAGE_KEY);
  const oldItemsValue = parseValue(storage.getItem('clipjar-items'), 'clipjar-items');
  const oldSettingsValue = parseValue(storage.getItem('clipjar-settings'), 'clipjar-settings');
  const envelope = primaryValue === undefined ? undefined : readEnvelope(primaryValue);
  const oldItems = oldItemsValue === undefined ? [] : readItems(oldItemsValue, 'clipjar-items');
  const oldSettings = oldSettingsValue === undefined ? {} : readSettings(oldSettingsValue, 'clipjar-settings');
  const legacyShortcut = storage.getItem('clipjar_shortcut_mode');
  const candidates = [...(envelope?.items ?? []), ...oldItems];
  const seen = new Set<string>();
  const items = candidates.filter(item => {
    const key = `${item.id}\n${item.contentType}\n${item.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    items,
    settings: { ...oldSettings, ...envelope?.settings, ...(legacyShortcut ? { globalShortcut: legacyShortcut } : {}) },
    found: primaryValue !== undefined || oldItemsValue !== undefined || oldSettingsValue !== undefined || legacyShortcut !== null,
  };
}

/** Call only after the native importer confirms a durable, successful import. */
export function completeLegacyMigration(storage: StringStorage, migrationComplete: boolean, settings: AppSettings): void {
  if (!migrationComplete) return;
  // Replace the primary envelope first. If this write fails, the full original stays.
  storage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify({ state: { settings }, version: 0 }));
  storage.removeItem('clipjar-items');
  storage.removeItem('clipjar_shortcut_mode');
}
