/**
 * Travel with its fee, fragments and inline confirmation (or the end-of-slice card on the last
 * planet), undock and settings, the same at both bays (#33 section 6, #37), on one shared
 * Title+OneLine element (spec #422, pass #425): the fee and the fragments are glyph-and-value
 * facts, the controls its actions.
 */
import type { BayFooter as Footer, TravelReading } from '../../systems/views/bayFrame'
import type { BayId } from '../../systems/world/dockBays'
import { UI_IDS } from '../ids'
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
        <ScreenButtonView button={footer.undock} focusedId={focusedId} />
        <ScreenButtonView button={footer.settings} focusedId={focusedId} />
      </TitleOneLine>
    </footer>
  )
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
