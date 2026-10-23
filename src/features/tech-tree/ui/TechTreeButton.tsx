/**
 * The way into the tech tree: a HUD button, filed in the position slot and drawn bottom left,
 * that opens the base sheet on the Patent Office (ticket 687). On the shared Title+OneLine element
 * (spec #422, pass #428): the place's name as the title, the button its action. On the compact HUD
 * (#500) it is one glyph button at the end of the top row, out of the thumbs' zones; the sheet it
 * opens says its name.
 */
import { useGameStore } from '../../../store/gameStore'
import { inputLayerOf } from '../../../store/presentationSlice'
import { isGestureSurfaceShown } from '../../../systems/input/touchControls'
import { panelIconIdOf } from '../../../systems/art/icons/iconSet'
import type { HudDensity } from '../../../systems/views/screenLayout'
import type { ElementText } from '../../../systems/views/uiText'
import { hudBoxOf } from '../../../ui/hud/hudBoxes'
import { useHudDensity } from '../../../ui/hud/useHudDensity'
import { Button } from '../../../ui/kit/Button'
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import { VectorIcon } from '../../../ui/VectorIcon'
import { PATENT_OFFICE_TAB, PATENT_OFFICE_TAB_ID } from './patentOfficeTab'
import styles from './TechTreeButton.module.css'

const BUTTON_TEXT: ElementText = {
  id: 'tech-tree.open',
  title: PATENT_OFFICE_TAB.title,
  oneLine: '',
  tooltipLines: [],
}

/** The upgrades panel's glyph: the set has no tree glyph of its own yet. */
const TECH_TREE_ICON_ID = panelIconIdOf('upgrades')

export function TechTreeButton() {
  const openSheet = useGameStore((state) => state.openSheet)
  const density = useHudDensity()
  // The touch gesture surface lies over the whole HUD while driving; the button rises over it,
  // as the strip's gear does (ticket 684), or a phone tap never reaches it.
  const isRaised = useGameStore((state) =>
    isGestureSurfaceShown(state.isTouchControlsShown, inputLayerOf(state)),
  )
  return (
    <TechTreeButtonView
      density={density}
      isRaised={isRaised}
      onOpen={() => openSheet(PATENT_OFFICE_TAB_ID)}
    />
  )
}

/** The button for one HUD density; a server render draws it from props alone. */
export function TechTreeButtonView({
  density,
  isRaised = false,
  onOpen,
}: {
  density: HudDensity
  isRaised?: boolean
  onOpen: () => void
}) {
  return (
    <div
      className={styles.slot}
      data-testid="tech-tree-open"
      data-raised={isRaised || undefined}
      {...hudBoxOf('tech-tree')}
    >
      {density === 'compact' ? <CompactOpener onOpen={onOpen} /> : <FullOpener onOpen={onOpen} />}
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
