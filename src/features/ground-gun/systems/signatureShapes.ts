/**
 * The shot the five signature modules bore (ticket 380; Content's node table on #310, Systems'
 * numbers on #322 section 5, the TD lock on #318), answered to the kernel's `shotShapeOf` (#377):
 * each module on the gun gives its part of the shape at its Mark, and the parts fold into one
 * `ShotShape` by the kernel's own fold (the union of the lines, the largest turns, energy and
 * ticks, the highest lining grade). Every part only redistributes the shot's one dig budget.
 *
 * - Splay choke: `splayLines` lines in all (the kernel's count, the aimed line included), the rest
 *   `splaySteps` bearing steps to either side of the aim in turn, then twice as far, each clamped
 *   to the arc by the kernel. The first leans down from the horizontal on the side the rig faces
 *   (bearings run from the left horizontal, 0, down to the right one, 255), so a level shot ahead
 *   keeps its twin; at the arc's far edge the twin past it is clamped onto the aimed line and
 *   dropped, as the kernel drops any repeated bearing (#377).
 * - Rifled bore: `rifleTurns` same-ore seam turns a line.
 * - Cementing round: while it has a charge and its wait has run out, the shot lines the walls it
 *   opens in the miner's cement-grade lining (the active type when it is one, else the highest
 *   owned), at `cementEnergyPerCellBp` extra energy a cell. With no cement-grade lining it lines
 *   nothing, and spends nothing.
 * - Earthing spike: while its wait has run out, the shot grounds its opened cells for `groundTicks`.
 * - Strut bore: while it has a strut left, a line that meets a hollow wedges one for `strutTicks`.
 *
 * The splay choke and the rifled bore cost cadence instead (Content: "adds to cadence", Systems'
 * `splayCooldownTicks` and `rifleCooldownTicks`): the larger of the two is added to the gun's
 * least wait between shots, never summed, as the fold takes the strongest. `gunRecoveryTicks`
 * itself is unchanged (VS on #318); the wait only grows.
 *
 * A gun that is not mounted has no shape, whatever modules the player owns.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { vehicleOf } from '../../../systems/authority/authorityState'
import { foldShotShapes, liningTypeOfGrade } from '../../../systems/authority/bore/shotShape'
import { cementGradeOf } from '../../../systems/economy/casingPrices'
import type { ShotShape } from '../../../systems/registries/boreGun'
import { liningRowIdOf } from '../../../systems/vehicle/liningType'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { moduleStatsAt, type ModuleStats } from './armouryModules'
import {
  CEMENTING_ROUND_ITEM_ID,
  EARTHING_SPIKE_ITEM_ID,
  RIFLED_BORE_ITEM_ID,
  SPLAY_CHOKE_ITEM_ID,
  STRUT_BORE_ITEM_ID,
} from './boreGunLane'
import { ownedModuleMarkOf } from './boreGunModules'
import { gunLevelsOf, isGunMounted } from './gunLevels'
import { isModuleReady } from './moduleUse'

/** One module's part of the shot: what its Mark's stats shape, or null when it sits this one out. */
type ShapePartOf = (stats: ModuleStats, gun: PlayerGun) => ShotShape | null

/** The player whose shot is shaped, and the module's Mark on their gun. */
interface PlayerGun {
  state: AuthorityState
  playerId: string
  itemId: string
  mark: number
}

const ONE_LINE: ShotShape = {
  lineOffsets: [],
  seamTurns: 0,
  liningGrade: null,
  extraEnergyPerCellBp: 0,
  groundTicks: null,
  strutTicks: null,
}

const SHAPE_PARTS: Readonly<Record<string, ShapePartOf>> = {
  [SPLAY_CHOKE_ITEM_ID]: (stats, gun) => ({
    ...ONE_LINE,
    lineOffsets: splayOffsetsOf(stats.splayLines, stats.splaySteps * downwardSignOf(gun)),
  }),
  [CEMENTING_ROUND_ITEM_ID]: cementedShapeOf,
  [EARTHING_SPIKE_ITEM_ID]: (stats, gun) =>
    isReady(gun) ? { ...ONE_LINE, groundTicks: stats.groundTicks } : null,
  [RIFLED_BORE_ITEM_ID]: (stats) => ({ ...ONE_LINE, seamTurns: stats.rifleTurns }),
  [STRUT_BORE_ITEM_ID]: (stats, gun) =>
    isReady(gun) ? { ...ONE_LINE, strutTicks: stats.strutTicks } : null,
}

