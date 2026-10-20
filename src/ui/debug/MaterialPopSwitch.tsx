/**
 * The material pop prototype's A/B switch on the debug flag panel (ticket 614, #442): one choice
 * per session, A by default, logged at every switch. Presentation only, so unlike the flags above
 * it never marks the run. Markup only.
 *
 * The choices are a one-off radio pair, as the flag rows' switch is: the kit's button has no
 * checked state for assistive tech to read.
 */
import type { MouseEvent } from 'react'
import { useGameStore } from '../../store/gameStore'
import { MATERIAL_POP_MODES, type MaterialPopMode } from '../../systems/materialPop/materialPopMode'
import { TitleOneLine } from '../kit/TitleOneLine'
import { DEBUG_UI_ID_TEMPLATES, DEBUG_UI_IDS } from './debugUiIds'
import styles from './DevFlagPanel.module.css'

const SWITCH_TEXT = {
  id: 'debug.material-pop',
  title: 'Material pop',
  oneLine:
    'A: the chip and the pickup sound only. B: a chunk pops from the cleared cell to the hold.',
  tooltipLines: [],
}

const SWITCH_NOTE = 'This session only; logged, never saved, and it changes nothing in the world.'

const MODE_NAMES: Record<MaterialPopMode, string> = { A: 'A: no pop', B: 'B: pop' }

export function MaterialPopSwitch() {
  const mode = useGameStore((state) => state.materialPopMode)
  return (
    <section className={styles.group} data-testid={DEBUG_UI_IDS.materialPopSwitch}>
      <h3 className={styles.groupTitle}>Prototype</h3>
      <div className={styles.row}>
        <TitleOneLine text={SWITCH_TEXT} level="span">
          <div className={styles.controls} role="radiogroup" aria-label={SWITCH_TEXT.title}>
            {MATERIAL_POP_MODES.map((choice) => (
              <ModeChoice key={choice} choice={choice} isChosen={choice === mode} />
            ))}
          </div>
        </TitleOneLine>
        <p className={styles.note}>{SWITCH_NOTE}</p>
      </div>
    </section>
  )
}

function ModeChoice({ choice, isChosen }: { choice: MaterialPopMode; isChosen: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isChosen}
      className={styles.switch}
      data-testid={DEBUG_UI_ID_TEMPLATES.materialPopChoice(choice)}
      onMouseDown={keepFocusOnGame}
      onClick={() => chooseMode(choice)}
    >
      {MODE_NAMES[choice]}
    </button>
  )
}

function chooseMode(choice: MaterialPopMode): void {
  useGameStore.getState().switchMaterialPopMode(choice, 'panel')
}

/** As the kit's button: a click never leaves the choice focused, so keys go back to the game. */
function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
