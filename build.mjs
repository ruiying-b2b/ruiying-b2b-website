// 构建脚本：把站点基线 site/ 复制到 dist/，再把 content/*.json 里的内容注入进去。
// 构建命令（Netlify）：npm run build → node build.mjs
//
// 可选环境变量：
//   SKIP_INDEXNOW=1   跳过 IndexNow 推送（本地调试用）
//   INDEXNOW_KEY=xxx  覆盖 IndexNow 密钥（默认用仓库里 site/<key>.txt 那一串）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'site');
const DIST = path.join(ROOT, 'dist');
const CONTENT = path.join(ROOT, 'content');

const warn = [];
const log = (...a) => console.log(...a);

// ---------- 1. 复制基线 ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SRC, DIST, { recursive: true });
log(`✓ 复制基线站点 → dist/`);

// ---------- 2. 读取并校验产品数据 ----------
const productsFile = path.join(CONTENT, 'products.json');
if (!fs.existsSync(productsFile)) throw new Error('缺少 content/products.json');
const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));

if (!Array.isArray(products) || products.length === 0) {
  throw new Error('content/products.json 不是数组或为空，构建中止（避免把线上产品清空）');
}

const REQUIRED = ['id', 'name', 'model', 'category', 'image', 'copy', 'specs'];
for (const p of products) {
  for (const k of REQUIRED) {
    if (p[k] === undefined || p[k] === null || p[k] === '') {
      throw new Error(`产品 id=${p.id ?? '?'} 缺少必填字段「${k}」`);
    }
  }
  if (!Array.isArray(p.specs)) p.specs = [];
  if (!Array.isArray(p.gallery)) p.gallery = [];
  if (typeof p.id !== 'number') p.id = Number(p.id);
}
products.sort((a, b) => a.id - b.id);
log(`✓ 读取产品 ${products.length} 条`);

// ---------- 3. 定位 bundle ----------
const assetsDir = path.join(DIST, 'assets');
const bundleName = fs.readdirSync(assetsDir).find((f) => /^index-.*\.js$/.test(f));
if (!bundleName) throw new Error('dist/assets 下找不到 index-*.js');
const bundlePath = path.join(assetsDir, bundleName);
let code = fs.readFileSync(bundlePath, 'utf8');

// ---------- 4. 替换产品数组 ----------
const MARKER = '[{id:';
const start = code.indexOf(MARKER);
if (start < 0) throw new Error('bundle 中找不到产品数组（[{id:），改动基线后需要同步更新构建脚本');

let depth = 0;
let i = start;
let inStr = null;
let esc = false;
while (i < code.length) {
  const ch = code[i];
  if (inStr) {
    if (esc) esc = false;
    else if (ch === '\\') esc = true;
    else if (ch === inStr) inStr = null;
  } else if (ch === '"' || ch === "'" || ch === '`') {
    inStr = ch;
  } else if (ch === '[') {
    depth += 1;
  } else if (ch === ']') {
    depth -= 1;
    if (depth === 0) {
      i += 1;
      break;
    }
  }
  i += 1;
}
const end = i;
const oldLen = end - start;
const injected = JSON.stringify(products);
code = code.slice(0, start) + injected + code.slice(end);
log(`✓ 产品数组已注入（${oldLen} → ${injected.length} 字符）`);

// ---------- 5. 联系方式 ----------
const siteFile = path.join(CONTENT, 'site.json');
let site = {};
if (fs.existsSync(siteFile)) {
  site = JSON.parse(fs.readFileSync(siteFile, 'utf8'));
} else {
  warn.push('缺少 content/site.json，联系方式未替换');
}

const waDigits = String(site.whatsappNumber || '').replace(/\D/g, '');
const patches = [
  ['quinn@gzruiying.com', site.email],
  ['https://wa.me/8619802038683', waDigits ? `https://wa.me/${waDigits}` : ''],
  ['+86 198 0203 8683', site.phoneDisplay],
];
for (const [from, to] of patches) {
  if (!to) continue;
  if (!code.includes(from)) {
    warn.push(`联系方式原文「${from}」在站点中已不存在，跳过替换`);
    continue;
  }
  code = code.split(from).join(to);
}
log('✓ 联系方式已同步');

fs.writeFileSync(bundlePath, code, 'utf8');

// ---------- 6. 校验图片是否存在 ----------
let missing = 0;
for (const p of products) {
  const files = [p.image, ...p.gallery].filter(Boolean);
  for (const f of files) {
    const rel = f.startsWith('/') ? f.slice(1) : f;
    if (!fs.existsSync(path.join(DIST, rel))) {
      warn.push(`产品 id=${p.id} 的图片不存在：${f}`);
      missing += 1;
    }
  }
}
log(`✓ 图片检查完成，缺失 ${missing} 个`);

// ---------- 7. canonical + sitemap ----------
const routes = ['/', '/products', '/about', '/contact'];
const domain = (site.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
if (domain) {
  const idx = path.join(DIST, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  if (!html.includes('rel="canonical"')) {
    html = html.replace(
      '</head>',
      `  <link rel="canonical" href="https://${domain}/" />\n  <meta property="og:url" content="https://${domain}/" />\n  </head>`
    );
    fs.writeFileSync(idx, html, 'utf8');
    log(`✓ 已写入 canonical：https://${domain}/`);
  }

  const urls = routes
    .map((r) => `  <url><loc>https://${domain}${r}</loc><changefreq>monthly</changefreq></url>`)
    .join('\n');
  fs.writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    'utf8'
  );
  log('✓ 已生成 sitemap.xml');
} else {
  warn.push('content/site.json 未设置 domain，跳过 canonical 与 sitemap');
}

// ---------- 8. 汇总 ----------
const total = fs.readdirSync(DIST).length;
log(`\n构建完成 → dist/（顶层 ${total} 项）`);
if (warn.length) {
  log('\n⚠ 警告：');
  for (const w of warn) log('  - ' + w);
}

// ---------- 9. IndexNow 推送（Bing / Yandex 快速收录，失败绝不影响部署） ----------
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || 'DDACBDC9CB797706119AA3421D34940E';

async function pingIndexNow() {
  if (!domain) {
    log('· 没有 domain，跳过 IndexNow 推送');
    return;
  }
  if (process.env.SKIP_INDEXNOW === '1') {
    log('· 已跳过 IndexNow 推送（SKIP_INDEXNOW=1）');
    return;
  }
  if (process.env.CONTEXT && process.env.CONTEXT !== 'production') {
    log(`· 非生产构建（CONTEXT=${process.env.CONTEXT}），跳过 IndexNow 推送`);
    return;
  }
  const payload = {
    host: domain,
    key: INDEXNOW_KEY,
    keyLocation: `https://${domain}/${INDEXNOW_KEY}.txt`,
    urlList: routes.map((r) => `https://${domain}${r}`),
  };
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  log(`✓ IndexNow 已推送 ${payload.urlList.length} 个 URL（HTTP ${res.status}）`);
}

pingIndexNow().catch((e) => {
  log(`⚠ IndexNow 推送失败（不影响部署）：${e.message}`);
});
