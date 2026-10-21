/**
 * The edge gauge (spec #678, ticket 684; docs/ui/design-system.md sections 9 and 10): a 4 px brass
 * trough in the right edge lane, spanning the middle band, the surface at its head and the core
 * at its foot, with the rig's mark between. No number: the depth is the strip's. Its own reserved
 * box (`edge-gauge`), clear of the band's lanes, so it never covers the drill head.
 */
import type { CSSProperties } from 'react'
import { readoutTextOf } from '../../systems/views/hudCallouts'
import { UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import { hudBoxOf } from './hudBoxes'
import styles from './EdgeGauge.module.css'

const EDGE_TEXT = readoutTextOf('hud.edge-gauge', 'To the core')

const PERMILLE = 1000

export function EdgeGauge({ permille }: { permille: number }) {
  return (
    <div className={styles.edge} {...hudBoxOf('edge-gauge')}>
      <TitleOneLine text={EDGE_TEXT} level="span" titlePlace="card">
        <span
          className={styles.trough}
          data-testid={UI_IDS.hudEdgeGauge}
          data-permille={permille}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={PERMILLE}
          aria-valuenow={permille}
          style={markStyleOf(permille)}
        >
          <span className={styles.mark} />
        </span>
      </TitleOneLine>
    </div>
  )
}

function markStyleOf(permille: number): CSSProperties {
  return { '--mark': permille / PERMILLE } as CSSProperties
}
