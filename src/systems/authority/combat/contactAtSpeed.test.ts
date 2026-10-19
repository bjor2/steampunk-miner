import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { AUTHORITY_DEV_FLAGS } from '../../../constants/devFlags'
import { ECONOMY } from '../../economy/economy'
import {
  drillDamagePerSecond,
  enemyHealth,
  enemyRockHardness,
  noseDwellTicks,
} from '../../economy/enemyStats'
import { drillPowerAtStep } from '../../economy/vehicleStats'
import { div } from '../../money'
import { canScratch } from '../../vehicle/drillRule'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import { surfaceRowOfColumn, type TilePoint } from '../../world/tileGrid'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEventBody } from '../domainEvent'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { continueScriptedSession, PARAMS } from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import { cutLeg, drillStepOfRig, eventsOfLeg, rigAt, type Leg } from '../sweptRigFixtures'
import { spawnEnemy } from './combatFixtures'
import { enemyDamageRate } from './enemyDamageRate'
import {
  eventsOfPass,
  fateOf,
  PASS_DRILL_STEP,
  passThroughCorridor,
  STRIDE_MM_AT,
  type CorridorPass,
  type EnemyFate,
  type PassRun,
} from './noseContactFixtures'
import { NOSE_CONTACT_FINDING, noseContactVerdictOf } from './noseContactKnownRed'

// Nose contact at speed (ticket 564, C2 of #551: the TD's shape 6254962969, the VS's amendment
// 6254978633, the HS's conditions 6254968595). Before it, contact was a pose test on the combat
// tick, and the TD's run pinned a crawler for 6 ticks at 5 m/s and for none at 84 m/s. The rig
// drives the combat corridor at a fixed stride a tick, as the TD's prototype did, and every row
// runs on the shipped flags unless it names `drill.noseContact`. That flag ships off until the
// combat damage track (#565), so the shipped dwell-at-speed row is held known red under #565.

/** The speeds the VS's bar (b) names; 8400 m/s became reachable with B1 (#558). */
const FAST_SPEEDS = [84, 840, 8400]
/** A crawler six ticks long on the pass's drill: the 5 m/s pin of the TD's run. */
const SIX_TICK_TIER = 50
const TILES_AHEAD = 8
/** A crawler that outlives two of its attack cooldowns pinned on the pass's drill. */
const LONG_TIER = 80
const ON = { noseContact: true } as const
const TICKETS_FOLDER = new URL('../../../../docs/metrics/tickets/', import.meta.url)

function readFindingTicketFile(finding: number): string | null {
  const url = new URL(`${finding}.json`, TICKETS_FOLDER)
  return existsSync(url) ? readFileSync(url, 'utf8') : null
}

function passAt(speed: number, over: Partial<CorridorPass> = {}): PassRun {
  const crawler = { kind: 'crawler', tier: SIX_TICK_TIER, tilesAhead: TILES_AHEAD }
  return passThroughCorridor({ strideMm: STRIDE_MM_AT[speed], enemies: [crawler], ...over })
}

function crawlerAt(speed: number, over: Partial<CorridorPass> = {}): EnemyFate {
  return fateOf(passAt(speed, over), 'e1')
}

/** Killed both times, and within a tick of each other. */
function isSameDwell(fast: EnemyFate, slow: EnemyFate): boolean {
  const isKilled = fast.killTick !== null && slow.killTick !== null
  return isKilled && Math.abs(fast.damageTicks - slow.damageTicks) <= 1
}

/** The pass's drill on a crawler of `tier`, by the one damage seam. */
function dwellOnPass(run: PassRun, tier: number): number {
  return noseDwellTicks(enemyHealth('crawler', tier), enemyDamageRate(run.states[0], 'p1'))
}

