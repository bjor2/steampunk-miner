/**
 * The vector icons (#44, #51, #158): every `src/ui/icons/<id>.svg` and every slice's
 * `src/features/<slice>/icons/<id>.svg` (feature-slices.md 3.4), found by Vite at build time, and
 * the ore icons, generated from the ore look on first use (`icon-ore-<family>-t<tier>`). The file
 * stem is the icon id and its `data-testid` (art-pipeline.md "Folders"), so a slice adds an icon by
 * adding a file. Asset discovery stays in this loader (CLAUDE.md), so the components only ask for
 * an id.
 */
import { oreIconSvgOf, parseOreIconId } from '../systems/art/icons/oreIcon'
import { duplicatedIconStems, iconUrlsByStem } from '../systems/art/icons/iconStems'

// Globs, not imports: the kernel never imports a slice, and a new icon never edits this file.
const ICON_FILES: Readonly<Record<string, string>> = {
  ...import.meta.glob<string>('./icons/*.svg', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob<string>('../features/*/icons/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
}

const ICON_URLS = iconUrlsByStem(ICON_FILES)

const ORE_ICON_URLS = new Map<string, string>()

const WARNED_MISSING_ICON_IDS = new Set<string>()

/** The icon's URL, or null when no such icon ships. */
export function iconUrlOf(iconId: string): string | null {
  return ICON_URLS.get(iconId) ?? oreIconUrlOf(iconId)
}

/** Every shipped icon file's id, sorted; generated ore icons are not files, so not here. */
export function registeredIconIds(): readonly string[] {
  return [...ICON_URLS.keys()].sort()
}

/** Ids shipped from two folders: the coverage test fails on any. */
export function iconIdsShippedTwice(): readonly string[] {
  return duplicatedIconStems(Object.keys(ICON_FILES))
}

/** Says once per id that a surface named an icon that does not ship (dev builds call it). */
export function warnOfMissingIcon(
  iconId: string,
  warn: (message: string) => void = console.warn,
): void {
  if (WARNED_MISSING_ICON_IDS.has(iconId)) return
  WARNED_MISSING_ICON_IDS.add(iconId)
  warn(`icon "${iconId}" does not ship: drawn as the missing-icon placeholder`)
}

function oreIconUrlOf(iconId: string): string | null {
  const request = parseOreIconId(iconId)
  if (request === null) return null
  const known = ORE_ICON_URLS.get(iconId)
  if (known !== undefined) return known
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(oreIconSvgOf(request))}`
  ORE_ICON_URLS.set(iconId, url)
  return url
}
