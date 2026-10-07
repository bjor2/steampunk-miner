/**
 * The sell burst slice (#176, spec #171): ore chunks fly up from the Sell shop, coins burst out of
 * its stack and stream to the bay's money counter, which rolls as they land, and a lining bill
 * peels coins off to a `Lining −X` tag. Presentation only: it hears the authority's sales and
 * never writes state. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'sell-burst',
  register() {},
}
