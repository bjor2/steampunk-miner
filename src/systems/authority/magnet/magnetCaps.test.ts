import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { bandOrePriceAt } from '../../economy/bandOreCost'
import { ECONOMY } from '../../economy/economy'
import { magnetCooldownTicks } from '../../economy/magnetCaps'
import { oreSalePrice } from '../../economy/oreEconomy'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame } from '../../fixedStepClock'
import { fromSafeInteger } from '../../money'
import { gateVerdictOf, type GateVerdict } from '../../registries/gateChecks'
import { oreTypeOf, saleTierOf } from '../../registries/oreTypes'
import { ticksPerTile } from '../../vehicle/drillRule'
import { ENERGY_QUANTA_PER_TICK } from '../../vehicle/energyQuanta'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import { bandOfTile } from '../../world/planetGeometry'
import { planetParamsFor, type PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { vehicleOf, type AuthorityState } from '../authorityState'
import type { AuthorityCommand } from '../authorityCommand'
import { hardnessOfTile } from '../groundDrill'
import { BELOW_FLOOR, FLOOR, HEAT_PARAMS, HEAT_PLANET } from '../lava/lavaFixtures'
import { resourceTierOf } from '../minedOre'
import { coreTiles, PARAMS, WORLD_SEED } from '../scriptedSession'
import {
  bandEdgeWall,
  groundWalls,
  isDiggableBy,
  isDiggableByStartingDrill,
  magnetProbeSlice,
  oreWalls,
  playMagnetRun,
  probeOf,
  PUSH_TICK,
  type WallAndCave,
} from './magnetFixtures'

// The Vertical caps of the GD lock on #246 (ticket 283): a magnet use moves at most 8 diggable
// cells, each into an open cell of its own band, conserved, for at least its dig energy, and no Mark
// takes the cooldown under 600 ticks. The world-changing cases run the clock in render frames of
// 30 and 144 a second. A fake slice hollows caves and pushes (`magnetFixtures.ts`).

const STEP_RATES = [30, 144] as const
const CAPS = ECONOMY.magnets
/** The lock's ladder: a base cooldown of 1200 ticks, x0.92 a Mark. */
const BASE_COOLDOWN_TICKS = 1200
const COOLDOWN_STEP = 0.92
const MARKS_CHECKED = 64
const DEEP_DRILL_TRACKS = ['drill_power', 'drill_tip']
const DEEP_DRILL_LEVEL = 400

function onPlanet(planetIndex: number): AuthorityCommand[] {
  return [
    { playerId: 'p1', tick: 0, seq: 0, type: 'debug.setPlanet', payload: { planetIndex } },
    { playerId: 'p1', tick: 0, seq: 0, type: 'debug.freezeEnemies', payload: { frozen: true } },
  ]
}

/** A drill far past the curve, so the core and lava stand on their kind alone, not the tip. */
function withDeepDrill(lead: AuthorityCommand[]): AuthorityCommand[] {
  const levels = DEEP_DRILL_TRACKS.map((upgradeId): AuthorityCommand => ({
    playerId: 'p1',
    tick: 0,
    seq: 0,
    type: 'debug.setUpgrade',
    payload: { upgradeId, level: DEEP_DRILL_LEVEL },
  }))
  return [...lead, ...levels]
}

function hasMoved(state: AuthorityState, params: PlanetParams, pair: WallAndCave): boolean {
  const wallCell = cellAt(EMPTY_WORLD, params, pair.wall)
  return (
    cellAt(state.world, params, pair.cave) === wallCell &&
    kindOfCell(cellAt(state.world, params, pair.wall)) === CELL_KIND.air
  )
}

function hasStayed(state: AuthorityState, params: PlanetParams, pair: WallAndCave): boolean {
  return (
    cellAt(state.world, params, pair.wall) === cellAt(EMPTY_WORLD, params, pair.wall) &&
    kindOfCell(cellAt(state.world, params, pair.cave)) === CELL_KIND.air
  )
}

/** The solid cells over every tile of the pairs, as sorted packed values. */
function solidCellsOf(state: AuthorityState, pairs: readonly WallAndCave[]): number[] {
  return pairs
    .flatMap(({ wall, cave }) => [wall, cave])
    .map((tile) => cellAt(state.world, PARAMS, tile))
    .filter((cell) => kindOfCell(cell) !== CELL_KIND.air)
    .sort((a, b) => a - b)
}

/** What the ore is worth: its tier, its sale price, and its band's `bandOrePriceAt`. */
function worthOf(tile: TilePoint, cell: number) {
  const tier = resourceTierOf(PARAMS, cell)
  const saleTier = saleTierOf(oreTypeOf({ tier, cellFamily: familyOfCell(cell) }))
  const cost = { band: bandOfTile(PARAMS, tile.tx, tile.ty), oreUnits: fromSafeInteger(1) }
  return { tier, saleTier, sale: oreSalePrice(saleTier), bandOre: bandOrePriceAt(cost, 1, 1) }
}

/** A drill gate on every ore cell, naming the cell's band: a move across a band would change it. */
const BAND_GATE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.band',
      check: ({ tile, tool }) =>
        tool === undefined
          ? { outcome: 'cut', gateKind: 'band', required: bandRequired(tile), have: 'any' }
          : null,
    }),
}

