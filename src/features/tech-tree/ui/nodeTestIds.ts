/** The Patent Office's `data-testid`s the browser specs find nodes by (rulebook section 5). */
export function nodeTestIdOf(nodeId: string): string {
  return `tech-tree-node-${nodeId}`
}

export const TREE_TEST_IDS = {
  /** The Patent Office's card list on the base sheet (ticket 687). */
  patentCards: 'patent-office-cards',
} as const
