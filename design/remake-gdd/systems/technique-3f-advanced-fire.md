# `3F / 高級炎暴` 系统规格

状态：`implemented`；2026-08-05 通过完整自动门禁与截图审计；无实施必需 `[TBD]`

负责人：Web 复刻实现

依赖：[`technique-implementation-sequence.md`](technique-implementation-sequence.md)、
[`technique-2f-intermediate-fire.md`](technique-2f-intermediate-fire.md)、
[`shooting-and-technique-system.md`](../../../reverse/notes/shooting-and-technique-system.md)、
[`technique-presentations.md`](../../../reverse/notes/technique-presentations.md)、
[`technique-rules.json`](../../../reverse/parsed/native/technique-rules.json)、
[`technique-presentations.json`](../../../reverse/parsed/native/technique-presentations.json)、
[`ai-rules.json`](../../../reverse/parsed/native/ai-rules.json)、
[`web-remake-rule-decisions.md#remake-005普通物理伤害不受防魔影响`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-005普通物理伤害不受防魔影响)、
[`web-remake-rule-decisions.md#remake-009同一动作不因阵营或控制方式改变规则参数`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-009同一动作不因阵营或控制方式改变规则参数)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)

## 玩家目的

邪法師第二层在七步内指定一名未冰封敌军，以原版 `MAGIC/27` 从单格扩展为
三格宽、两格高的火浪；全部 195 native tick 完成后，按目标最大生命的 32%、
192 上限与当前生命三者最小值逐点扣血，并取得 `12..14` 经验及可能的击杀奖励。

## 证据与决策

- `[OF]` 邪法師 `0L` 第一／二／三层分别只列 `2F/3F/4F`，不保留低阶动作；
  玩家分发表中 `3F` 选择距离为 7，原版 AI 参数表为 6。
- `[SR]` `REMAKE-009` 规定玩家、我方自动与敌方 AI 共用玩家 action definition，
  因此 `stableRemake` 统一使用选择距离 7；`legacyStrict` 可保留 7/6 分表。
- `[OF]` 只处理选中的单个敌人：
  `min(当前生命, 192, floor(最大生命×32/100))`；不读取攻击、防御、地形防御或范围值。
- `[OF]` 原版炎暴伤害循环不检查防魔，但后置路径仍清除目标防魔最高位；无论是否
  击杀，施法者取得 `12 + randomBelow(3)`，击杀再追加目标职业奖励。
- `[SR]` `REMAKE-005` 已将上述炎暴异常修正为魔法伤害统一读取防魔：有盾目标本次
  伤害为 0，结算后仍消耗防魔；施法仍消耗行动并取一次 `0..2` 经验随机，但不产生
  击杀奖励。共享炎暴路径的 `1F/2F` 也必须同步纠正，不能继续把原版异常当作
  `stableRemake` 默认。
- `[SR]` `REMAKE-013` 规定冰封单位不能成为单体伤害目标；非法准备不清盾、不取
  经验随机、不消耗行动。
- `[OF]` `MAGIC/27` 含 51 张原始图形，13 个描述符依次为 `1×1`、`2×1`、四个
  `3×1`、六个 `3×2`，最后一项是全空描述符。每项等待 15 native tick，包含
  空尾项在内总固定图形等待为 195 tick。
- `[OF]` 开始时经战斗音效门请求一次 `MAGIC/83`；全部 13 项完成后才把等待改为
  1 tick 并按实际伤害逐点更新生命投影，最后再移除零生命单位。
- `[OF]` 邪法師第二层 AI 池只有 `3F`；候选按有效防御最低、当前生命最低、路径与格号
  破平。成功时使用组 10 原文“看我的火球魔法.”。

## 触发与输入

- 邪法師仅第二层可选“高級炎暴”；第一／三层分别只使用已实现的 `2F` 和待后续闭合的
  `4F`，不得在错误层级回退显示 `3F`。
- 行动者必须未行动、未冰封且未被禁咒；目标必须是统一距离 7 内的未冰封敌军。
- 取消目标回技术菜单，再取消回动作菜单；不提交行动位、生命、状态、经验或 PRNG。
- 确认时冻结 `{target, targetMaximumLife, damage, magicGuardResult, experienceRoll,
  rngBefore/rngAfter}`；表现、声音、墙钟与生命数字重画不得重算结果。

## 有序规则

1. 验证邪法師第二层、行动位、冰封、禁咒、敌方目标与统一选择距离 7；
2. 计算 `rawDamage=min(currentLife,192,floor(maxLife×32/100))`；
3. `stableRemake` 若目标防魔生效，记录 `blocked=magicGuard`、实际伤害 0 并将准备后防魔
   写为 0；否则实际伤害为 `rawDamage`；
4. 从模拟 PRNG 取一次 `0..2`，经验先记 `12+随机值`；仅实际伤害导致生命为 0 时
   追加职业击杀奖励；
