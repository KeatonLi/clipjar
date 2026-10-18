/* Browser coverage for the built UI. Native clipboard capture is checked separately. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts', 'ui');
const origin = 'http://127.0.0.1:1420';
const now = Date.now();
const defaults = { maxHistoryItems: 100, autoCleanup: true, cleanupDays: 30, globalShortcut: 'CommandOrControl+Shift+V', startAtLogin: false, showPreview: true };
const record = (id, content, contentType, extra = {}) => ({ id, content, contentType, createdAt: now - id * 60000, updatedAt: now - id * 60000, isFavorite: false, isSnippet: false, useWeight: 0, tags: [], ...extra });
const tailText = '项目记录与讨论。'.repeat(70) + '\n后段关键词：检索验收，保留完整上下文。';
const fixtures = [
  record(1, '这周先完成剪贴采集、常用片段和图片恢复，再一起看体验。', 'text', { note: '下一版计划' }),
  record(2, 'https://github.com/KeatonLi/clipjar', 'link', { isFavorite: true, note: '项目仓库' }),
  record(3, 'const greeting = (name: string) => `你好，${name}`;\nconsole.log(greeting("ClipJar"));', 'code'),
  record(4, tailText, 'text'),
  record(5, '图片', 'image', { imageWidth: 1, imageHeight: 1, hasImage: true, imagePath: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=' }),
  record(6, '你好，资料已收到。我会在今天下班前反馈，请稍等。', 'text', { title: '常用回复', isSnippet: true }),
  record(7, 'npm run build\ngit status --short', 'code', { title: '构建前检查', isSnippet: true }),
];

let browser;
let server;
let page;
const errors = [];
let serverOutput = '';
const checks = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${serverOutput}`);
    try { if ((await fetch(origin)).ok) return; } catch { /* Server is starting. */ }
    await pause(100);
  }
  throw new Error(`Vite did not become ready: ${serverOutput}`);
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false });
}

async function noHorizontalOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Window must not overflow horizontally');
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'Dialog must fit the window');
  }
}

