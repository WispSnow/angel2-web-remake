import { describe, expect, test } from "vitest";
import {
  NATIVE_FONT,
  NATIVE_FONT_CHARACTERS,
  NATIVE_MENU_LABEL_PADDING,
  NATIVE_ROUND_DIGIT_INDICES,
  NATIVE_ROUND_TEMPLATE,
  NATIVE_STAGE_LABEL_PADDING,
  NATIVE_STAT_ROWS,
  NATIVE_STATUS_COUNTERS,
  NATIVE_STORY_TEXT,
  NATIVE_TEXT,
  NATIVE_TEXT_ORIGINS,
} from "../../src/game/content/native-font.generated";
import {
  layoutNativeText,
  NATIVE_CONCEALED_FIELD,
  nativeIdentityField,
  nativeNumericField,
  nativeRoundLine,
  nativeStatRow,
} from "../../src/game/native-text";
import { nativeMenuLabelText } from "../../src/game/native-dom-text";
import { nativeStageLabelText } from "../../src/game/native-hud-text";

const glyphCell = (character: string) => NATIVE_FONT_CHARACTERS.indexOf(character);
const asciiCell = (character: string) =>
  NATIVE_FONT.halfWidthBase + character.charCodeAt(0) - NATIVE_FONT.halfWidthFirstCode;

describe("native battle font atlas", () => {
  test("carries every character the battle HUD, round panel and stage labels draw", () => {
    const drawn = [
      ...NATIVE_STAT_ROWS.map(({ template }) => template.replaceAll("0", "")).join(""),
      NATIVE_ROUND_TEMPLATE,
      ...Object.keys(NATIVE_STAGE_LABEL_PADDING),
    ].join("");
    const missing = [...drawn].filter((character) =>
      character.codePointAt(0)! > 0x7f && !NATIVE_FONT_CHARACTERS.includes(character));
    expect(missing).toEqual([]);
  });

  test("keeps one cell per character so an atlas index is unambiguous", () => {
    expect(new Set(NATIVE_FONT_CHARACTERS).size).toBe(NATIVE_FONT.fullWidthCount);
    expect([...NATIVE_FONT_CHARACTERS].length).toBe(NATIVE_FONT.fullWidthCount);
  });

  test("covers printable ASCII with the doubled BIOS ROM cells", () => {
    expect(NATIVE_FONT.halfWidthFirstCode).toBe(0x20);
    expect(NATIVE_FONT.halfWidthCount).toBe(0x80 - 0x20);
    expect(NATIVE_FONT.halfWidthWidth).toBe(8);
    expect(NATIVE_FONT.cellHeight).toBe(16);
  });
});

describe("0000:EA04 cursor", () => {
  test("advances 16 pixels per Big5 cell and 9 per drawn half-width cell", () => {
    const layout = layoutNativeText("生命12", 488, 154);
    expect(layout.glyphs).toEqual([
      { cell: glyphCell("生"), x: 488, y: 154, halfWidth: false },
      { cell: glyphCell("命"), x: 504, y: 154, halfWidth: false },
      { cell: asciiCell("1"), x: 520, y: 154, halfWidth: true },
      { cell: asciiCell("2"), x: 529, y: 154, halfWidth: true },
    ]);
    expect(layout.x).toBe(538);
  });

  test("advances a space by 8 and a tab by 72 without drawing either", () => {
    expect(layoutNativeText(" ", 0, 0)).toMatchObject({ glyphs: [], x: 8 });
    expect(layoutNativeText("\t", 0, 0)).toMatchObject({ glyphs: [], x: 72 });
  });

  test("stops at the dollar terminator the native buffers end with", () => {
    const layout = layoutNativeText("生$命", 0, 0);
    expect(layout.glyphs).toHaveLength(1);
    expect(layout.x).toBe(16);
  });

  test("returns a pipe to the start column and drops 20 scanlines", () => {
    const layout = layoutNativeText("生|命", 40, 30);
    expect(layout.glyphs).toEqual([
      { cell: glyphCell("生"), x: 40, y: 30, halfWidth: false },
      { cell: glyphCell("命"), x: 40, y: 50, halfWidth: false },
    ]);
  });

  test("keeps the cursor on the native grid for a character the font never had", () => {
    // 「熵」 is outside all nine glyph arrays and all 176 script subsets.
    expect(NATIVE_FONT_CHARACTERS.includes("熵")).toBe(false);
    const layout = layoutNativeText("熵命", 100, 0);
    expect(layout.glyphs).toEqual([{ cell: glyphCell("命"), x: 116, y: 0, halfWidth: false }]);
  });

  test("compact mode advances 8 instead of 9, as the status counters do", () => {
    expect(layoutNativeText("12", 0, 0, "compact").x).toBe(16);
    expect(layoutNativeText("12", 0, 0).x).toBe(18);
  });

  test("story mode advances a half-width cell by 8 without the compact halo", () => {
    // `0000:C23E` hands each glyph to the same `0000:EA04`, but the SAY
    // interpreters run their own cursor: 8 px per ASCII cell, 16 per Big5.
    expect(NATIVE_STORY_TEXT.halfWidthAdvance).toBe(8);
    expect(layoutNativeText("12", 0, 0, "story").x).toBe(16);
    expect(layoutNativeText("生命12", 0, 0, "story").x).toBe(48);
    expect(NATIVE_TEXT.outline.compactHalo.mode).toBe("compact");
  });

  test("reports the box the drawn run occupies, line feeds included", () => {
    // A Big5 cell is drawn through a 17-row mask; a half-width one through 16.
    expect(layoutNativeText("生", 0, 0)).toMatchObject({ right: 18, bottom: 17 });
    expect(layoutNativeText("1", 0, 0)).toMatchObject({ right: 10, bottom: 16 });
    expect(layoutNativeText("生|命", 0, 0)).toMatchObject({ right: 18, bottom: 37 });
    expect(layoutNativeText("  ", 0, 0)).toMatchObject({ right: 0, bottom: 0 });
  });
});

