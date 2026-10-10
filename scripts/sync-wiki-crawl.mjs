/**
 * 飞书知识库爬取同步：从入口文档的链接出发，BFS 导出所有可达的 wiki docx → 博客 Markdown
 * 用法：node scripts/sync-wiki-crawl.mjs <入口文档的md路径> [目标板块]
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import TurndownService from 'turndown';

const BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const INDEX_MD = process.argv[2];
const TARGET = process.argv[3] || 'posts';
const SKIP_TITLES = new Set(); // 标题在此列表中的文档不写入博客（如目录页）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const auth = () => ({ Authorization: `Bearer ${globalThis.TK}`, 'Content-Type': 'application/json' });
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

async function getToken() {
  const r = await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  })).json();
  if (r.code !== 0) throw new Error('获取 token 失败: ' + r.msg);
  globalThis.TK = r.tenant_access_token;
}

async function getNode(token) {
  const r = await (await fetch(`${BASE}/wiki/v2/spaces/get_node?token=${token}`, { headers: auth() })).json();
  if (r.code !== 0) return { error: `${r.code} ${r.msg}` };
  return r.data.node;
}

async function exportDocx(objToken) {
  const exp = await (await fetch(`${BASE}/drive/v1/export_tasks`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ file_extension: 'docx', token: objToken, type: 'docx' }),
  })).json();
  if (exp.code !== 0) return { error: `${exp.code} ${exp.msg}` };
  const ticket = exp.data.ticket;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const poll = await (await fetch(`${BASE}/drive/v1/export_tasks/${ticket}?token=${objToken}`, { headers: auth() })).json();
    const res = poll.data?.result;
    if (res?.job_status === 0) {
      const dl = await fetch(`${BASE}/drive/v1/export_tasks/file/${res.file_token}/download`, { headers: { Authorization: `Bearer ${globalThis.TK}` } });
      return { buf: Buffer.from(await dl.arrayBuffer()) };
    }
    if (res?.job_status > 2) return { error: '导出失败 job_status=' + res.job_status };
  }
  return { error: '导出超时' };
}

async function docxToMarkdown(buf, nodeToken) {
  const imgDir = path.resolve('public/images', nodeToken);
  let idx = 0;
  const { value: html } = await mammoth.convertToHtml({ buffer: buf }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      idx += 1;
      const ext = image.contentType.split('/')[1] || 'png';
      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(path.join(imgDir, `img-${idx}.${ext}`), await image.readAsBuffer());
      return { src: `/images/${nodeToken}/img-${idx}.${ext}` };
    }),
  });
  let md = turndown.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
  md = md.replace(/^#\s+.+\n+/, '');
  return { md, images: idx };
}

async function main() {
  if (!INDEX_MD) { console.error('用法: node scripts/sync-wiki-crawl.mjs <入口md> [板块]'); process.exit(1); }
  await getToken();

  // 种子：入口 md 里的所有 wiki 链接，或 txt 文件里一行一个 token
  const raw = await fs.readFile(INDEX_MD, 'utf-8');
  const seeds = INDEX_MD.endsWith('.txt')
    ? raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [...new Set([...raw.matchAll(/feishu\.cn\/wiki\/([A-Za-z0-9]+)/g)].map((m) => m[1]))];
  console.log(`种子链接 ${seeds.length} 个`);

  const queue = [...seeds];
  const seen = new Set(seeds);
  const done = [];
  const failed = [];

  while (queue.length > 0) {
    const token = queue.shift();
    const node = await getNode(token);
    if (node.error) { failed.push({ token, reason: node.error }); continue; }
    if (node.obj_type !== 'docx') { console.log(`跳过非文档节点: ${node.title} (${node.obj_type})`); continue; }
    if (SKIP_TITLES.has(node.title)) { console.log(`按规则跳过: 《${node.title}》`); continue; }

    const exp = await exportDocx(node.obj_token);
    if (exp.error) { failed.push({ token, title: node.title, reason: exp.error }); console.log(`✗ 《${node.title}》 ${exp.error}`); continue; }

    const { md, images } = await docxToMarkdown(exp.buf, token);
    const pubDate = new Date(Number(node.obj_create_time) * 1000).toISOString().slice(0, 10);
    const safe = node.title.replace(/[\\/:*?"<>|#%&{}\s]+/g, '-').slice(0, 60) || token;
    const outDir = path.resolve('src/content', TARGET);
    await fs.mkdir(outDir, { recursive: true });
    const front = ['---', `title: "${node.title.replace(/"/g, '\\"')}"`, `description: ""`, `pubDate: ${pubDate}`, 'tags: [飞书同步]', '---', ''].join('\n');
    await fs.writeFile(path.join(outDir, `${safe}.md`), front + md + '\n', 'utf-8');
    done.push(node.title);
    console.log(`✓ 《${node.title}》 ${md.length} 字符 / ${images} 图 → ${safe}.md`);

    // 从正文继续发现新文档链接
    const links = [...new Set([...md.matchAll(/feishu\.cn\/wiki\/([A-Za-z0-9]+)/g)].map((m) => m[1]))];
    for (const t of links) {
      if (!seen.has(t)) { seen.add(t); queue.push(t); }
    }
    await sleep(300);
  }

  console.log(`\n===== 完成：成功 ${done.length} 篇，失败 ${failed.length} 篇 =====`);
  if (failed.length) failed.forEach((f) => console.log(`✗ ${f.title || f.token}: ${f.reason}`));
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
