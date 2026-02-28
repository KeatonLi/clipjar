#!/bin/bash

# ClipJar 发布脚本
# 自动构建并发布到 GitHub Release

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 获取版本号
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
REPO="clipjar/clipjar"

echo -e "${GREEN}ClipJar 发布脚本${NC} v$VERSION"
echo ""

# 检查 gh 是否安装
if ! command -v gh &> /dev/null; then
    echo -e "${RED}错误: gh (GitHub CLI) 未安装${NC}"
    echo "安装: brew install gh"
    exit 1
fi

# 检查登录状态
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}请先登录 GitHub:${NC}"
    gh auth login
fi

# 检查 Git 状态
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}警告: 有未提交的更改${NC}"
    git status --short
    echo ""
    read -p "继续发布? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

# 推送代码（如果需要）
if [ "$1" = "--push" ]; then
    echo -e "${GREEN}>>> 推送代码到远程...${NC}"
    git push
fi

# 构建
echo -e "${GREEN}>>> 构建应用...${NC}"
./build.sh

# 查找构建产物
DMG_FILE=$(find target -name "*.dmg" -type f 2>/dev/null | head -1)

if [ -z "$DMG_FILE" ]; then
    echo -e "${RED}错误: 未找到 DMG 文件${NC}"
    exit 1
fi

echo -e "${GREEN}找到安装包: $DMG_FILE${NC}"

# 创建 Release
echo -e "${GREEN}>>> 创建 GitHub Release...${NC}"

# 检查是否已存在
if gh release view v$VERSION $REPO &> /dev/null; then
    echo -e "${YELLOW}版本 v$VERSION 已存在，将删除后重新创建${NC}"
    gh release delete v$VERSION $REPO --yes
fi

# 创建 release 并上传
gh release create v$VERSION \
    --title "ClipJar v$VERSION" \
    --notes "## 下载

- **macOS**: 下载下方 DMG 文件，安装后拖拽到 Applications

## 更新内容

- 优化UI界面，添加设置弹窗
- 添加收藏页面
- 自动检测版本更新
- 使用Tauri原生剪贴板插件" \
    "$DMG_FILE"

echo ""
echo -e "${GREEN}========== 发布完成 ==========${NC}"
echo -e "Release: https://github.com/$REPO/releases/tag/v$VERSION"
echo ""
