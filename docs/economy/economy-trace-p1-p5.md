# P1-P5 economy trace (ticket 907), the baseline #908 re-measures against

The lane `src/logging/economyTrace.lane.test.ts` plays the bot scenario (`bot-slice`) to planet 5's
core on the three pacing seeds (83921, 31415, 27182), each once with kitPolicy off (the bare bot)
and once on (PK7's merchants-on hand: the Cache Crate, the flask on firedamp, each planet's own kit).
Every step folds into the per-planet economy trace (`src/logging/economyTrace.ts`):

- money on arrival, income per minute (every sale over the minutes from arrival to the last step);
- the next useful upgrade on arrival (the cheapest next step of a track short of the planet's
  on-curve level, else of any track), its price and how long the wallet took to cover it, and the
  longest such wait on the planet;
- the upgrades bought, by track or purchase;
- deaths by cause: `hazard.<kind>`, `collapse`, `fuel` (`fuel.<kind>` when a hazard pocket drained
  the rig), `hull.<cause>` (`enemy`, `heat`, `lava`, `blast`, `electrified`);
- each trip's sale by the deepest band it mined; core trips, whose hold carries fragments to the
  bay, in a row of their own. P1 and P2 draw the `legacy` ore table, P3 on the `mixed` one (#738).

```
npx vitest run src/logging/economyTrace.lane.test.ts
```

The lane writes the measured version of this file to `balance-report/economy-trace.md` and one
NDJSON row per seed, hand and planet to `balance-report/economy-trace.ndjson`. The measured file
replaces this one. The generator is `src/logging/economyTraceReport.ts`. Nothing is gated, and no
game constant or data changed: the trace is derived from the bot's step stream, never written into
the run log, so goldens and `balance:planets` stay byte-identical.

**Status (26 Oct):** one of the six runs is measured. Loop sessions don't run bot lanes on the
shared box, so ticket 907's session ran a single probe: seed 83921, kitPolicy off, on branch
`ticket/907` (main `772146bcb` plus the trace, which changes no play). The other five runs are
pending until the Tester's first lane run.

## Medians of the seeds (83921 kitPolicy off only, so far)

| kit | planet | seeds | minutes | money on arrival | income/min | upgrades | next upgrade on arrival | covered | longest wait | deaths | deaths by cause (all seeds) |
| --- | ------ | ----- | ------- | ---------------- | ---------- | -------- | ----------------------- | ------- | ------------ | ------ | --------------------------- |
| off | P1     | 1     | 69.2    | $0               | $95        | 132      | $1 in 1.6 min           | 1/1     | 1.6 min      | 7      | hull.enemy 7                |
| off | P2     | 1     | 20.3    | $352             | $1149      | 120      | $8 in 0.0 min           | 1/1     | 8.8 min      | 1      | hull.enemy 1                |
| off | P3     | 1     | 18.0    | $400             | $1340      | 116      | $26 in 0.0 min          | 1/1     | 0.0 min      | 0      | none                        |
| off | P4     | 1     | 15.0    | $3907            | $15866     | 122      | $94 in 0.0 min          | 1/1     | 6.3 min      | 0      | none                        |
| off | P5     | 1     | 22.1    | $14915           | $0         | 0        | $350 in 0.0 min         | 1/1     | 0.0 min      | 1      | hull.enemy 1                |

The kitPolicy on rows and seeds 31415 and 27182 are pending.

## kitPolicy off against on

Pending: no kitPolicy on run is measured yet.

## Sale per trip by deepest band, kitPolicy off (83921 only, so far)

The middle trip's sale, then (trips, rescued). Core trips carry fragments, not ore.

| band | P1          | P2            | P3            | P4             | P5        |
| ---- | ----------- | ------------- | ------------- | -------------- | --------- |
| 1    | $110 (7, 0) | -             | -             | -              | -         |
| 2    | $390 (4, 1) | -             | -             | -              | -         |
| 3    | $683 (4, 1) | $5227 (1, 0)  | -             | -              | -         |
| 4    | $0 (3, 3)   | $0 (1, 1)     | -             | -              | -         |
| 5    | $0 (3, 2)   | $17485 (1, 0) | $24162 (1, 0) | $238637 (1, 0) | -         |
| core | $253 (2, 0) | $0 (2, 0)     | $0 (2, 0)     | $0 (1, 0)      | $0 (1, 1) |

## Every seed

| seed  | kit     | planet | minutes | money on arrival | income/min | upgrades bought                                                                                                                                         | next upgrade on arrival  | deaths by cause |
| ----- | ------- | ------ | ------- | ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------- |
| 83921 | off     | P1     | 69.2    | $0               | $95        | boiler 23, cargo_hold 21, casing 4, drill_power 9, drill_tip 50, engine 5, hull 20                                                                      | drill_power $1 (1.6 min) | hull.enemy 7    |
| 83921 | off     | P2     | 20.3    | $352             | $1149      | cargo_hold 4, drill_power 5, drill_tip 50, engine 1, hull 60                                                                                            | hull $8 (0.0 min)        | hull.enemy 1    |
| 83921 | off     | P3     | 18.0    | $400             | $1340      | cargo_hold 18, drill_power 2, drill_tip 30, engine 6, hull 60                                                                                           | hull $26 (0.0 min)       | none            |
| 83921 | off     | P4     | 15.0    | $3907            | $15866     | cargo_hold 13, drill_power 6, drill_tip 30, engine 9, gun 1, hull 60, item.power.echo_sounder 1, item.power.grapple_winch 1, item.weapon.gimbal_sight 1 | hull $94 (0.0 min)       | none            |
| 83921 | off     | P5     | 22.1    | $14915           | $0         | none                                                                                                                                                    | hull $350 (0.0 min)      | hull.enemy 1    |
| 83921 | on      | P1-P5  | pending |                  |            |                                                                                                                                                         |                          |                 |
| 31415 | off, on | P1-P5  | pending |                  |            |                                                                                                                                                         |                          |                 |
| 27182 | off, on | P1-P5  | pending |                  |            |                                                                                                                                                         |                          |                 |