describe("1EBA:3DD8 menu label padding", () => {
  test("keeps the original spacing inside the Big5 string, not in the layout", () => {
    // `移    動` is `B2BE 20202020 B0CA`: two glyphs around four half-width
    // spaces, so a row is 16 + 4 * 8 + 16 wide however it is drawn.
    expect(nativeMenuLabelText("移動")).toBe("移    動");
    expect(layoutNativeText(nativeMenuLabelText("移動"), 0, 0, "story").x).toBe(64);
    expect(nativeMenuLabelText("確 定")).toBe("確 定 ");
    expect(nativeMenuLabelText("遊戲功能")).toBe("遊戲功能");
  });

  test("passes a label the original never had through unchanged", () => {
    expect(nativeMenuLabelText("初級炎暴")).toBe("初級炎暴");
  });

  test("covers every label the command, system and group menus can show", () => {
    const missing = Object.values(NATIVE_MENU_LABEL_PADDING)
      .flatMap((label) => [...label])
      .filter((character) =>
        character.codePointAt(0)! > 0x7f && !NATIVE_FONT_CHARACTERS.includes(character));
    expect(missing).toEqual([]);
  });
});

describe("0000:EF56 numeric fields", () => {
  test("turns leading zeroes into spaces inside a five-character field", () => {
    expect(nativeNumericField(180)).toBe("  180");
    expect(nativeNumericField(3)).toBe("    3");
    expect(nativeNumericField(12345)).toBe("12345");
  });

  test("restores the last digit when the whole field emptied", () => {
    expect(nativeNumericField(0)).toBe("    0");
  });

  test("keeps five characters for values the panel cannot hold", () => {
    expect(nativeNumericField(1234567)).toBe("99999");
    expect(nativeNumericField(-5)).toBe("    0");
  });
});

describe("unit detail rows", () => {
  test("draws a stat row as one native string, not a label plus a right-aligned value", () => {
    const life = NATIVE_STAT_ROWS.find(({ id }) => id === "life")!;
    const row = nativeStatRow(life.template, [nativeNumericField(180), nativeNumericField(180)]);
    expect(row).toBe("生命  180/  180 ");
    // 生(16) 命(16) then two 8px spaces, three 9px digits, the slash, and so on:
    // the row ends well short of the panel edge because that is where the
    // template puts it, not because the value is flush right.
    const layout = layoutNativeText(row, life.x, life.y);
    expect(layout.x).toBe(623);
    expect(layout.right).toBeLessThan(637);
  });

  test("conceals a stage-37 field with five question marks", () => {
    const life = NATIVE_STAT_ROWS.find(({ id }) => id === "life")!;
    expect(nativeStatRow(life.template, [NATIVE_CONCEALED_FIELD, NATIVE_CONCEALED_FIELD]))
      .toBe("生命?????/????? ");
  });

  test("right-aligns the occupation and left-aligns the unit name in eight-byte fields", () => {
    expect(nativeIdentityField("士兵", "right")).toBe("    士兵");
    expect(nativeIdentityField("魔劍戰士", "right")).toBe("魔劍戰士");
    expect(nativeIdentityField("妮雅", "left")).toBe("妮雅    ");
  });

  test("puts the occupation's last cell against the separator whatever its length", () => {
    const { occupation, separator } = NATIVE_TEXT_ORIGINS;
    for (const name of ["士兵", "騎士", "魔劍戰士", "獸骨騎士"]) {
      const layout = layoutNativeText(nativeIdentityField(name, "right"), occupation.x, occupation.y);
      expect(layout.x).toBe(separator.x - 4);
    }
  });

  test("packs the status counters into the native icon grid", () => {
    expect(NATIVE_STATUS_COUNTERS).toHaveLength(8);
    expect(NATIVE_STATUS_COUNTERS[0]).toEqual({ x: 478, y: 279 });
    expect(NATIVE_STATUS_COUNTERS[4]).toEqual({ x: 478, y: 309 });
  });
});

