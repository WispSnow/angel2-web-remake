#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_LINEAR_BASE = 0x1eba0;
const RECORD_COUNT = 39;
// 记录 36「龍」/37「頭」/38「手」只在 side 2 出现（场景 20/22 与 37），
// 所以原版只填了 side 2 表现块，side 1 块整体指向零占位。
const SIDE1_ONLY_UNAVAILABLE_RECORDS = [36, 37, 38];
// 描述符 +04h 指向受击方 direct 四帧（站立／受击／倒地／格挡）的落点表；y 表可以
// 指向这张全零共享表。+10h 的表现块只装当前出手方 +50 图形的落点表。
const SHARED_ZERO_Y_OFFSET_TABLE = 0x87f6;
const DEFENDER_FRAME_COUNT = 4;

const CODE_SIGNATURES = [
  ["0000:51EC", "copy-unit-descriptor-placement-and-presentation-blocks", "e841008b07a39d318b4702a3bb318b7704bfd5318cd88ec0b90200f3a58b7710bfd9318cd88ec0b90c00f3a58b7710bff3318cd88ec0b90c00f3a5e8"],
  ["0000:0220", "play-loaded-voc-far-entry", "e83100cbe80100cbf606ed10017403e82200c3f606ee10017403e81700c3f606"],
  ["0000:0254", "play-loaded-voc-near-worker", "a30b00803e0a0059741ec70693f501008cc88bd8b97d02e8e7d1a10b009a1307471ec70693f50000c3"],
  ["0000:9135", "map-counter-presentation", "a1c177a33252b80200a3df77a1bf778b0ed577c706181f01009a0800b516e80b00e869058b3ebf77e80201c38b1ebf77"],
  ["0000:91C5", "map-primary-presentation", "a1bf77a33252b80500a3df77a1c1778b0ed377c706181f01009a0800b516e80b00e8d9048b3ec177e87200c38b1ec177"],
  ["0000:926B", "attack-presentation-dispatch", "f6061911017404e82100c3e80100c3e848ff3c007414e8410083fa597409e82700e8a6fee84a00e88600c3a1d3778b1e"],
  ["0000:927A", "map-attack-sequence", "e848ff3c007414e8410083fa597409e82700e8a6fee84a00e88600c3a1d3778b1ed577e8b205e82200e87500e81904e8"],
  ["0000:9296", "full-screen-attack-sequence", "a1d3778b1ed577e8b205e82200e87500e81904e8b5fee842ffe82a00c3803eb4774e740a8b1ec177b81e00e8ba36c3"],
  ["0000:9852", "prepare-full-screen-battle", "a3a87f891eaa7fc706317d3a4ae865002ec70621b700009aac009d13e8b6e3e896afe85c00c6067cfa4ec6067dfa4ea1"],
  ["0000:9FC4", "copy-side1-unit-presentation-block", "a19231a35a7aa19031a35c7aa18e31a3607aa1bd31a3627aa1bf31a3687aa1c131a36a7aa1bb31a35e7aa19f31a3647a"],
  ["0000:A01B", "copy-side2-unit-presentation-block", "a19231a3e07aa19031a3e27aa18e31a3e67aa1bd31a3e87aa1bf31a3ee7aa1c131a3f07aa1bb31a3e47aa19f31a3ea7a"],
  ["0000:9E28", "redraw-full-screen-life-gauges", "e86100be767ee81f32be057de81932833e1d7d007406be197de80c32be8a7ee80632e8a000be807ee8fd31be0f7de8f731833e277d007413b8d2002b06277d054601a3237dbe237de8dd31be947ee8d731a182f8a3fc7e350008a3fa7ebeee7ee86336c3"],
  ["0000:9E8C", "select-left-life-gauge-tier", "a1647a3dd20072103da401721b3d760272293d48037237c3a31d7dc706217d0b00c7060d7d0000c32dd200a31d7dc706217d0900c7060d7d0b00c32da401a31d7dc706217d0d00c7060d7d0900c32d7602a31d7dc706217d0600c7060d7d0600c3"],
  ["0000:9EED", "select-right-life-gauge-tier", "a1ea7a3dd20072103da401721b3d760272293d48037237c3a3277dc7062b7d0b00c706177d0000c32dd200a3277dc7062b7d0900c706177d0b00c32da401a3277dc7062b7d0d00c706177d0900c32d7602a3277dc7062b7d0600c706177d0d00c3"],
  ["0000:A17B", "full-screen-primary-counter-sequence", "e86601e8420dc7062d7d96a0c7062f7d1fa7e85800e8f014e82715833e647a007437833eea7a007430e82e00813ebb77"],
  ["0000:A1E8", "run-one-full-screen-strike", "c606327c4ee88f05a12f7dffd0c606327c59a12d7dffd08b0ed77cbe3d7ce84d4de8c300e819fcc7063cf90b00a11a7c"],
  ["0000:A218", "run-post-hit-stream-then-hold", "a3187ce82000e85e05c606487f4ec606497f4ec706317d3a4ae88f05e8ff0ac7063cf90f00c3"],
  ["0000:A23E", "select-full-screen-hit-reaction", "833ed77c0a7704e84600c3e80100c3"],
  ["0000:A2E4", "prepare-full-screen-primary", "8b3ebf77e81f013c0174053c027448c3bafa00bb8700e8640dba8a02bb8700e8f70ee89401e81914a180f8be41029a0a"],
  ["0000:A377", "prepare-full-screen-counter", "8b3ebf77e88c003c0274053c017448c3bafa00bb8700e8d10cba8a02bb8700e8640ee87700e88613a180f8be41029a0a"],
  ["0000:A413", "setup-counter-left-actor-right-defender", "9ae100471ee8c503e8c805a1697ca37c7aa1717ca3187ca1737ca31a7ca1757ca3847aa1777ca30a7ba1797ca3527aa17d7ca3547aa17b7ca3dc7aa17f7ca3de7aa16b7ca3787aa16d7ca37a7aa19f7ca3fe7aa1a17ca3007b"],
  ["0000:A49D", "setup-primary-left-actor-right-defender", "9ae100471ee83b03e83e05a1837ca37c7aa18b7ca3187ca18d7ca31a7ca18f7ca3847aa1917ca30a7ba1937ca3527aa1977ca3547aa1957ca3dc7aa1997ca3de7aa1857ca3787aa1877ca37a7aa19f7ca3fe7aa1a17ca3007b"],
  ["0000:A599", "setup-counter-right-actor-left-defender", "9ae100471ee83f02e84204a1a37ca3027ba1ab7ca3187ca1ad7ca31a7ca1af7ca30a7ba1b17ca3847aa1b37ca3d87aa1b77ca3da7aa1b57ca3567aa1b97ca3587aa1657ca3787aa1677ca37a7aa1a57ca3fe7aa1a77ca3007b"],
  ["0000:A623", "setup-primary-right-actor-left-defender", "9ae100471ee8b501e8b803a1bd7ca3027ba1c57ca3187ca1c77ca31a7ca1c97ca30a7ba1cb7ca3847aa1cd7ca3d87aa1d17ca3da7aa1cf7ca3567aa1d37ca3587aa1657ca3787aa1677ca37a7aa1bf7ca3fe7aa1c17ca3007b"],
  ["0000:A71F", "damage-number-origin-callbacks", "8b3ebf77e8e4fc3c0174053c027411c3b87800a3377ca1327b2d1400a3357cc3b87800a3377ca1ac7a2d1400a3357cc38b3ebf77e8b4fc3c0274053c017411c3b87800a3377ca1327b2d1400a3357cc3b87800a3377ca1ac7a2d1400a3357cc3"],
  ["0000:A77F", "execute-full-screen-command-stream", "8b1e187c8b073dffff7419a3167c8306187c02e85f00e86202e85f04e8c104e82305ebdcc3"],
  ["0000:A7A4", "execute-full-screen-death-stream", "8b1e187c8b073dffff7413a3167c8306187c02e83a00e83d02e80405ebe2c3"],
  ["0000:A7C3", "clear-linked-channels-keep-main", "b90500514903c98bd983fb06740bb8000089877e7a8987047b59e2e7c3"],
  ["0000:A7E0", "clear-left-channels", "b90500514903c98bd9b8000089877e7a59e2f0c3"],
  ["0000:A8D1", "read-left-pose-or-apply-s", "8bb77e7a8b048987ba7a8b44028987c47a8b44048987ce7a83877e7a06c38b44028987a67a8b44048987b07a83877e7a06e90aff"],
  ["0000:A9E6", "clear-right-channels", "b90500514903c98bd9b800008987047b59e2f0c3"],
  ["0000:AAD7", "read-right-pose-or-apply-s", "8bb7047b8b048987407b8b440289874a7b8b44048987547b8387047b06c38b440289872c7b8b44048987367b8387047b06"],
  ["0000:ACC4", "run-command-step-substeps", "e8f003e88905a17c7ba3787ba1a07ba39c7b8b0e167c51e89200e8f603e88f05e80f00e82c008336fa7901e8760959e2e5c3"],
  ["0000:AD36", "hold-until-damage-number-settles", "833e1d7d007413833e277d00740c833e337c147305e80300ebe6c3e86f01e8f302e89707e86006b8b902ba0800e86645e88e09b90100e84726c3"],
  ["0000:AD70", "render-one-full-screen-substep", "e85001c706687b3100c7068c7b3100e8c802c706687b3200c7068c7b3200e86007e82906e83700"],
  ["0000:B04A", "select-channel-draw-order", "833e007a017408833e007a027405c3e8c801c3e82800c3"],
  ["0000:B061", "initialize-left-channels", "b90500514903c9890e767a8bf18994a67a899cb07ab800008984887ab8584e8984927a59e2ddc3"],
  ["0000:B088", "draw-channels-left-before-right", "b90500514903c9890e767a890efc7a8b1e767a83bf7e7a007403e85a008b1efc7a83bf047b007403e8e80159e2d5c3"],
  ["0000:B0B7", "latch-left-frames-and-accumulate-motion", "b90500514903c9890e767a8bd983bf7e7a0074088b87ba7a8987887a59e2e4c3b90500514903c9890e767a8bd983bf7e7a0074108b87c47a0187a67a8b87ce7a0187b07a59e2dcc3"],
  ["0000:B1A8", "advance-left-animation-counter", "81bf927a3a58741781bf927a3458741981bf927a36587427c7879c7a0000c383b79c7a0103879c7ac3ff879c7a83bf9c7a047206c7879c7a000003879c7ac3ff879c7a83bf9c7a067206c7879c7a000003879c7ac3"],
  ["0000:B1FD", "initialize-right-channels", "b90500514903c9890efc7a8bf189942c7b899c367bb8000089840e7bb8584e8984187b59e2ddc3"],
  ["0000:B253", "latch-right-frames-and-accumulate-motion", "b90500514903c9890efc7a8bd983bf047b0074088b87407b89870e7b59e2e4c3b90500514903c9890efc7a8bd983bf047b0074108b874a7b01872c7b8b87547b0187367b59e2dcc3"],
  ["0000:B344", "advance-right-animation-counter", "81bf187b3a58741781bf187b3458741981bf187b36587427c787227b0000c383b7227b010387227bc3ff87227b83bf227b047206c787227b00000387227bc3ff87227b83bf227b067206c787227b00000387227bc3"],
  ["0000:B4F1", "count-damage-number-draws", "803e327c4e7419ff06337ce81900e83701a1397c0106357ca13b7c0106377cc3c706337c0000c3"],
  ["0000:A2CF", "insert-damage-minus-before-first-digit", "be00008a843e7c3c20750346e2f5b02d88843d7cc3"],
  ["0000:B518", "select-damage-number-velocity-by-acting-side", "833e007a017408833e007a027405c3e80500c3e88600c3"],
  ["0000:B52F", "damage-number-velocity-left-actor", "833e337c047230833e337c097236833e337c0c723c833e337c0f7242833e337c117248833e337c13724ec706397c0000c7063b7c0000c3c706397c0400c7063b7ceeffc3c706397c0400c7063b7c0c00c3c706397c0400c7063b7cf6ffc3c706397c0400c7063b7c0a00c3c706397c0200c7063b7cf6ffc3c706397c0200c7063b7c0a00c3"],
  ["0000:B5B4", "damage-number-velocity-right-actor", "833e337c047230833e337c097236833e337c0c723c833e337c0f7242833e337c117248833e337c13724ec706397c0000c7063b7c0000c3c706397cfcffc7063b7ceeffc3c706397cfcffc7063b7c0c00c3c706397cfcffc7063b7cf6ffc3c706397cfcffc7063b7c0a00c3c706397cfeffc7063b7cf6ffc3c706397cfeffc7063b7c0a00c3"],
  ["0000:B639", "draw-damage-number-at-its-origin", "a1357ca3baf8a1377ca3bcf8be3d7ce87b3da1357ca3027aa30a7aa1377ca3047aa30c7ac3"],
  ["0000:EF56", "format-five-character-decimal-field", "2bd28bc1bb1027f7f3043088048bc22bd2bbe803f7f304308844018bc22bd2bb6400f7f304308844028bc22bd2bb0a00f7f3043088440380c230885404bb00008a40013c24740d8a003c307507b020880043ebec8a44043c207401c3b030884404c3"],
  ["0000:F3C6", "draw-string-with-drop-shadow", "5053515256571e06a1baf8a332fa893630fae8c600a234fa3c7f77229090903c0d7503e9ac003c247503e9a5003c007503e99e0083fa5974d9e8f900ebd4e89a00a235fa3c0d7503e987003c0a7503e98000a034fa8a2635fae88a008bc3bb1e00f7e3e8b5008b16baf8428b1ebcf88bd28bdb8b0e3ef9be36fabfb902e882018b16baf88b1ebcf8438bd28bdb8b0e3ef9be36fabfb902e868018b16baf8428b1ebcf8438bd28bdb8b0e3ef9be36fabfb902e84d018b16baf88b1ebcf88b0e3cf9be36fabfb902e838018306baf810e940ff071f5f5e5a595b58c3"],
  ["0000:F4A1", "read-next-string-byte", "8b1e30fa8a07ff0630fac3"],
  ["0000:F4FB", "draw-half-width-glyph-with-drop-shadow", "3c7c74799090903c20746c909090e878008b1ebcf8438b16baf88bd28bdb8b0e3ef9be5cfabfb902e8a2008b1ebcf88b16baf8428bd28bdb8b0e3ef9be5cfabfb902e888008b1ebcf8438b16baf8428bd28bdb8b0e3ef9be5cfabfb902e86d008b1ebcf88b16baf88bdb8b0e3cf9be5cfabfb902e856008306baf808c3a132faa3baf88306bcf810c3"],
  ["0000:F584", "copy-rom-glyph-doubling-every-row", "1e2ae4bb0800f7e3056efa8bf08cd88ec0bf60fab800f08ed8b90800acaaaae2fb1fc3"],
  ["0000:F5C8", "blit-one-bit-glyph-into-battle-buffer", "1e8b450c2ea311f68b45082ea313f68b45042ea315f68b052ea317f62e890e90f7891674fa891e76fa8bc23d00007f03b80100bb0800f6f3882678fa2ae4a374fae80d00e840001fc3"],
  ["0000:B0FF", "composite-left-channel-with-main-shadow","8b1e767a8b87887ae89e00a3747ac70684f84102a14102ba00008b0e747ae87640890e6e7a8b367a7a8b1e747a03db8b008b1e767a8b97b07a2b166e7a03d08916727a8b36787a8b1e747a03db8b008b1e767a8b97a67a2bd08916707a8b16707a8b1e727a8b0e747abe4102bfb902e81f2fa1747a8b1e767a83fb0675148b16707abb84008b0e747abe4102bfb902e8a5318b16707a8b1e727a8b0e747abe4102bfb902e8e82bc3"],
  ["0000:B224", "draw-channels-right-before-left", "b90500514903c9890e767a890efc7a8b1efc7a83bf047b007403e85a008b1e767a83bf7e7a007403e8b0fe59e2d5c3"],
  ["0000:B29B", "composite-right-channel-with-main-shadow", "8b1efc7a8b870e7be89e00a3fa7ac70684f86902a16902ba00008b0efa7ae8da3e890ef47a8b36007b8b1efa7a03db8b008b1efc7a8b97367b2b16f47a03d08916f87a8b36fe7a8b1efa7a03db8b008b1efc7a8b972c7b2bd08916f67a8b16f67a8b1ef87a8b0efa7abe6902bfb902e8832da1fa7a8b1efc7a83fb0675148b16f67abb84008b0efa7abe6902bfb902e809308b16f67a8b1ef87a8b0efa7abe6902bfb902e84c2ac3"],
  ["0000:DF86", "draw-channel-bitmap-rows-with-ground-clip", "e8bd00a1e1f72ea3a6df8b1edff7a1bef78ec0e8d200a1d0f78ed8eb005157b9d2042e3b3e8ce072122e3b3e8ee0770b81ff881d77058a042608054647e2e35f83c7382e83068ce0382e83068ee03859e2cbb8ba1e8ed8c3"],
  ["0000:E1F9", "mask-channel-bitmap-rows-with-ground-clip", "8cc38cc281c240055157b9d2042e3b3e33e372232e3b3e31e3771c81ff881d77168a048ec3262005262085002a8ec2262005262085002a4647e2d25f83c7382e830633e3382e830631e33859e2bab8ba1e8ed8c3"],
  ["0000:E336", "draw-main-channel-ground-shadow", "1eb8ba1e8ed8890e33f8891635f8891e37f8893612f8893e14f88bc233d23d00007c14909090bb0800f7f3881632f8a335f8e81b001fc3f7d8bb0800f7f3881632f8bb00002bd8891e35f8e856001fc3"],
  ["0000:E4AF", "ground-shadow-byte-aligned-column-dither", "e89401a139f82ea3f6e48b1e37f8a116f88ec0e8a901a128f88ed8b90300eb008cc38cc281c24005e81a004f2e8306f6e402e81000472e832ef6e402e80600b8ba1e8ed8c357b9d2042e3b3e8ee672469090902e3b3e8ce6773c90909081ff60277733909090b8aaaa8ec3262005262085002a8ec2262005262085002ab8aaaa8ec326204538262085382a8ec226204538262085382a4647e2af5f83c7702e83068ee6702e83068ce670c3"],
  ["0000:E55A", "ground-shadow-shifted-checker-dither", "2e8816a8e552e8e300a139f82ea3abe58b1e37f8a116f88ec0e8f800a128f88ed85af7d5b90300eb008cc38cc281c24005e81b004f2e8306abe502e81100472e832eabe502e80700b8ba1e8ed8c30057b9d2042e3b3e8ee672789090902e3b3e8ce6776e90909081ff6027776590909051b855550bc58ec3262005262085002a8ec2262005262085002a8ec3262065012620a5012a8ec2262065012620a5012ab8aaaa0bc58ec326204538262085382a8ec226204538262085382a8ec3262065392620a5392a8ec2262065392620a5392a594746e202eb03e978ff5f83c7702e83068ee6702e83068ce670c3"],
  ["0000:B3BD", "draw-shared-full-screen-trail", "803e487f597416803e487f55742c803e"],
  ["0000:B683", "full-screen-left-death", "833e647a007401c3a105028ec0bf0000b90b00bb0300e8f646e841f1e844f3c706187c4c7dc706847a5a7dc7060a7bae"],
  ["0000:B6BD", "full-screen-right-death", "833eea7a007401c3a105028ec0bf0000b90b00bb0300e8bc46e807f1e80af3c706187c4c7dc7060a7b847dc706847aae"],
  ["0000:B725", "load-class-plus50-left-graphic", "8b1e637c83c332e81900c38b1e9d7c83c332a180f88ec0bf00008bcbbb0600e84b46c3"],
  ["0000:B730", "load-class-plus50-right-graphic", "8b1e9d7c83c332a180f88ec0bf00008bcbbb0600e84b46c3"],
  ["0000:B748", "load-left-class-graphic-with-remap", "83fb01741683fb337425a180f88ec0bf00008bcbbb0500e83046c3bb2900a180f88ec0bf00008bcbbb0600e81c46c3bb"],
  ["1000:6ABC", "map-death-presentation", "c7067afa59009af2620000a180f88ec0bf0000b90c00bb04009a8efd0000a180f8be05029a0a003719c7062a520a00c7"],
  ["1000:6B58", "map-hit-and-damage-presentation", "9a8e620000a180f88ec0bf0000b93e00bb0d009a8efd0000a180f8be05029a0a003719a180f88ec0bf0000b92600bb03"],
  ["0000:D3B6", "wait-native-timer-ticks", "1eb8ba1e8ed8803e92f5007406390eb3f572fac706b3f500001fc3803ec6f6017401c3803eb9f6017401c3803e95f500"],
];

