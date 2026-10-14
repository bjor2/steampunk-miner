/**
 * The turret shape the `auto_guns` modules ask for (ticket 388 through ticket 382's `autoGuns`
 * provider, the TD lock on #319 as the GD ruled it): every live module (`turretModules.ts`) asks
 * for #107's guns with its own fields changed, at the Mark it plays at, and the kernel's
 * `foldTurretShapes` takes the strongest of each. No live module, no shape: the guns shoot as #107
 * built them.
 *
 * - Fire director: the director's order (rear attackers, latched, nearest), ranked again every
 *   `directorRetargetTicks`.
 * - Sentry cam: the drill's forward cone opens once the rig has been still `camOpenDelayTicks`.
 * - Extended barrels: its range-then-energy ladder (`boreLadders.ts`), the energy rounded up to a
 *   whole quantum so a shot never costs less than the ladder says.
 * - Concussion shells: `knockCells` back, once per enemy every `knockCooldownTicks`.
 * - Grapeshot breech: the shot's damage split over up to `grapeTargets` inside `grapeConeDeg`.
 * - Overpressure burst: its burst cycle, latched by the kernel when `turret.burst` switches on.
 * - Ricochet shot: one bounce of at most `bounceLegCells`, only while the rig stands inside a
 *   hollow pocket (Content's "inside a hollow pocket", K-hollow's `isHollowPocketCell`, one cell
 *   read per due shot).
 * - Flushing shell asks nothing of the shot: it drives burrowers out (`flushingShell.ts`).
 *
 * The grapeshot's and the ricochet's cooldown stats step on their Mark ladders but no seam reaches
 * them: the locked shape carries no cooldown for either, and a turret shot raises no event a
 * reaction could time one by.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../../constants/balance'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { BASE_TURRET_SHAPE, foldTurretShapes } from '../../../systems/authority/combat/turretShape'
import { isHollowPocketCell } from '../../../systems/authority/hollowPocket'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { AutoGunsProvider, TurretShape } from '../../../systems/registries/autoGuns'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { moduleStatsAt } from './armouryModules'
import {
  CONCUSSION_SHELLS_ITEM_ID,
  EXTENDED_BARRELS_ITEM_ID,
  FIRE_DIRECTOR_ITEM_ID,
  GRAPESHOT_BREECH_ITEM_ID,
  OVERPRESSURE_BURST_ITEM_ID,
  RICOCHET_SHOT_ITEM_ID,
  SENTRY_CAM_ITEM_ID,
} from './autoGunsLane'
import { extendedBarrelsAt, MILLI_PER_UNIT } from './boreLadders'
import {
  isOnTurretMount,
  liveTurretModulesOf,
  type LiveTurretModule,
  type TurretAttachRead,
} from './turretModules'

type ShapeAsk = Partial<TurretShape>

const SHAPE_ASKS: Readonly<Record<string, (mark: number) => ShapeAsk>> = {
  [FIRE_DIRECTOR_ITEM_ID]: (mark) => ({
    targetOrder: 'director',
    retargetTicks: statAt(FIRE_DIRECTOR_ITEM_ID, mark, 'directorRetargetTicks'),
  }),
  [SENTRY_CAM_ITEM_ID]: (mark) => ({
    forwardConeAfterTicks: statAt(SENTRY_CAM_ITEM_ID, mark, 'camOpenDelayTicks'),
  }),
  [EXTENDED_BARRELS_ITEM_ID]: (mark) => {
    const step = extendedBarrelsAt(mark)
    return {
      rangeTiles: step.rangeTiles,
      energyPerShotQuanta: quantaOfMilli(step.energyPerShotMilli),
    }
  },
  [CONCUSSION_SHELLS_ITEM_ID]: (mark) => ({
    knock: {
      cells: statAt(CONCUSSION_SHELLS_ITEM_ID, mark, 'knockCells'),
      cooldownTicks: statAt(CONCUSSION_SHELLS_ITEM_ID, mark, 'knockCooldownTicks'),
    },
  }),
  [GRAPESHOT_BREECH_ITEM_ID]: (mark) => ({
    grape: {
      targets: statAt(GRAPESHOT_BREECH_ITEM_ID, mark, 'grapeTargets'),
      coneDeg: statAt(GRAPESHOT_BREECH_ITEM_ID, mark, 'grapeConeDeg'),
    },
  }),
  [OVERPRESSURE_BURST_ITEM_ID]: (mark) => ({
    burst: {
      burstTicks: statAt(OVERPRESSURE_BURST_ITEM_ID, mark, 'burstTicks'),
      ventTicks: statAt(OVERPRESSURE_BURST_ITEM_ID, mark, 'ventTicks'),
      intervalNumerator: statAt(OVERPRESSURE_BURST_ITEM_ID, mark, 'burstIntervalNumerator'),
      intervalDenominator: statAt(OVERPRESSURE_BURST_ITEM_ID, mark, 'burstIntervalDenominator'),
    },
  }),
  [RICOCHET_SHOT_ITEM_ID]: (mark) => ({
    bounceLegCells: statAt(RICOCHET_SHOT_ITEM_ID, mark, 'bounceLegCells'),
  }),
}

/** The shipped provider: the mount table says which modules hang on the turret. */
export const AUTO_GUNS_PROVIDER: AutoGunsProvider = autoGunsProviderOf(isOnTurretMount)

/** A provider reading attachment through `isAttached` (a spec's missing mount, for one). */
export function autoGunsProviderOf(isAttached: TurretAttachRead): AutoGunsProvider {
  return {
    id: 'ground-gun.turret-modules',
    turretShapeOf: (state, playerId) => playerTurretShapeOf(state, playerId, isAttached),
  }
}

/** The shape the player's live modules fold to; null with none asking. */
export function playerTurretShapeOf(
  state: AuthorityState,
  playerId: string,
  isAttached: TurretAttachRead = isOnTurretMount,
): TurretShape | null {
  const asking = liveTurretModulesOf(state, playerId, isAttached).filter((module) =>
    isAskingNow(state, playerId, module),
  )
  return foldTurretShapes(asking.map(moduleShapeOf))
}

/** #107's guns with the module's fields at its Mark. */
export function moduleShapeOf({ itemId, mark }: LiveTurretModule): TurretShape {
  return { ...BASE_TURRET_SHAPE, ...shapeAskOf(itemId, mark) }
}

/** Every module with a shape ask asks; the ricochet only from inside a hollow pocket. */
function isAskingNow(state: AuthorityState, playerId: string, { itemId }: LiveTurretModule) {
  if (!(itemId in SHAPE_ASKS)) return false
  return itemId !== RICOCHET_SHOT_ITEM_ID || isRigInHollowPocket(state, playerId)
}

function isRigInHollowPocket(state: AuthorityState, playerId: string): boolean {
  const { pose } = vehicleOf(state, playerId)
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return false
  return isHollowPocketCell(state.world, params, tileOfPose(pose))
}

function shapeAskOf(itemId: string, mark: number): ShapeAsk {
  return SHAPE_ASKS[itemId]?.(mark) ?? {}
}

/** Thousandths of a unit as energy quanta, rounded up so the ladder's price is never undercut. */
function quantaOfMilli(milli: number): number {
  return Math.ceil((milli * ENERGY_QUANTA_PER_UNIT) / MILLI_PER_UNIT)
}

function statAt(itemId: string, mark: number, stat: string): number {
  const value = moduleStatsAt(itemId, mark).stats[stat]
  if (value === undefined) throw new RangeError(`no module stat ${stat} on ${itemId}`)
  return value
}
