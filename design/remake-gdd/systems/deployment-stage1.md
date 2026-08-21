# M01 第 1 关部署系统规格

状态：`implemented`；自动验收完成，等待 M02 人工接受

纸面授权日期：2026-08-01；M02 代码授权日期：2026-08-01；原版画面复现修订：2026-08-21

实现状态：纯模拟位于 `src/game/simulation/deployment/`，语义输入会话位于
`src/game/deployment-session.ts`；固定/可选/空位、提交、反馈门、焦点与 PRNG 独立性
已通过单元验收。出击准备表面（`src/game/deployment-ui.ts` +
`src/game/deployment-minimap.ts`）共用该会话，并已同时接入正式战役与
`/deployment-lab.html`，通过键盘、鼠标、手柄、失败重试、桌面、窄屏与减少动态验收。

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
- `[OF]` 模块 27 的部署专用全图不同于模块 29 的战术小地图：它固定从 `(440,125)`
  扫完整 `50×50`、每格 `4×4`、总计 `200×200`。side 1／side 2／未填 `FFh` 均为
  黑色 `4×4` 外格加 `2×2` 内芯，颜色依次为调色板 9／11／15；当前 `FFh` 把外格／
  内芯反相为 15／0。见 [`input-and-battle-ui.md`](../../../reverse/notes/input-and-battle-ui.md)
  与 [`input-ui.json`](../../../reverse/parsed/native/input-ui.json) v6。
- `[OF]` 名单／页签／结束框不是整张图片纹理。模块 27 用调色板矩形拼装，职业图形来自
  `A/0002`，手形指针来自 `A/0001`，姓名、职业和按钮标签来自原版点阵字库；精确层级和
  坐标见上述取证文件。
- `[DD]` `REMAKE-011`（2026-08-21 修订，取代 2026-08-02 的现代默认构图）：默认出击
  准备画面恢复原版 `640×350` 黑底、三列五行复合项、原生页签／结束和 `200×200` 全图。
  现代当前人数、引导、危险格文字与完整人物属性不常驻画面；人数／引导／落点仍以等价
  无障碍文本保留，职业、等级、生命、攻防移、经验和行动只在鼠标悬浮原生职业按钮或
  键盘／手柄导航到该项后显示为增强信息卡。不自动选人、不推荐阵容，也不要求填满。
- `[DD]` `REMAKE-011` 的 2026-08-21 对齐修订：名单外框、色组和原生字体不变；Web 将
  `40×43` 棋子置于左侧 `48×48` 框正中，把可见职业框改到右侧文字区的相对
  `(56,24) 74×24`，使它与左框相接而不相叠；姓名与职业分别在右侧两条 `74×24`
  区域按原版点阵实际像素宽度居中，并裁在各自区域内。原版 `(3,2)` 棋子、
  `(49,24) 80×24` 职业框和两处文字起点仍保留为 `[OF]` 证据，不倒写取证层。
- `[DD]` 键盘拓扑仍是 `[OF]` 的五个循环列，因此名单网格必须按列优先排布
  （索引 `column * 5 + row`），页签与 `結束` 保持在名单右侧和右下角，
  方向键移动方向与玩家看到的顺序一致。
- `[DD]` 复刻按原版形状、颜色和黑白反相恢复完整部署全图。原版每四个约 10 ms tick
  反相一次，会形成约 12.5 Hz 高频闪烁；Web 为避免高频闪烁风险保留此前人工确认的
  1 秒周期，只放慢时间、不改变两相像素。`prefers-reduced-motion` 下仍保留这一低频
  硬切，因为它是当前 `FFh` 的必要反馈；动画不进入模拟状态。
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
- DOM 按原生坐标绘制调色板矩形名单、页签、结束、错误框、透明热区与悬浮信息卡；
  原版点阵文字单独画到只读 canvas。现代人数、引导和当前落点播报仅作无障碍投影。
- 小地图是只读投影：`DeploymentMinimap` 把已生成的 `3×3` 地形 PNG 以最近邻重采样为
  模块 27 的 `4×4` 全图，再叠 placements、关卡敌军起始位置与剩余 `FFh`。它不持有
  合法性；落点透明热区和地图焦点主／次循环仍只发送语义动作。敌军位置来自关卡内容，
  不进入 `DeploymentState`。
- 底层 Phaser 画布在部署期间保持纯黑，只镜像可测试的语义状态；不加载战场地图
  图像、不重复绘制职业棋子，也不拥有增删合法性。

## 触发与输入

- 进入条件：第 0 关完成路由已恢复 campaign roster、难度、规则身份与 PRNG，且
  `SAY/0004` 正常结束或被跳过。
- 初态：五名固定单位已放置；三个 open cells 尚未占用；当前人数 `5/8`。
- 名单主操作：加入当前 open cell，或撤下已出场的非固定单位。
- 页签主操作：切换 `Ⅰ/Ⅱ/Ⅲ`；切页不改变 placements。
- 地图主/次操作：分别循环前一个/后一个剩余 open cell；次操作在此状态不是取消。
- 鼠标直接点击完整部署图内的剩余 open cell 热区：只改变 `currentOpenCell`，不自动加入单位。
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
| 失败／撤退重试 | 丢弃战中 placements 与本次成长，从不可变入关快照重新建立部署初态 | 回到本关部署，不在战场复活，也不保留本次经验／转职 |

## 保存与恢复

- 部署界面不提供战中记录入口，不保存半完成的 `DeploymentState`。
- `finish` 后，stage 1 battle save 以 side 1 `battle.units` 作为已提交部署结果的唯一真值；
  读取后从单位 slot/坐标恢复相同阵容，不再重放部署。
