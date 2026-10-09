# 个人知识库

参照 [goclub.space](https://goclub.space) 风格构建的个人知识库站点（Astro 静态站点，暖纸色主题 + 深色模式自适应 + 全站搜索）。

## 六大板块

| # | 板块 | 路径 | 内容源 |
|---| ---- | ---- | ---- |
| 01 | ✍️ 个人文章 | `/posts/` | `src/content/posts/*.md` |
| 02 | 📖 文章分享 | `/reading/` | `src/content/reading/*.md` |
| 03 | 🧱 八股总结 | `/baguwen/` | `src/content/baguwen/*.md` |
| 04 | 🎯 面试汇总 | `/interview/` | `src/content/interview/*.md` |
| 05 | 🛠️ 个人项目 | `/projects/` | `src/content/projects/*.md` |
| 06 | 🔭 项目分享 | `/showcases/` | `src/content/showcases/*.md` |

板块定义集中在 `src/sections.ts`（标签、描述、排序都在这里改）。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:4321 预览（搜索不可用，需先构建）
npm run build      # 构建到 dist/ 并生成 Pagefind 搜索索引
npm run preview    # 预览构建产物（搜索可用）
```

## 写文章

在对应板块目录下新建 md 文件：

```md
---
title: 标题
description: 一句话摘要（列表页展示）
pubDate: 2026-10-09
tags: [标签1, 标签2]
link: https://...   # 可选：分享类内容的原文链接
---

正文 Markdown……
```

## 飞书文档同步

### 1. 创建飞书应用（只需一次）

1. 打开[飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 「权限管理」开通只读权限：`docx:document:readonly`、`drive:drive:readonly`、`docs:document.content:read`
3. 发布应用版本

### 2. 授权文件夹给应用

打开要同步的**云文档文件夹** → 右上角「…」→ 把应用添加为协作者（可阅读）。

### 3. 配置并同步

```bash
cp .env.example .env
# 填入 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_FOLDER_TOKEN（文件夹链接最后一串）

npm run sync                        # 同步到 个人文章
FEISHU_TARGET_COLLECTION=reading npm run sync    # 同步到 文章分享
FEISHU_TARGET_COLLECTION=baguwen npm run sync    # 同步到 八股总结
FEISHU_TARGET_COLLECTION=interview npm run sync  # 同步到 面试汇总
FEISHU_TARGET_COLLECTION=projects npm run sync   # 同步到 个人项目
FEISHU_TARGET_COLLECTION=showcases npm run sync  # 同步到 项目分享
```

脚本行为：拉取文件夹下所有 doc/docx → 导出转 Markdown（图片抽取到 `public/images/`）→ 写入 `src/content/<板块>/`，自动带 front-matter。

> `.env` 已在 `.gitignore` 中，不会被提交。

## 部署上线（免费，三选一）

1. **Vercel**：仓库推到 GitHub → vercel.com 导入 → 自动识别 Astro → Deploy
2. **Cloudflare Pages**：连接 GitHub 仓库 → 构建命令 `npm run build`、输出目录 `dist`
3. **GitHub Pages**：Settings → Pages → GitHub Actions + 官方 Astro workflow

日常更新流程：**飞书里写 → `npm run sync` → `git add src/content && git commit && git push` → 自动重新部署**。

## 目录结构

```
├── scripts/sync-feishu.mjs   # 飞书同步脚本
├── src/
│   ├── sections.ts           # 六大板块定义
│   ├── content/              # 六个板块的 Markdown
│   ├── content.config.ts     # 内容集合 schema
│   ├── lib/content.ts        # 内容读取工具
│   ├── layouts/BaseLayout.astro  # 侧边栏 + 顶栏 + 搜索
│   └── pages/
│       ├── index.astro       # 首页（hero + 知识地图 + 最近更新）
│       ├── [section]/        # 栏目页 + 文章页（动态路由）
│       └── about.astro
└── public/images/            # 文档图片
```
