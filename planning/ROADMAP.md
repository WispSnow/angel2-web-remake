# 开发路线

更新日期：2026-08-10

本路线按“首次建立并验收一种能力”推进，不按关卡数量估算百分比。任何被冻结阶段都必须先完成纸面合同并获得明确授权。

## 路线总览

| 顺序 | 阶段 | 当前状态 | 核心结果 |
| ---: | --- | --- | --- |
| M00 | 第 0 关人工接受 | `accepted` | 首个垂直切片由用户试玩并接受 |
| M00.5 | 转职与多关架构准备 | `accepted` | 第 0 关可达转职、职业目录、通用状态边界与存档 v5 获用户接受 |
| M00.6 | 首层职业行动闭环 | `accepted` | 弓兵射击、修女技术、最小状态与存档 v6 获用户接受 |
| M00.7 | 全职业普通全屏动画 | `accepted` | 0–38、右侧限定记录与原生分层生命条获用户接受 |
| M01 | 第 1 关实施准备 | `accepted` | P1–P6 纸面与接口方案完成，用户批准进入 M02 |
| M02 | 第 1 关实现 | `accepted` | 自动门禁与用户普通入口手动通关均通过 |
| M03 | 第 2 关实现 | `accepted` | 固定阵容、友军自动阶段、首领目标、续关存档与 stage 3 边界获用户接受 |
| M04 | 第 3 关实现 | `accepted` | 行为 3/4 编队、双保护目标、僧侣 1I、v14 与 stage 4 边界通过自动门禁和用户人工验收 |
| M04.5 | 第 4 关前框架收口 | `verified` | 关卡装配、当前存档 schema、固定战斗构造、动作表现注册与 AI 类型依赖完成收口并通过完整门禁 |
| M05 | 第 4 关纸面合同 | `specified` | 交互部署、独立结界引导者、外圈生命减半、到达区胜利、v15 与 stage 5 边界已闭合，代码仍冻结 |
| M06 | 第 4 关有界实现 | `accepted` | 内容、通用部署、三军团、结界脉冲、存档与普通入口获用户接受 |
| M07 | 第 5 关纸面合同 | `specified` | 双首领任一击破、敌方角色机器目录、v19、场景 42 传送门桥接与 stage 6 边界闭合 |
| M08 | 第 5 关有界实现 | `accepted` | 第 5 关、场景 42、v19 与用户试玩接受完成 |
| M09 | 第 6 关纸面合同 | `specified` | 反向关前流程、西艾蕾目标、动态台阵、v20 与 stage 7 边界闭合 |
| M10 | 第 6 关有界实现 | `accepted` | 第 6 关、动态游骑兵台阵、v20 与用户试玩接受完成 |
| M11 | 第 7 关纸面合同 | `specified` | 双背景营地剧情、双固定部署、萊莉目标、v21 与 stage 8 边界闭合 |
| M12 | 第 7 关有界实现 | `accepted` | 第 7 关、普通胜利保存、v21、调试、自动／视觉与用户试玩验收完成 |
| M13 | 第 8 关纸面合同 | `specified` | 三背景剧情、固定 8 对 11、友军自动阶段、全灭目标、v22 与 stage 9 边界闭合 |
| M14 | 第 8 关有界实现 | `accepted` | `M14-FB-01 / REMAKE-032` 补播、v23、迁移与视觉门禁通过，用户复验接受 |
| M14.5 | 专家敌方 AI | `verified` | `REMAKE-033` 统一效用、动态行动者重选、四档共用策略及 v24/v23 迁移通过定向门禁 |
| M14.6 | 专家射手与冰雪排程 | `verified` | `REMAKE-034` 安全射程边缘、魔弓线路期望、冰雪末位／残军门禁及 v25/v24 迁移通过定向门禁 |
| M14.7 | 魔弓完整箭道控制 | `verified` | `REMAKE-035` 玩家指定线路、专家 AI 确切线路及 v26/v25 迁移通过定向门禁 |
| M14.8 | 冰雪反制与巫師仇恨 | `accepted` | `REMAKE-036` 外圈外推、巫師第二优先级带及 v27/v26 迁移通过定向门禁和用户复验 |
| M14.9 | 双方共享自动行动专家 AI | `accepted` | `REMAKE-037` 统一友军 NPC／自由行动／敌军默认规划器、保留显式策略并升级 v28；用户复验通过 |
| M14.10 | 第 8 关全员玩家控制 | `accepted` | `REMAKE-038` 将八名 side 1 合并为玩家军团、取消本关 NPC 友军并升级 v29；用户复验接受 |
| M15 | 第 9 关纸面合同 | `specified` | 多莉引路、双胜利／双保护、行为 12 安全终点、v30 与 stage 11 路由闭合 |
| M16 | 第 9 关有界实现 | `accepted` | 证据生成内容、2–9 人部署、多莉独立路线、十四名敌军、v30 与用户试玩接受完成 |
| M17 | 内部第 11 关纸面合同 | `specified` | 固定撤离战、每轮南端增援、多莉剧情离场、蘇蘭達到达区、REMAKE-041、v32 与 stage 10 边界闭合 |
| M18 | 内部第 11 关有界实现 | `accepted` | 八名玩家单位、飞马追兵／无限可复用增援、SAY 24–27、v32 与用户试玩验收完成 |
| M19 | 内部第 10 关纸面合同 | `specified` | BK/10、1–13 人部署、五名追兵、全灭／保护目标、REMAKE-042、v33 与 stage 12 边界闭合 |
| M20 | 内部第 10 关有界实现 | `accepted` | SAY 28、部署、五名追兵、v33/v32 与用户试玩通过；`M20-BAL-01` 留待未来平衡调整 |
| M21 | 内部第 12 关纸面合同 | `specified` | 坠船剧情、1–9 人部署、五个水戰士根槽、无关卡增援、职业分裂、REMAKE-043 与 stage 13 边界闭合 |
| M22 | 内部第 12 关有界实现 | `accepted` | SAY 29–31、BK/10–14、水戰士正式战役分裂、v34/v33 与用户试玩通过 |
| M23 | 内部第 13 关纸面合同 | `specified` | BK/15、1–12 人部署、两名水戰士新成员、九名守军、无增援、REMAKE-046 与 stage 14 边界闭合 |
| M24 | 内部第 13 关有界实现 | `accepted` | SAY 32、瑪西爾目标、v35/v34、调试与自动／视觉门禁及用户试玩通过 |
| M25 | 内部第 14 关纸面合同 | `specified` | B/0029、1–10 人部署、SAY 33、芳率七敌、无增援、REMAKE-047 与 stage 15 边界闭合 |
| M26 | 内部第 14 关有界实现 | `accepted` | SAY 33、芳目标、v36/v35、调试、自动／视觉及用户试玩通过 |
| M27 | 内部第 15 关纸面合同 | `specified` | B/0031、1–10 人部署、SAY 34、蘭率十敌、无增援、REMAKE-048 与 stage 16 边界闭合 |
| M28 | 内部第 15 关有界实现 | `accepted` | SAY 34、蘭目标、v37/v36、调试、自动／视觉及用户试玩通过 |
| M29 | 内部第 16 关纸面合同 | `specified` | B/0033、1–10 人部署、SAY 35、莎率十三敌、无增援、REMAKE-051 与 stage 17 边界闭合 |
| M30 | 内部第 16 关有界实现 | `verified` | SAY 35、莎目标、v38/v37、调试与自动／视觉门禁通过，待用户试玩 |
| M31 | 第 1–15 关胜利条件原文取值更正 | `verified` | REMAKE-051 改用 DS:1273 表；第 1/2/3 关首领改为娜米／萊莉／梅蒂，待用户复验 |
| M04+ | 职业与技术能力切片 | `verified` | 33 项玩家技术、常规职业、终阶特性、水戰士分裂与三类组合实验表面完成自动门禁 |
| Campaign | 全战役扩展 | `frozen` | 在通用边界稳定后逐关固化内容与验收 |