describe("0000:88E4 round panel", () => {
  test("shows only the last three converted characters", () => {
    expect(nativeRoundLine(NATIVE_ROUND_TEMPLATE, NATIVE_ROUND_DIGIT_INDICES, 1))
      .toBe("第   1  回合");
    expect(nativeRoundLine(NATIVE_ROUND_TEMPLATE, NATIVE_ROUND_DIGIT_INDICES, 99))
      .toBe("第  99  回合");
    expect(nativeRoundLine(NATIVE_ROUND_TEMPLATE, NATIVE_ROUND_DIGIT_INDICES, 100))
      .toBe("第 100  回合");
    // A four-digit round cannot widen the field, so only its last three show.
    expect(nativeRoundLine(NATIVE_ROUND_TEMPLATE, NATIVE_ROUND_DIGIT_INDICES, 1234))
      .toBe("第 234  回合");
  });

  test("keeps the whole line inside the 160-pixel round frame", () => {
    const line = nativeRoundLine(NATIVE_ROUND_TEMPLATE, NATIVE_ROUND_DIGIT_INDICES, 1);
    const layout = layoutNativeText(line, NATIVE_TEXT_ORIGINS.round.x, NATIVE_TEXT_ORIGINS.round.y);
    expect(NATIVE_TEXT_ORIGINS.round.x).toBeGreaterThanOrEqual(480);
    expect(layout.right).toBeLessThanOrEqual(640);
  });
});

describe("0000:4F41 stage label", () => {
  test("runs the original padding so the label keeps its recorded position", () => {
    expect(nativeStageLabelText("瓦爾克麗宮")).toBe("\t瓦爾克麗宮\t");
    const layout = layoutNativeText(
      nativeStageLabelText("瓦爾克麗宮"),
      NATIVE_TEXT_ORIGINS.stageLabel.x,
      NATIVE_TEXT_ORIGINS.stageLabel.y,
    );
    // Cursor 120, one tab, then five Big5 cells: 192..272 inside the 80..399
    // colour-1 plate, which is where the original record puts it.
    expect(layout.glyphs[0]).toMatchObject({ x: 192, y: 333 });
    expect(layout.glyphs.at(-1)).toMatchObject({ x: 256 });
  });

  test("falls back to the single leading tab most label records use", () => {
    expect(nativeStageLabelText("異世界之門")).toBe("\t異世界之門");
  });

  test("keeps every recorded label inside the colour-1 plate", () => {
    for (const [label, padded] of Object.entries(NATIVE_STAGE_LABEL_PADDING)) {
      const layout = layoutNativeText(
        padded,
        NATIVE_TEXT_ORIGINS.stageLabel.x,
        NATIVE_TEXT_ORIGINS.stageLabel.y,
      );
      expect(layout.glyphs.length, label).toBeGreaterThan(0);
      expect(layout.glyphs[0]!.x, label).toBeGreaterThanOrEqual(80);
      expect(layout.right, label).toBeLessThanOrEqual(400);
    }
  });
});

describe("outline", () => {
  test("keeps the native two-pass outline and one-pixel ink offset", () => {
    expect(NATIVE_TEXT.outline.passes).toEqual([{ dx: 0, dy: 0 }, { dx: 2, dy: 0 }]);
    expect(NATIVE_TEXT.outline.inkOffset).toEqual({ dx: 1, dy: 1 });
    expect(NATIVE_TEXT.outline.fullWidth).toMatchObject({ maskRows: 17, dilationRowOffsets: [0, 1, 2] });
    expect(NATIVE_TEXT.outline.halfWidth).toMatchObject({ maskRows: 16, dilationRowOffsets: [0, 2] });
  });
});
