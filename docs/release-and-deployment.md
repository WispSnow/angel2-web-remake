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

GitHub 只用于源码托管、普通 CI 与 Windows Tauri 安装包构建。仓库为公开开源仓库，因此
GitHub 上的一切都按「任何人可见」对待：不要把凭据、私有地址或未公开的发布计划写进工作流、
提交信息或工作流日志。Cloudflare 继续严格按本文后续步骤从本地运行 Wrangler Direct Upload；
不要在 GitHub Actions 中添加 Cloudflare Token、Account ID、Wrangler 上传或推送即上线逻辑。

仓库公开后，Actions artifact 的可下载范围由仓库可见性决定：公开仓库的 artifact 任何人都能
从 Actions 页面下载。Windows 安装包目前既未代码签名、也未完成真实 Windows 验收；在取得签名
方案并通过验收之前，不要把 artifact 链接当作面向玩家的发布渠道，也不要为它创建 GitHub
Release。

面向玩家的 Windows 分发当前走百度网盘，理由是安装包内含原版素材，而 GitHub Release 会把它
变成仓库自身的一条公开再分发渠道（见 README「授权与版权」）；顺带一提，Cloudflare Pages 单
文件上限 25 MiB，约 56 MiB 的安装包本来也放不进现有站点。未签名分发靠校验和自证完整性：
`Windows desktop package` 工作流会生成 `*-setup.exe.sha256` 并把 SHA-256 写进运行摘要，上传
网盘时必须把校验文件与安装包放在一起，玩家侧的核对与 SmartScreen 说明见 README「Windows
安装包」一节。换用代码签名后再回头删掉这些说明，不要两套并存。

线上实际部署版本以 Cloudflare 的部署列表为准，不能仅根据本地 `HEAD`、`release/` 的修改
时间或本文档推断。`release/`、`dist/` 和 `artifacts/` 都是被忽略的本地产物，不进入 Git。

## 发布权限边界

- “更新本地版”“生成 release”“做发布前检查”不包含更新线上站点的授权。
- 只有用户明确确认当前内容并要求发布／上线后，才能创建生产部署。
- 发布前再次运行 `git status --short --branch`，保留用户已有改动，确认这次要发布的源码范围。
- 若 Cloudflare 登录失效、账号不对、找不到既有项目或需要创建新项目，停止并请用户处理；
  不要自行创建同名或近似项目。
- 不把 Cloudflare API Token、账号 ID、OAuth 配置或其他凭据写入仓库、命令输出摘要或发布文档。

## Windows Tauri 开发包

### 发布版本号

当前发布版本记录在 `package.json`，并与 `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`
及 `src-tauri/Cargo.lock` 保持一致。不要只重命名已经生成的安装包：NSIS 文件名、Windows
文件元数据和安装升级判断都必须来自构建时的真实版本。

每次准备新的 Windows 安装包时，先且只执行一次版本更新：

```bash
pnpm release:version          # 默认递增次版本，例如 0.2.0 -> 0.3.0
pnpm release:version 0.2.1    # 用户明确指定版本时使用该版本
pnpm release:version --dry-run
```

未明确指定版本号时，默认把次版本加一并把修订号归零，即 `x.y.z -> x.(y+1).0`。构建或上传失败后
重试同一发行版时不得再次运行版本更新命令，否则会无故跳过版本。脚本会在修改前校验四处版本完全
一致，并拒绝同版本或降级版本。版本变更与对应内容摘要登记在
[`release-history.md`](release-history.md)。

Windows 桌面版和 Web 版共享同一套 TypeScript、模拟、内容与 `pnpm build:release` 玩家包。
发布构建只类型检查 `src/`；依赖本机逆向证据的单元测试另由 `pnpm typecheck:tests` 检查，
避免不含 `reverse/parsed/` 工作产物的干净 GitHub 检出阻断玩家包构建。
`src-tauri/` 只是受限桌面壳，不接入 Node.js、文件系统或其他 Tauri 插件；它从内置协议加载
`release/`，因此调试中心和实验室仍被现有发布审计排除。稳定应用标识
`com.wispsnow.angel2-web-remake` 同时决定 WebView 数据目录；发布后不得随意更名，否则桌面
`localStorage` 存档会落入另一个来源。网页和桌面来源的存档不会自动共享，迁移使用游戏内已有的
20 槽 JSON 备份导出／导入。

