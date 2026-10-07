/**
 * Prints `blenderAssetIds()` one per line, after the slices register theirs (#214), so the Blender
 * export refuses an id outside the list the manifest lint reads, with no second copy of it.
 *
 *   npx vite-node scripts/art/listBlenderAssetIds.ts
 */
import { loadFeatures } from '../../src/features'
import { blenderAssetIds } from '../../src/systems/art/artIds'

loadFeatures()
process.stdout.write(`${blenderAssetIds().join('\n')}\n`)
