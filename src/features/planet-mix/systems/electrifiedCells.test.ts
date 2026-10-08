import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { ticksPerCell } from '../../../systems/authority/groundDrill'
import { onCurveSessionOn } from '../../../systems/authority/magnetic/magneticFixtures'
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  continueScriptedSession,
  drill,
  poseAbove,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { shockTicks } from '../../../systems/economy/magneticHazard'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { onCurveSteps, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { gateVerdictOf } from '../../../systems/registries/gateChecks'
import { isElectrifiedBits } from '../../../systems/render/cellGateBits'
import { buildChunkTileBatch } from '../../../systems/render/chunkTileBatch'
import { chunkDensityHaloOf } from '../../../systems/render/densityHalo'
import { ELECTRIFIED_MARKER, GATE_PATTERNS } from '../../../systems/render/gatePatterns'
import { oreTypeOf } from '../../../systems/registries/oreTypes'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import {
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
} from '../../../systems/world/worldState'
import { GATE_ROWS, motionSignatureOf, type LockMarkerKind } from '../../mining-gates'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import {
  CHUNK_SIZE,
  chunkOfTile,
  chunkRangeOfDisc,
  firstTileOfChunk,
  type TilePoint,
} from '../../../systems/world/tileGrid'
import {
  CELL_KIND,
  CORE_CELL,
  familyOfCell,
  GROUND_CELL,
  kindOfCell,
  LAVA_CELL,
  oreCell,
  RESOURCE_FAMILY,
} from '../../../systems/world/worldCell'
import { isElectrifiedCell } from './electrifiedCells'
import { PLANET_CLASS_ROWS } from './planetClassRows'

const SEED = PACING_WORLD_SEEDS['bot-slice'][0]
const MAGNETIC_PLANET = 25
const RELIC_PLANET = 30
/** #142's lock markers (mining-gates `lockMarkerOf`), the extractors' motions apart. */
const LOCK_MARKER_KINDS: readonly LockMarkerKind[] = [
  'hard_rim',
  'hard_rim_open',
  'cracked_shell',
  'motion',
]
/** Tips from below the ordinary quarter floor (tier - 7) to past the drill signature's (tier + 4). */
const TIPS_BELOW_TIER = 8
const TIPS_ABOVE_TIER = 4

interface FerrousCell {
  tile: TilePoint
  cell: number
  band: number
  tier: number
  isElectrified: boolean
}

function sessionOn(planetIndex: number): ScriptedSession {
  return continueScriptedSession(
    createAuthorityState({ planetIndex, planetSeed: SEED, playerIds: ['p1'] }),
  )
}

function setTipMajor(session: ScriptedSession, major: number): void {
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_tip', level: stepOfMajor(major) },
  })
}

/** Every ferrous cell of the column of chunks through the planet's centre. */
function ferrousCellsOf(params: PlanetParams): FerrousCell[] {
  const { max } = chunkRangeOfDisc(params.radiusTiles)
  return Array.from({ length: max + 1 }, (_, cy) => cy).flatMap((cy) =>
    ferrousCellsOfChunk(params, cy),
  )
}

function ferrousCellsOfChunk(params: PlanetParams, cy: number): FerrousCell[] {
  const cells = generateChunkCells(params, 0, cy)
  return Array.from(cells, (cell, index) => ({
    tile: { tx: index % CHUNK_SIZE, ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE) },
    cell,
  }))
    .filter(({ cell }) => isFerrous(cell))
    .map(({ tile, cell }) => ({
      tile,
      cell,
      band: bandOfTile(params, tile.tx, tile.ty),
      tier: resourceTierOf(params, cell),
      isElectrified: isElectrifiedCell(params, tile, cell),
    }))
}

function isFerrous(cell: number): boolean {
  return kindOfCell(cell) === CELL_KIND.ore && familyOfCell(cell) === RESOURCE_FAMILY.metal
}

/** A gate-table entry is a band's tier and family (cellGates.ts); every cell here is metal. */
function entryOf(ferrous: FerrousCell): string {
  return `${ferrous.band}:${ferrous.tier}`
}

function byEntry(ferrous: FerrousCell): [string, FerrousCell] {
  return [entryOf(ferrous), ferrous]
}

/** The loaded gate checks' outcome for the drill on `ferrous`; `none` when no check has one. */
function outcomeOf(session: ScriptedSession, ferrous: FerrousCell): string {
  return drillVerdictOn(session, ferrous)?.outcome ?? 'none'
}

/** The loaded gate checks' answer to the drill on `ferrous`. */
function drillVerdictOn(session: ScriptedSession, ferrous: FerrousCell) {
  return gateVerdictOf({
    state: session.state(),
    playerId: 'p1',
    tile: ferrous.tile,
    cell: ferrous.cell,
    ore: oreTypeOf({ tier: ferrous.tier, cellFamily: familyOfCell(ferrous.cell) }),
    blast: null,
  })
}

