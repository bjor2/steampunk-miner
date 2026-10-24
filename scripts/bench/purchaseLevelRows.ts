/**
 * The rows of `bench:purchase-levels` (ticket 840, the Systems row set from the #316 decision):
 * purchase levels L1, L20, L30, L40 and the planet's radius-clamp level, each on planets 1, 5, 10
 * and 40, each on the desktop and the phone profile.
 *
 * A level names a speed: the drill law's cut step of that `drill_power` purchase through planet
 * 1's band-1 rock (L20 about 84 m/s, L30 about 800 m/s, L40 about 7 km/s, `drill-ladder.md`). On
 * a harder planet the same purchase barely scratches (P40's band-1 rock is 3.3e11 times planet
 * 1's), so a row's rig is the weakest `drill_power` whose law step on that planet's band-1 rock
 * reaches the level's planet-1 step, as ticket 560 named its rigs by speed (`slabRigOf`). Every
 * other track is the planet's on-curve step, so the tip scratches the planet's rock as a player
 * there has it. The radius-clamp level is the weakest purchase whose step reaches the planet's
 * radius a tick, where `stepWithinPlanetMm` (ticket 558) holds it: read from the code per planet.
 */
import { STEP_BOUND_TOLERANCE_MM } from '../../src/constants/balance'
import { MM_PER_METRE } from '../../src/constants/physics'
import { FRAME_BUDGET_MS } from '../../src/constants/scene'
import { createAuthorityState } from '../../src/systems/authority/authorityState'
import { planetParamsOf } from '../../src/systems/authority/planetOfState'
import {
  continueScriptedSession,
  FREEZE_ENEMIES,
  poseAbove,
  WORLD_SEED,
  type ScriptedSession,
} from '../../src/systems/authority/scriptedSession'
import { stepBoundsAt } from '../../src/systems/authority/stepBoundRead'
import type { CommandIntent } from '../../src/systems/authority/authorityCommand'
import type { DomainEvent } from '../../src/systems/authority/domainEvent'
import { onCurveSteps } from '../../src/systems/economy/vehicleStats'
import { FACING } from '../../src/systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../src/systems/vehicle/vehicleState'
import type { PlanetParams } from '../../src/systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../src/systems/world/tileGrid'
import { maxViewVerticalOf, pixelsPerMetreOf } from '../../src/systems/render/viewZoom'
import { viewRadiusOf } from '../../src/systems/render/visibleChunks'
import { readFileSync } from 'node:fs'

export const PLANETS = [1, 5, 10, 40] as const
export const PURCHASE_LEVELS = ['L1', 'L20', 'L30', 'L40', 'clamp'] as const
export type PurchaseLevel = (typeof PURCHASE_LEVELS)[number]

/** A screen and CPU the row's frame is judged on. */
export interface BenchProfile {
  name: 'desktop' | 'phone'
  /** Where the profile comes from, printed in every row. */
  source: string
  widthPixels: number
  heightPixels: number
  /** How many times slower than this machine the profile's CPU runs (1 on desktop). */
  cpuSlowdown: number
  frameBudgetMs: number
}

const PHONE_PLAN = JSON.parse(
  readFileSync(new URL('../../e2e/browser/mobile/perfPhonePlan.json', import.meta.url), 'utf8'),
) as { cpuThrottleRates: number[] }

/**
 * Desktop: the ticket's 1280x800, as the repo has no desktop perf profile. Phone: the perf:phone
 * lane's (ticket 481), the Pixel 7 project's landscape screen (`pixel-landscape`, 915x412) at the
 * lane's first CPU throttle rate.
 */
export const PROFILES: readonly BenchProfile[] = [
  {
    name: 'desktop',
    source: 'desktop 1280x800 (ticket 840; no desktop perf profile in the repo)',
    widthPixels: 1280,
    heightPixels: 800,
    cpuSlowdown: 1,
    frameBudgetMs: FRAME_BUDGET_MS,
  },
  {
    name: 'phone',
    source: `perf:phone lane: Pixel 7 landscape 915x412, CPU ${PHONE_PLAN.cpuThrottleRates[0]}x`,
    widthPixels: 915,
    heightPixels: 412,
    cpuSlowdown: PHONE_PLAN.cpuThrottleRates[0],
    frameBudgetMs: FRAME_BUDGET_MS,
  },
]

/**
 * Half the screen's diagonal at the widest view its shape allows (#173, ticket 484): the camera
 * pulls back to it at speed, and the scene streams the chunks it covers.
 */
export function viewRadiusOfProfile(profile: BenchProfile): number {
  const { widthPixels, heightPixels } = profile
  const zoom = pixelsPerMetreOf(heightPixels, maxViewVerticalOf(widthPixels, heightPixels))
  return viewRadiusOf(widthPixels, heightPixels, zoom)
}

/** The rig of one row: its `drill_power` purchase on the planet and the law step it cuts. */
export interface RowRig {
  planet: number
  level: PurchaseLevel
  drillPower: number
  /** The law's cut step through the planet's band-1 rock at the start, mm a tick. */
  lawStepMm: number
}

export interface BenchRow {
  id: string
  rig: RowRig
  profile: BenchProfile
}

export const RIG_PLAYER = 'p1'
/** The column the rigs cut down: this far east of the dock pad's last column. */
const COLUMN_PAST_PAD = 8
/** `drill_power` purchases the rig search looks through. */
const MAX_DRILL_POWER = 1000

