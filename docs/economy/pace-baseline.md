# Pace baseline, planets 1 to 10, with ore leads (#146)

The P3–P10 reference for later tickets. It replaces the ±3 min diagnostic of #195, which compared
against main before the ore catalogue landed (#140 acceptance 6, GD and TD locks on #146).

**Setup.** `bot-slice` played to planet 10 with a 16 h game-time budget on the three pacing seeds,
median of 3. Core minutes are counted from arrival on the planet. The slice is planet 2's core
completed, from the start of the run. Measured on 2026-10-07 at generator 7 and protocol 27, with
the `ores` slice's rarity lead at **half** of #140's weights (`plus1` 250–450 bp, `plus2` 0–150 bp
in `src/features/ores/ores.economy.json`). Lead cells only; signatures are #141's and #147 adds
them. "never" means the run stopped before that core: the 16 h budget ran out, or the bot found no
trip and ended the run.

## Baseline (half weights, as shipped)

| seed       | P1       | P2       | slice     | P3       | P4       | P5       | P6        | P7       | P8       | P9       | P10       |
| ---------- | -------- | -------- | --------- | -------- | -------- | -------- | --------- | -------- | -------- | -------- | --------- |
| 83921      | 57.7     | 51.0     | 108.7     | 45.3     | 46.0     | 50.8     | 137.2     | 44.4     | 52.7     | 45.4     | never     |
| 31415      | 52.0     | 48.1     | 100.2     | 47.0     | 40.7     | 47.3     | never     | never    | never    | never    | never     |
| 27182      | 52.0     | 53.6     | 105.5     | 47.3     | 55.6     | 41.5     | 41.6      | 48.8     | 56.5     | 46.6     | 62.3      |
| **median** | **52.0** | **51.0** | **105.5** | **47.0** | **46.0** | **47.3** | **137.2** | **48.8** | **56.5** | **46.6** | **never** |

The pins hold: P1 core 52.0 (≤ 58), slice 105.5 (100–110), P8 56.5 (≥ 45; 52.7 and 56.5 on the
two seeds that reached it). Seed 31415 died over and over to tier-32 crawlers at depth 101 on
planet 6, with an empty wallet, until the budget ran out. That is the bot's known death loop, not
an ore rule, so the median of P6 and later treats it as the slowest seed.

## For comparison

Main before #146 (`c71f057`, no leads), the same probe:

| seed       | P1       | P2       | slice     | P3       | P4       | P5       | P6       | P7       | P8       | P9       | P10      |
| ---------- | -------- | -------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| 83921      | 58.6     | 42.9     | 101.5     | 46.1     | 48.4     | 57.9     | 144.5    | 48.5     | 52.1     | 52.5     | never    |
| 31415      | 52.4     | 49.2     | 101.6     | 49.2     | 47.6     | 43.5     | 47.3     | 51.1     | 52.3     | 38.7     | 35.7     |
| 27182      | 53.8     | 53.1     | 106.9     | 43.1     | 47.5     | 44.5     | 42.4     | 47.3     | 76.2     | 41.6     | 49.8     |
| **median** | **53.8** | **49.2** | **101.6** | **46.1** | **47.6** | **44.5** | **47.3** | **48.5** | **52.3** | **41.6** | **49.8** |

#140's full weights (`plus1` 500–900 bp, `plus2` 0–300 bp) ran the slice in 92.4 minutes on the
median (94.0 / 89.7 / 92.4), under the 100-minute pin. Following #140's fallback, both weight rows
were halved, and #137's P8 row was left alone because P8 holds.

| seed       | P1       | P2       | slice    | P3       | P4       | P5       | P6       | P7       | P8       | P9       | P10      |
| ---------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| 83921      | 55.7     | 36.7     | 92.4     | 44.8     | 44.9     | 60.8     | 111.7    | 49.2     | 55.6     | 50.7     | never    |
| 31415      | 50.0     | 39.7     | 89.7     | 42.9     | 44.0     | 45.2     | 42.7     | 52.0     | 51.9     | 49.6     | 63.5     |
| 27182      | 52.2     | 41.8     | 94.0     | 36.5     | 51.7     | 43.7     | 45.1     | 50.1     | 53.7     | 69.3     | 60.3     |
| **median** | **52.2** | **39.7** | **92.4** | **42.9** | **44.9** | **45.2** | **45.1** | **50.1** | **53.7** | **50.7** | **63.5** |

The ore rows per seed and planet (first sighting depth by tier, lead units per band, value per unit
against `V(t_b)`, band-5 drill ticks by lead) are printed by `npm run balance:report` under "Slice
report rows".
