/**
 * The law work a ground change paid, for the dig-speed STOP of ticket 514 (the Vertical Scaler's
 * bars 6226431087 as the TD's v2 ruling 6226459471 quotes them): Σ(density removed × hardness),
 * read from the ground before and after, never from the ledger, so it does not depend on the report
 * cadence or the path that cut. Hardness is priced as the drill's own law time for the cell
 * (`drillSubStepsOfCells`, the #7 drill rule in sub-steps), so a fully solid cell's law work is its
 * D ticks and the same rig on two paths compares like for like. Test support for the dig-speed
 * lanes; it reads, never writes.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { cellDensitySum } from '../world/cellYield'
import type { PlanetParams } from '../world/planetParams'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../world/sampleGrid'
import type { TilePoint } from '../world/tileGrid'
import { isTileYielded, materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { drillSubStepsOfCells } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'

const SOLID_CELL_SUM = SAMPLES_PER_CELL * SOLID_DENSITY

/** What one change of the ground paid, in ticks of the drill's law time. */
export interface LawWork {
  /** Σ density removed ÷ a full cell × the cell's law time. */
  ticks: number
  /** Cells that yielded in the change. */
  yieldedCells: number
  /** The yielded cells' own whole law times: what the swept cut heats for (`digSubStepsOfCells`). */
  yieldedCellTicks: number
  /** Σ density removed ÷ a full cell, unpriced: the carve's geometry alone. */
  cellsRemoved: number
}

export const NO_LAW_WORK: LawWork = {
  ticks: 0,
  yieldedCells: 0,
  yieldedCellTicks: 0,
  cellsRemoved: 0,
}

/** The law work `after` shows over `before` on `tiles`, priced at `playerId`'s drill in `before`. */
export function lawWorkOfChange(
  before: AuthorityState,
  after: WorldState,
  params: PlanetParams,
  playerId: string,
  tiles: readonly TilePoint[],
): LawWork {
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(before, playerId))
  const subStepsOf = drillSubStepsOfCells(params, drill, shockTicksFor(before, playerId))
  let work = NO_LAW_WORK
  for (const tile of tiles) {
    const lawTicks =
      (subStepsOf(tile, materialCellAt(before.world, params, tile), 0) ?? 0) /
      DRILL_SUBSTEPS_PER_TICK
    work = addLawWork(work, cellLawWork(before.world, after, params, tile, lawTicks))
  }
  return work
}

function cellLawWork(
  before: WorldState,
  after: WorldState,
  params: PlanetParams,
  tile: TilePoint,
  lawTicks: number,
): LawWork {
  const removed = cellDensitySum(before, params, tile) - cellDensitySum(after, params, tile)
  const isYielded = !isTileYielded(before, tile) && isTileYielded(after, tile)
  const cellsRemoved = Math.max(0, removed) / SOLID_CELL_SUM
  return {
    ticks: cellsRemoved * lawTicks,
    yieldedCells: isYielded ? 1 : 0,
    yieldedCellTicks: isYielded ? lawTicks : 0,
    cellsRemoved,
  }
}

export function addLawWork(a: LawWork, b: LawWork): LawWork {
  return {
    ticks: a.ticks + b.ticks,
    yieldedCells: a.yieldedCells + b.yieldedCells,
    yieldedCellTicks: a.yieldedCellTicks + b.yieldedCellTicks,
    cellsRemoved: a.cellsRemoved + b.cellsRemoved,
  }
}

/** The cells within `reach` cells of the planet point `at`, metres. */
export function tilesAround(at: { x: number; y: number }, reach: number): TilePoint[] {
  return tilesInBox(
    { tx: Math.floor(at.x) - reach, ty: Math.floor(at.y) - reach },
    { tx: Math.floor(at.x) + reach, ty: Math.floor(at.y) + reach },
  )
}

/** The cells within `reach` cells of the box round two planet points, metres. */
export function tilesAlong(
  from: { x: number; y: number },
  to: { x: number; y: number },
  reach: number,
): TilePoint[] {
  return tilesInBox(
    {
      tx: Math.floor(Math.min(from.x, to.x)) - reach,
      ty: Math.floor(Math.min(from.y, to.y)) - reach,
    },
    {
      tx: Math.floor(Math.max(from.x, to.x)) + reach,
      ty: Math.floor(Math.max(from.y, to.y)) + reach,
    },
  )
}

function tilesInBox(low: TilePoint, high: TilePoint): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let ty = low.ty; ty <= high.ty; ty++) {
    for (let tx = low.tx; tx <= high.tx; tx++) tiles.push({ tx, ty })
  }
  return tiles
}

/** A read stretch of cutting, summed: its law work, length and what it charged. */
export interface ChargedLawWork {
  law: LawWork
  metres: number
  /** Drill energy quanta: the tank's fall less the reports' drive and thrust charge. */
  drillEnergy: number
  /** The drill ticks the reports heat for. */
  heatTicks: number
}

/** The Vertical Scaler's four bars' columns for one stretch (ticket 514 STOP), to thousandths. */
export interface LawReading {
  lawWorkPerMetre: number
  /** Dig time per cell: law work per yielded cell, ticks. */
  lawTicksPerCell: number
  /** The yielded cells' own law time D, averaged, ticks. */
  ownLawTicksPerCell: number
  cellsPerMetre: number
  energyPerLawTick: number
  heatPerLawTick: number
  energyPerMetre: number
  heatPerMetre: number
  /** One cell's law work as a share of the stretch's: the bars' quantization. */
  oneCellShare: number
}

