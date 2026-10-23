/**
 * The UI chrome sprites as CSS custom properties (ticket 683, docs/ui/design-system.md section
 * 13): one `:root` rule written once from the shipped art catalogue, so a CSS Module draws a baked
 * frame, rail or dial through `var(--art-<token>)` and keeps its CSS frame as the fallback while an
 * asset is a placeholder. The files are named by the page's absolute URL (ticket 770): a browser
 * resolves a `url()` inside a variable against the sheet that consumes it, the bundled CSS under
 * `assets/` in a build, which turned the relative path into `assets/assets/ui/` and drew nothing.
 * Tokens only, no class: a token sheet like `tokens.css`, but from data.
 */
import { useMemo } from 'react'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { getShell } from '../../shell/shell'
import { UI_ASSETS_URL, uiArtStyleSheetOf } from '../../systems/art/uiArt'

export function UiArtTokens() {
  const sheet = useMemo(() => uiArtStyleSheetOf(SHIPPED_ART, pageUiAssetsUrl()), [])
  return <style data-ui-art-tokens>{sheet}</style>
}

function pageUiAssetsUrl(): string {
  return getShell().resolvePageUrl(UI_ASSETS_URL)
}
