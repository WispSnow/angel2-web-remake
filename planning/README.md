# 开发规划与进度

本目录回答“项目现在在哪里、下一步做什么、何时算完成”。它不保存原版事实，不重新定义玩法规则，也不复制实现细节。

## 与其他目录的边界

- 原版事实与证据以 [`reverse/`](../reverse/) 为准；
- 玩家体验、规则合同和设计冻结状态以 [`design/remake-gdd/`](../design/remake-gdd/) 为准；
- 当前实现以 [`src/`](../src/) 和自动测试为准；
- 本目录只记录里程碑、执行顺序、验收状态和跨阶段风险。

若规划与证据或设计合同冲突，先修正规划；不能用规划文档覆盖真值。完整优先级和协作规则见 [`AGENTS.md`](../AGENTS.md)。

## 状态模型

| 状态 | 含义 |
| --- | --- |
| `frozen` | 尚未授权实施，只能继续取证、补规格或提出候选拆分 |
| `specified` | 纸面范围已形成，但不等于获得代码实施授权 |
| `authorized` | 用户已经明确授权指定范围，可以开始实施 |
| `in-progress` | 已授权范围正在实施，尚未满足全部退出条件 |
| `implemented` | 实现与约定自动／视觉门禁已完成，等待必要的人工试玩或产品确认 |
| `verified` | 约定的自动检查和技术验收已通过 |
| `accepted` | 必要的人工试玩或产品确认也已完成 |

状态通常按表中顺序推进。用户可以明确调整范围或跳过某个门槛，但应在对应里程碑中记录决定和日期。

## 当前入口

- [`STATUS.md`](STATUS.md)：当前里程碑、阻塞项、最近验证和下一步；
- [`ROADMAP.md`](ROADMAP.md)：按能力切片排列的阶段路线；
- [`RISKS.md`](RISKS.md)：跨里程碑风险和缓解动作；
- [`milestones/M00-stage-00-acceptance.md`](milestones/M00-stage-00-acceptance.md)：第 0 关人工接受；
- [`milestones/M00.5-promotion-and-architecture.md`](milestones/M00.5-promotion-and-architecture.md)：第 0 关转职与多关架构准备；
- [`milestones/M00.6-stage0-class-actions.md`](milestones/M00.6-stage0-class-actions.md)：第 0 关首层职业行动闭环；
- [`milestones/M00.7-full-combat-profession-animations.md`](milestones/M00.7-full-combat-profession-animations.md)：全职业普通全屏战斗动画；
- [`milestones/M01-stage-01-enablement.md`](milestones/M01-stage-01-enablement.md)：第 1 关实施准备；
- [`milestones/M02-stage-01-implementation.md`](milestones/M02-stage-01-implementation.md)：第 1 关有界实现；
- [`milestones/M03-stage-02-implementation.md`](milestones/M03-stage-02-implementation.md)：第 2 关有界实现；
- [`milestones/M04-stage-03-implementation.md`](milestones/M04-stage-03-implementation.md)：第 3 关有界实现；
- [`milestones/M04.5-stage-04-framework-consolidation.md`](milestones/M04.5-stage-04-framework-consolidation.md)：第 4 关前框架收口；
- [`milestones/M05-stage-04-specification.md`](milestones/M05-stage-04-specification.md)：第 4 关纸面合同；
- [`milestones/M06-stage-04-implementation.md`](milestones/M06-stage-04-implementation.md)：第 4 关有界实现；
- [`milestones/M07-stage-05-specification.md`](milestones/M07-stage-05-specification.md)：第 5 关纸面合同；
- [`milestones/M08-stage-05-implementation.md`](milestones/M08-stage-05-implementation.md)：第 5 关有界实现；
- [`milestones/M09-stage-06-specification.md`](milestones/M09-stage-06-specification.md)：第 6 关纸面合同；
- [`milestones/M10-stage-06-implementation.md`](milestones/M10-stage-06-implementation.md)：第 6 关有界实现；
- [`milestones/M11-stage-07-specification.md`](milestones/M11-stage-07-specification.md)：第 7 关纸面合同；
- [`milestones/M12-stage-07-implementation.md`](milestones/M12-stage-07-implementation.md)：第 7 关有界实现；
- [`milestones/M13-stage-08-specification.md`](milestones/M13-stage-08-specification.md)：第 8 关纸面合同；
- [`milestones/M14-stage-08-implementation.md`](milestones/M14-stage-08-implementation.md)：第 8 关有界实现；
- [`milestones/M14.5-expert-enemy-ai.md`](milestones/M14.5-expert-enemy-ai.md)：默认专家敌方 AI；
- [`milestones/M14.6-ranged-and-ice-ai.md`](milestones/M14.6-ranged-and-ice-ai.md)：专家射手与冰雪排程；
- [`milestones/M14.7-directed-magic-arrow.md`](milestones/M14.7-directed-magic-arrow.md)：魔弓完整箭道控制；
- [`milestones/M14.8-ice-counterplay-wizard-focus.md`](milestones/M14.8-ice-counterplay-wizard-focus.md)：冰雪反制与巫師仇恨；
- [`milestones/M14.9-shared-automatic-expert-ai.md`](milestones/M14.9-shared-automatic-expert-ai.md)：双方共享自动行动专家 AI；
- [`milestones/M14.10-stage8-all-player-control.md`](milestones/M14.10-stage8-all-player-control.md)：第 8 关全员玩家控制；
- [`milestones/M15-stage-09-specification.md`](milestones/M15-stage-09-specification.md)：第 9 关纸面合同；
- [`milestones/M16-stage-09-implementation.md`](milestones/M16-stage-09-implementation.md)：第 9 关有界实现；
- [`milestones/M17-stage-11-specification.md`](milestones/M17-stage-11-specification.md)：内部第 11 关纸面合同；
- [`milestones/M18-stage-11-implementation.md`](milestones/M18-stage-11-implementation.md)：内部第 11 关有界实现；
- [`milestones/M19-stage-10-specification.md`](milestones/M19-stage-10-specification.md)：内部第 10 关纸面合同；
- [`milestones/M20-stage-10-implementation.md`](milestones/M20-stage-10-implementation.md)：内部第 10 关有界实现；
- [`milestones/M21-stage-12-specification.md`](milestones/M21-stage-12-specification.md)：内部第 12 关纸面合同；
- [`milestones/M22-stage-12-implementation.md`](milestones/M22-stage-12-implementation.md)：内部第 12 关有界实现；
- [`milestones/M23-stage-13-specification.md`](milestones/M23-stage-13-specification.md)：内部第 13 关纸面合同；
- [`milestones/M24-stage-13-implementation.md`](milestones/M24-stage-13-implementation.md)：内部第 13 关有界实现；
- [`milestones/M25-stage-14-specification.md`](milestones/M25-stage-14-specification.md)：内部第 14 关纸面合同；
- [`milestones/M26-stage-14-implementation.md`](milestones/M26-stage-14-implementation.md)：内部第 14 关有界实现；
- [`milestones/M27-stage-15-specification.md`](milestones/M27-stage-15-specification.md)：内部第 15 关纸面合同；
- [`milestones/M28-stage-15-implementation.md`](milestones/M28-stage-15-implementation.md)：内部第 15 关有界实现；
- [`work-items/M00-native-side-panel-hotspots.md`](work-items/M00-native-side-panel-hotspots.md)：原版右栏战术桌 12 个鼠标热点的实现顺序与验收边界。