describe('nose contact at speed (ticket 564)', () => {
  it('dwells as long at 84, 840 and 8400 m/s as at 5 m/s on the shipped flags, known red under #565', () => {
    const slow = crawlerAt(5)
    const misses = FAST_SPEEDS.map((speed) => ({ speed, fast: crawlerAt(speed) }))
      .filter(({ fast }) => !isSameDwell(fast, slow))
      .map(
        ({ speed, fast }) =>
          `at ${speed} m/s the drill deals ${fast.damageTicks} ticks against ${slow.damageTicks} at 5 m/s`,
      )
    const verdict = noseContactVerdictOf(misses, readFindingTicketFile)
    verdict.knownRed.forEach((line) => console.log(line))
    expect(AUTHORITY_DEV_FLAGS['drill.noseContact']).toBe(false)
    expect(NOSE_CONTACT_FINDING).toBe(565)
    expect(verdict.failures).toEqual([])
  })

  it('with drill.noseContact on, dwells the same ticks at 5, 84, 840 and 8400 m/s: max(1, ceil(...))', () => {
    const slow = crawlerAt(5, ON)
    const dwell = dwellOnPass(passAt(5, ON), SIX_TICK_TIER)
    expect(dwell).toBe(6)
    for (const speed of [5, ...FAST_SPEEDS]) {
      const fate = crawlerAt(speed, ON)
      expect(fate.damageTicks).toBe(dwell)
      expect(fate.killTick).toBe((fate.contactTick as number) + dwell - 1)
      expect(fate.killedFor).toBe('p1')
      expect(isSameDwell(fate, slow)).toBe(true)
    }
  })

  it('kills an under-tier enemy on the tick it is met, at every speed', () => {
    for (const speed of [5, ...FAST_SPEEDS]) {
      const fate = crawlerAt(speed, {
        ...ON,
        enemies: [{ kind: 'crawler', tier: 1, tilesAhead: 8 }],
      })
      expect(fate.damageTicks).toBe(1)
      expect(fate.killTick).not.toBeNull()
      expect(fate.killTick).toBe(fate.contactTick)
    }
  })

  it('grows the dwell with tier with no threshold, every tier killed on its ruled tick', () => {
    for (const tier of [44, 46, 48, 50, 52, 54]) {
      const run = passAt(84, { ...ON, enemies: [{ kind: 'crawler', tier, tilesAhead: 8 }] })
      const fate = fateOf(run, 'e1')
      expect(fate.damageTicks).toBe(dwellOnPass(run, tier))
      expect(fate.killTick).toBe((fate.contactTick as number) + dwellOnPass(run, tier) - 1)
    }
  })

  it('keeps the rig cutting at its speed while a same-tier enemy rides: every cursor as with none', () => {
    const riding = passAt(84, ON)
    const alone = passAt(84, { ...ON, enemies: [], strideTiles: TILES_AHEAD + 3 })
    expect(fateOf(riding, 'e1').damageTicks).toBe(6)
    expect(riding.cursors).toEqual(alone.cursors)
  })

  it('never damages a rider twice: the pin and the ride together deal exactly its dwell', () => {
    const fate = crawlerAt(5, ON)
    const damaged = eventsOfPass(passAt(5, ON)).filter((event) => event.type === 'EnemyDamaged')
    expect(fate.damageTicks).toBe(6)
    expect(damaged.every((event) => event.type === 'EnemyDamaged' && event.arc === 'front')).toBe(
      true,
    )
  })

  it('keeps the pose-only pin with the flag off: six ticks at 5 m/s, none at 84 m/s', () => {
    expect(crawlerAt(5, { noseContact: false }).damageTicks).toBe(6)
    expect(crawlerAt(84, { noseContact: false })).toEqual({
      damageTicks: 0,
      contactTick: expect.any(Number),
      killTick: null,
      killedFor: null,
    })
  })

  it('leaves an enemy-free pass byte-identical with the flag on or off', () => {
    const off = passAt(84, { noseContact: false, enemies: [] })
    const on = passAt(84, { ...ON, enemies: [] })
    expect(on.states.map(digestApartFromFlags)).toEqual(off.states.map(digestApartFromFlags))
    expect(eventsOfPass(on).filter(isPlay)).toEqual(eventsOfPass(off).filter(isPlay))
  })
})

