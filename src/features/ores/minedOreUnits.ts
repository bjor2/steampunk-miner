/**
 * The ore units a run collected on one planet, read back off its log for the report rows (#140
 * acceptance 2-5): each `resource_collected` line is paired with the `tile_destroyed` ore line the
 * same command wrote just before it (`groundDrill`, `blastOre`), which names the tile, so the band
 * comes from the planet's geometry and the lead from the tier. The drill ticks are the
 * `drill_damage_dealt` lines on that tile before it broke; a blasted tile has none.
 */
import type { RunEvent } from '../../logging/runEvent'
import { fromCanonical, type Money } from '../../systems/money'
import { bandOfTile } from '../../systems/world/planetGeometry'
import { planetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
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

type Named<N extends RunEvent['event']> = RunEvent<N>

interface Walk {
  params: PlanetParams
  ticksAtTile: Map<string, number>
  brokenByPlayer: Map<string, { tile: TilePoint; drillTicks: number }>
  units: MinedOreUnit[]
}

/** Every unit collected on `planet`, in log order. */
export function minedOreUnitsOf(
  events: readonly RunEvent[],
  worldSeed: number,
  planet: number,
): MinedOreUnit[] {
  const walk: Walk = {
    params: planetParamsFor(worldSeed, planet),
    ticksAtTile: new Map(),
    brokenByPlayer: new Map(),
    units: [],
  }
  for (const event of events) if (event.planet === planet) readLine(walk, event)
  return walk.units
}

function readLine(walk: Walk, event: RunEvent): void {
  if (isNamed(event, 'drill_damage_dealt')) addDrillTicks(walk, event)
  else if (isNamed(event, 'tile_destroyed')) noteBrokenTile(walk, event)
  else if (isNamed(event, 'resource_collected')) collectUnit(walk, event)
}

function isNamed<N extends RunEvent['event']>(event: RunEvent, name: N): event is Named<N> {
  return event.event === name
}

function addDrillTicks(walk: Walk, { data }: Named<'drill_damage_dealt'>): void {
  const key = tileKey(data)
  walk.ticksAtTile.set(key, (walk.ticksAtTile.get(key) ?? 0) + data.ticks)
}

function noteBrokenTile(walk: Walk, { playerId, data }: Named<'tile_destroyed'>): void {
  const key = tileKey(data)
  const drillTicks = walk.ticksAtTile.get(key) ?? 0
  walk.ticksAtTile.delete(key)
  if (data.kind === 'ore') {
    walk.brokenByPlayer.set(playerId, { tile: { tx: data.tx, ty: data.ty }, drillTicks })
  } else {
    walk.brokenByPlayer.delete(playerId)
  }
}

function collectUnit(walk: Walk, { playerId, tick, data }: Named<'resource_collected'>): void {
  const broken = walk.brokenByPlayer.get(playerId)
  if (broken === undefined) return
  walk.brokenByPlayer.delete(playerId)
  const band = bandOfTile(walk.params, broken.tile.tx, broken.tile.ty)
  walk.units.push({
    tier: data.resourceTier,
    band,
    lead: leadOfTier(walk.params.planetIndex, band, data.resourceTier),
    value: fromCanonical(data.value),
    depthTiles: data.oreDepthTiles,
    drillTicks: broken.drillTicks,
    tick,
  })
}

function tileKey({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
