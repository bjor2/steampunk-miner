/**
 * The UI kit's one surface: a brass-framed panel, its title with a glyph of the icon set (#158).
 * With a `heading` the header is the shared Title+OneLine element (spec #422, build #423): the
 * same title, one sentence under it and a brass tooltip, recorded for the text budget.
 */
import type { ReactNode } from 'react'
import type { UiTextUnderTitle } from '../../systems/views/uiText'
import { VectorIcon } from '../VectorIcon'
import styles from './Panel.module.css'
import { TitleOneLine } from './TitleOneLine'

export function Panel({
  title,
  iconId = null,
  heading = null,
  children,
}: {
  title: string
  iconId?: string | null
  heading?: UiTextUnderTitle | null
  children: ReactNode
}) {
  return (
    <section className={styles.panel}>
      <PanelHeader title={title} iconId={iconId} heading={heading} />
      {children}
    </section>
  )
}

function PanelHeader({
  title,
  iconId,
  heading,
}: {
  title: string
  iconId: string | null
  heading: UiTextUnderTitle | null
}) {
  if (heading === null) return <PlainTitle title={title} iconId={iconId} />
  return <TitleOneLine text={{ ...heading, title }} iconId={iconId} level="h2" />
}

function PlainTitle({ title, iconId }: { title: string; iconId: string | null }) {
  return (
    <h2 className={styles.title}>
      {iconId !== null && <VectorIcon iconId={iconId} size="menu" />}
      {title}
    </h2>
  )
}
