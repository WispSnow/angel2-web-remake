# `IP / 施毒` 系统规格

状态：`implemented`；原版玩家／AI 规则、持续状态、地图表现、首领免疫、`REMAKE-004` 与
`REMAKE-013` 冰封例外已闭合，并于 2026-08-05 通过完整自动与截图门禁

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

## 玩家目的

第二、第三层咒術師可在六步内指定一名敌军，播放原版上升毒液与毒云两段表现后，把目标
中毒计数重置为 3。每个完整玩家＋我方自动＋敌方回合边界，中毒单位先结算一次生命折半，
再把中毒计数减 1；`stableRemake` 保证毒不会把生命降到 0。龍、頭、手完整播放表现但免疫
状态写入。一次成功施放固定取得 `14+random(0..3)` 经验，并在完整 290 native tick 后提交。

## 证据与决策

- `[OF]` 原版菜单字节为 `IP / 施  毒 `，规范化显示“施毒”。咒術師第一层菜单为
  `1H/SA/LA`，第二层为 `1H/SA/LA/IP`，第三层为 `1H/SA/LA/IP/SN`。
- `[OF]` 玩家分发处理器为 `0000:CF2C`，选择距离 6，目标组为敌方。成功时把目标
  `+14h` 状态字写为 `8003h`，重复施放重置为 3，不叠加。
- `[OF]` `1P/龍`、`2P/頭`、`3P/手` 免疫写入，但免疫判断发生在完整表现之后；故免疫
  目标也必须播放 290 tick，并照常取得一次 `14+random(0..3)` 经验。
- `[OF]` 原版完整轮边界先以 `floor(currentLife/2)` 写回生命，再执行 `3→2→1→0`；它可
  把 1 点生命写成 0，却不移除单位。
- `[SR]` `REMAKE-004` 把扣血修正为 `max(1, floor(currentLife/2))`，因此毒不能致死；
  `legacyStrict` 保留原版 0 点但仍在场行为。
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
- 目标必须是距离 6 内存活敌军；冻结敌军和首领免疫目标合法，友军、死亡单位和距离 7
  不合法。
- 取消目标回技术菜单，再取消回动作菜单；不提交状态、经验、行动位或 PRNG。
- 确认时冻结 `{目标, 免疫结果, 状态前后值, 经验随机值, PRNG 前后状态}`；表现、声音、
  镜头和资源载入顺序不得重算准备结果。

## 有序规则

1. 验证咒術師层级、行动位、禁咒、敌方目标和选择距离 6；冻结只限制行动者；
2. 完整复制目标状态；若职业不是龍、頭、手，仅把 `poison` 重置为 3；免疫目标保持不变；
3. 不论免疫与否，恰好调用一次模拟 PRNG，准备 `14+random(0..3)` 经验；
4. 播放 `MAGIC/17` 的 13 draw；130 tick 请求 `E/58`，再播放 `MAGIC/18` 的 16 draw；
5. 290 tick 后原子提交准备结果、施法者经验和行动位；
6. 每个完整轮边界，对仍有中毒的存活单位先结算毒：`stableRemake` 写
   `max(1,floor(life/2))`；若此刻冻结则跳过写生命；随后都把中毒计数饱和减 1；
7. 最后再执行其他回合状态倒计时与敌方冰封解除，保证敌方冻结单位本边界确实跳过毒伤。

## AI 使用

敌方咒術師按原版层级池抽签：第一层 `1H/SA/LA`，第二层 `1H/SA/LA/IP`，第三层
`1H/SA/LA/IP/SN`。抽到 IP 后使用原版敌方选择器、距离 6 和同一结算／表现，首领免疫
不参与预过滤，并显示“中毒.”。尚未依序实施的 `SA/LA/SN` 暂保留其原生池槽位；抽到这些
槽位时进入既有普通行动兜底，不能压缩池而改变 IP 的概率和索引。我方自动咒術師只从已
实施动作中规划，后续技能完成时依原池顺序补齐。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 毒最低保留 1 点生命；冻结时跳过本次毒伤但消耗计数；首领仅免疫写入 |
| `legacyStrict` | 原版毒可把生命写为 0 但单位仍在场；其余目标、免疫、表现和经验保持证据值 |
| 可开放 Mod 字段 | 职业层级、距离、计数、折半公式、免疫表、经验、AI 池／排序、帧序／声音／等待；修改后必须改变规则身份 |

## 表现与可访问性

正式地图与 technique-lab 复用固化的 `MAGIC/17`、`MAGIC/18` 与 `E/58`。原始像素禁用
平滑；第二段声音必须严格在 130 native tick 边界请求。冰封目标的冰壳在两段全部帧之上。
加速、减少动态、静音和 AI 对话开关只能改变墙钟、声音或提示，不能改变 29 draw、290
tick、免疫结果、PRNG 次数或提交时点。

## 验收场景

1. 咒術師第二、第三层菜单含 IP，第一层与其他职业不可用；选择距离为 6；
2. 普通敌军、冻结敌军和龍／頭／手可选；友军、距离 7 与死亡单位不可选；
3. 普通目标重置中毒为 3；免疫目标完整演出但状态不变；两者都取得 `14..17` 且恰好一次 PRNG；
4. 轮边界按 `3→2→1→0` 折半，1 点生命在 `stableRemake` 保持 1；存读档保持后续序列；
5. 冻结目标可被施毒，冰壳高于两段表现；仍冻结的轮边界生命不变、计数照减；
6. 敌方 AI 池保持原始长度／顺序，可确定性抽到 IP，显示“中毒.”，免疫目标不预过滤；
7. 正式玩家与 AI 在 130 tick 请求 `E/58`，290 tick 前状态、经验和行动位不提交；
8. technique-lab 与正式竞技场的两段帧序、锚点、声音、目标侧、免疫和结果读数一致。

## 验证记录

- `pnpm content:actions` 与 `pnpm content:technique-lab` 重建 `MAGIC/17`、`MAGIC/18`、
  `E/58`、正式动作目录和实验室目录；生成内容断言同时锁定原版分发、状态、经验、AI 与
  290 tick 表现证据；
- `pnpm test:coverage` 通过：37 个测试文件、451 项单元测试；覆盖普通／冻结／首领目标、
  单次 PRNG、`REMAKE-004` 最低 1 点、冻结跳伤与计数递减、玩家／AI 层级池；
- `pnpm build` 与 `pnpm exec tsc --noEmit` 通过；
- `pnpm test:e2e` 通过：195/195。专项场景覆盖玩家 290 tick 后原子提交、敌方原生池与
  “中毒.”、实验室普通／冻结／首领免疫；Canvas 工具测试改为等待 Phaser 消费点击，
  并锁定 IP 已开放、LA 仍禁用；
- 已人工查看 `arena-poison-cloud.png`、`arena-poison-ai-notice.png`、
  `technique-lab-poison.png` 与 `technique-lab-poison-frozen.png`；毒雾 2×2 组合、AI 原文与
  冰壳上层关系正确；
- `node reverse/tools/angel2-phase1-verify.mjs` 通过：28 个引用、699 个 JSON、51 个 Markdown、
  138 条证据行，实施必需未知项为 0。
