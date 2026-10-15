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

## Stored-step ladder for the status page (ticket 434)

`src/logging/drillLadderSteps.test.ts` cuts the same column's first 20 cells (all band 1) at stored
drill_power steps 1, 5, 10, 15 and 20, the levels the browser drill-down run holds Down at, with the
law counted per step (`drillPowerAtStep`). It asserts nothing beyond the whole column and no slower
step; its rows go to `drill-ladder.ndjson` on `test-metrics` and the status page's Drill speed panel
sets them beside the browser descent ([loop-status.md](../loop-status.md#drill-speed-panel-ticket-434)).
At its first run (base 404db5da):

| stored step | ticks | seconds | cells/s | x previous | law x previous |
| ----------: | ----: | ------: | ------: | ---------: | -------------: |
|           1 |   795 |  13.250 |   1.509 |            |                |
|           5 |   776 |  12.933 |   1.546 |      1.024 |          1.026 |
|          10 |   715 |  11.917 |   1.678 |      1.085 |          1.085 |
|          15 |   693 |  11.550 |   1.732 |      1.032 |          1.032 |
|          20 |   638 |  10.633 |   1.881 |      1.086 |          1.085 |

## Starting rigs: cut-follow speed per stored step (ticket 431)

The cut-follow's read of `cutSpeed` (`cutFollowAt`, `systems/authority/cutFollowRead.ts`) at stored
drill_power steps 0 to 30. The rig rests on the planet 1 band-1 surface (hardness 1) with the tip at
step 0 (tip 1), so `eff` is 1 and the drill law's speed is `D = 1.5 x 1.12^x` cells/s. Here `x` is
the step's effective level from the #180 pip rule (`stepStats.ts`): `x = L + k/18`, so the nine pips
of a major share half its gain (1.12^(1/18) = 1.0063 each) and the major step adds the other half
(1.12^(1/2) = 1.0583). `src/systems/authority/startingRigCutSpeed.test.ts` holds the two lines under
the table.

| stored | major + pip |      x | law m/s (D) | sub-steps n | read mm/tick | read m/s | read x prev | law x prev | read / law |
| -----: | ----------: | -----: | ----------: | ----------: | -----------: | -------: | ----------: | ---------: | ---------: |
|      0 |       0 + 0 | 0.0000 |      1.5000 |        2400 |           25 |     1.50 |             |            |     1.0000 |
|      1 |       0 + 1 | 0.0556 |      1.5095 |        2385 |           25 |     1.50 |      1.0000 |     1.0063 |     0.9937 |
|      2 |       0 + 2 | 0.1111 |      1.5190 |        2370 |           25 |     1.50 |      1.0000 |     1.0063 |     0.9875 |
|      3 |       0 + 3 | 0.1667 |      1.5286 |        2356 |           25 |     1.50 |      1.0000 |     1.0063 |     0.9813 |
|      4 |       0 + 4 | 0.2222 |      1.5383 |        2341 |           25 |     1.50 |      1.0000 |     1.0063 |     0.9751 |
|      5 |       0 + 5 | 0.2778 |      1.5480 |        2326 |           25 |     1.50 |      1.0000 |     1.0063 |     0.9690 |
|      6 |       0 + 6 | 0.3333 |      1.5577 |        2312 |           25 |     1.50 |      1.0000 |     1.0063 |     0.9629 |
|      7 |       0 + 7 | 0.3889 |      1.5676 |        2297 |           26 |     1.56 |      1.0400 |     1.0063 |     0.9952 |
|      8 |       0 + 8 | 0.4444 |      1.5775 |        2283 |           26 |     1.56 |      1.0000 |     1.0063 |     0.9889 |
|      9 |       0 + 9 | 0.5000 |      1.5875 |        2268 |           26 |     1.56 |      1.0000 |     1.0063 |     0.9827 |
|     10 |       1 + 0 | 1.0000 |      1.6800 |        2143 |           27 |     1.62 |      1.0385 |     1.0583 |     0.9643 |
|     11 |       1 + 1 | 1.0556 |      1.6906 |        2130 |           28 |     1.68 |      1.0370 |     1.0063 |     0.9937 |
|     12 |       1 + 2 | 1.1111 |      1.7013 |        2117 |           28 |     1.68 |      1.0000 |     1.0063 |     0.9875 |
|     13 |       1 + 3 | 1.1667 |      1.7120 |        2103 |           28 |     1.68 |      1.0000 |     1.0063 |     0.9813 |
|     14 |       1 + 4 | 1.2222 |      1.7228 |        2090 |           28 |     1.68 |      1.0000 |     1.0063 |     0.9751 |
|     15 |       1 + 5 | 1.2778 |      1.7337 |        2077 |           28 |     1.68 |      1.0000 |     1.0063 |     0.9690 |
|     16 |       1 + 6 | 1.3333 |      1.7447 |        2064 |           29 |     1.74 |      1.0357 |     1.0063 |     0.9973 |
|     17 |       1 + 7 | 1.3889 |      1.7557 |        2051 |           29 |     1.74 |      1.0000 |     1.0063 |     0.9911 |
|     18 |       1 + 8 | 1.4444 |      1.7668 |        2038 |           29 |     1.74 |      1.0000 |     1.0063 |     0.9848 |
|     19 |       1 + 9 | 1.5000 |      1.7779 |        2025 |           29 |     1.74 |      1.0000 |     1.0063 |     0.9787 |
|     20 |       2 + 0 | 2.0000 |      1.8816 |        1914 |           31 |     1.86 |      1.0690 |     1.0583 |     0.9885 |
|     21 |       2 + 1 | 2.0556 |      1.8935 |        1902 |           31 |     1.86 |      1.0000 |     1.0063 |     0.9823 |
|     22 |       2 + 2 | 2.1111 |      1.9054 |        1890 |           31 |     1.86 |      1.0000 |     1.0063 |     0.9762 |
|     23 |       2 + 3 | 2.1667 |      1.9175 |        1878 |           31 |     1.86 |      1.0000 |     1.0063 |     0.9700 |
|     24 |       2 + 4 | 2.2222 |      1.9296 |        1866 |           32 |     1.92 |      1.0323 |     1.0063 |     0.9950 |
|     25 |       2 + 5 | 2.2778 |      1.9418 |        1854 |           32 |     1.92 |      1.0000 |     1.0063 |     0.9888 |
|     26 |       2 + 6 | 2.3333 |      1.9540 |        1843 |           32 |     1.92 |      1.0000 |     1.0063 |     0.9826 |
|     27 |       2 + 7 | 2.3889 |      1.9664 |        1831 |           32 |     1.92 |      1.0000 |     1.0063 |     0.9764 |
|     28 |       2 + 8 | 2.4444 |      1.9788 |        1820 |           32 |     1.92 |      1.0000 |     1.0063 |     0.9703 |
|     29 |       2 + 9 | 2.5000 |      1.9913 |        1808 |           33 |     1.98 |      1.0313 |     1.0063 |     0.9943 |
|     30 |       3 + 0 | 3.0000 |      2.1074 |        1709 |           35 |     2.10 |      1.0606 |     1.0583 |     0.9965 |

- **law** is `D eff / H` exactly. **sub-steps n** is the cell's drill time in 1/60 ticks,
  `ceil(3600 H / (D eff))` (`subStepsPerTile`). **read** is `floor(60000 / n)` mm a tick
  (`cutStepMmOf`), times 60 / 1000 for m/s. 1 mm a tick is 0.06 m/s.
- **Why it looks flat.** The drill law and the step mapping give exactly 1.12 per ten stored steps
  (the first line the test holds). The read then rounds twice: `n` up to a whole sub-step, then the
  step down to a whole mm a tick. At 1.5 m/s one mm a tick is 4.0% of the speed, six times a pip's
  0.63%, so the read stays put for 3 to 6 pips at a time and loses up to 3.7% against the law (the
  second line: never over the law, at most 1 mm under). Stored 10 is the worst case: the law is
  exactly 28.000 mm a tick, `n` rounds up to 2143 and the read floors to 27, so 1.62 m/s for a law of
  1.68. That is why stored 1 to 10 reads 1.08x (law 1.113x over 17/18 of a major) and stored 10 to 20
  reads 1.148x (law 1.12x).
- **Where it stops.** A pip moves the read by a whole mm once the step is 158 mm a tick (9.5 m/s),
  about stored 163 on band 1. At the on-curve end of planet 1 (major 13, 6.5 m/s) a pip is 0.69 mm,
  so about one pip in three still reads flat there.
- **What else uses the same step.** The authority's cutting step bound (`stepBound.ts`,
  `cutStepMmOf` plus one 250 mm sample of tolerance), travel parity (`travelParity.ts`) and the P200
  dive fixture. The authority's cut itself counts sub-steps and never rounds to mm, so it runs at the
  law; only the body's commanded follow speed and those bounds see the floor.
