/**
 * The badge "n debug flags" (ticket 549, VS 2 and the #548 ruling on #547): on every screen the
 * session shows, the title included, while a debug session runs a flag off its default or
 * remembers one; it says when the remembered override runs over a loaded save. It takes no tap.
 */
import { readDevFlagBadge } from '../../store/devFlagReads'
import { useGameStore } from '../../store/gameStore'
import { TitleOneLine } from '../kit/TitleOneLine'
import { useScreenModel } from '../useScreenModel'
import { DEBUG_UI_IDS } from './debugUiIds'
import styles from './DevFlagBadge.module.css'

export function DevFlagBadge() {
  const isDebugSession = useGameStore((state) => state.isDevFlagSessionOn)
  return isDebugSession ? <SessionBadge /> : null
}

function SessionBadge() {
  const badge = useScreenModel(readDevFlagBadge)
  if (badge === null) return null
  return (
    <div className={styles.badge} data-testid={DEBUG_UI_IDS.devFlagBadge} data-count={badge.count}>
      <TitleOneLine
        text={{ id: 'debug.flag-badge', title: badge.title, oneLine: badge.note, tooltipLines: [] }}
        level="span"
        layout="row"
      />
    </div>
  )
}
