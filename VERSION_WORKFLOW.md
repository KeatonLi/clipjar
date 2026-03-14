# 🔄 版本升级工作流程

每次需要更新版本时，按以下步骤操作：

---

## 第一步：修改版本号

需要同步修改 3 个文件：

### 1. package.json
```bash
npm version 1.0.4 --no-git-tag-version
```
或手动修改：
```json
{
  "version": "1.0.4"
}
```

### 2. src-tauri/Cargo.toml
```toml
version = "1.0.4"
```

### 3. src-tauri/tauri.conf.json
```json
{
  "version": "1.0.4"
}
```

---

## 第二步：编写更新日志

在 `CHANGELOG.md` 添加新版本内容：

```markdown
## [1.0.4] - 2026-03-14

### 修复
- 修复滑块范围问题（100-200）

### 优化
- 调整默认记录数为 100
```

---

## 第三步：提交代码

```bash
# 1. 查看修改
git status

# 2. 添加所有修改
git add -A

# 3. 提交
git commit -m "release: v1.0.4

- 修复滑块范围 100-200
- 调整默认记录数为 100
- 同步更新所有版本号"
```

---

## 第四步：打标签并推送（自动发布）

```bash
# 1. 打标签
git tag v1.0.4

# 2. 推送代码和标签
git push origin main
git push origin v1.0.4
```

推送标签后会自动触发构建（如果配置了 GitHub Actions）。

---

## 第五步：本地打包（备用）

```bash
# Windows
npm run tauri build

# 上传脚本
.\scripts\release-local.ps1 v1.0.4
```

---

## 完整命令行流程

```bash
# 1. 更新版本号
npm version 1.0.4 --no-git-tag-version
sed -i 's/version = "1.0.3"/version = "1.0.4"/' src-tauri/Cargo.toml
sed -i 's/"version": "1.0.3"/"version": "1.0.4"/' src-tauri/tauri.conf.json

# 2. 提交
git add -A
git commit -m "release: v1.0.4"

# 3. 打标签推送
git tag v1.0.4
git push origin main
git push origin v1.0.4
```

---

## 版本号规范

| 版本变化 | 说明 | 示例 |
|---------|------|------|
| 主版本 | 重大更新，可能不兼容 | 1.x.x → 2.0.0 |
| 次版本 | 新功能，向后兼容 | x.0.x → x.1.0 |
| 修订号 | bug 修复 | x.x.0 → x.x.1 |
