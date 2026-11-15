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

// ---------- 7. 每个路由生成独立 HTML（canonical / title / description 各不相同） ----------
// 单页应用默认所有路径返回同一份 index.html，导致每个页面都自称「首页的副本」，
// 搜索引擎会把 /products、/about、/contact 判为重复页面而拒绝收录。
// 这里给每个路由落一份独立 HTML，只改 head，不动页面渲染逻辑。
//
// description 控制在 100–150 字符：过长或过短 Bing 会报「Meta Description too long or too short」。
const routes = ['/', '/products', '/about', '/contact'];

const PAGES = {
  '/': {
    title: 'Ruiying — Commercial Equipment OEM / ODM',
    desc: 'Ruiying develops smart vending machines, commercial entertainment equipment and self-service solutions for global OEM / ODM buyers.',
  },
  '/products': {
    title: 'Products — Vending & Entertainment Equipment | Ruiying',
    desc: '17 vending, entertainment and self-service equipment lines for OEM / ODM buyers, from popcorn machines to VR rides.',
  },
  '/about': {
    title: 'About Ruiying — Vending Equipment Supplier & OEM Partner',
    desc: 'Guangzhou based supplier of vending and entertainment equipment, serving overseas OEM / ODM projects with CE approved hardware.',
  },
  '/contact': {
    title: 'Contact Ruiying — OEM / ODM Inquiry',
    desc: 'Talk to Ruiying about your vending or entertainment equipment project. Email, WhatsApp and phone for OEM / ODM buyers.',
  },
};

function applyMeta(html, { title, desc, url }) {
  let out = html;
  if (/<title>[^<]*<\/title>/.test(out)) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  } else {
    out = out.replace('</head>', `  <title>${title}</title>\n  </head>`);
  }
  if (/<meta name="description"[^>]*>/.test(out)) {
    out = out.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${desc}" />`);
  } else {
    out = out.replace('</head>', `  <meta name="description" content="${desc}" />\n  </head>`);
  }
  if (/<link rel="canonical"[^>]*>/.test(out)) {
    out = out.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
  } else {
    out = out.replace('</head>', `  <link rel="canonical" href="${url}" />\n  </head>`);
  }
  if (/<meta property="og:url"[^>]*>/.test(out)) {
    out = out.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`);
  } else {
    out = out.replace('</head>', `  <meta property="og:url" content="${url}" />\n  </head>`);
  }
  if (/<meta property="og:title"[^>]*>/.test(out)) {
    out = out.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}" />`);
  } else {
    out = out.replace('</head>', `  <meta property="og:title" content="${title}" />\n  </head>`);
  }
  return out;
}

// ---------- 7b. 预渲染静态正文 ----------
// 基线是纯前端渲染：原始 HTML 里 <div id="root"></div> 是空的，页面只有 838 字节，
// 搜索引擎抓到的相当于空白页（Bing 因此报 H1 tag missing、判为 discovered but not crawled）。
// 这里把每个路由的正文以静态 HTML 写进 #root，React 挂载后会整体替换，用户看到不变。
const escHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const H1 = 'font-family:var(--font-display,system-ui,sans-serif);font-size:clamp(26px,4vw,42px);line-height:1.15;margin:0 0 14px;color:var(--color-text,#17212b)';
const LEAD = 'font-size:17px;line-height:1.6;color:var(--color-text-muted,#5c6b7a);margin:0 0 22px;max-width:760px';
const P = 'line-height:1.65;margin:0 0 14px;max-width:760px';
const H2 = 'font-family:var(--font-display,system-ui,sans-serif);font-size:20px;margin:32px 0 12px;color:var(--color-text,#17212b)';
const LI = 'background:#fff;border:1px solid var(--color-border,#d9e2ea);border-radius:12px;padding:14px 16px';
const MUTED = 'color:var(--color-text-muted,#5c6b7a);font-size:14px;line-height:1.5;margin-top:6px';

const navHtml = `<nav style="font-size:14px;margin-bottom:26px">
  <a href="/">Home</a> ·
  <a href="/products">Products</a> ·
  <a href="/about">About Us</a> ·
  <a href="/contact">Contact</a>
</nav>`;

const contactHtml = `
<h2 style="${H2}">Contact</h2>
<p style="${P}">
  Email: <a href="mailto:${escHtml(site.email || 'quinn@gzruiying.com')}">${escHtml(site.email || 'quinn@gzruiying.com')}</a><br />
  Phone / WhatsApp: ${escHtml(site.phoneDisplay || '+86 198 0203 8683')}<br />
  Address: 1 Hengjun Avenue, Lingbian Village, Shiqi Town, Panyu District, Guangzhou, China
</p>`;

const productItems = products
  .map(
    (p) => `<li style="${LI}">
    <a href="/contact?product=${encodeURIComponent(p.name)}"><strong style="font-size:16px">${escHtml(p.name)}</strong></a>
    <div style="${MUTED}">Model: ${escHtml(p.model)} · Category: ${escHtml(p.category)}</div>
    <div style="${MUTED}">${escHtml(p.copy)}</div>
    <div style="${MUTED}">${p.specs.map((s) => escHtml(s)).join(' · ')}</div>
  </li>`
  )
  .join('\n');