图标同样只有一份来源：`src-tauri/app-icon.svg` 经 `pnpm tauri icon` 生成 `src-tauri/icons/`。
桌面与开始菜单快捷方式不带独立图标参数，用的是 `tauri-build` 从 `icons/icon.ico` 嵌进主程序的
图标资源；NSIS 安装程序和卸载程序自己另需 `installerIcon`／`uninstallerIcon`，缺了会退回 NSIS
默认图标。网页版的分页图标是同一套素材的逐字节副本 `public/favicon.ico`（`/favicon.ico` 也是
各实验室页面的隐式回退）与 `public/icon-256.png`；`desktop-packaging.test.ts` 断言两侧字节相等，
换图时不会只更新其中一边。

桌面运行时不继承 Web 页面的 640px 最大宽度：「銳利」与「平滑」以客户区宽、高中较紧的一边
为准等比放大完整 640×350 逻辑画面，拖动窗口、最大化和全屏都会重新计算；未被画面占用的窄条
只用于保持原始宽高比，底部宿主控制条不参与缩放。「整數倍」还会调用受限的 Tauri 窗口尺寸
能力：先退出最大化／全屏，再把客户区调整成当前显示器可容纳、最接近现有大小的完整装置像素
倍数，并把控制条高度计入窗口，因此不会在游戏画面外保留大块空区。网页构建不调用原生能力，
仍保持最多 1 倍及整数倍留边的既有行为。

桌面版的宿主介面（底部工具列与「復刻說明」「圖鑑」「RoadMap」三个覆盖层）不随游戏画面放大，
因此窗口配置打开了 `zoomHotkeysEnabled`，工具列上也多一组「介面縮放」，通过
`core:webview:allow-set-webview-zoom` 调用 WebView 的真页面缩放。整数倍模式的窗口尺寸是按 CSS
像素量出来的，写回 `LogicalSize` 前必须先用窗口自己的 `scaleFactor()` 还原页面缩放倍率；漏掉这一步，
玩家只要缩放过页面，整数倍每次重算都会再把窗口缩小一次，一路缩到 `minWidth`。

`.github/workflows/desktop-windows.yml` 只在以下情况运行：

- Actions 页面手动触发 `Windows desktop package`；
- 推送 `desktop-v*` 版本标签。

工作流在真正的 `windows-latest` x64 runner 上安装锁定的 pnpm 依赖和 Rust stable，调用：

```bash
pnpm desktop:build:windows
```

Tauri 随后先调用 `pnpm build:release`，再只生成当前用户安装模式的 NSIS `*-setup.exe`。工作流
要求产物精确为一个安装程序，并以 `angel2-windows-x64-<commit>` 名称保留 14 天。仓库公开后
该 artifact 对任何访客可见可下载，因此它虽然仍是未签名的内部验证包，却不再有「只有成员能拿
到」的保护；下节的签名与验收边界必须当作对外承诺来执行。它不会创建 GitHub Release，也不会
更新 Cloudflare。

Windows 开发包采用 Tauri 默认的小体积 Evergreen WebView2 路径：Windows 10/11 已有运行时时
直接复用，缺失时由安装程序静默调用联网 bootstrapper。当前没有附带 127 MiB 离线安装程序或
约 180 MiB 固定 WebView2，也没有配置 Windows 代码签名。因此内部验证包可以安装，但从浏览器
下载后可能显示 SmartScreen 未知发布者警告；面向公众发布前必须另行取得代码签名方案并完成
真实 Windows x64 验收，不能把 Actions 构建成功当作玩家接受。

手动触发和下载可以使用 GitHub UI，也可以在已登录且有权限的终端执行：

```bash
gh workflow run desktop-windows.yml --ref main
gh run list --workflow desktop-windows.yml
gh run download <run-id> --name <artifact-name>
```

桌面包至少要在 Windows 上检查：标题至进关资源加载、地图与全景 WebGL、音乐／音效激活、
自由拖动和最大化／全屏下的等比自适应、「整數倍」退出系统占用尺寸后自动贴合外部窗口、跨不同
DPI 显示器、键鼠／手柄、存档重启保留、备份导入导出、安装升级和卸载。Mac 上的浏览器
或 Tauri 构建不能替代这组 Windows 验收。

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

当前加载策略使用页面直接管理的 Cache Storage 持久保留已完成资源包。缓存名包含清单版本与
身份；同一清单刷新后复用本地字节，新清单则切换到新命名空间并清理旧资源缓存，不会把稳定语义 URL
下的旧内容当成新版。`index.html` 与资源清单仍按普通 HTTP 策略重验证；Vite 生成的带内容哈希
JS／CSS 由 `public/_headers` 设为一年 `immutable`。这不是离线应用：没有 Service Worker 或 R2，没有完整缓存的
资源仍须网络可用；不要在发布步骤改成全战役首屏下载。

