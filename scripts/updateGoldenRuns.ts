/**
 * Rewrites `tests/golden/*.golden.json` from the scripts in `src/systems/replay/goldenScripts.ts`
 * (decision #11 section 3, #29). Run it with `npm run golden:update` after a version bump, and
 * commit the files with the bump so the digest change is a visible diff.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadFeatures } from '../src/features'
import { formatGoldenRun, recordGoldenRun } from '../src/logging/goldenRun'
import { GOLDEN_SCRIPTS } from '../src/systems/replay/goldenScripts'

loadFeatures()

const GOLDEN_FOLDER = new URL('../tests/golden/', import.meta.url)

mkdirSync(GOLDEN_FOLDER, { recursive: true })
for (const script of GOLDEN_SCRIPTS) {
  const file = new URL(`${script.name}.golden.json`, GOLDEN_FOLDER)
  writeFileSync(file, formatGoldenRun(recordGoldenRun(script)))
  console.log(`wrote tests/golden/${script.name}.golden.json`)
}
