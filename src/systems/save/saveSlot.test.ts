import { describe, expect, it } from 'vitest'
import { applyCommand } from '../authority/applyCommand'
import type { AuthorityCommand, CommandIntent } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import { poseAt, prepareCorridor, spawnEnemy } from '../authority/combat/combatFixtures'
import type { DomainEvent } from '../authority/domainEvent'
import {
  createScriptedSession,
  dockInBay,
  mineTile,
  poseInBay,
  SITE,
  surfaceOreTiles,
  type ScriptedSession,
} from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { ECONOMY } from '../economy/economy'
import { fromCanonical, toCanonical } from '../money'
import { computeVehicleStats } from '../vehicle/vehicleStats'
import { dockedPoseAt, FACING } from '../vehicle/vehiclePose'
import { isCheckpointMoment } from './checkpointMoment'
import { readSaveSlot, saveSlotOf, type SaveSlotFile } from './saveSlot'

const dock: CommandIntent = { type: 'dock', payload: { bay: 'sell' } }
const undock: CommandIntent = { type: 'undock', payload: {} }
const buy = (upgradeId: string): CommandIntent => ({ type: 'buyUpgrade', payload: { upgradeId } })
const grant = (amount: string): CommandIntent => ({ type: 'debug.grantMoney', payload: { amount } })
const setUpgrade = (upgradeId: string, level: number): CommandIntent => ({
  type: 'debug.setUpgrade',
  payload: { upgradeId, level },
})
const atDock: CommandIntent = {
  ...poseAt({ tx: 0, ty: 0 }, { facing: FACING.right }),
  payload: { ...poseAt({ tx: 0, ty: 0 }, { facing: FACING.right }).payload, ...dockedPoseAt(SITE) },
} as CommandIntent

/** As the shell writes it and reads it back: JSON text. */
function savedText(state: AuthorityState, saveEpoch = 1): string {
  return JSON.stringify(saveSlotOf(takeSnapshot(state), saveEpoch))
}

