# Ruiying 独立站（自有域名 + 可登录后台）

站点：**https://gzruiying.com**
后台：**https://app.pagescms.org**
仓库：**https://github.com/ruiying-b2b/ruiying-b2b-website**（已设为 Public）
托管：**GitHub Pages**（仓库 Actions 自动构建 dist 并发布）

## 一、这套东西怎么跑

```
你在后台改 content/products.json
        ↓ 自动 commit 到 GitHub main
GitHub Actions（.github/workflows/pages.yml）被触发，执行 npm run build（= node build.mjs）
        ↓ 注入产品数据、给 4 个页面各写独立 canonical / title、预渲染正文、生成 sitemap、推 IndexNow
产物 dist/ 直接发布为 GitHub Pages，约 1–2 分钟上线
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
  _redirects             Netlify 时代的遗留文件，GitHub Pages 不读它，留着无害
  assets/index-*.js      页面与布局（编译产物）
  assets/index-*.css     样式
  assets/images/         所有图片（含 logo、产品图 webp）
build.mjs                构建脚本：注入数据、生成 4 个页面各自的 canonical / title、预渲染正文、sitemap、IndexNow
serve.py                 本地预览服务器（模拟目录形式 / 尾斜杠自动找 index.html）
.github/workflows/pages.yml   GitHub Actions：构建 + 发布到 Pages
.pages.yml               后台表单定义（字段、分类选项、图片上传位置）
package.json             scripts.build = node build.mjs
```

构建产物 `dist/` 不提交仓库（在 `.gitignore` 里），只由 Actions 现场生成。

## 三、域名与 DNS（阿里云，`gzruiying.com`）

GitHub Pages 里自定义域是 `gzruiying.com`，`www.gzruiying.com` 会 301 跳到主域。证书由 GitHub 自动申请（Let's Encrypt），不需要自己买。

阿里云云解析里网站用的记录：

| 记录类型 | 主机记录 | 记录值 | TTL |
|---|---|---|---|
| A | `@` | `185.199.108.153` | 10 分钟 |
| A | `@` | `185.199.109.153` | 10 分钟 |
| A | `@` | `185.199.110.153` | 10 分钟 |
| A | `@` | `185.199.111.153` | 10 分钟 |
| CNAME | `www` | `ruiying-b2b.github.io` | 10 分钟 |

四条 A 记录是 GitHub 官方给的，**四条都要留**（少一两条也能用，但不建议删）。

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

保存后自动提交 → Actions 自动构建 → **1–2 分钟左右官网更新**（刷新时若没变，等 1 分钟或按 Ctrl+F5）。

排序按 `id` 从小到大，想让某个产品靠前就把 id 调小（但不能与别的重复）。

「联系方式」页可改：`email`、`phoneDisplay`、`whatsappNumber`（纯数字含国家码）、`domain`。

> 顺手提醒：仓库已经是 Public，`content/` 里的产品资料对外可见。这里只放本来就要公开的产品信息，不要往里放报价、客户名单、成本数据。

## 五、图片规范（重要）

产品图全部是 **WebP**，长边 1400px，质量 82。一张图一般在 30–170 KB。

**上传新图前先压缩**，否则 `/products/` 会重新变慢，而且 PagesCMS 单个文件超过约 1 MB 会直接报 `Failed to upload file: 413`。目标：单张 ≤ 150 KB。

原始高分辨率原图备份在你自己的电脑上，不进仓库（仓库里只放压缩后的 webp）。

## 六、SEO 现状

| 项目 | 状态 |
|---|---|
| `https://gzruiying.com/sitemap.xml` | 4 条 URL，带尾斜杠：`/`、`/products/`、`/about/`、`/contact/` |
| `https://gzruiying.com/robots.txt` | 有，含 `Sitemap:` 指路 |
| canonical | **每个页面各自指向自己的网址**（`/` → `/`，`/products/` → `/products/` …） |
| 页面正文 | **已预渲染进 HTML**，爬虫不用跑 JS 也能读到内容（见下节） |
| 重复内容 | 无：每页独立 HTML + 自指 canonical |
| Bing Webmaster | 已验证，sitemap 已提交，IndexNow 已推送 |
| Google Search Console | 待办：需能访问 Google 的网络环境后，按 DNS TXT 方式验证并提交 sitemap |

