# `SA / 攻擊下降` 系统规格

状态：`implemented`；原版目标、状态、经验、AI、地图表现与 `REMAKE-013` 冰封例外
已闭合，正式玩家／AI、竞技场、technique-lab、完整自动与截图门禁已通过；无实施必需
`[TBD]`

负责人：Web 复刻实现

依赖：[`technique-implementation-sequence.md`](technique-implementation-sequence.md)、
[`shooting-and-technique-system.md`](../../../reverse/notes/shooting-and-technique-system.md)、
[`status-lifecycle.md`](../../../reverse/notes/status-lifecycle.md)、
[`remaining-technique-presentations.md`](../../../reverse/notes/remaining-technique-presentations.md)、
[`ai-decision-system.md`](../../../reverse/notes/ai-decision-system.md)、
[`technique-rules.json`](../../../reverse/parsed/native/technique-rules.json)、
[`ai-rules.json`](../../../reverse/parsed/native/ai-rules.json)、
[`remaining-technique-presentations.json`](../../../reverse/parsed/native/remaining-technique-presentations.json)、
[`web-remake-rule-decisions.md#remake-007web-存档保存确定性随机状态`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-007web-存档保存确定性随机状态)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)

## 玩家目的

任一层咒術師都可在四步内指定一名敌军。原版十一段下坠光束完整播放后，目标的攻击下降
计数重置为 3，使其有效攻击固定减少 20；攻击提升与攻击下降可同时存在并相消。

## 证据与决策

- `[OF]` 咒術師三层玩家菜单分别为 `1H/SA/LA`、`1H/SA/LA/IP`、
  `1H/SA/LA/IP/SN`；SA 在三层都可用。
- `[OF]` 玩家分发表 `DS:52A2` 的 SA 入口为 `0000:CEC2`，选择距离 4；AI 参数行
  `DS:0FF6` 同样是敌方目标、距离 4、选择器 `1000:0A7B`。
- `[OF]` 表现入口 `1000:7662` 使用 `MAGIC/46`：11 个锚点 `(0,-1)`、尺寸 `1×2`
  的描述符顺序绘制帧 `1..22`，每次等待 15 tick，总计 165 tick；开始时经 `0224h`
  请求 `E/8`。表现返回后才把目标 `+10h` 完整写为 `8003h`。
- `[OF]` 每次成功施放恰好取得 `10+random(0..3)` 经验，包括刷新已有状态、目标已有
  攻击提升或属于龍／頭／手；SA 没有首领免疫。
- `[OF]` 攻击下降有效时，普通攻击和反击所用的有效攻击减少 20；与攻击提升并存时
  `+20/-20` 相消，最终攻击不低于 0。计数仅在完整回合边界执行 `3→2→1→0`；TR 清除。
- `[OF]` SA 是无伤害状态动作，不读取或消费防魔，也不改变生命、死亡、冰封或其他状态。
- `[SR]` `REMAKE-013` 只禁止直接攻击、射击、单体伤害和治疗冰封目标。SA 是无伤害负面
  状态动作，因此冰封敌军仍是合法目标并正常获得攻击下降；冰壳持续绘制在下坠光束之上。
- `[OF]` 敌方 AI 咒術師三层池与玩家池同序；抽到 SA 后用敌方选择器先取有效防御最低、
  再取当前生命最低的范围内目标，并显示组 19 原文“功擊降低.”。
- `[DD]` PIT 经验随机按 `REMAKE-007` 一对一映射为可保存模拟 PRNG；表现、声音、镜头与
  冰壳不消费模拟随机数。

## 触发与输入

- 行动者必须是任一层咒術師，未行动、未冰封且未被禁咒。
- 目标必须是距离 4 内存活敌军；已有攻击下降、已有攻击提升、满生命、冰封和首领均合法。
- 取消目标选择返回技术菜单；取消技术菜单返回动作菜单。取消不改变状态、经验、行动位或 PRNG。
- 确认时冻结目标状态前后值、经验、PRNG 前后态与表现中心；165 tick 表现完成后原子提交。

## 有序规则

