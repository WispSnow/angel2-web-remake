# M01：第 1 关实施准备

状态：`specified`；P1–P6 纸面产物完成，等待用户明确授权 M02

更新日期：2026-08-01

纸面与接口授权日期：2026-08-01

代码授权：尚未获得第 1 关运行时代码、部署 UI、生成内容或可玩入口授权

## 目标

把第 1 关“騎士城堡前”的纸面合同转化为可审阅、可分提交、可验证的实施方案，
并把 M00.5–M00.7 已接受的职业、动作、全景表现和 v6 存档作为真实前置，而不是沿用
旧的 v5 或“第 1 关首次引入所有技术”假设。

## 输入

- 第 1 关合同：[`stage-01.md`](../../design/remake-gdd/vertical-slices/stage-01.md)；
- 部署系统：[`deployment-stage1.md`](../../design/remake-gdd/systems/deployment-stage1.md)；
- 技术扩展：[`techniques-stage1.md`](../../design/remake-gdd/systems/techniques-stage1.md)；
- 共用动作：[`action-resolution.md`](../../design/remake-gdd/systems/action-resolution.md)；
- 既有技术/状态：[`techniques-stage0.md`](../../design/remake-gdd/systems/techniques-stage0.md)、
  [`status-foundation.md`](../../design/remake-gdd/systems/status-foundation.md)；
- 设计门槛：[`09-design-acceptance.md`](../../design/remake-gdd/09-design-acceptance.md)；
- 原版事实与机器证据：[`original-gdd.md`](../../reverse/gdd/original-gdd.md)、
  [`evidence-register.md`](../../reverse/gdd/evidence-register.md)；
- 第 0 关接受基线：[`M00-stage-00-acceptance.md`](M00-stage-00-acceptance.md)、
  [`M00.5-promotion-and-architecture.md`](M00.5-promotion-and-architecture.md)、
  [`M00.6-stage0-class-actions.md`](M00.6-stage0-class-actions.md)、
  [`M00.7-full-combat-profession-animations.md`](M00.7-full-combat-profession-animations.md)。

## 已确认决策

1. M01 只产出纸面合同和候选接口；M02 仍冻结。
2. 第 1 关是第二个运行时 `StageDefinition`，不能复制 `Stage0` 类型或控制器分支。
3. 部署合法性属于模拟层；DOM/Phaser 只投影并发送语义动作。
4. `1F/1H` 复用 M00.6；M02 新增动作只包含 `1L/1C` 和敌方修女调度。
5. 当前 v6 严格校验器不能原地扩成 stage 1；M02 必须建立 v7 和显式迁移。
6. stage 2 只作为路由终止边界，不进入运行时关卡注册表。
7. 第 0 关全部既有行为、截图、v2–v6 迁移和普通入口通关路径必须零回归。

## P1：多关内容、战役与事件边界

### 候选内容接口

M02 应在现有 `StageDefinition` 上增加由生成内容消费的边界，不把 DOS 偏移写入业务 API：

```ts
interface StageDefinition {
  id: RuntimeStageId;
  nativeStage: number;
  name: string;
  width: number;
  height: number;
  viewport: StageViewportDefinition;
  contentIdentity: string;
  objective: StageObjectiveDefinition;
  deployment: FixedDeploymentDefinition | InteractiveDeploymentDefinition;
  stories: StageStoryDefinition;
  music: StageMusicDefinition;
  events: readonly StageEventDefinition[];
}

interface StageEventDefinition {
  id: StageEventId;
  trigger: StageEventTrigger;
  simulationEffect: StageSimulationEffectId;
  presentation: StagePresentationId;
}
```

- `RuntimeStageId` 在 M02 只包含 `stage-00/stage-01`；`stage-02` 是 campaign route ID，
  不能因为存档可指向它就进入可运行注册表。
- stage 0 先迁移到扩展接口并通过零 diff 测试，再注册 stage 1。
- 地图、阵容、目标、剧情、音乐和事件引用来自生成模块；`StageDefinition` 只组合稳定 ID。
- 控制器只消费通用 trigger/effect/presentation，不出现 `if (stageId === "stage-01")`
  的剧情正文、槽号或坐标分支。

### 所有权

