# ANGEL2 reverse-engineering workspace

This directory isolates generated analysis artifacts from the immutable reference
files in `../ref/ANGEL2`.

## Layout

- `work/ANGEL2/`: writable DOSBox-X working copy of the game.
- `unpacked/`: unpacked executables and other generated binaries.
- `ghidra/`: persistent Ghidra project database.
- `dosbox/`: reproducible DOSBox-X configuration and launch scripts.
- `logs/`: DOSBox-X file and interrupt traces.
- `captures/`: screenshots, audio, video, and memory captures.
- `dumps/`: debugger memory dumps of the runtime-loaded main program.
- `ghidra_scripts/`: tracked helpers for importing and labeling recovered code.
- `tools/`: format inspection and asset-extraction helpers.
- `extracted/`: generated per-record asset payloads.
- `parsed/`: generated UTF-8/JSON forms of decoded resources.
- `renders/`: generated visual previews used to validate decoded formats.
- `manifests/`: SHA-256 manifests for reference and generated inputs.

The generated directories are ignored by Git. The configuration, launch scripts,
documentation, and hash manifests remain trackable.

## Commands

Open the persistent Ghidra project:

```sh
ghidraRun
```

Then open `reverse/ghidra/Angel2Reverse.gpr`.

Capture a short, non-interactive startup trace:

```sh
reverse/dosbox/trace-startup.sh
```

Start the emulator and break at the `GO.EXE` entry point in the debugger:

```sh
reverse/dosbox/run-debugger.sh
```

The confirmed loader-to-main-program handoff and memory-dump recipe are in
`notes/runtime-handoff.md`.

Import the recovered main image into the persistent project as complementary
runtime-address and module-offset views:

```sh
reverse/ghidra_scripts/import-main-dump.sh
```

Reapply the confirmed semantic labels to `GO.EXE` and the recovered main module:

```sh
reverse/ghidra_scripts/apply-labels.sh
```

Inspect the proprietary indexed `.SWF` containers or extract one of them:

```sh
reverse/tools/swf-index.mjs ref/ANGEL2
reverse/tools/swf-index.mjs --extract ref/ANGEL2/A.SWF reverse/extracted/A
```

The recovered layout, loader evidence, file inventory, and current unknowns are
documented in `notes/swf-container-format.md`.

Verify or render the aligned `NUM`/`CHA` Big5 font sets, and parse `SAY` scripts
to UTF-8 JSON:

```sh
reverse/tools/angel2-font.mjs --verify \
  reverse/extracted/NUM reverse/extracted/SAY reverse/extracted/CHA
reverse/tools/angel2-font.mjs --render \
  reverse/extracted/NUM/0000.bin reverse/extracted/CHA/0000.bin \
  reverse/renders/font/0000.png
reverse/tools/angel2-font.mjs --render-all \
  reverse/extracted/NUM reverse/extracted/CHA reverse/renders/font \
  --scale=2 --columns=16
reverse/tools/angel2-font.mjs --render-raw-root \
  reverse/extracted reverse/renders/raw-font \
  --scale=2 --columns=16
reverse/tools/angel2-say.mjs --parse-all \
  reverse/extracted/SAY reverse/parsed/SAY
reverse/tools/angel2-dialogue.mjs --self-test reverse/extracted/SAY
reverse/tools/angel2-dialogue.mjs --compile-all \
  reverse/extracted/SAY reverse/parsed/dialogue
```

The record layouts, complete command inventory, and cross-file invariants are
documented in `notes/text-and-font-formats.md`. The evidence-ranked command
semantics, live record-0000 trace, native main reader, and Web-ready interpreter
are documented in `notes/say-command-semantics.md`.

Decode stored/LH7 image streams, render planar previews with a recovered native
palette, convert all VOC/RIX audio, and export the aligned `DATA/MAP` tables:

