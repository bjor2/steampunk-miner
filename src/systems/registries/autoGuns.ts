/**
 * The `auto_guns` turret's shape for one player (ticket 382, the TD lock on #319 as the GD ruled
 * it): the turret modules live in the ground-gun slice (#388), so the kernel's `fireGun` reads how
 * far, how cheaply, at whom and how the guns shoot from one provider and never imports the slice.
 * With no provider, or a null answer, the guns shoot as #107 built them.
 *
 * The provider folds its modules into one `TurretShape` before answering (the kernel's
 * `foldTurretShapes`, `authority/combat/turretShape.ts`); the kernel reads it once per due shot and
 * throws for a field outside `gun.turretCaps`. Turrets stay enemy-only: no shape cuts a cell.
 */
import type { AuthorityState } from '../authority/authorityState'
import { defineOneProviderRegistry, entriesOf } from './seal'

/** The order the guns pick among the enemies they can hit. */
export type TurretTargetOrder = 'nearest' | 'director'

/** Concussion shells: a hit pushes the enemy back and breaks its lunge, once per cooldown. */
export interface TurretKnock {
  cells: number
  cooldownTicks: number
}

/** Grapeshot: one shot's damage split across up to `targets` enemies inside `coneDeg`. */
export interface TurretGrape {
  targets: number
  coneDeg: number
}

/** Overpressure: `burstTicks` at the faster cadence, then `ventTicks` idle (K-burst, #383). */
export interface TurretBurst {
  burstTicks: number
  ventTicks: number
}

export interface TurretShape {
  /** Tiles the guns reach, at most `gunRangeCap`. */
  rangeTiles: number
  /** Energy quanta one shot takes, from the floor share of `energy.perShot` up to all of it. */
  energyPerShotQuanta: number
  targetOrder: TurretTargetOrder
  /** Ticks the fire director keeps its pick before it ranks the pack again. */
  retargetTicks: number
  /** Sentry cam: ticks the rig stands still and quiet before the guns cover the drill's cone. */
  forwardConeAfterTicks: number | null
  knock: TurretKnock | null
  grape: TurretGrape | null
  burst: TurretBurst | null
  /** Ricochet: the longest leg after one bounce off a wall, in cells. */
  bounceLegCells: number | null
}

export interface AutoGunsProvider {
  id: string
  /** The shape this player's guns shoot with now, folded over its modules; null for #107's guns. */
  turretShapeOf?(state: AuthorityState, playerId: string): TurretShape | null
}

export const AUTO_GUNS_REGISTRY = defineOneProviderRegistry<AutoGunsProvider>('autoGuns')

/** Whether a slice provides turret shapes at all: the kernel keeps turret facts only then. */
export function hasAutoGunsProvider(): boolean {
  return entriesOf(AUTO_GUNS_REGISTRY).length > 0
}

/** The provider's turret shape as it answered, unchecked; null with no provider or no answer. */
export function providedTurretShapeOf(state: AuthorityState, playerId: string): TurretShape | null {
  const [provider] = entriesOf(AUTO_GUNS_REGISTRY)
  return provider?.turretShapeOf?.(state, playerId) ?? null
}
