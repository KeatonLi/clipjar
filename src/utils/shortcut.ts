/** Ignore release/repeat events so a single physical key press counts only once. */
export function createShortcutHandler(doublePress: boolean, activate: () => void, now = Date.now) {
  let down = false;
  let firstPress: number | null = null;
  return (event: { state: 'Pressed' | 'Released' }) => {
    if (event.state === 'Released') {
      down = false;
      return;
    }
    if (down) return;
    down = true;
    if (!doublePress) {
      activate();
      return;
    }
    const time = now();
    if (firstPress !== null && time - firstPress < 500) {
      firstPress = null;
      activate();
    } else {
      firstPress = time;
    }
  };
}
