# 《天使帝国 II》Web 复刻项目协作规范

本文件适用于仓库根目录及其全部子目录。`CLAUDE.md` 是指向本文件的符号链接；项目级代理约定只维护这一份，避免 Codex、Claude 与其他工具读取到不同规则。

## 项目目标

本项目通过逆向《天使帝国 II》（Empire of the Angel II）制作 Web 复刻版。默认目标是：

- 复现原版可达战役、规则、剧情节奏、像素素材、音乐音效与主要 UI 构图；
- 在有证据和明确决策的前提下修复原版明显 bug；
- 提供现代浏览器所需的输入、缩放、音量、文本与可访问性便利；
- 保证表现设置不改变模拟结果、随机序列或存档语义。

不要把“更合理”“更现代”自动等同于正确。玩法变化必须能追溯到原版证据、已确认的 `stableRemake` 决策或明确的产品决定。

## 开始任务前

1. 先阅读用户当前请求以及本文件。
2. 运行 `git status --short --branch`，保留用户已有改动，不覆盖无关文件。
3. 根据任务范围阅读对应真值文档：
   - 当前开发状态：`planning/STATUS.md`
   - 原版事实：`reverse/gdd/original-gdd.md`
   - 证据登记：`reverse/gdd/evidence-register.md`
   - 规则修复决策：`reverse/gdd/web-remake-rule-decisions.md`
   - Web 复刻设计入口：`design/remake-gdd/README.md`
   - 设计解冻门槛：`design/remake-gdd/09-design-acceptance.md`
   - 第 0 关合同：`design/remake-gdd/vertical-slices/stage-00.md`
   - 第 0 关 UI 状态：`design/remake-gdd/ui/stage-00-ui-flow.md`
4. 修改具体系统时，再阅读 `reverse/notes/` 中相应专题及其链接的机器 JSON，不要只依赖代码注释或记忆。

## 证据、设计与实现的优先级

不同目录回答不同问题，不能互相覆盖：

- `reverse/` 记录原版实际行为和证据，不是 Web 架构方案。
- `design/remake-gdd/` 定义玩家在复刻版中应体验到的规则和产品选择。
- `src/` 是当前实现，可能只覆盖设计的一部分，不能反向成为原版事实。
- `tests/` 是已实现合同的自动证据，但测试通过不自动解除设计冻结。

设计标签必须保持原义：

- `[OF]`：已确认的原版事实；
- `[SR]`：`stableRemake` 默认规则；
- `[DD]`：明确的复刻产品决定；
- `[H]`：需要试玩验证的假设；
- `[TBD]`：尚未闭合，禁止实现者自行猜测。

若资料冲突，先记录冲突和来源；不要静默选择一个版本，也不要改写 `reverse/` 来配合现有代码。

## 当前范围与冻结边界

以 `design/remake-gdd/09-design-acceptance.md` 的最新状态为准。当前仓库只明确授权第 0 关垂直切片作为有界实现例外。

- 第 1 关以后、部署、射击、技术、状态、转职和全战役通用化，不因第 0 关完成而自动解冻。
- 在用户明确授权前，可以复核证据、补规格、设计接口、修复已授权范围内的问题；不要直接实现仍被冻结的玩法。
- 新关卡应先使用 `design/remake-gdd/templates/stage-spec-template.md` 建立纸面合同。
- 新系统应先使用 `design/remake-gdd/templates/system-spec-template.md` 闭合规则顺序、取整、UI 反馈、AI 使用方式和验收实例。
- 用户的明确新指令可以改变范围；发生时同步更新相应设计状态，避免代码与文档再次漂移。

## 技术栈与运行

- Node.js：`.node-version` 记录主版本 `26`，CI 按它安装最新 26.x；本地跟随 Homebrew 的 `node`，不使用版本管理器。`package.json#engines` 只声明下限 `>=24.18.0`，不设上限；
- 包管理器：`pnpm`，版本以 `package.json#packageManager` 为准；
- 运行时：Phaser 4、TypeScript、Vite；
- 单元测试：Vitest；
- 浏览器验收：Playwright 版本绑定的 Chromium；
- 主游戏开发地址：`http://127.0.0.1:4173/`；
- 战斗动画实验室：`http://127.0.0.1:4173/combat-lab.html`。
- 地图技能动画实验室：`http://127.0.0.1:4173/technique-lab.html`。
- 肖像动画实验室：`http://127.0.0.1:4173/portrait-lab.html`。
- 全地形竞技场：`http://127.0.0.1:4173/arena.html`。
- 转职触发实验室：`http://127.0.0.1:4173/promotion-lab.html`。

