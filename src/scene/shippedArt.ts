/**
 * The art catalogue the game draws from (#52, #116), found by Vite at build time: every manifest
 * entry `art/assets/<id>.json`, every placeholder sidecar `art/placeholders/<id>.parts.json` and
 * every exported sidecar `public/assets/<category>/<id>/<id>.parts.json`. Asset discovery stays in
 * this loader (CLAUDE.md), so adding an asset adds files and edits no shared list; the pure rules
 * in `systems/art` take the catalogue as an argument.
 */
import { artCatalogueOf, type ArtCatalogue } from '../systems/art/artCatalogue'
import type { ManifestEntry } from '../systems/art/assetManifest'
import type { PartsSidecar } from '../systems/art/partsSidecar'

// JSON imports widen tuples to arrays and literals to strings; the asset lint holds them to the types.
const ENTRY_FILES = import.meta.glob<ManifestEntry>('../../art/assets/*.json', {
  eager: true,
  import: 'default',
})

const PLACEHOLDER_FILES = import.meta.glob<PartsSidecar>('../../art/placeholders/*.parts.json', {
  eager: true,
  import: 'default',
})

const EXPORTED_FILES = import.meta.glob<PartsSidecar>('../../public/assets/*/*/*.parts.json', {
  eager: true,
  import: 'default',
})

export const SHIPPED_ART: ArtCatalogue = artCatalogueOf(
  Object.values(ENTRY_FILES),
  Object.values(PLACEHOLDER_FILES),
  Object.values(EXPORTED_FILES),
)
