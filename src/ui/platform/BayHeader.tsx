/**
 * The bay's emblem and name, then money, planet, the core bay against the need, and the platform's
 * state (#33, #37), each a glyph of the icon set and its value (#158), on the shared
 * Title+OneLine element (spec #422, pass #425): numbers show as an icon plus a value, and the
 * header's tooltip names the glyphs in order, a line a tap opens on a phone (ticket 476: it was
 * each glyph's hover title, which touch never shows). Slice `header` bay panels draw just left of
 * the money (ticket 220).
 */
import type { ReactNode } from 'react'
import type { BayHeader as Header } from '../../systems/views/bayFrame'
import { UI_IDS } from '../ids'
import { Gauge } from '../kit/Gauge'
import { TitleOneLine } from '../kit/TitleOneLine'
import { bayPanelsOf } from '../registries/bayPanels'
import { VectorIcon } from '../VectorIcon'
import { bayFrameTextIdOf } from './bayTextIds'
import { MoneyCounter } from './MoneyCounter'
import styles from './Platform.module.css'

/** What the header's glyphs stand for, left to right. */
const GLYPH_NAMES_LINE = 'Glyphs: money, planet, core bay, platform state.'

export function BayHeader({ header }: { header: Header }) {
  const text = { id: bayFrameTextIdOf(header.bay, 'header'), title: header.bayName }
  return (
    <header className={styles.header}>
      <TitleOneLine
        text={{ ...text, oneLine: '', tooltipLines: [GLYPH_NAMES_LINE] }}
        iconId={header.emblemId}
        level="span"
      >
        <HeaderPanels />
        <GlyphField iconId={header.moneyIconId}>
          <MoneyCounter wallet={header.money} />
        </GlyphField>
        <GlyphField iconId={header.planetIconId}>
          <span data-testid={UI_IDS.platformPlanet}>{header.planet}</span>
        </GlyphField>
        <Gauge
          label="Core bay"
          reading={header.coreBay}
          gaugeId={UI_IDS.platformCoreBayGauge}
          textId={UI_IDS.platformCoreBay}
        />
        <GlyphField iconId={header.platformStateIconId}>
          <span data-testid={UI_IDS.platformState} data-state={header.platformState}>
            {header.platformStateText}
          </span>
        </GlyphField>
      </TitleOneLine>
    </header>
  )
}

function HeaderPanels() {
  return (
    <>
      {bayPanelsOf('header').map(({ id, Panel }) => (
        <Panel key={id} />
      ))}
    </>
  )
}

/** A value beside its glyph; the header's tooltip line names the glyph, not a word on screen. */
function GlyphField({ iconId, children }: { iconId: string; children: ReactNode }) {
  return (
    <span className={styles.field}>
      <VectorIcon iconId={iconId} size="menu" />
      {children}
    </span>
  )
}

export function Field({
  label,
  iconId = null,
  children,
}: {
  label: string
  iconId?: string | null
  children: ReactNode
}) {
  return (
    <span className={styles.field}>
      <span className={styles.fieldLabel}>
        {iconId !== null && <VectorIcon iconId={iconId} size="menu" />}
        {label}
      </span>
      {children}
    </span>
  )
}
