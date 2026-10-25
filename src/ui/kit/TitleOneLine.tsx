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
  type UiTextTitlePlace,
} from '../../systems/views/uiText'
import { VectorIcon } from '../VectorIcon'
import { IconFacts, type GlyphSize, type IconValue } from './IconFacts'
import styles from './TitleOneLine.module.css'
import { Tooltip } from './Tooltip'

export type { GlyphSize, IconValue }

/** `h1` is the game's name on the title screen; panels use `h2`, cards `h3`, rows `span`. */
export type TitleLevel = 'h1' | 'h2' | 'h3' | 'span'

/** `stack` puts the lines under the title; `row` sets title and values on one line (a HUD row). */
export type ElementLayout = 'stack' | 'row'

const NO_FACTS: readonly IconValue[] = []

export function TitleOneLine({
  text,
  iconId = null,
  facts = NO_FACTS,
  lockReason = null,
  level = 'h3',
  layout = 'stack',
  glyphSize = 'menu',
  titlePlace = 'element',
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
  /**
   * `card`: the compact HUD (#500) draws the glyph and values only; the title stays in the markup
   * for assistive tech, out of sight, and shows in the card a tap on the box opens.
   */
  titlePlace?: UiTextTitlePlace
  /** The game's menu focus is on the element: its tooltip shows as keyboard focus would (#164). */
  isTooltipHeldOpen?: boolean
  /** The element's action, drawn under its lines. */
  children?: ReactNode
}) {
  recordUiText({ ...text, lines: elementLinesOf(text, facts, lockReason), ...placeOf(titlePlace) })
  return (
    <Tooltip id={text.id} lines={text.tooltipLines} isHeldOpen={isTooltipHeldOpen}>
      <div
        className={styles.element}
        data-ui-text={text.id}
        data-locked={lockReason !== null || undefined}
        data-layout={layout}
        data-title-place={titlePlace === 'card' ? 'card' : undefined}
      >
        <TitleRow
          title={text.title}
          iconId={iconId}
          level={level}
          glyphSize={glyphSize}
          isInCard={titlePlace === 'card'}
        />
        {text.oneLine !== '' && <p className={styles.oneLine}>{text.oneLine}</p>}
        {facts.length > 0 && <IconFacts facts={facts} glyphSize={glyphSize} />}
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
  isInCard,
}: {
  title: string
  iconId: string | null
  level: TitleLevel
  glyphSize: GlyphSize
  isInCard: boolean
}) {
  return (
    <Heading className={styles.title}>
      {iconId !== null && <VectorIcon iconId={iconId} size={glyphSize} />}
      {isInCard ? <span className={styles.titleWords}>{title}</span> : title}
    </Heading>
  )
}

/** The registry keeps the default place implicit, so every other element records as before. */
function placeOf(titlePlace: UiTextTitlePlace): { titlePlace?: UiTextTitlePlace } {
  return titlePlace === 'element' ? {} : { titlePlace }
}
