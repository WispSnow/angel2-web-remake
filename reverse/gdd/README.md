# 《天使帝国 II》原版 GDD 复原区

## 当前状态

这里记录的是“从原程序与实机证据复原出来的原版设计”，不是 Web 复刻版的实现方案。任何 Phaser 开发、系统重构和 Mod 设计都暂缓。

独立的 Web 复刻玩法文档位于 [`design/remake-gdd/`](../../design/remake-gdd/README.md)；其中的产品选择不会反向改写本目录的原版事实。

当前 GDD 为 **Draft 0.46 / 待用户评审**。28 个原始文件与 14 个索引容器已完整盘点，11,168 个字形和主要图像/VOC/RIX/剧情记录均已提取；10 个运行模块也已完成 LH7 与 LZEXE 两层解包。39 个兵种、31 条转职边、普通战斗、射击、全部玩家技术、八槽状态、AI 主链、23 个地形规则槽、全部可达范围模式、39 个普通模板与五个特殊入口均有机器规格。六个 `.TST`、部署与普通单场生命周期、84 项目标、38/38 个逐关处理器、标题/剧情/反馈/HUD/战后/终幕编排、`WD` 和第 26 关阶段尾特效同样闭合。Draft 0.46 又以模块 21/25/29 的原生 VGA Map Mask 证明四条资源流应映射到颜色 bit `3..0`，全量重渲染受影响 PNG，并恢复模块 21 的 password 专用调色板；该版本的八项 `stableRemake` 决策均已确认，用户又于 2026-08-02 新增 `REMAKE-009`，当前共九项。机器审计仍覆盖 138 条证据：120 条纯 C、18 条混合边界、实现必需未知 0；第一阶段只差用户评审，开发仍冻结。

## 证据等级

- **C / confirmed**：由文件边界、原生代码或实机行为直接确认。
- **S / strong**：多项独立证据一致，但仍缺一项原生访问或实机验证。
- **T / tentative**：可检验假设，只用于指导下一次观察。
- **U / unknown**：尚未命名或解释，必须原样保存。

## 第一阶段完成门槛

进入 Phaser 开发前，至少要同时满足：

1. 28 个原始文件全部归类；所有可提取资源有 manifest、哈希和可重复命令。
2. 图像、字体、VOC、RIX、剧情记录达到完整提取；每类未解项有明确清单。
3. 至少完整记录一场原版战斗从部署/开局到胜负结算的状态流程。
4. 39 条 `DATA/MAP` 记录的关键字段完成命名，伤害、移动、经验/升级和射击/技术消耗公式有实机或代码证据；玩家技术链已确认无独立 MP 字段。
5. `B.SWF` 的 39 个普通战斗模板字节布局、偶数记录 `128×40×44` 图块、零填充尾部、原生绘制顺序、token→逻辑槽及小地图颜色/占用/视口映射均已确认；逐槽数组已命名为 AI 行为，场景标志已命名为部署名单。地形槽原版名称绑定经审计不存在，不再作为格式门槛。
6. 五个 `WAR*.TST` 槽位的编码、字节布局、五项可见元数据、双方 60×24 字节单位动态状态和 772 字节尾段主要语义已确认，`JUST.TST` 的逐关生成、部署与载入角色已确认；关卡目标布尔条件、38/38 个逐关事件处理器与九个特殊表现时间轴已完整分类。不可恢复的兼容字原名不作为规则门槛。
7. `original-gdd.md` 中所有“实现必需”条目达到 C 或 S；T/U 项不会迫使实现者猜规则。
8. 用户明确评审并同意结束第一阶段。

## 文件

