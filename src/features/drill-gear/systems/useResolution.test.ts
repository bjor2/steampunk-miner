import { describe, expect, it } from 'vitest'
import type { AuthorityCommand, CommandIntent } from '../../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  mineTile,
  poseAbove,
  WORLD_SEED,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { replayRun } from '../../../systems/replay/replayRun'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import {
  chargesLeftOf,
  intentToHoldSlot,
  isToggleEngaged,
  powerUpAtMarkOf,
} from '../../power-up-core'
import { ofType, press } from '../drillGearTestSession'
import { backfillRowOf } from './backfillRow'
import { CUTTERS_AND_BOOM_SOURCE } from './cuttersAndBoom'

// The drill gear's Mark milestones (the GD lock on #256, build 5) through the real power-up path on
// the loaded slices: the spoil auger's Mark 3 hold and Mark 6 second tap, the sampling corer's Mark 3
// second tap and Mark 6 hold, and the vibratory bit's Mark 3 sibling-link to the corer. A Mark N node
// is researched from planet `unlockTier + 3 (N - 1)` (#161): the bit unlocks on 4, the auger on 8 and
// the corer on 24. The class's Mark 3 input replays the same jumped and at 30 and 144 frames a second.

const AUGER = 'gear.spoil_auger'
const CORER = 'gear.sampling_corer'
const BIT = 'gear.vibratory_bit'
const CUTTERS = 'gear.side_cutters'
/** Planet-1 ground whose next cell down is an ore cell (`drillGearInPlay.test.ts`). */
const ABOVE_ORE: TilePoint = { tx: 30, ty: 280 }
/** Band-1 ground six rows under the surface, with ground below it (`vibratoryCrumble.test.ts`). */
const SOFT_GROUND: TilePoint = { tx: 30, ty: 285 }
/** Drill tip 2.48 on planet 1: band-1 ground is under half of it, so the bit crumbles it. */
const SHARP_TIP_LEVEL = 40
const DRILL_TICKS = 60

/** A scripted session that keeps its commands, so a spec can replay them at a frame rate. */
interface RecordedSession extends ScriptedSession {
  commands: () => readonly AuthorityCommand[]
}

function recordedSession(): RecordedSession {
  const session = createScriptedSession()
  const commands: AuthorityCommand[] = []
  const submit = (tick: number, intent: CommandIntent, playerId = 'p1') => {
    commands.push({ playerId, tick, seq: commands.length + 1, ...intent } as AuthorityCommand)
    return session.submit(tick, intent, playerId)
  }
  return { ...session, submit, commands: () => commands }
}

const researchThrough = (planetIndex: number): CommandIntent =>
  ({ type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } }) as CommandIntent

/** The run replayed jumped to each command, then in frames of 30 and 144 a second. */
function replayedAtEveryRate(session: RecordedSession, endTick: number) {
  return [undefined, 30, 144].map((framesPerSecond) =>
    replayRun(WORLD_SEED, session.commands(), { endTick, framesPerSecond }),
  )
}

function usedLinesOf(events: readonly DomainEvent[]) {
  return ofType(events, 'power-up-core.PowerUpUsed').flatMap((event) =>
    event.type === 'power-up-core.PowerUpUsed'
      ? [{ milestone: event.milestone ?? 'plain', toggledOn: event.toggledOn }]
      : [],
  )
}

function rejectionsOf(events: readonly DomainEvent[]) {
  return ofType(events, 'CommandRejected').map((event) =>
    event.type === 'CommandRejected' ? event.reason : null,
  )
}

const SHAFT = Array.from({ length: 9 }, (_, depth) => ({ tx: GROUND.tx, ty: GROUND.ty - depth }))
const SHAFT_BOTTOM = SHAFT[SHAFT.length - 1]
const SWITCH_ON_TICK = 600

/** A bored shaft with the miner at its foot and the auger switched on, then followed up. */
function augerFollowedUp(planetIndex: number, follow: CommandIntent): RecordedSession {
  const session = recordedSession()
  session.submit(0, researchThrough(planetIndex))
  session.submit(0, setVehicleLoadoutCommand({ 'drill.collar': AUGER }))
  SHAFT.forEach((tile, at) => mineTile(session, 10 + at * 50, tile))
  session.submit(550, poseAbove({ tx: SHAFT_BOTTOM.tx, ty: SHAFT_BOTTOM.ty - 1 }, FACING.down))
  session.submit(SWITCH_ON_TICK, press('drill.collar'))
  session.submit(SWITCH_ON_TICK + 1, follow)
  return session
}

