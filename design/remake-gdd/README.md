# 《天使帝国 II》Web 复刻版设计文档

版本：Draft 0.8

日期：2026-08-11

阶段：第 0–16 关及既有非连续战斗已接受；内部第 17 关“龍塔第四層”已验证、等待试玩；stage 18 及后续内容冻结

开发状态：全战役设计仍为 `implementationFrozen=true`；第 0–9 关与内部第 11 关已获用户
接受；内部第 10 关已获用户试玩接受，`M20-BAL-01` 留待未来平衡调整；内部第 12–16 关已获
用户接受；M32/M33 已按 `REMAKE-051` 实现内部第 17 关，内部 stage 18 及后续运行时仍冻结

## 文档目的

本目录定义 Web 复刻版要提供的玩法、剧情节奏、数值规则、UI 体验和 Mod 边界。它不复述 DOS 程序的实现方式，也不包含 Phaser 架构或代码任务。

原版事实仍以 [`reverse/gdd/original-gdd.md`](../../reverse/gdd/original-gdd.md) 为唯一取证基线；本目录只回答“玩家在复刻版中会经历什么”以及“原版怪癖在默认规则中如何处理”。

## 证据与决策标签

所有具有约束力的条目应使用以下标签之一：

| 标签 | 含义 | 是否可直接作为默认玩法 |
| --- | --- | --- |
| `[OF]` | 已由原程序、资源或实机确认的原版事实 | 需再经过规则集政策判断 |
| `[SR]` | 已确认的 `stableRemake` 默认规则 | 是 |
| `[DD]` | 为 Web 复刻新增的产品/体验决策 | 是，但必须有验收标准 |
| `[H]` | 待试玩验证的设计假设 | 否，验证后转为 `[DD]` 或废弃 |
| `[TBD]` | 证据或产品选择尚未完成 | 否，不得让实现者自行猜测 |

如果 `[OF]` 与 `[SR]` 不同，必须同时保留两者并链接规则决策记录，不能改写原版事实来“消除”差异。

## 当前文档地图