```sh
reverse/tools/angel2-lha-frame.mjs --extract-resource \
  reverse/extracted/A reverse/decoded/A
reverse/tools/angel2-planar.mjs --render-resource \
  reverse/decoded/A reverse/renders/planar/A gameplay
reverse/tools/angel2-planar.mjs --render-resource \
  reverse/decoded/C reverse/renders/planar/C_password password
reverse/tools/angel2-plane-order.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0021-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/plane-order.json
reverse/tools/angel2-audio.mjs --convert-root \
  reverse/extracted reverse/converted/audio
reverse/tools/angel2-tables.mjs --export \
  ref/ANGEL2 reverse/parsed/tables
reverse/tools/angel2-map-rules.mjs --extract \
  ref/ANGEL2/MAP.SWF \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  reverse/parsed/native/map-rules.json
reverse/tools/angel2-unit-guide.mjs --compare \
  ref/修改.txt reverse/parsed/tables/DATA.json \
  reverse/parsed/external/unit-guide-comparison.json
reverse/tools/angel2-save.mjs --inspect \
  ref/ANGEL2 reverse/parsed/saves/TST.json
reverse/tools/angel2-save.mjs --decode \
  ref/ANGEL2 reverse/extracted/saves/decoded \
  reverse/parsed/saves/TST-decoded.json \
  reverse/parsed/native/unit-descriptors.json \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin
reverse/tools/angel2-js3-config.mjs --inspect \
  ref/ANGEL2/AG2.JS3 \
  reverse/unpacked/JS3.UNPACKED.EXE \
  reverse/parsed/native/input-ui.json \
  reverse/parsed/native/AG2-JS3.json
reverse/tools/angel2-set-config.mjs --extract \
  ref/ANGEL2/SET.TXT reverse/unpacked/lzexe-modules \
  reverse/parsed/native/set-config.json
reverse/tools/angel2-battle-templates.mjs --extract \
  reverse/decoded/B \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/unit-descriptors.json
reverse/tools/angel2-b-record-audit.mjs --extract \
  reverse/unpacked/lzexe-modules/raw reverse/extracted/B reverse/decoded/B \
  reverse/parsed/native/b-record-audit.json
reverse/tools/angel2-battle-lifecycle.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/battle-lifecycle.json
reverse/tools/angel2-stage-events.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0033-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0035-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0046-unpacked.bin \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/battle-objectives.json \
  reverse/parsed/native/unit-descriptors.json \
  reverse/parsed/native/title-flow.json \
  reverse/parsed/dialogue \
  reverse/parsed/native/stage-events.json
reverse/tools/angel2-story-presentations.mjs --render \
  reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin \
  reverse/decoded reverse/parsed/dialogue \
  reverse/renders/story-presentations
reverse/tools/angel2-story-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0025-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/stage-events.json \
  reverse/converted/audio/manifest.json \
  reverse/parsed/dialogue reverse/renders/story-presentations \
  reverse/parsed/native/story-presentations.json
reverse/tools/angel2-feedback-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/extracted/UN/0039.bin reverse/extracted/UN/0040.bin \
  reverse/converted/audio/manifest.json \
  reverse/parsed/native/input-ui.json \
  reverse/renders/story-presentations/manifest.json \
  reverse/parsed/native/feedback-presentations.json
reverse/tools/angel2-ending-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0033-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0035-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0046-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  reverse/extracted \
  reverse/parsed/native/ending-presentations.json
reverse/tools/angel2-battle-objectives.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/battle-objectives.json \
  reverse/parsed/native/battle-templates.json
reverse/tools/angel2-combat-formulas.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  reverse/parsed/native/combat-formulas.json
reverse/tools/angel2-combat-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  reverse/converted/audio/manifest.json \
  reverse/extracted reverse/decoded reverse/renders/planar \
  reverse/parsed/native/combat-presentations.json
reverse/tools/angel2-shooting-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/converted/audio/manifest.json \
  reverse/extracted reverse/decoded reverse/renders/planar \
  reverse/parsed/native/shooting-presentations.json
reverse/tools/angel2-wd-stage26.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/extracted reverse/decoded reverse/renders/planar \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/wd-stage26.json
reverse/tools/angel2-technique-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/converted/audio/manifest.json \
  reverse/extracted reverse/decoded reverse/renders/planar \
  reverse/parsed/native/technique-presentations.json
reverse/tools/angel2-stage-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/stage-events.json \
  reverse/parsed/native/feedback-presentations.json \
  reverse/parsed/native/story-presentations.json \
  reverse/parsed/native/title-flow.json \
  reverse/parsed/native/technique-presentations.json \
  reverse/converted/audio/manifest.json \
  reverse/extracted/E/0014.bin \
  reverse/parsed/native/stage-presentations.json
reverse/tools/angel2-remaining-technique-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/converted/audio/manifest.json \
  reverse/extracted reverse/decoded reverse/renders/planar \
  reverse/parsed/native/remaining-technique-presentations.json
reverse/tools/angel2-turn-actions.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/turn-actions.json
reverse/tools/angel2-input-ui.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0027-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/input-ui.json
reverse/tools/angel2-hud-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/renders/planar \
  reverse/parsed/native/hud-presentations.json \
  reverse/renders/hud-presentations/unit-detail-layout.svg
reverse/tools/angel2-range-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/decoded/B \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/range-presentations.json \
  reverse/renders/range-presentations/terrain-bright-vs-dither.png
reverse/tools/angel2-technique-rules.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  reverse/parsed/native/battle-templates.json \
  reverse/decoded/B \
  reverse/parsed/native/technique-rules.json
reverse/tools/angel2-ai-rules.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  reverse/parsed/external/unit-guide-comparison.json \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/ai-rules.json
reverse/tools/angel2-behavior12-effects.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/decoded/B \
  reverse/parsed/native/battle-templates.json \
  reverse/parsed/native/terrain-token-map.json \
  reverse/parsed/native/map-rules.json \
  reverse/parsed/native/technique-presentations.json \
  reverse/parsed/native/behavior12-effects.json
reverse/tools/angel2-native-timing.mjs --extract-all \
  reverse/unpacked/lzexe-modules/raw \
  reverse/parsed/native/native-timing.json
reverse/tools/angel2-phase1-audit.mjs --extract \
  reverse/gdd/evidence-register.md \
  reverse/parsed/native/technique-rules.json \
  reverse/parsed/native/ai-rules.json \
  reverse/parsed/native/behavior12-effects.json \
  reverse/parsed/native/b-record-audit.json \
  reverse/parsed/native/story-presentations.json \
  reverse/parsed/native/feedback-presentations.json \
  reverse/parsed/native/native-timing.json \
  reverse/parsed/native/phase1-residual-audit.json
reverse/tools/angel2-borland-debug.mjs --extract \
  ref/ANGEL2/GO.EXE reverse/parsed/debug/GO-symbols.json
reverse/tools/angel2-title-flow.mjs --extract \
  ref/ANGEL2/GO.EXE \
  reverse/unpacked/lzexe-modules/raw/0023-unpacked.bin \
  reverse/extracted/A/0023.bin \
  reverse/extracted/A/0024.bin \
  reverse/parsed/native/title-flow.json
reverse/tools/angel2-title-presentations.mjs --render \
  reverse/unpacked/lzexe-modules/raw/0023-unpacked.bin \
  reverse/decoded reverse/renders/title-presentations
reverse/tools/angel2-title-presentations.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0023-unpacked.bin \
  reverse/converted/audio/manifest.json reverse/decoded \
  reverse/renders/title-presentations \
  reverse/parsed/native/title-presentations.json
reverse/tools/angel2-password-flow.mjs --extract \
  ref/ANGEL2/GO.EXE ref/ANGEL2/PLAY.COM \
  reverse/unpacked/lzexe-modules/raw/0021-unpacked.bin \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/extracted reverse/parsed/native/password-flow.json
reverse/tools/angel2-runtime-modules.mjs --extract \
  reverse/extracted/UN reverse/decoded/UN reverse/unpacked/runtime-modules
reverse/ghidra_scripts/import-runtime-modules.sh
reverse/tools/angel2-lzexe-modules.mjs --unpack \
  reverse/unpacked/runtime-modules reverse/unpacked/lzexe-modules
reverse/ghidra_scripts/import-unpacked-runtime-modules.sh
reverse/tools/angel2-unit-descriptors.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  reverse/parsed/external/unit-guide-comparison.json
reverse/tools/angel2-promotion-table.mjs --extract \
  reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin \
  reverse/parsed/native/unit-descriptors.json \
  ref/ANGEL2/DATA.SWF \
  reverse/parsed/native/promotion-table.json \
  reverse/parsed/external/unit-guide-comparison.json
reverse/tools/angel2-unit-catalog.mjs --build \
  reverse/parsed/tables/DATA.json \
  reverse/parsed/native/unit-descriptors.json \
  reverse/parsed/native/promotion-table.json \
  reverse/parsed/native/map-rules.json \
  reverse/parsed/native/combat-formulas.json \
  reverse/parsed/native/technique-rules.json \
  reverse/parsed/native/ai-rules.json \
  reverse/parsed/external/unit-guide-comparison.json \
  reverse/parsed/native/unit-catalog.json \
  reverse/parsed/native/unit-catalog.csv
reverse/tools/angel2-inventory.mjs \
  ref/ANGEL2 reverse reverse/manifests/resource-coverage.json
node reverse/tools/angel2-phase1-verify.mjs
```