/** How many rows behind the shaft's foot the auger has packed. */
function rowsPackedOf(events: readonly DomainEvent[]): number[] {
  const rows = ofType(events, 'drill-gear.TunnelBackfilled').flatMap((event) =>
    event.type === 'drill-gear.TunnelBackfilled' ? [event.ty - SHAFT_BOTTOM.ty] : [],
  )
  return [...new Set(rows)].sort((a, b) => a - b)
}

describe('drill-gear Mark milestones (#256): the spoil auger, a toggle', () => {
  it('at M3 the hold packs a plug three rows deep at once and at M2 it is refused, at 30 and 144 steps/s', () => {
    const atMark3 = augerFollowedUp(14, intentToHoldSlot('drill.collar'))
    const rows3 = replayedAtEveryRate(atMark3, SWITCH_ON_TICK + 1).map((run) =>
      rowsPackedOf(run.events),
    )
    expect(rows3[1]).toEqual(rows3[0])
    expect(rows3[2]).toEqual(rows3[0])
    // The clock step packs the usual row (2 m behind the hull, 3 rows above the foot); the hold
    // packs the two behind it at once.
    expect(rows3[0]).toEqual([3, 4, 5])

    const atMark2 = augerFollowedUp(11, intentToHoldSlot('drill.collar'))
    const runs2 = replayedAtEveryRate(atMark2, SWITCH_ON_TICK + 1)
    expect(rejectionsOf(runs2[0].events)).toEqual(['power-up-core.no_milestone'])
    expect(runs2.map((run) => rowsPackedOf(run.events))).toEqual([[3], [3], [3]])
  })

  it('stays switched on after its hold', () => {
    const session = augerFollowedUp(14, intentToHoldSlot('drill.collar'))
    expect(usedLinesOf(session.events()).slice(-1)).toEqual([
      { milestone: 'hold', toggledOn: true },
    ])
    expect(isToggleEngaged(session.state(), 'p1', AUGER)).toBe(true)
  })

  it('at M6 the second tap packs a row instead of switching off, and at M5 it switches off', () => {
    const atMark6 = augerFollowedUp(23, press('drill.collar'))
    expect(usedLinesOf(atMark6.events()).slice(-1)).toEqual([
      { milestone: 'second-tap', toggledOn: true },
    ])
    expect(isToggleEngaged(atMark6.state(), 'p1', AUGER)).toBe(true)
    expect(rowsPackedOf(atMark6.events())).toEqual([3, 4])
    const atMark5 = augerFollowedUp(20, press('drill.collar'))
    expect(usedLinesOf(atMark5.events()).slice(-1)).toEqual([
      { milestone: 'plain', toggledOn: false },
    ])
  })

  it("packs the second tap's row five tiles wide", () => {
    const pose = poseAbove(SHAFT_BOTTOM, FACING.down).payload
    expect(backfillRowOf({ ...pose, facing: FACING.down }, 2, 2)).toHaveLength(5)
    expect(backfillRowOf({ ...pose, facing: FACING.down }, 2)).toHaveLength(3)
  })
})

