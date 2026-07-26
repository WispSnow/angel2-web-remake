# 《天使帝国 II》Web 复刻

当前可运行内容是首个垂直切片：第 0 关“瓦爾克麗宮”。它从原版关前剧情开始，覆盖固定编队开战、妮雅脚本移动、玩家战术操作、行为 12 敌军、第二回合事件、失败重试、全灭胜利、战后对白、五槽保存和第 1 关路由。

运行时采用 Phaser 4.2.1、TypeScript 和 Vite。战斗规则与内容数据独立于 Phaser，场景层只负责地图、单位、镜头、输入和范围表现。

## 运行

环境要求：以 `.node-version` 固定的 Node.js 24 LTS、pnpm。仅在重新生成第 0 关原版素材时需要 ImageMagick 的 `magick` 命令。

```bash
pnpm install
pnpm dev
```

浏览器打开 `http://127.0.0.1:4173/`。推荐先用鼠标体验：左键选择/确认，右键循环对焦下一名尚未行动的我方单位，指针停留在战场边框或底部地点 banner 可滚动镜头。键盘方向为方向键或 `W/Z/A/S`，主操作为 `Ctrl/Insert/Space`，取消/返回为 `Alt/Delete/Enter`；`Esc` 是系统菜单的唯一键盘快捷键，`Tab` 打开集体命令，`F1–F4` 分别是全部休息、跟随主将、自由行动和全面撤退，`E/M` 切换音效/音乐。

## 战场操作

1. 选择尚未行动的我方单位；
2. 从职业行动菜单选择“移动”，再在原版网点范围内选择合法格；
3. 移动后选择“攻击／结束／返悔”，或在初始菜单直接“攻击／休息”；
4. 所有手动单位提交后进入我方自动与敌方阶段；也可用“全部休息”一次提交剩余单位；
5. 清除全部敌人胜利；妮雅被移除则失败。

没有单位焦点时，右栏显示战术桌与实时小地图；悬浮或选中单位时改为单位详情。`Esc` 根菜单提供原文五项“遊戲功能／勝利條件／讀取記錄／儲存記錄／離開遊戲”；表现速度、地图/全景战斗、音乐、音效和逐字音位于“遊戲功能”子菜单。表现选项不会改变模拟状态或随机数序列。

## 自动检查

```bash
pnpm test          # 内容、模拟、剧情与存档单元测试
pnpm test:coverage # 单元测试与核心覆盖率门槛
pnpm build         # TypeScript 与生产构建
pnpm test:e2e      # 固定版本 Chromium 端到端验收
pnpm check         # 顺序执行以上全部检查
```

端到端测试覆盖 `S00-A` 到 `S00-P`，包括真实鼠标攻击、目标/系统/集体命令、AI 与 ZOC、地图/全景战斗、第二回合剧情、失败重试、战中存读档、胜利保存、关前音乐与玩家/敌方战斗曲对、原版音效事件、键盘输入、减少动画和窄屏。`S00-O` 从普通 `/` 启动，不带 `?test=1`、不读取调试状态，只用玩家可见控件让第一关完整通关；固定版本 Chromium 在 Darwin 本地另对最终下一关画面执行黄金截图比对，CI 保留同一流程的语义断言以避开跨系统字形光栅差异。过程截图生成到 `artifacts/playwright/`。

## 结构

- `src/game/content/`：证据驱动的第 0 关内容、原始数值与对白；
- `src/game/simulation/`：与 Phaser 无关的确定性网格、伤害、经验和 AI；
- `src/game/phaser/`：地图、单位、镜头和范围表现；
- `src/game/ui.ts`：剧情、HUD、目标、胜负和保存界面；
- `scripts/generate-stage0-runtime.mjs`：从 `B/0001` 固化 50×50 地形内容；
- `public/assets/original/`：切片使用的调色板修正素材与已转换原版音频；
- `tests/`：模拟与浏览器验收。
- `planning/`：当前进度、路线、里程碑和跨阶段风险。

当前开发状态与下一步见 [`planning/STATUS.md`](planning/STATUS.md)。玩法合同见 [`design/remake-gdd/vertical-slices/stage-00.md`](design/remake-gdd/vertical-slices/stage-00.md)，原版证据基线见 [`reverse/gdd/original-gdd.md`](reverse/gdd/original-gdd.md)。第 1 关已有纸面合同，但运行时仍只有正确路由占位，不属于当前实现范围。
