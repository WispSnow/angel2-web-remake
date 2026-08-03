# 非射击技术表现：落雷、炎暴、冰雪、治疗与回復

## 范围与证据

本专题闭合玩家与 AI 共用的五个技术家族、18 项动作：`1L..4L` 落雷、`1F..4F` 炎暴、`1C..4C` 冰雪、`1H..3H` 治疗、`1I..3I` 回復。数值、目标和经验仍以 `shooting-and-technique-system.md` 与 `technique-rules.json` 为准；本文只记录资源、描述符顺序、VOC 请求点、固定 native tick 和“表现何时交给规则结算”的边界。

机器可读结果是 `../parsed/native/technique-presentations.json`。重复导出命令：

```sh
node reverse/tools/angel2-technique-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/converted/audio/manifest.json \
  reverse/extracted reverse/decoded reverse/renders/planar \
  reverse/parsed/native/technique-presentations.json
```

生成器校验 46 段代码、9 段数据、25 个图形记录、8 个 VOC 记录和 10 张联系图。当前仍维持 `implementationFrozen=true`。

## 五个家族的共同边界

这五类技术都直接使用棋盘/地图效果描述符，没有进入普通攻击的全屏演出链。公共原语为：

- `0000:628E` 准备选中目标与范围图；
- `0000:FD8E` 载入资源记录，`1000:937A` 解压图形；
- `0000:0220` 直接提交已载入 VOC；`0224→0228` 先检查 DS:`10EDh` bit 0 的“战斗音效”分类开关，再进入同一个底层请求。两者不是不同混音通道；底层仍受 `SET.TXT` 的 Sound Blaster 驱动门约束；
- `0000:6425/642B/64A1` 分别清效果缓冲、无等待绘制、整批刷新并等待；
- `0000:64B7` 直接绘制当前描述符并等待 DS:`522Ah`；
- `0000:63CF` 收尾并移除零生命单位。

最重要的同步规则是：落雷、炎暴、冰雪、治疗和回復都先完成本文记录的全部固定图形阶段，再开始扣血、护盾消费、位移或治疗。复刻时不能在第一帧命中画面出现时提前修改棋盘规则状态。

“native tick”是原程序等待原语的输入；发布程序标称每 tick 10.000151 ms，Web 忠实层按 10 ms 逻辑量子调度，但仍不把它混同于显示帧率。

## 治疗 `1H..3H`

三档治疗都有一个共同尾段：载入 `MAGIC/0`，每帧 15 tick，只播放 DS:`608Ah` 表的前五项，共 75 tick。原表还有第六个指针 DS:`60CAh`，其中 tile code 为 6，但循环次数硬编码为 5，且 `MAGIC/0` 正好只有五张渲染帧；第六项是必须原样记录、不能播放的原版孤项。

| 动作 | 分级表现 | VOC 请求 | 共同尾段 | 固定图形等待 | 生命修改 |
| --- | --- | --- | ---: | ---: | --- |
| `1H` | `UN/61` 的 tile code `1..39`，再画空白 0；40 次×5 tick | 开始时 `E/36`，走 `0220h` | `MAGIC/0` 75 | 275 | 全部动画后，24% 最大生命 |
| `2H` | `MAGIC/37` 的七描述符序列重复两次；14×10 | 开始时 `E/36`，走 `0220h` | `MAGIC/0` 75 | 215 | 全部动画后，36% 最大生命 |
| `3H` | `MAGIC/42` 正序 5×6，`MAGIC/41` 六项重复三次 18×5，`MAGIC/42` 逆序 5×8 | 第一阶段 30 tick 后请求 `E/36`，走 `0220h` | `MAGIC/0` 75 | 235 | 全部动画后，48% 最大生命 |

`1H` 的 39 帧联系图：[`../renders/contact-sheets/techniques/UN-0061-heal-1.png`](../renders/contact-sheets/techniques/UN-0061-heal-1.png)。

## 范围回復 `1I..3I`

三档回復的直接表现完全相同：`MAGIC/20 + E/36`，VOC 在动画开始时走 `0220h` 请求。DS:`6C1Dh` 有 17 个描述符阶段：tile code 序列为 `1,1,1,2,3,4,5,6,7,8,9,10,1,1,1,0,0`。每个阶段先在所有同阵营占用格无等待绘制，再统一刷新并等待 15 tick，所以总固定等待是 `17×15=255` tick，不是按受治疗单位数倍增。

只有 17 阶段结束后，`1000:6FFE` 才扫描同阵营格并按 `1I/2I/3I` 的范围值治疗。三档只改变范围图和回复数值，不改变图形、声音或等待。

帧联系图：[`../renders/contact-sheets/techniques/MAGIC-0020-recovery.png`](../renders/contact-sheets/techniques/MAGIC-0020-recovery.png)。

## 冰雪 `1C..4C`

四档冰雪共用 `MAGIC/10 + UN/50`。每个扩散循环开始时都通过 `0224h` 请求一次 `UN/50`，随后按 tile code `1..6` 画六个阶段，每阶段 10 tick。循环次数是效果半径减一：

| 动作 | 效果半径 | 扩散循环 | `UN/50` 请求 | 绘制次数 | 固定图形等待 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `1C` | 3 | 2 | 2 | 12 | 120 |
| `2C` | 4 | 3 | 3 | 18 | 180 |
| `3C` | 5 | 4 | 4 | 24 | 240 |
| `4C` | 6 | 5 | 5 | 30 | 300 |

`1000:6886` 在全部扩散结束后才扫描敌人并执行向低范围值格的位移；动画期间不提前搬动单位，也不扣生命。

帧联系图：[`../renders/contact-sheets/techniques/MAGIC-0010-ice.png`](../renders/contact-sheets/techniques/MAGIC-0010-ice.png)。