function bandRequired(tile: TilePoint): string {
  return `band:${bandOfTile(PARAMS, tile.tx, tile.ty)}`
}

function drillVerdictAt(state: AuthorityState, tile: TilePoint, cell: number): GateVerdict | null {
  const ore = oreTypeOf({ tier: resourceTierOf(PARAMS, cell), cellFamily: familyOfCell(cell) })
  return gateVerdictOf({ state, playerId: 'p1', tile, cell, ore, blast: null })
}

/** The starting drill's energy to dig the wall, in quanta. */
function digQuantaOf(state: AuthorityState, tile: TilePoint): number {
  const drill = statsOfVehicle(vehicleOf(state, 'p1'))
  const cell = cellAt(EMPTY_WORLD, PARAMS, tile)
  const ticks = ticksPerTile(drill, hardnessOfTile(PARAMS, tile, cell)) ?? 0
  return ticks * ENERGY_QUANTA_PER_TICK.drill
}

function markCooldowns(): number[] {
  const cooldowns: number[] = []
  let cooldown = BASE_COOLDOWN_TICKS
  for (let mark = 1; mark <= MARKS_CHECKED; mark++) {
    cooldowns.push(magnetCooldownTicks(CAPS, Math.round(cooldown)))
    cooldown *= COOLDOWN_STEP
  }
  return cooldowns
}

/** Seconds of render frames at `rate` until the clock has stepped `ticks` times. */
function secondsToStep(ticks: number, rate: number): number {
  let clock = NEW_FIXED_STEP_CLOCK
  let stepped = 0
  let frames = 0
  while (stepped < ticks) {
    const frame = stepsForFrame(clock, 1 / rate, 1 / TICKS_PER_SECOND, 8)
    clock = frame.clock
    stepped += frame.steps
    frames += 1
  }
  return frames / rate
}

