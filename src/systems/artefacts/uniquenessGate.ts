/**
 * The artefact uniqueness gate (decision #46, Systems & Economy's gate, adopted): an option is
 * horizontal only if it adds at least one of
 *   1. `new_rule`         a new authority command or persistent rule flag,
 *   2. `new_information`  a new information channel the player did not have,
 *   3. `new_interaction`  a new interaction with casing, collapse, shops or the ground model.
 * An option whose only effect is a scalar on a vertical stat (drill power, tip, hull, energy,
 * cargo, engine, ore value, hardness, any price, casing grade) is a stat bump in disguise and is
 * refused: those belong on the six tracks, timed buffs on powerups (#47).
 *
 * Every option declares the clauses it satisfies, and each declared clause must be backed by an
 * effect of its kind, so the table cannot claim a clause its effects do not deliver.
 */

export const GATE_CLAUSES = ['new_rule', 'new_information', 'new_interaction'] as const

export type GateClause = (typeof GATE_CLAUSES)[number]

/** The vertical stats of #46's illegal list; a scalar on one of them never passes the gate. */
export const VERTICAL_STATS = [
  'drillPower',
  'drillTip',
  'hullMax',
  'energyMax',
  'cargoCapacity',
  'speedMax',
  'accel',
  'thrustToWeight',
  'oreValue',
  'hardness',
  'price',
  'casingGrade',
] as const

export type ArtefactEffect =
  | { kind: 'rule_flag'; rule: string }
  | { kind: 'information_channel'; channel: string }
  | { kind: 'interaction'; with: 'casing' | 'collapse' | 'shops' | 'ground' }
  | { kind: 'scalar'; stat: (typeof VERTICAL_STATS)[number]; factor: string }

type EffectKind = ArtefactEffect['kind']

const EFFECT_KIND_OF_CLAUSE: Readonly<Record<GateClause, EffectKind>> = {
  new_rule: 'rule_flag',
  new_information: 'information_channel',
  new_interaction: 'interaction',
}

const EFFECT_KINDS: readonly string[] = [
  'rule_flag',
  'information_channel',
  'interaction',
  'scalar',
]
const INTERACTION_TARGETS: readonly string[] = ['casing', 'collapse', 'shops', 'ground']

/** Every reason an option fails the gate; empty when it is a horizontal option. */
export function uniquenessGateProblems(option: unknown): string[] {
  if (!isRecord(option)) return ['an artefact option must be an object']
  const id = typeof option.id === 'string' ? option.id : '(no id)'
  const effects = Array.isArray(option.effects) ? option.effects : []
  return [
    ...(option.horizontal === true ? [] : [`${id}: must be flagged horizontal: true`]),
    ...(Array.isArray(option.effects) ? [] : [`${id}: effects must be a list`]),
    ...effects.flatMap((effect, index) => effectProblems(id, effect, index)),
    ...clauseProblems(id, option.gateClauses, effects),
    ...onlyScalarProblems(id, effects),
  ]
}

function effectProblems(id: string, effect: unknown, index: number): string[] {
  const path = `${id}: effects[${index}]`
  if (!isRecord(effect) || !EFFECT_KINDS.includes(String(effect.kind))) {
    return [`${path} must have a kind of ${EFFECT_KINDS.join(', ')}`]
  }
  if (effect.kind === 'scalar') return scalarProblems(path, effect)
  if (effect.kind === 'interaction') return interactionProblems(path, effect)
  const named = effect.kind === 'rule_flag' ? effect.rule : effect.channel
  return isNonEmptyText(named) ? [] : [`${path} must name its ${String(effect.kind)}`]
}

function scalarProblems(path: string, effect: Record<string, unknown>): string[] {
  const isVerticalStat = (VERTICAL_STATS as readonly unknown[]).includes(effect.stat)
  return isVerticalStat ? [] : [`${path} scales an unknown stat ${JSON.stringify(effect.stat)}`]
}

function interactionProblems(path: string, effect: Record<string, unknown>): string[] {
  if (INTERACTION_TARGETS.includes(String(effect.with))) return []
  return [`${path} must interact with one of ${INTERACTION_TARGETS.join(', ')}`]
}

function clauseProblems(id: string, clauses: unknown, effects: readonly unknown[]): string[] {
  if (!Array.isArray(clauses) || clauses.length === 0) {
    return [`${id}: must declare at least one gate clause of ${GATE_CLAUSES.join(', ')}`]
  }
  return clauses.flatMap((clause) => declaredClauseProblems(id, clause, effects))
}

function declaredClauseProblems(id: string, clause: unknown, effects: readonly unknown[]) {
  if (!isGateClause(clause)) return [`${id}: unknown gate clause ${JSON.stringify(clause)}`]
  const kind = EFFECT_KIND_OF_CLAUSE[clause]
  if (effects.some((effect) => isRecord(effect) && effect.kind === kind)) return []
  return [`${id}: declares ${clause} but no ${kind} effect delivers it`]
}

/** #46: "illegal if its only effect is a scalar" on the vertical list. */
function onlyScalarProblems(id: string, effects: readonly unknown[]): string[] {
  const isEveryScalar = effects.every((effect) => isRecord(effect) && effect.kind === 'scalar')
  if (effects.length === 0 || !isEveryScalar) return []
  return [`${id}: only scales vertical stats, which is a vertical upgrade, not an artefact`]
}

function isGateClause(value: unknown): value is GateClause {
  return (GATE_CLAUSES as readonly unknown[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}