## 炎暴 `1F..4F`

前三档各在开始时载入并通过 `0224h` 请求 `MAGIC/83`，随后完成单一图形序列。究级炎暴有三个图形阶段和两个声音请求：

| 动作 | 图形阶段 | VOC 请求点 | 绘制/等待 | 固定图形等待 |
| --- | --- | --- | --- | ---: |
| `1F` | `MAGIC/22` 七描述符 | 开始时 `MAGIC/83` | 7×10 | 70 |
| `2F` | `MAGIC/23` 十二描述符 | 开始时 `MAGIC/83` | 12×10 | 120 |
| `3F` | `MAGIC/27` 十三描述符 | 开始时 `MAGIC/83` | 13×15 | 195 |
| `4F` A | `MAGIC/30`：四项直画，再把四项组重复两次 | 开始时 `MAGIC/83` | 12×10 | 120 |
| `4F` B | `MAGIC/28`：八项直画，再把 DS:`67EAh` 向上移一格重复五次 | A 后请求 `E/51` | 13×10 | 130 |
| `4F` C | `MAGIC/29` 四项 | 无新请求 | 4×10 | 40 |

`4F` 总固定图形等待为 290 tick。四档都在所有图形结束后才把等待改为 1 tick，并按 DS:`5230h` 调用 `0000:64D6` 逐点扣血；最后由 `0000:63CF` 移除零生命目标。

究级炎暴联系图：

- [`MAGIC/30`](../renders/contact-sheets/techniques/MAGIC-0030-fire-4-a.png)
- [`MAGIC/28`](../renders/contact-sheets/techniques/MAGIC-0028-fire-4-b.png)
- [`MAGIC/29`](../renders/contact-sheets/techniques/MAGIC-0029-fire-4-c.png)

## 落雷 `1L..4L`

落雷由“每级独有的开场/主体 → 按范围值扫过敌人的双相命中波纹 → `MAGIC/6` 五阶段全敌人收尾 → 数值结算”四层组成。双相波纹每个距离迭代画两次，每次 2 tick；迭代数为 `(范围图最大值-1)+每级波纹宽度`。`MAGIC/6` 收尾固定为五阶段×10 tick=50 tick。

| 动作 | 每级独有主体 | VOC 请求点 | 双相命中资源/参数 | 主体+命中+收尾 | 固定图形等待 |
| --- | --- | --- | --- | ---: | ---: |
| `1L` | `MAGIC/8`：云层锚点从目标东南 `(＋8,＋8)` 沿对角线飞至 `(＋1,＋1)` 共 8 次；目标中心四描述符组重复 4 次；云层继续向西北由 `(−1,−1)` 飞出至 `(−8,−8)` 共 8 次；均 10 tick | 首 8 次、即 80 tick 后请求 `E/43` | `MAGIC/31`；宽 9，tile `5/6`；44 tick | 320+44+50 | 414 |
| `2L` | `MAGIC/47` 七次×5，再 `MAGIC/48` 十四次×10 | 开始请求 `E/63`；35 tick 后请求 `E/41` | `MAGIC/24`；宽 5，tile `6/7`；32 tick | 175+32+50 | 257 |
| `3L` | `MAGIC/3` 三项循环 4 次，再 `MAGIC/4` 三项循环 5 次；均 10 tick | 开始请求 `E/41`；120 tick 后请求 `E/9` | `MAGIC/25`；宽 4，tile `5/6`；28 tick | 270+28+50 | 348 |
| `4L` | `MAGIC/39` 18×3+4×10，`MAGIC/40` 6×10，再 `MAGIC/39` 逆序 4×10 | 开始请求 `E/43` | `MAGIC/26`；宽 11，tile `12/13`；60 tick | 194+60+50 | 304 |

`1000:7166` 只在上述全部阶段结束后开始扫描目标、处理防魔、按范围值扣血并清理死亡。因此落雷画面上的距离波纹不是伤害即时结算点。

`1L` 的移动位置来自 `1000:5DE8h..5E41h`：目标格索引先加 `408 = 8×50+8`，每次绘制后把 `DS:5234` 减 `51 = 50+1`。所以云层不是在目标格淡入淡出，也不是到达中心后折返；它从东南进入，穿过目标，再沿同一轨迹向西北离场。公共波纹只在当前范围带内的敌方占用格绘制，随后 `MAGIC/6` 五阶段收尾绘制在敌方全部占用格，二者都不是整片空范围格的地面贴花。

究级落雷与公共收尾联系图：

- [`MAGIC/39`](../renders/contact-sheets/techniques/MAGIC-0039-lightning-4-a.png)
- [`MAGIC/40`](../renders/contact-sheets/techniques/MAGIC-0040-lightning-4-b.png)
- [`MAGIC/26`](../renders/contact-sheets/techniques/MAGIC-0026-lightning-4-hit.png)
- [`MAGIC/6`](../renders/contact-sheets/techniques/MAGIC-0006-lightning-cleanup.png)

## 资源目录

图形共绑定 25 项：`UN/61`；`MAGIC/0,3,4,6,8,10,20,22..31,37,39..42,47,48`（其中区间以机器 JSON 的逐项目录为准）。声音共绑定 8 项：`E/9,36,41,43,51,63`、`MAGIC/83`、`UN/50`。JSON 保存每项原始记录哈希、解码流数、渲染帧数、PNG 路径、VOC 采样率和时长。

## 本专题保留边界

- 低层描述符字段的原设计名称；
- 踏地、状态施加/净化、祈祷和工兵构造不从五个主家族外推；它们已由独立专题 `remaining-technique-presentations.md` 和机器文件 `remaining-technique-presentations.json` 闭合。
