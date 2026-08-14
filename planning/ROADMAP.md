# 开发路线

更新日期：2026-08-14

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
| M14.9 | 双方共享自动行动专家 AI | `accepted` | `REMAKE-037/060/065/066/079/080/081` 统一双方规划器并补完整通路、法系落点、远程职责、同分低生命集火及单体预计残血集火；当前 v68/v67 迁移 |
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
| M30 | 内部第 16 关有界实现 | `accepted` | SAY 35、莎目标、v38/v37、调试与自动／视觉门禁通过；用户于 2026-08-11 确认测试完成 |
| M31 | 第 1–15 关胜利条件原文取值更正 | `verified` | REMAKE-051 改用 DS:1273 表；第 1/2/3 关首领改为娜米／萊莉／梅蒂，待用户复验 |
| M32 | 内部第 17 关纸面合同 | `specified` | B/0035、1–10 人部署、SAY 36、倩率十二敌、无增援、REMAKE-051 与 stage 18 边界闭合 |
| M33 | 内部第 17 关有界实现 | `accepted` | SAY 36、倩目标、v39/v38、调试与自动／视觉门禁通过；用户于 2026-08-11 确认测试完成 |
| M34 | 内部第 18 关纸面合同 | `specified` | B/0037、1–8 人部署、SAY 37、麗率十六敌、无增援、REMAKE-051 与 stage 19 边界闭合 |
| M35 | 内部第 18 关有界实现 | `accepted` | SAY 37、麗目标、v40/v39、调试与定向自动／视觉门禁通过；用户确认测试通过 |
| M36 | 内部第 19 关纸面合同 | `specified` | B/0039、1–10 人部署、SAY 38、愛率二十一敌、无增援、REMAKE-051 与 stage 20 边界闭合 |
| M37 | 内部第 19 关有界实现 | `accepted` | SAY 38、愛目标、v41/v40、调试与定向自动／视觉门禁及用户试玩通过 |
| M38 | 内部第 20 关纸面合同 | `specified` | B/0041、3–17 人部署、叙事阵形替换、妖龍／WD、REMAKE-052 与 stage 21 边界闭合 |
| M39 | 内部第 20 关有界实现 | `accepted` | SAY 39–41/71–75、妖龍／WD、v42/v41、透明蒙版、2400 满血、状态免疫与魔祭師琴斯通过；用户确认测试完成 |
| M40 | 内部第 21 关纸面合同 | `specified` | 空 B/0043、SAY 42–44、四名斥候写入／移动、即时胜利、REMAKE-055 与 stage 22 边界闭合 |
| M41 | 内部第 21 关有界实现 | `accepted` | 非交互侦察过场、v43/v42、直接 stage 22 路由与定向自动／视觉门禁通过；用户确认测试通过 |
| M42 | 内部第 22 关纸面合同 | `specified` | B/0045、1–19 人部署、SAY 76–79、六敌伏击、妖龍目标、REMAKE-056 与 stage 23 边界闭合 |
| M43 | 内部第 22 关有界实现 | `accepted` | 证据生成、首回合伏击、v44/v43、调试与自动／视觉门禁通过；用户确认测试通过 |
| M44 | 内部第 23 关纸面合同 | `specified` | B/0047、SAY 45/46、1–15 人部署、二十一敌无增援、妮雅到达区、REMAKE-058 与 stage 24 边界闭合 |
| M45 | 内部第 23 关有界实现 | `accepted` | SAY 45 第 22 关关后化、对话后存档、到达目标、v46/v45/v44 与定向自动／视觉门禁通过；用户确认测试通过 |
| M46 | 内部第 24 关纸面合同 | `specified` | B/0049、SAY 47/48、1–15 人部署、二十二敌无增援、妮雅城堡到达区、REMAKE-061 与直接 stage 26 边界闭合 |
| M47 | 内部第 24 关有界实现 | `accepted` | 证据生成、SAY 47/48、到达目标、v49/v48/v47、调试与直接 stage 26 路由通过；用户确认测试通过 |
| M48 | 内部第 26 关纸面合同 | `specified` | B/0053、SAY 49/50、4–22 人部署、八敌无增援、REMAKE-063、双次纵列下推与 stage 27 边界闭合 |
| M49 | 内部第 26 关有界实现 | `accepted` | 证据生成、SAY 49/50、双次 385 tick 尾阶段、v50/v49、调试与 stage 27 路由通过；用户确认测试通过 |
| M50 | 内部第 27 关纸面合同 | `specified` | B/0055、SAY 51/52、11–31 人部署、七名独立友军、五敌无增援、四段线性目的地、REMAKE-064 与 stage 28 边界闭合 |
| M51 | 内部第 27 关有界实现 | `accepted` | 证据生成、混合控制军团、SAY 51/52、v54、调试与 stage 28 路由通过；用户确认测试通过 |
| M52 | 内部第 28 关纸面合同 | `specified` | B/0057、SAY 53/54/55、1–29 人部署、十七敌全灭、无增援、REMAKE-068 与 stage 29 边界闭合 |
| M53 | 内部第 28 关有界实现 | `accepted` | 证据生成、剧情、部署、全灭战、v55/v54、调试、stage 29 路由及定向门禁通过；用户确认测试通过 |
| M54 | 内部第 29 关纸面合同 | `specified` | B/0059、SAY 56、1–15 人部署、十五敌全灭、无战场剧情／增援、REMAKE-069/070 与 stage 30 边界闭合 |
| M55 | 内部第 29 关有界实现 | `accepted` | 证据生成、剧情、部署、全灭战、v57/v56/v55、七类调试场景与 stage 30 路由通过；姓名修复后用户确认本关已可玩且测试通过 |
| M56 | 内部第 30 关纸面合同 | `specified` | B/0061、SAY 57/58/59、固定三人、四档连续形态、REMAKE-071 与 stage 31 边界闭合 |
| M57 | 内部第 30 关有界实现 | `accepted` | 证据生成、固定战斗、8/16/24/32 形态链、女帝归队、v59/v58/v57、六类调试场景及 stage 31 路由通过；用户确认测试通过 |
| M58 | 内部第 31 关纸面合同 | `specified` | B/0063、SAY 60/61/62、5–17 人部署、十五敌全灭、五通道无增援、REMAKE-072 与 stage 32 边界闭合 |
| M59 | 内部第 31 关有界实现 | `accepted` | 证据生成、剧情、部署、全灭战、v60/v59、七类调试场景、两套成长档及 stage 32 路由通过；用户确认测试通过 |
| M60 | 内部第 32 关纸面合同 | `specified` | B/0065、SAY 63/64、1–16 人部署、十八敌静态联军、五通道无动态增援、`REMAKE-073` 与 stage 33 边界闭合 |
| M61 | 内部第 32 关有界实现 | `accepted` | 证据生成、直接部署、两段剧情、十八敌全灭、v61/v60、六类调试场景、两套成长档及 stage 33 路由通过；用户确认测试通过 |
| M62 | 内部第 33 关纸面合同 | `specified` | B/0067、SAY 65、1–10 人部署、二十九敌静态守军、15 哨戒＋14 追击、五通道无增援、`REMAKE-074` 与 stage 34 边界闭合 |
| M63 | 内部第 33 关有界实现 | `accepted` | 证据生成、直接部署、SAY 65、二十九敌全灭、v62/v61、六类调试场景、两套成长档及 stage 34 路由通过；用户确认测试通过 |
| M64 | 内部第 34 关纸面合同 | `specified` | B/0069、SAY 66、1–11 人部署、芙瑪羅妮／蕾娜吉芙与十七敌静态守军、全员追击、五通道无增援、`REMAKE-075` 与 stage 35 边界闭合 |
| M65 | 内部第 34 关有界实现 | `accepted` | 证据生成、直接部署、SAY 66、十九敌全灭、v63/v62、六类调试场景、两套成长档及 stage 35 路由通过；用户试玩接受 |
| M66 | 内部第 35 关纸面合同 | `specified` | B/0071、SAY 67/68、固定九对十、全员行为 12 无路线待命、五通道无增援、`REMAKE-076` 与 stage 36 边界闭合 |
| M67 | 内部第 35 关有界实现 | `accepted` | 证据生成、固定棋盘、SAY 67/68、行为 12 待命、v64/v63、六类调试场景、两套成长档及 stage 36 路由通过；用户确认测试通过 |
| M68 | 内部第 36 关纸面合同 | `specified` | B/0073、SAY 80、1–28 人部署、碧娜維姬与二十九敌、单首领目标、五通道无增援、`REMAKE-078` 与 stage 37 边界闭合 |
| M69 | 内部第 36 关有界实现 | `verified` | 证据生成、直接部署、SAY 80、三十敌首领战、v65/v64、六类调试场景、两套成长档及 stage 37 冻结路由通过，等待用户试玩 |
| M04+ | 职业与技术能力切片 | `verified` | 33 项分层玩家技术、`1N` 直连技術「傳送」（`BAT-068`／`REMAKE-062`）、常规职业、终阶特性、水戰士分裂与三类组合实验表面完成自动门禁 |
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
`M14.9-FB-01 / REMAKE-060` 随后把无即时交战动作时的目标选择从曼哈顿距离修正为完整
可移动通路代价，纳入地形、阻挡、占格、ZOC 与显式路径约束；保存身份升级为 v47，v46
原样迁移，已提交状态和 PRNG 不变。初次试玩的后续拥堵反馈在同一决定中加入满员前线的
虚拟队列推进，以及同目标、同战术结果且不增加暴露时的近身换位让路；后续单位仍在每个
动作提交后重规划，不保存预留队列。
`M14.9-FB-02/03` 后续补齐断路接近、法系施法落点、39 职业近战／远程职责和精确下一阶段
近战威胁；魔弓先禁贴身并最大化实际总伤害。`M14.9-FB-04 / REMAKE-079` 再把敌对伤害
行动完全同分时的主目标平局改为当前生命最低者，普通近战、射击、伤害技术、法系攻击预演
与双方整队行动者重选共享该规则，非伤害动作不变。FB-04 当时的保存身份为 v66 /
`expert-focus-fire-ai-1`，v65 战中档和完成档无损迁移。
弩兵复测又确认当前生命威胁会先把满血巫師抬出同分池；`M14.9-FB-05 / REMAKE-080`
因此以最大生命表示基础耐久威胁，使同职业、同成长巫師由低生命集火决定目标。当前身份
升级为 v67 / `expert-focus-fire-ai-2`，v66 无损迁移。
后续复核确认最大生命同样不应形成仇恨，且有效伤害封顶会诱导弩兵转向能吸收更多伤害的
高生命目标。`M14.9-FB-06 / REMAKE-081` 移除全部生命／耐久威胁，并让同一严格优先级带
内的单体直伤先最小化行动后预计剩余生命；魔弓与范围动作保持总收益优先。当前身份升级为
v68 / `expert-focus-fire-ai-3`，v67 无损迁移。

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

