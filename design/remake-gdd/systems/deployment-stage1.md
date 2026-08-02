# M01 第 1 关部署系统规格

状态：`implemented`；自动验收完成，等待 M02 人工接受

纸面授权日期：2026-08-01；M02 代码授权日期：2026-08-01

实现状态：纯模拟位于 `src/game/simulation/deployment/`，语义输入会话位于
`src/game/deployment-session.ts`；固定/可选/空位、提交、反馈门、焦点与 PRNG 独立性
已通过单元验收。原版几何的 DOM 名单与右栏落点控制共用该会话，并已同时接入正式战役
与 `/deployment-lab.html`，通过键盘、鼠标、手柄、失败重试、桌面、窄屏与减少动态验收。

依赖：第 1 关关卡合同、战役 roster、职业目录、地图模板、语义输入

## 玩家目的

玩家在“騎士城堡前”开战前确认五名固定单位，并从四名可选单位中选择零至三人，
决定最多八人的出场阵容和三个可选落点。部署必须清楚展示固定、可选、已出场、人数
与上限，同时保留原版允许只带五名固定单位开战的决定。

## 证据与决策

- `[OF]` 部署生命周期、`FFh` 空位、固定/选中标志和三条错误见
  [`battle-lifecycle.md`](../../../reverse/notes/battle-lifecycle.md) 与
  [`battle-lifecycle.json`](../../../reverse/parsed/native/battle-lifecycle.json)。
- `[OF]` 三列五行名单、三页页签、完成按钮、键盘拓扑和地图主/次操作见
  [`input-and-battle-ui.md`](../../../reverse/notes/input-and-battle-ui.md) 与
  [`input-ui.json`](../../../reverse/parsed/native/input-ui.json)。
- `[OF]` stage 1 的固定槽为 `42,40,43,41,0`，可选槽为 `1,2,4,24`，空位为
  `(21,33)/(23,33)/(25,33)`，上限为 8。
- `[OF]` 模板非零职业覆盖在部署前准备 roster；因此槽 24 进入本系统时已经是
  “魔術士／葛蒂拉斯”。部署本身不修改职业、经验、生命或状态。
- `[DD]` UI 增加当前人数、剩余空位、固定/可选/已出场文字和等价无障碍标签；
  不自动选人、不推荐阵容，也不要求填满。
- `[DD]` 2026-08-02 试玩反馈要求左侧复现原版名单构图且不显示地图背景：名单使用
  原版职业棋子、复合项坐标与 `80×24` 热区；左侧保持纯黑。右侧人物详情作为 Remake
  优化保留，并承接三个可点击落点，避免去掉地图后产生不可见指针热区。
- `[DD]` 部署只产生确定性编队结果，不消费战斗 PRNG。

## 数据与所有权

纯模拟边界使用以下候选语义，不把 DOM 或 Phaser 对象放入状态：

```ts
interface DeploymentDefinition {
  stageId: "stage-01";
  eligibleSlots: readonly number[];
  fixedPlacements: readonly { slot: number; position: Position }[];
  optionalSlots: readonly number[];
  openCells: readonly Position[];
  maximumUnits: number;
}

interface DeploymentState {
  placements: readonly { slot: number; position: Position; fixed: boolean }[];
  currentOpenCell?: Position;
  rosterPage: 0 | 1 | 2;
  focus: { kind: "roster"; index: number }
    | { kind: "page"; page: 0 | 1 | 2 }
    | { kind: "finish" }
    | { kind: "map" };
  feedback?: "empty-slot" | "full" | "fixed-unit";
}

type DeploymentAction =
  | { type: "move-focus"; direction: "up" | "down" | "left" | "right" }
  | { type: "focus-roster"; index: number }
  | { type: "focus-finish" }
  | { type: "focus-map" }
  | { type: "toggle-roster-slot"; slot?: number }
  | { type: "select-page"; page: 0 | 1 | 2 }
  | { type: "cycle-open-cell"; direction: "previous" | "next" }
  | { type: "select-open-cell"; position: Position }
  | { type: "finish" }
  | { type: "dismiss-feedback" };
```

- 模拟层持有 `DeploymentDefinition/State`、合法性、错误和最终 placements。
- 战役准备器在进入部署前应用 stage 1 的证据驱动职业覆盖；提交后把准备后的 roster
  与部署结果一起交给战斗工厂。
- DOM 绘制名单、页签、人数、落点、错误和焦点，并发送语义动作。
- 底层 Phaser 画布在部署期间保持纯黑，只镜像可测试的语义状态；不加载地图图像、
  不重复绘制职业棋子，也不拥有增删合法性。

## 触发与输入

- 进入条件：第 0 关完成路由已恢复 campaign roster、难度、规则身份与 PRNG，且
  `SAY/0004` 正常结束或被跳过。