| 真值 | 所有者 | 表现消费者 |
| --- | --- | --- |
| campaign roster、当前 route、难度、规则身份、PRNG | campaign/simulation | 标题、存档摘要 |
| 部署 placements、合法性和错误 | deployment simulation | DOM 名单、Phaser 地图 |
| battle units、回合、状态、胜负 | battle simulation | Phaser、HUD |
| 事件是否消费、`999/1000` 和下一 route | stage event simulation | 剧情、移动、胜利反馈 |
| 等待、图像、声音、镜头 | presentation events | Phaser/DOM/audio |

### 第 1 关事件 ID

- `stage-01-prebattle-story`：`SAY/0004` 完成或跳过后进入部署；
- `stage-01-opening-story`：战斗回合 1 建立后播放 `SAY/0005`，恢复控制前消费；
- `stage-01-boss-defeated`：side 2 槽 16 移除后写现场胜利 `999`；
- `stage-01-messenger-arrival`：生成 side 1 槽 48、移动到妮雅运行时位置、播放
  `SAY/0006`；
- `stage-01-completed-route`：普通保存流程完成或取消后写完成语义 `1000`，指向
  `stage-02` 边界。

## P2：部署系统

完整合同见 [`deployment-stage1.md`](../../design/remake-gdd/systems/deployment-stage1.md)。

实施时建立独立 `simulation/deployment/` 边界，至少包含：

- `createDeploymentState(definition, preparedRoster)`；
- `reduceDeployment(state, semanticAction)`；
- `finishDeployment(state)`；
- `validateDeploymentResult(definition, result)`。

部署 reducer 必须是纯函数，不读取 DOM、Phaser、localStorage、音频、墙钟或战斗 PRNG。
stage 1 的槽和坐标只存在于生成 `DeploymentDefinition`，不散落到 UI/controller。

## P3：最小技术扩展

完整合同见 [`techniques-stage1.md`](../../design/remake-gdd/systems/techniques-stage1.md)。

- `fire-1/heal-1` 沿用现有 action ID、range map、准备/提交和表现入口；
- 新增 `lightning-1/ice-1` 数据与纯模拟 resolver；
- 敌方修女 adapter 只负责从原生池选择 action/target，随后调用同一 resolver；
- 表现层消费 `actionId + center + affected unit IDs + timelineId`，不重算数值；
- 禁止为四个动作建立未经消费的全 36 技术框架。

## P4：运行时内容生成

M02 必须从以下机器来源生成 stage 1 内容，浏览器运行时不得读取 `reverse/`：

| 内容 | 机器来源 | 候选生成产物 |
| --- | --- | --- |
| 地图/地形 token | `battle-templates.json`、`terrain-token-map.json` | `stage1-runtime.generated.ts` |
| 固定/可选/敌军与 AI | `battle-templates.json` | 同上 |
| 目标/失败 | `battle-objectives.json` | 同上 |
| 部署定义 | `battle-lifecycle.json`、`input-ui.json` | 同上或 `stage1-deployment.generated.ts` |
| 剧情/事件/路由 | `dialogue/0004..0006`、`stage-events.json` | `stage1-events.generated.ts` |
| 音乐/表现 | `music-catalog.json`、`stage-presentations.json` | `stage1-presentations.generated.ts` |
| `1L/1C` 规则与资源 | `technique-rules.json`、`technique-presentations.json` | `stage1-actions.generated.ts` |

生成器必须保存源记录、哈希、稳定语义 ID、资源存在性和内容身份。手写关卡合同可以
引用数值，但运行时不得再手抄第二份地图、阵容或表现表。

## P5：存档 v7 策略

### 为什么必须升级

v6 的 battle discriminant 只允许 `stage-00`，completed 记录只表示“第 0 关完成并指向
stage 1”。stage 1 战中恢复、事件消费和 stage 2 边界都会扩展严格 schema；原地修改
v6 会改变既有存档含义，因此 M02 必须新建 v7。

### v7 候选联合类型

```ts
type SaveDataV7 = BattleCheckpointV7 | CampaignRouteCheckpointV7;

interface BattleCheckpointV7 extends SaveDataBaseV7 {
  kind: "battle";
  stageId: "stage-00" | "stage-01";
  battle: SavedBattleStateV7;
  consumedEventIds: readonly StageEventId[];
}

interface CampaignRouteCheckpointV7 extends SaveDataBaseV7 {
  kind: "campaign-route";
  stageId: "stage-01" | "stage-02";
}
```

- `SavedBattleStateV7.units` 是已提交部署结果的唯一真值，不另存会漂移的 selected list。
- stage 1 battle save 校验五个固定 slot、5–8 名 side 1、合法可选 slot、无重叠、
  `stage-01-opening-story` 已消费以及完整状态/PRNG。