## M00：第 0 关人工接受

计划见 [`milestones/M00-stage-00-acceptance.md`](milestones/M00-stage-00-acceptance.md)。

退出条件是用户完成普通入口试玩，并接受当前体验或明确登记接受前必须修复的问题。自动测试通过是必要条件，但不能代替人工接受。

## M01：第 1 关实施准备

计划见 [`milestones/M01-stage-01-enablement.md`](milestones/M01-stage-01-enablement.md)。

该阶段只闭合实施边界、部署/技术系统规格、v7 存档策略和验收映射。纸面产物已于
2026-08-01 完成，用户随后明确批准有界 M02；新增射击、完整状态生命周期或
`1F/1H/1L/1C` 之外的职业能力仍未授权。

## M02：第 1 关实现

详细计划见 [`milestones/M02-stage-01-implementation.md`](milestones/M02-stage-01-implementation.md)。
用户已于 2026-08-01 授权，以下实施项现均已完成自动验收：

1. 把已建立的 `StageDefinition`、战役状态和内容版本边界扩展到获授权的下一切片；
2. 建立与渲染器无关的部署模拟；
3. 按 `REMAKE-009` 复用统一的 `1F/1H` 动作定义，新增 `1L/1C` 与敌方修女调度；
4. 从逆向机器产物生成第 1 关稳定运行时内容；
5. 建立 v7 并确定性迁移 v2–v6，覆盖 stage 1 战中、胜利和 stage 2 边界；
6. 以玩家可见控件完成普通第 0 关到第 1 关入口，并以有界场景覆盖第 1 关到
   `stage-02` 边界；完整普通入口第 1 关通关留给人工验收。

