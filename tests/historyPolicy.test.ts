import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeClipboardItem,
  capturePaused,
  snapshotIsCurrent
} from '../src/stores/historyPolicy.ts';
import type { ClipboardItem } from '../src/types';
const item = (id: number, content: string) =>
  ({
    id,
    content,
    contentType: 'text',
    createdAt: id,
    updatedAt: id,
    isFavorite: false,
    useWeight: 0,
    tags: []
  }) as ClipboardItem;
test('repeated text moves to the front while preserving its ID, favorite and notes', () => {
  const old = { ...item(1, 'same'), isFavorite: true, note: 'keep', tags: ['tag'] };
  const result = mergeClipboardItem([item(2, 'other'), old], item(3, 'same'));
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].createdAt, 3);
  assert.equal(result[0].note, 'keep');
  assert.equal(result[0].isFavorite, true);
  assert.deepEqual(result[0].tags, ['tag']);
});
test('same-size image labels do not merge different payloads', () => {
  const first = { ...item(1, '[图片 1x1]'), imagePath: 'data:image/png;base64,AAA' };
  assert.equal(
    mergeClipboardItem([first], { ...first, id: 2, imagePath: 'data:image/png;base64,BBB' }).length,
    2
  );
});
test('manual pause never expires and timed pause has a precise boundary', () => {
  assert.equal(capturePaused(0, 100000), true);
  assert.equal(capturePaused(100, 99), true);
  assert.equal(capturePaused(100, 100), false);
  assert.equal(capturePaused(null, 100), false);
});
test('late native snapshots cannot overwrite a newer database revision', () => {
  assert.equal(snapshotIsCurrent(3, 4), false);
  assert.equal(snapshotIsCurrent(4, 4), true);
  assert.equal(snapshotIsCurrent(5, 4), true);
  assert.equal(snapshotIsCurrent(NaN, 4), false);
});
