# 游戏发布与 Cloudflare Pages 更新手册

本文件是本项目发布操作的长期入口。新 session 在完成本地游戏内容更新后，应先读取
[`AGENTS.md`](../AGENTS.md) 与本文件，再判断是否已经获得发布授权。实现完成、测试通过或
生成了 `release/`，都不自动等于允许更新线上版本。

## 当前线上项目

| 项目 | 当前值 |
| --- | --- |
| 托管平台 | Cloudflare Pages |
| 发布方式 | Direct Upload（本地预构建后上传） |
| Pages 项目名 | `angel2-web-remake` |
| 生产分支 | `main` |
| 生产地址 | <https://angel2-web-remake.pages.dev/> |
| 应上传目录 | `release/` |

当前站点不是 Git 集成项目，也不是 Codex Sites 项目。不要新建 `.openai/hosting.json`、新的
Pages 项目或第二个站点来替代它，除非用户明确要求迁移托管方案。Cloudflare 的 Direct Upload
项目以后不能原地切换成 Git 集成；若将来要自动部署，需要另行设计迁移并取得用户确认。

线上实际部署版本以 Cloudflare 的部署列表为准，不能仅根据本地 `HEAD`、`release/` 的修改
时间或本文档推断。`release/`、`dist/` 和 `artifacts/` 都是被忽略的本地产物，不进入 Git。

## 发布权限边界

- “更新本地版”“生成 release”“做发布前检查”不包含更新线上站点的授权。
- 只有用户明确确认当前内容并要求发布／上线后，才能创建生产部署。
- 发布前再次运行 `git status --short --branch`，保留用户已有改动，确认这次要发布的源码范围。
- 若 Cloudflare 登录失效、账号不对、找不到既有项目或需要创建新项目，停止并请用户处理；
  不要自行创建同名或近似项目。
- 不把 Cloudflare API Token、账号 ID、OAuth 配置或其他凭据写入仓库、命令输出摘要或发布文档。

## 标准发布流程

### 1. 完成本地修改与发布候选验收

普通开发阶段继续按 [`tests/README.md`](../tests/README.md) 运行定向测试。用户确认要形成发布
候选后，本项目按发布前门禁运行全量检查：

```bash
git status --short --branch
pnpm check
git diff --check
```

`pnpm check` 会检查文档合同、单元测试与覆盖率、开发构建和完整 Playwright 流程。失败时先修复
源码、生成器或测试，不要绕过失败直接上传旧的 `release/`。

### 2. 重新生成玩家版 release

```bash
pnpm build:release
```

该命令先做 TypeScript 检查，再用 Vite 的 `release` 模式清空并重建 `release/`，最后运行
`scripts/prepare-release.mjs` 审计内容。发布包只应包含玩家主入口及其运行时资源，不应包含
`debug.html`、竞技场、对阵场或各实验室入口。不要手工修改、增删或复制文件到 `release/`；
需要修正时回到源码或生成流程重建。

资源图集也必须走生成与发布清理边界：全景职业动作帧来自
`pnpm content:full-combat-atlases`，地图命中／死亡、回合切换及逐关连续特效来自
`pnpm content:battle-sprite-atlases`。开发目录保留逐帧来源；`prepare-release.mjs` 只有在
对应 PNG 与 Phaser JSON Hash 全部存在后，才从玩家包删除已经迁移的零碎 PNG。不要在
`public/` 或 `release/` 手工拼图、改帧名或先删来源。

分段加载清单必须在所有资源生成器之后生成：

```bash
pnpm content:resource-manifest
```

该命令输出 `public/assets/original/resource-manifest.v1.json` 与只含版本／身份／URL 的 TypeScript
目录。清单按发布清理后的最终路径登记每个资源的 URL、字节、SHA-256 和资源包；不要手工编辑。
任何被登记的图片、音频、JSON 或字体变化后都必须重跑。`prepare-release.mjs` 会先清掉已迁移的
零碎来源，再逐项检查清单 URL 存在且字节／哈希与生成时一致；旧清单会让发布构建明确失败。

当前加载策略只使用普通 HTTP 缓存：开场包完成后后台准备第 0 关，关卡切换只强制下一关并
预取再后两关。没有 Service Worker 或 R2；不要在发布步骤临时加离线缓存，也不要把全战役包
改成首屏依赖。预取只读取编码响应，不代表图片或音乐已全部解码进内存。

重建后做最小包体检查：

```bash
test -f release/index.html
find release -maxdepth 1 -type f -name '*.html' -print
find release -type f | wc -l
find release -type f -size +25M -print
du -sh release
```

