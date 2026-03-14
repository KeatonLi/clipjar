import { Link, Code } from 'lucide-react';
import { ContentType } from '../../types';

// 内容类型图标组件 - 纯展示组件，使用 memo 优化
import { memo } from 'react';

export const TypeIcon = memo(({ type }: { type: ContentType }) => {
  if (type === ContentType.LINK) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-medium">
        <Link className="w-3 h-3" />
        链接
      </span>
    );
  }
  if (type === ContentType.CODE) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-600 text-[10px] font-medium">
        <Code className="w-3 h-3" />
        代码
      </span>
    );
  }
  return null;
});

TypeIcon.displayName = 'TypeIcon';
