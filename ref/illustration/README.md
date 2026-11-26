# 两轮开发的工作流示意图

本目录为《天使帝国 II》Web 重制版的两轮开发各画一张工作流图，每张都用两个工具各出一版，方便比较表达方式，
也可以直接用在文章和视频里。图中内容来自 [`../next-project/`](../next-project/README.md) 的蓝图与复盘：

| | 第一轮：复刻 | 第二轮：增强 |
| --- | --- | --- |
| 依据 | `round-1-remake-blueprint.md`、`round-1-remake-retrospective.md` | `round-2-enhancement-blueprint.md`、`round-2-enhancement-retrospective.md` |
| 文件名前缀 | `round-1-remake-workflow` | `round-2-enhancement-workflow` |

## 1. 第一轮：复刻

上层主线（两行蛇形）：

```text
原版基线 → 垂直切片 → 架构收口 → 能力收口 → 战役扩展
                                              ↓
1.0 门 ← 平衡调整 ← 版本运营 ← 首次发布 ← 产品硬化
```

下层切片闭环：

```text
取证 → 决策 → 合同 → 生成实现 → 验证 → 接受 → 下一切片（首发后也接收试玩反馈）
```

与 2026-08-30 的旧版相比，主线在“发布”之后新增了“版本运营”“平衡调整”和“1.0 门”：首发不是终点，之后
还有 16 个版本的试玩修补与平衡，满足 1.0 门才转入第二轮。

## 2. 第二轮：增强

增强主线：

```text
交响音乐（1.0）→ 剧情语音 → 高清肖像 → 剧情画面（1.1）→ 地图特效 → 统一重编码（1.2）
```

单项增强闭环：

```text
提案评估 → 小样 → 用户决定 → 批量生产 → 自动筛查 → 人工审阅 → 导入清单 → 可选层集成 → 验证与发布
              ↓否决        ↓不如原版                ↑下一轮审阅
            换路线       取消并留痕
```

图中还标出两条否决路径（程序特效被否决后换路线、音效现代化取消），以及第一轮留下的底座：证据身份、模拟与
表现分离、私有素材供应链、调试与实验室。

## 3. 文件

### Archify

目录：`archify/`

- `*.archify.json`：可编辑的 typed JSON 源（workflow，schema v2）；
- `*.html`：自包含版本，带章节视图、路径动画、亮暗主题和演示模式，适合现场讲解；
- `*.svg`：浅色静态矢量图，适合嵌入文章；
- `*.png`：1440 × 900 浅色主图；
- `*.visual-check.*.png`：浅色／深色、两种桌面尺寸的截图；
- `*.visual-check.html`、`*.visual-check.json`：边界检查与截图回执。

来源工具：`tt-a1i/archify` 3.3.1，审阅版本 `62f3a995eb26ee23f784bdea4a7992340078e9be`，MIT。

### Fireworks Tech Graph

目录：`fireworks-tech-graph/`

- `*.fireworks.json`：可编辑的图表源（Blueprint 风格）；
- `*.svg`：矢量主文件；
- `*.png`：1920 px 宽的演示图片；
- `*.layout.json`：布局与质量报告。

来源工具：`yizhiyanhua-ai/fireworks-tech-graph` 1.2.0，审阅版本 `1ca1ff9cfcb67893a43d32b9ef3a1b782c44a46f`，MIT。

PNG 只保存在本地（见仓库 `.gitignore`），需要时从 HTML 或 SVG 重新导出。

## 4. 对比建议

- Archify：适合现场演示。HTML 可以逐章播放（第一轮：完整旅程、切片闭环、从切片到全战役、首发之后；第二轮：
  五类增强与压缩、单项增强闭环、否决与取消），也能切换亮暗主题、聚焦节点和追踪路径。第二轮图下方另有三张
  卡片：第一轮留下的底座、增强不变量、人是验收者。
- Fireworks Tech Graph：适合静态传播。SVG／PNG 在一页内放下更多阶段说明，用 Blueprint 图框、工程标题栏和
  反馈回路强调工程感；两轮的标题栏分别标 `ROUND 1 · REPLICATION` 和 `ROUND 2 · ENHANCEMENT`。
- 比较时并排打开同一轮的两个 `*.png`；讲解时打开 Archify 的 HTML。

## 5. 验证结果（2026-11-25）

- Archify：两张图的 `finalize`（validate、deliver、严格 check、真实浏览器 browser-check）全部通过；随后去掉
  HTML／SVG 的行尾空白（3.3.1 版输出带行尾空白，`git diff --check` 会报），再在最终文件上重跑 `visual-check`
  （containment、readability、viewer chrome、亮暗主题、截图），全部通过；
- Fireworks Tech Graph：两张图的 validate、render（showcase 构图门槛）、check（XML、几何、箭头 marker、碰撞、
  构图）全部通过；
- 四张主图都已人工查看：中文显示、节点遮挡、箭头方向、换行箭头和反馈回路。

第三方仓库只作为只读工具来源；生成时不安装依赖、不读取 `.env`，Archify 的更新检查已关闭
（`ARCHIFY_UPDATE_CHECK_DISABLED=1`），所有产物只写入本目录。

## 6. 重新生成

在本目录的对应子目录里运行（工具路径换成本机的克隆位置）：

```bash
ARCHIFY_UPDATE_CHECK_DISABLED=1 node <archify>/bin/archify.mjs finalize workflow round-2-enhancement-workflow.archify.json round-2-enhancement-workflow.html --quality showcase --json
```

```bash
python3 <fireworks-tech-graph>/scripts/fireworks.py render flowchart round-2-enhancement-workflow.fireworks.json round-2-enhancement-workflow.svg --report round-2-enhancement-workflow.layout.json
```

```bash
python3 <fireworks-tech-graph>/scripts/fireworks.py export-png round-2-enhancement-workflow.svg round-2-enhancement-workflow.png --width 1920
```

第一轮把文件名中的 `round-2-enhancement` 换成 `round-1-remake`。