describe('drill-gear Mark milestones (#256): the sampling corer, a charged part', () => {
  const ACT_TICK = 8

  /** The corer pressed at tick 2 above ore, then followed up 20 ticks after it acted. */
  function corerFollowedUp(planetIndex: number, follow: CommandIntent): RecordedSession {
    const session = recordedSession()
    session.submit(0, researchThrough(planetIndex))
    session.submit(0, setVehicleLoadoutCommand({ 'drill.collar': CORER }))
    session.submit(1, poseAbove(ABOVE_ORE, FACING.down))
    session.submit(2, press('drill.collar'))
    session.submit(ACT_TICK + 20, follow)
    session.advanceTo(ACT_TICK + 40)
    return session
  }

  const sampledTilesOf = (events: readonly DomainEvent[]) =>
    ofType(events, 'OreSampled').flatMap((event) =>
      event.type === 'OreSampled' ? [{ tx: event.tx, ty: event.ty }] : [],
    )

  it('at M3 the second tap cores beside the bit and at M2 it waits out the cooldown, at 30 and 144 steps/s', () => {
    const atMark3 = corerFollowedUp(30, press('drill.collar'))
    const runs3 = replayedAtEveryRate(atMark3, ACT_TICK + 40)
    const used3 = runs3.map((run) => usedLinesOf(run.events).map((line) => line.milestone))
    expect(used3).toEqual([
      ['plain', 'second-tap'],
      ['plain', 'second-tap'],
      ['plain', 'second-tap'],
    ])
    const straightAhead = { tx: ABOVE_ORE.tx, ty: ABOVE_ORE.ty - 1 }
    const [first, ...beside] = sampledTilesOf(runs3[0].events)
    expect(first).toEqual(straightAhead)
    expect(beside).not.toContainEqual(straightAhead)

    const atMark2 = corerFollowedUp(27, press('drill.collar'))
    const runs2 = replayedAtEveryRate(atMark2, ACT_TICK + 40)
    expect(runs2.map((run) => rejectionsOf(run.events))).toEqual([
      ['power-up-core.cooling_down'],
      ['power-up-core.cooling_down'],
      ['power-up-core.cooling_down'],
    ])
  })

  it('at M6 the hold draws the plug from the farthest ore in reach, at two charges', () => {
    const session = corerFollowedUp(39, intentToHoldSlot('drill.collar'))
    const [nearest, farthest] = sampledTilesOf(session.events())
    expect(farthest.tx).toBe(nearest.tx)
    expect(farthest.ty).toBeLessThanOrEqual(nearest.ty)
    expect(usedLinesOf(session.events()).map((line) => line.milestone)).toEqual(['plain', 'hold'])
    const charges = powerUpAtMarkOf(session.state(), 'p1', CORER)?.charges ?? 0
    expect(chargesLeftOf(session.state(), 'p1', CORER)).toBe(charges - 2)
  })
})

describe('drill-gear Mark milestones (#256): the vibratory bit links to the corer on soft ground', () => {
  /** One drill command down soft ground with the bit and the corer slotted, researched to `planet`. */
  function crumbledAt(planetIndex: number, slots: Readonly<Record<string, string>>) {
    const session = createScriptedSession()
    session.submit(0, researchThrough(planetIndex))
    session.submit(0, {
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'drill_tip', level: SHARP_TIP_LEVEL },
    })
    session.submit(0, setVehicleLoadoutCommand(slots))
    session.submit(1, poseAbove(SOFT_GROUND, FACING.down))
    session.submit(
      1 + DRILL_TICKS,
      poseAbove(SOFT_GROUND, FACING.down, { drillTicks: DRILL_TICKS }),
    )
    return session
  }

  const BOTH = { 'drill.head': BIT, 'drill.collar': CORER }

  it("at M3 a cut of soft ground fires the slotted corer from the collar once, on the corer's own charge", () => {
    const session = crumbledAt(10, BOTH)
    const cutGround = ofType(session.events(), 'TileDestroyed')
    expect(cutGround.length).toBeGreaterThan(1)
    expect(ofType(session.events(), 'power-up-core.LinkFired')).toMatchObject([
      { itemId: BIT, siblingId: CORER, slot: 'drill.collar' },
    ])
    expect(chargesLeftOf(session.state(), 'p1', CORER)).toBe(3)
  })

  it('at M2, or with the corer unslotted, a cut of soft ground fires nothing and spends nothing', () => {
    const atMark2 = crumbledAt(7, BOTH)
    expect(ofType(atMark2.events(), 'TileDestroyed').length).toBeGreaterThan(0)
    expect(ofType(atMark2.events(), 'power-up-core.LinkFired')).toEqual([])
    expect(chargesLeftOf(atMark2.state(), 'p1', CORER)).toBe(4)
    const unslotted = crumbledAt(10, { 'drill.head': BIT })
    expect(ofType(unslotted.events(), 'power-up-core.LinkFired')).toEqual([])
  })
})

