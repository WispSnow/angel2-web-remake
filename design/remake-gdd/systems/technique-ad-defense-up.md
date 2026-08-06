# `AD / 防禦提昇` 系统规格

状态：`implemented`；2026-08-05 完成原版规则、双方 AI、地图表现、`REMAKE-013`
冰封例外及完整自动／截图门禁；无实施必需 `[TBD]`

负责人：Web 复刻实现

依赖：[`technique-implementation-sequence.md`](technique-implementation-sequence.md)、
[`shooting-and-technique-system.md`](../../../reverse/notes/shooting-and-technique-system.md)、
[`status-lifecycle.md`](../../../reverse/notes/status-lifecycle.md)、
[`remaining-technique-presentations.md`](../../../reverse/notes/remaining-technique-presentations.md)、
[`ai-decision-system.md`](../../../reverse/notes/ai-decision-system.md)、
[`technique-rules.json`](../../../reverse/parsed/native/technique-rules.json)、
[`combat-formulas.json`](../../../reverse/parsed/native/combat-formulas.json)、
[`ai-rules.json`](../../../reverse/parsed/native/ai-rules.json)、
[`remaining-technique-presentations.json`](../../../reverse/parsed/native/remaining-technique-presentations.json)、
[`web-remake-rule-decisions.md#remake-007原版随机值域与调用顺序固定由可序列化-prng-供值`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-007原版随机值域与调用顺序固定由可序列化-prng-供值)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)、
[`web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心)

## 玩家目的

任一层祈導師在四步内指定一名友军（包括自己或冰封友军），以原版四格盾牌动画保护目标，
随后把该单位的防御提升状态重置为 3。状态有效时防御增加 20；到每个完整玩家＋我方自动＋
敌方回合结束后的下一轮边界依次变为 `3→2→1→0`。完整 165 native tick 后才原子提交状态、
`10+random(0..3)` 经验和行动位。

## 证据与决策

- `[OF]` 原版菜单字节为 `AD / 防禦提昇 `；可见名称使用“防禦提昇”。它属于祈導師三层
  菜单和 AI 池：第一层 `1H/1I/AD`、第二层 `1H/2I/AD`、第三层玩家菜单
  `2H/3I/AD/OJ`，AI 池的第四项为机器表中的 `SM`；后两项均不随 AD 提前实现。
- `[OF]` 玩家分发处理器为 `0000:CE1E`，选择距离 4，目标组为友方；原版验证器允许自己。
  成功提交将目标完整状态字中的防御提升计数写为 3，不清除防御下降或其他状态；再次施放
  直接刷新为 3，不叠加幅度。
- `[OF]` 防御提升有效时，普通攻击伤害公式和地形防御贡献所用的当前防御值增加 20。它可与
  防御下降同时存在，两者在有效防御值上互相抵消，而不是互相清除；有效值下限为 0。
- `[OF]` 状态不是按目标所属阵营阶段递减，而是在完整三方回合后的下一玩家轮边界统一
  `8003→8002→8001→0000`；本轮末施放的状态也可能很快第一次递减。
- `[OF]` 每次成功施放，包括自己、刷新已有状态或以冰封友军为目标，恰好调用一次模拟
  PRNG 并获得 `10+random(0..3)` 经验。动作不改变生命、死亡、防魔、冰封或其余状态。
- `[SR]` `REMAKE-013` 只禁止对冰封单位攻击或治疗；防御提升是正面状态技术，因此冰封友军
  仍是合法目标，正常获得状态和经验，同时继续冰封。冰壳必须覆盖在本动作盾牌动画之上。
  此处不是另增冰雪规则；`legacyStrict` 与原版同样允许该目标。
- `[OF]` 表现入口 `1000:74FE` 使用 `MAGIC/33` 的 `2×2` 描述符，以目标左上一格为起点，
  顺序播放帧组 `0..3, 4..7, 8..11, 12..15, 16..19, 20..23`，再按
  `16..19, 12..15, 8..11, 4..7, 0..3` 反向收束；共 11 draw，每 draw 等待 15 tick，
  总计 165 tick。0 tick 以战斗音效类别请求 `UN/52`。
- `[OF]` 原版只在完整 165 tick 后写状态、经验和行动位；不能在盾牌展开中途提前生效。
- `[OF]` 祈導師 AI 使用友方选择器：最大化缺失生命值，精确同分由行优先线性扫描中较后的
  格胜出；满生命友军仍合法，已有防御提升不会降低评分。提示组 16 原文为“防禦提昇.”；
  依 `REMAKE-014` 先对焦准备目标再显示原文。

## 触发与输入

- 祈導師三层都显示“防禦提昇”；行动者必须未行动、未冰封且未被禁咒。
- 目标必须是距离 4 内存活友军；自己、满生命、已有防御提升和冰封友军均合法。
- 取消目标回技术菜单，再取消回动作菜单；不提交状态、经验、行动位或 PRNG。
- 确认时冻结 `{目标, 状态前后值, 经验随机值, PRNG 前后状态}`；表现、声音、镜头、墙钟
  和资源载入顺序不能重算准备结果。

## 有序规则

1. 验证祈導師、行动位、禁咒、友方目标与选择距离 4；冰封只限制行动者，不限制目标；
2. 从当前状态完整复制目标状态，仅把 `defenseUp` 重置为 3；生命、冰封和其他状态不变；
3. 恰好调用一次模拟 PRNG，准备 `10+random(0..3)` 经验；
4. 0 tick 请求 `UN/52`，在目标左上、上、左、本格依序播放 11 组 `MAGIC/33` 四帧盾牌；
5. 165 tick 后原子提交目标状态、施法者经验和行动位；之后普通攻击及 AI 估算使用有效防御值；
6. 每次 `startNextRound` 将所有存活单位的防御提升计数饱和减一，直至 0。

## AI 使用

祈導師三层 AI 池均按原版顺序加入 `AD`。AI 从当前位置四步内扫描全部友军，不排除自己、
满生命、已有防御提升或冰封单位；选择缺失生命最多者，精确同分选择行优先扫描中较后的格。
成功时先对焦目标，显示组 16“防禦提昇.”，播放相同 165 tick 时间线并原子提交。随机选择
池项和本动作经验分别属于各自既有模拟 PRNG 调用；画面和提示不消费模拟随机数。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 冰封友军可接受防御提升且冰壳覆盖表现；其余保持原版 |
| `legacyStrict` | 同样允许冰封友军接受该正面状态；其余保持原版 |
| 可开放 Mod 字段 | 职业层级、选择距离、防御增量、状态计数、经验基值／随机值域、资源／帧组／声音／等待；修改后必须改变规则身份 |

## 表现与可访问性

正式地图与 technique-lab 共用原版 `MAGIC/33` 二十四帧和 11 组 `2×2` 描述符；每组四帧
必须落在目标左上、上、左、本格，不能缩成单格盾牌或把二十四帧当连续单图播放。原始像素
禁用平滑。冰封目标的持续冰壳必须在全部盾牌帧之上。加速、减少动态、静音和 AI 对话开关
只能改变墙钟、声音或提示，不能改变 11 draw、165 tick、准备结果、PRNG 次数或提交时点。

## 验收场景

1. 三层祈導師菜单和双方 AI 池均按原版顺序包含 AD；其他职业不可用，选择距离为 4；
2. 自己、满生命、已有防御提升和冰封友军均可选；敌军、距离 5 和已死亡单位不可选；
3. 成功后只把 `defenseUp` 重置为 3，其余状态、生命和冰封不变；每次恰好得到 `10..13`
   经验并消费一次模拟 PRNG，取消不消费；
4. 有效状态使普通攻击承伤及地形防御所用的防御值增加 20；与防御下降并存时增减相消；
5. 完整轮边界严格 `3→2→1→0`，存读档后保持同一状态和后续递减；
6. AI 最大缺失生命优先、同分后格优先，满生命和已有状态仍可选；使用组 16 原文；
7. 正式玩家与 AI 在 0 tick 请求 `UN/52`，依序显示 11 组 `MAGIC/33` 四格图形；165 tick 前
   状态、经验和行动位不提交；
8. 冰封友军成功获得状态且仍不可行动，代表截图确认冰壳始终高于四格盾牌；
9. technique-lab 与正式竞技场的帧组、音效、时间线、目标侧和结果读数一致。

## 验证记录

- 2026-08-05：`pnpm test:coverage` 通过（37 个文件、444 项测试）；`pnpm build` 通过；
  `pnpm test:e2e` 通过（188 项 Chromium）。
- 玩家／敌方 AI 定向用例覆盖三层菜单池、满生命目标、组 16 原文、11 组四格盾牌、
  `UN/52`、165 tick 原子提交、HUD 有效／基础防御读数和一次经验 PRNG；实验室用例覆盖
  正放／倒放、末帧保持及冰壳层级。
- 人工查看 `arena-defense-up-mid.png`、`arena-defense-up-ai.png`、
  `arena-defense-up-frozen-exception.png`、`technique-lab-defense-up.png` 与
  `technique-lab-defense-up-frozen.png`：盾牌按原版白、黄／粉、绿、红层构筑并反向收束，
  四格拼接与原版 contact sheet 一致，冰封目标的蓝色冰壳始终高于盾牌。
- `node reverse/tools/angel2-phase1-verify.mjs` 通过；实施必需未知项保持 0。
