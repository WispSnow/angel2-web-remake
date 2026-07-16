# `GO.EXE` 的 Borland 调试符号

## 结论

`GO.EXE` 的 MZ 声明映像在文件偏移 `55C0h` 结束；其后还有 7,651 字节的 Borland TLINK 3.10 调试区。该区含 212 个名称、239 个符号（35 个全局、204 个局部）、9 个模块和 764 条源码行记录。因此加载器分析不必只依赖反汇编猜名。

可复现导出：

```sh
reverse/tools/angel2-borland-debug.mjs --extract \
  ref/ANGEL2/GO.EXE reverse/parsed/debug/GO-symbols.json
```

解析器直接读取 MZ 声明长度、`52FBh` 调试头、固定 9 字节符号记录和末尾 NUL 名称池，不依赖临时安装的古董 DOS 工具。

外部格式参考：Ralf Brown 的 [Borland 调试头布局](https://www.delorie.com/djgpp/doc/rbinter/it/24/16.html)，以及 Borland [Turbo Debugger User's Guide](https://bitsavers.org/pdf/borland/turbo_debugger/Turbo_Debugger_2.0_Users_Guide_1990.pdf) 对链接器 `/v` 追加完整调试信息的说明。本项目的计数、地址和符号名均由本地 `GO.EXE` 独立解析得到。

## 关键原始符号

| 地址 | 原名 | 当前用途证据 |
| --- | --- | --- |
| `0000:0079` | `MUS_SET` | 调用 INT `33h` 检测鼠标，并写 `MOUSE_USE='Y'/'N'` |
| `0000:019C` | `LOAD_V` | 选择并装入运行模块，随后进入解包、重定位、执行链 |
| `0000:01E8` | `OVER` | 运行模块重定位阶段 |
| `0000:0211` | `UPK` | 运行模块解包阶段 |
| `0000:0270` | `G_ARJ` | 调用 ARJ 风格解压器的包装层 |
| `0000:028B` | `RUNTO` | 把控制权交给恢复出的运行模块 |
| `0000:02F2` | `RUN_EXE1` | 一次装入—解包—重定位—运行循环 |
| `0000:0616` | `READ_SWF` | 加载器的索引资源读取接口 |
| `0000:07B7` | `ALL_READ_EMS` | 把启动资源缓存到 EMS |
| `0000:094A` | `GET_FILE` | 根据资源号和记录号取出一条 SWF 记录 |
| `00B8:347F` | `DC_ARJ` | ARJ 风格解压核心 |

关键数据符号包括 `JUST_DAT`、`CONTINU`、`LV_HARD`、`SAVE_NUM`、`MIMA_NUM`、`KILL_ALL`、`MOUSE_USE`、`MIMA_PASS`。模块 23 已把 `CONTINU`（`146A:005A`）闭合为新游戏/继续游戏选择：`N` 进入 `JUST.TST` 新战路径，ASCII `0..4` 选择五个编号 `WAR` 槽；它与 `JUST_DAT` 是两个不同的原始符号。`LV_HARD` 已通过模块 23 四项可见菜单、parent block `146A:0064` 到模块 29 DS:`0000h` 的导出关系、场景 30 的 8/16/24/32 形态上限和最高难度敌方属性加半消费者，确认为四值难度状态：0“過關斬將”、1“勢均力敵”、2“困難重重”、3“無法無天”。`MIMA_PASS`（`146A:0312`）前两个 word 也已闭合：模块 29 首次出站将 `count` 从 0 改为 1、暂存原下一模块并改走模块 21；模块 21 成功后改为 2并恢复原目标。父块相对偏移 `1Eh` 保存其 `0312h` 指针。`MIMA_NUM`（`146A:0068`）初值 0，但在该交接链中没有消费者，仍不能仅凭名称等同于挑战号。`MOUSE_USE` 已由 INT 33h 检测读写闭合。其他名字仍需用读写引用与实机行为验证，不能仅凭英文名写死规则。

## 原始模块信息

Borland TDUMP 的交叉校验显示 9 个模块为 `GO`、`GO_WK1`、`GO_WK2`、`GO_WK3`、`NUM`、`ARRJ`、`READ2_SWF`、`READ_SWF`、`EMM`；调试区还保留了 `GO.ASM`、`GO_WK1.ASM`、`GO_WK2.ASM`、`GO_WK3.ASM`、`EMM.ASM` 五个源文件名和 1994 年时间戳。

## 对后续取证的影响

启动时抓到的主模块只是运行期状态机的一部分。今后搜索战斗、存档和 `B.SWF` 访问路径时，必须把 `GO.EXE` 的装入/覆盖链与运行期模块捕获结合起来；“初始内存转储中没有直接引用”不能再作为“功能不存在”的证据。
