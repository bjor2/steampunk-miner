/**
 * The description coverage rule (#159 section 3 rule 1, #164): every buyable `listBuyableRefs`
 * names, the generated ones up to planet 100 included (TD on #155: P41-100 through the same
 * shrink-only allowlist as the icons), gets a card with a flavour line and at least one stat line.
 * `KNOWN_DESCRIPTION_GAPS` lists refs that may still lack one; it starts empty and only shrinks, so
 * an entry added there is a finding, never a fix.
 */
import type { ItemDescription, ItemRef } from '../../../systems/registries/itemDescriber'

/** `kind:id` or `kind:id#grade` of refs known to have no card yet; empty, and it stays so. */
export const KNOWN_DESCRIPTION_GAPS: readonly string[] = []

/** The planet the coverage walks generated refs up to (TD on #155). */
export const COVERAGE_MAX_PLANET = 100

/** Every way the refs fail the rule; empty when every buyable has its card. */
export function descriptionCoverageProblems(
  refs: readonly ItemRef[],
  describe: (ref: ItemRef) => ItemDescription | null,
  allowlist: readonly string[] = KNOWN_DESCRIPTION_GAPS,
): string[] {
  const described = refs.filter((ref) => isDescribed(describe(ref)))
  return [
    ...refs
      .filter((ref) => !described.includes(ref) && !allowlist.includes(refNameOf(ref)))
      .map((ref) => `buyable "${refNameOf(ref)}" has no description`),
    ...described
      .filter((ref) => allowlist.includes(refNameOf(ref)))
      .map((ref) => `buyable "${refNameOf(ref)}" is described now: take it off the allowlist`),
  ]
}

export function refNameOf(ref: ItemRef): string {
  const name = `${ref.kind}:${ref.id}`
  return ref.grade === undefined ? name : `${name}#${ref.grade}`
}

/** A flavour line and at least one stat line (no kernel buyable is a declared cosmetic). */
function isDescribed(description: ItemDescription | null): boolean {
  return description !== null && description.flavour !== '' && description.statLines.length > 0
}
