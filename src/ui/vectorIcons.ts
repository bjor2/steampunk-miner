/**
 * The vector icons (#44, #51): every `src/ui/icons/<id>.svg`, found by Vite at build time. The
 * file stem is the icon id and its `data-testid` (art-pipeline.md "Folders"). Asset discovery stays
 * in this loader (CLAUDE.md), so the components only ask for an id.
 */
const ICON_URLS = import.meta.glob<string>('./icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The icon's URL, or null when no such icon ships. */
export function iconUrlOf(iconId: string): string | null {
  return ICON_URLS[`./icons/${iconId}.svg`] ?? null
}
