// 构建脚本：site/ 基线 → dist/，注入 content/*.json 的内容，再生成各页面、sitemap、IndexNow。
// 运行：node build.mjs（或 npm run build）。本地调试用 SKIP_INDEXNOW=1 node build.mjs。
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
log('✓ 复制基线站点 → dist/');

// ---------- 2. 读取并校验产品 ----------
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

// ---------- 2b. 产品页地址（slug） ----------
// 每个产品落一页 /products/<slug>/：页面数 4 → 21，长尾型号能单独被搜到。
// slug = 产品名 + 型号短码，同名不同型号（PR30 / PR31）才不撞车。
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');

const codeOf = (p) => String(p.model).split('/').pop().trim();
const usedSlugs = new Set();
for (const p of products) {
  const nameSlug = slugify(p.name);
  const codeSlug = slugify(codeOf(p));
  const base = codeSlug && codeSlug !== nameSlug ? `${nameSlug}-${codeSlug}` : nameSlug;
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
  if (slug !== base) warn.push(`产品 id=${p.id} 的 slug「${base}」重复，已改为「${slug}」`);
  usedSlugs.add(slug);
  p.slug = slug;
  p.code = codeOf(p);
  p.url = `/products/${slug}/`;
}
log(`✓ 已分配 ${products.length} 个产品页地址`);

