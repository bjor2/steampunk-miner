/**
 * The tree screen's controls (#161 section 4), on the shared Title+OneLine element (spec #422,
 * pass #426): the title, where you are and what you hold as glyph-and-value facts, then the zoom,
 * the map or the list and the next node the wallet reaches (#470 PT-5), the search by node name,
 * item or effect word, the filters, and the way back. A phone pinches instead of zooming, so its
 * zoom buttons hide.
 */
import { hudLabelIconIdOf } from '../../../systems/art/icons/iconSet'
import { Button } from '../../../ui/kit/Button'
import { TitleOneLine, type IconValue } from '../../../ui/kit/TitleOneLine'
import { TREE_FILTERS, type TreeFilter, type TreeScreenModel } from '../systems/treeScreenModel'
import { useTreeScreenStore, type TreeView } from '../store/treeScreenStore'
import { TREE_TEST_IDS } from './nodeTestIds'
import styles from './TreeHeader.module.css'

const HEADER_TEXT = { id: 'tech-tree.header', title: 'Tech tree', oneLine: '', tooltipLines: [] }

const FILTER_LABELS: Readonly<Record<TreeFilter, string>> = {
  available: 'Available',
  affordable: 'Affordable',
  locked: 'Locked',
  marks: 'Marks',
}

/** The view the toggle switches to from each one, with its word and test id. */
const OTHER_VIEW: Readonly<Record<TreeView, { view: TreeView; label: string; testId: string }>> = {
  map: { view: 'list', label: 'List', testId: TREE_TEST_IDS.showList },
  list: { view: 'map', label: 'Map', testId: TREE_TEST_IDS.showMap },
}

export function TreeHeader({
  model,
  treeView,
  nextAffordableId,
  onDismiss,
}: {
  model: TreeScreenModel
  treeView: TreeView
  /** The researchable node "Next affordable" picks; null hides it while the wallet reaches none. */
  nextAffordableId: string | null
  onDismiss: () => void
}) {
  const zoomIn = useTreeScreenStore((state) => state.zoomIn)
  const zoomOut = useTreeScreenStore((state) => state.zoomOut)
  const search = useTreeScreenStore((state) => state.search)
  const setSearch = useTreeScreenStore((state) => state.setSearch)
  return (
    <header className={styles.header}>
      <TitleOneLine text={HEADER_TEXT} facts={headerFactsOf(model)} level="h2">
        <div className={styles.controls}>
          <div className={styles.zoom}>
            <Button label="Zoom out" onPress={zoomOut} />
            <Button label="Zoom in" onPress={zoomIn} />
          </div>
          <ViewButtons treeView={treeView} nextAffordableId={nextAffordableId} />
          <input
            className={styles.search}
            type="search"
            value={search}
            placeholder="Search nodes, items, effects"
            aria-label="Search the tech tree"
            onChange={(event) => setSearch(event.target.value)}
          />
          <FilterChips />
          <Button label="Back" onPress={onDismiss} />
        </div>
      </TitleOneLine>
    </header>
  )
}

/** The planet and the wallet, each a glyph and its value. */
function headerFactsOf(model: TreeScreenModel): IconValue[] {
  return [
    { iconId: hudLabelIconIdOf('planet'), text: `${model.planetIndex}` },
    { iconId: hudLabelIconIdOf('money'), text: model.walletText },
  ]
}

function ViewButtons({
  treeView,
  nextAffordableId,
}: {
  treeView: TreeView
  nextAffordableId: string | null
}) {
  const other = OTHER_VIEW[treeView]
  const showTreeView = useTreeScreenStore((state) => state.showTreeView)
  const selectNode = useTreeScreenStore((state) => state.selectNode)
  return (
    <div className={styles.views}>
      <Button label={other.label} onPress={() => showTreeView(other.view)} testId={other.testId} />
      {nextAffordableId !== null && (
        <Button
          label="Next affordable"
          onPress={() => selectNode(nextAffordableId)}
          testId={TREE_TEST_IDS.nextAffordable}
        />
      )}
    </div>
  )
}

function FilterChips() {
  const filters = useTreeScreenStore((state) => state.filters)
  const toggleFilter = useTreeScreenStore((state) => state.toggleFilter)
  return (
    <div className={styles.filters} role="group" aria-label="Filters">
      {TREE_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          className={styles.filter}
          aria-pressed={filters.includes(filter)}
          onClick={() => toggleFilter(filter)}
        >
          {FILTER_LABELS[filter]}
        </button>
      ))}
    </div>
  )
}
