/**
 * The digest a save loads to (#470 P1-10, ticket 481): the state digest (#11 section 3) of the
 * session a save file resumes, after the migration chain. Saves are identical across devices
 * (#11, #12), so one file loads to one digest in node, Chromium and WebKit. The committed value
 * for the device fixture is `tests/golden/device-save.digest.json`, written by
 * `npm run golden:update`; the mobile Playwright projects compare the `checkpoint_loaded` digest
 * of the same file against it.
 */
import { stateDigest } from '../authority/stateDigest'
import { readMigratedSaveSlot } from './saveMigrations'

/**
 * The save the device golden loads: the live game's `player_1` docked on planet 1 after mining,
 * written before #175, so it loads through the whole migration chain. The other fixtures are a
 * script's `p1`, which the live store cannot resume.
 */
export const DEVICE_SAVE_FIXTURE = 'src/systems/save/fixtures/pre-175-planet-1.save.json'

export type LoadedSaveDigest = { digest: string } | { problems: string[] }

/** `tests/golden/device-save.digest.json`: the fixture's path and the digest it loads to. */
export interface DeviceSaveGolden {
  description: string
  fixture: string
  digest: string
}

const DEVICE_SAVE_DESCRIPTION =
  'The digest the device fixture loads to, in node and in every browser engine (ticket 481, #11/#12).'

/** What the store's resume logs as `checkpoint_loaded.digest`, or why the file is refused. */
export function loadedSaveDigestOf(file: unknown): LoadedSaveDigest {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) return { problems: reading.problems }
  return { digest: stateDigest(reading.state) }
}

/** The golden for the device fixture's parsed text; a refused fixture throws with its problems. */
export function deviceSaveGoldenOf(fixture: unknown): DeviceSaveGolden {
  const loaded = loadedSaveDigestOf(fixture)
  if (!('digest' in loaded))
    throw new Error(`device fixture refused: ${loaded.problems.join('; ')}`)
  return {
    description: DEVICE_SAVE_DESCRIPTION,
    fixture: DEVICE_SAVE_FIXTURE,
    digest: loaded.digest,
  }
}

export function formatDeviceSaveGolden(golden: DeviceSaveGolden): string {
  return `${JSON.stringify(golden, null, 2)}\n`
}
