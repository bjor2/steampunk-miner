/**
 * The Scout branch's ping (GD lock on #255, ticket 269): big, vague and on its own clock. Out of
 * the dock, each time the authority clock passes a multiple of `pingEveryTicks` the rig pings
 * round itself at the Scout's radius, and the ping marks one cell per block of `blockTiles`
 * square: lava if the block holds any, else ore, else open cave. It never shows which cell of the
 * block, an ore's tier or a gate badge. Its marks stay until the dock, so the map fills in over a
 * trip. A pure read of the state on each client, like every ping (#203); a magnetic field cuts its
 * radius as it cuts the others (spec #258).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { sensingReachAt } from '../../../systems/authority/magnetic/sensingReach'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { echoMarksOf, type EchoMark, type EchoMarkKind } from './echoPing'
import type { RevealPing } from './revealPing'
import { scoutRadiusOf, SENSING_FORK_BALANCE, type ScoutBalance } from './sensingFork'

/** Lava outranks ore, ore outranks open cave: the block shows the gravest thing in it. */
const KIND_RANK: Readonly<Record<EchoMarkKind, number>> = { lava: 3, ore: 2, gate: 2, cave: 1 }

/**
 * Which ping the clock is on at `tick`: the Scout pings each time this number grows, so a frame
 * that skips ticks still pings once, and a trip of `n` intervals pings `n` times.
 */
export function scoutSlotOf(tick: number, balance: ScoutBalance = SENSING_FORK_BALANCE.scout) {
  return Math.floor(tick / balance.pingEveryTicks)
}

/** The player's Scout ping at `tick`; null without the Scout active, a pose, or out of the dock. */
export function scoutPingOf(
  state: AuthorityState,
  playerId: string,
  tick: number,
  balance: ScoutBalance = SENSING_FORK_BALANCE.scout,
): RevealPing | null {
  const radius = scoutRadiusOf(state, playerId)
  const vehicle = vehicleOf(state, playerId)
  if (radius === null || vehicle.pose === null || vehicle.mode === 'docked') return null
  const centre = tileOfPose(vehicle.pose)
  const marks = echoMarksOf(state, centre, sensingReachAt(state, centre, radius))
  return {
    centre,
    marks: vagueMarksOf(marks, balance.blockTiles),
    bornTick: tick,
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
