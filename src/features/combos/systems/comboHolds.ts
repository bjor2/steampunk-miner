/**
 * The combos still held as vision rows, and why (GD lock on #206, decisions 3 and 10; the lock on
 * #205 Q2 and Q3: an item whose mechanic or prerequisite is not in the game stays unregistered).
 * A held combo registers no store item, node or template, so no generated grade of its pair ever
 * offers a combo with no effect. Every other combo ships through the item hooks
 * (`comboHooks.ts`).
 */
export const COMBO_HOLDS: Readonly<Record<string, string>> = {
  'combo.foam_cutters': 'stabiliser foam is held back (#202), so the combo has no parent node',
  'combo.foam_grapple': 'stabiliser foam is held back (#202), so the combo has no parent node',
  'combo.aether_reel': 'the tow hook waits until Gameplay defines tow (GD lock on #206, 10)',
  'combo.ceiling_anchor': 'item and node moved to #288, after the twin-bit diagonal',
}

/** Whether the combo store item ships now. */
export function isShippedCombo(itemId: string): boolean {
  return !Object.hasOwn(COMBO_HOLDS, itemId)
}
