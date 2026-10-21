/**
 * The UI chrome sprites as CSS custom properties (ticket 683, docs/ui/design-system.md section
 * 13): one `:root` rule written once from the shipped art catalogue, so a CSS Module draws a baked
 * frame, rail or dial through `var(--art-<token>)` and keeps its CSS frame as the fallback while an
 * asset is a placeholder. Tokens only, no class: a token sheet like `tokens.css`, but from data.
 */
import { SHIPPED_ART } from '../../scene/shippedArt'
import { uiArtStyleSheetOf } from '../../systems/art/uiArt'

const UI_ART_STYLE_SHEET = uiArtStyleSheetOf(SHIPPED_ART)

export function UiArtTokens() {
  return <style data-ui-art-tokens>{UI_ART_STYLE_SHEET}</style>
}