- `999` 是胜利现场的瞬态，进入后阻断记录入口；只有 `1000` 形成指向 stage 2 的
  `campaign-route` 存档，因此读取不会重放传令兵或 `SAY/0006`。

### 迁移与拒绝矩阵

| 输入 | v7 结果 |
| --- | --- |
| v6 stage 0 battle | 保持战局；由 round/phase 确定性补齐已消费的 stage 0 事件 ID |
| v6 completed → stage 1 | 转为 `campaign-route/stage-01`，roster/难度/PRNG 不变 |
| v5 | 先走既有 v5→v6，再走 v6→v7 |
| v2/v3/v4 | 先走既有迁移链，再走 v6→v7；不得重复播种经验或最高难度加成 |
| v7 stage 1 battle | 严格验证 roster、单位、事件、位置、状态、内容身份和 PRNG |
| v7 route → stage 2 | 显示未实现边界；不得启动或伪造 stage 2 |
| 未来版本、坏 ID、重复单位、非法事件/位置、内容不匹配 | 安全拒绝并给玩家可见反馈 |

## P6：验收映射与提交边界

### 场景到测试层

| 合同 | 单元/内容 | Playwright | 人工视觉 |
| --- | --- | --- | --- |
| `S01-A/B` 部署 | reducer、生成定义、错误与完成 | 三输入、5/8 与 8/8、三条原文 | 名单密度、地图空位、焦点 |
| `S01-C` 开战 | stage factory、目标和事件顺序 | `SAY/0005` 前后输入门 | 地图、HUD、目标文本 |
| `S01-D` 玩家技术 | `1L/1C` 数值、位移、PRNG | 菜单、范围、取消、时间线 | 落雷/冰雪代表帧 |
| `S01-E` 敌方修女 | 池、target、fallback、保存重复 | 敌方施法与恢复 | 音画时点、范围可读性 |
| `S01-F` 首领胜利 | slot 16、999、传令兵路径 | 其余敌军存活时胜利 | 移动、双窗口、胜利反馈 |
| `S01-G` 存档/失败 | v7 迁移/拒绝矩阵 | 战中恢复、失败部署、stage 2 边界 | 可见坏档反馈 |
| `S01-H` 表现独立 | 双模式结果/PRNG 对照 | 正常/加速/静音/窄屏 | 桌面、窄屏、减少动态 |

### M02 候选提交顺序

1. 扩展 StageDefinition/事件接口并迁移 stage 0，保持运行结果与截图不变；
2. 加入部署纯模拟与单元测试，不接 UI；
3. 接入部署 DOM/Phaser 投影和浏览器验收；
4. 生成 stage 1 地图、阵容、目标、剧情和资源，但仍不开放普通入口；
5. 复用 `1F/1H`，实现 `1L/1C` 与敌方修女调度；
6. 建立 v7、完整迁移/拒绝矩阵和 stage 1 战中恢复；
7. 开放第 0 关 → 第 1 关路由，完成普通入口真实通关到 stage 2 边界；
8. 运行 `pnpm check`、证据校验并人工审计部署/技术/胜利截图。

每个提交都必须可独立验证和回退，不能用一个巨型 controller 条件分支同时落地全部系统。

## 明确排除

- 本 M01 不修改 `src/`、`tests/` 或运行时生成内容；
- 不实现 stage 1 地图、部署 UI、剧情、敌军、目标、事件或可玩入口；
- 不实现 stage 2 战斗；
- 不新增射击职业、状态生产/倒计时、转职选择或 `1F/1H/1L/1C` 之外的技术；
- 不为全战役一次性建立未经代表性切片验证的抽象；
- 不原地改变 v6 含义或删除 v2–v6 迁移能力。

## M01 退出检查

- [x] 第 0 关、M00.5、M00.6、M00.7 与右栏热点已获用户接受；
- [x] 第 1 关合同无实施必需 `[TBD]`；
- [x] P1–P6 均有可审阅产物；
- [x] 部署和 `1L/1C` 系统合同闭合规则顺序、UI、AI/无 AI、保存与验收；
- [x] 保存版本决定为 v7，并保留 v2–v6 迁移语义；
- [x] 每项 M02 代码工作都有证据、合同、测试层和明确排除项；
- [x] 当前仓库仍没有 stage 1 运行时内容或入口；
- [ ] 用户明确批准 M02 实施范围。

在最后一项完成前，M01 保持 `specified`，M02 保持 `frozen`。
