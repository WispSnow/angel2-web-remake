# 《天使帝国 II》资源提取状态

日期：2026-07-15

## 阶段边界

当前工作只覆盖原版资源提取、格式复原和 GDD 证据整理。Phaser、Web 运行时和玩法实现均冻结，直到 `reverse/gdd/README.md` 中的阶段门槛通过评审。

完整的机器可读覆盖表位于 `reverse/manifests/resource-coverage.json`。所有生成物都来自只读的 `ref/ANGEL2`，原始文件 SHA-256 仍以 `reverse/manifests/ref-angel2.sha256` 为准。

## 总体覆盖

- 28 个原始文件已逐文件登记和哈希。
- 14 个带索引的 `.SWF` 容器已全部拆出，共 1,282 个有效记录。
- 9 类含内嵌压缩流的容器已解出 2,249 条已确认的 stored/LH7 流，共 17,445,630 字节；4 条曾因三字节巧合被误认的字形/原始数据已剔除。
- 已生成 8,725 张通用位平面 PNG；全部已按原生“流 0–3→颜色 bit 3–0”顺序重渲染。`B.SWF` 的 44 个偶数记录现按原生寻址确认为每组 128 张 `40×44` 图块，并已生成 44 张 `50×50` 完整战场图、44 张 `150×150` 地形小地图、44 张地形+占用叠加图，以及五张含真实视口框的编号存档小地图；旧的 `32×16` 假设已废弃。
- 标题专题另按模块 23 的原生调色板和索引位图规则恢复 19 个记录的 97 张图像及 4 张联系图；其中 `BK/53` 的非单调图像偏移表已按原生索引读取器正确恢复，不再受通用渲染器的单调目录假设限制。
- 剧情专题另按模块 25 的原生调色板恢复 16 张语料引用背景、68 个 `D` 肖像主帧、`A/18` 的 12 个窗口组件和 `A/20` 清理纹理，共 97 张图像及 4 张联系图。原生“每个位平面独立读取当前图像指针”的规则补回了通用渲染器遗漏的 `D/63` 和 `A/20`；它们不计入上面的 8,725 张通用预览。
- `CHA` 的 176 组、9,399 个 Big5 对应字形已全部输出图集；另从 `A/B/UN` 恢复 9 组、1,769 个原始 `16×15` 字形。两类共 11,168 个字形实例、185 张图集。
- 71 个 Creative Voice 音频已全部转为 WAV，总长约 38.821 秒。
- 59 个 Softstar RIX OPL 曲目已全部保留为 `.rix` 并渲染为 WAV，总长约 1,857.329 秒。
- 176 个 `SAY` 记录已完整结构化为 5,591 个动作：93 条含正式命令，83 条是名字、提示或文本/标签表。语料出现 17 种命令码；模块 25/29 的发布版分发器分别支持 15/16 条，`CW` 已确认为 no-op。语义动作流为 semanticVersion 2。
- `DATA.SWF` 与 `MAP.SWF` 均已按 39 条对齐记录导出 JSON/CSV；`MAP` 已确认每个 profile 有 23 个逻辑地形槽、第 24 个序列化 word 是相邻运行时对象的重叠字，并以 47 段原生代码签名闭合玩家移动递推、六类通用范围模式、AI 目标标记、逐关地形 token 映射和小地图颜色页。
- `UN.SWF` 中 10 个运行模块头和 12 个 LH7 代码块已重构为 256,983 字节第一层映像；全部识别为 LZEXE 0.91 并二次解包为 628,256 字节业务代码、2,651 条 MZ 重定位，10/10 已导入 Ghidra。
- 模块 29 的两套原生单位描述符已无损导出；39/39 显示名一致，并确认 `修改.txt` 有八处名称差异。
- 模块 29 的 35 项原生转职候选表已导出，确认 31 条有序边、触发条件、不可取消选择和转职经验归零。
- 六个 `.TST` 均已按原生 XOR/RLE 无损解码：五个 `WAR` 各 11,972 字节，`JUST` 为 8,358 字节；双方职业数组和活动单位实例已结构化，并确认即时胜利 999 在 `WAR` 元数据中序列化为 1000。两个 1,440 字节块现已确认为双方各 60×24 字节单位动态状态，772 字节尾段也已分为 AI 行为、设置、经验奖励计数器、逐槽行动状态、序列化重叠残留和通用战斗菜单颜色/坐标状态；`04h/06h` 两兼容字、隐藏 tick 等待标志和无消费者音乐尾字节已有机器审计。
- `SET.TXT` 的 8 字节已闭合：九个运行模块只消费 `Y13` 三字节，统一映射为 Sound Blaster 数字采样启用、I/O 基址 `220h`、IRQ 7；尾随五字节无语义。九份加载器/查找表与七段 DSP/PIC 驱动签名已机器化，并确认它不控制 RIX 音乐或战斗四分类开关。
- `.TST` 可靠性边界另由 21 段代码、六样本与 12 项合成损坏语料闭合：格式没有版本/magic/校验，原生 I/O/RLE 无安全容错，XOR 多处理 50 字节，`WAR` 原生循环只在无用填充内写到 11,966/11,967 并忽略 5–7 个声明字节；key 是代码段游标加缓冲残留而非随机种子。PIT 与未序列化累加器同时证明 `.TST` 不能单独确定重放未来随机流；安全导入/现代外层版本策略已机器化。
- `AG2.JS3` 已由配套 `JS3.EXE` 的原生互逆读写器完整解析为 78 字节 Joymouse 输入配置；另从解包程序恢复全部 128 项 Set-1/键名表与逐动作重复位。当前选择 Keyboard 4 Way，两只摇杆的 12 项相同并全部对齐游戏语义消费者；版本、八段原生签名与尾部长度哨兵均通过校验。
- `B.SWF` 的 39 个普通模板与场景 39–43 的五个特殊/替代映射入口已按原生九段布局完整解析；每项的双方职业槽、单位坐标和场景数组已导出，并确认场景 37 的“頭 + 两只手”组成。
- `B.SWF` 的 128 个原始地形 token 已全部连接到同号 `40×44` 图块、逐关 `MAP` 逻辑槽和 `3×3` 小地图颜色；44/44 完整战场图均无越界引用。模板首 256 字节已确认为地形描述偏移表，而不是未命名场景配置。
- 小地图完整叠加已由 17 段代码与三组矩形数据签名闭合：side 1/2/255 标记、当前 10×7 视口黑框、鼠标预览白框和点击重定位均已结构化。模板占用值域为 `0/1/2/255`；`255` 已确认是未填玩家部署格，正式战斗载入后会清为空格。
- 模块 27 的部署流程已由机器签名闭合：场景标志生成名单、模板 side 1 单位固定、可选单位填入/撤回 `FFh`；44 个映射入口中 33 个为交互部署、11 个直接写 `JUST`，共 423 个部署格。
- 模块 29 的普通单场生命周期已由 15 段签名闭合：`JUST/WAR` 开战分支、第 1 回合、玩家→我方自动→敌方 AI、回合 tick、胜负、可选存档、下一关，以及失败回同关部署。
- 模块 25/27/29/33/35/46 的逐关编排现有 41 段代码/数据签名：`1000:42A8` 的 38/38 个回合/结算处理器已按完整边界闭合，共引用 72 个 SAY 记录；八个动态棋盘场景、场景 14–19 的第 6 回合 AI 行为重置、场景 30 按 `LV_HARD` 推进的确定性多职业序列、stage-6 传送门桥接和“场景 37→内部场景 49→主结局→场景 38 追加战→模块 46”均已结构化。
- 特殊逐关表现另由 21 段代码、2 段数据签名闭合：场景 `0/1/6/11/20/21/22/30/42` 的聚焦/写入先后、首次可见刷新、PIT mod-3 等价路径选择、逐格 VGA 翻页、`E/14` 移动声、场景 30 的 `我．．．我好難過．．．|頭好痛啊！` 上下文短句，以及场景 42 对既有 4L 规格的继承均已机器化。没有新增待提取归档资源。
- 剧情表现另由 34 段代码和 12 段数据签名闭合：模块 25/29 两套解释器、16 条原生有效命令、上下窗 11 步展开/12 步关闭、肖像元数据、8-tick 字形节奏、模块 29 的 `MAGIC/57..71` Big5 逐字 VOC、输入/延时、`BK/D/A` 资源、`MAGIC/72..79` 剧情 RIX 及战场恢复均已机器化。93 条命令脚本中 89 条存在发布版生产路线；全 `DS:80B5` 引用和两张动态映射表证明 69/116/117/118 无发布版生产者，只作归档保留。
- 部署错误与普通战斗终局反馈另由 26 段代码、6 段数据签名闭合：三条可达错误、底部三层提示条、`UN/39+40` 字形、`A/18+D/45/46` 胜利/撤退/失败/退出窗口、逐字 VOC、`MAGIC/81` 按键声、确认菜单、五槽胜利存档和状态路由均已机器化。`02F4h/DS:059F` 固定短句在首代码段无 near caller、全镜像无 far caller，也没有任何编码的 `02F4h` 地址或远指针，确认为发布版不可达归档。
- 战后与终局表现另由 22 段代码/数据签名和 12 个直接资源闭合：模块 33 固定展示 22 张角色战绩卡，模块 35 依前三职业族占比、累计存档次数和 75 槽战绩总和选择 8 段结局文字及 `UN/0..20` 插画，模块 46 使用 `B/88` 与 `C/33` 组成七页制作人员表，最后进入 `UN/54` 的永久 “The end” 动画。模块 46 调用后的 `module27/stage38` 写入不可达，不是可用的重玩入口。
- 标题、新游戏、难度与继续游戏的状态机已由 25 段模块 23/GO 签名闭合：两个标题选项、四个原版难度标签与热区、五个 `WAR` 槽、`WK_EXE/CONTINU/LV_HARD` 路由、228 项 `A/23`→`A/24` 字形映射及 23 个直接资源记录均已结构化。表现专题另由 31 段代码、5 段数据、19 个图形记录和 2 段 RIX 闭合标题前 Logo、17 行/六次背景切换的滚动开场、两套标题素材、1,608-tick 空闲重播、难度菜单和继续槽构造；旧 `NUM/1,14` 绑定已纠正为 `MUSIC/1,14`。
- 密码/图册复制保护已由 17 段 GO/模块 21/模块 29/`PLAY.COM` 签名闭合：首次模块 29 出站经 `MIMA_PASS` 改走模块 21、三次回答写向量 0/1/3、`C/0032` 的 28 项坐标/答案码、模块 21 DS:`03ACh` 专用调色板、红/黄/蓝/绿/紫/白六个可见按钮与内部码 `2/1/0/3/4/5`、重输/失败锁死、八个直接资源及启动器固定挑战 16→答案码 2（默认红色）均已结构化；81 张专用调色板预览位于 `planar/C_password`，提示前 DOS 向量检查只保留为兼容性取证。
- 模块 27/29 的输入与战斗 UI 已由 33 段签名和数据表闭合：两模块 INT `09h`/Set-1 键盘链、两份完全相同的 14 项实体绑定、部署 19 个热区/五列导航，战场 `10×7` 键鼠光标/边缘滚动，斜向键与 Esc/Tab/E/M/F1–F4 快捷键，七组行动菜单，四项集体命令，12 个侧栏热区/17 项动作及三类设置。Joymouse 当前模式通过独立机器规格接到同一语义层；Caps+J/数字键盘 `*` 已确认为发布版关闭的开发支路。
- 单位详情 HUD 另由 18 段代码、4 段数据签名闭合：原生 `640×350` 右栏几何、动态 `D` 肖像、职业／单位名、五行原文与数值来源、生命/经验 100 像素竖条、`A/17` 八个 `40×31` 状态图标及剩余值、三字符回合框和第 37 关 side 2 的九字段 `?????` 隐藏均已机器化，并生成嵌入实际资源的 SVG/PNG 核验图。DS:`3192h` 到完整 `D` 记录号映射继续原样保留。
- 战场范围/目标表现另由 34 段代码、1 段数据签名闭合：DS:`01A9h` 的 `50×50` 范围图既控制点击合法性，也令非零格完整显示、零值格套 `11h/44h` 位平面网点掩码；普通攻击四邻敌军、移动空格、射击 seed `5/8/6` 与最小距离 2、技术/工兵验证及取消后的全 1 恢复均已机器化。DS:`58A5h` 已纠正为独立 `10×7` 技术/地图特效 sprite 缓存，并生成实际 B 地形的明暗核验图；没有新增待提取归档资源。
- DS:`2E7D` 的六个战斗运行时读取点已全部审计，没有进入字形、字符串或 HUD 名称绘制器。因此 23 个逻辑槽使用数值 ID；`A/0007` 地形词只保留为未绑定候选，不再把“恢复原版槽名”当作已有名称表的必然格式任务。
- 模块 29 的失败/胜利条件分发表已各导出 42 项，84/84 表项和 13 个唯一处理器均已分类；场景 37 已确认保护 side 1 槽 0、side 2 全灭胜利，三个 Boss 部位生命/死亡独立且不能移动。
- 普通攻击表现已由 24 段代码与 3 段数据签名闭合：地图受击绑定 `UN/62` 八张斩击帧和两次 `E/38` 请求，地图死亡绑定 `MAGIC/12` 的 15 个清格前后描述符；全屏按 39 项职业记录选择 158 个不同图形映射项，并连接 37 个不同 `E.SWF` 记录。`M_00/Y_00` 的普通职业 direct/+50 资源全部存在，魔劍戰士的两个显式重映射已保留。
- 射击表现另由 19 段代码与 3 段数据签名闭合：三类射击均绕过普通攻击全屏开关；弓/弩共用 `UN/60` 的空白—八帧—空白 60 tick 棋盘命中圈，魔弓以 `MAGIC/83` 配合同一八帧沿路径增长并八步收尾，迅龍騎士闪避保留玩家 `UN/60` 无声 60 tick 与 AI `UN/62+E/38` 两次请求/90 tick 的原版不对称。魔弓目标伤害已确认是两次 `floor(base/2)`，其他合资格线格为一次。
- 五个主技术家族另由 46 段代码与 9 段数据签名闭合：落雷、炎暴、冰雪、治疗与回復共 18 项动作已绑定 25 个图形记录和 8 个 VOC 记录，描述符顺序、声音请求点和固定 native tick 均已结构化。五类都在完整固定图形时间轴结束后才开始扣血、防魔消费、位移或治疗；已生成 10 张联系图。
- 剩余 15 项技术由 50 段代码与 7 段数据签名闭合：三种踏地、九种状态/净化、祈祷和两种工兵构造已绑定 15 个图形记录、5 个 VOC、程序绘图/动态描述符、等待及规则同步；另生成 10 张联系图。祈祷没有归档图形/VOC，工兵没有独立表现资源。
- `WD` 与第 26 关阶段尾效果另由 21 段代码、3 段数据签名闭合：`MAGIC/19` 十帧绑定同目标阵营路径伤害，`MAGIC/21` 三十帧与 `MAGIC/14` 十一帧绑定两轮纵列下推演出；三者无处理器内直接 VOC，已生成 3 张联系图并把规则/演出同步写入 `wd-stage26.json`。
- 行为 12 的场景 4/9 专题另由 26 段代码、3 段数据签名闭合确定部分：场景 4 每次路线移动尝试后用 `MAGIC/26` 做 44-tick 外圈效果，令安全区外 side 1 单位生命减半；场景 9 低于格 934 后的陈旧 `DI=3450`、PIT 零值路径和 100-word 无界列表已机器化。具体 PIT 轨迹及代码段覆写后的可见结果保留为 U，不新增待提取归档资源。
- 第一阶段残余审计现覆盖证据登记 138 项：120 项纯 C，18 项混合等级只保留宿主/VGA/音频校准、PIT 分支采样分布、原设计名、人工转录或原生未定义行为，确定性实现必需未知为 0。`1V/2V` 无发布版生产者，`3V` 只由魔弓射击调用；模块 27“按鍵”门与九模块 10.000151 ms 标称 tick 均已闭合。当前证据已可提交用户评审，开发仍冻结。

