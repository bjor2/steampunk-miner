/**
 * Writes the icon set (#158, #163): one `src/ui/icons/<id>.svg` and one `art/assets/<id>.json`
 * entry per icon of `src/systems/art/icons/iconSet.ts`, and the contact sheet under
 * `docs/art/icons/`. The files are generated from the set so the frames and colours never drift;
 * `src/systems/art/icons/iconFiles.test.ts` fails when a committed file is stale.
 *
 *   npm run art:icons
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { contactSheetFiles } from '../../src/systems/art/icons/contactSheet'
import { iconEntries } from '../../src/systems/art/icons/iconSet'
import { iconSvgOf } from '../../src/systems/art/icons/iconSvg'
import { manifestEntryTextOf } from '../../src/systems/art/icons/iconFiles'

const REPO = new URL('../../', import.meta.url)

function write(relativePath: string, text: string): void {
  const path = fileURLToPath(new URL(relativePath, REPO))
  mkdirSync(fileURLToPath(new URL('.', new URL(relativePath, REPO))), { recursive: true })
  writeFileSync(path, text)
}

for (const entry of iconEntries()) {
  write(`src/ui/icons/${entry.id}.svg`, iconSvgOf(entry))
  write(`art/assets/${entry.id}.json`, manifestEntryTextOf(entry))
}

for (const [relativePath, text] of Object.entries(contactSheetFiles())) {
  write(relativePath, text)
}

console.log(`wrote ${iconEntries().length} icons and the contact sheet`)
