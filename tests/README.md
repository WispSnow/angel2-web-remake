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
| `src/game/simulation/expert-ai.ts`、共享统一效用评分、完整通路／断路追击、虚拟前线排队、近身让路、近战威胁投影、法系固定目标施法落点、魔弓禁贴身／总伤害优先、行动者重规划与决策追踪 | `expert-ai.test.ts`，职业动作覆盖另见 `arena.test.ts` | `arena.spec.ts`、`arena-magic-archer-route.spec.ts` 或当前开放关卡的自动阶段用例 |
| `src/game/content/technique-*`、地图技术时间轴 | `technique-lab.test.ts` | `technique-lab.spec.ts`；只在正式接入变化时追加对应竞技场文件 |
| `src/game/content/classes.ts`、职业固定行／第三行后成长、近战／远程职责、`class-traits.ts`、终阶职业特性、飛龍攻后移动与水戰士受击分裂／共享状态 | `classes.test.ts` | `class-showdown.spec.ts` 的职业说明、飛龍流程和水戰士分裂用例 |
| `src/game/arena-*`、`src/arena.ts` | `arena.test.ts` | `arena.spec.ts`，再按动作族选择 `arena-*.spec.ts` |
| `class-showdown-session.ts` 的对阵场编成与镜像 | `class-showdown.test.ts` | `class-showdown.spec.ts` |
| 半龍戰士 `1N` 直连技術「傳送」：seed 200／模式 `0` 传播、空格落点、行动消耗与移動路径表现 | `half-dragon-teleport.test.ts`，职业菜单口径另见 `classes.test.ts` | `stage22.spec.ts` 的 `S22-J`、`class-showdown.spec.ts` 的傳送用例 |
| `promotion-lab-session.ts`、转职触发阈值与全候选 UI | `promotion-lab.test.ts`、`promotion.test.ts` | `promotion-lab.spec.ts`，入口另见 `debug.spec.ts` |
| 踩踏与目标落点 | `technique-lab.test.ts` 的 stomp 用例 | `technique-lab.spec.ts`、`arena-stomp.spec.ts`、`class-showdown.spec.ts` 的 stomp 用例 |
| 全景普通战斗 | `full-combat.test.ts` | `combat-lab.spec.ts` 或相关关卡用例 |
| 调试中心与场景目录 | `debug-roster-profiles.test.ts` | `debug.spec.ts` |
| `src/styles.css` 的胜负条件／出击提示面板安全区、长文排版与滚动兜底 | 无独立模拟数值测试 | `objective-panel-layout.spec.ts` |
| “遊戲功能”音效分类按钮的面板边界与从设置菜单打开“集體命令”的点击路由 | 无独立模拟数值测试 | `game-functions-menu.spec.ts` |
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
| 第 32 个可玩关卡（内部第 33 关）直接 1–10 人部署、SAY 65、二十九名静态守军、十五哨戒＋十四共享专家追击、全灭目标、五通道无动态增援、无胜利 SAY、v62/v61 与冻结 stage 34 路由 | `stage33-content.test.ts`、`stage33-battle.test.ts`、`save.test.ts`、`stage-runtime.test.ts`、`debug-roster-profiles.test.ts`、`construction-terrain-assets.test.ts` | `stage33.spec.ts`、`stage32.spec.ts`、`debug.spec.ts` |
| 工兵 `1K/2K` 构筑的逐关原始 tile 资产（`scripts/generate-dynamic-terrain-assets.mjs` 与 `BattleScene` 预载键） | `construction-terrain-assets.test.ts`，逐关 token／逻辑槽见对应 `stageN-battle.test.ts` | `stage27.spec.ts` 的 `S27-K`、`arena-construction.spec.ts` |
| 原生“肖像不随文字窗关闭而消失”的检查点（SAY/0043 点名段、SAY/0074 龍王石像） | `stage21-content.test.ts`、`stage20-content.test.ts` | `stage21.spec.ts` |
| 第 0–6 关内容或流程 | 对应 `stageN-*.test.ts` | 对应 `stageN.spec.ts`；真实通关只在入口合同受影响时运行 |
| 剧情对话 DOM、逐字推进、右键跳过确认与输入阻断 | 无独立模拟数值测试 | `stage0.spec.ts` 的剧情对话用例；各关卡通过 `dialogue-controls.ts` 复用真实跳过路径 |
| 部署 | `deployment*.test.ts` | `deployment-lab.spec.ts` 或对应关卡部署用例 |
| 肖像目录与职业通用头像回退 | `portrait.test.ts`、`arena.test.ts`、对应 `stageN-battle.test.ts`、`promotion.test.ts` | `portrait-lab.spec.ts`、`arena.spec.ts` 或具体关卡肖像用例 |

竞技场 E2E 只负责正式菜单、目标、表现接入、提交边界和结果。精确原生 draw 数、native tick、
音频序列和每级 AI 规划优先由单元测试及技能实验室验证，避免在竞技场重复完整时间轴。
