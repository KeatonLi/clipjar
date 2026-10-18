import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutTrigger, resolveShortcut } from '../src/hooks/shortcutModel.ts';

test('legacy modifiers map to double-press definitions and normal combinations stay exact', () => {
  assert.deepEqual(resolveShortcut(' Win '), { key: 'Super', doublePress: true });
  assert.deepEqual(resolveShortcut('Option'), { key: 'Option', doublePress: true });
  assert.deepEqual(resolveShortcut('CommandOrControl+Shift+V'), { key: 'CommandOrControl+Shift+V', doublePress: false });
});

test('one press and release never count as a double press', () => {
  let activations = 0;
  const trigger = createShortcutTrigger(true, () => { activations++; }, () => 1000);
  trigger('Pressed');
  trigger('Released');
  assert.equal(activations, 0);
});

test('a held key with repeated press events cannot falsely activate double press', () => {
  let activations = 0;
  let now = 1000;
  const trigger = createShortcutTrigger(true, () => { activations++; }, () => now);
  trigger('Pressed');
  now += 200;
  trigger('Pressed');
  trigger('Released');
  assert.equal(activations, 0);
});

test('two distinct presses within 500ms activate exactly once', () => {
  let activations = 0;
  let now = 1000;
  const trigger = createShortcutTrigger(true, () => { activations++; }, () => now);
  trigger('Pressed');
  trigger('Released');
  now += 400;
  trigger('Pressed');
  trigger('Released');
  assert.equal(activations, 1);
});

test('presses outside the double-press window do not activate', () => {
  let activations = 0;
  let now = 1000;
  const trigger = createShortcutTrigger(true, () => { activations++; }, () => now);
  trigger('Pressed');
  trigger('Released');
  now += 501;
  trigger('Pressed');
  trigger('Released');
  assert.equal(activations, 0);
});

test('standard shortcuts activate once per press cycle and ignore releases', () => {
  let activations = 0;
  const trigger = createShortcutTrigger(false, () => { activations++; });
  trigger('Pressed');
  trigger('Pressed');
  trigger('Released');
  assert.equal(activations, 1);
  trigger('Pressed');
  trigger('Released');
  assert.equal(activations, 2);
});
