/**
 * Fixtures for the reported drill's gated bite specs (ticket 519): a fake gate on chosen ore cells
 * and fake drill gear, registered through `withRegistrations` so no real slice is imported, and a
 * vehicle held over a cell reporting at a chosen interval. Only specs use them.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { DrillGearAsk } from '../economy/drillGearCaps'
import type { DriveSigns } from '../vehicle/driveSigns'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import type { DomainEvent } from './domainEvent'
import { poseAbove, type ScriptedSession } from './scriptedSession'

/** A gate refusing the drill at `cells` only, the way #142's dynamite shell does. */
export function refusingGateAt(cells: readonly TilePoint[]): SliceDefinition {
  const isGated = (tile: TilePoint) => cells.some(({ tx, ty }) => tx === tile.tx && ty === tile.ty)
  return {
    id: 'bite-gate',
    register: (r) =>
      r.gateCheck({
        id: 'bite-gate.cells',
        check: ({ tile }) =>
          isGated(tile)
            ? { outcome: 'refused', gateKind: 'probe', required: 'probe-rig', have: 'none' }
            : null,
      }),
  }
}

export function drillGearOf(ask: DrillGearAsk): SliceDefinition {
  return {
    id: 'bite-gear',
    register: (r) => r.drillGear({ id: 'bite-gear.gear', gearOf: () => ask }),
  }
}

/** How a vehicle holds the drill over a cell: its facing, its push and the report interval. */
export interface HeldDrill {
  interval: number
  facing?: Facing
  drive?: DriveSigns
  playerId?: string
}

/**
 * `reports` drilling reports over `tile` every `interval` ticks after `fromTick`, the drill on the
 * whole interval; returns each report's events and the tick of the last.
 */
export function holdDrillOver(
  session: ScriptedSession,
  tile: TilePoint,
  fromTick: number,
  reports: number,
  { interval, facing = FACING.down, drive = NO_DRIVE, playerId = 'p1' }: HeldDrill,
): { events: DomainEvent[][]; lastTick: number } {
  const events: DomainEvent[][] = []
  let tick = fromTick
  for (let report = 0; report < reports; report++) {
    tick += interval
    const pose = poseAbove(tile, facing, { drillTicks: interval, drive })
    events.push(session.submit(tick, pose, playerId))
  }
  return { events, lastTick: tick }
}

export function drillGatedOf(events: readonly DomainEvent[]) {
  return events.filter((event) => event.type === 'DrillGated')
}

/** The `DrillGated` lines of every report, at `tile` only. */
export function drillGatedAt(reports: readonly DomainEvent[][], tile: TilePoint) {
  return drillGatedOf(reports.flat()).filter(
    (event) => 'tx' in event && event.tx === tile.tx && event.ty === tile.ty,
  )
}