每一步均保持第 0 关现有合同与真实通关路径不回归。用户于 2026-08-03 从普通 `/`
完成第 1 关手动通关并确认体验，M02 已接受。

## M03：第 2 关实现

详细计划见 [`milestones/M03-stage-02-implementation.md`](milestones/M03-stage-02-implementation.md)。

第 2 关不新增技术族，以已接受的战斗系统验证下一层架构：原版固定 `9 vs 5` 阵容、
三名手动角色与六名自动友军的分阶段调度、击败蘭／保护妮雅、回合 1 与胜利剧情、
原版双方音乐、v13 战中恢复／入关快照及 `stage-03` 明确边界。实现、自动门禁与用户验收
均已完成。

## M04：第 3 关实现

详细计划见 [`milestones/M04-stage-03-implementation.md`](milestones/M04-stage-03-implementation.md)。

第 3 关以固定 `13 vs 12` 阵容首次验证行为 `3/4` 领队／跟随编队、希蜜／黛西双保护
目标与敌方僧侣首领。M04 只新增本关消费的初級回復 `1I`，闭合其范围治疗、经验、AI、
255 tick 地图表现、v14 战中恢复和 `stage-04` 边界。实现、完整自动门禁与代表性截图检查
均已完成，用户于 2026-08-04 确认人工验收；第 4 关继续冻结。

## M04.5：第 4 关前框架收口

实施记录见
[`milestones/M04.5-stage-04-framework-consolidation.md`](milestones/M04.5-stage-04-framework-consolidation.md)，
原始审计与退出门槛见
[`audits/stage-04-framework-readiness.md`](audits/stage-04-framework-readiness.md)。用户已于 2026-08-04
授权按建议推进；统一关卡运行时、当前存档与历史迁移分层、固定关卡构造器、语义动作表现目录、
AI 合同解环、调试目录、终点 UI 和生成编排均完成，完整自动门禁与代表性截图审计通过。
本里程碑没有实现第 4 关内容或玩法。

## M05：第 4 关纸面合同

详细记录见 [`milestones/M05-stage-04-specification.md`](milestones/M05-stage-04-specification.md)。
用户于 2026-08-04 授权按建议继续建立规格；B/0009 固定／可选部署、三军团控制权、行为
`12` 路线与外圈当前生命减半、到达 `0..174` 胜利、妮雅／葛蒂拉斯双保护、SAY `7/8/174`、
`REMAKE-023` 目标反馈、v15 与 `stage-05` 冻结边界现均无实施必需 `[TBD]`。

M05 状态为 `specified`，没有修改运行时。用户已于 2026-08-04 明确授权 M06；实施必须复用
M04.5 的唯一 manifest、生成内容、特殊行动目录、显式军团与存档分层，不能回到逐关控制器分支。

## M06：第 4 关有界实现