## 索引容器覆盖矩阵

| 容器 | 索引槽 | 有效记录 | 解压流 | 字形 | PNG 预览 | VOC | RIX | 当前判断 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `A.SWF` | 80 | 60 | 81 | 703 | 230 | 1 | 5 | 混合启动/界面/音频资源；标题专题绑定 `A/6、23–25`；剧情专题绑定 `A/18` 的 12 个窗口组件与 `A/20` 的 `40×41` 清理纹理，后者由原生单指针规则专门恢复 |
| `B.SWF` | 100 | 94 | 240 | 136 | 5,703 | 0 | 0 | 44 组 `128×40×44` 战场图块、44 组 8,506 字节地图数据及 `B/88` 的 20 帧制作人员职务；另有安装提示字形；176 个位平面尾部均确认为 1,024 字节零填充 |
| `BK.SWF` | 60 | 59 | 245 | 0 | 123 | 0 | 0 | 背景/剧情画面；标题专题绑定 `BK/40..48,51..57` 并生成 91 张调色板正确图像；剧情语料直接引用的 16 个记录均另按剧情调色板出图；`BK/42` 为标题处理器支持但发布版数据不可达，`BK/53` 使用非单调原生索引表 |
| `C.SWF` | 60 | 34 | 170 | 0 | 81 | 0 | 0 | 图像包；`C/32` 另按模块 21 专用 palette 输出 `C_password` 预览，`C/33` 已绑定为 22 帧制作人员姓名，模块 33 另从 `C/0..30` 随机选择战绩卡装饰图 |
| `CHA.SWF` | 200 | 176 | 0 | 9,399 | 176 图集 | 0 | 0 | Big5 字形数据，已与 `NUM/SAY` 对齐并全部出图 |
| `D.SWF` | 100 | 68 | 340 | 0 | 473 | 0 | 0 | 68 个剧情肖像记录；专题已按剧情调色板恢复全部 `112×112` 主帧，包括通用 renderer 因 mask 指针非单调而漏掉的 `D/63`。50 个 id 被语料直接引用；66 个 id 有原生姓名/布局元数据，63/67 没有 |
| `E.SWF` | 100 | 65 | 0 | 0 | 0 | 47 | 0 | VOC 音效；普通攻击表现已绑定 37 个不同记录（含职业槽、地图受击 38、全屏死亡 11）；`E/14` 是逐关脚本移动的异步 1.261 秒声音；`E/38` 也绑定 AI 迅龍闪避，`E/9,36,41,43,51,63` 绑定五个主技术家族，`E/8,58` 绑定状态技术 |
| `MAGIC.SWF` | 90 | 86 | 285 | 0 | 1,169 | 20 | 9 | 魔法动画、音效和 RIX 混合资源；`MAGIC/12` 已绑定地图死亡，`MAGIC/83` 已绑定魔弓与炎暴声音；五个主技术家族绑定 24 个 MAGIC 图形记录，踏地/状态另绑定 14 个图形与 `MAGIC/82` VOC；`MAGIC/19` 绑定 `WD`，`MAGIC/21+14` 绑定第 26 关纵列下推；`MAGIC/57..71` 是战场 Big5 逐字声，`MAGIC/81` 是按键/部署错误关闭声，`MAGIC/72..79` 已绑定模块 25 的逐关剧情音乐选择表与启停边界 |
| `MUSIC.SWF` | 60 | 50 | 0 | 0 | 0 | 0 | 41 | 主音乐容器，另有 9 条空占位；`MUSIC/1` 已绑定标题，`MUSIC/14` 已绑定滚动开场，普通战斗模块及第 0 关已绑定 `MUSIC/29` |
| `M_00.SWF` | 90 | 85 | 350 | 0 | 369 | 0 | 0 | 全屏左侧角色帧；普通职业 direct/+50 完整，魔劍记录 1/51 由原生代码改读 Y，特殊记录占位/缺项原样保留 |
| `NUM.SWF` | 200 | 176 | 0 | 0 | 0 | 0 | 0 | 与 `CHA` 配套的 Big5 编码表 |
| `SAY.SWF` | 200 | 176 | 0 | 0 | 0 | 0 | 0 | 176 记录已全部解析：93 条命令脚本、83 条文本/标签；两套解释器和 semanticVersion 2 动作流已闭合，69/116/117/118 确认为无发布版生产者的归档脚本 |
| `UN.SWF` | 80 | 63 | 128 | 930 | 151 | 3 | 4 | 图像、字形、音频和运行模块混合容器；`UN/39+40` 是部署错误的 95 项 Big5 码表/字模，`UN/53` 绑定标题前 Logo，`UN/60` 绑定射击，`UN/62` 绑定普通地图受击及 AI 迅龍闪避，`UN/61` 的 39 帧绑定初级治疗，`UN/50` VOC 绑定冰雪循环；`UN/51,52` VOC 绑定正面状态，`UN/57` 绑定破邪；`UN/0..20` 为结局插画，`UN/54` 为终幕动画 |
| `Y_00.SWF` | 100 | 90 | 410 | 0 | 426 | 0 | 0 | 全屏右侧角色帧及左侧魔劍重映射；普通职业 direct/+50 和 `Y/41、42` 均已渲染 |

