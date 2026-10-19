export type DesktopPlatform = 'mac' | 'windows' | 'linux';

export function detectPlatform(platform: string): DesktopPlatform {
  return /mac|iphone|ipad/i.test(platform) ? 'mac' : /win/i.test(platform) ? 'windows' : 'linux';
}

export function shortcutPresets(platform: DesktopPlatform) {
  return [
    {
      value: 'CommandOrControl+Shift+V',
      label: platform === 'mac' ? '⌘ Shift V' : 'Ctrl Shift V',
      description: '推荐 · 快速唤起剪贴记录'
    },
    {
      value: platform === 'mac' ? 'Command+Alt+V' : 'Control+Alt+V',
      label: platform === 'mac' ? '⌘ Option V' : 'Ctrl Alt V',
      description: '备用组合键'
    }
  ];
}

/** A stalled native call must not leave settings permanently loading. */
export async function withTimeout<T>(operation: () => Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('操作超时，请重试。')), milliseconds);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