详细计划见 [`milestones/M06-stage-04-implementation.md`](milestones/M06-stage-04-implementation.md)。
本里程碑以 M05 的 `S04-A–L` 为验收合同，实现 `stage-04` 内容、交互部署、三军团、
`route-pulse`、到达区胜利、v15、调试场景和普通入口。实现和完整自动门禁已于
2026-08-04 完成，用户于 2026-08-08 确认人工接受并授权推进 M08。

## M07：第 5 关纸面合同

详细记录见 [`milestones/M07-stage-05-specification.md`](milestones/M07-stage-05-specification.md)。
用户于 2026-08-08 要求在复核全职业、全技能和测试场景后开始推进第 5 关。B/0011 的
固定 1 + 可选 7 部署、十四名敌军、汀塔琪／萊茵任一击破、妮雅保护、SAY `9/10`、
`REMAKE-027`、v19，以及 B/0085 / stage 42 的即时胜利、传送门时间线和 stage 6 路由现均
无实施必需 `[TBD]`。M07 本身没有创建 Stage 5 运行时、存档 schema 或玩家可达入口；
用户关闭 M06 门禁并授权后，实施转入 M08。

## M08：第 5 关有界实现

详细记录见 [`milestones/M08-stage-05-implementation.md`](milestones/M08-stage-05-implementation.md)。
第 5 关 B/0011 内容、1–6 人部署、十四名敌军、双首领任一击破、SAY `9/10`、v19 以及
场景 42 的十人台阵、两次脚本移动、SAY `11/18/20/19`、304 tick `4L`、非死亡离场和
`stage-06` 路由均已实现。定向单元、Chromium、生产构建、证据校验与代表性视觉审计完成；
用户于 2026-08-08 确认测试成功并授权推进第 6 关。

## M09：第 6 关纸面合同

详细记录见 [`milestones/M09-stage-06-specification.md`](milestones/M09-stage-06-specification.md)。
B/0013 的固定妮雅 + 可选十二／最多九人部署、九名敌军、西艾蕾机器目标、SAY
`14/15/16/115`、`BK/5→BK/31`、动态游骑兵台阵、`REMAKE-028`、v20 与 stage 7 冻结
边界均已闭合，无实施必需 `[TBD]`。

## M10：第 6 关有界实现

详细记录见 [`milestones/M10-stage-06-implementation.md`](milestones/M10-stage-06-implementation.md)。
第 6 关生成内容、1–9 人部署、九名敌军、西艾蕾目标、两张关前背景、胜利后九单位台阵、
阿曼妮脚本移动、SAY `115`、v20 与 `stage-07` 冻结路由均已实现。定向 Vitest、Stage 5/6
Chromium、调试目录、生产构建与代表性视觉审计完成；用户于 2026-08-09 人工试玩接受。

## M11：第 7 关纸面合同

详细记录见 [`milestones/M11-stage-07-specification.md`](milestones/M11-stage-07-specification.md)。
B/0015 的固定妮雅／希蜜 + 可选十一／最多七人部署、十一名敌军、萊莉机器目标、SAY `17`、
`BK/6→BK/7`、`REMAKE-030`、v21 与 stage 8 冻结边界均已闭合，无实施必需 `[TBD]`。

## M12：第 7 关有界实现

详细记录见 [`milestones/M12-stage-07-implementation.md`](milestones/M12-stage-07-implementation.md)。
用户于 2026-08-09 接受 M10 并明确授权；本里程碑按 `S07-A–K` 实现第 7 关证据内容、
关前剧情、2–7 人部署、十一名敌军、普通保存、v21、调试场景与 `stage-08` 冻结路由。
定向单元、Stage 6/7 Chromium、生产构建与双背景／部署／战场视觉审计均已通过；用户于
2026-08-09 确认测试成功并接受。

## M13：第 8 关纸面合同

详细记录见 [`milestones/M13-stage-08-specification.md`](milestones/M13-stage-08-specification.md)。
`B/0017`、SAY `21/156/157`、固定三名玩家 + 五名自动友军、十一名敌军、全灭／蘇蘭達
目标、`REMAKE-031`、原 v22 与 stage 9 冻结边界均已闭合；试玩后新增 `REMAKE-032` 由 M14
以 v23 补播 SAY 157，无实施必需 `[TBD]`。

