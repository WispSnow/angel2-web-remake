# ANGEL2 SAY 命令与剧情表现

日期：2026-07-15

## 结论

剧情并非只有一套解释器：

- 模块 25 的关前/过场解释器为 `0000:0736`，命令分发器为 `0000:07C7`；
- 模块 29 的战场内对白解释器为 `0000:BE14`，命令分发器为 `0000:BEC3`，`0000:BAB8` 会先把 battle-SAY 模式置为 `Y`；
- 两者逐字符读取 `^` 后的两个字母，正式共享 15 条命令；模块 29 另有 `DL`，共 16 条原生有效命令；
- 脚本语料还出现一次 `CW`，但两个分发器都没有 `CW` 比较。原版会消费 `^CW` 三个字符后无副作用返回，因此忠实模式必须把它保留为 no-op，不能解释为“清除全部窗口”；
- `;;` 是跳至 CRLF 的注释语法，不计入正式命令。

机器规格位于 `../parsed/native/story-presentations.json`，语义动作流已升级为 `../parsed/dialogue/*.json` 的 `semanticVersion: 2`。提取器 `../tools/angel2-story-presentations.mjs` 同时校验 34 段代码、12 段数据、97 张调色板正确的资源图和 4 张联系表。

## 命令表

| SAY | 模块 25 | 模块 29 | 原生效果 |
| --- | --- | --- | --- |
| `WU` | `0CD1` | `C3BF` | 选择并打开上方窗口；首次执行 11 步展开 |
| `WD` | `0DAA` | `C48C` | 选择并打开下方窗口；首次执行 11 步展开 |
| `CU` | `0EE2` | `C559` | 12 步关闭上方窗口并清 open flag |
| `CD` | `0E83` | `C5B8` | 12 步关闭下方窗口并清 open flag |
| `ME n` | `0A7B/0ACE` | `C2DF/C332` | 只解析并保存十进制编号；不加载也不绘图 |
| `HU n` | `11EB` | `BB1E` | 重新解析编号，读取 `D/n`，绘制上/左肖像组件 |
| `HD n` | `1255` | `BB85` | 重新解析编号，读取 `D/n`，绘制下/右肖像组件 |
| `PU` | `0904` | `C082` | 用 `A/20` 组件清理上方肖像区并清显示 flag |
| `PD` | `0926` | `C0D1` | 用 `A/20` 组件清理下方肖像区并清显示 flag |
| `PP n` | `0963` | `C120` | 读取 `BK/n`，把 `320×200` 图绘于 `(160,80)` |
| `BK` | `08B8` inline | `BEC3` inline | 备份当前 framebuffer/page；模块 29 保存的是战场视口各平面 |
| `W-` | `08D7` inline | `C047` inline | 读取并展开 `A/18` 对话窗图形；不取消当前窗口 |
| `KY` | `09A9` | `C1DA` | 等待输入；battle-SAY 模式无限等待 |
| `\\` | `08A6` inline | `BEC3` inline | `y += 20`，`x` 回到当前窗口文字起点 |
| `DL n` | 不识别 | `C074` inline | 把 `n` 原样交给 `D3B6`，精确等待 `n` 个 native tick |
| `ED` | `085E` inline | `C172` | 结束解释；模块 29 另重绘战场、地图、HUD 与覆盖层 |
| `CW` | 不识别 | 不识别 | 发布版 no-op；仅见于 SAY 1 第 25 行 |

`reverse/tools/angel2-dialogue.mjs` 已据此修正：

- `BK → backup_framebuffer`；
- `W- → load_window_graphics(A/18)`；
- `CW → native_noop`，不再改状态；
- `DL → wait_native_ticks`，字段为 `nativeTicks`；
- `ME → store_portrait_id`；
- `CU/CD → close_window`。

## 模块 25：关前/过场剧情

入口 `0000:05F2` 的顺序为：

1. `145F` 在 DS:`0F88` 的 `(stage,MAGIC record)` 表中线性查找当前关，读取资源索引 4 的 `MAGIC/72..79` 并启动 RIX；
2. `06C0` 检查 DOS/BIOS 向量兼容性，它不是剧情表现命令；
3. DS:`0E16` 的 50 项表若为 `FFFFh`，直接返回；否则从资源索引 `7/9/10` 读取同号 `SAY/NUM/CHA`；
4. 读取 `A/20`，初始化两个 framebuffer 页，并以 DS:`0DE6` 做 64 次 DAC 写入淡入；
5. `0736` 执行剧情；退出后调用 RIX stop。

