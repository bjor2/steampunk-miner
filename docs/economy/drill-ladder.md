# Drill-speed ladder (ticket 409)

How long the same column takes to drill at five `drill_power` majors, so the drill curve can be
tuned against felt time and not only against the formula. Measured by
`src/logging/drillLadder.test.ts`, which prints this table and writes it to
`balance-report/drill-ladder.ndjson` on every run.

**What is cut:** 50 ground cells straight down from the planet 1 surface, seed 83921 (the scripted
sessions' and the #416 drill-down run's seed), column 20. With this seed the planet's radius is 300
tiles, so the first 24 cells are band 1 (hardness 1) and the other 26 are band 2 (hardness 1.2544).
The rig keeps `drill_tip` 0 (tip 1), so band 2 cuts at efficiency (1 / 1.2544)^2. Its tank is full
and its hold never fills, and enemies are frozen.

**How:** the authority's swept cut (`systems/authority/drillLadder.ts`), with the #396 drill law
(`ticksPerTile = max(m, ceil(60 H / (D eff)))`, D = 1.5 x 1.12^L, m the 4-tick stopgap floor) and
#399's exact carry. No cell rounds up to a whole tick. The pose waits past the column's foot, so the
cut alone sets the time. The vehicle's travel is left out until #397's cut-follow lands. Then this
ladder includes it and this table is rewritten.

**Levels** are majors: the level #396's 1.12x a level counts, and what the price table lists. A
stored level (`debug.setUpgrade`) is a step of ten pips, so major `L` is step `10 L`.

## Table (main at ticket 409)

| drill level | ticks | seconds | cells/s | x previous | law x previous |
| ----------: | ----: | ------: | ------: | ---------: | -------------: |
|           1 |  2668 |  44.467 |   1.124 |            |                |
|           5 |  1696 |  28.267 |   1.769 |      1.573 |          1.574 |
|          10 |   963 |  16.050 |   3.115 |      1.761 |          1.762 |
|          15 |   547 |   9.117 |   5.484 |      1.761 |          1.762 |
|          20 |   311 |   5.183 |   9.646 |      1.759 |          1.762 |

- **cells/s** is the column's average, 50 cells over its time. Band 2 is slower than band 1, so
  these figures are under the band-1 speeds in `drillRule.test.ts` (1.68 cells/s at L1 and 14.5 at
  L20 on hardness 1).
- **x previous** is how many times faster this level cut the column than the row above.
  **law x previous** is the drill law's own gain, `drillPower(L) / drillPower(previous)`, so 1.12
  compounded over the levels climbed.

## What the test holds

- Every level cuts all 50 cells.
- Each step up the ladder is strictly faster.
- Each step keeps at least the law's gain less 5%: the GD's 1.12x +-5% a level (#396), applied to the
  compounded gain. There is no upper bound, because drill speed has no cap (Bjor, 8 Oct).

## Reading it when tuning

- A step that falls short of its law gain means something other than drill power is setting the
  time. In the past that was the tile floor (#396 lowered it from 24 to 4 ticks). Today the 4-tick
  floor (15 cells/s) binds on band 1 from L21 (1.5 x 1.12^21 = 16.2 cells/s), so a rung above 20
  would show it here until #397 removes the floor.
- To compare a curve change, run `npx vitest run src/logging/drillLadder.test.ts` before and after
  and compare the two `balance-report/drill-ladder.ndjson` files line by line.
