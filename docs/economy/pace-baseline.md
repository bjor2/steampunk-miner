# Pace baseline, planets 1 to 5, the PK7 identity trace (ticket 826)

This file is written by the PK7 lane, which plays the bot scenario to planet 5 on the three pacing
seeds twice: once skipping every merchant (the bare bot) and once with merchants on (the Cache
Crate on P1, then each planet's local tool or consumable). Minutes run from arrival to the core,
after the vehicle-width cut (#662).

```
npx vitest run src/features/planet-kit/identityPace.lane.test.ts
```

The lane writes the measured version of this file to `balance-report/pace-baseline.md` and the
per-planet trace rows to `balance-report/planet-identity.ndjson`. The measured file replaces this
one. The generator is `src/features/planet-kit/paceBaselineDoc.ts`.

**Status (25 Oct): not yet measured.** Loop sessions don't run bot lanes on the shared box, so
the tables below fill on the Tester's first run of the lane. Until then, every cell reads
"pending".

## Skip all merchants (the bare bot)

| seed       | P1      | P2      | P3      | P4      | P5      |
| ---------- | ------- | ------- | ------- | ------- | ------- |
| 83921      | pending | pending | pending | pending | pending |
| 31415      | pending | pending | pending | pending | pending |
| 27182      | pending | pending | pending | pending | pending |
| **median** | pending | pending | pending | pending | pending |

## Merchants on (each planet its own kit)

| seed       | P1      | P2      | P3      | P4      | P5      |
| ---------- | ------- | ------- | ------- | ------- | ------- |
| 83921      | pending | pending | pending | pending | pending |
| 31415      | pending | pending | pending | pending | pending |
| 27182      | pending | pending | pending | pending | pending |
| **median** | pending | pending | pending | pending | pending |

## Per planet (medians)

The decision column is each planet's local kit item. It comes from data (`planetKits.json`), and
the lane checks that every seed bought it.

| planet | drill + tip off | drill + tip on | fuel share off | money/min off | money/min on | #551 step | decision on    | off-curve on | merchant income on |
| ------ | --------------- | -------------- | -------------- | ------------- | ------------ | --------- | -------------- | ------------ | ------------------ |
| P1     | pending         | pending        | pending        | pending       | pending      | -         | `cache_crate`  | pending      | pending            |
| P2     | pending         | pending        | pending        | pending       | pending      | pending   | `scree_plough` | pending      | pending            |
| P3     | pending         | pending        | pending        | pending       | pending      | pending   | `damp_flask`   | pending      | pending            |
| P4     | pending         | pending        | pending        | pending       | pending      | pending   | `shard_tongs`  | pending      | pending            |
| P5     | pending         | pending        | pending        | pending       | pending      | pending   | `vent_vane`    | pending      | pending            |

## Bars (`identityPaceBars.ts`)

- **Skip all merchants:** 22–30 min a planet. On P2–P5, drill + tip buys 3.5–7 and felt speed at
  least 0.9x the planet before. Money per minute within 5% of the #551 step. Nothing bought at a
  merchant.
- **Merchants on:** minutes and felt speed within 5% of skip-all on each planet, and inside 22–30
  wherever skip-all holds it. On every seed, each planet makes its own local decision, and the five
  decisions all differ. The planet's premium ore is mined on the first trip after the jump in
  (P2–P5).
- **Off-curve spend:** at most 6% per item and 12% combined, as a share of all the money the run
  spent.
- **Damp Flask gas income:** logged per planet. The flask that #881 and #882 built clears firedamp
  and bottles nothing, so this reads 0 on every planet (bar: 5% of the planet's income).
- **Ore-premium backtrack:** a whole premium run one planet back, less the jump there and back,
  earns less than the frontier's run at every g from 2 to 10. This one is checked off the curve,
  not in a run (`systems/premiumBacktrack.ts`).

## Before PK7

The previous baseline (#146, generator 7, protocol 28, main `9945252`) measured median core times
of 40–56 min on P1–P5. That was before the 22–30 min planet rows. Its tables, and the ore census
per planet, are in this file's history before ticket 826 (commit `2553ba3e1`).