- 初态：五名固定单位已放置；三个 open cells 尚未占用；当前人数 `5/8`。
- 名单主操作：加入当前 open cell，或撤下已出场的非固定单位。
- 页签主操作：切换 `Ⅰ/Ⅱ/Ⅲ`；切页不改变 placements。
- 地图主/次操作：分别循环前一个/后一个剩余 open cell；次操作在此状态不是取消。
- 鼠标直接点击右栏剩余 open cell：只改变 `currentOpenCell`，不自动加入单位。
- 完成：五至八人均合法；不要求填满空位。
- 阻断：错误底条存在时，只有新的主操作关闭；方向、次操作、完成和名单动作无效。

## 有序规则

1. 从 stage 1 生成定义和准备后的 campaign roster 建立固定 placements。
2. 按原始 open cell 顺序建立循环列表；`currentOpenCell` 指向第一项。
3. `toggle-roster-slot` 若没有人物，状态不变并进入 `empty-slot` 反馈。
4. 若目标已出场且 fixed，状态不变并进入 `fixed-unit` 反馈。
5. 若目标已出场且非 fixed，移除 placement，把原位置按原始 open cell 顺序恢复，
   然后重建 current open cell。
6. 若目标未出场但没有 open cell，状态不变并进入 `full` 反馈。
7. 若目标未出场且有 open cell，在 current open cell 放置该 slot，再循环到下一空位。
8. `finish` 规范化 placements；未使用的 `FFh` 在战斗阵营/占用图中变成普通空格。
9. 战斗工厂从同一结果建立 side 1 单位；随后才建立敌军、回合 1 与 `SAY/0005`。
10. 以上动作均不消费 PRNG；只有正式战斗中的规则消费者可以推进随机状态。

## 状态变化与边界

| 情况 | 模拟结果 | 玩家反馈 |
| --- | --- | --- |
| 加入可选单位 | slot 放入当前空位，人数 +1 | 名单标记“已出场”，地图显示单位 |
| 撤下可选单位 | placement 移除，原位恢复为空位 | 人数 -1，空位重新可选 |
| 撤下固定单位 | 无变化 | `此人必須出場戰鬥,不可放棄.` |
| 满员后再加入 | 无变化 | `出場人數已滿.` |
| 空名单项 | 无变化 | `此處沒有人.` |
| 五至七人完成 | 正常生成战斗结果 | 未使用空位不进入战场占用图 |
| 剧情跳过 | 与完整播放进入相同初态 | 不自动选人、不跳过部署 |
| 失败重试 | 丢弃战中 placements，重新建立部署初态 | 回到本关部署，不在战场复活 |

## 保存与恢复

- 部署界面不提供战中记录入口，不保存半完成的 `DeploymentState`。
- `finish` 后，stage 1 battle save 以 side 1 `battle.units` 作为已提交部署结果的唯一真值；
  读取后从单位 slot/坐标恢复相同阵容，不再重放部署。
- 校验器必须确认五个 fixed slots 均存在、side 1 总数为 `5..8`、optional slots 不重复、
  坐标合法且无重叠。无需在存档中维护第二份会漂移的 selected-slots 列表。
- 失败后重新部署来自 campaign roster，而不是把已读战中 placements 当作新模板。

## AI 使用

部署没有 AI 自动选择。玩家选择我方自动控制只发生在正式战斗中，不能反向改写
部署结果；敌方阵容由关卡内容生成，不经过玩家部署状态机。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 原版固定/可选/空位/上限规则，增加清晰状态文字和多输入映射 |
| `legacyStrict` | 保留原版三列名单、页签和地图主/次循环语义 |
| 可开放 Mod 字段 | eligible/fixed/optional slots、open cells、上限；修改后必须验证无重复、固定槽有落点、上限可达 |

## 表现与可访问性

左侧 DOM 名单按原版三列五行复合项绘制：职业棋子位于 `80×24` 热区左侧，姓名和
职业/等级分两行，选中、固定与焦点以边框、亮度和右栏状态共同反馈。`Ⅰ/Ⅱ/Ⅲ/結束`
恢复原版坐标与完整热区；左侧为纯黑像素平面，不显示地图图像或第二套战场棋子。
右栏保留人物肖像、职业、等级、生命和状态，并以文字、边框和坐标同时表达当前 open
cell，不能只靠颜色。键盘、鼠标和手柄都映射同一 `focus`；减少动态、浏览器缩放、
音乐/音效开关只改变表现，不改变 placements 或 PRNG。

## 验收场景

1. Given 初态五名固定单位，When 直接完成，Then 以五人开战，三个未用 `FFh` 均清空；
2. Given 依次加入希蜜、蒙欣曼、拉朵那，When 再加入葛蒂拉斯，Then 显示满员原文且状态不变；
3. Given 希蜜已放在第二个空位，When 撤下，Then 该位置恢复并可被葛蒂拉斯使用；
4. Given 焦点在固定妮雅，When 主操作，Then 显示固定原文，新的主操作只关闭反馈；
5. Given 相同 roster，When 使用鼠标、键盘或手柄完成同一 placements，Then 战斗单位、
   camera 初态和 PRNG 完全相同；
6. Given 已提交的 stage 1 战中档，When 读取，Then 恢复相同 slot/坐标，不重进部署或
   `SAY/0004/0005`。