## 已解码但仍有业务字段待命名的文件

| 文件 | 已确认结构 | 下一证据 |
| --- | --- | --- |
| `WAR0.TST`…`WAR4.TST` | 五个编号槽；XOR/RLE、11,972 字节布局、原始地形 token/单位槽/阵营三张 50×50 图、双方职业数组、双方各 60×24 字节单位动态状态、772 字节 AI/行动/设置/计数器尾段、地形描述偏移、活动实例、视口原点与焦点坐标均已恢复；五张存档态小地图可重复生成；`04h/06h` 与尾段保留字的运行时边界已闭合；槽位原文“職業/等級/經驗值/儲存次數/難度”、五样本显示值与保存端快照怪癖已机器化 | 无消费者兼容字只缺不可恢复的原设计名称；不阻塞复刻 |
| `JUST.TST` | 模块 27 按关卡重新生成、由 `N` 分支载入的下一场战斗状态；同算法解为 8,358 字节，偏移 7,952 为地形描述偏移表，双方 75-word 数组为逐槽 AI 行为；残余 `FFh` 是未填部署格并在正式开战前清零 | 无格式级未知；特殊关动态覆写归场景逻辑 |
| `AG2.JS3` | Joymouse Setup 3.00 输入配置；78 字节全布局、六模式、128 项 Set-1 键表、逐动作重复位、速度、标志及长度哨兵均已解析；当前 Keyboard 4 Way 的 12/12 项已对齐游戏语义 | 未选用的遗留硬件轮询只作 DOS 兼容取证；不阻塞 Web 规则 |
| `B.SWF` 奇数记录 | 场景 0–38 使用记录 1–77，39–43 使用 1/49/65/85/87；每条为 128 项地形描述偏移、原始地形 token/单位槽/阵营三张 `50×50` 图和五组 75-word 数组；双方逐槽数组是 AI 行为，末数组是出场名单标志，`FFh` 是部署格；小地图地形/占用表现已重构；38/38 个现存逐关处理器及九个特殊表现时间轴已与模板叠加 | 三个未选奇数模板 79/81/83 已分别证明与 21/49/65 逐字节相同且无运行时读取路径；无待提取独有内容 |
| 调色板映射 | gameplay、intro、password 与标题逐场景表均有原生 DAC 绑定；通用流顺序也已由模块 21/25/29 三份例程闭合 | 未发现运行时调色板绑定的归档资源仍保留位平面母版，不臆测唯一预览色表 |

