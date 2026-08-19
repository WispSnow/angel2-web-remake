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

## 责任映射

| 改动区域 | 首选单元测试 | 首选浏览器测试 |
| --- | --- | --- |
| `src/game/simulation/actions/`、动作数值与 PRNG | `actions.test.ts` | 对应 `arena-*.spec.ts` 技能族文件；魔弓线路见 `arena-magic-archer-route.spec.ts` |
| `src/game/simulation/battle.ts` 的普通伤害、地形防御、反击与经验 | `battle.test.ts`，职业特例另见 `classes.test.ts` | 对应关卡或 `class-showdown.spec.ts` |
| `src/game/simulation/objectives.ts` 的胜负条件、到达区展开与 Phaser 目的地标记 | `objectives.test.ts` | 到达型关卡 `stage4.spec.ts`、`stage9.spec.ts`、`stage11.spec.ts`、`stage23.spec.ts`、`stage24.spec.ts` |
| `src/game/simulation/stage-route.ts` 的行为 12 两阶段路线落点（忽略占格的探路图、锚点爬坡路线表、真实移动图上的五偏移落点）与 `stage0.ts` 的撤离区判据 | `battle.test.ts` 的路线／撤离用例 | `stage0.spec.ts` 的 `S00-F`，无夹具通关见 `stage0-real-clear.spec.ts` |
| `src/game/simulation/grid.ts` 的范围传播、地形代价、友军中转、敌方控制区（`REMAKE-105`：被占据的敌方邻格不进保留集合，可穿过但不可停留）与 `REMAKE-104`「贴身最后一步照常计价」 | `battle.test.ts` 的移动范围与地形代价用例 | 关卡移动流程见 `stage0.spec.ts`，跨职业地形见 `arena.spec.ts` |
| `src/game/simulation/expert-ai.ts`、共享统一效用评分、无耐久威胁、单体预计残血集火、法系／射手独立目标优先级、混乱／禁咒顺序与重复状态剔除、`REMAKE-102` 的 `AA` 近战候选边界、完整通路／断路追击、虚拟前线排队、近身让路（同职业记「通路缩短」，职业地形差造成断路时记「新增通路」）、近战威胁投影、法系固定目标施法落点、魔弓禁贴身／总伤害优先、具名主将原版远追边界与安全落点、行动者重规划、棋盘版本缓存与决策追踪 | `expert-ai.test.ts`，最大规模预算见 `stage36-ai-performance.test.ts`，职业动作覆盖另见 `arena.test.ts` | `arena.spec.ts`、`arena-magic-archer-route.spec.ts` 或当前开放关卡的自动阶段用例 |
| `src/game/simulation/forces.ts`、`force-ai.ts` 的军团归属、目标策略、`terrain-hold` 防区教义、优先治疗、成对领队／跟随（近端判据用普通移动图、跟随只在无合法动作时接管）与 `REMAKE-111` 集结项（集结点须属本军团、近战交出主动进攻权并按任意伤势休息、远程无收益时才收拢、进展按防区内路径代价可绕行、进区落点先按离集结点的剩余路程排序） | `forces.test.ts`，防区、编队与集结实例见 `stage3-battle.test.ts` | `stage3.spec.ts` |
| `src/game/content/technique-*`、地图技术时间轴 | `technique-lab.test.ts` | `technique-lab.spec.ts`；只在正式接入变化时追加对应竞技场文件 |
| `scripts/generate-map-action-atlases.mjs`、`map-action-atlas.ts` 与正式战斗/技术实验室地图动作图集 | `map-action-atlas.test.ts` | 按受影响动作族运行对应 `arena-*.spec.ts`、`technique-lab.spec.ts` 或关卡流程；实验室与正式战斗共用图集 |
| `src/game/content/classes.ts`、职业固定行／第三行后成长、近战／远程职责、39 职业目标优先级档案、`class-traits.ts`、终阶职业特性、飛龍攻后移动与水戰士受击分裂／共享状态 | `classes.test.ts` | `class-showdown.spec.ts` 的职业说明、飛龍流程和水戰士分裂用例 |
| `src/game/content/class-balance-overrides.ts`、`campaign-entry-experience.ts`：`REMAKE-092` 半龍戰士分段成长与 3 级后防御成长、七姊妹入队经验、`REMAKE-093` 水戰士仅 side 1 射击授予与敌方零影响 | `class-balance-overrides.test.ts`，入队实例见 `stage22-battle.test.ts`，迁移见 `save.test.ts` | `class-showdown.spec.ts` 的职业说明与射击用例 |
| `src/game/content/generic-ally-labels.ts`、`classes.ts` 的 `genericUnitName`／`unitDisplayName`：`REMAKE-107` 通用友军槽 40–59 的字母编号、只对 side 1 生效、跨关与转职稳定、读档重派生 | `generic-ally-labels.test.ts`，转职边界见 `promotion.test.ts`，继承实例见 `stage1-battle.test.ts` | `stage0-difficulty.spec.ts` 的单位循环身份行 |
| `src/game/content/generic-ally-stage-swap.ts`：`REMAKE-108` 第 2／3 关槽组对调、落点／行为／职业继承不变、每关按落点 `x` 升序分配槽号 | `generic-ally-stage-swap.test.ts`，逐关阵容见 `stage2-content.test.ts`／`stage2-battle.test.ts`／`stage3-battle.test.ts`，v84 拒绝见 `save.test.ts` | `stage2.spec.ts`、`stage3.spec.ts` |
| `src/game/simulation/objectives.ts` 的 `STAGE_ROUND_LIMIT`／`STAGE_ROUND_LIMIT_WARNING_ROUNDS` 与 `battle.ts` 的 `outcome`：`REMAKE-110` 每关 99 回合上限、回合边界判负、第 99 回合内胜利仍成立、警告区间与不超过上限的可见回合号 | `battle.test.ts` 的回合上限用例，存档边界与 v86 拒绝见 `save.test.ts` | `stage0.spec.ts` 的 `S00-S`（`stage-00-round-limit` 夹具）|
| `src/game/content/stage3.ts` 的 `stage-03-fourth-corps-joined` 事件与 `battle.ts` 的 `grantScriptedExperience`：`REMAKE-109` 第 3 关被救援的槽 21／3／20 以原版 `299` 入场、第 1 回合开启前各 +1 经验并依次授职、生命按累计伤害换算，胜负已定时不再开授职窗口 | `stage3-battle.test.ts` 的发放与继承用例、`stage3-content.test.ts` 的事件链，旧档补 id 见 `save.test.ts` | `stage3.spec.ts` 的 `S03-P` |
| `src/game/content/enemy-scaling.ts`、`stage0.ts` 的 `statsFor`／`initialEnemyExperience`：`REMAKE-103` 的 `legacy`／`linear` 敌方成长模式、逐难度出场等级、难度间单调性、剧情 boss 逐难度脚本值与我方零影响 | `enemy-scaling.test.ts`，逐难度实例见 `stage0-content.test.ts`，boss 实例见 `stage37-battle.test.ts`，覆写交界见 `class-balance-overrides.test.ts`，存档身份见 `save.test.ts` | 逐难度玩家可见口径见 `debug.spec.ts` 与当前开放关卡用例 |
| `src/game/arena-*`、`src/arena.ts` | `arena.test.ts` | `arena.spec.ts`，再按动作族选择 `arena-*.spec.ts` |
| `REMAKE-101` 冰雪施法前的 `selfAreaConfirm` 双色范围预览、纯文字信息栏（任何技能候选态都不放按钮或底板）、确认／取消入口，以及一次物理右键只退一层的画布取消判据 | 无独立模拟数值测试（预览是纯派生表现，不写模拟状态） | `arena-ice.spec.ts` 的预览与取消用例；魔弓箭道的纯文字信息栏与滚轮／点目标输入见 `arena-magic-archer-route.spec.ts`；其他冰雪施放路径见 `stage1.spec.ts`、`debug.spec.ts`、`arena-healing.spec.ts`、`arena-lightning.spec.ts` |
| `content/ai-technique-dialogue.ts` 的 DS:`84BB` 上下文短句与 `controller.ts` 的触发点：混亂点选 `1Ch`、禁咒拒绝 `1Ah`（技術项保留且不消耗行动）、无目标 `1Bh`、射击免疫 `1Dh`、反击 `1Eh`（仅地图战斗分支） | `ai-technique-dialogue.test.ts` | `arena-ailments.spec.ts` 的四条上下文短句用例；无目标短句在真实关卡的口径见 `stage0.spec.ts` 的 `S00-I` |
| `src/game/content/status-presentations.ts` 与 `ui.ts` 的单位详情状态图标行：原生 `A/17` 槽顺序、剩余回合、逐状态悬停说明文字与只读提示几何 | `status-presentations.test.ts` | `class-showdown.spec.ts` 的施毒图标与悬停提示用例；其他状态图标断言见 `arena.spec.ts`、`arena-ailments.spec.ts`、`stage37.spec.ts` |
| `class-showdown-session.ts` 的对阵场编成与镜像 | `class-showdown.test.ts` | `class-showdown.spec.ts` |
| 半龍戰士 `1N` 直连技術「傳送」：seed 200／模式 `0` 传播、空格落点、行动消耗与移動路径表现 | `half-dragon-teleport.test.ts`，职业菜单口径另见 `classes.test.ts` | `stage22.spec.ts` 的 `S22-J`、`class-showdown.spec.ts` 的傳送用例 |
| `promotion-lab-session.ts`、转职触发阈值与全候选 UI | `promotion-lab.test.ts`、`promotion.test.ts` | `promotion-lab.spec.ts`，入口另见 `debug.spec.ts` |
| 踩踏与目标落点 | `technique-lab.test.ts` 的 stomp 用例 | `technique-lab.spec.ts`、`arena-stomp.spec.ts`、`class-showdown.spec.ts` 的 stomp 用例 |
| 全景普通战斗 | `full-combat.test.ts` | `combat-lab.spec.ts` 或相关关卡用例 |
| 普通战斗信息栏时序：地图与全景表现期间只显示叙述行，战果在演出结束后才写入（玩家攻击与敌我 AI 攻击共用） | 无独立模拟数值测试（信息栏是派生表现） | `stage0.spec.ts` 的「the status strip reports ordinary-combat damage only after the presentation」 |
| `content/full-combat-backgrounds*` 的关卡表、受击方地形改写与 `C.SWF` 背景素材 | `full-combat-backgrounds.test.ts` | `full-combat-background.spec.ts`，第 0 关表值路径另见 `stage0.spec.ts` |
| 调试中心与场景目录 | `debug-roster-profiles.test.ts` | `debug.spec.ts` |
| `src/styles.css` 的胜负条件／出击提示面板安全区、长文排版与滚动兜底 | 无独立模拟数值测试 | `objective-panel-layout.spec.ts` |
| “遊戲功能”原版“子 選 單”的五项顺序、`ON/OFF`、面板／命中行几何、原版调色板与手形光标，以及键盘和鼠标切换 | 无独立模拟数值测试 | `game-functions-menu.spec.ts` |
| `src/game/scaling.ts`、`display-settings.ts` 的宿主「畫面縮放」偏好：`sharp`／`smooth`／`integer` 的取值校验、整数倍按装置像素吸附与留边取整，以及逻辑屏外的选择器位置与持久化 | `scaling.test.ts`、`preferences.test.ts` 的「display preferences」 | `display-scaling.spec.ts` |
| 模块 23 啟動流程：Softstar Logo、加法式调色板淡入、開場背景淡出淡入与 `A/23`+`A/24` 点阵滚动文字、標題 8×8 抖动溶解、点阵菜单文字与 50% 棋盘高亮、两套素材与 1608 tick 空闲重播、`Esc`／鼠标右键共用的取消语义与 `REMAKE-112` 的 `MUSIC/1` 循环与取消续播 | `startup.test.ts` | `startup.spec.ts`；各关卡通过 `startup-controls.ts` 复用真实跳過开场路径——Logo 期间的按键只缩短停留，必须等滚动開場接管后再送一次动作 |
| 存档 schema 与迁移 | `save.test.ts` | `startup.spec.ts` 或对应关卡的存读档用例 |
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
| 第 26 个可玩关卡（内部第 27 关）11–31 人部署、名单仅妮雅＋二十八候选、七名 NPC／三工兵名单外固定、SAY 51/52、五名叛军、四段妮雅线性到达区、无增援与 stage 28 路由 | `stage27-content.test.ts`、`stage27-battle.test.ts`、`deployment.test.ts`、`deployment-session.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage27.spec.ts` |
| 第 27 个可玩关卡（内部第 28 关）BK/22＋SAY 53 关前战议、1–29 人部署、SAY 54/55、十七名共享专家追击敌军、全灭目标、无增援、关前重试与冻结 stage 29 路由 | `stage28-content.test.ts`、`stage28-battle.test.ts`、`deployment.test.ts`、`deployment-session.test.ts`、`save.test.ts`、`stage-runtime.test.ts` | `stage28.spec.ts` |
| 第 28 个可玩关卡（内部第 29 关）BK/23＋SAY 56 关前剧情、1–15 人部署、槽 22 stableRemake 姓名“愛莉歐拉”／当前职业通用肖像身份、十五名共享专家追击敌军、全灭目标、无逐关处理器／无增援与 stage 30 路由 | `stage29-content.test.ts`、`stage29-battle.test.ts`、`promotion.test.ts`、`deployment.test.ts`、`deployment-session.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts` | `stage29.spec.ts`、`stage28.spec.ts`、`debug.spec.ts` |
| 第 29 个可玩关卡（内部第 30 关）BK/23＋SAY 57/58/59、固定三人、女帝开场转士兵、四档 8／16／24／32 个确定形态、全形态固定 D/41 女帝肖像阻断台词、最终 side 1 槽 23 女帝归队、无额外增援、v60/v59/v58/v57 与 stage 31 路由 | `stage30-content.test.ts`、`stage30-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts` | `stage30.spec.ts`、`stage29.spec.ts`、`stage31.spec.ts`、`debug.spec.ts` |
| 第 30 个可玩关卡（内部第 31 关）BK/23＋SAY 60/61/62、五名固定角色、二十四候选／十二开放格／最多十七人、菲伊魯茵与十四名共享专家追击伏兵、全灭目标、五通道无增援、v60/v59 与冻结 stage 32 路由 | `stage31-content.test.ts`、`stage31-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage31.spec.ts`、`stage30.spec.ts`、`debug.spec.ts` |
| 第 31 个可玩关卡（内部第 32 关）直接 1–16 人部署、SAY 63/64、菲伊魯茵／芙瑪羅妮与十六名共享专家追击静态联军、全灭目标、五通道无动态增援、v61/v60 与 stage 33 路由 | `stage32-content.test.ts`、`stage32-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage32.spec.ts`、`stage31.spec.ts`、`debug.spec.ts` |
| 第 32 个可玩关卡（内部第 33 关）直接 1–10 人部署、SAY 65、二十九名静态守军、十五哨戒＋十四共享专家追击、全灭目标、五通道无动态增援、无胜利 SAY、v62/v61 与可玩 stage 34 路由 | `stage33-content.test.ts`、`stage33-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage33.spec.ts`、`stage32.spec.ts`、`stage34.spec.ts`、`debug.spec.ts` |
| 第 33 个可玩关卡（内部第 34 关）直接 1–11 人部署、SAY 66、芙瑪羅妮／蕾娜吉芙与十七名静态守军、十九名共享专家追击、全灭目标、五通道无动态增援、无胜利 SAY、v63/v62 与可玩 stage 35 路由 | `stage34-content.test.ts`、`stage34-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage34.spec.ts`、`stage33.spec.ts`、`stage35.spec.ts`、`debug.spec.ts` |
| 第 34 个可玩关卡（内部第 35 关）固定九对十、SAY 67/68、十名行为 12 敌军无路线原地待命、全灭目标、五通道无动态增援、v64/v63 与 stage 36 路由 | `stage35-content.test.ts`、`stage35-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage35.spec.ts`、`stage34.spec.ts`、`debug.spec.ts` |
| 第 35 个可玩关卡（内部第 36 关）二十八人部署对三十敌军、SAY 80、碧娜維姬首領目标、行为 0/1/2 分组、五通道无动态增援、共享专家 AI 最大规模预算、当前 v73／v72-v64 迁移与可玩 stage 37 路由 | `stage36-content.test.ts`、`stage36-battle.test.ts`、`stage36-ai-performance.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage36.spec.ts` 的 `S36-J`、`stage35.spec.ts`、`debug.spec.ts` |
| 第 36 个可玩关卡（内部第 37 关）二十七人部署对究極女神三部位、SAY 81、最高难度数值、回復轮原版顺序／冰雪轮頭最后、头部／共享手部术法交替、棋盘顺序随机目标、碧娜維姬 `D/8` 部位肖像、冰雪／混乱／毒免疫、攻防下降写入、禁咒写入但不封专属行动、九字段隐藏、全灭目标、五通道无增援、v73/v72/v71/v70 与 stage 49 主线结局入口 | `stage37-content.test.ts`、`stage37-battle.test.ts`、`technique-lab.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage37.spec.ts`、`technique-lab.spec.ts`、`stage36.spec.ts`、`debug.spec.ts` |
| 内部 stage 49 主线结局的 SAY 70、原版对话窗／固定字宽排版、二十二张战绩卡、职业族群／存档次数／战绩总和分支、主动普通攻击击杀战绩生产者、跨槽存档次数累计与读档恢复、模块 35 入口分支音乐、八对结局插画的逐对原生调色板、尾聲无窗口点阵文字（UN/9+UN/10 图集、六偏移描边与原生排版）、逐字 24 tick 节奏（等待发生在每字之后，首字随段落开始即出现；节拍按段落起点锚定，不用链式延迟累积漂移）与按键补完、段落时长取「逐字时间与上限的较大者」、跨关战绩计数保全、八个尾声直达调试夹具、v74/v73/v72 与隐藏 stage 38 边界 | `stage49-ending.test.ts`、`battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts` | `stage49-ending.spec.ts` 的 `S49-F` 存档次数累计、`S49-G`／`S49-H` 逐字节拍与尾字后的整段收尾等待、`stage0.spec.ts` 的完成档次数、`stage37.spec.ts`、`debug.spec.ts` |
| 隐藏 stage 38“異世界”的 B/0077 生成内容、18 格部署、44 名对白前已存在的静态敌军、16 名历代角色姓名／肖像与 28 名职业回退、SAY/0164 前聚焦妮雅、SAY/0164/0165、全灭／妮雅失败优先、五通道无增援、开场调试入口、stage-39 终端路由与模块 46 片尾 | `stage38-content.test.ts`、`stage38-battle.test.ts`、`credits.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts` | `stage38.spec.ts`、`stage49-ending.spec.ts`、`debug.spec.ts` |
| 模块 46 七页字幕、八次 400 步不可跳过转场、UN/55 音乐请求、UN/54 永久 The End 时间轴／`DS:01F6` 调色板与片尾窗口居中 | `credits.test.ts`（PNG 取色助手 `postgame-plate-support.ts`）| `stage38.spec.ts` |
| 工兵 `1K/2K` 构筑的逐关原始 tile 资产（`scripts/generate-dynamic-terrain-assets.mjs` 与 `BattleScene` 预载键） | `construction-terrain-assets.test.ts`，逐关 token／逻辑槽见对应 `stageN-battle.test.ts` | `stage27.spec.ts` 的 `S27-K`、`arena-construction.spec.ts` |
| 原生“肖像不随文字窗关闭而消失”的检查点（SAY/0043 点名段、SAY/0074 龍王石像） | `stage21-content.test.ts`、`stage20-content.test.ts` | `stage21.spec.ts` |
| 第 0–6 关内容或流程 | 对应 `stageN-*.test.ts` | 对应 `stageN.spec.ts`；真实通关只在入口合同受影响时运行 |
| `dialogue-text.ts`、剧情对话 DOM、原生 Big5／ASCII 固定字宽、逐字推进、右键跳过确认与输入阻断 | 无独立模拟数值测试 | `stage0.spec.ts` 的剧情对话用例、`stage49-ending.spec.ts` 的上下窗长行排版；各关卡通过 `dialogue-controls.ts` 复用真实跳过路径 |
| `audio.ts`、`audio-settings.ts` 的四类音效请求门与走路声 `E/14`：玩家／我方自动／工兵構築／半龍戰士傳送／逐关脚本移动各请求一次，返悔与 `REMAKE-106` 的敌方阶段静音，走路声随移动演出结束淡出收尾（`data-walk-effect-active`） | `audio.test.ts` 的通道路由 | `stage0.spec.ts` 的 `RHP-05`／`RHP-05b` 与 `S00-A` 移动段、我方自动见 `stage2.spec.ts`、敌方静音见 `stage3.spec.ts` 的 `S03-N/O` |
| 逆向 RIX WAV 到运行时去重 OGG、Stage 0 无缝派生、源/输出哈希和发布目录禁用旧音乐 WAV | `music-assets.test.ts`、`credits.test.ts`、`stage49-ending.test.ts` | `stage0.spec.ts` 的 `S00-P`、`startup.spec.ts` 音频激活、`stage49-ending.spec.ts` 的音乐阶段 |
| 部署 | `deployment*.test.ts` | `deployment-lab.spec.ts` 或对应关卡部署用例 |
| 肖像目录与职业通用头像回退 | `portrait.test.ts`、`arena.test.ts`、对应 `stageN-battle.test.ts`、`promotion.test.ts` | `portrait-lab.spec.ts`、`arena.spec.ts` 或具体关卡肖像用例 |

竞技场 E2E 只负责正式菜单、目标、表现接入、提交边界和结果。精确原生 draw 数、native tick、
音频序列和每级 AI 规划优先由单元测试及技能实验室验证，避免在竞技场重复完整时间轴。
