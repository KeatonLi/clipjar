import { ContentType } from '../types';

/** 检测内容类型 */
export function detectContentType(content: string): ContentType {
  if (!content || !content.trim()) return ContentType.TEXT;
  
  // 链接检测
  if (/^https?:\/\/\S+$/i.test(content)) {
    return ContentType.LINK;
  }
  
  // 代码检测
  if (/[{};]|function|const|let|var|import|export|class|def |async|await/.test(content) && content.includes('\n')) {
    return ContentType.CODE;
  }
  
  return ContentType.TEXT;
}

/** 格式化时间 */
export function formatTime(timestamp: number): string {
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today.getTime() - 86400000);
  const lastWeek = new Date(today.getTime() - 7 * 86400000);

  if (timestamp >= today.getTime()) {
    return '今天';
  }
  if (timestamp >= yesterday.getTime()) {
    return '昨天';
  }
  if (timestamp >= lastWeek.getTime()) {
    const diff = now - timestamp;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}小时前`;
  }

  return new Date(timestamp).toLocaleDateString('zh-CN', { 
    month: 'short', 
    day: 'numeric' 
  });
}

/** 截断文本 */
export function truncate(text: string, maxLength: number = 100): string {
  if (!text) return '';
  return text.length > maxLength 
    ? text.substring(0, maxLength) + '...' 
    : text;
}

/** 生成唯一 ID */
export function generateId(): number {
  return Date.now();
}
