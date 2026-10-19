import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipboardMonitor, writeClipboardItem, type NativeImage } from '../src/utils/clipboard.ts';
import type { ClipboardItem } from '../src/types';

const noImage = async (): Promise<NativeImage> => { throw new Error('no image'); };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
function fixture() {
  let closes = 0;
  let pixel = 10;
  const texts: string[] = [];
  const images: { width: number; height: number; dataUrl: string }[] = [];
  const errors: unknown[] = [];
  const options = {
    readText: async () => 'copied text',
    readImage: async (): Promise<NativeImage> => ({
      size: async () => ({ width: 1, height: 1 }),
      rgba: async () => new Uint8Array([pixel, 0, 0, 255]),
      close: async () => { closes++; },
    }),
    encodeImage: async (image: { rgba(): Promise<Uint8Array> }) => {
      const bytes = await image.rgba();
      const encoded = `data:image/png;base64,${bytes[0]}`;
      bytes.fill(0); // Existing canvas encoders clear their temporary buffers.
      return encoded;
    },
    onText: (text: string) => { texts.push(text); },
    onImage: (image: { width: number; height: number; dataUrl: string }) => { images.push(image); },
    onError: (error: unknown) => { errors.push(error); },
  };
  return { options, texts, images, errors, closes: () => closes, setPixel: (value: number) => { pixel = value; } };
}

test('Tauri method-based images are captured and every poll releases its native handle', async () => {
  const f = fixture();
  const monitor = createClipboardMonitor(f.options);
  await monitor.poll();
  await monitor.poll();
  assert.deepEqual(f.images, [{ width: 1, height: 1, dataUrl: 'data:image/png;base64,10' }]);
  assert.deepEqual(f.texts, ['copied text']);
  assert.equal(f.closes(), 2);
  assert.deepEqual(f.errors, []);
});

test('different images with the same dimensions are both recorded', async () => {
  const f = fixture();
  const monitor = createClipboardMonitor(f.options);
  await monitor.poll();
  f.setPixel(20);
  await monitor.poll();
  assert.equal(f.images.length, 2);
  assert.notEqual(f.images[0].dataUrl, f.images[1].dataUrl);
});

test('an image-only clipboard is captured even when reading text fails', async () => {
  const f = fixture();
  f.options.readText = async () => { throw new Error('no text'); };
  await createClipboardMonitor(f.options).poll();
  assert.equal(f.images.length, 1);
  assert.equal(f.closes(), 1);
});

test('oversized and unencodable images still release their native handles', async () => {
  for (const failure of ['oversized', 'size', 'rgba', 'encode']) {
    const f = fixture();
    const read = f.options.readImage;
    f.options.readImage = async () => {
      const image = await read();
      if (failure === 'oversized') image.size = async () => ({ width: 5000, height: 5000 });
      if (failure === 'size') image.size = async () => { throw new Error('size failed'); };
      if (failure === 'rgba') image.rgba = async () => { throw new Error('pixels failed'); };
      return image;
    };
    if (failure === 'encode') f.options.encodeImage = async () => { throw new Error('encode failed'); };
    await createClipboardMonitor(f.options).poll();
    assert.equal(f.closes(), 1, failure);
    assert.equal(f.images.length, 0, failure);
  }
});

test('failed conversion can retry the same image on the next poll', async () => {
  const f = fixture();
  const encode = f.options.encodeImage;
  let attempts = 0;
  f.options.encodeImage = async image => {
    if (++attempts === 1) throw new Error('temporary canvas error');
    return encode(image);
  };
  const monitor = createClipboardMonitor(f.options);
  await monitor.poll();
  await monitor.poll();
  assert.equal(f.images.length, 1);
  assert.equal(f.closes(), 2);
});

