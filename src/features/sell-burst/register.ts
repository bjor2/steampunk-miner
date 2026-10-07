/**
 * The sell burst slice (#176, spec #171): ore chunks fly up from the Sell shop, coins burst out of
 * its stack and stream to the bay's money counter, which rolls as they land, and a lining bill
 * peels coins off to a `Lining −X` tag. Presentation only: it hears the authority's sales and
 * never writes state. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { sellBurstDebugActions } from './debug'
import { SellBurstPiece } from './scene/SellBurstPiece'
import { SELL_BURST_ATTACH_USES } from './scene/sellShopPoints'
import { CoinStream } from './ui/CoinStream'
import { LiningTag } from './ui/LiningTag'
import { SELL_BURST_MONEY_COUNTER } from './ui/shownMoneyCounter'

export const slice: SliceDefinition = {
  id: 'sell-burst',
  register(r) {
    r.worldPiece({ id: 'sell-burst.burst', layer: 'platform', Piece: SellBurstPiece })
    SELL_BURST_ATTACH_USES.forEach((use) => r.buildingAttachUse(use))
    r.moneyCounter(SELL_BURST_MONEY_COUNTER)
    r.bayPanel({ id: 'sell-burst.lining-tag', slot: 'header', Panel: LiningTag })
    r.bayPanel({ id: 'sell-burst.coin-stream', slot: 'above', Panel: CoinStream })
    // steampunkDebug.features['sell-burst'].getBurst()
    r.debugActions(sellBurstDebugActions)
  },
}
