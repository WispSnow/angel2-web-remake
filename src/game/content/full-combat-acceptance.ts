import { CLASS_IDS, type ClassId } from "./class-catalog.generated";

export type FullCombatAcceptanceStatus = "accepted" | "pending";

/**
 * 原版只有右侧（side 2）可达的记录。女帝（35）在场景 30 是 side 2 单位，
 * 场景 42 虽为 side 1 但该关没有敌方单位；36–38 只出现在 side 2 编队。
 * 这些记录的左侧 `M_00` 资源为空占位，验收不覆盖左侧。
 */
export type FullCombatReach = "both-sides" | "right-only";

const RIGHT_ONLY_NOTES: Readonly<Record<number, string>> = {
  35: "原版仅有右侧 direct/class+50 资源，且逐字节复用士兵图形；左侧普通攻击不可达。",
  36: "原版只填 side 2 表现块与 Y_00 图形；龍只在场景 20/22 以 side 2 登场，左侧不可达。",
  37: "原版只填 side 2 表现块与 Y_00 图形；頭只在场景 37 以 side 2 登场，左侧不可达。",
  38: "原版只填 side 2 表现块与 Y_00 图形；手只在场景 37 以 side 2 登场，左侧不可达。",
};

const RIGHT_ONLY_RECORDS: ReadonlySet<number> = new Set(
  Object.keys(RIGHT_ONLY_NOTES).map(Number),
);

interface AcceptedEvidence {
  commandStreams: true;
  framePlacement: true;
  leftAndRightSemantics?: true;
  rightOnlyOriginal?: true;
  attackScreenshot: string;
  guardScreenshot: string;
  hurtScreenshot: string;
  deathScreenshot: string;
}

interface FullCombatAcceptanceEntry {
  record: number;
  classId: ClassId;
  status: FullCombatAcceptanceStatus;
  reach: FullCombatReach;
  evidence?: AcceptedEvidence;
  note?: string;
}

const ACCEPTED_EVIDENCE: Readonly<Record<number, AcceptedEvidence>> = {
  0: {
    commandStreams: true,
    framePlacement: true,
    leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-00-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-00-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-00-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-00-death.png",
  },
  1: {
    commandStreams: true,
    framePlacement: true,
    leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-01-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-01-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-01-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-01-death.png",
  },
  2: {
    commandStreams: true,
    framePlacement: true,
    leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-02-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-02-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-02-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-02-death.png",
  },
  3: {
    commandStreams: true,
    framePlacement: true,
    leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-03-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-03-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-03-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-03-death.png",
  },
  4: {
    commandStreams: true,
    framePlacement: true,
    leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-04-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-04-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-04-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-04-death.png",
  },
  5: {
    commandStreams: true,
    framePlacement: true,
    leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-05-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-05-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-05-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-05-death.png",
  },
  6: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-06-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-06-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-06-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-06-death.png",
  },
  7: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-07-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-07-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-07-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-07-death.png",
  },
  8: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-08-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-08-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-08-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-08-death.png",
  },
  9: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-09-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-09-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-09-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-09-death.png",
  },
  10: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-10-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-10-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-10-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-10-death.png",
  },
  11: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-11-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-11-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-11-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-11-death.png",
  },
  12: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-12-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-12-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-12-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-12-death.png",
  },
  13: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-13-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-13-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-13-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-13-death.png",
  },
  14: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-14-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-14-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-14-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-14-death.png",
  },
  15: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-15-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-15-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-15-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-15-death.png",
  },
  16: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-16-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-16-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-16-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-16-death.png",
  },
  17: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-17-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-17-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-17-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-17-death.png",
  },
  18: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-18-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-18-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-18-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-18-death.png",
  },
  19: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-19-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-19-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-19-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-19-death.png",
  },
  20: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-20-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-20-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-20-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-20-death.png",
  },
  21: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-21-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-21-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-21-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-21-death.png",
  },
  22: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-22-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-22-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-22-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-22-death.png",
  },
  23: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-23-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-23-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-23-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-23-death.png",
  },
  24: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-24-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-24-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-24-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-24-death.png",
  },
  25: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-25-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-25-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-25-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-25-death.png",
  },
  26: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-26-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-26-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-26-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-26-death.png",
  },
  27: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-27-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-27-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-27-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-27-death.png",
  },
  28: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-28-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-28-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-28-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-28-death.png",
  },
  29: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-29-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-29-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-29-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-29-death.png",
  },
  30: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-30-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-30-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-30-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-30-death.png",
  },
  31: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-31-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-31-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-31-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-31-death.png",
  },
  32: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-32-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-32-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-32-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-32-death.png",
  },
  33: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-33-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-33-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-33-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-33-death.png",
  },
  34: {
    commandStreams: true, framePlacement: true, leftAndRightSemantics: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-34-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-34-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-34-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-34-death.png",
  },
  35: {
    commandStreams: true, framePlacement: true, rightOnlyOriginal: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-35-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-35-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-35-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-35-death.png",
  },
  36: {
    commandStreams: true, framePlacement: true, rightOnlyOriginal: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-36-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-36-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-36-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-36-death.png",
  },
  37: {
    commandStreams: true, framePlacement: true, rightOnlyOriginal: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-37-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-37-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-37-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-37-death.png",
  },
  38: {
    commandStreams: true, framePlacement: true, rightOnlyOriginal: true,
    attackScreenshot: "artifacts/playwright/combat-lab-record-38-attack.png",
    guardScreenshot: "artifacts/playwright/combat-lab-record-38-guard.png",
    hurtScreenshot: "artifacts/playwright/combat-lab-record-38-hurt.png",
    deathScreenshot: "artifacts/playwright/combat-lab-record-38-death.png",
  },
};

export const FULL_COMBAT_ACCEPTANCE: readonly FullCombatAcceptanceEntry[] =
  CLASS_IDS.map((classId, record): FullCombatAcceptanceEntry => {
    const evidence = ACCEPTED_EVIDENCE[record];
    const reach: FullCombatReach = RIGHT_ONLY_RECORDS.has(record)
      ? "right-only"
      : "both-sides";
    if (evidence) {
      return {
        record,
        classId,
        status: "accepted",
        reach,
        evidence,
        ...(RIGHT_ONLY_NOTES[record] ? { note: RIGHT_ONLY_NOTES[record] } : {}),
      };
    }
    return { record, classId, status: "pending", reach };
  });

export const ACCEPTED_FULL_COMBAT_RECORDS = FULL_COMBAT_ACCEPTANCE
  .filter((entry) => entry.status === "accepted")
  .map((entry) => entry.record);