## 可复现命令

```sh
reverse/tools/swf-index.mjs --extract ref/ANGEL2/A.SWF reverse/extracted/A
reverse/tools/angel2-lha-frame.mjs --extract-resource reverse/extracted/A reverse/decoded/A
reverse/tools/angel2-planar.mjs --render-resource reverse/decoded/A reverse/renders/planar/A gameplay
reverse/tools/angel2-planar.mjs --render-resource reverse/decoded/C reverse/renders/planar/C_password password
node reverse/tools/angel2-plane-order.mjs --extract reverse/unpacked/lzexe-modules/raw/0021-unpacked.bin reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/plane-order.json
reverse/tools/angel2-audio.mjs --convert-root reverse/extracted reverse/converted/audio
reverse/tools/angel2-tables.mjs --export ref/ANGEL2 reverse/parsed/tables
reverse/tools/angel2-map-rules.mjs --extract ref/ANGEL2/MAP.SWF reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/unit-descriptors.json reverse/parsed/native/map-rules.json
reverse/tools/angel2-save.mjs --inspect ref/ANGEL2 reverse/parsed/saves/TST.json
reverse/tools/angel2-save.mjs --decode ref/ANGEL2 reverse/extracted/saves/decoded reverse/parsed/saves/TST-decoded.json reverse/parsed/native/unit-descriptors.json reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin
node reverse/tools/angel2-save-robustness.mjs reverse/unpacked/lzexe-modules/raw/0023-unpacked.bin reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin ref/ANGEL2 reverse/parsed/native/save-robustness.json
reverse/tools/angel2-js3-config.mjs --inspect ref/ANGEL2/AG2.JS3 reverse/unpacked/JS3.UNPACKED.EXE reverse/parsed/native/input-ui.json reverse/parsed/native/AG2-JS3.json
reverse/tools/angel2-battle-templates.mjs --extract reverse/decoded/B reverse/parsed/native/battle-templates.json reverse/parsed/native/unit-descriptors.json
node reverse/tools/angel2-battle-lifecycle.mjs --extract reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/battle-templates.json reverse/parsed/native/battle-lifecycle.json
node reverse/tools/angel2-stage-events.mjs --extract reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/unpacked/lzexe-modules/raw/0033-unpacked.bin reverse/unpacked/lzexe-modules/raw/0035-unpacked.bin reverse/unpacked/lzexe-modules/raw/0046-unpacked.bin reverse/parsed/native/battle-templates.json reverse/parsed/native/battle-objectives.json reverse/parsed/native/unit-descriptors.json reverse/parsed/native/title-flow.json reverse/parsed/dialogue reverse/parsed/native/stage-events.json
node reverse/tools/angel2-stage-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/stage-events.json reverse/parsed/native/feedback-presentations.json reverse/parsed/native/story-presentations.json reverse/parsed/native/title-flow.json reverse/parsed/native/technique-presentations.json reverse/converted/audio/manifest.json reverse/extracted/E/0014.bin reverse/parsed/native/stage-presentations.json
node reverse/tools/angel2-dialogue.mjs --self-test reverse/extracted/SAY
node reverse/tools/angel2-dialogue.mjs --compile-all reverse/extracted/SAY reverse/parsed/dialogue
node reverse/tools/angel2-story-presentations.mjs --render reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin reverse/decoded reverse/parsed/dialogue reverse/renders/story-presentations
node reverse/tools/angel2-story-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/stage-events.json reverse/converted/audio/manifest.json reverse/parsed/dialogue reverse/renders/story-presentations reverse/parsed/native/story-presentations.json
node reverse/tools/angel2-feedback-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/extracted/UN/0039.bin reverse/extracted/UN/0040.bin reverse/converted/audio/manifest.json reverse/parsed/native/input-ui.json reverse/renders/story-presentations/manifest.json reverse/parsed/native/feedback-presentations.json
node reverse/tools/angel2-ending-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/unpacked/lzexe-modules/raw/0033-unpacked.bin reverse/unpacked/lzexe-modules/raw/0035-unpacked.bin reverse/unpacked/lzexe-modules/raw/0046-unpacked.bin reverse/parsed/native/unit-descriptors.json reverse/extracted reverse/parsed/native/ending-presentations.json
reverse/tools/angel2-terrain-mapping.mjs --extract reverse/parsed/native/battle-templates.json reverse/decoded/B reverse/decoded/UN/0056/00.raw reverse/parsed/native/map-rules.json reverse/parsed/native/terrain-token-map.json
reverse/tools/angel2-battle-map.mjs --render-all reverse/decoded/B reverse/parsed/native/battle-templates.json reverse/renders/battle-maps/confirmed
reverse/tools/angel2-battle-map.mjs --render-minimap-all reverse/decoded/B reverse/parsed/native/battle-templates.json reverse/parsed/native/terrain-token-map.json reverse/renders/battle-maps/minimap
reverse/tools/angel2-battle-map.mjs --render-minimap-occupancy-all reverse/decoded/B reverse/parsed/native/battle-templates.json reverse/parsed/native/terrain-token-map.json reverse/renders/battle-maps/minimap-occupancy
reverse/tools/angel2-save-minimap.mjs reverse/extracted/saves/decoded reverse/decoded/UN/0056/00.raw reverse/renders/battle-maps/save-minimap
reverse/tools/angel2-minimap-rules.mjs reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/decoded/B reverse/parsed/native/battle-templates.json reverse/parsed/native/minimap-rules.json
reverse/tools/angel2-terrain-name-audit.mjs reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/extracted/A/0007.bin reverse/renders/raw-font/A/0007.json reverse/parsed/native/terrain-name-audit.json
reverse/tools/angel2-battle-objectives.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/battle-objectives.json reverse/parsed/native/battle-templates.json
node reverse/tools/angel2-combat-formulas.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/unit-descriptors.json reverse/parsed/native/combat-formulas.json
node reverse/tools/angel2-combat-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/unit-descriptors.json reverse/converted/audio/manifest.json reverse/extracted reverse/decoded reverse/renders/planar reverse/parsed/native/combat-presentations.json
node reverse/tools/angel2-shooting-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/converted/audio/manifest.json reverse/extracted reverse/decoded reverse/renders/planar reverse/parsed/native/shooting-presentations.json
node reverse/tools/angel2-technique-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/converted/audio/manifest.json reverse/extracted reverse/decoded reverse/renders/planar reverse/parsed/native/technique-presentations.json
node reverse/tools/angel2-remaining-technique-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/converted/audio/manifest.json reverse/extracted reverse/decoded reverse/renders/planar reverse/parsed/native/remaining-technique-presentations.json
node reverse/tools/angel2-wd-stage26.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/extracted reverse/decoded reverse/renders/planar reverse/parsed/native/battle-templates.json reverse/parsed/native/wd-stage26.json
node reverse/tools/angel2-behavior12-effects.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/decoded/B reverse/parsed/native/battle-templates.json reverse/parsed/native/terrain-token-map.json reverse/parsed/native/map-rules.json reverse/parsed/native/technique-presentations.json reverse/parsed/native/behavior12-effects.json
node reverse/tools/angel2-b-record-audit.mjs --extract reverse/unpacked/lzexe-modules/raw reverse/extracted/B reverse/decoded/B reverse/parsed/native/b-record-audit.json
node reverse/tools/angel2-native-timing.mjs --extract-all reverse/unpacked/lzexe-modules/raw reverse/parsed/native/native-timing.json
node reverse/tools/angel2-phase1-audit.mjs --extract reverse/gdd/evidence-register.md reverse/parsed/native/technique-rules.json reverse/parsed/native/ai-rules.json reverse/parsed/native/behavior12-effects.json reverse/parsed/native/b-record-audit.json reverse/parsed/native/story-presentations.json reverse/parsed/native/feedback-presentations.json reverse/parsed/native/native-timing.json reverse/parsed/native/phase1-residual-audit.json
node reverse/tools/angel2-turn-actions.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/unit-descriptors.json reverse/parsed/native/battle-templates.json reverse/parsed/native/turn-actions.json
node reverse/tools/angel2-input-ui.mjs --extract reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/input-ui.json
node reverse/tools/angel2-hud-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/renders/planar reverse/parsed/native/hud-presentations.json reverse/renders/hud-presentations/unit-detail-layout.svg
reverse/tools/angel2-borland-debug.mjs --extract ref/ANGEL2/GO.EXE reverse/parsed/debug/GO-symbols.json
node reverse/tools/angel2-title-flow.mjs --extract ref/ANGEL2/GO.EXE reverse/unpacked/lzexe-modules/raw/0023-unpacked.bin reverse/extracted/A/0023.bin reverse/extracted/A/0024.bin reverse/parsed/native/title-flow.json
node reverse/tools/angel2-title-presentations.mjs --render reverse/unpacked/lzexe-modules/raw/0023-unpacked.bin reverse/decoded reverse/renders/title-presentations
node reverse/tools/angel2-title-presentations.mjs --extract reverse/unpacked/lzexe-modules/raw/0023-unpacked.bin reverse/converted/audio/manifest.json reverse/decoded reverse/renders/title-presentations reverse/parsed/native/title-presentations.json
node reverse/tools/angel2-password-flow.mjs --extract ref/ANGEL2/GO.EXE ref/ANGEL2/PLAY.COM reverse/unpacked/lzexe-modules/raw/0021-unpacked.bin reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/extracted reverse/parsed/native/password-flow.json
reverse/tools/angel2-runtime-modules.mjs --extract reverse/extracted/UN reverse/decoded/UN reverse/unpacked/runtime-modules
reverse/tools/angel2-lzexe-modules.mjs --unpack reverse/unpacked/runtime-modules reverse/unpacked/lzexe-modules
reverse/ghidra_scripts/import-unpacked-runtime-modules.sh
reverse/tools/angel2-unit-descriptors.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/unit-descriptors.json reverse/parsed/external/unit-guide-comparison.json
reverse/tools/angel2-promotion-table.mjs --extract reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin reverse/parsed/native/unit-descriptors.json ref/ANGEL2/DATA.SWF reverse/parsed/native/promotion-table.json reverse/parsed/external/unit-guide-comparison.json
reverse/tools/angel2-unit-catalog.mjs --build reverse/parsed/tables/DATA.json reverse/parsed/native/unit-descriptors.json reverse/parsed/native/promotion-table.json reverse/parsed/native/map-rules.json reverse/parsed/native/combat-formulas.json reverse/parsed/native/technique-rules.json reverse/parsed/native/ai-rules.json reverse/parsed/external/unit-guide-comparison.json reverse/parsed/native/unit-catalog.json reverse/parsed/native/unit-catalog.csv
reverse/tools/angel2-font.mjs --render-all reverse/extracted/NUM reverse/extracted/CHA reverse/renders/font --scale=2 --columns=16
reverse/tools/angel2-font.mjs --render-raw-root reverse/extracted reverse/renders/raw-font --scale=2 --columns=16
reverse/tools/angel2-inventory.mjs ref/ANGEL2 reverse reverse/manifests/resource-coverage.json
node reverse/tools/angel2-phase1-verify.mjs
```
