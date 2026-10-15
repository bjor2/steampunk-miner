/**
 * The tree screen's controls (#161 section 4), on the shared Title+OneLine element (spec #422,
 * pass #426): the title, where you are and what you hold as glyph-and-value facts, then the zoom,
 * the search by node name, item or effect word, the filters, and the way back.
 */
import { hudLabelIconIdOf } from '../../../systems/art/icons/iconSet'
import { Button } from '../../../ui/kit/Button'
import { TitleOneLine, type IconValue } from '../../../ui/kit/TitleOneLine'
import { TREE_FILTERS, type TreeFilter, type TreeScreenModel } from '../systems/treeScreenModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import styles from './TreeHeader.module.css'

const HEADER_TEXT = { id: 'tech-tree.header', title: 'Tech tree', oneLine: '', tooltipLines: [] }

const FILTER_LABELS: Readonly<Record<TreeFilter, string>> = {
  available: 'Available',
  affordable: 'Affordable',
  locked: 'Locked',
  marks: 'Marks',
}

export function TreeHeader({
  model,
  onDismiss,
}: {
  model: TreeScreenModel
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
