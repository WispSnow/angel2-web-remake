#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CODE_SIGNATURES = [
  {
    module: 27,
    address: "0000:0493",
    offset: 0x00493,
    role: "raise class-record-0 named actors to cumulative experience 299 when the parent campaign interface is present",
    hex: "b85a098ed8833e28004e7501c38b362c0083c60ea12a008ec0268b34b93a0033ff518b850c053d000075188b9d820a8a073cff740e268b043d2b017703b82b012689045983c70283c602e2d5c3",
  },
  {
    module: 27,
    address: "0000:056E",
    offset: 0x0056e,
    role: "prepare battle template and choose direct-write or deployment path",
    hex: "bece06e8a614e8b300e85301e89b018cd88ec0e80013833ef60f007503e99800e81001ff36b3006a006a016a019a3c06",
  },
  {
    module: 27,
    address: "0000:0718",
    offset: 0x00718,
    role: "load the current B.SWF stage template",
    hex: "8b16842681c200088b1eb60203db8bb7ca08468bc28ec0bf00008bcebb0c00e89c2a8b16842681c20008bf0000a18426",
  },
  {
    module: 27,
    address: "0000:0CDE",
    offset: 0x00cde,
    role: "handle deployment list paging or finish confirmation",
    hex: "8b16492a8b1e4b2abed80ee86211833eca25597419803e3f0e4e740ebed80ebf050fe85208c6063f0e4eba4e00c3bed8",
  },
  {
    module: 27,
    address: "0000:0D61",
    offset: 0x00d61,
    role: "place or remove a roster unit in the current FF deployment cell",
    hex: "8b16492a8b1e4b2abe400ee8df10833eca25597416803e3e0e4e740ebe400ebf820ae8eb06c6063e0e4ec3be400ebf820ae8a106c6063e0e59803e4e24017401",
  },
  {
    module: 27,
    address: "0000:0FF8",
    offset: 0x00ff8,
    role: "serialize, compress, obfuscate, and write JUST.TST",
    hex: "b85a098ed8baa20fb43cb90000cd218bd8a39e0fbf0000e86e00e88300e89800e8ad00e8c200e8db00e8f000e805012e",
  },
  {
    module: 27,
    address: "0000:1907",
    offset: 0x01907,
    role: "find whether the side map contains an FF deployment marker",
    hex: "a151008ec0b9c409ba4e00bb0000268a073cff740743e2f6ba4e00c3ba5900c3",
  },
  {
    module: 29,
    address: "0000:02E4",
    offset: 0x002e4,
    role: "configure the generic victory/save prompt",
    hex: "c7060b05c505c706c3072706e8e500c3",
  },
  {
    module: 29,
    address: "0000:0321",
    offset: 0x00321,
    role: "configure the defeat/retry prompt",
    hex: "c7060b052d06c706c3077f05e8a800c3",
  },
  {
    module: 29,
    address: "0000:057F",
    offset: 0x0057f,
    role: "wait after defeat and return to module 27 at the same stage",
    hex: "e83600c60690f5002ec606fb4859a180f8bbde01e8c3f2e81f43803e90f5017402ebeb2ec606fb484ee8c7bbc7060600",
  },
  {
    module: 29,
    address: "0000:0627",
    offset: 0x00627,
    role: "show the victory prompt and optionally write a numbered WAR save",
    hex: "a180f8e8cdf1e440250100b92d0003c8e8e4b4e882bd2ec7069509b4002ec70697091e00e88f02a182f8a3d107350008",
  },
  {
    module: 29,
    address: "0000:48FE",
    offset: 0x048fe,
    role: "standard battle load, phase loop, terminal dispatch, and exits",
    hex: "e80dd39aac009d13a180f88ec0bf0000b91a00bb0000e87bb4a180f8be51039a0a003719e8a906ba7c00bb0000e8e8a5be7830e81c87813682f80008be7830e8",
  },
  {
    module: 29,
    address: "0000:4ABE",
    offset: 0x04abe,
    role: "advance fresh-battle side-2 experience once per difficulty step except on stages 3, 8, and 11",
    hex: "833e772e03741b833e772e087414833e772e0b740d8b0e00004151e8af0859e2f9c3",
  },
  {
    module: 29,
    address: "0000:4DCD",
    offset: 0x04dcd,
    role: "begin a full round, increment the round, tick statuses, and run stage events",
    hex: "9a9b005d139aac009d13c6067cfa4ec6067dfa4ee81c2e9a9d006813ff06832fe8f43a9a0c005d139a08002a14b82e00",
  },
  {
    module: 29,
    address: "0000:536B",
    offset: 0x0536b,
    role: "select side 1, rebuild every live unit, and refill current life",
    hex: "c7068a3175542ec606345401e89300cb",
  },
  {
    module: 29,
    address: "0000:537B",
    offset: 0x0537b,
    role: "select side 2, rebuild every live unit, and refill current life",
    hex: "c7068a3175542ec606345402e88300cb",
  },
  {
    module: 29,
    address: "0000:538B",
    offset: 0x0538b,
    role: "select side 2 and rebuild 57 dynamic unit slots with the fresh-experience callback",
    hex: "c7068a319b532ec606345402e87300c3",
  },
  {
    module: 29,
    address: "0000:539B",
    offset: 0x0539b,
    role: "write next cumulative experience threshold plus one to the current unit",
    hex: "8b36b931a1a13140894402c3",
  },
  {
    module: 29,
    address: "0000:540D",
    offset: 0x0540d,
    role: "rebuild all live unit stats from class, cumulative experience, stage overrides, and difficulty",
    hex: "b93900bb000051532ea03454e86bfce8cdfd9a0000b6189a7100b618a18a31ffd05b4359e2e0c3",
  },
  {
    module: 29,
    address: "1000:05E5",
    offset: 0x105e5,
    role: "copy surviving battle/campaign arrays back through the parent state interface",
    hex: "b8ba1e8ed8833ec0004e7503e9ae001ea1c2008ec0b8ba1e8ed8beda568b3ec40083c70c268b3db94b00f3a51f1e8b3e",
  },
  {
    module: 29,
    address: "1000:42A8",
    offset: 0x142a8,
    role: "seed the default transition and invoke all per-stage round/outcome event handlers",
    hex: "c70606001900a1772e40a30800e87000e8e800e88501e8d601e81302e86402e8b502e89e03e83804e8a904e86405e881",
  },
  {
    module: 29,
    address: "1000:8BD1",
    offset: 0x18bd1,
    role: "add floor one-half to side-2 attack, defense, and maximum life only at difficulty 3",
    hex: "833e0000037401cb833ec931027401cba1bf31d1e80106bf31a1cf31d1e80106cf31a1c131d1e80106c131a1d131d1e80106d131a1c331d1e80106c331cb",
  },
  {
    module: 29,
    address: "1000:88B9",
    offset: 0x188b9,
    role: "serialize live-victory 999 as completed-save sentinel 1000",
    hex: "a1832f3de7037503b8e803aba10000ab1fc31ea180f80500088ec0b8ba1e8ed8",
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function verifySignatures(module27, module29) {
  return CODE_SIGNATURES.map((signature) => {
    const source = signature.module === 27 ? module27 : module29;
    const expected = Buffer.from(signature.hex, "hex");
    const actual = source.subarray(signature.offset, signature.offset + expected.length);
    if (!actual.equals(expected)) {
      throw new Error(
        `module ${signature.module} ${signature.address}: lifecycle code signature mismatch`,
      );
    }
    return {
      module: signature.module,
      address: signature.address,
      fileOffset: signature.offset,
      bytes: expected.length,
      role: signature.role,
      sha256: sha256(expected),
    };
  });
}

function summarizeDeployment(templates, templatesPath) {
  if (!Array.isArray(templates?.stages) || templates.stages.length !== 44) {
    throw new Error(`${templatesPath}: expected 44 mapped stage templates`);
  }
  const stages = templates.stages.map((stage) => {
    const deployment = stage.deployment;
    if (deployment === undefined || deployment.markerValue !== 0xff) {
      throw new Error(`${templatesPath}: stage ${stage.stage} lacks confirmed deployment metadata`);
    }
    if (!deployment.eligibleFlagValues.every((value) => value === 1)) {
      throw new Error(`${templatesPath}: stage ${stage.stage} has an unknown roster flag value`);
    }
    if (deployment.cells.length !== deployment.openCellCount) {
      throw new Error(`${templatesPath}: stage ${stage.stage} deployment-cell count differs`);
    }
    return {
      stage: stage.stage,
      stageKind: stage.stageKind,
      required: deployment.required,
      openCells: deployment.openCellCount,
      eligibleUnits: deployment.eligibleUnitSlots.length,
      fixedUnits: deployment.fixedPlayerUnitSlots.length,
      optionalUnits: deployment.optionalUnitSlots.length,
      maximumPlayerUnits: deployment.maximumPlayerUnitCount,
      cells: deployment.cells,
      eligibleUnitSlots: deployment.eligibleUnitSlots,
      fixedPlayerUnitSlots: deployment.fixedPlayerUnitSlots,
      optionalUnitSlots: deployment.optionalUnitSlots,
    };
  });
  const interactiveStages = stages.filter((stage) => stage.required);
  const directWriteStages = stages.filter((stage) => !stage.required);
  if (interactiveStages.length !== 33) {
    throw new Error(`${templatesPath}: expected 33 FF deployment stages`);
  }
  const totalOpenCells = interactiveStages.reduce((sum, stage) => sum + stage.openCells, 0);
  if (totalOpenCells !== 423) {
    throw new Error(`${templatesPath}: expected 423 mapped FF deployment cells`);
  }
  return {
    mappedStages: stages.length,
    interactiveStageCount: interactiveStages.length,
    directWriteStageCount: directWriteStages.length,
    totalOpenCells,
    interactiveStages: interactiveStages.map((stage) => stage.stage),
    directWriteStages: directWriteStages.map((stage) => stage.stage),
    stages,
  };
}

async function extract(module27Path, module29Path, templatesPath, outputPath) {
  const [module27, module29, templatesBuffer] = await Promise.all([
    readFile(module27Path),
    readFile(module29Path),
    readFile(templatesPath),
  ]);
  const templates = JSON.parse(templatesBuffer.toString("utf8"));
  const verifiedCodeSignatures = verifySignatures(module27, module29);
  const deployment = summarizeDeployment(templates, templatesPath);

  const output = {
    format: "ANGEL2 native battle lifecycle",
    semanticVersion: 3,
    sources: [
      { module: 27, path: module27Path, bytes: module27.length, sha256: sha256(module27) },
      { module: 29, path: module29Path, bytes: module29.length, sha256: sha256(module29) },
      {
        kind: "battleTemplates",
        path: templatesPath,
        bytes: templatesBuffer.length,
        sha256: sha256(templatesBuffer),
        stages: templates.stageCount,
      },
    ],
    verifiedCodeSignatures,
    stateFields: {
      module29: {
        loadSelector: {
          address: "DS:0002",
          values: { N: "load newly generated JUST.TST", other: "load the selected WAR slot" },
        },
        nextModule: { address: "DS:0006", defaultAfterVictory: 25, retryAfterDefeat: 27 },
        nextStage: { address: "DS:0008", defaultAfterVictory: "currentStage + 1", retryAfterDefeat: "currentStage" },
        currentStage: { address: "DS:2E77" },
        roundOrOutcome: {
          address: "DS:2F83",
          ordinary: "1-based full-round number after the fresh-battle opening call to 0000:4DCD",
          liveVictory: 999,
          completedVictorySave: 1000,
          completedSaveRule: "1000 is written to WAR metadata in place of live value 999; loading it resumes directly into the outcome invocation of the shared stage-event dispatcher without showing the save prompt again",
        },
      },
      module27: {
        parentInterfaceSentinel: {
          address: "DS:0028",
          standaloneValue: 0x4e,
          mutationCondition: "value is not 4Eh",
        },
        importedSide1Experience: { address: "parent interface + 0Eh", records: 58 },
        importedSide1Classes: { address: "DS:050C", records: 58 },
        side1ActorDescriptorPointers: { address: "DS:0A82", records: 58 },
        currentStage: { address: "DS:02B6" },
        currentDeploymentCell: { address: "DS:0FF6", empty: 0 },
        eligibleRosterFlags: { address: "DS:079E", records: 75, activeValue: 1 },
        eligibleRosterIndexList: { address: "DS:0834", entries: "word offsets of nonzero DS:079E slots" },
        selectedFlags: { address: "DS:05A2", records: 75 },
        fixedAtTemplateLoadFlags: { address: "DS:0638", records: 75 },
      },
    },
    freshBattleInitialization: {
      entryCondition: "normal module-27 template preparation followed by module-29 CONTINU == 'N'; direct numbered WAR resumes do not run this chain",
      sequence: [
        "with the parent campaign interface present, module 27 0000:0493 raises each class-record-0 side-1 actor with a non-FF portrait to cumulative experience 299 when its imported value is 299 or lower",
        "0000:4ABE repeats 0000:538B exactly LV_HARD + 1 times unless the stage is 3, 8, or 11",
        "0000:538B rebuilds side 2 with callback 0000:539B, which writes next cumulative experience threshold + 1",
        "0000:536B rebuilds side 1 and refills current life to the resulting maximum",
        "0000:537B rebuilds side 2 and refills current life after all difficulty growth and stage overrides",
      ],
      enemyExperienceSeeding: {
        skippedStages: [3, 8, 11],
        repetitions: "LV_HARD + 1",
        perRepetition: "experience = next cumulative experience threshold + 1",
        affects: ["cumulative experience", "visible growth-row level", "attack", "defense", "maximum life"],
        doesNotAffect: ["class movement"],
      },
      namedSide1ExperienceFloor: {
        module: 27,
        address: "0000:0493",
        entryCondition: "module 27 DS:0028 is not the 4Eh standalone/no-parent sentinel",
        classRecord: 0,
        actorPortraitCondition: "side-1 actor descriptor portrait byte is not FF",
        importedExperienceCondition: "experience <= 299",
        resultingExperience: 299,
        scope: "all 58 imported side-1 slots; stage-0 named actors slots 0 and 1 match, while generic slots 40..43 have FF portraits and are skipped",
      },
      unitRebuildOrder: [
        "select the first, second, or third fixed class row from cumulative experience",
        "apply post-third-row threshold/attack/max-life growth",
        "apply stage 37 fixed boss overrides when applicable",
        "if LV_HARD == 3 and side == 2, add floor(value / 2) to current/base attack, current/base defense, and maximum life",
      ],
      stage0Side1: {
        campaignClassRecord: 0,
        namedActors: {
          slots: [0, 1],
          names: ["妮雅", "希蜜"],
          cumulativeExperience: 299,
          visibleLevel: 3,
          attack: 45,
          defense: 27,
          maximumAndCurrentLife: 180,
          movement: 4,
          nextExperienceThreshold: 300,
        },
        genericActors: {
          slots: [40, 41, 42, 43],
          cumulativeExperience: 0,
          visibleLevel: 1,
          attack: 39,
          defense: 21,
          maximumAndCurrentLife: 160,
          movement: 4,
          nextExperienceThreshold: 100,
        },
        rule: "module 27 first applies the named class-0 experience floor, then module 29 rebuilds and refills all six units; pre-rebuild per-slot current-life initializers are overwritten before first control",
      },
      resumeRule: "a numbered save restores serialized experience/life and then derives effective stats; it must not repeat fresh-battle seeding",
    },
    deployment: {
      ...deployment,
      sourceMarker: {
        map: "B.SWF side/occupancy map",
        value: 255,
        hex: "FF",
        meaning: "unfilled player deployment cell",
      },
      rosterRule: "each nonzero scenarioUnitFlag includes that campaign unit slot in the deployment roster",
      fixedRule: "a unit already occupying a side-1 cell is marked selected and fixed; it cannot be removed",
      placeRule: "selecting an unplaced eligible unit changes the current FF side-map cell to 1, writes its slot to the unit map, marks it selected, then advances to the next FF cell",
      removeRule: "selecting a placed non-fixed unit clears its selected flag, finds its map cell, and restores both side and unit-map bytes to FF",
      capacityRule: "placement is rejected when no FF cell remains; a stage may have more FF cells than eligible optional units",
      finishRule: "the 結束 control writes JUST.TST; any FF cells left unused are changed to empty side-map cells by module29 1000:543B after load",
      nativeUiStrings: {
        pages: ["Ⅰ", "Ⅱ", "Ⅲ"],
        finish: "結束",
        emptyRosterEntry: "此處沒有人.",
        capacityReached: "出場人數已滿.",
        fixedUnit: "此人必須出場戰鬥,不可放棄.",
      },
    },
    lifecycle: [
      {
        id: "prepare_template",
        module: 27,
        sequence: [
          "import campaign unit classes and state from the parent interface",
          "load the current stage's B.SWF odd-record template",
          "apply only nonzero side-1 class overrides",
          "build selected/fixed flags from already occupied side-1 cells",
          "build the eligible roster from nonzero scenarioUnitFlags",
        ],
      },
      {
        id: "deploy_or_direct_write",
        module: 27,
        branch: {
          hasFF: "run the interactive roster/placement loop until 結束",
          noFF: "skip the deployment UI and write JUST.TST immediately",
        },
        output: "JUST.TST containing the post-deployment maps, merged classes, behaviors, stage, terrain tokens, and descriptor offsets",
      },
      {
        id: "enter_battle",
        module: 29,
        branch: {
          N: "load JUST.TST and clear every unused FF marker to empty",
          numberedSlot: "load the selected WAR save including its round/outcome value",
        },
        freshBattle: "after module 27 applies the named side-1 experience floor, seed side-2 experience from LV_HARD, rebuild/refill both sides, initialize presentation, and call 0000:4DCD, making the opening playable round round 1",
        resumedBattle: "restore the saved side phase/presentation state through 1000:3788 instead of starting a new round",
      },
      {
        id: "full_round",
        module: 29,
        sequence: [
          "check defeat, victory, stage-6 special victory, and stage-20 life-threshold victory",
          "while a selectable unspent side-1 unit exists, run player input and recheck terminal/UI exits",
          "run remaining side-1 autonomous or special units",
          "perform the phase-boundary presentation/state work and clear side-1 action bits",
          "run side-2 AI and its stage-26 tail event",
          "check defeat and victory again",
          "if nonterminal, call 0000:4DCD: increment the full-round number, tick poison/statuses once, run per-stage round handlers, and return to the player phase",
        ],
      },
      {
        id: "terminal_dispatch",
        module: 29,
        liveVictory: "write 999, seed nextModule=25 and nextStage=currentStage+1, then invoke every per-stage battle-event handler",
        defeat: "show the failure/retry dialogue, set nextModule=27 and nextStage=currentStage, and return",
        completedSave: "a loaded value 1000 invokes the outcome branches of the shared stage-event handlers and exits without offering to save the same victory again",
      },
      {
        id: "victory_prompt_and_copyback",
        module: 29,
        genericPrompt: "for ordinary stages, ask whether to save; confirmation writes a WAR slot whose serialized outcome is 1000",
        copyback: "copy the resulting campaign/battle arrays through the parent state interface, then return the selected module/stage transition",
      },
    ],
    transitions: {
      ordinaryVictory: {
        nextModule: 25,
        nextStage: "currentStage + 1",
        genericPrompt: "哦！．．|這次的戰役結束了，是否要記錄下來．",
      },
      defeatRetry: {
        nextModule: 27,
        nextStage: "currentStage",
        prompt: "啊！．．．竟然失敗了？|我太低辜敵人的實力，再給我一次機會吧！",
      },
      stage6Bridge: {
        rule: "when module29 is about to return nextStage=6, its main routine forces the actual next module to 27; module27 itself returns module 25 after preparing stage 6",
      },
      stage42Victory: {
        handler: "1000:457F",
        rule: "on live outcome 999, runs its portal presentation and overwrites nextStage with 6; on loaded 1000, skips presentation but preserves that redirect; module29's stage-6 bridge therefore returns to module 27",
      },
      genericVictoryPromptSuppressedStages: [21, 37, 38, 42],
    },
    implementationBoundary: {
      simulation: "stage, round/outcome, deployment roster and cells, unit maps/state, side phases, objectives, and next-module transition",
      presentation: "deployment list rendering, battle viewport/HUD, dialogues, animations, and audio consume simulation events but do not own the terminal state",
      persistence: "save serializable simulation state; preserve the distinct 999 live-victory and 1000 persisted-completion meanings",
    },
    validation: {
      allCodeSignaturesVerified: verifiedCodeSignatures.length === CODE_SIGNATURES.length,
      verifiedCodeSignatureCount: verifiedCodeSignatures.length,
      mappedDeploymentStages: deployment.mappedStages,
      interactiveDeploymentStages: deployment.interactiveStageCount,
      totalDeploymentCells: deployment.totalOpenCells,
      fullOrdinaryBattleLifecycleClosed: true,
      freshBattleDifficultyInitializationClosed: true,
      freshBattleNamedSide1InitializationClosed: true,
      remainingScope: "stage-events.json structurally closes all 38 native per-stage handlers, including eight dynamic-board and seven other runtime-state stages, plus the module-25/27/29 stage-6 bridge and module-33/35/46 postgame route; remaining frame/audio presentation work does not reopen the ordinary deployment/battle/victory/defeat lifecycle",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `verified ${verifiedCodeSignatures.length} lifecycle signatures and ${deployment.totalOpenCells} deployment cells to ${outputPath}`,
  );
}

function usage() {
  return "usage: angel2-battle-lifecycle.mjs --extract MODULE27.bin MODULE29.bin BATTLE_TEMPLATES.json OUTPUT.json";
}

const [command, module27Path, module29Path, templatesPath, outputPath] = process.argv.slice(2);
if (
  command !== "--extract" ||
  module27Path === undefined ||
  module29Path === undefined ||
  templatesPath === undefined ||
  outputPath === undefined
) {
  console.error(usage());
  process.exitCode = 1;
}
else {
  extract(module27Path, module29Path, templatesPath, outputPath).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { CODE_SIGNATURES, extract };
