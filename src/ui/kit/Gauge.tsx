/**
 * One brass analogue gauge (#13 UI, #33 section 5): a needle and tick marks for the eye, the exact
 * number beside it for reading, `data-exact` for the canonical value, and the gauge's glyph on
 * the label so the gauges are told apart by more than their place (#158). Hatched when the
 * warning is up, so the state never relies on colour.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { GaugeReading } from '../../systems/views/hudModel'
import { VectorIcon } from '../VectorIcon'
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
  return (
    <div className={styles.gauge}>
      <GaugeDial reading={reading} gaugeId={gaugeId} isHatched={isHatched} />
      <span className={styles.label}>
        <VectorIcon iconId={reading.iconId} size="hud" />
        {label}
      </span>
      <span className={styles.text} data-testid={textId} data-exact={reading.exact}>
        {reading.text}
      </span>
      {children}
    </div>
  )
}

/** The dial alone: needle and ticks, no text, for a view that draws the label and value itself. */
export function GaugeDial({
  reading,
  gaugeId,
  isHatched = false,
}: {
  reading: GaugeReading
  gaugeId: string
  isHatched?: boolean
}) {
  return (
    <div
      className={styles.dial}
      data-testid={gaugeId}
      data-permille={reading.permille}
      data-hatched={isHatched || undefined}
    >
      <span className={styles.needle} style={needleStyleOf(reading.permille)} />
    </div>
  )
}

function needleStyleOf(permille: number): CSSProperties {
  const degrees = (permille * SWEEP_DEGREES) / 1000 - SWEEP_DEGREES / 2
  return { transform: `rotate(${degrees}deg)` }
}
