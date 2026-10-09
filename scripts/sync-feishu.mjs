/**
 * 飞书云文档 → 博客 Markdown 同步脚本
 *
 * 用法：
 *   1. 复制 .env.example 为 .env，填入 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_FOLDER_TOKEN
 *   2. npm run sync
 *
 * 行为：
 *   - 拉取指定飞书文件夹下所有 doc/docx 文档
 *   - 通过飞书导出 API 转成 docx，再用 mammoth + turndown 转成 Markdown
 *   - 文档里的图片会被抽取到 public/images/<文档token>/ 下并改写引用
 *   - 生成带 front-matter（title / pubDate / tags）的 md 文件放入 src/content/posts/
 *
 * 环境变量（可选）：
 *   FEISHU_TARGET_COLLECTION  目标栏目：posts | reading | projects，默认 posts
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import TurndownService from 'turndown';

const BASE = 'https://open.feishu.cn/open-apis';

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const FOLDER_TOKEN = process.env.FEISHU_FOLDER_TOKEN;
const TARGET = process.env.FEISHU_TARGET_COLLECTION || 'posts';

const CONTENT_DIR = path.resolve('src/content', TARGET);
const IMAGES_DIR = path.resolve('public/images');

if (!APP_ID || !APP_SECRET || !FOLDER_TOKEN) {
  console.error('缺少环境变量：请复制 .env.example 为 .env 并填写 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_FOLDER_TOKEN');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTenantToken() {
  const res = await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`获取 tenant_access_token 失败: ${data.code} ${data.msg}`);
  return data.tenant_access_token;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** 列出文件夹下的文件（不递归子文件夹） */
async function listFolderFiles(token) {
  const files = [];
  let pageToken = '';
  let hasMore = true;
  do {
    const url = new URL(`${BASE}/drive/v1/files`);
    url.searchParams.set('folder_token', FOLDER_TOKEN);
    url.searchParams.set('page_size', '50');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const res = await fetch(url, { headers: authHeader(token) });
    const data = await res.json();
    if (data.code !== 0) throw new Error(`列取文件夹失败: ${data.code} ${data.msg}（请确认应用有云文档权限且已被添加为文件夹协作者）`);
    for (const f of data.data?.files || []) {
      if (f.type === 'docx' || f.type === 'doc') files.push(f);
    }
    pageToken = data.data?.page_token || '';
    hasMore = Boolean(data.data?.has_more);
  } while (pageToken && hasMore);
  return files;
}

/** 创建导出任务并轮询结果，返回下载链接对应的 docx buffer */
async function exportDocx(token, fileToken, fileType) {
  const createRes = await fetch(`${BASE}/drive/v1/export_tasks`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ file_extension: 'docx', token: fileToken, type: fileType }),
  });
  const createData = await createRes.json();
  if (createData.code !== 0) throw new Error(`创建导出任务失败: ${createData.code} ${createData.msg}`);
  const ticket = createData.data.ticket;

  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const pollRes = await fetch(`${BASE}/drive/v1/export_tasks/${ticket}?token=${fileToken}`, {
      headers: authHeader(token),
    });
    const pollData = await pollRes.json();
    if (pollData.code !== 0) throw new Error(`查询导出任务失败: ${pollData.code} ${pollData.msg}`);
    const result = pollData.data?.result;
    if (result?.job_status === 0) {
      const dlRes = await fetch(`${BASE}/drive/v1/export_tasks/file/${result.file_token}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return Buffer.from(await dlRes.arrayBuffer());
    }
    if (result?.job_status === 1 || result?.job_status === 2) continue; // 1=进行中 0=成功
    if (result?.job_status) throw new Error(`导出任务失败，job_status=${result.job_status}`);
  }
  throw new Error('导出任务超时');
}

function sanitizeFilename(name) {
  return (name || 'untitled')
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

/** docx buffer -> { markdown, images }，图片落盘到 public/images/<docToken>/ */
async function docxToMarkdown(buf, docToken) {
  const imgDir = path.join(IMAGES_DIR, docToken);
  let imgIndex = 0;
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

  const { value: html } = await mammoth.convertToHtml(
    { buffer: buf },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        imgIndex += 1;
        const ext = image.contentType.split('/')[1] || 'png';
        const fileName = `img-${imgIndex}.${ext}`;
        await fs.mkdir(imgDir, { recursive: true });
        await fs.writeFile(path.join(imgDir, fileName), await image.readAsBuffer());
        return { src: `/images/${docToken}/${fileName}` };
      }),
    }
  );

  let markdown = turndown.turndown(html)
    // mammoth 空段落会产生大量空行，压一下
    .replace(/\n{3,}/g, '\n\n');

  // 如果转换结果以一个一级标题开头且与文档标题重复，去掉它（front-matter 里已有 title）
  markdown = markdown.replace(/^#\s+.+\n+/, '');
  return markdown.trim();
}

async function main() {
  console.log('==> 获取飞书访问凭证...');
  const token = await getTenantToken();

  console.log(`==> 列取文件夹 ${FOLDER_TOKEN} 下的文档...`);
  const files = await listFolderFiles(token);
  if (files.length === 0) {
    console.log('文件夹里没有 doc/docx 文档，结束。');
    return;
  }
  console.log(`    找到 ${files.length} 篇文档`);

  await fs.mkdir(CONTENT_DIR, { recursive: true });

  let ok = 0;
  for (const file of files) {
    const title = file.name;
    console.log(`\n==> 同步《${title}》 (${file.type})`);
    try {
      const buf = await exportDocx(token, file.token, file.type);
      const markdown = await docxToMarkdown(buf, file.token);

      const createdSec = file.created_time ? Number(file.created_time) : null;
      const pubDate = createdSec
        ? new Date(createdSec * 1000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const frontMatter = [
        '---',
        `title: "${title.replace(/"/g, '\\"')}"`,
        `pubDate: ${pubDate}`,
        `tags: [飞书同步]`,
        '---',
        '',
      ].join('\n');

      const fileName = `${sanitizeFilename(title)}.md`;
      await fs.writeFile(path.join(CONTENT_DIR, fileName), frontMatter + markdown + '\n', 'utf-8');
      console.log(`    ✓ 已写入 src/content/${TARGET}/${fileName}`);
      ok += 1;
    } catch (err) {
      console.error(`    ✗ 同步失败: ${err.message}`);
    }
  }

  console.log(`\n完成：成功 ${ok}/${files.length} 篇。运行 npm run dev 预览。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