5. 目标格开始请求一次 `MAGIC/83`，按 `MAGIC/27` 的 13 个描述符各播放 15 tick；
6. 195 tick 完成后，有实际伤害时才按每点 1 tick 投影生命下降；此时模拟生命、
   防魔、经验、PRNG 与行动位仍未提交；
7. 表现完成后原子提交生命、防魔、经验、PRNG 和行动位，再执行死亡移除。

## AI 使用

邪法師第二层池只有 `3F`，所以可选集合与原版一致。`REMAKE-033/037` 之后目标由共享专家
效用选择，不再使用原版敌方评分；完整规则见
[`expert-enemy-ai.md`](expert-enemy-ai.md#与逐技术规格的关系)。统一距离 7、排除冰封目标、
对焦准备目标、组 10 原文、共同表现与同一准备结果都不变。第一／三层只使用各自原版池；
第二层无合法目标时走 ordinary AI，不回退低阶炎暴且不消耗技术随机。
`legacyStrict` 可保留原版评分。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 双方选择距离 7；魔法伤害被防魔阻挡后消耗盾；冰封目标非法；确定性 PRNG |
| `legacyStrict` | 玩家距离 7、AI 距离 6；炎暴穿透防魔后清盾；原版可攻击冰封目标 |
| 可开放 Mod 字段 | 职业层级、选择距离、比例、上限、经验、伤害类型，图形／声音／等待；改变后必须改变规则身份 |

## 表现与可访问性

`MAGIC/27` 必须按 13 个原始描述符组合51 张素材，不能放大、换色或复用
`MAGIC/22/23`。宽度从 1 格增长到 3 格，高度从 1 格增长到 2 格；最后的全空描述符
仍必须保留 15 tick，不得因为无图片而提前结算。原始像素禁用平滑。战斗音效开关只影响
`MAGIC/83` 请求；加速、减少动态与静音只能改变墙钟或声音，不能改变 13 draw、195 tick、
逐点扣血次数、防魔结果、经验随机或原子提交边界。

## 验收场景

1. 三层邪法師分别只显示／规划 `2F/3F/4F` 当前已完成子集；`3F` 只在第二层可用；
2. 最大生命 601、当前生命 250 的无盾目标承受 192；最大生命 599 时承受 191；低生命饱和归零
   并追加击杀奖励；
3. 防魔目标在 `stableRemake` 受伤 0，演出完成后清盾，施法者仍取一次 `0..2` 并取得
   `12..14` 经验；`1F/2F` 共享回归也必须改为先挡伤再清盾；
4. 冰封目标不出现在玩家或 AI 候选中，非法准备不改变生命、防魔、PRNG 或行动位；
5. 固定 PRNG 覆盖经验 12/13/14，每次合法准备只取一次经验随机；
6. 正式玩家与 AI 都播放 `MAGIC/27` 的 13 个描述符，开始请求一次 `MAGIC/83`；
   第 13 个全空描述符仍等待 15 tick，195 tick 后才逐点扣血与原子提交；
7. technique-lab 可 seek 单格火焰、三格地火、两格高火浪及空尾项，并显示 32%／192
   规则预览；正式竞技场与实验室截图确认不是低阶炎暴换色或 51 帧逐张播放；
8. 第二层双方 AI 使用 `3F` 与组 10 原文；无候选、第一／三层不使用 `3F`。

## 验证记录

- 2026-08-05 重跑 `pnpm content:actions` 与 `pnpm content:technique-lab`；生成器逐项断言
  玩家距离 7／原版 AI 距离 6、32%、192 上限、经验 `12..14`、`MAGIC/27` 的
  51 张素材／13 个描述符、末项六个空 frame、每项 15 tick、总计 195 tick 与开始时
  一次 `MAGIC/83`，并将原图发布到正式运行时与实验室；
- 共享炎暴准备器按 `REMAKE-005` 纠正回默认复刻规则：`1F/2F/3F` 均先以防魔把伤害挡为
  0，表现完成后再消耗护盾；合法施法仍只取一次层级经验随机，不产生击杀奖励。
  单元回归另覆盖 599/601 最大生命的 191/192 边界、当前生命饱和、冰封拒绝、
  邪法師三层菜单与双方 AI 统一距离 7；
- 正式竞技场玩家与敌方 AI 路径都播放 13 draw／195 tick，请求一次 `MAGIC/83`，
  验证组 10 原文、七格 AI 候选、逐点生命投影与原子提交；technique-lab 可 seek 单格、
  三格、3×2 峰值和 15 tick 空尾项；
- 完整 Vitest 37 个文件／417 项、覆盖率、生产构建、第一阶段证据校验与固定版本
  Chromium 162 项通过，`implementationRequiredUnknowns=0`，`git diff --check` 无报错；
- 人工查看 `arena-fire-3-wave.png`、`arena-fire-3-ai-wave.png` 与
  `technique-lab-fire-3-wave.png`：正式玩家／AI 均以目标为中心呈现原版 3×2 火浪与战场裁切，
  实验室显示完整六图块峰值；没有退化为 `MAGIC/22/23` 换色、放大或 51 张素材逐张播放。