| 文档 | 回答的问题 | 当前状态 |
| --- | --- | --- |
| [`00-product-vision.md`](00-product-vision.md) | 复刻为何存在、核心体验是什么 | Draft 0.1 |
| [`01-ruleset-policy.md`](01-ruleset-policy.md) | 忠实、修复与 Mod 如何分层 | Draft 0.1 |
| [`02-game-flow.md`](02-game-flow.md) | 从标题到战后、从回合到行动的完整循环 | Draft 0.1 |
| [`03-battle-rules.md`](03-battle-rules.md) | 战斗规则的产品级合同；含普通攻击公式、射击固定伤害与职业特例 | Draft 0.2 |
| [`04-units-progression-balance.md`](04-units-progression-balance.md) | 兵种、成长、转职与平衡边界；含 39 职业固定三行与第三行后成长真值表 | Draft 0.2 |
| [`05-ai-and-difficulty.md`](05-ai-and-difficulty.md) | 敌方意图、AI 修复与难度 | Draft 0.1 |
| [`06-campaign-and-narrative.md`](06-campaign-and-narrative.md) | 关卡与剧情如何编排 | Draft 0.1 |
| [`07-ui-ux-and-presentation.md`](07-ui-ux-and-presentation.md) | 原版 UI 如何复现并适配浏览器 | Draft 0.2 |
| [`08-mod-policy.md`](08-mod-policy.md) | 哪些内容可改、如何保持可追溯 | Draft 0.1 |
| [`09-design-acceptance.md`](09-design-acceptance.md) | 何时可以结束设计冻结 | Draft 0.3 |
| [`vertical-slices/stage-00.md`](vertical-slices/stage-00.md) | 第 0 关的玩法合同与实现验收 | Draft 0.6 / 自动验收通过 |
| [`vertical-slices/stage-01.md`](vertical-slices/stage-01.md) | 首个交互部署、技术扩展与首领目标关 | Draft 0.3 / 已接受 |
| [`vertical-slices/stage-02.md`](vertical-slices/stage-02.md) | 固定续关、友军自动阶段与首领目标关 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-03.md`](vertical-slices/stage-03.md) | 双队汇合、行为 3/4 编队、双保护目标与僧侣首领 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-04.md`](vertical-slices/stage-04.md) | 交互部署、独立结界引导者、外圈减半与到达区胜利 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-05.md`](vertical-slices/stage-05.md) | 双首领任一击破、普通战后保存与场景 42 传送门桥接 | Draft 0.2 / 已接受 |
| [`vertical-slices/stage-06.md`](vertical-slices/stage-06.md) | 反向关前流程、西艾蕾首领目标、动态游骑兵台阵与第 7 关边界 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-07.md`](vertical-slices/stage-07.md) | 双背景营地剧情、双固定部署、萊莉首领目标与第 8 关边界 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-08.md`](vertical-slices/stage-08.md) | 三背景营地剧情、固定八名玩家、全灭目标、SAY 157 与第 9 关边界 | Draft 0.3 / 已接受后优化 |
| [`vertical-slices/stage-09.md`](vertical-slices/stage-09.md) | 多莉引路、双胜利／双保护、行为 12 安全终点与非连续 stage 11 路由 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-11.md`](vertical-slices/stage-11.md) | 固定撤离战、每轮南端增援、多莉剧情离场、蘇蘭達登船目标与 stage 10 路由 | Draft 0.2 / 已接受 |
| [`vertical-slices/stage-10.md`](vertical-slices/stage-10.md) | BK/10 关前剧情、1–13 人飞船部署、五名追兵、全灭／妮雅保护与 stage 12 路由 | Draft 0.1 / 已接受；平衡待办不阻塞 |
| [`vertical-slices/stage-12.md`](vertical-slices/stage-12.md) | BK/10–14 坠船剧情、1–9 人沼泽部署、五个水戰士根槽、职业分裂与 stage 13 路由 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-13.md`](vertical-slices/stage-13.md) | BK/15 突击会议、1–12 人部署、两名水戰士新成员、九名守军、瑪西爾目标与 stage 14 路由 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-14.md`](vertical-slices/stage-14.md) | 1–10 人部署、SAY 33 开战对白、芳率七敌、首领目标、无增援与 stage 15 路由 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-15.md`](vertical-slices/stage-15.md) | 1–10 人部署、SAY 34 开战对白、蘭率十敌、首领目标、无增援与 stage 16 路由 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-16.md`](vertical-slices/stage-16.md) | 1–10 人部署、SAY 35 开战对白、莎率十三敌、首领目标、无增援与 stage 17 路由 | Draft 0.1 / 已接受 |
| [`vertical-slices/stage-17.md`](vertical-slices/stage-17.md) | 1–10 人部署、SAY 36 开战对白、倩率十二敌、首领目标、无增援与 stage 18 路由 | Draft 0.1 / 已验证待试玩 |
| [`ui/stage-00-ui-flow.md`](ui/stage-00-ui-flow.md) | 第 0 关 UI 状态、输入语义与低保真构图 | Draft 0.7 / 已接受 |
| [`ui/stage-01-ui-flow.md`](ui/stage-01-ui-flow.md) | 第 1 关部署状态、输入焦点与低保真构图 | Draft 0.1 / 正式接入与自动验收完成 |
| [`systems/promotion.md`](systems/promotion.md) | 动作后转职扫描、强制选择与原子提交 | M00.5 / 已接受 |
| [`systems/action-resolution.md`](systems/action-resolution.md) | 普通、射击、技术共享的预览、准备、表现与提交边界 | M00.6 / 已接受 |
| [`systems/shooting.md`](systems/shooting.md) | 弓兵射程、伤害、经验、魔弓完整箭道控制、AI 与棋盘表现 | M00.6/M14.7 / 已验证 |
| [`systems/techniques-stage0.md`](systems/techniques-stage0.md) | 修女初級炎暴与初級治療 | M00.6 / 已接受 |
| [`systems/status-foundation.md`](systems/status-foundation.md) | 防魔消费与 v6 最小状态边界 | M00.6 / 已接受 |
| [`systems/deployment-stage1.md`](systems/deployment-stage1.md) | 第 1 关固定/可选单位与部署提交 | M02 / 已实现并通过自动验收 |
| [`systems/techniques-stage1.md`](systems/techniques-stage1.md) | 复用 `1F/1H`，新增 `1L/1C` 与敌方修女调度 | M02 / 已实现并通过自动验收 |
| [`systems/techniques-stage3.md`](systems/techniques-stage3.md) | 僧侣 `1H/1I`、范围回復、AI 与 255 tick 表现 | M04 / 已接受 |
| [`systems/force-ai-groups.md`](systems/force-ai-groups.md) | 显式军团控制权、独立友军 AI、策略与跨军团目标 | M04 框架提取 / 已验证 |
| [`systems/expert-enemy-ai.md`](systems/expert-enemy-ai.md) | 双方共享自动行动专家效用、射手／魔弓、冰雪排程、PRNG 与显式策略边界 | M14.5–M14.9 / 已验证 |
| [`systems/force-field-escort.md`](systems/force-field-escort.md) | 路线尝试、移动安全区、生命减半与表现边界 | M06 / 已实现并通过自动验收 |
| [`systems/technique-implementation-sequence.md`](systems/technique-implementation-sequence.md) | 33 项技术的机器顺序、逐项门禁与完成状态 | 系统例外 / 已验证 |
| [`systems/technique-aa-attack-up.md`](systems/technique-aa-attack-up.md) | 攻击提升、完整轮计数、双方 AI、原版双格光柱与冰封例外 | 已实现并通过完整门禁 |
| [`systems/technique-ad-defense-up.md`](systems/technique-ad-defense-up.md) | 防御提升、完整轮计数、双方 AI、原版四格盾牌与冰封例外 | 已实现并通过完整门禁 |
| [`systems/technique-fm-magic-guard.md`](systems/technique-fm-magic-guard.md) | 防魔、一次性魔法保护、原版 AI 孤项安全修复、AA 共用光焰与冰封例外 | 已实现并通过完整门禁 |
| [`systems/technique-ip-poison.md`](systems/technique-ip-poison.md) | 施毒、轮边界折半、首领免疫、双方 AI、两段毒雾与冰封跳伤例外 | 已实现并通过完整门禁 |
| [`systems/technique-la-confusion.md`](systems/technique-la-confusion.md) | 混亂、原版 FFh 自动调度、玩家手动例外、首领免疫、无声鬼脸／星光与冰封例外 | 已实现并通过完整门禁 |
| [`systems/technique-oj-prayer.md`](systems/technique-oj-prayer.md) | 祈禱、全图逐单位随机、渐进提交、程序图元、原版 SM 空槽与冰封生命例外 | 已实现并通过完整门禁 |
| [`systems/technique-sa-attack-down.md`](systems/technique-sa-attack-down.md) | 攻击下降、攻升相消、双方 AI、原版下坠光束与冰封例外 | 已实现并通过完整门禁 |
| [`systems/technique-sd-defense-down.md`](systems/technique-sd-defense-down.md) | 防御下降、防升相消、双方 AI、原版四格破盾与冰封例外 | 已实现并通过完整门禁 |
| [`systems/technique-sn-spell-seal.md`](systems/technique-sn-spell-seal.md) | 禁咒、技术阻断、龍免疫、双方 AI、原版九段无声封印与冰封例外 | 已实现并通过完整门禁 |
| [`systems/technique-lab.md`](systems/technique-lab.md) | 任意敌我职业配置、全部 33 项原版地图表现与冰封净化 | 开发工具 / 已实现 |
| [`systems/class-showdown-lab.md`](systems/class-showdown-lab.md) | 35 组常规职业同兵种相邻编队、统一等级与平原正式战斗 | 开发工具 / 已实现 |
| [`systems/promotion-lab.md`](systems/promotion-lab.md) | 12 组可转职来源的临界经验、敌我升级边界与正式候选 UI | 开发工具 / 已实现 |
| [`systems/debug-harness.md`](systems/debug-harness.md) | 按关选择、快速结算与确定性测试场景 | 开发工具 / 已实现 |
| [`systems/portrait-animation.md`](systems/portrait-animation.md) | 全战役肖像、眨眼、逐字口型与生成目录 | 表现系统 / 已实现并随第 1 关接受 |

