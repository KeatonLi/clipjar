import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, shortcutPresets, withTimeout } from '../src/utils/desktop.ts';

test('shortcut recommendations follow the current OS and use supported combinations', () => {
  assert.equal(detectPlatform('MacIntel'), 'mac');
  assert.equal(detectPlatform('Win32'), 'windows');
  assert.equal(detectPlatform('Linux x86_64'), 'linux');
  assert.equal(shortcutPresets('mac')[0].label, '⌘ Shift V');
  assert.equal(shortcutPresets('windows')[0].label, 'Ctrl Shift V');
  assert.equal(shortcutPresets('mac')[1].value, 'Command+Alt+V');
  for (const platform of ['mac', 'windows', 'linux'] as const) {
    assert.ok(shortcutPresets(platform).every((preset) => preset.value.includes('+')));
  }
});

test('stalled native settings reject with a recoverable timeout', async () => {
  await assert.rejects(
    withTimeout(() => new Promise<boolean>(() => {}), 10),
    /超时/
  );
  assert.equal(await withTimeout(async () => true, 50), true, 'a subsequent retry can succeed');
});

test('native rejections and synchronous failures are propagated instead of reporting success', async () => {
  await assert.rejects(
    withTimeout(async () => {
      throw new Error('permission denied');
    }, 50),
    /permission denied/
  );
  await assert.rejects(
    withTimeout(() => {
      throw new Error('native unavailable');
    }, 50),
    /native unavailable/
  );
});