const DATA_SIGNATURES = [
  [0x6a26, 0x6b58, "map-death-descriptor-tables", "2ddef137ee74a164ef111ba7cc8580572f0b3420c0e41b54b4577420a4717d6b"],
  [0x6b60, 0x6b6b, "map-hit-dynamic-descriptor", "5044744ffe52befc6a86cd38edd308873bed8b4cd078ea0face099d978bf6a9b"],
  [0x7d05, 0x7d2d, "full-screen-life-gauge-dynamic-rectangles", "fe873daba2dd75c10880b7fc653e272e3b43a0aae88c42c103cff2fec8a779e8"],
  [0x7d42, 0x7dda, "full-screen-death-command-data", "ce0f0aaefb86d66707411b84d93e624f2a5931deffc3f22a680068b9fe5c3b53"],
  [0x7e76, 0x7e9e, "full-screen-life-gauge-frame-rectangles", "0ade0e865415fb236997da7df8430ce005f03c0528228518320ad89e44f0fa0c"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function parseAddress(address) {
  const match = /^(?<segment>[0-9A-F]{4}):(?<offset>[0-9A-F]{4})$/i.exec(address);
  assert(match !== null, `invalid segmented address ${address}`);
  const segment = Number.parseInt(match.groups.segment, 16);
  const offset = Number.parseInt(match.groups.offset, 16);
  return { segment, offset, linear: segment * 16 + offset };
}

function checkedSlice(buffer, start, end, label) {
  assert(start >= 0 && end >= start && end <= buffer.length,
    `${label}: ${start}..${end} outside ${buffer.length}-byte source`);
  return buffer.subarray(start, end);
}

function dsLinear(offset) {
  return DATA_LINEAR_BASE + offset;
}

function readWord(buffer, dsOffset) {
  return checkedSlice(buffer, dsLinear(dsOffset), dsLinear(dsOffset) + 2,
    `DS:${hex(dsOffset)}`).readUInt16LE(0);
}

function readSignedWord(buffer, dsOffset) {
  return checkedSlice(buffer, dsLinear(dsOffset), dsLinear(dsOffset) + 2,
    `DS:${hex(dsOffset)}`).readInt16LE(0);
}

function readWords(buffer, dsOffset, count) {
  return Array.from({ length: count }, (_, index) =>
    readWord(buffer, dsOffset + index * 2));
}

function readTerminatedWords(buffer, dsOffset, terminator = 0xffff, maxWords = 256) {
  const values = [];
  for (let index = 0; index < maxWords; index++) {
    const value = readWord(buffer, dsOffset + index * 2);
    if (value === terminator) {
      return { address: `DS:${hex(dsOffset)}`, values, terminator };
    }
    values.push(value);
  }
  throw new Error(`DS:${hex(dsOffset)}: missing ${hex(terminator)} terminator`);
}

function readCodeWord(buffer, address) {
  const { linear } = parseAddress(address);
  return checkedSlice(buffer, linear, linear + 2, address).readUInt16LE(0);
}

function sameCodeWord(buffer, addresses, label) {
  const values = addresses.map((address) => readCodeWord(buffer, address));
  assert(values.every((value) => value === values[0]),
    `${label}: ${addresses.join("/")} disagree (${values.map((value) => hex(value)).join("/")})`);
  return values[0];
}

/** The immediate of a `mov word [DS:target],imm16` (`C7 06`) at `address`. */
function movWordImmediate(buffer, address, target) {
  const { linear } = parseAddress(address);
  const bytes = checkedSlice(buffer, linear, linear + 6, address);
  assert(bytes[0] === 0xc7 && bytes[1] === 0x06 && bytes.readUInt16LE(2) === target,
    `${address}: expected mov word [${hex(target)}],imm16`);
  return bytes.readUInt16LE(4);
}

/**
 * `B52F/B5B4`: a run of `cmp word [7C33],n / jc band` tests, a fall-through
 * velocity, and one `mov [7C39],dx / mov [7C3B],dy / ret` body per band. The
 * counter is incremented before the test, so draw `k` tests `k`.
 */
function decodeDamageVelocityTable(buffer, address) {
  const pairAt = (linear) => {
    const bytes = checkedSlice(buffer, linear, linear + 13, `0000:${hex(linear)}`);
    assert(bytes[0] === 0xc7 && bytes[1] === 0x06 && bytes.readUInt16LE(2) === 0x7c39
      && bytes[6] === 0xc7 && bytes[7] === 0x06 && bytes.readUInt16LE(8) === 0x7c3b
      && bytes[12] === 0xc3,
    `0000:${hex(linear)}: expected mov [7C39],dx / mov [7C3B],dy / ret`);
    return { dx: bytes.readInt16LE(4), dy: bytes.readInt16LE(10) };
  };
  const bands = [];
  let cursor = parseAddress(address).linear;
  while (buffer[cursor] === 0x83) {
    const bytes = checkedSlice(buffer, cursor, cursor + 7, `0000:${hex(cursor)}`);
    assert(bytes[1] === 0x3e && bytes.readUInt16LE(2) === 0x7c33 && bytes[5] === 0x72,
      `0000:${hex(cursor)}: expected cmp word [7C33],imm8 / jc`);
    bands.push({ drawsBelow: bytes[4], ...pairAt(cursor + 7 + bytes.readInt8(6)) });
    cursor += 7;
  }
  assert(bands.length > 0 && bands.every((band, index) =>
    index === 0 || band.drawsBelow > bands[index - 1].drawsBelow),
  `${address}: the velocity bands must test increasing draw counts`);
  return { bands, otherwise: pairAt(cursor) };
}

/**
 * `F4FB`'s glyph blocks: each loads y (`DS:F8BC`, `inc bx` for +1), x
 * (`DS:F8BA`, `inc dx` for +1) and a colour variable, then calls the `F5C8`
 * blitter. `mov dx,dx` / `mov bx,bx` are the original's own no-ops.
 */
function decodeGlyphPasses(buffer, startAddress, endAddress) {
  let cursor = parseAddress(startAddress).linear;
  const end = parseAddress(endAddress).linear;
  const passes = [];
  let pass = {};
  while (cursor < end) {
    const opcode = buffer[cursor];
    const modrm = buffer[cursor + 1];
    const word = (offset) => buffer.readUInt16LE(cursor + offset);
    if (opcode === 0x8b && modrm === 0x1e && word(2) === 0xf8bc) {
      pass.dy = 0;
      cursor += 4;
    } else if (opcode === 0x8b && modrm === 0x16 && word(2) === 0xf8ba) {
      pass.dx = 0;
      cursor += 4;
    } else if (opcode === 0x43 && pass.dy === 0) {
      pass.dy = 1;
      cursor += 1;
    } else if (opcode === 0x42 && pass.dx === 0) {
      pass.dx = 1;
      cursor += 1;
    } else if (opcode === 0x8b && (modrm === 0xd2 || modrm === 0xdb)) {
      cursor += 2;
    } else if (opcode === 0x8b && modrm === 0x0e && (word(2) === 0xf93c || word(2) === 0xf93e)) {
      pass.colorVariable = `DS:${hex(word(2))}`;
      cursor += 4;
    } else if (opcode === 0xbe) {
      pass.glyphDescriptor = `DS:${hex(word(1))}`;
      cursor += 3;
    } else if (opcode === 0xbf) {
      pass.targetBuffer = `DS:${hex(word(1))}`;
      cursor += 3;
    } else if (opcode === 0xe8) {
      const target = (cursor + 3 + buffer.readInt16LE(cursor + 1)) & 0xffff;
      assert(target === 0xf5c8, `0000:${hex(cursor)}: a glyph pass must call the F5C8 blitter`);
      assert(pass.dx !== undefined && pass.dy !== undefined && pass.colorVariable
        && pass.glyphDescriptor && pass.targetBuffer,
      `0000:${hex(cursor)}: incomplete glyph pass ${JSON.stringify(pass)}`);
      passes.push(pass);
      pass = {};
      cursor += 3;
    } else {
      throw new Error(`0000:${hex(cursor)}: unexpected byte ${hex(opcode, 2)} in the glyph passes`);
    }
  }
  assert(Object.keys(pass).length === 0, `${endAddress}: a glyph pass runs past the blocks`);
  return passes;
}

function verifiedWord(buffer, dsOffset, expected, label) {
  const actual = readWord(buffer, dsOffset);
  assert(actual === expected,
    `DS:${hex(dsOffset)}: ${label} expected ${hex(expected)}, got ${hex(actual)}`);
  return { address: `DS:${hex(dsOffset)}`, value: actual };
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map(([address, role, expectedHex]) => {
    const { linear } = parseAddress(address);
    const expected = Buffer.from(expectedHex, "hex");
    const actual = checkedSlice(buffer, linear, linear + expected.length, address);
    assert(actual.equals(expected), `${address}: ${role} signature mismatch`);
    return {
      address,
      role,
      bytes: expected.length,
      sha256: sha256(expected),
    };
  });
}

function validateDataSignatures(buffer) {
  return DATA_SIGNATURES.map(([start, end, role, expectedSha256]) => {
    const bytes = checkedSlice(buffer, dsLinear(start), dsLinear(end), role);
    assert(sha256(bytes) === expectedSha256, `DS:${hex(start)}: ${role} signature mismatch`);
    return {
      address: `DS:${hex(start)}`,
      endExclusive: `DS:${hex(end)}`,
      role,
      bytes: bytes.length,
      sha256: expectedSha256,
    };
  });
}

function decodeMapDescriptor(buffer, dsOffset) {
  const xOffset = readSignedWord(buffer, dsOffset);
  const yOffset = readSignedWord(buffer, dsOffset + 2);
  const width = readWord(buffer, dsOffset + 4);
  const height = readWord(buffer, dsOffset + 6);
  assert(width > 0 && height > 0 && width * height <= 64,
    `DS:${hex(dsOffset)}: invalid ${width}x${height} descriptor`);
  const tileCodes = readWords(buffer, dsOffset + 8, width * height);
  return {
    address: `DS:${hex(dsOffset)}`,
    xOffset,
    yOffset,
    width,
    height,
    tileCodes,
    renderedFrames: tileCodes.map((value) => value === 0 ? null : value - 1),
  };
}

function decodeDrawRectangle(buffer, dsOffset) {
  const [x, y, width, height, colorIndex] = readWords(buffer, dsOffset, 5);
  return { address: `DS:${hex(dsOffset)}`, x, y, width, height, colorIndex };
}

function parseSimpleDeathScript(buffer, dsOffset, poseCount) {
  const commandNames = new Map([
    [0x5631, "V1"],
    [0x4c3a, ":L"],
    [0x523a, ":R"],
    [0x4555, "UE"],
  ]);
  const commands = [];
  let cursor = dsOffset;
  while (commandNames.has(readWord(buffer, cursor))) {
    const opcode = readWord(buffer, cursor);
    commands.push({ opcode, token: commandNames.get(opcode) });
    cursor += 2;
  }
  const poses = Array.from({ length: poseCount }, () => {
    const values = [
      readSignedWord(buffer, cursor),
      readSignedWord(buffer, cursor + 2),
      readSignedWord(buffer, cursor + 4),
    ];
    cursor += 6;
    return { frame: values[0], deltaX: values[1], deltaY: values[2] };
  });
  return {
    address: `DS:${hex(dsOffset)}`,
    commands,
    poses,
    bytesConsumed: cursor - dsOffset,
  };
}

const FULL_SCREEN_COMMANDS = new Map([
  [0x533a, { token: ":S", argumentKinds: ["signed", "signed"] }],
  [0x523a, { token: ":R", argumentKinds: [] }],
  [0x4c3a, { token: ":L", argumentKinds: [] }],
  [0x4a3a, { token: ":J", argumentKinds: [] }],
  [0x583a, { token: ":X", argumentKinds: [] }],
  [0x5834, { token: "X4", argumentKinds: [] }],
  [0x5836, { token: "X6", argumentKinds: [] }],
  [0x4e58, { token: "XN", argumentKinds: [] }],
  [0x5944, { token: "YD", argumentKinds: [] }],
  [0x4e44, { token: "ND", argumentKinds: [] }],
  [0x4731, { token: "G1", argumentKinds: ["pointer"] }],
  [0x4732, { token: "G2", argumentKinds: ["pointer"] }],
  [0x4733, { token: "G3", argumentKinds: ["pointer"] }],
  [0x4734, { token: "G4", argumentKinds: ["pointer"] }],
  [0x4735, { token: "G5", argumentKinds: ["pointer"] }],
  [0x5631, { token: "V1", argumentKinds: [] }],
  [0x5632, { token: "V2", argumentKinds: [] }],
  [0x5633, { token: "V3", argumentKinds: [] }],
  [0x5634, { token: "V4", argumentKinds: [] }],
  [0x5635, { token: "V5", argumentKinds: [] }],
  [0x4559, { token: "EY", argumentKinds: [] }],
  [0x454e, { token: "NE", argumentKinds: [] }],
  [0x4555, { token: "UE", argumentKinds: [] }],
]);

function parseFullScreenCommandStream(buffer, dsOffset, stepCounts, followLinkedStreams = true) {
  let cursor = dsOffset;
  const steps = stepCounts.map((rendererSubsteps, index) => {
    const commands = [];
    while (FULL_SCREEN_COMMANDS.has(readWord(buffer, cursor))) {
      const opcode = readWord(buffer, cursor);
      const definition = FULL_SCREEN_COMMANDS.get(opcode);
      cursor += 2;
      const parameters = definition.argumentKinds.map((kind) => {
        const value = kind === "pointer"
          ? `DS:${hex(readWord(buffer, cursor))}`
          : readSignedWord(buffer, cursor);
        cursor += 2;
        return value;
      });
      commands.push({ opcode, token: definition.token, parameters });
    }
    const pose = {
      frame: readSignedWord(buffer, cursor),
      deltaX: readSignedWord(buffer, cursor + 2),
      deltaY: readSignedWord(buffer, cursor + 4),
    };
    cursor += 6;
    return { index, rendererSubsteps, commands, pose };
  });
  if (followLinkedStreams) {
    for (const step of steps) {
      for (const command of step.commands) {
        const pointer = command.token.startsWith("G")
          ? command.parameters.find((parameter) => typeof parameter === "string")
          : undefined;
        if (pointer) {
          command.linkedStream = parseFullScreenCommandStream(
            buffer,
            Number.parseInt(pointer.slice(3), 16),
            stepCounts.slice(step.index),
            false,
          );
        }
      }
    }
  }
  return {
    address: `DS:${hex(dsOffset)}`,
    bytesConsumed: cursor - dsOffset,
    steps,
  };
}

/**
 * A `G1`..`G5` weapon channel is a persistent sprite slot, not a one-shot
 * effect: its records sit immediately after the strike block, and the post-hit
 * command stream only re-points the channel when it issues the same token
 * again. Classes whose post-hit streams never re-issue the token keep reading
 * from where the strike block ended, consuming the post-hit step counts.
 *
 * Record 22 is the stage-0 case: its thrown lance has no post-hit `G1`, so the
 * four records after `DS:AFFD`/`DS:DB57` keep running and carry the lance back
 * to the up-canted frame 6 at `(+-30,-16)` per substep — the capture's
 * upward deflection out of the battle window after contact.
 */
function attachWeaponChannelContinuations(buffer, commandStreams, postHitStepCounts) {
  const isMain = (key) => key.startsWith("main");
  const reissuedTokens = new Set(
    Object.entries(commandStreams)
      .filter(([key]) => !isMain(key))
      .flatMap(([, stream]) => stream.steps)
      .flatMap((step) => step.commands)
      .filter((command) => command.linkedStream !== undefined)
      .map((command) => command.token),
  );
  for (const [key, stream] of Object.entries(commandStreams)) {
    if (!isMain(key)) continue;
    for (const step of stream.steps) {
      for (const command of step.commands) {
        if (command.linkedStream === undefined) continue;
        if (reissuedTokens.has(command.token)) continue;
        const linkedOffset = parseAddress(`0000:${command.linkedStream.address.slice(3)}`).offset;
        command.linkedStream.postHitContinuation = parseFullScreenCommandStream(
          buffer,
          linkedOffset + command.linkedStream.bytesConsumed,
          postHitStepCounts,
          false,
        );
      }
    }
  }
  return commandStreams;
}

function sideDescriptor(record, role) {
  const result = record.descriptors.find((entry) => entry.role === role)
    ?? record.descriptors.find((entry) => entry.set === (role === "side1" ? "set1" : "set2"));
  assert(result !== undefined, `record ${record.record}: missing ${role} descriptor`);
  return result;
}

/**
 * The defender's direct frames never read the presentation block's tables.
 * `0000:51EC` copies the descriptor's +04h word pair into runtime block +2/+4,
 * and every strike setup (`A49D/A413/A599/A623`) hands the defending side's
 * +2/+4 to its compositor as the x-anchor/y-offset tables. The pair points at
 * four x anchors stored right after it, then either four own y offsets or the
 * shared zero table; the +10h presentation block begins immediately after, so
 * each table covers exactly the four direct frames.
 */
function defenderFramePlacement(buffer, descriptor) {
  const pairAddress = descriptor.unknownPointer04;
  const [xPointer, yPointer] = readWords(buffer, pairAddress, 2);
  const label = `${descriptor.set} descriptor ${descriptor.descriptorAddress}`;
  assert(xPointer === pairAddress + 4,
    `${label}: defender x-anchor table must follow its +04h pointer pair`);
  const sharedYOffsets = yPointer === SHARED_ZERO_Y_OFFSET_TABLE;
  assert(sharedYOffsets || yPointer === xPointer + DEFENDER_FRAME_COUNT * 2,
    `${label}: defender y-offset table must follow the x anchors or use DS:87F6`);
  const tableEnd = sharedYOffsets ? xPointer : yPointer;
  assert(descriptor.unknownPointer10 === tableEnd + DEFENDER_FRAME_COUNT * 2,
    `${label}: the presentation block must start right after the four-frame defender tables`);
  const yOffset = Array.from({ length: DEFENDER_FRAME_COUNT }, (_, index) =>
    readSignedWord(buffer, yPointer + index * 2));
  if (sharedYOffsets) {
    assert(yOffset.every((value) => value === 0), "DS:87F6 must stay the shared zero table");
  }
  return {
    source: "unit descriptor +04h pointer pair",
    tablePointerPair: `DS:${hex(pairAddress)}`,
    tablePointers: [`DS:${hex(xPointer)}`, `DS:${hex(yPointer)}`],
    sharedZeroYOffsets: sharedYOffsets,
    frameCount: DEFENDER_FRAME_COUNT,
    xAnchor: Array.from({ length: DEFENDER_FRAME_COUNT }, (_, index) =>
      readSignedWord(buffer, xPointer + index * 2)),
    yOffset,
  };
}

function presentationBlock(buffer, descriptor, includeCommandStreams) {
  const words = readWords(buffer, descriptor.unknownPointer10, 12);
  const hasFullScreenPresentation = words[4] !== 0
    && words[5] !== 0
    && readWord(buffer, words[4]) > 0
    && readWord(buffer, words[5]) > 0;
  if (!hasFullScreenPresentation) {
    return {
      descriptorSet: descriptor.set,
      classCode: descriptor.code,
      blockAddress: `DS:${hex(descriptor.unknownPointer10)}`,
      leftGraphicFrameRecord: words[0],
      available: false,
      unavailableReason: "native descriptor contains no full-screen presentation pointers",
    };
  }
  const soundTablePointer = words[3];
  const strikeStepCounts = readTerminatedWords(buffer, words[4]);
  const postHitStepCounts = readTerminatedWords(buffer, words[5]);
  const commandPointers = {
    mainLeftOrAttacker: words[6],
    mainRightOrDefender: words[7],
    auxiliaryA: words[8],
    auxiliaryB: words[9],
    auxiliaryC: words[10],
    auxiliaryD: words[11],
  };
  return {
    descriptorSet: descriptor.set,
    classCode: descriptor.code,
    blockAddress: `DS:${hex(descriptor.unknownPointer10)}`,
    available: true,
    leftGraphicFrameRecord: words[0],
    anchorOrOffsetTablePointers: words.slice(1, 3).map((value) => `DS:${hex(value)}`),
    soundTableAddress: `DS:${hex(soundTablePointer)}`,
    voiceSlots: Object.fromEntries(
      readWords(buffer, soundTablePointer, 5).map((record, index) => [`V${index + 1}`, record]),
    ),
    strikeStepCounts,
    postHitStepCounts,
    commandPointers: Object.fromEntries(
      Object.entries(commandPointers).map(([key, value]) => [key, `DS:${hex(value)}`]),
    ),
    ...(includeCommandStreams ? {
      commandStreams: attachWeaponChannelContinuations(
        buffer,
        Object.fromEntries(
          Object.entries(commandPointers).map(([key, value]) => [
            key,
            parseFullScreenCommandStream(
              buffer,
              value,
              key.startsWith("main")
                ? strikeStepCounts.values
                : postHitStepCounts.values,
            ),
          ]),
        ),
        postHitStepCounts.values,
      ),
    } : {}),
  };
}

function leftGraphicRule(record, plus50) {
  const requestedRecord = record + (plus50 ? 50 : 0);
  if (requestedRecord === 1) {
    return { requestedRecord, group: "Y_00", record: 41, remapped: true };
  }
  if (requestedRecord === 51) {
    return { requestedRecord, group: "Y_00", record: 42, remapped: true };
  }
  return { requestedRecord, group: "M_00", record: requestedRecord, remapped: false };
}

function rightGraphicRule(record, plus50) {
  return {
    requestedRecord: record + (plus50 ? 50 : 0),
    group: "Y_00",
    record: record + (plus50 ? 50 : 0),
    remapped: false,
  };
}

function compactDecodedEntry(entry) {
  if (entry === undefined) return null;
  return {
    kind: entry.kind,
    sourceBytes: entry.sourceBytes,
    decodedStreams: entry.streams?.filter((stream) => stream.present).length ?? 0,
    unpackedBytesPerStream: entry.streams?.[0]?.unpackedBytes ?? null,
  };
}

async function loadResourceCatalog(extractedRoot, decodedRoot, planarRoot, refs) {
  const groups = [...new Set(refs.map((entry) => entry.group))]
    .filter((group) => group !== "E");
  const manifests = new Map();
  for (const group of groups) {
    const [extracted, decoded, planar] = await Promise.all([
      readFile(path.join(extractedRoot, group, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(decodedRoot, group, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(planarRoot, group, "manifest.json"), "utf8").then(JSON.parse),
    ]);
    manifests.set(group, { extracted, decoded, planar });
  }

  const uniqueRefs = [...new Map(refs.map((entry) =>
    [`${entry.group}/${entry.record}`, entry])).values()]
    .sort((left, right) => left.group.localeCompare(right.group) || left.record - right.record);
  const entries = [];
  for (const ref of uniqueRefs) {
    if (ref.group === "E") continue;
    const { extracted, decoded, planar } = manifests.get(ref.group);
    const extractedEntry = extracted.records.find((entry) => entry.index === ref.record);
    const decodedEntry = decoded.entries.find((entry) => entry.record === ref.record);
    const planarEntry = planar.entries.find((entry) => entry.record === ref.record);
    const present = extractedEntry !== undefined && !extractedEntry.missing && !extractedEntry.terminator;
    const relativePath = `${ref.group}/${String(ref.record).padStart(4, "0")}.bin`;
    const payload = present ? await readFile(path.join(extractedRoot, relativePath)) : null;
    entries.push({
      key: `${ref.group}/${ref.record}`,
      group: ref.group,
      record: ref.record,
      present,
      extractedPath: present ? path.join(extractedRoot, relativePath) : null,
      sourceBytes: payload?.length ?? null,
      sourceSha256: payload === null ? null : sha256(payload),
      decoded: compactDecodedEntry(decodedEntry),
      renderedFrames: planarEntry?.images?.length ?? 0,
      renderedPaths: planarEntry?.images?.map((image) =>
        path.join(planarRoot, ref.group, image.output)) ?? [],
    });
  }
  return entries;
}

function audioCatalog(audioManifest, records, extractedRoot, audioRoot) {
  return [...new Set(records)].sort((left, right) => left - right).map((record) => {
    const entry = audioManifest.entries.find((candidate) =>
      candidate.group === "E" && candidate.record === record);
    assert(entry !== undefined, `E.SWF/${record}: missing converted-audio manifest entry`);
    return {
      key: `E/${record}`,
      group: "E",
      record,
      sourcePath: path.join(extractedRoot, entry.source),
      sourceBytes: entry.sourceBytes,
      sourceSha256: entry.sourceSha256,
      outputPath: path.join(audioRoot, entry.output),
      codec: entry.codec,
      sampleRate: entry.sampleRate,
      channels: entry.channels,
      durationSeconds: entry.durationSeconds,
    };
  });
}

async function extract(
  modulePath,
  descriptorsPath,
  audioManifestPath,
  extractedRoot,
  decodedRoot,
  planarRoot,
  outputPath,
) {
  const [moduleBuffer, descriptorsBuffer, audioBuffer] = await Promise.all([
    readFile(modulePath),
    readFile(descriptorsPath),
    readFile(audioManifestPath),
  ]);
  const descriptors = JSON.parse(descriptorsBuffer.toString("utf8"));
  const audioManifest = JSON.parse(audioBuffer.toString("utf8"));
  assert(descriptors.records?.length === RECORD_COUNT, "unit descriptors must contain 39 records");

  const mapDeathPhase1Pointers = readTerminatedWords(moduleBuffer, 0x6a26).values;
  const mapDeathPhase2Pointers = readTerminatedWords(moduleBuffer, 0x6a34).values;
  assert(mapDeathPhase1Pointers.length === 6, "map death phase 1 must contain six descriptors");
  assert(mapDeathPhase2Pointers.length === 9, "map death phase 2 must contain nine descriptors");

  const classRecords = descriptors.records.map((record) => {
    // 命令流按“该侧表现块是否有效”解码，不按记录号截断：36–38 的 side 2 同样有效。
    const side1 = presentationBlock(moduleBuffer, sideDescriptor(record, "side1"), true);
    const side2 = presentationBlock(moduleBuffer, sideDescriptor(record, "side2"), true);
    return {
      record: record.record,
      name: record.normalizedName,
      side1,
      side2,
      voiceSlotAgreement: side1.available && side2.available
        ? JSON.stringify(side1.voiceSlots) === JSON.stringify(side2.voiceSlots)
        : null,
      fullScreenGraphicVariants: {
        leftDirect: leftGraphicRule(record.record, false),
        leftPlus50: leftGraphicRule(record.record, true),
        rightDirect: rightGraphicRule(record.record, false),
        rightPlus50: rightGraphicRule(record.record, true),
      },
    };
  });
  const soldierCommands = classRecords.find((record) => record.record === 0);
  const archerCommands = classRecords.find((record) => record.record === 20);
  const warriorCommands = classRecords.find((record) => record.record === 28);
  assert(
    soldierCommands.side1.commandStreams.auxiliaryA.steps
      .map((step) => `${step.pose.frame}:${step.pose.deltaX}`).join(",") === "4:-40,0:-40,0:-40"
      && soldierCommands.side2.commandStreams.auxiliaryA.steps
        .map((step) => `${step.pose.frame}:${step.pose.deltaX}`).join(",") === "4:40,0:40,0:40",
    "soldier post-hit settle/exit stream changed",
  );
  assert(
    archerCommands.side1.commandStreams.mainLeftOrAttacker.steps
      .map((step) => step.pose.frame).join(",") === "0,1,2,3,4,4,4",
    "archer side1 strike frame sequence changed",
  );
  assert(
    archerCommands.side2.commandStreams.mainLeftOrAttacker.steps
      .map((step) => step.pose.frame).join(",") === "0,1,2,3,4,4,4",
    "archer side2 strike frame sequence changed",
  );
  for (const [side, expectedStartX, expectedDeltaX] of [
    ["side1", 146, 6],
    ["side2", 336, -6],
  ]) {
    const release = archerCommands[side].commandStreams.mainLeftOrAttacker.steps[3];
    const projectile = release.commands.find((command) => command.token === "G1")?.linkedStream;
    assert(
      release.commands.some((command) => command.token === "V5")
        && projectile?.steps[0].commands[0].token === ":S"
        && projectile.steps[0].commands[0].parameters[0] === expectedStartX
        && projectile.steps.every((step) =>
          step.pose.frame === 5 && step.pose.deltaX === expectedDeltaX && step.pose.deltaY === 0),
      `archer ${side} release/projectile stream changed`,
    );
  }
  for (const side of ["side1", "side2"]) {
    const yOffsetPointer = Number.parseInt(
      archerCommands[side].anchorOrOffsetTablePointers[1].slice(3),
      16,
    );
    assert(
      readWords(moduleBuffer, yOffsetPointer, 9).join(",") === "0,0,0,0,0,0,8,0,0",
      `archer ${side} frame y-offset table changed`,
    );
  }
  assert(
    warriorCommands.side1.commandStreams.mainLeftOrAttacker.steps
      .map((step) => step.pose.frame).join(",") === "0,2,3,3"
      && warriorCommands.side2.commandStreams.mainLeftOrAttacker.steps
        .map((step) => step.pose.frame).join(",") === "0,2,3,3",
    "warrior strike frame sequence changed",
  );
  assert(
    warriorCommands.side1.commandStreams.auxiliaryA.steps
      .every((step) => step.pose.frame === 4 && step.pose.deltaX === -32)
      && warriorCommands.side2.commandStreams.auxiliaryA.steps
        .every((step) => step.pose.frame === 4 && step.pose.deltaX === 32),
    "warrior post-hit contact stream changed",
  );
  const stage0ReactionCommands = [
    {
      classRecord: 0,
      className: "士兵",
      side: "side1",
      hurtVoice: 0x939d,
      hurtPose: 0x8812,
      guardVoice: 0x93b5,
      guardPose: 0x8824,
    },
    {
      classRecord: 0,
      className: "士兵",
      side: "side2",
      hurtVoice: 0xbed5,
      hurtPose: 0x8812,
      guardVoice: 0xbeed,
      guardPose: 0x8824,
    },
    {
      classRecord: 22,
      className: "騎兵",
      side: "side1",
      hurtVoice: 0xaf97,
      hurtPose: 0xafb1,
      guardVoice: 0xafc9,
      guardPose: 0xafe5,
    },
    {
      classRecord: 22,
      className: "騎兵",
      side: "side2",
      hurtVoice: 0xdaf1,
      hurtPose: 0xdb0b,
      guardVoice: 0xdb23,
      guardPose: 0xdb3f,
    },
  ].map((entry) => {
    const classRecord = classRecords.find((record) => record.record === entry.classRecord);
    assert(classRecord !== undefined, `missing stage-0 class record ${entry.classRecord}`);
    assert(classRecord[entry.side].voiceSlots.V1 === 2,
      `${entry.className} ${entry.side}: V1 must resolve to E/2`);
    assert(classRecord[entry.side].voiceSlots.V2 === 0,
      `${entry.className} ${entry.side}: V2 must resolve to E/0`);
    return {
      classRecord: entry.classRecord,
      className: entry.className,
      side: entry.side,
      hurt: {
        voiceCommand: {
          ...verifiedWord(moduleBuffer, entry.hurtVoice, 0x5631, `${entry.className} hurt voice command`),
          token: "V1",
          soundResource: "E/2",
        },
        pose: {
          ...verifiedWord(moduleBuffer, entry.hurtPose, 1, `${entry.className} hurt pose`),
          directFrame: 1,
        },
      },
      guard: {
        voiceCommand: {
          ...verifiedWord(moduleBuffer, entry.guardVoice, 0x5632, `${entry.className} guard voice command`),
          token: "V2",
          soundResource: "E/0",
        },
        pose: {
          ...verifiedWord(moduleBuffer, entry.guardPose, 3, `${entry.className} guard pose`),
          directFrame: 3,
        },
      },
    };
  });

  const resourceRefs = [
    { group: "UN", record: 62 },
    { group: "MAGIC", record: 12 },
  ];
  for (const record of classRecords) {
    resourceRefs.push(...Object.values(record.fullScreenGraphicVariants));
  }
  const resources = await loadResourceCatalog(
    extractedRoot, decodedRoot, planarRoot, resourceRefs,
  );
  const renderedFrameCount = (variant) =>
    resources.find((entry) => entry.key === `${variant.group}/${variant.record}`)
      ?.renderedFrames ?? 0;
  for (const record of classRecords) {
    const leftFrameCount = Math.max(
      renderedFrameCount(record.fullScreenGraphicVariants.leftDirect),
      renderedFrameCount(record.fullScreenGraphicVariants.leftPlus50),
    );
    const rightFrameCount = Math.max(
      renderedFrameCount(record.fullScreenGraphicVariants.rightDirect),
      renderedFrameCount(record.fullScreenGraphicVariants.rightPlus50),
    );
    const descriptorRecord = descriptors.records.find((entry) => entry.record === record.record);
    for (const [side, frameCount, role] of [
      [record.side1, leftFrameCount, "side1"],
      [record.side2, rightFrameCount, "side2"],
    ]) {
      if (!side.available) continue;
      const [xPointer, yPointer] = side.anchorOrOffsetTablePointers.map((address) =>
        Number.parseInt(address.slice(3), 16));
      // Presentation block +2/+4: only the current actor's +50 frames use these.
      side.framePlacement = {
        frameCount,
        xAnchor: Array.from({ length: frameCount }, (_, index) =>
          readSignedWord(moduleBuffer, xPointer + index * 2)),
        yOffset: Array.from({ length: frameCount }, (_, index) =>
          readSignedWord(moduleBuffer, yPointer + index * 2)),
      };
      side.defenderFramePlacement = defenderFramePlacement(
        moduleBuffer,
        sideDescriptor(descriptorRecord, role),
      );
    }
  }
  const expectDefenderPlacement = (recordNumber, role, xAnchor, yOffset, evidence) => {
    const placement = classRecords.find((record) => record.record === recordNumber)?.[role]
      ?.defenderFramePlacement;
    assert(placement?.xAnchor.join(",") === xAnchor.join(",")
      && placement.yOffset.join(",") === yOffset.join(","),
    `record ${recordNumber} ${role} defender placement changed (${evidence})`);
  };
  // 第 0 关 75 fps 录像：右侧士兵入场左缘 346/306 → 通道 x 370/330，受击左缘 249 → x 290；
  // 左侧士兵反击入场左缘 6..126 → x 50..170，受击左缘 168 → x 210。
  expectDefenderPlacement(0, "side1", [44, 42, 40, 35], [0, 0, 0, 0], "stage-0 capture");
  expectDefenderPlacement(0, "side2", [24, 41, 70, 42], [0, 0, 0, 0], "stage-0 capture");
  // 用户 2026-09-27 提供的原版截图：右侧神劍戰士倒地图左缘 232、顶 97，y>=135 行不可见。
  expectDefenderPlacement(27, "side2", [50, 19, 58, 19], [0, 0, 21, 0], "divine sword death capture");
  const swiftDragonPlacement = classRecords.find((record) => record.record === 18);
  assert(swiftDragonPlacement !== undefined, "missing swift dragon knight record 18");
  for (const side of [swiftDragonPlacement.side1, swiftDragonPlacement.side2]) {
    // -16 belongs to the attacker's +50 frame 3; the defender's direct guard
    // frame reads the descriptor +04h table and stays on the ground line.
    assert(side.framePlacement?.yOffset[3] === -16,
      "swift dragon knight +50 frame 3 must retain the original -16 y-offset");
    assert(side.defenderFramePlacement?.yOffset[3] === 0,
      "swift dragon knight direct guard frame 3 must use the grounded defender table");
  }

  const voiceRecords = classRecords.flatMap((record) =>
    [record.side1, record.side2].flatMap((side) =>
      side.available ? Object.values(side.voiceSlots) : []));
  voiceRecords.push(11, 38);

  const mapHitDescriptor = {
    address: "DS:6B61",
    xOffset: readSignedWord(moduleBuffer, 0x6b61),
    yOffset: readSignedWord(moduleBuffer, 0x6b63),
    width: readWord(moduleBuffer, 0x6b65),
    height: readWord(moduleBuffer, 0x6b67),
    dynamicTileCodeAddress: "DS:6B69",
  };
  assert(mapHitDescriptor.width === 1 && mapHitDescriptor.height === 1,
    "map hit descriptor must be 1x1");

  const deathStepCounts = readTerminatedWords(moduleBuffer, 0x7d4c);
  assert(deathStepCounts.values.length === 6 &&
    deathStepCounts.values.every((value) => value === 4),
  "full-screen death sequence must be six four-substep poses");

  // Channel ground clip and main-channel shadow, read from signed immediates.
  const bufferRowBytes = sameCodeWord(moduleBuffer, ["0000:E073", "0000:E318"],
    "channel buffer row stride");
  const lastDrawnBufferOffset = sameCodeWord(moduleBuffer, ["0000:DFB8", "0000:E216"],
    "channel ground clip");
  assert(bufferRowBytes === 56 && lastDrawnBufferOffset % bufferRowBytes === 0,
    "channel ground clip must fall on a 56-byte buffer row boundary");
  const firstClippedRow = lastDrawnBufferOffset / bufferRowBytes;
  assert(firstClippedRow === 135, "channel ground clip must start at the y=135 ground line");
  const shadowTop = sameCodeWord(moduleBuffer, ["0000:B182", "0000:B31E"],
    "main-channel shadow row");
  const shadowLastDrawnOffset = sameCodeWord(moduleBuffer, ["0000:E50E", "0000:E5C3"],
    "main-channel shadow clip");
  const byteMask = (address) => {
    const value = readCodeWord(moduleBuffer, address);
    assert((value >> 8) === (value & 0xff), `${address}: shadow mask bytes must match`);
    return value & 0xff;
  };
  const byteAlignedRowMasks = [byteMask("0000:E516"), byteMask("0000:E52D")];
  const shiftedRowMasks = [byteMask("0000:E5CC"), byteMask("0000:E5FB")];
  assert(byteAlignedRowMasks.join(",") === "170,170" && shiftedRowMasks.join(",") === "85,170",
    "main-channel shadow dither masks changed");
  // E4AF/E55A run three two-row passes (`add di,70h`); the second is entered
  // with `dec di` and two extra bytes, widening it by 8 px on each side.
  const shadowPasses = [0, 8, 0].map((sideExtension, index) => ({
    firstRow: shadowTop + index * 2,
    rows: 2,
    sideExtension,
  }));

  // Channel persistence, hold and survivor stream, read from the verified code.
  const nearCallTarget = (address) => {
    const { linear } = parseAddress(address);
    return (linear + 3 + checkedSlice(moduleBuffer, linear + 1, linear + 3, address).readInt16LE(0))
      & 0xffff;
  };
  const codeByte = (address) => {
    const { linear } = parseAddress(address);
    return checkedSlice(moduleBuffer, linear, linear + 1, address)[0];
  };
  for (const [address, target] of [
    ["0000:A231", 0xa7c3],
    ["0000:A234", 0xad36],
    ["0000:AD57", 0xb4f1],
    ["0000:AD5A", 0xb3bd],
    ["0000:B69C", 0xa7e0],
    ["0000:B69F", 0xa9e6],
    ["0000:B6D6", 0xa7e0],
    ["0000:B6D9", 0xa9e6],
  ]) {
    assert(nearCallTarget(address) === target,
      `${address}: expected a call to 0000:${hex(target)}, found 0000:${hex(nearCallTarget(address))}`);
  }
  // A7C3 `cmp bx,6` skips the main channel; AD36 `cmp word [7C33],14h`.
  const keptChannelOffset = codeByte("0000:A7CE");
  const holdDrawLimit = codeByte("0000:AD48");
  assert(keptChannelOffset === 6, "A7C3 must keep only the main channel offset 6");
  assert(holdDrawLimit === 20, "AD36 must redraw until 20 post-strike draws");
  const survivorStreamOffset = sameCodeWord(moduleBuffer, ["0000:B6B2", "0000:B6EC"],
    "death survivor stream");
  assert(readCodeWord(moduleBuffer, "0000:B6AC") === 0x7d5a
    && readCodeWord(moduleBuffer, "0000:B6E6") === 0x7d84,
  "B683/B6BD must install the left/right death streams on the dead side");
  const survivorScript = parseSimpleDeathScript(moduleBuffer, survivorStreamOffset, 6);
  assert(survivorStreamOffset === 0x7dae && survivorScript.commands.length === 0
    && survivorScript.poses.every((pose) =>
      pose.frame === 0 && pose.deltaX === 0 && pose.deltaY === 0),
  "the death survivor stream must be six still frame-0 poses without commands");

  // Damage number. A1E8 formats DS:7CD7 (EF56, then A2CF adds the minus),
  // A71F/A74F place it, and B4F1 draws it on every AD70 substep and AD51 hold
  // redraw once DS:7C32 is 'Y', moving it after each draw.
  for (const [address, target] of [
    ["0000:A18D", 0xa1e8],
    ["0000:A190", 0xb683],
    ["0000:A193", 0xb6bd],
    ["0000:A1C8", 0xa1e8],
    ["0000:A1CB", 0xb683],
    ["0000:A1CE", 0xb6bd],
    ["0000:A206", 0xef56],
    ["0000:A209", 0xa2cf],
    ["0000:A7BD", 0xacc4],
    ["0000:ACDB", 0xad70],
    ["0000:AD7F", 0xb04a],
    ["0000:AD8E", 0xb4f1],
    ["0000:AD91", 0xb3bd],
    ["0000:AD54", 0xb04a],
    ["0000:B4FC", 0xb518],
    ["0000:B4FF", 0xb639],
    ["0000:B527", 0xb52f],
    ["0000:B52B", 0xb5b4],
    ["0000:B648", 0xf3c6],
    ["0000:B6B4", 0xa7a4],
    ["0000:B6EE", 0xa7a4],
    ["0000:F3FF", 0xf4fb],
    ["0000:F509", 0xf584],
  ]) {
    assert(nearCallTarget(address) === target,
      `${address}: expected a call to 0000:${hex(target)}, found 0000:${hex(nearCallTarget(address))}`);
  }
  const damageFlagWrites = [];
  for (let linear = 0; linear + 5 <= moduleBuffer.length; linear += 1) {
    if (moduleBuffer[linear] === 0xc6 && moduleBuffer[linear + 1] === 0x06
      && moduleBuffer.readUInt16LE(linear + 2) === 0x7c32) {
      damageFlagWrites.push({ address: `0000:${hex(linear)}`, value: String.fromCharCode(moduleBuffer[linear + 4]) });
    }
  }
  assert(JSON.stringify(damageFlagWrites) === JSON.stringify([
    { address: "0000:A1E8", value: "N" },
    { address: "0000:A1F5", value: "Y" },
  ]), "only A1E8 may write DS:7C32: 'N' before the strike stream and 'Y' after the origin callback");
  assert(codeByte("0000:B4F5") === 0x4e, "B4F1 must skip the draw while DS:7C32 is 'N'");

  const origin = {
    y: sameCodeWord(moduleBuffer, ["0000:A730", "0000:A740", "0000:A760", "0000:A770"], "damage origin y"),
    xSubtrahend: sameCodeWord(moduleBuffer, ["0000:A739", "0000:A749", "0000:A769", "0000:A779"],
      "damage origin x offset"),
    rightVictimX: sameCodeWord(moduleBuffer, ["0000:A736", "0000:A766"], "right victim main x"),
    leftVictimX: sameCodeWord(moduleBuffer, ["0000:A746", "0000:A776"], "left victim main x"),
  };
  // Right channels start at DS:7B2C, left at DS:7AA6; offset 6 is the main channel.
  assert(origin.rightVictimX === 0x7b2c + 6 && origin.leftVictimX === 0x7aa6 + 6,
    "A71F/A74F must read the victim's main-channel x");
  // A71F branches on the primary attacker's side (1 -> right victim), A74F on
  // the same unit for the counter (2 -> right victim): always the struck side.
  assert(codeByte("0000:A727") === 1 && codeByte("0000:A72B") === 2
    && codeByte("0000:A757") === 2 && codeByte("0000:A75B") === 1,
  "A71F/A74F must place the number at the struck unit's main channel");

  const leftActorVelocity = decodeDamageVelocityTable(moduleBuffer, "0000:B52F");
  const rightActorVelocity = decodeDamageVelocityTable(moduleBuffer, "0000:B5B4");
  assert(JSON.stringify(rightActorVelocity) === JSON.stringify({
    bands: leftActorVelocity.bands.map(({ drawsBelow, dx, dy }) => ({ drawsBelow, dx: -dx, dy })),
    otherwise: { dx: -leftActorVelocity.otherwise.dx, dy: leftActorVelocity.otherwise.dy },
  }), "B5B4 must mirror B52F horizontally");
  assert(leftActorVelocity.otherwise.dx === 0 && leftActorVelocity.otherwise.dy === 0,
    "the number must stop once the counter passes the last band");
  assert(readCodeWord(moduleBuffer, "0000:B51A") === 0x7a00 && codeByte("0000:B51C") === 1
    && readCodeWord(moduleBuffer, "0000:B521") === 0x7a00 && codeByte("0000:B523") === 2,
  "B518 must pick B52F for the side-1 actor and B5B4 for the side-2 actor");

  const strikeInkIndex = movWordImmediate(moduleBuffer, "0000:A20F", 0xf93c);
  const afterStrikeInkIndex = movWordImmediate(moduleBuffer, "0000:A237", 0xf93c);
  const shadowColorWrites = [];
  for (let linear = 0; linear + 6 <= moduleBuffer.length; linear += 1) {
    if (moduleBuffer[linear] === 0xc7 && moduleBuffer[linear + 1] === 0x06
      && moduleBuffer.readUInt16LE(linear + 2) === 0xf93e) {
      shadowColorWrites.push({ address: `0000:${hex(linear)}`, value: moduleBuffer.readUInt16LE(linear + 4) });
    }
  }
  assert(shadowColorWrites.length > 0 && shadowColorWrites.every(({ address }) => {
    const { linear } = parseAddress(address);
    return linear < 0xa17b || linear >= 0xb6f7;
  }), "the full-screen combat code must leave the DS:F93E shadow colour alone");
  assert(readWord(moduleBuffer, 0xf93e) === 0, "DS:F93E must start at palette 0");
  assert(shadowColorWrites.at(-1).value === 0,
    "the last DS:F93E writer in module 29 must restore palette 0");

  const fieldBytes = checkedSlice(moduleBuffer, dsLinear(0x7c3d), dsLinear(0x7c43), "DS:7C3D");
  assert(fieldBytes.toString("latin1") === "00000$",
    "DS:7C3D must hold a five-character field terminated by '$'");
  assert(readCodeWord(moduleBuffer, "0000:A204") === 0x7c3d
    && readCodeWord(moduleBuffer, "0000:A201") === 0x7cd7,
  "A1E8 must format DS:7CD7 into DS:7C3D");
  assert(readCodeWord(moduleBuffer, "0000:A2D4") === 0x7c3e && codeByte("0000:A2D7") === 0x20
    && codeByte("0000:A2DB") === 0xe2 && codeByte("0000:A2DE") === 0x2d
    && readCodeWord(moduleBuffer, "0000:A2E1") === 0x7c3d,
  "A2CF must LOOP over spaces from DS:7C3E and write '-' one byte before the stop");
  assert(readCodeWord(moduleBuffer, "0000:B646") === 0x7c3d,
    "B639 must draw the formatted DS:7C3D string");

  const glyphPasses = decodeGlyphPasses(moduleBuffer, "0000:F50C", "0000:F572");
  assert(glyphPasses.length === 4
    && glyphPasses.every(({ glyphDescriptor, targetBuffer }) =>
      glyphDescriptor === "DS:FA5C" && targetBuffer === "DS:02B9")
    && glyphPasses.slice(0, 3).every(({ colorVariable }) => colorVariable === "DS:F93E")
    && glyphPasses[3].colorVariable === "DS:F93C"
    && glyphPasses[3].dx === 0 && glyphPasses[3].dy === 0,
  "F4FB must stamp three DS:F93E passes and then the DS:F93C ink at the origin");
  assert(readCodeWord(moduleBuffer, "0000:F574") === 0xf8ba && codeByte("0000:F576") === 8
    && codeByte("0000:F503") === 0x20 && codeByte("0000:F505") === 0x6c,
  "F4FB must advance 8 after a glyph and skip a space with the same advance");
  assert(codeByte("0000:F4FC") === 0x7c && readCodeWord(moduleBuffer, "0000:F580") === 0xf8bc,
    "F4FB must treat '|' as a line break");
  assert(readWord(moduleBuffer, 0xfa5c) === 1 && readWord(moduleBuffer, 0xfa5e) === 16
    && codeByte("0000:F59E") === 8
    && readCodeWord(moduleBuffer, "0000:F5A0") === 0xaaac && codeByte("0000:F5A2") === 0xaa
    && readCodeWord(moduleBuffer, "0000:F58D") === 0xfa6e
    && readCodeWord(moduleBuffer, "0000:F599") === 0xf000,
  "F584 must copy the eight ROM rows at F000:FA6E twice each into the 1x16-byte DS:FA5C glyph");
  assert(readCodeWord(moduleBuffer, "0000:F5F4") === 0 && codeByte("0000:F5F6") === 0x7f
    && readCodeWord(moduleBuffer, "0000:F5F9") === 1,
  "F5C8 must draw any x <= 0 at x = 1");
  const stringTerminators = ["0000:F3E6", "0000:F3ED", "0000:F3F4"].map((address) =>
    String.fromCharCode(codeByte(address)));
  assert(stringTerminators.join("") === "\r$\0", "F3C6 must stop at CR, '$' and NUL");

  const damageNumber = {
    placement: {
      entries: { primary: "0000:A71F", counter: "0000:A74F" },
      xSource: {
        rightVictim: `DS:${hex(origin.rightVictimX)}`,
        leftVictim: `DS:${hex(origin.leftVictimX)}`,
      },
      xOffset: -origin.xSubtrahend,
      y: origin.y,
      rule: "after the strike stream, DS:7C35 = the struck unit's main-channel x - 20 and DS:7C37 = 120, in the battle-window coordinates of every channel",
    },
    drawGate: {
      flag: "DS:7C32",
      writers: damageFlagWrites,
      counter: "DS:7C33",
      rule: "B4F1 clears DS:7C33 while DS:7C32 is 'N' (the whole strike stream); once A1E8 sets 'Y' every B4F1 call counts a draw, picks the velocity for that count, draws, then adds the velocity. Nothing clears the flag before the next A1E8, so the death stream's AD70 substeps keep drawing it",
      callers: [
        "AD70 (every post-hit and death-stream substep), after the channels (B04A) and before the common trail (B3BD)",
        "AD51 (every AD36 hold redraw), in the same order",
      ],
    },
    velocity: {
      selector: "0000:B518 reads the acting side DS:7A00: 1 -> B52F, 2 -> B5B4",
      leftActor: leftActorVelocity,
      rightActor: rightActorVelocity,
      applied: "after the draw, so draw k is at the origin plus the velocities of draws 1..k-1",
    },
    field: {
      formatter: "0000:EF56",
      address: "DS:7C3D",
      characters: fieldBytes.length - 1,
      terminator: "$",
      digits: "five decimal digits; leading zeroes become spaces except the last digit",
      sign: {
        inserter: "0000:A2CF",
        character: "-",
        scanFrom: 1,
        loopCounter: "CX still holds DS:7CD7: EF56 divides with AX/BX/DX only",
        rule: "starting at the second byte, skip spaces with LOOP (decrement CX, continue while CX != 0), then write the minus one byte before where the scan stopped; damage 1 and 2 run out of CX early and leave a space between the minus and the digit",
      },
    },
    glyph: {
      drawer: "0000:F3C6",
      halfWidthGlyph: "0000:F4FB",
      romRows: codeByte("0000:F59E"),
      cellRows: readWord(moduleBuffer, 0xfa5e),
      cellWidth: readWord(moduleBuffer, 0xfa5c) * 8,
      romFont: "F000:FA6E",
      rowDoubling: "F584 stores every ROM row twice (lodsb, stosb, stosb)",
      passes: glyphPasses,
      advance: codeByte("0000:F576"),
      spaceAdvance: codeByte("0000:F576"),
      terminators: stringTerminators,
      lineBreak: { character: "|", resetsToStartX: true, deltaY: codeByte("0000:F582") },
      blit: "F5C8 ORs set glyph bits into the colour's planes and clears them in the others; clear bits leave the buffer untouched. The target DS:02B9 is the battle buffer the channels use (56-byte rows); nothing clips it to the window or the y=135 ground line",
      clampNonPositiveXTo: readCodeWord(moduleBuffer, "0000:F5F9"),
      unreachableSkip: "F3FA skips ASCII bytes while DX == 'Y'; B4F1 is always reached after B04A has drawn a channel, whose DD8E return leaves DX below 56",
    },
    ink: {
      variable: "DS:F93C",
      strikeColorIndex: strikeInkIndex,
      strikeSetAt: "0000:A20F, before the post-hit stream",
      resetColorIndex: afterStrikeInkIndex,
      resetAt: "0000:A237, when A1E8 returns after the AD36 hold",
      deathStream: "B683/B6BD run after A1E8 returns, so a fatal strike's death-stream draws use the reset colour",
    },
    shadow: {
      variable: "DS:F93E",
      colorIndex: readWord(moduleBuffer, 0xf93e),
      writers: shadowColorWrites,
    },
    restAfterDraw: leftActorVelocity.bands.at(-1).drawsBelow,
  };

  const result = {
    format: "ANGEL2 ordinary combat presentation rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    source: {
      path: modulePath,
      bytes: moduleBuffer.length,
      sha256: sha256(moduleBuffer),
      dataLinearBase: DATA_LINEAR_BASE,
      descriptors: {
        path: descriptorsPath,
        bytes: descriptorsBuffer.length,
        sha256: sha256(descriptorsBuffer),
      },
      audioManifest: {
        path: audioManifestPath,
        bytes: audioBuffer.length,
        sha256: sha256(audioBuffer),
      },
    },
    verifiedCodeSignatures: validateCodeSignatures(moduleBuffer),
    verifiedDataSignatures: validateDataSignatures(moduleBuffer),
    dispatch: {
      address: "0000:926B",
      selector: "DS:1119 bit 0",
      mapWhen: 0,
      fullScreenWhen: 1,
      sharedCounterSuppression: [
        "primary damage leaves either mirrored life at zero",
        "attacker class code is 0G (巨斧戰士)",
        "defender per-unit disable byte is nonzero",
      ],
    },
    soundDriver: {
      playLoadedFarEntry: "0000:0220",
      settingsGatedEntry: "0000:0228",
      worker: "0000:0254",
      fullScreenVoiceGate: "DS:10ED bit 0 must be set before V1..V5 requests reach the worker",
      workerNoOpGate: "DS:000A == 'Y' makes the worker return without requesting playback",
      workerEffect: "stores the loaded segment at DS:000B, sets DS:F593=1 around 1000:EB83, then clears DS:F593",
    },
    mapPresentation: {
      primaryEntry: "0000:91C5",
      counterEntry: "0000:9135",
      sequenceEntry: "0000:927A",
      hitAndDamageEntry: "1000:6B58",
      hit: {
        graphicResource: "UN/62",
        soundResource: "E/38",
        descriptor: mapHitDescriptor,
        frameTimeline: [
          { tileCodes: [0, 1, 2, 3], eachWaitNativeTicks: 10 },
          { event: "second E/38 playback request", afterTileCode: 3 },
          { tileCodes: [4, 5, 6, 7], eachWaitNativeTicks: 10 },
          { tileCodes: [0], eachWaitNativeTicks: 10, role: "return to first slash frame" },
        ],
        firstSoundRequest: "after E/38 load and before tile code 0",
        secondSoundRequest: "after tile code 3 and before tile code 4",
        totalGraphicFrames: 9,
        fixedGraphicWaitNativeTicks: 90,
        damageTimeline: {
          gate: "DS:6B60 == 'Y'",
          damagePoints: "DS:5230, sourced from primary DS:77D3 or counter DS:77D5",
          waitPerAppliedPointNativeTicks: 1,
          behavior: "0000:6507 applies at most one life point, redraws, waits, and stops early when it returns 'N'",
        },
      },
      death: {
        entry: "1000:6ABC",
        graphicResource: "MAGIC/12",
        tileCodeRule: "0 is blank; values 1..38 select rendered MAGIC/12 frames 0..37",
        phase1BeforeBoardErase: mapDeathPhase1Pointers.map((pointer) =>
          decodeMapDescriptor(moduleBuffer, pointer)),
        boardEraseBoundary: "after all six phase-1 descriptors, clear the current unit slot and board side/slot bytes",
        phase2AfterBoardErase: mapDeathPhase2Pointers.map((pointer) =>
          decodeMapDescriptor(moduleBuffer, pointer)),
        waitPerDescriptorNativeTicks: 10,
        descriptorCount: 15,
        fixedWaitNativeTicks: 150,
        directSoundRequest: null,
      },
    },
    fullScreenPresentation: {
      prepareEntry: "0000:9852",
      sequenceEntry: "0000:A17B",
      strikeEntry: "0000:A1E8",
      commandInterpreter: "0000:A77F",
      coordinateSystem: {
        compositor: {
          leftEntry: "0000:B0FF",
          rightEntry: "0000:B29B",
          xFormula: "channelX - frameXAnchor",
          yFormula: "channelY - bitmapHeight + frameYOffset",
          conclusion: "both physical sides consume the same channel coordinate system; each class side owns two frame placement tables, one for the current actor's +50 frames and one for the defender's four direct frames",
        },
        framePlacementTables: {
          descriptorCopy: "0000:51EC copies the unit descriptor +04h word pair to runtime block +2/+4 (DS:31D5) and the +10h presentation block twice, to +6 (counter) and +20h (primary)",
          actor: "A49D/A413 (left actor) and A623/A599 (right actor) load the actor sub-block's x-anchor/y-offset pointers, so only +50 frames read framePlacement",
          defender: "the same setups load the defending side's runtime block +2/+4 (DS:7C9F/7CA1 or DS:7C65/7C67) into its compositor pointers DS:7AFE/7B00 or DS:7A78/7A7A, so stand, hurt, death and guard read defenderFramePlacement",
          defenderTableShape: "four signed x anchors follow the +04h pair, then four own y offsets or the shared zero table DS:87F6; the +10h presentation block starts right after them",
          defenderLinkedChannels: "no defender-side command stream issues G1..G5, so the defender tables only ever project direct frames 0..3",
        },
        groundClip: {
          drawRows: "0000:DF86",
          maskRows: "0000:E1F9",
          bufferRowBytes,
          lastDrawnBufferOffset,
          firstClippedRow,
          effect: "both routines skip every byte past the last drawn buffer offset, so channel bitmap rows at or below the y=135 ground line are never drawn; frames whose y offset lowers them past that line lose their bottom rows",
          scope: "all five channels of both sides and the B3BD common trail; only the first byte of the first clipped row passes the unsigned comparison",
        },
        mainChannelShadow: {
          entry: "0000:E336",
          callers: "B0FF/B29B call it only for channel offset 6 (the character main channel), after that channel's E090 mask and before its DD8E bitmap",
          passes: shadowPasses,
          horizontalSpan: "each pass covers the bitmap's own pixels [left, left+width), widened by sideExtension on both sides",
          byteAlignedRowMasks,
          shiftedRowMasks,
          maskMeaning: "each pass ANDs its first mask into its first row and its second mask into its second row on all four planes; a clear bit (MSB = leftmost pixel) becomes palette colour 0",
          alignment: "a byte-aligned left edge (left % 8 == 0) takes E4AF; any other alignment takes E55A, which masks only the bitmap's shifted pixel span",
          lastDrawnBufferOffset: shadowLastDrawnOffset,
          verticalClip: "the shadow's own limit is far below the window, so it is not cut at the ground line",
          edgeWrap: "the shifted loop clips by its first byte only: at the right window edge its second byte spills into the next row's first pixels, and at the left edge the first partial byte is skipped",
        },
        drawOrder: {
          substep: "0000:AD70 draws the background (AEC3), the character channels (B04A), B4F1 and the common trail (B3BD) into the buffer, then presents it",
          channels: "B04A runs B224 when side 1 acts ([7A00]=1) and B088 when side 2 acts; both walk channel offsets 8,6,4,2,0 and draw the defending side before the acting side at each offset",
          tokenChannels: "G1..G5 re-point channel offsets 0,2,4,6,8; the released tables only use G1 (drawn last) and G5 (drawn before both main channels)",
          commonTrail: "B3BD runs after B04A and B4F1 in both AD70 and the AD51 hold draw, so the common trail covers every channel bitmap, including G1",
        },
        channelState: {
          storage: {
            left: {
              streamPointer: "DS:7A7E",
              x: "DS:7AA6",
              y: "DS:7AB0",
              latchedFrame: "DS:7A88",
              poseFrame: "DS:7ABA",
              deltaX: "DS:7AC4",
              deltaY: "DS:7ACE",
              animationMode: "DS:7A92",
              animationCounter: "DS:7A9C",
            },
            right: {
              streamPointer: "DS:7B04",
              x: "DS:7B2C",
              y: "DS:7B36",
              latchedFrame: "DS:7B0E",
              poseFrame: "DS:7B40",
              deltaX: "DS:7B4A",
              deltaY: "DS:7B54",
              animationMode: "DS:7B18",
              animationCounter: "DS:7B22",
            },
            layout: "each table holds one word for each channel offset 0,2,4,6,8; offset 6 is the character main channel",
          },
          initialization: "A2E4/A377 call B061 (left) and B1FD (right), giving every channel of a side the same x, y=135, latched frame 0 and animation mode XN; the animation counter is left untouched",
          stepParse: "A77F/A7A4 read one pose per active channel through A80F (left) and AA15 (right); :S (A8EF/AAF5) is the only command that writes a channel's x and y",
          frameLatch: "ACC4 latches every active channel's pose frame before the step's substeps (B0B7/B253)",
          draw: "B0FF/B29B pass the latched frame through B1A8/B344 on every draw: :X toggles the counter, X4/X6 advance it modulo 4/6, any other mode clears it, and the drawn frame is the latched frame plus the counter",
          accumulation: "after each drawn substep ACC4 adds dx/dy to every active channel (B0D7/B273), so a stream ends one increment past its last drawn position",
          positionWriters: "only :S, the initializers B061/B1FD and the accumulators B0D7/B273 write channel x/y; A71F/A74F only place the damage number at DS:7C35/7C37 and A24D/A28E only re-point stream pointers",
          persistence: "the post-hit, hold and death streams therefore continue each channel's x, y, animation mode and counter; nothing returns a channel to the ground line or restarts its counter between them",
        },
        characterInitialization: {
          primaryEntry: "0000:A2E4",
          counterEntry: "0000:A377",
          actor: { x: 250, y: 135 },
          opponentByActorSide: {
            left: { x: 650, y: 135 },
            right: { x: -150, y: 135 },
          },
          counterBehavior: "A377 initializes the counter actor at x=250 and the opponent at the opposite off-screen entry exactly like A2E4; it does not inherit either primary-strike character x",
        },
      },
      commonTrail: {
        drawEntry: "0000:B3BD",
        graphicResource: "A/26",
        subjectCoordinates: {
          attacker: "DS:7AAC (main slot DS:7AA6 + 6)",
          defender: "DS:7B32 (main slot DS:7B2C + 6)",
          slotEvidence: "0000:A7C3 clears every sprite slot except offset 6",
        },
        classOrFrameLookup: "none; B3BD reads no class record, bitmap width, or x-anchor",
        branches: {
          attackerY: "subjectX - 40 - phase; particle spacing -24",
          attackerU: "subjectX + 40 + phase; particle spacing +24",
          defenderY: "subjectX + 40 + phase; particle spacing +24",
          defenderU: "subjectX - 40 - phase; particle spacing -24",
        },
        phase: "DS:7F4C advances by 4 and wraps to 0 after 24",
        verticalCoordinates: [124, 120, 115],
        conclusion: "all class records share the same main-channel coordinate formula; per-frame anchors only project the character bitmap",
      },
      attackerBlock: "0000:9F74 loads attacker cell DS:77BF, then 0000:9FC4/A01B copies its 58-byte presentation block to DS:7C63 according to side",
      defenderBlock: "0000:9F9C loads defender cell DS:77C1, then 0000:9FC4/A01B copies its 58-byte presentation block to DS:7C9D according to side",
      graphicSelection: {
        leftDirect: "0000:B748 normally loads M_00[class]; requested class 1 is remapped to Y_00/41",
        leftPlus50: "0000:B725 requests class+50 through B748; requested record 51 is remapped to Y_00/42",
        rightDirect: "direct loader uses Y_00[class]",
        rightPlus50: "0000:B730 uses Y_00[class+50]",
        primaryAttackerSide1: "leftPlus50(attacker DS:7C63), rightDirect(defender DS:7C9D)",
        primaryAttackerSide2: "leftDirect(attacker DS:7C63), rightPlus50(defender DS:7C9D)",
        counter: "0000:A377 preserves the two loaded class blocks but selects the opposite unit command data; exact branches are retained in the verified code signatures",
      },
      voiceCommands: {
        table: "each side descriptor block points to five E.SWF record numbers loaded into segments DS:0205/0209/020D/0211/0215",
        opcodes: {
          V1: "play loaded segment DS:0205",
          V2: "play loaded segment DS:0209",
          V3: "play loaded segment DS:020D",
          V4: "play loaded segment DS:0211",
          V5: "play loaded segment DS:0215",
        },
        semanticBoundary: "V1..V5 are positional command slots, not globally fixed meanings; each class command stream decides when a slot fires",
      },
      hitReaction: {
        selector: "0000:A23E",
        damageSource: "DS:7CD7 (the already-resolved primary or counter damage)",
        guard: {
          condition: "unsigned damage <= 10",
          setupEntry: "0000:A28E",
          stage0CommandPair: "auxiliaryC/auxiliaryD",
          voiceCommand: "V2",
          soundResource: "E/0",
          directFrame: 3,
        },
        hurt: {
          condition: "unsigned damage > 10",
          setupEntry: "0000:A24D",
          stage0CommandPair: "auxiliaryA/auxiliaryB",
          voiceCommand: "V1",
          soundResource: "E/2",
          directFrame: 1,
        },
        death: {
          ordering: "A1E8 always executes the threshold-selected post-hit stream before A17B calls the zero-life handlers B683/B6BD",
          soundResource: "E/11",
          directFrame: 2,
          composition: "threshold hit sound first, then the independent death sound and pose",
        },
        stage0CommandEvidence: stage0ReactionCommands,
      },
      lifeGauges: {
        redrawEntry: "0000:9E28",
        leftTierEntry: "0000:9E8C",
        rightTierEntry: "0000:9EED",
        damageOrdering: "A1E8 applies the saturated damage callback, formats DS:7CD7, then immediately calls 9E28 before selecting and executing the post-hit streams",
        panelNumbers: "prepared once before the strike sequence and not redrawn; the two gauge values do change at each impact",
        tierWidth: 210,
        gameplayPalette: {
          0: "#000000",
          6: "#f79e9e",
          7: "#baaa9a",
          9: "#4d8aff",
          11: "#ef2024",
          13: "#aee728",
        },
        tiers: [
          { life: "0..209", baseColorIndex: 0, fillColorIndex: 11, fillWidth: "life" },
          { life: "210..419", baseColorIndex: 11, fillColorIndex: 9, fillWidth: "life-210" },
          { life: "420..629", baseColorIndex: 9, fillColorIndex: 13, fillWidth: "life-420" },
          { life: "630..839", baseColorIndex: 6, fillColorIndex: 6, fillWidth: "life-630" },
        ],
        left: {
          outer: decodeDrawRectangle(moduleBuffer, 0x7e76),
          base: decodeDrawRectangle(moduleBuffer, 0x7d05),
          fill: decodeDrawRectangle(moduleBuffer, 0x7d19),
          shine: decodeDrawRectangle(moduleBuffer, 0x7e8a),
          anchor: "left; the active tier grows from x=104 toward the center",
        },
        right: {
          outer: decodeDrawRectangle(moduleBuffer, 0x7e80),
          base: decodeDrawRectangle(moduleBuffer, 0x7d0f),
          fill: decodeDrawRectangle(moduleBuffer, 0x7d23),
          shine: decodeDrawRectangle(moduleBuffer, 0x7e94),
          anchor: "right; x=326+(210-remainder) and the active tier grows toward x=535",
        },
      },
      strikeTimeline: [
        "prepare primary command/resource state at A2E4",
        "draw the composed battle background at AEC3",
        "A1E8 executes the strike command stream at DS:7C18",
        "invoke the attacker movement callback A71F/A74F",
        "invoke the primary/counter damage callback A096/A0C6 and render DS:7CD7 as the damage number",
        "replace DS:7C18 with DS:7C1A and execute the post-hit command stream",
        "clear the linked channels with A7C3 and run the AD36 hold",
        "run left and right zero-life death handlers B683/B6BD",
        "if neither unit died and suppression is false, repeat with A377 and the counter callbacks",
      ],
      hold: {
        entry: "0000:AD36",
        linkedChannelClear: "0000:A7C3 clears channel offsets 0,2,4,8 on both sides and keeps the main channels",
        keptChannelOffset,
        drawLimit: holdDrawLimit,
        drawCounter: "DS:7C33: B4F1 clears it while the strike stream runs (DS:7C32='N') and counts every drawn substep after it, so the hold starts at the post-hit substep count",
        loopCondition: "AD36 repeats AD51 while the left and right life-gauge remainders DS:7D1D/DS:7D27 are non-zero and DS:7C33 < drawLimit",
        draws: "max(0, drawLimit - post-hit substeps); none when either remainder is 0, i.e. after a fatal strike or when a side is left at exactly 210, 420 or 630 life",
        iteration: "AD51 draws the background (AEC3), both main channels (B04A), the damage number (B4F1) and the common trail (B3BD), presents and waits one native tick; ACC4 is not called, so channels keep their positions while B1A8/B344 still advance their animation counters",
      },
      damageNumber,
      death: {
        leftHandler: "0000:B683",
        rightHandler: "0000:B6BD",
        soundResource: "E/11",
        deathStepCounts,
        rendererSubsteps: deathStepCounts.values.reduce((sum, value) => sum + value, 0),
        leftScript: parseSimpleDeathScript(moduleBuffer, 0x7d5a, 6),
        rightScript: parseSimpleDeathScript(moduleBuffer, 0x7d84, 6),
        channelReset: "B683/B6BD call A7E0 and A9E6 to clear every channel pointer on both sides, then install the death stream on the dead side's main channel and the survivor stream on the other; channel x, y, latched frame, animation mode and counter carry over",
        survivorScript,
        survivorBehavior: "six frame-0 poses without commands: the surviving main channel keeps drawing frame 0 of its loaded set plus its inherited animation counter, with its E336 shadow, where the post-hit stream left it",
        commonTrailPlacement: {
          leftHandlerSlots: "B683 assigns DS:7A84=7D5A and DS:7B0A=7DAE, so UE is parsed by the physical-left stream",
          rightHandlerSlots: "B6BD assigns DS:7B0A=7D84 and DS:7A84=7DAE, so UE is parsed by the physical-right stream",
          leftDeath: "B3BD left-U branch: subjectX + 40 + phase, then +24 spacing (toward the window centre)",
          rightDeath: "B3BD right-U branch: subjectX - 40 - phase, then -24 spacing (toward the window centre)",
        },
        soundSynchronization: "both scripts begin with V1, so E/11 is requested when the first death pose is advanced; the request still passes the DS:10ED sound-setting gate",
      },
      classRecordCount: classRecords.length,
      bothSidesAvailableRecords: classRecords.filter(
        (record) => record.side1.available && record.side2.available,
      ).length,
      side2OnlyRecords: classRecords.filter(
        (record) => !record.side1.available && record.side2.available,
      )
        .map((record) => record.record),
      side2OnlyReason: "记录 36/37/38 只在 side 2 编队出现（龍：场景 20/22；頭与两只手：场景 37），"
        + "所以原版只填了 side 2 表现块与 Y_00 图形；side 1 块整体指向零占位，M_00/36..38 是 3 字节占位、"
        + "M_00/86..88 缺失。这是“左侧不可达”，不是“没有普通全屏动画”。",
      sideVoiceSlotAgreementRecords: classRecords.filter(
        (record) => record.voiceSlotAgreement === true,
      ).length,
      sideVoiceSlotDifferenceRecords: classRecords.filter(
        (record) => record.voiceSlotAgreement === false,
      )
        .map((record) => record.record),
      classRecords,
    },
    resourceCatalog: {
      graphicEntries: resources,
      audioEntries: audioCatalog(
        audioManifest,
        voiceRecords,
        extractedRoot,
        path.dirname(audioManifestPath),
      ),
      contactSheets: [
        "reverse/renders/contact-sheets/combat/UN-0062-map-hit.png",
        "reverse/renders/contact-sheets/combat/MAGIC-0012-map-death.png",
      ],
    },
    evidenceBoundary: {
      confirmed: "map hit/death descriptor timelines, native waits, map sound requests, full-screen resource-record selection, five-slot per-class E banks, shared full-screen channel/compositor coordinates and primary/counter initialization, separate actor (+50) and defender (direct) frame placement tables, the y=135 channel ground clip, the main-channel E336 ground shadow, per-substep channel draw order, 210-pixel tiered life-gauge geometry and impact update timing, shared B3BD trail coordinates with no class/frame lookup, <=10 guard versus >10 hurt command/sound selection for stage-0 classes, high-level primary/counter/death ordering, the damage number's origin, per-draw velocity bands, field formatting, drop-shadow glyph passes and ink colours",
      preservedUnknown: "the original design names of many embedded full-screen command fields and the host/VGA duration of one full-screen renderer substep; the released nominal native timer tick is 10.000151 ms",
      implementation: "none; this export is phase-1 evidence only",
    },
  };

  assert(result.mapPresentation.death.phase1BeforeBoardErase.flatMap((entry) =>
    entry.tileCodes).join(",") === Array.from({ length: 26 }, (_, index) => index + 1).join(","),
  "map death phase 1 must cover tile codes 1..26 in order");
  assert(resources.find((entry) => entry.key === "UN/62")?.renderedFrames === 8,
    "UN/62 must render eight frames");
  assert(resources.find((entry) => entry.key === "MAGIC/12")?.renderedFrames === 38,
    "MAGIC/12 must render 38 frames");
  assert(result.fullScreenPresentation.sideVoiceSlotDifferenceRecords.join(",") === "17,23",
    "unexpected side voice-slot differences");
  assert(result.fullScreenPresentation.coordinateSystem.characterInitialization.actor.x === 250
    && result.fullScreenPresentation.coordinateSystem.characterInitialization.actor.y === 135
    && result.fullScreenPresentation.coordinateSystem.characterInitialization
      .opponentByActorSide.left.x === 650
    && result.fullScreenPresentation.coordinateSystem.characterInitialization
      .opponentByActorSide.right.x === -150,
  "unexpected full-screen character initialization coordinates");
  assert(
    classRecords.filter((record) => !record.side1.available)
      .map((record) => record.record).join(",") === SIDE1_ONLY_UNAVAILABLE_RECORDS.join(","),
    "unexpected side-1 full-screen presentation availability boundary",
  );
  // 36–38 的 side 2 必须保持有效：这三条是龍/頭/手实际可达的普通全屏表现，
  // 曾被误判为“原版不适用”。任何回归都必须在这里失败。
  assert(
    classRecords.every((record) => record.side2.available),
    "every class record must keep a valid side-2 full-screen presentation block",
  );
  for (const record of SIDE1_ONLY_UNAVAILABLE_RECORDS) {
    const side2 = classRecords[record].side2;
    assert(side2.commandStreams?.mainLeftOrAttacker?.steps?.length > 0
      && side2.commandStreams?.mainRightOrDefender?.steps?.length > 0,
    `record ${record} must expose decoded side-2 attacker and defender command streams`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted ordinary combat presentations: ${classRecords.length} class records, ` +
    `${resources.length} graphic resource records, ` +
    `${result.resourceCatalog.audioEntries.length} E.SWF records`,
  );
  return result;
}

function usage() {
  return "usage: angel2-combat-presentations.mjs --extract MODULE29 UNIT_DESCRIPTORS " +
    "AUDIO_MANIFEST EXTRACTED_ROOT DECODED_ROOT PLANAR_ROOT OUTPUT_JSON";
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "--extract" || args.length !== 7) throw new Error(usage());
  await extract(...args);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export {
  decodeMapDescriptor,
  extract,
  leftGraphicRule,
  parseSimpleDeathScript,
  presentationBlock,
  rightGraphicRule,
};