M38/M39 记录见 [`milestones/M38-stage-20-specification.md`](milestones/M38-stage-20-specification.md)
与 [`milestones/M39-stage-20-implementation.md`](milestones/M39-stage-20-implementation.md)。内部
第 20 关按 B/0041、SAY `39–41/71–75`、`REMAKE-052–054` 接入 3–17 人部署、十六名
半龍戰士叙事阵形、妖龍／WD、魔祭師琴斯与龍王胜利链、v42/v41 及 stage 21 路由；
自动与视觉门禁通过，并于 2026-08-11 获用户测试接受。

M40/M41 记录见 [`milestones/M40-stage-21-specification.md`](milestones/M40-stage-21-specification.md)
与 [`milestones/M41-stage-21-implementation.md`](milestones/M41-stage-21-implementation.md)。内部
第 21 关按空 B/0043、SAY `42–44` 与 `REMAKE-055` 接入四名斥候的非交互写入／移动、
跳过普通胜利与存档提示、v43/v42 及 stage 22 路由；定向自动与视觉门禁通过，并于
2026-08-11 获用户测试接受。

M42/M43 记录见 [`milestones/M42-stage-22-specification.md`](milestones/M42-stage-22-specification.md)
与 [`milestones/M43-stage-22-implementation.md`](milestones/M43-stage-22-implementation.md)。内部
第 22 关按 B/0045、SAY `76–79/90` 与 `REMAKE-056` 接入 1–19 人部署、女帝／琴斯临时
剧情、六敌伏击、妖龍单一目标、v44/v43 与 stage 23 路由；定向自动、生产构建与
五张代表性截图视觉门禁通过，并于 2026-08-11 获用户测试接受。