## M14：第 8 关有界实现

详细记录见 [`milestones/M14-stage-08-implementation.md`](milestones/M14-stage-08-implementation.md)。
用户接受 M12 并明确要求继续推进；本里程碑已按 `S08-A–K` 接入第 8 关，原定向门禁通过。
用户试玩后要求把原版 SAY 157 漏播作为 bug 修复；`M14-FB-01 / REMAKE-032` 已通过共享
胜利剧情接入、v23 与 v22 迁移、定向 Chromium、生产构建和完整文字截图审计，并于
2026-08-09 获用户复验接受。

## 后续能力切片

M14.5 记录见 [`milestones/M14.5-expert-enemy-ai.md`](milestones/M14.5-expert-enemy-ai.md)。
用户明确决定不增加 AI 难度选项，四档战役难度统一使用专家敌方规划器；`REMAKE-033` 已
把常规敌方动作纳入统一效用，并让调度器在每次提交后依据最新状态重选下一行动者；当前
保存身份升级为 v24，v23 无损迁移。

M14.6 记录见 [`milestones/M14.6-ranged-and-ice-ai.md`](milestones/M14.6-ranged-and-ice-ai.md)。
`REMAKE-034` 把敌方射手落点改为安全的有效射程边缘，并只把实际选择冰雪的单位延后；不加
近期冰封衰减，纯冰雪残军禁用冰雪。保存身份升级为 v25，v24 无损迁移。

M14.7 记录见 [`milestones/M14.7-directed-magic-arrow.md`](milestones/M14.7-directed-magic-arrow.md)。
`REMAKE-035` 把魔弓箭道从原版随机回溯改为玩家在主目标后指定完整线路，专家 AI 逐线路
比较并提交最高价值确切线路；线路选择不读取 PRNG。保存身份升级为 v26，v25 无损迁移。

M14.8 记录见 [`milestones/M14.8-ice-counterplay-wizard-focus.md`](milestones/M14.8-ice-counterplay-wizard-focus.md)。
`REMAKE-036` 让冰雪最外圈继续尝试外推到值 0 格，并把有效命中巫師设为无确定击杀时的
第二优先级带。保存身份升级为 v27，v26 无损迁移；用户已试玩确认。

M14.9 记录见 [`milestones/M14.9-shared-automatic-expert-ai.md`](milestones/M14.9-shared-automatic-expert-ai.md)。
`REMAKE-037` 让友军 NPC、玩家“自由行动”和敌军默认共用同一专家规划器与动态行动者
重选；第 3 关防区、路线脉冲和“跟随主将”保持显式覆盖。保存身份升级为 v28，v27
无损迁移；用户已试玩确认。

M14.10 记录见 [`milestones/M14.10-stage8-all-player-control.md`](milestones/M14.10-stage8-all-player-control.md)。
`REMAKE-038` 将第 8 关八名 side 1 全部并入蘇蘭達玩家军团，不再设置五名游骑兵 NPC；
只有玩家主动选择集团命令时才交给共享专家 AI。保存身份升级为 v29，v28 无损迁移；
用户复验接受。

M15/M16 记录见 [`milestones/M15-stage-09-specification.md`](milestones/M15-stage-09-specification.md)
与 [`milestones/M16-stage-09-implementation.md`](milestones/M16-stage-09-implementation.md)。第 9 关
按 B/0019、SAY `22/23`、`REMAKE-039/040` 接入 2–9 人部署、多莉独立路线、双胜利／双保护、
十四名敌军、v30 与非连续 stage 11 路由；定向自动与视觉门禁通过，用户已试玩接受。

M17/M18 记录见 [`milestones/M17-stage-11-specification.md`](milestones/M17-stage-11-specification.md)
与 [`milestones/M18-stage-11-implementation.md`](milestones/M18-stage-11-implementation.md)。内部
第 11 关按 B/0023、完整回合特殊生成链、SAY `24–27` 与 `REMAKE-041` 接入初始 9 对 1、
每轮一名南端无限可复用增援、剧情后多莉离场、八名玩家单位、蘇蘭達登船目标、v32 与
stage 10 路由；自动与视觉门禁通过，并于 2026-08-10 获用户接受。

