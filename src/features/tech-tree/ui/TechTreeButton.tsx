/**
 * The way into the tech tree: a HUD button, filed in the position slot and drawn bottom left,
 * that asks the kernel to open the tree screen. On the shared Title+OneLine element (spec #422,
 * pass #428): the tree's name as the title, the button its action.
 */
import { useGameStore } from '../../../store/gameStore'
import type { ElementText } from '../../../systems/views/uiText'
import { Button } from '../../../ui/kit/Button'
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import { TECH_TREE_SCREEN_ID } from './TechTreeScreen'
import styles from './TechTreeButton.module.css'

const BUTTON_TEXT: ElementText = {
  id: 'tech-tree.open',
  title: 'Tech tree',
  oneLine: '',
  tooltipLines: [],
}

export function TechTreeButton() {
  const openScreen = useGameStore((state) => state.openScreen)
  return (
    <div className={styles.slot} data-testid="tech-tree-open">
      <TitleOneLine text={BUTTON_TEXT} level="span" layout="row" glyphSize="hud">
        <Button label="Open" onPress={() => openScreen(TECH_TREE_SCREEN_ID)} />
      </TitleOneLine>
    </div>
  )
}