## 写作规范

每个系统规格至少要说明：

1. 玩家目的与可感知结果；
2. 触发条件、合法输入和目标；
3. 规则顺序与整数取整方式；
4. 消耗、状态变化、失败与边界情况；
5. AI 如何使用同一规则；
6. UI 必须反馈什么；
7. `stableRemake`、`legacyStrict` 与 Mod 的差异；
8. 可重复的验收场景；
9. 原版证据链接。

数值表、地图、对白和资源清单应链接机器生成文件，不在这里手抄第二份“真值”。新关卡可使用 [`templates/stage-spec-template.md`](templates/stage-spec-template.md)；新系统可使用 [`templates/system-spec-template.md`](templates/system-spec-template.md)。

## 设计阶段边界

- 可以：复核原版证据、制定玩家体验、定义规则顺序、设计 UI 流程、建立验收场景、提出并记录现代化便利功能。
- 不可以：把 DOS 内存结构当成 Web 领域模型、为了方便编码而改玩法、在 `[TBD]` 上自行补规则。
- 第 0 关已由用户明确授权作为首个实现例外；其 Phaser 工程、独立模拟与自动验收见仓库根目录 [`README.md`](../../README.md)。
- 第 1 关已由用户明确授权作为有界 M02 实现例外；只解除其合同列出的部署、内容、
  `1F/1H/1L/1C`、`REMAKE-012` AI、`REMAKE-013` 冰封、事件、v11（含 v2–v10 迁移）和
  路由范围。
