import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutRegistry, type ShortcutAdapter } from '../src/hooks/shortcutRegistry.ts';
import { createShortcutTrigger } from '../src/hooks/shortcutModel.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function fakeAdapter() {
  const registered = new Set<string>();
  const calls: string[] = [];
  const handlers = new Map<string, (state: 'Pressed' | 'Released') => void>();
  const adapter: ShortcutAdapter = {
    isRegistered: async key => registered.has(key),
    register: async (key, handler) => { calls.push(`register:${key}`); registered.add(key); handlers.set(key, handler); },
    unregister: async key => { calls.push(`unregister:${key}`); registered.delete(key); },
  };
  return { adapter, registered, calls, handlers };
}

test('a mode switch during an in-flight registration unregisters the obsolete binding before registering the latest', async () => {
  const fake = fakeAdapter();
  const started = deferred();
  const finish = deferred();
  const register = fake.adapter.register;
  fake.adapter.register = async (key, handler) => {
    await register(key, handler);
    if (key === 'A') { started.resolve(); await finish.promise; }
  };
  const registry = createShortcutRegistry(fake.adapter);
  const firstOwner = Symbol('A');
  const secondOwner = Symbol('B');
  let cancelled = false;
  let obsoleteEvents = 0;
  const first = registry.register(firstOwner, 'A', () => { obsoleteEvents++; }, () => cancelled);
  await started.promise;
  cancelled = true;
  const cleanup = registry.release(firstOwner);
  const second = registry.register(secondOwner, 'B', () => {}, () => false);
  assert.deepEqual(fake.calls, ['register:A']);
  finish.resolve();
  await Promise.all([first, cleanup, second]);
  fake.handlers.get('A')!('Pressed');
  assert.equal(obsoleteEvents, 0);
  assert.deepEqual(fake.calls, ['register:A', 'unregister:A', 'register:B']);
  assert.deepEqual([...fake.registered], ['B']);
  assert.equal(registry.owns(secondOwner), true);
});

test('React-style cancellation before registration starts skips obsolete work and cleanup cannot remove another owner', async () => {
  const fake = fakeAdapter();
  const registry = createShortcutRegistry(fake.adapter);
  const obsolete = Symbol('obsolete');
  const current = Symbol('current');
  await registry.register(obsolete, 'A', () => {}, () => true);
  await registry.register(current, 'B', () => {}, () => false);
  await registry.release(obsolete);
  assert.deepEqual(fake.calls, ['register:B']);
  assert.equal(registry.owns(current), true);
});

test('a failed OS unregister keeps ownership and retries before the next registration', async () => {
  const fake = fakeAdapter();
  const unregister = fake.adapter.unregister;
  let attempts = 0;
  fake.adapter.unregister = async key => {
    if (++attempts === 1) throw new Error('temporary OS error');
    await unregister(key);
  };
  const registry = createShortcutRegistry(fake.adapter);
  const first = Symbol('A');
  const second = Symbol('B');
  await registry.register(first, 'A', () => {}, () => false);
  await assert.rejects(registry.release(first), /temporary/);
  assert.equal(registry.owns(first), true);
  await registry.register(second, 'B', () => {}, () => false);
  assert.deepEqual([...fake.registered], ['B']);
  assert.equal(attempts, 2);
});

test('occupied shortcuts reject without taking ownership or deleting another registration', async () => {
  const fake = fakeAdapter();
  fake.registered.add('occupied');
  const registry = createShortcutRegistry(fake.adapter);
  const owner = Symbol('owner');
  await assert.rejects(registry.register(owner, 'occupied', () => {}, () => false), /占用/);
  assert.deepEqual(fake.calls, []);
  assert.equal(registry.owns(owner), false);
  assert.deepEqual([...fake.registered], ['occupied']);
});