## 维护规则

1. 同时只设置一个主要推进里程碑；其他阶段保持候选或冻结。
2. 每个实施任务必须链接相应的逆向证据、设计合同和验收场景，不在计划中抄写第二份数值或规则。
3. 用能力和退出条件表示进度，不使用难以核实的完成百分比。
4. `STATUS.md` 只在状态、阻塞、验证结果或下一步发生实质变化时更新，不写逐日流水账。
5. 里程碑完成后保留最终验收摘要；详细过程由 Git 历史和测试报告承担。
6. 外部任务系统启用后，在这里链接对应任务，不再维护一份重复的全量 backlog。
7. 玩法修复仍记录在 `reverse/gdd/web-remake-rule-decisions.md`；本目录只记录执行决定。
8. 每个里程碑文件头的 `状态` 是该里程碑的状态真值；`STATUS.md`、`ROADMAP.md` 和本页索引
   必须与之同步，并由 `pnpm docs:check` 校验，不再新增平行状态清单。

## 自动合同检查

```bash
pnpm docs:check
```

该命令只读检查：

- 里程碑 ID、文件名和允许的状态值；
- 里程碑文件头与 `STATUS.md`、`ROADMAP.md` 的状态一致性；
- 本页是否索引全部里程碑；
- 同时最多一个 `authorized / in-progress / implemented` 实施里程碑；
- 规划、设计、逆向说明和项目入口中的相对 Markdown 文档链接。

机器 JSON、渲染图和其他被忽略的本地逆向产物不属于链接检查范围；它们继续由证据校验器、
生成器及各专题测试负责。

## 使用方式

开始推进项目前，先阅读 [`STATUS.md`](STATUS.md) 和其中指向的当前里程碑，再按里程碑的
“输入 → 工作包 → 验证 → 退出条件”执行。完成任务时同步更新状态、风险和直接相关的设计
验收文档，并运行 `pnpm docs:check`。
