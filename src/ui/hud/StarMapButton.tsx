/**
 * Desktop's star map button on the strip (spec #678, ticket 769): the star map glyph with its title
 * in words and the brass tag of the key that opens the map, then the star map's fuel wells (ticket
 * 767) inside it, so a click on the wells opens the map as M does. Ticket 792 made the title show
 * (it was out of sight, and the compass glyph read as a star) and rings the button while the star
 * map's first-time hint is up. Desktop only, as the wells are; a phone has `PhoneStarMapButton`.
 * It reads the bindings in force, so a rebinding shows at once.
 */
import { useGameStore } from '../../store/gameStore'
import { isStarMapHintedIn } from '../../store/screenModels'
import { starMapKeyLabelOf } from '../../systems/input/keyTags'
import { UI_IDS } from '../ids'
import { KeyTag } from '../kit/KeyTag'
import { TitleOneLine } from '../kit/TitleOneLine'
import { FuelWells } from './FuelWells'
import { STAR_MAP_ICON_ID, STAR_MAP_TEXT, STAR_MAP_TITLE } from './starMapButtonText'
import styles from './StarMapButton.module.css'

export function StarMapButton({ fuelCostChars }: { fuelCostChars: number }) {
  const keyLabel = useGameStore((state) => starMapKeyLabelOf(state.bindings))
  const isOpen = useGameStore((state) => state.isStarMapOpen)
  const isHinted = useGameStore(isStarMapHintedIn)
  const toggleStarMap = useGameStore((state) => state.toggleStarMap)
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={STAR_MAP_TITLE}
      aria-pressed={isOpen}
      data-testid={UI_IDS.hudStarMapButton}
      data-hinted={isHinted || undefined}
      onClick={toggleStarMap}
    >
      <TitleOneLine
        text={STAR_MAP_TEXT}
        iconId={STAR_MAP_ICON_ID}
        level="span"
        layout="row"
        glyphSize="menu"
      >
        {keyLabel !== null && <KeyTag label={keyLabel} place="inline" />}
        <FuelWells fuelCostChars={fuelCostChars} />
      </TitleOneLine>
    </button>
  )
}
