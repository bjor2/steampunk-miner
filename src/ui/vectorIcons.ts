/**
 * The vector icons (#44, #51, #158): every `src/ui/icons/<id>.svg`, found by Vite at build time,
 * and the ore icons, generated from the ore look on first use (`icon-ore-<family>-t<tier>`). The
 * file stem is the icon id and its `data-testid` (art-pipeline.md "Folders"). Asset discovery
 * stays in this loader (CLAUDE.md), so the components only ask for an id.
 */
import { oreIconSvgOf, parseOreIconId } from '../systems/art/icons/oreIcon'

const ICON_URLS = import.meta.glob<string>('./icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

const ORE_ICON_URLS = new Map<string, string>()

/** The icon's URL, or null when no such icon ships. */
export function iconUrlOf(iconId: string): string | null {
  return ICON_URLS[`./icons/${iconId}.svg`] ?? oreIconUrlOf(iconId)
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