/**
 * A reading with its law work per metre in the rig's own cell times (`cellTicks`, the rig's law
 * time for one reference cell), so two rigs' law work compares as geometry (ticket 537's floor
 * against the 5 m/s rig, #441's "work per metre over the rig's cell time"): the #7 law time of
 * every cell scales with the drill alike at the same tip, up to the law's whole-sub-step rounding.
 */
export function inCellTimesOf(reading: LawReading, cellTicks: number): LawReading {
  return { ...reading, lawWorkPerMetre: reading.lawWorkPerMetre / cellTicks }
}

export function lawReadingOf({ law, metres, drillEnergy, heatTicks }: ChargedLawWork): LawReading {
  const ownLawTicksPerCell = law.yieldedCellTicks / law.yieldedCells
  return {
    lawWorkPerMetre: thousandthsOf(law.ticks / metres),
    lawTicksPerCell: thousandthsOf(law.ticks / law.yieldedCells),
    ownLawTicksPerCell: thousandthsOf(ownLawTicksPerCell),
    cellsPerMetre: thousandthsOf(law.yieldedCells / metres),
    energyPerLawTick: thousandthsOf(drillEnergy / law.ticks),
    heatPerLawTick: thousandthsOf(heatTicks / law.ticks),
    energyPerMetre: thousandthsOf(drillEnergy / metres),
    heatPerMetre: thousandthsOf(heatTicks / metres),
    oneCellShare: thousandthsOf(ownLawTicksPerCell / law.ticks),
  }
}

export function thousandthsOf(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * The bars, VS 6226431087 and 6226528512 (A5) as the TD's v2 ruling quotes them. Bar 2 (law work
 * per yielded cell against D) is a logged ratio to swept now, not a bar (VS 6228841725 and
 * 6228847292, GD 6228851107): the swept reference itself does not land at D. Bar 4 (energy and
 * heat per unit of law work) reads against the analytic law value, never swept (`lawChargeBars.ts`).
 */
export const DIG_SPEED_BARS = {
  lawWorkFloor: 1,
  lawWorkCeiling: 1.05,
  cellsPerMetreShare: 1 / 20,
}

/**
 * The carve-geometry landing bars of ticket 537 (the TD's Done-when 6236448069 on #537, VS
 * 6228947744 item 2): the floor, against the 5 m/s rig on the same track, law work per metre at
 * least 1.000 (bar 1) and cells per metre within 5% (bar 3); parity, against swept as shipped,
 * law work per metre within 5% (bar 2, below 0.95 fails) and, bar 4, the Step 0 re-read at least
 * 0.99. A band's floor allows one cell of the reference's quantization, as `geometryMissesOf` does.
 */
export const CARVE_GEOMETRY_BARS = {
  floor: { lawWorkFloor: 1, lawWorkCeiling: Infinity, cellsPerMetreShare: 1 / 20 },
  parity: { lawWorkFloor: 0.99, lawWorkCeiling: 1.05, cellsPerMetreShare: 1 / 20 },
}

/** A band on the ratio to a reference: law work per metre between the two, cells within the share. */
export interface GeometryBand {
  lawWorkFloor: number
  lawWorkCeiling: number
  cellsPerMetreShare: number
}

/** Each bar against the reference stretch: true where it holds. */
export interface BarVerdicts {
  lawWorkPerMetre: boolean
  cellsPerMetre: boolean
}

export function barVerdictsOf(reading: LawReading, reference: LawReading): BarVerdicts {
  const misses = geometryMissesOf(reading, reference)
  return {
    lawWorkPerMetre: misses.lawWorkPerMetre === 0,
    cellsPerMetre: misses.cellsPerMetre === 0,
  }
}

/**
 * How far the carve-geometry bars (1b and 3, the carve-geometry ticket #537) miss their band
 * against the reference, as a ratio, 0 inside it: the ratchet until that ticket lands is a report
 * every tick missing by no more than 12-tick reports (GD 6228851107 and 6228937772).
 */
export interface GeometryMisses {
  lawWorkPerMetre: number
  cellsPerMetre: number
}

export function geometryMissesOf(reading: LawReading, reference: LawReading): GeometryMisses {
  return geometryMissesAgainst(reading, reference, DIG_SPEED_BARS)
}

/** How far the reading misses `band` against the reference, as a ratio, 0 inside it. */
export function geometryMissesAgainst(
  reading: LawReading,
  reference: LawReading,
  band: GeometryBand,
): GeometryMisses {
  const lawWork = { low: band.lawWorkFloor - reference.oneCellShare, high: band.lawWorkCeiling }
  const cells = { low: 1 - band.cellsPerMetreShare, high: 1 + band.cellsPerMetreShare }
  return {
    lawWorkPerMetre: missOf(reading.lawWorkPerMetre / reference.lawWorkPerMetre, lawWork),
    cellsPerMetre: missOf(reading.cellsPerMetre / reference.cellsPerMetre, cells),
  }
}

function missOf(ratio: number, band: { low: number; high: number }): number {
  return Math.max(0, band.low - ratio, ratio - band.high)
}
