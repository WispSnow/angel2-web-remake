# 测试责任与定向运行

日常修改只运行直接受影响的文件或用例。完整 `pnpm check` 仅用于用户明确要求的全量验证、
发布候选或主分支门禁。

## 常用命令

```bash
pnpm exec vitest run tests/unit/<file>.test.ts
pnpm exec vitest run tests/unit/<file>.test.ts -t "<title>"
pnpm exec playwright test tests/e2e/<file>.spec.ts
pnpm exec playwright test tests/e2e/<file>.spec.ts -g "<title>"
pnpm test:e2e:visual tests/e2e/<file>.spec.ts -g "<title>"
```

普通 Playwright 运行由配置在失败时保存截图、录像和 trace。成功路径中的显式截图只在
`VISUAL_AUDIT=1` 时生成，用于动画、Canvas、HUD 和响应式布局的人工视觉审计。

选单以缩放动画开闔：Playwright 的可操作性检查会等方框稳定，所以「开选单 → 立刻点选项」
的用例会自动等这段动画，不需要手动 sleep；但量测几何或「关掉再开同一个选单」的用例要用
`menu-controls.ts` 的 `settleMenuAnimation` 与 `expectMenuOpen`，见责任映射对应行。

分段资源门会在 `goto`、`reload` 与战中读档后异步替换游戏表面。E2E 必须等待目标控制器阶段、
目标 DOM 或读档独有的状态组合；若读档前后阶段相同，不能只等 `phase`。资源请求断言应在导航前
注册 Playwright `request` 监听，不依赖容量有限、可能淘汰早期条目的 Resource Timing 缓冲区。

## 责任映射

