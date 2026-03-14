# ClipJar 本地打包一键发布脚本
# 用法: .\scripts\release-local.ps1 v1.0.3

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# 颜色
$Green = "`e[32m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Reset = "`e[0m"

Write-Host "$Green=== ClipJar 本地发布脚本 ===$Reset`n"

# 检查 gh 命令
try {
    $ghVersion = gh --version | Select-Object -First 1
    Write-Host "✅ GitHub CLI: $ghVersion"
} catch {
    Write-Host "$Red❌ 未找到 GitHub CLI (gh)$Reset"
    Write-Host "请先安装: winget install --id GitHub.cli"
    exit 1
}

# 检查是否登录
try {
    $user = gh api user -q .login
    Write-Host "✅ 已登录 GitHub: @$user"
} catch {
    Write-Host "$Red❌ 未登录 GitHub$Reset"
    Write-Host "请运行: gh auth login"
    exit 1
}

# 检查打包目录
$bundleDir = "src-tauri/target/release/bundle"
if (-not (Test-Path $bundleDir)) {
    Write-Host "$Red❌ 未找到打包目录: $bundleDir$Reset"
    Write-Host "请先运行: npm run tauri build"
    exit 1
}

# 查找安装包
$nsisDir = "$bundleDir/nsis"
$exeFiles = Get-ChildItem -Path $nsisDir -Filter "*.exe" -ErrorAction SilentlyContinue

if ($exeFiles.Count -eq 0) {
    Write-Host "$Red❌ 未找到安装包 (.exe)$Reset"
    Write-Host "请先运行: npm run tauri build"
    exit 1
}

Write-Host "✅ 找到 $($exeFiles.Count) 个安装包"

# 显示准备上传的文件
Write-Host "`n$Yellow📦 准备上传的文件:$Reset"
$filesToUpload = @()

# NSIS 安装包
foreach ($file in $exeFiles) {
    $size = [math]::Round($file.Length / 1MB, 2)
    Write-Host "   - $($file.Name) ($size MB)"
    $filesToUpload += $file.FullName
}

# 查找 .sig 签名文件
$sigFiles = Get-ChildItem -Path $nsisDir -Filter "*.sig" -ErrorAction SilentlyContinue
foreach ($file in $sigFiles) {
    Write-Host "   - $($file.Name) (签名文件)"
    $filesToUpload += $file.FullName
}

# 检查标签是否存在
try {
    $tagExists = gh release view $Version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n$Yellow⚠️ Release $Version 已存在$Reset"
        $overwrite = Read-Host "是否覆盖上传? (y/n)"
        if ($overwrite -ne "y") {
            exit 0
        }
        # 删除旧文件
        Write-Host "删除旧文件..."
        gh release delete-asset $Version $exeFiles.Name -y 2>$null
    }
} catch {
    # 标签不存在，创建新的
    Write-Host "`n📝 创建新 Release: $Version"
}

# 确认上传
Write-Host "`n$Yellow⚡ 即将上传到 GitHub Release$Reset"
$confirm = Read-Host "确认上传? (y/n)"
if ($confirm -ne "y") {
    Write-Host "已取消"
    exit 0
}

# 创建 Release 并上传
Write-Host "`n🚀 上传中..." -NoNewline

try {
    # 构建参数
    $ghArgs = @(
        "release", "create", $Version,
        "--title", "ClipJar $Version",
        "--notes", "🎉 新版本发布`n`n## 安装包`n- Windows: 下载 `*-setup.exe` 安装包"
    )
    
    # 添加文件路径
    $ghArgs += $filesToUpload
    
    # 执行命令
    & gh @ghArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n`n$Green✅ 发布成功!$Reset"
        
        # 获取仓库地址
        $repo = gh repo view --json url -q .url
        Write-Host "`n📎 访问地址:"
        Write-Host "   $repo/releases/tag/$Version"
        
        # 是否浏览器打开
        $open = Read-Host "`n是否在浏览器中打开? (y/n)"
        if ($open -eq "y") {
            Start-Process "$repo/releases/tag/$Version"
        }
    } else {
        throw "上传失败"
    }
} catch {
    Write-Host "`n`n$Red❌ 发布失败: $_$Reset"
    exit 1
}