常用命令：

```bash
pnpm install
pnpm dev
pnpm dev:debug
pnpm dev:arena
pnpm dev:promotions
pnpm dev:combat
pnpm dev:techniques
pnpm dev:portraits
pnpm test
pnpm test:coverage
pnpm build
pnpm test:e2e
pnpm check
node reverse/tools/angel2-phase1-verify.mjs
```

`pnpm dev:combat` 会启动同一个 Vite 开发服务器并直接打开战斗动画实验室；若已经运行
`pnpm dev`，直接访问 `/combat-lab.html` 即可。实验室用于组合攻守职业、格挡／重伤、
死亡、方向、速度、循环与声音，并支持时间轴暂停、40 ms 单步和语义节点跳转。它复用
正式全景战斗脚本和渲染器，但不建立关卡、不提交模拟结果，也不能替代普通 `/` 的真实
玩家流程验收。女帝、龍、頭、手都只有右侧可重放：女帝原版没有左侧普通全景图形且右侧
数据逐字节复用士兵，龍／頭／手只在 side 2 编队出现、原版没有填 side 1 表现块与
`M_00/86..88`。实验室按 `reach` 锁定方向并显示说明——它们当攻方时锁右、当守方时锁左，
不得据此伪造左侧画面或女帝独立动画。

`pnpm dev:techniques` 会打开 `/technique-lab.html` 地图技能动画实验室。它允许在独立
内存地图上配置任意敌我职业、施法者和目标并重放已接入的地图表现；未实现动作必须
保持禁用。实验室可以消费已取证但尚未开放玩法的表现脚本，不得借此把对应规则、AI、
战役内容或存档语义解冻。龍、頭、手缺少原版 side 1 地图图形，只能配置为敌方。

`pnpm dev:debug` 会打开 `/debug.html` 战役调试中心。新增可玩关卡时，必须在
`src/game/debug-scenarios.ts` 至少登记适用的关前、部署/准备、玩家回合、胜利准备和
完成路由场景；夹具必须确定、明确标记且只修改当前内存。普通 `/` 不得静态导入调试
模块或暴露 `window.__ANGEL2_DEBUG__`，调试场景也不得替代无夹具的真实通关验收。

`pnpm dev:arena` 会打开 `/arena.html` 全地形竞技场。设置页只允许使用共享职业目录中
已发布的敌我地图图形，并以正式移动规则校验落点；开战后必须通过可序列化配置建立正式
模拟状态，不得让 DOM 或 Phaser 对象成为阵容真值。竞技场会话只存在于当前内存，不得
读取、覆盖或写入战役记录。竞技场开放职业组合测试不等于解冻该职业尚未实现的专属行动、
AI、存档语义或后续关卡；新增职业能力时应同步补充竞技场验收，但仍须遵守对应纸面合同。

`pnpm dev:promotions` 会打开 `/promotion-lab.html` 转职触发实验室。页面按原版记录顺序
建立全部 12 个普通转职来源的敌我相邻配对，双方经验固定为进入第 4 成长行前 1 点；我方
复用正式授职对话和候选 UI，敌方只升级、不转职。实验室只存在于当前内存，不得读写战役
记录，也不得为测试方便改写正式成长、动作后扫描或候选提交规则。

`pnpm dev:portraits` 会打开 `/portrait-lab.html` 全战役肖像动画实验室。新角色只提交
原版 `portrait` 记录号；主图、三帧眼睛、三帧嘴部、尺寸和原版落点统一来自生成目录，
不得在关卡资产或 UI 中新增逐角色动画表。

Playwright 失败视频需要匹配版本的 ffmpeg；本机缺失时运行：

```bash
pnpm exec playwright install ffmpeg
```

不要在普通功能代码中依赖 `?test=1`、`?skipStartup`、调试 API 或测试夹具。真实通关验收必须从普通 `/` 启动，并只使用玩家可见控件。

## 目录职责

