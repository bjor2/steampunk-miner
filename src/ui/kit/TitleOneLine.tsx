/**
 * The one Title+OneLine element (spec #422 ruling 1, build #423) that a card, node, button, row or
 * panel header draws: a title of at most 4 words, ONE sentence of about 12 words, then the facts
 * the player acts on as an icon plus a value (price, cost) and why it is locked, all visible on
 * the element; anything longer sits in the brass tooltip. It records what it draws in the text
 * registry, so the budget test (#424) reads the screens as shown.
 */
import type { ReactNode } from 'react'
import { recordUiText, type UiText } from '../../systems/views/uiText'
import { VectorIcon } from '../VectorIcon'
import styles from './TitleOneLine.module.css'
import { Tooltip } from './Tooltip'

/** A number on an element: its glyph and its value, never a sentence (GD ruling 1 on #422). */
export interface IconValue {
  iconId: string
  text: string
  /** The exact canonical amount behind a shortened value, for `data-exact`. */
  exact?: string
}

export type TitleLevel = 'h2' | 'h3' | 'span'

const NO_FACTS: readonly IconValue[] = []

export function TitleOneLine({
  text,
  iconId = null,
  facts = NO_FACTS,
  lockReason = null,
  level = 'h3',
  children,
}: {
  text: UiText
  iconId?: string | null
  facts?: readonly IconValue[]
  /** Why the element is locked, kept on the element itself; null when it is open. */
  lockReason?: string | null
  level?: TitleLevel
  /** The element's action, drawn under its lines. */
  children?: ReactNode
}) {
  recordUiText(text)
  return (
    <Tooltip id={text.id} lines={text.tooltipLines}>
      <div
        className={styles.element}
        data-ui-text={text.id}
        data-locked={lockReason !== null || undefined}
      >
        <TitleRow title={text.title} iconId={iconId} level={level} />
        {text.oneLine !== '' && <p className={styles.oneLine}>{text.oneLine}</p>}
        {facts.length > 0 && <FactRow facts={facts} />}
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
}: {
  title: string
  iconId: string | null
  level: TitleLevel
}) {
  return (
    <Heading className={styles.title}>
      {iconId !== null && <VectorIcon iconId={iconId} size="menu" />}
      {title}
    </Heading>
  )
}

function FactRow({ facts }: { facts: readonly IconValue[] }) {
  return (
    <p className={styles.facts}>
      {facts.map((fact) => (
        <span key={`${fact.iconId}:${fact.text}`} className={styles.fact} data-exact={fact.exact}>
          <VectorIcon iconId={fact.iconId} size="menu" />
          {fact.text}
        </span>
      ))}
    </p>
  )
}
