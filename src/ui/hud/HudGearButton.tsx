/**
 * The gear button (spec #678, ticket 684; docs/ui/design-system.md section 10): the one control
 * that opens the strip's detail, every exact value and word the strip leaves out, and closes it
 * again. It is the last cell of the tool slot bar's grid (ticket 691), in the thumb zone on a
 * phone and never in the top keep-out, so it is the slot cell's size (44 px on a phone, 48 on
 * desktop) and the button itself is the `gear` box; the bar places and mirrors it.
 * The baked gear plate (`--art-gear-button`, ticket 683) is its face, pressed while the detail is
 * open. A press changes UI state only.
 */
import { useGameStore } from '../../store/gameStore'
import { readoutTextOf } from '../../systems/views/hudCallouts'
import { UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import { hudBoxOf } from './hudBoxes'
import styles from './HudGearButton.module.css'

export const GEAR_TEXT = readoutTextOf('hud.gear', 'Gauges')

export function HudGearButton({ isOpen }: { isOpen: boolean }) {
  const toggleHudDetail = useGameStore((state) => state.toggleHudDetail)
  return (
    <div className={styles.gear}>
      <TitleOneLine text={GEAR_TEXT} level="span" titlePlace="card">
        <button
          type="button"
          className={styles.button}
          {...hudBoxOf('gear')}
          data-testid={UI_IDS.hudGear}
          aria-label={GEAR_TEXT.title}
          aria-expanded={isOpen}
          aria-controls={UI_IDS.hudDetail}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleHudDetail}
        />
      </TitleOneLine>
    </div>
  )
}
