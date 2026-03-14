# 🔄 ClipJar 升级指南

## 自动升级行为

### Windows (NSIS 安装包)

当你安装新版本时：

| 场景 | 行为 | 数据保留 |
|------|------|----------|
| **已安装旧版** | 自动检测并提示"升级" | ✅ 所有数据保留 |
| **相同版本** | 提示"修复"或"重新安装" | ✅ 数据保留 |
| **降级（新版→旧版）** | 允许（需确认） | ✅ 数据保留 |

### macOS (.dmg)

- 直接拖放覆盖 Applications 文件夹
- 数据存储在独立位置，不会被删除

---

## 📦 数据存储位置

你的剪贴板数据存储在以下位置，**升级时不会被删除**：

### Windows
```
%APPDATA%\com.clipjar.desktop\
├── config.json          # 应用配置
└── ...                  # 其他数据
```

浏览器存储（LocalStorage）：
```
%APPDATA%\com.clipjar.desktop\LocalStorage\
```

### macOS
```
~/Library/Application Support/com.clipjar.desktop/
```

### Linux
```
~/.config/com.clipjar.desktop/
```

---

## ⚙️ 升级配置说明

在 `tauri.conf.json` 中配置了以下 NSIS 选项：

```json
{
  "bundle": {
    "nsis": {
      "installMode": "both",        // 支持当前用户/所有用户
      "allowDowngrades": true,      // 允许降级安装
      "allowElevation": true,       // 请求管理员权限（如需要）
      "installerIcon": "icons/icon.ico"
    }
  }
}
```

### 安装模式 (`installMode`)

- **`perUser`** (默认): 安装到用户目录，无需管理员权限
- **`perMachine`**: 安装到 Program Files，需要管理员权限
- **`both`**: 让用户选择（推荐）

---

## 🚀 推荐升级流程

### 方式 1：自动升级（推荐）

如果你已配置自动更新：
1. 应用内点击"检查更新"
2. 检测到新版本后点击"下载并安装"
3. 自动下载、安装、重启

### 方式 2：手动安装

1. 下载新版本 `ClipJar_x64-setup.exe`
2. 双击运行
3. 安装向导会检测到旧版本：
   - 显示 "ClipJar 已经安装，是否升级？"
   - 点击"是"
4. 完成安装，数据自动保留

### 方式 3：绿色版覆盖（不推荐）

如果是 `.exe` 绿色版：
- 直接覆盖文件即可
- 但可能丢失 WebView2 等依赖

---

## ❓ 常见问题

### Q: 升级后数据丢失了怎么办？

**检查数据存储位置**：
```powershell
# Windows PowerShell
Get-ChildItem "$env:APPDATA\com.clipjar.desktop" -Recurse
```

**可能原因**：
1. 使用了不同的 `identifier`（应用 ID）
2. 手动删除了应用数据文件夹
3. 使用了不同的安装路径

### Q: 如何完全卸载并清除所有数据？

**Windows**：
1. 控制面板 → 卸载 ClipJar
2. 手动删除数据文件夹：
   ```powershell
   Remove-Item -Recurse "$env:APPDATA\com.clipjar.desktop"
   ```

**macOS**：
```bash
rm -rf ~/Library/Application\ Support/com.clipjar.desktop
rm -rf /Applications/ClipJar.app
```

### Q: 能否同时安装多个版本？

**不能**。因为 `identifier` 相同，系统会视为同一个应用。

如需同时运行多个版本，需要：
- 修改 `tauri.conf.json` 中的 `identifier`
- 例如：`com.clipjar.desktop.beta`

### Q: 升级后设置会重置吗？

**不会**。设置存储在数据目录的 `config.json` 中，升级时保留。

---

## 📝 版本号规范

版本号格式：`主版本.次版本.修订号`

示例：
- `1.0.3` → `1.1.0` (次版本升级)
- `1.0.3` → `1.0.4` (修订版升级)
- `1.0.3` → `2.0.0` (主版本升级，可能有破坏性变更)

---

## 🔒 数据备份建议

虽然升级不会删除数据，但建议定期备份：

**Windows 备份脚本**：
```powershell
# backup.ps1
$source = "$env:APPDATA\com.clipjar.desktop"
$backup = "$env:USERPROFILE\Documents\ClipJar-Backup"
Copy-Item -Recurse $source $backup -Force
Write-Host "备份完成: $backup"
```

运行：
```powershell
.\backup.ps1
```
