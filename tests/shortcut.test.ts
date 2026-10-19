import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutHandler } from '../src/utils/shortcut.ts';

test('single shortcuts activate once per physical press, ignoring releases and repeat events', () => {
  let activations = 0;
  const handler = createShortcutHandler(false, () => { activations++; });
  handler({ state: 'Pressed' });
  handler({ state: 'Pressed' });
  handler({ state: 'Released' });
  assert.equal(activations, 1);
  handler({ state: 'Pressed' });
  assert.equal(activations, 2);
});

test('one press and release does not count as a double press', () => {
  let activations = 0;
  let time = 0;
  const handler = createShortcutHandler(true, () => { activations++; }, () => time);
  handler({ state: 'Pressed' });
  time = 80;
  handler({ state: 'Released' });
  assert.equal(activations, 0);
  time = 150;
  handler({ state: 'Pressed' });
  assert.equal(activations, 1);
  handler({ state: 'Released' });
  time = 200;
  handler({ state: 'Pressed' });
  assert.equal(activations, 1, 'successful pairs reset double-press state');
});

test('holding a modifier cannot imitate a double press and expired presses start a new pair', () => {
  let activations = 0;
  let time = 0;
  const handler = createShortcutHandler(true, () => { activations++; }, () => time);
  handler({ state: 'Pressed' });
  time = 100;
  handler({ state: 'Pressed' });
  assert.equal(activations, 0);
  handler({ state: 'Released' });
  time = 700;
  handler({ state: 'Pressed' });
  assert.equal(activations, 0);
  handler({ state: 'Released' });
  time = 800;
  handler({ state: 'Pressed' });
  assert.equal(activations, 1);
});
