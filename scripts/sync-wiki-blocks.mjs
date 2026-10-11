// Feishu wiki sync via docx blocks API (faithful headings/code/images -> markdown)
// Usage: node scripts/sync-wiki-blocks.mjs scripts/wiki-seeds.txt posts
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const [, , seedsFile, collection = 'posts'] = process.argv;

const CONTENT_DIR = path.resolve('src/content', collection);
const IMAGES_DIR = path.resolve('public/images');

// ---------- token / api ----------
let tokenCache = { token: null, exp: 0 };
async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('token error: ' + JSON.stringify(j));
  tokenCache = { token: j.tenant_access_token, exp: Date.now() + (j.expire - 120) * 1000 };
  return tokenCache.token;
}
async function api(url) {
  const t = await getToken();
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t } });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`api ${url} -> ${j.code} ${j.msg}`);
  return j.data;
}

// ---------- block fetching ----------
async function getAllBlocks(docToken) {
  const items = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ page_size: '500' });
    if (pageToken) q.set('page_token', pageToken);
    const data = await api(`https://open.feishu.cn/open-apis/docx/v1/documents/${docToken}/blocks?${q}`);
    items.push(...data.items);
    pageToken = data.has_more ? data.page_token : '';
  } while (pageToken);
  return items;
}

// ---------- code language map ----------
const LANG = { 1:'', 7:'bash', 8:'csharp', 9:'cpp', 10:'c', 12:'css', 13:'coffeescript', 18:'dockerfile', 22:'go', 24:'html', 28:'json', 29:'java', 30:'javascript', 31:'julia', 32:'kotlin', 36:'lua', 37:'matlab', 38:'makefile', 39:'markdown', 40:'nginx', 41:'objectivec', 43:'php', 44:'perl', 46:'powershell', 48:'protobuf', 49:'python', 50:'r', 52:'ruby', 53:'rust', 55:'scss', 56:'sql', 57:'scala', 60:'shell', 61:'swift', 63:'typescript', 65:'vb', 66:'xml', 67:'yaml', 68:'cmake', 69:'diff', 73:'graphql' };

