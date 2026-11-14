# Ruiying 独立站（自有域名 + 可登录后台）

站点：**https://gzruiying.com**
后台：**https://app.pagescms.org**
仓库：**https://github.com/ruiying-b2b/ruiying-b2b-website**（Private）

## 一、这套东西怎么跑

```
你在后台改 content/products.json
        ↓ 自动 commit 到 GitHub main
Netlify 检测到提交，执行 npm run build（= node build.mjs）
        ↓ 把产品数据注入页面、给 4 个页面各写独立 canonical / title、生成 sitemap、推 IndexNow
官网 60 秒内自动更新，不需要碰代码
```

整条链路除了「你在后台点保存」之外全自动。数据、代码、域名都在自己手里，不依赖任何建站平台。

## 二、目录结构

```
content/products.json    17 个产品，后台主要改这里
content/site.json        询盘邮箱 / 电话 / WhatsApp / 域名
site/                    站点基线（页面设计、CSS、图片），一般不动
  index.html
  robots.txt             给搜索引擎看的，含 sitemap 地址
  BingSiteAuth.xml       Bing 站长验证文件（不要删）
  DDACBDC9....txt        IndexNow 密钥文件（不要删，也不要去改内容）
  _redirects             SPA 路由兜底（/* → /index.html 200）
  assets/index-*.js      页面与布局（编译产物）
  assets/index-*.css     样式
  assets/images/         所有图片（含 logo、20 张产品图 webp）
build.mjs                构建脚本：注入数据、生成 4 个页面各自的 canonical / title、sitemap、IndexNow
.pages.yml               后台表单定义（字段、分类选项、图片上传位置）
package.json             scripts.build = node build.mjs
```

## 三、域名与 DNS（阿里云，`gzruiying.com`）

Netlify 里 `gzruiying.com` 是主域，`www.gzruiying.com` 301 跳到主域。证书由 Let's Encrypt 自动续。

阿里云云解析里只有这两条是网站用的：

| 记录类型 | 主机记录 | 记录值 | TTL |
|---|---|---|---|
| A | `@` | `75.2.60.5` | 10 分钟 |
| CNAME | `www` | `roaring-raindrop-8cc5f1.netlify.app` | 10 分钟 |

**三条红线，动一条邮箱就废：**

1. **MX 三条（`mx1/mx2/mx3.qiye.aliyun.com`，优先级 5/10/15）绝对不能动**
2. **不要改 NS**（`dns7/dns8.hichina.com`）
3. **`@` 上只能有 A 记录，不能放 CNAME**（CNAME 与 MX 冲突，企业邮箱会立刻收不到信）

另外 @ 下还有 TXT（SPF）、`_dmarc`、`default_domainkey`（DKIM），都是邮箱验证用的，也不要动。加新的 TXT（比如以后做 Google Search Console 验证）是安全的，同一主机记录下可以有多条 TXT。

## 四、日常怎么改产品

打开 `app.pagescms.org` → 选 `ruiying-b2b-website` → 左侧「产品」：

| 字段 | 怎么填 |
|---|---|
| 编号 id | 数字，新增产品必须用没被占用的号（接着 18、19…），重复会覆盖已有产品 |
| 产品名称 name | 英文标题 |
| 型号行 model | 形如 `SMART VENDING / RV-03` |
| 分类 category | 只能三选一：`Smart Vending` / `Food & Treat Equipment` / `Commercial Entertainment`，填错这个产品在筛选里消失 |
| 主图 image | 从「产品图片」媒体库选，或现场上传 |
| 卖点描述 copy | 英文，2 句以内，参数别写这里 |
| 参数要点 specs | 每行一条，建议 2 条，最多 3 条 |
| 图集 gallery | 选填，最多 8 张 |

保存后自动提交 → Netlify 自动构建 → **60 秒左右官网更新**（刷新时若没变，等 1 分钟或按 Ctrl+F5）。

排序按 `id` 从小到大，想让某个产品靠前就把 id 调小（但不能与别的重复）。

「联系方式」页可改：`email`、`phoneDisplay`、`whatsappNumber`（纯数字含国家码）、`domain`。

## 五、图片规范（重要）

产品图全部是 **WebP**，长边 1400px，质量 82。20 张图合计 **1.56 MB**（原始 PNG/JPEG 是 39 MB）。

**上传新图前先压缩**，否则 `/products` 会重新变慢。目标：单张 ≤ 150 KB。工具随便挑一个在线压缩站，导出 WebP、长边 1400 即可。

