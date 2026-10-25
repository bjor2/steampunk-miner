/**
 * Tool trade-offs (ticket 848; the GD lock on #823 Q2 with its amendment, the TD's seam 6388823846
 * as amended, the VS's final rows): a tool that changes how a hazard plays pays for it on one owned
 * track, and only while it acts (`actingTools.ts`), so no tool is a nerf carried about.
 *
 * - **Rows.** `{ id, axis, penaltyBp, floorBp }`, one per tool, its id the tool's own: `thrust`
 *   (the engine's lift), `horizontal` (the drive's top speed and acceleration) or `dig` (the drill's
 *   power). The penalty is a multiplier on the owned track, never an amount, so it scales with
 *   upgrades: the scale is `max(floorBp, 10000 + penaltyBp)`.
 * - **Guards, at the seal.** A penalty above 0 (a trade-off is never a boost: VS pin 1 keeps the drill
 *   law money-only), a floor outside `itemEffectCaps.toolFloorMinBp` (7000) to 10000, and two rows
 *   on one axis (at most one penalty per axis, never summed) are refused, every bad row listed.
 * - **Reads.** Motion reads a trade-off as a motion effect with its floor (`motionEffects.ts`); the
 *   drill reads `digScaleBpOf`, at most the whole.
 *
 * With nothing registered, or no listed tool acting, every read is the plain track.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { ECONOMY } from '../economy/economy'
import { actingToolsOf } from '../vehicle/actingTools'
import type { VehicleMotionEffect } from '../vehicle/motionEffects'
import type { VehicleState } from '../vehicle/vehicleState'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

export type TradeOffAxis = 'thrust' | 'horizontal' | 'dig'

export const TRADE_OFF_AXES: readonly TradeOffAxis[] = ['thrust', 'horizontal', 'dig']

export interface ToolTradeOff {
  /** The tool's id, `<slice>.<tool>`, as `actingTools` lists it. */
  id: string
  axis: TradeOffAxis
  /** The penalty on the axis's owned track while the tool acts, in bp: 0 or below. */
  penaltyBp: number
  /** The least share of the track the penalty leaves, in bp. */
  floorBp: number
}

export const TOOL_TRADE_OFF_REGISTRY = defineRegistry<ToolTradeOff>('toolTradeOffs', (rows) =>
  sealProblemOf(rows),
)

/** Every reason the rows are refused, with the kernel's minimum floor; empty when they stand. */
export function toolTradeOffProblems(rows: readonly ToolTradeOff[], floorMinBp: number): string[] {
  return [
    ...rows.flatMap((row) => rowProblems(row, floorMinBp)),
    ...TRADE_OFF_AXES.flatMap((axis) => sharedAxisProblems(rows, axis)),
  ]
}

/** The acting tool's trade-off on `axis`, or null when none acts there. */
export function actingTradeOffOn(vehicle: VehicleState, axis: TradeOffAxis): ToolTradeOff | null {
  const acting = actingToolsOf(vehicle)
  if (acting.length === 0) return null
  return (
    entriesOf(TOOL_TRADE_OFF_REGISTRY).find(
      (row) => row.axis === axis && acting.includes(row.id),
    ) ?? null
  )
}

/** The drill's power share while a dig trade-off acts, in bp: the whole without one. */
export function digScaleBpOf(vehicle: VehicleState): number {
  return tradeOffScaleBpOn(vehicle, 'dig')
}

/** The share of `axis`'s track an acting trade-off leaves, in bp: the whole without one. */
export function tradeOffScaleBpOn(vehicle: VehicleState, axis: TradeOffAxis): number {
  const row = actingTradeOffOn(vehicle, axis)
  return row === null ? BASIS_POINTS : scaleBpOf(row)
}

/** The acting thrust and horizontal trade-offs as motion effects, each with its floor. */
export function tradeOffMotionEffectsOf(vehicle: VehicleState): VehicleMotionEffect[] {
  const thrust = actingTradeOffOn(vehicle, 'thrust')
  const horizontal = actingTradeOffOn(vehicle, 'horizontal')
  return [
    ...(thrust === null ? [] : [{ liftBp: thrust.penaltyBp, floorBp: thrust.floorBp }]),
    ...(horizontal === null
      ? []
      : [{ driveBp: horizontal.penaltyBp, floorBp: horizontal.floorBp }]),
  ]
}

/** `max(floorBp, 10000 + penaltyBp)`. */
function scaleBpOf(row: ToolTradeOff): number {
  return Math.max(row.floorBp, BASIS_POINTS + row.penaltyBp)
}

function sealProblemOf(registrations: readonly SealedRegistration<ToolTradeOff>[]): string | null {
  const rows = registrations.map(({ entry }) => entry)
  const problems = toolTradeOffProblems(rows, ECONOMY.itemEffectCaps.toolFloorMinBp)
  return problems.length === 0 ? null : `tool trade-offs refused: ${problems.join('; ')}`
}

function rowProblems(row: ToolTradeOff, floorMinBp: number): string[] {
  return [
    ...(TRADE_OFF_AXES.includes(row.axis)
      ? []
      : [`${row.id}.axis is not thrust, horizontal or dig`]),
    ...(isWholeBetween(row.penaltyBp, -BASIS_POINTS, 0)
      ? []
      : [
          `${row.id}.penaltyBp must be whole, from -${BASIS_POINTS} to 0: a trade-off never boosts`,
        ]),
    ...(isWholeBetween(row.floorBp, floorMinBp, BASIS_POINTS)
      ? []
      : [
          `${row.id}.floorBp must be whole, from the kernel minimum ${floorMinBp} to ${BASIS_POINTS}`,
        ]),
  ]
}

function sharedAxisProblems(rows: readonly ToolTradeOff[], axis: TradeOffAxis): string[] {
  const ids = rows.filter((row) => row.axis === axis).map((row) => row.id)
  if (ids.length < 2) return []
  return [`${ids.join(', ')} each take a ${axis} penalty: at most one per axis`]
}

function isWholeBetween(value: number, lowest: number, highest: number): boolean {
  return Number.isSafeInteger(value) && value >= lowest && value <= highest
}
