# `B.SWF` 逐关战斗模板格式

日期：2026-07-14

## 结论

模块 27 已把 `B.SWF` 的奇数记录与场景号、战斗状态和 `JUST.TST` 写入链完整连接起来。原生选择表实际有 44 项：场景 `0..38` 是 39 个普通入口，场景 `39..43` 是五个特殊/替代入口。每个被选中的模板恰为 8,506 字节，不是先前暂定的“56 字节前缀 + `65×65` 单元”。原生消费者确认其实际布局是：

| 解码偏移 | 字节 | 原生目标 | 已确认含义 |
| ---: | ---: | --- | --- |
| `0000h` | 256 | 模块 27 DS:`02B8`；模块 29 DS:`2E7D` | 128 个 `u16` 地形描述偏移；原始 token 查此表后索引 `UN/0056` 的逻辑属性页 |
| `0100h` | 2,500 | 模块 27 段指针 DS:`004B` | `50×50` 原始地形 token 图；战斗模块中目标为 DS:`01A7` |
| `0AC4h` | 2,500 | 模块 27 段指针 DS:`004F` | `50×50` 单位槽图；低 7 位为 0–74 槽号 |
| `1488h` | 2,500 | 模块 27 段指针 DS:`0051` | `50×50` 阵营/占用图；0 为空，1/2 为双方单位，`FFh` 为未填入的玩家部署格 |
| `1E4Ch` | 150 | 模块 27 DS:`03E0` | side 2 的 75 个职业记录号 |
| `1EE2h` | 150 | 模块 27 DS:`050C` | side 1 的 75 个稀疏职业覆盖值 |
| `1F78h` | 150 | 模块 27 DS:`0476`；模块 29 DS:`5644` | side 2 的 75 项逐槽 AI 行为值 |
| `200Eh` | 150 | 模块 27 DS:`0708`；模块 29 DS:`3BFD` | side 1 的 75 项逐槽 AI 行为值 |
| `20A4h` | 150 | 模块 27 DS:`079E` | 出场名单标志；非零时对应战役单位槽出现在部署名单，写 `JUST.TST` 前消费 |

精确总量为 `256 + 3×2500 + 5×150 = 8506` 字节。

## 地形 token、图块与逻辑槽（C）

同一个原始 token 有两条并行、均已闭合的用途：

1. **可见图形**：token 直接选择配对偶数 `B` 记录中的同号图块。每个位平面按 `token × 220` 定位，再复制 44 行、每行 5 字节，四个位平面合成为 `40×44` 像素图块。
2. **玩法属性**：token 选择本模板首段的一个 `u16` 偏移；该偏移索引 `UN.SWF` 记录 56 解出的第一张 2,200 字节页，得到 `MAP.SWF` profile 的逻辑槽 `0..22`。

模块 29 `4D65h` 解出 `UN/0056` 的 4,400 字节并分成两页；`1000:3EC6h/946Ah` 消费第一页。第二页由 `285Dh/28A4h` 用同一描述偏移查出 VGA 调色板索引，把每个非零 token 绘制成 `3×3` 小地图色块；50×50 格形成 150×150 地形小地图。首段通过 `JUST.TST` 偏移 7,952 以及 `WAR` 偏移 10,688 保存/恢复到 DS:`2E7D`，证明它不是临时图形目录。44 个场景共有 36 张不同描述表；所有 128 个 token 都在现存模板中出现并能合法解析，实际使用的逻辑槽为 `0..16,18..21`，槽 17、22 在这些模板中没有配置引用。

小地图的模板叠加也已按原生代码恢复。阵营/占用图值 1、2、`FFh` 分别画成黑色 `4×4` 外框加颜色 10、11、15 的 `2×2` 内芯；模块 27 现已确认 `FFh` 是未填入的玩家部署格，故白色标记就是部署区域。44 张地形+占用图见 `reverse/renders/battle-maps/minimap-occupancy/`。当前 10×7 战场视口另以黑色 `30×21` 外接边框表示，鼠标悬停预览使用白框；五张编号存档的真实视口叠加见 `reverse/renders/battle-maps/save-minimap/`。

偶数记录的每个位平面为 29,184 字节，其中前 `128×220=28,160` 字节是图块区，末尾 1,024 字节是全零填充。44 组×4 平面均通过零值校验，原生 token 最大寻址也不会进入该区域。原生视口为 `10×7` 格，步长即 `40×44`；已生成 44 张 `50×50`、`2000×2200` 的完整静态战场图，全部 token 引用有效。机器映射见 `reverse/parsed/native/terrain-token-map.json`，渲染 manifest 见 `reverse/renders/battle-maps/confirmed/manifest.json`。