test('stopping an in-flight image read releases its result without saving it', async () => {
  const f = fixture();
  const pending = deferred<NativeImage>();
  const requested = deferred<void>();
  const image = await f.options.readImage();
  f.options.readImage = () => { requested.resolve(); return pending.promise; };
  const monitor = createClipboardMonitor(f.options);
  const poll = monitor.poll();
  await requested.promise;
  monitor.stop();
  pending.resolve(image);
  await poll;
  assert.equal(f.images.length, 0);
  assert.equal(f.closes(), 1);
  // Also exercise acquisition already underway before cancellation.
  const g = fixture();
  const size = deferred<{ width: number; height: number }>();
  const acquired = deferred<void>();
  const originalRead = g.options.readImage;
  g.options.readImage = async () => {
    const image = await originalRead();
    image.size = () => { acquired.resolve(); return size.promise; };
    return image;
  };
  const next = createClipboardMonitor(g.options);
  const inFlight = next.poll();
  await acquired.promise;
  next.stop();
  size.resolve({ width: 1, height: 1 });
  await inFlight;
  assert.equal(g.closes(), 1);
  assert.equal(g.images.length, 0);
});

test('overlapping polls do not duplicate clipboard records', async () => {
  const f = fixture();
  const pending = deferred<string>();
  f.options.readText = () => pending.promise;
  const monitor = createClipboardMonitor(f.options);
  const first = monitor.poll();
  await monitor.poll();
  pending.resolve('text');
  await first;
  assert.equal(f.texts.length, 1);
  assert.equal(f.images.length, 1);
});

test('monitor captures successive text records without requiring a visible document', async () => {
  const f = fixture();
  f.options.readImage = noImage;
  let text = 'first';
  f.options.readText = async () => text;
  const monitor = createClipboardMonitor(f.options);
  await monitor.poll();
  text = 'background copy';
  await monitor.poll();
  monitor.markTextCopied('our own copy');
  text = 'our own copy';
  await monitor.poll();
  assert.deepEqual(f.texts, ['first', 'background copy']);
});

const imageItem = { contentType: 'image', content: '[图片 1x1]', imagePath: 'data:image/jpeg;base64,old' } as ClipboardItem;
function writer() {
  const calls: string[] = [];
  const image: NativeImage = { size: async () => ({ width: 1, height: 1 }), rgba: async () => new Uint8Array(4), close: async () => { calls.push('close'); } };
  const options = {
    writeText: async (text: string) => { calls.push(`text:${text}`); },
    decodeImage: async (source: string) => { calls.push(`decode:${source}`); return { rgba: new Uint8Array([1, 2, 3, 255]), width: 1, height: 1 }; },
    createImage: async (rgba: Uint8Array, width: number, height: number) => {
      assert.deepEqual([...rgba], [1, 2, 3, 255]);
      assert.equal(width, 1); assert.equal(height, 1);
      calls.push('create'); return image;
    },
    writeImage: async (actual: NativeImage) => { assert.equal(actual, image); calls.push('write'); },
  };
  return { calls, options };
}

test('copying an image writes decoded pixels and releases the handle, without writing its label', async () => {
  const f = writer();
  await writeClipboardItem(imageItem, f.options);
  assert.deepEqual(f.calls, [`decode:${imageItem.imagePath}`, 'create', 'write', 'close']);
});

test('failed image writes release their handle and reject instead of reporting success', async () => {
  const f = writer();
  f.options.writeImage = async () => { throw new Error('clipboard busy'); };
  await assert.rejects(writeClipboardItem(imageItem, f.options), /clipboard busy/);
  assert.equal(f.calls.at(-1), 'close');
});

test('missing image payloads fail without changing the system clipboard', async () => {
  const f = writer();
  await assert.rejects(writeClipboardItem({ ...imageItem, imagePath: undefined }, f.options), /无图片数据/);
  assert.deepEqual(f.calls, []);
});

test('ordinary text copies retain their original contents', async () => {
  const f = writer();
  await writeClipboardItem({ contentType: 'text', content: 'unchanged\n中文' } as ClipboardItem, f.options);
  assert.deepEqual(f.calls, ['text:unchanged\n中文']);
});
