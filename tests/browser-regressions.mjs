import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import installNativeMock from './nativeMock.cjs';

const port = Number(process.env.CLIPJAR_TEST_PORT || 4175);
const url = `http://127.0.0.1:${port}`;
const root = fileURLToPath(new URL('..', import.meta.url));
const server = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort'
  ],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
);
let serverOutput = '';
server.stdout.on('data', (data) => {
  serverOutput += data;
});
server.stderr.on('data', (data) => {
  serverOutput += data;
});
let browser;
const artifacts = process.env.CLIPJAR_ARTIFACT_DIR;
if (artifacts) mkdirSync(artifacts, { recursive: true });
const screenshot = async (page, name) => {
  if (artifacts) await page.screenshot({ path: `${artifacts}/${name}.png` });
};
const errors = [];
const tracked = (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
};

async function seed(page, count = 170) {
  await page.addInitScript((count) => {
    const now = Date.now();
    const items = Array.from({ length: count }, (_, id) => ({
      id,
      content: `记录 ${id}：让每一段灵感，都有迹可循。`,
      contentType: 'text',
      createdAt: now - id * 1000,
      updatedAt: now,
      isFavorite: id % 3 === 0,
      note: id % 3 === 0 ? `备注 ${id}` : undefined,
      useWeight: 0,
      tags: []
    }));
    items[0].content = '这是一段需要展开查看的长文本。\n'.repeat(30) + '全文结尾验证标记';
    localStorage.setItem(
      'clipjar-storage',
      JSON.stringify({
        state: {
          items,
          settings: {
            maxHistoryItems: 500,
            autoCleanup: false,
            cleanupDays: 30,
            globalShortcut: 'CommandOrControl+Shift+V',
            startAtLogin: false,
            showPreview: true
          }
        },
        version: 0
      })
    );
  }, count);
}

