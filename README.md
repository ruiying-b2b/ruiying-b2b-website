# Ruiying 独立站（带后台可编辑版）

## 一句话说清这套东西怎么跑

网站本身还是那套静态文件（视觉零改动），但**产品数据抽出来了**：

```
你在后台改 content/products.json
        ↓ 自动提交到 GitHub
Vercel 触发构建，build.mjs 把新产品数据注入页面
        ↓
官网 30～60 秒后自动更新，不需要你碰任何代码
```

## 目录结构

```
content/products.json    ← 17 个产品，后台主要改这里
content/site.json        ← 询盘邮箱 / 电话 / WhatsApp / 域名
site/                    ← 站点基线（页面设计、CSS、图片），一般不动
  index.html
  assets/index-*.js      页面与布局（编译产物）
  assets/index-*.css     样式
  assets/images/         所有图片（含 logo）
build.mjs                ← 构建脚本：注入数据、生成 sitemap、写 canonical
.pages.yml               ← 后台表单定义（字段、分类选项、图片上传位置）
vercel.json              ← Vercel 构建与 SPA 路由规则
package.json
```

## 一、一次性部署（四步）

### 第 1 步：把这个文件夹变成 GitHub 仓库

**方式 A（推荐，我帮你做）**：装上 GitHub 插件并授权后，我直接给你建私有仓库、把文件推上去、连 Vercel，你只需要最后登录一次。

**方式 B（自己动手，不需要 git 命令）**

1. 安装 GitHub Desktop，登录你的 GitHub 账号（没有就注册，免费）
2. 菜单 `File → New Repository`
   - Name：`ruiying-site`
   - Local path：选 `C:\Users\quinn\Doubao\chats\2026-11-14\new-chat-2`
   - 点 Create
3. 把本文件夹（`ruiying-cms`）里的**全部内容**复制进刚生成的 `ruiying-site` 文件夹
   - 注意要包含隐藏文件 `.pages.yml`
4. GitHub Desktop 左下角会列出所有文件 → Summary 填 `initial` → `Commit to main`
5. 右上角 `Publish repository`，建议勾选 **Keep this code private**

### 第 2 步：Vercel 导入仓库

1. vercel.com 登录（用 GitHub 账号登录最省事）
2. `Add New → Project` → 选 `ruiying-site` 仓库 → Import
3. 构建设置它会自动读到 `vercel.json`，确认：
   - Build Command：`node build.mjs`
   - Output Directory：`dist`
4. Deploy → 得到一个 `xxx.vercel.app` 预览地址

**先验证**：打开 `xxx.vercel.app/products`，看 17 个产品是否都在。有产品说明数据注入成功。

### 第 3 步：绑域名（关键：只加两条记录，别动邮箱）

Vercel → 项目 → Settings → Domains → 添加 `gzruiying.com` 和 `www.gzruiying.com`。
Vercel 会显示需要配置的记录，**以它显示的值为准**，通常是：

| 记录类型 | 主机记录 | 解析请求来源 | 记录值 | TTL |
|---|---|---|---|---|
| A | `@` | 默认 | Vercel 给的 IP | 10 分钟 |
| CNAME | `www` | 默认 | `cname.vercel-dns.com` | 10 分钟 |

三个红线：

- **不要删除 MX 记录**（`mx1/mx2/mx3.qiye.aliyun.com`），删了企业邮箱立刻收不到询盘
- **不要改 NS 服务器地址**
- `@` 上只能放 A 记录，**不能放 CNAME**（CNAME 与 MX 冲突）

### 第 4 步：登录后台

1. 打开 `pagescms.org`
2. 用 GitHub 账号登录 → 授权访问 `ruiying-site` 仓库
3. 左侧会看到「产品」和「联系方式」两项

## 二、日常怎么改产品

打开 `pagescms.org` → 选仓库 → 「产品」：

| 字段 | 怎么填 |
|---|---|
| 编号 id | 数字。**新增产品必须用一个没用过的号**（接着 18、19、20…）；和已有产品重复会被覆盖 |
| 产品名称 name | 英文标题，客户在产品页看到的第一行 |
| 型号行 model | 形如 `SMOKE VENDING / RV-03`，分类 + 斜杠 + 型号 |
| 分类 category | 只能三选一：`Smart Vending` / `Food & Treat Equipment` / `Commercial Entertainment`。选别的，这个产品在筛选里会消失 |
| 主图 image | 上传或选择 `site/assets/images/products` 下的图 |
| 卖点描述 copy | 英文，2 句以内，别写参数（参数放下面） |
| 参数要点 specs | 每条一行，建议 2 条，最多 3 条；写太长卡片会撑破 |
| 图集 gallery | 选填，产品详情多图 |

改完点保存 → 后台自动提交到 GitHub → Vercel 自动重建 → 官网 30～60 秒后刷新即可看到。

**顺序与展示**：卡片顺序按 `id` 从小到大，所以想让某个产品排前面，把它的 id 调小即可（但别和别的重复）。

## 三、联系方式也能后台改

「联系方式」里四个字段，改完同样自动生效：

- `email` 询盘邮箱
- `phoneDisplay` 页面上显示的电话（含国家码）
- `whatsappNumber` 只填数字，含国家码（如 `8619802038683`）
- `domain` 站点域名，用于 SEO 的 canonical 和 sitemap

## 四、后台改不了的东西（要改找我）

这套后台只管「产品」和「联系方式」。以下内容在 `site/` 基线里，属于页面设计层，改它等于改代码：

- 首页大标题、副标题、hero 文案
- About 页的所有段落
- 页面结构、新增页面、导航菜单
- 新增产品分类（要同时改 `.pages.yml` 的分类选项和页面筛选逻辑）

## 五、本地预览（可选）

```powershell
cd ruiying-cms
node build.mjs
npx serve dist     # 或 python -m http.server 8000 --directory dist
```

## 六、出问题怎么查

| 现象 | 原因与处理 |
|---|---|
| Vercel 部署失败 | 日志里会出现中文报错，例如「产品 id=xx 缺少必填字段「copy」」，按提示在后台补上再保存 |
| 某个产品图片裂了 | `image` 必须是 `/assets/images/products/xxx.png` 形式，且文件确实在 `site/assets/images/products/` 下 |
| 后台看不到「产品」菜单 | `.pages.yml` 没被推进仓库（隐藏文件容易被漏掉），重新上传 |
| 改了后台但官网没变 | Vercel 里看 Deployments 有没有新的构建记录；没有就说明提交没成功，回后台重存一次 |

## 七、还没做、需要你决定的

1. **图片体积**：全站 39 MB，最大单图 5 MB。`/products` 首屏会拉 30 MB 以上，海外手机用户很慢。压成 WebP 通常能降到 1/10，需要改 23 处图片引用——后台改完产品后我可以一次性做掉。
2. **SPF 记录缺失**：`gzruiying.com` 目前没有 TXT/SPF，企业邮箱发出的询盘回复更容易进对方垃圾箱。建议加：`v=spf1 include:spf.qiye.aliyun.com ~all`。
3. **首页/About 文案仍不可后台编辑**：需要的话可以把这两页文案也抽成 JSON，代价是再改一次页面基线。
