# `SN / 禁咒` 系统规格

状态：`implemented`；原版目标、状态、经验、AI、地图表现与 `REMAKE-013` 冰封例外
已闭合，并通过模拟、正式竞技场、technique-lab、双方 AI 与代表性截图门禁；无实施必需
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
[`web-remake-rule-decisions.md#remake-007原版随机值域与调用顺序固定由可序列化-prng-供值`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-007原版随机值域与调用顺序固定由可序列化-prng-供值)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)、
[`web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心)

## 玩家目的

第三层咒術師可在七步内指定一名敌军。原版九段封印图形完整播放后，目标的禁咒计数重置
为 3；计数有效期间，手动单位不能进入技术菜单，自动技术职业也改走普通行动规划。

## 证据与决策

- `[OF]` 咒術師三层菜单分别为 `1H/SA/LA`、`1H/SA/LA/IP`、
  `1H/SA/LA/IP/SN`；SN 只在第三层出现，AI 池保持相同顺序。
- `[OF]` 玩家 SN 分发入口 `0000:CF96` 的选择距离为 7；AI 参数行 `DS:100A` 同样面向
  敌军、距离 7、选择器 `1000:0A7B`、提示组 21。
- `[OF]` 状态处理把目标 `+16h` 写为 `8003h`；只有职业 `1P/龍` 免疫，`2P/頭` 与
  `3P/手` 不在 SN 免疫表。成功施放始终取得 `14+random(0..3)` 经验，免疫也照常取一次。
- `[OF]` 禁咒计数在完整玩家＋自动＋敌方轮边界按 `3→2→1→0` 递减；有效期间阻止玩家
  技术菜单，并让技术职业 AI 跳过技术池进入普通规划。TR 清除禁咒。
- `[OF]` SN 无伤害，不读取或消费防魔，不改变生命、冰封或其他状态。
- `[OF]` `MAGIC/36` 共 9 个 `3×2` 描述符，每次 25 tick，总计 225 tick；前八次依证据
  使用六格，第九次上排三格为空、下排使用帧 `43..45`。原版无声音，表现返回后才写状态。
- `[SR]` `REMAKE-013` 只禁止普通攻击、射击、单体伤害和治疗冰封目标。SN 是负面非伤害
  状态，因此可指定冰封敌军并正常写入；冰壳继续绘制在封印图形之上。
- `[OF]` AI 抽到 SN 后先取有效防御最低、再取当前生命最低的范围内敌军，并显示原文
  “禁咒.”；龍的免疫不参与候选预过滤。
- `[DD]` 经验随机按 `REMAKE-007` 使用可保存模拟 PRNG；表现与冰壳不消费模拟随机数。

## 触发与输入

- 行动者必须为第三层咒術師，未行动、未冰封且未被禁咒；第一／二层不显示 SN。
- 目标必须为距离 7 内存活敌军；已有禁咒、满生命、冰封、龍／頭／手均可选。
- 取消目标选择返回技术菜单；取消技术菜单返回动作菜单，不提交状态、经验、行动或 PRNG。
- 确认时冻结状态与随机补丁；225 tick 表现完成后原子提交。

## 有序规则

1. 验证职业第三层、行动位、行动者禁咒／冰封、敌方目标与距离 7；冰封不限制目标；
2. 复制目标状态；若目标不是龍，把 `techniqueSeal` 重置为 3，龍则记录职业免疫；
3. 无论免疫与否恰好调用一次 PRNG，准备 `14..17` 经验；
4. 无声音地播放 `MAGIC/36` 九个 `3×2` 描述符，每项保持 25 native ticks；
5. 225 tick 后原子提交目标状态、经验、PRNG 和行动位；
6. 禁咒有效时隐藏手动技术命令，自动技术职业绕过技术池；完整轮边界饱和递减；
7. TR 提交时清除禁咒；再次施加可完整覆盖为 3。

## AI 使用

敌方第三层咒術師保留 `1H/SA/LA/IP/SN` 五槽池。抽到 SN 时在距离 7 内按有效防御最低、
当前生命最低排序；龍仍可选但只免疫状态写入。成功规划依 `REMAKE-014` 对焦并显示
“禁咒.”，随后共用正式表现和结算。side 1 自动第三层咒術師同样纳入 SN；第一／二层不纳入。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 距离 7；可保存 PRNG；冰封可受非伤害禁咒，冰壳保持最上层 |
| `legacyStrict` | 目标、数值、随机、龍免疫与表现相同；原版行动禁用位不参与 SN 选取 |
| 可开放 Mod 字段 | 职业层级、距离、状态值、免疫表、经验、AI 池／评分、帧序与等待；修改须改变规则身份 |

## 表现与可访问性

正式地图、竞技场和 technique-lab 复用固化的 `MAGIC/36` 原版像素帧；禁止平滑。原版无
声音。加速和减少动态只缩放墙钟；不得改变 9 draw、225 tick、随机次数或提交时点。冰封
目标的冰壳始终高于全部 SN 图形。

## 验收场景

1. 只有第三层咒術師菜单含 SN；距离 7 合法、距离 8 非法；
2. 普通、已有禁咒、冰封及頭／手目标均重置禁咒为 3；龍完整演出但免疫写入；
3. 成功与免疫施放都只取一次 `14..17` 经验随机，225 tick 前不提交；防魔与生命不变；
4. 手动技术菜单与技术 AI 在禁咒期间受阻；完整轮递减，TR 可清除；
5. 9 个 `3×2` 描述符按证据播放，第九次仅下排三格，总计 225 tick 且零声音；
6. 冰封目标可受禁咒，冰壳高于封印图形；
7. 敌方第三层原池可确定性抽中 SN，按低防御／低生命选敌并显示“禁咒.”；
8. 正式竞技场与 technique-lab 的帧序、锚点、末帧保持、免疫和结果读数一致。

## 实现验证

- 生成器严格提取并校验 `MAGIC/36` 九个描述符、225 tick、零音频、状态字与 AI 参数行；
- 单元测试覆盖职业层级、距离、原子提交、PRNG、防魔不消费、龍免疫、冰封例外、状态轮转、
  TR 清除、双方 AI 排序和实验室证据目录；
- Chromium 覆盖实验室普通／冰封／龍免疫、玩家正式竞技场九段表现和敌方原生五槽抽取／
  “禁咒.”提示；四张代表截图已人工检查。
