/**
 * The one Title+OneLine element (spec #422 ruling 1, build #423) that a card, node, button, row or
 * panel header draws: a title of at most 4 words, ONE sentence of about 12 words, then the facts
 * the player acts on as an icon plus a value (price, cost) and why it is locked, all visible on
 * the element; anything longer sits in the brass tooltip. It records what it draws in the text
 * registry, every fact and lock reason tagged visible and every tooltip line tagged tooltip, so
 * the budget test (#424) reads the screens as shown.
 */
import type { ReactNode } from 'react'
import {
  elementLinesOf,
  recordUiText,
  type ElementText,
  type UiTextHolds,
} from '../../systems/views/uiText'
import { VectorIcon, type IconSize } from '../VectorIcon'
import { AmountText } from './AmountText'
import styles from './TitleOneLine.module.css'
import { Tooltip } from './Tooltip'

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
}

/** `h1` is the game's name on the title screen; panels use `h2`, cards `h3`, rows `span`. */
export type TitleLevel = 'h1' | 'h2' | 'h3' | 'span'

/** `stack` puts the lines under the title; `row` sets title and values on one line (a HUD row). */
export type ElementLayout = 'stack' | 'row'

/** The glyphs' size: `menu` in menus and cards, `hud` on the in-run HUD (#158 sizes). */
export type GlyphSize = Extract<IconSize, 'menu' | 'hud'>

const NO_FACTS: readonly IconValue[] = []

export function TitleOneLine({
  text,
  iconId = null,
  facts = NO_FACTS,
  lockReason = null,
  level = 'h3',
  layout = 'stack',
  glyphSize = 'menu',
  isTooltipHeldOpen = false,
  children,
}: {
  text: ElementText
  iconId?: string | null
  facts?: readonly IconValue[]
  /** Why the element is locked, kept on the element itself; null when it is open. */
  lockReason?: string | null
  level?: TitleLevel
  layout?: ElementLayout
  glyphSize?: GlyphSize
  /** The game's menu focus is on the element: its tooltip shows as keyboard focus would (#164). */
  isTooltipHeldOpen?: boolean
  /** The element's action, drawn under its lines. */
  children?: ReactNode
}) {
  recordUiText({ ...text, lines: elementLinesOf(text, facts, lockReason) })
  return (
    <Tooltip id={text.id} lines={text.tooltipLines} isHeldOpen={isTooltipHeldOpen}>
      <div
        className={styles.element}
        data-ui-text={text.id}
        data-locked={lockReason !== null || undefined}
        data-layout={layout}
      >
        <TitleRow title={text.title} iconId={iconId} level={level} glyphSize={glyphSize} />
        {text.oneLine !== '' && <p className={styles.oneLine}>{text.oneLine}</p>}
        {facts.length > 0 && <FactRow facts={facts} glyphSize={glyphSize} />}
        {lockReason !== null && (
          <p className={styles.lock} data-lock-reason>
            {lockReason}
          </p>
        )}
        {children}
      </div>
    </Tooltip>
  )
}

function TitleRow({
  title,
  iconId,
  level: Heading,
  glyphSize,
}: {
  title: string
  iconId: string | null
  level: TitleLevel
  glyphSize: GlyphSize
}) {
  return (
    <Heading className={styles.title}>
      {iconId !== null && <VectorIcon iconId={iconId} size={glyphSize} />}
      {title}
    </Heading>
  )
}

function FactRow({ facts, glyphSize }: { facts: readonly IconValue[]; glyphSize: GlyphSize }) {
  return (
    <p className={styles.facts}>
      {facts.map((fact) => (
        <span
          key={`${fact.iconId}:${fact.text}:${fact.flashKey ?? ''}`}
          className={styles.fact}
          data-testid={fact.testId}
          data-exact={fact.exact}
          data-money-short={fact.isMoneyShort || undefined}
          data-flash={fact.flashKey !== undefined || undefined}
        >
          <VectorIcon iconId={fact.iconId} size={glyphSize} />
          <AmountText text={fact.text} exact={fact.exact} />
        </span>
      ))}
    </p>
  )
}