describe('electrified cells', () => {
  it('canMine never refuses an electrified cell', () => {
    const session = sessionOn(MAGNETIC_PLANET)
    const ferrous = ferrousCellsOf(planetParamsOf(session.state().planet) as PlanetParams)
    const electrified = ferrous.filter((one) => one.isElectrified)
    const plainByEntry = new Map(ferrous.filter((one) => !one.isElectrified).map(byEntry))
    expect(electrified.filter((one) => !plainByEntry.has(entryOf(one)))).toEqual([])
    for (const tier of new Set(electrified.map((one) => one.tier))) {
      const ofTier = electrified.filter((one) => one.tier === tier)
      for (let major = tier - TIPS_BELOW_TIER; major <= tier + TIPS_ABOVE_TIER; major++) {
        setTipMajor(session, major)
        const plainOutcomes = ofTier.map((one) =>
          outcomeOf(session, plainByEntry.get(entryOf(one))!),
        )
        expect(ofTier.map((one) => outcomeOf(session, one))).toEqual(plainOutcomes)
      }
      expect(new Set(ofTier.map((one) => outcomeOf(session, one)))).toEqual(new Set(['none']))
    }
  })

  it('a shock costs ticks, never money', () => {
    const recorded = onCurveSessionOn(MAGNETIC_PLANET)
    const params = planetParamsOf(recorded.session.state().planet) as PlanetParams
    const { tile, cell } = ferrousCellsOf(params).find((one) => one.isElectrified) as FerrousCell
    const ticks = ticksPerCell(vehicleStatsAt(onCurveSteps(MAGNETIC_PLANET)), params, tile, cell)
    const cutTicks = (ticks as number) - shockTicks()
    const walletBefore = recorded.session.state().players.p1.wallet
    recorded.submit(1, poseAbove(tile, FACING.down))
    recorded.submit(1 + cutTicks, drill(tile, cutTicks))
    const types = () => recorded.session.events().map((event) => event.type)
    expect(types()).not.toContain('TileDestroyed')
    recorded.submit(1 + cutTicks + shockTicks(), drill(tile, shockTicks()))
    expect(types()).toContain('TileDestroyed')
    expect(
      recorded.session.events().filter((event) => event.type === 'ElectrifiedCellShocked'),
    ).toEqual([expect.objectContaining({ ticks: shockTicks(), withBit: false })])
    expect(shockTicks()).toBeGreaterThan(0)
    expect(recorded.session.state().players.p1.wallet).toEqual(walletBefore)
    expect(types()).not.toContain('MoneyChanged')
  })

  it('electrifies only ferrous cells, near the share the economy file names', () => {
    const params = planetParamsOf(sessionOn(MAGNETIC_PLANET).state().planet) as PlanetParams
    const ferrous = ferrousCellsOf(params)
    const shareBp = (ferrous.filter((one) => one.isElectrified).length * 10000) / ferrous.length
    const named = PLANET_CLASS_ROWS.magnetic.electrifiedShareBp
    expect(Math.abs(shareBp - named)).toBeLessThan(named / 4)
    const others = [GROUND_CELL, CORE_CELL, LAVA_CELL, oreCell(RESOURCE_FAMILY.crystal, 0)]
    const tiles = ferrous.map((one) => one.tile)
    const electrifiedOthers = others.filter((cell) =>
      tiles.some((tile) => isElectrifiedCell(params, tile, cell)),
    )
    expect(electrifiedOthers).toEqual([])
  })

  it('the marker id differs from every #142 marker', () => {
    const motions = GATE_ROWS.rigs.map((rig) => motionSignatureOf(rig.id))
    const markers = new Set<string | null>([...LOCK_MARKER_KINDS, ...motions, ...GATE_PATTERNS])
    expect(motions).not.toContain(null)
    expect(markers.has(ELECTRIFIED_MARKER)).toBe(false)
  })

  it("draws the arcs in the ground on exactly a magnetic planet's electrified cells", () => {
    const params = planetParamsOf(sessionOn(MAGNETIC_PLANET).state().planet) as PlanetParams
    const chunk = chunkHolding(ferrousCellsOf(params).find((one) => one.isElectrified)!)
    expect(arcsDrawnIn(params, chunk)).toEqual(electrifiedTilesIn(params, chunk))
    expect(arcsDrawnIn(params, chunk).length).toBeGreaterThan(0)
  })

  it('draws no arcs on the relic planet', () => {
    const params = planetParamsOf(sessionOn(RELIC_PLANET).state().planet) as PlanetParams
    const chunk = chunkHolding(ferrousCellsOf(params)[0])
    expect(arcsDrawnIn(params, chunk)).toEqual([])
  })
})

interface ChunkAt {
  cx: number
  cy: number
}

function chunkHolding({ tile }: FerrousCell): ChunkAt {
  return { cx: chunkOfTile(tile.tx), cy: chunkOfTile(tile.ty) }
}

/** The tiles the chunk mesh flags electrified, as sorted `tx,ty` keys. */
function arcsDrawnIn(params: PlanetParams, { cx, cy }: ChunkAt): string[] {
  const cells = materialCellsOfChunk(EMPTY_WORLD, params, cx, cy)
  const density = (x: number, y: number) => currentDensityOfChunk(EMPTY_WORLD, params, x, y)
  const batch = buildChunkTileBatch(params, cx, cy, cells, chunkDensityHaloOf(density, cx, cy))
  const drawn: string[] = []
  for (let at = 0; at < batch.count; at++) {
    if (!isElectrifiedBits(batch.gates[at])) continue
    const tx = firstTileOfChunk(cx) + batch.tiles[at * 2]
    drawn.push(`${tx},${firstTileOfChunk(cy) + batch.tiles[at * 2 + 1]}`)
  }
  return drawn.sort()
}

function electrifiedTilesIn(params: PlanetParams, { cx, cy }: ChunkAt): string[] {
  const cells = materialCellsOfChunk(EMPTY_WORLD, params, cx, cy)
  return Array.from(cells, (cell, index) => ({
    tx: firstTileOfChunk(cx) + (index % CHUNK_SIZE),
    ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
    cell,
  }))
    .filter(({ tx, ty, cell }) => isElectrifiedCell(params, { tx, ty }, cell))
    .map(({ tx, ty }) => `${tx},${ty}`)
    .sort()
}