try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite startup failed: ${serverOutput}`);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Wait for our server. */
    }
    if (attempt > 100) throw new Error(`Vite readiness timed out: ${serverOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CLIPJAR_CHROMIUM_PATH
      ? { executablePath: process.env.CLIPJAR_CHROMIUM_PATH }
      : existsSync('/usr/bin/chromium')
        ? { executablePath: '/usr/bin/chromium' }
        : {})
  });
  const context = await browser.newContext({
    viewport: { width: 480, height: 720 },
    locale: 'zh-CN'
  });
  const page = tracked(await context.newPage());
  await seed(page);
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 50);
  await page.locator('.clip-content-button').nth(49).focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 100);
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.clip-content-button')).indexOf(
        document.activeElement
      ) === 50
  );
  await page.keyboard.press('Space');
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByLabel('完整内容', { exact: true }).innerText(), /记录 50：/);
  await page.keyboard.press('Escape');
  while (await page.getByRole('button', { name: /加载更多/ }).count())
    await page.getByRole('button', { name: /加载更多/ }).click();
  assert.equal(await page.locator('.clipboard-row').count(), 170);
  await page.getByRole('button', { name: /收藏\s*57/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 50);
  await page.getByRole('button', { name: /加载更多/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 57);
  await page.getByRole('button', { name: /全部\s*170/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 50);
  console.log('PASS history: all 170 records accessible; keyboard crosses batch boundaries');
  await page.getByRole('searchbox').fill('记录 169');
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 1);
  assert.match(await page.locator('.clipboard-row').innerText(), /记录 169/);
  await page.getByRole('searchbox').fill('');
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 50);
  await page.locator('.clip-content-button').first().focus();
  await page.keyboard.press('Space');
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByLabel('完整内容', { exact: true }).innerText(), /全文结尾验证标记/);
  await screenshot(page, '02-full-text');
  await page.getByRole('button', { name: '复制内容', exact: true }).click();
  assert.match(await page.getByRole('dialog').getByRole('alert').innerText(), /仅桌面端/);
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement?.classList.contains('clip-content-button')),
    true
  );
  await page.keyboard.press('Control+k');
  assert.equal(
    await page.getByRole('searchbox').evaluate((element) => element === document.activeElement),
    true
  );
  await page.keyboard.press('Space');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('searchbox').fill('');
  console.log(
    'PASS preview: full text, Space, Escape focus restore, search typing, browser copy error'
  );

  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('switch', { name: '开机自启' }).isDisabled(), true);
  assert.equal(await page.getByRole('switch', { name: '窗口置顶' }).isDisabled(), true);
  assert.equal(await page.getByText('仅桌面端可用', { exact: true }).count(), 2);
  assert.equal(await page.getByText('加载中...', { exact: true }).count(), 0);
  await screenshot(page, '03-browser-settings');
  const limit = page.getByRole('spinbutton', { name: '最大记录数' });
  await limit.fill('');
  await limit.pressSequentially('150');
  assert.equal(await limit.inputValue(), '150');
  await limit.press('Tab');
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('clipjar-storage')).state.settings.maxHistoryItems
    ),
    150
  );
  await page.route('https://api.github.com/repos/KeatonLi/clipjar/releases/latest', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: '{"message":"rate limited"}'
    })
  );
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '暂时无法检查更新' }).waitFor();
  await page.keyboard.press('Escape');
  console.log(
    'PASS browser settings: no native calls or infinite loader; update failures are visible'
  );

  const mac = tracked(await context.newPage());
  await mac.addInitScript(() =>
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
  );
  await mac.goto(url);
  await mac.getByRole('button', { name: '打开设置' }).click();
  await mac.getByRole('button', { name: /⌘ Shift V/ }).waitFor();
  assert.equal(await mac.getByRole('button', { name: /Win|Ctrl Shift V/ }).count(), 0);
  await mac.close();
  console.log('PASS platform-specific macOS shortcut choices');

  const native = tracked(await context.newPage());
  await native.addInitScript(installNativeMock);
  await native.goto(url);
  await native.waitForFunction(
    () => document.querySelectorAll('.clip-image-preview img').length > 0
  );
  await native.waitForFunction(() => window.nativeMock.resources.size === 0);
  await native.evaluate(() => {
    window.nativeMock.image.rgba = [0, 0, 255, 255];
  });
  await native.waitForFunction(
    () => document.querySelectorAll('.clip-image-preview img').length === 2
  );
  await native.getByRole('button', { name: '预览完整内容' }).first().click();
  await native.getByRole('dialog').getByAltText('已保存的剪贴板图片').waitFor();
  await native.getByRole('button', { name: '实际大小', exact: true }).click();
  assert.equal(await native.locator('.preview-content.is-zoomed').count(), 1);
  await native.getByRole('button', { name: '适应窗口', exact: true }).click();
  await native.getByRole('button', { name: '复制内容', exact: true }).click();
  await native.waitForFunction(() => window.nativeMock.writes.length === 1);
  assert.deepEqual(await native.evaluate(() => window.nativeMock.writes[0].rgba), [0, 0, 255, 255]);
  await native.waitForFunction(() => window.nativeMock.resources.size === 0);
  await native.getByRole('dialog').waitFor({ state: 'hidden' });
  await native.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    window.nativeMock.image = null;
    window.nativeMock.text = 'hidden clipboard record';
  });
  await native.getByText('hidden clipboard record', { exact: true }).waitFor();
  assert.equal(
    await native.evaluate(() =>
      window.nativeMock.calls.some(
        (command) =>
          command === 'plugin:clipboard-manager|read_image' ||
          command === 'plugin:clipboard-manager|read_text'
      )
    ),
    false
  );
  assert.equal(await native.evaluate(() => localStorage.getItem('clipjar-storage')), null);
  console.log(
    'PASS native command/event adapter: file image preview/copy, hidden updates, no frontend polling'
  );

  await native.evaluate(() => {
    window.nativeMock.failStartup = true;
  });
  await native.getByRole('button', { name: '打开设置' }).click();
  await native.getByRole('button', { name: '重试开机自启' }).waitFor();
  assert.equal(await native.getByRole('switch', { name: '窗口置顶' }).isEnabled(), true);
  await native.evaluate(() => {
    window.nativeMock.failStartup = false;
  });
  await native.getByRole('button', { name: '重试开机自启' }).click();
  await native.waitForFunction(
    () => !document.querySelector('[role="switch"][aria-label="开机自启"]').disabled
  );
  await native.getByRole('switch', { name: '开机自启' }).click();
  await native.waitForFunction(() => window.nativeMock.startup === true);
  assert.equal(
    await native.getByRole('switch', { name: '开机自启' }).getAttribute('aria-checked'),
    'true'
  );
  await native.getByRole('button', { name: /Ctrl Alt V/ }).click();
  await native.waitForFunction(
    () => window.nativeMock.shortcuts.size === 1 && window.nativeMock.shortcuts.has('Control+Alt+V')
  );
  await native.evaluate(() => {
    const callback = window.nativeMock.shortcuts.get('Control+Alt+V').onmessage;
    callback({ state: 'Pressed' });
    callback({ state: 'Pressed' });
    callback({ state: 'Released' });
  });
  await native.waitForFunction(() => window.nativeMock.shown === 1);
  console.log(
    'PASS settings: independent failures, retry, persisted native toggle and shortcut event cleanup'
  );
  await native.getByRole('button', { name: '关闭设置' }).click();
  await native.evaluate(() => {
    window.nativeMock.hangStartup = true;
  });
  await native.getByRole('button', { name: '打开设置' }).click();
  await native.getByRole('button', { name: '重试开机自启' }).waitFor({ timeout: 8000 });
  console.log('PASS native setting timeout exits loading and exposes retry');

  await native.getByRole('button', { name: '关闭设置' }).click();
  await native.getByRole('button', { name: '暂停', exact: true }).click();
  await native.getByRole('button', { name: '直到手动恢复', exact: true }).click();
  await native.getByText('已暂停记录', { exact: true }).waitFor();
  await screenshot(native, '06-privacy-pause');
  await native.evaluate(() => {
    window.nativeMock.text = 'private data never saved';
    window.nativeMock.record();
  });
  assert.equal(
    await native.evaluate(() =>
      window.nativeMock.db.items.some((item) => item.content === 'private data never saved')
    ),
    false
  );
  await native.getByRole('button', { name: '恢复记录', exact: true }).click();
  await native.waitForFunction(() => window.nativeMock.db.pauseUntil === null);
  await native.evaluate(() => window.nativeMock.record());
  assert.equal(
    await native.evaluate(() =>
      window.nativeMock.db.items.some((item) => item.content === 'private data never saved')
    ),
    false
  );
  await native.evaluate(() => {
    window.nativeMock.text = 'after privacy pause';
    window.nativeMock.record();
  });
  await native.getByText('after privacy pause', { exact: true }).waitFor();
  const deleteRow = native.getByRole('listitem').filter({ hasText: 'after privacy pause' });
  await deleteRow.getByRole('button', { name: '删除记录' }).click();
  await native.getByRole('button', { name: /撤销/ }).waitFor();
  assert.equal(await native.getByText('after privacy pause', { exact: true }).count(), 0);
  await screenshot(native, '07-delete-undo');
  await native.getByRole('button', { name: /撤销/ }).click();
  await native.getByText('after privacy pause', { exact: true }).waitFor();
  const countBefore = await native.locator('.clipboard-row').count();
  await native.evaluate(() =>
    window.nativeMock.emit('history-changed', { ...window.nativeMock.db, revision: 0, items: [] })
  );
  assert.equal(await native.locator('.clipboard-row').count(), countBefore);
  console.log(
    'PASS privacy pause, no catch-up, delete/undo, stale event rejection and no browser persistence of native records'
  );

  const migration = tracked(await browser.newPage({ viewport: { width: 480, height: 720 } }));
  await seed(migration, 5);
  await migration.addInitScript(installNativeMock);
  await migration.addInitScript(() => {
    window.nativeMock.migrationFails = true;
  });
  await migration.goto(url);
  await migration.getByRole('alert').filter({ hasText: '旧记录迁移失败' }).waitFor();
  assert.notEqual(await migration.evaluate(() => localStorage.getItem('clipjar-storage')), null);
  await migration.evaluate(() => {
    window.nativeMock.migrationFails = false;
  });
  await migration.getByRole('button', { name: '重新连接' }).click();
  await migration.waitForFunction(() => localStorage.getItem('clipjar-storage') === null);
  assert.ok(
    await migration.getByText('记录 1：让每一段灵感，都有迹可循。', { exact: true }).count()
  );
  console.log(
    'PASS failed migration preserves old cache and successful retry removes it only after committed response'
  );

  const sample = tracked(
    await browser.newPage({ viewport: { width: 480, height: 720 }, locale: 'zh-CN' })
  );
  await seed(sample, 5);
  await sample.goto(url);
  await sample.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 5);
  await screenshot(sample, '01-main');
  await sample.getByRole('button', { name: '打开设置' }).click();
  await screenshot(sample, '04-settings');
  await sample.setViewportSize({ width: 420, height: 600 });
  const bounds = await sample.getByRole('dialog').boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 420 &&
      bounds.y + bounds.height <= 600
  );
  await sample.keyboard.press('Shift+Tab');
  assert.equal(
    await sample
      .getByRole('dialog')
      .evaluate((element) => element.contains(document.activeElement)),
    true
  );
  await sample.keyboard.press('Tab');
  assert.equal(
    await sample
      .getByRole('dialog')
      .evaluate((element) => element.contains(document.activeElement)),
    true
  );
  await screenshot(sample, '05-small-settings');
  assert.deepEqual(errors, []);
  console.log('PASS 420x600 modal bounds, focus containment, and no uncaught page errors');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
