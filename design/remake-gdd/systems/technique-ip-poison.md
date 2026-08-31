# `IP / 施毒` 系统规格

状态：`implemented`；原版玩家／AI 规则、持续状态、地图表现、`REMAKE-004`、
`REMAKE-013` 冰封例外与 `REMAKE-124` 首领毒伤已闭合

负责人：Web 复刻实现

依赖：[`technique-implementation-sequence.md`](technique-implementation-sequence.md)、
[`shooting-and-technique-system.md`](../../../reverse/notes/shooting-and-technique-system.md)、
[`status-lifecycle.md`](../../../reverse/notes/status-lifecycle.md)、
[`remaining-technique-presentations.md`](../../../reverse/notes/remaining-technique-presentations.md)、
[`ai-decision-system.md`](../../../reverse/notes/ai-decision-system.md)、
[`technique-rules.json`](../../../reverse/parsed/native/technique-rules.json)、
[`ai-rules.json`](../../../reverse/parsed/native/ai-rules.json)、
[`remaining-technique-presentations.json`](../../../reverse/parsed/native/remaining-technique-presentations.json)、
[`web-remake-rule-decisions.md#remake-004毒不能把生命降到-0`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-004毒不能把生命降到-0)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)、
[`web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心)
、[`web-remake-rule-decisions.md#remake-124中毒对龍系-boss-生效并把当前生命降至三分之一`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-124中毒对龍系-boss-生效并把当前生命降至三分之一)

## 玩家目的

第二、第三层咒術師可在六步内指定一名敌军，播放原版上升毒液与毒云两段表现后，把目标
中毒计数重置为 3。每个完整玩家＋我方自动＋敌方回合边界，中毒单位先结算一次毒伤，
再把中毒计数减 1；`stableRemake` 保证毒不会把生命降到 0。`REMAKE-124` 使龍、頭、手也
写入中毒，并把其每次 tick 改为当前生命的三分之一。一次成功施放固定取得
`14+random(0..3)` 经验，并在完整 290 native tick 后提交。

## 证据与决策

- `[OF]` 原版菜单字节为 `IP / 施  毒 `，规范化显示“施毒”。咒術師第一层菜单为
  `1H/SA/LA`，第二层为 `1H/SA/LA/IP`，第三层为 `1H/SA/LA/IP/SN`。
- `[OF]` 玩家分发处理器为 `0000:CF2C`，选择距离 6，目标组为敌方。成功时把目标
  `+14h` 状态字写为 `8003h`，重复施放重置为 3，不叠加。
- `[OF]` `1P/龍`、`2P/頭`、`3P/手` 免疫写入，但免疫判断发生在完整表现之后；故免疫
  目标也必须播放 290 tick，并照常取得一次 `14+random(0..3)` 经验。
- `[OF]` 原版完整轮边界先以 `floor(currentLife/2)` 写回生命，再执行 `3→2→1→0`；它可
  把 1 点生命写成 0，但该次毒 tick 不触发死亡。单位暂时留场；之后任一伤害收尾调用
  全棋盘死亡扫描时，仍为 0 生命的单位才被移除。
- `[SR]` `REMAKE-004` 把扣血修正为 `max(1, floor(currentLife/2))`，因此毒不能致死；
  `legacyStrict` 保留原版毒 tick 后 0 点暂时留场、后续全局死亡扫描才移除的行为。
- `[DD]` `REMAKE-124` 取代 `stableRemake` 的龍／頭／手毒免疫：`IP` 与叢林戰士普通命中
  都可写入同一 3 回合状态，普通单位仍写 `max(1,floor(life/2))`，龍／頭／手改写
  `max(1,floor(life/3))`。混乱与冰雪等其他免疫不变。
- `[SR]` `REMAKE-013` 的禁选范围只覆盖普通攻击、射击、单体伤害和治疗；施毒没有即时
  伤害，故冻结敌军仍可成为目标并获得中毒。完整轮边界若单位此刻仍冻结，则该次持续伤害
  完整跳过，不改变生命、死亡、击杀、经验或 PRNG，但中毒计数仍减 1。冰壳始终绘制在
  之后的毒液／毒云之上。
- `[OF]` 表现入口 `1000:772E` 先播放 `MAGIC/17`：`2×2`、锚点 `(0,-1)`，状态
  `1..4,5..8,…,45..48,1..4`，13 draw × 10 tick = 130 tick；随后在 130 tick 请求
  `E/58`，播放 `MAGIC/18` 的 16 个 `2×2` 描述符，16 draw × 10 tick = 160 tick。
  总计 29 draw、290 tick；状态写入、经验和行动位只能在表现返回后提交。
- `[OF]` 原版 AI 参数行为 20、敌方目标、距离 6、选择器 `1000:0A7B`，提示原文“中毒.”。
  咒術師三层 AI 池与玩家池同序。

## 触发与输入

- 第二、第三层咒術師显示“施毒”；行动者必须未行动、未冻结且未被禁咒。
- 目标必须是距离 6 内存活敌军；冻结敌军和龍／頭／手合法，友军、死亡单位和距离 7
  不合法。
- 取消目标回技术菜单，再取消回动作菜单；不提交状态、经验、行动位或 PRNG。
- 确认时冻结 `{目标, 免疫结果, 状态前后值, 经验随机值, PRNG 前后状态}`；表现、声音、
  镜头和资源载入顺序不得重算准备结果。

## 有序规则

1. 验证咒術師层级、行动位、禁咒、敌方目标和选择距离 6；冻结只限制行动者；
2. 完整复制目标状态，并把 `poison` 重置为 3；龍／頭／手不再跳过；
3. 恰好调用一次模拟 PRNG，准备 `14+random(0..3)` 经验；
4. 播放 `MAGIC/17` 的 13 draw；130 tick 请求 `E/58`，再播放 `MAGIC/18` 的 16 draw；
5. 290 tick 后原子提交准备结果、施法者经验和行动位；
6. 每个完整轮边界，对仍有中毒的存活单位先结算毒：普通单位写
   `max(1,floor(life/2))`，龍／頭／手写 `max(1,floor(life/3))`；若此刻冻结则跳过写生命；
   随后都把中毒计数饱和减 1；
7. 最后再执行其他回合状态倒计时与敌方冰封解除，保证敌方冻结单位本边界确实跳过毒伤。

## AI 使用

咒術師的原版层级池继续界定 IP 在哪些层级可选：第一层 `1H/SA/LA`，第二层
`1H/SA/LA/IP`，第三层 `1H/SA/LA/IP/SN`。`REMAKE-033/037` 之后池内不再抽签，选哪一项
以及选哪个目标由共享专家效用决定，也不再使用 IP 自己的原生选择器；完整规则见
[`expert-enemy-ai.md`](expert-enemy-ai.md#与逐技术规格的关系)。距离 6、显示“中毒.”以及
共用结算与表现都不变；龍／頭／手现在是有效候选，已有中毒仍作为重复状态剔除。因为规划不读 PRNG，也就不存在“压缩池会
改变 IP 概率和索引”的问题。我方自动咒術師使用同一规划器。

IP 的控制估值 `80 + 生命/4` 通常低于 LA 的 `100 + 威胁/2`，所以第二层起的编队一般先出
LA；目标已混乱后 LA 记为重复，IP 才成为池内最佳项。`legacyStrict` 可保留原版抽签与
原生选择器。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 毒最低保留 1 点生命；普通单位降至 `1/2`，龍／頭／手降至 `1/3`；冻结时跳过本次毒伤但消耗计数；所有目标均可写入 |
| `legacyStrict` | 原版毒可把生命写为 0；毒 tick 后暂时留场，后续全局死亡扫描才移除；其余目标、免疫、表现和经验保持证据值 |
| 可开放 Mod 字段 | 职业层级、距离、计数、折半公式、免疫表、经验、AI 池／排序、帧序／声音／等待；修改后必须改变规则身份 |

## 表现与可访问性

正式地图与 technique-lab 复用固化的 `MAGIC/17`、`MAGIC/18` 与 `E/58`。原始像素禁用
平滑；第二段声音必须严格在 130 native tick 边界请求。冰封目标的冰壳在两段全部帧之上。
加速、减少动态、静音和 AI 对话开关只能改变墙钟、声音或提示，不能改变 29 draw、290
tick、状态写入、生命除数、PRNG 次数或提交时点。

## 验收场景

1. 咒術師第二、第三层菜单含 IP，第一层与其他职业不可用；选择距离为 6；
2. 普通敌军、冻结敌军和龍／頭／手可选；友军、距离 7 与死亡单位不可选；
3. 所有目标都重置中毒为 3，完整演出并取得 `14..17` 且恰好一次 PRNG；
4. 轮边界按 `3→2→1→0` 递减；普通单位生命降至 `1/2`，龍／頭／手降至 `1/3`，1 点生命
   在 `stableRemake` 保持 1；存读档保持后续序列；
5. 冻结目标可被施毒，冰壳高于两段表现；仍冻结的轮边界生命不变、计数照减；
6. 敌方 AI 层级池保持原始长度／顺序；目标已被同池 LA 混乱后，专家规划确定性选择 IP，
   显示“中毒.”，龍／頭／手可作为有效候选；
7. 正式玩家与 AI 在 130 tick 请求 `E/58`，290 tick 前状态、经验和行动位不提交；
8. technique-lab 与正式竞技场的两段帧序、锚点、声音、目标侧、Boss 三分之一规则和结果
   读数一致。

## 验证记录

以下完整门禁记录来自 2026-08-05 的原始实现；其中“首领免疫”已由 `REMAKE-124` 取代，
当前变更以本节后续的定向验证记录为准：

- `pnpm content:actions` 与 `pnpm content:technique-lab` 重建 `MAGIC/17`、`MAGIC/18`、
  `E/58`、正式动作目录和实验室目录；生成内容断言同时锁定原版分发、状态、经验、AI 与
  290 tick 表现证据；
- `pnpm test:coverage` 通过：37 个测试文件、451 项单元测试；覆盖普通／冻结／首领目标、
  单次 PRNG、`REMAKE-004` 最低 1 点、冻结跳伤与计数递减、玩家／AI 层级池；
- `pnpm build` 与 `pnpm exec tsc --noEmit` 通过；
- `pnpm test:e2e` 通过：195/195。专项场景覆盖玩家 290 tick 后原子提交、敌方原生池与
  “中毒.”、实验室普通／冻结／当时的首领免疫；Canvas 工具测试改为等待 Phaser 消费点击，
  并锁定 IP 已开放、LA 仍禁用；
- 已人工查看 `arena-poison-cloud.png`、`arena-poison-ai-notice.png`、
  `technique-lab-poison.png` 与 `technique-lab-poison-frozen.png`；毒雾 2×2 组合、AI 原文与
  冰壳上层关系正确；
- `node reverse/tools/angel2-phase1-verify.mjs` 通过：28 个引用、699 个 JSON、51 个 Markdown、
  138 条证据行，实施必需未知项为 0。

2026-08-31 的 `REMAKE-124` 定向验证：

- `pnpm content:stage37` 通过，并重建第 37 关当前规则身份；
- 与动作、职业、毒伤、专家 AI、存档、第 37 关内容和实验室直接相关的 Vitest 文件全部通过；
- technique-lab 的 Boss 毒伤、class-showdown 的叢林戰士命中施毒，以及复刻说明中的
  `REMAKE-124` 聚焦 Playwright 用例全部通过；
- 已人工查看 `technique-lab-poison-boss.png`、`class-showdown-jungle-poison-status-icon.png`
  与 `remake-notes-boss-poison.png`，Boss 三分之一读数、中毒图标和规则说明均正确；
- `pnpm build` 与 `pnpm docs:check` 通过。
