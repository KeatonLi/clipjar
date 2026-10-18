type ShortcutSignal = 'Pressed' | 'Released';

export interface ShortcutAdapter {
  isRegistered: (key: string) => Promise<boolean>;
  register: (key: string, handler: (state: ShortcutSignal) => void) => Promise<void>;
  unregister: (key: string) => Promise<void>;
}

/** One queue owns OS registrations across rapid mode changes and React remounts. */
export function createShortcutRegistry(adapter: ShortcutAdapter) {
  interface Binding { key: string; owner: symbol; handler: (state: ShortcutSignal) => void }
  let binding: Binding | null = null;
  const registrations = new Map<string, Binding>();
  let queue: Promise<void> = Promise.resolve();

  function schedule<T>(operation: () => Promise<T>): Promise<T> {
    const task = queue.then(operation);
    queue = task.then(() => {}, () => {});
    return task;
  }

  async function releaseRegistration(current: Binding): Promise<void> {
    if (await adapter.isRegistered(current.key)) await adapter.unregister(current.key);
    // Keep failed cleanups tracked; their handlers are inactive after a switch.
    if (registrations.get(current.key) === current) registrations.delete(current.key);
    if (binding === current) binding = null;
  }

  async function cleanupInactive(): Promise<string | undefined> {
    const errors: string[] = [];
    for (const entry of registrations.values()) {
      if (entry === binding) continue;
      try { await releaseRegistration(entry); } catch (error) { errors.push(String(error)); }
    }
    return errors.length ? `新快捷键已生效，但旧快捷键暂时无法注销，将稍后重试：${errors.join('；')}` : undefined;
  }

  return {
    owns: (owner: symbol) => binding?.owner === owner,
    register(owner: symbol, key: string, handler: (state: ShortcutSignal) => void, cancelled: () => boolean, persist?: () => Promise<void>): Promise<{ changed: boolean; warning?: string }> {
      return schedule(async () => {
        if (cancelled()) return { changed: false };
        const previous = binding;
        let candidate = registrations.get(key);
        if (candidate && !await adapter.isRegistered(key)) {
          registrations.delete(key);
          if (binding === candidate) binding = null;
          candidate = undefined;
        }
        if (!candidate) {
          if (await adapter.isRegistered(key)) throw new Error('该快捷键已被占用');
          if (cancelled()) return { changed: false };
          candidate = { key, owner, handler };
          const entry = candidate;
          await adapter.register(key, state => { if (binding === entry) entry.handler(state); });
          registrations.set(key, candidate);
        }
        try {
          if (cancelled()) {
            if (candidate !== previous) await releaseRegistration(candidate);
            return { changed: false };
          }
          // The previous shortcut remains registered and usable until this commit succeeds.
          await persist?.();
        } catch (error) {
          if (candidate !== previous) {
            try { await releaseRegistration(candidate); }
            catch (cleanupError) { throw new Error(`${String(error)}；候选快捷键清理失败：${String(cleanupError)}`); }
          }
          throw error;
        }
        const changed = previous !== candidate || candidate.owner !== owner || registrations.size > 1;
        if (previous !== candidate || candidate.owner !== owner) candidate.handler = handler;
        candidate.owner = owner;
        binding = candidate;
        return { changed, warning: await cleanupInactive() };
      });
    },
    release: (owner: symbol) => schedule(async () => {
      const errors: unknown[] = [];
      for (const entry of registrations.values()) {
        if (entry.owner !== owner) continue;
        try { await releaseRegistration(entry); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new Error(errors.map(String).join('；'));
    }),
  };
}
