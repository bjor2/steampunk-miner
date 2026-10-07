# Sell burst review clips (#176)

The Game Director's clip set for the sell burst (spec #171 acceptance, lining clip from G&V on
#176), for sign-off before the slice merges. Each clip opens on the open Sell bay a few seconds before
the sale (the software renderer lags the sale behind the cut) and runs to the end of the burst
and its lining tag. Recorded headless on the preview build with software WebGL, so the
frame rate is low and uneven; the burst itself runs on authority ticks, so its timing in a real
browser is the 1.5 s of `sellBurst.json`.

| Clip                 | Sale                                       | What to look for                                                     |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| `*-small.webm`       | 1 tile of planet 1 ore, 3 coins            | the floor of 3 coins, one peeled to the tag                          |
| `*-big-flare.webm`   | 4 tiles of planet 8 ore, 40 coins          | the cap of 40 coins and the gold flare over the stack                |
| `*-merged.webm`      | tier 1, then tier 4 30 ticks later         | the second sale merging into the running burst                       |
| `*-lining-bill.webm` | 4 tiles of planet 4 ore with a lining bill | peeled coins flying to `Lining −X`, the counter ending on the wallet |

Recorded before #181 landed: the coin counts in the table are against whole Workshop levels.
With #181's steps a sale's next step is about a tenth of a level, so the same sales show about 13
more coins (the 3-coin sale shows about 10); the look and the timing are the same.

Sizes: `desktop` 1920 x 1080, `phone-landscape` 844 x 390, `tv` 3840 x 2160 (recorded at
1920 x 1080). Every sale here pays a lining bill, because scripted mining lays lining as the
drill does (#115).

Placeholders until #214: flat ore-tinted quads for the chunks, a flat brass disc for the coins,
a gold quad for the flare, and the shell's existing chime, clank and thud voices.

For review: the Exchange's stack stands 10 m up the building, at the top edge of the docked
view, so the coins' burst and the gold flare sit partly under the HUD's DOCKED badge.

While docked the bay screen covers the Exchange, as the TD lock on #176 accepted (no Sell bay
re-layout), so the chunks and the stack burst show mainly outside the bay; the coins cross the
bay on the layer above it.

Re-record by playing `steampunkDebug.features['sell-burst'].haulScript(legs)` through
`fastForward`, waiting for the bay to open and selling (`e2e/browser/sellBurstSales.ts`).
