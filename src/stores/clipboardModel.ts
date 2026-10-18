import type { AppSettings, ClipboardItem, ContentFilter, ContentType, LibraryTab } from '../types';

export interface ClipboardQuery {
  tab: LibraryTab;
  type: ContentFilter;
  search: string;
  tag?: string | null;
}

/** Apply every filter before sorting; every stored match remains reachable. */
export function queryClipboardItems(items: ClipboardItem[], query: ClipboardQuery): ClipboardItem[] {
  const terms = query.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (query.tab === 'history' && item.isSnippet) return false;
    if (query.tab === 'favorites' && !item.isFavorite) return false;
    if (query.tab === 'snippets' && !item.isSnippet) return false;
    if (query.type !== 'all' && item.contentType !== query.type) return false;
    if (query.tag && !item.tags.includes(query.tag)) return false;
    const searchable = [item.title, item.content, item.note, ...item.tags].filter(Boolean).join('\n').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  }).sort((a, b) => query.tab === 'snippets'
    ? b.updatedAt - a.updatedAt || b.id - a.id
    : b.createdAt - a.createdAt || b.id - a.id);
}

/** Settings use the same ordinary-history limits on both platforms and preview. */
export function normalizeSettings(settings: AppSettings): AppSettings {
  const boundedNumber = (value: number, minimum: number, maximum: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
  return {
    ...settings,
    maxHistoryItems: boundedNumber(settings.maxHistoryItems, 10, 500, 100),
    cleanupDays: boundedNumber(settings.cleanupDays, 1, 3650, 30),
  };
}

export function validateSnippetDraft(title: string, content: string): { title: string; content: string; contentType: ContentType } {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('请为片段填写名称。');
  if (trimmedTitle.length > 80) throw new Error('片段名称最多 80 个字符。');
  if (!content.trim()) throw new Error('请填写片段内容。');
  if (content.length > 10000) throw new Error('片段内容最多 10,000 个字符。');
  const contentType = /^https?:\/\/\S+$/i.test(content.trim()) ? 'link'
    : /[{};]|function|const|let|var|import|export|class|def |async|await/.test(content) && content.includes('\n') ? 'code'
    : 'text';
  return { title: trimmedTitle, content, contentType: contentType as ContentType };
}
