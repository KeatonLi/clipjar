/** Standalone, synthetic data for the selected cobalt design and inspector regression. */
export default function installCobaltPreview() {
  const now = Date.now();
  const items = [
    {
      id: 2001,
      content: '周五发布前确认：快捷键、数据迁移、图片复制，并准备更新日志。',
      contentType: 'text',
      isFavorite: false
    },
    { id: 2002, content: 'https://linear.app/method', contentType: 'link', isFavorite: false },
    {
      id: 2003,
      content: '[图片 1683x935]',
      contentType: 'image',
      imagePath: '/tests/fixtures/architecture.png',
      imageWidth: 1683,
      imageHeight: 935,
      isFavorite: true
    }
  ].map((item, index) => ({
    createdAt: now - index * 180000,
    updatedAt: now,
    useWeight: 0,
    tags: [],
    ...item
  }));
  localStorage.setItem(
    'clipjar-storage',
    JSON.stringify({
      state: {
        items,
        settings: {
          maxHistoryItems: 100,
          autoCleanup: false,
          cleanupDays: 30,
          globalShortcut: 'CommandOrControl+Shift+V',
          startAtLogin: false,
          showPreview: true
        }
      },
      version: 0
    })
  );
}
