import { describe, expect, it } from 'vitest'
import {
  createAuthorityState,
  withArtefact,
  withVehicle,
  withWallet,
  type AuthorityState,
} from '../authority/authorityState'
import { openFeatureIdsOf } from '../authority/featureUnlocks'
import { WORLD_SEED } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { ECONOMY } from '../economy/economy'
import { stepsOfMajors } from '../economy/upgradeSteps'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { fromCanonical, toCanonical } from '../money'
import PRE_181_SAVE from './fixtures/pre-181-planet-5.save.json'
import { migrateSaveSlot, readMigratedSaveSlot } from './saveMigrations'
import { saveSectionsOf, saveSlotOf, SAVE_FORMAT_VERSION, type SaveSlotFile } from './saveSlot'
import { UNTIMED_AUTOSAVE } from './saveSlotIndex'

/** Forty significant digits, as the Vertical Scaler's money check asks (#401 VS1, VS3). */
const FORTY_DIGIT_WALLET = '1234567890123456789012345678901234567.891'
const DRILL_STEP = 123

/** Planet 12 with a forty-digit wallet, a drill past the curve and an artefact from planet 1. */
function richState(): AuthorityState {
  const start = createAuthorityState({ planetIndex: 12, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const vehicle = start.players.p1.vehicle
  const levels = { ...vehicle.levels, drill_power: DRILL_STEP }
  const withDrill = withVehicle(start, 'p1', { ...vehicle, levels })
  const held = { id: 'artefact.ore_whisper', fromPlanet: 1, breathingRoomCharges: 0 }
  const withPick = withArtefact(withDrill, 'p1', held)
  return withWallet(withPick, 'p1', fromCanonical(FORTY_DIGIT_WALLET))
}

/** The v1 writer (#26): the format version and the sections, nothing more. */
function v1FileOf(state: AuthorityState) {
  return { formatVersion: 1, ...saveSectionsOf(takeSnapshot(state), 4) }
}

function migratedV2(v1: unknown): SaveSlotFile {
  return migrateSaveSlot(v1).migrated as SaveSlotFile
}

describe('save format 1 -> 2 (slot layout)', () => {
  it('runs one format step and writes a file this build reads', () => {
    const v1 = v1FileOf(richState())
    const { migrated, migrations } = migrateSaveSlot(v1)
    expect(migrations).toEqual([{ version: 'formatVersion', from: 1, to: 2 }])
    expect((migrated as SaveSlotFile).formatVersion).toBe(SAVE_FORMAT_VERSION)
    expect(readMigratedSaveSlot(v1).problems).toEqual([])
  })

  it('names the migrated file the autosave, with no wall time', () => {
    expect(migratedV2(v1FileOf(richState())).slot).toEqual(UNTIMED_AUTOSAVE)
  })

  it('keeps the forty-digit money and the drill level byte for byte', () => {
    const v1 = v1FileOf(richState())
    const v2 = migratedV2(v1)
    expect(JSON.stringify(v2.profile)).toBe(JSON.stringify(v1.profile))
    expect(JSON.stringify(v2.world)).toBe(JSON.stringify(v1.world))
    expect(v2.profile.players.p1.wallet).toBe(toCanonical(fromCanonical(FORTY_DIGIT_WALLET)))
    expect(v2.profile.players.p1.vehicle.levels.drill_power).toBe(DRILL_STEP)
    expect(v2.digest).toBe(v1.digest)
  })

  it('keeps the FeatureUnlocked set byte for byte, and loads the same set', () => {
    const state = richState()
    const v2 = migratedV2(v1FileOf(state))
    const openInV1 = openFeatureIdsOf(state)
    expect(openInV1).toContain('ore_whisper')
    expect(JSON.stringify(v2.unlocked)).toBe(JSON.stringify(openInV1))
    const reading = readMigratedSaveSlot(v2)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(JSON.stringify(reading.unlocked)).toBe(JSON.stringify(openInV1))
  })

  it('writes the same v2 file the build would write for the state the v1 file holds', () => {
    const state = richState()
    expect(migratedV2(v1FileOf(state))).toEqual(saveSlotOf(takeSnapshot(state), 4))
  })

  it('leaves a v1 file whose digest does not hold unmigrated, and refused', () => {
    const tampered = { ...v1FileOf(richState()), digest: '0000000000000000' }
    const reading = readMigratedSaveSlot(tampered)
    expect(reading.migrations).toEqual([])
    expect(reading.problems).toContain(`save.formatVersion is 1, this build reads 2`)
  })
})

describe('save format 2: purchases and constants', () => {
  const saved = PRE_181_SAVE.profile.players.p1

  /** A re-baseline (#397, #335) changes the drill law's numbers, never a save. */
  const rebaselined = ECONOMY.upgrades.map((upgrade) =>
    upgrade.id === 'drill_power' && upgrade.effect.family === 'geometric'
      ? { ...upgrade, effect: { ...upgrade.effect, ratio: fromCanonical('2') } }
      : upgrade,
  )

  function loadedPre181() {
    const reading = readMigratedSaveSlot(PRE_181_SAVE)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    return reading.state
  }

  it('applies re-baselined drill constants to the loaded levels', () => {
    const { levels } = loadedPre181().players.p1.vehicle
    expect(vehicleStatsAt(levels, rebaselined).drillPower).not.toEqual(
      vehicleStatsAt(levels).drillPower,
    )
  })

  it('never rewrites a purchase on load: levels and wallet save again as they loaded', () => {
    const state = loadedPre181()
    const resaved = saveSlotOf(takeSnapshot(state), 9)
    expect(resaved.profile.players.p1.vehicle.levels).toEqual(stepsOfMajors(saved.vehicle.levels))
    expect(resaved.profile.players.p1.wallet).toBe(saved.wallet)
    expect(JSON.stringify(resaved).includes('"drillPower"')).toBe(false)
  })
})
