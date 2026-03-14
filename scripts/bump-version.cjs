#!/usr/bin/env node
/**
 * 一键版本号更新脚本
 * 用法: node scripts/bump-version.js 1.0.5
 * 或:   node scripts/bump-version.js patch  (自动递增 patch 版本)
 *       node scripts/bump-version.js minor  (自动递增 minor 版本)
 *       node scripts/bump-version.js major  (自动递增 major 版本)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const input = args[0];

if (!input) {
  console.log('用法: node scripts/bump-version.js <version>');
  console.log('  例如: node scripts/bump-version.js 1.0.5');
  console.log('  或:   node scripts/bump-version.js patch');
  console.log('  或:   node scripts/bump-version.js minor');
  console.log('  或:   node scripts/bump-version.js major');
  process.exit(1);
}

// 读取当前版本
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const currentVersion = packageJson.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

let newVersion;

if (['patch', 'minor', 'major'].includes(input)) {
  // 自动递增版本
  switch (input) {
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
  }
} else {
  // 使用指定的版本号
  newVersion = input;
}

console.log(`当前版本: v${currentVersion}`);
console.log(`新版本:   v${newVersion}`);

// 更新 package.json
packageJson.version = newVersion;
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');
console.log('✅ package.json 已更新');

// 更新 Cargo.toml
const cargoPath = 'src-tauri/Cargo.toml';
let cargoContent = fs.readFileSync(cargoPath, 'utf-8');
cargoContent = cargoContent.replace(/version = ".*"/, `version = "${newVersion}"`);
fs.writeFileSync(cargoPath, cargoContent);
console.log('✅ src-tauri/Cargo.toml 已更新');

// 更新 tauri.conf.json
const tauriPath = 'src-tauri/tauri.conf.json';
const tauriConfig = JSON.parse(fs.readFileSync(tauriPath, 'utf-8'));
tauriConfig.version = newVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauriConfig, null, 2) + '\n');
console.log('✅ src-tauri/tauri.conf.json 已更新');

console.log(`\n🎉 版本已更新到 v${newVersion}`);
console.log('\n提交更改:');
console.log(`  git add -A`);
console.log(`  git commit -m "release: v${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push origin main --tags`);