M44/M45 记录见 [`milestones/M44-stage-23-specification.md`](milestones/M44-stage-23-specification.md)
与 [`milestones/M45-stage-23-implementation.md`](milestones/M45-stage-23-implementation.md)。内部
第 23 关按 B/0047、SAY `45/46/91` 与 `REMAKE-058` 接入 1–15 人部署、二十一名静态
守军、妮雅线性格号 `0..524` 到达目标与 stage 24 路由。`REMAKE-059` 随后把 SAY 45 改为
第 22 关关后事件并将存档移到对话后，v46/v45/v44、定向自动、生产构建与代表性截图视觉门禁通过，
用户于 2026-08-12 确认测试通过。

M46/M47 记录见 [`milestones/M46-stage-24-specification.md`](milestones/M46-stage-24-specification.md)
与 [`milestones/M47-stage-24-implementation.md`](milestones/M47-stage-24-implementation.md)。内部
第 24 关按 B/0049、SAY `47/48/92` 与 `REMAKE-061` 接入 1–15 人部署、二十二名静态
守军、妮雅线性格号 `0..1030` 到达目标与胜利对白，并直接保存至 stage 26；内部场景 25
不构造运行时。v49/v48/v47、调试、定向自动、生产构建与代表性视觉门禁已通过，用户于
2026-08-12 确认测试通过。

