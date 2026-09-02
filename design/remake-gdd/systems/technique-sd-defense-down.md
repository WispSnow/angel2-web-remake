# `SD / 防禦下降` 系统规格

状态：`implemented`；2026-08-05 已完成正式玩家／AI、竞技场、technique-lab、
`REMAKE-013` 冰封例外、全量自动门禁与代表截图验收；无实施必需 `[TBD]`

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

任一层魔祭師都可在四步内指定一名敌军。原版十段四格破盾图形完整播放后，目标的防御下降
计数重置为 3，使其有效防御减少 20；防御提升与防御下降可同时存在并相消。难度
「無法無天」的敌军还会把这 20 点连同 50% 加成一起放大，实得 30 点。

## 证据与决策

- `[OF]` 魔祭師三层玩家菜单分别为 `1F/1I/SD`、`1F/1L/1I/SD`、
  `2F/1L/1I/SD/TR`；SD 在三层都可用，AI 池保持相同顺序。
- `[OF]` 玩家分发表 `DS:52A2` 的 SD 入口为 `0000:CE99`，选择距离 4；AI 参数行
  `DS:0FEC` 同样为敌方目标、距离 4、选择器 `1000:0A7B`。
- `[OF]` 表现入口 `1000:75EE` 使用 `MAGIC/45`：10 个锚点 `(-1,-1)`、尺寸 `2×2`
  的描述符依序绘制帧 `1..40`，每次等待 15 tick，总计 150 tick；开始时经 `0224h`
  请求 `E/8`。表现返回后才把目标 `+12h` 完整写为 `8003h`。
- `[OF]` 每次成功施放恰好取得 `10+random(0..3)` 经验，包括刷新已有状态、目标已有
  防御提升或属于龍／頭／手；SD 没有首领免疫。
- `[OF]` 防御下降有效时，普通攻击伤害和地形防御贡献所用的有效防御减少 20；与防御提升
  并存时 `+20/-20` 相消，最终防御不低于 0。计数只在完整回合边界 `3→2→1→0`；TR 清除。
- `[OF]` `1000:8C2D` 的 `-20` 排在最高难度加成 `1000:8BD1` 之前，两者都作用于同一个
  有效防御字，因此难度 3 的 side 2 目标实得 `-30`；side 1 与其余三档难度仍是 `-20`。
  装载顺序见
  [`ordinary-combat-formulas.md`](../../../reverse/notes/ordinary-combat-formulas.md#装载顺序状态修正先于难度倍率)。
- `[OF]` SD 是无伤害状态动作，不读取或消费防魔，也不改变生命、死亡、冰封或其他状态。
- `[SR]` `REMAKE-013` 只禁止直接攻击、射击、单体伤害和治疗冰封目标。SD 是无伤害负面
  状态动作，因此冰封敌军仍是合法目标并正常获得防御下降；冰壳持续绘制在破盾图形之上。
- `[OF]` 敌方 AI 魔祭師抽到 SD 后，先取有效防御最低、再取当前生命最低的范围内敌军，
  并显示组 18 原文“防禦降低.”。
- `[DD]` PIT 经验随机按 `REMAKE-007` 一对一映射为可保存模拟 PRNG；表现、声音、镜头与
  冰壳不消费模拟随机数。

## 触发与输入

- 行动者必须是任一层魔祭師，未行动、未冰封且未被禁咒。
- 目标必须是距离 4 内存活敌军；已有防御下降、已有防御提升、满生命、冰封和首领均合法。
- 取消目标选择返回技术菜单；取消技术菜单返回动作菜单。取消不改变状态、经验、行动位或 PRNG。
- 确认时冻结目标状态前后值、经验、PRNG 前后态与表现中心；150 tick 表现完成后原子提交。

## 有序规则

1. 验证职业、行动位、禁咒、敌方目标与距离 4；冰封只限制行动者，不限制目标；
2. 复制目标完整状态，只把 `defenseDown` 重置为 3；不清 `defenseUp`，不读防魔或免疫表；
3. 恰好调用一次模拟 PRNG，准备 `10..13` 施法经验；
4. 请求一次 `E/8`，播放 `MAGIC/45` 的 10 个 `2×2` 描述符，每项保持 15 native ticks；
5. 150 tick 后原子提交目标状态、施法者经验、PRNG 和行动位；
6. 完整回合边界饱和递减计数；有效防御按 `max(0, base+defenseUpBonus-defenseDownPenalty)`
   进入普通伤害与地形防御公式；
7. TR 提交时清除防御下降；再次施加则完整覆盖为 3。

## AI 使用

魔祭師的原版三层池继续界定 SD 在哪些层级可选。`REMAKE-033/037` 之后池内不再抽签，
选哪一项以及选哪个目标由共享专家效用决定，也不再使用 SD 自己的“有效防御最低、其次生命
最低”原生选择器；完整规则见
[`expert-enemy-ai.md`](expert-enemy-ai.md#与逐技术规格的关系)。距离 4 的选择范围、冰封
目标不因 SD 被过滤、依 `REMAKE-014` 对焦并显示“防禦降低.”，以及与玩家共用的结算与表现
都不变。side 1 自动魔祭師使用同一规划器。`legacyStrict` 可保留原版抽签与原生选择器。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 距离 4；可保存 PRNG；冰封可受无伤害防御下降，冰壳保持最上层 |
| `legacyStrict` | 目标、数值、随机与表现相同；原版行动禁用位不影响 SD 选取 |
| 可开放 Mod 字段 | 职业层级、距离、状态值、防御修正、经验、AI 池／评分、帧序、声音和等待；修改须改变规则身份 |

## 表现与可访问性

正式地图、竞技场和 technique-lab 复用固化的 `MAGIC/45` 原版像素帧与 10 个描述符；禁止
平滑。`E/8` 在第一帧前只请求一次。加速和减少动态只缩放墙钟；不得改变 10 draw、
150 tick、随机次数或提交时点。冰封目标的冰壳始终高于全部 SD 图形。

## 验收场景

1. 魔祭師三层菜单均含 SD，其他职业不可用；距离 4 合法、距离 5 非法；
2. 普通、已有防降、同时有防升、冰封及龍／頭／手敌军均可选，均把防降重置为 3；
3. 每次成功施放只取一次 `10..13` 经验随机，150 tick 前状态、经验和行动位均不提交；
4. 有效防御减少 20（「無法無天」的敌方为 30），防升／防降并存相消，普通伤害与地形防御
   均使用该值；计数完整轮递减，TR 可清除；
5. 10 个 `2×2` 描述符依次覆盖帧 `1..40`，总计 150 tick，开头仅一次 `E/8`；
6. 冻结目标完整播放并正常获得状态，冰壳高于四格破盾图形，生命和防魔不变；
7. 敌方 AI 层级池保持原顺序；专家规划选中 SD 时按共享效用选敌并显示“防禦降低.”；
8. 正式竞技场与 technique-lab 的帧序、锚点、声音、末帧保持和结果读数一致。

## 实施验证

- `pnpm test`：37 个文件、470 项通过；
- SD 定向 Playwright：3 项通过；全量 `pnpm test:e2e`：205 项通过；
- `pnpm build`、`node reverse/tools/angel2-phase1-verify.mjs` 与 `git diff --check` 通过；
- 已人工查看普通／冰封 technique-lab、玩家竞技场与敌方提示四张截图，确认四格描述符、
  提交时点、原文与冰壳层级。