The shared round/outcome dispatcher and all 38 handler bodies, their 72 SAY
records, eight dynamic-board stages, seven other runtime-state stages,
module 25/27/29/33/35/46 campaign routing, and the final-boss/postgame-rematch
chain are documented in `notes/stage-events-and-campaign-routing.md`.
The two module-25/module-29 story interpreters, corrected command semantics,
window/portrait/text/wait/audio timelines, portrait metadata, palette-correct
story resources, and corpus reachability accounting are documented in
`notes/say-command-semantics.md`; their machine-readable specification is
`parsed/native/story-presentations.json`.
The three reachable deployment errors and the ordinary victory, retreat,
defeat, and quit presentations—including `UN/39+40`, `A/18`, `D/45,46`,
per-Big5-character `MAGIC/57..71` speech, `MAGIC/81`, confirmation input, and
the five-slot victory-save selector—are documented in
`notes/error-and-outcome-presentations.md`; their machine-readable specification
is `parsed/native/feedback-presentations.json`.
The 22-card roster roll, conditional epilogue, seven credit pages, and permanent
module-46 final screen are documented in `notes/postgame-ending-and-credits.md`;
their machine-readable specification is `parsed/native/ending-presentations.json`.
The GO/module-23 title, four-value difficulty, and five-slot continue state
machine plus its direct resource records are documented in
`notes/title-new-continue-flow.md`. The palette-correct pretitle logo, scrolling
intro, both title variants, idle replay, difficulty/continue presentation, and
`MUSIC/1,14` timing are documented in `notes/title-presentations.md`; the
machine-readable specification is `parsed/native/title-presentations.json`.
The first module-29 exit password gate, all 28 illustration coordinates and
answers, three-vector response encoding, visible failure lock, and the bundled
`PLAY.COM` fixed-challenge patch are documented in `notes/password-gate.md`.

