#!/bin/bash

# ClipJar 一键打包脚本
# 支持 macOS (Intel + Apple Silicon) 和 Windows

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 获取版本号（从 tauri.conf.json）
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version" 2>/dev/null || echo "1.0.0")
echo -e "${GREEN}ClipJar 打包脚本${NC} v$VERSION"

# 检查依赖
check_deps() {
    echo -e "${BLUE}>>> 检查依赖...${NC}"
    
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}npm 依赖未安装，正在安装...${NC}"
        npm install
    fi
    
    if ! command -v rustc &> /dev/null; then
        echo -e "${RED}错误: Rust 未安装${NC}"
        echo "安装: https://rustup.rs/"
        exit 1
    fi
    
    echo -e "${GREEN}依赖检查完成${NC}"
}

# 检测系统
detect_os() {
    case "$(uname -s)" in
        Darwin*)    echo "macos";;
        Linux*)     echo "linux";;
        MINGW*|CYGWIN*|MSYS*) echo "windows";;
        *)          echo "unsupported";;
    esac
}

# macOS 构建
build_macos() {
    local target=$1
    local name=$2
    
    echo -e "\n${GREEN}>>> 构建 macOS $name...${NC}"
    
    if ! rustup target list --installed | grep -q "$target"; then
        echo -e "${YELLOW}跳过 $name: 未安装 target '$target'${NC}"
        echo -e "${YELLOW}  安装: rustup target add $target${NC}"
        return
    fi
    
    npm run tauri build -- --target "$target" --bundles dmg
}

# Windows 构建
build_windows() {
    local target=$1
    local name=$2
    
    echo -e "\n${GREEN}>>> 构建 Windows $name...${NC}"
    
    if ! rustup target list --installed | grep -q "$target"; then
        echo -e "${YELLOW}跳过 $name: 未安装 target '$target'${NC}"
        echo -e "${YELLOW}  安装: rustup target add $target${NC}"
        return
    fi
    
    npm run tauri build -- --target "$target" --bundles msi,nsis
}

# Linux 构建
build_linux() {
    local target=$1
    local name=$2
    
    echo -e "\n${GREEN}>>> 构建 Linux $name...${NC}"
    
    if ! rustup target list --installed | grep -q "$target"; then
        echo -e "${YELLOW}跳过 $name: 未安装 target '$target'${NC}"
        return
    fi
    
    npm run tauri build -- --target "$target" --bundles deb,appimage
}

# 显示产物
show_outputs() {
    echo -e "\n${GREEN}========== 打包完成 ==========${NC}"
    echo -e "\n输出目录: src-tauri/target/\n"
    
    find src-tauri/target -name "*.dmg" -o -name "*.msi" -o -name "*.exe" -o -name "*.deb" -o -name "*.AppImage" 2>/dev/null | \
        grep -E "bundle" | head -20 | while read -r f; do
            [ -f "$f" ] && echo "  $(basename "$f")"
        done
}

# 主流程
main() {
    check_deps
    
    OS=$(detect_os)
    echo -e "\n${YELLOW}检测到系统: $OS${NC}"
    
    case "$OS" in
        macos)
            build_macos "aarch64-apple-darwin" "Apple Silicon (M1/M2/M3)"
            build_macos "x86_64-apple-darwin" "Intel"
            ;;
        linux)
            build_linux "x86_64-unknown-linux-gnu" "x64"
            ;;
        windows)
            build_windows "x86_64-pc-windows-msvc" "x64"
            ;;
        unsupported)
            echo -e "${RED}不支持的系统${NC}"
            exit 1
            ;;
    esac
    
    show_outputs
}

main "$@"