describe('nose contact reads one damage seam (ticket 564, VS 6254978633)', () => {
  const CONTACT_MODULES = ['noseRide.ts', 'noseHold.ts', 'noseContactPath.ts', 'enemyDamage.ts']

  it('never reads drill power in the contact or damage modules, only enemyDamageRate', () => {
    for (const file of CONTACT_MODULES) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(source).not.toMatch(/drillPower(AtStep)?\(/)
    }
  })

  it('rates the drill by one kDrillVsEnemy, the same at every drill level', () => {
    for (const step of [1, 20, PASS_DRILL_STEP, 200]) {
      const run = passAt(5, { drillStep: step, enemies: [], parkedTicks: 1 })
      const rate = enemyDamageRate(run.states[0], 'p1')
      expect(div(rate, drillPowerAtStep(step))).toEqual(ECONOMY.enemies.combat.kDrillVsEnemy)
    }
  })

  it('keeps every dwell when the cut law changes under it (a different tip)', () => {
    const tips = [300, 400, 900].map((drillTip) => crawlerAt(84, { ...ON, drillTip }))
    expect(tips.map((fate) => fate.damageTicks)).toEqual([6, 6, 6])
  })
})

describe('a rider is exact and acts no more (ticket 564, HS 6254968595)', () => {
  it('kills the same way after a snapshot taken mid-ride, its kill logged once', () => {
    const whole = passAt(84, { ...ON, strideTiles: TILES_AHEAD })
    const fate = fateOf(whole, 'e1')
    const midRide = whole.lastStepTick
    expect(midRide).toBeGreaterThanOrEqual(fate.contactTick as number)
    expect(midRide).toBeLessThan(fate.killTick as number)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(stateAt(whole, midRide)))))
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    const resumed = continueScriptedSession(restored.state)
    const end = whole.startTick + whole.states.length
    resumed.advanceTo(end)
    expect(stateDigest(resumed.state())).toBe(stateDigest(whole.session.state()))
    const kills = whole.session.events().filter((event) => event.type === 'EnemyKilled')
    expect(kills).toHaveLength(1)
    expect(resumed.events().filter((event) => event.type === 'EnemyKilled')).toEqual(kills)
  })

  it('takes no action from its engagement on: no strike lands once it rides, one landed before stays', () => {
    const acting = { isFrozen: false, parkedTicks: 260, enemies: [crawlerAhead(2, LONG_TIER)] }
    const ridden = fateOf(passAt(5, { ...acting, ...ON }), 'e1')
    const strikesOn = strikeTicksOf(passAt(5, { ...acting, ...ON }))
    expect(ridden.contactTick).not.toBeNull()
    expect(strikesOn.length).toBeGreaterThan(0)
    expect(strikesOn.every((tick) => tick <= (ridden.contactTick as number))).toBe(true)
    const strikesOff = strikeTicksOf(passAt(5, { ...acting, noseContact: false }))
    expect(strikesOff.length).toBeGreaterThan(strikesOn.length)
  })

  it.todo(
    'kills an ore_thief met at 84 m/s before its theft, a theft done a tick earlier kept (ore_thief row unbuilt)',
  )

  it('kills a full roster of under-tier crawlers crossed at 84 m/s, each on the tick met, never over the cap', () => {
    const cap = ECONOMY.enemies.combat.maxActivePerVehicle
    const enemies = Array.from({ length: cap }, (_, index) => crawlerAhead(4 + index, 1))
    const run = passAt(84, { ...ON, enemies })
    const fates = Array.from({ length: cap }, (_, index) => fateOf(run, `e${index + 1}`))
    expect(
      fates.every((fate) => fate.damageTicks === 1 && fate.killTick === fate.contactTick),
    ).toBe(true)
    expect(Math.max(...run.states.map((state) => state.combat.enemies.length))).toBeLessThanOrEqual(
      cap,
    )
    const killed = eventsOfPass(run).flatMap((event) =>
      event.type === 'EnemyKilled' ? [event.enemyId] : [],
    )
    expect(killed).toEqual(fates.map((_, index) => `e${index + 1}`))
  })

  it.todo(
    'keeps a swarm_nests swarm dying in one tick at 84 m/s inside the T7 density budget (swarm_nests row unbuilt)',
  )
})

