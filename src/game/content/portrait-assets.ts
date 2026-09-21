import type { DialoguePage, PortraitRecord } from "../types";
import type { StageDefinition, StageStoryId } from "./stages";
import { storyPagesForId } from "./dialogue";
import { PORTRAIT_CATALOG, type PortraitAnimationAssets } from "./portrait-catalog.generated";

export function portraitAssetUrls(record: PortraitRecord): readonly string[] {
  const entry = PORTRAIT_CATALOG[record];
  const animation: PortraitAnimationAssets | null = entry.animation;
  if (!animation) return [entry.source];
  return [
    entry.source,
    ...animation.eyes,
    ...animation.mouths,
    ...(animation.redEyes ? [animation.redEyes] : []),
  ];
}

export function portraitAssetUrlsForRecords(
  records: readonly PortraitRecord[],
): readonly string[] {
  const urls = new Set<string>();
  for (const record of records) {
    for (const url of portraitAssetUrls(record)) urls.add(url);
  }
  return [...urls].sort();
}

export function dialoguePortraitRecords(pages: readonly DialoguePage[]): readonly PortraitRecord[] {
  const records = new Set<PortraitRecord>();
  for (const page of pages) {
    if (page.upper?.portrait !== undefined) records.add(page.upper.portrait);
    if (page.lower?.portrait !== undefined) records.add(page.lower.portrait);
  }
  return [...records].sort((left, right) => left - right);
}

export function stageDialoguePortraitRecords(
  stage: Pick<StageDefinition, "stories">,
): readonly PortraitRecord[] {
  const storyIds = new Set<StageStoryId>();
  if (stage.stories.prebattle) storyIds.add(stage.stories.prebattle);
  if (stage.stories.opening) storyIds.add(stage.stories.opening);
  if (stage.stories.victory) storyIds.add(stage.stories.victory);
  for (const story of stage.stories.roundStarts) storyIds.add(story.storyId);
  for (const storyId of stage.stories.scripted ?? []) storyIds.add(storyId);
  return dialoguePortraitRecords([...storyIds].flatMap((storyId) => storyPagesForId(storyId)));
}