1. 验证职业、行动位、禁咒、敌方目标与距离 4；冰封只限制行动者，不限制目标；
2. 复制目标完整状态，只把 `attackDown` 重置为 3；不清 `attackUp`，不读防魔或免疫表；
3. 恰好调用一次模拟 PRNG，准备 `10..13` 施法经验；
4. 请求一次 `E/8`，播放 `MAGIC/46` 的 11 个 `1×2` 描述符，每项保持 15 native ticks；
5. 165 tick 后原子提交目标状态、施法者经验、PRNG 和行动位；
6. 完整回合边界饱和递减计数；有效攻击按 `max(0, base+attackUpBonus-attackDownPenalty)`；
7. TR 提交时清除攻击下降；再次施加则完整覆盖为 3。

## AI 使用

咒術師的原版三层池继续界定 SA 在哪些层级可选。`REMAKE-033/037` 之后，池内选哪一项以及
选哪个目标由共享专家效用决定，不再抽签、也不再使用 SA 自己的“有效防御最低、其次生命
最低”原生选择器；完整规则见
[`expert-enemy-ai.md`](expert-enemy-ai.md#与逐技术规格的关系)。距离 4 的选择范围、冰封
目标不因 SA 被过滤、依 `REMAKE-014` 对焦并显示“功擊降低.”，以及与玩家共用的结算与表现
都不变。side 1 自动咒術師使用同一规划器。

SA 的控制估值 `40 + 威胁/4` 恒低于 LA 的 `100 + 威胁/2`，所以只要 LA 在同层级池内、
目标未混乱且不免疫混乱，专家规划就不会先选 SA。SA 在目标已混乱、免疫混乱或 LA 不在
当前层级时才成为池内最佳项。`legacyStrict` 可保留原版抽签与原生选择器。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 距离 4；可保存 PRNG；冰封可受无伤害攻击下降，冰壳保持最上层 |
| `legacyStrict` | 目标、数值、随机与表现相同；原版行动禁用位不影响 SA 选取 |
| 可开放 Mod 字段 | 职业层级、距离、状态值、攻击修正、经验、AI 池／评分、帧序、声音和等待；修改须改变规则身份 |

## 表现与可访问性

正式地图、竞技场和 technique-lab 复用固化的 `MAGIC/46` 原版像素帧与 11 个描述符；禁止
平滑。`E/8` 在第一帧前只请求一次。加速和减少动态只缩放墙钟；不得改变 11 draw、
165 tick、随机次数或提交时点。冰封目标的冰壳始终高于全部 SA 图形。

## 验收场景

1. 咒術師三层菜单均含 SA，其他职业不可用；距离 4 合法、距离 5 非法；
2. 普通、已有攻降、同时有攻升、冰封及龍／頭／手敌军均可选，均把攻降重置为 3；
3. 每次成功施放只取一次 `10..13` 经验随机，165 tick 前状态、经验和行动位均不提交；
4. 有效攻击减少 20，攻升／攻降并存相消，计数在完整轮边界递减且 TR 可清除；
5. 11 个 `1×2` 描述符依次覆盖帧 `1..22`，总计 165 tick，开头仅一次 `E/8`；
6. 冻结目标完整播放并正常获得状态，冰壳高于光束，生命和防魔不变；
7. 目标已被同层级的另一名咒術師施加混亂后，敌方 AI 把 LA 记为重复而选择 SA，按共享
   专家效用选敌并显示“功擊降低.”；目标未混乱时同一编队先出 LA；
8. 正式竞技场与 technique-lab 的帧序、锚点、声音、末帧保持和结果读数一致。

## 验证记录

2026-08-05 已通过 `pnpm test`（37 文件／467 项）、`pnpm build`、固定 Chromium 的完整
`pnpm test:e2e`（202 项）、`node reverse/tools/angel2-phase1-verify.mjs` 与
`git diff --check`。人工查看 `technique-lab-attack-down.png`、
`technique-lab-attack-down-frozen.png`、`arena-attack-down.png` 与
`arena-attack-down-ai-notice.png`：11 组 `1×2` 帧、目标锚点、原版错字对白及冰壳上层均正确。
