/**
 * Passes the nose contact specs drive (ticket 564): the rig of `sweptRigFixtures.ts` (its tip,
 * a deep tank) at a fixed stride a tick through the combat corridor of `combatFixtures.ts`, with
 * the enemies a spec places dead ahead, as the TD's prototype of #551 section 9 drove it. The body
 * strides on whatever the cut does, then stands while the clock runs the rides out, so a pass
 * reads what the authority did with each enemy the nose crossed. Spec support; it reads, never
 * writes.
 */
import type { AuthorityDevFlags } from '../../../constants/devFlags'
import { hullMaxAtStep } from '../../economy/vehicleStats'
import { toCanonical } from '../../money'
import type { SweptCut } from '../../vehicle/sweptCut'
import { FACING } from '../../vehicle/vehiclePose'
import { NO_DRIVE } from '../../vehicle/driveSigns'
import type { AuthorityState } from '../authorityState'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, type ScriptedSession } from '../scriptedSession'
import {
  CORRIDOR_MIDDLE,
  freezeEnemies,
  poseAt,
  prepareCorridor,
  spawnEnemy,
} from './combatFixtures'

/** The rig's speeds the rows name, in mm a tick (60 ticks a second). */
export const STRIDE_MM_AT: Readonly<Record<number, number>> = {
  5: 83,
  84: 1_400,
  840: 14_000,
  8400: 140_000,
}

/** The drill_power purchase whose stats bound lets one step cover 140 m: an 8400 m/s rig. */
export const PASS_DRILL_STEP = 45

/** The tip of `sweptRigFixtures.ts`: it scratches the rock of every tier the rows place. */
const PASS_TIP_STEP = 400

/** The hull of `sweptRigFixtures.ts`'s rig: no strike a row provokes destroys it. */
const PASS_HULL_STEP = 2_000

/** The pass starts this many tiles behind the corridor's middle, facing along it. */
const START_TILES_BEHIND = 5

/** The body strides on until it stands this many tiles past the furthest enemy it set out to meet. */
const STRIDE_PAST_TILES = 3

/** Ticks the clock runs after the pass starts: every ride the rows start ends inside them. */
const PASS_TICKS = 400

export const PASS_START = {
  x: (CORRIDOR_MIDDLE.tx - START_TILES_BEHIND) * 1000 + 500,
  y: CORRIDOR_MIDDLE.ty * 1000 + 500,
}

/** An enemy dead ahead of the pass's start, `tilesAhead` along the corridor, `dyTiles` across. */
export interface EnemyPlacement {
  kind: string
  tier: number
  tilesAhead: number
  dyTiles?: number
}

/** What a pass is: its stride, its enemies, and what differs from the corridor's frozen fight. */
export interface CorridorPass {
  strideMm: number
  enemies: readonly EnemyPlacement[]
  /** The nose contact flag; absent, the session runs on the shipped default. */
  noseContact?: boolean
  /** Enemies frozen (the default), or acting. */
  isFrozen?: boolean
  drillStep?: number
  drillTip?: number
  /** Stands the body still on its start, a drill step a tick, for this many ticks. */
  parkedTicks?: number
  /** How far past its start the body strides, in tiles: by default 3 past the furthest enemy. */
  strideTiles?: number
}

/** A pass's session, the tick it started from, and its record a tick at a time. */
export interface PassRun {
  session: ScriptedSession
  startTick: number
  /** The state after each tick of the pass, in order. */
  states: AuthorityState[]
  /** The cursor after each tick, the same order. */
  cursors: (SweptCut | undefined)[]
  /** The tick of the body's last drill step: after it only the clock runs. */
  lastStepTick: number
}

/** The corridor set up, the rig armed and the enemies placed; the pass, then the clock run on. */
export function passThroughCorridor(pass: CorridorPass): PassRun {
  const session = createScriptedSession()
  const startTick = prepareCorridor(session, FACING.right)
  for (const intent of armingOf(pass)) session.submit(startTick, intent)
  const xs = bodyPositionsOf(pass)
  const lastStepTick = startTick + xs.length
  const run: PassRun = { session, startTick, states: [], cursors: [], lastStepTick }
  for (let index = 0; index < PASS_TICKS; index++) {
    stepOrWait(session, startTick + 1 + index, xs[index])
    run.states.push(session.state())
    run.cursors.push(session.vehicle().sweptCut)
  }
  return run
}