M48/M49 记录见 [`milestones/M48-stage-26-specification.md`](milestones/M48-stage-26-specification.md)
与 [`milestones/M49-stage-26-implementation.md`](milestones/M49-stage-26-implementation.md)。第 25 个
可玩关卡按原版内部 B/0053、SAY `49/50/93/143/144` 与 `REMAKE-063` 接入 4–22 人部署、
碧娜維姬与七名魔祭師、无增援、敌方阶段尾两次独立 385 tick 纵列下推、v50/v49 与
stage 27 路由；定向自动、生产构建及七张代表性视觉审计均已通过，用户确认测试通过。

M50/M51 记录见 [`milestones/M50-stage-27-specification.md`](milestones/M50-stage-27-specification.md)
与 [`milestones/M51-stage-27-implementation.md`](milestones/M51-stage-27-implementation.md)。第 26 个
可玩关卡按 B/0055、SAY `51/52/94/144/145` 与 `REMAKE-064` 接入 11–31 人部署、七名
独立城防友军、五名静态叛军、无增援、四段妮雅线性到达区、v54 与 stage 28 冻结
路由；定向单元、Stage 26／27 Chromium、七张视觉审计、生产构建、证据与文档门禁通过；
用户于 2026-08-13 确认测试通过并授权推进下一关。

