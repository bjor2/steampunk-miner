/**
 * Travel with its fee, fragments and inline confirmation (or the end-of-slice card on the last
 * planet), undock and settings, the same at both bays (#33 section 6, #37).
 */
import type { BayFooter as Footer, TravelReading } from '../../systems/views/bayFrame'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './Platform.module.css'

export function BayFooter({ footer, focusedId }: { footer: Footer; focusedId: string }) {
  return (
    <footer className={styles.footer}>
      {footer.travel !== null && <TravelControl travel={footer.travel} focusedId={focusedId} />}
      {footer.hasEndCard && (
        <span data-testid={UI_IDS.platformEndCard}>
          End of the slice: the last planet of this build.
        </span>
      )}
      <ScreenButtonView button={footer.undock} focusedId={focusedId} />
      <ScreenButtonView button={footer.settings} focusedId={focusedId} />
    </footer>
  )
}

function TravelControl({ travel, focusedId }: { travel: TravelReading; focusedId: string }) {
  return (
    <span className={styles.action}>
      <ScreenButtonView button={travel.button} focusedId={focusedId} state={travel.state} />
      <span data-testid={UI_IDS.platformTravelFee} data-exact={travel.fee.exact}>
        {travel.fee.text}
      </span>
      <span data-testid={UI_IDS.platformTravelFragments}>{travel.fragmentsText}</span>
      {travel.isArmed && (
        <strong data-testid={UI_IDS.platformTravelConfirm}>
          Spends the fragments for good: press again to travel
        </strong>
      )}
    </span>
  )
}
