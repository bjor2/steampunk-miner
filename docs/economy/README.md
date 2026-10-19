# Economy tables (planning aid)

Source of truth: [the scaling and curves decision](https://github.com/bjor2/steampunk-miner/issues/6)
and [the core harvest and travel decision](https://github.com/bjor2/steampunk-miner/issues/10).
These files are generated views of those formulas for planets 1 to 40. They are a first draft that
proves the shape of the curves; the greedy-bot simulation in `tools/sim.py` is a planning aid, not
final balance. Nothing here is game code.

- `economy-constants.json`: the constants from the decision, as decimal strings and integers.
- `planet-table.md`, `vehicle-table.md`, `price-table.md`, `enemy-table.md`: one row per planet.
- `tools/gen.py` regenerates the tables from the constants. `tools/sim.py` is the pacing simulation.
- `pace-baseline.md`: the pacing bot's core minutes on planets 1 to 10 with ore leads (#146), the
  P3–P10 reference for later tickets.
- `drill-ladder.md`: the drill-speed ladder (#409), the time a 50-cell planet 1 column takes at
  drill_power 1, 5, 10, 15 and 20, measured by the authority's cut, to tune the drill curve against. It also
  holds the starting rigs' cut-follow speed per stored step 0 to 30 and why it reads flat (#431).

The game reads its constants from `src/systems/economy/economy.json`; the pure formulas in
`src/systems/economy/` render these four tables again, and `economyTables.test.ts` compares them cell
by cell. Change a number in `economy.json` and regenerate these tables together.

## Two-tier levels (spec #180 sections 3 and 4, built in #181)

The tables list **major levels** `L`, today's curves. A vehicle stores each track (and the guns) as a
**step** `m = 10L + k`, read from `upgradeTiers` in `economy.json` (`minorsPerMajor` 10,
`minorStatShare` 0.5):

- **Price** (`stepPrice`, `upgradeSteps.ts`): the ten steps of major `L` split its level price `X_L`
  by rounded running totals `ceil(X_L * F(k))`, `F(k) = (rho^k - 1) / (rho^10 - 1)`,
  `rho = ratio^(1/10)` (`nthRoot` in `money.ts`, no `Math.pow`). The tenth step is the remainder, so
  the ten always sum to exactly the level price in the price table.
- **Stat** (`stepStats.ts`): each curve at `x = L + k/18`. At `k = 0` every stat is the vehicle
  table's value.
- **Drill power is the exception since ticket 552** (the GD ruling on #551): it grows and is priced
  per purchase, its level is the stored step, with no pip rule and no major split:
  `D(n) = 1.5 x 1.12^(1/18) x 1.243^(n - 1)` and `price(n) = ceil(20 x 1.48^(n - 1)) x paceScale`,
  1 at n = 0 (economy.json families `perPurchase`). Its table columns count purchases, on curve
  12 at planet 1 and 3 a planet ([drill-ladder.md](drill-ladder.md)).
- **The hold, the boiler and the engine since ticket 553** (Systems' rows on #553, comment
  6258422139, and the Producer's addendum): per purchase too, with no max level. Hold
  `round(10 x 1.10^c)` and boiler `round(150 x 1.10^b)`, each for `ceil(2.4 x 1.20^n) x paceScale`
  (families `wholePerPurchase` and `geometricPerPurchase`); engine `6 x 1.05^e` m/s with accel
  `1.05^e` and thrust to weight `1 + 1.05^e`, for `ceil(3.6 x 1.60^e) x paceScale`
  (`enginePerPurchase`). Their stats are plain numbers, safe to about 275 purchases, so each
  on-curve row (`onCurve.atMost`) stops where a purchase stops paying, following Systems' bot lane:
  the hold 22 + 2 a planet, stopping at 34 (255 units, past the largest band's ore) from P7; the
  boiler 4 + 1 a planet, stopping at Systems' 16-purchase tank (689 units) from P13, which keeps
  the old on-curve tank (P7 389 units against 390); the engine 2 + 3 a planet, stopping at 131,
  the last purchase under the 3600 m/s sub-step floor. `paceScale` rows: 1.2 from P2, 1.3 from P4,
  1.6 from P6, 1.7 from P8.
- The design tables of the tip and hull do not change, because they read majors. `npm run balance:report` prints the
  pacing bot's spree targets per track (GD lock on #181): the median steps per bought track a
  visit, 6 to 12, and the share of above-median trips that buy 10 or more steps on one track, 25 to
  45%. Steps a whole visit and the steps the wallet could chain print as information.