/** The stats that add to the gun's least wait between shots, by module. */
const CADENCE_STATS: Readonly<Record<string, string>> = {
  [SPLAY_CHOKE_ITEM_ID]: 'splayCooldownTicks',
  [RIFLED_BORE_ITEM_ID]: 'rifleCooldownTicks',
}

/** The signature modules, in the lane's order. */
export function signatureModuleIds(): readonly string[] {
  return Object.keys(SHAPE_PARTS)
}

/** The shape this player's next shot bores; null for one plain line or no mounted gun. */
export function signatureShotShapeOf(state: AuthorityState, playerId: string): ShotShape | null {
  if (!isGunMounted(gunLevelsOf(state, playerId))) return null
  return foldShotShapes(shapePartsOf(state, playerId))
}

/** Ticks the modules on the gun add to its least wait between shots: the largest, never a sum. */
export function signatureCadenceTicksOf(state: AuthorityState, playerId: string): number {
  const ticks = Object.entries(CADENCE_STATS).map(([itemId, stat]) => {
    const mark = ownedModuleMarkOf(state, playerId, itemId)
    return mark === 0 ? 0 : (moduleStatsAt(itemId, mark).stats[stat] ?? 0)
  })
  return Math.max(0, ...ticks)
}

/**
 * Offsets for `lines` lines in all: the aimed line is the kernel's, the rest alternate to either
 * side of it, `steps` first (its sign picks the side), then the other way, then twice as far.
 */
export function splayOffsetsOf(lines: number, steps: number): number[] {
  return Array.from({ length: Math.max(0, lines - 1) }, (_, at) => splayOffsetAt(at, steps))
}

/** The cement-grade lining row the miner lays now, or null with none owned. */
export function cementLiningRowOf(state: AuthorityState, playerId: string): string | null {
  const lining = vehicleOf(state, playerId).lining
  const cemented = lining.owned.filter(isCementLiningType)
  const liningType = cemented.includes(lining.active) ? lining.active : highestGradeOf(cemented)
  return liningType === null ? null : liningRowIdOf(liningType)
}

function shapePartsOf(state: AuthorityState, playerId: string): ShotShape[] {
  return signatureModuleIds().flatMap((itemId) => {
    const mark = ownedModuleMarkOf(state, playerId, itemId)
    if (mark === 0) return []
    const part = SHAPE_PARTS[itemId](moduleStatsAt(itemId, mark).stats, {
      state,
      playerId,
      itemId,
      mark,
    })
    return part === null ? [] : [part]
  })
}

function cementedShapeOf(stats: ModuleStats, gun: PlayerGun): ShotShape | null {
  const liningGrade = cementLiningRowOf(gun.state, gun.playerId)
  if (liningGrade === null || !isReady(gun)) return null
  return { ...ONE_LINE, liningGrade, extraEnergyPerCellBp: stats.cementEnergyPerCellBp }
}

function isReady({ state, playerId, itemId, mark }: PlayerGun): boolean {
  return isModuleReady(state, playerId, itemId, mark)
}

/** +1, -1, +2, -2 times `steps`, for the 0th, 1st, 2nd and 3rd extra line. */
function splayOffsetAt(at: number, steps: number): number {
  const reach = (Math.floor(at / 2) + 1) * steps
  return at % 2 === 0 ? reach : -reach
}

/** +1 when facing left, where bearings grow downward from the horizontal; -1 otherwise. */
function downwardSignOf({ state, playerId }: PlayerGun): number {
  return vehicleOf(state, playerId).pose?.facing === FACING.left ? 1 : -1
}

/** A casing_cement grade the bore can lay (ticket 366: a laid type with its grade row). */
function isCementLiningType(liningType: string): boolean {
  return cementGradeOf(liningType) !== null && liningTypeOfGrade(liningRowIdOf(liningType)) !== null
}

function highestGradeOf(liningTypes: readonly string[]): string | null {
  return liningTypes.reduce<string | null>(
    (highest, liningType) =>
      highest === null || gradeOf(liningType) > gradeOf(highest) ? liningType : highest,
    null,
  )
}

function gradeOf(liningType: string): number {
  return cementGradeOf(liningType) ?? 0
}
