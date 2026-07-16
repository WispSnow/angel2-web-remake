# `AG2.JS3` Joymouse 配置格式

日期：2026-07-14

## 结论

`AG2.JS3` 不是游戏存档或战役进度，而是 Softstar **Joymouse Setup 3.00** 的输入设备配置。配套 `JS3.EXE` 已从 LZEXE 0.91 解包；其内建界面明确列出模拟设备、鼠标/摇杆调节、键盘四/八方向映射和附加控制选项。

原生反序列化器 `1000:494F` 与序列化器 `1000:4A96` 逐字段互逆，精确解释全部 78 字节：

| 偏移 | 字节 | 含义 | 原生存储 |
| ---: | ---: | --- | --- |
| `00h` | 2 | 配置版本 `u16` | `1000:4698` |
| `02h` | 1 | 控制器位标志 | `1000:42DC` |
| `03h` | 1 | 模拟模式 0–5 | `1000:12D9` |
| `04h` | 8 | 四类设备各两个调节值 | `1000:26D5..2D5A` |
| `0Ch` | 3 | 鼠标端口选择、摇杆 1/2 类型 | `1000:42E4/42DE/42E0` |
| `0Fh` | 24 | 四方向键盘：2 个摇杆 × 12 个动作 | `1000:32C6` |
| `27h` | 2 | 四方向 Auto/Turbo 速度 | `1000:32DE/32E0` |
| `29h` | 32 | 八方向键盘：2 个摇杆 × 16 个动作 | `1000:3C70` |
| `49h` | 2 | 八方向 Auto/Turbo 速度 | `1000:3C90/3C92` |
| `4Bh` | 2 | 待机等待秒数 `u16`，范围 3–999 | `1000:42E2` |
| `4Dh` | 1 | 长度哨兵，必须等于它前面的字节数 77 | 原生比较 |

模拟模式由 `1000:4B2D` 按 0–5 分发，顺序与界面一致：Analog Joystick、Gravis Joystick、2 Button Mouse、3 Button Mouse、Keyboard 4 Way、Keyboard 8 Way。

四方向动作依次为 A–F、Start、Select、Up、Down、Left、Right；八方向再追加 Left+Up、Left+Down、Right+Up、Right+Down。绑定字节已经完整解释：低 7 位是 Joymouse 内建 128 项键表的索引，高位是该动作的重复开关 `repeatEnabled`。四/八方向编辑器在动作行收到 Space 时异或 bit 7，替换键位时保留该位，显示时先按它绘制重复标记，再以 `& 7Fh` 查键名；同页的 Repeat Speed 子页分别设置 Auto/Turbo 时序。

内建键表位于解包程序文件偏移 `[6323h,6815h)`、运行时 `14E5:08D3h`，恰有 128 条变长记录。每条为一个 little-endian `u16` Set-1 word 和一个 NUL 结尾 ASCII 键名：`00xx` 表示普通 make `xx`，`E0xx` 表示扩展 make `E0 xx`，对应 break 为 `xx|80h` 或 `E0 (xx|80h)`。索引 0 是显式 `No Use`，不发键。`1000:36EC/407B` 用索引显示键名，`1000:4D9A/4DFF` 则把原始绑定打包给驱动；因此配置字节绝不是 BIOS ASCII、Set-1 本身或 DOM keyCode。

控制标志低四位由 `1000:438A` 分别切换：摇杆 1/2 互换、关闭键盘自动重复、摇杆 1 反向、摇杆 2 反向。高四位分成两个 2-bit 摇杆类型码。待机秒数在 `1000:441F..446B` 中以 3–999 循环。

## 当前样本

- 版本字为 `0100h`。
- 模拟模式为 4，即 Keyboard 4 Way。
- 四类设备调节值均为 7；四/八方向 Auto/Turbo 速度也均为 7。
- 两个四方向摇杆各有 12 个键值且当前两组完全相同；八方向 32 个键值全为 0。当前 24 个四方向绑定的重复位也全部关闭。
- 控制标志为 0，鼠标端口选择值为 5，两种摇杆类型值均为 0，待机等待为 999 秒。
- 尾部长度哨兵为 `4Dh=77`，通过原生规则校验。

当前选中模式的逐项翻译如下；“游戏语义”来自模块 27/29 自己的 Set-1 消费表，不是按名称推测：

| Joymouse 动作 | 内部索引 | 原生键名 | Set-1 make | 游戏语义 |
| --- | ---: | --- | ---: | --- |
| Button A | 61 | Space Bar | `39h` | 主操作 |
| Button B | 43 | Enter | `1Ch` | 次操作 |
| Button C | 112 | F1 | `3Bh` | 全部休息 |
| Button D | 52 | ASCII M | `32h` | 音乐音量 |
| Button E | 19 | ASCII E | `12h` | 音效设置 |
| Button F | 16 | Tab | `0Fh` | 集体命令菜单 |
| Start | 110 | Escape | `01h` | 系统菜单 |
| Select | 0 | No Use | 无 | 未绑定 |
| Up / Down | 96 / 98 | Keypad 8 / 2 | `48h / 50h` | 上 / 下 |
| Left / Right | 92 / 102 | Keypad 4 / 6 | `4Bh / 4Dh` | 左 / 右 |

两只逻辑摇杆均通过同一组 12/12 断言。`AG2-JS3.json` 还导出全部 128 项普通/扩展 make/break 序列和八段原生签名。未被当前配置选中的 Analog、Gravis、2/3 Button Mouse 和 Keyboard 8 Way 仍保留格式与驱动适配资料，但其物理 DOS 轮询不属于 Web 玩法规则门槛。

机器导出位于 `reverse/parsed/native/AG2-JS3.json`。其中仍保留全部原始字节和各字段偏移；Web 复刻无需模拟串口/摇杆硬件，但可参考其双手柄动作集合设计可重映射输入。

## 可重复导出

```sh
reverse/tools/angel2-js3-config.mjs --inspect \
  ref/ANGEL2/AG2.JS3 \
  reverse/unpacked/JS3.UNPACKED.EXE \
  reverse/parsed/native/input-ui.json \
  reverse/parsed/native/AG2-JS3.json
```
