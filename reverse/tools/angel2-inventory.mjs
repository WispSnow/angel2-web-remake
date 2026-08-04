#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readJson(fileName) {
  try {
    return JSON.parse(await readFile(fileName, "utf8"));
  }
  catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function buildInventory(referenceDirectory, reverseDirectory) {
  const audio = await readJson(path.join(reverseDirectory, "converted/audio/manifest.json"));
  const mappedFont = await readJson(path.join(reverseDirectory, "renders/font/manifest.json"));
  const rawFont = await readJson(path.join(reverseDirectory, "renders/raw-font/manifest.json"));
  const runtimeModules = await readJson(
    path.join(reverseDirectory, "unpacked/runtime-modules/manifest.json"),
  );
  const lzexeModules = await readJson(
    path.join(reverseDirectory, "unpacked/lzexe-modules/manifest.json"),
  );
  const unitDescriptors = await readJson(
    path.join(reverseDirectory, "parsed/native/unit-descriptors.json"),
  );
  const promotionTable = await readJson(
    path.join(reverseDirectory, "parsed/native/promotion-table.json"),
  );
  const unitCatalog = await readJson(
    path.join(reverseDirectory, "parsed/native/unit-catalog.json"),
  );
  const battleTemplates = await readJson(
    path.join(reverseDirectory, "parsed/native/battle-templates.json"),
  );
  const battleObjectives = await readJson(
    path.join(reverseDirectory, "parsed/native/battle-objectives.json"),
  );
  const battleLifecycle = await readJson(
    path.join(reverseDirectory, "parsed/native/battle-lifecycle.json"),
  );
  const stageEvents = await readJson(
    path.join(reverseDirectory, "parsed/native/stage-events.json"),
  );
  const stagePresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/stage-presentations.json"),
  );
  const endingPresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/ending-presentations.json"),
  );
  const titleFlow = await readJson(
    path.join(reverseDirectory, "parsed/native/title-flow.json"),
  );
  const titlePresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/title-presentations.json"),
  );
  const storyPresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/story-presentations.json"),
  );
  const feedbackPresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/feedback-presentations.json"),
  );
  const nativeTiming = await readJson(
    path.join(reverseDirectory, "parsed/native/native-timing.json"),
  );
  const phase1Audit = await readJson(
    path.join(reverseDirectory, "parsed/native/phase1-residual-audit.json"),
  );
  const passwordFlow = await readJson(
    path.join(reverseDirectory, "parsed/native/password-flow.json"),
  );
  const combatFormulas = await readJson(
    path.join(reverseDirectory, "parsed/native/combat-formulas.json"),
  );
  const combatPresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/combat-presentations.json"),
  );
  const shootingPresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/shooting-presentations.json"),
  );
  const techniquePresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/technique-presentations.json"),
  );
  const remainingTechniquePresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/remaining-technique-presentations.json"),
  );
  const turnActions = await readJson(
    path.join(reverseDirectory, "parsed/native/turn-actions.json"),
  );
  const inputUi = await readJson(
    path.join(reverseDirectory, "parsed/native/input-ui.json"),
  );
  const hudPresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/hud-presentations.json"),
  );
  const rangePresentations = await readJson(
    path.join(reverseDirectory, "parsed/native/range-presentations.json"),
  );
  const techniqueRules = await readJson(
    path.join(reverseDirectory, "parsed/native/technique-rules.json"),
  );
  const aiRules = await readJson(
    path.join(reverseDirectory, "parsed/native/ai-rules.json"),
  );
  const mapRules = await readJson(
    path.join(reverseDirectory, "parsed/native/map-rules.json"),
  );
  const terrainTokenMap = await readJson(
    path.join(reverseDirectory, "parsed/native/terrain-token-map.json"),
  );
  const battleMapRenders = await readJson(
    path.join(reverseDirectory, "renders/battle-maps/confirmed/manifest.json"),
  );
  const battleMinimapRenders = await readJson(
    path.join(reverseDirectory, "renders/battle-maps/minimap/manifest.json"),
  );
  const battleMinimapOccupancyRenders = await readJson(
    path.join(reverseDirectory, "renders/battle-maps/minimap-occupancy/manifest.json"),
  );
  const saveMinimapRenders = await readJson(
    path.join(reverseDirectory, "renders/battle-maps/save-minimap/manifest.json"),
  );
  const minimapRules = await readJson(
    path.join(reverseDirectory, "parsed/native/minimap-rules.json"),
  );
  const terrainNameAudit = await readJson(
    path.join(reverseDirectory, "parsed/native/terrain-name-audit.json"),
  );
  const decodedSaves = await readJson(
    path.join(reverseDirectory, "parsed/saves/TST-decoded.json"),
  );
  const saveStateSemantics = await readJson(
    path.join(reverseDirectory, "parsed/native/save-state-semantics.json"),
  );
  const saveRobustness = await readJson(
    path.join(reverseDirectory, "parsed/native/save-robustness.json"),
  );
  const js3Config = await readJson(
    path.join(reverseDirectory, "parsed/native/AG2-JS3.json"),
  );
  const decodedSaveByName = new Map(
    (decodedSaves?.files ?? []).map((entry) => [entry.fileName, entry]),
  );
  const rawFontByGroup = new Map();
  for (const entry of rawFont?.entries ?? []) {
    const counts = rawFontByGroup.get(entry.group) ?? { records: 0, glyphs: 0 };
    counts.records += 1;
    counts.glyphs += entry.glyphs;
    rawFontByGroup.set(entry.group, counts);
  }
  const audioByGroup = new Map();
  for (const entry of audio?.entries ?? []) {
    const counts = audioByGroup.get(entry.group) ?? { creativeVoice: 0, softstarRix: 0 };
    if (entry.kind === "creative_voice") counts.creativeVoice += 1;
    if (entry.kind === "softstar_rix") counts.softstarRix += 1;
    audioByGroup.set(entry.group, counts);
  }

  const files = [];
  for (const fileName of (await readdir(referenceDirectory)).sort()) {
    const source = await readFile(path.join(referenceDirectory, fileName));
    const extension = path.extname(fileName).toUpperCase();
    const stem = path.basename(fileName, extension);
    const extracted = await readJson(path.join(reverseDirectory, "extracted", stem, "manifest.json"));
    const decoded = await readJson(path.join(reverseDirectory, "decoded", stem, "manifest.json"));
    const rendered = await readJson(
      path.join(reverseDirectory, "renders/planar", stem, "manifest.json"),
    );
    const row = {
      fileName,
      bytes: source.length,
      sha256: sha256(source),
      category: extension === ".SWF" ? "resource" :
        extension === ".EXE" || extension === ".COM" ? "program" : "data_or_configuration",
    };
    if (extracted !== null) {
      row.indexedContainer = {
        recordCount: extracted.recordCount,
        presentRecords: extracted.presentRecords,
        missingRecords: extracted.missingRecords,
        extractedRecords: extracted.presentRecords,
        extractionComplete: true,
      };
    }
    if (decoded !== null) {
      row.embeddedStreams = {
        records: decoded.records,
        decodedStreams: decoded.decodedStreams,
        unpackedBytes: decoded.unpackedBytes,
        kinds: decoded.kinds,
      };
    }
    if (rendered !== null) {
      row.planarPreview = {
        renderedRecords: rendered.renderedRecords,
        renderedImages: rendered.renderedImages,
        palette: rendered.palette,
      };
    }
    if (audioByGroup.has(stem)) {
      row.audio = audioByGroup.get(stem);
    }
    if (rawFontByGroup.has(stem)) {
      row.rawGlyphArrays = rawFontByGroup.get(stem);
    }
    if (fileName === "CHA.SWF" && mappedFont !== null) {
      row.mappedBig5Glyphs = {
        records: mappedFont.records,
        glyphs: mappedFont.glyphs,
        glyphSize: "16x15",
        atlasExtractionComplete: true,
      };
    }
    if (fileName === "A.SWF" && titleFlow !== null) {
      row.nativeTitleFlow = {
        titleGlyphs: titleFlow?.titleGlyphResource?.glyphCount ?? 0,
        directResourceRecords:
          (titleFlow?.directResourceLinks ?? []).flatMap((link) => link.records ?? []).length,
        titleOptions: titleFlow?.titleMenu?.options?.length ?? 0,
        difficultyOptions: titleFlow?.difficultyMenu?.options?.length ?? 0,
        continueSlots: titleFlow?.continueMenu?.hitboxes?.length ?? 0,
        status: "native_title_new_continue_state_machine_closed",
      };
    }
    if (fileName === "A.SWF" && titlePresentations !== null) {
      const graphics = titlePresentations.resourceCatalog.graphics
        .filter((entry) => entry.group === "A");
      row.nativeTitlePresentation = {
        linkedGraphicRecords: graphics.map((entry) => entry.record),
        paletteCorrectRenders: graphics.reduce(
          (total, entry) => total + entry.images.length,
          0,
        ),
        inheritedGlyphRecords:
          titlePresentations.resourceCatalog.titleGlyphResourcesFromFlowSpec,
        roles: ["continue selector construction", "intro scrolling-text glyph strip"],
        status: "title, intro, difficulty, and continue presentation timeline closed",
      };
    }
    if (fileName === "UN.SWF" && runtimeModules !== null) {
      row.runtimeModules = {
        modules: runtimeModules.moduleCount,
        blocks: runtimeModules.totalBlocks,
        reconstructedImageBytes: runtimeModules.totalImageBytes,
        lzexePackedModules: lzexeModules?.moduleCount ?? 0,
        lzexeUnpackedImageBytes: lzexeModules?.totalUnpackedBytes ?? 0,
        recoveredMzRelocations: lzexeModules?.totalRelocationCount ?? 0,
        reconstructionComplete:
          lzexeModules?.moduleCount === runtimeModules.moduleCount,
      };
      if (nativeTiming !== null) {
        row.nativeTiming = {
          auditedRuntimeModules:
            nativeTiming?.moduleCoverage?.auditedModules?.map((entry) => entry.module) ?? [],
          pitChannel: nativeTiming?.pit?.channel ?? null,
          pitMode: nativeTiming?.pit?.mode ?? null,
          pitDivisor: nativeTiming?.pit?.divisor ?? null,
          nominalIrqHz: nativeTiming?.pit?.nominalIrqHz ?? null,
          nominalIrqMilliseconds: nativeTiming?.pit?.nominalIrqMilliseconds ?? null,
          webLogicalTickMilliseconds:
            nativeTiming?.fidelityContract?.webLogicalTickMilliseconds ?? null,
          allReleasedRuntimeModulesClosed:
            nativeTiming?.closure?.allReleasedRuntimeModulesUseSameNominalTick ?? false,
          machineData: "reverse/parsed/native/native-timing.json",
        };
      }
      if (passwordFlow !== null) {
        row.nativePasswordGate = {
          module: passwordFlow?.passwordUi?.module ?? 0,
          verifiedRanges: passwordFlow?.validation?.verifiedRangeCount ?? 0,
          attemptsPerSet: passwordFlow?.passwordUi?.attemptsPerSet ?? 0,
          challengeCoordinates: passwordFlow?.challengeReference?.coordinateCount ?? 0,
          visibleColorButtons:
            passwordFlow?.passwordUi?.answerChoices?.buttonVisualsLeftToRight?.length ?? 0,
          answerCodeOrder:
            passwordFlow?.passwordUi?.answerChoices?.answerCodeLeftToRight ?? [],
          directResourceRecords: passwordFlow?.validation?.directResourceCount ?? 0,
          gateHandoffClosed:
            passwordFlow?.validation?.sharedGateHandoffClosed ?? false,
          status: "native_first_battle_exit_password_gate, six visible color buttons, and 28-entry answer-code table closed; exact frame/audio timeline and DOS-vector compatibility precheck remain pending",
        };
      }
    }
    if (fileName === "UN.SWF" && titlePresentations !== null) {
      const graphics = titlePresentations.resourceCatalog.graphics
        .filter((entry) => entry.group === "UN");
      row.nativeTitlePresentation = {
        linkedGraphicRecords: graphics.map((entry) => entry.record),
        paletteCorrectRenders: graphics.reduce(
          (total, entry) => total + entry.images.length,
          0,
        ),
        role: "pretitle Softstar logo",
        status: "pretitle draw, palette fade, skippable hold, and fade-out closed",
      };
    }
    if (fileName === "BK.SWF" && titlePresentations !== null) {
      const graphics = titlePresentations.resourceCatalog.graphics
        .filter((entry) => entry.group === "BK");
      row.nativeTitlePresentation = {
        linkedGraphicRecords: graphics.map((entry) => entry.record),
        reachableGraphicRecords: graphics.filter((entry) => entry.reachable).map((entry) => entry.record),
        handlerSupportedUnreachableGraphicRecords:
          graphics.filter((entry) => !entry.reachable).map((entry) => entry.record),
        paletteCorrectRenders: graphics.reduce(
          (total, entry) => total + entry.images.length,
          0,
        ),
        nonMonotonicNativeIndexRecords:
          graphics.filter((entry) => entry.nonMonotonicTable).map((entry) => entry.record),
        status: "intro backgrounds, both title variants, static layers, and idle sprites closed",
      };
    }
    if (fileName === "MUSIC.SWF" && titlePresentations !== null) {
      row.nativeTitlePresentation = {
        linkedRixRecords: titlePresentations.resourceCatalog.audio.map((entry) => entry.record),
        decodedDurationsSeconds:
          Object.fromEntries(titlePresentations.resourceCatalog.audio.map(
            (entry) => [entry.record, entry.durationSeconds],
          )),
        correctedFromPriorNumMisidentification: true,
        status: "MUSIC/1 title and MUSIC/14 scrolling-intro start/stop points closed",
      };
    }
    if (fileName === "DATA.SWF") {
      row.parsedTable = {
        records: 39,
        recordBytes: 70,
        confirmedFields: 6,
        unknownFields: ["field5_original_designer_intent"],
        nativeDisplayNames: unitDescriptors?.nameAgreementRecords ?? 0,
        nativePromotionEdges: promotionTable?.edgeCount ?? 0,
        consolidatedCatalogRecords: unitCatalog?.recordCount ?? 0,
        guideExperienceTransformValues:
          unitCatalog?.validation?.guideExperienceTransformValues ?? 0,
        guideUnchangedFieldValues:
          unitCatalog?.validation?.guideUnchangedFieldValues ?? 0,
        consolidatedCatalogValidated:
          unitCatalog?.validation?.recordsWithNativeNames === 39 &&
          unitCatalog?.validation?.promotionEdges === 31 &&
          unitCatalog?.validation?.recordsWithUnresolvedAiClassDispatch === 0,
        status: "all_runtime_field_consumption_confirmed; field5 is preserved but ignored by gameplay row appliers; consolidated native unit catalog generated",
      };
    }
    if (fileName === "MAP.SWF") {
      row.parsedTable = {
        records: mapRules?.recordCount ?? 39,
        recordBytes: mapRules?.recordBytes ?? 96,
        logicalTerrainSlots: mapRules?.logicalTerrainSlots ?? 0,
        serializedWordsPerWindow: mapRules?.serializedWordsPerWindow ?? 24,
        movementProfileGroups: mapRules?.movementProfileGroups?.length ?? 0,
        terrainDefenseProfileGroups:
          mapRules?.terrainDefenseProfileGroups?.length ?? 0,
        verifiedCodeSignatures: mapRules?.verifiedCodeSignatures?.length ?? 0,
        mappedStageTerrainEntries: terrainTokenMap?.stageCount ?? 0,
        mappedRawTerrainTokens: terrainTokenMap?.allUsedTokens?.length ?? 0,
        mappedUsedLogicalTerrainSlots: terrainTokenMap?.usedLogicalSlots?.length ?? 0,
        confirmedTerrainMinimapRenders: battleMinimapRenders?.stageCount ?? 0,
        confirmedOccupancyMinimapRenders:
          battleMinimapOccupancyRenders?.stageCount ?? 0,
        terrainVisibleNameReadSitesAudited:
          terrainNameAudit?.descriptorTable?.verifiedReadSiteCount ?? 0,
        nativeVisibleNameBindingFound:
          terrainNameAudit?.conclusion?.visibleNameBindingFound ?? null,
        rangeModeWritesAudited:
          mapRules?.semantics?.rangeBuilder?.producerAudit?.ghidraDirectReferenceCrossCheck?.totalWrites ?? 0,
        reachableMode1Producers:
          mapRules?.semantics?.rangeBuilder?.producerAudit?.mode1?.producers?.length ?? null,
        scriptedFmProducers:
          mapRules?.semantics?.rangeBuilder?.producerAudit?.fm?.producers?.length ?? 0,
        status: "movement_terrain_defense_exact_player_and_ai_range_stage_token_to_logical_slot_40x44_visual_tile_minimap_color_and_overlay_mapping_confirmed; all reachable range modes bound; mode 1 confirmed producerless; only editor-friendly terrain labels remain non-native",
      };
    }
    if (fileName === "SAY.SWF") {
      row.parsedScripts = {
        records: storyPresentations?.corpus?.recordCount ?? 176,
        commandCodesInCorpus: 17,
        nativeCommandsInModule25:
          storyPresentations?.commandDispatch?.module25?.recognizedFormalCommands ?? 0,
        nativeCommandsInModule29:
          storyPresentations?.commandDispatch?.module29?.recognizedFormalCommands ?? 0,
        commandScriptRecords:
          storyPresentations?.corpus?.commandScriptRecordCount ?? 0,
        textOrLabelOnlyRecords:
          storyPresentations?.corpus?.textOrLabelOnlyRecordCount ?? 0,
        closedRouteCommandScripts:
          (storyPresentations?.corpus?.module25UniqueStoryRecords?.length ?? 0) +
          (storyPresentations?.corpus?.module29HandlerDialogueRecords?.length ?? 0) -
          (storyPresentations?.corpus?.overlap?.length ?? 0),
        globallyUnresolvedCommandScriptRecords:
          storyPresentations?.corpus?.commandScriptsOutsideTheseTwoClosedRoutes ?? [],
        semanticVersion: 2,
        status: "complete_structural_parse_and_native_interpreter_semantics_closed",
      };
      row.nativeStoryPresentation = {
        verifiedCodeSignatures:
          storyPresentations?.closure?.codeSignatureCount ?? 0,
        verifiedDataSignatures:
          storyPresentations?.closure?.dataSignatureCount ?? 0,
        paletteCorrectRenders:
          storyPresentations?.closure?.renderedImageCount ?? 0,
        contactSheets:
          storyPresentations?.closure?.contactSheetCount ?? 0,
        effectivePortraitMetadataEntries:
          storyPresentations?.portraitMetadata?.effective?.length ?? 0,
        metadataMissingPortraitIds:
          storyPresentations?.portraitMetadata?.missingIds ?? [],
        commandDispatchClosed:
          storyPresentations?.closure?.commandDispatchClosed ?? false,
        module25TimelineClosed:
          storyPresentations?.closure?.module25StoryTimelineClosed ?? false,
        module29TimelineClosed:
          storyPresentations?.closure?.module29BattleStoryTimelineClosed ?? false,
        machineData: "reverse/parsed/native/story-presentations.json",
      };
    }
    if (storyPresentations !== null && fileName === "A.SWF") {
      row.nativeStoryPresentation = {
        windowGraphicsRecord: 18,
        windowGraphicFrames:
          storyPresentations.resourceCatalog.storyUi
            .find((entry) => entry.key === "A/18")?.renderedImages ?? 0,
        portraitClearTextureRecord: 20,
        portraitClearTextureFrames:
          storyPresentations.resourceCatalog.storyUi
            .find((entry) => entry.key === "A/20")?.renderedImages ?? 0,
        status: "native window and portrait-clear graphics recovered",
      };
    }
    if (storyPresentations !== null && fileName === "BK.SWF") {
      row.nativeStoryPresentation = {
        directlyReferencedBackgroundRecords:
          storyPresentations.resourceCatalog.backgrounds.length,
        drawAt: storyPresentations.module25StoryMode.background.drawAt,
        dimensions: storyPresentations.module25StoryMode.background.dimensions,
        status: "all corpus-referenced story backgrounds palette-correct rendered",
      };
    }
    if (storyPresentations !== null && fileName === "D.SWF") {
      row.nativeStoryPresentation = {
        recordsPresent: storyPresentations.resourceCatalog.portraits.recordsPresent,
        directlyReferencedPortraitIds:
          storyPresentations.resourceCatalog.portraits.directlyReferencedIds.length,
        paletteCorrectRenderedRecords:
          storyPresentations.resourceCatalog.portraits.renderedRecordCount,
        genericRendererMissingRecordRecovered: 63,
        metadataMissingIds: storyPresentations.portraitMetadata.missingIds,
        status: "all portrait records recovered with native per-plane pointer semantics",
      };
    }
    if (storyPresentations !== null && fileName === "MAGIC.SWF") {
      row.nativeStoryPresentation = {
        stageRixRecords:
          storyPresentations.resourceCatalog.audio.map((entry) => entry.key),
        status: "module-25 stage-story RIX selection and start/stop boundary closed",
      };
    }
    if (feedbackPresentations !== null && fileName === "A.SWF") {
      row.nativeFeedbackPresentation = {
        windowGraphicRecord: 18,
        renderedWindowFrames:
          feedbackPresentations.battleFeedbackWrapper.windowResource.frameCount,
        roles: ["victory", "retreat", "defeat", "quit", "contextual battle line"],
        machineData: "reverse/parsed/native/feedback-presentations.json",
      };
    }
    if (feedbackPresentations !== null && fileName === "D.SWF") {
      row.nativeFeedbackPresentation = {
        portraitRecords: [45, 46],
        victoryPortraitSelection: "PIT channel-0 bit 0 selects D/45 or D/46",
        fixedNiaPromptTypes: ["retreat", "defeat", "quit"],
        paletteCorrectRendersPresent: true,
      };
    }
    if (feedbackPresentations !== null && fileName === "MAGIC.SWF") {
      row.nativeFeedbackPresentation = {
        perBig5CharacterSpeechRecords:
          feedbackPresentations.outcomeText.speech.clips.map((entry) => entry.record),
        keyAndDeploymentDismissalRecord:
          feedbackPresentations.menus.confirmation.keyAudio.record,
        speechSelectionRule:
          feedbackPresentations.outcomeText.speech.selectionRule,
        status: "speech VOC bank and key/dismissal sound request points closed",
      };
    }
    if (feedbackPresentations !== null && fileName === "UN.SWF") {
      row.nativeFeedbackPresentation = {
        deploymentErrorFontCodeRecord: 39,
        deploymentErrorFontGlyphRecord: 40,
        deploymentErrorFontGlyphs:
          feedbackPresentations.deploymentErrorFeedback.font.glyphCount,
        reachableDeploymentMessages:
          feedbackPresentations.deploymentErrorFeedback.messages
            .filter((entry) => entry.reachable).length,
        allReachableMessageGlyphsResolved:
          feedbackPresentations.deploymentErrorFeedback.font
            .allReachableMessageGlyphsResolved,
      };
    }
    if (hudPresentations !== null && fileName === "A.SWF") {
      row.nativeUnitDetailHud = {
        statusGraphicRecord: 17,
        statusFrames: hudPresentations.statuses.resource.frames,
        frameDimensions: hudPresentations.statuses.resource.dimensions,
        transparentMask: hudPresentations.statuses.resource.transparentMask,
        slotOrder: hudPresentations.statuses.slots.map((slot) => slot.id),
        machineData: "reverse/parsed/native/hud-presentations.json",
      };
    }
    if (hudPresentations !== null && fileName === "D.SWF") {
      row.nativeUnitDetailHud = {
        dynamicRequestField: hudPresentations.portrait.requestField,
        frame: hudPresentations.portrait.frame,
        origin: hudPresentations.portrait.origin,
        frameDimensions: hudPresentations.portrait.dimensions,
        mappingBoundary: hudPresentations.portrait.mappingBoundary,
        representativeLayoutSample: hudPresentations.portrait.representativeOnly.resource,
        machineData: "reverse/parsed/native/hud-presentations.json",
      };
    }
    if (fileName === "MAGIC.SWF") {
      row.nativeTechniqueAssociations = {
        linkedActionGroups:
          Object.keys(techniqueRules?.rules?.confirmedPresentationRecords ?? {}).length,
        playerTechniqueMenuClasses:
          techniqueRules?.techniqueMenu?.classes?.length ?? 0,
        nativeTechniqueDispatchEntries:
          techniqueRules?.dispatchTable?.entries?.length ?? 0,
        status: "all_player_technique_resource_timing_and_settlement_links_confirmed",
      };
    }
    if (combatPresentations !== null && fileName === "E.SWF") {
      row.nativeOrdinaryCombatPresentation = {
        linkedDistinctRecords:
          combatPresentations?.resourceCatalog?.audioEntries?.length ?? 0,
        mapHitRecord: 38,
        fullScreenDeathRecord: 11,
        perClassVoiceSlots: 5,
        classRecords:
          combatPresentations?.fullScreenPresentation?.classRecordCount ?? 0,
        status: "map hit requests and full-screen V1..V5/death synchronization confirmed",
      };
    }
    if (combatPresentations !== null && fileName === "MAGIC.SWF") {
      row.nativeOrdinaryCombatPresentation = {
        mapDeathRecord: 12,
        renderedFrames:
          combatPresentations.resourceCatalog.graphicEntries
            .find((entry) => entry.key === "MAGIC/12")?.renderedFrames ?? 0,
        descriptorDraws:
          (combatPresentations.mapPresentation.death.phase1BeforeBoardErase?.length ?? 0) +
          (combatPresentations.mapPresentation.death.phase2AfterBoardErase?.length ?? 0),
        fixedWaitNativeTicks:
          combatPresentations.mapPresentation.death.fixedWaitNativeTicks ?? 0,
        status: "six pre-erase and nine post-erase descriptors confirmed",
      };
    }
    if (combatPresentations !== null && fileName === "UN.SWF") {
      row.nativeOrdinaryCombatPresentation = {
        mapHitRecord: 62,
        renderedFrames:
          combatPresentations.resourceCatalog.graphicEntries
            .find((entry) => entry.key === "UN/62")?.renderedFrames ?? 0,
        graphicDrawsIncludingReturnFrame:
          combatPresentations.mapPresentation.hit.totalGraphicFrames ?? 0,
        fixedWaitNativeTicks:
          combatPresentations.mapPresentation.hit.fixedGraphicWaitNativeTicks ?? 0,
        status: "exact map-hit frame order confirmed",
      };
    }
    if (combatPresentations !== null && fileName === "M_00.SWF") {
      const entries = combatPresentations.resourceCatalog.graphicEntries
        .filter((entry) => entry.group === "M_00");
      row.nativeOrdinaryCombatPresentation = {
        distinctReferencedRecords: entries.length,
        ordinaryClassDirectAndPlus50RecordsRendered:
          entries.filter((entry) =>
            (entry.record >= 0 && entry.record <= 34) ||
            (entry.record >= 50 && entry.record <= 84))
            .every((entry) => entry.renderedFrames > 0),
        magicSwordRequestedRecordsRemapped: [1, 51],
        specialUnreachableOrNonordinaryPlaceholdersPreserved: true,
      };
    }
    if (combatPresentations !== null && fileName === "Y_00.SWF") {
      const entries = combatPresentations.resourceCatalog.graphicEntries
        .filter((entry) => entry.group === "Y_00");
      row.nativeOrdinaryCombatPresentation = {
        distinctReferencedRecords: entries.length,
        ordinaryClassDirectAndPlus50RecordsRendered:
          entries.filter((entry) =>
            (entry.record >= 0 && entry.record <= 34) ||
            (entry.record >= 50 && entry.record <= 84) ||
            entry.record === 41 || entry.record === 42)
            .every((entry) => entry.renderedFrames > 0),
        magicSwordRemapRecords: [41, 42],
        status: "direct, plus50, and two explicit remap roles confirmed",
      };
    }
    if (shootingPresentations !== null && fileName === "E.SWF") {
      row.nativeShootingPresentation = {
        swiftDragonAiEvasionRecord: 38,
        soundRequests:
          shootingPresentations.swiftDragonEvasion?.ai?.soundRequests ?? 0,
        fixedWaitNativeTicks:
          shootingPresentations.swiftDragonEvasion?.ai?.fixedGraphicWaitNativeTicks ?? 0,
        status: "AI swift-dragon evasion reuses ordinary map-hit audio while player evasion is silent",
      };
    }
    if (shootingPresentations !== null && fileName === "MAGIC.SWF") {
      const entry = shootingPresentations.resourceCatalog?.audioEntries
        ?.find((item) => item.key === "MAGIC/83");
      row.nativeShootingPresentation = {
        magicArcherLineAudioRecord: 83,
        durationSeconds: entry?.durationSeconds ?? null,
        sampleRate: entry?.sampleRate ?? null,
        status: "line-effect audio request before growth pass confirmed",
      };
    }
    if (shootingPresentations !== null && fileName === "UN.SWF") {
      const entry = shootingPresentations.resourceCatalog?.graphicEntries
        ?.find((item) => item.key === "UN/60");
      row.nativeShootingPresentation = {
        commonAndLineGraphicRecord: 60,
        renderedFrames: entry?.renderedFrames ?? 0,
        commonImpactDraws:
          shootingPresentations.commonImpact?.timeline?.drawCount ?? 0,
        commonImpactFixedWaitNativeTicks:
          shootingPresentations.commonImpact?.timeline?.fixedGraphicWaitNativeTicks ?? 0,
        lineDescriptorStages:
          shootingPresentations.lineEffect?.descriptors?.length ?? 0,
        lineFinishSteps:
          shootingPresentations.lineEffect?.timing?.finishSteps ?? 0,
        swiftDragonAiEvasionGraphicRecord: 62,
        status: "UN/60 common impact and line trail plus UN/62 AI evasion reuse confirmed",
      };
    }
    if (techniquePresentations !== null && fileName === "E.SWF") {
      const mainRecords = techniquePresentations.resourceCatalog.audioEntries
        .filter((entry) => entry.group === "E")
        .map((entry) => entry.record);
      const remainingRecords = (remainingTechniquePresentations?.resourceCatalog?.audioEntries ?? [])
        .filter((entry) => entry.group === "E")
        .map((entry) => entry.record);
      row.nativeTechniquePresentation = {
        linkedRecords: [...new Set([...mainRecords, ...remainingRecords])].sort((a, b) => a - b),
        mainFamilies: ["lightning", "fire", "heal", "recovery"],
        remainingRoles: ["defense-down", "attack-down", "poison"],
        status: "VOC request points and presentation-before-settlement boundaries confirmed",
      };
    }
    if (techniquePresentations !== null && fileName === "MAGIC.SWF") {
      const mainGraphicRecords = techniquePresentations.resourceCatalog.graphicEntries
        .filter((entry) => entry.group === "MAGIC").length;
      const remainingGraphicRecords =
        (remainingTechniquePresentations?.resourceCatalog?.graphicEntries ?? [])
          .filter((entry) => entry.group === "MAGIC").length;
      const linkedAudioRecords = [
        ...techniquePresentations.resourceCatalog.audioEntries,
        ...(remainingTechniquePresentations?.resourceCatalog?.audioEntries ?? []),
      ].filter((entry) => entry.group === "MAGIC")
        .map((entry) => entry.record)
        .sort((a, b) => a - b);
      row.nativeTechniquePresentation = {
        mainFamilies: Object.keys(techniquePresentations.presentations ?? {}).length,
        mainActions: Object.values(techniquePresentations.presentations ?? {}).reduce(
          (total, presentation) =>
            total + (presentation.actions?.length ?? presentation.actionCodes?.length ?? 0),
          0,
        ),
        remainingActions: remainingTechniquePresentations?.closure?.actionCount ?? 0,
        linkedGraphicRecords: mainGraphicRecords + remainingGraphicRecords,
        linkedAudioRecords,
        verifiedCodeSignatures:
          (techniquePresentations.verifiedCodeSignatures?.length ?? 0) +
          (remainingTechniquePresentations?.verifiedCodeSignatures?.length ?? 0),
        verifiedDataSignatures:
          (techniquePresentations.verifiedDataSignatures?.length ?? 0) +
          (remainingTechniquePresentations?.verifiedDataSignatures?.length ?? 0),
        contactSheets:
          (techniquePresentations.resourceCatalog.contactSheets?.length ?? 0) +
          (remainingTechniquePresentations?.resourceCatalog?.contactSheets?.length ?? 0),
        status: "all player-accessible technique presentations closed",
      };
    }
    if (techniquePresentations !== null && fileName === "UN.SWF") {
      const mainGraphicRecords = techniquePresentations.resourceCatalog.graphicEntries
        .filter((entry) => entry.group === "UN").map((entry) => entry.record);
      const remainingGraphicRecords =
        (remainingTechniquePresentations?.resourceCatalog?.graphicEntries ?? [])
          .filter((entry) => entry.group === "UN").map((entry) => entry.record);
      const mainAudioRecords = techniquePresentations.resourceCatalog.audioEntries
        .filter((entry) => entry.group === "UN").map((entry) => entry.record);
      const remainingAudioRecords =
        (remainingTechniquePresentations?.resourceCatalog?.audioEntries ?? [])
          .filter((entry) => entry.group === "UN").map((entry) => entry.record);
      row.nativeTechniquePresentation = {
        linkedGraphicRecords:
          [...mainGraphicRecords, ...remainingGraphicRecords].sort((a, b) => a - b),
        linkedAudioRecords:
          [...mainAudioRecords, ...remainingAudioRecords].sort((a, b) => a - b),
        roles: ["single-heal", "ice-cycle", "attack-up", "magic-defense", "dispel"],
        status: "graphic frames, VOC requests, waits and settlement ordering confirmed",
      };
    }
    if (fileName === "B.SWF") {
      row.parsedBattleTemplates = {
        normalStages: battleTemplates?.normalStageCount ?? battleTemplates?.stageCount ?? 0,
        mappedStageEntries: battleTemplates?.stageCount ?? 0,
        specialOrAlternateStageEntries: battleTemplates?.specialOrAlternateStageCount ?? 0,
        templateBytes: battleTemplates?.stages?.[0]?.bytes ?? 0,
        defeatObjectiveEntries: battleObjectives?.tables?.defeat?.entryCount ?? 0,
        victoryObjectiveEntries: battleObjectives?.tables?.victory?.entryCount ?? 0,
        classifiedObjectiveEntries: battleObjectives?.semanticCoverage?.classifiedEntries ?? 0,
        allObjectiveEntriesClassified:
          battleObjectives?.semanticCoverage?.allEntriesClassified ?? false,
        interactiveDeploymentStages:
          battleLifecycle?.deployment?.interactiveStageCount ?? 0,
        directWriteDeploymentStages:
          battleLifecycle?.deployment?.directWriteStageCount ?? 0,
        mappedDeploymentCells:
          battleLifecycle?.deployment?.totalOpenCells ?? 0,
        verifiedLifecycleCodeSignatures:
          battleLifecycle?.verifiedCodeSignatures?.length ?? 0,
        ordinaryBattleLifecycleClosed:
          battleLifecycle?.validation?.fullOrdinaryBattleLifecycleClosed ?? false,
        stage37Objective: battleObjectives?.confirmedStage37Objective ?? null,
        perStageBattleEvents: {
          dispatcherHandlers:
            stageEvents?.module29BattleRuntime?.dispatcher?.handlerCount ?? 0,
          verifiedCodeAndDataRanges:
            stageEvents?.validation?.verifiedRangeCount ?? 0,
          structurallyClosedHandlers:
            stageEvents?.validation?.structurallyClosedHandlerCount ?? 0,
          handlerDialogueRecords:
            stageEvents?.validation?.handlerDialogueRecordCount ?? 0,
          closedStages:
            stageEvents?.module29BattleRuntime?.handlerBehaviorCatalog?.handlerStages ?? [],
          closedDynamicBoardStages:
            stageEvents?.validation?.dynamicBoardScenesClosed ?? [],
          closedOtherRuntimeStateStages:
            stageEvents?.validation?.otherRuntimeStateScenesClosedMechanically ?? [],
          stage21Role: "scripted four-scout interlude that resolves immediately and enters stage-22 deployment",
          stage22Role: "round-1 ambush that adds six side-2 units; slot 28 is the only required victory target",
          stage37Role: "three-part final boss; round-1 SAY 81 and victory route through stage 49/modules 33/35",
          stage38Role: "postgame otherworld rematch; SAY 164/165 followed by module-46 terminal credits and a non-returning The-end loop",
          stage42Role: "immediate-victory portal presentation followed by the deployment-story-battle stage-6 bridge",
          presentation: {
            verifiedCodeSignatures:
              stagePresentations?.validation?.codeSignatures ?? 0,
            verifiedDataSignatures:
              stagePresentations?.validation?.dataSignatures ?? 0,
            closedTimelineStages:
              stagePresentations?.validation?.specialTimelineStagesClosed ?? [],
            movementVocClosed:
              stagePresentations?.validation?.movementVocClosed ?? false,
            stage30ContextualTextClosed:
              stagePresentations?.validation?.stage30ContextualTextClosed ?? false,
            machineData: "reverse/parsed/native/stage-presentations.json",
          },
          machineData: "reverse/parsed/native/stage-events.json",
        },
        postgamePresentation: {
          verifiedCodeAndDataRanges:
            endingPresentations?.validation?.verifiedRangeCount ?? 0,
          verifiedDirectResources:
            endingPresentations?.validation?.verifiedResourceCount ?? 0,
          reachableRosterCards:
            endingPresentations?.validation?.reachableRosterCards ?? 0,
          conditionalEpilogueTexts:
            endingPresentations?.validation?.epilogueTextBlocks ?? 0,
          creditRoleFrames:
            endingPresentations?.validation?.creditRoleFrames ?? 0,
          creditNameFrames:
            endingPresentations?.validation?.creditNameFrames ?? 0,
          module46NormalReturnReachable:
            endingPresentations?.validation?.module46NormalReturnReachable ?? null,
          machineData: "reverse/parsed/native/ending-presentations.json",
        },
        confirmedFullMapRenders: battleMapRenders?.stageCount ?? 0,
        confirmedTerrainMinimapRenders: battleMinimapRenders?.stageCount ?? 0,
        confirmedOccupancyMinimapRenders:
          battleMinimapOccupancyRenders?.stageCount ?? 0,
        verifiedMinimapCodeSignatures:
          minimapRules?.verifiedCodeSignatures?.length ?? 0,
        confirmedTerrainTileGeometry:
          "128 tokens x 40x44 pixels; 220 bytes per VGA plane per tile",
        status: "all_39_normal_and_5_special_or_alternate_stage_entries parsed/rendered; all objective entries classified; all 38 native per-stage handlers, routes, and nine special-stage presentation timelines closed",
      };
    }
    if (/^WAR[0-4]\.TST$/.test(fileName)) {
      const decodedSave = decodedSaveByName.get(fileName);
      row.status = "save_slot_decoded";
      row.saveState = {
        role: "confirmed_numbered_save_slot",
        initialHeaderScanBytes: 50,
        slotListMetadataOffsets: [0x12, 0x14, 0x16, 0x18, 0x1e],
        decodedBytes: decodedSave?.decoded?.decompressedBytes ?? 0,
        activeUnitInstances: decodedSave?.state?.activeUnitCount ?? 0,
        specialRecord35To38Instances: decodedSave?.state?.specialRecord35To38Instances?.length ?? 0,
        viewportState: decodedSave?.state?.viewportState ?? null,
        nativeMinimapReconstruction:
          saveMinimapRenders?.entries?.some((entry) => entry.slot === Number.parseInt(fileName[3], 10)) ?? false,
        victoryOutcomeSentinels: {
          liveMemory: 999,
          serializedCompletedVictory: 1000,
          loadedCompletedVictorySkipsRepeatedSavePrompt: true,
        },
        compatibilityStateAudit: {
          verifiedCodeSignatures: saveStateSemantics?.verifiedCodeSignatures?.length ?? 0,
          dynamicWord04BehaviorClosed:
            saveStateSemantics?.dynamicRecord?.preservedUnknownWord04?.reproductionRule !== undefined,
          dynamicWord06BehaviorClosed:
            saveStateSemantics?.dynamicRecord?.preservedUnknownWord06?.reproductionRule !== undefined,
          nativeTimerWaitFlagBound:
            saveStateSemantics?.tailState?.nativeTimerWaitEnabled?.nativeAddress === "DS:111D",
          genericMenuStateBound:
            saveStateSemantics?.tailState?.genericBattleMenuState?.nativeAddress === "DS:3DCA",
        },
        reliabilityAudit: {
          nativeSampleVerified:
            saveRobustness?.samples?.some((sample) => sample.fileName === fileName) ?? false,
          explicitFormatVersion: saveRobustness?.formatIdentity?.explicitVersionField ?? null,
          checksum: saveRobustness?.formatIdentity?.checksum ?? null,
          deterministicContinuation:
            saveRobustness?.deterministicReplay?.deterministicContinuationFromTstAlone ?? null,
          safeImporterPolicyMachineSpecified:
            (saveRobustness?.safeImporterPolicy?.structuralFatalChecks?.length ?? 0) === 5,
        },
        fullLayout: "confirmed_byte_layout_and_runtime_compatibility_behavior; a few original source-level names are unrecoverable",
      };
    }
    if (fileName === "JUST.TST") {
      const decodedSave = decodedSaveByName.get(fileName);
      row.status = "next_battle_state_template_decoded";
      row.saveState = {
        role: "confirmed_next_battle_state_template_regenerated_by_module27",
        nativeLoader: "module29 1000:5386",
        decodedBytes: decodedSave?.decoded?.decompressedBytes ?? 0,
        activeUnitInstances: decodedSave?.state?.activeUnitCount ?? 0,
        freshBattleSelector: "N",
        unfilledDeploymentMarker: 0xff,
        remainingDeploymentMarkersBecomeEmptyAtBattleLoad: true,
        reliabilityAudit: {
          nativeSampleVerified:
            saveRobustness?.samples?.some((sample) => sample.fileName === fileName) ?? false,
          explicitFormatVersion: saveRobustness?.formatIdentity?.explicitVersionField ?? null,
          checksum: saveRobustness?.formatIdentity?.checksum ?? null,
          safeImporterPolicyMachineSpecified:
            (saveRobustness?.safeImporterPolicy?.structuralFatalChecks?.length ?? 0) === 5,
        },
        fullLayout: "confirmed template-specific layout",
      };
    }
    if (fileName === "AG2.JS3") {
      row.status = js3Config?.validation?.trailingLengthMarkerValid &&
        js3Config?.shippedModeSemanticAudit?.deviceToSet1ToGameSemanticPipelineClosed ?
        "joymouse_input_configuration_and_shipped_device_translation_verified" :
        "joymouse_input_configuration_invalid_or_unverified";
      row.joymouseConfiguration = {
        bytes: js3Config?.bytes ?? 0,
        configVersionWord: js3Config?.configVersionWord ?? null,
        emulationMode: js3Config?.emulationMode ?? null,
        trailingLengthMarkerValid:
          js3Config?.validation?.trailingLengthMarkerValid ?? false,
        nativeKeyTableEntries:
          js3Config?.nativeKeyTranslation?.recordCount ?? 0,
        verifiedNativeSignatures:
          js3Config?.verifiedNativeSignatures?.length ?? 0,
        shippedActionsVerified:
          js3Config?.shippedModeSemanticAudit?.entries?.length ?? 0,
        shippedDeviceToSemanticPipelineClosed:
          js3Config?.shippedModeSemanticAudit?.deviceToSet1ToGameSemanticPipelineClosed ?? false,
        role: "input_device_configuration_not_game_progress",
      };
    }
    if (fileName === "PLAY.COM" && passwordFlow !== null) {
      row.status = "go_launcher_and_password_fixed_challenge_patch_parsed";
      row.passwordPatch = {
        hookedInterrupt: passwordFlow?.playLauncherPatch?.hookedInterrupt ?? null,
        targetAddress: passwordFlow?.playLauncherPatch?.targetAddress ?? null,
        fixedChallengeIndex:
          passwordFlow?.playLauncherPatch?.fixedChallengeIndex ?? null,
        fixedAnswer:
          passwordFlow?.playLauncherPatch?.fixedChallenge?.expectedAnswer ?? null,
        defaultChoiceMatchesFixedAnswer:
          passwordFlow?.playLauncherPatch?.defaultChoiceMatchesFixedAnswer ?? false,
      };
    }
    files.push(row);
  }

  const indexed = files.filter((file) => file.indexedContainer !== undefined);
  const streamFiles = files.filter((file) => file.embeddedStreams !== undefined);
  const renderFiles = files.filter((file) => file.planarPreview !== undefined);
  const summary = {
    referenceFiles: files.length,
    indexedContainers: indexed.length,
    indexedPresentRecords: indexed.reduce(
      (total, file) => total + file.indexedContainer.presentRecords,
      0,
    ),
    extractedIndexedRecords: indexed.reduce(
      (total, file) => total + file.indexedContainer.extractedRecords,
      0,
    ),
    decodedEmbeddedStreams: streamFiles.reduce(
      (total, file) => total + file.embeddedStreams.decodedStreams,
      0,
    ),
    decodedEmbeddedBytes: streamFiles.reduce(
      (total, file) => total + file.embeddedStreams.unpackedBytes,
      0,
    ),
    planarPreviewImages: renderFiles.reduce(
      (total, file) => total + file.planarPreview.renderedImages,
      0,
    ),
    mappedBig5Glyphs: mappedFont?.glyphs ?? 0,
    mappedBig5GlyphAtlases: mappedFont?.records ?? 0,
    additionalRawGlyphs: rawFont?.glyphs ?? 0,
    additionalRawGlyphAtlases: rawFont?.records ?? 0,
    reconstructedRuntimeModules: runtimeModules?.moduleCount ?? 0,
    reconstructedRuntimeModuleBlocks: runtimeModules?.totalBlocks ?? 0,
    reconstructedRuntimeImageBytes: runtimeModules?.totalImageBytes ?? 0,
    lzexeUnpackedRuntimeModules: lzexeModules?.moduleCount ?? 0,
    lzexeUnpackedRuntimeImageBytes: lzexeModules?.totalUnpackedBytes ?? 0,
    recoveredRuntimeRelocations: lzexeModules?.totalRelocationCount ?? 0,
    auditedNativeTimerRuntimeModules:
      nativeTiming?.moduleCoverage?.auditedModules?.length ?? 0,
    nativeTimerPitDivisor: nativeTiming?.pit?.divisor ?? null,
    nativeTimerNominalHz: nativeTiming?.pit?.nominalIrqHz ?? null,
    nativeTimerNominalMilliseconds:
      nativeTiming?.pit?.nominalIrqMilliseconds ?? null,
    webLogicalTickMilliseconds:
      nativeTiming?.fidelityContract?.webLogicalTickMilliseconds ?? null,
    nativeTimerAllReleasedModulesClosed:
      nativeTiming?.closure?.allReleasedRuntimeModulesUseSameNominalTick ?? false,
    phase1EvidenceRows: phase1Audit?.evidenceRegister?.rows ?? 0,
    phase1ConfirmedRows: phase1Audit?.evidenceRegister?.confirmedRows ?? 0,
    phase1MixedRows: phase1Audit?.evidenceRegister?.mixedRows ?? 0,
    phase1ImplementationRequiredUnknowns:
      phase1Audit?.implementationRequiredUnknowns?.length ?? 0,
    nativeUnitDisplayNames: unitDescriptors?.nameAgreementRecords ?? 0,
    verifiedUnitDescriptorCodeSignatures:
      unitDescriptors?.verifiedCodeSignatures?.length ?? 0,
    nativePromotionEdges: promotionTable?.edgeCount ?? 0,
    verifiedPromotionCodeSignatures:
      promotionTable?.verifiedCodeSignatures?.length ?? 0,
    consolidatedNativeUnitCatalogRecords:
      unitCatalog?.recordCount ?? 0,
    unitCatalogGuideExperienceValuesValidated:
      unitCatalog?.validation?.guideExperienceTransformValues ?? 0,
    unitCatalogGuideOtherValuesValidated:
      unitCatalog?.validation?.guideUnchangedFieldValues ?? 0,
    unitCatalogAiClassDispatchRecords:
      (unitCatalog?.recordCount ?? 0) -
      (unitCatalog?.validation?.recordsWithUnresolvedAiClassDispatch ?? 0),
    parsedNormalBattleTemplates:
      battleTemplates?.normalStageCount ?? battleTemplates?.stageCount ?? 0,
    mappedBattleStageEntries: battleTemplates?.stageCount ?? 0,
    specialOrAlternateBattleStageEntries:
      battleTemplates?.specialOrAlternateStageCount ?? 0,
    defeatObjectiveEntries: battleObjectives?.tables?.defeat?.entryCount ?? 0,
    victoryObjectiveEntries: battleObjectives?.tables?.victory?.entryCount ?? 0,
    classifiedObjectiveEntries: battleObjectives?.semanticCoverage?.classifiedEntries ?? 0,
    verifiedStageEventCodeAndDataRanges:
      stageEvents?.validation?.verifiedRangeCount ?? 0,
    nativePerStageBattleEventHandlers:
      stageEvents?.module29BattleRuntime?.dispatcher?.handlerCount ?? 0,
    structurallyClosedPerStageBattleEventHandlers:
      stageEvents?.validation?.structurallyClosedHandlerCount ?? 0,
    handlerDialogueRecordCount:
      stageEvents?.validation?.handlerDialogueRecordCount ?? 0,
    module25StageStoryTableEntries:
      stageEvents?.validation?.module25StoryTableEntries ?? 0,
    closedDynamicStageEvents:
      stageEvents?.validation?.dynamicBoardScenesClosed ?? [],
    closedPerStageBattleEvents:
      stageEvents?.module29BattleRuntime?.handlerBehaviorCatalog?.handlerStages ?? [],
    closedOtherRuntimeStateStageEvents:
      stageEvents?.validation?.otherRuntimeStateScenesClosedMechanically ?? [],
    verifiedStagePresentationCodeSignatures:
      stagePresentations?.validation?.codeSignatures ?? 0,
    verifiedStagePresentationDataSignatures:
      stagePresentations?.validation?.dataSignatures ?? 0,
    closedSpecialStagePresentationTimelines:
      stagePresentations?.validation?.specialTimelineStagesClosed ?? [],
    nativeSpecialStagePresentationsClosed:
      stagePresentations?.validation?.codeSignatures === 21 &&
      stagePresentations?.validation?.dataSignatures === 2 &&
      stagePresentations?.validation?.handlerCoverage === 38 &&
      stagePresentations?.validation?.specialTimelineStagesClosed?.length === 9 &&
      stagePresentations?.validation?.movementVocClosed === true &&
      stagePresentations?.validation?.stage30ContextualTextClosed === true &&
      stagePresentations?.validation?.implementationFrozen === true,
    verifiedEndingPresentationRanges:
      endingPresentations?.validation?.verifiedRangeCount ?? 0,
    verifiedEndingPresentationResources:
      endingPresentations?.validation?.verifiedResourceCount ?? 0,
    reachablePostgameRosterCards:
      endingPresentations?.validation?.reachableRosterCards ?? 0,
    conditionalEpilogueTextBlocks:
      endingPresentations?.validation?.epilogueTextBlocks ?? 0,
    terminalCreditRoleFrames:
      endingPresentations?.validation?.creditRoleFrames ?? 0,
    terminalCreditNameFrames:
      endingPresentations?.validation?.creditNameFrames ?? 0,
    module46NormalReturnReachable:
      endingPresentations?.validation?.module46NormalReturnReachable ?? null,
    verifiedTitleFlowRanges:
      titleFlow?.validation?.verifiedRangeCount ?? 0,
    nativeTitleMenuOptions:
      titleFlow?.titleMenu?.options?.length ?? 0,
    nativeDifficultyOptions:
      titleFlow?.difficultyMenu?.options?.length ?? 0,
    nativeContinueSlots:
      titleFlow?.continueMenu?.hitboxes?.length ?? 0,
    titleNewContinueFlowClosed:
      titleFlow?.validation?.titleOptionsClosed === true &&
      titleFlow?.validation?.difficultyValuesAndVisibleLabelsClosed === true &&
      titleFlow?.validation?.newGameRoutingClosed === true &&
      titleFlow?.validation?.continueRoutingClosed === true &&
      titleFlow?.validation?.directTitleResourceRecordsClosed === true,
    verifiedTitlePresentationCodeSignatures:
      titlePresentations?.verifiedCodeSignatures?.length ?? 0,
    verifiedTitlePresentationDataSignatures:
      titlePresentations?.verifiedDataSignatures?.length ?? 0,
    nativeTitlePresentationGraphicRecords:
      titlePresentations?.resourceCatalog?.graphicRecordCount ?? 0,
    nativeTitlePresentationAudioRecords:
      titlePresentations?.resourceCatalog?.audioRecordCount ?? 0,
    paletteCorrectTitlePresentationRenders:
      titlePresentations?.resourceCatalog?.paletteCorrectRenderCount ?? 0,
    nativeTitlePresentationContactSheets:
      titlePresentations?.resourceCatalog?.contactSheets?.length ?? 0,
    nativeIntroNarrativeLines:
      titlePresentations?.intro?.counts?.narrativeLines ?? 0,
    nativeIntroBackgroundTransitions:
      titlePresentations?.intro?.backgroundTransition?.transitionCount ?? 0,
    nativeIntroFixedWaitTicks:
      titlePresentations?.intro?.scroll?.fixedWaitNativeTicks ?? 0,
    nativeTitlePresentationTimelineClosed:
      titlePresentations?.closure?.pretitleTimelineClosed === true &&
      titlePresentations?.closure?.introTimelineClosed === true &&
      titlePresentations?.closure?.titleTimelineClosed === true &&
      titlePresentations?.closure?.titleDifficultyContinueMenuPresentationClosed === true,
    verifiedStoryPresentationCodeSignatures:
      storyPresentations?.closure?.codeSignatureCount ?? 0,
    verifiedStoryPresentationDataSignatures:
      storyPresentations?.closure?.dataSignatureCount ?? 0,
    nativeStoryCommandScriptRecords:
      storyPresentations?.corpus?.commandScriptRecordCount ?? 0,
    nativeStoryTextOrLabelOnlyRecords:
      storyPresentations?.corpus?.textOrLabelOnlyRecordCount ?? 0,
    nativeClosedRouteStoryCommandScripts:
      (storyPresentations?.corpus?.module25UniqueStoryRecords?.length ?? 0) +
      (storyPresentations?.corpus?.module29HandlerDialogueRecords?.length ?? 0) -
      (storyPresentations?.corpus?.overlap?.length ?? 0),
    paletteCorrectStoryPresentationRenders:
      storyPresentations?.closure?.renderedImageCount ?? 0,
    nativeStoryPresentationContactSheets:
      storyPresentations?.closure?.contactSheetCount ?? 0,
    nativeStoryPresentationTimelineClosed:
      storyPresentations?.closure?.commandDispatchClosed === true &&
      storyPresentations?.closure?.module25StoryTimelineClosed === true &&
      storyPresentations?.closure?.module29BattleStoryTimelineClosed === true &&
      storyPresentations?.closure?.windowGeometryAndAnimationClosed === true &&
      storyPresentations?.closure?.backgroundAndPortraitResourceBindingsClosed === true,
    verifiedFeedbackPresentationCodeSignatures:
      feedbackPresentations?.closure?.codeSignatureCount ?? 0,
    verifiedFeedbackPresentationDataSignatures:
      feedbackPresentations?.closure?.dataSignatureCount ?? 0,
    nativeReachableDeploymentErrorMessages:
      feedbackPresentations?.deploymentErrorFeedback?.messages
        ?.filter((entry) => entry.reachable).length ?? 0,
    nativeBattleOutcomePrompts:
      Object.keys(feedbackPresentations?.handlers ?? {})
        .filter((key) => key !== "fixedCollapse").length,
    nativeFeedbackCreativeVoiceRecords:
      (feedbackPresentations?.outcomeText?.speech?.clips?.length ?? 0) +
      (feedbackPresentations?.menus?.confirmation?.keyAudio?.record === 81 ? 1 : 0),
    nativeFeedbackPresentationClosed:
      feedbackPresentations?.closure?.deploymentErrorStringsClosed === true &&
      feedbackPresentations?.closure?.deploymentErrorGeometryClosed === true &&
      feedbackPresentations?.closure?.outcomeStringsClosed === true &&
      feedbackPresentations?.closure?.outcomeWindowPortraitAndResourceBindingsClosed === true &&
      feedbackPresentations?.closure?.perCharacterSpeechSelectionClosed === true &&
      feedbackPresentations?.closure?.victoryRetreatDefeatQuitStateRoutesClosed === true &&
      feedbackPresentations?.closure?.numberedSaveSelectorClosed === true &&
      feedbackPresentations?.closure?.fixedCollapseReachabilityClosed === true &&
      feedbackPresentations?.closure?.module27KeySoundVisibleBindingClosed === true,
    verifiedPasswordFlowRanges:
      passwordFlow?.validation?.verifiedRangeCount ?? 0,
    nativePasswordChallenges:
      passwordFlow?.challengeReference?.coordinateCount ?? 0,
    nativePasswordVisibleColorButtons:
      passwordFlow?.passwordUi?.answerChoices?.buttonVisualsLeftToRight?.length ?? 0,
    nativePasswordDirectResources:
      passwordFlow?.validation?.directResourceCount ?? 0,
    passwordGateStateMachineClosed:
      passwordFlow?.validation?.sharedGateHandoffClosed === true &&
      passwordFlow?.validation?.threeAttemptUiClosed === true &&
      passwordFlow?.validation?.challengeCoordinatesAndAnswersClosed === true &&
      passwordFlow?.validation?.visibleColorButtonsClosed === true &&
      passwordFlow?.validation?.interruptVectorEncodingClosed === true &&
      passwordFlow?.validation?.playFixedChallengePatchClosed === true,
    verifiedBattleLifecycleCodeSignatures:
      battleLifecycle?.verifiedCodeSignatures?.length ?? 0,
    mappedBattleDeploymentStages:
      battleLifecycle?.deployment?.mappedStages ?? 0,
    interactiveBattleDeploymentStages:
      battleLifecycle?.deployment?.interactiveStageCount ?? 0,
    mappedBattleDeploymentCells:
      battleLifecycle?.deployment?.totalOpenCells ?? 0,
    ordinaryBattleLifecycleClosed:
      battleLifecycle?.validation?.fullOrdinaryBattleLifecycleClosed ?? false,
    verifiedInputUiCodeSignatures:
      inputUi?.validation?.verifiedCodeSignatureCount ?? 0,
    mappedDeploymentInputHitboxes:
      (inputUi?.validation?.deploymentRosterHitboxes ?? 0) +
      (inputUi?.validation?.deploymentControlHitboxes ?? 0),
    parsedBattleActionMenus:
      inputUi?.validation?.parsedActionMenus ?? 0,
    mappedBattleSidePanelHitboxes:
      inputUi?.validation?.parsedSidePanelHitboxes ?? 0,
    parsedBattleSidePanelActions:
      inputUi?.validation?.parsedSidePanelDispatches ?? 0,
    parsedBattleSettingsRows:
      inputUi?.validation?.parsedSettingsRows ?? 0,
    parsedPhysicalKeyboardBindingsPerModule:
      inputUi?.validation?.parsedPhysicalKeyboardBindingsPerModule ?? 0,
    physicalKeyboardTablesIdentical:
      inputUi?.validation?.physicalKeyboardTablesIdentical ?? false,
    releaseDeveloperShortcutGateDisabled:
      inputUi?.validation?.releaseDeveloperGateDisabled ?? false,
    battleInputUiRuleLayerClosed:
      inputUi?.validation?.allCodeSignaturesVerified === true &&
      inputUi?.validation?.physicalKeyboardTablesIdentical === true &&
      inputUi?.validation?.releaseDeveloperGateDisabled === true &&
      inputUi?.validation?.implementationFrozen === true,
    verifiedUnitDetailHudCodeSignatures:
      hudPresentations?.validation?.codeSignatures ?? 0,
    verifiedUnitDetailHudDataSignatures:
      hudPresentations?.validation?.dataSignatures ?? 0,
    nativeUnitDetailHudRectangles:
      hudPresentations?.validation?.parsedRectangles ?? 0,
    nativeUnitDetailHudStatRows:
      hudPresentations?.validation?.statRows ?? 0,
    nativeUnitDetailHudStatusSlots:
      hudPresentations?.validation?.statusSlots ?? 0,
    nativeUnitDetailHudStatusResources:
      hudPresentations?.validation?.statusResources ?? 0,
    nativeUnitDetailHudClosed:
      hudPresentations?.validation?.codeSignatures === 18 &&
      hudPresentations?.validation?.dataSignatures === 4 &&
      hudPresentations?.validation?.statRows === 5 &&
      hudPresentations?.validation?.statusSlots === 8 &&
      hudPresentations?.validation?.implementationFrozen === true,
    verifiedBattleRangePresentationCodeSignatures:
      rangePresentations?.validation?.codeSignatures ?? 0,
    verifiedBattleRangePresentationDataSignatures:
      rangePresentations?.validation?.dataSignatures ?? 0,
    nativeBattleRangeScratchBytes:
      rangePresentations?.validation?.boardBytes ?? 0,
    nativeVisibleMapEffectCells:
      rangePresentations?.validation?.visibleCells ?? 0,
    nativeBattleRangeDitherRetainedPixels:
      rangePresentations?.validation?.ditherRetainedPixels ?? 0,
    nativeBattleRangePresentationClosed:
      rangePresentations?.validation?.codeSignatures === 34 &&
      rangePresentations?.validation?.dataSignatures === 1 &&
      rangePresentations?.validation?.boardBytes === 2500 &&
      rangePresentations?.validation?.visibleCells === 70 &&
      rangePresentations?.validation?.ditherRetainedPixels === 440 &&
      rangePresentations?.validation?.ditherTotalPixels === 1760 &&
      rangePresentations?.validation?.implementationFrozen === true,
    verifiedCombatCodeSignatures: combatFormulas?.verifiedCodeSignatures?.length ?? 0,
    verifiedCombatPresentationCodeSignatures:
      combatPresentations?.verifiedCodeSignatures?.length ?? 0,
    verifiedCombatPresentationDataSignatures:
      combatPresentations?.verifiedDataSignatures?.length ?? 0,
    nativeCombatPresentationClassRecords:
      combatPresentations?.fullScreenPresentation?.classRecordCount ?? 0,
    nativeCombatPresentationGraphicRecords:
      combatPresentations?.resourceCatalog?.graphicEntries?.length ?? 0,
    nativeCombatPresentationAudioRecords:
      combatPresentations?.resourceCatalog?.audioEntries?.length ?? 0,
    nativeMapHitGraphicDraws:
      combatPresentations?.mapPresentation?.hit?.totalGraphicFrames ?? 0,
    nativeMapDeathDescriptors:
      (combatPresentations?.mapPresentation?.death?.phase1BeforeBoardErase?.length ?? 0) +
      (combatPresentations?.mapPresentation?.death?.phase2AfterBoardErase?.length ?? 0),
    nativeFullScreenVoiceSlotAgreementRecords:
      combatPresentations?.fullScreenPresentation?.sideVoiceSlotAgreementRecords ?? 0,
    verifiedShootingPresentationCodeSignatures:
      shootingPresentations?.verifiedCodeSignatures?.length ?? 0,
    verifiedShootingPresentationDataSignatures:
      shootingPresentations?.verifiedDataSignatures?.length ?? 0,
    nativeShootingPresentationGraphicRecords:
      shootingPresentations?.resourceCatalog?.graphicEntries?.length ?? 0,
    nativeShootingPresentationAudioRecords:
      shootingPresentations?.resourceCatalog?.audioEntries?.length ?? 0,
    nativeCommonShotGraphicDraws:
      shootingPresentations?.commonImpact?.timeline?.drawCount ?? 0,
    nativeCommonShotFixedGraphicWaitTicks:
      shootingPresentations?.commonImpact?.timeline?.fixedGraphicWaitNativeTicks ?? 0,
    nativeShootingPlayerAiEvasionPresentationVariants:
      shootingPresentations === null ? 0 :
        Number(shootingPresentations.swiftDragonEvasion?.player !== undefined) +
        Number(shootingPresentations.swiftDragonEvasion?.ai !== undefined),
    nativeLineEffectDescriptorStages:
      shootingPresentations?.lineEffect?.descriptors?.length ?? 0,
    nativeLineEffectFinishSteps:
      shootingPresentations?.lineEffect?.timing?.finishSteps ?? 0,
    verifiedTechniquePresentationCodeSignatures:
      techniquePresentations?.verifiedCodeSignatures?.length ?? 0,
    verifiedTechniquePresentationDataSignatures:
      techniquePresentations?.verifiedDataSignatures?.length ?? 0,
    nativeTechniquePresentationFamilies:
      Object.keys(techniquePresentations?.presentations ?? {}).length,
    nativeTechniquePresentationActions:
      Object.values(techniquePresentations?.presentations ?? {}).reduce(
        (total, presentation) =>
          total + (presentation.actions?.length ?? presentation.actionCodes?.length ?? 0),
        0,
      ),
    nativeTechniquePresentationGraphicRecords:
      techniquePresentations?.resourceCatalog?.graphicEntries?.length ?? 0,
    nativeTechniquePresentationAudioRecords:
      techniquePresentations?.resourceCatalog?.audioEntries?.length ?? 0,
    nativeTechniquePresentationContactSheets:
      techniquePresentations?.resourceCatalog?.contactSheets?.length ?? 0,
    verifiedRemainingTechniquePresentationCodeSignatures:
      remainingTechniquePresentations?.verifiedCodeSignatures?.length ?? 0,
    verifiedRemainingTechniquePresentationDataSignatures:
      remainingTechniquePresentations?.verifiedDataSignatures?.length ?? 0,
    nativeRemainingTechniquePresentationActions:
      remainingTechniquePresentations?.closure?.actionCount ?? 0,
    nativeRemainingTechniquePresentationGraphicRecords:
      remainingTechniquePresentations?.resourceCatalog?.graphicEntries?.length ?? 0,
    nativeRemainingTechniquePresentationAudioRecords:
      remainingTechniquePresentations?.resourceCatalog?.audioEntries?.length ?? 0,
    nativeRemainingTechniquePresentationContactSheets:
      remainingTechniquePresentations?.resourceCatalog?.contactSheets?.length ?? 0,
    nativePlayerTechniquePresentationsClosed:
      techniquePresentations !== null &&
      remainingTechniquePresentations?.closure?.actionCount === 15 &&
      remainingTechniquePresentations?.implementationFrozen === true,
    nativeStatusSlots: combatFormulas?.statusLifecycle?.slots?.length ?? 0,
    nativeStatusPointerRecordsPerSide:
      combatFormulas?.statusLifecycle?.decrement?.recordsPerTable ?? 0,
    nativePoisonFormula:
      combatFormulas?.statusLifecycle?.poison?.formula ?? null,
    nativeKillRewardEntries:
      combatFormulas?.experience?.killRewards?.entryCount ?? 0,
    nativePostThirdRowGrowthEntries:
      combatFormulas?.experience?.cumulativeProgression?.classSpecificTable?.entryCount ?? 0,
    verifiedTurnActionCodeSignatures:
      turnActions?.verifiedCodeSignatures?.length ?? 0,
    nativeAiClassPriorityEntries:
      turnActions?.aiScheduler?.priorityTable?.entryCount ?? 0,
    confirmedStage37ActionsPerEnemyPhase:
      turnActions?.stage37?.completedSpecialActionsPerEnemyPhaseWhileAllPartsSurvive ?? 0,
    nativeTechniqueMenuClasses:
      techniqueRules?.techniqueMenu?.classes?.length ?? 0,
    nativeTechniqueDispatchEntries:
      techniqueRules?.dispatchTable?.entries?.length ?? 0,
    confirmedShootingClasses:
      techniqueRules?.shooting?.classes?.length ?? 0,
    verifiedTechniqueCodeSignatures:
      techniqueRules?.verifiedCodeSignatures?.length ?? 0,
    linkedTechniquePresentationGroups:
      Object.keys(techniqueRules?.rules?.confirmedPresentationRecords ?? {}).length,
    nativeAiTechniquePoolClasses:
      aiRules?.techniqueSelection?.classes?.length ?? 0,
    nativeAiTechniqueActionEntries:
      aiRules?.actionTable?.entries?.length ?? 0,
    nativeAiTechniqueOrphanPoolCodes:
      aiRules?.anomalyRuntimeConsequence?.orphanPoolCodes ?? [],
    verifiedAiRuleCodeSignatures:
      aiRules?.verifiedCodeSignatures?.length ?? 0,
    verifiedAiRuleDataSignatures:
      aiRules?.verifiedDataSignatures?.length ?? 0,
    nativeAiTechniqueDialogueGroups:
      aiRules?.rules?.aiTechniquePresentation?.groups?.length ?? 0,
    nativeAiTechniqueDialogueBindings:
      aiRules?.rules?.aiTechniquePresentation?.actionBindings?.length ?? 0,
    nativeAiBehaviorActiveInstances:
      aiRules?.rules?.loadedDecisionInputs?.battleTemplateValidation?.activeInstances ?? 0,
    nativeAiBehaviorStaticDomain:
      aiRules?.rules?.loadedDecisionInputs?.battleTemplateValidation?.domain ?? [],
    logicalTerrainSlots: mapRules?.logicalTerrainSlots ?? 0,
    verifiedMapRuleCodeSignatures:
      mapRules?.verifiedCodeSignatures?.length ?? 0,
    nativeMovementProfileGroups:
      mapRules?.movementProfileGroups?.length ?? 0,
    nativeTerrainDefenseProfileGroups:
      mapRules?.terrainDefenseProfileGroups?.length ?? 0,
    mappedStageTerrainEntries: terrainTokenMap?.stageCount ?? 0,
    mappedRawTerrainTokens: terrainTokenMap?.allUsedTokens?.length ?? 0,
    mappedUsedLogicalTerrainSlots: terrainTokenMap?.usedLogicalSlots?.length ?? 0,
    confirmedBattleMapRenders: battleMapRenders?.stageCount ?? 0,
    confirmedTerrainMinimapRenders: battleMinimapRenders?.stageCount ?? 0,
    confirmedOccupancyMinimapRenders:
      battleMinimapOccupancyRenders?.stageCount ?? 0,
    confirmedNumberedSaveMinimapRenders:
      saveMinimapRenders?.entries?.length ?? 0,
    verifiedMinimapCodeSignatures:
      minimapRules?.verifiedCodeSignatures?.length ?? 0,
    verifiedMinimapDataSignatures:
      minimapRules?.verifiedDataSignatures?.length ?? 0,
    auditedTerrainDescriptorReadSites:
      terrainNameAudit?.descriptorTable?.verifiedReadSiteCount ?? 0,
    nativeTerrainVisibleNameBindingFound:
      terrainNameAudit?.conclusion?.visibleNameBindingFound ?? null,
    decodedSaveStates: decodedSaves?.files?.length ?? 0,
    decodedSaveStateBytes: (decodedSaves?.files ?? []).reduce(
      (total, file) => total + (file.decoded?.decompressedBytes ?? 0),
      0,
    ),
    decodedWarDynamicStateRecordsPerSide:
      decodedSaveByName.get("WAR0.TST")?.state?.dynamicUnitStates?.side1?.recordCount ?? 0,
    nativeWarDynamicStatePointerTablesVerified:
      (decodedSaveByName.get("WAR0.TST")?.state?.nativeWarDynamicStateLayout?.sides ?? [])
        .length === 2 &&
      (decodedSaveByName.get("WAR0.TST")?.state?.nativeWarDynamicStateLayout?.sides ?? [])
        .every((side) => side.arithmeticPointersVerified === true),
    verifiedSaveStateSemanticCodeSignatures:
      saveStateSemantics?.verifiedCodeSignatures?.length ?? 0,
    verifiedSaveStateSemanticDataSignatures:
      saveStateSemantics?.verifiedDataSignatures?.length ?? 0,
    verifiedSaveRobustnessCodeSignatures:
      (saveRobustness?.signatures ?? []).filter((signature) => signature.verified === true).length,
    verifiedNativeSaveRobustnessSamples:
      saveRobustness?.samples?.length ?? 0,
    verifiedSaveCorruptionCases:
      saveRobustness?.mutationCorpus?.length ?? 0,
    nativeSaveHasExplicitVersion:
      saveRobustness?.formatIdentity?.explicitVersionField ?? null,
    nativeSaveHasChecksum:
      saveRobustness?.formatIdentity?.checksum ?? null,
    nativeSaveSupportsDeterministicContinuation:
      saveRobustness?.deterministicReplay?.deterministicContinuationFromTstAlone ?? null,
    auditedRangeModeProducerWrites:
      mapRules?.semantics?.rangeBuilder?.producerAudit?.ghidraDirectReferenceCrossCheck?.totalWrites ?? 0,
    scriptedFmRangeModeProducers:
      mapRules?.semantics?.rangeBuilder?.producerAudit?.fm?.producers?.length ?? 0,
    decodedWarTailStates: (decodedSaves?.files ?? []).filter(
      (file) => file.state?.kind === "numbered_battle_save" && file.state?.tailState?.bytes === 772,
    ).length,
    warTailSide2SerializerCopiesVerified: (decodedSaves?.files ?? []).filter(
      (file) => file.state?.kind === "numbered_battle_save",
    ).every((file) => file.state?.tailState?.serializerOverlapArtifact?.copiesEqual === true),
    creativeVoiceWav: audio?.creativeVoiceRecords ?? 0,
    softstarRixRaw: audio?.softstarRixRecords ?? 0,
    softstarRixWav: audio?.decodedRixRecords ?? 0,
    parsedJoymouseConfigurations: js3Config === null ? 0 : 1,
    verifiedJoymouseNativeSignatures:
      js3Config?.verifiedNativeSignatures?.length ?? 0,
    nativeJoymouseKeyTableEntries:
      js3Config?.nativeKeyTranslation?.recordCount ?? 0,
    shippedJoymouseActionsVerified:
      js3Config?.shippedModeSemanticAudit?.entries?.length ?? 0,
    shippedJoymouseSemanticPipelineClosed:
      js3Config?.shippedModeSemanticAudit?.deviceToSet1ToGameSemanticPipelineClosed ?? false,
    sayScriptsParsed: 176,
    dataRecordsParsed: 39,
    mapRuleRecordsParsed: 39,
    unresolvedFiles: files.filter((file) =>
      file.status === "not_yet_decoded" || file.status?.includes("unresolved"),
    ).map(
      (file) => file.fileName,
    ),
  };
  return {
    format: "ANGEL2 resource extraction coverage",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    summary,
    files,
  };
}

function usage() {
  return "usage: angel2-inventory.mjs ANGEL2_DIR REVERSE_DIR OUTPUT.json";
}

async function main() {
  const [referenceDirectory, reverseDirectory, outputFile] = process.argv.slice(2);
  if (outputFile === undefined) {
    throw new Error(usage());
  }
  const inventory = await buildInventory(referenceDirectory, reverseDirectory);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(JSON.stringify(inventory.summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { buildInventory };