describe("drill-gear Mark milestones (#276): the side cutters' hold, a toggle", () => {
  /** `side_drills` opens on planet 13; the cutters' Mark 3 is researched from planet 19. */
  const SIDE_DRILLS_PLANET = 13
  const MARK_3_PLANET = 19
  const MARK_2_PLANET = 16

  interface CuttersSetup {
    researchedThrough: number
    onPlanet?: number
    slots?: Readonly<Record<string, string>>
  }

  /** On `onPlanet`, the miner faced right, switched the cutters on and then followed up. */
  function cuttersFollowedUp(setup: CuttersSetup, follow: CommandIntent): RecordedSession {
    const session = recordedSession()
    const planetIndex = setup.onPlanet ?? SIDE_DRILLS_PLANET
    session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } } as CommandIntent)
    session.submit(0, researchThrough(setup.researchedThrough))
    session.submit(0, setVehicleLoadoutCommand(setup.slots ?? { 'drill.flank': CUTTERS }))
    session.submit(1, poseAbove(GROUND, FACING.right))
    session.submit(2, press('drill.flank'))
    session.submit(3, follow)
    return session
  }

  const askOf = (state: ReturnType<RecordedSession['state']>) =>
    CUTTERS_AND_BOOM_SOURCE.gearOf(state, 'p1')

  it('at M3 the hold asks for the faced side only and at M2 it is refused, at 30 and 144 steps/s', () => {
    const atMark3 = cuttersFollowedUp(
      { researchedThrough: MARK_3_PLANET },
      intentToHoldSlot('drill.flank'),
    )
    const runs3 = replayedAtEveryRate(atMark3, 4)
    expect(runs3.map((run) => usedLinesOf(run.events).slice(-1))).toEqual(
      runs3.map(() => [{ milestone: 'hold', toggledOn: true }]),
    )
    // The miner faced right before the hold: that push seeds the faced side.
    for (const run of runs3) {
      expect(askOf(run.state)).toMatchObject({
        sideCells: 1,
        sideAim: 'drive',
        sideSeed: { x: 1, y: 0 },
      })
    }

    const atMark2 = cuttersFollowedUp(
      { researchedThrough: MARK_2_PLANET },
      intentToHoldSlot('drill.flank'),
    )
    const runs2 = replayedAtEveryRate(atMark2, 4)
    expect(runs2.map((run) => rejectionsOf(run.events))).toEqual(
      runs2.map(() => ['power-up-core.no_milestone']),
    )
    for (const run of runs2) expect(askOf(run.state)).toEqual(askOf(runs2[0].state))
    expect(askOf(runs2[0].state)).not.toHaveProperty('sideAim')
    expect(askOf(runs2[0].state)?.sideCells).toBeGreaterThan(0)
  })

  it('stays switched on after its hold, and a plain switch-on afterwards cuts both sides again', () => {
    const held = cuttersFollowedUp(
      { researchedThrough: MARK_3_PLANET },
      intentToHoldSlot('drill.flank'),
    )
    expect(isToggleEngaged(held.state(), 'p1', CUTTERS)).toBe(true)
    held.submit(40, press('drill.flank'))
    expect(askOf(held.state())).toBeNull()
    held.submit(41, press('drill.flank'))
    expect(askOf(held.state())).not.toHaveProperty('sideAim')
  })

  it('cuts both sides as before until side_drills is open, even held at M3', () => {
    const early = cuttersFollowedUp(
      { researchedThrough: MARK_3_PLANET, onPlanet: SIDE_DRILLS_PLANET - 1 },
      intentToHoldSlot('drill.flank'),
    )
    expect(usedLinesOf(early.events()).slice(-1)).toEqual([{ milestone: 'hold', toggledOn: true }])
    expect(askOf(early.state())).not.toHaveProperty('sideAim')
  })

  it('asks nothing for a hold without the cutters owned', () => {
    const unowned = cuttersFollowedUp(
      { researchedThrough: MARK_3_PLANET, slots: {} },
      intentToHoldSlot('drill.flank'),
    )
    expect(askOf(unowned.state())).toBeNull()
  })
})

describe('drill-gear Mark milestones (#256): the card line', () => {
  it('the card shows the next milestone verb in one line', () => {
    const state = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
    const lineAt = (itemId: string, level: number) =>
      describeItem(
        { kind: 'vehicle-item', id: itemId },
        { playerId: 'p1', planetIndex: 1, level, view: itemSnapshotViewOf(state, 'p1') },
      )?.statLines.find((line) => line.label === 'Next milestone')?.now
    expect(lineAt(AUGER, 1)).toBe('Mk III, hold: packs a deep plug behind you in one go')
    expect(lineAt(BIT, 1)).toBe(
      'Mk III, link: cutting soft ground fires the sampling corer at half reach',
    )
    expect(lineAt(CUTTERS, 1)).toBe("Mk III, hold: cuts only the side you're steering toward")
    expect(lineAt('gear.reach_boom', 1)).toBeUndefined()
  })
})