M52/M53 记录见 [`milestones/M52-stage-28-specification.md`](milestones/M52-stage-28-specification.md)
与 [`milestones/M53-stage-28-implementation.md`](milestones/M53-stage-28-implementation.md)。第 27 个
可玩关卡按 B/0057、SAY `53/54/55/95/145/146` 与 `REMAKE-068` 闭合 SAY/0053 关前会议、
1–29 人部署、十七名静态敌军、无增援、全灭目标、v55/v54 与 stage 29 冻结边界；M53
有界实现、定向单元、Stage 27／28 Chromium、代表性视觉审计、生产构建、证据与文档门禁
均已通过；用户于 2026-08-13 确认测试通过并授权推进下一关，M53 进入 `accepted`。

M54/M55 记录见 [`milestones/M54-stage-29-specification.md`](milestones/M54-stage-29-specification.md)
与 [`milestones/M55-stage-29-implementation.md`](milestones/M55-stage-29-implementation.md)。第 28 个
可玩关卡按 B/0059、SAY `56/96/146/147` 与 `REMAKE-069/070` 闭合 `MAGIC/77`＋BK/23 关前剧情、
1–15 人部署、艾西柯羅与十四名静态敌军、无专属战场剧情、无增援、全灭目标、v57/v56/v55 与
stage 30 冻结边界。槽 22 在部署名单显示“愛莉歐拉”；原版入场后按 `FFh` 回退姓名肖像，
但用户反馈这会丢失角色名，`M55-FB-01` 已让默认规则出场后继续显示愛莉歐拉，通用肖像仍
跟随当前职业。M54 为 `specified`；M55 已接入 v57/v56/v55 与 stage 30 路由、
关前／部署／玩家回合／近胜／近败／胜利准备／完成路由七类调试场景，并按实际边界把初始镜头钳制为
`(36,23)`。定向自动与代表性视觉门禁均已通过；用户确认本关已可玩且测试通过，状态转为
`accepted`。

M56/M57 记录见 [`milestones/M56-stage-30-specification.md`](milestones/M56-stage-30-specification.md)
与 [`milestones/M57-stage-30-implementation.md`](milestones/M57-stage-30-implementation.md)。第 29 个
可玩关卡按 B/0061、SAY `57/58/59/97/147/148` 与 `REMAKE-071` 闭合固定三人、开场女帝转
士兵、四档 8／16／24／32 个确定形态、每次当前形态台词、最终 side 1 槽 23 女帝归队、
v59/v58/v57 与 stage 31 边界。证据生成内容、六类调试场景、两套成长档、定向自动门禁和
代表性视觉审计已通过；用户确认测试通过后 M57 转为 `accepted`。

M58/M59 记录见 [`milestones/M58-stage-31-specification.md`](milestones/M58-stage-31-specification.md)
与 [`milestones/M59-stage-31-implementation.md`](milestones/M59-stage-31-implementation.md)。第 30 个
可玩关卡按 B/0063、SAY `60/61/62/99/148/149` 与 `REMAKE-072` 闭合 5–17 人部署、
菲伊魯茵与十四名伏兵、五通道无增援、全灭目标、v60/v59 与 stage 32 冻结边界。证据生成
内容、三段剧情、七类调试场景、两套成长档、定向自动门禁和代表性视觉审计已通过；试玩
反馈的长文目标面板、音效按钮越界和
“集體命令”入口失效已分别由 `M59-FB-01/02` 修复并加入通用回归。

用户于 2026-08-13 确认本关测试通过并继续推进，M59 转为 `accepted`。M60/M61 记录见
[`milestones/M60-stage-32-specification.md`](milestones/M60-stage-32-specification.md) 与
[`milestones/M61-stage-32-implementation.md`](milestones/M61-stage-32-implementation.md)。第 31 个
可玩关卡按 B/0065、SAY `63/64/100/149/150` 与 `REMAKE-073` 闭合无关前剧情的直接
1–16 人部署、菲伊魯茵／芙瑪羅妮与十六名静态联军、全灭目标、五通道无动态增援、
v61/v60 与 stage 33 边界。证据生成内容、六类调试场景、两套成长档、定向自动门禁
和代表性视觉审计已通过；用户确认本关测试通过并要求继续推进，M61 转为 `accepted`。