describe('a tougher enemy holds the cut, and is no gate (ticket 564, HS 6254968595 condition 1)', () => {
  it('holds the cut for the wrecker’s dwell: no DrillGated, the reach and carry kept, then it dies', () => {
    const held = holdingLeg([spawnEnemy('tunnel_wrecker', 1, 0, -4)], 0)
    expectHeldThenFreed(held, 'tunnel_wrecker')
  })

  it('holds the cut for a crawler whose tier’s rock the rig’s gate tip cannot scratch', () => {
    const tier = firstTierPastTip(0)
    const held = holdingLeg([spawnEnemy('crawler', tier, 0, -4)], 0)
    expectHeldThenFreed(held, 'crawler')
  })

  it('lets a crawler of a tier its tip scratches ride, the cut never held', () => {
    const riding = holdingLeg([spawnEnemy('crawler', 1, 0, -4)], 0)
    const alone = holdingLeg([], 0)
    expect(riding.reaches.slice(0, alone.reaches.length)).toEqual(alone.reaches)
  })

  it.todo('holds the cut for a core_guardian whatever its tier (core_guardian row unbuilt)')

  it('keeps a gated cell a hard stop with a crossed burrower, hit once, and every cell event as without it', () => {
    for (const drillStep of BURROWER_RIG_STEPS) {
      const withBurrower = gatedColumnEvents(drillStep, [spawnEnemy('burrower', 1, 0, -3)])
      const without = gatedColumnEvents(drillStep, [])
      const kills = withBurrower.filter((event) => event.type === 'EnemyKilled')
      expect(kills.map((event) => event.type === 'EnemyKilled' && event.kind)).toEqual(['burrower'])
      expect(drillTicksIn(withBurrower)).toBe(burrowerDwellOn(drillStep))
      expect(cellEventsOf(withBurrower)).toEqual(cellEventsOf(without))
      expect(withBurrower.some((event) => event.type === 'DrillGated')).toBe(true)
      expect(withBurrower.some((event) => event.type === 'CargoAdded')).toBe(true)
    }
  })
})

/** The state's digest with the session's flags left out: they are what the two runs differ in. */
function digestApartFromFlags(state: AuthorityState): string {
  const { devFlagDelta: _delta, devFlagsEverSet: _everSet, ...play } = state
  return stateDigest(play)
}

/** Every event but the periodic digest, which reads the flags too. */
function isPlay(event: { type: string }): boolean {
  return event.type !== 'StateDigested'
}

function crawlerAhead(tilesAhead: number, tier = SIX_TICK_TIER) {
  return { kind: 'crawler', tier, tilesAhead }
}

function stateAt(run: PassRun, tick: number): AuthorityState {
  return run.states[tick - run.startTick - 1]
}

function strikeTicksOf(run: PassRun): number[] {
  return eventsOfPass(run).flatMap((event) => (event.type === 'VehicleDamaged' ? [event.tick] : []))
}

/** Column 30 from just over the surface: band-1 ground, an ore cell, then the cell a probe gates. */
const COLUMN = 30
const GATED_CELL: TilePoint = { tx: COLUMN, ty: 292 }
const OVER_THE_SURFACE: Leg = {
  start: {
    xMm: COLUMN * 1000 + 500,
    yMm: (surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) + 1) * 1000 + 500,
  },
  upx: 0,
  upy: 1024,
}
/** The rigs of the 84, 840 and 8400 m/s rows: the TD's 78 m/s rig, the 3600 m/s one, the pass's. */
const BURROWER_RIG_STEPS = [drillStepOfRig(rigAt(78)), drillStepOfRig(rigAt(3600)), PASS_DRILL_STEP]
const HOLD_RIG = rigAt(78)
const NOSE_CONTACT_ON: CommandIntent = {
  type: 'debug.setFlags',
  payload: { delta: { 'drill.noseContact': true } },
}

