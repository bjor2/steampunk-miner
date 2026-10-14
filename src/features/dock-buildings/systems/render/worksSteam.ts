/**
 * The steam the Works' stacks vent (ticket 395): every vent hangs off `workshop.stack`, the top of
 * the tallest stack in the art, so the plumes follow the stacks wherever the art puts them. A
 * steady vent blows all the time; a puffing one blows for its share of each cycle. Positions are
 * metres in the building's frame (its origin is the zone centre on the pad top).
 */
import type { Spray } from '../../../../systems/render/particles'
import type { SteamVent } from './worksIdle'

/** A vent's spray, for the particle pool: from its stack mouth, the way it blows. */
export function ventSprayOf(vent: SteamVent, stackTopM: readonly [number, number]): Spray {
  const length = Math.hypot(vent.dir[0], vent.dir[1])
  return {
    x: stackTopM[0] + vent.offsetM[0],
    y: stackTopM[1] + vent.offsetM[1],
    dirX: vent.dir[0] / length,
    dirY: vent.dir[1] / length,
    speed: vent.speed,
    spreadRadians: vent.spreadRadians,
    lifeSeconds: vent.lifeSeconds,
  }
}

/** Puffs per second the vent owes at `seconds`: its rate while it blows, else none. */
export function ventRateAt(vent: SteamVent, seconds: number): number {
  return isVentBlowing(vent, seconds) ? vent.perSecond : 0
}

function isVentBlowing(vent: SteamVent, seconds: number): boolean {
  if (vent.puffSeconds <= 0) return true
  return (seconds % vent.puffSeconds) / vent.puffSeconds < vent.puffShare
}