const PRERENDER = {
  '/': `<div style="max-width:1100px;margin:0 auto;padding:28px 20px">
    ${navHtml}
    <h1 style="${H1}">Ruiying — Commercial Equipment OEM / ODM</h1>
    <p style="${LEAD}">Guangzhou-based supplier of smart vending machines, commercial entertainment equipment and self-service solutions, serving OEM / ODM buyers in the United States, Europe, Mexico and the Middle East.</p>
    <p style="${P}">Ruiying supports equipment sourcing and OEM / ODM cooperation across ${products.length} equipment lines, from popcorn and ice cream vending machines to VR rides, claw machines and self-service kiosks. Every unit is configured for the destination market — 110V / 220V, local payment terminals and CE documentation where required.</p>
    <h2 style="${H2}">Equipment lines</h2>
    <ul style="list-style:none;padding:0;margin:0;display:grid;gap:10px">
      ${productItems}
    </ul>
    ${contactHtml}
  </div>`,

  '/products': `<div style="max-width:1100px;margin:0 auto;padding:28px 20px">
    ${navHtml}
    <h1 style="${H1}">Products — Vending &amp; Entertainment Equipment</h1>
    <p style="${LEAD}">${products.length} vending, entertainment and self-service equipment lines for OEM / ODM buyers, from popcorn machines to VR rides.</p>
    <p style="${P}">Each listing shows the model, the short sales description and the key technical points. Tell us the model you are interested in and we will send the full spec sheet, options list and quotation.</p>
    <h2 style="${H2}">Full catalogue</h2>
    <ul style="list-style:none;padding:0;margin:0;display:grid;gap:10px">
      ${productItems}
    </ul>
    ${contactHtml}
  </div>`,

  '/about': `<div style="max-width:1100px;margin:0 auto;padding:28px 20px">
    ${navHtml}
    <h1 style="${H1}">About Ruiying — Vending Equipment Supplier &amp; OEM Partner</h1>
    <p style="${LEAD}">Guangzhou Ruiying Electronic Equipment supplies smart vending machines, entertainment equipment and self-service solutions to overseas distributors, operators and brand owners.</p>
    <p style="${P}">We work as an engineering and sourcing partner rather than a pure reseller: equipment is specified for the destination market, adapted for local payment and power standards, and documented for import clearance. Ruiying covers ${products.length} equipment lines across vending, food and treat equipment and commercial entertainment.</p>
    <p style="${P}">Typical cooperation models are OEM (your branding, your packaging, your firmware language) and ODM (our proven platform adapted to your market). Volume programmes are supported with spare parts planning, remote monitoring and after-sales documentation.</p>
    <p style="${P}"><a href="/products">Browse the equipment catalogue</a> or <a href="/contact">send a project inquiry</a>.</p>
    ${contactHtml}
  </div>`,

  '/contact': `<div style="max-width:1100px;margin:0 auto;padding:28px 20px">
    ${navHtml}
    <h1 style="${H1}">Contact Ruiying — OEM / ODM Inquiry</h1>
    <p style="${LEAD}">Tell us what equipment you are looking for, your target market and project stage. Ruiying supports equipment sourcing and OEM / ODM cooperation for the United States, Europe, Mexico and the Middle East.</p>
    <p style="${P}">Write to us with the model or equipment type, the voltage and payment configuration required for your market, and your target quantity. We reply with the spec sheet, options list and an indicative quotation.</p>
    ${contactHtml}
    <p style="${P}">See also: <a href="/products">equipment catalogue</a>, <a href="/about">about Ruiying</a>.</p>
  </div>`,
};

function injectPrerender(html, route) {
  const inner = PRERENDER[route];
  if (!inner) return html;
  if (html.includes('<div id="root"></div>')) {
    return html.replace('<div id="root"></div>', `<div id="root">${inner}</div>`);
  }
  return html.replace(/<div id="root"[^>]*><\/div>/, `<div id="root">${inner}</div>`);
}

const domain = (site.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
if (domain) {
  const baseFile = path.join(DIST, 'index.html');
  const baseHtml = fs.readFileSync(baseFile, 'utf8');

  for (const r of routes) {
    const meta = PAGES[r];
    const url = `https://${domain}${r}`;
    const html = injectPrerender(applyMeta(baseHtml, { title: meta.title, desc: meta.desc, url }), r);

    if (r === '/') {
      fs.writeFileSync(baseFile, html, 'utf8');
    } else {
      // 用平铺文件（dist/products.html）而不是目录（dist/products/index.html）：
      // 目录形式会让 Netlify 把 /products 301 跳到 /products/，
      // 与 canonical 里的 /products 不一致，又会被判成「替代版本」。
      fs.writeFileSync(path.join(DIST, `${r.slice(1)}.html`), html, 'utf8');
    }
  }
  log(`✓ 已生成 ${routes.length} 个页面（各自独立 canonical / title / description）`);

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
  warn.push('content/site.json 未设置 domain，跳过 canonical、分页面 HTML 与 sitemap');
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