### 每个页面独立 HTML（务必不要改回单页一份）

站点是单页应用，默认所有路径都返回同一份 `index.html`，于是 `/products/`、`/about/`、`/contact/`
都自称「首页的副本」，搜索引擎会判为重复页面而拒绝收录（Bing 报的是
`URL cannot be indexed by Bing — page is an alternate version`，canonical 指向首页）。

`build.mjs` 第 7 段因此给 4 个路由各生成一份 HTML，只改 `head`、不动页面渲染：

| 文件 | 对应网址 |
|---|---|
| `dist/index.html` | `/` |
| `dist/products/index.html` | `/products/` |
| `dist/about/index.html` | `/about/` |
| `dist/contact/index.html` | `/contact/` |

两个坑：

- **GitHub Pages 不支持 Netlify 那种「无扩展名自动改写」，所以必须用目录形式**（`products/index.html`）。
  好处是 `/products` 会被 301 到 `/products/`，和 canonical 完全一致。
  千万别换成平铺的 `products.html` —— 那样 `/products` 会 404。
- 新增页面时，`build.mjs` 里的 `routes` 和 `PAGES` 两处要同时加（路由必须带尾斜杠），sitemap 会自动跟着生成。

### 预渲染静态正文（爬虫能看到真正的内容）

站点是纯前端渲染，原始 HTML 里只有一个空的 `<div id="root"></div>`（约 838 字节）。
搜索引擎如果按原始 HTML 判断，看到的就是空白页 —— Bing 会报 `H1 tag missing`，
状态停在 `Discovered but not crawled`，也就是「知道有这个网址，但不值得来抓」。

`build.mjs` 第 7b 段因此把每个路由的正文以静态 HTML 写进 `#root`：h1 标题、公司介绍、
全部产品的名称 / 型号 / 分类 / 卖点 / 参数、指向 `/contact/?product=...` 的内链、联系方式。
React 挂载后会整体替换掉这段静态内容，用户看到的画面完全不变。

| 页面 | 改动前 | 改动后 |
|---|---|---|
| `/` | 806 字节，空 div | 约 16.8 KB |
| `/products/` | 838 字节，空 div | 约 16.6 KB |
| `/about/` | 844 字节，空 div | 约 2.9 KB |
| `/contact/` | 797 字节，空 div | 约 2.5 KB |

改文案的位置：`build.mjs` 里的 `PRERENDER` 对象（按路由分四段）。产品列表是从
`content/products.json` 自动生成的，**改产品不需要动这里**；只有改标题、介绍段落才需要动。

两个注意点：

- 静态内容用的是站内 CSS 变量（`--color-text`、`--color-border` 等），所以看起来跟站内风格接近。
  如果哪天换了配色变量名，这段会退回默认样式，但文字仍在、不影响收录。
- 静态内容必须和 React 渲染出来的内容大体一致。不要在这里写页面上没有的夸大文字 ——
  内容和实际页面不一致属于 cloaking，是搜索引擎明确禁止的。

### IndexNow 自动推送

`build.mjs` 第 9 段：每次构建成功后，自动把 4 个 URL 推给 `api.indexnow.org`（Bing / Yandex / Naver / Seznam 共用这套协议）。**推送失败只打警告，绝不会让部署失败**。

手动推送（改了内容但想立刻通知时）：

