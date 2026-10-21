/**
 * The gear button (spec #678, ticket 684; docs/ui/design-system.md section 10): the one control
 * that opens the strip's detail, every exact value and word the strip leaves out, and closes it
 * again. On a phone it sits in the thumb zone over the touch cluster, never in the top keep-out;
 * on desktop under the strip's right end. It is a cell of the design's slot grid (#691), so it is
 * the slot cell's size (44 px on a phone, 48 on desktop) and the button itself is the `gear` box.
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

export function HudGearButton({
  isOpen,
  isLeftHanded,
  isRaised,
}: {
  isOpen: boolean
  isLeftHanded: boolean
  isRaised: boolean
}) {
  const toggleHudDetail = useGameStore((state) => state.toggleHudDetail)
  return (
    <div
      className={styles.gear}
      data-hand={isLeftHanded ? 'left' : 'right'}
      data-raised={isRaised || undefined}
    >
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