function restoredFrom(text: string): AuthorityState {
  const reading = readSaveSlot(JSON.parse(text))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** Mined ore, sold some, bought an upgrade with the money, and docked with core in the bay. */
function dockedAfterATrip(): ScriptedSession {
  const session = createScriptedSession()
  surfaceOreTiles(3).forEach((tile, index) => mineTile(session, 10 + 50 * index, tile))
  session.submit(200, atDock)
  session.submit(200, dock)
  session.submit(201, { type: 'sellCargo', payload: { resourceTier: 'all' } })
  session.submit(202, grant('1e6'))
  dockInBay(session, 203, 'upgrade')
  session.submit(203, buy('drill_power'))
  session.submit(204, { type: 'debug.setCoreFragments', payload: { count: 12 } })
  return session
}

/** Stamps intents after the state's last accepted seq, as the store would after a resume. */
function commandsAfter(
  state: AuthorityState,
  steps: readonly [number, CommandIntent][],
): AuthorityCommand[] {
  const lastSeq = state.players.p1.lastSeq
  return steps.map(([tick, intent], index) => ({
    playerId: 'p1',
    tick,
    seq: lastSeq + index + 1,
    ...intent,
  })) as AuthorityCommand[]
}

function runCommands(state: AuthorityState, commands: readonly AuthorityCommand[]) {
  return commands.reduce(
    (run, command) => {
      const outcome = applyCommand(run.state, command)
      return { state: outcome.state, events: [...run.events, ...outcome.events] }
    },
    { state, events: [] as DomainEvent[] },
  )
}

describe('save slot', () => {
  it('restores money, upgrades, planet and core bay exactly, through JSON text', () => {
    const state = dockedAfterATrip().state()
    const restored = restoredFrom(savedText(state))
    expect(restored).toEqual(state)
    expect(toCanonical(restored.players.p1.wallet)).toBe(toCanonical(state.players.p1.wallet))
    expect(restored.players.p1.vehicle.levels.drill_power).toBe(1)
    expect(restored.planet).toEqual({ index: 1, seed: 83921 })
    expect(restored.platform.coreBay).toBe(12)
  })

  it('answers the epoch it was written with', () => {
    const reading = readSaveSlot(JSON.parse(savedText(dockedAfterATrip().state(), 7)))
    expect(reading).toMatchObject({ saveEpoch: 7, problems: [] })
  })

  it('holds the world as seed, params and touched-chunk deltas under the shared epoch', () => {
    const file = JSON.parse(savedText(dockedAfterATrip().state(), 3)) as SaveSlotFile
    expect(file).toMatchObject({ formatVersion: 1, generatorVersion: 4, saveEpoch: 3 })
    expect(file.world).toMatchObject({ saveEpoch: 3, worldSeed: 83921, planetIndex: 1 })
    expect(file.world.params).toMatchObject({ worldSeed: 83921, planetIndex: 1, radiusTiles: 300 })
    expect(Object.keys(file.world.chunks).length).toBeGreaterThan(0)
    expect(file.profile.saveEpoch).toBe(3)
  })

  it('restores a chunk holding breached casing exactly (#111)', () => {
    const session = dockedAfterATrip()
    session.submit(210, {
      type: 'debug.carveCircle',
      payload: { x: 500, y: 284000, radius: 950, amount: 255 },
    })
    session.submit(210, { type: 'debug.lineCasing', payload: { x: 500, y: 284000, grade: 3 } })
    const gnaw = session.submit(210, { type: 'debug.gnawCasing', payload: { x: 500, y: 284000 } })
    expect(gnaw.some((event) => event.type === 'CasingBreached')).toBe(true)
    const restored = restoredFrom(savedText(session.state()))
    expect(stateDigest(restored)).toBe(stateDigest(session.state()))
    expect(restored.world).toEqual(session.state().world)
  })

  it('saves the vehicle as levels, integer energy and cargo and a hull string, with no stat', () => {
    const file = JSON.parse(savedText(dockedAfterATrip().state())) as SaveSlotFile
    const vehicle = file.profile.players.p1.vehicle
    expect(Object.keys(vehicle.levels).sort()).toEqual(
      ['boiler', 'cargo_hold', 'drill_power', 'drill_tip', 'engine', 'hull'].sort(),
    )
    expect(Number.isSafeInteger(vehicle.energy)).toBe(true)
    expect(typeof vehicle.hull).toBe('string')
    for (const stat of [
      'drillPower',
      'drillTip',
      'hullMax',
      'energyMax',
      'speedMax',
      'visualTier',
    ]) {
      expect(JSON.stringify(file)).not.toContain(`"${stat}"`)
    }
  })

  it('retunes a saved drill_power 5 when the coefficients in the definitions change', () => {
    const session = createScriptedSession()
    session.submit(1, setUpgrade('drill_power', 5))
    session.submit(5, dock)
    const levels = restoredFrom(savedText(session.state())).players.p1.vehicle.levels
    const retuned = ECONOMY.upgrades.map((upgrade) =>
      upgrade.id === 'drill_power' && upgrade.effect.family === 'geometric'
        ? { ...upgrade, effect: { ...upgrade.effect, ratio: fromCanonical('2') } }
        : upgrade,
    )
    const reading = computeVehicleStats(levels, retuned)
    if (!('stats' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.stats.drillPower).toEqual(fromCanonical('48'))
  })

  it('resumes docked with the saved hull and energy, no hit grace and no enemy', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.left)
    session.submit(start, spawnEnemy('crawler', 1, 3))
    session.advanceTo(start + 80)
    session.submit(start + 81, atDock)
    session.submit(start + 81, dock)
    const saved = session.state()
    const restored = restoredFrom(savedText(saved))
    const vehicle = restored.players.p1.vehicle
    expect(vehicle.mode).toBe('docked')
    expect(toCanonical(vehicle.hull)).toBe(toCanonical(saved.players.p1.vehicle.hull))
    expect(toCanonical(vehicle.hull)).not.toBe('125.44')
    expect(vehicle.energy).toBe(saved.players.p1.vehicle.energy)
    expect(restored.combat.vehicles.p1.lastHitTick).toBeNull()
    expect(restored.combat.enemies).toEqual([])
  })

  it('reaches the uninterrupted digest when the same commands follow a restore, across T2', () => {
    const session = createScriptedSession()
    session.submit(1, grant('1e9'))
    session.submit(2, setUpgrade('drill_power', 7))
    dockInBay(session, 5, 'upgrade')
    const saved = session.state()
    const [ore] = surfaceOreTiles(1)
    const commands = commandsAfter(saved, [
      [10, buy('hull')],
      [11, undock],
      [20, poseAt({ tx: ore.tx, ty: ore.ty + 1 }, { facing: FACING.down })],
      [60, { type: 'drillTile', payload: { ...ore, ticks: 40 } }],
      [100, poseInBay('upgrade')],
      [100, { type: 'dock', payload: { bay: 'upgrade' } }],
    ])
    const uninterrupted = runCommands(saved, commands)
    const resumed = runCommands(restoredFrom(savedText(saved)), commands)
    expect(uninterrupted.events).toContainEqual(
      expect.objectContaining({ type: 'VehicleConfigurationChanged', visualTier: 2 }),
    )
    expect(stateDigest(resumed.state)).toBe(stateDigest(uninterrupted.state))
    expect(resumed.events).toEqual(uninterrupted.events)
  })
})

