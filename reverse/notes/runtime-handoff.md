# Runtime handoff and recovered main image

Date: 2026-07-13

## Result

DOSBox-X debugger breakpoints confirm that `GO.EXE` builds the real game program
in memory. It does not execute a disk `T.EXE`. The recovered main program is now
stored as a raw 16-bit real-mode image and imported into the persistent Ghidra
project.

## Loader handoff

All values below are hexadecimal.

| Event | Break location | Relevant registers | Meaning |
| --- | --- | --- | --- |
| `INT 21h`, `AH=25h`, `AL=62h` | `0822:02ca` | `DS:DX=c8c:0042` | Installs the loader's temporary interrupt 62h handler. |
| `INT 21h`, `AH=26h` | `0822:03f8` | `DX=0fa8`, `ES=0fa8` | Creates a new PSP at segment 0fa8h. |
| `INT 21h`, `AH=50h` | `0822:0436` | `BX=0fa8` | Selects that PSP as the current process. |
| first main-image `INT 21h`, `AH=4ah` | `0fb8:0017` | `ES=0fa8`, `BX=0f12`, `DS=SS=194a` | The recovered program shrinks its process block to 0f12h paragraphs. |

The actual program entry is `0fb8:0000`, exactly 10h paragraphs after the PSP.
The retained process block spans `0fa8:0000` through segment `1eb9`; `1eba` is
the first segment after it. The executable image without the 100h-byte PSP is
therefore `0f020h` bytes long.

The first instructions at the recovered entry establish `DS=194ah`, query the
current PSP, and resize the process block. This independently matches the DOS
memory trace.

## Dumps

Generated dumps are deliberately ignored by Git:

| File | Contents | Size | SHA-256 |
| --- | --- | ---: | --- |
| `reverse/dumps/angel2-main-psp-0fa8.bin` | PSP plus loaded main image | 61,728 bytes (`0f120h`) | `93152f081e974a8ac9fe1efd6314d6d5de29ea9d9fc48a94c7f56895bc6e2595` |
| `reverse/dumps/angel2-main-image-0fb8.bin` | Main image only | 61,472 bytes (`0f020h`) | `d7ee1cfd8d31f98481115d23fa77d465fe719979aa9bedcd30f5b0589b9da3b2` |

The debugger commands used at the first main-image `AH=4ah` breakpoint were:

```text
MEMDUMPBIN 0FA8:0000 F120
MEMDUMPBIN 0FB8:0000 F020
```

`MEMDUMPBIN` always writes `memdump.bin` in the host working directory, so each
file must be renamed before issuing the next command.

## Inherited resource state

The raw module contains the resource records inherited from `GO.EXE`, and the
main program does actively reuse them. Its entry instruction at `0000:0024`
writes `0120h` to `DS:[527F]`. With the runtime relation
`DS - CS = 0992h` paragraphs, `DS:0120` is main-module offset `9A40h`, the
fourteen-entry resource pointer table. The first entry is at module offset
`9A5Eh`; resource 7 points to the `SAY.SWF` entry at `9AB5h`.

The dump was captured at the earlier `AH=4Ah` breakpoint, before entry offset
`0024h` executed. It therefore still contains the initial value `5287h` at the
physical image location corresponding to `DS:[527F]`. This explains why the
active table was initially missed. A later debugger breakpoint at the main
reader, runtime `0FB8:3A12`, confirmed `DS:[527F]=0120h` after initialization.

The main program has its own indexed-resource reader at module offset `3A12h`,
including both EMS and disk paths. `GO.EXE` owns startup caching; the recovered
main owns subsequent record reads through the inherited handles.

The main image does actively reference `SET.TXT` at image offset `9dcch` and
contains later-game filenames such as `WAR0.TST` at `a45eh`. This still makes the
recovered module the primary target for gameplay logic, while `GO.EXE` remains
the primary target for the startup resource container and EMS cache.

## Ghidra import

The import helper creates two complementary raw `x86:LE:16:Real Mode` programs:

- `angel2-main-image-0fb8.bin` at `0fb8:0000`, labeled
  `ANGEL2_RUNTIME_ENTRY`. This view preserves relocated segment values, far calls,
  and data addresses.
- `angel2-main-module-offset.bin` at `0000:0000`, labeled
  `ANGEL2_MODULE_ENTRY`. This view preserves all module-relative near-call and
  near-jump targets across the physical 64 KiB boundary.

The second file is a byte-identical generated copy. Two views are necessary
because Ghidra's raw real-mode loader cannot simultaneously model the recovered
image's nonzero runtime CS and every 16-bit IP-relative flow. Reproduce both
imports with:

```sh
reverse/ghidra_scripts/import-main-dump.sh
```

As an analysis baseline, the runtime view discovers 1,505 instructions and 44
functions; the module-offset view discovers 5,179 instructions and 200 functions.
The imports live in `reverse/ghidra/Angel2Reverse.gpr` alongside `GO.EXE`,
`SETUP.EXE`, and the unpacked `JS3.EXE`.

## Next analysis target

The indexed `.SWF` container, the loader cache, and the main program's own EMS
and disk record readers are documented in `swf-container-format.md`. Continue
from `ANGEL2_MODULE_ENTRY` for near-call gameplay flow and use
`ANGEL2_RUNTIME_ENTRY` when following relocated segment/data references. The
dialogue formats and recovered command semantics are documented in
`text-and-font-formats.md` and `say-command-semantics.md`.