- 第 2 关已由用户明确授权作为有界 M03 实现例外；只解除其合同列出的固定阵容、友军
  自动阶段、既有职业动作、首领目标、剧情/音乐、v13（含 v2–v12 迁移和入关快照）及
  `stage-03` 路由。
- 第 3 关已由用户明确授权作为有界 M04 实现例外；只解除其合同列出的固定阵容、行为
  `2/3/4` 友军、双保护目标、僧侣 `1H/1I`、剧情/音乐、v14 和 `stage-04` 路由。
- 第 4、5 关已于 2026-08-08 获用户接受；第 6 关、`REMAKE-028` 与 v20 随后作为有界例外
  实现，并于 2026-08-09 获用户接受。第 7 关 M12 已实现 `REMAKE-030` 与 v21 并于同日获
  用户试玩接受；第 8 关 M14 按 `REMAKE-032` 补播 SAY 157、升级 v23 后也已获用户接受；
  `REMAKE-033–037` 专家 AI、魔弓完整箭道、冰雪反制与双方共享默认自动规划已获授权并
  适用于全部已开放关卡；玩家在主目标后指定魔弓线路，冰雪最外圈外推到值 0，无击杀时
  次优先有效命中巫師；友军 NPC／“自由行动”与敌军共享专家规则，但防区、路线和跟随
  保持显式覆盖。`REMAKE-038` 进一步把第 8 关八名 side 1 全部改为玩家控制，取消本关
  NPC 友军；v29 保存身份无损迁移 v28。用户随后接受第 8 关并授权推进第 9 关；M15 已闭合
  B/0019、SAY `22/23/91`、`REMAKE-039/040` 与 stage 11 路由；M16 通过门禁后获用户接受。
  M17/M18 又按 B/0023、SAY `24–27/93/128/129` 与 `REMAKE-041` 实现内部第 11 关
  “拯救蘇蘭達”、每轮南端无限可复用增援、多莉剧情离场、蘇蘭達登船和 v32；用户于
  2026-08-10 试玩接受。M19/M20 随后解冻内部 stage 10“飛船上遭遇敵人”，闭合 B/0021、
  SAY `28/94/129/130`、`REMAKE-042`、v33 与 stage 12 冻结边界。
  用户接受后另登记 `M20-BAL-01`；M21/M22 随后闭合 B/0025、SAY `29–31/95/130/131`、
  `REMAKE-043`、水戰士正式战役分裂、v34 与 stage 13 路由；用户已接受。M23/M24 随后
  闭合 B/0027、SAY `32/96/131/132`、`REMAKE-046`、v35 与 stage 14 路由；用户已接受。
  M25/M26 随后闭合 B/0029、SAY `33/97/132/133`、`REMAKE-047`、v36 与 stage 15 路由；
  用户已接受。M27/M28 随后闭合 B/0031、SAY `34/98/133/134`、`REMAKE-048`、v37 与
  stage 16 冻结边界。
