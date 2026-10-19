# Drill-speed ladder (ticket 409)

How long the same column takes to drill at five `drill_power` levels, so the drill curve can be
tuned against felt time and not only against the formula. Measured by
`src/logging/drillLadder.test.ts`, which prints this table and writes it to
`balance-report/drill-ladder.ndjson` on every run.

## The law since ticket 552 (drill speed x1.243 a purchase)

Bjor's order of 18 Oct (level 20 about 50x today's) as the GD ruled it on #551: a drill level is
**one purchase**, the stored step, with no pip rule and no major split.

- **Stat:** `D(0) = 1.5`, `D(n) = 1.5 x 1.12^(1/18) x 1.243^(n - 1)` (economy.json
  `upgrades[drill_power].effect`, family `perPurchase`). Purchase 1 keeps today's 1.5095 (the old
  first pip); every purchase after it is +24.3%. D(10) = 10.69, D(20) = 94.1 cells/s on band-1
  rock (83.9 m/s down at the bench's 0.891), D(50) = 6.43e4, D(100) = 3.4e9; D(20) / D(1) = 62.4.
- **Price:** `price(0) = 1`, `price(n) = ceil(20 x 1.48^(n - 1)) x paceScale` (cost curve family
  `perPurchase`), so p/s = 1.19: 20, 30, 44, 96 at n = 1, 2, 3, 5, 682 at 10, 34.4k at 20.
- **The bar (#463, replacing 1.12 +-5% a level):** every purchase from 2 on gains 1.181 to 1.305
  (1.243 +-5%), strictly climbing, and D(20) / D(1) is in [60, 65].
- **Superseded for drill_power only:** #396's 1.12 +-5% a level, its front-loaded price rows,
  planet 1 bot lead and planet 1 drill bars (3x the start by band 3, 10 cells/s on leaving; now
  printed by `pacingGate.test.ts`, not gated), #304's drill constants and #307's on-curve labels. On curve drill power
  holds about 12 purchases at planet 1 and 3 a planet. Tip, hull and the other tracks keep their
  locks and their pips.
- **The sub-step floor, lifted (ticket 558):** at a fixed 60 sub-steps a tick a cell cost
  `ceil(3600 H^3 / (D P^2))` sub-steps and never fewer than one, so on soft ground the delivered
  step left the band at purchase 24 (1.176), was dead from 33 and stopped at 3600 cells/s from 37.
  The swept cut now counts in the rig's own drill quantum (`vehicle/drillQuantum.ts`): 60 doubled,
  at most 11 times, until a cell of the planet's band-1 rock costs the rig 100 sub-steps or more,
  so every cut is within 1% of the law and every purchase delivers 1.181 to 1.305 (checked through
  purchase 50 in `src/logging/subStepFloor.test.ts`). A rig that already pays 100 keeps 60 (on
  planet 1 purchases up to 15), so on-curve play cuts as before. A drill's cut and travel steps
  stop at the planet's radius a tick, the one bound left, and the swept span budget
  (`SWEPT_SPAN_CHUNKS_PER_TICK`, 80) covers that step on the largest planet. No economy cap.
- **Flag-off path:** with `drill.sweptCut` off the body is held to 18 m/s and the report capsule to
  950 mm a tick; that fallback is unsupported above 18 m/s, a documented deviation, not a pass.

The tables below were measured at ticket 552 with this law.

## Table (ticket 552)

**What is cut:** 50 ground cells straight down from the planet 1 surface, seed 83921 (the scripted
sessions' and the #416 drill-down run's seed), column 20. With this seed the planet's radius is 300
tiles, so the first 24 cells are band 1 (hardness 1) and the other 26 are band 2 (hardness 1.2544).
The rig keeps `drill_tip` 0 (tip 1), so band 2 cuts at efficiency (1 / 1.2544)^2. Its tank is full
and its hold never fills, and enemies are frozen. **How:** the authority's swept cut
(`systems/authority/drillLadder.ts`) with #399's exact carry; the pose waits past the column's
foot, so the cut alone sets the time.

| drill level | ticks | seconds | cells/s | x previous | law x previous |
| ----------: | ----: | ------: | ------: | ---------: | -------------: |
|           1 |  2969 |  49.483 |   1.010 |            |                |
|           5 |  1244 |  20.733 |   2.412 |      2.387 |          2.387 |
|          10 |   419 |   6.983 |   7.160 |      2.969 |          2.967 |
|          15 |   141 |   2.350 |  21.277 |      2.972 |          2.967 |
|          20 |    48 |   0.800 |  62.500 |      2.938 |          2.967 |

- **cells/s** is the column's average, 50 cells over its time. Band 2 is slower than band 1.
- **x previous** is how many times faster this level cut the column than the row above.
  **law x previous** is the drill law's own gain, `drillPower(n) / drillPower(previous)`: 1.243
  compounded over the purchases climbed (1.0063 for the first).

## What the test holds

- Every level cuts all 50 cells.
- Each step up the ladder is strictly faster.
- Each step gains 1.181 to 1.305 a purchase climbed, compounded (the #463 bar since #552). There is
  no upper cap on drill speed (Bjor, 8 Oct); the band's top only catches a law that runs ahead.

## Reading it when tuning

- A step outside its band means something other than drill power is setting the time: the
  sub-step quantum once a cell costs few sub-steps (see the floor above), or a floor in the law.
- To compare a curve change, run `npx vitest run src/logging/drillLadder.test.ts` before and after
  and compare the two `balance-report/drill-ladder.ndjson` files line by line.

## Stored-step ladder for the status page (ticket 434)

`src/logging/drillLadderSteps.test.ts` cuts the same column's first 20 cells (all band 1) at stored
drill_power steps 1, 5, 10, 15 and 20, the levels the browser drill-down run holds Down at, one
purchase each since #552. It holds the whole column, no slower step, stored 20 / stored 1 within
[55, 70] and the stored-20 cut within -2.7% and +0.5% of D(20): it prints the band-1 hardness (1)
and tip (1) it used and the expected cut. Since ticket 558 stored 20 counts in a quantum of 240,
153 sub-steps a cell (94.118 cells/s, 0.02% under the law of 94.14); the 20-cell column reads in
whole ticks, 13 of them, so the row still reads 92.308 cells/s (-1.9%). Its rows go to `drill-ladder.ndjson` on
`test-metrics` and the status page's Drill speed panel sets them beside the browser descent
([loop-status.md](../loop-status.md#drill-speed-panel-ticket-434)). At ticket 552:

| stored step | ticks | seconds | cells/s | x previous | law x previous |
| ----------: | ----: | ------: | ------: | ---------: | -------------: |
|           1 |   795 |  13.250 |   1.509 |            |                |
|           5 |   333 |   5.550 |   3.604 |      2.387 |          2.387 |
|          10 |   112 |   1.867 |  10.714 |      2.973 |          2.967 |
|          15 |    38 |   0.633 |  31.579 |      2.947 |          2.967 |
|          20 |    13 |   0.217 |  92.308 |      2.923 |          2.967 |

## Starting rigs: cut-follow speed per stored step (ticket 431)

The cut-follow's read of `cutSpeed` (`cutFollowAt`, `systems/authority/cutFollowRead.ts`) at stored
drill_power steps 0 to 30. The rig rests on the planet 1 band-1 surface (hardness 1) with the tip at
step 0 (tip 1), so `eff` is 1 and the drill law's speed is `D` cells/s, one purchase a step since
#552. `src/systems/authority/startingRigCutSpeed.test.ts` holds the lines under the table.

| stored | law m/s (D) | sub-steps n | read mm/tick | read m/s | read x prev | law x prev | read / law |
| -----: | ----------: | ----------: | -----------: | -------: | ----------: | ---------: | ---------: |
|      0 |      1.5000 |        2400 |           25 |     1.50 |             |            |     1.0000 |
|      1 |      1.5095 |        2385 |           25 |     1.50 |      1.0000 |     1.0063 |     0.9937 |
|      2 |      1.8763 |        1919 |           31 |     1.86 |      1.2400 |     1.2430 |     0.9913 |
|      3 |      2.3322 |        1544 |           38 |     2.28 |      1.2258 |     1.2430 |     0.9776 |
|      4 |      2.8989 |        1242 |           48 |     2.88 |      1.2632 |     1.2430 |     0.9935 |
|      5 |      3.6034 |        1000 |           60 |     3.60 |      1.2500 |     1.2430 |     0.9991 |
|      6 |      4.4790 |         804 |           74 |     4.44 |      1.2333 |     1.2430 |     0.9913 |
|      7 |      5.5674 |         647 |           92 |     5.52 |      1.2432 |     1.2430 |     0.9915 |
|      8 |      6.9203 |         521 |          115 |     6.90 |      1.2500 |     1.2430 |     0.9971 |
|      9 |      8.6019 |         419 |          143 |     8.58 |      1.2435 |     1.2430 |     0.9975 |
|     10 |     10.6922 |         337 |          178 |    10.68 |      1.2448 |     1.2430 |     0.9989 |
|     11 |     13.2904 |         271 |          221 |    13.26 |      1.2416 |     1.2430 |     0.9977 |
|     12 |     16.5199 |         218 |          275 |    16.50 |      1.2443 |     1.2430 |     0.9988 |
|     13 |     20.5343 |         176 |          340 |    20.40 |      1.2364 |     1.2430 |     0.9935 |
|     14 |     25.5241 |         142 |          422 |    25.32 |      1.2412 |     1.2430 |     0.9920 |
|     15 |     31.7264 |         114 |          526 |    31.56 |      1.2464 |     1.2430 |     0.9948 |
|     16 |     39.4360 |          92 |          652 |    39.12 |      1.2395 |     1.2430 |     0.9920 |
|     17 |     49.0189 |          74 |          810 |    48.60 |      1.2423 |     1.2430 |     0.9915 |
|     18 |     60.9305 |          60 |         1000 |    60.00 |      1.2346 |     1.2430 |     0.9847 |
|     19 |     75.7366 |          48 |         1250 |    75.00 |      1.2500 |     1.2430 |     0.9903 |
|     20 |     94.1406 |          39 |         1538 |    92.28 |      1.2304 |     1.2430 |     0.9802 |
|     21 |    117.0168 |          31 |         1935 |   116.10 |      1.2581 |     1.2430 |     0.9922 |
|     22 |    145.4519 |          25 |         2400 |   144.00 |      1.2403 |     1.2430 |     0.9900 |
|     23 |    180.7967 |          20 |         3000 |   180.00 |      1.2500 |     1.2430 |     0.9956 |
|     24 |    224.7303 |          17 |         3529 |   211.74 |      1.1763 |     1.2430 |     0.9422 |
|     25 |    279.3397 |          13 |         4615 |   276.90 |      1.3077 |     1.2430 |     0.9913 |
|     26 |    347.2193 |          11 |         5454 |   327.24 |      1.1818 |     1.2430 |     0.9425 |
|     27 |    431.5935 |           9 |         6666 |   399.96 |      1.2222 |     1.2430 |     0.9267 |
|     28 |    536.4708 |           7 |         8571 |   514.26 |      1.2858 |     1.2430 |     0.9586 |
|     29 |    666.8332 |           6 |        10000 |   600.00 |      1.1667 |     1.2430 |     0.8998 |
|     30 |    828.8736 |           5 |        12000 |   720.00 |      1.2000 |     1.2430 |     0.8686 |

- **law** is `D eff / H` exactly. **sub-steps n** is the cell's drill time in 1/60 ticks,
  `ceil(3600 H / (D eff))` (`subStepsPerTile`). **read** is `floor(60000 / n)` mm a tick
  (`cutStepMmOf`), times 60 / 1000 for m/s. 1 mm a tick is 0.06 m/s.
- **What the test holds.** The first purchase keeps its old pip (1.0063); every purchase from 1 to
  30 pays 1.181 to 1.305 in sub-steps (23 before ticket 558); the read is always the cell its whole sub-steps allow and
  never over the law; to stored 10 it is within one mm a tick under the law.
- **Where the quantum showed.** The table is ticket 552's, at the fixed 60 sub-steps a tick. While
  a cell cost hundreds of sub-steps the read stayed within 1% of the law; from about stored 20 (39
  sub-steps) the whole sub-step rounded it 2% under, and from stored 24 a purchase could deliver
  outside its band (1.176 at 24, 1.167 at 29). Ticket 558 counts a rig past stored 15 in its own
  doubled quantum (100 to 199 sub-steps a cell here), so from stored 16 the read is within 1% of
  the law and every purchase to 30 is in its band; the test now reads `floor(1000 Q / n)`.
- **What else uses the same step.** The authority's cutting step bound (`stepBound.ts`,
  `cutStepMmOf` plus one 250 mm sample of tolerance), travel parity (`travelParity.ts`) and the P200
  dive fixture, each in the rig's drill quantum since ticket 558. The authority's cut itself counts
  sub-steps and never rounds to mm, so it runs at the law; only the body's commanded follow speed
  and those bounds see the mm rounding, under 1% at any speed.