/** Every row the filters keep, in planet, level, profile order. */
export function rowsOf(filter: RowFilter): BenchRow[] {
  const planets = PLANETS.filter((planet) => isKept(filter.planets, String(planet)))
  const levels = PURCHASE_LEVELS.filter((level) => isKept(filter.levels, level))
  const profiles = PROFILES.filter((profile) => isKept(filter.profiles, profile.name))
  return planets.flatMap((planet) =>
    levels.flatMap((level) => rowsOfRig(rigOf(planet, level), profiles)),
  )
}

/** Comma lists from the command line; an absent list keeps everything. */
export interface RowFilter {
  planets: readonly string[] | null
  levels: readonly string[] | null
  profiles: readonly string[] | null
}

function isKept(kept: readonly string[] | null, name: string): boolean {
  return kept === null || kept.includes(name)
}

function rowsOfRig(rig: RowRig, profiles: readonly BenchProfile[]): BenchRow[] {
  return profiles.map((profile) => ({
    id: `p${rig.planet}.${rig.level}.${profile.name}`,
    rig,
    profile,
  }))
}

export function rigOf(planet: number, level: PurchaseLevel): RowRig {
  const targetMm = level === 'clamp' ? radiusStepMmOf(planet) : planetOneStepMmOf(level)
  const drillPower = weakestDrillPowerReaching(planet, targetMm)
  return { planet, level, drillPower, lawStepMm: lawStepMmOf(planet, drillPower) }
}

/** The level's own purchase cut through planet 1's band-1 rock, mm a tick. */
function planetOneStepMmOf(level: Exclude<PurchaseLevel, 'clamp'>): number {
  return lawStepMmOf(1, Number(level.slice(1)))
}

/** The planet's radius a tick, mm: the step `stepWithinPlanetMm` holds every drill to. */
function radiusStepMmOf(planet: number): number {
  return paramsOfPlanet(planet).radiusTiles * MM_PER_METRE
}

function paramsOfPlanet(planet: number): PlanetParams {
  return armedSession(planet, 1).params
}

/** The lowest purchase from 1 whose law step reaches `targetMm`; every one above it does too. */
function weakestDrillPowerReaching(planet: number, targetMm: number): number {
  const reaches = (drillPower: number) => lawStepMmOf(planet, drillPower) >= targetMm
  if (!reaches(MAX_DRILL_POWER)) {
    throw new Error(`no drill up to ${MAX_DRILL_POWER} cuts ${targetMm} mm a tick on P${planet}`)
  }
  let [low, high] = [1, MAX_DRILL_POWER]
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (reaches(middle)) high = middle
    else low = middle + 1
  }
  return low
}

/** The law's cut step at the start of the planet's column: the cutting bound less its tolerance. */
function lawStepMmOf(planet: number, drillPower: number): number {
  const { session } = armedSession(planet, drillPower)
  return stepBoundsAt(session.state(), RIG_PLAYER).cuttingMm - STEP_BOUND_TOLERANCE_MM
}

/** A session on `planet` with the row's rig standing in the top cell of its column. */
export interface ArmedSession {
  session: ScriptedSession
  params: PlanetParams
  /** The body's start, mm: the centre of the column's surface cell. */
  start: { x: number; y: number }
}

/** One player on the planet, enemies frozen, the rig bought and posed at the column's top. */
export function armedSession(planet: number, drillPower: number): ArmedSession {
  const state = createAuthorityState({
    planetIndex: planet,
    planetSeed: WORLD_SEED,
    playerIds: [RIG_PLAYER],
  })
  const session = continueScriptedSession(state)
  const params = planetParamsOf(state.planet) as PlanetParams
  const top = columnTopOf(params)
  submitRefusingNothing(session, FREEZE_ENEMIES)
  for (const intent of rigPurchasesOf(planet, drillPower)) submitRefusingNothing(session, intent)
  submitRefusingNothing(session, energyRefillOf(session))
  const pose = poseAbove({ tx: top.tx, ty: top.ty - 1 }, FACING.down)
  submitRefusingNothing(session, pose)
  return { session, params, start: { x: pose.payload.x, y: pose.payload.y } }
}

/** The cut column's surface cell, east of the pad. */
function columnTopOf(params: PlanetParams): TilePoint {
  const tx = params.padLastColumn + COLUMN_PAST_PAD
  return { tx, ty: surfaceRowOfColumn(tx, params.radiusTiles) }
}

/** The planet's on-curve steps (#6 section 3), `drill_power` set to the row's purchase. */
function rigPurchasesOf(planet: number, drillPower: number): CommandIntent<'debug.setUpgrade'>[] {
  const steps = { ...onCurveSteps(planet), drill_power: drillPower }
  return Object.entries(steps).map(([upgradeId, level]) => ({
    type: 'debug.setUpgrade',
    payload: { upgradeId, level },
  }))
}

/** The tank filled to the rig's own capacity (`debug.setEnergy` refuses more). */
export function energyRefillOf(session: ScriptedSession): CommandIntent<'debug.setEnergy'> {
  const energyMax = statsOfVehicle(session.vehicle(RIG_PLAYER)).energyMax
  return { type: 'debug.setEnergy', payload: { energy: String(energyMax) } }
}

/** A refused set-up is refused whole: the row would measure some other rig. */
function submitRefusingNothing(session: ScriptedSession, intent: CommandIntent): void {
  const refusals = refusalsOf(session.submit(0, intent, RIG_PLAYER))
  if (refusals.length > 0) throw new Error(`${intent.type} refused: ${refusals.join('; ')}`)
}

/** Each refusal among `events`, its reason and problems. */
export function refusalsOf(events: readonly DomainEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'CommandRejected' ? [`${event.reason}: ${event.problems.join(', ')}`] : [],
  )
}
