/**
 * A phone's star map button (ticket 792): Bjor could not find the map on his phone, where the only
 * way in was a faint glyph in the touch cluster that drew after the first touch. This one leads the
 * compact HUD's top row, at full strength with the star map glyph and the words "Star map", from
 * the run's first frame wherever M would open the map (`isStarMapButtonShown`). One tap opens the
 * map full screen (#757). It rises over the touch gesture surface as the Tech tree button does, and
 * rings while the star map's first-time hint is up.
 */
import { useGameStore } from '../../store/gameStore'
import { inputLayerOf } from '../../store/presentationSlice'
import { isStarMapHintedIn } from '../../store/screenModels'
import { isGestureSurfaceShown } from '../../systems/input/touchControls'
import { isStarMapButtonShown } from '../../systems/views/starMapEntry'
import { UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import { hudBoxOf } from './hudBoxes'
import { STAR_MAP_ICON_ID, STAR_MAP_TEXT, STAR_MAP_TITLE } from './starMapButtonText'
import styles from './PhoneStarMapButton.module.css'

export function PhoneStarMapButton() {
  const isShown = useGameStore((state) => isStarMapButtonShown(inputLayerOf(state)))
  const isRaised = useGameStore((state) =>
    isGestureSurfaceShown(state.isTouchControlsShown, inputLayerOf(state)),
  )
  const isHinted = useGameStore(isStarMapHintedIn)
  const toggleStarMap = useGameStore((state) => state.toggleStarMap)
  if (!isShown) return null
  return <PhoneStarMapButtonView isRaised={isRaised} isHinted={isHinted} onOpen={toggleStarMap} />
}

/** The button as drawn; a server render draws it from props alone. */
export function PhoneStarMapButtonView({
  isRaised = false,
  isHinted = false,
  onOpen,
}: {
  isRaised?: boolean
  isHinted?: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={STAR_MAP_TITLE}
      data-testid={UI_IDS.hudPhoneStarMapButton}
      data-raised={isRaised || undefined}
      data-hinted={isHinted || undefined}
      {...hudBoxOf('star-map')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onOpen}
    >
      <TitleOneLine
        text={STAR_MAP_TEXT}
        iconId={STAR_MAP_ICON_ID}
        level="span"
        layout="row"
        glyphSize="menu"
      />
    </button>
  )
}