/** The commands that arm the rig and place the pass's enemies. */
function armingOf(pass: CorridorPass): CommandIntent[] {
  return [
    upgradeTo('drill_power', pass.drillStep ?? PASS_DRILL_STEP),
    upgradeTo('drill_tip', pass.drillTip ?? PASS_TIP_STEP),
    upgradeTo('hull', PASS_HULL_STEP),
    { type: 'debug.setHull', payload: { hull: toCanonical(hullMaxAtStep(PASS_HULL_STEP)) } },
    { type: 'debug.setEnergy', payload: { energy: '1000000000' } },
    freezeEnemies(pass.isFrozen ?? true),
    ...flagsOf(pass),
    poseAt(
      { tx: CORRIDOR_MIDDLE.tx - START_TILES_BEHIND, ty: CORRIDOR_MIDDLE.ty },
      {
        facing: FACING.right,
      },
    ),
    ...pass.enemies.map((enemy) =>
      spawnEnemy(enemy.kind, enemy.tier, enemy.tilesAhead, enemy.dyTiles ?? 0),
    ),
  ]
}

function upgradeTo(upgradeId: string, level: number): CommandIntent {
  return { type: 'debug.setUpgrade', payload: { upgradeId, level } } as CommandIntent
}

function flagsOf(pass: CorridorPass): CommandIntent[] {
  if (pass.noseContact === undefined) return []
  const delta: Partial<AuthorityDevFlags> = { 'drill.noseContact': pass.noseContact }
  return [{ type: 'debug.setFlags', payload: { delta } }]
}

/** The body's x each tick it strides, a stride on from the start; parked, the start each tick. */
function bodyPositionsOf(pass: CorridorPass): number[] {
  if (pass.parkedTicks !== undefined) return Array(pass.parkedTicks).fill(PASS_START.x)
  const furthest = Math.max(0, ...pass.enemies.map((enemy) => enemy.tilesAhead))
  const endX = PASS_START.x + (pass.strideTiles ?? furthest + STRIDE_PAST_TILES) * 1000
  const xs: number[] = []
  for (let x = PASS_START.x + pass.strideMm; xs.length === 0 || xs[xs.length - 1] < endX;) {
    xs.push(x)
    x += pass.strideMm
  }
  return xs
}

function stepOrWait(session: ScriptedSession, tick: number, x: number | undefined): void {
  if (x === undefined) {
    session.advanceTo(tick)
    return
  }
  const payload = { x, y: PASS_START.y, facing: FACING.right, drive: NO_DRIVE }
  session.submit(tick, { type: 'drillStep', payload })
}

/** What became of one enemy in a pass. */
export interface EnemyFate {
  /** The ticks of drill damage it took. */
  damageTicks: number
  /**
   * The tick it was first pinned or engaged on the nose, or killed on the tick it was met; null
   * when never.
   */
  contactTick: number | null
  /** The tick it was killed, and the player its kill concerns; null while it lives. */
  killTick: number | null
  killedFor: string | null
}

export function fateOf(run: PassRun, enemyId: string): EnemyFate {
  const events = eventsOfPass(run).filter((event) => enemyIdOf(event) === enemyId)
  const kill = events.find((event) => event.type === 'EnemyKilled')
  return {
    damageTicks: events.reduce((ticks, event) => ticks + drillTicksOf(event), 0),
    contactTick: contactTickOf(run, enemyId) ?? kill?.tick ?? null,
    killTick: kill?.tick ?? null,
    killedFor: kill?.playerId ?? null,
  }
}

/** The events of the pass's own ticks, after the set-up. */
export function eventsOfPass(run: PassRun): DomainEvent[] {
  return run.session.events().filter((event) => (event.tick ?? 0) > run.startTick)
}

function enemyIdOf(event: DomainEvent): string | null {
  return 'enemyId' in event && typeof event.enemyId === 'string' ? event.enemyId : null
}

function drillTicksOf(event: DomainEvent): number {
  return event.type === 'EnemyDamaged' && event.source === 'drill' ? event.ticks : 0
}

function contactTickOf(run: PassRun, enemyId: string): number | null {
  const index = run.states.findIndex((state) =>
    state.combat.enemies.some((enemy) => enemy.id === enemyId && enemy.phase === 'pinned'),
  )
  return index < 0 ? null : run.startTick + 1 + index
}
