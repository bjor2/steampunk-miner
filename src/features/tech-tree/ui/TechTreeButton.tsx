/**
 * The way into the tech tree: a HUD button, filed in the position slot and drawn bottom left,
 * that asks the kernel to open the tree screen. On the shared Title+OneLine element (spec #422,
 * pass #428): the tree's name as the title, the button its action. On the compact HUD (#500) it
 * is one glyph button at the end of the top row, out of the thumbs' zones; the tree screen it
 * opens says its name.
 */
import { useGameStore } from '../../../store/gameStore'
import { panelIconIdOf } from '../../../systems/art/icons/iconSet'
import type { ElementText } from '../../../systems/views/uiText'
import { hudBoxOf } from '../../../ui/hud/hudBoxes'
import { useHudDensity } from '../../../ui/hud/useHudDensity'
import { Button } from '../../../ui/kit/Button'
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import { VectorIcon } from '../../../ui/VectorIcon'
import { TECH_TREE_SCREEN_ID } from './TechTreeScreen'
import styles from './TechTreeButton.module.css'

const BUTTON_TEXT: ElementText = {
  id: 'tech-tree.open',
  title: 'Tech tree',
  oneLine: '',
  tooltipLines: [],
}

/** The upgrades panel's glyph: the set has no tree glyph of its own yet. */
const TECH_TREE_ICON_ID = panelIconIdOf('upgrades')

export function TechTreeButton() {
  const openScreen = useGameStore((state) => state.openScreen)
  const isCompact = useHudDensity() === 'compact'
  const openTree = () => openScreen(TECH_TREE_SCREEN_ID)
  return (
    <div className={styles.slot} data-testid="tech-tree-open" {...hudBoxOf('tech-tree')}>
      {isCompact ? <CompactOpener onOpen={openTree} /> : <FullOpener onOpen={openTree} />}
    </div>
  )
}

function FullOpener({ onOpen }: { onOpen: () => void }) {
  return (
    <TitleOneLine text={BUTTON_TEXT} level="span" layout="row" glyphSize="hud">
      <Button label="Open" onPress={onOpen} />
    </TitleOneLine>
  )
}

/** A glyph-only control, not the kit's labelled Button: the compact HUD shows no words (#500). */
function CompactOpener({ onOpen }: { onOpen: () => void }) {
  return (
    <TitleOneLine text={BUTTON_TEXT} level="span" glyphSize="hud" titlePlace="card">
      <button
        type="button"
        className={styles.glyphButton}
        aria-label={BUTTON_TEXT.title}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpen}
      >
        <VectorIcon iconId={TECH_TREE_ICON_ID} size="menu" />
      </button>
    </TitleOneLine>
  )
}