See `notes/asset-extraction-status.md` for the coverage matrix,
`notes/image-audio-table-formats.md` for the recovered binary layouts, and
`notes/raw-glyph-assets.md`, `notes/go-debug-symbols.md`, and
`notes/runtime-module-format.md` for the additional font/UI evidence, original
loader symbols, and reconstructed executable modules. The validation of the
external modification guide, unit-record map, and promotion graph is in
`notes/unit-data-and-promotions.md`; native `DATA/MAP` consumers and the 35/39
record boundary are documented in `notes/native-unit-table-access.md`; the
campaign actor descriptors, class-visual fallback, new-game class/EXP arrays,
and exact stage-0 side-1 roster are documented in
`notes/campaign-roster-and-stage0.md`; the
decoded save-state layout is in `notes/save-slot-format.md`; the corrected
23-slot movement/terrain profile layout and remaining range-propagation unknowns
are in `notes/movement-terrain-rules.md`. See
`notes/js3-config-format.md` for the fully parsed Joymouse input configuration;
see `notes/set-txt-audio-config.md` for the nine native `SET.TXT` decoders,
Sound Blaster port/IRQ tables, VOC-versus-RIX boundary, and safe Web import policy;
see
`notes/battle-template-format.md` for the 44 mapped `B.SWF` stage entries,
`JUST.TST` regeneration chain, confirmed deployment cells/rosters, and special-unit formations;
see `notes/battle-lifecycle.md` for the complete ordinary deployment → battle
rounds → victory/save/next-stage or defeat/redeployment state machine; see
`notes/input-and-battle-ui.md` for the Set-1 keyboard chain, semantic input
boundary, deployment and battle cursor controls, shortcuts, action/group/system
menus and side-panel hitboxes; see `notes/unit-detail-hud-presentations.md` for
the exact hovered-unit HUD geometry, resources, stat/status rows and stage-37 concealment;
see `notes/battle-range-and-target-presentations.md` for the exact range-scratch
rendering, action selection gates, shooting-distance correction, and the separate
visible map-effect layer;
see
`notes/battle-objective-format.md` for all 84 objective table entries and the
normal/special-stage condition matrix; see
`notes/special-unit-behavior.md` for the stage-37 boss states, fixed movement,
death handling, and objective rules; see `notes/ordinary-combat-formulas.md`,
`notes/ordinary-combat-presentations.md`,
`notes/shooting-presentations.md`,
`notes/technique-presentations.md`,
`notes/status-lifecycle.md`, `notes/turn-action-system.md`,
`notes/shooting-and-technique-system.md`, and
`notes/ai-decision-system.md` for the ordinary combat formulas and map/full-screen
hit/death presentation, phase/action, shooting, five main technique-family timelines,
player technique rules, full-round status countdown, poison/zero-life quirks, AI class
routing, target selection, AI shooting, and native AI technique-pool rules. See
`gdd/README.md` for the no-implementation phase gate and GDD status.

The original `ref/ANGEL2` directory must never be used as a writable DOSBox-X
mount. Regenerate `work/ANGEL2` from the reference directory if the working copy
becomes contaminated.
