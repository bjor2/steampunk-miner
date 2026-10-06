/**
 * What the icon generator writes for an icon besides its SVG (#116: one entry file per asset, so
 * two branches that each add an icon merge with no hand edits): the manifest entry, a final
 * vector asset of the `svg` form.
 */
import type { ManifestEntry } from '../assetManifest'
import type { IconEntry } from './iconSet'

export function manifestEntryOf(entry: IconEntry): ManifestEntry {
  return { id: entry.id, source: 'vector', form: 'svg', status: 'final' }
}

/** The entry as Prettier formats a JSON file: two-space indent, a trailing newline. */
export function manifestEntryTextOf(entry: IconEntry): string {
  return `${JSON.stringify(manifestEntryOf(entry), null, 2)}\n`
}
