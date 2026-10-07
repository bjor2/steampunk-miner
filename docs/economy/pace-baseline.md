# Pace baseline, planets 1 to 10, with ore leads (#146)

The P3–P10 reference for later tickets. It replaces the ±3 min diagnostic of #195, which compared
against main before the ore catalogue landed (#140 acceptance 6, GD and TD locks on #146).

**Setup.** `bot-slice` played to planet 10 with a 16 h game-time budget on the three pacing seeds,
median of 3. Core minutes are counted from arrival on the planet. The slice is planet 2's core
completed, from the start of the run, as `balance:report` judges it. Measured on 2026-10-07 on top
of main `9945252` (two-tier levels, #181), at generator 7 and protocol 28 (29 once rebased above ticket 226's purchase chains), with the `ores` slice's
rarity lead at **half** of #140's weights (`plus1` 250–450 bp, `plus2` 0–150 bp in
`src/features/ores/ores.economy.json`). Lead cells only; signatures are #141's and #147 adds them.
"never" means the run stopped before that core: the 16 h budget ran out, or the bot found no trip
and ended the run.

## Baseline (half weights, as built)

| seed       | P1       | P2       | slice    | P3       | P4       | P5       | P6       | P7       | P8       | P9       | P10      |
| ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| 83921      | 53.8     | 37.7     | 91.5     | 38.2     | 46.7     | 44.7     | 108.1    | 37.1     | 40.1     | 44.2     | never    |
| 31415      | 58.1     | 47.6     | 105.7    | 41.3     | 39.9     | 43.4     | 40.6     | 56.5     | 52.8     | 51.6     | 89.7     |
| 27182      | 53.6     | 42.3     | 99.4     | 40.6     | 47.3     | 55.1     | 44.3     | 47.0     | 67.8     | 91.7     | 55.2     |
| **median** | **53.8** | **42.3** | **99.4** | **40.6** | **46.7** | **44.7** | **44.3** | **47.0** | **52.8** | **51.6** | **89.7** |

Against the #146 pins: P1 core 53.8 holds (≤ 58) and P8 52.8 holds (≥ 45), but the slice, 99.4, is
0.6 min under its 100–110 band. That is after #140's fallback halved both weight rows; #137's P8
row is the other lever, and P8 holds. The `balance:report` slice gates (90–130) pass.

**Ruling (7 Oct, Systems and GD on #146, option a).** 99.4 is accepted as a one-off 0.6 min slack
against the 14 min seed spread, and half weights stay. The combined re-baseline after #177 and #225
must reach 100–110 with no slack: a slice median under 100, or any seed under 90, goes back to the
lead weights first, then #137 T9 `fromPlanet 8` from 0.75 to 0.8. Never quarter weights.

## P3–P5 against `minorStatShare` (#225)

The re-measure the GD lock on #181 asked for, after #195 (brass at 1.225) and the #146 re-baseline.
Both are in `9945252`, so the baseline above is that measurement. `minorStatShare` stays at `0.5`
(`upgradeTiers` in `economy.json`); this records the pace and leaves it untuned.

| median minutes, arrival to core           | P3   | P4   | P5   |
| ----------------------------------------- | ---- | ---- | ---- |
| main `9945252`, two-tier, no leads        | 42.3 | 43.2 | 43.1 |
| as built, two-tier with half-weight leads | 40.6 | 46.7 | 44.7 |

On #181's two seeds, single-tier levels ran P3–P5 at 46.1–57.9 min (83921) and 43.5–49.2 min
(31415), and two-tier levels came in 2–10 min faster. That made `minorStatShare` 0.4 the
candidate lever. The medians above sit at 40.6–46.7 min. The spree targets (median 6–12 steps per bought track, 25–45%
of above-median trips buying 10+ on one track) are judged by `npm run balance:report`, under
"Spree targets per track".

## Lead, gated lead and signature cells per planet

Counted off generation, over every chunk of each planet, by `oreCensusOf`
(`src/features/ores/systems/oreCensus.ts`) under the registrations `loadFeatures()` makes at half
weights. A count read off generation moves only with the mix wiring; the bot's path never moves it.
Gated lead cells are lead cells a registered gate check (rig or dynamite, #142) has a verdict on;
signature cells are cells whose catalogue ore is a signature (#141).

| planet | 83921 ore / +1 / +2   | 31415 ore / +1 / +2     | 27182 ore / +1 / +2   | gated lead cells | signature cells |
| ------ | --------------------- | ----------------------- | --------------------- | ---------------- | --------------- |
| P1     | 39,157 / 1,307 / 119  | 38,599 / 1,290 / 208    | 39,418 / 1,384 / 176  | 0 / 0 / 0        | 0 / 0 / 0       |
| P2     | 69,849 / 1,652 / 340  | 69,764 / 2,353 / 200    | 68,231 / 2,151 / 316  | 0 / 0 / 0        | 0 / 0 / 0       |
| P3     | 98,457 / 3,691 / 244  | 98,297 / 3,419 / 346    | 98,096 / 3,077 / 268  | 0 / 0 / 0        | 0 / 0 / 0       |
| P4     | 123,170 / 4,108 / 375 | 124,433 / 3,867 / 548   | 123,355 / 4,192 / 384 | 0 / 0 / 0        | 0 / 0 / 0       |
| P5     | 146,572 / 4,530 / 492 | 146,048 / 4,390 / 451   | 147,130 / 5,241 / 549 | 0 / 0 / 0        | 0 / 0 / 0       |
| P6     | 166,147 / 5,357 / 580 | 164,457 / 5,642 / 612   | 165,750 / 5,422 / 578 | 0 / 0 / 0        | 0 / 0 / 0       |
| P7     | 183,039 / 5,871 / 546 | 183,803 / 6,384 / 432   | 184,284 / 5,913 / 655 | 0 / 0 / 0        | 0 / 0 / 0       |
| P8     | 197,968 / 6,117 / 688 | 199,138 / 6,839 / 636   | 200,093 / 6,421 / 652 | 0 / 0 / 0        | 0 / 0 / 0       |
| P9     | 212,837 / 6,655 / 886 | 213,454 / 6,805 / 1,016 | 212,345 / 7,380 / 848 | 0 / 0 / 0        | 0 / 0 / 0       |
| P10    | 226,361 / 7,583 / 796 | 224,114 / 7,582 / 689   | 224,867 / 7,087 / 807 | 0 / 0 / 0        | 0 / 0 / 0       |

Both right-hand columns are zero by construction at this commit. No slice registers a gate check
yet (the mining-gates build of #142), and no family with a `gateClass` or signature generates yet
(the ore-distribution build of #141, #147). So the P7–P10 zero is not a weight shortfall, and
raising the lead weights cannot move it. The lead cells it would gate are there: P7–P10 hold
5,871–7,583 `+1` and 432–1,016 `+2` cells per seed. Re-run the census once those slices register.
The signature column must then hold #141's share, the same at half and at full lead weights.

## Main before #146

`9945252`, no leads, the same probe. With the catalogue, the codex aliases and the report rows
registered but the lead hook left out, every seed's P1 and P2 times are byte for byte these, so
the slice moves only through the lead cells.

| seed       | P1       | P2       | slice     | P3       | P4       | P5       | P6       | P7       | P8       | P9       | P10      |
| ---------- | -------- | -------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| 83921      | 57.2     | 44.4     | 109.8     | 43.1     | 40.6     | 47.6     | 89.1     | 32.3     | 48.1     | 47.6     | never    |
| 31415      | 56.5     | 44.7     | 105.2     | 42.3     | 43.2     | 41.7     | 35.5     | 61.1     | 46.5     | 46.2     | 55.6     |
| 27182      | 50.9     | 46.3     | 97.3      | 40.1     | 45.6     | 43.1     | 44.5     | 42.2     | 58.2     | 95.4     | 68.0     |
| **median** | **56.5** | **44.7** | **105.2** | **42.3** | **43.2** | **43.1** | **44.5** | **42.2** | **48.1** | **47.6** | **68.0** |

## Before #181

On main `c71f057` (single-tier levels), #140's full weights (`plus1` 500–900 bp, `plus2` 0–300 bp)
ran the slice in 92.4 minutes on the median (94.0 / 89.7 / 92.4) against main's 101.6, and half
weights in 105.5 (108.7 / 100.2 / 105.5).

The ore rows per seed and planet (first sighting depth by tier, lead units per band, value per unit
against `V(t_b)`, band-5 drill ticks by lead) are printed by `npm run balance:report` under "Slice
report rows".
