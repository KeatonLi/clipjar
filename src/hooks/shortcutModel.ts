export interface ShortcutDefinition {
  key: string;
  doublePress: boolean;
}

export function resolveShortcut(mode: string): ShortcutDefinition {
  const trimmed = mode.trim();
  const key = trimmed.toLowerCase();
  if (['win', 'super', 'cmd', 'command'].includes(key)) return { key: 'Super', doublePress: true };
  if (['option', 'alt'].includes(key)) return { key: 'Option', doublePress: true };
  return { key: trimmed, doublePress: false };
}

/** Releases reset key state; only distinct presses can activate a shortcut. */
export function createShortcutTrigger(doublePress: boolean, activate: () => void, currentTime = Date.now) {
  let down = false;
  let firstPress: number | null = null;
  return (state: 'Pressed' | 'Released') => {
    if (state === 'Released') { down = false; return; }
    if (down) return;
    down = true;
    if (!doublePress) { activate(); return; }
    const now = currentTime();
    if (firstPress !== null && now - firstPress <= 500) {
      firstPress = null;
      activate();
    } else firstPress = now;
  };
}
