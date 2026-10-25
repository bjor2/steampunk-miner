/**
 * What the kit tools do while they act (ticket 881, PK4c T1; #850's rows under the GD lock
 * 6395054734): the `acting` block of `planet-kit.economy.json`, read with the kits' numbers and
 * refused whole when broken.
 *
 * - **Context tools** (`tools`, by item id): while the tool acts, its home hazard's contact factor
 *   is `factorBp` and the track its row's `tradeOff.costs` names pays `penaltyBp`, never under
 *   `floorBp` (`kitToolRules.ts`). A tool acts while its hazard kind is within the drill's reach
 *   and `tailTicks` after it was last seen there.
 * - **The flask** (`flask`): uncorked on purpose, its hazard's factor is `factorBp` for
 *   `openTicks` from the uncork (`flaskRules.ts`), and its hazard is cleared within
 *   `clearRadiusTiles` of the rig's cell at the uncork for that window (ticket 882).
 * - **Outcomes** (ticket 882, PK4c T2; the HS's "one visible outcome while acting"): each tool
 *   row's `outcome` names its verb, `shove_aside` (the plough, `sideTiles` to the side),
 *   `loot` (the tongs) or `aim_outward` (the vane), played only while the tool acts
 *   (`kitToolOutcomes.ts`).
 */
import { BASIS_POINTS } from '../../../constants/balance'
import type { TradeOffAxis } from '../../../systems/registries/toolTradeOffs'
import { isPlainMap, isText, isWholeFrom, SNAKE_ID, type Raw } from './planetKitRowShape'
import type { TradeOffCost } from './planetKitTypes'

/** The one visible thing a tool does while it acts. */
export type KitToolOutcome =
  { verb: 'shove_aside'; sideTiles: number } | { verb: 'loot' } | { verb: 'aim_outward' }

export type KitToolVerb = KitToolOutcome['verb']

export interface KitToolActing {
  itemId: string
  /** The tool's hazard's contact factor while it acts, 0 to 10000 bp. */
  factorBp: number
  /** The trade-off on its track while it acts, 0 or below, and the least share it leaves. */
  penaltyBp: number
  floorBp: number
  outcome: KitToolOutcome
}

export interface FlaskActing {
  itemId: string
  factorBp: number
  /** The ticks an uncorked flask stays open. */
  openTicks: number
  /** The cells round the rig's, by centre, whose hazard the open flask clears. */
  clearRadiusTiles: number
}

export interface KitActing {
  tailTicks: number
  tools: readonly KitToolActing[]
  flask: FlaskActing
}

/** The owned track each trade-off cost of a tool row names; null for one that is no track. */
export const TRADE_OFF_AXIS_OF_COST: Readonly<Record<TradeOffCost, TradeOffAxis | null>> = {
  engine_thrust: 'thrust',
  cut_speed: 'dig',
  horizontal_speed: 'horizontal',
  return_trip: null,
  held_still: null,
}

const ACTING_FIELDS: readonly string[] = ['tailTicks', 'tools', 'flask']
const TOOL_FIELDS: readonly string[] = ['factorBp', 'penaltyBp', 'floorBp', 'outcome']
const FLASK_FIELDS: readonly string[] = ['itemId', 'factorBp', 'openTicks', 'clearRadiusTiles']
/** Each verb's fields beside `verb`. */
const OUTCOME_FIELDS: Readonly<Record<KitToolVerb, readonly string[]>> = {
  shove_aside: ['sideTiles'],
  loot: [],
  aim_outward: [],
}

/** Why the `acting` block is not the tools' numbers; empty when it is. */
export function kitActingProblems(acting: unknown): string[] {
  if (!isPlainMap(acting)) return ['acting must be { tailTicks, tools, flask }']
  return [
    ...(isWholeFrom(acting.tailTicks, 0) ? [] : ['acting.tailTicks must be whole ticks from 0']),
    ...toolsProblems(acting.tools),
    ...flaskProblems(acting.flask),
    ...unknownFieldProblems(acting, 'acting', ACTING_FIELDS),
  ]
}