test('an OS registration rejection leaves the previous shortcut usable and never persists the failed mode', async () => {
  const fake = fakeAdapter();
  const register = fake.adapter.register;
  fake.adapter.register = async (key, handler) => {
    if (key === 'B') throw new Error('OS shortcut occupied');
    await register(key, handler);
  };
  const registry = createShortcutRegistry(fake.adapter);
  const owner = Symbol('window');
  let activated = 0;
  let setting = 'A';
  await registry.register(owner, 'A', () => { activated++; }, () => false);
  await assert.rejects(registry.register(owner, 'B', () => {}, () => false, async () => { setting = 'B'; }), /OS shortcut occupied/);
  fake.handlers.get('A')!('Pressed');
  assert.equal(setting, 'A');
  assert.equal(activated, 1);
  assert.equal(registry.owns(owner), true);
  assert.deepEqual([...fake.registered], ['A']);
});

test('an occupied candidate is rejected before committing settings while the old binding remains active', async () => {
  const fake = fakeAdapter();
  const registry = createShortcutRegistry(fake.adapter);
  const owner = Symbol('window');
  let activated = 0;
  let persisted = false;
  await registry.register(owner, 'A', () => { activated++; }, () => false);
  fake.registered.add('B');
  await assert.rejects(registry.register(owner, 'B', () => {}, () => false, async () => { persisted = true; }), /占用/);
  fake.handlers.get('A')!('Pressed');
  assert.equal(persisted, false);
  assert.equal(activated, 1);
  assert.deepEqual(fake.calls, ['register:A']);
});

test('failed settings persistence rolls back the candidate without ever unregistering the usable shortcut', async () => {
  const fake = fakeAdapter();
  const registry = createShortcutRegistry(fake.adapter);
  const owner = Symbol('window');
  let oldActivations = 0;
  let candidateActivations = 0;
  await registry.register(owner, 'A', () => { oldActivations++; }, () => false);
  await assert.rejects(registry.register(owner, 'B', () => { candidateActivations++; }, () => false, async () => {
    fake.handlers.get('A')!('Pressed');
    fake.handlers.get('B')!('Pressed');
    throw new Error('disk full');
  }), /disk full/);
  fake.handlers.get('A')!('Pressed');
  assert.equal(oldActivations, 2);
  assert.equal(candidateActivations, 0);
  assert.deepEqual([...fake.registered], ['A']);
  assert.deepEqual(fake.calls, ['register:A', 'register:B', 'unregister:B']);
});

test('a successful change keeps the old shortcut active until settings are durable then activates only the new one', async () => {
  const fake = fakeAdapter();
  const registry = createShortcutRegistry(fake.adapter);
  const owner = Symbol('window');
  const started = deferred();
  const finish = deferred();
  let oldActivations = 0;
  let newActivations = 0;
  let setting = 'A';
  await registry.register(owner, 'A', () => { oldActivations++; }, () => false);
  const change = registry.register(owner, 'B', () => { newActivations++; }, () => false, async () => { started.resolve(); await finish.promise; setting = 'B'; });
  await started.promise;
  fake.handlers.get('A')!('Pressed');
  fake.handlers.get('B')!('Pressed');
  assert.equal(setting, 'A');
  assert.equal(oldActivations, 1);
  assert.equal(newActivations, 0);
  finish.resolve();
  await change;
  fake.handlers.get('A')!('Pressed');
  fake.handlers.get('B')!('Pressed');
  assert.equal(setting, 'B');
  assert.equal(oldActivations, 1);
  assert.equal(newActivations, 1);
  assert.deepEqual(fake.calls, ['register:A', 'register:B', 'unregister:A']);
  assert.deepEqual([...fake.registered], ['B']);
});

