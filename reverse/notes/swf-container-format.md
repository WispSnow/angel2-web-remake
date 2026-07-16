# ANGEL2 indexed SWF container format

Date: 2026-07-14

## Result

Fourteen files loaded during startup use the same indexed container format.
The `.SWF` suffix is proprietary to ANGEL2 and does not identify an Adobe Flash
file. Each file consists of a fixed-capacity descriptor table followed by
contiguous payload records.

`DATA.SWF` and `MAP.SWF` do not use this format and need separate analysis.

## Binary layout

There is no standalone file header. The file begins directly with an array of
6-byte, little-endian descriptors:

| Offset | Size | Type | Meaning |
| ---: | ---: | --- | --- |
| `+0` | 4 | `uint32` | Absolute byte offset of the payload in the file. |
| `+4` | 2 | `uint16` | Payload length in bytes. |

The first descriptor's payload offset is also the end of the descriptor table.
Therefore:

```text
tableSize     = descriptor[0].offset
tableCapacity = tableSize / 6
payload(i)    = file[offset(i) .. offset(i) + length(i))
```

Two special descriptor values occur after the present records:

| Offset | Length | Meaning |
| --- | --- | --- |
| exact file size | `FFFFh` | One terminator descriptor. |
| `FFFFFFFFh` | `FFFFh` | Unused slot in the fixed-capacity table. |

For all fourteen indexed files, present descriptors occupy indices
`0 .. present-1`, the terminator is at index `present`, and every later slot is
unused. The payloads begin exactly at `tableSize`, are contiguous and ordered,
and end exactly at EOF. No gaps, overlap, out-of-bounds records, or trailing
bytes were found.

The meaning of each individual payload is a second, nested format and is not yet
claimed here. Different container families likely hold graphics, speech/text,
music, numeric glyphs, character data, and other game-specific records.

## Files verified

| File | Bytes | Capacity | Present | Table bytes | Terminator index |
| --- | ---: | ---: | ---: | ---: | ---: |
| `A.SWF` | 202,026 | 80 | 60 | 480 | 60 |
| `B.SWF` | 1,054,372 | 100 | 94 | 600 | 94 |
| `BK.SWF` | 1,002,922 | 60 | 59 | 360 | 59 |
| `C.SWF` | 415,795 | 60 | 34 | 360 | 34 |
| `CHA.SWF` | 283,170 | 200 | 176 | 1,200 | 176 |
| `D.SWF` | 369,047 | 100 | 68 | 600 | 68 |
| `E.SWF` | 216,009 | 100 | 65 | 600 | 65 |
| `M_00.SWF` | 759,700 | 90 | 85 | 540 | 85 |
| `MAGIC.SWF` | 446,937 | 90 | 86 | 540 | 86 |
| `MUSIC.SWF` | 208,261 | 60 | 50 | 360 | 50 |
| `NUM.SWF` | 20,350 | 200 | 176 | 1,200 | 176 |
| `SAY.SWF` | 69,867 | 200 | 176 | 1,200 | 176 |
| `UN.SWF` | 1,030,787 | 80 | 63 | 480 | 63 |
| `Y_00.SWF` | 928,072 | 100 | 90 | 600 | 90 |

## Static evidence in GO.EXE

Ghidra addresses below use the executable's imported segment layout. Confirmed
functions have been named in `Angel2Reverse.gpr` by
`ApplyAngel2Labels.java`.

The startup cache path is:

```text
CACHE_STARTUP_SWFS              1000:07B7
  CACHE_ONE_SWF_TO_EMS          1000:0806
    GET_FILE_SIZE_AND_EMS_PAGE_COUNT 1000:0878
    OPEN_CURRENT_SWF            1000:08DA
    MAP_EMS_PAGE                1000:08F8
    READ_16K_FILE_CHUNK         1000:0917
    COPY_16K_TO_EMS_WINDOW      1000:092D
```

`CACHE_ONE_SWF_TO_EMS` allocates EMS pages with `INT 67h, AH=43h`, maps them
with `AH=44h`, and reads the source file in `4000h`-byte chunks using
`INT 21h, AH=3Fh`.

