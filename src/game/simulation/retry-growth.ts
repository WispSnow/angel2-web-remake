import type { CampaignState } from "../types";

/**
 * `REMAKE-215`「敗退保留經驗」：戰敗或全面撤退後，把這次嘗試的成長併回入關快照。
 *
 * 原版失敗與撤退都回到模組 27 的同一關，但不回滾上層戰役的職業與累計經驗（`REMAKE-016`
 * 記為 `[OF]`）。複刻預設照 `REMAKE-016` 從入關快照整份重建；玩家打開這個懷舊選項時，
 * 只把名冊每一槽的**職業與經驗**換成本次嘗試結束時的值——升級由經驗推得，轉職就是職業。
 *
 * 其餘一律仍是入關時的值：生命（新戰本來就回滿，`REMAKE-077`）、KILL_ALL 戰績、PRNG、
 * 事件消費與難度。只更新入關時已在名冊裡的槽，不替本關中途才登場的角色預先寫入名冊。
 *
 * 結果就是新的入關快照：之後即使關掉選項再失敗，也回到這次重打開始時的狀態。
 */
export function stageEntryWithAttemptGrowth(
  entry: CampaignState,
  attempt: CampaignState,
): CampaignState {
  const attemptBySlot = new Map(attempt.roster.map((member) => [member.slot, member]));
  return {
    ...entry,
    roster: entry.roster.map((member) => {
      const grown = attemptBySlot.get(member.slot);
      return grown
        ? { ...member, classId: grown.classId, experience: grown.experience }
        : { ...member };
    }),
    ...(entry.recordCounters ? { recordCounters: [...entry.recordCounters] } : {}),
  };
}
