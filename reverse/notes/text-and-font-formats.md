# ANGEL2 SAY, NUM, and CHA record formats

Date: 2026-07-14

## Result

`SAY.SWF`, `NUM.SWF`, and `CHA.SWF` form a record-aligned dialogue and font
system. All three indexed containers have 176 present records, and record `n`
in each file belongs to the same script/font set.

The relationship is exact across the complete data set:

- Every `SAY` record is a Big5 DOS text script using CRLF line endings and a
  final `1Ah` DOS EOF byte.
- The matching `NUM` record lists each distinct Big5 character used by that
  `SAY` script, in first-appearance order, followed by `0000h`.
- The matching `CHA` record stores one 30-byte monochrome glyph for every
  character in `NUM`, in the same order.

Across 176 sets there are 9,399 character/glyph entries. Every set passes all
three invariants; there are no order, count, length, duplicate-character, or
terminator mismatches.

## Resource indices

The `GO.EXE` startup pointer table selects a resource with `BX` and a record
within it with `CX` before calling `READ_SWF_RECORD`:

| Resource | `BX` index | Pointer slot | Cache entry | Filename |
| --- | ---: | --- | --- | --- |
| `SAY.SWF` | 7 | `146A:0252` | `146A:02B9` | `146A:02BB` |
| `NUM.SWF` | 9 | `146A:0256` | `146A:02D5` | `146A:02D7` |
| `CHA.SWF` | 10 | `146A:0258` | `146A:02E2` | `146A:02E4` |

These loader locations and the main program's corresponding active table at
module offset `9A40h` are labeled in the persistent Ghidra project by
`ApplyAngel2Labels.java`. The main entry sets `DS:[527F]=0120h`, after which its
own reader at `0000:3A12` uses that active table.

## SAY record

The record is not a compiled bytecode stream. It is plain Big5 text:

```text
encoding     Big5
line ending  CR LF
last byte    1Ah (DOS EOF)
```

Lines are one of four kinds:

1. A command beginning with `^`.
2. Dialogue or narrative text.
3. A standalone `$` marker.
4. A blank line.

Commands contain a one- or two-character opcode and may have whitespace-
separated arguments. A `;;` suffix is a human-readable comment. For example:

```text
^ME 46  ;; 妮  雅
^HU 46
^WU
「發生了什麼事？裡面為何吵吵鬧鬧的．．．」
^KY
```

The syntax is fully parsed. Whole-corpus analysis and the module-25/module-29
native dispatchers now provide an exact mapping for all 17 command codes seen
in the data: 15 are shared by both interpreters, `DL` is module-29-only, and
`CW` is consumed as a shipped no-op because neither dispatcher recognizes it.
The compiled semanticVersion-2 actions retain the original command and native
interpreter support set. See `say-command-semantics.md`.

### Complete command inventory

| Command | Count | Argument count | Observed argument examples |
| --- | ---: | ---: | --- |
| `^\\` | 415 | 0 | — |
| `^BK` | 93 | 0 | — |
| `^CD` | 249 | 0 | — |
| `^CU` | 209 | 0 | — |
| `^CW` | 1 | 0 | — |
| `^DL` | 11 | 1 | `9`, `8`, `7`, `6` |
| `^ED` | 93 | 0 | — |
| `^HD` | 229 | 1 | `47`, `45`, `48`, `00` |
| `^HU` | 222 | 1 | `46`, `45`, `42`, `00` |
| `^KY` | 840 | 0 | — |
| `^ME` | 451 | 1 | `46 ;; 妮 雅`, `47 ;; 士兵` |
| `^PD` | 195 | 0 | — |
| `^PP` | 23 | 1 | `01`, `03`, `05`, `31` |
| `^PU` | 193 | 0 | — |
| `^W-` | 69 | 0 | — |
| `^WD` | 402 | 0 | — |
| `^WU` | 362 | 0 | — |

The 176 records contain 5,591 parsed line events: 4,057 commands, 1,446 text
lines, 44 blank lines, and 44 standalone `$` markers. Ninety-three records
contain `^ED`.