原始高分辨率图备份在本地：
`C:\Users\quinn\Doubao\chats\2026-11-14\new-chat-2\原图备份\`

## 六、SEO 现状

| 项目 | 状态 |
|---|---|
| `https://gzruiying.com/sitemap.xml` | 4 条 URL：`/`、`/products`、`/about`、`/contact` |
| `https://gzruiying.com/robots.txt` | 有，含 `Sitemap:` 指路 |
| canonical | **每个页面各自指向自己的网址**（`/` → `/`，`/products` → `/products` …） |
| Bing Webmaster | 已验证，sitemap 已提交，IndexNow 已推送，4 个 URL 已请求编入索引 |
| Google Search Console | 待办：需能访问 Google 的网络环境后，按 DNS TXT 方式验证并提交 sitemap |

### 每个页面独立 HTML（务必不要改回单页一份）

站点是单页应面，默认所有路径都返回同一份 `index.html`，于是 `/products`、`/about`、`/contact`
都自称「首页的副本」，搜索引擎会判为重复页面而拒绍收录（Bing 报的是
`URL cannot be indexed by Bing — page is an alternate version`，canonical 指向首页）。

`build.mjs` 第 7 段因此给 4 个路由各生成一份 HTML，只改 `head`、不动页面渲染：

| 文件 | 对应网址 |
|---|---|
| `dist/index.html` | `/` |
| `dist/products.html` | `/products` |
| `dist/about.html` | `/about` |
| `dist/contact.html` | `/contact` |

两个坑：

- 必须用**平铺文件**（`products.html`），不要用目录（`products/index.html`）。目录形式会让 Netlify
  把 `/products` 301 跳到 `/products/`，与 canonical 里的 `/products` 不一致，又会被判成「替代版本」。
- 新增页面时，`build.mjs` 里的 `routes` 和 `PAGES` 两处要同时加，sitemap 会自动跟着生成。

### IndexNow 自动推送

`build.mjs` 第 9 段：每次构建成功后，自动把 4 个 URL 推给 `api.indexnow.org`（Bing / Yandex / Naver / Seznam 共用这套协议）。**推送失败只打警告，绝不会让部署失败**。

手动推送（改了内容但想立刻通知时）：

```powershell
$key = "DDACBDC9CB797706119AA3421D34940E"
$body = '{"host":"gzruiying.com","key":"' + $key + '","keyLocation":"https://gzruiying.com/' + $key + '.txt","urlList":["https://gzruiying.com/","https://gzruiying.com/products"]}'
$f = "$env:TEMP\in.json"
[IO.File]::WriteAllText($f, $body, (New-Object Text.UTF8Encoding $false))
curl.exe -s -X POST "https://api.indexnow.org/indexnow" -H "Content-Type: application/json" --data-binary "@$f" -w "HTTP %{http_code}`n"
```

返回 `200` 或 `202` 即成功。

## 七、本地预览

```powershell
Set-Location "C:\Users\quinn\Doubao\chats\2026-11-14\new-chat-2\ruiying-cms"
$env:SKIP_INDEXNOW='1'; node build.mjs
npx serve dist
```

`SKIP_INDEXNOW=1` 是本地调试时不要往搜索引擎推假更新。

## 八、出问题怎么查

| 现象 | 原因与处理 |
|---|---|
| 后台保存了但官网没变 | Netlify → Deploys 看有没有新构建；没有说明提交没成功，回后台重存一次 |
| Netlify 构建失败 | 看构建日志里的中文报错，例如「产品 id=xx 缺少必填字段「copy」」，按提示补上 |
| 产品图裂了 | `image` 必须是 `/assets/images/products/xxx.webp` 形式，且文件真在 `site/assets/images/products/` 下 |
| 后台看不到「产品」菜单 / 传图报 No media configuration | `.pages.yml` 被改坏或没推上去，回到数组形式的 `media` 配置 |
| 后台报 media 配置错 | `media` 必须写成数组（`- name: / label: / input: / output: / extensions:`），不能写成以名字为 key 的对象 |
| 邮件收不到 | 检查阿里云 MX 三条是否还在、`@` 是否被错加了 CNAME |
| Bing 报 `page is an alternate version`，canonical 指向首页 | 各页面 HTML 没生成或被改回目录形式，检查 `dist/products.html` 等 4 个文件是否存在 |
| 本机 `git push` 失败（Connection reset） | 本机到 github.com:443 被墙，走 Netlify/后台（服务器侧通信）不受影响；要同步本地副本需网络环境支持 |

## 九、本该做但没做的

1. 仓库里仍留着 20 张原始 PNG/JPEG（约 39 MB），访客不再下载，只占仓库体积。等网络方便时删掉。
2. Google Search Console 未做（需要能访问 Google 的网络）。
3. 首页 / About 文案仍在页面基线里，后台改不了；要做成可编辑需要再改一次基线。
4. 产品页有 6 张图没写 alt 文字（Bing 已在 Live URL 里点名）；页面里还残留几处中文（如「获取参数」「图片浏览」）未英文化。