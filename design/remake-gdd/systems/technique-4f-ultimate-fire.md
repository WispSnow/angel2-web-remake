# `4F / 究級炎暴` 系统规格

状态：`implemented`；规则、双方 AI、三阶段原版表现与默认复刻修正已闭合并通过完整门禁；无实施必需 `[TBD]`

负责人：Web 复刻实现

依赖：[`technique-implementation-sequence.md`](technique-implementation-sequence.md)、
[`technique-3f-advanced-fire.md`](technique-3f-advanced-fire.md)、
[`shooting-and-technique-system.md`](../../../reverse/notes/shooting-and-technique-system.md)、
[`technique-presentations.md`](../../../reverse/notes/technique-presentations.md)、
[`ai-decision-system.md`](../../../reverse/notes/ai-decision-system.md)、
[`special-unit-behavior.md`](../../../reverse/notes/special-unit-behavior.md)、
[`technique-rules.json`](../../../reverse/parsed/native/technique-rules.json)、
[`technique-presentations.json`](../../../reverse/parsed/native/technique-presentations.json)、
[`ai-rules.json`](../../../reverse/parsed/native/ai-rules.json)、
[`web-remake-rule-decisions.md#remake-005普通物理伤害不受防魔影响`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-005普通物理伤害不受防魔影响)、
[`web-remake-rule-decisions.md#remake-009同一动作不因阵营或控制方式改变规则参数`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-009同一动作不因阵营或控制方式改变规则参数)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)

## 玩家目的

邪法師第三层在七步内指定一名未冰封敌军。原版绿焰先在目标脚下扩张，再形成逐行上升的
五格高火柱并从目标上方收束；全部 290 native tick 图形完成后，按目标最大生命的 44%、
270 上限与当前生命三者最小值逐点扣血，并取得 `15..17` 经验及可能的击杀奖励。

## 证据与决策

- `[OF]` 邪法師 `0L` 第一／二／三层分别只列 `2F/3F/4F`；`4F` 只属于第三层。
  玩家分发表选择距离为 7，原版 AI 参数表为 6。
- `[SR]` `REMAKE-009` 规定玩家、我方自动与敌方 AI 共用玩家 action definition，故
  `stableRemake` 统一使用选择距离 7；`legacyStrict` 可保留玩家 7／AI 6。
- `[OF]` 只处理选中的单个敌人，伤害为
  `min(当前生命,270,floor(最大生命×44/100))`；不读取攻击、防御、地形防御或范围值。
- `[OF]` 原版炎暴伤害循环不检查防魔，但后置路径仍清除目标防魔；无论是否击杀，施法者
  取得 `15 + randomBelow(3)`，击杀再追加目标职业奖励。
- `[SR]` `REMAKE-005` 将炎暴修正为魔法伤害统一读取防魔：有盾目标实际伤害为 0，结算
  后仍消费防魔；合法施法仍消耗行动、取一次经验随机并取得 `15..17`，但没有击杀奖励。
- `[SR]` `REMAKE-013` 规定冰封单位不能成为单体伤害目标；非法准备不清盾、不取随机、
  不消耗行动。
- `[OF]` A 段使用 `MAGIC/30`：四项直画后把四项组重复两次，共 12 draw、每项 10 tick；
  开始时请求一次 `MAGIC/83`。全部描述符以目标格为锚点。
- `[OF]` B 段在 120 tick 请求 `E/51` 并载入 `MAGIC/28`，在目标锚点直画八项，共
  8 draw、80 tick；随后原版先载入 `MAGIC/29`，才继续下一段。
- `[OF]` C 段用 `MAGIC/29` 在目标锚点直画四项，再把同一资源的 `DS:67EA` 五格高
  描述符画在目标行 `0/−1/−2/−3/−4`，共 9 draw、90 tick。每次重复后
  `DS:5234 -= 50`；最后虽然留下目标上方第 5 行锚点，但不再绘制下一项。因此
  三段合计 29 draw、两次声音请求、290 tick；全部完成后才按实际伤害逐点扣血。
- `[OF]` 邪法師第三层 AI 池只有 `4F`，成功时使用组 10 原文“看我的火球魔法.”；候选
  按有效防御最低、当前生命最低、路径与线性格顺序破平。
- `[OF]` 后期 Boss 双手也直接复用 `4F` 处理器和表现，但其随机目标、交替节奏和关卡
  入口属于后续战役内容；本动作实现只提供可复用规则／表现定义，不提前建立该关卡行为。

## 触发与输入

- 邪法師仅第三层可选“究級炎暴”；第一／二层分别只使用 `2F/3F`，不得回退显示其他层级。
- 行动者必须未行动、未冰封且未被禁咒；目标必须是统一距离 7 内的未冰封敌军。
- 取消目标回技术菜单，再取消回动作菜单；不提交行动位、生命、状态、经验或 PRNG。
- 确认时冻结 `{target,targetMaximumLife,damage,magicGuardResult,experienceRoll,
  rngBefore/rngAfter}`；三阶段描述符、相机、声音与逐点生命重画不得重算模拟结果。

## 有序规则

