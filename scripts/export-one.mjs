/**
 * 单篇飞书文档导出测试：wiki docx → markdown
 * 用法：node scripts/export-one.mjs <node_token> [目标板块]
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import TurndownService from 'turndown';

const BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const NODE_TOKEN = process.argv[2];
const TARGET = process.argv[3] || 'posts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!NODE_TOKEN) { console.error('用法: node scripts/export-one.mjs <wiki节点token> [板块]'); process.exit(1); }

const auth = () => ({ Authorization: `Bearer ${globalThis.TK}`, 'Content-Type': 'application/json' });

async function main() {
  // 1. token
  const tkRes = await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  })).json();
  if (tkRes.code !== 0) throw new Error('获取 token 失败: ' + tkRes.msg);
  globalThis.TK = tkRes.tenant_access_token;

  // 2. 节点信息（标题、创建时间、obj_token）
  const nodeRes = await (await fetch(`${BASE}/wiki/v2/spaces/get_node?token=${NODE_TOKEN}`, { headers: auth() })).json();
  if (nodeRes.code !== 0) throw new Error('读节点失败: ' + nodeRes.code + ' ' + nodeRes.msg);
  const node = nodeRes.data.node;
  console.log(`文档: 《${node.title}》 obj_type=${node.obj_type}`);
  if (node.obj_type !== 'docx') throw new Error('该节点不是 docx 文档');

  // 3. 创建导出任务
  const expRes = await (await fetch(`${BASE}/drive/v1/export_tasks`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ file_extension: 'docx', token: node.obj_token, type: 'docx' }),
  })).json();
  if (expRes.code !== 0) throw new Error('创建导出任务失败: ' + expRes.code + ' ' + expRes.msg);
  const ticket = expRes.data.ticket;

  // 4. 轮询 + 下载
  let buf = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const poll = await (await fetch(`${BASE}/drive/v1/export_tasks/${ticket}?token=${node.obj_token}`, { headers: auth() })).json();
    const r = poll.data?.result;
    if (r?.job_status === 0) {
      const dl = await fetch(`${BASE}/drive/v1/export_tasks/file/${r.file_token}/download`, { headers: { Authorization: `Bearer ${globalThis.TK}` } });
      buf = Buffer.from(await dl.arrayBuffer());
      break;
    }
    if (r?.job_status > 2) throw new Error('导出失败 job_status=' + r.job_status);
  }
  if (!buf) throw new Error('导出超时');
  console.log(`docx 大小: ${buf.length} bytes`);

  // 5. 转 markdown（图片落盘）
  const imgDir = path.resolve('public/images', node.node_token);
  let idx = 0;
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  const { value: html } = await mammoth.convertToHtml({ buffer: buf }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      idx += 1;
      const ext = image.contentType.split('/')[1] || 'png';
      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(path.join(imgDir, `img-${idx}.${ext}`), await image.readAsBuffer());
      return { src: `/images/${node.node_token}/img-${idx}.${ext}` };
    }),
  });
  let md = turndown.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
  md = md.replace(/^#\s+.+\n+/, '');

  // 6. 写入
  const pubDate = new Date(Number(node.obj_create_time) * 1000).toISOString().slice(0, 10);
  const safe = node.title.replace(/[\\/:*?"<>|#%&{}\s]+/g, '-').slice(0, 60);
  const outDir = path.resolve('src/content', TARGET);
  await fs.mkdir(outDir, { recursive: true });
  const front = ['---', `title: "${node.title.replace(/"/g, '\\"')}"`, `pubDate: ${pubDate}`, 'tags: [飞书同步]', '---', ''].join('\n');
  await fs.writeFile(path.join(outDir, `${safe}.md`), front + md + '\n', 'utf-8');
  console.log(`✓ 已写入 src/content/${TARGET}/${safe}.md（${md.length} 字符，${idx} 张图片）`);
  console.log('--- 前 400 字预览 ---');
  console.log(md.slice(0, 400));
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
