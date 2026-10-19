/**
 * One track's plaque around the showcase (#180 section 1; the GD's rules 1-5) on the shared
 * Title+OneLine element (spec #422, pass #425): its icon, name, the stat it buys as the one line,
 * level and price as glyph-and-value facts, the rivet pips toward the next big level, the line that
 * tempts, counts or says how a hold stopped, the held Buy, and the row's muted note (a worth-zero
 * engine, a hold past the planet's largest band, ticket 553); the flavour and the other stat lines
 * sit in the brass tooltip. Hovering, focusing or pressing it selects the track, which lights its
 * part and turns it toward the camera. The kernel row's #33 ids stay on the level and the price.
 * Once a describer answers, the plaque is the track's item card (#164): a tap opens its tooltip in
 * place and a tap on the open card buys one, as on every shop entry, while the hold runs on its
 * Buy. Markup only.
 */
import type { MouseEvent } from 'react'
import { readAuthorityTick, useGameStore } from '../../../store/gameStore'
import type { WorkshopRow } from '../../../systems/views/workshopRows'
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import { VectorIcon } from '../../../ui/VectorIcon'
import { useWorkshopStore } from '../store/workshopStore'
import { HoldBuyButton } from './HoldBuyButton'
import { PipRowView } from './PipRowView'
import { plaqueElementOf, plaqueEntryOf, plaqueFactsOf, type PlaqueEntry } from './plaqueEntry'
import { WORKSHOP_TEST_IDS } from './testIds'
import { usePlaqueLine } from './usePlaqueLine'
import styles from './TrackPlaque.module.css'

export function TrackPlaque({
  row,
  focusedId,
  moneyIconId,
}: {
  row: WorkshopRow
  focusedId: string
  /** The bay header's money glyph, so the price reads as a price. */
  moneyIconId: string
}) {
  const id = row.upgradeId
  const isSelected = useWorkshopStore((now) => now.selected === id)
  const { line, priceFlashKey } = usePlaqueLine(id)
  const entry = plaqueEntryOf(row, focusedId)
  const plaque = plaqueElementOf(row)
  return (
    <div
      className={styles.plaque}
      data-plaque={id}
      data-selected={isSelected || undefined}
      {...entry.attributes}
      data-buy-state={row.buyState}
      onPointerEnter={() => useWorkshopStore.getState().selectTrack(id, readAuthorityTick())}
      onMouseDown={keepFocusOnGame}
      onClick={() => tapPlaqueCard(entry, row.buy.id)}
    >
      <VectorIcon iconId={row.iconId} badge={row.badge} hasGlint={row.isBuyOpen} />
      <TitleOneLine
        text={plaque.text}
        facts={plaqueFactsOf(row, moneyIconId, priceFlashKey)}
        lockReason={plaque.lockReason}
        level="span"
        isTooltipHeldOpen={entry.isCardOpen}
      >
        <PipRowView step={row.level} testId={WORKSHOP_TEST_IDS.plaquePips(id)} />
        <div className={styles.footer}>
          <span
            className={styles.line}
            data-kind={line.kind}
            data-testid={WORKSHOP_TEST_IDS.plaqueLine(id)}
          >
            {line.text}
          </span>
          <HoldBuyButton
            button={row.buy}
            upgradeId={id}
            focusedId={focusedId}
            state={row.buyState}
            hasCard={entry.hasCard}
          />
        </div>
        {row.note !== null && (
          <p className={styles.note} data-testid={WORKSHOP_TEST_IDS.plaqueNote(id)}>
            {row.note}
          </p>
        )}
      </TitleOneLine>
    </div>
  )
}

/** The kernel compact card's tap (`tapItemCard`): opens the card, then buys one on the open card. */
function tapPlaqueCard(entry: PlaqueEntry, buyId: string): void {
  if (entry.hasCard) useGameStore.getState().tapItemCard(buyId)
}

/** A tap must not move the browser's focus off the game: the game owns menu focus. */
function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
