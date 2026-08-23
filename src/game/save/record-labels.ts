import { stageRuntimeSourceForDestination } from "../stage-runtime";
import type { SaveData } from "../types";

/**
 * 记录面板里代表这一条存档的关卡名。
 *
 * 原版存档头把关卡编号写在 `1Ah`（DS:`2E77`，模块 29 的“当前关卡”），把回合号写在
 * `1Ch`（DS:`2F83`；即时胜利 999 在构造文件元数据时序列化成 1000）。战后存档发生在
 * 刚打完的那一关内部，下一关编号写的是另一个 GO 共享字段 DS:`0008`，DS:`2E77` 并不
 * 跟着前进，所以原版这两个字段始终描述同一关：关卡 N，结果为“已保存胜利”。证据见
 * `reverse/notes/save-slot-format.md` 的槽位元数据表、`reverse/notes/battle-lifecycle.md`
 * 的 `999/1000` 一节与证据登记 `BAT-043`。
 *
 * 复刻版的 `CompletedSaveData` 以“下一关入口”为身份，`stageId` 与 `stageLabel` 存的都是
 * 目的地；直接把它当关卡名，就会和固定显示“完”的回合列自相矛盾——名字是还没开打的下
 * 一关，回合却说它已经打完。因此显示层按目的地反查来源关卡，让两列重新描述同一关。
 * 存档字段本身保持“下一关入口”语义不变，这里只修正玩家看到的那一列。
 */
export function saveRecordStageLabel(save: SaveData): string {
  if (save.kind === "battle") return save.stageLabel;
  // 合法的完成档必然能反查到来源关卡：`isCompletedSave` 对 `stageId` 反查失败即拒绝。
  return stageRuntimeSourceForDestination(save.stageId)?.label ?? save.stageLabel;
}