// ---------- markdown rendering ----------
function escapeText(s) { return s.replace(/([*_~`\\<])/g, '\\$1'); }

function renderElements(elements, opts = {}) {
  if (!elements) return '';
  let out = '';
  for (const el of elements) {
    if (el.text_run) {
      const style = el.text_run.text_element_style || {};
      let text = el.text_run.content;
      if (style.inline_code) { out += '`' + text + '`'; continue; }
      if (!opts.raw) text = escapeText(text);
      if (style.bold) text = '**' + text + '**';
      if (style.italic) text = '*' + text + '*';
      if (style.strikethrough) text = '~~' + text + '~~';
      if (style.link && style.link.url) {
        const url = decodeURIComponent(style.link.url).replace(/^https?:\/\/.*?feishu\.cn\/redirect_url\?url=/, '');
        out += '[' + text + '](' + url + ')';
      } else out += text;
    } else if (el.equation) {
      out += '$' + (el.equation.content || '') + '$';
    } else if (el.mention_doc) {
      const m = el.mention_doc;
      out += `[${m.title || '文档'}](${m.url || ''})`;
    }
  }
  return out;
}

function mdConverter(blocks, docToken, nodeToken, imgMap, stats) {
  const byId = Object.fromEntries(blocks.map(b => [b.block_id, b]));
  const page = blocks.find(b => b.block_type === 1);
  const rootChildren = page ? page.children || [] : [];

  function bulletItems(ids, indent, ordered, out) {
    let n = 1;
    for (const id of ids) {
      const b = byId[id];
      if (!b) continue;
      const prefix = ordered ? `${n++}. ` : '- ';
      const text = renderElements(b[ordered ? 'ordered' : 'bullet']?.elements || b.text?.elements);
      out.push('  '.repeat(indent) + prefix + text);
      const kids = (b.children || []).filter(cid => byId[cid]);
      for (const cid of kids) renderBlock(byId[cid], indent + 1, out);
    }
  }

  function renderBlock(b, indent, out) {
    const t = b.block_type;
    switch (t) {
      case 2: out.push(renderElements(b.text?.elements)); break;
      case 3: case 4: case 5: case 6: case 7: case 8: case 9: case 10: case 11: {
        const level = t - 2; // heading1 -> #
        const key = 'heading' + level;
        let txt = renderElements(b[key]?.elements || b.text?.elements, { raw: true }).replace(/^#/, '').trim();
        // strip leading escaped '#'
      out.push('#'.repeat(level + 1) + ' ' + txt);
        break;
      }
      case 12: break; // handled via bulletItems
      case 13: break;
      case 14: {
        const lang = LANG[b.code?.language] || '';
        const text = (b.code?.elements || []).map(el => (el.text_run ? el.text_run.content : '')).join('');
        const codeLines = text.replace(/\n+$/, '').split('\n');
        out.push('```' + lang, ...codeLines, '```');
        stats.codeBlocks++;
        break;
      }
      case 15: { // quote
        const lines = (b.children || []).map(cid => {
          const cb = byId[cid];
          return cb ? renderElements(cb.text?.elements) : '';
        }).filter(Boolean).map(l => '> ' + l);
        out.push(...lines, '');
        break;
      }
      case 17: { // todo
        const done = b.todo?.style?.done;
        out.push((done ? '- [x] ' : '- [ ] ') + renderElements(b.todo?.elements || b.text?.elements));
        break;
      }
      case 19: { // callout -> blockquote
        const lines = (b.children || []).map(cid => {
          const cb = byId[cid];
          return cb ? renderBlock(cb, 0, []) && '' : '';
        });
        const inner = [];
        for (const cid of b.children || []) { const cb = byId[cid]; if (cb) renderBlock(cb, 0, inner); }
        out.push('', ...inner.filter(x => x !== undefined && x !== '').map(l => '> ' + l), '');
        break;
      }
      case 22: out.push('---'); break;
      case 27: {
        const tok = b.image?.token;
        if (!tok) break;
        if (!imgMap.has(tok)) imgMap.set(tok, `img-${imgMap.size + 1}.png`);
        const fname = imgMap.get(tok);
        out.push(`![](/images/${nodeToken}/${fname})`);
        stats.images++;
        break;
      }
      case 34: { // quote_container
        const inner = [];
        for (const cid of b.children || []) { const cb = byId[cid]; if (cb) renderBlock(cb, 0, inner); }
        out.push('', ...inner.filter(Boolean).map(l => '> ' + l), '');
        break;
      }
      case 31: { // table
        const prop = b.table?.property || {};
        const rows = prop.row_size || 0;
        const cols = prop.column_size || 0;
        const cells = (b.table?.cells || []).map(cid => byId[cid]);
        if (rows && cols && cells.length === rows * cols) {
          const grid = [];
          for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
              const cell = cells[r * cols + c];
              const inner = [];
              for (const kid of cell?.children || []) { const kb = byId[kid]; if (kb) renderBlock(kb, 0, inner); }
              row.push((inner.join(' ').replace(/\|/g, '\\|') || ' ').replace(/\n/g, ' '));
            }
            grid.push(row);
          }
          out.push('| ' + grid[0].join(' | ') + ' |');
          out.push('| ' + grid[0].map(() => '---').join(' | ') + ' |');
          for (let r = 1; r < rows; r++) out.push('| ' + grid[r].join(' | ') + ' |');
        }
        break;
      }
      default: {
        // unknown container: recurse children; leaf unknown: skip
        const kids = (b.children || []).filter(cid => byId[cid]);
        if (kids.length) {
          for (const cid of kids) renderBlock(byId[cid], indent, out);
        } else {
          stats.skipped.add(t);
        }
      }
    }
  }

  const out = [];
  let i = 0;
  while (i < rootChildren.length) {
    const b = byId[rootChildren[i]];
    if (!b) { i++; continue; }
    if (b.block_type === 12 || b.block_type === 13) {
      const ordered = b.block_type === 13;
      const group = [];
      let j = i;
      while (j < rootChildren.length && byId[rootChildren[j]]?.block_type === (ordered ? 13 : 12)) group.push(rootChildren[j++]);
      bulletItems(group, 0, ordered, out);
      i = j;
    } else {
      renderBlock(b, 0, out);
      i++;
    }
  }
  return out;
}

// ---------- image download ----------
async function downloadImages(docToken, imgMap, nodeToken) {
  const dir = path.join(IMAGES_DIR, nodeToken);
  fs.mkdirSync(dir, { recursive: true });
  const t = await getToken();
  for (const [tok, fname] of imgMap) {
    const fp = path.join(dir, fname);
    if (fs.existsSync(fp)) continue;
    const r = await fetch(`https://open.feishu.cn/open-apis/drive/v1/medias/${tok}/download`, { headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) { console.log('  ! image download failed', tok, r.status); continue; }
    fs.writeFileSync(fp, Buffer.from(await r.arrayBuffer()));
  }
}

// ---------- main ----------
// insert blank lines between block-level lines so markdown paragraphs don't merge
function spacify(lines) {
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) inFence = !inFence;
    out.push(line);
    if (inFence || i === lines.length - 1) continue;
    const next = lines[i + 1];
    if (!line.trim() || !next.trim()) continue;
    if (line.startsWith('|') && next.startsWith('|')) continue; // table rows
    if (line.startsWith('#') || next.startsWith('#')) out.push(''); // around headings
    else if (line.startsWith('```') || next.startsWith('```')) out.push('');
    else out.push('');
  }
  return out;
}