1. 验证邪法師第三层、行动位、冰封、禁咒、敌方目标与统一选择距离 7；
2. 计算 `rawDamage=min(currentLife,270,floor(maxLife×44/100))`；
3. `stableRemake` 若目标防魔生效，记录 `blocked=magicGuard`、实际伤害 0 和准备后防魔 0；
   否则实际伤害等于 `rawDamage`；
4. 从模拟 PRNG 取一次 `0..2`，经验先记 `15+随机值`；仅实际伤害令生命归零时追加职业
   击杀奖励；
5. 目标格请求 `MAGIC/83`，以目标锚点播放 `MAGIC/30` 12 项，共 120 tick；
6. 请求 `E/51`，播放 `MAGIC/28` 八项固定锚点，共 80 tick；
7. 载入 `MAGIC/29`，先在目标锚点播放四项，再以同一资源播放五项逐行上升火柱，共
   90 tick；
8. 290 tick 后，有实际伤害时才按每点 1 tick 投影生命下降；模拟生命、防魔、经验、PRNG
   与行动位仍保持准备前状态；
9. 图形与逐点投影完成后原子提交生命、防魔、经验、PRNG 和行动位，再移除死亡单位。

## AI 使用

邪法師第三层池只有 `4F`。AI 在统一距离 7 内按原版评分选未冰封敌军；成功后对焦准备
目标、显示组 10 原文，播放同一三段表现并提交同一准备结果。第一／二层不使用 `4F`；
无候选、冰封或禁咒时进入 ordinary AI，不回退低阶炎暴且不消费经验随机。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 双方距离 7；防魔挡伤后消费；冰封目标非法；确定性 PRNG |
| `legacyStrict` | 玩家距离 7、AI 距离 6；炎暴穿透防魔后清盾；原版可攻击冰封目标 |
| 可开放 Mod 字段 | 职业层级、选择距离、比例、上限、经验、伤害类型、三段资源／锚点／声音／等待；修改后必须改变规则身份 |

## 表现与可访问性

正式地图和 technique-lab 必须逐描述符组合 `MAGIC/30` 的 21 张、`MAGIC/28` 的 48 张和
`MAGIC/29` 的 21 张原始素材，不能放大或换色复用低阶火焰。`MAGIC/28` 只能播放八项；
后九项必须先切换到 `MAGIC/29`，其中最后五项逐行向上。把五次 `DS:67EA` 留在
`MAGIC/28` 会把同一龙头图块重复到多格，属于错误阶段绑定。原始像素禁用平滑。战斗音效开关只影响
0／120 tick 的 `MAGIC/83`、`E/51` 请求；加速、减少动态与静音只能改变墙钟或声音，不能
改变 29 draw、290 tick、逐点扣血次数、防魔结果、PRNG 或提交时点。

## 验收场景

1. 三层邪法師分别只显示／规划 `2F/3F/4F`；`4F` 只在第三层可用；
2. 最大生命 615、当前生命 400 的目标承受 270；最大生命 613 时承受 269；当前生命较低时
   饱和归零并追加击杀奖励；
3. 防魔目标在 `stableRemake` 伤害 0、演出后清盾，合法施法仍取得 `15..17` 并只取一次
   PRNG；冰封目标不出现在玩家或 AI 候选中且非法准备完全无副作用；
4. 固定 PRNG 覆盖经验 15/16/17；有／无击杀均只取一次经验随机；
5. 正式玩家与 AI 在 0／120 tick 请求 `MAGIC/83`、`E/51`，依次完成 12／8／9 draw；
   290 tick 前不提交生命、防魔、经验、随机或行动位；
6. `MAGIC/28` 的第八项后立即切换 `MAGIC/29`；后者前四项锚点为 `0`，最后五项火柱
   锚点严格为 `0/−1/−2/−3/−4`，且画面中不出现多格重复龙头；
7. technique-lab 可 seek 三段边界并显示 44%／270 规则预览；正式竞技场与实验室均不得
   退化为低阶素材换色、29 张素材逐张播放或固定目标锚点；
8. 第三层双方 AI 使用 `4F` 与组 10 原文；无候选、第一／二层不使用 `4F`。

## 验证记录

- 2026-08-05：生成并接入 `MAGIC/30`、`MAGIC/28`、`MAGIC/29` 三段原版组合素材。
- 2026-08-05：依据 `8D90h..8EE4h` 指令顺序纠正阶段边界：正式地图与 technique-lab
  共用 12／8／9 draw、290 tick；五次上升描述符在 `MAGIC/29` 载入后执行，消除错误的
  多格重复龙头，并以资源帧断言和关键帧截图覆盖回归。
- 2026-08-05：邪法師第三层玩家菜单、统一距离 7、44%／270、经验 `15..17`、
  `REMAKE-005` 防魔挡伤后消费、`REMAKE-013` 冰封拒绝、双方 AI、组 10 对话和
  `MAGIC/83`／`E/51` 请求均完成。
- 2026-08-05：`pnpm test:coverage` 通过（37 个文件、434 条测试），`pnpm build`、
  `node reverse/tools/angel2-phase1-verify.mjs` 与 `pnpm test:e2e`（177/177）通过；竞技场
  玩家／AI 与 technique-lab 三条 4F 定向浏览器用例通过。