- `original-gdd.md`：原版游戏设计文档主体。
- `evidence-register.md`：关键结论、等级、来源与待验证动作。
- `phase-1-gate-review.md`：资源提取子目标与第一阶段整体门槛的逐项复核。
- `phase-1-review-checklist.md`：Draft 0.46 的用户评审摘要、保留边界与签署项。
- `web-remake-rule-decisions.md`：用户确认的稳定复刻规则与可选严格兼容边界。
- `../notes/asset-extraction-status.md`：资源覆盖矩阵。
- `../notes/raw-glyph-assets.md`：全部字形图集与可直接用于 GDD 的 UI 术语证据。
- `../notes/go-debug-symbols.md`：`GO.EXE` 的原始 Borland 符号。
- `../notes/title-new-continue-flow.md`：标题、四项难度、五槽继续、共享状态与直接演出资源。
- `../notes/title-presentations.md`：标题前 Logo、滚动开场、标题两套素材、空闲重播、难度/继续界面的逐帧与 RIX 时间轴。
- `../notes/music-catalog.md`：`MUSIC/0..40` 功能目录、奇数入场/偶数循环协议、玩家/敌方逐关表及待实机曲目。
- `../notes/say-command-semantics.md`：模块 25/29 剧情解释器、完整命令语义、窗口/肖像/文字/等待/RIX 时间轴及语料覆盖。
- `../notes/error-and-outcome-presentations.md`：部署错误条、普通胜利/撤退/失败/退出窗口、逐字声、确认菜单和五槽胜利存档。
- `../notes/native-timing.md`：九个发布运行模块的 PIT0、INT 08h、本地计数器与 10 ms Web 逻辑 tick 契约。
- `../notes/password-gate.md`：模块 29→21 的一次性密码门、三次问答、28 项答案、失败锁死与 `PLAY.COM` 补丁。
- `../notes/runtime-module-format.md`：`UN.SWF` 运行模块头、重构方式与入口清单。
- `../notes/native-unit-table-access.md`：解包后原生代码对 `DATA/MAP` 的 39/35 条循环、字段偏移与特殊记录边界。
- `../notes/js3-config-format.md`：`AG2.JS3` 的 Joymouse 输入配置格式和当前键位。
- `../notes/input-and-battle-ui.md`：语义输入层、部署/战场键鼠规则、行动/集体/系统菜单、右侧面板与单位 HUD。
- `../notes/unit-detail-hud-presentations.md`：单位详情的精确几何、动态肖像、五行数值、双竖条、状态图标、回合与第 37 关隐藏。
- `../notes/battle-range-and-target-presentations.md`：范围临时图、零/非零地形明暗、普通攻击/移动/射击/技术/工兵输入门及独立地图特效层。
- `../notes/battle-template-format.md`：44 项 `B.SWF` 场景映射、模板布局、`JUST.TST` 生成链与特殊 Boss 实例。
- `../notes/battle-lifecycle.md`：部署名单/格、`JUST/WAR` 开战分支、标准完整回合、`999/1000`、胜利/失败与模块跳转。
- `../notes/stage-events-and-campaign-routing.md`：38/38 个逐关处理器、动态棋盘/状态事件、模块 25/27/29/33/35/46 路由与终局闭环证据。
- `../notes/stage-event-presentations.md`：特殊逐关事件的聚焦/写入可见边界、逐格移动、声音、场景 30 短句及九关完整编排。
- `../notes/postgame-ending-and-credits.md`：22 张战绩卡、条件结局、制作人员表、资源/等待规则与模块 46 永久终幕。
- `../notes/battle-objective-format.md`：84 个胜负表项、逐关目标与额外场景入口。
- `../notes/special-unit-behavior.md`：场景 37 多部位 Boss 的独立状态、专用属性、移动、死亡与胜负规则。
- `../notes/ordinary-combat-formulas.md`：普通攻击、地形防御、反击、生命、经验、状态与累计成长公式。
- `../notes/ordinary-combat-presentations.md`：普通攻击地图/全屏分流、受击/死亡帧表、职业图形选择、五槽音效和先攻/反击编排。
- `../notes/shooting-presentations.md`：射击棋盘帧序、魔弓线形增长/收尾、音效、迅龙闪避不对称及目标双次半伤害。
- `../notes/technique-presentations.md`：落雷、炎暴、冰雪、治疗与回復的资源、描述符、VOC 请求、固定等待和规则同步边界。
- `../notes/status-lifecycle.md`：八槽完整回合倒计时、施毒公式、混乱的 AI 行为覆写与零生命棋盘边界。
- `../notes/movement-terrain-rules.md`：`MAP` 的 23 槽/24 字重叠布局、移动规则、地形防御与范围生成证据。
- `../notes/turn-action-system.md`：阵营阶段、逐格行动位、移动/攻击/射击/技术/休息提交与场景 37 三部位调度。
- `../notes/shooting-and-technique-system.md`：3 种射击、13 职业三阶段菜单、36 项分发及玩家技术核心公式。
- `../notes/ai-decision-system.md`：AI 职业分派、生命阈值、目标选择、敌我射击差异、14 组技能池、33 项参数表及原生异常。
- `../notes/unit-data-and-promotions.md`：外部修改表的逐值验证、39 个原生兵种记录、合并兵种目录与完整转职图。
- `../notes/campaign-roster-and-stage0.md`：战役角色显示描述符、职业视觉回退、新游戏初值、第 0 关六名我方与具名敌骑兵身份/职业/开场镜头。
- `../manifests/resource-coverage.json`：机器可读覆盖表。
