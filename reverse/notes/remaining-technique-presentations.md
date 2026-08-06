# 剩余技术表现：踏地、状态、祈祷与工兵

## 范围与证据

本专题闭合第一阶段尚未完成的 15 项玩家技术表现：`1D/2D/3D` 踏地、`AD/AA/FM/SD/SA/LA/IP/TR/SN` 九种状态施加或净化、`OJ` 祈祷、`1K/2K` 工兵构造。目标、范围、数值和经验仍以 `shooting-and-technique-system.md` 与 `technique-rules.json` 为准；本文记录资源、绘制顺序、VOC 请求、原生等待和规则写入边界。

机器可读结果是 `../parsed/native/remaining-technique-presentations.json`。重复导出命令：

```sh
node reverse/tools/angel2-remaining-technique-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/converted/audio/manifest.json \
  reverse/extracted reverse/decoded reverse/renders/planar \
  reverse/parsed/native/remaining-technique-presentations.json
```

生成器校验 50 段代码、7 段数据、15 个图形记录、5 个 VOC 记录和 10 张联系图。当前仍维持 `implementationFrozen=true`。

“native tick”表示原版等待原语的输入；发布程序标称每 tick 10.000151 ms，浏览器按 10 ms 逻辑量子调度，但不把它等同于固定显示帧率。

## 踏地 `1D..3D`

三个动作进入同一公共处理器 `1000:11BCh`。图形先按变体和目标阵营选择，每项记录都正好有两帧：主体与影子。

| 动作 | 变体 | side 1 图形 | side 2 图形 | 正常玩家攻击敌军 |
| --- | ---: | --- | --- | --- |
| 龙踏 `1D` | 0 | `MAGIC/50` | `MAGIC/49` | `MAGIC/49` |
| 男踏 `2D` | 1 | `MAGIC/52` | `MAGIC/51` | `MAGIC/51` |
| 女踏 `3D` | 2 | `MAGIC/54` | `MAGIC/53` | `MAGIC/53` |

公共时间轴不是描述符逐帧播放，而是用两张已载入图在程序计算的坐标反复绘制：

1. 上升位置为 `25,55,85,115,145,175`，共画 6 次；前 5 步每步等待 1 tick。
2. 请求一次 `MAGIC/82`，随后执行 10 次页面切换。
3. 单次震动位置为 `145,125,110,125,145,175`；整组重复 3 次，每组末尾再次请求 `MAGIC/82`，这一段没有显式 timer wait。
4. 再切换页面 2 次。
5. 下落位置为 `175,155,135,115,95,75,55,35,15`，共画 9 次；前 8 步每步等待 1 tick。
6. 用 DS:`0CF4/0D04/0D14h` 恢复三个画面区域，才调用伤害消费者；最后由 `0000:63CFh` 移除零生命单位。

总计 33 次双帧绘制、4 次 `MAGIC/82` 请求和 13 个显式等待 tick。震动段的低层绘制本身有执行耗时，但没有可加到固定 tick 表里的等待调用。伤害绝不会在脚刚落下或第一次音效时提前结算。

六项图形联系图：[`../renders/contact-sheets/techniques-remaining/MAGIC-0049-0054-stomp.png`](../renders/contact-sheets/techniques-remaining/MAGIC-0049-0054-stomp.png)。

## 状态施加与破邪

九个动作都有同一条关键边界：外层处理器先完整调用表现函数，表现返回后才重新装载目标、执行 Boss 免疫判定、写状态字，最后结算施法经验。`LA/IP/SN` 的免疫不是“无动画”；免疫目标仍会完整播放效果，只跳过随后的状态写入。

| 动作 | 图形与帧序 | VOC | 固定等待 | 表现后写入 |
| --- | --- | --- | ---: | --- |
| 防御提升 `AD` | `MAGIC/33`，11 个 `2×2` 描述符，帧组 `1..24` 正向后反向 | `UN/52`，开始时 `0224h` | 165 | `+0A=8003h` |
| 攻击提升 `AA` | `MAGIC/16`，动态双格 `[1,21]..[20,40]` | `UN/51`，开始时 `0224h` | 300 | `+08=8003h` |
| 防魔 `FM` | 与 `AA` 完全共用 `MAGIC/16 + UN/51` 和同一入口 | 同左 | 300 | `+0C=8001h` |
| 防御下降 `SD` | `MAGIC/45`，10 个 `2×2` 描述符，帧 `1..40` | `E/8`，开始时 `0224h` | 150 | `+12=8003h` |
| 攻击下降 `SA` | `MAGIC/46`，11 个 `1×2` 描述符，帧 `1..22` | `E/8`，开始时 `0224h` | 165 | `+10=8003h` |
| 混乱 `LA` | `MAGIC/44`，11 个 `3×2` 描述符 | 无 | 165 | 非 `1P/2P/3P` 时 `+0E=8003h` |
| 施毒 `IP` A | `MAGIC/17`，四格帧 `1..48`，再复画 `1..4` | 无 | 130 | 尚不写 |
| 施毒 `IP` B | `MAGIC/18`，16 个 `2×2` 描述符 | A 后请求 `E/58`，走 `0220h` | 160 | 两阶段后，非 `1P/2P/3P` 时 `+14=8003h` |
| 破邪 `TR` | `UN/57` 动态五格，见下文 | 无 | 250 | 清 `+12/+10/+0E` bit15；`+14/+16=7FFFh` |
| 禁咒 `SN` | `MAGIC/36`，9 个 `3×2` 描述符 | 无 | 225 | 非 `1P` 时 `+16=8003h` |

