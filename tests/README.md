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
| `src/game/simulation/actions/`、动作数值与 PRNG | `actions.test.ts` | 对应 `arena-*.spec.ts` 技能族文件 |
| `src/game/simulation/battle.ts` 的普通伤害、地形防御、反击与经验 | `battle.test.ts`，职业特例另见 `classes.test.ts` | 对应关卡或 `class-showdown.spec.ts` |
| `src/game/content/technique-*`、地图技术时间轴 | `technique-lab.test.ts` | `technique-lab.spec.ts`；只在正式接入变化时追加对应竞技场文件 |
| `src/game/content/classes.ts`、职业固定行／第三行后成长、`class-traits.ts`、终阶职业特性、飛龍攻后移动与水戰士受击分裂／共享状态 | `classes.test.ts` | `class-showdown.spec.ts` 的职业说明、飛龍流程和水戰士分裂用例 |
| `src/game/arena-*`、`src/arena.ts` | `arena.test.ts` | `arena.spec.ts`，再按动作族选择 `arena-*.spec.ts` |
| `class-showdown-session.ts` 的对阵场专用动作 | `class-showdown.test.ts` | `class-showdown.spec.ts` |
| 踩踏与目标落点 | `technique-lab.test.ts` 的 stomp 用例 | `technique-lab.spec.ts`、`arena-stomp.spec.ts`、`class-showdown.spec.ts` 的 stomp 用例 |
| 全景普通战斗 | `full-combat.test.ts` | `combat-lab.spec.ts` 或相关关卡用例 |
| 调试中心与场景目录 | `debug-roster-profiles.test.ts` | `debug.spec.ts` |
| 存档 schema 与迁移 | `save.test.ts` | `startup.spec.ts` 或对应关卡的存读档用例 |
| 第 0–4 关内容或流程 | 对应 `stageN-*.test.ts` | 对应 `stageN.spec.ts`；真实通关只在入口合同受影响时运行 |
| 部署 | `deployment*.test.ts` | `deployment-lab.spec.ts` 或对应关卡部署用例 |
| 肖像目录与职业通用头像回退 | `portrait.test.ts`、`arena.test.ts`、对应 `stageN-battle.test.ts`、`promotion.test.ts` | `portrait-lab.spec.ts`、`arena.spec.ts` 或具体关卡肖像用例 |

竞技场 E2E 只负责正式菜单、目标、表现接入、提交边界和结果。精确原生 draw 数、native tick、
音频序列和每级 AI 规划优先由单元测试及技能实验室验证，避免在竞技场重复完整时间轴。
