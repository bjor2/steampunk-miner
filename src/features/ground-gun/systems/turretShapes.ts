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
 * - Spotter guns (the fire director x threat periscope combo, ticket 320; GD ruling 6180873822 on
 *   #320): with the director live on the turret and the combo and the periscope owned, a due shot
 *   waits up to `pretrainTicks` for a burrower about to surface, and ranks it first among the
 *   targets already in line of fire. Timing and ranking only: the kernel's pre-train keeps the
 *   schedule, so shots and damage per shot stay the same.
 *
 * The grapeshot's and the ricochet's cooldown stats step on their Mark ladders but no seam reaches
 * them: the locked shape carries no cooldown for either, and a turret shot raises no event a
 * reaction could time one by.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../../constants/balance'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
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
import { GROUND_GUN } from './groundGunEconomy'
import {
  isOnTurretMount,
  liveTurretModulesOf,
  type LiveTurretModule,
  type TurretAttachRead,
} from './turretModules'

type ShapeAsk = Partial<TurretShape>

const SPOTTER_GUNS_ID = 'combo.spotter_guns'
const THREAT_PERISCOPE_ID = 'passive.threat_periscope'

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

/** The shape the player's live modules, and the spotter guns over them, fold to; null with none. */
export function playerTurretShapeOf(
  state: AuthorityState,
  playerId: string,
  isAttached: TurretAttachRead = isOnTurretMount,
): TurretShape | null {
  const live = liveTurretModulesOf(state, playerId, isAttached)
  return foldTurretShapes([
    ...askingModuleShapesOf(state, playerId, live),
    ...spotterShapesOf(state, playerId, live),
  ])
}

/** #107's guns with the module's fields at its Mark. */
export function moduleShapeOf({ itemId, mark }: LiveTurretModule): TurretShape {
  return { ...BASE_TURRET_SHAPE, ...shapeAskOf(itemId, mark) }
}

function askingModuleShapesOf(
  state: AuthorityState,
  playerId: string,
  live: readonly LiveTurretModule[],
): TurretShape[] {
  return live.filter((module) => isAskingNow(state, playerId, module)).map(moduleShapeOf)
}

/** The spotter's pre-train, while the combo resolves on this turret; none otherwise. */
function spotterShapesOf(
  state: AuthorityState,
  playerId: string,
  live: readonly LiveTurretModule[],
): TurretShape[] {
  if (!isSpotterInPlay(state, playerId, live)) return []
  const { pretrainTicks } = GROUND_GUN.combos[SPOTTER_GUNS_ID]
  return [{ ...BASE_TURRET_SHAPE, pretrainTicks }]
}

/** Both parents in play (the director live on the turret, the periscope owned) and the combo. */
function isSpotterInPlay(
  state: AuthorityState,
  playerId: string,
  live: readonly LiveTurretModule[],
): boolean {
  if (!live.some(({ itemId }) => itemId === FIRE_DIRECTOR_ITEM_ID)) return false
  return [SPOTTER_GUNS_ID, THREAT_PERISCOPE_ID].every((itemId) => ownsItem(state, playerId, itemId))
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