- `src/game/simulation/`：确定性规则、网格、战斗、AI 和可保存状态；
- `src/game/content/`：证据驱动的关卡、数值、对白和生成内容；
- `src/game/phaser/`：地图、单位、镜头、范围和战斗表现；
- `src/game/ui.ts`：DOM HUD、菜单、剧情和结果界面；
- `src/game/audio.ts`：音乐、音效和逐字音表现；
- `public/assets/original/`：浏览器运行时使用的已转换原版素材；
- `scripts/`：从逆向产物生成稳定运行时内容的脚本；
- `tests/unit/`：与渲染器无关的规则和内容测试；
- `tests/e2e/`：玩家可见流程、输入、音画事件和黄金截图；
- `planning/`：当前进度、路线、里程碑和跨阶段风险，不保存玩法真值；
- `reverse/`：取证工具、机器规格、笔记与渲染核验产物；
- `ref/ANGEL2/`：原始参考文件，只读。

## 架构约束

### 模拟与表现

- 模拟层是单位、回合、合法行动、伤害、经验、AI、胜负和 PRNG 的唯一真值。
- Phaser 对象、DOM 节点、动画帧、音频播放状态和计时器不能成为玩法真值。
- 场景负责把模拟状态投影为精灵、镜头和效果，并把语义输入送回控制器。
- UI 使用 DOM 承载密集文本、菜单、设置和可访问性表面；画布主要承载战场与运动。
- 动画加速、减少动态、声音开关和跳过演出只能改变等待或表现，不能改变结算顺序。

### 确定性

- 所有影响战果的随机数必须来自版本化、可序列化的模拟 PRNG。
- 眨眼、口型、粒子和其他表现随机必须使用独立随机源。
- 渲染帧率、音频是否成功播放、窗口焦点和异步资源完成顺序不得影响模拟。
- 存档恢复后，相同规则身份和语义操作序列必须产生相同结果。

### 输入

- 优先使用 `move`、`confirm`、`cancel`、`pause` 等语义动作，再映射键盘、鼠标和手柄。
- 模态菜单、剧情、战场和镜头输入必须有明确边界；打开覆盖层时不得把同一输入泄漏到战场。
- 保留原版输入语义时，可以增加现代映射，但不能删除玩家可发现的反馈或改变动作提交时点。

### 内容与 ID

- 关卡、职业、角色、动作、状态、地形和资源应使用稳定语义 ID，不要让文件路径或 DOS 内存偏移成为领域 API。
- 原始偏移、记录号和哈希应保留为证据元数据，而不是散落在业务分支中。
- 新关卡不要复制 `Stage0` 专用类型和控制器分支；先建立可验证的数据合同和通用边界。
- 不要为了抽象而提前实现被冻结系统。通用化应由已批准的下一切片需求驱动。

### 存档

- 只保存可序列化的模拟状态、规则身份、内容版本和完整 PRNG 状态。
- 读取存档必须验证完整 schema 和语义边界；不能只验证顶层 `format/version/kind`。
- 非法、损坏、未来版本或缺少 Mod 的存档必须安全拒绝并给玩家可见反馈，不能抛出未处理异常。
- 修改存档格式时增加版本和迁移/拒绝测试，不要原地改变旧版本含义。

## 逆向资料与原版资源

- `ref/ANGEL2/` 永远只读，绝不能作为可写 DOSBox/DOSBox-X 挂载目录。
- 需要可写实验副本时按 `reverse/README.md` 生成 `reverse/work/ANGEL2/`。
- 浏览器运行时不得读取 `ref/`、`reverse/decoded/`、`reverse/extracted/` 或其他工作目录。
- 运行时所需内容必须经脚本固化到 `src/game/content/` 或 `public/assets/original/`。
- `src/game/content/stage0-runtime.generated.ts` 是生成文件；修改来源或生成脚本后运行 `pnpm content:stage0`，不要手工编辑生成结果。
- `src/game/content/portrait-catalog.generated.ts` 与 `public/assets/original/portraits/` 由
  `scripts/generate-portrait-catalog.mjs` 生成；修改肖像来源或布局证据后运行
  `pnpm content:portraits`，不要手工登记角色动画。`D/63` 无原版覆盖帧/布局，`D/67`
  依证据沿用 `D/56` 布局。
- 保留原版调色板、像素边缘、透明索引、锚点和帧顺序。不要对像素素材启用平滑缩放。
- 添加或重命名资源后，检查全部运行时引用存在，并确认生产构建实际包含或可访问这些文件。

## 代码约定