```powershell
$key = "DDACBDC9CB797706119AA3421D34940E"
$body = '{"host":"gzruiying.com","key":"' + $key + '","keyLocation":"https://gzruiying.com/' + $key + '.txt","urlList":["https://gzruiying.com/","https://gzruiying.com/products/"]}'
$f = "$env:TEMP\in.json"
[IO.File]::WriteAllText($f, $body, (New-Object Text.UTF8Encoding $false))
curl.exe -s -X POST "https://api.indexnow.org/indexnow" -H "Content-Type: application/json" --data-binary "@$f" -w "HTTP %{http_code}`n"
```

返回 `200` 或 `202` 即成功。

## 七、本地预览

```powershell
Set-Location "项目所在目录（含 build.mjs 的 ruiying-cms 文件夹）"
$env:SKIP_INDEXNOW='1'; node build.mjs
python serve.py 8089 (Join-Path (Get-Location) "dist")   # 打开 http://127.0.0.1:8089/products/
```

`SKIP_INDEXNOW=1` 是本地调试时不要往搜索引擎推假更新。

用 `serve.py` 而不是 `npx serve`：站点把 `/products/` 映射到 `products/index.html`，
普通静态服务器不认尾斜杠目录，用 `/products.html` 打开时前端路由会当成未知路径、显示 404。

注意：`serve.py` 起服务时占着 `dist` 目录，这时改代码要**先停掉服务**再 `node build.mjs`，
否则构建第一步删 `dist` 会报 `EBUSY: resource busy or locked`。

## 八、为什么从 Netlify 迁走（重要背景）

Netlify 的免费套餐是「每月 300 credits」，而 **一次生产部署收 15 credits** —— 等于每月只能部署 20 次。
11/14–12/13 这个周期里部署次数用完，控制台直接提示「Production deploys are paused」，
而且免费额度用尽后不能靠升级以外的方式恢复。“改一次产品就烧一次额度” 对长期运营不可行。

GitHub Pages 的部署是免费的、不限次数，仓库公开即免费用，代价是代码公开可见。
Netlify 旧项目（`roaring-raindrop-8cc5f1`）现在只剩历史部署记录，域名已不指向它，建议尽早删除以释放那个 netlify 子域名。

## 九、出问题怎么查

| 现象 | 原因与处理 |
|---|---|
| 后台保存了但官网没变 | GitHub → Actions 看有没有新的 Deploy 运行；没有说明提交没成功，回后台重存一次 |
| Actions 构建失败 | 点开失败的运行看 `Build site` 步骤日志，中文报错例如「产品 id=xx 缺少必填字段「copy」」，按提示补 |
| 打开网页报「您的连接不是私密连接」 | GitHub 还没为域名签好证书，在 Pages 设置里看 `Enforce HTTPS` 是否可用；DNS 刚改时常见，等几十分钟 |
| 打开某个页面 404 | 路由没按目录形式生成（应为 `dist/products/index.html`），检查 `build.mjs` 的 routes 是否带尾斜杠 |
| 产品图裂了 | `image` 必须是 `/assets/images/products/xxx.webp` 形式，且文件真在 `site/assets/images/products/` 下 |
| 后台看不到「产品」菜单 / 传图报 No media configuration | `.pages.yml` 被改坏或没推上去，回到数组形式的 `media` 配置 |
| 传图报 `Failed to upload file: 413` | 单个文件超过约 1 MB，先压成 WebP（长边 1400、质量 82）再传 |
| 邮件收不到 | 检查阿里云 MX 三条是否还在、`@` 是否被错加了 CNAME |
| 访问 `www.gzruiying.com` 跳回主域 | 正常，这是 GitHub Pages 的默认行为，保证一个 canonical 主机 |
| Bing 报 `page is an alternate version`，canonical 指向首页 | 各页面 HTML 没生成，检查 `dist/products/index.html` 等 4 个文件是否存在 |
| Bing 报 `H1 tag missing` 或页面停在 `Discovered but not crawled` | 预渲染段没生效，检查线上 HTML 大小是否只有几百字节（正常应 2–17 KB） |
| 本机 `git push` 失败（Connection reset） | 本机到 github.com:443 被墙，走 Actions/后台（服务器侧通信）不受影响；要同步本地副本需网络环境支持 |

## 十、本该做但没做的

1. 仓库里仍留着 20 张原始 PNG/JPEG（约 39 MB），访客不再下载，只占仓库体积。等网络方便时删掉。
2. Google Search Console 未做（需要能访问 Google 的网络）。
3. 首页 / About 文案仍在页面基线里，后台改不了；要做成可编辑需要再改一次基线。
4. 产品页有 6 张图没写 alt 文字（Bing 已在 Live URL 里点名）；页面里还残留几处中文（如「获取参数」「图片浏览」）未英文化。
5. 没有产品独立详情页：点产品卡片不会跳转，只有「获取参数」跳到联系页并预填产品名。要做自己的产品页需要另外生成静态页面。
