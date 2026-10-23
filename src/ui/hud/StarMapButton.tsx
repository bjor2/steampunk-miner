/**
 * Desktop's star map button on the strip (spec #678, ticket 769): the compass, the brass tag of the
 * key that opens the map, and the star map's fuel wells (ticket 767) inside it, so a click on the
 * wells opens the map as M does. Desktop only, as the wells are; it reads the bindings in force,
 * so a rebinding shows at once.
 */
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { actionDefOf, ACTION_MAP } from '../../systems/input/actionMap'
import { starMapKeyLabelOf } from '../../systems/input/keyTags'
import { readoutTextOf } from '../../systems/views/hudCallouts'
import { useGameStore } from '../../store/gameStore'
import { UI_IDS } from '../ids'
import { KeyTag } from '../kit/KeyTag'
import { TitleOneLine } from '../kit/TitleOneLine'
import { FuelWells } from './FuelWells'
import styles from './StarMapButton.module.css'

const STAR_MAP_TITLE = actionDefOf(ACTION_MAP, 'open_star_map').displayName
const STAR_MAP_TEXT = readoutTextOf('hud.strip.star-map', STAR_MAP_TITLE)
const COMPASS_ICON_ID = hudLabelIconIdOf('compass')

export function StarMapButton({ fuelCostChars }: { fuelCostChars: number }) {
  const keyLabel = useGameStore((state) => starMapKeyLabelOf(state.bindings))
  const isOpen = useGameStore((state) => state.isStarMapOpen)
  const toggleStarMap = useGameStore((state) => state.toggleStarMap)
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={STAR_MAP_TITLE}
      aria-pressed={isOpen}
      data-testid={UI_IDS.hudStarMapButton}
      onClick={toggleStarMap}
    >
      <TitleOneLine
        text={STAR_MAP_TEXT}
        iconId={COMPASS_ICON_ID}
        level="span"
        layout="row"
        glyphSize="menu"
        titlePlace="card"
      >
        {keyLabel !== null && <KeyTag label={keyLabel} place="inline" />}
        <FuelWells fuelCostChars={fuelCostChars} />
      </TitleOneLine>
    </button>
  )
}