因此“某关没有模块 25 剧情”并不等于“不选择音乐”：无剧情分支发生在 MAGIC 启动以后，而且该分支不会执行本函数末尾的 stop。

文字与布局：

- 初始坐标 `(172,210)`；ASCII 前进 8 像素，Big5 前进 16 像素，显式换行下移 20；
- 正常可见字符在未触发跳过输入时各等待 8 个 native tick；CR/LF 不绘制；
- 上窗文字起点 `(165,14)`，上肖像锚点 `(8,18)`；
- 下窗文字起点 `(109,272)`，下肖像锚点 `(512,210)`；
- `KY` 重绘当前肖像并一直等待动作/退出状态；它不清除窗口或重置文字坐标，确认后从下一条命令继续，同窗后续文字直接追加。

## 模块 29：战场内对白

`0000:BAB8` 把 `DS:80B0` 置为 `Y`，`BAC6` 读取同号 `SAY/NUM/CHA` 后进入 `BE14`。剧情直接覆盖在当前战场视口上；`ED/C172` 会重新载入 tileset，并依次重绘小地图、覆盖层、单位 HUD 和视口。

与模块 25 的可见差异：

- CR、LF、TAB 均跳过；其余字符步幅和正常 8-tick 节奏相同；
- `DS:10EB bit 0` 对应玩家可见的“說話”开关；开启时 `C9B9` 预载
  `MAGIC/57..71` 的 15 个短 VOC。每个非标点 Big5 字符按“Big5 数值模
  15”选择 `MAGIC/(57+余数)`，等待该段播完后再进入 8-tick 字形等待；
  `，．？！「」` 和 ASCII 不发声；
- 主操作键快进时同时跳过剩余逐字 VOC 与 8-tick 等待；
- 上窗文字起点 `(165,22)`，上肖像 `(32,26)`；
- 下窗文字起点 `(109,262)`，下肖像 `(504,200)`；
- `KY` 在 battle-SAY=`Y` 时无限等待；同一解释器的另一路非战斗模式会在 21 次一 tick 轮询后自动返回；
- `DL` 只在这里存在。11 次调用全部位于 SAY 74，序列为 `9,9,8,8,7,7,6,6,5,5,4`。

SAY 74 交替执行 `D/56` 和 `D/67`，制作龙王从灰白到棕色的快速变色。记录 67 没有肖像元数据；查找失败后原版保留上一次 D/56 的名字与布局，再加载 D/67 图像。这不是资源缺失，而是对原生“沿用旧元数据”行为的有意利用。

## 肖像元数据

模块 25 `12BF/1326` 依次搜索 DS:`081E`、`049F`、`0DC0` 的三张指针表。每项指向：

```text
u8 portraitId
u8 nativeLayout[4]
Big5 displayName
'$'
```

三表合计包含有效编号 0–62、64–66；63 与 67 没有条目。重复 id 以搜索顺序中的第一项为准。66 项有效名字、四个布局字节、原地址和全部候选项均已写入 `story-presentations.json`。

视觉资源方面，`A/18` 的前三张图就是肖像纹理框，而不是可由通用 CSS 边线替代的装饰：

- frame 0 是 `112×17` 顶饰，绘于肖像原点 `(x,y)` 的 `(x,y-15)`；
- frame 1 是 `112×23` 姓名牌，绘于 `(x,y+108)`；原版从 `(x+24,y+111)` 开始绘制元数据姓名；
- frame 2 是带 mask 的 `8×8` 侧饰，从 `y` 起每 8 px 重复 15 次，左右 X 分别为 `x` 与 `x+107`。

因此完整肖像组合相对 `112×112` 主图占据 `x=0..114、y=-15..130`；顶部、姓名牌和右侧
各自会略超出主图。三张图的尺寸、哈希、原生相对坐标与姓名落点已经写入
`story-presentations.json#dialoguePortraitFrame`，浏览器生成器据此拒绝资源漂移。

