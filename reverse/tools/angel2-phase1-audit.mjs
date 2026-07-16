#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const RESIDUAL_CLASSIFICATIONS = {
  "UI-004": ["unreachable_legacy_name", "发布版副作用已闭合为不可达 no-op；只缺原设计名称"],
  "UNIT-004": ["unrecoverable_original_intent", "field5 的保存/显示与无战斗消费者均已确认；原设计意图不应猜测"],
  "MOVE-010": ["inferred_editor_labels", "23 个数值槽及全部规则消费者已闭合；原版没有已发现的显示名绑定"],
  "BAT-006": ["nonstandard_unrouted_entry", "39–41 缺目标、49 缺模板的集合事实已闭合；不得把未命名入口扩写为正常战役规则"],
  "BAT-009": ["pit_calibration_and_original_name", "反击分支与 PIT 位条件已闭合；只缺业务字段原名和硬件采样分布"],
  "BAT-031": ["native_undefined_lookup", "SM/FM 缺参数行及忽略失败返回已闭合；残留字段结果是原生未定义行为"],
  "BAT-052": ["native_undefined_memory_walk", "场景 9 错误机制已闭合；具体 PIT 轨迹和代码段覆写后表现不构成确定规则"],
  "PRES-003": ["manual_text_transcription", "资源帧和控制流完整；22 个姓名已完成逐帧转录，其中蘇泓漳另有字形与罗马字交叉验证"],
  "PRES-004": ["vga_substep_and_low_level_names", "普通攻击资源、帧序、声音、native tick 与同步为 C"],
  "PRES-005": ["low_level_renderer_name", "射击/魔弓/闪避资源、帧序、native tick 与规则同步为 C"],
  "PRES-006": ["low_level_descriptor_names", "五个主技术家族资源、帧序、声音、native tick 与规则同步为 C"],
  "PRES-007": ["pit_sampling_and_low_level_names", "其余玩家技术资源、程序绘图、native tick 与规则同步为 C"],
  "PRES-008": ["vga_retrace_low_level_names_and_audio_drift", "标题全部原生 tick、绘制和资源顺序为 C"],
  "PRES-009": ["low_level_vga_names", "两套解释器和全发布版选择器为 C；四条无生产者脚本完整归档，不接入忠实流程"],
  "PRES-011": ["low_level_renderer_names", "范围输入门、像素明暗和地图特效层为 C"],
  "PRES-012": ["pit_route_and_vga_calibration", "九个特殊逐关表现的操作顺序、资源、native tick 和同步为 C"],
  "PRES-013": ["pit_route_and_internal_name", "WD 与第 26 关效果的规则、资源和 native tick 为 C"],
  "SAVE-006": ["unrecoverable_compatibility_names", "兼容字的全部运行时消费者与原样往返策略为 C"],
};

function evidenceRows(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([A-Z]+-\d+)\s*\|.*\|\s*(C(?:\/[STU])?|S|T|U)\s*\|/);
    if (match) rows.push({ id: match[1], grade: match[2] });
  }
  return rows;
}

function requireEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function extract(evidencePath, techniquePath, aiPath, behavior12Path, bRecordPath,
  storyPath, feedbackPath, timingPath, outputPath) {
  const [evidenceMarkdown, technique, ai, behavior12, bRecord, story, feedback, timing] = await Promise.all([
    readFile(evidencePath, "utf8"),
    readFile(techniquePath, "utf8").then(JSON.parse),
    readFile(aiPath, "utf8").then(JSON.parse),
    readFile(behavior12Path, "utf8").then(JSON.parse),
    readFile(bRecordPath, "utf8").then(JSON.parse),
    readFile(storyPath, "utf8").then(JSON.parse),
    readFile(feedbackPath, "utf8").then(JSON.parse),
    readFile(timingPath, "utf8").then(JSON.parse),
  ]);

  const rows = evidenceRows(evidenceMarkdown);
  const mixedRows = rows.filter((row) => row.grade !== "C");
  requireEqual(mixedRows.map((row) => row.id), Object.keys(RESIDUAL_CLASSIFICATIONS),
    "mixed evidence-row classification coverage");

  const vPlayer = technique.dispatchTable.vReachability;
  const vAi = ai.actionTable.vReachability;
  requireEqual(vPlayer.handlers["1V"].directNearCallers, [], "1V direct callers");
  requireEqual(vPlayer.handlers["2V"].directNearCallers, [], "2V direct callers");
  requireEqual(vPlayer.handlers["3V"].directNearCallers, ["0000:72D3"], "3V direct callers");
  if (vPlayer.playerMenuProducer !== null || vAi.classPoolProducer !== null) {
    throw new Error("a released player/AI V-action producer unexpectedly appeared");
  }
  requireEqual(bRecord.unselectedOddTemplates.map((entry) => [
    entry.record, entry.duplicateOf, entry.selectedByAnyRuntimeBReadPath,
  ]), [[79, 21, false], [81, 49, false], [83, 65, false]], "unselected B template audit");
  if (behavior12.stage4.resolution.lifeFormula !== "currentLife = floor(currentLife / 2)"
    || behavior12.stage9.staleRegisterMechanism.returnedDi !== 3450
    || behavior12.stage9.pathBug.list.boundsCheck !== false) {
    throw new Error("behavior-12 closure facts changed");
  }
  requireEqual(story.globalReachabilityAudit.unreachableCommandScripts, [69, 116, 117, 118],
    "archive-only command scripts");
  if (story.closure.allReleasedDialogueSelectorProducersClosed !== true
    || feedback.closure.fixedCollapseReachabilityClosed !== true
    || feedback.closure.module27KeySoundVisibleBindingClosed !== true
    || timing.closure.releasedNominalTickDurationClosed !== true
    || timing.closure.allReleasedRuntimeModulesUseSameNominalTick !== true
    || timing.moduleCoverage.allReleasedModulesUseSameNominalDivisorAndChainCadence !== true
    || timing.fidelityContract.webLogicalTickMilliseconds !== 10
    || feedback.battleFeedbackWrapper.configuratorCallAudit.fixedCollapse.encodedOffsetWordReferences.length !== 0) {
    throw new Error("story/feedback/timing closure changed");
  }

  const residuals = mixedRows.map((row) => {
    const [category, reason] = RESIDUAL_CLASSIFICATIONS[row.id];
    return {
      ...row,
      category,
      blocksDeterministicWebRules: false,
      reason,
    };
  });

  const output = {
    format: "ANGEL2 phase-1 residual evidence audit",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    source: {
      evidenceRegister: evidencePath,
      techniqueRules: techniquePath,
      aiRules: aiPath,
      behavior12Effects: behavior12Path,
      bRecordAudit: bRecordPath,
      storyPresentations: storyPath,
      feedbackPresentations: feedbackPath,
      nativeTiming: timingPath,
    },
    evidenceRegister: {
      rows: rows.length,
      confirmedRows: rows.filter((row) => row.grade === "C").length,
      mixedRows: residuals.length,
      residuals,
    },
    closureChecks: {
      dormantVActions: {
        playerMenuProducers: 0,
        aiClassPoolProducers: 0,
        directCallers: { "1V": [], "2V": [], "3V": ["0000:72D3"] },
        conclusion: "1V/2V are dormant compatibility rows; 3V is produced only by 魔弓兵 shooting",
      },
      unselectedBTemplates: {
        records: [[79, 21], [81, 49], [83, 65]],
        runtimeReadPaths: 0,
        distinctPayloadsMissing: 0,
      },
      behavior12: {
        stage4DeterministicRuleClosed: true,
        stage9UndefinedMechanismClosed: true,
        nativeMemoryCorruptionRequiredForWebCompatibility: false,
      },
      ordinaryDamageDefenseMagicDifference: {
        deterministicRuleClosed: true,
        liveObservationRequiredToChooseRule: false,
      },
      archiveReachability: {
        commandScriptsWithoutReleasedProducer: story.globalReachabilityAudit.unreachableCommandScripts,
        fixedCollapseLineWithoutReleasedEntry: feedback.closure.fixedCollapseReachabilityClosed,
      },
      deploymentKeySoundBinding: {
        sharedParentSlot: feedback.deploymentErrorFeedback.dismissalAudio.sharedSoundSwitchImport.sharedPointerSlot,
        visibleSetting: feedback.deploymentErrorFeedback.dismissalAudio.userFacingGateBinding.label,
        closed: feedback.closure.module27KeySoundVisibleBindingClosed,
      },
      nativeTiming: {
        pitDivisor: timing.pit.divisor,
        nominalTickHz: timing.pit.nominalIrqHz,
        nominalTickMilliseconds: timing.pit.nominalIrqMilliseconds,
        webLogicalTickMilliseconds: timing.fidelityContract.webLogicalTickMilliseconds,
        closed: timing.closure.releasedNominalTickDurationClosed,
      },
    },
    implementationRequiredUnknowns: [],
    deferredCalibrationOrArchaeologyCount: residuals.length,
    recommendation: {
      evidenceReadyForUserReview: true,
      phase1Complete: false,
      reason: "all deterministic implementation-required rules in the evidence register are C/S or have an explicit safe boundary; the remaining gate is user review plus optional archaeology/calibration, while implementation remains frozen",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`classified ${residuals.length} mixed evidence rows; implementation-required unknowns: 0; wrote ${outputPath}`);
}

function usage() {
  return "usage: angel2-phase1-audit.mjs --extract EVIDENCE.md TECHNIQUE.json AI.json BEHAVIOR12.json B-RECORD.json STORY.json FEEDBACK.json TIMING.json OUTPUT.json";
}

async function main() {
  const [mode, evidencePath, techniquePath, aiPath, behavior12Path, bRecordPath,
    storyPath, feedbackPath, timingPath, outputPath] = process.argv.slice(2);
  if (mode !== "--extract" || outputPath === undefined) throw new Error(usage());
  await extract(evidencePath, techniquePath, aiPath, behavior12Path, bRecordPath,
    storyPath, feedbackPath, timingPath, outputPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { evidenceRows, extract };