用户于 2026-08-10 接受 M18。M19/M20 记录见
[`milestones/M19-stage-10-specification.md`](milestones/M19-stage-10-specification.md) 与
[`milestones/M20-stage-10-implementation.md`](milestones/M20-stage-10-implementation.md)。内部
第 10 关按 B/0021、SAY `28/94/129/130` 与 `REMAKE-042` 接入 BK/10 关前剧情、固定妮雅、
十九候选十二格、最多十三人、五名追兵、全灭／保护目标、v33/v32 与 stage 12 冻结路由；
自动、Chromium、视觉、构建和文档门禁通过，并获用户试玩接受；五敌压力偏低另登记为
`M20-BAL-01`，不阻塞 M21/M22。

M21/M22 记录见 [`milestones/M21-stage-12-specification.md`](milestones/M21-stage-12-specification.md)
与 [`milestones/M22-stage-12-implementation.md`](milestones/M22-stage-12-implementation.md)。内部
第 12 关按 B/0025、SAY `29–31/95/130/131` 与 `REMAKE-043` 接入 BK/10–14、固定妮雅、
十九候选八格、最多九人、五个水戰士根槽、职业分裂、v34/v33 与 stage 13 冻结路由；
自动、Chromium、视觉、构建、证据和文档门禁已通过，并获用户试玩接受。

M23/M24 记录见 [`milestones/M23-stage-13-specification.md`](milestones/M23-stage-13-specification.md)
与 [`milestones/M24-stage-13-implementation.md`](milestones/M24-stage-13-implementation.md)。内部
第 13 关按 B/0027、SAY `32/96/131/132` 与 `REMAKE-046` 接入 BK/15、固定妮雅、二十一
候选十一格、最多十二人、瑪琳／摩莉娜水戰士基线、瑪西爾九人守军、无增援、v35/v34 与
stage 14 路由；自动、Chromium、视觉、构建、证据、文档与用户试玩门禁已通过。

M25/M26 记录见 [`milestones/M25-stage-14-specification.md`](milestones/M25-stage-14-specification.md)
与 [`milestones/M26-stage-14-implementation.md`](milestones/M26-stage-14-implementation.md)。内部
第 14 关按 B/0029、SAY `33/97/132/133` 与 `REMAKE-047` 接入固定妮雅、二十一候选九格、
最多十人、芳率领的七名守军、无增援、第 6 回合起原版行为清零、v36/v35 与 stage 15
路由；自动、Chromium、视觉、构建、证据、文档与用户试玩门禁已通过。

M27/M28 记录见 [`milestones/M27-stage-15-specification.md`](milestones/M27-stage-15-specification.md)
与 [`milestones/M28-stage-15-implementation.md`](milestones/M28-stage-15-implementation.md)。内部
第 15 关按 B/0031、SAY `34/98/133/134` 与 `REMAKE-048` 接入固定妮雅、二十一候选九格、
最多十人、蘭率领的十名守军、无增援、第 6 回合起原版行为清零、v37/v36 与 stage 16
冻结路由；自动、Chromium、视觉、构建、证据和文档门禁已通过，等待用户试玩。

用户于 2026-08-04 将顺序调整为“先逐个实现职业，再继续推进关卡”。原版玩家目录 33 项
技术、记录 0–34 常规职业、终阶骑士／战士特性、水戰士分裂、转职实验室、全地形竞技场和
全职业对阵场现均已完成自动门禁；这些表面继续承接可选人工组合反馈。

M14/M14.10 第 8 关、M15/M16 第 9 关与 M17/M18 内部第 11 关均获用户接受；M19/M20
内部第 10、12、13、14 关已获用户接受；内部第 15 关已验证、等待用户试玩。stage 16 及
后续内容仍需独立纸面合同和用户授权。

## 全战役入口

全战役通用化仍受 [`design/remake-gdd/09-design-acceptance.md`](../design/remake-gdd/09-design-acceptance.md) 约束。只有核心系统合同、稳定语义 ID、存档/Mod 边界和代表性垂直切片足以支撑实施时，才进入逐关批量固化。
