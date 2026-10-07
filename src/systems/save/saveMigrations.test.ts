import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { nextUpgradePrice } from '../authority/workshopRules'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { SNAPSHOT_VERSION } from '../authority/sessionSnapshot'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { gunFireIntervalTicks, gunShotDamage } from '../economy/gunStats'
import { ECONOMY } from '../economy/economy'
import { stepPrice, upgradePrice } from '../economy/upgradePrices'
import { stepsOfMajors } from '../economy/upgradeSteps'
import { drillPower, vehicleStatsAt } from '../economy/vehicleStats'
import { readSection, type SaveSection } from '../registries/saveSections'
import { GENERATOR_VERSION } from '../generatorVersion'
import { add, mul, toCanonical, ZERO_MONEY } from '../money'
import { gunLookOf } from '../render/gunLook'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { bayOfPose, dockedPoseAt } from '../vehicle/vehiclePose'
import { planetParamsFor } from '../world/planetParams'
import PLANET_1_SAVE from './fixtures/pre-175-planet-1.save.json'
import PLANET_10_SAVE from './fixtures/pre-175-planet-10.save.json'
import PLANET_5_SAVE from './fixtures/pre-181-planet-5.save.json'
import { migrateSaveSlot, readMigratedSaveSlot } from './saveMigrations'
import { readSaveSlot } from './saveSlot'

/**
 * Both fixtures were written by the build before #175 (generator 5, pad -6..+5, or -6..+13 with
 * the Refinery bay): planet 1 docked at the old Upgrade bay (+4) after mining near and away from
 * the pad as the live game's `player_1`, planet 10 active away from it with on-curve levels.
 * They hold no slice section: each registered one restores at its initial value (#224).
 */
const GENERATOR_STEP = { version: 'generatorVersion', from: 5, to: 6 }
const SNAPSHOT_STEP = { version: 'snapshotVersion', from: 18, to: 19 }

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
  it('refuses a pre-#175 save without the chain, on its snapshot and generator versions alone', () => {
    expect(readSaveSlot(PLANET_1_SAVE).problems).toEqual([
      `save.snapshotVersion is 18, this build reads ${SNAPSHOT_VERSION}`,
      `save.generatorVersion is 5, this build reads ${GENERATOR_VERSION}`,
    ])
  })

  it('loads a pre-#175 save through the snapshot 18 -> 19 step, then the generator 5 -> 6 step', () => {
    const reading = withRegistrations([], () => restored(PLANET_1_SAVE))
    expect(reading.migrations).toEqual([SNAPSHOT_STEP, GENERATOR_STEP])
    expect(reading.saveEpoch).toBe(3)
  })

  it('restores a player section the save was written before at its initial value, reported after the steps', () => {
    const { reading, notes } = withRegistrations([NOTES_SLICE], () => {
      const reading = restored(PLANET_1_SAVE)
      return { reading, notes: readSection(reading.state, 'player_1', NOTES) }
    })
    expect(reading.migrations).toEqual([
      SNAPSHOT_STEP,
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

  it('keeps the wallet, casing and core bay of the save, and its levels as steps', () => {
    const { state } = restored(PLANET_1_SAVE)
    const saved = PLANET_1_SAVE.profile.players.player_1
    const player = state.players.player_1
    expect(toCanonical(player.wallet)).toBe(saved.wallet)
    expect(player.vehicle.levels).toEqual(stepsOfMajors(saved.vehicle.levels))
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
      stepsOfMajors(PLANET_10_SAVE.profile.players.p1.vehicle.levels),
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

/**
 * The fixture was written by the build before #181 (snapshot 18, generator 6): planet 5 with the
 * on-curve levels, the guns at level 7, a rack of 3 slots past the start, casing grade 2, docked
 * at the Workshop (TD added acceptance 1 on #180).
 */
describe('save migration chain: levels to steps (#181)', () => {
  const saved = PLANET_5_SAVE.profile.players.p1

  it('loads a pre-#181 save through the one snapshot 18 -> 19 step', () => {
    expect(restored(PLANET_5_SAVE).migrations).toEqual([SNAPSHOT_STEP])
  })

  it('turns every track level L into step 10L and the gun level 7 into step 70', () => {
    const { vehicle } = restored(PLANET_5_SAVE).state.players.p1
    expect(vehicle.levels).toEqual(stepsOfMajors(saved.vehicle.levels))
    expect(vehicle.gun).toEqual({ level: 70, mode: saved.vehicle.gun.mode })
  })

  it('keeps the rack slots, the casing grade, the wallet and the pose as saved', () => {
    const { state } = restored(PLANET_5_SAVE)
    const { vehicle } = state.players.p1
    expect(vehicle.charges.slotLevel).toBe(3)
    expect(vehicle.casingGrade).toBe(2)
    expect(toCanonical(state.players.p1.wallet)).toBe(saved.wallet)
    expect(vehicle.pose).toEqual(saved.vehicle.pose)
  })

  it('keeps every stat as it was at the saved levels', () => {
    const { vehicle } = restored(PLANET_5_SAVE).state.players.p1
    const before = vehicleStatsAt(stepsOfMajors(saved.vehicle.levels))
    expect(statsOfVehicle(vehicle)).toEqual(before)
    expect(statsOfVehicle(vehicle).drillPower).toEqual(drillPower(saved.vehicle.levels.drill_power))
  })

  it('prices the next major, in ten steps, at what the next level cost before', () => {
    const { state } = restored(PLANET_5_SAVE)
    for (const track of UPGRADE_IDS) {
      const step = state.players.p1.vehicle.levels[track]
      const steps = Array.from({ length: 10 }, (_, pip) => stepPrice(track, step + pip, 5))
      expect(nextUpgradePrice(state, 'p1', track)).toEqual(steps[0])
      expect(steps.reduce(add, ZERO_MONEY)).toEqual(
        upgradePrice(track, saved.vehicle.levels[track], 5),
      )
    }
  })

  it('keeps the barrel look and shot damage of gun level 7, its interval rounded half up', () => {
    const { vehicle } = restored(PLANET_5_SAVE).state.players.p1
    const { damageFractionOfDrill } = ECONOMY.gun
    const drill = drillPower(saved.vehicle.levels.drill_power)
    expect(gunLookOf(vehicle.gun.level)).toBe(2)
    expect(gunShotDamage(vehicle.levels.drill_power)).toEqual(
      mul(mul(damageFractionOfDrill, drill), ECONOMY.enemies.combat.kDrillVsEnemy),
    )
    expect(gunFireIntervalTicks(vehicle.gun.level)).toBe(22)
  })

  it('refuses a pre-#181 save whose digest does not hold, and lists the problem', () => {
    const reading = readMigratedSaveSlot({ ...PLANET_5_SAVE, digest: '0000000000000000' })
    expect(reading.migrations).toEqual([])
    expect(reading.problems).toEqual([
      `save.snapshotVersion is 18, this build reads ${SNAPSHOT_VERSION}`,
    ])
  })
})
