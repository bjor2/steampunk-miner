/**
 * A number as the kit draws it (GD ruling 1 on #422, spec #678): its glyph, then its value from
 * the shared formatter (#681), never a bare figure. The Title+OneLine element's fact row draws
 * these, and a screen that lists figures outside one (the artefact cards' stat rows, ticket 885)
 * draws the same `IconFact`. Each carries `data-fact`, which the brass crop check reads.
 */
import { VectorIcon, type IconSize } from '../VectorIcon'
import { AmountText } from './AmountText'
import styles from './IconFacts.module.css'
import { MiniGauge } from './MiniGauge'
import type { UiTextHolds } from '../../systems/views/uiText'

/** A number on an element: its glyph and its value, never a sentence (GD ruling 1 on #422). */
export interface IconValue {
  iconId: string
  text: string
  /** The exact canonical amount behind a shortened value, for `data-exact`. */
  exact?: string
  /** What the value is (a price, charges left), so the budget test keeps it off the tooltip. */
  holds?: UiTextHolds
  /** The spec hook on the value, a screen's #33 id. */
  testId?: string
  /** A price the wallet cannot pay: only the price turns red (#158). */
  isMoneyShort?: boolean
  /** Changes once per event the value flashes for; a new key redraws it, replaying the flash. */
  flashKey?: number
  /** A depth's way from the surface to the core, 0..1000, drawn as a mini gauge after the value. */
  gaugePermille?: number
}

/** The glyphs' size: `menu` in menus and cards, `hud` on the in-run HUD (#158 sizes). */
export type GlyphSize = Extract<IconSize, 'menu' | 'hud'>

export function IconFacts({
  facts,
  glyphSize = 'menu',
}: {
  facts: readonly IconValue[]
  glyphSize?: GlyphSize
}) {
  return (
    <p className={styles.facts}>
      {facts.map((fact) => (
        <IconFact
          key={`${fact.iconId}:${fact.text}:${fact.flashKey ?? ''}`}
          fact={fact}
          glyphSize={glyphSize}
        />
      ))}
    </p>
  )
}

export function IconFact({ fact, glyphSize = 'menu' }: { fact: IconValue; glyphSize?: GlyphSize }) {
  return (
    <span
      className={styles.fact}
      data-fact
      data-testid={fact.testId}
      data-exact={fact.exact}
      data-money-short={fact.isMoneyShort || undefined}
      data-flash={fact.flashKey !== undefined || undefined}
    >
      <VectorIcon iconId={fact.iconId} size={glyphSize} />
      <AmountText text={fact.text} exact={fact.exact} />
      {fact.gaugePermille !== undefined && <MiniGauge permille={fact.gaugePermille} />}
    </span>
  )
}
