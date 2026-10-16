/** The tree screen's `data-testid`s the browser specs find nodes and views by (rulebook section 5). */
export function nodeTestIdOf(nodeId: string): string {
  return `tech-tree-node-${nodeId}`
}

export const TREE_TEST_IDS = {
  map: 'tech-tree-map',
  list: 'tech-tree-list',
  sheet: 'tech-tree-node-sheet',
  sheetClose: 'tech-tree-node-sheet-close',
  showList: 'tech-tree-show-list',
  showMap: 'tech-tree-show-map',
  nextAffordable: 'tech-tree-next-affordable',
} as const
