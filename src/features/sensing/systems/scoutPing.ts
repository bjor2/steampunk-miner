/**
 * The Scout branch's ping (GD lock on #255, ticket 269): big and vague. Each use pings round where
 * it was pressed at the Scout's radius, its Mark magnitude, and marks one cell per block of
 * `blockTiles` square: lava if the block holds any, else ore, else open cave. It never shows which
 * cell of the block, an ore's tier or a gate badge. Its marks stay until the dock, so the map
 * fills in over a trip. A pure read of the state on each client, like every ping (#203); a
 * magnetic field cuts its radius as it cuts the others (spec #258).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { sensingReachAt } from '../../../systems/authority/magnetic/sensingReach'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { echoMarksOf, type EchoMark, type EchoMarkKind } from './echoPing'
import type { RevealPing } from './revealPing'
import {
  forkMagnitudeAt,
  SCOUT_PINGER,
  SENSING_FORK_BALANCE,
  type ScoutBalance,
} from './sensingFork'
import type { SensingUse } from './sensingUses'

/** Lava outranks ore, ore outranks open cave: the block shows the gravest thing in it. */
const KIND_RANK: Readonly<Record<EchoMarkKind, number>> = { lava: 3, ore: 2, gate: 2, cave: 1 }

/** The Scout use's ping round where it was pressed: vague marks, kept until the dock. */
export function scoutPingOf(
  use: SensingUse,
  state: AuthorityState,
  balance: ScoutBalance = SENSING_FORK_BALANCE.scout,
): RevealPing {
  const radius = sensingReachAt(state, use.origin, forkMagnitudeAt(SCOUT_PINGER, use.mark))
  return {
    centre: use.origin,
    marks: vagueMarksOf(echoMarksOf(state, use.origin, radius), balance.blockTiles),
    bornTick: use.tick,
    untilTick: null,
  }
}

/** One mark per block, at the block's middle cell, of the gravest kind any cell in it shows. */
export function vagueMarksOf(marks: readonly EchoMark[], blockTiles: number): EchoMark[] {
  const byBlock = new Map<string, EchoMark>()
  for (const mark of marks) {
    const key = blockKeyOf(mark.tile, blockTiles)
    if (isGraverThan(mark, byBlock.get(key))) byBlock.set(key, vagueMarkOf(mark, blockTiles))
  }
  return [...byBlock.values()]
}

function isGraverThan(mark: EchoMark, kept: EchoMark | undefined): boolean {
  return kept === undefined || KIND_RANK[mark.kind] > KIND_RANK[kept.kind]
}

function vagueMarkOf(mark: EchoMark, blockTiles: number): EchoMark {
  return { tile: blockMiddleOf(mark.tile, blockTiles), kind: vagueKindOf(mark), gate: null }
}

/** A gated ore cell shows only as ore: the Scout never reads a badge. */
function vagueKindOf(mark: EchoMark): EchoMarkKind {
  return mark.kind === 'gate' ? 'ore' : mark.kind
}

function blockKeyOf(tile: TilePoint, blockTiles: number): string {
  return `${Math.floor(tile.tx / blockTiles)},${Math.floor(tile.ty / blockTiles)}`
}

function blockMiddleOf(tile: TilePoint, blockTiles: number): TilePoint {
  const half = Math.floor(blockTiles / 2)
  return {
    tx: Math.floor(tile.tx / blockTiles) * blockTiles + half,
    ty: Math.floor(tile.ty / blockTiles) * blockTiles + half,
  }
}
