/** Synthetic data only. The poster was generated from the selected design reference. */
export default function installDesignPreview({ posterDataUrl, reference = false }) {
  const raw = JSON.parse(localStorage.getItem('clipjar-storage'));
  const now = Date.now();
  const referenceTimes = [
    [19, 37],
    [19, 25],
    [19, 13],
    [19, 1],
    [18, 47],
    [22, 14],
    [21, 3]
  ];
  const content = [
    {
      content: '周五发布前确认：快捷键、数据迁移、图片复制。',
      contentType: 'text',
      isFavorite: true
    },
    { content: 'https://linear.app/method', contentType: 'link', isFavorite: false },
    {
      content: 'const selected = history.find(item => item.id === id);',
      contentType: 'code',
      isFavorite: false
    },
    {
      content: '[图片 2048x768]',
      contentType: 'image',
      imagePath: posterDataUrl,
      imageWidth: 2048,
      imageHeight: 768,
      isFavorite: false
    },
    { content: 'A little space for ideas.', contentType: 'text', isFavorite: false }
  ];
  if (reference)
    content.push(
      {
        content: '产品迭代方向：更快的搜索、更清晰的列表、更好的上下文。',
        contentType: 'text',
        isFavorite: false
      },
      { content: 'https://www.figma.com/', contentType: 'link', isFavorite: false }
    );
  raw.state.items = content.map((item, id) => ({
    id: id + 1000,
    createdAt: reference
      ? (() => {
          const date = new Date(now);
          date.setDate(date.getDate() - (id >= 5 ? 1 : 0));
          date.setHours(referenceTimes[id][0], referenceTimes[id][1], 0, 0);
          return date.getTime();
        })()
      : now - (id + 1) * 12 * 60000,
    updatedAt: now,
    useWeight: 0,
    tags: [],
    ...item
  }));
  localStorage.setItem('clipjar-storage', JSON.stringify(raw));
}