## 场景选择与载入链

模块 27 使用 `DS=095Ah`。`0000:0718` 从 DS:`08CA` 按当前场景取一个 `u16`，加一后以 `BX=0Ch` 调用主程序索引资源读取器；资源索引 12 对应启动表中的 `B.SWF`。表的 44 项严格为：

```text
0, 2, 4, ..., 76, 0, 48, 64, 84, 86
```

所以普通场景 `n` 使用 `B.SWF` 记录 `2n+1`；场景 `39..43` 则依次使用记录 `1,49,65,85,87`。其中 39–41 复用普通场景 0、24、32 的模板，42–43 使用末两条独立模板。载入器解压记录后按上表顺序复制九段数据；44 个映射入口均已结构化。

奇数记录 79、81、83 不被这张 44 项选择表引用。全局资源读取审计进一步穷举十个运行模块：只有模块 27 的上述奇数模板选择、模块 29 的 `record=currentStage×2` 偶数图块读取和模块 46 的常量 `B/88` 三个 `B.SWF` 生产点。因此三个奇数记录都没有发布版读取路径。它们也不是独有内容：压缩 payload 与解码结果均逐字节满足 `79=21、81=49、83=65`。其中偶数 `78/80/82` 仍由模块 29 在场景 39/40/41 读取，并分别逐字节复制 `20/48/64`；不能把整对记录笼统称为未使用。机器证据见 `reverse/parsed/native/b-record-audit.json`。

side 1 职业段不是完整替换表。模块 27 先从上层战役状态导入玩家职业数组到 DS:`050C`；随后 `0000:082D` 对 75 个模板值逐项处理：值为 0 时跳过目的槽，非 0 时才覆盖。因此原始 `B` 记录中的 side 1 零值表示“保留战役职业”，不能解释为强制变成记录 0“士兵”。

## 部署标志与名单（C）

模块 27 `0000:1907/1884` 扫描阵营图中的 `FFh`。不存在时直接写 `JUST.TST`；存在时进入部署界面。44 个映射模板中有 33 个交互部署入口、11 个直接写入口，合计 423 个 `FFh` 部署格。

`0000:08CB` 把 DS:`079E` 中的非零项转换为名单；现有模板的非零值全部为 1。`0000:0898` 把模板中已经位于 side 1 格的单位同时标为“已选”和“固定”。`0000:0D61` 允许未选名单单位填入当前 `FFh`，也允许非固定单位撤下并恢复 `FFh`；固定单位会显示不可放弃提示。按“結束”后写出 `JUST`，模块 29 `1000:543B` 再把未使用的 `FFh` 清成空格。

完整分页文字、放置/撤下副作用、胜负与重试/继续状态机见 `battle-lifecycle.md`，机器数据见 `reverse/parsed/native/battle-lifecycle.json`。

## `JUST.TST` 的真实角色

模块 27 `0000:0FF8` 会创建并截断 `JUST.TST`，依次序列化：

1. 单位槽图；
2. 阵营图；
3. side 2 职业；
4. 已合并后的 side 1 最终职业；
5. side 2 逐槽 AI 行为值；
6. 当前场景号；
7. 原始地形 token 图；
8. 256 字节、128 项地形描述偏移表；
9. side 1 逐槽 AI 行为值。

这九段合计 8,358 字节，再使用与战中存档相同的 RLE/XOR 格式写盘。模块 29 在未选编号 `WAR` 槽、上层值为 `N` 时由 `1000:5386` 恢复这份文件。

因此 `JUST.TST` 不是只服务新游戏第一战的静态初始模板，而是模块 27 为下一场战斗重新生成的短格式模板。仓库中的当前样本场景号为 0，所以它恰好是第一战状态；该样本身份不能推广为文件格式的唯一用途。

## 记录 35–38 与内部值 39

映射模板给出了特殊职业的直接实例化证据：

| 场景 | B 记录 | 槽 | 模板职业值 | 初始位置/状态 | 结论 |
| ---: | ---: | ---: | ---: | --- | --- |
| 20 | 41 | 28 | 36 | 初始阵营图中未激活；第 1 回合清除 16 个半龍戰士后动态加入 `(29,16)` | “龍”替换初始敌军并成为胜利目标 |
| 22 | 45 | 28 | 36 | 初始阵营图中未激活；第 1 回合动态加入 `(22,24)` | “龍”是本关唯一胜利目标 |
| 30 | 61 | 27 | 35 | side 2，`(28,17)` | “女帝”是活动战斗实例 |
| 37 | 75 | 56 | 37 | side 2，`(23,11)` | “頭”是活动实例 |
| 37 | 75 | 54 | 38 | side 2，`(22,12)` | 第一只“手”是活动实例 |
| 37 | 75 | 55 | 39 | side 2，`(24,12)` | 第二只“手”使用内部值 39 |
| 42 | 85 | 23 | 35 | side 1，`(23,22)` | 特殊入口直接把该槽覆写为“女帝” |

