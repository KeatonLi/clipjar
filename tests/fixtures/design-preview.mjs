/** Synthetic local data used only in screenshot and layout checks. */
export default function installDesignPreview() {
  const raw = JSON.parse(localStorage.getItem('clipjar-storage'));
  const now = Date.now();
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8eddf';
  ctx.fillRect(0, 0, 480, 180);
  ctx.fillStyle = '#d4dec5';
  ctx.beginPath();
  ctx.arc(421, 40, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b5c7a4';
  ctx.beginPath();
  ctx.arc(418, 204, 137, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#486143';
  ctx.font = '11px sans-serif';
  ctx.fillText('A LITTLE SPACE FOR IDEAS', 28, 39);
  ctx.font = '32px Georgia, serif';
  ctx.fillText('Less, but better.', 28, 91);
  ctx.fillStyle = '#7b8b6d';
  ctx.font = '12px sans-serif';
  ctx.fillText('Collect what matters.', 29, 122);
  raw.state.items = [
    {
      content: '留一点空间，给真正重要的事。\n整理灵感，也整理思绪。',
      contentType: 'text',
      isFavorite: true,
      note: '新项目的开场文案'
    },
    {
      content: 'https://linear.app/method',
      contentType: 'link',
      isFavorite: false
    },
    {
      content: 'const ideas = clips.filter(clip =>\n  clip.isFavorite\n);',
      contentType: 'code',
      isFavorite: false
    },
    {
      content: '[图片 480x180]',
      contentType: 'image',
      imagePath: canvas.toDataURL('image/png'),
      imageWidth: 480,
      imageHeight: 180,
      isFavorite: false
    },
    {
      content: '周五前完成：交互走查、图标整理、发布检查。',
      contentType: 'text',
      isFavorite: false
    }
  ].map((item, id) => ({
    id: id + 1000,
    createdAt: now - (id + 1) * 12 * 60_000,
    updatedAt: now,
    useWeight: 0,
    tags: [],
    ...item
  }));
  localStorage.setItem('clipjar-storage', JSON.stringify(raw));
}
