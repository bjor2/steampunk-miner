import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { readSection, type SaveSection } from '../registries/saveSections'
import { GENERATOR_VERSION } from '../generatorVersion'
import { toCanonical } from '../money'
import { bayOfPose, dockedPoseAt } from '../vehicle/vehiclePose'
import { planetParamsFor } from '../world/planetParams'
import PLANET_1_SAVE from './fixtures/pre-175-planet-1.save.json'
import PLANET_10_SAVE from './fixtures/pre-175-planet-10.save.json'
import { migrateSaveSlot, readMigratedSaveSlot } from './saveMigrations'
import { readSaveSlot } from './saveSlot'

/**
 * Both fixtures were written by the build before #175 (generator 5, pad -6..+5, or -6..+13 with
 * the Refinery bay): planet 1 docked at the old Upgrade bay (+4) after mining near and away from
 * the pad as the live game's `player_1`, planet 10 active away from it with on-curve levels.
 * They hold no slice section: each registered one restores at its initial value (#224).
 */
const GENERATOR_STEP = { version: 'generatorVersion', from: 5, to: 6 }

const NOTES: SaveSection<readonly string[]> = {
  id: 'save-probe.notes',
  version: 1,
  scope: 'player',
  initial: [],
  problems: (body) => (Array.isArray(body) ? [] : ['must be a list']),
  toPortable: (value) => [...value],
  ofPortable: (body) => [...(body as string[])],
}

const NOTES_SLICE: SliceDefinition = {
  id: 'save-probe',
  register: (r) => r.saveSection(NOTES as SaveSection<never>),
}

function restored(file: unknown) {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading
}

describe('save migration chain', () => {
  it('refuses a pre-#175 save without the chain, on its generator version alone', () => {
    expect(readSaveSlot(PLANET_1_SAVE).problems).toEqual([
      `save.generatorVersion is 5, this build reads ${GENERATOR_VERSION}`,
    ])
  })

  it('loads a pre-#175 save through the one generator 5 -> 6 step', () => {
    const reading = withRegistrations([], () => restored(PLANET_1_SAVE))
    expect(reading.migrations).toEqual([GENERATOR_STEP])
    expect(reading.saveEpoch).toBe(3)
  })

  it('restores a player section the save was written before at its initial value, reported after the steps', () => {
    const { reading, notes } = withRegistrations([NOTES_SLICE], () => {
      const reading = restored(PLANET_1_SAVE)
      return { reading, notes: readSection(reading.state, 'player_1', NOTES) }
    })
    expect(reading.migrations).toEqual([
      GENERATOR_STEP,
      { restoredSections: [{ section: 'save-probe.notes' }] },
    ])
    expect(notes).toEqual([])
  })

  it('reports no restored section for a save that holds every registered one', () => {
    const reading = withRegistrations([NOTES_SLICE], () => {
      const { migrated } = migrateSaveSlot(PLANET_1_SAVE)
      return restored(migrated)
    })
    expect(reading.migrations).toEqual([])
  })

  it('keeps the wallet, levels, casing and core bay of the save', () => {
    const { state } = restored(PLANET_1_SAVE)
    const saved = PLANET_1_SAVE.profile.players.player_1
    const player = state.players.player_1
    expect(toCanonical(player.wallet)).toBe(saved.wallet)
    expect(player.vehicle.levels).toEqual(saved.vehicle.levels)
    expect(player.vehicle.casingGrade).toBe(saved.vehicle.casingGrade)
    expect(state.platform.coreBay).toBe(PLANET_1_SAVE.world.platform.coreBay)
  })

  it('puts a vehicle docked at the old Upgrade bay on the Sell bay rest pose, still docked', () => {
    const { vehicle } = restored(PLANET_1_SAVE).state.players.player_1
    const site = dockSiteOfPlanet(restored(PLANET_1_SAVE).state.planet)!
    expect(PLANET_1_SAVE.profile.players.player_1.vehicle.pose.x).toBe(4000)
    expect(vehicle.pose).toEqual(dockedPoseAt(site))
    expect(vehicle.mode).toBe('docked')
    expect(bayOfPose(site, vehicle.pose!)).toBe('sell')
  })

  it('drops the chunk edits beside the pad and keeps those away from it', () => {
    expect(Object.keys(PLANET_1_SAVE.world.chunks)).toEqual(['0,9', '1,9'])
    expect(Object.keys(restored(PLANET_1_SAVE).state.world.chunks)).toEqual(['1,9'])
  })

  it('drops only the edits in the grown pad area on a planet 10 save', () => {
    expect(Object.keys(PLANET_10_SAVE.world.chunks)).toEqual(['0,22', '1,22'])
    const { state } = restored(PLANET_10_SAVE)
    expect(Object.keys(state.world.chunks)).toEqual(['1,22'])
    expect(state.players.p1.vehicle.levels).toEqual(
      PLANET_10_SAVE.profile.players.p1.vehicle.levels,
    )
  })

  it('writes the params this build generates and generator version 6', () => {
    const { migrated } = migrateSaveSlot(PLANET_10_SAVE)
    expect(migrated).toMatchObject({
      generatorVersion: 6,
      world: { params: planetParamsFor(83921, 10) },
    })
  })

  it('runs no step on a save of this build', () => {
    const { migrated } = migrateSaveSlot(PLANET_1_SAVE)
    expect(migrateSaveSlot(migrated).migrations).toEqual([])
  })

  it('leaves a generator 5 save whose digest does not hold unmigrated, and refused', () => {
    const tampered = { ...PLANET_1_SAVE, digest: '0000000000000000' }
    const reading = readMigratedSaveSlot(tampered)
    expect(reading.migrations).toEqual([])
    expect(reading.problems).toContain(
      `save.generatorVersion is 5, this build reads ${GENERATOR_VERSION}`,
    )
  })
})
