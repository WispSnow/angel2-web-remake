import { CLASS_CATALOG, type ClassId } from "./class-catalog.generated";

/**
 * `REMAKE-174` 原版Debug第三批：兵種／地型數值編輯只在本場戰鬥生效（用戶 2026-10-02 決定）。
 *
 * 原版把改動直接寫進即時表（`DATA` 資料行 DS:`8838..92E1`、`MAP` profile），退出時寫回磁碟。
 * 每次載入單位情境都重選資料行（`0000:5256/52BC`），每次移動與地形防禦查詢都重讀 profile，
 * 所以改動立刻生效。複刻把改動放在目前戰鬥物件的覆寫表裡，所有讀職業資料行、移動消耗
 * 與地形防禦的查表都先經過這裡；離開戰鬥、讀檔或建立新戰鬥時覆寫隨戰鬥物件一起消失，
 * 不進存檔、不改規則身分，也不寫任何持久儲存。
 */

export const CLASS_DATA_FIELDS = [
  "experienceThreshold",
  "attack",
  "defense",
  "maxLife",
  "movement",
  "reservedField5",
  "level",
] as const;

export type ClassDataField = (typeof CLASS_DATA_FIELDS)[number];

export type ClassDataRow = { readonly row: number } & { readonly [Field in ClassDataField]: number };

export type TerrainDataTable = "movement" | "defense";

export interface BattleDataEdits {
  /** 每次改動都遞增；AI 規劃快取以它判斷查表是否變了。 */
  readonly revision: number;
  readonly classRows: ReadonlyMap<ClassId, readonly ClassDataRow[]>;
  readonly movementRules: ReadonlyMap<ClassId, readonly number[]>;
  readonly terrainDefense: ReadonlyMap<ClassId, readonly number[]>;
}

/** 原版每個 profile 23 個邏輯地形槽；第 24 字是與下一 profile 重疊的字，不是地形槽。 */
export const TERRAIN_DATA_SLOT_COUNT = 23;

let editsSource: (() => BattleDataEdits | undefined) | undefined;
let nativeReads = 0;

/**
 * 由持有目前戰鬥的控制器登記一次：查表時才讀，所以換掉戰鬥物件（撤退、重開、讀檔、下一關）
 * 的同時覆寫就跟著換掉，不必在每條離開戰鬥的路徑上記得清除。
 */
export function setBattleDataEditsSource(source: (() => BattleDataEdits | undefined) | undefined): void {
  editsSource = source;
}

export function activeBattleDataEdits(): BattleDataEdits | undefined {
  return nativeReads > 0 ? undefined : editsSource?.();
}

/**
 * 以原版資料執行：存檔的寫出與讀取校驗都在這裡面，戰中記錄因此永遠按原版數值成立，
 * 讀回時就是「還原」之後的戰鬥。
 */
export function withNativeBattleData<T>(read: () => T): T {
  nativeReads += 1;
  try {
    return read();
  } finally {
    nativeReads -= 1;
  }
}

export function nativeClassDataRows(classId: ClassId): readonly ClassDataRow[] {
  return CLASS_CATALOG[classId].dataRows;
}

export function nativeTerrainData(classId: ClassId, table: TerrainDataTable): readonly number[] {
  const definition = CLASS_CATALOG[classId];
  return table === "movement" ? definition.movementRules : definition.terrainDefensePercents;
}

export function classDataRowsWithEdits(classId: ClassId): readonly ClassDataRow[] {
  return activeBattleDataEdits()?.classRows.get(classId) ?? nativeClassDataRows(classId);
}

export function terrainDataWithEdits(classId: ClassId, table: TerrainDataTable): readonly number[] {
  const edits = activeBattleDataEdits();
  const edited = table === "movement" ? edits?.movementRules.get(classId) : edits?.terrainDefense.get(classId);
  return edited ?? nativeTerrainData(classId, table);
}

const emptyEdits = (): BattleDataEdits => ({
  revision: 0,
  classRows: new Map(),
  movementRules: new Map(),
  terrainDefense: new Map(),
});

/** 改一格職業資料：其餘資料行與欄位照舊，回傳新的覆寫表。 */
export function withClassDataValue(
  edits: BattleDataEdits | undefined,
  classId: ClassId,
  row: number,
  field: ClassDataField,
  value: number,
): BattleDataEdits {
  const base = edits ?? emptyEdits();
  const rows = base.classRows.get(classId) ?? nativeClassDataRows(classId);
  if (!rows[row]) throw new Error(`${classId} has no data row ${row}`);
  const classRows = new Map(base.classRows);
  classRows.set(classId, rows.map((entry, index) => index === row ? { ...entry, [field]: value } : entry));
  return { ...base, revision: base.revision + 1, classRows };
}

/** 改一格地形資料（移動消耗或地形防禦百分比）。 */
export function withTerrainDataValue(
  edits: BattleDataEdits | undefined,
  classId: ClassId,
  table: TerrainDataTable,
  slot: number,
  value: number,
): BattleDataEdits {
  if (!Number.isInteger(slot) || slot < 0 || slot >= TERRAIN_DATA_SLOT_COUNT) {
    throw new Error(`terrain slot ${slot} is not editable`);
  }
  const base = edits ?? emptyEdits();
  const key = table === "movement" ? "movementRules" : "terrainDefense";
  const current = base[key].get(classId) ?? nativeTerrainData(classId, table);
  const next = new Map(base[key]);
  next.set(classId, current.map((entry, index) => index === slot ? value : entry));
  return { ...base, revision: base.revision + 1, [key]: next };
}

/**
 * 原版逐位編輯（`0000:1A6F..1AB5`、`0000:21EE..2234`）：把值拆成五位十進位，所選那一位
 * 在 0..9 之間不進位循環，再重組成 16 位字，所以 65536..99999 會繞回。`digit` 從最高位數起。
 */
export function steppedDataDigit(value: number, digit: number, delta: 1 | -1): number {
  if (!Number.isInteger(digit) || digit < 0 || digit > 4) throw new Error(`digit ${digit} is outside the 5-digit field`);
  const digits = [...String(Math.max(0, Math.trunc(value)) % 100_000).padStart(5, "0")].map(Number);
  digits[digit] = ((digits[digit] ?? 0) + delta + 10) % 10;
  return Number(digits.join("")) % 0x1_0000;
}
