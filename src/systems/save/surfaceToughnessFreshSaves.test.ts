import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { hardnessOfTile } from '../authority/groundDrill'
import { planetParamsOf } from '../authority/planetOfState'
import { createScriptedSession } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { blockHardness } from '../economy/oreEconomy'
import { fromCanonical, toCanonical, type BigStat } from '../money'
import { SURFACE_LAYER_ORE_RULES, type PlanetParams } from '../world/planetParams'
import { isInsideDisc, type TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import { readMigratedSaveSlot } from './saveMigrations'
import { saveSlotOf } from './saveSlot'

// Ticket 655 (map #647, bar 3): the #625 surface toughness as a player meets it. A fresh game on
// planet 1 buys travel to planets 2 to 5, saves, and loads that save: every rock cell in the top 3
// cells of depth all round the planet is H = 1. A planet a save holds under ore rules 4 or earlier,
// before the layer (ore rules 5), keeps its stamp and its shipped band-1 rock.

const PINNED_CELLS = 3
const LAST_RULES_BEFORE_LAYER = SURFACE_LAYER_ORE_RULES - 1
/** Generator 11 wrote the last saves before the surface layer (ticket 625). */
const GENERATOR_BEFORE_LAYER = 11
const PLANETS = [2, 3, 4, 5] as const
const ONE = toCanonical(fromCanonical('1'))

/** A fresh game that bought travel from planet 1 up to `planetIndex`, a planet at a time. */
function freshGameOn(planetIndex: number): AuthorityState {
  const session = createScriptedSession()
  for (let toPlanet = 2; toPlanet <= planetIndex; toPlanet++) {
    const tick = toPlanet * 10
    session.submit(tick, { type: 'debug.setMoney', payload: { amount: '1e30' } })
    session.submit(tick, { type: 'debug.setCoreFragments', payload: { count: 100000 } })
    session.submit(tick + 1, { type: 'dock', payload: { bay: 'sell' } })
    session.submit(tick + 2, { type: 'travel', payload: { toPlanet } })
  }
  return session.state()
}

/** The state a save slot of `state` loads back to, through JSON as the shell writes it. */
function reloaded(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(JSON.parse(JSON.stringify(file)))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** The state as if its planet had been entered under `oreRulesVersion`. */
function enteredUnder(state: AuthorityState, oreRulesVersion: number): AuthorityState {
  return { ...state, planet: { ...state.planet, oreRulesVersion } }
}

/** That state saved by the generator `generatorVersion`. */
function generatorSaveOf(state: AuthorityState, generatorVersion: number): unknown {
  return { ...saveSlotOf(takeSnapshot(state), 1), generatorVersion }
}

/** Tiles inside the disc but outside the disc `PINNED_CELLS` smaller: the top 3 cells of depth. */
function topCellTiles(params: PlanetParams): TilePoint[] {
  const radius = params.radiusTiles
  const tiles: TilePoint[] = []
  for (let ty = -radius; ty < radius; ty++) {
    for (let tx = -radius; tx < radius; tx++) {
      if (isTopCell(tx, ty, radius)) tiles.push({ tx, ty })
    }
  }
  return tiles
}

function isTopCell(tx: number, ty: number, radius: number): boolean {
  return isInsideDisc(tx, ty, radius) && !isInsideDisc(tx, ty, radius - PINNED_CELLS)
}

/** The hardness of every rock cell the loaded world holds in its top 3 cells, canonical. */
function topRockHardness(state: AuthorityState): string[] {
  const params = planetParamsOf(state.planet) as PlanetParams
  return topCellTiles(params)
    .map((tile) => ({ tile, cell: cellAt(state.world, params, tile) }))
    .filter(({ cell }) => kindOfCell(cell) === CELL_KIND.ground)
    .map(({ tile, cell }) => toCanonical(hardnessOfTile(params, tile, cell)))
}

function shippedBandOne(planetIndex: number): BigStat {
  return blockHardness(planetIndex, 1)
}

describe('surface toughness on fresh saves', () => {
  it.each(PLANETS)(
    'loads a fresh save on planet %i with every top-3 rock cell at H = 1',
    (planetIndex) => {
      const state = reloaded(saveSlotOf(takeSnapshot(freshGameOn(planetIndex)), 1))
      expect(state.planet.index).toBe(planetIndex)
      expect(state.planet.oreRulesVersion).toBeGreaterThanOrEqual(SURFACE_LAYER_ORE_RULES)
      const hardness = topRockHardness(state)
      expect(hardness.length).toBeGreaterThan(1000)
      expect(new Set(hardness)).toEqual(new Set([ONE]))
    },
  )

  it.each(PLANETS)(
    'keeps planet %i of a save made before ore rules 5 on its stamp and its shipped band-1 rock',
    (planetIndex) => {
      const before = enteredUnder(freshGameOn(planetIndex), LAST_RULES_BEFORE_LAYER)
      const state = reloaded(generatorSaveOf(before, GENERATOR_BEFORE_LAYER))
      expect(state.planet.oreRulesVersion).toBe(LAST_RULES_BEFORE_LAYER)
      expect(stateDigest(state)).toBe(stateDigest(before))
      const bandOne = toCanonical(shippedBandOne(planetIndex))
      expect(bandOne).not.toBe(ONE)
      expect(new Set(topRockHardness(state))).toEqual(new Set([bandOne]))
    },
  )
})
