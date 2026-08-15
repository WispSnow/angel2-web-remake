import { classDefinition, className, classStatsFor } from "../content/classes";
import {
  STAGE49_CLASS_FAMILIES,
  STAGE49_EPILOGUE_SEGMENTS,
  STAGE49_ROSTER_ACTORS,
  STAGE49_ROSTER_WAIT_NATIVE_TICKS,
  STAGE49_STORY_PAGES,
} from "../content/stage49-ending";
import type { CampaignState, SaveRosterEntry } from "../types";

export type Stage49EndingSection = "story" | "roster" | "epilogue" | "stage38-boundary";
export type Stage49ClassFamily = keyof typeof STAGE49_CLASS_FAMILIES;

export interface Stage49RosterCard {
  actor: (typeof STAGE49_ROSTER_ACTORS)[number];
  roster: SaveRosterEntry;
  className: string;
  level: number;
  maxLife: number;
  attack: number;
  defense: number;
  record: number;
}

export interface Stage49EpiloguePresentation {
  segment: (typeof STAGE49_EPILOGUE_SEGMENTS)[number];
  variant: (typeof STAGE49_EPILOGUE_SEGMENTS)[number]["variants"][number];
}

const nativeRecordSet = (family: Stage49ClassFamily): ReadonlySet<number> =>
  new Set<number>(STAGE49_CLASS_FAMILIES[family]);

/**
 * [DD] Native module 35 leaves the warrior-statue segment's wait limit at 0
 * (`mov word [0DED],0000` at 0000:04C4), and its wait loop is an unsigned
 * `counter < limit` test, so DOS drew the two plates and the text and then
 * advanced on the very next iteration. Players only ever caught it flashing
 * while the next segment loaded from disk — the segment has full text and its
 * own illustration pair, so the missing limit is an original oversight rather
 * than a designed cut.
 *
 * A browser cannot reproduce even that flash: the plates are `<img>` elements
 * that load asynchronously, so a 0 ms limit means the segment never paints at
 * all, which is strictly less than the original showed. The floor adopts the
 * shortest limit the three sibling segments actually use (0x08C3) instead of an
 * invented number, and the segment stays skippable by any semantic action. This
 * is presentation only: it consumes no simulation PRNG and changes no branch,
 * roster, or save state.
 */
const STAGE49_MINIMUM_EPILOGUE_NATIVE_TICKS = 0x08c3;

export class Stage49EndingSession {
  section: Stage49EndingSection = "story";
  index = 0;
  readonly saveCount: number;
  readonly recordTotal: number;
  readonly dominantClassFamily: Stage49ClassFamily;
  private readonly rosterBySlot: ReadonlyMap<number, SaveRosterEntry>;
  private readonly recordCounters: readonly number[];

  constructor(campaign: CampaignState, saveCount: number) {
    this.saveCount = Math.max(0, Math.trunc(saveCount));
    this.recordCounters = campaign.recordCounters ?? Array<number>(75).fill(0);
    this.recordTotal = this.recordCounters.reduce((sum, value) => sum + value, 0);
    this.rosterBySlot = new Map(campaign.roster.map((entry) => [entry.slot, entry]));
    this.dominantClassFamily = this.resolveDominantClassFamily(campaign.roster);
  }

  get storyPage() {
    return this.section === "story" ? STAGE49_STORY_PAGES[this.index] : undefined;
  }

  get rosterCard(): Stage49RosterCard | undefined {
    if (this.section !== "roster") return undefined;
    const actor = STAGE49_ROSTER_ACTORS[this.index];
    if (!actor) return undefined;
    const roster = this.rosterBySlot.get(actor.slot);
    if (!roster) throw new Error(`stage 49 ending is missing roster slot ${actor.slot}`);
    const stats = classStatsFor(roster);
    return {
      actor,
      roster,
      className: className(roster.classId),
      level: stats.level,
      maxLife: stats.maxLife,
      attack: stats.attack,
      defense: stats.defense,
      record: this.recordCounters[actor.slot] ?? 0,
    };
  }

  get epiloguePresentation(): Stage49EpiloguePresentation | undefined {
    if (this.section !== "epilogue") return undefined;
    const segment = STAGE49_EPILOGUE_SEGMENTS[this.index];
    if (!segment) return undefined;
    const selector = this.selectorForSegment(segment.id);
    const variant = segment.variants.find((candidate) => candidate.selector === selector)
      ?? segment.variants[0];
    return { segment, variant };
  }

  get autoAdvanceMilliseconds(): number | undefined {
    if (this.section === "roster") return STAGE49_ROSTER_WAIT_NATIVE_TICKS * 10;
    if (this.section === "epilogue") {
      const ticks = this.epiloguePresentation?.segment.waitNativeTicks;
      if (ticks === undefined) return undefined;
      return Math.max(ticks, STAGE49_MINIMUM_EPILOGUE_NATIVE_TICKS) * 10;
    }
    return undefined;
  }

  /**
   * Native module 35 picks the closing track from the record-total selector at
   * 0000:0457 and starts it at 0000:045A, before the first of the four
   * segments, so the whole epilogue plays over it rather than switching when
   * segment 4 appears.
   */
  get epilogueMusicSelector(): number {
    return this.selectorForSegment("recordTotalOutcome");
  }

  /** Returns the section the ending landed on, so callers do not have to
   * re-read a field their own guards have already narrowed. */
  advance(): Stage49EndingSection {
    if (this.section === "story") {
      if (this.index + 1 < STAGE49_STORY_PAGES.length) this.index += 1;
      else {
        this.section = "roster";
        this.index = 0;
      }
      return this.section;
    }
    if (this.section === "roster") {
      if (this.index + 1 < STAGE49_ROSTER_ACTORS.length) this.index += 1;
      else {
        this.section = "epilogue";
        this.index = 0;
      }
      return this.section;
    }
    if (this.section === "epilogue") {
      if (this.index + 1 < STAGE49_EPILOGUE_SEGMENTS.length) this.index += 1;
      else {
        this.section = "stage38-boundary";
        this.index = 0;
      }
    }
    return this.section;
  }

  private resolveDominantClassFamily(roster: readonly SaveRosterEntry[]): Stage49ClassFamily {
    const families = ["cavalry", "fighter", "mage"] as const;
    const counts = Object.fromEntries(families.map((family) => [family, 0])) as Record<
      Stage49ClassFamily,
      number
    >;
    const familyRecords = Object.fromEntries(
      families.map((family) => [family, nativeRecordSet(family)]),
    ) as Record<Stage49ClassFamily, ReadonlySet<number>>;
    for (let slot = 0; slot < 23; slot += 1) {
      const entry = roster.find((candidate) => candidate.slot === slot);
      if (!entry) continue;
      const nativeRecord = classDefinition(entry.classId).nativeRecord;
      for (const family of families) {
        if (familyRecords[family].has(nativeRecord)) counts[family] += 1;
      }
    }
    if (counts.cavalry >= counts.fighter && counts.cavalry >= counts.mage) return "cavalry";
    if (counts.fighter >= counts.mage) return "fighter";
    return "mage";
  }

  private selectorForSegment(id: string): number {
    if (id === "dominantClassFamily") {
      return this.dominantClassFamily === "cavalry"
        ? 0
        : this.dominantClassFamily === "fighter" ? 1 : 2;
    }
    if (id === "saveCountOutcome") return this.saveCount > 100 ? 0 : 1;
    if (id === "recordTotalOutcome") return this.recordTotal <= 100 ? 0 : 1;
    return 0;
  }
}
