/**
 * One brass analogue gauge (#13 UI, #33 section 5): a needle and tick marks for the eye, the exact
 * number beside it for reading, `data-exact` for the canonical value. Hatched when the warning
 * is up, so the state never relies on colour.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { GaugeReading } from '../../systems/views/hudModel'
import styles from './Gauge.module.css'

/** The needle sweeps 240 degrees, from -120 (empty) to +120 (full). */
const SWEEP_DEGREES = 240

export function Gauge({
  label,
  reading,
  gaugeId,
  textId,
  isHatched = false,
  children,
}: {
  label: string
  reading: GaugeReading
  gaugeId: string
  textId: string
  isHatched?: boolean
  children?: ReactNode
}) {
  const needleStyle = needleStyleOf(reading.permille)
  return (
    <div className={styles.gauge}>
      <div
        className={styles.dial}
        data-testid={gaugeId}
        data-permille={reading.permille}
        data-hatched={isHatched || undefined}
      >
        <span className={styles.needle} style={needleStyle} />
      </div>
      <span className={styles.label}>{label}</span>
      <span className={styles.text} data-testid={textId} data-exact={reading.exact}>
        {reading.text}
      </span>
      {children}
    </div>
  )
}

function needleStyleOf(permille: number): CSSProperties {
  const degrees = (permille * SWEEP_DEGREES) / 1000 - SWEEP_DEGREES / 2
  return { transform: `rotate(${degrees}deg)` }
}
