# `FM / 防魔` 系统规格

状态：`implemented`；原版玩家规则、状态消费、地图表现、`REMAKE-013` 冰封例外与
`REMAKE-026` AI 孤项修复已闭合并通过完整自动／截图门禁；无实施必需 `[TBD]`

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
[`web-remake-rule-decisions.md#remake-005普通物理伤害不受防魔影响`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-005普通物理伤害不受防魔影响)、
[`web-remake-rule-decisions.md#remake-009同一动作不因阵营或控制方式改变规则参数`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-009同一动作不因阵营或控制方式改变规则参数)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)、
[`web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心)、
[`web-remake-rule-decisions.md#remake-026防魔-ai-孤项使用玩家动作定义安全修复`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-026防魔-ai-孤项使用玩家动作定义安全修复)

## 玩家目的

第三层魔導師在七步内指定一名友军（包括自己或冰封友军），播放与攻击提升完全相同的
原版双格白蓝光焰后，把该单位的防魔状态重置为 1。它可阻挡下一次适用的魔法效果并按
该动作规则决定是否消费；若未提前消费，则在下一完整玩家＋我方自动＋敌方回合边界清零。
完整 300 native tick 后才原子提交状态、`10+random(0..3)` 经验和行动位。

## 证据与决策

- `[OF]` 原版菜单字节为 `FM / 防  魔 `，可见名称规范化为“防魔”。它只出现在
  `1J/魔導師` 第三层玩家菜单 `3H/2I/AA/FM`，不属于第一、第二层或其他职业。
- `[OF]` 玩家分发处理器为 `0000:CE70`，选择距离 7，目标组为友方；原版验证器允许自己。
  成功提交把目标完整 `+0Ch` 状态字写为 `8001h`，再次施放只是刷新为 1，不叠加次数，
  不改变生命、冰封或其他状态。
- `[OF]` 每次成功施放，包括自己、满生命目标、刷新已有防魔或冰封友军，恰好调用一次
  模拟 PRNG 并取得 `10+random(0..3)` 经验。
- `[OF]` 防魔若未被效果提前处理，在下一完整回合边界按通用公式 `8001h→0000h`。
  普通攻击、反击、踏地和第 4 关力场等物理／剧情效果不读取也不消费它；魔法动作按各自
  已闭合顺序阻挡和消费。`stableRemake` 的炎暴、落雷与非既有冰封的冰雪会消费，魔弓
  保留首段挡伤后消费、第二段继续结算，`WD` 保留挡伤但不消费。
- `[SR]` `REMAKE-013` 只禁止冰封单位成为攻击或治疗目标；防魔是正面状态技术，故冰封
  友军仍可接受并保持冰封。冰壳必须持续覆盖本动作光焰；已有冰封单位之后被范围魔法覆盖
  时仍按该决定完整跳过并保留防魔。
- `[OF]` `FM` 与 `AA` 都调用表现入口 `1000:7572`：使用 `MAGIC/16` 的单一 `1×2`
  描述符，依次配对 `[1,21]…[20,40]`，共 20 draw、每 draw 15 tick，总计 300 tick；
  0 tick 以战斗音效类别请求 `UN/51`。不得为了区分技能另造图形、颜色或声音。
- `[OF]` 原版只在完整表现返回后才重新装载目标、写 `8001h`、结算经验和行动位。
- `[OF]` 原版魔導師第三层 AI 池也含 `FM`，但 AI 参数表缺少该行；后续读取零值或残留
  字段属于未定义行为，且没有可证实对白。
- `[DD]` `REMAKE-026` 在 `stableRemake` 保留池顺序，但抽到 `FM` 时统一使用玩家动作定义
  和友方最大缺血／后格优先选择器；自己、满生命、已有防魔和冰封友军合法。自动施术先
  对焦准备目标，但不显示虚构台词。

## 触发与输入

- 只有第三层魔導師显示“防魔”；行动者必须未行动、未冰封且未被禁咒。
- 目标必须是距离 7 内存活友军；自己、满生命、已有防魔和冰封友军均合法。
- 取消目标回技术菜单，再取消回动作菜单；不提交状态、经验、行动位或 PRNG。
- 确认时冻结 `{目标, 状态前后值, 经验随机值, PRNG 前后状态}`；表现、声音、镜头、墙钟
  和资源载入顺序不能重算准备结果。

## 有序规则

1. 验证第三层魔導師、行动位、禁咒、友方目标与选择距离 7；冰封只限制行动者；
2. 从当前状态完整复制目标状态，仅把 `magicGuard` 重置为 1；其余状态、生命和冰封不变；
3. 恰好调用一次模拟 PRNG，准备 `10+random(0..3)` 经验；
4. 0 tick 请求 `UN/51`，在目标上格／本格播放 20 对 `MAGIC/16` 帧，每对等待 15 tick；
5. 300 tick 后原子提交目标状态、施法者经验和行动位；
6. 后续魔法效果按各动作已闭合顺序读取／消费防魔；若未消费，下一次 `startNextRound`
   将 1 饱和减为 0。

## AI 使用

第三层魔導師池按原版顺序为 `3H/2I/AA/FM`。`stableRemake` 抽到 `FM` 后，从当前位置七步
内扫描全部友军，选择缺失生命最多者，精确同分取行优先扫描中较后的格；已有防魔不降低
评分。成功时对焦目标，不显示对白，播放同一 300 tick 时间线并原子提交。池选择和本动作
经验各消费既有的一次模拟 PRNG；镜头、声音和画面不消费模拟随机。`legacyStrict` 只保留
孤项证据，并在缺行项被选中时安全进入普通 AI 兜底，不模拟残留内存。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 玩家／双方 AI 统一距离 7 和友方动作定义；冰封友军可接受；AI 无对白 |
| `legacyStrict` | 玩家规则保持原版；AI 原始孤项安全失败并进入普通动作兜底，不模拟未定义内存 |
| 可开放 Mod 字段 | 职业层级、选择距离、状态计数、经验值域、AI 池／排序、资源／帧对／声音／等待；修改后必须改变规则身份 |

## 表现与可访问性

正式地图与 technique-lab 复用 `AA` 已固化的 `MAGIC/16` 四十帧、20 对帧序和 `UN/51`；
语义动作仍保持独立 `magic-guard`，不能把结算误写成攻击提升。原始像素禁用平滑。冰封
目标的持续冰壳必须位于全部光焰帧之上。加速、减少动态、静音和 AI 对话开关只能改变
墙钟、声音或提示，不能改变 20 draw、300 tick、状态、PRNG 次数或提交时点。

## 验收场景

1. 只有第三层魔導師玩家菜单包含 FM；第一、第二层和其他职业不可用，选择距离为 7；
2. 自己、满生命、已有防魔和冰封友军均可选；敌军、距离 8 和死亡单位不可选；
3. 成功后只把 `magicGuard` 重置为 1，每次取得 `10..13` 并消费一次 PRNG；取消不消费；
4. 未使用防魔在下一完整轮边界变 0；存读档保持状态和后续随机流；
5. 代表性炎暴／落雷／冰雪、魔弓、普通物理和 `WD` 用例分别保持既有挡伤／消费合同；
6. 冰封友军成功获得防魔且仍不可行动；之后范围魔法覆盖时完整跳过并保留防魔；
7. 第三层双方 AI 池可确定性抽到 FM，使用距离 7、最大缺血／后格优先且不显示虚构对白；
8. 正式玩家与 AI 在 0 tick 请求 `UN/51`，依序显示 20 对 `MAGIC/16`；300 tick 前状态、
   经验和行动位不提交；
9. technique-lab 与正式竞技场的帧对、音效、时间线、目标侧和结果读数一致，冰壳高于光焰。

## 验证记录

- 2026-08-05：`pnpm test:coverage` 通过（37 个文件、447 项测试）；`pnpm build` 通过；
  第二轮 `pnpm test:e2e` 通过（192 项 Chromium）。首轮 191/192 唯一失败来自既有第 0 关
  移动结束与剧情切换间的采样竞态；采样状态原子复核后，目标用例与第二轮完整套件均通过。
- 玩家／敌方 AI 定向用例覆盖三层菜单池、距离 7、满生命／已有状态目标、无虚构对白、
  20 对双格光焰、`UN/51`、300 tick 原子提交和一次经验 PRNG；单元用例覆盖状态刷新、
  完整轮清零及炎暴／落雷／冰雪、魔弓、`WD`、物理效果的既有消费边界。
- 人工查看 `arena-magic-guard-mid.png`、`arena-magic-guard-ai.png`、
  `arena-magic-guard-frozen-exception.png`、`technique-lab-magic-guard.png` 与
  `technique-lab-magic-guard-frozen.png`：正式与实验室都逐帧复用 AA 的白蓝双格光焰，
  冰封目标的蓝色冰壳始终位于效果上方。
- `node reverse/tools/angel2-phase1-verify.mjs` 通过；实施必需未知项保持 0。