test('a queued newer change waits for failed persistence rollback and cannot resurrect an obsolete binding', async () => {
  const fake = fakeAdapter();
  const registry = createShortcutRegistry(fake.adapter);
  const owner = Symbol('window');
  const started = deferred();
  const finish = deferred();
  let setting = 'A';
  let obsoleteActivations = 0;
  let currentActivations = 0;
  await registry.register(owner, 'A', () => { obsoleteActivations++; }, () => false);
  const first = registry.register(owner, 'B', () => { obsoleteActivations++; }, () => false, async () => { started.resolve(); await finish.promise; throw new Error('save failed'); });
  const rejected = assert.rejects(first, /save failed/);
  await started.promise;
  const latest = registry.register(owner, 'C', () => { currentActivations++; }, () => false, async () => { setting = 'C'; });
  assert.deepEqual(fake.calls, ['register:A', 'register:B']);
  finish.resolve();
  await rejected;
  await latest;
  fake.handlers.get('A')!('Pressed');
  fake.handlers.get('B')!('Pressed');
  fake.handlers.get('C')!('Pressed');
  assert.equal(setting, 'C');
  assert.equal(obsoleteActivations, 0);
  assert.equal(currentActivations, 1);
  assert.deepEqual(fake.calls, ['register:A', 'register:B', 'unregister:B', 'register:C', 'unregister:A']);
  assert.deepEqual([...fake.registered], ['C']);
});

test('failed old-key cleanup reports a warning, disables the old handler and retries its tracked registration', async () => {
  const fake = fakeAdapter();
  const unregister = fake.adapter.unregister;
  let fail = true;
  fake.adapter.unregister = async key => {
    if (key === 'A' && fail) throw new Error('OS unregister failed');
    await unregister(key);
  };
  const registry = createShortcutRegistry(fake.adapter);
  const owner = Symbol('window');
  let oldActivations = 0;
  let newActivations = 0;
  let setting = 'A';
  await registry.register(owner, 'A', () => { oldActivations++; }, () => false);
  const changed = await registry.register(owner, 'B', () => { newActivations++; }, () => false, async () => { setting = 'B'; });
  assert.match(changed.warning!, /OS unregister failed/);
  fake.handlers.get('A')!('Pressed');
  fake.handlers.get('B')!('Pressed');
  assert.equal(setting, 'B');
  assert.equal(oldActivations, 0);
  assert.equal(newActivations, 1);
  fail = false;
  const reconciled = await registry.register(owner, 'B', () => {}, () => false);
  assert.equal(reconciled.warning, undefined);
  assert.equal(reconciled.changed, true);
  assert.deepEqual([...fake.registered], ['B']);
});

test('settings reconciliation does not reset an already-held shortcut trigger', async () => {
  const fake = fakeAdapter();
  const registry = createShortcutRegistry(fake.adapter);
  const owner = Symbol('window');
  let activations = 0;
  await registry.register(owner, 'A', createShortcutTrigger(false, () => { activations++; }), () => false);
  fake.handlers.get('A')!('Pressed');
  await registry.register(owner, 'A', createShortcutTrigger(false, () => { activations++; }), () => false);
  fake.handlers.get('A')!('Pressed');
  assert.equal(activations, 1);
  fake.handlers.get('A')!('Released');
  fake.handlers.get('A')!('Pressed');
  assert.equal(activations, 2);
});

test('cleanup from a previous React owner cannot remove the same key adopted by a remounted owner', async () => {
  const fake = fakeAdapter();
  const registry = createShortcutRegistry(fake.adapter);
  const previous = Symbol('previous mount');
  const current = Symbol('current mount');
  let obsoleteActivations = 0;
  let currentActivations = 0;
  await registry.register(previous, 'A', () => { obsoleteActivations++; }, () => false);
  await registry.register(current, 'A', () => { currentActivations++; }, () => false);
  await registry.release(previous);
  fake.handlers.get('A')!('Pressed');
  assert.equal(obsoleteActivations, 0);
  assert.equal(currentActivations, 1);
  assert.equal(registry.owns(current), true);
  assert.deepEqual([...fake.registered], ['A']);
});
