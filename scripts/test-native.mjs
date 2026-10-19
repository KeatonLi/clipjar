import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const folder = await mkdtemp(join(tmpdir(), 'clipjar-native-test-'));
const executable = resolve(
  process.env.CLIPJAR_TEST_EXECUTABLE ||
    `src-tauri/target/debug/clipjar${process.platform === 'win32' ? '.exe' : ''}`
);
let output = '';
try {
  await new Promise((done, reject) => {
    const child = spawn(executable, [], {
      env: { ...process.env, CLIPJAR_SMOKE_TEST: '1', CLIPJAR_TEST_DATA_DIR: folder },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Native smoke timed out after 45 seconds'));
    }, 45000);
    const append = (data) => {
      output += data.toString();
      process.stdout.write(data);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      code === 0 && output.includes('CLIPJAR_NATIVE_SMOKE_PASSED')
        ? done()
        : reject(new Error(`Native smoke failed: exit ${code}`));
    });
  });
} finally {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/native-smoke.log', output);
  await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
