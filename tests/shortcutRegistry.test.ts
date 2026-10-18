import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutRegistry, type ShortcutAdapter } from '../src/hooks/shortcutRegistry.ts';

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
