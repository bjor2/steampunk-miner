/**
 * The brass gauge bar (spec #678, ticket 684; docs/ui/design-system.md sections 3 and 10): an
 * iron well in the baked brass bezel (`--art-gauge-bar`, ticket 683), filled with the colour of
 * what it measures, fraction only, never a number. Hatched while its reading stands in a tier of
 * the warning ladder, so the state never rests on colour alone, and its glyph pulses then (#685). Its name is the shared element's
 * title, out of sight beside the glyph (the strip shows no words), so assistive tech still reads it.
 */
import type { CSSProperties } from 'react'
import type { ElementText } from '../../systems/views/uiText'
import styles from './GaugeBar.module.css'
import { TitleOneLine } from './TitleOneLine'

/** Which gauge fill colour the bar takes (`--gauge-fill-*`). */
export type GaugeFill = 'hull' | 'fuel' | 'cargo' | 'heat'

export function GaugeBar({
  text,
  iconId,
  fill,
  fillPermille,
  tier,
  testId,
  isPulsing = false,
}: {
  text: ElementText
  iconId: string
  fill: GaugeFill
  /** 0..1000. */
  fillPermille: number
  /** The warning ladder's tier, `ok` above it. */
  tier: string
  testId: string
  /** The glyph pulses while a tier holds (ticket 685); off with flashes off. */
  isPulsing?: boolean
}) {
  return (
    <div
      className={styles.bar}
      data-gauge={fill}
      data-tier={tier}
      data-pulsing={isPulsing || undefined}
    >
      <TitleOneLine
        text={text}
        iconId={iconId}
        level="span"
        layout="row"
        glyphSize="menu"
        titlePlace="card"
      >
        <span
          className={styles.well}
          data-testid={testId}
          data-permille={fillPermille}
          data-tier={tier}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={PERMILLE}
          aria-valuenow={fillPermille}
        >
          <span className={styles.fill} style={fillStyleOf(fillPermille)} />
        </span>
      </TitleOneLine>
    </div>
  )
}

const PERMILLE = 1000

function fillStyleOf(permille: number): CSSProperties {
  return { '--fill': permille / PERMILLE } as CSSProperties
}
