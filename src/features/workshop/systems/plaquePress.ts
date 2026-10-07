/**
 * What a press on a plaque's Buy does (the GD's input rules on #164, with #180 section 2): the
 * plaque is the track's shop entry, drawn as its item card, and its Buy is where a hold runs. On
 * touch, the first press on the Buy of a closed card only opens the card; a press on the open
 * card's Buy buys one and holds on the curve. A mouse press always buys and holds, as the click on
 * a Buy did before the card. A refused Buy (#33 `data-reason`) never sends a step.
 */
export interface PlaquePointer {
  isTouch: boolean
  /** The game's menu focus is on this plaque, so its card is drawn open. */
  isCardOpen: boolean
  /** A describer answers for the track (#164); without one there is no card to open first. */
  hasCard: boolean
  /** The kernel row's Buy is not refused. */
  isBuyOpen: boolean
}

export type PlaquePress = 'open_card' | 'buy_and_hold'

export function plaquePressOf(pointer: PlaquePointer): PlaquePress {
  if (!pointer.isBuyOpen || isFirstTapOnClosedCard(pointer)) return 'open_card'
  return 'buy_and_hold'
}

function isFirstTapOnClosedCard({ isTouch, isCardOpen, hasCard }: PlaquePointer): boolean {
  return isTouch && hasCard && !isCardOpen
}