async function main() {
  const tokens = fs.readFileSync(seedsFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const queue = [...new Set(tokens)];
  const seen = new Set(queue);
  let ok = 0, fail = 0;

  while (queue.length) {
    const nodeToken = queue.shift();
    try {
      const data = await api(`https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${nodeToken}`);
      const node = data.node;
      if (node.obj_type !== 'docx') { console.log(`skip ${nodeToken} (${node.obj_type})`); continue; }
      const docToken = node.obj_token;
      const blocks = await getAllBlocks(docToken);

      const stats = { codeBlocks: 0, images: 0, skipped: new Set() };
      const imgMap = new Map();
      const body = mdConverter(blocks, docToken, nodeToken, imgMap, stats).join('\n');

      // discover wiki links
      const re = /feishu\.cn\/wiki\/([A-Za-z0-9]+)/g;
      let m;
      while ((m = re.exec(body))) {
        const t2 = m[1];
        if (!seen.has(t2)) { seen.add(t2); queue.push(t2); console.log('  + discovered wiki node', t2); }
      }

      await downloadImages(docToken, imgMap, nodeToken);

      const title = (node.title || nodeToken).replace(/[\\/:*?"<>|#]/g, '-').trim();
      // drop a leading H1 identical to title to avoid duplication
      const lines = body.split('\n');
      let start = 0;
      if (lines[0]?.startsWith('# ') && lines[0].slice(2).trim() === title) start = 1;
      const md = `---\ntitle: "${title}"\ndescription: ""\npubDate: ${new Date(+node.obj_create_time * 1000).toISOString().slice(0, 10)}\ntags: [飞书同步]\n---\n\n` + spacify(lines.slice(start)).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
      fs.writeFileSync(path.join(CONTENT_DIR, title + '.md'), md);
      console.log(`ok ${title} (${blocks.length} blocks, ${stats.codeBlocks} code, ${stats.images} imgs${stats.skipped.size ? ', skipped types: ' + [...stats.skipped].join(',') : ''})`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${nodeToken}:`, e.message);
      fail++;
    }
  }
  console.log(`\ndone: ${ok} ok, ${fail} failed`);
}
main().catch(e => { console.error(e); process.exit(1); });
