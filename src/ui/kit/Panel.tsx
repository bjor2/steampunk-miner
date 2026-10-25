/**
 * The UI kit's one surface: a brass-framed panel, its title with a glyph of the icon set (#158).
 * With a `heading` the header is the shared Title+OneLine element (spec #422, build #423): the
 * same title, one sentence under it, its icon-and-value facts and a brass tooltip, recorded for
 * the text budget. `frame` picks the border: the hairline inside a screen, or the baked sheet
 * frame (#683, `art.sheetFrame`) round a panel that stands alone over the play view (ticket 885).
 */
import type { ReactNode } from 'react'
import type { UiTextUnderTitle } from '../../systems/views/uiText'
import { VectorIcon } from '../VectorIcon'
import type { IconValue } from './IconFacts'
import styles from './Panel.module.css'
import { TitleOneLine } from './TitleOneLine'

/** `hairline`: a panel inside a screen; `sheet`: the baked riveted frame of a standalone plate. */
export type PanelFrame = 'hairline' | 'sheet'

const NO_FACTS: readonly IconValue[] = []

export function Panel({
  title,
  iconId = null,
  heading = null,
  facts = NO_FACTS,
  frame = 'hairline',
  children,
}: {
  title: string
  iconId?: string | null
  heading?: UiTextUnderTitle | null
  /** The heading's facts; drawn only with a `heading`. */
  facts?: readonly IconValue[]
  frame?: PanelFrame
  children: ReactNode
}) {
  return (
    <section className={styles.panel} data-frame={frame}>
      <PanelHeader title={title} iconId={iconId} heading={heading} facts={facts} />
      {children}
    </section>
  )
}

function PanelHeader({
  title,
  iconId,
  heading,
  facts,
}: {
  title: string
  iconId: string | null
  heading: UiTextUnderTitle | null
  facts: readonly IconValue[]
}) {
  if (heading === null) return <PlainTitle title={title} iconId={iconId} />
  return <TitleOneLine text={{ ...heading, title }} iconId={iconId} facts={facts} level="h2" />
}

function PlainTitle({ title, iconId }: { title: string; iconId: string | null }) {
  return (
    <h2 className={styles.title}>
      {iconId !== null && <VectorIcon iconId={iconId} size="menu" />}
      {title}
    </h2>
  )
}
