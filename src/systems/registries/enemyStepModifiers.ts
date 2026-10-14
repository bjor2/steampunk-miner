/**
 * Slice slows on how far an enemy steps (ticket 375, the TD lock on #263 Q2): the chronometric
 * governor's pocket (#263) and later #373's slows answer a shorter step for an enemy they hold.
 * Slow-only and strongest wins: every modifier is asked with the same base step and the enemy
 * takes the smallest answer, never a product or a sum, so overlapping slows never compound into a
 * frozen enemy (#245) and the order never matters. The vehicle is never an input, so the #233
 * motion cap and #333/#334 travel are untouched. Ownership is the slice's to check when it opens
 * a pocket, never here. With nothing registered every step is the base step.
 */
import AETHERIC_TUNING from '../../data/aetheric.json'
import type { AuthorityState } from '../authority/authorityState'
import type { Enemy } from '../authority/combat/combatState'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

export interface EnemyStepModifier {
  id: string
  /**
   * This tick's step in whole mm, or null for no opinion; an integer in [0, step]: slow-only,
   * never speeds an enemy up.
   */
  modify(step: number, enemy: Enemy, state: AuthorityState, tick: number): number | null
}

/** How many slows the seal lets register (`src/data/aetheric.json`, a stand-in for Systems). */
export const ENEMY_STEP_MODIFIER_CAP = AETHERIC_TUNING.enemyStepModifierCap

export const ENEMY_STEP_MODIFIER_REGISTRY = defineRegistry<EnemyStepModifier>(
  'enemyStepModifiers',
  modifiersOverCapProblem,
)

/** `baseMm` after the strongest registered slow; throws on an answer outside `[0, baseMm]`. */
export function modifiedEnemyStepMm(
  state: AuthorityState,
  enemy: Enemy,
  tick: number,
  baseMm: number,
): number {
  const modifiers = entriesOf(ENEMY_STEP_MODIFIER_REGISTRY)
  if (modifiers.length === 0) return baseMm
  return strongestSlowOf(modifiers, state, enemy, tick, baseMm)
}

/** The smallest step any modifier answers, asked in id order, each with the same base step. */
function strongestSlowOf(
  modifiers: readonly EnemyStepModifier[],
  state: AuthorityState,
  enemy: Enemy,
  tick: number,
  baseMm: number,
): number {
  return modifiers.reduce(
    (step, modifier) => Math.min(step, checkedStepOf(modifier, state, enemy, tick, baseMm)),
    baseMm,
  )
}

/** The modifier's answer, `baseMm` for no opinion. */
function checkedStepOf(
  modifier: EnemyStepModifier,
  state: AuthorityState,
  enemy: Enemy,
  tick: number,
  baseMm: number,
): number {
  const step = modifier.modify(baseMm, enemy, state, tick)
  if (step === null) return baseMm
  if (!isSlowStep(step, baseMm)) throw new RangeError(slowOnlyProblem(modifier.id, step, baseMm))
  return step
}

function isSlowStep(step: number, baseMm: number): boolean {
  return Number.isInteger(step) && step >= 0 && step <= baseMm
}

function slowOnlyProblem(id: string, step: number, baseMm: number): string {
  return `enemy step modifier "${id}" answered ${step} mm for a ${baseMm} mm step: slows only, a whole mm in [0, ${baseMm}]`
}

function modifiersOverCapProblem(
  registrations: readonly SealedRegistration<EnemyStepModifier>[],
): string | null {
  if (registrations.length <= ENEMY_STEP_MODIFIER_CAP) return null
  return `${registrations.length} enemy step modifiers registered, at most ${ENEMY_STEP_MODIFIER_CAP}`
}