- 校验器必须确认五个 fixed slots 均存在、side 1 总数为 `5..8`、optional slots 不重复、
  坐标合法且无重叠。无需在存档中维护第二份会漂移的 selected-slots 列表。
- 失败或确认撤退后的 roster 来自不可变入关快照，而不是当前战况或已读战中档；重新部署
  只允许改变本次 placements，不能把本次经验／转职写回快照。

## AI 使用

部署没有 AI 自动选择。玩家选择我方自动控制只发生在正式战斗中，不能反向改写
部署结果；敌方阵容由关卡内容生成，不经过玩家部署状态机。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 原版固定/可选/空位/上限规则与默认构图；丰富状态改为悬浮／键盘聚焦卡，多输入映射保留 |
| `legacyStrict` | 保留原版三列名单、页签和地图主/次循环语义 |
| 可开放 Mod 字段 | eligible/fixed/optional slots、open cells、上限；修改后必须验证无重复、固定槽有落点、上限可达 |

## 表现与可访问性

`REMAKE-011` 的当前构图采用模块 27 原生外框坐标，并应用上述名单内容对齐修订；旧现代线框
[`stage-01-deployment.svg`](../ui/wireframes/stage-01-deployment.svg) 只保留为被取代的设计历史：

| 区域 | 原版证据 | Web 当前表现 |
| --- | --- | --- |
| 名单复合项 | 原点 `x=8/152/296`、`y=35/95/155/215/275`，`130×50`；棋子相对 `(3,2)`，文字相对 `(72,3)/(56,27)` | 外框原点不变；棋子改为相对 `(12,4)`，姓名／职业在相对 `x=56..129` 的两条 `74×24` 区域居中 |
| 名单职业框／热区 | `x=57/201/345`、`y=59/119/179/239/299`，`80×24` | 改为 `x=64/208/352`、同一组 Y，`74×24`；与左侧人物框相接但不重叠，点击加入／撤下，悬浮显示丰富人物卡 |
| 页签 | `(440,35/65/95)`，`80×24` | 原生 `Ⅰ/Ⅱ/Ⅲ` 控件，当前页为颜色 `0/15/8` |
| 结束 | `(540,35)`，`80×24` | 原生 `結束` 控件 |
| 部署全图 | `(440,125)`，`200×200` | 完整 `50×50` 地形，每格 `4×4`，叠原版蓝／红／白占用芯与当前格黑白反相 |
| 错误条 | `(2,328)`，`636×20` | 原版 `0/15/7` 嵌套框，点阵原文从 `(160,330)` 起画 |

稳态画面不显示关卡标题、胜利条件、人数条、图例、坐标芯片或常驻详情。人物卡使用现代
易读字体和肖像，但默认 `visibility:hidden`；只有真实指针移动到当前 `74×24` 职业按钮，
或键盘／手柄开始导航并聚焦该项时才显示。一次点击引起 DOM 重绘后，静止在原位置的指针
不会让卡片自动重现，必须再次移动。卡片按当前名单项分别在下方或上方就近放置，并夹在
`640×350` 内。姓名、职业、状态、完整属性也写入按钮无障碍名称；人数、引导、危险格和
当前落点保留隐藏文本／`aria-live`。键盘、鼠标、手柄继续映射同一 `focus`；缩放、声音和
悬浮表现不改变 placements 或 PRNG。

## 验收场景

1. Given 初态五名固定单位，When 直接完成，Then 以五人开战，三个未用 `FFh` 均清空；
2. Given 依次加入希蜜、蒙欣曼、拉朵那，When 再加入葛蒂拉斯，Then 显示满员原文且状态不变；
3. Given 希蜜已放在第二个空位，When 撤下，Then 该位置恢复并可被葛蒂拉斯使用；
4. Given 焦点在固定妮雅，When 主操作，Then 显示固定原文，新的主操作只关闭反馈；
5. Given 相同 roster，When 使用鼠标、键盘或手柄完成同一 placements，Then 战斗单位、
   camera 初态和 PRNG 完全相同；
6. Given 已提交的 stage 1 战中档，When 读取，Then 恢复相同 slot/坐标，不重进部署或
   `SAY/0004/0005`；
7. Given 初态，When 检查名单几何，Then 15 个复合项原点、三页签、结束键与 `200×200`
   全图等于模块 27 坐标；每项棋子中心与 `48×48` 左框中心一致，右侧 `74×24` 职业框不与
   左框相叠，姓名／职业的墨迹均留在右侧区域并以同一中心线对齐；
8. Given 初态，When 读取全图指定占用格，Then side 1／side 2／`FFh` 分别为黑色 `4×4`
   外格加颜色 9／11／15 的 `2×2` 内芯；加入一人后该 `FFh` 内芯变为颜色 9；
9. Given 当前落点为 `21,33`，When 检查闪烁叠加层，Then 它覆盖 `(84,132)` 的完整
   `4×4` 格、周期 1 秒且在黑外白芯／白外黑芯之间硬切；改选与提交只移动／移除表现，
   `prefers-reduced-motion` 不关闭这一低频必要反馈；
10. Given 稳态指针未移动，When 页面首次显示或点击导致重绘，Then 人物详情全部隐藏；
    When 指针再次悬浮职业条或键盘／手柄导航到人物，Then 就近信息卡显示职业、等级、
    生命、攻防移、经验和职业行动，且卡片不越过 `640×350` 画布或遮住错误条。
