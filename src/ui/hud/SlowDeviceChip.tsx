/**
 * The slow-device chip (ticket 480; TD point 5 and VS ruling 2 on #470): shown while the frame cap
 * has dropped more than 5% of the ticks for five seconds, so slow motion on a weak device is never
 * silent. It reads the store's flag, which `SlowDeviceWatch` follows from the live fixed step.
 */
import { useGameStore } from '../../store/gameStore'
import { calloutTextOf, SLOW_DEVICE_TEXT } from '../../systems/views/hudCallouts'
import { UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import styles from './Hud.module.css'

export function SlowDeviceChip() {
  const isShown = useGameStore((state) => state.isSlowDeviceChipShown)
  return isShown ? <SlowDeviceChipView /> : null
}

export function SlowDeviceChipView() {
  return (
    <div className={styles.slowDevice} data-testid={UI_IDS.hudSlowDevice}>
      <TitleOneLine
        text={calloutTextOf('hud.slow-device', SLOW_DEVICE_TEXT)}
        level="span"
        layout="row"
      />
    </div>
  )
}