M62/M63 记录见 [`milestones/M62-stage-33-specification.md`](milestones/M62-stage-33-specification.md)
与 [`milestones/M63-stage-33-implementation.md`](milestones/M63-stage-33-implementation.md)。第 32 个
可玩关卡按 B/0067、SAY `65/101/150/151` 与 `REMAKE-074` 闭合直接 1–10 人部署、二十九名
静态守军、15 名哨戒＋14 名追击、全灭目标、五通道无动态增援、无胜利 SAY、v62/v61 与
stage 34 路由。证据生成内容、六类调试场景、两套成长档、定向自动门禁和代表性视觉
审计已通过；用户确认测试通过后，M63 转为 `accepted`。

M64/M65 记录见 [`milestones/M64-stage-34-specification.md`](milestones/M64-stage-34-specification.md)
与 [`milestones/M65-stage-34-implementation.md`](milestones/M65-stage-34-implementation.md)。第 33 个
可玩关卡按 B/0069、SAY `66/102/151/152` 与 `REMAKE-075` 闭合直接 1–11 人部署、芙瑪羅妮／
蕾娜吉芙与十七名静态守军、十九名共享专家追击、全灭目标、五通道无动态增援、无胜利 SAY、
v63/v62 与 stage 35 路由。证据生成内容、六类调试场景、两套成长档、定向自动门禁和
代表性视觉审计已通过；用户确认测试通过后 M65 转为 `accepted`。

M66/M67 记录见 [`milestones/M66-stage-35-specification.md`](milestones/M66-stage-35-specification.md)
与 [`milestones/M67-stage-35-implementation.md`](milestones/M67-stage-35-implementation.md)。第 34 个
可玩关卡按 B/0071、SAY `67/68/103/152/153` 与 `REMAKE-076` 闭合固定九对十、全员行为
12 无路线待命、全灭目标、五通道无动态增援、v64/v63 与 stage 36 路由。证据生成内容、
六类调试场景、两套成长档与定向自动门禁已通过；用户确认测试通过后 M67 转为 `accepted`。

M68/M69 记录见 [`milestones/M68-stage-36-specification.md`](milestones/M68-stage-36-specification.md)
与 [`milestones/M69-stage-36-implementation.md`](milestones/M69-stage-36-implementation.md)。第 35 个
可玩关卡按 B/0073、SAY `80/104/153/154` 与 `REMAKE-078` 闭合 1–28 人部署、碧娜維姬与
二十九名静态敌军、行为 1 哨戒＋行为 0/2 追击、单首领目标、五通道无动态增援、无胜利
SAY、v65/v64 与 stage 37 冻结边界。证据生成内容、六类调试场景、两套成长档、定向自动
门禁与代表性视觉审计已通过，M69 为 `verified`，等待用户普通入口试玩。

用户于 2026-08-04 将顺序调整为“先逐个实现职业，再继续推进关卡”。原版玩家目录 33 项
技术、记录 0–34 常规职业、终阶骑士／战士特性、水戰士分裂、转职实验室、全地形竞技场和
全职业对阵场现均已完成自动门禁；这些表面继续承接可选人工组合反馈。

第 0–24 关、内部第 26–35 关与既有非连续战斗均获用户接受；内部第 36 关已完成 M68 纸面
合同和 M69 有界实现，自动／视觉门禁已验证，等待用户普通入口试玩。stage 37 及后续内容
仍需独立纸面合同和用户授权，内部场景 25 不自行补造。

## 全战役入口

全战役通用化仍受 [`design/remake-gdd/09-design-acceptance.md`](../design/remake-gdd/09-design-acceptance.md) 约束。只有核心系统合同、稳定语义 ID、存档/Mod 边界和代表性垂直切片足以支撑实施时，才进入逐关批量固化。
