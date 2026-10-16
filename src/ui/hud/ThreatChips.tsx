/**
 * The upright phone's threats (#486): held upright the vehicle leans across nearly the whole play
 * view, so a marker at the screen's edge would sit where the vehicle goes. Each threat is a chip in
 * the HUD's rows instead: the enemy family's icon, the arc letter and the compass arrow pointing
 * where it is (the dock arrow's turn), the same reading as the edge marker (`ThreatMarkers`).
 */
import { readoutTextOf } from '../../systems/views/hudCallouts'
import type { ThreatMarker } from '../../systems/views/threatMarkers'
import { UI_ID_TEMPLATES } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import { CompassArrow } from './CompassArrow'
import { hudBoxOf } from './hudBoxes'
import styles from './Hud.module.css'

export function ThreatChips({ threats }: { threats: readonly ThreatMarker[] }) {
  return (
    <>
      {threats.map((threat, index) => (
        <span
          key={index}
          className={styles.threatChip}
          {...hudBoxOf('threat')}
          data-testid={UI_ID_TEMPLATES.hudThreat(index)}
          data-kind={threat.kind}
          data-octant={threat.octant}
          data-arc={threat.arc}
          data-ticks-left={threat.ticksLeft}
          data-tremor={threat.isTremor || undefined}
        >
          <TitleOneLine
            text={readoutTextOf(`hud.threat.${index}`, threat.arc)}
            iconId={threat.iconId}
            level="span"
            layout="row"
            glyphSize="hud"
          >
            <CompassArrow octant={threat.octant} />
          </TitleOneLine>
        </span>
      ))}
    </>
  )
}
