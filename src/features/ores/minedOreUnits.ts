/**
 * The ore units a run collected on one planet, read back off its domain events for the report rows
 * (#140 acceptance 2-5; ticket 420 moved them off the run log, which folds a drill span's units
 * into one line): each `CargoAdded` is paired with the ore `TileDestroyed` the same command
 * answered just before it (`groundDrill`, `blastOre`), which names the tile, so the band comes from
 * the planet's geometry and the lead from the tier. The drill ticks are the `DrillDamageDealt`
 * events on that tile before it broke; a blasted tile has none, and its unit pairs with no tile,
 * as its run-log line never did (K6 #189).
 */
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { fromCanonical, type Money } from '../../systems/money'
import { bandOfTile } from '../../systems/world/planetGeometry'
import { freshPlanetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import type { TilePoint } from '../../systems/world/tileGrid'
import { leadOfTier } from './systems/leadPayoff'

export interface MinedOreUnit {
  tier: number
  band: number
  lead: number
  value: Money
  /** Whole tiles below the surface of the cell's column. */
  depthTiles: number
  /** 0 for a tile the drill never touched (a blast). */
  drillTicks: number
  /** The tick it was collected on. */
  tick: number
}

type Named<K extends DomainEvent['type']> = Extract<DomainEvent, { type: K }>

interface Walk {
  params: PlanetParams
  ticksAtTile: Map<string, number>
  broken: { tile: TilePoint; drillTicks: number } | null
  units: MinedOreUnit[]
}

/** Every unit collected in `planetEvents`, the domain events logged on `planet`, in order. */
export function minedOreUnitsOf(
  planetEvents: readonly DomainEvent[],
  worldSeed: number,
  planet: number,
): MinedOreUnit[] {
  const walk: Walk = {
    params: freshPlanetParamsFor(worldSeed, planet),
    ticksAtTile: new Map(),
    broken: null,
    units: [],
  }
  for (const event of planetEvents) readEvent(walk, event)
  return walk.units
}

function readEvent(walk: Walk, event: DomainEvent): void {
  if (event.type === 'DrillDamageDealt') addDrillTicks(walk, event)
  else if (event.type === 'TileDestroyed' && event.cause !== 'blast') noteBrokenTile(walk, event)
  else if (event.type === 'CargoAdded') collectUnit(walk, event)
}

function addDrillTicks(walk: Walk, event: Named<'DrillDamageDealt'>): void {
  const key = tileKey(event)
  walk.ticksAtTile.set(key, (walk.ticksAtTile.get(key) ?? 0) + event.ticks)
}

function noteBrokenTile(walk: Walk, event: Named<'TileDestroyed'>): void {
  const key = tileKey(event)
  const drillTicks = walk.ticksAtTile.get(key) ?? 0
  walk.ticksAtTile.delete(key)
  walk.broken = event.kind === 'ore' ? { tile: { tx: event.tx, ty: event.ty }, drillTicks } : null
}

function collectUnit(walk: Walk, event: Named<'CargoAdded'>): void {
  const { broken } = walk
  if (broken === null) return
  walk.broken = null
  const band = bandOfTile(walk.params, broken.tile.tx, broken.tile.ty)
  walk.units.push({
    tier: event.resourceTier,
    band,
    lead: leadOfTier(walk.params.planetIndex, band, event.resourceTier),
    value: fromCanonical(event.value),
    depthTiles: event.depthTiles,
    drillTicks: broken.drillTicks,
    tick: event.tick,
  })
}

function tileKey({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