## NUM record

`NUM` is a per-script font subset table, not a numeric-image resource. Its
layout is:

```text
Big5Pair characters[N]   // two raw bytes per entry
uint16   terminator      // 0000h
```

Each character occurs once. Scanning the matching `SAY` record from start to
finish and retaining the first occurrence of every valid Big5 pair reproduces
the `NUM` byte sequence exactly. Sets contain from 3 to 269 characters.

Example, record `0000` begins:

| Index | Big5 | Unicode |
| ---: | --- | --- |
| 0 | `A662` | 在 |
| 1 | `A5CB` | 瓦 |
| 2 | `BAB8` | 爾 |
| 3 | `A74A` | 克 |
| 4 | `C452` | 麗 |
| 5 | `ABB0` | 城 |

## CHA record

`CHA` is the glyph data for the matching `NUM` table. It has no header or
terminator:

```text
Glyph glyphs[N]

Glyph:
  uint16be rows[15]
```

Each glyph is 16 pixels wide and 15 pixels high, one bit per pixel. Every row is
a big-endian 16-bit word: bit 15 is the leftmost pixel and bit 0 is the
rightmost pixel. A set containing `N` NUM entries must therefore have exactly
`N * 15 * 2`, or `N * 30`, CHA bytes.

The big-endian row order is notable because most other numeric values used by
the DOS program are little-endian. Rendering with this rule produces legible
original glyphs in the expected NUM order; record `0000` begins with
“在瓦爾克麗城內的寬廣走廊上…”.

## Tools

Verify all 176 aligned records and their byte-level invariants:

```sh
reverse/tools/angel2-font.mjs --verify \
  reverse/extracted/NUM reverse/extracted/SAY reverse/extracted/CHA
```

Render one font subset as a nearest-neighbor PNG contact sheet and write its
Big5/Unicode mapping beside it as JSON:

```sh
reverse/tools/angel2-font.mjs --render \
  reverse/extracted/NUM/0000.bin \
  reverse/extracted/CHA/0000.bin \
  reverse/renders/font/0000.png
```

Render every font set:

```sh
reverse/tools/angel2-font.mjs --render-all \
  reverse/extracted/NUM reverse/extracted/CHA reverse/renders/font
```

Inspect all SAY opcodes or convert scripts to structured UTF-8 JSON:

```sh
reverse/tools/angel2-say.mjs --inspect reverse/extracted/SAY
reverse/tools/angel2-say.mjs --parse-all \
  reverse/extracted/SAY reverse/parsed/SAY
```

Parsed events retain line numbers, command names, arguments, comments, text,
blank lines, and `$` markers.

Compile those lossless events into runtime-oriented dialogue actions and verify
the complete semantic table:

```sh
reverse/tools/angel2-dialogue.mjs --self-test reverse/extracted/SAY
reverse/tools/angel2-dialogue.mjs --compile-all \
  reverse/extracted/SAY reverse/parsed/dialogue
```

The output retains each original command and line number while adding actions
such as `draw_background`, `show_portrait`, `open_window`, `text`, and
`wait_for_input`. `BK` is now `backup_framebuffer`, `W-` loads `A/18`, `CW` is
`native_noop`, `DL` waits native ticks, and `ME` only stores the portrait id.
The phase remains extraction/GDD only; these actions are an implementation-ready
specification, not authorization to start Phaser work.

## Next target

The portrait/background mapping, both dispatchers, window geometry, text pacing,
RIX boundary, `BK/W-/CW/DL` behavior, and 97 palette-correct resource renders
are now closed in `story-presentations.json`. The four command scripts outside
the complete module-25 stage table and all 86 explicit module-29 `DS:80B5` selector references prove that 69/116/117/118 have no released-runtime producer and are archive-only;
the error, ordinary victory/defeat, HUD, and battle-range presentations are now
closed; the next phase-one work moves to special-stage presentation timelines.
