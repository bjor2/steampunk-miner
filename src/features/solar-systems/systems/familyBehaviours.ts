/**
 * The behaviour-level fail-on-recolour check of the SS2-B set (ticket 780; HS-1 on ticket 775:
 * "a test over all generated g fails on any duplicate family id or a recolour of an earlier
 * family"). A family is more than a name: it is what it does to the rig, the hold or the ground.
 * `FIRST_SYSTEM_BEHAVIOURS` is the ledger of what the first system's content does, one effect per
 * id, sourced from the kernel and the ores slice: the enemy kinds of `economy.json` lunge
 * (`crawler`, `burrower`) or hold the rig (`tunnel_wrecker`, `core_guardian`: `holdsTheRig`), the
 * hazard kinds of `ores.economy.json` carry their `effect` (`refill`, `drain`, `bite`, `shove`),
 * the magnetic planets pull (ticket 289), the lava planets heat (ticket 113), and the vision rows
 * Progression's "Never" column names do what their stats.json names say: the EMP mite disables
 * tools, the frost spitter shoots, the magma tick deals contact damage.
 *
 * A family is recoloured when its effect is one the ledger already holds, or when a line of its
 * "Never" column names an effect or an owner the ledger does not know (so the column stays a true
 * statement about the first system). A telegraphed hazard's warning lasts the reaction window the
 * Gameplay & Vehicle Designer set for a collapse (`COLLAPSE_WARN_TICKS`, the Systems addendum on
 * #676: at least as long as the reaction window), never less.
 */
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import type { BehaviourEffect, FamilyBehaviour, NewContentFamily } from './paletteRows'

/** One first-system id and the effect it has on the rig, the hold or the ground. */
export interface FirstSystemBehaviour {
  id: string
  effect: BehaviourEffect
  /** Where the effect is written: a kernel or ores row, or the stats.json name of a vision row. */
  source: 'enemy_kind' | 'hazard_kind' | 'schedule_row'
}

export const FIRST_SYSTEM_BEHAVIOURS: readonly FirstSystemBehaviour[] = [
  { id: 'crawler', effect: 'lunge', source: 'enemy_kind' },
  { id: 'burrower', effect: 'lunge', source: 'enemy_kind' },
  { id: 'tunnel_wrecker', effect: 'hold_rig', source: 'enemy_kind' },
  { id: 'core_guardian', effect: 'hold_rig', source: 'schedule_row' },
  { id: 'magma_tick', effect: 'contact_damage', source: 'schedule_row' },
  { id: 'frost_spitter', effect: 'shoot', source: 'schedule_row' },
  { id: 'emp_mite', effect: 'disable_tools', source: 'schedule_row' },
  { id: 'rockfall', effect: 'refill', source: 'hazard_kind' },
  { id: 'firedamp', effect: 'drain', source: 'hazard_kind' },
  { id: 'spinecrystal', effect: 'bite', source: 'hazard_kind' },
  { id: 'steamvent', effect: 'shove', source: 'hazard_kind' },
  { id: 'magnetic_planets', effect: 'magnetic_pull', source: 'schedule_row' },
  { id: 'heat_lava', effect: 'heat', source: 'schedule_row' },
]

/** Every way the families recolour the first system's content; empty when none does. */
export function recolourProblemsOf(families: readonly NewContentFamily[]): string[] {
  return families.flatMap((family) => [
    ...ownEffectProblems(family),
    ...family.behaviour.never.flatMap((line, at) => neverLineProblems(family, at, line)),
  ])
}

/** The families whose behaviour recolours an earlier one, by id. */
export function recolouredFamiliesOf(families: readonly NewContentFamily[]): string[] {
  return families.filter((family) => ownEffectProblems(family).length > 0).map((f) => f.id)
}

/** The ticks a family's warning shows before it acts: the reaction window, or none untelegraphed. */
export function telegraphTicksOf(behaviour: FamilyBehaviour): number {
  return behaviour.telegraphed ? COLLAPSE_WARN_TICKS : 0
}

function ownEffectProblems(family: NewContentFamily): string[] {
  const owner = ledgerOwnerOf(family.behaviour.effect)
  return owner === undefined
    ? []
    : [`${family.id} recolours ${owner.id}: both ${family.behaviour.effect}`]
}

function neverLineProblems(
  family: NewContentFamily,
  at: number,
  line: FamilyBehaviour['never'][number],
): string[] {
  const owner = FIRST_SYSTEM_BEHAVIOURS.find((entry) => entry.id === line.of)
  if (owner === undefined) return [`${family.id}.never[${at}] names ${line.of}, not in the ledger`]
  return owner.effect === line.effect
    ? []
    : [`${family.id}.never[${at}] says ${line.of} has ${line.effect}; it has ${owner.effect}`]
}

function ledgerOwnerOf(effect: BehaviourEffect): FirstSystemBehaviour | undefined {
  return FIRST_SYSTEM_BEHAVIOURS.find((entry) => entry.effect === effect)
}
