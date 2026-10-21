/**
 * The Hold tab of the base sheet (spec #678, ticket 688; #33 section 6, #8): one Sell card per held
 * ore tier, read by number and by its generated ore icon (#158), never colour alone, then Sell all.
 * Each card's figure is what it pays now; its line says how many are held at what each. A card is
 * greyed while the authority would refuse its sale (away from the Sell bay), and the pad and the
 * keys step over the cards as the store's menu focus. Markup only.
 */
import { useGameStore } from '../../store/gameStore'
import { readHoldSheetModel } from '../../store/screenReads'
import type { HoldSellAllCard, HoldSheet, HoldTierCard } from '../../systems/views/holdSheet'
import type { AmountReading, ScreenButton } from '../../systems/views/viewParts'
import { SheetCard } from '../kit/SheetCard'
import { useScreenModel } from '../useScreenModel'
import styles from './HoldSheetPanel.module.css'

export function HoldSheetPanel() {
  const hold = useScreenModel(readHoldSheetModel)
  const focusedId = useGameStore((state) => state.focusedControlId)
  return <HoldSheetView hold={hold} focusedId={focusedId} />
}

export function HoldSheetView({ hold, focusedId }: { hold: HoldSheet; focusedId: string | null }) {
  return (
    <div className={styles.cards}>
      {hold.tiers.map((card) => (
        <HoldTierCardView key={card.tier} card={card} focusedId={focusedId} />
      ))}
      <SellAllCardView card={hold.sellAll} focusedId={focusedId} />
    </div>
  )
}

function HoldTierCardView({ card, focusedId }: { card: HoldTierCard; focusedId: string | null }) {
  return (
    <SellCard
      button={card.sell}
      title={card.title}
      line={card.line}
      iconId={card.iconId}
      value={card.lineValue}
      focusedId={focusedId}
    />
  )
}

function SellAllCardView({ card, focusedId }: { card: HoldSellAllCard; focusedId: string | null }) {
  return (
    <SellCard
      button={card.sell}
      title={card.title}
      line={card.line}
      iconId={card.sell.iconId ?? null}
      value={card.value}
      focusedId={focusedId}
    />
  )
}

function SellCard({
  button,
  title,
  line,
  iconId,
  value,
  focusedId,
}: {
  button: ScreenButton
  title: string
  line: string
  iconId: string | null
  value: AmountReading
  focusedId: string | null
}) {
  return (
    <SheetCard
      text={{ id: button.id, title, line }}
      iconId={iconId}
      figure={<span data-exact={value.exact}>{value.text}</span>}
      isMuted={button.reason !== null}
      isFocused={focusedId === button.id}
      testId={button.id}
      onAct={() => useGameStore.getState().pressScreenButton(button.id)}
    />
  )
}
