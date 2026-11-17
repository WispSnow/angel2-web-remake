// REMAKE-188 story voice-over cast, as accepted in
// design/remake-gdd/systems/voice-over.md「选角」(user auditions 2026-11-17,
// planning/audits/ai-voice-over-assessment.md §10–13). Voices follow the
// portrait record shown in the typing window; a window without a portrait is
// the narrator. The generator rejects any clip whose voice differs from here.

export const ELEVENLABS_MODEL = "eleven_v4";
export const MINIMAX_MODEL = "speech-2.8-hd";

/** role -> speaker label and voice; `voiceId` is the platform's own id. */
export const VOICE_CAST = Object.freeze({
  narrator: { speaker: "旁白", platform: "minimax", voiceId: "Chinese (Mandarin)_Wise_Women", voiceName: "阅历姐姐" },
  nia: { speaker: "妮雅", platform: "elevenlabs", voiceId: "8RCmdqih4CKjJ7Bd3ZxT", voiceName: "Ladaisy" },
  sulanda: { speaker: "蘇蘭達", platform: "elevenlabs", voiceId: "5eoK8NqMBsMdqUmImHNs", voiceName: "Yating Lin" },
  qinsi: { speaker: "琴斯", platform: "elevenlabs", voiceId: "BqljjWyTnrioXPCNkCd4", voiceName: "Stella Gu" },
  ximi: { speaker: "希蜜", platform: "elevenlabs", voiceId: "ncfVpckS6VF8edUd8USJ", voiceName: "Lily Xu" },
  gedilasi: { speaker: "葛蒂拉斯", platform: "elevenlabs", voiceId: "YxbjaPemDJV2xlfvkiIG", voiceName: "Yun - Elegant" },
  binaweiji: { speaker: "碧娜維姬", platform: "elevenlabs", voiceId: "rJHzgsuoNk88I7S069lq", voiceName: "Layla" },
  shouhuzhe: { speaker: "守護者", platform: "elevenlabs", voiceId: "ggacvEjbmpoSuEinfFWs", voiceName: "Jackie" },
  daixi: { speaker: "黛西", platform: "elevenlabs", voiceId: "V3z1DARAbkkTVEx5lmEl", voiceName: "Jill" },
  xiailei: { speaker: "西艾蕾", platform: "elevenlabs", voiceId: "ByhETIclHirOlWnWKhHc", voiceName: "Shan Shan" },
  duoli: { speaker: "多莉", platform: "elevenlabs", voiceId: "LohtlKKkEkMrBywrqM8b", voiceName: "设计音色（多莉）" },
  mengxinman: { speaker: "蒙欣曼", platform: "elevenlabs", voiceId: "WfA47nTEqsxcbtplkPLI", voiceName: "Alina P" },
  weisita: { speaker: "維絲塔", platform: "elevenlabs", voiceId: "I23uc91tu5zY2PA1tKEN", voiceName: "Lin" },
  laduona: { speaker: "拉朵那", platform: "elevenlabs", voiceId: "t5SIDRTVMdbNUqrSAycs", voiceName: "Linda" },
  laiyin: { speaker: "萊茵", platform: "elevenlabs", voiceId: "RuN3w8eDhPWpy6G6C2ce", voiceName: "Jamy" },
  tingtaqi: { speaker: "汀塔琪", platform: "elevenlabs", voiceId: "OA58Um6I3pohjTobFFVk", voiceName: "loven" },
  fang: { speaker: "芳", platform: "elevenlabs", voiceId: "Iqi0ix5WGtiSXX9VDZB4", voiceName: "Helen Sun" },
  lan: { speaker: "蘭", platform: "elevenlabs", voiceId: "tOuLUAIdXShmWH7PEUrU", voiceName: "Julia" },
  sha: { speaker: "莎", platform: "elevenlabs", voiceId: "GgmlugwQ4LYXBbEXENWm", voiceName: "Maya" },
  qian: { speaker: "倩", platform: "elevenlabs", voiceId: "4AfodMgwXps9oZFhHzoj", voiceName: "Yun - Prime Mandarin Broadcast Anchor" },
  li: { speaker: "麗", platform: "elevenlabs", voiceId: "8uceOSflAGVvQuMt4HPh", voiceName: "Shasha" },
  ai: { speaker: "愛", platform: "elevenlabs", voiceId: "APSIkVZudNbPAwyPoeVO", voiceName: "Sage" },
  ran: { speaker: "嵐", platform: "elevenlabs", voiceId: "PSvrh6w41Qm19oaaHLca", voiceName: "Anna" },
  feiyiluyin: { speaker: "菲伊魯茵", platform: "elevenlabs", voiceId: "bhJUNIXWQQ94l8eI2VUf", voiceName: "Amy" },
  fumaluoni: { speaker: "芙瑪羅妮", platform: "elevenlabs", voiceId: "rtRocV7drsrJFSQPxlD3", voiceName: "Hua Feng" },
  leinajifu: { speaker: "蕾娜吉芙", platform: "elevenlabs", voiceId: "0ZxyP1BdNxALHVAwb6LU", voiceName: "设计音色（蕾娜吉芙）" },
  longwang: { speaker: "龍王", platform: "elevenlabs", voiceId: "2RUo2qBYrlYjcsr1ypkN", voiceName: "设计音色（龍王）" },
  yaolong: { speaker: "妖龍", platform: "elevenlabs", voiceId: "sIsggdzHMh1FrAHERUH8", voiceName: "设计音色（妖龍）" },
  allySoldier: { speaker: "我方士兵／戰士", platform: "elevenlabs", voiceId: "s2LjOZIlsH2Yu4p6MtAK", voiceName: "Bobo" },
  enemySoldier: { speaker: "敵方士兵", platform: "elevenlabs", voiceId: "GgmlugwQ4LYXBbEXENWm", voiceName: "Maya" },
  cavalry: { speaker: "騎兵", platform: "elevenlabs", voiceId: "kAIqZ7fZv234ClKXwzDx", voiceName: "Susan - Clear and Calm Storyteller" },
  priest: { speaker: "祭司", platform: "elevenlabs", voiceId: "5qr5FEpvZGzmVOPBS55W", voiceName: "Zi Yue" },
  ghost: { speaker: "亡灵", platform: "elevenlabs", voiceId: "JZLpE3AGwpKYZI2X65hN", voiceName: "Mingyao Ye" },
});

