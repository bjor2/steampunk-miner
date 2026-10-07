# Workshop showcase review clips (#177)

The Game Director's clip set for the Workshop redo (spec #180 acceptance, ticket #177), for
sign-off against the quality bar before the slice merges. Each clip opens on the open Upgrade
bay just before the purchase and runs until about 100 ticks after the last step. Recorded
headless on the preview build with software WebGL, so the frame rate is low and uneven. The
chain itself runs on authority ticks, so in a real browser its timing is the curve in
`src/features/workshop/holdCurve.json`: a click, an 18-tick wind-up, then gaps from 30 ticks down
to 6 (10 buys a second).

| Clip                  | Purchase                                           | What to look for                                                                                                   |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `*-single-buy.webm`   | one click on Engine's Buy                          | the wheels and pistons lurch at once, one rivet pip fills, the plaque reads `×1` and the ka-chunk ends it          |
| `*-chain-10.webm`     | a 10-step drill power hold from step 0 (`holdBuy`) | the steps speeding up, the pips filling, the ninth pip glowing, then the big level-up that ends the chain          |
| `*-big-level-up.webm` | one click on Hull's Buy, one step before its major | the full moment on the plating (wider and longer swing), the pip row resetting and the level reading `1`           |
| `*-spree-30.webm`     | a 30-step drill power hold across two majors       | the 36-tick breath at each major, the climb back to the 6-tick cap, the `×N · total` counter running on the plaque |

Sizes: `desktop` 1920 x 1080 (recorded at 1280 x 720), `phone-landscape` 844 x 390 (touch,
3x), `tv` 3840 x 2160 (recorded at 1920 x 1080). `tv-big-level-up` and `tv-spree-30` are not
recorded yet: Chromium ran out of memory on the shared box before them, and clip capture now
belongs to the box Tester.

Clips are silent: the purchase sound (the climbing ratchet, the whistle and clang, the cadence)
plays through the browser's audio engine, which a headless recording does not capture. Its voice
cap, at most 4 ratchet voices and 1 flourish in a 50-purchase spree, is checked by
`src/features/workshop/store/workshopStore.test.ts`.

The clips were recorded before each plaque became its track's item card (#164): the open card
on the focused plaque, and on touch the first tap that opens it, are not in them.

Not in these clips, by the locks on #177: no milestone moment, because the milestone list ships
empty here and arrives with #228; the turntable's turn is the flat art's narrowing, since the
Works' turntable is one baked quad (K-b, ticket 227); the camera keeps the Works' staging framing,
with no punch-in; and the coins pulled from the money counter into the part are not built.
The tones and the part swings are starting values for Gameplay & Vehicle to tune.