模块 29 `0000:510C` 会把槽内原值保留在当前职业变量 `318Ch`，但用于描述符查找的副本若大于 38 就钳制为 38。因此场景 37 的值 39 不是第五条 `DATA` 记录，也不是解析越界；它是复用记录 38“手”描述符的第二只手内部变体。三格位置形成头在上、两手分列左右的明确同场组合。

这已经把“龍/頭/手是否会同场组合”中的“頭 + 两只手同场”提升为 C。后续模块 29 分析进一步确认：三个槽各有独立的 24 字节状态结构、当前生命和棋盘行动位；死亡只清当前格；胜利要求 side 2 全部消失，所以头和两只手都必须击破；三个部位不能移动，且三者存活时每敌方阶段各提交一次专用行动。详见 `special-unit-behavior.md` 与 `turn-action-system.md`。

38/38 个逐关处理器也证明模板必须与运行时事件叠加使用：场景 0/1/6/11/20/21/22/42 会移动、加入或清除棋盘单位；其中场景 20 第 1 回合先清掉 16 个静态 side 2，再加入槽 28“龍”。场景 14–19 从第 6 回合起把模板载入的 75 个 side 2 AI 行为统一改为 0；场景 30 则把 side 2 槽 27 的职业记录改为 0但保留棋盘占用，之后每次击破按难度上限推进记录，最终转成 side 1 槽 23“女帝”。场景 37/38 的静态编队叠加首回合对白和主结局/追加战路由。详见 `stage-events-and-campaign-routing.md`。

场景 16–19 的过场函数把资源读取号依次设为 35–38，但这些值属于资源容器记录号，不能再单独当作职业实例化证据。职业实例应以本模板的 side 2 职业数组及运行时写入为准。

## 可重复导出

```sh
reverse/tools/angel2-battle-templates.mjs --extract \
  reverse/decoded/B \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/unit-descriptors.json
reverse/tools/angel2-b-record-audit.mjs --extract \
  reverse/unpacked/lzexe-modules/raw reverse/extracted/B reverse/decoded/B \
  reverse/parsed/native/b-record-audit.json
```

JSON 保留每关九段的 SHA-256、128 个配置字、双方职业/行为表与出场名单标志共五张 75 项数组、活动单位坐标/阵营/槽号/职业/行为、全部部署格坐标、名单/固定/可选槽、地形 token、单位槽及阵营图的摘要，以及所有特殊职业槽。完整 7,500 字节图数据不在 JSON 中重复，仍由对应 `00.raw` 无损保存。

```sh
reverse/tools/angel2-terrain-mapping.mjs --extract \
  reverse/parsed/native/battle-templates.json \
  reverse/decoded/B \
  reverse/decoded/UN/0056/00.raw \
  reverse/parsed/native/map-rules.json \
  reverse/parsed/native/terrain-token-map.json
reverse/tools/angel2-battle-map.mjs --render-all \
  reverse/decoded/B \
  reverse/parsed/native/battle-templates.json \
  reverse/renders/battle-maps/confirmed
reverse/tools/angel2-battle-map.mjs --render-minimap-all \
  reverse/decoded/B \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/terrain-token-map.json \
  reverse/renders/battle-maps/minimap
reverse/tools/angel2-battle-map.mjs --render-minimap-occupancy-all \
  reverse/decoded/B \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/terrain-token-map.json \
  reverse/renders/battle-maps/minimap-occupancy
reverse/tools/angel2-save-minimap.mjs \
  reverse/extracted/saves/decoded \
  reverse/decoded/UN/0056/00.raw \
  reverse/renders/battle-maps/save-minimap
```

## 制作历史与兼容边界

1. 奇数记录 79/81/83 的无读取路径与逐字节重复关系已闭合；发布文件为何保留这些副本属于不可恢复的制作历史，不构成规则或素材缺口。
2. 记录 36“龍”在场景 20/22 的动态激活、场景 37 頭/手专用效果、三部位生命、死亡、胜负、禁止移动、逐部位行动次数和终局路由均已闭合；场景 20/22 的完整聚焦、生成与移动时序见 `stage-event-presentations.md`。

逻辑槽名称不再列为模板格式缺口：DS:`2E7D` 的六个战斗运行时读取点均已审计，没有名称/HUD 消费者。若未来需要编辑器友好名称，应作为推断标签单独维护，不能写成原版事实。
