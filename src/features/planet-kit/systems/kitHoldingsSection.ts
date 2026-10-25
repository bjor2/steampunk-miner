/**
 * The kit items a player owns as saved state (the `planet-kit.holdings` save section v1, ticket
 * 850): a player section, so it rides on the player through every planet, jump and save, and the
 * host answers each player's buys from it. At its initial value (nothing owned) it is out of the
 * state and the digest, so a run that never buys a kit item saves and digests as before, and an
 * older save restores with nothing owned. The portable form is the state's own shape: item ids,
 * index text and decimal text only.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import {
  compareStacks,
  compareText,
  isCountText,
  NO_KIT_HOLDINGS,
  type KitHoldings,
  type KitStack,
} from './kitHoldings'
import { isPlainMap, SNAKE_ID } from './planetKitRowShape'

export const KIT_HOLDINGS_SECTION: SaveSection<KitHoldings> = {
  id: 'planet-kit.holdings',
  version: 1,
  scope: 'player',
  initial: NO_KIT_HOLDINGS,
  problems: kitHoldingsProblems,
  toPortable: (holdings) => holdings,
  ofPortable: (body) => body as KitHoldings,
}

export function kitHoldingsOf(state: AuthorityState, playerId: string): KitHoldings {
  return readSection(state, playerId, KIT_HOLDINGS_SECTION)
}

export function withKitHoldings(
  state: AuthorityState,
  playerId: string,
  holdings: KitHoldings,
): AuthorityState {
  return withSection(state, playerId, KIT_HOLDINGS_SECTION, holdings)
}

/** Why `body` is not a saved holding; empty when it is. */
export function kitHoldingsProblems(body: unknown): string[] {
  if (!isPlainMap(body)) return ['kit holdings must be { tools, stacks }']
  return [
    ...toolsProblems(body.tools),
    ...stacksProblems(body.stacks),
    ...Object.keys(body)
      .filter((field) => field !== 'tools' && field !== 'stacks')
      .map((field) => `kit holdings.${field} is not a field`),
  ]
}

function toolsProblems(tools: unknown): string[] {
  if (!Array.isArray(tools)) return ['kit holdings.tools must be a list of item ids']
  return [
    ...tools.flatMap((id, at) =>
      typeof id === 'string' && SNAKE_ID.test(id)
        ? []
        : [`kit holdings.tools[${at}] must be a snake_case item id`],
    ),
    ...(isStrictlySorted(tools, (a, b) => compareText(String(a), String(b)))
      ? []
      : ['kit holdings.tools must be in id order, each once']),
  ]
}

function stacksProblems(stacks: unknown): string[] {
  if (!Array.isArray(stacks)) return ['kit holdings.stacks must be a list']
  const problems = stacks.flatMap((stack, at) => stackProblems(stack, `kit holdings.stacks[${at}]`))
  if (problems.length > 0) return problems
  return isStrictlySorted(stacks as KitStack[], compareStacks)
    ? []
    : ['kit holdings.stacks must be in item id then g order, each once']
}

function stackProblems(stack: unknown, where: string): string[] {
  if (!isPlainMap(stack)) return [`${where} must be { itemId, g, count }`]
  return [
    ...(typeof stack.itemId === 'string' && SNAKE_ID.test(stack.itemId)
      ? []
      : [`${where}.itemId must be a snake_case item id`]),
    ...(isCountText(stack.g) ? [] : [`${where}.g must be index text from 1`]),
    ...(isCountText(stack.count) ? [] : [`${where}.count must be decimal text from 1`]),
    ...Object.keys(stack)
      .filter((field) => !['itemId', 'g', 'count'].includes(field))
      .map((field) => `${where}.${field} is not a field`),
  ]
}

function isStrictlySorted<T>(list: readonly T[], compare: (a: T, b: T) => number): boolean {
  return list.every((entry, at) => at === 0 || compare(list[at - 1], entry) < 0)
}