- 遵循现有严格 TypeScript 配置；不要使用无必要的 `any`、非空断言或静默类型转换。
- 保持函数职责单一。新增功能前优先拆分已经过大的控制器、UI、启动或场景入口，不继续累积巨型条件分支。
- 对复杂原版规则写“为什么”和证据来源；不要用注释复述显而易见的代码。
- 玩家可见原文保持项目当前使用的繁体文本和原版标点；现代说明与原文分开存放。
- 内容表、数值和逐关事件尽量数据化；机器生成真值不要在多个 TypeScript 文件中手抄。
- 不要提交 `dist/`、`artifacts/`、`test-results/`、`playwright-report/`、`node_modules/` 或本地逆向工作产物。

## 测试要求

按改动风险选择最低充分验证，并在交付时说明实际运行了什么：

- 默认只运行与本次修改文件和受影响行为直接相关的测试，不因完成一次普通修改而自动运行
  `pnpm test`、`pnpm test:e2e`、`pnpm test:coverage` 或 `pnpm check` 等全量门禁。
- 优先用文件级或用例级命令缩小范围，例如
  `pnpm exec vitest run tests/unit/<相关文件>.test.ts`、
  `pnpm exec playwright test tests/e2e/<相关文件>.spec.ts` 或 Playwright 的标题过滤。
- 具体源码到测试文件的责任映射见 `tests/README.md`；新增系统或拆分测试时同步维护该表。
- 即使一次任务涉及多个系统，也应明确列出受影响系统并组合运行对应的定向测试；不要把
  “跨系统”自动等同于“全仓库测试”。
- 只有用户明确要求全量验证，或当前任务本身明确是发布前／发布候选验收时，才运行全量
  测试；运行前在进度更新中说明原因和预计范围。

| 改动 | 最低验证 |
| --- | --- |
| 文档、规格或逆向结论 | 检查本地链接；涉及证据基线时运行 `node reverse/tools/angel2-phase1-verify.mjs` |
| 模拟、数值、移动、AI、PRNG | 添加/更新对应 Vitest；只运行相关测试文件或用例；影响类型或生产打包时再运行 `pnpm build` |
| UI、输入、剧情、存档流程 | 添加/更新并运行对应 Playwright 文件或用例，不默认追加全量 `pnpm test:e2e` |
| Phaser、动画、HUD、响应式布局 | Playwright 断言加代表性截图，并人工查看截图 |
| 音乐、音效、逐字音 | 验证请求记录、阶段切换、开关和浏览器激活边界 |
| 生成内容或原版素材 | 重跑生成器、内容测试、生产构建和必要的视觉对照 |
| 跨系统改动 | 组合运行各受影响系统的定向测试，不默认运行全仓库门禁 |
| 用户明确要求的全量验证或发布前验收 | `pnpm check`，并复核普通 `/` 的真实玩家流程 |

额外规则：

- 修复 bug 时优先添加能在修复前失败的回归测试。
- 不要因截图变化直接更新黄金图；先判断是预期设计变化、字体/平台差异、动态表现还是实际回归。
- JavaScript 驱动的眨眼和口型不会被 Playwright 的 `animations: "disabled"` 自动冻结。黄金截图应使用稳定表现时点或只屏蔽已经由独立测试覆盖的动态局部。
- DOM 字形光栅化仍可能随宿主系统变化；CI 运行无夹具语义验收，Darwin 黄金图由固定 Chromium 在本地视觉审计。
- `tests/e2e/stage0-real-clear.spec.ts` 的真实通关路径不得调用 `window.__ANGEL2__` 或添加测试查询参数。
- DOM 断言不能代替 Canvas/WebGL 视觉检查；Canvas 测试必须保留截图证据。
- 普通 Playwright 运行只在失败时自动截图/录像；显式视觉审计截图通过
  `pnpm test:e2e:visual <相关文件或标题过滤>` 生成，不在每次定向回归中批量写入。

## 完成任务前

1. 运行与改动相称的测试、类型检查和构建。
2. 对 UI/动画改动查看实际截图，不只看测试是否为绿色。
3. 运行 `git diff --check`。
4. 再次检查 `git status --short`，确认没有意外生成物或无关改动。
5. 更新与实现直接相关的 README、设计状态、测试说明或生成命令；不要写容易过时的硬编码测试数量。
6. 交付时明确区分：已完成、已验证、未验证、仍被冻结或需要用户决定的事项。
