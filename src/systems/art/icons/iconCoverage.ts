/**
 * The coverage rule of #158 section 3: every icon id a surface names must resolve, to a final
 * vector SVG in the art manifest or to a generated ore icon. `KNOWN_ICON_GAPS` is the allowlist of
 * ids a surface may still name without a drawing; #163 empties it and it must stay empty, so an
 * entry added here is a build finding, never a fix.
 */
import type { ArtCatalogue } from '../artCatalogue'
import { manifestEntryOf } from '../artCatalogue'
import { isOreIconId } from './oreIcon'

/** Ids known to render blank; empty since #163 drew the HUD markers (`anchor`, `wheel`). */
export const KNOWN_ICON_GAPS: readonly string[] = []

export function resolvesIcon(iconId: string, art: ArtCatalogue): boolean {
  if (isOreIconId(iconId)) return true
  const entry = manifestEntryOf(art, iconId)
  return entry !== null && entry.form === 'svg' && entry.status === 'final'
}

/** The ids in `iconIds` with no icon, each once, the allowlisted ones excluded. */
export function unresolvedIconIds(iconIds: Iterable<string>, art: ArtCatalogue): string[] {
  return [...new Set(iconIds)].filter(
    (iconId) => !resolvesIcon(iconId, art) && !KNOWN_ICON_GAPS.includes(iconId),
  )
}
