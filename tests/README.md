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
| `src/game/simulation/expert-ai.ts`、敌方统一效用评分、行动者重规划与决策追踪 | `expert-ai.test.ts`，职业动作覆盖另见 `arena.test.ts` | `arena.spec.ts`、`arena-magic-archer-route.spec.ts` 或当前开放关卡的敌方阶段用例 |
| `src/game/content/technique-*`、地图技术时间轴 | `technique-lab.test.ts` | `technique-lab.spec.ts`；只在正式接入变化时追加对应竞技场文件 |
| `src/game/content/classes.ts`、职业固定行／第三行后成长、`class-traits.ts`、终阶职业特性、飛龍攻后移动与水戰士受击分裂／共享状态 | `classes.test.ts` | `class-showdown.spec.ts` 的职业说明、飛龍流程和水戰士分裂用例 |
| `src/game/arena-*`、`src/arena.ts` | `arena.test.ts` | `arena.spec.ts`，再按动作族选择 `arena-*.spec.ts` |
| `class-showdown-session.ts` 的对阵场专用动作 | `class-showdown.test.ts` | `class-showdown.spec.ts` |
| `promotion-lab-session.ts`、转职触发阈值与全候选 UI | `promotion-lab.test.ts`、`promotion.test.ts` | `promotion-lab.spec.ts`，入口另见 `debug.spec.ts` |
| 踩踏与目标落点 | `technique-lab.test.ts` 的 stomp 用例 | `technique-lab.spec.ts`、`arena-stomp.spec.ts`、`class-showdown.spec.ts` 的 stomp 用例 |
| 全景普通战斗 | `full-combat.test.ts` | `combat-lab.spec.ts` 或相关关卡用例 |
| 调试中心与场景目录 | `debug-roster-profiles.test.ts` | `debug.spec.ts` |
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
| 第 0–6 关内容或流程 | 对应 `stageN-*.test.ts` | 对应 `stageN.spec.ts`；真实通关只在入口合同受影响时运行 |
| 剧情对话 DOM、逐字推进、右键跳过确认与输入阻断 | 无独立模拟数值测试 | `stage0.spec.ts` 的剧情对话用例；各关卡通过 `dialogue-controls.ts` 复用真实跳过路径 |
| 部署 | `deployment*.test.ts` | `deployment-lab.spec.ts` 或对应关卡部署用例 |
| 肖像目录与职业通用头像回退 | `portrait.test.ts`、`arena.test.ts`、对应 `stageN-battle.test.ts`、`promotion.test.ts` | `portrait-lab.spec.ts`、`arena.spec.ts` 或具体关卡肖像用例 |

竞技场 E2E 只负责正式菜单、目标、表现接入、提交边界和结果。精确原生 draw 数、native tick、
音频序列和每级 AI 规划优先由单元测试及技能实验室验证，避免在竞技场重复完整时间轴。