关卡资源门必须覆盖该关卡表面真正会画的每一个文件。判断标准是可机检的：正式运行时里
`/assets/original/...` 的原始 URL 不该由 Phaser（`xhr`）、`<img>`／CSS（`image`）或音频（`media`）发出——
这些通道都不经过 Cache Storage，所以一旦漏了，慢速连线会在载入页收起之后才开始抓，而且每进一次关就
重抓一次。已知的三种漏法都已修掉，新增关卡时要一并检查：`BattleScene` 每关都排入的共用棋子必须进
`battle:core`（不能只挂在第 0 关模块上）；关卡模块用样板字串算出来的 `unitSprites` 清单生成器看不到，
因此由 `StageAssetRequirements.unitSpriteUrls` 在运行时原样带过资源门；`.svg` 与 `.png`／`.json` 一样要能
进 staged 租约。结局与制作人员表的租约还要覆盖 `native-ui-assets.ts` 里 CSS 自定义属性引用的图，否则
换包之后那些属性会退回原始 URL。

部署介面是正式流程里唯一延后加载的表面，它的模块与样式是打包产物，不在资源清单里。有部署阶段的
关卡必须在关卡资源门内把这些模块一并备妥（`ensureStage` 的 `afterLoad`），载入页收起之后、玩家走到
部署画面之前不得再有程式或样式请求；否则慢速连线会在阶段切过去、载入页已经收起时才开始抓，画面停在
没有任何提示的空表面上，玩家看到的就是卡死。新增延后加载的正式表面时同样要接进这条门，不要只依赖
掛載当下的 `import()`。

Cache Storage 不会自动拦截 `<img>`、CSS `url()`、Phaser 或 `new Image()`；正式运行时必须先把
当前资源包的 PNG／JSON 响应交给 staged render lease，再由 DOM、CSS 与 Phaser 使用同一次响应
建立的对象 URL。战场边框、HUD、战术面板、对话框、点阵字体、命令菜单／指针和状态图标属于
`battle:core`，不得重新塞回第 0 关包；当前小地图、剧情插画、部署／转职我方棋子随当前关进入
有限预解码集合。图鉴中不属于当前包的职业／肖像仍按需读取，全景、地图技能、敌方纹理、结局
与制作人员表继续使用各自既有租约，禁止为了消除原始 URL 而把全战役 PNG 同时解码常驻。

开场包同时包含 `MUSIC/14` 与 `MUSIC/1`。加载页完成图像解码和两首乐曲的 PCM 解码后，才显示
「进入游戏」的音频激活门；玩家的按键／指针手势解锁 Web Audio 后，Softstar Logo 和原版开场时间线才起步，
因此不得跳过音乐去追赶画面。开场后后台准备第 0 关，关卡切换只强制下一关并预取再后两关。每关包必须
包含关卡／部署场景的全部背景音乐；资源门会保留这些 OGG 的压缩编码数据供 `MusicTransport` 直接复用，
但只解码当前实际选中的曲目。职业补充集合包含棋盘棋子、
存在的左右全景 PNG，以及该职业可能使用的共享技能图集；图片仍由 DOM／Phaser 在实际场景中
解码，不代表预取时已把全战役纹理放进显存。当前关肖像则按棋盘、部署名单、本关剧情和职业
通用回退记录补载主图／眼睛／口型，并在关卡加载页内预解码；正式 DOM 分层就绪前暂停逐字、
口型和眨眼。不得把 `stream:portraits` 整包改成所有关卡的共同依赖。

所有关卡共同依赖 `audio:effects`。该包只含正式动作、技能、说话与按键 WAV；资源门从同一次
响应保留编码内容并最多 6 路并发解码，场景挂载前把全部音效变成常驻 `AudioBuffer`。运行时
`AudioManager`、全景战斗实验室和地图技能实验室都只通过低延迟 Web Audio 调度已准备的 buffer，
不得在语义音效点再建立 `<audio>` 或发起 `media` 请求。当前集合为 67 个文件、470,396 B 编码，
按 48 kHz 单声道 float 解码约占 6.6 MiB；音乐仍走逐曲解码，不得并入这组常驻音效。

主线结局与制作人员表虽然在切入前下载各自资源包，但不得因此一次解码整包 PNG。运行时只为
当前故事页、战绩卡、尾声或字幕转场建立对象 URL，并在实际 DOM 图片（尾声还包括位图字体）
就绪后才启动该段逐字、停留、滚动或 The End 时间轴。图片解码最多 6 路并发；切换表面时须撤销
旧对象 URL。已读取肖像可保留压缩字节以避免结局到隐藏关重复下载，但不能保留全战役解码纹理。

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
