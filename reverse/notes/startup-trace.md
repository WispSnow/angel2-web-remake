# Startup trace 01

Date: 2026-07-13

## Setup

- Program: `reverse/work/ANGEL2/GO.EXE`
- Emulator: DOSBox-X 2026.07.02
- Machine: S3 VGA, 16 MiB RAM, XMS and EMS enabled
- CPU: normal core, fixed 12000 cycles
- Duration: 12 seconds
- Trace: DOS file I/O and INT 21h activity

## Observed file-open order

1. `GO.EXE`
2. `A.SWF`
3. `C.SWF`
4. `D.SWF`
5. `E.SWF`
6. `MAGIC.SWF`
7. `M_00.SWF`
8. `Y_00.SWF`
9. `SAY.SWF`
10. `MUSIC.SWF`
11. `NUM.SWF`
12. `CHA.SWF`
13. `BK.SWF`
14. `B.SWF`
15. `UN.SWF`
16. `SET.TXT`

Each large SWF was first opened and seeked to its end, then reopened and read in
16 KiB chunks. No disk file other than `GO.EXE` was executed during this trace.

## Loader-to-main-program handoff

Immediately after `UN.SWF` was loaded, the program:

1. queried and replaced interrupt vector `62h`;
2. allocated a small block at segment `0f60h`;
3. allocated a large block beginning at segment `0fa8h`;
4. created and selected a new PSP;
5. resized the block at `0fa8h` and allocated the main program's working buffers;
6. opened `SET.TXT`;
7. switched to a 640×350 display surface.

This was subsequently confirmed with debugger breakpoints: `GO.EXE` creates and
selects a PSP at `0fa8h`, then transfers control to a main image whose entry is
`0fb8:0000`. See `runtime-handoff.md` for the register trace and recovered image.

## Negative evidence

During this startup window the program did not open `T.EXE`, `T.SSS`, `DATA.SWF`,
`MAP.SWF`, any `WAR*.TST` file, or `AG2.JS3`. Later native analysis confirmed
`AG2.JS3` is the standalone Joymouse input configuration rather than game
progress; the remaining files may be used later, embedded in
the bulk-loaded containers, or only referenced by installation/configuration code.

The working-copy hashes still matched every file in `ref/ANGEL2` after the run;
the trace caused no persistent writes.

## Follow-up

The proposed breakpoint and dump work is complete. The next target is the file
loader reached from the recovered main image's embedded startup-resource table.