/** Portrait record -> cast role (spec「选角」, keyed by portrait, not by name). */
export const PORTRAIT_ROLES = Object.freeze({
  46: "nia",
  10: "sulanda",
  14: "qinsi",
  45: "ximi",
  0: "gedilasi",
  8: "binaweiji",
  65: "shouhuzhe",
  43: "daixi",
  5: "xiailei",
  13: "duoli",
  42: "mengxinman",
  41: "weisita",
  44: "laduona",
  2: "laiyin",
  3: "tingtaqi",
  34: "fang",
  35: "lan",
  36: "sha",
  37: "qian",
  38: "li",
  39: "ai",
  40: "ran",
  25: "feiyiluyin",
  11: "fumaluoni",
  24: "leinajifu",
  67: "longwang",
  56: "longwang",
  66: "yaolong",
  47: "allySoldier",
  57: "allySoldier",
  48: "enemySoldier",
  52: "cavalry",
  55: "priest",
  19: "ghost",
  30: "ghost",
  62: "ghost",
});

/**
 * SAY/0164 KY 20–23: one spliced clip per page, every chanted word in its own
 * speaker's voice (spec「选角」). Not a single-speaker clip, so not cast by portrait.
 */
export const GHOST_MONTAGE = Object.freeze({
  record: 164,
  waits: Object.freeze([20, 21, 22, 23]),
  role: "ghostMontage",
});

/**
 * Playback pace baked into each shipped clip (1 = as synthesised). After the
 * first in-game listen (2026-11-17) the user found the characters too unhurried
 * for battle and picked 1.15× for every ElevenLabs voice. eleven_v4 ignores
 * `voice_settings.speed` (the same seed at 1.2 came back the same length), so
 * the speed-up is a pitch-preserving time stretch applied when the clip is
 * finished. The narrator keeps its pace; the ghost montage keeps the round-4 cut.
 */
export const VOICE_TEMPO_BY_PLATFORM = Object.freeze({ minimax: 1, elevenlabs: 1.15 });

export function voiceTempoForRole(role) {
  if (role === GHOST_MONTAGE.role) return 1;
  const cast = VOICE_CAST[role];
  if (!cast) throw new Error(`role ${role} has no cast voice`);
  return VOICE_TEMPO_BY_PLATFORM[cast.platform];
}

export function castRoleForPortrait(portrait) {
  if (portrait === undefined) return "narrator";
  const role = PORTRAIT_ROLES[portrait];
  if (!role) throw new Error(`portrait D/${portrait} has no cast voice`);
  return role;
}
