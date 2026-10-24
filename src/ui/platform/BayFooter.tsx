/**
 * Travel with its fee, fragments and inline confirmation (or the end-of-slice card on the last
 * planet), undock and settings, the same at both bays (#33 section 6, #37), on one shared
 * Title+OneLine element (spec #422, pass #425): the fee and the fragments are glyph-and-value
 * facts, the controls its actions. On desktop Undock wears the brass tag of the Dock key that
 * presses it from the bay (ticket 794).
 */
import { useGameStore } from '../../store/gameStore'
import { undockKeyLabelOf } from '../../systems/input/keyTags'
import type { BayFooter as Footer, TravelReading } from '../../systems/views/bayFrame'
import { layoutKindOf } from '../../systems/views/designSystem'
import type { ScreenButton } from '../../systems/views/viewParts'
import type { BayId } from '../../systems/world/dockBays'
import { useHudDensity } from '../hud/useHudDensity'
import { UI_IDS } from '../ids'
import { KeyTag } from '../kit/KeyTag'
import { TitleOneLine } from '../kit/TitleOneLine'
import { ScreenButtonView } from '../ScreenButtonView'
import { bayFrameTextIdOf } from './bayTextIds'
import { travelFactsOf } from './travelFacts'
import styles from './Platform.module.css'

/** The footer's title: where its controls take the vehicle. */
const FOOTER_TITLE = 'Depart'

export function BayFooter({
  bay,
  footer,
  focusedId,
}: {
  bay: BayId
  footer: Footer
  focusedId: string
}) {
  const text = { id: bayFrameTextIdOf(bay, 'footer'), title: FOOTER_TITLE }
  return (
    <footer className={styles.footer}>
      <TitleOneLine
        text={{ ...text, oneLine: '', tooltipLines: [] }}
        facts={travelFactsOf(footer.travel)}
        level="span"
      >
        {footer.travel !== null && <TravelControl travel={footer.travel} focusedId={focusedId} />}
        {footer.hasEndCard && (
          <span data-testid={UI_IDS.platformEndCard}>
            End of the slice: the last planet of this build.
          </span>
        )}
        <UndockControl button={footer.undock} focusedId={focusedId} />
        <ScreenButtonView button={footer.settings} focusedId={focusedId} />
      </TitleOneLine>
    </footer>
  )
}

function UndockControl({ button, focusedId }: { button: ScreenButton; focusedId: string }) {
  const keyLabel = useUndockKeyLabel()
  return (
    <span className={styles.undock}>
      <ScreenButtonView button={button} focusedId={focusedId} />
      {keyLabel !== null && <KeyTag label={keyLabel} place="inline" />}
    </span>
  )
}

/** Desktop's key tag on Undock; none on a phone, which taps the cluster's Dock button. */
function useUndockKeyLabel(): string | null {
  const keyLabel = useGameStore((state) => undockKeyLabelOf(state.bindings))
  const isDesktop = layoutKindOf(useHudDensity()) === 'desktop'
  return isDesktop ? keyLabel : null
}

function TravelControl({ travel, focusedId }: { travel: TravelReading; focusedId: string }) {
  return (
    <span className={styles.action}>
      <ScreenButtonView button={travel.button} focusedId={focusedId} state={travel.state} />
      {travel.isArmed && (
        <strong data-testid={UI_IDS.platformTravelConfirm}>
          Spends the fragments for good: press again to travel
        </strong>
      )}
    </span>
  )
}
