/**
 * The bore's lining (ticket 377, the TD lock on #318; Content's cementing round on #310): a shot
 * whose shape names a casing_cement grade lines the walls of the cells it opened, once its line
 * ends, at the miner's current casing grade in that grade's lining type. Cells it only passed
 * through, already open, are never lined. Laid free: the round's price is its charge and the
 * shape's extra energy per cell. Logged as `CasingPlaced`, as every lining is.
 */
import { liningTypeIndexOf } from '../../vehicle/liningType'
import { lineCellWalls } from '../../world/casingLining'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import type { WorldState } from '../../world/worldState'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { groundChangedEventsOf } from '../groundChangedEvents'
import type { PendingBore } from './boreState'

/** The ended bore's opened cells lined in its shot's lining type; unchanged with none. */
export function lineEndedBore(
  state: AuthorityState,
  params: PlanetParams,
  bore: PendingBore,
): RuleEffect {
  const liningType = bore.shot.liningType
  if (liningType === undefined || bore.bored.length === 0) return unchanged(state)
  const grade = vehicleOf(state, bore.playerId).casingGrade
  return lineOpenedCells(state, params, bore.bored, { grade, liningType })
}

/** What a bore lines in: the casing grade and the lining type. */
export interface BoreLining {
  grade: number
  liningType: string
}

/** Lines the walls of each opened cell in turn, then logs the line's lining as one placement. */
export function lineOpenedCells(
  state: AuthorityState,
  params: PlanetParams,
  cells: readonly TilePoint[],
  lining: BoreLining,
): RuleEffect {
  const laid = layWallsOf(state.world, params, cells, lining)
  return {
    state: { ...state, world: laid.world },
    events: [...laid.events, casingPlacedOf(laid, lining.grade)],
  }
}

/** The ground after lining each cell's walls, its changes, and the samples lined and relined. */
interface LaidWalls {
  world: WorldState
  events: DomainEventBody[]
  samples: number
  relined: number
}

function layWallsOf(
  world: WorldState,
  params: PlanetParams,
  cells: readonly TilePoint[],
  lining: BoreLining,
): LaidWalls {
  const typeIndex = liningTypeIndexOf(lining.liningType)
  return cells.reduce<LaidWalls>(
    (laid, tile) => {
      const lined = lineCellWalls(laid.world, params, tile, lining.grade, typeIndex)
      return {
        world: lined.world,
        events: [...laid.events, ...groundChangedEventsOf(lined)],
        samples: laid.samples + lined.placed,
        relined: laid.relined + lined.relined,
      }
    },
    { world, events: [], samples: 0, relined: 0 },
  )
}

function casingPlacedOf(laid: LaidWalls, grade: number): DomainEventBody {
  return { type: 'CasingPlaced', samples: laid.samples, relined: laid.relined, grade }
}
