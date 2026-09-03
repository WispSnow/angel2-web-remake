import type { ClassId } from "./classes";

export type ClassTraitId =
  | "swift-dragon-shooting-evasion"
  | "beast-knight-attack-down"
  | "bone-knight-full-counter"
  | "great-dragon-stomp"
  | "flying-dragon-extra-move"
  | "demon-dragon-buff-strip"
  | "great-axe-no-counter"
  | "magic-sword-defense-down"
  | "evil-sword-confusion"
  | "jungle-poison"
  | "magic-armor-mitigation"
  | "water-warrior-split"
  | "water-warrior-uniform-movement";

export interface ClassTrait {
  readonly id: ClassTraitId;
  readonly shortDescription: string;
  readonly description: string;
}

const TRAITS_BY_CLASS: Readonly<Partial<Record<ClassId, readonly ClassTrait[]>>> = {
  "swift-dragon-knight": [{
    id: "swift-dragon-shooting-evasion",
    shortDescription: "免疫物理射擊",
    description: "完全免疫弓箭、弩箭與水戰士射擊的傷害；魔弓兵屬魔法傷害，不在此列。",
  }],
  "beast-knight": [{
    id: "beast-knight-attack-down",
    shortDescription: "命中降攻",
    description: "普通攻擊命中後使目標攻擊力下降 20，持續 3 回合。",
  }],
  "bone-knight": [{
    id: "bone-knight-full-counter",
    shortDescription: "以牙還牙",
    description: "反擊必定造成「本次先攻的完整傷害」與普通反擊傷害中的較高者。",
  }],
  "great-dragon-knight": [{
    id: "great-dragon-stomp",
    shortDescription: "龍踏技術",
    description: "依技術階級使用龍踏、男踏或女踏；選定目標後傷害範圍內同陣營敵人。",
  }],
  "flying-dragon-knight": [{
    id: "flying-dragon-extra-move",
    shortDescription: "攻後再移動",
    description: "普通攻擊後若仍存活，可用目前移動力一半（向下取整）再次小範圍移動，不能再攻擊。",
  }],
  "demon-dragon-knight": [{
    id: "demon-dragon-buff-strip",
    shortDescription: "命中驅散增益",
    description: "主動普通攻擊命中後，清除目標的攻擊提升、防禦提升與防魔；本次傷害仍照舊計算。",
  }],
  "great-axe-warrior": [{
    id: "great-axe-no-counter",
    shortDescription: "攻擊無反擊",
    description: "普通攻擊不會觸發目標的反擊。",
  }],
  "magic-sword-warrior": [{
    id: "magic-sword-defense-down",
    shortDescription: "命中降防",
    description: "普通攻擊命中後使目標防禦力下降 20，持續 3 回合。",
  }],
  "evil-sword-warrior": [{
    id: "evil-sword-confusion",
    shortDescription: "命中混亂",
    description: "普通攻擊命中後施加與技術「混亂」相同的 3 回合狀態。",
  }],
  "jungle-warrior": [{
    id: "jungle-poison",
    shortDescription: "命中施毒",
    description: "普通攻擊命中後施加與技術「施毒」相同的 3 回合狀態；普通單位每輪生命減半，龍／頭／手降至三分之一。",
  }],
  "magic-armor-warrior": [{
    id: "magic-armor-mitigation",
    shortDescription: "殘血減傷",
    description: "受到的普通攻擊與反擊傷害，依已失去的生命比例減免，生命見底時最多減免 50%。",
  }],
  "water-warrior": [{
    id: "water-warrior-uniform-movement",
    shortDescription: "無視地形與阻擋",
    description: "移動時每一格一律只花 1 點，並可直接穿過敵我單位、不受敵方鄰格阻擋；只有本職業完全走不進的地形除外，落點仍必須是空格。",
  }, {
    id: "water-warrior-split",
    shortDescription: "近戰受擊分裂",
    description: "受到普通近戰攻擊且存活時，會在相鄰合法空格新增一個分裂體；全體共享生命，場上最多 4 個。",
  }],
};

export function classTraitsFor(classId: ClassId): readonly ClassTrait[] {
  return TRAITS_BY_CLASS[classId] ?? [];
}
