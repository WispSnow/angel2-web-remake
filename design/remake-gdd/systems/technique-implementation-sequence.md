# 全技术逐项实施序列

状态：`verified`

授权日期：2026-08-04

依赖：[`09-design-acceptance.md`](../09-design-acceptance.md)、
[`technique-lab.md`](technique-lab.md)、
[`shooting-and-technique-system.md`](../../../reverse/notes/shooting-and-technique-system.md)、
[`technique-rules.json`](../../../reverse/parsed/native/technique-rules.json)

## 授权与门禁

用户明确要求依次实现原版玩家菜单中的全部 33 项技术，包括规则效果和地图画面特效。
本序列只覆盖 DS:`41CEh` 分层菜单产生的 33 个动作码。`1N/半龍戰士` 的直连技術「傳送」
没有动作码也不在分层表内，另由
[`technique-1n-teleport.md`](technique-1n-teleport.md) 与 `REMAKE-062` 单独授权。
本序列是独立于逐关战役解冻的系统实施例外：可以扩展纯模拟、职业菜单、AI、正式地图表现、
全地形竞技场和地图技能动画实验室；不会因此建立第 5 关内容、剧情、部署、胜负或存档路由。

每一项技术必须按以下顺序闭合，上一项未通过自动门禁时不得进入下一项：

1. 复核原版动作表、职业层级菜单、目标选择、范围、结算、经验、状态、防魔、死亡、AI 池和对白；
2. 复核图形资源、逐帧／程序绘制顺序、声音请求、固定等待与“表现后结算”边界；
3. 建立无实施必需 `[TBD]` 的逐项系统合同，并明确 `stableRemake` 与 `legacyStrict` 差异；
4. 实现确定性模拟、玩家输入、原版职业层级菜单、双方 AI、正式地图表现、竞技场和 technique-lab；
5. 运行生成器、单元测试、生产构建、相关 Chromium 流程并人工查看代表性截图；
6. 更新本表状态和验证记录，随后才把下一项改为 `implementing`。

原版 PIT 随机统一受 `REMAKE-007` 约束：值域与调用顺序保持原版合同，Web 后续由可序列化
PRNG 决定，不让动画、声音、帧率或镜头移动消费模拟随机数。同名动作的玩家／AI 参数继续
遵守 `REMAKE-009`。

## 实施序列

顺序使用机器目录 `techniqueMenu.uniqueVisibleActionCodes`，避免按开发便利重新排列。
`presentation-only` 表示实验室已经能播放原版画面，但尚无可提交规则动作、职业菜单或 AI。

| 序号 | 短码 | 原版名称 | 当前状态 |
| ---: | --- | --- | --- |
| 1 | `1C` | 初級冰雪 | `implemented` |
| 2 | `1D` | 龍踏 | `implemented`；完整门禁与截图于 2026-08-04 通过，合同见 [`technique-1d-stomp.md`](technique-1d-stomp.md) |
| 3 | `1F` | 初級炎暴 | `implemented` |
| 4 | `1H` | 初級治療 | `implemented` |
| 5 | `1I` | 初級回復 | `implemented` |
| 6 | `1K` | 鐵板 | `implemented`；完整门禁与截图于 2026-08-04 通过，合同见 [`technique-1k-iron-plate.md`](technique-1k-iron-plate.md) |
| 7 | `1L` | 初級落雷 | `implemented` |
| 8 | `2C` | 中級冰雪 | `implemented`；完整门禁与截图于 2026-08-04 通过，合同见 [`technique-2c-intermediate-ice.md`](technique-2c-intermediate-ice.md) |
| 9 | `2D` | 男踏 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-2d-male-stomp.md`](technique-2d-male-stomp.md) |
| 10 | `2F` | 中級炎暴 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-2f-intermediate-fire.md`](technique-2f-intermediate-fire.md) |
| 11 | `2H` | 中級治療 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-2h-intermediate-heal.md`](technique-2h-intermediate-heal.md) |
| 12 | `2I` | 中級回復 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-2i-intermediate-recovery.md`](technique-2i-intermediate-recovery.md) |
| 13 | `2K` | 障礙 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-2k-obstacle.md`](technique-2k-obstacle.md) |
| 14 | `2L` | 中級落雷 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-2l-intermediate-lightning.md`](technique-2l-intermediate-lightning.md) |
| 15 | `3C` | 高級冰雪 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-3c-advanced-ice.md`](technique-3c-advanced-ice.md) |
| 16 | `3D` | 女踏 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-3d-female-stomp.md`](technique-3d-female-stomp.md) |
| 17 | `3F` | 高級炎暴 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-3f-advanced-fire.md`](technique-3f-advanced-fire.md) |
| 18 | `3H` | 高級治療 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-3h-advanced-heal.md`](technique-3h-advanced-heal.md) |
| 19 | `3I` | 高級回復 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-3i-advanced-recovery.md`](technique-3i-advanced-recovery.md) |
| 20 | `3L` | 高級落雷 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-3l-advanced-lightning.md`](technique-3l-advanced-lightning.md) |
| 21 | `4C` | 究級冰雪 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-4c-ultimate-ice.md`](technique-4c-ultimate-ice.md) |
| 22 | `4F` | 究級炎暴 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-4f-ultimate-fire.md`](technique-4f-ultimate-fire.md) |
| 23 | `4L` | 究級落雷 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-4l-ultimate-lightning.md`](technique-4l-ultimate-lightning.md) |
| 24 | `AA` | 攻擊提昇 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-aa-attack-up.md`](technique-aa-attack-up.md) |
| 25 | `AD` | 防禦提昇 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-ad-defense-up.md`](technique-ad-defense-up.md) |
| 26 | `FM` | 防魔 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-fm-magic-guard.md`](technique-fm-magic-guard.md) |
| 27 | `IP` | 施毒 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-ip-poison.md`](technique-ip-poison.md) |
| 28 | `LA` | 混亂 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-la-confusion.md`](technique-la-confusion.md) |
| 29 | `OJ` | 祈禱 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-oj-prayer.md`](technique-oj-prayer.md) |
| 30 | `SA` | 攻擊下降 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-sa-attack-down.md`](technique-sa-attack-down.md) |
| 31 | `SD` | 防禦下降 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-sd-defense-down.md`](technique-sd-defense-down.md) |
| 32 | `SN` | 禁咒 | `implemented`；完整门禁与截图于 2026-08-05 通过，合同见 [`technique-sn-spell-seal.md`](technique-sn-spell-seal.md) |
| 33 | `TR` | 破邪 | `implemented` |

已经实现或只有表现的项目仍保留在机器顺序中；逐项推进时跳过已完整通过门禁的项目，
但不得把 `presentation-only` 当成规则实现完成。

## 完成定义

只有表中 33 项全部成为 `implemented`、逐项自动门禁通过、全技术职业层级菜单与双方 AI
可在竞技场复核，并且最后一次完整 `pnpm check` 与证据校验通过后，本系统例外才能标为
`verified`。人工试玩可继续登记视觉或节奏回归，但不允许用一次总览截图替代逐项证据。

2026-08-05：33 项均已成为 `implemented`；逐项门禁、全技术职业层级菜单、双方 AI、
technique-lab 完整目录、完整 `pnpm check` 与证据校验通过，本系统例外标记为 `verified`。
