/**
 * Rewrites `tests/golden/*.golden.json` from the scripts in `src/systems/replay/goldenScripts.ts`
 * (decision #11 section 3, #29). Run it with `npm run golden:update` after a version bump, and
 * commit the files with the bump so the digest change is a visible diff. Also rewrites
 * `tests/golden/device-save.digest.json`, the digest the device save fixture loads to (ticket 481).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { loadFeatures } from '../src/features'

loadFeatures()

// Imported after the loader: building the golden scripts reads generated cells, and generation
// asks the slice registries (#183), which throw when read before loadFeatures(). A static import
// is evaluated before this module's body, so it would read them first.
const { formatGoldenRun, recordGoldenRun } = await import('../src/logging/goldenRun')
const { GOLDEN_SCRIPTS } = await import('../src/systems/replay/goldenScripts')
const { DEVICE_SAVE_FIXTURE, deviceSaveGoldenOf, formatDeviceSaveGolden } =
  await import('../src/systems/save/loadedSaveDigest')

const GOLDEN_FOLDER = new URL('../tests/golden/', import.meta.url)

mkdirSync(GOLDEN_FOLDER, { recursive: true })
for (const script of GOLDEN_SCRIPTS) {
  const file = new URL(`${script.name}.golden.json`, GOLDEN_FOLDER)
  writeFileSync(file, formatGoldenRun(recordGoldenRun(script)))
  console.log(`wrote tests/golden/${script.name}.golden.json`)
}

// The digest the device fixture loads to, which the mobile Playwright projects hold every browser
// engine to (ticket 481): a version bump that changes the loaded state changes it with the runs.
const fixture = JSON.parse(
  readFileSync(new URL(`../${DEVICE_SAVE_FIXTURE}`, import.meta.url), 'utf8'),
)
writeFileSync(
  new URL('device-save.digest.json', GOLDEN_FOLDER),
  formatDeviceSaveGolden(deviceSaveGoldenOf(fixture)),
)
console.log('wrote tests/golden/device-save.digest.json')
