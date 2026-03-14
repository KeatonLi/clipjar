# ClipJar Windows 安装包构建脚本
# 用法: .\scripts\build-installer.ps1

Write-Host "🚀 开始构建 ClipJar Windows 安装包..." -ForegroundColor Green

# 检查环境
Write-Host "📋 检查构建环境..." -ForegroundColor Yellow

# 检查 Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 未找到 Node.js，请先安装 https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# 检查 Rust
try {
    $rustVersion = rustc --version
    Write-Host "✅ Rust: $rustVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 未找到 Rust，请先安装 https://rustup.rs/" -ForegroundColor Red
    exit 1
}

# 安装依赖
Write-Host "📦 安装前端依赖..." -ForegroundColor Yellow
npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 依赖安装失败" -ForegroundColor Red
    exit 1
}

# 构建前端
Write-Host "🔨 构建前端..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 前端构建失败" -ForegroundColor Red
    exit 1
}

# 构建 Tauri 应用
Write-Host "🔨 构建 Tauri 应用（这可能需要几分钟）..." -ForegroundColor Yellow
cd src-tauri
cargo build --release
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Tauri 构建失败" -ForegroundColor Red
    exit 1
}
cd ..

# 检查生成的文件
Write-Host "📁 检查生成的安装包..." -ForegroundColor Yellow

$bundleDir = "src-tauri\target\release\bundle"
$nsisDir = "$bundleDir\nsis"
$msiDir = "$bundleDir\msi"

Write-Host ""
Write-Host "📦 生成的安装包:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# 检查 NSIS 安装包
if (Test-Path $nsisDir) {
    $nsisFiles = Get-ChildItem -Path $nsisDir -Filter "*.exe"
    if ($nsisFiles.Count -gt 0) {
        foreach ($file in $nsisFiles) {
            $size = [math]::Round($file.Length / 1MB, 2)
            Write-Host "✅ NSIS 安装包: $($file.Name) ($size MB)" -ForegroundColor Green
            Write-Host "   路径: $($file.FullName)" -ForegroundColor Gray
        }
    } else {
        Write-Host "⚠️ 未找到 NSIS 安装包" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ NSIS 目录不存在" -ForegroundColor Yellow
}

Write-Host ""

# 检查 MSI 安装包
if (Test-Path $msiDir) {
    $msiFiles = Get-ChildItem -Path $msiDir -Filter "*.msi"
    if ($msiFiles.Count -gt 0) {
        foreach ($file in $msiFiles) {
            $size = [math]::Round($file.Length / 1MB, 2)
            Write-Host "✅ MSI 安装包: $($file.Name) ($size MB)" -ForegroundColor Green
            Write-Host "   路径: $($file.FullName)" -ForegroundColor Gray
        }
    } else {
        Write-Host "⚠️ 未找到 MSI 安装包" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ MSI 目录不存在" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan

# 提示
Write-Host ""
Write-Host "💡 提示:" -ForegroundColor Cyan
Write-Host "   - NSIS 安装包 (*-setup.exe): 有安装向导，自动安装依赖，推荐用户使用" -ForegroundColor White
Write-Host "   - MSI 安装包: 适合企业批量部署" -ForegroundColor White
Write-Host "   - 绿色版 exe: 直接运行，无安装过程" -ForegroundColor White
Write-Host ""
Write-Host "✅ 构建完成！安装包在: $bundleDir" -ForegroundColor Green

# 询问是否打开目录
$open = Read-Host "是否打开安装包目录? (y/n)"
if ($open -eq "y" -or $open -eq "Y") {
    Start-Process explorer.exe $bundleDir
}
