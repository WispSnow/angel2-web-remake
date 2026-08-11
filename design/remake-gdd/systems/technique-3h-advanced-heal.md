# `3H / 高級治療` 系统规格

状态：`implemented`；2026-08-05 完成证据、规则、双方 AI、正式表现、竞技场、
technique-lab、完整自动门禁与截图审计；无实施必需 `[TBD]`

负责人：Web 复刻实现

依赖：[`technique-implementation-sequence.md`](technique-implementation-sequence.md)、
[`technique-2h-intermediate-heal.md`](technique-2h-intermediate-heal.md)、
[`shooting-and-technique-system.md`](../../../reverse/notes/shooting-and-technique-system.md)、
[`technique-presentations.md`](../../../reverse/notes/technique-presentations.md)、
[`ai-decision-system.md`](../../../reverse/notes/ai-decision-system.md)、
[`technique-rules.json`](../../../reverse/parsed/native/technique-rules.json)、
[`technique-presentations.json`](../../../reverse/parsed/native/technique-presentations.json)、
[`ai-rules.json`](../../../reverse/parsed/native/ai-rules.json)、
[`web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-013冰封不可被攻治外圈不外推破邪可解除)、
[`web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心`](../../../reverse/gdd/web-remake-rule-decisions.md#remake-014敌方技术提示保留原文并对焦效果中心)

## 玩家目的

魔導師第三层在七步内指定一名未冰封的同阵营单位，先以 `MAGIC/42` 张开心盾、
再以 `MAGIC/41` 循环三轮，然后反向收回 `MAGIC/42` 并播放共同 `MAGIC/0` 尾效；
全部 235 native tick 结束后恢复目标最大生命的至多 48%，再按真实恢复比例结算经验。

## 证据与决策

- `[OF]` 魔導師 `1J` 第一／二／三层分别列 `1H,1I,AA`、`2H,1I,AA`、
  `3H,2I,AA,FM`；`3H` 不属于其他职业的玩家或 AI 技术池。
- `[OF]` 玩家分发表与 AI 参数表均把 `3H` 定义为同阵营单体目标、选择距离 7；
  允许选择施法者，满血单位也是合法目标。
- `[OF]` `actualHeal=min(maxLife-currentLife,floor(maxLife×48/100))`；
  `q=floor(actualHeal×10/maxLife)`；经验为
  `randomBelow(3)+(q==0?0:q+15)`。合法动作即使满血或 `q=0` 仍取一次 `0..2`。
- `[OF]` AI 第三层原版池按顺序为 `3H,2I,AA,FM`；原版先随机取一个池项，再为
  单体治疗在范围内最大化缺失生命，完全平局由线性格较后的目标覆盖。
- `[OF]` AI 表现组 15 原文为“生命單.”；原版成功块本身不对焦目标。Web 延续
  `REMAKE-014`，在对话前夹取到已准备的效果中心。
- `[OF]` 第一段是 `MAGIC/42` 正序五个 `3×2` 描述符，每项 6 tick，共 30 tick；
  每个时点同时组合六张原始图块。
- `[OF]` 第二段是 `MAGIC/41` 六个 `3×2` 描述符的完整顺序重复三轮，共 18 draw；
  每项 5 tick，合计 90 tick。
- `[OF]` 第三段反向读取 `MAGIC/42` 的前五个描述符，每项 8 tick，共 40 tick；
  随后是三档治疗共用的 `MAGIC/0` 前五项，每项 15 tick，共 75 tick。第六孤项不播放。
- `[OF]` 唯一 `E/36` 请求使用 `0000:0220`，时点是第一段 30 tick 完成后、
  `MAGIC/41` 第一帧之前，不是动画起点。
- `[OF]` 目标生命与施法经验只在 `30+90+40+75=235` tick 全部完成后修改；
  治疗没有炎暴式逐点生命数字循环。
- `[SR]` `REMAKE-013` 规定冰封单位不是合法治疗目标；非法选择不消耗行动、生命或
  经验 PRNG。`legacyStrict` 可保留原版冰雪只禁行动但仍可被治疗的行为。

## 触发与输入

- 魔導師仅第三层显示“高級治療”；第一／二层仍只使用各自已闭合子集，不得提前显示
  `3H`。第三层同层已实现的 `2I` 按原版顺序紧随其后，`AA/FM` 等待各自闭合。
- 行动者必须未行动、未冰封、未被禁咒；目标必须是距离 7 内未冰封的同阵营单位，
  可以是施法者自身或满血单位。
- 取消目标回技术菜单，再取消回动作菜单；不提交行动位、生命、经验或 PRNG。
- 确认时冻结 `{target, targetMaximumLife, actualHeal, q, experienceRoll,
  rngBefore/rngAfter}`；表现过程不得重读生命或重算经验。

## 有序规则

1. 验证魔導師第三层、行动位、冰封、禁咒、同阵营目标与选择距离 7；
2. 计算 `actualHeal=min(missingLife,floor(maxLife×48/100))` 和
   `q=floor(actualHeal×10/maxLife)`；
3. 无条件从模拟 PRNG 取一次 `0..2`；经验为该值加上 `q==0?0:q+15`；
4. 保存目标结果、经验和完整 PRNG 前后态，模拟真值仍保持准备前状态；
5. 播放 `MAGIC/42` 正序五项×6 tick；30 tick 后请求一次 `E/36`；
6. 播放 `MAGIC/41` 六项三轮×5 tick，再播放 `MAGIC/42` 反序五项×8 tick；
7. 播放 `MAGIC/0` 前五项×15 tick；第六孤项不播放；
8. 完整 235 tick 后原子提交目标生命、施法经验、PRNG 与行动位，再进入转职／胜负／阶段链。

## AI 使用

魔導師第三层原版池为 `3H/2I/AA/FM`。逐项实施期间按原顺序只让已闭合的 `3H/2I`
进入可执行子集；后续动作完成时再恢复完整池。`REMAKE-033/037` 之后池内不再抽签，选哪
一项以及选哪个接受者由共享专家效用决定，不再使用 `3H` 自己的“缺失生命最多、平局取线性
格较后者”原生选择器；完整规则见
[`expert-enemy-ai.md`](expert-enemy-ai.md#与逐技术规格的关系)。距离 7 的选择范围、排除
冰封接受者、组 15 原文、共同表现与同一准备／提交路径都不变；无合法目标时仍进入职业
fallback 且不消耗本次治疗随机。

与原版不同的是，满生命接受者会被记为“无效／重复”，所以 `stableRemake` 的自动 `3H` 只在
真有缺失生命时出现。`3H` 恢复上限为最大生命的 48%，同池 `2I` 的环心为固定 90，因此单名
重伤者由 `3H` 承担、多名伤员聚集时由 `2I` 承担。`legacyStrict` 可保留原版抽签与原生
选择器，满血目标仍可被选中。

## 规则集与 Mod

| 配置 | 行为 |
| --- | --- |
| `stableRemake` | 距离 7；确定性 PRNG；冰封不可治疗；玩家与 AI 共用公式、随机与表现 |
| `legacyStrict` | 距离、公式、随机与表现相同；冰雪只禁行动，冰封目标仍可接受治疗 |
| 可开放 Mod 字段 | 职业层级菜单、选择距离、比例、经验、资源／描述符／声音／等待；修改后必须改变规则身份 |

## 表现与可访问性

`MAGIC/42/41` 的每个时点都必须按描述符同时组合六张 40×44 原始图块，形成一个
`3×2` 心盾，不能把素材平铺为逐图帧。`MAGIC/42` 必须正序张开、反序收回；`MAGIC/41`
必须完整重复三轮。共同尾段只播放 `MAGIC/0` 五帧。原始像素禁用平滑。加速、减少动态、
静音或 AI 对话开关只能改变墙钟、声音或提示，不得改变 `5+18+5+5=33` draw、235 tick、
`E/36` 的 30 tick 请求节点、准备结果、PRNG 或原子提交时点。

## 验收场景

1. 三层魔導師分别只显示／规划原版层级当前已完成子集；`3H` 只在第三层可用，
   且同层位于已实现 `2I` 之前；
2. 最大生命 600、缺失 400 时恢复 288，`q=4`，经验 `19..21`；缺失 50 时恢复 50，
   `q=0`，经验只有 `0..2`；
3. 满血目标恢复 0，仍正常取一次经验随机、取得 `0..2` 并结束行动；冰封目标在
   `stableRemake` 不属于合法目标且不消耗 PRNG；
4. 固定 PRNG 覆盖 0/1/2 端点，每次合法准备只有一次调用；动画、音效和生命读取不增加调用；
5. AI 按实际恢复量选择接受者，满生命者记为无效；使用组 15“生命單.”，且不先移动；
6. 正式玩家与 AI 都依次播放 `MAGIC/42` 5×6、`MAGIC/41` 18×5、`MAGIC/42` 反序 5×8 与
   `MAGIC/0` 5×15；自动断言唯一 `E/36` 在 30 tick 后请求，235 tick 前生命与经验不提交；
7. technique-lab 可 seek 张开心盾、三轮循环、反序收回和共同尾段；代表性截图确认
   每个主段时点都是六图块同时组成的 `3×2` 原图，不是低阶治疗换色或素材逐张播放。

## 验证记录

- `scripts/generate-stage1-actions.mjs` 与 `scripts/generate-technique-lab.mjs` 从机器 JSON
  固化 `3H` 的半径 7、48%、经验 `15/0..2`、四段资源／描述符、33 draw、235 tick
  和 `E/36@30`；生成器逐项断言 `MAGIC/41` 三次完整循环、`MAGIC/42` 反序与五帧尾效。
- 模拟层只向魔導師第三层开放 `heal-3`，玩家和 AI 共用单体准备／原子提交路径；覆盖
  288 恢复与 `19..21` 经验、`q=0`／满血一次随机、线性格较后平局、半径 7、层级门禁，
  并把 `3H` 纳入 `REMAKE-013` 冰封非法目标／零 PRNG 回归。
- 双方正式表现均执行 `5+18+5` 个六图块主体和五帧共同尾效；浏览器在主体 frame 3
  确认尚无声音，在 frame 12 确认唯一 `heal-3-bloom` 已于 30 tick 节点请求，并断言
  主体 28 draw、尾段 5 draw、总计 235 tick。AI 使用组 15“生命單.”并对焦准备目标。
- technique-lab 支持四段独立 seek、变速、单步与 15 tick 末帧保持；正式竞技场同时发布
  魔導師原版我方地图图形，不以士兵代替。
- 自动验证：`pnpm test:coverage` 通过 37 文件／423 测试；`pnpm build` 通过；
  `node reverse/tools/angel2-phase1-verify.mjs` 返回
  `implementationRequiredUnknowns=0`；`pnpm test:e2e` 通过 Chromium 165/165。
- 已人工查看
  `artifacts/playwright/arena-heal-3-heart.png`、
  `artifacts/playwright/arena-heal-3-ai-heart.png` 与
  `artifacts/playwright/technique-lab-heal-3-heart.png`：玩家、AI 与实验室均由六张原始
  40×44 图块同时拼成心盾，未出现低阶缩放、逐图播放、错锚或末帧残留。