| 改动区域 | 首选单元测试 | 首选浏览器测试 |
| --- | --- | --- |
| `src/game/simulation/actions/`、动作数值与 PRNG | `actions.test.ts` | 对应 `arena-*.spec.ts` 技能族文件；魔弓线路见 `arena-magic-archer-route.spec.ts` |
| `src/game/simulation/battle.ts` 的普通伤害、地形防御、反击与经验 | `battle.test.ts`，职业特例另见 `classes.test.ts` | 对应关卡或 `class-showdown.spec.ts` |
| `src/game/simulation/objectives.ts` 的胜负条件、到达区展开与 Phaser 目的地标记 | `objectives.test.ts` | 到达型关卡 `stage4.spec.ts`、`stage9.spec.ts`、`stage11.spec.ts`、`stage23.spec.ts`、`stage24.spec.ts` |
| `src/game/simulation/stage-route.ts` 的行为 12 两阶段路线落点（忽略占格的探路图、锚点爬坡路线表、真实移动图上的五偏移落点）与 `stage0.ts` 的撤离区判据 | `battle.test.ts` 的路线／撤离用例 | `stage0.spec.ts` 的 `S00-F`，无夹具通关见 `stage0-real-clear.spec.ts` |
| `src/game/simulation/grid.ts` 的范围传播、地形代价、友军中转、敌方控制区（`REMAKE-105`：被占据的敌方邻格不进保留集合，可穿过但不可停留）与 `REMAKE-104`「贴身最后一步照常计价」 | `battle.test.ts` 的移动范围与地形代价用例 | 关卡移动流程见 `stage0.spec.ts`，跨职业地形见 `arena.spec.ts` |
| `src/game/simulation/expert-ai.ts`、共享统一效用评分、无耐久威胁、单体预计残血集火、法系／射手独立目标优先级、混乱／禁咒顺序与重复状态剔除、`REMAKE-102` 的 `AA` 近战候选边界、`REMAKE-116` 的 `SA` 近战候选边界、完整通路／断路追击、虚拟前线排队、近身让路（同职业记「通路缩短」，职业地形差造成断路时记「新增通路」）、近战威胁投影、法系固定目标施法落点、魔弓禁贴身／总伤害优先、`REMAKE-118` 具名主将的护卫半径与安全落点（主将本身与杂兵一样可以移动后攻击）、行动者重规划、棋盘版本缓存与决策追踪 | `expert-ai.test.ts`，最大规模预算见 `stage36-ai-performance.test.ts`，职业动作覆盖另见 `arena.test.ts` | `arena.spec.ts`、`arena-magic-archer-route.spec.ts` 或当前开放关卡的自动阶段用例 |
| `BattleScene` 棋子标记层与 `battle.ts` 的 `isNpcAlly`：原版 `A/1` frame 9 的 `E` 与 frame 13 的 `N` 共用 `(-22,-15)` 的 `16×14` 槽位、`E` 优先、演出期间都不画，`N` 只给原版行为非零且复刻未归玩家指挥的 side 1 单位；棋子上没有敌我色环 | `forces.test.ts` 的 `npc ally map badge identity`（含逐关名单） | `stage2.spec.ts` 的 `S02-K` |
| `src/game/simulation/forces.ts`、`force-ai.ts` 的军团归属、目标策略、`terrain-hold` 防区教义、优先治疗、成对领队／跟随（近端判据用普通移动图、跟随只在无合法动作时接管）与 `REMAKE-111` 集结项（集结点须属本军团、近战交出主动进攻权并按任意伤势休息、远程无收益时才收拢、进展按防区内路径代价可绕行、进区落点先按离集结点的剩余路程排序） | `forces.test.ts`，防区、编队与集结实例见 `stage3-battle.test.ts` | `stage3.spec.ts` |
| `src/game/content/technique-*`、地图技术时间轴 | `technique-lab.test.ts` | `technique-lab.spec.ts`；只在正式接入变化时追加对应竞技场文件 |
| `scripts/generate-map-action-atlases.mjs`、`map-action-atlas.ts` 与正式战斗/技术实验室地图动作图集 | `map-action-atlas.test.ts` | 按受影响动作族运行对应 `arena-*.spec.ts`、`technique-lab.spec.ts` 或关卡流程；实验室与正式战斗共用图集 |
| `staged-render-asset-cache.ts`、`resource-loader.ts` 与正式 Phaser 场景对当前资源包 PNG／JSON 响应的对象 URL 复用；源 URL 不得在资源门后再次请求，预取只保留当前后两包的压缩字节 | `staged-render-asset-cache.test.ts`、`resource-manifest.test.ts` | `resource-loading.spec.ts` 的正式初級炎暴故障注入、地图／棋子／技能图集单请求与截图；实验室不建立资源门，不替代该用例 |
| `scripts/generate-full-combat-atlases.mjs`、`full-combat-atlas.ts`、`full-combat-image-cache.ts` 与全景普通战斗职业／阵营图集 | `full-combat-atlas.test.ts`、`full-combat-image-cache.test.ts`、`full-combat.test.ts` | `resource-loading.spec.ts`、`combat-lab.spec.ts`、`compendium.spec.ts` 与相关关卡全景战斗用例 |
| `scripts/generate-battle-sprite-atlases.mjs`、`battle-sprite-atlas.ts` 与地图命中／死亡、回合切换及逐关连续特效图集；正式战场从当前资源租约复用 PNG／JSON，实验室无门时回退原路径 | `battle-sprite-atlas.test.ts` | `battle-sprite-atlas.spec.ts` 的第 0／4／26 关精确请求边界、重复请求故障注入与命中／死亡／回合 Canvas 截图；`stage0.spec.ts`、`stage4.spec.ts`、`stage26.spec.ts` 的对应表现用例 |
| `scripts/generate-resource-manifest.mjs`、`resource-loader.ts`、`staged-render-asset-cache.ts`、`dom-image-readiness.ts`、`music-resource-cache.ts`、逐关资源门与职业表现按需预载；`boot` 的全部 PNG 及当前关所需肖像分层必须在各自加载页内解码，缓存层与实际 DOM 段的图片解码并发均不超过 6 | `resource-manifest.test.ts`、`staged-render-asset-cache.test.ts`、`dom-image-readiness.test.ts`、`map-unit-loading.test.ts`、`portrait-assets.test.ts`、`music-resource-cache.test.ts`、`stage-runtime.test.ts` | `resource-loading.spec.ts` 的开场／肖像解码冻结与单请求、开场／第 0 关并行、字节进度、音乐复用、当前职业全景门、失败重试与逐关预取；结局／片尾段见 `stage49-ending.spec.ts` 的 `S49-I` 与 `stage38.spec.ts` 的 `S38-H` |
| `src/game/content/classes.ts`、职业固定行／第三行后成长、近战／远程职责、39 职业目标优先级档案、`class-traits.ts`、终阶职业特性、飛龍攻后移动与水戰士受击分裂／共享状态 | `classes.test.ts` | `class-showdown.spec.ts` 的职业说明、飛龍流程和水戰士分裂用例 |
| `src/game/content/class-balance-overrides.ts`、`campaign-entry-experience.ts`：`REMAKE-092` 半龍戰士分段成长与 3 级后防御成长、七姊妹入队经验、`REMAKE-093` 水戰士仅 side 1 射击授予与敌方零影响 | `class-balance-overrides.test.ts`，入队实例见 `stage22-battle.test.ts`，迁移见 `save.test.ts` | `class-showdown.spec.ts` 的职业说明与射击用例 |
| `src/game/content/generic-ally-labels.ts`、`classes.ts` 的 `genericUnitName`／`unitDisplayName`：`REMAKE-107` 通用友军槽 40–59 的字母编号、只对 side 1 生效、跨关与转职稳定、读档重派生 | `generic-ally-labels.test.ts`，转职边界见 `promotion.test.ts`，继承实例见 `stage1-battle.test.ts` | `stage0-difficulty.spec.ts` 的单位循环身份行 |
| `src/game/content/generic-ally-stage-swap.ts`：`REMAKE-108` 第 2／3 关槽组对调、落点／行为／职业继承不变、每关按落点 `x` 升序分配槽号 | `generic-ally-stage-swap.test.ts`，逐关阵容见 `stage2-content.test.ts`／`stage2-battle.test.ts`／`stage3-battle.test.ts`，v84 拒绝见 `save.test.ts` | `stage2.spec.ts`、`stage3.spec.ts` |
| `src/game/simulation/objectives.ts` 的 `STAGE_ROUND_LIMIT`／`STAGE_ROUND_LIMIT_WARNING_ROUNDS` 与 `battle.ts` 的 `outcome`：`REMAKE-110` 每关 99 回合上限、回合边界判负、第 99 回合内胜利仍成立、警告区间与不超过上限的可见回合号 | `battle.test.ts` 的回合上限用例，存档边界与 v86 拒绝见 `save.test.ts` | `stage0.spec.ts` 的 `S00-S`（`stage-00-round-limit` 夹具）|
| `src/game/content/stage3.ts` 的 `stage-03-fourth-corps-joined` 事件与 `battle.ts` 的 `grantScriptedExperience`：`REMAKE-109` 第 3 关被救援的槽 21／3／20 以原版 `299` 入场、第 1 回合开启前各 +1 经验并依次授职、生命按累计伤害换算，胜负已定时不再开授职窗口 | `stage3-battle.test.ts` 的发放与继承用例、`stage3-content.test.ts` 的事件链，旧档补 id 见 `save.test.ts` | `stage3.spec.ts` 的 `S03-P` |
| `src/game/content/enemy-scaling.ts`、`stage0.ts` 的 `statsFor`／`initialEnemyExperience`：`REMAKE-103` 的 `legacy`／`linear` 敌方成长模式、逐难度出场等级、难度间单调性、剧情 boss 逐难度脚本值与我方零影响 | `enemy-scaling.test.ts`，逐难度实例见 `stage0-content.test.ts`，boss 实例见 `stage37-battle.test.ts`，覆写交界见 `class-balance-overrides.test.ts`，存档身份见 `save.test.ts` | 逐难度玩家可见口径见 `debug.spec.ts` 与当前开放关卡用例 |
| `src/game/arena-*`、`src/arena.ts` | `arena.test.ts` | `arena.spec.ts`，再按动作族选择 `arena-*.spec.ts` |
| `REMAKE-101` 冰雪施法前的 `selfAreaConfirm` 双色范围预览、纯文字信息栏（任何技能候选态都不放按钮或底板）、确认／取消入口，以及一次物理右键只退一层的画布取消判据 | 无独立模拟数值测试（预览是纯派生表现，不写模拟状态） | `arena-ice.spec.ts` 的预览与取消用例；魔弓箭道的纯文字信息栏与滚轮／点目标输入见 `arena-magic-archer-route.spec.ts`；其他冰雪施放路径见 `stage1.spec.ts`、`debug.spec.ts`、`arena-healing.spec.ts`、`arena-lightning.spec.ts` |
| `content/ai-technique-dialogue.ts` 的 DS:`84BB` 上下文短句与 `controller.ts` 的触发点：混亂点选 `1Ch`、禁咒拒绝 `1Ah`（技術项保留且不消耗行动）、无目标 `1Bh`、射击免疫 `1Dh`（玩家侧不受开关控制）、反击 `1Eh`（仅地图战斗分支且仅骨龍騎士完整反伤）、AI 射击宣告 `08h` 与规划器标注的 `00h/01h/02h`（均受“ＡＩ對話”开关控制） | `ai-technique-dialogue.test.ts` 的短句表与门禁；规划器标注见 `expert-ai.test.ts` 的「native contextual lines emitted from the AI planner」 | `arena-ailments.spec.ts` 的上下文短句用例；无目标短句在真实关卡的口径见 `stage0.spec.ts` 的 `S00-I` |
| `src/game/content/status-presentations.ts` 与 `ui.ts` 的单位详情状态图标行：原生 `A/17` 槽顺序、剩余回合、逐状态悬停说明文字与只读提示几何 | `status-presentations.test.ts` | `class-showdown.spec.ts` 的施毒图标与悬停提示用例；其他状态图标断言见 `arena.spec.ts`、`arena-ailments.spec.ts`、`stage37.spec.ts` |
| `src/game/native-text.ts`、`native-hud-text.ts` 与 `content/native-font.generated.ts` 的原版点阵字文字层：`UN/58`+`UN/59` 与 BIOS `8×8` ROM 字模合成的图集、`0000:EA04` 的光标前进量与两遍外框、五字元数值栏、身分栏左右对齐、回合样板与关卡名内边距 | `native-text.test.ts` | `stage0.spec.ts` 的 `RHP-08`；身分列与数值文字仍由 `class-showdown.spec.ts`、`arena-buffs.spec.ts` 读 DOM 断言 |
| `class-showdown-session.ts` 的对阵场编成与镜像 | `class-showdown.test.ts` | `class-showdown.spec.ts` |
| 半龍戰士 `1N` 直连技術「傳送」：seed 200／模式 `0` 传播、空格落点、行动消耗与移動路径表现 | `half-dragon-teleport.test.ts`，职业菜单口径另见 `classes.test.ts` | `stage22.spec.ts` 的 `S22-J`、`class-showdown.spec.ts` 的傳送用例 |
| `promotion-lab-session.ts`、转职触发阈值与全候选 UI | `promotion-lab.test.ts`、`promotion.test.ts` | `promotion-lab.spec.ts`，入口另见 `debug.spec.ts` |
| 踩踏与目标落点 | `technique-lab.test.ts` 的 stomp 用例 | `technique-lab.spec.ts`、`arena-stomp.spec.ts`、`class-showdown.spec.ts` 的 stomp 用例 |
| 全景普通战斗（含原生 `(250,135)/(650,-150)` 先攻／反击通道初始化、骑兵 G1 1:1 投影、`REMAKE-121` reaction 画布中心校正，以及迅龍 frame 3 `-16` 证据保留／仅格挡 `+16 px` 落地补偿） | `full-combat.test.ts` | `combat-lab.spec.ts` 的骑兵／弩兵／左右迅龍用例、`compendium.spec.ts` 的 reaction 注册用例，或相关关卡用例 |
| 普通战斗信息栏时序：地图与全景表现期间只显示叙述行，战果在演出结束后才写入（玩家攻击与敌我 AI 攻击共用） | 无独立模拟数值测试（信息栏是派生表现） | `stage0.spec.ts` 的「the status strip reports ordinary-combat damage only after the presentation」 |
| `content/full-combat-backgrounds*` 的关卡表、受击方地形改写与 `C.SWF` 背景素材 | `full-combat-backgrounds.test.ts` | `full-combat-background.spec.ts`，第 0 关表值路径另见 `stage0.spec.ts` |
| 调试中心与场景目录 | `debug-roster-profiles.test.ts` | `debug.spec.ts` |
| `src/styles.css` 的胜负条件／出击提示面板安全区、长文排版与滚动兜底 | 无独立模拟数值测试 | `objective-panel-layout.spec.ts` |
| `src/game/menu-pointer-glide.ts` 的原生开菜单指针滑行：`0000:580F`／`0000:5851` 的「四分之一剩余距离、至少 1 px、差 1 px 就停」步进、`0000:57F9` 的精确落点收尾，与`0000:56C8` 的 `(0x78, 0x1C)` 第一行落点 | `menu-pointer-glide.test.ts` | `menu-animation.spec.ts` 的输入来源用例：鼠标／触控开菜单直接显示，键盘开启在有已知起点时保留滑行，系统“减少动态效果”不改写后者 |
| `src/game/menu-animation.ts` 与 `src/styles.css` 的选单开闔动画：开启由 CSS 在 `hidden` 解除时重播，关闭先播收合动画再真正隐藏，收合期间标 `aria-hidden`、不接收指针、不重建内容 | 无独立单元测试（Vitest 运行在 node 环境，无 DOM） | `menu-animation.spec.ts`；量测选单几何的用例先调 `menu-controls.ts` 的 `settleMenuAnimation`，关掉再开同一个选单的流程改用同一文件的 `expectMenuOpen`（收合动画期间旧方框仍可见，`toBeVisible()` 会提前成立）；两者的现有调用点见 `game-functions-menu.spec.ts`、`objective-panel-layout.spec.ts`、`stage0.spec.ts` |
| `src/game/ui.ts` 的 `renderResult`：`savePrompt` 的確定／取消選單只在剛進入該畫面時建立節點，選取索引變動只原地切換 `is-selected`／`aria-current`，不重建節點（否則會被當成新掛上的 `.action-menu` 而重播 `native-menu-zoom-in`） | 无独立单元测试（同上，需要 DOM） | `stage23.spec.ts` 的「toggling 確定／取消 in the save-confirm menu reuses its DOM node instead of replaying the pop-in」 |
| `src/game/input-bindings.ts`、`startup.ts`、`deployment-ui.ts` 与 `ui.ts` 的现代默认键位：方向键／WASD、Enter／Space、Esc／Backspace、Tab 下一待行动单位、G 集体命令、O 胜负条件，以及不冲突的原版相容键和标准手柄战场映射 | `input-bindings.test.ts` | `keyboard-controls.spec.ts`；标题与部署表面另见 `startup.spec.ts`、`deployment-lab.spec.ts` |
| “遊戲功能”原版“子 選 單”的五项顺序、`ON/OFF`、面板／命中行几何、原版调色板与手形光标，以及键盘和鼠标切换 | 无独立模拟数值测试 | `game-functions-menu.spec.ts` |
| `src/game/scaling.ts`、`display-settings.ts` 的宿主「畫面縮放」偏好：`sharp`／`smooth`／`integer` 的取值校验、整数倍按装置像素吸附与留边取整，以及逻辑屏外的选择器位置与持久化 | `scaling.test.ts`、`preferences.test.ts` 的「display preferences」 | `display-scaling.spec.ts` |
| `src/game/host-overlays.ts` 与 `src/game/overlay/` 的宿主覆盖层骨架，以及 `src/game/remake-notes/` 的「復刻說明」内容：三个入口按钮与「畫面縮放」同行右对齐、各自固定开在第一个分页、说明的五个分页（含键盘／鼠标／手柄操作说明，以及免責聲明的权利归属、非官方／非商业边界与宽窄屏排版）、按键不得抵达战场、`Esc` 关闭并交还焦点、面板打开时敌方阶段照常推进 | 无独立单元测试（策展文字为常量，覆盖层需要 DOM） | `remake-notes.spec.ts` |
| `src/game/compendium/` 的「圖鑑」覆盖层：职业图鉴对全部 39 个职业目录记录的覆盖、平衡覆写派生、敌我棋子切换及正式全景受击前 `direct frame 0` 静态站立、攻击／格挡／重伤／死亡预览（含右侧限定素材边界），角色图鉴对全部 51 名具名角色的分组、肖像、简介与出场关卡，以及两个分页各自保留选中项 | `character-compendium.test.ts`（角色目录派生、勝負條件槽、事件生成登场、简介引用的关卡序数）；职业视图无独立单元测试（数值全部由 `class-catalog.generated.ts` 与 `classes.ts` 的公开函数派生，全景预览复用 `full-combat.test.ts` 已覆盖的正式脚本） | `compendium.spec.ts` |
| `src/game/roadmap/` 的「RoadMap」覆盖层：三个候选愿景分页、非承诺提示、QQ 交流群 `1107513111`、原始二维码加载、宽窄屏布局与关闭后焦点交还 | 无独立单元测试（愿景文字为常量，覆盖层需要 DOM） | `roadmap.spec.ts` |
| `styles.css` 的 `.logical-screen` 裁切：640×350 画框只裁切、不成为可捲容器（位置牌 17px 文字撑在 16px 行高裡多出 2px，戰鬥實驗室底圖另外向外撑 80px），浏览器为露出画面内控件而捲动时不得整屏位移 | 无独立单元测试（纯 CSS 裁切） | `display-scaling.spec.ts` 的「the logical screen clips its overflow without becoming scrollable」 |
| `styles.css` 的战场层序（底板 → 画布 → `A/0000` 边框 → `A/0005` 雕像前景）：「平滑」缩放会把相机视口 `(40,23,400,308)` 的硬透明边缘向外晕开，边框必须最后绘制 | 无独立单元测试（纯合成顺序） | `display-scaling.spec.ts` 的「the battlefield never bleeds through the window frame」，像素解码见 `screenshot-pixels.ts` |
| 模块 23 啟動流程：Softstar Logo、加法式调色板淡入、開場背景淡出淡入与 `A/23`+`A/24` 点阵滚动文字（行按 `DS:07C0`/`DS:07CA` 两条遮挡条逐扫描线揭开与遮住、左起点 `x=160`、`REMAKE-113` 的整体下移 8 像素）、標題 8×8 抖动溶解、点阵菜单文字与 50% 棋盘高亮、两套素材与 1608 tick 空闲重播、`Esc`／鼠标右键共用的取消语义与 `REMAKE-114`／`REMAKE-115` 的 `MUSIC/1` 只播一次、取消不打断；全部 Canvas／菜单 PNG 解码后才建立时间原点并启动 RAF | `startup.test.ts`、`staged-render-asset-cache.test.ts` | `startup.spec.ts` 与 `resource-loading.spec.ts` 的开场解码冻结、精确单请求及截图；各关卡通过 `startup-controls.ts` 复用真实跳過开场路径——Logo 期间的按键只缩短停留，必须等滚动開場接管后再送一次动作 |
| 存档 schema 与迁移 | `save.test.ts` | `startup.spec.ts` 或对应关卡的存读档用例 |
| `src/game/save/backup.ts`、`src/game/save-backup-ui.ts` 的版本化 20 槽备份、逐槽严格迁移校验、完整还原、失败回滚，以及标题与战中记录确认表面 | `save-backup.test.ts` | `startup.spec.ts` 的 `BOOT-B backup/restore`；`stage0.spec.ts` 的 `RHP-03b` |
| 第 4 关内容、行为 12 结界路线与 `route-pulse.ts`／`route-pulse-presentation.ts` 的两层力场电波 | `stage4-content.test.ts`、`stage4-battle.test.ts`、`route-pulse-presentation.test.ts`、`stage-runtime.test.ts` | `stage4.spec.ts` |
| 第 7 关内容、部署与战斗合同 | `stage7-content.test.ts`、`stage7-battle.test.ts`、`stage-runtime.test.ts` | `stage7.spec.ts` |
| 第 8 关内容、固定军团与战斗合同 | `stage8-content.test.ts`、`stage8-battle.test.ts`、`stage-runtime.test.ts` | `stage8.spec.ts` |
| 第 9 关内容、部署、护送路线与复合目标 | `stage9-content.test.ts`、`stage9-battle.test.ts`、`objectives.test.ts`、`stage-runtime.test.ts` | `stage9.spec.ts` |
| 内部第 11 关内容、剧情离场、每轮无限可复用增援、固定撤离战与到达区目标 | `stage11-content.test.ts`、`stage11-battle.test.ts`、`stage-runtime.test.ts` | `stage11.spec.ts` |
| 内部第 10 关内容、BK/10 关前剧情、1–13 人部署、五名追兵与全灭目标 | `stage10-content.test.ts`、`stage10-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage10.spec.ts` |
| 内部第 12 关内容、BK/10–14 三段剧情、1–9 人部署、五个水戰士根槽、职业分裂、共享生命显示时序、全景右侧详情快照与无关卡增援 | `stage12-content.test.ts`、`stage12-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage12.spec.ts` 的地图／全景分身扣血与右侧详情回归；`stage0.spec.ts` S00-K 的普通职业全景详情回归 |
| 内部第 13 关内容、BK/15 关前剧情、1–12 人部署、两名水戰士新成员、九名守军、瑪西爾首领目标与无增援 | `stage13-content.test.ts`、`stage13-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage13.spec.ts` |
| 内部第 14 关内容、1–10 人部署、SAY/33 开战对白、芳率七敌、首领目标、回合 6 行为清零证据与无增援 | `stage14-content.test.ts`、`stage14-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage14.spec.ts` |
| 内部第 15 关内容、1–10 人部署、SAY/34 开战对白、蘭率十敌、首领目标、回合 6 行为清零证据与无增援 | `stage15-content.test.ts`、`stage15-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage15.spec.ts` |
| 内部第 16 关内容、1–10 人部署、SAY/35 开战对白、莎率十三敌、首领目标、回合 6 行为清零证据与无增援 | `stage16-content.test.ts`、`stage16-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage16.spec.ts` |
| 内部第 17 关内容、1–10 人部署、SAY/36 开战对白、倩率十二敌、首领目标、回合 6 行为清零证据与无增援 | `stage17-content.test.ts`、`stage17-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage17.spec.ts` |
| 内部第 18 关内容、1–8 人部署、SAY/37 双窗开战对白、麗率十六敌、首领目标、回合 6 行为清零证据与无增援 | `stage18-content.test.ts`、`stage18-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage18.spec.ts` |
| 内部第 19 关内容、1–10 人部署、SAY/38 愛／蘇蘭達双窗开战对白、愛率二十一敌、首领目标、回合 6 行为清零证据与无增援 | `stage19-content.test.ts`、`stage19-battle.test.ts`、`objective-records.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage19.spec.ts` |
| 内部第 20 关内容、3–17 人部署、十六人叙事阵形替换、妖龍／WD、魔祭師琴斯／龍王胜利链与 stage 21 路由 | `stage20-content.test.ts`、`stage20-battle.test.ts`、`wd-action.test.ts`、`expert-ai.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage20.spec.ts` |
| 内部第 21 关空模板、四名斥候继承／生成／移动、非交互即时胜利与 stage 22 路由 | `stage21-content.test.ts`、`stage21-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage21.spec.ts` |
| 内部第 22 关 1–19 人部署、女帝／琴斯临时剧情、六敌延迟伏击、妖龍／妮雅胜负、SAY 45 关后整顿／对话后存档与 stage 23 路由 | `stage22-content.test.ts`、`stage22-battle.test.ts`、`stage-events.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage22.spec.ts` |
| 内部第 23 关直接 1–15 人部署、SAY 46、二十一名静态守军、9 守卫／12 追击、妮雅线性到达区、无增援与 stage 24 路由 | `stage23-content.test.ts`、`stage23-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage23.spec.ts` |
| 内部第 24 关 1–15 人部署、SAY 47/48、二十二名静态守军、12 哨戒／10 追击、妮雅线性城堡到达区、无增援与直接 stage 26 路由 | `stage24-content.test.ts`、`stage24-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage24.spec.ts` |
| 第 25 个可玩关卡（内部第 26 关）4–22 人部署、SAY 49/50、碧娜維姬与七祭司、7 哨戒／1 追击、无增援、敌方阶段尾双次纵列下推与 stage 27 路由 | `stage26-content.test.ts`、`stage26-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage26.spec.ts` |
| 第 26 个可玩关卡（内部第 27 关）11–31 人部署、名单仅妮雅＋二十八候选、七名 NPC／三工兵名单外固定、槽 22 stableRemake 姓名“愛莉歐拉”／巨斧戰士通用肖像、SAY 51/52、五名叛军、四段妮雅线性到达区、无增援、当前 v93/v92 显示身份迁移与 stage 28 路由 | `stage27-content.test.ts`、`stage27-battle.test.ts`、`deployment.test.ts`、`deployment-session.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage27.spec.ts` |
| 第 27 个可玩关卡（内部第 28 关）BK/22＋SAY 53 关前战议、1–29 人部署、SAY 54/55、十七名共享专家追击敌军、全灭目标、无增援、关前重试与冻结 stage 29 路由 | `stage28-content.test.ts`、`stage28-battle.test.ts`、`deployment.test.ts`、`deployment-session.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage28.spec.ts` |
| 第 28 个可玩关卡（内部第 29 关）BK/23＋SAY 56 关前剧情、1–15 人部署、槽 22 stableRemake 姓名“愛莉歐拉”／当前职业通用肖像身份、十五名共享专家追击敌军、全灭目标、无逐关处理器／无增援与 stage 30 路由 | `stage29-content.test.ts`、`stage29-battle.test.ts`、`promotion.test.ts`、`deployment.test.ts`、`deployment-session.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts` | `stage29.spec.ts`、`stage28.spec.ts`、`debug.spec.ts` |
| 第 29 个可玩关卡（内部第 30 关）BK/23＋SAY 57/58/59、固定三人、女帝开场转士兵、四档 8／16／24／32 个确定形态、全形态固定 D/41 女帝肖像阻断台词、最终 side 1 槽 23 女帝归队、无额外增援、v60/v59/v58/v57 与 stage 31 路由 | `stage30-content.test.ts`、`stage30-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts` | `stage30.spec.ts`、`stage29.spec.ts`、`stage31.spec.ts`、`debug.spec.ts` |
| 第 30 个可玩关卡（内部第 31 关）BK/23＋SAY 60/61/62、五名固定角色、二十四候选／十二开放格／最多十七人、菲伊魯茵与十四名共享专家追击伏兵、全灭目标、五通道无增援、v60/v59 与冻结 stage 32 路由 | `stage31-content.test.ts`、`stage31-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage31.spec.ts`、`stage30.spec.ts`、`debug.spec.ts` |
| 第 31 个可玩关卡（内部第 32 关）直接 1–16 人部署、SAY 63/64、菲伊魯茵／芙瑪羅妮与十六名共享专家追击静态联军、全灭目标、五通道无动态增援、v61/v60 与 stage 33 路由 | `stage32-content.test.ts`、`stage32-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage32.spec.ts`、`stage31.spec.ts`、`debug.spec.ts` |
| 第 32 个可玩关卡（内部第 33 关）直接 1–10 人部署、SAY 65、阿莉絲 D/30／瑪西爾 D/31 与二十七名职业回退静态守军、十五哨戒＋十四共享专家追击、全灭目标、五通道无动态增援、无胜利 SAY、当前 v93 接受 v92／v91 身份修复迁移（原切片 v62/v61）与可玩 stage 34 路由 | `stage33-content.test.ts`、`stage33-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage33.spec.ts`、`stage32.spec.ts`、`stage34.spec.ts`、`debug.spec.ts` |
| 第 33 个可玩关卡（内部第 34 关）直接 1–11 人部署、SAY 66、芙瑪羅妮／蕾娜吉芙与十七名静态守军、十九名共享专家追击、全灭目标、五通道无动态增援、无胜利 SAY、v63/v62 与可玩 stage 35 路由 | `stage34-content.test.ts`、`stage34-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage34.spec.ts`、`stage33.spec.ts`、`stage35.spec.ts`、`debug.spec.ts` |
| 第 34 个可玩关卡（内部第 35 关）固定九对十、SAY 67/68、十名行为 12 敌军无路线原地待命、全灭目标、五通道无动态增援、v64/v63 与 stage 36 路由 | `stage35-content.test.ts`、`stage35-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage35.spec.ts`、`stage34.spec.ts`、`debug.spec.ts` |
| 第 35 个可玩关卡（内部第 36 关）二十八人部署对三十敌军、SAY 80、碧娜維姬首領目标、行为 0/1/2 分组、五通道无动态增援、共享专家 AI 最大规模预算、当前 v73／v72-v64 迁移与可玩 stage 37 路由 | `stage36-content.test.ts`、`stage36-battle.test.ts`、`stage36-ai-performance.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage36.spec.ts` 的 `S36-J`、`stage35.spec.ts`、`debug.spec.ts` |
| 第 36 个可玩关卡（内部第 37 关）二十七人部署对究極女神三部位、SAY 81、最高难度数值、回復轮原版顺序／冰雪轮頭最后、头部／共享手部术法交替、棋盘顺序随机目标、碧娜維姬 `D/8` 部位肖像、冰雪／混乱／毒免疫、攻防下降写入、禁咒写入但不封专属行动、九字段隐藏、全灭目标、五通道无增援、v73/v72/v71/v70 与 stage 49 主线结局入口 | `stage37-content.test.ts`、`stage37-battle.test.ts`、`technique-lab.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage37.spec.ts`、`technique-lab.spec.ts`、`stage36.spec.ts`、`debug.spec.ts` |
| 内部 stage 49 主线结局的 SAY 70、原版对话窗／固定字宽排版、二十二张战绩卡、职业族群／存档次数／战绩总和分支、主动普通攻击击杀战绩生产者、跨槽存档次数累计与读档恢复、模块 35 入口分支音乐、八对结局插画的逐对原生调色板、尾聲无窗口点阵文字（UN/9+UN/10 图集、六偏移描边与原生排版）、逐字 24 tick 节奏（等待发生在每字之后，首字随段落开始即出现；节拍按段落起点锚定，不用链式延迟累积漂移）与按键补完、当前段 DOM 图片／字体就绪门、段落时长取「逐字时间与上限的较大者」、跨关战绩计数保全、八个尾声直达调试夹具、v74/v73/v72 与隐藏 stage 38 边界 | `stage49-ending.test.ts`、`portrait-assets.test.ts`、`battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts` | `stage49-ending.spec.ts` 的 `S49-F` 存档次数累计、`S49-G`／`S49-H` 逐字节拍与尾字后的整段收尾等待、`S49-I` 解码冻结／单请求、`stage0.spec.ts` 的完成档次数、`stage37.spec.ts`、`debug.spec.ts` |
| 隐藏 stage 38“異世界”的 B/0077 生成内容、18 格部署、44 名对白前已存在的静态敌军、16 名历代角色姓名／肖像与 28 名职业回退、SAY/0164 前聚焦妮雅、SAY/0164/0165、全灭／妮雅失败优先、五通道无增援、开场调试入口、stage-39 终端路由与模块 46 片尾 | `stage38-content.test.ts`、`stage38-battle.test.ts`、`credits.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts` | `stage38.spec.ts`、`stage49-ending.spec.ts`、`debug.spec.ts` |
| 模块 46 七页字幕、八次 400 步不可跳过转场、当前出／入页 DOM 图片就绪门、UN/55 音乐请求、UN/54 永久 The End 时间轴／`DS:01F6` 调色板与片尾窗口居中 | `credits.test.ts`（PNG 取色助手 `postgame-plate-support.ts`）| `stage38.spec.ts` 的 `S38-F/G` 完整片尾与 `S38-H` 解码冻结／单请求 |
| 工兵 `1K/2K` 构筑的逐关原始 tile 资产（`scripts/generate-dynamic-terrain-assets.mjs` 与 `BattleScene` 预载键） | `construction-terrain-assets.test.ts`，逐关 token／逻辑槽见对应 `stageN-battle.test.ts` | `stage27.spec.ts` 的 `S27-K`、`arena-construction.spec.ts` |
| 原生“肖像不随文字窗关闭而消失”的检查点（SAY/0043 点名段、SAY/0074 龍王石像） | `stage21-content.test.ts`、`stage20-content.test.ts` | `stage21.spec.ts` |
| 第 0–6 关内容或流程 | 对应 `stageN-*.test.ts` | 对应 `stageN.spec.ts`；真实通关只在入口合同受影响时运行 |
| `dialogue-text.ts`、剧情对话 DOM、原生 Big5／ASCII 固定字宽、逐字推进、右键跳过确认与输入阻断 | 无独立模拟数值测试 | `stage0.spec.ts` 的剧情对话用例、`stage49-ending.spec.ts` 的上下窗长行排版；各关卡通过 `dialogue-controls.ts` 复用真实跳过路径 |
| `dialogue-window-animation.ts` 与 `A/18` 对话窗开闔动画：`WU`／`WD` 的 11 步横向展开（80→400 px）、`CU`／`CD` 的 12 步收回、收合期间对话层与肖像不得提前消失、`data-dialogue-closing` 残影不再接受点击 | 无独立模拟数值测试 | `dialogue-window-animation.spec.ts`；判定「对话是否仍在进行」统一走 `dialogue-controls.ts` 的 `activeDialogueRecord` |
| 原生肖像合成体：`(x+8,y)` 起 `112×144` 的 50% 网点投影（屏幕 `(X+Y)` 偶数才涂黑）、`x-1`／`x+5`／`x+106`／`x+112` 四道 `1×147` 黑边，以及「侧饰 → 顶饰 → 姓名牌」的贴图先后 | 无独立模拟数值测试；证据在 `story-presentations.json#dialoguePortraitFrame` 的 `shadow`／`outlineColumns`，由 `scripts/generate-portrait-catalog.mjs` 断言 | `dialogue-portrait-frame.spec.ts`（战场下窗、离开游戏反馈窗与关前上窗三个锚点各验一次） |
| 模块 25 过场底纹：`A/20` 以 `40×40` 为重复单元铺满 `640×350`（全部关卡共用一张）、`BK/<id>` 画在原生 `(160,80)`，以及模块 29 战场内 `PP` 不得长出底纹 | 无独立模拟数值测试；证据在 `story-presentations.json#storyBackdrop`，运行时图块由 `scripts/generate-portrait-catalog.mjs` 裁出并断言 | `story-backdrop.spec.ts` |
| `audio.ts`、`audio-settings.ts` 的独立五档总音效增益、四类音效请求门与走路声 `E/14`：玩家／我方自动／工兵構築／半龍戰士傳送／逐关脚本移动各请求一次，返悔与 `REMAKE-106` 的敌方阶段静音，走路声随移动演出结束淡出收尾（`data-walk-effect-active`） | `audio.test.ts` 的增益与通道路由、`preferences.test.ts` 的旧偏好迁移 | `stage0.spec.ts` 的 `RHP-05`／`RHP-05b` 与 `S00-A` 移动段、我方自动见 `stage2.spec.ts`、敌方静音见 `stage3.spec.ts` 的 `S03-N/O` |
| 逆向 RIX WAV 到运行时去重 OGG、Stage 0 无缝派生、源/输出哈希和发布目录禁用旧音乐 WAV | `music-assets.test.ts`、`credits.test.ts`、`stage49-ending.test.ts` | `stage0.spec.ts` 的 `S00-P`、`startup.spec.ts` 音频激活、`stage49-ending.spec.ts` 的音乐阶段 |
| `audio.ts` 的 `syncMusic` 逐阶段选曲：`deployment` 播放模块 27 自己的名单曲（场景 `0..5` 用 `MUSIC/16`、场景 `6` 起用 `MUSIC/17`），`prebattleStory` 播放本关 `music.story`（没有 `music.story` 的关卡回到靜音，而不是继续放上一关的曲子） | `deployment-music.test.ts` 的场景分界与资产；`AudioManager` 本身需要 DOM／Web Audio，无独立单元测试 | `stage1.spec.ts` 的部署段 `MUSIC/16`、`stage23.spec.ts` 的「stage 24's deployment screen plays module 27's own roster track」 |
| 部署 | `deployment*.test.ts` | `deployment-lab.spec.ts` 或对应关卡部署用例 |
| 肖像目录与职业通用头像回退 | `portrait.test.ts`、`arena.test.ts`、对应 `stageN-battle.test.ts`、`promotion.test.ts` | `portrait-lab.spec.ts`、`arena.spec.ts` 或具体关卡肖像用例 |

竞技场 E2E 只负责正式菜单、目标、表现接入、提交边界和结果。精确原生 draw 数、native tick、
音频序列和每级 AI 规划优先由单元测试及技能实验室验证，避免在竞技场重复完整时间轴。
