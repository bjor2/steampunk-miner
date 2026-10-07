/**
 * The way into the tech tree: a HUD button, filed in the position slot and drawn bottom left,
 * that asks the kernel to open the tree screen.
 */
import { useGameStore } from '../../../store/gameStore'
import { Button } from '../../../ui/kit/Button'
import { TECH_TREE_SCREEN_ID } from './TechTreeScreen'
import styles from './TechTreeButton.module.css'

export function TechTreeButton() {
  const openScreen = useGameStore((state) => state.openScreen)
  return (
    <div className={styles.slot} data-testid="tech-tree-open">
      <Button label="Tech tree" onPress={() => openScreen(TECH_TREE_SCREEN_ID)} />
    </div>
  )
}
