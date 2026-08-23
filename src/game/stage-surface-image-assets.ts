import { NATIVE_FONT } from "./content/native-font.generated";
import {
  DIALOGUE_PORTRAIT_FRAME_ASSETS,
  DIALOGUE_TEXT_WINDOW_ASSET,
  STORY_BACKDROP_ASSET,
} from "./content/portrait-catalog.generated";
import { ASSETS } from "./content/stage0";
import { UNIT_STATUS_PRESENTATIONS } from "./content/status-presentations";
import { NATIVE_UI_CSS_ASSET_URLS } from "./native-ui-assets";

const COMMON_STAGE_SURFACE_IMAGES = new Set<string>([
  ...Object.values(ASSETS.battleChrome),
  ...Object.values(ASSETS.sidePanelChrome),
  ASSETS.tacticalPanel.foundation,
  ...Object.values(ASSETS.tacticalPanel.states)
    .flatMap((states) => Object.values(states)),
  ...Object.values(DIALOGUE_PORTRAIT_FRAME_ASSETS),
  DIALOGUE_TEXT_WINDOW_ASSET,
  STORY_BACKDROP_ASSET,
  ASSETS.storyBackground,
  ASSETS.promotionMenu.frame,
  NATIVE_FONT.src,
  ...UNIT_STATUS_PRESENTATIONS.map(({ source }) => source),
  ...NATIVE_UI_CSS_ASSET_URLS,
]);

const isCurrentStageDomImage = (url: string): boolean =>
  /^\/assets\/original\/(?:stage(?:\d+|42-portal)-minimap|story(?:-|\/))/u.test(url)
  || url.startsWith("/assets/original/unit-ally-")
  || url.startsWith("/assets/original/technique-lab/units/ally-");

/**
 * Images that may be visible immediately, or on the first battle UI action.
 * This deliberately excludes maps, enemy textures, effect/full-combat atlases,
 * portraits and ending art so a stage gate never decodes the whole campaign.
 */
export function stageSurfaceImageUrls(urls: readonly string[]): readonly string[] {
  return [...new Set(urls)].filter((url) => (url.endsWith(".png") || url.endsWith(".svg"))
    && (COMMON_STAGE_SURFACE_IMAGES.has(url) || isCurrentStageDomImage(url)));
}