/** A slice whose gate refuses the drill one cell down the column. */
const GATE_ONE_CELL: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.one-cell',
      check: ({ tile }) =>
        tile.tx === GATED_CELL.tx && tile.ty === GATED_CELL.ty
          ? { outcome: 'refused', gateKind: 'probe', required: 'probe-rig', have: 'none' }
          : null,
    }),
}

function gatedColumnEvents(drillStep: number, enemies: readonly CommandIntent[]) {
  const prepare = [NOSE_CONTACT_ON, ...enemies]
  return withRegistrations([GATE_ONE_CELL], () =>
    eventsOfLeg(cutLeg({ rig: HOLD_RIG, drillStep, leg: OVER_THE_SURFACE, maxTicks: 60, prepare })),
  )
}

function drillTicksIn(events: readonly DomainEventBody[]): number {
  return events.reduce(
    (ticks, event) => ticks + (event.type === 'EnemyDamaged' ? event.ticks : 0),
    0,
  )
}

/** A tier-1 burrower's dwell on the rig at `drillStep`, by the one damage seam. */
function burrowerDwellOn(drillStep: number): number {
  const rate = drillDamagePerSecond(drillPowerAtStep(drillStep))
  return noseDwellTicks(enemyHealth('burrower', 1), rate)
}

/** The leg's events with every enemy's left out, unnumbered: one leg sends a spawn command more. */
function cellEventsOf(events: readonly { type: string; seq?: number }[]) {
  return events
    .filter((event) => !event.type.startsWith('Enemy'))
    .map(({ seq: _seq, ...event }) => event)
}

/** A held leg: where the cut reached and what it carried each tick, and its events. */
interface HoldLeg {
  reaches: string[]
  states: AuthorityState[]
  events: { type: string; tick?: number }[]
}

function holdingLeg(enemies: readonly CommandIntent[], drillTip: number): HoldLeg {
  const run = cutLeg({
    rig: HOLD_RIG,
    leg: OVER_THE_SURFACE,
    maxTicks: 90,
    reachMm: 30_000,
    upgrades: { drill_tip: drillTip },
    prepare: [NOSE_CONTACT_ON, ...enemies],
  })
  const states = run.ticks.map((tick) => tick.state)
  const reaches = states.map((state) => {
    const cursor = vehicleOf(state, 'p1').sweptCut
    return cursor === undefined ? '-' : `${cursor.xMm},${cursor.yMm},${cursor.carrySubSteps}`
  })
  return { reaches, states, events: run.ticks.flatMap((tick) => tick.events) }
}

/** The first enemy tier whose rock a rig at tip step `drillTip` cannot scratch. */
function firstTierPastTip(drillTip: number): number {
  const leg = holdingLeg([], drillTip)
  const { gateTip } = statsOfVehicle(vehicleOf(leg.states[0], 'p1'))
  let tier = 1
  while (canScratch(gateTip, enemyRockHardness(tier))) tier++
  return tier
}

function expectHeldThenFreed(held: HoldLeg, kind: string): void {
  const engaged = held.states.findIndex((state) =>
    state.combat.enemies.some((enemy) => enemy.ride !== undefined),
  )
  const killed = held.states.findIndex((state) => state.combat.enemies.length === 0)
  expect(engaged).toBeGreaterThanOrEqual(0)
  expect(killed).toBeGreaterThan(engaged + 1)
  const rider = held.states[engaged].combat.enemies[0]
  const dwell = noseDwellTicks(
    enemyHealth(rider.kind, rider.tier),
    enemyDamageRate(held.states[engaged], 'p1'),
  )
  expect(rider.kind).toBe(kind)
  for (let index = engaged + 1; index < killed; index++) {
    expect(held.reaches[index]).toBe(held.reaches[engaged])
  }
  expect(killed - engaged).toBe(dwell - 1)
  expect(held.reaches[killed]).not.toBe(held.reaches[engaged])
  expect(held.events.some((event) => event.type === 'DrillGated')).toBe(false)
  expect(held.events.filter((event) => event.type === 'EnemyKilled')).toHaveLength(1)
}