HTML 清单应只有 `release/index.html`。Cloudflare Pages 当前用 Wrangler 上传时上限为 20,000 个
文件、单文件 25 MiB；最后一个 `find` 命令应没有输出。总目录可以大于 25 MiB，限制针对单个
文件。若触及限制，先停下来评估资源拆分、压缩或 R2，不要在发布步骤临时删除游戏素材。

### 3. 本地预览最终目录

```bash
pnpm preview:release
```

打开 <http://127.0.0.1:4173/>，至少确认：

1. 从普通 `/` 进入，标题、开场、游戏画面、音乐与主要素材可以加载；
2. 本次修改的玩家可见内容确实存在，例如「復刻說明」中的对应分页；
3. 浏览器控制台没有新的 404、模块加载或资源解码错误；
4. 发布目录没有调试中心或实验室入口。

这是对真正 `release/` 的冒烟检查，不能用 `pnpm dev` 或 `dist/` 代替。

### 4. 检查 Cloudflare 登录与既有项目

Wrangler 不作为项目依赖提交，发布时通过 `pnpm dlx` 调用：

```bash
pnpm dlx wrangler whoami
pnpm dlx wrangler pages project list
```

首次使用或 OAuth 已过期时运行 `pnpm dlx wrangler login`，由用户在浏览器完成登录。项目列表中
必须能看到既有的 `angel2-web-remake`。不要执行 `pages project create`。

### 5. 上传生产版本

只有在用户已明确授权上线后，才执行：

```bash
pnpm dlx wrangler pages deploy release --project-name=angel2-web-remake
```

不要把 `dist/`、仓库根目录或 zip 包作为上传目标。生产部署不传 `--branch`；只有用户明确要求
远程预览时，才可使用 `--branch=<preview-name>` 创建预览部署。预览部署不会自动成为生产版本，
也不能作为 Cloudflare 的生产回滚目标。

当前发布目录通常超过 Cloudflare Dashboard 拖放方式的 1,000 文件上限，因此默认必须使用
Wrangler；Direct Upload 的 Wrangler 与 Dashboard 上传虽然可以在同一项目内混用，但不要把
拖放作为本项目的常规更新方案。

### 6. 验证线上结果

```bash
pnpm dlx wrangler pages deployment list \
  --project-name=angel2-web-remake \
  --environment=production
```

确认最新生产部署成功后，同时检查 Wrangler 输出的本次部署专属 URL 与稳定地址
<https://angel2-web-remake.pages.dev/>。使用普通玩家入口完成一次快速检查，并重点复核本次
更新内容与浏览器控制台。若稳定地址仍显示旧页面，先核对部署列表和专属 URL，再强制刷新；
不要在没有定位原因时重复创建多个生产部署。

交付时应明确记录：线上地址、已部署的内容摘要、实际运行的发布前门禁、线上冒烟结果，以及
任何未验证项。不要在回复中暴露登录账号、账号 ID、Token、部署内部 ID 或临时凭据。

## 回滚

若新版本上线后出现严重回归：

1. 进入 Cloudflare Dashboard 的 **Workers & Pages**；
2. 打开 `angel2-web-remake`；
3. 在 **Deployments** 中找到上一个已确认可用的生产部署；
4. 从该部署的操作菜单选择 **Rollback to this deployment** 并确认；
5. 重新检查稳定地址和关键玩家流程，再向用户说明回滚原因与当前状态。

只有成功的生产部署能作为回滚目标，预览部署不能回滚为生产。回滚不会修改本地 Git；线上
恢复后仍应在源码中修复问题、重新跑门禁并生成新的 release，不要把回滚当成永久分叉。

## 常见故障

| 现象 | 处理 |
| --- | --- |
| `release/` 不存在 | 运行 `pnpm build:release`，不要改传 `dist/` |
| release 审计报告实验室或调试模块 | 修复源码引用／打包边界并重建，不手删构建产物蒙混过关 |
| Wrangler 未登录 | 运行 `pnpm dlx wrangler login`，让用户完成浏览器授权 |
| 找不到 `angel2-web-remake` | 用 `whoami` 与 `pages project list` 核对账号；停止，不新建项目 |
| 文件数或单文件超过 Pages 限制 | 评估资源压缩、合并或 R2；取得方案确认后再改架构 |
| 部署成功但稳定网址仍像旧版 | 先查生产部署列表和本次专属 URL，再强制刷新与检查缓存 |
| 新版存在阻断性问题 | 立即按上一节回滚，再修复本地源码和重新发布 |

Cloudflare 官方参考：[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、
[Pages 回滚](https://developers.cloudflare.com/pages/configuration/rollbacks/)。