// ---------- 2c. 图片文件名去中文 ----------
// 微信导出的图集叫「微信图片_....webp」，中文名会原样进 URL，分享出去是一串百分号编码。
// 只在 dist/ 里改名，仓库原图不动；改名要在注入 bundle 之前，否则前端引用会 404。
const asciiName = (p, kind, idx, oldPath) => {
  const base = path.basename(oldPath);
  if (!/[^\x00-\x7F]/.test(base)) return oldPath;
  const ext = (path.extname(base) || '.webp').toLowerCase();
  const dir = path.dirname(oldPath);
  const newPath = `${dir}/${p.slug}-${kind === 'main' ? 'main' : `gallery-${idx + 1}`}${ext}`;
  const absOld = path.join(DIST, oldPath.replace(/^\//, ''));
  const absNew = path.join(DIST, newPath.replace(/^\//, ''));
  if (fs.existsSync(absOld) && !fs.existsSync(absNew)) fs.renameSync(absOld, absNew);
  return newPath;
};
for (const p of products) {
  p.image = asciiName(p, 'main', 0, p.image);
  p.gallery = p.gallery.map((g, idx) => asciiName(p, 'gallery', idx, g));
}
log('✓ 图片文件名已改为 ASCII（仅 dist/）');

// ---------- 3. 定位 bundle ----------
const assetsDir = path.join(DIST, 'assets');
const bundleName = fs.readdirSync(assetsDir).find((f) => /^index-.*\.js$/.test(f));
if (!bundleName) throw new Error('dist/assets 下找不到 index-*.js');
const bundlePath = path.join(assetsDir, bundleName);
let code = fs.readFileSync(bundlePath, 'utf8');

// ---------- 4. 注入产品数组 ----------
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
const injected = JSON.stringify(
  products.map((p) => ({
    id: p.id,
    name: p.name,
    model: p.model,
    category: p.category,
    image: p.image,
    copy: p.copy,
    specs: p.specs,
    gallery: p.gallery,
    url: p.url,
  }))
);
const oldLen = i - start;
code = code.slice(0, start) + injected + code.slice(i);
log(`✓ 产品数组已注入（${oldLen} → ${injected.length} 字符）`);

// ---------- 5. 联系方式 ----------
const siteFile = path.join(CONTENT, 'site.json');
let site = {};
if (fs.existsSync(siteFile)) site = JSON.parse(fs.readFileSync(siteFile, 'utf8'));
else warn.push('缺少 content/site.json，联系方式未替换');

const waDigits = String(site.whatsappNumber || '').replace(/\D/g, '');
for (const [from, to] of [
  ['quinn@gzruiying.com', site.email],
  ['https://wa.me/8619802038683', waDigits ? `https://wa.me/${waDigits}` : ''],
  ['+86 198 0203 8683', site.phoneDisplay],
]) {
  if (!to) continue;
  if (!code.includes(from)) {
    warn.push(`联系方式原文「${from}」在站点中已不存在，跳过替换`);
    continue;
  }
  code = code.split(from).join(to);
}
log('✓ 联系方式已同步');

// ---------- 5b. 界面文案英文化 + 产品图 alt ----------
// Bing 报「Alt attribute for images is missing — 10 instances」：图集缩略图是 alt:"".
// 「设备示意图」在模板串内部（`${e.name}设备示意图`），换成 ' ${e.model} - ...' 就把型号插进 alt。
const TEXT_PATCHES = [
  ['to:`/contact?product=${encodeURIComponent(e.name)}`', 'to:e.url||`/products/`'],
  ['设备示意图', ' ${e.model} - Ruiying product photo'],
  ['alt:""', 'alt:`${e.name} ${e.model} - product image ${u + 1}`'],
  ['图片浏览', ' product images'],
  ['图片 ', ' image '],
  ['获取参数 ', 'View specs '],
  ['这条路径还没有内容。', 'This page does not exist.'],
  ['返回首页', 'Back to home'],
];
for (const [from, to] of TEXT_PATCHES) {
  if (!code.includes(from)) {
    warn.push(`文案补丁未命中（可能基线已改）：${from}`);
    continue;
  }
  code = code.split(from).join(to);
}
log('✓ 界面文案已英文化，产品图 alt 已补齐');
fs.writeFileSync(bundlePath, code, 'utf8');

// ---------- 6. 图片存在性 ----------
let missing = 0;
for (const p of products) {
  for (const f of [p.image, ...p.gallery].filter(Boolean)) {
    if (!fs.existsSync(path.join(DIST, String(f).replace(/^\//, '')))) {
      warn.push(`产品 id=${p.id} 的图片不存在：${f}`);
      missing += 1;
    }
  }
}
log(`✓ 图片检查完成，缺失 ${missing} 个`);

// ---------- 7. 各路由独立 HTML ----------
// 纯前端渲染的站点，所有路径返回同一份 index.html，canonical 都指向首页，
// 搜索引擎判为重复页面而拒绝收录。这里给每个路由落一份只改 head 的独立 HTML。
// GitHub Pages 没有无扩展名改写，所以用目录形式（products/index.html → /products/）。
const routes = ['/', '/products/', '/about/', '/contact/'];

const PAGES = {
  '/': {
    title: 'Ruiying — Commercial Equipment OEM / ODM',
    desc: 'Ruiying develops smart vending machines, commercial entertainment equipment and self-service solutions for global OEM / ODM buyers.',
  },
  '/products/': {
    title: 'Products — Vending & Entertainment Equipment | Ruiying',
    desc: `${products.length} vending, entertainment and self-service equipment lines for OEM / ODM buyers, from popcorn machines to VR rides.`,
  },
  '/about/': {
    title: 'About Ruiying — Vending Equipment Supplier & OEM Partner',
    desc: 'Guangzhou based supplier of vending and entertainment equipment, serving overseas OEM / ODM projects with CE approved hardware.',
  },
  '/contact/': {
    title: 'Contact Ruiying — OEM / ODM Inquiry',
    desc: 'Talk to Ruiying about your vending or entertainment equipment project. Email, WhatsApp and phone for OEM / ODM buyers.',
  },
};

function applyMeta(html, { title, desc, url }) {
  const setTag = (re, tag) => {
    if (re.test(html)) html = html.replace(re, tag);
    else html = html.replace('</head>', `  ${tag}\n  </head>`);
  };
  setTag(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  setTag(/<meta name="description"[^>]*>/, `<meta name="description" content="${desc}" />`);
  setTag(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
  setTag(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`);
  setTag(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}" />`);
  return html;
}

// ---------- 7b. 预渲染正文 ----------
// 原始 HTML 只有一个空的 <div id="root"></div>（838 字节），爬虫默认不跑 JS，看到的是空白页。
// 这里把正文静态写进 #root，React 挂载后整体替换，用户看到的仍是原设计。
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
const THUMB = 'width:100%;max-width:180px;height:auto;border:1px solid var(--color-border,#d9e2ea);border-radius:8px;background:#fff';

const navHtml = `<nav style="font-size:14px;margin-bottom:26px">
  <a href="/">Home</a> ·
  <a href="/products/">Products</a> ·
  <a href="/about/">About Us</a> ·
  <a href="/contact/">Contact</a>
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
    <a href="${p.url}" style="display:block;margin-bottom:10px">
      <img src="${escHtml(p.image)}" alt="${escHtml(`${p.name} ${p.model} - product photo by Ruiying`)}" style="${THUMB}" loading="lazy" decoding="async" />
    </a>
    <a href="${p.url}"><strong style="font-size:16px">${escHtml(p.name)}</strong></a>
    <div style="${MUTED}">Model: ${escHtml(p.model)} · Category: ${escHtml(p.category)}</div>
    <div style="${MUTED}">${escHtml(p.copy)}</div>
    <div style="${MUTED}">${p.specs.map((s) => escHtml(s)).join(' · ')}</div>
    <div style="${MUTED}"><a href="${p.url}">Full specifications</a> · <a href="/contact/?product=${encodeURIComponent(p.name)}">Request a quote</a></div>
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

  '/products/': `<div style="max-width:1100px;margin:0 auto;padding:28px 20px">
    ${navHtml}
    <h1 style="${H1}">Products — Vending &amp; Entertainment Equipment</h1>
    <p style="${LEAD}">${products.length} vending, entertainment and self-service equipment lines for OEM / ODM buyers, from popcorn machines to VR rides.</p>
    <p style="${P}">Each listing shows the model, the short sales description and the key technical points. Open a product page for the full specification, or tell us the model you are interested in and we will send the spec sheet, options list and quotation.</p>
    <h2 style="${H2}">Full catalogue</h2>
    <ul style="list-style:none;padding:0;margin:0;display:grid;gap:10px">
      ${productItems}
    </ul>
    ${contactHtml}
  </div>`,

  '/about/': `<div style="max-width:1100px;margin:0 auto;padding:28px 20px">
    ${navHtml}
    <h1 style="${H1}">About Ruiying — Vending Equipment Supplier &amp; OEM Partner</h1>
    <p style="${LEAD}">Guangzhou Ruiying Electronic Equipment supplies smart vending machines, entertainment equipment and self-service solutions to overseas distributors, operators and brand owners.</p>
    <p style="${P}">We work as an engineering and sourcing partner rather than a pure reseller: equipment is specified for the destination market, adapted for local payment and power standards, and documented for import clearance. Ruiying covers ${products.length} equipment lines across vending, food and treat equipment and commercial entertainment.</p>
    <p style="${P}">Typical cooperation models are OEM (your branding, your packaging, your firmware language) and ODM (our proven platform adapted to your market). Volume programmes are supported with spare parts planning, remote monitoring and after-sales documentation.</p>
    <p style="${P}"><a href="/products/">Browse the equipment catalogue</a> or <a href="/contact/">send a project inquiry</a>.</p>
    ${contactHtml}
  </div>`,

  '/contact/': `<div style="max-width:1100px;margin:0 auto;padding:28px 20px">
    ${navHtml}
    <h1 style="${H1}">Contact Ruiying — OEM / ODM Inquiry</h1>
    <p style="${LEAD}">Tell us what equipment you are looking for, your target market and project stage. Ruiying supports equipment sourcing and OEM / ODM cooperation for the United States, Europe, Mexico and the Middle East.</p>
    <p style="${P}">Write to us with the model or equipment type, the voltage and payment configuration required for your market, and your target quantity. We reply with the spec sheet, options list and an indicative quotation.</p>
    ${contactHtml}
    <p style="${P}">See also: <a href="/products/">equipment catalogue</a>, <a href="/about/">about Ruiying</a>.</p>
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

// ---------- 7c. 产品详情页 ----------
// 完全静态：无 React、无 JS，抓到什么显示什么。每页自带 canonical / JSON-LD / 规格表 / 内链。
const metaDescFor = (p) => {
  const clean = String(p.copy).replace(/●/g, ' ').replace(/\s+/g, ' ').trim();
  let d = `${p.name} ${p.code} — ${p.category.toLowerCase()} from Ruiying. ${clean}`;
  // Bing 的「Meta Description too long」门槛是 150 字符，这里按 145 收口，留实体转义的余量
  if (d.length > 145) {
    d = d.slice(0, 145);
    d = d.slice(0, d.lastIndexOf(' ')).replace(/[\s,.;:—-]+$/, '');
  }
  while (d.length < 100) d += ' OEM / ODM supply with export documentation available on request.';
  if (d.length > 145) d = d.slice(0, 145).replace(/[\s,.;:—-]+$/, '');
  return d;
};

const copyBlocks = (p) => {
  const list = [];
  const rest = [];
  for (const line of String(p.copy).split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('●')) list.push(line.replace(/^●+\s*/, ''));
    else rest.push(line);
  }
  return { list, rest };
};

function productPage(p) {
  const { list, rest } = copyBlocks(p);
  const canonical = `https://${domain}${p.url}`;
  const ogImage = `https://${domain}${p.image}`;
  const desc = metaDescFor(p);
  // 型号与产品名完全相同时（VR Space Wheel / VR SPACE WHEEL）标题不要重复两遍
  const sameCode = p.code.toLowerCase() === p.name.toLowerCase();
  const label = sameCode ? p.name : `${p.name} ${p.code}`;
  const title = sameCode
    ? `${p.name} — ${p.category} | Ruiying`
    : `${p.name} ${p.code} — ${p.category} | Ruiying`;

  const specRows = p.specs
    .map((s) => {
      const raw = String(s);
      const idx = raw.indexOf(':');
      const k = idx > 0 ? raw.slice(0, idx).trim() : 'Specification';
      const v = idx > 0 ? raw.slice(idx + 1).trim() : raw;
      return `<tr><th scope="row">${escHtml(k)}</th><td>${escHtml(v)}</td></tr>`;
    })
    .join('\n');

  const bullets = list.length
    ? `<ul style="margin:0 0 18px;padding-left:22px;line-height:1.7">${list.map((b) => `<li>${escHtml(b)}</li>`).join('')}</ul>`
    : '';

  const paras = rest.map((t) => `<p style="${P}">${escHtml(t)}</p>`).join('\n');

  const gallery = p.gallery.length
    ? `<h2 style="${H2}">Product images</h2>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px">
        ${p.gallery
          .map(
            (g, idx) =>
              `<a href="${escHtml(g)}"><img src="${escHtml(g)}" alt="${escHtml(
                `${p.name} ${p.model} - detail view ${idx + 1}`
              )}" style="${THUMB};max-width:220px" loading="lazy" decoding="async" /></a>`
          )
          .join('\n')}
      </div>`
    : '';

  // 同类别其他型号：内链，帮搜索引擎把产品页连成一簇
  const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 5);
  const relatedHtml = related.length
    ? `<h2 style="${H2}">More ${escHtml(p.category.toLowerCase())} models</h2>
      <ul style="list-style:none;padding:0;margin:0;display:grid;gap:8px">
        ${related
          .map(
            (r) =>
              `<li><a href="${r.url}">${escHtml(r.name)}</a> <span style="${MUTED};display:inline;margin:0">${escHtml(
                r.code
              )}</span></li>`
          )
          .join('\n')}
      </ul>`
    : '';

  const ldProduct = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: label,
    sku: p.code,
    mpn: p.code,
    model: p.model,
    category: p.category,
    image: [ogImage, ...p.gallery.map((g) => `https://${domain}${g}`)],
    description: desc,
    brand: { '@type': 'Brand', name: 'Ruiying' },
    manufacturer: {
      '@type': 'Organization',
      name: 'Guangzhou Ruiying Electronic Equipment Co., Ltd.',
      url: `https://${domain}/`,
    },
  };

  const ldBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Products', item: `https://${domain}/products/` },
      { '@type': 'ListItem', position: 3, name: label, item: canonical },
    ],
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(desc)}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Ruiying" />
  <meta property="og:title" content="${escHtml(title)}" />
  <meta property="og:description" content="${escHtml(desc)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${ogImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escHtml(title)}" />
  <meta name="twitter:description" content="${escHtml(desc)}" />
  <meta name="twitter:image" content="${ogImage}" />
  ${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}
  <style>
    body.pd{margin:0;background:var(--color-neutral-soft,#f4f7fa);color:var(--color-text,#17212b);font-family:var(--font-body,system-ui,sans-serif)}
    .pd-wrap{max-width:1100px;margin:0 auto;padding:28px 20px 60px}
    .pd-crumb{font-size:13px;color:var(--color-text-muted,#5c6b7a);margin:0 0 18px}
    .pd-crumb a{color:inherit}
    .pd a{color:var(--color-secondary,#0b79d0);text-decoration:none}
    .pd a:hover{text-decoration:underline}
    .pd h1{font-family:var(--font-display,var(--font-body,system-ui,sans-serif));font-size:clamp(26px,4vw,40px);line-height:1.15;margin:0 0 10px;color:var(--color-text,#17212b)}
    .pd-model{font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-muted,#5c6b7a);margin:0 0 22px}
    .pd-hero{background:#fff;border:1px solid var(--color-border,#d9e2ea);border-radius:16px;padding:18px;margin:0 auto 22px;max-width:560px;text-align:center}
    .pd-hero img{display:block;width:auto;max-width:100%;max-height:400px;height:auto;margin:0 auto}
    .pd table.specs{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--color-border,#d9e2ea);border-radius:12px;overflow:hidden;margin:0 0 22px}
    .pd table.specs th,.pd table.specs td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--color-border,#d9e2ea);font-size:15px;vertical-align:top}
    .pd table.specs th{width:38%;color:var(--color-text-muted,#5c6b7a);font-weight:600;background:var(--color-neutral-soft,#f4f7fa)}
    .pd-cta{background:#fff;border:1px solid var(--color-border,#d9e2ea);border-radius:16px;padding:20px;margin:26px 0}
    .pd-cta a.pd-button{display:inline-block;background:var(--color-secondary,#0b79d0);color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600}
    .pd-foot{border-top:1px solid var(--color-border,#d9e2ea);margin-top:40px;padding-top:20px;font-size:14px;color:var(--color-text-muted,#5c6b7a)}
  </style>
  <script type="application/ld+json">${JSON.stringify(ldProduct)}</script>
  <script type="application/ld+json">${JSON.stringify(ldBreadcrumb)}</script>
</head>
<body class="pd">
  <div class="pd-wrap">
    <p class="pd-crumb"><a href="/">Home</a> / <a href="/products/">Products</a> / ${escHtml(p.name)} ${escHtml(p.code)}</p>
    <h1>${sameCode ? escHtml(p.name) : `${escHtml(p.name)} <span style="color:var(--color-secondary,#0b79d0)">${escHtml(p.code)}</span>`}</h1>
    <p class="pd-model">${escHtml(p.model)} · ${escHtml(p.category)}</p>
    <div class="pd-hero">
      <img src="${escHtml(p.image)}" alt="${escHtml(`${p.name} ${p.model} - product photo by Ruiying`)}" width="520" height="520" decoding="async" />
    </div>
    <p style="${LEAD}">${escHtml(
      `${p.name} ${p.code} supplied by Ruiying for OEM / ODM projects: ${p.category.toLowerCase()}, configured for your market's voltage, payment and documentation requirements.`
    )}</p>
    <h2 style="${H2}">Key specifications</h2>
    <table class="specs">
      <tbody>
        ${specRows}
        <tr><th scope="row">Model</th><td>${escHtml(p.model)}</td></tr>
        <tr><th scope="row">Category</th><td>${escHtml(p.category)}</td></tr>
        <tr><th scope="row">Supply</th><td>OEM / ODM · OEM branding, packaging and firmware language supported</td></tr>
      </tbody>
    </table>
    <h2 style="${H2}">Features</h2>
    ${bullets}
    ${paras}
    ${gallery}
    ${relatedHtml}
    <div class="pd-cta">
      <h2 style="${H2};margin-top:0">Request a quotation</h2>
      <p style="${P}">Send us your target market, voltage, payment configuration and order quantity. We reply with the full spec sheet, options list and an indicative price for ${escHtml(
        label
      )}.</p>
      <p><a class="pd-button" href="/contact/?product=${encodeURIComponent(label)}">Ask about ${escHtml(p.code)}</a></p>
      <p style="${MUTED}">Email ${escHtml(site.email || 'quinn@gzruiying.com')} · WhatsApp / Phone ${escHtml(
    site.phoneDisplay || '+86 198 0203 8683'
  )}</p>
    </div>
    <div class="pd-foot">
      <p>Ruiying — Guangzhou Ruiying Electronic Equipment Co., Ltd. · Vending machines, food equipment and commercial entertainment systems for OEM / ODM buyers.</p>
      <p><a href="/">Home</a> · <a href="/products/">All products</a> · <a href="/about/">About</a> · <a href="/contact/">Contact</a></p>
    </div>
  </div>
</body>
</html>
`;
}

// ---------- 7d. 落盘 + sitemap ----------
let cssHref = '';

const domain = (site.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
if (domain) {
  let baseHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const cssMatch = baseHtml.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/);
  cssHref = cssMatch ? cssMatch[1] : '';

  // logo 白块：原图是 1024×1024 白底方图，白边约占两成，放进深色导航会显出一个白方块。
  // invert 把白底翻成黑、screen 混合让黑变透明，深色 logo 反成浅色；再放大把白边挤出容器。
  baseHtml = baseHtml.replace(
    '</head>',
    `  <style data-fix="brand-logo">
    .brand-logo{background:transparent!important}
    .brand-logo img{filter:invert(1) contrast(1.05);mix-blend-mode:screen;transform:scale(1.45)}
  </style>
</head>`
  );

  for (const r of routes) {
    const meta = PAGES[r];
    const url = `https://${domain}${r}`;
    const html = injectPrerender(applyMeta(baseHtml, { title: meta.title, desc: meta.desc, url }), r);
    if (r === '/') {
      fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');
    } else {
      const dir = path.join(DIST, r.slice(1));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    }
  }
  log(`✓ 已生成 ${routes.length} 个页面（各自独立 canonical / title / description）`);

  for (const p of products) {
    const dir = path.join(DIST, 'products', p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), productPage(p), 'utf8');
  }
  log(`✓ 已生成 ${products.length} 个产品详情页`);

  // GitHub Pages 读发布目录里的 CNAME 文件
  fs.writeFileSync(path.join(DIST, 'CNAME'), `${domain}\n`, 'utf8');

  const allRoutes = [...routes, ...products.map((p) => p.url)];
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = allRoutes
    .map(
      (r) =>
        `  <url><loc>https://${domain}${r}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq></url>`
    )
    .join('\n');
  fs.writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    'utf8'
  );
  log(`✓ 已生成 sitemap.xml（${allRoutes.length} 个 URL）`);
} else {
  warn.push('content/site.json 未设置 domain，跳过 canonical、分页面 HTML 与 sitemap');
}

// ---------- 8. 汇总 ----------
log(`\n构建完成 → dist/（顶层 ${fs.readdirSync(DIST).length} 项）`);
if (warn.length) {
  log('\n⚠ 警告：');
  for (const w of warn) log('  - ' + w);
}

// ---------- 9. IndexNow 推送（失败绝不影响部署） ----------
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || 'DDACBDC9CB797706119AA3421D34940E';

async function pingIndexNow() {
  if (!domain) return log('· 没有 domain，跳过 IndexNow 推送');
  if (process.env.SKIP_INDEXNOW === '1') return log('· 已跳过 IndexNow 推送（SKIP_INDEXNOW=1）');
  if (process.env.CONTEXT && process.env.CONTEXT !== 'production') {
    return log(`· 非生产构建（CONTEXT=${process.env.CONTEXT}），跳过 IndexNow 推送`);
  }
  const allRoutes = [...routes, ...products.map((p) => p.url)];
  const payload = {
    host: domain,
    key: INDEXNOW_KEY,
    keyLocation: `https://${domain}/${INDEXNOW_KEY}.txt`,
    urlList: allRoutes.map((r) => `https://${domain}${r}`),
  };
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  log(`✓ IndexNow 已推送 ${payload.urlList.length} 个 URL（HTTP ${res.status}）`);
}

pingIndexNow().catch((e) => log(`⚠ IndexNow 推送失败（不影响部署）：${e.message}`));