describe('magnet shift caps', () => {
  it.each(STEP_RATES)('a use moves at most 8 cells, at %i steps/s', (rate) => {
    const pairs = groundWalls(CAPS.maxCellsMoved + 4)
    const state = playMagnetRun([magnetProbeSlice(probeOf(pairs))], { rate })
    const moved = pairs.filter((pair) => hasMoved(state, PARAMS, pair))
    expect(moved).toHaveLength(CAPS.maxCellsMoved)
    expect(pairs.slice(0, CAPS.maxCellsMoved).every((pair) => hasMoved(state, PARAMS, pair))).toBe(
      true,
    )
    expect(pairs.slice(CAPS.maxCellsMoved).every((pair) => hasStayed(state, PARAMS, pair))).toBe(
      true,
    )
  })

  it.each(STEP_RATES)(
    'a moved cell keeps tier, gate and bandOrePriceAt and the cell count is conserved, at %i steps/s',
    (rate) => {
      const pairs = oreWalls(4)
      const before = playMagnetRun([magnetProbeSlice(probeOf(pairs)), BAND_GATE], {
        rate,
        endTick: PUSH_TICK - 1,
      })
      const after = playMagnetRun([magnetProbeSlice(probeOf(pairs)), BAND_GATE], { rate })
      expect(pairs.every((pair) => hasMoved(after, PARAMS, pair))).toBe(true)
      const edge = bandEdgeWall()
      const across = playMagnetRun([magnetProbeSlice(probeOf([edge])), BAND_GATE], { rate })
      expect(hasStayed(across, PARAMS, edge)).toBe(true)
      expect(solidCellsOf(after, pairs)).toEqual(solidCellsOf(before, pairs))
      withRegistrations([BAND_GATE], () => {
        for (const { wall, cave } of pairs) {
          const cell = cellAt(before.world, PARAMS, wall)
          expect(worthOf(cave, cellAt(after.world, PARAMS, cave))).toEqual(worthOf(wall, cell))
          expect(drillVerdictAt(after, cave, cell)).toEqual(drillVerdictAt(before, wall, cell))
        }
      })
    },
  )

  it.each(STEP_RATES)(
    'a cell the drill grade cannot dig, a core cell and a lava pocket never move, at %i steps/s',
    (rate) => {
      const deepPlanet = planetParamsFor(WORLD_SEED, 25)
      const [hard] = groundWalls(1, deepPlanet)
      expect(isDiggableByStartingDrill(deepPlanet, hard.wall)).toBe(false)
      const [core] = coreTiles(1)
      const coreCave = { tx: core.tx, ty: core.ty - 1 }
      expect(kindOfCell(cellAt(EMPTY_WORLD, PARAMS, coreCave))).toBe(CELL_KIND.core)
      const cases: [PlanetParams, AuthorityCommand[], WallAndCave][] = [
        [deepPlanet, onPlanet(25), hard],
        [PARAMS, withDeepDrill([]), { wall: core, cave: coreCave }],
        [HEAT_PARAMS, withDeepDrill(onPlanet(HEAT_PLANET)), { wall: FLOOR, cave: BELOW_FLOOR }],
      ]
      for (const [params, lead, pair] of cases) {
        const state = playMagnetRun([magnetProbeSlice(probeOf([pair]))], { rate, lead })
        expect(hasStayed(state, params, pair)).toBe(true)
        if (params !== deepPlanet) expect(isDiggableBy(state, params, pair.wall)).toBe(true)
      }
    },
  )

  it.each(STEP_RATES)('energy per moved cell is at least its dig energy, at %i steps/s', (rate) => {
    const pairs = groundWalls(3)
    const start = playMagnetRun([magnetProbeSlice(probeOf([]))], { rate, endTick: PUSH_TICK })
    const digQuanta = pairs.map(({ wall }) => digQuantaOf(start, wall))
    const askedOver = Math.max(...digQuanta) + 1
    const cases = [
      { asked: 0, owed: digQuanta.reduce((sum, quanta) => sum + quanta, 0) },
      { asked: askedOver, owed: askedOver * pairs.length },
    ]
    for (const { asked, owed } of cases) {
      const slices = [magnetProbeSlice(probeOf(pairs, asked))]
      const used = playMagnetRun(slices, { rate, endTick: PUSH_TICK })
      expect(digQuanta.every((quanta) => quanta > 0)).toBe(true)
      expect(vehicleOf(start, 'p1').energy - vehicleOf(used, 'p1').energy).toBe(owed)
    }
  })

  it.each(STEP_RATES)(
    'cooldown never drops below 600 ticks across all Marks, at %i steps/s',
    (rate) => {
      const cooldowns = markCooldowns()
      expect(Math.min(...cooldowns)).toBe(CAPS.cooldownFloorTicks)
      expect(cooldowns.every((ticks) => ticks >= CAPS.cooldownFloorTicks)).toBe(true)
      const floorSeconds = CAPS.cooldownFloorTicks / TICKS_PER_SECOND
      expect(secondsToStep(Math.min(...cooldowns), rate)).toBeGreaterThanOrEqual(floorSeconds)
    },
  )
})