describe('save slot: refusals', () => {
  const file = () => JSON.parse(savedText(dockedAfterATrip().state(), 4)) as SaveSlotFile

  it('refuses a save from another generator or format version instead of migrating it', () => {
    expect(readSaveSlot({ ...file(), generatorVersion: 1 }).problems).toEqual([
      'save.generatorVersion is 1, this build reads 4',
    ])
    expect(readSaveSlot({ ...file(), formatVersion: 9, snapshotVersion: 4 }).problems).toEqual([
      'save.formatVersion is 9, this build reads 1',
      'save.snapshotVersion is 4, this build reads 16',
    ])
  })

  it('refuses a world and a profile from different writes', () => {
    const torn = file()
    torn.profile.saveEpoch = 3
    expect(readSaveSlot(torn).problems).toEqual(["save.profile.saveEpoch is 3, the save's is 4"])
  })

  it('refuses planet params this build would not generate for the seed', () => {
    const changed = file()
    changed.world.params = { ...changed.world.params!, radiusTiles: 301 }
    expect(readSaveSlot(changed).problems).toEqual([
      'save.world.params differ from the params this build generates for its seed and planet',
    ])
  })

  it('refuses a section whose values do not match the digest', () => {
    const edited = file()
    edited.profile.players.p1.wallet = '1e+40'
    expect(readSaveSlot(edited).problems).toEqual(['snapshot digest does not match its state'])
  })

  it('refuses something that is not a save at all', () => {
    expect(readSaveSlot('slot-1').problems).toEqual(['save must be an object'])
  })
})

describe('checkpoint moments', () => {
  it.each(['DockEntered', 'RescueTriggered', 'TravelStarted', 'ResourceSold', 'UpgradePurchased'])(
    'writes after %s',
    (type) => {
      expect(isCheckpointMoment([{ tick: 1, type } as DomainEvent])).toBe(true)
    },
  )

  it('writes when the vehicle docks after a trip', () => {
    const session = createScriptedSession()
    expect(isCheckpointMoment(session.submit(5, dock))).toBe(true)
  })

  it('writes nothing while the vehicle is out on a trip', () => {
    const session = createScriptedSession()
    const [ore] = surfaceOreTiles(1)
    expect(isCheckpointMoment(mineTile(session, 10, ore))).toBe(false)
  })
})
