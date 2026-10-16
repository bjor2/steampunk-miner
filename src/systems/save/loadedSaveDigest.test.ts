import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import PLANET_1_SAVE from './fixtures/pre-175-planet-1.save.json'
import {
  DEVICE_SAVE_FIXTURE,
  deviceSaveGoldenOf,
  formatDeviceSaveGolden,
  loadedSaveDigestOf,
  type DeviceSaveGolden,
} from './loadedSaveDigest'

/** A version bump that changes what the fixture loads to rewrites the golden with the others. */
const REGENERATE_HINT = 'regenerate the golden file with `npm run golden:update`'
const GOLDEN_FILE = new URL('../../../tests/golden/device-save.digest.json', import.meta.url)
const committedGolden = () => JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as DeviceSaveGolden
const fixtureOnDisk = () =>
  JSON.parse(readFileSync(new URL(`../../../${DEVICE_SAVE_FIXTURE}`, import.meta.url), 'utf8'))

describe('loaded save digest (ticket 481)', () => {
  it('loads the device fixture to the committed digest the mobile browsers are held to', () => {
    const golden = committedGolden()
    expect(golden.fixture).toBe(DEVICE_SAVE_FIXTURE)
    expect(deviceSaveGoldenOf(fixtureOnDisk()).digest, REGENERATE_HINT).toBe(golden.digest)
  })

  it('writes the committed golden byte for byte', () => {
    expect(formatDeviceSaveGolden(deviceSaveGoldenOf(fixtureOnDisk())), REGENERATE_HINT).toBe(
      readFileSync(GOLDEN_FILE, 'utf8'),
    )
  })

  it('loads the same text to the same digest however often it is read', () => {
    const text = JSON.stringify(PLANET_1_SAVE)
    expect(loadedSaveDigestOf(JSON.parse(text))).toEqual(loadedSaveDigestOf(JSON.parse(text)))
  })

  it('lists the problems of a file it refuses, with no digest', () => {
    const loaded = loadedSaveDigestOf({ formatVersion: 99 })
    expect(loaded).not.toHaveProperty('digest')
    expect('problems' in loaded && loaded.problems.length).toBeGreaterThan(0)
  })
})