`AA` 与 `FM` 共用相同表现不是资料缺失，而是两个外层入口都明确调用 `1000:7572h`。复刻原版时不能擅自为防魔换一套图或声音。

破邪使用一个动态 `1×5` 描述符。第一段先画全空状态，再让五路帧依阈值错峰进入，共 24 次×5 tick；终态为 `[0,0,0,22,23]`。第二段保留第四格的 22，让第五格播放 `23..47`，最后置 0 再画一次，共 26 次×5 tick。因此总数严格为 `24×5 + 26×5 = 250` tick；不是简单地把 `UN/57` 的 47 帧顺播一遍。

状态联系图：

- [`MAGIC/16` 攻击提升/防魔共用](../renders/contact-sheets/techniques-remaining/MAGIC-0016-attack-up-magic-defense.png)
- [`MAGIC/17` 施毒第一段](../renders/contact-sheets/techniques-remaining/MAGIC-0017-poison-rise.png)
- [`MAGIC/18` 施毒第二段](../renders/contact-sheets/techniques-remaining/MAGIC-0018-poison-cloud.png)
- [`MAGIC/33` 防御提升](../renders/contact-sheets/techniques-remaining/MAGIC-0033-defense-up.png)
- [`MAGIC/36` 禁咒](../renders/contact-sheets/techniques-remaining/MAGIC-0036-spell-seal.png)
- [`MAGIC/44` 混乱](../renders/contact-sheets/techniques-remaining/MAGIC-0044-confusion.png)
- [`MAGIC/45` 防御下降](../renders/contact-sheets/techniques-remaining/MAGIC-0045-defense-down.png)
- [`MAGIC/46` 攻击下降](../renders/contact-sheets/techniques-remaining/MAGIC-0046-attack-down.png)
- [`UN/57` 破邪](../renders/contact-sheets/techniques-remaining/UN-0057-dispel.png)

## 祈祷 `OJ`

祈祷没有载入新的 `MAGIC/E/UN` 图形或声音记录。它扫描 2,500 格，跳过空格和 side 2；每个合资格单位独立读取 PIT 低字节，bit0 为 1 才进入自身的一次表现和结算。

通过随机门后，每个单位依序执行：

1. 切换绘图页，用低层图元画 16 步双列图案和固定装饰；
2. 取得 `0..3` 结果，生命/经验分支再取得 `5..14` 数量；
3. 显示原生结果文字“生 命 加|00000 點.”、“經 驗 加|00000 點.”、“攻擊增加”或“防禦增加”；
4. 写生命、经验、攻击提升或防御提升结果；
5. 切换显示页，最多等待 `30×2=60` tick；DS:`F590h=1` 时可提前结束等待，再处理下一个单位。

所以祈祷不是“先播放一次全局动画，再统一处理所有单位”。每个通过随机门的我方单位都有独立的程序绘图、结果文字、状态修改和可跳过停留；整次动作的墙钟长度随触发单位数与输入而变化。

## 工兵 `1K/2K`

铁板与障碍同样没有独立图形记录、VOC、描述符动画或等待。玩家入口使用独立构造路径：

- `1K` 从逐关原始地图 `(16,25)` 复制源 token；
- `2K` 从 `(16,26)` 复制源 token；
- 以 seed 5、模式 `M` 选择空格，先完成工兵到该格的普通移动表现；
- 再按线性偏移 `+50,-50,+1,-1` 扫描四邻；当前 token 映射为逻辑地形槽 0 的邻格跳过，
  其余邻格都写对应动作的单一 base source token；中心格不写，动作经验为 0。

DS:`52A2h` 的两个通用分发表项仍指向五字节写入器：若被调用，会从传入格起写
`sourceToken..sourceToken+4`。但发布版玩家短码分支在通用调用前转入上述专用构造路径，
工兵 AI 也没有技术池生产者；故这两个写入器没有正常玩家／AI 可见入口，不能把其潜伏行为
当作鐵板／障礙的发布玩法。地形写入就是规则结算点；动作后的常规棋盘重绘才让新地形
可见。Web 复刻若添加施工动画，只能作为增强/Mod 表现，不能标作原版资源还原。

## 资源目录与保留未知

本专题绑定 15 个图形记录：`MAGIC/16,17,18,33,36,44,45,46,49..54` 与 `UN/57`；绑定 5 个 VOC：`E/8,58`、`MAGIC/82`、`UN/51,52`。祈祷和工兵的归档图形/VOC 集合均为空。

仍保留的未知只有低层绘图原语的原设计名称，以及 PIT 采样分布；原生 tick 已闭合为标称 10.000151 ms。`0220h` 现已确认为直接提交 VOC，`0224h` 则先经过 DS:`10EDh` bit 0 的战斗音效分类门；两者最终进入同一底层请求。它们不再阻塞这 15 项动作的资源、次序或规则同步实现。
