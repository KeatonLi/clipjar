#!/bin/bash

# ClipJar 发布脚本
# 用法: ./scripts/release.sh [patch|minor|major]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 版本类型
VERSION_TYPE=${1:-patch}

# 检查参数
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}错误: 版本类型必须是 patch、minor 或 major${NC}"
    echo "用法: ./scripts/release.sh [patch|minor|major]"
    exit 1
fi

# 检查当前分支
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo -e "${YELLOW}警告: 当前不在 main/master 分支 (${CURRENT_BRANCH})${NC}"
    read -p "是否继续? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 检查工作区是否干净
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}错误: 工作区有未提交的更改${NC}"
    git status --short
    exit 1
fi

# 拉取最新代码
echo -e "${YELLOW}拉取最新代码...${NC}"
git pull origin $CURRENT_BRANCH

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}当前版本: v${CURRENT_VERSION}${NC}"

# 计算新版本
NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version | sed 's/v//')
echo -e "${GREEN}新版本: v${NEW_VERSION}${NC}"

# 同步更新 Cargo.toml 版本
echo -e "${YELLOW}同步更新 Cargo.toml 版本...${NC}"
cd src-tauri
# 使用 sed 更新 Cargo.toml 版本
sed -i.bak "s/^version = \".*\"/version = \"${NEW_VERSION}\"/" Cargo.toml
rm Cargo.toml.bak
cd ..

# 更新 CHANGELOG.md
echo -e "${YELLOW}请更新 CHANGELOG.md，按 Enter 继续...${NC}"
read

# 提交更改
echo -e "${YELLOW}提交版本更新...${NC}"
git add package.json package-lock.json src-tauri/Cargo.toml CHANGELOG.md
git commit -m "chore: release v${NEW_VERSION}"

# 创建标签
echo -e "${YELLOW}创建标签 v${NEW_VERSION}...${NC}"
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

# 推送代码
echo -e "${YELLOW}推送代码和标签...${NC}"
git push origin $CURRENT_BRANCH
git push origin "v${NEW_VERSION}"

echo -e "${GREEN}✅ 发布 v${NEW_VERSION} 已触发！${NC}"
echo -e "${GREEN}构建进度: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]//;s/.git$//')/actions${NC}"