`A/18` frame 3–11 则组成文字窗。原生展开例程从四个 X 游标
`[313,337,345,361]` 开始，每次先绘制当前帧，再按 `[-16,-16,+16,+16]` 更新游标，
共执行 11 次。frame 3／6／6／9 形成顶行，4／7／7／10 在 `y=24/40/56` 形成三行中段，
5／8／8／11 在 `y=72` 形成底行；最终窗体是 `400×86`，文字内缩 `(12,12)`。模块 25
上／下窗锚点是 `(153,2)`／`(97,260)`，模块 29 是 `(153,10)`／`(97,250)`。结合完整
肖像纹理边界，模块 25 的上／下窗间距为 30／15 px，模块 29 为 6／7 px。frame 3–11
的尺寸、哈希、累积顺序、复合图哈希、两套锚点与两套间距均写入
`story-presentations.json#dialogueTextWindow`。

这里的 `(12,12)` 是两套 SAY 解释器的常规文字起点，不代表所有复用 `A/18` 的调用者
都沿用该光标。模块 29 的胜负／存档反馈与转职 `0487h` 另经 `08DDh` 绘字：上窗光标
为屏幕 `(180,30)`，即窗内 `(27,20)`；转职下窗光标为 `(140,270)`，即窗内 `(43,20)`。
这些路径共享同一套窗口图形和 `16/8 px` Big5／ASCII 步幅，但光标由各调用者写入。

`D/0..67` 的 `112×112` 主肖像已全部按 DS:`0DE6` 出图；此前通用 renderer 因 D/63 的 mask 指针表非单调而漏掉记录 63，新提取器按原生“每平面独立读当前 image pointer”规则恢复了它。`A/20` 同样由原生单指针规则恢复为 `40×41` 清理纹理。

表 C 的 `DS:0C84` 另有一笔休眠数据错误：`D/59` 弓兵的四字节布局是
`(40,24,64,32)`，但 `16×16` 睁眼 frame 1 在眼位 `(40,24)` 与主肖像不匹配，移到
`(56,24)` 后逐像素完全一致；口位 `(64,32)` 本身正确。剧情语料直接引用的 50 个肖像
id 不含 `59`，战斗单位详情只读取 frame 0，因此发布版可达流程不会显示这笔错误。
这是原版数据事实；Web 默认修复见 `../gdd/web-remake-rule-decisions.md#remake-010校正-d59-弓兵的休眠眼部坐标错误`。

## 语料覆盖

176 个 SAY 记录共有 5,591 个结构化动作、4,057 个命令动作。93 个记录含正式命令；其余 83 个是名字、提示或其他文字表，而不是完整剧情脚本。

- 模块 25 表产生 19 次调用、18 个不同记录；
- 模块 29 的 38 个逐关处理器引用 72 个不同记录；
- 两组只重叠记录 47，合计闭合 89 个不同命令脚本；
- 全运行图审计进一步枚举模块 29 剧情选择器 `DS:80B5` 的 86 个显式引用：75 次立即写（其中 72 次来自逐关处理器）、2 次由 `DS:30BA/1273` 映射表产生的动态写和 9 次读取；与模块 25 固定关卡表合并后，命令脚本 69、116、117、118 恰好是仅有的四条无发布版生产者记录。它们作为归档内容保留，不接入忠实模式；
- `PP` 全语料引用 16 张背景：`1,3,5,6,7,8,10,11,12,13,14,15,16,22,23,31`；
- `HU/HD` 直接引用 50 个肖像 id；完整容器仍保留并渲染 68 条记录。

## 可复现命令

```sh
node reverse/tools/angel2-dialogue.mjs --self-test reverse/extracted/SAY
node reverse/tools/angel2-dialogue.mjs --compile-all \
  reverse/extracted/SAY reverse/parsed/dialogue

node reverse/tools/angel2-story-presentations.mjs --render \
  reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin \
  reverse/decoded reverse/parsed/dialogue \
  reverse/renders/story-presentations

node reverse/tools/angel2-story-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/stage-events.json \
  reverse/converted/audio/manifest.json \
  reverse/parsed/dialogue reverse/renders/story-presentations \
  reverse/parsed/native/story-presentations.json
```

## 保留边界

native tick 已闭合为标称 10.000151 ms，Web 使用 10 ms 逻辑量子；仍未给低层 VGA 页拷贝函数强行命名。模块 29 的 15 段资源已绑定为玩家可见“說話”开关控制的逐字 VOC，不再列为未知。以上保留边界不影响命令、资源、坐标、窗口步数、逐字声或原生 tick 顺序的复刻。