The indexed-record path is:

```text
READ_SWF_RECORD                 1000:094A
  READ_SWF_RECORD_FROM_EMS      1000:09B7
  READ_SWF_RECORD_FROM_DISK     1000:0A60
    READ_SWF_INDEX_ENTRY        1000:0A9B
    READ_SWF_RECORD_PAYLOAD     1000:0AF2
```

The disk fallback proves the descriptor semantics directly:

1. Seek to `recordIndex * 6`.
2. Read exactly six bytes.
3. Interpret the first four bytes as a 32-bit absolute seek offset.
4. Interpret the last two bytes as the byte count for `INT 21h, AH=3Fh`.

The loader resource pointer table is at `146A:0244`. Each pointed-to startup
entry contains an EMS handle word followed by a NUL-terminated DOS filename.
The first entry begins at `146A:0262`; its filename `A.SWF` begins at
`146A:0264`.

The recovered main program inherits those records and actively reuses them. At
module entry `0000:0024`, it sets `DS:[527F]=0120h`. At runtime, `DS:0120`
corresponds to main-module offset `9A40h`, which is a second pointer table over
the inherited EMS-handle/file-name entries beginning at `9A5Eh`. The captured
image still shows the pre-initialization value `5287h` because the dump
breakpoint preceded the store at offset `0024h`.

The main program's indexed-record path is independently implemented at:

```text
READ_INDEXED_RESOURCE              0000:3A12
  READ_INDEXED_RESOURCE_FROM_EMS   0000:3A7F
    READ_EMS_INDEX_DESCRIPTOR      0000:3A52
    COPY_EMS_PAYLOAD               0000:3AC8
  READ_INDEXED_RESOURCE_FROM_DISK  0000:3B28
    READ_DISK_INDEX_DESCRIPTOR     0000:3B63
    READ_DISK_RECORD_PAYLOAD       0000:3BBA
```

Its calling convention is the same useful abstraction: `BX` selects the
resource, `CX` selects its six-byte index record, and `ES:DI` receives the
payload. A debugger stop at runtime `0FB8:3A12` confirmed that the initialized
pointer-table offset is `0120h`.

## Dynamic evidence

DOSBox-X stopped at the runtime form of `OPEN_CURRENT_SWF` while the startup
cache opened its first resource:

```text
CS:IP = 0822:08E7
AX    = 3D00h                 DOS open, read-only
DS:DX = 0C8C:0264            points to A.SWF
```

The main program's separate `SET.TXT` path was also confirmed dynamically at
`0FB8:29D1` with `AX=3D00h` and `DS:DX=194A:04ACh`. In the module-offset Ghidra
view, this call belongs to `READ_WHOLE_FILE` at `0000:29C4`, called by
`LOAD_SET_TXT_CONFIG` at `0000:0D56`; the filename is labeled
`SET_TXT_FILENAME` at `0000:9DCCh`.

## Inspection and extraction tool

Inspect every `.SWF` in the reference directory:

```sh
reverse/tools/swf-index.mjs ref/ANGEL2
```

Emit complete descriptors as JSON:

```sh
reverse/tools/swf-index.mjs --json ref/ANGEL2
```

Extract all present records from one indexed file:

```sh
reverse/tools/swf-index.mjs --extract \
  ref/ANGEL2/A.SWF reverse/extracted/A
```

Extraction preserves record indices in names such as `0000.bin` and writes a
`manifest.json`. As an integrity check, concatenating the 60 extracted `A.SWF`
payloads reproduces the complete original data region byte-for-byte.

## Next target

`NUM.SWF`, `SAY.SWF`, and `CHA.SWF` are decoded in
`text-and-font-formats.md`; the recovered SAY runtime operations are in
`say-command-semantics.md`. The next nested-format work is to identify the
portrait/background records selected by those operations. Analyze `DATA.SWF`
and `MAP.SWF` as separate top-level formats rather than forcing them through
this indexed-container parser.
