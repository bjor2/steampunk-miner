/**
 * Overpressure's toggle on the HUD (ticket 388): a brass switch in the `gauges` slot, on every
 * device, shown only while the turret carries a live Overpressure burst. Its state is in its label
 * and `aria-pressed`, so colour never says it alone; the vent shows as its own word. A one-off
 * button rather than the kit's: the kit's `Button` carries no pressed state or test id.
 */
import { useScreenModel } from '../../../ui/useScreenModel'
import { readBurstToggle, toggleOverpressure } from '../store/burstInput'
import type { BurstToggleModel } from '../systems/burstToggle'
import styles from './BurstToggle.module.css'

export const BURST_TOGGLE_TEST_ID = 'ground-gun-burst-toggle'

const PHASE_WORDS: Readonly<Record<BurstToggleModel['phase'], string>> = {
  burst: 'bursting',
  vent: 'venting',
  none: 'idle',
}

export function BurstToggle() {
  const toggle = useScreenModel(readBurstToggle)
  if (toggle === null) return null
  return <BurstToggleView toggle={toggle} />
}

export function BurstToggleView({ toggle }: { toggle: BurstToggleModel }) {
  const label = `Overpressure ${toggle.isOn ? 'on' : 'off'}, ${PHASE_WORDS[toggle.phase]}`
  return (
    <button
      type="button"
      className={styles.toggle}
      data-testid={BURST_TOGGLE_TEST_ID}
      data-phase={toggle.phase}
      aria-pressed={toggle.isOn}
      aria-label={label}
      title={label}
      onMouseDown={keepFocusOnGame}
      onClick={toggleOverpressure}
    >
      Overpressure
    </button>
  )
}

/** As the kit's button: a click never leaves it focused, so Space goes back to the game. */
function keepFocusOnGame(event: { preventDefault(): void }): void {
  event.preventDefault()
}
