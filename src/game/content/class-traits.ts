import type { ClassId } from "./classes";

export type ClassTraitId =
  | "swift-dragon-shooting-evasion"
  | "beast-knight-attack-down"
  | "bone-knight-full-counter"
  | "great-dragon-stomp"
  | "flying-dragon-extra-move"
  | "great-axe-no-counter"
  | "magic-sword-defense-down"
  | "evil-sword-confusion"
  | "jungle-poison"
  | "water-warrior-split";

export interface ClassTrait {
  readonly id: ClassTraitId;
  readonly shortDescription: string;
  readonly description: string;
}

const TRAITS_BY_CLASS: Readonly<Partial<Record<ClassId, readonly ClassTrait[]>>> = {
  "swift-dragon-knight": [{
    id: "swift-dragon-shooting-evasion",
    shortDescription: "約50%閃避弓箭",
    description: "受到弓箭、弩箭或魔弓射擊時，約 50% 機率完全閃避傷害。",
  }],
  "beast-knight": [{
    id: "beast-knight-attack-down",
    shortDescription: "命中降攻",
    description: "普通攻擊命中後使目標攻擊力下降 20，持續 3 回合。",
  }],
  "bone-knight": [{
    id: "bone-knight-full-counter",
    shortDescription: "約50%強力反擊",
    description: "反擊時約 50% 機率直接造成本次先攻的完整傷害。",
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
    description: "普通攻擊命中後施加與技術「施毒」相同的 3 回合狀態；回合結束生命減半。",
  }],
  "water-warrior": [{
    id: "water-warrior-split",
    shortDescription: "近戰受擊分裂",
    description: "受到普通近戰攻擊且存活時，會在相鄰合法空格新增一個分裂體；全體共享生命，場上最多 4 個。",
  }],
};

export function classTraitsFor(classId: ClassId): readonly ClassTrait[] {
  return TRAITS_BY_CLASS[classId] ?? [];
}
