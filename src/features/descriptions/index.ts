/**
 * The descriptions slice's public API (#164). A slice that sells an item files its card entry
 * through `itemDescriptionEntries` in its own `register.ts`; it may give its stat lines the next
 * level and cap readings below, and check its flavour with the same copy rules.
 */
export const DESCRIPTIONS_SLICE_ID = 'descriptions'
export type { DescribedStatLineSpec } from './systems/describedLineSpec'
export { hasNoNextLevel } from './systems/describedLineSpec'
export { flavourProblemsOf } from './systems/flavourRules'
