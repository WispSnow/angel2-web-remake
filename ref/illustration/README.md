# 复刻项目工作流演示图

本目录用同一组项目事实分别生成两套演示图，便于比较工具的表达方式。图中内容来自
`ref/next-project/RETROSPECTIVE.md` 与 `ref/next-project/README.md`。

## 1. Archify

目录：`archify/`

- `angel2-remake-workflow.archify.json`：可编辑的 typed JSON 源；
- `angel2-remake-workflow.html`：带章节、路径动画、亮暗主题和演示模式的自包含版本；
- `angel2-remake-workflow.png`：用于直接对比的 1440 × 900 浅色主图；
- `angel2-remake-workflow.visual-check.*.png`：浅色／深色、两种桌面尺寸的演示截图；
- `angel2-remake-workflow.visual-check.*`：边界检查与截图回执。

来源工具：`tt-a1i/archify`，审阅版本
`9a5060566c832832fb843e457e58c8ee6bac82fd`，MIT。

## 2. Fireworks Tech Graph

目录：`fireworks-tech-graph/`

- `angel2-remake-workflow.fireworks.json`：可编辑的图表源；
- `angel2-remake-workflow.svg`：Blueprint 矢量主文件；
- `angel2-remake-workflow.png`：1920px 演示图片；
- `angel2-remake-workflow.layout.json`：布局与质量报告。

来源工具：`yizhiyanhua-ai/fireworks-tech-graph`，审阅版本
`d56d45a286f16439a0fba2e66ff85f598c42ef41`，MIT。

## 共同叙事结构

上层主线：

```text
原版基线 → 垂直切片 → 架构收口 → 能力收口 → 战役扩展 → 产品硬化 → 发布归档
```

其中“能力收口”指根据完整战役能力矩阵，先闭合高频共性技能、职业、状态、转职和普通 AI，
通过 Arena／技能／转职／调试场景的组合验收与后续关卡空装配演练，再冻结接口进入批量扩展；
稀有与 Boss 专属机制仍在首次消费关卡闭环。

下层切片闭环：

```text
Evidence → Decision → Contract → Generate → Implement → Verify → Accept
```

## 对比建议

- Archify：适合现场演示。HTML 可逐章播放项目主线、切片闭环、战役扩展和交付四段故事，
  也能切换亮暗主题、聚焦节点和追踪路径；主图为适配单屏演示而采用两条蛇形泳道。
- Fireworks Tech Graph：适合静态传播。SVG／PNG 在一页内保留更多阶段说明，并以 Blueprint
  图框、工程标题栏和反馈回路强化“证据驱动开发”的工程感。
- 比较时优先并排打开两个 `angel2-remake-workflow.png`；准备讲解时再打开 Archify HTML。

## 验证结果

- Archify：结构、线路、composition、文字可读性、1440 × 900 至 2048 × 1320 单屏边界均通过；
- Fireworks Tech Graph：XML、几何、箭头 marker 与 showcase composition 均通过；
- 两张主图均已人工检查中文显示、节点遮挡、箭头方向和反馈回路。

第三方仓库只作为只读工具来源；生成时不安装依赖、不联网、不读取 `.env`，所有产物仅写入本目录。
