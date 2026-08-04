import type { BattleUnit, DialoguePage } from "../types";

export type SpokenGroupCommandId = "allRest" | "followLeader" | "freeAction";

interface GroupCommandDialogueDefinition {
  selector: 0x1f | 0x20 | 0x21;
  address: `DS:${string}`;
  page: DialoguePage;
}

const commandPage = (
  selector: GroupCommandDialogueDefinition["selector"],
  address: GroupCommandDialogueDefinition["address"],
  text: string,
): GroupCommandDialogueDefinition => ({
  selector,
  address,
  page: {
    activeSlot: "upper",
    upper: { portrait: 46, speaker: "妮雅", text },
    source: { record: "battle-command", wait: selector, address },
  },
});

/**
 * Module 29 0000:6CE8/6D21/6D7D calls the contextual battle-line
 * presenter with selectors 1Fh/21h/20h before applying each command.
 */
export const GROUP_COMMAND_DIALOGUE: Readonly<Record<SpokenGroupCommandId, GroupCommandDialogueDefinition>> = {
  allRest: commandPage(
    0x1f,
    "DS:86E4",
    "大家聽著！\n所有還未行動的人在原地休息，補充體力．",
  ),
  followLeader: commandPage(
    0x21,
    "DS:873C",
    "大家聽著！\n所有還未行動的人跟著我來．",
  ),
  freeAction: commandPage(
    0x20,
    "DS:8716",
    "大家聽著！\n所有還未行動的人自由行動．",
  ),
};

export const groupCommandDialogueFor = (
  command: SpokenGroupCommandId,
  speaker?: Pick<BattleUnit, "name" | "portrait">,
): DialoguePage => {
  const page = GROUP_COMMAND_DIALOGUE[command].page;
  if (!speaker || !page.upper) return page;
  return {
    ...page,
    upper: {
      ...page.upper,
      portrait: speaker.portrait,
      speaker: speaker.name,
    },
  };
};
