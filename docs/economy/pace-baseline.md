# Pace baseline, planets 1 to 10, with ore leads (#146)

The P3–P10 reference for later tickets. It replaces the ±3 min diagnostic of #195, which compared
against main before the ore catalogue landed (#140 acceptance 6, GD and TD locks on #146).

**Setup.** `bot-slice` played to planet 10 with a 16 h game-time budget on the three pacing seeds,
median of 3. Core minutes are counted from arrival on the planet. The slice is planet 2's core
completed, from the start of the run, as `balance:report` judges it. Measured on 2026-10-07 on top
of main `9945252` (two-tier levels, #181), at generator 7 and protocol 28, with the `ores` slice's
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
