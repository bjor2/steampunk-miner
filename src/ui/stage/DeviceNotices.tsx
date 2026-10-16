/**
 * The device's notice chips (#470 P1-7, ticket 478): Reconnecting while the canvas has lost its
 * WebGL context, Tap for sound while a gesture left the audio context suspended. Over the HUD and
 * the menus, under the unsupported-device card; they take no tap, so the tap that resumes the
 * sound reaches the page as any other gesture does.
 */
import { useGameStore } from '../../store/gameStore'
import { deviceNoticesOf } from '../../systems/views/deviceNotices'
import { TitleOneLine } from '../kit/TitleOneLine'
import { DEVICE_UI_IDS } from './deviceIds'
import styles from './DeviceNotices.module.css'

export function DeviceNotices() {
  const isRenderContextLost = useGameStore((state) => state.isRenderContextLost)
  const soundUnlock = useGameStore((state) => state.soundUnlock)
  const notices = deviceNoticesOf({ isRenderContextLost, soundUnlock })
  if (notices.length === 0) return null
  return (
    <div className={styles.notices} data-testid={DEVICE_UI_IDS.deviceNotices}>
      {notices.map((text) => (
        <div key={text.id} className={styles.chip}>
          <TitleOneLine text={text} level="span" layout="row" />
        </div>
      ))}
    </div>
  )
}
