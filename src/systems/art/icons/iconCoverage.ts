/**
 * The coverage rule of #158 section 3: every icon id a surface names must resolve, to a final
 * vector SVG in the art manifest or to a generated ore icon. `KNOWN_ICON_GAPS` is the allowlist of
 * ids a surface may still name without a drawing; #163 empties it and it must stay empty, so an
 * entry added here is a build finding, never a fix.
 *
 * The kernel icon registry (feature-slices.md 3.4) checks the same allowlist against the shipped
 * files and every slice's icons: `iconRegistryProblems`.
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

/** Ids a surface names for "no icon here", never drawn: the ok warning and the kernel default ore. */
export const NEVER_DRAWN_ICON_IDS: readonly string[] = ['', 'none']

/**
 * Every way `iconIds` fails the icon registry: an id that does not ship and is not allowlisted, and
 * an allowlisted id that now ships (the allowlist only shrinks). Never-drawn ids are skipped.
 */
export function iconRegistryProblems(
  iconIds: Iterable<string>,
  isShipped: (iconId: string) => boolean,
  allowlist: readonly string[] = KNOWN_ICON_GAPS,
): string[] {
  const named = [...new Set(iconIds)].filter((iconId) => !NEVER_DRAWN_ICON_IDS.includes(iconId))
  return [
    ...named
      .filter((iconId) => !isShipped(iconId) && !allowlist.includes(iconId))
      .map((iconId) => `icon "${iconId}" is named but does not ship`),
    ...allowlist
      .filter(isShipped)
      .map((iconId) => `icon "${iconId}" ships now: take it off the allowlist`),
  ]
}
