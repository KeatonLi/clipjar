#!/bin/bash

# ClipJar 一键打包脚本
# 支持 macOS (Intel + Apple Silicon) 和 Windows

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取版本号
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
echo -e "${GREEN}ClipJar 打包脚本${NC} v$VERSION"

# 创建输出目录
OUTPUT_DIR="target/release"
mkdir -p "$OUTPUT_DIR"

# 检测系统
OS=$(uname -s)
ARCH=$(uname -m)

echo -e "\n${YELLOW}检测到系统: $OS $ARCH${NC}\n"

# 打包函数
build_macos() {
    local target=$1
    local name=$2

    echo -e "${GREEN}>>> 正在构建 macOS $name...${NC}"

    if rustup target list --installed | grep -q "$target"; then
        npm run tauri build -- --target "$target"

        # 复制 DMG 到输出目录
        find src-tauri/target -name "*.dmg" -type f -newer "$OUTPUT_DIR" 2>/dev/null | while read -r dmg; do
            cp "$dmg" "$OUTPUT_DIR/"
            echo -e "${GREEN}已复制: $(basename "$dmg")${NC}"
        done
    else
        echo -e "${YELLOW}跳过 $name: 未安装 target '$target'${NC}"
        echo -e "${YELLOW}  安装命令: rustup target add $target${NC}"
    fi
}

build_windows() {
    local target=$1
    local name=$2

    echo -e "${GREEN}>>> 正在构建 Windows $name...${NC}"

    if rustup target list --installed | grep -q "$target"; then
        npm run tauri build -- --target "$target"

        # 复制 MSI 和 NSIS 到输出目录
        find src-tauri/target -name "*.msi" -o -name "*.exe" 2>/dev/null | while read -r installer; do
            if [[ "$installer" == *"bundle"* ]]; then
                cp "$installer" "$OUTPUT_DIR/"
                echo -e "${GREEN}已复制: $(basename "$installer")${NC}"
            fi
        done
    else
        echo -e "${YELLOW}跳过 Windows $name: 未安装 target '$target'${NC}"
        echo -e "${YELLOW}  安装命令: rustup target add $target${NC}"
    fi
}

# 根据系统选择构建
case "$OS" in
    "Darwin")
        echo -e "${YELLOW}--- macOS 构建 ---${NC}"
        build_macos "aarch64-apple-darwin" "Apple Silicon (M1/M2/M3)"
        build_macos "x86_64-apple-darwin" "Intel"
        ;;
    "Linux")
        echo -e "${YELLOW}--- Linux 构建 ---${NC}"
        build_macos "aarch64-apple-darwin" "macOS Apple Silicon (交叉编译)"
        build_macos "x86_64-apple-darwin" "macOS Intel (交叉编译)"
        build_windows "x86_64-pc-windows-msvc" "x64"
        ;;
    "MINGW"*|"CYGWIN"*|"MSYS"*)
        echo -e "${YELLOW}--- Windows 构建 ---${NC}"
        build_windows "x86_64-pc-windows-msvc" "x64"
        ;;
    *)
        echo -e "${RED}不支持的系统: $OS${NC}"
        exit 1
        ;;
esac

# 显示输出结果
echo -e "\n${GREEN}========== 打包完成 ==========${NC}"
echo -e "\n输出目录: $OUTPUT_DIR\n"
ls -lh "$OUTPUT_DIR"/*.dmg "$OUTPUT_DIR"/*.msi "$OUTPUT_DIR"/*.exe 2>/dev/null || echo "暂无安装包"

echo -e "\n${YELLOW}提示:${NC}"
echo "- macOS: 将 .dmg 文件解压后拖拽到 Applications 即可"
echo "- Windows: 运行 .exe 或 .msi 安装"
echo ""