async function switchTab(name) {
  await page.getByRole('navigation', { name: '内容库' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

async function menu(row, name) {
  await row.hover();
  await row.getByRole('button', { name: '更多记录操作' }).click();
  await row.getByRole('button', { name, exact: true }).click();
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '1420', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
  await ready();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 460, height: 700 }, locale: 'zh-CN', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(({ fixtures, defaults }) => {
    if (localStorage.getItem('clipjar-storage') === null) localStorage.setItem('clipjar-storage', JSON.stringify({ state: { items: fixtures, settings: defaults }, version: 0 }));
  }, { fixtures, defaults });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: '新建片段', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 5);
  await noHorizontalOverflow();
  await screenshot('history-460x700');
  checks.push('History renders all five seeded records without horizontal overflow');

  await page.getByRole('button', { name: '图片', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 1);
  await page.locator('.clip-image-preview img').waitFor({ state: 'visible' });
  await switchTab('片段');
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 2);
  assert.equal(await page.getByRole('button', { name: '全部类型', exact: true }).getAttribute('aria-pressed'), 'true');
  await screenshot('snippets-460x700');
  checks.push('Switching from image history to snippets resets the incompatible type filter');

  await page.keyboard.press('Control+f');
  assert.equal(await page.getByRole('searchbox', { name: '搜索内容、名称或备注' }).evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Control+n');
  const editor = page.getByRole('dialog', { name: '新建常用片段' });
  await editor.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#snippet-name').evaluate(node => node === document.activeElement), true);
  await editor.getByRole('button', { name: '保存片段', exact: true }).click();
  await editor.getByRole('alert').waitFor({ state: 'visible' });
  assert.equal(await editor.isVisible(), true, 'Invalid snippet must keep its draft open');
  await page.locator('#snippet-name').fill('周报模板');
  await page.locator('#snippet-body').fill('本周完成：\n下周计划：\n需要协助：');
  await noHorizontalOverflow();
  await screenshot('snippet-editor-460x700');
  await page.keyboard.press('Control+Enter');
  await editor.waitFor({ state: 'hidden' });
  const created = page.locator('.clipboard-row').filter({ hasText: '周报模板' });
  await created.waitFor({ state: 'visible' });
  checks.push('Ctrl+F and Ctrl+N focus the expected fields; validation and Ctrl+Enter snippet creation work');

  await menu(created, '编辑片段');
  await page.getByRole('dialog', { name: '编辑片段' }).waitFor({ state: 'visible' });
  await page.locator('#snippet-name').fill('周报模板更新');
  await page.locator('#snippet-body').fill('本周完成：ClipJar 功能验收。\n下周计划：收集反馈。');
  await page.getByRole('button', { name: '保存片段', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const updated = page.locator('.clipboard-row').filter({ hasText: '周报模板更新' });
  await updated.waitFor({ state: 'visible' });
  await menu(updated, '查看完整内容');
  await page.getByRole('dialog', { name: '周报模板更新' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.full-text').innerText(), '本周完成：ClipJar 功能验收。\n下周计划：收集反馈。');
  await screenshot('content-preview-460x700');
  await page.getByRole('dialog').getByRole('button', { name: '复制内容', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '本周完成：ClipJar 功能验收。\n下周计划：收集反馈。');
  await page.reload();
  await switchTab('片段');
  await updated.waitFor({ state: 'visible' });
  checks.push('Snippet edit, full preview, real browser clipboard copy and reload persistence work');

  await menu(updated, '删除片段');
  await updated.getByText('删除这个片段？', { exact: true }).waitFor({ state: 'visible' });
  await screenshot('snippet-delete-confirmation-460x700');
  await updated.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await updated.count(), 1, 'Cancelling deletion must retain the snippet');
  await updated.getByRole('button', { name: '删除片段', exact: true }).click();
  await updated.getByRole('button', { name: '确认删除', exact: true }).click();
  await updated.waitFor({ state: 'hidden' });
  checks.push('Snippet deletion requires confirmation; cancel retains data');

  await switchTab('历史');
  const search = page.getByRole('searchbox', { name: '搜索内容、名称或备注' });
  await search.fill('检索验收');
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 1);
  assert.equal(await page.locator('.clipboard-row mark').innerText(), '检索验收', 'Search must reveal and highlight a match beyond the initial excerpt');
  await menu(page.locator('.clipboard-row'), '查看完整内容');
  await page.getByRole('dialog', { name: '内容预览' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.full-text').innerText(), tailText);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await search.fill('');
  checks.push('Search finds and highlights text after the initial excerpt; preview retains the full content');

  await page.setViewportSize({ width: 420, height: 600 });
  await noHorizontalOverflow();
  await screenshot('history-420x600');
  await page.getByRole('button', { name: '新建片段', exact: true }).click();
  await page.getByRole('dialog', { name: '新建常用片段' }).waitFor({ state: 'visible' });
  await noHorizontalOverflow();
  await screenshot('snippet-editor-420x600');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await settings.waitFor({ state: 'visible' });
  await noHorizontalOverflow();
  await screenshot('settings-420x600');
  await settings.getByRole('button', { name: '清空普通历史', exact: true }).click();
  await settings.getByRole('button', { name: '确认清空', exact: true }).click();
  await page.keyboard.press('Escape');
  await settings.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 1);
  await switchTab('片段');
  await page.waitForFunction(() => document.querySelectorAll('.clipboard-row').length === 2);
  checks.push('Compact layout and dialogs fit; clearing ordinary history preserves favorites and snippets');

  assert.deepEqual(errors, [], 'No uncaught browser errors');
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ scope: 'Built browser UI; native OS capture is outside this smoke test', checks, errors }, null, 2));
  console.log(`Passed ${checks.length} browser smoke groups; screenshots: ${output}`);
}

main().catch(async error => {
  console.error(error);
  if (page) await screenshot('failure').catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});