/** The block typed; call only on one `kitActingProblems` accepts. */
export function kitActingOf(acting: Raw): KitActing {
  const tools = acting.tools as Record<string, Raw>
  const flask = acting.flask as Raw
  return {
    tailTicks: acting.tailTicks as number,
    tools: Object.entries(tools).map(([itemId, row]) => ({
      itemId,
      factorBp: row.factorBp as number,
      penaltyBp: row.penaltyBp as number,
      floorBp: row.floorBp as number,
      outcome: row.outcome as KitToolOutcome,
    })),
    flask: {
      itemId: flask.itemId as string,
      factorBp: flask.factorBp as number,
      openTicks: flask.openTicks as number,
      clearRadiusTiles: flask.clearRadiusTiles as number,
    },
  }
}

function toolsProblems(tools: unknown): string[] {
  if (!isPlainMap(tools)) return ['acting.tools must map tool item ids to their rows']
  return Object.entries(tools).flatMap(([id, row]) => toolProblems(id, row))
}

function toolProblems(id: string, row: unknown): string[] {
  const where = `acting.tools.${id}`
  if (!SNAKE_ID.test(id)) return [`${where} is not a snake_case item id`]
  if (!isPlainMap(row)) return [`${where} must be { factorBp, penaltyBp, floorBp, outcome }`]
  return [
    ...factorProblems(row.factorBp, where),
    ...(Number.isInteger(row.penaltyBp) && (row.penaltyBp as number) <= 0
      ? []
      : [`${where}.penaltyBp must be a whole number of bp, 0 or below`]),
    ...(isBp(row.floorBp) ? [] : [`${where}.floorBp must be whole bp, 0 to ${BASIS_POINTS}`]),
    ...outcomeProblems(row.outcome, `${where}.outcome`),
    ...unknownFieldProblems(row, where, TOOL_FIELDS),
  ]
}

function outcomeProblems(outcome: unknown, where: string): string[] {
  if (!isPlainMap(outcome) || !isVerb(outcome.verb)) {
    return [`${where} must name its verb: ${Object.keys(OUTCOME_FIELDS).join(', ')}`]
  }
  return [
    ...(outcome.verb === 'shove_aside' && !isWholeFrom(outcome.sideTiles, 1)
      ? [`${where}.sideTiles must be whole tiles from 1`]
      : []),
    ...unknownFieldProblems(outcome, where, ['verb', ...OUTCOME_FIELDS[outcome.verb]]),
  ]
}

function isVerb(verb: unknown): verb is KitToolVerb {
  return typeof verb === 'string' && Object.hasOwn(OUTCOME_FIELDS, verb)
}

function flaskProblems(flask: unknown): string[] {
  if (!isPlainMap(flask)) {
    return ['acting.flask must be { itemId, factorBp, openTicks, clearRadiusTiles }']
  }
  return [
    ...(isText(flask.itemId) && SNAKE_ID.test(flask.itemId)
      ? []
      : ['acting.flask.itemId must be a snake_case item id']),
    ...factorProblems(flask.factorBp, 'acting.flask'),
    ...(isWholeFrom(flask.openTicks, 1) ? [] : ['acting.flask.openTicks must be whole from 1']),
    ...(isWholeFrom(flask.clearRadiusTiles, 0)
      ? []
      : ['acting.flask.clearRadiusTiles must be whole tiles from 0']),
    ...unknownFieldProblems(flask, 'acting.flask', FLASK_FIELDS),
  ]
}

function factorProblems(factorBp: unknown, where: string): string[] {
  return isBp(factorBp) ? [] : [`${where}.factorBp must be whole bp, 0 to ${BASIS_POINTS}`]
}

function isBp(value: unknown): boolean {
  return isWholeFrom(value, 0) && value <= BASIS_POINTS
}

function unknownFieldProblems(map: Raw, where: string, fields: readonly string[]): string[] {
  return Object.keys(map)
    .filter((field) => !fields.includes(field))
    .map((field) => `${where}.${field} is not a field of the kits' economy`)
}
