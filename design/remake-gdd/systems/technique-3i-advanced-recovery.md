# `3I / 高級回復` 系统规格

状态：`implemented`；2026-08-05 完成规则、AI、正式表现、实验室与自动／截图门禁；无实施必需 `[TBD]`

负责人：Web 复刻实现

依赖：[`technique-implementation-sequence.md`](technique-implementation-sequence.md)、
[`technique-2i-intermediate-recovery.md`](technique-2i-intermediate-recovery.md)、
[`shooting-and-technique-system.md`](../../../reverse/notes/shooting-and-technique-system.md)、
[`technique-presentations.md`](../../../reverse/notes/technique-presentations.md)、
[`ai-decision-system.md`](../../../reverse/notes/ai-decision-system.md)、
[`technique-rules.json`](../../../reverse/parsed/native/technique-rules.json)、
[`technique-presentations.json`](../../../reverse/parsed/native/technique-presentations.json)、
[`ai-rules.json`](../../../reverse/parsed/native/ai-rules.json)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)、
[`web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心)、
[`web-remake-rule-decisions.md#remake-019群体回復图形只标记实际效果范围`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-019群体回復图形只标记实际效果范围)

## 玩家目的

祈導師第三层在六步内指定一名未冰封的同阵营单位为中心，以曼哈顿半径 4 同时恢复
范围内友军。外至中心四圈分别恢复至多 35／60／85／110 点；三档回復共用的 17 阶段
演出完整播放 255 native tick 后，才一次提交生命、经验、PRNG 和行动位。

## 证据与决策

- `[OF]` 祈導師 `0J` 第一／二／三层玩家菜单分别为 `1H,1I,AD`、`1H,2I,AD`、
  `2H,3I,AD,OJ`；`3I` 不属于其他职业玩家菜单。原版 AI 第三层池却为
  `2H,3I,AD,SM`，其中 `SM` 缺少参数表项，不能静默改写为玩家菜单的 `OJ`。
- `[OF]` 玩家分发表和 AI 参数表都把 `3I` 定义为同阵营目标、选择距离 6；以所选格建立
  效果半径 4 的范围图，中心至外圈值依次为 4／3／2／1。
- `[OF]` 范围值 `1/2/3/4` 的理论恢复分别为 `35/60/85/110`；每单位真实恢复为
  `min(maxLife-currentLife,理论恢复)`，施法经验只汇总真实恢复量。
- `[OF]` 令 `q=floor(totalActualHeal/50)`：`q=0` 时经验为 0 且不取随机；否则经验为
  `min(q,8)+12+random(0..1)`。合法满血施放仍完成演出并消耗行动，但模拟 PRNG 不前进。
- `[OF]` AI 先随机选择本层池项，再用共享我方选择器在距离 6 内取缺失生命最多的同阵营
  中心；完全相同取线性格扫描较后的候选，不预先最大化范围内总恢复量。
- `[OF]` AI 表现组 14 原文为“生命全.”；成功块本身不对焦中心。Web 延续
  `REMAKE-014`，在对白前把相机夹取到已准备的中心。
- `[OF]` 三档回復共用 `MAGIC/20`：17 个 `1×1` 描述符的 tile code 为
  `1,1,1,2,3,4,5,6,7,8,9,10,1,1,1,0,0`；每项批量绘制后统一等待 15 tick，
  总计 255 tick；开始时经 `0000:0220` 请求一次 `E/36`。
- `[OF]` 原版每阶段在全部同阵营占用格绘制，全部 17 阶段结束后才按范围图治疗；单位数
  不会让等待倍增。场景 37 的頭另有专用 `3I/3C` 交替路径，但不因此解冻该场景或 Boss AI。
- `[DD]` 延续 `REMAKE-019`：`stableRemake` 只在准备结果中真正允许受效的范围单位上绘制
  回復图形；`legacyStrict` 保留全同阵营占用格绘制。
- `[SR]` 延续用户修订的 `REMAKE-013`：冰封单位不能成为中心；被其他中心覆盖时真实恢复
  为 0、不改变生命、不贡献总治疗或经验，也不消费 PRNG。冰壳必须在演出期间持续投影，
  且该单位不叠加回復图形；`legacyStrict` 可保留原版仍能治疗冰雪禁用单位的行为。

## 触发与输入

- 祈導師只在第三层显示 `3I`，并按原顺序列在已实现的 `2H` 之后；第一／二层继续使用
  已闭合子集。`AD/OJ` 在各自完成前保持不可执行。
- 行动者必须未行动、未冰封且未被禁咒。中心必须为距离 6 内未冰封同阵营占用格；允许
  自身和满血中心，范围内满血单位只产生 0 真实恢复。
- 取消目标回技术菜单，再取消回动作菜单；不提交行动位、生命、经验或 PRNG。
- 确认时冻结中心、范围图、每单位真实恢复、总量、经验以及 PRNG 前后态；表现期间的
  生命读取、镜头、音频、墙钟或资源完成顺序不能改变准备结果。

## 有序规则

1. 验证祈導師第三层、行动位、冰封、禁咒、同阵营中心和选择距离 6；
2. 以中心建立半径 4 范围图，按线性格升序扫描其中同阵营单位；
3. `stableRemake` 对冰封单位记录阻挡且恢复 0；其余按范围值计算封顶恢复；
4. 汇总 `totalActualHeal`，计算 `q=floor(totalActualHeal/50)`；仅 `q>0` 时从模拟 PRNG
   取一次 `0..1`，经验为 `min(q,8)+12+随机值`；
5. 保存准备结果和 PRNG 前后态，模拟真值继续保持准备前状态；
6. 请求一次 `E/36`，按 `MAGIC/20` 的 17 项各等待 15 tick；`stableRemake` 只给未阻挡的
   实际范围单位绘制图形，冰封单位只保留冰壳；
7. 255 tick 完成后原子提交全部生命、经验、PRNG 与行动位，再进入转职／胜负／阶段链。

## AI 使用

祈導師第三层原版池为 `2H/3I/AD/SM`。逐项实施期间按原顺序只让已闭合的 `2H/3I`
进入可执行子集；`SM` 原始异常保留在证据和未来兼容边界，不映射成 `OJ`。AI 抽中 `3I`
后在距离 6 内取缺失生命最多的未冰封同阵营中心，平局取线性格较后者，不按范围总恢复量
重排。成功使用组 14“生命全.”、共同表现与同一准备／提交路径；无合法中心时进入既有
职业 fallback。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 距离 6、半径 4；冰封不可作为中心且范围治疗／图形均跳过；图形只标记实际效果范围 |
| `legacyStrict` | 距离、恢复、经验相同；冰雪禁用单位仍可治疗；图形绘制到全部同阵营占用格 |
| 可开放 Mod 字段 | 职业层级菜单、选择／效果半径、分圈恢复、经验、表现范围、资源／声音／等待；修改后必须改变规则身份 |

## 表现与可访问性

`MAGIC/20` 的十张非空原始图形形成光点聚集、花形展开和回收序列；前三项以及第 13–15
项逐字节重复 tile code 1，第 16–17 项虽为空白仍各等待 15 tick。不能只播放十张素材、
删掉重复／空白阶段或按受影响单位数串行等待。原始像素禁用平滑。加速、减少动态、静音
或 AI 对话开关只能改变墙钟、声音和提示，不能改变 17 draw、255 tick、随机调用、准备结果
和提交时点。`stableRemake` 冰壳覆盖层必须持续高于普通回復反馈。

## 验收场景

1. 三层祈導師只在第三层显示／规划 `3I`，且同层顺序为已完成子集 `2H/3I`；
2. 外至中心四个最大生命足够且均缺血单位分别恢复 35／60／85／110，总量 290、`q=5`，
   经验 `17..18`；敌方和范围外同阵营单位不变；
3. 总真实恢复 49 时经验 0 且 PRNG 不前进；50 时经验 `13..14` 且只取一次随机；
   总量至少 400 时 `q` 经验项封顶 8；
4. 满血中心合法且完整演出后消耗行动但生命、经验和 PRNG 不变；冰封中心非法，被范围
   覆盖的冰封友军不回血、不计经验、不显示回復图形且冰壳持续可见；
5. AI 在相同缺失生命中心间取线性格较后者，不因另一中心能覆盖更多伤员而改选；对白为
   组 14“生命全.”；
6. 正式玩家与 AI 均请求一次 `E/36`，保留 17 描述符与每项 15 tick；255 tick 前不提交；
7. technique-lab 可 seek 聚集、花形峰值、回收与两个空白保持阶段，显示距离 6、半径 4、
   35/60/85/110 和经验门槛；冻结单位只显示冰壳，代表性截图使用原始素材。

## 验证记录

- `scripts/generate-stage1-actions.mjs` 将玩家／AI 分发表、距离 6、半径 4、四圈恢复值、
  `MAGIC/20` 描述符、255 tick 与 `E/36` 固化为生成断言；`scripts/generate-technique-lab.mjs`
  同步登记可重放时间线和 15 tick 末帧保持。
- 模拟与竞技场单测覆盖祈導師第三层菜单／AI 池、35／60／85／110 四圈、总恢复 49／50
  的随机门槛、400 以上经验封顶、满血零随机、AI 平局取后格，以及 `REMAKE-013` 下冰封
  中心非法、范围覆盖零恢复／零经验／零随机。
- 正式竞技场覆盖玩家和 AI 的组 14 对话、17 draw／255 tick、单次 `E/36` 与提交边界；
  冰雪后接 `3I` 的组合回归确认冰封单位不回血、不叠加回復图形且冰壳持续可见。
- technique-lab 覆盖共同 `MAGIC/20` 时间线、四圈读数、空白尾段和冰封组合；代表性截图为
  `arena-recovery-3.png`、`arena-recovery-3-ai.png`、`arena-recovery-3-frozen-exception.png`、
  `technique-lab-recovery-3.png` 与 `technique-lab-recovery-3-frozen-exception.png`，均已人工查看。
- 2026-08-05 通过 37 文件／427 项 Vitest 覆盖率门禁、生产构建、第一阶段证据校验与
  169／169 项完整 Chromium 回归。
