type ShortcutSignal = 'Pressed' | 'Released';

export interface ShortcutAdapter {
  isRegistered: (key: string) => Promise<boolean>;
  register: (key: string, handler: (state: ShortcutSignal) => void) => Promise<void>;
  unregister: (key: string) => Promise<void>;
}

/** One queue owns OS registrations across rapid mode changes and React remounts. */
export function createShortcutRegistry(adapter: ShortcutAdapter) {
  let binding: { key: string; owner: symbol } | null = null;
  let queue: Promise<void> = Promise.resolve();

  function schedule(operation: () => Promise<void>): Promise<void> {
    const task = queue.then(operation);
    queue = task.catch(() => {});
    return task;
  }

  async function releaseCurrent(owner?: symbol): Promise<void> {
    const current = binding;
    if (!current || (owner && current.owner !== owner)) return;
    if (await adapter.isRegistered(current.key)) await adapter.unregister(current.key);
    // Failed unregister leaves ownership intact so a subsequent task can retry.
    if (binding === current) binding = null;
  }

  return {
    owns: (owner: symbol) => binding?.owner === owner,
    register(owner: symbol, key: string, handler: (state: ShortcutSignal) => void, cancelled: () => boolean): Promise<void> {
      return schedule(async () => {
        if (cancelled()) return;
        await releaseCurrent();
        if (cancelled()) return;
        if (await adapter.isRegistered(key)) throw new Error('该快捷键已被占用');
        if (cancelled()) return;
        await adapter.register(key, state => {
          if (!cancelled() && binding?.owner === owner) handler(state);
        });
        binding = { key, owner };
      });
    },
    release: (owner: symbol) => schedule(() => releaseCurrent(owner)),
  };
}
